import { useMemo } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatClock, formatInt, formatSigned } from '../format';
import type { PlantSnapshot } from '../types';

const COLOR_FACT = '#2f7f6f';
const COLOR_PLAN = '#14181a';
const COLOR_FORECAST = '#3a9aa6';
const COLOR_AXIS = '#6b7372';

interface ChartRow {
  elapsedSeconds: number;
  goodUnits?: number;
  planUnits?: number;
  forecast?: number;
}

function buildRows(snapshot: PlantSnapshot): ChartRow[] {
  const rows: ChartRow[] = snapshot.history.map((point) => ({
    elapsedSeconds: point.elapsedSeconds,
    goodUnits: point.goodUnits,
    planUnits: point.planUnits,
  }));
  if (snapshot.elapsedSeconds < snapshot.shiftSeconds) {
    const last = rows[rows.length - 1];
    if (last) {
      last.forecast = last.goodUnits;
    } else {
      rows.push({ elapsedSeconds: snapshot.elapsedSeconds, goodUnits: snapshot.goodUnits, forecast: snapshot.goodUnits });
    }
    rows.push({
      elapsedSeconds: snapshot.shiftSeconds,
      planUnits: snapshot.shiftPlan,
      forecast: snapshot.forecastUnits,
    });
  }
  return rows;
}

interface TooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: number | string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entries = payload.filter((entry) => typeof entry.value === 'number');
  if (entries.length === 0) return null;
  return (
    <div className='chart-tip'>
      <p className='chart-tip__time'>Время симуляции {formatClock(Number(label), false)}</p>
      {entries.map((entry) => (
        <p key={entry.dataKey ?? entry.name} className='chart-tip__row'>
          <span className='chart-tip__dot' style={{ background: entry.color }} aria-hidden='true' />
          <span>{entry.name}</span>
          <strong>{formatInt(Number(entry.value))} ед.</strong>
        </p>
      ))}
    </div>
  );
}

export function ProductionChart({ snapshot }: { snapshot: PlantSnapshot }) {
  const rows = useMemo(() => buildRows(snapshot), [snapshot]);

  const ticks = useMemo(() => {
    return Array.from({ length: 5 }, (_, index) => Math.round(snapshot.shiftSeconds * index / 4));
  }, [snapshot.shiftSeconds]);

  const maxGood = rows.reduce((max, row) => Math.max(max, row.goodUnits ?? 0), 0);
  const yMax = Math.max(1, Math.ceil(Math.max(snapshot.shiftPlan, snapshot.forecastUnits, maxGood) * 1.08));

  const latest = snapshot.history.length > 0 ? snapshot.history[snapshot.history.length - 1] : undefined;
  const summary = latest
    ? `Сейчас произведено ${formatInt(snapshot.goodUnits)} ед., по плану к этому моменту ${formatInt(latest.planUnits)} ед.`
    : 'История выпуска пока пуста.';

  return (
    <>
      <div className='card__head'>
        <div>
          <h2 id='production-title' className='card__title'>
            Расчёт выпуска и план
          </h2>
          <p className='card__sub'>Годные автомобили по времени смены (время симуляции)</p>
        </div>
        {latest && (
          <span className='pill pill--neutral'>
            Отклонение от плана: {formatSigned(snapshot.goodUnits - latest.planUnits)} ед.
          </span>
        )}
      </div>

      <ul className='chart-legend' aria-label='Обозначения графика'>
        <li>
          <span className='swatch swatch--fact' aria-hidden='true' />
          Расчёт модели
        </li>
        <li>
          <span className='swatch swatch--plan' aria-hidden='true' />
          План
        </li>
        <li>
          <span className='swatch swatch--forecast' aria-hidden='true' />
          Оценка по текущему темпу
        </li>
      </ul>

      <p className='sr-only'>{summary}</p>

      <div className='chart-wrap' role='img' aria-label='График выпуска: расчёт модели, план и оценка по текущему темпу'>
        <ResponsiveContainer width='100%' height='100%'>
          <ComposedChart data={rows} margin={{ top: 12, right: 20, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id='factFill' x1='0' y1='0' x2='0' y2='1'>
                <stop offset='0%' stopColor={COLOR_FACT} stopOpacity={0.28} />
                <stop offset='100%' stopColor={COLOR_FACT} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke='#e8e4d9' strokeDasharray='3 4' vertical={false} />
            <XAxis
              dataKey='elapsedSeconds'
              type='number'
              domain={[0, Math.max(1, snapshot.shiftSeconds)]}
              ticks={ticks}
              tickFormatter={(value: number) => formatClock(value, false)}
              tick={{ fill: COLOR_AXIS, fontSize: 12 }}
              stroke='#cfc9bb'
              tickLine={false}
            />
            <YAxis
              domain={[0, yMax]}
              allowDecimals={false}
              width={44}
              tick={{ fill: COLOR_AXIS, fontSize: 12 }}
              stroke='#cfc9bb'
              tickLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#cfc9bb' }} />
            {snapshot.elapsedSeconds > 0 && snapshot.elapsedSeconds < snapshot.shiftSeconds && (
              <ReferenceLine
                x={snapshot.elapsedSeconds}
                stroke='#9aa19f'
                strokeDasharray='2 3'
                label={{ value: 'Сейчас', position: 'insideTopLeft', fill: COLOR_AXIS, fontSize: 11 }}
              />
            )}
            <Area
              type='monotone'
              dataKey='goodUnits'
              name='Расчёт модели'
              stroke={COLOR_FACT}
              strokeWidth={2.5}
              fill='url(#factFill)'
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type='linear'
              dataKey='planUnits'
              name='План'
              stroke={COLOR_PLAN}
              strokeWidth={1.75}
              strokeDasharray='6 4'
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type='linear'
              dataKey='forecast'
              name='Оценка по текущему темпу'
              stroke={COLOR_FORECAST}
              strokeWidth={2}
              strokeDasharray='2 5'
              strokeLinecap='round'
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
