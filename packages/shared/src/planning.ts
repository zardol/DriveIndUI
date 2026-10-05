export const PRODUCT_MODELS = [
  { id: 'onix', name: 'Chevrolet Onix', color: '#2d9ca6' },
  { id: 'cobalt', name: 'Chevrolet Cobalt', color: '#e4ad50' },
  { id: 'j7', name: 'JAC J7', color: '#8b83c6' },
] as const;
export type ProductModelId = typeof PRODUCT_MODELS[number]['id'];
export interface ProductionPlan {
  month: '2026-10';
  workingDays: number;
  shiftsPerDay: 2;
  monthlyTarget: number;
  shiftIndex: number;
  models: { id: ProductModelId; monthlyUnits: number }[];
}
export interface ProductProgress {
  id: ProductModelId;
  plannedUnits: number;
  introducedUnits: number;
  goodUnits: number;
  rejectedUnits: number;
  wip: number;
}

/** Cumulative integer apportionment: all shifts sum to the exact monthly quantity. */
export function shiftQuota(monthlyUnits: number, shiftIndex: number, shifts: number): number {
  return Math.floor(monthlyUnits * (shiftIndex + 1) / shifts) - Math.floor(monthlyUnits * shiftIndex / shifts);
}
export function summarizePlan(plan: ProductionPlan) {
  const shifts = plan.workingDays * plan.shiftsPerDay;
  const allocated = plan.models.reduce((sum, model) => sum + model.monthlyUnits, 0);
  const target = Math.max(plan.monthlyTarget, allocated);
  const models = plan.models.map(model => ({ ...model, shiftUnits: shiftQuota(model.monthlyUnits, plan.shiftIndex, shifts) }));
  const assignedShift = models.reduce((sum, model) => sum + model.shiftUnits, 0);
  const unallocated = Math.max(0, target - allocated);
  const unallocatedShift = shiftQuota(unallocated, plan.shiftIndex, shifts);
  return { shifts, allocated, target, unallocated, models, assignedShift, unallocatedShift,
    shiftTarget: assignedShift + unallocatedShift, dailyAverage: target / plan.workingDays,
    shiftAverage: target / shifts, requiredTaktSeconds: 28800 * shifts / target };
}

export function validateProductionPlan(raw: unknown): { value?: ProductionPlan; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['Ожидается объект месячного плана.'] };
  const value = raw as Record<string, unknown>;
  const keys = ['month', 'workingDays', 'shiftsPerDay', 'monthlyTarget', 'shiftIndex', 'models'];
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) errors.push('Неполный план или неизвестные поля.');
  if (value.month !== '2026-10') errors.push('Месяц кейса: 2026-10.');
  const integer = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  if (!integer(value.workingDays, 1, 31)) errors.push('Рабочих дней должно быть от 1 до 31.');
  if (value.shiftsPerDay !== 2) errors.push('В кейсе заданы две смены в сутки.');
  if (!integer(value.monthlyTarget, 5500, 100000)) errors.push('Месячная цель — от 5500 до 100000 автомобилей.');
  if (!integer(value.shiftIndex, 0, typeof value.workingDays === 'number' ? value.workingDays * 2 - 1 : -1)) errors.push('Номер смены вне календаря.');
  if (!Array.isArray(value.models) || value.models.length !== 3) errors.push('Нужны планы Onix, Cobalt и J7.');
  else {
    const ids = new Set<string>();
    for (const model of value.models) {
      if (!model || typeof model !== 'object' || Array.isArray(model) || Object.keys(model).some(key => !['id', 'monthlyUnits'].includes(key))
        || !PRODUCT_MODELS.some(item => item.id === model.id) || ids.has(model.id) || !integer(model.monthlyUnits, 0, 100000)) {
        errors.push('Планы моделей должны иметь уникальный id и целое количество от 0 до 100000.');
      } else ids.add(model.id);
    }
    if (!errors.length && (value.models as ProductionPlan['models']).reduce((sum, model) => sum + model.monthlyUnits, 0) > 100000) errors.push('Общий план моделей не должен превышать 100000.');
  }
  if (errors.length) return { errors };
  const plan = structuredClone(value) as unknown as ProductionPlan;
  plan.models = PRODUCT_MODELS.map(model => plan.models.find(item => item.id === model.id)!);
  if (summarizePlan(plan).shiftTarget < 1) errors.push('Выбранная смена не содержит плана.');
  return errors.length ? { errors } : { value: plan, errors };
}
