import layoutsJson from '../ap-motor-layouts.json';
import type { FrameLayout, FrameLayoutsFile } from '../motor-test-types';
import type { BoatDrive, CopterClass, ParamReader, RoverDrive, SetupAnswers } from './types.js';

const LAYOUTS = (layoutsJson as FrameLayoutsFile).layouts;

/** FRAME_CLASS / Q_FRAME_CLASS per copter layout picker id. */
export const FRAME_CLASS: Record<CopterClass, number> = {
  quad: 1, hexa: 2, octa: 3, x8: 4, y6: 5, dodeca: 12, tri: 7, deca: 14, single: 8, coax: 9, bi: 10,
};

export function findLayout(frameClass: number, frameType: number): FrameLayout | null {
  return LAYOUTS.find((l) => l.Class === frameClass && l.Type === frameType) ?? null;
}

export function layoutsForClass(frameClass: number): FrameLayout[] {
  return LAYOUTS.filter((l) => l.Class === frameClass);
}

/** X (type 1) where the class has it, else its first layout. */
export function defaultFrameType(frameClass: number): number {
  const types = layoutsForClass(frameClass);
  return types.some((l) => l.Type === 1) ? 1 : types[0]?.Type ?? 0;
}

/** Motors that lift. The tri yaw servo sits in the data as motor 7 at 0,0 and is not one. */
export function liftMotors(layout: FrameLayout) {
  return layout.motors.filter((m) => m.Roll !== 0 || m.Pitch !== 0);
}

/** SERVOn_FUNCTION of MotorN: 1..8 are 33..40, 9..12 are 82..85. */
export function motorFunction(n: number): number {
  return n <= 8 ? 32 + n : 73 + n;
}

export function isMotorFunction(fn: number): boolean {
  return (fn >= 33 && fn <= 40) || (fn >= 82 && fn <= 85);
}

export interface OutputAssignment {
  output: number;
  fn: number;
  /** i18n key suffix under vehicle-setup:outputs.role */
  role: string;
  /** i18n key suffix under vehicle-setup:outputs.test, for surfaces the pilot checks */
  test?: string;
  /** Motor number for numbered roles (lift motor, omni motor). */
  n?: number;
  /** Set by the firmware itself (Q_ENABLE lift motors): shown, never written. */
  auto?: boolean;
}

/** Outputs the VTOL lift side takes: 4 + motor number, tri yaw servo on 11, dual tailsitter 5..8. */
export function vtolLiftOutputs(a: SetupAnswers): OutputAssignment[] {
  const out: OutputAssignment[] = [];
  if (a.vtolType === 'tail' && a.tailsitter !== 'copter') {
    if (a.tailsitter !== 'single') {
      out.push({ output: 7, fn: 73, role: 'motorLeft' }, { output: 8, fn: 74, role: 'motorRight' });
    }
    return out;
  }
  const cls = FRAME_CLASS[a.copterClass ?? 'quad'];
  const layout = findLayout(cls, a.frameType ?? defaultFrameType(cls)) ?? layoutsForClass(cls)[0];
  if (!layout) return out;
  for (const m of liftMotors(layout)) out.push({ output: 4 + m.Number, fn: motorFunction(m.Number), role: 'liftMotor', n: m.Number, auto: true });
  if (cls === 7) out.push({ output: 11, fn: 39, role: 'triYawServo' });
  return out.sort((x, y) => x.output - y.output);
}

