"""
Etrip 後端（Flask，部署在 Google Cloud Run）

- /parse              AI 把雜亂的行程文字整理成 JSON
- /extract_places     AI 從文字中抽出景點 / 餐廳 / 商店
- /extract_url        讀取網址抽出地點；YouTube 影片會直接讓 Gemini 看影片
- /enrich_locations   地點名稱轉座標（Google Geocoding API）
- /sync               雲端同步（Firestore）：建立同步碼、讀取、儲存、刪除
- /health             健康檢查 / 提早喚醒

環境變數：
  GEMINI_API_KEY       Gemini API 金鑰（AI 功能）
  GEMINI_MODEL         選填，預設 gemini-3.5-flash-lite
  GEMINI_VIDEO_MODEL   選填，看 YouTube 影片用的模型，預設同 GEMINI_MODEL
  GOOGLE_MAPS_API_KEY  補座標用
  ALLOWED_ORIGINS      選填，只允許自己的網站呼叫，逗號分隔
                       例如 https://elsiexu.github.io
  SYNC_COLLECTION      選填，Firestore 集合名稱，預設 etrip_sync
  DAILY_AI_LIMIT       選填，每台機器每天最多幾次 AI 請求，預設 150
  DAILY_GEO_LIMIT      選填，每台機器每天最多查幾次座標，預設 300

防濫用：每個 IP 有使用次數限制（見 RATE_RULES），加上每天的總量上限。
網址是公開的，任何人都能直接呼叫，這些限制讓費用不會失控。

  （選用）AI_PROVIDER=openai 搭配 OPENAI_API_KEY、OPENAI_MODEL，可以改回 OpenAI
"""

import hashlib
import ipaddress
import json
import os
import re
import secrets
import socket
import threading
import time
import zlib
from collections import deque
from functools import wraps
from datetime import date
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
CORS(app, resources={r"/*": {"origins": _origins or "*"}})

GOOGLE_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
AI_PROVIDER = os.getenv("AI_PROVIDER") or ("gemini" if os.getenv("GEMINI_API_KEY") else "openai")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_VIDEO_MODEL = os.getenv("GEMINI_VIDEO_MODEL", GEMINI_MODEL)
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
SYNC_COLLECTION = os.getenv("SYNC_COLLECTION", "etrip_sync")

MAX_TEXT = 15000        # 送給 AI 的文字上限
MAX_PLACES = 80         # 一次最多補幾個座標
MAX_SYNC_BYTES = 900_000  # Firestore 單筆上限約 1MB（壓縮後）

CATEGORY_HINT = "category 只能是 food（餐廳小吃）、cafe（咖啡甜點）、sight（景點）、shop（購物）、other 其中之一"


class AIError(Exception):
    pass


# ===============================
# AI 呼叫（Gemini 為主，OpenAI 備用）
# ===============================

_gemini = None
_openai = None


def gemini_client():
    global _gemini
    if _gemini is None:
        from google import genai
        _gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    return _gemini


def parse_json_text(text):
    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {}


def ask_json(prompt, video_url=None):
    """送出提示並取得 JSON 物件；video_url 是 YouTube 網址時會一起送影片"""
    if AI_PROVIDER == "openai":
        if video_url:
            raise AIError("目前的 AI 設定不支援讀取影片，請改用 Gemini")
        global _openai
        if _openai is None:
            from openai import OpenAI
            _openai = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        res = _openai.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return parse_json_text(res.choices[0].message.content)

    from google.genai import types
    contents = [prompt]
    config = {"response_mime_type": "application/json", "temperature": 0.2}
    model = GEMINI_MODEL
    if video_url:
        # 影片用低解析度：找地點不需要高畫質，費用約只要三分之一
        contents = [types.Part(file_data=types.FileData(file_uri=video_url)), prompt]
        config["media_resolution"] = types.MediaResolution.MEDIA_RESOLUTION_LOW
        model = GEMINI_VIDEO_MODEL
    res = gemini_client().models.generate_content(
        model=model, contents=contents, config=types.GenerateContentConfig(**config)
    )
    return parse_json_text(res.text)


def error(message, status=400):
    return jsonify({"error": message}), status


