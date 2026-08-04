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

export const PRESET_INSTRUMENT_LAYOUTS: PresetInstrumentLayout[] = [
  { name: 'Pilot cockpit', layout: PILOT_COCKPIT },
  { name: 'Minimal', layout: MINIMAL },
];
