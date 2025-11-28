console.log("MAIN JS LOADED");

let sessionId = null;

window.spawnInterval = null;
window.timerInterval = null;
window.__PERFORM_NEXT_ATTEMPT__ = false;
window.__CAPTCHA_COMPLETED__ = false;

//#############################################################
// METRICS (minimal: mouse moves/clicks/time/result per phase)
//#############################################################
const metrics = {
    startedAt: Date.now(),
    device: collectDeviceFingerprint(),
    sessionId: null,
    currentStep: "intro",
    lastEventTs: null,
    intro: {
        mouse_moves: 0,
        clicks: 0,
        startedAt: Date.now(),
        endedAt: null,
        mouse_path: [],
        normal_clicks: [],
        bubble_clicks: [],
        idle_segments: [],
        captcha_canvas_hover_time: 0,
        submit_button_hover_time: 0,
        bubble_area_hover_time: 0
    },
    captcha0: {
        mouse_moves: 0,
        clicks: 0,
        startedAt: null,
        endedAt: null,
        result: null,
        time_taken_ms: null,
        mouse_path: [],
        normal_clicks: [],
        bubble_clicks: [],
        idle_segments: [],
        captcha_canvas_hover_time: 0,
        submit_button_hover_time: 0,
        bubble_area_hover_time: 0
    },
    captcha1_attempts: []
};

window.__metrics__ = metrics;

function collectDeviceFingerprint() {
    const nav = navigator || {};
    return {
        userAgent: nav.userAgent || "",
        platform: nav.platform || "",
        language: nav.language || "",
        hardwareConcurrency: nav.hardwareConcurrency || null,
        vendor: nav.vendor || "",
        devicePixelRatio: window.devicePixelRatio || 1,
        screenX: typeof window.screenX !== "undefined" ? window.screenX : (window.screenLeft || 0),
        screenY: typeof window.screenY !== "undefined" ? window.screenY : (window.screenTop || 0),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight
    };
}

function setCurrentStep(stepName) {
    metrics.currentStep = stepName;
    const now = Date.now();
    if (stepName === "captcha0") {
        if (!metrics.captcha0.startedAt) metrics.captcha0.startedAt = now;
    } else if (stepName === "captcha1") {
        // ensure current attempt exists
        if (!metrics.captcha1_attempts.length) {
            metrics.captcha1_attempts.push({
                attempt: window.__CURRENT_ATTEMPT__ || 1,
                mouse_moves: 0,
                clicks: 0,
                startedAt: now,
                endedAt: null,
                result: null,
                time_taken_ms: null,
                mouse_path: [],
                normal_clicks: [],
                bubble_clicks: [],
                idle_segments: [],
                captcha_canvas_hover_time: 0,
                submit_button_hover_time: 0,
                bubble_area_hover_time: 0
            });
        } else {
            const last = metrics.captcha1_attempts[metrics.captcha1_attempts.length - 1];
            if (!last.startedAt) last.startedAt = now;
        }
    } else {
        if (!metrics.intro.startedAt) metrics.intro.startedAt = now;
    }
}

function getActiveBucket() {
    if (metrics.currentStep === "captcha0") return metrics.captcha0;
    if (metrics.currentStep === "captcha1") {
        if (!metrics.captcha1_attempts.length) {
            setCurrentStep("captcha1");
        }
        return metrics.captcha1_attempts[metrics.captcha1_attempts.length - 1];
    }
    return metrics.intro;
}

const IDLE_THRESHOLD_MS = 1500;

function noteIdleSegments(nowTs) {
    if (metrics.lastEventTs && nowTs - metrics.lastEventTs > IDLE_THRESHOLD_MS) {
        const bucket = getActiveBucket();
        const duration = nowTs - metrics.lastEventTs;
        bucket.idle_segments.push({
            stime: metrics.lastEventTs,
            etime: nowTs,
            duration
        });
    }
    metrics.lastEventTs = nowTs;
}

function recordMove(ev) {
    const bucket = getActiveBucket();
    const now = Date.now();
    noteIdleSegments(now);
    bucket.mouse_moves += 1;
    if (bucket.mouse_path.length < 500) {
        bucket.mouse_path.push({ x: ev.clientX, y: ev.clientY, t: now });
    }
}

