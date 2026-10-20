import { describe, expect, it } from 'vitest';
import { sonarSetupState } from './sonar-setup';

describe('sonarSetupState', () => {
  it('offers the script path for a Ping on an autopilot serial port', () => {
    const s = sonarSetupState({ RNGFND1_TYPE: 23, RNGFND1_ORIENT: 25, SERIAL4_PROTOCOL: 9, SERIAL1_PROTOCOL: 2 });
    expect(s.kind).toBe('ready');
    if (s.kind !== 'ready') return;
    expect(s.serial).toBe(4);
    expect(s.changes).toEqual([
      { param: 'SERIAL4_PROTOCOL', from: 9, to: 28 },
      { param: 'RNGFND1_TYPE', from: 23, to: 36 },
    ]);
  });

  it('also points the rangefinder down when it is not yet', () => {
    const s = sonarSetupState({ RNGFND2_TYPE: 23, RNGFND2_ORIENT: 0, SERIAL3_PROTOCOL: 9 });
    expect(s.kind === 'ready' && s.changes.at(-1)).toEqual({ param: 'RNGFND2_ORIENT', from: 0, to: 25 });
  });

  it('recognises a finished setup', () => {
    expect(sonarSetupState({ RNGFND1_TYPE: 36, RNGFND1_ORIENT: 25, SERIAL4_PROTOCOL: 28 }).kind).toBe('installed');
  });

  it('leaves a BlueOS boat alone: depth over MAVLink means the companion owns the Ping', () => {
    expect(sonarSetupState({ RNGFND1_TYPE: 10, RNGFND1_ORIENT: 25 }).kind).toBe('companion');
  });

  it('recognises an NMEA sounder as depth only', () => {
    expect(sonarSetupState({ RNGFND1_TYPE: 17, RNGFND1_ORIENT: 25, SERIAL2_PROTOCOL: 9 }).kind).toBe('nmea');
  });

  it('says so when there is no Ping', () => {
    expect(sonarSetupState({ RNGFND1_TYPE: 0, SERIAL1_PROTOCOL: 2 }).kind).toBe('none');
    // a Ping configured but no rangefinder serial port to take over
    expect(sonarSetupState({ RNGFND1_TYPE: 23, RNGFND1_ORIENT: 25 }).kind).toBe('none');
  });
});
