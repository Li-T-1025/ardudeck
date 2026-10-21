/** Shared pieces of the Quick setup cards: tones, the card frame, chips, toggles and the staged-parameter hook. */
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';

export type Tone = 'ok' | 'warn' | 'risk' | 'off';

export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  risk: 'bg-red-500',
  off: 'bg-content-tertiary/40',
};
export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  risk: 'text-red-600 dark:text-red-400',
  off: 'text-content-tertiary',
};

/** One parameter as the card sees it: staged value, whether the vehicle has it, and how to stage a change. */
export function useParam() {
  const parameters = useParameterStore((s) => s.parameters);
  const setParameter = useParameterStore((s) => s.setParameter);
  const meta = useParameterStore((s) => s.getParameterMetadata);
  return {
    has: (name: string) => parameters.has(name),
    get: (name: string, fallback = 0) => parameters.get(name)?.value ?? fallback,
    /** undefined when the vehicle does not have the parameter */
    maybe: (name: string): number | undefined => parameters.get(name)?.value,
    // staged only: it reaches the aircraft through Write to Flash and its review
    set: (name: string, value: number) => setParameter(name, value),
    meta,
  };
}

export function Card({ id, icon, iconTone, title, hint, status, statusText, children, more }: {
  id?: string; icon: ReactNode; iconTone: string; title: string; hint: string; status: Tone; statusText: string;
  children: ReactNode; more?: { label: string; onClick: () => void };
}) {
  return (
    <section id={id} className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${iconTone}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-content">{title}</h3>
          <p className="text-xs text-content-secondary">{hint}</p>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 text-[11px] font-medium ${TONE_TEXT[status]}`}>
          <span className={`h-2 w-2 rounded-full ${TONE_DOT[status]}`} />
          {statusText}
        </span>
      </div>
      {children}
      {more && (
        <button type="button" onClick={more.onClick} className="inline-flex items-center gap-1 text-xs text-content-secondary hover:text-content">
          {more.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </section>
  );
}

export function Chips<T extends number>({ options, value, onChange, label }: {
  options: Array<{ value: T; label: string }>; value: number; onChange: (v: T) => void; label: string;
}) {
  return (
    <div>
      {label && <div className="text-xs text-content-secondary mb-1.5">{label}</div>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${value === o.value ? 'border-blue-500/60 bg-blue-500/15 text-content' : 'border-subtle text-content-secondary hover:text-content'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-content">{label}</div>
        {hint && <div className="text-[11px] text-content-tertiary">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-blue-600' : 'border border-subtle bg-surface-inset'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full border border-strong bg-white shadow-sm transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

/** One line of a check list: green tick or red cross, with a Fix link when it fails. */
export function CheckLine({ ok, text, fixLabel, onFix, children }: { ok: boolean; text: string; fixLabel?: string; onFix?: () => void; children?: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className={`inline-block h-4 w-4 shrink-0 rounded-full text-center text-[10px] leading-4 ${ok ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>{ok ? '✓' : '✕'}</span>
      <span className="flex-1 text-content">{text}</span>
      {children}
      {!ok && onFix && fixLabel && <button type="button" onClick={onFix} className="shrink-0 text-xs text-sky-700 hover:underline dark:text-sky-300">{fixLabel}</button>}
    </li>
  );
}

export function SmallButton({ onClick, children, disabled, primary }: { onClick: () => void; children: ReactNode; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={primary
        ? 'rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40'
        : 'rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-inset disabled:cursor-not-allowed disabled:opacity-40'}
    >
      {children}
    </button>
  );
}

/** An enum parameter as a select of the firmware's own choices, as the Safety tab does. */
export function EnumChips({ name, label }: { name: string; label: string }) {
  const p = useParam();
  const values = p.meta(name)?.values;
  if (!p.has(name)) return null;
  const value = p.get(name);
  return (
    <div>
      {label && <label className="text-xs text-content-secondary block mb-1.5">{label}</label>}
      <select
        value={value}
        onChange={(e) => p.set(name, Number(e.target.value))}
        className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
      >
        {values ? Object.entries(values).map(([v, text]) => <option key={v} value={Number(v)}>{text}</option>) : <option value={value}>{value}</option>}
      </select>
    </div>
  );
}
