/**
 * Time/duration estimates for various events and actions given the current vehicle state and position.
 * Message ID: 380
 * CRC Extra: 232
 */
export interface TimeEstimateToTarget {
  /** Estimated time to complete the vehicle's configured "safe return" action from its current position (e.g. RTL, Smart RTL, etc.). -1 indicates that the vehicle is landed, or that no time estimate available. (s) */
  safeReturn: number;
  /** Estimated time for vehicle to complete the LAND action from its current position. -1 indicates that the vehicle is landed, or that no time estimate available. (s) */
  land: number;
  /** Estimated time for reaching/completing the currently active mission item. -1 means no time estimate available. (s) */
  missionNextItem: number;
  /** Estimated time for completing the current mission. -1 means no mission active and/or no estimate available. (s) */
  missionEnd: number;
  /** Estimated time for completing the current commanded action (i.e. Go To, Takeoff, Land, etc.). -1 means no action active and/or no estimate available. (s) */
  commandedAction: number;
}

export const TIME_ESTIMATE_TO_TARGET_ID = 380;
export const TIME_ESTIMATE_TO_TARGET_CRC_EXTRA = 232;
export const TIME_ESTIMATE_TO_TARGET_MIN_LENGTH = 20;
export const TIME_ESTIMATE_TO_TARGET_MAX_LENGTH = 20;

export function serializeTimeEstimateToTarget(msg: TimeEstimateToTarget): Uint8Array {
  const buffer = new Uint8Array(20);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.safeReturn, true);
  view.setInt32(4, msg.land, true);
  view.setInt32(8, msg.missionNextItem, true);
  view.setInt32(12, msg.missionEnd, true);
  view.setInt32(16, msg.commandedAction, true);

  return buffer;
}

export function deserializeTimeEstimateToTarget(payload: Uint8Array): TimeEstimateToTarget {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    safeReturn: view.getInt32(0, true),
    land: view.getInt32(4, true),
    missionNextItem: view.getInt32(8, true),
    missionEnd: view.getInt32(12, true),
    commandedAction: view.getInt32(16, true),
  };
}