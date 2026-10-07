import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { overviewDistance, constrainPan } from './cameraGeometry';

describe('shop floor camera', () => {
  it('keeps all floor corners and equipment height inside portrait and wide views', () => {
    for (const width of [20, 52, 100]) for (const depth of [20, 48, 100]) for (const aspect of [.45, 1, 2.5]) {
      for (const offset of [new Vector3(.35, 1.05, 1.25).normalize(), new Vector3(0, 1, .05).normalize()]) {
        const camera = new PerspectiveCamera(42, aspect, .1, 2000);
        camera.position.copy(offset).multiplyScalar(overviewDistance(width, depth, aspect, 42, offset));
        camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
        for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) for (const y of [0, 6]) {
          const projected = new Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(1);
          expect(Math.abs(projected.y)).toBeLessThan(1);
          expect(projected.z).toBeLessThan(1);
        }
      }
    }
  });
  it('bounds panning without changing the direction or zoom', () => {
    const target = new Vector3(500, 1, -300), camera = new Vector3(520, 35, -260);
    const direction = camera.clone().sub(target);
    constrainPan(camera, target, 52, 48);
    expect(target.toArray()).toEqual([34, 1, -32]);
    expect(camera.clone().sub(target).toArray()).toEqual(direction.toArray());
    const previous = camera.clone(); constrainPan(camera, target, 52, 48); expect(camera.equals(previous)).toBe(true);
  });
});
