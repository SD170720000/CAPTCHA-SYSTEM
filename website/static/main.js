console.log("MAIN JS LOADED");

let sessionId = null;

window.spawnInterval = null;
window.timerInterval = null;
window.__PERFORM_NEXT_ATTEMPT__ = false;
window.__CAPTCHA_COMPLETED__ = false;

//#############################################################
// START SESSION
//#############################################################
document.getElementById("start-btn").onclick = async () => {
    const res = await fetch("/start_session", { method: "POST" });
    const data = await res.json();

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

    const s = document.createElement("script");
    s.src = "/static/captchas/0/script.js";
    s.onload = () => {
        if (typeof window.initCaptcha0 === "function") {
            window.initCaptcha0({
                onPassed: () => loadCaptcha1()
            });
        }
    };
    container.appendChild(s);
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
            user_answer: userAnswer
        })
    });

    const data = await res.json();

    if (data.status === "passed") {
        window.__CAPTCHA_COMPLETED__ = true;

        if (window.showSuccessUI)
            window.showSuccessUI(data);

        return;
    } else if (data.status === "failed") {
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

    container.innerHTML = `
        <div style="text-align:center; padding:30px 0;">
            <h2 style="color:green;">Successfull Attempt!</h2>
            <p style="color:${data.behaviour.is_human ? "green" : "var(--c7)"};">
                ${data.behaviour.is_human ? "Human Detected!" : "Bot Detected!"}
                (score: ${data.behaviour.score})
            </p>
            <button id="resolve-btn" class="final-btn">Resolve Captcha</button>
        </div>
    `;

    document.getElementById("resolve-btn").onclick = () => location.reload();
}
