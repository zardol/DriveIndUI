import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AbortedError,
  HttpError,
  clearStoredSessionId,
  createSession,
  errorMessage,
  fetchSession,
  getStoredSessionId,
  sendControl,
  storeSessionId,
} from './api';
import type { ControlCommand, SessionSnapshot } from './types';

export type ConnectionState = 'connecting' | 'online' | 'lost';

export interface SessionApi {
  snapshot: SessionSnapshot | null;
  connection: ConnectionState;
  connectionError: string | null;
  lastSyncAt: number | null;
  pending: boolean;
  controlError: string | null;
  dismissControlError: () => void;
  sendCommand: (command: ControlCommand) => void;
  retryNow: () => void;
}

const POLL_INTERVAL_MS = 250;
const RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 3000, 5000];

export function useSession(): SessionApi {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);

  /** Растёт при каждом управляющем действии: опрос, начатый раньше, считается устаревшим. */
  const versionRef = useRef(0);
  const pendingRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const controlAbortRef = useRef<AbortController | null>(null);
  const retryRef = useRef<() => void>(() => undefined);

  const applySnapshot = useCallback((next: SessionSnapshot) => {
    sessionIdRef.current = next.sessionId;

    storeSessionId(next.sessionId);
    setSnapshot(next);
    setConnection('online');
    setConnectionError(null);
    setLastSyncAt(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;
    let failures = 0;

    const schedule = (delay: number): void => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void tick();
      }, delay);
    };

    const tick = async (): Promise<void> => {
      if (cancelled || inFlight) return;
      if (pendingRef.current) {
        // Пока выполняется команда, опрос приостановлен.
        schedule(POLL_INTERVAL_MS);
        return;
      }
      inFlight = true;
      const version = versionRef.current;
      const controller = new AbortController();
      pollAbortRef.current = controller;

      try {
        const knownId = sessionIdRef.current ?? getStoredSessionId();
        let next: SessionSnapshot;
        if (knownId === null) {
          next = await createSession();
        } else {
          try {
            next = await fetchSession(knownId, controller.signal);
          } catch (error) {
            if (error instanceof HttpError && error.status === 404) {
              sessionIdRef.current = null;
              clearStoredSessionId(knownId);
              next = await createSession();
            } else {
              throw error;
            }
          }
        }
        sessionIdRef.current = next.sessionId;
        if (cancelled) return;
        if (version === versionRef.current && !pendingRef.current) {
          failures = 0;
          applySnapshot(next);
        }
      } catch (error) {
        if (cancelled || error instanceof AbortedError) return;
        failures += 1;
        setConnectionError(errorMessage(error));
        setConnection('lost');
      } finally {
        inFlight = false;
        if (pollAbortRef.current === controller) pollAbortRef.current = null;
        if (!cancelled) {
          const delay =
            failures > 0
              ? (RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1] ?? 5000)
              : document.hidden ? 1000 : POLL_INTERVAL_MS;
          schedule(delay);
        }
      }
    };

    retryRef.current = () => schedule(0);
    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      pollAbortRef.current?.abort();
      controlAbortRef.current?.abort();
      retryRef.current = () => undefined;
    };
  }, [applySnapshot]);

  const sendCommand = useCallback(
    (command: ControlCommand): void => {
      if (pendingRef.current) return;
      const sessionId = sessionIdRef.current;
      if (sessionId === null) return;

      pendingRef.current = true;
      versionRef.current += 1;
      pollAbortRef.current?.abort();
      const controller = new AbortController();
      controlAbortRef.current = controller;
      setPending(true);
      setControlError(null);

      void (async () => {
        try {
          const next = await sendControl(sessionId, command, controller.signal);
          versionRef.current += 1;
          applySnapshot(next);
        } catch (error) {
          if (error instanceof AbortedError) return;
          if (error instanceof HttpError && error.status === 404) {
            sessionIdRef.current = null;
            clearStoredSessionId(sessionId);
            setControlError('Сессия не найдена на сервере. Создаём новую смену…');
          } else {
            setControlError(`Не удалось применить команду: ${errorMessage(error)}`);
          }
        } finally {
          if (controlAbortRef.current === controller) controlAbortRef.current = null;
          pendingRef.current = false;
          setPending(false);
        }
      })();
    },
    [applySnapshot],
  );

  const dismissControlError = useCallback(() => setControlError(null), []);
  const retryNow = useCallback(() => retryRef.current(), []);

  return {
    snapshot,
    connection,
    connectionError,
    lastSyncAt,
    pending,
    controlError,
    dismissControlError,
    sendCommand,
    retryNow,
  };
}
