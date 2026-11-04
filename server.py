"""
Etrip 後端（Flask）
- /parse              AI 把雜亂的行程文字整理成 JSON
- /extract_places     AI 從文字中抽出景點 / 餐廳 / 商店
- /extract_url        先抓網頁內容，再抽出地點
- /enrich_locations   地點名稱轉座標（Google Geocoding API）
- /health             給前端提早喚醒 Render 用

環境變數：
  OPENAI_API_KEY       必填
  GOOGLE_MAPS_API_KEY  補座標用
  OPENAI_MODEL         選填，預設 gpt-4o-mini
  ALLOWED_ORIGINS      選填，限制哪些網站可以呼叫，用逗號分隔
                       例如 https://elsiexu.github.io  （不設定 = 全部允許）
"""

import ipaddress
import json
import os
import socket
from datetime import date
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI

load_dotenv()

app = Flask(__name__)

_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
CORS(app, resources={r"/*": {"origins": _origins or "*"}})

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
GOOGLE_KEY = os.getenv("GOOGLE_MAPS_API_KEY")

MAX_TEXT = 15000      # 送給 AI 的文字上限，避免 token 爆量
MAX_PLACES = 80       # 一次最多補幾個座標

CATEGORY_HINT = "category 只能是 food（餐廳小吃）、cafe（咖啡甜點）、sight（景點）、shop（購物）、other 其中之一"


def ask_json(prompt):
    """呼叫 OpenAI 並要求回傳 JSON 物件"""
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.2,
    )
    content = response.choices[0].message.content or "{}"
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {}


def error(message, status=400):
    return jsonify({"error": message}), status


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True})


# ===============================
# 行程解析
# ===============================

@app.route("/parse", methods=["POST"])
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
        print("parse 錯誤:", e)
        return error("AI 服務暫時無法使用，請稍後再試", 502)

    # data 給新版前端；result（字串）保留給舊版前端相容
    return jsonify({"data": result, "result": json.dumps(result, ensure_ascii=False)})


# ===============================
# AI 抽取景點
# ===============================

def extract_places_from_text(text, title=""):
    prompt = f"""
從以下旅遊內容中找出所有「可以實際前往」的景點、餐廳、咖啡廳或商店。

回傳 JSON 物件：
{{"places": [{{"name": "店名或景點名稱（用原文常見寫法，方便在 Google 地圖搜尋）", "category": "food", "area": "所在城市或區域，不知道就空字串", "note": "一句話重點，例如必點菜色、特色，沒有就空字串"}}]}}

規則：
- {CATEGORY_HINT}
- 同一個地點只列一次；不要列出國家、城市名稱本身或連鎖品牌總稱。
- 找不到任何地點就回傳 {{"places": []}}。

{f"文章標題：{title}" if title else ""}
內容：
{text}
"""
    result = ask_json(prompt)
    places = result.get("places", []) if isinstance(result, dict) else []
    return [p for p in places if isinstance(p, dict) and p.get("name")]


@app.route("/extract_places", methods=["POST"])
def extract_places():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", ""))[:MAX_TEXT]
    if not text.strip():
        return error("沒有收到內容")
    try:
        return jsonify({"places": extract_places_from_text(text)})
    except Exception as e:  # noqa: BLE001
        print("extract_places 錯誤:", e)
        return error("AI 服務暫時無法使用，請稍後再試", 502)


# ===============================
# URL 抽取景點
# ===============================

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
def extract_url():
    data = request.get_json(silent=True) or {}
    url = str(data.get("text", "")).strip()

    try:
        html = fetch_page(url)
    except Exception as e:  # noqa: BLE001
        print("URL 抓取錯誤:", e)
        return jsonify({"places": [], "title": ""})

    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string or "").strip() if soup.title else ""

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
        print("extract_url 錯誤:", e)
        return error("AI 服務暫時無法使用，請稍後再試", 502)


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
                r = geocode(f"{name} {hint}")
            if not r:
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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
