// ===========================================================
// CAPTCHA-1 SCRIPT (SAFE FROM DUPLICATE LOADING)
// ===========================================================
if (!window.__CAPTCHA1_LOADED__) {
  window.__CAPTCHA1_LOADED__ = true;

  console.log("CAPTCHA-1 LOADED SAFELY");

  const COUNTDOWN = 20;
  const CAPTCHA1_API = "http://localhost:5055";

  let challengeId = null;
  let correctWord = "";
  let userCollected = "";
  let spawnInterval = null;
  let timerInterval = null;
  let countdown = COUNTDOWN;

  // CLEANUP (called every time captcha reloads)
  window.__CLEANUP__ = function () {
    console.log("CLEANUP RUNNING…");
    if (spawnInterval) clearInterval(spawnInterval);
    if (timerInterval) clearInterval(timerInterval);
    spawnInterval = null;
    timerInterval = null;
    userCollected = "";
    window.userCollectedAnswer = "";
  };

  // INIT CAPTCHA
  async function initCaptcha1() {
    console.log("INIT CAPTCHA-1 RUNNING…");

    const res = await fetch(`${CAPTCHA1_API}/get_challenge?sessionId=${encodeURIComponent(window.sessionId)}`);
    const data = await res.json();

    if (!data || !data.challengeId || !data.word) {
      console.error("Invalid challenge data:", data);
      return;
    }

    challengeId = data.challengeId;
    correctWord = data.word;

    window.challengeId = challengeId;
    window.correctWord = correctWord;
    window.userCollectedAnswer = "";

    userCollected = "";

    // UI elements
    const targetWordEl = document.getElementById("target-word");
    const progressEl = document.getElementById("progress");
    const timerEl = document.getElementById("timer-text");
    const timerBarEl = document.getElementById("timer-bar");
    const box = document.getElementById("fall-container");

    if (targetWordEl) targetWordEl.innerText = correctWord;
    if (progressEl) progressEl.innerText = "_ _ _ _";
    if (timerEl) timerEl.innerText = COUNTDOWN + "s";
    if (timerBarEl) timerBarEl.style.width = "100%";
    if (box) box.innerHTML = "";

    // Start falling letters
    spawnInterval = setInterval(spawnLetter, 500);

    // Start timer
    countdown = COUNTDOWN;
    timerInterval = setInterval(() => {
        countdown--;
        if (timerEl) timerEl.innerText = `${countdown}s`;
        if (timerBarEl) timerBarEl.style.width = `${(countdown / COUNTDOWN) * 100}%`;

        if (countdown <= 0) {
            clearInterval(spawnInterval);
            clearInterval(timerInterval);
            spawnInterval = null;
            timerInterval = null;
            if (typeof window.onTimeout === "function") window.onTimeout();
        }
    }, 1000);
}

// SPAWN LETTERS (use big pool so animation is visible)
function spawnLetter() {
    const box = document.getElementById("fall-container");
    if (!box) return;

    // restored noise pool so there are plenty of falling bubbles
    const pool = correctWord;
    const letter = pool[Math.floor(Math.random() * pool.length)] || "A";

    const el = document.createElement("div");
    el.classList.add("falling-letter");
    el.innerText = letter;

    const w = box.offsetWidth || 300;
    const h = box.offsetHeight || 200;

    let startX = 0, startY = 0, dx = 0, dy = 2;
    const dir = Math.floor(Math.random() * 4);

    switch (dir) {
      case 0: startX = Math.random() * (w - 40); startY = -40; dx = 0; dy = 3 + Math.random() * 2; break;
      case 1: startX = Math.random() * (w - 40); startY = h + 40; dx = 0; dy = -(3 + Math.random() * 2); break;
      case 2: startX = -40; startY = Math.random() * (h - 40); dx = 3 + Math.random() * 2; dy = 0; break;
      case 3: startX = w + 40; startY = Math.random() * (h - 40); dx = -(3 + Math.random() * 2); dy = 0; break;
    }

    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    el.onclick = () => pickLetter(el, letter);

    box.appendChild(el);
    fall(el, dx, dy, w, h);
}

// FALL ANIMATION
function fall(el, dx, dy, w, h) {
    let x = parseFloat(el.style.left) || 0;
    let y = parseFloat(el.style.top) || 0;

    const t = setInterval(() => {
    x += dx;
    y += dy;
    el.style.left = x + "px";
    el.style.top = y + "px";
    if (x < -60 || x > w + 60 || y < -60 || y > h + 60) {
        try { el.remove(); } catch (e) {}
            clearInterval(t);
        }
    }, 20);
}

// PICK LETTER
function pickLetter(el, letter) {
    try { el.remove(); } catch (e) {}
    if (userCollected.length >= 4) return;
    userCollected += letter;
    window.userCollectedAnswer = userCollected;
    updateProgress();
    if (userCollected.length === 4) {
        if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        if (typeof window.onUserFilledProgress === "function") window.onUserFilledProgress();
    }
}

  // UPDATE PROGRESS UI
function updateProgress() {
    const p = document.getElementById("progress");
    if (!p) return;
    p.innerText = userCollected.padEnd(4, "_").split("").join(" ");
}

// VERIFY CAPTCHA API
async function verifyCaptcha1() {
    if (!challengeId) return { status: "failed" };
    try {
        const res = await fetch(`${CAPTCHA1_API}/verify`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ challengeId: challengeId, answer: userCollected })
        });
        return await res.json();
    } catch (e) {
        console.error("verifyCaptcha1 error", e);
        return { status: "failed" };
    }
}

  // HIDE TIMER UI
function hideTimerUI() {
    const tw = document.getElementById("timer-wrapper");
    if (tw) tw.style.display = "none";
}

  // SHOW SUCCESS UI (called by main when backend says passed)
function showSuccessUI() {
    console.log("Showing SUCCESS UI…");
    // stop intervals
    if (spawnInterval) { clearInterval(spawnInterval); spawnInterval = null; }
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    hideTimerUI();

    const container = document.getElementById("captcha-container");
    const btn = document.getElementById("final-verify-btn");
    if (btn) btn.disabled = true;
    if (container) {
        container.innerHTML = `
            <div style="text-align:center; padding:30px 0;">
                <h2 style="color:green; margin:0 0 12px 0;">Success!</h2>
                <button id="resolve-btn" class="final-btn">Resolve Captcha</button>
            </div>
        `;
        const btn = document.getElementById("resolve-btn");
        if (btn) btn.onclick = () => resolveCaptcha();
    }
}
// ----------------------------------------------------
// RESOLVE / RESET CAPTCHA SESSION
// ----------------------------------------------------
async function resolveCaptcha() {

    console.log("RESETTING CAPTCHA SESSION…");

    // Clean old captcha timers/intervals
    if (window.__CLEANUP__) window.__CLEANUP__();

    // Request a brand new session from backend
    const res = await fetch("/start_session", { method: "POST" });
    const data = await res.json();

    sessionId = data.session_id;
    window.sessionId = sessionId;

    // Reset UI
    document.getElementById("final-verify-btn").disabled = true;
    document.getElementById("step-label").innerText = "Attempt 1/3";

    // Load fresh captcha
    loadCaptcha();
}


  // expose needed functions globally
window.resolveCaptcha = resolveCaptcha;
window.initCaptcha1 = initCaptcha1;
window.verifyCaptcha1 = verifyCaptcha1;
window.showSuccessUI = showSuccessUI;
window.hideTimerUI = hideTimerUI;

} // end wrapper
