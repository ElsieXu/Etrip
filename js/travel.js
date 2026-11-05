// =========================================
// travel.js — 國內 / 國外判斷、天氣預報、匯率
// 資料來源（免費、不用金鑰，直接從瀏覽器呼叫）：
//   天氣、地名查詢：Open-Meteo（https://open-meteo.com）
//   匯率：ExchangeRate-API（https://www.exchangerate-api.com）
// =========================================

// ===== 幣別 =====

const CURRENCIES = {
  TWD: { name: "台幣", symbol: "NT$", digits: 0 },
  JPY: { name: "日圓", symbol: "¥", digits: 0 },
  KRW: { name: "韓元", symbol: "₩", digits: 0 },
  THB: { name: "泰銖", symbol: "฿", digits: 0 },
  VND: { name: "越南盾", symbol: "₫", digits: 0 },
  HKD: { name: "港幣", symbol: "HK$", digits: 1 },
  MOP: { name: "澳門幣", symbol: "MOP$", digits: 1 },
  SGD: { name: "新幣", symbol: "S$", digits: 2 },
  MYR: { name: "令吉", symbol: "RM", digits: 2 },
  PHP: { name: "披索", symbol: "₱", digits: 0 },
  IDR: { name: "印尼盾", symbol: "Rp", digits: 0 },
  CNY: { name: "人民幣", symbol: "CN¥", digits: 1 },
  USD: { name: "美元", symbol: "US$", digits: 2 },
  EUR: { name: "歐元", symbol: "€", digits: 2 },
  GBP: { name: "英鎊", symbol: "£", digits: 2 },
  CHF: { name: "瑞士法郎", symbol: "CHF ", digits: 2 },
  AUD: { name: "澳幣", symbol: "A$", digits: 2 },
  NZD: { name: "紐幣", symbol: "NZ$", digits: 2 },
  CAD: { name: "加幣", symbol: "C$", digits: 2 },
  CZK: { name: "克朗", symbol: "Kč ", digits: 0 },
  TRY: { name: "里拉", symbol: "₺", digits: 0 },
  KHR: { name: "瑞爾", symbol: "៛", digits: 0 },
  INR: { name: "盧比", symbol: "₹", digits: 0 }
};

const COUNTRY_CURRENCY = {
  JP: "JPY", KR: "KRW", TH: "THB", VN: "VND", HK: "HKD", MO: "MOP", SG: "SGD", MY: "MYR", PH: "PHP", ID: "IDR",
  CN: "CNY", US: "USD", GB: "GBP", CH: "CHF", AU: "AUD", NZ: "NZD", CA: "CAD", CZ: "CZK", TR: "TRY", KH: "KHR", IN: "INR",
  FR: "EUR", DE: "EUR", IT: "EUR", ES: "EUR", NL: "EUR", AT: "EUR", GR: "EUR", PT: "EUR", BE: "EUR", FI: "EUR", IE: "EUR",
  LU: "EUR", SK: "EUR", SI: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", HR: "EUR", MT: "EUR", CY: "EUR", TW: "TWD"
};

function fmtMoney(amount, cur = "TWD") {
  if (amount == null || isNaN(amount)) return "—";
  const c = CURRENCIES[cur];
  const digits = c ? c.digits : 2;
  const n = Number(amount).toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: digits });
  return c ? `${c.symbol}${n}` : `${cur} ${n}`;
}
function currencyName(cur) { return CURRENCIES[cur]?.name || cur; }

// ===== 國內 / 國外 =====

const TW_PLACES = /台灣|臺灣|台北|臺北|新北|基隆|桃園|新竹|苗栗|台中|臺中|彰化|南投|雲林|嘉義|台南|臺南|高雄|屏東|宜蘭|花蓮|台東|臺東|澎湖|金門|馬祖|連江|綠島|蘭嶼|小琉球|九份|金瓜石|瑞芳|淡水|墾丁|阿里山|日月潭|太魯閣|清境|合歡山|鹿港|平溪|十分|猴硐|北投|陽明山|烏來|三峽|鶯歌|大溪|內灣|知本|池上|恆春|旗津|安平|礁溪|頭城|羅東|taiwan|taipei|kaohsiung|tainan|taichung/i;

