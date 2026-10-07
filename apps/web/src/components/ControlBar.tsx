import { t } from '../i18n';
import { LoaderCircle, Pause, Play, RotateCcw, X } from 'lucide-react';
import { SCENARIOS } from '../types';
import type { ControlCommand, ScenarioId, SessionSnapshot, Speed } from '../types';
import { formatClock } from '../format';
import { ScenarioInfo } from './ScenarioInfo';

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
  return <section className='card session-toolbar' aria-label={t("Управление сменой")} aria-busy={pending}>
    <div className='session-toolbar__row'>
      <div className='session-time'><span>{t(offline ? 'Нет связи' : finished ? 'Смена завершена' : snapshot.running ? 'Смена идёт' : 'Пауза')}</span><strong>{t(formatClock(snapshot.elapsedSeconds))}</strong></div>
      <button type='button' className='btn btn--primary session-play' disabled={disabled || finished} onClick={() => onCommand({action:snapshot.running ? 'pause' : 'play'})} aria-label={t(snapshot.running ? 'Приостановить смену' : 'Запустить смену')}>
        {snapshot.running ? <Pause size={16} /> : <Play size={16} />}<span>{t(snapshot.running ? 'Пауза' : 'Запустить')}</span>
      </button>
      <div className='segmented session-speed' role='group' aria-label={t("Скорость симуляции")}>{([1,10,60] as Speed[]).map(speed => <button type='button' key={speed} className='segmented__btn' aria-pressed={speed === snapshot.speed} disabled={disabled} onClick={() => onCommand({action:'setSpeed',speed})}>×{t(speed)}</button>)}</div>
      <label className='session-scenario'><span>{t("Сценарий")}</span><select id='scenario-select' aria-label={t("Сценарий — начинает новую смену")} value={snapshot.scenario} disabled={disabled} onChange={event => onCommand({action:'setScenario',scenario:event.target.value as ScenarioId})}>{scenarios.map(scenario => <option key={scenario.id} value={scenario.id}>{t(scenario.name)}</option>)}</select></label>
      <button type='button' className='icon-btn' title={t("Сбросить смену")} aria-label={t("Сбросить смену")} disabled={disabled} onClick={() => onCommand({action:'reset'})}><RotateCcw size={17} /></button>
      <ScenarioInfo name={t(scenarios.find(item => item.id === snapshot.scenario)?.name ?? '')} description={scenarios.find(item => item.id === snapshot.scenario)?.description ?? ''} />
      {pending && <LoaderCircle size={16} className='spin' aria-label={t("Применяем команду")} />}
    </div>
    {error && <div className='alert alert--error' role='alert'><span>{t(error)}</span><button type='button' className='icon-btn' aria-label={t("Скрыть сообщение об ошибке")} onClick={onDismissError}><X size={16} /></button></div>}
  </section>;
}
