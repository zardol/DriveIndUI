import { Info, LoaderCircle, Pause, Play, RotateCcw, X } from 'lucide-react';
import { SCENARIOS } from '../types';
import type { ControlCommand, ScenarioId, SessionSnapshot, Speed } from '../types';
import { formatClock } from '../format';

interface ControlBarProps {
  snapshot: SessionSnapshot; pending: boolean; offline: boolean; error: string | null;
  onCommand: (command: ControlCommand) => void; onDismissError: () => void;
}
export function ControlBar({ snapshot, pending, offline, error, onCommand, onDismissError }: ControlBarProps) {
  const disabled = pending || offline;
  const finished = snapshot.elapsedSeconds >= snapshot.shiftSeconds;
  const scenarios = snapshot.config.productionPlan ? [
    { id: 'normal', name: 'Без остановок', description: 'Расчёт мощности по параметрам кейса, без дополнительных остановок.' },
    { id: 'equipment', name: 'Окраска · остановка 40 мин', description: 'Камера-02: замена фильтра. Начало на 20-й минуте условное, длительность взята из кейса.' },
    { id: 'bottleneck', name: 'Сборка · остановка 55 мин', description: 'Конвейер-03: обрыв цепи. Начало на 20-й минуте условное, длительность взята из кейса.' },
  ] : SCENARIOS;
  return <section className='card session-toolbar' aria-label='Управление сменой' aria-busy={pending}>
    <div className='session-toolbar__row'>
      <div className='session-time'><span>{offline ? 'Нет связи' : finished ? 'Смена завершена' : snapshot.running ? 'Смена идёт' : 'Пауза'}</span><strong>{formatClock(snapshot.elapsedSeconds)}</strong></div>
      <button type='button' className='btn btn--primary session-play' disabled={disabled || finished} onClick={() => onCommand({action:snapshot.running ? 'pause' : 'play'})} aria-label={snapshot.running ? 'Приостановить смену' : 'Запустить смену'}>
        {snapshot.running ? <Pause size={16} /> : <Play size={16} />}<span>{snapshot.running ? 'Пауза' : 'Запустить'}</span>
      </button>
      <div className='segmented session-speed' role='group' aria-label='Скорость симуляции'>{([1,10,60] as Speed[]).map(speed => <button type='button' key={speed} className='segmented__btn' aria-pressed={speed === snapshot.speed} disabled={disabled} onClick={() => onCommand({action:'setSpeed',speed})}>×{speed}</button>)}</div>
      <label className='session-scenario'><span>Сценарий</span><select id='scenario-select' aria-label='Сценарий — начинает новую смену' value={snapshot.scenario} disabled={disabled} onChange={event => onCommand({action:'setScenario',scenario:event.target.value as ScenarioId})}>{scenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label>
      <button type='button' className='icon-btn' title='Сбросить смену' aria-label='Сбросить смену' disabled={disabled} onClick={() => onCommand({action:'reset'})}><RotateCcw size={17} /></button>
      <details className='session-info'><summary aria-label='Условия сценария' title='Условия сценария'><Info size={18} /></summary><div><strong>{scenarios.find(item=>item.id===snapshot.scenario)?.name}</strong><p>{scenarios.find(item=>item.id===snapshot.scenario)?.description}</p><p>Смена сценария и сброс обнуляют выпуск и время. План и скорость сохраняются.</p></div></details>
      {pending && <LoaderCircle size={16} className='spin' aria-label='Применяем команду' />}
    </div>
    {error && <div className='alert alert--error' role='alert'><span>{error}</span><button type='button' className='icon-btn' aria-label='Скрыть сообщение об ошибке' onClick={onDismissError}><X size={16} /></button></div>}
  </section>;
}
