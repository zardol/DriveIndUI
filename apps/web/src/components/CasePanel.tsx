import { locale } from '../preferences';
import { t } from '../i18n';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Info } from 'lucide-react';
import { CASE_DOWNTIMES, CASE_LINES, CASE_PLAN, CASE_SOURCE, PRODUCT_MODELS, caseStationMetrics,
  createCaseConfig, estimateCaseOee, summarizePlan, validateProductionPlan,
  type ControlCommand, type ProductionPlan, type SessionSnapshot } from '@driveindui/shared';
import '../case-panel.css';

const number = (value: number, digits = 0) => Number.isFinite(value) ? value.toLocaleString(locale(), { maximumFractionDigits: digits }) : '—';
const stationName = { welding: 'Сварка', painting: 'Окраска', assembly: 'Сборка' };
export function CasePanel({ snapshot, disabled, onCommand, view: tab }: {
  snapshot: SessionSnapshot; disabled: boolean; onCommand: (command: ControlCommand) => void; view: 'plan' | 'facts' | 'risks';
}) {
  const [plan, setPlan] = useState<ProductionPlan>(() => structuredClone(snapshot.config.productionPlan ?? CASE_PLAN));
  const [date, setDate] = useState('all');
  const activeKey = JSON.stringify(snapshot.config.productionPlan ?? null);
  useEffect(() => { setPlan(structuredClone(snapshot.config.productionPlan ?? CASE_PLAN)); }, [activeKey]);
  const validation = validateProductionPlan(plan), summary = summarizePlan(plan);
  const active = snapshot.config.productionPlan && JSON.stringify(plan) === activeKey;
  const rows = CASE_LINES.filter(row => date === 'all' || row.date === date);
  const incidents = CASE_DOWNTIMES.filter(row => date === 'all' || row.date === date);
  const painting = caseStationMetrics('painting');

  return <section className={`case-panel section case-panel--${tab}`} aria-label={t(tab === 'plan' ? 'Заказы на октябрь' : tab === 'facts' ? 'Исходные показатели' : 'Допущения и эффект')}>
    {tab === 'plan' && <div className='plan-totals'>
      <div><span>{t("Цель октября")}</span><strong>{t(number(summary.target))} <small>{t("авто")}</small></strong></div>
      <div><span>{t("Назначено моделям")}</span><strong>{t(number(summary.allocated))} <small>{t("авто")}</small></strong></div>
      <div className={summary.unallocated ? 'is-warning' : ''}><span>{t("Не распределено")}</span><strong>{t(number(summary.unallocated))} <small>{t("авто")}</small></strong></div>
    </div>}
    {tab === 'plan' && <div className='case-panel__body'>
      <div className='case-plan-heading'><div><h2>{t("Заказы и календарь")}</h2></div>
        {!active && <span className='case-state'>{t("Предпросмотр · ещё не применён")}</span>}</div>
      <p className='case-source-note'><Info size={16} aria-hidden='true' /><span>{t("В присланных данных по моделям распределено 4 800 из 5 500 автомобилей. Для оставшихся 700 модель не указана.")}</span></p>
      <div className='case-plan-controls'>
        <label>{t("Рабочих дней в месяце")}<input type='number' min={1} max={31} value={plan.workingDays} onChange={event => {
          const days = Number(event.target.value); setPlan(current => ({ ...current, workingDays: days, shiftIndex: Math.min(current.shiftIndex, Math.max(0, days * 2 - 1)) }));
        }} /></label>
        <label>{t("Порядковая смена")}<input type='number' min={1} max={Math.max(1, plan.workingDays * 2)} value={plan.shiftIndex + 1} onChange={event => setPlan(current => ({ ...current, shiftIndex: Number(event.target.value) - 1 }))} /></label>
        <div><strong>{t(number(plan.workingDays * 2))} {t(" смен по 8 часов")}</strong><small>{t("22 рабочих дня — допущение; календарь в кейсе не задан.")}</small></div>
      </div>
      <div className='case-table-wrap'><table className='case-table'><caption className='sr-only'>{t("План годного выпуска по моделям")}</caption>
        <thead><tr><th>{t("Модель")}</th><th>{t("В кейсе")}</th><th>{t("Заказ / месяц")}</th><th>{t("На смену")}</th><th>{t("Годные / НЗП")}</th></tr></thead><tbody>
          {PRODUCT_MODELS.map(model => {
            const monthly = plan.models.find(item => item.id === model.id)!, quota = summary.models.find(item => item.id === model.id)!;
            const progress = active ? snapshot.products?.find(item => item.id === model.id) : undefined;
            return <tr key={model.id}><th><i className='case-model-dot' style={{ background: model.color }} />{t(model.name)}</th>
              <td>{t(number(CASE_PLAN.models.find(item => item.id === model.id)!.monthlyUnits))}</td>
              <td><input aria-label={t(`Месячный план ${model.name}`)} type='number' min={0} max={100000} value={monthly.monthlyUnits}
                onChange={event => setPlan(current => ({ ...current, models: current.models.map(item => item.id === model.id ? { ...item, monthlyUnits: Number(event.target.value) } : item) }))} /></td>
              <td>{t(number(quota.shiftUnits))}</td><td>{t(progress ? `${progress.goodUnits} / ${progress.wip}` : '—')}</td></tr>;
          })}
          <tr className='case-unassigned'><th>{t("Модель не назначена")}</th><td>700</td><td>{t(number(summary.unallocated))}</td><td>{t(number(summary.unallocatedShift))}</td><td>{t("В запуск не включается")}</td></tr>
        </tbody></table></div>
      <div className='case-plan-summary'>
        <div><span>{t("Требуется за выбранную смену")}</span><strong>{t(number(summary.shiftTarget))} <small>{t("годных авто")}</small></strong><small>{t("Среднее: ")}{t(number(summary.shiftAverage, 2))} {t(" / смену")}</small></div>
        <div><span>{t("Обеспечено заказами")}</span><strong>{t(number(summary.assignedShift))} <small>{t("авто / смену")}</small></strong><small>{t(number(summary.allocated))} {t(" назначено за месяц")}</small></div>
        <div><span>{t("Требуемый средний такт")}</span><strong>{t(number(summary.requiredTaktSeconds, 1))} <small>{t("с / годное авто")}</small></strong><small>{t("Без брака, простоев и заполнения линии")}</small></div>
      </div>
      <p className={summary.unallocated > 0 ? 'case-alert' : 'case-success'}>{t(summary.unallocated > 0
        ? `Распределите ещё ${number(summary.unallocated)} авто между моделями. Неназначенный объём не запускается в производство.`
        : 'Цель обеспечена заказами. Проверьте выполнимость в разделе «Решения».')}</p>
      {!!validation.errors.length && <p role='alert' className='case-alert'>{t(validation.errors.join(' '))}</p>}
      <div className='case-actions'><button className='btn btn--primary' type='button' disabled={disabled || !validation.value} onClick={() => {
        if (validation.value) onCommand({ action: 'setConfiguration', config: createCaseConfig(validation.value) });
      }}>{t("Применить и сбросить смену ")}<ArrowUpRight size={16} /></button>
        <button className='btn' type='button' disabled={disabled} onClick={() => setPlan(structuredClone(CASE_PLAN))}>{t("Вернуть значения кейса")}</button></div>
      <details className='case-details'><summary>{t("Как план влияет на выпуск")}</summary><p>{t("Применение начинает смену на паузе. Машина резервирует заказ своей модели; после выхода брака возможна замена. Квоты всех смен в сумме равны месячному плану. Перенос НЗП и недовыпуска между сменами пока не моделируется.")}</p></details>
    </div>}
    {tab === 'facts' && <div className='case-panel__body'>
      <div className='case-plan-heading'><div><h2>{t("Работа линий и качество")}</h2><p>{t(CASE_SOURCE)}.</p></div>
        <label className='case-date'>{t("Дата")}<select value={date} onChange={event => setDate(event.target.value)}><option value='all'>{t("Оба дня")}</option><option value='2026-10-01'>{t("1 октября")}</option><option value='2026-10-02'>{t("2 октября")}</option></select></label></div>
      <div className='case-table-wrap'><table className='case-table'><caption>{t("Работа линий и качество · значения из PDF, доля брака рассчитана по счётчикам")}</caption><thead><tr><th>{t("Дата / линия")}</th><th>{t("План")}</th><th>{t("Факт")}</th><th>{t("Работа, ч")}</th><th>{t("Загрузка")}</th><th>{t("Брак, ед.")}</th><th>{t("Доля брака / ≤ 2%")}</th></tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.date}-${row.station}`}><th><small>{t(row.date.slice(8))}.10.2026</small>{t(row.line)}</th><td>{t(row.plan)}</td><td>{t(row.actual)}</td><td>{t(number(row.operatingHours, 1))}</td><td>{t(row.loadPercent)}%</td><td>{t(row.rejects)}</td>
          <td className={row.rejects / row.actual > .02 ? 'case-breach' : ''}>{t(number(row.rejects / row.actual * 100, 2))}%<small>{t("в PDF: ")}{t(number(row.reportedRejectPercent, 1))}%</small></td></tr>)}</tbody></table></div>
      <details className='case-details'><summary>{t("Как читать исходные показатели")}</summary><p>{t("Агрегаты по датам, без номера смены. Выпуск участков не суммируется в выпуск завода. Промежуточные дефекты не складываются с окончательным браком: нет данных о переделке и пересечении изделий.")}</p></details>
      <h3>{t("Журнал остановок оборудования")}</h3>
      <div className='case-table-wrap'><table className='case-table'><caption>{t("Порог 60 минут в сутки — для критического оборудования; критичность в исходнике не указана")}</caption><thead><tr><th>{t("Дата")}</th><th>{t("Оборудование")}</th><th>{t("Участок / причина")}</th><th>{t("Простой")}</th><th>{t("До порога 60 мин")}</th></tr></thead>
        <tbody>{incidents.map(row => <tr key={row.equipment}><td>{t(row.date.slice(8))}.10</td><th>{t(row.equipment)}</th><td>{t(stationName[row.station])}<small>{t(row.reason)}</small></td><td>{t(row.minutes)} {t(" мин")}</td><td><meter min={0} max={60} value={row.minutes} aria-label={t(`Простой ${row.equipment}`)} /><span>{t(60 - row.minutes)} {t(" мин")}</span></td></tr>)}</tbody></table></div>
      <details className='case-details'><summary>{t("Границы учёта простоев")}</summary><p>{t("Суммы 65 и 85 минут относятся к разным станкам и не означают превышение одним станком. Начало событий не задано; временные траектории не восстанавливаются.")}</p></details>
      <details className='case-details'><summary>{t("OEE · цель ≥ 85% · показать оценку и допущения")}</summary>
        <p>{t("Фактический OEE вычислить нельзя без идеального цикла и планового времени строки. Ниже — иллюстрация при 8 часах на строку и идеальном цикле 240 секунд (120 авто / 8 ч). Это не измеренный OEE и не подтверждение выполнения цели.")}</p>
        <div className='case-table-wrap'><table className='case-table'><thead><tr><th>{t("Линия / дата")}</th><th>{t("A · доступность")}</th><th>{t("P · темп")}</th><th>{t("Q · годные")}</th><th>A × P × Q</th></tr></thead><tbody>{rows.map(row => {
          const oee = estimateCaseOee(row);
          return <tr key={`${row.date}-${row.station}`}><th>{t(row.line)}<small>{t(row.date)}</small></th><td>{t(number(oee.availability * 100, 2))}%</td><td>{t(number(oee.performance * 100, 2))}%{oee.exceedsIdeal && <small className='case-breach'>{t("Выше 100%: проверить цикл")}</small>}</td><td>{t(number(oee.quality * 100, 2))}%</td><td>{t(number(oee.oee * 100, 2))}% <small>{t("оценка")}</small></td></tr>;
        })}</tbody></table></div></details>
    </div>}
    {tab === 'risks' && <div className='case-panel__body'>
      <div className='case-plan-heading'><div><h3>{t("Что требует решения руководителя")}</h3><p>{t("Объяснимые сигналы. Двух дней недостаточно для вероятностного прогноза отказов.")}</p></div><span className='case-state'>{t("Правила и расчёты")}</span></div>
      <div className='case-risk-grid'>
        <article><span className='case-risk-index'>{t("01 / ПЛАН")}</span><h4>{t("700 автомобилей без модели")}</h4><p>{t("Исходные заказы покрывают ")}{t(number(4800 / 5500 * 100, 1))}{t("% месячного минимума. Даже идеальное исполнение оставляет разрыв.")}</p><strong>{t("Согласовать дополнительные заказы")}</strong></article>
        <article><span className='case-risk-index'>{t("02 / КАЧЕСТВО")}</span><h4>{t("Окраска: ")}{t(number(painting.rejectPercent, 2))}{t("% брака")}</h4><p>{t("10 дефектов на 231 изделие; 2 октября — 6 из 116 (")}{t(number(6 / 116 * 100, 2))}{t("%). Обе записи выше предела 2%.")}</p><strong>{t("Проверить фильтр и режим окраски; связь с дефектами пока не доказана")}</strong></article>
        <article><span className='case-risk-index'>{t("03 / НАДЁЖНОСТЬ")}</span><h4>{t("Конвейер-03: 55 минут")}</h4><p>{t("Если конвейер критический, запас до суточного лимита — только 5 минут. Следующая остановка может привести к превышению.")}</p><strong>{t("Проверить цепь, натяжение и запасные части")}</strong></article>
      </div>
      <div className='case-effect'><div><span>{t("Сценарный потенциал качества")}</span><strong>≈ {t(number(10 - 231 * .02, 1))} <small>{t("дефекта меньше / 231 изделие")}</small></strong></div><p>{t("При снижении брака окраски до 2% и том же объёме обработки. Это ожидаемое снижение дефектов, а не гарантированный дополнительный выпуск. Денежный эффект не рассчитан: нет себестоимости, цены ремонта и данных о переделке.")}</p></div>
      <details className='case-details'><summary>{t("Связь данных с моделью и допущения")}</summary><ul>
        <li>{t("Маршрут из PDF: склад комплектующих → сварка → окраска → сборка → ОТК → склад готовой продукции. Размеров нет; 3D-планировка условная.")}</li>
        <li>{t("Эффективный цикл = сумма часов работы × 3600 / сумма изделий: сварка 236 с, окраска 237 с, сборка 239 с после округления. Это оценка по агрегатам, не паспортный цикл.")}</li>
        <li>{t("ОТК 180 с, буферы 8 мест, скорость ленты 0,5 условной единицы/с — допущения.")}</li>
        <li>{t("Циклы одинаковы для трёх моделей: данных о различиях и переналадке нет. Смена начинается с пустой линии и первого кузова; начальный НЗП и перенос между сменами не предоставлены. Поэтому результат модели не приравнивается к факту из таблицы.")}</li>
        <li>{t("Финальный брак модели 1,25% временно принят по сборке (3 / 240). Качество после ОТК неизвестно; брак сварки и окраски показан отдельно, не суммируется.")}</li>
        <li>{t("Остановки: 40 мин для Камеры-02, 55 мин для Конвейера-03. Начало на 20-й минуте условное. Это сценарии, не воспроизведение дня.")}</li>
        <li>{t("Время и простои не согласуются напрямую: окраска 1 октября — 7,5 ч + 40 мин = 8 ч 10 мин. Нужны границы смен и состав оборудования линии.")}</li>
      </ul></details>
    </div>}
  </section>;
}
