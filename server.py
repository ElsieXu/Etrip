"""
Etrip 後端（Flask，部署在 Google Cloud Run）

- /parse              AI 把雜亂的行程文字整理成 JSON
- /extract_places     AI 從文字中抽出景點 / 餐廳 / 商店
- /extract_url        讀取網址抽出地點；YouTube 影片會直接讓 Gemini 看影片；
                      IG 貼文會讀公開的說明文字，讀不到時請前端改上傳影片或截圖
- /extract_media      上傳影片或截圖（例如 IG 影片、螢幕錄影），讓 Gemini 看內容找地點
- /enrich_locations   地點名稱轉座標（先用 Places API 文字搜尋，沒開時用 Geocoding API）
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
  DAILY_AI_LIMIT       選填，每台機器每天最多幾次 AI 請求，預設 20
  DAILY_GEO_LIMIT      選填，每台機器每天最多查幾次座標，預設 150
  MONTHLY_AI_BUDGET_USD  選填，每月 AI 預算（美元），預設 10；用到 85% 提醒，100% 停用
  GEMINI_PRICE_IN / GEMINI_PRICE_AUDIO / GEMINI_PRICE_OUT
                       選填，每百萬 tokens 的價格（美元），用來估算花費，預設 0.30 / 1.00 / 2.50
  VIDEO_MAX_MINUTES    選填，YouTube 影片最多看幾分鐘，預設 50
  MEDIA_MAX_MB         選填，上傳的影片或截圖總共最多幾 MB，預設 14（Gemini 一次請求的上限約 20MB）

防濫用：每個 IP 有使用次數限制（見 RATE_RULES），加上每天的總量上限。
網址是公開的，任何人都能直接呼叫，這些限制讓費用不會失控。

  AI_PROVIDER          選填：vertex（Vertex AI，費用算在 Google Cloud 帳單，可以用抵免額）、
                       gemini（AI Studio 金鑰）、openai。沒設定時有 GEMINI_API_KEY 就用 gemini
  VERTEX_LOCATION      選填，Vertex AI 的區域，預設 global
  VERTEX_PROJECT       選填，Vertex AI 用哪個專案，預設是 Cloud Run 所在的專案
  VIDEO_FALLBACK       選填，Vertex 讀不了 YouTube 影片時改用 AI Studio 金鑰（需要 GEMINI_API_KEY），預設 1

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
from datetime import date, datetime, timedelta, timezone
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
JSON_MAX_BYTES = 8 * 1024 * 1024
MEDIA_MAX_BYTES = int(float(os.getenv("MEDIA_MAX_MB", "14")) * 1024 * 1024)   # 上傳的影片 / 截圖
MEDIA_MAX_IMAGES = 40
# 整體上限放寬給上傳用；其他端點在 limit_body_size 維持 8MB
app.config["MAX_CONTENT_LENGTH"] = max(JSON_MAX_BYTES, MEDIA_MAX_BYTES + 1024 * 1024)
app.json.ensure_ascii = False   # 中文直接顯示，瀏覽器打開網址時看得懂

_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
CORS(app, resources={r"/*": {"origins": _origins or "*"}})

GOOGLE_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
AI_PROVIDER = (os.getenv("AI_PROVIDER") or ("gemini" if os.getenv("GEMINI_API_KEY") else "openai")).strip().lower()
USES_GEMINI = AI_PROVIDER in ("gemini", "vertex")   # 兩種都是 Gemini 模型，計費方式不同
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "global")
VIDEO_FALLBACK = os.getenv("VIDEO_FALLBACK", "1") not in ("0", "false", "no")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_VIDEO_MODEL = os.getenv("GEMINI_VIDEO_MODEL", GEMINI_MODEL)
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
SYNC_COLLECTION = os.getenv("SYNC_COLLECTION", "etrip_sync")

# 後端版本：每次修改 server.py 時更新，部署後打開 /health 就能確認是不是新版
APP_VERSION = "2026-11-23"

MAX_TEXT = 15000        # 送給 AI 的文字上限
MAX_PLACES = 80         # 一次最多補幾個座標
MAX_SYNC_BYTES = 900_000  # Firestore 單筆上限約 1MB（壓縮後）
VIDEO_MAX_SECONDS = int(float(os.getenv("VIDEO_MAX_MINUTES", "50")) * 60)

# 每月 AI 預算：用每次回應的 token 數估算花費，存在 Firestore（所有機器共用）
MONTHLY_AI_BUDGET_USD = float(os.getenv("MONTHLY_AI_BUDGET_USD", "10"))
BUDGET_WARN_RATIO = 0.85
PRICE_IN = float(os.getenv("GEMINI_PRICE_IN", "0.30"))        # 文字、圖片、影片畫面
PRICE_AUDIO = float(os.getenv("GEMINI_PRICE_AUDIO", "1.00"))  # 影片的聲音（通常比較貴）
PRICE_OUT = float(os.getenv("GEMINI_PRICE_OUT", "2.50"))      # 回應（含思考）
USAGE_COLLECTION = os.getenv("USAGE_COLLECTION", "etrip_usage")

CATEGORY_HINT = "category 只能是 food（餐廳小吃）、cafe（咖啡甜點）、sight（景點）、shop（購物）、other 其中之一"


class AIError(Exception):
    pass


# ===============================
# AI 呼叫（Gemini 為主，OpenAI 備用）
# ===============================

_gemini = None
_vertex = None
_openai = None


def gemini_client():
    global _gemini
    if _gemini is None:
        from google import genai
        _gemini = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    return _gemini


def vertex_client():
    """Vertex AI：用 Cloud Run 本身的權限，不需要金鑰；費用算在 Google Cloud 帳單（可以用抵免額）"""
    global _vertex
    if _vertex is None:
        from google import genai
        project = os.getenv("VERTEX_PROJECT") or os.getenv("GOOGLE_CLOUD_PROJECT")
        if not project:
            import google.auth
            _, project = google.auth.default()
        _vertex = genai.Client(vertexai=True, project=project, location=VERTEX_LOCATION)
    return _vertex


def ai_client():
    return vertex_client() if AI_PROVIDER == "vertex" else gemini_client()


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


def ask_json(prompt, video_url=None, clip=False, media=None):
    """送出提示並取得 JSON 物件；video_url 是 YouTube 網址時會一起送影片，clip=True 只看前 VIDEO_MAX_SECONDS 秒。
    media 是上傳的檔案 [(內容 bytes, MIME 類型), …]，可以是一支影片或多張圖片"""
    if AI_PROVIDER == "openai":
        if video_url or media:
            raise AIError("目前的 AI 設定不支援讀取影片或圖片，請改用 Gemini")
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
        meta = types.VideoMetadata(end_offset=f"{VIDEO_MAX_SECONDS}s") if clip else None
        contents = [types.Part(file_data=types.FileData(file_uri=video_url), video_metadata=meta), prompt]
        config["media_resolution"] = types.MediaResolution.MEDIA_RESOLUTION_LOW
        model = GEMINI_VIDEO_MODEL
    elif media:
        contents = [types.Part.from_bytes(data=b, mime_type=m) for b, m in media] + [prompt]
        if any(m.startswith("video/") for _, m in media):
            config["media_resolution"] = types.MediaResolution.MEDIA_RESOLUTION_LOW
            model = GEMINI_VIDEO_MODEL
    cfg = types.GenerateContentConfig(**config)
    try:
        res = ai_client().models.generate_content(model=model, contents=contents, config=cfg)
    except Exception as e:  # noqa: BLE001
        # Vertex AI 讀不了 YouTube 影片時，影片改用 AI Studio 金鑰
        if not (video_url and AI_PROVIDER == "vertex" and VIDEO_FALLBACK and os.getenv("GEMINI_API_KEY")):
            raise
        if "spend" in str(e).lower() or "RESOURCE_EXHAUSTED" in str(e):
            raise
        print("Vertex AI 讀影片失敗，改用 AI Studio 金鑰:", repr(e))
        res = gemini_client().models.generate_content(model=model, contents=contents, config=cfg)
    add_usage(cost_of(getattr(res, "usage_metadata", None), video=bool(video_url)))
    return parse_json_text(res.text)


# ===============================
# 每月 AI 預算
# ===============================

def billing_month():
    # Google 帳單以太平洋時間為準，這裡用 UTC-8 近似
    return (datetime.now(timezone.utc) - timedelta(hours=8)).strftime("%Y-%m")


def cost_of(u, video=False):
    """用 token 數估算這次花了多少美元"""
    if u is None:
        # 沒有用量資料時保守估計
        return (VIDEO_MAX_SECONDS * 100 * PRICE_AUDIO if video else 8000 * PRICE_IN + 3000 * PRICE_OUT) / 1e6
    prompt = u.prompt_token_count or 0
    audio = sum((d.token_count or 0) for d in (u.prompt_tokens_details or []) if "AUDIO" in str(d.modality).upper())
    out = (u.candidates_token_count or 0) + (u.thoughts_token_count or 0)
    return ((prompt - audio) * PRICE_IN + audio * PRICE_AUDIO + out * PRICE_OUT) / 1e6


_usage = {"month": "", "usd": 0.0, "ts": 0.0}


def usage_ref(month):
    return firestore_db().collection(USAGE_COLLECTION).document(month)


def usage_usd():
    """這個月已經花了多少（每分鐘最多讀一次資料庫）"""
    m, now = billing_month(), time.time()
    if _usage["month"] == m and now - _usage["ts"] < 60:
        return _usage["usd"]
    try:
        snap = usage_ref(m).get()
        usd = float((snap.to_dict() or {}).get("usd", 0)) if snap.exists else 0.0
    except Exception as e:  # noqa: BLE001
        print("讀取用量失敗:", repr(e))
        usd = _usage["usd"] if _usage["month"] == m else 0.0
    _usage.update(month=m, usd=usd, ts=now)
    return usd


def add_usage(usd):
    if usd <= 0:
        return
    m = billing_month()
    if _usage["month"] != m:
        usage_usd()
    _usage["usd"] += usd
    try:
        from google.cloud import firestore
        usage_ref(m).set({"usd": firestore.Increment(usd), "calls": firestore.Increment(1),
                          "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    except Exception as e:  # noqa: BLE001
        print("記錄用量失敗:", repr(e))


def budget_info():
    pct = usage_usd() / MONTHLY_AI_BUDGET_USD * 100 if MONTHLY_AI_BUDGET_USD > 0 else 0
    return {"pct": min(100, round(pct)), "month": billing_month()}


BUDGET_OUT_MSG = "這個月的 AI 額度用完了，下個月 1 號會恢復。其他功能都可以正常使用"


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
    "ai": int(os.getenv("DAILY_AI_LIMIT", "20")),
    "geo": int(os.getenv("DAILY_GEO_LIMIT", "150")),
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


def refund_daily(kind, n=1):
    """這次其實沒有用到 AI（例如 IG 貼文讀不到內容），把每天的額度還回去"""
    with _rate_lock:
        _daily[kind] = max(0, _daily[kind] - n)


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
            if kind == "ai" and USES_GEMINI and budget_info()["pct"] >= 100:
                return jsonify({"error": BUDGET_OUT_MSG, "budget": budget_info()}), 429
            if daily and not use_daily(kind):
                print(f"今天的 {kind} 總量已達上限 {DAILY_LIMITS[kind]}")
                return error("今天的 AI 使用量已達上限，明天再試，或請網站管理員調整", 429)
            return fn(*args, **kwargs)
        return wrapper
    return deco


AI_ENDPOINTS = {"parse_trip", "extract_places", "extract_url", "extract_media"}


@app.before_request
def limit_body_size():
    """只有上傳影片 / 截圖可以超過 8MB"""
    if request.endpoint != "extract_media" and (request.content_length or 0) > JSON_MAX_BYTES:
        return error("內容太大了", 413)


@app.errorhandler(413)
def too_large(_e):
    return error(f"檔案太大了，最多 {MEDIA_MAX_BYTES // (1024 * 1024)}MB。影片請剪短一點，或改上傳截圖", 413)


@app.after_request
def attach_budget(resp):
    """AI 的回應附上本月額度用了幾 %，前端到 85% 會提醒"""
    if request.endpoint in AI_ENDPOINTS and resp.status_code == 200 and resp.is_json and USES_GEMINI:
        data = resp.get_json(silent=True)
        if isinstance(data, dict):
            try:
                data["budget"] = budget_info()
                resp.set_data(json.dumps(data, ensure_ascii=False))
            except Exception as e:  # noqa: BLE001
                print("附加用量失敗:", repr(e))
    return resp


def ai_failed(e, where):
    print(f"{where} 錯誤:", repr(e))
    msg = str(e)
    if isinstance(e, AIError):
        return error(msg, 400)
    if AI_PROVIDER == "vertex" and ("PERMISSION_DENIED" in msg or "403" in msg or "SERVICE_DISABLED" in msg):
        return error("伺服器還不能使用 Vertex AI：請確認已開啟 Vertex AI API，並給 Cloud Run「Vertex AI 使用者」權限（見 MAINTENANCE.md）", 502)
    if "API key" in msg or "PERMISSION_DENIED" in msg or "401" in msg:
        return error("AI 金鑰設定有問題，請檢查伺服器的 GEMINI_API_KEY", 502)
    if "NOT_FOUND" in msg and "model" in msg.lower():
        return error("找不到設定的 AI 模型，可能已經退役，請更新 GEMINI_MODEL（見 MAINTENANCE.md）", 502)
    if "spend" in msg.lower():
        # AI Studio 的每月花費上限到了
        _usage.update(month=billing_month(), usd=max(_usage["usd"], MONTHLY_AI_BUDGET_USD), ts=time.time())
        return jsonify({"error": BUDGET_OUT_MSG, "budget": {"pct": 100, "month": billing_month()}}), 429
    if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
        return error("AI 使用量暫時達到上限，請稍後再試", 429)
    return error("AI 服務暫時無法使用，請稍後再試", 502)


@app.route("/", methods=["GET"])
def home():
    return jsonify({"ok": True, "message": "Etrip 後端運作中。檢查狀態請打開 /health", "version": APP_VERSION})


@app.route("/health", methods=["GET"])
def health():
    # K_REVISION 是 Cloud Run 自動提供的部署編號，每部署一次就會變
    return jsonify({"ok": True, "ai": AI_PROVIDER, "sync": True, "version": APP_VERSION,
                    "revision": os.getenv("K_REVISION", "")})


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


def youtube_seconds(url):
    """影片長度（秒），讀不到回傳 None"""
    try:
        r = requests.get(url, headers={"Accept-Language": "en"}, timeout=8)
        m = re.search(r'"lengthSeconds":"(\d+)"', r.text)
        return int(m.group(1)) if m else None
    except Exception:  # noqa: BLE001
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


BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# IG 對一般瀏覽器只回登入頁，對「連結預覽」的請求才會附上貼文說明（og:description）
PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"


def fetch_page(url, user_agent=BROWSER_UA):
    headers = {
        "User-Agent": user_agent,
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


def is_instagram(url):
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host in ("instagram.com", "instagr.am") or host.endswith(".instagram.com")


def instagram_caption(url):
    """讀公開 IG 貼文的說明文字；讀不到（私人帳號、被擋、沒寫說明）回傳空字串"""
    try:
        html = fetch_page(url, PREVIEW_UA)
    except Exception as e:  # noqa: BLE001
        print("IG 抓取錯誤:", e)
        return ""
    soup = BeautifulSoup(html, "html.parser")
    best = ""
    for key in ("og:description", "og:title"):
        tag = soup.find("meta", attrs={"property": key})
        text = (tag.get("content") or "").strip() if tag else ""
        # 格式是「1,234 likes, 56 comments - 帳號 on 日期: "說明文字"」，只留引號裡的說明
        m = re.search(r':\s*["“](.*)["”]\.?\s*$', text, flags=re.S)
        if m and len(m.group(1)) > len(best):
            best = m.group(1).strip()
    return best


IG_NEED_UPLOAD = {"places": [], "title": "", "social": "instagram", "need_upload": True}


def media_kind(mime, data):
    """只收常見的影片與圖片格式，回傳 Gemini 看得懂的 MIME 類型"""
    mime = (mime or "").split(";")[0].strip().lower()
    if mime in ("image/jpeg", "image/jpg") and data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if mime == "image/png" and data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if mime == "image/webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if mime in ("video/mp4", "video/quicktime", "video/mov", "video/x-m4v") and data[4:8] == b"ftyp":
        if mime in ("video/quicktime", "video/mov"):
            return "video/quicktime" if AI_PROVIDER == "vertex" else "video/mov"
        return "video/mp4"
    if mime == "video/webm" and data[:4] == b"\x1a\x45\xdf\xa3":
        return "video/webm"
    return None


@app.route("/extract_media", methods=["POST"])
@limited("ai", daily=True)
def extract_media():
    """上傳一支影片或幾張截圖（IG、TikTok 等讀不到網址的貼文），讓 Gemini 看內容找地點"""
    files = [f for f in request.files.getlist("media") if f and f.filename]
    caption = str(request.form.get("caption", "")).strip()[:MAX_TEXT]

    def reject(message, status=400):
        refund_daily("ai")   # 還沒用到 AI
        return error(message, status)

    if not files:
        return reject("沒有收到影片或截圖")
    if len(files) > MEDIA_MAX_IMAGES:
        return reject(f"一次最多 {MEDIA_MAX_IMAGES} 張圖片")

    media, total = [], 0
    for f in files:
        data = f.read()
        total += len(data)
        if total > MEDIA_MAX_BYTES:
            refund_daily("ai")
            return too_large(None)
        kind = media_kind(f.mimetype, data)
        if not kind:
            return reject("這個檔案格式讀不了，請上傳 MP4 / MOV 影片，或 JPG / PNG 截圖")
        media.append((data, kind))

    has_video = any(m.startswith("video/") for _, m in media)
    if has_video and len(media) > 1:
        return reject("一次只能上傳一支影片，或是幾張截圖")

    what = "影片" if has_video else "截圖或影片畫面（依照時間順序）"
    caption_block = f"貼文的說明文字（可以用來確認店名與地區）：\n{caption}" if caption else ""
    prompt = f"""
