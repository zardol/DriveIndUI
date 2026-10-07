import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import type { StationId } from '@driveindui/shared';
import type { FactoryLayout } from './factoryLayout';
import { sampleConveyor, type ConveyorRoute } from './conveyorPath';
import type { ConveyorMotion } from './conveyorMotion';
import { constrainPan, overviewDistance } from './cameraGeometry';

export type CameraView = 'overview' | 'top' | 'station' | 'vehicle';
export interface CameraRequest { view: CameraView; sequence: number; station: StationId; vehicleId?: string }
export function CameraRig({ request, layout, route, motion, reducedMotion }: { request: CameraRequest; layout: FactoryLayout; route: ConveyorRoute; motion: ConveyorMotion; reducedMotion: boolean }) {
  const controls = useRef<OrbitControlsType>(null);
  const { camera, size, invalidate } = useThree();
  const applied = useRef<{ request: CameraRequest; layout: FactoryLayout } | null>(null);
  const transition = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  const following = useRef(false);
  const followPoint = useRef(new Vector3());
  useEffect(() => {
    const orbit = controls.current;
    // A hidden workspace can have a zero-sized canvas. Never frame it until it is visible.
    if (!orbit || size.width < 2 || size.height < 2) return;
    // Resizing/fullscreen changes only the aspect ratio; it must not overwrite manual navigation.
    if (applied.current?.request === request && applied.current.layout === layout) return;
    const first = applied.current === null;
    const target = new Vector3(0, 0, 0);
    const offset = new Vector3(0.35, 1.05, 1.25).normalize();
    const aspect = size.width / size.height;
    let distance = overviewDistance(layout.floor.width, layout.floor.depth, aspect, (camera as PerspectiveCamera).fov, offset);
    following.current = false;
    if (request.view === 'station') {
      const station = layout.stations.find(item => item.id === request.station)!;
      target.set(station.position[0], 1, station.position[1]);
      distance = Math.max(16, 14 / Math.max(0.45, aspect));
    } else if (request.view === 'vehicle' && request.vehicleId) {
      const vehicleDistance = motion.distance(request.vehicleId, performance.now());
      if (vehicleDistance === undefined) return;
      const pose = sampleConveyor(route, vehicleDistance);
      target.set(pose.x, 0.8, pose.z);
      followPoint.current.copy(target); following.current = true;
      distance = Math.max(14, 13 / Math.max(0.45, aspect));
    } else if (request.view === 'top') {
      offset.set(0, 1, 0.05).normalize();
      distance = overviewDistance(layout.floor.width, layout.floor.depth, aspect, (camera as PerspectiveCamera).fov, offset);
    }
    const destination = target.clone().addScaledVector(offset, distance);
    applied.current = { request, layout };
    // Flush residual damping before beginning a deliberate camera move.
    const damping = orbit.enableDamping; orbit.enableDamping = false; orbit.update(); orbit.enableDamping = damping;
    if (first || reducedMotion) {
      camera.position.copy(destination); orbit.target.copy(target); orbit.update(); transition.current = null;
    } else transition.current = { position: destination, target };
    invalidate();
  }, [request, layout, route, motion, size.width, size.height, camera, invalidate, reducedMotion]);
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit) return;
    const next = transition.current;
    if (following.current && request.vehicleId) {
      const distance = motion.distance(request.vehicleId, performance.now());
      if (distance === undefined) following.current = false;
      else {
        const pose = sampleConveyor(route, distance);
        const dx = pose.x - followPoint.current.x, dz = pose.z - followPoint.current.z;
        if (next) { next.position.x += dx; next.position.z += dz; next.target.set(pose.x, .8, pose.z); }
        else { camera.position.x += dx; camera.position.z += dz; orbit.target.set(pose.x, .8, pose.z); }
        followPoint.current.set(pose.x, .8, pose.z);
        orbit.update();
      }
    }
    if (next) {
      const alpha = reducedMotion ? 1 : 1 - Math.exp(-12 * Math.min(delta, .05));
      camera.position.lerp(next.position, alpha); orbit.target.lerp(next.target, alpha);
      if (camera.position.distanceToSquared(next.position) < .0004 && orbit.target.distanceToSquared(next.target) < .0004) {
        camera.position.copy(next.position); orbit.target.copy(next.target); transition.current = null;
      }
      orbit.update(); invalidate();
    }
  });
  return <OrbitControls ref={controls} makeDefault enableDamping={!reducedMotion} dampingFactor={0.12}
    minDistance={7} maxDistance={1000} minPolarAngle={0.04} maxPolarAngle={Math.PI / 2.15} enablePan screenSpacePanning={false}
    onStart={() => { transition.current = null; following.current = false; }}
    onChange={() => { if (controls.current) constrainPan(camera.position, controls.current.target, layout.floor.width, layout.floor.depth); invalidate(); }} />;
}
