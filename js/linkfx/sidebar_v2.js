import {
    ANIMATION_MODES,
    CINEMA_PRESETS,
    GRAPH_WEATHER,
    PHYSICS_PROFILES,
    QUALITY_TIERS
} from "./catalog.js";
import {
    applyPreset,
    getState,
    resolveRuntimeConfig,
    setAnimationMode,
    setGraphWeather,
    setHueShift,
    setAnimationSpeed,
    setPhysicsEnabled,
    setPhysicsProfile,
    setQualityTier,
    setTemporalEchoEnabled,
    subscribe
} from "./state.js";

const SIDEBAR_TAB_ID = "linkfx";
const FONT_DISPLAY = "\"Bahnschrift\", \"Segoe UI Variable Display\", sans-serif";
const FONT_BODY = "\"Segoe UI Variable Text\", \"Trebuchet MS\", sans-serif";
const PRESET_DESCRIPTION_OVERRIDES = {
    neon_pulse_legacy: "Clean blue pulses close to the original v1 neon feel.",
    matrix_rain_legacy: "Dark preset with a green data-stream mood.",
    fire_wire_legacy: "Brings back the v1 fire line with more refined bloom.",
    quantum_legacy: "Purple-pink quantum feel with twin particles.",
    electric_legacy: "Sharp blue electric arc with more controlled jitter.",
    plasma_legacy: "Recalls the plasma palette through layered ribbon strokes.",
    rainbow_legacy: "A fuller scene preset built around the v1 rainbow look.",
    starlight_legacy: "Carries the dusty starlight feel into a calmer glowing profile.",
    aurora_legacy: "Reopens the v1 aurora curtains as a dedicated preset.",
    pulse_wave_legacy: "The v1 line effect with a heartbeat-like pulse."
};

let activeContainer = null;
let sidebarRegistered = false;
let presetGridObserver = null;
let sliderActive = false;
let queuedSidebarRefresh = false;

function assignStyles(element, styles) {
    Object.assign(element.style, styles);
}

function createEl(tag, styles, text) {
    const element = document.createElement(tag);
    if (styles) assignStyles(element, styles);
    if (text != null) element.textContent = text;
    return element;
}

function getPresetDescription(preset) {
    return PRESET_DESCRIPTION_OVERRIDES[preset.id] || preset.description;
}

function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== "string") return `rgba(140, 160, 210, ${alpha})`;
    const h = hex.replace("#", "").trim().slice(0, 6);
    if (h.length !== 6) return `rgba(140, 160, 210, ${alpha})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function chipHex(accent) {
    if (!accent || typeof accent !== "string") return "#7aa3ff";
    return `#${accent.replace("#", "").trim().slice(0, 6)}`;
}

function bindResponsivePresetGrid(container, presetGrid) {
    const updateColumns = () => {
        const width = container.clientWidth || 0;
        presetGrid.style.gridTemplateColumns = width < 360
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(3, minmax(0, 1fr))";
    };

    updateColumns();

    if (presetGridObserver) presetGridObserver.disconnect();
    if (typeof ResizeObserver === "function") {
        presetGridObserver = new ResizeObserver(updateColumns);
        presetGridObserver.observe(container);
    } else {
        presetGridObserver = null;
    }
}

function createSectionShell(title, subtitle, palette) {
    const tint = palette
        ? hexToRgba(palette.secondary, 0.11)
        : "rgba(255,255,255,0.06)";
    const shell = createEl("section", {
        display: "flex",
        flexDirection: "column",
        gap: "7px",
        padding: "10px",
        borderRadius: "11px",
        border: `1px solid ${tint}`,
        background: "rgba(255,255,255,0.028)",
        boxSizing: "border-box",
        flex: "0 0 auto"
    });

    shell.appendChild(createEl("div", {
        fontFamily: FONT_DISPLAY,
        fontSize: "10px",
        fontWeight: "bold",
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        color: palette ? hexToRgba(palette.secondary, 0.8) : "rgba(190,202,225,0.7)"
    }, title));

    return shell;
}