function recordClick(ev) {
    const bucket = getActiveBucket();
    const now = Date.now();
    noteIdleSegments(now);
    bucket.clicks += 1;
    if (bucket.normal_clicks.length < 200) {
        bucket.normal_clicks.push({ x: ev.clientX, y: ev.clientY, t: now });
    }
}

function markResult(stepName, result) {
    const now = Date.now();
    if (stepName === "captcha0") {
        metrics.captcha0.result = result;
        metrics.captcha0.endedAt = now;
        metrics.captcha0.time_taken_ms = metrics.captcha0.startedAt ? now - metrics.captcha0.startedAt : null;
    }
    if (stepName === "captcha1" && metrics.captcha1_attempts.length) {
        const last = metrics.captcha1_attempts[metrics.captcha1_attempts.length - 1];
        last.result = result;
        last.endedAt = now;
        last.time_taken_ms = last.startedAt ? now - last.startedAt : null;
    }
}

window.addEventListener("pointermove", (e) => recordMove(e), { passive: true });
window.addEventListener("click", (e) => recordClick(e), { passive: true });

function wireHoverTracking(el, fieldName) {
    if (!el || el.dataset.hoverTrackBound === "1") return;
    el.dataset.hoverTrackBound = "1";
    let start = null;
    el.addEventListener("pointerenter", () => { start = Date.now(); }, { passive: true });
    el.addEventListener("pointerleave", () => {
        if (!start) return;
        const now = Date.now();
        const bucket = getActiveBucket();
        bucket[fieldName] = (bucket[fieldName] || 0) + (now - start);
        start = null;
    }, { passive: true });
}

function buildTelemetryPayload(finalStatus) {
    return {
        sessionId: metrics.sessionId,
        device: metrics.device,
        intro: metrics.intro,
        captcha0: metrics.captcha0,
        captcha1_attempts: metrics.captcha1_attempts,
        finalStatus,
        collectedAt: Date.now()
    };
}

//#############################################################
// START SESSION
//#############################################################
document.getElementById("start-btn").onclick = async () => {
    const res = await fetch("/start_session", { method: "POST" });
    const data = await res.json();

    metrics.sessionId = data.session_id || null;
    document.getElementById("start-btn").style.display = "none";
    document.getElementById("main-desc").style.display = "none";
    document.getElementById("captcha-section").style.display = "block";

    if(data.error === "locked"){
        remaining = data.retry_after_seconds;
        const container = document.getElementById("captcha-section");
        container.style.display = "block";
        container.innerHTML = `
        <div style="text-align:center; padding:30px 0;">
            <h2 style="color:var(--c7);">Locked !!!</h2>
            <p style="color: var(--c2)">You have exhausted your attempts</p>
            <p style="color: var(--c2)">Please retry after sometime.<br>
            <p style="color: var(--c2)">Remaining Time:
                <span id="remaining-counter" style="color: var(--c3)"> ${remaining}s</span></p>
        </div>
        `;
        const t = setInterval(() => {
            remaining--;

            const remaining_timer_text = document.getElementById("remaining-counter");
            remaining_timer_text.innerText = `${remaining}s`;

            if(remaining <= 0){
                clearInterval(t);
                location.reload();
            }
            return
        }, 1000);

    } else {
        sessionId = data.session_id;
        window.sessionId = sessionId;
        setCurrentStep("captcha0");

        await loadCaptcha0();
    }

};

