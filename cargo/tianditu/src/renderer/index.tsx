import { useCallback, useEffect, useState } from 'react';
import { ui, type RendererHostApi } from '@ardudeck/module-sdk';
import { strings } from '../shared/strings';

interface StatusReply {
  hasKey?: boolean;
}

interface SaveReply {
  ok?: boolean;
  error?: string;
}

/**
 * Where a key is created. The old host `console.tianditu.gov.cn` no longer
 * resolves (checked 2026-11: NXDOMAIN on Ali/Tencent/Google DNS); the console
 * moved to the cloud centre, and this is the "my applications" page that lists
 * keys. Registering an account is `passport.tianditu.gov.cn/register`.
 */
const CONSOLE_URL = 'https://cloudcenter.tianditu.gov.cn/center/development/myApp';
const AUTH_URL = 'http://lbs.tianditu.gov.cn/authorization/authorization.html';

/**
 * The one place a pilot enters the key. It lives in the module dock: the host
 * owns the frame and the launcher chip, this component is the body only.
 */
function TiandituPanel({ host }: { host: RendererHostApi }) {
  const t = (key: string, vars?: Record<string, unknown>) => host.i18n.t(key, vars);
  const [value, setValue] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void host
      .invoke('status', null)
      .then((reply) => {
        if (alive) setHasKey(Boolean((reply as StatusReply | null)?.hasKey));
      })
      .catch(() => {
        if (alive) setHasKey(false);
      });
    return () => {
      alive = false;
    };
  }, [host]);

  const save = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const reply = (await host.invoke('setKey', { key: value })) as SaveReply | null;
      if (reply?.ok) {
        setHasKey(true);
        setValue('');
        setNotice(t('saved'));
      } else if (reply?.error === 'keyInvalid' || reply?.error == null) {
        setNotice(t('keyInvalid'));
      } else {
        setNotice(t('saveFailed', { error: reply.error }));
      }
    } catch (err) {
      setNotice(t('saveFailed', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }, [host, value, t]);

  const clear = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      await host.invoke('clearKey', null);
      setHasKey(false);
      setNotice(t('cleared'));
    } catch (err) {
      setNotice(t('saveFailed', { error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setBusy(false);
    }
  }, [host, t]);

  return (
    <div className="flex flex-col gap-2 p-2 text-xs text-content">
      <p className="text-content-secondary">{t('intro')}</p>

      <label className="flex flex-col gap-1">
        <span className="font-medium">{t('keyLabel')}</span>
        <input
          {...ui('input')}
          type="password"
          value={value}
          placeholder={t('keyPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value && !busy) void save();
          }}
          className="w-full px-2 py-1 rounded border border-white/15 bg-black/20 font-mono"
        />
      </label>

      <div className="flex items-center gap-2">
        <button {...ui('button', { variant: 'primary' })} disabled={!value || busy} onClick={() => void save()}>
          {t('save')}
        </button>
        <button {...ui('button', { variant: 'secondary' })} disabled={busy || !hasKey} onClick={() => void clear()}>
          {t('clear')}
        </button>
        {hasKey !== null && (
          <span className="text-content-secondary">{hasKey ? t('saved') : ''}</span>
        )}
      </div>

      {notice && <p className="text-content-secondary">{notice}</p>}

      <p className="text-content-secondary">{t('serverKeyNote')}</p>
      <p className="text-content-secondary">{t('ipNote')}</p>

      <div className="mt-1">
        <p className="font-medium">{t('setupTitle')}</p>
        <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4 text-content-secondary">
          <li>{t('setupStep1')}</li>
          <li>{t('setupStep2')}</li>
          <li>{t('setupStep3')}</li>
        </ol>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer" className="underline">
          {t('consoleLink')}
        </a>
        <a href={AUTH_URL} target="_blank" rel="noopener noreferrer" className="underline">
          {t('authLink')}
        </a>
      </div>

      <p className="text-content-secondary">{t('attributionNote')}</p>
    </div>
  );
}

export async function activate(host: RendererHostApi): Promise<void> {
  // Strings first: the panel title is read at registration time.
  host.i18n.addResources(strings);

  host.panels.register({
    id: 'setup',
    title: host.i18n.t('panelTitle'),
    badge: 'TDT',
    size: 'compact',
    component: () => <TiandituPanel host={host} />,
  });

  // A picker row is named `basemap.<id>` in this namespace, so the row reads
  // the same string table as this panel.
  host.log('info', 'Tianditu panel ready');
}

export function deactivate(): void {
  // Every registration above is dropped by the host when the cargo unloads.
}
