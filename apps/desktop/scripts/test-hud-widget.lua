-- Round-trip test: encode fields exactly as ArduPilot's calc_* / prep_number
-- do, then decode with the widget's decoders and compare.
-- Runs under Lua 5.4 with a bit32 shim (EdgeTX itself is 5.2).

-- ---- bit32 shim for 5.4 ----
bit32 = {
  band = function (a, b) return a & b end,
  rshift = function (a, n) return a >> n end,
  btest = function (a, b) return (a & b) ~= 0 end,
}

-- ---- EdgeTX API stubs ----
local stubTime = 0
function getTime() return stubTime end
function getRSSI() return 80 end
function getUsage() return 0 end
function crossfireTelemetryPop() return nil end
function loadScript(path)
  if path:find('theme') then
    return function ()
      -- palette stub: plain tables with a few keys; applyTheme pairs() over them
      local function palette()
        return { BG_BASE = 0, SURFACE = 0, TEXT = 0, TEXT_2 = 0, TEXT_3 = 0,
          SUCCESS = 0, WARN = 0, WARN_STRONG = 0, DANGER = 0, INFO = 0,
          ACCENT = 0, GAUGE_FACE = 0, GAUGE_BEZEL = 0, GAUGE_BEZEL_2 = 0,
          GAUGE_EDGE = 0, GAUGE_TICK = 0, GAUGE_NEEDLE = 0, STALE = 0,
          GRID = 0, PILL_ON = 0 }
      end
      return { dark = palette(), light = palette() }
    end
  end
end
function Bitmap_open() return nil end
Bitmap = { open = function () return nil end }
function playFile() end
function getSwitchValue() return false end
lcd = setmetatable({
  RGB = function (v) return v end,
  sizeText = function () return 50 end,
}, { __index = function () return function () end end })
LCD_W, LCD_H = 480, 320
SMLSIZE, MIDSIZE, DBLSIZE, CENTER, RIGHT, VCENTER, SOLID = 0, 0, 0, 0, 0, 0, 0
PLAY_NOW = 0
function playTone() end
function getGeneralSettings() return { battMin = 6.6, battMax = 8.4 } end
function getValue() return nil end

-- Load the widget core by reading the file directly
local chunk = assert(loadfile('resources/edgetx/ardudeck-hud/SD/WIDGETS/ardudeck/loadable.lua'))
-- loadable.lua calls loadScript for theme; our stub handles it.
local M = chunk()

-- Access internals through the decode path: we re-parse the file to grab V.
-- Simpler: drive handlePassthrough via the CRSF pump by faking pop frames.
local frames = {}
function crossfireTelemetryPop()
  local f = table.remove(frames, 1)
  if f then return f[1], f[2] end
  return nil
end

