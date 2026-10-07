import { describe, it, expect } from 'vitest';
import { planSetup, freeInstance, serialPorts, firstFreePort, portIsVital, type ParamInfo } from './plan';
import { HARDWARE_PRESETS } from './presets';

// labels as ArduPilot 4.6 reports them (autotest apm.pdef.xml)
const RNGFND_TYPES = { 0: 'None', 2: 'MaxbotixI2C', 7: 'LightWareI2C', 8: 'LightWareSerial', 20: 'BenewakeTFmini-Serial', 32: 'MSP' };
const SERIAL_PROTOCOLS = { [-1]: 'None', 1: 'MAVLink1', 2: 'MAVLink2', 5: 'GPS', 9: 'Rangefinder', 23: 'RCIN', 32: 'MSP' };

function vehicle(extra: Record<string, ParamInfo> = {}): (n: string) => ParamInfo | undefined {
  const params: Record<string, ParamInfo> = {
    RNGFND1_TYPE: { value: 0, values: RNGFND_TYPES },
    RNGFND2_TYPE: { value: 0, values: RNGFND_TYPES },
    SERIAL1_PROTOCOL: { value: 2, values: SERIAL_PROTOCOLS },
    SERIAL1_BAUD: { value: 57 },
    SERIAL3_PROTOCOL: { value: 5, values: SERIAL_PROTOCOLS },
    SERIAL3_BAUD: { value: 230 },
    SERIAL4_PROTOCOL: { value: -1, values: SERIAL_PROTOCOLS },
    SERIAL4_BAUD: { value: 57 },
    FLOW_TYPE: { value: 0, values: { 0: 'None', 7: 'MSP' } },
    ...extra,
  };
  return (n) => params[n];
}
const preset = (id: string) => HARDWARE_PRESETS.find((p) => p.id === id)!;

