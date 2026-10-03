import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { DEFAULT_PRODUCTION_CONFIG, HISTORY_CSV_TEMPLATE, parseHistoricalCsv, parseProductionConfig, STATIONS } from '@kosta/shared';
import type { ControlCommand, HistoricalDataset, ProductionConfig, SessionSnapshot } from '@kosta/shared';
import { formatDuration, formatInt } from '../format';
import { BROWSER_MODE } from '../runtimeMode';
import '../data-workspace.css';

const HistoricalViewer = lazy(() => import('./HistoricalViewer').then(module => ({ default: module.HistoricalViewer })));
export type WorkspaceMode = 'simulation' | 'history';
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props {
  snapshot: SessionSnapshot;
  mode: WorkspaceMode;
  pending: boolean;
  offline: boolean;
  onModeChange: (mode: WorkspaceMode) => void;
  onCommand: (command: ControlCommand) => void;
}

export function DataWorkspace({ snapshot, mode, pending, offline, onModeChange, onCommand }: Props) {
  const configInput = useRef<HTMLInputElement>(null);
  const historyInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const [reading, setReading] = useState(false);
  const [candidate, setCandidate] = useState<ProductionConfig | null>(null);
  const [dataset, setDataset] = useState<HistoricalDataset | null>(null);
  const [datasetVersion, setDatasetVersion] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const submitted = useRef<{ revision: number; config: string } | null>(null);
  const disabled = pending || offline || reading;

  useEffect(() => {
    if (submitted.current && snapshot.revision > submitted.current.revision
      && JSON.stringify(snapshot.config) === submitted.current.config) {
      submitted.current = null;
      setCandidate(null);
      setMessage('Конфигурация применена. Новая смена на паузе; можно запускать расчёт.');
    }
  }, [snapshot.revision, snapshot.config]);

  useEffect(() => () => { generation.current += 1; }, []);

  const readFile = async (file: File, kind: WorkspaceMode) => {
    const request = ++generation.current;
    setReading(true); setIssues([]); setWarnings([]); setMessage('');
    if (kind === 'simulation') setCandidate(null);
    try {
      const limit = kind === 'simulation' ? 65536 : MAX_FILE_BYTES;
      if (file.size > limit) throw new Error(kind === 'simulation' ? 'Конфигурация превышает 64 КиБ.' : 'Файл превышает 2 МиБ. Разделите данные на смены.');
      const bytes = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (request !== generation.current) return;
      if (kind === 'simulation') {
        let value: unknown;
        try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
        catch { throw new Error('Не удалось прочитать JSON. Проверьте запятые, кавычки и кодировку UTF-8.'); }
        const result = parseProductionConfig(value);
        if (!result.ok) { setIssues(result.issues.map(issue => `${issue.path}: ${issue.message}`)); return; }
        setCandidate(result.value); setWarnings(result.warnings); setOpen(true);
        setMessage(`Файл «${file.name}» проверен. Ниже — параметры перед применением.`);
      } else {
        const result = parseHistoricalCsv(text, file.name);
        if (!result.ok) { setIssues(result.issues.map(issue => `${issue.path}: ${issue.message}`)); return; }
        setDataset(result.value); setDatasetVersion(value => value + 1); setWarnings(result.warnings.slice(1));
        setMessage(`Загружено ${formatInt(result.value.records.length)} записей из «${file.name}».`);
      }
    } catch (error) {
      if (request === generation.current) setIssues([error instanceof TypeError
        ? 'Не удалось прочитать текст UTF-8. Сохраните файл в этой кодировке.'
        : error instanceof Error ? error.message : 'Не удалось прочитать файл.']);
    } finally {
      if (request === generation.current) setReading(false);
    }
  };

  const changeMode = (next: WorkspaceMode) => {
    if (next === mode) return;
    generation.current += 1;
    setReading(false); setIssues([]); setWarnings([]); setMessage('');
    onModeChange(next);
  };

  return <section id='data' className='section card data-workspace' aria-labelledby='data-title'>
    <div className='card__head'>
      <div><h2 id='data-title' className='card__title'>Данные и режим работы</h2>
        <p className='card__sub'>Модель рассчитывает движение машин. История показывает измерения из файла.</p></div>
      <span className='pill pill--neutral'>{mode === 'history' ? 'История из CSV' : snapshot.config.source.kind === 'synthetic' ? 'Синтетическая модель' : 'Сценарный расчёт'}</span>
    </div>
    <div className='segmented data-workspace__tabs' role='group' aria-label='Режим данных'>
      <button type='button' className='segmented__btn' aria-pressed={mode === 'simulation'} disabled={pending} onClick={() => changeMode('simulation')}>Симуляция и 3D</button>
      <button type='button' className='segmented__btn' aria-pressed={mode === 'history'} disabled={pending} onClick={() => changeMode('history')}>История производства</button>
    </div>

    {mode === 'simulation' ? <>
      <p className='data-workspace__source'><strong>{snapshot.config.name}</strong> · {snapshot.config.source.label}<br />
        Выпуск, очереди и прогноз рассчитываются моделью. Параметры из файла требуют калибровки по данным завода.</p>
      <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className='data-workspace__details'>
        <summary>Параметры производства и импорт JSON</summary>
        <ConfigSummary config={snapshot.config} title='Активная конфигурация' />
        <div className='data-workspace__actions'>
          <button type='button' className='btn' disabled={reading} onClick={() => configInput.current?.click()}>Загрузить конфигурацию</button>
          <button type='button' className='btn' onClick={() => downloadText('production-example.json', JSON.stringify(DEFAULT_PRODUCTION_CONFIG, null, 2), 'application/json')}>Шаблон JSON</button>
          <button type='button' className='btn' onClick={() => downloadText('production-config.json', JSON.stringify(snapshot.config, null, 2), 'application/json')}>Скачать текущую</button>
          <button type='button' className='btn' disabled={disabled} onClick={() => { setCandidate(structuredClone(DEFAULT_PRODUCTION_CONFIG)); setIssues([]); setWarnings([]); setMessage('Учебные параметры готовы к применению.'); }}>Учебные параметры</button>
        </div>
        <input ref={configInput} type='file' accept='.json,application/json' className='sr-only' tabIndex={-1} aria-label='Файл конфигурации JSON'
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readFile(file, 'simulation'); }} />
        <p className='data-workspace__hint'>Все интервалы — в секундах; скорость ленты — в условных единицах модели в секунду. Геометрия и порядок четырёх участков пока фиксированы.</p>
        {candidate && <div className='data-workspace__preview'>
          <ConfigSummary config={candidate} title='Будет применено' />
          <p>Применение обнулит текущую смену и поставит новую на паузу. Сценарий и скорость времени сохранятся.</p>
          <p className='data-workspace__hint'>{BROWSER_MODE ? 'Файл обрабатывается на этом устройстве.' : 'После применения параметры будут переданы серверу текущей сессии.'}</p>
          <div className='data-workspace__actions'>
            <button type='button' className='btn btn--primary' disabled={disabled} onClick={() => {
              submitted.current = { revision: snapshot.revision, config: JSON.stringify(candidate) };
              onCommand({ action: 'setConfiguration', config: candidate });
            }}>Применить и начать новую смену</button>
            <button type='button' className='btn' disabled={pending} onClick={() => { setCandidate(null); setMessage(''); }}>Отменить загрузку</button>
          </div>
        </div>}
      </details>
    </> : <>
      <div className='data-workspace__actions'>
        <button type='button' className='btn btn--primary' disabled={reading} onClick={() => historyInput.current?.click()}>Загрузить историю CSV</button>
        <button type='button' className='btn' onClick={() => downloadText('history-synthetic-example.csv', HISTORY_CSV_TEMPLATE, 'text/csv;charset=utf-8')}>Шаблон CSV</button>
        <button type='button' className='btn' disabled={reading} onClick={() => {
          const result = parseHistoricalCsv(HISTORY_CSV_TEMPLATE, 'Учебный пример · синтетические записи');
          if (result.ok) { setDataset(result.value); setDatasetVersion(value => value + 1); setIssues([]); setWarnings(result.warnings.slice(1)); setMessage('Открыт синтетический пример формата. Это не данные завода.'); }
        }}>Открыть учебный пример</button>
        {dataset && <button type='button' className='btn' disabled={reading} onClick={() => { setDataset(null); setMessage('История удалена из текущего просмотра.'); setWarnings([]); setIssues([]); }}>Закрыть историю</button>}
      </div>
      <input ref={historyInput} type='file' accept='.csv,text/csv' className='sr-only' tabIndex={-1} aria-label='Файл истории CSV'
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void readFile(file, 'history'); }} />
      <p className='data-workspace__hint'>CSV UTF-8 до 2 МиБ и 10 000 записей за смену. Время — секунды от начала смены; выпуск, брак, план и простой — нарастающим итогом; НЗП — на момент записи. История остаётся на этом устройстве и исчезает при обновлении страницы.</p>
    </>}

    {reading && <p role='status'>Проверяем файл…</p>}
    {message && <p role='status' className='data-workspace__message'>{message}</p>}
    {issues.length > 0 && <div className='alert alert--error data-workspace__errors' role='alert'>
      <strong>Файл не принят. {mode === 'history' && dataset ? 'Ранее загруженная история сохранена.' : 'Текущие данные сохранены.'}</strong>
      <ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
    </div>}
    {warnings.length > 0 && <ul className='data-workspace__hint'>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    {mode === 'history' && (dataset
      ? <Suspense fallback={<p role='status'>Загружаем просмотр истории…</p>}><HistoricalViewer key={datasetVersion} dataset={dataset} /></Suspense>
      : <p className='empty'>Загрузите файл или откройте учебный пример. Реальные исходные данные ожидаются 5 октября.</p>)}
  </section>;
}

