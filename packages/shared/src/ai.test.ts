import { describe, expect, it } from 'vitest';
import { advanceEngine, createEngine, getSnapshot } from '@driveindui/simulation';
import { createCaseConfig } from './caseData';
import { calculateAiIndicators, createAiInput } from './ai';
import type { SessionSnapshot } from './index';

function snapshot(): SessionSnapshot {
  const engine = createEngine({ config: createCaseConfig() });
  advanceEngine(engine, 600);
  return { ...getSnapshot(engine), sessionId: 'test', revision: 0, running: true, speed: 60, updatedAt: '2026-10-06T00:00:00Z' };
}
describe('risk analysis observations and capacity model', () => {
  it('never sends future scenario knowledge, vehicle IDs or user-provided strings to the LLM', () => {
    const state = snapshot();
    state.config.name = 'secret custom name'; state.config.source.label = 'private source'; state.scenario = 'equipment';
    const input = createAiInput(state);
    expect(input.includeCaseHistory).toBe(false);
    const json = JSON.stringify(input);
    for (const excluded of ['equipment', 'secret custom name', 'private source', 'sessionId', 'incidents', 'vehicles']) expect(json).not.toContain(excluded);
  });
  it('detects the slowest stage and bounds the horizon by remaining shift time', () => {
    const input = createAiInput(snapshot(), 60);
    input.elapsedSeconds = input.shiftSeconds - 600;
    const indicators = calculateAiIndicators(input);
    expect(indicators.horizonMinutes).toBe(10);
    expect(indicators.bottleneckStationId).toBe('assembly');
    expect(indicators.lineCapacityPerHour).toBeCloseTo(3600 / 239 * (1 - 3 / 240));
  });
  it('projects a stopped paint buffer filling without assuming a scheduled recovery', () => {
    const input = createAiInput(snapshot());
    input.stations[1].status = 'stopped'; input.stations[1].inputQueue = 4;
    const paint = calculateAiIndicators(input).stations[1];
    expect(paint.level).toBe('high');
    expect(paint.queueAtHorizon).toBe(8);
    expect(paint.minutesToFull).toBeGreaterThan(0);
    expect(paint.minutesToFull).toBeLessThan(30);
  });
  it('does not predict new incoming work after completion or after all orders are fulfilled', () => {
    const input = createAiInput(snapshot());
    input.remainingOrderUnits = 0; input.wip = 0;
    expect(calculateAiIndicators(input).stations.every(station => station.level === 'low' && station.queueAtHorizon === 0 && station.minutesToFull === null)).toBe(true);
    input.elapsedSeconds = input.shiftSeconds;
    expect(calculateAiIndicators(input)).toMatchObject({ shiftEnded: true, horizonMinutes: 0, requiredPerHour: 0 });
  });
  it('exposes the unassigned monthly gap separately from fulfilled shift orders', () => {
    const state = snapshot(); const input = createAiInput(state);
    expect(input.unallocatedMonthlyUnits).toBe(700);
    expect(input.remainingOrderUnits).toBe(107 - state.goodUnits);
  });
});
