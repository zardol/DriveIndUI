// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, createElement as h, useImperativeHandle } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PerspectiveCamera, Vector3 } from 'three';
import { CameraRig, type CameraRequest } from './CameraRig';
import { DEFAULT_LAYOUT } from './factoryLayout';
import { buildConveyorRoute } from './conveyorPath';
import { ConveyorMotion } from './conveyorMotion';

const mock = vi.hoisted(() => ({ scene: null as any, frame: null as any, controls: null as any, props: null as any }));
vi.mock('@react-three/fiber', () => ({ useThree: () => mock.scene, useFrame: (callback: unknown) => { mock.frame = callback; } }));
vi.mock('@react-three/drei', () => ({ OrbitControls: (props: any) => { mock.props = props; useImperativeHandle(props.ref, () => mock.controls); return null; } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const route = buildConveyorRoute(DEFAULT_LAYOUT);
let motion: ConveyorMotion;
const request = (view: CameraRequest['view'], sequence: number): CameraRequest => ({ view, sequence, station: 'welding', vehicleId: 'car-1' });
const render = async (cameraRequest: CameraRequest, reducedMotion = false) => act(async () => root.render(h(CameraRig, { request: cameraRequest, layout: DEFAULT_LAYOUT, route, motion, reducedMotion })));
beforeEach(() => {
  mock.scene = { camera: new PerspectiveCamera(42, 1.5, .1, 2000), size: { width: 900, height: 600 }, invalidate: vi.fn() };
  mock.controls = { target: new Vector3(), enableDamping: true, update: vi.fn() };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); motion = new ConveyorMotion();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe('camera navigation', () => {
  it('preserves a manually chosen pose on resize and hide/show', async () => {
    const command = request('overview', 0); await render(command);
    mock.scene.camera.position.set(40, 18, 27); mock.controls.target.set(9, 1, 5);
    mock.scene.size = { width: 500, height: 650 }; await render(command);
    expect(mock.scene.camera.position.toArray()).toEqual([40, 18, 27]); expect(mock.controls.target.toArray()).toEqual([9, 1, 5]);
    mock.scene.size = { width: 0, height: 0 }; await render(command);
    mock.scene.size = { width: 1000, height: 600 }; await render(command);
    expect(mock.scene.camera.position.toArray()).toEqual([40, 18, 27]);
  });
  it('waits for a measurable canvas before applying a requested view', async () => {
    mock.scene.size = { width: 0, height: 0 }; const command = request('station', 1); await render(command, true);
    expect(mock.controls.update).not.toHaveBeenCalled();
    mock.scene.size = { width: 900, height: 600 }; await render(command, true);
    expect(mock.controls.target.toArray()).toEqual([12, 1, -15]);
  });
  it('animates a requested focus and lets a manual gesture cancel it immediately', async () => {
    await render(request('overview', 0)); const initial = mock.scene.camera.position.clone();
    await render(request('station', 1)); expect(mock.scene.camera.position.equals(initial)).toBe(true);
    mock.frame({}, 1 / 60); expect(mock.scene.camera.position.equals(initial)).toBe(false);
    mock.props.onStart(); const manual = mock.scene.camera.position.clone(); mock.frame({}, 1 / 60);
    expect(mock.scene.camera.position.equals(manual)).toBe(true);
  });
  it('stops vehicle tracking after manual navigation', async () => {
    const car = (distance: number) => ({ id: 'car-1', serial: 1, distance, speed: .5, stage: 'welding' as const, state: 'moving' as const, appearance: 'body' as const, outcome: 'pending' as const });
    motion.ingest([car(5)], 's', 10, performance.now(), false, 4);
    await render(request('vehicle', 1), true); const initial = mock.scene.camera.position.clone();
    motion.ingest([car(10)], 's', 20, performance.now(), false, 4); mock.frame({}, 1 / 60);
    expect(mock.scene.camera.position.equals(initial)).toBe(false);
    mock.props.onStart(); const manual = mock.scene.camera.position.clone();
    motion.ingest([car(15)], 's', 30, performance.now(), false, 4); mock.frame({}, 1 / 60);
    expect(mock.scene.camera.position.equals(manual)).toBe(true);
  });
});
