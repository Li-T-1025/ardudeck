/**
 * Installing and tracking Hangar APPS.
 *
 * Deliberately NOT part of module-manager: an app has no licence to activate, no manifest to
 * parse, no capability to register and no code that runs inside this process. What it shares
 * with a module is "download a zip and unpack it", which is not enough to justify one code path
 * carrying two sets of rules.
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';
import Store from 'electron-store';
import { extractAppArchive } from './app-extract.js';
import type {
  AppPlatform, AppProgress, HangarApp, HangarAppDetail, InstalledApp,
} from '../../shared/app-types.js';
import { t } from '../../shared/i18n/index.js';

/** Same ordering the module installer uses, so the two cannot disagree about a version. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('-')[0]!.split('.').map(Number);
  const pb = b.split('-')[0]!.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

interface AppStoreSchema {
  apps: InstalledApp[];
}

// Constructed on first use, not at import. A module-level `new Store()` needs Electron's app
// name to exist, so merely importing this file from anywhere outside a running Electron main
// process throws - which is what stopped the pure logic below from being testable at all.
let _store: Store<AppStoreSchema> | null = null;
function store(): Store<AppStoreSchema> {
  _store ??= new Store<AppStoreSchema>({ name: 'apps', defaults: { apps: [] } });
  return _store;
}

const DEV_BASE_URL = 'http://localhost:3000';
const DEFAULT_BASE_URL = 'https://hangar.ardudeck.com';

function baseUrl(): string {
  const override = process.env['HANGAR_URL'] ?? process.env['MARKETPLACE_URL'];
  if (override) return override;
  if (!app.isPackaged) return DEV_BASE_URL;
  return DEFAULT_BASE_URL;
}

function thisPlatform(): AppPlatform {
  return process.platform === 'darwin' ? 'darwin'
    : process.platform === 'win32' ? 'win32'
    : 'linux';
}

export function getInstalledApps(): InstalledApp[] {
  return store().get('apps');
}

export function getInstalledApp(slug: string): InstalledApp | undefined {
  return store().get('apps').find((a) => a.slug === slug);
}

/**
 * Only what this machine can actually run. Listing a Linux-only app on macOS gives the user an
 * Install button whose only possible outcome is a 404, and `platforms` is read off the released
 * rows precisely so a platform whose build failed is not offered.
 */
export function runnableHere(apps: HangarApp[], platform: AppPlatform): HangarApp[] {
  return apps.filter((a) => a.platforms.includes(platform));
}

export async function listApps(): Promise<HangarApp[]> {
  const res = await fetch(`${baseUrl()}/public/apps`);
  if (!res.ok) throw new Error(t('main:appManager.hangarReturned', { status: res.status }));
  return runnableHere((await res.json()) as HangarApp[], thisPlatform());
}

