/**
 * Motor vibration filter (ArduPilot harmonic notch), the maths behind the
 * Quick setup card. Pure: parameters and log columns in, settings out.
 *
 * Rules from the ArduPilot notch pages (common-imu-notch-filtering,
 * common-esc-telem-based-notch, common-throttle-based-notch, common-imu-fft,
 * common-imu-batchsampling), read 2026-10-20:
 * - ESC telemetry: MODE 3, REF 1, FREQ "below the hover frequency but above
 *   INS_GYRO_FILTER", BW = FREQ / 2, or FREQ / 4 with one notch per motor.
 * - In-flight FFT: FFT_ENABLE 1 (reboot), MODE 4, REF 1.
 * - Throttle: MODE 1, FREQ = hover frequency from a pre-filter log,
 *   REF = hover throttle, BW = FREQ / 2.
 * - Batch logging: INS_LOG_BAT_MASK 1 (first IMU), INS_LOG_BAT_OPT 0 pre-filter,
 *   back to 0 afterwards to free RAM.
 * What the pages leave open and this file decides: the FREQ margin below hover
 * (30%), the hover window (10 s of steady throttle) and the peak search band.
 */
import { computeSpectrum, estimateSampleRate, resampleUniform, type Spectrum } from '../logs/log-fft';
import type { LogColumns } from '../../utils/log-columns';

export type NotchCase = 'esc' | 'fft' | 'thr';

export interface NotchWrite {
  name: string;
  value: number;
  /** Key under mavlink-config:quickSetup.vibration.why */
  whyKey: string;
}

/** FREQ sits this far below the hover frequency so the notch still covers a light load. */
export const FREQ_BELOW_HOVER = 0.7;
/** FREQ never drops under this multiple of INS_GYRO_FILTER, the page's lower bound. */
export const FREQ_ABOVE_GYRO_FILTER = 1.25;
export const DEFAULT_GYRO_FILTER_HZ = 20;
export const MIN_HOVER_S = 10;
/** One notch per motor (INS_HNTCH_OPTS bit 1). */
export const OPTS_PER_MOTOR = 2;
export const MODE_THROTTLE = 1;
export const MODE_ESC = 3;
export const MODE_FFT = 4;
export const BAT_OPT_PRE_FILTER = 0;

/** Which way the filter can find the motor frequency on this vehicle. */
export function detectNotchCase(input: {
  has: (name: string) => boolean;
  get: (name: string) => number | undefined;
  /** Motors whose ESC reported telemetry recently. */
  escMotors: number;
}): NotchCase {
  const bdshot = (input.get('SERVO_BLH_BDMASK') ?? 0) !== 0;
  if (input.escMotors > 0 || bdshot) return 'esc';
  if (input.has('FFT_ENABLE')) return 'fft';
  return 'thr';
}

/** What to stage before the hover. The MODE parameters only exist after ENABLE and a reboot. */
export function notchSetupWrites(kase: NotchCase, input: { has: (name: string) => boolean; get: (name: string) => number | undefined; perMotor: boolean }): NotchWrite[] {
  const out: NotchWrite[] = [];
  const enable = { name: 'INS_HNTCH_ENABLE', value: 1, whyKey: 'enable' };
  if (!input.has('INS_HNTCH_MODE')) return [enable];
  if (kase === 'thr') {
    out.push({ name: 'INS_LOG_BAT_MASK', value: 1, whyKey: 'batMask' }, { name: 'INS_LOG_BAT_OPT', value: BAT_OPT_PRE_FILTER, whyKey: 'batOpt' });
  }
  if (kase === 'fft') out.push({ name: 'FFT_ENABLE', value: 1, whyKey: 'fft' });
  out.push(enable);
  out.push({ name: 'INS_HNTCH_MODE', value: kase === 'esc' ? MODE_ESC : kase === 'fft' ? MODE_FFT : MODE_THROTTLE, whyKey: `mode-${kase}` });
  if (kase !== 'thr') out.push({ name: 'INS_HNTCH_REF', value: 1, whyKey: 'refOne' });
  if (kase === 'esc' && input.perMotor && input.has('INS_HNTCH_OPTS')) {
    out.push({ name: 'INS_HNTCH_OPTS', value: (input.get('INS_HNTCH_OPTS') ?? 0) | OPTS_PER_MOTOR, whyKey: 'perMotor' });
  }
  if (kase !== 'thr') {
    out.push({ name: 'INS_LOG_BAT_MASK', value: 1, whyKey: 'batMaskCheck' }, { name: 'INS_LOG_BAT_OPT', value: BAT_OPT_PRE_FILTER, whyKey: 'batOpt' });
  }
  return out;
}

