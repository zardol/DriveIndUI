import { describe, expect, it } from 'vitest';
import { vehicleGeometry } from './VehicleModel';

describe('vehicle geometry', () => {
  it.each([true, false])('builds finite body and material groups (bodyOnly=%s)', bodyOnly => {
    const parts = vehicleGeometry(bodyOnly);
    try {
      for (const geometry of Object.values(parts)) {
        expect(geometry).toBeTruthy();
        if (!geometry) throw new Error('Missing geometry');
        expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
        geometry.computeBoundingBox();
        const box = geometry.boundingBox!;
        expect(Number.isFinite(box.min.x + box.max.x + box.max.y + box.max.z)).toBe(true);
        expect(box.max.x - box.min.x).toBeLessThan(3.25);
      }
    } finally { Object.values(parts).forEach(geometry => geometry?.dispose()); }
  });
});