export async function installApp(
  slug: string,
  onProgress: (p: AppProgress) => void = () => {},
  /** Licence key of the cargo that drives this app: unlocks a private app on the Hangar. */
  licenseKey?: string,
): Promise<InstalledApp> {
  const platform = thisPlatform();
  const headers: Record<string, string> = licenseKey ? { 'x-license-key': licenseKey } : {};

  // Refuse a release this ArduDeck is too old to host, BEFORE downloading half a gigabyte.
  //
  // The module installer has always done this; the app installer never did, so a release could
  // declare `minAppVersion` and be installed by a build with none of the integration it needs.
  // The failure then arrives later and somewhere else: the app is on disk, the nav rail entry
  // is missing, and nothing connects the two.
  const detail = await fetch(`${baseUrl()}/public/apps/${encodeURIComponent(slug)}`, { headers })
    .then((r) => (r.ok ? (r.json() as Promise<HangarAppDetail>) : null))
    .catch(() => null);
  const release = detail?.releases?.find(
    (r) => r.version === detail.latestVersion && r.platform === platform && r.kind === 'archive',
  );
  const needs = release?.minAppVersion;
  if (needs && compareSemver(app.getVersion(), needs) < 0) {
    throw new Error(
      t('main:appManager.needsNewerArduDeck', { name: detail?.name ?? slug, needs, current: app.getVersion() }),
    );
  }

  const url =
    `${baseUrl()}/public/apps/${encodeURIComponent(slug)}/download/latest` +
    `?platform=${platform}&kind=archive`;

  onProgress({ stage: 'downloading', message: t('main:appManager.downloading', { slug }), percent: 0 });

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch {
    throw new Error(t('main:appManager.hangarUnreachable', { url: baseUrl() }));
  }
  if (!res.ok) throw new Error(t('main:appManager.hangarReturnedFor', { status: res.status, slug, platform }));
  if (!res.body) throw new Error('Empty response body'); // i18n-exempt

  const declaredHash = res.headers.get('x-bundle-hash') || '';
  const total = parseInt(res.headers.get('content-length') || '0', 10);

  const dir = join(app.getPath('userData'), 'apps', slug);
  await mkdir(dir, { recursive: true });
  const zipPath = join(dir, 'download.zip');

  // Hashed as the bytes arrive, so verifying costs no second read of a file this size.
  const digest = createHash('sha256');
  let got = 0;
  const reader = res.body.getReader();
  const source = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) { this.push(null); return; }
      got += value.byteLength;
      onProgress({
        stage: 'downloading',
        message: t('main:appManager.downloading', { slug }),
        percent: total ? Math.round((got / total) * 100) : undefined,
      });
      digest.update(value);
      this.push(Buffer.from(value));
    },
  });
  await pipeline(source, createWriteStream(zipPath));

  onProgress({ stage: 'verifying', message: t('main:appManager.verifying', { slug }) });
  const localHash = digest.digest('hex');
  if (declaredHash && localHash !== declaredHash) {
    await rm(zipPath, { force: true });
    throw new Error(t('main:appManager.hashMismatch', { slug }));
  }

  onProgress({ stage: 'extracting', message: t('main:appManager.installing', { slug }) });
  const installPath = join(dir, 'current');
  await extractAppArchive(zipPath, installPath);
  // Hundreds of megabytes that are now redundant; keeping it doubles what the app costs on disk.
  await rm(zipPath, { force: true });

  const record: InstalledApp = {
    slug,
    name: detail?.name ?? slug,
    version: detail?.latestVersion ?? 'unknown',
    platform,
    installPath,
    installedAt: new Date().toISOString(),
    bundleHash: localHash,
  };
  store().set('apps', [...store().get('apps').filter((a) => a.slug !== slug), record]);
  onProgress({ stage: 'done', message: t('main:appManager.installed', { name: record.name }), percent: 100 });
  return record;
}

export async function uninstallApp(slug: string): Promise<InstalledApp[]> {
  const dir = join(app.getPath('userData'), 'apps', slug);
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
  const left = store().get('apps').filter((a) => a.slug !== slug);
  store().set('apps', left);
  return left;
}

/**
 * Start an installed app as its own process. A mac app is a bundle, so `open` starts it the way
 * Finder would; elsewhere the install folder holds one executable at its root. The child is
 * detached: it outlives ArduDeck and ArduDeck's dev-server variables must not reach it, or an
 * Electron app would load ArduDeck's renderer instead of its own.
 */
export async function launchApp(slug: string, args: string[] = []): Promise<void> {
  const installed = getInstalledApp(slug);
  if (!installed) throw new Error(t('main:appManager.notInstalled', { slug }));
  const root = installed.installPath;
  const names = await readdir(root);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith('ELECTRON_') && !k.startsWith('VITE_') && k !== 'NODE_OPTIONS'),
  );
  let command: string;
  let argv: string[];
  if (process.platform === 'darwin') {
    const bundle = names.find((n) => n.endsWith('.app'));
    if (!bundle) throw new Error(t('main:appManager.noExecutable', { slug }));
    command = 'open';
    argv = ['-n', join(root, bundle), ...(args.length ? ['--args', ...args] : [])];
  } else {
    let exe: string | undefined;
    for (const n of names) {
      const p = join(root, n);
      const st = await stat(p).catch(() => null);
      if (!st?.isFile()) continue;
      if (process.platform === 'win32' ? n.toLowerCase().endsWith('.exe') && !/unins/i.test(n) : (st.mode & 0o111) !== 0) { exe = p; break; }
    }
    if (!exe) throw new Error(t('main:appManager.noExecutable', { slug }));
    command = exe;
    argv = args;
  }
  const child = spawn(command, argv, { detached: true, stdio: 'ignore', env });
  child.unref();
}
