import { memo, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
  Orientation,
  themeDark,
  themeLight,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { useTelemetryStore } from '../../stores/telemetry-store';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { FleetStrip } from '../fleet/FleetStrip';
import { DraggableFleetActions } from '../fleet/DraggableFleetActions';
import { useLayoutStore } from '../../stores/layout-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useTileCacheAreaStore } from '../../stores/tile-cache-area-store';
import { useTelemetryLayoutStore } from '../../stores/telemetry-layout-store';
import { useResolvedTheme } from '../../hooks/useTheme';
import type { TelemetrySpeed } from '../../../shared/ipc-channels';
import { formatAltitudeFromMeters, formatSpeedFromMetersPerSecond } from '../../../shared/user-units.js';

// Reserved layout name for auto-save (separate from user-named layouts)
const TELEMETRY_AUTOSAVE_NAME = '__telemetry_autosave';
import {
  AttitudePanel,
  AltitudePanel,
  SpeedPanel,
  BatteryPanel,
  GpsPanel,
  PositionPanel,
  VelocityPanel,
  FlightModePanel,
  FlightControlPanel,
  MapPanel,
  MessagesPanel,
  SafetyMonitorPanel,
  NtripPanel,
  CameraPanel,
  PreflightCheckCard,
  // Mission panels (for monitoring during flight) - MissionMapPanel removed (merged into MapPanel)
  WaypointTablePanel,
  AltitudeProfilePanel,
  // SITL simulation panels
  SitlEnvironmentDockPanel,
  SitlFailureDockPanel,
  PANEL_COMPONENTS,
} from '../panels';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { useMapInstrumentsStore, resolveInstrumentVisible } from '../../stores/map-instruments-store';
import type { IDockviewHeaderActionsProps } from 'dockview-react';

// Panel component wrapper for dockview. Plain — no decoration. The pop-out
// affordance lives in dockview's header action slot (see PanelPopoutAction
// below), where it's actually discoverable.
function PanelWrapper({ component }: { component: React.ComponentType }) {
  const Component = component;
  return <Component />;
}

/**
 * dockview panel id (camelCase, e.g. "flightControl") → detached
 * component-registry id (kebab, e.g. "flight-control").
 */
const PANEL_ID_TO_DETACHED: Record<string, { componentId: string; defaultBounds?: { width: number; height: number } }> = {
  attitude: { componentId: 'attitude' },
  altitude: { componentId: 'altitude' },
  speed: { componentId: 'speed' },
  battery: { componentId: 'battery' },
  gps: { componentId: 'gps' },
  position: { componentId: 'position' },
  velocity: { componentId: 'velocity' },
  flightMode: { componentId: 'flight-mode' },
  flightControl: { componentId: 'flight-control' },
  map: { componentId: 'map', defaultBounds: { width: 960, height: 720 } },
  camera: { componentId: 'camera', defaultBounds: { width: 960, height: 600 } },
  messages: { componentId: 'messages' },
  safetyMonitor: { componentId: 'safety-monitor', defaultBounds: { width: 420, height: 520 } },
  rtk: { componentId: 'rtk', defaultBounds: { width: 420, height: 560 } },
};

/**
 * Right-aligned action slot in every dockview tab header. Spawns a native
 * Electron BrowserWindow for the active panel via our window manager —
 * NOT dockview's `addPopoutGroup`. Dockview popout requires the parent and
 * child windows to share one renderer process so it can DOM-portal between
 * them; Electron's security model gives each child window its own renderer
 * and the popped window ends up unstyled. Native Electron windows with IPC-
 * driven state are the only reliable path here.
 */
/**
 * Panels that have a floating map-instrument counterpart. The attitude panel
 * is deliberately absent: the attitude ball is MapPanel-local useState, not
 * reachable from this header.
 */
const PANEL_ID_TO_INSTRUMENT: Record<string, string> = {
  battery: 'battery',
  gps: 'gps',
  altitude: 'altitude',
  speed: 'speed',
  position: 'flight-data',
  flightMode: 'flight-mode',
  safetyMonitor: 'annunciator',
  flightControl: 'controls',
};

function PanelHeaderActions(props: IDockviewHeaderActionsProps): JSX.Element | null {
  const active = props.activePanel;
  // Preset panels use the bare id ("map"); panels added via the Add Panel menu
  // get a unique "<id>-<timestamp>". Match either so menu-added panels (e.g.
  // Camera, which is never in a preset) still get a Pop out button.
  const baseId = active
    ? Object.keys(PANEL_ID_TO_DETACHED).find(
        (k) => active.id === k || active.id.startsWith(`${k}-`),
      )
    : undefined;
  const instrumentId = baseId ? PANEL_ID_TO_INSTRUMENT[baseId] : undefined;
  // Hooks stay above the early returns so their order never changes.
  const instrumentVisible = useMapInstrumentsStore((s) =>
    instrumentId ? resolveInstrumentVisible(s.visible, instrumentId) : false,
  );
  const toggleInstrument = useMapInstrumentsStore((s) => s.toggle);
  if (!active) return null;
  const mapping = baseId ? PANEL_ID_TO_DETACHED[baseId] : undefined;
  if (!mapping) return null;
  const title = active.title ?? active.id;

  const handleClick = () => {
    window.electronAPI.openDetachedWindow({
      componentId: mapping.componentId,
      title,
      ...(mapping.defaultBounds !== undefined ? { initialBounds: mapping.defaultBounds } : {}),
    });
  };

  return (
    <>
      {instrumentId && (
        <button
          onClick={() => toggleInstrument(instrumentId)}
          className={`h-7 w-7 mx-0.5 rounded-md inline-flex items-center justify-center transition-colors ${
            instrumentVisible
              ? 'text-blue-500 bg-blue-500/10'
              : 'text-content-secondary hover:text-content hover:bg-surface-raised'
          }`}
          data-tip={instrumentVisible ? 'Hide map instrument' : 'Show as instrument on the map'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 15a8.4 8.4 0 1116.8 0" />
            <path strokeLinecap="round" d="M12 15l3.5-4.5" />
          </svg>
        </button>
      )}
      <button
        onClick={handleClick}
        className="h-7 px-2 mx-0.5 rounded-md inline-flex items-center gap-1.5 text-xs transition-colors text-content-secondary hover:text-content hover:bg-surface-raised"
        title={`Open ${title} in new window`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M14 3h7m0 0v7m0-7L10 14M5 5h4M5 19h14a0 0 0 010 0v-4" />
        </svg>
        <span>Pop out</span>
      </button>
    </>
  );
}

// Component registry for dockview
const components: Record<string, React.FC<IDockviewPanelProps>> = {
  // Telemetry panels
  AttitudePanel: () => <PanelWrapper component={AttitudePanel} />,
  AltitudePanel: () => <PanelWrapper component={AltitudePanel} />,
  SpeedPanel: () => <PanelWrapper component={SpeedPanel} />,
  BatteryPanel: () => <PanelWrapper component={BatteryPanel} />,
  GpsPanel: () => <PanelWrapper component={GpsPanel} />,
  PositionPanel: () => <PanelWrapper component={PositionPanel} />,
  VelocityPanel: () => <PanelWrapper component={VelocityPanel} />,
  FlightModePanel: () => <PanelWrapper component={FlightModePanel} />,
  FlightControlPanel: () => <PanelWrapper component={FlightControlPanel} />,
  MapPanel: () => <PanelWrapper component={MapPanel} />,
  CameraPanel: () => <PanelWrapper component={CameraPanel} />,
  MessagesPanel: () => <PanelWrapper component={MessagesPanel} />,
  SafetyMonitorPanel: () => <PanelWrapper component={SafetyMonitorPanel} />,
  NtripPanel: () => <PanelWrapper component={NtripPanel} />,
  PreflightCheckCard: () => <PanelWrapper component={PreflightCheckCard} />,
  // Mission panels (for monitoring during flight) - readOnly mode
  // Note: MissionMapPanel removed - mission data now integrated into MapPanel
  WaypointTablePanel: () => <WaypointTablePanel readOnly />,
  AltitudeProfilePanel: () => <AltitudeProfilePanel readOnly />,
  // SITL simulation panels
  SitlEnvironmentDockPanel: () => <PanelWrapper component={SitlEnvironmentDockPanel} />,
  SitlFailureDockPanel: () => <PanelWrapper component={SitlFailureDockPanel} />,
};

// Preset layout definitions (pilotView is the default)
const PRESET_LAYOUTS = {
  pilotView: 'Pilot View',
  fpv: 'FPV',
  missionTelemetry: 'Mission Telemetry',
  sitl: 'SITL',
  allPanels: 'All Panels',
} as const;

// The default preset to load when no saved layout exists
const DEFAULT_PRESET: PresetLayoutKey = 'pilotView';

type PresetLayoutKey = keyof typeof PRESET_LAYOUTS;

// Check if a layout name is a preset
function isPresetLayout(name: string): name is PresetLayoutKey {
  return name in PRESET_LAYOUTS;
}

// Pilot View preset. Map on top-left with Flight Control as a bottom bar under
// it, and a compact telemetry stack (Battery, GPS, Altitude, Speed, Position)
// down the right side. Attitude panel omitted since the map renders an attitude
// overlay.
const PILOT_VIEW_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        // Left column: Map on top, Flight Control as a bottom bar under it
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '1' }, size: 640 },
            { type: 'leaf', data: { views: ['flightControl'], activeView: 'flightControl', id: '8' }, size: 240 },
          ],
          size: 900,
        },
        // Right telemetry stack (full height)
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '3' }, size: 180 },
            { type: 'leaf', data: { views: ['gps'], activeView: 'gps', id: '4' }, size: 220 },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '7' }, size: 160 },
                { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '6' }, size: 160 },
              ],
              size: 200,
            },
            { type: 'leaf', data: { views: ['position'], activeView: 'position', id: '5' }, size: 180 },
          ],
          size: 320,
        },
      ],
      size: 880,
    },
    width: 1220,
    height: 880,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' },
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    position: { id: 'position', contentComponent: 'PositionPanel', title: 'Position' },
  },
  activeGroup: '1',
};

