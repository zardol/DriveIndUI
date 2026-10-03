import type { ApiError, ControlCommand, SessionSnapshot } from './types';

const SESSION_STORAGE_KEY = 'kostaallur.sessionId';
const REQUEST_TIMEOUT_MS = 8000;

/** Сервер ответил кодом ошибки. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/** Нет связи, таймаут или некорректный ответ. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Запрос отменён вызывающей стороной. */
export class AbortedError extends Error {
  constructor() {
    super('Запрос отменён');
    this.name = 'AbortedError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpError || error instanceof NetworkError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Неизвестная ошибка';
}

export function getStoredSessionId(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeSessionId(sessionId: string): void {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // sessionStorage может быть недоступен (приватный режим) — работаем без восстановления.
  }
}

export function clearStoredSessionId(expected?: string): void {
  try {
    if (expected === undefined || window.sessionStorage.getItem(SESSION_STORAGE_KEY) === expected) {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // см. выше
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: string;
  signal?: AbortSignal;
}

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const controller = new AbortController();
  const external = options.signal;
  let timedOut = false;

  const onExternalAbort = (): void => controller.abort();
  if (external) {
    if (external.aborted) throw new AbortedError();
    external.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body,
      cache: 'no-store',
      signal: controller.signal,
    });

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!response.ok) {
      const apiError = (typeof body === 'object' && body !== null ? body : {}) as Partial<ApiError>;
      throw new HttpError(
        response.status,
        apiError.message ?? `Сервер вернул ошибку ${response.status}`,
        apiError.error ?? null,
      );
    }
    if (body === null) {
      throw new NetworkError('Сервер вернул пустой или некорректный ответ');
    }
    return body;
  } catch (error) {
    if (error instanceof HttpError || error instanceof NetworkError) throw error;
    if (timedOut) throw new NetworkError('Превышено время ожидания ответа сервера');
    if (external?.aborted) throw new AbortedError();
    throw new NetworkError('Нет связи с сервером симуляции');
  } finally {
    window.clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

function parseSnapshot(value: unknown): SessionSnapshot {
  if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;
    if (
      typeof v.sessionId === 'string' &&
      typeof v.running === 'boolean' &&
      typeof v.elapsedSeconds === 'number' &&
      typeof v.shiftSeconds === 'number' &&
      Array.isArray(v.stations) &&
      Array.isArray(v.history) &&
      Array.isArray(v.incidents)
    ) {
      return value as SessionSnapshot;
    }
  }
  throw new NetworkError('Сервер вернул данные неожиданного формата');
}

let creation: Promise<SessionSnapshot> | null = null;

/**
 * Создание сессии с единым полётом (single flight) на уровне модуля:
 * повторные вызовы (в том числе из-за StrictMode) получают тот же промис.
 * Запрос намеренно не отменяется при размонтировании, чтобы не плодить сессии-сироты;
 * идентификатор сохраняется в sessionStorage сразу после ответа.
 */
export function createSession(): Promise<SessionSnapshot> {
  if (creation) return creation;
  const pending = request('/api/sessions', { method: 'POST', body: '{}' })
    .then(parseSnapshot)
    .then((snapshot) => {
      storeSessionId(snapshot.sessionId);
      return snapshot;
    });
  creation = pending.finally(() => {
    creation = null;
  });
  return creation;
}

export async function fetchSession(sessionId: string, signal: AbortSignal): Promise<SessionSnapshot> {
  return parseSnapshot(await request(`/api/sessions/${encodeURIComponent(sessionId)}`, { signal }));
}

export async function sendControl(
  sessionId: string,
  command: ControlCommand,
  signal: AbortSignal,
): Promise<SessionSnapshot> {
  return parseSnapshot(
    await request(`/api/sessions/${encodeURIComponent(sessionId)}/control`, {
      method: 'POST',
      body: JSON.stringify(command),
      signal,
    }),
  );
}
