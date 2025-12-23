import { app } from "../../../scripts/app.js";

const EXTENSION_NAME = "LinkFX";
const SIDEBAR_TAB_ID = "linkfx";
const LOG_PREFIX = "[LinkFX]";

let currentEffect = null;
let animationMode = "full";
let gravityEnabled = false;
let installed = false;
let originalRenderLink = null;
let animationLoopId = null;
let sidebarContainer = null;
let staticTime = 5000;

const ropePhysics = new Map();
let lastRopeCleanup = 0;

// GIF 功能相关变量
let gifEnabled = false;
let gifUrl = "";
let gifSize = 32;
let gifSpeed = 0.3;
let gifPosition = 0.5;
let gifContainer = null;
const gifElements = new Map();
let gifLinkData = new Map();

const TARGET_FPS = 45;
const FRAME_TIME = 1000 / TARGET_FPS;

const ROPE_SEGMENTS = 8;
const ROPE_GRAVITY = 0.6;
const ROPE_DAMPING = 0.985;
const ROPE_STIFFNESS = 0.25;
const ROPE_ITERATIONS = 4;
const ROPE_MOMENTUM_TRANSFER = 0.7;

const ANIMATION_MODES = [
    { id: "static", icon: "\u23F8\uFE0F", label: "Static" },
    { id: "full", icon: "\uD83C\uDFAC", label: "Full Animation" },
    { id: "selected", icon: "\uD83C\uDFAF", label: "Selected Node" }
];

const DEBUG = false; // 调试模式（生产环境应设为 false）
const log = (...args) => { if (DEBUG) console.info(LOG_PREFIX, ...args); };
const warn = (...args) => console.warn(LOG_PREFIX, ...args);

function bezierPoint(t, a, b, cp) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    const cpA = a[0] + cp;
    const cpB = b[0] - cp;
    return [
        mt3 * a[0] + 3 * mt2 * t * cpA + 3 * mt * t2 * cpB + t3 * b[0],
        mt3 * a[1] + 3 * mt2 * t * a[1] + 3 * mt * t2 * b[1] + t3 * b[1]
    ];
}

function drawBezier(ctx, a, b, cp) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.bezierCurveTo(a[0] + cp, a[1], b[0] - cp, b[1], b[0], b[1]);
    ctx.stroke();
}

function getRopeKey(link, a, b) {
    if (link && link.id != null) {
        return "link_" + link.id;
    }
    return "pos_" + Math.round(a[0] / 10) + "_" + Math.round(a[1] / 10) + "_" + Math.round(b[0] / 10) + "_" + Math.round(b[1] / 10);
}

function createRopeState(a, b, len) {
    const points = [];
    const numPoints = ROPE_SEGMENTS + 1;
    const now = performance?.now?.() ?? Date.now();

    for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const x = a[0] + (b[0] - a[0]) * t;
        const sagAmount = Math.min(len * 0.15, 60);
        const sag = sagAmount * 4 * t * (1 - t);
        const y = a[1] + (b[1] - a[1]) * t + sag;

        points.push({
            x, y,
            oldX: x,
            oldY: y,
            pinned: i === 0 || i === numPoints - 1
        });
    }

    return {
        points,
        segmentLen: len / (numPoints - 1),
        lastA: [...a],
        lastB: [...b],
        lastSeen: now
    };
}

function updateRopePhysics(state, a, b, len) {
    const { points } = state;
    const dxStart = a[0] - state.lastA[0];
    const dyStart = a[1] - state.lastA[1];
    const dxEnd = b[0] - state.lastB[0];
    const dyEnd = b[1] - state.lastB[1];

    const startMoved = Math.hypot(dxStart, dyStart);
    const endMoved = Math.hypot(dxEnd, dyEnd);

    if (startMoved > 0.1) {
        const halfLen = Math.floor(points.length / 2);
        for (let i = 1; i < halfLen; i++) {
            const influence = Math.pow(1 - (i / halfLen), 2) * ROPE_MOMENTUM_TRANSFER;
            points[i].oldX -= dxStart * influence;
            points[i].oldY -= dyStart * influence;
        }
    }
    if (endMoved > 0.1) {
        const halfLen = Math.floor(points.length / 2);
        for (let i = points.length - 2; i >= points.length - halfLen; i--) {
            const distFromEnd = points.length - 1 - i;
            const influence = Math.pow(1 - (distFromEnd / halfLen), 2) * ROPE_MOMENTUM_TRANSFER;
            points[i].oldX -= dxEnd * influence;
            points[i].oldY -= dyEnd * influence;
        }
    }

    points[0].x = a[0];
    points[0].y = a[1];
    points[0].oldX = a[0];
    points[0].oldY = a[1];

    points[points.length - 1].x = b[0];
    points[points.length - 1].y = b[1];
    points[points.length - 1].oldX = b[0];
    points[points.length - 1].oldY = b[1];

    for (let i = 1; i < points.length - 1; i++) {
        const p = points[i];
        const vx = (p.x - p.oldX) * ROPE_DAMPING;
        const vy = (p.y - p.oldY) * ROPE_DAMPING;
        p.oldX = p.x;
        p.oldY = p.y;
        p.x += vx;
        p.y += vy + ROPE_GRAVITY;
    }

    const targetLen = len / (points.length - 1);
    for (let iter = 0; iter < ROPE_ITERATIONS; iter++) {
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.001) continue;
            const diff = (targetLen - dist) / dist;
            const offsetX = dx * diff * 0.5;
            const offsetY = dy * diff * 0.5;
            if (!p1.pinned) {
                p1.x -= offsetX * ROPE_STIFFNESS;
                p1.y -= offsetY * ROPE_STIFFNESS;
            }
            if (!p2.pinned) {
                p2.x += offsetX * ROPE_STIFFNESS;
                p2.y += offsetY * ROPE_STIFFNESS;
            }
        }
    }
    state.lastA = [...a];
    state.lastB = [...b];
    return points;
}

function getRopePoints(link, a, b, len) {
    if (!gravityEnabled) return null;
    const key = getRopeKey(link, a, b);
    if (!ropePhysics.has(key)) {
        ropePhysics.set(key, createRopeState(a, b, len));
    }
    const state = ropePhysics.get(key);
    const now = performance?.now?.() ?? Date.now();
    state.lastSeen = now;

    if (ropePhysics.size > 60 && now - lastRopeCleanup > 3000) {
        for (const [ropeKey, value] of ropePhysics) {
            if (now - value.lastSeen > 8000) {
                ropePhysics.delete(ropeKey);
            }
        }
        lastRopeCleanup = now;
    }

    const expectedLen = len / ROPE_SEGMENTS;
    if (Math.abs(state.segmentLen - expectedLen) > 20) {
        ropePhysics.set(key, createRopeState(a, b, len));
        return ropePhysics.get(key).points;
    }
    return updateRopePhysics(state, a, b, len);
}

