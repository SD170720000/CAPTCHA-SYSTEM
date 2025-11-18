console.log("CAPTCHA-2 LOADED");

const CAPTCHA2_API = "http://localhost:5056";

let challengeId_2 = null;
let expectedWord = null;

let inputEl = null;

window.__CLEANUP__ = function () {
    if (inputEl) {
        inputEl.onkeyup = null;
    }
};


// ---------------------------------------------------
async function initCaptcha2() {
    console.log("INIT CAPTCHA-2 with session:", window.sessionId);

    const res = await fetch(`${CAPTCHA2_API}/get_challenge?sessionId=${window.sessionId}`);
    const data = await res.json();

    challengeId_2 = data.challengeId;
    expectedWord = data.prompt.split(":")[1].trim().toUpperCase();

    document.getElementById("text-prompt").innerText = data.prompt;

    inputEl = document.getElementById("text-input");
    inputEl.value = "";
    inputEl.onkeyup = (e) => {
        if (e.key === "Enter") verifyCaptcha2();
    };
}


// ---------------------------------------------------
async function verifyCaptcha2() {
    const userVal = inputEl.value.trim().toUpperCase();

    const res = await fetch(`${CAPTCHA2_API}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            challengeId: challengeId_2,
            sessionId: window.sessionId,
            answer: userVal
        })
    });

    const data = await res.json();

    if (data.status === "passed")
        window.dispatchEvent(new CustomEvent("captchaPassed", { detail: { cid:"2" } }));
    else
        window.dispatchEvent(new CustomEvent("captchaFailed", { detail: { cid:"2" } }));
}

initCaptcha2();
