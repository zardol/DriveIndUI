import { lazy, Suspense, useState } from 'react';
import { ClockCard } from './components/ClockCard';
import { ControlBar } from './components/ControlBar';
import { FactoryView } from './components/FactoryView';
import { ForecastCard } from './components/ForecastCard';
import { IncidentTimeline } from './components/IncidentTimeline';
import { KpiGrid } from './components/KpiGrid';
import { Legend } from './components/Legend';
import { Sidebar } from './components/Sidebar';
import { ConnectionBanner, ErrorState, LoadingState } from './components/StateScreens';
import { StationDetails } from './components/StationDetails';
import { TopBar } from './components/TopBar';
import type { StationId } from './types';
import { useSession } from './useSession';
import { ShiftFocus } from './components/ShiftFocus';
import { BROWSER_MODE } from './runtimeMode';
import './stage2-layout.css';
import { ComparisonSection } from './components/ComparisonSection';

const ProductionChart = lazy(() => import('./components/ProductionChart').then((module) => ({ default: module.ProductionChart })));

export default function App() {
  const session = useSession();
  const { snapshot, connection } = session;
  const [selected, setSelected] = useState<StationId>('welding');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selectStation = (id: StationId) => { setSelected(id); setDetailsOpen(true); };

  const stale = connection === 'lost';
  // Анимация схемы допустима только пока симуляция идёт и связь с сервером есть.
  const animate = snapshot !== null && snapshot.running && connection === 'online';

  return (
    <div className='app stage2'>
      <Sidebar ready={snapshot !== null} />
      <div className='main'>
        <TopBar connection={connection} sessionId={snapshot?.sessionId ?? null} />
        <main className='content'>
          {snapshot === null ? (
            connection === 'lost' ? (
              <ErrorState message={session.connectionError} onRetry={session.retryNow} />
            ) : (
              <LoadingState />
            )
          ) : (
            <>
              {stale && (
                <ConnectionBanner
                  message={session.connectionError}
                  lastSyncAt={session.lastSyncAt}
                  onRetry={session.retryNow}
                />
              )}

              <section id='overview' className='section hero' aria-labelledby='page-title'>
                <div className='hero__text'>
                  <p className='eyebrow'>KostaAllur / Центр управления производством</p>
                  <h1 id='page-title'>Вся линия. Одна картина.</h1>
                  <p className='hero__lead'>
                    От кузова до готового автомобиля: выпуск, загрузка и причины задержек.
                  </p>
                </div>
                <ClockCard snapshot={snapshot} stale={stale} />
              </section>

              <ControlBar
                snapshot={snapshot}
                pending={session.pending}
                offline={stale}
                error={session.controlError}
                onCommand={session.sendCommand}
                onDismissError={session.dismissControlError}
              />

              <KpiGrid snapshot={snapshot} />

              <ShiftFocus snapshot={snapshot} onSelect={selectStation} stale={stale} />

              <section id='flow' className='section card flow-card' aria-labelledby='flow-title'>
                <div className='card__head'>
                  <div>
                    <h2 id='flow-title' className='card__title'>
                      Схема линии
                    </h2>
                    <p className='card__sub'>
                      Выберите оборудование, чтобы открыть его показатели.
                    </p>
                  </div>
                  <span className='pill pill--neutral'>Учебная модель цеха</span>
                </div>
                <FactoryView snapshot={snapshot} selected={selected} onSelect={selectStation} animate={animate} stale={stale}
                  onTogglePlayback={() => session.sendCommand({ action: snapshot.running ? 'pause' : 'play' })} controlsDisabled={stale || session.pending} />
                <details className='station-disclosure' open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
                  <summary>Показатели участка · {snapshot.stations.find((station) => station.id === selected)?.name}</summary>
                  <StationDetails snapshot={snapshot} selected={selected} onSelect={selectStation} />
                </details>
              </section>

              <div className='split'>
                <section id='production' className='section card' aria-labelledby='production-title'>
                  <Suspense fallback={<p className='empty' role='status'>Загружаем график…</p>}><ProductionChart snapshot={snapshot} /></Suspense>
                </section>
                <div className='stack'>
                  <ForecastCard snapshot={snapshot} />
                  <section id='incidents' className='section card' aria-labelledby='incidents-title'>
                    <IncidentTimeline snapshot={snapshot} />
                  </section>
                </div>
              </div>

              <ComparisonSection key={`${snapshot.sessionId}:${snapshot.revision}`} snapshot={snapshot} disabled={stale || session.pending} />

              <details id='legend' className='section card legend-disclosure'>
                <summary>Как читать показатели и схему</summary>
                <Legend />
              </details>

              <p className='footnote'>
                Синтетические данные · условная схема производства · время модельное.
                {BROWSER_MODE && ' Симуляция выполняется на вашем устройстве; обновление страницы начинает новую смену.'}
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