function drawRope(ctx, points, color, lineWidth) {
    color = color || "rgba(150, 150, 150, 0.8)";
    lineWidth = lineWidth || 2;
    if (!points || points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

function drawSmartCurve(ctx, a, b, cp, ropePoints) {
    if (ropePoints && ropePoints.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(ropePoints[0].x, ropePoints[0].y);
        for (let i = 1; i < ropePoints.length - 1; i++) {
            const xc = (ropePoints[i].x + ropePoints[i + 1].x) / 2;
            const yc = (ropePoints[i].y + ropePoints[i + 1].y) / 2;
            ctx.quadraticCurveTo(ropePoints[i].x, ropePoints[i].y, xc, yc);
        }
        ctx.lineTo(ropePoints[ropePoints.length - 1].x, ropePoints[ropePoints.length - 1].y);
        ctx.stroke();
    } else {
        drawBezier(ctx, a, b, cp);
    }
}

function getSmartPoint(t, a, b, cp, ropePoints) {
    if (ropePoints && ropePoints.length >= 2) {
        const segmentLen = 1 / (ropePoints.length - 1);
        const segment = Math.floor(t * (ropePoints.length - 1));
        const localT = (t - segment * segmentLen) / segmentLen;
        const i = Math.min(segment, ropePoints.length - 2);
        const p1 = ropePoints[i];
        const p2 = ropePoints[i + 1];
        return [
            p1.x + (p2.x - p1.x) * localT,
            p1.y + (p2.y - p1.y) * localT
        ];
    }
    return bezierPoint(t, a, b, cp);
}

function drawNeonPulse(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;
    const hue = (t * 20) % 360;
    const breath = Math.sin(t * 3) * 0.3 + 0.7;

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "hsla(" + hue + ", 100%, 40%, 0.2)";
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    const grad = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    grad.addColorStop(0, "hsla(" + hue + ", 100%, 60%, " + breath + ")");
    grad.addColorStop(0.5, "hsla(" + ((hue + 30) % 360) + ", 100%, 65%, " + breath + ")");
    grad.addColorStop(1, "hsla(" + hue + ", 100%, 60%, " + breath + ")");

    ctx.shadowBlur = 0;
    ctx.lineWidth = 4;
    ctx.strokeStyle = grad;
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "hsla(" + hue + ", 50%, 95%, 0.9)";
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    ctx.restore();
}

function drawMatrixFlow(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;

    ctx.save();
    ctx.strokeStyle = "rgba(0, 60, 30, 0.4)";
    ctx.lineWidth = 1;
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    const numDrops = Math.min(Math.floor(len / 20), 15);
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const chars = "01\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3";

    for (let i = 0; i < numDrops; i++) {
        const wirePos = (i + 0.5) / numDrops;
        const pt = getSmartPoint(wirePos, a, b, cp, ropePoints);
        const wx = pt[0];
        const wy = pt[1];

        for (let j = 0; j < 4; j++) {
            const fallOffset = ((t * 80 + i * 50 + j * 30) % 40) - 20;
            const fade = 1 - Math.abs(fallOffset) / 20;

            if (fade > 0) {
                const char = chars[(i * 7 + j * 3 + Math.floor(t * 2)) % chars.length];
                const brightness = fade * (j === 0 ? 1 : 0.5);
                ctx.fillStyle = "rgba(0, " + (150 + brightness * 105) + ", " + (50 + brightness * 50) + ", " + brightness + ")";
                ctx.fillText(char, wx, wy + fallOffset);
            }
        }
    }
    ctx.restore();
}

function drawAurora(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const curtains = 3;
    const steps = Math.min(20, Math.max(8, Math.floor(len / 30)));

    for (let c = 0; c < curtains; c++) {
        const hue = 140 + c * 40 + Math.sin(t * 0.5 + c) * 20;
        const offset = (c - 1) * 4;

        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
            const pos = i / steps;
            const pt = getSmartPoint(pos, a, b, cp, ropePoints);
            const px = pt[0];
            const py = pt[1];
            const wave = Math.sin(t * 2 + pos * 8 + c * 2) * 6;
            const y = py + offset + wave;
            if (i === 0) {
                ctx.moveTo(px, y);
            } else {
                ctx.lineTo(px, y);
            }
        }

        const alpha = 0.15 + Math.sin(t * 1.5 + c) * 0.1;
        ctx.strokeStyle = "hsla(" + hue + ", 90%, 65%, " + alpha + ")";
        ctx.lineWidth = 3 + c * 0.5;
        ctx.stroke();
    }
    ctx.restore();
}

function drawFireWire(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowBlur = 0;

    const numPoints = Math.max(20, Math.floor(len / 8));

    ctx.beginPath();
    for (let i = 0; i <= numPoints; i++) {
        const pos = i / numPoints;
        const pt = getSmartPoint(pos, a, b, cp, ropePoints);
        const px = pt[0];
        const py = pt[1];

        const distortX = Math.cos(pos * 10 - t * 5) * 1.0;
        const distortY = Math.sin(pos * 10 - t * 5) * 1.0;

        if (i === 0) ctx.moveTo(px + distortX, py + distortY);
        else ctx.lineTo(px + distortX, py + distortY);
    }

    ctx.strokeStyle = "rgba(200, 40, 0, 0.6)";
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 100, 0, 0.8)";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 220, 100, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const numSparks = 6;
    for (let i = 0; i < numSparks; i++) {
        const sparkPhase = (t * 0.4 + i * (1 / numSparks)) % 1;
        const pt = getSmartPoint(sparkPhase, a, b, cp, ropePoints);
        const sx = pt[0];
        const sy = pt[1];

        const rise = Math.sin(sparkPhase * Math.PI) * 15;
        ctx.beginPath();
        ctx.fillStyle = "rgba(255, 200, 50, " + (1 - sparkPhase) + ")";
        ctx.arc(sx, sy - rise, 1 + Math.random(), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawQuantum(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;

    ctx.save();

    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = "rgba(130, 80, 220, 0.3)";
    ctx.lineWidth = 6;
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(100, 50, 180, 0.5)";
    ctx.lineWidth = 2;
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    const particle1Pos = (t * 0.3) % 1;
    const particle2Pos = 1 - particle1Pos;

    const particles = [[particle1Pos, "rgba(255, 100, 255, 0.9)"], [particle2Pos, "rgba(100, 200, 255, 0.9)"]];
    for (let idx = 0; idx < particles.length; idx++) {
        const pos = particles[idx][0];
        const color = particles[idx][1];
        const pt = getSmartPoint(pos, a, b, cp, ropePoints);
        const x = pt[0];
        const y = pt[1];
        const cloudSize = 8 + Math.sin(t * 8 + idx * Math.PI) * 3;
        ctx.beginPath();
        ctx.arc(x, y, cloudSize, 0, Math.PI * 2);
        ctx.fillStyle = color.replace("0.9", "0.15");
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }

    const pt1 = getSmartPoint(particle1Pos, a, b, cp, ropePoints);
    const pt2 = getSmartPoint(particle2Pos, a, b, cp, ropePoints);

    ctx.beginPath();
    ctx.moveTo(pt1[0], pt1[1]);
    ctx.lineTo(pt2[0], pt2[1]);
    ctx.strokeStyle = "rgba(200, 150, 255, " + (0.2 + Math.sin(t * 10) * 0.1) + ")";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.stroke();

    ctx.restore();
}

function drawElectric(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(100, 200, 255, 0.8)";

    const segments = Math.max(10, Math.ceil(len / 10));

    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
        const pos = i / segments;
        const pt = getSmartPoint(pos, a, b, cp, ropePoints);
        const px = pt[0];
        const py = pt[1];

        let offsetX = 0;
        let offsetY = 0;

        if (i > 0 && i < segments) {
            offsetX = (Math.random() - 0.5) * 3;
            offsetY = (Math.random() - 0.5) * 3;
        }

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px + offsetX, py + offsetY);
    }

    ctx.strokeStyle = "rgba(200, 230, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
        const pos = i / segments;
        const pt = getSmartPoint(pos, a, b, cp, ropePoints);
        const px = pt[0];
        const py = pt[1];
        let offsetX = 0;
        let offsetY = 0;

        if (i > 0 && i < segments) {
            offsetX = (Math.random() - 0.5) * 8;
            offsetY = (Math.random() - 0.5) * 8;
        }

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px + offsetX, py + offsetY);
    }
    ctx.strokeStyle = "rgba(50, 150, 255, 0.3)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
}

function drawPlasma(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;
    ctx.save();
    ctx.lineCap = "round";
    const segments = 10;

    for (let strand = 0; strand < 3; strand++) {
        const phase = strand * (Math.PI * 2 / 3);
        const hue = 270 + strand * 25;

        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
            const pos = i / segments;
            const pt = getSmartPoint(pos, a, b, cp, ropePoints);
            const px = pt[0];
            const py = pt[1];
            const wave1 = Math.sin(t * 3 + pos * 8 + phase) * 6;
            const wave2 = Math.sin(t * 5 + pos * 12 + phase * 1.5) * 3;
            const envelope = Math.sin(pos * Math.PI);
            const offset = (wave1 + wave2) * envelope;

            if (i === 0) {
                ctx.moveTo(px, py + offset);
            } else {
                ctx.lineTo(px, py + offset);
            }
        }

        ctx.strokeStyle = "hsla(" + hue + ", 100%, 60%, 0.15)";
        ctx.lineWidth = 6;
        ctx.stroke();

        ctx.strokeStyle = "hsla(" + hue + ", 90%, 75%, 0.7)";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 200, 255, 0.5)";
    ctx.lineWidth = 1;
    drawSmartCurve(ctx, a, b, cp, ropePoints);
    ctx.restore();
}

