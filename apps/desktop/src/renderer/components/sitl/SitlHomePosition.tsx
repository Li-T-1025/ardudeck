import { useTranslation } from 'react-i18next';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { PositionInput } from '../ui/PositionInput';
import { useCoordinateFormat } from '../../utils/coordinate-format';

const FIELD = 'w-full px-2 py-1.5 text-sm bg-surface-raised text-content border border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50';

/** SITL home position: latitude and longitude in decimal, else one field in the chosen coordinate format. */
export function SitlHomePosition({ lat, lng, disabled, onChange }: {
  lat: number;
  lng: number;
  disabled: boolean;
  onChange: (p: { lat: number; lng: number }) => void;
}) {
  const { t } = useTranslation();
  const coord = useCoordinateFormat();
  if (coord.current.id !== 'decimal') {
    return (
      <div className="col-span-2">
        <label className="block text-xs text-content-secondary mb-1">
          {t('mission:waypointTable.list.position', { format: coord.current.labelKey ? t(coord.current.labelKey) : coord.current.label })}
        </label>
        {disabled ? (
          <div className={`${FIELD} font-mono opacity-50`}>{coord.format(lat, lng)}</div>
        ) : (
          <PositionInput
            key={coord.current.id}
            value={coord.format(lat, lng)}
            parse={coord.parse}
            invalidHint={t('mission:waypointTable.list.positionInvalid')}
            onCommit={(p) => onChange({ lat: p.lat, lng: p.lon })}
            className="!text-sm !py-1.5 !rounded-lg !bg-surface-raised"
          />
        )}
      </div>
    );
  }
  return (
    <>
      <div>
        <label className="block text-xs text-content-secondary mb-1">{t('common:latitude')}</label>
        <DraftNumberInput step="0.0001" min={-90} max={90} value={lat} onCommit={(v) => onChange({ lat: v, lng })} disabled={disabled} className={FIELD} />
      </div>
      <div>
        <label className="block text-xs text-content-secondary mb-1">{t('common:longitude')}</label>
        <DraftNumberInput step="0.0001" min={-180} max={180} value={lng} onCommit={(v) => onChange({ lat, lng: v })} disabled={disabled} className={FIELD} />
      </div>
    </>
  );
}
