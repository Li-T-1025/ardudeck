import { useEffect, useRef } from 'react';
import { useTributeStore, WARP_MS } from '../../stores/tribute-store';
import { useAnyVehicleArmed } from './useAnyVehicleArmed';
import { createWarpField, drawWarpStars } from './warp-field';

const STAR_COUNT = 420;

export function WarpOverlay() {
  const warping = useTributeStore((s) => s.warping);
  const endWarp = useTributeStore((s) => s.endWarp);
  const armed = useAnyVehicleArmed();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (warping && armed) endWarp();
  }, [warping, armed, endWarp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!warping || armed || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const field = createWarpField(width, height, STAR_COUNT);
    const started = performance.now();
    let frame = 0;

    function draw(now: number) {
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / WARP_MS);

      // Accelerates, so it arrives fast rather than running flat.
      const speed = 6 + progress * progress * 44;
      const alpha = progress < 0.8 ? 1 : 1 - (progress - 0.8) / 0.2;

      ctx!.fillStyle = '#02030a';
      ctx!.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      const glow = ctx!.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.45);
      glow.addColorStop(0, `rgba(180, 167, 245, ${0.5 * alpha})`);
      glow.addColorStop(1, 'rgba(2, 3, 10, 0)');
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, width, height);

      drawWarpStars(ctx!, field, { speed, alpha, cx, cy });

      if (progress >= 1) {
        endWarp();
        return;
      }
      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [warping, armed, endWarp]);

  if (!warping || armed) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 z-[60] h-full w-full"
      onClick={endWarp}
    />
  );
}
