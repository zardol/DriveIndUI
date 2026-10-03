export type ProductionStationId = 'welding' | 'painting' | 'assembly' | 'quality';

export interface ProductionConfig {
  schemaVersion: 1;
  name: string;
  source: {
    kind: 'synthetic' | 'provided';
    label: string;
  };
  shiftSeconds: number;
  shiftPlan: number;
  supplyIntervalSeconds: number;
  rejectRate: number;
  conveyorSpeed: number;
  stations: {
    id: ProductionStationId;
    cycleSeconds: number;
    bufferCapacity: number;
  }[];
}

export const DEFAULT_PRODUCTION_CONFIG: ProductionConfig = {
  schemaVersion: 1,
  name: 'Учебная линия',
  source: {
    kind: 'synthetic',
    label: 'Демонстрационные параметры'
  },
  shiftSeconds: 28800,
  shiftPlan: 70,
  supplyIntervalSeconds: 240,
  rejectRate: 0.03,
  conveyorSpeed: 0.5,
  stations: [
    { id: 'welding', cycleSeconds: 240, bufferCapacity: 8 },
    { id: 'painting', cycleSeconds: 300, bufferCapacity: 8 },
    { id: 'assembly', cycleSeconds: 360, bufferCapacity: 8 },
    { id: 'quality', cycleSeconds: 180, bufferCapacity: 8 }
  ]
};

// Callers receive detached values from the parser; protect the shared defaults too.
for (const station of DEFAULT_PRODUCTION_CONFIG.stations) Object.freeze(station);
Object.freeze(DEFAULT_PRODUCTION_CONFIG.stations);
Object.freeze(DEFAULT_PRODUCTION_CONFIG.source);
Object.freeze(DEFAULT_PRODUCTION_CONFIG);

export type ImportResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; issues: { path: string; message: string }[] };

export interface HistoricalRecord {
  elapsedSeconds: number;
  goodUnits: number;
  rejectedUnits: number;
  wip: number;
  planUnits: number;
  downtimeSeconds: number;
}

export interface HistoricalDataset {
  name: string;
  records: HistoricalRecord[];
}

export const CANONICAL_STATION_IDS: readonly ProductionStationId[] = [
  'welding',
  'painting',
  'assembly',
  'quality'
] as const;

export const HISTORY_CSV_TEMPLATE = [
  'elapsed_seconds,good_units,rejected_units,wip,plan_units,downtime_seconds',
  '0,0,0,0,0,0',
  '3600,8,0,5,8.75,60',
  '7200,17,1,6,17.5,120',
  '10800,26,1,5,26.25,180',
  '14400,35,1,6,35,240',
  '18000,44,2,5,43.75,300',
  '21600,53,2,6,52.5,360',
  '25200,62,2,5,61.25,420',
  '28800,70,3,0,70,480'
].join('\n');

const MAX_ISSUES = 100;

interface IssueCollector {
  issues: { path: string; message: string }[];
  addIssue: (path: string, message: string) => boolean;
}

function createIssueCollector(): IssueCollector {
  const issues: { path: string; message: string }[] = [];
  let truncated = false;

  function addIssue(path: string, message: string): boolean {
    if (issues.length < MAX_ISSUES) {
      issues.push({ path, message });
      return true;
    }
    if (!truncated) {
      truncated = true;
      issues.push({
        path: 'диагностика',
        message: 'Достигнут предел диагностических сообщений (100). Дополнительные ошибки усечены.'
      });
    }
    return false;
  }

  return { issues, addIssue };
}

