/**
 * Mounts the visible map instruments inside the telemetry map container.
 * Each instrument gets its own wrapper component so useDraggableOverlay is
 * called unconditionally per widget (never in a loop or behind a condition);
 * registry order keeps the list stable across toggles.
 *
 * Scaling uses CSS zoom on an INNER wrapper, not transform scale and not the
 * dragged element itself: zoom affects layout size, so the outer element's
 * offsetWidth/left/top stay in the map container's coordinate space and the
 * drag clamp math keeps working. A corner grip (hover-revealed) drag-resizes
 * the instrument; the committed scale persists in map-instruments-store.
 */
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useDraggableOverlay } from '../useDraggableOverlay';
import {
  useMapInstrumentsStore,
  resolveInstrumentVisible,
  INSTRUMENT_SCALE_MIN,
  INSTRUMENT_SCALE_MAX,
} from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS, type MapInstrumentDef } from './registry';

// Pixels of diagonal grip travel that span one whole scale unit.
const RESIZE_PX_PER_SCALE_UNIT = 100;

function clampScale(v: number): number {
  return Math.max(INSTRUMENT_SCALE_MIN, Math.min(INSTRUMENT_SCALE_MAX, v));
}

function InstrumentSlot({ instrument }: { instrument: MapInstrumentDef }): JSX.Element {
  const drag = useDraggableOverlay('instrument:' + instrument.id);
  const storedScale = useMapInstrumentsStore((s) => s.scale[instrument.id] ?? 1);
  const setScale = useMapInstrumentsStore((s) => s.setScale);
  const [liveScale, setLiveScale] = useState<number | null>(null);
  const resize = useRef<{ startX: number; startY: number; startScale: number } | null>(null);
  const scale = liveScale ?? storedScale;
  const Component = instrument.Component;

  const onGripPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    // The grip owns this gesture; without this the wrapper's move-drag starts.
    e.stopPropagation();
    e.preventDefault();
    resize.current = { startX: e.clientX, startY: e.clientY, startScale: scale };

    const onMove = (ev: globalThis.PointerEvent) => {
      const r = resize.current;
      if (!r) return;
      const d = (ev.clientX - r.startX + ev.clientY - r.startY) / 2;
      setLiveScale(clampScale(r.startScale + d / RESIZE_PX_PER_SCALE_UNIT));
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      const r = resize.current;
      resize.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (r) {
        const d = (ev.clientX - r.startX + ev.clientY - r.startY) / 2;
        setScale(instrument.id, clampScale(r.startScale + d / RESIZE_PX_PER_SCALE_UNIT));
      }
      setLiveScale(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={drag.ref}
      style={drag.style}
      onPointerDown={drag.onPointerDown}
      className={instrument.defaultClassName + ' group'}
    >
      {/* zoom is non-standard in TS's CSSProperties but supported by Chromium */}
      <div style={{ zoom: scale } as CSSProperties}>
        <Component />
      </div>
      {/* Inset 11px so the grip sits ON a round gauge's bezel at 45 degrees
          instead of floating in the square wrapper's empty corner. */}
      <div
        onPointerDown={onGripPointerDown}
        className={
          'absolute bottom-[11px] right-[11px] w-2.5 h-2.5 rounded-br border-b-2 border-r-2 ' +
          'cursor-nwse-resize transition-opacity ' +
          (liveScale !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        }
        style={{ borderColor: 'var(--gauge-text-dim)' }}
      />
    </div>
  );
}

export function InstrumentsLayer(): JSX.Element {
  const visible = useMapInstrumentsStore((s) => s.visible);
  return (
    <>
      {MAP_INSTRUMENTS.map((instrument) =>
        resolveInstrumentVisible(visible, instrument.id) ? <InstrumentSlot key={instrument.id} instrument={instrument} /> : null,
      )}
    </>
  );
}