function drawRainbow(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;
    ctx.save();
    ctx.lineCap = "round";
    const grad = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    const hueShift = (t * 60) % 360;

    for (let i = 0; i <= 6; i++) {
        const hue = (hueShift + i * 51) % 360;
        grad.addColorStop(i / 6, "hsl(" + hue + ", 90%, 55%)");
    }

    ctx.strokeStyle = grad;
    ctx.lineWidth = 5;
    drawSmartCurve(ctx, a, b, cp, ropePoints);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    drawSmartCurve(ctx, a, b, cp, ropePoints);
    ctx.restore();
}

function drawPulseWave(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;
    const beatPhase = (t * 1.2) % 1;
    const isBeat = beatPhase < 0.15;
    const intensity = isBeat ? 1 : 0.4;

    ctx.save();
    ctx.strokeStyle = "rgba(80, 20, 40, 0.6)";
    ctx.lineWidth = 5;
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    ctx.shadowBlur = 10 + (isBeat ? 10 : 0);
    ctx.strokeStyle = "rgba(200, 60, 90, " + (0.4 + intensity * 0.3) + ")";
    ctx.lineWidth = 3;
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    const numPulses = 3;
    for (let i = 0; i < numPulses; i++) {
        const pulsePos = ((t * 0.6 + i * 0.33) % 1);
        const pt = getSmartPoint(pulsePos, a, b, cp, ropePoints);
        const px = pt[0];
        const py = pt[1];
        const fade = 1 - pulsePos * 0.5;
        const size = 4 + (isBeat ? 2 : 0);
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 150, 180, " + (fade * 0.8) + ")";
        ctx.shadowBlur = 0;
        ctx.fill();
    }

    if (isBeat) {
        ctx.strokeStyle = "rgba(255, 200, 220, 0.5)";
        ctx.lineWidth = 6;
        ctx.shadowBlur = 0;
        drawSmartCurve(ctx, a, b, cp, ropePoints);
    }
    ctx.restore();
}

function drawStarlight(ctx, a, b, now, len, ropePoints) {
    ropePoints = ropePoints || null;
    const cp = Math.max(len * 0.3, 40);
    const t = now * 0.001;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(150, 160, 200, 0.2)";
    ctx.lineWidth = 1;
    drawSmartCurve(ctx, a, b, cp, ropePoints);

    const dustCount = Math.min(40, Math.max(20, Math.floor(len / 15)));
    for (let i = 0; i < dustCount; i++) {
        const offset = (i / dustCount);
        const pos = (t * 0.15 + offset) % 1;
        const pt = getSmartPoint(pos, a, b, cp, ropePoints);
        const px = pt[0];
        const py = pt[1];
        const life = Math.sin(pos * Math.PI);
        const size = 0.5 + life * 1.5;
        const brightness = life * (0.6 + Math.sin(t * 5 + i) * 0.4);

        if (brightness > 0.2) {
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(" + (200 + brightness * 55) + ", " + (210 + brightness * 45) + ", 255, " + brightness + ")";
            ctx.fill();

            if (brightness > 0.8 && i % 5 === 0) {
                ctx.strokeStyle = "rgba(255, 255, 255, " + (brightness * 0.6) + ")";
                ctx.lineWidth = 1;
                const sparkSize = size * 2;
                ctx.beginPath();
                ctx.moveTo(px - sparkSize, py);
                ctx.lineTo(px + sparkSize, py);
                ctx.moveTo(px, py - sparkSize);
                ctx.lineTo(px, py + sparkSize);
                ctx.stroke();
            }
        }
    }
    ctx.restore();
}

const EFFECTS = [
    { name: "Neon Pulse", icon: "\u26A1", draw: drawNeonPulse },
    { name: "Matrix Rain", icon: "\uD83D\uDC0D", draw: drawMatrixFlow },
    { name: "Aurora", icon: "\uD83C\uDF0C", draw: drawAurora },
    { name: "Fire Wire", icon: "\uD83D\uDD25", draw: drawFireWire },
    { name: "Quantum", icon: "\u269B\uFE0F", draw: drawQuantum },
    { name: "Electric", icon: "\uD83D\uDCAB", draw: drawElectric },
    { name: "Plasma", icon: "\uD83D\uDFE3", draw: drawPlasma },
    { name: "Rainbow", icon: "\uD83C\uDF08", draw: drawRainbow },
    { name: "Pulse Wave", icon: "\uD83D\uDC93", draw: drawPulseWave },
    { name: "Starlight", icon: "\u2728", draw: drawStarlight }
];

function startAnimationLoop() {
    if (animationLoopId) return;
    let lastTime = 0;
    const loop = function (currentTime) {
        animationLoopId = requestAnimationFrame(loop);
        if (currentTime - lastTime < FRAME_TIME) return;
        lastTime = currentTime;
        const needsRedraw = (currentEffect !== null && animationMode !== "static") || gravityEnabled || gifEnabled;
        if (needsRedraw && app && app.canvas) {
            if (app.canvas.setDirty) app.canvas.setDirty(true, true);
        }
        // 更新 GIF 位置
        if (gifEnabled && gifUrl) {
            updateGifPositions(currentTime);
        }
    };
    animationLoopId = requestAnimationFrame(loop);
    log("Animation loop started");
}

function stopAnimationLoop() {
    if (animationLoopId) {
        cancelAnimationFrame(animationLoopId);
        animationLoopId = null;
        log("Animation loop stopped");
    }
}

function registerSidebarTab() {
    const tryRegister = function () {
        if (app && app.extensionManager && app.extensionManager.registerSidebarTab) {
            app.extensionManager.registerSidebarTab({
                id: SIDEBAR_TAB_ID,
                icon: "pi pi-sparkles",
                title: "Link FX",
                tooltip: "Link Effects - Add visual effects to connections",
                type: "custom",
                render: function (container) {
                    sidebarContainer = container;
                    buildSidebarContent(container);
                },
                destroy: function () {
                    sidebarContainer = null;
                }
            });
            log("Sidebar tab registered");
        } else {
            setTimeout(tryRegister, 200);
        }
    };
    tryRegister();
}

