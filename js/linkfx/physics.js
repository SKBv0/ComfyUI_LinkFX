import { clamp, lerp, seedFromString } from "./math.js";

const ropeStates = new Map();
let lastCleanup = 0;
const PHYSICS_STEP_MS = 25; // fixed physics timestep (~40 steps/sec)

function getRestPoint(a, b, len, profile, t, time, seed) {
    const sag = Math.min(len * profile.sagFactor, profile.maxSag) * 4 * t * (1 - t);
    const sway = profile.restSway * Math.sin(time * 0.001 * profile.swaySpeed + t * profile.swayFrequency + (seed % 11));
    return {
        x: lerp(a[0], b[0], t),
        y: lerp(a[1], b[1], t) + sag + sway
    };
}

function createState(a, b, len, profile, now, seed) {
    const points = [];
    const count = profile.segments + 1;
    for (let index = 0; index < count; index++) {
        const t = index / (count - 1);
        const rest = getRestPoint(a, b, len, profile, t, now, seed);
        points.push({
            x: rest.x,
            y: rest.y,
            oldX: rest.x,
            oldY: rest.y,
            pinned: index === 0 || index === count - 1,
            t
        });
    }
    return {
        mode: "simple",
        points,
        lastA: [...a],
        lastB: [...b],
        lastSeen: now,
        motion: 0
    };
}

function buildRestLengths(segmentLengths, pointsPerSeg) {
    const rest = [];
    for (let segIdx = 0; segIdx < segmentLengths.length; segIdx++) {
        const segLen = Math.max(12, segmentLengths[segIdx]);
        const n = pointsPerSeg[segIdx];
        const restPerLink = segLen / Math.max(1, n - 1);
        for (let i = 0; i < n - 1; i++) rest.push(restPerLink);
    }
    return rest;
}

function createMultiState(waypoints, segmentLengths, totalLen, profile, now, seed) {
    const totalPoints = profile.segments + 1;
    const segCount = waypoints.length - 1;
    const totalLenSafe = Math.max(0.001, totalLen);

    const rawShares = segmentLengths.map((l) => Math.max(0, (totalPoints - 1) * (l / totalLenSafe)));
    const pointsPerSeg = rawShares.map((n) => Math.max(2, Math.round(n)));

    const pinIndices = [0];
    let cursor = 0;
    for (let i = 0; i < segCount; i++) {
        cursor += pointsPerSeg[i] - 1;
        pinIndices.push(cursor);
    }
    const pinSet = new Set(pinIndices);

    const points = [];
    for (let segIdx = 0; segIdx < segCount; segIdx++) {
        const a = waypoints[segIdx];
        const b = waypoints[segIdx + 1];
        const segLen = Math.max(12, segmentLengths[segIdx]);
        const n = pointsPerSeg[segIdx];
        const segSeed = seed + segIdx * 97;
        const startI = segIdx === 0 ? 0 : 1;
        for (let i = startI; i < n; i++) {
            const t = i / Math.max(1, n - 1);
            const rest = getRestPoint(a, b, segLen, profile, t, now, segSeed);
            const globalIdx = pinIndices[segIdx] + i;
            points.push({
                x: rest.x,
                y: rest.y,
                oldX: rest.x,
                oldY: rest.y,
                pinned: pinSet.has(globalIdx),
                segIdx,
                segT: t
            });
        }
    }

    return {
        mode: "multi",
        points,
        pinIndices,
        waypoints: waypoints.map((p) => [p[0], p[1]]),
        segmentLengths: [...segmentLengths],
        pointsPerSeg,
        restLengths: buildRestLengths(segmentLengths, pointsPerSeg),
        totalLen,
        lastSeen: now,
        motion: 0,
        seed
    };
}

function constrainSegmentsSimple(points, segmentLength, profile) {
    for (let iteration = 0; iteration < profile.iterations; iteration++) {
        for (let index = 0; index < points.length - 1; index++) {
            const pointA = points[index];
            const pointB = points[index + 1];
            const dx = pointB.x - pointA.x;
            const dy = pointB.y - pointA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 0.0001) continue;
            const diff = (segmentLength - distance) / distance;
            const offsetX = dx * diff * 0.5;
            const offsetY = dy * diff * 0.5;
            if (!pointA.pinned) {
                pointA.x -= offsetX * profile.stiffness;
                pointA.y -= offsetY * profile.stiffness;
            }
            if (!pointB.pinned) {
                pointB.x += offsetX * profile.stiffness;
                pointB.y += offsetY * profile.stiffness;
            }
        }
    }
}

