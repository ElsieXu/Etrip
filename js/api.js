// =========================================
// api.js — 與後端（Google Cloud Run 上的 Flask）溝通
// =========================================

/** 伺服器網址：工具 → 進階設定 > config.js 的預設值 */
function apiBase() {
  return (str(prefs.apiBase) || DEFAULT_API_BASE).replace(/\/+$/, "");
}

/**
 * 呼叫後端。伺服器閒置後第一次啟動需要一點時間，
 * 超過 6 秒會呼叫 onSlow，讓畫面提示「伺服器喚醒中」。
 * okStatuses：這些狀態碼不當作錯誤（例如同步衝突 409），回傳 { status, data }
 */
async function apiRequest(method, path, body, { timeout = 100000, onSlow, okStatuses = [] } = {}) {
  if (!navigator.onLine) throw new Error("目前沒有網路連線");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const slowTimer = setTimeout(() => onSlow && onSlow(), 6000);
  try {
    const res = await fetch(apiBase() + path, {
      method,
      // FormData（上傳檔案）交給瀏覽器自己設定 Content-Type
      headers: body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {},
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store"
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 非 JSON */ }
    if (data && data.budget) noteAiBudget(data.budget);
    if (okStatuses.includes(res.status)) return { status: res.status, data };
    if (!res.ok) {
      const err = new Error((data && data.error) || `伺服器錯誤（${res.status}）`);
      err.status = res.status;
      throw err;
    }
    if (data && data.error) throw new Error(data.error);
    return okStatuses.length ? { status: res.status, data } : data;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("等太久了，伺服器可能還在啟動，請再試一次");
    if (e instanceof TypeError) throw new Error("連不到伺服器，請檢查網路，或到「工具 → 進階設定」確認伺服器網址");
    throw e;
  } finally {
    clearTimeout(timer);
    clearTimeout(slowTimer);
  }
}

function apiPost(path, body, opts) { return apiRequest("POST", path, body, opts); }

// ===== 每月 AI 額度 =====
// 後端在每次 AI 回應附上「本月已用幾 %」，到 85% 提醒大家省著用

const AI_BUDGET_WARN = 85;

function aiBudgetMonth() { return new Date(Date.now() - 8 * 3600e3).toISOString().slice(0, 7); }

function noteAiBudget(b) {
  const pct = Number(b.pct) || 0;
  prefs.aiBudget = { pct, month: str(b.month) || aiBudgetMonth() };
  savePrefs();
  // 每天最多提醒一次（用完時錯誤訊息本身就會說明）
  if (pct >= AI_BUDGET_WARN && pct < 100 && prefs.aiBudgetToast !== toISODate(new Date())) {
    prefs.aiBudgetToast = toISODate(new Date());
    savePrefs();
    setTimeout(() => toast(`⚠️ 本月 AI 額度已用 ${pct}%，快到上限了。用完後要等下個月 1 號才能再用 AI，其他功能不受影響`, { duration: 8000 }), 600);
  }
}

/** AI 功能旁邊的提醒（本月已用 85% 以上才顯示） */
function aiBudgetNoteHTML() {
  const b = prefs.aiBudget;
  if (!b || b.month !== aiBudgetMonth() || b.pct < AI_BUDGET_WARN) return "";
  return b.pct >= 100
    ? `<p class="ai-budget-note out">⛔ 這個月的 AI 額度用完了，下個月 1 號會恢復。其他功能都可以正常使用。</p>`
    : `<p class="ai-budget-note">⚠️ 本月 AI 額度已用 ${b.pct}%，快到上限了，請留給真的需要的時候。</p>`;
}

/** 提早叫醒伺服器（不等結果），之後真正呼叫時就不用等那麼久 */
let _lastWake = 0;
function wakeServer() {
  if (!navigator.onLine || Date.now() - _lastWake < 300000) return;
  _lastWake = Date.now();
  fetch(apiBase() + "/health", { mode: "no-cors", cache: "no-store" }).catch(() => {});
}

// ===== AI 整理行程 =====

async function aiParseTrip(text, opts) {
  const data = await apiPost("/parse", { text, today: toISODate(new Date()) }, opts);
  const ai = data?.data || parseAIJson(data?.result);
  if (!ai || typeof ai !== "object" || Array.isArray(ai)) throw new Error("AI 回傳的格式看不懂，請再試一次");
  return ai;
}

// ===== AI 抽取景點 =====

// 這些社群網站的網址通常讀不到內容（YouTube 例外：Gemini 可以直接看影片）
const SOCIAL_RE = /instagram\.com|tiktok\.com|xiaohongshu\.com|xhslink\.com|facebook\.com|fb\.watch|threads\.net/i;
const YOUTUBE_RE = /youtube\.com\/(watch|shorts|live)|youtu\.be\//i;

// IG 貼文：後端會先讀公開的說明文字，讀不到再請使用者上傳影片或截圖
const IG_RE = /instagram\.com|instagr\.am/i;

async function aiExtractPlaces(text, opts = {}) {
  const path = isUrl(text) ? "/extract_url" : "/extract_places";
  // 看影片比較久，給 3 分鐘
  const data = await apiPost(path, { text }, { timeout: YOUTUBE_RE.test(text) ? 180000 : 100000, ...opts });
  const out = normalizePlaces(data);
  out.clipped = data?.clipped_minutes || 0;   // 影片太長只看了前幾分鐘
  out.needUpload = !!data?.need_upload;       // IG 讀不到內容：請使用者上傳影片或截圖
  out.captionOnly = !!data?.caption_only;     // IG 只讀到貼文說明文字，沒有看影片
  out.caption = str(data?.caption);
  return out;
}

function normalizePlaces(data) {
  let places = data?.places;
  if (typeof places === "string") {
    const parsed = parseAIJson(places);
    places = parsed ?? places.replace(/[\[\]"]/g, "").split(/[,，、\n]/);
  }
  if (places && !Array.isArray(places) && Array.isArray(places.places)) places = places.places;
  if (!Array.isArray(places)) places = [];
  const out = places
    .map(p => (typeof p === "string" ? { name: p } : p || {}))
    .map(p => ({
      name: str(p.name || p.text),
      category: normCategory(p.category),
      area: str(p.area),
      note: str(p.note)
    }))
    .filter(p => p.name);
  return out;
}

// ===== 上傳影片 / 截圖讓 AI 看（IG、TikTok 等讀不到網址的貼文） =====

const MEDIA_MAX_BYTES = 14 * 1024 * 1024;   // 要和後端的 MEDIA_MAX_MB 一致
const MEDIA_MAX_SHOTS = 10;                 // 一次最多幾張截圖
const MEDIA_MAX_FRAMES = 30;                // 影片太大時最多取幾張畫面

/** blobs：一支影片或幾張圖片；caption：貼文說明文字（選填，幫 AI 確認店名） */
async function aiExtractMedia(blobs, caption = "", opts = {}) {
  const fd = new FormData();
  blobs.forEach((b, i) => fd.append("media", b, b.name || `shot-${i + 1}.jpg`));
  if (caption) fd.append("caption", caption);
  return normalizePlaces(await apiPost("/extract_media", fd, { timeout: 180000, ...opts }));
}

/**
 * 把使用者選的檔案整理成可以上傳的大小。
 * - 影片不大：直接上傳，AI 會看畫面也會聽聲音
 * - 影片太大（例如螢幕錄影）：在手機上每隔幾秒取一張畫面，只上傳畫面（frames: true，AI 聽不到聲音）
 * - 圖片：縮小後上傳
 */
async function prepareMedia(files) {
  const video = files.find(f => f.type.startsWith("video/"));
  if (video) {
    const direct = video.size <= MEDIA_MAX_BYTES && /mp4|quicktime|webm|m4v/.test(video.type);
    return direct ? { blobs: [video], video: true, frames: false }
                  : { blobs: await videoFrames(video), video: false, frames: true };
  }
  const images = files.filter(f => f.type.startsWith("image/")).slice(0, MEDIA_MAX_SHOTS);
  if (!images.length) throw new Error("請選擇影片或圖片檔");
  const blobs = [];
  for (const f of images) blobs.push(await shrinkImage(f));
  return { blobs, video: false, frames: false };
}

function canvasToJpeg(source, w, h, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("圖片處理失敗"))), "image/jpeg", quality));
}

