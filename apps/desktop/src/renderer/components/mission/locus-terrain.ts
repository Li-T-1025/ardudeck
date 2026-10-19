import { useEffect, useMemo } from 'react';
import { pointInRing, useTileSourceStore } from '../../stores/tile-source-store';
import { useModuleStore } from '../../stores/module-store';
import { useNavigationStore } from '../../stores/navigation-store';
import type { TileSourceEntry } from '../../../shared/tile-source-types';

export const LOCUS_SLUG = 'com.ardudeck.locus';

export type LocusTerrain =
  | { status: 'covered'; source: TileSourceEntry }
  | { status: 'installed' }
  | { status: 'absent' };

/** Whether a Locus survey surface covers every given point, so terrain following can use it. */
export function useLocusTerrain(points: Array<{ latitude: number; longitude: number }>): LocusTerrain {
  const entries = useTileSourceStore((s) => s.entries);
  const installed = useModuleStore((s) => s.modules.some((m) => m.slug === LOCUS_SLUG));
  return useMemo(() => {
    const source = entries.find((e) => e.slug === LOCUS_SLUG && e.kind === 'dem'
      && points.length > 0 && points.every((p) => pointInRing(p.latitude, p.longitude, e.footprint)));
    if (source) return { status: 'covered', source };
    return installed || entries.some((e) => e.slug === LOCUS_SLUG) ? { status: 'installed' } : { status: 'absent' };
  }, [entries, installed, points]);
}

/** Whether Locus is listed in the Hangar for this pilot, so a link to it leads somewhere. */
export function useLocusListed(): boolean {
  const listed = useModuleStore((s) => s.catalog.some((c) => c.slug === LOCUS_SLUG));
  const loaded = useModuleStore((s) => s.catalog.length > 0 || s.catalogLoading || s.catalogError !== null);
  useEffect(() => {
    if (!loaded) void useModuleStore.getState().fetchCatalog();
  }, [loaded]);
  return listed;
}

/** Locus's page in the Cargo view, to install or open it. */
export function openLocusListing(): void {
  useNavigationStore.getState().setView('modules');
  void useModuleStore.getState().openDetail(LOCUS_SLUG);
}
