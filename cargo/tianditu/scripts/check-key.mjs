#!/usr/bin/env node
/**
 * Ask Tianditu directly for one tile per layer, with no browser impersonation.
 *
 *   node scripts/check-key.mjs <key> [z] [x] [y]
 *
 * Defaults to a Beijing tile at z18. Exit code 0 when all three layers answer
 * with an image; 1 otherwise, printing the provider's own message so a key
 * problem (browser-side key, IP allow-list) is not mistaken for a network fault.
 */

const KEY_RE = /^[0-9a-f]{32}$/i;

const [key, zArg, xArg, yArg] = process.argv.slice(2);
const z = Number(zArg ?? 18);
const x = Number(xArg ?? 215825);
const y = Number(yArg ?? 99330);

if (!key || !KEY_RE.test(key)) {
  console.error('usage: node scripts/check-key.mjs <32-char server-side key> [z] [x] [y]');
  process.exit(1);
}

const LAYERS = ['vec', 'img', 'ter', 'cva', 'cia', 'cta'];

const template = (layer) =>
  `https://t0.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0` +
  `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
  `&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&tk=${key}`;

let failed = 0;

for (const layer of LAYERS) {
  const url = template(layer);
  try {
    const res = await fetch(url);
    const type = res.headers.get('content-type') ?? '(none)';
    const body = Buffer.from(await res.arrayBuffer());
    if (res.ok && type.startsWith('image/')) {
      // Tianditu answers image/jpg for img and image/png for the rest; log what
      // actually arrived because the compositor has to decode both.
      console.log(`${layer}: ${res.status} ${type} ${body.length}B`);
    } else {
      failed++;
      const text = body.subarray(0, 300).toString('utf8');
      console.log(`${layer}: ${res.status} ${type} ${text}`);
    }
  } catch (err) {
    failed++;
    console.log(`${layer}: request failed: ${err.message}`);
  }
}

if (failed > 0) {
  console.log(
    '\nA 403 whose body mentions 浏览器端 means the key is the browser-side type;' +
      ' create a server-side key (服务端) in the console instead of faking a User-Agent.',
  );
  process.exit(1);
}
