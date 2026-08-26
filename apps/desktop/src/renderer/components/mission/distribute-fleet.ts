/**
 * Split one survey/mission group into N independent flyable missions, one per
 * fleet vehicle, so a TOPAS (or any) survey can be flown by a swarm in
 * parallel.
 *
 * Structure-aware, not just an array chop:
 * - A leading NAV_TAKEOFF is replicated at the start of every chunk.
 * - A trailing NAV_RETURN_TO_LAUNCH, plus the run of non-nav items directly
 *   before it (e.g. the camera-off DO_SET_CAM_TRIGG_DIST), is replicated at
 *   the end of every chunk.
 * - Config commands attached to the first waypoint (DO_CHANGE_SPEED,
 *   DO_SET_CAM_TRIGG_DIST) are replicated after each chunk's first waypoint,
 *   so every vehicle flies at survey speed with the camera armed.
 * - Cuts happen only between nav blocks (a nav item plus its trailing non-nav
 *   children stay together), balanced by along-path distance.
 *
 * Pure and framework-free; tested in distribute-fleet.test.ts.
 */
import type { MissionItem } from '../../../shared/mission-types';
import { MAV_CMD, isNavigationCommand } from '../../../shared/mission-types';

/** One nav item plus the non-nav items that follow (and belong to) it. */
interface NavBlock {
  items: MissionItem[];
  lat: number;
  lng: number;
}

function distM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * 111320;
  const dLng = (bLng - aLng) * 111320 * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(dLat, dLng);
}

const clone = (it: MissionItem): MissionItem => ({ ...it });

export function splitMissionForFleet(items: MissionItem[], count: number): MissionItem[][] {
  if (count <= 1) return [items.map(clone)];

  let body = [...items];

  // Peel a leading takeoff. Copter NAV_TAKEOFF climbs vertically at the
  // vehicle's own position, so verbatim copies are correct for every chunk.
  let takeoff: MissionItem | null = null;
  if (body.length > 0 && body[0]!.command === MAV_CMD.NAV_TAKEOFF) {
    takeoff = body[0]!;
    body = body.slice(1);
  }

  // Peel a trailing RTL and the non-nav run right before it.
  let tail: MissionItem[] = [];
  if (body.length > 0 && body[body.length - 1]!.command === MAV_CMD.NAV_RETURN_TO_LAUNCH) {
    let start = body.length - 1;
    while (start > 0 && !isNavigationCommand(body[start - 1]!.command)) start--;
    tail = body.slice(start);
    body = body.slice(0, start);
  }

  // Group the body into nav blocks. Leading non-nav strays (shouldn't happen
  // after the takeoff peel) ride with the first block.
  const blocks: NavBlock[] = [];
  for (const it of body) {
    if (isNavigationCommand(it.command) || blocks.length === 0) {
      blocks.push({ items: [it], lat: it.latitude, lng: it.longitude });
    } else {
      blocks[blocks.length - 1]!.items.push(it);
    }
  }
  if (blocks.length < count) return [items.map(clone)];

  // Config commands attached to the first waypoint - replicated into chunks
  // 2..N so speed and camera trigger are re-established per vehicle.
  // Whitelist only stateless setup commands: waypoint-specific children like
  // CONDITION_YAW must NOT be copied to other vehicles.
  const REPLICATED = new Set<number>([MAV_CMD.DO_CHANGE_SPEED, MAV_CMD.DO_SET_CAM_TRIGG_DIST]);
  const configCmds = blocks[0]!.items.slice(1).filter((it) => REPLICATED.has(it.command));

  // Balanced cut points by along-path distance.
  const legs: number[] = [0];
  let total = 0;
  for (let i = 1; i < blocks.length; i++) {
    total += distM(blocks[i - 1]!.lat, blocks[i - 1]!.lng, blocks[i]!.lat, blocks[i]!.lng);
    legs.push(total);
  }
  const chunks: NavBlock[][] = [];
  let start = 0;
  for (let c = 0; c < count; c++) {
    // Remaining chunks must each get at least one block.
    const maxEnd = blocks.length - (count - 1 - c);
    let end = maxEnd;
    if (c < count - 1) {
      const target = (total * (c + 1)) / count;
      end = start + 1;
      while (end < maxEnd && legs[end]! < target) end++;
    }
    chunks.push(blocks.slice(start, end));
    start = end;
  }

  return chunks.map((chunkBlocks, ci) => {
    const out: MissionItem[] = [];
    if (takeoff) out.push(clone(takeoff));
    chunkBlocks.forEach((b, bi) => {
      out.push(...b.items.map(clone));
      // First block of a later chunk: re-establish speed/camera config.
      if (bi === 0 && ci > 0) out.push(...configCmds.map(clone));
    });
    out.push(...tail.map(clone));
    return out;
  });
}
