import { t } from '../i18n';
import { useMemo } from 'react';
import { formatClock, formatDuration } from '../format';
import { SEVERITY_LABEL } from '../status';
import type { PlantSnapshot } from '../types';
import { StatusGlyph } from './StatusGlyph';

export function IncidentTimeline({ snapshot }: { snapshot: PlantSnapshot }) {
  const sorted = useMemo(
    () =>
      [...snapshot.incidents].sort(
        (a, b) => b.startedAtSeconds - a.startedAtSeconds || b.id.localeCompare(a.id),
      ),
    [snapshot.incidents],
  );
  const activeCount = sorted.filter((item) => item.resolvedAtSeconds === null).length;

  return (
    <>
      <div className='card__head'>
        <div>
          <h2 id='incidents-title' className='card__title'>
            {t("Инциденты смены")}</h2>
        </div>
        <span className={`pill ${activeCount > 0 ? 'pill--stale' : 'pill--neutral'}`}>
          {t("Активных: ")}{t(activeCount)}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className='empty'>{t("Остановок в этой смене пока нет.")}</p>
      ) : (
        <ol className='timeline'>
          {sorted.map((item) => {
            const station = snapshot.stations.find((s) => s.id === item.stationId);
            const resolved = item.resolvedAtSeconds !== null;
            const duration = (item.resolvedAtSeconds ?? snapshot.elapsedSeconds) - item.startedAtSeconds;
            return (
              <li key={item.id} className={`timeline__item timeline__item--${item.severity}`}>
                <time className='timeline__time'>{t(formatClock(item.startedAtSeconds))}</time>
                <span className='timeline__dot' aria-hidden='true' />
                <div className='timeline__body'>
                  <div className='timeline__top'>
                    <span className={`sev sev--${item.severity}`}>
                      <StatusGlyph status={item.severity === 'critical' ? 'stopped' : 'warning'} size={13} />
                      {t(SEVERITY_LABEL[item.severity])}
                    </span>
                    <span className='timeline__station'>{t(station?.name ?? item.stationId)}</span>
                    <span className={`timeline__state${resolved ? '' : ' timeline__state--active'}`}>
                      {t(resolved ? 'Устранён' : 'Активен')}
                    </span>
                  </div>
                  <h3 className='timeline__title'>{t(item.title)}</h3>
                  <details className='incident-description'><summary>{t("Причина и условия")}</summary><p className='timeline__desc'>{t(item.description)}</p></details>
                  <p className='timeline__meta'>
                    {t(resolved
                      ? `Устранён в ${formatClock(item.resolvedAtSeconds ?? 0)} · длительность ${formatDuration(duration)}`
                      : `Идёт уже ${formatDuration(duration)} симуляции`)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
