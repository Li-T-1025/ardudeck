import { useFleetVehicles } from '../../hooks/useFleet';
import { useTelemetryStore } from '../../stores/telemetry-store';

/** The tribute is decoration and must never cover a live vehicle. */
export function useAnyVehicleArmed(): boolean {
  const primaryArmed = useTelemetryStore((s) => s.flight.armed);
  const fleet = useFleetVehicles();
  return primaryArmed || fleet.some((v) => v.armed);
}