function constrainSegmentsMulti(points, restLengths, profile) {
    for (let iteration = 0; iteration < profile.iterations; iteration++) {
        for (let index = 0; index < points.length - 1; index++) {
            const pointA = points[index];
            const pointB = points[index + 1];
            const rest = restLengths[index];
            const dx = pointB.x - pointA.x;
            const dy = pointB.y - pointA.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 0.0001) continue;
            const diff = (rest - distance) / distance;
            const offsetX = dx * diff * 0.5;
            const offsetY = dy * diff * 0.5;
            if (!pointA.pinned) {
                pointA.x -= offsetX * profile.stiffness;
                pointA.y -= offsetY * profile.stiffness;
            }
            if (!pointB.pinned) {
                pointB.x += offsetX * profile.stiffness;
                pointB.y += offsetY * profile.stiffness;
            }
        }
    }
}

function runSimple(state, a, b, safeLength, profile, now, seed) {
    const dxStart = a[0] - state.lastA[0];
    const dyStart = a[1] - state.lastA[1];
    const dxEnd = b[0] - state.lastB[0];
    const dyEnd = b[1] - state.lastB[1];
    const startMove = Math.hypot(dxStart, dyStart);
    const endMove = Math.hypot(dxEnd, dyEnd);
    state.motion = clamp((startMove + endMove) / 28, 0, 1);

    const half = Math.floor(state.points.length / 2);
    if (startMove > 0.1) {
        for (let index = 1; index < half; index++) {
            const influence = Math.pow(1 - index / half, 2) * profile.momentumTransfer;
            state.points[index].oldX -= dxStart * influence;
            state.points[index].oldY -= dyStart * influence;
        }
    }
    if (endMove > 0.1) {
        for (let index = state.points.length - 2; index > state.points.length - half - 1; index--) {
            const distanceFromEnd = state.points.length - 1 - index;
            const influence = Math.pow(1 - distanceFromEnd / half, 2) * profile.momentumTransfer;
            state.points[index].oldX -= dxEnd * influence;
            state.points[index].oldY -= dyEnd * influence;
        }
    }

    const segmentLength = safeLength / (state.points.length - 1);
    const first = state.points[0];
    const last = state.points[state.points.length - 1];
    first.x = a[0];
    first.y = a[1];
    first.oldX = a[0];
    first.oldY = a[1];
    last.x = b[0];
    last.y = b[1];
    last.oldX = b[0];
    last.oldY = b[1];

    for (let index = 1; index < state.points.length - 1; index++) {
        const point = state.points[index];
        const velocityX = (point.x - point.oldX) * profile.damping;
        const velocityY = (point.y - point.oldY) * profile.damping;
        point.oldX = point.x;
        point.oldY = point.y;
        point.x += velocityX;
        point.y += velocityY + profile.gravity;

        const rest = getRestPoint(a, b, safeLength, profile, point.t, now, seed);
        point.x = lerp(point.x, rest.x, profile.magneticPull);
        point.y = lerp(point.y, rest.y, profile.magneticPull);
    }

    constrainSegmentsSimple(state.points, segmentLength, profile);
    state.lastA = [...a];
    state.lastB = [...b];
}

