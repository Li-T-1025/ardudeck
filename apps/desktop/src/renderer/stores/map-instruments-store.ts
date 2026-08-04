/**
 * Visibility, scale, opacity and layouts of the floating map instrument
 * widgets over the telemetry map. The attitude ball is the 'attitude'
 * registry instrument like everything else. The store only holds explicit
 * user choices; anything untouched falls back to the registry's
 * per-instrument default. Persisted to localStorage so the operator's
 * cockpit arrangement survives restarts.
 *
 * Widget drag positions are persisted separately by useDraggableOverlay
 * (anchor payloads under map-overlay-pos:*). Named layouts snapshot both
 * halves: this store's state AND the position payloads; applying a layout
 * writes positions back and bumps layoutRev, which remounts the widgets so
 * they re-read their stored position.
 */
import { create } from 'zustand';
import { MAP_INSTRUMENTS } from '../components/map/instruments/registry';
import {
  readOverlayPosPayload,
  writeOverlayPosPayload,
  clearOverlayPosPayload,
} from '../components/map/useDraggableOverlay';

const STORAGE_KEY = 'map-instruments-visible';
const LAYOUTS_STORAGE_KEY = 'map-instrument-layouts';

export const INSTRUMENT_SCALE_MIN = 0.5;
export const INSTRUMENT_SCALE_MAX = 1.6;
/** Resize moves in these detents so different instruments land on IDENTICAL
 * scales (matching sizes by eye is impossible with a continuous scale). */
export const INSTRUMENT_SCALE_STEP = 0.1;
export const INSTRUMENT_OPACITY_MIN = 0.25;

/** Overlay-position keys a layout snapshot covers. */
function layoutPosKeys(): string[] {
  return MAP_INSTRUMENTS.map((i) => 'instrument:' + i.id);
}

export type InstrumentDisplayMode = 'analog' | 'numeric';

export interface InstrumentLayoutSnapshot {
  visible: Record<string, boolean>;
  scale: Record<string, number>;
  opacity: number;
  /** Per-instrument opacity overrides (missing = follow global opacity). */
  instrumentOpacity?: Record<string, number>;
  /** Per-instrument analog/numeric choice (missing = analog). */
  displayMode?: Record<string, InstrumentDisplayMode>;
  /** Overlay key -> stored position payload (anchor v3, or legacy). */
  positions: Record<string, unknown>;
}

const DEFAULT_VISIBLE: Record<string, boolean> = Object.fromEntries(
  MAP_INSTRUMENTS.map((i) => [i.id, i.defaultVisible]),
);

function clampScale(v: number): number {
  const stepped = Math.round(v / INSTRUMENT_SCALE_STEP) * INSTRUMENT_SCALE_STEP;
  // Kill float noise (0.7000000000000001) so persisted values compare clean.
  const rounded = Math.round(stepped * 100) / 100;
  return Math.max(INSTRUMENT_SCALE_MIN, Math.min(INSTRUMENT_SCALE_MAX, rounded));
}

function clampOpacity(v: number): number {
  return Math.max(INSTRUMENT_OPACITY_MIN, Math.min(1, v));
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

function sanitizeInstrumentOpacity(parsed: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = clampOpacity(v);
    }
  }
  return out;
}

function sanitizeDisplayMode(parsed: unknown): Record<string, InstrumentDisplayMode> {
  const out: Record<string, InstrumentDisplayMode> = {};
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === 'analog' || v === 'numeric') out[k] = v;
    }
  }
  return out;
}

interface PersistedMain {
  visible: Record<string, boolean>;
  scale: Record<string, number>;
  opacity: number;
  instrumentOpacity: Record<string, number>;
  displayMode: Record<string, InstrumentDisplayMode>;
}

// Payload v3 adds { opacity, instrumentOpacity, displayMode }; v2 was
// { visible, scale }; v1 the flat visible map itself.
function readStored(): PersistedMain {
  const fallback: PersistedMain = { visible: {}, scale: {}, opacity: 1, instrumentOpacity: {}, displayMode: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && ('visible' in parsed || 'scale' in parsed)) {
      return {
        visible: sanitizeVisible(parsed.visible),
        scale: sanitizeScale(parsed.scale),
        opacity: typeof parsed.opacity === 'number' && Number.isFinite(parsed.opacity) ? clampOpacity(parsed.opacity) : 1,
        instrumentOpacity: sanitizeInstrumentOpacity(parsed.instrumentOpacity),
        displayMode: sanitizeDisplayMode(parsed.displayMode),
      };
    }
    return { ...fallback, visible: sanitizeVisible(parsed) };
  } catch {
    return fallback;
  }
}

function persist(s: PersistedMain): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage full/blocked: keep in-memory state only
  }
}

function sanitizeLayout(parsed: unknown): InstrumentLayoutSnapshot | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  return {
    visible: sanitizeVisible(p.visible),
    scale: sanitizeScale(p.scale),
    opacity: typeof p.opacity === 'number' && Number.isFinite(p.opacity) ? clampOpacity(p.opacity) : 1,
    instrumentOpacity: sanitizeInstrumentOpacity(p.instrumentOpacity),
    displayMode: sanitizeDisplayMode(p.displayMode),
    positions: p.positions && typeof p.positions === 'object' ? (p.positions as Record<string, unknown>) : {},
  };
}

