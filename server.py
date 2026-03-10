from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

app = Flask(__name__)
CORS(app)

import os
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)
# ===============================
# 行程解析
# ===============================

@app.route("/parse", methods=["POST"])
def parse_trip():

    data = request.json
    text = data.get("text","")

    prompt = f"""
你是旅行資料整理助手。

請把以下旅行內容整理成 JSON：

格式：

{{
 "flight":{{"depart":"","return":""}},
 "hotel":{{"name":"","address":""}},
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
        messages=[
            {"role":"user","content":prompt}
        ]
    )

    result = response.choices[0].message.content

    return jsonify({
        "result":result
    })


# ===============================
# AI 抽取景點 / 餐廳
# ===============================

@app.route("/extract_places", methods=["POST"])
def extract_places():

    data = request.json
    text = data.get("text","")

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
        messages=[
            {"role":"user","content":prompt}
        ]
    )

    result = response.choices[0].message.content

    return jsonify({
        "places": result
    })


# ===============================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)