function buildSidebarContent(container) {
    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "4px";
    container.style.padding = "12px 8px";
    container.style.height = "100%";
    container.style.overflowY = "auto";
    container.style.boxSizing = "border-box";

    const header = document.createElement("div");
    header.style.fontSize = "13px";
    header.style.fontWeight = "600";
    header.style.color = "var(--p-text-color, #e0e0e0)";
    header.style.padding = "8px 8px 12px";
    header.style.borderBottom = "1px solid var(--p-divider-color, rgba(255,255,255,0.08))";
    header.style.marginBottom = "8px";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "8px";
    header.innerHTML = "<span style=\"font-size:16px;\">\u2728</span> Link FX";
    container.appendChild(header);

    const modeSection = document.createElement("div");
    modeSection.style.marginBottom = "12px";
    modeSection.style.padding = "8px";
    modeSection.style.background = "var(--p-surface-ground, rgba(0,0,0,0.2))";
    modeSection.style.borderRadius = "8px";

    const modeLabel = document.createElement("div");
    modeLabel.textContent = "Animation Mode";
    modeLabel.style.fontSize = "10px";
    modeLabel.style.fontWeight = "600";
    modeLabel.style.color = "var(--p-text-muted-color, #888)";
    modeLabel.style.marginBottom = "6px";
    modeLabel.style.textTransform = "uppercase";
    modeLabel.style.letterSpacing = "0.5px";
    modeSection.appendChild(modeLabel);

    const modeButtons = document.createElement("div");
    modeButtons.style.display = "flex";
    modeButtons.style.flexDirection = "column";
    modeButtons.style.gap = "4px";
    for (let m = 0; m < ANIMATION_MODES.length; m++) {
        const btn = createModeButton(ANIMATION_MODES[m]);
        modeButtons.appendChild(btn);
    }
    modeSection.appendChild(modeButtons);
    container.appendChild(modeSection);

    // GIF 功能配置区域
    const gifSection = document.createElement("div");
    gifSection.style.marginBottom = "12px";
    gifSection.style.padding = "8px";
    gifSection.style.background = "var(--p-surface-ground, rgba(0,0,0,0.2))";
    gifSection.style.borderRadius = "8px";
    
    const gifHeader = document.createElement("div");
    gifHeader.style.display = "flex";
    gifHeader.style.alignItems = "center";
    gifHeader.style.justifyContent = "space-between";
    gifHeader.style.marginBottom = "8px";
    
    const gifTitle = document.createElement("div");
    gifTitle.style.display = "flex";
    gifTitle.style.alignItems = "center";
    gifTitle.style.gap = "8px";
    gifTitle.innerHTML = "<span style=\"font-size:16px;\">🎬</span><span style=\"font-size:11px;font-weight:600;color:var(--p-text-color, #e0e0e0);\">GIF on Link</span>";
    gifHeader.appendChild(gifTitle);
    
    const gifToggle = document.createElement("div");
    gifToggle.style.position = "relative";
    gifToggle.style.width = "32px";
    gifToggle.style.height = "18px";
    gifToggle.style.borderRadius = "9px";
    gifToggle.style.background = gifEnabled ? "rgba(100,200,100,0.8)" : "rgba(100,100,100,0.4)";
    gifToggle.style.cursor = "pointer";
    gifToggle.style.transition = "all 0.2s ease";
    
    const gifToggleKnob = document.createElement("div");
    gifToggleKnob.style.width = "14px";
    gifToggleKnob.style.height = "14px";
    gifToggleKnob.style.borderRadius = "50%";
    gifToggleKnob.style.background = "white";
    gifToggleKnob.style.position = "absolute";
    gifToggleKnob.style.top = "2px";
    gifToggleKnob.style.left = gifEnabled ? "16px" : "2px";
    gifToggleKnob.style.transition = "all 0.2s ease";
    gifToggleKnob.style.boxShadow = "0 1px 2px rgba(0,0,0,0.2)";
    gifToggle.appendChild(gifToggleKnob);
    gifHeader.appendChild(gifToggle);
    gifSection.appendChild(gifHeader);
    
    gifToggle.addEventListener("click", function(e) {
        e.stopPropagation();
        gifEnabled = !gifEnabled;
        if (sidebarContainer) buildSidebarContent(sidebarContainer);
        if (gifEnabled) {
            ensureGifContainer();
            if (gifUrl) {
                // 如果有 GIF URL，确保动画循环运行
                startAnimationLoop();
            }
        } else {
            cleanupGifElements();
            if (currentEffect === null && !gravityEnabled) stopAnimationLoop();
        }
        if (app && app.graph) app.graph.setDirtyCanvas(true, true);
        log("GIF enabled: " + gifEnabled);
    });
    
    if (gifEnabled) {
        // 文件选择器
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/gif";
        fileInput.style.display = "none";
        fileInput.addEventListener("change", function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            if (!file.type.startsWith("image/gif")) {
                warn("请选择 GIF 格式的文件");
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(event) {
                const base64 = event.target.result;
                gifUrl = base64;
                gifUrlInput.value = "[已选择: " + file.name + "]"; // 显示文件名，标记为已选择
                gifUrlInput.dataset.isFileSelected = "true"; // 标记为文件选择
                cleanupGifElements();
                ensureGifContainer(); // 确保容器存在
                
                // 确保动画循环运行
                if (gifEnabled) {
                    startAnimationLoop();
                    log("Animation loop started for GIF");
                }
                
                updateStatus();
                
                // 强制重绘 Canvas
                if (app && app.canvas) {
                    if (app.canvas.setDirty) {
                        app.canvas.setDirty(true, true);
                    }
                    if (app.canvas.dirty_canvas !== undefined) {
                        app.canvas.dirty_canvas = true;
                    }
                }
                if (app && app.graph) {
                    app.graph.setDirtyCanvas(true, true);
                }
                
                log("GIF file loaded via file picker: " + file.name + ", base64 length: " + base64.length);
                log("gifEnabled: " + gifEnabled + ", gifUrl is base64: " + gifUrl.startsWith("data:image"));
                
                // 视觉反馈
                applyButton.textContent = "✓";
                applyButton.style.background = "rgba(100,200,100,0.8)";
                setTimeout(function() {
                    applyButton.textContent = "应用";
                    applyButton.style.background = "var(--p-primary-color, rgba(100,150,255,0.8))";
                }, 1000);
            };
            reader.onerror = function() {
                warn("文件读取失败");
            };
            reader.readAsDataURL(file);
        });
        gifSection.appendChild(fileInput);
        
        const gifInputContainer = document.createElement("div");
        gifInputContainer.style.display = "flex";
        gifInputContainer.style.gap = "4px";
        gifInputContainer.style.marginBottom = "6px";
        
        const gifUrlInput = document.createElement("input");
        gifUrlInput.type = "text";
        gifUrlInput.placeholder = "GIF URL 或点击📁按钮选择文件";
        // 如果 gifUrl 是 base64，显示提示，否则显示原值
        if (gifUrl && gifUrl.startsWith("data:image")) {
            gifUrlInput.value = "[已选择本地文件]";
            gifUrlInput.dataset.isFileSelected = "true";
        } else {
            gifUrlInput.value = gifUrl;
            gifUrlInput.dataset.isFileSelected = "false";
        }
        
        // 防止用户输入覆盖文件选择器的 base64
        gifUrlInput.addEventListener("input", function() {
            if (this.dataset.isFileSelected === "true" && gifUrl && gifUrl.startsWith("data:image")) {
                // 如果当前是文件选择的结果，阻止手动输入覆盖
                const currentValue = this.value;
                if (!currentValue.startsWith("[已选择") && currentValue !== gifUrl) {
                    warn("检测到文件选择器已加载文件，手动输入将被忽略。如需使用 URL，请先清除当前 GIF。");
                    // 恢复显示
                    setTimeout(() => {
                        if (gifUrl && gifUrl.startsWith("data:image")) {
                            this.value = "[已选择本地文件]";
                        }
                    }, 100);
                }
            }
        });
        gifUrlInput.style.flex = "1";
        gifUrlInput.style.padding = "6px 8px";
        gifUrlInput.style.borderRadius = "4px";
        gifUrlInput.style.border = "1px solid var(--p-divider-color, rgba(255,255,255,0.1))";
        gifUrlInput.style.background = "var(--p-surface-ground, rgba(0,0,0,0.3))";
        gifUrlInput.style.color = "var(--p-text-color, #e0e0e0)";
        gifUrlInput.style.fontSize = "10px";
        gifUrlInput.style.fontFamily = "inherit";
        gifUrlInput.style.boxSizing = "border-box";
        
        // 文件选择按钮
        const fileSelectButton = document.createElement("button");
        fileSelectButton.textContent = "📁";
        fileSelectButton.title = "选择本地 GIF 文件";
        fileSelectButton.style.padding = "6px 10px";
        fileSelectButton.style.borderRadius = "4px";
        fileSelectButton.style.border = "none";
        fileSelectButton.style.background = "var(--p-surface-ground, rgba(0,0,0,0.3))";
        fileSelectButton.style.color = "var(--p-text-color, #e0e0e0)";
        fileSelectButton.style.fontSize = "12px";
        fileSelectButton.style.cursor = "pointer";
        fileSelectButton.style.fontFamily = "inherit";
        fileSelectButton.style.flexShrink = "0";
        fileSelectButton.style.transition = "all 100ms ease";
        fileSelectButton.addEventListener("mouseenter", function() {
            this.style.background = "var(--p-surface-hover, rgba(255,255,255,0.1))";
        });
        fileSelectButton.addEventListener("mouseleave", function() {
            this.style.background = "var(--p-surface-ground, rgba(0,0,0,0.3))";
        });
        fileSelectButton.addEventListener("click", function() {
            fileInput.click();
        });
        
        // 应用按钮
        const applyButton = document.createElement("button");
        applyButton.textContent = "应用";
        applyButton.style.padding = "6px 12px";
        applyButton.style.borderRadius = "4px";
        applyButton.style.border = "none";
        applyButton.style.background = "var(--p-primary-color, rgba(100,150,255,0.8))";
        applyButton.style.color = "white";
        applyButton.style.fontSize = "10px";
        applyButton.style.fontWeight = "600";
        applyButton.style.cursor = "pointer";
        applyButton.style.fontFamily = "inherit";
        applyButton.style.whiteSpace = "nowrap";
        applyButton.style.transition = "all 100ms ease";
        applyButton.style.flexShrink = "0";
        
        applyButton.addEventListener("mouseenter", function() {
            this.style.background = "var(--p-primary-color, rgba(100,150,255,1))";
            this.style.transform = "scale(1.05)";
        });
        applyButton.addEventListener("mouseleave", function() {
            this.style.background = "var(--p-primary-color, rgba(100,150,255,0.8))";
            this.style.transform = "scale(1)";
        });
        
        // 状态提示
        const gifStatus = document.createElement("div");
        gifStatus.style.fontSize = "9px";
        gifStatus.style.color = gifUrl ? "rgba(100,200,100,0.8)" : "var(--p-text-muted-color, #888)";
        gifStatus.style.marginBottom = "6px";
        gifStatus.style.padding = "4px 8px";
        gifStatus.style.borderRadius = "4px";
        gifStatus.style.background = gifUrl ? "rgba(100,200,100,0.1)" : "transparent";
        
        // 更新状态提示的函数
        const updateStatus = function() {
            if (gifUrl) {
                let displayText = "";
                if (gifUrl.startsWith("data:image")) {
                    displayText = "✓ GIF 已加载: [本地文件]";
                } else if (gifUrl.length > 30) {
                    displayText = "✓ GIF 已加载: " + gifUrl.substring(0, 30) + "...";
                } else {
                    displayText = "✓ GIF 已加载: " + gifUrl;
                }
                gifStatus.textContent = displayText;
                gifStatus.style.color = "rgba(100,200,100,0.8)";
                gifStatus.style.background = "rgba(100,200,100,0.1)";
            } else {
                gifStatus.textContent = "⚠ 请输入 GIF URL 或选择本地文件";
                gifStatus.style.color = "var(--p-text-muted-color, #888)";
                gifStatus.style.background = "transparent";
            }
        };
        
        // 初始化状态提示
        updateStatus();
        
        // 应用 GIF 的函数
        const applyGif = function() {
            // 如果当前是文件选择的结果，直接使用 base64
            if (gifUrlInput.dataset.isFileSelected === "true" && gifUrl && gifUrl.startsWith("data:image")) {
                log("Using file picker selected GIF (base64)");
                cleanupGifElements();
                ensureGifContainer(); // 确保容器存在
                if (gifEnabled) startAnimationLoop(); // 确保动画循环运行
                if (app && app.graph) app.graph.setDirtyCanvas(true, true);
                updateStatus();
                applyButton.textContent = "✓";
                applyButton.style.background = "rgba(100,200,100,0.8)";
                setTimeout(function() {
                    applyButton.textContent = "应用";
                    applyButton.style.background = "var(--p-primary-color, rgba(100,150,255,0.8))";
                }, 1000);
                return;
            }
            
            const newUrl = gifUrlInput.value.trim();
            if (!newUrl || newUrl.startsWith("[已选择")) {
                if (gifUrl && gifUrl.startsWith("data:image")) {
                    // 已经是 base64，直接应用
                    cleanupGifElements();
                    ensureGifContainer();
                    if (gifEnabled) startAnimationLoop();
                    if (app && app.graph) app.graph.setDirtyCanvas(true, true);
                    updateStatus();
                    applyButton.textContent = "✓";
                    applyButton.style.background = "rgba(100,200,100,0.8)";
                    setTimeout(function() {
                        applyButton.textContent = "应用";
                        applyButton.style.background = "var(--p-primary-color, rgba(100,150,255,0.8))";
                    }, 1000);
                    return;
                }
                warn("GIF URL 不能为空");
                return;
            }
            
            // 清除文件选择标记
            gifUrlInput.dataset.isFileSelected = "false";
            
            // 检查是否是 base64 数据 URL
            if (newUrl.startsWith("data:image")) {
                gifUrl = newUrl;
            } else if (newUrl.startsWith("http://") || newUrl.startsWith("https://")) {
                // 完整的 HTTP/HTTPS URL
                gifUrl = newUrl;
            } else if (newUrl.startsWith("/")) {
                // 绝对路径，直接使用
                gifUrl = newUrl;
            } else if (newUrl.startsWith("file://") || /^[A-Za-z]:/.test(newUrl)) {
                // 本地文件路径，尝试提取文件名并转换为扩展路径
                const fileName = newUrl.split(/[/\\]/).pop();
                if (fileName) {
                    gifUrl = "/extensions/ComfyUI_LinkFX/" + fileName;
                    warn("已转换为扩展路径: " + gifUrl + "，如果文件不存在，请使用文件选择器");
                } else {
                    warn("无法从路径提取文件名，请使用文件选择器选择文件");
                    return;
                }
            } else {
                // 可能是文件名，尝试从扩展目录加载
                // 检查是否包含路径分隔符
                if (!newUrl.includes("/") && !newUrl.includes("\\") && newUrl.includes(".")) {
                    // 看起来是文件名，尝试从扩展目录加载
                    gifUrl = "/extensions/ComfyUI_LinkFX/" + newUrl;
                    warn("假设文件在扩展目录，使用路径: " + gifUrl + "，如果文件不存在，请使用文件选择器");
                } else {
                    // 可能是相对路径或其他格式，直接使用
                    gifUrl = newUrl;
                }
            }
            
            cleanupGifElements();
            ensureGifContainer(); // 确保容器存在
            if (gifEnabled) startAnimationLoop(); // 确保动画循环运行
            if (app && app.graph) app.graph.setDirtyCanvas(true, true);
            log("GIF URL applied: " + (gifUrl.length > 50 ? gifUrl.substring(0, 50) + "..." : gifUrl));
            
            // 更新状态
            updateStatus();
            
            // 视觉反馈
            applyButton.textContent = "✓";
            applyButton.style.background = "rgba(100,200,100,0.8)";
            setTimeout(function() {
                applyButton.textContent = "应用";
                applyButton.style.background = "var(--p-primary-color, rgba(100,150,255,0.8))";
            }, 1000);
        };
        
        applyButton.addEventListener("click", applyGif);
        
        // Enter 键支持
        gifUrlInput.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                applyGif();
            }
        });
        
        // change 事件也保留（失去焦点时应用）
        gifUrlInput.addEventListener("change", applyGif);
        
        gifInputContainer.appendChild(gifUrlInput);
        gifInputContainer.appendChild(fileSelectButton);
        gifInputContainer.appendChild(applyButton);
        gifSection.appendChild(gifInputContainer);
        gifSection.appendChild(gifStatus);
        
        // 清除按钮
        if (gifUrl) {
            const clearButton = document.createElement("button");
            clearButton.textContent = "清除 GIF";
            clearButton.style.width = "100%";
            clearButton.style.padding = "6px 8px";
            clearButton.style.marginBottom = "6px";
            clearButton.style.borderRadius = "4px";
            clearButton.style.border = "none";
            clearButton.style.background = "rgba(200,80,80,0.2)";
            clearButton.style.color = "var(--p-text-color, #e0e0e0)";
            clearButton.style.fontSize = "10px";
            clearButton.style.cursor = "pointer";
            clearButton.style.fontFamily = "inherit";
            clearButton.style.transition = "all 100ms ease";
            clearButton.addEventListener("mouseenter", function() {
                this.style.background = "rgba(200,80,80,0.4)";
            });
            clearButton.addEventListener("mouseleave", function() {
                this.style.background = "rgba(200,80,80,0.2)";
            });
            clearButton.addEventListener("click", function() {
                gifUrl = "";
                gifUrlInput.value = "";
                gifUrlInput.dataset.isFileSelected = "false";
                cleanupGifElements();
                if (sidebarContainer) buildSidebarContent(sidebarContainer);
                if (app && app.graph) app.graph.setDirtyCanvas(true, true);
                log("GIF cleared");
            });
            gifSection.appendChild(clearButton);
        }
        
        const gifSizeLabel = document.createElement("div");
        gifSizeLabel.textContent = "Size: " + gifSize + "px";
        gifSizeLabel.style.fontSize = "9px";
        gifSizeLabel.style.color = "var(--p-text-muted-color, #888)";
        gifSizeLabel.style.marginBottom = "4px";
        gifSection.appendChild(gifSizeLabel);
        
        const gifSizeSlider = document.createElement("input");
        gifSizeSlider.type = "range";
        gifSizeSlider.min = "16";
        gifSizeSlider.max = "128";
        gifSizeSlider.value = gifSize;
        gifSizeSlider.style.width = "100%";
        gifSizeSlider.style.marginBottom = "6px";
        gifSizeSlider.addEventListener("input", function() {
            gifSize = parseInt(this.value);
            // 更新所有已存在的 GIF 元素的大小
            for (const [key, img] of gifElements) {
                if (img && img.parentElement) {
                    img.style.width = gifSize + "px";
                    img.style.height = gifSize + "px";
                }
            }
            if (sidebarContainer) buildSidebarContent(sidebarContainer);
            if (app && app.graph) app.graph.setDirtyCanvas(true, true);
        });
        gifSection.appendChild(gifSizeSlider);
        
        const gifSpeedLabel = document.createElement("div");
        gifSpeedLabel.textContent = "Speed: " + gifSpeed.toFixed(1) + "x";
        gifSpeedLabel.style.fontSize = "9px";
        gifSpeedLabel.style.color = "var(--p-text-muted-color, #888)";
        gifSpeedLabel.style.marginBottom = "4px";
        gifSection.appendChild(gifSpeedLabel);
        
        const gifSpeedSlider = document.createElement("input");
        gifSpeedSlider.type = "range";
        gifSpeedSlider.min = "0.1";
        gifSpeedSlider.max = "2.0";
        gifSpeedSlider.step = "0.1";
        gifSpeedSlider.value = gifSpeed;
        gifSpeedSlider.style.width = "100%";
        gifSpeedSlider.addEventListener("input", function() {
            gifSpeed = parseFloat(this.value);
            if (sidebarContainer) buildSidebarContent(sidebarContainer);
        });
        gifSection.appendChild(gifSpeedSlider);
    }
    
    container.appendChild(gifSection);

    const gravitySection = document.createElement("div");
    gravitySection.style.marginBottom = "12px";
    gravitySection.style.padding = "8px";
    gravitySection.style.background = gravityEnabled ? "rgba(100, 180, 100, 0.15)" : "var(--p-surface-ground, rgba(0,0,0,0.2))";
    gravitySection.style.borderRadius = "8px";
    gravitySection.style.border = gravityEnabled ? "1px solid rgba(100, 180, 100, 0.3)" : "1px solid transparent";
    gravitySection.style.cursor = "pointer";
    gravitySection.style.transition = "all 150ms ease";

    const toggleBg = gravityEnabled ? "rgba(100,200,100,0.8)" : "rgba(100,100,100,0.4)";
    const togglePos = gravityEnabled ? "16px" : "2px";

    const gravityContent = document.createElement("div");
    gravityContent.style.display = "flex";
    gravityContent.style.alignItems = "center";
    gravityContent.style.justifyContent = "space-between";
    gravityContent.style.width = "100%";

    const gravityLeft = document.createElement("div");
    gravityLeft.style.display = "flex";
    gravityLeft.style.alignItems = "center";
    gravityLeft.style.gap = "8px";

    const gravityIcon = document.createElement("span");
    gravityIcon.style.fontSize = "16px";
    gravityIcon.textContent = "\uD83C\uDF0D";

    const gravityText = document.createElement("div");
    gravityText.style.display = "flex";
    gravityText.style.flexDirection = "column";

    const gravityTitle = document.createElement("span");
    gravityTitle.style.fontSize = "11px";
    gravityTitle.style.fontWeight = "600";
    gravityTitle.style.color = "var(--p-text-color, #e0e0e0)";
    gravityTitle.textContent = "Gravity Physics";

    const gravitySubtitle = document.createElement("span");
    gravitySubtitle.style.fontSize = "9px";
    gravitySubtitle.style.color = "var(--p-text-muted-color, #888)";
    gravitySubtitle.textContent = "Rope simulation";

    gravityText.appendChild(gravityTitle);
    gravityText.appendChild(gravitySubtitle);
    gravityLeft.appendChild(gravityIcon);
    gravityLeft.appendChild(gravityText);

    const toggleSwitch = document.createElement("div");
    toggleSwitch.style.position = "relative";
    toggleSwitch.style.width = "32px";
    toggleSwitch.style.height = "18px";
    toggleSwitch.style.borderRadius = "9px";
    toggleSwitch.style.background = toggleBg;
    toggleSwitch.style.transition = "all 0.2s ease";

    const toggleKnob = document.createElement("div");
    toggleKnob.style.width = "14px";
    toggleKnob.style.height = "14px";
    toggleKnob.style.borderRadius = "50%";
    toggleKnob.style.background = "white";
    toggleKnob.style.position = "absolute";
    toggleKnob.style.top = "2px";
    toggleKnob.style.left = togglePos;
    toggleKnob.style.transition = "all 0.2s ease";
    toggleKnob.style.boxShadow = "0 1px 2px rgba(0,0,0,0.2)";

    toggleSwitch.appendChild(toggleKnob);
    gravityContent.appendChild(gravityLeft);
    gravityContent.appendChild(toggleSwitch);
    gravitySection.appendChild(gravityContent);

    gravitySection.addEventListener("click", function () {
        gravityEnabled = !gravityEnabled;
        if (sidebarContainer) buildSidebarContent(sidebarContainer);
        if (gravityEnabled) startAnimationLoop();
        else if (currentEffect === null && !gifEnabled && animationMode === "static") stopAnimationLoop();
        if (!gravityEnabled) ropePhysics.clear();
        if (app && app.graph) app.graph.setDirtyCanvas(true, true);
        log("gravity: " + gravityEnabled);
    });
    container.appendChild(gravitySection);

    const effectsLabel = document.createElement("div");
    effectsLabel.textContent = "Effects";
    effectsLabel.style.fontSize = "10px";
    effectsLabel.style.fontWeight = "600";
    effectsLabel.style.color = "var(--p-text-muted-color, #888)";
    effectsLabel.style.marginBottom = "6px";
    effectsLabel.style.marginTop = "4px";
    effectsLabel.style.textTransform = "uppercase";
    effectsLabel.style.letterSpacing = "0.5px";
    effectsLabel.style.padding = "0 8px";
    container.appendChild(effectsLabel);

    for (let e = 0; e < EFFECTS.length; e++) {
        const item = createEffectButton(EFFECTS[e], e);
        container.appendChild(item);
    }

    const disableItem = document.createElement("button");
    disableItem.innerHTML = "<span style=\"font-size:14px;margin-right:8px;\">\u2B55</span><span style=\"font-size:11px;\">Disable Effect</span>";
    disableItem.style.display = "flex";
    disableItem.style.alignItems = "center";
    disableItem.style.padding = "8px 10px";
    disableItem.style.marginTop = "8px";
    disableItem.style.borderRadius = "6px";
    disableItem.style.border = "none";
    disableItem.style.borderTop = "1px solid var(--p-divider-color, rgba(255,255,255,0.08))";
    disableItem.style.paddingTop = "12px";
    disableItem.style.background = "transparent";
    disableItem.style.color = "var(--p-text-color, #c8c8c8)";
    disableItem.style.cursor = "pointer";
    disableItem.style.fontSize = "11px";
    disableItem.style.fontFamily = "inherit";
    disableItem.style.textAlign = "left";
    disableItem.style.transition = "all 100ms ease";
    disableItem.style.width = "100%";
    disableItem.addEventListener("mouseenter", function () { this.style.background = "rgba(255,80,80,0.1)"; });
    disableItem.addEventListener("mouseleave", function () { this.style.background = "transparent"; });
    disableItem.addEventListener("click", function () { selectEffect(null); });
    container.appendChild(disableItem);
    log("Sidebar content built");
}

