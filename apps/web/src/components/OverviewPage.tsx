import { lazy, Suspense } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { summarizePlan, type SessionSnapshot, type StationId } from '@driveindui/shared';
import { KpiGrid } from './KpiGrid';
import { ForecastCard } from './ForecastCard';
import { IncidentTimeline } from './IncidentTimeline';
import { STATUS_META } from '../status';
import { formatInt } from '../format';
import { pageHref } from '../navigation';

const ProductionChart = lazy(() => import('./ProductionChart').then(module => ({ default: module.ProductionChart })));
export function OverviewPage({ snapshot, stale, onStation }: { snapshot: SessionSnapshot; stale: boolean; onStation: (id: StationId) => void }) {
  const plan = snapshot.config.productionPlan ? summarizePlan(snapshot.config.productionPlan) : null;
  const incidents = snapshot.incidents.filter(item => item.resolvedAtSeconds === null);
  const blocked = snapshot.stations.find(station => station.status === 'blocked' || station.status === 'stopped');
  return <div className='overview-page'>
    <KpiGrid snapshot={snapshot} />
    <div className='overview-columns'>
      <section className='card overview-chart' aria-label='Выпуск за смену'><Suspense fallback={<p className='empty' role='status'>Загружаем график…</p>}><ProductionChart snapshot={snapshot} /></Suspense></section>
      <aside className='overview-aside'>
        <ForecastCard snapshot={snapshot} />
        <a className='overview-plan' href={pageHref('plan')}>
          <span>ПЛАН ОКТЯБРЯ <ArrowUpRight size={17} /></span>
          <strong>{plan ? formatInt(plan.unallocated || plan.allocated) : 'Настроить'} <small>{plan ? 'авто' : 'заказы'}</small></strong>
          <p>{!plan ? 'Подключить месячный план' : plan.unallocated ? 'ещё не распределены по моделям' : 'распределены по моделям'}</p>
          <b>{plan?.unallocated ? 'Распределить заказы' : 'Открыть план'} <ArrowRight size={15} /></b>
        </a>
      </aside>
    </div>
    <section className='card overview-stations' aria-label='Состояние участков'>
      <div className='overview-section-head'><h2>Участки</h2><span>{stale ? 'Последнее состояние' : `${snapshot.wip} авто в линии`}</span></div>
      <div className='station-overview-grid'>{snapshot.stations.map((station, index) => <button key={station.id} type='button' onClick={() => onStation(station.id)} aria-label={`Открыть участок: ${station.name}`}>
        <span className='station-overview-top'><small>0{index + 1}</small><span className={`station-state is-${station.status}`}>{STATUS_META[station.status].short}</span></span>
        <strong>{station.name}<ArrowUpRight size={16} /></strong>
        <div className='station-overview-metrics'><span>Загрузка <b>{Math.round(station.utilizationPercent)}%</b></span><span>Буфер <b>{station.inputQueue}/{station.bufferCapacity}</b></span></div>
        <div className='station-capacity' aria-hidden='true'><i style={{width:`${Math.min(100,station.inputQueue/station.bufferCapacity*100)}%`}} /></div>
      </button>)}</div>
    </section>
    <div className='overview-lower'>
      <section className='card overview-incidents' aria-label='Инциденты смены'><IncidentTimeline snapshot={snapshot} /></section>
      <section className='card overview-next'>
        <span className='workspace-eyebrow'>{incidents.length ? 'ЕСТЬ ОТКЛОНЕНИЕ' : 'ПРОВЕРИТЬ РЕШЕНИЕ'}</span>
        <h2>{blocked ? `${blocked.name}: поток ограничен` : 'Что изменит выпуск?'}</h2>
        <p>{blocked ? 'Сравните восстановление потока и резерв мощности.' : 'Рассчитайте эффект обслуживания и резерва мощности до конца смены.'}</p>
        <a href={pageHref('decisions')} className='btn btn--primary'>Сравнить варианты <ArrowUpRight size={16} /></a>
      </section>
    </div>
  </div>;
}
