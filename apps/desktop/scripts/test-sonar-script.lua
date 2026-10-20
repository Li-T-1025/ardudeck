-- Unit test for the pure parts of src/main/lua-scripts/ardudeck_sonar.lua (Lua 5.3+ integer ops,
-- as on ArduPilot). Run from apps/desktop:  lua scripts/test-sonar-script.lua
ARDUDECK_SONAR_TEST = true
local S = assert(loadfile('src/main/lua-scripts/ardudeck_sonar.lua'))()
local failures = 0
local function check(name, got, want)
  local ok = got == want
  if not ok then failures = failures + 1 end
  print(string.format('%s %-40s got %-12s want %s', ok and 'ok  ' or 'FAIL', name, tostring(got), tostring(want)))
end
local function le(n, bytes) local t = {} for i = 0, bytes - 1 do t[#t + 1] = (n >> (8 * i)) & 0xFF end return t end
local function cat(...) local t = {} for _, part in ipairs({ ... }) do for _, v in ipairs(part) do t[#t + 1] = v end end return t end

-- a 200-sample profile: quiet water, a fish at 40%, the bottom from 80% on
local data = {}
for i = 1, 200 do data[i] = i >= 160 and 240 or ((i >= 78 and i <= 81) and 180 or 8) end
local payload = cat(le(12345, 4), le(97, 2), le(80, 2), le(7, 4), le(500, 4), le(20000, 4), le(3, 4), le(#data, 2), data)
local frame = S.encode_frame(S.MSG_PROFILE, payload)

local got
local parse = S.new_parser(function (id, p) got = { id = id, p = p } end)
for _, b in ipairs({ 0x00, 0x42, 0x13 }) do parse(b) end -- noise before the frame
for _, b in ipairs(frame) do parse(b) end
check('frame parsed', got and got.id, S.MSG_PROFILE)
local p = S.decode_profile(got.p)
check('distance (m)', p.distance_m, 12.345)
check('confidence', p.confidence, 97)
check('scan start (m)', p.scan_start_m, 0.5)
check('scan length (m)', p.scan_length_m, 20.0)
check('samples', #p.data, 200)

-- a corrupted checksum is dropped
local bad = S.encode_frame(S.MSG_PROFILE, payload)
bad[#bad] = (bad[#bad] + 1) & 0xFF
got = nil
local parse2 = S.new_parser(function (id) got = id end)
for _, b in ipairs(bad) do parse2(b) end
check('bad checksum dropped', got, nil)

local levels = S.reduce(p.data, S.ROWS)
check('rows', #levels, 32)
check('quiet water level', levels[2], 0)
check('fish row is strong', levels[13] >= 10, true)
check('bottom rows are strongest', levels[30], 15)

local frames = S.column_frames(levels, 5)
check('frames per column', #frames, 4)
check('first appid carries seq and segment', frames[1][1], 0x5200 | (5 << 2) | 0)
check('last appid', frames[4][1], 0x5200 | (5 << 2) | 3)
-- sample 0 sits in the low nibble of segment 0, sample 31 in the high nibble of segment 3
check('nibble order low', frames[1][2] & 0x0F, levels[1])
check('nibble order high', (frames[4][2] >> 28) & 0x0F, levels[32])
-- a bottom return in the last row sets the top nibble: the value must still fit an int32
check('data fits int32', frames[4][2] >= -0x80000000 and frames[4][2] <= 0x7FFFFFFF, true)
check('same bits as unsigned', frames[4][2] & 0xFFFFFFFF, frames[4][2] < 0 and frames[4][2] + 0x100000000 or frames[4][2])

local r = S.range_frame(0.5, 20.0)
check('range appid', r[1], 0x5240)
check('range start dm', r[2] & 0x3FFF, 5)
check('range length dm', (r[2] >> 14) & 0xFFFF, 200)

print(failures == 0 and 'ALL PASS' or (failures .. ' FAILURES'))
os.exit(failures == 0 and 0 or 1)
