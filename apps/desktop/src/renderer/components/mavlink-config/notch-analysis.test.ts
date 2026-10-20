import { describe, it, expect } from 'vitest';
import {
  batchGyroRuns, cutDb, detectNotchCase, findHoverWindow, notchFrequencyWrites, notchSetupWrites, peakBetween, windowSpectrum,
} from './notch-analysis';
import type { LogColumns } from '../../utils/log-columns';

const params = (values: Record<string, number>) => ({
  has: (n: string) => n in values,
  get: (n: string) => values[n],
});

describe('which way the filter finds the motor frequency', () => {
  it('prefers ESC telemetry, then the board FFT, then throttle', () => {
    expect(detectNotchCase({ ...params({ FFT_ENABLE: 0 }), escMotors: 4 })).toBe('esc');
    expect(detectNotchCase({ ...params({ SERVO_BLH_BDMASK: 15 }), escMotors: 0 })).toBe('esc');
    expect(detectNotchCase({ ...params({ FFT_ENABLE: 0 }), escMotors: 0 })).toBe('fft');
    expect(detectNotchCase({ ...params({}), escMotors: 0 })).toBe('thr');
  });
});

describe('what is staged before the hover', () => {
  it('only enables the notch when its mode parameters are not on the board yet', () => {
    expect(notchSetupWrites('esc', { ...params({}), perMotor: true }).map((w) => w.name)).toEqual(['INS_HNTCH_ENABLE']);
  });

  it('follows the ESC telemetry page: mode 3, ref 1, one notch per motor', () => {
    const w = notchSetupWrites('esc', { ...params({ INS_HNTCH_MODE: 1, INS_HNTCH_OPTS: 16 }), perMotor: true });
    const v = Object.fromEntries(w.map((x) => [x.name, x.value]));
    expect(v).toMatchObject({ INS_HNTCH_ENABLE: 1, INS_HNTCH_MODE: 3, INS_HNTCH_REF: 1, INS_HNTCH_OPTS: 18, INS_LOG_BAT_MASK: 1, INS_LOG_BAT_OPT: 0 });
  });

  it('follows the FFT page: FFT_ENABLE, mode 4, ref 1', () => {
    const v = Object.fromEntries(notchSetupWrites('fft', { ...params({ INS_HNTCH_MODE: 1 }), perMotor: false }).map((x) => [x.name, x.value]));
    expect(v).toMatchObject({ FFT_ENABLE: 1, INS_HNTCH_MODE: 4, INS_HNTCH_REF: 1 });
  });

  it('throttle mode records pre-filter gyro batches first', () => {
    const v = Object.fromEntries(notchSetupWrites('thr', { ...params({ INS_HNTCH_MODE: 1 }), perMotor: false }).map((x) => [x.name, x.value]));
    expect(v).toMatchObject({ INS_LOG_BAT_MASK: 1, INS_LOG_BAT_OPT: 0, INS_HNTCH_MODE: 1 });
    expect(v.INS_HNTCH_REF).toBeUndefined();
  });
});

describe('frequency and bandwidth from the hover', () => {
  it('ESC mode sits below hover, above the gyro filter, bandwidth a quarter per motor', () => {
    const v = Object.fromEntries(notchFrequencyWrites('esc', 112, { gyroFilterHz: 20, perMotor: true }).map((x) => [x.name, x.value]));
    expect(v.INS_HNTCH_FREQ).toBe(78);
    expect(v.INS_HNTCH_BW).toBe(20);
    expect(v.INS_LOG_BAT_MASK).toBe(0);
  });

  it('never drops under the gyro filter', () => {
    const v = Object.fromEntries(notchFrequencyWrites('esc', 40, { gyroFilterHz: 40, perMotor: false }).map((x) => [x.name, x.value]));
    expect(v.INS_HNTCH_FREQ).toBe(50);
    expect(v.INS_HNTCH_BW).toBe(25);
  });

  it('throttle mode takes the log peak, half bandwidth and the hover throttle as reference', () => {
    const v = Object.fromEntries(notchFrequencyWrites('thr', 97.6, { perMotor: false, hoverThrottle: 0.2234 }).map((x) => [x.name, x.value]));
    expect(v).toMatchObject({ INS_HNTCH_FREQ: 98, INS_HNTCH_BW: 49, INS_HNTCH_REF: 0.223, INS_LOG_BAT_MASK: 0 });
  });

  it('FFT mode only switches the batch logging off again', () => {
    expect(notchFrequencyWrites('fft', 100, { perMotor: false }).map((x) => x.name)).toEqual(['INS_LOG_BAT_MASK']);
  });
});

