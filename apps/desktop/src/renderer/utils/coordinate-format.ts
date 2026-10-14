/** How positions are shown and typed. Decimal and DMS are built in; cargo adds more (MGRS, UTM) through the SDK. */
import { useMemo } from 'react';
import type { CoordinateFormatRegistration } from '@ardudeck/module-sdk';
import { createSlugRegistry } from '../modules/slug-registry';
import { useSettingsStore } from '../stores/settings-store';

export interface LatLon { lat: number; lon: number }

export interface CoordinatePrecision { value: number; label: string; labelKey?: string; vars?: Record<string, unknown> }

export interface CoordinateFormat {
  id: string;
  /** Translated name, or a translation key for the built-ins. */
  label: string;
  labelKey?: string;
  precisions: CoordinatePrecision[];
  defaultPrecision: number;
  format(lat: number, lon: number, precision?: number): string;
  parse(text: string): LatLon | null;
}

export const DEFAULT_COORDINATE_FORMAT = 'decimal';

export const coordinateFormatRegistry = createSlugRegistry<CoordinateFormatRegistration>();

const valid = (p: LatLon | null): LatLon | null =>
  p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 ? p : null;

/** "47.476857, 9.663978", also with ; or whitespace between, or a trailing N/S E/W. */
export function parseDecimal(text: string): LatLon | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?\s*$/i.exec(text);
  if (!m) return null;
  const lat = Number(m[1]) * (m[2]?.toUpperCase() === 'S' ? -1 : 1);
  const lon = Number(m[3]) * (m[4]?.toUpperCase() === 'W' ? -1 : 1);
  return valid({ lat, lon });
}

function dms(value: number, pos: string, neg: string, decimals = 1): string {
  const abs = Math.abs(value);
  const scale = 10 ** decimals;
  let d = Math.floor(abs);
  let m = Math.floor((abs - d) * 60);
  let s = Math.round(((abs - d) * 60 - m) * 60 * scale) / scale;
  if (s >= 60) { s = 0; m += 1; }
  if (m >= 60) { m = 0; d += 1; }
  const sec = s.toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, '0');
  return `${d}°${String(m).padStart(2, '0')}'${sec}"${value < 0 ? neg : pos}`;
}

/** 47°28'36.7"N 9°39'50.3"E, tolerant of spaces and missing seconds. */
export function parseDms(text: string): LatLon | null {
  const part = String.raw`(\d+(?:\.\d+)?)\s*[°d\s]\s*(?:(\d+(?:\.\d+)?)\s*['m′\s]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|''|s|″)?\s*)?([NSEW])`;
  const m = new RegExp(`^\\s*${part}\\s*[,;\\s]?\\s*${part}\\s*$`, 'i').exec(text);
  if (!m) return null;
  const toDeg = (d?: string, mi?: string, s?: string, h?: string) =>
    (Number(d) + Number(mi ?? 0) / 60 + Number(s ?? 0) / 3600) * (/[SW]/i.test(h ?? '') ? -1 : 1);
  const a = { v: toDeg(m[1], m[2], m[3], m[4]), h: m[4]!.toUpperCase() };
  const b = { v: toDeg(m[5], m[6], m[7], m[8]), h: m[8]!.toUpperCase() };
  const latFirst = a.h === 'N' || a.h === 'S';
  return valid(latFirst ? { lat: a.v, lon: b.v } : { lat: b.v, lon: a.v });
}

export const BUILTIN_FORMATS: CoordinateFormat[] = [
  {
    id: 'decimal',
    label: 'Decimal', // i18n-exempt: identifier fallback; the setting shows labelKey
    labelKey: 'settings:coordinateFormat.decimal',
    // about 11 m, 1 m, 10 cm, 1 cm at the equator
    precisions: [4, 5, 6, 7].map((n) => ({ value: n, label: `${n}`, labelKey: 'settings:coordinateFormat.decimals', vars: { count: n } })),
    defaultPrecision: 6,
    format: (lat, lon, p = 6) => `${lat.toFixed(p)}, ${lon.toFixed(p)}`,
    parse: parseDecimal,
  },
  {
    id: 'dms',
    label: 'DMS', // i18n-exempt: identifier fallback; the setting shows labelKey
    labelKey: 'settings:coordinateFormat.dms',
    precisions: [0, 1, 2].map((n) => ({ value: n, label: `${n}`, labelKey: 'settings:coordinateFormat.secondDecimals', vars: { count: n } })),
    defaultPrecision: 1,
    format: (lat, lon, p = 1) => `${dms(lat, 'N', 'S', p)} ${dms(lon, 'E', 'W', p)}`,
    parse: parseDms,
  },
];

function cargoFormats(entries = coordinateFormatRegistry.list()): CoordinateFormat[] {
  return entries.map(({ slug, value }) => ({
    id: `${slug}:${value.id}`,
    label: value.name(),
    precisions: (value.precisions ?? []).map((p) => ({ value: p.value, label: p.name() })),
    defaultPrecision: value.defaultPrecision ?? value.precisions?.[0]?.value ?? 0,
    format: (lat, lon, precision) => {
      try { return value.format(lat, lon, precision); } catch { return BUILTIN_FORMATS[0]!.format(lat, lon); }
    },
    parse: (text) => {
      try { return valid(value.parse(text)); } catch { return null; }
    },
  }));
}

export function allFormats(entries = coordinateFormatRegistry.list()): CoordinateFormat[] {
  return [...BUILTIN_FORMATS, ...cargoFormats(entries)];
}

/** The chosen format, or decimal when it came from a cargo that is not loaded. */
function resolve(id: string, formats: CoordinateFormat[]): CoordinateFormat {
  return formats.find((f) => f.id === id) ?? BUILTIN_FORMATS[0]!;
}

/** The pilot's precision for a format, if it is still one the format offers. */
export function precisionFor(format: CoordinateFormat, chosen: Record<string, number>): number {
  const p = chosen[format.id];
  return p !== undefined && format.precisions.some((x) => x.value === p) ? p : format.defaultPrecision;
}

/** Outside React: the chosen format right now. */
export function formatPosition(lat: number, lon: number): string {
  const { coordinateFormat, coordinatePrecision } = useSettingsStore.getState();
  const f = resolve(coordinateFormat, allFormats());
  return f.format(lat, lon, precisionFor(f, coordinatePrecision));
}

/** Any position text: the chosen format first, then every other one, so a pasted decimal pair always works. */
export function parsePosition(text: string, formats = allFormats(), preferred = useSettingsStore.getState().coordinateFormat): LatLon | null {
  const first = resolve(preferred, formats);
  for (const f of [first, ...formats.filter((x) => x !== first)]) {
    const p = f.parse(text);
    if (p) return p;
  }
  return null;
}

/** Formatter that follows the setting and cargo loading. */
export function useCoordinateFormat(): { format: (lat: number, lon: number) => string; parse: (text: string) => LatLon | null; current: CoordinateFormat } {
  const id = useSettingsStore((s) => s.coordinateFormat);
  const chosen = useSettingsStore((s) => s.coordinatePrecision);
  const entries = coordinateFormatRegistry.useEntries();
  return useMemo(() => {
    const formats = allFormats(entries);
    const current = resolve(id, formats);
    const precision = precisionFor(current, chosen);
    return {
      format: (lat: number, lon: number) => current.format(lat, lon, precision),
      parse: (text: string) => parsePosition(text, formats, id),
      current,
    };
  }, [id, chosen, entries]);
}
