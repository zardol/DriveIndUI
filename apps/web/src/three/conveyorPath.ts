import type { FactoryLayout } from './factoryLayout';
import { CONVEYOR_SPEC } from '@driveindui/shared';

export type Point2 = [number, number];

export interface RouteLane {
    index: number;
    points: Point2[];
    cumulative: number[];
    length: number;
}

export interface ConveyorRoute {
    lanes: RouteLane[];
    vehicleScale: number;
    length: number;
}

function dot(a: Point2, b: Point2): number {
    return a[0] * b[0] + a[1] * b[1];
}

function getDominant(from: Point2, to: Point2): Point2 {
    const dx = to[0] - from[0];
    const dz = to[1] - from[1];
    if (Math.abs(dx) >= Math.abs(dz)) {
        return [Math.sign(dx) || 1, 0];
    }
    return [0, Math.sign(dz) || 1];
}

function routeOrthogonal(p1: Point2, d1: Point2, p2: Point2, d2: Point2, floor: FactoryLayout['floor']): Point2[] {
    const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const sameDir = dot(d1, d2) > 0.9;

    let L1 = 12;
    let L2 = 12;
    if (sameDir && dist < 25) {
        L1 = 5;
        L2 = 5;
    }
    const clearance = (p: Point2, d: Point2) => d[0] ? floor.width / 2 - 1.3 - p[0] * d[0] : floor.depth / 2 - 1.3 - p[1] * d[1];
    L1 = Math.max(0.1, Math.min(L1, clearance(p1, d1)));
    L2 = Math.max(0.1, Math.min(L2, clearance(p2, [-d2[0], -d2[1]])));

    const s: Point2 = [p1[0] + d1[0] * L1, p1[1] + d1[1] * L1];
    const e: Point2 = [p2[0] - d2[0] * L2, p2[1] - d2[1] * L2];

    const wrap = 12;
    const candidates: Point2[][] = [
        [p1, s, e, p2],
        [p1, s, [s[0], e[1]], e, p2],
        [p1, s, [e[0], s[1]], e, p2],
        [p1, s, [s[0], s[1] + wrap], [e[0], s[1] + wrap], e, p2],
        [p1, s, [s[0], s[1] - wrap], [e[0], s[1] - wrap], e, p2],
        [p1, s, [s[0] + wrap, s[1]], [s[0] + wrap, e[1]], e, p2],
        [p1, s, [s[0] - wrap, s[1]], [s[0] - wrap, e[1]], e, p2]
    ];

    let bestCost = Infinity;
    let bestPath = candidates[0];

    for (let idx = 0; idx < candidates.length; idx++) {
        const path = candidates[idx];
        let valid = path.every(p => Math.abs(p[0]) <= floor.width / 2 - 1 && Math.abs(p[1]) <= floor.depth / 2 - 1);
        let cost = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const dx = path[i + 1][0] - path[i][0];
            const dz = path[i + 1][1] - path[i][1];
            if (Math.abs(dx) > 1e-5 && Math.abs(dz) > 1e-5) {
                valid = false;
                break;
            }
            const len = Math.hypot(dx, dz);
            cost += len;
            if (i === 0 && dx * d1[0] + dz * d1[1] < -1e-5) valid = false;
            if (i === path.length - 2 && dx * d2[0] + dz * d2[1] < -1e-5) valid = false;
            if (i > 0) {
                const pdx = path[i][0] - path[i - 1][0];
                const pdz = path[i][1] - path[i - 1][1];
                if (len > 1e-5 && Math.hypot(pdx, pdz) > 1e-5) {
                    if (dx * pdx + dz * pdz < -1e-5) valid = false;
                }
            }
        }
        if (valid && cost < bestCost) {
            bestCost = cost;
            bestPath = path;
        }
    }

    if (!Number.isFinite(bestCost)) throw new Error('Для этих координат не хватает места для конвейера. Измените расположение или поворот участков.');
    const clean: Point2[] = [[...bestPath[0]]];
    for (let i = 1; i < bestPath.length; i++) {
        const p = bestPath[i];
        const prev = clean[clean.length - 1];
        if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-5) {
            if (clean.length >= 2) {
                const pprev = clean[clean.length - 2];
                const dx1 = prev[0] - pprev[0];
                const dz1 = prev[1] - pprev[1];
                const dx2 = p[0] - prev[0];
                const dz2 = p[1] - prev[1];
                if (Math.abs(dx1 * dz2 - dz1 * dx2) < 1e-5 && dot([dx1, dz1], [dx2, dz2]) > 0) {
                    clean.pop();
                }
            }
            clean.push([...p]);
        }
    }
    return clean;
}

