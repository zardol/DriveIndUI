import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { SessionStore } from './sessions.js';
import type { SessionSnapshot, SessionComparison } from '@kosta/shared';
import { advanceEngine, compareEngine, createEngine } from '@kosta/simulation';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

async function setup() {
  let clock = 1_700_000_000_000;
  const store = new SessionStore({ now: () => clock, ttlMs: 10_000, maxSessions: 2 });
  const app = await buildApp({ store, autoTick: false, publicDir: false });
  apps.push(app);
  const create = async () => (await app.inject({ method: 'POST', url: '/api/sessions', payload: {} })).json<SessionSnapshot>();
  return { app, store, create, advance: (ms: number) => { clock += ms; store.tick(); } };
}

describe('session API', () => {
  it('compares exact current state without changing the session and increments reset revisions', async () => {
    const { app, create, advance } = await setup();
    const s = await create();
    const url = `/api/sessions/${s.sessionId}`;
    await app.inject({ method: 'POST', url: `${url}/control`, payload: { action: 'setScenario', scenario: 'equipment' } });
    advance(4000);
    const before = (await app.inject(url)).json<SessionSnapshot>();
    const options = { maintenanceMinutes: 5, reserveSetupMinutes: 0 } as const;
    const response = await app.inject({ method: 'POST', url: `${url}/comparison`, payload: options });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const engine = createEngine({ scenario: 'equipment' }); advanceEngine(engine, 240);
    expect(response.json<SessionComparison>()).toEqual({ ...compareEngine(engine, options), sessionId: s.sessionId, revision: 1 });
    expect((await app.inject(url)).json()).toEqual(before);
    const reset = (await app.inject({ method: 'POST', url: `${url}/control`, payload: { action: 'reset' } })).json();
    expect(reset.revision).toBe(2);
  });

  it('rejects invalid comparison parameters and missing sessions', async () => {
    const { app, create } = await setup();
    const s = await create();
    for (const payload of [{}, { maintenanceMinutes: -5, reserveSetupMinutes: 0 }, { maintenanceMinutes: 5, reserveSetupMinutes: 1 }, { maintenanceMinutes: 5, reserveSetupMinutes: 0, extra: true }]) {
      expect((await app.inject({ method: 'POST', url: `/api/sessions/${s.sessionId}/comparison`, payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: '/api/sessions/missing/comparison', payload: { maintenanceMinutes: 5, reserveSetupMinutes: 0 } })).statusCode).toBe(404);
  });
  it('creates independent running sessions and applies commands only to their owner session', async () => {
    const { app, create, advance } = await setup();
    const a = await create(); const b = await create();
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(a).toMatchObject({ running: true, speed: 60, scenario: 'normal', elapsedSeconds: 0 });
    await app.inject({ method: 'POST', url: `/api/sessions/${a.sessionId}/control`, payload: { action: 'pause' } });
    advance(2000);
    const readA = (await app.inject(`/api/sessions/${a.sessionId}`)).json<SessionSnapshot>();
    const readB = (await app.inject(`/api/sessions/${b.sessionId}`)).json<SessionSnapshot>();
    expect(readA.elapsedSeconds).toBe(0);
    expect(readB.elapsedSeconds).toBe(120);
  });

  it('keeps speed and playback state on reset and scenario changes, without carrying previous history', async () => {
    const { app, create, advance } = await setup();
    const s = await create();
    const url = `/api/sessions/${s.sessionId}/control`;
    await app.inject({ method: 'POST', url, payload: { action: 'setSpeed', speed: 10 } });
    advance(3000);
    await app.inject({ method: 'POST', url, payload: { action: 'pause' } });
    const changed = (await app.inject({ method: 'POST', url, payload: { action: 'setScenario', scenario: 'equipment' } })).json<SessionSnapshot>();
    expect(changed).toMatchObject({ elapsedSeconds: 0, scenario: 'equipment', speed: 10, running: false });
    expect(changed.history).toHaveLength(1);
    const reset = (await app.inject({ method: 'POST', url, payload: { action: 'reset' } })).json<SessionSnapshot>();
    expect(reset.scenario).toBe('equipment');
    expect(reset.elapsedSeconds).toBe(0);
  });

  it('rejects malformed controls and unknown sessions, without mutating state', async () => {
    const { app, create } = await setup();
    const s = await create();
    for (const payload of [{ action: 'setSpeed', speed: -1 }, { action: 'setScenario', scenario: 'fake' }, { action: 'pause', extra: true }]) {
      const response = await app.inject({ method: 'POST', url: `/api/sessions/${s.sessionId}/control`, payload });
      expect(response.statusCode).toBe(400);
    }
    expect((await app.inject('/api/sessions/missing')).statusCode).toBe(404);
    expect((await app.inject(`/api/sessions/${s.sessionId}`)).json().running).toBe(true);
    expect((await app.inject('/api/unknown')).statusCode).toBe(404);
  });

  it('expires idle sessions and bounds memory instead of admitting unbounded sessions', async () => {
    const { app, create, advance } = await setup();
    const a = await create(); await create();
    expect((await app.inject({ method: 'POST', url: '/api/sessions', payload: {} })).statusCode).toBe(503);
    advance(10_000);
    expect((await app.inject(`/api/sessions/${a.sessionId}`)).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/sessions', payload: {} })).statusCode).toBe(201);
  });

  it('does not expose files or HTML from API paths and never caches snapshots', async () => {
    const { app, create } = await setup();
    const s = await create();
    const state = await app.inject(`/api/sessions/${s.sessionId}`);
    expect(state.headers['cache-control']).toBe('no-store');
    expect(state.headers['content-type']).toContain('application/json');
    const badJson = await app.inject({ method: 'POST', url: '/api/sessions', headers: { 'content-type': 'application/json' }, payload: '{' });
    expect(badJson.statusCode).toBe(400);
  });
});
