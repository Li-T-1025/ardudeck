import { describe, expect, it } from 'vitest';
import { DEFAULT_STICK_MAP, overrideChannels, overrideFields, RC_OVERRIDE_IGNORE as X, stickMapFrom } from './rc-map';

const reader = (p: Record<string, number>) => (n: string) => p[n];
const sticks = { roll: 1100, pitch: 1200, throttle: 1000, yaw: 1400 };

describe('stickMapFrom', () => {
  it('defaults to AETR while RCMAP is not loaded', () => {
    expect(stickMapFrom(reader({}))).toEqual(DEFAULT_STICK_MAP);
  });
  it('reads TAER', () => {
    expect(stickMapFrom(reader({ RCMAP_ROLL: 2, RCMAP_PITCH: 3, RCMAP_THROTTLE: 1, RCMAP_YAW: 4 }))).toEqual({ roll: 2, pitch: 3, throttle: 1, yaw: 4 });
  });
  it('ignores out-of-range values per axis', () => {
    expect(stickMapFrom(reader({ RCMAP_ROLL: 0, RCMAP_THROTTLE: 19, RCMAP_YAW: 2.5 }))).toEqual(DEFAULT_STICK_MAP);
  });
});

describe('overrideChannels', () => {
  it('default map: RC1..4, aux ignored', () => {
    const ch = overrideChannels(sticks);
    expect(ch.slice(0, 4)).toEqual([1100, 1200, 1000, 1400]);
    expect(ch.slice(4).every((v) => v === X)).toBe(true);
    expect(ch).toHaveLength(18);
  });
  it('TAER: throttle on RC1, roll on RC2', () => {
    const ch = overrideChannels(sticks, { roll: 2, pitch: 3, throttle: 1, yaw: 4 });
    expect(ch.slice(0, 4)).toEqual([1000, 1100, 1200, 1400]);
  });
  it('rover: steering on RCMAP_ROLL, throttle on RCMAP_THROTTLE', () => {
    const map = stickMapFrom(reader({ RCMAP_ROLL: 1, RCMAP_THROTTLE: 3 }));
    const ch = overrideChannels({ roll: 1700, pitch: X, throttle: 1500, yaw: X }, map);
    expect(ch[0]).toBe(1700);
    expect(ch[2]).toBe(1500);
  });
  it('mode pin lands on its channel but never on a stick channel', () => {
    const ch = overrideChannels(sticks, { roll: 2, pitch: 3, throttle: 1, yaw: 5 }, { 8: 1000, 5: 1900 });
    expect(ch[7]).toBe(1000);
    expect(ch[4]).toBe(1400);
  });
  it('a doubled RCMAP channel keeps the throttle value', () => {
    expect(overrideChannels(sticks, { roll: 1, pitch: 2, throttle: 1, yaw: 4 })[0]).toBe(1000);
  });
});

describe('overrideFields', () => {
  it('maps to chan1Raw..chan18Raw', () => {
    const f = overrideFields(overrideChannels(sticks, { roll: 2, pitch: 3, throttle: 1, yaw: 4 }));
    expect(f.chan1Raw).toBe(1000);
    expect(f.chan2Raw).toBe(1100);
    expect(f.chan18Raw).toBe(X);
    expect(Object.keys(f)).toHaveLength(18);
  });
});
