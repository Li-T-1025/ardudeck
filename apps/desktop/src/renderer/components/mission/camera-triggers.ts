import { commandHasLocation, hasValidCoordinates, isNavigationCommand, MAV_CMD, type MissionItem } from '../../../shared/mission-types';
import { isReturnCommand, isTakeoffCommand } from './mission-end';
import { distanceM } from './mission-3d-geometry';

// The distance carries across corners: ArduPilot measures from the last shot, not from each waypoint.
export function computeCameraTriggerPoints(items: MissionItem[], maxPoints = 500): Array<{ lat: number; lng: number }> {
  type Leg = { a: MissionItem; b: MissionItem; spacing: number; restart: boolean; shootAtStart: boolean };
  const legs: Leg[] = [];
  let spacing = 0;
  let prev: MissionItem | null = null;
  let restart = true;
  let shootAtStart = false;
  for (const it of items) {
    if (it.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST) {
      spacing = it.param1 > 0 ? it.param1 : 0;
      restart = true;
      shootAtStart = spacing > 0 && it.param3 === 1;
      continue;
    }
    if (isReturnCommand(it.command) || isTakeoffCommand(it.command)) {
      prev = null;
      restart = true;
      continue;
    }
    if (!isNavigationCommand(it.command) || !commandHasLocation(it.command) || !hasValidCoordinates(it.latitude, it.longitude)) continue;
    if (prev && spacing > 0) {
      legs.push({ a: prev, b: it, spacing, restart, shootAtStart });
      restart = false;
      shootAtStart = false;
    }
    prev = it;
  }

  const estimate = legs.reduce((n, l) => n + distanceM(l.a.latitude, l.a.longitude, l.b.latitude, l.b.longitude) / l.spacing, 0);
  const thin = estimate > maxPoints ? Math.ceil(estimate / maxPoints) : 1;
  const out: Array<{ lat: number; lng: number }> = [];
  let sinceShot = 0;
  for (const l of legs) {
    const step = l.spacing * thin;
    if (l.restart) sinceShot = 0;
    if (l.shootAtStart) out.push({ lat: l.a.latitude, lng: l.a.longitude });
    const len = distanceM(l.a.latitude, l.a.longitude, l.b.latitude, l.b.longitude);
    let at = step - sinceShot;
    while (at <= len && out.length < maxPoints) {
      const t = len > 0 ? at / len : 0;
      out.push({ lat: l.a.latitude + (l.b.latitude - l.a.latitude) * t, lng: l.a.longitude + (l.b.longitude - l.a.longitude) * t });
      at += step;
    }
    sinceShot = len - (at - step);
  }
  return out;
}

/**
 * Waypoints (by seq) whose corner is flown with the camera triggering, on the leg in or out.
 * Only these can leave a coverage gap; a plain waypoint mission takes no photos.
 */
export function photographedSeqs(items: MissionItem[]): Set<number> {
  const sorted = [...items].sort((a, b) => a.seq - b.seq);
  const shootIn = new Map<number, boolean>();
  const order: number[] = [];
  let spacing = 0;
  let hasPrev = false;
  for (const it of sorted) {
    if (it.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST) {
      spacing = it.param1 > 0 ? it.param1 : 0;
      continue;
    }
    if (isReturnCommand(it.command) || isTakeoffCommand(it.command)) {
      hasPrev = false;
      order.push(-1);
      continue;
    }
    if (!isNavigationCommand(it.command) || !commandHasLocation(it.command) || !hasValidCoordinates(it.latitude, it.longitude)) continue;
    shootIn.set(it.seq, hasPrev && spacing > 0);
    order.push(it.seq);
    hasPrev = true;
  }
  const out = new Set<number>();
  order.forEach((seq, i) => {
    if (seq < 0) return;
    const next = order[i + 1];
    if (shootIn.get(seq) || (next !== undefined && next >= 0 && shootIn.get(next))) out.add(seq);
  });
  return out;
}
