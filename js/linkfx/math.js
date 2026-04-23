export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

export function seedFromString(value) {
    const text = String(value ?? "linkfx");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function hashFloat(seed, index) {
    let value = seed ^ Math.imul(index + 1, 374761393);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    value ^= value >>> 16;
    return (value >>> 0) / 4294967295;
}

export function seededNoise(seed, x) {
    const x0 = Math.floor(x);
    const x1 = x0 + 1;
    const t = x - x0;
    const v0 = hashFloat(seed, x0);
    const v1 = hashFloat(seed, x1);
    return lerp(v0, v1, smoothstep(0, 1, t));
}

export function parseColor(color) {
    if (typeof color !== "string") return null;

    const hex = color.trim();
    if (hex.startsWith("#")) {
        const value = hex.slice(1);
        if (value.length === 3) {
            return {
                r: parseInt(value[0] + value[0], 16),
                g: parseInt(value[1] + value[1], 16),
                b: parseInt(value[2] + value[2], 16)
            };
        }
        if (value.length === 6) {
            return {
                r: parseInt(value.slice(0, 2), 16),
                g: parseInt(value.slice(2, 4), 16),
                b: parseInt(value.slice(4, 6), 16)
            };
        }
    }

    const rgb = color.match(/rgba?\(([^)]+)\)/i);
    if (!rgb) return null;
    const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
}

export function rgba(color, alpha) {
    const parsed = typeof color === "string" ? parseColor(color) : color;
    if (!parsed) return color;
    return `rgba(${Math.round(parsed.r)}, ${Math.round(parsed.g)}, ${Math.round(parsed.b)}, ${clamp(alpha, 0, 1)})`;
}

export function mixColors(a, b, t) {
    const colorA = typeof a === "string" ? parseColor(a) : a;
    const colorB = typeof b === "string" ? parseColor(b) : b;
    if (!colorA) return colorB || null;
    if (!colorB) return colorA;
    return {
        r: lerp(colorA.r, colorB.r, t),
        g: lerp(colorA.g, colorB.g, t),
        b: lerp(colorA.b, colorB.b, t)
    };
}

function rgbToHsl(color) {
    const r = clamp(color.r / 255, 0, 1);
    const g = clamp(color.g / 255, 0, 1);
    const b = clamp(color.b / 255, 0, 1);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l: lightness };
    }

    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    let hue = 0;
    if (max === r) hue = ((g - b) / delta) + (g < b ? 6 : 0);
    else if (max === g) hue = ((b - r) / delta) + 2;
    else hue = ((r - g) / delta) + 4;
    hue /= 6;

    return { h: hue, s: saturation, l: lightness };
}

function hueToRgb(p, q, t) {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
}

function hslToRgb(hsl) {
    const { h, s, l } = hsl;
    if (s === 0) {
        const gray = l * 255;
        return { r: gray, g: gray, b: gray };
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - (l * s);
    const p = 2 * l - q;
    return {
        r: hueToRgb(p, q, h + 1 / 3) * 255,
        g: hueToRgb(p, q, h) * 255,
        b: hueToRgb(p, q, h - 1 / 3) * 255
    };
}

export function rotateHue(color, degrees = 0) {
    const parsed = typeof color === "string" ? parseColor(color) : color;
    if (!parsed) return color;
    if (!degrees) return parsed;
    const hsl = rgbToHsl(parsed);
    const nextHue = (((hsl.h * 360) + degrees) % 360 + 360) % 360;
    return hslToRgb({ h: nextHue / 360, s: hsl.s, l: hsl.l });
}

export function getLinkKey(link, a, b) {
    if (link?.id != null) return `link_${link.id}`;
    return `pos_${Math.round(a[0] / 10)}_${Math.round(a[1] / 10)}_${Math.round(b[0] / 10)}_${Math.round(b[1] / 10)}`;
}

function bezierPoint(t, a, b, cp) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    const cpA = a[0] + cp;
    const cpB = b[0] - cp;
    return {
        x: mt3 * a[0] + 3 * mt2 * t * cpA + 3 * mt * t2 * cpB + t3 * b[0],
        y: mt3 * a[1] + 3 * mt2 * t * a[1] + 3 * mt * t2 * b[1] + t3 * b[1]
    };
}

