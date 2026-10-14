import { describe, it, expect } from 'vitest';
import { allFormats, coordinateFormatRegistry } from '../../utils/coordinate-format';

describe('a coordinate format from a cargo', () => {
  it('reaches the list the setting shows', async () => {
    const { createRendererHostApi } = await import('../module-host-renderer');
    const host = createRendererHostApi('com.ardudeck.mgrs', () => {}, []);
    host.coordinates.registerFormat({ id: 'mgrs', name: () => 'MGRS', format: () => 'x', parse: () => null });
    expect(coordinateFormatRegistry.list().map((e) => e.id)).toContain('mgrs');
    expect(allFormats(coordinateFormatRegistry.list()).map((f) => f.id)).toContain('com.ardudeck.mgrs:mgrs');
  });

  it('lets the cargo switch the pilot between its format and lat/lon', async () => {
    const { createRendererHostApi } = await import('../module-host-renderer');
    const { useSettingsStore } = await import('../../stores/settings-store');
    const host = createRendererHostApi('com.ardudeck.mgrs', () => {}, []);
    const seen: string[] = [];
    const off = host.coordinates.subscribe((c) => seen.push(c));
    host.coordinates.select('mgrs');
    expect(useSettingsStore.getState().coordinateFormat).toBe('com.ardudeck.mgrs:mgrs');
    expect(host.coordinates.current()).toBe('mgrs');
    host.coordinates.select('decimal');
    expect(host.coordinates.current()).toBe('decimal');
    useSettingsStore.getState().setCoordinateFormat('com.other:grid');
    expect(host.coordinates.current()).toBe('other');
    expect(seen).toEqual(['mgrs', 'decimal', 'other']);
    off();
  });
});
