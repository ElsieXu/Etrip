// =========================================
// utils.js — 共用小工具（日期、距離、跳脫、地圖連結）
// =========================================

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** HTML 跳脫：所有使用者或 AI 給的文字都要經過這裡，避免版面被破壞 */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function str(v) { return v == null ? "" : String(v).trim(); }

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function isUrl(s) { return /^https?:\/\/\S+$/i.test(str(s)); }

/** 只允許 http(s) 連結，避免 javascript: 之類的網址 */
function safeUrl(s) { return isUrl(s) ? str(s) : ""; }

function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ===== 日期 =====

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const pad2 = n => String(n).padStart(2, "0");

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(str(s)); }

function parseISODate(s) {
  if (!isISODate(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, n) {
  const d = parseISODate(iso);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

function daysBetween(fromIso, toIso) {
  const a = parseISODate(fromIso), b = parseISODate(toIso);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

/** "2025-11-20" → "11/20（四）" */
function formatDateLabel(iso) {
  const d = parseISODate(iso);
  if (!d) return "";
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

function formatDateTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 從自由文字中找出日期與時間，例如：
 * "2025/11/20 08:30 CI120"、"11/20 08:30"、"11月20日 8:30"
 * 回傳 { date: "YYYY-MM-DD", time: "HH:MM" | "" } 或 null
 */
function parseLooseDateTime(text) {
  const s = str(text);
  if (!s) return null;
  let y, m, d;
  let match = s.match(/(\d{4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/);
  if (match) {
    [, y, m, d] = match.map(Number);
  } else {
    match = s.match(/(?:^|[^\d])(\d{1,2})\s*[\/月]\s*(\d{1,2})(?!\d)/);
    if (!match) return null;
    m = +match[1]; d = +match[2];
    const now = new Date();
    y = now.getFullYear();
    // 沒寫年份：若日期已經過了兩個月以上，推斷是明年
    if (new Date(y, m - 1, d) < new Date(now.getFullYear(), now.getMonth() - 2, now.getDate())) y += 1;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = s.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  return {
    date: `${y}-${pad2(m)}-${pad2(d)}`,
    time: t ? `${pad2(+t[1])}:${t[2]}` : ""
  };
}

/** 倒數文字：超過 2 天顯示天數，2 天內顯示小時分鐘 */
function countdownText(dateIso, time) {
  const base = parseISODate(dateIso);
  if (!base) return "";
  if (time) {
    const [h, mi] = time.split(":").map(Number);
    base.setHours(h, mi, 0, 0);
  }
  const diff = base - new Date();
  if (diff <= 0) return "";
  const hours = diff / 3600000;
  if (hours < 48) {
    const h = Math.floor(hours);
    const mi = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `還有 ${h} 小時 ${mi} 分` : `還有 ${mi} 分鐘`;
  }
  const days = daysBetween(toISODate(new Date()), dateIso);
  return `還有 ${days} 天`;
}

/** "09:30" → 570（分鐘），看不懂就回傳 null */
function timeToMin(t) {
  const m = str(t).match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}

function formatDuration(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} 小時${m ? ` ${m} 分` : ""}` : `${m} 分鐘`;
}

// ===== 距離 =====

function haversine(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v == null)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatKm(km) {
  if (km == null) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// ===== Google Maps 連結 =====

function mapsSearchUrl(p) {
  const q = p.name || p.text || (p.lat != null ? `${p.lat},${p.lng}` : "");
  let url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  if (p.placeId) url += `&query_place_id=${encodeURIComponent(p.placeId)}`;
  return url;
}

/** 從「目前位置」導航到該地點 */
function mapsNavUrl(p) {
  const q = p.name || p.text || (p.lat != null ? `${p.lat},${p.lng}` : "");
  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
  if (p.placeId) url += `&destination_place_id=${encodeURIComponent(p.placeId)}`;
  return url;
}

/** 解析 AI 回傳的 JSON（可能是字串、包了 ```json 的字串、或已經是物件） */
function parseAIJson(x) {
  if (x && typeof x === "object") return x;
  let s = str(x).replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(s); } catch (e) { /* 再試著抓出第一段 JSON */ }
  const m = s.match(/[\[{][\s\S]*[\]}]/);
  if (m) { try { return JSON.parse(m[0]); } catch (e) { /* ignore */ } }
  return null;
}

/** 取得目前位置（快取 3 分鐘） */
let _posCache = null;
function getMyPosition({ force = false } = {}) {
  if (!force && _posCache && Date.now() - _posCache.ts < 180000) return Promise.resolve(_posCache);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("這個瀏覽器不支援定位"));
    navigator.geolocation.getCurrentPosition(
      pos => {
        _posCache = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
        resolve(_posCache);
      },
      err => reject(new Error(err.code === 1
        ? "沒有定位權限，請在瀏覽器設定中允許此網站使用位置"
        : "暫時抓不到定位，請稍後再試")),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}
function cachedPosition() {
  return _posCache && Date.now() - _posCache.ts < 600000 ? _posCache : null;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // 舊瀏覽器或非 https 的備案
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
