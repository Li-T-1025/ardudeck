/**
 * Drag-to-place for floating map overlay widgets (wind bar, attitude ball,
 * instruments, ...).
 *
 * Widgets keep their default Tailwind position until the user drags them; a
 * drag switches to an absolute left/top pinned inside the map container and
 * persists per widget key, so the operator arranges the cockpit once. Drag
 * moves in 8px grid steps so arrangements line up. Positions persist as
 * FRACTIONS of the free container space (v2 payload { xr, yr }), so widgets
 * keep their relative placement when the panel or window resizes; a
 * ResizeObserver re-derives pixels whenever the container or the widget
 * changes size. Legacy v1 pixel payloads are converted to ratios on first
 * apply and re-saved.
 *
 * Interactive children (buttons, inputs, sliders) never start a drag, and a
 * drag under the 4px threshold still delivers the click.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_PREFIX = 'map-overlay-pos:';
const DRAG_THRESHOLD_PX = 4;
const GRID_PX = 8;

interface Pos { x: number; y: number }
/** Position as a fraction of the free container space, both axes 0..1. */
interface Ratio { xr: number; yr: number }

type Stored = { kind: 'ratio'; ratio: Ratio } | { kind: 'px'; pos: Pos };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function readStored(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pos & Ratio>;
    if (Number.isFinite(p.xr) && Number.isFinite(p.yr)) {
      return { kind: 'ratio', ratio: { xr: clamp01(p.xr as number), yr: clamp01(p.yr as number) } };
    }
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return { kind: 'px', pos: { x: p.x as number, y: p.y as number } };
    }
    return null;
  } catch {
    return null;
  }
}

function writeRatio(key: string, ratio: Ratio): void {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(ratio)); } catch { /* full/blocked */ }
}

function snapToGrid(v: number): number {
  return Math.round(v / GRID_PX) * GRID_PX;
}

function clampToParent(el: HTMLElement, pos: Pos): Pos {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return pos;
  return {
    x: Math.max(0, Math.min(parent.clientWidth - el.offsetWidth, pos.x)),
    y: Math.max(0, Math.min(parent.clientHeight - el.offsetHeight, pos.y)),
  };
}

function toRatio(el: HTMLElement, pos: Pos): Ratio | null {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return null;
  return {
    xr: clamp01(pos.x / Math.max(1, parent.clientWidth - el.offsetWidth)),
    yr: clamp01(pos.y / Math.max(1, parent.clientHeight - el.offsetHeight)),
  };
}

function fromRatio(el: HTMLElement, ratio: Ratio): Pos | null {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return null;
  return clampToParent(el, {
    x: snapToGrid(ratio.xr * Math.max(0, parent.clientWidth - el.offsetWidth)),
    y: snapToGrid(ratio.yr * Math.max(0, parent.clientHeight - el.offsetHeight)),
  });
}

export function useDraggableOverlay(storageKey: string): {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties | undefined;
  onPointerDown: (e: ReactPointerEvent) => void;
} {
  const [pos, setPos] = useState<Pos | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const ratioRef = useRef<Ratio | null>(null);
  const drag = useRef<{ startX: number; startY: number; origin: Pos; active: boolean } | null>(null);

  // Applying a stored position needs real element/container dimensions, so it
  // happens in the ref callback (post-attach, pre-paint) rather than in state
  // initialisation. v1 pixel payloads migrate to ratios here.
  const ref = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
    if (!el) return;
    if (!ratioRef.current) {
      const stored = readStored(storageKey);
      if (!stored) return;
      if (stored.kind === 'ratio') {
        ratioRef.current = stored.ratio;
      } else {
        const ratio = toRatio(el, clampToParent(el, stored.pos));
        if (!ratio) return;
        ratioRef.current = ratio;
        writeRatio(storageKey, ratio);
      }
    }
    setPos(fromRatio(el, ratioRef.current));
  }, [storageKey]);

  // Keep the relative placement when the map panel resizes or the widget
  // itself changes size (e.g. instrument scaling).
  useEffect(() => {
    const el = elRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const ro = new ResizeObserver(() => {
      const node = elRef.current;
      if (!node || !ratioRef.current || drag.current) return;
      setPos(fromRatio(node, ratioRef.current));
    });
    ro.observe(parent);
    ro.observe(el);
    return () => ro.disconnect();
  }, [storageKey]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const el = elRef.current;
    if (!el || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [role="slider"]')) return;

    const rect = el.getBoundingClientRect();
    const parentRect = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    if (!parentRect) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: rect.left - parentRect.left, y: rect.top - parentRect.top },
      active: false,
    };

    const onMove = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      const node = elRef.current;
      if (!d || !node) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.active && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      setPos(clampToParent(node, {
        x: snapToGrid(d.origin.x + dx),
        y: snapToGrid(d.origin.y + dy),
      }));
    };

    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (d?.active) {
        setPos((p) => {
          const node = elRef.current;
          if (p && node) {
            const ratio = toRatio(node, p);
            if (ratio) {
              ratioRef.current = ratio;
              writeRatio(storageKey, ratio);
            }
          }
          return p;
        });
        // Swallow the click that follows a real drag so buttons under the
        // pointer don't fire.
        window.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); }, { capture: true, once: true });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [storageKey]);

  const style: CSSProperties | undefined = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto', transform: 'none', cursor: 'grab' }
    : { cursor: 'grab' };

  return { ref, style, onPointerDown };
}
