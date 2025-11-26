from flask import Flask, jsonify, request
from flask_cors import CORS
import random, string, uuid, time, base64
from PIL import Image, ImageDraw, ImageFont
import io, os, hashlib


app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

CHALLENGES = {}
MAX_WORD_COUNT = 4
SIZE = 60
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(BASE_DIR, "fonts", "Kablammo.ttf")


def gen_word():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=MAX_WORD_COUNT))


#############################################
# MAKE LETTER TILE — NOISE FILL
#############################################
def make_letter_tile(letter, color=(0,0,0)):
    img = Image.new("RGBA",(SIZE, SIZE),(255,255,255,0))

    # letter interior mask
    mask = Image.new("L",(SIZE, SIZE),0)
    dmask = ImageDraw.Draw(mask)
    font = ImageFont.truetype(FONT_PATH, 42)

    dmask.text((20,0), letter, font=font, fill=255)

    # fill interior with granular noise
    for _ in range(4000):
        x = random.randint(0, SIZE-1)
        y = random.randint(0, SIZE-1)

        if mask.getpixel((x,y)) > 180:
            img.putpixel(
                (x,y),
                (
                    min(color[0] + random.randint(-20,20),255),
                    min(color[1] + random.randint(-20,20),255),
                    min(color[2] + random.randint(-20,20),255),
                    240
                )
            )

    return img



#############################################
# UNIFIED STATIC + GIF GENERATOR
#############################################
def make_captcha_media(word, animated=False):

    FRAMES = 4
    DURATION = 120

    frames = []

    for _ in range(FRAMES):

        final = Image.new("RGB", (260, 80), (255,255,255))
        d = ImageDraw.Draw(final)

        # paste tiles
        x = 10
        for ch in word:
            tile = make_letter_tile(ch)
            final.paste(tile, (x, random.randint(0,25)), tile)
            x += SIZE

        frames.append(final)

    buf = io.BytesIO()
    
    # static WEBP
    if not animated:
        frames[0].save(buf, format="WEBP")
    else:
        # animated GIF
        frames[0].save(
            buf,
            format='webp',
            save_all=True,
            append_images=frames[1:],
            duration=DURATION,
            optimize=False,
            loop=0
        )

    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def hash_bytes_sha256(data: bytes) -> str:
    return hashlib.sha256(data or b"").hexdigest()



#############################################
# API
#############################################
@app.route("/get_challenge")
def get_challenge():

    session_id = request.args.get("sessionId")

    word = gen_word()
    challenge_id = str(uuid.uuid4())

    CHALLENGES[challenge_id] = {
        "sessionId": session_id,
        "answer": word,
        "answer_tokens": [],
        "ts": time.time()
    }

    main_img = make_captcha_media(word, animated=True)


    # Build per-position tiles once so hashes stay aligned with the expected order.
    tiles_in_order = []
    for c in word:
        tile = make_letter_tile(c)
        buf = io.BytesIO()
        tile.save(buf, format="WEBP")
        raw = buf.getvalue()
        token = hash_bytes_sha256(raw)
        b64 = base64.b64encode(raw).decode()
        tiles_in_order.append({
            # Send only hashes/tokens + image; no plaintext letters to the client.
            "token": token,
            "letter_hash": token,
            "img": f"data:image/webp;base64,{b64}"
        })

    CHALLENGES[challenge_id]["answer_tokens"] = [t["token"] for t in tiles_in_order]

    payload = tiles_in_order.copy()
    random.shuffle(payload)


    return jsonify({
        "challengeId": challenge_id,
        "captcha": main_img,
        "randomLetters": payload,
        "type": "img"
    })


@app.route("/verify", methods=["POST"])
def verify():
    data = request.json or {}
    challenge_id = data.get("challengeId")
    answer = (data.get("answer") or "").strip().upper()
    tokens = data.get("answer_tokens") or []

    challenge = CHALLENGES.get(challenge_id, {})
    expected = challenge.get("answer")
    expected_tokens = challenge.get("answer_tokens") or []

    # Prefer token-based validation; fallback to legacy plain answer.
    passed = False
    if tokens and expected_tokens:
        passed = list(tokens) == list(expected_tokens)
    elif expected:
        passed = answer == expected

    return {"status": "passed" if passed else "failed"}


if __name__ == "__main__":
    app.run(port=5055, debug=True)
