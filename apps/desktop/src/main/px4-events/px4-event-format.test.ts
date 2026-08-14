import { describe, it, expect } from 'vitest';
import {
  buildPx4EventIndex,
  formatPx4EventMessage,
  decodePx4EventArguments,
  px4EventSeverity,
  type Px4EventMetadata,
} from './px4-event-format.js';
import { formatPx4Event } from './index.js';

/**
 * Shapes copied from PX4's real all_events.json (v1.15 SITL bundle), trimmed to
 * the events under test.
 */
const METADATA: Px4EventMetadata = {
  components: {
    '1': {
      namespace: 'px4',
      enums: {
        navigation_mode_group_t: {
          type: 'uint32_t',
          is_bitfield: true,
          entries: {
            '1': { name: 'manual', description: 'Manual' },
            '1024': { name: 'acro', description: 'Acro' },
          },
        },
        arm_disarm_reason_t: {
          type: 'uint8_t',
          entries: {
            '1': { name: 'rc_stick', description: 'RC' },
            '14': { name: 'failsafe', description: 'failsafe' },
          },
        },
      },
      event_groups: {
        arming_check: {
          events: {
            '10011251': {
              name: 'check_modes_global_pos',
              message: 'No valid global position estimate',
              arguments: [
                { name: 'modes', type: 'navigation_mode_group_t' },
                { name: 'health_component_index', type: 'uint8_t' },
              ],
            },
          },
        },
        health: {
          events: {
            '1058956': {
              name: 'check_cpu_load',
              message: 'CPU load too high: {3:.1}%',
              arguments: [
                { name: 'modes', type: 'navigation_mode_group_t' },
                { name: 'health_component_index', type: 'uint8_t' },
                { name: 'arg0', type: 'float' },
              ],
            },
            '11478328': {
              name: 'check_gyro_no_data',
              message: 'No valid data from Gyro {3}',
              arguments: [
                { name: 'modes', type: 'navigation_mode_group_t' },
                { name: 'health_component_index', type: 'uint8_t' },
                { name: 'arg0', type: 'uint8_t' },
              ],
            },
          },
        },
        default: {
          events: {
            '10044444': { name: 'commander_load_param_failed', message: 'Error loading settings' },
            '9000001': {
              name: 'armed_by',
              message: 'Armed by {1}',
              arguments: [{ name: 'reason', type: 'px4::arm_disarm_reason_t' }],
            },
            '9000002': {
              name: 'takeoff_alt',
              message: 'Takeoff to {1:.1m} above home',
              arguments: [{ name: 'alt', type: 'float' }],
            },
          },
        },
      },
    },
  },
};

const index = buildPx4EventIndex(METADATA);

/** Wire id for a component-1 event: libevents packs the component into byte 3. */
const wire = (hash: number): number => 0x01000000 + hash;

/** Build EVENT.arguments: 40 bytes, arguments packed in declaration order. */
function args(write: (view: DataView) => void): Uint8Array {
  const buf = new Uint8Array(40);
  write(new DataView(buf.buffer));
  return buf;
}

describe('buildPx4EventIndex', () => {
  it('flattens every group into one id lookup', () => {
    expect(index.size).toBe(6);
    expect(index.get(wire(10011251))?.group).toBe('arming_check');
    expect(index.get(wire(1058956))?.group).toBe('health');
    expect(index.get(wire(10044444))?.group).toBe('default');
  });
});

