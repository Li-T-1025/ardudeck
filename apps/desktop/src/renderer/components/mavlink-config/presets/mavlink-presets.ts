/**
 * MAVLink/ArduPilot reference tables: failsafe actions, arming check flags,
 * fence types, battery monitors and battery chemistries.
 */

// =============================================================================
// Failsafe Actions
// =============================================================================

export const FAILSAFE_ACTIONS: Record<number, { name: string; descriptionKey: string; safe: boolean }> = {
  0: { name: 'Disabled', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.0', safe: false }, // i18n-exempt
  1: { name: 'RTL', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.1', safe: true }, // i18n-exempt
  2: { name: 'Land', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.2', safe: true }, // i18n-exempt
  3: { name: 'SmartRTL', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.3', safe: true }, // i18n-exempt
  4: { name: 'Brake', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.4', safe: true }, // i18n-exempt
  5: { name: 'Land', descriptionKey: 'mavlink-config:mavlinkPresets.failsafeAction.5', safe: true }, // i18n-exempt
};

// =============================================================================
// Arming Check Flags
// =============================================================================

export const ARMING_CHECKS: Record<number, { name: string; descriptionKey: string }> = {
  1: { name: 'All', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.1' }, // i18n-exempt
  2: { name: 'Barometer', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.2' }, // i18n-exempt
  4: { name: 'Compass', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.4' }, // i18n-exempt
  8: { name: 'GPS Lock', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.8' }, // i18n-exempt
  16: { name: 'INS', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.16' }, // i18n-exempt
  32: { name: 'Parameters', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.32' }, // i18n-exempt
  64: { name: 'RC Channels', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.64' }, // i18n-exempt
  128: { name: 'Board Voltage', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.128' }, // i18n-exempt
  256: { name: 'Battery Level', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.256' }, // i18n-exempt
  512: { name: 'Airspeed', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.512' }, // i18n-exempt
  1024: { name: 'Logging', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.1024' }, // i18n-exempt
  2048: { name: 'Safety Switch', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.2048' }, // i18n-exempt
  4096: { name: 'GPS Config', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.4096' }, // i18n-exempt
  8192: { name: 'System', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.8192' }, // i18n-exempt
  16384: { name: 'Mission', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.16384' }, // i18n-exempt
  32768: { name: 'Rangefinder', descriptionKey: 'mavlink-config:mavlinkPresets.armingCheck.32768' }, // i18n-exempt
};

// =============================================================================
// Fence Types
// =============================================================================

export const FENCE_TYPES: Record<number, { name: string; descriptionKey: string }> = {
  0: { name: 'Disabled', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.0' }, // i18n-exempt
  1: { name: 'Altitude', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.1' }, // i18n-exempt
  2: { name: 'Circle', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.2' }, // i18n-exempt
  3: { name: 'Altitude + Circle', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.3' }, // i18n-exempt
  4: { name: 'Polygon', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.4' }, // i18n-exempt
  7: { name: 'All', descriptionKey: 'mavlink-config:mavlinkPresets.fenceType.7' }, // i18n-exempt
};

// =============================================================================
// Battery Monitor Types
// =============================================================================

export const BATTERY_MONITORS: Record<number, { name: string; descriptionKey: string }> = {
  0: { name: 'Disabled', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.0' }, // i18n-exempt
  3: { name: 'Analog Voltage Only', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.3' }, // i18n-exempt
  4: { name: 'Analog Voltage + Current', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.4' }, // i18n-exempt
  5: { name: 'Solo', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.5' }, // i18n-exempt
  6: { name: 'Bebop', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.6' }, // i18n-exempt
  7: { name: 'SMBus-Maxell', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.7' }, // i18n-exempt
  8: { name: 'UAVCAN', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.8' }, // i18n-exempt
  9: { name: 'BLHeli ESC', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.9' }, // i18n-exempt
  10: { name: 'Sum of Selected', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.10' }, // i18n-exempt
  11: { name: 'FuelFlow', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.11' }, // i18n-exempt
  12: { name: 'FuelLevel PWM', descriptionKey: 'mavlink-config:mavlinkPresets.batteryMonitor.12' }, // i18n-exempt
};

// =============================================================================
// Battery Chemistry Types
// =============================================================================

export type BatteryChemistry = 'lipo' | 'lihv' | 'lion' | 'life';

export interface BatteryChemistryInfo {
  name: string;
  descriptionKey: string;
  /** Per-cell voltages */
  cellFull: number;
  cellNominal: number;
  cellStorage: number;
  /** ArduPilot-safe thresholds - enough margin for RTL */
  cellLow: number;
  cellCritical: number;
  cellMin: number;
}

export const BATTERY_CHEMISTRIES: Record<BatteryChemistry, BatteryChemistryInfo> = {
  lipo: {
    name: 'LiPo',
    descriptionKey: 'mavlink-config:mavlinkPresets.chemistry.lipo.description',
    cellFull: 4.2,
    cellNominal: 3.7,
    cellStorage: 3.8,
    cellLow: 3.6,
    cellCritical: 3.5,
    cellMin: 3.0,
  },
  lihv: {
    name: 'LiHV',
    descriptionKey: 'mavlink-config:mavlinkPresets.chemistry.lihv.description',
    cellFull: 4.35,
    cellNominal: 3.8,
    cellStorage: 3.9,
    cellLow: 3.7,
    cellCritical: 3.6,
    cellMin: 3.1,
  },
  lion: {
    name: 'Li-Ion',
    descriptionKey: 'mavlink-config:mavlinkPresets.chemistry.lion.description',
    cellFull: 4.2,
    cellNominal: 3.6,
    cellStorage: 3.7,
    cellLow: 3.2,
    cellCritical: 3.0,
    cellMin: 2.5,
  },
  life: {
    name: 'LiFePO4',
    descriptionKey: 'mavlink-config:mavlinkPresets.chemistry.life.description',
    cellFull: 3.6,
    cellNominal: 3.3,
    cellStorage: 3.3,
    cellLow: 3.1,
    cellCritical: 3.0,
    cellMin: 2.5,
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate cell voltages for any chemistry and cell count.
 * Thresholds are set conservatively for ArduPilot - enough margin for RTL.
 */
export function getCellVoltages(cells: number, chemistry: BatteryChemistry = 'lipo') {
  const chem = BATTERY_CHEMISTRIES[chemistry];
  return {
    nominal: cells * chem.cellNominal,
    full: cells * chem.cellFull,
    storage: cells * chem.cellStorage,
    low: cells * chem.cellLow,
    critical: cells * chem.cellCritical,
    min: cells * chem.cellMin,
  };
}

/**
 * Calculate LiPo cell voltages (legacy wrapper)
 */
export function getLiPoVoltages(cells: number) {
  return getCellVoltages(cells, 'lipo');
}
