/**
 * Motor vibration filter card: four stages (what was found, one hover, pick
 * the flight, before and after). Parameters are only staged; the log comes
 * from the FC list, a .bin on disk or the recent list, read by the main
 * process parser as the Logs view does. The maths is in notch-analysis.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines, FolderOpen, HardDrive, History } from 'lucide-react';
import { useConnectionStore } from '../../stores/connection-store';
import { useLogStore, type LogListEntry, type ParsedLog } from '../../stores/log-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { findFrameLayout, getFrameClassType } from './motor-test/motor-layout-utils';
import {
  batchGyroRuns, cutDb, detectNotchCase, findHoverWindow, messageGyroRun, notchFrequencyWrites, notchSetupWrites, peakBetween, windowSpectrum,
  MIN_HOVER_S, type NotchCase, type NotchWrite,
} from './notch-analysis';
import { Card, SmallButton, useParam, type Tone } from './quick-setup-ui';

type Stage = 0 | 1 | 2 | 3;
type Source = 'fc' | 'file' | 'recent';

interface SavedResult {
  kase: NotchCase;
  peakHz: number;
  cutDb: number | null;
  source: string;
  writes: NotchWrite[];
  /** Decimated spectra for the picture, dB over a shared frequency axis. */
  freqHz: number[];
  before: number[] | null;
  after: number[] | null;
  bwHz: number;
}

interface Saved { stage: Stage; result: SavedResult | null; stagedAt: number | null }

const key = (sysid: number) => `quick-setup.vibration.${sysid}`;
function load(sysid: number): Saved {
  try { const s = localStorage.getItem(key(sysid)); if (s) return JSON.parse(s) as Saved; } catch { /* fresh */ }
  return { stage: 0, result: null, stagedAt: null };
}
function save(sysid: number, s: Saved): void {
  try { localStorage.setItem(key(sysid), JSON.stringify(s)); } catch { /* ignore */ }
}

const PEAK_LOW_HZ = 30;
const PEAK_HIGH_HZ = 500;
const PICTURE_POINTS = 250;
const MAV_TYPE_QUADROTOR = 2;

function isMultirotorOrQuadplane(mavType: number | undefined, has: (n: string) => boolean, get: (n: string) => number): boolean {
  if (mavType === undefined) return false;
  if ([MAV_TYPE_QUADROTOR, 13, 14, 15].includes(mavType)) return true;
  // plane with lift motors
  return has('Q_ENABLE') && get('Q_ENABLE') > 0;
}

/** Spectrum to a short dB array on a common axis for the saved picture. */
function picture(freqHz: Float64Array, amp: Float64Array, maxHz: number): { f: number[]; db: number[] } {
  const f: number[] = []; const db: number[] = [];
  const step = Math.max(1, Math.floor(freqHz.length / PICTURE_POINTS));
  for (let i = 0; i < freqHz.length; i += step) {
    if (freqHz[i]! > maxHz) break;
    let m = 0; for (let j = i; j < Math.min(freqHz.length, i + step); j++) m = Math.max(m, amp[j]!);
    f.push(freqHz[i]!); db.push(20 * Math.log10(m + 1e-9));
  }
  return { f, db };
}

type Analysis = { ok: true; result: SavedResult } | { ok: false; error: 'noHover' | 'noGyro' };

