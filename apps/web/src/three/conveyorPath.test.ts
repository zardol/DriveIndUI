import { describe, it, expect } from 'vitest';
import { buildConveyorRoute, sampleConveyor, routeLaneForDistance } from './conveyorPath';
import { DEFAULT_LAYOUT, type FactoryLayout } from './factoryLayout';

const ORCHESTRATOR_LAYOUT: FactoryLayout = {
    version: 1,
    title: 'Large',
    units: 'meters',
    floor: { width: 100, depth: 96 },
    stations: [
        { id: 'welding', position: [28, -33], rotation: 0 },
        { id: 'painting', position: [-28, -11], rotation: 180 },
        { id: 'assembly', position: [28, 11], rotation: 0 },
        { id: 'quality', position: [-28, 33], rotation: 180 }
    ],
    terminals: { supply: [-44, -33], finished: [8, 42] }
};

function angleDiff(a: number, b: number) {
    let d = Math.abs(a - b) % (2 * Math.PI);
    return d > Math.PI ? 2 * Math.PI - d : d;
}

function ccw(A: [number, number], B: [number, number], C: [number, number]) {
    return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
}

function doSegmentsIntersect(A: [number, number], B: [number, number], C: [number, number], D: [number, number]) {
    if (Math.hypot(A[0] - C[0], A[1] - C[1]) < 1e-3) return false;
    if (Math.hypot(A[0] - D[0], A[1] - D[1]) < 1e-3) return false;
    if (Math.hypot(B[0] - C[0], B[1] - C[1]) < 1e-3) return false;
    if (Math.hypot(B[0] - D[0], B[1] - D[1]) < 1e-3) return false;
    return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D);
}

