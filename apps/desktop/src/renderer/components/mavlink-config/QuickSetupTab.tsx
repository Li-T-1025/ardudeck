import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Database, Lightbulb, Mountain, Radar, Radio, Rocket, Satellite, Send, Waves, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { mavlinkLinks, paramLookup, RATE_GROUPS, rateGroupLabel, rateParamName, serialPortLabel } from '../../../shared/mavlink-channels';
import { boardPortLabel, boardPortRegistry } from '../../modules/module-extension-registries';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useTerrainStatusStore } from '../../stores/terrain-status-store';
import { useTileSourceStore } from '../../stores/tile-source-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import { LOCUS_SLUG } from '../mission/locus-terrain';
import { SONAR_PARAMS, sonarSetupState } from '../radio-hud/sonar-setup';
import { SonarSetupCard } from '../radio-hud/SonarSetupCard';
import { useNavigationStore } from '../../stores/navigation-store';
import { getVehicleClass } from '../../../shared/telemetry-types';
import { buildRecommendations } from './quick-setup-recommendations';
import { useMessagesStore } from '../../stores/messages-store';
import { currentPrearmFailures } from './prearm-status';
import { hasNewVehicleWizard, openNewVehicleWizard, type WizardEntry } from './new-vehicle-wizard-entry';
import { GpsCompassCard, RangefinderCard, TelemetryRadioCard } from './quick-setup-hardware-cards';
import { HardwareSetupWizard } from './hardware-setup/HardwareSetupWizard';
import { VibrationFilterCard } from './VibrationFilterCard';
import { Card, Chips, EnumChips, Toggle, TONE_DOT, TONE_TEXT, useParam, type Tone } from './quick-setup-ui';
import { ReturnHomeCard } from './ReturnHomeCard';

function isPlaneType(mavType: number | undefined): boolean {
  return mavType === 1 || (mavType !== undefined && mavType >= 19 && mavType <= 25);
}

