import { useEffect, useRef } from 'react';
import { createWarpField, drawWarpStars, type WarpField } from './warp-field';

const STAR_COUNT = 260;
// Depth units per 60 fps frame: about a tenth of the engage warp, so the page stays readable.
const CRUISE_SPEED = 2.4;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Continuous slow warp flight behind the Bridge welcome page; sized to its parent. */
export function WarpStarfield() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let field: WarpField = createWarpField(1, 1, 0);
    let width = 1;
    let height = 1;
    let frame = 0;
    let last = 0;
    const still = prefersReducedMotion();

    const paint = (speed: number) => {
      const cx = width / 2;
      const cy = height * 0.42; // behind the logo
      ctx.clearRect(0, 0, width, height);
      const tint = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.6);
      tint.addColorStop(0, 'rgba(180, 167, 245, 0.14)');
      tint.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, width, height);
      drawWarpStars(ctx, field, { speed, alpha: 0.85, cx, cy, maxWidth: 1.8 });
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      field = createWarpField(width, height, STAR_COUNT);
      // a static field still needs streak-free dots: draw once with a tiny step
      if (still) paint(0.01);
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(50, now - last) : 16.7;
      last = now;
      paint(CRUISE_SPEED * (dt / 16.7));
      frame = requestAnimationFrame(tick);
    };
    const start = () => { if (!still && !frame) { last = 0; frame = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };
    const onVisibility = () => (document.hidden ? stop() : start());

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
