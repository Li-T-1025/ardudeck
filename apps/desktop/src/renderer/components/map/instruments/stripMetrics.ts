/**
 * Shared sizing metrics for the map instruments, in their own dependency-free
 * module so both CompactReadout and the registry/InstrumentStrip can import
 * them without forming an import cycle.
 */

/** Height of a compact strip readout, so a row of them reads as one band. */
export const STRIP_HEIGHT = 30;

/** One width for every rectangular card panel (flight data, flight mode, link,
 * mission, annunciator) so they line up when stacked at 100% scale. Sized to
 * the widest (the annunciator's three-column lamp grid). */
export const PANEL_WIDTH = 208;