function readStoredLayouts(): Record<string, InstrumentLayoutSnapshot> {
  try {
    const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, InstrumentLayoutSnapshot> = {};
    if (parsed && typeof parsed === 'object') {
      for (const [name, layout] of Object.entries(parsed)) {
        const s = sanitizeLayout(layout);
        if (s) out[name] = s;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistLayouts(layouts: Record<string, InstrumentLayoutSnapshot>): void {
  try {
    localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // storage full/blocked
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
  /** Idle opacity of all on-map instruments (hover always restores 1). */
  opacity: number;
  /** Per-instrument opacity override; missing entry = follow global. */
  instrumentOpacity: Record<string, number>;
  /** Per-instrument analog/numeric choice; missing entry = analog. */
  displayMode: Record<string, InstrumentDisplayMode>;
  /** Bumped when a layout is applied; remounts widgets to re-read positions. */
  layoutRev: number;
  savedLayouts: Record<string, InstrumentLayoutSnapshot>;
  toggle: (id: string) => void;
  setScale: (id: string, v: number) => void;
  setOpacity: (v: number) => void;
  /** null clears the override so the instrument follows the global opacity. */
  setInstrumentOpacity: (id: string, v: number | null) => void;
  setDisplayMode: (id: string, mode: InstrumentDisplayMode) => void;
  saveLayout: (name: string) => void;
  applyLayout: (layout: InstrumentLayoutSnapshot) => void;
  deleteLayout: (name: string) => void;
}

// One-time migration: the attitude ball persisted its drag position under
// 'attitude-ball' before it became the 'attitude' registry instrument.
{
  const legacyBall = readOverlayPosPayload('attitude-ball');
  if (legacyBall !== null && readOverlayPosPayload('instrument:attitude') === null) {
    writeOverlayPosPayload('instrument:attitude', legacyBall);
    clearOverlayPosPayload('attitude-ball');
  }
}

const initial = readStored();

export const useMapInstrumentsStore = create<MapInstrumentsStore>((set, get) => {
  const persistMain = () => {
    const { visible, scale, opacity, instrumentOpacity, displayMode } = get();
    persist({ visible, scale, opacity, instrumentOpacity, displayMode });
  };

  return {
    visible: initial.visible,
    scale: initial.scale,
    opacity: initial.opacity,
    instrumentOpacity: initial.instrumentOpacity,
    displayMode: initial.displayMode,
    layoutRev: 0,
    savedLayouts: readStoredLayouts(),

    toggle: (id) => {
      set({ visible: { ...get().visible, [id]: !resolveInstrumentVisible(get().visible, id) } });
      persistMain();
    },

    setScale: (id, v) => {
      set({ scale: { ...get().scale, [id]: clampScale(v) } });
      persistMain();
    },

    setOpacity: (v) => {
      set({ opacity: clampOpacity(v) });
      persistMain();
    },

    setInstrumentOpacity: (id, v) => {
      const next = { ...get().instrumentOpacity };
      if (v === null) delete next[id];
      else next[id] = clampOpacity(v);
      set({ instrumentOpacity: next });
      persistMain();
    },

    setDisplayMode: (id, mode) => {
      set({ displayMode: { ...get().displayMode, [id]: mode } });
      persistMain();
    },

    saveLayout: (name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const { visible, scale, opacity, instrumentOpacity, displayMode } = get();
      const positions: Record<string, unknown> = {};
      for (const key of layoutPosKeys()) {
        const payload = readOverlayPosPayload(key);
        if (payload !== null) positions[key] = payload;
      }
      // Snapshot the RESOLVED visibility so a later registry-default change
      // can't silently alter a saved layout.
      const resolvedVisible: Record<string, boolean> = Object.fromEntries(
        MAP_INSTRUMENTS.map((i) => [i.id, resolveInstrumentVisible(visible, i.id)]),
      );
      const next = {
        ...get().savedLayouts,
        [trimmed]: {
          visible: resolvedVisible,
          scale: { ...scale },
          opacity,
          instrumentOpacity: { ...instrumentOpacity },
          displayMode: { ...displayMode },
          positions,
        },
      };
      persistLayouts(next);
      set({ savedLayouts: next });
    },

    applyLayout: (layout) => {
      for (const key of layoutPosKeys()) {
        if (key in layout.positions) writeOverlayPosPayload(key, layout.positions[key]);
        else clearOverlayPosPayload(key);
      }
      set({
        visible: { ...layout.visible },
        scale: { ...layout.scale },
        opacity: layout.opacity,
        instrumentOpacity: { ...(layout.instrumentOpacity ?? {}) },
        displayMode: { ...(layout.displayMode ?? {}) },
        layoutRev: get().layoutRev + 1,
      });
      persistMain();
    },

    deleteLayout: (name) => {
      const next = { ...get().savedLayouts };
      delete next[name];
      persistLayouts(next);
      set({ savedLayouts: next });
    },
  };
});