// FPV preset. Pilot View plus the Vision panel (live camera or synthetic SITL
// view) beside the map. Map and Vision share the top row, Flight Control spans
// the bottom under both, and the telemetry stack stays on the right.
const FPV_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        // Left area: Map + Vision row on top, Flight Control bar underneath
        {
          type: 'branch',
          data: [
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '1' }, size: 520 },
                { type: 'leaf', data: { views: ['camera'], activeView: 'camera', id: '2' }, size: 420 },
              ],
              size: 640,
            },
            { type: 'leaf', data: { views: ['flightControl'], activeView: 'flightControl', id: '8' }, size: 240 },
          ],
          size: 940,
        },
        // Right telemetry stack (full height)
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '3' }, size: 180 },
            { type: 'leaf', data: { views: ['gps'], activeView: 'gps', id: '4' }, size: 220 },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '7' }, size: 160 },
                { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '6' }, size: 160 },
              ],
              size: 200,
            },
            { type: 'leaf', data: { views: ['position'], activeView: 'position', id: '5' }, size: 180 },
          ],
          size: 320,
        },
      ],
      size: 880,
    },
    width: 1260,
    height: 880,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' },
    camera: { id: 'camera', contentComponent: 'CameraPanel', title: 'Vision' },
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    position: { id: 'position', contentComponent: 'PositionPanel', title: 'Position' },
  },
  activeGroup: '1',
};

