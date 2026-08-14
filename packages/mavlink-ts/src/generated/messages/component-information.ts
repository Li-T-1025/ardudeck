/**
 * Component information message, which may be requested using MAV_CMD_REQUEST_MESSAGE.
 * Message ID: 395
 * CRC Extra: 0
 */
export interface ComponentInformation {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** CRC32 of the general metadata file (general_metadata_uri). */
  generalMetadataFileCrc: number;
  /** MAVLink FTP URI for the general metadata file (COMP_METADATA_TYPE_GENERAL), which may be compressed with xz. The file contains general component metadata, and may contain URI links for additional metadata (see COMP_METADATA_TYPE). The information is static from boot, and may be generated at compile time. The string needs to be zero terminated. */
  generalMetadataUri: string;
  /** CRC32 of peripherals metadata file (peripherals_metadata_uri). */
  peripheralsMetadataFileCrc: number;
  /** (Optional) MAVLink FTP URI for the peripherals metadata file (COMP_METADATA_TYPE_PERIPHERALS), which may be compressed with xz. This contains data about "attached components" such as UAVCAN nodes. The peripherals are in a separate file because the information must be generated dynamically at runtime. The string needs to be zero terminated. */
  peripheralsMetadataUri: string;
}

export const COMPONENT_INFORMATION_ID = 395;
export const COMPONENT_INFORMATION_CRC_EXTRA = 0;
export const COMPONENT_INFORMATION_MIN_LENGTH = 212;
export const COMPONENT_INFORMATION_MAX_LENGTH = 212;

export function serializeComponentInformation(msg: ComponentInformation): Uint8Array {
  const buffer = new Uint8Array(212);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint32(4, msg.generalMetadataFileCrc, true);
  view.setUint32(8, msg.peripheralsMetadataFileCrc, true);
  // String: general_metadata_uri
  const generalMetadataUriBytes = new TextEncoder().encode(msg.generalMetadataUri || '');
  buffer.set(generalMetadataUriBytes.slice(0, 100), 12);
  // String: peripherals_metadata_uri
  const peripheralsMetadataUriBytes = new TextEncoder().encode(msg.peripheralsMetadataUri || '');
  buffer.set(peripheralsMetadataUriBytes.slice(0, 100), 112);

  return buffer;
}

export function deserializeComponentInformation(payload: Uint8Array): ComponentInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    generalMetadataFileCrc: view.getUint32(4, true),
    peripheralsMetadataFileCrc: view.getUint32(8, true),
    generalMetadataUri: new TextDecoder().decode(payload.slice(12, 112)).replace(/\0.*$/, ''),
    peripheralsMetadataUri: new TextDecoder().decode(payload.slice(112, 212)).replace(/\0.*$/, ''),
  };
}