console.log("CAPTCHA-0 LOADED");

const CAPTCHA0_API = "http://localhost:5054";

let challengeId0 = null;
let onPassed = null;
let onFailed = null;
let btnTrue = null;
let btnFalse = null;

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

    if (data.status === "passed") {
        if (helper) {
            helper.innerText = "Correct. Moving to the next captcha.";
            helper.style.color = "green";
        }
        setTimeout(() => {
            if (typeof onPassed === "function") onPassed();
        }, 300);
    } else {
        if (helper) {
            helper.innerText = "Incorrect. Please try a new scene.";
            helper.style.color = "var(--c7)";
        }
        setTimeout(() => {
            if (typeof onFailed === "function") onFailed();
        }, 400);
    }
}

window.initCaptcha0 = initCaptcha0;
window.verifyCaptcha0 = verifyCaptcha0;
