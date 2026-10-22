import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot from 'uplot';
import { useLogStore } from '../../stores/log-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useResolvedTheme } from '../../hooks/useTheme';
import { SERIES_COLORS } from './log-chart-stats';
import { peakIndex } from './log-fft';
import {
  BATCH_AXES, batchSpectra, listSources, messageFields, messageSpectra, parseSourceKey, sourceKey,
  type InstanceSpectrum, type SpectrumSource,
} from './spectrum-sources';
import type { BatchAxis } from '../mavlink-config/notch-analysis';
import { useTranslation } from 'react-i18next';

// Sensible defaults per message type: what a tuner actually wants to see first.
// Dataflash names first, then the PX4 ULog topics that carry the same signal.
const TYPE_PREFERENCE: { type: string; field: string }[] = [
  { type: 'IMU', field: 'GyrX' },
  { type: 'GYR', field: 'GyrX' },
  { type: 'ACC', field: 'AccX' },
  { type: 'VIBE', field: 'VibeX' },
  { type: 'RATE', field: 'R' },
  { type: 'sensor_combined', field: 'gyro_rad[0]' },
  { type: 'sensor_gyro_fifo', field: 'x[0]' },
  { type: 'sensor_accel', field: 'x' },
  { type: 'vehicle_imu_status', field: 'gyro_vibration_metric' },
  { type: 'vehicle_angular_velocity', field: 'xyz[0]' },
];

/**
 * FFT spectrum of any log signal - the vibration / harmonic-notch tuning view
 * (MP hides this in a separate FFT tool; here it lives next to the charts and
 * follows their zoom). Welch-averaged, Hann-windowed, amplitude-calibrated.
 * The batch sampler (ISBH/ISBD) is the default source: full sensor rate.
 * Multi-instance types (per-IMU) render one series per instance so a bad
 * sensor stands out immediately.
 */