function createInspectorLine(label, value, accent, body) {
    const row = createEl("div", {
        display: "flex",
        flexDirection: "column",
        gap: "3px",
        padding: "8px 9px",
        borderRadius: "7px",
        borderLeft: `2px solid ${accent}`,
        background: "rgba(255,255,255,0.025)"
    });
    row.appendChild(createEl("div", {
        fontSize: "8px",
        letterSpacing: "0.9px",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.44)"
    }, `${label} / ${value}`));
    row.appendChild(createEl("div", {
        fontSize: "10px",
        lineHeight: "1.4",
        color: "rgba(232,238,247,0.72)"
    }, body));
    return row;
}

function createInlineStateBlock(lines) {
    const block = createEl("div", {
        display: "flex",
        flexDirection: "column",
        gap: "6px"
    });
    lines.forEach((line) => block.appendChild(createInspectorLine(line.label, line.value, line.accent, line.body)));
    return block;
}

function describeQualityLoad(tier) {
    const combined = tier.segmentScale + tier.particleScale + tier.glowScale;
    if (combined <= 1.8) return "Light";
    if (combined <= 3.1) return "Balanced";
    return "Heavy";
}

function describeWeatherField(weather) {
    if (weather.id === "none") return "Off";
    if (weather.amplitude <= 2.8) return "Soft";
    if (weather.amplitude <= 4) return "Medium";
    return "Strong";
}

function describeWeatherSpeed(weather) {
    if (weather.id === "none") return "Still";
    if (weather.speed <= 0.7) return "Slow";
    if (weather.speed <= 1.15) return "Medium";
    return "Fast";
}

function getMotionInspectorLines(runtime, activeMode) {
    return [
        {
            label: "Animation",
            value: activeMode.label,
            accent: runtime.preset.palette.secondary,
            body: activeMode.description
        },
        {
            label: "Physics",
            value: runtime.physicsProfile.label,
            accent: runtime.preset.palette.accent,
            body: runtime.physicsEnabled
                ? `${runtime.physicsProfile.description} Echo ${runtime.temporalEchoEnabled ? "on" : "off"}.`
                : "Physics is off. Links fall back to the base spline."
        }
    ];
}

function getPolishInspectorLines(runtime) {
    return [
        {
            label: "Quality",
            value: runtime.qualityTier.label,
            accent: runtime.preset.palette.glow,
            body: `${runtime.qualityTier.description} ${runtime.qualityTier.targetFps} fps target, ${describeQualityLoad(runtime.qualityTier).toLowerCase()} render load.`
        },
        {
            label: "Field",
            value: runtime.graphWeather.label,
            accent: runtime.preset.palette.secondary,
            body: `${runtime.graphWeather.description} Field ${describeWeatherField(runtime.graphWeather).toLowerCase()}, speed ${describeWeatherSpeed(runtime.graphWeather).toLowerCase()}.`
        }
    ];
}

function makeSwatchStrip(palette) {
    const strip = createEl("div", {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "3px"
    });

    [palette.base, palette.accent, palette.secondary, palette.glow].forEach((color) => {
        strip.appendChild(createEl("div", {
            height: "4px",
            borderRadius: "999px",
            background: color
        }));
    });

    return strip;
}

