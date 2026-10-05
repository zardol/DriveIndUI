import { describe, it, expect } from 'vitest';
import { BrowserSession } from './browserSession';
import { createEngine, advanceEngine, getSnapshot } from '@driveindui/simulation';
import { DEFAULT_PRODUCTION_CONFIG, createCaseConfig } from '@driveindui/shared';

describe('BrowserSession', () => {
  it('applies an isolated configuration on pause and retains it across resets, scenarios and forks', () => {
    let now = 0;
    const session = new BrowserSession({ now: () => now, id: 'configured' });
    session.control({ action: 'setSpeed', speed: 10 });
    now = 5000;
    const config = structuredClone(DEFAULT_PRODUCTION_CONFIG);
    config.name = 'Короткая смена'; config.shiftSeconds = 61; config.shiftPlan = 4; config.conveyorSpeed = 0.3;
    const applied = session.control({ action: 'setConfiguration', config });
    expect(applied).toMatchObject({ revision: 1, elapsedSeconds: 0, running: false, speed: 10, config });
    config.shiftPlan = 999;
    applied.config.stations[0].cycleSeconds = 999;
    now += 5000;
    expect(session.snapshot()).toMatchObject({ elapsedSeconds: 0, shiftPlan: 4 });
    expect(session.snapshot().config.stations[0].cycleSeconds).toBe(240);
    expect(session.control({ action: 'reset' })).toMatchObject({ revision: 2, config: { shiftSeconds: 61, shiftPlan: 4 } });
    expect(session.control({ action: 'setScenario', scenario: 'equipment' })).toMatchObject({ revision: 3, config: { shiftSeconds: 61 } });
    const fork = session.fork(); fork.engine.config.shiftPlan = 500;
    expect(session.snapshot().shiftPlan).toBe(4);
    const before = session.snapshot();
    expect(() => session.control({ action: 'setConfiguration', config: { ...config, conveyorSpeed: 0 } })).toThrow(RangeError);
    expect(session.snapshot()).toEqual({ ...before, updatedAt: expect.any(String) });
    session.control({ action: 'play' });
    now += 5000; session.snapshot(); now += 5000;
    expect(session.snapshot()).toMatchObject({ elapsedSeconds: 61, running: false, history: expect.arrayContaining([expect.objectContaining({ elapsedSeconds: 61, planUnits: 4 })]) });
  });
  it('forks current state without sharing mutable engine data and identifies resets at the same time', () => {
    let now = 0;
    const session = new BrowserSession({ now: () => now, id: 'fork' });
    now = 2000;
    const fork = session.fork();
    expect(fork.engine.elapsedSeconds).toBe(120);
    expect(fork.revision).toBe(0);
    advanceEngine(fork.engine, 28_800);
    fork.engine.incidents.push({ id: 'injected', stationId: 'painting', severity: 'critical', title: '', description: '', startedAtSeconds: 0, resolvedAtSeconds: null });
    expect(session.snapshot()).toMatchObject({ elapsedSeconds: 120, goodUnits: 0, incidents: [] });
    expect(session.control({ action: 'reset' })).toMatchObject({ elapsedSeconds: 0, revision: 1 });
    expect(session.control({ action: 'reset' })).toMatchObject({ elapsedSeconds: 0, revision: 2 });
    expect(session.control({ action: 'setScenario', scenario: 'equipment' })).toMatchObject({ revision: 3 });
    expect(session.control({ action: 'pause' }).revision).toBe(3);
  });
  it.each(['normal', 'equipment', 'bottleneck'] as const)('matches the complete engine trajectory for %s', (scenario) => {
    let now = 0;
    const session = new BrowserSession({ now: () => now, id: 'equivalence' });
    session.control({ action: 'setScenario', scenario });
    const engine = createEngine({ seed: 42, scenario, config: createCaseConfig() });
    for (let step = 0; step < 96; step++) {
      now += 5000;
      advanceEngine(engine, 300);
      expect(session.snapshot()).toMatchObject(getSnapshot(engine));
    }
    expect(session.snapshot().running).toBe(false);
  });
  it('equivalence with engine at known elapsed', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-1' });

    currentTime = 1000;
    const snap = session.snapshot();

    const expectedEngine = createEngine({ seed: 42, scenario: 'normal', config: createCaseConfig() });
    advanceEngine(expectedEngine, 60);
    const expectedSnap = getSnapshot(expectedEngine);

    expect(snap).toMatchObject(expectedSnap);
    expect(snap.elapsedSeconds).toBe(60);
  });

  it('fractional time at speed1', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-2' });
    session.control({ action: 'setSpeed', speed: 1 });

    currentTime = 500;
    expect(session.snapshot().elapsedSeconds).toBe(0);

    currentTime = 1000;
    expect(session.snapshot().elapsedSeconds).toBe(1);

    currentTime = 1400;
    expect(session.snapshot().elapsedSeconds).toBe(1);

    currentTime = 1600;
    expect(session.snapshot().elapsedSeconds).toBe(1);

    currentTime = 2000;
    expect(session.snapshot().elapsedSeconds).toBe(2);
  });

  it('pause/resume no catchup', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-3' });
    session.control({ action: 'setSpeed', speed: 1 });

    currentTime = 1000;
    expect(session.snapshot().elapsedSeconds).toBe(1);

    session.control({ action: 'pause' });
    currentTime = 5000;
    expect(session.snapshot().elapsedSeconds).toBe(1);

    session.control({ action: 'play' });
    currentTime = 6000;
    expect(session.snapshot().elapsedSeconds).toBe(2);
  });

  it('speed transitions', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-4' });

    currentTime = 1000;
    expect(session.snapshot().elapsedSeconds).toBe(60);

    session.control({ action: 'setSpeed', speed: 10 });
    currentTime = 2000;
    expect(session.snapshot().elapsedSeconds).toBe(70);
  });

  it('scenarios/reset preserving states', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-5' });
    session.control({ action: 'setSpeed', speed: 10 });
    session.control({ action: 'pause' });

    session.control({ action: 'setScenario', scenario: 'bottleneck' });
    const snap = session.snapshot();
    expect(snap.scenario).toBe('bottleneck');
    expect(snap.speed).toBe(10);
    expect(snap.running).toBe(false);
    expect(snap.elapsedSeconds).toBe(0);

    session.control({ action: 'play' });
    currentTime = 1000;
    expect(session.snapshot().elapsedSeconds).toBe(10);

    session.control({ action: 'reset' });
    const snap2 = session.snapshot();
    expect(snap2.scenario).toBe('bottleneck');
    expect(snap2.speed).toBe(10);
    expect(snap2.running).toBe(true);
    expect(snap2.elapsedSeconds).toBe(0);
  });

  it('shift completion and replay', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-6' });

    const engine = createEngine({ seed: 42, scenario: 'normal' });
    const expectedSnap = getSnapshot(engine);
    const shiftSeconds = expectedSnap.shiftSeconds;

    for (let second = 0; second <= shiftSeconds / 60; second++) {
      currentTime += 1000;
      session.snapshot();
    }
    const snap = session.snapshot();

    expect(snap.elapsedSeconds).toBe(shiftSeconds);
    expect(snap.running).toBe(false);

    const playSnap = session.control({ action: 'play' });
    expect(playSnap.running).toBe(false);

    session.control({ action: 'reset' });
    expect(session.snapshot().elapsedSeconds).toBe(0);
    expect(session.snapshot().running).toBe(false);
  });

  it('capped sleepdelta', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-7' });

    currentTime = 100000;
    const snap = session.snapshot();

    expect(snap.elapsedSeconds).toBe(300);
  });

  it('snapshot mutation isolation', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-8' });
    const snap1 = session.snapshot();
    snap1.elapsedSeconds = 9999;
    snap1.running = false;
    snap1.stations[0].inputQueue = 99;
    snap1.history[0].goodUnits = 99;

    const snap2 = session.snapshot();
    expect(snap2.elapsedSeconds).toBe(0);
    expect(snap2.running).toBe(true);
    expect(snap2.stations[0].inputQueue).not.toBe(99);
    expect(snap2.history[0].goodUnits).not.toBe(99);
  });

  it('independent instances', () => {
    let time1 = 0;
    const session1 = new BrowserSession({ now: () => time1, id: 'sess-1' });

    let time2 = 0;
    const session2 = new BrowserSession({ now: () => time2, id: 'sess-2' });

    time1 = 1000;
    expect(session1.snapshot().elapsedSeconds).toBe(60);
    expect(session2.snapshot().elapsedSeconds).toBe(0);
  });

  it('negative clock delta safely ignored', () => {
    let currentTime = 1000;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-9' });
    currentTime = 500;
    const snap = session.snapshot();
    expect(snap.elapsedSeconds).toBe(0);
  });

  it('repeated same timestamp idempotent', () => {
    let currentTime = 0;
    const session = new BrowserSession({ now: () => currentTime, id: 'test-10' });
    currentTime = 1000;
    expect(session.snapshot().elapsedSeconds).toBe(60);
    expect(session.snapshot().elapsedSeconds).toBe(60);
  });
});
