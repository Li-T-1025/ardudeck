/**
 * Field-map generator for the Radio HUD widget.
 *
 * Stitches satellite tiles (via the app's tile-cache:// protocol, so cached
 * tiles work offline) into one fixed image per zoom span, centered on the
 * field. The widget draws the image as-is and moves the vehicle marker
 * across it - no tile logic on the radio.
 */

export interface FieldMapImage {
  name: string;
  base64: string;
  lat: number;
  lon: number;
  /** meters per pixel of the produced image */
  mpp: number;
  w: number;
  h: number;
}

/** Radio-friendly image size: full map tile at 480x320 minus chrome. */
const IMG_W = 480;
const IMG_H = 272;
const TILE = 256;

/** Half-spans of the three zoom levels, in meters. */
export const FIELD_MAP_SPANS = [500, 2000, 8000];

function lonToWorldX(lon: number, z: number): number {
  return ((lon + 180) / 360) * TILE * 2 ** z;
}

function latToWorldY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TILE * 2 ** z;
}

function loadTile(layer: string, z: number, xTile: number, yTile: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const n = 2 ** z;
    const wrappedX = ((xTile % n) + n) % n;
    if (yTile < 0 || yTile >= n) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `tile-cache://${layer}/${z}/${wrappedX}/${yTile}.png`;
  });
}

/**
 * Generate one field image per span, centered on (lat, lon).
 * Returns images plus a count of tiles that failed to load (offline gaps).
 */
export async function generateFieldMaps(
  lat: number,
  lon: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ maps: FieldMapImage[]; missingTiles: number }> {
  const maps: FieldMapImage[] = [];
  let missingTiles = 0;
  let done = 0;

  for (let i = 0; i < FIELD_MAP_SPANS.length; i++) {
    const halfSpan = FIELD_MAP_SPANS[i]!;
    const mppTarget = (2 * halfSpan) / IMG_W;
    const latRad = (lat * Math.PI) / 180;
    const z = Math.max(3, Math.min(19, Math.round(Math.log2((156543.03 * Math.cos(latRad)) / mppTarget))));
    const mpp = (156543.03 * Math.cos(latRad)) / 2 ** z;

    const cx = lonToWorldX(lon, z);
    const cy = latToWorldY(lat, z);
    const left = cx - IMG_W / 2;
    const top = cy - IMG_H / 2;

    const canvas = document.createElement('canvas');
    canvas.width = IMG_W;
    canvas.height = IMG_H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#16181d'; // gauge-face for offline gaps
    ctx.fillRect(0, 0, IMG_W, IMG_H);

    const x0 = Math.floor(left / TILE);
    const x1 = Math.floor((left + IMG_W) / TILE);
    const y0 = Math.floor(top / TILE);
    const y1 = Math.floor((top + IMG_H) / TILE);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const img = await loadTile('satellite', z, tx, ty);
        if (img) {
          ctx.drawImage(img, Math.round(tx * TILE - left), Math.round(ty * TILE - top));
        } else {
          missingTiles++;
        }
      }
    }

    done++;
    onProgress?.(done, FIELD_MAP_SPANS.length);

    maps.push({
      name: `field${i + 1}`,
      base64: canvas.toDataURL('image/png').split(',')[1]!,
      lat, lon, mpp, w: IMG_W, h: IMG_H,
    });
  }

  return { maps, missingTiles };
}