-- Frame layout VERIFIED against Yaapu's decoder + real hardware
-- (2026-08-07): data[1]=0xF0 subtype, appid LE at data[2..3], value LE at
-- data[4..7]. Do NOT change this to match the pump - the pump must match
-- THIS (a previous self-consistent-but-wrong pair shipped NO MAVLINK to
-- the field).
local function pushSingle(appid, value)
  local d = {
    0xF0,
    appid & 0xFF, (appid >> 8) & 0xFF,
    value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >> 24) & 0xFF,
  }
  frames[#frames + 1] = { 0x80, d }
end

-- ---- ArduPilot-side encoders (ported from AP_Frsky_SPort.cpp) ----
local function prep_number(number, digits, power)
  local res = 0
  local abs_number = math.abs(number)
  local function round(x) return math.floor(x + 0.5) end
  if digits == 2 and power == 0 then
    local max_value = number < 0 and ((1 << 6) - 1) or ((1 << 7) - 1)
    res = math.min(abs_number, max_value)
    if number < 0 then res = res | (1 << 6) end
  elseif digits == 2 and power == 1 then
    if abs_number < 100 then res = abs_number << 1
    elseif abs_number < 1270 then res = (round(abs_number * 0.1) << 1) | 0x1
    else res = 0xFF end
    if number < 0 then res = res | (0x1 << 8) end
  elseif digits == 2 and power == 2 then
    if abs_number < 100 then res = abs_number << 2
    elseif abs_number < 1000 then res = (round(abs_number * 0.1) << 2) | 0x1
    elseif abs_number < 10000 then res = (round(abs_number * 0.01) << 2) | 0x2
    elseif abs_number < 127000 then res = (round(abs_number * 0.001) << 2) | 0x3
    else res = 0x1FF end
    if number < 0 then res = res | (0x1 << 9) end
  elseif digits == 3 and power == 1 then
    if abs_number < 1000 then res = abs_number << 1
    elseif abs_number < 10240 then res = (round(abs_number * 0.1) << 1) | 0x1
    else res = 0x7FF end
    if number < 0 then res = res | (0x1 << 11) end
  elseif digits == 3 and power == 2 then
    if abs_number < 1000 then res = abs_number << 2
    elseif abs_number < 10000 then res = (round(abs_number * 0.1) << 2) | 0x1
    elseif abs_number < 100000 then res = (round(abs_number * 0.01) << 2) | 0x2
    elseif abs_number < 1024000 then res = (round(abs_number * 0.001) << 2) | 0x3
    else res = 0xFFF end
    if number < 0 then res = res | (0x1 << 12) end
  end
  return res
end

local failures = 0
local function check(name, got, want, tol)
  tol = tol or 0
  if math.abs(got - want) > tol then
    print(string.format('FAIL %-24s got %-10s want %-10s', name, tostring(got), tostring(want)))
    failures = failures + 1
  else
    print(string.format('ok   %-24s %s', name, tostring(got)))
  end
end

-- Build a widget instance and a helper to run one frame through the pump
local w = M.create({ x = 0, y = 0, w = 480, h = 320 }, {})
local function feed(appid, value)
  pushSingle(appid, value)
  M.background(w)
end

-- ---- 0x5003 battery: 23.4V, 12.6A, 2892 mAh ----
local batt = (234 & 0x1FF) | (prep_number(126, 2, 1) << 9) | ((2892 & 0x7FFF) << 17)
feed(0x5003, batt)

-- ---- 0x5001 ap_status: mode 5 (Loiter), armed, flying, throttle 41% ----
local ap = ((5 + 1) & 0x1F) | (1 << 7) | (1 << 8)
ap = ap | (prep_number(math.floor(41 * 0.63), 2, 0) << 19)
ap = ap | ((45 - 19) << 26) -- imu temp 45C
feed(0x5001, ap)

-- ---- 0x5002 gps: 14 sats, 3D fix, hdop 0.8, alt 587.4m ----
local gps = 14 | (3 << 4) | (prep_number(8, 2, 1) << 6) | (prep_number(5874, 2, 2) << 22)
feed(0x5002, gps)

-- ---- 0x5004 home: 229m away, 63.5m up, bearing 156deg ----
local home = prep_number(229, 3, 2) | (prep_number(635, 3, 2) << 12) | ((math.floor(156 / 3) & 0x7F) << 25)
feed(0x5004, home)

-- ---- 0x5005 velandyaw: vspd -2.5m/s, hspd 12.4m/s, yaw 244deg ----
local vy = prep_number(-25, 2, 1) | (prep_number(124, 2, 1) << 9) | ((math.floor(244 / 0.2 + 0.5) & 0x7FF) << 17)
feed(0x5005, vy)

-- ---- 0x5006 attitude: roll -32.4, pitch 12.6, range 1.34m ----
local att = (math.floor((-32.4 + 180) / 0.2 + 0.5) & 0x7FF)
att = att | ((math.floor((12.6 + 90) / 0.2 + 0.5) & 0x3FF) << 11)
att = att | (prep_number(134, 3, 1) << 21)
feed(0x5006, att)

-- ---- 0x800 GPS coords: 42.4411, 19.2632 ----
local latv = math.floor(42.4411 * 600000 + 0.5)
feed(0x800, latv)
local lonv = math.floor(19.2632 * 600000 + 0.5) | (0x1 << 30)
feed(0x800, lonv)

-- ---- read back through the module's state via its render path ----
-- loadable.lua keeps V as an upvalue; expose via a debug hook: we re-run
-- ladder/draw and capture drawText calls instead. Simpler: the module was
-- written with V as a local; for the test we reach it through the debug
-- library.
local Vfound
for i = 1, 200 do
  local name, val = debug.getupvalue(M.background, i)
  if not name then break end
  if name == 'pump' then
    for j = 1, 200 do
      local n2, v2 = debug.getupvalue(val, j)
      if not n2 then break end
      if n2 == 'handlePassthrough' then
        for k = 1, 200 do
          local n3, v3 = debug.getupvalue(v2, k)
          if not n3 then break end
          if n3 == 'V' then Vfound = v3 break end
        end
      end
    end
  end
end
assert(Vfound, 'could not locate V state table')
local V = Vfound

check('batt voltage', V.voltV, 23.4, 0.05)
check('batt current', V.currA, 12.6, 0.5)
check('batt mah', V.mah, 2892)
check('mode num', V.modeNum, 5)
check('armed', V.armed and 1 or 0, 1)
check('flying', V.flying and 1 or 0, 1)
check('throttle', V.throttle, math.floor(41 * 0.63))
check('imu temp', V.imuTemp, 45)
check('sats', V.sats, 14)
check('fix', V.fix, 3)
check('hdop', V.hdop, 0.8, 0.05)
check('gps alt (2-digit quantized)', V.gpsAltM, 590, 0.1)
check('home dist', V.homeDistM, 229)
check('home alt', V.homeAltM, 63.5, 0.1)
check('home bearing', V.homeBearingDeg, 156, 3)
check('vspd', V.vspdMs, -2.5, 0.05)
check('hspd (2-digit quantized)', V.hspdMs, 12.0, 0.05)
check('yaw', V.yawDeg, 244, 0.2)
check('roll', V.rollDeg, -32.4, 0.2)
check('pitch', V.pitchDeg, 12.6, 0.2)
check('range', V.rangeM, 1.34, 0.01)
check('lat', V.lat, 42.4411, 0.0001)
check('lon', V.lon, 19.2632, 0.0001)

-- ELRS MAVLink mode: position arrives as the EdgeTX "GPS" sensor (native
-- CRSF GPS frame), not passthrough 0x800. The widget must poll it.
function getValue(name)
  if name == 'GPS' then return { lat = 47.51234, lon = 8.54321 } end
  return nil
end
stubTime = stubTime + 100 -- get past the poll throttle
M.background(w)
check('lat via GPS sensor', V.lat, 47.51234, 0.0001)
check('lon via GPS sensor', V.lon, 8.54321, 0.0001)

-- FC remaining-% via the CRSF battery frame ("Bat%" sensor): the battery
-- tile's pct source when no capacity is configured and 0x5007 never came
function getFieldInfo(name) return name == 'Bat%' and {} or nil end
function getValue(name)
  if name == 'Bat%' then return 76 end
  return nil
end
stubTime = stubTime + 100
M.background(w)
check('remaining %% via Bat%% sensor', V.sensorPct, 76)
function getValue() return nil end
function getFieldInfo() return nil end

-- Render-path smoke test: with frames fed, ladder is LIVE and refresh runs
-- drawLive over the full default layout. Catches forward-reference nils and
-- draw-time crashes that a parse check cannot (this exact class shipped a
-- "attempt to index nil" to the radio once).
local okLive, errLive = pcall(function () M.refresh(w, nil, nil) end)
check('refresh (LIVE path) runs', okLive and 1 or 0, 1)
if not okLive then print('  refresh error: ' .. tostring(errLive)) end

-- Resolution independence: a TX16S-class LCD (480x272) must load and render
-- the default (480x320-authored) layout without crashing - layouts rescale
-- into the fixed-chrome band (header 48 / ticker 72).
LCD_W, LCD_H = 480, 272
local M272 = assert(loadfile('resources/edgetx/ardudeck-hud/SD/WIDGETS/ardudeck/loadable.lua'))()
local w272 = M272.create({ x = 0, y = 0, w = 480, h = 272 }, {})
local ok272, err272 = pcall(function () M272.refresh(w272, nil, nil) end)
check('refresh @480x272 runs', ok272 and 1 or 0, 1)
if not ok272 then print('  refresh error: ' .. tostring(err272)) end
LCD_W, LCD_H = 480, 320

print(failures == 0 and 'ALL PASS' or (failures .. ' FAILURES'))
os.exit(failures == 0 and 0 or 1)