# ===============================
# 防濫用：使用次數限制
# 存在記憶體裡，每台機器各自計算（Cloud Run 設定最多 2 台）
# ===============================

# 每個 IP：(秒數, 次數)
RATE_RULES = {
    "ai": [(60, 8), (3600, 40)],      # AI 整理、抓地點
    "geo": [(60, 15), (3600, 120)],   # 補座標
    "sync": [(60, 60)],               # 同步讀寫（開著網站時約每分鐘一次）
    "sync_new": [(3600, 5)],          # 建立新的同步碼
}
DAILY_LIMITS = {
    "ai": int(os.getenv("DAILY_AI_LIMIT", "150")),
    "geo": int(os.getenv("DAILY_GEO_LIMIT", "300")),
}

_rate_lock = threading.Lock()
_hits = {}                 # (類別, IP) → 最近的請求時間
_daily = {"day": "", "ai": 0, "geo": 0}
_last_prune = [0.0]


def client_ip():
    # Cloud Run 會把真正的來源 IP 放在 X-Forwarded-For 的最後面（前面的值可能是使用者自己填的）
    fwd = request.headers.get("X-Forwarded-For", "")
    ip = fwd.split(",")[-1].strip() if fwd else ""
    return ip or request.remote_addr or "?"


def _wait_text(sec):
    return f"{int(sec) + 1} 秒" if sec < 60 else f"{int(sec // 60) + 1} 分鐘"


def check_rate(kind):
    """超過限制時回傳錯誤訊息，沒超過就記一次並回傳 None"""
    rules = RATE_RULES[kind]
    now = time.time()
    key = (kind, client_ip())
    with _rate_lock:
        if now - _last_prune[0] > 600:      # 定期清掉很久沒來的 IP
            longest = max(w for r in RATE_RULES.values() for w, _ in r)
            for k in [k for k, q in _hits.items() if not q or now - q[-1] > longest]:
                del _hits[k]
            _last_prune[0] = now
        q = _hits.setdefault(key, deque())
        longest = max(w for w, _ in rules)
        while q and now - q[0] > longest:
            q.popleft()
        for window, limit in rules:
            recent = [t for t in q if now - t <= window]
            if len(recent) >= limit:
                wait = window - (now - recent[0])
                return f"使用太頻繁了，請過 {_wait_text(wait)}再試"
        q.append(now)
    return None


def use_daily(kind, n=1):
    """每天的總量上限（所有人加起來）。超過回傳 False"""
    today = date.today().isoformat()
    with _rate_lock:
        if _daily["day"] != today:
            _daily.update(day=today, ai=0, geo=0)
        if _daily[kind] + n > DAILY_LIMITS[kind]:
            return False
        _daily[kind] += n
        return True


def limited(kind, daily=False):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method == "OPTIONS":
                return fn(*args, **kwargs)
            msg = check_rate(kind)
            if msg:
                return error(msg, 429)
            if daily and not use_daily(kind):
                print(f"今天的 {kind} 總量已達上限 {DAILY_LIMITS[kind]}")
                return error("今天的 AI 使用量已達上限，明天再試，或請網站管理員調整", 429)
            return fn(*args, **kwargs)
        return wrapper
    return deco


def ai_failed(e, where):
    print(f"{where} 錯誤:", repr(e))
    msg = str(e)
    if isinstance(e, AIError):
        return error(msg, 400)
    if "API key" in msg or "PERMISSION_DENIED" in msg or "401" in msg:
        return error("AI 金鑰設定有問題，請檢查伺服器的 GEMINI_API_KEY", 502)
    if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
        return error("AI 使用量暫時達到上限，請稍後再試", 429)
    return error("AI 服務暫時無法使用，請稍後再試", 502)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "ai": AI_PROVIDER, "sync": True})


# ===============================
# 行程解析
# ===============================

