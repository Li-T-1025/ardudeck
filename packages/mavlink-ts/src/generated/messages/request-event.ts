/**
 * Request one or more events to be (re-)sent. If first_sequence==last_sequence, only a single event is requested. Note that first_sequence can be larger than last_sequence (because the sequence number can wrap). Each sequence will trigger an EVENT or EVENT_ERROR response.
 * Message ID: 412
 * CRC Extra: 33
 */
export interface RequestEvent {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** First sequence number of the requested event. */
  firstSequence: number;
  /** Last sequence number of the requested event. */
  lastSequence: number;
}

export const REQUEST_EVENT_ID = 412;
export const REQUEST_EVENT_CRC_EXTRA = 33;
export const REQUEST_EVENT_MIN_LENGTH = 6;
export const REQUEST_EVENT_MAX_LENGTH = 6;

export function serializeRequestEvent(msg: RequestEvent): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.firstSequence, true);
  view.setUint16(2, msg.lastSequence, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeRequestEvent(payload: Uint8Array): RequestEvent {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    firstSequence: view.getUint16(0, true),
    lastSequence: view.getUint16(2, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
  };
}