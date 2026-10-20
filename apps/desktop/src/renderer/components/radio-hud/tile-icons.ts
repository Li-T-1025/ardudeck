import {
  Anchor, ChartArea, Mountain, Radar, BatteryMedium, Compass, Gauge, Home, Locate, Map, MapPin, MoveRight, MoveVertical, Navigation, Radio, Rotate3d, Waves,
  Ruler, Satellite, Signal, SlidersHorizontal, Thermometer, Timer, Wind, type LucideIcon,
} from 'lucide-react';

/** Icon and colour per colour-radio tile, in the same language as the B&W slot picker. */
export const TILE_ICONS: Record<string, { Icon: LucideIcon; color: string }> = {
  batt: { Icon: BatteryMedium, color: 'text-emerald-400' },
  txbat: { Icon: Radio, color: 'text-emerald-400' },
  alt: { Icon: MoveVertical, color: 'text-sky-400' },
  spd: { Icon: MoveRight, color: 'text-sky-400' },
  att: { Icon: Rotate3d, color: 'text-sky-400' },
  gps: { Icon: Satellite, color: 'text-teal-400' },
  link: { Icon: Signal, color: 'text-teal-400' },
  home: { Icon: Home, color: 'text-orange-400' },
  wind: { Icon: Wind, color: 'text-cyan-400' },
  rng: { Icon: Ruler, color: 'text-violet-400' },
  imu: { Icon: Thermometer, color: 'text-rose-400' },
  wp: { Icon: MapPin, color: 'text-blue-400' },
  map: { Icon: Map, color: 'text-blue-400' },
  pos: { Icon: Locate, color: 'text-blue-400' },
  thr: { Icon: SlidersHorizontal, color: 'text-yellow-400' },
  compass: { Icon: Compass, color: 'text-purple-400' },
  timer: { Icon: Timer, color: 'text-content-secondary' },
  speedo: { Icon: Gauge, color: 'text-sky-400' },
  heading: { Icon: Navigation, color: 'text-purple-400' },
  roll: { Icon: Anchor, color: 'text-amber-400' },
  pitch: { Icon: Mountain, color: 'text-amber-400' },
  depth: { Icon: Waves, color: 'text-blue-400' },
  echo: { Icon: Radar, color: 'text-cyan-400' },
  bottom: { Icon: ChartArea, color: 'text-amber-400' },
};
