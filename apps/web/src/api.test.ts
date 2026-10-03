import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('browser transport', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_SIMULATION_MODE', 'browser');
    const storage = new Map<string, string>();
    vi.stubGlobal('window', { sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } });
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Browser mode must not use network'); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('creates one session for concurrent consumers and uses no HTTP API', async () => {
    const api = await import('./api');
    const [first, second] = await Promise.all([api.createSession(), api.createSession()]);
    expect(first.sessionId).toBe(second.sessionId);
    expect(api.getStoredSessionId()).toBe(first.sessionId);
    const signal = new AbortController().signal;
    const paused = await api.sendControl(first.sessionId, { action: 'pause' }, signal);
    expect(paused.running).toBe(false);
    expect((await api.fetchSession(first.sessionId, signal)).sessionId).toBe(first.sessionId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an expired tab id so the hook can restore with a new session', async () => {
    const api = await import('./api');
    await expect(api.fetchSession('previous-page-id', new AbortController().signal)).rejects.toMatchObject({ status: 404 });
    expect((await api.createSession()).sessionId).not.toBe('previous-page-id');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('an aborted command cannot mutate the browser simulation', async () => {
    const api = await import('./api');
    const first = await api.createSession();
    const controller = new AbortController();
    controller.abort();
    await expect(api.sendControl(first.sessionId, { action: 'setScenario', scenario: 'equipment' }, controller.signal)).rejects.toBeInstanceOf(api.AbortedError);
    expect((await api.fetchSession(first.sessionId, new AbortController().signal)).scenario).toBe('normal');
  });
});
