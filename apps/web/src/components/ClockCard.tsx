import { t } from '../i18n';
import { clamp01, formatClock, formatDuration } from '../format';
import type { SessionSnapshot } from '../types';

interface ClockCardProps {
  snapshot: SessionSnapshot;
  stale: boolean;
}

export function ClockCard({ snapshot, stale }: ClockCardProps) {
  const { elapsedSeconds, shiftSeconds, running, speed } = snapshot;
  const ratio = shiftSeconds > 0 ? clamp01(elapsedSeconds / shiftSeconds) : 0;
  const finished = shiftSeconds > 0 && elapsedSeconds >= shiftSeconds;

  let tone: 'run' | 'pause' | 'done' | 'stale';
  let label: string;
  if (stale) {
    tone = 'stale';
    label = 'Данные устарели';
  } else if (finished) {
    tone = 'done';
    label = 'Смена завершена';
  } else if (running) {
    tone = 'run';
    label = `Идёт · ×${speed}`;
  } else {
    tone = 'pause';
    label = 'Пауза';
  }

  return (
    <section className='card clock' aria-label={t("Виртуальные часы смены")}>
      <div className='clock__top'>
        <span className='clock__label'>{t("Время смены (симуляция)")}</span>
        <span className={`pill pill--${tone}`}>
          {tone === 'run' && <span className='pill__dot' aria-hidden='true' />}
          {t(label)}
        </span>
      </div>
      <p className='clock__time' aria-label={t(`Время в симуляции ${formatClock(elapsedSeconds)}`)}>
        {t(formatClock(elapsedSeconds))}
      </p>
      <div
        className='bar'
        role='progressbar'
        aria-label={t("Прогресс смены")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div className='bar__fill' style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className='clock__meta'>
        {t(formatClock(0, false))}–{t(formatClock(shiftSeconds, false))} {t(" · прошло ")}{t(formatDuration(elapsedSeconds))}
      </p>
    </section>
  );
}
