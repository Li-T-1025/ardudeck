// Map instruments contributed by cargo (host.map.registerInstrument); the instruments store keeps the pilot's choices.
import { create } from 'zustand';
import type { MapInstrumentRegistration } from '@ardudeck/module-sdk';
import type { MapInstrumentDef } from '../components/map/instruments/registry';

export const CARGO_INSTRUMENT_SEPARATOR = '/';

/** Instrument ids a cargo owns carry its slug so they never collide with built-ins or each other. */
export function cargoInstrumentId(slug: string, id: string): string {
  return `${slug}${CARGO_INSTRUMENT_SEPARATOR}${id}`;
}

export function isCargoInstrumentId(id: string): boolean {
  return id.includes(CARGO_INSTRUMENT_SEPARATOR);
}

// Tailwind only compiles literal classes; new cargo instruments stagger down the right column.
const DEFAULT_SLOTS = [
  'absolute right-3 top-[180px] z-[1000]',
  'absolute right-3 top-[300px] z-[1000]',
  'absolute right-3 top-[420px] z-[1000]',
  'absolute right-3 top-[540px] z-[1000]',
];

interface ModuleMapInstrumentsState {
  defs: MapInstrumentDef[];
  bySlug: Record<string, string[]>;
  /** Full id of the cargo instrument whose settings dialog is open. */
  settingsOpen: string | null;
}

export const useModuleMapInstrumentsStore = create<ModuleMapInstrumentsState>(() => ({ defs: [], bySlug: {}, settingsOpen: null }));

export function openModuleInstrumentSettings(fullId: string): void {
  useModuleMapInstrumentsStore.setState({ settingsOpen: fullId });
}

export function closeModuleInstrumentSettings(): void {
  useModuleMapInstrumentsStore.setState({ settingsOpen: null });
}

export function registerModuleMapInstrument(slug: string, namespace: string, reg: MapInstrumentRegistration): void {
  if (!reg?.id || !reg.labelKey || typeof reg.component !== 'function') {
    throw new Error(`[module:${slug}] map instrument needs an id, a labelKey and a component`);
  }
  const id = cargoInstrumentId(slug, reg.id);
  const key = (k: string) => `${namespace}:${k}`;
  useModuleMapInstrumentsStore.setState((s) => {
    const others = s.defs.filter((d) => d.id !== id);
    const def: MapInstrumentDef = {
      id,
      labelKey: key(reg.labelKey),
      defaultClassName: DEFAULT_SLOTS[others.filter((d) => isCargoInstrumentId(d.id)).length % DEFAULT_SLOTS.length]!,
      defaultVisible: reg.defaultVisible ?? false,
      Component: reg.component as () => JSX.Element,
      NumericComponent: reg.numericComponent as (() => JSX.Element) | undefined,
      variants: reg.variants?.map((v) => ({ id: v.id, labelKey: key(v.labelKey), Component: v.component as () => JSX.Element, round: v.round, Glyph: v.glyph as (() => JSX.Element) | undefined })),
      round: reg.round,
      profiles: reg.profiles,
      Settings: reg.settings as (() => JSX.Element) | undefined,
      settingsWidth: reg.settingsWidth,
      defaultLabelKey: reg.defaultLabelKey ? key(reg.defaultLabelKey) : key(reg.labelKey),
      DefaultGlyph: reg.defaultGlyph as (() => JSX.Element) | undefined,
    };
    const mine = new Set(s.bySlug[slug] ?? []);
    mine.add(id);
    return { defs: [...others, def], bySlug: { ...s.bySlug, [slug]: [...mine] } };
  });
}

export function unregisterModuleMapInstrument(slug: string, id: string): void {
  const full = cargoInstrumentId(slug, id);
  useModuleMapInstrumentsStore.setState((s) => {
    if (!s.bySlug[slug]?.includes(full)) return s;
    return { defs: s.defs.filter((d) => d.id !== full), bySlug: { ...s.bySlug, [slug]: s.bySlug[slug]!.filter((x) => x !== full) } };
  });
}

/** Remove every map instrument a module registered (module unload/reload). */
export function unregisterModuleMapInstrumentsForSlug(slug: string): void {
  useModuleMapInstrumentsStore.setState((s) => {
    const mine = new Set(s.bySlug[slug] ?? []);
    if (mine.size === 0) return s;
    const { [slug]: _gone, ...rest } = s.bySlug;
    return { defs: s.defs.filter((d) => !mine.has(d.id)), bySlug: rest, settingsOpen: s.settingsOpen && mine.has(s.settingsOpen) ? null : s.settingsOpen };
  });
}

export function listModuleMapInstruments(): MapInstrumentDef[] {
  return useModuleMapInstrumentsStore.getState().defs;
}