function createPresetHero(runtime) {
    const preset = runtime.preset;
    const { palette } = preset;
    const hero = createEl("div", {
        position: "relative",
        overflow: "hidden",
        borderRadius: "14px",
        padding: "18px 14px 13px",
        background: "rgba(14,17,26,0.94)",
        border: `1px solid ${hexToRgba(palette.secondary, 0.2)}`,
        boxSizing: "border-box",
        flex: "0 0 auto"
    });
    hero.appendChild(createEl("div", {
        position: "absolute",
        top: "0",
        left: "0",
        right: "0",
        height: "2px",
        background: palette.accent,
        opacity: "0.75"
    }));

    const tagRow = createEl("div", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px",
        marginBottom: "8px",
        paddingTop: "1px"
    });
    tagRow.appendChild(createEl("div", {
        fontFamily: FONT_DISPLAY,
        fontSize: "18px",
        fontWeight: "bold",
        lineHeight: "1.2",
        letterSpacing: "0.2px",
        color: "#f7fbff"
    }, preset.label));
    tagRow.appendChild(createEl("div", {
        fontFamily: FONT_DISPLAY,
        fontSize: "9px",
        letterSpacing: "1px",
        textTransform: "uppercase",
        padding: "4px 7px",
        borderRadius: "999px",
        background: hexToRgba(palette.accent, 0.12),
        border: `1px solid ${hexToRgba(palette.secondary, 0.22)}`,
        color: "rgba(255,255,255,0.88)"
    }, preset.tag || "Preset"));

    hero.appendChild(tagRow);

    const meta = createEl("div", {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "6px",
        marginBottom: "10px"
    });

    [
        ["Physics", runtime.physicsProfile.label],
        ["Quality", runtime.qualityTier.label],
        ["Field", runtime.graphWeather.label]
    ].forEach(([label, value]) => {
        const cell = createEl("div", {
            padding: "7px",
            borderRadius: "10px",
            background: hexToRgba(palette.accent, 0.06),
            border: `1px solid ${hexToRgba(palette.secondary, 0.1)}`
        });
        cell.appendChild(createEl("div", {
            fontSize: "8px",
            letterSpacing: "0.9px",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            marginBottom: "3px"
        }, label));
        cell.appendChild(createEl("div", {
            fontSize: "11px",
            fontWeight: "600",
            color: "rgba(255,255,255,0.92)"
        }, value));
        meta.appendChild(cell);
    });

    hero.appendChild(meta);
    hero.appendChild(makeSwatchStrip(preset.palette));
    return hero;
}

function createPresetCard(preset, active) {
    const { palette } = preset;
    const card = createEl("button", {
        border: active
            ? `1px solid ${hexToRgba(palette.secondary, 0.5)}`
            : "1px solid rgba(255,255,255,0.07)",
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        minHeight: "48px",
        padding: "8px 10px",
        borderRadius: "8px",
        background: active ? hexToRgba(palette.accent, 0.1) : "rgba(255,255,255,0.03)",
        transition: "background 120ms ease, border-color 120ms ease",
        color: "#fff",
        boxSizing: "border-box"
    });
    card.type = "button";
    card.title = getPresetDescription(preset);

    card.appendChild(createEl("div", {
        fontFamily: FONT_DISPLAY,
        fontSize: "12px",
        fontWeight: "bold",
        lineHeight: "1.05",
        maxWidth: "90%",
        marginBottom: "2px"
    }, preset.label));
    card.appendChild(makeSwatchStrip(preset.palette));

    card.addEventListener("mouseenter", () => {
        if (active) {
            card.style.background = hexToRgba(palette.accent, 0.13);
        } else {
            card.style.background = "rgba(255,255,255,0.05)";
            card.style.borderColor = hexToRgba(palette.secondary, 0.25);
        }
    });
    card.addEventListener("mouseleave", () => {
        card.style.background = active ? hexToRgba(palette.accent, 0.1) : "rgba(255,255,255,0.03)";
        card.style.borderColor = active ? hexToRgba(palette.secondary, 0.5) : "rgba(255,255,255,0.07)";
    });
    card.addEventListener("click", () => applyPreset(preset.id));
    return card;
}

function createChip({ label, active, onClick, accent = "#6197ff", disabled = false, title }) {
    const hx = chipHex(accent);
    const chip = createEl("button", {
        border: disabled ? "1px solid rgba(255,255,255,0.06)" : (active ? `1px solid ${hexToRgba(hx, 0.55)}` : "1px solid rgba(255,255,255,0.08)"),
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "6px 10px",
        borderRadius: "8px",
        background: disabled ? "rgba(255,255,255,0.02)" : (active ? hexToRgba(hx, 0.16) : "rgba(255,255,255,0.03)"),
        color: disabled ? "rgba(176,184,196,0.38)" : (active ? "#f8fbff" : "rgba(224,231,241,0.8)"),
        fontFamily: FONT_BODY,
        fontSize: "10px",
        lineHeight: "1",
        transition: "all 120ms ease",
        opacity: disabled ? "0.6" : "1"
    }, label);
    chip.type = "button";
    chip.disabled = disabled;
    if (title) chip.title = title;

    chip.addEventListener("mouseenter", () => {
        if (!active && !disabled) chip.style.background = "rgba(255,255,255,0.06)";
    });
    chip.addEventListener("mouseleave", () => {
        if (!active && !disabled) chip.style.background = "rgba(255,255,255,0.03)";
    });
    chip.addEventListener("click", () => {
        if (!disabled) onClick();
    });

    return chip;
}

