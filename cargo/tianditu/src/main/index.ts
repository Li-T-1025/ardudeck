import type { BasemapRegistration, MainHostApi } from '@ardudeck/module-sdk';

/**
 * Tianditu (天地图) basemaps for ArduDeck.
 *
 * The tiles are fetched by the main process, never by the map itself, because
 * the provider key must stay out of the renderer. Tianditu issues two key types:
 * a browser-side key checked against the Referer, and a server-side key. Only
 * the server-side key works for a desktop app; pretending to be a browser to
 * borrow the other type is explicitly out of scope, so a key that is rejected
 * gets a message pointing the pilot at the console instead of a fake User-Agent.
 */

/** Where the key lives: OS-keychain backed, unlike `writeData`. */
const KEY_SLOT = 'tianditu.key';

/** Tianditu keys are 32 hex characters; anything else is a typo, not a key. */
const KEY_RE = /^[0-9a-f]{32}$/i;

/** Tianditu splits tile serving across t0..t7; the host rotates `{s}` over these. */
const SUBDOMAINS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];

const ATTRIBUTION = '© 天地图 · 国家地理信息公共服务平台 (Tianditu)';

interface LayerSpec {
  /** Entry id; the picker row is `basemap.<id>` in this cargo's namespace. */
  id: string;
  /** Fallback label, used where the cargo's strings are not loaded. */
  name: string;
  /** WMTS layer holding the visible imagery, vector or terrain. */
  base: string;
  /** Matching transparent label layer, composited over the base by the host. */
  overlay?: string;
  /**
   * Deepest zoom the provider actually serves. Tianditu stops at 18 for imagery
   * and vectors and 14 for terrain; past that the host upscales a parent tile
   * rather than asking for a tile that does not exist.
   */
  maxNativeZoom: number;
  /**
   * The style offered by a narrow picker (the flight-log overlay). Imagery is
   * the row pilots fly on, so the full-size pickers get all three styles and
   * the small one gets this.
   */
  primary?: boolean;
}

const LAYERS: LayerSpec[] = [
  { id: 'hybrid', name: 'Tianditu imagery', base: 'img', overlay: 'cia', maxNativeZoom: 18, primary: true },
  { id: 'vector', name: 'Tianditu vector', base: 'vec', overlay: 'cva', maxNativeZoom: 18 },
  { id: 'terrain', name: 'Tianditu terrain', base: 'ter', overlay: 'cta', maxNativeZoom: 14 },
];

/** `{z}/{x}/{y}` is what the host substitutes; `{s}` is the tile subdomain. */
function wmtsTemplate(layer: string, key: string): string {
  return (
    `https://{s}.tianditu.gov.cn/${layer}_w/wmts` +
    `?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}` +
    `&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
    `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${key}`
  );
}

function registrationFor(spec: LayerSpec, key: string): BasemapRegistration {
  return {
    id: spec.id,
    name: spec.name,
    urlTemplate: wmtsTemplate(spec.base, key),
    overlayUrlTemplate: spec.overlay ? wmtsTemplate(spec.overlay, key) : undefined,
    subdomains: SUBDOMAINS,
    attribution: ATTRIBUTION,
    minZoom: 1,
    maxZoom: 19,
    maxNativeZoom: spec.maxNativeZoom,
    primary: spec.primary,
  };
}

let host: MainHostApi | undefined;
let key: string | undefined;
/** Ids currently registered, so removing the key also clears what it added. */
const registered = new Set<string>();

function unregisterAll(): void {
  if (!host) return;
  for (const id of registered) host.basemaps.unregister(id);
  registered.clear();
}

/** (Re)publish `LAYERS` for `next`, or clear them when there is no key. */
function applyKey(next: string | undefined): void {
  unregisterAll();
  key = next;
  if (!host || !key) return;
  for (const spec of LAYERS) {
    const reg = registrationFor(spec, key);
    host.basemaps.register(reg);
    registered.add(reg.id);
  }
}

function readKey(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const raw = (data as { key?: unknown }).key;
  return typeof raw === 'string' ? raw.trim() : '';
}

export async function activate(api: MainHostApi): Promise<void> {
  host = api;

  const stored = await api.secureRead(KEY_SLOT);
  // A key length that no longer matches is a corrupted entry, not a usable key.
  const initial = stored && KEY_RE.test(stored.trim()) ? stored.trim() : undefined;
  applyKey(initial);

  api.onRendererMessage('status', () => ({
    hasKey: Boolean(key),
    layers: LAYERS.map((l) => ({ id: l.id, name: l.name })),
  }));

  api.onRendererMessage('setKey', async (data) => {
    const value = readKey(data);
    if (!KEY_RE.test(value)) return { ok: false, error: 'keyInvalid' };
    try {
      await api.secureWrite(KEY_SLOT, value);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    applyKey(value);
    return { ok: true };
  });

  api.onRendererMessage('clearKey', async () => {
    await api.secureWrite(KEY_SLOT, '');
    applyKey(undefined);
    return { ok: true };
  });

  api.log(
    'info',
    initial ? `Tianditu basemaps ready (${LAYERS.length} layers)` : 'Tianditu basemaps waiting for a key',
  );
}

export function deactivate(): void {
  unregisterAll();
  host = undefined;
  key = undefined;
}
