import { Info, LoaderCircle, Pause, Play, RotateCcw, X } from 'lucide-react';
import { SCENARIOS } from '../types';
import type { ControlCommand, ScenarioId, SessionSnapshot, Speed } from '../types';

const SPEEDS: readonly Speed[] = [1, 10, 60];

interface ControlBarProps {
  snapshot: SessionSnapshot;
  pending: boolean;
  offline: boolean;
  error: string | null;
  onCommand: (command: ControlCommand) => void;
  onDismissError: () => void;
}

export function ControlBar({ snapshot, pending, offline, error, onCommand, onDismissError }: ControlBarProps) {
  const disabled = pending || offline;
  const scenarios = snapshot.config.productionPlan ? [
    { id: 'normal', name: 'Без остановок · базовый расчёт', description: 'Оценка мощности и выполнения заказов по параметрам кейса, без дополнительных остановок.' },
    { id: 'equipment', name: 'Камера-02 · фильтр · 40 мин', description: 'Длительность из кейса. Остановка окраски начинается на 20-й минуте условного сценария.' },
    { id: 'bottleneck', name: 'Конвейер-03 · цепь · 55 мин', description: 'Длительность из кейса. Остановка сборки начинается на 20-й минуте условного сценария.' },
  ] : SCENARIOS;
  const scenario = scenarios.find((item) => item.id === snapshot.scenario);

  return (
    <section className='card controls' aria-label='Управление симуляцией' aria-busy={pending}>
      <div className='controls__row'>
        <div className='field'>
          <label className='field__label' htmlFor='scenario-select'>
            Сценарий
          </label>
          <select
            id='scenario-select'
            className='select'
            value={snapshot.scenario}
            disabled={disabled}
            onChange={(event) => onCommand({ action: 'setScenario', scenario: event.target.value as ScenarioId })}
          >
            {scenarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className='field'>
          <span className='field__label' id='run-label'>
            Симуляция
          </span>
          <button
            type='button'
            className='btn btn--primary'
            aria-labelledby='run-label run-action'
            disabled={disabled}
            onClick={() => onCommand({ action: snapshot.running ? 'pause' : 'play' })}
          >
            {snapshot.running ? <Pause size={16} aria-hidden='true' /> : <Play size={16} aria-hidden='true' />}
            <span id='run-action'>{snapshot.running ? 'Пауза' : 'Запустить'}</span>
          </button>
        </div>

        <div className='field'>
          <span className='field__label' id='speed-label'>
            Скорость симуляции
          </span>
          <div className='segmented' role='group' aria-labelledby='speed-label'>
            {SPEEDS.map((value) => (
              <button
                key={value}
                type='button'
                className='segmented__btn'
                aria-pressed={snapshot.speed === value}
                disabled={disabled}
                onClick={() => {
                  if (snapshot.speed !== value) onCommand({ action: 'setSpeed', speed: value });
                }}
              >
                ×{value}
              </button>
            ))}
          </div>
        </div>

        <div className='field'>
          <span className='field__label' id='reset-label'>
            Смена
          </span>
          <button
            type='button'
            className='btn'
            aria-labelledby='reset-label reset-action'
            disabled={disabled}
            onClick={() => onCommand({ action: 'reset' })}
          >
            <RotateCcw size={16} aria-hidden='true' />
            <span id='reset-action'>Сбросить</span>
          </button>
        </div>

        <div className='controls__status' role='status' aria-live='polite'>
          {pending && (
            <span className='controls__pending'>
              <LoaderCircle size={16} className='spin' aria-hidden='true' />
              Применяем команду…
            </span>
          )}
          {!pending && offline && <span className='controls__offline'>Управление недоступно: нет связи с сервером.</span>}
        </div>
      </div>

      {scenario && (
        <p className='controls__desc'>
          <Info size={15} aria-hidden='true' />
          <span>
            <strong>{scenario.name}.</strong> {scenario.description} Смена сценария и сброс обнуляют время и историю,
            параметры производства, скорость и состояние запуска сохраняются.
          </span>
        </p>
      )}

      {error && (
        <div className='alert alert--error' role='alert'>
          <div className='alert__body'>{error}</div>
          <button type='button' className='icon-btn' onClick={onDismissError} aria-label='Скрыть сообщение об ошибке'>
            <X size={16} aria-hidden='true' />
          </button>
        </div>
      )}
    </section>
  );
}
