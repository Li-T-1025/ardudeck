// Each star is drawn from its last to its current projected position, so streak length comes from real motion.

export const STREAK_COLOURS = ['#ffffff', '#c7d2fe', '#b4a7f5', '#fde68a'];

export interface WarpStar {
  x: number;
  y: number;
  z: number;
  pz: number;
  colour: string;
}

export interface WarpField {
  stars: WarpStar[];
  width: number;
  height: number;
}

function place(s: WarpStar, width: number, height: number, z: number) {
  s.x = (Math.random() - 0.5) * width * 2;
  s.y = (Math.random() - 0.5) * height * 2;
  s.z = z;
  s.pz = z;
}

export function createWarpField(width: number, height: number, count: number): WarpField {
  const stars = Array.from({ length: count }, (_, i) => {
    const s: WarpStar = { x: 0, y: 0, z: 0, pz: 0, colour: STREAK_COLOURS[i % STREAK_COLOURS.length]! };
    place(s, width, height, Math.random() * width);
    return s;
  });
  return { stars, width, height };
}

/** Advances every star by `speed` (depth units) and draws its streak. `cy` sets the vanishing point. */
export function drawWarpStars(ctx: CanvasRenderingContext2D, field: WarpField, opts: { speed: number; alpha: number; cx: number; cy: number; maxWidth?: number }) {
  const { width, height } = field;
  const { speed, alpha, cx, cy, maxWidth = 2.6 } = opts;
  ctx.lineCap = 'round';
  for (const s of field.stars) {
    s.pz = s.z;
    s.z -= speed;
    if (s.z < 1) {
      place(s, width, height, width);
      continue;
    }
    const sx = cx + (s.x / s.z) * width * 0.5;
    const sy = cy + (s.y / s.z) * width * 0.5;
    const px = cx + (s.x / s.pz) * width * 0.5;
    const py = cy + (s.y / s.pz) * width * 0.5;
    const depth = 1 - s.z / width;
    ctx.strokeStyle = s.colour;
    ctx.globalAlpha = alpha * Math.min(1, depth * 1.6);
    ctx.lineWidth = Math.max(0.6, depth * maxWidth);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(sx + 0.01, sy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
