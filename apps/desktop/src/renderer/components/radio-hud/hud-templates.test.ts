import { describe, expect, it } from 'vitest';
import { HUD_TEMPLATES, MAX_PAGES, TILE_META, firstRunPages, hudVehicleKind } from './hud-model';

describe('hud templates', () => {
  it('maps vehicle classes to gallery kinds, boats by MAV_TYPE', () => {
    expect(hudVehicleKind('vtol')).toBe('plane');
    expect(hudVehicleKind('rover', 11)).toBe('boat');
    expect(hudVehicleKind('rover', 10)).toBe('rover');
    expect(hudVehicleKind('copter')).toBe('copter');
  });

  it('offers at least one template for every kind', () => {
    for (const kind of ['copter', 'plane', 'rover', 'boat', 'sub'] as const) {
      expect(HUD_TEMPLATES.some((t) => t.vehicles.includes(kind))).toBe(true);
    }
  });

  it('keeps templates within the page limit and to known tiles', () => {
    for (const tpl of HUD_TEMPLATES) {
      expect(tpl.pages.length).toBeGreaterThan(0);
      expect(tpl.pages.length).toBeLessThanOrEqual(MAX_PAGES);
      for (const tile of tpl.pages.flat()) expect(TILE_META[tile.id]).toBeDefined();
    }
  });

  it('starts a rover on its multi-screen set, as copies', () => {
    const pages = firstRunPages('rover');
    expect(pages.length).toBe(3);
    pages[0]![0]!.x = 999;
    expect(firstRunPages('rover')[0]![0]!.x).not.toBe(999);
  });
});
