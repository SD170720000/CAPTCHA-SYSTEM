# captcha1_api/app.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import random, string, uuid, time, base64
from PIL import Image, ImageDraw, ImageFont
import io, os

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

CHALLENGES = {}

MAX_WORD_COUNT = 4

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(BASE_DIR, "fonts", "Kablammo.ttf")

def gen_word():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=MAX_WORD_COUNT))


def make_distorted_png(word):
    img = Image.new("RGB", (150, 60), (255, 255, 255))
    d = ImageDraw.Draw(img)

    size = random.randint(28, 36)
    font = ImageFont.truetype(FONT_PATH, size)

    # random noise
    for _ in range(150):
        d.point(
            (random.randint(0,149), random.randint(0,59)),
            fill=(random.randint(0,200),random.randint(0,200),random.randint(0,200))
        )

    d.text((40,10), word, font=font, fill=(48, 115, 240))

    buf = io.BytesIO()
    img.save(buf, format='webp')
    b64 = base64.b64encode(buf.getvalue()).decode('utf8')
    return f"data:image/png;base64,{b64}"


@app.route("/get_challenge")
def get_challenge():
    session_id = request.args.get("sessionId")
    if not session_id:
        return jsonify({"error": "sessionId required"}), 400

    word = gen_word()
    challenge_id = str(uuid.uuid4())

    CHALLENGES[challenge_id] = {
        "sessionId": session_id,
        "answer": word,
        "ts": time.time()
    }

    img64 = make_distorted_png(word)

    shuffled_letters = list(word)
    random.shuffle(shuffled_letters)
    noise = ''.join(random.choices(string.ascii_uppercase + string.digits, k=MAX_WORD_COUNT-1))

    return jsonify({
        "challengeId": challenge_id,
        "svgImg": img64,
        "type": "img",
        "randomLetters": "".join(shuffled_letters)+noise
    })


@app.route("/verify", methods=["POST"])
def verify():
    data = request.json or {}
    challenge_id = data.get("challengeId")
    answer = (data.get("answer") or "").strip().upper()

    if challenge_id not in CHALLENGES:
        return jsonify({"error": "invalid challengeId"}), 400

    expected = CHALLENGES[challenge_id]["answer"]

    return jsonify({
        "status": "passed" if answer == expected else "failed"
    })


if __name__ == "__main__":
    app.run(port=5055, debug=True)
