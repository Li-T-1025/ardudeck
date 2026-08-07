import { describe, it, expect } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import type { GraphNodeData, GraphEdgeData } from './lua-graph-types';
import { compileGraph } from './lua-compiler';
import { getNodeDefinition } from './node-library';
import { GRAPH_TEMPLATES } from './graph-templates';

function node(
  id: string,
  definitionType: string,
  propertyValues: Record<string, number | boolean | string> = {},
): Node<GraphNodeData> {
  const def = getNodeDefinition(definitionType);
  return {
    id,
    type: definitionType,
    position: { x: 0, y: 0 },
    data: {
      definitionType,
      label: def?.label ?? definitionType,
      category: def?.category ?? 'flow',
      propertyValues,
    },
  };
}

function edge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): Edge<GraphEdgeData> {
  return { id, source, target, sourceHandle, targetHandle };
}

describe('new watchdog nodes', () => {
  it('sensor-param-get reads a named param with a numeric fallback', () => {
    const nodes = [node('p', 'sensor-param-get', { param_name: 'CAM1_TRIGG_DIST' })];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    expect(res.code).toContain('param:get("CAM1_TRIGG_DIST")');
    expect(res.code).toContain('or 0');
  });

  it('sensor-gpio-read reads the pin as an integer and guards a negative/nil pin', () => {
    const nodes = [node('g', 'sensor-gpio-read', { pin: 54 })];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    expect(res.code).toContain('gpio:read(math.floor(');
    // gpio:read returns a boolean on real firmware — must be normalized to 0/1
    expect(res.code).toContain('== true');
  });

  it('sensor-pwm-pulse sets up PWMSource once in the prelude and drains it per tick', () => {
    const nodes = [node('p', 'sensor-pwm-pulse', { pin: 54 })];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    // one-time setup at module scope, before update()
    const updateIdx = res.code.indexOf('function update()');
    expect(res.code.indexOf('PWMSource()')).toBeGreaterThan(-1);
    expect(res.code.indexOf('PWMSource()')).toBeLessThan(updateIdx);
    expect(res.code.indexOf(':set_pin(54)')).toBeLessThan(updateIdx);
    // per-tick read inside update()
    expect(res.code.indexOf(':get_pwm_us()')).toBeGreaterThan(updateIdx);
    // failed attach is reported, not silent
    expect(res.code).toContain('not usable');
  });

  it('sensor-gpio-read takes its pin from a wired input when connected', () => {
    const nodes = [
      node('pin', 'sensor-param-get', { param_name: 'CAM1_FEEDBAK_PIN' }),
      node('g', 'sensor-gpio-read', { pin: 54 }),
    ];
    const edges = [edge('e', 'pin', 'value', 'g', 'pin')];
    const res = compileGraph(nodes, edges, 'test');
    expect(res.success).toBe(true);
    expect(res.code).toContain('param:get("CAM1_FEEDBAK_PIN")');
    // the wired param value, not the literal 54, feeds gpio:read
    expect(res.code).not.toContain('gpio:read(math.floor(54))');
  });

  it('timing-watchdog accumulates time and expires after the timeout', () => {
    const nodes = [node('w', 'timing-watchdog', { timeout_ms: 3000 })];
    const res = compileGraph(nodes, [], 'test', 10);
    expect(res.success).toBe(true);
    expect(res.code).toContain('>= 3000');
    // resets on kick, accumulates the entry interval otherwise
    expect(res.code).toContain('+ 10');
  });

  it('sensor-current-waypoint exposes the current nav index', () => {
    const nodes = [node('wp', 'sensor-current-waypoint')];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    expect(res.code).toContain('mission:get_current_nav_index()');
  });

  it('action-gcs-text appends a wired numeric value to the message', () => {
    const nodes = [
      node('wp', 'sensor-current-waypoint'),
      node('t', 'action-gcs-text', { message: 'WP ', severity: 4 }),
    ];
    const edges = [edge('e', 'wp', 'index', 't', 'value')];
    const res = compileGraph(nodes, edges, 'test');
    expect(res.success).toBe(true);
    expect(res.code).toContain('.. tostring(');
  });

  it('action-gcs-text stays a plain string when no value is wired', () => {
    const nodes = [node('t', 'action-gcs-text', { message: 'hi', severity: 6 })];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    expect(res.code).not.toContain('.. tostring(');
  });
});

describe('Camera Trigger Watchdog template', () => {
  it('is registered and compiles to valid-looking Lua', () => {
    const tpl = GRAPH_TEMPLATES.find((t) => t.id === 'camera-trigger-watchdog');
    expect(tpl).toBeDefined();
    const g = tpl!.graph;
    const res = compileGraph(g.nodes as Node<GraphNodeData>[], g.edges as Edge<GraphEdgeData>[], g.name, g.runIntervalMs);
    expect(res.success).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.code).toContain('mission:get_current_nav_index()');
    expect(res.code).toContain('param:get("CAM1_TRIGG_DIST")');
  });

  it('detects photos via PWMSource interrupt, not gpio:read polling', () => {
    const tpl = GRAPH_TEMPLATES.find((t) => t.id === 'camera-trigger-watchdog');
    const g = tpl!.graph;
    // hotshoe pulses are 1-2 ms; gpio:read polling misses them
    expect(g.runIntervalMs).toBeGreaterThanOrEqual(50);
    const res = compileGraph(g.nodes as Node<GraphNodeData>[], g.edges as Edge<GraphEdgeData>[], g.name, g.runIntervalMs);
    expect(res.code).toContain('PWMSource()');
    expect(res.code).toContain(':get_pwm_us()');
    expect(res.code).not.toContain('gpio:read');
    // must not steal AP_Camera's feedback pin (comment text may mention it)
    expect(res.code).not.toContain('param:get("CAM1_FEEDBAK_PIN")');
  });
});

