/**
 * Kinematic flight timeline from mission items - NOT a simulation. Pure
 * geometry + speeds so pilots can scrub through a plan and see where the
 * aircraft is and where the camera points at any moment.
 *
 * Honored commands: NAV_TAKEOFF (vertical climb at a fixed rate),
 * NAV_WAYPOINT (position, hold time), DO_CHANGE_SPEED (param2),
 * CONDITION_YAW (absolute camera/vehicle heading until the next one),
 * NAV_RETURN_TO_LAUNCH (straight leg home). Everything else is ignored.
 */
import { MAV_CMD, type MissionItem } from '../../../shared/mission-types';

export interface TimelinePoint {
  lat: number;
  lng: number;
  alt: number;
}

export interface TimelineSegment {
  from: TimelinePoint;
  to: TimelinePoint;
  /** ms since mission start */
  t0: number;
  t1: number;
  /** Travel heading, degrees compass. */
  trackHeading: number;
  /**
   * Camera heading (degrees compass) during this segment: an active
   * CONDITION_YAW if one was issued, otherwise the travel heading. When
   * `roi` is set, the live heading is computed toward it instead.
   */
  camHeading: number;
  /**
   * Active region of interest (DO_SET_ROI / DO_SET_ROI_LOCATION): the camera
   * tracks this point continuously; the live heading is the bearing to it.
   */
  roi?: { lat: number; lng: number } | null;
  /**
   * Yaw-controlled missions (CONDITION_YAW present): heading at segment start,
   * the commanded target, and the slew rate. The sampler rotates from
   * `camStart` toward `camTarget` at `camRateDps` - matching how the vehicle
   * actually turns instead of snapping.
   */
  camStart?: number;
  camTarget?: number;
  camRateDps?: number;
  /** True when this segment is a hold (loiter at a waypoint). */
  hold?: boolean;
}

export interface FlightTimeline {
  segments: TimelineSegment[];
  durationMs: number;
}

const CLIMB_RATE_MS = 2.5;

function bearingDeg(a: TimelinePoint, b: TimelinePoint): number {
  const dLng = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const deg = (Math.atan2(dLng, b.lat - a.lat) * 180) / Math.PI;
  return (deg + 360) % 360;
}

function distanceM(a: TimelinePoint, b: TimelinePoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = dLng * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const horiz = R * Math.sqrt(x * x + dLat * dLat);
  return Math.hypot(horiz, b.alt - a.alt);
}