export function parseProductionConfig(value: unknown): ImportResult<ProductionConfig> {
  const { issues, addIssue } = createIssueCollector();

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ path: '', message: 'Конфигурация должна быть объектом' }]
    };
  }

  const raw = value as Record<string, unknown>;
  const ALLOWED_CONFIG_KEYS = new Set([
    'schemaVersion',
    'name',
    'source',
    'shiftSeconds',
    'shiftPlan',
    'supplyIntervalSeconds',
    'rejectRate',
    'conveyorSpeed',
    'stations'
  ]);
  const REQUIRED_CONFIG_KEYS = [
    'schemaVersion',
    'name',
    'source',
    'shiftSeconds',
    'shiftPlan',
    'supplyIntervalSeconds',
    'rejectRate',
    'conveyorSpeed',
    'stations'
  ];

  for (const k of Object.keys(raw)) {
    if (!ALLOWED_CONFIG_KEYS.has(k)) {
      addIssue(k, `Неизвестное свойство конфигурации: '${k}'`);
    }
  }

  for (const req of REQUIRED_CONFIG_KEYS) {
    if (!Object.hasOwn(raw, req)) {
      addIssue(req, `Отсутствует обязательное свойство: '${req}'`);
    }
  }

  if ('schemaVersion' in raw) {
    if (raw.schemaVersion !== 1) {
      addIssue('schemaVersion', 'Поле schemaVersion должно иметь значение 1');
    }
  }

  let cleanName = '';
  if ('name' in raw) {
    if (typeof raw.name !== 'string') {
      addIssue('name', 'Поле name должно быть строкой');
    } else {
      cleanName = raw.name.trim();
      if (cleanName.length === 0 || cleanName.length > 80) {
        addIssue('name', 'Поле name должно быть непустой строкой длиной до 80 символов');
      }
    }
  }

  let cleanSource: { kind: 'synthetic' | 'provided'; label: string } | null = null;
  if ('source' in raw) {
    const s = raw.source;
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      addIssue('source', 'Поле source должно быть объектом');
    } else {
      const sObj = s as Record<string, unknown>;
      const ALLOWED_SOURCE_KEYS = new Set(['kind', 'label']);
      for (const sk of Object.keys(sObj)) {
        if (!ALLOWED_SOURCE_KEYS.has(sk)) {
          addIssue(`source.${sk}`, `Неизвестное свойство в source: '${sk}'`);
        }
      }
      if (!Object.hasOwn(sObj, 'kind')) {
        addIssue('source.kind', 'Отсутствует обязательное свойство: source.kind');
      } else if (sObj.kind !== 'synthetic' && sObj.kind !== 'provided') {
        addIssue('source.kind', "Поле source.kind должно быть 'synthetic' или 'provided'");
      }

      let cleanLabel = '';
      if (!Object.hasOwn(sObj, 'label')) {
        addIssue('source.label', 'Отсутствует обязательное свойство: source.label');
      } else if (typeof sObj.label !== 'string') {
        addIssue('source.label', 'Поле source.label должно быть строкой');
      } else {
        cleanLabel = sObj.label.trim();
        if (cleanLabel.length === 0 || cleanLabel.length > 120) {
          addIssue('source.label', 'Поле source.label должно быть непустой строкой длиной до 120 символов');
        }
      }

      if (
        (sObj.kind === 'synthetic' || sObj.kind === 'provided') &&
        typeof sObj.label === 'string' &&
        cleanLabel.length > 0 &&
        cleanLabel.length <= 120
      ) {
        cleanSource = {
          kind: sObj.kind,
          label: cleanLabel
        };
      }
    }
  }

  let cleanShiftSeconds = 0;
  if ('shiftSeconds' in raw) {
    const v = raw.shiftSeconds;
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 60 || v > 86400) {
      addIssue('shiftSeconds', 'Поле shiftSeconds должно быть целым числом в диапазоне от 60 до 86400');
    } else {
      cleanShiftSeconds = v;
    }
  }

  let cleanShiftPlan = 0;
  if ('shiftPlan' in raw) {
    const v = raw.shiftPlan;
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 1 || v > 100000) {
      addIssue('shiftPlan', 'Поле shiftPlan должно быть целым числом в диапазоне от 1 до 100000');
    } else {
      cleanShiftPlan = v;
    }
  }

  let cleanSupplyInterval = 0;
  if ('supplyIntervalSeconds' in raw) {
    const v = raw.supplyIntervalSeconds;
    if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 1 || v > 3600) {
      addIssue('supplyIntervalSeconds', 'Поле supplyIntervalSeconds должно быть целым числом в диапазоне от 1 до 3600');
    } else {
      cleanSupplyInterval = v;
    }
  }

  let cleanRejectRate = 0;
  if ('rejectRate' in raw) {
    const v = raw.rejectRate;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
      addIssue('rejectRate', 'Поле rejectRate должно быть числом в диапазоне от 0 до 1');
    } else {
      cleanRejectRate = v;
    }
  }

  let cleanConveyorSpeed = 0;
  if ('conveyorSpeed' in raw) {
    const v = raw.conveyorSpeed;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.05 || v > 2) {
      addIssue('conveyorSpeed', 'Поле conveyorSpeed должно быть числом в диапазоне от 0.05 до 2');
    } else {
      cleanConveyorSpeed = v;
    }
  }

  let cleanStations: { id: ProductionStationId; cycleSeconds: number; bufferCapacity: number }[] | null = null;
  if ('stations' in raw) {
    const st = raw.stations;
    if (!Array.isArray(st)) {
      addIssue('stations', 'Поле stations должно быть массивом');
    } else if (st.length !== 4) {
      addIssue('stations', `Поле stations должно содержать ровно 4 станции, получено ${st.length}`);
    } else {
      const ALLOWED_STATION_KEYS = new Set(['id', 'cycleSeconds', 'bufferCapacity']);
      const CANONICAL_IDS = new Set<ProductionStationId>(['welding', 'painting', 'assembly', 'quality']);
      const stationMap = new Map<ProductionStationId, { cycleSeconds: number; bufferCapacity: number }>();
      const seenIds = new Set<string>();

      for (let i = 0; i < st.length; i++) {
        const station = st[i];
        const basePath = `stations[${i}]`;
        if (typeof station !== 'object' || station === null || Array.isArray(station)) {
          addIssue(basePath, 'Элемент массива stations должен быть объектом');
          continue;
        }
        const stObj = station as Record<string, unknown>;
        for (const sk of Object.keys(stObj)) {
          if (!ALLOWED_STATION_KEYS.has(sk)) {
            addIssue(`${basePath}.${sk}`, `Неизвестное свойство станции: '${sk}'`);
          }
        }

        let stationIdValid = false;
        let sId: ProductionStationId = 'welding';
        if (!Object.hasOwn(stObj, 'id')) {
          addIssue(`${basePath}.id`, 'Отсутствует обязательное свойство: id');
        } else if (typeof stObj.id !== 'string' || !CANONICAL_IDS.has(stObj.id as ProductionStationId)) {
          addIssue(
            `${basePath}.id`,
            `Недопустимый идентификатор станции '${stObj.id}'. Ожидались: welding, painting, assembly, quality`
          );
        } else {
          sId = stObj.id as ProductionStationId;
          if (seenIds.has(sId)) {
            addIssue(`${basePath}.id`, `Дублирующийся идентификатор станции: '${sId}'`);
          } else {
            seenIds.add(sId);
            stationIdValid = true;
          }
        }

        let cycleValid = false;
        let cycle = 0;
        if (!Object.hasOwn(stObj, 'cycleSeconds')) {
          addIssue(`${basePath}.cycleSeconds`, 'Отсутствует обязательное свойство: cycleSeconds');
        } else {
          const cs = stObj.cycleSeconds;
          if (typeof cs !== 'number' || !Number.isFinite(cs) || !Number.isInteger(cs) || cs < 1 || cs > 3600) {
            addIssue(`${basePath}.cycleSeconds`, 'Поле cycleSeconds должно быть целым числом в диапазоне от 1 до 3600');
          } else {
            cycle = cs;
            cycleValid = true;
          }
        }

        let bufferValid = false;
        let buffer = 0;
        if (!Object.hasOwn(stObj, 'bufferCapacity')) {
          addIssue(`${basePath}.bufferCapacity`, 'Отсутствует обязательное свойство: bufferCapacity');
        } else {
          const bc = stObj.bufferCapacity;
          if (typeof bc !== 'number' || !Number.isFinite(bc) || !Number.isInteger(bc) || bc < 1 || bc > 9) {
            addIssue(`${basePath}.bufferCapacity`, 'Поле bufferCapacity должно быть целым числом в диапазоне от 1 до 9');
          } else {
            buffer = bc;
            bufferValid = true;
          }
        }

        if (stationIdValid && cycleValid && bufferValid) {
          stationMap.set(sId, { cycleSeconds: cycle, bufferCapacity: buffer });
        }
      }

      for (const reqId of CANONICAL_IDS) {
        if (!stationMap.has(reqId)) {
          addIssue('stations', `В конфигурации отсутствует станция с каноническим идентификатором: '${reqId}'`);
        }
      }

      if (stationMap.size === 4) {
        const canonicalOrder: ProductionStationId[] = ['welding', 'painting', 'assembly', 'quality'];
        cleanStations = canonicalOrder.map(id => ({
          id,
          cycleSeconds: stationMap.get(id)!.cycleSeconds,
          bufferCapacity: stationMap.get(id)!.bufferCapacity
        }));
      }
    }
  }

  if (issues.length > 0 || !cleanSource || !cleanStations) {
    return { ok: false, issues };
  }

  const detachedValue: ProductionConfig = {
    schemaVersion: 1,
    name: cleanName,
    source: {
      kind: cleanSource.kind,
      label: cleanSource.label
    },
    shiftSeconds: cleanShiftSeconds,
    shiftPlan: cleanShiftPlan,
    supplyIntervalSeconds: cleanSupplyInterval,
    rejectRate: cleanRejectRate,
    conveyorSpeed: cleanConveyorSpeed,
    stations: cleanStations
  };

  const warnings: string[] = [];
  if ((raw.stations as ProductionConfig['stations']).some((station, index) => station.id !== CANONICAL_STATION_IDS[index])) {
    warnings.push('Порядок участков приведён к схеме: сварка → окраска → сборка → контроль качества.');
  }
  if (cleanShiftSeconds < 2100) warnings.push('Смена короче 35 минут: учебные события сбоев и обслуживания могут не успеть завершиться.');
  return {
    ok: true,
    value: detachedValue,
    warnings
  };
}

