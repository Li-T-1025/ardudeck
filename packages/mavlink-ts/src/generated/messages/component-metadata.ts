/**
 * Component metadata message, which may be requested using MAV_CMD_REQUEST_MESSAGE.

        This contains the MAVLink FTP URI and CRC for the component's general metadata file.
        The file must be hosted on the component, and may be xz compressed.
        The file CRC can be used for file caching.

        The general metadata file can be read to get the locations of other metadata files (COMP_METADATA_TYPE) and translations, which may be hosted either on the vehicle or the internet.
        For more information see: https://mavlink.io/en/services/component_information.html.

        Note: Camera components should use CAMERA_INFORMATION instead, and autopilots may use both this message and AUTOPILOT_VERSION.
 * Message ID: 397
 * CRC Extra: 182
 */
export interface ComponentMetadata {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** CRC32 of the general metadata file. */
  fileCrc: number;
  /** MAVLink FTP URI for the general metadata file (COMP_METADATA_TYPE_GENERAL), which may be compressed with xz. The file contains general component metadata, and may contain URI links for additional metadata (see COMP_METADATA_TYPE). The information is static from boot, and may be generated at compile time. The string needs to be zero terminated. */
  uri: string;
}

export const COMPONENT_METADATA_ID = 397;
export const COMPONENT_METADATA_CRC_EXTRA = 182;
export const COMPONENT_METADATA_MIN_LENGTH = 108;
export const COMPONENT_METADATA_MAX_LENGTH = 108;

export function serializeComponentMetadata(msg: ComponentMetadata): Uint8Array {
  const buffer = new Uint8Array(108);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint32(4, msg.fileCrc, true);
  // String: uri
  const uriBytes = new TextEncoder().encode(msg.uri || '');
  buffer.set(uriBytes.slice(0, 100), 8);

  return buffer;
}

export function deserializeComponentMetadata(payload: Uint8Array): ComponentMetadata {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    fileCrc: view.getUint32(4, true),
    uri: new TextDecoder().decode(payload.slice(8, 108)).replace(/\0.*$/, ''),
  };
}