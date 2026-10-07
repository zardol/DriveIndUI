import { t } from '../i18n';
import { Monitor, Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionState } from '../useSession';
import { BROWSER_MODE } from '../runtimeMode';
import { setPreferences, usePreferences } from '../preferences';

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: 'Подключение…',
  online: 'Подключено',
  lost: 'Связь потеряна',
};

interface TopBarProps {
  connection: ConnectionState;
  sessionId: string | null;
}

export function TopBar({ connection, sessionId }: TopBarProps) {
  const { language, theme } = usePreferences();
  const Icon = BROWSER_MODE ? Monitor : connection === 'lost' ? WifiOff : Wifi;

  return (
    <header className='topbar'>
      <div className='topbar__brand'>
        <span className='topbar__sub'>{t("Allur / Октябрь 2026")}</span>
      </div>
      <div className='topbar__right'>
        <div className='language-switch' role='group' aria-label={t("Язык интерфейса")}>
          {([{ id: 'ru', label: 'RU', name: 'Русский' }, { id: 'kk', label: 'KZ', name: 'Қазақша' }, { id: 'en', label: 'ENG', name: 'English' }] as const).map(item =>
            <button type='button' key={item.id} lang={item.id} title={t(item.name)} aria-label={t(item.name)} aria-pressed={language === item.id} onClick={() => setPreferences({ language: item.id })}>{t(item.label)}</button>)}
        </div>
        <button className='theme-toggle icon-btn' type='button' aria-label={t(theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему')} title={t(theme === 'light' ? 'Тёмная тема' : 'Светлая тема')} onClick={() => setPreferences({ theme: theme === 'light' ? 'dark' : 'light' })}>
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <span className={`conn-chip conn-chip--${connection}`} role='status' aria-live='polite'>
          <Icon size={16} aria-hidden='true' />
          <span>{t(BROWSER_MODE && connection === 'online' ? 'Локальный режим' : CONNECTION_LABEL[connection])}</span>
          {sessionId && <span className='sr-only'>{t("Сессия ")}{t(sessionId.slice(0, 8))}</span>}
        </span>
      </div>
    </header>
  );
}
