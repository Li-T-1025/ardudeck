/**
 * Weather API utility using Open-Meteo's free forecast service.
 * https://open-meteo.com/en/docs
 *
 * - Free, no API key required (same provider as the elevation client)
 * - Site-specific gridded forecast: wind at 10m, gusts, temperature, precip
 * - Daily sunrise/sunset for the daylight window
 *
 * Used by the flight briefing panel to show current conditions at the mission
 * site. Wind here is the meteorological convention: the direction the wind is
 * blowing FROM, in degrees.
 */

const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

// Place-name lookups are user-driven and cheap to repeat; a short per-query TTL
// keeps repeated keystrokes off the wire without staleness mattering.
const GEOCODE_TTL_MS = 5 * 60 * 1000;

// Conditions change slowly relative to planning; cache per rounded site for a
// few minutes so panning/recompute doesn't hammer the API.
const WEATHER_TTL_MS = 10 * 60 * 1000;

export interface WeatherSummary {
  windSpeedMs: number;
  windGustMs: number;
  windDirDeg: number;   // direction the wind comes FROM
  tempC: number;
  precipMm: number;
  /** Chance of precipitation for the current hour, percent (0-100). */
  precipProbPct: number;
  /** Total cloud cover, percent (0-100). */
  cloudCoverPct: number;
  /** Horizontal visibility at the surface, metres. */
  visibilityM: number;
  /** Surface (station-level) pressure, hectopascals. */
  pressureHpa: number;
  sunriseIso: string | null;
  sunsetIso: string | null;
  /** "Now" in the SITE's timezone, so daylight-margin math stays correct. */
  currentTimeIso: string | null;
  fetchedAtMs: number;
}

const weatherCache = new Map<string, WeatherSummary>();

function cacheKey(lat: number, lon: number): string {
  // ~1km precision is plenty for a forecast; keeps the cache warm across edits.
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/**
 * Fetch current conditions + today's daylight window for a site. Returns null
 * on any failure so callers can degrade gracefully (the briefing just omits
 * the weather card).
 */
export async function getCurrentWeather(lat: number, lon: number): Promise<WeatherSummary | null> {
  const key = cacheKey(lat, lon);
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.fetchedAtMs < WEATHER_TTL_MS) {
    return cached;
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,precipitation,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    // precipitation_probability and visibility are hourly-only variables in
    // Open-Meteo (no "current" equivalent), so we pull the hour matching
    // current.time out of these series below.
    hourly: 'precipitation_probability,visibility',
    daily: 'sunrise,sunset',
    wind_speed_unit: 'ms',
    timezone: 'auto',
    forecast_days: '1',
  });

  try {
    const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`);
    if (!response.ok) {
      console.warn('Weather API error:', response.status);
      return null;
    }
    const data = await response.json();
    const c = data?.current;
    if (!c) return null;

    const hourly = data?.hourly;
    const hourIdx = hourlyIndexForTime(hourly?.time, c.time);
    const precipProbPct = Number(hourly?.precipitation_probability?.[hourIdx] ?? 0);
    const visibilityM = Number(hourly?.visibility?.[hourIdx] ?? 0);

    const summary: WeatherSummary = {
      windSpeedMs: Number(c.wind_speed_10m ?? 0),
      windGustMs: Number(c.wind_gusts_10m ?? 0),
      windDirDeg: Number(c.wind_direction_10m ?? 0),
      tempC: Number(c.temperature_2m ?? 0),
      precipMm: Number(c.precipitation ?? 0),
      precipProbPct,
      cloudCoverPct: Number(c.cloud_cover ?? 0),
      visibilityM,
      pressureHpa: Number(c.surface_pressure ?? 0),
      sunriseIso: data?.daily?.sunrise?.[0] ?? null,
      sunsetIso: data?.daily?.sunset?.[0] ?? null,
      currentTimeIso: c.time ?? null,
      fetchedAtMs: Date.now(),
    };
    weatherCache.set(key, summary);
    return summary;
  } catch (error) {
    console.warn('Failed to fetch weather:', error);
    return null;
  }
}

// Open-Meteo hourly series and the current block share a timezone, so match the
// hour by its "YYYY-MM-DDTHH" prefix. Falls back to the first hour when the
// current time is missing or absent from the series.
function hourlyIndexForTime(times: string[] | undefined, currentTime: string | undefined): number {
  if (!Array.isArray(times) || times.length === 0) return 0;
  if (!currentTime) return 0;
  const hourKey = currentTime.slice(0, 13);
  const idx = times.findIndex((t) => typeof t === 'string' && t.slice(0, 13) === hourKey);
  return idx >= 0 ? idx : 0;
}

export interface GeocodeResult {
  id: number;
  name: string;
  lat: number;
  lon: number;
  /** First-level admin area (state/region), when the provider returns one. */
  admin1?: string;
  country?: string;
  countryCode?: string;
}

interface GeocodeCacheEntry {
  results: GeocodeResult[];
  fetchedAtMs: number;
}

const geocodeCache = new Map<string, GeocodeCacheEntry>();

/**
 * Search places by name via Open-Meteo's free geocoding endpoint (no API key).
 * Returns [] on any failure or empty query so the caller can degrade quietly.
 */
export async function searchLocations(query: string, count = 6): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const key = `${q.toLowerCase()}|${count}`;
  const cached = geocodeCache.get(key);
  if (cached && Date.now() - cached.fetchedAtMs < GEOCODE_TTL_MS) {
    return cached.results;
  }

  const params = new URLSearchParams({
    name: q,
    count: String(count),
    language: 'en',
    format: 'json',
  });

  try {
    const response = await fetch(`${OPEN_METEO_GEOCODING_URL}?${params.toString()}`);
    if (!response.ok) {
      console.warn('Geocoding API error:', response.status);
      return [];
    }
    const data = await response.json();
    const rows = Array.isArray(data?.results) ? data.results : [];
    const results: GeocodeResult[] = rows
      .filter((r: unknown): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map((r: Record<string, unknown>) => ({
        id: Number(r.id ?? `${r.latitude}${r.longitude}`),
        name: String(r.name ?? ''),
        lat: Number(r.latitude ?? 0),
        lon: Number(r.longitude ?? 0),
        admin1: r.admin1 ? String(r.admin1) : undefined,
        country: r.country ? String(r.country) : undefined,
        countryCode: r.country_code ? String(r.country_code) : undefined,
      }))
      .filter((r: GeocodeResult) => r.name && hasFiniteCoords(r.lat, r.lon));

    geocodeCache.set(key, { results, fetchedAtMs: Date.now() });
    return results;
  } catch (error) {
    console.warn('Failed to geocode:', error);
    return [];
  }
}

function hasFiniteCoords(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** Compass abbreviation (N, NE, ...) for a bearing in degrees. */
export function compassPoint(deg: number): string {
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(((deg % 360) / 45)) % 8]!;
}
