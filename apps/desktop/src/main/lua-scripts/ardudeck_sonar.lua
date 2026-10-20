-- ArduDeck sonar bridge: reads a Blue Robotics Ping (Ping Protocol) on a Scripting serial port,
-- feeds the depth to ArduPilot as a scripted rangefinder and sends a reduced echogram to the
-- radio as passthrough telemetry, where the ArduDeck HUD widget draws it.
--
-- Setup (ArduDeck does this for you): SERIALx_PROTOCOL = 28 on the Ping's port,
-- RNGFNDx_TYPE = 36 (Lua) with RNGFNDx_ORIENT = 25 (down), SCR_ENABLE = 1.
--
-- Echogram wire format, mirrored in the widget (loadable.lua, decoders for 0x5200..0x5240):
--   column:  appid 0x5200 | (seq % 16) << 2 | segment, segment 0..3, data = 8 samples x 4 bits
--            (sample 0 in the low nibble of segment 0, nearest the transducer)
--   range:   appid 0x5240, data = scan_start in dm (bits 0..13) | scan_length in dm (bits 14..29)

local VERSION = '0.1.0'
local ROWS = 32
local SEGMENTS = ROWS // 8
local COLUMN_APPID = 0x5200
local RANGE_APPID = 0x5240
local SPORT_SENSOR = 0x1B
local SPORT_DATA_FRAME = 0x10
local PING_BAUD = 115200
local MIN_CONFIDENCE = 50          -- percent; below it the depth is not passed on
local RANGE_EVERY = 8              -- columns between range frames
local LOOP_MS = 50

-- Ping Protocol message ids
local MSG_GENERAL_REQUEST = 6
local MSG_PROFILE = 1300
local MSG_CONTINUOUS_START = 1400

-- ---------------------------------------------------------------- pure helpers
local function u16(b, i) return b[i] | (b[i + 1] << 8) end
local function u32(b, i) return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24) end

