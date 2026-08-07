import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

/**
 * Shutdown has to leave nothing holding the physics port.
 *
 * `ardudeck-sim-engine` is a separate child process and it was the one thing spawned by this
 * app that shutdown never reaped. Closing the window left it running and holding UDP 9002,
 * which exactly one process can own, so the Trainer could no longer start its own flight
 * controller. The only symptom was a refusal to launch blamed on an application that was not
 * even on screen, and it cost three blocked launches in one session before anyone looked at
 * the process list.
 *
 * The escalation is tested rather than the wiring, because "we sent SIGTERM" is not the same
 * claim as "it is gone", and it was precisely that gap that let the orphan survive: `stop()`
 * schedules SIGKILL 1500 ms later, and `app.exit(0)` runs long before that fires.
 */

class FakeProc extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  readonly signals: string[] = [];
  /** A process that ignores SIGTERM, which is the case the grace period exists for. */
  constructor(private readonly diesOnTerm: boolean) {
    super();
  }
  kill(signal: string): boolean {
    this.signals.push(signal);
    if (signal === 'SIGTERM' && this.diesOnTerm) this.finish('SIGTERM');
    if (signal === 'SIGKILL') this.finish('SIGKILL');
    return true;
  }
  private finish(signal: string): void {
    this.signalCode = signal;
    setTimeout(() => this.emit('exit', null, signal), 0);
  }
}

/** The escalation, extracted so it can be exercised without spawning anything. */
async function stopAndWait(proc: FakeProc, graceMs: number): Promise<void> {
  proc.kill('SIGTERM');
  if (proc.exitCode !== null || proc.signalCode !== null) {
    // Still wait for the exit event, so "gone" means gone.
    await new Promise<void>((r) => proc.once('exit', () => r()));
    return;
  }
  const died = await new Promise<boolean>((resolve) => {
    const t = setTimeout(() => resolve(false), graceMs);
    proc.once('exit', () => {
      clearTimeout(t);
      resolve(true);
    });
  });
  if (died) return;
  proc.kill('SIGKILL');
}

describe('reaping the flight model at shutdown', () => {
  it('asks politely first, and stops there when that works', async () => {
    const proc = new FakeProc(true);
    await stopAndWait(proc, 50);
    expect(proc.signals).toEqual(['SIGTERM']);
    expect(proc.signalCode).toBe('SIGTERM');
  });

  /// The case that produced the orphan: SIGTERM ignored, and the app exits before the delayed
  /// SIGKILL ever fires. Waiting is the whole fix.
  it('escalates to SIGKILL when the engine ignores SIGTERM', async () => {
    vi.useFakeTimers();
    const proc = new FakeProc(false);
    const done = stopAndWait(proc, 800);
    await vi.advanceTimersByTimeAsync(900);
    await done;
    vi.useRealTimers();
    expect(proc.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(proc.signalCode).toBe('SIGKILL');
  });

  it('does not return until the process has actually exited', async () => {
    const proc = new FakeProc(true);
    let finished = false;
    const done = stopAndWait(proc, 50).then(() => {
      finished = true;
    });
    // Not before the exit event, or shutdown would race `app.exit(0)` and leave it alive.
    expect(finished).toBe(false);
    await done;
    expect(finished).toBe(true);
  });
});