describe('custom lua + serial/network output nodes', () => {
  it('flow-custom-lua inlines the snippet as an IIFE with pins as args and returns', () => {
    const nodes = [
      node('c', 'flow-custom-lua', {
        inputs: 'dist, volt',
        outputs: 'msg',
        code: 'return string.format("D=%.1f V=%.2f", dist, volt)',
      }),
    ];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    expect(res.code).toContain('(function(dist, volt)');
    expect(res.code).toContain('return string.format("D=%.1f V=%.2f", dist, volt)');
    // unconnected inputs default to nil
    expect(res.code).toContain('end)(nil, nil)');
  });

  it('flow-custom-lua wires upstream values into the call and its output downstream', () => {
    const nodes = [
      node('b', 'sensor-baro-alt'),
      node('c', 'flow-custom-lua', { inputs: 'alt', outputs: 'doubled', code: 'return alt * 2' }),
      node('t', 'action-gcs-text', { severity: 6, message: 'alt2: ' }),
    ];
    const edges = [
      edge('e1', 'b', 'alt_m', 'c', 'alt'),
      edge('e2', 'c', 'doubled', 't', 'value'),
    ];
    const res = compileGraph(nodes, edges, 'test');
    expect(res.success).toBe(true);
    // baro output variable is passed as the IIFE argument
    const m = res.code.match(/local (\w+) = baro:get_altitude\(\)/);
    expect(m).toBeTruthy();
    expect(res.code).toContain(`end)(${m![1]})`);
    // custom output feeds the GCS text value
    expect(res.code).toMatch(/gcs:send_text\(6, "alt2: " \.\. tostring\(doubled_\d+\)\)/);
  });

  it('flow-custom-lua with no outputs still runs for side effects', () => {
    const nodes = [node('c', 'flow-custom-lua', { inputs: '', outputs: '', code: 'gcs:send_text(6, "hi")' })];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    expect(res.code).toContain('local _ = (function()');
    expect(res.code).toContain('gcs:send_text(6, "hi")');
  });

  it('flow-custom-lua sanitizes hostile pin names into identifiers', () => {
    const nodes = [
      node('c', 'flow-custom-lua', { inputs: '1bad, ok name, ok name', outputs: '', code: 'return 0' }),
    ];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    // leading digit prefixed, spaces underscored, duplicate dropped
    expect(res.code).toContain('(function(_1bad, ok_name)');
  });

  it('action-serial-write opens the port once in the prelude and writes bytes on trigger', () => {
    const nodes = [node('s', 'action-serial-write', { instance: 1, baud: 115200, line_ending: 'lf' })];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    const updateIdx = res.code.indexOf('function update()');
    expect(res.code.indexOf('serial:find_serial(1)')).toBeGreaterThan(-1);
    expect(res.code.indexOf('serial:find_serial(1)')).toBeLessThan(updateIdx);
    expect(res.code.indexOf(':begin(115200)')).toBeLessThan(updateIdx);
    // byte-loop write inside update, with the newline suffix applied
    expect(res.code.indexOf(':write(')).toBeGreaterThan(updateIdx);
    expect(res.code).toContain('.. "\\n"');
    // missing port is reported, not silent
    expect(res.code).toContain('not found');
  });

  it('action-socket-send lazily connects a UDP socket and sends the payload', () => {
    const nodes = [node('n', 'action-socket-send', { protocol: 'udp', ip: '10.0.0.5', port: 9000 })];
    const res = compileGraph(nodes, [], 'test');
    expect(res.success).toBe(true);
    expect(res.code).toContain('Socket(1)');
    expect(res.code).toContain(':connect("10.0.0.5", 9000)');
    expect(res.code).toMatch(/:send\(net_payload_\d+, #net_payload_\d+\)/);
    // socket handle survives across ticks (module-scope state var)
    const updateIdx = res.code.indexOf('function update()');
    expect(res.code.indexOf('_sock_n = nil')).toBeLessThan(updateIdx);
  });

  it('action-socket-send uses a TCP stream socket when configured', () => {
    const nodes = [node('n', 'action-socket-send', { protocol: 'tcp', ip: '10.0.0.5', port: 9000 })];
    const res = compileGraph(nodes, [], 'test');
    expect(res.code).toContain('Socket(0)');
  });
});

describe('Custom Serial Telemetry template', () => {
  it('is registered and compiles with the custom sentence wired to both outputs', () => {
    const tpl = GRAPH_TEMPLATES.find((t) => t.id === 'custom-serial-telemetry');
    expect(tpl).toBeDefined();
    const g = tpl!.graph;
    const res = compileGraph(g.nodes as Node<GraphNodeData>[], g.edges as Edge<GraphEdgeData>[], g.name, g.runIntervalMs);
    expect(res.success).toBe(true);
    expect(res.errors).toEqual([]);
    // custom lua receives all four sensor pins and formats the sentence
    expect(res.code).toContain('(function(lat, lng, alt, volt)');
    expect(res.code).toContain('$ADK');
    // both outputs present: serial port setup + lazy UDP socket
    expect(res.code).toContain('serial:find_serial(0)');
    expect(res.code).toContain('Socket(1)');
    expect(res.code).toContain(':connect("192.168.1.10", 14550)');
    // the formatted line, not a default, is what gets sent
    expect(res.code).not.toContain('tostring("")');
  });
});
