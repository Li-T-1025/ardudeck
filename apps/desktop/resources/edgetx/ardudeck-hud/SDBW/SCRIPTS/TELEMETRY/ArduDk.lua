-- ArduDeck HUD mini: monochrome EdgeTX radios (128x64 / 212x64).
-- Telemetry SCRIPT (these radios have no widget API): 1-bit, two pages,
-- same diagnostic ladder and voice pack as the color widget.
--
-- DECODER CORE COPIED FROM ../../WIDGETS/ardudeck/loadable.lua - the
-- harness (scripts/test-hud-bw.lua) feeds both the same frames; if you
-- touch a decoder here or there, keep them identical or the test fails.
-- Frame layout verified against Yaapu's decoder + real hardware:
-- cmd 0x80/0x7F, data[1]=subtype; 0xF0 single: appid LE data[2..3],
-- value LE data[4..7]; 0xF1 text: severity data[2], chars data[3+];
-- 0xF2 array: count data[2], 6-byte entries from data[3].

local band, rshift, btest = bit32.band, bit32.rshift, bit32.btest

local MODES = {
  [0]='STABILIZE','ACRO','ALT HOLD','AUTO','GUIDED','LOITER','RTL','CIRCLE',
  [9]='LAND',[11]='DRIFT',[13]='SPORT',[14]='FLIP',[15]='AUTOTUNE',
  [16]='POSHOLD',[17]='BRAKE',[18]='THROW',[20]='GUIDED NOGPS',
  [21]='SMART RTL',[22]='FLOWHOLD',[24]='ZIGZAG',[27]='AUTO RTL',
}

-- Everything between the strips is a slot, editable from ArduDeck via
-- hud.cfg: bw_big (large top-left readout), bw_l1..4 (left rows),
-- bw_center (horizon | slots), bw_c1..10 (center data columns when
-- bw_center=slots), bw_slot1..5 (right column), bw_wslot1..5 (212px
-- second column). Only the top/bottom strips are fixed (honesty chrome).
local CFG = { name = '', cells = 0, capacity = 0, low_cell = 3.6, crit_cell = 3.4,
  big = 'volt',
  left = { 'cellpct', 'curr', 'mah', 'thr' },
  center = 'horizon',
  cslots = { 'alt', 'spd', 'vspd', 'sat', 'home', 'wind', 'hdop', 'rng', 'wp', 'yaw' },
  slots = { 'alt', 'spd', 'vspd', 'sat', 'home' },
  wslots = { 'wind', 'hdop', 'rng', 'imu', 'wp' } }

local V = {
  lastFrameT = 0, lastStreamT = 0, everFrame = false,
  modeNum = -1, armed = false, flying = false,
  battFs = false, ekfBad = false, anyFs = false, fenceBreach = false,
  throttle = 0, imuTemp = 0,
  sats = 0, fix = 0, hdop = 0, gpsAltM = 0,
  voltV = 0, currA = 0, mah = 0,
  homeDistM = 0, homeAltM = 0, homeBearingDeg = 0,
  vspdMs = 0, hspdMs = 0, yawDeg = 0,
  rollDeg = 0, pitchDeg = 0, rangeM = 0,
  lat = nil, lon = nil,
  windDirDeg = 0, windMs = 0,
  autoCapacity = 0, maxVolt = 0,
  wpNum = 0, wpDistM = 0, wpBearingDeg = 0, tWp = 0,
  sensorPct = nil, tSensorPct = 0,
  armedAtT = nil, armedAccum = 0,
  msgs = {}, msgHead = 0, msgBuf = '', lastToneT = 0,
}

local function now() return getTime() end

-- ======================= prep_number decoders ==========================
local function dec_2_1(v)
  local n = band(rshift(v, 1), 0x7F)
  if btest(v, 0x01) then n = n * 10 end
  if btest(v, 0x100) then n = -n end
  return n
end
local function dec_2_2(v)
  local n = band(rshift(v, 2), 0x7F) * (10 ^ band(v, 0x03))
  if btest(v, 0x200) then n = -n end
  return n