/** Everything the card learns from one parsed flight. */
export function analyseFlight(log: ParsedLog, kase: NotchCase, opts: { gyroFilterHz?: number; perMotor: boolean; source: string }): Analysis {
  const ctun = log.messages.CTUN ?? log.messages.QTUN;
  let window = null as ReturnType<typeof findHoverWindow>;
  if (ctun && ctun.num.ThO) {
    const times = Array.from(ctun.timeUs, (us) => us / 1e6);
    window = findHoverWindow(times, ctun.num.ThO);
  }
  // INS_LOG_BAT_OPT at the time of the flight decides whether the batches are pre or post filter
  let batOpt = 0;
  const parm = log.messages.PARM;
  if (parm && parm.txt.Name && parm.num.Value) {
    for (let i = 0; i < parm.count; i++) if (parm.txt.Name[i] === 'INS_LOG_BAT_OPT') batOpt = parm.num.Value[i]!;
  }
  const batches = batchGyroRuns(log.messages.ISBH, log.messages.ISBD);
  const batchesArePost = (batOpt & 2) !== 0;
  const raw = messageGyroRun(log.messages.GYR);
  const imu = messageGyroRun(log.messages.IMU);
  const beforeRuns = !batchesArePost && batches.length ? batches : raw ? [raw] : [];
  const afterRuns = imu ? [imu] : batchesArePost ? batches : [];
  if (beforeRuns.length === 0 && afterRuns.length === 0) return { ok: false, error: 'noGyro' };
  if (!window) return { ok: false, error: 'noHover' };
  const before = windowSpectrum(beforeRuns, window);
  const after = windowSpectrum(afterRuns, window);
  const base = before ?? after;
  if (!base) return { ok: false, error: 'noHover' };
  const nyquist = base.freqHz[base.freqHz.length - 1]!;
  const low = Math.max(PEAK_LOW_HZ, opts.gyroFilterHz ?? 0);
  const peak = peakBetween(base, low, Math.min(PEAK_HIGH_HZ, nyquist));
  if (!peak) return { ok: false, error: 'noGyro' };
  const writes = notchFrequencyWrites(kase, peak.hz, { gyroFilterHz: opts.gyroFilterHz, perMotor: opts.perMotor, hoverThrottle: window.throttle });
  const bw = writes.find((w) => w.name === 'INS_HNTCH_BW')?.value ?? peak.hz / 2;
  const maxHz = Math.min(PEAK_HIGH_HZ, nyquist);
  const pb = before ? picture(before.freqHz, before.amplitude, maxHz) : null;
  const pa = after ? picture(after.freqHz, after.amplitude, maxHz) : null;
  return {
    ok: true,
    result: {
      kase, peakHz: Math.round(peak.hz), cutDb: before && after ? cutDb(before, after, peak.hz, bw) : null,
      source: opts.source, writes, freqHz: (pb ?? pa)!.f, before: pb?.db ?? null, after: pa && pb && pa.f.length === pb.f.length ? pa.db : pa && !pb ? pa.db : null, bwHz: bw,
    },
  };
}

function Spectrum({ r }: { r: SavedResult }) {
  const { t } = useTranslation();
  const k = 'mavlink-config:quickSetup.vibration.result';
  const W = 1000; const H = 260;
  const maxHz = r.freqHz[r.freqHz.length - 1] ?? 500;
  const all = [...(r.before ?? []), ...(r.after ?? [])];
  const lo = Math.min(...all); const hi = Math.max(...all);
  const X = (hz: number) => (hz / maxHz) * W;
  const Y = (db: number) => H - 10 - ((db - lo) / Math.max(1, hi - lo)) * (H - 30);
  const path = (db: number[]) => db.map((d, i) => `${i ? 'L' : 'M'}${X(r.freqHz[i]!).toFixed(1)} ${Y(d).toFixed(1)}`).join(' ');
  const bands = [1, 2, 3].map((h) => ({ x: X(r.peakHz * h - r.bwHz / 2), w: X(r.bwHz) })).filter((b) => b.x < W);
  const ticks = [0, 100, 200, 300, 400, 500].filter((hz) => hz <= maxHz);
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-surface-inset border border-subtle" preserveAspectRatio="none" style={{ height: 150 }}>
        {bands.map((b, i) => <rect key={i} x={b.x} y={0} width={b.w} height={H} fill="rgb(56,189,248)" fillOpacity={0.12} />)}
        {ticks.map((hz) => <line key={hz} x1={X(hz)} x2={X(hz)} y1={0} y2={H} stroke="var(--border-default)" strokeWidth={1} />)}
        {r.before && <path d={path(r.before)} fill="none" stroke="rgb(248,113,113)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        {r.after && <path d={path(r.after)} fill="none" stroke="rgb(52,211,153)" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
        {ticks.map((hz) => <text key={`t${hz}`} x={X(hz) + 4} y={H - 4} fontSize={18} fill="var(--text-tertiary)">{hz} Hz</text>)}
      </svg>
      <div className="flex flex-wrap gap-4 text-[11px] text-content-secondary">
        {r.before && <span><span className="inline-block w-3 h-0.5 bg-red-400 align-middle mr-1" />{t(`${k}.before`)}</span>}
        {r.after && <span><span className="inline-block w-3 h-0.5 bg-emerald-400 align-middle mr-1" />{t(`${k}.after`)}</span>}
        <span><span className="inline-block w-3 h-2 bg-sky-400/30 align-middle mr-1" />{t(`${k}.band`)}</span>
        <span className="text-content-tertiary">{t(`${k}.axis`)}</span>
      </div>
    </div>
  );
}

