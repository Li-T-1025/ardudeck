// A cargo starting a program on this computer: the pilot is asked, the answer can be kept.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dialog, BrowserWindow } from 'electron';
import type { ModuleManifest, ProcessHandle, ProcessRunRequest } from '@ardudeck/module-sdk';
import { t } from '../../shared/i18n/index.js';
import { killProcessTree } from '@ardudeck/sitl';

const ALLOW_FILE = 'process-allow.json';

/** One command line, so "always allow" covers the same program with the same arguments and nothing else. */
export function processKey(req: Pick<ProcessRunRequest, 'command' | 'args'>): string {
  return [req.command, ...req.args].join(' ');
}

export type ProcessChoice = 'once' | 'always' | 'cancel';

/** Dialog button index to a decision; the remembered set gains the key only on "always". */
export function applyChoice(remembered: string[], key: string, choice: ProcessChoice): { allowed: boolean; remembered: string[] } {
  if (choice === 'cancel') return { allowed: false, remembered };
  if (choice === 'always' && !remembered.includes(key)) return { allowed: true, remembered: [...remembered, key] };
  return { allowed: true, remembered };
}

async function readAllowed(dataDir: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(join(dataDir, ALLOW_FILE), 'utf-8')) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

async function ask(manifest: ModuleManifest, req: ProcessRunRequest): Promise<ProcessChoice> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const opts = {
    type: 'question' as const,
    title: t('main:moduleProcess.title', { name: manifest.name }),
    message: t('main:moduleProcess.message', { name: manifest.name, reason: req.reason }),
    detail: processKey(req),
    buttons: [t('main:moduleProcess.allowOnce'), t('main:moduleProcess.allowAlways'), t('common:cancel')],
    defaultId: 0,
    cancelId: 2,
  };
  const { response } = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
  return response === 0 ? 'once' : response === 1 ? 'always' : 'cancel';
}

export async function runModuleProcess(manifest: ModuleManifest, dataDir: string, req: ProcessRunRequest): Promise<ProcessHandle> {
  if (!manifest.permissions?.includes('pty')) throw new Error(`[module:${manifest.slug}] starting programs requires the 'pty' manifest permission`);
  const key = processKey(req);
  const remembered = await readAllowed(dataDir);
  if (!remembered.includes(key)) {
    const outcome = applyChoice(remembered, key, await ask(manifest, req));
    if (!outcome.allowed) throw new Error(t('main:moduleProcess.declined'));
    if (outcome.remembered !== remembered) {
      await mkdir(dataDir, { recursive: true });
      await writeFile(join(dataDir, ALLOW_FILE), JSON.stringify(outcome.remembered), 'utf-8');
    }
  }
  // ArduDeck's dev-server variables must not reach a child, or an Electron child loads our renderer.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith('ELECTRON_') && !k.startsWith('VITE_') && k !== 'NODE_OPTIONS') env[k] = v;
  Object.assign(env, req.env ?? {});
  const child = spawn(req.command, req.args, { cwd: req.cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', () => resolve());
    child.once('error', (err) => reject(err));
  });
  const outputs = new Set<(line: string, stream: 'stdout' | 'stderr') => void>();
  const exits = new Set<(code: number | null, signal: string | null) => void>();
  const pipe = (stream: 'stdout' | 'stderr') => {
    let rest = '';
    child[stream]?.on('data', (d: Buffer) => {
      rest += d.toString();
      const lines = rest.split(/\r?\n/);
      rest = lines.pop() ?? '';
      for (const line of lines) for (const cb of outputs) cb(line, stream);
    });
  };
  pipe('stdout');
  pipe('stderr');
  child.on('exit', (code, signal) => { for (const cb of exits) cb(code, signal); });
  return {
    pid: child.pid ?? -1,
    onOutput: (cb) => { outputs.add(cb); return () => { outputs.delete(cb); }; },
    onExit: (cb) => { exits.add(cb); return () => { exits.delete(cb); }; },
    kill: (signal = 'SIGTERM') => {
      if (signal === 'SIGKILL') killProcessTree(child);
      else child.kill(signal);
    },
  };
}
