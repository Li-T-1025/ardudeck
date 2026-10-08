// Measured in SITL: quadplane-jet level top speed 98/138/196 m/s at c_drag_p 0.1/0.05/0.025, so v^2 * c_drag_p = 957.

export const TOP_SPEED_MIN_KMH = 150;
export const TOP_SPEED_MAX_KMH = 800;
const QUADPLANE_JET_K = 957;

/** SITL resolves the aero file against its own folder; absolute paths fail its stat. */
export const TOP_SPEED_AERO_FILE = 'ardudeck-aero.json';

/** Quadplanes with a forward cruise motor; tilt, Firefly, CL-84, ICE and tailsitters thrust differently. */
export function supportsTopSpeed(vehicleType: string, model: string | undefined): boolean {
  if (vehicleType !== 'plane' || !model) return false;
  if (!model.startsWith('quadplane')) return false;
  return !/tilt|firefly|cl84|tailsitter|-ice/.test(model);
}

export function clampTopSpeedKmh(kmh: number): number {
  return Math.round(Math.max(TOP_SPEED_MIN_KMH, Math.min(TOP_SPEED_MAX_KMH, kmh)));
}

export function dragForTopSpeed(kmh: number): number {
  const v = clampTopSpeedKmh(kmh) / 3.6;
  return +(QUADPLANE_JET_K / (v * v)).toFixed(5);
}

export function topSpeedAeroJson(kmh: number): string {
  return JSON.stringify({ c_drag_p: dragForTopSpeed(kmh) }) + '\n';
}

export function topSpeedModel(baseModel: string, aeroFile = TOP_SPEED_AERO_FILE): string {
  return `${baseModel}-jet:${aeroFile}`;
}

/** Airspeed limits that let the autopilot use the speed the airframe now has. */
export function topSpeedParamLines(kmh: number): string[] {
  const v = clampTopSpeedKmh(kmh) / 3.6;
  return [
    `AIRSPEED_MAX ${Math.round(v)}`,
    `AIRSPEED_CRUISE ${Math.round(v * 0.8)}`,
    'THR_MAX 100',
  ];
}
