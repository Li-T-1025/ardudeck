import type { FenceBudget } from '@ardudeck/module-sdk';
import type { ArduPilotVehicleClass } from '../../shared/telemetry-types';

interface FenceShapes { polygons: { vertices: unknown[] }[]; circles: unknown[]; returnPoint: unknown }

/** StorageManager.cpp (ArduPilot master): Copter and Sub 48 + 256 + 256 bytes, every other vehicle 160 + 256 + 256. */
export function fenceCapacityBytes(vehicleClass: ArduPilotVehicleClass): number {
  return vehicleClass === 'copter' || vehicleClass === 'sub' ? 560 : 672;
}

/** AC_PolyFence_loader::fence_storage_space_required plus the 4 byte header. */
export function fenceBytes(g: FenceShapes): number {
  let bytes = 4;
  for (const p of g.polygons) bytes += 2 + 8 * p.vertices.length;
  bytes += 13 * g.circles.length;
  if (g.returnPoint != null) bytes += 9;
  return bytes;
}

export function fenceBudgetFor(vehicleClass: ArduPilotVehicleClass, g: FenceShapes): FenceBudget {
  return { capacityBytes: fenceCapacityBytes(vehicleClass), usedBytes: fenceBytes(g), bytesPerVertex: 8, bytesPerPolygon: 2 };
}
