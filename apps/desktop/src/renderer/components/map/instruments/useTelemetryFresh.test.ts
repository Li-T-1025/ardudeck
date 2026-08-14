import { describe, it, expect } from 'vitest';
import { isTelemetryFresh, TELEMETRY_STALE_MS } from './useTelemetryFresh';

const NOW = 1_700_000_000_000;

describe('isTelemetryFresh', () => {
  it('is fresh while the field keeps arriving', () => {
    expect(isTelemetryFresh(true, NOW - 200, NOW)).toBe(true);
  });

  it('is NOT fresh for a field that has never arrived on this link', () => {
    // PX4 withholds ATTITUDE and GLOBAL_POSITION_INT until its estimator is
    // valid. The link is up and the store still holds its zero defaults, which
    // is exactly the case that used to paint a level horizon and 0 m altitude.
    expect(isTelemetryFresh(true, 0, NOW)).toBe(false);
  });

  it('ages out once the stream stops', () => {
    expect(isTelemetryFresh(true, NOW - (TELEMETRY_STALE_MS - 1), NOW)).toBe(true);
    expect(isTelemetryFresh(true, NOW - TELEMETRY_STALE_MS, NOW)).toBe(false);
  });

  it('tolerates PX4 BATTERY_STATUS at ~0.4 Hz without flapping', () => {
    expect(isTelemetryFresh(true, NOW - 2500, NOW)).toBe(true);
  });

  it('is never fresh without a link, however recent the stamp', () => {
    expect(isTelemetryFresh(false, NOW, NOW)).toBe(false);
  });
});
