import { Vector3 } from 'three';

/** Perspective framing uses every floor corner, including depth towards the camera. */
export function overviewDistance(width: number, depth: number, aspect: number, fov: number, offset: Vector3): number {
  const safeAspect = Math.max(0.1, Number.isFinite(aspect) ? aspect : 1);
  const right = new Vector3(offset.z, 0, -offset.x).normalize();
  const up = new Vector3().crossVectors(offset, right).normalize();
  const tanFov = Math.tan(fov * Math.PI / 360);
  let distance = 0;
  for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) for (const y of [0, 6]) {
    const corner = new Vector3(x, y, z);
    distance = Math.max(distance, corner.dot(offset) + Math.abs(corner.dot(up)) / tanFov,
      corner.dot(offset) + Math.abs(corner.dot(right)) / (tanFov * safeAspect));
  }
  return distance * 1.08;
}

/** Pan stays on the shop floor; translate both camera and target to preserve the view direction. */
export function constrainPan(position: Vector3, target: Vector3, width: number, depth: number): void {
  const x = Math.max(-width / 2 - 8, Math.min(width / 2 + 8, target.x));
  const z = Math.max(-depth / 2 - 8, Math.min(depth / 2 + 8, target.z));
  position.x += x - target.x; position.z += z - target.z;
  target.x = x; target.z = z;
}
