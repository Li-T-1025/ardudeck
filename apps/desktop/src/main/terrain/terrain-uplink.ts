import { deserializeTerrainRequest, serializeTerrainData, TERRAIN_DATA_CRC_EXTRA, TERRAIN_DATA_ID } from '@ardudeck/mavlink-ts';
import { demSampler } from './dem-sampler.js';
import { blockPoints, requestedBits, toInt16 } from './terrain-blocks.js';

export interface UplinkStatus {
  sysid: number;
  served: number;
  missing: number;
  ignored: number;
  lastAt: number | null;
  spacing: number | null;
}

export interface UplinkDeps {
  enabled(): boolean;
  sample(points: { lat: number; lon: number }[], spacingM: number): Promise<(number | null)[]>;
  send(msgid: number, payload: Uint8Array, crcExtra: number, link: unknown): Promise<void>;
  now(): number;
  onStatus(status: UplinkStatus): void;
}

// The vehicle repeats a request every 2 s; a block answered inside that window is not sent again.
const REPEAT_WINDOW_MS = 2000;

/** Answers TERRAIN_REQUEST with TERRAIN_DATA blocks; lat, lon and spacing echo the request or the vehicle drops them. */
export function createTerrainUplink(deps: UplinkDeps) {
  const status = new Map<number, UplinkStatus>();
  const recent = new Map<string, number>();

  const statusFor = (sysid: number): UplinkStatus => {
    let s = status.get(sysid);
    if (!s) {
      s = { sysid, served: 0, missing: 0, ignored: 0, lastAt: null, spacing: null };
      status.set(sysid, s);
    }
    return s;
  };

  async function handleRequest(packet: { sysid: number; compid: number; payload: Uint8Array }, link: unknown): Promise<void> {
    const s = statusFor(packet.sysid);
    if (!deps.enabled()) {
      s.ignored++;
      deps.onStatus({ ...s });
      return;
    }
    const req = deserializeTerrainRequest(packet.payload);
    s.spacing = req.gridSpacing;
    const now = deps.now();
    for (const [k, at] of recent) if (now - at > REPEAT_WINDOW_MS) recent.delete(k);
    for (const bit of requestedBits(req.mask)) {
      const key = `${packet.sysid}:${req.lat}:${req.lon}:${req.gridSpacing}:${bit}`;
      if (recent.has(key)) continue;
      const pts = blockPoints(req.lat, req.lon, req.gridSpacing, bit);
      const heights = await deps.sample(pts, req.gridSpacing);
      if (heights.some((h) => h === null)) {
        s.missing++;
        continue;
      }
      const payload = serializeTerrainData({ lat: req.lat, lon: req.lon, gridSpacing: req.gridSpacing, gridbit: bit, data: heights.map((h) => toInt16(h!)) });
      await deps.send(TERRAIN_DATA_ID, payload, TERRAIN_DATA_CRC_EXTRA, link);
      recent.set(key, now);
      s.served++;
      s.lastAt = now;
    }
    deps.onStatus({ ...s });
  }

  return { handleRequest, statusFor };
}

export let terrainUplink: ReturnType<typeof createTerrainUplink> | null = null;

export function installTerrainUplink(deps: Omit<UplinkDeps, 'sample' | 'now'>): ReturnType<typeof createTerrainUplink> {
  terrainUplink = createTerrainUplink({ ...deps, sample: (pts, sp) => demSampler.sample(pts, sp), now: () => Date.now() });
  return terrainUplink;
}
