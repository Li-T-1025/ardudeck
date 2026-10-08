import { describe, it, expect, beforeEach } from 'vitest';
import { useVehicleMissionStore, currentPrimary, groupVehicleState } from './vehicle-mission-store';
import type { MissionItem } from '../../shared/mission-types';
import type { Group } from '../../shared/mission-group-types';

function wp(seq: number, groupId: string, lat = 47 + seq / 1000): MissionItem {
  return { seq, frame: 3, command: 16, current: false, autocontinue: true, param1: 0, param2: 0, param3: 0, param4: 0, latitude: lat, longitude: 8, altitude: 50, groupId } as MissionItem;
}
const group = (id: string): Group => ({ id, name: id, kind: 'manual', color: '#fff', visible: true, collapsed: false, order: 0, createdAt: 0, updatedAt: 0 } as Group);

describe('vehicle mission', () => {
  beforeEach(() => useVehicleMissionStore.setState({ epoch: 0, primary: null, fleet: {}, snapshotOnlyDownload: false }));

  it('keeps the vehicle order: seq is the index the autopilot reports', () => {
    useVehicleMissionStore.getState().setPrimary([wp(7, 'a'), wp(5, 'a'), wp(9, 'b')], [group('a'), group('b')]);
    const p = currentPrimary(useVehicleMissionStore.getState())!;
    expect(p.items.map((i) => i.seq)).toEqual([0, 1, 2]);
    expect(p.items.map((i) => i.groupId)).toEqual(['a', 'a', 'b']);
  });

  it('a group is on the vehicle only while identical, and only for this connection', () => {
    const planner = [wp(0, 'a'), wp(1, 'a')];
    useVehicleMissionStore.getState().setPrimary(planner, [group('a')]);
    const s = () => useVehicleMissionStore.getState();
    expect(groupVehicleState(s(), planner, 'a')).toBe('on-vehicle');
    const edited = [wp(0, 'a'), wp(1, 'a', 48)];
    expect(groupVehicleState(s(), edited, 'a')).toBe('stale-on-vehicle');
    expect(groupVehicleState(s(), planner, 'other')).toBe('none');
    s().newEpoch();
    expect(currentPrimary(s())).toBeNull();
    expect(groupVehicleState(s(), planner, 'a')).toBe('none');
  });
});
