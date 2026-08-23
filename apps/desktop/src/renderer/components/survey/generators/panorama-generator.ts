/**
 * Panorama / capture-line generator.
 *
 * The drawn line is the SUBJECT (a shoreline, cliff face, building frontage) -
 * NOT the flight path. The flight path is derived from it:
 *
 *   1. Offset the subject line sideways by the standoff distance (which side
 *      the aircraft flies on is the operator's choice).
 *   2. Fly it ONCE - no lawnmower lines, this is not area coverage.
 *   3. At every waypoint the camera yaw points back at the subject, so the
 *      gimbal holds the shoreline while the aircraft tracks the curve. The
 *      mission builder turns these into CONDITION_YAW commands.
 *   4. Photos trigger by distance so consecutive frames overlap for stitching;
 *      spacing derives from the horizontal footprint at the SLANT distance
 *      (standoff + altitude), reduced by the front overlap.
 *
 * The capture band shown on the map (`footprints`) is the strip of the world
 * around the subject line that fits in frame, so the pilot sees what will be
 * captured before flying.
 */
import type { SurveyConfig, SurveyResult, LatLng } from '../survey-types';
import { latLngToLocal, localToLatLng, simplifyPolygon } from '../geo-math';
import { corridorSwath, bezierSpline, type SplineTangent } from '../geo-edit';

type Pt = { x: number; y: number };

/** Offset an open polyline sideways. Positive = left of travel direction. */
function offsetPolyline(pts: Pt[], distance: number): Pt[] {
  const n = pts.length;
  if (n < 2) return [];
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    // Left normal of the travel direction.
    const nx = -dy / len;
    const ny = dx / len;
    out.push({ x: pts[i]!.x + nx * distance, y: pts[i]!.y + ny * distance });
  }
  return out;
}

