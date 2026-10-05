import { describe, expect, it } from 'vitest';
import { CASE_LINES, CASE_DOWNTIMES, CASE_PLAN, createCaseConfig, caseStationMetrics, estimateCaseOee } from './caseData';
import { summarizePlan, validateProductionPlan } from './planning';
import { parseProductionConfig } from './production';

describe('organizer data and monthly production plan', () => {
  it('preserves source counts and distinguishes 4800 orders from the 5500 target', () => {
    expect(CASE_LINES).toHaveLength(6); expect(CASE_DOWNTIMES).toHaveLength(4);
    expect(summarizePlan(CASE_PLAN)).toMatchObject({ allocated: 4800, target: 5500, unallocated: 700, shifts: 44, shiftAverage: 125, requiredTaktSeconds: 230.4 });
    expect(caseStationMetrics('painting')).toMatchObject({ actual: 231, rejects: 10, good: 221 });
    expect(caseStationMetrics('painting').rejectPercent).toBeCloseTo(4.329004, 5);
  });
  it.each([1, 20, 22, 23, 26, 31])('conserves every model and unassigned order across %i working days', workingDays => {
    const totals = { onix: 0, cobalt: 0, j7: 0, unassigned: 0, target: 0 };
    for (let shiftIndex = 0; shiftIndex < workingDays * 2; shiftIndex++) {
      const summary = summarizePlan({ ...CASE_PLAN, workingDays, shiftIndex });
      for (const model of summary.models) { expect(Number.isInteger(model.shiftUnits)).toBe(true); totals[model.id] += model.shiftUnits; }
      totals.unassigned += summary.unallocatedShift; totals.target += summary.shiftTarget;
    }
    expect(totals).toEqual({ onix: 2500, cobalt: 1800, j7: 500, unassigned: 700, target: 5500 });
  });
  it('does not report estimated performance over 100% as validated OEE', () => {
    const estimate = estimateCaseOee(CASE_LINES[2]);
    expect(estimate.performance).toBeGreaterThan(1); expect(estimate.exceedsIdeal).toBe(true);
    expect(estimate.oee).toBeCloseTo(1);
  });
  it('accepts a detached complete plan and rejects invalid boundaries and inconsistent shift totals', () => {
    const source = createCaseConfig(), parsed = parseProductionConfig(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('Expected a valid case configuration');
    source.productionPlan!.models[0].monthlyUnits = 0;
    expect(parsed.value.productionPlan!.models[0].monthlyUnits).toBe(2500);
    for (const patch of [{ workingDays: 0 }, { workingDays: 32 }, { shiftsPerDay: 1 }, { shiftIndex: 44 }, { monthlyTarget: 5499 }, { models: [] }, { extra: true }, { month: '2026-11' }]) {
      expect(validateProductionPlan({ ...CASE_PLAN, ...patch }).errors.length).toBeGreaterThan(0);
    }
    expect(parseProductionConfig({ ...createCaseConfig(), shiftPlan: 70 }).ok).toBe(false);
    expect(parseProductionConfig({ ...createCaseConfig(), shiftSeconds: 3600 }).ok).toBe(false);
    expect(validateProductionPlan({ ...CASE_PLAN, models: [CASE_PLAN.models[0], CASE_PLAN.models[0], CASE_PLAN.models[2]] }).errors.length).toBeGreaterThan(0);
  });
});
