import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdir, writeFile, rm, stat, readFile } from 'fs/promises';
import os from 'os';
import path from 'path';

const tmp = path.join(os.tmpdir(), `edgetx-test-${process.pid}`);

vi.mock('electron', () => ({
  app: { getPath: () => tmp, getAppPath: () => path.join(tmp, 'app') },
}));

import { probeVolume } from './sd-detector.js';
import { EDGETX_PACKAGES, resolveMappings, getPackage, type EdgeTxPackage } from './package-registry.js';
import { readManifest, removePackage, installPackage } from './package-installer.js';

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

describe('sd-detector probeVolume', () => {
  const vol = path.join(tmp, 'FAKE_SD');

  beforeEach(async () => {
    await rm(vol, { recursive: true, force: true });
    await mkdir(vol, { recursive: true });
  });

  it('rejects a volume without the EdgeTX directory signature', async () => {
    await mkdir(path.join(vol, 'DCIM'));
    expect(await probeVolume(vol)).toBeNull();
  });

  it('accepts a volume with SCRIPTS and RADIO dirs', async () => {
    await mkdir(path.join(vol, 'SCRIPTS'));
    await mkdir(path.join(vol, 'RADIO'));
    const card = await probeVolume(vol);
    expect(card).not.toBeNull();
    expect(card!.volumeName).toBe('FAKE_SD');
    expect(card!.sdCardVersion).toBeNull();
    expect(card!.hasWidgets).toBe(false);
  });

  it('reads the sdcard version file and detects WIDGETS', async () => {
    await mkdir(path.join(vol, 'SCRIPTS'));
    await mkdir(path.join(vol, 'RADIO'));
    await mkdir(path.join(vol, 'WIDGETS'));
    await writeFile(path.join(vol, 'edgetx.sdcard.version'), '2.10V0021\n');
    const card = await probeVolume(vol);
    expect(card!.sdCardVersion).toBe('2.10V0021');
    expect(card!.hasWidgets).toBe(true);
  });
});

describe('package-registry', () => {
  it('yaapu package exists with TX15 variant', () => {
    const pkg = getPackage('yaapu-telemetry');
    expect(pkg).toBeDefined();
    expect(pkg!.variants.some((v) => v.id === 'c480x320')).toBe(true);
  });

  it('color variants include color_common mapping', () => {
    const pkg = getPackage('yaapu-telemetry')!;
    const mappings = resolveMappings(pkg, 'c480x320');
    expect(mappings.map((m) => m.archivePath)).toContain('OTX_ETX/color_common/SD');
    expect(mappings.map((m) => m.archivePath)).toContain('OTX_ETX/c480x320/SD');
  });

  it('bw variants exclude color_common but include bw_common', () => {
    const pkg = getPackage('yaapu-telemetry')!;
    const mappings = resolveMappings(pkg, 'bw128x64').map((m) => m.archivePath);
    expect(mappings).not.toContain('OTX_ETX/color_common/SD');
    expect(mappings).toContain('OTX_ETX/bw_common/SD');
  });

  it('unknown variant resolves to no mappings', () => {
    for (const pkg of EDGETX_PACKAGES) {
      expect(resolveMappings(pkg, 'nope')).toEqual([]);
    }
  });
});