function createChipGrid(items, isActive, onChoose, accentResolver, isDisabled) {
    const grid = createEl("div", {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px"
    });

    items.forEach((item) => {
        grid.appendChild(createChip({
            label: item.label,
            active: isActive(item),
            onClick: () => onChoose(item),
            accent: accentResolver ? accentResolver(item) : "#6197ff",
            disabled: isDisabled ? isDisabled(item) : false,
            title: item.description
        }));
    });

    return grid;
}

function createSwitchTile({ title, description, enabled, onToggle, accent, disabled = false }) {
    const ax = chipHex(accent);
    const tile = createEl("button", {
        border: disabled ? "1px solid rgba(255,255,255,0.06)" : `1px solid ${enabled ? hexToRgba(ax, 0.35) : "rgba(255,255,255,0.08)"}`,
        borderRadius: "12px",
        padding: "8px 10px",
        background: disabled ? "rgba(255,255,255,0.02)" : (enabled ? hexToRgba(ax, 0.1) : "rgba(255,255,255,0.03)"),
        color: disabled ? "rgba(176,184,196,0.46)" : "#eff5ff",
        cursor: disabled ? "not-allowed" : "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minHeight: "48px",
        opacity: disabled ? "0.6" : "1",
        boxSizing: "border-box"
    });
    tile.type = "button";
    tile.disabled = disabled;

    const top = createEl("div", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px"
    });
    top.appendChild(createEl("div", {
        fontFamily: FONT_DISPLAY,
        fontSize: "11px",
        textTransform: "uppercase",
        letterSpacing: "0.9px"
    }, title));
    top.appendChild(createEl("div", {
        padding: "3px 6px",
        borderRadius: "999px",
        fontSize: "9px",
        fontWeight: "700",
        background: disabled ? "rgba(255,255,255,0.06)" : (enabled ? hexToRgba(ax, 0.28) : "rgba(255,255,255,0.08)")
    }, disabled ? "LOCK" : (enabled ? "ON" : "OFF")));

    tile.appendChild(top);
    if (description) {
        tile.appendChild(createEl("div", {
            fontSize: "10px",
            lineHeight: "1.4",
            color: disabled ? "rgba(176,184,196,0.4)" : "rgba(227,234,244,0.68)"
        }, description));
    }
    tile.addEventListener("click", () => {
        if (!disabled) onToggle();
    });

    return tile;
}

function formatHueShiftLabel(value) {
    const rounded = Math.round(value);
    if (rounded > 0) return `+${rounded} deg`;
    if (rounded < 0) return `${rounded} deg`;
    return "0 deg";
}

