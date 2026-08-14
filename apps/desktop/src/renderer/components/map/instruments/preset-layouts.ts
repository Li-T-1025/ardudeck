/**
 * Built-in instrument layouts offered in the Instruments menu next to the
 * user's saved ones. Positions are anchor payloads (see useDraggableOverlay
 * v3), so they are resolution independent: bottom-anchored rows keep their
 * distance from the bottom edge and center offsets keep the cluster shape on
 * any panel size. To bake in a user-made layout, copy it from localStorage
 * key `map-instrument-layouts` and paste the snapshot here.
 */
import type { InstrumentLayoutSnapshot } from '../../../stores/map-instruments-store';

export interface PresetInstrumentLayout {
  name: string;
  layout: InstrumentLayoutSnapshot;
}

/** Classic cockpit: gauge row flanking the attitude ball along the bottom,
 * status strips across the top, flight data and annunciator on the left. */
const PILOT_COCKPIT: InstrumentLayoutSnapshot = {
  visible: {
    attitude: true,
    'flight-data': true,
    battery: true,
    gps: true,
    altitude: true,
    speed: true,
    heading: true,
    vsi: true,
    home: false,
    'flight-mode': true,
    link: true,
    mission: true,
    annunciator: true,
  },
  scale: {},
  opacity: 1,
  positions: {
    'instrument:attitude': { ax: 'center', ay: 'bottom', dx: 0, dy: 4, v: 4 },
    'instrument:heading': { ax: 'center', ay: 'bottom', dx: -366, dy: 18, v: 4 },
    'instrument:altitude': { ax: 'center', ay: 'bottom', dx: -252, dy: 18, v: 4 },
    'instrument:gps': { ax: 'center', ay: 'bottom', dx: -138, dy: 18, v: 4 },
    'instrument:speed': { ax: 'center', ay: 'bottom', dx: 138, dy: 18, v: 4 },
    'instrument:vsi': { ax: 'center', ay: 'bottom', dx: 252, dy: 18, v: 4 },
    'instrument:battery': { ax: 'center', ay: 'bottom', dx: 366, dy: 18, v: 4 },
    'instrument:flight-mode': { ax: 'center', ay: 'top', dx: -230, dy: 10, v: 4 },
    'instrument:mission': { ax: 'center', ay: 'top', dx: 0, dy: 10, v: 4 },
    'instrument:link': { ax: 'center', ay: 'top', dx: 210, dy: 10, v: 4 },
    'instrument:flight-data': { ax: 'left', ay: 'middle', dx: 10, dy: -110, v: 4 },
    'instrument:annunciator': { ax: 'left', ay: 'middle', dx: 10, dy: 60, v: 4 },
  },
};

/** Minimal: just the attitude ball, flight data card and the status strips. */
const MINIMAL: InstrumentLayoutSnapshot = {
  visible: {
    attitude: true,
    'flight-data': true,
    battery: false,
    gps: false,
    altitude: false,
    speed: false,
    heading: false,
    vsi: false,
    home: false,
    'flight-mode': true,
    link: false,
    mission: true,
    annunciator: false,
  },
  scale: {},
  opacity: 1,
  positions: {
    'instrument:attitude': { ax: 'center', ay: 'bottom', dx: 0, dy: 4, v: 4 },
    'instrument:flight-mode': { ax: 'center', ay: 'top', dx: -120, dy: 10, v: 4 },
    'instrument:mission': { ax: 'center', ay: 'top', dx: 110, dy: 10, v: 4 },
    'instrument:flight-data': { ax: 'left', ay: 'bottom', dx: 8, dy: 8, v: 4 },
  },
};

/** Strips only: the scalar gauges as compact strips banked across the top, the
 * attitude ball and flight-control card at the bottom. Baked in from a
 * user-exported layout (Ruben's "Strips Only"). */
const STRIPS_ONLY: InstrumentLayoutSnapshot = {
  visible: {
    attitude: true,
    'flight-data': false,
    battery: true,
    gps: true,
    altitude: true,
    speed: true,
    heading: true,
    vsi: true,
    home: true,
    'flight-mode': true,
    link: true,
    mission: true,
    annunciator: false,
    controls: true,
  },
  scale: { battery: 1, gps: 1, speed: 1, heading: 1, altitude: 1, vsi: 1, annunciator: 1.5, home: 1 },
  opacity: 1,
  instrumentOpacity: { altitude: 1, controls: 1, annunciator: 0.84, 'flight-data': 0.5 },
  displayMode: {
    altitude: 'strip',
    vsi: 'strip',
    battery: 'strip',
    gps: 'strip',
    heading: 'strip',
    link: 'strip',
    speed: 'strip',
    home: 'strip',
  },
  positions: {
    'instrument:attitude': { ax: 'center', ay: 'bottom', dx: 18, dy: 11, v: 4 },
    'instrument:flight-data': { ax: 'left', ay: 'top', dx: 0, dy: 40, v: 4 },
    'instrument:battery': { ax: 'center', ay: 'top', dx: -181.5, dy: 8, v: 4 },
    'instrument:gps': { ax: 'center', ay: 'top', dx: -378.5, dy: 8, v: 4 },
    'instrument:altitude': { ax: 'center', ay: 'top', dx: 346, dy: 8, v: 4 },
    'instrument:speed': { ax: 'center', ay: 'top', dx: 460.5, dy: 8, v: 4 },
    'instrument:heading': { ax: 'center', ay: 'top', dx: 3.5, dy: 8, v: 4 },
    'instrument:vsi': { ax: 'right', ay: 'top', dx: 103, dy: 8, v: 4 },
    'instrument:home': { ax: 'center', ay: 'top', dx: 7, dy: 48, v: 4 },
    'instrument:flight-mode': { ax: 'left', ay: 'middle', dx: 8, dy: -160.5, v: 4 },
    'instrument:link': { ax: 'center', ay: 'top', dx: 190.5, dy: 8, v: 4 },
    'instrument:mission': { ax: 'left', ay: 'middle', dx: 8, dy: -100.5, v: 4 },
    'instrument:annunciator': { ax: 'left', ay: 'bottom', dx: 0, dy: 118, v: 4 },
    'instrument:controls': { ax: 'left', ay: 'bottom', dx: 0, dy: 0, v: 4 },
  },
};

export const PRESET_INSTRUMENT_LAYOUTS: PresetInstrumentLayout[] = [
  { name: 'Pilot cockpit', layout: PILOT_COCKPIT },
  { name: 'Minimal', layout: MINIMAL },
  { name: 'Strips only', layout: STRIPS_ONLY },
];
