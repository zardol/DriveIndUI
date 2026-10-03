import { STATIONS, type StationId, type StationSnapshot } from '@kosta/shared';

export interface LayoutStation {
  id: StationId;
  position: [number, number];
  rotation: 0 | 90 | 180 | 270;
}

export interface FactoryLayout {
  version: 1;
  title: string;
  units: 'relative' | 'meters';
  floor: { width: number; depth: number };
  stations: LayoutStation[];
  terminals: { supply: [number, number]; finished: [number, number] };
}

export const DEFAULT_LAYOUT: FactoryLayout = {
  version: 1,
  title: 'Учебная схема цеха',
  units: 'relative',
  floor: { width: 100, depth: 96 },
  stations: [
    { id: 'welding', position: [28, -33], rotation: 0 },
    { id: 'painting', position: [-28, -11], rotation: 180 },
    { id: 'assembly', position: [28, 11], rotation: 0 },
    { id: 'quality', position: [-28, 33], rotation: 180 }
  ],
  terminals: {
    supply: [-44, -33],
    finished: [8, 42]
  }
};

const STATION_IDS = STATIONS.map(s => s.id);

function halfSize(station: LayoutStation): [number, number] {
  return station.rotation % 180 === 0 ? [4, 5.5] : [5.5, 4];
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function hasNoExtraKeys(obj: Record<string, unknown>, allowedKeys: string[]): boolean {
  const keys = Object.keys(obj);
  return keys.length === allowedKeys.length && keys.every(k => allowedKeys.includes(k));
}

export function parseFactoryLayout(input: unknown): FactoryLayout {
  if (!isObject(input)) throw new Error('Неверный формат данных: ожидается объект');

  if (input.version !== 1) throw new Error('Неподдерживаемая версия схемы (ожидается 1)');

  if (typeof input.title !== 'string') throw new Error('Название схемы должно быть строкой');
  const title = input.title.trim();
  if (title.length === 0) throw new Error('Название схемы не может быть пустым');
  if (title.length > 80) throw new Error('Название схемы не может превышать 80 символов');

  if (input.units !== 'relative' && input.units !== 'meters') throw new Error('Единицы измерения должны быть "relative" или "meters"');

  if (!isObject(input.floor)) throw new Error('Отсутствуют или неверно заданы размеры цеха');
  const floor = input.floor;
  if (typeof floor.width !== 'number' || typeof floor.depth !== 'number') throw new Error('Размеры цеха должны быть числами');
  if (!Number.isFinite(floor.width) || !Number.isFinite(floor.depth)) throw new Error('Размеры цеха должны быть конечными числами');
  if (floor.width < 20 || floor.width > 100 || floor.depth < 20 || floor.depth > 100) throw new Error('Размеры цеха должны быть от 20 до 100');

  if (!Array.isArray(input.stations)) throw new Error('Отсутствует или неверно задан список станций');
  if (input.stations.length !== 4) throw new Error('Должно быть ровно 4 станции');

  const stationsMap = new Map<string, LayoutStation>();
  for (const s of input.stations) {
    if (!isObject(s)) throw new Error('Неверный формат объекта станции');
    const id = s.id as string;
    if (!STATION_IDS.includes(id as StationId)) throw new Error(`Неизвестная станция: ${id}`);
    if (stationsMap.has(id)) throw new Error(`Дублирование станции: ${id}`);

    if (!Array.isArray(s.position) || s.position.length !== 2) throw new Error(`Неверная позиция для станции ${id}`);
    const [x, z] = s.position;
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`Координаты станции ${id} должны быть конечными числами`);

    if (x < -floor.width / 2 + 6 || x > floor.width / 2 - 6 || z < -floor.depth / 2 + 6 || z > floor.depth / 2 - 6) {
      throw new Error(`Станция ${id} выходит за границы цеха или слишком близко к краю (отступ 6)`);
    }

    if (s.rotation !== 0 && s.rotation !== 90 && s.rotation !== 180 && s.rotation !== 270) {
      throw new Error(`Неверный угол поворота для станции ${id}: ${s.rotation}`);
    }

    stationsMap.set(id, { id: id as StationId, position: [x, z], rotation: s.rotation });
  }

  const stations = STATION_IDS.map(id => stationsMap.get(id)!);

  if (!isObject(input.terminals)) throw new Error('Отсутствуют или неверно заданы терминалы');
  const terminals = input.terminals;
  const tKeys = ['supply', 'finished'];
  for (const k of tKeys) {
    const t = terminals[k] as unknown;
    if (!Array.isArray(t) || t.length !== 2) throw new Error(`Неверный формат терминала ${k}`);
    const [x, z] = t;
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`Координаты терминала ${k} должны быть конечными числами`);

    if (x < -floor.width / 2 + 3 || x > floor.width / 2 - 3 || z < -floor.depth / 2 + 3 || z > floor.depth / 2 - 3) {
      throw new Error(`Терминал ${k} выходит за границы цеха или слишком близко к краю (отступ 3)`);
    }
  }
  const supply = terminals.supply as [number, number];
  const finished = terminals.finished as [number, number];

  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const dx = Math.abs(stations[i].position[0] - stations[j].position[0]);
      const dz = Math.abs(stations[i].position[1] - stations[j].position[1]);
      const a = halfSize(stations[i]), b = halfSize(stations[j]);
      if (dx < a[0] + b[0] && dz < a[1] + b[1]) {
        throw new Error(`Станции ${stations[i].id} и ${stations[j].id} расположены слишком близко`);
      }
    }
  }

  const checkTermStation = (tPos: [number, number], tName: string) => {
    for (const s of stations) {
      const half = halfSize(s);
      if (Math.abs(tPos[0] - s.position[0]) < half[0] + 2.5 && Math.abs(tPos[1] - s.position[1]) < half[1] + 3) {
        throw new Error(`Терминал ${tName} слишком близко к станции ${s.id}`);
      }
    }
  };
  checkTermStation(supply, 'supply');
  checkTermStation(finished, 'finished');

  if (Math.abs(supply[0] - finished[0]) < 5 && Math.abs(supply[1] - finished[1]) < 6) throw new Error('Терминалы supply и finished слишком близко друг к другу');

  if (!hasNoExtraKeys(input, ['version', 'title', 'units', 'floor', 'stations', 'terminals'])) {
    throw new Error('Обнаружены неизвестные свойства в корневом объекте');
  }
  if (!hasNoExtraKeys(floor as Record<string, unknown>, ['width', 'depth'])) {
    throw new Error('Обнаружены неизвестные свойства в объекте floor');
  }
  for (const s of input.stations as Record<string, unknown>[]) {
    if (!hasNoExtraKeys(s, ['id', 'position', 'rotation'])) {
      throw new Error(`Обнаружены неизвестные свойства в объекте станции ${s.id}`);
    }
  }
  if (!hasNoExtraKeys(terminals as Record<string, unknown>, ['supply', 'finished'])) {
    throw new Error('Обнаружены неизвестные свойства в объекте terminals');
  }

  return {
    version: 1,
    title,
    units: input.units as 'relative' | 'meters',
    floor: { width: floor.width, depth: floor.depth },
    stations: stations.map(s => ({
      id: s.id,
      position: [s.position[0], s.position[1]],
      rotation: s.rotation
    })),
    terminals: {
      supply: [supply[0], supply[1]],
      finished: [finished[0], finished[1]]
    }
  };
}

export function stationCanAnimate(station: StationSnapshot, animate: boolean, reducedMotion: boolean): boolean {
  return Boolean(animate && !reducedMotion && station.inProcess && (station.status === 'running' || station.status === 'warning'));
}

export function queueSlots(count: number, capacity: number): { shown: number; overflow: number } {
  let c = count;
  let cap = capacity;
  if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) c = 0;
  if (typeof cap !== 'number' || !Number.isFinite(cap) || cap < 0) cap = 0;

  c = Math.floor(c);
  cap = Math.floor(cap);

  const shown = Math.min(c, cap, 8);
  const overflow = c > shown ? c - shown : 0;

  return { shown, overflow };
}
