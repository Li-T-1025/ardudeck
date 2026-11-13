# Tianditu basemaps (cargo)

Adds three Tianditu (天地图) basemaps to the app's layer picker — the telemetry
map, the mission planner, the 3D mission view — and the imagery row to the
flight-log map:

| Picker row | Layers | Deepest provider zoom | Narrow picker |
| --- | --- | --- | --- |
| 天地图混合 / Tianditu imagery | `img` + `cia` labels | 18 | yes |
| 天地图矢量 / Tianditu vector | `vec` + `cva` labels | 18 | — |
| 天地图地形 / Tianditu terrain | `ter` + `cta` labels | 14 | — |

A row is one entry, not two: the label layer is composited over the base tile by
the app, so the picker stays as short as the built-in one.

`hybrid` is registered with `primary: true`. The flight-log map sits in a small
overlay, so it lists only the primary row; the full-size pickers list all three.
A cargo that marks no row primary gets its rows listed everywhere.

## Setup: get a server-side key

Tianditu issues two kinds of key:

- **浏览器端 (browser-side)** — checked against the page's Referer. ArduDeck is a
  desktop app and cannot satisfy that check, so this type does not work here.
- **服务端 (server-side)** — checked against the key (and an optional IP
  allow-list). This is the type this cargo needs.

The app neither fakes a browser `User-Agent` nor forwards a foreign `Referer` to
borrow the browser-side type. That was the condition for building this as a
cargo, and a browser-side key simply gets a message pointing at the console.

1. Register at <https://passport.tianditu.gov.cn/register> if you have no
   account (identity verification may take a day), then sign in to the console:
   <https://cloudcenter.tianditu.gov.cn/center/development/myApp> → 应用管理.
   The old host `console.tianditu.gov.cn/api/key` no longer resolves; a bookmark
   to it fails with `DNS_PROBE_FINISHED_NXDOMAIN`.
2. Create an application (应用), then add a key of type **服务端**.
3. If the key has an IP allow-list (IP 白名单), add the **public** IP of the
   machine running ArduDeck. Leaving the list empty is simpler for a laptop that
   moves between networks.
4. Copy the 32-character key.
5. In ArduDeck, open the **Tianditu basemaps** panel in the module dock, paste
   the key and press **Save key**. The three rows appear in the full-size pickers
   right away; the flight-log overlay gets the 天地图混合 row. No restart.

The key is stored encrypted (OS keychain via Electron `safeStorage`) under the
cargo's data, not in a plain settings file, and it never reaches the renderer:
the renderer only receives a layer key, a name and the credit.

Key types and authorisation: <http://lbs.tianditu.gov.cn/authorization/authorization.html>.

## Checking a key without the app

```bash
node scripts/check-key.mjs <key>            # a Beijing tile at z18
node scripts/check-key.mjs <key> 12 3372 1552
```

It requests one tile per layer with a plain `fetch` (no browser headers) and
prints status, content type and size. A `403` whose body mentions `浏览器端`
means the key is the wrong type, not that the network is down.

## Build

```bash
pnpm install                 # links @ardudeck/module-sdk for this package
pnpm --filter @ardudeck-cargo/tianditu build
pnpm --filter @ardudeck-cargo/tianditu check
```

Then load it in an unpackaged build: **Tools → Cargo Bay → Load from folder**,
pointing at `cargo/tianditu` (the folder with `module.json` and `dist/`).

## How it is wired

- `src/main/index.ts` registers the three basemaps through
  `host.basemaps.register` — a host extension point that exists for exactly this:
  a provider basemap with a key.
- Tiles are `https://t{0..7}.tianditu.gov.cn/<layer>_w/wmts?...&tk=<key>`; the app
  fetches them in the main process, caches them on disk and serves them to the
  maps through `tile-cache://`, so the key never appears in a tile URL the
  renderer could read.
- `img` comes back as **JPEG**, `vec` as PNG-ish JPEG, `ter` as PNG. The host
  decodes both formats and blends the label layer pixel by pixel (true
  source-over, not a chroma-key replacement), which is why the labels are not
  jagged.
- Past the provider's real depth (`maxNativeZoom`) the host upscales the parent
  tile instead of requesting a tile Tianditu does not have, so zooming past 18
  stays smooth instead of going blank.
- `src/renderer/index.tsx` contributes the key panel and its strings; the
  translation for a picker row is `basemap.<id>` in the cargo's namespace.

## Limits worth knowing

- Tianditu serves Chinese territory; outside it, tiles are sparse or blank.
- A key has a daily tile quota (and a per-second one). Heavy offline-area
  downloads through the app's tile cache count against it.
- Each layer carries the platform's required credit, `© 天地图 · 国家地理信息公共服务平台`.
  A published product must also print the 审图号 shown in the console for the
  key that produced the imagery.
- Offline-area download in the built-in panel skips cargo basemaps: downloading
  a provider's tiles for later is the provider's decision, so it stays manual
  (use the map, the cache fills as you pan).
