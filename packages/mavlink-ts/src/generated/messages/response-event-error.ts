/**
 * Response to a REQUEST_EVENT in case of an error (e.g. the event is not available anymore).
 * Message ID: 413
 * CRC Extra: 77
 */
export interface ResponseEventError {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Sequence number. */
  sequence: number;
  /** Oldest Sequence number that is still available after the sequence set in REQUEST_EVENT. */
  sequenceOldestAvailable: number;
  /** Error reason. */
  reason: number;
}

export const RESPONSE_EVENT_ERROR_ID = 413;
export const RESPONSE_EVENT_ERROR_CRC_EXTRA = 77;
export const RESPONSE_EVENT_ERROR_MIN_LENGTH = 7;
export const RESPONSE_EVENT_ERROR_MAX_LENGTH = 7;

export function serializeResponseEventError(msg: ResponseEventError): Uint8Array {
  const buffer = new Uint8Array(7);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.sequence, true);
  view.setUint16(2, msg.sequenceOldestAvailable, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  buffer[6] = msg.reason & 0xff;

  return buffer;
}

export function deserializeResponseEventError(payload: Uint8Array): ResponseEventError {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sequence: view.getUint16(0, true),
    sequenceOldestAvailable: view.getUint16(2, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    reason: payload[6],
  };
}