@app.route("/parse", methods=["POST"])
@limited("ai", daily=True)
def parse_trip():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", ""))[:MAX_TEXT]
    today = str(data.get("today") or date.today().isoformat())
    if not text.strip():
        return error("沒有收到行程內容")

    prompt = f"""
你是旅行資料整理助手。請把使用者貼上的旅行資料整理成 JSON 物件，格式如下：

{{
  "title": "簡短的行程名稱，例如「沖繩 5 天 4 夜」",
  "destination": "主要目的地城市或地區，例如「沖繩」「台南」",
  "start_date": "第一天的日期 YYYY-MM-DD，不知道就留空字串",
  "flight": {{"depart": "去程交通，含日期時間與班次，例如 2025/11/20 08:30 CI120 桃園→那霸", "return": "回程交通"}},
  "hotels": [
    {{"name": "", "address": "", "phone": "", "dates": "入住期間，例如 11/20–11/22", "code": "訂房代號"}}
  ],
  "days": [
    {{"title": "Day1", "date": "YYYY-MM-DD 或空字串",
      "items": [{{"time": "09:00 或空字串", "text": "地點或活動", "note": "補充說明"}}]}}
  ]
}}

規則：
- 今天是 {today}。資料沒寫年份時，推斷為最接近的未來日期。
- 國內旅遊（例如搭高鐵、自駕）也可以，交通資訊一樣放在 flight 的 depart / return。
- items 的 text 盡量寫成可以在 Google 地圖搜尋到的店名或景點名稱；非地點的活動（例如「Check-in」「自由活動」）照原文簡短寫。
- 依照原文順序排列，不要自行重新排序或增加原文沒有的行程。
- 沒有的資料留空字串或空陣列，不要編造。

內容：
{text}
"""
    try:
        result = ask_json(prompt)
    except Exception as e:  # noqa: BLE001
        return ai_failed(e, "parse")
    # data 給新版前端；result（字串）保留給舊版前端相容
    return jsonify({"data": result, "result": json.dumps(result, ensure_ascii=False)})


# ===============================
# AI 抽取景點
# ===============================

PLACES_FORMAT = f"""
回傳 JSON 物件：
{{"places": [{{"name": "店名或景點名稱（用常見寫法，方便在 Google 地圖搜尋）", "category": "food", "area": "所在城市或區域，不知道就空字串", "note": "一句話重點，例如必點菜色、特色，沒有就空字串"}}]}}

規則：
- {CATEGORY_HINT}
- 同一個地點只列一次；不要列出國家、城市名稱本身或連鎖品牌總稱。
- 找不到任何地點就回傳 {{"places": []}}。
"""


def clean_places(result):
    places = result.get("places", []) if isinstance(result, dict) else []
    return [p for p in places if isinstance(p, dict) and p.get("name")]


def extract_places_from_text(text, title=""):
    prompt = f"""
從以下旅遊內容中找出所有「可以實際前往」的景點、餐廳、咖啡廳或商店。
{PLACES_FORMAT}
{f"文章標題：{title}" if title else ""}
內容：
{text}
"""
    return clean_places(ask_json(prompt))


@app.route("/extract_places", methods=["POST"])
@limited("ai", daily=True)
def extract_places():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", ""))[:MAX_TEXT]
    if not text.strip():
        return error("沒有收到內容")
    try:
        return jsonify({"places": extract_places_from_text(text)})
    except Exception as e:  # noqa: BLE001
        return ai_failed(e, "extract_places")


# ===============================
# 網址 / YouTube 抽取景點
# ===============================

def youtube_url(url):
    """是 YouTube 影片就回傳標準網址，否則回傳 None"""
    try:
        u = urlparse(url)
    except ValueError:
        return None
    host = (u.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    vid = None
    if host == "youtu.be":
        vid = u.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "music.youtube.com"):
        if u.path == "/watch":
            vid = (parse_qs(u.query).get("v") or [None])[0]
        elif u.path.startswith(("/shorts/", "/live/", "/embed/")):
            vid = u.path.split("/")[2] if len(u.path.split("/")) > 2 else None
    if vid and re.fullmatch(r"[\w-]{6,20}", vid):
        return f"https://www.youtube.com/watch?v={vid}"
    return None


def youtube_title(url):
    try:
        r = requests.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}, timeout=6)
        return r.json().get("title", "") if r.ok else ""
    except Exception:  # noqa: BLE001
        return ""


