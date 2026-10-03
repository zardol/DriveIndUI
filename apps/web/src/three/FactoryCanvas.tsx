import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import type { SessionSnapshot, StationId, StationSnapshot, StationStatus } from '@kosta/shared';
import { EquipmentModel } from './EquipmentModel';
import { stationCanAnimate, type FactoryLayout, type LayoutStation } from './factoryLayout';
import { buildConveyorRoute, sampleConveyor, type ConveyorRoute } from './conveyorPath';
import { ConveyorBelt } from './ConveyorBelt';
import { ConveyorFleet } from './ConveyorFleet';
import { ConveyorMotion } from './conveyorMotion';
import { STATUS_META } from '../status';

export type CameraView = 'overview' | 'top' | 'station' | 'vehicle';
export interface CameraRequest { view: CameraView; sequence: number; station: StationId; vehicleId?: string }
export interface FactoryCanvasProps {
  snapshot: SessionSnapshot;
  selected: StationId;
  onSelect: (id: StationId) => void;
  layout: FactoryLayout;
  animate: boolean;
  reducedMotion: boolean;
  renderActive: boolean;
  quality: 'balanced' | 'economy';
  cameraRequest: CameraRequest;
  onFailure: () => void;
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
}

const COLORS: Record<StationStatus, string> = {
  running: '#239982', idle: '#829497', warning: '#edb34f', blocked: '#d28a3a', stopped: '#e05044',
};

function CameraRig({ request, layout, route, motion }: { request: CameraRequest; layout: FactoryLayout; route: ConveyorRoute; motion: ConveyorMotion }) {
  const controls = useRef<OrbitControlsType>(null);
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    const orbit = controls.current;
    if (!orbit) return;
    const target = new Vector3(0, 0, 0);
    const offset = new Vector3(0.5, 1.2, 1.1).normalize();
    const aspect = size.width / Math.max(1, size.height);
    const { width, depth } = layout.floor;
    // Fit all corners in camera space, including perspective depth near the camera.
    // A flat width/height estimate clips the outlet on wide, short viewports.
    const right = new Vector3(offset.z, 0, -offset.x).normalize();
    const up = new Vector3().crossVectors(offset, right).normalize();
    const tanFov = Math.tan((camera as PerspectiveCamera).fov * Math.PI / 360);
    let distance = 0;
    for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) for (const y of [0, 6]) {
      const corner = new Vector3(x, y, z);
      const towardCamera = corner.dot(offset);
      distance = Math.max(distance, towardCamera + Math.abs(corner.dot(up)) / tanFov,
        towardCamera + Math.abs(corner.dot(right)) / (tanFov * aspect));
    }
    distance *= 1.08;
    if (request.view === 'station') {
      const station = layout.stations.find(item => item.id === request.station)!;
      target.set(station.position[0], 1, station.position[1]);
      distance = Math.max(16, 14 / Math.max(0.45, aspect));
    } else if (request.view === 'vehicle' && request.vehicleId) {
      const pose = sampleConveyor(route, motion.distance(request.vehicleId, performance.now()) ?? 0);
      target.set(pose.x, 0.8, pose.z);
      distance = Math.max(14, 13 / Math.max(0.45, aspect));
    } else if (request.view === 'top') {
      offset.set(0, 1, 0.001).normalize();
      distance = Math.max(layout.floor.depth * 1.4, layout.floor.width / Math.max(0.45, aspect) * 1.4);
    }
    camera.position.copy(target).addScaledVector(offset, distance);
    (camera as PerspectiveCamera).zoom = 1;
    camera.updateProjectionMatrix();
    orbit.target.copy(target);
    orbit.update();
    invalidate();
  }, [request, layout, route, motion, size.width, size.height, camera, invalidate]);
  useFrame(() => {
    const orbit = controls.current;
    if (!orbit || request.view !== 'vehicle' || !request.vehicleId) return;
    const distance = motion.distance(request.vehicleId, performance.now());
    if (distance === undefined) return;
    const pose = sampleConveyor(route, distance);
    camera.position.x += pose.x - orbit.target.x;
    camera.position.z += pose.z - orbit.target.z;
    orbit.target.set(pose.x, 0.8, pose.z);
    orbit.update();
  });
  return <OrbitControls ref={controls} makeDefault enableDamping={false} minDistance={6} maxDistance={400} maxPolarAngle={Math.PI / 2.15} enablePan screenSpacePanning />;
}

function ContextGuard({ onFailure }: { onFailure: () => void }) {
  const canvas = useThree(state => state.gl.domElement);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onFailure(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [canvas, onFailure]);
  return null;
}

function FrameMetrics() {
  const elapsed = useRef(0), frames = useRef(0);
  useFrame(({ gl }, delta) => {
    elapsed.current += delta; frames.current += 1;
    if (elapsed.current >= 1) {
      gl.domElement.dataset.renderFps = String(Math.round(frames.current / elapsed.current));
      gl.domElement.dataset.drawCalls = String(gl.info.render.calls);
      elapsed.current = 0; frames.current = 0;
    }
  });
  return null;
}

