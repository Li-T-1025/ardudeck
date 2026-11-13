# Cargo

Modules ("cargo") that ArduDeck loads beside its own UI. The app core stays
provider-neutral: a provider-specific dataset, service or device belongs here,
so only the pilots who need it install it.

Each subfolder is one cargo with its own `module.json` (see
`packages/module-sdk/README.md` for the manifest and the host API) and a build
of its own.

| Cargo | What it adds |
| --- | --- |
| `tianditu` | Tianditu (天地图) basemaps for China: `img`/`vec`/`ter` with their label layers. The flight-log picker shows only the imagery row. |

## Building and running one

```bash
pnpm --filter @ardudeck-cargo/<name> build
```

Then in the app: **Tools → Cargo Bay → Load from folder**, pick the cargo's
folder (the one holding `module.json` and `dist/`). Unpackaged builds only, and
the folder has to be the built output, not `src`.

A cargo is removed from the app by disabling it in Cargo Bay; every registration
it made is dropped with it, so maps fall back to the built-in basemaps.