這是一則旅遊相關社群貼文（例如 Instagram）的{what}。
請從畫面、畫面上的文字、字幕{"和旁白" if has_video else ""}中，找出所有介紹到、可以實際前往的景點、餐廳、咖啡廳或商店。
{"請仔細聽完整段聲音：旁白或對話裡口頭提到、但畫面上沒有出現文字的地點，也一定要列出來。" if has_video else ""}
{PLACES_FORMAT}
{caption_block}
"""
    try:
        places = clean_places(ask_json(prompt, media=media))
    except Exception as e:  # noqa: BLE001
        if "INVALID_ARGUMENT" in str(e):
            print("extract_media 錯誤:", repr(e))
            return error("AI 讀不了這個檔案，請換一個格式（MP4 影片或 JPG 截圖），或把影片剪短一點", 400)
        return ai_failed(e, "extract_media")
    return jsonify({"places": places, "title": "", "video": has_video})


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
        secs = youtube_seconds(yt)
        clip = secs is None or secs > VIDEO_MAX_SECONDS   # 不知道長度時也先剪，避免超長影片
        try:
            try:
                places = clean_places(ask_json(prompt, video_url=yt, clip=clip))
            except Exception as e:  # noqa: BLE001
                # 不知道長度、影片其實比上限短時，剪輯的位置超過片長可能會被拒絕：改成不剪再試一次
                if not (clip and secs is None and "INVALID_ARGUMENT" in str(e)):
                    raise
                places = clean_places(ask_json(prompt, video_url=yt))
        except Exception as e:  # noqa: BLE001
            msg = str(e)
            if "INVALID_ARGUMENT" in msg or "not found" in msg.lower() or "private" in msg.lower():
                return error("這支影片無法讀取，可能是私人或未公開影片", 400)
            return ai_failed(e, "youtube")
        clipped = bool(secs and secs > VIDEO_MAX_SECONDS)
        return jsonify({"places": places, "title": title, "source": yt, "video": True,
                        "clipped_minutes": VIDEO_MAX_SECONDS // 60 if clipped else 0})

    # IG：先試著讀公開的說明文字；讀不到或裡面沒有地點，請前端改上傳影片 / 截圖
    if is_instagram(url):
        caption = instagram_caption(url)
        if len(caption) < 10:
            refund_daily("ai")   # 沒有用到 AI
            return jsonify(IG_NEED_UPLOAD)
        try:
            places = extract_places_from_text(caption[:MAX_TEXT])
        except Exception as e:  # noqa: BLE001
            return ai_failed(e, "instagram")
        # caption 一起回傳：之後上傳影片時可以當作參考
        return jsonify({"places": places, "title": "", "social": "instagram", "caption_only": True,
                        "caption": caption[:MAX_TEXT], "need_upload": not places})

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


# 只代表「一整個區域」的結果（國家、縣市、鄉鎮、郵遞區號…）。
# 查店名查不到時，Google 常常回傳這種結果，存下來會讓好幾個地點疊在同一點、導航到錯的地方，
# 所以除非查的本來就是地名，一律當作沒找到。
AREA_TYPES = {
    "political", "country", "administrative_area_level_1", "administrative_area_level_2",
    "administrative_area_level_3", "administrative_area_level_4", "administrative_area_level_5",
    "locality", "sublocality", "sublocality_level_1", "sublocality_level_2", "sublocality_level_3",
    "sublocality_level_4", "sublocality_level_5", "neighborhood", "colloquial_area",
    "postal_code", "postal_town", "archipelago", "continent",
}


def is_area_only(types):
    types = set(types or [])
    return not types or types <= AREA_TYPES


# 地點搜尋（Places API）沒有開啟或金鑰沒有權限時，記下來之後就不再試，直接用地址查詢
_places_disabled = False


def places_search(query):
    """用 Places API（New）的文字搜尋找店名、景點：比地址查詢準很多"""
    global _places_disabled
    if _places_disabled:
        return None
    try:
        res = _session.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers={
                "X-Goog-Api-Key": GOOGLE_KEY,
                "X-Goog-FieldMask": "places.id,places.location,places.formattedAddress,places.types",
            },
            json={"textQuery": query, "languageCode": "zh-TW", "pageSize": 1},
            timeout=8,
        )
    except requests.RequestException as e:
        print("地點搜尋連線錯誤:", e)
        return None
    if res.status_code in (401, 403):
        _places_disabled = True
        print("地點搜尋（Places API）無法使用，改用地址查詢:", res.text[:300])
        return None
    if not res.ok:
        print("地點搜尋錯誤:", res.status_code, res.text[:300])
        return None
    for p in res.json().get("places") or []:
        loc = p.get("location") or {}
        if loc.get("latitude") is None or is_area_only(p.get("types")):
            continue
        return {"lat": loc["latitude"], "lng": loc["longitude"],
                "place_id": p.get("id", ""), "address": p.get("formattedAddress", "")}
    return None


def geocode(query, allow_area=False):
    """地址查詢（Geocoding API）。allow_area=False 時，只查到整個區域就當作沒找到"""
    res = _session.get(
        "https://maps.googleapis.com/maps/api/geocode/json",
        params={"address": query, "key": GOOGLE_KEY, "language": "zh-TW"},
        timeout=8,
    ).json()
    for r in res.get("results") or []:
        if not allow_area and is_area_only(r.get("types")):
            continue
        loc = r["geometry"]["location"]
        return {"lat": loc["lat"], "lng": loc["lng"],
                "place_id": r.get("place_id", ""), "address": r.get("formatted_address", "")}
    return None


def locate(name, hint):
    """找一個地點的座標：先用地點搜尋，再用地址查詢；有地區提示時先加上地區查"""
    queries = [f"{name} {hint}", name] if hint and hint not in name else [name]
    for q in queries:
        if not use_daily("geo"):
            return None, False
        r = places_search(q)
        if r:
            return r, True
        # 只有「沒加地區、查的本身就是地名」（例如「九份」）時，才接受整個區域的結果
        r = geocode(q, allow_area=(q == name))
        if r:
            return r, True
    return None, True


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
            r, quota_left = locate(name, hint)
            if r:
                results.append({"index": i, "name": name, **r})
            if not quota_left:
                break
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
