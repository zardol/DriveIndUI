import { useState } from 'react';
import type {
  SessionSnapshot,
  SessionComparison,
  ComparisonOptions,
  DecisionId,
  HistoryPoint,
} from '@driveindui/shared';
import { SCENARIOS, PRODUCT_MODELS, summarizePlan } from '@driveindui/shared';
import { formatClock, formatInt, formatSigned } from '../format';
import {
  RefreshCw,
  AlertTriangle,
  Info,
  Clock,
  ChevronDown,
  Sliders,
} from 'lucide-react';
import '../comparison.css';

export interface ComparisonPanelProps {
  snapshot: SessionSnapshot;
  result: SessionComparison | null;
  pending: boolean;
  error: string | null;
  disabled: boolean;
  onCompare: (options: ComparisonOptions) => void;
}

const DECISION_HEADERS: Record<DecisionId, string> = {
  baseline: 'Продолжить смену',
  maintenance: 'Обслужить окраску',
  reserve: 'Резерв мощности сборки',
};

const DECISION_BADGES: Record<DecisionId, string> = {
  baseline: 'Текущий режим',
  maintenance: 'Обслуживание',
  reserve: 'Удвоение мощности',
};

function sampleHistory(points: HistoryPoint[], maxPoints = 100): HistoryPoint[] {
  if (!points || points.length <= maxPoints) return points || [];
  const sampled: HistoryPoint[] = [];
  const total = points.length;
  const step = (total - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints - 1; i++) {
    sampled.push(points[Math.round(i * step)]);
  }
  sampled.push(points[total - 1]);
  return sampled;
}

interface SvgChartProps {
  result: SessionComparison;
}

