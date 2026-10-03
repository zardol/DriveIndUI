import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { type ConveyorRoute, sampleConveyor } from './conveyorPath';

import type { ConveyorVehicleSnapshot } from '@kosta/shared';

export interface ConveyorBeltProps {
  route: ConveyorRoute;
  vehicles: ConveyorVehicleSnapshot[];
  animate: boolean;
  speed: number;
}

interface RollerData {
  distance: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

function createSupportGeometry(halfWidth: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  function addBox(
    minX: number, minY: number, minZ: number,
    maxX: number, maxY: number, maxZ: number
  ) {
    const baseIndex = positions.length / 3;
    const faces = [
      { norm: [0, 0, 1], quad: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]] },
      { norm: [0, 0, -1], quad: [[maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ]] },
      { norm: [0, 1, 0], quad: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ]] },
      { norm: [0, -1, 0], quad: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ]] },
      { norm: [1, 0, 0], quad: [[maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ]] },
      { norm: [-1, 0, 0], quad: [[minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ]] },
    ];

    let offset = baseIndex;
    for (const f of faces) {
      for (const v of f.quad) {
        positions.push(v[0], v[1], v[2]);
        normals.push(f.norm[0], f.norm[1], f.norm[2]);
      }
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
      offset += 4;
    }
  }

  const legThick = 0.08;
  const legDepth = 0.08;
  const groundY = -0.1;
  const topY = 0.22;
  const legX = halfWidth + 0.04;

  addBox(-legX - legThick, groundY, -legDepth / 2, -legX, topY, legDepth / 2);
  addBox(legX, groundY, -legDepth / 2, legX + legThick, topY, legDepth / 2);
  addBox(-legX - legThick, topY - 0.06, -legDepth / 2, legX + legThick, topY, legDepth / 2);
  addBox(-legX - legThick - 0.04, groundY, -0.1, -legX + 0.04, groundY + 0.02, 0.1);
  addBox(legX - 0.04, groundY, -0.1, legX + legThick + 0.04, groundY + 0.02, 0.1);

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.rotateY(Math.PI / 2);
  return geo;
}

