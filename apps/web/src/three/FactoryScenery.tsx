import { useEffect, useMemo } from 'react';
import { BoxGeometry, Matrix4, Euler, Quaternion, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FactoryLayout } from './factoryLayout';

/** Static industrial context, batched by material. Never adds decorative vehicles to the live fleet. */
export function FactoryScenery({ layout }: { layout: FactoryLayout }) {
  const batches = useMemo(() => {
    const groups = new Map<string, BufferGeometry[]>();
    const box = (color: string, size: [number, number, number], position: [number, number, number], yaw = 0) => {
      const geometry = new BoxGeometry(...size).applyMatrix4(new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(0, yaw, 0)), new Vector3(1, 1, 1)));
      if (!groups.has(color)) groups.set(color, []);
      groups.get(color)!.push(geometry);
    };
    const { width, depth } = layout.floor;
    // Sparse back-wall structure and storage leave the actual conveyor route unobstructed.
    for (let x = -width / 2 + 4; x <= width / 2 - 4; x += 12) {
      box('#617b7d', [.38, 5.5, .45], [x, 2.7, -depth / 2 + .6]);
      box('#b5c5c4', [8, .15, .22], [x, 4.4, -depth / 2 + .75]);
      box('#edf5db', [7.5, .07, .3], [x, 4.25, -depth / 2 + .9]);
    }
    // Racks occupy a shallow zone against the back wall; their boxes are component inventory.
    for (let x = -width / 2 + 8; x < width / 2 - 8; x += 14) {
      for (const dx of [-2.3, 2.3]) for (const dz of [-.65, .65]) box('#285f68', [.12, 3.6, .12], [x + dx, 1.7, -depth / 2 + 2.8 + dz]);
      for (const y of [.25, 1.5, 2.75]) {
        box('#ca9148', [4.9, .14, 1.65], [x, y, -depth / 2 + 2.8]);
        for (const dx of [-1.55, 0, 1.55]) box('#9aab9f', [1.22, .8, 1.2], [x + dx, y + .47, -depth / 2 + 2.8]);
      }
    }
    for (const station of layout.stations) {
      const yaw = station.rotation * Math.PI / 180;
      const local = (x: number, y: number, z: number): [number, number, number] => [station.position[0] + x * Math.cos(yaw) + z * Math.sin(yaw), y, station.position[1] - x * Math.sin(yaw) + z * Math.cos(yaw)];
      // Safety strips parallel to the conveyor, and compact electrical/service cabinets.
      for (const z of [-2.65, 2.65]) for (let x = -3.5; x <= 3.5; x += .5) {
        box(Math.round((x + 3.5) * 2) % 2 ? '#e5bd5d' : '#304e53', [.42, .018, .32], local(x, .07, z), yaw);
      }
      box('#ccd8d4', [.8, 1.65, .48], local(-3.15, .85, -2.1), yaw);
      box('#233f49', [.57, .4, .03], local(-3.15, 1.22, -1.845), yaw);
      box('#62b8a2', [.42, .025, .035], local(-3.15, 1.26, -1.82), yaw);
      box('#718d8b', [1.4, .16, .7], local(2.6, .88, -2.05), yaw);
      for (const x of [2.08, 3.12]) box('#526e71', [.09, .85, .1], local(x, .43, -2.05), yaw);
    }
    return [...groups].map(([color, parts]) => {
      const geometry = mergeGeometries(parts, false)!;
      parts.forEach(part => part.dispose());
      return { color, geometry };
    });
  }, [layout]);
  useEffect(() => () => batches.forEach(batch => batch.geometry.dispose()), [batches]);
  return <group>{batches.map(batch => <mesh key={batch.color} geometry={batch.geometry} castShadow receiveShadow>
    <meshStandardMaterial color={batch.color} roughness={.65} metalness={.2} />
  </mesh>)}</group>;
}
