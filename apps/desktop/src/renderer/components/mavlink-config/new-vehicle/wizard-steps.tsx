import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, ChevronRight, Minus, Plus } from 'lucide-react';
import type { ParamReader, SetupAnswers, SetupStepId, SetupVehicle, CopterClass, Chemistry } from '../../../../shared/vehicle-setup/types';
import { applyChoice, choiceOptions, choiceWrites, currentChoice, stallOf } from '../../../../shared/vehicle-setup/choices';
import { batteryValues, estimateStall, toChemistry, tuneSuggestion, airspeedSuggestion } from '../../../../shared/vehicle-setup/calc';
import { defaultFrameType, FRAME_CLASS, findLayout, layoutsForClass, planeOutputs, vtolLiftOutputs } from '../../../../shared/vehicle-setup/outputs';
import { failsafeRows } from '../../../../shared/vehicle-setup/writes';
import { prearmStep } from '../../../../shared/vehicle-setup/plans';
import { matchPreArmError } from '../../../../shared/prearm-checks';
import { useParameterStore } from '../../../stores/parameter-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { FrameDiagram } from '../motor-test/FrameDiagram';
import { PreArmParamFix } from '../../prearm/PreArmParamFix';
import { OPTION_TAGS, Pictogram } from './pictograms';

export interface StepProps {
  step: SetupStepId;
  vehicle: SetupVehicle;
  answers: SetupAnswers;
  setAnswers: (a: SetupAnswers) => void;
  read: ParamReader;
}

const K = 'vehicle-setup:wizard';
const pickOn = 'border-sky-500/70 bg-sky-500/10 text-content';
const pickOff = 'border-subtle bg-surface text-content-secondary hover:text-content hover:border-blue-500/40';

