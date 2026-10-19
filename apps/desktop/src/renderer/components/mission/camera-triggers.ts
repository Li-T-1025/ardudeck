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
