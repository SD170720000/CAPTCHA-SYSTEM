console.log("METRICS.JS LOADED");

// ============================================================
// GLOBAL METRICS FINAL STRUCTURE
// ============================================================
window.CAPTCHA_METRICS = {
    challenge_start: null,
    challenge_end: null,

    mouse_path: [],        // {x,y,t}
    total_clicks: 0,
    click_positions: [],   // {x,y,t}

    keypresses: [],        // {key,t}

    window_focus_events: [],  // {type:"blur/focus", t}

    idle_time_total: 0,
    last_interaction: Date.now(),

    spawns: [],            // {spawn_id,letter,x,y,spawn_t}
    picked_letters: [],    // {letter,spawn_id,t,x,y,reaction}
    missed_letters: []     // {letter,spawn_id,spawn_t}
};

let SPAWN_COUNTER = 0;


// ============================================================
// MOUSE MOVEMENT TRACKING
// ============================================================
document.addEventListener("mousemove", (e) => {
    window.CAPTCHA_METRICS.mouse_path.push({
        x: e.clientX,
        y: e.clientY,
        t: Date.now()
    });
    window.CAPTCHA_METRICS.last_interaction = Date.now();
});


// ============================================================
// CLICK TRACKING
// ============================================================
document.addEventListener("click", (e) => {
    window.CAPTCHA_METRICS.total_clicks++;
    window.CAPTCHA_METRICS.click_positions.push({
        x: e.clientX,
        y: e.clientY,
        t: Date.now()
    });
    window.CAPTCHA_METRICS.last_interaction = Date.now();
});


// ============================================================
// KEYPRESS TRACKING
// ============================================================
document.addEventListener("keydown", (e) => {
    window.CAPTCHA_METRICS.keypresses.push({
        key: e.key,
        t: Date.now()
    });
    window.CAPTCHA_METRICS.last_interaction = Date.now();
});


// ============================================================
// WINDOW FOCUS/BLUR EVENTS
// ============================================================
window.addEventListener("blur", () => {
    window.CAPTCHA_METRICS.window_focus_events.push({
        type: "blur",
        t: Date.now()
    });
});
window.addEventListener("focus", () => {
    window.CAPTCHA_METRICS.window_focus_events.push({
        type: "focus",
        t: Date.now()
    });
});


// ============================================================
// IDLE TIME TRACKER (idle if no interaction for > 5s)
// ============================================================
setInterval(() => {
    const now = Date.now();
    if (now - window.CAPTCHA_METRICS.last_interaction > 5000) {
        window.CAPTCHA_METRICS.idle_time_total += 1; // per second
    }
}, 1000);


// ============================================================
// HOOK: START OF CHALLENGE
// ============================================================
window.METRICS_startChallenge = function () {
    window.CAPTCHA_METRICS.challenge_start = Date.now();
};


// ============================================================
// HOOK: LETTER SPAWN
// ============================================================
window.METRICS_letterSpawn = function (letter, x, y) {
    SPAWN_COUNTER++;

    window.CAPTCHA_METRICS.spawns.push({
        spawn_id: SPAWN_COUNTER,
        letter,
        x,
        y,
        spawn_t: Date.now()
    });

    return SPAWN_COUNTER;
};


// ============================================================
// HOOK: LETTER CLICK
// ============================================================
window.METRICS_letterClick = function (letter, spawn_id, clickX, clickY) {

    const spawn = window.CAPTCHA_METRICS.spawns.find(s => s.spawn_id == spawn_id);
    const reaction = spawn ? Date.now() - spawn.spawn_t : null;

    window.CAPTCHA_METRICS.picked_letters.push({
        letter,
        spawn_id,
        click_x: clickX,
        click_y: clickY,
        t: Date.now(),
        reaction
    });
};


// ============================================================
// HOOK: MISSED LETTER
// ============================================================
window.METRICS_letterMiss = function (letter, spawn_id) {

    window.CAPTCHA_METRICS.missed_letters.push({
        letter,
        spawn_id,
        spawn_t: Date.now()
    });
};

// ============================================================
// ENVIRONMENT METRICS (DEVICE + HARDWARE FINGERPRINT)
// ============================================================
window.CAPTCHA_METRICS.environment = {
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    device_pixel_ratio: window.devicePixelRatio || null,
    hardware_concurrency: navigator.hardwareConcurrency || null,
    max_touch_points: navigator.maxTouchPoints || 0,
    user_agent: navigator.userAgent || "",
};

// ============================================================
// HOOK: END OF CHALLENGE
// ============================================================
window.METRICS_endChallenge = function () {
    window.CAPTCHA_METRICS.challenge_end = Date.now();
};


// ============================================================
// EXPORT METRICS FOR BACKEND
// ============================================================
window.METRICS_export = function () {
    return JSON.parse(JSON.stringify(window.CAPTCHA_METRICS));
};