function ComparisonChart({ result }: SvgChartProps) {
  const width = 600;
  const height = 220;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 30;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const tMin = 0;
  const tMax = Math.max(tMin + 1, result.toSeconds);

  let maxUnits = Math.max(result.shiftPlan, 1);
  result.alternatives.forEach((alt) => {
    alt.history.forEach((h) => {
      if (h.goodUnits > maxUnits) maxUnits = h.goodUnits;
    });
  });
  const yMax = Math.ceil(maxUnits * 1.06);
  const yMin = 0;

  const toX = (sec: number) => {
    const fraction = (sec - tMin) / (tMax - tMin);
    return padLeft + Math.max(0, Math.min(1, fraction)) * chartW;
  };

  const toY = (units: number) => {
    const fraction = (units - yMin) / (yMax - yMin);
    return padTop + chartH - Math.max(0, Math.min(1, fraction)) * chartH;
  };

  const planY = toY(result.shiftPlan);

  const lines = result.alternatives.map((alt) => {
    const sampled = sampleHistory(alt.history, 100);
    const d = sampled
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.elapsedSeconds).toFixed(1)} ${toY(p.goodUnits).toFixed(1)}`)
      .join(' ');
    return { id: alt.id, d, units: alt.goodUnits };
  });

  const colors: Record<DecisionId, string> = {
    baseline: '#52605b',
    maintenance: '#1d6b5e',
    reserve: '#d97706',
  };

  return (
    <div className="cmp-chart-box">
      <div className="cmp-chart-title">Годный выпуск за смену: три варианта</div>
      <div className="cmp-chart-svg-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="cmp-chart-svg"
          role="img"
          aria-label="График выпуска годных автомобилей по сценариям решений"
        >
          <line
            x1={padLeft}
            y1={padTop + chartH}
            x2={padLeft + chartW}
            y2={padTop + chartH}
            className="cmp-chart-axis"
          />
          <line
            x1={padLeft}
            y1={planY}
            x2={padLeft + chartW}
            y2={planY}
            className="cmp-chart-plan-line"
          />
          <text x={padLeft + 4} y={planY - 4} className="cmp-chart-plan-text">
            План: {result.shiftPlan} шт.
          </text>

          <line x1={toX(result.fromSeconds)} x2={toX(result.fromSeconds)} y1={padTop} y2={padTop + chartH} stroke="#aaa" strokeDasharray="3 4" />

          {lines.map((item) => (
            <path
              key={item.id}
              d={item.d}
              fill="none"
              stroke={colors[item.id]}
              strokeWidth={item.id === 'baseline' ? 2 : 2.5}
              strokeDasharray={item.id === 'baseline' ? '5 3' : undefined}
              className={`cmp-chart-line cmp-chart-line--${item.id}`}
            />
          ))}

          <text x={padLeft} y={height - 10} className="cmp-chart-tick-text" textAnchor="start">
            {formatClock(tMin, false)}
          </text>
          <text x={padLeft + chartW / 2} y={height - 10} className="cmp-chart-tick-text" textAnchor="middle">
            {formatClock((tMin + tMax) / 2, false)}
          </text>
          <text x={padLeft + chartW} y={height - 10} className="cmp-chart-tick-text" textAnchor="end">
            {formatClock(tMax, false)}
          </text>

          <text x={padLeft - 6} y={padTop + chartH} className="cmp-chart-tick-text" textAnchor="end">
            0
          </text>
          <text x={padLeft - 6} y={padTop + 10} className="cmp-chart-tick-text" textAnchor="end">
            {yMax}
          </text>
        </svg>
      </div>
      <div className="cmp-legend">
        <span className="cmp-legend__item">
          <span className="cmp-legend__dot cmp-legend__dot--baseline" />
          <span>Продолжить смену</span>
        </span>
        <span className="cmp-legend__item">
          <span className="cmp-legend__dot cmp-legend__dot--maintenance" />
          <span>Обслужить окраску</span>
        </span>
        <span className="cmp-legend__item">
          <span className="cmp-legend__dot cmp-legend__dot--reserve" />
          <span>Резерв мощности</span>
        </span>
        <span className="cmp-legend__item">
          <span className="cmp-legend__dot cmp-legend__dot--plan" />
          <span>План смены</span>
        </span>
      </div>
    </div>
  );
}

export function ComparisonPanel({
  snapshot,
  result,
  pending,
  error,
  disabled,
  onCompare,
}: ComparisonPanelProps) {
  const [maintenanceMinutes, setMaintenanceMinutes] = useState<ComparisonOptions['maintenanceMinutes']>(10);
  const [reserveSetupMinutes, setReserveSetupMinutes] = useState<ComparisonOptions['reserveSetupMinutes']>(5);

  const isShiftEnded = snapshot.elapsedSeconds >= snapshot.shiftSeconds;
  const isButtonDisabled = pending || disabled || isShiftEnded;

  const optionsChanged =
    result !== null &&
    (result.options.maintenanceMinutes !== maintenanceMinutes ||
      result.options.reserveSetupMinutes !== reserveSetupMinutes);

  const handleCompareClick = () => {
    if (isButtonDisabled) return;
    onCompare({
      maintenanceMinutes,
      reserveSetupMinutes,
    });
  };

  const scenarioMeta = result
    ? SCENARIOS.find((s) => s.id === result.scenario)
    : null;
  const scenarioTitle = snapshot.config.productionPlan ? (result?.scenario === 'equipment' ? 'Камера-02 · 40 мин' : result?.scenario === 'bottleneck' ? 'Конвейер-03 · 55 мин' : 'Без остановок') : scenarioMeta ? scenarioMeta.name : (result?.scenario ?? '');

  const alternativesOrder: DecisionId[] = ['baseline', 'maintenance', 'reserve'];
  const sortedAlternatives = result
    ? [...result.alternatives].sort(
        (a, b) => alternativesOrder.indexOf(a.id) - alternativesOrder.indexOf(b.id)
      )
    : [];

  return (
    <section id="decisions" className="cmp-panel" aria-labelledby="cmp-heading">
      <div className="cmp-header">
        <div className="cmp-header__titles">
          <h2 id="cmp-heading" className="cmp-heading">
            Сравнение решений
          </h2>
          <p className="cmp-subheading">
            Что изменится к концу смены, если обслужить окраску или увеличить мощность сборки?
          </p>
        </div>
      </div>

      <div className="cmp-controls">
        <div className="cmp-controls__group">
          <label htmlFor="cmp-maintenance-select" className="cmp-label">
            Длительность ТО окраски:
          </label>
          <select
            id="cmp-maintenance-select"
            className="cmp-select"
            value={maintenanceMinutes}
            disabled={pending || disabled || isShiftEnded}
            onChange={(e) =>
              setMaintenanceMinutes(Number(e.target.value) as ComparisonOptions['maintenanceMinutes'])
            }
          >
            <option value={5}>5 минут</option>
            <option value={10}>10 минут (базовое ТО)</option>
            <option value={15}>15 минут</option>
            <option value={20}>20 минут</option>
          </select>
        </div>

        <div className="cmp-controls__group">
          <label htmlFor="cmp-reserve-select" className="cmp-label">
            Подготовка резерва сборки:
          </label>
          <select
            id="cmp-reserve-select"
            className="cmp-select"
            value={reserveSetupMinutes}
            disabled={pending || disabled || isShiftEnded}
            onChange={(e) =>
              setReserveSetupMinutes(Number(e.target.value) as ComparisonOptions['reserveSetupMinutes'])
            }
          >
            <option value={0}>0 минут (готов к пуску)</option>
            <option value={5}>5 минут (переналадка)</option>
            <option value={10}>10 минут</option>
            <option value={15}>15 минут</option>
          </select>
        </div>

        <button
          type="button"
          className="cmp-btn cmp-btn--primary"
          disabled={isButtonDisabled}
          onClick={handleCompareClick}
        >
          {pending ? (
            <>
              <RefreshCw className="cmp-spin" size={15} aria-hidden="true" />
              <span>Расчёт...</span>
            </>
          ) : (
            'Сравнить решения'
          )}
        </button>
      </div>

      {pending && (
        <div className="cmp-status cmp-status--pending" aria-live="polite">
          <RefreshCw className="cmp-spin" size={16} aria-hidden="true" />
          <span>Выполняется расчёт вариантов на основе текущего состояния линии...</span>
        </div>
      )}

      {error && (
        <div className="cmp-status cmp-status--error" role="alert">
          <div className="cmp-status__content">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>Ошибка расчёта: {error}</span>
          </div>
          <button
            type="button"
            className="cmp-btn cmp-btn--retry"
            onClick={handleCompareClick}
            disabled={isButtonDisabled}
          >
            Повторить попытку
          </button>
        </div>
      )}

      {isShiftEnded && (
        <div className="cmp-status cmp-status--info" role="status">
          <Info size={16} aria-hidden="true" />
          <span>
            Смена завершена ({formatClock(snapshot.shiftSeconds, false)}). Сбросьте смену, чтобы сравнить новые решения.
          </span>
        </div>
      )}

      {optionsChanged && (
        <div className="cmp-status cmp-status--warning" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            Параметры изменены (выбрано: ТО {maintenanceMinutes} мин, резерв {reserveSetupMinutes} мин). Ниже показан результат предыдущего расчёта ({result.options.maintenanceMinutes} мин / {result.options.reserveSetupMinutes} мин). Нажмите «Сравнить решения» для перерасчёта.
          </span>
        </div>
      )}

      {!result && !pending && !error && (
        <div className="cmp-empty">
          <div className="cmp-empty__icon-wrap">
            <Sliders size={26} aria-hidden="true" />
          </div>
          <h3 className="cmp-empty__title">Сравнительный анализ не запущен</h3>
          <p className="cmp-empty__text">
            Выберите длительность обслуживания и подготовки резерва, затем нажмите «Сравнить решения». Модель построит три варианта до {formatClock(snapshot.shiftSeconds)} модельного времени.
          </p>
        </div>
      )}

      {result && (
        <div className="cmp-results">
          <div className="cmp-meta">
            <div className="cmp-meta__item">
              <Clock size={14} aria-hidden="true" />
              <span>Расчёт от: <strong>{formatClock(result.fromSeconds)}</strong></span>
            </div>
            <div className="cmp-meta__item">
              <span>Сценарий: <strong>{scenarioTitle}</strong></span>
            </div>
            <div className="cmp-meta__item">
              <span>Горизонт: до <strong>{formatClock(result.toSeconds, false)}</strong></span>
            </div>
            <div className="cmp-meta__item">
              <span>План смены: <strong>{formatInt(result.shiftPlan)} шт.</strong></span>
            </div>
          </div>

          <div className="cmp-cards">
            {sortedAlternatives.map((alt) => {
              const downtimeMins = Math.round(alt.downtimeSeconds / 60);
              const deltaDowntimeMins = Math.round(alt.deltaDowntimeSeconds / 60);
              const isBase = alt.id === 'baseline';

              let goodUnitsDeltaClass = 'cmp-delta--neutral';
              if (!isBase) {
                if (alt.deltaGoodUnits > 0) goodUnitsDeltaClass = 'cmp-delta--pos';
                else if (alt.deltaGoodUnits < 0) goodUnitsDeltaClass = 'cmp-delta--neg';
              }

              let downtimeDeltaClass = 'cmp-delta--neutral';
              if (!isBase) {
                if (alt.deltaDowntimeSeconds < 0) downtimeDeltaClass = 'cmp-delta--pos';
                else if (alt.deltaDowntimeSeconds > 0) downtimeDeltaClass = 'cmp-delta--neg';
              }

              let planGapClass = 'cmp-delta--neutral';
              if (alt.planGap > 0) planGapClass = 'cmp-delta--pos';
              else if (alt.planGap < 0) planGapClass = 'cmp-delta--neg';

              return (
                <div key={alt.id} className={`cmp-card cmp-card--${alt.id}`}>
                  <div className="cmp-card__head">
                    <div>
                      <span className="cmp-card__badge">{DECISION_BADGES[alt.id]}</span>
                      <h3 className="cmp-card__title">{DECISION_HEADERS[alt.id]}</h3>
                    </div>
                  </div>

                  <p className="cmp-card__desc">{alt.description}</p>
                  {alt.products && <div className='cmp-products'>
                    {alt.products.map(product => <p key={product.id}><span>{PRODUCT_MODELS.find(model => model.id === product.id)?.name}</span><strong>{product.goodUnits} / {product.plannedUnits}</strong></p>)}
                    <small>Годные к заказу модели за выбранную смену</small>
                  </div>}
                  {snapshot.config.productionPlan && <p className='cmp-month-projection'>
                    Повторение такой смены весь месяц: <strong>{formatInt(alt.goodUnits * summarizePlan(snapshot.config.productionPlan).shifts)} авто</strong>.
                    {' '}Грубая экстраполяция, не прогноз; квоты смен и перенос НЗП могут отличаться.
                  </p>}

                  <div className="cmp-card__metrics">
                    <div className="cmp-metric">
                      <span className="cmp-metric__label">Годная продукция:</span>
                      <div className="cmp-metric__values">
                        <strong className="cmp-metric__main">{formatInt(alt.goodUnits)} шт.</strong>
                        <span className={`cmp-delta ${goodUnitsDeltaClass}`}>
                          {isBase ? '— (база)' : `${formatSigned(alt.deltaGoodUnits)} шт.`}
                        </span>
                      </div>
                    </div>

                    <div className="cmp-metric">
                      <span className="cmp-metric__label">Отклонение от плана ({result.shiftPlan} шт.):</span>
                      <div className="cmp-metric__values">
                        <span className={`cmp-metric__main ${planGapClass}`}>
                          {formatSigned(alt.planGap)} шт.
                        </span>
                      </div>
                    </div>

                    <div className="cmp-metric">
                      <span className="cmp-metric__label">Простой оборудования:</span>
                      <div className="cmp-metric__values">
                        <strong className="cmp-metric__main">{formatInt(downtimeMins)} мин</strong>
                        <span className={`cmp-delta ${downtimeDeltaClass}`}>
                          {isBase ? '— (база)' : `${formatSigned(deltaDowntimeMins)} мин`}
                        </span>
                      </div>
                    </div>

                    <div className="cmp-metric">
                      <span className="cmp-metric__label">Остаток в линии (WIP):</span>
                      <div className="cmp-metric__values">
                        <strong className="cmp-metric__main">{formatInt(alt.wip)} шт.</strong>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <ComparisonChart result={result} />

          <p className="cmp-disclosure__note">Сценарный расчёт по заданному расписанию событий. До пунктирной линии — общая история, после — варианты. Разницы в карточках указаны относительно продолжения смены. Расчёт не изменяет текущую симуляцию.</p>

          <details className="cmp-disclosure">
            <summary className="cmp-disclosure__summary">
              <span>Допущения модели и синтетические условия ({result.assumptions.length})</span>
              <ChevronDown size={15} className="cmp-disclosure__chevron" aria-hidden="true" />
            </summary>
            <div className="cmp-disclosure__body">
              <p className="cmp-disclosure__note">
                Результат зависит от следующих условий учебной модели:
              </p>
              <ul className="cmp-disclosure__list">
                {result.assumptions.map((assumption, idx) => (
                  <li key={idx} className="cmp-disclosure__item">
                    {assumption}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
