/**
 * Deterministic discrete-time simulation of the KostaAllur production line.
 *
 * Time moves in fixed one-second ticks. advanceEngine(engine, n) runs exactly n ticks,
 * capped at the end of the shift. As a result, any way of splitting a time span into
 * calls gives the same state. The engine uses no wall clock, timers, I/O or unseeded
 * randomness.
 *
 * Each tick runs these phases in order:
 *   1. load  - idle, non-stopped stations take the next unit from their input buffer
 *   2. work  - every loaded, unfinished, non-stopped station does one second of work
 *   3. move  - finished units go downstream, starting with the last station; a unit
 *              stays (progress 1, blocked) if the next buffer is full; the quality
 *              station sends units out of the line as good or rejected (seeded RNG)
 *   4. supply - every SUPPLY_INTERVAL_SECONDS a new body is offered to welding and
 *              counted only if the buffer accepts it
 *   5. load  - stations load again, so snapshots show freshly started work
 * Then the clock moves forward and the scenario conditions for the new second are
 * applied (slowdowns, stops, incidents).
 *
 * A unit moved in phase 3 can only be worked on in the next tick. So one unit never
 * gets work at two stations in the same second.
 */
import { STATIONS } from '@kosta/shared';
import type {
  HistoryPoint,
  Incident,
  PlantSnapshot,
  ScenarioId,
  StationDefinition,
  StationId,
  StationSnapshot,
  StationStatus,
} from '@kosta/shared';
import { createRng, nextRandom } from './prng';
import type { RngState } from './prng';

/** Length of one shift in simulated seconds (8 hours). */
export const SHIFT_SECONDS = 28_800;
/** Planned good units for one shift. */
export const SHIFT_PLAN = 70;
/** A new body is offered to the welding input buffer every N simulated seconds. */
export const SUPPLY_INTERVAL_SECONDS = 240;
/** Bodies already waiting in the welding input buffer when the shift starts. */
export const INITIAL_QUEUED_UNITS = 1;
/** Probability that a car finishing quality control is rejected. */
export const QUALITY_REJECT_RATE = 0.03;
/** Spacing of history samples in simulated seconds. */
export const HISTORY_INTERVAL_SECONDS = 60;
export const DEFAULT_SEED = 42;
export const DEFAULT_SCENARIO: ScenarioId = 'normal';
/**
 * Integer work units a healthy station does per second. One car needs
 * cycleSeconds * WORK_UNITS_PER_SECOND units. 90 divides evenly by the scenario
 * slowdown factors (1.8 gives 50, 2 gives 45), so progress uses exact integer math
 * and never drifts from floating point accumulation.
 */
export const WORK_UNITS_PER_SECOND = 90;

const SCENARIO_IDS: readonly ScenarioId[] = ['normal', 'equipment', 'bottleneck'];
const SECONDS_PER_HOUR = 3600;
/** Nominal cycle of the slowest station; only used to cap the naive forecast. */
const NOMINAL_BOTTLENECK_CYCLE_SECONDS = STATIONS.reduce((max, s) => Math.max(max, s.cycleSeconds), 1);

export interface EngineOptions {
  seed?: number;
  scenario?: ScenarioId;
}

/**
 * A scheduled disturbance. It is active in [fromSeconds, toSeconds), or until the
 * end of the shift when toSeconds is null. Each event opens exactly one incident
 * when it becomes active and resolves it at toSeconds.
 */
export interface ScenarioEvent {
  readonly id: string;
  readonly stationId: StationId;
  readonly kind: 'slowdown' | 'stop';
  /** Cycle time multiplier for slowdowns (1.8 means 80% longer cycle). Ignored for stops. */
  readonly cycleFactor: number;
  readonly fromSeconds: number;
  readonly toSeconds: number | null;
  readonly severity: Incident['severity'];
  readonly title: string;
  readonly description: string;
}