export function buildFlightTimeline(items: MissionItem[], defaultSpeed: number): FlightTimeline {
  const segments: TimelineSegment[] = [];
  let speed = Math.max(0.1, defaultSpeed);
  /** Pending CONDITION_YAW: rotate toward target at rate until reached. */
  let pendingYaw: { target: number; rateDps: number } | null = null;
  /** Vehicle heading under yaw control; null until the mission commands yaw. */
  let currentCam: number | null = null;
  let roi: { lat: number; lng: number } | null = null;
  let pos: TimelinePoint | null = null;
  let home: TimelinePoint | null = null;
  let t = 0;

  const shortest = (delta: number): number => ((delta + 540) % 360) - 180;

  const pushLeg = (to: TimelinePoint, opts?: { hold?: boolean; durationMs?: number }) => {
    if (!pos) { pos = to; return; }
    const dur = opts?.durationMs ?? (distanceM(pos, to) / speed) * 1000;
    if (dur <= 0) { pos = to; return; }
    const track = opts?.hold ? (segments[segments.length - 1]?.trackHeading ?? 0) : bearingDeg(pos, to);

    // Yaw slew bookkeeping: the vehicle keeps rotating toward the commanded
    // heading across as many legs as the rate requires.
    let camStart: number | undefined;
    let camTarget: number | undefined;
    let camRateDps: number | undefined;
    if (pendingYaw) {
      if (currentCam === null) currentCam = track; // starts facing along-track
      camStart = currentCam;
      camTarget = pendingYaw.target;
      camRateDps = pendingYaw.rateDps;
      const delta = shortest(pendingYaw.target - currentCam);
      const maxStep = pendingYaw.rateDps * (dur / 1000);
      if (Math.abs(delta) <= maxStep) {
        currentCam = pendingYaw.target;
        pendingYaw = null;
      } else {
        currentCam = (currentCam + Math.sign(delta) * maxStep + 360) % 360;
      }
    } else if (currentCam !== null) {
      camStart = currentCam; // yaw hold between commands
    }

    segments.push({
      from: pos,
      to,
      t0: t,
      t1: t + dur,
      trackHeading: track,
      camHeading: camTarget ?? camStart ?? track,
      roi,
      camStart,
      camTarget,
      camRateDps,
      hold: opts?.hold,
    });
    t += dur;
    pos = to;
  };

  for (const it of items) {
    switch (it.command) {
      case MAV_CMD.NAV_TAKEOFF: {
        // Vertical climb wherever the previous position is; when takeoff
        // precedes any located waypoint (the usual case) there is nothing to
        // climb from yet, so it contributes no leg.
        // Cast: `pos` is only ever assigned inside pushLeg, which TS's
        // control-flow analysis can't see, so it wrongly narrows to null here.
        const cur = pos as TimelinePoint | null;
        if (cur) {
          pushLeg({ ...cur, alt: it.altitude }, { durationMs: (Math.abs(it.altitude - cur.alt) / CLIMB_RATE_MS) * 1000 });
        }
        break;
      }
      case MAV_CMD.DO_CHANGE_SPEED:
        if (it.param2 > 0) speed = it.param2;
        break;
      case MAV_CMD.CONDITION_YAW:
        // param4: 0 = absolute angle. Relative yaw is rare in generated plans;
        // treat it as absolute rather than accumulating error. param2 is the
        // turn rate in deg/s; 0 falls back to a typical auto-mode slew.
        pendingYaw = {
          target: ((it.param1 % 360) + 360) % 360,
          rateDps: it.param2 > 0 ? it.param2 : 60,
        };
        break;
      case MAV_CMD.DO_SET_ROI:
      case MAV_CMD.DO_SET_ROI_LOCATION:
        // Zero coordinates cancel (ArduPilot convention for 201).
        roi = Math.abs(it.latitude) > 1e-9 || Math.abs(it.longitude) > 1e-9
          ? { lat: it.latitude, lng: it.longitude }
          : null;
        if (roi) { pendingYaw = null; currentCam = null; } // ROI supersedes yaw
        break;
      case MAV_CMD.DO_SET_ROI_NONE:
        roi = null;
        break;
      case MAV_CMD.NAV_WAYPOINT: {
        if (Math.abs(it.latitude) < 1e-9 && Math.abs(it.longitude) < 1e-9) break;
        const wp = { lat: it.latitude, lng: it.longitude, alt: it.altitude };
        if (!home) home = wp;
        pushLeg(wp);
        if (it.param1 > 0) pushLeg(wp, { hold: true, durationMs: it.param1 * 1000 });
        break;
      }
      case MAV_CMD.NAV_RETURN_TO_LAUNCH: {
        if (home && pos) pushLeg({ ...home });
        break;
      }
      default:
        break;
    }
  }

  return { segments, durationMs: t };
}

export interface FlightSample {
  lat: number;
  lng: number;
  alt: number;
  trackHeading: number;
  camHeading: number;
}

/** Position + headings at `timeMs`, clamped to the mission span. */
export function sampleTimeline(timeline: FlightTimeline, timeMs: number): FlightSample | null {
  const segs = timeline.segments;
  if (segs.length === 0) return null;
  const tc = Math.max(0, Math.min(timeline.durationMs, timeMs));
  let seg = segs[segs.length - 1]!;
  for (const s of segs) {
    if (tc <= s.t1) { seg = s; break; }
  }
  const f = seg.t1 === seg.t0 ? 1 : Math.max(0, Math.min(1, (tc - seg.t0) / (seg.t1 - seg.t0)));
  const lat = seg.from.lat + (seg.to.lat - seg.from.lat) * f;
  const lng = seg.from.lng + (seg.to.lng - seg.from.lng) * f;

  let camHeading: number;
  if (seg.roi) {
    // ROI: the camera tracks the target continuously from the live position.
    camHeading = bearingDeg({ lat, lng, alt: 0 }, { lat: seg.roi.lat, lng: seg.roi.lng, alt: 0 });
  } else if (seg.camStart !== undefined && seg.camTarget !== undefined && seg.camRateDps !== undefined) {
    // Yaw command in flight: rotate from the segment's start heading toward
    // the target at the commanded rate - the same finite slew the vehicle
    // flies, so the cone pans instead of snapping.
    const delta = ((seg.camTarget - seg.camStart + 540) % 360) - 180;
    const step = Math.min(Math.abs(delta), seg.camRateDps * ((tc - seg.t0) / 1000));
    camHeading = (seg.camStart + Math.sign(delta) * step + 360) % 360;
  } else if (seg.camStart !== undefined) {
    camHeading = seg.camStart; // yaw hold between commands
  } else {
    camHeading = seg.camHeading;
  }

  return {
    lat,
    lng,
    alt: seg.from.alt + (seg.to.alt - seg.from.alt) * f,
    trackHeading: seg.trackHeading,
    camHeading,
  };
}
