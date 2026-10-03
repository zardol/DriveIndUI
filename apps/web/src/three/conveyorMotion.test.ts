import { describe, expect, it } from 'vitest';
import type { ConveyorVehicleSnapshot } from '@kosta/shared';
import { ConveyorMotion } from './conveyorMotion';

const car = (serial: number, distance: number): ConveyorVehicleSnapshot => ({
  id: `KA-${serial}`, serial, distance, speed: 0.5, stage: 'welding', state: 'moving', appearance: 'body', outcome: 'pending',
});

describe('conveyor display interpolation', () => {
  it('interpolates a stable ID along the route and never extrapolates', () => {
    const motion = new ConveyorMotion();
    motion.ingest([car(1, 39)], 'a', 78, 0, true, 4);
    motion.ingest([car(1, 42)], 'a', 330, 250, true, 4);
    expect(motion.distance('KA-1', 250)).toBe(39);
    expect(motion.distance('KA-1', 375)).toBe(40.5);
    expect(motion.distance('KA-1', 10000)).toBe(42);
  });

  it('preserves minimum spacing even when a new unit enters during interpolation', () => {
    const motion = new ConveyorMotion();
    motion.ingest([car(1, 3)], 'a', 6, 0, true, 4);
    motion.ingest([car(1, 8), car(2, 2)], 'a', 16, 250, true, 4);
    for (let t = 250; t <= 750; t += 10) {
      expect(motion.distance('KA-1', t)! - motion.distance('KA-2', t)!).toBeGreaterThanOrEqual(4);
      expect(motion.distance('KA-1', t)).toBeLessThanOrEqual(8);
      expect(motion.distance('KA-2', t)).toBeGreaterThanOrEqual(0);
    }
  });

  it('snaps to the command snapshot on pause and stays still on repeated snapshots', () => {
    const motion = new ConveyorMotion();
    motion.ingest([car(1, 4)], 'a', 8, 0, true, 4);
    motion.ingest([car(1, 8)], 'a', 16, 250, true, 4);
    motion.ingest([car(1, 9)], 'a', 18, 300, false, 4);
    expect(motion.distance('KA-1', 300)).toBe(9);
    motion.ingest([car(1, 9)], 'a', 18, 550, false, 4);
    expect(motion.distance('KA-1', 10000)).toBe(9);
  });

  it('keeps a compressed queue within authoritative bounds after a new admission', () => {
    const motion = new ConveyorMotion();
    motion.ingest([car(1, 11), car(2, 7), car(3, 3)], 'a', 20, 0, true, 4);
    const next = [car(1, 18), car(2, 14), car(3, 10), car(4, 6)];
    motion.ingest(next, 'a', 40, 250, true, 4);
    for (let t = 250; t <= 500; t += 10) {
      const positions = next.map(v => motion.distance(v.id, t)!);
      positions.forEach((distance, i) => {
        expect(distance).toBeGreaterThanOrEqual(0);
        expect(distance).toBeLessThanOrEqual(next[i].distance);
        if (i) expect(positions[i - 1] - distance).toBeGreaterThanOrEqual(4);
      });
    }
  });

  it('drops exited units and discards motion when a new shift reuses an ID', () => {
    const motion = new ConveyorMotion();
    motion.ingest([car(1, 198)], 'a', 1480, 0, true, 4);
    motion.ingest([], 'a', 1490, 250, true, 4);
    expect(motion.distance('KA-1', 250)).toBeUndefined();
    motion.ingest([car(1, 0)], 'b', 0, 500, true, 4);
    expect(motion.distance('KA-1', 500)).toBe(0);
  });
});
