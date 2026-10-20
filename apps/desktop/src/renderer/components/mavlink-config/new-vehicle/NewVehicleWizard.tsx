import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, RotateCcw, X } from 'lucide-react';
import type { ParamReader, SetupStepId, SetupStepState, SetupVehicle } from '../../../../shared/vehicle-setup/types';
import { answersFromBoard, computeSetupStatus, detectSetupVehicle, planSteps } from '../../../../shared/vehicle-setup/plans';
import { needsRestart } from '../../../../shared/vehicle-setup/choices';
import { cellsFromVoltage, splitWrites, stepWrites } from '../../../../shared/vehicle-setup/writes';
import { useVehicleSetupStore } from '../../../stores/vehicle-setup-store';
import { useParameterStore } from '../../../stores/parameter-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useMessagesStore } from '../../../stores/messages-store';
import { proposeParameterChanges } from '../../../lib/param-proposal';
import { currentPrearmFailures } from '../prearm-status';
import { BoardOrientationCard } from '../BoardOrientationCard';
import { CompassCard } from '../CompassCard';
import FlightModesTab from '../FlightModesTab';
import { MotorTestTab } from '../motor-test/MotorTestTab';
import { ElrsCard } from '../QuickSetupTab';
import {
  BatteryStep, CheckStep, ChoiceStep, FrameStep, Note, OutputsStep, PlaneSizeStep, ReadyStep, ReceiverLive, SizeStep, SubModesInfo, type StepProps,
} from './wizard-steps';

const K = 'vehicle-setup:wizard';
const RECONNECT_TIMEOUT_MS = 60_000;