describe('conveyorPath', () => {
    it('endpoints default layout', () => {
        const route = buildConveyorRoute(DEFAULT_LAYOUT);
        const start = sampleConveyor(route, 0);
        const end = sampleConveyor(route, 200);
        expect(start.x).toBeCloseTo(DEFAULT_LAYOUT.terminals.supply[0]);
        expect(start.z).toBeCloseTo(DEFAULT_LAYOUT.terminals.supply[1]);
        expect(end.x).toBeCloseTo(DEFAULT_LAYOUT.terminals.finished[0]);
        expect(end.z).toBeCloseTo(DEFAULT_LAYOUT.terminals.finished[1]);
    });

    it('station boundary continuity yaw approach/exit', () => {
        const route = buildConveyorRoute(ORCHESTRATOR_LAYOUT);
        const dists = [40, 80, 120, 160];
        for (const d of dists) {
            const before = sampleConveyor(route, d - 1e-3);
            const exactly = sampleConveyor(route, d);
            const after = sampleConveyor(route, d + 1e-3);
            expect(before.x).toBeCloseTo(exactly.x, 1);
            expect(before.z).toBeCloseTo(exactly.z, 1);
            expect(after.x).toBeCloseTo(exactly.x, 1);
            expect(after.z).toBeCloseTo(exactly.z, 1);
            expect(angleDiff(before.yaw, exactly.yaw)).toBeLessThan(0.1);
            expect(angleDiff(after.yaw, exactly.yaw)).toBeLessThan(0.1);
        }
    });

    it('monotone arc/sampling', () => {
        const route = buildConveyorRoute(ORCHESTRATOR_LAYOUT);
        let last = sampleConveyor(route, 0);
        let totalPhys = 0;
        for (let d = 0.5; d <= 200; d += 0.5) {
            const cur = sampleConveyor(route, d);
            const dist = Math.hypot(cur.x - last.x, cur.z - last.z);
            expect(dist).toBeGreaterThan(0);
            totalPhys += dist;
            last = cur;
        }
        expect(totalPhys).toBeGreaterThan(100);
    });

    it('no intersection default', () => {
        const route = buildConveyorRoute(ORCHESTRATOR_LAYOUT);
        const segments: { p1: [number, number]; p2: [number, number] }[] = [];
        for (const lane of route.lanes) {
            for (let i = 0; i < lane.points.length - 1; i++) {
                segments.push({ p1: lane.points[i], p2: lane.points[i + 1] });
            }
        }
        for (let i = 0; i < segments.length; i++) {
            for (let j = i + 1; j < segments.length; j++) {
                const intersect = doSegmentsIntersect(segments[i].p1, segments[i].p2, segments[j].p1, segments[j].p2);
                expect(intersect).toBe(false);
            }
        }
    });

    it('finite oldlayout', () => {
        const route = buildConveyorRoute(DEFAULT_LAYOUT);
        expect(Number.isFinite(route.length)).toBe(true);
        expect(route.lanes.length).toBe(5);
        for (const lane of route.lanes) {
            expect(Number.isFinite(lane.length)).toBe(true);
            for (const pt of lane.points) {
                expect(Number.isFinite(pt[0])).toBe(true);
                expect(Number.isFinite(pt[1])).toBe(true);
            }
        }
    });

    it('cardinal rotations and minscale', () => {
        const layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)) as FactoryLayout;
        layout.floor = { width: DEFAULT_LAYOUT.floor.depth, depth: DEFAULT_LAYOUT.floor.width };
        for (const station of layout.stations) {
            station.position = [station.position[1], -station.position[0]];
            station.rotation = (station.rotation + 90) % 360 as 0 | 90 | 180 | 270;
        }
        for (const key of ['supply', 'finished'] as const) {
            const p = layout.terminals[key];
            layout.terminals[key] = [p[1], -p[0]];
        }
        const route = buildConveyorRoute(layout);
        expect(route.vehicleScale).toBeGreaterThan(0);
        expect(route.vehicleScale).toBeLessThanOrEqual(1);
    });

    it('rejects a crossing route before it can be applied to the scene', () => {
        const layout = structuredClone(DEFAULT_LAYOUT);
        layout.stations[0].rotation = 90;
        layout.stations[1].rotation = 270;
        expect(() => buildConveyorRoute(layout)).toThrow('пересекает');
    });

    it('clamp inputs', () => {
        const route = buildConveyorRoute(DEFAULT_LAYOUT);
        const low = sampleConveyor(route, -10);
        const zero = sampleConveyor(route, 0);
        expect(low).toEqual(zero);
        const high = sampleConveyor(route, 300);
        const end = sampleConveyor(route, 200);
        expect(high).toEqual(end);
        const nan = sampleConveyor(route, NaN);
        expect(nan).toEqual(zero);
    });

    it('no input mutation', () => {
        const clone = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
        const route = buildConveyorRoute(clone);
        route.lanes[0].points[0][0] = 999;
        expect(clone).toEqual(DEFAULT_LAYOUT);
    });
    it('keeps complete cars separated on straight sections, corners and station boundaries', () => {
        const route = buildConveyorRoute(DEFAULT_LAYOUT);
        for (let d = 0; d <= 196; d += 0.1) {
            const a = sampleConveyor(route, d), b = sampleConveyor(route, d + 4);
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(3.25 * route.vehicleScale);
        }
    });
    it('supports the previous compact layout without dropping queue vehicles', () => {
        const compact: FactoryLayout = { ...DEFAULT_LAYOUT, floor: { width: 44, depth: 32 }, stations: [
            { id: 'welding', position: [-5,-6], rotation: 0 }, { id: 'painting', position: [7,-6], rotation: 0 },
            { id: 'assembly', position: [7,7], rotation: 180 }, { id: 'quality', position: [-5,7], rotation: 180 },
        ], terminals: { supply: [-16,-6], finished: [-16,7] } };
        const route = buildConveyorRoute(compact);
        expect(route.vehicleScale).toBeGreaterThan(0);
        for (const lane of route.lanes) for (const p of lane.points) {
            expect(Math.abs(p[0])).toBeLessThan(22);
            expect(Math.abs(p[1])).toBeLessThan(16);
        }
    });

    it('routeLaneForDistance', () => {
        expect(routeLaneForDistance(-10)).toBe(0);
        expect(routeLaneForDistance(NaN)).toBe(0);
        expect(routeLaneForDistance(15)).toBe(0);
        expect(routeLaneForDistance(40)).toBe(1);
        expect(routeLaneForDistance(199)).toBe(4);
        expect(routeLaneForDistance(300)).toBe(4);
    });
});
