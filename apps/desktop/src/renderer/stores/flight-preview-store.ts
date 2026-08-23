/**
 * Flight preview (mission playback) state. A kinematic gizmo scrubbing along
 * the planned mission - what the pilot will see the aircraft and camera do,
 * without SITL. The timeline itself is rebuilt by the overlay from the
 * current mission items whenever preview opens or the mission changes.
 */
import { create } from 'zustand';

interface FlightPreviewStore {
  isActive: boolean;
  playing: boolean;
  /** Playback position, ms since mission start. */
  timeMs: number;
  /** Playback rate multiplier (1 = realtime). */
  rate: number;
  /** Preview scope: a specific WP group id, or null = the entire mission. */
  groupId: string | null;

  open: () => void;
  close: () => void;
  /** Switch the previewed group; rewinds to the start of that group's flight. */
  setGroupId: (groupId: string | null) => void;
  togglePlay: () => void;
  seek: (timeMs: number) => void;
  setRate: (rate: number) => void;
  /** Called by the overlay's animation loop. */
  advance: (deltaMs: number, durationMs: number) => void;
}

export const useFlightPreviewStore = create<FlightPreviewStore>((set, get) => ({
  isActive: false,
  playing: false,
  timeMs: 0,
  rate: 4,
  groupId: null,

  // Opens PAUSED at 0:00 - the user picks the scope and presses play; nothing
  // starts moving on its own.
  open: () => set({ isActive: true, playing: false, timeMs: 0 }),
  close: () => set({ isActive: false, playing: false, timeMs: 0 }),
  setGroupId: (groupId) => set({ groupId, timeMs: 0, playing: false }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  seek: (timeMs) => set({ timeMs, playing: false }),
  setRate: (rate) => set({ rate }),
  advance: (deltaMs, durationMs) => {
    const { timeMs, rate, playing } = get();
    if (!playing) return;
    const next = timeMs + deltaMs * rate;
    if (next >= durationMs) set({ timeMs: durationMs, playing: false });
    else set({ timeMs: next });
  },
}));
