import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COPTER_MODES, PLANE_MODES, ROVER_MODES } from '@ardudeck/vehicle-core';
import { FALLBACK_META, getModeInfo, getModesForCategory, type VehicleCategory } from './flight-mode-meta';
import { FLIGHT_MODES } from '../../../shared/flight-mode-meta';
import { Shield, ShieldCheck } from 'lucide-react';
import { modeIcon } from '../panels/flight-modes/mode-icons';
import { modeClip, FALLBACK_CLIP } from '../radio-hud/mode-voice';

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

  it('plane 5 and 6 carry the pilot names FBWA and FBWB everywhere they are shown or spoken', () => {
    expect(PLANE_MODES[5]).toBe('FBWA');
    expect(PLANE_MODES[6]).toBe('FBWB');
    for (const cls of ['plane', 'vtol'] as const) {
      const picker = FLIGHT_MODES[cls];
      expect(picker.find((m) => m.modeNum === 5)?.name).toBe('FBWA');
      expect(picker.find((m) => m.modeNum === 6)?.name).toBe('FBWB');
      // the icon table keys on the name, so a rename must be followed there
      expect(modeIcon(picker.find((m) => m.modeNum === 5)!)).toBe(Shield);
      expect(modeIcon(picker.find((m) => m.modeNum === 6)!)).toBe(ShieldCheck);
    }
    expect(modeClip(PLANE_MODES[5]!)).toBe('mode_fbwa');
    expect(modeClip(PLANE_MODES[6]!)).toBe('mode_fbwb');
    expect(modeClip(PLANE_MODES[5]!)).not.toBe(FALLBACK_CLIP);
  });
});
