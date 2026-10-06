/**
 * Spatial & Temporal Rule Evaluators
 *
 * Reusable rule engines evaluated on persistent ObjectTrack trajectories:
 * 1. Intrusion: Point-in-polygon test + dwell time threshold
 * 2. Line Crossing: Ray-segment intersection + crossing direction
 * 3. Loitering: Dwell time threshold in restricted zones
 * 4. Crowd Density: Active track count exceeding threshold in defined areas
 */
export var CrossingDirection;
(function (CrossingDirection) {
    CrossingDirection["A_TO_B"] = "A_TO_B";
    CrossingDirection["B_TO_A"] = "B_TO_A";
    CrossingDirection["BOTH"] = "BOTH";
})(CrossingDirection || (CrossingDirection = {}));
export class SpatialTemporalRules {
    /**
     * Evaluates if a point is inside a polygon using ray-casting algorithm
     */
    static isPointInPolygon(point, polygon) {
        if (polygon.length < 3)
            return false;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;
            const intersect = yi > point.y !== yj > point.y &&
                point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.000001) + xi;
            if (intersect)
                inside = !inside;
        }
        return inside;
    }
    /**
     * Evaluates Intrusion: Track is inside polygon for >= dwellSeconds
     */
    static evaluateIntrusion(track, zone, dwellSecondsThreshold = 1.5) {
        if (track.trajectory.length === 0)
            return { triggered: false, dwellSeconds: 0 };
        const latest = track.trajectory[track.trajectory.length - 1];
        const isInside = this.isPointInPolygon({ x: latest.x, y: latest.y }, zone);
        if (!isInside)
            return { triggered: false, dwellSeconds: 0 };
        // Calculate how many points in recent history have been in zone
        let firstInsideTime = latest.timestamp;
        for (let i = track.trajectory.length - 1; i >= 0; i--) {
            const pt = track.trajectory[i];
            if (this.isPointInPolygon({ x: pt.x, y: pt.y }, zone)) {
                firstInsideTime = pt.timestamp;
            }
            else {
                break;
            }
        }
        const dwellSeconds = (latest.timestamp - firstInsideTime) / 1000;
        return {
            triggered: dwellSeconds >= dwellSecondsThreshold,
            dwellSeconds,
            currentPoint: { x: latest.x, y: latest.y },
        };
    }
    /**
     * Evaluates Line Crossing: Track trajectory intersected virtual line in configured direction
     */
    static evaluateLineCrossing(track, line, direction = CrossingDirection.BOTH) {
        if (track.trajectory.length < 2)
            return { crossed: false };
        const pPrev = track.trajectory[track.trajectory.length - 2];
        const pCurr = track.trajectory[track.trajectory.length - 1];
        const segA = { p1: { x: pPrev.x, y: pPrev.y }, p2: { x: pCurr.x, y: pCurr.y } };
        const intersects = this.linesIntersect(segA, line);
        if (!intersects)
            return { crossed: false };
        // Determine direction via 2D cross-product (moveVec x lineVec)
        const lineVecX = line.p2.x - line.p1.x;
        const lineVecY = line.p2.y - line.p1.y;
        const moveVecX = pCurr.x - pPrev.x;
        const moveVecY = pCurr.y - pPrev.y;
        const crossProduct = moveVecX * lineVecY - moveVecY * lineVecX;
        const actualDirection = crossProduct >= 0 ? CrossingDirection.A_TO_B : CrossingDirection.B_TO_A;
        if (direction === CrossingDirection.BOTH || direction === actualDirection) {
            return { crossed: true, direction: actualDirection };
        }
        return { crossed: false };
    }
    /**
     * Evaluates Loitering: Dwell time in zone exceeds threshold (e.g. 180s in ATM room)
     */
    static evaluateLoitering(track, zone, loiteringThresholdSeconds = 180) {
        const res = this.evaluateIntrusion(track, zone, loiteringThresholdSeconds);
        return {
            loitering: res.triggered,
            dwellSeconds: res.dwellSeconds,
        };
    }
    /**
     * Evaluates Crowd Density: Count of distinct active tracks inside zone
     */
    static evaluateCrowd(activeTracks, zone, warningCount = 8, criticalCount = 15) {
        let count = 0;
        for (const track of activeTracks) {
            if (track.trajectory.length === 0)
                continue;
            const latest = track.trajectory[track.trajectory.length - 1];
            if (this.isPointInPolygon({ x: latest.x, y: latest.y }, zone)) {
                count++;
            }
        }
        let level = 'NORMAL';
        if (count >= criticalCount) {
            level = 'CRITICAL';
        }
        else if (count >= warningCount) {
            level = 'WARNING';
        }
        return { count, level };
    }
    static linesIntersect(l1, l2) {
        const ccw = (A, B, C) => (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
        return (ccw(l1.p1, l2.p1, l2.p2) !== ccw(l1.p2, l2.p1, l2.p2) &&
            ccw(l1.p1, l1.p2, l2.p1) !== ccw(l1.p1, l1.p2, l2.p2));
    }
}
