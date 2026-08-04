/**
 * "Instruments" dropdown at the telemetry map's top-left: toggles the
 * floating instrument widgets plus the legacy attitude ball overlay so every
 * on-map readout is listed in one place. The attitude state stays owned by
 * MapPanel (its right-side toolbar button toggles the same state), so it
 * comes in as props. The compass is the 'heading' instrument in the registry.
 *
 * Button and dropdown deliberately mirror MapLayersControl: same button
 * classes, same body-portal dropdown recipe, so the two map menus read as
 * one family.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMapInstrumentsStore, resolveInstrumentVisible } from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS } from './registry';

interface InstrumentsMenuProps {
  showAttitude: boolean;
  onToggleAttitude: () => void;
}

const MENU_WIDTH = 208;

const gaugeIcon = (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 15a8.4 8.4 0 1116.8 0" />
    <path strokeLinecap="round" d="M12 15l3.5-4.5" />
  </svg>
);

export function InstrumentsMenu({ showAttitude, onToggleAttitude }: InstrumentsMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const visible = useMapInstrumentsStore((s) => s.visible);
  const toggle = useMapInstrumentsStore((s) => s.toggle);

  const count =
    MAP_INSTRUMENTS.reduce((n, i) => n + (resolveInstrumentVisible(visible, i.id) ? 1 : 0), 0) +
    (showAttitude ? 1 : 0);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_WIDTH - 8)),
      maxHeight: Math.max(140, window.innerHeight - r.bottom - 16),
    });
  }, [open]);

  const row = (active: boolean) =>
    'w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded text-xs transition-colors ' +
    (active ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-surface-raised hover:text-content');

  return (
    <div className="relative select-none">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tip="Map instruments"
        className="px-2 py-1 inline-flex items-center gap-1.5 rounded text-xs bg-surface text-content hover:bg-surface-raised shadow-lg transition-colors"
      >
        {gaugeIcon}
        <span className="font-medium">Instruments{count > 0 ? ` (${count})` : ''}</span>
      </button>

      {open && pos &&
        createPortal(
          <>
            {/* click-away */}
            <div className="fixed inset-0 z-[2000]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[2001] rounded-lg bg-surface-solid border border-subtle shadow-xl overflow-hidden flex flex-col"
              style={{ top: pos.top, left: pos.left, width: MENU_WIDTH, maxHeight: pos.maxHeight }}
            >
              <div className="overflow-y-auto">
                <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-b border-subtle">Instruments</div>
                {/* space-y keeps adjacent selected rows from merging into one slab */}
                <div className="p-1 space-y-0.5">
                  {MAP_INSTRUMENTS.map(({ id, label }) => (
                    <button key={id} type="button" onClick={() => toggle(id)} className={row(resolveInstrumentVisible(visible, id))}>
                      {gaugeIcon}
                      {label}
                    </button>
                  ))}
                  <button type="button" onClick={onToggleAttitude} className={row(showAttitude)}>
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" d="M4.93 12h14.14" />
                      <path strokeLinecap="round" d="M8 9.5l4-2 4 2" />
                    </svg>
                    Attitude ball
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