function createModeButton(mode) {
    const isSelected = animationMode === mode.id;
    const btn = document.createElement("button");
    btn.innerHTML = "<span style=\"font-size:12px;margin-right:6px;\">" + mode.icon + "</span><span style=\"font-size:10px;\">" + mode.label + "</span>";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.padding = "6px 8px";
    btn.style.borderRadius = "4px";
    btn.style.border = "none";
    btn.style.background = isSelected ? "rgba(100,150,255,0.2)" : "transparent";
    btn.style.borderLeft = isSelected ? "2px solid rgba(100,150,255,0.8)" : "2px solid transparent";
    btn.style.color = isSelected ? "var(--p-text-color, #fff)" : "var(--p-text-muted-color, #aaa)";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "10px";
    btn.style.fontFamily = "inherit";
    btn.style.textAlign = "left";
    btn.style.transition = "all 100ms ease";
    btn.style.width = "100%";
    btn.dataset.modeId = mode.id;
    btn.addEventListener("mouseenter", function () { if (animationMode !== this.dataset.modeId) this.style.background = "rgba(255,255,255,0.05)"; });
    btn.addEventListener("mouseleave", function () { if (animationMode !== this.dataset.modeId) this.style.background = "transparent"; });
    btn.addEventListener("click", function () {
        animationMode = this.dataset.modeId;
        if (sidebarContainer) buildSidebarContent(sidebarContainer);
        if (animationMode === "static" && !gifEnabled) stopAnimationLoop();
        else if (currentEffect !== null || gifEnabled) startAnimationLoop();
        if (app && app.graph) app.graph.setDirtyCanvas(true, true);
        log("animation mode: " + animationMode);
    });
    return btn;
}

