import {
    clamp,
    drawPolyline,
    getPointNormal,
    mixColors,
    parseColor,
    rotateHue,
    rgba,
    samplePointOnPolyline,
    seededNoise,
    seedFromString
} from "./math.js";

function getPalette(meta) {
    const baseColor = parseColor(meta.originalColor);
    const hueShift = meta.runtime?.hueShift || 0;
    return {
        accent: rgba(rotateHue(mixColors(meta.preset.palette.accent, baseColor, 0.32), hueShift), 1),
        secondary: rgba(rotateHue(mixColors(meta.preset.palette.secondary, baseColor, 0.18), hueShift), 1),
        glow: rgba(rotateHue(mixColors(meta.preset.palette.glow, baseColor, 0.2), hueShift), 1),
        base: rgba(rotateHue(mixColors(meta.preset.palette.base, baseColor, 0.16), hueShift), 1)
    };
}

function jitterPoints(points, seed, time, amplitude, frequency) {
    return points.map((point, index) => {
        if (index === 0 || index === points.length - 1) return point;
        const normal = getPointNormal(points, index);
        const t = index / (points.length - 1);
        const wave = Math.sin(time * 0.002 + t * frequency + seed * 0.001);
        const noise = seededNoise(seed + 13, t * frequency * 0.9 + time * 0.0017);
        const amount = amplitude * ((wave * 0.55) + ((noise - 0.5) * 1.3));
        return {
            x: point.x + normal.x * amount,
            y: point.y + normal.y * amount
        };
    });
}

function stroke(ctx, points, color, width, alpha, shadowBlur = 0) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = shadowBlur >= 1 ? shadowBlur : 0;
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = width;
    drawPolyline(ctx, points);
    ctx.stroke();
    ctx.restore();
}

function drawTravelers(ctx, points, meta, color, count, size, speed, rise = 0) {
    const seed = seedFromString(meta.linkKey);
    for (let index = 0; index < count; index++) {
        const phase = (meta.time * speed * 0.0001 + seededNoise(seed + index, index * 1.7)) % 1;
        const point = samplePointOnPolyline(points, phase);
        const life = 1 - Math.abs(phase - 0.5) * 1.6;
        const radius = size * clamp(life, 0.3, 1.1);
        ctx.beginPath();
        ctx.arc(point.x, point.y - rise * phase, radius, 0, Math.PI * 2);
        ctx.fillStyle = rgba(color, clamp(life, 0, 1));
        ctx.fill();
    }
}

function rawStroke(ctx, points, color, width, shadowBlur = 0, shadowColor = color) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (shadowBlur >= 1) {
        ctx.shadowBlur = shadowBlur;
        ctx.shadowColor = shadowColor;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    drawPolyline(ctx, points);
    ctx.stroke();
    ctx.restore();
}

function withWave(points, time, amplitude, frequency, phase = 0, seed = 0) {
    return points.map((point, index) => {
        if (index === 0 || index === points.length - 1) return point;
        const normal = getPointNormal(points, index);
        const t = index / (points.length - 1);
        const wobble = Math.sin(time * 0.002 + t * frequency + phase);
        const drift = (seededNoise(seed + 77, t * frequency * 0.7 + time * 0.0015 + phase) - 0.5) * 0.8;
        const amount = amplitude * (wobble * 0.65 + drift);
        return {
            x: point.x + normal.x * amount,
            y: point.y + normal.y * amount
        };
    });
}

function samplePointWithNormal(points, t) {
    const point = samplePointOnPolyline(points, t);
    const index = Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1))));
    return { point, normal: getPointNormal(points, index), index };
}

function createGradientAlongLine(ctx, points, stops) {
    const first = points[0];
    const last = points[points.length - 1];
    const gradient = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    for (const stop of stops) {
        gradient.addColorStop(stop.offset, rgba(stop.color, stop.alpha));
    }
    return gradient;
}

function getLegacyScale(meta) {
    return clamp(meta.baseWidth / 2, 0.8, 1.2);
}

function traceLegacyPath(ctx, points, steps, project) {
    ctx.beginPath();
    for (let index = 0; index <= steps; index++) {
        const pos = index / Math.max(1, steps);
        const point = samplePointOnPolyline(points, pos);
        const mapped = project ? project(pos, point, index) : point;
        if (index === 0) ctx.moveTo(mapped.x, mapped.y);
        else ctx.lineTo(mapped.x, mapped.y);
    }
}

function drawLegacyNeonPulse(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    const first = points[0];
    const last = points[points.length - 1];
    const t = meta.time * 0.001;
    const hue = (t * 20) % 360;
    const breath = Math.sin(t * 3) * 0.3 + 0.7;
    const gradient = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    gradient.addColorStop(0, `hsla(${hue}, 100%, 60%, ${breath})`);
    gradient.addColorStop(0.5, `hsla(${(hue + 30) % 360}, 100%, 65%, ${breath})`);
    gradient.addColorStop(1, `hsla(${hue}, 100%, 60%, ${breath})`);

    if (meta.glowBoost > 0) rawStroke(ctx, points, `hsla(${hue}, 100%, 40%, 0.2)`, 8 * scale);
    rawStroke(ctx, points, gradient, 4 * scale);
    rawStroke(ctx, points, `hsla(${hue}, 50%, 95%, 0.9)`, Math.max(1.2, 1.5 * scale));
}

