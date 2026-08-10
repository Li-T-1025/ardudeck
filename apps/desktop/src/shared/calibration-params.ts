/**
 * Classification of ArduPilot parameters that are per-unit calibration or
 * per-unit identity, as opposed to portable configuration.
 *
 * Used by the fleet vault: restoring a snapshot or applying another unit's
 * config must NEVER overwrite these by default. Compass offsets from a
 * different airframe, another board's accel cal or a stale learned hover
 * throttle are actively dangerous to write to a vehicle.
 */

const CAL_PATTERNS: RegExp[] = [
  // Compass calibration (offsets, diagonals, off-diagonals, motor compensation, scale)
  /^COMPASS_OFS\d?_?[XYZ]$/,
  /^COMPASS_DIA\d?_?[XYZ]$/,
  /^COMPASS_ODI\d?_?[XYZ]$/,
  /^COMPASS_MOT\d?_?[XYZ]$/,
  /^COMPASS_SCALE\d?$/,
  /^COMPASS_ORIENT\d?$/,
  /^COMPASS_PRIO\d_ID$/,
  // IMU calibration (accel offsets/scale, gyro offsets, temperature cal)
  /^INS_ACC\d?_?OFFS_[XYZ]$/,
  /^INS_ACC\d?_?SCAL_[XYZ]$/,
  /^INS_GYR\d?_?OFFS_[XYZ]$/,
  /^INS_GYR\d?_CALTEMP$/,
  /^INS_ACC\d?_CALTEMP$/,
  /^INS_TCAL\d_.+$/,
  // Board level trim from accel cal
  /^AHRS_TRIM_[XYZ]$/,
  // Barometer per-unit state
  /^BARO\d?_?GND_PRESS$/,
  /^BARO_ALT_OFFSET$/,
  // Airspeed sensor calibration
  /^ARSPD\d?_OFFSET$/,
  /^ARSPD\d?_RATIO$/,
  // Power module calibration
  /^BATT\d?_VOLT_MULT$/,
  /^BATT\d?_AMP_PERVLT$/,
  /^BATT\d?_AMP_OFFSET$/,
  // RC radio calibration (per transmitter, not per airframe config)
  /^RC\d+_MIN$/,
  /^RC\d+_MAX$/,
  /^RC\d+_TRIM$/,
  // Learned in-flight values
  /^MOT_THST_HOVER$/,
  /^Q_M_THST_HOVER$/,
  // Device IDs: bind calibration to physical sensors; copying them across
  // units defeats ArduPilot's "calibration matches hardware" checks
  /^.*_DEV_?ID\d?$/,
  /^COMPASS_DEV_ID\d?$/,
  /^INS_(ACC|GYR)\d?_ID$/,
  // Board identity and stats
  /^SYSID_THISMAV$/,
  /^STAT_.+$/,
];

export type ParamClass = 'calibration' | 'config';

export function isCalibrationParam(name: string): boolean {
  const upper = name.toUpperCase();
  return CAL_PATTERNS.some((re) => re.test(upper));
}

export function classifyParam(name: string): ParamClass {
  return isCalibrationParam(name) ? 'calibration' : 'config';
}
