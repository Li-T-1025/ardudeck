import { checkStepForParam } from '../../shared/vehicle-setup/plans';
import { isMotorFunction } from '../../shared/vehicle-setup/outputs';
import type { SetupStepId, SetupVehicle } from '../../shared/vehicle-setup/types';

/** Which pilot check a wiring change calls for, used for the button label. */
export type WiringCheck = 'surfaces' | 'motors' | 'orientation';

export function checkKind(step: SetupStepId): WiringCheck {
  if (step === 'orient') return 'orientation';
  return step === 'surfaces' ? 'surfaces' : 'motors';
}

const ORDER: WiringCheck[] = ['orientation', 'motors', 'surfaces'];

/** The Quick setup step that proves a change, or null when it is not a wiring change. */
export function wiringStepFor(
  name: string,
  current: number | undefined,
  next: number,
  vehicle: SetupVehicle,
  read: (name: string) => number | undefined,
): SetupStepId | null {
  const reversed = /^SERVO(\d+)_REVERSED$/.exec(name);
  if (reversed) return checkStepForParam(name, vehicle, read(`SERVO${reversed[1]}_FUNCTION`));
  // Unassigning a motor still needs the motor test, so judge by the old value then.
  const fn = current !== undefined && isMotorFunction(current) && !isMotorFunction(next) ? current : next;
  return checkStepForParam(name, vehicle, fn);
}

/** The distinct steps a set of applied changes needs, orientation first, surfaces last. */
export function wiringStepsFor(
  changes: Array<{ name: string; current: number | undefined; next: number }>,
  vehicle: SetupVehicle,
  read: (name: string) => number | undefined,
): SetupStepId[] {
  const steps = new Set<SetupStepId>();
  for (const c of changes) {
    const step = wiringStepFor(c.name, c.current, c.next, vehicle, read);
    if (step) steps.add(step);
  }
  return [...steps].sort((a, b) => ORDER.indexOf(checkKind(a)) - ORDER.indexOf(checkKind(b)));
}
