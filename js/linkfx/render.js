import { getEffectById } from "./effects.js";
import {
    clonePoints,
    drawPolyline,
    getLinkKey,
    polylineLength,
    resamplePolyline,
    rotateHue,
    rgba,
    sampleBezierPolyline,
    sampleMultiWaypointBezier,
    seededNoise,
    seedFromString
} from "./math.js";
import { getPhysicsPoints, resetPhysics } from "./physics.js";
import { getRenderTime, getState, resolveRuntimeConfig, subscribe } from "./state.js";

let installed = false;
let appRef = null;
let animationFrameId = null;
let originalMethod = null;
const echoHistory = new Map();
let lastEchoCleanup = 0;

const drawnLinksThisFrame = new Set();
let lastFrameStamp = -1;
let _frameRuntime = null;
let _frameSelectedIds = null;

function markDirty() {
    if (!appRef) return;
    appRef.canvas?.setDirty?.(true, true);
    appRef.graph?.setDirtyCanvas?.(true, true);
}

function needsAnimation(state) {
    const runtime = resolveRuntimeConfig(state);
    if (runtime.animationMode === "static") return false;
    return Boolean(
        runtime.preset.effectId ||
        runtime.physicsEnabled ||
        runtime.graphWeather.id !== "none" ||
        runtime.temporalEchoEnabled
    );
}

function ensureAnimationLoop() {
    const runtime = resolveRuntimeConfig(getState());
    if (!needsAnimation(runtime)) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        return;
    }

    if (animationFrameId) return;

    let lastTime = 0;
    const tick = (currentTime) => {
        animationFrameId = requestAnimationFrame(tick);
        const activeRuntime = resolveRuntimeConfig(getState());
        const frameTime = 1000 / activeRuntime.qualityTier.targetFps;
        if (currentTime - lastTime < frameTime) return;
        lastTime = currentTime;
        markDirty();
    };

    animationFrameId = requestAnimationFrame(tick);
}

function getSelectedNodeIds() {
    if (_frameSelectedIds) return _frameSelectedIds;
    const selected = appRef?.canvas?.selected_nodes;
    if (!selected) { _frameSelectedIds = new Set(); return _frameSelectedIds; }
    _frameSelectedIds = new Set(Object.keys(selected).map((id) => Number.parseInt(id, 10)));
    return _frameSelectedIds;
}

function getFrameRuntime() {
    if (_frameRuntime) return _frameRuntime;
    _frameRuntime = resolveRuntimeConfig(getState());
    return _frameRuntime;
}

function shouldEnhanceLink(link, state) {
    if (state.animationMode === "full" || state.animationMode === "static") return true;
    if (state.animationMode !== "selected") return false;
    const selected = getSelectedNodeIds();
    if (!selected.size) return false;
    if (!link) return true;
    return selected.has(link.origin_id) || selected.has(link.target_id);
}

function getDetailLevel(len, runtime, isSelected) {
    const scale = runtime.qualityTier.segmentScale * (isSelected ? 1.15 : 1);
    return {
        segments: Math.max(6, Math.round((len / 18) * scale)),
        particleDensity: runtime.qualityTier.particleScale * (isSelected ? 1.15 : 1),
        glowBoost: runtime.qualityTier.glowScale * runtime.preset.glowScale
    };
}

function applyWeather(points, weather, linkKey, now) {
    if (weather.id === "none" || points.length < 3) return points;
    const seed = seedFromString(`${linkKey}:${weather.id}`);
    return points.map((point, index) => {
        if (index === 0 || index === points.length - 1) return point;
        const prev = points[index - 1];
        const next = points[index + 1];
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const length = Math.hypot(dx, dy) || 1;
        const normalX = -dy / length;
        const normalY = dx / length;
        const t = index / (points.length - 1);
        const sway = Math.sin(now * 0.001 * weather.speed + t * weather.frequency + (seed % 19));
        const noise = seededNoise(seed, t * weather.frequency * 0.8 + now * 0.0012 * weather.speed);
        const amount = weather.amplitude * (sway * 0.6 + (noise - 0.5) * 0.8);
        return {
            x: point.x + normalX * amount,
            y: point.y + normalY * amount
        };
    });
}

