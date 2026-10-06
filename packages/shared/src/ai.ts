import type { SessionSnapshot, StationId, StationStatus } from './index';
import { CANONICAL_STATION_IDS } from './production';
import { summarizePlan } from './planning';
import { CASE_SOURCE } from './caseData';

export const AI_MODEL = 'gpt-6.1-sol';
export const AI_MODEL_LABEL = 'GPT-6.1 Sol';
export const AI_STATION_NAMES: Record<StationId, string> = { welding: 'Сварка', painting: 'Окраска', assembly: 'Сборка', quality: 'Контроль качества' };
export interface AiInput {
  version: 1;
  includeCaseHistory: boolean;
  elapsedSeconds: number;
  shiftSeconds: number;
  shiftPlan: number;
  goodUnits: number;
  rejectedUnits: number;
  wip: number;
  remainingOrderUnits: number;
  unallocatedMonthlyUnits: number;
  supplyIntervalSeconds: number;
  rejectRate: number;
  horizonMinutes: 15 | 30 | 60;
  stations: { id: StationId; status: StationStatus; inputQueue: number; bufferCapacity: number; cycleSeconds: number; utilizationPercent: number; downtimeSeconds: number }[];
}
export interface CapacityRisk {
  stationId: StationId;
  capacityPerHour: number;
  incomingPerHour: number;
  queueNow: number;
  queueAtHorizon: number;
  minutesToFull: number | null;
  loadPercent: number;
  level: 'low' | 'medium' | 'high';
  stopped: boolean;
}
export interface AiIndicators {
  horizonMinutes: number;
  requiredPerHour: number;
  lineCapacityPerHour: number;
  bottleneckStationId: StationId;
  shiftEnded: boolean;
  ordersExhausted: boolean;
  stations: CapacityRisk[];
}
export interface AiFinding {
  stationId: StationId | 'line';
  kind: 'downtime' | 'bottleneck' | 'plan' | 'quality';
  level: 'low' | 'medium' | 'high';
  title: string;
  evidence: string;
  forecast: string;
  action: string;
  confidence: 'low' | 'medium';
}
export interface AiReport {
  summary: string;
  findings: AiFinding[];
  nextSteps: string[];
  limitation: string;
}
export interface AiAnalysis {
  report: AiReport;
  model: string;
  createdAt: string;
  input: AiInput;
  indicators: AiIndicators;
  cached: boolean;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
}
export interface AiStatus { configured: boolean; model: string; accessRequired: boolean; authorized: boolean }

/** Only numeric observations and fixed enums cross the API boundary: no files, free text, scenario schedule or future incidents. */
export function createAiInput(snapshot: SessionSnapshot, horizonMinutes: AiInput['horizonMinutes'] = 30): AiInput {
  const plan = snapshot.config.productionPlan ? summarizePlan(snapshot.config.productionPlan) : null;
  return {
    version: 1, includeCaseHistory: snapshot.config.source.label === CASE_SOURCE,
    elapsedSeconds: Math.floor(snapshot.elapsedSeconds), shiftSeconds: snapshot.shiftSeconds,
    shiftPlan: snapshot.shiftPlan, goodUnits: snapshot.goodUnits, rejectedUnits: snapshot.rejectedUnits, wip: snapshot.wip,
    remainingOrderUnits: Math.max(0, (plan?.assignedShift ?? snapshot.shiftPlan) - snapshot.goodUnits),
    unallocatedMonthlyUnits: plan?.unallocated ?? 0,
    supplyIntervalSeconds: snapshot.config.supplyIntervalSeconds, rejectRate: snapshot.config.rejectRate, horizonMinutes,
    stations: CANONICAL_STATION_IDS.map(id => {
      const station = snapshot.stations.find(item => item.id === id)!;
      return { id, status: station.status, inputQueue: station.inputQueue, bufferCapacity: station.bufferCapacity,
        cycleSeconds: station.cycleSeconds, utilizationPercent: Math.round(station.utilizationPercent * 10) / 10,
        downtimeSeconds: Math.floor(station.downtimeSeconds) };
    }),
  };
}

/** Fluid capacity estimate, not a trained failure predictor. Excludes scheduled scenario events deliberately. */
export function calculateAiIndicators(input: AiInput): AiIndicators {
  const remainingSeconds = Math.max(0, input.shiftSeconds - input.elapsedSeconds);
  const horizonMinutes = Math.min(input.horizonMinutes, remainingSeconds / 60);
  const requiredPerHour = remainingSeconds > 0 ? Math.max(0, input.shiftPlan - input.goodUnits) * 3600 / remainingSeconds : 0;
  const nominal = input.stations.map(station => 3600 / station.cycleSeconds);
  const bottleneckIndex = nominal.indexOf(Math.min(...nominal));
  const lineCapacityPerHour = Math.min(3600 / input.supplyIntervalSeconds, ...nominal) * (1 - input.rejectRate);
  let incoming = remainingSeconds > 0 && input.remainingOrderUnits > input.wip ? 3600 / input.supplyIntervalSeconds : 0;
  const stations = input.stations.map(station => {
    const capacityPerHour = 3600 / station.cycleSeconds;
    const stopped = station.status === 'stopped';
    const outgoing = stopped ? 0 : capacityPerHour;
    const growth = incoming - outgoing;
    const hasWork = input.remainingOrderUnits > 0 && remainingSeconds > 0;
    const minutesToFull = hasWork && station.inputQueue >= station.bufferCapacity ? 0
      : hasWork && growth > 0 ? (station.bufferCapacity - station.inputQueue) / growth * 60 : null;
    const queueAtHorizon = Math.max(0, Math.min(station.bufferCapacity, input.remainingOrderUnits, station.inputQueue + growth * horizonMinutes / 60));
    const loadPercent = capacityPerHour > 0 ? requiredPerHour / (1 - input.rejectRate) / capacityPerHour * 100 : 0;
    const level = !hasWork ? 'low' : stopped || station.status === 'blocked' || (minutesToFull !== null && minutesToFull <= horizonMinutes) ? 'high'
      : loadPercent > 100 || station.inputQueue / station.bufferCapacity >= .5 ? 'medium' : 'low';
    const result: CapacityRisk = { stationId: station.id, capacityPerHour, incomingPerHour: incoming, queueNow: station.inputQueue,
      queueAtHorizon, minutesToFull, loadPercent, level, stopped };
    incoming = stopped || remainingSeconds === 0 ? 0 : Math.min(capacityPerHour, incoming + station.inputQueue / Math.max(horizonMinutes / 60, 1 / 60));
    return result;
  });
  return { horizonMinutes, requiredPerHour, lineCapacityPerHour, bottleneckStationId: input.stations[bottleneckIndex].id,
    shiftEnded: remainingSeconds === 0, ordersExhausted: input.remainingOrderUnits === 0, stations };
}