// Mission Telemetry preset - Map (with mission overlays) left, Waypoints/Battery top-right, AltProfile/Attitude bottom-right
const MISSION_TELEMETRY_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: { views: ['map'], activeView: 'map', id: '1' },
          size: 807,
        },
        {
          type: 'branch',
          data: [
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['waypoints'], activeView: 'waypoints', id: '3' }, size: 476 },
                { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '4' }, size: 331 },
              ],
              size: 321,
            },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['altitudeProfile'], activeView: 'altitudeProfile', id: '2' }, size: 476 },
                { type: 'leaf', data: { views: ['flightControl'], activeView: 'flightControl', id: '5' }, size: 331 },
              ],
              size: 401,
            },
          ],
          size: 807,
        },
      ],
      size: 722,
    },
    width: 1614,
    height: 722,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' }, // Uses unified MapPanel with mission overlays
    altitudeProfile: { id: 'altitudeProfile', contentComponent: 'AltitudeProfilePanel', title: 'Altitude Profile' },
    waypoints: { id: 'waypoints', contentComponent: 'WaypointTablePanel', title: 'Waypoints' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
  },
  activeGroup: '5',
};

// All Panels preset. Every registered panel laid out at once. Related panels
// that rarely need to be visible together are grouped as tabs (messages group,
// mission group, SITL group) to keep the grid readable. Kept in sync with the
// PANEL_COMPONENTS registry; add new panels here so this stays complete.
const ALL_PANELS_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        // Column 1: flight control + attitude + altitude/speed
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['flightControl'], activeView: 'flightControl', id: '1' }, size: 340 },
            { type: 'leaf', data: { views: ['attitude'], activeView: 'attitude', id: '2' }, size: 220 },
            { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '3' }, size: 150 },
            { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '4' }, size: 150 },
          ],
          size: 240,
        },
        // Column 2: Map + Messages / Pre-flight / Safety Monitor tabs
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '5' }, size: 580 },
            { type: 'leaf', data: { views: ['messages', 'preflightCheck', 'safetyMonitor'], activeView: 'messages', id: '6' }, size: 260 },
          ],
          size: 560,
        },
        // Column 3: system status
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '7' }, size: 200 },
            { type: 'leaf', data: { views: ['gps', 'rtk'], activeView: 'gps', id: '8' }, size: 160 },
            { type: 'leaf', data: { views: ['position'], activeView: 'position', id: '9' }, size: 150 },
            { type: 'leaf', data: { views: ['velocity'], activeView: 'velocity', id: '10' }, size: 150 },
            { type: 'leaf', data: { views: ['flightMode'], activeView: 'flightMode', id: '11' }, size: 150 },
          ],
          size: 220,
        },
        // Column 4: Vision + mission tabs + SITL tabs
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['camera'], activeView: 'camera', id: '12' }, size: 300 },
            { type: 'leaf', data: { views: ['waypoints', 'altitudeProfile'], activeView: 'waypoints', id: '13' }, size: 280 },
            { type: 'leaf', data: { views: ['sitlFailures', 'sitlEnvironment'], activeView: 'sitlFailures', id: '14' }, size: 240 },
          ],
          size: 260,
        },
      ],
      size: 880,
    },
    width: 1280,
    height: 880,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
    attitude: { id: 'attitude', contentComponent: 'AttitudePanel', title: 'Attitude' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' },
    messages: { id: 'messages', contentComponent: 'MessagesPanel', title: 'Messages' },
    preflightCheck: { id: 'preflightCheck', contentComponent: 'PreflightCheckCard', title: 'Pre-flight Checks' },
    safetyMonitor: { id: 'safetyMonitor', contentComponent: 'SafetyMonitorPanel', title: 'Safety Monitor' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    rtk: { id: 'rtk', contentComponent: 'NtripPanel', title: 'RTK / NTRIP' },
    position: { id: 'position', contentComponent: 'PositionPanel', title: 'Position' },
    velocity: { id: 'velocity', contentComponent: 'VelocityPanel', title: 'Velocity' },
    flightMode: { id: 'flightMode', contentComponent: 'FlightModePanel', title: 'Flight Mode' },
    camera: { id: 'camera', contentComponent: 'CameraPanel', title: 'Vision' },
    waypoints: { id: 'waypoints', contentComponent: 'WaypointTablePanel', title: 'Waypoints' },
    altitudeProfile: { id: 'altitudeProfile', contentComponent: 'AltitudeProfilePanel', title: 'Altitude Profile' },
    sitlFailures: { id: 'sitlFailures', contentComponent: 'SitlFailureDockPanel', title: 'SITL Failures' },
    sitlEnvironment: { id: 'sitlEnvironment', contentComponent: 'SitlEnvironmentDockPanel', title: 'SITL Environment' },
  },
  activeGroup: '5',
};

