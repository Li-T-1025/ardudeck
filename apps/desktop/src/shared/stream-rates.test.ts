import { describe, it, expect } from 'vitest';
import {
  LEGACY_STREAM_RATE_CAP,
  cappedLegacyRates,
  persistsStreamRates,
  type StreamRates,
} from './stream-rates';

/**
 * The rule: a GCS must not rewrite the pilot's vehicle configuration.
 *
 * ArduPilot's GCS_Param.cpp::handle_request_data_stream does
 * `streamRates[i].set_and_save_ifchanged(freq)` when `persist_streamrates()`
 * is true, and ArduPlane overrides it to true. So a legacy
 * REQUEST_DATA_STREAM writes a plane's SR*_ parameters permanently. A pilot
 * reported that happening. The fleet path used to send those requests
 * unconditionally on every connect, at whatever preset was selected.
 */
describe('legacy stream rate cap', () => {
  const max: StreamRates = { attitude: 50, position: 15, other: 10 };
  const eco: StreamRates = { attitude: 10, position: 4, other: 2 };

  it('never lets the max preset reach the legacy path', () => {
    // 50 Hz attitude saved into a plane's parameters would flood its
    // telemetry radio on every future flight, in every GCS, until someone
    // undid it by hand.
    const capped = cappedLegacyRates(max);
    expect(capped.attitude).toBe(LEGACY_STREAM_RATE_CAP.attitude);
    expect(capped.position).toBe(LEGACY_STREAM_RATE_CAP.position);
    expect(capped.other).toBe(LEGACY_STREAM_RATE_CAP.other);
  });

  it('leaves a preset that is already gentle alone', () => {
    expect(cappedLegacyRates(eco)).toEqual(eco);
  });

  it('caps each field independently', () => {
    const mixed: StreamRates = { attitude: 4, position: 15, other: 1 };
    const capped = cappedLegacyRates(mixed);
    expect(capped.attitude).toBe(4); // already below the cap
    expect(capped.position).toBe(LEGACY_STREAM_RATE_CAP.position);
    expect(capped.other).toBe(1);
  });
});

describe('which vehicles save what we ask for', () => {
  it('treats the whole plane family as persisting', () => {
    // Every fixed wing and VTOL MAV_TYPE runs ArduPlane.
    for (const mavType of [1, 7, 8, 16, 17, 19, 20, 21, 22, 23, 24, 25, 28]) {
      expect(persistsStreamRates(mavType)).toBe(true);
    }
  });

  it('knows copter, rover and sub only change for the session', () => {
    for (const mavType of [2, 3, 4, 13, 14, 15, 29, 35, 10, 11, 12]) {
      expect(persistsStreamRates(mavType)).toBe(false);
    }
  });

  it('assumes an unknown or missing type persists', () => {
    // The safe direction: wrong here costs a slower stream, wrong the other
    // way rewrites a stranger's aircraft.
    expect(persistsStreamRates(99)).toBe(true);
    expect(persistsStreamRates(0)).toBe(true);
    expect(persistsStreamRates(null)).toBe(true);
    expect(persistsStreamRates(undefined)).toBe(true);
  });
});
