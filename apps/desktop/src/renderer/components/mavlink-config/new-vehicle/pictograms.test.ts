import { describe, expect, it } from 'vitest';
import { PICTOGRAM_IDS } from './pictograms';
import { choiceOptions } from '../../../../shared/vehicle-setup/choices';
import { PLANS } from '../../../../shared/vehicle-setup/plans';
import type { SetupStepId, SetupVehicle } from '../../../../shared/vehicle-setup/types';

describe('pictograms', () => {
  it('every option card in every plan has one', () => {
    const have = new Set(PICTOGRAM_IDS);
    const missing: string[] = [];
    for (const [veh, steps] of Object.entries(PLANS) as [SetupVehicle, readonly SetupStepId[]][]) {
      for (const step of steps) {
        for (const variant of [{}, { vtolType: 'tail' as const }]) {
          const ns = step === 'drive' ? `drive${veh === 'boat' ? 'Boat' : 'Rover'}` : step === 'airframe' && veh === 'vtol' && variant.vtolType === 'tail' ? 'airframeTail' : step;
          for (const id of choiceOptions(step, veh, variant)) if (!have.has(`${ns}.${id}`)) missing.push(`${ns}.${id}`);
        }
      }
    }
    for (const id of ['tailsitter.dual', 'tailsitter.single', 'tailsitter.copter', 'aileron.y', 'aileron.two', 'monitor.4', 'monitor.3', 'monitor.8', 'monitor.9']) if (!have.has(id)) missing.push(id);
    expect(missing).toEqual([]);
  });
});
