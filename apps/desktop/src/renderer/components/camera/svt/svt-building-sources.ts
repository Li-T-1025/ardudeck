// Kept apart from svt-buildings so the camera store does not pull in three.js and the tile decoder.
export const SVT_BUILDING_SOURCES = ['off', 'openfreemap', 'overture', 'overpass'] as const;
export type SvtBuildings = (typeof SVT_BUILDING_SOURCES)[number];
export const DEFAULT_SVT_BUILDINGS: SvtBuildings = 'openfreemap';

export function validBuildings(v: unknown): SvtBuildings {
  return SVT_BUILDING_SOURCES.includes(v as SvtBuildings) ? (v as SvtBuildings) : DEFAULT_SVT_BUILDINGS;
}
