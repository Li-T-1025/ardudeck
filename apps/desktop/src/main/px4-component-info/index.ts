/**
 * PX4 component information: metadata fetched FROM the vehicle.
 *
 * ArduDeck bundles PX4's parameter and event metadata for the release its SITL
 * bundles are built from, which covers stock firmware. A vehicle running a
 * custom or newer build has parameters and events the bundled copies do not
 * know about, and it carries its own definitions on board.
 *
 * The MAVLink component information service (https://mavlink.io/en/services/
 * component_information.html) exposes them:
 *
 *   1. Request COMPONENT_METADATA (397, or the deprecated COMPONENT_INFORMATION
 *      395) with MAV_CMD_REQUEST_MESSAGE. The reply carries a URI and a CRC.
 *   2. Download that general metadata file over MAVLink FTP. It lists further
 *      files by type: 1 = parameters, 4 = events, 5 = actuators.
 *   3. Download the ones we use and merge them over the bundled defaults.
 *
 * Every file is xz-compressed, which Node cannot decompress natively, hence the
 * xz-decompress dependency (MIT, no transitive deps, WASM decoder).
 *
 * All of this is best-effort: any failure leaves the bundled metadata in place,
 * so a vehicle that does not implement the service behaves exactly as before.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import xzDecompress from 'xz-decompress';
import {
  parsePx4ParameterMetadata,
} from '../px4-parameter-metadata.js';
import type { ParameterMetadataStore } from '../../shared/parameter-metadata.js';
import type { Px4EventMetadata } from '../px4-events/px4-event-format.js';

const { XzReadableStream } = xzDecompress;

/** COMP_METADATA_TYPE values we care about. */
export const COMP_METADATA_TYPE = {
  GENERAL: 0,
  PARAMETER: 1,
  COMMANDS: 2,
  PERIPHERALS: 3,
  EVENTS: 4,
  ACTUATORS: 5,
} as const;

export interface ComponentMetadataEntry {
  type: number;
  /** On-vehicle location, e.g. `mftp://etc/extras/parameters.json.xz`. */
  uri?: string;
  /** Public mirror, used only when the vehicle transfer fails. */
  uriFallback?: string;
  fileCrc?: number;
}

/** xz files start with the 6-byte magic FD 37 7A 58 5A 00. */
function isXz(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0xfd && bytes[1] === 0x37 && bytes[2] === 0x7a &&
    bytes[3] === 0x58 && bytes[4] === 0x5a && bytes[5] === 0x00
  );
}

/**
 * Decode a metadata file to JSON. The spec says files "may be" xz compressed
 * and the URI extension is not authoritative, so sniff the magic instead.
 */
export async function decodeMetadataFile(bytes: Uint8Array): Promise<unknown> {
  let text: string;
  if (isXz(bytes)) {
    const source = new Blob([bytes as BlobPart]).stream();
    text = await new Response(new XzReadableStream(source)).text();
  } else {
    text = new TextDecoder().decode(bytes);
  }
  return JSON.parse(text);
}

/**
 * Turn a `mftp://` URI into the absolute MAVLink FTP path the client wants.
 * PX4 emits `mftp://etc/extras/x.json.xz` (host-relative, no leading slash);
 * the spec also allows `mavlinkftp://`. Returns null for http(s) URIs, which
 * are handled as a fallback rather than over FTP.
 */
export function mftpPathFromUri(uri: string): string | null {
  const match = /^(?:mftp|mavlinkftp):\/\/(.*)$/i.exec(uri.trim());
  if (!match) return null;
  const rest = match[1] ?? '';
  return rest.startsWith('/') ? rest : `/${rest}`;
}

/** Pull the metadata file list out of a decoded component_general.json. */
export function parseComponentGeneral(json: unknown): ComponentMetadataEntry[] {
  if (!json || typeof json !== 'object') return [];
  const raw = (json as { metadataTypes?: unknown }).metadataTypes;
  if (!Array.isArray(raw)) return [];

  const entries: ComponentMetadataEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { type, uri, uriFallback, fileCrc } = item as Record<string, unknown>;
    if (typeof type !== 'number') continue;
    entries.push({
      type,
      uri: typeof uri === 'string' ? uri : undefined,
      uriFallback: typeof uriFallback === 'string' ? uriFallback : undefined,
      fileCrc: typeof fileCrc === 'number' ? fileCrc : undefined,
    });
  }
  return entries;
}

