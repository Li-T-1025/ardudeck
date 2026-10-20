import { detectSetupVehicle, entryStep, planSteps, type WizardEntry } from '../../../shared/vehicle-setup/plans';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useVehicleSetupStore } from '../../stores/vehicle-setup-store';

export type { WizardEntry };

/** Kept for the overview's contract: the wizard is always available, nothing needs to register. */
export function registerNewVehicleWizard(_open: (entry: WizardEntry) => void): () => void {
  return () => {};
}

export function hasNewVehicleWizard(): boolean {
  return true;
}

/** Opens the wizard on the step an entry point is about. */
export function openNewVehicleWizard(entry: WizardEntry = 'start'): boolean {
  const params = useParameterStore.getState().parameters;
  const read = (n: string) => params.get(n)?.value;
  const vehicle = detectSetupVehicle(useConnectionStore.getState().connectionState.mavType, read);
  const store = useVehicleSetupStore.getState();
  if (!vehicle) store.openAt();
  else store.openAt(entryStep(entry, planSteps(vehicle, store.answers, read), vehicle));
  return true;
}