function createColorSection(runtime) {
    const p = runtime.preset.palette;
    const section = createSectionShell("Global Options", "Adjust overall playback and color tone.", p);
    const previewCard = createEl("div", {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px",
        borderRadius: "12px",
        background: hexToRgba(p.accent, 0.04),
        border: `1px solid ${hexToRgba(p.secondary, 0.14)}`,
        boxSizing: "border-box"
    });

    const top = createEl("div", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px"
    });
    top.appendChild(createEl("div", {
        fontFamily: FONT_DISPLAY,
        fontSize: "10px",
        letterSpacing: "0.9px",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.52)"
    }, "Hue Shift"));
    const valueBadge = createEl("div", {
        padding: "3px 7px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.06)",
        fontSize: "10px",
        color: "rgba(248,251,255,0.88)"
    }, formatHueShiftLabel(runtime.hueShift));
    top.appendChild(valueBadge);
    previewCard.appendChild(top);

    const preview = makeSwatchStrip(runtime.preset.palette);
    preview.style.filter = `hue-rotate(${runtime.hueShift}deg)`;
    preview.style.opacity = "0.96";
    previewCard.appendChild(preview);

    const slider = createEl("input", {
        width: "100%",
        accentColor: runtime.preset.palette.glow,
        cursor: "pointer"
    });
    slider.type = "range";
    slider.min = "-180";
    slider.max = "180";
    slider.step = "1";
    slider.value = String(runtime.hueShift);

    const finishInteraction = () => {
        sliderActive = false;
        if (queuedSidebarRefresh && activeContainer) {
            queuedSidebarRefresh = false;
            buildSidebarContent(activeContainer);
        }
    };

    slider.addEventListener("pointerdown", () => {
        sliderActive = true;
        queuedSidebarRefresh = false;
    });
    slider.addEventListener("input", (event) => {
        const nextValue = Number(event.target.value);
        valueBadge.textContent = formatHueShiftLabel(nextValue);
        preview.style.filter = `hue-rotate(${nextValue}deg)`;
        setHueShift(nextValue);
    });
    slider.addEventListener("change", finishInteraction);
    slider.addEventListener("blur", finishInteraction);
    previewCard.appendChild(slider);

    const actions = createEl("div", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px"
    });
    actions.appendChild(createEl("div", {
        fontSize: "10px",
        color: "rgba(223,231,244,0.54)"
    }, "Keeps the preset identity, shifts only the hue."));

    const reset = createEl("button", {
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "999px",
        padding: "6px 10px",
        background: runtime.hueShift === 0 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)",
        color: runtime.hueShift === 0 ? "rgba(176,184,196,0.42)" : "rgba(248,251,255,0.88)",
        cursor: runtime.hueShift === 0 ? "default" : "pointer",
        fontSize: "10px"
    }, "Reset");
    reset.type = "button";
    reset.disabled = runtime.hueShift === 0;
    reset.addEventListener("click", () => {
        if (runtime.hueShift !== 0) setHueShift(0);
    });
    actions.appendChild(reset);
    previewCard.appendChild(actions);

    section.appendChild(previewCard);

    // Animation Speed Block
    const speedCard = createEl("div", {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px",
        borderRadius: "12px",
        background: hexToRgba(p.secondary, 0.04),
        border: `1px solid ${hexToRgba(p.glow, 0.14)}`,
        boxSizing: "border-box",
        marginTop: "4px"
    });

    const speedTop = createEl("div", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px"
    });
    speedTop.appendChild(createEl("div", {
        fontFamily: FONT_DISPLAY,
        fontSize: "10px",
        letterSpacing: "0.9px",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.52)"
    }, "Animation Speed"));

    const speedBadge = createEl("div", {
        padding: "3px 7px",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.06)",
        fontSize: "10px",
        color: "rgba(248,251,255,0.88)"
    }, runtime.animationSpeed.toFixed(1) + "x");
    speedTop.appendChild(speedBadge);
    speedCard.appendChild(speedTop);

    const speedSlider = createEl("input", {
        width: "100%",
        accentColor: p.accent,
        cursor: "pointer"
    });
    speedSlider.type = "range";
    speedSlider.min = "0.1";
    speedSlider.max = "3.0";
    speedSlider.step = "0.1";
    speedSlider.value = String(runtime.animationSpeed);

    speedSlider.addEventListener("pointerdown", () => {
        sliderActive = true;
        queuedSidebarRefresh = false;
    });
    speedSlider.addEventListener("input", (e) => {
        const val = Number(e.target.value);
        speedBadge.textContent = val.toFixed(1) + "x";
        setAnimationSpeed(val);
    });
    speedSlider.addEventListener("change", finishInteraction);
    speedSlider.addEventListener("blur", finishInteraction);
    speedCard.appendChild(speedSlider);

    const speedActions = createEl("div", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "8px"
    });
    speedActions.appendChild(createEl("div", {
        fontSize: "10px",
        color: "rgba(223,231,244,0.54)"
    }, "Adjust the base timeline playback speed."));

    const speedReset = createEl("button", {
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "999px",
        padding: "6px 10px",
        background: runtime.animationSpeed === 1.0 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.05)",
        color: runtime.animationSpeed === 1.0 ? "rgba(176,184,196,0.42)" : "rgba(248,251,255,0.88)",
        cursor: runtime.animationSpeed === 1.0 ? "default" : "pointer",
        fontSize: "10px"
    }, "Reset");
    speedReset.disabled = runtime.animationSpeed === 1.0;
    speedReset.addEventListener("click", () => setAnimationSpeed(1.0));
    speedActions.appendChild(speedReset);
    speedCard.appendChild(speedActions);

    section.appendChild(speedCard);

    return section;
}

