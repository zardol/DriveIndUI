import { SHIFT_PLAN, SHIFT_SECONDS, advanceEngine, cloneEngine, applyConditions } from './engine';
import type { Engine, ScenarioEvent } from './engine';
import type { ComparisonOptions, ComparisonResult, ComparisonAlternative, DecisionId } from '@kosta/shared';

export function compareEngine(source: Engine, options: ComparisonOptions): ComparisonResult {
  if (!options) throw new RangeError('Options are required');

  const validMaintenance = [5, 10, 15, 20];
  const validReserve = [0, 5, 10, 15];

  if (!validMaintenance.includes(options.maintenanceMinutes)) {
    throw new RangeError(`Invalid maintenanceMinutes: ${options.maintenanceMinutes}`);
  }
  if (!validReserve.includes(options.reserveSetupMinutes)) {
    throw new RangeError(`Invalid reserveSetupMinutes: ${options.reserveSetupMinutes}`);
  }

  const now = source.elapsedSeconds;

  const makeAlt = (
    id: DecisionId,
    title: string,
    description: string,
    eng: Engine,
    baseEng?: Engine
  ): ComparisonAlternative => {
    const downtime = eng.stations.reduce((sum, s) => sum + s.downtimeSeconds, 0);
    const baseDowntime = baseEng ? baseEng.stations.reduce((sum, s) => sum + s.downtimeSeconds, 0) : downtime;
    const baseUnits = baseEng ? baseEng.goodUnits : eng.goodUnits;

    let wip = 0;
    for (const st of eng.stations) wip += st.queue + (st.inProcess ? 1 : 0);

    return {
      id,
      title,
      description,
      introducedUnits: eng.introducedUnits,
      goodUnits: eng.goodUnits,
      rejectedUnits: eng.rejectedUnits,
      wip,
      downtimeSeconds: downtime,
      planGap: eng.goodUnits - SHIFT_PLAN,
      deltaGoodUnits: eng.goodUnits - baseUnits,
      deltaDowntimeSeconds: downtime - baseDowntime,
      history: eng.history.map(h => ({ ...h }))
    };
  };

  const alternatives: ComparisonAlternative[] = [];

  // 1. Baseline
  const base = cloneEngine(source);
  advanceEngine(base, SHIFT_SECONDS - now);
  alternatives.push(makeAlt(
    'baseline',
    'Продолжить смену',
    'Никаких вмешательств. Линия продолжает работу по текущему сценарию.',
    base,
    base
  ));

  // 2. Maintenance
  let maint = cloneEngine(source);
  if (now < SHIFT_SECONDS) {
    const duration = options.maintenanceMinutes * 60;
    const newEvents: ScenarioEvent[] = [];
    for (const ev of maint.events) {
      if (ev.stationId === 'painting') {
        if (ev.fromSeconds > now) continue; // A just-opened incident must still be resolved.
        if (ev.toSeconds === null || ev.toSeconds > now) {
          newEvents.push({ ...ev, toSeconds: now }); // Truncate active
        } else {
          newEvents.push(ev); // Keep historical
        }
      } else {
        newEvents.push(ev);
      }
    }
    newEvents.push({
      id: `maint-painting-${now}`,
      stationId: 'painting',
      kind: 'stop',
      cycleFactor: 1,
      fromSeconds: now,
      toSeconds: now + duration,
      severity: 'warning',
      title: 'Техническое обслуживание (Окраска)',
      description: `Внеплановое обслуживание окрасочной установки (${options.maintenanceMinutes} мин).`
    });
    maint = { ...maint, events: newEvents };
    applyConditions(maint);
  }
  advanceEngine(maint, SHIFT_SECONDS - now);
  alternatives.push(makeAlt(
    'maintenance',
    'Обслужить окраску',
    `Остановка окраски на ${options.maintenanceMinutes} минут для устранения всех неисправностей. После этого окраска работает на номинальной скорости.`,
    maint,
    base
  ));

  // 3. Reserve
  let reserve = cloneEngine(source);
  const setupDuration = options.reserveSetupMinutes * 60;
  if (now < SHIFT_SECONDS) {
    if (setupDuration > 0) {
      const newEvents: ScenarioEvent[] = [...reserve.events, {
        id: `reserve-setup-${now}`,
        stationId: 'assembly',
        kind: 'stop',
        cycleFactor: 1,
        fromSeconds: now,
        toSeconds: now + setupDuration,
        severity: 'warning',
        title: 'Подготовка резерва (Сборка)',
        description: `Остановка сборки на ${options.reserveSetupMinutes} мин для ввода резервной мощности.`
      }];
      reserve = { ...reserve, events: newEvents };
    }
    const assembly = reserve.stations.find(s => s.def.id === 'assembly');
    if (assembly) {
      assembly.capacityMultiplier = 2;
    }
    applyConditions(reserve);
  }
  advanceEngine(reserve, SHIFT_SECONDS - now);
  alternatives.push(makeAlt(
    'reserve',
    'Резерв мощности сборки',
    setupDuration > 0
      ? `Остановка сборки на ${options.reserveSetupMinutes} мин, затем удвоение скорости обработки участка. Общий выпуск ограничен остальной линией.`
      : 'Удвоение скорости обработки сборки без остановки. Общий выпуск ограничен остальной линией.',
    reserve,
    base
  ));

  const assumptions = [
    'Расписание событий сценария известно точно (без прогнозирования).',
    'Вероятность брака каждого изделия — 3%. Последовательность случайных исходов одинакова во всех ветвях; фактическая доля зависит от числа завершённых изделий.',
    'Буферы ограничены. Кузов предлагается каждые 240 секунд; при полном входном буфере поступление пропускается.',
    'Экономические затраты на ремонт и резерв не учитываются.',
    'Резерв удваивает скорость обработки сборки. Это приближение мощности, а не модель двух параллельных постов. Сценарное замедление сборки сохраняется.',
    'Обслуживание гарантированно устраняет будущие отказы окрасочной установки до конца смены.'
  ];

  return {
    scenario: source.scenario,
    fromSeconds: now,
    toSeconds: SHIFT_SECONDS,
    shiftPlan: SHIFT_PLAN,
    options: { ...options },
    assumptions,
    alternatives
  };
}