describe('finding the hover in a flight', () => {
  const flight = () => {
    const t: number[] = []; const tho: number[] = [];
    for (let s = 0; s < 120; s += 0.1) {
      t.push(s);
      // climb, a 40 s hover at 0.3, a descent, a short hover
      tho.push(s < 20 ? 0.6 : s < 60 ? 0.3 + Math.sin(s) * 0.01 : s < 80 ? 0.15 : s < 86 ? 0.3 : 0);
    }
    return { t, tho };
  };

  it('picks the longest steady stretch and reports its throttle', () => {
    const { t, tho } = flight();
    const w = findHoverWindow(t, tho)!;
    expect(w.startS).toBeCloseTo(20, 0);
    expect(w.endS).toBeCloseTo(60, 0);
    expect(w.throttle).toBeCloseTo(0.3, 1);
  });

  it('returns null when nothing lasts long enough', () => {
    expect(findHoverWindow([0, 1, 2, 3], [0.3, 0.3, 0.3, 0.3])).toBeNull();
  });
});

/** Batch columns with a 1 kHz gyro tone at `hz` of amplitude `amp` plus noise. */
function batchColumns(hz: number, amp: number, batches = 4): { isbh: LogColumns; isbd: LogColumns } {
  const rate = 1000; const mul = 1000; const perBatch = 1024;
  const h = { count: batches, timeUs: new Float64Array(batches), num: { N: new Float64Array(batches), type: new Float64Array(batches), instance: new Float64Array(batches), mul: new Float64Array(batches), smp_cnt: new Float64Array(batches), smp_rate: new Float64Array(batches) }, txt: {} };
  const rows = batches * (perBatch / 32);
  const d = { count: rows, timeUs: new Float64Array(rows), num: { N: new Float64Array(rows), seqno: new Float64Array(rows) }, txt: { x: [] as string[], y: [] as string[], z: [] as string[] } };
  let r = 0;
  for (let b = 0; b < batches; b++) {
    const t0 = 10 + b * 5;
    h.timeUs[b] = t0 * 1e6; h.num.N[b] = b; h.num.type[b] = 1; h.num.instance[b] = 0; h.num.mul[b] = mul; h.num.smp_cnt[b] = perBatch; h.num.smp_rate[b] = rate;
    for (let s = 0; s < perBatch / 32; s++) {
      const xs: number[] = [];
      for (let i = 0; i < 32; i++) {
        const k = s * 32 + i;
        xs.push(Math.round((amp * Math.sin((2 * Math.PI * hz * k) / rate) + (Math.random() - 0.5) * 0.02) * mul));
      }
      d.timeUs[r] = (t0 + (s * 32) / rate) * 1e6; d.num.N[r] = b; d.num.seqno[r] = s;
      d.txt.x.push(xs.join(',')); d.txt.y.push(xs.join(',')); d.txt.z.push(xs.join(','));
      r++;
    }
  }
  return { isbh: h, isbd: d };
}

describe('batch sampler spectra', () => {
  it('finds the motor tone in ISBH/ISBD batches and measures the cut', () => {
    const before = batchColumns(112, 0.5);
    const after = batchColumns(112, 0.05);
    const runsB = batchGyroRuns(before.isbh, before.isbd);
    expect(runsB).toHaveLength(4);
    expect(runsB[0]!.rateHz).toBe(1000);
    const sb = windowSpectrum(runsB, { startS: 0, endS: 100 })!;
    const sa = windowSpectrum(batchGyroRuns(after.isbh, after.isbd), null)!;
    const peak = peakBetween(sb, 30, 500)!;
    expect(peak.hz).toBeCloseTo(112, -1);
    const db = cutDb(sb, sa, peak.hz, 20)!;
    expect(db).toBeGreaterThan(15);
    expect(db).toBeLessThan(25);
  });

  it('ignores batches outside the hover window', () => {
    const b = batchColumns(100, 0.5);
    expect(windowSpectrum(batchGyroRuns(b.isbh, b.isbd), { startS: 200, endS: 300 })).toBeNull();
  });
});
