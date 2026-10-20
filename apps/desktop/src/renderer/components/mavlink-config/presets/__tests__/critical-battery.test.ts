import { describe, it, expect } from 'vitest';
import {
  BATTERY_CHEMISTRIES,
  getCellVoltages,
  type BatteryChemistry,
} from '../mavlink-presets';

/**
 * Tests for critical battery feature (issue #35).
 *
 * Covers:
 * - Battery chemistry critical thresholds are sane
 * - getCellVoltages() returns correct critical voltages
 * Action consistency lives in quick-setup-recommendations.test.ts.
 */

// =============================================================================
// Battery Chemistry Critical Thresholds
// =============================================================================

describe('BATTERY_CHEMISTRIES - critical voltage thresholds', () => {
  const chemistries = Object.entries(BATTERY_CHEMISTRIES) as [BatteryChemistry, typeof BATTERY_CHEMISTRIES[BatteryChemistry]][];

  it('all chemistries define a cellCritical value', () => {
    for (const [name, chem] of chemistries) {
      expect(chem.cellCritical, `${name} missing cellCritical`).toBeDefined();
      expect(chem.cellCritical, `${name} cellCritical should be > 0`).toBeGreaterThan(0);
    }
  });

  it('cellCritical < cellLow for all chemistries', () => {
    for (const [name, chem] of chemistries) {
      expect(
        chem.cellCritical,
        `${name}: cellCritical (${chem.cellCritical}) should be < cellLow (${chem.cellLow})`,
      ).toBeLessThan(chem.cellLow);
    }
  });

  it('cellCritical > cellMin for all chemistries (critical is not dead)', () => {
    for (const [name, chem] of chemistries) {
      expect(
        chem.cellCritical,
        `${name}: cellCritical (${chem.cellCritical}) should be > cellMin (${chem.cellMin})`,
      ).toBeGreaterThan(chem.cellMin);
    }
  });

  it('voltage ordering is correct: min < critical < low < nominal < full', () => {
    for (const [name, chem] of chemistries) {
      expect(chem.cellMin, `${name} min`).toBeLessThan(chem.cellCritical);
      expect(chem.cellCritical, `${name} critical`).toBeLessThan(chem.cellLow);
      expect(chem.cellLow, `${name} low`).toBeLessThan(chem.cellNominal);
      expect(chem.cellNominal, `${name} nominal`).toBeLessThan(chem.cellFull);
    }
  });
});

// =============================================================================
// getCellVoltages - Critical Voltage Output
// =============================================================================

describe('getCellVoltages - critical voltage calculations', () => {
  it('returns a critical field', () => {
    const voltages = getCellVoltages(4);
    expect(voltages).toHaveProperty('critical');
  });

  it('critical voltage scales with cell count', () => {
    const v3s = getCellVoltages(3);
    const v4s = getCellVoltages(4);
    const v6s = getCellVoltages(6);

    // 4S critical should be 4/3 of 3S critical
    expect(v4s.critical).toBeCloseTo(v3s.critical * (4 / 3), 5);
    // 6S critical should be 6/3 of 3S critical
    expect(v6s.critical).toBeCloseTo(v3s.critical * 2, 5);
  });

  it('critical < low for standard LiPo cell counts (3S, 4S, 6S)', () => {
    for (const cells of [3, 4, 6]) {
      const v = getCellVoltages(cells, 'lipo');
      expect(
        v.critical,
        `${cells}S LiPo: critical (${v.critical}) should be < low (${v.low})`,
      ).toBeLessThan(v.low);
    }
  });

  it('critical < low for all chemistries at 4S', () => {
    const chemistries: BatteryChemistry[] = ['lipo', 'lihv', 'lion', 'life'];
    for (const chem of chemistries) {
      const v = getCellVoltages(4, chem);
      expect(
        v.critical,
        `4S ${chem}: critical (${v.critical}) should be < low (${v.low})`,
      ).toBeLessThan(v.low);
    }
  });

  it('returns correct critical voltage for 4S LiPo', () => {
    const v = getCellVoltages(4, 'lipo');
    // 4 cells * 3.5V critical per cell = 14.0V
    expect(v.critical).toBeCloseTo(14.0, 1);
  });

  it('returns correct critical voltage for 6S LiHV', () => {
    const v = getCellVoltages(6, 'lihv');
    // 6 cells * 3.6V critical per cell = 21.6V
    expect(v.critical).toBeCloseTo(21.6, 1);
  });

  it('0 cells returns 0 critical voltage', () => {
    const v = getCellVoltages(0);
    expect(v.critical).toBe(0);
  });
});
