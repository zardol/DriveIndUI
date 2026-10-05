import { Monitor, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionState } from '../useSession';
import { BROWSER_MODE } from '../runtimeMode';

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: 'Подключение…',
  online: 'Подключено',
  lost: 'Связь потеряна',
};

interface TopBarProps {
  connection: ConnectionState;
  sessionId: string | null;
  dataLabel: string;
}

export function TopBar({ connection, sessionId, dataLabel }: TopBarProps) {
  const Icon = BROWSER_MODE ? Monitor : connection === 'lost' ? WifiOff : Wifi;

  return (
    <header className='topbar'>
      <div className='topbar__brand'>
        <span className='topbar__name'>Цифровой двойник</span>
        <span className='topbar__sub'>АЛЛЮР / Октябрь 2026</span>
      </div>
      <div className='topbar__right'>
        <span className='demo-badge'>
          <span className='demo-badge__dot' aria-hidden='true' />
          {dataLabel}
        </span>
        <span className={`conn-chip conn-chip--${connection}`} role='status' aria-live='polite'>
          <Icon size={16} aria-hidden='true' />
          <span>{BROWSER_MODE && connection === 'online' ? 'Локальный режим' : CONNECTION_LABEL[connection]}</span>
          {sessionId && <span className='sr-only'>Сессия {sessionId.slice(0, 8)}</span>}
        </span>
      </div>
    </header>
  );
}
