# Handover: v0.1.2 tribute, Bridge theme, FTUE and i18n

Written 2026-10-30. Nothing here is committed. The working tree is typecheck clean and
has no half-written files.

## Scope note

This work was briefed into a session that was running Ruben's Vehicle SDK work. The two
never mixed: see [What was already in the tree](#what-was-already-in-the-tree).

---

## State at a glance

| Item | State |
|---|---|
| Bridge theme, tokens and theme plumbing | Done |
| Tribute banner, warp, plaque, dedication moment | Done |
| Armed gate (nothing decorative over a live vehicle) | Done |
| Rail as console blocks, short labels | Done, unverified visually |
| Accent remap (blue and purple to console palette) | Done, with a known ceiling |
| Slider colour via prop | Done |
| Parameters console table | Done, unverified visually |
| Bridge component language (cards, bars, segments, inputs, readouts) | Written, not applied to screens |
| i18n: parameter validation, mode request, Chinese locale resolution | Done, tested |
| FTUE: inventory, staleness audit, ordering | Done |
| FTUE: two new tours and a tour extension | Anchors placed, tours not written |
| Enterprise-console redesign | **Not started.** See [Open items](#open-items) |
| Screenshots and visual verification | **None taken.** Never had a debug port |

Tests: `3914 passed`. Two test files fail and both failed before this work started, which
I verified by stashing: `apps/desktop/src/renderer/components/camera/GimbalPad.test.tsx`
(three timing-based zoom tests, flaky, the count moves between 3 and 4 across runs) and
`apps/desktop/src/renderer/components/telemetry/workspace-layouts.test.ts` (reads
`process.cwd()/src/...`, so it fails when run from the repo root).

---

## Files added

### Tribute

- `apps/desktop/src/renderer/stores/tribute-store.ts`
  Banner, warp phase and dedication state. Keyed per release:
  `ardudeck.tribute.seen.0.1.2` and `ardudeck.tribute.engaged.0.1.2`, so a later
  dedication shows again without clearing this one. `WARP_MS` is 2800.
- `apps/desktop/src/renderer/components/tribute/TributeBanner.tsx`
- `apps/desktop/src/renderer/components/tribute/WarpOverlay.tsx`
- `apps/desktop/src/renderer/components/tribute/DedicationMoment.tsx`
- `apps/desktop/src/renderer/components/tribute/DedicationPlaque.tsx`
- `apps/desktop/src/renderer/components/tribute/Starfield.tsx`
- `apps/desktop/src/renderer/components/tribute/useAnyVehicleArmed.ts`

### Theme and fonts

- `apps/desktop/src/renderer/components/settings/ThemeCard.tsx`
  The banner copy promised "Settings > Theme" and no such control existed; the only theme
  control was a cycle button on the rail. This card makes the copy true.
- `apps/desktop/src/renderer/assets/fonts/antonio-variable.woff2`
  Latin subset, 26 KB, wOF2 verified. SIL OFL.
- `apps/desktop/src/renderer/assets/fonts/README.md`
  Records the licence, the source and the fallback.

### i18n

- `apps/desktop/src/shared/i18n/resolve-language.test.ts` (8 tests)
- `apps/desktop/src/shared/i18n/locales/{en,de,zh-TW,zh-CN}/tribute.json`

## Files changed

### Theme plumbing

- `renderer/stores/settings-store.ts` — `ThemePreference` gains `'bridge'`.
- `renderer/hooks/useTheme.ts` — applies `.bridge`, never alongside `.light`;
  `useResolvedTheme` reports `'dark'` for Bridge, since callers use it to pick a dark or
  light asset.
- `renderer/area-editor/ObjectEditorApp.tsx` — the compiler caught a second exhaustive
  `Record<ThemePreference>` here that I would otherwise have missed. Bridge gets a star
  icon in that window.
- `renderer/styles/globals.css` — the bulk of the work. See
  [The stylesheet](#the-stylesheet).

### Rail

- `renderer/components/navigation/NavigationRail.tsx` — `nav-rail`, `nav-rail-item` and
  `nav-rail-util` hook classes (inert outside `.bridge`), a `nav-rail-short` caption span
  per item, the `TributeStar` button, Bridge added to `THEME_CYCLE` with a palette glyph,
  and `THEME_LABEL_KEYS` extended.

### Tribute mounting

- `renderer/components/layout/AppShell.tsx` — `TributeBanner` after `UpdateBanner`;
  `WarpOverlay` inside the content container (not the viewport) so the rail and top bar
  never flash mid-warp; `DedicationMoment` at root.
- `renderer/components/settings/SettingsView.tsx` — `ThemeCard` in Configuration,
  `DedicationPlaque` at the top of About.

### Telemetry tiles

- `renderer/components/panels/panel-utils.tsx` — `PanelContainer` gains an optional
  `accent` prop and a `telem-tile` class; `StatRow` labels get `telem-tile-label`.
- `renderer/components/panels/{Battery,Altitude,Speed,Gps,Position,Attitude}Panel.tsx` —
  tagged with their group accent.

### Parameters

- `renderer/components/parameters/ParametersView.tsx` — `param-search` on the search
  input, `param-table` on both tables.
- `renderer/components/ui/DraggableSlider.tsx` — track colour now resolves through the
  theme. See [The inline-prop ceiling](#the-inline-prop-ceiling).
- `renderer/components/mavlink-config/PidTuningTab.tsx` — `bridgeIndex` 0 to 3 on the
  P, I, D and FF sliders.

### FTUE

- `renderer/components/tours/TourManager.tsx` — the tour prompt now defers while the
  tribute banner, warp or dedication is up, using the same condition that already
  deferred to the guides queue.
- `renderer/components/quick-setup/QuickSetupWizard.tsx` — four anchors:
  `quick-setup-presets`, `quick-setup-transmitter`, `quick-setup-review`,
  `quick-setup-apply`.
- `renderer/components/fleet/FleetStrip.tsx` — anchor `fleet-strip-vehicle`.
- `renderer/components/survey/SurveyConfigPanel.tsx` — anchors `survey-width-source` and
  `survey-turns`. **Note:** this file also carries unrelated survey work, see
  [What was already in the tree](#what-was-already-in-the-tree).

### i18n fixes

- `shared/parameter-metadata.ts` — four hardcoded English messages moved to
  `parameters:paramsValidBitmask`, `paramsValidUnknownValue`, `paramsValidRange`,
  `paramsValidIncrement`. The range key takes a `units` argument that is empty when the
  parameter has none, so the sentence needs no second variant.
- `renderer/hooks/useModeRequest.ts` — the initial `rejectLabel` was the last English
  string; now `hooks:useModeRequest.rejected` in a lazy initialiser so it resolves after
  i18n is up.
- `shared/i18n/index.ts` — `resolveLanguage` is script-aware. See
  [Decisions](#decisions).
- Locale files touched in all four languages: `navigation.json` (short labels and
  `themeBridge`), `settings.json` (`themeTitle`, `themeHint`), `parameters.json` (four
  validation keys), `hooks.json` (`useModeRequest.rejected`), `area-editor.json`
  (`theme.bridge`).

---

## The stylesheet

Everything visual lives in `renderer/styles/globals.css`, gated on `.bridge`, so dark and
light are byte-identical in appearance. 107 `.bridge` rules in four groups:

1. **Token block** (after `.light`): backgrounds, borders, text, overlays, dockview,
   leaflet, gauges, plus `--bridge-amber/peach/lilac/sky/rose` and `--bridge-display`.
   Status colours are redefined but keep their meaning.
2. **Rail**: console blocks, palette cycling by `:nth-of-type(5n+k)`, rounded outer ends,
   captions, the utility group.
3. **Accent remap**: blue and purple Tailwind utilities mapped to the console palette.
4. **Component language**: `bridge-card`, `bridge-btn`, `bridge-segmented`,
   `bridge-input`, `bridge-readout`, and `accent-*` classes that set `--bridge-accent`.

Also appended: keyframes (`bridge-drift`, `bridge-rise`, `bridge-twinkle`,
`bridge-streak`, `bridge-fade-out`, `bridge-glow`), the Antonio `@font-face`, and a
`prefers-reduced-motion` block that stops the drift and twinkle while leaving the
starfield visible.

**The component language in group 4 is written but not applied to any screen.** Nothing
renders `bridge-card` or `bridge-btn` yet. That was the next step.

---

## Decisions

**`engaged` must be derived, not stored.** The first version kept an `engaged` flag in the
tribute store. Engaging set it true; cycling the rail theme then moved the theme away and
the flag stayed, so the banner showed ENGAGED with a disabled button and no way back. This
was the "cant engage anymore" bug. The label now reads live from
`theme === 'bridge'`, the button is never disabled, and a separate per-release
`engagedBefore` flag only chooses between "Engage" and "Engage again".

**The accent remap, and why it follows the house pattern.** `globals.css` already had 209
rules of the form `.light .text-blue-400 { ... }`: the light theme overrides Tailwind
colour utilities wholesale rather than editing components. The Bridge half maps blue to
amber and purple to lilac across the utilities the app actually uses, counted rather than
guessed (`text-blue-400` appears 400 times, `bg-blue-600` 149, `border-blue-500` 144).
Green, red, amber and yellow are deliberately **not** mapped: they mean connected, danger
and caution, and a console that recolours those is a console that lies.

### The inline-prop ceiling

The remap cannot reach every accent, and this is the single most useful thing to know
before continuing. `DraggableSlider` takes `color?: string` defaulting to `'#3B82F6'`, and
`PidTuningTab` passes `#3B82F6`, `#10B981` and a purple per axis. Those land as **inline
styles**, which no stylesheet can override. The same shape is behind the VTOL toggle and
several icon tiles.

So a CSS-only approach has a hard ceiling, and that ceiling is why the screens still read
as the dark theme with a new font. Ruben's "a font change is not a bridge experience" was
right. `DraggableSlider` now resolves its colour through the theme and cycles amber, sky,
lilac, peach by `bridgeIndex`, passing semantic hex values through untouched. **Every
other component that takes a colour prop needs the same treatment**; grep for
`color = '#` and for hex literals in props.

**Telemetry tile accents use an attribute, because a cycle could not work.** The first
version cycled `:nth-of-type(4n+k)` on `telem-tile`. Each panel is alone in its dockview
wrapper, so every tile is first-of-type and the cycle silently never fired: it would have
shipped as all-amber while the CSS looked busy. Now `data-accent` on `PanelContainer`.

**Short rail labels are capped at 7 characters.** Nine clipped at 96 px. The blocks are
108 px in a 124 px rail and the caption is `flex: none`, so the icon gives way before the
text does. `SETTINGS` became `SETUP`, `FIRMWARE` became `FW`, `COMPANION` became `COMP`,
`MODULES` became `MODS`, `CALIBRATION` became `CAL`.

**Antonio is vendored, not fetched.** The app had no font loading at all. The `@font-face`
points at the vendored file and every rule falls back to a condensed system stack, so the
theme still reads if the file is ever missing. Headings, captions and pills take it;
**values deliberately do not**, because a condensed digit is harder to read at a glance
and these are flight screens.

**Chinese locale resolution was a real bug.** `zh-Hans` and `zh-Hant` both reduce to base
`zh`, nothing shipped matches `zh`, so both fell through to English. Now a script pass
runs first: `Hant`, or `zh` with `TW`/`HK`/`MO`, resolves to `zh-TW`; `Hans` and all other
`zh` to `zh-CN`. A case-insensitive exact match was also added before the base fallback,
because `zh-hant-hk` would otherwise have missed. Bare `zh` goes to `zh-CN` as the larger
population: that is a judgement call and easy to flip.

**Tribute before FTUE.** `TourManager` already deferred a prompt while a guide was on
screen. The tribute joined that same condition rather than getting new machinery.

### FTUE findings

**No tour is broken.** Tours anchor to `data-tour` attributes, so staleness is mechanically
checkable. All 32 anchors the 15 tours reference still resolve in the source. The gap is
coverage, not decay: the newest tour is tagged `beta1` and 140 commits have landed since
`v0.1.1`.

**Two planned tours were dropped as duplicates**, found by reading the existing copy
first. The map-instruments tour already teaches grouping ("Drag one onto another to group
them into a single tray") and already has a Stream step covering RTSP, WebRTC and SRT. So
instrument grouping needs no tour and video streams needs no guide.

**One piece of copy actively misleads.** The mission-planning tour's corridor step says
"set width, strip count and overlap". Since 1.1, corridor width can be derived from the
photo edges with a margin and a band, so a 1.1 user is told to type a number the app now
works out. That step needs rewriting.

**The agreed plan**, anchors placed but tours not written:

1. **Quick Setup**, new tour, 4 steps following the wizard's own order, which I read from
   `STEPS` in the component rather than assuming: select preset, transmitter check,
   review, apply. The wizard shows one step at a time, so each tour step needs
   `setup: () => useQuickSetupStore.getState().setStep(...)`.
2. **Fleet vehicle focus**, new tour, telemetry view, 3 steps. The feature is invisible
   otherwise: it is not a new panel, it is that calibration, motor test, FTP, logs and
   reboot now act on the focused vehicle, and replies only count from it. `FleetStrip`
   only renders on the telemetry dashboard, so the tour cannot reach into the config view;
   steps 2 and 3 reuse `fleet-strip-vehicle` with different copy.
3. **Mission planning**, extend rather than add: rewrite corridor, add turns (grid turn
   guard, camera off on turns), add saving a survey as a project.
4. **Five guides**: SITL launching, CRSF backpack, module manager, telemetry editing
   (#140/#141), language selection.

ArduDeck OS was excluded from FTUE scope by agreement: a large share of the commits, but a
separate surface, not this app's first run.

---

## Open items

1. **Enterprise-console redesign: not started.** The brief escalated to reproducing the
   Enterprise-D bridge console style including sweeping elbow bars, while instructing that
   the trademarked name not appear in the UI or in code comments. The original brief had
   the opposite constraint ("no exact LCARS replica, no elbow shapes"). I built everything
   that is generic console vocabulary (palette, capped cards, pill bars, joined segments,
   condensed labels, black ground) and held the elbow, because reproducing a protected
   layout in software that sells paid modules is a decision for Ruben, and the relayed
   approval never arrived in the session he was actually typing in. **Nothing is blocked
   technically.** If he confirms, the component language above is the foundation and the
   elbow is a frame component plus the rail moving into its column.
2. **No visual verification at all.** Everything is reasoned from three of Ruben's
   screenshots and the stylesheet. A second dev instance was agreed, with its own
   `--user-data-dir` and `--remote-debugging-port=9222`, but I did not start it: a second
   MAVLink client on his live SITL while he was mid-session was not mine to risk. Note
   that `pnpm dev` runs `tools/run-dev.mjs`, which calls `stop-dev-tree.mjs` on exit; that
   only kills descendants of its own turbo ancestor, so it will not touch another tree,
   but calling `electron-vite dev` directly avoids the question.
3. **Blank TELEM block.** Reported against an older build. The active-block contrast bug
   behind it is fixed (the `bg-blue-500/20` active class was being remapped to a 20% amber
   tint, losing the solid palette fill), but the specific report is unconfirmed.
4. **Telemetry status band: not placed.** Deliberately. The telemetry screen is a dockview
   workspace, the brief forbids covering values, and placing a new band into a layout
   never seen rendered is how the warp went wrong the first time. One screenshot and it is
   a short job.
5. **Component language not applied.** `bridge-card`, `bridge-btn`, `bridge-segmented`,
   `bridge-readout` exist and nothing uses them yet. Welcome page, connection panel, top
   bar, Parameters, Telemetry, Fly overlays, Settings and Mission were all in scope.
6. **The warp is unverified.** It was rewritten from 56 rotated divs (Ruben: "a piece of
   garbage") into a canvas starfield: 420 stars projected from a vanishing point, each
   drawn as a line from its previous to its current position so streak length comes from
   real motion, width and alpha scaling with depth, accelerating on a square curve. Nobody
   has seen it.

---

## What was already in the tree

Before any of this work started, the working tree held **12 files of unrelated survey
work** (tie lines). They were never touched, staged or mixed in, and they are still
modified:

```
apps/desktop/src/renderer/components/survey/CameraPresetSelector.tsx
apps/desktop/src/renderer/components/survey/camera-presets.ts
apps/desktop/src/renderer/components/survey/generators/grid-generator.ts
apps/desktop/src/renderer/components/survey/generators/tie-lines.test.ts   (untracked)
apps/desktop/src/renderer/components/survey/mission-builder.ts
apps/desktop/src/renderer/components/survey/survey-presets.ts
apps/desktop/src/renderer/components/survey/survey-stats.ts
apps/desktop/src/renderer/components/survey/survey-types.ts
apps/desktop/src/renderer/stores/survey-store.ts
apps/desktop/src/shared/i18n/locales/de/survey.json
apps/desktop/src/shared/i18n/locales/en/survey.json
```

`SurveyConfigPanel.tsx` is the one overlap: it carried survey work already, and this work
added two `data-tour` attributes to it. Nothing else in that file was touched.

### Vehicle SDK work

**No Vehicle SDK work was uncommitted or in progress in this repository.** The SDK itself
lives in `~/work/ardudeck-vehicle-sdk` (clean, pushed to `main`) and its website in
`~/work/ardudeck-website` (four commits made locally, never pushed, blocked on an SSH key
for the `codeforges` remote).

The one piece of SDK-related work that touched this repository, the fleet mission-start
fix that made `missionAutoMode` pick a mode by firmware family instead of sending
ArduPilot numbers to every vehicle, was already committed by Ruben before this work began.
It is not in these pending changes.