export const SCENARIO_EVENTS: Readonly<Record<ScenarioId, readonly ScenarioEvent[]>> = {
  normal: [],
  equipment: [
    {
      id: 'equipment-painting-slowdown',
      stationId: 'painting',
      kind: 'slowdown',
      cycleFactor: 1.8,
      fromSeconds: 600,
      toSeconds: 1200,
      severity: 'warning',
      title: 'Замедление окрасочной установки',
      description: 'Износ оборудования: цикл окраски увеличен в 1,8 раза.',
    },
    {
      id: 'equipment-painting-stop',
      stationId: 'painting',
      kind: 'stop',
      cycleFactor: 1,
      fromSeconds: 1200,
      toSeconds: 2100,
      severity: 'critical',
      title: 'Остановка окрасочной установки',
      description: 'Окрасочная установка остановлена, требуется ремонт оборудования.',
    },
  ],
  bottleneck: [
    {
      id: 'bottleneck-assembly-capacity',
      stationId: 'assembly',
      kind: 'slowdown',
      cycleFactor: 2,
      fromSeconds: 600,
      toSeconds: null,
      severity: 'warning',
      title: 'Снижение мощности сборки',
      description: 'Цикл сборки увеличен вдвое, перед участком растёт очередь.',
    },
  ],
};

/** Mutable per-station state. Internal; read it only through getSnapshot. */
export interface EngineStationState {
  readonly def: StationDefinition;
  queue: number;
  inProcess: boolean;
  finished: boolean;
  workDone: number;
  readonly workRequired: number;
  completed: number;
  busySeconds: number;
  downtimeSeconds: number;
  stopped: boolean;
  cycleFactor: number;
}

/** Engine state. Treat it as opaque: use advanceEngine and getSnapshot. */
export interface Engine {
  readonly scenario: ScenarioId;
  readonly seed: number;
  elapsedSeconds: number;
  introducedUnits: number;
  goodUnits: number;
  rejectedUnits: number;
  readonly rng: RngState;
  readonly stations: EngineStationState[];
  readonly events: readonly ScenarioEvent[];
  readonly incidents: Incident[];
  readonly incidentIndexByEvent: Map<string, number>;
  readonly history: HistoryPoint[];
}

export function createEngine(options: EngineOptions = {}): Engine {
  const opts: EngineOptions = options ?? {};
  const seed = opts.seed ?? DEFAULT_SEED;
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new RangeError(`createEngine: seed must be a finite number, received ${String(seed)}`);
  }
  const scenario = opts.scenario ?? DEFAULT_SCENARIO;
  if (!SCENARIO_IDS.includes(scenario)) {
    throw new RangeError(`createEngine: unknown scenario ${String(scenario)}`);
  }

  const stations: EngineStationState[] = STATIONS.map((def) => ({
    def,
    queue: 0,
    inProcess: false,
    finished: false,
    workDone: 0,
    workRequired: def.cycleSeconds * WORK_UNITS_PER_SECOND,
    completed: 0,
    busySeconds: 0,
    downtimeSeconds: 0,
    stopped: false,
    cycleFactor: 1,
  }));

  const engine: Engine = {
    scenario,
    seed,
    elapsedSeconds: 0,
    introducedUnits: 0,
    goodUnits: 0,
    rejectedUnits: 0,
    rng: createRng(seed),
    stations,
    events: SCENARIO_EVENTS[scenario],
    incidents: [],
    incidentIndexByEvent: new Map<string, number>(),
    history: [],
  };

  const first = stations[0];
  if (first) {
    first.queue = Math.min(INITIAL_QUEUED_UNITS, first.def.bufferCapacity);
    engine.introducedUnits = first.queue;
  }

  applyConditions(engine);
  engine.history.push(historyPoint(engine));
  return engine;
}

