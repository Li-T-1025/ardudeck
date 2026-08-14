/**
 * Regular broadcast for the current latest event sequence number for a component. This is used to check for dropped events.
 * Message ID: 411
 * CRC Extra: 106
 */
export interface CurrentEventSequence {
  /** Sequence number. */
  sequence: number;
  /** Flag bitset. */
  flags: number;
}

export const CURRENT_EVENT_SEQUENCE_ID = 411;
export const CURRENT_EVENT_SEQUENCE_CRC_EXTRA = 106;
export const CURRENT_EVENT_SEQUENCE_MIN_LENGTH = 3;
export const CURRENT_EVENT_SEQUENCE_MAX_LENGTH = 3;

export function serializeCurrentEventSequence(msg: CurrentEventSequence): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.sequence, true);
  buffer[2] = msg.flags & 0xff;

  return buffer;
}

export function deserializeCurrentEventSequence(payload: Uint8Array): CurrentEventSequence {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sequence: view.getUint16(0, true),
    flags: payload[2],
  };
}