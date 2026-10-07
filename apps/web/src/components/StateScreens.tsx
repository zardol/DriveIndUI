import { t } from '../i18n';
import { RefreshCw, WifiOff } from 'lucide-react';
import { formatLocalTime } from '../format';

function Spinner() {
  return (
    <svg className='spinner' width='44' height='44' viewBox='0 0 44 44' aria-hidden='true' focusable='false'>
      <circle cx='22' cy='22' r='18' className='spinner__track' />
      <circle cx='22' cy='22' r='18' className='spinner__arc' />
    </svg>
  );
}

export function LoadingState() {
  return (
    <div className='state-wrap'>
      <div className='card state' role='status' aria-live='polite'>
        <Spinner />
        <h1 className='state__title'>{t("Запускаем демонстрационную смену…")}</h1>
        <p className='state__text'>{t("Создаём сессию симуляции и получаем первые данные линии.")}</p>
      </div>
      <div className='skeleton-grid' aria-hidden='true'>
        <div className='skeleton' />
        <div className='skeleton' />
        <div className='skeleton' />
        <div className='skeleton' />
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message: string | null;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className='state-wrap'>
      <div className='card state state--error' role='alert'>
        <span className='state__icon'>
          <WifiOff size={26} aria-hidden='true' />
        </span>
        <h1 className='state__title'>{t("Не удалось подключиться к серверу симуляции")}</h1>
        <p className='state__text'>{t(message ?? 'Сервер недоступен.')}</p>
        <p className='state__hint'>{t("Автоматические попытки продолжаются каждые несколько секунд.")}</p>
        <button type='button' className='btn btn--primary' onClick={onRetry}>
          <RefreshCw size={16} aria-hidden='true' />
          {t("Повторить сейчас")}</button>
      </div>
    </div>
  );
}

interface ConnectionBannerProps {
  message: string | null;
  lastSyncAt: number | null;
  onRetry: () => void;
}

export function ConnectionBanner({ message, lastSyncAt, onRetry }: ConnectionBannerProps) {
  return (
    <div className='alert alert--warn' role='status'>
      <WifiOff size={18} aria-hidden='true' />
      <div className='alert__body'>
        <strong>{t("Связь с сервером потеряна.")}</strong>{t(' ')}
        {t("Показаны последние полученные данные")}{t(lastSyncAt ? ` (получены в ${formatLocalTime(lastSyncAt)})` : '')}{t(", схема остановлена. Повторяем подключение автоматически.")}{message ? <span className='alert__detail'> {t(" Причина: ")}{t(message)}</span> : null}
      </div>
      <button type='button' className='btn btn--small' onClick={onRetry}>
        <RefreshCw size={14} aria-hidden='true' />
        {t("Повторить")}</button>
    </div>
  );
}
