/**
 * The renderer's picture of SITL after a relaunch it did not ask for.
 *
 * The sim handover endpoint moves the simulated take-off point by killing SITL
 * and respawning it with a new `-O`, entirely inside the main process. The
 * renderer only learns about that through IPC pushes, and when those were
 * missing it kept showing the old take-off point and, because the kill arrived
 * as a plain exit, insisted the simulator was stopped while it was flying.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  ArduPilotSitlExitData,
  ArduPilotSitlStartedData,
} from '../../shared/ipc-channels';
import { useArduPilotSitlStore } from './ardupilot-sitl-store';

type Listener<T> = (data: T) => void;

const ARDUDECK_HOME = { lat: 42.4411, lng: 19.2632, alt: 0, heading: 270 };
const GAME_REGION_HOME = { lat: 42.272228, lng: 19.123764, alt: 1.569, heading: 0 };

function startedData(over: Partial<ArduPilotSitlStartedData> = {}): ArduPilotSitlStartedData {
  return {
    homeLocation: GAME_REGION_HOME,
    vehicleType: 'copter',
    model: 'quad',
    releaseTrack: 'stable',
    pid: 62760,
    command: '/bin/arducopter -MJSON:127.0.0.1 -O42.272228,19.123764,1.569,0',
    ...over,
  };
}

function exitData(over: Partial<ArduPilotSitlExitData> = {}): ArduPilotSitlExitData {
  return { code: null, signal: 'SIGTERM', uptimeMs: 600_000, wasEarlyCrash: false, ...over };
}

describe('ArduPilot SITL store: relaunch at a new take-off point', () => {
  let onExit: Listener<ArduPilotSitlExitData>;
  let onStarted: Listener<ArduPilotSitlStartedData>;
  let cleanup: () => void;

  beforeEach(() => {
    vi.stubGlobal('window', {
      electronAPI: {
        ardupilotSitlCheckPlatform: async () => ({ supported: true, useDocker: false }),
        ardupilotSitlCheckBinary: async () => ({ exists: false }),
        ardupilotFlightGearDetect: async () => ({ installed: false }),
        ardupilotFlightGearStatus: async () => ({ running: false }),
        ardupilotFlightGearStop: async () => undefined,
        onArdupilotSitlStdout: () => () => {},
        onArdupilotSitlStderr: () => () => {},
        onArdupilotSitlError: () => () => {},
        onArdupilotSitlDownloadProgress: () => () => {},
        onArdupilotSitlExit: (cb: Listener<ArduPilotSitlExitData>) => {
          onExit = cb;
          return () => {};
        },
        onArdupilotSitlStarted: (cb: Listener<ArduPilotSitlStartedData>) => {
          onStarted = cb;
          return () => {};
        },
      },
    });

    useArduPilotSitlStore.setState({
      isRunning: true,
      isStarting: false,
      isStopping: false,
      homeLocation: ARDUDECK_HOME,
      crashRecovery: null,
      crashedFrameTracks: {},
      output: [],
    });
    cleanup = useArduPilotSitlStore.getState().initListeners();
  });

  afterEach(() => {
    cleanup?.();
    vi.unstubAllGlobals();
  });

  it('takes the new take-off point from the started push', () => {
    onStarted(startedData());
    const s = useArduPilotSitlStore.getState();
    // This is the whole point: the UI showed ArduDeck's own location after a
    // successful handover because nothing ever told the renderer it had moved.
    expect(s.homeLocation).toEqual(GAME_REGION_HOME);
    expect(s.isRunning).toBe(true);
  });

  it('keeps SITL running across an intentional relaunch', () => {
    onExit(exitData({ relaunching: true }));
    // Mid-relaunch: the process really is down for a second, but it is coming
    // straight back, and reporting "stopped" here is what made the UI disagree
    // with reality until something else resynced it.
    expect(useArduPilotSitlStore.getState().isRunning).toBe(true);

    onStarted(startedData({ wasRelaunch: true }));
    const s = useArduPilotSitlStore.getState();
    expect(s.isRunning).toBe(true);
    expect(s.isStarting).toBe(false);
    expect(s.homeLocation).toEqual(GAME_REGION_HOME);
  });

  it('offers no crash recovery for an intentional relaunch', () => {
    onExit(
      exitData({
        relaunching: true,
        signal: 'SIGKILL',
        uptimeMs: 900,
        wasEarlyCrash: true,
        vehicleType: 'copter',
        model: 'quad',
        releaseTrack: 'stable',
      }),
    );
    const s = useArduPilotSitlStore.getState();
    expect(s.crashRecovery).toBeNull();
    expect(s.crashedFrameTracks).toEqual({});
  });

  it('still reports a genuine crash as stopped', () => {
    onExit(exitData({ code: null, signal: 'SIGSEGV', uptimeMs: 900, wasEarlyCrash: true }));
    expect(useArduPilotSitlStore.getState().isRunning).toBe(false);
  });

  it('still reports an ordinary unexpected exit as stopped', () => {
    onExit(exitData({ code: 1, signal: null, uptimeMs: 60_000, wasEarlyCrash: false }));
    const s = useArduPilotSitlStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.isStarting).toBe(false);
    expect(s.isStopping).toBe(false);
  });

  it('still offers crash recovery for a real early crash', () => {
    onExit(
      exitData({
        signal: 'SIGILL',
        uptimeMs: 800,
        wasEarlyCrash: true,
        vehicleType: 'copter',
        model: 'octa',
        releaseTrack: 'stable',
      }),
    );
    const s = useArduPilotSitlStore.getState();
    expect(s.isRunning).toBe(false);
    expect(s.crashRecovery).toMatchObject({ kind: 'switch-track', model: 'octa' });
  });
});
