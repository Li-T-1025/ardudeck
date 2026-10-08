/** What is actually on the vehicle this connection; the planner is a workspace, the telemetry map draws only this. */
import { useMemo } from 'react';
import { create } from 'zustand';
import type { MissionItem } from '../../shared/mission-types';
import type { Group } from '../../shared/mission-group-types';

export interface SnapshotGroup {
  id: string;
  color: string;
  /** Fingerprint of the group's waypoints when they went on (or came off) the vehicle. */
  signature: string;
}

export interface VehicleMission {
  /** Waypoints in the vehicle's own order: seq is the index the autopilot reports progress against. */
  items: MissionItem[];
  groups: SnapshotGroup[];
  at: number;
}

interface VehicleMissionState {
  /** Bumped on every connect, disconnect or change of vehicle: a snapshot from another epoch is history. */
  epoch: number;
  primary: (VehicleMission & { epoch: number }) | null;
  /** Fleet vehicles that received a group of their own, by vehicle key. */
  fleet: Record<string, VehicleMission>;
  /** The next download completes into the snapshot only, leaving the planner alone. */
  snapshotOnlyDownload: boolean;
  setPrimary: (items: MissionItem[], groups: Group[]) => void;
  clearPrimary: () => void;
  setFleet: (vehicleKey: string, items: MissionItem[], groups: Group[]) => void;
  newEpoch: () => void;
  setSnapshotOnlyDownload: (on: boolean) => void;
  applyMirror: (m: { epoch: number; primary: VehicleMissionState['primary']; fleet: VehicleMissionState['fleet'] }) => void;
}

/** What matters to the vehicle: command, frame, place, height and parameters, in order. */
export function groupSignature(items: MissionItem[], groupId: string): string {
  const r = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
  return JSON.stringify(
    items
      .filter((it) => it.groupId === groupId)
      .sort((a, b) => a.seq - b.seq)
      .map((it) => [it.command, it.frame, r(it.latitude, 7), r(it.longitude, 7), r(it.altitude, 2), r(it.param1, 3), r(it.param2, 3), r(it.param3, 3), r(it.param4, 3)]),
  );
}

function snapshot(items: MissionItem[], groups: Group[]): VehicleMission {
  const ordered = [...items].sort((a, b) => a.seq - b.seq).map((it, i) => ({ ...it, seq: i }));
  const ids = [...new Set(ordered.map((it) => it.groupId).filter((g): g is string => !!g))];
  return {
    items: ordered,
    groups: ids.map((id) => ({ id, color: groups.find((g) => g.id === id)?.color ?? '#38bdf8', signature: groupSignature(ordered, id) })),
    at: Date.now(),
  };
}

export const useVehicleMissionStore = create<VehicleMissionState>((set, get) => ({
  epoch: 0,
  primary: null,
  fleet: {},
  snapshotOnlyDownload: false,
  setPrimary: (items, groups) => set({ primary: { ...snapshot(items, groups), epoch: get().epoch } }),
  clearPrimary: () => set({ primary: null }),
  setFleet: (vehicleKey, items, groups) => set((s) => ({ fleet: { ...s.fleet, [vehicleKey]: snapshot(items, groups) } })),
  newEpoch: () => set((s) => ({ epoch: s.epoch + 1, primary: null, snapshotOnlyDownload: false })),
  setSnapshotOnlyDownload: (on) => set({ snapshotOnlyDownload: on }),
  applyMirror: (m) => set({ epoch: m.epoch, primary: m.primary, fleet: m.fleet }),
}));

/** The primary vehicle's mission, or null when it is not known for this connection. */
export function currentPrimary(s: Pick<VehicleMissionState, 'epoch' | 'primary'>): VehicleMission | null {
  return s.primary && s.primary.epoch === s.epoch ? s.primary : null;
}

/** 'on-vehicle' only while identical to what the vehicle holds; 'stale-on-vehicle' when it holds an older version. */
export function groupVehicleState(
  s: Pick<VehicleMissionState, 'epoch' | 'primary'>,
  plannerItems: MissionItem[],
  groupId: string,
): 'none' | 'on-vehicle' | 'stale-on-vehicle' {
  const primary = currentPrimary(s);
  const g = primary?.groups.find((x) => x.id === groupId);
  if (!g) return 'none';
  return g.signature === groupSignature(plannerItems, groupId) ? 'on-vehicle' : 'stale-on-vehicle';
}

export interface VehicleMissionPlan {
  id: string;
  color: string;
  /** Fleet vehicle this belongs to; null for the primary vehicle. */
  vehicleKey: string | null;
  items: MissionItem[];
}

const DEFAULT_COLOR = '#38bdf8';

function plansOf(m: VehicleMission, vehicleKey: string | null): VehicleMissionPlan[] {
  const byGroup = new Map<string, MissionItem[]>();
  for (const it of m.items) {
    const key = it.groupId ?? '';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(it);
  }
  return [...byGroup.entries()].map(([gid, items]) => ({
    id: `${vehicleKey ?? 'primary'}:${gid}`,
    color: m.groups.find((g) => g.id === gid)?.color ?? DEFAULT_COLOR,
    vehicleKey,
    items,
  }));
}

/** Everything the telemetry map may draw: the primary vehicle's mission plus each fleet vehicle's. */
export function useVehicleMissionView(): { items: MissionItem[]; plans: VehicleMissionPlan[] } {
  const epoch = useVehicleMissionStore((s) => s.epoch);
  const primary = useVehicleMissionStore((s) => s.primary);
  const fleet = useVehicleMissionStore((s) => s.fleet);
  return useMemo(() => {
    const p = primary && primary.epoch === epoch ? primary : null;
    const plans = [...(p ? plansOf(p, null) : []), ...Object.entries(fleet).flatMap(([k, m]) => plansOf(m, k))];
    return { items: p?.items ?? [], plans };
  }, [epoch, primary, fleet]);
}