def is_public_url(url):
    """避免伺服器被拿去讀取內部網路（SSRF）"""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        for info in socket.getaddrinfo(parsed.hostname, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return True
    except Exception:  # noqa: BLE001
        return False


def fetch_page(url):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8,ja;q=0.7",
    }
    for _ in range(4):  # 手動處理轉址，每一步都檢查
        if not is_public_url(url):
            raise ValueError("不支援的網址")
        r = requests.get(url, headers=headers, timeout=12, allow_redirects=False)
        if r.is_redirect and r.headers.get("location"):
            url = urljoin(url, r.headers["location"])
            continue
        r.encoding = r.apparent_encoding or r.encoding
        return r.text[:2_000_000]
    raise ValueError("轉址太多次")


@app.route("/extract_url", methods=["POST"])
@limited("ai", daily=True)
def extract_url():
    data = request.get_json(silent=True) or {}
    url = str(data.get("text", "")).strip()

    # YouTube：直接讓 Gemini 看影片
    yt = youtube_url(url)
    if yt:
        title = youtube_title(yt)
        prompt = f"""
這是一支旅遊相關的 YouTube 影片{f"「{title}」" if title else ""}。
請從影片的畫面、字幕和旁白中，找出所有介紹到、可以實際前往的景點、餐廳、咖啡廳或商店。
{PLACES_FORMAT}
"""
        try:
            places = clean_places(ask_json(prompt, video_url=yt))
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if "INVALID_ARGUMENT" in msg or "not found" in msg.lower() or "private" in msg.lower():
                return error("這支影片無法讀取，可能是私人或未公開影片", 400)
            return ai_failed(e, "youtube")
        return jsonify({"places": places, "title": title, "source": yt, "video": True})

    try:
        html = fetch_page(url)
    except Exception as e:  # noqa: BLE001
        print("URL 抓取錯誤:", e)
        return jsonify({"places": [], "title": ""})

    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string or "").strip() if soup.title and soup.title.string else ""

    # 社群網站常常只有 meta 描述（例如影片說明文字）
    metas = []
    for key in ("og:title", "og:description", "description", "twitter:description"):
        tag = soup.find("meta", attrs={"property": key}) or soup.find("meta", attrs={"name": key})
        if tag and tag.get("content"):
            metas.append(tag["content"])

    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "svg", "form"]):
        tag.decompose()
    body = " ".join(soup.get_text(" ").split())

    text = ("\n".join(metas) + "\n" + body)[:MAX_TEXT]
    if len(text.strip()) < 20:
        return jsonify({"places": [], "title": title})

    try:
        return jsonify({"places": extract_places_from_text(text, title), "title": title})
    except Exception as e:  # noqa: BLE001
        return ai_failed(e, "extract_url")


# ===============================
# 地點轉座標
# ===============================

_session = requests.Session()


def geocode(query):
    res = _session.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"address": query, "key": GOOGLE_KEY, "language": "zh-TW"},
        timeout=8,
    ).json()
    results = res.get("results") or []
    return results[0] if results else None


@app.route("/enrich_locations", methods=["POST"])
@limited("geo")
def enrich_locations():
    data = request.get_json(silent=True) or {}
    places = data.get("places", [])[:MAX_PLACES]
    hints = data.get("hints", []) or []

    if not GOOGLE_KEY:
        return jsonify([])

    results = []
    for i, name in enumerate(places):
        name = str(name or "").strip()
        if not name:
            continue
        hint = str(hints[i]).strip() if i < len(hints) and hints[i] else ""
        try:
            r = None
            # 有地區提示時先加上地區查，查不到再只用名稱查
            if hint and hint not in name:
                if not use_daily("geo"):
                    break
                r = geocode(f"{name} {hint}")
            if not r:
                if not use_daily("geo"):
                    break
                r = geocode(name)
            if r:
                loc = r["geometry"]["location"]
                results.append({
                    "index": i,
                    "name": name,
                    "lat": loc["lat"],
                    "lng": loc["lng"],
                    "place_id": r.get("place_id", ""),
                    "address": r.get("formatted_address", ""),
                })
        except Exception as e:  # noqa: BLE001
            print("地點解析錯誤:", name, e)

    return jsonify(results)


# ===============================
# 雲端同步（Firestore）
# 同步碼本身就是鑰匙：資料庫只存同步碼的雜湊值，不存同步碼本身
# ===============================

_db = None
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 去掉容易看錯的 I O 0 1


