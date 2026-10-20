/** Radio HUD model shared by the studio, its panels and the template gallery. */
import type { ArduPilotVehicleClass } from '../../../shared/telemetry-types';

/** Radio screen classes the HUD runs on (ids match the installer's
 *  RADIO_VARIANTS). Color radios get the widget (presets authored @480x320
 *  and rescaled); B&W radios get the fixed-layout telemetry script. */
export interface ScreenModel {
  variant: string;
  label: string;
  w: number;
  h: number;
  /** monochrome telemetry script target: fixed layout, no tile editing */
  bw?: boolean;
}
export const SCREEN_MODELS: ScreenModel[] = [
  { variant: 'c480x320', label: 'TX15 (480x320)', w: 480, h: 320 }, // i18n-exempt
  { variant: 'c480x272', label: 'TX16S / T16 / T18 / X10 (480x272)', w: 480, h: 272 }, // i18n-exempt
  { variant: 'c800x480', label: 'TX16S mkIII (800x480)', w: 800, h: 480 }, // i18n-exempt
  { variant: 'c320x480', label: 'NV14 / EL18 (320x480 portrait)', w: 320, h: 480 }, // i18n-exempt
  { variant: 'bw128x64', label: 'Boxer / Zorro / TX12 / Pocket (128x64 B&W)', w: 128, h: 64, bw: true }, // i18n-exempt
  { variant: 'bw212x64', label: 'Taranis X9D (212x64 B&W)', w: 212, h: 64, bw: true }, // i18n-exempt
];
/** Fixed widget chrome: header ends at 48, ticker owns the bottom 72px.
 *  Keep all geometry math in sync with loadable.lua. */
export const TILE_TOP = 48;
export const BOTTOM_CHROME = 72;

/** Carry a tile onto another screen: SHRINK when the target is smaller,
 *  never inflate (EdgeTX fonts don't scale - bigger screens mean room for
 *  MORE instruments, not fatter ones), then clamp into bounds. */
export function fitTile(t: TileDef, from: { w: number; h: number }, to: { w: number; h: number }): TileDef {
  const fx = Math.min(1, to.w / from.w);
  const fy = Math.min(1, (to.h - TILE_TOP - BOTTOM_CHROME) / (from.h - TILE_TOP - BOTTOM_CHROME));
  const w = Math.round(t.w * fx);
  const h = Math.round(t.h * fy);
  return {
    ...t,
    w,
    h,
    x: Math.max(0, Math.min(to.w - w, Math.round(t.x * fx))),
    y: Math.max(TILE_TOP, Math.min(to.h - BOTTOM_CHROME - h + 6, Math.round(TILE_TOP + (t.y - TILE_TOP) * fy))),
  };
}
export const REF_SCREEN = { w: 480, h: 320 };

/** Mirror of the widget's gridDefault: fills the screen with instruments at
 *  natural size - last column is a full-band attitude ball, the rest fill
 *  row-major by usefulness. @480x320 this is the classic 5-tile default. */
export function gridLayout(screen: { w: number; h: number }): TileDef[] {
  const band = screen.h - TILE_TOP - BOTTOM_CHROME;
  const cols = Math.max(2, Math.floor((screen.w - 8) / 152));
  let pitch = Math.floor((screen.w - 8) / cols);
  pitch -= pitch % 8;
  const tw = pitch - 8;
  const rows = Math.max(1, Math.floor((band + 8) / 104 + 0.5));
  let th = Math.floor((band - (rows - 1) * 8) / rows);
  th -= th % 8;
  const ids = ['batt', 'home', 'alt', 'gps', 'spd', 'wind', 'link', 'timer',
    'thr', 'imu', 'wp', 'compass', 'rng', 'txbat'];
  const t: TileDef[] = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1 && n < ids.length; c++, n++) {
      t.push({ id: ids[n]!, x: 8 + c * pitch, y: TILE_TOP + r * (th + 8), w: tw, h: th, variant: 'default' });
    }
  }
  t.push({ id: 'att', x: 8 + (cols - 1) * pitch, y: TILE_TOP, w: tw, h: band, variant: 'ball' });
  return t;
}

export interface TileDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  variant: string;
}

// Mirror of the Lua DEFAULT_LAYOUT (the @480x320 grid = classic 5 tiles).
export const DEFAULT_LAYOUT: TileDef[] = gridLayout(REF_SCREEN);

