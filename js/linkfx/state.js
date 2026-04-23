import {
    ANIMATION_MODES,
    CINEMA_PRESETS,
    GRAPH_WEATHER,
    PHYSICS_PROFILES,
    QUALITY_TIERS,
    findById
} from "./catalog.js";

const STORAGE_KEY = "linkfx:v2";
const STATIC_TIME = 5000;

const DEFAULT_STATE = {
    animationMode: "full",
    presetId: "ion",
    physicsEnabled: true,
    physicsProfileId: "rope",
    qualityTierId: "balanced",
    graphWeatherId: "none",
    temporalEchoEnabled: false,
    hueShift: 0,
    animationSpeed: 1.0
};

const listeners = new Set();
let state = sanitizeState(loadPersistedState());

function hasId(list, id) {
    return list.some((entry) => entry.id === id);
}

function sanitizeState(value) {
    const input = value || {};
    const physicsEnabled = typeof input.physicsEnabled === "boolean" ? input.physicsEnabled : DEFAULT_STATE.physicsEnabled;
    return {
        animationMode: hasId(ANIMATION_MODES, input.animationMode) ? input.animationMode : DEFAULT_STATE.animationMode,
        presetId: hasId(CINEMA_PRESETS, input.presetId) ? input.presetId : DEFAULT_STATE.presetId,
        physicsEnabled,
        physicsProfileId: hasId(PHYSICS_PROFILES, input.physicsProfileId) ? input.physicsProfileId : DEFAULT_STATE.physicsProfileId,
        qualityTierId: hasId(QUALITY_TIERS, input.qualityTierId) ? input.qualityTierId : DEFAULT_STATE.qualityTierId,
        graphWeatherId: hasId(GRAPH_WEATHER, input.graphWeatherId) ? input.graphWeatherId : DEFAULT_STATE.graphWeatherId,
        temporalEchoEnabled: physicsEnabled && typeof input.temporalEchoEnabled === "boolean"
            ? input.temporalEchoEnabled
            : DEFAULT_STATE.temporalEchoEnabled,
        hueShift: Number.isFinite(input.hueShift) ? Math.max(-180, Math.min(180, Number(input.hueShift))) : DEFAULT_STATE.hueShift,
        animationSpeed: Number.isFinite(input.animationSpeed) ? Math.max(0.1, Math.min(3.0, Number(input.animationSpeed))) : DEFAULT_STATE.animationSpeed
    };
}

function loadPersistedState() {
    try {
        const raw = globalThis?.localStorage?.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : DEFAULT_STATE;
    } catch {
        return DEFAULT_STATE;
    }
}

function persistState(nextState) {
    try {
        globalThis?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {
    }
}

function commit(nextPartial) {
    const previous = state;
    state = sanitizeState({ ...state, ...nextPartial });
    persistState(state);
    listeners.forEach((listener) => listener(state, previous));
}

export function getState() {
    return state;
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setAnimationMode(animationMode) {
    commit({ animationMode });
}

export function applyPreset(presetId) {
    const preset = findById(CINEMA_PRESETS, presetId, DEFAULT_STATE.presetId);
    commit({
        presetId: preset.id,
        physicsProfileId: preset.physicsProfileId,
        graphWeatherId: preset.graphWeatherId,
        temporalEchoEnabled: preset.temporalEcho
    });
}

export function setPhysicsEnabled(physicsEnabled) {
    commit({ physicsEnabled: Boolean(physicsEnabled) });
}

export function setPhysicsProfile(physicsProfileId) {
    commit({ physicsProfileId });
}

export function setQualityTier(qualityTierId) {
    commit({ qualityTierId });
}

export function setGraphWeather(graphWeatherId) {
    commit({ graphWeatherId });
}

export function setTemporalEchoEnabled(temporalEchoEnabled) {
    commit({ temporalEchoEnabled: state.physicsEnabled && Boolean(temporalEchoEnabled) });
}

export function setHueShift(hueShift) {
    commit({ hueShift });
}

export function setAnimationSpeed(animationSpeed) {
    commit({ animationSpeed });
}

let _cachedRuntime = null;
let _cachedState = null;

export function resolveRuntimeConfig(inputState = state) {
    if (inputState === _cachedState && _cachedRuntime) return _cachedRuntime;
    const preset = findById(CINEMA_PRESETS, inputState.presetId, DEFAULT_STATE.presetId);
    _cachedRuntime = {
        ...inputState,
        preset,
        qualityTier: findById(QUALITY_TIERS, inputState.qualityTierId, DEFAULT_STATE.qualityTierId),
        physicsProfile: findById(PHYSICS_PROFILES, inputState.physicsProfileId, DEFAULT_STATE.physicsProfileId),
        graphWeather: findById(GRAPH_WEATHER, inputState.graphWeatherId, DEFAULT_STATE.graphWeatherId)
    };
    _cachedState = inputState;
    return _cachedRuntime;
}

let simulatedTime = 0;
let lastRealTime = performance.now();

export function getRenderTime(inputState = state) {
    if (inputState.animationMode === "static") return STATIC_TIME;
    
    const realTime = performance.now();
    const dt = realTime - lastRealTime;
    if (dt > 0) {
        const clampedDt = Math.min(dt, 100);
        simulatedTime += clampedDt * inputState.animationSpeed;
        lastRealTime = realTime;
    }
    return simulatedTime;
}
