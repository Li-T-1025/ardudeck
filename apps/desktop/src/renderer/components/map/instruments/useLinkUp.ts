/**
 * Whether the vehicle counts as linked for instrument purposes. Fleet/swarm
 * links never set connectionState.isConnected, so a known fleet vehicle also
 * counts as a link; without any link the telemetry store holds zero-defaults
 * and gauges dash out rather than painting those as live values.
 *
 * Lives on its own so both the registry and the compact readouts share one
 * definition instead of a circular import between them.
 */
import { useConnectionStore } from '../../../stores/connection-store';
import { useActiveVehicleStore } from '../../../stores/active-vehicle-store';

export function useLinkUp(): boolean {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const fleetVehicleCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  return isConnected || fleetVehicleCount > 0;
}
