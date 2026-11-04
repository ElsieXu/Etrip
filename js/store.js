// =========================================
// store.js — 資料結構、localStorage 儲存、舊版資料轉換
// =========================================

const STORAGE_KEY = "tripData";
const PREV_KEY = "tripData_prev";   // 被「取代」之前的上一版，可復原
const PREFS_KEY = "etrip_prefs";    // 介面偏好（目前分頁、展開狀態、篩選條件）
const SCHEMA_VERSION = 2;

const CATEGORIES = {
  food:  { label: "美食",     icon: "🍜" },
  cafe:  { label: "咖啡甜點", icon: "☕" },
  sight: { label: "景點",     icon: "🏞️" },
  shop:  { label: "購物",     icon: "🛍️" },
  other: { label: "其他",     icon: "📌" }
};

function emptyTrip() {
  return {
    version: SCHEMA_VERSION,
    meta: { title: "", region: "", startDate: "", updatedAt: 0, exportedAt: 0 },
    flight: { depart: "", return: "" },          // 去程 / 回程交通（航班、高鐵、自駕都可）
    hotels: [],
    info: { codes: "", emergency: "", notes: "" }, // 重要資訊卡
    days: [],
    backups: []                                    // 口袋名單
  };
}

function normCategory(c) {
  const s = str(c).toLowerCase();
  if (CATEGORIES[s]) return s;
  const rules = [
    ["cafe", /咖啡|甜點|甜品|下午茶|冰|cafe|coffee|dessert|bakery|麵包/],
    ["food", /美食|餐|食|麵|飯|鍋|燒肉|壽司|小吃|夜市|居酒屋|restaurant|food/],
    ["shop", /購物|商店|商場|百貨|藥妝|市集|outlet|shop|store|mall/],
    ["sight", /景點|景|公園|神社|寺|廟|博物館|美術館|城|山|海|步道|sight|attraction|park|museum/]
  ];
  for (const [key, re] of rules) if (re.test(s)) return key;
  return "other";
}

function normalizeItem(it) {
  if (typeof it === "string") it = { text: it };
  it = it || {};
  return {
    id: str(it.id) || uid(),
    time: str(it.time),
    text: str(it.text || it.name),
    note: str(it.note),
    lat: num(it.lat),
    lng: num(it.lng),
    placeId: str(it.placeId || it.place_id),
    done: !!it.done,
    backupId: str(it.backupId)
  };
}

function normalizeBackup(b) {
  if (typeof b === "string") b = { name: b };
  b = b || {};
  return {
    id: str(b.id) || uid(),
    name: str(b.name || b.text),
    category: normCategory(b.category),
    area: str(b.area),
    note: str(b.note),
    source: safeUrl(b.source),
    priority: b.priority === "must" ? "must" : "maybe",
    rainy: !!b.rainy,
    status: ["visited", "skipped"].includes(b.status) ? b.status : "todo",
    lat: num(b.lat),
    lng: num(b.lng),
    placeId: str(b.placeId || b.place_id),
    createdAt: num(b.createdAt) || Date.now()
  };
}

function normalizeHotel(h) {
  if (typeof h === "string") h = { name: h };
  h = h || {};
  return {
    id: str(h.id) || uid(),
    name: str(h.name),
    address: str(h.address),
    phone: str(h.phone),
    dates: str(h.dates || h.checkin),
    code: str(h.code),
    note: str(h.note)
  };
}

/** 把任何版本的資料（含舊版 v1）整理成目前的格式 */
function normalizeTrip(raw) {
  const t = emptyTrip();
  if (!raw || typeof raw !== "object") return t;

  const meta = raw.meta || {};
  t.meta.title = str(meta.title ?? raw.title);
  t.meta.region = str(meta.region ?? raw.region ?? raw.destination);
  t.meta.startDate = isISODate(meta.startDate) ? meta.startDate
    : isISODate(raw.start_date) ? raw.start_date : "";
  t.meta.updatedAt = num(meta.updatedAt) || 0;
  t.meta.exportedAt = num(meta.exportedAt) || 0;

  t.flight.depart = str(raw.flight?.depart);
  t.flight.return = str(raw.flight?.return);

  // v1 用過 hotel（物件或陣列）與 hotels 兩種欄位
  let hotels = raw.hotels ?? raw.hotel ?? [];
  if (!Array.isArray(hotels)) hotels = [hotels];
  t.hotels = hotels.map(normalizeHotel).filter(h => h.name || h.address);

  const info = raw.info || {};
  t.info = { codes: str(info.codes), emergency: str(info.emergency), notes: str(info.notes) };

  t.days = (Array.isArray(raw.days) ? raw.days : []).map((d, i) => ({
    id: str(d?.id) || uid(),
    title: str(d?.title) || `Day ${i + 1}`,
    date: isISODate(d?.date) ? d.date : "",
    items: (Array.isArray(d?.items) ? d.items : []).map(normalizeItem).filter(x => x.text)
  }));

  // 口袋名單去重（v1 的景點雷達會把同一個地點加兩次）
  const seen = new Map();
  for (const b of (Array.isArray(raw.backups) ? raw.backups : []).map(normalizeBackup)) {
    if (!b.name) continue;
    const key = b.name.toLowerCase();
    const prev = seen.get(key);
    if (!prev) seen.set(key, b);
    else if (prev.lat == null && b.lat != null) Object.assign(prev, { lat: b.lat, lng: b.lng, placeId: b.placeId || prev.placeId });
  }
  t.backups = [...seen.values()];

  if (!t.meta.startDate) t.meta.startDate = inferStartDate(t);
  return t;
}