function drawLegacyMatrixRain(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    rawStroke(ctx, points, "rgba(0, 60, 30, 0.4)", Math.max(1, 1 * scale));
    const chars = "01アイウエオカキクケコ";
    const drops = Math.min(Math.floor(meta.length / 20), 15);
    const t = meta.time * 0.001;
    ctx.save();
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let index = 0; index < drops; index++) {
        const wirePos = (index + 0.5) / drops;
        const point = samplePointOnPolyline(points, wirePos);
        for (let trail = 0; trail < 4; trail++) {
            const fallOffset = ((t * 80 + index * 50 + trail * 30) % 40) - 20;
            const fade = 1 - Math.abs(fallOffset) / 20;
            if (fade <= 0) continue;
            const char = chars[(index * 7 + trail * 3 + Math.floor(t * 2)) % chars.length];
            const brightness = fade * (trail === 0 ? 1 : 0.5);
            ctx.fillStyle = `rgba(0, ${150 + brightness * 105}, ${50 + brightness * 50}, ${brightness})`;
            ctx.fillText(char, point.x, point.y + fallOffset);
        }
    }
    ctx.restore();
}

function drawLegacyAurora(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    const t = meta.time * 0.001;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let curtain = 0; curtain < 3; curtain++) {
        const hue = 140 + curtain * 40 + Math.sin(t * 0.5 + curtain) * 20;
        const offset = (curtain - 1) * 4;
        const steps = Math.min(20, Math.max(8, Math.floor(meta.length / 30)));
        traceLegacyPath(ctx, points, steps, (pos, point) => ({
            x: point.x,
            y: point.y + offset + Math.sin(t * 2 + pos * 8 + curtain * 2) * 6
        }));
        ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${0.15 + Math.sin(t * 1.5 + curtain) * 0.1})`;
        ctx.lineWidth = (3 + curtain * 0.5) * scale;
        ctx.stroke();
    }
    ctx.restore();
}

function drawLegacyFireWire(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    const t = meta.time * 0.001;
    const segments = Math.max(20, Math.floor(meta.length / 8));
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    traceLegacyPath(ctx, points, segments, (pos, point) => ({
        x: point.x + Math.cos(pos * 10 - t * 5),
        y: point.y + Math.sin(pos * 10 - t * 5)
    }));
    ctx.strokeStyle = "rgba(200, 40, 0, 0.6)";
    ctx.lineWidth = 8 * scale;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 100, 0, 0.8)";
    ctx.lineWidth = 4 * scale;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 220, 100, 0.9)";
    ctx.lineWidth = Math.max(1.2, 1.5 * scale);
    ctx.stroke();

    for (let index = 0; index < 6; index++) {
        const phase = (t * 0.4 + index * (1 / 6)) % 1;
        const point = samplePointOnPolyline(points, phase);
        const rise = Math.sin(phase * Math.PI) * 15;
        const radius = 1 + seededNoise(meta.seed + 501, meta.time * 0.004 + index);
        ctx.beginPath();
        ctx.arc(point.x, point.y - rise, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 50, ${1 - phase})`;
        ctx.fill();
    }
    ctx.restore();
}

