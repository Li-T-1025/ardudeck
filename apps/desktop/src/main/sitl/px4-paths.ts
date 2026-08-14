/**
 * Where the PX4 SITL bundle lives on disk.
 *
 * Shared by the downloader (writes it) and the process manager (runs it) so the
 * two can never disagree.
 *
 * THE PATH MUST NOT CONTAIN A SPACE. PX4's ROMFS startup scripts interpolate
 * the rootfs prefix unquoted, e.g. in etc/init.d-posix/rcS:
 *
 *   for f in ${R}etc/init.d-posix/airframes/"$(param show -q SYS_AUTOSTART)"_*
 *   . ${R}etc/init.d/rc.vehicle_setup
 *
 * so one space word-splits the glob and px4 dies with
 * "Error: no autostart file found (...)" before any airframe is configured.
 * px4 builds that prefix from getcwd() of its working dir, and getcwd() returns
 * the PHYSICAL path, so running it through a space-free symlink does not help:
 * the real, spaced path comes straight back.
 *
 * macOS userData is "~/Library/Application Support/@ardudeck/desktop", which
 * always has a space, so the bundle cannot live there. Use userData when it is
 * space-free (Linux, Windows) and fall back to a dot-dir in $HOME otherwise.
 */

import { app } from 'electron';
import os from 'node:os';
import path from 'node:path';
import type { Px4ReleaseTrack } from '../../shared/ipc-channels.js';

const HAS_SPACE = /\s/;

/** Root holding one directory per release track. */
export function px4SitlBasePath(): string {
  const candidates = [
    path.join(app.getPath('userData'), 'px4-sitl'),
    path.join(app.getPath('home'), '.ardudeck', 'px4-sitl'),
    path.join(os.tmpdir(), 'ardudeck-px4-sitl'),
  ];
  const usable = candidates.find((candidate) => !HAS_SPACE.test(candidate));
  if (usable) return usable;

  // Only reachable when the username itself contains a space. Nothing we can do
  // from here, but say so loudly: the failure downstream is an opaque PX4 error.
  console.error(
    '[px4-sitl] no space-free location for the bundle (tried:',
    candidates.join(', '),
    ') - PX4 SITL cannot start from a path containing spaces',
  );
  return candidates[0]!;
}

/** Bundle root for a track: `<base>/<track>/` (holds bin/, etc/, rootfs/). */
export function px4SitlBundleDir(track: Px4ReleaseTrack): string {
  return path.join(px4SitlBasePath(), track);
}

/** True when `bundleDir` is unusable because PX4's scripts will split on it. */
export function px4PathHasSpace(bundleDir: string): boolean {
  return HAS_SPACE.test(bundleDir);
}