function drawBaseCable(ctx, points, meta) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (meta.glowBoost > 0) {
        ctx.shadowBlur = 8 * meta.glowBoost;
        ctx.strokeStyle = rgba(meta.shiftedPalette.glow, 0.22);
        ctx.lineWidth = meta.baseWidth * 2.2;
        drawPolyline(ctx, points);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    ctx.strokeStyle = rgba(meta.shiftedOriginalColor || meta.shiftedPalette.accent, 0.92);
    ctx.lineWidth = meta.baseWidth;
    drawPolyline(ctx, points);
    ctx.stroke();
    ctx.restore();
}

function updateEchoHistory(linkKey, points, now, runtime, motion) {
    if (!runtime.temporalEchoEnabled || motion < 0.06) return;

    const history = echoHistory.get(linkKey) || [];
    history.unshift({
        points: clonePoints(points),
        time: now,
        strength: motion
    });
    history.splice(runtime.qualityTier.echoLimit);
    echoHistory.set(linkKey, history);

    if (echoHistory.size > 120 && now - lastEchoCleanup > 2500) {
        for (const [key, values] of echoHistory.entries()) {
            const hasFresh = values.some((entry) => now - entry.time < 900);
            if (!hasFresh) echoHistory.delete(key);
        }
        lastEchoCleanup = now;
    }
}

function drawEchoes(ctx, linkKey, meta) {
    if (!meta.runtime.physicsEnabled || !meta.runtime.temporalEchoEnabled) return;
    const history = echoHistory.get(linkKey);
    if (!history?.length) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    history.forEach((entry, index) => {
        const age = meta.time - entry.time;
        const fade = Math.max(0, 1 - age / 850);
        if (fade <= 0) return;
        ctx.strokeStyle = rgba(meta.shiftedPalette.secondary, fade * 0.22);
        ctx.lineWidth = meta.baseWidth * (1.1 - index * 0.16);
        drawPolyline(ctx, entry.points);
        ctx.stroke();
    });
    ctx.restore();
}

function buildMeta({ linkKey, len, detail, runtime, now, color, motion, isSelected }) {
    const shiftedPalette = {
        accent: rotateHue(runtime.preset.palette.accent, runtime.hueShift),
        secondary: rotateHue(runtime.preset.palette.secondary, runtime.hueShift),
        glow: rotateHue(runtime.preset.palette.glow, runtime.hueShift),
        base: rotateHue(runtime.preset.palette.base, runtime.hueShift)
    };
    const tierId = runtime.qualityTier.id;
    return {
        time: now,
        seed: seedFromString(linkKey),
        linkKey,
        length: len,
        motion,
        detail,
        baseWidth: Math.max(1.5, ((len > 240 ? 2.1 : 1.7) + motion * 1.4) * runtime.preset.widthScale),
        glowBoost: detail.glowBoost,
        particleDensity: detail.particleDensity,
        originalColor: color,
        shiftedOriginalColor: rotateHue(color, runtime.hueShift),
        shiftedPalette,
        preset: runtime.preset,
        runtime,
        isSelected,
        lite: tierId === "eco" || tierId === "balanced"
    };
}

function hasAnyEnhancement(runtime) {
    return Boolean(
        runtime.preset.effectId ||
        runtime.physicsEnabled ||
        runtime.graphWeather.id !== "none" ||
        runtime.temporalEchoEnabled
    );
}

