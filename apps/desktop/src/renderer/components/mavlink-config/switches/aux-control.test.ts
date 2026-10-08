import { describe, it, expect } from 'vitest';
import { outputUse, servoFnForOption } from './aux-control';

// labels as ArduPilot 4.6 reports them
const SERVO = new Map<number, string>([[7, 'Mount1Pitch'], [10, 'CameraTrigger'], [33, 'Motor1'], [4, 'Aileron'], [56, 'RCIN6']]);
const OPTION = new Map<number, string>([[213, 'Mount1 Pitch'], [9, 'Camera Trigger']]);
const passthrough = (fn: number) => fn >= 51 && fn <= 66;

describe('choosing an output for a channel', () => {
  it('keeps a gimbal output as the gimbal and gives the channel the matching aux function', () => {
    expect(outputUse(7, SERVO, OPTION, passthrough)).toEqual({ kind: 'aux', option: 213 });
    expect(outputUse(10, SERVO, OPTION, passthrough)).toEqual({ kind: 'aux', option: 9 });
  });

  it('passes the channel through to a free output or one already following a channel', () => {
    expect(outputUse(0, SERVO, OPTION, passthrough)).toEqual({ kind: 'passthrough' });
    expect(outputUse(undefined, SERVO, OPTION, passthrough)).toEqual({ kind: 'passthrough' });
    expect(outputUse(56, SERVO, OPTION, passthrough)).toEqual({ kind: 'passthrough' });
  });

  it('never hands a motor or a control surface to a switch', () => {
    expect(outputUse(33, SERVO, OPTION, passthrough)).toEqual({ kind: 'busy' });
    expect(outputUse(4, SERVO, OPTION, passthrough)).toEqual({ kind: 'busy' });
  });

  it('refuses a pair the firmware labels differently', () => {
    expect(outputUse(7, SERVO, new Map([[213, 'Something Else']]), passthrough)).toEqual({ kind: 'busy' });
  });

  it('finds the output function behind a channel option', () => {
    expect(servoFnForOption(213)).toBe(7);
    expect(servoFnForOption(0)).toBeNull();
  });
});
