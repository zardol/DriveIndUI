import { expect, test, describe } from 'vitest';
import { createEngine, advanceEngine, getSnapshot, cloneEngine } from './engine';
import { compareEngine } from './comparison';
import { DEFAULT_PRODUCTION_CONFIG, STATIONS, CONVEYOR_SPEC } from '@kosta/shared';

describe('Configuration Integration', () => {
  test('default configuration matches public geometry and station definitions', () => {
    expect(DEFAULT_PRODUCTION_CONFIG.conveyorSpeed).toBe(CONVEYOR_SPEC.speed);
    expect(DEFAULT_PRODUCTION_CONFIG.stations).toEqual(STATIONS.map(({ id, cycleSeconds, bufferCapacity }) => ({ id, cycleSeconds, bufferCapacity })));
  });

  test.each([0.05, 0.07, 0.3, 2])('preserves identities, spacing and bounded queues each tick at speed %s', speed => {
    const config = structuredClone(DEFAULT_PRODUCTION_CONFIG);
    config.conveyorSpeed = speed; config.supplyIntervalSeconds = 1; config.shiftSeconds = 8001;
    config.stations = config.stations.map((station, index) => ({ ...station, cycleSeconds: index === 2 ? 120 : 1, bufferCapacity: index % 2 ? 9 : 1 }));
    const engine = createEngine({ config, scenario: 'equipment' });
    const failures: string[] = [];
    for (let tick = 0; tick < config.shiftSeconds; tick++) {
      const prior = new Map(engine.vehicles.map(vehicle => [vehicle.id, vehicle.distance]));
      advanceEngine(engine, 1);
      if (engine.introducedUnits !== engine.goodUnits + engine.rejectedUnits + engine.vehicles.length) failures.push('conservation');
      for (let i = 0; i < engine.vehicles.length; i++) {
        const vehicle = engine.vehicles[i];
        const previous = prior.get(vehicle.id);
        if (previous !== undefined && (vehicle.distance < previous || vehicle.distance - previous > speed + 1e-9)) failures.push('travel');
        if (i && (engine.vehicles[i - 1].distance - vehicle.distance < 4 - 1e-9 || engine.vehicles[i - 1].serial >= vehicle.serial)) failures.push('spacing/FIFO');
      }
      if (engine.stations.some(station => station.queue > station.def.bufferCapacity)) failures.push('capacity');
    }
    expect(failures).toEqual([]);
    expect(engine.goodUnits + engine.rejectedUnits).toBeGreaterThan(0);
    expect(getSnapshot(engine).history.at(-1)?.elapsedSeconds).toBe(8001);
  });

  test.each([0, 1])('applies configured reject probability %s only on completed cars', rejectRate => {
    const engine = createEngine({ config: { ...DEFAULT_PRODUCTION_CONFIG, rejectRate } });
    advanceEngine(engine, 28800);
    expect(rejectRate ? engine.goodUnits : engine.rejectedUnits).toBe(0);
    expect(rejectRate ? engine.rejectedUnits : engine.goodUnits).toBeGreaterThan(0);
    const snapshot = getSnapshot(engine); snapshot.config.stations[0].cycleSeconds = 900;
    const clone = cloneEngine(engine); clone.config.source.label = 'Changed';
    expect(engine.config.stations[0].cycleSeconds).toBe(240);
    expect(engine.config.source.label).not.toBe('Changed');
  });
  test('validates default config successfully', () => {
    const engine = createEngine();
    expect(engine.config.name).toBe(DEFAULT_PRODUCTION_CONFIG.name);
  });

  test('caps invalid config and throws RangeError', () => {
    const invalidConfig = { ...DEFAULT_PRODUCTION_CONFIG, shiftSeconds: -100 };
    expect(() => createEngine({ config: invalidConfig as any })).toThrow(RangeError);
  });

  test('independent tests important config changes affect cycles, travel/supply/quality', () => {
    const fastConfig = { ...DEFAULT_PRODUCTION_CONFIG, conveyorSpeed: 2, supplyIntervalSeconds: 60 };
    const engine = createEngine({ config: fastConfig });
    advanceEngine(engine, 600);
    expect(engine.config.conveyorSpeed).toBe(2);
    expect(engine.vehicles.length).toBeGreaterThan(1);

    const slowConfig = { ...DEFAULT_PRODUCTION_CONFIG, conveyorSpeed: 0.05, supplyIntervalSeconds: 600 };
    const slowEngine = createEngine({ config: slowConfig });
    advanceEngine(slowEngine, 600);
    expect(slowEngine.vehicles.length).toBeLessThan(engine.vehicles.length);
  });

  test('reset clone quality invariants comparing batch steps', () => {
    const e1 = createEngine({ seed: 42 });
    advanceEngine(e1, 3600);

    const e2 = createEngine({ seed: 42 });
    advanceEngine(e2, 1800);
    advanceEngine(e2, 1800);

    expect(e1.goodUnits).toBe(e2.goodUnits);
    expect(e1.rejectedUnits).toBe(e2.rejectedUnits);

    const clone = cloneEngine(e1);
    advanceEngine(e1, 3600);
    advanceEngine(clone, 3600);
    expect(e1.goodUnits).toBe(clone.goodUnits);
    expect(e1.rejectedUnits).toBe(clone.rejectedUnits);
  });

  test('caller config mutations cannot change engine', () => {
    const mutable = structuredClone(DEFAULT_PRODUCTION_CONFIG);
    const engine = createEngine({ config: mutable });
    mutable.conveyorSpeed = 1.5;
    expect(engine.config.conveyorSpeed).not.toBe(1.5);
    expect(engine.config.conveyorSpeed).toBe(DEFAULT_PRODUCTION_CONFIG.conveyorSpeed);
  });

  test('compare branches no mutation config retained shift horizon', () => {
    const engine = createEngine();
    advanceEngine(engine, 7200);
    const comparison = compareEngine(engine, { maintenanceMinutes: 10, reserveSetupMinutes: 0 });
    expect(comparison.toSeconds).toBe(engine.config.shiftSeconds);
    expect(comparison.alternatives.length).toBeGreaterThan(0);
    expect(engine.elapsedSeconds).toBe(7200);
  });

  test('variable speed queue conservation and full shift no stranded vehicle due equality', () => {
    for (const speed of [0.07, 0.3, 2]) {
      const config = { ...DEFAULT_PRODUCTION_CONFIG, conveyorSpeed: speed };
      const engine = createEngine({ config });
      advanceEngine(engine, config.shiftSeconds);
      const wip = engine.vehicles.length;
      expect(wip).toBeGreaterThan(0);
      expect(engine.goodUnits + engine.rejectedUnits).toBeGreaterThan(0);
      for (const v of engine.vehicles) {
        expect(v.actualLastSpeed).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
