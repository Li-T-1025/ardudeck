import {
  commandHasLocation,
  hasValidCoordinates,
  isNavigationCommand,
  MAV_CMD,
  type MissionItem,
} from '../../../shared/mission-types';
import { getSegmentColor } from '../../utils/mission-segment-colors';

// Catmull-Rom spline interpolation between two nav waypoints
export function interpolateSpline(
  navWaypoints: MissionItem[],
  fromIdx: number,
  toIdx: number,
): [number, number][] {
  const curr = navWaypoints[fromIdx]!;
  const next = navWaypoints[toIdx]!;
  const prev = fromIdx > 0 ? navWaypoints[fromIdx - 1]! : curr;
  const after = toIdx < navWaypoints.length - 1 ? navWaypoints[toIdx + 1]! : next;

  const p0: [number, number] = [prev.latitude, prev.longitude];
  const p1: [number, number] = [curr.latitude, curr.longitude];
  const p2: [number, number] = [next.latitude, next.longitude];
  const p3: [number, number] = [after.latitude, after.longitude];

  const points: [number, number][] = [[p1[0], p1[1]]];
  const segments = 15;
  for (let t = 1 / segments; t <= 1; t += 1 / segments) {
    const t2 = t * t;
    const t3 = t2 * t;
    const lat = 0.5 * (
      (2 * p1[0]) +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
    );
    const lng = 0.5 * (
      (2 * p1[1]) +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
    );
    points.push([lat, lng]);
  }
  return points;
}

export interface PathSegment {
  positions: [number, number][];
  color: string;
}

/** One flown leg between two located nav waypoints, before same-colour legs are merged. */
export interface PathLeg extends PathSegment {
  from: MissionItem;
  to: MissionItem;
}

// Build coloured legs from ALL mission items (not just location ones).
// When `groupColorOf` is supplied (fleet / multi-mission), each leg is coloured by
// its group's colour instead of the command/state segment colour.
export function buildPathLegs(allItems: MissionItem[], groupColorOf?: (groupId: string | undefined) => string | undefined): PathLeg[] {
  // Extract navigation waypoints with locations for drawing (skip 0,0 null coordinates)
  const navWaypoints = allItems.filter(
    item => isNavigationCommand(item.command) && commandHasLocation(item.command) && hasValidCoordinates(item.latitude, item.longitude),
  );
  if (navWaypoints.length < 2) return [];

  // Index nav waypoints by seq so spline interpolation can find their position
  // without a linear scan.
  const navIndexBySeq = new Map<number, number>();
  navWaypoints.forEach((w, i) => navIndexBySeq.set(w.seq, i));

  // State flags
  let cameraActive = false;
  let roiActive = false;
  let speedOverride = false;

  // Single pass over all items in seq order: DO_* commands update the flags;
  // each located nav waypoint closes the leg from the previous one. This is
  // O(n) — the old version re-scanned every item for every nav pair (O(n²)),
  // which froze/OOM'd the renderer on large (20k+) survey missions.
  const raw: PathLeg[] = [];
  let prevNav: MissionItem | null = null;
  let prevNavIdx = -1;
  let brokeFlight = false;

  for (const item of allItems) {
    const isLocatedNav =
      isNavigationCommand(item.command) &&
      commandHasLocation(item.command) &&
      hasValidCoordinates(item.latitude, item.longitude);

    if (isLocatedNav) {
      const idx = navIndexBySeq.get(item.seq)!;
      // A leg between two groups is real when they share a flight: connected
      // surveys are flown one into the next. It is not a leg when a return or
      // a takeoff sits between them, because that is two separate flights.
      const crossesFlight = brokeFlight && !!prevNav;
      if (prevNav && !crossesFlight) {
        const color = groupColorOf?.(item.groupId) ?? getSegmentColor(item.command, cameraActive, roiActive, speedOverride);
        const isSpline =
          prevNav.command === MAV_CMD.NAV_SPLINE_WAYPOINT ||
          item.command === MAV_CMD.NAV_SPLINE_WAYPOINT;
        const positions: [number, number][] = isSpline
          ? interpolateSpline(navWaypoints, prevNavIdx, idx)
          : [
              [prevNav.latitude, prevNav.longitude],
              [item.latitude, item.longitude],
            ];
        raw.push({ positions, color, from: prevNav, to: item });
      }
      prevNav = item;
      prevNavIdx = idx;
      brokeFlight = false;
      continue;
    }

    if (item.command === MAV_CMD.NAV_RETURN_TO_LAUNCH
      || item.command === MAV_CMD.NAV_LAND
      || item.command === MAV_CMD.NAV_VTOL_LAND
      || item.command === MAV_CMD.NAV_TAKEOFF
      || item.command === MAV_CMD.NAV_VTOL_TAKEOFF) {
      brokeFlight = true;
    }

    // Match the original windowed behavior: DO_* commands only take effect once
    // the first located waypoint has been seen (legs are drawn between located
    // waypoints, and the old code never scanned items before the first one).
    if (prevNav === null) continue;

    switch (item.command) {
      case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
        cameraActive = item.param1 > 0;
        break;
      case MAV_CMD.IMAGE_START_CAPTURE:
        cameraActive = true;
        break;
      case MAV_CMD.IMAGE_STOP_CAPTURE:
        cameraActive = false;
        break;
      case MAV_CMD.DO_SET_ROI:
      case MAV_CMD.DO_SET_ROI_LOCATION:
        roiActive = true;
        break;
      case MAV_CMD.DO_SET_ROI_NONE:
        roiActive = false;
        break;
      case MAV_CMD.DO_CHANGE_SPEED:
        speedOverride = item.param2 > 0;
        break;
    }
  }

  return raw;
}

/** Legs merged into as few polylines as possible, for the 2D map. */
export function buildSegmentedPath(allItems: MissionItem[], groupColorOf?: (groupId: string | undefined) => string | undefined): PathSegment[] {
  const raw = buildPathLegs(allItems, groupColorOf);
  // Coalesce consecutive straight legs of the same color into a single polyline.
  // A survey is overwhelmingly one color (camera), so this collapses ~20k tiny
  // two-point segments into a handful of polylines — the difference between
  // thousands of Leaflet layers and a few. Spline legs (multi-point) and any
  // break in continuity (group-boundary gap) start a fresh run.
  const samePoint = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  const segments: PathSegment[] = [];
  let run: { positions: [number, number][]; color: string; plain: boolean } | null = null;
  for (const seg of raw) {
    const plain = seg.positions.length === 2;
    if (
      run && run.plain && plain && run.color === seg.color &&
      samePoint(run.positions[run.positions.length - 1]!, seg.positions[0]!)
    ) {
      run.positions.push(seg.positions[1]!);
    } else {
      if (run) segments.push({ positions: run.positions, color: run.color });
      run = { positions: [...seg.positions], color: seg.color, plain };
    }
  }
  if (run) segments.push({ positions: run.positions, color: run.color });

  return segments;
}

