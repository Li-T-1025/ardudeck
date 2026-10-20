/** Quick setups as data; every enum value names the label the firmware must report for it, or the setup is refused. */
export type SetupCategory = 'rangefinder' | 'depth' | 'airspeed' | 'proximity' | 'flow' | 'gps' | 'receiver' | 'telemetry' | 'power' | 'esc';

export type Mount = 'down' | 'forward' | 'up' | 'back';

/** MAV_SENSOR_ORIENTATION for each mount choice. */
export const MOUNT_ORIENT: Record<Mount, number> = { down: 25, forward: 0, up: 24, back: 4 };

export interface PresetParam {
  /** Name, with {i} for the instance number and {s} for the serial port number. `A|B`: whichever this firmware has. */
  name: string;
  value: number | ((a: SetupAnswers) => number);
  /** For enum parameters: the firmware's label for `value` must match, or the setup is refused. */
  expect?: RegExp;
  /** Never written: a step the pilot does in the parameter table, ticked off live once the vehicle reports it. */
  manual?: boolean;
}

export interface SetupAnswers {
  /** Serial port number (SERIALn), for serial devices. */
  serial?: number;
  mount?: Mount;
  /** Motors on servo outputs 1..n. */
  motors?: number;
  /** Magnets in the motor bell. */
  poles?: number;
}

export interface HardwarePreset {
  id: string;
  category: SetupCategory;
  /** Brand and model, shown as is. */
  name: string;
  /** i18n key for one line on what it is good for. */
  blurbKey: string;
  connection: 'serial' | 'i2c' | 'can' | 'output';
  /** Instance family whose first free slot the device takes, e.g. RNGFND. */
  instance?: { prefix: string; typeParam: string; max: number };
  /** Mount choices offered; the first is the default. */
  mounts?: Mount[];
  /** Extra questions this device needs. */
  asks?: ('motors' | 'poles')[];
  params: PresetParam[];
  /** What to watch live once it is set up. */
  check?: 'rangefinder' | 'depth' | 'proximity' | 'airspeed' | 'gps' | 'rc' | 'battery' | 'esc';
  docs?: string;
}

const RF = { prefix: 'RNGFND', typeParam: 'RNGFND{i}_TYPE', max: 10 };
const PRX = { prefix: 'PRX', typeParam: 'PRX{i}_TYPE', max: 3 };
const SERIAL_RANGEFINDER = /rangefinder/i;
const BAUD_115200 = 115;
// NMEA 0183 talkers default to 4800 baud
const BAUD_4800 = 4;

function serialPort(protocol: number, expect: RegExp, baud = BAUD_115200): PresetParam[] {
  return [
    { name: 'SERIAL{s}_PROTOCOL', value: protocol, expect },
    { name: 'SERIAL{s}_BAUD', value: baud },
  ];
}

/** Range limits: ArduPilot 4.6 uses metres (RNGFND1_MIN/MAX), older firmware centimetres (_MIN_CM/_MAX_CM). */
export function rangeParams(minM: number, maxM: number): PresetParam[] {
  return [
    { name: 'RNGFND{i}_MIN', value: minM },
    { name: 'RNGFND{i}_MAX', value: maxM },
    { name: 'RNGFND{i}_MIN_CM', value: Math.round(minM * 100) },
    { name: 'RNGFND{i}_MAX_CM', value: Math.round(maxM * 100) },
  ];
}

/** DroneCAN on the first CAN port: what every CAN device needs before the bus is read at all. */
const DRONECAN_BUS: PresetParam[] = [
  { name: 'CAN_P1_DRIVER', value: 1, expect: /first driver/i },
  { name: 'CAN_D1_PROTOCOL', value: 1, expect: /dronecan/i },
];

const orient = (prefix: string): PresetParam => ({ name: `${prefix}{i}_ORIENT`, value: (a) => MOUNT_ORIENT[a.mount ?? 'down'] });

