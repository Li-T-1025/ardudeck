import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  dialog: {},
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
}));
vi.mock('../../vehicle-control/vehicle-control.js', () => ({ vehicleControl: {} }));
vi.mock('../../media/media-engine.js', () => ({ mediaEngine: {} }));
vi.mock('../../script-installer/install-script.js', () => ({ installScript: vi.fn() }));
vi.mock('../../../shared/i18n/index.js', () => ({ t: (k: string) => k }));

import { createMainHostApi } from '../module-host-main';
import { listTileSources } from '../../terrain/tile-source-registry';
import { listSceneMeshes } from '../../terrain/scene-mesh-registry';

const manifest = { manifestVersion: 1 as const, slug: 'com.t', name: 'T', version: '1.0.0', entry: { main: 'main.js' } };
const ring = [{ lat: 1, lng: 1 }, { lat: 1, lng: 2 }, { lat: 2, lng: 2 }];

describe('MainHostApi tiles and scene', () => {
  it('register under the module slug and unregister by id', () => {
    const host = createMainHostApi(manifest);
    host.tiles.register({ id: 'dsm', name: 'DSM', kind: 'dem', footprint: ring, tileRoot: '/t', minZoom: 12, maxZoom: 19 });
    host.scene.registerMesh({ id: 'm', name: 'M', glb: '/m.glb', origin: { lat: 1, lng: 1, altMsl: 0 } });
    expect(listTileSources().map((e) => e.key)).toContain('com.t::dsm');
    expect(listSceneMeshes().map((e) => e.key)).toContain('com.t::m');
    host.tiles.unregister('dsm');
    host.scene.unregisterMesh('m');
    expect(listTileSources().find((e) => e.key === 'com.t::dsm')).toBeUndefined();
    expect(listSceneMeshes().find((e) => e.key === 'com.t::m')).toBeUndefined();
  });
});