describe('planSetup', () => {
  it('sets the type and port now and leaves the rest for after the restart', () => {
    const plan = planSetup(preset('tfmini-serial'), { serial: 4, mount: 'down' }, vehicle());
    expect(plan.errors).toEqual([]);
    expect(plan.instance).toBe(1);
    expect(plan.now).toEqual([
      { name: 'SERIAL4_PROTOCOL', value: 9, current: -1 },
      { name: 'SERIAL4_BAUD', value: 115, current: 57 },
      { name: 'RNGFND1_TYPE', value: 20, current: 0 },
    ]);
    expect(plan.afterRestart).toEqual(['RNGFND1_ORIENT', 'RNGFND1_MIN', 'RNGFND1_MAX']);
  });

  it('after the restart writes orientation and metre limits, never the centimetre twins', () => {
    const after = vehicle({
      RNGFND1_TYPE: { value: 20, values: RNGFND_TYPES },
      RNGFND1_ORIENT: { value: 25 },
      RNGFND1_MIN: { value: 0.2 },
      RNGFND1_MAX: { value: 7 },
      SERIAL4_PROTOCOL: { value: 9, values: SERIAL_PROTOCOLS },
      SERIAL4_BAUD: { value: 115 },
    });
    const plan = planSetup(preset('tfmini-serial'), { serial: 4, mount: 'forward' }, after);
    expect(plan.now).toEqual([
      { name: 'RNGFND1_ORIENT', value: 0, current: 25 },
      { name: 'RNGFND1_MIN', value: 0.1, current: 0.2 },
      { name: 'RNGFND1_MAX', value: 12, current: 7 },
    ]);
    expect(plan.afterRestart).toEqual([]);
  });

  it('uses the centimetre limits on firmware that has them', () => {
    const old = vehicle({ RNGFND1_TYPE: { value: 20, values: RNGFND_TYPES }, RNGFND1_ORIENT: { value: 25 }, RNGFND1_MIN_CM: { value: 20 }, RNGFND1_MAX_CM: { value: 700 } });
    const plan = planSetup(preset('tfmini-serial'), { serial: 4 }, old);
    expect(plan.now.map((c) => c.name)).toEqual(['SERIAL4_PROTOCOL', 'SERIAL4_BAUD', 'RNGFND1_MIN_CM', 'RNGFND1_MAX_CM']);
    expect(plan.afterRestart).toEqual([]);
  });

  it('refuses a type number the firmware labels as something else', () => {
    const renumbered = vehicle({ RNGFND1_TYPE: { value: 0, values: { ...RNGFND_TYPES, 20: 'SomethingElse' } } });
    const plan = planSetup(preset('tfmini-serial'), { serial: 4 }, renumbered);
    expect(plan.errors).toContainEqual({ key: 'typeMismatch', values: { param: 'RNGFND1_TYPE', value: 20, label: 'SomethingElse' } });
  });

  it('refuses without the firmware labels rather than trusting a number', () => {
    const plan = planSetup(preset('tfmini-serial'), { serial: 4 }, vehicle({ RNGFND1_TYPE: { value: 0 } }));
    expect(plan.errors.map((e) => e.key)).toContain('noMetadata');
  });

  it('asks for a port on serial devices', () => {
    expect(planSetup(preset('tfmini-serial'), {}, vehicle()).errors.map((e) => e.key)).toContain('pickPort');
  });

  it('takes the next free rangefinder slot, or the one already holding this device', () => {
    const one = vehicle({ RNGFND1_TYPE: { value: 8, values: RNGFND_TYPES } });
    expect(freeInstance(preset('tfmini-serial'), one)).toBe(2);
    const again = vehicle({ RNGFND1_TYPE: { value: 20, values: RNGFND_TYPES } });
    expect(freeInstance(preset('tfmini-serial'), again)).toBe(1);
    const full = vehicle({ RNGFND1_TYPE: { value: 8, values: RNGFND_TYPES }, RNGFND2_TYPE: { value: 7, values: RNGFND_TYPES } });
    expect(planSetup(preset('tfmini-serial'), { serial: 4 }, full).errors.map((e) => e.key)).toContain('noFreeSlot');
  });

  it('sets flow and its rangefinder together for the Matek 3901', () => {
    const plan = planSetup(preset('matek-3901'), { serial: 4 }, vehicle());
    expect(plan.now.map((c) => `${c.name}=${c.value}`)).toEqual(['SERIAL4_PROTOCOL=32', 'SERIAL4_BAUD=115', 'FLOW_TYPE=7', 'RNGFND1_TYPE=32']);
  });

  it('writes whichever of two parameter names the firmware has', () => {
    const preset = HARDWARE_PRESETS.find((p) => p.id === 'gps-dronecan')!;
    const can = { CAN_P1_DRIVER: { value: 1, values: { 0: 'Disabled', 1: 'First driver' } }, CAN_D1_PROTOCOL: { value: 1, values: { 0: 'Disabled', 1: 'DroneCAN' } } };
    const gpsTypes = { 1: 'AUTO', 9: 'DroneCAN' };
    const newer = planSetup(preset, {}, vehicle({ ...can, GPS1_TYPE: { value: 1, values: gpsTypes } }));
    expect(newer.now).toEqual([{ name: 'GPS1_TYPE', value: 9, current: 1 }]);
    const older = planSetup(preset, {}, vehicle({ ...can, GPS_TYPE: { value: 1, values: gpsTypes } }));
    expect(older.now).toEqual([{ name: 'GPS_TYPE', value: 9, current: 1 }]);
  });

  it('leaves motor output types to the pilot and writes only the rest', () => {
    const preset = HARDWARE_PRESETS.find((p) => p.id === 'bdshot')!;
    const v = vehicle({
      MOT_PWM_TYPE: { value: 0, values: { 0: 'Normal', 6: 'DShot600' } },
      SERVO_BLH_BDMASK: { value: 0 },
      SERVO_BLH_POLES: { value: 14 },
      SERVO_BLH_AUTO: { value: 0, values: { 0: 'Disabled', 1: 'Enabled' } },
    });
    const plan = planSetup(preset, { motors: 6, poles: 12 }, v);
    expect(plan.manual).toEqual([{ name: 'MOT_PWM_TYPE', value: 6, label: 'DShot600', current: 0, done: false }]);
    expect(plan.now).toEqual([
      { name: 'SERVO_BLH_BDMASK', value: 63, current: 0 },
      { name: 'SERVO_BLH_POLES', value: 12, current: 14 },
      { name: 'SERVO_BLH_AUTO', value: 1, current: 0 },
    ]);
    expect(plan.now.some((c) => c.name === 'MOT_PWM_TYPE')).toBe(false);
  });

  it('every preset type value is what ArduPilot 4.6 calls it', () => {
    // guards the data itself: a typo in a preset is refused by its own label check
    const labels: Record<string, Record<number, string>> = {
      RNGFND: { 24: 'DroneCAN', 20: 'BenewakeTFmini-Serial', 25: 'BenewakeTFmini-I2C', 16: 'VL53L0X or VL53L1X', 31: 'GYUS42v2', 43: 'RDS02UF', 19: 'BenewakeTF02', 27: 'BenewakeTF03', 8: 'LightWareSerial', 7: 'LightWareI2C', 11: 'USD1_Serial', 2: 'MaxbotixI2C', 32: 'MSP' },
      ARSPD: { 1: 'I2C-MS4525D0', 3: 'I2C-MS5525', 9: 'I2C-DLVR-10in', 8: 'DroneCAN' },
      PRX: { 8: 'LightwareSF45B', 5: 'RPLidarA2' },
      FLOW: { 7: 'MSP', 6: 'DroneCAN', 4: 'CXOF', 8: 'UPFLOW', 1: 'PX4Flow' },
      CAN_P: { 1: 'First driver' },
      CAN_D: { 1: 'DroneCAN' },
      SERIAL: { 9: 'Rangefinder', 11: 'Lidar360', 32: 'MSP', 5: 'GPS', 2: 'MAVLink2', 18: 'OpticalFlow', 23: 'RCIN', 16: 'ESC Telemetry' },
      GPS: { 9: 'DroneCAN' },
      RSSI: { 3: 'ReceiverProtocol' },
      MOT: { 6: 'DShot600' },
      Q_M: { 6: 'DShot600' },
      SERVO_BLH: { 1: 'Enabled' },
      BATT: { 8: 'DroneCAN-BatteryInfo', 21: 'INA2XX (INA226 INA228 INA238 INA231 INA260)', 7: 'SMBus-Generic' },
    };
    for (const p of HARDWARE_PRESETS) {
      for (const param of p.params) {
        if (!param.expect || typeof param.value !== 'number') continue;
        const family = Object.keys(labels).find((f) => param.name.startsWith(f))!;
        expect(labels[family]![param.value], `${p.id} ${param.name}`).toMatch(param.expect);
      }
    }
  });
});

describe('serial ports', () => {
  it('lists ports with what runs on them and flags the vital ones', () => {
    const ports = serialPorts(vehicle());
    expect(ports.map((p) => `${p.port}:${p.label}`)).toEqual(['1:MAVLink2', '3:GPS', '4:None']);
    expect(ports.filter(portIsVital).map((p) => p.port)).toEqual([1, 3]);
    expect(firstFreePort(ports)).toBe(4);
  });
});
