import type { ProductionConfig } from './production';
import { summarizePlan, type ProductionPlan } from './planning';

/** Transcribed from the organizer's two-page TEST dataset, received 5 October 2026. */
export const CASE_SOURCE = 'Тестовые данные организатора · 1–2 октября 2026';
export const CASE_LINES = [
  { date: '2026-10-01', station: 'welding', line: 'Сварка-1', plan: 120, actual: 118, operatingHours: 7.8, loadPercent: 98, rejects: 2, reportedRejectPercent: 1.7 },
  { date: '2026-10-01', station: 'painting', line: 'Окраска-1', plan: 120, actual: 115, operatingHours: 7.5, loadPercent: 94, rejects: 4, reportedRejectPercent: 3.5 },
  { date: '2026-10-01', station: 'assembly', line: 'Сборка-1', plan: 120, actual: 121, operatingHours: 8, loadPercent: 100, rejects: 1, reportedRejectPercent: 0.8 },
  { date: '2026-10-02', station: 'welding', line: 'Сварка-1', plan: 120, actual: 111, operatingHours: 7.2, loadPercent: 91, rejects: 3, reportedRejectPercent: 2.7 },
  { date: '2026-10-02', station: 'painting', line: 'Окраска-1', plan: 120, actual: 116, operatingHours: 7.7, loadPercent: 96, rejects: 6, reportedRejectPercent: 5.2 },
  { date: '2026-10-02', station: 'assembly', line: 'Сборка-1', plan: 120, actual: 119, operatingHours: 7.9, loadPercent: 99, rejects: 2, reportedRejectPercent: 1.7 },
] as const;
export const CASE_DOWNTIMES = [
  { date: '2026-10-01', station: 'welding', equipment: 'ABB-01', reason: 'Ошибка датчика', minutes: 25, planned: false },
  { date: '2026-10-01', station: 'painting', equipment: 'Камера-02', reason: 'Замена фильтра', minutes: 40, planned: false },
  { date: '2026-10-02', station: 'assembly', equipment: 'Конвейер-03', reason: 'Обрыв цепи', minutes: 55, planned: false },
  { date: '2026-10-02', station: 'welding', equipment: 'ABB-04', reason: 'Плановое ТО', minutes: 30, planned: true },
] as const;
export const CASE_TARGETS = { oeePercent: 85, rejectPercent: 2, equipmentDowntimeMinutesPerDay: 60, shiftsPerDay: 2, shiftHours: 8, monthlyUnits: 5500 } as const;
export const CASE_PLAN: ProductionPlan = {
  month: '2026-10', workingDays: 22, shiftsPerDay: 2, monthlyTarget: 5500, shiftIndex: 0,
  models: [{ id: 'onix', monthlyUnits: 2500 }, { id: 'cobalt', monthlyUnits: 1800 }, { id: 'j7', monthlyUnits: 500 }],
};
export function caseStationMetrics(station: typeof CASE_LINES[number]['station']) {
  const rows = CASE_LINES.filter(row => row.station === station);
  const actual = rows.reduce((sum, row) => sum + row.actual, 0);
  const rejects = rows.reduce((sum, row) => sum + row.rejects, 0);
  const operatingHours = rows.reduce((sum, row) => sum + row.operatingHours, 0);
  return { actual, rejects, good: actual - rejects, rejectPercent: rejects / actual * 100,
    effectiveCycleSeconds: operatingHours * 3600 / actual, operatingHours };
}
/** Illustrative OEE only: an 8 h row window and ideal 240 s cycle are explicit assumptions. */
export function estimateCaseOee(row: typeof CASE_LINES[number]) {
  const availability = row.operatingHours / 8;
  const performance = row.actual * 240 / (row.operatingHours * 3600);
  const quality = (row.actual - row.rejects) / row.actual;
  return { availability, performance, quality, oee: availability * performance * quality, exceedsIdeal: performance > 1 + 1e-9 };
}
export function createCaseConfig(plan: ProductionPlan = CASE_PLAN): ProductionConfig {
  const summary = summarizePlan(plan);
  return {
    schemaVersion: 1, name: 'АЛЛЮР · тестовый кейс · октябрь 2026',
    source: { kind: 'provided', label: CASE_SOURCE },
    shiftSeconds: 28800, shiftPlan: summary.shiftTarget,
    supplyIntervalSeconds: Math.max(1, Math.floor(28800 / summary.shiftTarget)),
    // Final inspection data are absent. Assembly rejects are a labelled proxy, not the final plant yield.
    rejectRate: 3 / 240, conveyorSpeed: 0.5,
    stations: [
      { id: 'welding', cycleSeconds: Math.round(caseStationMetrics('welding').effectiveCycleSeconds), bufferCapacity: 8 },
      { id: 'painting', cycleSeconds: Math.round(caseStationMetrics('painting').effectiveCycleSeconds), bufferCapacity: 8 },
      { id: 'assembly', cycleSeconds: Math.round(caseStationMetrics('assembly').effectiveCycleSeconds), bufferCapacity: 8 },
      { id: 'quality', cycleSeconds: 180, bufferCapacity: 8 },
    ],
    productionPlan: structuredClone(plan),
  };
}
