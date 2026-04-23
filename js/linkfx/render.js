import { getEffectById } from "./effects.js";
import { clonePoints, drawPolyline, getLinkKey, resamplePolyline, rotateHue, rgba, sampleBezierPolyline, seededNoise, seedFromString } from "./math.js";
import { getPhysicsPoints, resetPhysics } from "./physics.js";
import { getRenderTime, getState, resolveRuntimeConfig, subscribe } from "./state.js";

let installed = false;
let appRef = null;
let animationFrameId = null;
let originalMethod = null;
const echoHistory = new Map();
let lastEchoCleanup = 0;

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
    const selected = appRef?.canvas?.selected_nodes;
    if (!selected) return new Set();
    return new Set(Object.keys(selected).map((id) => Number.parseInt(id, 10)));
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
    ctx.shadowBlur = 8 * meta.glowBoost;
    ctx.strokeStyle = rgba(meta.shiftedPalette.glow, 0.22);
    ctx.lineWidth = meta.baseWidth * 2.2;
    drawPolyline(ctx, points);
    ctx.stroke();
    ctx.shadowBlur = 0;
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
        isSelected
    };
}

function patchCanvasMethod(proto, methodName) {
    originalMethod = proto[methodName];

    proto[methodName] = function (ctx, a, b, link, ...rest) {
        if (!ctx || !Array.isArray(a) || !Array.isArray(b)) {
            return originalMethod.call(this, ctx, a, b, link, ...rest);
        }

        const runtime = resolveRuntimeConfig(getState());
        if (!shouldEnhanceLink(link, runtime)) {
            return originalMethod.call(this, ctx, a, b, link, ...rest);
        }

        const now = getRenderTime(runtime);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const linkKey = getLinkKey(link, a, b);
        const selectedIds = getSelectedNodeIds();
        const isSelected = link ? selectedIds.has(link.origin_id) || selectedIds.has(link.target_id) : selectedIds.size > 0;
        const detail = getDetailLevel(len, runtime, isSelected);
        const physics = getPhysicsPoints({
            linkKey,
            a,
            b,
            len,
            profile: runtime.physicsProfile,
            enabled: runtime.physicsEnabled,
            now
        });
        const basePoints = physics.points
            ? resamplePolyline(physics.points, detail.segments)
            : sampleBezierPolyline(a, b, detail.segments);
        const points = applyWeather(basePoints, runtime.graphWeather, linkKey, now);
        const meta = buildMeta({
            linkKey,
            len,
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

        return originalMethod.call(this, ctx, a, b, link, ...rest);
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