async function waitFor(test: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (test()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return test();
}

function readNow(): ParamReader {
  const params = useParameterStore.getState().parameters;
  return (n) => params.get(n)?.value;
}

export function NewVehicleWizardHost() {
  const open = useVehicleSetupStore((s) => s.open);
  return open ? <NewVehicleWizard /> : null;
}

function stepTitle(id: SetupStepId, vehicle: SetupVehicle, tail: boolean): string {
  if (id === 'frame' && vehicle === 'heli') return 'frameHeli';
  if (id === 'airframe' && vehicle === 'vtol') return tail ? 'wingTailsitter' : 'wingTail';
  if (id === 'drivetest' && vehicle === 'boat') return 'drivetestBoat';
  return id;
}

function NewVehicleWizard() {
  const { t } = useTranslation();
  const store = useVehicleSetupStore();
  const parameters = useParameterStore((s) => s.parameters);
  const read = useMemo<ParamReader>(() => (n) => parameters.get(n)?.value, [parameters]);
  const conn = useConnectionStore((s) => s.connectionState);
  const voltage = useTelemetryStore((s) => s.battery?.voltage ?? 0);
  const rcCount = useTelemetryStore((s) => s.rcChannels?.chancount ?? 0);
  const messages = useMessagesStore((s) => s.messages);
  const vehicle = detectSetupVehicle(conn.mavType, read);
  const firmware = conn.firmwareVersion ?? conn.autopilot ?? '';

  const { bindVehicle } = store;
  useEffect(() => { if (vehicle) bindVehicle(`${conn.systemId ?? 0}:${vehicle}`); }, [bindVehicle, conn.systemId, vehicle]);

  const answers = useMemo(() => {
    if (!vehicle) return store.answers;
    const a = answersFromBoard(vehicle, read, store.answers);
    if (a.cells === undefined) a.cells = cellsFromVoltage(voltage) ?? undefined;
    if (a.capacity === undefined && (read('BATT_CAPACITY') ?? 0) > 0) a.capacity = read('BATT_CAPACITY');
    return a;
  }, [vehicle, read, store.answers, voltage]);
  const prearm = useMemo(() => currentPrearmFailures(messages).map((f) => f.text), [messages]);
  const plan = useMemo(() => (vehicle ? planSteps(vehicle, answers, read) : []), [vehicle, answers, read]);
  const status = useMemo(
    () => computeSetupStatus({ mavType: conn.mavType, firmware, read, prearm, answers, done: store.done, rcReceiving: rcCount > 0 }),
    [conn.mavType, firmware, read, prearm, answers, store.done, rcCount],
  );
  const step: SetupStepId | undefined = store.step && plan.includes(store.step) ? store.step : plan[0];
  const index = step ? plan.indexOf(step) : -1;

  const [busy, setBusy] = useState<null | 'writing' | 'restarting'>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [restart, setRestart] = useState<{ later: string[] } | null>(null);
  // edits the reused cards staged since this step opened, so they go through the same review
  const stagedAtEntry = useRef<Set<string>>(new Set());
  useEffect(() => {
    stagedAtEntry.current = new Set(useParameterStore.getState().modifiedParameters().map((p) => p.id));
    setFailure(null);
    setRestart(null);
  }, [step]);

  const close = store.close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, close]);

  const advance = useCallback(() => {
    const nextStep = plan[index + 1];
    if (nextStep) store.goTo(nextStep);
  }, [plan, index, store]);

  /** Reviews and writes: the step's own changes plus anything a reused card staged. Returns false when the pilot cancelled. */
  const writeStep = async (id: SetupStepId): Promise<{ ok: boolean; later: string[]; wrote: { name: string; value: number }[] }> => {
    if (!vehicle) return { ok: false, later: [], wrote: [] };
    const pStore = useParameterStore.getState();
    const staged = pStore.modifiedParameters().filter((p) => !stagedAtEntry.current.has(p.id));
    const stagedChanges = staged.map((p) => ({ name: p.id, value: p.value }));
    staged.forEach((p) => pStore.revertParameter(p.id));
    const { now, later } = splitWrites([...stagedChanges, ...stepWrites(id, vehicle, answers, readNow())], readNow());
    if (now.length === 0) return { ok: true, later, wrote: [] };
    const stepName = t(`vehicle-setup:steps.${id}.name`);
    const outcome = await proposeParameterChanges(
      now.map((c) => ({ ...c, reason: (c as { reason?: string }).reason ?? t(`${K}.reason`, { step: stepName }) })),
      undefined,
      { allowTopology: true },
    );
    if (!outcome.ok) {
      staged.forEach((p) => void useParameterStore.getState().setParameter(p.id, p.value));
      setFailure(outcome.reason === 'user cancelled' ? t(`${K}.cancelled`) : (outcome.reason ?? t(`${K}.writeFailed`)));
      return { ok: false, later, wrote: now };
    }
    return { ok: true, later, wrote: now };
  };

  const next = async () => {
    if (!step) return;
    if (step === 'ready') { close(); return; }
    setBusy('writing');
    setFailure(null);
    try {
      const r = await writeStep(step);
      if (!r.ok) return;
      store.markDone(step);
      if (r.later.length > 0 || needsRestart(step, r.wrote)) { setRestart({ later: r.later }); return; }
      advance();
    } finally {
      setBusy(null);
    }
  };

  /** New frame or device types only take effect, and grow their parameters, after a restart. */
  const restartAndContinue = async () => {
    if (!step) return;
    setBusy('restarting');
    setFailure(null);
    try {
      const ok = await window.electronAPI.mavlinkReboot().catch(() => false);
      if (!ok) { setFailure(t(`${K}.restartFailed`)); return; }
      await waitFor(() => !useConnectionStore.getState().connectionState.isConnected, 15_000);
      const back = await waitFor(() => useConnectionStore.getState().connectionState.isConnected, RECONNECT_TIMEOUT_MS);
      if (!back) { setFailure(t(`${K}.notBack`)); return; }
      await new Promise((r) => setTimeout(r, 1500));
      await useParameterStore.getState().fetchParameters({ force: true });
      setBusy('writing');
      const r = await writeStep(step);
      if (!r.ok) return;
      if (r.later.length > 0) { setRestart({ later: r.later }); setFailure(t(`${K}.stillMissing`, { params: r.later.join(', ') })); return; }
      setRestart(null);
      advance();
    } finally {
      setBusy(null);
    }
  };

  if (!vehicle || !step || !status) {
    return (
      <Overlay onClose={close} busy={false}>
        <div className="p-8 text-center text-sm text-content-secondary">{t(`${K}.noVehicle`)}</div>
      </Overlay>
    );
  }

  const tail = vehicle === 'vtol' && answers.vtolType === 'tail';
  const titleKey = stepTitle(step, vehicle, tail);
  const setAnswers = (a: typeof answers) => store.answer(a);
  const props: StepProps = { step, vehicle, answers, setAnswers, read };
  const stateOf = (id: SetupStepId): SetupStepState => status.steps.find((s) => s.id === id)?.state ?? 'todo';
  const doneCount = status.steps.filter((s) => s.state === 'done' || s.state === 'found').length;
  const last = index === plan.length - 1;

  return (
    <Overlay onClose={close} busy={!!busy}>
      <aside className="flex w-64 shrink-0 flex-col border-r border-subtle bg-surface-raised">
        <div className="border-b border-subtle p-4">
          <div className="text-sm font-semibold text-content">{t(`${K}.title`)}</div>
          <div className="mt-0.5 text-xs text-content-secondary">{t(`vehicle-setup:vehicle.${vehicle}`)}{firmware ? ` · ${firmware}` : ''}</div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-inset">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((doneCount / plan.length) * 100)}%` }} />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {plan.map((id, i) => {
            const st = stateOf(id);
            const cur = id === step;
            return (
              <button
                key={id}
                type="button"
                onClick={() => !busy && store.goTo(id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${cur ? 'bg-blue-500/10 text-content' : 'text-content-secondary hover:bg-surface hover:text-content'}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  st === 'done' ? 'bg-emerald-500 text-white' : cur ? 'bg-blue-500 text-white' : 'border border-subtle bg-surface text-content-secondary'}`}
                >
                  {st === 'done' ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{t(`vehicle-setup:steps.${id === 'airframe' && vehicle === 'vtol' ? 'wingTail' : id === 'frame' && vehicle === 'heli' ? 'frameHeli' : id}.name`)}</span>
                {st === 'found' && <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{t(`${K}.state.found`)}</span>}
                {st === 'needs-pilot' && <span className="text-[10px] text-amber-600 dark:text-amber-400">{t(`${K}.state.needsPilot`)}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start gap-3 border-b border-subtle p-5">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wide text-content-tertiary">{t(`${K}.stepOf`, { n: index + 1, total: plan.length })}</div>
            <h2 className="text-lg font-semibold text-content">{t(`vehicle-setup:steps.${titleKey}.title`)}</h2>
            <p className="text-sm text-content-secondary">{t(`vehicle-setup:steps.${titleKey}.why`)}</p>
          </div>
          <button type="button" onClick={close} disabled={!!busy} aria-label={t('common:close')} className="text-content-secondary hover:text-content disabled:opacity-30">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {status.steps.find((s) => s.id === step)?.blockers.filter(() => step !== 'ready').map((b) => (
            <Note key={b} warn>{t(`${K}.blocker`, { text: b })}</Note>
          ))}
          <StepBody {...props} plan={plan} prearm={prearm} onGo={(s) => store.goTo(s)} />
          {failure && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">{failure}</div>}
          {restart && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <RotateCcw className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1 text-xs text-content">
                {restart.later.length > 0 ? t(`${K}.restartFor`, { params: restart.later.join(', ') }) : t(`${K}.restartNeeded`)}
              </div>
              <button type="button" onClick={() => void restartAndContinue()} disabled={!!busy} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50">
                {t(`${K}.restartNow`)}
              </button>
              <button type="button" onClick={() => { setRestart(null); advance(); }} disabled={!!busy} className="text-xs text-content-secondary hover:text-content">
                {t(`${K}.later`)}
              </button>
            </div>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-subtle p-4">
          <button type="button" onClick={() => index > 0 && store.goTo(plan[index - 1]!)} disabled={index === 0 || !!busy} className="rounded-md border border-subtle px-3 py-1.5 text-sm text-content-secondary hover:text-content disabled:opacity-40">
            {t(`${K}.back`)}
          </button>
          {step === 'size' && (
            <button type="button" onClick={() => { store.markDone('size'); advance(); }} disabled={!!busy} className="text-xs text-content-secondary hover:text-content">
              {t(`${K}.size.skip`)}
            </button>
          )}
          <div className="flex-1 text-right text-xs text-content-tertiary">{busy === 'restarting' ? t(`${K}.restarting`) : busy ? t(`${K}.reviewing`) : t(`${K}.reviewNote`)}</div>
          <button type="button" onClick={() => void next()} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {last ? t(`${K}.finish`) : t(`${K}.next`)}
          </button>
        </footer>
      </section>
    </Overlay>
  );
}

function Overlay({ children, onClose, busy }: { children: React.ReactNode; onClose: () => void; busy: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="mx-4 flex h-[88vh] w-full max-w-6xl overflow-hidden rounded-xl border border-subtle bg-surface-solid shadow-2xl">{children}</div>
    </div>
  );
}

function StepBody(p: StepProps & { plan: SetupStepId[]; prearm: string[]; onGo: (s: SetupStepId) => void }) {
  const category = p.vehicle === 'plane' || p.vehicle === 'vtol' ? 'plane' : p.vehicle === 'rover' || p.vehicle === 'boat' ? 'rover' : 'copter';
  switch (p.step) {
    case 'size': return <SizeStep {...p} />;
    case 'frame':
    case 'vframe': return <FrameStep {...p} />;
    case 'psize': return <PlaneSizeStep {...p} />;
    case 'outputs': return <OutputsStep {...p} />;
    case 'orient': return <BoardOrientationCard />;
    case 'compass': return <CompassCard />;
    case 'radio': return <div className="space-y-4"><ReceiverLive /><ElrsCard highlight={false} /></div>;
    case 'modes': return p.vehicle === 'sub' ? <SubModesInfo /> : <FlightModesTab vehicleCategory={category} />;
    case 'motors': return <MotorTestTab isPlane={p.vehicle === 'vtol'} />;
    case 'battery': return <BatteryStep {...p} />;
    case 'ready': return <ReadyStep vehicle={p.vehicle} plan={p.plan} prearm={p.prearm} onGo={p.onGo} />;
    case 'surfaces':
    case 'thrcheck':
    case 'drivetest': return <CheckStep {...p} />;
    case 'thrusters':
    case 'water': return <div className="space-y-4"><ChoiceStep {...p} /><CheckStep {...p} /></div>;
    default: return <ChoiceStep {...p} />;
  }
}