export function sampleBezierPolyline(a, b, segments, cpScale = 0.3) {
    const safeSegments = Math.max(4, Math.round(segments));
    const cp = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) * cpScale, 40);
    const points = [];
    for (let index = 0; index <= safeSegments; index++) {
        points.push(bezierPoint(index / safeSegments, a, b, cp));
    }
    return points;
}

export function polylineLength(waypoints) {
    if (!waypoints || waypoints.length < 2) return 0;
    let total = 0;
    for (let index = 1; index < waypoints.length; index++) {
        const dx = waypoints[index][0] - waypoints[index - 1][0];
        const dy = waypoints[index][1] - waypoints[index - 1][1];
        total += Math.hypot(dx, dy);
    }
    return total;
}

export function sampleMultiWaypointBezier(waypoints, totalSegments, cpScale = 0.3) {
    if (!waypoints || waypoints.length < 2) return [];
    if (waypoints.length === 2) return sampleBezierPolyline(waypoints[0], waypoints[1], totalSegments, cpScale);

    const safeTotal = Math.max(4, Math.round(totalSegments));
    const lengths = [];
    let total = 0;
    for (let index = 1; index < waypoints.length; index++) {
        const dx = waypoints[index][0] - waypoints[index - 1][0];
        const dy = waypoints[index][1] - waypoints[index - 1][1];
        const d = Math.hypot(dx, dy);
        lengths.push(d);
        total += d;
    }
    if (total === 0) return [{ x: waypoints[0][0], y: waypoints[0][1] }];

    const result = [];
    for (let index = 0; index < waypoints.length - 1; index++) {
        const share = Math.max(2, Math.round(safeTotal * (lengths[index] / total)));
        const segPoints = sampleBezierPolyline(waypoints[index], waypoints[index + 1], share, cpScale);
        if (index === 0) {
            result.push(...segPoints);
        } else {
            result.push(...segPoints.slice(1));
        }
    }
    return result;
}

export function clonePoints(points) {
    return points.map((point) => ({ x: point.x, y: point.y }));
}

export function drawPolyline(ctx, points) {
    if (!points?.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
        ctx.lineTo(points[1].x, points[1].y);
        return;
    }

    for (let index = 1; index < points.length - 1; index++) {
        const current = points[index];
        const next = points[index + 1];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }

    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
}

export function samplePointOnPolyline(points, t) {
    if (!points?.length) return { x: 0, y: 0 };
    if (points.length === 1) return points[0];

    const clamped = clamp(t, 0, 1);
    const lengths = [0];
    let total = 0;
    for (let index = 1; index < points.length; index++) {
        total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
        lengths.push(total);
    }

    if (total === 0) return points[0];
    const target = clamped * total;
    for (let index = 1; index < lengths.length; index++) {
        if (target <= lengths[index]) {
            const segmentLength = lengths[index] - lengths[index - 1] || 1;
            const localT = (target - lengths[index - 1]) / segmentLength;
            return {
                x: lerp(points[index - 1].x, points[index].x, localT),
                y: lerp(points[index - 1].y, points[index].y, localT)
            };
        }
    }
    return points[points.length - 1];
}

export function resamplePolyline(points, segments) {
    if (!points?.length) return [];
    const safeSegments = Math.max(1, Math.round(segments));
    if (points.length === 1) {
        const sampled = [];
        for (let i = 0; i <= safeSegments; i++) sampled.push({ x: points[0].x, y: points[0].y });
        return sampled;
    }

    // Pre-compute cumulative lengths once
    const lengths = [0];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        lengths.push(total);
    }
    if (total === 0) {
        const sampled = [];
        for (let i = 0; i <= safeSegments; i++) sampled.push({ x: points[0].x, y: points[0].y });
        return sampled;
    }

    const sampled = [];
    let segIdx = 1;
    for (let i = 0; i <= safeSegments; i++) {
        const target = clamp(i / safeSegments, 0, 1) * total;
        while (segIdx < lengths.length - 1 && lengths[segIdx] < target) segIdx++;
        const segLen = lengths[segIdx] - lengths[segIdx - 1] || 1;
        const localT = (target - lengths[segIdx - 1]) / segLen;
        sampled.push({
            x: lerp(points[segIdx - 1].x, points[segIdx].x, localT),
            y: lerp(points[segIdx - 1].y, points[segIdx].y, localT)
        });
    }
    return sampled;
}

export function getPointNormal(points, index) {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: -dy / length, y: dx / length };
}
