import { describe, it, expect } from 'vitest';
import { supportsTopSpeed, dragForTopSpeed, topSpeedModel, topSpeedParamLines, clampTopSpeedKmh } from './sitl-top-speed';

describe('sitl top speed', () => {
  it('reproduces the measured calibration points', () => {
    // 98.1 m/s at 0.1, 138.2 at 0.05, 195.5 at 0.025 in SITL.
    expect(dragForTopSpeed(98.1 * 3.6)).toBeCloseTo(0.0994, 3);
    expect(dragForTopSpeed(138.2 * 3.6)).toBeCloseTo(0.0501, 3);
    expect(dragForTopSpeed(195.5 * 3.6)).toBeCloseTo(0.025, 3);
  });

  it('only offers it on quadplanes with a forward cruise motor', () => {
    expect(supportsTopSpeed('plane', 'quadplane')).toBe(true);
    expect(supportsTopSpeed('plane', 'quadplane-tri')).toBe(true);
    expect(supportsTopSpeed('plane', 'quadplane-tilt')).toBe(false);
    expect(supportsTopSpeed('plane', 'quadplane-cl84')).toBe(false);
    expect(supportsTopSpeed('plane', 'quadplane-copter_tailsitter')).toBe(false);
    expect(supportsTopSpeed('plane', 'quadplane-ice')).toBe(false);
    expect(supportsTopSpeed('plane', 'plane')).toBe(false);
    expect(supportsTopSpeed('copter', 'quad')).toBe(false);
  });

  it('builds the SITL model string and airspeed limits', () => {
    expect(topSpeedModel('quadplane')).toBe('quadplane-jet:ardudeck-aero.json');
    expect(topSpeedParamLines(450)).toEqual(['AIRSPEED_MAX 125', 'AIRSPEED_CRUISE 100', 'THR_MAX 100']);
    expect(clampTopSpeedKmh(5000)).toBe(800);
  });
});
