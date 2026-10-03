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
            Хронология инцидентов
          </h2>
          <p className='card__sub'>Сначала новые. Время — виртуальное время смены (симуляция).</p>
        </div>
        <span className={`pill ${activeCount > 0 ? 'pill--stale' : 'pill--neutral'}`}>
          Активных: {activeCount}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className='empty'>Инцидентов пока не было. Линия работает штатно.</p>
      ) : (
        <ol className='timeline'>
          {sorted.map((item) => {
            const station = snapshot.stations.find((s) => s.id === item.stationId);
            const resolved = item.resolvedAtSeconds !== null;
            const duration = (item.resolvedAtSeconds ?? snapshot.elapsedSeconds) - item.startedAtSeconds;
            return (
              <li key={item.id} className={`timeline__item timeline__item--${item.severity}`}>
                <time className='timeline__time'>{formatClock(item.startedAtSeconds)}</time>
                <span className='timeline__dot' aria-hidden='true' />
                <div className='timeline__body'>
                  <div className='timeline__top'>
                    <span className={`sev sev--${item.severity}`}>
                      <StatusGlyph status={item.severity === 'critical' ? 'stopped' : 'warning'} size={13} />
                      {SEVERITY_LABEL[item.severity]}
                    </span>
                    <span className='timeline__station'>{station?.name ?? item.stationId}</span>
                    <span className={`timeline__state${resolved ? '' : ' timeline__state--active'}`}>
                      {resolved ? 'Устранён' : 'Активен'}
                    </span>
                  </div>
                  <h3 className='timeline__title'>{item.title}</h3>
                  <p className='timeline__desc'>{item.description}</p>
                  <p className='timeline__meta'>
                    {resolved
                      ? `Устранён в ${formatClock(item.resolvedAtSeconds ?? 0)} · длительность ${formatDuration(duration)}`
                      : `Идёт уже ${formatDuration(duration)} симуляции`}
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
