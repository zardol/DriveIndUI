import { describe, expect, it } from 'vitest';
import { advanceEngine, createEngine, getSnapshot, SHIFT_PLAN, SHIFT_SECONDS } from './index';
import { STATIONS } from '@driveindui/shared';
import type { PlantSnapshot, ScenarioId, StationId, StationSnapshot } from '@driveindui/shared';

const SCENARIOS: readonly ScenarioId[] = ['normal', 'equipment', 'bottleneck'];

function stationOf(snapshot: PlantSnapshot, id: StationId): StationSnapshot {
  const found = snapshot.stations.find((s) => s.id === id);
  if (!found) throw new Error(`station ${id} missing`);
  return found;
}

function runTo(scenario: ScenarioId, seconds: number, seed = 42): PlantSnapshot {
  const engine = createEngine({ scenario, seed });
  advanceEngine(engine, seconds);
  return getSnapshot(engine);
}

/** Physical invariants every snapshot must satisfy; returns human readable violations. */
function violations(s: PlantSnapshot): string[] {
  const out: string[] = [];
  const check = (ok: boolean, message: string): void => {
    if (!ok) out.push(`t=${s.elapsedSeconds} ${s.scenario}: ${message}`);
  };
  check(s.elapsedSeconds >= 0 && s.elapsedSeconds <= s.shiftSeconds, 'elapsed outside shift');
  check(s.introducedUnits === s.goodUnits + s.rejectedUnits + s.wip, 'introduced != good + rejected + wip');
  let queued = 0;
  let processing = 0;
  let upstream = s.introducedUnits;
  for (const st of s.stations) {
    check(st.inputQueue >= 0 && st.inputQueue <= st.bufferCapacity, `${st.id} queue out of bounds`);
    check(st.progress >= 0 && st.progress <= 1, `${st.id} progress out of range`);
    check(st.inProcess || st.progress === 0, `${st.id} progress without unit`);
    check(st.utilizationPercent >= 0 && st.utilizationPercent <= 100, `${st.id} utilization out of range`);
    check(st.downtimeSeconds >= 0 && st.downtimeSeconds <= s.elapsedSeconds, `${st.id} downtime out of range`);
    check(st.status !== 'blocked' || st.progress === 1, `${st.id} blocked before finishing`);
    // units released by the previous stage are queued, in process or already passed on
    check(upstream === st.completed + st.inputQueue + (st.inProcess ? 1 : 0), `${st.id} flow balance broken`);
    upstream = st.completed;
    queued += st.inputQueue;
    processing += st.inProcess ? 1 : 0;
  }
  const outbound = s.conveyor.vehicles.filter(vehicle => vehicle.stage === 'outbound').length;
  check(upstream === s.goodUnits + s.rejectedUnits + outbound, 'quality output != departed + outbound');
  check(s.wip === queued + processing + outbound, 'wip != buffers + processing + outbound');
  check(s.wip === s.conveyor.vehicles.length, 'active vehicle identities do not match wip');
  if (s.goodUnits + s.rejectedUnits === 0) {
    check(s.qualityPercent === null, 'quality must be null before first finished car');
  } else {
    check(s.qualityPercent !== null && s.qualityPercent >= 0 && s.qualityPercent <= 100, 'quality out of range');
  }
  check(s.forecastUnits >= s.goodUnits, 'forecast below already produced units');
  return out;
}

describe('initial state', () => {
  it('starts with an empty line except one body waiting at welding', () => {
    const s = getSnapshot(createEngine());
    expect(s.scenario).toBe('normal');
    expect(s.elapsedSeconds).toBe(0);
    expect(s.shiftSeconds).toBe(28_800);
    expect(s.shiftPlan).toBe(70);
    expect(s.introducedUnits).toBe(1);
    expect(s.wip).toBe(1);
    expect(s.goodUnits).toBe(0);
    expect(s.rejectedUnits).toBe(0);
    expect(s.qualityPercent).toBeNull();
    expect(s.throughputPerHour).toBe(0);
    expect(s.forecastUnits).toBe(0);
    expect(s.downtimeSeconds).toBe(0);
    expect(s.incidents).toEqual([]);
    expect(s.history).toEqual([{ elapsedSeconds: 0, goodUnits: 0, planUnits: 0, wip: 1 }]);
    expect(s.stations.map((st) => st.id)).toEqual(STATIONS.map((st) => st.id));
    expect(stationOf(s, 'welding').inputQueue).toBe(1);
    for (const st of s.stations) {
      expect(st.inProcess).toBe(false);
      expect(st.status).toBe('idle');
      expect(st.utilizationPercent).toBe(0);
      expect(st.throughputPerHour).toBe(0);
    }
    expect(violations(s)).toEqual([]);
  });

  it('moves the first body to welding before starting its processing cycle', () => {
    const engine = createEngine();
    advanceEngine(engine, 1);
    const approaching = getSnapshot(engine);
    expect(approaching.conveyor.vehicles[0].distance).toBe(0.5);
    expect(stationOf(approaching, 'welding').inProcess).toBe(false);
    expect(stationOf(approaching, 'welding').arrivingUnits).toBe(1);
    advanceEngine(engine, 80);
    const welding = stationOf(getSnapshot(engine), 'welding');
    expect(welding.inProcess).toBe(true);
    expect(welding.status).toBe('running');
    expect(welding.inputQueue).toBe(0);
    expect(welding.progress).toBeGreaterThan(0);
    expect(welding.progress).toBeLessThan(1);
  });
});

