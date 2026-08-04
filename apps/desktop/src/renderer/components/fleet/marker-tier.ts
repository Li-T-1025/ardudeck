/**
 * Density-based level-of-detail tier for a fleet marker, driven by the nearest-neighbor
 * distance in screen pixels. Pure so it's unit-testable; the hook in FleetMarkers feeds it
 * projected distances and remembers the previous tier per vehicle for hysteresis.
 */

export type MarkerTier = 'full' | 'medium' | 'dot';

/** Nearest neighbor farther than this (px) -> full-size marker. */
export const TIER_FULL_MIN_PX = 70;
/** Nearest neighbor closer than this (px) -> dot marker. Between the two -> medium. */
export const TIER_DOT_MAX_PX = 28;
/** A marker only switches tier once it crosses a threshold by this margin (px), so vehicles
 *  jittering right at a boundary don't flicker between sizes every tick. */
export const TIER_HYSTERESIS_PX = 6;

export function tierFromDistance(nearestPx: number, prev?: MarkerTier | null): MarkerTier {
  if (!prev) {
    if (nearestPx > TIER_FULL_MIN_PX) return 'full';
    if (nearestPx < TIER_DOT_MAX_PX) return 'dot';
    return 'medium';
  }
  // Shift each boundary away from the current tier: leaving it takes an extra
  // TIER_HYSTERESIS_PX, re-entering happens at the plain threshold.
  const fullMin = prev === 'full' ? TIER_FULL_MIN_PX - TIER_HYSTERESIS_PX : TIER_FULL_MIN_PX + TIER_HYSTERESIS_PX;
  const dotMax = prev === 'dot' ? TIER_DOT_MAX_PX + TIER_HYSTERESIS_PX : TIER_DOT_MAX_PX - TIER_HYSTERESIS_PX;
  if (nearestPx > fullMin) return 'full';
  if (nearestPx < dotMax) return 'dot';
  return 'medium';
}
