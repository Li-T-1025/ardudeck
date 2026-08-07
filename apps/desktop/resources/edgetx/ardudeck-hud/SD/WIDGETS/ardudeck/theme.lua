-- ArduDeck HUD brand tokens, dark and light.
-- GENERATED CONTRACT: values trace to apps/desktop/src/renderer/styles/globals.css
-- (:root = dark, .light override) and the ardudeck-website cookbook. Do not
-- invent colors; if a value is missing, read the app source and add it with
-- its source line. GRID and PILL_ON are pre-blended (RGB565 has no alpha):
-- GRID = 5% accent-teal over BG_BASE, PILL_ON = 20% success over SURFACE.

local dark = {
  BG_BASE       = lcd.RGB(0x0a0a0f),  -- --bg-base
  SURFACE       = lcd.RGB(0x1f2937),  -- --bg-solid
  SURFACE_UP    = lcd.RGB(0x374151),  -- --bg-inset
  TEXT          = lcd.RGB(0xffffff),  -- --text-primary
  TEXT_2        = lcd.RGB(0x9ca3af),  -- --text-secondary
  TEXT_3        = lcd.RGB(0x6b7280),  -- --text-tertiary
  SUCCESS       = lcd.RGB(0x34d399),  -- --status-success
  WARN          = lcd.RGB(0xfbbf24),  -- --status-warn
  WARN_STRONG   = lcd.RGB(0xf59e0b),  -- --gauge-amber
  DANGER        = lcd.RGB(0xf87171),  -- --status-danger; ARMED, never green
  INFO          = lcd.RGB(0x60a5fa),  -- --status-info
  ACCENT        = lcd.RGB(0x2dd4bf),  -- website accent-teal; brand only
  GAUGE_FACE    = lcd.RGB(0x16181d),
  GAUGE_BEZEL   = lcd.RGB(0x1b2230),
  GAUGE_BEZEL_2 = lcd.RGB(0x0b0e14),
  GAUGE_EDGE    = lcd.RGB(0x374151),
  GAUGE_TICK    = lcd.RGB(0xe5e7eb),
  GAUGE_NEEDLE  = lcd.RGB(0xffffff),
  STALE         = lcd.RGB(0x6b7280),
  GRID          = lcd.RGB(0x0c1418),
  PILL_ON       = lcd.RGB(0x1c3a31),
}

-- .light override: white faces, near-black markings ("markings must never be
-- mid-grey"). Sunlight-readable choice for bright days.
local light = {
  BG_BASE       = lcd.RGB(0xf5f6f8),  -- .light --bg-base
  SURFACE       = lcd.RGB(0xffffff),  -- .light --bg-solid
  SURFACE_UP    = lcd.RGB(0xe0e2e7),  -- .light --bg-inset
  TEXT          = lcd.RGB(0x111827),  -- .light --text-primary
  TEXT_2        = lcd.RGB(0x4b5563),  -- .light --text-secondary
  TEXT_3        = lcd.RGB(0x9ca3af),  -- .light --text-tertiary
  SUCCESS       = lcd.RGB(0x16a34a),  -- .light --status-success
  WARN          = lcd.RGB(0xd97706),  -- .light --status-warn
  WARN_STRONG   = lcd.RGB(0xf59e0b),  -- .light --gauge-amber
  DANGER        = lcd.RGB(0xdc2626),  -- .light --status-danger
  INFO          = lcd.RGB(0x2563eb),  -- .light --status-info
  ACCENT        = lcd.RGB(0x0d9488),  -- accent-teal darkened for white bg
  GAUGE_FACE    = lcd.RGB(0xfbfbfd),  -- .light --gauge-face
  GAUGE_BEZEL   = lcd.RGB(0xf5f6f8),  -- .light --gauge-bezel
  GAUGE_BEZEL_2 = lcd.RGB(0xc3c9d3),  -- .light --gauge-bezel-2
  GAUGE_EDGE    = lcd.RGB(0xa6adba),  -- .light --gauge-bezel-edge
  GAUGE_TICK    = lcd.RGB(0x111827),  -- .light --gauge-tick-major
  GAUGE_NEEDLE  = lcd.RGB(0x111827),  -- .light --gauge-needle
  STALE         = lcd.RGB(0x9ca3af),
  GRID          = lcd.RGB(0xebf4f5),  -- 5% teal over light bg-base
  PILL_ON       = lcd.RGB(0xd0eddb),  -- 20% light success over white
}

return { dark = dark, light = light }
