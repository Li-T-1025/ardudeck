export { AttitudePanel, AttitudeIndicator } from './AttitudePanel';
export { AltitudePanel } from './AltitudePanel';
export { SpeedPanel } from './SpeedPanel';
export { BatteryPanel } from './BatteryPanel';
export { GpsPanel } from './GpsPanel';
export { PositionPanel } from './PositionPanel';
export { VelocityPanel } from './VelocityPanel';
export { FlightModePanel } from './FlightModePanel';
export { FlightControlPanel } from './FlightControlPanel';
export { MapPanel } from './MapPanel';
export { MessagesPanel } from './MessagesPanel';
export { SafetyMonitorPanel } from './SafetyMonitorPanel';
export { NtripPanel } from './NtripPanel';
export { PreflightCheckCard } from '../prearm/PreflightCheckCard';
export { CameraPanel } from '../camera/CameraPanel';

// Re-export mission panels for use in telemetry dashboard
// Note: MissionMapPanel not exported here - mission data now integrated into MapPanel
export { WaypointTablePanel } from '../mission/WaypointTablePanel';
export { AltitudeProfilePanel } from '../mission/AltitudeProfilePanel';

// SITL simulation panels
export { SitlEnvironmentDockPanel } from './SitlEnvironmentDockPanel';
export { SitlFailureDockPanel } from './SitlFailureDockPanel';

// Panel registry for dockview
export const PANEL_COMPONENTS = {
  // Telemetry panels
  attitude: { component: 'AttitudePanel', title: 'Attitude' },
  altitude: { component: 'AltitudePanel', title: 'Altitude' },
  speed: { component: 'SpeedPanel', title: 'Speed' },
  battery: { component: 'BatteryPanel', title: 'Battery' },
  gps: { component: 'GpsPanel', title: 'GPS' },
  position: { component: 'PositionPanel', title: 'Position' },
  velocity: { component: 'VelocityPanel', title: 'Velocity' },
  flightMode: { component: 'FlightModePanel', title: 'Flight Mode' },
  flightControl: { component: 'FlightControlPanel', title: 'Flight Control' },
  map: { component: 'MapPanel', title: 'Map' }, // Unified map with mission overlays
  camera: { component: 'CameraPanel', title: 'Vision' },
  messages: { component: 'MessagesPanel', title: 'Messages' },
  safetyMonitor: { component: 'SafetyMonitorPanel', title: 'Safety Monitor' },
  rtk: { component: 'NtripPanel', title: 'RTK / NTRIP' },
  preflightCheck: { component: 'PreflightCheckCard', title: 'Pre-flight Checks' },
  // Mission panels (for monitoring during flight)
  // Note: missionMap removed - mission data now integrated into unified MapPanel
  waypoints: { component: 'WaypointTablePanel', title: 'Waypoints' },
  altitudeProfile: { component: 'AltitudeProfilePanel', title: 'Altitude Profile' },
  // SITL simulation panels (only shown when SITL is running)
  sitlEnvironment: { component: 'SitlEnvironmentDockPanel', title: 'SITL Environment' },
  sitlFailures: { component: 'SitlFailureDockPanel', title: 'SITL Failures' },
} as const;

export type PanelId = keyof typeof PANEL_COMPONENTS;

// Actual component for each panel id, for callers that render a panel inline
// (e.g. MapPanel's in-map split second surface) rather than through dockview's
// string-keyed registry. Every panel is rendered prop-free, so the value is a
// plain component. `map` is intentionally absent: nothing embeds the map inside
// another panel. Keep this in sync with PANEL_COMPONENTS.
import type { ComponentType } from 'react';
import { AttitudePanel as AttitudePanelC } from './AttitudePanel';
import { AltitudePanel as AltitudePanelC } from './AltitudePanel';
import { SpeedPanel as SpeedPanelC } from './SpeedPanel';
import { BatteryPanel as BatteryPanelC } from './BatteryPanel';
import { GpsPanel as GpsPanelC } from './GpsPanel';
import { PositionPanel as PositionPanelC } from './PositionPanel';
import { VelocityPanel as VelocityPanelC } from './VelocityPanel';
import { FlightModePanel as FlightModePanelC } from './FlightModePanel';
import { FlightControlPanel as FlightControlPanelC } from './FlightControlPanel';
import { MessagesPanel as MessagesPanelC } from './MessagesPanel';
import { SafetyMonitorPanel as SafetyMonitorPanelC } from './SafetyMonitorPanel';
import { NtripPanel as NtripPanelC } from './NtripPanel';
import { PreflightCheckCard as PreflightCheckCardC } from '../prearm/PreflightCheckCard';
import { CameraPanel as CameraPanelC } from '../camera/CameraPanel';
import { WaypointTablePanel as WaypointTablePanelC } from '../mission/WaypointTablePanel';
import { AltitudeProfilePanel as AltitudeProfilePanelC } from '../mission/AltitudeProfilePanel';
import { SitlEnvironmentDockPanel as SitlEnvironmentDockPanelC } from './SitlEnvironmentDockPanel';
import { SitlFailureDockPanel as SitlFailureDockPanelC } from './SitlFailureDockPanel';

export const PANEL_RENDERERS: Partial<Record<PanelId, ComponentType>> = {
  attitude: AttitudePanelC,
  altitude: AltitudePanelC,
  speed: SpeedPanelC,
  battery: BatteryPanelC,
  gps: GpsPanelC,
  position: PositionPanelC,
  velocity: VelocityPanelC,
  flightMode: FlightModePanelC,
  flightControl: FlightControlPanelC,
  camera: CameraPanelC,
  messages: MessagesPanelC,
  safetyMonitor: SafetyMonitorPanelC,
  rtk: NtripPanelC,
  preflightCheck: PreflightCheckCardC,
  waypoints: WaypointTablePanelC,
  altitudeProfile: AltitudeProfilePanelC,
  sitlEnvironment: SitlEnvironmentDockPanelC,
  sitlFailures: SitlFailureDockPanelC,
};
