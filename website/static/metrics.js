// metrics.js — FIXED VERSION (matches BehaviourMetrics correctly)

window.METRICS = {
    reactionTimes: [],
    solveTimes: [],
    keyIntervals: [],
    mousePositions: [],
    clicks: [],
    hoverStart: null,
    hoverDwellTimes: [],
    backspaceCount: 0,
    focusEvents: 0,
    pauseIntervals: [],
    entryPoints: new Set(),
    pressureSamples: [],
    swipeAccel: [],

    startTime: null,
    lastKeyTime: null,
    lastMouseTime: null,
};


// ============ EVENT TRACKING =============

window.METRICS.start = () => {
    METRICS.startTime = performance.now();
};


// First interaction = reaction time
document.addEventListener("mousedown", () => {
    if (METRICS.reactionTimes.length === 0) {
        METRICS.reactionTimes.push(performance.now() - METRICS.startTime);
    }
});


// Keystroke timing (we ignore unrealistic values)
document.addEventListener("keydown", (e) => {
    const now = performance.now();

    if (METRICS.lastKeyTime) {
        let delta = now - METRICS.lastKeyTime;

        if (delta > 20 && delta < 800) {    // Ignore 0ms & insane 2s gaps
            METRICS.keyIntervals.push(delta);
            if (delta > 80) METRICS.pauseIntervals.push(delta);
        }
    }

    METRICS.lastKeyTime = now;

    if (e.key === "Backspace") METRICS.backspaceCount++;
});


// Mouse movement tracking
document.addEventListener("mousemove", (e) => {
    const now = performance.now();
    METRICS.mousePositions.push({ x: e.clientX, y: e.clientY, t: now });

    // FIX: entry points = ±30px from edges (not exactly 0px)
    if (
        e.clientX < 30 || e.clientX > window.innerWidth - 30 ||
        e.clientY < 30 || e.clientY > window.innerHeight - 30
    ) {
        METRICS.entryPoints.add(`${e.clientX},${e.clientY}`);
    }
});


// Hover / dwell detection
document.addEventListener("mouseover", (e) => {
    METRICS.hoverStart = performance.now();
});

document.addEventListener("mouseout", (e) => {
    if (METRICS.hoverStart) {
        let dwell = performance.now() - METRICS.hoverStart;
        if (dwell > 20 && dwell < 2000) {
            METRICS.hoverDwellTimes.push(dwell);
        }
    }
});


// Click offsets (FIXED)
document.addEventListener("click", (e) => {
    METRICS.clicks.push({
        x: e.clientX,
        y: e.clientY,
        t: performance.now()
    });
});


// Focus changes
window.addEventListener("blur", () => METRICS.focusEvents++);
window.addEventListener("focus", () => METRICS.focusEvents++);


// ============ COMPUTATION HELPERS =============

function computeStd(arr) {
    if (!arr || arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance =
        arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
}


// FIX: normalized directional entropy (0–1)
function computePathEntropy() {
    if (METRICS.mousePositions.length < 3) return 0;

    const angles = [];

    for (let i = 1; i < METRICS.mousePositions.length; i++) {
        const a = METRICS.mousePositions[i];
        const b = METRICS.mousePositions[i - 1];

        let dx = a.x - b.x;
        let dy = a.y - b.y;

        let angle = Math.atan2(dy, dx);
        angles.push(angle);
    }

    const bins = {};
    angles.forEach(a => {
        const bucket = Math.round(a * 10) / 10;
        bins[bucket] = (bins[bucket] || 0) + 1;
    });

    const total = angles.length;
    let entropy = 0;

    for (let count of Object.values(bins)) {
        let p = count / total;
        entropy -= p * Math.log2(p);
    }

    // Normalize entropy
    return entropy / 5;   // typical range 0–1
}


// FIX: velocity clamp
function computeVelocityStd() {
    const velocities = [];
    for (let i = 1; i < METRICS.mousePositions.length; i++) {
        const a = METRICS.mousePositions[i];
        const b = METRICS.mousePositions[i - 1];

        let dt = (a.t - b.t) / 1000;
        if (dt < 0.01) dt = 0.01;   // prevent insane speeds

        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        velocities.push(dist / dt);
    }
    return computeStd(velocities);
}


// FIX: proper click offset (distance between successive clicks)
function computeClickOffset() {
    if (METRICS.clicks.length < 2) return 5; // small neutral offset

    let offsets = [];

    for (let i = 1; i < METRICS.clicks.length; i++) {
        const a = METRICS.clicks[i];
        const b = METRICS.clicks[i - 1];
        offsets.push(Math.hypot(a.x - b.x, a.y - b.y));
    }

    return offsets.reduce((a, b) => a + b, 0) / offsets.length;
}


// ============ FINAL METRIC EXPORT =============

window.collectFinalMetrics = () => {
    const now = performance.now();
    METRICS.solveTimes.push(now - METRICS.startTime);

    const hoverAvg =
        METRICS.hoverDwellTimes.length
            ? METRICS.hoverDwellTimes.reduce((a, b) => a + b, 0) /
              METRICS.hoverDwellTimes.length
            : 150; // neutral typical human dwell

    return {
        reaction_time_mean_ms: METRICS.reactionTimes[0] || 500,

        solve_time_std_ms: computeStd(METRICS.solveTimes),

        interkey_interval_std_ms: computeStd(METRICS.keyIntervals),

        path_entropy: computePathEntropy(),

        velocity_std_px_per_s: computeVelocityStd(),

        click_offset_avg_px: computeClickOffset(),

        hover_dwell_avg_ms: hoverAvg,

        backspace_count: METRICS.backspaceCount,

        solve_entropy: computeStd(METRICS.solveTimes),

        entry_points_unique: METRICS.entryPoints.size,

        focus_change_events: METRICS.focusEvents,

        swipe_accel_var: 0,

        pause_variance_ms: computeStd(METRICS.pauseIntervals),

        pressure_std: 0,

        fingerprint_entropy: 1,

        overall_variance_score: computeStd(METRICS.solveTimes),
    };
};
