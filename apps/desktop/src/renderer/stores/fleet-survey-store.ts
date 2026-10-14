/**
 * Fleet survey state: the per-vehicle assignments produced by splitting one
 * survey polygon across a fleet, plus per-vehicle upload status. Kept separate
 * from the single-vehicle survey-store so the existing planner is untouched.
 * The vehicles themselves live in the survey config (`config.fleet`).
 */

import { create } from 'zustand';
import type { FleetSurveyAssignment } from '../components/survey/survey-fleet-split';

export type UploadState = 'idle' | 'uploading' | 'complete' | 'error';

interface FleetSurveyStore {
  /** Whether a split is currently being generated. */
  building: boolean;
  /** One assignment per vehicle the polygon was split across. */
  assignments: FleetSurveyAssignment[];
  /** Per-vehicleKey upload status. */
  uploadStatus: Record<string, { state: UploadState; error?: string }>;
  /** Planned slot key -> connected vehicle key chosen for the upload. */
  targets: Record<string, string>;

  setBuilding: (building: boolean) => void;
  setAssignments: (assignments: FleetSurveyAssignment[]) => void;
  setUploadStatus: (vehicleKey: string, state: UploadState, error?: string) => void;
  setTarget: (assignmentKey: string, vehicleKey: string | null) => void;
  clear: () => void;
}

export const useFleetSurveyStore = create<FleetSurveyStore>((set, get) => ({
  building: false,
  assignments: [],
  uploadStatus: {},
  targets: {},

  setBuilding: (building) => set({ building }),
  setAssignments: (assignments) =>
    set({
      assignments,
      uploadStatus: Object.fromEntries(assignments.map((a) => [a.vehicleKey, { state: 'idle' as UploadState }])),
    }),
  setUploadStatus: (vehicleKey, state, error) =>
    set({ uploadStatus: { ...get().uploadStatus, [vehicleKey]: { state, error } } }),
  setTarget: (assignmentKey, vehicleKey) => {
    const targets = { ...get().targets };
    if (vehicleKey) targets[assignmentKey] = vehicleKey;
    else delete targets[assignmentKey];
    set({ targets });
  },
  clear: () => set({ assignments: [], uploadStatus: {}, targets: {}, building: false }),
}));
