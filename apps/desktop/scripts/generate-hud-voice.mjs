#!/usr/bin/env node
/**
 * Generate the ArduDeck HUD voice pack with ElevenLabs TTS.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... node scripts/generate-hud-voice.mjs [voiceId]
 *
 * Requests raw PCM at 16 kHz (EdgeTX supports 8/16/32 kHz 16-bit mono wav)
 * and wraps it in a WAV header locally - no ffmpeg needed. Output lands in
 * the widget's SD payload, so the next Apply ships it to the radio.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Set ELEVENLABS_API_KEY (your ElevenLabs API key).');
  process.exit(1);
}

// Default voice: "Rachel". Pass any voice id as argv[2].
const VOICE_ID = process.argv[2] ?? '21m00Tcm4TlvDq8ikWAM';
const SAMPLE_RATE = 16000;

const PHRASES = {
  armed: 'Armed',
  disarmed: 'Disarmed',
  batt_50: 'Battery fifty percent',
  batt_low: 'Battery low',
  batt_crit: 'Battery critical',
  failsafe: 'Failsafe',
  telemetry_ok: 'Telemetry recovered',
  telemetry_lost: 'Telemetry lost',
  gps_ok: 'GPS fix',
  gps_lost: 'GPS lost',
  airborne: 'Airborne',
  landed: 'Landed',
  home_set: 'Home set',
  fence_breach: 'Fence breach',
  ekf_warn: 'E K F warning',
  signal_low: 'Signal low',
  signal_ok: 'Signal recovered',
  arm_denied: 'Arming denied, check messages',
  // spoken statustext vocabulary (matched by the widget's MSG_SOUNDS)
  autotune_done: 'Autotune complete',
  autotune_failed: 'Autotune failed',
  gps_glitch: 'GPS glitch',
  glitch_cleared: 'Glitch cleared',
  ekf_variance: 'E K F variance',
  ekf_using_gps: 'E K F using GPS',
  ekf_lane: 'E K F lane switch',
  yaw_aligned: 'Yaw aligned',
  rc_failsafe: 'R C failsafe',
  crash: 'Crash detected',
  terrain_missing: 'Terrain data missing',
  mission_complete: 'Mission complete',
  high_vibe: 'High vibration',
  // Copter flight modes, keyed by ArduPilot custom mode number
  // (mirrors MODES in the widget's loadable.lua)
  mode_0: 'Stabilize',
  mode_1: 'Acro',
  mode_2: 'Altitude hold',
  mode_3: 'Auto',
  mode_4: 'Guided',
  mode_5: 'Loiter',
  mode_6: 'Return to launch',
  mode_7: 'Circle',
  mode_9: 'Land',
  mode_11: 'Drift',
  mode_13: 'Sport',
  mode_14: 'Flip',
  mode_15: 'Autotune',
  mode_16: 'Position hold',
  mode_17: 'Brake',
  mode_18: 'Throw',
  mode_20: 'Guided, no GPS',
  mode_21: 'Smart return to launch',
  mode_22: 'Flow hold',
  mode_24: 'Zigzag',
  mode_27: 'Auto return to launch',
  // Boot greeting (desktop app start + widget load on the radio)
  welcome: 'Welcome to ArduDeck',
  // Generic severities: spoken for statustext with no dedicated phrase
  // (desktop announcer; the OS/browser TTS is banned - one brand voice)
  warning: 'Warning',
  error: 'Error',
  critical: 'Critical',
  // Fallback when a mode has no recording of its own
  mode_changed: 'Mode changed',
  // Plane modes (keyed by name on the desktop side)
  mode_manual: 'Manual',
  mode_training: 'Training',
  mode_fbwa: 'F B W A',
  mode_fbwb: 'F B W B',
  mode_cruise: 'Cruise',
  mode_takeoff: 'Takeoff',
  mode_thermal: 'Thermal',
  mode_qstabilize: 'Q stabilize',
  mode_qhover: 'Q hover',
  mode_qloiter: 'Q loiter',
  mode_qland: 'Q land',
  mode_qrtl: 'Q return to launch',
  mode_qacro: 'Q acro',
  // Rover modes
  mode_steering: 'Steering',
  mode_hold: 'Hold',
  mode_follow: 'Follow',
  mode_simple: 'Simple',
  mode_dock: 'Dock',
};

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'resources', 'edgetx', 'ardudeck-hud', 'SD', 'WIDGETS', 'ardudeck', 'snd',
);

function wavHeader(pcmBytes) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcmBytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);            // PCM chunk size
  h.writeUInt16LE(1, 20);             // PCM format
  h.writeUInt16LE(1, 22);             // mono
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate (16-bit mono)
  h.writeUInt16LE(2, 32);             // block align
  h.writeUInt16LE(16, 34);            // bits per sample
  h.write('data', 36);
  h.writeUInt32LE(pcmBytes, 40);
  return h;
}

await mkdir(outDir, { recursive: true });

let skipped = 0;
for (const [name, text] of Object.entries(PHRASES)) {
  // Only generate what's missing (credits); --force regenerates everything,
  // e.g. after a voice change.
  if (existsSync(path.join(outDir, `${name}.wav`)) && !process.argv.includes('--force')) {
    skipped++;
    continue;
  }
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=pcm_16000`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  );
  if (!res.ok) {
    console.error(`${name}: HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const pcm = Buffer.from(await res.arrayBuffer());
  // Peak-normalize to ~ -0.5 dBFS: TTS output ships with lots of headroom,
  // which reads as "very quiet" on a radio speaker.
  let peak = 1;
  for (let i = 0; i < pcm.length - 1; i += 2) {
    const s = Math.abs(pcm.readInt16LE(i));
    if (s > peak) peak = s;
  }
  const gain = Math.min(8, (32767 * 0.94) / peak);
  if (gain > 1.01) {
    for (let i = 0; i < pcm.length - 1; i += 2) {
      pcm.writeInt16LE(Math.round(pcm.readInt16LE(i) * gain), i);
    }
  }
  const wav = Buffer.concat([wavHeader(pcm.length), pcm]);
  await writeFile(path.join(outDir, `${name}.wav`), wav);
  console.log(`${name}.wav  ${(wav.length / 1024).toFixed(1)} KB  "${text}"`);
}

if (skipped > 0) console.log(`${skipped} existing phrases kept (use --force to regenerate)`);
console.log(`\nPack written to ${outDir}`);
console.log('Apply from the Radio HUD view to ship it to the radio.');