function Station({ placement, station, selected, animate, reducedMotion, onSelect }: {
  placement: LayoutStation; station: StationSnapshot; selected: boolean; animate: boolean; reducedMotion: boolean; onSelect: (id: StationId) => void;
}) {
  const color = COLORS[station.status];
  return <group position={[placement.position[0], 0, placement.position[1]]}>
    <group rotation={[0, placement.rotation * Math.PI / 180, 0]} onClick={event => { event.stopPropagation(); onSelect(station.id); }}>
      <mesh position={[0, -0.02, 0]} receiveShadow><boxGeometry args={[7.8, 0.14, 5.8]} /><meshStandardMaterial color={selected ? '#cce3db' : '#e7e9df'} roughness={0.9} /></mesh>
      <mesh position={[0, 0.08, 2.8]}><boxGeometry args={[7.7, 0.09, 0.13]} /><meshStandardMaterial color={selected ? '#186e61' : color} /></mesh>
      <EquipmentModel station={station} animate={stationCanAnimate(station, animate, reducedMotion)} selected={selected} />

    </group>
  </group>;
}

function FactoryFloor({ layout }: { layout: FactoryLayout }) {
  const { width, depth } = layout.floor;
  // Sparse seams and a low rear wall keep the cutaway readable from every camera angle.
  return <group>
    <mesh position={[0, -0.4, 0]} receiveShadow><boxGeometry args={[width, 0.6, depth]} /><meshStandardMaterial color='#d3dad1' roughness={0.92} /></mesh>
    <mesh position={[0, -0.76, 0]}><boxGeometry args={[width + 0.4, 0.14, depth + 0.4]} /><meshStandardMaterial color='#45605b' roughness={0.75} /></mesh>
    {Array.from({ length: Math.floor(width / 4) }, (_, index) => <mesh key={`x${index}`} position={[-width / 2 + 2 + index * 4, -0.092, 0]}><boxGeometry args={[0.025, 0.005, depth]} /><meshStandardMaterial color='#b6c1b8' /></mesh>)}
    {Array.from({ length: Math.floor(depth / 4) }, (_, index) => <mesh key={`z${index}`} position={[0, -0.09, -depth / 2 + 2 + index * 4]}><boxGeometry args={[width, 0.005, 0.025]} /><meshStandardMaterial color='#b6c1b8' /></mesh>)}
    <mesh position={[0, 0.9, -depth / 2 + 0.1]} castShadow><boxGeometry args={[width, 2, 0.25]} /><meshStandardMaterial color='#ecede4' /></mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * (width / 2 - 0.6), 1.8, -depth / 2 + 0.6]} castShadow><boxGeometry args={[0.55, 3.8, 0.55]} /><meshStandardMaterial color='#48645f' metalness={0.25} roughness={0.6} /></mesh>)}
  </group>;
}

function Terminals({ layout }: { layout: FactoryLayout }) {
  return <>
    <group position={[layout.terminals.supply[0], 0, layout.terminals.supply[1]]}>
      <mesh position={[0, 0.06, 0]} receiveShadow><boxGeometry args={[5, 0.12, 5]} /><meshStandardMaterial color='#c0cdbf' /></mesh>
      {[-1.7, 1.7].map(x => <group key={x} position={[x, 0, -1.1]}>
        {[-1, 1].map(z => <mesh key={z} position={[0, 1.5, z]} castShadow><boxGeometry args={[0.17, 3, 0.17]} /><meshStandardMaterial color='#58786d' /></mesh>)}
        {[0.2, 1.3, 2.4].map(y => <mesh key={y} position={[0, y, 0]}><boxGeometry args={[0.9, 0.13, 2.6]} /><meshStandardMaterial color='#c4a577' /></mesh>)}
      </group>)}
    </group>
    <group position={[layout.terminals.finished[0], 0, layout.terminals.finished[1]]}>
      <mesh position={[0, 0, 0]} receiveShadow><boxGeometry args={[5, 0.08, 6]} /><meshStandardMaterial color='#b7cdbf' /></mesh>
      <mesh position={[0,1.5,-1.6]}><boxGeometry args={[0.18,3,0.18]} /><meshStandardMaterial color='#348571' /></mesh>
      <mesh position={[0,1.5,1.6]}><boxGeometry args={[0.18,3,0.18]} /><meshStandardMaterial color='#348571' /></mesh>
      <mesh position={[0,3,0]}><boxGeometry args={[0.18,0.22,3.4]} /><meshStandardMaterial color='#348571' /></mesh>
    </group>
  </>;
}

interface LabelAnchor { id: string; position: [number, number, number] }