function runMulti(state, waypoints, profile, now) {
    let totalMotion = 0;
    const waypointDeltas = [];
    for (let i = 0; i < waypoints.length; i++) {
        const dx = waypoints[i][0] - state.waypoints[i][0];
        const dy = waypoints[i][1] - state.waypoints[i][1];
        const move = Math.hypot(dx, dy);
        totalMotion += move;
        waypointDeltas.push({ dx, dy, move });
    }
    state.motion = clamp(totalMotion / 28, 0, 1);

    for (let segIdx = 0; segIdx < waypoints.length - 1; segIdx++) {
        const startPin = state.pinIndices[segIdx];
        const endPin = state.pinIndices[segIdx + 1];
        const segPoints = endPin - startPin;
        if (segPoints < 2) continue;
        const half = Math.max(1, Math.floor(segPoints / 2));
        const { dx: dxA, dy: dyA, move: moveA } = waypointDeltas[segIdx];
        const { dx: dxB, dy: dyB, move: moveB } = waypointDeltas[segIdx + 1];
        if (moveA > 0.1) {
            for (let localI = 1; localI < half && startPin + localI < endPin; localI++) {
                const influence = Math.pow(1 - localI / half, 2) * profile.momentumTransfer;
                const point = state.points[startPin + localI];
                point.oldX -= dxA * influence;
                point.oldY -= dyA * influence;
            }
        }
        if (moveB > 0.1) {
            for (let localI = 1; localI <= half && endPin - localI > startPin; localI++) {
                const influence = Math.pow(1 - localI / half, 2) * profile.momentumTransfer;
                const point = state.points[endPin - localI];
                point.oldX -= dxB * influence;
                point.oldY -= dyB * influence;
            }
        }
    }

    for (let i = 0; i < state.pinIndices.length; i++) {
        const idx = state.pinIndices[i];
        const p = state.points[idx];
        p.x = waypoints[i][0];
        p.y = waypoints[i][1];
        p.oldX = waypoints[i][0];
        p.oldY = waypoints[i][1];
    }

    for (let index = 0; index < state.points.length; index++) {
        const point = state.points[index];
        if (point.pinned) continue;
        const velocityX = (point.x - point.oldX) * profile.damping;
        const velocityY = (point.y - point.oldY) * profile.damping;
        point.oldX = point.x;
        point.oldY = point.y;
        point.x += velocityX;
        point.y += velocityY + profile.gravity;
        const segIdx = point.segIdx;
        const a = waypoints[segIdx];
        const b = waypoints[segIdx + 1];
        const segLen = Math.max(12, state.segmentLengths[segIdx]);
        const rest = getRestPoint(a, b, segLen, profile, point.segT, now, state.seed + segIdx * 97);
        point.x = lerp(point.x, rest.x, profile.magneticPull);
        point.y = lerp(point.y, rest.y, profile.magneticPull);
    }

    constrainSegmentsMulti(state.points, state.restLengths, profile);

    for (let i = 0; i < waypoints.length; i++) {
        state.waypoints[i][0] = waypoints[i][0];
        state.waypoints[i][1] = waypoints[i][1];
    }
}

export function getPhysicsPoints({ linkKey, a, b, len, profile, enabled, now, waypoints, segmentLengths }) {
    if (!enabled) return { points: null, motion: 0 };

    const useMulti = Array.isArray(waypoints)
        && waypoints.length > 2
        && Array.isArray(segmentLengths)
        && segmentLengths.length === waypoints.length - 1;

    const seed = seedFromString(linkKey);
    let state = ropeStates.get(linkKey);

    if (useMulti) {
        const totalLen = Math.max(12, len);
        const needReinit = !state
            || state.mode !== "multi"
            || state.points.length !== profile.segments + 1
            || state.waypoints.length !== waypoints.length;
        if (needReinit) {
            state = createMultiState(waypoints, segmentLengths, totalLen, profile, now, seed);
            ropeStates.set(linkKey, state);
        }

        let changedLengths = false;
        for (let i = 0; i < segmentLengths.length; i++) {
            if (state.segmentLengths[i] !== segmentLengths[i]) {
                changedLengths = true;
                break;
            }
        }
        if (changedLengths) {
            state.segmentLengths = [...segmentLengths];
            state.totalLen = totalLen;
            state.restLengths = buildRestLengths(state.segmentLengths, state.pointsPerSeg);
        }

        const elapsed = now - state.lastSeen;
        const steps = Math.min(4, Math.max(1, Math.round(elapsed / PHYSICS_STEP_MS)));
        state.lastSeen = now;
        for (let s = 0; s < steps; s++) runMulti(state, waypoints, profile, now);
    } else {
        const safeLength = Math.max(12, len);
        if (!state || state.mode !== "simple" || state.points.length !== profile.segments + 1) {
            state = createState(a, b, safeLength, profile, now, seed);
            ropeStates.set(linkKey, state);
        }

        const elapsed = now - state.lastSeen;
        const steps = Math.min(4, Math.max(1, Math.round(elapsed / PHYSICS_STEP_MS)));
        state.lastSeen = now;
        for (let s = 0; s < steps; s++) runSimple(state, a, b, safeLength, profile, now, seed);
    }

    if (ropeStates.size > 120 && now - lastCleanup > 2500) {
        for (const [key, value] of ropeStates.entries()) {
            if (now - value.lastSeen > 8000) ropeStates.delete(key);
        }
        lastCleanup = now;
    }

    const outLen = state.points.length;
    if (!state._outputCache || state._outputCache.length !== outLen) {
        state._outputCache = state.points.map((p) => ({ x: p.x, y: p.y }));
    } else {
        for (let i = 0; i < outLen; i++) {
            state._outputCache[i].x = state.points[i].x;
            state._outputCache[i].y = state.points[i].y;
        }
    }

    return {
        points: state._outputCache,
        motion: state.motion
    };
}

export function resetPhysics() {
    ropeStates.clear();
}
