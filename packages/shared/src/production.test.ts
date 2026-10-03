import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRODUCTION_CONFIG,
  HISTORY_CSV_TEMPLATE,
  CANONICAL_STATION_IDS,
  parseProductionConfig,
  parseHistoricalCsv,
  type ProductionConfig
} from './production';

describe('production shared contract & config validator', () => {
  it('exports canonical constants and matching default configuration', () => {
    expect(CANONICAL_STATION_IDS).toEqual(['welding', 'painting', 'assembly', 'quality']);

    const res = parseProductionConfig(DEFAULT_PRODUCTION_CONFIG);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toEqual(DEFAULT_PRODUCTION_CONFIG);
      expect(res.warnings).toEqual([]);
    }
  });

  it('returns a detached value that does not mutate or share references with input', () => {
    const cloned = JSON.parse(JSON.stringify(DEFAULT_PRODUCTION_CONFIG));
    const res = parseProductionConfig(cloned);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).not.toBe(cloned);
      expect(res.value.stations).not.toBe(cloned.stations);
      expect(res.value.source).not.toBe(cloned.source);
      res.value.name = 'Новое имя';
      expect(cloned.name).toBe('Учебная линия');
    }
  });

  it('normalizes station order to canonical sequence: welding, painting, assembly, quality', () => {
    const shuffledConfig: ProductionConfig = {
      ...DEFAULT_PRODUCTION_CONFIG,
      stations: [
        { id: 'quality', cycleSeconds: 180, bufferCapacity: 8 },
        { id: 'assembly', cycleSeconds: 360, bufferCapacity: 8 },
        { id: 'welding', cycleSeconds: 240, bufferCapacity: 8 },
        { id: 'painting', cycleSeconds: 300, bufferCapacity: 8 }
      ]
    };
    const res = parseProductionConfig(shuffledConfig);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.stations.map(s => s.id)).toEqual(['welding', 'painting', 'assembly', 'quality']);
    }
  });

  it('rejects unknown root keys and missing required keys', () => {
    const withExtra = { ...DEFAULT_PRODUCTION_CONFIG, extraKey: 'unexpected' };
    const resExtra = parseProductionConfig(withExtra);
    expect(resExtra.ok).toBe(false);
    if (!resExtra.ok) {
      expect(resExtra.issues.some(i => i.path === 'extraKey')).toBe(true);
    }

    const missingShift = { ...DEFAULT_PRODUCTION_CONFIG } as any;
    delete missingShift.shiftSeconds;
    const resMissing = parseProductionConfig(missingShift);
    expect(resMissing.ok).toBe(false);
    if (!resMissing.ok) {
      expect(resMissing.issues.some(i => i.path === 'shiftSeconds')).toBe(true);
    }
  });

  it('rejects non-object root inputs', () => {
    expect(parseProductionConfig(null).ok).toBe(false);
    expect(parseProductionConfig([]).ok).toBe(false);
    expect(parseProductionConfig('invalid').ok).toBe(false);
    expect(parseProductionConfig(123).ok).toBe(false);
  });

  it('validates schemaVersion strictly equals 1', () => {
    const invalid = { ...DEFAULT_PRODUCTION_CONFIG, schemaVersion: 2 };
    const res = parseProductionConfig(invalid);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some(i => i.path === 'schemaVersion')).toBe(true);
    }
  });

  it('validates and trims name (nonempty, <=80 chars)', () => {
    const emptyName = { ...DEFAULT_PRODUCTION_CONFIG, name: '   ' };
    expect(parseProductionConfig(emptyName).ok).toBe(false);

    const tooLongName = { ...DEFAULT_PRODUCTION_CONFIG, name: 'А'.repeat(81) };
    expect(parseProductionConfig(tooLongName).ok).toBe(false);

    const maxName = { ...DEFAULT_PRODUCTION_CONFIG, name: '  ' + 'А'.repeat(80) + '  ' };
    const res = parseProductionConfig(maxName);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.name).toBe('А'.repeat(80));
    }
  });

  it('validates source sub-object strictly (kind, label length <= 120, no unknown keys)', () => {
    const badKind = {
      ...DEFAULT_PRODUCTION_CONFIG,
      source: { kind: 'manual' as any, label: 'test' }
    };
    expect(parseProductionConfig(badKind).ok).toBe(false);

    const badLabel = {
      ...DEFAULT_PRODUCTION_CONFIG,
      source: { kind: 'synthetic' as const, label: 'B'.repeat(121) }
    };
    expect(parseProductionConfig(badLabel).ok).toBe(false);

    const sourceWithExtra = {
      ...DEFAULT_PRODUCTION_CONFIG,
      source: { kind: 'synthetic' as const, label: 'Ok', extra: 123 as any }
    };
    const resExtra = parseProductionConfig(sourceWithExtra);
    expect(resExtra.ok).toBe(false);
    if (!resExtra.ok) {
      expect(resExtra.issues.some(i => i.path === 'source.extra')).toBe(true);
    }
  });

  it('validates numerical ranges and integer constraints', () => {
    // shiftSeconds 60..86400 integer
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftSeconds: 59 }).ok).toBe(false);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftSeconds: 60 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftSeconds: 86400 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftSeconds: 86401 }).ok).toBe(false);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftSeconds: 100.5 }).ok).toBe(false);

    // shiftPlan 1..100000 integer
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftPlan: 0 }).ok).toBe(false);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftPlan: 1 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftPlan: 100000 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, shiftPlan: 100001 }).ok).toBe(false);

    // supplyIntervalSeconds 1..3600 integer
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, supplyIntervalSeconds: 0 }).ok).toBe(false);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, supplyIntervalSeconds: 1 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, supplyIntervalSeconds: 3600 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, supplyIntervalSeconds: 3601 }).ok).toBe(false);

    // rejectRate 0..1 finite number
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, rejectRate: -0.01 }).ok).toBe(false);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, rejectRate: 0 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, rejectRate: 1 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, rejectRate: 1.01 }).ok).toBe(false);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, rejectRate: NaN }).ok).toBe(false);

    // conveyorSpeed 0.05..2 finite number
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, conveyorSpeed: 0.049 }).ok).toBe(false);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, conveyorSpeed: 0.05 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, conveyorSpeed: 2 }).ok).toBe(true);
    expect(parseProductionConfig({ ...DEFAULT_PRODUCTION_CONFIG, conveyorSpeed: 2.01 }).ok).toBe(false);
  });

  it('validates stations count, canonical IDs, cycles (1..3600) and buffers (1..9)', () => {
    // Exactly 4 stations required
    const threeStations = { ...DEFAULT_PRODUCTION_CONFIG, stations: DEFAULT_PRODUCTION_CONFIG.stations.slice(0, 3) };
    expect(parseProductionConfig(threeStations).ok).toBe(false);

    // Duplicate station ID
    const duplicateId = {
      ...DEFAULT_PRODUCTION_CONFIG,
      stations: [
        { id: 'welding' as const, cycleSeconds: 240, bufferCapacity: 8 },
        { id: 'welding' as const, cycleSeconds: 240, bufferCapacity: 8 },
        { id: 'assembly' as const, cycleSeconds: 360, bufferCapacity: 8 },
        { id: 'quality' as const, cycleSeconds: 180, bufferCapacity: 8 }
      ]
    };
    expect(parseProductionConfig(duplicateId).ok).toBe(false);

    // Cycle seconds boundary 1..3600
    const badCycle = {
      ...DEFAULT_PRODUCTION_CONFIG,
      stations: DEFAULT_PRODUCTION_CONFIG.stations.map((s, idx) => idx === 0 ? { ...s, cycleSeconds: 3601 } : s)
    };
    expect(parseProductionConfig(badCycle).ok).toBe(false);

    // Buffer capacity boundary 1..9
    const badBuffer = {
      ...DEFAULT_PRODUCTION_CONFIG,
      stations: DEFAULT_PRODUCTION_CONFIG.stations.map((s, idx) => idx === 0 ? { ...s, bufferCapacity: 10 } : s)
    };
    expect(parseProductionConfig(badBuffer).ok).toBe(false);
  });
});

