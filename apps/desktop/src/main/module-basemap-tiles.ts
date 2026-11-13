import { nativeImage } from 'electron';
import { decodePng, encodePng, type Rgba } from './terrain/dem-tiles.js';

/**
 * Tile pixel work for cargo basemaps: decode whatever the provider sends,
 * composite a transparent label layer over the base, and hand MapLibre a PNG.
 *
 * Tianditu's `img` imagery comes back as JPEG while its labels are PNG, so a
 * hybrid style is a JPEG base with a PNG overlay. pngjs only reads PNG; Electron
 * already ships a JPEG decoder, so `nativeImage` covers the rest without adding
 * a dependency.
 */
export function decodeTileImage(bytes: Buffer): Rgba | null {
  if (bytes.length === 0) return null;
  const isPng = bytes.length > 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) {
    try {
      const img = decodePng(bytes);
      return img.width > 0 && img.height > 0 ? img : null;
    } catch {
      return null;
    }
  }
  let image;
  try {
    image = nativeImage.createFromBuffer(bytes);
  } catch {
    return null;
  }
  if (image.isEmpty()) return null;
  const { width, height } = image.getSize();
  if (width <= 0 || height <= 0) return null;
  const bgra = image.toBitmap();
  if (bgra.length !== width * height * 4) return null;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = bgra[i * 4 + 2]!;
    data[i * 4 + 1] = bgra[i * 4 + 1]!;
    data[i * 4 + 2] = bgra[i * 4]!;
    data[i * 4 + 3] = bgra[i * 4 + 3]!;
  }
  return { width, height, data };
}

/**
 * Source-over blend, not a replace. Label tiles are anti-aliased: their edge
 * pixels carry partial alpha, and swapping them in whole leaves a stair-step
 * halo around every glyph. Blending keeps the imagery visible through them.
 */
export function blendBasemapOverlay(base: Rgba | null, over: Rgba): Rgba {
  const width = base?.width ?? over.width;
  const height = base?.height ?? over.height;
  const out = base
    ? { width: base.width, height: base.height, data: new Uint8Array(base.data) }
    : { width, height, data: new Uint8Array(width * height * 4) };
  const w = Math.min(out.width, over.width);
  const h = Math.min(out.height, over.height);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * out.width + x) * 4;
      const i = (y * over.width + x) * 4;
      const a = over.data[i + 3]!;
      if (a === 0) continue;
      if (a === 255) {
        out.data[o] = over.data[i]!;
        out.data[o + 1] = over.data[i + 1]!;
        out.data[o + 2] = over.data[i + 2]!;
        out.data[o + 3] = 255;
        continue;
      }
      const w0 = 1 - a / 255;
      out.data[o] = Math.round(over.data[i]! * (a / 255) + out.data[o]! * w0);
      out.data[o + 1] = Math.round(over.data[i + 1]! * (a / 255) + out.data[o + 1]! * w0);
      out.data[o + 2] = Math.round(over.data[i + 2]! * (a / 255) + out.data[o + 2]! * w0);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Base tile with the label layer over it, as PNG bytes for the tile-cache scheme. */
export function composeBasemapTile(base: Rgba, overlay: Rgba | null): Buffer {
  return encodePng(overlay ? blendBasemapOverlay(base, overlay) : base);
}
