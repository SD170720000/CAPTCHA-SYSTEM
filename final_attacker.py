"""
Attacker script with full llm_debug logging:
- For each frame N, creates: llm_debug/frame_NNN/
    - dom.html
    - screenshot.png (if present)
    - messages.txt      (human readable)
    - messages.json     (structured)
    - messages_raw.txt  (repr dump)
    - response_raw.txt  (full LLM output string)
    - response_parsed.json (parsed JSON payload, if any)

Environment:
  TARGET_URL   - page to solve (default http://127.0.0.1:5000)
  MAX_FRAMES   - frames to try before stopping (default 8)
  MODEL        - Groq model name (default meta-llama/llama-4-scout-17b-16e-instruct)
  HEADLESS     - set to "true" to hide browser (default false)
  GROQ_API_KEY - required for ChatGroq
"""

import asyncio
import base64
import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from time import sleep

from browser_use import BrowserSession, ChatGroq
from browser_use.code_use.namespace import evaluate
from browser_use.dom.views import DEFAULT_INCLUDE_ATTRIBUTES


# Ensure local src/ is importable when running as a script
ROOT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"
if SRC_DIR.exists():
    sys.path.insert(0, str(SRC_DIR))


from realtime_wrapper import RealtimeAgentConfig, RealtimeBrowserAgent


