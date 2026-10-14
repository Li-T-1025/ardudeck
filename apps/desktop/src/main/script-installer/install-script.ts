import type { ScriptInstallProgress, ScriptInstallRequest, ScriptInstallResult } from '@ardudeck/module-sdk';
import type { FcAdapter } from './installer-service';
import { t } from '../../shared/i18n/index.js';

let adapterFactory: (() => FcAdapter) | null = null;
let running = false;

/** ipc-handlers owns the link; it hands over how to reach the flight controller. */
export function setScriptInstallAdapter(factory: () => FcAdapter): void {
  adapterFactory = factory;
}

/** Scripting on with enough heap, upload, reboot, then optionally wait for a parameter the script adds at boot. */
export async function installScript(req: ScriptInstallRequest, onProgress: (p: ScriptInstallProgress) => void = () => {}): Promise<ScriptInstallResult> {
  if (!adapterFactory) return { status: 'error', message: t('main:scriptInstall.notConnected') };
  if (running) return { status: 'error', message: t('main:scriptInstall.busy') };
  if (!/^[\w.-]+\.lua$/.test(req.filename)) return { status: 'error', message: t('main:scriptInstall.badName', { name: req.filename }) };
  running = true;
  const adapter = adapterFactory();
  try {
    onProgress({ phase: 'checking' });
    if (!adapter.getAutopilotUid()) return { status: 'error', message: t('main:scriptInstall.notConnected') };
    if (adapter.isVehicleArmed()) return { status: 'error', message: t('main:scriptInstall.armed') };

    const bytes = new TextEncoder().encode(req.source);
    const target = `/APM/scripts/${req.filename}`;
    const probe = await adapter.probeWritability(`/APM/scripts/.ardudeck_probe_${Date.now()}`);
    if (probe.verdict !== 'writable') return { status: 'manual', targetPath: target, reason: probe.detail };

    const params = await adapter.readParams(['SCR_ENABLE', 'SCR_HEAP_SIZE']);
    const wanted: Array<[string, number]> = [];
    if (params.SCR_ENABLE !== 1) wanted.push(['SCR_ENABLE', 1]);
    if (req.minHeap && (params.SCR_HEAP_SIZE ?? 0) < req.minHeap) wanted.push(['SCR_HEAP_SIZE', req.minHeap]);
    for (const [param, value] of wanted) {
      onProgress({ phase: 'configuring', param, value });
      if (!(await adapter.setParam(param, value))) return { status: 'error', message: t('main:scriptInstall.setFailed', { param }) };
    }

    onProgress({ phase: 'uploading', written: 0, total: bytes.length });
    let uploaded = false;
    let failure = '';
    try {
      uploaded = await adapter.ftpUpload(target, bytes, (written, total) => onProgress({ phase: 'uploading', written, total }));
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }
    if (!uploaded) return { status: 'manual', targetPath: target, reason: failure || t('main:scriptInstall.uploadFailed') };

    // scripts and the heap are only picked up at boot; in SITL the upload already restarted the simulator
    onProgress({ phase: 'rebooting' });
    const sitl = adapter.isSitl();
    if (!sitl && !(await adapter.rebootAndReconnect(60))) return { status: 'error', message: t('main:scriptInstall.noReconnect') };

    if (!req.expectParam) return { status: 'installed' };
    onProgress({ phase: 'verifying' });
    const deadline = Date.now() + (sitl ? 90_000 : 30_000);
    while (Date.now() < deadline) {
      const seen = await adapter.readParams([req.expectParam]);
      if (seen[req.expectParam] !== undefined) return { status: 'installed' };
      await new Promise((r) => setTimeout(r, 2000));
    }
    return { status: 'error', message: t('main:scriptInstall.notStarted') };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  } finally {
    running = false;
  }
}