describe('conservation and bounded buffers', () => {
  it.each(SCENARIOS)('accounts for every unit across a full shift (%s)', (scenario) => {
    const engine = createEngine({ scenario });
    const problems: string[] = [];
    let prev = getSnapshot(engine);
    while (prev.elapsedSeconds < SHIFT_SECONDS) {
      advanceEngine(engine, 97);
      const next = getSnapshot(engine);
      problems.push(...violations(next));
      if (next.introducedUnits < prev.introducedUnits) problems.push('introduced decreased');
      if (next.goodUnits < prev.goodUnits) problems.push('good decreased');
      if (next.rejectedUnits < prev.rejectedUnits) problems.push('rejected decreased');
      next.stations.forEach((st, i) => {
        const before = prev.stations[i];
        if (before && st.completed < before.completed) problems.push(`${st.id} completed decreased`);
        if (before && st.downtimeSeconds < before.downtimeSeconds) problems.push(`${st.id} downtime decreased`);
      });
      prev = next;
    }
    expect(problems).toEqual([]);
    expect(prev.elapsedSeconds).toBe(SHIFT_SECONDS);
    expect(prev.goodUnits).toBeGreaterThan(0);
  });

  it.each(SCENARIOS)('holds invariants second by second during the first hour (%s)', (scenario) => {
    const engine = createEngine({ scenario });
    const problems: string[] = [];
    for (let t = 0; t < 3600; t += 1) {
      advanceEngine(engine, 1);
      problems.push(...violations(getSnapshot(engine)));
    }
    expect(problems).toEqual([]);
  });
});

describe('determinism', () => {
  it('produces identical results for identical seeds and actions', () => {
    const a = createEngine({ scenario: 'equipment', seed: 7 });
    const b = createEngine({ scenario: 'equipment', seed: 7 });
    for (const chunk of [13, 600, 1, 4000, 25_000]) {
      advanceEngine(a, chunk);
      advanceEngine(b, chunk);
      expect(getSnapshot(a)).toEqual(getSnapshot(b));
    }
  });

  it.each(SCENARIOS)('is independent of how time is chunked (%s)', (scenario) => {
    const oneShot = createEngine({ scenario });
    advanceEngine(oneShot, SHIFT_SECONDS);

    const chunked = createEngine({ scenario });
    const chunks = [1, 7, 59, 60, 61, 240, 333, 1000, 3];
    let i = 0;
    while (getSnapshot(chunked).elapsedSeconds < SHIFT_SECONDS) {
      advanceEngine(chunked, chunks[i % chunks.length] ?? 1);
      i += 1;
    }
    expect(getSnapshot(chunked)).toEqual(getSnapshot(oneShot));

    const perSecond = createEngine({ scenario });
    for (let t = 0; t < 2500; t += 1) advanceEngine(perSecond, 1);
    expect(getSnapshot(perSecond)).toEqual(runTo(scenario, 2500));
  });

  it('uses the seed for quality outcomes', () => {
    const rejected = new Set<number>();
    for (let seed = 1; seed <= 20; seed += 1) {
      rejected.add(runTo('normal', SHIFT_SECONDS, seed).rejectedUnits);
    }
    expect(rejected.size).toBeGreaterThan(1);
  });
});

describe('normal scenario', () => {
  it('has no mechanical downtime or incidents and delivers close to plan', () => {
    const s = runTo('normal', SHIFT_SECONDS);
    expect(s.incidents).toEqual([]);
    expect(s.downtimeSeconds).toBe(0);
    expect(s.stations.every((st) => st.downtimeSeconds === 0)).toBe(true);
    expect(s.stations.some((st) => st.status === 'stopped' || st.status === 'warning')).toBe(false);
    expect(s.goodUnits).toBeGreaterThanOrEqual(Math.floor(SHIFT_PLAN * 0.9));
    expect(s.qualityPercent).not.toBeNull();
  });
});

