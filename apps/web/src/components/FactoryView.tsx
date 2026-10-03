import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Map, Maximize2, RotateCcw, Upload, Download, Focus } from 'lucide-react';
import { STATIONS, type ConveyorVehicleSnapshot, type SessionSnapshot, type StationId } from '@kosta/shared';
import { FlowDiagram } from './FlowDiagram';
import { buildConveyorRoute } from '../three/conveyorPath';
import { DEFAULT_LAYOUT, parseFactoryLayout, type FactoryLayout } from '../three/factoryLayout';
import type { CameraRequest, CameraView } from '../three/FactoryCanvas';
import '../factory3d.css';

const FactoryCanvas = lazy(() => import('../three/FactoryCanvas'));
const VEHICLE_STATE: Record<ConveyorVehicleSnapshot['state'], string> = { moving: 'В пути', queued: 'В очереди', processing: 'Обработка', blocked: 'Выход занят' };
const stageName = (vehicle: ConveyorVehicleSnapshot) => vehicle.stage === 'outbound' ? 'К выходу' : STATIONS.find(station => station.id === vehicle.stage)?.name;

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function FactoryView({ snapshot, selected, animate, stale, onSelect, onTogglePlayback, controlsDisabled }: {
  snapshot: SessionSnapshot; selected: StationId; animate: boolean; stale: boolean; onSelect: (id: StationId) => void;
  onTogglePlayback: () => void; controlsDisabled: boolean;
}) {
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [quality, setQuality] = useState<'balanced' | 'economy'>(() => window.matchMedia('(max-width: 700px)').matches ? 'economy' : 'balanced');
  const [layout, setLayout] = useState<FactoryLayout>(DEFAULT_LAYOUT);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutChanged, setLayoutChanged] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(true);
  const [foreground, setForeground] = useState(!document.hidden);
  const [wide, setWide] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [cameraRequest, setCameraRequest] = useState<CameraRequest>({ view: 'overview', sequence: 0, station: selected });
  const viewport = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const loadingFile = useRef(0);
  const vehicles = snapshot.conveyor.vehicles;
  const selectedVehicle = vehicles.find(vehicle => vehicle.id === selectedVehicleId);
  const movingCount = vehicles.filter(vehicle => vehicle.state === 'moving').length;
  const workingCount = vehicles.filter(vehicle => vehicle.state === 'processing').length;
  const waitingCount = vehicles.length - movingCount - workingCount;

  useEffect(() => {
    setSelectedVehicleId(null);
    setCameraRequest(previous => ({ view: 'overview', station: previous.station, sequence: previous.sequence + 1 }));
  }, [snapshot.sessionId, snapshot.revision]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(media.matches);
    change(); media.addEventListener('change', change);
    const foregroundChange = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', foregroundChange);
    return () => { media.removeEventListener('change', change); document.removeEventListener('visibilitychange', foregroundChange); };
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? true), { rootMargin: '120px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setWide(false); };
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('keydown', escape); loadingFile.current += 1; };
  }, []);

  const reportFailure = useCallback(() => { setFailed(true); setMode('2d'); setWide(false); }, []);
  const camera = (view: CameraView, station = selected, vehicleId?: string) => setCameraRequest(previous => ({ view, station, vehicleId, sequence: previous.sequence + 1 }));
  const choose = (id: StationId) => { onSelect(id); camera('station', id); };
  const chooseVehicle = (id: string) => { setSelectedVehicleId(id); camera('vehicle', selected, id); };
  const upload = async (file: File) => {
    const version = ++loadingFile.current;
    try {
      if (file.size > 65_536) throw new Error('Размер схемы должен быть не больше 64 КБ.');
      const text = await file.text();
      if (version !== loadingFile.current) return;
      let value: unknown;
      try { value = JSON.parse(text); } catch { throw new Error('Не удалось прочитать JSON. Сверьте файл с шаблоном схемы.'); }
      const next = parseFactoryLayout(value);
      buildConveyorRoute(next);
      setLayout(next); setLayoutChanged(true); setLayoutError(null); camera('overview');
    } catch (error) {
      if (version === loadingFile.current) setLayoutError(error instanceof Error ? error.message : 'Не удалось загрузить схему.');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(DEFAULT_LAYOUT, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'kostaallur-layout.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const resetLayout = () => { loadingFile.current += 1; setLayout(DEFAULT_LAYOUT); setLayoutChanged(false); setLayoutError(null); camera('overview'); };
  const flat = <FlowDiagram snapshot={snapshot} selected={selected} animate={animate && !reducedMotion} stale={stale} onSelect={onSelect} />;

  return <div className={`plant-view${wide ? ' is-expanded' : ''}`}>
    <div className='plant-toolbar'>
      <div className='plant-switch' role='group' aria-label='Вид производственной линии'>
        <button type='button' aria-pressed={mode === '3d'} disabled={failed} onClick={() => setMode('3d')}><Box size={16} />3D-цех</button>
        <button type='button' aria-pressed={mode === '2d'} onClick={() => { setMode('2d'); setWide(false); }}><Map size={16} />2D-схема</button>
      </div>
      {mode === '3d' && <div className='plant-camera' role='group' aria-label='Камера'>
        <button type='button' disabled={controlsDisabled || snapshot.elapsedSeconds >= snapshot.shiftSeconds} onClick={onTogglePlayback}>{animate ? 'Приостановить смену' : 'Продолжить смену'}</button>
        <button type='button' onClick={() => camera('overview')}><RotateCcw size={14} />Общий вид</button>
        <button type='button' onClick={() => camera('top')}>Сверху</button>
        <button type='button' onClick={() => camera('station')}><Focus size={14} />К участку</button>
        <button type='button' disabled={vehicles.length === 0} aria-pressed={cameraRequest.view === 'vehicle'} onClick={() => chooseVehicle(selectedVehicle?.id ?? vehicles[0].id)}>Следить за машиной</button>
        <button type='button' aria-pressed={wide} onClick={() => setWide(!wide)}><Maximize2 size={14} />{wide ? 'Свернуть' : 'Развернуть'}</button>
      </div>}
    </div>
    {failed && <p className='plant-notice' role='status'>3D недоступно на этом устройстве. Открыта 2D-схема; расчёты и управление доступны.</p>}
    <div className='plant-fleet-stats' aria-label='Машины на конвейере'>
      <strong>В линии <b>{vehicles.length}</b></strong><span>В пути {movingCount}</span><span>На обработке {workingCount}</span><span>Ожидают {waitingCount}</span>
      <small>Каждая машина учтена · вместимость буферов задана конфигурацией · без обгона</small>
    </div>
    <div ref={viewport} className={mode === '3d' ? 'plant-viewport' : 'plant-flat'} aria-label={mode === '3d' ? 'Интерактивный трёхмерный цех' : 'Двумерная схема'} role='region'>
      {mode === '3d' ? <SceneBoundary onFailure={reportFailure} fallback={flat}>
        <Suspense fallback={<div className='plant-loading' role='status'><Box size={32} /><strong>Собираем трёхмерный цех…</strong><span>Готовим оборудование и камеру</span></div>}>
          <FactoryCanvas snapshot={snapshot} selected={selected} onSelect={choose} layout={layout} quality={quality}
            animate={animate && !stale} reducedMotion={reducedMotion} renderActive={visible && foreground}
            cameraRequest={cameraRequest} onFailure={reportFailure} selectedVehicleId={selectedVehicleId} onSelectVehicle={chooseVehicle} />
        </Suspense>
      </SceneBoundary> : flat}
      {mode === '3d' && <div className='plant-overlay' aria-hidden='true'><span>ЦЕХ / {snapshot.scenario === 'normal' ? 'ШТАТНЫЙ РЕЖИМ' : 'СЦЕНАРИЙ'}</span><strong>{stale ? 'Нет связи' : snapshot.elapsedSeconds >= snapshot.shiftSeconds ? 'Смена завершена' : animate ? 'Смена идёт' : 'Смена на паузе'}</strong><small>{layout.units === 'meters' ? 'Размеры из загруженной схемы' : 'Условные размеры'}</small></div>}
      {mode === '3d' && selectedVehicleId && <div className='plant-vehicle-card' role='status'>
        <strong>{selectedVehicleId}</strong>
        <span>{selectedVehicle ? `${stageName(selectedVehicle)} · ${VEHICLE_STATE[selectedVehicle.state]}` : 'Автомобиль покинул линию'}</span>
        {selectedVehicle?.outcome === 'rejected' && <small>Отмечен брак · следует к выходу</small>}
      </div>}
    </div>
    {mode === '3d' && <>
      <div className='plant-bottom'>
        <p>Вращение — перетаскивание · масштаб — колесо или жест · сдвиг — правая кнопка</p>
        <label>Графика <select aria-label='Качество 3D' value={quality} onChange={event => setQuality(event.target.value as 'balanced' | 'economy')}><option value='balanced'>Стандартная</option><option value='economy'>Экономная</option></select></label>
      </div>
      <div className='plant-stations' role='group' aria-label='Выбрать участок в 3D'>
        {snapshot.stations.map((station, index) => <button key={station.id} type='button' aria-pressed={selected === station.id} onClick={() => choose(station.id)}>
          <span className={`plant-station-dot is-${station.status}`} /><span><strong>{index + 1}. {station.name}</strong><small>Буфер {station.inputQueue}/{station.bufferCapacity} · ждут {station.queuedUnits}</small></span>
          <b>{station.inProcess ? `${Math.round(station.progress * 100)}%` : '—'}</b>
        </button>)}
      </div>
      {reducedMotion && <p className='plant-notice'>Анимация отключена согласно настройкам устройства. Показатели продолжают обновляться.</p>}
    </>}
    <details className='plant-manifest'>
      <summary>Автомобили по ID · {vehicles.length}</summary>
      <p>Выберите машину для наблюдения. Входной буфер включает подъезжающие машины и остановившуюся очередь.</p>
      <div className='plant-vehicle-list'>
        {vehicles.map(vehicle => <button key={vehicle.id} type='button' aria-pressed={selectedVehicleId === vehicle.id}
          data-vehicle-id={vehicle.id} data-distance={vehicle.distance} data-state={vehicle.state} disabled={mode !== '3d'} onClick={() => chooseVehicle(vehicle.id)}>
          <strong>{vehicle.id}</strong><span>{stageName(vehicle)}</span><small>{VEHICLE_STATE[vehicle.state]}</small>
        </button>)}
        {vehicles.length === 0 && <p>На конвейере нет автомобилей.</p>}
      </div>
    </details>
    <details className='plant-layout'>
      <summary>Размещение участков · {layout.title}</summary>
      <p>Можно загрузить расположение четырёх участков по шаблону. Файл читается на этом устройстве и меняет только 3D-размещение. Показатели рассчитывает модель; обновление страницы вернёт учебную схему.</p>
      <div className='plant-layout-actions'>
        <button type='button' onClick={download}><Download size={14} />Шаблон схемы</button>
        <button type='button' onClick={() => fileInput.current?.click()}><Upload size={14} />Загрузить схему</button>
        {layoutChanged && <button type='button' onClick={resetLayout}>Вернуть учебную схему</button>}
      </div>
      <input ref={fileInput} className='plant-file' type='file' accept='.json,application/json' aria-label='Файл схемы участков' onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
      {layoutError && <p className='plant-layout-error' role='alert'>{layoutError}</p>}
      {layoutChanged && <p className='plant-notice' role='status'>Загружена схема «{layout.title}». Производственные параметры не изменены.</p>}
    </details>
  </div>;
}