/** The notch reference frequency and bandwidth once the hover frequency is known. */
export function notchFrequencyWrites(kase: NotchCase, hoverHz: number, input: { gyroFilterHz?: number; perMotor: boolean; hoverThrottle?: number }): NotchWrite[] {
  const gyro = input.gyroFilterHz && input.gyroFilterHz > 0 ? input.gyroFilterHz : DEFAULT_GYRO_FILTER_HZ;
  const out: NotchWrite[] = [];
  if (kase === 'fft') return [{ name: 'INS_LOG_BAT_MASK', value: 0, whyKey: 'batOff' }];
  const freq = kase === 'esc'
    ? Math.round(Math.max(hoverHz * FREQ_BELOW_HOVER, gyro * FREQ_ABOVE_GYRO_FILTER))
    : Math.round(hoverHz);
  out.push({ name: 'INS_HNTCH_FREQ', value: freq, whyKey: kase === 'esc' ? 'freqBelowHover' : 'freqFromLog' });
  const ratio = kase === 'esc' && input.perMotor ? 4 : 2;
  out.push({ name: 'INS_HNTCH_BW', value: Math.max(1, Math.round(freq / ratio)), whyKey: ratio === 4 ? 'bwQuarter' : 'bwHalf' });
  if (kase === 'thr' && input.hoverThrottle !== undefined) {
    out.push({ name: 'INS_HNTCH_REF', value: Math.round(input.hoverThrottle * 1000) / 1000, whyKey: 'refHover' });
  }
  out.push({ name: 'INS_LOG_BAT_MASK', value: 0, whyKey: 'batOff' });
  return out;
}

export interface HoverWindow {
  startS: number;
  endS: number;
  /** Mean throttle 0..1 over the window. */
  throttle: number;
}

/**
 * Longest stretch of steady throttle: at least MIN_HOVER_S, throttle above
 * 0.1 and within 15% of its running median. CTUN.ThO on Copter, QTUN.ThO on a
 * QuadPlane.
 */
export function findHoverWindow(timesS: ArrayLike<number>, throttle: ArrayLike<number>, minS = MIN_HOVER_S): HoverWindow | null {
  const n = Math.min(timesS.length, throttle.length);
  if (n < 2) return null;
  let best: HoverWindow | null = null;
  let start = 0;
  const flush = (end: number) => {
    if (end - start < 2) return;
    const span = timesS[end - 1]! - timesS[start]!;
    if (span < minS) return;
    let sum = 0;
    for (let i = start; i < end; i++) sum += throttle[i]!;
    const w = { startS: timesS[start]!, endS: timesS[end - 1]!, throttle: sum / (end - start) };
    if (!best || w.endS - w.startS > best.endS - best.startS) best = w;
  };
  let ref = throttle[0]!;
  for (let i = 0; i < n; i++) {
    const v = throttle[i]!;
    const steady = v > 0.1 && Math.abs(v - ref) <= ref * 0.15;
    if (!steady) { flush(i); start = i; ref = v; continue; }
    // the reference drifts with the window so a slow descent does not cut it
    ref = ref * 0.98 + v * 0.02;
  }
  flush(n);
  return best;
}

export interface GyroSeries {
  timesS: Float64Array;
  values: Float64Array;
  rateHz: number;
}

/** Parse one ISBD array field ("1,2,3") into numbers scaled by the batch multiplier. */
function parseBatch(s: string, mul: number): number[] {
  if (!s) return [];
  const out = s.split(',');
  const nums = new Array<number>(out.length);
  for (let i = 0; i < out.length; i++) nums[i] = Number(out[i]) / mul;
  return nums;
}

/**
 * Gyro X batches of the first IMU from the batch sampler (ISBH + ISBD), as
 * separate uniformly sampled runs. Pre or post filter depends on
 * INS_LOG_BAT_OPT at the time of the flight; the caller reads that from the
 * log's PARM messages.
 */
