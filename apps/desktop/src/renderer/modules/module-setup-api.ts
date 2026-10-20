import type { RendererHostApi, SetupSuggestionKind } from '@ardudeck/module-sdk';
import { computeSetupStatus } from '../../shared/vehicle-setup/plans';
import { buildSuggestion } from '../../shared/vehicle-setup/calc';
import type { ParamReader, SetupStepId } from '../../shared/vehicle-setup/types';
import { useConnectionStore } from '../stores/connection-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useParameterStore } from '../stores/parameter-store';
import { useMessagesStore } from '../stores/messages-store';
import { useSettingsStore, type VehicleProfile } from '../stores/settings-store';
import { useVehicleSetupStore } from '../stores/vehicle-setup-store';
import { currentPrearmFailures } from '../components/mavlink-config/prearm-status';

const KINDS: readonly SetupSuggestionKind[] = ['tune', 'airspeed', 'battery'];
const REQUIRED: Record<SetupSuggestionKind, string[]> = {
  tune: ['propIn', 'cells', 'chemistry'],
  airspeed: ['stall'],
  battery: ['cells', 'chemistry'],
};
// The profile has no LiFe in the wizard's chemistry list, so it stays unset and is asked for.
const CHEMISTRY: Record<string, string> = { lipo: 'lipo', lihv: 'lipohv', lion: 'liion' };

function readParam(): ParamReader {
  const params = useParameterStore.getState().parameters;
  return (name) => {
    const v = params.get(name)?.value;
    return typeof v === 'number' ? v : undefined;
  };
}

function profile(): VehicleProfile | null {
  const settings = useSettingsStore.getState();
  const uid = useConnectionStore.getState().connectionState?.boardUid;
  return (uid && settings.vehicles.find((v) => v.boardUid === uid)) || settings.getActiveVehicle();
}

function profileInputs(p: VehicleProfile | null): Record<string, number | string> {
  if (!p) return {};
  const out: Record<string, number | string> = {};
  const propIn = p.propDiameter ? p.propDiameter / 25.4 : parseFloat(p.propSize ?? '');
  if (propIn > 0) out.propIn = Math.round(propIn * 10) / 10;
  if (p.batteryCells > 0) out.cells = p.batteryCells;
  const chem = CHEMISTRY[p.batteryChemistry ?? 'lipo'];
  if (chem) out.chemistry = chem;
  if (p.batteryCapacity > 0) out.capacity = p.batteryCapacity;
  if (p.stallSpeed && p.stallSpeed > 0) out.stall = p.stallSpeed;
  return out;
}

export const currentSetupStatus: RendererHostApi['setup']['getStatus'] = async () => {
  const conn = useConnectionStore.getState().connectionState;
  if (!conn?.isConnected) return null;
  const prearm = currentPrearmFailures(
    useMessagesStore.getState().messages as Array<{ text: string; timestamp?: number }>,
  ).map((f) => f.text);
  const { answers, done } = useVehicleSetupStore.getState();
  const rc = useTelemetryStore.getState().rcChannels;
  return computeSetupStatus({
    mavType: conn.mavType,
    firmware: conn.firmwareVersion ?? conn.autopilot ?? '',
    read: readParam(),
    prearm,
    answers,
    done,
    rcReceiving: (rc?.chancount ?? 0) > 0,
  });
};

export function createSetupApi(): RendererHostApi['setup'] {
  const getStatus = currentSetupStatus;
  return {
    getStatus,

    openStep: async (stepId) => {
      const status = await getStatus();
      if (!status?.steps.some((s) => s.id === stepId)) return false;
      useVehicleSetupStore.getState().openAt(stepId as SetupStepId);
      return true;
    },

    suggest: async (kind, inputs) => {
      if (!KINDS.includes(kind)) throw new Error(`unknown suggestion kind: ${kind}`); // i18n-exempt
      const merged = { ...profileInputs(profile()), ...(inputs ?? {}) };
      const missing = REQUIRED[kind].filter((k) => merged[k] === undefined || merged[k] === '');
      if (missing.length) throw new Error(`missing inputs: ${missing.join(', ')} (ask the pilot, or save them in the vehicle profile)`); // i18n-exempt
      return buildSuggestion(kind, merged, readParam());
    },

    getProfile: async () => {
      const p = profile();
      return p ? ({ ...p } as Record<string, unknown>) : null;
    },
  };
}
