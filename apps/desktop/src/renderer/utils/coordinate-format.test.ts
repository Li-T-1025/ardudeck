import { describe, it, expect, beforeEach } from 'vitest';
import { parseDecimal, parseDms, parsePosition, formatPosition, coordinateFormatRegistry, BUILTIN_FORMATS } from './coordinate-format';
import { useSettingsStore } from '../stores/settings-store';

const near = (p: { lat: number; lon: number } | null, lat: number, lon: number) => {
  expect(p).not.toBeNull();
  expect(p!.lat).toBeCloseTo(lat, 4);
  expect(p!.lon).toBeCloseTo(lon, 4);
};

describe('reading positions', () => {
  it('reads decimal pairs the way people paste them', () => {
    near(parseDecimal('47.476857, 9.663978'), 47.476857, 9.663978);
    near(parseDecimal('47.476857 9.663978'), 47.476857, 9.663978);
    near(parseDecimal('-33.8688;151.2093'), -33.8688, 151.2093);
    near(parseDecimal('33.8688 S, 151.2093 E'), -33.8688, 151.2093);
    expect(parseDecimal('147.1, 9.6')).toBeNull();
    expect(parseDecimal('32T NT 123 456')).toBeNull();
  });

  it('reads degrees, minutes and seconds in either order', () => {
    near(parseDms(`47°28'36.7"N 9°39'50.3"E`), 47.476861, 9.663972);
    near(parseDms('47 28 36.7 N, 9 39 50.3 E'), 47.476861, 9.663972);
    near(parseDms(`9°39'50.3"E 47°28'36.7"N`), 47.476861, 9.663972);
    near(parseDms(`33°52'7.7"S 151°12'33.5"E`), -33.868806, 151.209306);
  });
});

describe('the chosen format', () => {
  beforeEach(() => {
    coordinateFormatRegistry.unregisterAll('test');
    useSettingsStore.setState({ coordinateFormat: 'decimal', coordinatePrecision: {} });
  });

  it('shows positions at the chosen precision', () => {
    expect(formatPosition(47.4768573, 9.6639778)).toBe('47.476857, 9.663978');
    useSettingsStore.setState({ coordinatePrecision: { decimal: 4 } });
    expect(formatPosition(47.4768573, 9.6639778)).toBe('47.4769, 9.6640');
    useSettingsStore.setState({ coordinateFormat: 'dms', coordinatePrecision: { dms: 0 } });
    expect(formatPosition(47.4768573, 9.6639778)).toBe(`47°28'37"N 9°39'50"E`);
  });

  it('uses a cargo format, and falls back to decimal when that cargo is gone', () => {
    coordinateFormatRegistry.register('test', 'grid', {
      id: 'grid', name: () => 'Grid',
      format: (lat, lon, p = 1) => `G ${lat.toFixed(p)}/${lon.toFixed(p)}`,
      parse: (text) => { const m = /^G (\S+)\/(\S+)$/.exec(text); return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null; },
      precisions: [{ value: 1, name: () => 'coarse' }, { value: 3, name: () => 'fine' }],
      defaultPrecision: 1,
    });
    useSettingsStore.setState({ coordinateFormat: 'test:grid', coordinatePrecision: { 'test:grid': 3 } });
    expect(formatPosition(47.4768, 9.664)).toBe('G 47.477/9.664');
    near(parsePosition('G 47.5/9.7'), 47.5, 9.7);
    // a decimal pair is always understood, whatever is chosen
    near(parsePosition('47.4769, 9.6640'), 47.4769, 9.664);
    coordinateFormatRegistry.unregisterAll('test');
    expect(formatPosition(47.4768573, 9.6639778)).toBe(BUILTIN_FORMATS[0]!.format(47.4768573, 9.6639778, 6));
  });
});
