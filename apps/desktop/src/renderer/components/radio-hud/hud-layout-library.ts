/**
 * Named HUD layouts kept in ArduDeck, the way the map cockpit keeps its saved
 * layouts. The radio then has one job, taking the layout you picked, instead of
 * being the place your work lives: before this, the only copy of a composition
 * was whichever config file happened to be on the card.
 */

import type { TileDef } from './hud-model';

export interface SavedHudLayout {
  name: string;
  /** Screen the pages were authored on, so another radio class rescales. */
  screen: { w: number; h: number };
  pages: TileDef[][];
  savedAt: string;
}

const STORAGE_KEY = 'radio-hud.layouts';

function isTile(v: unknown): v is TileDef {
  const t = v as TileDef | undefined;
  return !!t && typeof t.id === 'string'
    && Number.isFinite(t.x) && Number.isFinite(t.y)
    && Number.isFinite(t.w) && Number.isFinite(t.h);
}

/** Drops anything that is not a layout rather than throwing: this is user data
 * from disk, and one bad entry must not cost the rest. */
export function sanitizeLayouts(raw: unknown): SavedHudLayout[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedHudLayout[] = [];
  for (const entry of raw) {
    const e = entry as Partial<SavedHudLayout> | undefined;
    if (!e || typeof e.name !== 'string' || !e.name.trim()) continue;
    if (!Array.isArray(e.pages) || e.pages.length === 0) continue;
    const pages = e.pages
      .map((p) => (Array.isArray(p) ? p.filter(isTile) : []))
      .filter((p) => p.length > 0);
    if (pages.length === 0) continue;
    out.push({
      name: e.name.trim(),
      pages,
      screen: {
        w: Number(e.screen?.w) || 480,
        h: Number(e.screen?.h) || 320,
      },
      savedAt: typeof e.savedAt === 'string' ? e.savedAt : new Date().toISOString(),
    });
  }
  return out;
}

export function loadLayouts(): SavedHudLayout[] {
  try {
    return sanitizeLayouts(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function persistLayouts(layouts: SavedHudLayout[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  } catch {
    // storage full or blocked: the layouts stay for this session
  }
}

/** Saving under a name that exists replaces it, so re-saving is an update. */
export function upsertLayout(layouts: SavedHudLayout[], next: SavedHudLayout): SavedHudLayout[] {
  const name = next.name.trim();
  if (!name) return layouts;
  const without = layouts.filter((l) => l.name !== name);
  return [...without, { ...next, name }].sort((a, b) => a.name.localeCompare(b.name));
}

/** A name not already taken, so "New" never silently replaces something. */
export function uniqueLayoutName(layouts: SavedHudLayout[], base: string): string {
  if (!layouts.some((l) => l.name === base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`;
    if (!layouts.some((l) => l.name === candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}

/** Renames in place, keeping the list's order stable. Refuses a name that is
 * blank or already in use rather than merging two layouts into one. */
export function renameLayout(
  layouts: SavedHudLayout[],
  from: string,
  to: string,
): { layouts: SavedHudLayout[]; renamed: boolean } {
  const name = to.trim();
  if (!name || name === from) return { layouts, renamed: false };
  if (layouts.some((l) => l.name === name)) return { layouts, renamed: false };
  const found = layouts.find((l) => l.name === from);
  if (!found) return { layouts, renamed: false };
  return {
    layouts: upsertLayout(removeLayout(layouts, from), { ...found, name }),
    renamed: true,
  };
}

export function removeLayout(layouts: SavedHudLayout[], name: string): SavedHudLayout[] {
  return layouts.filter((l) => l.name !== name);
}