function drawLegacyQuantum(ctx, points, meta) {
    ctx.save();
    ctx.setLineDash([4, 6]);
    rawStroke(ctx, points, "rgba(130, 80, 220, 0.3)", meta.baseWidth * 2.4);
    ctx.setLineDash([]);
    rawStroke(ctx, points, "rgba(100, 50, 180, 0.5)", meta.baseWidth * 0.9);

    const particle1 = (meta.time * 0.0003) % 1;
    const particle2 = 1 - particle1;
    [[particle1, "rgba(255, 100, 255, 0.9)"], [particle2, "rgba(100, 200, 255, 0.9)"]].forEach(([phase, color], index) => {
        const point = samplePointOnPolyline(points, phase);
        const cloudSize = 8 + Math.sin(meta.time * 0.008 + index * Math.PI) * 3;
        ctx.beginPath();
        ctx.arc(point.x, point.y, cloudSize, 0, Math.PI * 2);
        ctx.fillStyle = color.replace("0.9", "0.15");
        ctx.fill();
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    });

    const pointA = samplePointOnPolyline(points, particle1);
    const pointB = samplePointOnPolyline(points, particle2);
    ctx.beginPath();
    ctx.moveTo(pointA.x, pointA.y);
    ctx.lineTo(pointB.x, pointB.y);
    ctx.strokeStyle = `rgba(200, 150, 255, ${0.2 + Math.sin(meta.time * 0.01) * 0.1})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.restore();
}

function drawLegacyElectric(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    const t = meta.time * 0.001;
    const segments = Math.max(10, Math.ceil(meta.length / 10));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 10 * meta.glowBoost;
    ctx.shadowColor = "rgba(100, 200, 255, 0.8)";
    traceLegacyPath(ctx, points, segments, (pos, point, index) => {
        if (index === 0 || index === segments) return point;
        return {
            x: point.x + (seededNoise(meta.seed + 120 + index, t * 28 + index) - 0.5) * 3,
            y: point.y + (seededNoise(meta.seed + 160 + index, t * 31 + index * 0.7) - 0.5) * 3
        };
    });
    ctx.strokeStyle = "rgba(200, 230, 255, 0.9)";
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (meta.glowBoost > 0) {
    traceLegacyPath(ctx, points, segments, (pos, point, index) => {
        if (index === 0 || index === segments) return point;
        return {
            x: point.x + (seededNoise(meta.seed + 220 + index, t * 23 + index * 1.1) - 0.5) * 8,
            y: point.y + (seededNoise(meta.seed + 260 + index, t * 19 + index * 0.5) - 0.5) * 8
        };
    });
    ctx.strokeStyle = "rgba(50, 150, 255, 0.3)";
    ctx.lineWidth = 3 * scale;
    ctx.stroke();
    }
    ctx.restore();
}

function drawLegacyPlasma(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    const t = meta.time * 0.001;
    ctx.save();
    ctx.lineCap = "round";
    for (let strand = 0; strand < 3; strand++) {
        const phase = strand * (Math.PI * 2 / 3);
        const hue = 270 + strand * 25;
        traceLegacyPath(ctx, points, 10, (pos, point) => {
            const wave1 = Math.sin(t * 3 + pos * 8 + phase) * 6;
            const wave2 = Math.sin(t * 5 + pos * 12 + phase * 1.5) * 3;
            const envelope = Math.sin(pos * Math.PI);
            return { x: point.x, y: point.y + (wave1 + wave2) * envelope };
        });
        ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.15)`;
        ctx.lineWidth = 6 * scale;
        ctx.stroke();
        ctx.strokeStyle = `hsla(${hue}, 90%, 75%, 0.7)`;
        ctx.lineWidth = 2 * scale;
        ctx.stroke();
    }
    rawStroke(ctx, points, "rgba(255, 200, 255, 0.5)", Math.max(1, 1 * scale));
    ctx.restore();
}

function drawLegacyRainbow(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    const first = points[0];
    const last = points[points.length - 1];
    const gradient = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    const hueShift = (meta.time * 0.06) % 360;
    for (let index = 0; index <= 6; index++) {
        const hue = (hueShift + index * 51) % 360;
        gradient.addColorStop(index / 6, `hsl(${hue}, 90%, 55%)`);
    }
    rawStroke(ctx, points, gradient, 5 * scale, 6 * meta.glowBoost, "rgba(255,255,255,0.2)");
    rawStroke(ctx, points, "rgba(255,255,255,0.25)", Math.max(1.1, 2 * scale));
}