interface RawRow {
  lineNumber: number;
  fields: string[];
}

function parseCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const fields: string[] = [];
  let current: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current.push('"');
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.join(''));
      current = [];
    } else {
      current.push(ch);
    }
  }
  fields.push(current.join(''));
  return fields;
}

function detectDelimiter(firstLine: string): ',' | ';' {
  const semiHeaders = parseCsvLine(firstLine, ';').map(h => h.trim().toLowerCase());
  const commaHeaders = parseCsvLine(firstLine, ',').map(h => h.trim().toLowerCase());

  const REQUIRED = new Set([
    'elapsed_seconds',
    'good_units',
    'rejected_units',
    'wip',
    'plan_units',
    'downtime_seconds'
  ]);

  const semiCount = semiHeaders.filter(h => REQUIRED.has(h)).length;
  const commaCount = commaHeaders.filter(h => REQUIRED.has(h)).length;

  if (semiCount > commaCount) return ';';
  if (commaCount > semiCount) return ',';

  let semiChars = 0;
  let commaChars = 0;
  let inQuote = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === ';') semiChars++;
      else if (ch === ',') commaChars++;
    }
  }
  return semiChars > commaChars ? ';' : ',';
}

function tokenizeCsv(
  text: string,
  delimiter: ',' | ';',
  addIssue: (path: string, message: string) => boolean
): RawRow[] {
  const rows: RawRow[] = [];
  const len = text.length;
  let pos = 0;
  let lineNumber = 1;

  let rowStartLine = 1;
  let currentFields: string[] = [];
  let currentFieldChars: string[] = [];
  let inQuotes = false;
  let fieldHadQuotes = false;
  let quoteClosed = false;
  let fieldHasCharsAfterQuote = false;
  let quoteInUnquotedField = false;
  let blankLine: number | null = null;

  function endField(): boolean {
    if (currentFields.length >= 6) {
      addIssue(`строка ${rowStartLine}`, 'В записи больше 6 столбцов. Проверьте разделитель.');
      return false;
    }
    if (fieldHasCharsAfterQuote) {
      if (!addIssue(`строка ${rowStartLine}`, `Некорректный формат кавычек: обнаружены символы после закрывающей кавычки в строке ${rowStartLine}`)) {
        return false;
      }
    }
    if (quoteInUnquotedField) {
      if (!addIssue(`строка ${rowStartLine}`, `Некорректный формат: символ кавычки внутри незакавыченного поля в строке ${rowStartLine}`)) {
        return false;
      }
    }
    currentFields.push(currentFieldChars.join(''));
    currentFieldChars = [];
    inQuotes = false;
    fieldHadQuotes = false;
    quoteClosed = false;
    fieldHasCharsAfterQuote = false;
    quoteInUnquotedField = false;
    return true;
  }

  function endRow(): boolean {
    if (!endField()) return false;
    if (currentFields.length === 1 && currentFields[0].trim() === '') {
      blankLine ??= rowStartLine;
      currentFields = [];
      rowStartLine = lineNumber;
      return true;
    }
    if (blankLine !== null) {
      addIssue(`строка ${blankLine}`, 'Пустые строки допускаются только в конце файла.');
      return false;
    }
    if (rows.length >= 10001) {
      addIssue('файл', 'Количество записей превышает допустимый максимум (10 000).');
      return false;
    }
    rows.push({
      lineNumber: rowStartLine,
      fields: currentFields
    });
    currentFields = [];
    rowStartLine = lineNumber;
    return true;
  }

  while (pos < len) {
    const ch = text[pos];
    if (currentFieldChars.length > 256) {
      addIssue(`строка ${rowStartLine}`, 'Поле длиннее 256 символов. Ожидалось число или название столбца.');
      return rows;
    }

    if (inQuotes) {
      if (ch === '"') {
        if (pos + 1 < len && text[pos + 1] === '"') {
          currentFieldChars.push('"');
          pos += 2;
          continue;
        } else {
          inQuotes = false;
          quoteClosed = true;
          pos++;
          continue;
        }
      } else if (ch === '\n') {
        currentFieldChars.push('\n');
        lineNumber++;
        pos++;
        continue;
      } else if (ch === '\r') {
        if (pos + 1 < len && text[pos + 1] === '\n') {
          currentFieldChars.push('\r\n');
          pos += 2;
        } else {
          currentFieldChars.push('\r');
          pos++;
        }
        lineNumber++;
        continue;
      } else {
        currentFieldChars.push(ch);
        pos++;
        continue;
      }
    } else {
      if (ch === '"') {
        if (!fieldHadQuotes && currentFieldChars.length === 0) {
          inQuotes = true;
          fieldHadQuotes = true;
          pos++;
          continue;
        } else if (quoteClosed) {
          fieldHasCharsAfterQuote = true;
          currentFieldChars.push(ch);
          pos++;
          continue;
        } else {
          quoteInUnquotedField = true;
          currentFieldChars.push(ch);
          pos++;
          continue;
        }
      } else if (ch === delimiter) {
        if (!endField()) return rows;
        pos++;
        continue;
      } else if (ch === '\r') {
        lineNumber++;
        if (pos + 1 < len && text[pos + 1] === '\n') {
          pos += 2;
        } else {
          pos++;
        }
        if (!endRow()) return rows;
        continue;
      } else if (ch === '\n') {
        lineNumber++;
        pos++;
        if (!endRow()) return rows;
        continue;
      } else {
        if (quoteClosed) {
          fieldHasCharsAfterQuote = true;
        }
        currentFieldChars.push(ch);
        pos++;
        continue;
      }
    }
  }

  if (inQuotes) {
    addIssue(`строка ${rowStartLine}`, `Незакрытая кавычка в строке ${rowStartLine}`);
  } else {
    if (currentFields.length > 0 || currentFieldChars.length > 0 || fieldHadQuotes || quoteClosed) {
      endRow();
    }
  }

  while (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    if (lastRow.fields.length === 1 && lastRow.fields[0].trim() === '') {
      rows.pop();
    } else {
      break;
    }
  }

  return rows;
}

