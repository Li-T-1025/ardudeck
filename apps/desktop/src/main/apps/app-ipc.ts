/** IPC for Hangar apps. Mirrors module-ipc, but nothing here touches licences or the registry. */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { getInstalledApps, launchApp, listApps } from './app-manager.js';
import { companionCargoOf, installAppWithCompanion, uninstallAppWithCompanion } from './companion.js';

export function setupAppIpc(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.APP_CATALOG_LIST, async () => {
    try {
      return { success: true, apps: await listApps() };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_LIST, () => getInstalledApps());

  ipcMain.handle(IPC_CHANNELS.APP_INSTALL, async (_, slug: string) => {
    try {
      const outcome = await installAppWithCompanion(slug, (p) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.APP_PROGRESS, p);
        }
      });
      return { success: true, app: outcome.app, cargoError: outcome.cargoError, cargoLoaded: outcome.cargoLoaded };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.APP_PROGRESS, { stage: 'error', message });
      }
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_UNINSTALL, async (_, slug: string) => {
    try {
      return { success: true, apps: await uninstallAppWithCompanion(slug) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // The cargo that an app removal takes with it, so the renderer can name the pair before asking.
  ipcMain.handle(IPC_CHANNELS.APP_COMPANION, (_, slug: string) => companionCargoOf(slug));

  ipcMain.handle(IPC_CHANNELS.APP_LAUNCH, async (_, slug: string, args?: string[]) => {
    try {
      await launchApp(slug, args ?? []);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