end
local function dec_3_1(v)
  local n = band(rshift(v, 1), 0x3FF)
  if btest(v, 0x01) then n = n * 10 end
  if btest(v, 0x800) then n = -n end
  return n
end
local function dec_3_2(v)
  local n = band(rshift(v, 2), 0x3FF) * (10 ^ band(v, 0x03))
  if btest(v, 0x1000) then n = -n end
  return n
end
local function dec_2_0(v)
  local n = band(v, 0x3F)
  if btest(v, 0x40) then n = -n end
  return n
end

-- ============================ voice ====================================
local function playAlert(name)
  playFile('/WIDGETS/ardudeck/snd/' .. name .. '.wav')
end

local MSG_SOUNDS = {
  { 'PreArm', 'arm_denied' },
  { 'AutoTune: Success', 'autotune_done' },
  { 'AutoTune: Failed', 'autotune_failed' },
  { 'GPS Glitch', 'gps_glitch' },
  { 'Glitch cleared', 'glitch_cleared' },
  { 'variance', 'ekf_variance' },
  { 'is using GPS', 'ekf_using_gps' },
  { 'EKF primary changed', 'ekf_lane' },
  { 'yaw alignment complete', 'yaw_aligned' },
  { 'yaw re-aligned', 'yaw_aligned' },
  { 'Radio Failsafe', 'rc_failsafe' },
  { 'Crash: Disarming', 'crash' },
  { 'Terrain data missing', 'terrain_missing' },
  { 'Mission complete', 'mission_complete' },
  { 'Vibration compensation ON', 'high_vibe' },
  { 'is low', 'batt_low' },
  { 'is critical', 'batt_crit' },
}

local lastSpokenT = -1000
local function pushMsg(sev, text)
  V.msgHead = V.msgHead % 4 + 1
  V.msgs[V.msgHead] = { t = now(), sev = sev, text = text }
  for i = 1, #MSG_SOUNDS do
    if string.find(text, MSG_SOUNDS[i][1], 1, true) then
      if now() - lastSpokenT > 500 then
        lastSpokenT = now()
        playAlert(MSG_SOUNDS[i][2])
      end
      return
    end
  end
  if sev <= 4 and now() - V.lastToneT > 100 then
    V.lastToneT = now()
    playTone(sev <= 3 and 1600 or 900, 200, 50, PLAY_NOW)
  end
end

-- ========================= appid dispatch ==============================
local decoders = {}

decoders[0x5001] = function (d)
  V.modeNum = band(d, 0x1F) - 1
  V.flying = btest(d, 2 ^ 7)
  V.armed = btest(d, 2 ^ 8)
  V.battFs = btest(d, 2 ^ 9)
  V.ekfBad = btest(d, 2 ^ 10)
  V.anyFs = btest(d, 2 ^ 12)
  V.fenceBreach = btest(d, 2 ^ 14)
  V.throttle = dec_2_0(band(rshift(d, 19), 0x7F))
  V.imuTemp = band(rshift(d, 26), 0x3F) + 19
  V.tAp = now(); V.lastStreamT = V.tAp
end

decoders[0x5002] = function (d)
  V.sats = band(d, 0x0F)
  V.fix = band(rshift(d, 4), 0x03)
  V.hdop = dec_2_1(band(rshift(d, 6), 0x1FF)) * 0.1
  V.gpsAltM = dec_2_2(band(rshift(d, 22), 0x3FF)) * 0.1
  V.lastStreamT = now()
end

decoders[0x5003] = function (d)
  V.voltV = band(d, 0x1FF) * 0.1
  V.currA = dec_2_1(band(rshift(d, 9), 0x1FF)) * 0.1
  V.mah = band(rshift(d, 17), 0x7FFF)
  if V.voltV > V.maxVolt then V.maxVolt = V.voltV end
  V.lastStreamT = now()
end

decoders[0x5004] = function (d)
  V.homeDistM = dec_3_2(band(d, 0x1FFF))
  V.homeAltM = dec_3_2(band(rshift(d, 12), 0x1FFF)) * 0.1
  V.homeBearingDeg = band(rshift(d, 25), 0x7F) * 3