function parseStrictInteger(
  raw: string,
  colName: string,
  rowNum: number,
  min: number,
  max: number,
  addIssue: (path: string, message: string) => boolean
): number | null {
  const trimmed = raw.trim();
  const path = `строка ${rowNum}, ${colName}`;
  if (trimmed === '') {
    addIssue(path, `Поле '${colName}' не может быть пустым`);
    return null;
  }
  if (!/^[+-]?\d+$/.test(trimmed)) {
    addIssue(path, `Поле '${colName}' должно быть целым числом, получено: '${trimmed}'`);
    return null;
  }
  const val = Number(trimmed);
  if (!Number.isFinite(val) || !Number.isInteger(val)) {
    addIssue(path, `Поле '${colName}' не является допустимым числом`);
    return null;
  }
  if (val < 0) {
    addIssue(path, `Поле '${colName}' не может быть отрицательным: ${val}`);
    return null;
  }
  if (val < min || val > max) {
    addIssue(path, `Значение '${colName}' (${val}) выходит за допустимый диапазон [${min}, ${max}]`);
    return null;
  }
  return val;
}

function parseStrictDecimal(
  raw: string,
  colName: string,
  rowNum: number,
  min: number,
  max: number,
  addIssue: (path: string, message: string) => boolean
): number | null {
  const trimmed = raw.trim();
  const path = `строка ${rowNum}, ${colName}`;
  if (trimmed === '') {
    addIssue(path, `Поле '${colName}' не может быть пустым`);
    return null;
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    addIssue(path, `Поле '${colName}' должно быть числом, получено: '${trimmed}'`);
    return null;
  }
  const val = Number(trimmed);
  if (!Number.isFinite(val)) {
    addIssue(path, `Поле '${colName}' должно быть конечным числом`);
    return null;
  }
  if (val < 0) {
    addIssue(path, `Поле '${colName}' не может быть отрицательным: ${val}`);
    return null;
  }
  if (val < min || val > max) {
    addIssue(path, `Значение '${colName}' (${val}) выходит за допустимый диапазон [${min}, ${max}]`);
    return null;
  }
  return val;
}