def firestore_db():
    global _db
    if _db is None:
        from google.cloud import firestore
        _db = firestore.Client()
    return _db


def normalize_code(code):
    c = re.sub(r"[^A-Z0-9]", "", str(code or "").upper())
    return c if len(c) == 12 and all(ch in CODE_ALPHABET for ch in c) else None


def doc_ref(code):
    key = hashlib.sha256(("etrip:" + code).encode()).hexdigest()
    return firestore_db().collection(SYNC_COLLECTION).document(key)


def pack(data):
    blob = zlib.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(), 9)
    if len(blob) > MAX_SYNC_BYTES:
        raise ValueError("資料太大，超過雲端同步的上限")
    return blob


def unpack(blob):
    return json.loads(zlib.decompress(blob).decode())


def sync_unavailable(e):
    print("sync 錯誤:", repr(e))
    return error("雲端同步暫時無法使用，請確認伺服器已開啟 Firestore", 503)


@app.route("/sync", methods=["POST"])
@limited("sync_new")
def sync_create():
    data = (request.get_json(silent=True) or {}).get("data")
    if not isinstance(data, dict):
        return error("沒有收到資料")
    try:
        blob = pack(data)
        from google.cloud import firestore
        for _ in range(5):
            code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(12))
            ref = doc_ref(code)
            if not ref.get().exists:
                ref.set({"data": blob, "version": 1, "updatedAt": firestore.SERVER_TIMESTAMP})
                pretty = f"{code[:4]}-{code[4:8]}-{code[8:]}"
                return jsonify({"code": pretty, "version": 1})
        return error("建立同步碼失敗，請再試一次", 500)
    except ValueError as e:
        return error(str(e), 413)
    except Exception as e:  # noqa: BLE001
        return sync_unavailable(e)


@app.route("/sync/<code>", methods=["GET"])
@limited("sync")
def sync_get(code):
    c = normalize_code(code)
    if not c:
        return error("同步碼格式不正確", 400)
    try:
        snap = doc_ref(c).get()
        if not snap.exists:
            return error("找不到這個同步碼", 404)
        d = snap.to_dict()
        return jsonify({"version": d.get("version", 1), "data": unpack(d["data"])})
    except Exception as e:  # noqa: BLE001
        return sync_unavailable(e)


@app.route("/sync/<code>", methods=["PUT"])
@limited("sync")
def sync_put(code):
    c = normalize_code(code)
    if not c:
        return error("同步碼格式不正確", 400)
    body = request.get_json(silent=True) or {}
    data, base = body.get("data"), body.get("baseVersion")
    if not isinstance(data, dict) or not isinstance(base, int):
        return error("資料格式不正確")
    try:
        blob = pack(data)
        from google.cloud import firestore
        db = firestore_db()
        ref = doc_ref(c)

        @firestore.transactional
        def save(tx):
            snap = ref.get(transaction=tx)
            if not snap.exists:
                return 404, None
            d = snap.to_dict()
            current = d.get("version", 1)
            if current != base:
                # 別台裝置先存了：把雲端的版本回傳，讓前端合併後再存
                return 409, {"version": current, "data": unpack(d["data"])}
            tx.update(ref, {"data": blob, "version": current + 1, "updatedAt": firestore.SERVER_TIMESTAMP})
            return 200, {"version": current + 1}

        status, payload = save(db.transaction())
        if status == 404:
            return error("找不到這個同步碼", 404)
        if status == 409:
            return jsonify({"conflict": True, **payload}), 409
        return jsonify(payload)
    except ValueError as e:
        return error(str(e), 413)
    except Exception as e:  # noqa: BLE001
        return sync_unavailable(e)


@app.route("/sync/<code>", methods=["DELETE"])
@limited("sync")
def sync_delete(code):
    """刪除雲端上的資料（換新同步碼、或不再使用雲端同步時）"""
    c = normalize_code(code)
    if not c:
        return error("同步碼格式不正確", 400)
    try:
        ref = doc_ref(c)
        if not ref.get().exists:
            return error("找不到這個同步碼", 404)
        ref.delete()
        return jsonify({"ok": True})
    except Exception as e:  # noqa: BLE001
        return sync_unavailable(e)


# ===============================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