function getRoundedPolyline(points: Point2[]): Point2[] {
    if (points.length < 3) return points;
    const result: Point2[] = [points[0]];
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const next = points[i + 1];

        const dx1 = curr[0] - prev[0];
        const dz1 = curr[1] - prev[1];
        const len1 = Math.hypot(dx1, dz1);

        const dx2 = next[0] - curr[0];
        const dz2 = next[1] - curr[1];
        const len2 = Math.hypot(dx2, dz2);

        if (len1 < 1e-5 || len2 < 1e-5) {
            continue;
        }

        const r = Math.min(4, len1 / 2.01, len2 / 2.01);
        if (r < 1e-5) {
            result.push(curr);
            continue;
        }

        const A: Point2 = [curr[0] - (dx1 / len1) * r, curr[1] - (dz1 / len1) * r];
        const B: Point2 = [curr[0] + (dx2 / len2) * r, curr[1] + (dz2 / len2) * r];

        const steps = 16;
        for (let j = 0; j <= steps; j++) {
            const t = j / steps;
            const mt = 1 - t;
            const x = mt * mt * A[0] + 2 * mt * t * curr[0] + t * t * B[0];
            const z = mt * mt * A[1] + 2 * mt * t * curr[1] + t * t * B[1];
            result.push([x, z]);
        }
    }
    result.push(points[points.length - 1]);

    const clean: Point2[] = [result[0]];
    for (let i = 1; i < result.length; i++) {
        const prev = clean[clean.length - 1];
        const p = result[i];
        if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-5) {
            clean.push(p);
        }
    }
    return clean;
}

export function buildConveyorRoute(layout: FactoryLayout): ConveyorRoute {
    const pts: Point2[] = [
        layout.terminals.supply,
        layout.stations[0].position,
        layout.stations[1].position,
        layout.stations[2].position,
        layout.stations[3].position,
        layout.terminals.finished
    ];

    const dirs: Point2[] = [
        getDominant(layout.terminals.supply, layout.stations[0].position),
        ...layout.stations.map(s => {
            const r = s.rotation * Math.PI / 180;
            return [Math.cos(r), -Math.sin(r)] as Point2;
        }),
        getDominant(layout.stations[3].position, layout.terminals.finished)
    ];

    for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        if (Math.abs(d[0]) > 0.5) {
            dirs[i] = [Math.sign(d[0]), 0];
        } else {
            dirs[i] = [0, Math.sign(d[1])];
        }
    }

    const lanes: RouteLane[] = [];
    let minLaneLength = Infinity;

    for (let i = 0; i < 5; i++) {
        const p1 = pts[i];
        const d1 = dirs[i];
        const p2 = pts[i + 1];
        const d2 = dirs[i + 1];

        const rawPoints = routeOrthogonal(p1, d1, p2, d2, layout.floor);
        const rounded = getRoundedPolyline(rawPoints);

        const cumulative = [0];
        let len = 0;
        for (let j = 1; j < rounded.length; j++) {
            len += Math.hypot(rounded[j][0] - rounded[j - 1][0], rounded[j][1] - rounded[j - 1][1]);
            cumulative.push(len);
        }

        lanes.push({
            index: i,
            points: rounded,
            cumulative,
            length: len
        });
        if (len > 0 && len < minLaneLength) {
            minLaneLength = len;
        }
    }

    const safeMin = minLaneLength === Infinity ? 40 : minLaneLength;
    const logicalSpacing = CONVEYOR_SPEC.minSpacing;
    const ratio = safeMin / CONVEYOR_SPEC.segmentLength;
    const physicalSpacing = logicalSpacing * ratio;

    let scale = (physicalSpacing * 0.7) / 3.0;
    if (scale > 1) scale = 1;
    if (scale <= 0) scale = 0.1;

    assertNoCrossings(lanes);
    return {
        lanes,
        vehicleScale: scale,
        length: CONVEYOR_SPEC.length
    };
}

