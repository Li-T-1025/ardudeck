/**
 * Fleet survey split - divide one survey polygon into N contiguous,
 * non-overlapping bands (one per vehicle) and build a mission for each.
 *
 * Bands are equal-width slabs along the polygon's longer axis, clipped to the
 * polygon with Sutherland-Hodgman. Equal width approximates equal area for
 * convex-ish areas; coverage stays intact because the bands tile the polygon.
 * True timing/dynamic deconfliction is the orchestration server's job - here we
 * only do static spatial split plus an optional per-vehicle altitude layer.
 *
 * Pure and dependency-light so the split logic unit-tests in plain node.
 */

import type { LatLng, SurveyConfig, SurveyFleetVehicle, SurveyResult } from './survey-types';
import type { MissionItem } from '../../../shared/mission-types';
import { getSurveyGenerator, patternToGeneratorId, resolveGeneratorId } from './generator-registry';
import { surveyToMissionItems } from './mission-builder';
import {
  extractSplitCells,
  cellWorkloads,
  partitionContiguous,
  assignWaypointsToRuns,
  sliceWaypointsByRuns,
  cellGroupHull,
} from './survey-cell-split';

/** Meters-per-degree helpers (equirectangular, good enough for band sizing). */
function spanMeters(polygon: LatLng[]): { latSpan: number; lngSpan: number; midLat: number } {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of polygon) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const midLat = (minLat + maxLat) / 2;
  const latSpan = (maxLat - minLat) * 110_540;
  const lngSpan = (maxLng - minLng) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  return { latSpan, lngSpan, midLat };
}

/**
 * Clip a polygon to one half-plane on a single axis using Sutherland-Hodgman.
 * `axis` selects lat or lng; keeps the side where the coord is <= or >= bound.
 */
