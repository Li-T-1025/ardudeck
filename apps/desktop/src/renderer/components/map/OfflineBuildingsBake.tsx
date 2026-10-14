import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BuildingBakeProgress } from '../../../shared/building-cache-types';
import { useCameraStore } from '../../stores/camera-store';

type Source = 'openfreemap' | 'overture';
type Bounds = { north: number; south: number; east: number; west: number };

const formatMb = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0)} MB`;

/** Saves the synthetic-vision buildings for the visible area, so they load at once and work offline. */
export function OfflineBuildingsBake({ bounds }: { bounds: Bounds }) {
  const { t } = useTranslation();
  const preferred = useCameraStore((s) => s.svtBuildings);
  const [source, setSource] = useState<Source>(preferred === 'overture' ? 'overture' : 'openfreemap');
  const [tiles, setTiles] = useState<number | null>(null);
  const [progress, setProgress] = useState<BuildingBakeProgress | null>(null);

  useEffect(() => { void window.electronAPI?.buildingsCountTiles?.(bounds).then(setTiles); }, [bounds]);
  useEffect(() => window.electronAPI?.onBuildingsBakeProgress?.((p) => setProgress((cur) => (!cur || cur.bakeId === p.bakeId ? p : cur))), []);

  const running = progress?.status === 'running';
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="border-t border-subtle pt-2 space-y-1.5">
      <div className="text-[10px] text-content-secondary">{t('map:offlineArea.buildings')}</div>
      {running && progress ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-content-secondary">
            <span>{progress.done} / {progress.total}</span>
            <span>{formatMb(progress.bytes)}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-inset rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <button
            onClick={() => void window.electronAPI?.buildingsCancelBake?.(progress.bakeId)}
            className="w-full px-2 py-1 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 transition-colors"
          >
            {t('common:cancel')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {(['openfreemap', 'overture'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                  source === s ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' : 'bg-surface-raised text-content-secondary border border-subtle'
                }`}
              >
                {t(`camera:panel.buildings.${s}`)}
              </button>
            ))}
          </div>
          {tiles !== null && (
            <div className="text-[10px] text-content-secondary">
              {tiles > 2000 ? t('map:offlineArea.buildingsTooLarge') : t('map:offlineArea.buildingsEstimate', { count: tiles })}
            </div>
          )}
          {progress?.status === 'done' && (
            <div className="text-[10px] text-emerald-400">
              {t('map:offlineArea.buildingsDone', { count: progress.done - progress.failed, size: formatMb(progress.bytes) })}
              {progress.failed > 0 && ` ${t('map:offlineArea.buildingsFailed', { count: progress.failed })}`}
            </div>
          )}
          <button
            onClick={async () => { const p = await window.electronAPI?.buildingsBake?.(source, bounds); if (p) setProgress(p); }}
            disabled={tiles === null || tiles > 2000}
            className="w-full px-2 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('map:offlineArea.saveBuildings')}
          </button>
        </>
      )}
    </div>
  );
}
