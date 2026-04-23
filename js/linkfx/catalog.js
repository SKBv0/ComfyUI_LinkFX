export const ANIMATION_MODES = [
    { id: "static", label: "Static", description: "Freeze time, keep the look." },
    { id: "full", label: "Full", description: "Animate every visible link." },
    { id: "selected", label: "Selected", description: "Animate only selected-node links." }
];

export const QUALITY_TIERS = [
    {
        id: "eco",
        label: "Eco",
        description: "Large graphs, lean detail.",
        targetFps: 18,
        segmentScale: 0.5,
        particleScale: 0.35,
        glowScale: 0,
        echoLimit: 1
    },
    {
        id: "balanced",
        label: "Balanced",
        description: "Default v2 mode.",
        targetFps: 24,
        segmentScale: 1,
        particleScale: 1,
        glowScale: 0.3,
        echoLimit: 3
    },
    {
        id: "cinema",
        label: "Cinema",
        description: "Highest polish for active scenes.",
        targetFps: 30,
        segmentScale: 1.35,
        particleScale: 1.3,
        glowScale: 0.6,
        echoLimit: 4
    }
];

export const PHYSICS_PROFILES = [
    {
        id: "rope",
        label: "Rope",
        description: "Natural sag with steady recovery.",
        segments: 8,
        gravity: 0.6,
        damping: 0.985,
        stiffness: 0.26,
        iterations: 4,
        momentumTransfer: 0.72,
        sagFactor: 0.14,
        maxSag: 62,
        magneticPull: 0.02,
        restSway: 1.8,
        swaySpeed: 0.8,
        swayFrequency: 5
    },
    {
        id: "whip",
        label: "Whip",
        description: "High-energy snap and recoil.",
        segments: 10,
        gravity: 0.52,
        damping: 0.978,
        stiffness: 0.21,
        iterations: 5,
        momentumTransfer: 0.9,
        sagFactor: 0.1,
        maxSag: 48,
        magneticPull: 0.01,
        restSway: 3.2,
        swaySpeed: 1.5,
        swayFrequency: 7
    },
    {
        id: "gel",
        label: "Gel",
        description: "Soft, delayed response.",
        segments: 9,
        gravity: 0.42,
        damping: 0.93,
        stiffness: 0.18,
        iterations: 5,
        momentumTransfer: 0.56,
        sagFactor: 0.18,
        maxSag: 70,
        magneticPull: 0.06,
        restSway: 2.4,
        swaySpeed: 0.9,
        swayFrequency: 6
    },
    {
        id: "magnetic",
        label: "Magnetic",
        description: "Pulled back toward a tight signal path.",
        segments: 8,
        gravity: 0.2,
        damping: 0.97,
        stiffness: 0.36,
        iterations: 5,
        momentumTransfer: 0.5,
        sagFactor: 0.06,
        maxSag: 24,
        magneticPull: 0.12,
        restSway: 1.1,
        swaySpeed: 0.7,
        swayFrequency: 4
    },
    {
        id: "zero_g",
        label: "Zero-G",
        description: "Floating cable with low gravity drift.",
        segments: 9,
        gravity: 0.06,
        damping: 0.988,
        stiffness: 0.14,
        iterations: 4,
        momentumTransfer: 0.68,
        sagFactor: 0.04,
        maxSag: 18,
        magneticPull: 0.04,
        restSway: 4.5,
        swaySpeed: 0.55,
        swayFrequency: 3
    }
];

export const GRAPH_WEATHER = [
    { id: "none", label: "Calm", description: "No global field.", amplitude: 0, speed: 0, frequency: 0 },
    { id: "storm", label: "Storm", description: "Electrical crosswind.", amplitude: 4.8, speed: 1.7, frequency: 12 },
    { id: "tide", label: "Pulse Tide", description: "Slow atmospheric swell.", amplitude: 3.4, speed: 0.9, frequency: 6 },
    { id: "drift", label: "Aurora Drift", description: "Soft spectral field.", amplitude: 2.6, speed: 0.6, frequency: 4 }
];