/** Keep labels in the existing DOM root, projecting only their positions as the camera moves. */
function LabelProjection({ anchors, labels }: { anchors: LabelAnchor[]; labels: RefObject<Map<string, HTMLDivElement>> }) {
  const point = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const anchor of anchors) {
      const element = labels.current.get(anchor.id);
      if (!element) continue;
      point.set(...anchor.position).project(camera);
      const visible = point.z >= -1 && point.z <= 1 && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1;
      element.style.visibility = visible ? 'visible' : 'hidden';
      const labelLift = anchor.id === 'supply' ? 40 : 0;
      element.style.transform = `translate(${(point.x + 1) * size.width / 2}px,${(1 - point.y) * size.height / 2 - labelLift}px) translate(-50%,-100%)`;
    }
  });
  return null;
}

export default function FactoryCanvas(props: FactoryCanvasProps) {
  const { layout, snapshot, selected, onSelect, animate, reducedMotion, renderActive, quality, cameraRequest, onFailure, selectedVehicleId, onSelectVehicle } = props;
  const route = useMemo(() => buildConveyorRoute(layout), [layout]);
  const motion = useMemo(() => new ConveyorMotion(), []);
  useLayoutEffect(() => {
    motion.ingest(snapshot.conveyor.vehicles, `${snapshot.sessionId}:${snapshot.revision}`, snapshot.elapsedSeconds, performance.now(), animate && !reducedMotion && renderActive, snapshot.conveyor.minSpacing);
  }, [snapshot, animate, reducedMotion, renderActive, motion]);
  const labels = useRef(new Map<string, HTMLDivElement>());
  const anchors = useMemo<LabelAnchor[]>(() => [
    ...layout.stations.map(station => ({ id: station.id, position: [station.position[0], 5, station.position[1]] as [number, number, number] })),
    { id: 'supply', position: [layout.terminals.supply[0], 3.5, layout.terminals.supply[1]] },
    { id: 'finished', position: [layout.terminals.finished[0], 2.5, layout.terminals.finished[1]] },
  ], [layout]);
  return <><Canvas shadows={quality === 'balanced' ? 'percentage' : false} dpr={quality === 'balanced' ? [1, 1.5] : 1}
    frameloop={!renderActive ? 'never' : animate && !reducedMotion ? 'always' : 'demand'} camera={{ position: [35, 35, 45], fov: 42, near: 0.1, far: 600 }}
    gl={{ antialias: true, powerPreference: 'default' }} fallback={<span>Для 3D требуется поддержка WebGL. Доступна 2D-схема.</span>}>
    <color attach='background' args={['#e8ede6']} />
    <ambientLight intensity={0.8} />
    <hemisphereLight args={['#ffffff', '#698879', 1.5]} />
    <directionalLight position={[5, 60, 24]} intensity={2.2} castShadow={quality === 'balanced'} shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-70} shadow-camera-right={70} shadow-camera-top={70} shadow-camera-bottom={-70} shadow-camera-far={180} shadow-normalBias={0.06} />
    <directionalLight position={[-15, 12, -15]} intensity={0.7} color='#bdd3dc' />
    <ContextGuard onFailure={onFailure} />
    <FrameMetrics />
    <LabelProjection anchors={anchors} labels={labels} />
    <CameraRig request={cameraRequest} layout={layout} route={route} motion={motion} />
    <FactoryFloor layout={layout} />
    <ConveyorBelt route={route} vehicles={snapshot.conveyor.vehicles} animate={animate && !reducedMotion} speed={snapshot.speed * snapshot.conveyor.nominalSpeed / 0.5} />
    <ConveyorFleet route={route} vehicles={snapshot.conveyor.vehicles} motion={motion} selectedId={selectedVehicleId} onSelect={onSelectVehicle} />
    <Terminals layout={layout} />
    {layout.stations.map(placement => {
      const station = snapshot.stations.find(item => item.id === placement.id);
      return station && <Station key={placement.id} placement={placement} station={station} selected={selected === station.id}
        onSelect={onSelect} animate={animate} reducedMotion={reducedMotion} />;
    })}
  </Canvas><div className='plant-label-layer'>
    {anchors.map(anchor => {
      const station = snapshot.stations.find(item => item.id === anchor.id);
      return <div className='plant-label-anchor' key={anchor.id} ref={element => { if (element) labels.current.set(anchor.id, element); else labels.current.delete(anchor.id); }}>
        {station ? <button className={`plant-label${selected === station.id ? ' is-selected' : ''}`} type='button' onClick={() => onSelect(station.id)} aria-pressed={selected === station.id}>
          <span><i style={{ background: COLORS[station.status] }} />{station.name}</span>
          <small>{STATUS_META[station.status].short} · буфер {station.inputQueue}/{station.bufferCapacity}</small>
          <small>Ожидают {station.queuedUnits} · подъезжают {station.arrivingUnits}</small>
        </button> : <div className='plant-terminal'>{anchor.id === 'supply' ? 'Подача кузовов' : 'Выход из линии'}<small>{anchor.id === 'supply' ? `Подано: ${snapshot.introducedUnits}` : `${snapshot.goodUnits} годных · ${snapshot.rejectedUnits} брак`}</small></div>}
      </div>;
    })}
  </div></>;
}