export function parseHistoricalCsv(text: string, name: string): ImportResult<HistoricalDataset> {
  const { issues, addIssue } = createIssueCollector();
  const datasetName = typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'Набор данных';

  if (typeof text !== 'string') {
    return {
      ok: false,
      issues: [{ path: 'файл', message: 'Входные данные CSV должны быть строкой' }]
    };
  }

  const MAX_CSV_BYTES = 2 * 1024 * 1024;
  if (text.length > MAX_CSV_BYTES) return { ok: false, issues: [{ path: 'файл', message: 'Размер файла превышает 2 МиБ.' }] };
  let byteLength = 0;
  if (typeof TextEncoder !== 'undefined') {
    byteLength = new TextEncoder().encode(text).length;
  } else {
    // UTF-8 byte count without a Node dependency (also works in an offline browser).
    for (const character of text) { const cp = character.codePointAt(0)!; byteLength += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4; }
  }

  if (byteLength > MAX_CSV_BYTES) {
    return {
      ok: false,
      issues: [{
        path: 'файл',
        message: `Размер файла (${byteLength} байт) превышает максимально допустимый предел 2 МБ`
      }]
    };
  }

  let cleanedText = text;
  if (cleanedText.charCodeAt(0) === 0xfeff) {
    cleanedText = cleanedText.slice(1);
  }

  if (cleanedText.trim().length === 0) {
    return {
      ok: false,
      issues: [{ path: 'файл', message: 'CSV-файл пуст' }]
    };
  }

  const firstNewlineIdx = cleanedText.search(/[\r\n]/);
  const firstLine = firstNewlineIdx === -1 ? cleanedText : cleanedText.slice(0, firstNewlineIdx);
  if (firstLine.length > 4096) return { ok: false, issues: [{ path: 'строка 1', message: 'Слишком длинный заголовок. Ожидалось шесть названий столбцов.' }] };
  const delimiter = detectDelimiter(firstLine);

  const rows = tokenizeCsv(cleanedText, delimiter, addIssue);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  if (rows.length === 0) {
    return {
      ok: false,
      issues: [{ path: 'файл', message: 'CSV-файл не содержит строк данных' }]
    };
  }

  const headerRow = rows[0];
  const hLine = headerRow.lineNumber;

  if (headerRow.fields.length !== 6) {
    addIssue(`строка ${hLine}`, `Неверное количество столбцов в строке заголовка: ожидалось 6, получено ${headerRow.fields.length}`);
    return { ok: false, issues };
  }

  const rawHeaders = headerRow.fields.map(h => h.trim().toLowerCase());
  const REQUIRED_HEADERS = [
    'elapsed_seconds',
    'good_units',
    'rejected_units',
    'wip',
    'plan_units',
    'downtime_seconds'
  ] as const;
  const reqSet = new Set<string>(REQUIRED_HEADERS);
  const seenHeaders = new Set<string>();

  for (let c = 0; c < rawHeaders.length; c++) {
    const h = rawHeaders[c];
    if (!reqSet.has(h)) {
      addIssue(`строка ${hLine}, колонка '${headerRow.fields[c]}'`, `Неизвестный заголовок столбца: '${headerRow.fields[c]}'`);
    } else if (seenHeaders.has(h)) {
      addIssue(`строка ${hLine}, колонка '${headerRow.fields[c]}'`, `Дублирующийся заголовок столбца: '${headerRow.fields[c]}'`);
    } else {
      seenHeaders.add(h);
    }
  }

  for (const req of REQUIRED_HEADERS) {
    if (!seenHeaders.has(req)) {
      addIssue(`строка ${hLine}`, `Отсутствует обязательный столбец: '${req}'`);
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const colMap: Record<string, number> = {};
  for (let c = 0; c < rawHeaders.length; c++) {
    colMap[rawHeaders[c]] = c;
  }

  const dataRows = rows.slice(1);
  if (dataRows.length < 2) {
    addIssue('файл', `Файл должен содержать как минимум 2 записи данных, получено ${dataRows.length}`);
  }

  if (dataRows.length > 10000) {
    addIssue('файл', `Количество записей в файле (${dataRows.length}) превышает допустимый максимум (10 000)`);
  }

  const records: HistoricalRecord[] = [];
  let prevRecord: HistoricalRecord | null = null;
  let prevLineNumber = 0;
  const rowsToProcess = Math.min(dataRows.length, 10000);

  for (let r = 0; r < rowsToProcess; r++) {
    if (issues.length >= MAX_ISSUES) {
      addIssue('диагностика', 'Проверка оставшихся строк остановлена.');
      break;
    }
    const row = dataRows[r];
    const rLine = row.lineNumber;

    if (row.fields.length !== 6) {
      addIssue(`строка ${rLine}`, `Неверное количество столбцов: ожидалось 6, получено ${row.fields.length}`);
      continue;
    }

    const elapsed = parseStrictInteger(row.fields[colMap['elapsed_seconds']], 'elapsed_seconds', rLine, 0, 86400, addIssue);
    const good = parseStrictInteger(row.fields[colMap['good_units']], 'good_units', rLine, 0, 1000000, addIssue);
    const rejected = parseStrictInteger(row.fields[colMap['rejected_units']], 'rejected_units', rLine, 0, 1000000, addIssue);
    const wip = parseStrictInteger(row.fields[colMap['wip']], 'wip', rLine, 0, 1000000, addIssue);
    const plan = parseStrictDecimal(row.fields[colMap['plan_units']], 'plan_units', rLine, 0, 1000000, addIssue);
    const downtime = parseStrictInteger(row.fields[colMap['downtime_seconds']], 'downtime_seconds', rLine, 0, 345600, addIssue);

    if (
      elapsed === null ||
      good === null ||
      rejected === null ||
      wip === null ||
      plan === null ||
      downtime === null
    ) {
      continue;
    }

    if (downtime > 4 * elapsed) {
      addIssue(
        `строка ${rLine}, downtime_seconds`,
        `Суммарное время простоя (${downtime} с) превышает 4 * время с начала смены (${4 * elapsed} с)`
      );
    }

    if (prevRecord !== null) {
      if (elapsed === prevRecord.elapsedSeconds) {
        addIssue(
          `строка ${rLine}, elapsed_seconds`,
          `Дублирующееся значение времени: ${elapsed} с совпадает с предыдущей строкой ${prevLineNumber}`
        );
      } else if (elapsed < prevRecord.elapsedSeconds) {
        addIssue(
          `строка ${rLine}, elapsed_seconds`,
          `Нарушен хронологический порядок: время ${elapsed} с меньше предыдущего ${prevRecord.elapsedSeconds} с в строке ${prevLineNumber}`
        );
      }

      if (good < prevRecord.goodUnits) {
        addIssue(
          `строка ${rLine}, good_units`,
          `Накопленное количество годных изделий (${good}) уменьшилось по сравнению с предыдущей строкой (${prevRecord.goodUnits})`
        );
      }

      if (rejected < prevRecord.rejectedUnits) {
        addIssue(
          `строка ${rLine}, rejected_units`,
          `Накопленное количество брака (${rejected}) уменьшилось по сравнению с предыдущей строкой (${prevRecord.rejectedUnits})`
        );
      }

      if (plan < prevRecord.planUnits) {
        addIssue(
          `строка ${rLine}, plan_units`,
          `Накопленный план выпуска (${plan}) уменьшился по сравнению с предыдущей строкой (${prevRecord.planUnits})`
        );
      }

      if (downtime < prevRecord.downtimeSeconds) {
        addIssue(
          `строка ${rLine}, downtime_seconds`,
          `Накопленное время простоя (${downtime} с) уменьшилось по сравнению с предыдущей строкой (${prevRecord.downtimeSeconds} с)`
        );
      }

      if (elapsed > prevRecord.elapsedSeconds) {
        const timeDelta = elapsed - prevRecord.elapsedSeconds;
        const downtimeDelta = downtime - prevRecord.downtimeSeconds;
        if (downtimeDelta > 4 * timeDelta) {
          addIssue(
            `строка ${rLine}, downtime_seconds`,
            `Прирост времени простоя (${downtimeDelta} с) превышает 4 * интервал времени (${4 * timeDelta} с)`
          );
        }
      }
    }

    const rec: HistoricalRecord = {
      elapsedSeconds: elapsed,
      goodUnits: good,
      rejectedUnits: rejected,
      wip: wip,
      planUnits: plan,
      downtimeSeconds: downtime
    };
    records.push(rec);
    prevRecord = rec;
    prevLineNumber = rLine;
  }

  if (records.length < 2 && issues.length === 0) {
    addIssue('файл', `Набор данных должен содержать как минимум 2 валидные записи, получено ${records.length}`);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const warnings: string[] = [];
  warnings.push(`Имя набора данных '${datasetName}' является пользовательской меткой и не гарантирует верификацию источника данных.`);

  if (records[0].elapsedSeconds > 0) {
    warnings.push(`Первая запись начинается со времени ${records[0].elapsedSeconds} с (> 0 с). Данные представляют частичную историю смены.`);
  }

  for (let i = 1; i < records.length; i++) {
    const gap = records[i].elapsedSeconds - records[i - 1].elapsedSeconds;
    if (gap > 3600) {
      warnings.push(`Обнаружен временной разрыв ${gap} с между строками ${i + 1} и ${i + 2} (${records[i - 1].elapsedSeconds} с -> ${records[i].elapsedSeconds} с), превышающий 3600 с.`);
    }
  }

  return {
    ok: true,
    value: {
      name: datasetName,
      records
    },
    warnings
  };
}
