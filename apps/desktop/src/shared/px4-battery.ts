/**
 * PX4 battery thresholds expressed as cell voltages.
 *
 * ArduPilot states its low/critical battery levels as PACK VOLTAGES
 * (BATT_LOW_VOLT, BATT_CRT_VOLT). PX4 states them as FRACTIONS OF REMAINING
 * CAPACITY (BAT_LOW_THR, BAT_CRIT_THR, units "norm", range 0.05..0.5). They are
 * not interchangeable: reading BAT_LOW_THR as a voltage puts the warning at
 * 0.15 V per cell.
 *
 * Consumers that want a per-cell warning voltage (the EdgeTX HUD widget) can
 * map a threshold back through the same linear voltage model PX4 uses to
 * estimate remaining charge, between BAT1_V_EMPTY and BAT1_V_CHARGED.
 */

/**
 * Cell voltage at which PX4 would report `threshold` remaining, or null when
 * the inputs cannot describe a usable range.
 *
 * @param vEmpty    BAT1_V_EMPTY, empty cell voltage (V)
 * @param vCharged  BAT1_V_CHARGED, full cell voltage (V)
 * @param threshold BAT_LOW_THR / BAT_CRIT_THR, remaining fraction (0..1)
 */
export function px4CellVoltageAtThreshold(
  vEmpty: number,
  vCharged: number,
  threshold: number,
): number | null {
  if (!Number.isFinite(vEmpty) || !Number.isFinite(vCharged) || !Number.isFinite(threshold)) return null;
  if (vCharged <= vEmpty) return null;
  if (threshold <= 0 || threshold > 1) return null;
  return Number((vEmpty + threshold * (vCharged - vEmpty)).toFixed(2));
}
