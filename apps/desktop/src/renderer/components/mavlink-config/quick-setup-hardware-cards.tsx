/**
 * The "Add hardware" cards of the Quick setup overview: telemetry radio,
 * battery monitor, rangefinder, GPS and compass. Each reads the staged
 * parameters and live telemetry, and only ever stages changes.
 * The board itself is never drawn: only the firmware target is known, so
 * ports are named from the firmware's SERIALn list.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Radar, RadioTower } from 'lucide-react';
import { serialPortLabel } from '../../../shared/mavlink-channels';
import { boardPortLabel, boardPortRegistry } from '../../modules/module-extension-registries';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { readCompassSlots, summariseCompasses } from './compass-inventory';
import { apCanGpsWrites, apProtocolName, apSerialGpsWrites, apSerialPorts, readApGpsSetup, AP_PROTOCOL_GPS } from './gps-setup';
import { HardwareSetupWizard } from './hardware-setup/HardwareSetupWizard';
import { Card, CheckLine, Chips, SmallButton, useParam, type Tone } from './quick-setup-ui';

const MAVLINK1 = 1;
const MAVLINK2 = 2;
const BAUD_57600 = 57;
const PROTOCOL_UNUSED = -1;
const PROTOCOL_RC_IN = 23;
/** SERIAL0 is the USB console: never offered for a device. */
const FIRST_DEVICE_PORT = 1;

/** The hardware setup opened in place, so the card never just sends the pilot elsewhere. */
function useHardwareSetup(): [ReactNode, (query: string) => void] {
  const [query, setQuery] = useState<string | null>(null);
  const node = query !== null ? <HardwareSetupWizard initialQuery={query} onClose={() => setQuery(null)} /> : null;
  return [node, setQuery];
}

function useSerialPorts() {
  const parameters = useParameterStore((s) => s.parameters);
  const boardVersion = useConnectionStore((s) => s.connectionState.boardVersion);
  const boardPorts = boardPortRegistry.useEntries();
  const ports = useMemo(() => {
    const out: number[] = [];
    for (let n = 1; n <= 8; n++) if (parameters.has(`SERIAL${n}_PROTOCOL`)) out.push(n);
    return out;
  }, [parameters]);
  const label = (n: number) => boardPortLabel(boardPorts, boardVersion ? boardVersion >>> 16 : undefined, n)?.label ?? serialPortLabel(n);
  return { ports, label };
}

