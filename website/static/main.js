console.log("MAIN loaded");

let sessionId = null;
let captchaSequence = [];
let currentIndex = 0;

window.sessionId = null;

// store active captcha cleanup function
window.__CLEANUP__ = null;

document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-btn");

    startBtn.onclick = async () => {
        const res = await fetch("/start_session", { method: "POST" });
        const data = await res.json();

        sessionId = data.sessionId;
        window.sessionId = sessionId;
        captchaSequence = data.sequence;
        currentIndex = 0;

        console.log("SESSION:", sessionId, "Sequence:", captchaSequence);

        startBtn.style.display = "none";
        document.getElementById("main-title").style.display = "none";
        document.getElementById("main-desc").style.display = "none";

        document.getElementById("captcha-section").style.display = "block";

        loadNextCaptcha();
    };
});


// ------------------------------------------------------------
// LOAD NEXT CAPTCHA
// ------------------------------------------------------------
async function loadNextCaptcha() {

    // Kill previous captcha BEFORE loading next
    if (window.__CLEANUP__) {
        window.__CLEANUP__();
        window.__CLEANUP__ = null;
    }

    if (currentIndex >= captchaSequence.length) {
        showFinalVerifyButton();
        return;
    }

    const cid = captchaSequence[currentIndex];
    console.log("Loading Captcha:", cid);

    const container = document.getElementById("captcha-container");

    // Load HTML
    const html = await fetch(`/load_captcha/${cid}`).then(r => r.text());
    container.innerHTML = html;

    // Wait for layout to attach
    await new Promise(r => setTimeout(r, 40));

    // Load script dynamically
    const script = document.createElement("script");
    script.src = `/static/captchas/${cid}/script.js?${Date.now()}`;
    document.body.appendChild(script);
}


// ------------------------------------------------------------
// EVENTS FROM CAPTCHAS
// ------------------------------------------------------------
window.addEventListener("captchaPassed", async (e) => {
    const cid = e.detail.cid;

    await fetch("/record_result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cid, status: "passed" })
    });

    currentIndex++;
    loadNextCaptcha();
});


window.addEventListener("captchaFailed", async (e) => {
    const cid = e.detail.cid;

    displayFlash(`Captcha-${currentIndex+1} Wrong ❌`);

    await fetch("/record_result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, cid, status: "failed" })
    });

    currentIndex++;
    loadNextCaptcha();
});


// ------------------------------------------------------------
// FINAL VERIFY BUTTON
// ------------------------------------------------------------
function showFinalVerifyButton() {
    // const container = document.getElementById("captcha-container");
    // container.innerHTML = `
    //     <button id="final-verify-btn" class="final-btn">
    //         Verify Human/Ai
    //     </button>
    // `;

    document.getElementById("final-verify-btn").onclick = async () => {
        const res = await fetch("/final_result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId })
        });

        const data = await res.json();
        alert("Decision: " + data.decision);
    };
}


// ------------------------------------------------------------
// FLASH MESSAGE OVERLAY
// ------------------------------------------------------------
function displayFlash(msg) {
    const el = document.createElement("div");
    el.className = "flash-popup";
    el.innerHTML = msg;

    document.body.appendChild(el);

    setTimeout(() => {
        el.style.opacity = 0;
        setTimeout(() => el.remove(), 400);
    }, 1200);
}
