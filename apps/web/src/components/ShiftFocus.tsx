import { Activity, ArrowUpRight, CircleAlert, Layers3 } from 'lucide-react';
import type { PlantSnapshot, StationId } from '../types';

export function ShiftFocus({ snapshot, onSelect, stale }: { snapshot: PlantSnapshot; onSelect: (id: StationId) => void; stale: boolean }) {
  const incident = snapshot.incidents.filter((item) => item.resolvedAtSeconds === null)
    .sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical') || b.startedAtSeconds - a.startedAtSeconds)[0];
  const queue = [...snapshot.stations].sort((a, b) => b.inputQueue - a.inputQueue)[0];
  const station = incident ? snapshot.stations.find((item) => item.id === incident.stationId) : null;
  return (
    <section className={`shift-focus${incident ? ' shift-focus--alert' : ''}`} aria-label='Фокус смены'>
      <div className='shift-focus__lead'>
        {incident ? <CircleAlert size={20} aria-hidden='true' /> : <Activity size={20} aria-hidden='true' />}
        <div>
          <span className='shift-focus__caption'>{stale ? 'Последнее состояние' : 'Фокус смены'}</span>
          <strong>{incident ? incident.title : snapshot.elapsedSeconds === snapshot.shiftSeconds ? 'Смена завершена' : 'Активных инцидентов нет'}</strong>
        </div>
        {incident && <button className='btn btn--small' onClick={() => onSelect(incident.stationId)}>{station?.name ?? 'Показатели'}<ArrowUpRight size={14} aria-hidden='true' /></button>}
      </div>
      {queue && <button className='queue-focus' onClick={() => onSelect(queue.id)}>
        <Layers3 size={18} aria-hidden='true' />
        <span>{queue.inputQueue > 0 ? `Наибольшая очередь: ${queue.name}` : 'Входные очереди свободны'}</span>
        <strong>{queue.inputQueue}/{queue.bufferCapacity}</strong>
      </button>}
    </section>
  );
}
