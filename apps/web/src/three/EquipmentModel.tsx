import { useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { VehicleModel } from './VehicleModel';

import type { StationSnapshot } from '@kosta/shared';

export interface EquipmentModelProps {
  station: StationSnapshot;
  animate: boolean;
  selected: boolean;
}

function RobotArm({ position, rotation, turntable, shoulder, forearm }: {
  position: [number, number, number]; rotation: number;
  turntable: RefObject<THREE.Group | null>; shoulder: RefObject<THREE.Group | null>; forearm: RefObject<THREE.Group | null>;
}) {
  return <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0.2, 0]} castShadow><cylinderGeometry args={[0.38, 0.43, 0.4, 12]} /><meshStandardMaterial color='#263841' metalness={0.5} roughness={0.5} /></mesh>
    <group ref={turntable} position={[0, 0.4, 0]}>
      <mesh position={[0, 0.13, 0]} castShadow><cylinderGeometry args={[0.28, 0.28, 0.26, 12]} /><meshStandardMaterial color='#ef7c26' roughness={0.5} /></mesh>
      <group ref={shoulder} position={[0, 0.26, 0]} rotation={[0, 0, -0.7]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.2, 0.2, 0.32, 12]} /><meshStandardMaterial color='#384b51' /></mesh>
        <mesh position={[0, 0.475, 0]} castShadow><boxGeometry args={[0.22, 0.95, 0.24]} /><meshStandardMaterial color='#f58b30' roughness={0.4} /></mesh>
        <group ref={forearm} position={[0, 0.95, 0]} rotation={[0, 0, -0.7]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.17, 0.17, 0.3, 12]} /><meshStandardMaterial color='#384b51' /></mesh>
          <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.17, 1, 0.2]} /><meshStandardMaterial color='#eb7422' roughness={0.4} /></mesh>
          <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.035, 0.075, 0.28, 8]} /><meshStandardMaterial color='#395259' metalness={0.7} roughness={0.3} /></mesh>
        </group>
      </group>
    </group>
  </group>;
}

