import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Battery, Box, Hand, Search, Cable, Check, CircuitBoard, Cpu, ExternalLink, Fan, Lightbulb, Loader2, Navigation, Network, Plus, Radar, Radio, Ruler, Satellite, ScanEye, Usb, Wifi, Wind, type LucideIcon } from 'lucide-react';
import type { HardwareSetupCategory, HardwareSetupEntry } from '@ardudeck/module-sdk';
import { hardwareSetupRegistry } from '../../../modules/module-extension-registries';
import { useParameterStore } from '../../../stores/parameter-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { proposeParameterChanges } from '../../../lib/param-proposal';
import { HARDWARE_PRESETS, CATEGORY_ORDER, type HardwarePreset, type Mount, type SetupAnswers } from './presets';
import { planSetup, serialPorts, firstFreePort, portIsVital, type ParamLookup } from './plan';

type Step = 'pick' | 'configure' | 'applying' | 'restarting' | 'finishing' | 'check';
const STEPS: { steps: Step[]; key: string }[] = [
  { steps: ['pick'], key: 'stepPick' },
  { steps: ['configure'], key: 'stepConfigure' },
  { steps: ['applying', 'restarting', 'finishing'], key: 'stepApply' },
  { steps: ['check'], key: 'stepCheck' },
];
const RECONNECT_TIMEOUT_MS = 90_000;

// same tinted-square language as the Hardware tab's parts (GPS emerald, datalinks indigo)
const CATEGORY_STYLE: Record<HardwareSetupCategory, { Icon: LucideIcon; box: string; icon: string }> = {
  rangefinder: { Icon: Ruler, box: 'bg-violet-500/20', icon: 'text-violet-400' },
  airspeed: { Icon: Wind, box: 'bg-blue-500/20', icon: 'text-blue-400' },
  proximity: { Icon: Radar, box: 'bg-fuchsia-500/20', icon: 'text-fuchsia-400' },
  flow: { Icon: ScanEye, box: 'bg-lime-500/20', icon: 'text-lime-400' },
  gps: { Icon: Satellite, box: 'bg-emerald-500/20', icon: 'text-emerald-400' },
  telemetry: { Icon: Wifi, box: 'bg-indigo-500/20', icon: 'text-indigo-400' },
  compass: { Icon: Navigation, box: 'bg-cyan-500/20', icon: 'text-cyan-400' },
  esc: { Icon: Fan, box: 'bg-rose-500/20', icon: 'text-rose-400' },
  power: { Icon: Battery, box: 'bg-orange-500/20', icon: 'text-orange-400' },
  lighting: { Icon: Lightbulb, box: 'bg-amber-500/20', icon: 'text-amber-400' },
  receiver: { Icon: Radio, box: 'bg-teal-500/20', icon: 'text-teal-400' },
  datalink: { Icon: Wifi, box: 'bg-indigo-500/20', icon: 'text-indigo-400' },
  autopilot: { Icon: Cpu, box: 'bg-sky-500/20', icon: 'text-sky-400' },
  other: { Icon: Box, box: 'bg-slate-500/20', icon: 'text-slate-400' },
};
/** Built-in categories first, then the ones only cargos list. */
const ALL_CATEGORIES: HardwareSetupCategory[] = [...CATEGORY_ORDER, ...(['compass', 'lighting', 'datalink', 'autopilot', 'other'] as const)];
const CONNECTION_ICON: Record<NonNullable<HardwareSetupEntry['connection']> | 'output', LucideIcon> = { serial: Cable, i2c: CircuitBoard, can: Network, usb: Usb, network: Wifi, output: Fan };

function IconBox({ category, size = 'md' }: { category: HardwareSetupCategory | null; size?: 'sm' | 'md' }) {
  const s = category ? CATEGORY_STYLE[category] : { Icon: Plus, box: 'bg-blue-500/20', icon: 'text-blue-400' };
  const dim = size === 'md' ? 'w-10 h-10' : 'w-7 h-7';
  return (
    <div className={`${dim} shrink-0 rounded-lg ${s.box} flex items-center justify-center`}>
      <s.Icon className={`${size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} ${s.icon}`} />
    </div>
  );
}

/** Parameter values and the firmware's enum labels, as the planner reads them. */
function useLookup(): ParamLookup {
  const parameters = useParameterStore((s) => s.parameters);
  const getMeta = useParameterStore((s) => s.getParameterMetadata);
  return useMemo(() => (name: string) => {
    const p = parameters.get(name);
    if (!p) return undefined;
    return { value: p.value, values: getMeta(name)?.values };
  }, [parameters, getMeta]);
}

