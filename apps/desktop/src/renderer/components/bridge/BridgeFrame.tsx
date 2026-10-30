import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useConnectionStore } from '../../stores/connection-store';

export function useBridge(): boolean {
  return useSettingsStore((s) => s.theme === 'bridge');
}

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const two = (n: number) => String(n).padStart(2, '0');

// Elbow geometry, shared with the CSS: column width, bar height, how far the
// column runs past the bar, and the two radii.
export const ELBOW = { column: 116, bar: 26, drop: 34, outer: 14, inner: 26 } as const;

/** One continuous shape: outer rounded corner, the bar stub, and the concave fillet into the column. */
function ElbowShape({ flip, color }: { flip: boolean; color: string }) {
  const { column: W, bar: H, drop: D, outer: R, inner: r } = ELBOW;
  const d = `M0 ${R} A${R} ${R} 0 0 1 ${R} 0 L${W + r} 0 L${W + r} ${H} A${r} ${r} 0 0 0 ${W} ${H + r} L${W} ${H + D} L0 ${H + D} Z`;
  return (
    <svg
      className="bridge-elbow-shape"
      width={W + r}
      height={H + D}
      viewBox={`0 0 ${W + r} ${H + D}`}
      style={flip ? { transform: 'scaleY(-1)', bottom: 0 } : { top: 0 }}
      aria-hidden="true"
    >
      <path d={d} fill={color} />
    </svg>
  );
}

/** The top and bottom elbows of the Bridge frame. The rail between them is the column. */
export function BridgeElbow({ position }: { position: 'top' | 'bottom' }) {
  const { t } = useTranslation();
  const view = useNavigationStore((s) => s.currentView);
  const conn = useConnectionStore((s) => s.connectionState);
  const now = useClock();

  if (position === 'top') {
    return (
      <div className="bridge-elbow bridge-elbow-top" aria-hidden="true">
        <ElbowShape flip={false} color="var(--bridge-amber)" />
        <div className="bridge-seg bridge-seg-grow bridge-seg-join accent-amber">{t(`navigation:short.${view}`, { defaultValue: view })}</div>
        <div className="bridge-seg accent-tan" style={{ width: 92 }}>{`${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`}</div>
        <div className="bridge-seg accent-lilac" style={{ width: 168 }}>{t('tribute:moment.release')}</div>
        <div className="bridge-seg bridge-seg-cap accent-peach" />
      </div>
    );
  }
  const link = conn.isConnected ? (conn.transport ?? '') : conn.isWaitingForHeartbeat ? t('layout:appShell.waiting') : t('layout:appShell.disconnected');
  return (
    <div className="bridge-elbow bridge-elbow-bottom" aria-hidden="true">
      <ElbowShape flip color="var(--bridge-lilac)" />
      <div className="bridge-seg bridge-seg-join accent-lilac" style={{ width: 70 }}>{conn.isConnected ? `SYS ${conn.systemId ?? ''}` /* i18n-exempt: MAVLink system id */ : '--'}</div>
      <div className="bridge-seg bridge-seg-grow accent-lilac">{link}</div>
      <div className="bridge-seg accent-sky" style={{ width: 120 }}>{`UTC ${two(now.getUTCHours())}:${two(now.getUTCMinutes())}` /* i18n-exempt: time zone */}</div>
      <div className="bridge-seg bridge-seg-cap accent-tan" />
    </div>
  );
}
