import type { PlantSnapshot, ScenarioId } from '@kosta/shared';
// Contract skeleton. Assigned to the simulation implementer.
export interface EngineOptions { seed?: number; scenario?: ScenarioId }
export interface Engine { readonly seed: number; readonly scenario: ScenarioId }
export function createEngine(options: EngineOptions = {}): Engine { return { seed: options.seed ?? 42, scenario: options.scenario ?? 'normal' }; }
export function advanceEngine(_engine: Engine, _seconds: number): void { throw new Error('Simulation implementation pending'); }
export function getSnapshot(_engine: Engine): PlantSnapshot { throw new Error('Simulation implementation pending'); }
