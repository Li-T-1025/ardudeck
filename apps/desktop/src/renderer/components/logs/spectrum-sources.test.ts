import { describe, it, expect } from 'vitest';
import { batchSpectra, listSources, messageSpectra, parseSourceKey, sourceKey } from './spectrum-sources';
import { peakIndex } from './log-fft';
import type { LogColumns } from '../../utils/log-columns';

/** Batch sampler columns: gyro and accel for `instances` IMUs, a tone at `hz` on every axis, 1 kHz. */
function batchLog(hz: number, amp: number, opts: { instances?: number; batches?: number; accel?: boolean } = {}) {
  const instances = opts.instances ?? 1; const batches = opts.batches ?? 4; const sensors = opts.accel ? [1, 0] : [1];
  const rate = 1000; const mul = 1000; const perBatch = 1024; const rowsPerBatch = perBatch / 32;
  const headers = batches * instances * sensors.length;
  const h: LogColumns = { count: headers, timeUs: new Float64Array(headers), num: { N: new Float64Array(headers), type: new Float64Array(headers), instance: new Float64Array(headers), mul: new Float64Array(headers), smp_cnt: new Float64Array(headers), smp_rate: new Float64Array(headers) }, txt: {} };
  const rows = headers * rowsPerBatch;
  const d: LogColumns = { count: rows, timeUs: new Float64Array(rows), num: { N: new Float64Array(rows), seqno: new Float64Array(rows) }, txt: { x: [], y: [], z: [] } };
  let n = 0; let r = 0;
  for (let b = 0; b < batches; b++) {
    for (const type of sensors) {
      for (let inst = 0; inst < instances; inst++) {
        const t0 = 10 + b * 5;
        // the second IMU carries a weaker tone so instances are distinguishable
        const a = amp / (inst + 1);
        h.timeUs[n] = t0 * 1e6; h.num.N![n] = n; h.num.type![n] = type; h.num.instance![n] = inst; h.num.mul![n] = mul; h.num.smp_cnt![n] = perBatch; h.num.smp_rate![n] = rate;
        for (let s = 0; s < rowsPerBatch; s++) {
          const xs: number[] = [];
          for (let i = 0; i < 32; i++) {
            const k = s * 32 + i;
            xs.push(Math.round((a * Math.sin((2 * Math.PI * hz * k) / rate) + (Math.random() - 0.5) * 0.02) * mul));
          }
          d.timeUs[r] = (t0 + (s * 32) / rate) * 1e6; d.num.N![r] = n; d.num.seqno![r] = s;
          d.txt.x!.push(xs.join(',')); d.txt.y!.push(xs.join(',')); d.txt.z!.push(xs.join(','));
          r++;
        }
        n++;
      }
    }
  }
  return { messageTypes: ['ISBH', 'ISBD'], messages: { ISBH: h, ISBD: d } };
}

/** A regular IMU message at `rate` Hz with a tone at `hz`. */
function imuLog(rate: number, hz: number, seconds = 20) {
  const count = rate * seconds;
  const cols: LogColumns = { count, timeUs: new Float64Array(count), num: { I: new Float64Array(count), GyrX: new Float64Array(count) }, txt: {} };
  for (let i = 0; i < count; i++) { cols.timeUs[i] = (i / rate) * 1e6; cols.num.GyrX![i] = Math.sin((2 * Math.PI * hz * i) / rate); }
  return { messageTypes: ['IMU'], messages: { IMU: cols } };
}

describe('spectrum sources', () => {
  it('lists the batch sampler first, gyro before accel, then the regular messages', () => {
    const log = { ...batchLog(100, 0.5, { accel: true }), ...{} };
    const imu = imuLog(25, 5);
    const merged = { messageTypes: [...imu.messageTypes, ...log.messageTypes], messages: { ...imu.messages, ...log.messages } };
    expect(listSources(merged).map(sourceKey)).toEqual(['batch:gyro', 'batch:accel', 'msg:IMU']);
    expect(listSources(imu).map(sourceKey)).toEqual(['msg:IMU']);
  });

  it('round-trips source keys', () => {
    expect(parseSourceKey('batch:accel')).toEqual({ kind: 'batch', sensor: 'accel' });
    expect(parseSourceKey('msg:GYR')).toEqual({ kind: 'msg', type: 'GYR' });
    expect(parseSourceKey('nope')).toBeNull();
  });
});

describe('batch sampler spectra', () => {
  it('reaches smp_rate / 2 and shows a 180 Hz tone at 180 Hz', () => {
    const log = batchLog(180, 0.5);
    const [s] = batchSpectra(log, 'gyro', 'x', null);
    expect(s).toBeDefined();
    expect(s!.rateHz).toBe(1000);
    expect(s!.spec.freqHz[s!.spec.freqHz.length - 1]!).toBeGreaterThan(490);
    expect(s!.spec.freqHz[peakIndex(s!.spec, 5)]).toBeCloseTo(180, 0);
    // Welch over the four batches
    expect(s!.spec.segments).toBe(4);
  });

  it('renders one spectrum per IMU instance and honours the axis', () => {
    const log = batchLog(120, 0.8, { instances: 2, accel: true });
    const gyro = batchSpectra(log, 'gyro', 'z', null);
    expect(gyro.map((s) => s.inst)).toEqual([0, 1]);
    const pk0 = peakIndex(gyro[0]!.spec, 5); const pk1 = peakIndex(gyro[1]!.spec, 5);
    expect(gyro[0]!.spec.freqHz[pk0]).toBeCloseTo(120, 0);
    expect(gyro[0]!.spec.amplitude[pk0]!).toBeGreaterThan(gyro[1]!.spec.amplitude[pk1]! * 1.5);
    expect(batchSpectra(log, 'accel', 'y', null)).toHaveLength(2);
  });

  it('follows the chart zoom window', () => {
    const log = batchLog(100, 0.5);
    expect(batchSpectra(log, 'gyro', 'x', { min: 14, max: 17 })).toHaveLength(1);
    expect(batchSpectra(log, 'gyro', 'x', { min: 14, max: 17 })[0]!.spec.segments).toBe(1);
    expect(batchSpectra(log, 'gyro', 'x', { min: 200, max: 300 })).toHaveLength(0);
  });
});

describe('regular message spectra', () => {
  it('stops at half the log rate, which is why a 25 Hz IMU log ends at 12.5 Hz', () => {
    const log = imuLog(25, 5);
    const [s] = messageSpectra(log.messages.IMU!, 'GyrX', null);
    expect(s!.rateHz).toBeCloseTo(25, 0);
    expect(s!.spec.freqHz[s!.spec.freqHz.length - 1]!).toBeLessThanOrEqual(12.5);
    expect(s!.spec.freqHz[peakIndex(s!.spec, 1)]).toBeCloseTo(5, 0);
  });
});
