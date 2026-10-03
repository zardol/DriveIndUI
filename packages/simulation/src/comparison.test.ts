import { describe, it, expect } from 'vitest';
import { createEngine, advanceEngine, cloneEngine, getSnapshot, SHIFT_SECONDS } from './engine';
import { compareEngine } from './comparison';

describe('Decision Comparison', () => {
  it('rejects missing or invalid options', () => {
    const engine = createEngine();
    // @ts-expect-error testing invalid input
    expect(() => compareEngine(engine, null)).toThrow(RangeError);
    // @ts-expect-error testing invalid input
    expect(() => compareEngine(engine, { maintenanceMinutes: 6, reserveSetupMinutes: 0 })).toThrow(RangeError);
    // @ts-expect-error testing invalid input
    expect(() => compareEngine(engine, { maintenanceMinutes: 5, reserveSetupMinutes: 1 })).toThrow(RangeError);
  });

  it('preserves source engine strictly via deterministic cloning', () => {
    const engine = createEngine({ scenario: 'equipment' });
    advanceEngine(engine, 1400);
    const snapshot = structuredClone(engine);
    const options = { maintenanceMinutes: 5, reserveSetupMinutes: 5 } as const;
    const first = compareEngine(engine, options);
    expect(compareEngine(engine, options)).toEqual(first);
    expect(engine).toEqual(snapshot);
  });

  it('baseline is identical to direct remainder engine execution', () => {
    const engine = createEngine({ scenario: 'normal' });
    advanceEngine(engine, 1000);
    const options = { maintenanceMinutes: 5, reserveSetupMinutes: 5 } as const;
    const res = compareEngine(engine, options);

    const remainder = cloneEngine(engine);
    advanceEngine(remainder, SHIFT_SECONDS - 1000);

    const baseAlt = res.alternatives.find((a) => a.id === 'baseline');
    expect(baseAlt?.goodUnits).toBe(remainder.goodUnits);
    expect(baseAlt?.deltaGoodUnits).toBe(0);
    expect(baseAlt?.deltaDowntimeSeconds).toBe(0);
    expect(baseAlt?.history).toEqual(remainder.history);
    expect(baseAlt?.wip).toBe(getSnapshot(remainder).wip);
  });

  it('equipment scenario maintenance yields correct remaining downtime delta', () => {
    const engine = createEngine({ scenario: 'equipment' });
    advanceEngine(engine, 1200);

    let res = compareEngine(engine, { maintenanceMinutes: 5, reserveSetupMinutes: 0 });
    let maint = res.alternatives.find((a) => a.id === 'maintenance');
    expect(maint?.deltaDowntimeSeconds).toBe(-600);

    res = compareEngine(engine, { maintenanceMinutes: 10, reserveSetupMinutes: 0 });
    maint = res.alternatives.find((a) => a.id === 'maintenance');
    expect(maint?.deltaDowntimeSeconds).toBe(-300);
  });

  it('normal scenario maintenance can worsen outcomes', () => {
    const engine = createEngine({ scenario: 'normal' });
    advanceEngine(engine, 1200);
    const res = compareEngine(engine, { maintenanceMinutes: 5, reserveSetupMinutes: 0 });
    const maint = res.alternatives.find((a) => a.id === 'maintenance');
    expect(maint?.deltaDowntimeSeconds).toBe(300);
    expect(maint!.deltaGoodUnits).toBeLessThanOrEqual(0);
  });

  it('maintains finite unit conservation across different timepoints and scenarios', () => {
    const times = [0, 600, 1200, 2100, 28700, 28800];
    const scenarios = ['normal', 'equipment', 'bottleneck'] as const;

    for (const scen of scenarios) {
      for (const t of times) {
        const engine = createEngine({ scenario: scen });
        advanceEngine(engine, t);
        const res = compareEngine(engine, { maintenanceMinutes: 5, reserveSetupMinutes: 5 });

        for (const alt of res.alternatives) {
          expect(alt.goodUnits).toBeGreaterThanOrEqual(engine.goodUnits);
          expect(alt.introducedUnits).toBe(alt.goodUnits + alt.rejectedUnits + alt.wip);
          expect(Number.isInteger(alt.goodUnits)).toBe(true);
          expect(alt.wip).toBeGreaterThanOrEqual(0);
          expect(alt.wip).toBeLessThanOrEqual(36);
          expect(alt.history.filter(h => h.elapsedSeconds <= t)).toEqual(engine.history);
        }
      }
    }
  });

  it('returns identical metrics at shift end without new work or incidents', () => {
    const engine = createEngine();
    advanceEngine(engine, SHIFT_SECONDS);
    const res = compareEngine(engine, { maintenanceMinutes: 5, reserveSetupMinutes: 0 });
    const base = res.alternatives.find((a) => a.id === 'baseline');
    const maint = res.alternatives.find((a) => a.id === 'maintenance');
    const reserve = res.alternatives.find((a) => a.id === 'reserve');

    expect(maint?.goodUnits).toBe(base?.goodUnits);
    expect(reserve?.goodUnits).toBe(base?.goodUnits);
    expect(maint?.deltaDowntimeSeconds).toBe(0);
    expect(reserve?.deltaDowntimeSeconds).toBe(0);
  });

  it('reserve with zero setup improves a bottleneck without adding downtime', () => {
    const engine = createEngine({ scenario: 'bottleneck' });
    advanceEngine(engine, 1000);
    const res = compareEngine(engine, { maintenanceMinutes: 5, reserveSetupMinutes: 0 });
    const reserve = res.alternatives.find((a) => a.id === 'reserve');
    const baseline = res.alternatives.find((a) => a.id === 'baseline');
    expect(reserve!.goodUnits).toBeGreaterThan(baseline!.goodUnits);
    expect(reserve!.deltaDowntimeSeconds).toBe(0);
  });

  it('counts setup immediately, caps downtime at shift end and allows negative late effects', () => {
    const engine = createEngine({ scenario: 'bottleneck' });
    advanceEngine(engine, 27_900);
    const result = compareEngine(engine, { maintenanceMinutes: 20, reserveSetupMinutes: 15 });
    const reserve = result.alternatives.find(a => a.id === 'reserve')!;
    expect(reserve.deltaDowntimeSeconds).toBe(900);
    expect(reserve.deltaGoodUnits).toBeLessThan(0);
    const maintenance = result.alternatives.find(a => a.id === 'maintenance')!;
    expect(maintenance.deltaDowntimeSeconds).toBe(900);
  });
});