describe('formatPx4EventMessage', () => {
  it('renders a message with no arguments', () => {
    const entry = index.get(wire(10044444))!;
    expect(formatPx4EventMessage(entry, args(() => {}))).toBe('Error loading settings');
  });

  it('renders the real arming-check refusal PX4 sends instead of STATUSTEXT', () => {
    const entry = index.get(wire(10011251))!;
    expect(formatPx4EventMessage(entry, args((v) => {
      v.setUint32(0, 1, true);
      v.setUint8(4, 3);
    }))).toBe('No valid global position estimate');
  });

  it('applies the {N:.P} precision spec to a float argument', () => {
    const entry = index.get(wire(1058956))!;
    // modes(uint32) + health_component_index(uint8) then the float at offset 5
    const text = formatPx4EventMessage(entry, args((v) => {
      v.setUint32(0, 1, true);
      v.setUint8(4, 0);
      v.setFloat32(5, 92.472, true);
    }));
    expect(text).toBe('CPU load too high: 92.5%');
  });

  it('reads an integer argument that follows a uint32 and a uint8', () => {
    const entry = index.get(wire(11478328))!;
    const text = formatPx4EventMessage(entry, args((v) => {
      v.setUint32(0, 1024, true);
      v.setUint8(4, 2);
      v.setUint8(5, 1);
    }));
    expect(text).toBe('No valid data from Gyro 1');
  });

  it('renders an enum argument as its description, not its number', () => {
    const entry = index.get(wire(9000001))!;
    expect(formatPx4EventMessage(entry, args((v) => v.setUint8(0, 14)))).toBe('Armed by failsafe');
  });

  it('renders a unit suffix', () => {
    const entry = index.get(wire(9000002))!;
    expect(formatPx4EventMessage(entry, args((v) => v.setFloat32(0, 2.5, true))))
      .toBe('Takeoff to 2.5 m above home');
  });

  it('leaves the placeholder alone when the payload is too short for it', () => {
    const entry = index.get(wire(1058956))!;
    const short = new Uint8Array(5); // modes + index only, float missing
    expect(formatPx4EventMessage(entry, short)).toBe('CPU load too high: {3:.1}%');
  });
});

describe('decodePx4EventArguments', () => {
  it('resolves a namespaced enum to its base type width', () => {
    const entry = index.get(wire(9000001))!;
    const decoded = decodePx4EventArguments(entry, args((v) => v.setUint8(0, 1)));
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.type).toBe('uint8_t');
    expect(decoded[0]!.value).toBe(1);
  });

  it('stops at a truncated argument instead of reading past the buffer', () => {
    const entry = index.get(wire(1058956))!;
    expect(decodePx4EventArguments(entry, new Uint8Array(6))).toHaveLength(2);
  });
});

describe('px4EventSeverity', () => {
  it('takes the external nibble', () => {
    expect(px4EventSeverity(0x64)).toBe(4); // internal Notice, external Warning
    expect(px4EventSeverity(0x02)).toBe(2); // Critical
  });

  it('rejects Protocol and Disabled levels as not user-facing', () => {
    expect(px4EventSeverity(0x08)).toBeNull();
    expect(px4EventSeverity(0x09)).toBeNull();
  });
});

/**
 * Real EVENT payloads captured off the wire from PX4 v1.15 SITL (arming was
 * commanded to provoke the arming-check set). These are the exact bytes,
 * including MAVLink v2's trailing-zero truncation: every one is far short of
 * the declared 53 bytes, which is why the handler zero-pads before reading.
 */
const CAPTURED: Array<{ hex: string; text: string; severity: number | null; group: string }> = [
  {
    hex: '73c2980120080000faff0000333800000014',
    text: 'No valid global position estimate',
    severity: 3,
    group: 'arming_check',
  },
  {
    hex: '29ed060120080000fdff000044ffffffff07',
    text: 'No manual control input',
    severity: 4,
    group: 'arming_check',
  },
  {
    hex: '9d080201e81800000800000062',
    text: 'Arming denied: Resolve system health failures first',
    severity: 2,
    group: 'default',
  },
  {
    // log_levels 0x88: external level Protocol. A machine-facing summary that
    // must never reach the Messages panel.
    hex: 'e093a80120080000f7ff000088000000100080000000802b0180802b0180',
    text: 'Arming check summary event',
    severity: null,
    group: 'arming_check',
  },
];

describe('formatPx4Event against real SITL packets and the bundled metadata', () => {
  for (const capture of CAPTURED) {
    it(`decodes "${capture.text}"`, () => {
      const payload = Buffer.from(capture.hex, 'hex');
      // Exactly what the MAVLink handler does with a truncated v2 payload.
      const full = new Uint8Array(53);
      full.set(payload.subarray(0, Math.min(payload.length, 53)));

      const view = new DataView(full.buffer);
      const result = formatPx4Event(view.getUint32(0, true), full.subarray(13), full[12]!);

      expect(result).not.toBeNull();
      expect(result!.text).toBe(capture.text);
      expect(result!.severity).toBe(capture.severity);
      expect(result!.group).toBe(capture.group);
    });
  }

  it('returns null for an unknown event id', () => {
    expect(formatPx4Event(0xdeadbeef, new Uint8Array(40), 0x66)).toBeNull();
  });
});