describe('package-installer manifest + remove', () => {
  const vol = path.join(tmp, 'SD_REMOVE');

  beforeEach(async () => {
    await rm(vol, { recursive: true, force: true });
    // Simulated post-install SD: package files plus a user file sharing a dir
    await mkdir(path.join(vol, 'WIDGETS/yaapu/lib'), { recursive: true });
    await mkdir(path.join(vol, 'SCRIPTS/TOOLS'), { recursive: true });
    await writeFile(path.join(vol, 'WIDGETS/yaapu/main.lua'), 'x');
    await writeFile(path.join(vol, 'WIDGETS/yaapu/lib/util.lua'), 'x');
    await writeFile(path.join(vol, 'SCRIPTS/TOOLS/Yaapu Config.lua'), 'x');
    await writeFile(path.join(vol, 'SCRIPTS/TOOLS/user-tool.lua'), 'keep me');
    await mkdir(path.join(vol, '.ardudeck'), { recursive: true });
    await writeFile(
      path.join(vol, '.ardudeck/edgetx-packages.json'),
      JSON.stringify({
        packages: {
          'yaapu-telemetry': {
            version: '1.9.7',
            variantId: 'c480x320',
            installedAt: '2026-08-05T00:00:00Z',
            files: [
              'WIDGETS/yaapu/main.lua',
              'WIDGETS/yaapu/lib/util.lua',
              'SCRIPTS/TOOLS/Yaapu Config.lua',
            ],
          },
        },
      }),
    );
  });

  it('reads the manifest', async () => {
    const manifest = await readManifest(vol);
    expect(manifest.packages['yaapu-telemetry']!.version).toBe('1.9.7');
  });

  it('returns empty manifest for a card without one', async () => {
    const manifest = await readManifest(path.join(tmp, 'nonexistent'));
    expect(manifest.packages).toEqual({});
  });

  it('removes exactly the manifest files and prunes empty dirs', async () => {
    await removePackage(vol, 'yaapu-telemetry');

    expect(await exists(path.join(vol, 'WIDGETS/yaapu'))).toBe(false);
    // Shared dir with a user file survives, as does the user file
    expect(await exists(path.join(vol, 'SCRIPTS/TOOLS/user-tool.lua'))).toBe(true);
    expect(await exists(path.join(vol, 'SCRIPTS/TOOLS/Yaapu Config.lua'))).toBe(false);

    const manifest = JSON.parse(await readFile(path.join(vol, '.ardudeck/edgetx-packages.json'), 'utf8'));
    expect(manifest.packages['yaapu-telemetry']).toBeUndefined();
  });

  it('removing an uninstalled package is a no-op', async () => {
    await expect(removePackage(vol, 'not-installed')).resolves.toBeUndefined();
    expect(await exists(path.join(vol, 'WIDGETS/yaapu/main.lua'))).toBe(true);
  });
});

describe('bundled package install', () => {
  const vol = path.join(tmp, 'SD_BUNDLED');
  const res = path.join(tmp, 'app/resources/edgetx/test-hud/SD/WIDGETS/testhud');

  const pkg: EdgeTxPackage = {
    id: 'test-hud',
    name: 'Test HUD',
    description: '',
    homepage: '',
    license: 'MIT',
    source: { kind: 'bundled', dir: 'test-hud', version: '1.2.3' },
    mappings: { c480x320: [{ archivePath: 'SD' }] },
    variants: [{ id: 'c480x320', label: '', radios: '' }],
  };

  beforeEach(async () => {
    await rm(vol, { recursive: true, force: true });
    await rm(path.join(tmp, 'app'), { recursive: true, force: true });
    await mkdir(vol, { recursive: true });
    await mkdir(res, { recursive: true });
    await writeFile(path.join(res, 'main.lua'), 'return {}');
    await writeFile(path.join(res, 'theme.lua'), 'return {}');
  });

  it('installs from app resources without network and records the version', async () => {
    const record = await installPackage(vol, pkg, 'c480x320', 0, () => {});
    expect(record.version).toBe('1.2.3');
    expect(record.files.sort()).toEqual(['WIDGETS/testhud/main.lua', 'WIDGETS/testhud/theme.lua']);
    expect(await exists(path.join(vol, 'WIDGETS/testhud/main.lua'))).toBe(true);
    const manifest = await readManifest(vol);
    expect(manifest.packages['test-hud']!.variantId).toBe('c480x320');
  });

  it('reinstall replaces previous files cleanly', async () => {
    await installPackage(vol, pkg, 'c480x320', 0, () => {});
    await rm(path.join(res, 'theme.lua'));
    const record = await installPackage(vol, pkg, 'c480x320', 0, () => {});
    expect(record.files).toEqual(['WIDGETS/testhud/main.lua']);
    expect(await exists(path.join(vol, 'WIDGETS/testhud/theme.lua'))).toBe(false);
  });
});
