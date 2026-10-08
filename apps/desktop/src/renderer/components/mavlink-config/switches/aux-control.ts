/** Output functions a radio channel controls through an aux function, keeping the output's own function. */
export interface AuxPair {
  servoFn: number;
  servoLabel: RegExp;
  option: number;
  optionLabel: RegExp;
}

export const AUX_PAIRS: AuxPair[] = [
  { servoFn: 7, servoLabel: /^mount1 ?pitch$/i, option: 213, optionLabel: /^mount1 pitch$/i },
  { servoFn: 8, servoLabel: /^mount1 ?roll$/i, option: 212, optionLabel: /^mount1 roll$/i },
  { servoFn: 6, servoLabel: /^mount1 ?yaw$/i, option: 214, optionLabel: /^mount1 yaw$/i },
  { servoFn: 13, servoLabel: /^mount2 ?pitch$/i, option: 216, optionLabel: /^mount2 pitch$/i },
  { servoFn: 14, servoLabel: /^mount2 ?roll$/i, option: 215, optionLabel: /^mount2 roll$/i },
  { servoFn: 12, servoLabel: /^mount2 ?yaw$/i, option: 217, optionLabel: /^mount2 yaw$/i },
  { servoFn: 9, servoLabel: /^mount1 ?retract$/i, option: 27, optionLabel: /^retract mount1$/i },
  { servoFn: 15, servoLabel: /^mount2 ?retract$/i, option: 113, optionLabel: /^retract mount2$/i },
  { servoFn: 10, servoLabel: /^camera ?trigger$/i, option: 9, optionLabel: /^camera trigger$/i },
  { servoFn: 28, servoLabel: /^gripper$/i, option: 19, optionLabel: /^gripper$/i },
  { servoFn: 29, servoLabel: /^landing ?gear$/i, option: 29, optionLabel: /^landing gear$/i },
];

/** What choosing an output for a channel does to it. */
export type OutputUse =
  | { kind: 'passthrough' }
  | { kind: 'aux'; option: number }
  | { kind: 'busy' };

/** Free or passthrough outputs follow the channel; paired functions get the aux option instead; the rest is left alone. */
export function outputUse(
  servoFn: number | undefined,
  servoLabels: ReadonlyMap<number, string>,
  optionLabels: ReadonlyMap<number, string>,
  isPassthrough: (fn: number) => boolean,
): OutputUse {
  if (servoFn === undefined || servoFn === 0 || isPassthrough(servoFn)) return { kind: 'passthrough' };
  const pair = AUX_PAIRS.find((p) => p.servoFn === servoFn);
  if (pair && pair.servoLabel.test(servoLabels.get(servoFn) ?? '') && pair.optionLabel.test(optionLabels.get(pair.option) ?? '')) {
    return { kind: 'aux', option: pair.option };
  }
  return { kind: 'busy' };
}

/** The output function a channel's aux option controls, when it is one of the pairs. */
export function servoFnForOption(option: number | undefined): number | null {
  return AUX_PAIRS.find((p) => p.option === option)?.servoFn ?? null;
}

/** The mount instance (1 or 2) an output function belongs to, for checking its driver is on. */
export function mountOf(servoFn: number | null | undefined): 1 | 2 | null {
  if (servoFn === 6 || servoFn === 7 || servoFn === 8 || servoFn === 9) return 1;
  if (servoFn === 12 || servoFn === 13 || servoFn === 14 || servoFn === 15) return 2;
  return null;
}