describe('equipment scenario', () => {
  it('stops painting with no output and exactly 900 s of downtime', () => {
    const engine = createEngine({ scenario: 'equipment' });
    advanceEngine(engine, 1199);
    expect(stationOf(getSnapshot(engine), 'painting').downtimeSeconds).toBe(0);

    advanceEngine(engine, 1);
    const atStop = stationOf(getSnapshot(engine), 'painting');
    expect(atStop.status).toBe('stopped');

    advanceEngine(engine, 899);
    const lastStopped = stationOf(getSnapshot(engine), 'painting');
    expect(lastStopped.status).toBe('stopped');
    expect(lastStopped.completed).toBe(atStop.completed);
    expect(lastStopped.progress).toBe(atStop.progress);
    expect(lastStopped.downtimeSeconds).toBe(899);

    advanceEngine(engine, 1);
    const recovered = stationOf(getSnapshot(engine), 'painting');
    expect(recovered.downtimeSeconds).toBe(900);
    expect(recovered.status).not.toBe('stopped');

    advanceEngine(engine, SHIFT_SECONDS);
    const end = getSnapshot(engine);
    expect(stationOf(end, 'painting').downtimeSeconds).toBe(900);
    expect(stationOf(end, 'painting').completed).toBeGreaterThan(atStop.completed);
    for (const st of end.stations) {
      if (st.id !== 'painting') expect(st.downtimeSeconds).toBe(0);
    }
    expect(end.downtimeSeconds).toBe(900);
  });

  it('raises, supersedes and resolves incidents exactly once', () => {
    expect(runTo('equipment', 599).incidents).toEqual([]);

    const slow = runTo('equipment', 900);
    expect(slow.incidents).toHaveLength(1);
    expect(slow.incidents[0]).toMatchObject({ stationId: 'painting', severity: 'warning', startedAtSeconds: 600, resolvedAtSeconds: null });
    expect(['warning', 'blocked']).toContain(stationOf(slow, 'painting').status);

    const stopped = runTo('equipment', 1200);
    expect(stopped.incidents).toHaveLength(2);
    expect(stopped.incidents[0]).toMatchObject({ severity: 'warning', resolvedAtSeconds: 1200 });
    expect(stopped.incidents[1]).toMatchObject({ stationId: 'painting', severity: 'critical', startedAtSeconds: 1200, resolvedAtSeconds: null });

    const recovered = runTo('equipment', 2100);
    expect(recovered.incidents[1]).toMatchObject({ severity: 'critical', resolvedAtSeconds: 2100 });

    const end = runTo('equipment', SHIFT_SECONDS);
    expect(end.incidents).toHaveLength(2);
    expect(end.incidents.every((incident) => incident.resolvedAtSeconds !== null)).toBe(true);
    expect(new Set(end.incidents.map((incident) => incident.id)).size).toBe(2);
  });
});

describe('bottleneck scenario', () => {
  it('builds a queue before assembly and produces less than normal', () => {
    const normalMid = runTo('normal', 7200);
    const bottleneckMid = runTo('bottleneck', 7200);
    const assembly = stationOf(bottleneckMid, 'assembly');
    expect(assembly.inputQueue).toBeGreaterThan(stationOf(normalMid, 'assembly').inputQueue);
    expect(assembly.status).toBe('warning');
    expect(assembly.cycleSeconds).toBeGreaterThan(stationOf(normalMid, 'assembly').cycleSeconds);
    expect(stationOf(normalMid, 'assembly').status).toBe('running');

    const normalEnd = runTo('normal', SHIFT_SECONDS);
    const bottleneckEnd = runTo('bottleneck', SHIFT_SECONDS);
    expect(bottleneckEnd.goodUnits).toBeLessThan(normalEnd.goodUnits);
    expect(bottleneckEnd.throughputPerHour).toBeLessThan(normalEnd.throughputPerHour);
    expect(bottleneckEnd.downtimeSeconds).toBe(0);
    expect(bottleneckEnd.incidents).toHaveLength(1);
    expect(bottleneckEnd.incidents[0]).toMatchObject({ stationId: 'assembly', severity: 'warning', startedAtSeconds: 600, resolvedAtSeconds: null });
  });
});