const ABROAD_PLACES = [
  [/日本|東京|大阪|京都|奈良|神戶|北海道|札幌|函館|小樽|沖繩|那霸|福岡|九州|名古屋|橫濱|鎌倉|箱根|富士|輕井澤|金澤|廣島|仙台|四國|熊本|鹿兒島|長崎|japan|tokyo|osaka|kyoto|okinawa/i, "JPY"],
  [/韓國|首爾|釜山|濟州|大邱|仁川|korea|seoul|busan/i, "KRW"],
  [/泰國|曼谷|清邁|普吉|芭達雅|華欣|thailand|bangkok/i, "THB"],
  [/越南|河內|胡志明|峴港|富國島|會安|vietnam/i, "VND"],
  [/香港|hong ?kong/i, "HKD"],
  [/澳門|macau/i, "MOP"],
  [/新加坡|singapore/i, "SGD"],
  [/馬來西亞|吉隆坡|檳城|沙巴|蘭卡威|malaysia/i, "MYR"],
  [/菲律賓|宿霧|長灘島|馬尼拉|巴拉望|philippines|cebu/i, "PHP"],
  [/印尼|峇里島|巴里島|雅加達|indonesia|bali/i, "IDR"],
  [/中國|上海|北京|廈門|廣州|深圳|成都|杭州|china|shanghai/i, "CNY"],
  [/美國|紐約|洛杉磯|舊金山|夏威夷|西雅圖|拉斯維加斯|usa|new york|hawaii/i, "USD"],
  [/英國|倫敦|愛丁堡|london|england/i, "GBP"],
  [/瑞士|switzerland/i, "CHF"],
  [/法國|巴黎|德國|柏林|慕尼黑|義大利|羅馬|威尼斯|米蘭|佛羅倫斯|西班牙|巴塞隆納|馬德里|荷蘭|阿姆斯特丹|奧地利|維也納|希臘|葡萄牙|里斯本|比利時|芬蘭|愛爾蘭|歐洲|paris|europe|italy|france|germany|spain/i, "EUR"],
  [/澳洲|雪梨|墨爾本|布里斯本|黃金海岸|australia|sydney/i, "AUD"],
  [/紐西蘭|new zealand/i, "NZD"],
  [/加拿大|溫哥華|多倫多|canada|vancouver/i, "CAD"],
  [/捷克|布拉格|czech|prague/i, "CZK"],
  [/土耳其|伊斯坦堡|turkey|istanbul/i, "TRY"],
  [/柬埔寨|吳哥|cambodia/i, "KHR"],
  [/印度|india/i, "INR"]
];

function inTaiwan(lat, lng) {
  return (lat > 21.8 && lat < 25.4 && lng > 119.9 && lng < 122.1) ||   // 本島
    (lat > 23.1 && lat < 23.9 && lng > 119.3 && lng < 119.8) ||        // 澎湖
    (lat > 24.35 && lat < 24.55 && lng > 118.2 && lng < 118.5) ||      // 金門
    (lat > 25.9 && lat < 26.4 && lng > 119.85 && lng < 120.55);        // 馬祖
}

function tripCoords(t) {
  return t.days.flatMap(d => d.items).filter(i => i.lat != null);
}

// 地名查詢結果（國家、座標）存在這台裝置，避免重複查
const GEO_KEY = "etrip_geo_cache";
const _geo = (() => { try { return JSON.parse(localStorage.getItem(GEO_KEY) || "{}"); } catch (e) { return {}; } })();
const _geoPending = new Set();

