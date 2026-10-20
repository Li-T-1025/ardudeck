import { create } from 'zustand';
import type { SetupAnswers, SetupStepId } from '../../shared/vehicle-setup/types';
import { useNavigationStore } from './navigation-store';

/** The new-vehicle wizard: open state, the step shown, and what the pilot answered this session. */
interface VehicleSetupStore {
  open: boolean;
  /** Step to show; null opens on the first step of the vehicle's plan. */
  step: SetupStepId | null;
  answers: SetupAnswers;
  done: Partial<Record<SetupStepId, boolean>>;
  /** Vehicle the answers belong to; another vehicle starts clean. */
  vehicleKey: string | null;

  openAt: (step?: SetupStepId) => void;
  close: () => void;
  goTo: (step: SetupStepId) => void;
  answer: (patch: SetupAnswers) => void;
  markDone: (step: SetupStepId, done?: boolean) => void;
  bindVehicle: (key: string) => void;
}

export const useVehicleSetupStore = create<VehicleSetupStore>((set, get) => ({
  open: false,
  step: null,
  answers: {},
  done: {},
  vehicleKey: null,

  openAt: (step) => {
    set({ open: true, step: step ?? null });
    useNavigationStore.getState().setView('parameters', 'tab:quick-setup');
  },
  close: () => set({ open: false }),
  goTo: (step) => set({ step }),
  answer: (patch) => set({ answers: { ...get().answers, ...patch } }),
  markDone: (step, done = true) => set({ done: { ...get().done, [step]: done } }),
  bindVehicle: (key) => {
    if (get().vehicleKey === key) return;
    set({ vehicleKey: key, answers: {}, done: {}, step: null });
  },
}));
