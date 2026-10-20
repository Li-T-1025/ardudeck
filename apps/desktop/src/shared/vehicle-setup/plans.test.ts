import { describe, expect, it } from 'vitest';
import { checkStepForParam, computeSetupStatus, detectSetupVehicle, entryStep, planSteps, prearmStep, PLANS } from './plans';
import type { ParamReader } from './types';

const reader = (params: Record<string, number>): ParamReader => (n) => params[n];
const none = reader({});

describe('detectSetupVehicle', () => {
  it('from MAV_TYPE and the parameters, never asked', () => {
    expect(detectSetupVehicle(undefined, none)).toBeNull();
    expect(detectSetupVehicle(2, none)).toBe('copter');
    expect(detectSetupVehicle(2, reader({ FRAME_CLASS: 6 }))).toBe('heli');
    expect(detectSetupVehicle(4, none)).toBe('heli');
    expect(detectSetupVehicle(1, none)).toBe('plane');
    expect(detectSetupVehicle(1, reader({ Q_ENABLE: 1 }))).toBe('vtol');
    expect(detectSetupVehicle(20, none)).toBe('vtol');
    expect(detectSetupVehicle(10, none)).toBe('rover');
    expect(detectSetupVehicle(10, reader({ FRAME_CLASS: 2 }))).toBe('boat');
    expect(detectSetupVehicle(11, none)).toBe('boat');
    expect(detectSetupVehicle(12, none)).toBe('sub');
  });
});

describe('planSteps', () => {
  it('copter full plan', () => {
    expect(planSteps('copter')).toEqual(PLANS.copter);
  });
  it('single / coax / bicopter skip the motor order test', () => {
    expect(planSteps('copter', { copterClass: 'coax' })).not.toContain('motors');
    expect(planSteps('copter', {}, reader({ FRAME_CLASS: 8 }))).not.toContain('motors');
  });
  it('glider: no motor check, no take-off, soaring offered', () => {
    const p = planSteps('plane', { power: 'glider' });
    expect(p).not.toContain('thrcheck');
    expect(p).not.toContain('launch');
    expect(p).toContain('soar');
    expect(planSteps('plane')).not.toContain('soar');
  });
  it('VTOL: tailsitter with one or two motors has no lift motor test', () => {
    expect(planSteps('vtol', { vtolType: 'tail', tailsitter: 'dual' })).not.toContain('motors');
    expect(planSteps('vtol', { vtolType: 'tail', tailsitter: 'copter' })).toContain('motors');
    expect(planSteps('vtol', {}, reader({ Q_ENABLE: 1, Q_TAILSIT_ENABLE: 1, Q_FRAME_CLASS: 10 }))).not.toContain('motors');
  });
  it('VTOL: tailsitter without surfaces has no surface check', () => {
    expect(planSteps('vtol', {}, reader({ Q_TAILSIT_ENABLE: 2 }))).not.toContain('surfaces');
  });
  it('boat: wind vane only for sailboats', () => {
    expect(planSteps('boat')).not.toContain('windvane');
    expect(planSteps('boat', { drive: 'sail' })).toContain('windvane');
    expect(planSteps('boat', {}, reader({ SAIL_ENABLE: 1 }))).toContain('windvane');
  });
});

describe('prearmStep', () => {
  it('maps messages to the step that fixes them', () => {
    expect(prearmStep('PreArm: Motors: Check frame class and type', 'copter', PLANS.copter)).toBe('frame');
    expect(prearmStep('PreArm: Compass not calibrated', 'copter', PLANS.copter)).toBe('compass');
    expect(prearmStep('PreArm: Throttle below failsafe', 'copter', PLANS.copter)).toBe('radio');
    expect(prearmStep('PreArm: Q_ASSIST_SPEED is not set', 'vtol', PLANS.vtol)).toBe('assist');
    expect(prearmStep('PreArm: Motors: Check frame config', 'sub', PLANS.sub)).toBe('subframe');
    expect(prearmStep('PreArm: Check SERVOx_FUNCTION for steering and throttle', 'rover', PLANS.rover)).toBe('drive');
    expect(prearmStep('PreArm: Logging failed', 'copter', PLANS.copter)).toBeNull();
  });
});