async function geocodeRegion(name) {
  const key = str(name);
  if (!key || _geo[key] !== undefined || _geoPending.has(key) || !navigator.onLine) return _geo[key] || null;
  _geoPending.add(key);
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(key)}&count=1&language=zh&format=json`);
    const data = await res.json();
    const r = data.results && data.results[0];
    _geo[key] = r ? { cc: r.country_code, lat: r.latitude, lng: r.longitude } : null;
    try { localStorage.setItem(GEO_KEY, JSON.stringify(_geo)); } catch (e) { /* ignore */ }
    scheduleTravelRefresh();
  } catch (e) {
    /* 查不到就算了，下次再試 */
  } finally {
    _geoPending.delete(key);
  }
  return _geo[key] || null;
}

/** 推斷：true 國外 / false 國內 / null 不知道 */
function inferAbroad(t) {
  const pts = tripCoords(t);
  if (pts.length) {
    const outside = pts.filter(p => !inTaiwan(p.lat, p.lng)).length;
    return outside > pts.length / 2;
  }
  const text = `${t.meta.region} ${t.meta.title}`;
  if (TW_PLACES.test(text)) return false;
  if (ABROAD_PLACES.some(([re]) => re.test(text))) return true;
  const g = _geo[str(t.meta.region)];
  if (g) return g.cc !== "TW";
  if (t.meta.region) geocodeRegion(t.meta.region);
  return null;
}

function isAbroad(t = tripData) {
  if (t.meta.abroad != null) return t.meta.abroad;
  return inferAbroad(t) === true;
}

/** 當地幣別：手動設定 > 地名判斷 > 地名查詢的國家 */
function tripCurrency(t = tripData) {
  if (!isAbroad(t)) return "TWD";
  if (t.meta.currency) return t.meta.currency;
  const text = `${t.meta.region} ${t.meta.title}`;
  const hit = ABROAD_PLACES.find(([re]) => re.test(text));
  if (hit) return hit[1];
  const g = _geo[str(t.meta.region)];
  if (g && COUNTRY_CURRENCY[g.cc]) return COUNTRY_CURRENCY[g.cc];
  if (t.meta.region) geocodeRegion(t.meta.region);
  return "";
}

// ===== 天氣（Open-Meteo，最多預報 16 天） =====

const WEATHER_KEY = "etrip_weather";
const WEATHER_TTL = 3 * 3600 * 1000;
const _wx = (() => { try { return JSON.parse(localStorage.getItem(WEATHER_KEY) || "{}"); } catch (e) { return {}; } })();
const _wxPending = new Set();
const _wxTried = {};   // 每個地點 10 分鐘內只查一次，避免查不到時一直重查

const WMO = [
  [[0], "☀️", "晴"], [[1], "🌤️", "晴時多雲"], [[2], "⛅", "多雲"], [[3], "☁️", "陰"],
  [[45, 48], "🌫️", "霧"], [[51, 53, 55, 56, 57], "🌦️", "毛毛雨"],
  [[61], "🌧️", "小雨"], [[63], "🌧️", "雨"], [[65, 66, 67], "🌧️", "大雨"],
  [[71, 73, 75, 77], "🌨️", "下雪"], [[80, 81, 82], "🌦️", "陣雨"], [[85, 86], "🌨️", "陣雪"],
  [[95, 96, 99], "⛈️", "雷雨"]
];
function wmoInfo(code) {
  const hit = WMO.find(([codes]) => codes.includes(code));
  return hit ? { icon: hit[1], text: hit[2] } : { icon: "🌡️", text: "" };
}

/** 第 i 天的位置：當天行程的中心點 > 最近一天有座標的 > 目的地查詢 */
function dayLocation(t, i) {
  const center = items => {
    const pts = items.filter(x => x.lat != null);
    if (!pts.length) return null;
    return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
  };
  const own = center(t.days[i]?.items || []);
  if (own) return own;
  for (let k = 1; k < t.days.length; k++) {
    const near = center(t.days[i - k]?.items || []) || center(t.days[i + k]?.items || []);
    if (near) return near;
  }
  const g = _geo[str(t.meta.region)];
  if (g) return { lat: g.lat, lng: g.lng };
  if (t.meta.region) geocodeRegion(t.meta.region);
  return null;
}

const wxKey = (loc, date) => `${loc.lat.toFixed(1)},${loc.lng.toFixed(1)}|${date}`;

/** 取得某天的天氣（只讀快取，沒有就在背景抓） */
function dayWeather(t, i) {
  const date = dayDateOf(t, i);
  if (!date) return null;
  const today = toISODate(new Date());
  const ahead = daysBetween(today, date);
  if (ahead == null || ahead < 0 || ahead > 15) return null;
  const loc = dayLocation(t, i);
  if (!loc) return null;
  const hit = _wx[wxKey(loc, date)];
  if (!hit || Date.now() - hit.ts > WEATHER_TTL) fetchWeather(loc);
  return hit ? hit.d : null;
}

async function fetchWeather(loc) {
  const k = `${loc.lat.toFixed(1)},${loc.lng.toFixed(1)}`;
  if (_wxPending.has(k) || !navigator.onLine || Date.now() - (_wxTried[k] || 0) < 600000) return;
  _wxPending.add(k);
  _wxTried[k] = Date.now();
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat.toFixed(3)}&longitude=${loc.lng.toFixed(3)}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
    const data = await (await fetch(url)).json();
    const d = data.daily;
    if (!d || !Array.isArray(d.time)) return;
    const now = Date.now();
    d.time.forEach((date, j) => {
      _wx[`${k}|${date}`] = {
        ts: now,
        d: { code: d.weather_code[j], max: Math.round(d.temperature_2m_max[j]), min: Math.round(d.temperature_2m_min[j]), pop: d.precipitation_probability_max[j] }
      };
    });
    // 清掉過期的日期
    const today = toISODate(new Date());
    for (const key of Object.keys(_wx)) if (key.split("|")[1] < today) delete _wx[key];
    try { localStorage.setItem(WEATHER_KEY, JSON.stringify(_wx)); } catch (e) { /* ignore */ }
    scheduleTravelRefresh();
  } catch (e) {
    /* 沒網路或服務暫停：顯示舊資料或不顯示 */
  } finally {
    _wxPending.delete(k);
  }
}

function weatherShort(w) {
  if (!w) return "";
  const i = wmoInfo(w.code);
  return `${i.icon} 高${w.max}° 低${w.min}°${w.pop >= 40 ? ` 💧${w.pop}%` : ""}`;
}

// ===== 匯率（每天更新一次，存在手機裡，沒網路也能算） =====

const RATES_KEY = "etrip_rates";
let _rates = (() => { try { return JSON.parse(localStorage.getItem(RATES_KEY) || "null"); } catch (e) { return null; } })();
let _ratesPending = false;
let _ratesTried = 0;

function ratesInfo() {
  if ((!_rates || Date.now() - _rates.ts > 12 * 3600 * 1000) && !_ratesPending && Date.now() - _ratesTried > 600000) fetchRates();
  return _rates;
}

async function fetchRates() {
  if (!navigator.onLine) return;
  _ratesPending = true;
  _ratesTried = Date.now();
  try {
    const data = await (await fetch("https://open.er-api.com/v6/latest/TWD")).json();
    if (data.result === "success" && data.rates) {
      _rates = { ts: Date.now(), updated: (data.time_last_update_unix || 0) * 1000, rates: data.rates };
      try { localStorage.setItem(RATES_KEY, JSON.stringify(_rates)); } catch (e) { /* ignore */ }
      scheduleTravelRefresh();
    }
  } catch (e) {
    /* 稍後再試 */
  } finally {
    _ratesPending = false;
  }
}

/** 換算成台幣；沒有匯率時回傳 null */
function toTWD(amount, cur) {
  if (cur === "TWD") return amount;
  const r = ratesInfo()?.rates?.[cur];
  return r ? amount / r : null;
}
function fromTWD(amount, cur) {
  if (cur === "TWD") return amount;
  const r = ratesInfo()?.rates?.[cur];
  return r ? amount * r : null;
}

function currencyCardHTML() {
  const cur = tripCurrency();
  if (!cur || cur === "TWD") return "";
  const info = ratesInfo();
  const rate = info?.rates?.[cur];
  const unit = ["JPY", "KRW", "VND", "IDR", "KHR"].includes(cur) ? (cur === "JPY" ? 1000 : cur === "KRW" ? 10000 : 100000) : 100;
  return `
  <section class="card fx-card">
    <div class="card-head">
      <h2>${icon("coins")}匯率</h2>
      <span class="muted small">${rate ? `${formatDateTime(info.updated || info.ts)} 更新` : "等待連線取得匯率"}</span>
    </div>
    ${rate ? `
    <p class="fx-rate">${fmtMoney(unit, cur)} ≈ <b>${fmtMoney(unit / rate, "TWD")}</b></p>
    <div class="fx-row">
      <label class="fx-field"><span>${esc(currencyName(cur))}</span><input id="fxForeign" type="number" inputmode="decimal" placeholder="${unit}" data-fx="foreign"></label>
      <span class="fx-eq">=</span>
      <label class="fx-field"><span>台幣</span><input id="fxTwd" type="number" inputmode="decimal" placeholder="${Math.round(unit / rate)}" data-fx="twd"></label>
    </div>
    <p class="field-hint"><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates By Exchange Rate API</a>・實際刷卡匯率會略有不同</p>` : ""}
  </section>`;
}

/** 匯率計算機：輸入一邊，另一邊自動算 */
document.addEventListener("input", e => {
  const el = e.target.closest("[data-fx]");
  if (!el) return;
  const cur = tripCurrency();
  const v = parseFloat(el.value);
  const other = el.dataset.fx === "foreign" ? $("#fxTwd") : $("#fxForeign");
  if (!other) return;
  if (isNaN(v)) { other.value = ""; return; }
  const out = el.dataset.fx === "foreign" ? toTWD(v, cur) : fromTWD(v, cur);
  if (out == null) return;
  const digits = el.dataset.fx === "foreign" ? 0 : (CURRENCIES[cur]?.digits ?? 2);
  other.value = Number(out.toFixed(digits));
});

// 資料回來後重畫（多筆一起回來時只重畫一次；正在編輯時不重畫）
let _travelTimer = null;
function scheduleTravelRefresh() {
  clearTimeout(_travelTimer);
  _travelTimer = setTimeout(() => {
    if ($("#sheet")?.open) return scheduleTravelRefresh();
    if (document.activeElement?.matches("input, textarea, select")) return scheduleTravelRefresh();
    if (typeof refresh === "function") refresh();
  }, 400);
}