function buildSidebarContent(container) {
    const previousScrollTop = container.scrollTop || 0;
    const runtime = resolveRuntimeConfig(getState());
    const pal = runtime.preset.palette;
    const activeMode = ANIMATION_MODES.find((item) => item.id === runtime.animationMode) || ANIMATION_MODES[0];
    const motionInspector = createInlineStateBlock(getMotionInspectorLines(runtime, activeMode));
    const polishInspector = createInlineStateBlock(getPolishInspectorLines(runtime));

    container.innerHTML = "";
    assignStyles(container, {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "16px 12px 24px",
        boxSizing: "border-box",
        height: "100%",
        overflowY: "auto",
        color: "#edf3ff",
        fontFamily: FONT_BODY,
        background: `radial-gradient(ellipse 100% 70% at 50% -5%, ${hexToRgba(pal.glow, 0.08)} 0%, transparent 52%), linear-gradient(180deg, #101522 0%, #0b0e14 100%)`
    });

    const masthead = createEl("div", {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "12px",
        padding: "2px 2px 0"
    });
    const titleWrap = createEl("div", {
        borderLeft: `3px solid ${pal.accent}`,
        paddingLeft: "10px"
    });
    titleWrap.appendChild(createEl("div", {
        fontFamily: FONT_DISPLAY,
        fontSize: "18px",
        fontWeight: "bold",
        lineHeight: "1",
        color: "#f7fbff"
    }, "LinkFX v2"));

    masthead.appendChild(titleWrap);
    masthead.appendChild(createEl("div", {
        flex: "0 0 auto",
        padding: "5px 8px",
        borderRadius: "999px",
        border: `1px solid ${hexToRgba(pal.glow, 0.28)}`,
        background: hexToRgba(pal.accent, 0.06),
        fontFamily: FONT_DISPLAY,
        fontSize: "9px",
        letterSpacing: "0.9px",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.8)"
    }, `${CINEMA_PRESETS.length} Presets`));
    container.appendChild(masthead);

    container.appendChild(createPresetHero(runtime));

    const motionSection = createSectionShell("Motion", null, pal);
    motionSection.appendChild(createChipGrid(
        ANIMATION_MODES,
        (item) => runtime.animationMode === item.id,
        (item) => setAnimationMode(item.id),
        () => runtime.preset.palette.secondary
    ));
    motionSection.appendChild(createChipGrid(
        PHYSICS_PROFILES,
        (item) => runtime.physicsProfileId === item.id,
        (item) => setPhysicsProfile(item.id),
        () => runtime.preset.palette.accent,
        () => !runtime.physicsEnabled
    ));

    const switchGrid = createEl("div", {
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "10px"
    });
    switchGrid.appendChild(createSwitchTile({
        title: "Physics",
        description: null,
        enabled: runtime.physicsEnabled,
        onToggle: () => setPhysicsEnabled(!runtime.physicsEnabled),
        accent: runtime.preset.palette.accent
    }));
    switchGrid.appendChild(createSwitchTile({
        title: "Echo",
        description: null,
        enabled: runtime.temporalEchoEnabled,
        onToggle: () => setTemporalEchoEnabled(!runtime.temporalEchoEnabled),
        accent: runtime.preset.palette.glow,
        disabled: !runtime.physicsEnabled
    }));
    motionSection.appendChild(switchGrid);
    container.appendChild(motionSection);

    const polishSection = createSectionShell("Polish", null, pal);
    polishSection.appendChild(createChipGrid(
        QUALITY_TIERS,
        (item) => runtime.qualityTierId === item.id,
        (item) => setQualityTier(item.id),
        () => runtime.preset.palette.glow
    ));
    polishSection.appendChild(createChipGrid(
        GRAPH_WEATHER,
        (item) => runtime.graphWeatherId === item.id,
        (item) => setGraphWeather(item.id),
        () => runtime.preset.palette.secondary
    ));

    container.appendChild(polishSection);

    container.appendChild(createColorSection(runtime));

    const presetSection = createSectionShell("Presets", null, pal);
    const presetGrid = createEl("div", {
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: "8px"
    });
    CINEMA_PRESETS.forEach((preset) => {
        presetGrid.appendChild(createPresetCard(preset, runtime.presetId === preset.id));
    });
    bindResponsivePresetGrid(container, presetGrid);
    presetSection.appendChild(presetGrid);
    container.appendChild(presetSection);

    const restoreScroll = () => {
        container.scrollTop = previousScrollTop;
    };
    restoreScroll();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(restoreScroll);
}