function drawLegacyPulseWave(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    const beatPhase = (meta.time * 0.0012) % 1;
    const isBeat = beatPhase < 0.15;
    const intensity = isBeat ? 1 : 0.4;
    rawStroke(ctx, points, "rgba(80, 20, 40, 0.6)", 5 * scale);
    rawStroke(ctx, points, `rgba(200, 60, 90, ${0.4 + intensity * 0.3})`, 3 * scale, 10 + (isBeat ? 10 : 0), "rgba(255,90,130,0.45)");
    for (let index = 0; index < 3; index++) {
        const phase = (meta.time * 0.0006 + index * 0.33) % 1;
        const point = samplePointOnPolyline(points, phase);
        const fade = 1 - phase * 0.5;
        const size = 4 + (isBeat ? 2 : 0);
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 150, 180, ${fade * 0.8})`;
        ctx.fill();
    }
    if (isBeat) {
        rawStroke(ctx, points, "rgba(255, 200, 220, 0.5)", 6 * scale);
    }
}

function drawLegacyStarlight(ctx, points, meta) {
    const scale = getLegacyScale(meta);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    rawStroke(ctx, points, "rgba(150, 160, 200, 0.2)", Math.max(1, 1 * scale));
    const dustCount = Math.min(40, Math.max(20, Math.floor(meta.length / 15)));
    for (let index = 0; index < dustCount; index++) {
        const pos = (meta.time * 0.00015 + index / dustCount) % 1;
        const point = samplePointOnPolyline(points, pos);
        const life = Math.sin(pos * Math.PI);
        const size = 0.5 + life * 1.5;
        const brightness = life * (0.6 + Math.sin(meta.time * 0.005 + index) * 0.4);
        if (brightness <= 0.2) continue;
        ctx.beginPath();
        ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${200 + brightness * 55}, ${210 + brightness * 45}, 255, ${brightness})`;
        ctx.fill();
        if (brightness > 0.8 && index % 5 === 0) {
            const sparkSize = size * 2;
            ctx.strokeStyle = `rgba(255, 255, 255, ${brightness * 0.6})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(point.x - sparkSize, point.y);
            ctx.lineTo(point.x + sparkSize, point.y);
            ctx.moveTo(point.x, point.y - sparkSize);
            ctx.lineTo(point.x, point.y + sparkSize);
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawIonPulse(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth;
    const carrier = withWave(points, meta.time * 0.22, 0.7 + meta.motion * 0.4, 5.5, 0.3, meta.seed + 18);

    rawStroke(ctx, carrier, createGradientAlongLine(ctx, carrier, [
        { offset: 0, color: palette.base, alpha: 0.12 },
        { offset: 0.28, color: palette.accent, alpha: 0.52 },
        { offset: 0.52, color: palette.glow, alpha: 0.8 },
        { offset: 0.76, color: palette.secondary, alpha: 0.64 },
        { offset: 1, color: palette.base, alpha: 0.12 }
    ]), width * 1.45, 12 * meta.glowBoost, rgba(palette.glow, 0.2));
    stroke(ctx, carrier, palette.secondary, width * 0.3, 0.92, 0);

    if (!meta.lite) {
        rawStroke(ctx, carrier, rgba(palette.base, 0.16), width * 3.6);
        const sheen = withWave(points, meta.time * 0.35, 0.45, 9, 1.1, meta.seed + 71);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        stroke(ctx, sheen, palette.glow, width * 0.12, 0.18, 0);
        const phase = (meta.time * 0.00016) % 1;
        const point = samplePointOnPolyline(carrier, phase);
        const highlight = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, width * 8);
        highlight.addColorStop(0, rgba(palette.secondary, 0.22));
        highlight.addColorStop(0.45, rgba(palette.glow, 0.12));
        highlight.addColorStop(1, rgba(palette.glow, 0));
        ctx.beginPath();
        ctx.arc(point.x, point.y, width * 8, 0, Math.PI * 2);
        ctx.fillStyle = highlight;
        ctx.fill();
        ctx.restore();
    }
}

function drawEmberCable(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth * 1.08;
    const forged = withWave(points, meta.time * 0.56, 1.1 + meta.motion * 0.9, 6.4, 0.5, meta.seed + 33);

    rawStroke(ctx, forged, createGradientAlongLine(ctx, forged, [
        { offset: 0, color: palette.base, alpha: 0.22 },
        { offset: 0.4, color: palette.accent, alpha: 0.62 },
        { offset: 0.52, color: palette.secondary, alpha: 0.54 },
        { offset: 0.72, color: palette.glow, alpha: 0.34 },
        { offset: 1, color: palette.base, alpha: 0.16 }
    ]), width * 1.74, 8 * meta.glowBoost, rgba(palette.accent, 0.16));
    stroke(ctx, forged, palette.secondary, width * 0.22, 0.42, 0);

    if (!meta.lite) {
        rawStroke(ctx, forged, rgba(palette.base, 0.26), width * 4);
        const seam = withWave(forged, meta.time * 0.24, 0.35, 11, 1.6, meta.seed + 59);
        const heat = withWave(forged, meta.time * 0.18, 3.2, 4.4, 0.8, meta.seed + 95)
            .map((point, index) => ({
                x: point.x,
                y: point.y - (index / Math.max(1, forged.length - 1)) * 2.4
            }));
        stroke(ctx, seam, palette.secondary, width * 0.22, 0.32, 0);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        stroke(ctx, heat, palette.glow, width * 0.92, 0.06, 0);
        stroke(ctx, heat, palette.accent, width * 0.42, 0.08, 0);
        ctx.restore();
    }
}

function drawAuroraFiber(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth;
    const spine = withWave(points, meta.time * 0.34, 0.8 + meta.motion * 0.4, 7.8, 0.4, meta.seed + 121);

    rawStroke(ctx, spine, createGradientAlongLine(ctx, spine, [
        { offset: 0, color: palette.accent, alpha: 0.16 },
        { offset: 0.3, color: palette.glow, alpha: 0.44 },
        { offset: 0.52, color: palette.secondary, alpha: 0.76 },
        { offset: 0.72, color: palette.glow, alpha: 0.4 },
        { offset: 1, color: palette.accent, alpha: 0.14 }
    ]), width * 1.22, 10 * meta.glowBoost, rgba(palette.glow, 0.22));
    stroke(ctx, spine, palette.secondary, width * 0.2, 0.88, 0);

    if (!meta.lite) {
        rawStroke(ctx, spine, rgba(palette.base, 0.14), width * 2.8);
        const upper = withWave(spine, meta.time * 0.18, 1.25, 10.2, 0.9, meta.seed + 147);
        const lower = withWave(spine, meta.time * 0.24, -1.1, 8.8, 1.7, meta.seed + 173);
        stroke(ctx, upper, palette.accent, width * 0.28, 0.16, 0);
        stroke(ctx, lower, palette.glow, width * 0.22, 0.14, 0);
    }
}

function drawPulseArtery(ctx, points, meta) {
    const palette = getPalette(meta);
    const beat = (Math.sin(meta.time * 0.0045) + 1) * 0.5;
    const pulseWidth = meta.baseWidth * (1.8 + beat * 0.85);
    stroke(ctx, points, palette.base, pulseWidth * 2.2, 0.24, 0);
    stroke(ctx, points, palette.accent, pulseWidth, 0.55 + beat * 0.2, 9 * meta.glowBoost);
    stroke(ctx, points, palette.secondary, meta.baseWidth * 0.8, 0.96, 0);
    drawTravelers(ctx, points, meta, palette.secondary, Math.max(2, Math.round(4 * meta.particleDensity)), meta.baseWidth, 0.8);
}

function drawPrismRibbon(ctx, points, meta) {
    const width = meta.baseWidth;
    const ribbons = [
        { color: "#ff6ba5", amplitude: 3.2, frequency: 9 },
        { color: "#ffcf5b", amplitude: 2.4, frequency: 11 },
        { color: "#7ad8ff", amplitude: 3.8, frequency: 13 }
    ];

    ribbons.forEach((ribbon, index) => {
        const warped = jitterPoints(points, meta.seed + index * 31, meta.time, ribbon.amplitude * meta.glowBoost, ribbon.frequency);
        stroke(ctx, warped, ribbon.color, width * (1.4 - index * 0.2), 0.62, 7 * meta.glowBoost);
    });
    stroke(ctx, points, "#ffffff", width * 0.38, 0.55, 0);
}

function drawColdSpark(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth * 0.88;
    const blade = jitterPoints(points, meta.seed + 17, meta.time, 1 + meta.motion * 1.2, 18);

    rawStroke(ctx, blade, createGradientAlongLine(ctx, blade, [
        { offset: 0, color: palette.base, alpha: 0.12 },
        { offset: 0.42, color: palette.accent, alpha: 0.34 },
        { offset: 0.55, color: palette.secondary, alpha: 0.96 },
        { offset: 0.72, color: palette.glow, alpha: 0.44 },
        { offset: 1, color: palette.base, alpha: 0.12 }
    ]), width * 1.06, 11 * meta.glowBoost, rgba(palette.glow, 0.24));
    stroke(ctx, blade, palette.secondary, width * 0.14, 0.96, 0);

    if (!meta.lite) {
        const ghost = withWave(points, meta.time * 0.85, 3.2 + meta.motion * 1.4, 8.4, 0.5, meta.seed + 221);
        const echo = withWave(points, meta.time * 0.62, -2.4, 9.6, 1.4, meta.seed + 257);
        ctx.save();
        ctx.setLineDash([18, 11]);
        rawStroke(ctx, ghost, rgba(palette.accent, 0.18), width * 1.8, 8 * meta.glowBoost, rgba(palette.glow, 0.18));
        ctx.setLineDash([]);
        rawStroke(ctx, echo, rgba(palette.glow, 0.1), width * 1.12);
        ctx.restore();
    }
}

function drawCandyVoltage(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth * 1.02;
    const lacquer = withWave(points, meta.time * 0.95, 2.1 + meta.motion * 1.6, 8.5, 0.2, meta.seed + 211);

    rawStroke(ctx, lacquer, createGradientAlongLine(ctx, lacquer, [
        { offset: 0, color: palette.accent, alpha: 0.46 },
        { offset: 0.34, color: palette.glow, alpha: 0.76 },
        { offset: 0.7, color: palette.secondary, alpha: 0.7 },
        { offset: 1, color: palette.accent, alpha: 0.36 }
    ]), width * 1.62, 12 * meta.glowBoost, rgba(palette.glow, 0.24));
    stroke(ctx, lacquer, palette.secondary, width * 0.28, 0.8, 0);

    if (!meta.lite) {
        rawStroke(ctx, lacquer, rgba(palette.base, 0.18), width * 3.2);
        const underside = withWave(points, meta.time * 0.54, -1.4, 5.8, 1.2, meta.seed + 287);
        stroke(ctx, underside, palette.accent, width * 0.64, 0.22, 0);
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        for (let index = 0; index < 2; index++) {
            const glaze = withWave(lacquer, meta.time * (0.32 + index * 0.11), 0.9 + index * 0.4, 14 + index * 2, index * 0.9, meta.seed + index * 41);
            stroke(ctx, glaze, index === 0 ? palette.glow : palette.secondary, width * (0.16 + index * 0.04), 0.16, 0);
        }
        ctx.restore();
    }
}

function drawToxicLime(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth;
    const caustic = jitterPoints(points, meta.seed + 57, meta.time, 2.7 + meta.motion * 2.2, 16);

    rawStroke(ctx, caustic, createGradientAlongLine(ctx, caustic, [
        { offset: 0, color: palette.base, alpha: 0.16 },
        { offset: 0.48, color: palette.accent, alpha: 0.62 },
        { offset: 1, color: palette.glow, alpha: 0.28 }
    ]), width * 1.24, 10 * meta.glowBoost, rgba(palette.glow, 0.2));
    stroke(ctx, caustic, palette.secondary, width * 0.34, 0.66, 0);

    if (!meta.lite) {
        rawStroke(ctx, caustic, rgba(palette.base, 0.26), width * 3.3);
        const vapor = withWave(points, meta.time * 0.72, 4.6, 6.2, 0.6, meta.seed + 145);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let layer = 0; layer < 3; layer++) {
            const haze = withWave(vapor, meta.time * (0.28 + layer * 0.08), 3.2 + layer * 1.2, 5 + layer * 1.8, layer * 0.7, meta.seed + 420 + layer * 9)
                .map((point, index) => ({
                    x: point.x,
                    y: point.y - (index / Math.max(1, points.length - 1)) * (3 + layer * 2)
                }));
            stroke(ctx, haze, layer === 0 ? palette.glow : palette.accent, width * (1.08 - layer * 0.18), 0.06 + (2 - layer) * 0.03, 0);
        }
        ctx.restore();
    }
}

function drawCopperCoil(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth * 1.08;
    const heavy = withWave(points, meta.time * 0.44, 0.8 + meta.motion * 0.6, 4.8, 0.4, meta.seed + 305);
    const seam = withWave(points, meta.time * 0.26, -0.55, 7.4, 1.7, meta.seed + 331);

    rawStroke(ctx, heavy, rgba(palette.base, 0.28), width * 3.8);
    rawStroke(ctx, heavy, createGradientAlongLine(ctx, heavy, [
        { offset: 0, color: palette.base, alpha: 0.22 },
        { offset: 0.38, color: palette.accent, alpha: 0.58 },
        { offset: 0.65, color: palette.glow, alpha: 0.42 },
        { offset: 1, color: palette.base, alpha: 0.18 }
    ]), width * 1.76, 6 * meta.glowBoost, rgba(palette.accent, 0.16));
    stroke(ctx, seam, palette.secondary, width * 0.22, 0.34, 0);

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const heatLine = withWave(heavy, meta.time * 0.18, 0.4, 9.5, 0.1, meta.seed + 410);
    stroke(ctx, heatLine, palette.glow, width * 0.14, 0.08, 0);
    ctx.restore();
}

function drawAvantCathedralLeak(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth * 0.9;
    const vault = [];
    const runnel = [];
    for (let index = 0; index < points.length; index++) {
        const point = points[index];
        const normal = getPointNormal(points, index);
        const t = index / Math.max(1, points.length - 1);
        const fan = (5.2 + Math.sin(meta.time * 0.0009 + t * 4.2) * 1.6) * Math.sin(t * Math.PI);
        vault.push({ x: point.x + normal.x * fan, y: point.y + normal.y * fan - 4 });
        runnel.push({ x: point.x - normal.x * fan * 0.18, y: point.y - normal.y * fan * 0.18 + 5 + fan * 0.18 });
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vault[0].x, vault[0].y);
    for (let index = 1; index < vault.length; index++) ctx.lineTo(vault[index].x, vault[index].y);
    for (let index = runnel.length - 1; index >= 0; index--) ctx.lineTo(runnel[index].x, runnel[index].y);
    ctx.closePath();
    const wash = ctx.createLinearGradient(points[0].x, points[0].y - 14, points[points.length - 1].x, points[points.length - 1].y + 14);
    wash.addColorStop(0, rgba(palette.secondary, 0.05));
    wash.addColorStop(0.46, rgba(palette.glow, 0.14));
    wash.addColorStop(1, rgba(palette.base, 0.02));
    ctx.fillStyle = wash;
    ctx.fill();
    ctx.restore();

    rawStroke(ctx, points, createGradientAlongLine(ctx, points, [
        { offset: 0, color: palette.base, alpha: 0.08 },
        { offset: 0.36, color: palette.secondary, alpha: 0.42 },
        { offset: 0.56, color: palette.glow, alpha: 0.82 },
        { offset: 1, color: palette.secondary, alpha: 0.3 }
    ]), width * 1.24, 15 * meta.glowBoost, rgba(palette.glow, 0.26));
    stroke(ctx, vault, palette.glow, width * 0.48, 0.15, 4 * meta.glowBoost);
    stroke(ctx, runnel, palette.secondary, width * 0.26, 0.18, 0);
    stroke(ctx, points, palette.secondary, width * 0.18, 0.9, 0);
}

function drawAvantBloodOracle(ctx, points, meta) {
    const palette = getPalette(meta);
    const beat = (Math.sin(meta.time * 0.0048) + 1) * 0.5;
    const width = meta.baseWidth * 1.04;
    const artery = withWave(points, meta.time * 1.05, 1.8 + beat * 1.4, 6.5, 0.3, meta.seed + 14);
    const wallUpper = [];
    const wallLower = [];
    for (let index = 0; index < artery.length; index++) {
        const point = artery[index];
        const normal = getPointNormal(artery, index);
        const t = index / Math.max(1, artery.length - 1);
        const envelope = Math.sin(t * Math.PI);
        const amount = (2.2 + beat * 1.6 + Math.sin(meta.time * 0.0011 + t * 8.2) * 0.5) * envelope;
        wallUpper.push({ x: point.x + normal.x * amount, y: point.y + normal.y * amount });
        wallLower.push({ x: point.x - normal.x * amount * 0.86, y: point.y - normal.y * amount * 0.86 });
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(wallUpper[0].x, wallUpper[0].y);
    for (let index = 1; index < wallUpper.length; index++) ctx.lineTo(wallUpper[index].x, wallUpper[index].y);
    for (let index = wallLower.length - 1; index >= 0; index--) ctx.lineTo(wallLower[index].x, wallLower[index].y);
    ctx.closePath();
    const body = ctx.createLinearGradient(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y);
    body.addColorStop(0, rgba(palette.base, 0.16));
    body.addColorStop(0.5, rgba(palette.accent, 0.28 + beat * 0.08));
    body.addColorStop(1, rgba(palette.base, 0.16));
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();

    rawStroke(ctx, artery, rgba(palette.base, 0.28), width * 3.4);
    stroke(ctx, wallUpper, palette.accent, width * 0.44, 0.14, 0);
    stroke(ctx, wallLower, palette.base, width * 0.36, 0.18, 0);
    rawStroke(ctx, artery, createGradientAlongLine(ctx, artery, [
        { offset: 0, color: palette.base, alpha: 0.08 },
        { offset: 0.45, color: palette.accent, alpha: 0.54 + beat * 0.08 },
        { offset: 0.58, color: palette.secondary, alpha: 0.82 },
        { offset: 1, color: palette.base, alpha: 0.08 }
    ]), width * (0.92 + beat * 0.08), 10 * meta.glowBoost, rgba(palette.glow, 0.14));
    stroke(ctx, artery, palette.secondary, width * 0.2, 0.74, 0);
}

function drawAvantAshBenediction(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth;
    rawStroke(ctx, points, rgba(palette.base, 0.18), width * 3.1);
    rawStroke(ctx, points, createGradientAlongLine(ctx, points, [
        { offset: 0, color: palette.base, alpha: 0.14 },
        { offset: 0.5, color: palette.glow, alpha: 0.42 },
        { offset: 1, color: palette.base, alpha: 0.12 }
    ]), width * 1.3, 8 * meta.glowBoost, rgba(palette.glow, 0.16));
    stroke(ctx, points, palette.secondary, width * 0.34, 0.42, 0);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let strand = 0; strand < 4; strand++) {
        const smoke = withWave(points, meta.time * (0.42 + strand * 0.12), 10 + strand * 3, 4.2 + strand * 0.9, strand * 0.65, meta.seed + strand * 50)
            .map((point, index) => ({
                x: point.x,
                y: point.y - (index / Math.max(1, points.length - 1)) * (7 + strand * 4)
            }));
        stroke(ctx, smoke, strand === 0 ? palette.glow : palette.secondary, width * (1.7 - strand * 0.22), 0.05 + (3 - strand) * 0.025, 0);
    }
    ctx.restore();
}

function drawAvantHaloRupture(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth * 0.92;
    rawStroke(ctx, points, rgba(palette.base, 0.12), width * 2.8);
    rawStroke(ctx, points, createGradientAlongLine(ctx, points, [
        { offset: 0, color: palette.accent, alpha: 0.18 },
        { offset: 0.5, color: palette.glow, alpha: 0.52 },
        { offset: 1, color: palette.accent, alpha: 0.16 }
    ]), width * 1.05, 12 * meta.glowBoost, rgba(palette.glow, 0.22));

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const orbitA = withWave(points, meta.time * 0.64, 5.4, 5.3, 0.4, meta.seed + 12);
    const orbitB = withWave(points, meta.time * 0.78, -4.1, 6.6, 1.4, meta.seed + 44);
    stroke(ctx, orbitA, palette.accent, width * 0.34, 0.2, 4 * meta.glowBoost);
    stroke(ctx, orbitB, palette.secondary, width * 0.22, 0.16, 0);
    ctx.restore();
}

function drawAvantRelicStatic(ctx, points, meta) {
    const palette = getPalette(meta);
    const width = meta.baseWidth * 0.86;
    ctx.save();
    ctx.setLineDash([14, 10]);
    rawStroke(ctx, points, createGradientAlongLine(ctx, points, [
        { offset: 0, color: palette.base, alpha: 0.28 },
        { offset: 0.5, color: palette.accent, alpha: 0.52 },
        { offset: 1, color: palette.secondary, alpha: 0.34 }
    ]), width * 1.22, 4 * meta.glowBoost, rgba(palette.glow, 0.18));
    ctx.setLineDash([]);
    rawStroke(ctx, points, rgba(palette.base, 0.16), width * 3.1);
    const brushed = withWave(points, meta.time * 0.38, 1.1, 8, 0.5, meta.seed + 77);
    const brushed2 = withWave(points, meta.time * 0.24, -0.8, 5.8, 1.1, meta.seed + 107);
    stroke(ctx, brushed, palette.secondary, width * 0.32, 0.18, 0);
    stroke(ctx, brushed2, palette.glow, width * 0.12, 0.08, 0);
    ctx.restore();
}

function drawAvantVeilOfThorns(ctx, points, meta) {
    const palette = getPalette(meta);
    const upper = [];
    const lower = [];
    for (let index = 0; index < points.length; index++) {
        const point = points[index];
        const normal = getPointNormal(points, index);
        const t = index / Math.max(1, points.length - 1);
        const envelope = Math.sin(t * Math.PI);
        const amount = (4.6 + Math.sin(meta.time * 0.0016 + t * 11) * 1.9) * envelope;
        upper.push({ x: point.x + normal.x * amount, y: point.y + normal.y * amount });
        lower.push({ x: point.x - normal.x * amount * 0.62, y: point.y - normal.y * amount * 0.62 });
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(upper[0].x, upper[0].y);
    for (let index = 1; index < upper.length; index++) ctx.lineTo(upper[index].x, upper[index].y);
    for (let index = lower.length - 1; index >= 0; index--) ctx.lineTo(lower[index].x, lower[index].y);
    ctx.closePath();
    const veil = ctx.createLinearGradient(points[0].x, points[0].y, points[points.length - 1].x, points[points.length - 1].y);
    veil.addColorStop(0, rgba(palette.base, 0.04));
    veil.addColorStop(0.45, rgba(palette.accent, 0.1));
    veil.addColorStop(1, rgba(palette.glow, 0.06));
    ctx.fillStyle = veil;
    ctx.fill();
    ctx.restore();

    rawStroke(ctx, upper, rgba(palette.glow, 0.38), meta.baseWidth * 0.84, 7 * meta.glowBoost, rgba(palette.glow, 0.2));
    rawStroke(ctx, lower, rgba(palette.secondary, 0.16), meta.baseWidth * 0.8);
    rawStroke(ctx, points, createGradientAlongLine(ctx, points, [
        { offset: 0, color: palette.base, alpha: 0.12 },
        { offset: 0.52, color: palette.accent, alpha: 0.36 },
        { offset: 1, color: palette.secondary, alpha: 0.12 }
    ]), meta.baseWidth * 0.46, 3 * meta.glowBoost, rgba(palette.glow, 0.14));
}

function drawAvantVoidFracture(ctx, points, meta) {
    if (!points || points.length < 2) return;

    const palette = getPalette(meta);
    const time = meta.time;
    const width = meta.baseWidth;

    // Dark void outer shell (O(1) fast stroke)
    rawStroke(ctx, points, rgba(palette.base, 0.9), width * 3.2);

    // Faked glow (much faster than shadowBlur + lighter)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    rawStroke(ctx, points, rgba(palette.glow, 0.2), width * 2.5);
    
    // Core brilliant sharp line
    rawStroke(ctx, points, rgba(palette.accent, 0.95), width * 0.5);

    // Occasional spatial glitch/tear
    if (Math.sin(time * 0.015) > 0.94) {
        const xOffset = (Math.random() - 0.5) * 20;
        const yOffset = (Math.random() - 0.5) * 10;
        
        ctx.translate(xOffset, yOffset);
        rawStroke(ctx, points, rgba(palette.secondary, 0.8), width * 0.8);
        
        // Secondary echo
        ctx.translate(xOffset * -0.5, yOffset * -0.5);
        rawStroke(ctx, points, rgba(palette.glow, 0.6), width * 0.3);
    }
    ctx.restore();

    // Fast moving travelers along the line
    drawTravelers(ctx, points, meta, palette.glow, 3, width * 1.5, 4.5);
}

export const EFFECTS = [
    { id: "ion_pulse", label: "Ion Pulse", draw: drawIonPulse },
    { id: "ember_cable", label: "Ember Cable", draw: drawEmberCable },
    { id: "aurora_fiber", label: "Aurora Fiber", draw: drawAuroraFiber },
    { id: "pulse_artery", label: "Pulse Artery", draw: drawPulseArtery },
    { id: "prism_ribbon", label: "Prism Ribbon", draw: drawPrismRibbon },
    { id: "cold_spark", label: "Cold Spark", draw: drawColdSpark },
    { id: "candy_voltage", label: "Candy Voltage", draw: drawCandyVoltage },
    { id: "toxic_lime", label: "Toxic Lime", draw: drawToxicLime },
    { id: "copper_coil", label: "Copper Coil", draw: drawCopperCoil },
    { id: "avant_cathedral_leak", label: "Avant Cathedral Leak", draw: drawAvantCathedralLeak },
    { id: "avant_blood_oracle", label: "Avant Blood Oracle", draw: drawAvantBloodOracle },
    { id: "avant_ash_benediction", label: "Avant Ash Benediction", draw: drawAvantAshBenediction },
    { id: "avant_halo_rupture", label: "Avant Halo Rupture", draw: drawAvantHaloRupture },
    { id: "avant_relic_static", label: "Avant Relic Static", draw: drawAvantRelicStatic },
    { id: "avant_veil_of_thorns", label: "Avant Veil of Thorns", draw: drawAvantVeilOfThorns },
    { id: "avant_void_fracture", label: "Avant Void Fracture", draw: drawAvantVoidFracture },
    { id: "legacy_neon_pulse", label: "Legacy Neon Pulse", draw: drawLegacyNeonPulse },
    { id: "legacy_matrix_rain", label: "Legacy Matrix Rain", draw: drawLegacyMatrixRain },
    { id: "legacy_aurora", label: "Legacy Aurora", draw: drawLegacyAurora },
    { id: "legacy_fire_wire", label: "Legacy Fire Wire", draw: drawLegacyFireWire },
    { id: "legacy_quantum", label: "Legacy Quantum", draw: drawLegacyQuantum },
    { id: "legacy_electric", label: "Legacy Electric", draw: drawLegacyElectric },
    { id: "legacy_plasma", label: "Legacy Plasma", draw: drawLegacyPlasma },
    { id: "legacy_rainbow", label: "Legacy Rainbow", draw: drawLegacyRainbow },
    { id: "legacy_pulse_wave", label: "Legacy Pulse Wave", draw: drawLegacyPulseWave },
    { id: "legacy_starlight", label: "Legacy Starlight", draw: drawLegacyStarlight }
];

const _effectMap = new Map(EFFECTS.map((e) => [e.id, e]));

export function getEffectById(effectId) {
    return _effectMap.get(effectId) || null;
}