function collectReroutePath(canvas, link) {
    if (!link || link.id == null) return null;

    const graph = canvas?.graph;

    // Fast path: use ComfyUI's built-in reroute chain via link.parentId
    if (graph?.reroutes && link.parentId !== undefined) {
        const rootReroute = graph.reroutes.get(link.parentId);
        if (rootReroute && typeof rootReroute.getReroutes === "function") {
            const chain = rootReroute.getReroutes();
            if (chain?.length) return chain;
        }
    }

    // Fallback: scan the reroute map manually (supports both old and new locations)
    const rerouteMap = graph?.reroutes ?? canvas?.reroutes;
    if (!rerouteMap || typeof rerouteMap.values !== "function") return null;

    const related = [];
    for (const r of rerouteMap.values()) {
        const linkIds = r?.linkIds;
        if (!linkIds) continue;
        const has = typeof linkIds.has === "function"
            ? linkIds.has(link.id)
            : Array.isArray(linkIds) ? linkIds.includes(link.id) : false;
        if (has) related.push(r);
    }
    if (!related.length) return null;

    const byId = new Map(related.map((r) => [r.id, r]));
    const childOf = new Map();
    for (const r of related) {
        if (r.parentId != null) childOf.set(r.parentId, r);
    }

    let root = related.find((r) => r.parentId == null || !byId.has(r.parentId));
    if (!root) root = related[0];

    const ordered = [];
    const guard = new Set();
    let cur = root;
    while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        ordered.push(cur);
        cur = childOf.get(cur.id);
    }
    for (const r of related) {
        if (!guard.has(r.id)) ordered.push(r);
    }
    return ordered;
}

function getNodeSlotPos(graph, nodeId, slot, isInput) {
    if (!graph || nodeId == null) return null;
    const node = graph.getNodeById?.(nodeId);
    if (!node || typeof node.getConnectionPos !== "function") return null;
    const out = [0, 0];
    try {
        node.getConnectionPos(isInput, slot, out);
    } catch {
        return null;
    }
    return out;
}

function renderCable(canvas, ctx, waypoints, link, rest) {
    if (!waypoints || waypoints.length < 2) return;

    const runtime = getFrameRuntime();
    const a = waypoints[0];
    const b = waypoints[waypoints.length - 1];

    if (!shouldEnhanceLink(link, runtime)) {
        for (let i = 0; i < waypoints.length - 1; i++) {
            originalMethod.call(canvas, ctx, waypoints[i], waypoints[i + 1], link, ...rest);
        }
        return;
    }

    const isMulti = waypoints.length > 2;
    const totalLen = isMulti ? polylineLength(waypoints) : Math.hypot(b[0] - a[0], b[1] - a[1]);
    const linkKey = getLinkKey(link, a, b);
    const selectedIds = getSelectedNodeIds();
    const isSelected = link ? selectedIds.has(link.origin_id) || selectedIds.has(link.target_id) : selectedIds.size > 0;
    const detail = getDetailLevel(totalLen, runtime, isSelected);

    let segmentLengths = null;
    if (isMulti) {
        segmentLengths = [];
        for (let i = 1; i < waypoints.length; i++) {
            segmentLengths.push(Math.hypot(
                waypoints[i][0] - waypoints[i - 1][0],
                waypoints[i][1] - waypoints[i - 1][1]
            ));
        }
    }

    const now = getRenderTime(runtime);
    const physics = getPhysicsPoints({
        linkKey,
        a,
        b,
        len: totalLen,
        waypoints: isMulti ? waypoints : undefined,
        segmentLengths: segmentLengths || undefined,
        profile: runtime.physicsProfile,
        enabled: runtime.physicsEnabled,
        now
    });

    let basePoints;
    if (physics.points) {
        basePoints = resamplePolyline(physics.points, detail.segments);
    } else if (isMulti) {
        basePoints = sampleMultiWaypointBezier(waypoints, detail.segments);
    } else {
        basePoints = sampleBezierPolyline(a, b, detail.segments);
    }

    const points = applyWeather(basePoints, runtime.graphWeather, linkKey, now);
    const meta = buildMeta({
        linkKey,
        len: totalLen,
        detail,
        runtime,
        now,
        color: rest[2] || "rgba(150, 150, 150, 0.8)",
        motion: physics.motion,
        isSelected
    });

    updateEchoHistory(linkKey, points, now, runtime, physics.motion);
    drawEchoes(ctx, linkKey, meta);

    const effect = getEffectById(runtime.preset.effectId);
    if (effect) {
        effect.draw(ctx, points, meta);
        return;
    }

    if (runtime.physicsEnabled || runtime.graphWeather.id !== "none" || runtime.temporalEchoEnabled) {
        drawBaseCable(ctx, points, meta);
        return;
    }

    for (let i = 0; i < waypoints.length - 1; i++) {
        originalMethod.call(canvas, ctx, waypoints[i], waypoints[i + 1], link, ...rest);
    }
}

