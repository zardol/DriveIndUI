import type { ProductionConfig, ProductionStationId } from './production';
export * from './production';
export * from './planning';
export * from './caseData';
export * from './ai';

export type StationId = ProductionStationId;
export type StationStatus = 'running' | 'idle' | 'blocked' | 'stopped' | 'warning';
export type ScenarioId = 'normal' | 'equipment' | 'bottleneck';
export type Speed = 1 | 10 | 60;

export interface StationDefinition {
  id: StationId;
  name: string;
  description: string;
  cycleSeconds: number;
  bufferCapacity: number;
}

export const STATIONS: readonly StationDefinition[] = [
  { id: 'welding', name: 'Сварка', description: 'Подготовка и сварка кузова', cycleSeconds: 240, bufferCapacity: 8 },
  { id: 'painting', name: 'Окраска', description: 'Нанесение защитного покрытия', cycleSeconds: 300, bufferCapacity: 8 },
  { id: 'assembly', name: 'Сборка', description: 'Установка узлов и агрегатов', cycleSeconds: 360, bufferCapacity: 8 },
  { id: 'quality', name: 'Контроль качества', description: 'Финальная проверка автомобиля', cycleSeconds: 180, bufferCapacity: 8 },
];

export const SCENARIOS: readonly { id: ScenarioId; name: string; description: string }[] = [
  { id: 'normal', name: 'Штатная работа', description: 'Производственная линия работает без аварий.' },
  { id: 'equipment', name: 'Сбой оборудования', description: 'Износ окрасочной установки приводит к замедлению и остановке.' },
  { id: 'bottleneck', name: 'Узкое место', description: 'Снижение мощности сборки вызывает накопление очереди.' },
];

export interface StationSnapshot {
  id: StationId;
  name: string;
  status: StationStatus;
  inputQueue: number;
  queuedUnits: number; // stationary vehicles in the incoming buffer
  arrivingUnits: number; // moving vehicles in the incoming buffer
  bufferCapacity: number;
  inProcess: boolean;
  progress: number; // 0..1; completed item may wait at 1 if downstream buffer is full
  cycleSeconds: number;
  completed: number;
  utilizationPercent: number; // busy seconds / elapsed seconds * 100
  downtimeSeconds: number; // equipment stopped only; not idle or blocked
  throughputPerHour: number;
}

export interface Incident {
  id: string;
  stationId: StationId;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  startedAtSeconds: number;
  resolvedAtSeconds: number | null;
}

export interface HistoryPoint {
  elapsedSeconds: number;
  goodUnits: number;
  planUnits: number;
  wip: number;
}

/** The logical conveyor is independent of the uploaded display layout. */
export const CONVEYOR_SPEC = {
  segmentLength: 40,
  speed: 0.5,
  minSpacing: 4,
  stationDistances: [40, 80, 120, 160],
  length: 200,
} as const;

export interface ConveyorVehicleSnapshot {
  modelId?: import('./planning').ProductModelId;
  id: string;
  serial: number;
  distance: number;
  speed: number; // actual distance travelled during the last simulated second
  stage: StationId | 'outbound';
  state: 'moving' | 'queued' | 'processing' | 'blocked';
  appearance: 'body' | 'painted' | 'assembled';
  outcome: 'pending' | 'good' | 'rejected';
}

export interface ConveyorSnapshot {
  length: number;
  stationDistances: number[];
  nominalSpeed: number;
  minSpacing: number;
  vehicles: ConveyorVehicleSnapshot[];
}

export interface PlantSnapshot {
  products?: import('./planning').ProductProgress[];
  config: ProductionConfig;
  scenario: ScenarioId;
  elapsedSeconds: number;
  shiftSeconds: number;
  shiftPlan: number;
  introducedUnits: number;
  goodUnits: number;
  rejectedUnits: number;
  wip: number;
  forecastUnits: number; // simple estimate until the later what-if forecasting phase
  qualityPercent: number | null; // null before first finished unit
  throughputPerHour: number;
  downtimeSeconds: number; // sum across equipment; may exceed wall-clock elapsed
  stations: StationSnapshot[];
  incidents: Incident[];
  history: HistoryPoint[];
  conveyor: ConveyorSnapshot;
}

export interface SessionSnapshot extends PlantSnapshot {
  sessionId: string;
  revision: number;
  running: boolean;
  speed: Speed;
  updatedAt: string;
}

export type ControlCommand =
  | { action: 'play' | 'pause' | 'reset' }
  | { action: 'setSpeed'; speed: Speed }
  | { action: 'setScenario'; scenario: ScenarioId }
  | { action: 'setConfiguration'; config: ProductionConfig };

export interface ApiError { error: string; message: string }

export interface ComparisonOptions {
  maintenanceMinutes: 5 | 10 | 15 | 20;
  reserveSetupMinutes: 0 | 5 | 10 | 15;
}

export type DecisionId = 'baseline' | 'maintenance' | 'reserve';

export interface ComparisonAlternative {
  products?: import('./planning').ProductProgress[];
  id: DecisionId;
  title: string;
  description: string;
  introducedUnits: number;
  goodUnits: number;
  rejectedUnits: number;
  wip: number;
  downtimeSeconds: number;
  planGap: number; // signed: good units minus shift plan
  deltaGoodUnits: number; // relative to baseline
  deltaDowntimeSeconds: number; // relative to baseline; negative means less downtime
  history: HistoryPoint[];
}

export interface ComparisonResult {
  scenario: ScenarioId;
  fromSeconds: number;
  toSeconds: number;
  shiftPlan: number;
  options: ComparisonOptions;
  assumptions: string[];
  alternatives: ComparisonAlternative[];
}

export interface SessionComparison extends ComparisonResult {
  sessionId: string;
  revision: number;
}