describe('computeSetupStatus', () => {
  const base = { mavType: 2, firmware: 'ArduCopter V4.6.2' };

  it('null for PX4 or an unknown vehicle', () => {
    expect(computeSetupStatus({ ...base, firmware: 'px4', read: none, prearm: [] })).toBeNull();
    expect(computeSetupStatus({ ...base, mavType: undefined, read: none, prearm: [] })).toBeNull();
  });

  it('a fresh copter', () => {
    const s = computeSetupStatus({
      ...base,
      read: reader({ FRAME_CLASS: 0, AHRS_ORIENTATION: 0, COMPASS_OFS_X: 0, COMPASS_OFS_Y: 0, COMPASS_OFS_Z: 0, FLTMODE_CH: 5 }),
      prearm: ['PreArm: Motors: Check frame class and type', 'PreArm: Compass not calibrated', 'PreArm: Logging failed'],
      rcReceiving: true,
    })!;
    const st = Object.fromEntries(s.steps.map((x) => [x.id, x.state]));
    expect(s.vehicle).toBe('copter');
    expect(st).toEqual({ size: 'todo', frame: 'todo', orient: 'found', radio: 'found', compass: 'todo', modes: 'found', motors: 'needs-pilot', battery: 'todo', ready: 'todo' });
    expect(s.steps.find((x) => x.id === 'frame')!.blockers).toEqual(['PreArm: Motors: Check frame class and type']);
    expect(s.steps.find((x) => x.id === 'ready')!.blockers).toHaveLength(3);
    expect(s.prearm[2]).toEqual({ text: 'PreArm: Logging failed', stepId: null });
    expect(s.steps[0]!.titleKey).toBe('vehicle-setup:steps.size.name');
  });

  it('no receiver signal leaves the receiver step open', () => {
    const s = computeSetupStatus({ ...base, read: none, prearm: [], rcReceiving: false })!;
    expect(s.steps.find((x) => x.id === 'radio')!.state).toBe('todo');
  });

  it('an uncalibrated compass without a pre-arm message needs the pilot', () => {
    const s = computeSetupStatus({ ...base, read: reader({ COMPASS_OFS_X: 0, COMPASS_OFS_Y: 0, COMPASS_OFS_Z: 0 }), prearm: [] })!;
    expect(s.steps.find((x) => x.id === 'compass')!.state).toBe('needs-pilot');
    expect(s.steps.find((x) => x.id === 'ready')!.state).toBe('done');
  });

  it('done marks win unless the board still complains', () => {
    const s = computeSetupStatus({ ...base, read: none, prearm: ['PreArm: Compass not calibrated'], done: { size: true, motors: true, compass: true } })!;
    const st = Object.fromEntries(s.steps.map((x) => [x.id, x.state]));
    expect(st.size).toBe('done');
    expect(st.motors).toBe('done');
    expect(st.compass).toBe('todo');
  });

  it('VTOL: Q_ASSIST_SPEED 0 is not an answer', () => {
    const s = computeSetupStatus({ mavType: 1, firmware: 'ArduPlane V4.6.0', read: reader({ Q_ENABLE: 1, Q_FRAME_CLASS: 1, Q_ASSIST_SPEED: 0 }), prearm: [] })!;
    expect(s.vehicle).toBe('vtol');
    const st = Object.fromEntries(s.steps.map((x) => [x.id, x.state]));
    expect(st.assist).toBe('todo');
    expect(st.vtype).toBe('found');
    expect(st.vframe).toBe('found');
    expect(s.steps.find((x) => x.id === 'airframe')!.titleKey).toBe('vehicle-setup:steps.wingTail.name');
  });
});

describe('entryStep', () => {
  it('resolves entries per vehicle', () => {
    expect(entryStep('start', PLANS.copter, 'copter')).toBe('size');
    expect(entryStep('arm', PLANS.plane, 'plane')).toBe('ready');
    expect(entryStep('flip', PLANS.copter, 'copter')).toBe('frame');
    expect(entryStep('flip', PLANS.plane, 'plane')).toBe('orient');
    expect(entryStep('motors', PLANS.copter, 'copter')).toBe('motors');
    expect(entryStep('motors', PLANS.plane, 'plane')).toBe('thrcheck');
    expect(entryStep('motors', PLANS.rover, 'rover')).toBe('drivetest');
    expect(entryStep('motors', PLANS.sub, 'sub')).toBe('thrusters');
    expect(entryStep('wobble', PLANS.copter, 'copter')).toBe('size');
    expect(entryStep('wobble', PLANS.plane, 'plane')).toBe('airframe');
  });
});

describe('checkStepForParam', () => {
  it('topology params point at the check to re-run', () => {
    expect(checkStepForParam('AHRS_ORIENTATION', 'copter')).toBe('orient');
    expect(checkStepForParam('FRAME_CLASS', 'copter')).toBe('motors');
    expect(checkStepForParam('Q_FRAME_TYPE', 'vtol')).toBe('motors');
    expect(checkStepForParam('SERVO2_REVERSED', 'plane')).toBe('surfaces');
    expect(checkStepForParam('SERVO5_FUNCTION', 'vtol', 33)).toBe('motors');
    expect(checkStepForParam('SERVO9_FUNCTION', 'vtol', 2)).toBe('surfaces');
    expect(checkStepForParam('SERVO1_FUNCTION', 'rover', 26)).toBe('drivetest');
    expect(checkStepForParam('MOT_3_DIRECTION', 'sub')).toBe('thrusters');
    expect(checkStepForParam('SERVO6_REVERSED', 'vtol', 34)).toBe('motors');
    expect(checkStepForParam('SERVO3_FUNCTION', 'plane', 70)).toBe('thrcheck');
    expect(checkStepForParam('SERVO5_FUNCTION', 'plane', 74)).toBe('thrcheck');
    expect(checkStepForParam('SERVO7_FUNCTION', 'vtol', 73)).toBe('vframe');
    expect(checkStepForParam('SERVO3_FUNCTION', 'vtol', 70)).toBeNull();
    expect(checkStepForParam('BATT_LOW_VOLT', 'copter')).toBeNull();
  });
});