function ConfigSummary({ config, title }: { config: ProductionConfig; title: string }) {
  return <div className='data-workspace__summary'>
    <h3>{title}: {config.name}</h3><p>{config.source.label} · {config.source.kind === 'synthetic' ? 'синтетические параметры' : 'параметры из файла, не проверены'}</p>
    <dl className='data-workspace__metrics'>
      <div><dt>Длительность</dt><dd>{formatDuration(config.shiftSeconds)} ({config.shiftSeconds} с)</dd></div>
      <div><dt>План</dt><dd>{formatInt(config.shiftPlan)} авто</dd></div>
      <div><dt>Подача кузова</dt><dd>каждые {config.supplyIntervalSeconds} с</dd></div>
      <div><dt>Вероятность брака</dt><dd>{Number((config.rejectRate * 100).toFixed(4))}%</dd></div>
      <div><dt>Скорость ленты</dt><dd>{config.conveyorSpeed} у.е./с</dd></div>
    </dl>
    <div className='data-workspace__table'><table><thead><tr><th>Участок</th><th>Цикл, с</th><th>Буфер, авто</th></tr></thead>
      <tbody>{config.stations.map(station => <tr key={station.id}><td>{STATIONS.find(item => item.id === station.id)?.name}</td><td>{station.cycleSeconds}</td><td>{station.bufferCapacity}</td></tr>)}</tbody></table></div>
  </div>;
}
