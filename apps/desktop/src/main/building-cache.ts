/** Building vector tiles for synthetic vision, kept on disk: everything flown is cached, and an area can be baked for offline use. */

import { app, ipcMain, type BrowserWindow } from 'electron';
import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { PMTiles } from 'pmtiles';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';
import type { BuildingBakeProgress, BuildingTileSource } from '../shared/building-cache-types.js';

export const BUILDING_TILE_ZOOM = 14;
/** A z14 tile is ~2.4 km across; this caps one bake at roughly a 100 km square. */
const MAX_BAKE_TILES = 2_000;

const OVERTURE_BUCKET = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com';
// used when the release listing cannot be read
const OVERTURE_FALLBACK_RELEASE = '2026-09-23.1';

const tilePath = (source: BuildingTileSource, x: number, y: number) =>
  join(app.getPath('userData'), 'building-cache', source, String(BUILDING_TILE_ZOOM), String(x), `${y}.pbf`);

let ofmTemplate: Promise<string> | null = null;
function openFreeMapTemplate(): Promise<string> {
  ofmTemplate ??= fetch('https://tiles.openfreemap.org/planet')
    .then((r) => r.json() as Promise<{ tiles: string[] }>)
    .then((j) => j.tiles[0]!)
    .catch((err) => { ofmTemplate = null; throw err; });
  return ofmTemplate;
}

let overture: Promise<PMTiles> | null = null;
function overtureArchive(): Promise<PMTiles> {
  overture ??= (async () => {
    let release = OVERTURE_FALLBACK_RELEASE;
    try {
      const xml = await (await fetch(`${OVERTURE_BUCKET}/?list-type=2&prefix=tiles/&delimiter=/`)).text();
      const releases = [...xml.matchAll(/<Prefix>tiles\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]!).sort();
      release = releases[releases.length - 1] ?? release;
    } catch { /* fall back to the known release */ }
    return new PMTiles(`${OVERTURE_BUCKET}/tiles/${release}/buildings.pmtiles`);
  })().catch((err) => { overture = null; throw err; });
  return overture;
}

async function fetchTile(source: BuildingTileSource, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  if (source === 'openfreemap') {
    const url = (await openFreeMapTemplate()).replace('{z}', String(BUILDING_TILE_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y));
    const res = await fetch(url, { signal });
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  }
  const tile = await (await overtureArchive()).getZxy(BUILDING_TILE_ZOOM, x, y, signal);
  return tile ? new Uint8Array(tile.data) : new Uint8Array(0);
}

// tiles the view asked for; switching buildings off or to another source aborts them all
let viewRequests = new AbortController();

/** Cache first, then the network; a fetched tile is written to disk. Empty means no buildings there. */
export async function getBuildingTile(source: BuildingTileSource, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  const path = tilePath(source, x, y);
  try {
    return new Uint8Array(await readFile(path));
  } catch { /* not cached */ }
  const bytes = await fetchTile(source, x, y, signal);
  if (bytes) {
    void mkdir(join(path, '..'), { recursive: true }).then(() => writeFile(path, bytes)).catch(() => {});
  }
  return bytes;
}

function tilesFor(bounds: { north: number; south: number; east: number; west: number }) {
  const z = BUILDING_TILE_ZOOM;
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
  const ty = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  };
  const out: Array<[number, number]> = [];
  for (let x = tx(bounds.west); x <= tx(bounds.east); x++) for (let y = ty(bounds.north); y <= ty(bounds.south); y++) out.push([x, y]);
  return out;
}

const bakes = new Map<string, AbortController>();

export function setupBuildingCacheHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.BUILDINGS_GET_TILE, async (_e, source: BuildingTileSource, x: number, y: number) => {
    try {
      return await getBuildingTile(source, x, y, viewRequests.signal);
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.BUILDINGS_COUNT_TILES, (_e, bounds: { north: number; south: number; east: number; west: number }) => tilesFor(bounds).length);

  ipcMain.handle(IPC_CHANNELS.BUILDINGS_BAKE, (_e, source: BuildingTileSource, bounds: { north: number; south: number; east: number; west: number }) => {
    const tiles = tilesFor(bounds);
    const bakeId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const progress: BuildingBakeProgress = { bakeId, source, total: tiles.length, done: 0, failed: 0, bytes: 0, status: 'running' };
    const send = () => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send(IPC_CHANNELS.BUILDINGS_BAKE_PROGRESS, { ...progress }); };
    if (tiles.length > MAX_BAKE_TILES) {
      progress.status = 'error';
      progress.error = 'tooLarge';
      send();
      return progress;
    }
    const controller = new AbortController();
    bakes.set(bakeId, controller);
    void (async () => {
      let next = 0;
      const worker = async () => {
        while (next < tiles.length && !controller.signal.aborted) {
          const [x, y] = tiles[next++]!;
          try {
            const bytes = await getBuildingTile(source, x, y);
            progress.bytes += bytes?.byteLength ?? 0;
            if (bytes === null) progress.failed++;
          } catch {
            progress.failed++;
          }
          progress.done++;
          send();
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      progress.status = controller.signal.aborted ? 'cancelled' : 'done';
      bakes.delete(bakeId);
      send();
    })();
    send();
    return progress;
  });

  ipcMain.handle(IPC_CHANNELS.BUILDINGS_CANCEL_VIEW, () => {
    viewRequests.abort();
    viewRequests = new AbortController();
  });

  ipcMain.handle(IPC_CHANNELS.BUILDINGS_CANCEL_BAKE, (_e, bakeId: string) => bakes.get(bakeId)?.abort());
}
