import { useEffect, useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, Euler, ExtrudeGeometry, Shape, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Vec = [number, number, number];
function place(geometry: BufferGeometry, position: Vec, rotation: Vec = [0, 0, 0]) {
  return geometry.applyMatrix4(new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1)));
}
function box(size: Vec, position: Vec, rotation?: Vec) { return place(new BoxGeometry(...size), position, rotation); }
function profile(points: [number, number][], width: number) {
  const shape = new Shape();
  shape.moveTo(...points[0]);
  points.slice(1).forEach(point => shape.lineTo(...point));
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: .035, bevelThickness: .025, bevelSegments: 2, steps: 1 }).translate(0, 0, -width / 2);
}
function merge(parts: BufferGeometry[]): BufferGeometry {
  // Extruded panels are non-indexed; normalize box/cylinder pieces before merging.
  const normalized = parts.map(part => part.index ? part.toNonIndexed() : part);
  const result = mergeGeometries(normalized, false);
  normalized.forEach((part, index) => { if (part !== parts[index]) part.dispose(); });
  parts.forEach(part => part.dispose());
  if (!result) throw new Error('Vehicle geometry could not be assembled');
  return result;
}

/** Combine static pieces by material: a finished vehicle needs seven draw calls. */
export function vehicleGeometry(bodyOnly: boolean) {
  const body = merge([
    profile([[-1.42,.24],[1.42,.24],[1.46,.4],[1.35,.54],[.75,.57],[.38,.94],[-.62,.94],[-1.02,.58],[-1.43,.51]], 1.2),
    box([1.2, 0.07, 1.12], [-0.1, 0.94, 0]),
    box([0.12, 0.5, 1.08], [0.66, 0.71, 0], [0, 0, 0.65]),
    box([0.12, 0.5, 1.08], [-0.86, 0.71, 0], [0, 0, -0.55]),
    box([0.12, 0.08, 0.15], [0.42, 0.68, 0.64]),
    box([0.12, 0.08, 0.15], [0.42, 0.68, -0.64]),
  ]);
  if (bodyOnly) return { body };
  const wheels: Vec[] = [[0.88, 0.28, 0.62], [0.88, 0.28, -0.62], [-0.88, 0.28, 0.62], [-0.88, 0.28, -0.62]];
  return {
    body,
    glass: merge([
      box([0.13, 0.37, 0.98], [0.68, 0.74, 0], [0, 0, 0.65]),
      box([0.13, 0.37, 0.98], [-0.88, 0.74, 0], [0, 0, -0.55]),
      box([1.05, 0.22, 0.018], [-0.12, 0.77, 0.631]),
      box([1.05, 0.22, 0.018], [-0.12, 0.77, -0.631]),
    ]),
    dark: merge([
      box([0.16, 0.2, 1.24], [1.39, 0.33, 0]),
      box([0.16, 0.2, 1.24], [-1.39, 0.33, 0]),
      box([1.65, 0.12, 1.32], [0, 0.22, 0]),
      ...[-.647,.647].flatMap(z => [box([.045,.28,.018],[-.1,.76,z]), box([.16,.025,.025],[.14,.58,z]), box([.16,.025,.025],[-.5,.58,z])]),
    ]),
    tires: merge(wheels.map(position => place(new CylinderGeometry(0.28, 0.28, 0.18, 20), position, [Math.PI / 2, 0, 0]))),
    hubs: merge(wheels.map(position => place(new CylinderGeometry(0.17, 0.17, 0.19, 10), position, [Math.PI / 2, 0, 0]))),
    headlights: merge([-0.42, 0.42].map(z => box([0.06, 0.12, 0.26], [1.47, 0.45, z]))),
    taillights: merge([-0.42, 0.42].map(z => box([0.06, 0.1, 0.28], [-1.47, 0.45, z]))),
  };
}

export function VehicleModel({ color = '#347f74', bodyOnly = false }: { color?: string; bodyOnly?: boolean }) {
  const parts = useMemo(() => vehicleGeometry(bodyOnly), [bodyOnly]);
  useEffect(() => () => { Object.values(parts).forEach(geometry => geometry?.dispose()); }, [parts]);
  return <group>
    <mesh geometry={parts.body} castShadow receiveShadow><meshStandardMaterial color={bodyOnly ? '#a5adb3' : color} metalness={0.45} roughness={0.35} /></mesh>
    {parts.glass && <mesh geometry={parts.glass}><meshStandardMaterial color='#1b3541' metalness={0.3} roughness={0.2} /></mesh>}
    {parts.dark && <mesh geometry={parts.dark} castShadow><meshStandardMaterial color='#273538' roughness={0.7} /></mesh>}
    {parts.tires && <mesh geometry={parts.tires} castShadow><meshStandardMaterial color='#202a2d' roughness={0.9} /></mesh>}
    {parts.hubs && <mesh geometry={parts.hubs}><meshStandardMaterial color='#b5c4c9' metalness={0.8} roughness={0.35} /></mesh>}
    {parts.headlights && <mesh geometry={parts.headlights}><meshStandardMaterial color='#f2f7ee' emissive='#deecdc' emissiveIntensity={0.4} /></mesh>}
    {parts.taillights && <mesh geometry={parts.taillights}><meshStandardMaterial color='#d05039' emissive='#d05039' emissiveIntensity={0.3} /></mesh>}
  </group>;
}