function createEffectButton(effect, index) {
    const item = document.createElement("button");
    item.innerHTML = "<span style=\"font-size:16px;margin-right:10px;\">" + effect.icon + "</span><span style=\"font-weight:500;font-size:12px;\">" + effect.name + "</span>";
    const isSelected = currentEffect === index;
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.padding = "8px 10px";
    item.style.borderRadius = "6px";
    item.style.border = "none";
    item.style.background = isSelected ? "var(--p-primary-color, rgba(100,150,255,0.15))" : "transparent";
    item.style.borderLeft = isSelected ? "2px solid var(--p-primary-color, rgba(100,150,255,0.8))" : "2px solid transparent";
    item.style.color = "var(--p-text-color, #c8c8c8)";
    item.style.cursor = "pointer";
    item.style.fontSize = "11px";
    item.style.fontFamily = "inherit";
    item.style.textAlign = "left";
    item.style.transition = "all 100ms ease";
    item.style.width = "100%";
    item.dataset.index = index;
    item.addEventListener("mouseenter", function () { if (currentEffect !== parseInt(this.dataset.index)) this.style.background = "var(--p-surface-hover, rgba(255,255,255,0.06))"; });
    item.addEventListener("mouseleave", function () { if (currentEffect !== parseInt(this.dataset.index)) this.style.background = "transparent"; });
    item.addEventListener("click", function () { selectEffect(parseInt(this.dataset.index)); });
    return item;
}

