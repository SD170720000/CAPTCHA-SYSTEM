// ===========================================================

// CAPTCHA-1 SCRIPT (SAFE FROM DUPLICATE LOADING)
// ===========================================================
if (!window.__CAPTCHA1_LOADED__) {
    window.__CAPTCHA1_LOADED__ = true;

    console.log("CAPTCHA-1 LOADED SAFELY");

    const COUNTDOWN = 30;
    const CAPTCHA1_API = "http://localhost:5055";

    let challengeId = null;
    let rawLetters = [];
    let normalizedLetters = [];
    let letterMetaByToken = {};
    let userCollectedTokens = [];
    let userCollectedLetters = [];
    let spawnInterval = null;
    let timerInterval = null;
    let countdown = COUNTDOWN;

    let hasTimerStarted = false;

    const sharedMetrics = window.__metrics__ || null;

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
        userCollectedTokens = [];
        userCollectedLetters = [];
        hasTimerStarted = false;
        window.userCollectedAnswer = { tokens: [], letters: [] };
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

    async function hashStringSHA256(str) {
        const data = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    async function normalizeLetters(dataset) {
        const result = [];
        const metaMap = {};

        for (const entry of dataset || []) {
            // Prefer server-provided token/hash; fallback to hashing image data.
            const token = entry.letter_hash || entry.token || await hashStringSHA256(entry.img || "");
            metaMap[token] = {
                img: entry.img,
                // keep letter privately for backward compatibility; not exposed in UI
                letter: entry.letter || null
            };
            result.push({
                token,
                img: entry.img
            });
        }

        return { normalized: result, metaMap };
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
        rawLetters = data.randomLetters;

        // Normalize dataset to avoid exposing raw letters on the client.
        const { normalized, metaMap } = await normalizeLetters(rawLetters);
        normalizedLetters = normalized;
        letterMetaByToken = metaMap;

        window.challengeId = challengeId;
        window.randomLetters = normalizedLetters; // no letter string leaked
        window.userCollectedAnswer = { tokens: [], letters: [] };
        userCollectedTokens = [];
        userCollectedLetters = [];
        hasTimerStarted = false;

        startTimer();

        if (sharedMetrics && sharedMetrics.captcha1_attempts.length) {
            const step = sharedMetrics.captcha1_attempts[sharedMetrics.captcha1_attempts.length - 1];
            step.challengeId = challengeId;
            step.randomTokens = normalizedLetters.map(l => l.token);
            step.challengeStartTs = Date.now();
        }

        drawCaptchaOnCanvas(data.captcha);

        const progressEl = document.getElementById("progress");
        const box = document.getElementById("fall-container");

        if (progressEl) progressEl.innerText = "_ _ _ _";
        if (box) box.innerHTML = "";

        spawnInterval = setInterval(() => spawnLetter(normalizedLetters), 500);
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

        el.onclick = (e) => pickLetter(el, letter_data.token, e);

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

    function pickLetter(el, letterToken, event) {
        el.remove();

        if (userCollectedTokens.length >= 4) return;

        userCollectedTokens.push(letterToken);

        const meta = letterMetaByToken[letterToken];
        if (meta && meta.letter) {
            userCollectedLetters.push(meta.letter);
        }

        // track bubble click location/time separately from general clicks
        if (sharedMetrics && sharedMetrics.captcha1_attempts.length) {
            const now = Date.now();
            const last = sharedMetrics.captcha1_attempts[sharedMetrics.captcha1_attempts.length - 1];
            last.bubble_clicks = last.bubble_clicks || [];
            if (last.bubble_clicks.length < 200) {
                last.bubble_clicks.push({
                    x: event?.clientX ?? null,
                    y: event?.clientY ?? null,
                    t: now
                });
            }
        }

        window.userCollectedAnswer = {
            tokens: [...userCollectedTokens],
            letters: [...userCollectedLetters]
        };

        if (sharedMetrics && sharedMetrics.captcha1_attempts.length) {
            const step = sharedMetrics.captcha1_attempts[sharedMetrics.captcha1_attempts.length - 1];
            step.randomTokens = step.randomTokens || normalizedLetters.map(l => l.token);
            step.selectedTokens = step.selectedTokens || [];
            step.selectedTokens.push(letterToken);
        }

        updateProgress();

        if (userCollectedTokens.length === 4) {
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
        const slots = 4;
        p.innerHTML = "";
        for (let i = 0; i < slots; i++) {
            const slot = document.createElement("span");
            slot.className = "progress-slot";

            const token = userCollectedTokens[i];
            if (token && letterMetaByToken[token]) {
                const img = document.createElement("img");
                img.src = letterMetaByToken[token].img;
                img.alt = "selected";
                img.width = 40;
                img.height = 40;
                slot.appendChild(img);
            } else {
                slot.innerText = "_";
            }

            p.appendChild(slot);
        }
    }

    async function verifyCaptcha1() {
        try {
            const answerTokens = [...userCollectedTokens];
            const fallbackLetters = userCollectedLetters.join("");

            const res = await fetch(`${CAPTCHA1_API}/verify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    challengeId,
                    answer_tokens: answerTokens,
                    // keep legacy string for backward compatibility
                    answer: fallbackLetters || undefined
                })
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
