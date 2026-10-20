import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Download, LayoutGrid, Radio, TriangleAlert } from 'lucide-react';

export type GuideState = 'no-link' | 'no-mavlink' | 'streams-off';

/** Guide tab for colour radios: getting the widget onto a screen, and what it shows when data is missing. */
export function HudGuide({ renderState }: { renderState: (state: GuideState) => ReactNode }) {
  const { t } = useTranslation();
  const k = 'radio-hud:guide';
  const steps = [
    { icon: <Download className="h-4 w-4 text-blue-400" />, tone: 'bg-blue-500/10 border-blue-500/20', id: 'install' },
    { icon: <LayoutGrid className="h-4 w-4 text-teal-400" />, tone: 'bg-teal-500/10 border-teal-500/20', id: 'place' },
    { icon: <Radio className="h-4 w-4 text-amber-400" />, tone: 'bg-amber-500/10 border-amber-500/20', id: 'telemetry' },
  ];
  const states: GuideState[] = ['no-link', 'no-mavlink', 'streams-off'];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {steps.map((s, i) => (
          <section key={s.id} className="rounded-xl border border-subtle bg-surface-input p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${s.tone}`}>{s.icon}</div>
              <h3 className="text-sm font-semibold text-content">
                <span className="mr-1.5 text-content-tertiary">{i + 1}</span>{t(`${k}.${s.id}Title`)}
              </h3>
            </div>
            <p className="text-sm leading-relaxed text-content-secondary">
              <Trans i18nKey={`${k}.${s.id}Body`} components={{ b: <b className="font-medium text-content" /> }} />
            </p>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-subtle bg-surface-input p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10">
            <TriangleAlert className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content">{t(`${k}.statesTitle`)}</h3>
            <p className="text-xs text-content-secondary">{t(`${k}.statesHint`)}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {states.map((state) => (
            <div key={state} className="space-y-2.5">
              <div className="overflow-hidden rounded-lg border border-subtle">{renderState(state)}</div>
              <p className="text-xs leading-relaxed text-content-secondary">
                <Trans i18nKey={`${k}.state.${state}`} components={{ b: <b className="font-medium text-content" /> }} />
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