export function ConveyorBelt({
  route,
  vehicles,
  animate,
  speed,
}: ConveyorBeltProps): React.JSX.Element {
  const scale = route?.vehicleScale ?? 1.0;
  const beltWidth = Math.max(1.8, 1.9 * scale);
  const halfW = beltWidth / 2;
  const routeLength = route?.length ?? 200;

  const pathPoints = useMemo(() => {
    const pts: [number, number][] = [];
    if (route?.lanes && Array.isArray(route.lanes) && route.lanes.length > 0) {
      for (const lane of route.lanes) {
        if (!lane?.points) continue;
        for (let i = 0; i < lane.points.length; i++) {
          const p = lane.points[i];
          if (pts.length > 0) {
            const last = pts[pts.length - 1];
            const d2 = (p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2;
            if (d2 < 0.0001) continue;
          }
          pts.push([p[0], p[1]]);
        }
      }
    }

    if (pts.length < 2 && typeof sampleConveyor === 'function' && route) {
      const numSamples = 240;
      for (let i = 0; i <= numSamples; i++) {
        const d = (i / numSamples) * routeLength;
        const s = sampleConveyor(route, d);
        if (s && typeof s.x === 'number' && typeof s.z === 'number') {
          pts.push([s.x, s.z]);
        }
      }
    }

    if (pts.length < 2) {
      pts.push([0, 0], [0, routeLength]);
    }

    return pts;
  }, [route, routeLength]);

  const { bedGeo, railsGeo } = useMemo(() => {
    const n = pathPoints.length;
    const tangents: [number, number][] = [];
    const normals: [number, number][] = [];

    for (let i = 0; i < n; i++) {
      let dx = 0;
      let dz = 0;
      if (i === 0) {
        dx = pathPoints[1][0] - pathPoints[0][0];
        dz = pathPoints[1][1] - pathPoints[0][1];
      } else if (i === n - 1) {
        dx = pathPoints[n - 1][0] - pathPoints[n - 2][0];
        dz = pathPoints[n - 1][1] - pathPoints[n - 2][1];
      } else {
        const dx1 = pathPoints[i][0] - pathPoints[i - 1][0];
        const dz1 = pathPoints[i][1] - pathPoints[i - 1][1];
        const len1 = Math.hypot(dx1, dz1) || 1;
        const dx2 = pathPoints[i + 1][0] - pathPoints[i][0];
        const dz2 = pathPoints[i + 1][1] - pathPoints[i][1];
        const len2 = Math.hypot(dx2, dz2) || 1;
        dx = dx1 / len1 + dx2 / len2;
        dz = dz1 / len1 + dz2 / len2;
      }
      const len = Math.hypot(dx, dz) || 1;
      const tx = dx / len;
      const tz = dz / len;
      tangents.push([tx, tz]);
      normals.push([-tz, tx]);
    }

    const bedPositions: number[] = [];
    const bedNormals: number[] = [];
    const bedIndices: number[] = [];

    const railsPositions: number[] = [];
    const railsNormals: number[] = [];
    const railsIndices: number[] = [];

    const bedTopY = 0.24;
    const bedBottomY = 0.16;
    const railTopY = 0.31;
    const railThick = 0.07;

    for (let i = 0; i < n; i++) {
      const [px, pz] = pathPoints[i];
      const [nx, nz] = normals[i];

      const lx = px + nx * halfW;
      const lz = pz + nz * halfW;
      const rx = px - nx * halfW;
      const rz = pz - nz * halfW;

      const bedBase = bedPositions.length / 3;
      bedPositions.push(lx, bedTopY, lz);
      bedPositions.push(rx, bedTopY, rz);
      bedPositions.push(lx, bedBottomY, lz);
      bedPositions.push(rx, bedBottomY, rz);

      bedNormals.push(0, 1, 0);
      bedNormals.push(0, 1, 0);
      bedNormals.push(nx, 0, nz);
      bedNormals.push(-nx, 0, -nz);

      if (i > 0) {
        const prevBase = bedBase - 4;
        bedIndices.push(prevBase, bedBase, prevBase + 1);
        bedIndices.push(prevBase + 1, bedBase, bedBase + 1);

        bedIndices.push(prevBase, prevBase + 2, bedBase);
        bedIndices.push(prevBase + 2, bedBase + 2, bedBase);

        bedIndices.push(prevBase + 1, bedBase + 1, prevBase + 3);
        bedIndices.push(prevBase + 3, bedBase + 1, bedBase + 3);
      }

      const railBase = railsPositions.length / 3;
      const lOutX = px + nx * (halfW + railThick);
      const lOutZ = pz + nz * (halfW + railThick);
      const rOutX = px - nx * (halfW + railThick);
      const rOutZ = pz - nz * (halfW + railThick);

      railsPositions.push(lx, railTopY, lz);
      railsPositions.push(lOutX, railTopY, lOutZ);
      railsPositions.push(lx, bedTopY, lz);
      railsPositions.push(lOutX, bedBottomY, lOutZ);

      railsPositions.push(rx, railTopY, rz);
      railsPositions.push(rOutX, railTopY, rOutZ);
      railsPositions.push(rx, bedTopY, rz);
      railsPositions.push(rOutX, bedBottomY, rOutZ);

      railsNormals.push(0, 1, 0);
      railsNormals.push(0, 1, 0);
      railsNormals.push(-nx, 0, -nz);
      railsNormals.push(nx, 0, nz);

      railsNormals.push(0, 1, 0);
      railsNormals.push(0, 1, 0);
      railsNormals.push(nx, 0, nz);
      railsNormals.push(-nx, 0, -nz);

      if (i > 0) {
        const prevR = railBase - 8;
        railsIndices.push(prevR, railBase, prevR + 1);
        railsIndices.push(prevR + 1, railBase, railBase + 1);

        railsIndices.push(prevR, prevR + 2, railBase);
        railsIndices.push(prevR + 2, railBase + 2, railBase);

        railsIndices.push(prevR + 1, railBase + 1, prevR + 3);
        railsIndices.push(prevR + 3, railBase + 1, railBase + 3);

        railsIndices.push(prevR + 4, railBase + 4, prevR + 5);
        railsIndices.push(prevR + 5, railBase + 4, railBase + 5);

        railsIndices.push(prevR + 4, railBase + 4, prevR + 6);
        railsIndices.push(prevR + 6, railBase + 4, railBase + 6);

        railsIndices.push(prevR + 5, prevR + 7, railBase + 5);
        railsIndices.push(prevR + 7, railBase + 7, railBase + 5);
      }
    }

    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bedPositions, 3));
    bGeo.setAttribute('normal', new THREE.Float32BufferAttribute(bedNormals, 3));
    bGeo.setIndex(bedIndices);

    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(railsPositions, 3));
    rGeo.setAttribute('normal', new THREE.Float32BufferAttribute(railsNormals, 3));
    rGeo.setIndex(railsIndices);

    return { bedGeo: bGeo, railsGeo: rGeo };
  }, [pathPoints, halfW]);

  const supportGeo = useMemo(() => createSupportGeometry(halfW), [halfW]);

  const rollerGeo = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.04, 0.04, beltWidth * 0.94, 12);
    geo.rotateX(Math.PI / 2);
    return geo;
  }, [beltWidth]);

  const centerGeo = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.024, 0.008, beltWidth * 0.85);
    geo.translate(0, 0.043, 0);
    return geo;
  }, [beltWidth]);

  const bedMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x2b2e33,
        roughness: 0.65,
        metalness: 0.35,
      }),
    []
  );

  const railsMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x1e3338,
        roughness: 0.35,
        metalness: 0.72,
      }),
    []
  );

  const supportMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x25282c,
        roughness: 0.75,
        metalness: 0.4,
      }),
    []
  );

  const rollerMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x989ea6,
        roughness: 0.4,
        metalness: 0.45,
      }),
    []
  );

  const centerMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0xdce3c9,
        roughness: 0.25,
        metalness: 0.85,
      }),
    []
  );

  useEffect(() => () => bedGeo.dispose(), [bedGeo]);
  useEffect(() => () => railsGeo.dispose(), [railsGeo]);
  useEffect(() => () => supportGeo.dispose(), [supportGeo]);
  useEffect(() => () => rollerGeo.dispose(), [rollerGeo]);
  useEffect(() => () => centerGeo.dispose(), [centerGeo]);
  useEffect(() => () => bedMaterial.dispose(), [bedMaterial]);
  useEffect(() => () => railsMaterial.dispose(), [railsMaterial]);
  useEffect(() => () => supportMaterial.dispose(), [supportMaterial]);
  useEffect(() => () => rollerMaterial.dispose(), [rollerMaterial]);
  useEffect(() => () => centerMaterial.dispose(), [centerMaterial]);

  const rollerList: RollerData[] = useMemo(() => {
    const spacing = 0.45;
    const count = Math.max(10, Math.floor(routeLength / spacing));
    const list: RollerData[] = [];

    for (let i = 0; i < count; i++) {
      const d = (i + 0.5) * (routeLength / count);
      const s = sampleConveyor(route, d);
      list.push({
        distance: d,
        x: s.x,
        y: 0.268,
        z: s.z,
        yaw: s.yaw,
      });
    }
    return list;
  }, [route, routeLength]);

  const numRollers = rollerList.length;

  const supportList = useMemo(() => {
    const spacing = 6.0;
    const count = Math.max(2, Math.floor(routeLength / spacing));
    const list: { x: number; z: number; yaw: number }[] = [];

    for (let i = 0; i <= count; i++) {
      const d = Math.min(routeLength, i * (routeLength / count));
      const s = sampleConveyor(route, d);
      list.push({ x: s.x, z: s.z, yaw: s.yaw });
    }
    return list;
  }, [route, routeLength]);

  const numSupports = supportList.length;

  const rollerMeshRef = useRef<THREE.InstancedMesh>(null);
  const centerMeshRef = useRef<THREE.InstancedMesh>(null);
  const supportMeshRef = useRef<THREE.InstancedMesh>(null);

  const phases = useRef<Float32Array>(new Float32Array(0));
  const baseQuats = useRef<THREE.Quaternion[]>([]);

  useEffect(() => {
    const arr = new Float32Array(numRollers);
    const quats: THREE.Quaternion[] = [];
    const yAxis = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < numRollers; i++) {
      arr[i] = ((i * 1.6180339887) % 1.0) * Math.PI * 2;
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(yAxis, rollerList[i].yaw);
      quats.push(q);
    }
    phases.current = arr;
    baseQuats.current = quats;
  }, [numRollers, rollerList]);

  useEffect(() => {
    if (!supportMeshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < numSupports; i++) {
      const s = supportList[i];
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, s.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      supportMeshRef.current.setMatrixAt(i, dummy.matrix);
    }
    supportMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [supportList, numSupports]);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const spinQuat = useMemo(() => new THREE.Quaternion(), []);
  const combinedQuat = useMemo(() => new THREE.Quaternion(), []);
  const rollerAxis = useMemo(() => new THREE.Vector3(0, 0, 1), []);

  useEffect(() => {
    if (!rollerMeshRef.current || baseQuats.current.length < numRollers) return;
    for (let j = 0; j < numRollers; j++) {
      const r = rollerList[j];
      spinQuat.setFromAxisAngle(rollerAxis, phases.current[j] ?? 0);
      combinedQuat.multiplyQuaternions(baseQuats.current[j], spinQuat);
      dummy.position.set(r.x, r.y, r.z);
      dummy.quaternion.copy(combinedQuat);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rollerMeshRef.current.setMatrixAt(j, dummy.matrix);
      centerMeshRef.current?.setMatrixAt(j, dummy.matrix);
    }
    rollerMeshRef.current.instanceMatrix.needsUpdate = true;
    if (centerMeshRef.current) {
      centerMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [numRollers, rollerList, dummy, spinQuat, combinedQuat, rollerAxis]);

  const stationaryDistances = useMemo(() => vehicles.filter(v => v.speed <= 0.001 || v.state !== 'moving').map(v => v.distance), [vehicles]);

  useFrame((_, delta) => {
    if (!animate || !rollerMeshRef.current || baseQuats.current.length < numRollers) return;

    const dt = Math.min(delta, 0.1);
    // Visual drive cue; compress high playback rates to avoid strobing.
    const mult = Math.min(5, Math.max(0.1, Math.sqrt(speed)));
    const rotDelta = dt * 6.5 * mult;

    const p = phases.current;
    const twoPi = Math.PI * 2;
    const stationaryCount = stationaryDistances.length;

    for (let j = 0; j < numRollers; j++) {
      const r = rollerList[j];
      let isHeld = false;

      for (let s = 0; s < stationaryCount; s++) {
        if (Math.abs(r.distance - stationaryDistances[s]) <= 3.2) {
          isHeld = true;
          break;
        }
      }

      if (!isHeld) {
        p[j] = (p[j] + rotDelta) % twoPi;
      }

      spinQuat.setFromAxisAngle(rollerAxis, p[j]);
      combinedQuat.multiplyQuaternions(baseQuats.current[j], spinQuat);

      dummy.position.set(r.x, r.y, r.z);
      dummy.quaternion.copy(combinedQuat);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();

      rollerMeshRef.current.setMatrixAt(j, dummy.matrix);
      centerMeshRef.current?.setMatrixAt(j, dummy.matrix);
    }

    rollerMeshRef.current.instanceMatrix.needsUpdate = true;
    if (centerMeshRef.current) {
      centerMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <mesh geometry={bedGeo} material={bedMaterial} receiveShadow />
      <mesh geometry={railsGeo} material={railsMaterial} castShadow receiveShadow />
      <instancedMesh
        ref={supportMeshRef}
        args={[supportGeo, supportMaterial, numSupports]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={rollerMeshRef}
        args={[rollerGeo, rollerMaterial, numRollers]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
      <instancedMesh
        ref={centerMeshRef}
        args={[centerGeo, centerMaterial, numRollers]}
        frustumCulled={false}
        castShadow
        receiveShadow
      />
    </group>
  );
}

export default ConveyorBelt;
