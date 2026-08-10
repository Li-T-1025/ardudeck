-- Monochrome HUD script test: feeds the SAME ArduPilot-encoded frames the
-- widget harness uses and expects identical decodes - this is what keeps
-- the copied decoder core in SDBW/SCRIPTS/TELEMETRY/ArduDk.lua from
-- drifting from the widget's. Plus render smokes at 128x64 and 212x64.
-- Run from apps/desktop: lua scripts/test-hud-bw.lua

bit32 = {
  band = function (a, b) return a & b end,
  rshift = function (a, n) return a >> n end,
  btest = function (a, b) return (a & b) ~= 0 end,
}

local stubTime = 0
function getTime() return stubTime end
function getRSSI() return 80 end
function getUsage() return 0 end
function playFile() end
function playTone() end
function getValue() return nil end
function io.open() return nil end
lcd = setmetatable({
  clear = function () end,
}, { __index = function () return function () end end })
LCD_W, LCD_H = 128, 64
SMLSIZE, MIDSIZE, DBLSIZE, INVERS, BLINK, PLAY_NOW = 0, 0, 0, 0, 0, 0
SOLID, FORCE, RIGHT = 0, 0, 0
EVT_VIRTUAL_NEXT = 97 -- real value so the page-flip smoke actually flips

local frames = {}
function crossfireTelemetryPop()
  local f = table.remove(frames, 1)
  if f then return f[1], f[2] end
  return nil
end

-- Verified frame layout (see test-hud-widget.lua for provenance)
local function pushSingle(appid, value)
  local d = {
    0xF0,
    appid & 0xFF, (appid >> 8) & 0xFF,
    value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >> 24) & 0xFF,
  }
  frames[#frames + 1] = { 0x80, d }
end

-- ArduPilot-side encoder (identical copy from test-hud-widget.lua)
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

local S = assert(loadfile('resources/edgetx/ardudeck-hud/SDBW/SCRIPTS/TELEMETRY/ArduDk.lua'))()
S.init()

local function feed(appid, value)
  pushSingle(appid, value)
  S.background()
end

-- Same fixture values as the widget harness
feed(0x5003, (234 & 0x1FF) | (prep_number(126, 2, 1) << 9) | ((2892 & 0x7FFF) << 17))
local ap = ((5 + 1) & 0x1F) | (1 << 7) | (1 << 8)
ap = ap | (prep_number(math.floor(41 * 0.63), 2, 0) << 19)
ap = ap | ((45 - 19) << 26)
feed(0x5001, ap)
feed(0x5002, 14 | (3 << 4) | (prep_number(8, 2, 1) << 6) | (prep_number(5874, 2, 2) << 22))
feed(0x5004, prep_number(229, 3, 2) | (prep_number(635, 3, 2) << 12) | ((math.floor(156 / 3) & 0x7F) << 25))
feed(0x5005, prep_number(-25, 2, 1) | (prep_number(124, 2, 1) << 9) | ((math.floor(244 / 0.2 + 0.5) & 0x7FF) << 17))
feed(0x5006, (math.floor((-32.4 + 180) / 0.2 + 0.5) & 0x7FF)
  | ((math.floor((12.6 + 90) / 0.2 + 0.5) & 0x3FF) << 11)
  | (prep_number(134, 3, 1) << 21))
feed(0x800, math.floor(42.4411 * 600000 + 0.5))
feed(0x800, math.floor(19.2632 * 600000 + 0.5) | (0x1 << 30))

-- reach V through the script's pump closure (same technique as the widget
-- harness)
local Vfound
for i = 1, 200 do
  local name, val = debug.getupvalue(S.background, i)
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
check('sats', V.sats, 14)
check('fix', V.fix, 3)
check('hdop', V.hdop, 0.8, 0.05)
check('gps alt', V.gpsAltM, 590, 0.1)
check('home dist', V.homeDistM, 229)
check('home bearing', V.homeBearingDeg, 156, 3)
check('vspd', V.vspdMs, -2.5, 0.05)
check('hspd', V.hspdMs, 12.0, 0.05)
check('yaw', V.yawDeg, 244, 0.2)
check('lat', V.lat, 42.4411, 0.0001)
check('lon', V.lon, 19.2632, 0.0001)

-- render smokes: LIVE both pages, ladder, at both B&W resolutions
for _, dims in ipairs({ { 128, 64 }, { 212, 64 } }) do
  LCD_W, LCD_H = dims[1], dims[2]
  local ok1 = pcall(function () S.run(0) end)         -- page 1 LIVE
  local ok2 = pcall(function () S.run(EVT_VIRTUAL_NEXT or 97) end)
  check('run page1 @' .. dims[1] .. 'x64', ok1 and 1 or 0, 1)
  check('run page2 @' .. dims[1] .. 'x64', ok2 and 1 or 0, 1)
end
-- ladder path (telemetry stale)
stubTime = 10000
local okLadder = pcall(function () S.run(0) end)
check('run ladder path', okLadder and 1 or 0, 1)

print(failures == 0 and 'ALL PASS' or (failures .. ' FAILURES'))
os.exit(failures == 0 and 0 or 1)
