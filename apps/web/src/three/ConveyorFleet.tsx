import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, InstancedMesh, Mesh, Object3D } from 'three';
import { CONVEYOR_SPEC, PRODUCT_MODELS, type ConveyorVehicleSnapshot } from '@driveindui/shared';
import { vehicleGeometry } from './VehicleModel';
import { sampleConveyor, type ConveyorRoute } from './conveyorPath';
import type { ConveyorMotion } from './conveyorMotion';

const PALETTE = ['#267d78', '#b84f39', '#d8d9ca', '#e2ad40', '#3c6c97', '#7772a3'];
type Part = 'body' | 'glass' | 'dark' | 'tires' | 'hubs' | 'headlights' | 'taillights';
const PARTS: Part[] = ['body', 'glass', 'dark', 'tires', 'hubs', 'headlights', 'taillights'];

/** Every active engine ID has one complete instanced car; no decorative or capped queue cars. */
export function ConveyorFleet({ vehicles, route, motion, selectedId, onSelect }: {
  vehicles: ConveyorVehicleSnapshot[]; route: ConveyorRoute; motion: ConveyorMotion;
  selectedId: string | null; onSelect: (id: string) => void;
}) {
  const geometries = useMemo(() => vehicleGeometry(false), []);
  const meshes = useRef(new Map<Part, InstancedMesh>());
  const marker = useRef<Mesh>(null);
  const object = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const canvas = useThree(state => state.gl.domElement);
  const capacity = Math.max(16, Math.ceil(vehicles.length / 16) * 16);
  useEffect(() => () => Object.values(geometries).forEach(geometry => geometry?.dispose()), [geometries]);
  useEffect(() => { canvas.dataset.vehicleCount = String(vehicles.length); }, [canvas, vehicles.length]);

  useFrame(() => {
    const now = performance.now();
    if (marker.current) marker.current.visible = false;
    for (let index = 0; index < vehicles.length; index++) {
      const vehicle = vehicles[index];
      const distance = motion.distance(vehicle.id, now) ?? vehicle.distance;
      const pose = sampleConveyor(route, distance);
      // Both the completed operation and the interpolated position must permit the change.
      const painted = vehicle.appearance !== 'body' && distance >= CONVEYOR_SPEC.stationDistances[1];
      const assembled = vehicle.appearance === 'assembled' && distance >= CONVEYOR_SPEC.stationDistances[2];
      object.position.set(pose.x, assembled ? 0.31 : 0.12, pose.z);
      object.rotation.set(0, pose.yaw, 0);
      for (const part of PARTS) {
        const mesh = meshes.current.get(part);
        if (!mesh) continue;
        object.scale.setScalar(part === 'body' || assembled ? route.vehicleScale : 0);
        object.updateMatrix();
        mesh.setMatrixAt(index, object.matrix);
        if (part === 'body') {
          color.set(vehicle.outcome === 'rejected' ? '#b85645' : painted ? PRODUCT_MODELS.find(model => model.id === vehicle.modelId)?.color ?? PALETTE[(vehicle.serial - 1) % PALETTE.length] : '#a5afb2');
          mesh.setColorAt(index, color);
        }
      }
      if (vehicle.id === selectedId && marker.current) {
        marker.current.visible = true;
        marker.current.position.set(pose.x, 0.32, pose.z);
        marker.current.scale.setScalar(route.vehicleScale);
      }
    }
    for (const mesh of meshes.current.values()) {
      mesh.count = vehicles.length;
      mesh.instanceMatrix.needsUpdate = true;
      // InstancedMesh raycasting caches bounds; moving cars need fresh bounds on the next pick.
      mesh.boundingSphere = null;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return <group>
    {PARTS.map(part => <instancedMesh key={`${part}-${capacity}`} ref={mesh => { if (mesh) meshes.current.set(part, mesh); else meshes.current.delete(part); }}
      args={[geometries[part], undefined, capacity]} frustumCulled={false} castShadow={part === 'body' || part === 'tires'} receiveShadow
      onClick={event => { if (event.delta > 5) return; const id = event.instanceId; if (id !== undefined && vehicles[id]) { event.stopPropagation(); onSelect(vehicles[id].id); } }}>
      <meshPhysicalMaterial color={part === 'body' ? '#ffffff' : part === 'glass' ? '#193c48' : part === 'hubs' ? '#d2dde0' : part === 'headlights' ? '#f1f5db' : part === 'taillights' ? '#b94733' : '#243337'}
        roughness={part === 'tires' ? 0.85 : 0.28} metalness={part === 'body' || part === 'hubs' ? 0.5 : 0.15} clearcoat={part === 'body' ? .65 : 0} />
    </instancedMesh>)}
    <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[1.7, 1.87, 32]} /><meshBasicMaterial color='#e5aa36' depthWrite={false} />
    </mesh>
  </group>;
}