export function Pick({ label, hint, on, onClick, picto }: { label: string; hint?: string; on: boolean; onClick: () => void; picto?: string }) {
  const { t } = useTranslation();
  const tag = picto ? OPTION_TAGS[picto] : undefined;
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`flex h-full flex-col rounded-lg border p-3 text-left transition-colors ${on ? pickOn : pickOff}`}>
      {picto && (
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className={on ? 'text-content' : 'text-content-tertiary'}><Pictogram id={picto} /></div>
          {tag && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tag === 'recommended' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'}`}>
              {t(`${K}.tag.${tag}`)}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5 text-sm font-medium text-content">
        {on && <Check className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
        {label}
      </div>
      {hint && <div className="mt-0.5 text-xs leading-snug text-content-secondary">{hint}</div>}
    </button>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${on ? pickOn : pickOff}`}>
      {label}
    </button>
  );
}

function Stepper({ label, value, unit, note, onChange, step = 1, min, max }: {
  label: string; value: number; unit: string; note?: string; onChange: (v: number) => void; step?: number; min: number; max: number;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)));
  return (
    <div className="rounded-lg border border-subtle bg-surface p-3">
      <div className="text-xs text-content-secondary">{label}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" aria-label="-" onClick={() => set(value - step)} className="rounded-md border border-subtle p-1 text-content-secondary hover:text-content"><Minus className="h-3.5 w-3.5" /></button>
        <input
          type="number"
          value={value}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) set(v); }}
          className="w-20 rounded-md border border-subtle bg-surface-input px-2 py-1 text-center text-sm tabular-nums text-content"
        />
        <span className="text-xs text-content-secondary">{unit}</span>
        <button type="button" aria-label="+" onClick={() => set(value + step)} className="rounded-md border border-subtle p-1 text-content-secondary hover:text-content"><Plus className="h-3.5 w-3.5" /></button>
      </div>
      {note && <div className="mt-1.5 text-[11px] text-content-tertiary">{note}</div>}
    </div>
  );
}

export function Note({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`flex gap-2 rounded-lg border p-3 text-xs leading-relaxed ${warn ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-sky-500/30 bg-sky-500/10 text-content-secondary'}`}>
      {warn && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

/** What the step will write, current value next to the new one. */
export function WritesTable({ writes, read, title }: { writes: { name: string; value: number }[]; read: ParamReader; title?: string }) {
  const { t } = useTranslation();
  if (writes.length === 0) return null;
  const changes = writes.filter((w) => { const cur = read(w.name); return cur === undefined || Math.abs(cur - w.value) >= 1e-4; });
  if (changes.length === 0) {
    return <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface px-3 py-2 text-xs text-content-secondary"><Check className="h-3.5 w-3.5 text-emerald-500" />{t(`${K}.alreadySet`)}</div>;
  }
  return (
    <div className="rounded-lg border border-subtle bg-surface">
      <div className="border-b border-subtle px-3 py-2 text-xs font-medium text-content">{title ?? t(`${K}.writes`)}</div>
      <table className="w-full text-xs">
        <tbody>
          {changes.map((w) => {
            const cur = read(w.name);
            return (
              <tr key={w.name} className="border-b border-subtle last:border-0">
                <td className="px-3 py-1.5 font-mono text-content">{w.name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-content-tertiary">{cur === undefined ? t(`${K}.afterRestart`) : cur}</td>
                <td className="w-6 text-content-tertiary"><ChevronRight className="h-3 w-3" /></td>
                <td className="px-3 py-1.5 font-medium tabular-nums text-content">{w.value}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Option steps: one card per choice, what it writes, and the note for the pick. */
export function ChoiceStep({ step, vehicle, answers, setAnswers, read }: StepProps) {
  const { t } = useTranslation();
  const opts = choiceOptions(step, vehicle, answers);
  const multi = step === 'extras';
  const cur = currentChoice(step, vehicle, answers);
  const isOn = (id: string) => (multi ? (answers.extras ?? []).includes(id as never) : cur === id);
  const ns = step === 'drive' ? `drive${vehicle === 'boat' ? 'Boat' : 'Rover'}` : step === 'airframe' && vehicle === 'vtol' && answers.vtolType === 'tail' ? 'airframeTail' : step;
  const writes = choiceWrites(step, vehicle, answers);
  const noteKey = `vehicle-setup:note.${ns}.${multi ? 'all' : cur}`;
  const note = t(noteKey, { defaultValue: '' });
  const warnNote = t(`vehicle-setup:note.${ns}.${multi ? 'all' : cur}Warn`, { defaultValue: '' });
  const cols = opts.length >= 6 ? 'grid-cols-3' : opts.length === 4 || opts.length === 8 ? 'grid-cols-4' : opts.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className="space-y-4">
      <div className={`grid gap-2 ${cols}`}>
        {opts.map((id) => (
          <Pick
            key={id}
            label={t(`vehicle-setup:choice.${ns}.${id}.label`)}
            hint={t(`vehicle-setup:choice.${ns}.${id}.hint`, { defaultValue: '' }) || undefined}
            on={isOn(id)}
            picto={`${ns}.${id}`}
            onClick={() => setAnswers(applyChoice(step, id, answers))}
          />
        ))}
      </div>
      {step === 'drive' && cur === 'omni' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-content-secondary">{t(`${K}.omniType`)}</span>
          {['1', '2', '3', '4'].map((v) => (
            <Chip key={v} label={t(`vehicle-setup:choice.omniType.${v}`)} on={(answers.choices?.omniType ?? '2') === v} onClick={() => setAnswers({ ...answers, choices: { ...answers.choices, omniType: v } })} />
          ))}
        </div>
      )}
      {step === 'leak' && cur === 'aux' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-content-secondary">{t(`${K}.leakPin`)}</span>
          {['50', '51', '52', '53', '54', '55'].map((v, i) => (
            <Chip key={v} label={`AUX${i + 1}`} on={(answers.choices?.leakPin ?? '50') === v} onClick={() => setAnswers({ ...answers, choices: { ...answers.choices, leakPin: v } })} />
          ))}
        </div>
      )}
      <WritesTable writes={writes} read={read} />
      {note && <Note>{note}</Note>}
      {warnNote && <Note warn>{warnNote}</Note>}
    </div>
  );
}

const PRESETS: [number, number][] = [[250, 5], [450, 10], [650, 15], [900, 22], [1300, 30]];

/** Copter size: frame and prop decide the Mission Planner starting tune. */
export function SizeStep({ answers, setAnswers, read }: StepProps) {
  const { t } = useTranslation();
  const frameMm = answers.frameMm ?? 450;
  const propIn = answers.propIn ?? 10;
  const cells = answers.cells ?? 4;
  const set = (patch: Partial<SetupAnswers>) => setAnswers({ ...answers, frameMm, propIn, ...patch });
  const writes = tuneSuggestion({ propIn, cells, chemistry: answers.chemistry }, read).changes;
  // props wider than the arm between two neighbours touch each other
  const overlap = propIn * 25.4 > frameMm / Math.SQRT2;
  const S = 220 / (frameMm + propIn * 25.4);
  const half = (frameMm * S) / 2 / Math.SQRT2;
  const pr = Math.max(4, (propIn * 25.4 * S) / 2);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([mm, p]) => (
          <Chip key={mm} label={t(`${K}.size.preset`, { mm, prop: p })} on={frameMm === mm && propIn === p} onClick={() => set({ frameMm: mm, propIn: p })} />
        ))}
      </div>
      <div className="grid grid-cols-[1fr_240px] gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Stepper label={t(`${K}.size.frame`)} value={frameMm} unit="mm" step={50} min={100} max={2000} note={t(`${K}.size.frameNote`)} onChange={(v) => set({ frameMm: v })} />
          <Stepper label={t(`${K}.size.prop`)} value={propIn} unit="in" min={3} max={40} note={t(`${K}.size.propNote`)} onChange={(v) => set({ propIn: v })} />
          <Stepper label={t(`${K}.size.cells`)} value={cells} unit="S" min={1} max={24} note={t(`${K}.size.cellsNote`)} onChange={(v) => set({ cells: v })} />
        </div>
        <div className="rounded-lg border border-subtle bg-surface p-2">
          <svg viewBox="0 0 240 240" className="w-full">
            <line x1={120 - half} y1={120 - half} x2={120 + half} y2={120 + half} className="stroke-content-tertiary" strokeWidth={4} />
            <line x1={120 + half} y1={120 - half} x2={120 - half} y2={120 + half} className="stroke-content-tertiary" strokeWidth={4} />
            {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) => (
              <circle key={`${dx}${dy}`} cx={120 + dx! * half} cy={120 + dy! * half} r={pr} className={overlap ? 'fill-red-500/20 stroke-red-500' : 'fill-sky-500/15 stroke-sky-500'} strokeWidth={1.5} />
            ))}
            <rect x={108} y={108} width={24} height={24} rx={4} className="fill-surface-raised stroke-content-tertiary" />
          </svg>
          <p className={`px-1 text-[11px] ${overlap ? 'text-red-600 dark:text-red-400' : 'text-content-tertiary'}`}>
            {overlap ? t(`${K}.size.overlap`, { prop: propIn, mm: frameMm }) : t(`${K}.size.toScale`, { prop: propIn, mm: frameMm })}
          </p>
        </div>
      </div>
      <WritesTable writes={writes} read={read} title={t(`${K}.size.fills`)} />
      <p className="text-[11px] text-content-tertiary">{t(`${K}.source`, { source: 'Mission Planner ConfigInitialParams' })}</p>
    </div>
  );
}

const COPTER_CLASSES: CopterClass[] = ['quad', 'hexa', 'octa', 'x8', 'y6', 'dodeca', 'tri', 'deca', 'single', 'coax', 'bi'];
const VTOL_CLASSES: CopterClass[] = ['quad', 'hexa', 'octa', 'x8', 'y6', 'tri'];

/** Motor layout: class, then type with the ArduPilot motor picture. VTOL shows lift outputs at 4 + motor number. */
export function FrameStep({ step, vehicle, answers, setAnswers, read }: StepProps) {
  const { t } = useTranslation();
  if (vehicle === 'heli') {
    return (
      <div className="space-y-3">
        {['firmware', 'wizard', 'heliSetup', 'interlock'].map((k) => (
          <div key={k} className="rounded-lg border border-subtle bg-surface p-3">
            <div className="text-sm font-medium text-content">{t(`${K}.heli.${k}.title`)}</div>
            <div className="text-xs text-content-secondary">{t(`${K}.heli.${k}.text`)}</div>
          </div>
        ))}
      </div>
    );
  }
  const vtol = step === 'vframe';
  const tail = vtol && answers.vtolType === 'tail';
  const tsKind = answers.tailsitter ?? 'dual';
  const showLayout = !tail || tsKind === 'copter';
  const cls = answers.copterClass ?? 'quad';
  const classNum = FRAME_CLASS[cls];
  const types = layoutsForClass(classNum);
  const type = answers.frameType ?? defaultFrameType(classNum);
  const layout = findLayout(classNum, type) ?? types[0] ?? null;
  const lift = vtol ? vtolLiftOutputs({ ...answers, copterClass: cls, frameType: type }) : [];
  return (
    <div className="space-y-4">
      {tail && (
        <div className="grid grid-cols-3 gap-2">
          {(['dual', 'single', 'copter'] as const).map((k) => (
            <Pick key={k} picto={`tailsitter.${k}`} label={t(`${K}.tailsitter.${k}.label`)} hint={t(`${K}.tailsitter.${k}.hint`)} on={tsKind === k}
              onClick={() => setAnswers({ ...answers, tailsitter: k, copterClass: k === 'copter' ? 'quad' : answers.copterClass })} />
          ))}
        </div>
      )}
      {showLayout && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(vtol ? VTOL_CLASSES : COPTER_CLASSES).map((c) => (
              <Chip key={c} label={t(`${K}.frameClass.${c}`)} on={cls === c} onClick={() => setAnswers({ ...answers, copterClass: c, frameType: defaultFrameType(FRAME_CLASS[c]) })} />
            ))}
          </div>
          {types.length > 0 ? (
            <div className="grid grid-cols-[1fr_300px] gap-4">
              <div className="flex flex-wrap content-start gap-1.5">
                {types.map((l) => (
                  <Chip key={l.Type} label={l.TypeName} on={type === l.Type} onClick={() => setAnswers({ ...answers, copterClass: cls, frameType: l.Type })} />
                ))}
              </div>
              {layout && <div className="rounded-lg border border-subtle bg-surface p-2"><FrameDiagram layout={layout} activeMotor={null} size={280} quadplane={vtol} /></div>}
            </div>
          ) : (
            <Note>{t(`${K}.noPicture`)}</Note>
          )}
          {!vtol && (cls === 'single' || cls === 'coax' || cls === 'bi' || cls === 'tri') && <Note>{t(`${K}.frameNote.${cls}`)}</Note>}
          {!vtol && (cls === 'x8' || cls === 'y6' || cls === 'dodeca') && <Note warn>{t(`${K}.frameNote.stacked`)}</Note>}
        </>
      )}
      {vtol && answers.vtolType === 'tilt' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-content-secondary">{t(`${K}.tiltMask`)}</span>
          {(cls === 'quad' ? ['3', '15'] : []).map((v) => (
            <Chip key={v} label={t(`${K}.tiltMaskOpt.${v}`)} on={(answers.choices?.tiltMask ?? '3') === v} onClick={() => setAnswers({ ...answers, choices: { ...answers.choices, tiltMask: v } })} />
          ))}
          {cls !== 'quad' && <span className="text-xs text-content-tertiary">{t(`${K}.tiltMaskOther`)}</span>}
        </div>
      )}
      {vtol && lift.length > 0 && (
        <OutputsTable rows={lift} read={read} />
      )}
      {vtol && <Note>{t(tail && tsKind !== 'copter' ? `${K}.vframeNoteTail` : `${K}.vframeNote`)}</Note>}
    </div>
  );
}

function roleLabel(t: (k: string, o?: Record<string, unknown>) => string, role: string, n?: number) {
  return t(`vehicle-setup:outputs.role.${role}`, { n });
}

function OutputsTable({ rows, read }: { rows: { output: number; fn: number; role: string; n?: number; auto?: boolean }[]; read: ParamReader }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-subtle bg-surface">
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => {
            const cur = read(`SERVO${r.output}_FUNCTION`);
            const ok = cur === r.fn;
            return (
              <tr key={`${r.output}-${r.fn}`} className="border-b border-subtle last:border-0">
                <td className="px-3 py-1.5 text-content-secondary">{t(`${K}.output`, { n: r.output })}</td>
                <td className="px-3 py-1.5 font-medium text-content">{roleLabel(t, r.role, r.n)}</td>
                <td className="px-3 py-1.5 font-mono text-content-tertiary">SERVO{r.output}_FUNCTION = {r.fn}</td>
                <td className="px-3 py-1.5 text-right">
                  {r.auto ? <span className="text-content-tertiary">{t(`${K}.autoByFirmware`)}</span>
                    : cur === undefined ? <span className="text-content-tertiary">{t(`${K}.noSuchOutput`)}</span>
                    : ok ? <span className="text-emerald-600 dark:text-emerald-400">{t(`${K}.already`)}</span>
                    : <span className="text-amber-600 dark:text-amber-400">{t(`${K}.willChange`, { from: cur })}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Plane / VTOL outputs: ArduPilot defaults first, extras on the next free outputs. */
export function OutputsStep({ vehicle, answers, setAnswers, read }: StepProps) {
  const { t } = useTranslation();
  if (vehicle !== 'plane' && vehicle !== 'vtol') return null;
  const rows = planeOutputs(vehicle, answers);
  const air = answers.airframe ?? 'normal';
  const ailerons = (air === 'normal' || air === 'vtail' || air === 'invv') && !(answers.extras ?? []).includes('flaperon') && answers.vtolType !== 'tail';
  const yLead = answers.aileronY !== false;
  return (
    <div className="space-y-4">
      {ailerons && (
        <div className="grid grid-cols-2 gap-2">
          <Pick picto="aileron.y" label={t(`${K}.aileron.y.label`)} hint={t(`${K}.aileron.y.hint`)} on={yLead} onClick={() => setAnswers({ ...answers, aileronY: true })} />
          <Pick picto="aileron.two" label={t(`${K}.aileron.two.label`)} hint={t(`${K}.aileron.two.hint`)} on={!yLead} onClick={() => setAnswers({ ...answers, aileronY: false })} />
        </div>
      )}
      <OutputsTable rows={rows} read={read} />
      <Note>{t(vehicle === 'vtol' ? `${K}.outputsNoteVtol` : `${K}.outputsNote`)}</Note>
    </div>
  );
}

/** Pilot checks: one row per thing to look at, ticked by hand; Reversed staged on the output. */
export function CheckStep({ step, vehicle, answers, setAnswers }: StepProps) {
  const { t } = useTranslation();
  const setParameter = useParameterStore((s) => s.setParameter);
  const parameters = useParameterStore((s) => s.parameters);
  const ticks = answers.choices ?? {};
  const tick = (key: string) => setAnswers({ ...answers, choices: { ...ticks, [`ok_${step}_${key}`]: ticks[`ok_${step}_${key}`] === '1' ? '0' : '1' } });
  let rows: { key: string; title: string; text: string; reverse?: number }[] = [];
  if (step === 'surfaces' && (vehicle === 'plane' || vehicle === 'vtol')) {
    rows = planeOutputs(vehicle, answers).filter((o) => o.test).map((o) => ({ key: `o${o.output}`, title: roleLabel(t, o.role, o.n), text: t(`vehicle-setup:outputs.test.${o.test}`), reverse: o.output }));
    if (answers.airframe !== 'none') rows.push({ key: 'stab', title: t(`${K}.check.stab.title`), text: t(`${K}.check.stab.text`) });
  } else {
    const keys = checkKeys(step, vehicle, answers);
    rows = keys.map((k) => ({ key: k, title: t(`${K}.check.${k}.title`), text: t(`${K}.check.${k}.text`) }));
  }
  const noteKey = step === 'surfaces' ? (['wing', 'vtail', 'invv'].includes(answers.airframe ?? '') ? 'surfacesMixed' : 'surfaces') : step === 'drivetest' && vehicle === 'boat' ? 'drivetestBoat' : step;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-subtle bg-surface">
        {rows.map((r) => {
          const ok = ticks[`ok_${step}_${r.key}`] === '1';
          const revName = r.reverse ? `SERVO${r.reverse}_REVERSED` : null;
          const rev = revName ? (parameters.get(revName)?.value ?? 0) === 1 : false;
          return (
            <div key={r.key} className="flex items-center gap-3 border-b border-subtle px-3 py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-content">{r.title}</div>
                <div className="text-xs text-content-secondary">{r.text}</div>
              </div>
              {revName && parameters.has(revName) && (
                <button type="button" onClick={() => void setParameter(revName, rev ? 0 : 1)}
                  className={`rounded-md border px-2.5 py-1 text-xs ${rev ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300' : pickOff}`}>
                  {rev ? t(`${K}.reversed`) : t(`${K}.normal`)}
                </button>
              )}
              <button type="button" onClick={() => tick(r.key)}
                className={`rounded-md border px-2.5 py-1 text-xs ${ok ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : pickOff}`}>
                {ok ? t(`${K}.yes`) : t(`${K}.check.button`)}
              </button>
            </div>
          );
        })}
      </div>
      <Note warn={step === 'thrusters' || (step === 'thrcheck' && answers.power === 'ic')}>{t(`vehicle-setup:note.check.${noteKey}${step === 'thrcheck' && answers.power === 'ic' ? 'Ic' : ''}`)}</Note>
    </div>
  );
}

function checkKeys(step: SetupStepId, vehicle: SetupVehicle, a: SetupAnswers): string[] {
  if (step === 'thrcheck') return a.power === 'twin' ? ['motorL', 'motorR'] : a.power === 'ic' ? ['kill', 'start'] : ['spin', 'stop'];
  if (step === 'drivetest') {
    const d = a.drive ?? (vehicle === 'boat' ? 'rudder' : 'steer');
    if (d === 'balance') return ['balance'];
    if (d === 'skid' || d === 'diff') return ['motorC', 'motorD'];
    if (d === 'omni') return ['omni'];
    if (d === 'sail') return ['sail', 'rudder'];
    return ['motorA', 'motorB'];
  }
  if (step === 'thrusters') return ['inWater', 'room'];
  if (step === 'water') return ['zeroDepth'];
  return [];
}

/** Fixed-wing size: wing and weight give the stall estimate, the airspeed limits follow from it. */
export function PlaneSizeStep({ answers, setAnswers, read }: StepProps) {
  const { t } = useTranslation();
  const span = answers.spanMm ?? 1400, root = answers.rootMm ?? 220, tip = answers.tipMm ?? 160, mass = answers.massG ?? 1200;
  const set = (patch: Partial<SetupAnswers>) => setAnswers({ ...answers, spanMm: span, rootMm: root, tipMm: tip, massG: mass, ...patch });
  const estimate = estimateStall(span, root, tip, mass, answers.airframe);
  const stall = stallOf({ ...answers, spanMm: span, rootMm: root, tipMm: tip, massG: mass });
  const writes = airspeedSuggestion({ stall }, read).changes;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <Stepper label={t(`${K}.psize.span`)} value={span} unit="mm" step={50} min={300} max={6000} note={t(`${K}.psize.spanNote`)} onChange={(v) => set({ spanMm: v })} />
        <Stepper label={t(`${K}.psize.root`)} value={root} unit="mm" step={10} min={50} max={1000} note={t(`${K}.psize.rootNote`)} onChange={(v) => set({ rootMm: v })} />
        <Stepper label={t(`${K}.psize.tip`)} value={tip} unit="mm" step={10} min={0} max={1000} note={t(`${K}.psize.tipNote`)} onChange={(v) => set({ tipMm: v })} />
        <Stepper label={t(`${K}.psize.mass`)} value={mass} unit="g" step={50} min={100} max={50000} note={t(`${K}.psize.massNote`)} onChange={(v) => set({ massG: v })} />
      </div>
      <div className="flex items-center gap-4 rounded-lg border border-subtle bg-surface p-3">
        <div>
          <div className="text-xs text-content-secondary">{t(`${K}.psize.stall`)}</div>
          <div className="text-2xl font-semibold tabular-nums text-content">{stall} m/s <span className="text-sm font-normal text-content-tertiary">{Math.round(stall * 3.6)} km/h</span></div>
          <div className="text-[11px] text-content-tertiary">{answers.stall ? t(`${K}.psize.own`, { estimate }) : t(`${K}.psize.from`, { area: Math.round((span / 1000) * ((root + tip) / 2 / 1000) * 10000) / 100, mass })}</div>
        </div>
        <div className="ml-auto">
          {answers.stall
            ? <button type="button" onClick={() => setAnswers({ ...answers, stall: undefined })} className={`rounded-md border px-2.5 py-1 text-xs ${pickOff}`}>{t(`${K}.psize.useEstimate`)}</button>
            : <Stepper label={t(`${K}.psize.knowIt`)} value={estimate} unit="m/s" step={0.5} min={3} max={60} onChange={(v) => setAnswers({ ...answers, stall: v })} />}
        </div>
      </div>
      <WritesTable writes={writes} read={read} title={t(`${K}.psize.fills`)} />
      <Note>{t(`${K}.psize.note`)}</Note>
    </div>
  );
}

const CELLS = [2, 3, 4, 5, 6, 8, 10, 12, 14];
const CAPS = [1300, 2200, 5000, 10000, 16000, 22000];
const MONITORS = ['4', '3', '8', '9'];

/** Battery voltages from cells and chemistry, the monitor type, and the failsafe actions the firmware offers. */
export function BatteryStep({ vehicle, answers, setAnswers, read }: StepProps) {
  const { t } = useTranslation();
  const meta = useParameterStore((s) => s.getParameterMetadata);
  const cells = answers.cells ?? 4;
  const chem: Chemistry = toChemistry(answers.chemistry);
  const cap = answers.capacity ?? read('BATT_CAPACITY') ?? 5000;
  const v = batteryValues(cells, chem);
  const choices = answers.choices ?? {};
  const setChoice = (k: string, val: string) => setAnswers({ ...answers, choices: { ...choices, [k]: val } });
  const lo = v.empty - cells * 0.2, hi = v.full;
  const pct = (x: number) => Math.max(0, Math.min(100, Math.round(((x - lo) / (hi - lo)) * 100)));
  const monitor = choices.monitor ?? String(read('BATT_MONITOR') ?? 4);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-xs text-content-secondary">{t(`${K}.battery.chemistry`)}</span>
            {(['lipo', 'lipohv', 'liion'] as const).map((c) => <Chip key={c} label={t(`${K}.battery.chem.${c}`)} on={chem === c} onClick={() => setAnswers({ ...answers, chemistry: c })} />)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-xs text-content-secondary">{t(`${K}.battery.cells`)}</span>
            {CELLS.map((n) => <Chip key={n} label={`${n}S`} on={cells === n} onClick={() => setAnswers({ ...answers, cells: n })} />)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 text-xs text-content-secondary">{t(`${K}.battery.capacity`)}</span>
            {CAPS.map((n) => <Chip key={n} label={n >= 10000 ? `${n / 1000} Ah` : `${n} mAh`} on={cap === n} onClick={() => setAnswers({ ...answers, capacity: n })} />)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {MONITORS.map((m) => <Pick key={m} picto={`monitor.${m}`} label={t(`${K}.battery.monitor.${m}.label`)} hint={t(`${K}.battery.monitor.${m}.hint`)} on={monitor === m} onClick={() => setChoice('monitor', m)} />)}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-subtle bg-surface p-3">
            <div className="relative h-3 rounded-full bg-gradient-to-r from-red-500/60 via-amber-500/60 to-emerald-500/60">
              {([['critical', v.critical], ['low', v.low], ['arm', v.arm], ['full', v.full]] as const).map(([k, val]) => (
                <div key={k} className="absolute top-0 h-3 w-0.5 bg-content" style={{ left: `${pct(val)}%` }} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center">
              {([['critical', v.critical], ['low', v.low], ['arm', v.arm], ['full', v.full]] as const).map(([k, val]) => (
                <div key={k}>
                  <div className="text-sm font-medium tabular-nums text-content">{val.toFixed(1)} V</div>
                  <div className="text-[11px] text-content-tertiary">{t(`${K}.battery.mark.${k}`)}</div>
                </div>
              ))}
            </div>
          </div>
          {failsafeRows(vehicle).map((row) => {
            const values = meta(row.param)?.values;
            if (!values || read(row.param) === undefined) return null;
            const cur = choices[`fs_${row.key}`] ?? String(read(row.param));
            return (
              <div key={row.key}>
                <div className="mb-1.5 text-xs font-medium text-content">{t(`${K}.failsafe.${row.key}`)} <span className="font-mono font-normal text-content-tertiary">{row.param}</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(values).filter(([, label]) => !/terminat|parachute/i.test(label)).map(([val, label]) => (
                    <Chip key={val} label={label} on={cur === val} onClick={() => setChoice(`fs_${row.key}`, val)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <Note>{t(`${K}.battery.note`)}</Note>
    </div>
  );
}

/** What the flight controller still refuses to arm for, each linked to the step that fixes it. */
export function ReadyStep({ vehicle, plan, prearm, onGo }: { vehicle: SetupVehicle; plan: SetupStepId[]; prearm: string[]; onGo: (s: SetupStepId) => void }) {
  const { t } = useTranslation();
  const rows = useMemo(() => prearm.map((text) => ({ text, step: prearmStep(text, vehicle, plan), fix: matchPreArmError(`PreArm: ${text}`) })), [prearm, vehicle, plan]);
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
        <div className="text-lg font-semibold text-content">{t(`${K}.ready.none`)}</div>
        <div className="text-sm text-content-secondary">{t(`${K}.ready.noneSub`)}</div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <div className="text-base font-semibold text-content">{t(`${K}.ready.count`, { count: rows.length })}</div>
        <div className="text-xs text-content-secondary">{t(`${K}.ready.sub`)}</div>
      </div>
      {rows.map((r) => (
        <div key={r.text} className="rounded-lg border border-subtle bg-surface p-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 font-mono text-xs text-content">{r.text}</div>
            {r.step && (
              <button type="button" onClick={() => onGo(r.step!)} className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-500">
                {t(`${K}.ready.fix`, { step: t(`vehicle-setup:steps.${r.step}.name`) })}
              </button>
            )}
          </div>
          {!r.step && r.fix && <div className="mt-2"><PreArmParamFix fix={r.fix.pattern.fix} /></div>}
        </div>
      ))}
    </div>
  );
}

/** Live receiver signal, so "is it connected" is answered by the board. */
export function ReceiverLive() {
  const { t } = useTranslation();
  const rc = useTelemetryStore((s) => s.rcChannels);
  const live = (rc?.chancount ?? 0) > 0;
  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 ${live ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-subtle bg-surface'}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-content-tertiary'}`} />
      <div className="flex-1 text-sm text-content">{live ? t(`${K}.rx.live`, { count: rc!.chancount }) : t(`${K}.rx.waiting`)}</div>
      {live && (
        <div className="flex gap-1">
          {rc!.channels.slice(0, 4).map((pwm, i) => (
            <div key={i} className="h-8 w-2 overflow-hidden rounded bg-surface-inset">
              <div className="w-full bg-blue-500" style={{ height: `${Math.max(0, Math.min(100, ((pwm - 1000) / 1000) * 100))}%`, marginTop: 'auto' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Subs drive by gamepad; the ArduSub button defaults are shown, changed in Cockpit or desktop joystick setup. */
export function SubModesInfo() {
  const { t } = useTranslation();
  return <Note>{t(`${K}.subModes`)}</Note>;
}