function inferStartDate(t) {
  const i = t.days.findIndex(d => d.date);
  if (i >= 0) return addDays(t.days[i].date, -i);
  const dep = parseLooseDateTime(t.flight.depart);
  return dep ? dep.date : "";
}

// ===== 讀寫 =====

let tripData = loadTrip();

function loadTrip() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyTrip();
    const t = normalizeTrip(JSON.parse(saved));
    // 舊版資料沒有修改時間，視為剛剛修改（提醒要同步一次）
    if (!t.meta.updatedAt && (t.days.length || t.backups.length)) t.meta.updatedAt = Date.now();
    return t;
  } catch (e) {
    console.error("讀取行程失敗", e);
    return emptyTrip();
  }
}

function saveTrip({ touch = true } = {}) {
  if (touch) tripData.meta.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tripData));
  } catch (e) {
    console.error(e);
    toast("儲存失敗：瀏覽器空間可能已滿");
  }
}

/** 整份取代（會先把目前的行程存成上一版，可以復原） */
function replaceTrip(newTrip) {
  if (tripData.days.length || tripData.backups.length) {
    try { localStorage.setItem(PREV_KEY, JSON.stringify(tripData)); } catch (e) { /* ignore */ }
  }
  tripData = normalizeTrip(newTrip);
  saveTrip({ touch: false });
}

function hasPrevTrip() {
  try { return !!localStorage.getItem(PREV_KEY); } catch (e) { return false; }
}

function restorePrevTrip() {
  try {
    const prev = localStorage.getItem(PREV_KEY);
    if (!prev) return false;
    const current = JSON.stringify(tripData);
    tripData = normalizeTrip(JSON.parse(prev));
    localStorage.setItem(PREV_KEY, current); // 可以再切換回來
    saveTrip({ touch: false });
    return true;
  } catch (e) {
    return false;
  }
}

// ===== 介面偏好 =====

const prefs = (() => {
  const defaults = {
    view: "", expanded: {},
    pocket: { cat: "all", must: false, rainy: false, hideVisited: true, sort: "new" }
  };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return { ...defaults, ...p, pocket: { ...defaults.pocket, ...(p.pocket || {}) } };
  } catch (e) {
    return defaults;
  }
})();

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
}

// ===== 查詢 =====

/** 第 i 天的日期：優先用該天自己的日期，否則由出發日推算 */
function dayDate(i) {
  const d = tripData.days[i];
  if (!d) return "";
  if (d.date) return d.date;
  return tripData.meta.startDate ? addDays(tripData.meta.startDate, i) : "";
}

function todayIndex() {
  const today = toISODate(new Date());
  return tripData.days.findIndex((_, i) => dayDate(i) === today);
}

/** empty / undated / before / during / after */
function tripPhase() {
  const n = tripData.days.length;
  if (!n) return "empty";
  const first = dayDate(0), last = dayDate(n - 1);
  if (!first) return "undated";
  const today = toISODate(new Date());
  if (today < first) return "before";
  if (last && today > last) return "after";
  return "during";
}

function findItem(dayIndex, id) {
  const day = tripData.days[dayIndex];
  if (!day) return null;
  const index = day.items.findIndex(x => x.id === id);
  return index >= 0 ? { day, item: day.items[index], index } : null;
}

function findBackup(id) { return tripData.backups.find(b => b.id === id); }

/** 這個口袋名單地點被排進哪幾天 */
function scheduledDays(backup) {
  const out = [];
  tripData.days.forEach((d, i) => {
    if (d.items.some(it => it.backupId === backup.id || it.text === backup.name)) out.push(i);
  });
  return out;
}

function lastCoordItem(day) {
  return [...(day?.items || [])].reverse().find(i => i.lat != null && i.lng != null) || null;
}

function dayLabel(i) {
  const date = dayDate(i);
  return `D${i + 1}${date ? " · " + formatDateLabel(date) : ""}`;
}
