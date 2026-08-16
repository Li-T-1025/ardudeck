import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initMavlinkCalibration,
  startMavlinkCalibration,
  cancelMavlinkCalibration,
  confirmMavlinkPosition,
  handleCalibrationStatusText,
  handleCalibrationCommandAck,
  handleIncomingCommandLong,
  type MavlinkCalibrationDeps,
} from './mavlink-calibration.js';
import type {
  CalibrationCompleteEvent,
  CalibrationProgressEvent,
} from '../../shared/calibration-types.js';

const MAV_CMD_PREFLIGHT_CALIBRATION = 241;
const MAV_CMD_ACCELCAL_VEHICLE_POS = 42429;

function makeDeps() {
  const commands: Array<{ command: number; params: Record<string, number> }> = [];
  const progress: CalibrationProgressEvent[] = [];
  const complete: CalibrationCompleteEvent[] = [];
  const deps: MavlinkCalibrationDeps = {
    sendCommandLong: vi.fn(async (command, params) => {
      commands.push({ command, params });
      return true;
    }),
    sendCommandAck: vi.fn(async () => true),
    sendLog: vi.fn(),
    sendProgress: vi.fn((e) => progress.push(e)),
    sendComplete: vi.fn((e) => complete.push(e)),
  };
  return { deps, commands, progress, complete };
}

describe('PX4 calibration', () => {
  let ctx: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    ctx = makeDeps();
    initMavlinkCalibration(ctx.deps);
  });

  afterEach(() => {
    cancelMavlinkCalibration();
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it('uses PREFLIGHT_CALIBRATION with the correct param slot per type', async () => {
    const cases: Array<[Parameters<typeof startMavlinkCalibration>[0], keyof Record<string, number>, number]> = [
      ['gyro', 'param1', 1],
      ['compass', 'param2', 1],
      ['accel-6point', 'param5', 1],
      ['accel-level', 'param5', 2],
    ];
    for (const [type, slot, value] of cases) {
      await startMavlinkCalibration(type, 'px4');
      const sent = ctx.commands.at(-1)!;
      expect(sent.command).toBe(MAV_CMD_PREFLIGHT_CALIBRATION);
      expect(sent.params[slot]).toBe(value);
      // Every other param slot stays zero, PX4 treats non-zero slots as
      // additional calibration requests.
      for (const [k, v] of Object.entries(sent.params)) {
        if (k !== slot) expect(v).toBe(0);
      }
      cancelMavlinkCalibration();
    }
  });

  it('does NOT treat ACK ACCEPTED as completion (PX4 runs async, unlike ArduPilot)', async () => {
    await startMavlinkCalibration('gyro', 'px4');
    handleCalibrationCommandAck(MAV_CMD_PREFLIGHT_CALIBRATION, 0);
    expect(ctx.complete).toHaveLength(0);
    // Completion only via [cal] calibration done
    handleCalibrationStatusText('[cal] calibration done: gyro', 6);
    expect(ctx.complete).toEqual([{ type: 'gyro', success: true }]);
  });

  it('fails on ACK DENIED with a user-actionable message', async () => {
    await startMavlinkCalibration('compass', 'px4');
    handleCalibrationCommandAck(MAV_CMD_PREFLIGHT_CALIBRATION, 2);
    expect(ctx.complete).toHaveLength(1);
    expect(ctx.complete[0]!.success).toBe(false);
    expect(ctx.complete[0]!.error).toMatch(/disarmed/i);
  });

  it('shows only the vehicle-reported progress percentage', async () => {
    await startMavlinkCalibration('compass', 'px4');
    handleCalibrationStatusText('[cal] calibration started: 2 mag', 6);
    handleCalibrationStatusText('[cal] progress <20>', 6);
    handleCalibrationStatusText('[cal] progress <45>', 6);
    const pcts = ctx.progress.map((p) => p.progress);
    expect(pcts).toContain(20);
    expect(pcts).toContain(45);
    // Regression guard: no synthetic time-based values between the real ones.
    expect(Math.max(...pcts)).toBe(45);
  });

  it('tracks side detection and completion through the 6-position UI mapping', async () => {
    await startMavlinkCalibration('accel-6point', 'px4');
    handleCalibrationStatusText('[cal] calibration started: 2 accel', 6);
    handleCalibrationStatusText('[cal] down orientation detected', 6);
    let last = ctx.progress.at(-1)!;
    expect(last.currentPosition).toBe(0);
    handleCalibrationStatusText('[cal] down side done, rotate to a different side', 6);
    last = ctx.progress.at(-1)!;
    expect(last.positionStatus![0]).toBe(true);
    handleCalibrationStatusText('[cal] front orientation detected', 6);
    last = ctx.progress.at(-1)!;
    expect(last.currentPosition).toBe(3); // front = nose down
    // PX4 auto-detects: no status text may trigger the ArduPilot confirm
    // button, which keys off the exact "Place vehicle" prefix.
    for (const p of ctx.progress) {
      expect(p.statusText.startsWith('Place vehicle')).toBe(false);
    }
  });

  it('rejects manual position confirmation on PX4', async () => {
    await startMavlinkCalibration('accel-6point', 'px4');
    const res = await confirmMavlinkPosition(0);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/automatically/i);
  });

  it('ignores ArduPilot ACCELCAL position requests while a PX4 cal is active', async () => {
    await startMavlinkCalibration('accel-6point', 'px4');
    const before = ctx.progress.length;
    handleIncomingCommandLong(MAV_CMD_ACCELCAL_VEHICLE_POS, 1);
    // PX4 never sends these; if one arrives it is stray traffic, not protocol.
    expect(ctx.complete).toHaveLength(0);
    expect(ctx.progress.length).toBe(before);
  });

  it('fails with a clear error on [cal] calibration failed', async () => {
    await startMavlinkCalibration('compass', 'px4');
    handleCalibrationStatusText('[cal] calibration failed: timeout: no motion', 6);
    expect(ctx.complete).toHaveLength(1);
    expect(ctx.complete[0]!.success).toBe(false);
    expect(ctx.complete[0]!.error).toMatch(/timeout: no motion/);
  });

  it('times out a silent run, tells the vehicle to abort, and fails loudly', async () => {
    vi.useFakeTimers();
    await startMavlinkCalibration('compass', 'px4');
    const commandCountAfterStart = ctx.commands.length;
    vi.advanceTimersByTime(300_000);
    expect(ctx.complete).toHaveLength(1);
    expect(ctx.complete[0]!.success).toBe(false);
    expect(ctx.complete[0]!.error).toMatch(/nothing was saved/i);
    // The abort is an all-zero PREFLIGHT_CALIBRATION (QGC convention).
    const abort = ctx.commands[commandCountAfterStart]!;
    expect(abort.command).toBe(MAV_CMD_PREFLIGHT_CALIBRATION);
    expect(Object.values(abort.params).every((v) => v === 0)).toBe(true);
  });

  it('never routes PX4 [cal] text through the ArduPilot matchers', async () => {
    await startMavlinkCalibration('compass', 'px4');
    // On ArduPilot this string would complete the cal via the generic
    // "calibration successful" matcher. On PX4 only "[cal] calibration done"
    // may complete.
    handleCalibrationStatusText('Calibration successful', 6);
    expect(ctx.complete).toHaveLength(0);
  });
});

