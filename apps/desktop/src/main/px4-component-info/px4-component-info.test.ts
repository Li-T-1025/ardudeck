import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  COMP_METADATA_TYPE,
  decodeMetadataFile,
  fetchPx4ComponentMetadata,
  mftpPathFromUri,
  parseComponentGeneral,
} from './index.js';

/**
 * The real files a PX4 vehicle serves. Present in every PX4 SITL bundle; the
 * xz-dependent tests skip when no bundle has been downloaded on this machine.
 */
const EXTRAS = path.join(os.homedir(), '.ardudeck', 'px4-sitl', 'stable', 'etc', 'extras');
const hasBundle = existsSync(path.join(EXTRAS, 'component_general.json.xz'));
const withBundle = hasBundle ? it : it.skip;

describe('mftpPathFromUri', () => {
  it('turns PX4\'s host-relative mftp URI into an absolute FTP path', () => {
    expect(mftpPathFromUri('mftp://etc/extras/parameters.json.xz')).toBe('/etc/extras/parameters.json.xz');
  });

  it('accepts the mavlinkftp scheme and an already-absolute path', () => {
    expect(mftpPathFromUri('mavlinkftp:///etc/extras/all_events.json.xz')).toBe('/etc/extras/all_events.json.xz');
  });

  it('rejects http URIs, which are not an FTP transfer', () => {
    expect(mftpPathFromUri('https://example.com/parameters.json.xz')).toBeNull();
  });
});

describe('parseComponentGeneral', () => {
  it('extracts the metadata file list', () => {
    const entries = parseComponentGeneral({
      version: 1,
      metadataTypes: [
        { type: 1, uri: 'mftp://etc/extras/parameters.json.xz', fileCrc: 1040006428 },
        { type: 4, uri: 'mftp://etc/extras/all_events.json.xz', uriFallback: 'https://example.com/e.xz' },
        { type: 'bogus' },
      ],
    });
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      type: COMP_METADATA_TYPE.PARAMETER,
      uri: 'mftp://etc/extras/parameters.json.xz',
      uriFallback: undefined,
      fileCrc: 1040006428,
    });
  });

  it('tolerates junk instead of throwing', () => {
    expect(parseComponentGeneral(null)).toEqual([]);
    expect(parseComponentGeneral({})).toEqual([]);
    expect(parseComponentGeneral({ metadataTypes: 'nope' })).toEqual([]);
  });
});

describe('decodeMetadataFile', () => {
  it('reads plain JSON when the file is not compressed', async () => {
    const bytes = new TextEncoder().encode('{"version":1}');
    expect(await decodeMetadataFile(bytes)).toEqual({ version: 1 });
  });

  withBundle('decompresses a real xz metadata file from the vehicle', async () => {
    const bytes = readFileSync(path.join(EXTRAS, 'component_general.json.xz'));
    const json = (await decodeMetadataFile(bytes)) as { metadataTypes: unknown[] };
    expect(Array.isArray(json.metadataTypes)).toBe(true);
    expect(parseComponentGeneral(json).length).toBeGreaterThan(0);
  });
});

describe('fetchPx4ComponentMetadata', () => {
  withBundle('walks the real chain a PX4 vehicle serves', async () => {
    // Stand in for MAVLink FTP by serving the same files from the bundle.
    const downloadFile = vi.fn(async (ftpPath: string) => {
      const file = path.join(EXTRAS, path.basename(ftpPath));
      return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
    });

    const result = await fetchPx4ComponentMetadata(
      { type: COMP_METADATA_TYPE.GENERAL, uri: 'mftp://etc/extras/component_general.json.xz' },
      { downloadFile, log: () => {} },
    );

    expect(downloadFile).toHaveBeenCalledWith('/etc/extras/component_general.json.xz');
    expect(downloadFile).toHaveBeenCalledWith('/etc/extras/parameters.json.xz');
    expect(downloadFile).toHaveBeenCalledWith('/etc/extras/all_events.json.xz');

    expect(Object.keys(result.parameters ?? {}).length).toBeGreaterThan(1000);
    expect(result.parameters?.MC_ROLLRATE_P?.humanName).toBe('Roll rate P gain');
    expect(result.events?.components).toBeDefined();
  }, 30_000);

  it('falls back to the mirror when the vehicle transfer fails', async () => {
    const general = new TextEncoder().encode(JSON.stringify({
      metadataTypes: [{ type: COMP_METADATA_TYPE.PARAMETER, uri: 'mftp://etc/extras/parameters.json.xz', uriFallback: 'https://example.com/p.json' }],
    }));
    const params = new TextEncoder().encode(JSON.stringify({
      parameters: [{ name: 'MPC_XY_P', shortDesc: 'Proportional gain for horizontal position error' }],
    }));

    const downloadFile = vi.fn(async (ftpPath: string) =>
      ftpPath.endsWith('component_general.json.xz') ? general : null);
    const httpGet = vi.fn(async () => params);

    const result = await fetchPx4ComponentMetadata(
      { type: COMP_METADATA_TYPE.GENERAL, uri: 'mftp://etc/extras/component_general.json.xz' },
      { downloadFile, httpGet, log: () => {} },
    );

    expect(httpGet).toHaveBeenCalledWith('https://example.com/p.json');
    expect(result.parameters?.MPC_XY_P?.description).toBe('Proportional gain for horizontal position error');
  });

  it('returns nothing when the vehicle does not serve the general file', async () => {
    const result = await fetchPx4ComponentMetadata(
      { type: COMP_METADATA_TYPE.GENERAL, uri: 'mftp://etc/extras/component_general.json.xz' },
      { downloadFile: async () => null, log: () => {} },
    );
    expect(result).toEqual({});
  });
});