/** A SiK style radio: the slow MAVLink port, checked for MAVLink 2, 57600 and flow control. */
export function TelemetryRadioCard() {
  const { t } = useTranslation();
  const p = useParam();
  const k = 'mavlink-config:quickSetup.telemetry';
  const { ports, label } = useSerialPorts();
  const [pickedPort, setPickedPort] = useState<number | null>(null);
  // the USB console is SERIAL0; a radio sits on a slow MAVLink port
  const radioPorts = ports.filter((n) => [MAVLINK1, MAVLINK2].includes(p.get(`SERIAL${n}_PROTOCOL`)) && p.get(`SERIAL${n}_BAUD`) <= 115);
  const port = radioPorts[0];
  const baudText = (n: number) => p.meta(`SERIAL${n}_BAUD`)?.values?.[p.get(`SERIAL${n}_BAUD`)] ?? String(p.get(`SERIAL${n}_BAUD`));

  const checks: Array<{ id: string; ok: boolean; text: string; fix?: () => void }> = [];
  if (port !== undefined) {
    const proto = `SERIAL${port}_PROTOCOL`;
    const baud = `SERIAL${port}_BAUD`;
    const mav2 = p.get(proto) === MAVLINK2;
    const baudOk = p.get(baud) === BAUD_57600;
    checks.push(mav2 && baudOk
      ? { id: 'port', ok: true, text: t(`${k}.portOk`, { port: label(port), baud: baudText(port) }) }
      : !mav2
        ? { id: 'mav2', ok: false, text: t(`${k}.mav2`, { port: label(port) }), fix: () => p.set(proto, MAVLINK2) }
        : { id: 'baud', ok: false, text: t(`${k}.baud`, { port: label(port), baud: baudText(port) }), fix: () => p.set(baud, BAUD_57600) });
  }
  const flowParam = port !== undefined ? `BRD_SER${port}_RTSCTS` : null;
  const flow = flowParam && p.has(flowParam) ? p.get(flowParam) : null;
  const failing = checks.filter((c) => !c.ok).length;
  const tone: Tone = port === undefined ? 'off' : failing ? 'warn' : 'ok';

  return (
    <Card
      icon={<RadioTower className="w-5 h-5 text-violet-500 dark:text-violet-400" />}
      iconTone="bg-violet-500/15"
      title={t(`${k}.title`)}
      hint={t(`${k}.hint`)}
      status={tone}
      statusText={port === undefined ? t(`${k}.none`) : failing ? t(`${k}.toFix`, { count: failing }) : t(`${k}.ready`)}
    >
      {port === undefined ? (
        <div className="space-y-2">
          <Chips
            label={t(`${k}.pickPort`)}
            value={pickedPort ?? -1}
            onChange={(v) => setPickedPort(v)}
            options={ports.filter((n) => n >= FIRST_DEVICE_PORT && ![PROTOCOL_RC_IN, AP_PROTOCOL_GPS].includes(p.get(`SERIAL${n}_PROTOCOL`))).map((n) => ({ value: n, label: `${label(n)} · ${apProtocolName(p.get(`SERIAL${n}_PROTOCOL`))}` }))}
          />
          <SmallButton primary disabled={pickedPort === null} onClick={() => { if (pickedPort === null) return; p.set(`SERIAL${pickedPort}_PROTOCOL`, MAVLINK2); p.set(`SERIAL${pickedPort}_BAUD`, BAUD_57600); }}>
            {t(`${k}.usePort`, { port: pickedPort === null ? '' : label(pickedPort) })}
          </SmallButton>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {checks.map((c) => <CheckLine key={c.id} ok={c.ok} text={c.text} fixLabel={t(`${k}.fix`)} onFix={c.fix} />)}
          {flow !== null && flowParam && (
            <CheckLine ok text={flow ? t(`${k}.flowOn`, { port: label(port) }) : t(`${k}.flowOff`, { port: label(port) })}>
              <button type="button" onClick={() => p.set(flowParam, flow ? 0 : 1)} className="shrink-0 text-xs text-sky-700 hover:underline dark:text-sky-300">
                {flow ? t(`${k}.turnOff`) : t(`${k}.turnOn`)}
              </button>
            </CheckLine>
          )}
        </ul>
      )}
      {port !== undefined && flow !== null && <p className="text-[11px] text-content-tertiary">{t(`${k}.flowHint`)}</p>}
    </Card>
  );
}

/** The three rangefinders people fit most, straight into the hardware setup; the rest one click further. */
const RANGEFINDER_PICKS: Array<{ query: string; name: string }> = [
  { query: 'TF-Luna', name: 'Benewake TF-Luna' }, // i18n-exempt: brand and model
  { query: 'SF11', name: 'LightWare SF11' }, // i18n-exempt: brand and model
  { query: 'US-D1', name: 'Ainstein US-D1' }, // i18n-exempt: brand and model
];