function clipHalfPlane(poly: LatLng[], axis: 'lat' | 'lng', bound: number, keepGreater: boolean): LatLng[] {
  if (poly.length === 0) return [];
  const inside = (p: LatLng) => (keepGreater ? p[axis] >= bound : p[axis] <= bound);
  const intersect = (a: LatLng, b: LatLng): LatLng => {
    const av = a[axis], bv = b[axis];
    const t = (bound - av) / (bv - av);
    return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) };
  };
  const out: LatLng[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!;
    const prev = poly[(i + poly.length - 1) % poly.length]!;
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

/**
 * Split `polygon` into `n` contiguous bands along its longer axis. Returns up to
 * `n` sub-polygons (degenerate slivers with < 3 vertices are dropped). n <= 1
 * returns the polygon unchanged.
 */
export function splitPolygonIntoBands(polygon: LatLng[], n: number): LatLng[][] {
  if (n <= 1 || polygon.length < 3) return [polygon];

  const { latSpan, lngSpan } = spanMeters(polygon);
  const axis: 'lat' | 'lng' = latSpan >= lngSpan ? 'lat' : 'lng';

  let min = Infinity, max = -Infinity;
  for (const p of polygon) {
    if (p[axis] < min) min = p[axis];
    if (p[axis] > max) max = p[axis];
  }
  const step = (max - min) / n;
  if (step <= 0) return [polygon];

  const bands: LatLng[][] = [];
  for (let i = 0; i < n; i++) {
    const lo = min + i * step;
    const hi = i === n - 1 ? max : min + (i + 1) * step;
    let band = clipHalfPlane(polygon, axis, lo, true);
    band = clipHalfPlane(band, axis, hi, false);
    if (band.length >= 3) bands.push(band);
  }
  return bands;
}

export interface FleetSurveyAssignment {
  vehicleKey: string;
  subPolygon: LatLng[];
  missionItems: MissionItem[];
  waypointCount: number;
  areaCovered: number;
  /** Cruise altitude assigned to this vehicle (with any layer offset applied). */
  altitude: number;
  /** Engine estimate for this vehicle's flight, seconds; only engine splits know it. */
  flightTime?: number;
  /** Engine warnings for this vehicle (e.g. the leg exceeds its endurance). */
  warnings?: string[];
  /** Who cut the plan: the engine itself, its cells, or geometric bands. */
  source: 'engine' | 'cells' | 'bands';
}

export interface FleetSurveyOptions {
  /**
   * Per-vehicle details (position, endurance at current charge) for a
   * generator that plans the whole fleet itself (`supportsFleet`). Vehicles
   * missing here are planned with the survey defaults.
   */
  fleet?: SurveyFleetVehicle[];
  /**
   * Per-vehicle cruise-altitude offset (meters) applied as a safety layer:
   * vehicle i flies at baseAltitude + i * altitudeStepM. 0 = same altitude.
   */
  altitudeStepM?: number;
  /**
   * The already-generated plan, when available. If its generatorResult
   * carries decomposition cells (TOPAS-class engines), the split cuts along
   * whole cells - balanced by track workload, zero overlap, no re-generation
   * and no extra engine calls. Without cells the geometric band split runs.
   */
  plan?: { waypoints: LatLng[]; generatorResult: unknown };
}

/**
 * Build one mission per vehicle by splitting the polygon and generating a survey
 * grid for each band. Sequential generation keeps it simple; generators may be
 * async. Vehicles whose band degenerates to a sliver are skipped.
 */
/**
 * Cell-aware split: partition the engine's decomposition cells into
 * contiguous fly-order runs balanced by track length, slice the existing
 * plan waypoints per run, and build one mission per vehicle.
 */
function buildCellFleetSurvey(
  plan: { waypoints: LatLng[]; generatorResult: unknown },
  baseConfig: Omit<SurveyConfig, 'polygon'>,
  vehicleKeys: string[],
  altitudeStepM: number,
): FleetSurveyAssignment[] | null {
  const extracted = extractSplitCells(plan.generatorResult);
  if (!extracted || extracted.cells.length < 2 || plan.waypoints.length < 4) return null;
  const { cells, cellOrder } = extracted;

  const ranges = partitionContiguous(cellWorkloads(cells, cellOrder), vehicleKeys.length);
  const runPerWp = assignWaypointsToRuns(plan.waypoints, cells, cellOrder);
  const slices = sliceWaypointsByRuns(plan.waypoints, runPerWp, ranges);

  const out: FleetSurveyAssignment[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const vehicleKey = vehicleKeys[i];
    const slice = slices[i];
    if (!vehicleKey || !slice || slice.length < 2) continue;
    const altitude = baseConfig.altitude + i * altitudeStepM;
    const subPolygon = cellGroupHull(cells, cellOrder, ranges[i]!);
    const config: SurveyConfig = { ...baseConfig, polygon: subPolygon, altitude };
    // Minimal result shell: the mission builder consumes waypoints + config;
    // photo/footprint data stays with the parent plan.
    const result: SurveyResult = {
      waypoints: slice,
      photoPositions: [],
      footprints: [],
      stats: {
        gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
        lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
        lineSpacing: 0, photoSpacing: 0,
      },
    };
    out.push({
      vehicleKey,
      subPolygon,
      missionItems: surveyToMissionItems(result, config),
      waypointCount: slice.length,
      areaCovered: 0,
      altitude,
      source: 'cells',
    });
  }
  return out.length > 0 ? out : null;
}

const EMPTY_STATS: SurveyResult['stats'] = {
  gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
  lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
  lineSpacing: 0, photoSpacing: 0,
};

// Engine split: a fleet-capable generator plans one mission per vehicle. If it
// cannot serve every vehicle, its plan is cut by cells instead.
async function buildEngineFleetSurvey(
  polygon: LatLng[],
  baseConfig: Omit<SurveyConfig, 'polygon'>,
  vehicleKeys: string[],
  fleet: SurveyFleetVehicle[],
  altitudeStepM: number,
): Promise<FleetSurveyAssignment[] | null> {
  const gen = getSurveyGenerator(resolveGeneratorId(baseConfig));
  if (!gen?.capabilities.supportsFleet) return null;
  const byKey = new Map(fleet.map((v) => [v.key, v]));
  const config: SurveyConfig = {
    ...baseConfig,
    polygon,
    fleet: vehicleKeys.map((key) => byKey.get(key) ?? { key }),
  };
  const result = await gen.generate(config);
  return (
    assignmentsFromFleetMissions(result, polygon, baseConfig, vehicleKeys, altitudeStepM) ??
    buildCellFleetSurvey(
      { waypoints: result.waypoints, generatorResult: result.generatorResult },
      baseConfig, vehicleKeys, altitudeStepM,
    )
  );
}

/**
 * Assignments straight from an engine's per-vehicle missions (a survey
 * generated with `config.fleet`). Null unless every vehicle has one.
 */
export function assignmentsFromFleetMissions(
  result: Pick<SurveyResult, 'fleetMissions'>,
  polygon: LatLng[],
  baseConfig: Omit<SurveyConfig, 'polygon'>,
  vehicleKeys: string[],
  altitudeStepM: number,
): FleetSurveyAssignment[] | null {
  const missions = result.fleetMissions ?? [];
  const missionOf = (key: string) =>
    missions.find((m) => m.vehicleKey === key && m.waypoints.length >= 2);
  if (vehicleKeys.length === 0 || !vehicleKeys.every((key) => missionOf(key))) return null;
  return vehicleKeys.map((vehicleKey, i) => {
    const m = missionOf(vehicleKey)!;
    const altitude = baseConfig.altitude + i * altitudeStepM;
    const subPolygon = m.subPolygon && m.subPolygon.length >= 3 ? m.subPolygon : polygon;
    const vehicleConfig: SurveyConfig = { ...baseConfig, polygon: subPolygon, altitude };
    const shell: SurveyResult = {
      waypoints: m.waypoints,
      photoPositions: [],
      footprints: [],
      stats: { ...EMPTY_STATS, ...(m.stats ?? {}) },
    };
    return {
      vehicleKey,
      subPolygon,
      missionItems: surveyToMissionItems(shell, vehicleConfig),
      waypointCount: m.waypoints.length,
      areaCovered: m.stats?.areaCovered ?? 0,
      altitude,
      flightTime: m.stats?.flightTime,
      warnings: m.warnings,
      source: 'engine',
    };
  });
}

export async function buildFleetSurvey(
  polygon: LatLng[],
  baseConfig: Omit<SurveyConfig, 'polygon'>,
  vehicleKeys: string[],
  opts: FleetSurveyOptions = {},
): Promise<FleetSurveyAssignment[]> {
  if (opts.fleet) {
    const byEngine = await buildEngineFleetSurvey(
      polygon, baseConfig, vehicleKeys, opts.fleet, opts.altitudeStepM ?? 0,
    );
    if (byEngine) return byEngine;
  }
  if (opts.plan) {
    const byCells = buildCellFleetSurvey(
      opts.plan, baseConfig, vehicleKeys, opts.altitudeStepM ?? 0,
    );
    if (byCells) return byCells;
  }

  const bands = splitPolygonIntoBands(polygon, vehicleKeys.length);
  const step = opts.altitudeStepM ?? 0;
  const out: FleetSurveyAssignment[] = [];

  for (let i = 0; i < vehicleKeys.length; i++) {
    const band = bands[i];
    const vehicleKey = vehicleKeys[i];
    if (!band || !vehicleKey) continue;

    const altitude = baseConfig.altitude + i * step;
    const config: SurveyConfig = { ...baseConfig, polygon: band, altitude };
    const gen = getSurveyGenerator(patternToGeneratorId(config.pattern));
    if (!gen) continue;
    const result = await gen.generate(config);
    const missionItems = surveyToMissionItems(result, config);
    out.push({
      vehicleKey,
      subPolygon: band,
      missionItems,
      waypointCount: result.waypoints.length,
      areaCovered: result.stats.areaCovered,
      altitude,
      source: 'bands',
    });
  }
  return out;
}
