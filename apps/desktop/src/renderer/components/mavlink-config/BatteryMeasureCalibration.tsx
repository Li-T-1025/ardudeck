import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { DraftNumberInput } from '../../hooks/useNumericDraft';

const STALE_MS = 3_000;
/** Below this a reading error dominates the ratio, so amps-per-volt is not worth computing. */
const MIN_CURRENT_A = 1;

/** The new scale factor from a measurement: the reading is linear in it. Null when the inputs cannot give a sane one. */
export function scaledFactor(active: number, reported: number, measured: number): number | null {
  if (!(active > 0) || !(reported > 0) || !(measured > 0)) return null;
  const next = (active * measured) / reported;
  return Number.isFinite(next) ? Math.round(next * 10_000) / 10_000 : null;
}

/** Mission Planner's "measured battery voltage" calibration (#144), plus the same for current. */
export function BatteryMeasureCalibration({ instance, bp }: { instance: number; bp: (name: string) => string }) {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const writeNow = useParameterStore((s) => s.setParameterImmediate);
  const connected = useConnectionStore((s) => s.connectionState.isConnected);
  // BATTERY_STATUS ids are 0-based, BATTn params 1-based; the primary is the fallback for battery 1
  const reading = useTelemetryStore((s) => s.batteries[instance - 1] ?? (instance === 1 ? { ...s.battery, updatedAt: s.lastBattery ?? 0 } : undefined));
  const live = !!reading && connected && Date.now() - (reading.updatedAt ?? 0) < STALE_MS;

  // what the flight controller runs now, not an unsaved edit: the reading comes from that
  const active = (name: string) => {
    const p = parameters.get(bp(name));
    return p ? (p.originalValue ?? p.value) : undefined;
  };

  const [measuredV, setMeasuredV] = useState(0);
  const [measuredA, setMeasuredA] = useState(0);
  const [done, setDone] = useState<{ param: string; from: number; to: number } | null>(null);

  const apply = async (param: string, next: number | null) => {
    const from = active(param);
    if (next === null || from === undefined) return;
    if (await writeNow(bp(param), next)) setDone({ param: bp(param), from, to: next });
  };

  const voltMult = active('VOLT_MULT');
  const ampPerVolt = active('AMP_PERVLT');
  const nextVolt = live && voltMult !== undefined ? scaledFactor(voltMult, reading!.voltage, measuredV) : null;
  const currentTooLow = live && reading!.current < MIN_CURRENT_A;
  const nextAmp = live && ampPerVolt !== undefined && !currentTooLow ? scaledFactor(ampPerVolt, reading!.current, measuredA) : null;

  const row = (
    label: string, reads: string, value: number, setValue: (v: number) => void, unit: string,
    next: number | null, onApply: () => void, note?: string,
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-content">{label}</span>
        <span className="text-content-secondary tabular-nums">{reads}</span>
      </div>
      <div className="flex items-center gap-2">
        <DraftNumberInput value={value} onCommit={setValue} min={0} step={0.01}
          className="w-28 px-2 py-1.5 bg-surface-input border border-subtle rounded text-sm font-mono text-content focus:outline-none focus:border-blue-500" />
        <span className="text-xs text-content-tertiary">{unit}</span>
        <button type="button" onClick={onApply} disabled={next === null}
          className="ml-auto px-3 py-1.5 text-xs rounded bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed">
          {next === null ? t('mavlink-config:batteryCal.apply') : t('mavlink-config:batteryCal.applyTo', { value: next })}
        </button>
      </div>
      {note && <p className="text-[11px] text-amber-500">{note}</p>}
    </div>
  );

  return (
    <div className="rounded-lg border border-subtle bg-surface-raised p-3 space-y-3">
      <div>
        <h4 className="text-xs font-medium text-content uppercase tracking-wide">{t('mavlink-config:batteryCal.title')}</h4>
        <p className="text-[11px] text-content-secondary mt-0.5">{t('mavlink-config:batteryCal.hint')}</p>
      </div>
      {!live ? (
        <p className="text-xs text-content-secondary">{t('mavlink-config:batteryCal.noReading')}</p>
      ) : (
        <>
          {row(
            t('mavlink-config:batteryCal.voltage'),
            t('mavlink-config:batteryCal.readsVolt', { value: reading!.voltage.toFixed(2) }),
            measuredV, setMeasuredV, 'V', nextVolt, () => void apply('VOLT_MULT', nextVolt),
          )}
          {row(
            t('mavlink-config:batteryCal.current'),
            t('mavlink-config:batteryCal.readsAmp', { value: reading!.current.toFixed(2) }),
            measuredA, setMeasuredA, 'A', nextAmp, () => void apply('AMP_PERVLT', nextAmp),
            currentTooLow ? t('mavlink-config:batteryCal.needLoad', { min: MIN_CURRENT_A }) : undefined,
          )}
        </>
      )}
      {done && (
        <p className="flex items-start gap-1.5 text-[11px] text-emerald-500">
          <Check className="w-3.5 h-3.5 shrink-0 mt-px" />
          {t('mavlink-config:batteryCal.written', { param: done.param, from: done.from, to: done.to })}
        </p>
      )}
    </div>
  );
}