export function RangefinderCard() {
  const { t } = useTranslation();
  const p = useParam();
  const k = 'mavlink-config:quickSetup.rangefinder';
  const range = useTelemetryStore((s) => s.rangefinder);
  const [setup, openSetup] = useHardwareSetup();
  if (!p.has('RNGFND1_TYPE')) return null;
  const fitted = p.get('RNGFND1_TYPE') > 0;
  return (
    <Card
      icon={<Radar className="w-5 h-5 text-orange-500 dark:text-orange-400" />}
      iconTone="bg-orange-500/15"
      title={t(`${k}.title`)}
      hint={t(`${k}.hint`)}
      status={fitted ? 'ok' : 'off'}
      statusText={fitted ? t(`${k}.fitted`) : t(`${k}.none`)}
      more={{ label: t(`${k}.all`), onClick: () => openSetup(t('mavlink-config:hardwareSetup.category.rangefinder')) }}
    >
      {setup}
      {fitted ? (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-content">{range ? `${range.distance.toFixed(2)} m` : '--'}</span>
          <span className="text-xs text-content-secondary">{range ? t(`${k}.reading`, { m: range.distance.toFixed(2) }) : t(`${k}.noReading`)}</span>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-content-secondary">{t(`${k}.pick`)}</p>
          <div className="flex flex-wrap gap-2">
            {RANGEFINDER_PICKS.map((r) => (
              <SmallButton key={r.query} onClick={() => openSetup(r.query)}>{r.name}</SmallButton>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Fix and satellites from telemetry, the GPS port from the firmware's SERIALn
 * list, compass calibration from the parameters. No GPS: pick its port and the
 * card stages protocol 5 and GPS type auto, the live fix then confirms it.
 */
export function GpsCompassCard({ onGoTo }: { onGoTo: (tab: string) => void }) {
  const { t } = useTranslation();
  const p = useParam();
  const k = 'mavlink-config:quickSetup.gps';
  const parameters = useParameterStore((s) => s.parameters);
  const gps = useTelemetryStore((s) => s.gps);
  const { label } = useSerialPorts();
  const get = useMemo(() => (n: string) => parameters.get(n)?.value, [parameters]);
  const setup = useMemo(() => readApGpsSetup(get), [get]);
  const serialPorts = useMemo(() => apSerialPorts(get).filter((sp) => sp.index >= FIRST_DEVICE_PORT), [get]);
  const compass = useMemo(() => summariseCompasses(readCompassSlots(get), parameters.has('COMPASS_DEV_ID')), [get, parameters]);
  const [pickedPort, setPickedPort] = useState<number | null>(null);
  if (setup.type === null && !parameters.has('COMPASS_DEV_ID')) return null;

  const gpsOn = setup.type !== null && setup.type !== 0 && setup.bus !== 'none';
  const fixText = gps.fixType >= 5 ? t(`${k}.fixRtk`) : gps.fixType === 4 ? t(`${k}.fixDgps`) : gps.fixType === 3 ? t(`${k}.fix3d`) : gps.fixType === 2 ? t(`${k}.fix2d`) : t(`${k}.fixNone`);
  const fixOk = gps.fixType >= 3;
  const uncal = compass.uncalibrated;
  const tone: Tone = !gpsOn ? 'warn' : uncal.length > 0 ? 'risk' : fixOk ? 'ok' : 'warn';
  const statusText = !gpsOn ? t(`${k}.noGps`) : uncal.length > 0 ? t(`${k}.compassUncal`) : fixOk ? t(`${k}.ok`) : t(`${k}.noFix`);
  const protoName = (proto: number) => { const n = apProtocolName(proto); return n.includes(':') ? t(n) : n; };
  // staged through the parameter diff: only the names this firmware has
  const stage = (writes: Array<{ name: string; value: number }>) => { for (const w of writes) if (p.has(w.name)) p.set(w.name, w.value); };
  const candidates = serialPorts.filter((sp) => sp.protocol === PROTOCOL_UNUSED || ![PROTOCOL_RC_IN, MAVLINK1, MAVLINK2].includes(sp.protocol));
  const hasCan = p.has('CAN_P1_DRIVER');

  return (
    <Card
      icon={<Compass className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />}
      iconTone="bg-cyan-500/15"
      title={t(`${k}.title`)}
      hint={t(`${k}.hint`)}
      status={tone}
      statusText={statusText}
    >
      <ul className="space-y-1.5">
        {gpsOn ? (
          <>
            <CheckLine ok text={setup.bus === 'can' ? t(`${k}.useCan`) : t(`${k}.onPort`, { port: setup.gpsPorts.map(label).join(', ') })} />
            <CheckLine ok={fixOk} text={t(`${k}.fix`, { fix: fixText, sats: gps.satellites })} />
          </>
        ) : (
          <CheckLine ok={false} text={setup.problem ?? t(`${k}.gpsOff`)} />
        )}
        {compass.known && compass.none && <CheckLine ok={false} text={t(`${k}.noCompass`)} />}
        {uncal.map((c) => (
          <CheckLine key={c.index} ok={false} text={t(`${k}.compassBad`, { n: c.index })} fixLabel={t(`${k}.calibrate`)} onFix={() => onGoTo('sensors')} />
        ))}
        {compass.present.length > 0 && uncal.length === 0 && (
          <CheckLine ok text={t(`${k}.compassOk`, { count: compass.present.filter((c) => c.used).length })} />
        )}
      </ul>
      {!gpsOn && (
        <div className="space-y-2">
          <Chips
            label={t(`${k}.pickPort`)}
            value={pickedPort ?? -1}
            onChange={(v) => setPickedPort(v)}
            options={candidates.map((sp) => ({ value: sp.index, label: `${label(sp.index)} · ${protoName(sp.protocol)}` }))}
          />
          <div className="flex flex-wrap gap-2">
            <SmallButton primary disabled={pickedPort === null} onClick={() => { if (pickedPort !== null) stage(apSerialGpsWrites(pickedPort)); }}>
              {t(`${k}.usePort`, { port: pickedPort === null ? '' : label(pickedPort) })}
            </SmallButton>
            {hasCan && <SmallButton onClick={() => stage(apCanGpsWrites())}>{t(`${k}.useCan`)}</SmallButton>}
          </div>
          <p className="text-[11px] text-content-tertiary">{t(`${k}.portsHint`)}</p>
        </div>
      )}
    </Card>
  );
}
