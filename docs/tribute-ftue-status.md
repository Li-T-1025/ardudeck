# ArduDeck 1.2 tribute: Bridge theme and FTUE status

Written 2026-10-30. Nothing here is committed. Follows `handover-tribute-ftue.md`.

## Done and seen on Ruben's running instance (MCP screenshots)

- Bridge frame: top and bottom elbows as one SVG shape each (`components/bridge/BridgeFrame.tsx`, `ELBOW`), rail as the column between them, bar segments with view, clock, release, link and UTC.
- Rail: one column edge for elbow, blocks, utilities and foot (x 8, width 116, measured); blocks never shrink; short windows scroll the column; utilities pinned at the foot with a fade; active block full colour with a black inset ring, others at 85 %.
- Pure black ground and the six-colour palette (amber, peach, lilac, sky, salmon, tan) as tokens.
- Shared classes restyled in Bridge: `.btn` pills (primary amber, secondary lilac), `.tab-group` joined pills, `.input` / `.select` black with amber focus, `.label`, `.card` palette caps. This is what made Connect and the transport switch stop being blue.
- Top bar: pill cap, ARDUDECK in Antonio, outlined status pills.
- Welcome: hero over the starfield, logo and title scale with the window, tool cards as console cards.
- Parameters: config group tabs as palette chips, PID sliders cycling amber, sky, lilac, peach, VTOL toggle and header tile in amber.
- Fly: instrument cards (EKF, flight control, sticks) with palette caps.
- Settings: panels and stat tiles with palette caps.
- Tribute banner collapses to one line below 820 px of window height.
- Dark theme checked unchanged (Ruben switched to it himself).

## Done, not yet seen

- Fly status band (`QuickStatsBar`): stats as capped readout blocks, values mono 16 px, status colours kept.
- Parameters > All Parameters console table (CSS from the previous session).
- Tours: `quick-setup-msp-v012`, `fleet-focus-v012`, `mission-planning-v012` (corridor rewritten, turns, project, waypoint heading).
- Guides with demos: `sitl-launch-v1`, `crsf-backpack-v1`, `cargo-manager-v1`, `in-flight-adjust-v1`, `language-v1`.
- Locales: en and de written by hand against the on-screen terms; zh-CN and zh-TW translated against each locale's own control names. `scan.cjs check`: 0 missing keys; `verify-locale de`: 0 problems.

## Decisions worth keeping

- The Quick Setup tour never changes wizard steps: `ApplyStep` applies the preset on mount, so a tour step setting `apply` would write to the flight controller.
- Bridge changes are CSS on `.bridge` plus inert class hooks; the elbows are added in React slots so switching theme never remounts the rail or the views.
- Values never use Antonio; status colours (green, amber, red) are never remapped.

## Pre-existing test failures (not from this work)

- `renderer/components/camera/GimbalPad.test.tsx`: timing-based zoom tests, flaky.
- `renderer/components/telemetry/workspace-layouts.test.ts`: reads `process.cwd()/src`, fails when run from the repo root.
- `renderer/components/map/proximity-sectors.test.ts` (untracked, another session): tsc errors, would block a typecheck gate.

## Open

- Screenshots of the five guide demos, the three tours and the two Bridge views above, when Ruben has a window free.
- `QuickSetupWizard.tsx` keeps CRLF line endings; the diff is only the four `data-tour` wrappers.
