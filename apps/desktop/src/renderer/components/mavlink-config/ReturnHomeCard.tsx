import { useTranslation } from 'react-i18next';
import { Home } from 'lucide-react';
import { DraggableSlider } from '../ui/DraggableSlider';
import { Card, Chips, EnumChips, useParam, type Tone } from './quick-setup-ui';

/** Return height and what happens at home. Shared by Quick setup and Safety, staged through the parameter store. */
export function ReturnHomeCard({ plane, onGoTo }: { plane: boolean; onGoTo?: (tab: string) => void }) {
  const { t } = useTranslation();
  const p = useParam();
  const k = 'mavlink-config:quickSetup.rtl';

  // Copter keeps the return height in cm (RTL_ALT) or, on newer firmware, in m (RTL_ALT_M); Plane in m, older in cm
  const altParam = plane
    ? (p.has('RTL_ALTITUDE') ? 'RTL_ALTITUDE' : p.has('ALT_HOLD_RTL') ? 'ALT_HOLD_RTL' : null)
    : (p.has('RTL_ALT_M') ? 'RTL_ALT_M' : p.has('RTL_ALT') ? 'RTL_ALT' : null);
  if (!altParam) return null;
  const inCm = altParam === 'RTL_ALT' || altParam === 'ALT_HOLD_RTL';
  const raw = p.get(altParam);
  const keepCurrent = plane && raw < 0;
  const altM = keepCurrent ? 0 : inCm ? raw / 100 : raw;
  const setAltM = (m: number) => p.set(altParam, inCm ? Math.round(m * 100) : m);

  const terrainType = p.has('RTL_ALT_TYPE') && p.get('RTL_ALT_TYPE') === 1;
  const terrainOff = terrainType && p.has('TERRAIN_ENABLE') && p.get('TERRAIN_ENABLE') === 0;
  const tone: Tone = terrainOff ? 'risk' : keepCurrent ? 'warn' : altM < 15 ? 'risk' : altM < 30 ? 'warn' : 'ok';
  const statusText = terrainOff ? t(`${k}.terrainOff`) : keepCurrent ? t(`${k}.statusCurrent`) : altM < 15 ? t(`${k}.statusLow`) : t(`${k}.statusHeight`, { m: Math.round(altM) });

  const finalParam = p.has('RTL_ALT_FINAL_M') ? 'RTL_ALT_FINAL_M' : p.has('RTL_ALT_FINAL') ? 'RTL_ALT_FINAL' : null;
  const finalCm = finalParam === 'RTL_ALT_FINAL';

  return (
    <Card
      icon={<Home className="w-5 h-5 text-sky-500 dark:text-sky-400" />}
      iconTone="bg-sky-500/15"
      title={t(`${k}.title`)}
      hint={t(`${k}.hint`)}
      status={tone}
      statusText={statusText}
      more={onGoTo ? { label: t(`${k}.more`), onClick: () => onGoTo('parameters') } : undefined}
    >
      {plane && (
        <Chips
          label={t(`${k}.heightMode`)}
          value={keepCurrent ? 0 : 1}
          onChange={(v) => (v === 0 ? p.set(altParam, -1) : setAltM(Math.max(altM, 100)))}
          options={[{ value: 1, label: t(`${k}.fixedHeight`) }, { value: 0, label: t(`${k}.currentHeight`) }]}
        />
      )}
      {!keepCurrent && (
        <DraggableSlider label={t(`${k}.height`)} value={altM} onChange={setAltM} min={0} max={300} step={5} color="#0EA5E9" hint={t(`${k}.heightHint`)} />
      )}
      {p.has('RTL_ALT_TYPE') && (
        <Chips
          label={t(`${k}.heightRef`)}
          value={p.get('RTL_ALT_TYPE')}
          onChange={(v) => p.set('RTL_ALT_TYPE', v)}
          options={[{ value: 0, label: t(`${k}.aboveHome`) }, { value: 1, label: t(`${k}.aboveTerrain`) }]}
        />
      )}
      {terrainOff && <p className="text-[11px] text-red-600 dark:text-red-400">{t(`${k}.terrainOffHint`)}</p>}
      {finalParam && (() => {
        const final = finalCm ? p.get(finalParam) / 100 : p.get(finalParam);
        return (
          <>
            <Chips
              label={t(`${k}.atHome`)}
              value={final > 0 ? 1 : 0}
              onChange={(v) => p.set(finalParam, v === 0 ? 0 : finalCm ? 500 : 5)}
              options={[{ value: 0, label: t(`${k}.land`) }, { value: 1, label: t(`${k}.hover`) }]}
            />
            {final > 0 && (
              <DraggableSlider label={t(`${k}.hoverHeight`)} value={final} onChange={(m) => p.set(finalParam, finalCm ? Math.round(m * 100) : m)} min={1} max={50} step={1} color="#0EA5E9" />
            )}
          </>
        );
      })()}
      {p.has('RTL_LOIT_TIME') && (
        <DraggableSlider label={t(`${k}.wait`)} value={p.get('RTL_LOIT_TIME') / 1000} onChange={(s) => p.set('RTL_LOIT_TIME', Math.round(s * 1000))} min={0} max={60} step={1} color="#0EA5E9" hint={t(`${k}.waitHint`)} />
      )}
      {plane && <EnumChips name="RTL_AUTOLAND" label={t(`${k}.autoland`)} />}
      {plane && p.has('RTL_RADIUS') && (
        <DraggableSlider label={t(`${k}.radius`)} value={p.get('RTL_RADIUS')} onChange={(m) => p.set('RTL_RADIUS', m)} min={0} max={300} step={5} color="#0EA5E9" hint={t(`${k}.radiusHint`)} />
      )}
    </Card>
  );
}
