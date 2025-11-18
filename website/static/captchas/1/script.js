console.log("CAPTCHA-1 LOADED");

const CAPTCHA1_API = "http://localhost:5055";

let challengeId_1 = null;
let correctWord = "";
let chosenIndex = 0;
let spawnInterval = null;

window.__CLEANUP__ = function () {
    if (spawnInterval) clearInterval(spawnInterval);
    spawnInterval = null;
};


// ----------------------------------------------------
// INIT
// ----------------------------------------------------
async function initCaptcha1() {
    console.log("INIT CAPTCHA 1:", window.sessionId);

    const res = await fetch(`${CAPTCHA1_API}/get_challenge?sessionId=${window.sessionId}`);
    const data = await res.json();

    challengeId_1 = data.challengeId;
    correctWord = data.word;
    chosenIndex = 0;

    document.getElementById("target-word").innerText = correctWord;
    document.getElementById("progress").innerText = "_ ".repeat(correctWord.length);

    const box = document.getElementById("fall-container");
    box.innerHTML = "";

    if (spawnInterval) clearInterval(spawnInterval);
    spawnInterval = setInterval(() => spawnLetter(), 700);

    console.log("CHALLENGE:", correctWord);
}


// ----------------------------------------------------
// SPAWN LETTER (NEW — from any direction)
// ----------------------------------------------------
function spawnLetter() {
    const box = document.getElementById("fall-container");

    const letter = correctWord[Math.floor(Math.random() * correctWord.length)];
    const el = document.createElement("div");
    el.classList.add("falling-letter");
    el.innerText = letter;

    // ---- Random tilt rotation ------------------------
    const tilt = (Math.random() * 100) - 50; // range -10 to +10
    el.style.transform = `rotate(${tilt}deg)`;

    // ---- Choose a random direction ----
    const direction = Math.floor(Math.random() * 4); // 0=down,1=up,2=left,3=right
    let startX, startY, dx, dy;

    const w = box.offsetWidth;
    const h = box.offsetHeight;

    switch (direction) {
        case 0: // top → down
            startX = Math.random() * (w - 40);
            startY = -40;
            dx = 0;
            dy = 2 + Math.random() * 2;
            break;

        case 1: // bottom → up
            startX = Math.random() * (w - 40);
            startY = h + 40;
            dx = 0;
            dy = -(2 + Math.random() * 2);
            break;

        case 2: // left → right
            startX = -40;
            startY = Math.random() * (h - 40);
            dx = 2 + Math.random() * 2;
            dy = 0;
            break;

        case 3: // right → left
            startX = w + 40;
            startY = Math.random() * (h - 40);
            dx = -(2 + Math.random() * 2);
            dy = 0;
            break;
    }

    el.style.left = startX + "px";
    el.style.top = startY + "px";

    el.onclick = () => pick(el, letter);

    box.appendChild(el);
    fall(el, dx, dy, w, h);
}



// ----------------------------------------------------
// FALL ANIMATION (NEW — works any direction)
// ----------------------------------------------------
function fall(el, dx, dy, w, h) {
    let x = parseFloat(el.style.left);
    let y = parseFloat(el.style.top);

    const timer = setInterval(() => {
        x += dx;
        y += dy;

        el.style.left = x + "px";
        el.style.top = y + "px";

        // remove when completely outside bounds
        if (x < -60 || x > w + 60 || y < -60 || y > h + 60) {
            el.remove();
            clearInterval(timer);
        }

    }, 20);
}


// ----------------------------------------------------
// CLICK LETTER
// ----------------------------------------------------
function pick(el, letter) {
    el.remove(); 

    const correct = correctWord[chosenIndex];

    if (letter !== correct) {
        window.dispatchEvent(new CustomEvent("captchaFailed", { detail:{ cid:"1" } }));
        return;
    }

    chosenIndex++;

    document.getElementById("progress").innerText =
        correctWord.substring(0, chosenIndex).padEnd(correctWord.length, "_");

    if (chosenIndex === correctWord.length) {
        verifyCaptcha1();
    }
}


// ----------------------------------------------------
// VERIFY CAPTCHA
// ----------------------------------------------------
async function verifyCaptcha1() {
    if (spawnInterval) clearInterval(spawnInterval);

    const res = await fetch(`${CAPTCHA1_API}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            challengeId: challengeId_1,
            sessionId: window.sessionId,
            answer: correctWord
        })
    });

    const data = await res.json();

    if (data.status === "passed")
        window.dispatchEvent(new CustomEvent("captchaPassed", { detail:{ cid:"1" } }));
    else
        window.dispatchEvent(new CustomEvent("captchaFailed", { detail:{ cid:"1" } }));
}

initCaptcha1();
