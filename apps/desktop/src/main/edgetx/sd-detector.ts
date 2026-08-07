/**
 * EdgeTX SD card detection.
 *
 * An EdgeTX radio in "USB Storage (SD)" mode mounts as a plain mass-storage
 * volume. We identify EdgeTX cards by their characteristic directory
 * structure rather than volume names, which vary per radio and card.
 */

import { readdir, readFile, stat, statfs } from 'fs/promises';
import path from 'path';
import type { EdgeTxSdCard } from '../../shared/edgetx-types.js';

export type { EdgeTxSdCard };

/** Directories that mark a volume as an EdgeTX/OpenTX SD card. */
const REQUIRED_DIRS = ['SCRIPTS', 'RADIO'];

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check a single mounted volume for the EdgeTX SD signature.
 * Returns null when the volume is not an EdgeTX card.
 */
export async function probeVolume(volumePath: string): Promise<EdgeTxSdCard | null> {
  for (const dir of REQUIRED_DIRS) {
    if (!(await isDir(path.join(volumePath, dir)))) return null;
  }

  let sdCardVersion: string | null = null;
  try {
    sdCardVersion = (await readFile(path.join(volumePath, 'edgetx.sdcard.version'), 'utf8')).trim();
  } catch {
    // OpenTX-era cards and minimal cards lack the version file; the directory
    // signature alone is enough to operate on.
  }

  let freeBytes = 0;
  try {
    const fsStat = await statfs(volumePath);
    freeBytes = fsStat.bavail * fsStat.bsize;
  } catch {
    // statfs may fail on exotic filesystems; treat as unknown rather than skip
  }

  return {
    volumePath,
    volumeName: path.basename(volumePath),
    sdCardVersion,
    freeBytes,
    hasWidgets: await isDir(path.join(volumePath, 'WIDGETS')),
  };
}

/** Candidate mount roots per platform. */
async function candidateVolumes(): Promise<string[]> {
  if (process.platform === 'darwin') {
    try {
      const entries = await readdir('/Volumes');
      return entries.map((e) => path.join('/Volumes', e));
    } catch {
      return [];
    }
  }
  if (process.platform === 'win32') {
    // Probe drive letters D-Z; A-C are floppy/system by convention.
    return Array.from({ length: 23 }, (_, i) => `${String.fromCharCode(68 + i)}:\\`);
  }
  // Linux: common removable-media roots
  const roots = ['/media', `/run/media/${process.env.USER ?? ''}`];
  const found: string[] = [];
  for (const root of roots) {
    try {
      const entries = await readdir(root);
      for (const e of entries) found.push(path.join(root, e));
    } catch {
      // root doesn't exist on this distro; skip
    }
  }
  return found;
}

/** Scan all mounted volumes for EdgeTX SD cards. */
export async function scanForEdgeTxCards(): Promise<EdgeTxSdCard[]> {
  const volumes = await candidateVolumes();
  const results = await Promise.all(volumes.map((v) => probeVolume(v).catch(() => null)));
  return results.filter((r): r is EdgeTxSdCard => r !== null);
}
