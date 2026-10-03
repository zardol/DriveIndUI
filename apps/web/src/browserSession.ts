import { createEngine, advanceEngine, getSnapshot, cloneEngine } from '@kosta/simulation';
import type { Engine } from '@kosta/simulation';
import type { ControlCommand, ScenarioId, SessionSnapshot, Speed } from '@kosta/shared';

export interface BrowserSessionOptions {
  now?: () => number;
  id?: string;
}

export class BrowserSession {
  private readonly _id: string;
  private readonly now: () => number;
  private engine: Engine;
  private scenario: ScenarioId;
  private running: boolean;
  private speed: Speed;
  private lastTick: number;
  private remainder: number;
  private revision = 0;

  constructor(options?: BrowserSessionOptions) {
    this._id = options?.id ?? (typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    this.now = options?.now ?? (() => performance.now());
    this.scenario = 'normal';
    this.engine = createEngine({ seed: 42, scenario: this.scenario });
    this.running = true;
    this.speed = 60;
    this.lastTick = this.now();
    this.remainder = 0;
  }

  get id(): string {
    return this._id;
  }

  private advance(): void {
    const currentNow = this.now();
    const deltaMs = Math.max(0, currentNow - this.lastTick);
    const wallSeconds = Math.min(5000, deltaMs) / 1000;
    this.lastTick = currentNow;

    if (!this.running) return;

    this.remainder += wallSeconds * this.speed;
    const wholeSeconds = Math.floor(this.remainder);
    this.remainder -= wholeSeconds;

    if (wholeSeconds > 0) {
      advanceEngine(this.engine, wholeSeconds);
    }

    const state = getSnapshot(this.engine);
    if (state.elapsedSeconds >= state.shiftSeconds) {
      this.running = false;
    }
  }

  private serialize(): SessionSnapshot {
    return {
      ...getSnapshot(this.engine),
      sessionId: this._id,
      revision: this.revision,
      running: this.running,
      speed: this.speed,
      updatedAt: new Date(Date.now()).toISOString(),
    };
  }

  snapshot(): SessionSnapshot {
    this.advance();
    return this.serialize();
  }

  fork(): { engine: Engine; sessionId: string; revision: number } {
    this.advance();
    return { engine: cloneEngine(this.engine), sessionId: this._id, revision: this.revision };
  }

  control(command: ControlCommand): SessionSnapshot {
    this.advance();
    switch (command.action) {
      case 'play': {
        const state = getSnapshot(this.engine);
        this.running = state.elapsedSeconds < state.shiftSeconds;
        break;
      }
      case 'pause': {
        this.running = false;
        break;
      }
      case 'setSpeed': {
        this.speed = command.speed;
        break;
      }
      case 'setScenario': {
        this.revision += 1;
        this.scenario = command.scenario;
        this.engine = createEngine({ seed: 42, scenario: this.scenario });
        this.remainder = 0;
        break;
      }
      case 'reset': {
        this.revision += 1;
        this.engine = createEngine({ seed: 42, scenario: this.scenario });
        this.remainder = 0;
        break;
      }
    }
    this.lastTick = this.now();
    return this.serialize();
  }
}
