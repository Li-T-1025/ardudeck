import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COPTER_MODES, PLANE_MODES, ROVER_MODES } from '@ardudeck/vehicle-core';
import { FALLBACK_META, getModeInfo, getModesForCategory, type VehicleCategory } from './flight-mode-meta';

const SOURCES: Array<[VehicleCategory, Record<number, string>]> = [['copter', COPTER_MODES], ['plane', PLANE_MODES], ['rover', ROVER_MODES]];

describe('flight mode tables follow vehicle-core', () => {
  it.each(SOURCES)('%s: every mode number vehicle-core knows renders under its name', (category, source) => {
    const modes = getModesForCategory(category);
    for (const [num, name] of Object.entries(source)) {
      expect(modes[Number(num)]?.name, `${category} mode ${num}`).toBe(name);
      expect(getModeInfo(Number(num), category).name).toBe(name);
    }
    expect(Object.keys(modes)).toHaveLength(Object.keys(source).length);
  });

  it('issue 147: Rover Dock and Circle, Copter Heli_Autorotate and Auto RTL have their own meta', () => {
    for (const [category, num] of [['rover', 8], ['rover', 9], ['copter', 26], ['copter', 27]] as const) {
      const info = getModeInfo(num, category);
      expect(info.name).not.toBe('Unknown');
      expect(info.descriptionKey).not.toBe(FALLBACK_META.descriptionKey);
    }
  });

  it('every description key exists in the English and German locale', () => {
    const load = (lang: string) => JSON.parse(readFileSync(new URL(`../../../shared/i18n/locales/${lang}/mavlink-config.json`, import.meta.url), 'utf8')) as { flightModesTab: { modeDesc: Record<string, string> } };
    const en = load('en').flightModesTab.modeDesc;
    const de = load('de').flightModesTab.modeDesc;
    const keys = new Set<string>([FALLBACK_META.descriptionKey]);
    for (const [category] of SOURCES) for (const m of Object.values(getModesForCategory(category))) keys.add(m.descriptionKey);
    for (const key of keys) {
      const leaf = key.replace('mavlink-config:flightModesTab.modeDesc.', '');
      expect(en[leaf], key).toBeTruthy();
      expect(de[leaf], key).toBeTruthy();
    }
  });
});