// SITL preset - Map + Messages center, Flight Control + telemetry left, GPS + SITL panels right
const SITL_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        // Left column - core telemetry
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['flightControl'], activeView: 'flightControl', id: '1' }, size: 360 },
            { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '2' }, size: 260 },
            { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '3' }, size: 260 },
          ],
          size: 200,
        },
        // Center - Map + Messages
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '4' }, size: 650 },
            { type: 'leaf', data: { views: ['messages'], activeView: 'messages', id: '5' }, size: 250 },
          ],
          size: 600,
        },
        // Right column - GPS + SITL controls (tabbed)
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['gps'], activeView: 'gps', id: '6' }, size: 200 },
            { type: 'leaf', data: { views: ['sitlFailures', 'sitlEnvironment'], activeView: 'sitlFailures', id: '7' }, size: 700 },
          ],
          size: 280,
        },
      ],
      size: 900,
    },
    width: 1080,
    height: 900,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' },
    messages: { id: 'messages', contentComponent: 'MessagesPanel', title: 'Messages' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    sitlFailures: { id: 'sitlFailures', contentComponent: 'SitlFailureDockPanel', title: 'SITL Failures' },
    sitlEnvironment: { id: 'sitlEnvironment', contentComponent: 'SitlEnvironmentDockPanel', title: 'SITL Environment' },
  },
  activeGroup: '4',
};

// Legacy default layout configuration - Map center, panels on sides (used as fallback)
function createDefaultLayout(api: DockviewApi): void {
  // Main center group - Map (primary view)
  const centerGroup = api.addGroup();
  api.addPanel({
    id: 'map',
    component: 'MapPanel',
    title: 'Map',
    position: { referenceGroup: centerGroup },
  });

  // Left group - Flight control + altitude/speed
  const leftGroup = api.addGroup({ direction: 'left', initialWidth: 260 });
  api.addPanel({
    id: 'flightControl',
    component: 'FlightControlPanel',
    title: 'Flight Control',
    position: { referenceGroup: leftGroup },
  });
  api.addPanel({
    id: 'altitude',
    component: 'AltitudePanel',
    title: 'Altitude',
    position: { referenceGroup: leftGroup, index: 1 },
  });
  api.addPanel({
    id: 'speed',
    component: 'SpeedPanel',
    title: 'Speed',
    position: { referenceGroup: leftGroup, index: 2 },
  });

  // Right group - System status
  const rightGroup = api.addGroup({ direction: 'right', initialWidth: 180 });
  api.addPanel({
    id: 'battery',
    component: 'BatteryPanel',
    title: 'Battery',
    position: { referenceGroup: rightGroup },
  });
  api.addPanel({
    id: 'gps',
    component: 'GpsPanel',
    title: 'GPS',
    position: { referenceGroup: rightGroup, index: 1 },
  });
  api.addPanel({
    id: 'position',
    component: 'PositionPanel',
    title: 'Position',
    position: { referenceGroup: rightGroup, index: 2 },
  });
}

// Load a preset layout by name
function loadPresetLayout(api: DockviewApi, preset: PresetLayoutKey): void {
  switch (preset) {
    case 'pilotView':
      api.fromJSON(PILOT_VIEW_LAYOUT);
      break;
    case 'fpv':
      api.fromJSON(FPV_LAYOUT);
      break;
    case 'missionTelemetry':
      api.fromJSON(MISSION_TELEMETRY_LAYOUT);
      break;
    case 'sitl':
      api.fromJSON(SITL_LAYOUT);
      break;
    case 'allPanels':
      api.fromJSON(ALL_PANELS_LAYOUT);
      break;
    default:
      // Default to Pilot View
      api.fromJSON(PILOT_VIEW_LAYOUT);
      break;
  }
}

interface WorkspaceProps {
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onReset: () => void;
  onAddPanel: (id: string, component: string, title: string) => void;
  layouts: string[];
  activeLayout: string;
  supportsMissionPlanning: boolean;
  isMavlink: boolean;
  isSitlRunning: boolean;
  hasMapPanel: boolean;
}

