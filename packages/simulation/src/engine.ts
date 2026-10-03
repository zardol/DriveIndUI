/**
 * Deterministic one-second accumulating conveyor; no wall clock or unseeded RNG.
 * Tick order: work -> release -> move front to back -> load -> exit -> supply.
 * Arrivals can start work only next tick. Vehicles retain their ID and distance
 * through every stage; station queues are derived from the active vehicle list.
 */
import { STATIONS, CONVEYOR_SPEC } from '@kosta/shared';
import type {
  HistoryPoint,
  Incident,
  PlantSnapshot,
  ScenarioId,
  StationDefinition,
  StationId,
  StationSnapshot,
  StationStatus,
  ConveyorSnapshot
} from '@kosta/shared';
import { createRng, nextRandom } from './prng';
import type { RngState } from './prng';

export const SHIFT_SECONDS = 28_800;
export const SHIFT_PLAN = 70;
export const SUPPLY_INTERVAL_SECONDS = 240;
export const INITIAL_QUEUED_UNITS = 1;
export const QUALITY_REJECT_RATE = 0.03;
export const HISTORY_INTERVAL_SECONDS = 60;
export const DEFAULT_SEED = 42;
export const DEFAULT_SCENARIO: ScenarioId = 'normal';
export const WORK_UNITS_PER_SECOND = 90;

const SCENARIO_IDS: readonly ScenarioId[] = ['normal', 'equipment', 'bottleneck'];
const SECONDS_PER_HOUR = 3600;
const NOMINAL_BOTTLENECK_CYCLE_SECONDS = STATIONS.reduce((max, s) => Math.max(max, s.cycleSeconds), 1);

export interface EngineOptions {
  seed?: number;
  scenario?: ScenarioId;
}

export interface ScenarioEvent {
  readonly id: string;
  readonly stationId: StationId;
  readonly kind: 'slowdown' | 'stop';
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
  capacityMultiplier: number;
  activeVehicleId: string | null;
}

export interface EngineVehicle {
  id: string;
  serial: number;
  distance: number;
  stageIndex: number;
  actualLastSpeed: number;
  outcome: 'pending' | 'good' | 'rejected';
}

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
  readonly vehicles: EngineVehicle[];
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
    capacityMultiplier: 1,
    activeVehicleId: null,
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
    vehicles: [],
  };

  const first = stations[0];
  if (first) {
    first.queue = INITIAL_QUEUED_UNITS;
    engine.introducedUnits = INITIAL_QUEUED_UNITS;
    engine.vehicles.push({
      id: `KA-0001`,
      serial: 1,
      distance: 0,
      stageIndex: 0,
      actualLastSpeed: 0,
      outcome: 'pending',
    });
  }

  applyConditions(engine);
  engine.history.push(historyPoint(engine));
  return engine;
}

export function cloneEngine(engine: Engine): Engine {
  return structuredClone(engine);
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

  const stations: StationSnapshot[] = engine.stations.map((st, i) => {
    const assigned = engine.vehicles.filter(v => v.stageIndex === i && v.id !== st.activeVehicleId);
    const queuedUnits = assigned.filter(v => v.actualLastSpeed === 0).length;
    const arrivingUnits = assigned.filter(v => v.actualLastSpeed > 0).length;

    return {
      id: st.def.id,
      name: st.def.name,
      status: stationStatus(st),
      inputQueue: st.queue,
      queuedUnits,
      arrivingUnits,
      bufferCapacity: st.def.bufferCapacity,
      inProcess: st.inProcess,
      progress: st.inProcess ? clamp(st.workDone / st.workRequired, 0, 1) : 0,
      cycleSeconds: effectiveCycleSeconds(st),
      completed: st.completed,
      utilizationPercent: elapsed > 0 ? round2(clamp((st.busySeconds / elapsed) * 100, 0, 100)) : 0,
      downtimeSeconds: st.downtimeSeconds,
      throughputPerHour: elapsed > 0 ? round2(st.completed / hours) : 0,
    };
  });

  const finished = engine.goodUnits + engine.rejectedUnits;
  const wip = workInProgress(engine);

  const conveyor: ConveyorSnapshot = {
    length: CONVEYOR_SPEC.length,
    stationDistances: [...CONVEYOR_SPEC.stationDistances],
    nominalSpeed: CONVEYOR_SPEC.speed,
    minSpacing: CONVEYOR_SPEC.minSpacing,
    vehicles: engine.vehicles.map(v => {
      let appearance: 'body' | 'painted' | 'assembled' = 'body';
      if (v.stageIndex >= 3) appearance = 'assembled';
      else if (v.stageIndex >= 2) appearance = 'painted';

      const state = v.actualLastSpeed > 0 ? 'moving' :
                    engine.stations.some(st => st.activeVehicleId === v.id) ?
                      (engine.stations.find(st => st.activeVehicleId === v.id)!.finished ? 'blocked' : 'processing') :
                    'queued';

      let stage: StationId | 'outbound' = 'outbound';
      if (v.stageIndex < STATIONS.length) {
        stage = STATIONS[v.stageIndex].id;
      }

      return {
        id: v.id,
        serial: v.serial,
        distance: v.distance,
        speed: v.actualLastSpeed,
        stage,
        state,
        appearance,
        outcome: v.outcome
      };
    })
  };

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
    conveyor,
  };
}