//#############################################################
// LOAD CAPTCHA-0 (pre-check)
//#############################################################
async function loadCaptcha0() {
    if (window.__CLEANUP__) window.__CLEANUP__();

    const step = document.getElementById("step-label");
    const btn = document.getElementById("final-verify-btn");
    setCurrentStep("captcha0");
    if (step) step.innerText = "Step 1/2 — Statement verification";
    if (btn) {
        btn.disabled = true;
        btn.style.display = "none";
        btn.onclick = null;
    }

    const container = document.getElementById("captcha-container");
    container.innerHTML = "";

    const html = await fetch("/load_captcha/0").then(r => r.text());
    container.innerHTML = html;
    wireHoverTracking(document.getElementById("syco-img"), "captcha_canvas_hover_time");
    wireHoverTracking(document.getElementById("final-verify-btn"), "submit_button_hover_time");
    wireHoverTracking(document.querySelector(".choice-row"), "bubble_area_hover_time");

    const s = document.createElement("script");
    s.src = "/static/captchas/0/script.js";
    s.onload = () => {
        if (typeof window.initCaptcha0 === "function") {
            window.initCaptcha0({
                onPassed: () => evaluateCaptcha0Decision(),
            });
        }
    };
    container.appendChild(s);

}

// Decide whether to skip captcha-1 based on captcha-0 solve time.
async function evaluateCaptcha0Decision() {
    const computedTime = metrics.captcha0.time_taken_ms ??
        ((metrics.captcha0.startedAt && metrics.captcha0.endedAt)
            ? metrics.captcha0.endedAt - metrics.captcha0.startedAt
            : null);

    // If we cannot compute, fall back to captcha-1.
    if (computedTime == null) {
        console.log("No compute Time")
        return loadCaptcha1();
    }

    try {
        const res = await fetch("/evaluate_captcha0", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId,
                total_solve_time_ms: computedTime,
                status: window.__CAPTCHA0_STATUS__.passed
            })
        });
        const data = await res.json();


        if (data.require_captcha1) {
            return loadCaptcha1();
        }

        // Mark as completed and show success UI without captcha-1.
        window.__CAPTCHA_COMPLETED__ = true;
        markResult("captcha0", "passed");
    
        const container = document.getElementById("captcha-container");
        const btn = document.getElementById("final-verify-btn");
            if (btn) btn.disabled = true;
            container.innerHTML = `
                <div style="text-align:center; padding:30px 0;">
                    <h2 style="color:green;">Human verified!</h2>
                    <button id="resolve-btn" class="final-btn">Finish</button>
                </div>
            `;
            console.log("Captcha-1 skipped because of behaviour")

            const resolveBtn = document.getElementById("resolve-btn");
            if (resolveBtn) resolveBtn.onclick = () => location.reload();
        } catch (e) {
            console.error("evaluate_captcha0 failed, continuing to captcha-1", e);
            return loadCaptcha1();
        }
}
//#############################################################
// LOAD CAPTCHA FRAME
//#############################################################
async function loadCaptcha1() {
    if (window.__CLEANUP__) window.__CLEANUP__();

    const attemptInit = await fetch(
        `/get_challenge/1?session_id=${encodeURIComponent(sessionId)}`
    );
    const attemptData = await attemptInit.json();

    if (attemptData.error) {
        console.error("get_challenge error:", attemptData);
        return;
    }

    // new attempt metrics bucket
    metrics.captcha1_attempts.push({
        attempt: attemptData.attempt,
        mouse_moves: 0,
        clicks: 0,
        startedAt: Date.now(),
        endedAt: null,
        result: null,
        time_taken_ms: null,
        mouse_path: [],
        bubble_clicks: [],
        idle_segments: [],
        captcha_canvas_hover_time: 0,
        submit_button_hover_time: 0,
        bubble_area_hover_time: 0
    });
    setCurrentStep("captcha1");
    loadAttemptUI(attemptData.attempt);

    window.__CURRENT_ATTEMPT__ = attemptData.attempt;

    const container = document.getElementById("captcha-container");
    container.innerHTML = "";

    const btn = document.getElementById("final-verify-btn");
    if (btn) {
        btn.disabled = true;
        btn.style.display = "block";
        btn.innerText = "Verify";
        btn.onclick = () => sendVerify(null);
    }

    const html = await fetch("/load_captcha/1").then(r => r.text());
    container.innerHTML = html;
    wireHoverTracking(document.getElementById("captcha-canvas"), "captcha_canvas_hover_time");
    wireHoverTracking(document.getElementById("final-verify-btn"), "submit_button_hover_time");
    wireHoverTracking(document.getElementById("fall-container"), "bubble_area_hover_time");

    const s = document.createElement("script");
    s.src = "/static/captchas/1/script.js";
    s.onload = () => {
        if (typeof window.initCaptcha1 === "function") window.initCaptcha1();
    };
    container.appendChild(s);
}

