import { t } from '../i18n';
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
        <h3 className='kpi__label'>{t(label)}</h3>
      </header>
      <p className='kpi__value'>{t(children)}</p>
      {progress !== undefined && (
        <div className='bar bar--thin' aria-hidden='true'>
          <div className='bar__fill' style={{ width: `${clamp01(progress) * 100}%` }} />
        </div>
      )}
      <p className='kpi__note'>{t(note)}</p>
    </article>
  );
}

export function KpiGrid({ snapshot }: { snapshot: PlantSnapshot }) {
  const { goodUnits, shiftPlan, history, throughputPerHour, wip, rejectedUnits, downtimeSeconds, qualityPercent } =
    snapshot;
  const latest = history.length > 0 ? history[history.length - 1] : undefined;
  const delta = latest ? goodUnits - latest.planUnits : null;

  return (
    <section className='kpi-grid' aria-label={t("Ключевые показатели смены")}>
      <KpiCard
        Icon={Factory}
        label={t("Годный выпуск")}
        progress={shiftPlan > 0 ? goodUnits / shiftPlan : 0}
        note={
          latest && delta !== null ? (
            <>
              <strong>{t(delta === 0 ? 'По графику' : `${formatSigned(delta)} к графику`)}</strong> {t(" · сейчас нужно ")}{t(formatInt(latest.planUnits))}
            </>
          ) : (
            'Данные о графике появятся после старта'
          )
        }
      >
        {t(formatInt(goodUnits))}
        <span className='kpi__unit'> / {t(formatInt(shiftPlan))} {t(" авто")}</span>
      </KpiCard>

      <KpiCard
        Icon={Gauge}
        label={t("Производительность")}
        note={`В потоке: ${formatInt(wip)} ед. · брак: ${formatInt(rejectedUnits)} ед.`}
      >
        {t(formatOne(throughputPerHour))}
        <span className='kpi__unit'> {t(" ед./ч")}</span>
      </KpiCard>

      <KpiCard
        Icon={Timer}
        label={t("Простой оборудования")}
        tone={downtimeSeconds > 0 ? 'warn' : 'default'}
        note={t("Сумма остановок участков")}
      >
        {t(formatDuration(downtimeSeconds))}
      </KpiCard>

      <KpiCard
        Icon={ShieldCheck}
        label={t("Доля годных")}
        note={
          qualityPercent === null
            ? 'Нет завершённых автомобилей'
            : `Годных: ${formatInt(goodUnits)} · брак: ${formatInt(rejectedUnits)} ед.`
        }
      >
        {t(qualityPercent === null ? '—' : formatOne(qualityPercent))}
        {qualityPercent !== null && <span className='kpi__unit'> %</span>}
      </KpiCard>
    </section>
  );
}