export const CINEMA_PRESETS = [
    {
        id: "off",
        label: "Original",
        family: "Core",
        tag: "Classic",
        description: "Keep ComfyUI lines, add optional physics only.",
        effectId: null,
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#8fb6ff",
            secondary: "#dfe7ff",
            glow: "#7aa3ff",
            base: "#6f7e94"
        },
        widthScale: 1,
        glowScale: 0.8
    },
    {
        id: "ion",
        label: "Ion Pulse",
        family: "Core",
        tag: "Clean",
        description: "Glassy carrier line with restrained clinical light.",
        effectId: "ion_pulse",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#46b8ff",
            secondary: "#aef1ff",
            glow: "#7fd6ff",
            base: "#23496f"
        },
        widthScale: 1.05,
        glowScale: 1.05
    },
    {
        id: "ember",
        label: "Ember Cable",
        family: "Heat",
        tag: "Hot",
        description: "Forged conductor with heat trapped under blackened metal.",
        effectId: "ember_cable",
        physicsProfileId: "whip",
        qualityTierId: "balanced",
        graphWeatherId: "storm",
        temporalEcho: true,
        palette: {
            accent: "#ff7d2b",
            secondary: "#ffd08a",
            glow: "#ffb25c",
            base: "#6c2d13"
        },
        widthScale: 1.1,
        glowScale: 1.15
    },
    {
        id: "aurora",
        label: "Aurora Fiber",
        family: "Spectral",
        tag: "Fiber",
        description: "Iridescent fiber-optic strand, not a sky curtain.",
        effectId: "aurora_fiber",
        physicsProfileId: "gel",
        qualityTierId: "cinema",
        graphWeatherId: "drift",
        temporalEcho: true,
        palette: {
            accent: "#71f3c6",
            secondary: "#c6ffd5",
            glow: "#8ad0ff",
            base: "#1f4a51"
        },
        widthScale: 1,
        glowScale: 1.2
    },
    {
        id: "artery",
        label: "Pulse Artery",
        family: "Organic",
        tag: "Biomech",
        description: "Biomech pulse rhythm.",
        effectId: "pulse_artery",
        physicsProfileId: "gel",
        qualityTierId: "balanced",
        graphWeatherId: "tide",
        temporalEcho: false,
        palette: {
            accent: "#ff5d7a",
            secondary: "#ffc0d1",
            glow: "#ff8ca2",
            base: "#5a2336"
        },
        widthScale: 1.14,
        glowScale: 1.05
    },
    {
        id: "prism",
        label: "Prism Ribbon",
        family: "Spectral",
        tag: "Color",
        description: "Chromatic band with floating drift.",
        effectId: "prism_ribbon",
        physicsProfileId: "zero_g",
        qualityTierId: "cinema",
        graphWeatherId: "drift",
        temporalEcho: false,
        palette: {
            accent: "#ff66cc",
            secondary: "#75d9ff",
            glow: "#ffcf5b",
            base: "#3b315e"
        },
        widthScale: 1.08,
        glowScale: 1.18
    },
    {
        id: "cold",
        label: "Cold Spark",
        family: "Voltage",
        tag: "Arc",
        description: "Knife-thin cryogenic arc with precise magnetic recoil.",
        effectId: "cold_spark",
        physicsProfileId: "magnetic",
        qualityTierId: "cinema",
        graphWeatherId: "storm",
        temporalEcho: true,
        palette: {
            accent: "#8bd3ff",
            secondary: "#f2fbff",
            glow: "#c4e8ff",
            base: "#22364f"
        },
        widthScale: 0.95,
        glowScale: 1.1
    },
    {
        id: "candy",
        label: "Candy Voltage",
        family: "Play",
        tag: "Pop",
        description: "Lacquered pop current with glossy arcade drag.",
        effectId: "candy_voltage",
        physicsProfileId: "whip",
        qualityTierId: "cinema",
        graphWeatherId: "storm",
        temporalEcho: false,
        palette: {
            accent: "#ff5e9d",
            secondary: "#ffe57b",
            glow: "#7fe4ff",
            base: "#47306f"
        },
        widthScale: 1.12,
        glowScale: 1.2
    },
    {
        id: "toxic",
        label: "Toxic Lime",
        family: "Play",
        tag: "Acid",
        description: "Caustic signal bleeding vapor into the graph air.",
        effectId: "toxic_lime",
        physicsProfileId: "whip",
        qualityTierId: "cinema",
        graphWeatherId: "storm",
        temporalEcho: true,
        palette: {
            accent: "#b7ff38",
            secondary: "#f0ffd2",
            glow: "#69ffb6",
            base: "#264415"
        },
        widthScale: 1,
        glowScale: 1.18
    },
    {
        id: "copper",
        label: "Copper Coil",
        family: "Heat",
        tag: "Dense",
        description: "Heavy conductor with oxidized heat trapped under the skin.",
        effectId: "copper_coil",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#dc7f39",
            secondary: "#ffd8b8",
            glow: "#ffad6b",
            base: "#6d3a1f"
        },
        widthScale: 1.08,
        glowScale: 1.02
    },
    {
        id: "cathedral_leak",
        label: "Cathedral Leak",
        family: "Avant",
        tag: "Ritual",
        description: "A vaulted spill of opal light escaping one sacred seam.",
        effectId: "avant_cathedral_leak",
        physicsProfileId: "zero_g",
        qualityTierId: "cinema",
        graphWeatherId: "drift",
        temporalEcho: true,
        palette: {
            accent: "#dce8f6",
            secondary: "#f6f4ee",
            glow: "#c8edf4",
            base: "#2f3641"
        },
        widthScale: 0.96,
        glowScale: 1.08
    },
    {
        id: "blood_oracle",
        label: "Blood Oracle",
        family: "Avant",
        tag: "Sacrament",
        description: "A dark vessel with a lit pulse sealed inside its skin.",
        effectId: "avant_blood_oracle",
        physicsProfileId: "gel",
        qualityTierId: "cinema",
        graphWeatherId: "tide",
        temporalEcho: true,
        palette: {
            accent: "#82152e",
            secondary: "#e9d2cd",
            glow: "#d27a73",
            base: "#241015"
        },
        widthScale: 1.16,
        glowScale: 1.02
    },
    {
        id: "ash_benediction",
        label: "Ash Benediction",
        family: "Avant",
        tag: "Smoke",
        description: "Cinder haze wrapped around a dim blessing.",
        effectId: "avant_ash_benediction",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "drift",
        temporalEcho: true,
        palette: {
            accent: "#c5bbb0",
            secondary: "#e8ddcc",
            glow: "#b8875f",
            base: "#26211f"
        },
        widthScale: 1.08,
        glowScale: 1
    },
    {
        id: "halo_rupture",
        label: "Halo Rupture",
        family: "Avant",
        tag: "Halo",
        description: "A celestial ring torn into unstable violet static.",
        effectId: "avant_halo_rupture",
        physicsProfileId: "zero_g",
        qualityTierId: "cinema",
        graphWeatherId: "drift",
        temporalEcho: true,
        palette: {
            accent: "#8f79cc",
            secondary: "#e9dec2",
            glow: "#eae6ff",
            base: "#241b32"
        },
        widthScale: 1.04,
        glowScale: 1.12
    },
    {
        id: "relic_static",
        label: "Relic Static",
        family: "Avant",
        tag: "Relic",
        description: "Bronze-age current trapped inside a holy machine.",
        effectId: "avant_relic_static",
        physicsProfileId: "magnetic",
        qualityTierId: "cinema",
        graphWeatherId: "storm",
        temporalEcho: false,
        palette: {
            accent: "#c6a36e",
            secondary: "#e3d7bf",
            glow: "#b9c6c5",
            base: "#30281d"
        },
        widthScale: 0.98,
        glowScale: 0.98
    },
    {
        id: "veil_of_thorns",
        label: "Veil of Thorns",
        family: "Avant",
        tag: "Thorn",
        description: "A ceremonial veil that lashes back like living wire.",
        effectId: "avant_veil_of_thorns",
        physicsProfileId: "whip",
        qualityTierId: "cinema",
        graphWeatherId: "storm",
        temporalEcho: true,
        palette: {
            accent: "#607a52",
            secondary: "#ddd8c9",
            glow: "#b9cf86",
            base: "#161b14"
        },
        widthScale: 1.1,
        glowScale: 1.04
    },
    {
        id: "void_fracture",
        label: "Void Fracture",
        family: "Avant",
        tag: "Glitch",
        description: "A high-contrast glitchy tear in the spatial fabric.",
        effectId: "avant_void_fracture",
        physicsProfileId: "whip",
        qualityTierId: "cinema",
        graphWeatherId: "storm",
        temporalEcho: true,
        palette: {
            accent: "#ffffff",
            secondary: "#ff3366",
            glow: "#00ffff",
            base: "#05050a"
        },
        widthScale: 1.2,
        glowScale: 1.4
    },
    {
        id: "neon_pulse_legacy",
        label: "Neon Pulse",
        family: "Legacy",
        tag: "v1",
        description: "Clean blue pulses close to the original v1 neon feel.",
        effectId: "legacy_neon_pulse",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#38c3ff",
            secondary: "#e7fbff",
            glow: "#79d7ff",
            base: "#1d4871"
        },
        widthScale: 1.06,
        glowScale: 1.14
    },
    {
        id: "matrix_rain_legacy",
        label: "Matrix Rain",
        family: "Legacy",
        tag: "v1",
        description: "Dark preset with a green data-stream mood.",
        effectId: "legacy_matrix_rain",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#7bff72",
            secondary: "#dbffd2",
            glow: "#47d58b",
            base: "#173421"
        },
        widthScale: 0.9,
        glowScale: 1
    },
    {
        id: "fire_wire_legacy",
        label: "Fire Wire",
        family: "Legacy",
        tag: "v1",
        description: "Brings back the v1 fire line with more refined bloom.",
        effectId: "legacy_fire_wire",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#ff6a21",
            secondary: "#ffe29f",
            glow: "#ffb34d",
            base: "#5d2410"
        },
        widthScale: 1.16,
        glowScale: 1.24
    },
    {
        id: "quantum_legacy",
        label: "Quantum",
        family: "Legacy",
        tag: "v1",
        description: "Purple-pink quantum feel with twin particles.",
        effectId: "legacy_quantum",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#d56cff",
            secondary: "#ffd8ff",
            glow: "#79c4ff",
            base: "#33245f"
        },
        widthScale: 1,
        glowScale: 1.22
    },
    {
        id: "electric_legacy",
        label: "Electric",
        family: "Legacy",
        tag: "v1",
        description: "Sharp blue electric arc with more controlled jitter.",
        effectId: "legacy_electric",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#78c9ff",
            secondary: "#eff8ff",
            glow: "#55a5ff",
            base: "#1f3958"
        },
        widthScale: 0.95,
        glowScale: 1.16
    },
    {
        id: "plasma_legacy",
        label: "Plasma",
        family: "Legacy",
        tag: "v1",
        description: "Recalls the plasma palette through layered ribbon strokes.",
        effectId: "legacy_plasma",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#b86bff",
            secondary: "#ffd3ff",
            glow: "#7ae3ff",
            base: "#35245b"
        },
        widthScale: 1.06,
        glowScale: 1.2
    },
    {
        id: "rainbow_legacy",
        label: "Rainbow",
        family: "Legacy",
        tag: "v1",
        description: "A fuller scene preset built around the v1 rainbow look.",
        effectId: "legacy_rainbow",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#ff6ea8",
            secondary: "#ffd86e",
            glow: "#6ed7ff",
            base: "#44306a"
        },
        widthScale: 1.12,
        glowScale: 1.25
    },
    {
        id: "starlight_legacy",
        label: "Starlight",
        family: "Legacy",
        tag: "v1",
        description: "Carries the dusty starlight feel into a calmer glowing profile.",
        effectId: "legacy_starlight",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#b9c8ff",
            secondary: "#ffffff",
            glow: "#9de8ff",
            base: "#2b3558"
        },
        widthScale: 0.92,
        glowScale: 1.15
    },
    {
        id: "aurora_legacy",
        label: "Aurora",
        family: "Legacy",
        tag: "v1",
        description: "Reopens the v1 aurora curtains as a dedicated preset.",
        effectId: "legacy_aurora",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#71f3c6",
            secondary: "#c6ffd5",
            glow: "#8ad0ff",
            base: "#1f4a51"
        },
        widthScale: 1,
        glowScale: 1.2
    },
    {
        id: "pulse_wave_legacy",
        label: "Pulse Wave",
        family: "Legacy",
        tag: "v1",
        description: "The v1 line effect with a heartbeat-like pulse.",
        effectId: "legacy_pulse_wave",
        physicsProfileId: "rope",
        qualityTierId: "balanced",
        graphWeatherId: "none",
        temporalEcho: false,
        palette: {
            accent: "#ff5d7a",
            secondary: "#ffc0d1",
            glow: "#ff8ca2",
            base: "#5a2336"
        },
        widthScale: 1.14,
        glowScale: 1.05
    }
];

const _lookupMaps = new WeakMap();
function getLookupMap(list) {
    let map = _lookupMaps.get(list);
    if (!map) {
        map = new Map(list.map((entry) => [entry.id, entry]));
        _lookupMaps.set(list, map);
    }
    return map;
}

export function findById(list, id, fallbackId) {
    const map = getLookupMap(list);
    return map.get(id) ?? map.get(fallbackId) ?? list[0];
}