describe('ArduPilot regressions from the honesty pass', () => {
  let ctx: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    ctx = makeDeps();
    initMavlinkCalibration(ctx.deps);
  });

  afterEach(() => {
    cancelMavlinkCalibration();
    vi.useRealTimers();
    vi.clearAllTimers();
  });

  it('emits no synthetic compass progress after start (vehicle numbers only)', async () => {
    vi.useFakeTimers();
    await startMavlinkCalibration('compass', 'ardupilot');
    const after = ctx.progress.length;
    vi.advanceTimersByTime(30_000);
    expect(ctx.progress.length).toBe(after); // nothing painted by timers
  });

  it('aggregates per-compass MAG_CAL_PROGRESS with the slowest compass as overall', async () => {
    const { handleMagCalProgress } = await import('./mavlink-calibration.js');
    await startMavlinkCalibration('compass', 'ardupilot');
    handleMagCalProgress(0, 1, 60);
    handleMagCalProgress(1, 1, 25);
    const last = ctx.progress.at(-1)!;
    expect(last.compassProgress).toEqual([60, 25]);
    expect(last.progress).toBe(25); // overall = lagging compass, not average
  });

  it('reports the 6-point silence fallback as unconfirmed, not success', async () => {
    vi.useFakeTimers();
    await startMavlinkCalibration('accel-6point', 'ardupilot');
    // FC requests each pose, GCS confirms it, all six.
    const AP_ORDER = [1, 2, 3, 4, 5, 6];
    for (let i = 0; i < 6; i++) {
      handleIncomingCommandLong(MAV_CMD_ACCELCAL_VEHICLE_POS, AP_ORDER[i]!);
      await confirmMavlinkPosition(i);
    }
    expect(ctx.complete).toHaveLength(0);
    vi.advanceTimersByTime(8_000);
    expect(ctx.complete).toHaveLength(1);
    expect(ctx.complete[0]!.success).toBe(true);
    expect(ctx.complete[0]!.unconfirmed).toBe(true);
  });
});
