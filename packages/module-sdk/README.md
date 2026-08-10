# @ardudeck/module-sdk

SDK for building ArduDeck modules.

## Install

From an external repo:

```json
{
  "devDependencies": {
    "@ardudeck/module-sdk": "github:codeforges/ardudeck#master&path:packages/module-sdk"
  }
}
```

Or bootstrap a new module with the generator:

```bash
node packages/create-ardudeck-module/bin/create.mjs my-module
```

## Manifest (`module.json`)

```json
{
  "manifestVersion": 1,
  "slug": "your.vendor.module-name",
  "name": "Your Module",
  "version": "0.1.0",
  "entry": { "main": "main.js", "renderer": "renderer.js" },
  "mountPoints": ["floatingOverlay"],
  "permissions": ["pty"]
}
```

Slug must match `^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$`. Version must be semver.

`entry` may be empty (`{}`) for a pure activator cargo: a module that ships no code and only unlocks built-in features through the host's capability map (see "Gating built-in features" below). `com.ardudeck.mission-library` is the reference: manifest-only, gates the Mission Library view and the planner's Save to Library option.

## Renderer entry

```tsx
import type { RendererHostApi } from '@ardudeck/module-sdk';

export async function activate(host: RendererHostApi) {
  host.log('info', 'activated');
  host.registerMountPoint('floatingOverlay', () => <MyFloatingComponent host={host} />);
}
```

## Main entry

```ts
import type { MainHostApi } from '@ardudeck/module-sdk';

export async function activate(host: MainHostApi) {
  host.onRendererMessage('doThing', async () => ({ result: 'ok' }));
}
```

## Build with esbuild

```js
import { build } from 'esbuild';
import { ardudeckModulePlugin } from '@ardudeck/module-sdk/esbuild';

await build({
  entryPoints: ['src/renderer/index.tsx'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  plugins: [ardudeckModulePlugin()],
  outfile: 'dist/renderer.js',
});
```

The plugin rewrites `react`, `react-dom`, and `react-dom/client` imports to the host's `window.__ardudeckHost.*` globals so your module shares the host's React instance (required for hooks to work).

## Host API

See `src/host-types.ts` for full typings. The renderer host exposes telemetry, connection state, current view, parameters, PTY sessions (if permitted), and a mount-point registration hook. Highlights:

- `host.panels` - contribute a panel to the host-owned module dock
- `host.hud` / `host.osd` - contribute HUD instruments and text-OSD elements
- `host.survey` - contribute a survey coverage engine
- `host.mission` / `host.commandTarget` - read-only mission + guided target
- `host.vault` - Fleet Vault access (requires the `vault` permission): `status()`, `listUnits()`, `history(limit?)`, `readFile(path, oid?)`, `snapshotParams(note?)`, `sync()`. Snapshots follow the host's vehicle-identity rules (user override, SITL separation). Credential management and restore are host-owned and NOT exposed.
- `host.vehicleIdentity` - which vehicle the app currently attributes work to: `get()` and `subscribe(listener)`. Null while disconnected or unidentified.
- `host.events` - host lifecycle events. Currently `onParamsFlashed(listener)`, fired after parameters were successfully written to flash. Returns an unsubscribe function.

## Permissions

Declare what your module needs in `module.json`:

- `pty` - Spawn PTY sessions (e.g., for CLI tools like `claude`)
- `filesystem` - Reserved for future use (currently all modules get a scoped data dir)
- `network` - Reserved for future use
- `vault` - Fleet Vault access via `host.vault` (read history, take snapshots, trigger sync)

Permissions are enforced by the host at runtime.

## Gating built-in features (activatable pattern)

A cargo can unlock features whose code ships inside the app instead of (or in addition to) bundling its own UI. The host keeps a capability map (`CAPABILITIES` in the app's `modules/capabilities.ts`) from cargo slug to what it gates:

- a whole nav-rail view (`viewId`)
- built-in fighter-HUD widget ids (`hudWidgets`)
- built-in text-OSD element ids (`osdElements`)
- arbitrary embedded surfaces - components consult `useCargoEnabled(slug)` themselves (the Fleet Vault's sync badges and auto-backup chips are the reference)

While the gating cargo is installed and enabled, everything it gates appears; uninstalling or toggling the cargo off hides it all. The gate reacts to the Cargo Bay enable/disable switch live, no restart. The reference cargo is `com.ardudeck.vault`: installing it adds the Fleet Vault view, the backup badges on the parameter/mission/area screens, and its own dock panel.
