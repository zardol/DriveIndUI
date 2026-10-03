import { TrendingFlat } from './TrendingFlat';
import { formatClock, formatInt, formatSigned } from '../format';
import type { PlantSnapshot } from '../types';

export function ForecastCard({ snapshot }: { snapshot: PlantSnapshot }) {
  if (snapshot.goodUnits + snapshot.rejectedUnits === 0) {
    return <section className='card forecast' aria-labelledby='forecast-title'>
      <h2 id='forecast-title' className='forecast__title'>Оценка выпуска к концу смены</h2>
      <p className='forecast__diff'>Собираем статистику выпуска</p>
      <p className='forecast__note'>Оценка появится после первого проверенного автомобиля.</p>
    </section>;
  }
  const forecast = Math.round(snapshot.forecastUnits);
  const diff = forecast - snapshot.shiftPlan;
  const percent = snapshot.shiftPlan > 0 ? (forecast / snapshot.shiftPlan) * 100 : null;
  const below = diff < 0;

  return (
    <section className={`card forecast${below ? ' forecast--warn' : ''}`} aria-labelledby='forecast-title'>
      <div className='forecast__head'>
        <TrendingFlat />
        <h2 id='forecast-title' className='forecast__title'>
          Оценка по текущему темпу
        </h2>
      </div>
      <p className='forecast__value'>
        ≈ {formatInt(forecast)}
        <span className='kpi__unit'> ед. к {formatClock(snapshot.shiftSeconds, false)}</span>
      </p>
      <p className='forecast__diff'>
        {below ? 'Ниже плана' : 'Не ниже плана'}: {formatSigned(diff)} ед. к плану {formatInt(snapshot.shiftPlan)}
        {percent !== null ? ` (${formatInt(percent)}% плана)` : ''}
      </p>
      <p className='forecast__note'>
        Экстраполяция среднего темпа с начала смены. Не учитывает будущие сбои и управленческие действия.
      </p>
    </section>
  );
}
