import { useTranslation } from 'react-i18next';

/** Marks a tile or template that has not run on real vehicles yet. */
export function ExperimentalBadge() {
  const { t } = useTranslation();
  return (
    <span data-tip={t('radio-hud:studio.experimentalTip')}
      className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
      {t('radio-hud:studio.experimental')}
    </span>
  );
}