async function shrinkImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) { throw new Error(`「${file.name}」這張圖片打不開，請換成 JPG 或 PNG`); }
  try { return await canvasToJpeg(bmp, bmp.width, bmp.height, 1600, 0.82); } finally { bmp.close?.(); }
}

function mediaEvent(el, name, ms = 15000) {
  return new Promise((resolve, reject) => {
    const done = fn => () => { clearTimeout(timer); el.removeEventListener(name, ok); el.removeEventListener("error", bad); fn(); };
    const ok = done(resolve);
    const bad = done(() => reject(new Error("這支影片在這台裝置上打不開，請改上傳截圖")));
    const timer = setTimeout(bad, ms);
    el.addEventListener(name, ok);
    el.addEventListener("error", bad);
  });
}

/** 從影片平均取出最多 MEDIA_MAX_FRAMES 張畫面（大約每 2 秒一張） */
async function videoFrames(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  try {
    const ready = mediaEvent(v, "loadeddata");
    v.src = url;
    v.load();
    await ready;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    if (!dur || !v.videoWidth) throw new Error("這支影片在這台裝置上打不開，請改上傳截圖");
    const n = Math.max(1, Math.min(MEDIA_MAX_FRAMES, Math.ceil(dur / 2)));
    const frames = [];
    for (let i = 0; i < n; i++) {
      const seeked = mediaEvent(v, "seeked");
      v.currentTime = (i + 0.5) * dur / n;
      await seeked;
      frames.push(await canvasToJpeg(v, v.videoWidth, v.videoHeight, 768, 0.72));
    }
    return frames;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

// ===== 地點補座標 =====

/** 行程的「主要地區」可以填好幾個（南投、台中、苗栗），用頓號、逗號或空白分開 */
function tripRegions(t = tripData) {
  return str(t?.meta?.region).split(/[、,，/／\s]+/).filter(Boolean);
}

/** 主要地區第一個的中心點（查天氣用的同一個免費服務，有快取） */
async function regionCenter(t) {
  const first = tripRegions(t)[0];
  if (!first || typeof geocodeRegion !== "function") return null;
  try { return await geocodeRegion(first); } catch (e) { return null; }
}

function centerOf(pts) {
  if (!pts.length) return null;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}

/**
 * 「優先找這附近」的範圍（公尺）。旅行是一站接一站移動的，所以：
 * 1. 行程項目：同一天前一站、後一站（已經有位置的）
 * 2. 同一天沒有可以參考的站：整趟行程已知地點的中心
 * 3. 都沒有：主要地區的中心
 * 口袋名單的地點不屬於哪一天，有填自己的地區就用文字提示，沒填才用 2、3。
 * 不再把目的地文字硬加在每個店名後面：目的地填成景點（例如「南投地母廟」）時，Google 會直接回傳那個景點。
 */
async function biasFor(t, trip, pending) {
  if (!trip) return null;
  const known = x => x.lat != null && !pending.has(x);
  // 住宿也算參考點（前一晚住的、當晚住的）；家不算：從家出發的一日遊，地點通常離家很遠
  const hotelAnchor = a => (a && a.kind === "hotel" && a.lat != null ? a : null);
  if ("text" in t) {
    for (const [di, d] of trip.days.entries()) {
      const i = d.items.indexOf(t);
      if (i < 0) continue;
      const anchors = dayAnchorsOf(trip, di);
      const prev = d.items.slice(0, i).reverse().find(known) || hotelAnchor(anchors.start);
      const next = d.items.slice(i + 1).find(known) || hotelAnchor(anchors.end);
      const pts = [prev, next].filter(Boolean);
      if (pts.length === 2) {
        const km = haversine(prev.lat, prev.lng, next.lat, next.lng);
        return { ...centerOf(pts), r: Math.round(Math.min(50000, Math.max(8000, km * 500 + 10000))) };
      }
      if (pts.length === 1) return { lat: pts[0].lat, lng: pts[0].lng, r: 20000 };
      break;
    }
  }
  const pts = trip.days.flatMap(d => d.items).concat(trip.hotels).filter(known);
  if (pts.length) return { ...centerOf(pts), r: 50000 };
  const g = await regionCenter(trip);
  return g ? { lat: g.lat, lng: g.lng, r: 50000 } : null;
}

/**
 * targets：行程項目（.text）或口袋名單（.name），會直接寫入 lat / lng / placeId。
 * trip：這些地點屬於哪一趟行程（用前後站決定優先找哪附近）。
 */
async function enrichTargets(targets, trip = tripData) {
  const todo = targets.filter(t => t.lat == null && str(t.name || t.text));
  const pending = new Set(todo);
  let found = 0;
  for (let i = 0; i < todo.length; i += 25) {
    const chunk = todo.slice(i, i + 25);
    const names = chunk.map(t => str(t.name || t.text));
    const hints = chunk.map(t => str(t.area));
    const bias = [];
    for (const t of chunk) bias.push(str(t.area) ? null : await biasFor(t, trip, pending));
    let data;
    try {
      data = await apiPost("/enrich_locations", { places: names, hints, bias }, { timeout: 120000 });
    } catch (e) {
      console.warn("定位失敗", e);
      continue;
    }
    if (!Array.isArray(data)) continue;
    chunk.forEach((t, j) => {
      const r = data.find(d => d.index === j) || data.find(d => d.name === names[j]);
      if (r && num(r.lat) != null) {
        t.lat = num(r.lat);
        t.lng = num(r.lng);
        if (r.place_id) t.placeId = r.place_id;
        if ("foundAddress" in t) t.foundAddress = str(r.address);
        // 口袋名單沒填地區時，用地址自動補上
        if ("area" in t && !t.area && r.address) t.area = areaFromAddress(r.address);
        pending.delete(t);   // 後面的地點可以拿它當參考
        found++;
      }
    });
  }
  return found;
}

/** 查一段文字的位置（住宿地址、常用地點用）。查不到回傳 null */
async function locateText(query, trip = null) {
  const probe = { name: str(query), lat: null, lng: null, placeId: "", foundAddress: "" };
  if (!probe.name) return null;
  await enrichTargets([probe], trip);
  return probe.lat != null ? probe : null;
}

/**
 * 依順路重新排序：
 * - 有出發點（前一晚的住宿、家）：從出發點開始排，第一站也會跟著調整
 * - 沒有出發點：第一站固定
 * - 有終點（當晚的住宿、回家）：最後一站會盡量靠近終點
 * 先用「最近的下一站」排出初稿，再把交叉繞路的段落反轉（2-opt）。沒有座標的放到最後。
 */
function sortByDistance(items, start = null, end = null) {
  const has = p => p && p.lat != null;
  if (!has(start)) start = null;
  if (!has(end)) end = null;
  const withCoord = items.filter(has);
  const without = items.filter(i => !has(i));
  const fixedFirst = start ? 0 : 1;                       // 沒有出發點時第一站不動
  if (withCoord.length - fixedFirst < 2) return items.slice();
  const dist = (a, b) => haversine(a.lat, a.lng, b.lat, b.lng);

  const route = start ? [] : [withCoord[0]];
  const remaining = withCoord.slice(fixedFirst);
  let cur = start || withCoord[0];
  while (remaining.length) {
    let best = 0, bestD = Infinity;
    remaining.forEach((it, i) => { const d = dist(cur, it); if (d < bestD) { bestD = d; best = i; } });
    cur = remaining.splice(best, 1)[0];
    route.push(cur);
  }

  const total = r => {
    let s = start ? dist(start, r[0]) : 0;
    for (let i = 1; i < r.length; i++) s += dist(r[i - 1], r[i]);
    return s + (end ? dist(r[r.length - 1], end) : 0);
  };
  let best = total(route), improved = true, rounds = 0;
  while (improved && rounds++ < 50) {
    improved = false;
    for (let i = fixedFirst; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const cand = route.slice(0, i).concat(route.slice(i, j + 1).reverse(), route.slice(j + 1));
        const t = total(cand);
        if (t < best - 1e-9) { route.splice(0, route.length, ...cand); best = t; improved = true; }
      }
    }
  }
  return route.concat(without);
}