function lookupNow(): ParamLookup {
  const s = useParameterStore.getState();
  return (name) => {
    const p = s.parameters.get(name);
    return p ? { value: p.value, values: s.getParameterMetadata(name)?.values } : undefined;
  };
}

async function waitFor(test: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (test()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return test();
}

/** The type parameter that says whether this firmware supports the device at all. */
function keyParam(p: HardwarePreset): string | undefined {
  const param = p.params.find((x) => x.expect && !x.name.startsWith('SERIAL') && !x.name.startsWith('CAN_'));
  return param?.name.replace('{i}', '1');
}

export function HardwareSetupWizard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const lookup = useLookup();
  const [step, setStep] = useState<Step>('pick');
  const [preset, setPreset] = useState<HardwarePreset | null>(null);
  const [answers, setAnswers] = useState<SetupAnswers>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [laterMissing, setLaterMissing] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const cargoSetups = hardwareSetupRegistry.useEntries();
  const cargoEntries = useMemo(() => cargoSetups.flatMap((e) => e.value.map((entry) => ({ key: `${e.slug}:${entry.id}`, entry }))), [cargoSetups]);
  /** Every word must appear in the name, description, category or vendor. */
  const matches = (name: string, blurb: string, cat: HardwareSetupCategory, vendor?: string) => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const hay = `${name} ${blurb} ${t(`mavlink-config:hardwareSetup.category.${cat}`)} ${vendor ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const openCargo = (entry: HardwareSetupEntry) => {
    onClose();
    // after the dialog is gone, so the cargo's own setup is not covered by it
    setTimeout(() => { try { entry.open(); } catch (err) { console.error('[hardware setup] cargo open failed', err); } }, 0);
  };

  const ports = useMemo(() => serialPorts(lookup), [lookup]);
  const plan = preset ? planSetup(preset, answers, lookup) : null;
  const errorText = (e: { key: string; values?: Record<string, string | number> }) => t(`mavlink-config:hardwareSetup.error.${e.key}`, e.values ?? {});

  const choose = (p: HardwarePreset) => {
    setPreset(p);
    setAnswers({ serial: p.connection === 'serial' ? firstFreePort(ports) : undefined, mount: p.mounts?.[0], motors: 4, poles: 14 });
    setFailure(null);
    setStep('configure');
  };

  const propose = async (changes: { name: string; value: number }[]) => {
    const outcome = await proposeParameterChanges(changes.map((c) => ({ ...c, reason: t('mavlink-config:hardwareSetup.reason', { device: preset!.name }) })));
    if (outcome.ok) return true;
    setFailure(outcome.reason === 'user cancelled' ? t('mavlink-config:hardwareSetup.cancelled') : (outcome.reason ?? t('mavlink-config:hardwareSetup.writeFailed')));
    return false;
  };

  const run = async () => {
    if (!preset || !plan || plan.errors.length > 0) return;
    setFailure(null);
    setStep('applying');
    if (plan.now.length > 0 && !(await propose(plan.now))) { setStep('configure'); return; }

    // a new device type only takes effect, and grows its own parameters, after a restart
    setStep('restarting');
    const ok = await window.electronAPI.mavlinkReboot().catch(() => false);
    if (!ok) { setFailure(t('mavlink-config:hardwareSetup.restartFailed')); setStep('configure'); return; }
    await waitFor(() => !useConnectionStore.getState().connectionState.isConnected, 15_000);
    const back = await waitFor(() => useConnectionStore.getState().connectionState.isConnected, RECONNECT_TIMEOUT_MS);
    if (!back) { setFailure(t('mavlink-config:hardwareSetup.notBack')); setStep('configure'); return; }
    await new Promise((r) => setTimeout(r, 1500));
    await useParameterStore.getState().fetchParameters({ force: true });

    setStep('finishing');
    const second = planSetup(preset, answers, lookupNow());
    if (second.errors.length > 0) { setFailure(second.errors.map(errorText).join(' · ')); setStep('configure'); return; }
    if (second.now.length > 0 && !(await propose(second.now))) { setStep('configure'); return; }
    setLaterMissing(second.afterRestart);
    setStep('check');
  };

  const busy = step === 'applying' || step === 'restarting' || step === 'finishing';

  // mid-setup a close would leave the vehicle half configured: only allowed when idle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  const currentStep = STEPS.findIndex((s) => s.steps.includes(step));

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="card w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto">
        <div className="card-body space-y-4">
          <div className="flex items-center gap-3">
            <IconBox category={preset?.category ?? null} />
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-content truncate">
                {preset ? t('mavlink-config:hardwareSetup.titleDevice', { device: preset.name }) : t('mavlink-config:hardwareSetup.title')}
              </h3>
              <p className="text-xs text-content-secondary">{t(`mavlink-config:hardwareSetup.${STEPS[currentStep]!.key}`)}</p>
            </div>
            <button onClick={onClose} disabled={busy} className="text-content-secondary hover:text-content transition-colors disabled:opacity-30" aria-label={t('common:close')}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <div key={s.key} className={`h-1 rounded-full flex-1 ${i === currentStep ? 'bg-blue-500' : i < currentStep ? 'bg-emerald-500' : 'bg-surface-raised'}`} />
            ))}
          </div>

          {failure && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg"><p className="text-xs text-red-300">{failure}</p></div>
          )}

          {step === 'pick' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary pointer-events-none" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('mavlink-config:hardwareSetup.search')}
                  className="w-full rounded-lg bg-surface-input border border-subtle pl-8 pr-2 py-1.5 text-sm text-content placeholder:text-content-tertiary"
                />
              </div>
              {(() => {
                const shown = ALL_CATEGORIES.some((cat) => HARDWARE_PRESETS.some((p) => p.category === cat && matches(p.name, t(`mavlink-config:hardwareSetup.blurb.${p.blurbKey}`), cat))
                  || cargoEntries.some((c) => c.entry.category === cat && matches(c.entry.name, c.entry.description ?? '', cat, c.entry.vendor)));
                return shown ? null : <p className="py-4 text-center text-sm text-content-secondary">{t('mavlink-config:hardwareSetup.noMatch', { query })}</p>;
              })()}
              {ALL_CATEGORIES.map((cat) => {
                const list = HARDWARE_PRESETS.filter((p) => p.category === cat && matches(p.name, t(`mavlink-config:hardwareSetup.blurb.${p.blurbKey}`), cat));
                const fromCargos = cargoEntries.filter((c) => c.entry.category === cat && matches(c.entry.name, c.entry.description ?? '', cat, c.entry.vendor));
                if (list.length === 0 && fromCargos.length === 0) return null;
                return (
                  <div key={cat}>
                    <div className="mb-2 flex items-center gap-2">
                      <IconBox category={cat} size="sm" />
                      <span className="text-sm font-medium text-content">{t(`mavlink-config:hardwareSetup.category.${cat}`)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {list.map((p) => {
                        const key = keyParam(p);
                        const available = !key || key.split('|').some((n) => !!lookup(n));
                        const Conn = CONNECTION_ICON[p.connection];
                        return (
                          <button
                            key={p.id}
                            onClick={() => choose(p)}
                            disabled={!available}
                            className="flex flex-col rounded-lg border border-subtle bg-surface p-3 text-left transition-colors hover:border-blue-500/50 hover:bg-surface-raised disabled:opacity-40 disabled:hover:border-subtle disabled:hover:bg-surface"
                          >
                            <div className="text-sm font-medium text-content">{p.name}</div>
                            <div className="mt-0.5 flex-1 text-xs text-content-secondary leading-snug">
                              {available ? t(`mavlink-config:hardwareSetup.blurb.${p.blurbKey}`) : t('mavlink-config:hardwareSetup.notOnFirmware')}
                            </div>
                            <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-content-secondary">
                              <Conn className="w-3 h-3" />{t(`mavlink-config:hardwareSetup.connection.${p.connection}`)}
                            </span>
                          </button>
                        );
                      })}
                      {fromCargos.map(({ key, entry }) => {
                        const Conn = entry.connection ? CONNECTION_ICON[entry.connection] : null;
                        return (
                          <button
                            key={key}
                            onClick={() => openCargo(entry)}
                            className="flex flex-col rounded-lg border border-subtle bg-surface p-3 text-left transition-colors hover:border-blue-500/50 hover:bg-surface-raised"
                          >
                            <div className="text-sm font-medium text-content">{entry.name}</div>
                            {entry.description && <div className="mt-0.5 flex-1 text-xs text-content-secondary leading-snug">{entry.description}</div>}
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {entry.vendor && <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-300">{entry.vendor}</span>}
                              {Conn && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] text-content-secondary">
                                  <Conn className="w-3 h-3" />{t(`mavlink-config:hardwareSetup.connection.${entry.connection}`)}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 'configure' && preset && plan && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-content-secondary">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-[10px]">
                  {(() => { const Conn = CONNECTION_ICON[preset.connection]; return <Conn className="w-3 h-3" />; })()}
                  {t(`mavlink-config:hardwareSetup.connection.${preset.connection}`)}
                </span>
                <span>{t(`mavlink-config:hardwareSetup.blurb.${preset.blurbKey}`)}</span>
              </div>
              {preset.connection === 'serial' && (
                <div>
                  <label className="block text-xs text-content-secondary mb-1">{t('mavlink-config:hardwareSetup.whichPort')}</label>
                  <select
                    value={answers.serial ?? ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, serial: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    className="w-full rounded-lg bg-surface-input border border-subtle px-2 py-1.5 text-sm text-content"
                  >
                    <option value="">{t('mavlink-config:hardwareSetup.choosePort')}</option>
                    {ports.map((p) => (
                      <option key={p.port} value={p.port}>{t('mavlink-config:hardwareSetup.portOption', { n: p.port, use: p.label })}</option>
                    ))}
                  </select>
                  {(() => {
                    const chosen = ports.find((p) => p.port === answers.serial);
                    return chosen && portIsVital(chosen) ? (
                      <div className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{t('mavlink-config:hardwareSetup.portInUse', { use: chosen.label })}
                      </div>
                    ) : null;
                  })()}
                  <p className="mt-1 text-[11px] text-content-tertiary">{t('mavlink-config:hardwareSetup.portHint')}</p>
                </div>
              )}
              {preset.mounts && preset.mounts.length > 1 && (
                <div>
                  <label className="block text-xs text-content-secondary mb-1">{t('mavlink-config:hardwareSetup.mounting')}</label>
                  <div className="flex rounded-lg border border-subtle overflow-hidden">
                    {preset.mounts.map((m: Mount) => (
                      <button key={m} onClick={() => setAnswers((a) => ({ ...a, mount: m }))}
                        className={`flex-1 px-2 py-1.5 text-xs transition-colors ${answers.mount === m ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-surface-raised'}`}>
                        {t(`mavlink-config:hardwareSetup.mount.${m}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {preset.asks?.includes('motors') && (
                <div>
                  <label className="block text-xs text-content-secondary mb-1">{t('mavlink-config:hardwareSetup.motors')}</label>
                  <div className="flex rounded-lg border border-subtle overflow-hidden">
                    {[4, 6, 8].map((n) => (
                      <button key={n} onClick={() => setAnswers((a) => ({ ...a, motors: n }))}
                        className={`flex-1 px-2 py-1.5 text-xs transition-colors ${answers.motors === n ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-surface-raised'}`}>
                        {t('mavlink-config:hardwareSetup.motorsN', { n })}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {preset.asks?.includes('poles') && (
                <div>
                  <label className="block text-xs text-content-secondary mb-1">{t('mavlink-config:hardwareSetup.poles')}</label>
                  <select
                    value={answers.poles ?? 14}
                    onChange={(e) => setAnswers((a) => ({ ...a, poles: Number(e.target.value) }))}
                    className="w-full rounded-lg bg-surface-input border border-subtle px-2 py-1.5 text-sm text-content"
                  >
                    {Array.from({ length: 18 }, (_, k) => 8 + k * 2).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <p className="mt-1 text-[11px] text-content-tertiary">{t('mavlink-config:hardwareSetup.polesHint')}</p>
                </div>
              )}
              <ManualSteps steps={plan.manual} />
              {plan.errors.length > 0 ? (
                <div className="space-y-1">{plan.errors.map((e) => <p key={e.key + JSON.stringify(e.values)} className="text-xs text-amber-300">{errorText(e)}</p>)}</div>
              ) : (
                <div className="rounded-lg bg-surface-raised/40 p-3 text-xs text-content-secondary space-y-1">
                  <p>{t('mavlink-config:hardwareSetup.willSet', { count: plan.now.length })}</p>
                  {plan.instance !== null && <p>{t('mavlink-config:hardwareSetup.usesSlot', { family: preset.instance!.prefix, n: plan.instance })}</p>}
                  <p>{t('mavlink-config:hardwareSetup.thenRestart', { count: plan.afterRestart.length })}</p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <button onClick={() => { setPreset(null); setStep('pick'); setFailure(null); }} className="text-xs text-content-secondary hover:text-content">{t('common:back')}</button>
                <button onClick={() => void run()} disabled={plan.errors.length > 0} className="btn btn-primary text-sm disabled:opacity-40">{t('mavlink-config:hardwareSetup.setUp')}</button>
              </div>
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-content-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />{t(`mavlink-config:hardwareSetup.busy.${step}`)}
            </div>
          )}

          {step === 'check' && preset && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-300">{t('mavlink-config:hardwareSetup.done', { device: preset.name })}</p>
              </div>
              <ManualSteps steps={planSetup(preset, answers, lookup).manual} />
              {laterMissing.length > 0 && <p className="text-xs text-amber-300">{t('mavlink-config:hardwareSetup.stillMissing', { names: laterMissing.join(', ') })}</p>}
              <LiveCheck check={preset.check} />
              <div className="flex items-center justify-between pt-1">
                {preset.docs ? (
                  <a href={preset.docs} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    <ExternalLink className="w-3.5 h-3.5" />{t('mavlink-config:hardwareSetup.docs')}
                  </a>
                ) : <span />}
                <button onClick={onClose} className="btn btn-primary text-sm">{t('common:done')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Steps ArduDeck will not take itself, ticked off live as soon as the vehicle reports the value. */
function ManualSteps({ steps }: { steps: { name: string; value: number; label: string | null; done: boolean }[] }) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;
  const allDone = steps.every((s) => s.done);
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${allDone ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
      <div className="flex items-center gap-2">
        <Hand className={`w-4 h-4 ${allDone ? 'text-emerald-400' : 'text-amber-400'}`} />
        <span className="text-xs font-medium text-content">{t('mavlink-config:hardwareSetup.manualTitle', { count: steps.length })}</span>
      </div>
      {steps.map((s) => (
        <div key={s.name} className="flex items-start gap-2 text-xs">
          {s.done
            ? <Check className="w-3.5 h-3.5 mt-px shrink-0 text-emerald-400" />
            : <span className="w-3.5 h-3.5 mt-px shrink-0 rounded-full border border-amber-400" />}
          <span className={s.done ? 'text-emerald-300' : 'text-content'}>
            {s.done
              ? t('mavlink-config:hardwareSetup.manualDone', { param: s.name, label: s.label ?? s.value })
              : t('mavlink-config:hardwareSetup.manualStep', { param: s.name, label: s.label ?? s.value, value: s.value })}
          </span>
        </div>
      ))}
      {!allDone && <p className="text-[11px] text-content-secondary">{t('mavlink-config:hardwareSetup.manualWhy')}</p>}
    </div>
  );
}

/** Proof it works: the sensor's own live reading, with what to do to see it move. */
function LiveCheck({ check }: { check: HardwarePreset['check'] }) {
  const { t } = useTranslation();
  const rangefinder = useTelemetryStore((s) => s.rangefinder);
  const proximity = useTelemetryStore((s) => s.proximity);
  const airspeed = useTelemetryStore((s) => s.vfrHud.airspeed);
  const gps = useTelemetryStore((s) => s.gps);
  const rc = useTelemetryStore((s) => s.rcChannels);
  const battery = useTelemetryStore((s) => s.battery);
  const esc = useTelemetryStore((s) => s.escTelemetry);
  if (!check) return null;
  let value: string | null = null;
  if (check === 'rangefinder' && rangefinder && Date.now() - rangefinder.receivedAt < 2000) value = `${rangefinder.distance.toFixed(2)} m`;
  if (check === 'proximity') {
    const live = Object.values(proximity).filter((d) => Date.now() - d.receivedAt < 2000);
    if (live.length > 0) value = `${Math.min(...live.map((d) => d.distance)).toFixed(2)} m`;
  }
  if (check === 'airspeed') value = `${airspeed.toFixed(1)} m/s`;
  if (check === 'gps' && gps.fixType > 0) value = t('mavlink-config:hardwareSetup.gpsValue', { fix: gps.fixType, sats: gps.satellites });
  if (check === 'rc' && rc.chancount > 0 && rc.channels.some((c) => c > 0)) value = t('mavlink-config:hardwareSetup.rcValue', { n: rc.chancount, ch3: rc.channels[2] ?? 0 });
  if (check === 'esc' && esc && Date.now() - esc.timestamp < 2000) {
    const motors = esc.motors.filter((m): m is NonNullable<typeof m> => !!m);
    if (motors.length > 0) value = t('mavlink-config:hardwareSetup.escValue', { n: motors.length, rpm: motors.map((m) => Math.round(m.rpm)).join(' / ') });
  }
  if (check === 'battery' && battery.voltage > 0) value = `${battery.voltage.toFixed(2)} V · ${battery.current.toFixed(1)} A`;
  return (
    <div className="rounded-lg border border-subtle p-3">
      <div className="text-[11px] uppercase tracking-wide text-content-tertiary">{t('mavlink-config:hardwareSetup.liveReading')}</div>
      <div className={`mt-1 font-mono text-lg ${value ? 'text-content' : 'text-content-tertiary'}`}>{value ?? t('mavlink-config:hardwareSetup.noReading')}</div>
      <p className="mt-1 text-[11px] text-content-secondary">{t(`mavlink-config:hardwareSetup.checkHint.${check}`)}</p>
    </div>
  );
}