export interface Px4ComponentInfoDeps {
  /** Download an absolute path over MAVLink FTP; null on any failure. */
  downloadFile: (ftpPath: string) => Promise<Uint8Array | null>;
  log: (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void;
  /** Directory for the CRC-keyed cache. Omit to disable caching. */
  cacheDir?: string;
  /** Injected for tests. Defaults to global fetch. */
  httpGet?: (url: string) => Promise<Uint8Array | null>;
}

export interface Px4ComponentInfoResult {
  parameters?: ParameterMetadataStore;
  events?: Px4EventMetadata;
}

async function defaultHttpGet(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Fetch one metadata file, preferring the vehicle copy and falling back to the
 * public mirror. A CRC-keyed disk cache short-circuits the transfer entirely on
 * later connections, which matters over a 57k telemetry link where the
 * parameter file alone is ~66 KB.
 */
async function fetchEntry(
  entry: ComponentMetadataEntry,
  deps: Px4ComponentInfoDeps,
  label: string,
): Promise<unknown | null> {
  const cacheFile = deps.cacheDir && entry.fileCrc !== undefined
    ? path.join(deps.cacheDir, `${label}-${entry.fileCrc >>> 0}.json`)
    : null;

  if (cacheFile) {
    try {
      const cached = await readFile(cacheFile, 'utf8');
      deps.log('debug', `PX4 component info: ${label} served from cache (crc ${entry.fileCrc})`);
      return JSON.parse(cached);
    } catch {
      // Not cached yet.
    }
  }

  let bytes: Uint8Array | null = null;
  const ftpPath = entry.uri ? mftpPathFromUri(entry.uri) : null;
  if (ftpPath) {
    deps.log('debug', `PX4 component info: fetching ${label} from vehicle at ${ftpPath}`);
    bytes = await deps.downloadFile(ftpPath);
  }
  if (!bytes && entry.uriFallback) {
    deps.log('warn', `PX4 component info: vehicle transfer failed for ${label}, trying ${entry.uriFallback}`);
    bytes = await (deps.httpGet ?? defaultHttpGet)(entry.uriFallback);
  }
  if (!bytes || bytes.length === 0) return null;

  let json: unknown;
  try {
    json = await decodeMetadataFile(bytes);
  } catch (err) {
    deps.log('warn', `PX4 component info: could not decode ${label}: ${(err as Error).message}`);
    return null;
  }

  if (cacheFile) {
    try {
      await mkdir(path.dirname(cacheFile), { recursive: true });
      await writeFile(cacheFile, JSON.stringify(json));
    } catch {
      // Cache write is an optimisation, never a hard failure.
    }
  }

  return json;
}

/**
 * Walk the component information chain starting from the general metadata URI
 * the vehicle reported. Returns whatever it managed to fetch; callers keep
 * their bundled defaults for anything missing.
 */
export async function fetchPx4ComponentMetadata(
  general: ComponentMetadataEntry,
  deps: Px4ComponentInfoDeps,
): Promise<Px4ComponentInfoResult> {
  const generalJson = await fetchEntry({ ...general, type: COMP_METADATA_TYPE.GENERAL }, deps, 'general');
  if (!generalJson) {
    deps.log('warn', 'PX4 component info: could not read the general metadata file');
    return {};
  }

  const entries = parseComponentGeneral(generalJson);
  if (entries.length === 0) {
    deps.log('warn', 'PX4 component info: general metadata listed no files');
    return {};
  }

  const result: Px4ComponentInfoResult = {};

  const paramEntry = entries.find((e) => e.type === COMP_METADATA_TYPE.PARAMETER);
  if (paramEntry) {
    const json = await fetchEntry(paramEntry, deps, 'parameters');
    if (json) {
      const store = parsePx4ParameterMetadata(json);
      const count = Object.keys(store).length;
      if (count > 0) {
        result.parameters = store;
        deps.log('info', `PX4 component info: ${count} parameter definitions from the vehicle`);
      }
    }
  }

  const eventEntry = entries.find((e) => e.type === COMP_METADATA_TYPE.EVENTS);
  if (eventEntry) {
    const json = await fetchEntry(eventEntry, deps, 'events');
    if (json && typeof json === 'object' && (json as Px4EventMetadata).components) {
      result.events = json as Px4EventMetadata;
      deps.log('info', 'PX4 component info: event definitions from the vehicle');
    }
  }

  return result;
}
