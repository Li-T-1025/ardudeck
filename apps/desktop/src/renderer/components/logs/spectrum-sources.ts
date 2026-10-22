// Spectrum panel sources: batch sampler runs (ISBH + ISBD) and regular messages, kept pure for tests.
import type { LogColumns } from '../../utils/log-columns';
import { numericFieldNames } from '../../utils/log-columns';
import { batchRuns, batchSources, windowSpectrum, type BatchAxis, type BatchSensor } from '../mavlink-config/notch-analysis';
import { computeSpectrum, estimateSampleRate, resampleUniform, type Spectrum } from './log-fft';

export type SpectrumSource =
  | { kind: 'batch'; sensor: BatchSensor }
  | { kind: 'msg'; type: string };

export interface InstanceSpectrum {
  inst: number | null;
  rateHz: number;
  sampleCount: number;
  spec: Spectrum;
}

interface LogLike {
  messageTypes: string[];
  messages: Record<string, LogColumns>;
}

export const BATCH_AXES: BatchAxis[] = ['x', 'y', 'z'];

const META_FIELDS = new Set(['TimeUS', 'Instance', 'I']);

export function sourceKey(s: SpectrumSource): string {
  return s.kind === 'batch' ? `batch:${s.sensor}` : `msg:${s.type}`;
}

export function parseSourceKey(key: string): SpectrumSource | null {
  if (key === 'batch:gyro' || key === 'batch:accel') return { kind: 'batch', sensor: key.slice(6) as BatchSensor };
  if (key.startsWith('msg:')) return { kind: 'msg', type: key.slice(4) };
  return null;
}

/** Batch sensors first (gyro before accel), then every message type with a numeric field to transform. */
export function listSources(log: LogLike): SpectrumSource[] {
  const out: SpectrumSource[] = [];
  const sensors = new Set(batchSources(log.messages.ISBH).map((s) => s.sensor));
  if (log.messages.ISBD) for (const sensor of ['gyro', 'accel'] as const) if (sensors.has(sensor)) out.push({ kind: 'batch', sensor });
  for (const type of log.messageTypes) {
    const cols = log.messages[type];
    // the batch entries above cover ISBH/ISBD; their N and seqno columns are not signals
    if (type === 'ISBH' || type === 'ISBD' || !cols || cols.count < 64) continue;
    if (numericFieldNames(cols).some((k) => !META_FIELDS.has(k))) out.push({ kind: 'msg', type });
  }
  return out;
}

export function messageFields(cols: LogColumns | undefined): string[] {
  return cols ? numericFieldNames(cols).filter((k) => !META_FIELDS.has(k)) : [];
}

/**
 * The X/Y/Z siblings of an axis field (GyrX, AccZ, x[3], gyro_rad[1]), or null when it
 * is not one axis of a triplet the message actually logs.
 */
export function axisTriplet(field: string, fields: readonly string[]): [string, string, string] | null {
  const has = (f: string) => fields.includes(f);
  const letter = /^(.*?)([xyzXYZ])(\[\d+\])?$/.exec(field);
  if (letter) {
    const [, pre, l, idx = ''] = letter;
    const axes = (l === l!.toUpperCase() ? ['X', 'Y', 'Z'] : ['x', 'y', 'z']).map((a) => `${pre}${a}${idx}`);
    if (axes.every(has)) return axes as [string, string, string];
  }
  const index = /^(.*)\[[012]\]$/.exec(field);
  if (index) {
    const axes = [0, 1, 2].map((i) => `${index[1]}[${i}]`);
    if (axes.every(has)) return axes as [string, string, string];
  }
  return null;
}

/** One spectrum per IMU instance of a batch sensor, Welch over the batches inside the window. */
export function batchSpectra(log: LogLike, sensor: BatchSensor, axis: BatchAxis, window: { min: number; max: number } | null): InstanceSpectrum[] {
  const out: InstanceSpectrum[] = [];
  for (const src of batchSources(log.messages.ISBH)) {
    if (src.sensor !== sensor) continue;
    const runs = batchRuns(log.messages.ISBH, log.messages.ISBD, { sensor, instance: src.instance, axis });
    const spec = windowSpectrum(runs, window ? { startS: window.min, endS: window.max } : null);
    if (!spec) continue;
    const rateHz = runs[0]!.rateHz;
    out.push({ inst: src.instance, rateHz, sampleCount: runs.reduce((n, r) => n + r.values.length, 0), spec });
  }
  return out;
}

/** One spectrum per instance of a regular message, the rate estimated from its timestamps. */
export function messageSpectra(cols: LogColumns, field: string, window: { min: number; max: number } | null): InstanceSpectrum[] {
  const instKey = ['Instance', 'I'].find((k) => cols.num[k] !== undefined) ?? null;
  const instCol = instKey ? cols.num[instKey] : undefined;
  const valueCol = cols.num[field];
  if (!valueCol) return [];
  const instances: (number | null)[] = instCol ? [...new Set(Array.from(instCol))].sort((a, b) => a - b) : [null];
  const out: InstanceSpectrum[] = [];
  for (const inst of instances) {
    const times: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < cols.count; i++) {
      if (inst !== null && instCol && instCol[i] !== inst) continue;
      const t = (cols.timeUs[i] ?? 0) / 1_000_000;
      if (window && (t < window.min || t > window.max)) continue;
      const v = valueCol[i];
      if (v === undefined || !Number.isFinite(v)) continue;
      times.push(t);
      values.push(v);
    }
    if (times.length < 128) continue;
    const rateHz = estimateSampleRate(times);
    if (!rateHz) continue;
    const spec = computeSpectrum(resampleUniform(times, values, rateHz), rateHz);
    if (spec) out.push({ inst, rateHz, sampleCount: times.length, spec });
  }
  return out;
}
