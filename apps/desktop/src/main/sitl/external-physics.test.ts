import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, BrowserWindow: {} }));

import { EXTERNAL_PHYSICS_PORT, paramModelFor, simModelFor } from './ardupilot-sitl-process';
import type { ArduPilotSitlConfig } from '../../shared/ipc-channels';

const base = { vehicleType: 'copter', releaseTrack: 'stable', homeLocation: { lat: 0, lng: 0, alt: 0, heading: 0 } } as ArduPilotSitlConfig;

describe('external physics (a cargo driving Gazebo)', () => {
  it('launches SITL on the JSON link at the simulator host and keeps the frame for the parameters', () => {
    const cfg: ArduPilotSitlConfig = { ...base, model: 'quad', externalPhysics: { kind: 'json', host: '127.0.0.1' } };
    expect(simModelFor(cfg)).toBe('JSON:127.0.0.1');
    expect(paramModelFor(cfg)).toBe('quad');
  });

  it('wins over the in-app engine and a custom frame, which cannot share the port', () => {
    const cfg: ArduPilotSitlConfig = { ...base, useArduDeckSim: true, customFramePath: '/f.json', customFrameMotors: 8, externalPhysics: { kind: 'json', host: '10.0.0.2' } };
    expect(simModelFor(cfg)).toBe('JSON:10.0.0.2');
  });

  it('is instance 0 on 9002', () => {
    expect(EXTERNAL_PHYSICS_PORT).toBe(9002);
  });
});
