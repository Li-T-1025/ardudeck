import type { HardwarePreset, SetupAnswers } from './presets';

export interface ParamInfo {
  value: number;
  /** The firmware's enum labels for this parameter, when metadata is loaded. */
  values?: Record<number, string>;
}

export type ParamLookup = (name: string) => ParamInfo | undefined;

export interface PlannedChange {
  name: string;
  value: number;
  current: number;
}

export interface ManualStep {
  name: string;
  value: number;
  /** The firmware's name for the value, e.g. DShot600. */
  label: string | null;
  current: number | null;
  done: boolean;
}

export interface SetupPlan {
  /** Writable now, because the vehicle already has the parameter. */
  now: PlannedChange[];
  /** The pilot sets these; never written by the setup. */
  manual: ManualStep[];
  /** Appear only after the board restarts with the device type set. */
  afterRestart: string[];
  /** Hard stops: nothing is written while any exist. */
  errors: { key: string; values?: Record<string, string | number> }[];
  /** The instance number taken (RNGFND2 -> 2), when the device uses one. */
  instance: number | null;
}

/** First instance of a family whose type is still 0, or the one already holding this device. */
export function freeInstance(preset: HardwarePreset, lookup: ParamLookup): number | null {
  if (!preset.instance) return null;
  const typeValue = preset.params.find((p) => p.name === preset.instance!.typeParam)?.value;
  for (let i = 1; i <= preset.instance.max; i++) {
    const t = lookup(preset.instance.typeParam.replace('{i}', String(i)));
    if (!t) continue;
    if (t.value === 0 || t.value === typeValue) return i;
  }
  return null;
}

function expand(name: string, instance: number | null, serial: number | undefined): string {
  return name.replace('{i}', String(instance ?? 1)).replace('{s}', String(serial ?? 0));
}

/** Range limits exist in metres or centimetres depending on firmware; only the pair the vehicle has is written. */
function unitTwin(name: string): string | null {
  if (/_(MIN|MAX)_CM$/.test(name)) return name.replace(/_CM$/, '');
  if (/_(MIN|MAX)$/.test(name)) return `${name}_CM`;
  return null;
}

export function planSetup(preset: HardwarePreset, answers: SetupAnswers, lookup: ParamLookup): SetupPlan {
  const errors: SetupPlan['errors'] = [];
  if (preset.connection === 'serial' && answers.serial === undefined) errors.push({ key: 'pickPort' });
  const instance = freeInstance(preset, lookup);
  if (preset.instance && instance === null) errors.push({ key: 'noFreeSlot', values: { family: preset.instance.prefix } });

  const now: PlannedChange[] = [];
  const manual: ManualStep[] = [];
  const afterRestart: string[] = [];
  for (const p of preset.params) {
    const candidates = expand(p.name, instance, answers.serial).split('|');
    const name = candidates.find((n) => lookup(n)) ?? candidates[0]!;
    const value = typeof p.value === 'function' ? p.value(answers) : p.value;
    const info = lookup(name);
    if (!info) {
      const twin = unitTwin(name);
      // the other unit's pair exists right now: this one is simply not on this firmware
      if (twin && lookup(twin)) continue;
      afterRestart.push(name);
      continue;
    }
    if (p.expect && !info.values) {
      // without the firmware's own labels a type number cannot be trusted
      errors.push({ key: 'noMetadata', values: { param: name } });
      continue;
    }
    if (p.expect && info.values) {
      const label = info.values[value];
      if (!label || !p.expect.test(label)) {
        errors.push({ key: 'typeMismatch', values: { param: name, value, label: label ?? '?' } });
        continue;
      }
    }
    if (p.manual) {
      manual.push({ name, value, label: info.values?.[value] ?? null, current: info.value, done: info.value === value });
      continue;
    }
    if (info.value !== value) now.push({ name, value, current: info.value });
  }
  // both units of a range limit missing: count the pair once
  const pending = afterRestart.filter((n) => !(/_CM$/.test(n) && afterRestart.includes(unitTwin(n)!)));
  return { now, manual, afterRestart: pending, errors, instance };
}

/** What a serial port is used for now, so taking it over is a choice, not an accident. */
export interface SerialPortInfo {
  port: number;
  protocol: number;
  label: string;
}

/** Protocols on a port that would cut something off if replaced. */
const VITAL = new Set([1, 2, 5, 23]);

export function serialPorts(lookup: ParamLookup): SerialPortInfo[] {
  const out: SerialPortInfo[] = [];
  for (let n = 1; n <= 9; n++) {
    const p = lookup(`SERIAL${n}_PROTOCOL`);
    if (!p) continue;
    out.push({ port: n, protocol: p.value, label: p.values?.[p.value] ?? String(p.value) });
  }
  return out;
}

export function portIsVital(port: SerialPortInfo): boolean {
  return VITAL.has(port.protocol);
}

/** A free port: protocol None (-1) or zero. */
export function firstFreePort(ports: SerialPortInfo[]): number | undefined {
  return ports.find((p) => p.protocol === -1 || p.protocol === 0)?.port;
}
