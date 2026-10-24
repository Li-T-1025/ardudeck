import { describe, it, expect, vi, beforeEach } from 'vitest';

const opened: Record<string, unknown>[] = [];
const sets: Record<string, boolean>[] = [];

vi.mock('serialport', () => {
  class SerialPort {
    isOpen = false;
    constructor(opts: Record<string, unknown>) { opened.push(opts); }
    on() { return this; }
    open(cb: (err: Error | null) => void) { this.isOpen = true; cb(null); }
    set(lines: Record<string, boolean>, cb: (err: Error | null) => void) { sets.push(lines); cb(null); }
    close(cb?: () => void) { cb?.(); }
  }
  return { SerialPort };
});

const { SerialTransport } = await import('./serial-transport.js');

describe('SerialTransport control lines', () => {
  beforeEach(() => { opened.length = 0; sets.length = 0; });

  it('opens without pulsing DTR', async () => {
    await new SerialTransport('/dev/x', { baudRate: 115200 }).open();
    expect(opened[0]!.hupcl).toBe(false);
  });

  it('never holds RTS up with DTR down (ESP32 reset), DTR goes first', async () => {
    await new SerialTransport('/dev/x', { baudRate: 115200, dtrEnable: true, rtsEnable: true }).open();
    expect(sets).toEqual([{ dtr: true, rts: false }, { dtr: true, rts: true }]);
  });

  it('keeps both lines down by default', async () => {
    await new SerialTransport('/dev/x', { baudRate: 115200 }).open();
    expect(sets).toEqual([{ dtr: false, rts: false }]);
  });

  it('leaves RTS to the driver with hardware flow control', async () => {
    await new SerialTransport('/dev/x', { baudRate: 115200, dtrEnable: true, rtsEnable: true, rtscts: true }).open();
    expect(sets).toEqual([{ dtr: true }]);
  });
});