function selectEffect(index) {
    currentEffect = index;
    if (sidebarContainer) buildSidebarContent(sidebarContainer);
    if (!installed && index !== null) installHooks();
    const needsAnimation = (index !== null && animationMode !== "static") || gravityEnabled || gifEnabled;
    if (needsAnimation) startAnimationLoop(); else stopAnimationLoop();
    if (app && app.graph) app.graph.setDirtyCanvas(true, true);
    log(index !== null ? "effect: " + EFFECTS[index].name : "effects disabled");
}

function getSelectedNodeIds() {
    const selected = app && app.canvas && app.canvas.selected_nodes;
    if (!selected) return new Set();
    return new Set(Object.keys(selected).map(function (id) { return parseInt(id); }));
}

function shouldAnimateLink(link) {
    if (animationMode === "full") return true;
    if (animationMode === "static") return true;
    if (animationMode === "selected") {
        if (!link) return true;
        const selectedIds = getSelectedNodeIds();
        if (selectedIds.size === 0) return false;
        return selectedIds.has(link.origin_id) || selectedIds.has(link.target_id);
    }
    return false;
}

function getTimeForEffect() {
    if (animationMode === "static") return staticTime;
    return performance.now();
}

// ========== GIF 功能相关函数 ==========

function getCanvasContainer() {
    if (!app || !app.canvas) {
        log("getCanvasContainer: app or canvas not available");
        return null;
    }
    const canvas = app.canvas.canvas;
    if (!canvas) {
        log("getCanvasContainer: canvas element not found");
        return null;
    }
    
    // 尝试多种方法找到正确的容器
    let container = canvas.parentElement;
    
    // 如果父元素存在，尝试找到包含它的相对定位容器
    if (container) {
        // 查找具有 position: relative 的父容器
        let current = container;
        while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            if (style.position === "relative" || style.position === "absolute") {
                container = current;
                break;
            }
            current = current.parentElement;
        }
    }
    
    if (DEBUG) {
        log("getCanvasContainer: found container: " + (container ? container.tagName + "#" + (container.id || "no-id") : "null"));
    }
    
    return container;
}

function ensureGifContainer() {
    if (gifContainer && gifContainer.parentElement) return gifContainer;
    const container = getCanvasContainer();
    if (!container) {
        log("Cannot find canvas container");
        return null;
    }
    
    // 如果容器已存在但被移除，重新创建
    if (gifContainer && !gifContainer.parentElement) {
        gifContainer = null;
    }
    
    if (!gifContainer) {
        gifContainer = document.createElement("div");
        gifContainer.id = "linkfx-gif-container";
    }
    
    gifContainer.style.position = "absolute";
    gifContainer.style.top = "0";
    gifContainer.style.left = "0";
    gifContainer.style.width = "100%";
    gifContainer.style.height = "100%";
    gifContainer.style.pointerEvents = "none";
    gifContainer.style.zIndex = "10000";
    gifContainer.style.overflow = "visible";
    
    if (DEBUG) {
        log("GIF container created: position=" + gifContainer.style.position + ", zIndex=" + gifContainer.style.zIndex);
    }
    
    if (!gifContainer.parentElement) {
        container.appendChild(gifContainer);
        log("GIF container created and appended");
    }
    
    return gifContainer;
}

function getLinkKey(link, a, b) {
    if (link && link.id != null) {
        return "link_" + link.id;
    }
    return "pos_" + Math.round(a[0] / 10) + "_" + Math.round(a[1] / 10) + "_" + Math.round(b[0] / 10) + "_" + Math.round(b[1] / 10);
}

function createGifElement(linkKey) {
    const container = ensureGifContainer();
    if (!container) return null;
    
    const img = document.createElement("img");
    img.style.position = "absolute";
    img.style.width = gifSize + "px";
    img.style.height = gifSize + "px";
    img.style.objectFit = "contain";
    img.style.pointerEvents = "none";
    img.style.userSelect = "none";
    img.style.transformOrigin = "center center";
    img.style.display = "none";
    
    // 添加错误处理
    img.onerror = function() {
        warn("GIF 加载失败: " + gifUrl + "，请检查文件路径或使用文件选择器");
        this.style.display = "none";
    };
    
    img.onload = function() {
        log("GIF 加载成功: " + gifUrl.substring(0, 50) + "...");
        log("GIF image dimensions: " + this.naturalWidth + "x" + this.naturalHeight);
        log("GIF element style: display=" + this.style.display + ", visibility=" + this.style.visibility + ", opacity=" + this.style.opacity);
    };
    
    img.src = gifUrl;
    
    container.appendChild(img);
    gifElements.set(linkKey, img);
    log("GIF element created for: " + linkKey);
    return img;
}