function WritesTable({ writes }: { writes: NotchWrite[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg bg-surface-raised/50 p-2.5 space-y-1">
      {writes.map((w) => (
        <div key={w.name} className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-3 text-[11px]">
          <span className="font-mono text-content">{w.name}</span>
          <span className="font-mono tabular-nums text-content">{w.value}</span>
          <span className="text-content-tertiary">{t(`mavlink-config:quickSetup.vibration.why.${w.whyKey}`)}</span>
        </div>
      ))}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VibrationFilterCard() {
  const { t } = useTranslation();
  const k = 'mavlink-config:quickSetup.vibration';
  const p = useParam();
  const parameters = useParameterStore((s) => s.parameters);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const sysid = useConnectionStore((s) => s.connectionState.systemId ?? 1);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const esc = useTelemetryStore((s) => s.escTelemetry);
  const lastEsc = useTelemetryStore((s) => s.lastEscTelemetry);
  const go = useNavigationStore((s) => s.setView);

  const [saved, setSaved] = useState<Saved>(() => load(sysid));
  useEffect(() => { setSaved(load(sysid)); }, [sysid]);
  const update = (patch: Partial<Saved>) => setSaved((s) => { const n = { ...s, ...patch }; save(sysid, n); return n; });

  const motorCount = useMemo(() => {
    const ct = getFrameClassType((n) => parameters.get(n)?.value);
    const layout = ct ? findFrameLayout(ct.frameClass, ct.frameType) : null;
    return layout ? layout.motors.filter((m) => !(layout.ClassName === 'TRI' && m.Roll === 0 && m.Pitch === 0)).length : 4;
  }, [parameters]);
  const escFresh = esc && Date.now() - lastEsc < 10_000 ? esc : null;
  const escMotors = escFresh ? escFresh.motors.filter((m) => m !== undefined).length : 0;
  const bdshot = (p.maybe('SERVO_BLH_BDMASK') ?? 0) !== 0;
  const kase = detectNotchCase({ has: p.has, get: p.maybe, escMotors });
  const perMotor = kase === 'esc' && (escMotors >= motorCount || bdshot);

  const enabled = p.get('INS_HNTCH_ENABLE') === 1;
  const hasMode = p.has('INS_HNTCH_MODE');
  const setupWrites = notchSetupWrites(kase, { has: p.has, get: p.maybe, perMotor });
  const setupStaged = setupWrites.every((w) => p.maybe(w.name) === w.value);

  const [stage, setStage] = useState<Stage>(saved.stage);
  useEffect(() => { setStage(saved.stage); }, [saved.stage]);
  const [source, setSource] = useState<Source>('fc');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Array<{ path: string; name: string; size: number; openedAt: number }>>([]);
  const availableLogs = useLogStore((s) => s.availableLogs);
  const isListLoading = useLogStore((s) => s.isListLoading);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (stage !== 2) return;
    window.electronAPI.logRecentGet().then(setRecent);
  }, [stage]);

  if (!isMultirotorOrQuadplane(mavType, p.has, p.get) || !p.has('INS_HNTCH_ENABLE')) return null;

  const stageSetup = () => {
    for (const w of setupWrites) p.set(w.name, w.value);
    update({ stagedAt: Date.now(), stage: hasMode ? 1 : 0 });
  };
  const stageWrites = (writes: NotchWrite[]) => { for (const w of writes) p.set(w.name, w.value); };

  const liveRpm = escFresh
    ? escFresh.motors.filter((m): m is NonNullable<typeof m> => !!m && m.rpm > 0).reduce((acc, m, _i, arr) => acc + m.rpm / arr.length, 0)
    : 0;
  const useLiveHover = () => {
    const hz = liveRpm / 60;
    const writes = notchFrequencyWrites(kase, hz, { gyroFilterHz: p.maybe('INS_GYRO_FILTER'), perMotor });
    const bw = writes.find((w) => w.name === 'INS_HNTCH_BW')?.value ?? hz / 2;
    update({ stage: 3, result: { kase, peakHz: Math.round(hz), cutDb: null, source: 'live', writes, freqHz: [], before: null, after: null, bwHz: bw } });
  };

  const analysePath = async (path: string, name: string) => {
    setError(null);
    setBusy(t(`${k}.pick.parsing`, { name, pct: 0 }));
    const off = window.electronAPI.onLogParseProgress((pr) => {
      setBusy(t(`${k}.pick.parsing`, { name, pct: pr.totalBytes > 0 ? Math.round((pr.bytesConsumed / pr.totalBytes) * 100) : 0 }));
    });
    try {
      const res = await window.electronAPI.logParseFile(path) as { log: ParsedLog };
      useLogStore.getState().setCurrentLog(res.log, path);
      const a = analyseFlight(res.log, kase, { gyroFilterHz: p.maybe('INS_GYRO_FILTER'), perMotor, source: name });
      if (!a.ok) { setError(t(`${k}.pick.${a.error}`, { s: MIN_HOVER_S })); return; }
      update({ stage: 3, result: a.result });
    } catch (e) {
      setError(t(`${k}.pick.failed`, { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      off();
      setBusy(null);
    }
  };

  const listLogs = async () => {
    useLogStore.getState().setIsListLoading(true);
    try { useLogStore.getState().setAvailableLogs(await window.electronAPI.logListRequest() as LogListEntry[]); }
    finally { useLogStore.getState().setIsListLoading(false); }
  };

  const analyseFcLog = async (log: LogListEntry) => {
    setError(null);
    cancelRef.current = false;
    setBusy(t(`${k}.pick.downloading`, { id: log.id, pct: 0 }));
    const off = window.electronAPI.onLogDownloadProgress((pr) => {
      if (pr.logId !== log.id) return;
      setBusy(t(`${k}.pick.downloading`, { id: log.id, pct: pr.total > 0 ? Math.round((pr.received / pr.total) * 100) : 0 }));
    });
    useLogStore.getState().setDownloadingLogId(log.id);
    try {
      const path = await window.electronAPI.logDownload(log.id, log.size, log.timeUtc);
      useLogStore.getState().setDownloadingLogId(null);
      if (!path || cancelRef.current) { setBusy(null); return; }
      const name = path.split(/[\\/]/).pop() ?? `log_${log.id}.bin`;
      await window.electronAPI.logRecentAdd({ path, name, size: log.size });
      await analysePath(path, name);
    } finally { off(); }
  };

  const cancel = () => { cancelRef.current = true; window.electronAPI.logDownloadCancel(); useLogStore.getState().setDownloadingLogId(null); setBusy(null); };
  const openFile = async () => {
    const picked = await window.electronAPI.logOpenDialog();
    if (!picked) return;
    await analysePath(picked.path, picked.path.split(/[\\/]/).pop() ?? picked.path);
  };

  const result = saved.result;
  const tone: Tone = !enabled && !setupStaged ? 'off' : !hasMode ? 'warn' : result ? 'ok' : 'warn';
  const statusText = busy ? t(`${k}.status.analysing`)
    : !enabled && !setupStaged ? t(`${k}.status.off`)
    : !hasMode ? t(`${k}.status.needsReboot`)
    : result ? t(`${k}.status.done`)
    : setupStaged && !enabled ? t(`${k}.status.staged`)
    : t(`${k}.status.needsFlight`);

  const stages = [t(`${k}.stages.found`), t(`${k}.stages.fly`), t(`${k}.stages.pick`), t(`${k}.stages.result`)];
  const caseKey = kase === 'esc' && escMotors === 0 ? 'escMask' : kase;
  const how = t(`${k}.how.${kase}`, { returnObjects: true }) as string[];
  const goStage = (s: Stage) => { setStage(s); update({ stage: s }); };

  return (
    <Card
      id="quick-setup-vibration"
      icon={<AudioLines className="w-5 h-5 text-fuchsia-500 dark:text-fuchsia-400" />}
      iconTone="bg-fuchsia-500/15"
      title={t(`${k}.title`)}
      hint={t(`${k}.hint`)}
      status={tone}
      statusText={statusText}
    >
      <div className="flex flex-wrap gap-1.5">
        {stages.map((label, i) => (
          <button key={label} type="button" onClick={() => goStage(i as Stage)} aria-current={i === stage}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${i === stage ? 'border-sky-500/60 bg-sky-500/15 text-content' : 'border-subtle text-content-secondary hover:text-content'}`}>
            <span className={`inline-block h-4 w-4 rounded-full text-center text-[10px] leading-4 ${i < stage ? 'bg-emerald-500 text-emerald-950' : i === stage ? 'bg-sky-400 text-sky-950' : 'bg-surface-inset text-content-secondary'}`}>{i < stage ? '✓' : i + 1}</span>
            {label}
          </button>
        ))}
      </div>

      {stage === 0 && (
        <div className="space-y-3">
          <div className={`rounded-lg border p-3 ${kase === 'thr' ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`}>
            <div className="text-sm font-medium text-content">{t(`${k}.case.${caseKey}.title`)}</div>
            <p className="mt-1 text-xs text-content-secondary">{t(`${k}.case.${caseKey}.body`, { n: escMotors, total: motorCount })}</p>
            {kase === 'esc' && escMotors > 0 && escMotors < motorCount && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{t(`${k}.escCount`, { n: escMotors, total: motorCount })}</p>}
          </div>
          <div>
            <div className="text-xs text-content-secondary mb-1">{t(`${k}.howTitle`)}</div>
            <ol className="space-y-1">
              {how.map((text, i) => (
                <li key={text} className="flex items-start gap-2 text-xs text-content">
                  <span className="inline-block h-4 w-4 shrink-0 rounded-full bg-surface-inset text-center text-[10px] leading-4 text-content-secondary">{i + 1}</span>
                  {text}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="text-content-secondary">{t(`${k}.writesNow`)}</span>
              <span className="text-[11px] text-content-tertiary">{t(`${k}.review`)}</span>
            </div>
            <WritesTable writes={setupWrites} />
            <p className="mt-1 text-[11px] text-content-tertiary">{hasMode ? t(`${k}.later.${kase}`) : t(`${k}.rebootHint`)}</p>
            {hasMode && <p className="text-[11px] text-content-tertiary">{t(`${k}.harmonics`)}</p>}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-content-tertiary">{setupStaged ? t(`${k}.staged`) : ''}</span>
            <SmallButton primary onClick={stageSetup}>{setupStaged ? (hasMode ? t(`${k}.stages.fly`) : t(`${k}.restage`)) : t(`${k}.stage`)}</SmallButton>
          </div>
        </div>
      )}

      {stage === 1 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-content">{t(`${k}.hover.title`)}</div>
          <p className="text-xs text-content-secondary">{t(`${k}.hover.body`)}</p>
          <ol className="space-y-1">
            {[t(`${k}.hover.step1`), t(`${k}.hover.step2`), t(`${k}.hover.step3`), kase === 'esc' ? t(`${k}.hover.step4esc`) : t(`${k}.hover.step4log`)].map((text, i) => (
              <li key={text} className="flex items-start gap-2 text-xs text-content">
                <span className="inline-block h-4 w-4 shrink-0 rounded-full bg-surface-inset text-center text-[10px] leading-4 text-content-secondary">{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
          {kase === 'esc' && (
            <div className="rounded-lg bg-surface-raised/50 p-3">
              <div className="text-[11px] text-content-secondary">{t(`${k}.hover.liveEsc`)}</div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-semibold tabular-nums ${liveRpm > 0 ? 'text-sky-500 dark:text-sky-300' : 'text-content'}`}>{liveRpm > 0 ? (liveRpm / 60).toFixed(0) : '-'}</span>
                <span className="text-xs text-content-secondary">Hz</span>
              </div>
              <p className="text-[11px] text-content-tertiary">{liveRpm > 0 ? t(`${k}.hover.liveEscBody`, { rpm: Math.round(liveRpm), n: escMotors }) : t(`${k}.hover.liveNone`)}</p>
              <div className="mt-2"><SmallButton primary disabled={liveRpm <= 0} onClick={useLiveHover}>{t(`${k}.hover.useLive`)}</SmallButton></div>
            </div>
          )}
          <div className="flex justify-end"><SmallButton onClick={() => goStage(2)}>{t(`${k}.hover.pickLog`)}</SmallButton></div>
        </div>
      )}

      {stage === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['fc', HardDrive, t(`${k}.pick.fc`), t(`${k}.pick.fcHint`)],
              ['file', FolderOpen, t(`${k}.pick.file`), t(`${k}.pick.fileHint`)],
              ['recent', History, t(`${k}.pick.recent`), t(`${k}.pick.recentHint`, { count: recent.length })],
            ] as const).map(([id, Icon, label, hint]) => (
              <button key={id} type="button" onClick={() => setSource(id)} aria-pressed={source === id}
                className={`rounded-lg border p-2 text-left ${source === id ? 'border-sky-500/60 bg-sky-500/10' : 'border-subtle hover:bg-surface-raised'}`}>
                <Icon className={`h-4 w-4 ${source === id ? 'text-sky-500' : 'text-content-tertiary'}`} />
                <div className="mt-1 text-xs text-content">{label}</div>
                <div className="text-[10px] text-content-tertiary">{hint}</div>
              </button>
            ))}
          </div>
          {busy ? (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised/50 p-3 text-xs text-content">
              <span>{busy}</span>
              <SmallButton onClick={cancel}>{t(`${k}.pick.cancel`)}</SmallButton>
            </div>
          ) : source === 'fc' ? (
            <div className="space-y-2">
              {!isConnected ? <p className="text-xs text-content-secondary">{t(`${k}.pick.notConnected`)}</p> : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-content-tertiary">{t(`${k}.pick.slowHint`)}</span>
                    <SmallButton onClick={listLogs} disabled={isListLoading}>{t(`${k}.pick.refresh`)}</SmallButton>
                  </div>
                  {availableLogs.length === 0 ? <p className="text-xs text-content-secondary">{t(`${k}.pick.noLogs`)}</p> : (
                    <ul className="max-h-48 overflow-y-auto divide-y divide-subtle rounded-lg border border-subtle">
                      {[...availableLogs].sort((a, b) => (b.timeUtc - a.timeUtc) || (b.id - a.id)).slice(0, 12).map((log) => (
                        <li key={log.id} className="flex items-center gap-3 px-2.5 py-1.5 text-xs">
                          <span className="font-mono text-content-secondary">#{log.id}</span>
                          <span className="flex-1 text-content">{log.timeUtc ? new Date(log.timeUtc * 1000).toLocaleString() : ''}</span>
                          <span className="text-content-tertiary">{formatBytes(log.size)}</span>
                          <button type="button" onClick={() => analyseFcLog(log)} className="text-sky-700 hover:underline dark:text-sky-300">{t(`${k}.pick.use`)}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ) : source === 'file' ? (
            <SmallButton onClick={openFile}>{t(`${k}.pick.choose`)}</SmallButton>
          ) : (
            <ul className="max-h-48 overflow-y-auto divide-y divide-subtle rounded-lg border border-subtle">
              {[...recent].sort((a, b) => b.openedAt - a.openedAt).map((r) => (
                <li key={r.path} className="flex items-center gap-3 px-2.5 py-1.5 text-xs">
                  <span className="flex-1 truncate text-content">{r.name}</span>
                  <span className="text-content-tertiary">{formatBytes(r.size)}</span>
                  <button type="button" onClick={() => analysePath(r.path, r.name)} className="text-sky-700 hover:underline dark:text-sky-300">{t(`${k}.pick.use`)}</button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}

      {stage === 3 && result && (
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-content">{result.cutDb !== null ? t(`${k}.result.title`, { db: result.cutDb.toFixed(0) }) : t(`${k}.result.titleNoAfter`, { hz: result.peakHz })}</div>
            <p className="text-xs text-content-secondary">{t(`${k}.result.body`, { hz: result.peakHz, source: result.source === 'live' ? t(`${k}.result.sourceLive`) : t(`${k}.result.sourceLog`, { name: result.source }) })}</p>
          </div>
          {result.freqHz.length > 0 && <Spectrum r={result} />}
          {result.before && !result.after && <p className="text-[11px] text-content-tertiary">{t(`${k}.result.onlyBefore`)}</p>}
          {result.writes.length > 0 && (
            <div>
              <div className="text-xs text-content-secondary mb-1">{t(`${k}.result.writes`)}</div>
              <WritesTable writes={result.writes} />
            </div>
          )}
          {result.freqHz.length > 0 && <p className="text-[11px] text-content-tertiary">{t(`${k}.result.verdict`)}</p>}
          <p className="text-[11px] text-content-tertiary">{t(`${k}.result.next`)}</p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-3">
              <button type="button" onClick={() => go('logs')} className="text-xs text-content-secondary hover:text-content">{t('mavlink-config:quickSetup.vibration.stages.result')} · Logs</button>
              <button type="button" onClick={() => update({ stage: 0, result: null, stagedAt: null })} className="text-xs text-content-secondary hover:text-content">{t(`${k}.result.again`)}</button>
            </div>
            <SmallButton primary disabled={result.writes.every((w) => p.maybe(w.name) === w.value)} onClick={() => stageWrites(result.writes)}>
              {result.writes.every((w) => p.maybe(w.name) === w.value) ? t(`${k}.staged`) : t(`${k}.stage`)}
            </SmallButton>
          </div>
        </div>
      )}
      {stage === 3 && !result && <p className="text-xs text-content-secondary">{t(`${k}.status.needsFlight`)}</p>}
    </Card>
  );
}
