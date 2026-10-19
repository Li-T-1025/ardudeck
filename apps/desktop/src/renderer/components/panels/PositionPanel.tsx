import { useTranslation } from 'react-i18next';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { formatAltitudeFromMeters } from '../../../shared/user-units.js';
import { PanelContainer, formatNumber } from './panel-utils';
import { useCoordinateFormat } from '../../utils/coordinate-format';

export function PositionPanel() {
  const { t } = useTranslation();
  const position = useTelemetryStore((s) => s.position);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const coord = useCoordinateFormat();

  return (
    <PanelContainer>
      <div className="space-y-2">
        {coord.current.id === 'decimal' ? (<>
        <div className="flex justify-between items-baseline">
          <span className="text-content-secondary text-xs">{t('common:latitude')}</span>
          <span className="text-content font-mono text-sm">{formatNumber(position.lat, 6)}°</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-content-secondary text-xs">{t('common:longitude')}</span>
          <span className="text-content font-mono text-sm">{formatNumber(position.lon, 6)}°</span>
        </div>
        </>) : (
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-content-secondary text-xs">{t('common:position')}</span>
            <span className="text-content font-mono text-sm tabular-nums text-right">{coord.format(position.lat, position.lon)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline">
          <span className="text-content-secondary text-xs">{t('common:altitude')}</span>
          <span className="text-content font-mono text-sm">{formatAltitudeFromMeters(position.alt, altitudeUnit)}</span>
        </div>
      </div>
    </PanelContainer>
  );
}
