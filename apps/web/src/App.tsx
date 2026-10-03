import { useState } from 'react';
import { ClockCard } from './components/ClockCard';
import { ControlBar } from './components/ControlBar';
import { FlowDiagram } from './components/FlowDiagram';
import { ForecastCard } from './components/ForecastCard';
import { IncidentTimeline } from './components/IncidentTimeline';
import { KpiGrid } from './components/KpiGrid';
import { Legend } from './components/Legend';
import { ProductionChart } from './components/ProductionChart';
import { Sidebar } from './components/Sidebar';
import { ConnectionBanner, ErrorState, LoadingState } from './components/StateScreens';
import { StationDetails } from './components/StationDetails';
import { TopBar } from './components/TopBar';
import type { StationId } from './types';
import { useSession } from './useSession';

export default function App() {
  const session = useSession();
  const { snapshot, connection } = session;
  const [selected, setSelected] = useState<StationId>('welding');

  const stale = connection === 'lost';
  // Анимация схемы допустима только пока симуляция идёт и связь с сервером есть.
  const animate = snapshot !== null && snapshot.running && connection === 'online';

  return (
    <div className='app'>
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
                  <p className='eyebrow'>Цифровой двойник автомобильного завода</p>
                  <h1 id='page-title'>Производство под контролем</h1>
                  <p className='hero__lead'>
                    Линия от склада до контроля качества в режиме симуляции. Все показатели создаёт демонстрационная
                    модель, схема иллюстративная.
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

              <section id='flow' className='section card flow-card' aria-labelledby='flow-title'>
                <div className='card__head'>
                  <div>
                    <h2 id='flow-title' className='card__title'>
                      Схема линии
                    </h2>
                    <p className='card__sub'>
                      Иллюстративная схема потока: выберите станцию, чтобы увидеть подробности.
                    </p>
                  </div>
                  <span className='pill pill--neutral'>Поток слева направо</span>
                </div>
                <FlowDiagram snapshot={snapshot} selected={selected} onSelect={setSelected} animate={animate} stale={stale} />
                <StationDetails snapshot={snapshot} selected={selected} onSelect={setSelected} />
              </section>

              <div className='split'>
                <section id='production' className='section card' aria-labelledby='production-title'>
                  <ProductionChart snapshot={snapshot} />
                </section>
                <div className='stack'>
                  <ForecastCard snapshot={snapshot} />
                  <section id='legend' className='section card' aria-labelledby='legend-title'>
                    <Legend />
                  </section>
                </div>
              </div>

              <section id='incidents' className='section card' aria-labelledby='incidents-title'>
                <IncidentTimeline snapshot={snapshot} />
              </section>

              <p className='footnote'>
                Демонстрационные данные: показатели синтетические и создаются симулятором. Схема иллюстративная и не
                описывает реальное предприятие. Все временные значения — время симуляции, а не реальное время.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
