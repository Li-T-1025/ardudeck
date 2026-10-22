/** Which 1-based RC channel the vehicle reads each stick function from (RCMAP_*). */
export interface StickChannelMap {
  roll: number;
  pitch: number;
  throttle: number;
  yaw: number;
}

export interface StickValues {
  roll: number;
  pitch: number;
  throttle: number;
  yaw: number;
}

/** ArduPilot's RCMAP defaults (AETR). */
export const DEFAULT_STICK_MAP: StickChannelMap = { roll: 1, pitch: 2, throttle: 3, yaw: 4 };

/** RC_CHANNELS_OVERRIDE "leave this channel alone". */
export const RC_OVERRIDE_IGNORE = 65535;

export const RC_OVERRIDE_CHANNELS = 18;

const valid = (v: number | undefined): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= RC_OVERRIDE_CHANNELS;

/** The vehicle's RCMAP_*, each falling back to its default while the parameter is missing or out of range. Rover reads steering from RCMAP_ROLL. */
export function stickMapFrom(read: (name: string) => number | undefined): StickChannelMap {
  const pick = (name: string, fallback: number) => {
    const v = read(name);
    return valid(v) ? v : fallback;
  };
  return {
    roll: pick('RCMAP_ROLL', DEFAULT_STICK_MAP.roll),
    pitch: pick('RCMAP_PITCH', DEFAULT_STICK_MAP.pitch),
    throttle: pick('RCMAP_THROTTLE', DEFAULT_STICK_MAP.throttle),
    yaw: pick('RCMAP_YAW', DEFAULT_STICK_MAP.yaw),
  };
}

/** 18 override values, sticks on the vehicle's RCMAP channels; `pins` (1-based) never overwrite a stick channel. */
export function overrideChannels(sticks: StickValues, map: StickChannelMap = DEFAULT_STICK_MAP, pins: Record<number, number> = {}): number[] {
  const out = new Array<number>(RC_OVERRIDE_CHANNELS).fill(RC_OVERRIDE_IGNORE);
  const stickChannels = new Set([map.roll, map.pitch, map.throttle, map.yaw]);
  for (const [ch, pwm] of Object.entries(pins)) {
    const n = Number(ch);
    if (valid(n) && !stickChannels.has(n)) out[n - 1] = pwm;
  }
  out[map.roll - 1] = sticks.roll;
  out[map.pitch - 1] = sticks.pitch;
  out[map.yaw - 1] = sticks.yaw;
  // throttle last: if RCMAP ever doubles a channel, the low-throttle value must win
  out[map.throttle - 1] = sticks.throttle;
  return out;
}

type ChanField = 'chan1Raw' | 'chan2Raw' | 'chan3Raw' | 'chan4Raw' | 'chan5Raw' | 'chan6Raw' | 'chan7Raw' | 'chan8Raw' | 'chan9Raw'
  | 'chan10Raw' | 'chan11Raw' | 'chan12Raw' | 'chan13Raw' | 'chan14Raw' | 'chan15Raw' | 'chan16Raw' | 'chan17Raw' | 'chan18Raw';

/** chan1Raw..chan18Raw fields for serializeRcChannelsOverride. */
export function overrideFields(channels: number[]): Record<ChanField, number> {
  const f = {} as Record<ChanField, number>;
  for (let i = 0; i < RC_OVERRIDE_CHANNELS; i++) f[`chan${i + 1}Raw` as ChanField] = channels[i] ?? RC_OVERRIDE_IGNORE;
  return f;
}
