import { useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { CASE_DOWNTIMES, CASE_LINES, CASE_PLAN, CASE_SOURCE, PRODUCT_MODELS, caseStationMetrics,
  createCaseConfig, estimateCaseOee, summarizePlan, validateProductionPlan,
  type ControlCommand, type ProductionPlan, type SessionSnapshot } from '@driveindui/shared';
import '../case-panel.css';

const number = (value: number, digits = 0) => Number.isFinite(value) ? value.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—';
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

  return <section className={`case-panel section case-panel--${tab}`} aria-label={tab === 'plan' ? 'Заказы на октябрь' : tab === 'facts' ? 'Исходные показатели' : 'Допущения и эффект'}>
    {tab === 'plan' && <div className='plan-totals'>
      <div><span>Цель октября</span><strong>{number(summary.target)} <small>авто</small></strong></div>
      <div><span>Назначено моделям</span><strong>{number(summary.allocated)} <small>авто</small></strong></div>
      <div className={summary.unallocated ? 'is-warning' : ''}><span>Не распределено</span><strong>{number(summary.unallocated)} <small>авто</small></strong></div>
    </div>}
    {tab === 'plan' && <div className='case-panel__body'>
      <div className='case-plan-heading'><div><h2>Заказы и календарь</h2></div>
        <span className={`case-state ${active ? 'is-active' : ''}`}>{active ? <><CheckCircle2 size={15} /> План действует в симуляции</> : 'Предпросмотр · ещё не применён'}</span></div>
      <div className='case-plan-controls'>
        <label>Рабочих дней в месяце<input type='number' min={1} max={31} value={plan.workingDays} onChange={event => {
          const days = Number(event.target.value); setPlan(current => ({ ...current, workingDays: days, shiftIndex: Math.min(current.shiftIndex, Math.max(0, days * 2 - 1)) }));
        }} /></label>
        <label>Порядковая смена<input type='number' min={1} max={Math.max(1, plan.workingDays * 2)} value={plan.shiftIndex + 1} onChange={event => setPlan(current => ({ ...current, shiftIndex: Number(event.target.value) - 1 }))} /></label>
        <div><strong>{number(plan.workingDays * 2)} смен по 8 часов</strong><small>22 рабочих дня — допущение; календарь в кейсе не задан.</small></div>
      </div>
      <div className='case-table-wrap'><table className='case-table'><caption className='sr-only'>План годного выпуска по моделям</caption>
        <thead><tr><th>Модель</th><th>В кейсе</th><th>Заказ / месяц</th><th>На смену</th><th>Годные / НЗП</th></tr></thead><tbody>
          {PRODUCT_MODELS.map(model => {
            const monthly = plan.models.find(item => item.id === model.id)!, quota = summary.models.find(item => item.id === model.id)!;
            const progress = active ? snapshot.products?.find(item => item.id === model.id) : undefined;
            return <tr key={model.id}><th><i className='case-model-dot' style={{ background: model.color }} />{model.name}</th>
              <td>{number(CASE_PLAN.models.find(item => item.id === model.id)!.monthlyUnits)}</td>
              <td><input aria-label={`Месячный план ${model.name}`} type='number' min={0} max={100000} value={monthly.monthlyUnits}
                onChange={event => setPlan(current => ({ ...current, models: current.models.map(item => item.id === model.id ? { ...item, monthlyUnits: Number(event.target.value) } : item) }))} /></td>
              <td>{number(quota.shiftUnits)}</td><td>{progress ? `${progress.goodUnits} / ${progress.wip}` : '—'}</td></tr>;
          })}
          <tr className='case-unassigned'><th>Модель не назначена</th><td>700</td><td>{number(summary.unallocated)}</td><td>{number(summary.unallocatedShift)}</td><td>В запуск не включается</td></tr>
        </tbody></table></div>
      <div className='case-plan-summary'>
        <div><span>Требуется за выбранную смену</span><strong>{number(summary.shiftTarget)} <small>годных авто</small></strong><small>Среднее: {number(summary.shiftAverage, 2)} / смену</small></div>
        <div><span>Обеспечено заказами</span><strong>{number(summary.assignedShift)} <small>авто / смену</small></strong><small>{number(summary.allocated)} назначено за месяц</small></div>
        <div><span>Требуемый средний такт</span><strong>{number(summary.requiredTaktSeconds, 1)} <small>с / годное авто</small></strong><small>Без брака, простоев и заполнения линии</small></div>
      </div>
      <p className={summary.unallocated > 0 ? 'case-alert' : 'case-success'}>{summary.unallocated > 0
        ? `Распределите ещё ${number(summary.unallocated)} авто между моделями. Неназначенный объём не запускается в производство.`
        : 'Цель обеспечена заказами. Проверьте выполнимость в разделе «Решения».'}</p>
      {!!validation.errors.length && <p role='alert' className='case-alert'>{validation.errors.join(' ')}</p>}
      <div className='case-actions'><button className='btn btn--primary' type='button' disabled={disabled || !validation.value} onClick={() => {
        if (validation.value) onCommand({ action: 'setConfiguration', config: createCaseConfig(validation.value) });
      }}>Применить и сбросить смену <ArrowUpRight size={16} /></button>
        <button className='btn' type='button' disabled={disabled} onClick={() => setPlan(structuredClone(CASE_PLAN))}>Вернуть значения кейса</button></div>
      <details className='case-details'><summary>Как план влияет на выпуск</summary><p>Применение начинает смену на паузе. Машина резервирует заказ своей модели; после выхода брака возможна замена. Квоты всех смен в сумме равны месячному плану. Перенос НЗП и недовыпуска между сменами пока не моделируется.</p></details>
    </div>}
    {tab === 'facts' && <div className='case-panel__body'>
      <div className='case-plan-heading'><div><h2>Работа линий и качество</h2><p>{CASE_SOURCE}.</p></div>
        <label className='case-date'>Дата<select value={date} onChange={event => setDate(event.target.value)}><option value='all'>Оба дня</option><option value='2026-10-01'>1 октября</option><option value='2026-10-02'>2 октября</option></select></label></div>
      <div className='case-table-wrap'><table className='case-table'><caption>Работа линий и качество · значения из PDF, доля брака рассчитана по счётчикам</caption><thead><tr><th>Дата / линия</th><th>План</th><th>Факт</th><th>Работа, ч</th><th>Загрузка</th><th>Брак, ед.</th><th>Доля брака / ≤ 2%</th></tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.date}-${row.station}`}><th><small>{row.date.slice(8)}.10.2026</small>{row.line}</th><td>{row.plan}</td><td>{row.actual}</td><td>{number(row.operatingHours, 1)}</td><td>{row.loadPercent}%</td><td>{row.rejects}</td>
          <td className={row.rejects / row.actual > .02 ? 'case-breach' : ''}>{number(row.rejects / row.actual * 100, 2)}%<small>в PDF: {number(row.reportedRejectPercent, 1)}%</small></td></tr>)}</tbody></table></div>
      <details className='case-details'><summary>Как читать исходные показатели</summary><p>Агрегаты по датам, без номера смены. Выпуск участков не суммируется в выпуск завода. Промежуточные дефекты не складываются с окончательным браком: нет данных о переделке и пересечении изделий.</p></details>
      <h3>Журнал остановок оборудования</h3>
      <div className='case-table-wrap'><table className='case-table'><caption>Порог 60 минут в сутки — для критического оборудования; критичность в исходнике не указана</caption><thead><tr><th>Дата</th><th>Оборудование</th><th>Участок / причина</th><th>Простой</th><th>До порога 60 мин</th></tr></thead>
        <tbody>{incidents.map(row => <tr key={row.equipment}><td>{row.date.slice(8)}.10</td><th>{row.equipment}</th><td>{stationName[row.station]}<small>{row.reason}</small></td><td>{row.minutes} мин</td><td><meter min={0} max={60} value={row.minutes} aria-label={`Простой ${row.equipment}`} /><span>{60 - row.minutes} мин</span></td></tr>)}</tbody></table></div>
      <details className='case-details'><summary>Границы учёта простоев</summary><p>Суммы 65 и 85 минут относятся к разным станкам и не означают превышение одним станком. Начало событий не задано; временные траектории не восстанавливаются.</p></details>
      <details className='case-details'><summary>OEE · цель ≥ 85% · показать оценку и допущения</summary>
        <p>Фактический OEE вычислить нельзя без идеального цикла и планового времени строки. Ниже — иллюстрация при 8 часах на строку и идеальном цикле 240 секунд (120 авто / 8 ч). Это не измеренный OEE и не подтверждение выполнения цели.</p>
        <div className='case-table-wrap'><table className='case-table'><thead><tr><th>Линия / дата</th><th>A · доступность</th><th>P · темп</th><th>Q · годные</th><th>A × P × Q</th></tr></thead><tbody>{rows.map(row => {
          const oee = estimateCaseOee(row);
          return <tr key={`${row.date}-${row.station}`}><th>{row.line}<small>{row.date}</small></th><td>{number(oee.availability * 100, 2)}%</td><td>{number(oee.performance * 100, 2)}%{oee.exceedsIdeal && <small className='case-breach'>Выше 100%: проверить цикл</small>}</td><td>{number(oee.quality * 100, 2)}%</td><td>{number(oee.oee * 100, 2)}% <small>оценка</small></td></tr>;
        })}</tbody></table></div></details>
    </div>}
    {tab === 'risks' && <div className='case-panel__body'>
      <div className='case-plan-heading'><div><h3>Что требует решения руководителя</h3><p>Объяснимые сигналы. Двух дней недостаточно для вероятностного прогноза отказов.</p></div><span className='case-state'>Правила и расчёты</span></div>
      <div className='case-risk-grid'>
        <article><span className='case-risk-index'>01 / ПЛАН</span><h4>700 автомобилей без модели</h4><p>Исходные заказы покрывают {number(4800 / 5500 * 100, 1)}% месячного минимума. Даже идеальное исполнение оставляет разрыв.</p><strong>Согласовать дополнительные заказы</strong></article>
        <article><span className='case-risk-index'>02 / КАЧЕСТВО</span><h4>Окраска: {number(painting.rejectPercent, 2)}% брака</h4><p>10 дефектов на 231 изделие; 2 октября — 6 из 116 ({number(6 / 116 * 100, 2)}%). Обе записи выше предела 2%.</p><strong>Проверить фильтр и режим окраски; связь с дефектами пока не доказана</strong></article>
        <article><span className='case-risk-index'>03 / НАДЁЖНОСТЬ</span><h4>Конвейер-03: 55 минут</h4><p>Если конвейер критический, запас до суточного лимита — только 5 минут. Следующая остановка может привести к превышению.</p><strong>Проверить цепь, натяжение и запасные части</strong></article>
      </div>
      <div className='case-effect'><div><span>Сценарный потенциал качества</span><strong>≈ {number(10 - 231 * .02, 1)} <small>дефекта меньше / 231 изделие</small></strong></div><p>При снижении брака окраски до 2% и том же объёме обработки. Это ожидаемое снижение дефектов, а не гарантированный дополнительный выпуск. Денежный эффект не рассчитан: нет себестоимости, цены ремонта и данных о переделке.</p></div>
      <details className='case-details'><summary>Связь данных с моделью и допущения</summary><ul>
        <li>Маршрут из PDF: склад комплектующих → сварка → окраска → сборка → ОТК → склад готовой продукции. Размеров нет; 3D-планировка условная.</li>
        <li>Эффективный цикл = сумма часов работы × 3600 / сумма изделий: сварка 236 с, окраска 237 с, сборка 239 с после округления. Это оценка по агрегатам, не паспортный цикл.</li>
        <li>ОТК 180 с, буферы 8 мест, скорость ленты 0,5 условной единицы/с — допущения.</li>
        <li>Циклы одинаковы для трёх моделей: данных о различиях и переналадке нет. Смена начинается с пустой линии и первого кузова; начальный НЗП и перенос между сменами не предоставлены. Поэтому результат модели не приравнивается к факту из таблицы.</li>
        <li>Финальный брак модели 1,25% временно принят по сборке (3 / 240). Качество после ОТК неизвестно; брак сварки и окраски показан отдельно, не суммируется.</li>
        <li>Остановки: 40 мин для Камеры-02, 55 мин для Конвейера-03. Начало на 20-й минуте условное. Это сценарии, не воспроизведение дня.</li>
        <li>Время и простои не согласуются напрямую: окраска 1 октября — 7,5 ч + 40 мин = 8 ч 10 мин. Нужны границы смен и состав оборудования линии.</li>
      </ul></details>
    </div>}
  </section>;
}
