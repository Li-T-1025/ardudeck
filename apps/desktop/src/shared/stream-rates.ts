/**
 * Telemetry stream rates, and the rule that a GCS must not rewrite the
 * vehicle's own configuration.
 *
 * There are two ways to ask ArduPilot for telemetry, and they are NOT
 * equivalent:
 *
 *  - MAV_CMD_SET_MESSAGE_INTERVAL (511) applies for the session only, on
 *    every vehicle. This is always the first choice.
 *  - REQUEST_DATA_STREAM (66) is the legacy path. From ArduPilot's
 *    libraries/GCS_MAVLink/GCS_Param.cpp::handle_request_data_stream:
 *
 *      if (persist_streamrates()) streamRates[i].set_and_save_ifchanged(freq);
 *      else                       streamRates[i].set(freq);
 *
 *    ArduPlane/GCS_MAVLink_Plane.h overrides persist_streamrates() to return
 *    true. Copter, Rover and Sub inherit the base false. So on a plane, a
 *    legacy request is SAVED into the pilot's SR*_ parameters and outlives the
 *    flight, the session, and this application.
 *
 * A pilot reported exactly that: connecting a GCS rewrote the stream rates
 * they had set deliberately. The legacy path cannot simply be removed, since
 * SITL over TCP genuinely ignores SR*_ and a passive fleet link would
 * otherwise never receive anything but heartbeats. So it is fenced instead:
 * never sent to a vehicle that saves it, and never at more than eco rates.
 */

export interface StreamRates {
  attitude: number;
  position: number;
  other: number;
}

/**
 * The rates the legacy path is allowed to request, whatever the pilot chose
 * for the session.
 *
 * Writing the 'max' preset into a plane's parameters would flood its
 * telemetry radio for every future flight, in this app and in every other
 * GCS, until someone noticed and undid it by hand.
 */
export const LEGACY_STREAM_RATE_CAP: StreamRates = {
  attitude: 10,
  position: 4,
  other: 2,
};

/** Clamp a preset to what the legacy path may ask for. */
export function cappedLegacyRates(rates: StreamRates): StreamRates {
  return {
    attitude: Math.min(rates.attitude, LEGACY_STREAM_RATE_CAP.attitude),
    position: Math.min(rates.position, LEGACY_STREAM_RATE_CAP.position),
    other: Math.min(rates.other, LEGACY_STREAM_RATE_CAP.other),
  };
}

/** MAV_TYPE values that run ArduPlane, and therefore save stream rates. */
const PLANE_FAMILY_MAV_TYPES: ReadonlySet<number> = new Set([
  1,  // FIXED_WING
  7,  // AIRSHIP
  8,  // FREE_BALLOON
  16, // FLAPPING_WING
  17, // KITE
  19, 20, 21, 22, 23, 24, 25, // VTOL_DUOROTOR .. VTOL_RESERVED5
  28, // PARAFOIL
]);

/** MAV_TYPE values verified to apply stream rates for the session only. */
const SESSION_ONLY_MAV_TYPES: ReadonlySet<number> = new Set([
  2, 3, 4, 13, 14, 15, 29, 35, // copter family
  10, 11, // ground rover, surface boat
  12, // submarine
]);

/**
 * Whether a legacy REQUEST_DATA_STREAM to this vehicle would be written into
 * its parameters.
 *
 * An unknown MAV_TYPE is assumed to persist. Being wrong in that direction
 * costs a slower stream; being wrong the other way rewrites a stranger's
 * aircraft.
 */
export function persistsStreamRates(mavType: number | null | undefined): boolean {
  if (mavType === null || mavType === undefined) return true;
  if (PLANE_FAMILY_MAV_TYPES.has(mavType)) return true;
  if (SESSION_ONLY_MAV_TYPES.has(mavType)) return false;
  return true;
}