/** A single level conveyor must not cross itself, including collinear overlaps. */
function assertNoCrossings(lanes: RouteLane[]): void {
    const segments = lanes.flatMap(lane => lane.points.slice(1).map((b, i) => ({ a: lane.points[i], b })));
    const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const onSegment = (a: Point2, b: Point2, p: Point2) => Math.abs(cross(a, b, p)) < 1e-7
        && p[0] >= Math.min(a[0], b[0]) - 1e-7 && p[0] <= Math.max(a[0], b[0]) + 1e-7
        && p[1] >= Math.min(a[1], b[1]) - 1e-7 && p[1] <= Math.max(a[1], b[1]) + 1e-7;
    for (let i = 0; i < segments.length; i++) for (let j = i + 2; j < segments.length; j++) {
        const { a, b } = segments[i], { a: c, b: d } = segments[j];
        const ac = cross(a, b, c), ad = cross(a, b, d), ca = cross(c, d, a), cb = cross(c, d, b);
        if ((ac * ad < 0 && ca * cb < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)) {
            throw new Error('Маршрут конвейера пересекает сам себя. Измените координаты или повороты участков.');
        }
    }
}

export function sampleConveyor(route: ConveyorRoute, distance: number): { x: number; z: number; yaw: number; lane: number } {
    let d = Number.isFinite(distance) ? distance : 0;
    if (d < 0) d = 0;
    if (d > route.length) d = route.length;

    let laneIdx = Math.floor(d / CONVEYOR_SPEC.segmentLength);
    if (laneIdx >= route.lanes.length) laneIdx = route.lanes.length - 1;
    if (laneIdx < 0) laneIdx = 0;

    const lane = route.lanes[laneIdx];
    const t = (d - laneIdx * CONVEYOR_SPEC.segmentLength) / CONVEYOR_SPEC.segmentLength;
    const targetLen = t * lane.length;

    const pts = lane.points;
    const cum = lane.cumulative;

    if (pts.length < 2) {
        return { x: pts[0][0], z: pts[0][1], yaw: 0, lane: laneIdx };
    }

    if (targetLen <= 0) {
        const dx = pts[1][0] - pts[0][0];
        const dz = pts[1][1] - pts[0][1];
        return { x: pts[0][0], z: pts[0][1], yaw: Math.atan2(-dz, dx), lane: laneIdx };
    }
    if (targetLen >= lane.length) {
        const last = pts.length - 1;
        const dx = pts[last][0] - pts[last - 1][0];
        const dz = pts[last][1] - pts[last - 1][1];
        return { x: pts[last][0], z: pts[last][1], yaw: Math.atan2(-dz, dx), lane: laneIdx };
    }

    for (let i = 0; i < cum.length - 1; i++) {
        if (targetLen >= cum[i] && targetLen <= cum[i + 1]) {
            const segLen = cum[i + 1] - cum[i];
            const segT = segLen > 0 ? (targetLen - cum[i]) / segLen : 0;

            const p0 = pts[i];
            const p1 = pts[i + 1];
            const x = p0[0] + (p1[0] - p0[0]) * segT;
            const z = p0[1] + (p1[1] - p0[1]) * segT;

            const dx = p1[0] - p0[0];
            const dz = p1[1] - p0[1];
            const yaw = Math.atan2(-dz, dx);

            return { x, z, yaw, lane: laneIdx };
        }
    }

    const last = pts.length - 1;
    const dx = pts[last][0] - pts[last - 1][0];
    const dz = pts[last][1] - pts[last - 1][1];
    return { x: pts[last][0], z: pts[last][1], yaw: Math.atan2(-dz, dx), lane: laneIdx };
}

export function routeLaneForDistance(distance: number): number {
    let d = Number.isFinite(distance) ? distance : 0;
    if (d < 0) d = 0;
    if (d >= 200) return 4;
    return Math.floor(d / 40);
}