export const TILE_META: Record<string, { labelKey: string; minW: number; minH: number; variants?: string[]; experimental?: boolean }> = {
  batt: { labelKey: 'common:battery', minW: 120, minH: 56, variants: ['default', 'icon'] },
  home: { labelKey: 'common:home', minW: 100, minH: 56 },
  alt: { labelKey: 'radio-hud:tiles.alt', minW: 100, minH: 56 },
  gps: { labelKey: 'radio-hud:tiles.gps', minW: 100, minH: 56 },
  att: { labelKey: 'common:attitude', minW: 100, minH: 80, variants: ['ball', 'line', 'bars'] },
  compass: { labelKey: 'common:compass', minW: 100, minH: 100 },
  spd: { labelKey: 'common:speed', minW: 100, minH: 56 },
  timer: { labelKey: 'radio-hud:tiles.timer', minW: 100, minH: 56 },
  wind: { labelKey: 'common:wind', minW: 110, minH: 56 },
  link: { labelKey: 'common:signal', minW: 110, minH: 56 },
  txbat: { labelKey: 'radio-hud:tiles.txbat', minW: 110, minH: 56 },
  thr: { labelKey: 'common:throttle', minW: 90, minH: 56 },
  imu: { labelKey: 'radio-hud:tiles.imu', minW: 90, minH: 56 },
  rng: { labelKey: 'common:rangefinder', minW: 90, minH: 56 },
  pos: { labelKey: 'common:position', minW: 140, minH: 64 },
  map: { labelKey: 'common:map', minW: 140, minH: 100 },
  wp: { labelKey: 'radio-hud:tiles.wp', minW: 120, minH: 56 },
  speedo: { labelKey: 'radio-hud:tiles.speedo', minW: 120, minH: 96 },
  heading: { labelKey: 'radio-hud:tiles.heading', minW: 160, minH: 36 },
  roll: { labelKey: 'radio-hud:tiles.roll', minW: 112, minH: 64 },
  pitch: { labelKey: 'radio-hud:tiles.pitch', minW: 112, minH: 64 },
  depth: { labelKey: 'radio-hud:tiles.depth', minW: 140, minH: 80 },
  echo: { labelKey: 'radio-hud:tiles.echo', minW: 160, minH: 96, experimental: true },
  bottom: { labelKey: 'radio-hud:tiles.bottom', minW: 140, minH: 72 },
};
// Prebuilt layouts for common setups. All 8px-grid aligned.
export const LAYOUT_PRESETS: Record<string, TileDef[]> = {
  'Classic copter': DEFAULT_LAYOUT, // i18n-exempt
  'Navigator': [
    { id: 'map', x: 8, y: 48, w: 296, h: 200, variant: 'default' },
    { id: 'compass', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'home', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Plane': [
    { id: 'spd', x: 8, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'alt', x: 8, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'att', x: 160, y: 48, w: 144, h: 200, variant: 'ball' },
    { id: 'gps', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'wind', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Systems': [
    { id: 'batt', x: 8, y: 48, w: 144, h: 96, variant: 'icon' },
    { id: 'txbat', x: 160, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'link', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'imu', x: 8, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'thr', x: 160, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'timer', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Big picture': [ // i18n-exempt
    { id: 'att', x: 8, y: 48, w: 224, h: 200, variant: 'ball' },
    { id: 'map', x: 240, y: 48, w: 216, h: 200, variant: 'default' },
  ],
  'Rangefinder work': [ // i18n-exempt
    { id: 'rng', x: 8, y: 48, w: 144, h: 200, variant: 'default' },
    { id: 'alt', x: 160, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'batt', x: 160, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'att', x: 312, y: 48, w: 144, h: 200, variant: 'bars' },
  ],
  'Mission flight': [ // i18n-exempt
    { id: 'map', x: 8, y: 48, w: 296, h: 200, variant: 'default' },
    { id: 'wp', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'home', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Long range': [ // i18n-exempt
    { id: 'link', x: 8, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'home', x: 8, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'map', x: 160, y: 48, w: 296, h: 200, variant: 'default' },
  ],
  'Rover': [
    { id: 'heading', x: 8, y: 48, w: 448, h: 40, variant: 'default' },
    { id: 'speedo', x: 8, y: 96, w: 152, h: 152, variant: 'default' },
    { id: 'roll', x: 168, y: 96, w: 144, h: 72, variant: 'default' },
    { id: 'pitch', x: 168, y: 176, w: 144, h: 72, variant: 'default' },
    { id: 'batt', x: 320, y: 96, w: 144, h: 72, variant: 'default' },
    { id: 'thr', x: 320, y: 176, w: 144, h: 72, variant: 'default' },
  ],
  'Sub': [
    { id: 'heading', x: 8, y: 48, w: 448, h: 40, variant: 'default' },
    { id: 'depth', x: 8, y: 96, w: 184, h: 152, variant: 'default' },
    { id: 'att', x: 200, y: 96, w: 136, h: 152, variant: 'ball' },
    { id: 'batt', x: 344, y: 96, w: 120, h: 72, variant: 'default' },
    { id: 'link', x: 344, y: 176, w: 120, h: 72, variant: 'default' },
  ],
  'Survey': [ // i18n-exempt: preset key
    { id: 'map', x: 8, y: 48, w: 296, h: 200, variant: 'default' },
    { id: 'wp', x: 312, y: 48, w: 144, h: 64, variant: 'default' },
    { id: 'batt', x: 312, y: 120, w: 144, h: 56, variant: 'default' },
    { id: 'timer', x: 312, y: 184, w: 144, h: 64, variant: 'default' },
  ],
  'Cinematic': [ // i18n-exempt: preset key
    { id: 'att', x: 8, y: 48, w: 296, h: 200, variant: 'line' },
    { id: 'home', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'batt', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Cruise': [ // i18n-exempt: preset key
    { id: 'spd', x: 8, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'alt', x: 160, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'home', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'att', x: 8, y: 152, w: 296, h: 96, variant: 'line' },
    { id: 'batt', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Thermal': [ // i18n-exempt: preset key
    { id: 'alt', x: 8, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'wind', x: 8, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'map', x: 160, y: 48, w: 296, h: 200, variant: 'default' },
  ],
  'Mission drive': [ // i18n-exempt: preset key
    { id: 'map', x: 8, y: 48, w: 296, h: 200, variant: 'default' },
    { id: 'speedo', x: 312, y: 48, w: 144, h: 112, variant: 'default' },
    { id: 'wp', x: 312, y: 168, w: 144, h: 80, variant: 'default' },
  ],
  'Field work': [ // i18n-exempt: preset key
    { id: 'map', x: 8, y: 48, w: 296, h: 200, variant: 'default' },
    { id: 'timer', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'batt', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Boat': [ // i18n-exempt: preset key
    { id: 'heading', x: 8, y: 48, w: 448, h: 40, variant: 'default' },
    { id: 'speedo', x: 8, y: 96, w: 160, h: 152, variant: 'default' },
    { id: 'depth', x: 176, y: 96, w: 152, h: 152, variant: 'default' },
    { id: 'batt', x: 336, y: 96, w: 120, h: 72, variant: 'default' },
    { id: 'link', x: 336, y: 176, w: 120, h: 72, variant: 'default' },
  ],
  'Sounding': [ // i18n-exempt: preset key
    { id: 'echo', x: 8, y: 48, w: 296, h: 200, variant: 'default' },
    { id: 'bottom', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'speedo', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'FPV': [
    { id: 'att', x: 8, y: 48, w: 296, h: 200, variant: 'ball' },
    { id: 'link', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'batt', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Minimal glance': [ // i18n-exempt: preset key
    { id: 'batt', x: 8, y: 48, w: 224, h: 96, variant: 'default' },
    { id: 'home', x: 240, y: 48, w: 216, h: 96, variant: 'default' },
    { id: 'link', x: 8, y: 152, w: 224, h: 96, variant: 'default' },
    { id: 'timer', x: 240, y: 152, w: 216, h: 96, variant: 'default' },
  ],
};
export const PRESET_LABEL_KEYS: Record<string, string> = {
  'Classic copter': 'radio-hud:presets.classicCopter', // i18n-exempt
  'Navigator': 'radio-hud:presets.navigator',
  'Plane': 'radio-hud:presets.plane',
  'Systems': 'radio-hud:presets.systems',
  'Big picture': 'radio-hud:presets.bigPicture', // i18n-exempt
  'Rangefinder work': 'radio-hud:presets.rangefinderWork', // i18n-exempt
  'Mission flight': 'radio-hud:presets.missionFlight', // i18n-exempt
  'Long range': 'radio-hud:presets.longRange', // i18n-exempt
  'Rover': 'radio-hud:presets.rover',
  'Sub': 'radio-hud:presets.sub',
  'FPV': 'radio-hud:presets.fpv',
  'Minimal glance': 'radio-hud:presets.minimalGlance', // i18n-exempt
};
export const MAX_PAGES = 4;

export const MAV_TYPE_SURFACE_BOAT = 11;

/** The preset a first-run studio starts on, for whatever is connected. */
export function firstRunLayout(vehicleClass: ArduPilotVehicleClass): TileDef[] {
  const name = vehicleClass === 'rover' ? 'Rover'
    : vehicleClass === 'plane' || vehicleClass === 'vtol' ? 'Plane'
      : vehicleClass === 'sub' ? 'Sub'
        : null;
  return (name && LAYOUT_PRESETS[name]) || DEFAULT_LAYOUT;
}

/** Vehicle families the template gallery filters by; boats run Rover firmware but read differently. */
export type HudVehicleKind = 'copter' | 'plane' | 'rover' | 'boat' | 'sub';

export function hudVehicleKind(vehicleClass: ArduPilotVehicleClass, mavType?: number): HudVehicleKind {
  if (mavType === MAV_TYPE_SURFACE_BOAT) return 'boat';
  if (vehicleClass === 'vtol') return 'plane';
  return vehicleClass;
}

/** A whole set of screens for a kind of vehicle; replaces the old one-page presets. */
export interface HudTemplate {
  id: string;
  vehicles: HudVehicleKind[];
  /** Authored at REF_SCREEN; the studio fits them to the selected radio. */
  pages: TileDef[][];
  /** Uses a tile that has not run on real vehicles yet. */
  experimental?: boolean;
}

const P = (name: string): TileDef[] => LAYOUT_PRESETS[name] ?? DEFAULT_LAYOUT;

export const HUD_TEMPLATES: HudTemplate[] = [
  { id: 'copter', vehicles: ['copter'], pages: [P('Classic copter'), P('Mission flight')] }, // i18n-exempt: preset keys
  { id: 'survey', vehicles: ['copter', 'plane'], pages: [P('Survey'), P('Systems')] }, // i18n-exempt: preset keys
  { id: 'cinematic', vehicles: ['copter'], pages: [P('Cinematic')] }, // i18n-exempt: preset keys
  { id: 'fpv', vehicles: ['copter', 'plane'], pages: [P('FPV')] }, // i18n-exempt: preset keys
  { id: 'rangefinder', vehicles: ['copter'], pages: [P('Rangefinder work'), P('Systems')] }, // i18n-exempt: preset keys
  { id: 'plane', vehicles: ['plane'], pages: [P('Plane'), P('Navigator')] }, // i18n-exempt: preset keys
  { id: 'cruise', vehicles: ['plane'], pages: [P('Cruise'), P('Navigator')] }, // i18n-exempt: preset keys
  { id: 'thermal', vehicles: ['plane'], pages: [P('Thermal'), P('Systems')] }, // i18n-exempt: preset keys
  { id: 'longRange', vehicles: ['copter', 'plane'], pages: [P('Long range'), P('Systems')] }, // i18n-exempt: preset keys
  { id: 'rover', vehicles: ['rover'], pages: [P('Rover'), P('Mission flight'), P('Systems')] }, // i18n-exempt: preset keys
  { id: 'missionDrive', vehicles: ['rover', 'boat'], pages: [P('Mission drive'), P('Systems')] }, // i18n-exempt: preset keys
  { id: 'fieldWork', vehicles: ['rover'], pages: [P('Field work'), P('Rover')] }, // i18n-exempt: preset keys
  { id: 'boat', vehicles: ['boat'], pages: [P('Boat'), P('Sounding'), P('Systems')] }, // i18n-exempt: preset keys
  { id: 'sounding', vehicles: ['boat'], pages: [P('Sounding'), P('Boat')], experimental: true }, // i18n-exempt: preset keys
  { id: 'sub', vehicles: ['sub'], pages: [P('Sub'), P('Systems')] }, // i18n-exempt: preset keys
  { id: 'bigPicture', vehicles: ['copter', 'plane'], pages: [P('Big picture')] }, // i18n-exempt: preset keys
  { id: 'minimal', vehicles: ['copter', 'plane', 'rover', 'boat', 'sub'], pages: [P('Minimal glance')] }, // i18n-exempt: preset keys
];

/** The screens a first-run studio starts on, for whatever is connected. */
export function firstRunPages(kind: HudVehicleKind): TileDef[][] {
  const template = HUD_TEMPLATES.find((t) => t.vehicles[0] === kind) ?? HUD_TEMPLATES[0]!;
  return template.pages.map((p) => p.map((t) => ({ ...t })));
}

/** Tiles a vehicle kind reads first in the "add a tile" list; the rest follow. */
export const TILES_FIRST: Record<HudVehicleKind, string[]> = {
  copter: ['batt', 'alt', 'home', 'att', 'gps', 'map', 'link', 'timer'],
  plane: ['spd', 'alt', 'att', 'wind', 'batt', 'home', 'map', 'link'],
  rover: ['speedo', 'heading', 'roll', 'pitch', 'wp', 'thr', 'map', 'batt'],
  boat: ['depth', 'echo', 'bottom', 'speedo', 'heading', 'wp', 'map', 'batt'],
  sub: ['depth', 'heading', 'att', 'batt', 'link', 'timer'],
};
