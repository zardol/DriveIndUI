import { locale, usePreferences } from '../preferences';
import { t } from '../i18n';
import { memo, useEffect, useId, useMemo, useReducer } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HistoricalDataset, HistoricalRecord } from '@driveindui/shared';
import '../history-viewer.css';

const PAGE_SIZE = 20;
const AUTOPLAY_INTERVAL_MS = 900;
const CHART_HEIGHT = 280;

const COLOR_INK = 'var(--ink)';
const COLOR_GREEN = 'var(--accent)';
const COLOR_MUTED = 'var(--ink-3)';

const NOTICE_ORIGIN = 'Показатели из файла · происхождение не проверено';
const NOTICE_PLAYBACK =
  'Показаны исходные записи. Движение отдельных автомобилей по агрегатам не восстанавливается.';

/* Целые счётчики не округляем (парсер гарантирует целые), для плана допускаем до 2 знаков. */
const numberFormat = () => new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 });
const signedFormat = () => new Intl.NumberFormat(locale(), {
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});
const qualityFormat = () => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 });

/** Длительность относительно начала файла, например «1 ч 20 мин». Не время суток. */
function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ч`);
  if (minutes > 0) parts.push(`${minutes} мин`);
  if (seconds > 0) parts.push(`${seconds} с`);
  return t(parts.length > 0 ? parts.join(' ') : '0 с');
}

function formatSeconds(seconds: number): string {
  return t(`${numberFormat().format(seconds)} с`);
}

function formatQuality(record: HistoricalRecord): string {
  const completed = record.goodUnits + record.rejectedUnits;
  if (completed === 0) return '—';
  return `${qualityFormat().format((record.goodUnits / completed) * 100)}\u00A0%`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

interface ViewerState {
  source: HistoricalDataset;
  index: number;
  playing: boolean;
  page: number;
}

type ViewerAction =
  | { type: 'reset'; source: HistoricalDataset }
  | { type: 'select'; index: number }
  | { type: 'step'; delta: number }
  | { type: 'toStart' }
  | { type: 'tick' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'page'; page: number };

function lastIndexOf(source: HistoricalDataset): number {
  return Math.max(0, source.records.length - 1);
}

function pageCountOf(source: HistoricalDataset): number {
  return Math.max(1, Math.ceil(source.records.length / PAGE_SIZE));
}

function createInitialState(source: HistoricalDataset): ViewerState {
  return { source, index: 0, playing: false, page: 0 };
}

/** Перемещает выбор; страница таблицы следует за выбранной записью; на последней записи автовоспроизведение останавливается. */
function moveTo(state: ViewerState, index: number): ViewerState {
  const last = lastIndexOf(state.source);
  const next = clamp(Math.trunc(index), 0, last);
  return {
    ...state,
    index: next,
    page: Math.floor(next / PAGE_SIZE),
    playing: state.playing && next < last,
  };
}

function reducer(state: ViewerState, action: ViewerAction): ViewerState {
  switch (action.type) {
    case 'reset':
      return createInitialState(action.source);
    case 'select':
      return { ...moveTo(state, action.index), playing: false };
    case 'step':
      return { ...moveTo(state, state.index + action.delta), playing: false };
    case 'toStart':
      return { ...moveTo(state, 0), playing: false };
    case 'tick':
      if (!state.playing) return state;
      return moveTo(state, state.index + 1);
    case 'play':
      if (state.index >= lastIndexOf(state.source)) return state;
      return { ...state, playing: true };
    case 'pause':
      return state.playing ? { ...state, playing: false } : state;
    case 'page':
      return {
        ...state,
        page: clamp(Math.trunc(action.page), 0, pageCountOf(state.source) - 1),
      };
    default:
      return state;
  }
}

function isRecordLike(value: unknown): value is HistoricalRecord {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.elapsedSeconds === 'number' &&
    typeof candidate.goodUnits === 'number' &&
    typeof candidate.rejectedUnits === 'number' &&
    typeof candidate.wip === 'number' &&
    typeof candidate.planUnits === 'number' &&
    typeof candidate.downtimeSeconds === 'number'
  );
}

interface HistoryTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

/** Подсказка показывает только фактическую запись файла, без расчётных строк. */
function HistoryTooltip({ active, payload }: HistoryTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const record = payload[0]?.payload;
  if (!isRecordLike(record)) return null;
  return (
    <div className="history-tooltip">
      <p className="history-tooltip-title">
        {t(formatDuration(record.elapsedSeconds))} {t(" от начала файла")}</p>
      <dl className="history-tooltip-list">
        <dt>{t("Выпущено")}</dt>
        <dd>{t(numberFormat().format(record.goodUnits))}</dd>
        <dt>{t("Брак")}</dt>
        <dd>{t(numberFormat().format(record.rejectedUnits))}</dd>
        <dt>{t("В работе")}</dt>
        <dd>{t(numberFormat().format(record.wip))}</dd>
        <dt>{t("План")}</dt>
        <dd>{t(numberFormat().format(record.planUnits))}</dd>
        <dt>{t("Простои")}</dt>
        <dd>{t(formatSeconds(record.downtimeSeconds))}</dd>
      </dl>
      <p className="history-tooltip-note">{t("Значения записи из файла")}</p>
    </div>
  );
}

export const HistoricalViewer = memo(function HistoricalViewer({ dataset, active = true }: { dataset: HistoricalDataset; active?: boolean }) {
  usePreferences();
  const [state, dispatch] = useReducer(reducer, dataset, createInitialState);
  const sliderId = useId();
  const summaryId = useId();
  const tableCaptionId = useId();

  /* Замена набора данных: состояние сбрасывается сразу, без показа устаревшего индекса. */
  const fresh = state.source === dataset;
  const view = fresh ? state : createInitialState(dataset);
  if (!fresh) {
    dispatch({ type: 'reset', source: dataset });
  }

  const records = dataset.records;
  const last = Math.max(0, records.length - 1);
  const index = clamp(view.index, 0, last);
  const playing = active && view.playing && index < last;

  /* Автовоспроизведение: одна запись за тик; интервал снимается при размонтировании и замене данных. */
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      dispatch({ type: 'tick' });
    }, AUTOPLAY_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [playing, dataset]);

  const summary = useMemo(() => {
    const first = records[0];
    const final = records[records.length - 1];
    if (!first || !final) return null;
    return { first, final, count: records.length };
  }, [records]);

  const selected = records[index];
  if (!selected || !summary) {
    return (
      <div className="history-viewer">
        <p className="history-empty" role="status">
          {t("В наборе нет записей для отображения.")}</p>
      </div>
    );
  }

  const previous = index > 0 ? records[index - 1] : undefined;
  const deviation = selected.goodUnits - selected.planUnits;
  const atEnd = index >= last;

  const pageCount = pageCountOf(dataset);
  const page = clamp(view.page, 0, pageCount - 1);
  const pageStart = page * PAGE_SIZE;
  const pageRows = records.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeFrom = pageStart + 1;
  const rangeTo = pageStart + pageRows.length;

  let statusText = 'Воспроизведение на паузе.';
  if (playing) statusText = 'Идёт воспроизведение по записям.';
  else if (atEnd) statusText = 'Достигнута последняя запись, автовоспроизведение остановлено.';

  const kpis: ReadonlyArray<{ key: string; label: string; value: string; hint?: string }> = [
    { key: 'good', label: 'Выпущено годных', value: numberFormat().format(selected.goodUnits) },
    { key: 'rejected', label: 'Брак', value: numberFormat().format(selected.rejectedUnits) },
    { key: 'wip', label: 'В работе', value: numberFormat().format(selected.wip) },
    {
      key: 'quality',
      label: 'Качество',
      value: formatQuality(selected),
      hint: 'годные / (годные + брак)',
    },
    { key: 'plan', label: 'План', value: numberFormat().format(selected.planUnits) },
    {
      key: 'deviation',
      label: 'Отклонение от плана',
      value: signedFormat().format(deviation),
      hint: 'годные − план',
    },
  ];

  return (
    <div className="history-viewer">
      <section className="history-notice" aria-label={t("Статус данных")}>
        <p className="history-notice-title">{t(NOTICE_ORIGIN)}</p>
        <p className="history-notice-text">{t(NOTICE_PLAYBACK)}</p>
        <p className="history-notice-name">
          {t("Набор: ")}<span>{dataset.name}</span>
        </p>
      </section>

      <section className="history-card" aria-label={t("Воспроизведение записей")}>
        <div className="history-controls">
          <button
            type="button"
            className="history-btn"
            onClick={() => dispatch({ type: 'toStart' })}
            disabled={index === 0 && !playing}
          >
            {t("« В начало")}</button>
          <button
            type="button"
            className="history-btn"
            onClick={() => dispatch({ type: 'step', delta: -1 })}
            disabled={index <= 0}
          >
            {t("‹ Предыдущая запись")}</button>
          {playing ? (
            <button
              type="button"
              className="history-btn history-btn-primary"
              onClick={() => dispatch({ type: 'pause' })}
            >
              {t("❚❚ Пауза")}</button>
          ) : (
            <button
              type="button"
              className="history-btn history-btn-primary"
              onClick={() => dispatch({ type: 'play' })}
              disabled={atEnd}
            >
              {t("▶ Воспроизвести")}</button>
          )}
          <button
            type="button"
            className="history-btn"
            onClick={() => dispatch({ type: 'step', delta: 1 })}
            disabled={atEnd}
          >
            {t("Следующая запись ›")}</button>
        </div>

        <div className="history-slider">
          <label htmlFor={sliderId} className="history-slider-label">
            {t("Выбранная запись (номер по порядку)")}</label>
          <input
            id={sliderId}
            className="history-slider-input"
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            onChange={(event) => {
              dispatch({ type: 'select', index: Number(event.target.value) });
            }}
            aria-valuetext={`Запись ${index + 1} из ${records.length}, ${formatDuration(selected.elapsedSeconds)} от начала файла`}
          />
        </div>

        <p className="history-current">
          <strong>
            {t("Запись ")}{t(numberFormat().format(index + 1))} {t(" из ")}{t(numberFormat().format(records.length))}
          </strong>
          <span>
            {t(' · ')}
            {t(formatDuration(selected.elapsedSeconds))} {t(" от начала файла (")}{t(formatSeconds(selected.elapsedSeconds))})
          </span>
          {previous ? (
            <span className="history-current-gap">
              {t(' · ')}{t("интервал от предыдущей записи:")}{t(' ')}
              {t(formatDuration(selected.elapsedSeconds - previous.elapsedSeconds))}
            </span>
          ) : null}
        </p>
        <p className="history-playback-note">
          {t("Следующая исходная запись — каждые 0,9 с. Пропуски не заполняются.")}</p>
        <p className="history-status" role="status" aria-live="polite">
          {t(statusText)}
        </p>
      </section>

      <section aria-label={t("Показатели выбранной записи")}>
        <ul className="history-kpis">
          {kpis.map((kpi) => (
            <li key={kpi.key} className="history-kpi">
              <span className="history-kpi-label">{t(kpi.label)}</span>
              <span className="history-kpi-value">{t(kpi.value)}</span>
              {kpi.hint ? <span className="history-kpi-hint">{t(kpi.hint)}</span> : null}
            </li>
          ))}
          <li className="history-kpi history-kpi-wide">
            <span className="history-kpi-label">{t("Простои, суммарно")}</span>
            <span className="history-kpi-value">
              {t(formatDuration(selected.downtimeSeconds))}
            </span>
            <span className="history-kpi-hint">
              {t(formatSeconds(selected.downtimeSeconds))} {t(" — сумма по 4 единицам оборудования; может превышать прошедшее время.")}</span>
          </li>
        </ul>
      </section>

      <section className="history-card" aria-label={t("График исторических записей")}>
        <h3 className="history-heading">{t("Годные и план по записям файла")}</h3>
        <p className="history-chart-summary">{t(numberFormat().format(summary.count))} {t(" записей · ")}{t(formatDuration(summary.first.elapsedSeconds))}–{t(formatDuration(summary.final.elapsedSeconds))} {t(" от начала смены. Линии соединяют измерения ступенями; значения между записями неизвестны.")}</p>
        <p id={summaryId} className="history-sr-only">
          {t("Исторические записи из файла: ")}{t(numberFormat().format(summary.count))} {t(" точек, от")}{t(' ')}
          {t(formatDuration(summary.first.elapsedSeconds))} {t(" до")}{t(' ')}
          {t(formatDuration(summary.final.elapsedSeconds))} {t(" от начала файла. В последней записи годных")}{t(' ')}
          {t(numberFormat().format(summary.final.goodUnits))}{t(", план")}{t(' ')}
          {t(numberFormat().format(summary.final.planUnits))}{t(". Между записями значения не достраиваются (ступенчатая линия). Выбрана запись ")}{t(numberFormat().format(index + 1))}:{t(' ')}
          {t(formatDuration(selected.elapsedSeconds))}{t(", годных ")}{t(numberFormat().format(selected.goodUnits))}{t(", план ")}{t(numberFormat().format(selected.planUnits))}.
        </p>
        <div className="history-chart" role="img" aria-labelledby={summaryId}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT} minWidth={0}>
            <LineChart data={records} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="elapsedSeconds"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(value: number) => formatDuration(value)}
                tick={{ fill: COLOR_MUTED, fontSize: 12 }}
                stroke={COLOR_MUTED}
                minTickGap={24}
              />
              <YAxis
                type="number"
                tickFormatter={(value: number) => numberFormat().format(value)}
                tick={{ fill: COLOR_MUTED, fontSize: 12 }}
                stroke={COLOR_MUTED}
                width={56}
                allowDecimals
              />
              <Tooltip content={<HistoryTooltip />} isAnimationActive={false} />
              <ReferenceLine x={selected.elapsedSeconds} stroke={COLOR_INK} strokeDasharray="4 3" />
              <Line
                type="stepAfter"
                dataKey="planUnits"
                name={t("План (по файлу)")}
                stroke={COLOR_MUTED}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line
                type="stepAfter"
                dataKey="goodUnits"
                name={t("Выпущено годных (по файлу)")}
                stroke={COLOR_GREEN}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <ReferenceDot
                x={selected.elapsedSeconds}
                y={selected.goodUnits}
                r={5}
                fill={COLOR_GREEN}
                stroke="var(--surface)"
                strokeWidth={2}
                ifOverflow="visible"
              />
              <ReferenceDot
                x={selected.elapsedSeconds}
                y={selected.planUnits}
                r={5}
                fill={COLOR_MUTED}
                stroke="var(--surface)"
                strokeWidth={2}
                ifOverflow="visible"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ul className="history-legend" aria-hidden="true">
          <li>
            <span className="history-legend-swatch history-legend-good" />
            {t("Выпущено годных (по файлу)")}</li>
          <li>
            <span className="history-legend-swatch history-legend-plan" />
            {t("План (по файлу)")}</li>
          <li>
            <span className="history-legend-swatch history-legend-cursor" />
            {t("Выбранная запись")}</li>
        </ul>
      </section>

      <details className="history-card history-details">
        <summary className="history-details-summary">{t("Все записи")}</summary>
        <div className="history-table-toolbar">
          <p className="history-table-range">
            {t("Записи ")}{t(numberFormat().format(rangeFrom))}–{t(numberFormat().format(rangeTo))} {t(" из")}{t(' ')}
            {t(numberFormat().format(records.length))}
          </p>
          <div className="history-table-pager">
            <button
              type="button"
              className="history-btn"
              onClick={() => dispatch({ type: 'page', page: page - 1 })}
              disabled={page <= 0}
            >
              {t("‹ Назад")}</button>
            <span className="history-table-page">
              {t("Страница ")}{t(numberFormat().format(page + 1))} {t(" из ")}{t(numberFormat().format(pageCount))}
            </span>
            <button
              type="button"
              className="history-btn"
              onClick={() => dispatch({ type: 'page', page: page + 1 })}
              disabled={page >= pageCount - 1}
            >
              {t("Вперёд ›")}</button>
          </div>
        </div>
        <div className="history-table-container">
          <table className="history-table" aria-labelledby={tableCaptionId}>
            <caption id={tableCaptionId} className="history-sr-only">
              {t("Записи из файла, строки ")}{t(rangeFrom)}–{t(rangeTo)} {t(" из ")}{t(records.length)}{t(". Значения выбранной записи отмечены.")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("Время от начала")}</th>
                <th scope="col">{t("Выпущено")}</th>
                <th scope="col">{t("Брак")}</th>
                <th scope="col">{t("В работе")}</th>
                <th scope="col">{t("План")}</th>
                <th scope="col">{t("Простои, с")}</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, offset) => {
                const rowIndex = pageStart + offset;
                const isSelected = rowIndex === index;
                return (
                  <tr
                    key={`${rowIndex}-${row.elapsedSeconds}`}
                    className={isSelected ? 'history-row history-row-selected' : 'history-row'}
                  >
                    <th scope="row">
                      <button
                        type="button"
                        className="history-row-button"
                        aria-current={isSelected ? 'true' : undefined}
                        onClick={() => dispatch({ type: 'select', index: rowIndex })}
                      >
                        <span className="history-sr-only">{t("Запись ")}{t(rowIndex + 1)}: </span>
                        <span>{t(formatDuration(row.elapsedSeconds))}</span>
                        <small>{t(formatSeconds(row.elapsedSeconds))}</small>
                      </button>
                    </th>
                    <td>{t(numberFormat().format(row.goodUnits))}</td>
                    <td>{t(numberFormat().format(row.rejectedUnits))}</td>
                    <td>{t(numberFormat().format(row.wip))}</td>
                    <td>{t(numberFormat().format(row.planUnits))}</td>
                    <td>{t(numberFormat().format(row.downtimeSeconds))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
});