export function advanceEngine(engine: Engine, seconds: number): void {
  if (typeof seconds !== 'number') {
    throw new TypeError(`advanceEngine: seconds must be a number, received ${typeof seconds}`);
  }
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds) || seconds < 0) {
    throw new RangeError(`advanceEngine: seconds must be a non-negative integer, received ${String(seconds)}`);
  }
  const steps = Math.min(seconds, SHIFT_SECONDS - engine.elapsedSeconds);
  for (let i = 0; i < steps; i += 1) {
    tick(engine);
  }
}

export function getSnapshot(engine: Engine): PlantSnapshot {
  const elapsed = engine.elapsedSeconds;
  const hours = elapsed / SECONDS_PER_HOUR;
  const stations: StationSnapshot[] = engine.stations.map((st) => ({
    id: st.def.id,
    name: st.def.name,
    status: stationStatus(st),
    inputQueue: st.queue,
    bufferCapacity: st.def.bufferCapacity,
    inProcess: st.inProcess,
    progress: st.inProcess ? clamp(st.workDone / st.workRequired, 0, 1) : 0,
    cycleSeconds: effectiveCycleSeconds(st),
    completed: st.completed,
    utilizationPercent: elapsed > 0 ? round2(clamp((st.busySeconds / elapsed) * 100, 0, 100)) : 0,
    downtimeSeconds: st.downtimeSeconds,
    throughputPerHour: elapsed > 0 ? round2(st.completed / hours) : 0,
  }));
  const finished = engine.goodUnits + engine.rejectedUnits;
  const wip = workInProgress(engine);
  return {
    scenario: engine.scenario,
    elapsedSeconds: elapsed,
    shiftSeconds: SHIFT_SECONDS,
    shiftPlan: SHIFT_PLAN,
    introducedUnits: engine.introducedUnits,
    goodUnits: engine.goodUnits,
    rejectedUnits: engine.rejectedUnits,
    wip,
    forecastUnits: forecastUnits(engine, wip),
    qualityPercent: finished > 0 ? round2(clamp((engine.goodUnits / finished) * 100, 0, 100)) : null,
    throughputPerHour: elapsed > 0 ? round2(engine.goodUnits / hours) : 0,
    downtimeSeconds: stations.reduce((sum, s) => sum + s.downtimeSeconds, 0),
    stations,
    incidents: engine.incidents.map((incident) => ({ ...incident })),
    history: engine.history.map((point) => ({ ...point })),
  };
}

function tick(engine: Engine): void {
  const { stations } = engine;

  // 1. load (matters for the initial state and right after a stop ends)
  loadStations(stations);

  // 2. work: at most one second of work per station
  for (const st of stations) {
    if (st.stopped) {
      st.downtimeSeconds += 1;
      continue;
    }
    if (st.inProcess && !st.finished) {
      st.workDone += workRate(st);
      st.busySeconds += 1;
      if (st.workDone >= st.workRequired) {
        st.workDone = st.workRequired;
        st.finished = true;
      }
    }
  }

  // 3. move: last station first so space freed downstream can be used this tick
  for (let i = stations.length - 1; i >= 0; i -= 1) {
    const st = stations[i];
    if (!st || st.stopped || !st.inProcess || !st.finished) continue;
    const next = stations[i + 1];
    if (next) {
      if (next.queue >= next.def.bufferCapacity) continue; // blocked, waits at progress 1
      next.queue += 1;
    } else if (nextRandom(engine.rng) < QUALITY_REJECT_RATE) {
      engine.rejectedUnits += 1;
    } else {
      engine.goodUnits += 1;
    }
    st.completed += 1;
    st.inProcess = false;
    st.finished = false;
    st.workDone = 0;
  }

  // 4. supply
  const nextElapsed = engine.elapsedSeconds + 1;
  const first = stations[0];
  if (first && nextElapsed % SUPPLY_INTERVAL_SECONDS === 0 && first.queue < first.def.bufferCapacity) {
    first.queue += 1;
    engine.introducedUnits += 1;
  }

  // 5. load again so freshly transferred units start in the next second
  loadStations(stations);

  engine.elapsedSeconds = nextElapsed;
  applyConditions(engine);
  recordHistory(engine);
}