export function EquipmentModel({ station, animate, selected }: EquipmentModelProps) {
  const phaseRef = useRef(0);
  const isActive = animate && station.inProcess && (station.status === 'running' || station.status === 'warning');

  // Refs for animated components
  const rollersRef = useRef<THREE.Group>(null);
  const robot1Turntable = useRef<THREE.Group>(null);
  const robot1Shoulder = useRef<THREE.Group>(null);
  const robot1Forearm = useRef<THREE.Group>(null);
  const robot2Turntable = useRef<THREE.Group>(null);
  const robot2Shoulder = useRef<THREE.Group>(null);
  const robot2Forearm = useRef<THREE.Group>(null);
  const sparksGroup = useRef<THREE.Group>(null);
  const sprayGantry = useRef<THREE.Group>(null);
  const sprayArm = useRef<THREE.Group>(null);
  const sprayCone = useRef<THREE.Mesh>(null);
  const craneBridge = useRef<THREE.Group>(null);
  const craneHoist = useRef<THREE.Group>(null);
  const qualityArch = useRef<THREE.Group>(null);
  const scanCurtain = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!isActive) {
      if (sparksGroup.current) sparksGroup.current.visible = false;
      if (sprayCone.current) sprayCone.current.visible = false;
      if (scanCurtain.current) scanCurtain.current.visible = false;
      return;
    }

    const dt = Math.min(delta, 0.1);
    phaseRef.current += dt;
    const t = phaseRef.current;

    // Rollers continuous spin
    if (rollersRef.current) {
      const count = rollersRef.current.children.length;
      for (let i = 0; i < count; i++) {
        rollersRef.current.children[i].rotation.y = t * 3.8;
      }
    }

    // Welding robots articulation
    if (robot1Turntable.current) robot1Turntable.current.rotation.y = Math.sin(t * 1.8) * 0.35 + 0.15;
    if (robot1Shoulder.current) robot1Shoulder.current.rotation.z = Math.cos(t * 2.2) * 0.12 - 0.7;
    if (robot1Forearm.current) robot1Forearm.current.rotation.z = Math.sin(t * 2.5) * 0.18 - 0.7;

    if (robot2Turntable.current) robot2Turntable.current.rotation.y = -Math.sin(t * 1.6 + 0.8) * 0.35 - 0.15;
    if (robot2Shoulder.current) robot2Shoulder.current.rotation.z = Math.cos(t * 2.0 + 0.4) * 0.12 - 0.7;
    if (robot2Forearm.current) robot2Forearm.current.rotation.z = Math.sin(t * 2.3 + 0.4) * 0.18 - 0.7;

    if (sparksGroup.current) {
      const sparkActive = Math.sin(t * 36) > 0.15;
      sparksGroup.current.visible = sparkActive;
      if (sparkActive) {
        const s = 1 + Math.sin(t * 19) * 0.2;
        sparksGroup.current.scale.set(s, s, s);
      }
    }

    // Painting spray applicator
    if (sprayGantry.current) sprayGantry.current.position.x = Math.sin(t * 1.4) * 0.85;
    if (sprayArm.current) sprayArm.current.position.z = Math.cos(t * 2.8) * 0.42;
    if (sprayCone.current) {
      sprayCone.current.visible = true;
      const mat = sprayCone.current.material as THREE.MeshStandardMaterial;
      if (mat) mat.opacity = 0.24 + Math.sin(t * 8) * 0.08;
    }

    // Assembly crane & hoist
    if (craneBridge.current) craneBridge.current.position.x = Math.sin(t * 0.9) * 0.75;
    if (craneHoist.current) craneHoist.current.position.y = -1.3 + Math.sin(t * 1.8) * 0.32;

    // Quality scanner arch
    if (qualityArch.current) qualityArch.current.position.x = Math.sin(t * 1.2) * 0.95;
    if (scanCurtain.current) {
      scanCurtain.current.visible = true;
      const mat = scanCurtain.current.material as THREE.MeshStandardMaterial;
      if (mat) mat.opacity = 0.26 + Math.sin(t * 10) * 0.1;
    }
  });

  // Signal stack light colors based on status
  const isRunning = station.status === 'running';
  const isWarning = station.status === 'warning';
  const isStopped = station.status === 'stopped';
  const isBlocked = station.status === 'blocked';

  const carX = -0.8 + 1.6 * Math.max(0, Math.min(1, station.progress));
  const selectGlow = selected ? '#38bdf8' : '#334155';

  return (
    <group position={[0, 0, 0]}>
      {/* Conveyor Bed & Deck (Flow along X, bounds within x±3.5, z±2.6) */}
      <mesh position={[0, 0.24, 0.76]} castShadow receiveShadow>
        <boxGeometry args={[6.2, 0.14, 0.08]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.24, -0.76]} castShadow receiveShadow>
        <boxGeometry args={[6.2, 0.14, 0.08]} />
        <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.19, 0]} receiveShadow>
        <boxGeometry args={[6.0, 0.04, 1.42]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.8} />
      </mesh>

      {/* Conveyor Stanchion Legs */}
      {[-2.6, -0.9, 0.9, 2.6].map((lx) => (
        <group key={lx}>
          <mesh position={[lx, 0.11, 0.72]} castShadow receiveShadow>
            <boxGeometry args={[0.12, 0.22, 0.12]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.5} />
          </mesh>
          <mesh position={[lx, 0.11, -0.72]} castShadow receiveShadow>
            <boxGeometry args={[0.12, 0.22, 0.12]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.5} />
          </mesh>
          <mesh position={[lx, 0.08, 0]} receiveShadow>
            <boxGeometry args={[0.08, 0.08, 1.36]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Conveyor Rollers (Animated rotation) */}
      <group ref={rollersRef}>
        {[-2.5, -2.0, -1.5, -1.0, -0.5, 0, 0.5, 1.0, 1.5, 2.0, 2.5].map((rx, idx) => (
          <mesh key={idx} position={[rx, 0.27, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.045, 0.045, 1.42, 12]} />
            <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* Floor Guide Plates & Selection Highlight */}
      <mesh position={[0, 0.01, 1.15]} receiveShadow>
        <boxGeometry args={[6.2, 0.02, 0.14]} />
        <meshStandardMaterial color={selected ? selectGlow : '#eab308'} emissive={selected ? selectGlow : '#000000'} emissiveIntensity={selected ? 0.8 : 0} />
      </mesh>
      <mesh position={[0, 0.01, -1.15]} receiveShadow>
        <boxGeometry args={[6.2, 0.02, 0.14]} />
        <meshStandardMaterial color={selected ? selectGlow : '#eab308'} emissive={selected ? selectGlow : '#000000'} emissiveIntensity={selected ? 0.8 : 0} />
      </mesh>

      {/* Signal Stack Light (Andon Tower) */}
      <group position={[-2.8, 0, 1.7]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 2.2, 8]} />
          <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, 2.45, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.65, 12]} />
          <meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.6} />
        </mesh>
        {/* Red Lamp */}
        <mesh position={[0, 2.65, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.15, 12]} />
          <meshStandardMaterial
            color={isStopped ? '#ef4444' : '#331515'}
            emissive={isStopped ? '#ef4444' : '#000000'}
            emissiveIntensity={isStopped ? 2.5 : 0}
            roughness={0.2}
          />
        </mesh>
        {/* Amber Lamp */}
        <mesh position={[0, 2.45, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.15, 12]} />
          <meshStandardMaterial
            color={isWarning || isBlocked ? '#f59e0b' : '#332612'}
            emissive={isWarning || isBlocked ? '#f59e0b' : '#000000'}
            emissiveIntensity={isWarning || isBlocked ? 2.4 : 0}
            roughness={0.2}
          />
        </mesh>
        {/* Green Lamp */}
        <mesh position={[0, 2.25, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.15, 12]} />
          <meshStandardMaterial
            color={isRunning ? '#22c55e' : '#142e1a'}
            emissive={isRunning ? '#22c55e' : '#000000'}
            emissiveIntensity={isRunning ? 2.5 : 0}
            roughness={0.2}
          />
        </mesh>
      </group>

      {/* Station Specific Equipment */}
      {station.id === 'welding' && (
        <group>
          {/* Safety perimeter screen behind line */}
          <mesh position={[0, 1.2, -1.9]} receiveShadow castShadow>
            <boxGeometry args={[5.2, 2.2, 0.06]} />
            <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.7} />
          </mesh>
          <mesh position={[0, 2.32, -1.9]}>
            <boxGeometry args={[5.2, 0.08, 0.08]} />
            <meshStandardMaterial color="#eab308" metalness={0.5} roughness={0.4} />
          </mesh>

          <RobotArm position={[-0.8, 0, 1.7]} rotation={Math.PI / 2} turntable={robot1Turntable} shoulder={robot1Shoulder} forearm={robot1Forearm} />
          <RobotArm position={[0.8, 0, -1.7]} rotation={-Math.PI / 2} turntable={robot2Turntable} shoulder={robot2Shoulder} forearm={robot2Forearm} />

          {/* Active Welding Sparks */}
          <group ref={sparksGroup} position={[carX - 0.2, 0.62, 0.52]} visible={false}>
            <mesh>
              <octahedronGeometry args={[0.09, 0]} />
              <meshStandardMaterial color="#ffffff" emissive="#60a5fa" emissiveIntensity={3} transparent opacity={0.9} />
            </mesh>
            <mesh position={[0.08, 0.05, -0.06]}>
              <tetrahedronGeometry args={[0.06, 0]} />
              <meshStandardMaterial color="#fef08a" emissive="#f59e0b" emissiveIntensity={3} transparent opacity={0.9} />
            </mesh>
          </group>
        </group>
      )}

      {station.id === 'painting' && (
        <group>
          {/* Rear filter plenum wall (galvanized zinc slatted filters) */}
          <mesh position={[0, 1.8, -1.55]} receiveShadow castShadow>
            <boxGeometry args={[5.6, 3.4, 0.18]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.4} roughness={0.5} />
          </mesh>
          {/* Filter louvers */}
          {[0.8, 1.4, 2.0, 2.6].map((fy) => (
            <mesh key={fy} position={[0, fy, -1.44]}>
              <boxGeometry args={[5.2, 0.35, 0.04]} />
              <meshStandardMaterial color="#0f766e" metalness={0.3} roughness={0.6} />
            </mesh>
          ))}

          {/* Overhead ventilation duct */}
          <mesh position={[0, 3.75, -0.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 5.6, 16]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[1.4, 4.25, -0.5]} castShadow>
            <cylinderGeometry args={[0.22, 0.22, 1.0, 12]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.4} />
          </mesh>

          {/* Open Front Portal Frames (Teal industrial aesthetic, camera facing +Z is open) */}
          {[-2.7, 2.7].map((px) => (
            <group key={px} position={[px, 0, 0]}>
              <mesh position={[0, 1.8, 1.5]} castShadow>
                <boxGeometry args={[0.24, 3.4, 0.24]} />
                <meshStandardMaterial color="#0f766e" metalness={0.4} roughness={0.4} />
              </mesh>
              <mesh position={[0, 3.4, 0]} castShadow>
                <boxGeometry args={[0.24, 0.24, 3.0]} />
                <meshStandardMaterial color="#0f766e" metalness={0.4} roughness={0.4} />
              </mesh>
            </group>
          ))}

          {/* Overhead Spray Gantry Carriage */}
          <group ref={sprayGantry} position={[0, 3.05, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.5, 0.16, 2.4]} />
              <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Vertical Telescoping Spray Arm */}
            <group ref={sprayArm} position={[0, -0.5, 0]}>
              <mesh position={[0, -0.4, 0]} castShadow>
                <cylinderGeometry args={[0.04, 0.04, 0.8, 8]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.8} roughness={0.2} />
              </mesh>
              {/* Rotary Atomizer Bell */}
              <mesh position={[0, -0.82, 0]} castShadow>
                <cylinderGeometry args={[0.12, 0.05, 0.12, 12]} />
                <meshStandardMaterial color="#0d9488" metalness={0.5} roughness={0.3} />
              </mesh>
              {/* Translucent Spray Mist Cone */}
              <mesh ref={sprayCone} position={[0, -1.18, 0]} rotation={[Math.PI, 0, 0]} visible={false}>
                <coneGeometry args={[0.36, 0.6, 12, 1, true]} />
                <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={0.8} transparent opacity={0.24} side={THREE.DoubleSide} />
              </mesh>
            </group>
          </group>
        </group>
      )}

      {station.id === 'assembly' && (
        <group>
          {/* Safety Yellow Gantry Crane Structure */}
          {[-1.85, 1.85].map((gx) => (
            <group key={gx} position={[gx, 0, 0]}>
              <mesh position={[0, 1.9, 1.45]} castShadow>
                <boxGeometry args={[0.2, 3.8, 0.2]} />
                <meshStandardMaterial color="#eab308" metalness={0.3} roughness={0.4} />
              </mesh>
              <mesh position={[0, 1.9, -1.45]} castShadow>
                <boxGeometry args={[0.2, 3.8, 0.2]} />
                <meshStandardMaterial color="#eab308" metalness={0.3} roughness={0.4} />
              </mesh>
            </group>
          ))}
          {/* Runway beams */}
          <mesh position={[0, 3.75, 1.45]} castShadow>
            <boxGeometry args={[4.2, 0.22, 0.16]} />
            <meshStandardMaterial color="#ca8a04" metalness={0.4} roughness={0.4} />
          </mesh>
          <mesh position={[0, 3.75, -1.45]} castShadow>
            <boxGeometry args={[4.2, 0.22, 0.16]} />
            <meshStandardMaterial color="#ca8a04" metalness={0.4} roughness={0.4} />
          </mesh>

          {/* Crane Traveling Bridge & Winch */}
          <group ref={craneBridge} position={[0, 3.75, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.3, 0.18, 3.0]} />
              <meshStandardMaterial color="#eab308" metalness={0.4} roughness={0.4} />
            </mesh>
            {/* Hoist Cable & Spreader Rig */}
            <group ref={craneHoist} position={[0, -1.3, 0]}>
              <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.015, 0.015, 0.9, 6]} />
                <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.4} />
              </mesh>
              {/* Lifting Spreader Fixture */}
              <mesh position={[0, 0, 0]} castShadow>
                <boxGeometry args={[1.2, 0.1, 0.6]} />
                <meshStandardMaterial color="#eab308" metalness={0.4} roughness={0.4} />
              </mesh>
            </group>
          </group>

          {/* Workstation Bench & Tire Storage Rack */}
          <group position={[1.8, 0, 1.6]}>
            <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
              <boxGeometry args={[1.2, 0.9, 0.55]} />
              <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.5} />
            </mesh>
            {/* Component Bins & Tool Pegboard */}
            <mesh position={[0, 1.1, -0.22]}>
              <boxGeometry args={[1.1, 0.42, 0.04]} />
              <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.6} />
            </mesh>
          </group>

          <group position={[-1.7, 0, 1.6]}>
            {/* Staged Wheel Tires ready for mounting */}
            {[0, 1, 2].map((ti) => (
              <mesh key={ti} position={[-0.3 + ti * 0.32, 0.28, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.26, 0.26, 0.16, 14]} />
                <meshStandardMaterial color="#1e293b" roughness={0.8} />
              </mesh>
            ))}
          </group>
        </group>
      )}

      {station.id === 'quality' && (
        <group>
          {/* High-Precision Scanning Arch */}
          <group ref={qualityArch} position={[0, 0, 0]}>
            {/* Upright portal arch */}
            <mesh position={[0, 1.65, 1.35]} castShadow>
              <boxGeometry args={[0.3, 3.0, 0.22]} />
              <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 1.65, -1.35]} castShadow>
              <boxGeometry args={[0.3, 3.0, 0.22]} />
              <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.4} />
            </mesh>
            <mesh position={[0, 3.1, 0]} castShadow>
              <boxGeometry args={[0.3, 0.22, 2.92]} />
              <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.4} />
            </mesh>

            {/* Luminous Inspection Green Light Strips */}
            <mesh position={[0, 1.65, 1.22]}>
              <boxGeometry args={[0.08, 2.8, 0.04]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.4} roughness={0.1} />
            </mesh>
            <mesh position={[0, 1.65, -1.22]}>
              <boxGeometry args={[0.08, 2.8, 0.04]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.4} roughness={0.1} />
            </mesh>
            <mesh position={[0, 2.97, 0]}>
              <boxGeometry args={[0.08, 0.04, 2.4]} />
              <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2.4} roughness={0.1} />
            </mesh>

            {/* Optical Scanner Pods */}
            {[-0.8, 0, 0.8].map((sz) => (
              <mesh key={sz} position={[0, 2.85, sz]} castShadow>
                <boxGeometry args={[0.18, 0.16, 0.16]} />
                <meshStandardMaterial color="#0284c7" metalness={0.5} roughness={0.4} />
              </mesh>
            ))}

            {/* Laser scanning plane curtain */}
            <mesh ref={scanCurtain} position={[0, 1.6, 0]} visible={false}>
              <planeGeometry args={[0.04, 2.6]} />
              <meshStandardMaterial color="#4ade80" emissive="#22c55e" emissiveIntensity={2.0} transparent opacity={0.28} side={THREE.DoubleSide} />
            </mesh>
          </group>

          {/* Quality Diagnostic Checkpost & Console */}
          <group position={[1.9, 0, 1.65]}>
            <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.85, 1.0, 0.5]} />
              <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* Diagnostic Monitor */}
            <mesh position={[0, 1.15, 0]} rotation={[-0.2, 0, 0]} castShadow>
              <boxGeometry args={[0.6, 0.4, 0.05]} />
              <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, 1.15, 0.03]} rotation={[-0.2, 0, 0]}>
              <planeGeometry args={[0.54, 0.34]} />
              <meshStandardMaterial color="#0284c7" emissive="#059669" emissiveIntensity={1.8} roughness={0.2} />
            </mesh>
          </group>
        </group>
      )}

      {/* Main vehicle rendered ONLY when inProcess is true */}
      {station.inProcess && (
        <group position={[carX, 0.28, 0]}>
          <VehicleModel
            bodyOnly={station.id === 'welding'}
            color={
              station.id === 'welding'
                ? '#848d98'
                : station.id === 'painting'
                ? '#0284c7'
                : station.id === 'assembly'
                ? '#0ea5e9'
                : '#38bdf8'
            }
          />
        </group>
      )}
    </group>
  );
}
