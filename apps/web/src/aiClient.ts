import { AI_MODEL, type AiAnalysis, type AiInput, type AiStatus } from '@driveindui/shared';
import { BROWSER_MODE } from './runtimeMode';

export function normalizeAiUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Укажите HTTPS-адрес сервера. HTTP разрешён только для localhost.');
  }
  return url.href.replace(/\/$/, '');
}
export function defaultAiUrl(): string | null {
  const configured = import.meta.env.VITE_AI_API_URL as string | undefined;
  if (configured) { try { return normalizeAiUrl(configured); } catch { return null; } }
  if (!BROWSER_MODE) return '';
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) return 'http://127.0.0.1:3001';
  return null;
}
export function normalizeAiAccessCode(value: string): string {
  return value.replace(/[\s\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
}
export class AiRequestError extends Error {
  constructor(message: string, public readonly code: string) { super(message); }
}
async function callAi(base: string, path: string, signal: AbortSignal, body?: AiInput, accessCode?: string): Promise<unknown> {
  const code = normalizeAiAccessCode(accessCode ?? '');
  if (code.startsWith('sk-')) throw new AiRequestError('Это ключ OpenAI. Введите отдельный код доступа к демонстрации; API-ключ хранится только на сервере.', 'AI_ACCESS_INVALID');
  if (code && !/^[A-Za-z0-9_-]{1,256}$/.test(code)) throw new AiRequestError('Вставьте только строку кода доступа, без заголовка и инструкции из файла.', 'AI_ACCESS_INVALID');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  signal.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, body ? 70_000 : 75_000);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (code) headers['X-AI-Access'] = code;
    const response = await fetch(`${base}/api/ai/${path}`, { method: body ? 'POST' : 'GET', headers,
      ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    let value: unknown;
    try { value = await response.json(); } catch { throw new Error('Сервер ИИ вернул некорректный ответ. Проверьте адрес подключения.'); }
    if (!response.ok) {
      const message = value && typeof value === 'object' && 'message' in value && typeof value.message === 'string' ? value.message : 'Анализ временно недоступен.';
      const errorCode = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'AI_REQUEST_FAILED';
      throw new AiRequestError(message, errorCode);
    }
    return value;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (controller.signal.aborted) throw new Error('Время ожидания истекло. Новый анализ можно запустить вручную.');
    if (error instanceof TypeError) throw new Error('Нет связи с сервером ИИ. Проверьте подключение.');
    throw error;
  } finally { window.clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}
export async function fetchAiStatus(base: string, signal: AbortSignal, accessCode = ''): Promise<AiStatus> {
  const value = await callAi(base, 'status', signal, undefined, accessCode);
  if (!value || typeof value !== 'object' || !('configured' in value) || typeof value.configured !== 'boolean'
    || !('accessRequired' in value) || typeof value.accessRequired !== 'boolean' || !('model' in value) || value.model !== AI_MODEL) {
    throw new Error('Этот адрес не является сервером ИИ DriveIndUI.');
  }
  // Older servers cannot confirm access: never turn availability into authorization.
  return { ...value, authorized: 'authorized' in value && value.authorized === true } as AiStatus;
}
export async function requestAiAnalysis(base: string, input: AiInput, accessCode: string, signal: AbortSignal): Promise<AiAnalysis> {
  const value = await callAi(base, 'analysis', signal, input, accessCode);
  if (!value || typeof value !== 'object') throw new Error('Некорректный ответ ИИ.');
  const result = value as Partial<AiAnalysis>;
  if (result.model !== AI_MODEL || !result.report || typeof result.report.summary !== 'string' || typeof result.report.limitation !== 'string'
    || !Array.isArray(result.report.findings) || result.report.findings.length > 4 || !result.report.findings.every(f =>
      f && ['line', 'welding', 'painting', 'assembly', 'quality'].includes(f.stationId)
      && ['low', 'medium', 'high'].includes(f.level) && ['low', 'medium'].includes(f.confidence)
      && ['downtime', 'bottleneck', 'plan', 'quality'].includes(f.kind)
      && [f.title, f.evidence, f.forecast, f.action].every(text => typeof text === 'string'))
    || !Array.isArray(result.report.nextSteps) || !result.report.nextSteps.every(step => typeof step === 'string')
    || !result.input || result.input.elapsedSeconds !== input.elapsedSeconds || result.input.horizonMinutes !== input.horizonMinutes
    || typeof result.createdAt !== 'string' || !result.usage || !Number.isFinite(result.usage.estimatedCostUsd)) {
    throw new Error('Ответ ИИ не прошёл проверку. Повторите анализ.');
  }
  return result as AiAnalysis;
}
