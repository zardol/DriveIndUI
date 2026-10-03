import { useEffect, useRef, useState } from 'react';
import type { ComparisonOptions, SessionComparison, SessionSnapshot } from '@kosta/shared';
import { AbortedError, compareSession, errorMessage } from '../api';
import { ComparisonPanel } from './ComparisonPanel';

/** Parent keys this component by session id + revision: reset cancels and discards old results. */
export function ComparisonSection({ snapshot, disabled }: { snapshot: SessionSnapshot; disabled: boolean }) {
  const [result, setResult] = useState<SessionComparison | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  const compare = (options: ComparisonOptions) => {
    if (disabled || request.current || snapshot.elapsedSeconds >= snapshot.shiftSeconds) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    void compareSession(snapshot.sessionId, options, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      if (next.sessionId !== snapshot.sessionId || next.revision !== snapshot.revision) {
        setError('Смена изменилась. Повторите расчёт для нового состояния.');
        return;
      }
      setResult(next);
    }).catch(reason => {
      if (!controller.signal.aborted && !(reason instanceof AbortedError)) setError(errorMessage(reason));
    }).finally(() => {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPending(false);
    });
  };
  return <ComparisonPanel snapshot={snapshot} result={result} pending={pending} error={error} disabled={disabled} onCompare={compare} />;
}