describe('historical CSV parser', () => {
  it('bounds pathological row width, field length, and blank rows without partially accepting data', () => {
    for (const csv of [','.repeat(500000), 'x'.repeat(500000), HISTORY_CSV_TEMPLATE.replace('\n3600', '\n\n3600')]) {
      const parsed = parseHistoricalCsv(csv, 'bad.csv');
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.issues.length).toBeLessThanOrEqual(101);
    }
    expect(parseHistoricalCsv(HISTORY_CSV_TEMPLATE + '\n'.repeat(100000), 'blank-tail.csv').ok).toBe(true);
  });
  it('parses HISTORY_CSV_TEMPLATE successfully with warning regarding label only', () => {
    const res = parseHistoricalCsv(HISTORY_CSV_TEMPLATE, 'synthetic_sample.csv');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.name).toBe('synthetic_sample.csv');
      expect(res.value.records.length).toBe(9);
      expect(res.value.records[0]).toEqual({
        elapsedSeconds: 0,
        goodUnits: 0,
        rejectedUnits: 0,
        wip: 0,
        planUnits: 0,
        downtimeSeconds: 0
      });
      expect(res.warnings.length).toBe(1);
      expect(res.warnings[0]).toContain('synthetic_sample.csv');
    }
  });

  it('supports semicolon delimiters and optional UTF-8 BOM', () => {
    const semiCsv = [
      '\uFEFFelapsed_seconds;good_units;rejected_units;wip;plan_units;downtime_seconds',
      '0;0;0;0;0;0',
      '60;1;0;1;1.5;10'
    ].join('\r\n');

    const res = parseHistoricalCsv(semiCsv, 'semicolon_test.csv');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.records.length).toBe(2);
      expect(res.value.records[1].planUnits).toBe(1.5);
    }
  });

  it('supports column headers in any order', () => {
    const reordered = [
      'downtime_seconds,wip,good_units,plan_units,rejected_units,elapsed_seconds',
      '0,0,0,0,0,0',
      '120,4,2,3.5,1,100'
    ].join('\n');

    const res = parseHistoricalCsv(reordered, 'reordered.csv');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.records[1]).toEqual({
        elapsedSeconds: 100,
        goodUnits: 2,
        rejectedUnits: 1,
        wip: 4,
        planUnits: 3.5,
        downtimeSeconds: 120
      });
    }
  });

  it('handles quotes, escaped quotes, and trailing empty lines', () => {
    const csvWithQuotes = [
      '"elapsed_seconds","good_units","rejected_units","wip","plan_units","downtime_seconds"',
      '"0","0","0","0","0","0"',
      '"100","5","1","3","6.0","20"',
      '',
      '   ',
      ''
    ].join('\n');

    const res = parseHistoricalCsv(csvWithQuotes, 'quoted.csv');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.records.length).toBe(2);
    }
  });

  it('rejects malformed quotes and illegal characters after closing quotes', () => {
    const unclosedQuote = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '100,"5,1,3,6,20'
    ].join('\n');
    expect(parseHistoricalCsv(unclosedQuote, 'bad.csv').ok).toBe(false);

    const charsAfterQuote = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '"100"abc,5,1,3,6,20'
    ].join('\n');
    expect(parseHistoricalCsv(charsAfterQuote, 'bad2.csv').ok).toBe(false);
  });

  it('rejects empty cells and does not silently coerce empty to zero', () => {
    const emptyCell = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '100,,1,3,6,20'
    ].join('\n');
    const res = parseHistoricalCsv(emptyCell, 'empty_cell.csv');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some(i => i.message.includes('не может быть пустым'))).toBe(true);
    }
  });

  it('rejects unknown or missing headers and wrong row widths', () => {
    const badHeader = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,unknown_col',
      '0,0,0,0,0,0',
      '100,1,0,0,1,0'
    ].join('\n');
    expect(parseHistoricalCsv(badHeader, 'bad_header.csv').ok).toBe(false);

    const wrongWidth = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '100,1,0,0,1'
    ].join('\n');
    expect(parseHistoricalCsv(wrongWidth, 'wrong_width.csv').ok).toBe(false);
  });

  it('requires minimum 2 records and rejects files with fewer records', () => {
    const singleRecord = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0'
    ].join('\n');
    const res = parseHistoricalCsv(singleRecord, 'single.csv');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some(i => i.message.includes('как минимум 2'))).toBe(true);
    }
  });

  it('enforces strictly increasing elapsed_seconds (rejects duplicates and out-of-order)', () => {
    const duplicateTime = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '100,1,0,1,1,0',
      '100,2,0,1,2,0'
    ].join('\n');
    expect(parseHistoricalCsv(duplicateTime, 'dup_time.csv').ok).toBe(false);

    const backwardsTime = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '200,1,0,1,1,0',
      '150,2,0,1,2,0'
    ].join('\n');
    expect(parseHistoricalCsv(backwardsTime, 'back_time.csv').ok).toBe(false);
  });

  it('enforces nondecreasing cumulative values for good, rejected, plan, and downtime', () => {
    const decreasingGood = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '60,5,0,2,5,0',
      '120,4,0,2,5,0'
    ].join('\n');
    expect(parseHistoricalCsv(decreasingGood, 'dec_good.csv').ok).toBe(false);

    const decreasingRejected = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,2,0,0,0',
      '60,0,1,0,0,0'
    ].join('\n');
    expect(parseHistoricalCsv(decreasingRejected, 'dec_rej.csv').ok).toBe(false);

    const decreasingPlan = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,10,0',
      '60,0,0,0,9.5,0'
    ].join('\n');
    expect(parseHistoricalCsv(decreasingPlan, 'dec_plan.csv').ok).toBe(false);

    const decreasingDowntime = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,100',
      '60,0,0,0,0,90'
    ].join('\n');
    expect(parseHistoricalCsv(decreasingDowntime, 'dec_dt.csv').ok).toBe(false);
  });

  it('allows WIP to fluctuate up or down non-cumulatively', () => {
    const fluctuatingWip = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,10,0,0',
      '60,2,0,5,2,0',
      '120,4,0,8,4,0'
    ].join('\n');
    expect(parseHistoricalCsv(fluctuatingWip, 'wip.csv').ok).toBe(true);
  });

  it('handles zero produced and rejected units cleanly without denominator division error', () => {
    const zeroQualityDenominator = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '60,0,0,0,1,0'
    ].join('\n');
    const res = parseHistoricalCsv(zeroQualityDenominator, 'zero_quality.csv');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.records[0].goodUnits).toBe(0);
      expect(res.value.records[0].rejectedUnits).toBe(0);
    }
  });

  it('enforces downtime limits: cumulative <= 4*elapsed and step increase <= 4*timeDelta', () => {
    // Cumulative downtime exceeds 4 * elapsed
    const excessiveCumulativeDowntime = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '10,0,0,0,0,45'
    ].join('\n');
    expect(parseHistoricalCsv(excessiveCumulativeDowntime, 'dt_cum.csv').ok).toBe(false);

    // Downtime step increase exceeds 4 * timeDelta
    const excessiveStepDowntime = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '100,0,0,0,0,400',
      '110,0,0,0,0,450'
    ].join('\n');
    expect(parseHistoricalCsv(excessiveStepDowntime, 'dt_step.csv').ok).toBe(false);

    // Valid downtime exceeding elapsed time (since 4 equipment combined can sum up to 4*elapsed)
    const validCombinedDowntime = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '0,0,0,0,0,0',
      '100,0,0,0,0,250'
    ].join('\n');
    expect(parseHistoricalCsv(validCombinedDowntime, 'dt_valid.csv').ok).toBe(true);
  });

  it('emits warnings for partial history (elapsed > 0) and large time gaps (> 3600s)', () => {
    const withWarnings = [
      'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
      '300,5,0,2,5,0',
      '4000,10,1,3,10,0'
    ].join('\n');

    const res = parseHistoricalCsv(withWarnings, 'partial.csv');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.warnings.some(w => w.includes('частичную историю'))).toBe(true);
      expect(res.warnings.some(w => w.includes('3700 с'))).toBe(true);
      expect(res.warnings.some(w => w.includes('partial.csv'))).toBe(true);
    }
  });

  it('caps diagnostics to 100 issues on pathological inputs and does not partially apply bad data', () => {
    const badRows = ['elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds'];
    for (let i = 0; i < 150; i++) {
      badRows.push(`${i * 10},invalid_number,0,0,0,0`);
    }
    const res = parseHistoricalCsv(badRows.join('\n'), 'bad_rows.csv');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.length).toBe(101);
      expect(res.issues[100].path).toBe('диагностика');
      expect(res.issues[100].message).toContain('100');
    }
  });

  it('rejects files exceeding the 2 MiB UTF-8 size limit', () => {
    const largeText = 'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds\n' + '0,0,0,0,0,0\n'.repeat(200000);
    const res = parseHistoricalCsv(largeText, 'huge.csv');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some(i => /2 М[Би]/.test(i.message))).toBe(true);
    }
  });
});