function tick(engine: Engine): void {
  // 1. Work on currently loaded stations
  for (const st of engine.stations) {
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

  // 2. Try to release finished vehicles
  for (let i = engine.stations.length - 1; i >= 0; i--) {
    const st = engine.stations[i];
    if (st.stopped || !st.inProcess || !st.finished) continue;

    const activeId = st.activeVehicleId;
    const v = engine.vehicles.find(v => v.id === activeId);
    if (!v) continue;

    const nextStage = v.stageIndex + 1;
    let canRelease = true;
    if (nextStage < engine.stations.length) {
      const nextSt = engine.stations[nextStage];
      const assignedToNext = engine.vehicles.filter(x => x.stageIndex === nextStage && x.id !== nextSt.activeVehicleId).length;
      if (assignedToNext >= nextSt.def.bufferCapacity) {
        canRelease = false;
      }
    }

    if (canRelease) {
      const vIndex = engine.vehicles.indexOf(v);
      let leaderDist = Infinity;
      if (vIndex > 0) {
        leaderDist = engine.vehicles[vIndex - 1].distance;
      }
      if (leaderDist - CONVEYOR_SPEC.minSpacing >= v.distance + CONVEYOR_SPEC.speed) {
        st.completed += 1;
        st.inProcess = false;
        st.finished = false;
        st.workDone = 0;
        st.activeVehicleId = null;

        v.stageIndex = nextStage;
        if (nextStage === engine.stations.length) {
          v.outcome = nextRandom(engine.rng) < QUALITY_REJECT_RATE ? 'rejected' : 'good';
        }
      }
    }
  }

  // 3. Move vehicles
  for (let i = 0; i < engine.vehicles.length; i++) {
    const v = engine.vehicles[i];
    let maxDist = v.distance + CONVEYOR_SPEC.speed;

    if (i > 0) {
      const leader = engine.vehicles[i - 1];
      maxDist = Math.min(maxDist, leader.distance - CONVEYOR_SPEC.minSpacing);
    }

    if (v.stageIndex < engine.stations.length) {
      const stopDist = CONVEYOR_SPEC.stationDistances[v.stageIndex];
      maxDist = Math.min(maxDist, stopDist);
    } else {
      maxDist = Math.min(maxDist, CONVEYOR_SPEC.length);
    }

    const moved = Math.max(0, maxDist - v.distance);
    v.distance += moved;
    v.actualLastSpeed = moved;
  }

  // 4. Load stations
  for (let i = 0; i < engine.stations.length; i++) {
    const st = engine.stations[i];
    if (!st.stopped && !st.inProcess) {
      const stopDist = CONVEYOR_SPEC.stationDistances[i];
      const v = engine.vehicles.find(v => v.stageIndex === i && v.distance === stopDist);
      if (v) {
        st.inProcess = true;
        st.finished = false;
        st.workDone = 0;
        st.activeVehicleId = v.id;
      }
    }
  }

  // 5. Exit outbound vehicles
  while (engine.vehicles.length > 0) {
    const v = engine.vehicles[0];
    if (v.distance === CONVEYOR_SPEC.length) {
      if (v.outcome === 'good') {
        engine.goodUnits += 1;
      } else if (v.outcome === 'rejected') {
        engine.rejectedUnits += 1;
      }
      engine.vehicles.shift();
    } else {
      break;
    }
  }

  // 6. Supply new vehicle
  const nextElapsed = engine.elapsedSeconds + 1;
  if (nextElapsed % SUPPLY_INTERVAL_SECONDS === 0) {
    const firstSt = engine.stations[0];
    const assignedToFirst = engine.vehicles.filter(x => x.stageIndex === 0 && x.id !== firstSt.activeVehicleId).length;
    if (assignedToFirst < firstSt.def.bufferCapacity) {
      const clearance = engine.vehicles.length === 0 ? Infinity : engine.vehicles[engine.vehicles.length - 1].distance;
      if (clearance >= CONVEYOR_SPEC.minSpacing) {
        engine.introducedUnits += 1;
        const serial = engine.introducedUnits;
        engine.vehicles.push({
          id: `KA-${String(serial).padStart(4, '0')}`,
          serial,
          distance: 0,
          stageIndex: 0,
          actualLastSpeed: 0,
          outcome: 'pending',
        });
      }
    }
  }

  // 7. Update derived queues
  for (let i = 0; i < engine.stations.length; i++) {
    const st = engine.stations[i];
    const assigned = engine.vehicles.filter(x => x.stageIndex === i).length;
    st.queue = st.inProcess ? assigned - 1 : assigned;
  }

  engine.elapsedSeconds = nextElapsed;
  applyConditions(engine);
  recordHistory(engine);
}

export function applyConditions(engine: Engine): void {
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
  return engine.vehicles.length;
}

function stationStatus(st: EngineStationState): StationStatus {
  if (st.stopped) return 'stopped';
  if (st.inProcess && st.finished) return 'blocked';
  if (st.inProcess) return st.cycleFactor > 1 ? 'warning' : 'running';
  return 'idle';
}

function workRate(st: EngineStationState): number {
  return Math.max(1, Math.round(WORK_UNITS_PER_SECOND * st.capacityMultiplier / st.cycleFactor));
}

function effectiveCycleSeconds(st: EngineStationState): number {
  return Math.round(st.workRequired / workRate(st));
}

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
