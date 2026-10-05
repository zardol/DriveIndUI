import { randomUUID } from 'node:crypto';
import { createCaseConfig } from '@driveindui/shared';
import { createEngine, advanceEngine, getSnapshot, compareEngine, type Engine } from '@driveindui/simulation';
import type { ComparisonOptions, SessionComparison, ControlCommand, ScenarioId, SessionSnapshot, Speed } from '@driveindui/shared';

interface Session {
  id: string;
  revision: number;
  engine: Engine;
  scenario: ScenarioId;
  running: boolean;
  speed: Speed;
  lastTick: number;
  lastAccess: number;
  remainder: number;
}

export class SessionError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) { super(message); }
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly options: { now?: () => number; ttlMs?: number; maxSessions?: number } = {}) {}
  private now() { return (this.options.now ?? Date.now)(); }

  create(): SessionSnapshot {
    this.expire();
    if (this.sessions.size >= (this.options.maxSessions ?? 50)) {
      throw new SessionError(503, 'SESSION_LIMIT', 'Стенд занят. Попробуйте открыть демонстрацию позднее.');
    }
    const now = this.now();
    const session: Session = {
      id: randomUUID(), engine: createEngine({ seed: 42, scenario: 'normal', config: createCaseConfig() }), scenario: 'normal',
      revision: 0, running: true, speed: 60, lastTick: now, lastAccess: now, remainder: 0,
    };
    this.sessions.set(session.id, session);
    return this.serialize(session);
  }

  get(id: string): SessionSnapshot {
    const session = this.find(id);
    this.advance(session);
    return this.serialize(session);
  }

  control(id: string, command: ControlCommand): SessionSnapshot {
    const session = this.find(id);
    this.advance(session);
    switch (command.action) {
      case 'play': session.running = getSnapshot(session.engine).elapsedSeconds < getSnapshot(session.engine).shiftSeconds; break;
      case 'pause': session.running = false; break;
      case 'setSpeed': session.speed = command.speed; break;
      case 'setScenario':
        session.revision += 1;
        session.scenario = command.scenario;
        session.engine = createEngine({ seed: 42, scenario: command.scenario, config: session.engine.config });
        session.remainder = 0;
        break;
      case 'reset':
        session.revision += 1;
        session.engine = createEngine({ seed: 42, scenario: session.scenario, config: session.engine.config });
        session.remainder = 0;
        break;
      case 'setConfiguration': {
        const next = createEngine({ seed: 42, scenario: session.scenario, config: command.config });
        session.engine = next;
        session.revision += 1;
        session.remainder = 0;
        session.running = false;
        break;
      }
    }
    session.lastTick = this.now();
    return this.serialize(session);
  }

  tick(): void {
    this.expire();
    for (const session of this.sessions.values()) this.advance(session);
  }

  compare(id: string, options: ComparisonOptions): SessionComparison {
    const session = this.find(id);
    this.advance(session);
    return { ...compareEngine(session.engine, options), sessionId: session.id, revision: session.revision };
  }

  get size() { return this.sessions.size; }

  private find(id: string): Session {
    this.expire();
    const session = this.sessions.get(id);
    if (!session) throw new SessionError(404, 'SESSION_NOT_FOUND', 'Демонстрационная сессия завершена. Начните новую.');
    session.lastAccess = this.now();
    return session;
  }

  private expire(): void {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccess >= (this.options.ttlMs ?? 30 * 60_000)) this.sessions.delete(id);
    }
  }

  private advance(session: Session): void {
    const now = this.now();
    // A sleeping laptop must not unexpectedly complete the entire demonstration on wake.
    const wallSeconds = Math.max(0, Math.min(5_000, now - session.lastTick)) / 1_000;
    session.lastTick = now;
    if (!session.running) return;
    session.remainder += wallSeconds * session.speed;
    const wholeSeconds = Math.floor(session.remainder);
    session.remainder -= wholeSeconds;
    if (wholeSeconds > 0) advanceEngine(session.engine, wholeSeconds);
    const state = getSnapshot(session.engine);
    if (state.elapsedSeconds >= state.shiftSeconds) session.running = false;
  }

  private serialize(session: Session): SessionSnapshot {
    return { ...getSnapshot(session.engine), sessionId: session.id, revision: session.revision, running: session.running, speed: session.speed, updatedAt: new Date(this.now()).toISOString() };
  }
}
