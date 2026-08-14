/**
 * Event message. Each new event from a particular component gets a new sequence number. The same message might be sent multiple times if (re-)requested. Most events are broadcast, some can be specific to a target component (as receivers keep track of the sequence for missed events, all events need to be broadcast. Thus we use destination_component instead of target_component).
 * Message ID: 410
 * CRC Extra: 160
 */
export interface Event {
  /** Component ID */
  destinationComponent: number;
  /** System ID */
  destinationSystem: number;
  /** Event ID (as defined in the component metadata) */
  id: number;
  /** Timestamp (time since system boot when the event happened). (ms) */
  eventTimeBootMs: number;
  /** Sequence number. */
  sequence: number;
  /** Log levels: 4 bits MSB: internal (for logging purposes), 4 bits LSB: external. Levels: Emergency = 0, Alert = 1, Critical = 2, Error = 3, Warning = 4, Notice = 5, Info = 6, Debug = 7, Protocol = 8, Disabled = 9 */
  logLevels: number;
  /** Arguments (depend on event ID). */
  arguments: number[];
}

export const EVENT_ID = 410;
export const EVENT_CRC_EXTRA = 160;
export const EVENT_MIN_LENGTH = 53;
export const EVENT_MAX_LENGTH = 53;

export function serializeEvent(msg: Event): Uint8Array {
  const buffer = new Uint8Array(53);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.id, true);
  view.setUint32(4, msg.eventTimeBootMs, true);
  view.setUint16(8, msg.sequence, true);
  buffer[10] = msg.destinationComponent & 0xff;
  buffer[11] = msg.destinationSystem & 0xff;
  buffer[12] = msg.logLevels & 0xff;
  // Array: arguments
  for (let i = 0; i < 40; i++) {
    buffer[13 + i * 1] = msg.arguments[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeEvent(payload: Uint8Array): Event {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    id: view.getUint32(0, true),
    eventTimeBootMs: view.getUint32(4, true),
    sequence: view.getUint16(8, true),
    destinationComponent: payload[10],
    destinationSystem: payload[11],
    logLevels: payload[12],
    arguments: Array.from({ length: 40 }, (_, i) => payload[13 + i * 1]),
  };
}