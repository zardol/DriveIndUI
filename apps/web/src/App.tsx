import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CircleHelp } from 'lucide-react';
import { ControlBar } from './components/ControlBar';
import { FactoryView } from './components/FactoryView';
import { Legend } from './components/Legend';
import { Sidebar } from './components/Sidebar';
import { ConnectionBanner, ErrorState, LoadingState } from './components/StateScreens';
import { StationDetails } from './components/StationDetails';
import { TopBar } from './components/TopBar';
import type { StationId } from './types';
import { useSession } from './useSession';
import './stage2-layout.css';
import { ComparisonSection } from './components/ComparisonSection';
import { DataWorkspace, type WorkspaceMode } from './components/DataWorkspace';
import { CasePanel } from './components/CasePanel';
import { OverviewPage } from './components/OverviewPage';
import { WORKSPACES, pageFromHash, pageHref, type WorkspacePage } from './navigation';
import './workspaces.css';

export default function App() {
  const session = useSession();
  const { snapshot, connection } = session;
  const [page, setPage] = useState<WorkspacePage>(() => pageFromHash(window.location.hash));
  const [factoryVisited, setFactoryVisited] = useState(page === 'factory');
  const [selected, setSelected] = useState<StationId>('welding');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [stationFocus, setStationFocus] = useState(0);
  const [dataTab, setDataTab] = useState<'facts' | 'import' | 'method'>('facts');
  const [mode, setMode] = useState<WorkspaceMode>('simulation');
  const heading = useRef<HTMLHeadingElement>(null);
  const meta = WORKSPACES.find(item => item.id === page)!;
  const stale = connection === 'lost';
  const animate = snapshot !== null && snapshot.running && connection === 'online';
  const navigate = (next: WorkspacePage) => { window.location.hash = pageHref(next); };
  const selectStation = (id: StationId) => { setSelected(id); setDetailsOpen(true); };

  useEffect(() => {
    const change = () => {
      const next = pageFromHash(window.location.hash);
      setPage(next);
      if (next === 'factory') setFactoryVisited(true);
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.title = `${meta.label} · DriveIndUI`;
    heading.current?.focus({ preventScroll: true });
  }, [page, meta.label]);

  return <div className='app stage2 workbench'>
    <a href='#workspace-content' className='skip-link' onClick={event => { event.preventDefault(); heading.current?.focus(); }}>К содержимому</a>
    <Sidebar page={page} />
    <div className='main'>
      <TopBar connection={connection} sessionId={snapshot?.sessionId ?? null} dataLabel={page === 'data' && dataTab === 'import' && mode === 'history' ? 'История из CSV' : snapshot?.config.source.kind === 'provided' ? 'Сценарная симуляция' : 'Учебная симуляция'} />
      <main className='content' id='workspace-content'>
        <header className='workspace-heading'>
          <div><p className='workspace-eyebrow'>{meta.number} / {meta.caption}</p><h1 ref={heading} tabIndex={-1}>{meta.title}</h1></div>
          {page === 'overview' ? <a className='btn btn--primary' href={pageHref('factory')}>Открыть цех <ArrowUpRight size={16} /></a>
            : <a className='workspace-help' href={pageHref('data')} onClick={() => setDataTab('method')}><CircleHelp size={17} />Методика</a>}
        </header>
        {!snapshot ? (stale ? <ErrorState message={session.connectionError} onRetry={session.retryNow} /> : <LoadingState />) : <>
          {stale && <ConnectionBanner message={session.connectionError} lastSyncAt={session.lastSyncAt} onRetry={session.retryNow} />}
          {page !== 'data' && <ControlBar snapshot={snapshot} pending={session.pending} offline={stale} error={session.controlError} onCommand={session.sendCommand} onDismissError={session.dismissControlError} />}
          {page === 'data' && session.controlError && <p className='alert alert--error' role='alert'>{session.controlError}</p>}

          {page === 'overview' && <OverviewPage snapshot={snapshot} stale={stale} onStation={id => { selectStation(id); setStationFocus(value => value + 1); navigate('factory'); }} />}

          <div className='workspace-page' hidden={page !== 'factory'}>
            {factoryVisited && <section className='card factory-workspace' aria-label='Производственная линия'>
              <FactoryView snapshot={snapshot} selected={selected} onSelect={selectStation} animate={animate && page === 'factory'} active={page === 'factory'} stationFocus={stationFocus} stale={stale}
                onTogglePlayback={() => session.sendCommand({ action: snapshot.running ? 'pause' : 'play' })} controlsDisabled={stale || session.pending} />
              <details className='station-disclosure' open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)}>
                <summary>Показатели · {snapshot.stations.find(station => station.id === selected)?.name}</summary>
                <StationDetails snapshot={snapshot} selected={selected} onSelect={selectStation} />
              </details>
            </section>}
          </div>
          <div className='workspace-page' hidden={page !== 'plan'}>
            <CasePanel view='plan' snapshot={snapshot} disabled={session.pending || stale} onCommand={session.sendCommand} />
          </div>
          <div className='workspace-page' hidden={page !== 'decisions'}>
            <ComparisonSection key={`${snapshot.sessionId}:${snapshot.revision}`} snapshot={snapshot} disabled={stale || session.pending} />
          </div>
          <div className='workspace-page data-page' hidden={page !== 'data'}>
            <div className='workspace-tabs' role='group' aria-label='Раздел данных'>
              {([{ id: 'facts', name: 'Показатели кейса' }, { id: 'import', name: 'Импорт и параметры' }, { id: 'method', name: 'Риски и методика' }] as const).map(tab =>
                <button key={tab.id} type='button' aria-pressed={dataTab === tab.id} onClick={() => setDataTab(tab.id)}>{tab.name}</button>)}
            </div>
            <div hidden={dataTab !== 'facts'}><CasePanel view='facts' snapshot={snapshot} disabled={session.pending || stale} onCommand={session.sendCommand} /></div>
            <div hidden={dataTab !== 'import'}><DataWorkspace snapshot={snapshot} mode={mode} pending={session.pending} offline={stale} active={page === 'data' && dataTab === 'import'} onCommand={session.sendCommand}
              onModeChange={next => { if (next === 'history' && snapshot.running) session.sendCommand({ action: 'pause' }); setMode(next); }} /></div>
            <div hidden={dataTab !== 'method'} className='workspace-method'>
              <section className='card method-intro'><h2>Что показывает модель</h2><p>Тестовые данные организатора за 1–2 октября. 3D и прогноз выпуска — сценарный расчёт, без подключения к оборудованию завода.</p>
                <p>Смена сохраняется при переходе между страницами. Обновление публичного стенда начинает её заново; перед этим можно скачать параметры в разделе импорта.</p></section>
              <CasePanel view='risks' snapshot={snapshot} disabled={session.pending || stale} onCommand={session.sendCommand} />
              <details className='card method-legend'><summary>Обозначения и расчёт показателей</summary><Legend /></details>
            </div>
          </div>
        </>}
      </main>
    </div>
  </div>;
}
