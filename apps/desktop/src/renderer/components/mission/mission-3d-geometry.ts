// Legs come from mission-path.ts, the 2D map's rules, so both views agree.
import { hasValidCoordinates, MAV_CMD, mavFrameToAltFrame, type MissionItem } from '../../../shared/mission-types';
import type { PathLeg } from './mission-path';

/** Ground height (m MSL) at a point. */
export type GroundAt = (lat: number, lon: number) => number;

export interface Vertex3D {
  lat: number;
  lon: number;
  /** m MSL */
  alt: number;
}

export interface Line3D {
  points: Vertex3D[];
  color: string;
  dashed?: boolean;
}

export interface Waypoint3D {
  seq: number;
  lat: number;
  lon: number;
  /** m MSL where it is flown */
  alt: number;
  /** m MSL of the ground under it */
  ground: number;
  item: MissionItem;
  /** Drawn at home because the item has no position of its own (takeoff). */
  atHome: boolean;
}

export interface Mission3DGeometry {
  lines: Line3D[];
  waypoints: Waypoint3D[];
}

const LOITER_CMDS: ReadonlySet<number> = new Set([MAV_CMD.NAV_LOITER_UNLIM, MAV_CMD.NAV_LOITER_TIME, MAV_CMD.NAV_LOITER_TURNS]);
const LOITER_COLOR = '#a855f7';
/** A terrain-following leg is sampled at least this often, so it bends with the ground. */
const MIN_STEP_M = 10;
const MAX_SAMPLES_PER_LEG = 48;
/** Over all legs; long survey missions sample coarser instead of growing without bound. */
const SAMPLE_BUDGET = 60_000;

export function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const k = Math.PI / 180;
  const x = (bLon - aLon) * k * Math.cos(((aLat + bLat) / 2) * k);
  const y = (bLat - aLat) * k;
  return 6_371_000 * Math.hypot(x, y);
}

/** Height a waypoint is flown at, m MSL, for its altitude frame. */
export function itemAltMsl(item: MissionItem, lat: number, lon: number, ground: GroundAt, homeAltMsl: number): number {
  switch (mavFrameToAltFrame(item.frame)) {
    case 'asl': return item.altitude;
    case 'terrain': return ground(lat, lon) + item.altitude;
    default: return homeAltMsl + item.altitude;
  }
}

/** Home height for relative altitudes: the stored home altitude, else the ground at home. */
export function homeAltitudeMsl(home: { lat: number; lon: number; alt: number } | null, ground: GroundAt): number {
  if (!home) return 0;
  return home.alt !== 0 && Number.isFinite(home.alt) ? home.alt : ground(home.lat, home.lon);
}

function legPoints(leg: PathLeg, ground: GroundAt, homeAlt: number, stepM: number): Vertex3D[] {
  const { from, to } = leg;
  const a = itemAltMsl(from, from.latitude, from.longitude, ground, homeAlt);
  const b = itemAltMsl(to, to.latitude, to.longitude, ground, homeAlt);
  const followsTerrain = mavFrameToAltFrame(from.frame) === 'terrain' || mavFrameToAltFrame(to.frame) === 'terrain';
  // densify straight legs only when the height between the ends depends on the ground
  let pos = leg.positions;
  if (followsTerrain && pos.length === 2) {
    const len = distanceM(pos[0]![0], pos[0]![1], pos[1]![0], pos[1]![1]);
    const n = Math.min(MAX_SAMPLES_PER_LEG, Math.max(1, Math.ceil(len / stepM)));
    const [p, q] = pos as [[number, number], [number, number]];
    pos = Array.from({ length: n + 1 }, (_, i) => [p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n] as [number, number]);
  }
  // fraction along the leg by distance, so heights spread evenly on curves too
  const cum = [0];
  for (let i = 1; i < pos.length; i++) cum.push(cum[i - 1]! + distanceM(pos[i - 1]![0], pos[i - 1]![1], pos[i]![0], pos[i]![1]));
  const total = cum[cum.length - 1]! || 1;
  const aAgl = a - ground(from.latitude, from.longitude);
  const bAgl = b - ground(to.latitude, to.longitude);
  return pos.map(([lat, lon], i) => {
    const t = cum[i]! / total;
    const alt = followsTerrain ? ground(lat, lon) + aAgl + (bAgl - aAgl) * t : a + (b - a) * t;
    return { lat, lon, alt };
  });
}

function loiterCircle(wp: Waypoint3D, radiusM: number): Line3D {
  const k = Math.PI / 180;
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos(wp.lat * k));
  const points = Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * 2 * Math.PI;
    return { lat: wp.lat + dLat * Math.sin(a), lon: wp.lon + dLon * Math.cos(a), alt: wp.alt };
  });
  return { points, color: LOITER_COLOR, dashed: true };
}

/** Waypoints and legs at flown height. `items` are the visible mission items, in order. */
export function buildMission3D(
  items: MissionItem[],
  legs: PathLeg[],
  home: { lat: number; lon: number; alt: number } | null,
  ground: GroundAt,
): Mission3DGeometry {
  const homeAlt = homeAltitudeMsl(home, ground);
  const waypoints: Waypoint3D[] = [];
  for (const item of items) {
    if (hasValidCoordinates(item.latitude, item.longitude)) {
      const alt = itemAltMsl(item, item.latitude, item.longitude, ground, homeAlt);
      waypoints.push({ seq: item.seq, lat: item.latitude, lon: item.longitude, alt, ground: ground(item.latitude, item.longitude), item, atHome: false });
    } else if (home && item.command === MAV_CMD.NAV_TAKEOFF) {
      const alt = itemAltMsl(item, home.lat, home.lon, ground, homeAlt);
      waypoints.push({ seq: item.seq, lat: home.lat, lon: home.lon, alt, ground: ground(home.lat, home.lon), item, atHome: true });
    }
  }

  const totalM = legs.reduce((s, l) => s + (l.positions.length === 2 ? distanceM(l.positions[0]![0], l.positions[0]![1], l.positions[1]![0], l.positions[1]![1]) : 0), 0);
  const stepM = Math.max(MIN_STEP_M, totalM / SAMPLE_BUDGET);
  const lines: Line3D[] = legs.map((leg) => ({ points: legPoints(leg, ground, homeAlt, stepM), color: leg.color }));
  for (const wp of waypoints) {
    if (LOITER_CMDS.has(wp.item.command) && wp.item.param3 !== 0) lines.push(loiterCircle(wp, Math.abs(wp.item.param3)));
  }
  return { lines, waypoints };
}

/** The item altitude that puts a waypoint at `altMsl`, in the item's own frame. */
export function altitudeForMsl(item: MissionItem, altMsl: number, groundMsl: number, homeAltMsl: number): number {
  switch (mavFrameToAltFrame(item.frame)) {
    case 'asl': return altMsl;
    case 'terrain': return altMsl - groundMsl;
    default: return altMsl - homeAltMsl;
  }
}
