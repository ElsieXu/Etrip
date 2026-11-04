# 把後端搬到 Google Cloud Run（一步一步）

全程在瀏覽器裡的 **Cloud Shell** 操作，不用在電腦上安裝任何東西。大約 20～30 分鐘。

> 你需要：一個已經綁定帳單（信用卡）的 Google Cloud 專案。可以沿用你現在 Google Maps 金鑰所在的專案。
> 個人使用的量在 Cloud Run、Firestore 的免費額度內，正常不會產生費用；第 9 步會設定預算提醒，超過就寄信通知你。

---

## 1. 取得 Gemini API 金鑰

1. 打開 <https://aistudio.google.com/apikey>
2. 按「建立 API 金鑰」，**選擇你的 Google Cloud 專案**（和 Maps 同一個）
3. 複製金鑰，等一下會用到

> 提醒：Google AI Pro 訂閱和 API 是分開的。專案有綁帳單時，API 走付費版，送出的內容不會被拿去改善 Google 的產品。

## 2. 打開 Cloud Shell

1. 打開 <https://console.cloud.google.com>
2. 上方選好你的專案
3. 按右上角的 **「啟用 Cloud Shell」** 圖示（`>_`），下方會出現一個終端機視窗

以下每一段指令，都是複製貼到 Cloud Shell 後按 Enter。**一次只貼一段**，等它跑完再貼下一段。

## 3. 設定專案並開啟需要的服務

把 `你的專案ID` 換成你的專案 ID（在主控台首頁可以看到）：

```bash
gcloud config set project 你的專案ID
```

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com
```

## 4. 建立 Firestore 資料庫（雲端同步用）

`asia-east1` 是台灣機房：

```bash
gcloud firestore databases create --location=asia-east1
```

如果出現「已經存在」的訊息，代表之前建過了，直接下一步。

## 5. 讓 Cloud Run 可以讀寫 Firestore

> 一次只貼一段，按 Enter 等它跑完再貼下一段。如果畫面出現 `>` 一直等你輸入，代表貼上時被截斷了：按 `Ctrl + C` 取消，再重貼那一段。

```bash
PROJECT_ID=$(gcloud config get-value project)
```

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
```

確認兩個值都有抓到（應該會顯示專案 ID 和一串數字）：

```bash
echo $PROJECT_ID $PROJECT_NUMBER
```

```bash
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role="roles/datastore.user"
```

成功會顯示 `Updated IAM policy for project`。如果問要不要設定條件（condition），選 **None**。

## 6. 下載程式碼

```bash
git clone https://github.com/ElsieXu/Etrip.git && cd Etrip
```

**新版還沒合併到 main 之前，一定要切換到新版分支**（不然會部署到舊版，出現 `Building using Buildpacks` 然後失敗）：

```bash
git checkout claude/youthful-ptolemy-bgv92z
```

確認新版檔案存在（看到兩個檔名就對了）：

```bash
ls Dockerfile DEPLOY.md
```

> 如果專案是私人的，GitHub 會要你登入：帳號輸入 GitHub 帳號，密碼要用 GitHub 的「Personal access token」（Settings → Developer settings → Personal access tokens 建立）。

## 7. 部署

把三個值換成你自己的：

- `你的Gemini金鑰`：第 1 步複製的
- `你的Maps金鑰`：現在 Render 上用的 `GOOGLE_MAPS_API_KEY`
- `你的網站網址`：前端網站的網址開頭，例如 `https://elsiexu.github.io`（只要到網域，不用後面的路徑）

```bash
gcloud run deploy etrip-api --source . --region asia-east1 --allow-unauthenticated --set-env-vars "GEMINI_API_KEY=你的Gemini金鑰,GOOGLE_MAPS_API_KEY=你的Maps金鑰,ALLOWED_ORIGINS=你的網站網址"
```

- 第一次會問要不要建立 Artifact Registry 存放區，輸入 `Y`
- 畫面上應該寫 `Building using Dockerfile`；如果寫 `Buildpacks`，代表沒有切換到新版分支，請回到第 6 步
- 大約 3～5 分鐘，完成後會顯示 **Service URL**，例如 `https://etrip-api-xxxxxxxx.asia-east1.run.app`，複製起來

## 8. 確認可以用，並把網址填進網站

1. 在瀏覽器打開 `你的Service URL/health`，看到 `{"ok": true, ...}` 就成功了
2. 打開 Etrip 網站 → **工具 → 進階設定 → 伺服器網址**，貼上 Service URL 並儲存
   - 每台裝置都要設定一次；或請我把網址直接寫進 `js/config.js`，之後所有裝置自動套用

## 9. 設定預算提醒（建議）

1. 主控台左上選單 → **帳單** → **預算與快訊** → **建立預算**
2. 金額填 `1`（美元），門檻保留預設的 50%、90%、100%
3. 超過時會寄信通知你（預算提醒只會通知，不會自動停用服務）

## 10. 保護金鑰（建議）

- **Maps 金鑰**：主控台 → API 和服務 → 憑證 → 點金鑰 → API 限制選「Geocoding API」
- **Gemini 金鑰**：同一個頁面，API 限制選「Generative Language API」

---

## 之後要更新後端

在 Cloud Shell：

```bash
cd Etrip && git pull
```

```bash
gcloud run deploy etrip-api --source . --region asia-east1
```

環境變數會沿用上次的設定。要修改某個變數時：

```bash
gcloud run services update etrip-api --region asia-east1 --update-env-vars "ALLOWED_ORIGINS=https://新的網址"
```

## 可以調整的設定

| 變數 | 說明 |
|---|---|
| `GEMINI_MODEL` | 整理行程、抓地點用的模型，預設 `gemini-3.5-flash-lite` |
| `GEMINI_VIDEO_MODEL` | 看 YouTube 影片用的模型，預設和上面相同。想要更準可以改成較強的 Flash 模型（費用較高） |
| `AI_PROVIDER` | 設成 `openai` 並加上 `OPENAI_API_KEY`，可以改回 OpenAI（不支援影片） |

## Render 可以關掉了嗎？

確認新的網址在每台裝置都能用之後，就可以到 Render 刪除舊服務。
