// ===========================================================
// CAPTCHA-1 SCRIPT (SAFE FROM DUPLICATE LOADING)
// ===========================================================
if (!window.__CAPTCHA1_LOADED__) {
    window.__CAPTCHA1_LOADED__ = true;

    console.log("CAPTCHA-1 LOADED SAFELY");

    const COUNTDOWN = 30;
    const CAPTCHA1_API = "http://localhost:5055";

    let challengeId = null;
    let correctWord = "";
    let userCollected = "";
    let spawnInterval = null;
    let timerInterval = null;
    let countdown = COUNTDOWN;

    // NEW FLAG → timer starts only when first click happens
    let hasTimerStarted = false;

    // expose intervals for main.js
    window.spawnInterval = null;
    window.timerInterval = null;

    // CLEANUP
    window.__CLEANUP__ = function () {
        console.log("CLEANUP RUNNING…");
        if (window.spawnInterval) clearInterval(window.spawnInterval);
        if (window.timerInterval) clearInterval(window.timerInterval);

        window.spawnInterval = null;
        window.timerInterval = null;

        spawnInterval = null;
        timerInterval = null;
        userCollected = "";
        hasTimerStarted = false;
        window.userCollectedAnswer = "";
    };

    // =======================================================
    // MANUAL TIMER START (NO UI)
    // =======================================================
    function startTimer() {
        if (hasTimerStarted) return;
        hasTimerStarted = true;

        countdown = COUNTDOWN;

        timerInterval = setInterval(() => {
            countdown--;

            if (countdown <= 0) {
                clearInterval(timerInterval);
                clearInterval(spawnInterval);

                timerInterval = null;
                spawnInterval = null;
                window.timerInterval = null;
                window.spawnInterval = null;

                if (!window.__CAPTCHA_COMPLETED__) {
                    if (typeof window.onTimeout === "function") {
                        window.onTimeout();
                    }
                }
            }
        }, 1000);

        window.timerInterval = timerInterval;
    }

    // =======================================================
    // INIT CAPTCHA
    // =======================================================
    async function initCaptcha1() {
        console.log("INIT CAPTCHA-1 RUNNING…");

        const res = await fetch(
            `${CAPTCHA1_API}/get_challenge?sessionId=${encodeURIComponent(window.sessionId)}`
        );
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
        hasTimerStarted = false;

        // Update UI
        const targetWordEl = document.getElementById("target-word");
        const progressEl = document.getElementById("progress");
        const box = document.getElementById("fall-container");

        if (targetWordEl) targetWordEl.innerText = correctWord;
        if (progressEl) progressEl.innerText = "_ _ _ _";
        if (box) box.innerHTML = "";

        // Start falling letters (but NOT timer)
        spawnInterval = setInterval(spawnLetter, 500);
        window.spawnInterval = spawnInterval;
    }

    // =======================================================
    // SPAWN LETTERS
    // =======================================================
    function spawnLetter() {
        const box = document.getElementById("fall-container");
        if (!box) return;

        const letter = correctWord[Math.floor(Math.random() * correctWord.length)];

        const el = document.createElement("div");
        el.classList.add("falling-letter");
        el.innerText = letter;

        const w = box.offsetWidth || 300;
        const h = box.offsetHeight || 200;

        let startX = 0,
            startY = 0,
            dx = 0,
            dy = 2;

        const dir = Math.floor(Math.random() * 4);

        switch (dir) {
            case 0: startX = Math.random() * (w - 40); startY = -40; dy = 3 + Math.random() * 2; break;
            case 1: startX = Math.random() * (w - 40); startY = h + 40; dy = -(3 + Math.random() * 2); break;
            case 2: startX = -40; startY = Math.random() * (h - 40); dx = 3 + Math.random() * 2; break;
            case 3: startX = w + 40; startY = Math.random() * (h - 40); dx = -(3 + Math.random() * 2); break;
        }

        el.style.left = `${startX}px`;
        el.style.top = `${startY}px`;

        el.onclick = () => pickLetter(el, letter);

        box.appendChild(el);
        fall(el, dx, dy, w, h);
    }

    // FALL
    function fall(el, dx, dy, w, h) {
        let x = parseFloat(el.style.left);
        let y = parseFloat(el.style.top);

        const t = setInterval(() => {
            x += dx; y += dy;
            el.style.left = x + "px";
            el.style.top = y + "px";

            if (x < -60 || x > w + 60 || y < -60 || y > h + 60) {
                el.remove();
                clearInterval(t);
            }
        }, 40);
    }

    // =======================================================
    // PICK LETTER - START TIMER HERE
    // =======================================================
    function pickLetter(el, letter) {
        try { el.remove(); } catch {}
        if (userCollected.length >= 4) return;

        // Start timer on FIRST CLICK
        startTimer();

        userCollected += letter;
        window.userCollectedAnswer = userCollected;

        updateProgress();

        if (userCollected.length === 4) {
            clearInterval(spawnInterval);
            spawnInterval = null;
            window.spawnInterval = null;

            if (typeof window.onUserFilledProgress === "function")
                window.onUserFilledProgress();
        }
    }

    // =======================================================
    // PROGRESS UI
    // =======================================================
    function updateProgress() {
        const p = document.getElementById("progress");
        if (!p) return;
        p.innerText = userCollected.padEnd(4, "_").split("").join(" ");
    }

    // =======================================================
    // VERIFY API
    // =======================================================
    async function verifyCaptcha1() {
        try {
            const res = await fetch(`${CAPTCHA1_API}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ challengeId, answer: userCollected })
            });
            return await res.json();
        } catch {
            return { status: "failed" };
        }
    }

    // =======================================================
    // TIMEOUT HANDLER
    // =======================================================
    window.onTimeout = async () => {
        await sendVerify("timeout");

        if (window.__PERFORM_NEXT_ATTEMPT__ === true) {

            const c = document.getElementById("captcha-container");
            c.innerHTML = `
            <div style="text-align:center; padding:30px 0;">
                <h2 style="color:red;">Captcha Timed Out !!!</h2>
                <p>You took more than ${COUNTDOWN} seconds.</p>
                <button id="retry-btn" class="final-btn">Retry</button>
            </div>
            `;
            document.getElementById("retry-btn").onclick = () => loadCaptcha();
        }
    };

    // =======================================================
    // ON USER FILLED PROGRESS
    // =======================================================
    window.onUserFilledProgress = () => {
        document.getElementById("final-verify-btn").disabled = false;
    };

    window.initCaptcha1 = initCaptcha1;
    window.verifyCaptcha1 = verifyCaptcha1;
}
