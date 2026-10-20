/**
 * An app and the cargo that drives it inside ArduDeck are one thing to the user: installing
 * either brings the other, removing either removes both. The pairing is declared on both ends
 * (the Hangar app's `companionCargo`, the cargo manifest's `app`) and resolved here, outside
 * app-manager and module-manager, which must not import each other.
 */

import { getInstalledModulesRaw, installFreeCargo, removeLicense } from '../modules/module-manager.js';
import { installApp, uninstallApp } from './app-manager.js';
import type { AppProgress, InstalledApp } from '../../shared/app-types.js';
import type { ModuleProgress } from '../../shared/module-types.js';
import { t } from '../../shared/i18n/index.js';

function asAppProgress(p: ModuleProgress): AppProgress {
  const stage: AppProgress['stage'] =
    p.stage === 'downloading' ? 'downloading'
    : p.stage === 'verifying' ? 'verifying'
    : p.stage === 'complete' ? 'done'
    : p.stage === 'error' ? 'error'
    : 'extracting';
  return { stage, message: p.message, percent: p.percent };
}

export interface AppInstallOutcome {
  app: InstalledApp;
  /** Set when the app is on disk but its cargo did not load, so the app still counts as installed. */
  cargoError?: string;
  /** True when a cargo was loaded now and needs a restart to appear. */
  cargoLoaded: boolean;
}

/** Install an app and, when the Hangar names one, the cargo that drives it. */
export async function installAppWithCompanion(
  slug: string,
  onProgress: (p: AppProgress) => void,
): Promise<AppInstallOutcome> {
  const record = await installApp(slug, onProgress);
  const cargo = record.companionCargo;
  if (!cargo || getInstalledModulesRaw().some((m) => m.slug === cargo)) {
    return { app: record, cargoLoaded: false };
  }
  onProgress({ stage: 'extracting', message: t('main:appManager.installingCompanion', { slug: cargo }) });
  // The cargo would install its app again on activation; it is already on disk.
  const res = await installFreeCargo(cargo, (p) => onProgress(asAppProgress(p)), { skipApp: true });
  if (!res.success) {
    const cargoError = t('main:appManager.companionFailed', { name: record.name, slug: cargo, msg: res.error ?? '' });
    onProgress({ stage: 'done', message: cargoError, percent: 100 });
    return { app: record, cargoError, cargoLoaded: false };
  }
  onProgress({ stage: 'done', message: t('main:appManager.installedWithCargo', { name: record.name }), percent: 100 });
  return { app: record, cargoLoaded: true };
}

/** Remove an app together with every installed cargo that declares it. */
export async function uninstallAppWithCompanion(slug: string): Promise<InstalledApp[]> {
  for (const mod of getInstalledModulesRaw().filter((m) => m.app === slug)) {
    // removeLicense drops the cargo and the app it brought along.
    await removeLicense(mod.licenseKey);
  }
  return uninstallApp(slug);
}

/** Name of the installed cargo that drives this app, for a removal prompt naming the pair. */
export function companionCargoOf(slug: string): string | null {
  return getInstalledModulesRaw().find((m) => m.app === slug)?.name ?? null;
}