describe('shift boundary and history', () => {
  it('never progresses beyond the end of the shift', () => {
    const engine = createEngine({ scenario: 'equipment' });
    advanceEngine(engine, SHIFT_SECONDS + 5000);
    const end = getSnapshot(engine);
    expect(end.elapsedSeconds).toBe(SHIFT_SECONDS);
    advanceEngine(engine, 600);
    advanceEngine(engine, 1);
    expect(getSnapshot(engine)).toEqual(end);
    expect(end.forecastUnits).toBe(end.goodUnits);
  });

  it('samples history every simulated minute with a linear plan', () => {
    const end = runTo('normal', SHIFT_SECONDS);
    expect(end.history).toHaveLength(481);
    expect(end.history[0]).toEqual({ elapsedSeconds: 0, goodUnits: 0, planUnits: 0, wip: 1 });
    const last = end.history[end.history.length - 1];
    expect(last?.elapsedSeconds).toBe(SHIFT_SECONDS);
    expect(last?.planUnits).toBeCloseTo(SHIFT_PLAN, 6);
    expect(last?.goodUnits).toBe(end.goodUnits);
    for (let i = 1; i < end.history.length; i += 1) {
      const a = end.history[i - 1];
      const b = end.history[i];
      expect(b && a ? b.elapsedSeconds - a.elapsedSeconds : -1).toBe(60);
      expect(b && a ? b.goodUnits >= a.goodUnits : false).toBe(true);
    }
    const mid = runTo('normal', 14_400);
    expect(mid.history[mid.history.length - 1]?.planUnits).toBeCloseTo(35, 6);
    expect(runTo('normal', 150).history.map((p) => p.elapsedSeconds)).toEqual([0, 60, 120]);
  });

  it('keeps the forecast between produced units and a physical ceiling', () => {
    const s = runTo('normal', 10_000);
    const remaining = SHIFT_SECONDS - s.elapsedSeconds;
    expect(s.forecastUnits).toBeGreaterThanOrEqual(s.goodUnits);
    expect(s.forecastUnits).toBeLessThanOrEqual(s.goodUnits + s.wip + Math.ceil(remaining / 180));
  });
});

describe('snapshot isolation', () => {
  it('cannot be used to mutate the engine', () => {
    const engine = createEngine();
    advanceEngine(engine, 3000);
    const snapshot = getSnapshot(engine);
    const pristine = JSON.parse(JSON.stringify(snapshot)) as PlantSnapshot;

    snapshot.goodUnits = 999;
    const firstStation = snapshot.stations[0];
    if (firstStation) {
      firstStation.completed = 999;
      firstStation.inputQueue = 999;
    }
    snapshot.stations.pop();
    const firstPoint = snapshot.history[0];
    if (firstPoint) firstPoint.goodUnits = 50;
    snapshot.history.push({ elapsedSeconds: 1, goodUnits: 1, planUnits: 1, wip: 1 });
    snapshot.incidents.push({ id: 'x', stationId: 'welding', severity: 'critical', title: 'x', description: 'x', startedAtSeconds: 0, resolvedAtSeconds: null });

    const again = getSnapshot(engine);
    expect(again).toEqual(pristine);
    expect(again.stations).not.toBe(snapshot.stations);

    advanceEngine(engine, 1000);
    const reference = createEngine();
    advanceEngine(reference, 4000);
    expect(getSnapshot(engine)).toEqual(getSnapshot(reference));
  });

  it('detaches incident objects', () => {
    const engine = createEngine({ scenario: 'equipment' });
    advanceEngine(engine, 900);
    const snapshot = getSnapshot(engine);
    const incident = snapshot.incidents[0];
    if (incident) incident.resolvedAtSeconds = 1;
    expect(getSnapshot(engine).incidents[0]?.resolvedAtSeconds).toBeNull();
  });
});

describe('input validation', () => {
  it('rejects invalid advance arguments without changing state', () => {
    const engine = createEngine();
    for (const bad of [-1, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => advanceEngine(engine, bad)).toThrow(RangeError);
    }
    expect(() => advanceEngine(engine, '10' as unknown as number)).toThrow();
    expect(getSnapshot(engine).elapsedSeconds).toBe(0);
    advanceEngine(engine, 0);
    expect(getSnapshot(engine)).toEqual(getSnapshot(createEngine()));
  });

  it('rejects invalid engine options', () => {
    expect(() => createEngine({ scenario: 'chaos' as ScenarioId })).toThrow();
    expect(() => createEngine({ seed: Number.NaN })).toThrow();
    expect(getSnapshot(createEngine({ scenario: 'bottleneck' })).scenario).toBe('bottleneck');
  });
});