TARGET_URL = os.environ.get("TARGET_URL", "http://127.0.0.1:5000")
MAX_FRAMES = int(os.environ.get("MAX_FRAMES", "8"))
MODEL = os.environ.get("MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
HEADLESS = os.environ.get("HEADLESS", "false").lower() == "true"

DEBUG_DIR = Path("llm_debug")
DEBUG_DIR.mkdir(exist_ok=True)


SYSTEM_PROMPT = """
You control a browser on a multi-step Human Verification page.

============================================================
GENERAL RULES (READ CAREFULLY)
============================================================

You will receive **DOM snapshot text** + a **screenshot** for every frame.
Your job is to choose an action and return **exactly one JSON object** containing JavaScript.

⚠ CRITICAL:
- NEVER modify innerText, textContent, value, attributes, classes, styles, or dataset.
- You are ONLY allowed to **click real DOM elements**.
- DO NOT fabricate DOM elements or selectors that are not present in the DOM snapshot.
- DO NOT try to parse characters from image base64.
- DO NOT perform OCR using JavaScript. YOU (the model) already know the letter visually.
- Your JS should be SIMPLE and ONLY target elements by index, ID or querySelector.

You may use:
- document.getElementById(...)
- document.querySelector(...)
- document.querySelectorAll(...)
- element.click()
- getBoundingClientRect()
- setTimeout / setInterval for periodic polling

You must NEVER:
- Invent target words
- Attempt to extract characters from image src, filenames, URLs, or base64
- Attempt to manually “solve” the puzzle by modifying DOM properties
- Produce placeholder code like `/* determine true/false */`
  → YOU must decide the correct answer using the screenshot.


============================================================
STEP 1 — STATEMENT VERIFICATION CAPTCHA
============================================================

DOM pattern:

- Image: <img id="syco-img">
- Prompt text: <p id="syco-prompt">Verify: ...</p>
- Buttons:
    <button id="syco-true">✔ TRUE</button>
    <button id="syco-false">✘ FALSE</button>

Your job:
1. Read the natural-language statement from #syco-prompt.
2. Look at the screenshot (the image shown for this frame).
3. Decide TRUE or FALSE based on your visual understanding.
4. Output JavaScript that clicks the correct button.

Example acceptable JS pattern:

(function(){
  const promptEl = document.getElementById('syco-prompt');
  if (!promptEl) return;

  // YOU (the model) must decide the truth here.
  const statementIsTrue = false;   // example; you must set this correctly.

  const btn = document.getElementById(statementIsTrue ? 'syco-true' : 'syco-false');
  if (btn) btn.click();
})();

Rules:
- ALWAYS choose TRUE or FALSE — never skip.
- Do NOT say “no CAPTCHA found” if this step appears.


============================================================
STEP 2 — FALLING-LETTER CAPTCHA
============================================================

DOM pattern:

- Start button: <button id="start-btn">
- Progress display: <div id="progress">_ _ _ _</div>
- Falling letters: <img class="falling-letter">
- Final verify button: <button id="final-verify-btn">

Behavior:
- The falling letters are rendered as images. The DOM does NOT contain the letter text.
- YOU (the model) must visually identify which `.falling-letter` corresponds to the NEXT correct letter.
- JS MUST NOT attempt to decode letters from src/base64/URL.
- JS MUST NOT construct or compare characters like 'A', 'B', etc.  
  → YOU decide the correct element via the screenshot.

CRITICAL RULE:
**JavaScript only clicks the element YOU choose by index or simple geometric rules.  
The intelligence (letter matching) happens inside YOU, not in JS.**

Acceptable JS pattern:

(function(){
  // If start is visible, click it
  const start = document.getElementById('start-btn');
  if (start) { start.click(); return; }

  const letters = document.querySelectorAll('#fall-container .falling-letter');
  if (!letters.length) return;

  // YOU decide which falling letter index is correct using your visual understanding
  const indexToClick = 1;   // example — YOU must output the correct index.

  if (indexToClick >= 0 && indexToClick < letters.length) {
    letters[indexToClick].click();
  }

  // If progress is fully filled (no '_'), click final verify button
  const progress = document.getElementById('progress');
  if (progress && !progress.textContent.includes('_')) {
    const verify = document.getElementById('final-verify-btn');
    if (verify) verify.click();
  }
})();

NOT ALLOWED:
- No base64 parsing
- No filename parsing
- No targetWord reconstruction
- No innerText modifications
- No attempts to "solve" slots in JS


============================================================
DECISION STRATEGY ACROSS FRAMES
============================================================

The UI can switch between:
- Step 1 (Statement Verification)
- Step 2 (Falling Letters)
- Result screens

You MUST detect which mode you are in from the DOM snapshot and screenshot.

DO NOT confuse the steps. ALWAYS perform only the action appropriate to the current frame.

If you see:
- #syco-prompt → Perform statement verification
- #fall-container → Perform falling-letter selection
- #start-btn only → Click to begin


============================================================
OUTPUT FORMAT (STRICT)
============================================================

Return EXACTLY one JSON object, nothing else, no markdown:

{
  "javascript": "(function(){ ... })();",
  "summary": "Short description of what the JS does.",
  "reason": "Brief explanation of why."
}

If you fail to return valid JSON, all progress stops.  
Be concise, correct, and follow the rules above.

"""

# -----------------------------------------------------------------------------------
# JSON extractor (allows braces inside JS)
# -----------------------------------------------------------------------------------

def extract_json(text: str):
    if not text:
        return None

    depth = 0
    start = None
    in_string = False
    string_char = None
    escape = False

    for i, ch in enumerate(text):
        if start is None:
            if ch == "{":
                start = i
                depth = 1
            continue

        if escape:
            escape = False
            continue

        if ch == "\\":
            escape = True
            continue

        if in_string:
            if ch == string_char:
                in_string = False
                string_char = None
            continue

        if ch in ('"', "'"):
            in_string = True
            string_char = ch
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                candidate = text[start:i+1]
                try:
                    return json.loads(candidate)
                except Exception:
                    start = None
                    depth = 0
                    in_string = False
                    escape = False
                    continue

    return None


# -----------------------------------------------------------------------------------
# Save LLM debug information (all 3 types) into per-frame folder
# -----------------------------------------------------------------------------------

def save_llm_inputs_for_frame(frame, messages):
    """
    Save DOM, screenshot, and message structures for a frame.

    Returns: Path to the frame directory (llm_debug/frame_NNN).
    """
    fid = f"{frame.step:03d}"
    frame_dir = DEBUG_DIR / f"frame_{fid}"
    frame_dir.mkdir(exist_ok=True)

    # 1. Save DOM
    dom = frame.model_input.dom_snapshot or ""
    (frame_dir / "dom.html").write_text(dom, encoding="utf-8")

    # 2. Save screenshot
    screenshot = getattr(frame.model_input, "screenshot", None)
    if screenshot is not None:
        png_path = frame_dir / "screenshot.png"
        try:
            if isinstance(screenshot, bytes):
                png_path.write_bytes(screenshot)
            elif isinstance(screenshot, str):
                if screenshot.startswith("data:image"):
                    _, b64 = screenshot.split(",", 1)
                else:
                    b64 = screenshot
                png_path.write_bytes(base64.b64decode(b64))
            else:
                (frame_dir / "screenshot.txt").write_text(
                    f"Unsupported screenshot type: {type(screenshot)}\n{repr(screenshot)}",
                    encoding="utf-8",
                )
        except Exception as e:
            (frame_dir / "screenshot_error.txt").write_text(str(e), encoding="utf-8")

    # 3. Human-readable messages
    with (frame_dir / "messages.txt").open("w", encoding="utf-8") as f:
        for m in messages:
            role = getattr(m, "role", "unknown")
            content = getattr(m, "content", None)
            f.write(f"\n--- {role.upper()} ({type(m).__name__}) ---\n")

            if isinstance(content, str):
                f.write(content + "\n")
            elif isinstance(content, list):
                for block in content:
                    btype = getattr(block, "type", None)
                    if btype == "input_text":
                        f.write("[TEXT]\n")
                        f.write(getattr(block, "text", "") + "\n")
                    elif btype == "input_image":
                        img = getattr(block, "image", "") or getattr(block, "url", "")
                        f.write(f"[IMAGE] (hidden, {len(img)} bytes)\n")
                    else:
                        f.write(f"[BLOCK] {block!r}\n")
            else:
                f.write(f"[UNKNOWN CONTENT] {content!r}\n")

    # 4. JSON-style dump
    safe_json = []
    for m in messages:
        item = {
            "role": getattr(m, "role", ""),
            "type": type(m).__name__,
            "content": []
        }
        content = getattr(m, "content", None)
        if isinstance(content, str):
            item["content"] = content
        elif isinstance(content, list):
            for block in content:
                entry = {"block_type": getattr(block, "type", None)}
                if getattr(block, "type", "") == "input_text":
                    entry["text"] = getattr(block, "text", "")
                else:
                    img = getattr(block, "image", "") or getattr(block, "url", "")
                    entry["meta"] = f"<non-text block len={len(img)}>"
                item["content"].append(entry)
        else:
            item["content"] = repr(content)

        safe_json.append(item)

    (frame_dir / "messages.json").write_text(
        json.dumps(safe_json, indent=2),
        encoding="utf-8",
    )

    # 5. Raw repr dump
    with (frame_dir / "messages_raw.txt").open("w", encoding="utf-8") as f:
        for m in messages:
            f.write(repr(m) + "\n")

    return frame_dir


# -----------------------------------------------------------------------------------
# Browser session
# -----------------------------------------------------------------------------------

@asynccontextmanager
async def browser_session():
    sess = BrowserSession(headless=HEADLESS)
    await sess.start()
    try:
        yield sess
    finally:
        await sess.stop()


# -----------------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------------

async def main():
    print(f"Navigating to {TARGET_URL}")

    async with browser_session() as session:
        await session.navigate_to(TARGET_URL)

        agent = RealtimeBrowserAgent(
            browser_session=session,
            llm=ChatGroq(model=MODEL),
            config=RealtimeAgentConfig(
                poll_interval=0.25,
                include_screenshot=True,
                dom_representation="full",
                include_attributes=list(DEFAULT_INCLUDE_ATTRIBUTES) + ["class", "src", "href"],
            )
        )

        async for frame in agent.stream(
            task="Solve the CAPTCHA using screenshot + DOM and output JavaScript.",
            max_frames=MAX_FRAMES
        ):
            print(f"\n=== FRAME {frame.step} ===")

            # Build messages that go into the model
            messages = agent.build_messages(
                frame,
                system_prompt=SYSTEM_PROMPT,
                extra_instructions=""
            )

            # Save DOM / screenshot / messages for this frame
            frame_dir = save_llm_inputs_for_frame(frame, messages)
            print("Saved llm_debug for frame:", frame.step, "->", frame_dir)

            # Call LLM
            result = await agent.call_llm(
                frame,
                system_prompt=SYSTEM_PROMPT,
                extra_instructions=""
            )

            raw = result.raw.completion if hasattr(result.raw, "completion") else str(result.raw)

            # Save raw model response per frame
            (frame_dir / "response_raw.txt").write_text(raw, encoding="utf-8")

            print("\n===== RAW MODEL OUTPUT (TRUNCATED) =====")
            print(raw[:900] + ("..." if len(raw) > 900 else ""))
            print("===== END MODEL OUTPUT =====\n")

            # Parse JSON payload
            payload = extract_json(raw)
            if payload is not None:
                # Save parsed JSON too
                try:
                    (frame_dir / "response_parsed.json").write_text(
                        json.dumps(payload, indent=2),
                        encoding="utf-8",
                    )
                except Exception as e:
                    (frame_dir / "response_parsed_error.txt").write_text(
                        str(e),
                        encoding="utf-8",
                    )

            if not payload:
                print("LLM returned no JSON — skipping frame.\n")
                continue

            js = payload.get("javascript")
            if not js:
                print("No JS returned — skipping.")
                continue

            print("Executing model JS...")
            print(js)
            print("---")

            try:
                out = await evaluate(js, browser_session=session)
                print("JS execution output:", out)
            except Exception as e:
                print("Execution error:", e)
                continue

            # stop if solved/final
            snapshot = (frame.model_input.dom_snapshot or "").lower()
            if "result" in snapshot or "solved" in snapshot or "failed" in snapshot:
                print("Detected final state — stopping.")
                sleep(2)
                break


if __name__ == "__main__":
    asyncio.run(main())
