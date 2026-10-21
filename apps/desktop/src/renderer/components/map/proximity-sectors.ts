import type { DistanceSensorData } from '../../../shared/telemetry-types';

/** A distance reading older than this is a sensor that stopped, not a distance. */
export const SENSOR_STALE_MS = 2000;
export const PROX_RED_M = 2;
export const PROX_AMBER_M = 5;
export const PROXIMITY_SECTOR_COUNT = 8;
export const PROXIMITY_SECTOR_DEG = 360 / PROXIMITY_SECTOR_COUNT;

export type ProximityTone = 'red' | 'amber' | 'green';

export interface ProximitySector {
  /** MAV_SENSOR_ORIENTATION yaw sector, 0 = nose, clockwise. */
  index: number;
  /** Obstacle distance in metres; null when the sector is clear or silent. */
  distance: number | null;
  /** Sensor range in metres; null until the sector has ever reported. */
  max: number | null;
  /** 0 = touching, 1 = at the sensor's range; null when clear. */
  fraction: number | null;
}

export function proximityReadingLive(d: DistanceSensorData | undefined, now: number, linkUp: boolean): boolean {
  return linkUp && d !== undefined && now - d.receivedAt < SENSOR_STALE_MS;
}

/** A reading at (or past) the sensor's range means nothing in that sector. */
export function proximityObstacle(d: DistanceSensorData | undefined, now: number, linkUp: boolean): number | null {
  return proximityReadingLive(d, now, linkUp) && d!.distance < d!.max - 0.01 ? d!.distance : null;
}

export function resolveProximitySectors(
  proximity: Record<number, DistanceSensorData>,
  now: number,
  linkUp: boolean,
): ProximitySector[] {
  return Array.from({ length: PROXIMITY_SECTOR_COUNT }, (_, index) => {
    const d = proximity[index];
    const distance = proximityObstacle(d, now, linkUp);
    const max = d && d.max > 0 ? d.max : null;
    const fraction = distance !== null && max !== null ? Math.max(0, Math.min(1, distance / max)) : null;
    return { index, distance, max, fraction };
  });
}

/** True while any sector (up included) is still reporting. */
export function proximityAnyLive(proximity: Record<number, DistanceSensorData>, now: number, linkUp: boolean): boolean {
  return Object.values(proximity).some((d) => proximityReadingLive(d, now, linkUp));
}

export function proximityTone(distance: number): ProximityTone {
  return distance <= PROX_RED_M ? 'red' : distance <= PROX_AMBER_M ? 'amber' : 'green';
}

export function closestProximitySector(sectors: ProximitySector[]): ProximitySector | null {
  return sectors.reduce<ProximitySector | null>(
    (best, s) => (s.distance !== null && (!best || s.distance < best.distance!) ? s : best),
    null,
  );
}

const EARTH_RADIUS_M = 6371000;

export function destinationLatLng(lat: number, lon: number, bearingDeg: number, distanceM: number): [number, number] {
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const ad = distanceM / EARTH_RADIUS_M;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ad) + Math.cos(lat1) * Math.sin(ad) * Math.cos(br));
  const lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(ad) * Math.cos(lat1), Math.cos(ad) - Math.sin(lat1) * Math.sin(lat2));
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

/** Points along an arc of real metres around a position, for a map polyline. */
export function sectorArcLatLngs(
  lat: number,
  lon: number,
  centreBearingDeg: number,
  radiusM: number,
  halfWidthDeg: number,
  steps = 8,
): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const b = centreBearingDeg - halfWidthDeg + (2 * halfWidthDeg * i) / steps;
    return destinationLatLng(lat, lon, b, radiusM);
  });
}
