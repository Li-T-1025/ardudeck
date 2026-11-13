import { useEffect, useState } from 'react';
import { i18n } from '../../shared/i18n/index';
import {
  moduleBasemapLayersVersion,
  narrowModuleBasemapKeys,
  setModuleBasemapLayers,
  setModuleBasemapNameResolver,
  subscribeModuleBasemapLayers,
} from '../../shared/map-layers';
import type { PublicModuleBasemapEntry } from '../../shared/module-basemap-types';
import { cargoNamespace } from './slug-registry';

/**
 * Bridge between the basemaps cargos registered in the main process and the
 * layer pickers in this window. The main process keeps the templates (and any
 * provider key in them); this side only receives rows.
 *
 * Labels come from the cargo's own strings (`basemap.<id>` in its
 * `cargo.<slug>` namespace) and are resolved when a picker draws, so a bundle
 * that arrives after the first list still names the rows correctly, and a
 * language switch does not need a restart.
 */

let entries: PublicModuleBasemapEntry[] = [];
let started = false;
const listeners = new Set<() => void>();

function displayName(entry: PublicModuleBasemapEntry): string {
  const key = `${cargoNamespace(entry.slug)}:basemap.${entry.id}`;
  const translated = i18n.t(key);
  // i18next hands back the key itself when the cargo ships no such string.
  return translated === key ? entry.name : translated;
}

export function applyModuleBasemaps(list: PublicModuleBasemapEntry[]): void {
  entries = list;
  setModuleBasemapLayers(
    list.map((e) => ({
      key: e.layerKey,
      name: e.name,
      attribution: e.attribution,
      minZoom: e.minZoom,
      maxZoom: e.maxZoom ?? 19,
      primary: e.primary,
    })),
  );
  for (const l of listeners) l();
}

function init(): void {
  if (started) return;
  started = true;
  setModuleBasemapNameResolver((layerKey, fallback) => {
    const entry = entries.find((e) => e.layerKey === layerKey);
    return entry ? displayName(entry) : fallback;
  });
  void window.electronAPI
    .moduleBasemapsList()
    .then(applyModuleBasemaps)
    .catch((err: unknown) => console.warn('[module-basemaps] list failed', err));
  window.electronAPI.onModuleBasemapsChanged(applyModuleBasemaps);
  // The strings arrive with the cargo's renderer, which may activate after this
  // list; the resolver covers that, and a language switch re-renders the rows.
  i18n.on('languageChanged', () => applyModuleBasemaps(entries));
}

/**
 * The cargo basemaps for this render. Call it in the panel that owns a layer
 * picker: the returned key list and version keep the picker in step with
 * cargo load, unload and a language change.
 *
 * `narrowKeys` is the subset a small overlay picker should offer (the rows a
 * cargo marked `primary`); it falls back to `keys` when nothing was marked.
 */
export function useModuleBasemaps(): { keys: string[]; narrowKeys: string[]; version: number } {
  const [version, setVersion] = useState(moduleBasemapLayersVersion());
  useEffect(() => {
    init();
    return subscribeModuleBasemapLayers(() => setVersion(moduleBasemapLayersVersion()));
  }, []);
  return {
    keys: entries.map((e) => e.layerKey),
    narrowKeys: narrowModuleBasemapKeys(),
    version,
  };
}
