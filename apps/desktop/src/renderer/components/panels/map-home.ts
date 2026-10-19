import { useMapHomeStore } from '../map/instruments/registry';
import { useTelemetryStore } from '../../stores/telemetry-store';

/**
 * The map home to start from: the one this map had before it was last unmounted.
 * A view switch remounts the map, and starting empty made the next GPS fix (in flight: the aircraft) home.
 */
export function initialMapHome(): [number, number] | null {
  // never the planned home: a mission planned elsewhere put home kilometres from the aircraft
  return useMapHomeStore.getState().home;
}

/** Seed home from a fix only on the ground: once armed, the aircraft's position is not home. */
export function seedHome(prev: [number, number] | null, fix: [number, number]): [number, number] | null {
  if (prev) return prev;
  return useTelemetryStore.getState().flight.armed ? null : fix;
}

