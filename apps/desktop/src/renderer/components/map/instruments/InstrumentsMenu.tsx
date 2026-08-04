/**
 * "Instruments" dropdown at the telemetry map's top-left: toggles the
 * floating instrument widgets. The attitude ball and the compass are the
 * 'attitude' and 'heading' registry instruments like everything else.
 *
 * Below the toggles sits a settings block: instrument opacity, and named
 * layouts (save the current arrangement, apply/delete saved ones, plus
 * built-in presets). Layouts snapshot visibility, scales, opacity, the
 * attitude ball and every drag position.
 *
 * Button and dropdown deliberately mirror MapLayersControl: same button
 * classes, same body-portal dropdown recipe, so the two map menus read as
 * one family.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useMapInstrumentsStore,
  resolveInstrumentVisible,
  INSTRUMENT_OPACITY_MIN,
} from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS } from './registry';
import { PRESET_INSTRUMENT_LAYOUTS } from './preset-layouts';

const MENU_WIDTH = 232;

const gaugeIcon = (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 15a8.4 8.4 0 1116.8 0" />
    <path strokeLinecap="round" d="M12 15l3.5-4.5" />
  </svg>
);

const layoutIcon = (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export function InstrumentsMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [savingName, setSavingName] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const visible = useMapInstrumentsStore((s) => s.visible);
  const toggle = useMapInstrumentsStore((s) => s.toggle);
  const opacity = useMapInstrumentsStore((s) => s.opacity);
  const setOpacity = useMapInstrumentsStore((s) => s.setOpacity);
  const savedLayouts = useMapInstrumentsStore((s) => s.savedLayouts);
  const saveLayout = useMapInstrumentsStore((s) => s.saveLayout);
  const applyLayout = useMapInstrumentsStore((s) => s.applyLayout);
  const deleteLayout = useMapInstrumentsStore((s) => s.deleteLayout);

  const count = MAP_INSTRUMENTS.reduce((n, i) => n + (resolveInstrumentVisible(visible, i.id) ? 1 : 0), 0);

  useLayoutEffect(() => {
    if (!open) { setPos(null); setSavingName(null); return; }
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

  const sectionHeader = (label: string) => (
    <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-b border-t border-subtle">{label}</div>
  );

  const commitSave = () => {
    const name = (savingName ?? '').trim();
    if (name) saveLayout(name);
    setSavingName(null);
  };

  const savedNames = Object.keys(savedLayouts).sort((a, b) => a.localeCompare(b));

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
            {/* click-away; modal tier so it clears the dockview panels below the map */}
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[9999] rounded-lg bg-surface-solid border border-subtle shadow-xl overflow-hidden flex flex-col"
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
                </div>

                {sectionHeader('Settings')}
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className="text-xs text-content-secondary flex-1">Opacity</span>
                  <input
                    type="range"
                    min={Math.round(INSTRUMENT_OPACITY_MIN * 100)}
                    max={100}
                    value={Math.round(opacity * 100)}
                    onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                    className="w-20 accent-blue-600"
                  />
                  <span className="text-xs tabular-nums text-content-tertiary w-8 text-right">{Math.round(opacity * 100)}%</span>
                </div>

                {sectionHeader('Layouts')}
                <div className="p-1 space-y-0.5">
                  {savedNames.map((name) => (
                    <div key={name} className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => { const l = savedLayouts[name]; if (l) applyLayout(l); }}
                        data-tip="Apply layout"
                        className={row(false) + ' flex-1 min-w-0'}
                      >
                        {layoutIcon}
                        <span className="truncate">{name}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteLayout(name)}
                        data-tip="Delete layout"
                        className="shrink-0 p-1.5 rounded text-content-tertiary hover:text-red-500 hover:bg-surface-raised transition-colors"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {PRESET_INSTRUMENT_LAYOUTS.map(({ name, layout }) => (
                    <button
                      key={'preset:' + name}
                      type="button"
                      onClick={() => applyLayout(layout)}
                      data-tip="Apply built-in layout"
                      className={row(false)}
                    >
                      {layoutIcon}
                      <span className="truncate flex-1">{name}</span>
                      <span className="text-[10px] uppercase tracking-wide text-content-tertiary">preset</span>
                    </button>
                  ))}
                  {savingName === null ? (
                    <button type="button" onClick={() => setSavingName('')} className={row(false)}>
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                      </svg>
                      Save current layout...
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 px-1 py-0.5">
                      <input
                        autoFocus
                        type="text"
                        value={savingName}
                        placeholder="Layout name"
                        onChange={(e) => setSavingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitSave();
                          if (e.key === 'Escape') setSavingName(null);
                        }}
                        className="flex-1 min-w-0 px-2 py-1 text-xs rounded bg-surface-input border border-default text-content focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={commitSave}
                        disabled={!savingName.trim()}
                        className="shrink-0 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
