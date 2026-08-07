import { describe, expect, it } from 'vitest';
import { canDial, resolveReconnectTarget } from './reconnect-target';
import type { ConnectOptions } from '../../shared/ipc-channels';

/**
 * The bug: relaunching SITL to move the take-off point kills the MAVLink link as its first act,
 * so the reconnect that follows is always scheduled AFTER the drop. `connectionState` is empty
 * by then, and the old code read only that, so the target came out with no host, no port path
 * and no options. The reconnect loop cancelled itself one millisecond in with "No connection
 * info available for reconnect" and the vehicle never came back.
 */

const SITL_TCP: ConnectOptions = { type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol: 'mavlink' };
const LIVE_SITL = { connectionType: 'tcp' as const, protocol: 'mavlink' as const, isSitl: true };
/** What is left of `connectionState` once the link has gone. */
const DROPPED = {};

describe('after the link has already dropped', () => {
  it('still knows where to dial, which is the whole bug', () => {
    const target = resolveReconnectTarget(DROPPED, SITL_TCP);
    expect(target.host).toBe('127.0.0.1');
    expect(target.tcpPort).toBe(5760);
    expect(canDial(target)).toBe(true);
  });

  it('keeps MAVLink rather than falling through to MSP', () => {
    // A socket re-dialled as MSP opens fine and then parses no heartbeat, which reads as a dead
    // board rather than as the wrong protocol.
    expect(resolveReconnectTarget(DROPPED, SITL_TCP).protocol).toBe('mavlink');
  });

  it('remembers a serial port and the baud it was actually opened at', () => {
    const serial: ConnectOptions = { type: 'serial', port: '/dev/tty.usb1', baudRate: 1_500_000, protocol: 'mavlink' };
    const target = resolveReconnectTarget(DROPPED, serial);
    expect(target.portPath).toBe('/dev/tty.usb1');
    // Reconnecting a 1.5M board at 115200 opens the port and parses nothing.
    expect(target.baudRate).toBe(1_500_000);
    expect(canDial(target)).toBe(true);
  });

  it('recognises a UDP link, which has neither a host nor a port path to go on', () => {
    const udp: ConnectOptions = { type: 'udp', udpPort: 14550, protocol: 'mavlink' };
    const target = resolveReconnectTarget(DROPPED, udp);
    expect(target.host).toBeUndefined();
    expect(target.portPath).toBeUndefined();
    expect(canDial(target)).toBe(true);
  });

  it('admits it cannot dial when there is genuinely nothing to go on', () => {
    const target = resolveReconnectTarget(DROPPED, null);
    expect(canDial(target)).toBe(false);
  });
});

describe('while the link is still up', () => {
  it('prefers the live connection, so scheduling early behaves exactly as it did', () => {
    const target = resolveReconnectTarget(
      { ...LIVE_SITL, portPath: undefined },
      SITL_TCP,
    );
    expect(target.host).toBe('127.0.0.1');
    expect(target.protocol).toBe('mavlink');
  });

  it('treats a live SITL link as TCP even before any options were recorded', () => {
    expect(resolveReconnectTarget({ isSitl: true }, null).host).toBe('127.0.0.1');
  });

  it('takes the live serial path over a stale remembered one', () => {
    const stale: ConnectOptions = { type: 'serial', port: '/dev/old', baudRate: 57600 };
    const target = resolveReconnectTarget({ connectionType: 'serial', portPath: '/dev/current' }, stale);
    expect(target.portPath).toBe('/dev/current');
  });

  it('leaves a serial link without a host, so it is never dialled as TCP', () => {
    const serial: ConnectOptions = { type: 'serial', port: '/dev/tty.usb1' };
    expect(resolveReconnectTarget({ connectionType: 'serial' }, serial).host).toBeUndefined();
  });
});

describe('a TCP link that is not SITL', () => {
  it('reconnects to its own host and port, not to loopback 5760', () => {
    const remote: ConnectOptions = { type: 'tcp', host: '192.168.4.1', tcpPort: 5761, protocol: 'mavlink' };
    const target = resolveReconnectTarget(DROPPED, remote);
    expect(target.host).toBe('192.168.4.1');
    expect(target.tcpPort).toBe(5761);
  });

  it('parses a port that arrived as text', () => {
    const asText = { type: 'tcp', host: '10.0.0.5', tcpPort: '5762' } as unknown as ConnectOptions;
    expect(resolveReconnectTarget(DROPPED, asText).tcpPort).toBe(5762);
  });
});