let legacyDialog = null;

function toggleLegacyDialog() {
    if (legacyDialog) {
        document.body.removeChild(legacyDialog);
        legacyDialog = null;
        if (activeContainer === legacyDialog?.content) {
            activeContainer = null;
        }
        return;
    }

    legacyDialog = document.createElement("div");
    legacyDialog.style.position = "fixed";
    legacyDialog.style.top = "50%";
    legacyDialog.style.left = "50%";
    legacyDialog.style.transform = "translate(-50%, -50%)";
    legacyDialog.style.width = "380px";
    legacyDialog.style.height = "75vh";
    legacyDialog.style.backgroundColor = "var(--p-surface-800, #11131a)";
    legacyDialog.style.border = "1px solid var(--p-surface-600, #333)";
    legacyDialog.style.borderRadius = "12px";
    legacyDialog.style.zIndex = "10000";
    legacyDialog.style.display = "flex";
    legacyDialog.style.flexDirection = "column";
    legacyDialog.style.boxShadow = "0 10px 40px rgba(0,0,0,0.6)";

    const header = document.createElement("div");
    header.style.padding = "14px 16px";
    header.style.borderBottom = "1px solid var(--p-surface-600, #333)";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.backgroundColor = "var(--p-surface-ground, #0c0d12)";
    header.style.borderTopLeftRadius = "12px";
    header.style.borderTopRightRadius = "12px";

    const title = document.createElement("div");
    title.innerHTML = "✨ Link FX";
    title.style.color = "white";
    title.style.fontWeight = "bold";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✖";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.color = "var(--p-text-muted-color, #888)";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "16px";
    closeBtn.onclick = toggleLegacyDialog;

    header.appendChild(title);
    header.appendChild(closeBtn);
    legacyDialog.appendChild(header);

    const content = document.createElement("div");
    content.style.flex = "1";
    content.style.overflowY = "auto";
    content.style.padding = "0";
    legacyDialog.content = content;

    legacyDialog.appendChild(content);
    document.body.appendChild(legacyDialog);

    activeContainer = content;
    buildSidebarContent(content);
}

function injectLegacyMenuButton() {
    const tryInject = () => {
        const menu = document.querySelector(".comfy-menu");
        if (!menu) {
            setTimeout(tryInject, 1000);
            return;
        }

        if (document.getElementById("linkfx-legacy-btn")) return;

        const btn = document.createElement("button");
        btn.id = "linkfx-legacy-btn";
        btn.textContent = "✨ Link FX";
        btn.onclick = toggleLegacyDialog;

        btn.style.width = "100%";
        btn.style.marginTop = "10px";
        btn.style.border = "1px solid var(--border-color, var(--p-surface-600, #444))";
        btn.style.background = "var(--comfy-menu-bg, var(--p-surface-800, #222))";
        btn.style.color = "var(--fg-color, var(--p-text-color, white))";
        btn.style.padding = "6px";
        btn.style.cursor = "pointer";
        btn.style.borderRadius = "4px";
        btn.style.fontSize = "14px";
        btn.style.fontWeight = "bold";

        menu.appendChild(btn);
    };
    tryInject();
}


export function registerSidebarTab(app) {
    if (!sidebarRegistered) {
        subscribe(() => {
            if (!activeContainer) return;
            if (sliderActive) {
                queuedSidebarRefresh = true;
                return;
            }
            buildSidebarContent(activeContainer);
        });
        sidebarRegistered = true;
    }

    injectLegacyMenuButton();

    const tryRegister = () => {
        if (!app?.extensionManager?.registerSidebarTab) {
            setTimeout(tryRegister, 200);
            return;
        }

        app.extensionManager.registerSidebarTab({
            id: SIDEBAR_TAB_ID,
            icon: "pi pi-sparkles",
            title: "Link FX",
            tooltip: "LinkFX v2",
            type: "custom",
            render(container) {
                activeContainer = container;
                buildSidebarContent(container);
            },
            destroy() {
                if (presetGridObserver) {
                    presetGridObserver.disconnect();
                    presetGridObserver = null;
                }
                activeContainer = null;
            }
        });
    };

    tryRegister();
}
