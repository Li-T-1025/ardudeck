/**
 * Whether the boat can run the ArduDeck sonar script (src/main/lua-scripts/ardudeck_sonar.lua),
 * read from its parameters. Pure, so the decision is testable without a boat.
 */

/** ArduPilot RNGFNDx_TYPE values that matter here (AP_RangeFinder_Params.cpp). */
const RF_MAVLINK = 10;
const RF_NMEA = 17;
const RF_PING = 23;
const RF_LUA = 36;
/** RNGFNDx_ORIENT for a sensor looking down. */
const ORIENT_DOWN = 25;
/** SERIALx_PROTOCOL values. */
const SERIAL_RANGEFINDER = 9;
const SERIAL_SCRIPTING = 28;

export const SONAR_RANGEFINDERS = [1, 2, 3, 4];
export const SONAR_SERIALS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Every parameter sonarSetupState reads. */
export const SONAR_PARAMS = [
  ...SONAR_RANGEFINDERS.flatMap((i) => [`RNGFND${i}_TYPE`, `RNGFND${i}_ORIENT`]),
  ...SONAR_SERIALS.map((n) => `SERIAL${n}_PROTOCOL`),
];

export interface ParamChange { param: string; from: number; to: number }

export type SonarSetupState =
  /** Script path configured: a Lua rangefinder looking down and a Scripting serial port. */
  | { kind: 'installed' }
  /** A Ping on an autopilot serial port: the script can take it over with these changes. */
  | { kind: 'ready'; serial: number; rangefinder: number; changes: ParamChange[] }
  /** An NMEA depth sounder: depth only, no echo profile to draw. */
  | { kind: 'nmea' }
  /** Depth arrives over MAVLink, i.e. a companion computer (BlueOS) owns the sonar. */
  | { kind: 'companion' }
  /** No downward Ping on this boat. */
  | { kind: 'none' };

export function sonarSetupState(values: Record<string, number | undefined>): SonarSetupState {
  const down = SONAR_RANGEFINDERS.filter((i) => values[`RNGFND${i}_ORIENT`] === ORIENT_DOWN);
  const typeOf = (i: number) => values[`RNGFND${i}_TYPE`];
  const serialWith = (protocol: number) => SONAR_SERIALS.find((n) => values[`SERIAL${n}_PROTOCOL`] === protocol);

  if (down.some((i) => typeOf(i) === RF_LUA) && serialWith(SERIAL_SCRIPTING) !== undefined) return { kind: 'installed' };
  const ping = SONAR_RANGEFINDERS.find((i) => typeOf(i) === RF_PING);
  const port = serialWith(SERIAL_RANGEFINDER);
  if (ping !== undefined && port !== undefined) {
    const changes: ParamChange[] = [
      { param: `SERIAL${port}_PROTOCOL`, from: SERIAL_RANGEFINDER, to: SERIAL_SCRIPTING },
      { param: `RNGFND${ping}_TYPE`, from: RF_PING, to: RF_LUA },
    ];
    const orient = values[`RNGFND${ping}_ORIENT`];
    if (orient !== ORIENT_DOWN) changes.push({ param: `RNGFND${ping}_ORIENT`, from: orient ?? 0, to: ORIENT_DOWN });
    return { kind: 'ready', serial: port, rangefinder: ping, changes };
  }
  if (down.some((i) => typeOf(i) === RF_NMEA)) return { kind: 'nmea' };
  if (down.some((i) => typeOf(i) === RF_MAVLINK)) return { kind: 'companion' };
  return { kind: 'none' };
}
