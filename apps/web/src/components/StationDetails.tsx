import { t } from '../i18n';
import { clamp01, clampPercent, formatDuration, formatInt, formatOne } from '../format';
import { SEVERITY_LABEL, STATUS_META } from '../status';
import { STATIONS } from '../types';
import type { PlantSnapshot, StationId } from '../types';
import { StatusBadge } from './StatusBadge';
import { StatusGlyph } from './StatusGlyph';

interface StationDetailsProps {
  snapshot: PlantSnapshot;
  selected: StationId;
  onSelect: (id: StationId) => void;
}

interface MetricProps {
  label: string;
  value: string;
  note?: string;
  progress?: number;
  tone?: 'default' | 'warn';
}

function Metric({ label, value, note, progress, tone = 'default' }: MetricProps) {
  return (
    <div className='metric'>
      <dt className='metric__label'>{t(label)}</dt>
      <dd className='metric__value'>{t(value)}</dd>
      {progress !== undefined && (
        <div className='bar bar--thin' aria-hidden='true'>
          <div
            className={`bar__fill${tone === 'warn' ? ' bar__fill--warn' : ''}`}
            style={{ width: `${clamp01(progress) * 100}%` }}
          />
        </div>
      )}
      {note && <p className='metric__note'>{t(note)}</p>}
    </div>
  );
}

export function StationDetails({ snapshot, selected, onSelect }: StationDetailsProps) {
  const station = snapshot.stations.find((item) => item.id === selected) ?? snapshot.stations[0];
  if (!station) return null;

  const definition = STATIONS.find((item) => item.id === station.id);
  const meta = STATUS_META[station.status];
  const openIncidents = snapshot.incidents.filter(
    (item) => item.stationId === station.id && item.resolvedAtSeconds === null,
  );
  const capacity = Math.max(1, station.bufferCapacity);
  const queueFull = station.inputQueue >= capacity;
  const nominal = station.cycleSeconds > 0 ? 3600 / station.cycleSeconds : null;

  return (
    <div className='details' aria-labelledby='station-title' role='region'>
      <div className='details__main'>
        <div className='chips' role='group' aria-label={t("Выбор станции")}>
          {snapshot.stations.map((item) => (
            <button
              key={item.id}
              type='button'
              className={`chip st--${item.status}`}
              aria-pressed={item.id === station.id}
              onClick={() => onSelect(item.id)}
            >
              <StatusGlyph status={item.status} size={14} />
              <span>{t(item.name)}</span>
            </button>
          ))}
        </div>

        <h3 id='station-title' className='details__title'>
          {t(station.name)}
        </h3>
        {definition && <p className='details__desc'>{t(definition.description)}</p>}
        <p className='details__status'>
          <StatusBadge status={station.status} />
        </p>
        <p className='details__hint'>{t(meta.hint)}</p>

        <div className='details__incidents'>
          <h4 className='details__subtitle'>{t("Активные инциденты")}</h4>
          {openIncidents.length === 0 ? (
            <p className='muted'>{t("Активных инцидентов по станции нет.")}</p>
          ) : (
            <ul className='mini-list'>
              {openIncidents.map((item) => (
                <li key={item.id}>
                  <span className={`sev sev--${item.severity}`}>
                    <StatusGlyph status={item.severity === 'critical' ? 'stopped' : 'warning'} size={13} />
                    {t(SEVERITY_LABEL[item.severity])}
                  </span>
                  <strong>{t(item.title)}</strong>
                  <span className='muted'>{t(item.description)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <dl className='metrics'>
        <Metric
          label={t("Прогресс цикла")}
          value={station.inProcess ? `${Math.round(clamp01(station.progress) * 100)}%` : '—'}
          progress={station.inProcess ? station.progress : 0}
          note={station.inProcess ? `Цикл ${formatDuration(station.cycleSeconds)}` : 'Нет изделия в обработке'}
        />
        <Metric
          label={t("Входной буфер")}
          value={`${formatInt(station.inputQueue)} из ${formatInt(capacity)}`}
          progress={station.inputQueue / capacity}
          tone={queueFull ? 'warn' : 'default'}
          note={`${station.queuedUnits} ожидают · ${station.arrivingUnits} подъезжают${queueFull ? ' · буфер заполнен' : ''}`}
        />
        <Metric
          label={t("Загрузка")}
          value={`${Math.round(clampPercent(station.utilizationPercent))}%`}
          progress={clampPercent(station.utilizationPercent) / 100}
          note={t("Доля времени в работе с начала смены")}
        />
        <Metric label={t("Выпущено станцией")} value={`${formatInt(station.completed)} ед.`} />
        <Metric label={t("Текущий темп")} value={`${formatOne(station.throughputPerHour)} ед./ч`} />
        <Metric
          label={t("Мощность по текущему циклу")}
          value={nominal === null ? '—' : `${formatOne(nominal)} ед./ч`}
          note={t("Без учёта ожидания и блокировок")}
        />
        <Metric
          label={t("Простой оборудования")}
          value={formatDuration(station.downtimeSeconds)}
          tone={station.downtimeSeconds > 0 ? 'warn' : 'default'}
          note={t("Только остановки оборудования")}
        />
      </dl>
    </div>
  );
}
