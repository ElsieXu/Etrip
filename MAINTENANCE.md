# Etrip 後續維護

這份說明整理了：哪裡管什麼、平常怎麼維護、出問題怎麼查、每個月大概花多少錢。
第一次架設後端的步驟在 [DEPLOY.md](DEPLOY.md)。

---

## 一、四個入口

| 部分 | 管什麼 | 入口 |
|---|---|---|
| **網站（前端）** | 畫面、功能 | GitHub：<https://github.com/ElsieXu/Etrip>。合併到 `main` 後，GitHub Pages 會自動更新 <https://elsiexu.github.io/Etrip/>，約 1 分鐘生效 |
| **後端** | AI 整理行程、抓地點、雲端同步 | [Google Cloud 主控台](https://console.cloud.google.com) → Cloud Run → `etrip-api`（區域 asia-east1） |
| **雲端同步資料** | 每個同步碼的資料 | Google Cloud 主控台 → Firestore → 資料 |
| **AI 金鑰** | Gemini 的用量與限制 | <https://aistudio.google.com/apikey> |

天氣（Open-Meteo）和匯率（ExchangeRate-API）是免費服務，不用金鑰，也不用管理。

後端網址：`https://etrip-api-690497062302.asia-east1.run.app`（寫在 `js/config.js` 的 `DEFAULT_API_BASE`）

---

## 二、平常怎麼維護

### 1. 改功能、修 Bug（最常見）

1. 打開 <https://claude.ai/code>，選 `ElsieXu/Etrip` 開一個工作階段，描述想改的地方或遇到的問題（附截圖更好）
2. 改好後會開 Pull Request，確認沒問題再合併
3. 合併後網站自動更新。手機上把 Etrip 關掉再打開一次，就會載入新版

只改網站畫面時，**不用動 Cloud Run**。

### 2. 後端有修改時（較少見）

只有改到 `server.py`、`Dockerfile`、`requirements.txt` 時才需要重新部署（PR 說明裡會寫清楚）。
打開 Cloud Shell，一次貼一段：

```bash
cd Etrip && git checkout main && git pull
```

```bash
gcloud run deploy etrip-api --source . --region asia-east1
```

金鑰和其他環境變數會沿用上次的設定。

> Cloud Shell 裡如果沒有 `Etrip` 資料夾（太久沒用會被清掉），先執行 `git clone https://github.com/ElsieXu/Etrip.git`。

### 3. 定期檢查

| 頻率 | 做什麼 |
|---|---|
| 每月 | 看一眼「帳單 → 報表」。有設預算提醒（DEPLOY.md 第 9 步）的話，超過會寄信通知，平常不用特地看 |
| 每 3～6 個月 | 確認 Gemini 模型還沒退役（見下方「換 AI 模型」）。<br>到 [Gemini 模型列表](https://ai.google.dev/gemini-api/docs/models) 看目前用的 `gemini-3.5-flash-lite` 有沒有標示停用日期 |
| 一次就好 | 設定 Artifact Registry 自動清理舊版（見下方），避免舊的程式映像檔越積越多 |

### 4. 換 AI 模型

Google 會定期讓舊的 Gemini 模型退役。退役後「AI 整理」和「抓地點」會失敗，這是最可能遇到的狀況。
換成新模型只要一行（把 `新的模型名稱` 換掉，例如新版的 Flash-Lite）：

```bash
gcloud run services update etrip-api --region asia-east1 --update-env-vars "GEMINI_MODEL=新的模型名稱"
```

看 YouTube 影片用的模型是另一個變數 `GEMINI_VIDEO_MODEL`。沒有另外設定的話，會跟著 `GEMINI_MODEL` 一起換。

### 5. Artifact Registry 自動清理（設一次就好）

每次部署，後端的程式映像檔都會多存一份。超過 0.5 GB 會開始收費（很少，每 GB 每月約 0.1 美元）。
下面兩段設定「只保留最新 2 份，其他超過 30 天的自動刪除」：

```bash
echo '[{"name":"keep-latest","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":2}},{"name":"delete-old","action":{"type":"Delete"},"condition":{"tagState":"any","olderThan":"30d"}}]' > cleanup.json
```

```bash
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy --location=asia-east1 --policy=cleanup.json --no-dry-run
```

---

## 三、出問題時

| 狀況 | 先檢查 |
|---|---|
| AI 整理、抓地點都失敗 | 1. 打開 `後端網址/health`，看到 `{"ok": true, ...}` 代表後端有開<br>2. 到 Cloud Run → `etrip-api` →「記錄」看錯誤訊息<br>3. 錯誤裡有 `model` 或 `not found` → 模型退役了，見「換 AI 模型」<br>4. 錯誤裡有 `quota` 或 `429` → Gemini 用量到上限，到 AI Studio 看 |
| 第一次用 AI 要等好幾秒 | 正常。沒人用時後端會休眠，叫醒要幾秒鐘 |
| 雲端同步失敗 | Firestore 有沒有被刪掉；Cloud Run 記錄裡有沒有 `permission` 錯誤（DEPLOY.md 第 5 步的權限） |
| 網站沒有更新 | GitHub → Actions，看「pages build and deployment」是不是綠色勾勾；手機上把 Etrip 完全關掉再打開 |
| 天氣或匯率不見了 | 這兩個是外部免費服務，偶爾會暫時連不上，網站會先顯示上次的資料，通常稍後就恢復 |

看不懂錯誤訊息時，把「記錄」頁面截圖，開工作階段問 Claude 就好。

---

## 四、每月費用估算（約 6 人使用）

| 服務 | 免費額度 | 預估費用 |
|---|---|---|
| GitHub Pages | 公開專案免費 | 0 |
| Cloud Run | 每月 200 萬次請求、18 萬 vCPU 秒 | 0 |
| Firestore | 每天 5 萬次讀取、2 萬次寫入、1 GB 儲存 | 0 |
| Artifact Registry | 0.5 GB 儲存 | 0～NT$3 |
| Google Maps 地址查詢 | 每月 1 萬次 | 0 |
| **Gemini AI** | 專案綁帳單時走付費版 | **約 NT$0～30** |
| **合計** | | **約 NT$0～30 / 月** |

- Gemini 的大概用量：整理一次行程不到 NT$0.2；看一支 15 分鐘的 YouTube 影片約 NT$1
- 價格以 2026 年 11 月第三方整理的資料估算（Flash-Lite 每百萬 tokens 約輸入 0.3、輸出 2.5 美元），實際以 [Gemini 定價頁](https://ai.google.dev/gemini-api/docs/pricing) 和帳單報表為準
- 金鑰是免費版還是付費版，可以在 AI Studio 的金鑰頁看
- 就算增加到幾十人使用，大部分仍在免費額度內，主要增加的是 Gemini 費用
- 預算提醒只會寄信，不會自動停用服務

---

## 五、金鑰安全

- **Gemini 金鑰**、**Maps 金鑰**只存在 Cloud Run 的環境變數裡，不在程式碼或 GitHub 上
- 建議在主控台 → API 和服務 → 憑證，替每把金鑰設定「API 限制」（DEPLOY.md 第 10 步）
- 金鑰外流時：在同一頁「重新產生金鑰」，再用下面的指令換上新的：

```bash
gcloud run services update etrip-api --region asia-east1 --update-env-vars "GEMINI_API_KEY=新的金鑰"
```
