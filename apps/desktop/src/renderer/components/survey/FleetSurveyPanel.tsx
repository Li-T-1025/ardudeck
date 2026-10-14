/**
 * Fleet survey modal - one mission per vehicle from the current survey.
 *
 * Two sources: the vehicles planned in the survey config (`config.fleet`,
 * set in the survey panel; a fleet-capable engine has then already planned
 * one mission each, before any aircraft is connected) or the connected
 * fleet (the single plan is cut by cells or bands). Each mission is uploaded
 * to a connected vehicle, or saved as a .plan file for later.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { useSurveyStore } from '../../stores/survey-store';
import { useFleetSurveyStore } from '../../stores/fleet-survey-store';
import { useFleetVehicles } from '../../hooks/useFleet';
import { assignmentsFromFleetMissions, buildFleetSurvey } from './survey-fleet-split';
import { fleetSlotIndex, isFleetSlotKey, type SurveyFleetVehicle } from './survey-types';

type Source = 'planned' | 'connected';

const INPUT = 'bg-surface-input border border-subtle rounded px-2 py-1 font-mono text-right';

export function FleetSurveyPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const polygon = useSurveyStore((s) => s.polygon);
  const config = useSurveyStore((s) => s.config);
  const surveyResult = useSurveyStore((s) => s.result);
  const vehicles = useFleetVehicles();

  const building = useFleetSurveyStore((s) => s.building);
  const assignments = useFleetSurveyStore((s) => s.assignments);
  const uploadStatus = useFleetSurveyStore((s) => s.uploadStatus);
  const targets = useFleetSurveyStore((s) => s.targets);
  const setBuilding = useFleetSurveyStore((s) => s.setBuilding);
  const setAssignments = useFleetSurveyStore((s) => s.setAssignments);
  const setUploadStatus = useFleetSurveyStore((s) => s.setUploadStatus);
  const setTarget = useFleetSurveyStore((s) => s.setTarget);

  const plannedFleet = config.fleet ?? [];
  const [source, setSource] = useState<Source>(plannedFleet.length >= 2 || vehicles.length < 2 ? 'planned' : 'connected');
  const [selected, setSelected] = useState<string[]>(() => vehicles.map((v) => v.key));
  const [altStep, setAltStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});

  const toggle = (key: string) =>
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const labelOf = (key: string) =>
    isFleetSlotKey(key)
      ? t('survey:surveyConfigPanel.fleetLabel', { n: fleetSlotIndex(key) })
      : vehicles.find((v) => v.key === key)?.label ?? key;

  const keys = source === 'planned' ? plannedFleet.map((v) => v.key) : selected;

  const generate = async () => {
    if (!polygon || keys.length < 2) return;
    setBuilding(true);
    setError(null);
    try {
      // The survey was already planned per vehicle: use those missions as they are.
      const direct =
        source === 'planned' && surveyResult
          ? assignmentsFromFleetMissions(surveyResult, polygon, config, keys, altStep)
          : null;
      if (direct) {
        setAssignments(direct);
        setSaved({});
        return;
      }
      // Pass the generated plan so decomposing engines (TOPAS) split along
      // their cells instead of geometric bands.
      const plan = surveyResult
        ? { waypoints: surveyResult.waypoints, generatorResult: surveyResult.generatorResult }
        : undefined;
      // Connected vehicles start where they stand, with the endurance their
      // charge leaves; planned slots carry their own numbers.
      const fleet: SurveyFleetVehicle[] =
        source === 'planned'
          ? plannedFleet
          : keys.map((key) => {
              const v = vehicles.find((x) => x.key === key);
              const charge = v?.batteryPct != null && v.batteryPct > 0 ? v.batteryPct / 100 : null;
              return {
                key,
                label: v?.label,
                start: v?.position ? { lat: v.position[0], lng: v.position[1] } : null,
                ...(charge !== null && config.enduranceMinutes
                  ? { enduranceMinutes: Math.max(1, config.enduranceMinutes * charge) }
                  : {}),
              };
            });
      const result = await buildFleetSurvey(polygon, config, keys, { altitudeStepM: altStep, plan, fleet });
      setAssignments(result);
      setSaved({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };

  // Where an assignment goes: its own vehicle, or the one picked for a planned slot.
  const targetOf = (assignmentKey: string): string | null =>
    isFleetSlotKey(assignmentKey) ? targets[assignmentKey] ?? null : assignmentKey;
  const allTargeted = assignments.length > 0 && assignments.every((a) => targetOf(a.vehicleKey));

  const uploadAll = async () => {
    setUploading(true);
    try {
      for (const a of assignments) {
        const target = targetOf(a.vehicleKey);
        if (!target) continue;
        setUploadStatus(a.vehicleKey, 'uploading');
        const res = await window.electronAPI?.uploadMissionToVehicle?.(target, a.missionItems);
        if (res?.success) setUploadStatus(a.vehicleKey, 'complete');
        else setUploadStatus(a.vehicleKey, 'error', res?.error ?? t('common:uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  };

  const savePlan = async (assignmentKey: string) => {
    const a = assignments.find((x) => x.vehicleKey === assignmentKey);
    if (!a) return;
    const res = await window.electronAPI?.saveMissionToFile?.(a.missionItems, 'plan');
    if (res?.success && res.filePath) setSaved((cur) => ({ ...cur, [assignmentKey]: res.filePath! }));
  };

  const canGenerate = !!polygon && keys.length >= 2 && !building;
  const split = assignments[0]?.source;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[520px] max-h-[80vh] overflow-y-auto rounded-xl border border-subtle bg-surface-solid shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-content">{t('survey:fleetSurveyPanel.title')}</h2>
          <button onClick={onClose} className="text-content-tertiary hover:text-content text-sm">✕</button>
        </div>

        {!polygon ? (
          <p className="text-xs text-content-secondary">{t('survey:fleetSurveyPanel.drawFirst')}</p>
        ) : (
          <>
            <div className="mb-3 flex rounded-md border border-subtle overflow-hidden text-xs">
              {(['planned', 'connected'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`flex-1 px-2 py-1.5 transition-colors ${source === s ? 'bg-surface-raised text-content' : 'text-content-tertiary hover:text-content'}`}
                >
                  {s === 'planned'
                    ? t('survey:fleetSurveyPanel.sourcePlanned', { count: plannedFleet.length })
                    : t('survey:fleetSurveyPanel.sourceConnected', { count: vehicles.length })}
                </button>
              ))}
            </div>

            {source === 'connected' ? (
              <div className="mb-4">
                <span className="text-[11px] uppercase tracking-wide text-content-secondary">{t('survey:fleetSurveyPanel.vehicles')}</span>
                <div className="mt-1.5 flex flex-col gap-1">
                  {vehicles.map((v) => (
                    <label key={v.key} className="flex items-center gap-2 text-xs text-content cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-cyan-500"
                        checked={selected.includes(v.key)}
                        onChange={() => toggle(v.key)}
                      />
                      <span className="font-mono">{v.label}</span>
                      <span className="text-content-tertiary">{v.vehicleClass}</span>
                    </label>
                  ))}
                  {vehicles.length === 0 && (
                    <span className="text-xs text-content-tertiary">{t('survey:fleetSurveyPanel.noVehicles')}</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="mb-4 text-xs text-content-secondary leading-relaxed">
                {plannedFleet.length >= 2
                  ? t('survey:fleetSurveyPanel.plannedFromSurvey', { count: plannedFleet.length })
                  : t('survey:fleetSurveyPanel.plannedEmpty')}
              </p>
            )}

            <label className="flex items-center justify-between gap-3 mb-4 text-xs text-content">
              <span>{t('survey:fleetSurveyPanel.altitudeStep')}</span>
              <DraftNumberInput
                value={altStep}
                min={0}
                onCommit={setAltStep}
                className={`w-20 ${INPUT}`}
              />
            </label>

            <button
              onClick={generate}
              disabled={!canGenerate}
              className="w-full mb-4 px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-50"
            >
              {building ? t('survey:fleetSurveyPanel.generating') : t('survey:fleetSurveyPanel.generateSplit', { count: keys.length })}
            </button>

            {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

            {assignments.length > 0 && (
              <div className="mb-4">
                <span className="text-[11px] uppercase tracking-wide text-content-secondary">{t('survey:fleetSurveyPanel.assignments')}</span>
                <div className="mt-1.5 rounded-lg border border-subtle overflow-hidden">
                  {assignments.map((a) => {
                    const st = uploadStatus[a.vehicleKey]?.state ?? 'idle';
                    const stColor =
                      st === 'complete' ? 'text-green-400' : st === 'error' ? 'text-red-400' : st === 'uploading' ? 'text-cyan-400' : 'text-content-tertiary';
                    const summary = { waypoints: a.waypointCount, hectares: (a.areaCovered / 10000).toFixed(1), altitude: Math.round(a.altitude) };
                    return (
                      <div key={a.vehicleKey} className="px-3 py-1.5 border-b border-subtle last:border-0 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-content">{labelOf(a.vehicleKey)}</span>
                          <span className="text-content-secondary font-mono">
                            {a.flightTime != null
                              ? t('survey:fleetSurveyPanel.assignmentSummaryTime', { ...summary, minutes: Math.round(a.flightTime / 60) })
                              : t('survey:fleetSurveyPanel.assignmentSummary', summary)}
                          </span>
                          <span className={`font-mono ${stColor}`}>{st}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          {isFleetSlotKey(a.vehicleKey) ? (
                            <select
                              value={targets[a.vehicleKey] ?? ''}
                              onChange={(e) => setTarget(a.vehicleKey, e.target.value || null)}
                              className="bg-surface-input border border-subtle rounded px-1.5 py-0.5 text-[11px] text-content"
                            >
                              <option value="">{t('survey:fleetSurveyPanel.uploadToChoose')}</option>
                              {vehicles.map((v) => (
                                <option key={v.key} value={v.key}>{v.label}</option>
                              ))}
                            </select>
                          ) : <span />}
                          <button
                            onClick={() => void savePlan(a.vehicleKey)}
                            className="text-[11px] text-content-secondary hover:text-cyan-400"
                            title={saved[a.vehicleKey]}
                          >
                            {saved[a.vehicleKey] ? t('survey:fleetSurveyPanel.savedPlan') : t('survey:fleetSurveyPanel.savePlan')}
                          </button>
                        </div>
                        {a.warnings?.map((w) => (
                          <div key={w} className="mt-0.5 text-[10px] text-amber-400 leading-snug">{w}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {assignments.length > 0 && (
              <button
                onClick={uploadAll}
                disabled={uploading || !allTargeted}
                title={allTargeted ? undefined : t('survey:fleetSurveyPanel.uploadNeedsTargets')}
                className="w-full px-3 py-2 rounded bg-surface-raised hover:bg-surface-solid border border-subtle text-content text-xs font-semibold disabled:opacity-50"
              >
                {uploading ? t('common:uploading') : t('survey:fleetSurveyPanel.uploadAll')}
              </button>
            )}

            <p className="mt-3 text-[10px] text-content-tertiary leading-relaxed">
              {split === 'engine'
                ? t('survey:fleetSurveyPanel.footnoteEngine')
                : split === 'cells'
                  ? t('survey:fleetSurveyPanel.footnoteCells')
                  : t('survey:fleetSurveyPanel.footnote')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