end

decoders[0x5005] = function (d)
  V.vspdMs = dec_2_1(band(d, 0x1FF)) * 0.1
  V.hspdMs = dec_2_1(band(rshift(d, 9), 0x1FF)) * 0.1
  V.yawDeg = band(rshift(d, 17), 0x7FF) * 0.2
  V.lastStreamT = now()
end

decoders[0x5006] = function (d)
  V.rollDeg = band(d, 0x7FF) * 0.2 - 180
  V.pitchDeg = band(rshift(d, 11), 0x3FF) * 0.2 - 90
  V.rangeM = dec_3_1(band(rshift(d, 21), 0x7FF)) * 0.01
  V.lastStreamT = now()
end

decoders[0x5007] = function (d)
  local id = band(rshift(d, 24), 0xFF)
  if id == 4 then V.autoCapacity = band(d, 0xFFFFFF) end
end

decoders[0x500D] = function (d)
  V.wpNum = band(d, 0x7FF)
  V.wpDistM = dec_3_2(band(rshift(d, 11), 0x1FFF))
  V.wpBearingDeg = band(rshift(d, 23), 0x7F) * 3
  V.tWp = now()
end

decoders[0x500C] = function (d)
  V.windDirDeg = dec_2_0(band(d, 0x7F)) * 3
  V.windMs = dec_2_1(band(rshift(d, 7), 0x1FF)) * 0.1
end

decoders[0x800] = function (d)
  local coord = band(d, 0x3FFFFFFF) / 600000
  if btest(d, 0x80000000) then coord = -coord end
  if btest(d, 0x40000000) then V.lon = coord else V.lat = coord end
  V.lastStreamT = now()
end

decoders[0x5000] = function (d)
  local done = false
  local sev = 0
  for i = 0, 3 do
    local b = band(rshift(d, i * 8), 0xFF)
    local c = band(b, 0x7F)
    if i < 3 and btest(b, 0x80) then sev = sev + 2 ^ i end
    if c == 0 then done = true break end
    V.msgBuf = V.msgBuf .. string.char(c)
  end
  if done then
    pushMsg(band(sev, 0x07), V.msgBuf)
    V.msgBuf = ''
  end
end

local function handlePassthrough(appid, data)
  V.everFrame = true
  V.lastFrameT = now()
  local dec = decoders[appid]
  if dec then dec(data) end
end

local function bytesToU32(data, ofs)
  return data[ofs] + data[ofs + 1] * 256 + data[ofs + 2] * 65536 + data[ofs + 3] * 16777216
end

local function pump()
  for _ = 1, 32 do
    if getUsage() > 70 then break end
    local cmd, data = crossfireTelemetryPop()
    if cmd == nil then break end
    if (cmd == 0x80 or cmd == 0x7F) and data ~= nil then
      local sub = data[1]
      if sub == 0xF0 and #data >= 7 then
        handlePassthrough(data[2] + data[3] * 256, bytesToU32(data, 4))
      elseif sub == 0xF2 and #data >= 8 then
        local count = data[2]
        local ofs = 3
        for _ = 1, count do
          if #data < ofs + 5 then break end
          handlePassthrough(data[ofs] + data[ofs + 1] * 256, bytesToU32(data, ofs + 2))
          ofs = ofs + 6
        end
      elseif sub == 0xF1 and #data >= 3 then
        local text = ''
        for i = 3, #data do
          local c = band(data[i], 0x7F)
          if c == 0 then break end
          text = text .. string.char(c)
        end
        if #text > 0 then pushMsg(band(data[2], 0x07), text) end
        V.everFrame = true
        V.lastFrameT = now()
      end
    end
  end
end