function updateGifPosition(linkKey, a, b, ropePoints, now, ctx) {
    if (!gifEnabled || !gifUrl) {
        if (DEBUG) log("updateGifPosition skipped: gifEnabled=" + gifEnabled + ", gifUrl=" + (gifUrl ? "set" : "not set"));
        return;
    }
    
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 10) {
        if (DEBUG) log("updateGifPosition skipped: link too short: " + len);
        return; // 连线太短，不显示
    }
    
    const cp = Math.max(len * 0.3, 40);
    
    // 计算 GIF 在连线上的位置（0-1之间）
    let t = gifPosition;
    if (animationMode !== "static") {
        // 动态移动：根据时间计算位置
        const cycleTime = 3000 / gifSpeed; // 完整循环时间（毫秒）
        const cyclePos = ((now % cycleTime) / cycleTime);
        t = cyclePos;
    }
    
    // 获取连线上的点（使用和效果函数相同的坐标系统）
    const pt = getSmartPoint(t, a, b, cp, ropePoints);
    const px = pt[0];
    const py = pt[1];
    
    // 计算旋转角度（沿连线方向）
    let angle = 0;
    if (t < 0.99) {
        const nextT = Math.min(t + 0.01, 1);
        const nextPt = getSmartPoint(nextT, a, b, cp, ropePoints);
        const dx = nextPt[0] - px;
        const dy = nextPt[1] - py;
        angle = Math.atan2(dy, dx) * (180 / Math.PI);
    } else {
        // 最后一点，使用前一点的方向
        const prevT = Math.max(t - 0.01, 0);
        const prevPt = getSmartPoint(prevT, a, b, cp, ropePoints);
        const dx = px - prevPt[0];
        const dy = py - prevPt[1];
        angle = Math.atan2(dy, dx) * (180 / Math.PI);
    }
    
    // 获取或创建 GIF 元素
    let img = gifElements.get(linkKey);
    if (!img) {
        img = createGifElement(linkKey);
        if (!img) return;
    }
    
    // 确保容器存在
    if (!gifContainer || !gifContainer.parentElement) {
        ensureGifContainer();
        if (!gifContainer) return;
    }
    
    // 获取 Canvas 元素
    const canvas = app.canvas.canvas;
    if (!canvas) return;
    
    // 获取 Canvas 和容器的位置信息
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = gifContainer.getBoundingClientRect();
    
    if (!canvasRect || !containerRect) return;
    
    // 获取 Canvas 2D 上下文的变换矩阵
    // 如果传入了 ctx，使用它；否则获取新的上下文（可能不准确）
    let transform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    
    if (ctx && typeof ctx.getTransform === "function") {
        // 使用传入的上下文（最准确，因为它有当前的变换状态）
        transform = ctx.getTransform();
    } else {
        // 尝试从 Canvas 对象获取变换信息
        const canvasObj = app.canvas;
        if (canvasObj) {
            const scale = canvasObj.ds || canvasObj.scale || 1;
            const offset = canvasObj.offset || (canvasObj.graph && canvasObj.graph.offset) || [0, 0];
            transform.a = scale;
            transform.d = scale;
            transform.e = -offset[0] * scale;
            transform.f = -offset[1] * scale;
        }
    }
    
    // 使用变换矩阵转换坐标（和 Canvas 绘制使用相同的变换）
    // 变换矩阵公式：screenX = a * worldX + c * worldY + e
    //                screenY = b * worldX + d * worldY + f
    const screenX = transform.a * px + transform.c * py + transform.e + canvasRect.left;
    const screenY = transform.b * px + transform.d * py + transform.f + canvasRect.top;
    
    // 转换为相对于容器的坐标
    const x = screenX - containerRect.left;
    const y = screenY - containerRect.top;
    
    if (DEBUG) {
        log("Canvas transform matrix: a=" + transform.a.toFixed(3) + ", d=" + transform.d.toFixed(3) + ", e=" + transform.e.toFixed(1) + ", f=" + transform.f.toFixed(1));
        log("World(" + px.toFixed(1) + "," + py.toFixed(1) + ") -> Screen(" + screenX.toFixed(1) + "," + screenY.toFixed(1) + ") -> Container(" + x.toFixed(1) + "," + y.toFixed(1) + ")");
    }
    
    // 更新 GIF 位置和旋转
    // 使用 transform-origin: center 和 translate(-50%, -50%) 确保 GIF 中心点始终在连线上
    // 这样无论 GIF 大小如何变化，都不会偏离连线位置
    img.style.left = x + "px";
    img.style.top = y + "px";
    img.style.transform = "translate(-50%, -50%) rotate(" + angle + "deg)";
    img.style.transformOrigin = "center center";
    img.style.display = "block";
    img.style.visibility = "visible";
    img.style.opacity = "1";
    img.style.zIndex = "10000";
    
    if (DEBUG) {
        log("GIF positioned: linkKey=" + linkKey + 
            ", world(" + px.toFixed(1) + "," + py.toFixed(1) + 
            ") -> container(" + x.toFixed(1) + "," + y.toFixed(1) + 
            "), angle=" + angle.toFixed(1) + 
            ", size=" + gifSize +
            ", canvasScale=" + scale.toFixed(3) +
            ", canvasOffset=(" + offsetX.toFixed(1) + "," + offsetY.toFixed(1) + ")");
    }
    
    // 保存链接数据用于清理
    gifLinkData.set(linkKey, {
        lastSeen: now,
        a: [...a],
        b: [...b]
    });
}

function updateGifPositions(now) {
    if (!gifContainer || !app || !app.canvas) return;
    
    // 清理过期的 GIF 元素
    const keysToDelete = [];
    for (const [key, data] of gifLinkData) {
        if (now - data.lastSeen > 2000) {
            keysToDelete.push(key);
        }
    }
    for (const key of keysToDelete) {
        const img = gifElements.get(key);
        if (img && img.parentElement) {
            img.parentElement.removeChild(img);
        }
        gifElements.delete(key);
        gifLinkData.delete(key);
    }
}

function cleanupGifElements() {
    if (gifContainer) {
        gifContainer.innerHTML = "";
    }
    gifElements.clear();
    gifLinkData.clear();
    gifContainer = null;
}

function installHooks() {
    if (installed) return;
    let LGraphCanvas = (typeof globalThis !== "undefined" && globalThis.LiteGraph && globalThis.LiteGraph.LGraphCanvas) ? globalThis.LiteGraph.LGraphCanvas : null;
    if (!LGraphCanvas && app && app.canvas && app.canvas.constructor) LGraphCanvas = app.canvas.constructor;
    if (!LGraphCanvas) { setTimeout(installHooks, 500); return; }

    const proto = LGraphCanvas.prototype;

    if (typeof proto.renderLink === "function") {
        originalRenderLink = proto.renderLink;
        const patchedRenderLink = function (ctx, a, b, link, skip_border, flow, color, start_dir, end_dir, options) {
            options = options || {};
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const ropePoints = getRopePoints(link, a, b, len);
            
            // 处理 GIF 显示（必须在绘制连线之前，因为需要获取坐标和变换矩阵）
            if (gifEnabled && gifUrl && shouldAnimateLink(link)) {
                try {
                    const now = getTimeForEffect();
                    const linkKey = getLinkKey(link, a, b);
                    updateGifPosition(linkKey, a, b, ropePoints, now, ctx);
                } catch (err) { warn("GIF update failed", err); }
            }
            
            // 绘制效果或连线
            if (currentEffect !== null && ctx && Array.isArray(a) && Array.isArray(b)) {
                if (shouldAnimateLink(link)) {
                    try {
                        const now = getTimeForEffect();
                        EFFECTS[currentEffect].draw(ctx, a, b, now, len, ropePoints);
                    } catch (err) { warn("effect draw failed", err); }
                    // GIF 和效果可以同时显示，所以不 return
                }
            }
            if (gravityEnabled && ropePoints && ctx) {
                drawRope(ctx, ropePoints, color || "rgba(150, 150, 150, 0.8)", 2);
                // 如果只有重力效果，不绘制原始连线
                if (currentEffect === null) return;
            }
            // 如果没有效果，绘制原始连线
            if (currentEffect === null && !gravityEnabled) {
                return originalRenderLink.call(this, ctx, a, b, link, skip_border, flow, color, start_dir, end_dir, options);
            }
        };
        proto.renderLink = patchedRenderLink;
        log("hooked renderLink");
    } else if (typeof proto.drawLink === "function") {
        originalRenderLink = proto.drawLink;
        const patchedDrawLink = function (ctx, a, b, link) {
            const rest = Array.prototype.slice.call(arguments, 4);
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const ropePoints = getRopePoints(link, a, b, len);
            
            // 处理 GIF 显示（必须在绘制连线之前，因为需要获取坐标和变换矩阵）
            if (gifEnabled && gifUrl && shouldAnimateLink(link)) {
                try {
                    const now = getTimeForEffect();
                    const linkKey = getLinkKey(link, a, b);
                    // 对于 drawLink，ctx 可能不是 Canvas 2D 上下文，尝试获取
                    const canvasCtx = this.canvas ? this.canvas.getContext("2d") : ctx;
                    updateGifPosition(linkKey, a, b, ropePoints, now, canvasCtx);
                } catch (err) { warn("GIF update failed", err); }
            }
            
            // 绘制效果或连线
            if (currentEffect !== null && ctx && Array.isArray(a) && Array.isArray(b)) {
                if (shouldAnimateLink(link)) {
                    try {
                        const now = getTimeForEffect();
                        EFFECTS[currentEffect].draw(ctx, a, b, now, len, ropePoints);
                    } catch (err) { warn("effect draw failed", err); }
                    // GIF 和效果可以同时显示，所以不 return
                }
            }
            if (gravityEnabled && ropePoints && ctx) {
                drawRope(ctx, ropePoints, "rgba(150, 150, 150, 0.8)", 2);
                // 如果只有重力效果，不绘制原始连线
                if (currentEffect === null) return;
            }
            // 如果没有效果，绘制原始连线
            if (currentEffect === null && !gravityEnabled) {
                return originalRenderLink.apply(this, [ctx, a, b, link].concat(rest));
            }
        };
        proto.drawLink = patchedDrawLink;
        log("hooked drawLink");
    }
    installed = true;
    log("hooks installed");
}

app.registerExtension({
    name: EXTENSION_NAME,
    init: function () {
        log("initializing...");
        registerSidebarTab();
        const waitForCanvas = function () {
            if (app && app.canvas) installHooks();
            else setTimeout(waitForCanvas, 200);
        };
        waitForCanvas();
    }
});
