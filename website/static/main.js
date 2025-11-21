console.log("MAIN JS LOADED");

let sessionId = null;

// START SESSION
document.getElementById("start-btn").onclick = async () => {
    const res = await fetch("/start_session", { method: "POST" });
    const data = await res.json();
    sessionId = data.session_id;
    window.sessionId = sessionId;

    document.getElementById("start-btn").style.display = "none";
    document.getElementById("captcha-section").style.display = "block";

    await loadCaptcha();
};

// LOAD CAPTCHA FRAME (load script then call initCaptcha1)
async function loadCaptcha() {
    if (window.__CLEANUP__) window.__CLEANUP__();

    // tell backend to init attempt slot
    const attemptInit = await fetch(`/get_challenge/1?session_id=${encodeURIComponent(sessionId)}`);
    const attemptData = await attemptInit.json();
    if (attemptData.error) {
        console.error("get_challenge error:", attemptData);
        return;
    }

    loadAttemptUI(attemptData.attempt);

    const container = document.getElementById("captcha-container");
    container.innerHTML = "";

    const html = await fetch("/load_captcha/1").then(r => r.text());
    container.innerHTML = html;

    // callbacks
    window.onUserFilledProgress = () => {
        const btn = document.getElementById("final-verify-btn");
        if (btn) btn.disabled = false;
    };

    window.onTimeout = () => {
        // send timeout status to backend
        sendVerify("timeout");
    };

    // append script and init when loaded
    const s = document.createElement("script");
    s.src = "/static/captchas/1/script.js";
    s.onload = () => {
        if (typeof window.initCaptcha1 === "function") {
            window.initCaptcha1();
        }
    };
    container.appendChild(s);
}

// ATTEMPT LABEL
function loadAttemptUI(attempt) {
    const step = document.getElementById("step-label");
    const btn = document.getElementById("final-verify-btn");

    // Attempt 1 → hide the label
    if (attempt === 1) {
        if (step) step.innerText = "";
        if (btn) btn.disabled = true;
        return;
    }

    // Attempts 2 and 3 → show the label
    if (step) step.innerText = `Attempt ${attempt}/3`;
    if (btn) btn.disabled = true;
}


// CENTRAL SEND VERIFY
async function sendVerify(statusOverride = null) {
    const userAnswer = window.userCollectedAnswer || "";
    const correctWord = window.correctWord || "";

    window.METRICS_endChallenge();

    let status = statusOverride;
    if (!status) {
        // call captcha API verify
        let captchaRes = { status: "failed" };
        try {
            if (typeof window.verifyCaptcha1 === "function") captchaRes = await window.verifyCaptcha1();
        } catch (e) {
            console.error("captcha verify error", e);
            captchaRes = { status: "failed" };
        }
        status = captchaRes.status || "failed";
    }

    // send to api to delete challenge id (need to implement later)

    
    const res = await fetch(`/verify/1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        session_id: sessionId,
        user_answer: userAnswer,
        correct_word: correctWord,
        metrics: window.METRICS_export(),
        status: status
        })

    });

    const data = await res.json();

    if (data.status === "passed") {
        if (typeof window.showSuccessUI === "function") window.showSuccessUI();
        return;
    }

    if (!data.completed && data.next_attempt) {
        setTimeout(() => loadCaptcha(), 200);
        return;
    }

    if (data.completed) {
        showResolveButton();
    }
}

// VERIFY BUTTON
const verifyBtn = document.getElementById("final-verify-btn");
if (verifyBtn) verifyBtn.onclick = () => sendVerify(null);

// RESOLVE UI
function showResolveButton() {
  const container = document.getElementById("captcha-container");
  const btn = document.getElementById("final-verify-btn");
  if (btn) btn.disabled = true;

  container.innerHTML = `
    <h2 style="color:red;">Verification Failed</h2>
    <p>You used all attempts.</p>
    <button id="resolve-btn" class="final-btn">Resolve</button>
  `;

  const resolve = document.getElementById("resolve-btn");
  if (resolve) resolve.onclick = () => resolveCaptcha();
}