// Single launcher that lives in the quick-stats bar and opens the Workspace
// dialog. Replaces the old always-on layout toolbar row: everything it carried
// (panel-layout presets, save/reset, offline-map capture, 2D/3D, Add panel)
// now lives one click away, reclaiming a whole bar of vertical space.
function WorkspaceButton(props: WorkspaceProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const activeName = PRESET_LAYOUTS[props.activeLayout as keyof typeof PRESET_LAYOUTS] ?? props.activeLayout;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-tour="telemetry-layout-select"
        data-tip="Workspace: panel layout, view and panels"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-default bg-surface-raised text-content text-xs hover:bg-surface-solid transition-colors shrink-0"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span className="font-medium">Workspace</span>
        <span className="text-content-tertiary max-w-[140px] truncate hidden lg:inline">· {activeName}</span>
      </button>
      {open && <WorkspaceDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

const wsCheck = (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

// One accent per section so the dialog reads in colour blocks like the
// instruments catalog does with its roles. All 600-weight so a white label
// sits legibly on the active fills in both themes.
const WS_ACCENT = { layout: '#2563eb', rate: '#0891b2', view: '#4f46e5', offline: '#059669', panel: '#7c3aed' } as const;

function WsSection({ label, accent, icon, children }: { label: string; accent: string; icon: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="w-[3px] h-3.5 rounded" style={{ background: accent }} />
        <span className="shrink-0" style={{ color: accent }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: accent }}>{label}</span>
      </div>
      {children}
    </section>
  );
}

// White elevated card that lifts on hover; accent border + tint + check when
// it is the active choice. Shared by the layout tiles and the add-panel grid.
function WsCard({ accent, active = false, accentIcon = false, icon, label, onClick, dataTour }: {
  accent: string;
  active?: boolean;
  accentIcon?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  dataTour?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      data-tour={dataTour}
      className="group flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs bg-surface-solid shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
      style={{
        border: '1px solid',
        borderColor: active ? `color-mix(in srgb, ${accent} 55%, var(--border-default))` : 'var(--border-subtle)',
        background: active ? `color-mix(in srgb, ${accent} 8%, var(--bg-surface-solid))` : undefined,
      }}
    >
      <span className={'shrink-0 ' + (active || accentIcon ? '' : 'text-content-tertiary')} style={active || accentIcon ? { color: accent } : undefined}>{icon}</span>
      <span className={'flex-1 min-w-0 truncate ' + (active ? 'text-content font-medium' : 'text-content-secondary group-hover:text-content')}>{label}</span>
      {active && <span style={{ color: accent }}>{wsCheck}</span>}
    </button>
  );
}

// Segmented control (telemetry rate, map view): pill group with an accent-
// filled active segment.
function WsSegment<T extends string>({ options, value, accent, onChange }: {
  options: { value: T; label: string; tip?: string }[];
  value: T;
  accent: string;
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div className="inline-flex rounded-lg border border-default overflow-hidden bg-surface-solid">
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            data-tip={opt.tip}
            className={(i > 0 ? 'border-l border-subtle ' : '') + 'px-4 py-1.5 text-xs font-medium transition-colors ' + (active ? 'text-white' : 'text-content-secondary hover:bg-surface-raised')}
            style={active ? { background: accent } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const WS_ICONS = {
  layout: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>),
  rate: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2 6 4-14 2 8h6" /></svg>),
  view: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>),
  offline: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>),
  panel: (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><path strokeLinecap="round" d="M12 8v8M8 12h8" /></svg>),
} as const;

// A distinct glyph per panel so the Add-panel grid is scannable by shape, not
// just text. Keyed by PANEL_COMPONENTS id; unknown ids fall back to a plus.
const svg = (children: ReactNode) => (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const PANEL_ICONS: Record<string, ReactNode> = {
  attitude: svg(<><circle cx="12" cy="12" r="9" /><path d="M4 12h16" /><path d="M8 9.5l4-2 4 2" /></>),
  altitude: svg(<><path d="M12 20V6" /><path d="M7 11l5-5 5 5" /><path d="M5 20h14" /></>),
  speed: svg(<><path d="M4 16a8 8 0 1116 0" /><path d="M12 16l4-4" /></>),
  battery: svg(<><rect x="3" y="8" width="15" height="8" rx="2" /><path d="M21 11v2" /></>),
  gps: svg(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>),
  position: svg(<><path d="M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
  velocity: svg(<><path d="M3 12h11" /><path d="M10 7l5 5-5 5" /><path d="M19 6v12" /></>),
  flightMode: svg(<><path d="M6 21V4" /><path d="M6 4h11l-2 3.5L17 11H6" /></>),
  flightControl: svg(<><circle cx="12" cy="8" r="3" /><path d="M12 11v7" /><path d="M8 21h8" /></>),
  map: svg(<><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>),
  camera: svg(<><rect x="3" y="6" width="12" height="12" rx="2" /><path d="M15 10l6-3v10l-6-3" /></>),
  messages: svg(<><path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z" /></>),
  safetyMonitor: svg(<><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  rtk: svg(<><path d="M5 12a7 7 0 017-7" /><path d="M5 16a11 11 0 0111-11" /><circle cx="6" cy="18" r="2" fill="currentColor" stroke="none" /></>),
  preflightCheck: svg(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 13l2 2 4-4" /></>),
  waypoints: svg(<><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 16.5C10.5 13 13.5 10 16 7.5" /></>),
  altitudeProfile: svg(<><path d="M4 5v14h16" /><path d="M4 15l4-4 4 3 8-8" /></>),
  sitlEnvironment: svg(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>),
  sitlFailures: svg(<><path d="M10.3 4l-8 14a2 2 0 001.7 3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
};
function panelIcon(id: string): ReactNode {
  return PANEL_ICONS[id] ?? svg(<path d="M12 5v14M5 12h14" />);
}

function WorkspaceDialog(props: WorkspaceProps & { onClose: () => void }): JSX.Element {
  const { onSave, onLoad, onReset, onAddPanel, layouts, activeLayout, supportsMissionPlanning, isMavlink, isSitlRunning, hasMapPanel, onClose } = props;
  const mapMode = useEditModeStore((s) => s.mapMode);
  const setMapMode = useEditModeStore((s) => s.setMapMode);
  const cacheActive = useTileCacheAreaStore((s) => s.active);
  const setCacheActive = useTileCacheAreaStore((s) => s.setActive);
  const telemetrySpeed = useSettingsStore((s) => s.telemetrySpeed);
  const setTelemetrySpeed = useSettingsStore((s) => s.setTelemetrySpeed);
  const [savingName, setSavingName] = useState<string | null>(null);

  const handleSpeedChange = (speed: TelemetrySpeed) => {
    setTelemetrySpeed(speed);
    window.electronAPI?.setTelemetryStreamRate(speed);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const availablePresets = Object.entries(PRESET_LAYOUTS).filter(([key]) => {
    if (key === 'missionTelemetry' && !supportsMissionPlanning) return false;
    if (key === 'sitl' && !isSitlRunning) return false;
    return true;
  });
  const availablePanels = Object.entries(PANEL_COMPONENTS).filter(([id]) => {
    if (MISSION_PANEL_IDS.includes(id) && !supportsMissionPlanning) return false;
    if (MAVLINK_PANEL_IDS.includes(id) && !isMavlink) return false;
    if (SITL_PANEL_IDS.includes(id) && !isSitlRunning) return false;
    return true;
  });

  const commitSave = () => {
    const n = (savingName ?? '').trim();
    if (n) onSave(n);
    setSavingName(null);
  };

  const bookmarkIcon = (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" /></svg>);
  const plusIcon = (<svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>);
  const panelIds = Object.keys(PANEL_COMPONENTS);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-6 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-[600px] max-h-[85vh] flex flex-col rounded-xl bg-surface-solid border border-subtle shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-subtle">
            <svg className="w-4 h-4 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
            <span className="text-sm font-semibold text-content">Workspace</span>
            <button onClick={onClose} data-tip="Close" className="ml-auto p-1.5 rounded text-content-secondary hover:text-content hover:bg-surface-raised transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto p-4 space-y-6 bg-surface-base">
            <WsSection label="Panel layout" accent={WS_ACCENT.layout} icon={WS_ICONS.layout}>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                {availablePresets.map(([key, name]) => (
                  <WsCard key={key} accent={WS_ACCENT.layout} active={key === activeLayout} icon={WS_ICONS.layout} label={name} onClick={() => { onLoad(key); onClose(); }} />
                ))}
                {layouts.map((name) => (
                  <WsCard key={name} accent={WS_ACCENT.layout} active={name === activeLayout} icon={bookmarkIcon} label={name} onClick={() => { onLoad(name); onClose(); }} />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                {savingName === null ? (
                  <button onClick={() => setSavingName('')} className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-subtle text-xs text-content-secondary hover:text-content hover:border-default transition-colors">
                    {plusIcon}
                    Save current as…
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      type="text"
                      value={savingName}
                      placeholder="Layout name"
                      onChange={(e) => setSavingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitSave(); if (e.key === 'Escape') setSavingName(null); }}
                      className="w-40 px-2 py-1 text-xs rounded bg-surface-input border border-default text-content focus:outline-none focus:border-blue-500"
                    />
                    <button onClick={commitSave} disabled={!savingName.trim()} className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">Save</button>
                    <button onClick={() => setSavingName(null)} className="px-2.5 py-1 text-xs rounded border border-subtle text-content-secondary hover:text-content transition-colors">Cancel</button>
                  </div>
                )}
                <button onClick={() => { onReset(); }} className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-subtle text-xs text-content-secondary hover:text-content hover:border-default transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66" /></svg>
                  Reset to preset
                </button>
              </div>
            </WsSection>

            {isMavlink && (
              <WsSection label="Telemetry rate" accent={WS_ACCENT.rate} icon={WS_ICONS.rate}>
                <WsSegment options={SPEED_OPTIONS} value={telemetrySpeed} accent={WS_ACCENT.rate} onChange={handleSpeedChange} />
                <p className="mt-1.5 text-[11px] text-content-tertiary">How often the vehicle streams telemetry. FC leaves the flight controller's own rates untouched.</p>
              </WsSection>
            )}

            {import.meta.env.DEV && (
              <WsSection label="Map view" accent={WS_ACCENT.view} icon={WS_ICONS.view}>
                <WsSegment
                  options={[{ value: '2d', label: '2D map' }, { value: '3d', label: '3D terrain' }]}
                  value={mapMode}
                  accent={WS_ACCENT.view}
                  onChange={(v) => setMapMode(v)}
                />
              </WsSection>
            )}

            {hasMapPanel && (
              <WsSection label="Offline maps" accent={WS_ACCENT.offline} icon={WS_ICONS.offline}>
                <button
                  onClick={() => { setCacheActive(!cacheActive); onClose(); }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs shadow-sm transition-all hover:shadow-md"
                  style={
                    cacheActive
                      ? { background: WS_ACCENT.offline, color: '#fff', border: '1px solid ' + WS_ACCENT.offline }
                      : { border: '1px solid var(--border-subtle)', background: 'var(--bg-surface-solid)', color: 'var(--text-primary)' }
                  }
                >
                  <span style={{ color: cacheActive ? '#fff' : WS_ACCENT.offline }}>{WS_ICONS.offline}</span>
                  {cacheActive ? 'Selecting… draw a box on the map' : 'Save an area for offline use'}
                </button>
                <p className="mt-1.5 text-[11px] text-content-tertiary">Draw a box on the map to cache its tiles for flying without a connection.</p>
              </WsSection>
            )}

            <WsSection label="Add panel" accent={WS_ACCENT.panel} icon={WS_ICONS.panel}>
              <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                {availablePanels.map(([id, { component, title }]) => (
                  <WsCard
                    key={id}
                    accent={WS_ACCENT.panel}
                    accentIcon
                    icon={panelIcon(id)}
                    label={title}
                    onClick={() => onAddPanel(id, component, title)}
                    dataTour={id === panelIds[0] ? 'add-panel' : undefined}
                  />
                ))}
              </div>
            </WsSection>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

// Mission-related panel IDs that require mission planning support
// Note: missionMap removed - now integrated into unified MapPanel
const MISSION_PANEL_IDS = ['waypoints', 'altitudeProfile'];

// MAVLink-only panel IDs (STATUSTEXT doesn't exist in MSP)
const MAVLINK_PANEL_IDS = ['messages', 'preflightCheck', 'safetyMonitor', 'rtk'];

// SITL-only panel IDs (only shown when ArduPilot SITL is running)
const SITL_PANEL_IDS = ['sitlEnvironment', 'sitlFailures'];

// Sensor health warning badge - shows unhealthy sensor names
function SensorHealthWarning({ sensors }: { sensors: string[] }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded"
      title={`Unhealthy: ${sensors.join(', ')} - check Messages panel for details`}
    >
      <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
      </svg>
      <span className="font-mono text-xs text-red-400">{sensors.join(' ')}</span>
    </div>
  );
}

// Telemetry speed selector labels
const SPEED_OPTIONS: { value: TelemetrySpeed; label: string; tip: string }[] = [
  { value: 'fc', label: 'FC', tip: 'Hands off: ArduDeck never asks for different data rates. The vehicle keeps sending at the rates saved on the flight controller. Pick this if you tuned those rates yourself.' },
  { value: 'eco', label: 'Eco', tip: 'Slow updates: easy on weak or long-range telemetry links' },
  { value: 'normal', label: 'Normal', tip: 'Balanced update speed, good for most links' },
  { value: 'max', label: 'Max', tip: 'Fastest updates, for fast links like USB or WiFi' },
];

// Quick stats bar
function QuickStatsBar({ trailing }: { trailing?: ReactNode }) {
  const flight = useTelemetryStore((s) => s.flight);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const battery = useTelemetryStore((s) => s.battery);
  const gps = useTelemetryStore((s) => s.gps);
  const sensorHealth = useTelemetryStore((s) => s.sensorHealth);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  // Without a link the store holds zero-defaults; painting those red reads as
  // a failing vehicle instead of "not connected", so show neutral dashes.
  // Fleet/swarm links never set connectionState.isConnected (background
  // transports), so mirror App's "fleet exists = connected" rule; otherwise the
  // bar would dash out live fleet telemetry.
  const fleetVehicleCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  const connected = connectionState.isConnected || fleetVehicleCount > 0;
  const batteryColor = !connected || battery.remaining < 0 ? 'text-content-secondary' : battery.remaining > 30 ? 'text-emerald-400' : battery.remaining > 15 ? 'text-amber-500' : 'text-red-400';

  // GPS satellite color
  const satColor = !connected ? 'text-content-secondary' : gps.fixType >= 3 ? 'text-emerald-400' : gps.fixType >= 2 ? 'text-amber-500' : 'text-red-400';
  const stat = (v: string) => (connected ? v : '--');

  // Unhealthy sensors from SYS_STATUS
  const unhealthySensors: string[] = [];
  if (sensorHealth) {
    const { present, health } = sensorHealth;
    const check = (bit: number, name: string) => {
      if ((present & bit) && !(health & bit)) unhealthySensors.push(name);
    };
    check(0x20, 'GPS');
    check(0x04, 'MAG');
    check(0x08, 'BARO');
    check(0x02, 'ACC');
    check(0x01, 'GYR');
  }

  return (
    <div className={`shrink-0 px-4 py-2 flex items-center justify-between border-b ${
      flight.armed
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-surface border-subtle'
    }`}>
      <div className="flex items-center gap-3">
        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide ${
          flight.armed && connected ? 'bg-red-500 text-white' : 'bg-surface-raised text-content-secondary'
        }`}>
          {!connected ? 'No Link' : flight.armed ? 'Armed' : 'Disarmed'}
        </span>
        <span className={`text-lg font-medium ${connected ? 'text-content' : 'text-content-tertiary'}`}>
          {connected ? flight.mode : 'Not connected'}
        </span>
      </div>
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">HDG</span>
          <span className="font-mono text-sm text-content">{stat(`${vfrHud.heading.toFixed(0)}°`)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">ALT</span>
          <span className="font-mono text-sm text-content">{stat(formatAltitudeFromMeters(vfrHud.alt, altitudeUnit))}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">SPD</span>
          <span className="font-mono text-sm text-content">{stat(formatSpeedFromMetersPerSecond(vfrHud.groundspeed, speedUnit))}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">THR</span>
          <span className="font-mono text-sm text-content">{stat(`${vfrHud.throttle}%`)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">BAT</span>
          <span className={`font-mono text-sm ${batteryColor}`}>{stat(`${battery.voltage.toFixed(1)}V`)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">SAT</span>
          <span className={`font-mono text-sm ${satColor}`}>{stat(String(gps.satellites))}</span>
        </div>
        {unhealthySensors.length > 0 && (
          <SensorHealthWarning sensors={unhealthySensors} />
        )}
        {trailing && (
          <>
            <div className="w-px h-5 bg-subtle ml-1" />
            {trailing}
          </>
        )}
      </div>
    </div>
  );
}

function TelemetryDashboardImpl() {
  const resolvedTheme = useResolvedTheme();
  const apiRef = useRef<DockviewApi | null>(null);
  const { layouts, activeLayoutName, loadLayouts, saveLayout, setActiveLayout } = useLayoutStore();
  const connectionState = useConnectionStore((s) => s.connectionState);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [hasMapPanel, setHasMapPanel] = useState(true);

  // Check if mission planning is supported
  // Betaflight (BTFL) and Cleanflight (CLFL) do NOT support missions
  // iNav (INAV) and MAVLink (ArduPilot) DO support missions
  const isMspBetaflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'BTFL';
  const isMspCleanflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'CLFL';
  const supportsMissionPlanning = !isMspBetaflight && !isMspCleanflight;

  // Check if ArduPilot SITL is running (for SITL-only panels)
  const isSitlRunning = useArduPilotSitlStore((s) => s.isRunning);

  // Load layouts on mount
  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  // Auto-save layout when it changes
  useEffect(() => {
    if (!apiRef.current || !layoutLoaded) return;

    const handleLayoutChange = () => {
      const api = apiRef.current;
      if (!api) return;
      window.electronAPI?.saveLayout(TELEMETRY_AUTOSAVE_NAME, api.toJSON());
      const mapPresent = api.panels.some((p) => p.id === 'map' || p.id.startsWith('map-'));
      setHasMapPanel(mapPresent);
      // Caching needs the map; close the mode if the panel is gone.
      if (!mapPresent) useTileCacheAreaStore.getState().setActive(false);
    };

    handleLayoutChange();
    // Subscribe to layout changes
    const disposable = apiRef.current.onDidLayoutChange(handleLayoutChange);

    return () => {
      disposable.dispose();
    };
  }, [layoutLoaded]);

  const onReady = useCallback(async (event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    // First, try to load auto-saved layout (most recent state)
    try {
      const autoSaved = await window.electronAPI?.getLayout(TELEMETRY_AUTOSAVE_NAME);
      if (autoSaved?.data) {
        event.api.fromJSON(autoSaved.data as SerializedDockview);
        setLayoutLoaded(true);
        return;
      }
    } catch (e) {
      console.warn('Failed to load auto-saved layout:', e);
    }

    // Fall back to named layout from store
    const savedLayout = layouts[activeLayoutName];
    if (savedLayout?.data) {
      try {
        event.api.fromJSON(savedLayout.data as SerializedDockview);
        setLayoutLoaded(true);
        return;
      } catch (e) {
        console.warn('Failed to load saved layout, using default:', e);
      }
    }

    // Create default layout (Pilot View)
    loadPresetLayout(event.api, DEFAULT_PRESET);
    setLayoutLoaded(true);
  }, [layouts, activeLayoutName]);

  const handleSaveLayout = useCallback(async (name: string) => {
    if (!apiRef.current) return;
    const data = apiRef.current.toJSON();
    await saveLayout(name, data);
    await setActiveLayout(name);
  }, [saveLayout, setActiveLayout]);

  const handleLoadLayout = useCallback(async (name: string) => {
    if (!apiRef.current) return;
    await setActiveLayout(name);

    // Check if it's a preset layout
    if (isPresetLayout(name)) {
      apiRef.current.clear();
      loadPresetLayout(apiRef.current, name);
      return;
    }

    // Otherwise load from saved layouts
    const layout = layouts[name];
    if (layout?.data) {
      try {
        apiRef.current.fromJSON(layout.data as SerializedDockview);
      } catch (e) {
        console.warn('Failed to load layout:', e);
        apiRef.current.clear();
        loadPresetLayout(apiRef.current, DEFAULT_PRESET);
      }
    } else {
      apiRef.current.clear();
      loadPresetLayout(apiRef.current, DEFAULT_PRESET);
    }
  }, [layouts, setActiveLayout]);

  const handleResetLayout = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.clear();
    loadPresetLayout(apiRef.current, DEFAULT_PRESET);
  }, []);

  const handleAddPanel = useCallback((id: string, component: string, title: string) => {
    if (!apiRef.current) return;

    // Generate unique panel id (in case the panel is already open)
    const uniqueId = `${id}-${Date.now()}`;

    // Add panel to the currently active group or create new one
    apiRef.current.addPanel({
      id: uniqueId,
      component,
      title,
    });
  }, []);

  // Expose a tour-facing bridge so the tour manager can check/provision panels.
  useEffect(() => {
    const setBridge = useTelemetryLayoutStore.getState().setBridge;
    setBridge({
      hasPanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return false;
        // Preset layouts use panelId as the panel id directly.
        // User-added panels use `${panelId}-${timestamp}`.
        return api.panels.some(
          (p) => p.id === panelId || p.id.startsWith(`${panelId}-`),
        );
      },
      addPanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return;
        const entry = PANEL_COMPONENTS[panelId as keyof typeof PANEL_COMPONENTS];
        if (!entry) return;
        const uniqueId = `${panelId}-${Date.now()}`;
        const panel = api.addPanel({
          id: uniqueId,
          component: entry.component,
          title: entry.title,
        });
        // Make sure the new panel's tab is the active one in its group,
        // otherwise it renders hidden and selectors won't find it.
        panel?.api.setActive();
      },
      activatePanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return;
        const existing = api.panels.find(
          (p) => p.id === panelId || p.id.startsWith(`${panelId}-`),
        );
        existing?.api.setActive();
      },
      loadPreset: (presetKey) => {
        if (!apiRef.current || !isPresetLayout(presetKey)) return;
        apiRef.current.clear();
        loadPresetLayout(apiRef.current, presetKey);
      },
    });
    return () => {
      useTelemetryLayoutStore.getState().setBridge(null);
    };
  }, [handleAddPanel]);

  return (
    <div className="h-full flex flex-col">
      {/* Quick stats bar, now also home to the single Workspace launcher that
          replaced the old always-on layout toolbar row. */}
      <QuickStatsBar
        trailing={
          <WorkspaceButton
            onSave={handleSaveLayout}
            onLoad={handleLoadLayout}
            onReset={handleResetLayout}
            onAddPanel={handleAddPanel}
            layouts={Object.keys(layouts).filter(name => !name.startsWith('__'))}
            activeLayout={activeLayoutName}
            supportsMissionPlanning={supportsMissionPlanning}
            isMavlink={connectionState.protocol === 'mavlink'}
            isSitlRunning={isSitlRunning}
            hasMapPanel={hasMapPanel}
          />
        }
      />

      {/* Fleet strip (left) + dockview container. The strip renders nothing for
          a single vehicle, so single-vehicle layout is unchanged. */}
      <div className="flex-1 flex flex-row min-h-0">
        <FleetStrip />
        <div className="flex-1 min-w-0">
          <DockviewReact
            components={components}
            onReady={onReady}
            theme={resolvedTheme === 'light' ? themeLight : themeDark}
            rightHeaderActionsComponent={PanelHeaderActions}
            className="h-full"
          />
        </div>
      </div>
      <DraggableFleetActions />
    </div>
  );
}

// Memo boundary: App re-renders for many reasons (connection, params, nav);
// this panel only depends on its own narrowed store selections, so it must not
// reconcile just because the root did. Props are empty, so a plain memo suffices.
export const TelemetryDashboard = memo(TelemetryDashboardImpl);
