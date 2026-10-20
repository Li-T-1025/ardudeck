import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { TrainerLocusSurvey } from '../../shared/trainer-types.js';

const REGISTRY = join(homedir(), '.ardudeck-locus', 'projects.json');

interface Manifest {
  version?: number;
  project?: { name?: string; updated?: string };
  vertical?: string;
  footprint?: [number, number][];
  products?: Record<string, { tif?: string; cellM?: number }>;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Every Locus export on this machine with a surface GeoTIFF, as a region the Trainer can bake. */
export async function listLocusSurveys(): Promise<TrainerLocusSurvey[]> {
  const entries = (await readJson<Array<{ name?: string; output?: string; manifest?: string; updated?: string }>>(REGISTRY)) ?? [];
  const out: TrainerLocusSurvey[] = [];
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e?.output) continue;
    const manifestPath = e.manifest ?? join(e.output, 'ardudeck', 'manifest.json');
    const m = await readJson<Manifest>(manifestPath);
    if (!m || m.version !== 1 || !m.footprint || m.footprint.length < 3 || !m.products) continue;
    const exportDir = dirname(manifestPath);
    const abs = (p?: string) => (p ? (isAbsolute(p) ? p : resolve(exportDir, p)) : undefined);
    const dsm = abs(m.products.dsm?.tif);
    if (!dsm) continue;
    const lats = m.footprint.map((p) => p[1]), lngs = m.footprint.map((p) => p[0]);
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2, lon = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const hM = (Math.max(...lats) - Math.min(...lats)) * 110540;
    const wM = (Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos((lat * Math.PI) / 180);
    out.push({
      name: m.project?.name ?? e.name ?? 'Locus',
      output: e.output,
      updated: m.project?.updated ?? e.updated ?? '',
      centre: { lat, lon },
      sideKm: Math.max(0.5, Math.ceil((Math.max(hM, wM) * 1.1) / 100) / 10),
      source: { exportDir, dsm, dtm: abs(m.products.dtm?.tif), ortho: abs(m.products.ortho?.tif), vertical: m.vertical ?? 'EGM96', cellM: m.products.dsm?.cellM ?? 1 },
    });
  }
  return out.sort((a, b) => b.updated.localeCompare(a.updated));
}
