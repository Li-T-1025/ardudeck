#!/usr/bin/env node
/**
 * generate-px4-event-metadata.mjs
 *
 * Decompresses PX4's `all_events.json.xz` into the JSON ArduDeck bundles at
 * apps/desktop/src/main/px4-events/px4-event-metadata.json.
 *
 * Since PX4 v1.13 most user-facing warnings and errors are NOT sent as
 * STATUSTEXT any more: they ride the MAVLink events interface (EVENT, msgid
 * 410), which carries only an event id plus packed arguments. The human text
 * lives in this metadata file, so without it a PX4 vehicle's arming failures
 * and failsafe reasons are invisible in the GCS.
 *
 * The file ships on the vehicle at /etc/extras/all_events.json.xz and is also
 * in every PX4 SITL bundle we build, which is where this script reads it from
 * by default. Keep it regenerated from the same PX4 ref as the SITL bundles.
 *
 * Usage:
 *   node scripts/generate-px4-event-metadata.mjs [path/to/all_events.json.xz]
 *
 * Node has no xz decoder, so decompression shells out to python3's lzma (in the
 * stdlib on macOS and Linux) and falls back to the `xz` binary.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'apps', 'desktop', 'src', 'main', 'px4-events', 'px4-event-metadata.json');

const DEFAULT_SOURCES = [
  path.join(homedir(), '.ardudeck', 'px4-sitl', 'stable', 'etc', 'extras', 'all_events.json.xz'),
  path.join(homedir(), '.ardudeck', 'px4-sitl', 'dev', 'etc', 'extras', 'all_events.json.xz'),
];

function unxz(file) {
  try {
    return execFileSync('python3', ['-c', 'import lzma,sys; sys.stdout.buffer.write(lzma.open(sys.argv[1]).read())', file], {
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return execFileSync('xz', ['-dc', file], { maxBuffer: 64 * 1024 * 1024 });
  }
}

const source = process.argv[2] ?? DEFAULT_SOURCES.find((p) => existsSync(p));
if (!source || !existsSync(source)) {
  console.error('error: no all_events.json.xz found. Pass one explicitly, or download a PX4 SITL bundle first.');
  console.error('tried:', DEFAULT_SOURCES.join(', '));
  process.exit(2);
}

const json = JSON.parse(unxz(source).toString('utf8'));

let events = 0;
for (const component of Object.values(json.components ?? {})) {
  for (const group of Object.values(component.event_groups ?? {})) {
    events += Object.keys(group.events ?? {}).length;
  }
}
if (events === 0) {
  console.error(`error: ${source} parsed but contains no events`);
  process.exit(1);
}

// The `translation` block is a per-language duplicate of every string. We only
// render English, so dropping it roughly halves the bundled file.
delete json.translation;

await writeFile(OUT, JSON.stringify(json));
console.log(`wrote ${OUT}`);
console.log(`  source:     ${source}`);
console.log(`  components: ${Object.keys(json.components ?? {}).length}`);
console.log(`  events:     ${events}`);
