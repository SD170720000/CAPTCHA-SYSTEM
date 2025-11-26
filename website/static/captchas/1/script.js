// ===========================================================
// CAPTCHA-1 SCRIPT (SAFE FROM DUPLICATE LOADING)
// ===========================================================
if (!window.__CAPTCHA1_LOADED__) {
    window.__CAPTCHA1_LOADED__ = true;

    console.log("CAPTCHA-1 LOADED SAFELY");

    const COUNTDOWN = 30;
    const CAPTCHA1_API = "http://localhost:5055";

    let challengeId = null;
    let randomLetters = [];
    let userCollected = "";
    let spawnInterval = null;
    let timerInterval = null;
    let countdown = COUNTDOWN;

    let hasTimerStarted = false;

    window.spawnInterval = null;
    window.timerInterval = null;
    window.challenge_start_time = 0;

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

    function drawCaptchaOnCanvas(base64) {
        const img = document.getElementById("captcha-canvas");

        img.src = base64;
    }

    function startTimer() {
        if (hasTimerStarted) return;
        hasTimerStarted = true;

        countdown = COUNTDOWN;

        timerInterval = setInterval(() => {
            
            const bar = document.getElementById("timer-bar");
            
            if (bar) {
                const percent = ((countdown-1) / COUNTDOWN) * 100
                bar.style.width = `${percent}%`;

                if (percent <= 50 && percent > 25) {
                    bar.style.background = "var(--c6)";
                }else if (percent <= 25) {
                    bar.style.background = "var(--c7)";
                }
            }

            countdown--;

            if (countdown < 0) {

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

    async function initCaptcha1() {
        console.log("INIT CAPTCHA-1 RUNNING…");

        const res = await fetch(`${CAPTCHA1_API}/get_challenge?sessionId=${encodeURIComponent(window.sessionId)}`);
        const data = await res.json();

        if (!data || !data.challengeId || !data.captcha) {
            console.error("Invalid challenge data:", data);
            return;
        }

        challengeId = data.challengeId;
        randomLetters = data.randomLetters;

        window.challengeId = challengeId;
        window.randomLetters = randomLetters;
        window.userCollectedAnswer = "";
        userCollected = "";
        hasTimerStarted = false;

        startTimer();

        drawCaptchaOnCanvas(data.captcha);

        const progressEl = document.getElementById("progress");
        const box = document.getElementById("fall-container");

        if (progressEl) progressEl.innerText = "_ _ _ _";
        if (box) box.innerHTML = "";

        spawnInterval = setInterval(() => spawnLetter(randomLetters), 500);
        window.spawnInterval = spawnInterval;
    }

    function spawnLetter(dataset) {
        const box = document.getElementById("fall-container");
        if (!box) return;

        const letter_data = dataset[Math.floor(Math.random() * dataset.length)];

        const el = document.createElement("img");
        el.src = letter_data.img;
        el.classList.add("falling-letter");

        // ---- Random tilt rotation ------------------------
        const tilt = (Math.random() * 100) - 50;
        el.style.transform = `rotate(${tilt}deg)`;

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

        el.onclick = (e) => pickLetter(el, letter_data.letter, e);

        box.appendChild(el);
        fall(el, dx, dy, w, h);
    }

    function fall(el, dx, dy, w, h) {
        let x = parseFloat(el.style.left);
        let y = parseFloat(el.style.top);

        const t = setInterval(() => {
            x += dx;
            y += dy;
            el.style.left = x + "px";
            el.style.top = y + "px";

            if (x < -60 || x > w + 60 || y < -60 || y > h + 60) {
                el.remove();
                clearInterval(t);
            }
        }, 40);
    }

    function pickLetter(el, letter, event) {
        el.remove();

        if (userCollected.length >= 4) return;

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

    function updateProgress() {
        const p = document.getElementById("progress");
        if (!p) return;
        p.innerText = userCollected.padEnd(4, "_").split("").join(" ");
    }

    async function verifyCaptcha1() {
        try {
            const res = await fetch(`${CAPTCHA1_API}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({  challengeId, answer: userCollected })
            });
            return await res.json();
        } catch {
            return { status: "failed" };
        }
    }

    window.onTimeout = async () => {
        await sendVerify("timeout");

        if (window.__PERFORM_NEXT_ATTEMPT__ === true) {
            const c = document.getElementById("captcha-container");
            c.innerHTML = `
            <div style="text-align:center; padding:30px 0;">
                <h2 style="color:var(--c7);">Captcha Timed Out !!!</h2>
                <p style="color: var(--c2)">You took more than ${COUNTDOWN} seconds.</p>
                <button id="retry-btn" class="final-btn">Retry</button>
            </div>
            `;
            document.getElementById("retry-btn").onclick = () => loadCaptcha();
        }
    };

    window.onUserFilledProgress = () => {
        document.getElementById("final-verify-btn").disabled = false;
    };

    window.initCaptcha1 = initCaptcha1;
    window.verifyCaptcha1 = verifyCaptcha1;
}
