/**
 * Visibility and scale of the floating map instrument widgets (flight data,
 * battery, GPS, altitude, speed, heading cards over the telemetry map). The
 * store only holds explicit user choices; anything untouched falls back to
 * the registry's per-instrument default (flight-data ships ON, the numeric
 * cards OFF; scale defaults to 1). Persisted to localStorage so the
 * operator's cockpit arrangement survives restarts. Widget drag positions are
 * persisted separately by useDraggableOverlay.
 */
import { create } from 'zustand';
import { MAP_INSTRUMENTS } from '../components/map/instruments/registry';

const STORAGE_KEY = 'map-instruments-visible';

export const INSTRUMENT_SCALE_MIN = 0.5;
export const INSTRUMENT_SCALE_MAX = 1.6;

const DEFAULT_VISIBLE: Record<string, boolean> = Object.fromEntries(
  MAP_INSTRUMENTS.map((i) => [i.id, i.defaultVisible]),
);

function clampScale(v: number): number {
  return Math.max(INSTRUMENT_SCALE_MIN, Math.min(INSTRUMENT_SCALE_MAX, v));
}

// False entries must survive too: they override a defaultVisible: true.
function sanitizeVisible(parsed: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}

function sanitizeScale(parsed: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = clampScale(v);
    }
  }
  return out;
}

// Payload v2 is { visible, scale }; v1 was the flat visible map itself.
function readStored(): { visible: Record<string, boolean>; scale: Record<string, number> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { visible: {}, scale: {} };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && ('visible' in parsed || 'scale' in parsed)) {
      return { visible: sanitizeVisible(parsed.visible), scale: sanitizeScale(parsed.scale) };
    }
    return { visible: sanitizeVisible(parsed), scale: {} };
  } catch {
    return { visible: {}, scale: {} };
  }
}

function persist(visible: Record<string, boolean>, scale: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ visible, scale }));
  } catch {
    // storage full/blocked: keep in-memory state only
  }
}

/** Effective visibility: explicit user choice wins, else the registry default. */
export function resolveInstrumentVisible(overrides: Record<string, boolean>, id: string): boolean {
  return overrides[id] ?? DEFAULT_VISIBLE[id] ?? false;
}

interface MapInstrumentsStore {
  /** Explicit user choices only; use resolveInstrumentVisible for reads. */
  visible: Record<string, boolean>;
  /** Per-instrument zoom factor; missing entry = 1 (natural size). */
  scale: Record<string, number>;
  toggle: (id: string) => void;
  setScale: (id: string, v: number) => void;
}

const initial = readStored();

export const useMapInstrumentsStore = create<MapInstrumentsStore>((set, get) => ({
  visible: initial.visible,
  scale: initial.scale,

  toggle: (id) => {
    const next = { ...get().visible, [id]: !resolveInstrumentVisible(get().visible, id) };
    persist(next, get().scale);
    set({ visible: next });
  },

  setScale: (id, v) => {
    const next = { ...get().scale, [id]: clampScale(v) };
    persist(get().visible, next);
    set({ scale: next });
  },
}));