export function SpectrumPanel() {
  const { t } = useTranslation();
  const currentLog = useLogStore((s) => s.currentLog);
  const syncedXRange = useLogStore((s) => s.syncedXRange);
  const syncZoomEnabled = useLogStore((s) => s.syncZoomEnabled);
  const isLight = useResolvedTheme() === 'light';

  const [sourceSel, setSourceSel] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [axis, setAxis] = useState<BatchAxis>('x');
  const [followZoom, setFollowZoom] = useState(true);
  const [dbScale, setDbScale] = useState(false);

  const sources = useMemo(() => (currentLog ? listSources(currentLog) : []), [currentLog]);
  const hasBatch = sources.some((s) => s.kind === 'batch');

  // Batch gyro first, then the preferred regular message, when nothing is chosen.
  const source: SpectrumSource | null = useMemo(() => {
    const chosen = sourceSel ? parseSourceKey(sourceSel) : null;
    if (chosen && sources.some((s) => sourceKey(s) === sourceKey(chosen))) return chosen;
    const batch = sources.find((s) => s.kind === 'batch');
    if (batch) return batch;
    const preferred = TYPE_PREFERENCE.find((p) => sources.some((s) => s.kind === 'msg' && s.type === p.type));
    return preferred ? { kind: 'msg', type: preferred.type } : sources[0] ?? null;
  }, [sourceSel, sources]);

  const msgType = source?.kind === 'msg' ? source.type : null;
  const fieldsForType = useMemo(
    () => (currentLog && msgType ? messageFields(currentLog.messages[msgType]) : []),
    [currentLog, msgType],
  );

  const effectiveField = field && fieldsForType.includes(field)
    ? field
    : (TYPE_PREFERENCE.find((p) => p.type === msgType && fieldsForType.includes(p.field))?.field ?? fieldsForType[0] ?? null);

  const xWindow = followZoom && syncZoomEnabled ? syncedXRange : null;

  const spectra = useMemo<InstanceSpectrum[]>(() => {
    if (!currentLog || !source) return [];
    if (source.kind === 'batch') return batchSpectra(currentLog, source.sensor, axis, xWindow);
    const cols = currentLog.messages[source.type];
    if (!cols || cols.count === 0 || !effectiveField) return [];
    return messageSpectra(cols, effectiveField, xWindow);
  }, [currentLog, source, axis, effectiveField, xWindow]);

  const seriesLabel = (s: InstanceSpectrum) => {
    const base = source?.kind === 'batch' ? `ISBD ${source.sensor}` : msgType ?? '';
    const suffix = source?.kind === 'batch' ? axis.toUpperCase() : effectiveField ?? '';
    return s.inst !== null ? `${base}[${s.inst}].${suffix}` : `${base}.${suffix}`;
  };

  const chartRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const container = chartRef.current;
    if (!container || spectra.length === 0) {
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
      return;
    }

    // Align all instances onto the first spectrum's frequency axis. Instances
    // of one sensor type log at (near-)identical rates; a mismatch just
    // truncates to the shortest.
    const minLen = Math.min(...spectra.map((s) => s.spec.freqHz.length));
    const xFreq = spectra[0]!.spec.freqHz.slice(0, minLen);
    const toY = (amp: number) => (dbScale ? 20 * Math.log10(amp + 1e-9) : amp);
    const data = [
      xFreq,
      ...spectra.map((s) => Float64Array.from(s.spec.amplitude.slice(0, minLen), toY)),
    ] as uPlot.AlignedData;

    const axisTheme = {
      stroke: isLight ? '#4b5563' : '#9ca3af',
      grid: { stroke: isLight ? '#e5e7eb' : '#1f2937', width: 1 },
      ticks: { stroke: isLight ? '#d1d5db' : '#374151', width: 1 },
      font: '11px system-ui',
    };

    const { width, height } = container.getBoundingClientRect();
    const opts: uPlot.Options = {
      width: Math.max(width, 300),
      height: Math.max(height, 160),
      cursor: { drag: { x: true, y: false, uni: 50 } },
      scales: { x: { time: false }, y: { auto: true } },
      legend: { show: true },
      axes: [
        { label: t('logs:spectrum.frequency'), ...axisTheme },
        { label: dbScale ? t('logs:spectrum.amplitudeDb') : t('logs:spectrum.amplitude'), ...axisTheme },
      ],
      series: [
        { label: 'Hz' }, // i18n-exempt: unit
        ...spectra.map((s, i) => ({
          label: seriesLabel(s),
          stroke: SERIES_COLORS[i % SERIES_COLORS.length]!,
          width: 1.5,
          points: { show: false },
        })),
      ],
      hooks: {
        // Mark the dominant peak: this is the number that goes into notch tuning.
        draw: [(u) => {
          const first = spectra[0]!.spec;
          const pk = peakIndex(first, 5);
          if (pk < 0 || pk >= minLen) return;
          const fx = first.freqHz[pk]!;
          const x = u.valToPos(fx, 'x', true);
          const ctx = u.ctx;
          ctx.save();
          ctx.strokeStyle = '#f59e0b88';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, u.bbox.top);
          ctx.lineTo(x, u.bbox.top + u.bbox.height);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#f59e0b';
          ctx.font = '10px system-ui';
          ctx.textBaseline = 'top';
          ctx.fillText(`${fx.toFixed(1)} Hz`, x + 4, u.bbox.top + 2);
          ctx.restore();
        }],
      },
    };

    if (plotRef.current) plotRef.current.destroy();
    plotRef.current = new uPlot(opts, data, container);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotRef.current?.setSize({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, 120) });
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (plotRef.current) { plotRef.current.destroy(); plotRef.current = null; }
    };
    // seriesLabel only feeds series labels and always changes together with
    // `spectra`, which IS a dep - listing it would just force a second identical rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spectra, dbScale, isLight]);

  if (!currentLog) {
    return <div className="h-full flex items-center justify-center text-content-tertiary text-xs">{t('logs:noLogLoaded')}</div>;
  }

  const first = spectra[0];
  const selectCls = 'text-[11px] px-1.5 py-0.5 rounded bg-input text-content border border-subtle focus:outline-none focus:border-blue-500/50';
  const sourceLabel = (s: SpectrumSource) => (s.kind === 'batch' ? t(s.sensor === 'gyro' ? 'logs:spectrum.batchGyro' : 'logs:spectrum.batchAccel') : s.type);
  const openVibrationCard = () => useNavigationStore.getState().setView('parameters', 'tab:quick-setup?focus=vibration');

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-3 pt-2 pb-1.5 border-b border-subtle flex items-center gap-2 flex-wrap">
        <select value={source ? sourceKey(source) : ''} onChange={(e) => { setSourceSel(e.target.value); setField(null); }} className={selectCls}>
          {sources.map((s) => <option key={sourceKey(s)} value={sourceKey(s)}>{sourceLabel(s)}</option>)}
        </select>
        {source?.kind === 'batch' ? (
          <select value={axis} onChange={(e) => setAxis(e.target.value as BatchAxis)} className={selectCls}>
            {BATCH_AXES.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
          </select>
        ) : (
          <select value={effectiveField ?? ''} onChange={(e) => setField(e.target.value)} className={selectCls}>
            {fieldsForType.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        )}
        <button
          onClick={() => setFollowZoom(!followZoom)}
          disabled={!syncZoomEnabled}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            !syncZoomEnabled
              ? 'bg-surface text-content-tertiary border-subtle opacity-50 cursor-not-allowed'
              : followZoom
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : 'bg-surface text-content-tertiary border-subtle hover:text-content-secondary'
          }`}
          data-tip={syncZoomEnabled ? t('logs:spectrum.followZoomTip') : t('logs:spectrum.enableSyncTip')}
        >
          {t('logs:spectrum.followZoom')}
        </button>
        <button
          onClick={() => setDbScale(!dbScale)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            dbScale
              ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
              : 'bg-surface text-content-tertiary border-subtle hover:text-content-secondary'
          }`}
          data-tip={t('logs:spectrum.dbTip')}
        >
          dB
        </button>
        {first && (
          <span className="text-[10px] text-content-tertiary ml-auto tabular-nums">
            {t('logs:spectrum.stats', { rate: first.rateHz.toFixed(0), df: first.spec.resolutionHz.toFixed(2), seg: first.spec.segments })}
          </span>
        )}
      </div>
      {first && source?.kind === 'msg' && (
        <div className="flex-shrink-0 px-3 py-1 border-b border-subtle text-[10px] text-content-tertiary flex items-center gap-2 flex-wrap">
          <span>{t('logs:spectrum.lowRange', { type: source.type, rate: first.rateHz.toFixed(0), nyquist: (first.rateHz / 2).toFixed(0) })}</span>
          {!hasBatch && (
            <>
              <span>{t('logs:spectrum.batchHint')}</span>
              <button onClick={openVibrationCard} className="text-blue-400 hover:text-blue-300 underline">
                {t('logs:spectrum.openVibrationCard')}
              </button>
            </>
          )}
        </div>
      )}
      {spectra.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-content-tertiary text-xs px-6 text-center">
          {t('logs:spectrum.notEnough')}
        </div>
      ) : (
        <div ref={chartRef} className="flex-1 min-h-0" />
      )}
    </div>
  );
}