function bearingDeg(from: Pt, to: Pt): number {
  // Compass bearing: 0 = north, clockwise.
  const deg = (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Cut self-intersection loops out of a polyline. Offsetting a curve whose
 * bend radius is tighter than the offset distance folds the offset line over
 * itself; the fold is replaced by its crossing point so the path never
 * doubles back (the zigzag artifact).
 */
function removeSelfIntersections(pts: Pt[]): Pt[] {
  const out = [...pts];
  const cross = (a: Pt, b: Pt, c: Pt, d: Pt): Pt | null => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denom = r.x * s.y - r.y * s.x;
    if (Math.abs(denom) < 1e-12) return null;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
    return { x: a.x + t * r.x, y: a.y + t * r.y };
  };
  for (let i = 0; i < out.length - 3; i++) {
    const windowEnd = Math.min(out.length - 1, i + 80);
    for (let j = i + 2; j < windowEnd; j++) {
      const p = cross(out[i]!, out[i + 1]!, out[j]!, out[j + 1]!);
      if (p) {
        out.splice(i + 1, j - i, p);
        break;
      }
    }
  }
  return out;
}

function nearestOnPolyline(p: Pt, line: Pt[]): Pt {
  let best = line[0]!;
  let bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

export function generatePanorama(config: SurveyConfig): SurveyResult {
  const subjectLatLng = config.polygon;
  const empty: SurveyResult = {
    waypoints: [], photoPositions: [], footprints: [],
    stats: { gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0, lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0, lineSpacing: 0, photoSpacing: 0 },
  };
  if (subjectLatLng.length < 2) return empty;

  const standoff = Math.max(1, config.panoramaStandoff ?? 30);
  // 'right' = aircraft flies right of the line in drawing direction, which is
  // a NEGATIVE offset along the left-normal used by offsetPolyline.
  const side = (config.panoramaSide ?? 'right') === 'right' ? -1 : 1;

  // The drawn vertices are spline anchors, not the path itself: the subject is
  // the Bezier curve through them, shaped by any user-dragged tangent handles
  // (untouched anchors use the smooth auto tangent). Offsetting sharp corners
  // by tens of meters would spike, so the dense curve is offset instead.
  const tangents: Array<SplineTangent | undefined> | undefined = config.panoramaTangents
    ? subjectLatLng.map((_, i) => config.panoramaTangents![i])
    : undefined;
  const smoothSubject = bezierSpline(subjectLatLng, tangents, 5);

  const origin = smoothSubject[0]!;
  const subject = smoothSubject.map((p) => latLngToLocal(origin, p));
  const rawOffset = offsetPolyline(subject, side * standoff);
  if (rawOffset.length < 2) return empty;
  // Concave bends tighter than the standoff fold the offset over itself: cut
  // the fold at its crossing, then drop any stragglers that still sit closer
  // to the subject than the standoff allows.
  const flightLocal = removeSelfIntersections(rawOffset).filter((p) => {
    const q = nearestOnPolyline(p, subject);
    return Math.hypot(q.x - p.x, q.y - p.y) >= standoff * 0.8;
  });
  if (flightLocal.length < 2) return empty;
  const flightLatLng = flightLocal.map((p) => localToLatLng(origin, p.x, p.y));

  // Waypoints: RDP over the flight path - endpoints kept, dense on curvature,
  // sparse on straights. 0.5 m keeps the flown path visually on the curve.
  const waypoints = simplifyPolygon(flightLatLng, 0.5);
  const wpLocal = waypoints.map((p) => latLngToLocal(origin, p));
  // Look-at target per waypoint: the nearest subject point. These become
  // ROI commands in the mission so the aircraft tracks the subject
  // CONTINUOUSLY between waypoints instead of stepping its yaw at each one.
  const lookAtLocal = wpLocal.map((wp) => nearestOnPolyline(wp, subject));
  const waypointLookAts = lookAtLocal.map((p) => localToLatLng(origin, p.x, p.y));
  const waypointYaws = wpLocal.map((wp, i) => bearingDeg(wp, lookAtLocal[i]!));

  // Camera geometry at the SLANT distance to the subject: the camera looks
  // sideways-down, so the frame size is set by range, not altitude alone.
  const slant = Math.hypot(standoff, config.altitude);
  const cam = config.camera;
  const footprintWidth = (cam.sensorWidth / cam.focalLength) * slant;
  const footprintHeight = (cam.sensorHeight / cam.focalLength) * slant;
  const gsd = ((cam.sensorWidth * slant) / (cam.focalLength * cam.imageWidth)) * 100;
  const photoSpacing = Math.max(0.5, footprintWidth * (1 - config.frontOverlap / 100));

  // Flight distance + photo positions along the flown path.
  let flightDistance = 0;
  for (let i = 1; i < flightLocal.length; i++) {
    flightDistance += Math.hypot(
      flightLocal[i]!.x - flightLocal[i - 1]!.x,
      flightLocal[i]!.y - flightLocal[i - 1]!.y,
    );
  }
  const photoPositions: LatLng[] = [];
  let next = 0;
  let travelled = 0;
  for (let i = 1; i < flightLocal.length; i++) {
    const a = flightLocal[i - 1]!;
    const b = flightLocal[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (seg > 0 && next <= travelled + seg) {
      const t = (next - travelled) / seg;
      photoPositions.push(localToLatLng(origin, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
      next += photoSpacing;
    }
    travelled += seg;
  }

  // Capture band: strip around the subject line, one frame-height wide, so the
  // operator sees what is actually in frame before flying.
  const band = corridorSwath(smoothSubject, Math.max(1, footprintHeight));

  return {
    waypoints,
    waypointYaws,
    waypointLookAts,
    photoPositions,
    footprints: band.length >= 3 ? [band] : [],
    stats: {
      gsd,
      flightDistance,
      flightTime: flightDistance / Math.max(0.1, config.speed),
      photoCount: photoPositions.length,
      lineCount: 1,
      areaCovered: 0,
      footprintWidth,
      footprintHeight,
      lineSpacing: 0,
      photoSpacing,
    },
  };
}
