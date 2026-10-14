import { create } from 'zustand';
import type { TileSourceEntry } from '../../shared/tile-source-types';

interface TileSourceStore {
  entries: TileSourceEntry[];
  /** Bumped on every change, so consumers can key effects on it. */
  version: number;
  refresh(): Promise<void>;
  /** Subscribe to main-process changes. Returns the unsubscribe. */
  start(): () => void;
}

const changeListeners = new Set<() => void>();

function notify(): void {
  for (const l of changeListeners) l();
}

export const useTileSourceStore = create<TileSourceStore>((set, get) => ({
  entries: [],
  version: 0,
  refresh: async () => {
    try {
      const entries = await window.electronAPI.tileSourcesList();
      set({ entries, version: get().version + 1 });
      notify();
    } catch {
      // older main process: no sources
    }
  },
  start: () => {
    void get().refresh();
    return window.electronAPI.onTileSourcesChanged((entries) => {
      set({ entries, version: get().version + 1 });
      notify();
    });
  },
}));

export function subscribeTerrainChanged(cb: () => void): () => void {
  changeListeners.add(cb);
  return () => {
    changeListeners.delete(cb);
  };
}

export function pointInRing(lat: number, lon: number, ring: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a.lat > lat) !== (b.lat > lat) && lon < ((b.lng - a.lng) * (lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

/** Query string that changes with every source change, so <img> consumers refetch the same tile URL. */
export function tileVersionSuffix(): string {
  return `?v=${useTileSourceStore.getState().version}`;
}

/** 19 while a module DEM exists (the host overzooms its own DEM past 15 to match), else the native 15. */
export function demSourceMaxZoom(entries: TileSourceEntry[]): number {
  return entries.some((e) => e.kind === 'dem') ? 19 : 15;
}

/** Highest priority DEM source whose footprint contains the point, or null. */
export function demSourceAt(lat: number, lon: number): TileSourceEntry | null {
  let best: TileSourceEntry | null = null;
  for (const e of useTileSourceStore.getState().entries) {
    if (e.kind !== 'dem' || !pointInRing(lat, lon, e.footprint)) continue;
    if (!best || (e.priority ?? 0) > (best.priority ?? 0)) best = e;
  }
  return best;
}
