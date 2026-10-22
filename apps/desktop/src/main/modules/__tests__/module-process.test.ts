import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ dialog: {}, BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null } }));
vi.mock('../../../shared/i18n/index.js', () => ({ t: (k: string) => k }));

import { applyChoice, processKey, runModuleProcess } from '../module-process';

describe('cargo process prompt', () => {
  it('keys the decision on the whole command line', () => {
    expect(processKey({ command: 'gz', args: ['sim', '-r', 'iris_runway.sdf'] })).toBe('gz sim -r iris_runway.sdf');
    expect(processKey({ command: 'gz', args: ['sim', '-g'] })).not.toBe(processKey({ command: 'gz', args: ['sim', '-s'] }));
  });

  it('remembers only "always", refuses on cancel', () => {
    const key = 'gz sim -g';
    expect(applyChoice([], key, 'cancel')).toEqual({ allowed: false, remembered: [] });
    expect(applyChoice([], key, 'once')).toEqual({ allowed: true, remembered: [] });
    const kept = applyChoice([], key, 'always');
    expect(kept).toEqual({ allowed: true, remembered: [key] });
    // asking again with it remembered adds nothing
    expect(applyChoice(kept.remembered, key, 'always').remembered).toEqual([key]);
  });

  it('refuses a cargo without the pty permission before any prompt', async () => {
    const manifest = { manifestVersion: 1 as const, slug: 'com.t', name: 'T', version: '1.0.0', entry: { main: 'main.js' }, permissions: ['network' as const] };
    await expect(runModuleProcess(manifest, '/tmp/none', { command: 'gz', args: [], reason: 'x' })).rejects.toThrow(/'pty'/);
  });
});
