import { locale } from '../preferences';
import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BrainCircuit, ChevronDown, Clock3, Link2, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { AI_MODEL_LABEL, AI_STATION_NAMES, calculateAiIndicators, createAiInput, type AiAnalysis, type AiInput, type AiStatus, type SessionSnapshot, type StationId } from '@driveindui/shared';
import { AiRequestError, defaultAiUrl, fetchAiStatus, normalizeAiAccessCode, normalizeAiUrl, requestAiAnalysis } from '../aiClient';
import { formatClock, formatInt } from '../format';
import { pageHref } from '../navigation';
import '../ai.css';

const riskLabels = { high: 'Высокий', medium: 'Внимание', low: 'Низкий' };
const kindLabels = { downtime: 'Простой', bottleneck: 'Узкое место', plan: 'План', quality: 'Качество' };
const number = (value: number) => value.toLocaleString(locale(), { maximumFractionDigits: 1 });

/** Kept mounted between workspaces; reset/reconfiguration remounts via session + revision key. */
export function AiWorkspace({ snapshot, active, disabled, onStation }: {
  snapshot: SessionSnapshot; active: boolean; disabled: boolean; onStation: (id: StationId) => void;
}) {
  const [horizon, setHorizon] = useState<AiInput['horizonMinutes']>(30);
  const [base, setBase] = useState<string | null>(defaultAiUrl);
  const [urlDraft, setUrlDraft] = useState(() => defaultAiUrl() ?? '');
  const [accessCode, setAccessCode] = useState('');
  const [checkedCode, setCheckedCode] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accessPrompt, setAccessPrompt] = useState<string | null>(null);
  const accessCodeInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [result, setResult] = useState<AiAnalysis | null>(null);
  const [refreshStatus, setRefreshStatus] = useState(0);
  const request = useRef<AbortController | null>(null);
  const input = createAiInput(snapshot, horizon);
  const indicators = calculateAiIndicators(input);
  const normalizedCode = normalizeAiAccessCode(accessCode);
  const connectionUnchanged = normalizedCode === checkedCode && urlDraft.trim().replace(/\/$/, '') === (base ?? '');
  const canAnalyze = Boolean(status?.configured && status.authorized && base !== null && connectionUnchanged);
  const oldResult = result && (snapshot.elapsedSeconds - result.input.elapsedSeconds >= 300 || result.input.horizonMinutes !== horizon);

  useEffect(() => {
    if (!active || base === null) return;
    const controller = new AbortController();
    setChecking(true); setConnectionError(null);
    void fetchAiStatus(base, controller.signal, checkedCode).then(value => { if (!controller.signal.aborted) setStatus(value); })
      .catch(reason => { if (!controller.signal.aborted) { setStatus(null); setConnectionError(reason instanceof Error ? reason.message : 'Нет связи с ИИ.'); } })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [active, base, checkedCode, refreshStatus]);
  useEffect(() => () => request.current?.abort(), []);

  const analyze = () => {
    if (disabled || pending || request.current) return;
    if (!canAnalyze || base === null || checking) {
      setError(null); setSettingsOpen(true);
      setAccessPrompt(!normalizedCode ? 'Введите код доступа, затем нажмите «Проверить подключение».'
        : checking ? 'Проверяем подключение. Дождитесь подтверждения доступа.'
        : 'Подтвердите код доступа кнопкой «Проверить подключение», затем запустите анализ.');
      accessCodeInput.current?.focus();
      return;
    }
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError(null);
    void requestAiAnalysis(base, input, checkedCode, controller.signal).then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(reason => { if (!controller.signal.aborted) {
      setError(reason instanceof Error ? reason.message : 'Анализ не получен.');
      if (reason instanceof AiRequestError && ['AI_ACCESS_REQUIRED', 'AI_ACCESS_INVALID'].includes(reason.code)) {
        setStatus(null); setSettingsOpen(true); setConnectionError(reason.message);
      }
    } })
      .finally(() => { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setPending(false); });
  };
  const connect = () => {
    try {
      const nextBase = urlDraft.trim() ? normalizeAiUrl(urlDraft.trim()) : defaultAiUrl();
      setBase(nextBase); setUrlDraft(nextBase ?? ''); setAccessCode(normalizedCode); setCheckedCode(normalizedCode);
      setStatus(null); setConnectionError(null); setError(null); setAccessPrompt(null); setRefreshStatus(value => value + 1);
    } catch (reason) { setConnectionError(reason instanceof Error ? reason.message : 'Проверьте адрес.'); }
  };
  const statusLabel = checking ? 'Проверяем подключение…' : canAnalyze ? 'Готов к анализу' : connectionError ? 'Подключение не подтверждено' : status?.configured ? normalizedCode ? 'Проверьте код доступа' : 'Нужен код доступа' : 'OpenAI не подключён';

  return <div className='ai-workspace'>
    <section className='ai-hero'>
      <div className='ai-hero-copy'><span className='ai-overline'><Sparkles size={15} />{t("ПРОГНОЗ РИСКОВ")}</span>
        <h2>{t("Анализ ИИ")}</h2>
        <p>{t("ИИ сопоставит текущую загрузку, очереди и историю остановок — и предложит, что проверить в первую очередь.")}</p>
        <div className='ai-hero-meta'><span><BrainCircuit size={15} />{t(AI_MODEL_LABEL)}</span><span className={canAnalyze ? 'ai-online' : ''}><i />{t(statusLabel)}</span></div>
      </div>
      <div className='ai-run-panel'>
        <label htmlFor='ai-horizon'>{t("Прогноз на")}</label>
        <div className='ai-horizons' id='ai-horizon' role='group' aria-label={t("Период прогноза")}>
          {([15, 30, 60] as const).map(minutes => <button type='button' key={minutes} aria-pressed={horizon === minutes} onClick={() => setHorizon(minutes)} disabled={pending}>{t(minutes)} {t(" мин")}</button>)}
        </div>
        <button className='btn ai-analyze' type='button' disabled={disabled || pending} onClick={analyze}>
          {pending ? <LoaderCircle size={18} className='ai-spin' /> : <Sparkles size={18} />}{t(pending ? 'Анализируем смену…' : result ? 'Обновить ИИ-анализ' : 'Проанализировать риски')}
        </button>
        <button className='ai-connect-button' type='button' aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)}><Link2 size={14} />{t("Подключение ")}<ChevronDown size={13} /></button>
      </div>
    </section>

    {settingsOpen && <section className='card ai-settings'>
      <div><h3>{t("Подключение к ИИ-сервису")}</h3><p>{t("API-ключ хранится на сервере. Код доступа к демонстрации остаётся только в памяти этой вкладки.")}</p></div>
      <label>{t("Адрес сервера")}<input type='url' placeholder='https://your-server.example' value={urlDraft} onChange={event => setUrlDraft(event.target.value)} autoComplete='off' /></label>
      <label>{t("Код доступа")}<input ref={accessCodeInput} autoFocus={Boolean(accessPrompt)} type='password' value={accessCode} onChange={event => { setAccessCode(event.target.value); setConnectionError(null); }} autoComplete='off' placeholder={t("Только строка кода демонстрации")} /></label>
      <button className='btn btn--primary' type='button' onClick={connect} disabled={checking || pending}>{t("Проверить подключение")}</button>
      {connectionError && <p role='alert' className='ai-error'>{t(connectionError)}</p>}
      {accessPrompt && !canAnalyze && !connectionError && <p role='status'>{t(accessPrompt)}</p>}
      {canAnalyze && !checking && <p role='status' className='ai-connection-success'><ShieldCheck size={16} />{t("Доступ подтверждён. Можно запускать ИИ-анализ.")}</p>}
      {status?.configured && !canAnalyze && !checking && !connectionError && !accessPrompt && <p>{t("Сервер доступен. Введите код демонстрации и нажмите «Проверить подключение».")}</p>}
    </section>}

    {error && <div role='alert' className='ai-alert'><TriangleAlert size={18} /><span>{t(error)}</span></div>}
    {!canAnalyze && !pending && <div className='ai-connection-note'><BrainCircuit size={18} /><p>{t(checking ? 'Подключаемся к ИИ-сервису. Первый запуск после простоя может занять около минуты.' : connectionError ?? (base === null ? 'Для ИИ-прогноза подключите сервер OpenAI. Ниже доступна локальная оценка мощности.' : status?.configured ? 'Введите код демонстрации и подтвердите его кнопкой «Проверить подключение».' : 'Сервер OpenAI ещё не готов. Локальная оценка мощности работает независимо от него.'))}</p><button type='button' onClick={() => setSettingsOpen(true)}>{t("Подключить ")}<ArrowUpRight size={15} /></button></div>}

    {result && <section className='ai-result' aria-label={t("Результат анализа OpenAI")} aria-busy={pending}>
      <div className='ai-result-heading'><div><span className='ai-overline'>{t("ВЫВОД OPENAI")}</span><h2>{result.report.summary}</h2></div><span className='ai-report-time'><Clock3 size={14} />{t("Срез ")}{t(formatClock(result.input.elapsedSeconds))}<br />+{t(result.input.horizonMinutes)} {t(" мин")}</span></div>
      {oldResult && <p className='ai-stale'><RefreshCw size={15} />{t("Показатели смены или период прогноза изменились. Вывод относится к сохранённому срезу.")}</p>}
      <div className='ai-findings'>{result.report.findings.map((finding, index) => <article className={`ai-finding ai-finding--${finding.level}`} key={`${finding.stationId}-${index}`}>
        <div className='ai-finding-tags'><span>{t(kindLabels[finding.kind])}</span><span className={`ai-risk ai-risk--${finding.level}`}>{t(riskLabels[finding.level])}</span></div>
        <h3>{finding.title}</h3><dl><div><dt>{t("Основание")}</dt><dd>{finding.evidence}</dd></div><div><dt>{t("Прогноз")}</dt><dd>{finding.forecast}</dd></div><div><dt>{t("Действие")}</dt><dd>{finding.action}</dd></div></dl>
        <footer><span>{t("Уверенность: ")}{t(finding.confidence === 'low' ? 'низкая' : 'средняя')}</span>{finding.stationId !== 'line' && <button type='button' onClick={() => onStation(finding.stationId as StationId)}>{t(AI_STATION_NAMES[finding.stationId])} <ArrowUpRight size={14} /></button>}</footer>
      </article>)}</div>
      <div className='ai-next'><div><h3>{t("Следующие действия")}</h3><ol>{result.report.nextSteps.map((step, index) => <li key={index}>{step}</li>)}</ol></div><a className='btn' href={pageHref('decisions')}>{t("Сравнить решения ")}<ArrowUpRight size={16} /></a></div>
      <details className='ai-report-details'><summary>{t("Основания и границы анализа")}</summary><p>{result.report.limitation}</p><p>{t(result.input.includeCaseHistory ? 'Учтены тестовые данные организатора за 1–2 октября и текущая симуляция.' : 'Учтена текущая конфигурация; история организатора к ней не присоединялась.')} {t(" Автоматическое управление оборудованием не выполняется.")}</p><p>{t(result.model)} · {t(result.cached ? 'Повторно использован готовый ответ' : `Оценка расхода: $${result.usage.estimatedCostUsd.toFixed(4)}`)} · {t(result.usage.inputTokens + result.usage.outputTokens)} {t(" токенов")}</p></details>
    </section>}

    <section className='card ai-capacity' aria-label={t("Локальная оценка мощности")}>
      <div className='ai-section-heading'><div><span className='ai-overline'>{t("ТЕКУЩАЯ МОЩНОСТЬ")}</span><h2>{t("Где может накапливаться очередь")}</h2></div><span className='ai-local-label'>{t("Расчёт по циклам · без ИИ")}</span></div>
      <div className='ai-kpis'><div><span>{t("Требуемый темп до конца смены")}</span><strong>{t(number(indicators.requiredPerHour))} <small>{t("авто/ч")}</small></strong></div><div><span>{t("Максимальный выпуск без брака в час")}</span><strong>{t(number(indicators.lineCapacityPerHour))} <small>{t("авто/ч")}</small></strong></div><div><span>{t("Самый длинный цикл")}</span><strong>{t(AI_STATION_NAMES[indicators.bottleneckStationId])}</strong></div></div>
      {indicators.shiftEnded || indicators.ordersExhausted ? <p className='ai-neutral'>{t(indicators.shiftEnded ? 'Смена завершена. Для нового прогноза начните следующую смену.' : 'Заказы смены выполнены. Новый поток не ожидается.')}</p> : null}
      <div className='ai-capacity-table'><table><thead><tr><th>{t("Участок")}</th><th>{t("Мощность, авто/ч")}</th><th>{t("Машин в очереди сейчас")}</th><th>{t(`Машин в очереди через ${number(indicators.horizonMinutes)} мин`)}</th><th>{t("Когда очередь заполнится")}</th></tr></thead><tbody>
        {indicators.stations.map(station => <tr key={station.stationId}><th><button type='button' onClick={() => onStation(station.stationId)}>{t(AI_STATION_NAMES[station.stationId])}<ArrowUpRight size={13} /></button>{station.stopped && <small>{t("Остановлен сейчас")}</small>}</th><td>{t(number(station.capacityPerHour))}</td><td>{t(formatInt(station.queueNow))} / {t(input.stations.find(s => s.id === station.stationId)!.bufferCapacity)}</td><td><span className={`ai-risk ai-risk--${station.level}`}>{t(number(station.queueAtHorizon))} {t(" авто")}</span></td><td>{t(station.minutesToFull === null || station.minutesToFull > indicators.horizonMinutes ? `Не заполнится за ${number(indicators.horizonMinutes)} мин` : station.minutesToFull === 0 ? 'Свободных мест нет' : `Через ≈ ${number(station.minutesToFull)} мин`)}</td></tr>)}
      </tbody></table></div>
      <p className='ai-footnote'>{t("Оценка при неизменной подаче и длительности циклов, без будущих событий сценария. Не учитывает дискретное движение, восстановление после остановки и обратное влияние заполненных буферов.")}</p>
    </section>
  </div>;
}
