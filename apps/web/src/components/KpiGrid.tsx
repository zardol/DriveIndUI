import { Gauge, ShieldCheck, Timer, Factory } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { clamp01, formatDuration, formatInt, formatOne, formatSigned } from '../format';
import type { PlantSnapshot } from '../types';

interface KpiCardProps {
  Icon: LucideIcon;
  label: string;
  tone?: 'default' | 'warn';
  children: ReactNode;
  note: ReactNode;
  progress?: number;
}

function KpiCard({ Icon, label, tone = 'default', children, note, progress }: KpiCardProps) {
  return (
    <article className={`card kpi${tone === 'warn' ? ' kpi--warn' : ''}`}>
      <header className='kpi__head'>
        <span className='kpi__icon' aria-hidden='true'>
          <Icon size={18} />
        </span>
        <h3 className='kpi__label'>{label}</h3>
      </header>
      <p className='kpi__value'>{children}</p>
      {progress !== undefined && (
        <div className='bar bar--thin' aria-hidden='true'>
          <div className='bar__fill' style={{ width: `${clamp01(progress) * 100}%` }} />
        </div>
      )}
      <p className='kpi__note'>{note}</p>
    </article>
  );
}

export function KpiGrid({ snapshot }: { snapshot: PlantSnapshot }) {
  const { goodUnits, shiftPlan, history, throughputPerHour, wip, rejectedUnits, downtimeSeconds, qualityPercent } =
    snapshot;
  const latest = history.length > 0 ? history[history.length - 1] : undefined;
  const delta = latest ? goodUnits - latest.planUnits : null;

  return (
    <section className='kpi-grid' aria-label='Ключевые показатели смены'>
      <KpiCard
        Icon={Factory}
        label='Годные автомобили к плану'
        progress={shiftPlan > 0 ? goodUnits / shiftPlan : 0}
        note={
          latest && delta !== null ? (
            <>
              По графику к этому моменту: {formatInt(latest.planUnits)} ед. (
              <strong>{delta === 0 ? 'в графике' : `${formatSigned(delta)} ед.`}</strong>)
            </>
          ) : (
            'Данные о графике появятся после старта'
          )
        }
      >
        {formatInt(goodUnits)}
        <span className='kpi__unit'> / {formatInt(shiftPlan)} ед. плана смены</span>
      </KpiCard>

      <KpiCard
        Icon={Gauge}
        label='Производительность'
        note={`В потоке: ${formatInt(wip)} ед. · брак: ${formatInt(rejectedUnits)} ед.`}
      >
        {formatOne(throughputPerHour)}
        <span className='kpi__unit'> ед./ч</span>
      </KpiCard>

      <KpiCard
        Icon={Timer}
        label='Простой оборудования (сумма по станциям)'
        tone={downtimeSeconds > 0 ? 'warn' : 'default'}
        note='Суммарное время остановок оборудования всех станций. Может превышать время смены; ожидание и блокировка не входят.'
      >
        {formatDuration(downtimeSeconds)}
      </KpiCard>

      <KpiCard
        Icon={ShieldCheck}
        label='Качество'
        note={
          qualityPercent === null
            ? 'Пока нет ни одного проверенного автомобиля'
            : `Годных: ${formatInt(goodUnits)} · брак: ${formatInt(rejectedUnits)} ед.`
        }
      >
        {qualityPercent === null ? '—' : formatOne(qualityPercent)}
        {qualityPercent !== null && <span className='kpi__unit'> %</span>}
      </KpiCard>
    </section>
  );
}