function patchCanvasMethod(proto, methodName) {
    originalMethod = proto[methodName];

    proto[methodName] = function (ctx, a, b, link, ...rest) {
        const isPointLike = (v) => v && typeof v.length === "number" && v.length >= 2
            && Number.isFinite(v[0]) && Number.isFinite(v[1]);
        if (!ctx || !isPointLike(a) || !isPointLike(b)) {
            return originalMethod.call(this, ctx, a, b, link, ...rest);
        }

        const frameStamp = this.last_draw_time ?? performance.now();
        if (frameStamp !== lastFrameStamp) {
            drawnLinksThisFrame.clear();
            lastFrameStamp = frameStamp;
            _frameRuntime = null;
            _frameSelectedIds = null;
        }

        const options = rest[5];
        const isReroutedSegment = Boolean(options && (options.reroute || options.startControl));

        if (isReroutedSegment && link?.id != null) {
            if (drawnLinksThisFrame.has(link.id)) return;

            const runtime = getFrameRuntime();
            if (!shouldEnhanceLink(link, runtime) || !hasAnyEnhancement(runtime)) {
                return originalMethod.call(this, ctx, a, b, link, ...rest);
            }

            const chain = collectReroutePath(this, link);
            if (chain?.length) {
                const originPos = getNodeSlotPos(this.graph, link.origin_id, link.origin_slot, false) ?? a;
                const targetPos = getNodeSlotPos(this.graph, link.target_id, link.target_slot, true) ?? b;
                const waypoints = [
                    [originPos[0], originPos[1]],
                    ...chain.map((r) => [r.pos[0], r.pos[1]]),
                    [targetPos[0], targetPos[1]]
                ];
                drawnLinksThisFrame.add(link.id);
                renderCable(this, ctx, waypoints, link, rest);
                return;
            }
            return originalMethod.call(this, ctx, a, b, link, ...rest);
        }

        renderCable(this, ctx, [a, b], link, rest);
    };
}

export function installRenderer(app) {
    if (installed) return;
    appRef = app;

    let LGraphCanvas = globalThis?.LiteGraph?.LGraphCanvas || null;
    if (!LGraphCanvas && app.canvas?.constructor) LGraphCanvas = app.canvas.constructor;
    if (!LGraphCanvas) {
        setTimeout(() => installRenderer(app), 200);
        return;
    }

    const proto = LGraphCanvas.prototype;
    if (typeof proto.renderLink === "function") {
        patchCanvasMethod(proto, "renderLink");
    } else if (typeof proto.drawLink === "function") {
        patchCanvasMethod(proto, "drawLink");
    } else {
        return;
    }

    subscribe((nextState, previousState) => {
        if (previousState.physicsEnabled && !nextState.physicsEnabled) resetPhysics();
        if (previousState.physicsProfileId !== nextState.physicsProfileId) resetPhysics();
        if (!nextState.temporalEchoEnabled) echoHistory.clear();
        markDirty();
        ensureAnimationLoop();
    });

    installed = true;
    ensureAnimationLoop();
    markDirty();
}