export const HARDWARE_PRESETS: HardwarePreset[] = [
  // ─── Rangefinders ─────────────────────────────────────────────────────────
  {
    id: 'tfmini-serial', category: 'rangefinder', name: 'Benewake TFmini / TFmini Plus', blurbKey: 'tfmini', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, mounts: ['down', 'forward'], check: 'rangefinder',
    params: [
      ...serialPort(9, SERIAL_RANGEFINDER),
      { name: 'RNGFND{i}_TYPE', value: 20, expect: /tfmini/i },
      orient('RNGFND'), ...rangeParams(0.1, 12),
    ],
    docs: 'https://ardupilot.org/copter/docs/common-benewake-tfmini-lidar.html',
  },
  {
    id: 'tf02', category: 'rangefinder', name: 'Benewake TF02 / TF02 Pro', blurbKey: 'tf02', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, mounts: ['down', 'forward'], check: 'rangefinder',
    params: [...serialPort(9, SERIAL_RANGEFINDER), { name: 'RNGFND{i}_TYPE', value: 19, expect: /tf02/i }, orient('RNGFND'), ...rangeParams(0.1, 22)],
    docs: 'https://ardupilot.org/copter/docs/common-benewake-tf02-lidar.html',
  },
  {
    id: 'tf03', category: 'rangefinder', name: 'Benewake TF03', blurbKey: 'tf03', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, mounts: ['down', 'forward'], check: 'rangefinder',
    params: [...serialPort(9, SERIAL_RANGEFINDER), { name: 'RNGFND{i}_TYPE', value: 27, expect: /tf03/i }, orient('RNGFND'), ...rangeParams(0.1, 100)],
    docs: 'https://ardupilot.org/copter/docs/common-benewake-tf03-lidar.html',
  },
  {
    id: 'lightware-serial', category: 'rangefinder', name: 'LightWare SF11 / LW20 (serial)', blurbKey: 'lightware', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, mounts: ['down', 'forward'], check: 'rangefinder',
    params: [...serialPort(9, SERIAL_RANGEFINDER), { name: 'RNGFND{i}_TYPE', value: 8, expect: /lightware.*serial/i }, orient('RNGFND'), ...rangeParams(0.2, 100)],
    docs: 'https://ardupilot.org/copter/docs/common-lightware-sf10-lidar.html',
  },
  {
    id: 'lightware-i2c', category: 'rangefinder', name: 'LightWare SF11 / LW20 (I2C)', blurbKey: 'lightware', // i18n-exempt: brand and model
    connection: 'i2c', instance: RF, mounts: ['down', 'forward'], check: 'rangefinder',
    params: [{ name: 'RNGFND{i}_TYPE', value: 7, expect: /lightware.*i2c/i }, { name: 'RNGFND{i}_ADDR', value: 102 }, orient('RNGFND'), ...rangeParams(0.2, 100)],
    docs: 'https://ardupilot.org/copter/docs/common-lightware-sf10-lidar.html',
  },
  {
    id: 'usd1', category: 'rangefinder', name: 'Ainstein US-D1 radar', blurbKey: 'usd1', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, mounts: ['down'], check: 'rangefinder',
    params: [...serialPort(9, SERIAL_RANGEFINDER), { name: 'RNGFND{i}_TYPE', value: 11, expect: /usd1.*serial/i }, orient('RNGFND'), ...rangeParams(0.5, 40)],
    docs: 'https://ardupilot.org/copter/docs/common-ainstein-usd1-radar.html',
  },
  {
    id: 'tfluna-serial', category: 'rangefinder', name: 'Benewake TF-Luna (serial)', blurbKey: 'tfluna', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, mounts: ['down', 'forward'], check: 'rangefinder',
    params: [...serialPort(9, SERIAL_RANGEFINDER), { name: 'RNGFND{i}_TYPE', value: 20, expect: /tfmini.*serial/i }, orient('RNGFND'), ...rangeParams(0.2, 8)],
    docs: 'https://ardupilot.org/copter/docs/common-benewake-tfmini-lidar.html',
  },
  {
    id: 'tfluna-i2c', category: 'rangefinder', name: 'Benewake TF-Luna (I2C)', blurbKey: 'tfluna', // i18n-exempt: brand and model
    connection: 'i2c', instance: RF, mounts: ['down', 'forward'], check: 'rangefinder',
    params: [{ name: 'RNGFND{i}_TYPE', value: 25, expect: /tfmini.*i2c/i }, { name: 'RNGFND{i}_ADDR', value: 16 }, orient('RNGFND'), ...rangeParams(0.2, 8)],
    docs: 'https://ardupilot.org/copter/docs/common-benewake-tfmini-lidar.html',
  },
  {
    id: 'vl53l1x', category: 'rangefinder', name: 'VL53L1X time-of-flight (I2C)', blurbKey: 'vl53', // i18n-exempt: chip name
    connection: 'i2c', instance: RF, mounts: ['down'], check: 'rangefinder',
    params: [{ name: 'RNGFND{i}_TYPE', value: 16, expect: /vl53l/i }, { name: 'RNGFND{i}_ADDR', value: 41 }, orient('RNGFND'), ...rangeParams(0.05, 4)],
    docs: 'https://ardupilot.org/copter/docs/common-vl53l0x-lidar.html',
  },
  {
    id: 'gyus42', category: 'rangefinder', name: 'GY-US42 v2 sonar (I2C)', blurbKey: 'gyus42', // i18n-exempt: model name
    connection: 'i2c', instance: RF, mounts: ['down'], check: 'rangefinder',
    params: [{ name: 'RNGFND{i}_TYPE', value: 31, expect: /gyus42/i }, orient('RNGFND'), ...rangeParams(0.2, 7)],
    docs: 'https://ardupilot.org/copter/docs/common-rangefinder-gy-us42.html',
  },
  {
    id: 'rds02uf', category: 'rangefinder', name: 'RDS02UF radar', blurbKey: 'rds02uf', // i18n-exempt: model name
    connection: 'serial', instance: RF, mounts: ['down'], check: 'rangefinder',
    params: [...serialPort(9, SERIAL_RANGEFINDER), { name: 'RNGFND{i}_TYPE', value: 43, expect: /rds02uf/i }, orient('RNGFND'), ...rangeParams(0.5, 20)],
    docs: 'https://ardupilot.org/copter/docs/common-rangefinder-landingpage.html',
  },
  // ─── Depth sounders (boats; ArduPilot files them under RNGFND) ───────────
  {
    id: 'bluerobotics-ping', category: 'depth', name: 'Blue Robotics Ping sonar (serial)', blurbKey: 'ping', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, mounts: ['down'], check: 'depth',
    params: [...serialPort(9, SERIAL_RANGEFINDER), { name: 'RNGFND{i}_TYPE', value: 23, expect: /ping/i }, orient('RNGFND'), ...rangeParams(0.5, 50)],
    docs: 'https://ardupilot.org/rover/docs/common-rangefinder-landingpage.html',
  },
  {
    id: 'kogger-sonar', category: 'depth', name: 'KOGGER 2D sonar (serial)', blurbKey: 'kogger', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, mounts: ['down'], check: 'depth',
    // The sonar talks NMEA to the autopilot once KoggerApp has set its dataset to NMEA at 115200 and flashed it.
    params: [...serialPort(9, SERIAL_RANGEFINDER), { name: 'RNGFND{i}_TYPE', value: 17, expect: /nmea/i }, orient('RNGFND'), ...rangeParams(0.3, 50)],
    docs: 'https://ardupilot.org/rover/docs/common-kogger-sonar.html',
  },
  {
    id: 'nmea-sounder', category: 'depth', name: 'NMEA 0183 depth sounder (serial)', blurbKey: 'nmeaSounder', // i18n-exempt: protocol name
    connection: 'serial', instance: RF, mounts: ['down'], check: 'depth',
    params: [...serialPort(9, SERIAL_RANGEFINDER, BAUD_4800), { name: 'RNGFND{i}_TYPE', value: 17, expect: /nmea/i }, orient('RNGFND'), ...rangeParams(0.3, 100)],
    docs: 'https://ardupilot.org/rover/docs/common-rangefinder-landingpage.html',
  },
  {
    id: 'maxbotix-i2c', category: 'rangefinder', name: 'MaxBotix I2C sonar', blurbKey: 'maxbotix', // i18n-exempt: brand and model
    connection: 'i2c', instance: RF, mounts: ['down'], check: 'rangefinder',
    params: [{ name: 'RNGFND{i}_TYPE', value: 2, expect: /maxbotix/i }, orient('RNGFND'), ...rangeParams(0.2, 7)],
    docs: 'https://ardupilot.org/copter/docs/common-rangefinder-maxbotixi2c.html',
  },

  // ─── Airspeed ─────────────────────────────────────────────────────────────
  {
    id: 'ms4525', category: 'airspeed', name: 'MS4525DO pitot (Matek ASPD-4525, generic)', blurbKey: 'ms4525', // i18n-exempt: brand and model
    connection: 'i2c', check: 'airspeed',
    params: [{ name: 'ARSPD_TYPE', value: 1, expect: /4525/ }, { name: 'ARSPD_USE', value: 1 }],
    docs: 'https://ardupilot.org/plane/docs/airspeed.html',
  },
  {
    id: 'ms5525', category: 'airspeed', name: 'MS5525 pitot (I2C)', blurbKey: 'ms5525', // i18n-exempt: brand and model
    connection: 'i2c', check: 'airspeed',
    params: [{ name: 'ARSPD_TYPE', value: 3, expect: /5525/ }, { name: 'ARSPD_USE', value: 1 }],
    docs: 'https://ardupilot.org/plane/docs/airspeed.html',
  },
  {
    id: 'dlvr', category: 'airspeed', name: 'DLVR-L10D pitot (Matek ASPD-DLVR)', blurbKey: 'dlvr', // i18n-exempt: brand and model
    connection: 'i2c', check: 'airspeed',
    params: [{ name: 'ARSPD_TYPE', value: 9, expect: /dlvr.*10/i }, { name: 'ARSPD_USE', value: 1 }],
    docs: 'https://ardupilot.org/plane/docs/airspeed.html',
  },
  {
    id: 'airspeed-can', category: 'airspeed', name: 'DroneCAN airspeed', blurbKey: 'airspeedCan', // i18n-exempt: brand and model
    connection: 'can', check: 'airspeed',
    params: [...DRONECAN_BUS, { name: 'ARSPD_TYPE', value: 8, expect: /(uavcan|dronecan)/i }, { name: 'ARSPD_USE', value: 1 }],
    docs: 'https://ardupilot.org/plane/docs/airspeed.html',
  },

  // ─── Proximity ────────────────────────────────────────────────────────────
  {
    id: 'sf45b', category: 'proximity', name: 'LightWare SF45/B', blurbKey: 'sf45b', // i18n-exempt: brand and model
    connection: 'serial', instance: PRX, check: 'proximity',
    params: [...serialPort(11, /lidar360/i), { name: 'PRX{i}_TYPE', value: 8, expect: /sf45/i }],
    docs: 'https://ardupilot.org/copter/docs/common-lightware-sf45b.html',
  },
  {
    id: 'rplidar', category: 'proximity', name: 'RPLidar A2 / A3', blurbKey: 'rplidar', // i18n-exempt: brand and model
    connection: 'serial', instance: PRX, check: 'proximity',
    params: [...serialPort(11, /lidar360/i), { name: 'PRX{i}_TYPE', value: 5, expect: /rplidar/i }],
    docs: 'https://ardupilot.org/copter/docs/common-rplidar-a2.html',
  },

  // ─── Optical flow ─────────────────────────────────────────────────────────
  {
    id: 'matek-3901', category: 'flow', name: 'Matek 3901-L0X / MicoAir MTF-01 (flow + rangefinder)', blurbKey: 'matek3901', // i18n-exempt: brand and model
    connection: 'serial', instance: RF, check: 'rangefinder',
    params: [
      ...serialPort(32, /msp/i),
      { name: 'FLOW_TYPE', value: 7, expect: /msp/i },
      { name: 'RNGFND{i}_TYPE', value: 32, expect: /msp/i },
      { name: 'RNGFND{i}_ORIENT', value: 25 },
      ...rangeParams(0.01, 2),
    ],
    docs: 'https://ardupilot.org/copter/docs/common-matek-3901-l0x.html',
  },

  {
    id: 'hereflow', category: 'flow', name: 'Hex HereFlow (flow + rangefinder)', blurbKey: 'hereflow', // i18n-exempt: brand and model
    connection: 'can', instance: RF, check: 'rangefinder',
    params: [
      ...DRONECAN_BUS,
      { name: 'FLOW_TYPE', value: 6, expect: /dronecan/i },
      { name: 'RNGFND{i}_TYPE', value: 24, expect: /dronecan/i },
      { name: 'RNGFND{i}_ORIENT', value: 25 },
      ...rangeParams(0.05, 3),
    ],
    docs: 'https://ardupilot.org/copter/docs/common-hereflow.html',
  },
  {
    id: 'cxof', category: 'flow', name: 'Cheerson CX-OF', blurbKey: 'cxof', // i18n-exempt: brand and model
    connection: 'serial',
    params: [...serialPort(18, /opticalflow/i, 19), { name: 'FLOW_TYPE', value: 4, expect: /cxof/i }],
    docs: 'https://ardupilot.org/copter/docs/common-cheerson-cxof.html',
  },
  {
    id: 'upflow', category: 'flow', name: 'UPixel UPFLOW', blurbKey: 'upflow', // i18n-exempt: brand and model
    connection: 'serial',
    params: [...serialPort(18, /opticalflow/i, 19), { name: 'FLOW_TYPE', value: 8, expect: /upflow/i }],
    docs: 'https://ardupilot.org/copter/docs/common-upixels-upflow.html',
  },
  {
    id: 'px4flow', category: 'flow', name: 'PX4Flow (I2C)', blurbKey: 'px4flow', // i18n-exempt: model name
    connection: 'i2c',
    params: [{ name: 'FLOW_TYPE', value: 1, expect: /px4flow/i }],
    docs: 'https://ardupilot.org/copter/docs/common-px4flow-overview.html',
  },

  // ─── GPS ──────────────────────────────────────────────────────────────────
  {
    id: 'gps-serial', category: 'gps', name: 'u-blox GPS (M8 / M9 / M10, Beitian BN-880, Matek M10Q)', blurbKey: 'gps', // i18n-exempt: brand and model
    connection: 'serial', check: 'gps',
    params: [...serialPort(5, /^gps$/i, 230)],
    docs: 'https://ardupilot.org/copter/docs/common-installing-3dr-ublox-gps-compass-module.html',
  },

  {
    id: 'gps-dronecan', category: 'gps', name: 'DroneCAN GPS (Here3 / Here4, Matek M10Q-CAN, Holybro)', blurbKey: 'gpsCan', // i18n-exempt: brand and model
    connection: 'can', check: 'gps',
    params: [...DRONECAN_BUS, { name: 'GPS1_TYPE|GPS_TYPE', value: 9, expect: /dronecan/i }],
    docs: 'https://ardupilot.org/copter/docs/common-uavcan-setup-advanced.html',
  },

  // ─── RC receiver ──────────────────────────────────────────────────────────
  {
    id: 'crsf', category: 'receiver', name: 'ExpressLRS / TBS Crossfire / Tracer (CRSF)', blurbKey: 'crsf', // i18n-exempt: brand and protocol
    connection: 'serial', check: 'rc',
    params: [...serialPort(23, /rcin/i), { name: 'RSSI_TYPE', value: 3, expect: /receiver ?protocol/i }],
    docs: 'https://ardupilot.org/copter/docs/common-tbs-rc.html',
  },

  {
    id: 'fport', category: 'receiver', name: 'FrSky FPort receiver', blurbKey: 'fport', // i18n-exempt: brand and protocol
    connection: 'serial', check: 'rc',
    params: [...serialPort(23, /rcin/i), { name: 'SERIAL{s}_OPTIONS', value: 7 }, { name: 'RSSI_TYPE', value: 3, expect: /receiver ?protocol/i }],
    docs: 'https://ardupilot.org/copter/docs/common-FPort-receivers.html',
  },
  {
    id: 'srxl2', category: 'receiver', name: 'Spektrum SRXL2 receiver', blurbKey: 'srxl2', // i18n-exempt: brand and protocol
    connection: 'serial', check: 'rc',
    params: [...serialPort(23, /rcin/i), { name: 'SERIAL{s}_OPTIONS', value: 4 }, { name: 'RSSI_TYPE', value: 3, expect: /receiver ?protocol/i }],
    docs: 'https://ardupilot.org/copter/docs/common-spektrum-rc.html',
  },
  {
    id: 'sbus-serial', category: 'receiver', name: 'SBUS receiver on a serial port', blurbKey: 'sbusSerial', // i18n-exempt: protocol
    connection: 'serial', check: 'rc',
    params: [...serialPort(23, /rcin/i), { name: 'SERIAL{s}_OPTIONS', value: 1 }],
    docs: 'https://ardupilot.org/copter/docs/common-rc-systems.html',
  },

  // ─── Power ────────────────────────────────────────────────────────────────
  {
    id: 'battery-dronecan', category: 'power', name: 'DroneCAN battery monitor / power module', blurbKey: 'battCan', // i18n-exempt: protocol
    connection: 'can', check: 'battery',
    params: [...DRONECAN_BUS, { name: 'BATT_MONITOR', value: 8, expect: /dronecan/i }],
    docs: 'https://ardupilot.org/copter/docs/common-powermodule-landingpage.html',
  },

  {
    id: 'ina2xx', category: 'power', name: 'I2C digital power module (INA226 / 228 / 238)', blurbKey: 'ina2xx', // i18n-exempt: chip names
    connection: 'i2c', check: 'battery',
    params: [{ name: 'BATT_MONITOR', value: 21, expect: /ina2xx/i }],
    docs: 'https://ardupilot.org/copter/docs/common-powermodule-landingpage.html',
  },
  {
    id: 'smbus', category: 'power', name: 'SMBus smart battery', blurbKey: 'smbus', // i18n-exempt: protocol
    connection: 'i2c', check: 'battery',
    params: [{ name: 'BATT_MONITOR', value: 7, expect: /smbus-generic/i }],
    docs: 'https://ardupilot.org/copter/docs/common-smart-battery-landingpage.html',
  },

  // ─── ESC telemetry ────────────────────────────────────────────────────────
  {
    id: 'esc-telemetry-serial', category: 'esc', name: 'ESC telemetry wire (BLHeli32 / AM32)', blurbKey: 'escTelem', // i18n-exempt: firmware names
    connection: 'serial', check: 'esc',
    params: [...serialPort(16, /esc telemetry/i)],
    docs: 'https://ardupilot.org/copter/docs/common-esc-telemetry.html',
  },
  {
    id: 'bdshot', category: 'esc', name: 'Bidirectional DShot RPM (BLHeli32 / AM32 / Bluejay)', blurbKey: 'bdshot', // i18n-exempt: protocol and firmware names
    connection: 'output', asks: ['motors', 'poles'], check: 'esc',
    params: [
      // motor output types are never changed automatically: a wrong one can spin motors
      { name: 'MOT_PWM_TYPE|Q_M_PWM_TYPE', value: 6, expect: /dshot600/i, manual: true },
      { name: 'SERVO_BLH_BDMASK', value: (a) => (1 << (a.motors ?? 4)) - 1 },
      { name: 'SERVO_BLH_POLES', value: (a) => a.poles ?? 14 },
      { name: 'SERVO_BLH_AUTO', value: 1, expect: /enabled/i },
    ],
    docs: 'https://ardupilot.org/copter/docs/common-dshot-escs.html',
  },

  // ─── Telemetry radio ──────────────────────────────────────────────────────
  {
    id: 'sik', category: 'telemetry', name: 'SiK radio (generic 433 / 915 MHz, Holybro, RFD900)', blurbKey: 'sik', // i18n-exempt: brand and model
    connection: 'serial',
    params: [...serialPort(2, /mavlink2/i, 57)],
    docs: 'https://ardupilot.org/copter/docs/common-sik-telemetry-radio.html',
  },
  {
    id: 'mlrs', category: 'telemetry', name: 'mLRS', blurbKey: 'mlrs', // i18n-exempt: product name
    connection: 'serial',
    params: [...serialPort(2, /mavlink2/i, 57)],
    docs: 'https://github.com/olliw42/mLRS-docu',
  },
  {
    id: 'esp32-bridge', category: 'telemetry', name: 'DroneBridge / ESP32 WiFi telemetry', blurbKey: 'esp32', // i18n-exempt: product names
    connection: 'serial',
    params: [...serialPort(2, /mavlink2/i, 115)],
    docs: 'https://ardupilot.org/copter/docs/common-esp8266-telemetry.html',
  },
];

export const CATEGORY_ORDER: SetupCategory[] = ['rangefinder', 'depth', 'airspeed', 'proximity', 'flow', 'gps', 'receiver', 'telemetry', 'power', 'esc'];
