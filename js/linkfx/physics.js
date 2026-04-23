import { clamp, lerp, seedFromString } from "./math.js";

const ropeStates = new Map();
let lastCleanup = 0;

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
        points,
        lastA: [...a],
        lastB: [...b],
        lastSeen: now,
        motion: 0
    };
}

function constrainSegments(points, segmentLength, profile) {
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

export function getPhysicsPoints({ linkKey, a, b, len, profile, enabled, now }) {
    if (!enabled) return { points: null, motion: 0 };

    const safeLength = Math.max(12, len);
    const seed = seedFromString(linkKey);
    let state = ropeStates.get(linkKey);
    if (!state || state.points.length !== profile.segments + 1) {
        state = createState(a, b, safeLength, profile, now, seed);
        ropeStates.set(linkKey, state);
    }

    state.lastSeen = now;

    const dxStart = a[0] - state.lastA[0];
    const dyStart = a[1] - state.lastA[1];
    const dxEnd = b[0] - state.lastB[0];
    const dyEnd = b[1] - state.lastB[1];
    const startMove = Math.hypot(dxStart, dyStart);
    const endMove = Math.hypot(dxEnd, dyEnd);
    const totalMotion = startMove + endMove;
    state.motion = clamp(totalMotion / 28, 0, 1);

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

    constrainSegments(state.points, segmentLength, profile);
    state.lastA = [...a];
    state.lastB = [...b];

    if (ropeStates.size > 120 && now - lastCleanup > 2500) {
        for (const [key, value] of ropeStates.entries()) {
            if (now - value.lastSeen > 8000) ropeStates.delete(key);
        }
        lastCleanup = now;
    }

    return {
        points: state.points.map((point) => ({ x: point.x, y: point.y })),
        motion: state.motion
    };
}

export function resetPhysics() {
    ropeStates.clear();
}
