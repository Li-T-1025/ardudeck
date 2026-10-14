import { create } from 'zustand';
import { useNavigationStore } from './navigation-store';

/** Long enough for a map view to open after the switch; an older request must not move a map opened later. */
export const FOCUS_FRESH_MS = 5_000;

/** A one-off "centre the map here" request, from anywhere (cargo, search). */
export const useMapFocusStore = create<{
  request: { lat: number; lon: number; zoom?: number; token: number; at: number } | null;
  centerOn: (lat: number, lon: number, zoom?: number) => void;
}>((set, get) => ({
  request: null,
  centerOn: (lat, lon, zoom) => {
    // from a screen without a map, open the telemetry map; the planner keeps its own
    const nav = useNavigationStore.getState();
    if (nav.currentView !== 'telemetry' && nav.currentView !== 'mission') nav.setView('telemetry');
    set({ request: { lat, lon, zoom, token: (get().request?.token ?? 0) + 1, at: Date.now() } });
  },
}));