-- ELRS MAVLink mode: position + remaining-% ride the native CRSF sensors,
-- not passthrough (same finding as the color widget)
local lastGpsPollT = 0
local function pollSensors()
  if now() - lastGpsPollT < 50 then return end
  lastGpsPollT = now()
  local g = getValue('GPS')
  if type(g) == 'table' and g.lat and g.lon and (g.lat ~= 0 or g.lon ~= 0) then
    V.lat = g.lat
    V.lon = g.lon
  end
  if getFieldInfo and getFieldInfo('Bat%') then
    local p = getValue('Bat%')
    if type(p) == 'number' and p >= 1 and p <= 100 then
      V.sensorPct = p
      V.tSensorPct = now()
    end
  end
end

-- ====================== transitions -> voice ===========================
local prevArmed, prevLive = nil, nil
local prevBattBand = nil
local BAND_ORDER = { ok = 1, half = 2, low = 3, crit = 4 }
local BAND_SOUND = { half = 'batt_50', low = 'batt_low', crit = 'batt_crit' }
local prevFence, prevEkf = false, false

local function effBattery()
  local capacity = CFG.capacity > 0 and CFG.capacity or V.autoCapacity
  local cells = CFG.cells
  if cells <= 0 and V.maxVolt > 6 then
    cells = math.floor(V.maxVolt / 4.3) + 1
  end
  return capacity, cells
end

local function battBand()
  local capacity, cells = effBattery()
  local pct = nil
  if capacity > 0 then
    pct = math.max(0, math.min(100, (capacity - V.mah) / capacity * 100))
  elseif V.sensorPct and now() - V.tSensorPct < 600 then
    pct = V.sensorPct
  end
  if pct then
    if pct <= 15 then return 'crit' end
    if pct <= 30 then return 'low' end
    if pct <= 50 then return 'half' end
    return 'ok'
  end
  local cellV = cells > 0 and V.voltV / cells or nil
  if not cellV or V.voltV < 6 then return nil end
  if cellV <= CFG.crit_cell then return 'crit' end
  if cellV <= CFG.low_cell then return 'low' end
  return 'ok'
end

local function announceTransitions(live)
  if prevArmed ~= nil and V.armed ~= prevArmed then
    playAlert(V.armed and 'armed' or 'disarmed')
    if V.armed then
      V.armedAtT = now()
    elseif V.armedAtT then
      V.armedAccum = V.armedAccum + (now() - V.armedAtT)
      V.armedAtT = nil
    end
  end
  prevArmed = V.armed
  if prevLive ~= nil and live ~= prevLive then
    playAlert(live and 'telemetry_ok' or 'telemetry_lost')
  end
  prevLive = live
  local b = battBand()
  if b and prevBattBand and b ~= prevBattBand and BAND_ORDER[b] > BAND_ORDER[prevBattBand] then
    local snd = BAND_SOUND[b]
    if snd then playAlert(snd) end
  end
  prevBattBand = b
  if V.fenceBreach and not prevFence then playAlert('fence_breach') end
  prevFence = V.fenceBreach
  if V.ekfBad and not prevEkf then playAlert('ekf_warn') end
  prevEkf = V.ekfBad
end

-- ======================= diagnostic ladder =============================
local function ladderState()
  local rssi = getRSSI()
  if rssi == nil or rssi == 0 then
    return 'NO LINK', 'check RX power / binding'
  end
  local t = now()
  if not V.everFrame or t - V.lastFrameT > 300 then
    return 'NO MAVLINK', 'ELRS MAVLink mode off?'
  end
  if t - V.lastStreamT > 300 then
    return 'STREAMS OFF', 'connect ArduDeck once'
  end
  return 'LIVE', nil
end

-- =========================== config ====================================
local function loadCfg()
  local f = io.open('/WIDGETS/ardudeck/hud.cfg', 'r')
  if not f then return end
  local raw = io.read(f, 2048)
  io.close(f)
  if type(raw) ~= 'string' then return end
  for k, v in string.gmatch(raw, '([%w_]+)=([^\r\n]+)') do
    if k == 'name' then CFG.name = v
    elseif k == 'cells' or k == 'capacity' or k == 'low_cell' or k == 'crit_cell' then
      CFG[k] = tonumber(v) or CFG[k]
    elseif k == 'bw_big' then CFG.big = v
    elseif k == 'bw_center' then CFG.center = v
    else
      local n = string.match(k, '^bw_slot(%d)$')
      local wn = string.match(k, '^bw_wslot(%d)$')
      local ln = string.match(k, '^bw_l(%d)$')
      local cn = string.match(k, '^bw_c(%d+)$')
      if n then CFG.slots[tonumber(n)] = v
      elseif wn then CFG.wslots[tonumber(wn)] = v
      elseif ln then CFG.left[tonumber(ln)] = v
      elseif cn then CFG.cslots[tonumber(cn)] = v end
    end
  end