export function batchGyroRuns(isbh: LogColumns | undefined, isbd: LogColumns | undefined, axis: 'x' | 'y' | 'z' = 'x'): GyroSeries[] {
  if (!isbh || !isbd) return [];
  const type = isbh.num.type; const inst = isbh.num.instance; const n = isbh.num.N; const mul = isbh.num.mul; const rate = isbh.num.smp_rate;
  if (!type || !inst || !n || !mul || !rate) return [];
  const headers = new Map<number, { t0: number; mul: number; rate: number }>();
  for (let i = 0; i < isbh.count; i++) {
    if (type[i] !== 1 || inst[i] !== 0) continue;
    headers.set(n[i]!, { t0: isbh.timeUs[i]! / 1e6, mul: mul[i]! || 1, rate: rate[i]! });
  }
  const dn = isbd.num.N; const seq = isbd.num.seqno; const data = isbd.txt[axis];
  if (!dn || !seq || !data) return [];
  const samples = new Map<number, Array<[number, number[]]>>();
  for (let i = 0; i < isbd.count; i++) {
    const h = headers.get(dn[i]!);
    if (!h) continue;
    const list = samples.get(dn[i]!) ?? [];
    list.push([seq[i]!, parseBatch(data[i] ?? '', h.mul)]);
    samples.set(dn[i]!, list);
  }
  const out: GyroSeries[] = [];
  for (const [batch, parts] of samples) {
    const h = headers.get(batch)!;
    parts.sort((a, b) => a[0] - b[0]);
    const values = Float64Array.from(parts.flatMap((p) => p[1]));
    if (values.length < 64 || !(h.rate > 0)) continue;
    const timesS = new Float64Array(values.length);
    for (let i = 0; i < values.length; i++) timesS[i] = h.t0 + i / h.rate;
    out.push({ timesS, values, rateHz: h.rate });
  }
  return out;
}

/** One uniformly sampled run from a per-sample message (IMU or GYR), first instance only. */
export function messageGyroRun(cols: LogColumns | undefined, field = 'GyrX'): GyroSeries | null {
  if (!cols) return null;
  const v = cols.num[field];
  if (!v) return null;
  const instKey = ['I', 'Instance'].find((k) => cols.num[k] !== undefined);
  const inst = instKey ? cols.num[instKey] : undefined;
  const times: number[] = []; const values: number[] = [];
  for (let i = 0; i < cols.count; i++) {
    if (inst && inst[i] !== 0) continue;
    times.push(cols.timeUs[i]! / 1e6); values.push(v[i]!);
  }
  if (times.length < 128) return null;
  const rateHz = estimateSampleRate(times);
  if (!rateHz) return null;
  const uniform = resampleUniform(times, values, rateHz);
  const timesS = new Float64Array(uniform.length);
  for (let i = 0; i < uniform.length; i++) timesS[i] = times[0]! + i / rateHz;
  return { timesS, values: uniform, rateHz };
}

/** Spectrum of the runs inside a time window, averaged bin by bin. */
export function windowSpectrum(runs: GyroSeries[], window: { startS: number; endS: number } | null): Spectrum | null {
  const specs: Spectrum[] = [];
  for (const r of runs) {
    let a = 0; let b = r.values.length;
    if (window) {
      a = Math.max(0, Math.ceil((window.startS - r.timesS[0]!) * r.rateHz));
      b = Math.min(r.values.length, Math.floor((window.endS - r.timesS[0]!) * r.rateHz));
    }
    if (b - a < 64) continue;
    const s = computeSpectrum(r.values.subarray(a, b), r.rateHz, { maxSegLen: 1024 });
    if (s) specs.push(s);
  }
  if (specs.length === 0) return null;
  const len = Math.min(...specs.map((s) => s.freqHz.length));
  const amplitude = new Float64Array(len);
  for (const s of specs) for (let i = 0; i < len; i++) amplitude[i]! += s.amplitude[i]! / specs.length;
  const base = specs[0]!;
  return { freqHz: base.freqHz.slice(0, len), amplitude, segLen: base.segLen, segments: specs.reduce((n, s) => n + s.segments, 0), resolutionHz: base.resolutionHz };
}

/** Strongest bin between lowHz and highHz: the motor's hover frequency. */
export function peakBetween(spec: Spectrum, lowHz: number, highHz: number): { hz: number; amplitude: number } | null {
  let best = -1;
  for (let i = 0; i < spec.freqHz.length; i++) {
    const f = spec.freqHz[i]!;
    if (f < lowHz || f > highHz) continue;
    if (best < 0 || spec.amplitude[i]! > spec.amplitude[best]!) best = i;
  }
  return best < 0 ? null : { hz: spec.freqHz[best]!, amplitude: spec.amplitude[best]! };
}

/** How much the band around the peak dropped from before to after, in dB. */
export function cutDb(before: Spectrum, after: Spectrum, peakHz: number, bwHz: number): number | null {
  const band = (s: Spectrum) => {
    let sum = 0; let n = 0;
    for (let i = 0; i < s.freqHz.length; i++) {
      const f = s.freqHz[i]!;
      if (f < peakHz - bwHz / 2 || f > peakHz + bwHz / 2) continue;
      sum += s.amplitude[i]!; n++;
    }
    return n ? sum / n : null;
  };
  const b = band(before); const a = band(after);
  if (b === null || a === null || b <= 0 || a <= 0) return null;
  return 20 * Math.log10(b / a);
}
