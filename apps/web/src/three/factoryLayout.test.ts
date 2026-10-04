import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LAYOUT,
  parseFactoryLayout,
  stationCanAnimate,
  queueSlots
} from './factoryLayout';
import type { StationSnapshot } from '@driveindui/shared';

describe('factoryLayout', () => {
  describe('parseFactoryLayout', () => {
    it('accepts DEFAULT_LAYOUT', () => {
      expect(parseFactoryLayout(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT);
    });

    it('isolates mutation / deeply detached', () => {
      const parsed = parseFactoryLayout(DEFAULT_LAYOUT);
      expect(parsed).not.toBe(DEFAULT_LAYOUT);
      expect(parsed.floor).not.toBe(DEFAULT_LAYOUT.floor);
      expect(parsed.stations[0]).not.toBe(DEFAULT_LAYOUT.stations[0]);
      expect(parsed.stations[0].position).not.toBe(DEFAULT_LAYOUT.stations[0].position);
    });

    it('rejects invalid versions', () => {
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, version: 2 })).toThrow(/версия/i);
    });

    it('reorders stations to canonical order', () => {
      const reversedStations = [...DEFAULT_LAYOUT.stations].reverse();
      const input = { ...DEFAULT_LAYOUT, stations: reversedStations };
      const parsed = parseFactoryLayout(input);
      expect(parsed.stations.map(s => s.id)).toEqual(['welding', 'painting', 'assembly', 'quality']);
    });

    it('rejects missing or unknown stations', () => {
      const input = { ...DEFAULT_LAYOUT, stations: DEFAULT_LAYOUT.stations.slice(0, 3) };
      expect(() => parseFactoryLayout(input)).toThrow(/ровно 4/i);

      const badStations = DEFAULT_LAYOUT.stations.map((station, index) => ({ ...station, id: index === 0 ? 'unknown_station' : station.id }));
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, stations: badStations })).toThrow(/Неизвестная станция/i);
    });

    it('rejects overlapping stations', () => {
      const badStations = [...DEFAULT_LAYOUT.stations];
      badStations[1] = { ...badStations[1], position: [...DEFAULT_LAYOUT.stations[0].position] };
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, stations: badStations })).toThrow(/близко/i);

      const closeStations = [...DEFAULT_LAYOUT.stations];
      closeStations[1] = { ...closeStations[1], position: [DEFAULT_LAYOUT.stations[0].position[0] + 7, DEFAULT_LAYOUT.stations[0].position[1] + 10] };
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, stations: closeStations })).toThrow(/близко/i);
    });

    it('rejects stations outside floor bounds or margin', () => {
      const badStations = [...DEFAULT_LAYOUT.stations];
      badStations[0] = { ...badStations[0], position: [-50, 0] };
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, stations: badStations })).toThrow(/границы/i);
    });

    it('rejects unknown properties', () => {
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, extra: true })).toThrow(/свойства/i);
      const badFloor = { ...DEFAULT_LAYOUT.floor, extra: true };
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, floor: badFloor })).toThrow(/свойства/i);
    });

    it('checks rotated footprints and terminal footprints', () => {
      const rotated = structuredClone(DEFAULT_LAYOUT);
      rotated.stations[0].rotation = 90;
      rotated.stations[1].rotation = 90;
      rotated.stations[1].position = [37, -33];
      expect(() => parseFactoryLayout(rotated)).toThrow(/близко/i);
      const terminal = structuredClone(DEFAULT_LAYOUT);
      terminal.terminals.supply = [33, -28];
      expect(() => parseFactoryLayout(terminal)).toThrow(/близко/i);
    });

    it('rejects non-finite or coerced dimensions, invalid rotations and duplicate ids', () => {
      for (const width of [NaN, Infinity, '44', null, 101]) {
        expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, floor: { width, depth: 32 } })).toThrow();
      }
      const invalid = structuredClone(DEFAULT_LAYOUT);
      invalid.stations[1].id = 'welding';
      expect(() => parseFactoryLayout(invalid)).toThrow(/Дублирование/i);
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, stations: DEFAULT_LAYOUT.stations.map(s => ({ ...s, rotation: 45 })) })).toThrow(/угол/i);
      expect(() => parseFactoryLayout({ ...DEFAULT_LAYOUT, terminals: { supply: [NaN, 0], finished: [-16, 7] } })).toThrow(/числами/i);
    });

    it('rejects extra JSON keys without copying them into the resulting object', () => {
      const input = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
      Object.defineProperty(input, '__proto__', { value: { injected: true }, enumerable: true });
      expect(() => parseFactoryLayout(input)).toThrow(/свойства/i);
      const valid = parseFactoryLayout(DEFAULT_LAYOUT);
      valid.terminals.supply[0] = 100;
      expect(DEFAULT_LAYOUT.terminals.supply[0]).toBe(-44);
    });
  });

  describe('stationCanAnimate', () => {
    const base: StationSnapshot = {
      id: 'welding', name: 'W', status: 'running', inputQueue: 0, queuedUnits: 0, arrivingUnits: 0, bufferCapacity: 8,
      inProcess: true, progress: 0.5, cycleSeconds: 10, completed: 0,
      utilizationPercent: 100, downtimeSeconds: 0, throughputPerHour: 0
    };

    it('animates when running and inProcess', () => {
      expect(stationCanAnimate(base, true, false)).toBe(true);
    });

    it('does not animate if reducedMotion is true', () => {
      expect(stationCanAnimate(base, true, true)).toBe(false);
    });

    it('does not animate if animate is false', () => {
      expect(stationCanAnimate(base, false, false)).toBe(false);
    });

    it('does not animate if not inProcess', () => {
      expect(stationCanAnimate({ ...base, inProcess: false }, true, false)).toBe(false);
    });

    it('animates when warning', () => {
      expect(stationCanAnimate({ ...base, status: 'warning' }, true, false)).toBe(true);
    });

    it('does not animate for idle/blocked/stopped', () => {
      expect(stationCanAnimate({ ...base, status: 'idle' }, true, false)).toBe(false);
      expect(stationCanAnimate({ ...base, status: 'blocked' }, true, false)).toBe(false);
      expect(stationCanAnimate({ ...base, status: 'stopped' }, true, false)).toBe(false);
    });
  });

  describe('queueSlots', () => {
    it('handles normal bounds', () => {
      expect(queueSlots(5, 8)).toEqual({ shown: 5, overflow: 0 });
    });

    it('caps shown at 8', () => {
      expect(queueSlots(10, 10)).toEqual({ shown: 8, overflow: 2 });
    });

    it('respects capacity under 8', () => {
      expect(queueSlots(5, 4)).toEqual({ shown: 4, overflow: 1 });
    });

    it('handles extreme counts', () => {
      expect(queueSlots(100, 8)).toEqual({ shown: 8, overflow: 92 });
    });

    it('handles non-finite and negative inputs', () => {
      expect(queueSlots(NaN, 8)).toEqual({ shown: 0, overflow: 0 });
      expect(queueSlots(Infinity, 8)).toEqual({ shown: 0, overflow: 0 });
      expect(queueSlots(-5, 8)).toEqual({ shown: 0, overflow: 0 });
      expect(queueSlots(5, NaN)).toEqual({ shown: 0, overflow: 5 });
    });
  });
});
