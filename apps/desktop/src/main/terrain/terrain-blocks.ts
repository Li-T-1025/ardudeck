// ArduPilot Location::offset constant: 1e7 degrees per metre on the WGS84 sphere it uses.
export const LOCATION_SCALING_FACTOR_INV = 89.83204953368922;
// A terrain block is an 8 x 7 array of 4 x 4 sub-blocks (AP_Terrain: MUL_X along latitude, MUL_Y along longitude).
export const GRID_BLOCK_MUL_X = 8;
export const GRID_BLOCK_MUL_Y = 7;
const SUB = 4;

export function offsetE7(latE7: number, lonE7: number, northM: number, eastM: number): { latE7: number; lonE7: number } {
  const dlat = northM * LOCATION_SCALING_FACTOR_INV;
  const latMid = ((latE7 + dlat / 2) / 1e7) * (Math.PI / 180);
  const dlon = (eastM * LOCATION_SCALING_FACTOR_INV) / Math.max(0.01, Math.cos(latMid));
  let lon = lonE7 + dlon;
  if (lon > 1800000000) lon -= 3600000000;
  if (lon < -1800000000) lon += 3600000000;
  return { latE7: Math.max(-900000000, Math.min(900000000, latE7 + dlat)), lonE7: lon };
}

/** The 16 points of one requested sub-block, in the order TERRAIN_DATA.data expects (x along latitude, y along longitude). */
export function blockPoints(latE7: number, lonE7: number, spacingM: number, gridbit: number): { lat: number; lon: number }[] {
  const idxX = Math.floor(gridbit / GRID_BLOCK_MUL_Y) * SUB;
  const idxY = (gridbit % GRID_BLOCK_MUL_Y) * SUB;
  const out: { lat: number; lon: number }[] = [];
  for (let x = 0; x < SUB; x++) {
    for (let y = 0; y < SUB; y++) {
      const o = offsetE7(latE7, lonE7, (idxX + x) * spacingM, (idxY + y) * spacingM);
      out.push({ lat: o.latE7 / 1e7, lon: o.lonE7 / 1e7 });
    }
  }
  return out;
}

export function requestedBits(mask: bigint): number[] {
  const bits: number[] = [];
  for (let i = 0; i < 56; i++) if ((mask >> BigInt(i)) & 1n) bits.push(i);
  return bits;
}

export function toInt16(h: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(h)));
}