/** Chips for every bit a bitmask parameter has, named by the firmware's own metadata. */
function BitChips({ name, label }: { name: string; label: string }) {
  const p = useParam();
  const bits = p.meta(name)?.bitmask;
  if (!bits) return null;
  const value = p.get(name);
  return (
    <div>
      <div className="text-xs text-content-secondary mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(bits).map(([bit, text]) => {
          const mask = 1 << Number(bit);
          const on = (value & mask) !== 0;
          return (
            <button
              key={bit}
              type="button"
              aria-pressed={on}
              onClick={() => p.set(name, on ? value & ~mask : value | mask)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${on ? 'border-emerald-500/60 bg-emerald-500/15 text-content' : 'border-subtle text-content-secondary hover:text-content'}`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FlowNode({ icon, label, detail, tone }: { icon: ReactNode; label: string; detail: string; tone: Tone }) {
  return (
    <div className={`min-w-0 flex-1 rounded-lg border px-2.5 py-2 ${tone === 'off' ? 'border-subtle bg-surface-raised/40' : tone === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10' : tone === 'warn' ? 'border-amber-500/40 bg-amber-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-content">
        <span className={TONE_TEXT[tone]}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 truncate text-[10px] text-content-tertiary">{detail}</div>
    </div>
  );
}

function TerrainCard({ plane, onGoTo }: { plane: boolean; onGoTo: (tab: string) => void }) {
  const { t } = useTranslation();
  const p = useParam();
  const k = 'mavlink-config:quickSetup.terrain';
  const sysid = useConnectionStore((s) => s.connectionState.systemId ?? 1);
  const serve = useSettingsStore((s) => s.serveTerrain);
  const setServe = useSettingsStore((s) => s.setServeTerrain);
  const uplink = useTerrainStatusStore((s) => s.uplink[sysid]);
  const report = useTerrainStatusStore((s) => s.bySysid[sysid]);
  const range = useTelemetryStore((s) => s.rangefinder);
  const locus = useTileSourceStore((s) => s.entries.find((e) => e.slug === LOCUS_SLUG && e.kind === 'dem'));
  if (!p.has('TERRAIN_ENABLE')) return null;

  const enabled = p.get('TERRAIN_ENABLE') === 1;
  const spacing = p.get('TERRAIN_SPACING', 100);
  const hasRangefinder = p.has('RNGFND1_TYPE') && p.get('RNGFND1_TYPE') > 0;
  const tone: Tone = !enabled ? 'off' : report && report.pending > 0 ? 'warn' : 'ok';
  const statusText = !enabled ? t(`${k}.statusOff`)
    : report ? t(`${k}.statusLoaded`, { loaded: report.loaded, pending: report.pending })
    : t(`${k}.statusOn`);

  return (
    <Card
      icon={<Mountain className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />}
      iconTone="bg-emerald-500/15"
      title={t(`${k}.title`)}
      hint={t(`${k}.hint`)}
      status={tone}
      statusText={statusText}
    >
      <div>
        <div className="text-xs text-content-secondary mb-1.5">{t(`${k}.flow`)}</div>
        <div className="flex items-stretch gap-1">
          <FlowNode icon={<Satellite className="h-3.5 w-3.5" />} label={locus ? t(`${k}.srcLocus`) : t(`${k}.srcMap`)} detail={locus ? locus.name : t(`${k}.srcMapDetail`)} tone={locus ? 'ok' : 'warn'} />
          <ArrowRight className="h-4 w-4 shrink-0 self-center text-content-tertiary" />
          <FlowNode icon={<Send className="h-3.5 w-3.5" />} label={t(`${k}.uplink`)} detail={serve ? t(`${k}.uplinkCounts`, { served: uplink?.served ?? 0, missing: uplink?.missing ?? 0 }) : t(`${k}.uplinkOff`)} tone={serve ? (uplink && uplink.missing > 0 ? 'warn' : 'ok') : 'off'} />
          <ArrowRight className="h-4 w-4 shrink-0 self-center text-content-tertiary" />
          <FlowNode icon={<Database className="h-3.5 w-3.5" />} label={t(`${k}.database`)} detail={enabled ? t(`${k}.grid`, { m: spacing }) : t(`${k}.databaseOff`)} tone={enabled ? 'ok' : 'off'} />
          <ArrowRight className="h-4 w-4 shrink-0 self-center text-content-tertiary" />
          <FlowNode icon={<Radar className="h-3.5 w-3.5" />} label={t(`${k}.rangefinder`)} detail={hasRangefinder ? (range ? t(`${k}.rangeNow`, { m: range.distance.toFixed(1) }) : t(`${k}.rangeSet`)) : t(`${k}.rangeNone`)} tone={hasRangefinder ? 'ok' : 'off'} />
        </div>
        {locus && <p className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">{t(`${k}.locusLine`, { name: locus.name })}</p>}
      </div>

      <Toggle on={serve} onChange={setServe} label={t(`${k}.serve`)} hint={t(`${k}.serveHint`)} />
      <Toggle on={enabled} onChange={(on) => p.set('TERRAIN_ENABLE', on ? 1 : 0)} label={t(`${k}.enable`)} hint={t(`${k}.enableHint`)} />

      {enabled && p.has('TERRAIN_SPACING') && (
        <div className="space-y-1">
          <Chips
            label={t(`${k}.spacing`)}
            value={spacing}
            onChange={(v) => p.set('TERRAIN_SPACING', v)}
            options={[100, 60, 30].map((m) => ({ value: m, label: t(`${k}.spacingM`, { m }) }))}
          />
          <p className="text-[11px] text-content-tertiary">{locus ? t(`${k}.spacingLocus`) : t(`${k}.spacingHint`)}</p>
        </div>
      )}

      {plane && <BitChips name="TERRAIN_FOLLOW" label={t(`${k}.followModes`)} />}
      {plane && p.has('TERRAIN_LOOKAHD') && (
        <DraggableSlider label={t(`${k}.lookahead`)} value={p.get('TERRAIN_LOOKAHD')} onChange={(m) => p.set('TERRAIN_LOOKAHD', m)} min={0} max={5000} step={100} color="#10B981" hint={t(`${k}.lookaheadHint`)} />
      )}
      {!plane && p.has('WPNAV_RFND_USE') && (
        <Toggle on={p.get('WPNAV_RFND_USE') === 1} onChange={(on) => p.set('WPNAV_RFND_USE', on ? 1 : 0)} label={t(`${k}.rfndUse`)} hint={t(`${k}.rfndUseHint`)} />
      )}
      {!plane && <EnumChips name="SURFTRAK_MODE" label={t(`${k}.surftrak`)} />}

      <button type="button" onClick={() => onGoTo('hardware')} className="inline-flex items-center gap-1 text-xs text-content-secondary hover:text-content">
        {hasRangefinder ? t(`${k}.rangeChange`) : t(`${k}.rangeAdd`)}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </Card>
  );
}

/** The first of these the vehicle has, with the factor to metres (or m/s): names and units vary by firmware. */
function pickParam(has: (n: string) => boolean, ...options: Array<[string, number]>): { name: string; scale: number } | null {
  for (const [name, scale] of options) if (has(name)) return { name, scale };
  return null;
}

const RC_INPUT = 23;
const MAVLINK2 = 2;
const BAUD_460800 = 460;
const RSSI_FROM_RECEIVER = 3;
const RSSI_FROM_RADIO = 5;
const RC_ALL = 1;
const RC_CRSF = 512;
/** What an ELRS MAVLink link carries well: a steady horizon, the rest kept light. */
const ELRS_RATES: Record<string, number> = { attitude: 10, position: 2, vfr: 2, status: 2, rc: 0, raw: 0, extra3: 1 };

/** Everything ELRS needs, from Serial Ports, RC and the parameter list, in one place. */
export function ElrsCard({ highlight }: { highlight: boolean }) {
  const { t } = useTranslation();
  const p = useParam();
  const k = 'mavlink-config:quickSetup.elrs';
  const parameters = useParameterStore((s) => s.parameters);
  const rc = useTelemetryStore((s) => s.rcChannels);
  const boardVersion = useConnectionStore((s) => s.connectionState.boardVersion);
  const boardPorts = boardPortRegistry.useEntries();

  const ports = useMemo(() => {
    const out: number[] = [];
    for (let n = 1; n <= 8; n++) if (parameters.has(`SERIAL${n}_PROTOCOL`)) out.push(n);
    return out;
  }, [parameters]);
  const label = (n: number) => boardPortLabel(boardPorts, boardVersion ? boardVersion >>> 16 : undefined, n)?.label ?? serialPortLabel(n);
  const rcPorts = ports.filter((n) => p.get(`SERIAL${n}_PROTOCOL`) === RC_INPUT);
  // an ELRS MAVLink port runs fast; a telemetry radio usually sits at 57600
  const mavPorts = ports.filter((n) => p.get(`SERIAL${n}_PROTOCOL`) === MAVLINK2 || p.get(`SERIAL${n}_PROTOCOL`) === 1);
  const detectedMav = mavPorts.find((n) => p.get(`SERIAL${n}_BAUD`) === BAUD_460800)
    ?? mavPorts.find((n) => p.get(`SERIAL${n}_BAUD`) >= 230);
  const detected: { mode: 'crsf' | 'mavlink'; port: number | null } = rcPorts.length > 0
    ? { mode: 'crsf', port: rcPorts[0]! }
    : detectedMav !== undefined ? { mode: 'mavlink', port: detectedMav } : { mode: 'crsf', port: null };

  // follows what the aircraft has until the pilot picks something: parameters arrive after the card mounts
  const [picked, setPicked] = useState<{ mode?: 'crsf' | 'mavlink'; port?: number }>({});
  const mode = picked.mode ?? detected.mode;
  const port = picked.port ?? (picked.mode && picked.mode !== detected.mode ? null : detected.port);
  const setMode = (m: 'crsf' | 'mavlink') => setPicked((x) => ({ ...x, mode: m }));
  const setPort = (n: number) => setPicked((x) => ({ ...x, port: n }));
  const protoName = (n: number) => {
    const v = p.get(`SERIAL${n}_PROTOCOL`);
    return p.meta(`SERIAL${n}_PROTOCOL`)?.values?.[v] ?? String(v);
  };
  const baudText = (n: number) => {
    const code = p.get(`SERIAL${n}_BAUD`);
    return p.meta(`SERIAL${n}_BAUD`)?.values?.[code] ?? String(code);
  };
  const [withRates, setWithRates] = useState(true);

  if (ports.length === 0) return null;

  type Check = { id: string; ok: boolean; text: string; fix: () => void };
  const checks: Check[] = [];
  if (port !== null) {
    const pp = `SERIAL${port}_PROTOCOL`;
    if (mode === 'crsf') {
      checks.push({ id: 'port', ok: p.get(pp) === RC_INPUT, text: t(`${k}.portRc`, { port: label(port) }), fix: () => p.set(pp, RC_INPUT) });
      for (const other of rcPorts.filter((n) => n !== port)) {
        checks.push({ id: `other-${other}`, ok: false, text: t(`${k}.otherRc`, { port: label(other) }), fix: () => p.set(`SERIAL${other}_PROTOCOL`, -1) });
      }
      if (p.has('RC_PROTOCOLS')) {
        const v = p.get('RC_PROTOCOLS');
        checks.push({ id: 'proto', ok: (v & RC_ALL) !== 0 || (v & RC_CRSF) !== 0, text: t(`${k}.protoCrsf`), fix: () => p.set('RC_PROTOCOLS', v | RC_CRSF) });
      }
      if (p.has('RSSI_TYPE')) checks.push({ id: 'rssi', ok: p.get('RSSI_TYPE') === RSSI_FROM_RECEIVER, text: t(`${k}.rssiReceiver`), fix: () => p.set('RSSI_TYPE', RSSI_FROM_RECEIVER) });
      const bits = p.meta('RC_OPTIONS')?.bitmask;
      const elrsBit = bits ? Object.entries(bits).find(([, name]) => /420|elrs/i.test(name)) : undefined;
      if (elrsBit && p.has('RC_OPTIONS')) {
        const mask = 1 << Number(elrsBit[0]);
        const v = p.get('RC_OPTIONS');
        checks.push({ id: '420k', ok: (v & mask) !== 0, text: t(`${k}.baud420`), fix: () => p.set('RC_OPTIONS', v | mask) });
      }
    } else {
      checks.push({ id: 'port', ok: p.get(pp) === MAVLINK2, text: t(`${k}.portMav`, { port: label(port) }), fix: () => p.set(pp, MAVLINK2) });
      const bp = `SERIAL${port}_BAUD`;
      if (p.has(bp)) checks.push({ id: 'baud', ok: p.get(bp) === BAUD_460800, text: t(`${k}.baudMav`), fix: () => p.set(bp, BAUD_460800) });
      if (p.has('RSSI_TYPE')) checks.push({ id: 'rssi', ok: p.get('RSSI_TYPE') === RSSI_FROM_RADIO, text: t(`${k}.rssiRadio`), fix: () => p.set('RSSI_TYPE', RSSI_FROM_RADIO) });
      const bits = p.meta('RC_PROTOCOLS')?.bitmask;
      const mavBit = bits ? Object.entries(bits).find(([, name]) => /mav/i.test(name)) : undefined;
      if (mavBit && p.has('RC_PROTOCOLS')) {
        const mask = 1 << Number(mavBit[0]);
        const v = p.get('RC_PROTOCOLS');
        checks.push({ id: 'mavrc', ok: (v & RC_ALL) !== 0 || (v & mask) !== 0, text: t(`${k}.rcOverMav`), fix: () => p.set('RC_PROTOCOLS', v | mask) });
      }
    }
  }

  // the port's MAVLink channel, from the staged values, so a port just switched to MAVLink is found
  const links = mavlinkLinks(paramLookup(parameters));
  const channel = port !== null ? links.find((l) => l.serial === port)?.channel ?? null : null;
  const rateRows = mode === 'mavlink' && channel !== null
    ? RATE_GROUPS.map((g) => {
        const name = rateParamName(paramLookup(parameters), channel, g.suffix);
        return name ? { id: g.id, name, now: p.get(name), want: ELRS_RATES[g.id] ?? 0 } : null;
      }).filter((r): r is { id: string; name: string; now: number; want: number } => r !== null)
    : [];
  const ratesOk = rateRows.every((r) => r.now === r.want);

  const failing = checks.filter((c) => !c.ok);
  const allOk = port !== null && failing.length === 0 && (!withRates || ratesOk);
  const fixAll = () => {
    for (const c of failing) c.fix();
    if (withRates) for (const r of rateRows) p.set(r.name, r.want);
  };
  const receiving = rc.chancount > 0;

  return (
    <div id="quick-setup-elrs" className={`rounded-xl transition-shadow ${highlight ? 'ring-2 ring-sky-500/60' : ''}`}>
      <Card
        icon={<Radio className="w-5 h-5 text-teal-500 dark:text-teal-400" />}
        iconTone="bg-teal-500/15"
        title={t(`${k}.title`)}
        hint={t(`${k}.hint`)}
        status={port === null ? 'off' : allOk ? 'ok' : 'warn'}
        statusText={port === null ? t(`${k}.noPort`) : allOk ? t(`${k}.ready`) : t(`${k}.toFix`, { count: failing.length + (withRates && !ratesOk ? 1 : 0) })}
      >
        <Chips
          label={t(`${k}.mode`)}
          value={mode === 'crsf' ? 0 : 1}
          onChange={(v) => setMode(v === 0 ? 'crsf' : 'mavlink')}
          options={[{ value: 0, label: t(`${k}.modeCrsf`) }, { value: 1, label: t(`${k}.modeMav`) }]}
        />
        <p className="text-[11px] text-content-tertiary -mt-2">{mode === 'crsf' ? t(`${k}.modeCrsfHint`) : t(`${k}.modeMavHint`)}</p>
        <Chips
          label={t(`${k}.port`)}
          value={port ?? -1}
          onChange={(v) => setPort(v)}
          options={ports.map((n) => ({ value: n, label: `${label(n)} · ${protoName(n)}${p.get(`SERIAL${n}_PROTOCOL`) === RC_INPUT ? '' : ` · ${baudText(n)}`}` }))}
        />

        {checks.length > 0 && (
          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-xs">
                {c.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                <span className="flex-1 text-content">{c.text}</span>
                {!c.ok && <button type="button" onClick={c.fix} className="shrink-0 text-xs text-sky-700 hover:underline dark:text-sky-300">{t(`${k}.fix`)}</button>}
              </li>
            ))}
          </ul>
        )}

        {mode === 'mavlink' && (
          <div className="space-y-2">
            <Toggle on={withRates} onChange={setWithRates} label={t(`${k}.rates`)} hint={t(`${k}.ratesHint`)} />
            {withRates && rateRows.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-raised/50 p-2.5">
                {rateRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-content-secondary">{rateGroupLabel({ id: r.id })}</span>
                    <span className={`font-mono tabular-nums ${r.now === r.want ? 'text-content' : 'text-amber-600 dark:text-amber-400'}`}>
                      {r.now === r.want ? t(`${k}.hz`, { v: r.want }) : t(`${k}.hzChange`, { from: r.now, to: r.want })}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {withRates && rateRows.length === 0 && (
              <p className="text-[11px] text-content-tertiary">{port === null ? t(`${k}.ratesPickPort`) : t(`${k}.ratesAfterPort`)}</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className={`flex items-center gap-1.5 text-[11px] ${receiving ? 'text-emerald-600 dark:text-emerald-400' : 'text-content-tertiary'}`}>
            <span className={`h-2 w-2 rounded-full ${receiving ? 'bg-emerald-500' : 'bg-content-tertiary/40'}`} />
            {receiving ? t(`${k}.receiving`, { count: rc.chancount }) : t(`${k}.noSignal`)}
          </span>
          <button
            type="button"
            disabled={port === null || allOk}
            onClick={fixAll}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(`${k}.fixAll`)}
          </button>
        </div>
      </Card>
    </div>
  );
}

const MAV_TYPE_SURFACE_BOAT = 11;

/** Depth sounder for boats: what is fitted, a way to fit one, and the echogram for the radio. */
function DepthSounderCard() {
  const { t } = useTranslation();
  const k = 'mavlink-config:quickSetup.depth';
  const parameters = useParameterStore((s) => s.parameters);
  const connected = useConnectionStore((s) => s.connectionState.isConnected);
  const range = useTelemetryStore((s) => s.rangefinder);
  const state = useMemo(() => {
    const values: Record<string, number | undefined> = {};
    for (const name of SONAR_PARAMS) values[name] = parameters.get(name)?.value;
    return sonarSetupState(values);
  }, [parameters]);
  const go = useNavigationStore((s) => s.setView);
  const [setupQuery, setSetupQuery] = useState<string | null>(null);
  const fitted = state.kind !== 'none';
  const status = fitted ? 'ok' : 'warn';
  const statusText = t(`${k}.state.${state.kind}`);

  return (
    <Card
      icon={<Waves className="w-5 h-5 text-blue-500 dark:text-blue-400" />}
      iconTone="bg-blue-500/15"
      title={t(`${k}.title`)}
      hint={t(`${k}.hint`)}
      status={status}
      statusText={statusText}
      more={{ label: t(`${k}.onRadio`), onClick: () => go('radio-hud') }}
    >
      {setupQuery !== null && <HardwareSetupWizard initialQuery={setupQuery} onClose={() => setSetupQuery(null)} />}
      {fitted ? (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-content">{range ? `${range.distance.toFixed(1)} m` : '--'}</span>
          <span className="text-xs text-content-secondary">{range ? t(`${k}.belowTransducer`) : t(`${k}.noReading`)}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-content-secondary">{t(`${k}.noneBody`)}</p>
          <div className="flex flex-wrap gap-2">
            {(['ping', 'nmea'] as const).map((q) => (
              <button key={q} type="button" onClick={() => setSetupQuery(q === 'ping' ? 'Ping' : 'NMEA')}
                className="rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-inset">
                {t(`${k}.add.${q}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {(state.kind === 'ready' || state.kind === 'installed') && <SonarSetupCard connected={connected} />}
      {state.kind === 'nmea' && <p className="text-[11px] text-content-tertiary">{t(`${k}.nmeaNote`)}</p>}
    </Card>
  );
}

/** The door into the guided setup, and the four problems that lead into its steps. */
function NewVehicleHero({ onGoTo }: { onGoTo: (tab: string) => void }) {
  const { t } = useTranslation();
  const k = 'mavlink-config:quickSetup.hero';
  const open = (entry: WizardEntry) => { if (!openNewVehicleWizard(entry)) onGoTo('parameters'); };
  return (
    <section className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 flex items-start gap-3">
      <div className="w-10 h-10 shrink-0 rounded-lg bg-sky-500/20 flex items-center justify-center">
        <Rocket className="w-5 h-5 text-sky-500 dark:text-sky-400" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-content">{t(`${k}.title`)}</h3>
        <p className="text-xs text-content-secondary">{t(`${k}.body`)}</p>
        {!hasNewVehicleWizard() && <p className="mt-1 text-[11px] text-content-tertiary">{t(`${k}.notReady`)}</p>}
      </div>
      <button type="button" onClick={() => open('start')} className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500">
        {t(`${k}.start`)}
      </button>
    </section>
  );
}

function ProblemRow({ onGoTo }: { onGoTo: (tab: string) => void }) {
  const { t } = useTranslation();
  const k = 'mavlink-config:quickSetup.problems';
  const statusMessages = useMessagesStore((s) => s.messages);
  const failures = useMemo(() => currentPrearmFailures(statusMessages as Array<{ text: string; timestamp?: number }>), [statusMessages]);
  const open = (entry: WizardEntry) => { if (!openNewVehicleWizard(entry)) onGoTo('parameters'); };
  const items: Array<{ entry: WizardEntry; title: string; detail: string; count?: number }> = [
    { entry: 'arm', title: t(`${k}.arm`), detail: failures.length ? failures.map((f) => f.text).join(', ') : t(`${k}.armNone`), count: failures.length },
    { entry: 'flip', title: t(`${k}.flip`), detail: t(`${k}.flipDetail`) },
    { entry: 'motors', title: t(`${k}.motors`), detail: t(`${k}.motorsDetail`) },
    { entry: 'wobble', title: t(`${k}.wobble`), detail: t(`${k}.wobbleDetail`) },
  ];
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-content-secondary">
        <AlertTriangle className="h-3.5 w-3.5" />
        {t(`${k}.title`)}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((i) => (
          <button key={i.entry} type="button" onClick={() => open(i.entry)} className="rounded-lg border border-subtle bg-surface p-3 text-left hover:bg-surface-raised">
            <div className="flex items-center gap-2 text-xs font-medium text-content">
              <span className="truncate">{i.title}</span>
              {i.count ? <span className="shrink-0 rounded-full bg-red-500/20 px-1.5 text-[10px] text-red-600 dark:text-red-400">{i.count}</span> : null}
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11px] text-content-tertiary">{i.detail}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function HardwareGroup({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const k = 'mavlink-config:quickSetup.hardware';
  const [setupOpen, setSetupOpen] = useState(false);
  return (
    <section className="space-y-3">
      {setupOpen && <HardwareSetupWizard onClose={() => setSetupOpen(false)} />}
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-content">{t(`${k}.title`)}</h3>
          <p className="text-xs text-content-secondary">{t(`${k}.hint`)}</p>
        </div>
        <button type="button" onClick={() => setSetupOpen(true)} className="inline-flex shrink-0 items-center gap-1 text-xs text-content-secondary hover:text-content">
          {t(`${k}.more`)}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </section>
  );
}

/** Fixes worth making, staged together for one review: never written from here. */
function Recommendations({ plane, mavType }: { plane: boolean; mavType: number | undefined }) {
  const { t } = useTranslation();
  const p = useParam();
  const parameters = useParameterStore((s) => s.parameters);
  const locus = useTileSourceStore((s) => s.entries.some((e) => e.slug === LOCUS_SLUG && e.kind === 'dem'));
  const k = 'mavlink-config:quickSetup.recommend';
  const items: Array<{ text: string; apply: () => void }> = [];

  const alt = plane ? pickParam(p.has, ['RTL_ALTITUDE', 1], ['ALT_HOLD_RTL', 0.01]) : pickParam(p.has, ['RTL_ALT_M', 1], ['RTL_ALT', 0.01]);
  const minAlt = plane ? 100 : 30;
  if (alt && p.get(alt.name) >= 0 && p.get(alt.name) * alt.scale < minAlt) {
    items.push({ text: t(`${k}.rtlAlt`, { m: minAlt }), apply: () => p.set(alt.name, minAlt / alt.scale) });
  }
  const radio = plane ? 'THR_FAILSAFE' : 'FS_THR_ENABLE';
  if (p.has(radio) && p.get(radio) === 0) items.push({ text: t(`${k}.radio`), apply: () => p.set(radio, 1) });
  if (p.has('BATT_FS_LOW_ACT') && p.get('BATT_FS_LOW_ACT') === 0 && p.get('BATT_LOW_VOLT') > 0) {
    // "return home" is 2 on Copter and 1 on Plane
    items.push({ text: t(`${k}.battLow`), apply: () => p.set('BATT_FS_LOW_ACT', plane ? 1 : 2) });
  }
  if (locus && p.has('TERRAIN_SPACING') && p.get('TERRAIN_SPACING') > 30) {
    items.push({ text: t(`${k}.spacing`), apply: () => { p.set('TERRAIN_ENABLE', 1); p.set('TERRAIN_SPACING', 30); } });
  }
  const vehicle = plane ? 'plane' : mavType !== undefined && getVehicleClass(mavType) === 'copter' ? 'copter' : 'other';
  for (const r of buildRecommendations({ parameters, vehicle, enumOf: (n) => p.meta(n)?.values })) {
    items.push({ text: t(`${k}.${r.textKey}`, r.textParams), apply: () => Object.entries(r.changes).forEach(([n, v]) => p.set(n, v)) });
  }
  if (items.length === 0) return null;
  return (
    <section className="bg-sky-500/10 rounded-xl border border-sky-500/30 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
          <Lightbulb className="w-5 h-5 text-sky-500 dark:text-sky-400" />
        </div>
        <h3 className="flex-1 text-sm font-medium text-content">{t(`${k}.title`)}</h3>
        <button type="button" onClick={() => items.forEach((i) => i.apply())} className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-500">
          {t(`${k}.stageAll`)}
        </button>
      </div>
      <ul className="space-y-1 pl-[52px]">
        {items.map((i) => (
          <li key={i.text} className="flex items-center justify-between gap-2 text-xs text-content">
            <span>{i.text}</span>
            <button type="button" onClick={i.apply} className="shrink-0 text-sky-700 hover:underline dark:text-sky-300">{t(`${k}.stage`)}</button>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-content-tertiary pl-[52px]">{t(`${k}.note`)}</p>
    </section>
  );
}

/** The settings changed most often, each as a card. Every change only stages; Write to Flash reviews it. */
export function QuickSetupTab({ onGoTo, focus }: { onGoTo: (tab: string) => void; focus?: string | null }) {
  const { t } = useTranslation();
  // a jump from another tab (e.g. RC -> ELRS) scrolls to its card and marks it for a moment
  const [lit, setLit] = useState<string | null>(null);
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`quick-setup-${focus}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setLit(focus);
    const timer = setTimeout(() => setLit(null), 2500);
    return () => clearTimeout(timer);
  }, [focus]);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const plane = isPlaneType(mavType);
  // rover and boat: their own cards only, the return-height and terrain cards are written for aircraft
  if (mavType !== undefined && getVehicleClass(mavType) === 'rover') {
    return (
      <div className="p-6 space-y-6">
        <InfoCard title={t('mavlink-config:quickSetup.introTitle')} variant="info">
          {t('mavlink-config:quickSetup.intro')}
        </InfoCard>
        <NewVehicleHero onGoTo={onGoTo} />
        <ProblemRow onGoTo={onGoTo} />
        <HardwareGroup>
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="space-y-4">
              <ElrsCard highlight={lit === 'elrs'} />
              <GpsCompassCard onGoTo={onGoTo} />
            </div>
            <div className="space-y-4">
              <TelemetryRadioCard />
              {mavType === MAV_TYPE_SURFACE_BOAT && <DepthSounderCard />}
            </div>
          </div>
        </HardwareGroup>
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6">
      <InfoCard title={t('mavlink-config:quickSetup.introTitle')} variant="info">
        {t('mavlink-config:quickSetup.intro')}
      </InfoCard>
      <NewVehicleHero onGoTo={onGoTo} />
      <ProblemRow onGoTo={onGoTo} />
      <Recommendations plane={plane} mavType={mavType} />
      {/* two stacks, not a grid: rows of a grid are as tall as their tallest card and leave holes */}
      <HardwareGroup>
        <div className="grid grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <ElrsCard highlight={lit === 'elrs'} />
            <GpsCompassCard onGoTo={onGoTo} />
          </div>
          <div className="space-y-4">
            <TelemetryRadioCard />
            <RangefinderCard />
            <VibrationFilterCard />
          </div>
        </div>
      </HardwareGroup>
      <div className="grid grid-cols-2 gap-4 items-start">
        <div className="space-y-4">
          <ReturnHomeCard plane={plane} onGoTo={onGoTo} />
        </div>
        <div className="space-y-4">
          <TerrainCard plane={plane} onGoTo={onGoTo} />
        </div>
      </div>
    </div>
  );
}