end

-- ============================ drawing ==================================
local page = 1
local PAGES = 2

local function fmtTimer()
  local t = V.armedAccum + (V.armedAtT and (now() - V.armedAtT) or 0)
  local s = math.floor(t / 100)
  return string.format('%02d:%02d', math.floor(s / 60), s % 60)
end

local function drawLadder(state, hint)
  lcd.drawText(LCD_W / 2 - #state * 5, 18, state, DBLSIZE + BLINK)
  lcd.drawText(LCD_W / 2 - #hint * 2, 42, hint, SMLSIZE)
  lcd.drawText(0, 56, 'ArduDeck', SMLSIZE)
end

local function battPct()
  local capacity, cells = effBattery()
  if capacity > 0 then
    return math.max(0, math.min(100, (capacity - V.mah) / capacity * 100))
  end
  return V.sensorPct
end

-- Slot fields: each returns a compact row string (and an optional BLINK).
-- KEEP IDS IN SYNC with BW_FIELDS in RadioHudView.tsx.
local FIELDS = {
  volt = function () return string.format('%.1fV', V.voltV) end,
  cellv = function ()
    local _, cells = effBattery()
    if cells <= 0 then return '--v/c' end
    return string.format('%.2fv/c', V.voltV / cells)
  end,
  pct = function ()
    local p = battPct()
    if not p then return '--%' end
    return string.format('%d%%', math.floor(p + 0.5)), p <= 15
  end,
  cellpct = function ()
    local _, cells = effBattery()
    local p = battPct()
    local t = cells > 0 and string.format('%.2fv/c', V.voltV / cells) or ''
    if p then t = t .. string.format(' %d%%', math.floor(p + 0.5)) end
    return t ~= '' and t or '--'
  end,
  curr = function () return string.format('%.1fA', V.currA) end,
  mah = function () return string.format('%dmAh', V.mah) end,
  alt = function () return string.format('A%dm', math.floor(V.gpsAltM + 0.5)) end,
  spd = function () return string.format('S%.1f', V.hspdMs) end,
  vspd = function () return string.format('V%+.1f', V.vspdMs) end,
  sat = function ()
    return string.format('%ds%s', V.sats, V.fix >= 3 and '3D' or (V.fix == 2 and '2D' or '--')),
      V.fix < 3
  end,
  home = function () return string.format('H%dm', math.floor(V.homeDistM + 0.5)) end,
  wind = function () return string.format('w%.1fm', V.windMs) end,
  hdop = function () return string.format('hd%.1f', V.hdop), V.hdop > 2 end,
  rng = function () return string.format('r%.1fm', V.rangeM) end,
  imu = function () return string.format('i%dC', V.imuTemp), V.imuTemp > 60 end,
  wp = function ()
    if V.wpNum <= 0 then return 'wp--' end
    return string.format('wp%d %dm', V.wpNum, math.floor(V.wpDistM + 0.5))
  end,
  thr = function () return string.format('t%d%%', V.throttle) end,
  yaw = function () return string.format('%03d', math.floor(V.yawDeg + 0.5) % 360) end,
  none = function () return '' end,
}

local function drawSlots(list, x, y0, count)
  for i = 1, count or #list do
    local f = FIELDS[list[i]]
    if f then
      local text, blink = f()
      lcd.drawText(x, y0 + (i - 1) * 8, text, SMLSIZE + (blink and BLINK or 0))
    end
  end
end

-- Large top-left readout (DBLSIZE number + unit tag)
local BIG = {
  volt = function () return string.format('%.1f', V.voltV), 'V' end,
  pct = function ()
    local p = battPct()
    return p and string.format('%d', math.floor(p + 0.5)) or '--', '%'
  end,
  alt = function () return string.format('%d', math.floor(V.gpsAltM + 0.5)), 'm' end,
  spd = function () return string.format('%.1f', V.hspdMs), 'm/s' end,
}

-- Dense Yaapu-class layout: every pixel works. Top+bottom inverse strips,
-- left battery block, center artificial horizon with heading, right data
-- column(s). 212-wide radios get a second data column. Data rows come
-- from CFG.slots/wslots.
local function drawTopBar()
  lcd.drawFilledRectangle(0, 0, LCD_W, 8, FORCE)
  local mode = MODES[V.modeNum] or (V.modeNum >= 0 and ('M' .. V.modeNum) or '---')
  lcd.drawText(1, 1, mode, SMLSIZE + INVERS + (V.armed and BLINK or 0))
  lcd.drawText(LCD_W / 2 - 12, 1, fmtTimer(), SMLSIZE + INVERS)
  if V.anyFs or V.battFs then
    lcd.drawText(LCD_W - 46, 1, 'FS!', SMLSIZE + INVERS + BLINK)
  end
  lcd.drawText(LCD_W - 1, 1, 'RS' .. (getRSSI() or 0), SMLSIZE + INVERS + RIGHT)
end

local function drawBottomBar()
  lcd.drawFilledRectangle(0, 56, LCD_W, 8, FORCE)
  local m = V.msgs[V.msgHead]
  if m then
    lcd.drawText(1, 57, string.sub(m.text, 1, math.floor(LCD_W / 5)), SMLSIZE + INVERS + (m.sev <= 4 and BLINK or 0))
  else
    lcd.drawText(1, 57, (CFG.name ~= '' and CFG.name or 'ArduDeck')
      .. (V.armed and '  ARMED' or '  DISARMED'), SMLSIZE + INVERS)
  end
end

local function drawArrow(cx, cy, r, deg)
  local a = math.rad(deg)
  local tx, ty = cx + math.sin(a) * r, cy - math.cos(a) * r
  lcd.drawLine(cx + math.sin(a + 2.6) * r, cy - math.cos(a + 2.6) * r, tx, ty, SOLID, FORCE)
  lcd.drawLine(cx + math.sin(a - 2.6) * r, cy - math.cos(a - 2.6) * r, tx, ty, SOLID, FORCE)
  lcd.drawLine(cx, cy, tx, ty, SOLID, FORCE)
end

local function drawHorizon(x, y, w, h)
  lcd.drawRectangle(x, y, w, h)
  local cx, cy = x + w / 2, y + h / 2
  local a = math.rad(V.rollDeg)
  local ca, sa = math.cos(a), math.sin(a)
  local len = w / 2 - 3
  -- pitch offset, clamped so the line stays inside the box
  local pmax = math.max(0, h / 2 - 2 - math.abs(sa) * len)
  local p = math.max(-pmax, math.min(pmax, V.pitchDeg / 60 * (h / 2)))
  lcd.drawLine(cx - ca * len + sa * p, cy + sa * len + ca * p,
    cx + ca * len + sa * p, cy - sa * len + ca * p, SOLID, FORCE)
  -- aircraft reference: fixed center mark
  lcd.drawLine(cx - 5, cy, cx - 2, cy, SOLID, FORCE)
  lcd.drawLine(cx + 2, cy, cx + 5, cy, SOLID, FORCE)
  lcd.drawFilledRectangle(cx - 1, cy - 1, 2, 2, FORCE)
  -- heading, inverse chip at the box's bottom edge
  local hdg = string.format('%03d', math.floor(V.yawDeg + 0.5) % 360)
  lcd.drawFilledRectangle(cx - 10, y + h - 8, 20, 8, FORCE)
  lcd.drawText(cx - 8, y + h - 7, hdg, SMLSIZE + INVERS)
end

local function drawFly()
  drawTopBar()
  drawBottomBar()
  local wide = LCD_W > 150
  -- big readout (no lcd.sizeText on bw targets: fixed unit spot)
  local big = BIG[CFG.big] or BIG.volt
  local num, unit = big()
  lcd.drawText(0, 10, num, DBLSIZE)
  lcd.drawText(44, 10, unit, SMLSIZE)
  -- left rows
  drawSlots(CFG.left, 0, 27, 3)
  local f4 = FIELDS[CFG.left[4]]
  if f4 then lcd.drawText(0, 49, (f4()), SMLSIZE) end -- last row hugs the strip
  -- center panel: horizon or two more data columns
  local hx = wide and 62 or 50
  local hw = wide and 64 or 42
  if CFG.center == 'slots' then
    drawSlots(CFG.cslots, hx, 9, 5)
    local c2 = {}
    for i = 6, 10 do c2[#c2 + 1] = CFG.cslots[i] end
    drawSlots(c2, hx + math.floor(hw / 2) + 2, 9)
  else
    drawHorizon(hx, 9, hw, 46)
  end
  -- right column(s)
  local rx = hx + hw + 4
  drawSlots(CFG.slots, rx, 9)
  if V.homeDistM > 0 then
    drawArrow(rx + 8, 52, 5, V.homeBearingDeg - V.yawDeg)
  end
  if wide then
    drawSlots(CFG.wslots, rx + 46, 9)
  end
end

local function drawNav()
  drawTopBar()
  drawBottomBar()
  if V.lat then
    lcd.drawText(0, 10, string.format('%.6f', V.lat), 0)
    lcd.drawText(0, 20, string.format('%.6f', V.lon), 0)
  else
    lcd.drawText(0, 10, 'no position', 0 + BLINK)
  end
  lcd.drawText(0, 30, string.format('home %dm brg %d', math.floor(V.homeDistM + 0.5), V.homeBearingDeg), SMLSIZE)
  lcd.drawText(0, 38, V.wpNum > 0
    and string.format('wp %d  %dm brg %d', V.wpNum, math.floor(V.wpDistM + 0.5), V.wpBearingDeg)
    or 'no mission wp', SMLSIZE)
  lcd.drawText(0, 46, string.format('wind %.1fm/s %d  thr %d%%', V.windMs, V.windDirDeg, V.throttle), SMLSIZE)
  local rx = LCD_W - 50
  lcd.drawText(rx, 10, string.format('alt %dm', math.floor(V.gpsAltM + 0.5)), SMLSIZE)
  lcd.drawText(rx, 18, string.format('hdp %.1f', V.hdop), SMLSIZE)
  lcd.drawText(rx, 26, string.format('vsp %+.1f', V.vspdMs), SMLSIZE)
  if V.homeDistM > 0 then
    drawArrow(rx + 10, 40, 6, V.homeBearingDeg - V.yawDeg)
  end
end

-- ========================== script API =================================
local function background()
  pump()
  pollSensors()
end

local function init()
  loadCfg()
end

local function run(event)
  background()
  lcd.clear()
  -- any key/rotary step flips the page (guard: unset EVT_ globals are nil)
  if event and event ~= 0 then
    if (EVT_VIRTUAL_NEXT and event == EVT_VIRTUAL_NEXT)
      or (EVT_VIRTUAL_PREV and event == EVT_VIRTUAL_PREV)
      or (EVT_PLUS_BREAK and event == EVT_PLUS_BREAK)
      or (EVT_MINUS_BREAK and event == EVT_MINUS_BREAK)
      or (EVT_ROT_RIGHT and event == EVT_ROT_RIGHT)
      or (EVT_ROT_LEFT and event == EVT_ROT_LEFT) then
      page = page % PAGES + 1
    end
  end
  local state, hint = ladderState()
  if state == 'LIVE' then
    announceTransitions(true)
    if page == 1 then drawFly() else drawNav() end
  else
    announceTransitions(false)
    drawLadder(state, hint)
  end
  return 0
end

return { init = init, background = background, run = run }
