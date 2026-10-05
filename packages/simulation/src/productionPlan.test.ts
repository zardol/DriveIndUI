import { describe, expect, it } from 'vitest';
import { CASE_PLAN, createCaseConfig, summarizePlan, type ScenarioId } from '@driveindui/shared';
import { createEngine, advanceEngine, getSnapshot } from './engine';
import { compareEngine } from './comparison';

describe('model-specific orders in the physical conveyor', () => {
  it.each<ScenarioId>(['normal', 'equipment', 'bottleneck'])('conserves order and vehicle balances throughout the %s shift', scenario => {
    const engine = createEngine({ scenario, config: createCaseConfig() });
    for (let t = 0; t <= 28800; t += 600) {
      const state = getSnapshot(engine);
      expect(state.forecastUnits).toBeLessThanOrEqual(summarizePlan(CASE_PLAN).assignedShift);
      expect(state.products!.reduce((sum, product) => sum + product.goodUnits, 0)).toBe(state.goodUnits);
      expect(state.products!.reduce((sum, product) => sum + product.rejectedUnits, 0)).toBe(state.rejectedUnits);
      expect(state.products!.reduce((sum, product) => sum + product.wip, 0)).toBe(state.wip);
      expect(state.products!.reduce((sum, product) => sum + product.introducedUnits, 0)).toBe(state.introducedUnits);
      for (const product of state.products!) {
        expect(product.goodUnits + product.rejectedUnits + product.wip).toBe(product.introducedUnits);
        expect(product.goodUnits + product.wip).toBeLessThanOrEqual(product.plannedUnits);
      }
      for (const vehicle of state.conveyor.vehicles) expect(['onix', 'cobalt', 'j7']).toContain(vehicle.modelId);
      advanceEngine(engine, 600);
    }
    const final = getSnapshot(engine);
    expect(final.goodUnits).toBeLessThanOrEqual(summarizePlan(CASE_PLAN).assignedShift);
    expect(final.shiftPlan - final.goodUnits).toBeGreaterThanOrEqual(summarizePlan(CASE_PLAN).unallocatedShift);
    expect(final.downtimeSeconds).toBe(scenario === 'equipment' ? 2400 : scenario === 'bottleneck' ? 3300 : 0);
  });
  it('never launches fictional cars when none of the target is assigned to a model', () => {
    const plan = { ...structuredClone(CASE_PLAN), models: CASE_PLAN.models.map(model => ({ ...model, monthlyUnits: 0 })) };
    const engine = createEngine({ config: createCaseConfig(plan) });
    advanceEngine(engine, 28800);
    expect(getSnapshot(engine)).toMatchObject({ goodUnits: 0, rejectedUnits: 0, introducedUnits: 0, wip: 0 });
  });
  it('allows rejected units to be replaced without exceeding good-unit orders', () => {
    const config = createCaseConfig(); config.rejectRate = 1;
    const engine = createEngine({ config }); advanceEngine(engine, 28800);
    const final = getSnapshot(engine);
    expect(final.goodUnits).toBe(0); expect(final.rejectedUnits).toBeGreaterThan(0);
    for (const product of final.products!) expect(product.rejectedUnits + product.wip).toBe(product.introducedUnits);
  });
  it('keeps live model orders isolated from all decision branches', () => {
    const engine = createEngine({ config: createCaseConfig(), scenario: 'equipment' }); advanceEngine(engine, 1200);
    const before = getSnapshot(engine), result = compareEngine(engine, { maintenanceMinutes: 10, reserveSetupMinutes: 5 });
    expect(getSnapshot(engine)).toEqual(before);
    for (const alternative of result.alternatives) expect(alternative.goodUnits).toBeLessThanOrEqual(summarizePlan(CASE_PLAN).assignedShift);
  });
});
