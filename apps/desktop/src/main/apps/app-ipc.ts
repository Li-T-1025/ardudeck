/** IPC for Hangar apps. Mirrors module-ipc, but nothing here touches licences or the registry. */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { getInstalledApps, installApp, launchApp, listApps, uninstallApp } from './app-manager.js';

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
      const installed = await installApp(slug, (p) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.APP_PROGRESS, p);
        }
      });
      return { success: true, app: installed };
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
      return { success: true, apps: await uninstallApp(slug) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_LAUNCH, async (_, slug: string, args?: string[]) => {
    try {
      await launchApp(slug, args ?? []);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
