import type { SessionComparison } from '@driveindui/shared';
import type { ComparisonJob, ComparisonReply } from './comparison.worker';
import { AbortedError, NetworkError } from './api';

/** Each request owns its worker; cancellation stops computation as well as delivery. */
export function runComparison(job: ComparisonJob, signal: AbortSignal): Promise<SessionComparison> {
  if (signal.aborted) return Promise.reject(new AbortedError());
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./comparison.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const fail = (error: Error) => { cleanup(); reject(error); };
    const abort = () => fail(new AbortedError());
    const timer = setTimeout(() => fail(new NetworkError('Расчёт занял слишком много времени. Повторите попытку.')), 15_000);
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = (event: MessageEvent<ComparisonReply>) => {
      if ('error' in event.data) return fail(new NetworkError(event.data.error));
      cleanup();
      resolve(event.data.result);
    };
    worker.onerror = () => fail(new NetworkError('Не удалось запустить расчёт на устройстве. Повторите попытку.'));
    worker.onmessageerror = () => fail(new NetworkError('Не удалось прочитать результат расчёта.'));
    try { worker.postMessage(job); } catch { fail(new NetworkError('Не удалось передать состояние линии для расчёта.')); }
  });
}
