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
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store"
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 非 JSON */ }
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

async function aiExtractPlaces(text, opts = {}) {
  const path = isUrl(text) ? "/extract_url" : "/extract_places";
  // 看影片比較久，給 3 分鐘
  const data = await apiPost(path, { text }, { timeout: YOUTUBE_RE.test(text) ? 180000 : 100000, ...opts });
  let places = data?.places;
  if (typeof places === "string") {
    const parsed = parseAIJson(places);
    places = parsed ?? places.replace(/[\[\]"]/g, "").split(/[,，、\n]/);
  }
  if (places && !Array.isArray(places) && Array.isArray(places.places)) places = places.places;
  if (!Array.isArray(places)) places = [];
  return places
    .map(p => (typeof p === "string" ? { name: p } : p || {}))
    .map(p => ({
      name: str(p.name || p.text),
      category: normCategory(p.category),
      area: str(p.area),
      note: str(p.note)
    }))
    .filter(p => p.name);
}

// ===== 地點補座標 =====

/**
 * targets：行程項目（.text）或口袋名單（.name），會直接寫入 lat / lng / placeId。
 * hint：地區提示（例如「沖繩」「台南」），讓同名地點定位得更準。
 */
async function enrichTargets(targets, hint = "") {
  const todo = targets.filter(t => t.lat == null && str(t.name || t.text));
  let found = 0;
  for (let i = 0; i < todo.length; i += 25) {
    const chunk = todo.slice(i, i + 25);
    const names = chunk.map(t => str(t.name || t.text));
    const hints = chunk.map(t => str(t.area) || hint);
    let data;
    try {
      data = await apiPost("/enrich_locations", { places: names, hints }, { timeout: 120000 });
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
        found++;
      }
    });
  }
  return found;
}

/** 依順路重新排序（最近鄰）：第一站固定，沒有座標的放到最後 */
function sortByDistance(items) {
  if (items.length <= 2) return items.slice();
  const withCoord = items.filter(i => i.lat != null);
  const without = items.filter(i => i.lat == null);
  if (withCoord.length <= 2) return items.slice();
  const sorted = [withCoord[0]];
  const remaining = withCoord.slice(1);
  while (remaining.length) {
    const last = sorted[sorted.length - 1];
    let best = 0, bestD = Infinity;
    remaining.forEach((it, i) => {
      const d = haversine(last.lat, last.lng, it.lat, it.lng);
      if (d < bestD) { bestD = d; best = i; }
    });
    sorted.push(remaining.splice(best, 1)[0]);
  }
  return sorted.concat(without);
}
