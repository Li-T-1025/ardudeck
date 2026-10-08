import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Check, ChevronsDown, ChevronsUp, Repeat } from 'lucide-react';
import { useParameterStore } from '../../../stores/parameter-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useEffectiveRc } from '../../../stores/pseudo-tx-store';
import { DraftNumberInput } from '../../../hooks/useNumericDraft';

type Step = 'low' | 'high' | 'angles';
const STEPS: Step[] = ['low', 'high', 'angles'];
const SMALL_US = 5;
const BIG_US = 25;
const PWM_FLOOR = 500;
const PWM_CEILING = 2500;
/** Knob within this far of an end counts as "all the way". */
const END_BAND_US = 120;
const LOW_ANGLES = [-90, -60, -45];
const HIGH_ANGLES = [0, 20, 45];

export interface GimbalRangeTarget {
  /** Servo outputs driving this tilt (usually one). */
  outputs: number[];
  /** 1 or 2: which MNTn the tilt belongs to. */
  mount: 1 | 2;
  /** RC channel whose aux function aims this tilt, if any. */
  knobChannel: number | null;
}

/** Tilt range set by watching the camera: nudges are written live, Cancel restores everything. */
export function GimbalRangeDialog({ target, onClose }: { target: GimbalRangeTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  // straight to the board: the screen's own edits are staged until Write, but a nudge must move the camera now
  const setParameter = useParameterStore((s) => s.setParameterImmediate);
  const servoOutputs = useTelemetryStore((s) => s.servoOutput?.outputs);
  const fcRc = useTelemetryStore((s) => s.rcChannels);
  const rc = useEffectiveRc(fcRc);
  const out = target.outputs[0]!;
  const P = (name: string) => parameters.get(name)?.value;

  const reversed = (P(`SERVO${out}_REVERSED`) ?? 0) === 1;
  // knob at its bottom gives the lowest angle, which is MIN on a normal output and MAX on a reversed one
  const lowParam = reversed ? 'MAX' : 'MIN';
  const highParam = reversed ? 'MIN' : 'MAX';
  const angleMin = `MNT${target.mount}_PITCH_MIN`;
  const angleMax = `MNT${target.mount}_PITCH_MAX`;

  const original = useRef({
    min: P(`SERVO${out}_MIN`) ?? 1000,
    max: P(`SERVO${out}_MAX`) ?? 2000,
    aMin: P(angleMin) ?? -90,
    aMax: P(angleMax) ?? 20,
  }).current;

  const [step, setStep] = useState<Step>('low');
  const [swapped, setSwapped] = useState(false);
  const [lowAngle, setLowAngle] = useState(original.aMin);
  const [highAngle, setHighAngle] = useState(original.aMax);

  const write = (end: 'MIN' | 'MAX', value: number) => {
    const v = Math.round(Math.min(PWM_CEILING, Math.max(PWM_FLOOR, value)));
    for (const o of target.outputs) void setParameter(`SERVO${o}_${end}`, v);
  };
  const endParam = step === 'low' ? lowParam : highParam;
  const endValue = P(`SERVO${out}_${endParam}`) ?? (endParam === 'MIN' ? original.min : original.max);
  // "up" is more microseconds unless the pilot said the camera moved the other way
  const nudge = (dir: 1 | -1, us: number) => write(endParam, endValue + dir * us * (swapped ? -1 : 1));

  const cancel = () => {
    for (const o of target.outputs) {
      void setParameter(`SERVO${o}_MIN`, original.min);
      void setParameter(`SERVO${o}_MAX`, original.max);
    }
    onClose();
  };
  const finish = () => {
    void setParameter(angleMin, Math.min(lowAngle, highAngle));
    void setParameter(angleMax, Math.max(lowAngle, highAngle));
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
      if (step === 'angles') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1, e.shiftKey ? BIG_US : SMALL_US); }
      if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1, e.shiftKey ? BIG_US : SMALL_US); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const knobPwm = target.knobChannel ? rc.channels[target.knobChannel - 1] ?? 0 : 0;
  const knobLive = knobPwm > 800 && knobPwm < 2200;
  const knobAtEnd = !knobLive ? null : step === 'low' ? knobPwm < 1000 + END_BAND_US : knobPwm > 2000 - END_BAND_US;
  const liveOut = servoOutputs?.[out - 1];
  const idx = STEPS.indexOf(step);

  const nudgeButtons = useMemo(() => [
    { dir: 1 as const, us: BIG_US, Icon: ChevronsUp, label: 'upBig' },
    { dir: 1 as const, us: SMALL_US, Icon: ArrowUp, label: 'up' },
    { dir: -1 as const, us: SMALL_US, Icon: ArrowDown, label: 'down' },
    { dir: -1 as const, us: BIG_US, Icon: ChevronsDown, label: 'downBig' },
  ], []);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="card w-full max-w-md mx-4">
        <div className="card-body space-y-4">
          <div>
            <h3 className="font-medium text-content">{t('mavlink-config:gimbalRange.title')}</h3>
            <p className="text-xs text-content-secondary">{t(`mavlink-config:gimbalRange.step.${step}`)}</p>
          </div>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 rounded-full flex-1 ${i === idx ? 'bg-blue-500' : i < idx ? 'bg-emerald-500' : 'bg-surface-raised'}`} />
            ))}
          </div>

          {step !== 'angles' ? (
            <div className="space-y-3">
              <p className="text-sm text-content">{t(step === 'low' ? 'mavlink-config:gimbalRange.knobDown' : 'mavlink-config:gimbalRange.knobUp')}</p>
              {target.knobChannel !== null && (
                <div className={`flex items-center gap-2 text-xs ${knobAtEnd ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {knobAtEnd ? <Check className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border border-amber-400" />}
                  {knobAtEnd ? t('mavlink-config:gimbalRange.knobThere') : t('mavlink-config:gimbalRange.knobNotThere', { ch: target.knobChannel })}
                </div>
              )}
              <p className="text-xs text-content-secondary">{t(step === 'low' ? 'mavlink-config:gimbalRange.nudgeLow' : 'mavlink-config:gimbalRange.nudgeHigh')}</p>
              <div className="grid grid-cols-4 gap-2">
                {nudgeButtons.map((b) => (
                  <button key={b.label} type="button" onClick={() => nudge(b.dir, b.us)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-subtle bg-surface-raised py-2.5 text-xs text-content hover:border-blue-500/50">
                    <b.Icon className="w-5 h-5" />{t(`mavlink-config:gimbalRange.${b.label}`)}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-[11px] text-content-tertiary">
                <span>{t('mavlink-config:gimbalRange.signal', { us: endValue, live: liveOut ?? '--' })}</span>
                <button type="button" onClick={() => setSwapped((v) => !v)} className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  <Repeat className="w-3 h-3" />{t('mavlink-config:gimbalRange.wrongWay')}
                </button>
              </div>
              <p className="text-[11px] text-content-tertiary">{t('mavlink-config:gimbalRange.keys')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {([['lowQuestion', lowAngle, setLowAngle, LOW_ANGLES], ['highQuestion', highAngle, setHighAngle, HIGH_ANGLES]] as const).map(([q, val, setVal, chips]) => (
                <div key={q}>
                  <p className="text-sm text-content mb-1.5">{t(`mavlink-config:gimbalRange.${q}`)}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {chips.map((a) => (
                      <button key={a} type="button" onClick={() => setVal(a)}
                        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${val === a ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'}`}>
                        {t(`mavlink-config:gimbalRange.angle.${a < 0 ? `m${-a}` : `p${a}`}`)}
                      </button>
                    ))}
                    <DraftNumberInput value={val} min={-180} max={180} step={1} onCommit={setVal}
                      className="w-16 rounded bg-surface-input border border-subtle px-1.5 py-1 text-xs text-content" />
                    <span className="text-xs text-content-tertiary">°</span>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-content-tertiary">{t('mavlink-config:gimbalRange.anglesWhy')}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={cancel} className="text-xs text-content-secondary hover:text-content">{t('mavlink-config:gimbalRange.cancel')}</button>
            <div className="flex items-center gap-2">
              {idx > 0 && <button type="button" onClick={() => setStep(STEPS[idx - 1]!)} className="btn btn-secondary text-sm">{t('common:back')}</button>}
              {step !== 'angles'
                ? <button type="button" onClick={() => setStep(STEPS[idx + 1]!)} className="btn btn-primary text-sm">{t('common:next')}</button>
                : <button type="button" onClick={finish} className="btn btn-primary text-sm">{t('common:done')}</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