function loadStations(stations: EngineStationState[]): void {
  for (const st of stations) {
    if (!st.stopped && !st.inProcess && st.queue > 0) {
      st.queue -= 1;
      st.inProcess = true;
      st.finished = false;
      st.workDone = 0;
    }
  }
}

/** Applies the scenario conditions for the current elapsed second and updates incidents. */
function applyConditions(engine: Engine): void {
  const t = engine.elapsedSeconds;
  for (const st of engine.stations) {
    st.stopped = false;
    st.cycleFactor = 1;
  }
  for (const event of engine.events) {
    const active = t >= event.fromSeconds && (event.toSeconds === null || t < event.toSeconds);
    if (active) {
      const st = engine.stations.find((s) => s.def.id === event.stationId);
      if (st) {
        if (event.kind === 'stop') st.stopped = true;
        else st.cycleFactor = Math.max(st.cycleFactor, event.cycleFactor);
      }
    }
    const index = engine.incidentIndexByEvent.get(event.id);
    if (active && index === undefined) {
      engine.incidentIndexByEvent.set(event.id, engine.incidents.length);
      engine.incidents.push({
        id: event.id,
        stationId: event.stationId,
        severity: event.severity,
        title: event.title,
        description: event.description,
        startedAtSeconds: event.fromSeconds,
        resolvedAtSeconds: null,
      });
    } else if (!active && index !== undefined) {
      const incident = engine.incidents[index];
      if (incident && incident.resolvedAtSeconds === null && event.toSeconds !== null && t >= event.toSeconds) {
        incident.resolvedAtSeconds = event.toSeconds;
      }
    }
  }
}

function recordHistory(engine: Engine): void {
  const t = engine.elapsedSeconds;
  if (t % HISTORY_INTERVAL_SECONDS !== 0 && t !== SHIFT_SECONDS) return;
  const last = engine.history[engine.history.length - 1];
  if (last && last.elapsedSeconds === t) return;
  engine.history.push(historyPoint(engine));
}

function historyPoint(engine: Engine): HistoryPoint {
  return {
    elapsedSeconds: engine.elapsedSeconds,
    goodUnits: engine.goodUnits,
    planUnits: round2((SHIFT_PLAN * engine.elapsedSeconds) / SHIFT_SECONDS),
    wip: workInProgress(engine),
  };
}

function workInProgress(engine: Engine): number {
  let wip = 0;
  for (const st of engine.stations) {
    wip += st.queue + (st.inProcess ? 1 : 0);
  }
  return wip;
}

/** Precedence: stopped > blocked > warning (affected and actually working) > running > idle. */
function stationStatus(st: EngineStationState): StationStatus {
  if (st.stopped) return 'stopped';
  if (st.inProcess && st.finished) return 'blocked';
  if (st.inProcess) return st.cycleFactor > 1 ? 'warning' : 'running';
  return 'idle';
}

function workRate(st: EngineStationState): number {
  return Math.max(1, Math.round(WORK_UNITS_PER_SECOND / st.cycleFactor));
}

function effectiveCycleSeconds(st: EngineStationState): number {
  return Math.round(st.workRequired / workRate(st));
}

/**
 * Naive current-rate forecast: good units so far scaled to the full shift. It uses
 * only the past (no knowledge of scheduled scenario events). The result is clamped
 * between the units already produced and a physical ceiling: current WIP plus what
 * the nominal bottleneck could still finish in the remaining time.
 */
function forecastUnits(engine: Engine, wip: number): number {
  const elapsed = engine.elapsedSeconds;
  const good = engine.goodUnits;
  if (elapsed <= 0) return good;
  const remaining = SHIFT_SECONDS - elapsed;
  if (remaining <= 0) return good;
  const projected = (good / elapsed) * SHIFT_SECONDS;
  const ceiling = good + wip + Math.floor(remaining / NOMINAL_BOTTLENECK_CYCLE_SECONDS);
  return Math.round(clamp(projected, good, ceiling));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
