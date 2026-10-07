import { t } from '../i18n';
import { TrendingFlat } from './TrendingFlat';
import { formatClock, formatInt, formatSigned } from '../format';
import type { PlantSnapshot } from '../types';

export function ForecastCard({ snapshot }: { snapshot: PlantSnapshot }) {
  if (snapshot.goodUnits + snapshot.rejectedUnits === 0) {
    return <section className='card forecast' aria-labelledby='forecast-title'>
      <h2 id='forecast-title' className='forecast__title'>{t("Оценка выпуска к концу смены")}</h2>
      <p className='forecast__diff'>{t("Собираем статистику выпуска")}</p>
      <p className='forecast__note'>{t("Оценка появится после первого проверенного автомобиля.")}</p>
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
          {t("Оценка по текущему темпу")}</h2>
      </div>
      <p className='forecast__value'>
        ≈ {t(formatInt(forecast))}
        <span className='kpi__unit'> {t(" ед. к ")}{t(formatClock(snapshot.shiftSeconds, false))}</span>
      </p>
      <p className='forecast__diff'>
        {t(below ? 'Ниже плана' : 'Не ниже плана')}: {t(formatSigned(diff))} {t(" ед. к плану ")}{t(formatInt(snapshot.shiftPlan))}
        {t(percent !== null ? ` (${formatInt(percent)}% плана)` : '')}
      </p>
      <p className='forecast__note'>
        {t("Экстраполяция среднего темпа с начала смены. Не учитывает будущие сбои и управленческие действия.")}</p>
    </section>
  );
}
