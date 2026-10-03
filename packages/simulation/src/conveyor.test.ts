import { describe, it, expect } from 'vitest';
import { createEngine, advanceEngine, cloneEngine, getSnapshot, SHIFT_SECONDS } from './engine';
import { CONVEYOR_SPEC, STATIONS } from '@kosta/shared';

describe('per-vehicle accumulating conveyor', () => {
  it('requires travel and a full processing cycle before transferring the first ID', () => {
    const engine = createEngine();
    advanceEngine(engine, 79);
    expect(engine.vehicles[0].distance).toBe(39.5);
    expect(engine.stations[0].inProcess).toBe(false);
    advanceEngine(engine, 1);
    expect(engine.stations[0]).toMatchObject({ inProcess: true, workDone: 0, activeVehicleId: 'KA-0001' });
    advanceEngine(engine, 239);
    expect(engine.stations[0].completed).toBe(0);
    expect(engine.vehicles[0].distance).toBe(40);
    advanceEngine(engine, 1);
    expect(engine.stations[0].completed).toBe(1);
    expect(engine.vehicles[0]).toMatchObject({ id: 'KA-0001', distance: 40.5, stageIndex: 1 });
    expect(engine.stations[1].workDone).toBe(0);
  });

  it.each(['normal', 'equipment', 'bottleneck'] as const)('preserves identities, spacing, work and flow every second of a full %s shift', scenario => {
    const engine = createEngine({ scenario });
    let previous = new Map(engine.vehicles.map(v => [v.id, { ...v }]));
    const allIds = new Set(previous.keys());
    for (let t = 1; t <= SHIFT_SECONDS; t++) {
      const oldExited = engine.goodUnits + engine.rejectedUnits;
      const oldBusy = engine.stations.map(st => st.busySeconds);
      advanceEngine(engine, 1);
      const fail = (message: string): never => { throw new Error(`${scenario} t=${t}: ${message}`); };
      if (engine.introducedUnits !== engine.vehicles.length + engine.goodUnits + engine.rejectedUnits) fail('lost vehicle');
      const current = new Map(engine.vehicles.map(v => [v.id, { ...v }]));
      if (current.size !== engine.vehicles.length) fail('duplicate ID');
      for (let i = 0; i < engine.vehicles.length; i++) {
        const v = engine.vehicles[i], before = previous.get(v.id), leader = engine.vehicles[i - 1];
        if (leader && (leader.distance - v.distance < CONVEYOR_SPEC.minSpacing || leader.serial >= v.serial)) fail('spacing or FIFO');
        if (before) {
          const delta = v.distance - before.distance;
          if (delta < 0 || delta > CONVEYOR_SPEC.speed || delta !== v.actualLastSpeed) fail('invalid movement');
          if (v.stageIndex < before.stageIndex || v.stageIndex > before.stageIndex + 1) fail('skipped station');
          if (before.outcome !== 'pending' && before.outcome !== v.outcome) fail('quality redrawn');
        } else {
          if (allIds.has(v.id) || v.distance !== 0 || v.stageIndex !== 0) fail('reused ID or admission teleport');
          allIds.add(v.id);
        }
      }
      const vanished = [...previous.values()].filter(v => !current.has(v.id));
      if (vanished.length !== engine.goodUnits + engine.rejectedUnits - oldExited) fail('unaccounted departure');
      if (vanished.some(v => v.distance !== 199.5 || v.stageIndex !== 4 || v.outcome === 'pending')) fail('premature exit');
      for (const [i, st] of engine.stations.entries()) {
        const assigned = engine.vehicles.filter(v => v.stageIndex === i);
        if (st.queue !== assigned.length - Number(st.inProcess) || st.queue < 0 || st.queue > st.def.bufferCapacity) fail('buffer capacity');
        if (st.inProcess && !assigned.some(v => v.id === st.activeVehicleId && v.distance === CONVEYOR_SPEC.stationDistances[i])) fail('processing away from station');
        if (st.busySeconds - oldBusy[i] > 1) fail('extra processing tick');
      }
      previous = current;
    }
    expect(allIds.size).toBe(engine.introducedUnits);
    expect(getSnapshot(engine).wip).toBe(engine.vehicles.length);
  });

  it('counts quality only at the outlet, with one unchanged outcome during travel', () => {
    const engine = createEngine();
    while (engine.vehicles[0].stageIndex < 4) advanceEngine(engine, 1);
    expect(engine.elapsedSeconds).toBe(1397);
    expect(engine.stations[3].completed).toBe(1);
    expect(engine.vehicles[0].distance).toBe(160.5);
    const outcome = engine.vehicles[0].outcome;
    expect(outcome).not.toBe('pending');
    advanceEngine(engine, 78);
    expect(engine.goodUnits + engine.rejectedUnits).toBe(0);
    expect(engine.vehicles[0]).toMatchObject({ id: 'KA-0001', distance: 199.5, outcome });
    advanceEngine(engine, 1);
    expect(engine.elapsedSeconds).toBe(1476);
    expect(engine.goodUnits + engine.rejectedUnits).toBe(1);
    expect(engine.vehicles.some(v => v.id === 'KA-0001')).toBe(false);
  });

  it('holds an actual queue behind stopped painting, then drains the same IDs', () => {
    const engine = createEngine({ scenario: 'equipment' });
    advanceEngine(engine, 1900);
    const painting = engine.stations[1];
    expect(painting.stopped).toBe(true);
    const queue = engine.vehicles.filter(v => v.stageIndex === 1 && v.id !== painting.activeVehicleId && v.actualLastSpeed === 0);
    expect(queue.length).toBeGreaterThanOrEqual(2);
    const before = queue.map(v => [v.id, v.distance] as const);
    advanceEngine(engine, 100);
    for (const [id, distance] of before) expect(engine.vehicles.find(v => v.id === id)?.distance).toBe(distance);
    advanceEngine(engine, 1600);
    expect(painting.downtimeSeconds).toBe(900);
    for (const [id, distance] of before) {
      const car = engine.vehicles.find(v => v.id === id);
      expect(car === undefined || car.distance > distance).toBe(true);
    }
  });

  it('propagates full buffers to upstream blocking and skips admissions without allocating IDs', () => {
    const engine = createEngine({ scenario: 'bottleneck' });
    advanceEngine(engine, 20_000);
    const snap = getSnapshot(engine);
    expect(snap.stations[2].inputQueue).toBe(STATIONS[2].bufferCapacity);
    expect(snap.stations[0].inputQueue).toBe(STATIONS[0].bufferCapacity);
    expect(snap.stations.slice(0, 2).some(st => st.status === 'blocked')).toBe(true);
    expect(snap.introducedUnits).toBeLessThan(1 + Math.floor(snap.elapsedSeconds / 240));
    expect(snap.conveyor.vehicles.at(-1)?.serial).toBe(snap.introducedUnits);
    for (const st of snap.stations) expect(st.queuedUnits + st.arrivingUnits).toBe(st.inputQueue);
  });

  it('detaches vehicle snapshots and forked vehicles, preserving pause/shift boundaries', () => {
    const engine = createEngine({ scenario: 'equipment' });
    advanceEngine(engine, 1900);
    const before = getSnapshot(engine), fork = cloneEngine(engine);
    const changed = getSnapshot(engine);
    changed.conveyor.vehicles[0].distance = 999;
    changed.conveyor.stationDistances[0] = 999;
    changed.conveyor.vehicles.pop();
    fork.vehicles[0].distance = 998;
    expect(getSnapshot(engine)).toEqual(before);
    advanceEngine(engine, 0);
    expect(getSnapshot(engine)).toEqual(before);
    advanceEngine(engine, SHIFT_SECONDS);
    const end = getSnapshot(engine);
    advanceEngine(engine, 100);
    expect(getSnapshot(engine)).toEqual(end);
  });
});