// keep legacy name for captcha-1 script callbacks
async function loadCaptcha() {
    return loadCaptcha1();
}

//#############################################################
// ATTEMPT LABEL
//#############################################################
function loadAttemptUI(attempt) {
    const step = document.getElementById("step-label");
    const btn = document.getElementById("final-verify-btn");

    step.innerText = `Step 2/2 — Attempt ${attempt}/3`;
    btn.disabled = true;
}

//#############################################################
// VERIFY HANDLER
//#############################################################
async function sendVerify(statusOverride = null) {
    const userAnswer = window.userCollectedAnswer || "";
    const correctWord = window.correctWord || "";
    let status = statusOverride;

    if (!status) {
        try {
            const captchaRes = await window.verifyCaptcha1();
            status = captchaRes.status || "failed";
        } catch {
            status = "failed";
        }
    }

    const attemptNumber = window.__CURRENT_ATTEMPT__ || 1;

    const res = await fetch(`/verify/1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            session_id: sessionId,
            status: status,
            user_answer: userAnswer,
            telemetry: buildTelemetryPayload(status)
        })
    });

    const data = await res.json();

    if (data.status === "passed") {
        window.__CAPTCHA_COMPLETED__ = true;
        markResult("captcha1", "passed");

        if (window.showSuccessUI)
            window.showSuccessUI(data);

        return;
    } else if (data.status === "failed") {
        markResult("captcha1", "failed");
        if (window.timerInterval) clearInterval(window.timerInterval);
        const container = document.getElementById("captcha-container");
        document.getElementById("final-verify-btn").disabled = true;

        const attempt_val = (3-data.next_attempt)+1
        container.innerHTML = `
        <div style="text-align:center; padding:30px 0;">
            <h2 style="color:var(--c7);">Failed Attempt !!!</h2>
            <p style="color: var(--c2)">You have ${attempt_val} attemp${attempt_val>1?"s":""} left</p>
            <button id="retry-btn" class="final-btn">Retry</button>
        </div>
        `;
        document.getElementById("retry-btn").onclick = () => loadCaptcha1();
    }

    if (!data.completed && data.next_attempt) {
        window.__PERFORM_NEXT_ATTEMPT__ = true;
        return;
    }

    if (data.completed) {
        window.__CAPTCHA_COMPLETED__ = true;
        window.__PERFORM_NEXT_ATTEMPT__ = false;

        const container = document.getElementById("captcha-container");
        document.getElementById("final-verify-btn").disabled = true;
        container.innerHTML = `
        <div style="text-align:center; padding:30px 0;">
            <h2 style="color:var(--c7);">Attempts Exhausted !!!</h2>
            <p style="color: var(--c2)">You have used all your attempts</p>
            <p style="color: var(--c2)">Please retry after 15 mins</p>
        </div>
        `;
    }
}

//#############################################################
// SUCCESS UI
//#############################################################
function showSuccessUI(data) {
    if (window.spawnInterval) clearInterval(window.spawnInterval);
    if (window.timerInterval) clearInterval(window.timerInterval);

    window.spawnInterval = null;
    window.timerInterval = null;

    const container = document.getElementById("captcha-container");
    document.getElementById("final-verify-btn").disabled = true;

    const behaviour = data|| {};
    const isHuman = behaviour.is_human;
    const score = typeof behaviour.score !== "undefined" ? behaviour.score : "n/a";

    container.innerHTML = `
        <div style="text-align:center; padding:30px 0;">
            <h2 style="color:green;">Successfull Attempt!</h2>
            <p style="color:${isHuman ? "green" : "var(--c7)"};">
                ${isHuman ? "Human Detected!" : "Bot Detected!"}
            </p>
            <button id="resolve-btn" class="final-btn">Resolve Captcha</button>
        </div>
    `;

    document.getElementById("resolve-btn").onclick = () => location.reload();
}