-- Ping frame: 'B' 'R', payload length u16, message id u16, src u8, dst u8, payload, checksum u16 (sum of all bytes before it)
local function encode_frame(msg_id, payload)
  local bytes = { 0x42, 0x52, #payload & 0xFF, #payload >> 8, msg_id & 0xFF, msg_id >> 8, 0, 0 }
  for _, v in ipairs(payload) do bytes[#bytes + 1] = v end
  local sum = 0
  for _, v in ipairs(bytes) do sum = sum + v end
  bytes[#bytes + 1] = sum & 0xFF
  bytes[#bytes + 1] = (sum >> 8) & 0xFF
  return bytes
end

-- Byte-at-a-time parser; calls on_message(msg_id, payload) for every frame whose checksum matches.
local function new_parser(on_message)
  local buf, need = {}, nil
  return function(byte)
    local n = #buf
    if n == 0 and byte ~= 0x42 then return end
    if n == 1 and byte ~= 0x52 then buf = {}; return end
    buf[n + 1] = byte
    n = n + 1
    if n == 4 then
      need = 8 + u16(buf, 3) + 2
      if need > 1024 then buf, need = {}, nil end
      return
    end
    if need and n == need then
      local sum = 0
      for i = 1, n - 2 do sum = sum + buf[i] end
      if (sum & 0xFFFF) == u16(buf, n - 1) then
        local payload = {}
        for i = 9, n - 2 do payload[#payload + 1] = buf[i] end
        on_message(u16(buf, 5), payload)
      end
      buf, need = {}, nil
    end
  end
end

-- profile payload: distance u32 mm, confidence u16, transmit_duration u16, ping_number u32,
-- scan_start u32 mm, scan_length u32 mm, gain_setting u32, data_length u16, data u8[]
local function decode_profile(p)
  if #p < 26 then return nil end
  local len = u16(p, 25)
  local data = {}
  for i = 1, math.min(len, #p - 26) do data[i] = p[26 + i] end
  return {
    distance_m = u32(p, 1) / 1000,
    confidence = u16(p, 5),
    scan_start_m = u32(p, 13) / 1000,
    scan_length_m = u32(p, 17) / 1000,
    data = data,
  }
end

-- Strongest echo per row (max keeps a thin bottom return visible), scaled to 0..15.
local function reduce(data, rows)
  local out = {}
  local n = #data
  for r = 1, rows do
    local a = math.floor((r - 1) * n / rows) + 1
    local b = math.max(a, math.floor(r * n / rows))
    local m = 0
    for i = a, b do if (data[i] or 0) > m then m = data[i] end end
    out[r] = m >> 4
  end
  return out
end

-- The 4 passthrough frames of one column: { appid, data } each.
local function column_frames(levels, seq)
  local frames = {}
  for s = 0, SEGMENTS - 1 do
    local v = 0
    for k = 0, 7 do v = v | ((levels[s * 8 + k + 1] & 0x0F) << (4 * k)) end
    -- the binding takes an int32; same bits as a negative number, ArduPilot casts back to uint32
    if v >= 0x80000000 then v = v - 0x100000000 end
    frames[#frames + 1] = { COLUMN_APPID | ((seq % 16) << 2) | s, v }
  end
  return frames
end

local function range_frame(start_m, length_m)
  local s = math.min(0x3FFF, math.floor(start_m * 10 + 0.5))
  local l = math.min(0xFFFF, math.floor(length_m * 10 + 0.5))
  return { RANGE_APPID, s | (l << 14) }
end

if ARDUDECK_SONAR_TEST then
  return {
    encode_frame = encode_frame, new_parser = new_parser, decode_profile = decode_profile,
    reduce = reduce, column_frames = column_frames, range_frame = range_frame,
    MSG_PROFILE = MSG_PROFILE, ROWS = ROWS,
  }
end

-- ---------------------------------------------------------------- on the autopilot
local port = serial:find_serial(0)
local rf_backend = nil
local queue = {}
local seq = 0
local last_profile_ms = 0
local last_request_ms = 0
local last_range = nil
local columns_since_range = RANGE_EVERY

local function write(bytes) for _, b in ipairs(bytes) do port:write(b) end end

-- The Lua rangefinder backend ArduDeck set up (RNGFNDx_TYPE = 36), looked up once.
local function find_backend()
  for i = 0, 9 do
    local b = rangefinder:get_backend(i)
    if b and b:type() == 36 then return b end
  end
  return nil
end

local parse = new_parser(function(msg_id, payload)
  if msg_id ~= MSG_PROFILE then return end
  local p = decode_profile(payload)
  if not p then return end
  last_profile_ms = millis():toint()
  rf_backend = rf_backend or find_backend()
  if rf_backend and p.confidence >= MIN_CONFIDENCE then rf_backend:handle_script_msg(p.distance_m) end
  -- newest picture wins: a column is only built once the last one has gone out
  if #queue > 0 or #p.data == 0 then return end
  local range = { p.scan_start_m, p.scan_length_m }
  if columns_since_range >= RANGE_EVERY or not last_range or last_range[1] ~= range[1] or last_range[2] ~= range[2] then
    queue[#queue + 1] = range_frame(range[1], range[2])
    last_range, columns_since_range = range, 0
  end
  for _, f in ipairs(column_frames(reduce(p.data, ROWS), seq)) do queue[#queue + 1] = f end
  seq = (seq + 1) % 16
  columns_since_range = columns_since_range + 1
end)

local function update()
  if not port then
    gcs:send_text(4, 'ArduDeck sonar: no SERIALx_PROTOCOL = 28 port')
    return update, 10000
  end
  local now = millis():toint()
  -- ask for profiles until they flow, and again if they stop
  if now - last_profile_ms > 2000 and now - last_request_ms > 1000 then
    write(encode_frame(MSG_CONTINUOUS_START, { MSG_PROFILE & 0xFF, MSG_PROFILE >> 8 }))
    write(encode_frame(MSG_GENERAL_REQUEST, { MSG_PROFILE & 0xFF, MSG_PROFILE >> 8 }))
    last_request_ms = now
  end
  local n = math.min(port:available():toint(), 600)
  for _ = 1, n do
    local b = port:read()
    if b >= 0 then parse(b) end
  end
  -- one frame per pass: the passthrough link holds one user packet at a time
  local f = queue[1]
  if f and frsky_sport:sport_telemetry_push(SPORT_SENSOR, SPORT_DATA_FRAME, f[1], f[2]) then
    table.remove(queue, 1)
  end
  return update, LOOP_MS
end

if port then port:begin(PING_BAUD) end
gcs:send_text(6, 'ArduDeck sonar ' .. VERSION)
return update, 1000
