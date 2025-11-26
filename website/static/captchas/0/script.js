console.log("CAPTCHA-0 LOADED");

const CAPTCHA0_API = "http://localhost:5054";

let challengeId0 = null;
let onPassed = null;
let onFailed = null;
let btnTrue = null;
let btnFalse = null;
let challengeData0 = null;

window.__CLEANUP__ = function () {
    if (btnTrue) btnTrue.onclick = null;
    if (btnFalse) btnFalse.onclick = null;
    btnTrue = null;
    btnFalse = null;
    onPassed = null;
    onFailed = null;
};

// ---------------------------------------------------
async function initCaptcha0(opts = {}) {
    onPassed = opts.onPassed;
    onFailed = opts.onFailed;

    // hide main verify while in step 0
    const finalBtn = document.getElementById("final-verify-btn");
    if (finalBtn) {
        finalBtn.style.display = "none";
    }

    const res = await fetch(`${CAPTCHA0_API}/get_challenge?sessionId=${encodeURIComponent(window.sessionId)}`);
    const data = await res.json();
    challengeData0 = data;
    challengeId0 = data.challengeId;

    document.getElementById("syco-prompt").innerText = data.prompt;
    document.getElementById("syco-img").src = data.imageUrl;

    btnTrue = document.getElementById("syco-true");
    btnFalse = document.getElementById("syco-false");

    btnTrue.onclick = () => verifyCaptcha0(true);
    btnFalse.onclick = () => verifyCaptcha0(false);
}


// ---------------------------------------------------
async function verifyCaptcha0(choice) {
    if (!challengeId0) return;

    const res = await fetch(`${CAPTCHA0_API}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            challengeId: challengeId0,
            sessionId: window.sessionId,
            answer: choice
        })
    });

    const data = await res.json();
    const helper = document.getElementById("syco-helper");

    const buttons = [btnTrue, btnFalse];
    buttons.forEach(b => {
        if (b) {
            b.disabled = true;
        }
    });

    const passed = data.status === "passed";

    window.__CAPTCHA0_STATUS__ = {
        status: data.status,
        passed,
        timestamp: Date.now()
    };

    if (helper) {
        helper.innerText = passed
            ? "Checked. Moving to the next captcha."
            : "Recorded. Proceeding to the next captcha.";
        helper.style.color = passed ? "green" : "var(--c7)";
    }

    // Only one attempt: proceed to next captcha regardless of outcome.
    setTimeout(() => {
        if (typeof onPassed === "function") onPassed({ passed });
    }, 400);
}

window.initCaptcha0 = initCaptcha0;
window.verifyCaptcha0 = verifyCaptcha0;
