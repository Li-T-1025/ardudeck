/**
 * SafetyTab
 *
 * Configures failsafes, arming checks, and geofence settings.
 * Beginner-friendly cards with proper icons (no emojis).
 */

import React, { useMemo, useCallback, useState, useRef } from 'react';
import {
  Shield,
  Scale,
  Zap,
  Radio,
  Monitor,
  Battery,
  Fence,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Save,
  Lightbulb,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { formatParamValue } from '../../../shared/parameter-types';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import { PresetSelector, type Preset } from '../ui/PresetSelector';
import { SigningSection } from '../settings/SigningSection';
import {
  SAFETY_PRESETS,
  FENCE_TYPES,
  ARMING_CHECKS,
  type SafetyPreset,
} from './presets/mavlink-presets';

// Convert safety presets to PresetSelector format
const PRESET_SELECTOR_PRESETS: Record<string, Preset> = {
  maximum: {
    name: 'Maximum',
    description: SAFETY_PRESETS.maximum!.description,
    icon: Shield,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
  },
  balanced: {
    name: 'Balanced',
    description: SAFETY_PRESETS.balanced!.description,
    icon: Scale,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
  },
  minimal: {
    name: 'Minimal',
    description: SAFETY_PRESETS.minimal!.description,
    icon: Zap,
    iconColor: 'text-orange-400',
    color: 'from-orange-500/20 to-red-500/10 border-orange-500/30',
  },
};

type ConfirmAction = { type: 'preset'; key: string } | { type: 'no-checks' };

const SafetyTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount, fetchParameters, isLoading } = useParameterStore();

  // Check if parameters are loaded
  const hasParameters = parameters.size > 0;

  // Transient inline error for failed parameter writes (no toast reachable from this tab)
  const [writeError, setWriteError] = useState<string | null>(null);
  const writeErrorTimer = useRef<number | null>(null);
  const reportWriteError = useCallback((message: string) => {
    setWriteError(message);
    if (writeErrorTimer.current) window.clearTimeout(writeErrorTimer.current);
    writeErrorTimer.current = window.setTimeout(() => setWriteError(null), 8000);
  }, []);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Get current safety values
  const safetyValues = useMemo(() => ({
    // Throttle failsafe
    fsThrEnable: parameters.get('FS_THR_ENABLE')?.value ?? 1,
    fsThrValue: parameters.get('FS_THR_VALUE')?.value ?? 975,
    // GCS failsafe
    fsGcsEnable: parameters.get('FS_GCS_ENABLE')?.value ?? 0,
    // Battery failsafe (low)
    battFsLowAct: parameters.get('BATT_FS_LOW_ACT')?.value ?? 0,
    battLowVolt: parameters.get('BATT_LOW_VOLT')?.value ?? 0,
    battLowMah: parameters.get('BATT_LOW_MAH')?.value ?? 0,
    // Battery failsafe (critical)
    battFsCrtAct: parameters.get('BATT_FS_CRT_ACT')?.value ?? 0,
    battCrtVolt: parameters.get('BATT_CRT_VOLT')?.value ?? 0,
    battCrtMah: parameters.get('BATT_CRT_MAH')?.value ?? 0,
    // Fence
    fenceEnable: parameters.get('FENCE_ENABLE')?.value ?? 0,
    fenceType: parameters.get('FENCE_TYPE')?.value ?? 3,
    fenceAltMax: parameters.get('FENCE_ALT_MAX')?.value ?? 100,
    fenceRadius: parameters.get('FENCE_RADIUS')?.value ?? 300,
    fenceAction: parameters.get('FENCE_ACTION')?.value ?? 1,
    // Arming
    armingCheck: parameters.get('ARMING_CHECK')?.value ?? 1,
  }), [parameters]);

  // Apply preset (after confirmation)
  const applyPresetConfirmed = useCallback(async (presetKey: string) => {
    const preset = SAFETY_PRESETS[presetKey];
    if (!preset) return;
    const failed: string[] = [];
    for (const [param, value] of Object.entries(preset.params)) {
      const ok = await setParameter(param, value);
      if (!ok) failed.push(param);
    }
    if (failed.length > 0) {
      reportWriteError(`Failed to set ${failed.join(', ')}`);
    }
  }, [setParameter, reportWriteError]);

  // Individual arming check entries (exclude bit 1 "All" which is a special flag)
  const armingCheckEntries = useMemo(() =>
    Object.entries(ARMING_CHECKS)
      .filter(([bit]) => Number(bit) !== 1)
      .map(([bit, info]) => ({ bit: Number(bit), ...info }))
      .sort((a, b) => a.bit - b.bit),
    []
  );

  // All individual bits OR'd together (65534 = all checks except the "All" flag)
  const allBitsValue = useMemo(() =>
    armingCheckEntries.reduce((acc, entry) => acc | entry.bit, 0),
    [armingCheckEntries]
  );

  const isCustomMode = safetyValues.armingCheck !== 1 && safetyValues.armingCheck !== 0;

  const writeArmingCheck = useCallback(async (value: number) => {
    const ok = await setParameter('ARMING_CHECK', value);
    if (!ok) reportWriteError('Failed to set ARMING_CHECK');
  }, [setParameter, reportWriteError]);

  const toggleArmingCheck = useCallback((bit: number) => {
    const newValue = safetyValues.armingCheck ^ bit;
    writeArmingCheck(newValue);
  }, [safetyValues.armingCheck, writeArmingCheck]);

  const modified = modifiedCount();

  return (
    <div className="p-6 space-y-6">
      {/* Parameters not loaded warning */}
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-amber-300 font-medium">Parameters Not Loaded</p>
              <p className="text-xs text-content-secondary">Fetch parameters from the FC to use presets</p>
            </div>
          </div>
          <button
            onClick={() => fetchParameters()}
            disabled={isLoading}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Fetch Parameters'}
          </button>
        </div>
      )}

      {/* Write failure banner */}
      {writeError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{writeError}</p>
        </div>
      )}

      {/* Help Card */}
      <InfoCard title="Safety Features" variant="info">
        Configure what happens when things go wrong. Failsafes can save your aircraft
        from flyaways and crashes. Beginners should use the Maximum Safety preset.
      </InfoCard>

      {/* Safety Presets */}
      <PresetSelector
        presets={PRESET_SELECTOR_PRESETS}
        onApply={(key) => setConfirmAction({ type: 'preset', key })}
        label="Safety Presets"
        hint="Click to review and apply all settings"
      />

      {/* Failsafe Settings Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* RC Failsafe Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">RC Signal Lost</h3>
              <p className="text-xs text-content-secondary">What happens when transmitter signal is lost</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">Action</label>
              <select
                value={safetyValues.fsThrEnable}
                onChange={(e) => setParameter('FS_THR_ENABLE', Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                <option value={0}>Disabled (Not Recommended)</option>
                <option value={1}>RTL - Return to Launch</option>
                <option value={2}>Continue Mission</option>
                <option value={3}>Land Immediately</option>
                <option value={4}>SmartRTL or RTL</option>
                <option value={5}>SmartRTL or Land</option>
              </select>
            </div>

            <DraggableSlider
              label="Trigger PWM Threshold"
              value={safetyValues.fsThrValue}
              onChange={(v) => setParameter('FS_THR_VALUE', v)}
              min={900}
              max={1100}
              step={5}
              color="#EF4444"
              hint="Failsafe triggers when throttle drops below this value"
            />
          </div>
        </div>

        {/* GCS Failsafe Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">GCS Connection Lost</h3>
              <p className="text-xs text-content-secondary">What happens when ground station disconnects</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-content-secondary block mb-1.5">Action</label>
            <select
              value={safetyValues.fsGcsEnable}
              onChange={(e) => setParameter('FS_GCS_ENABLE', Number(e.target.value))}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
            >
              <option value={0}>Disabled</option>
              <option value={1}>RTL - Return to Launch</option>
              <option value={2}>Continue Mission</option>
              <option value={3}>SmartRTL or RTL</option>
              <option value={4}>SmartRTL or Land</option>
              <option value={5}>Land Immediately</option>
            </select>
          </div>

          <div className="bg-surface-raised rounded-lg p-3">
            <p className="text-xs text-content-secondary">
              <span className="text-amber-400">Tip:</span> GCS failsafe requires heartbeat
              from ground station. If flying without GCS, leave disabled.
            </p>
          </div>
        </div>

        {/* Battery Failsafe Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Battery className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Low Battery</h3>
              <p className="text-xs text-content-secondary">Protect against flying home with dead battery</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">Action</label>
              <select
                value={safetyValues.battFsLowAct}
                onChange={(e) => setParameter('BATT_FS_LOW_ACT', Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                <option value={0}>Disabled</option>
                <option value={1}>Land Immediately</option>
                <option value={2}>RTL - Return to Launch</option>
                <option value={3}>SmartRTL or RTL</option>
                <option value={4}>SmartRTL or Land</option>
                <option value={5}>Terminate</option>
                <option value={6}>Auto DO_LAND_START or RTL</option>
              </select>
            </div>

            <DraggableSlider
              label="Low Voltage (V)"
              value={safetyValues.battLowVolt}
              onChange={(v) => setParameter('BATT_LOW_VOLT', v)}
              min={0}
              max={26}
              step={0.1}
              color="#F59E0B"
              hint="Trigger when voltage drops below this"
            />

            <DraggableSlider
              label="Low mAh Remaining"
              value={safetyValues.battLowMah}
              onChange={(v) => setParameter('BATT_LOW_MAH', v)}
              min={0}
              max={10000}
              step={100}
              color="#F59E0B"
              hint="Trigger when remaining mAh drops below this"
            />
          </div>
        </div>

        {/* Critical Battery Failsafe Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Critical Battery</h3>
              <p className="text-xs text-content-secondary">Last resort when battery is dangerously low</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">Action</label>
              <select
                value={safetyValues.battFsCrtAct}
                onChange={(e) => setParameter('BATT_FS_CRT_ACT', Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                <option value={0}>Disabled</option>
                <option value={1}>Land Immediately</option>
                <option value={2}>RTL - Return to Launch</option>
                <option value={3}>SmartRTL or RTL</option>
                <option value={4}>SmartRTL or Land</option>
                <option value={5}>Terminate</option>
                <option value={6}>Auto DO_LAND_START or RTL</option>
              </select>
            </div>

            <DraggableSlider
              label="Critical Voltage (V)"
              value={safetyValues.battCrtVolt}
              onChange={(v) => setParameter('BATT_CRT_VOLT', v)}
              min={0}
              max={26}
              step={0.1}
              color="#EF4444"
              hint="Emergency action when voltage drops below this"
            />

            <DraggableSlider
              label="Critical mAh Remaining"
              value={safetyValues.battCrtMah}
              onChange={(v) => setParameter('BATT_CRT_MAH', v)}
              min={0}
              max={10000}
              step={100}
              color="#EF4444"
              hint="Emergency action when remaining mAh drops below this"
            />
          </div>

          <div className="bg-surface-raised rounded-lg p-3">
            <p className="text-xs text-content-secondary">
              <span className="text-red-400">Warning:</span> Critical battery should trigger a more
              aggressive action than low battery (e.g. Land vs RTL). Set voltage lower than the low battery threshold.
            </p>
          </div>
        </div>

        {/* Geofence Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Fence className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-content">Geofence</h3>
                <p className="text-xs text-content-secondary">Prevent flying out of bounds</p>
              </div>
            </div>
            <button
              onClick={async () => {
                const ok = await setParameter('FENCE_ENABLE', safetyValues.fenceEnable ? 0 : 1);
                if (!ok) reportWriteError('Failed to set FENCE_ENABLE');
              }}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                safetyValues.fenceEnable ? 'bg-blue-500' : 'bg-surface-raised'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  safetyValues.fenceEnable ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {safetyValues.fenceEnable ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-content-secondary block mb-1.5">Fence Type</label>
                <select
                  value={safetyValues.fenceType}
                  onChange={(e) => setParameter('FENCE_TYPE', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                >
                  {Object.entries(FENCE_TYPES).map(([num, type]) => (
                    <option key={num} value={num}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <DraggableSlider
                label="Max Altitude (m)"
                value={safetyValues.fenceAltMax}
                onChange={(v) => setParameter('FENCE_ALT_MAX', v)}
                min={10}
                max={1000}
                step={10}
                color="#3B82F6"
              />

              <DraggableSlider
                label="Max Radius (m)"
                value={safetyValues.fenceRadius}
                onChange={(v) => setParameter('FENCE_RADIUS', v)}
                min={30}
                max={10000}
                step={50}
                color="#3B82F6"
              />

              <div>
                <label className="text-xs text-content-secondary block mb-1.5">Breach Action</label>
                <select
                  value={safetyValues.fenceAction}
                  onChange={(e) => setParameter('FENCE_ACTION', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                >
                  <option value={0}>Report Only</option>
                  <option value={1}>RTL or Land</option>
                  <option value={2}>Always Land</option>
                  <option value={3}>SmartRTL or RTL</option>
                  <option value={4}>Brake or Land</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="bg-surface-raised rounded-lg p-3">
              <p className="text-xs text-content-secondary">
                Enable geofence to set altitude and distance limits.
                Your aircraft will RTL or land if it breaches the fence.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Arming Checks */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Arming Checks</h3>
              <p className="text-xs text-content-secondary">What must pass before motors can arm</p>
            </div>
          </div>
          <select
            value={safetyValues.armingCheck === 1 ? 'all' : safetyValues.armingCheck === 0 ? 'none' : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'all') writeArmingCheck(1);
              else if (e.target.value === 'none') setConfirmAction({ type: 'no-checks' });
              else if (e.target.value === 'custom') writeArmingCheck(allBitsValue);
            }}
            className="px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Checks (Recommended)</option>
            <option value="none">No Checks (Dangerous!)</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {safetyValues.armingCheck === 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">
              <span className="font-medium">Warning:</span> Disabling arming checks is dangerous!
              Your aircraft could arm with faulty sensors or no GPS lock.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {armingCheckEntries.map((check) => {
            const isEnabled = safetyValues.armingCheck === 1 || (safetyValues.armingCheck & check.bit) !== 0;
            return (
              <button
                key={check.bit}
                onClick={() => isCustomMode && toggleArmingCheck(check.bit)}
                title={isCustomMode ? check.description : 'Switch to Custom mode to toggle individual checks'}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                  isEnabled ? 'bg-green-500/10 text-green-400' : 'bg-surface-raised text-content-secondary'
                } ${isCustomMode ? 'cursor-pointer hover:bg-surface-overlay-subtle' : 'cursor-default'}`}
              >
                {isEnabled ? (
                  <CheckCircle className="w-3 h-3 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 shrink-0" />
                )}
                <span>{check.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAVLink Signing */}
      <SigningSection />

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <Save className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            You have unsaved changes. Click <span className="font-medium">"Save All Changes"</span> in the header to save.
          </p>
        </div>
      )}

      {/* Confirmation Modal (preset apply / disable arming checks) */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-solid border rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            {confirmAction.type === 'preset' ? (
              <>
                <div className="px-6 py-4 border-b border-subtle">
                  <h3 className="text-lg font-semibold text-content">
                    Apply "{SAFETY_PRESETS[confirmAction.key]?.name}" Preset
                  </h3>
                  <p className="text-sm text-content-secondary mt-1">
                    The following parameters will be changed on the vehicle.
                  </p>
                </div>
                <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-content-secondary uppercase">
                        <th className="pb-2">Parameter</th>
                        <th className="pb-2 text-right">Current</th>
                        <th className="pb-2 text-center px-2">→</th>
                        <th className="pb-2">New</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {Object.entries(SAFETY_PRESETS[confirmAction.key]?.params ?? {}).map(([param, value]) => {
                        const current = parameters.get(param);
                        return (
                          <tr key={param}>
                            <td className="py-2 font-mono text-content">{param}</td>
                            <td className="py-2 text-right font-mono text-content-secondary">
                              {current ? formatParamValue(current.value) : '?'}
                            </td>
                            <td className="py-2 text-center text-content-tertiary">→</td>
                            <td className="py-2 font-mono text-amber-400">{formatParamValue(value)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const key = confirmAction.key;
                      setConfirmAction(null);
                      void applyPresetConfirmed(key);
                    }}
                    className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    Apply Preset
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-6 py-4">
                  <h3 className="text-lg font-semibold text-content flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    Disable all arming checks?
                  </h3>
                  <p className="text-sm text-content-secondary mt-2">
                    ARMING_CHECK will be set to 0. The vehicle will arm without validating
                    sensors, GPS lock, or calibration. This can lead to flyaways and crashes.
                  </p>
                </div>
                <div className="px-6 py-4 flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmAction(null)}
                    className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setConfirmAction(null);
                      void writeArmingCheck(0);
                    }}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    Disable Checks
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SafetyTab;
