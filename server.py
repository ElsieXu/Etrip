from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import requests
from bs4 import BeautifulSoup
from openai import OpenAI

load_dotenv()

app = Flask(__name__)
from flask_cors import CORS
CORS(app, resources={
    r"/*": {
        "origins": "*"
    }
})

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

# ===============================
# 行程解析
# ===============================

@app.route("/parse", methods=["POST"])
def parse_trip():

    data = request.json or {}
    text = data.get("text", "")

    prompt = f"""
你是旅行資料整理助手。

請把以下旅行內容整理成 JSON：

格式：

{{
 "flight":{{"depart":"","return":""}},
 "hotels":[  // 改為複數並使用陣列格式
   {{"name":"","address":""}}
 ],
 "days":[
   {{"title":"Day1","items":[{{"time":"","text":""}}]}}
 ]
}}

只回傳 JSON，不要說明。

內容：
{text}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    result = response.choices[0].message.content

    return jsonify({
        "result": result
    })


# ===============================
# AI 抽取景點
# ===============================

@app.route("/extract_places", methods=["POST"])
def extract_places():

    data = request.json or {}
    text = data.get("text", "")

    prompt = f"""
從以下旅遊內容中找出所有景點、餐廳或商店名稱。

只回傳 JSON 陣列，例如：

[
 "美里茶坊",
 "Calbee+",
 "三矢本舖"
]

不要解釋。

內容：
{text}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    result = response.choices[0].message.content

    return jsonify({
        "places": result
    })


# ===============================
# URL 抽取景點
# ===============================

@app.route("/extract_url", methods=["POST"])
def extract_url():

    data = request.json or {}
    url = data.get("text", "")

    try:

        headers = {
            "User-Agent": "Mozilla/5.0"
        }

        r = requests.get(url, headers=headers, timeout=10)

        soup = BeautifulSoup(r.text, "html.parser")

        text = soup.get_text()

        # 限制長度避免 token 爆炸
        text = text[:6000]

    except Exception as e:
        print("URL抓取錯誤:", e)
        return jsonify({"places": "[]"})

    prompt = f"""
從以下文章內容中找出所有景點、餐廳或商店名稱。

只回傳 JSON 陣列，例如：

[
 "美里茶坊",
 "Calbee+",
 "三矢本舖"
]

不要解釋。

內容：
{text}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    result = response.choices[0].message.content

    return jsonify({
        "places": result
    })

# ===============================
# 地點轉座標
# ===============================

@app.route("/enrich_locations", methods=["POST"])
def enrich_locations():

    data = request.json or {}
    places = data.get("places", [])

    results = []

    for p in places:
        try:
            url = f"https://maps.googleapis.com/maps/api/geocode/json?address={p}&key={os.getenv('GOOGLE_MAPS_API_KEY')}"
            res = requests.get(url).json()

            if res.get("results"):
                loc = res["results"][0]["geometry"]["location"]
                results.append({
                    "name": p,
                    "lat": loc["lat"],
                    "lng": loc["lng"]
                })
        except Exception as e:
            print("地點解析錯誤:", e)

    return jsonify(results)

# ===============================

if __name__ == "__main__":

    port = int(os.environ.get("PORT", 5000))

    app.run(host="0.0.0.0", port=port)