/** Plane and VTOL outputs: ArduPilot defaults 4/19/70/21 first, extras on the next free outputs. */
export function planeOutputs(vehicle: 'plane' | 'vtol', a: SetupAnswers): OutputAssignment[] {
  const air = a.airframe ?? (vehicle === 'vtol' && a.vtolType === 'tail' ? 'wing' : 'normal');
  const power = vehicle === 'vtol' ? 'electric' : a.power ?? 'electric';
  const extras = new Set(a.extras ?? []);
  const flaperons = extras.has('flaperon');
  const yLead = a.aileronY !== false;
  const tail = vehicle === 'vtol' && a.vtolType === 'tail' ? a.tailsitter ?? 'dual' : null;
  const tilt = vehicle === 'vtol' && a.vtolType === 'tilt';

  const lift = vehicle === 'vtol' ? vtolLiftOutputs(a) : [];
  const occupied = new Set<number>(lift.map((o) => o.output));
  // a dual tailsitter keeps 5 and 6 free for vectored tilt servos
  if (tail === 'dual') [5, 6].forEach((o) => occupied.add(o));
  const out: OutputAssignment[] = [...lift];
  const put = (output: number, fn: number, role: string, test?: string) => { occupied.add(output); out.push({ output, fn, role, test }); };
  let next = 5;
  const take = () => { while (occupied.has(next)) next++; occupied.add(next); return next++; };

  const ailerons = (air === 'normal' || air === 'vtail' || air === 'invv') && !flaperons;
  if (ailerons) put(1, 4, yLead ? 'aileronsY' : 'aileronLeft', yLead ? 'aileron' : 'aileronLeft');
  if (air === 'normal' || air === 'three') put(2, 19, 'elevator', 'elevator');
  if (air === 'vtail' || air === 'invv') { put(2, 79, 'vtailLeft', 'vtailPitch'); put(4, 80, 'vtailRight', 'vtailYaw'); }
  if (air === 'wing') { put(1, 77, 'elevonLeft', 'elevonRoll'); put(2, 78, 'elevonRight', 'elevonPitch'); }
  if (air === 'normal' || air === 'three') put(4, 21, 'rudder', 'rudder');
  if ((power === 'electric' || power === 'ic') && tail !== 'dual' && tail !== 'copter' && !tilt) {
    put(3, 70, power === 'ic' ? 'throttleEngine' : tail === 'single' ? 'motor' : 'throttle');
  }
  if (power === 'twin') { put(3, 73, 'motorLeft'); put(take(), 74, 'motorRight'); }
  if (power === 'ic') { put(take(), 67, 'ignition'); put(take(), 69, 'starter'); }
  if (ailerons && !yLead) put(take(), 4, 'aileronRight', 'aileronRight');
  if (flaperons) { put(1, 24, 'flaperonLeft', 'flaperonLeft'); put(take(), 25, 'flaperonRight', 'flaperonRight'); }
  if (extras.has('flaps')) put(take(), 2, 'flaps', 'flaps');
  if (extras.has('airbrake')) put(take(), 110, 'airbrake', 'airbrake');
  if (extras.has('spoiler')) { put(take(), 16, 'spoilerLeft', 'spoilerLeft'); put(take(), 17, 'spoilerRight', 'spoilerRight'); }
  if (extras.has('steer')) put(take(), 26, 'groundSteering', 'groundSteering');
  if (extras.has('gear')) put(take(), 29, 'landingGear', 'landingGear');
  return out.sort((x, y) => x.output - y.output);
}

/** Rover and boat drive outputs: steering on 1, throttle on 3, or a pair for skid / two motors. */
export function driveOutputs(vehicle: 'rover' | 'boat', drive: RoverDrive | BoatDrive | undefined): OutputAssignment[] {
  const d = drive ?? (vehicle === 'boat' ? 'rudder' : 'steer');
  if (d === 'skid' || d === 'diff' || d === 'balance') return [{ output: 1, fn: 73, role: 'throttleLeft' }, { output: 3, fn: 74, role: 'throttleRight' }];
  if (d === 'omni') return [1, 2, 3, 4].map((o) => ({ output: o, fn: motorFunction(o), role: 'omniMotor', n: o }));
  // sail output picked by the pilot afterwards; rudder stays on 1
  if (d === 'sail') return [{ output: 1, fn: 26, role: 'rudder' }];
  return [{ output: 1, fn: 26, role: 'steering' }, { output: 3, fn: 70, role: 'throttle' }];
}

/** Non-output params the drive choice decides. */
export function driveParams(vehicle: 'rover' | 'boat', drive: RoverDrive | BoatDrive | undefined): { name: string; value: number }[] {
  const d = drive ?? (vehicle === 'boat' ? 'rudder' : 'steer');
  if (d === 'balance') return [{ name: 'FRAME_CLASS', value: 3 }, { name: 'MOT_SLEWRATE', value: 0 }, { name: 'FS_CRASH_CHECK', value: 1 }];
  if (d === 'sail') return [{ name: 'SAIL_ENABLE', value: 1 }];
  return [{ name: 'FRAME_CLASS', value: vehicle === 'boat' ? 2 : 1 }];
}

/** SERVOn_FUNCTION changes needed, skipping firmware-set lift motors and outputs the board lacks. */
export function outputChanges(assignments: OutputAssignment[], read: ParamReader): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = [];
  for (const a of assignments) {
    if (a.auto) continue;
    const name = `SERVO${a.output}_FUNCTION`;
    const cur = read(name);
    if (cur !== undefined && cur !== a.fn) out.push({ name, value: a.fn });
  }
  return out;
}

/** Highest output an assignment list needs, to warn when the board has fewer. */
export function highestOutput(assignments: OutputAssignment[]): number {
  return assignments.reduce((m, a) => Math.max(m, a.output), 0);
}
