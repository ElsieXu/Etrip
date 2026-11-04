// =========================================
// store.js — 資料結構、localStorage 儲存、舊版資料轉換
//
// 資料分成兩層：
//   library（整個資料庫）= 多個行程 trips[] ＋ 共用的口袋名單 backups[]
//   tripData（目前正在看的行程）＝ library.trips 其中一個
// tripData.backups 會直接指向 library.backups，所以各頁面不用管是哪一層。
// =========================================

const LIB_KEY = "etrip_library";        // v3：多行程
const LEGACY_KEY = "tripData";          // v1 / v2：單一行程（啟動時自動轉換）
const PREV_KEY = "etrip_library_prev";  // 匯入或清除之前的備份，可復原一次
const PREFS_KEY = "etrip_prefs";        // 介面偏好（目前分頁、展開狀態、篩選條件）
const SCHEMA_VERSION = 3;

const CATEGORIES = {
  food:  { label: "美食",     icon: "🍜" },
  cafe:  { label: "咖啡甜點", icon: "☕" },
  sight: { label: "景點",     icon: "🏞️" },
  shop:  { label: "購物",     icon: "🛍️" },
  other: { label: "其他",     icon: "📌" }
};

function emptyTrip() {
  return {
    id: uid(),
    meta: { title: "", region: "", startDate: "", albumUrl: "", demo: false, createdAt: Date.now(), updatedAt: 0, exportedAt: 0 },
    flight: { depart: "", return: "" },          // 去程 / 回程交通（航班、高鐵、自駕都可）
    hotels: [],
    info: { codes: "", emergency: "", notes: "" }, // 重要資訊卡
    days: []
  };
}

function emptyLibrary() {
  return { version: SCHEMA_VERSION, currentTripId: "", trips: [], backups: [], deleted: {} };
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
  const rating = Math.round(num(it.rating) || 0);
  return {
    id: str(it.id) || uid(),
    time: str(it.time),
    text: str(it.text || it.name),
    note: str(it.note),
    lat: num(it.lat),
    lng: num(it.lng),
    placeId: str(it.placeId || it.place_id),
    done: !!it.done,
    backupId: str(it.backupId),
    rating: Math.min(5, Math.max(0, rating)),   // 旅行後的評分 0~5（0 = 沒評）
    review: str(it.review)                      // 旅行後的心得
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
    demo: !!b.demo,
    createdAt: num(b.createdAt) || Date.now(),
    updatedAt: num(b.updatedAt) || 0
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

/** 把任何版本的單一行程（含舊版 v1 / v2）整理成目前的格式（不含口袋名單） */
function normalizeTrip(raw) {
  const t = emptyTrip();
  if (!raw || typeof raw !== "object") return t;

  if (str(raw.id)) t.id = str(raw.id);
  const meta = raw.meta || {};
  t.meta.title = str(meta.title ?? raw.title);
  t.meta.region = str(meta.region ?? raw.region ?? raw.destination);
  t.meta.startDate = isISODate(meta.startDate) ? meta.startDate
    : isISODate(raw.start_date) ? raw.start_date : "";
  t.meta.albumUrl = safeUrl(meta.albumUrl);
  t.meta.demo = !!meta.demo;
  t.meta.createdAt = num(meta.createdAt) || num(meta.updatedAt) || Date.now();
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

  if (!t.meta.startDate) t.meta.startDate = inferStartDate(t);
  return t;
}

/** 口袋名單去重（同名合併，保留有座標的那筆） */
function normalizeBackups(list) {
  const seen = new Map();
  for (const b of (Array.isArray(list) ? list : []).map(normalizeBackup)) {
    if (!b.name) continue;
    const key = b.name.toLowerCase();
    const prev = seen.get(key);
    if (!prev) seen.set(key, b);
    else if (prev.lat == null && b.lat != null) Object.assign(prev, { lat: b.lat, lng: b.lng, placeId: b.placeId || prev.placeId });
  }
  return [...seen.values()];
}

function tripHasContent(t) {
  return !!(t.days.length || t.meta.title || t.hotels.length || t.flight.depart || t.flight.return ||
    t.info.codes || t.info.emergency || t.info.notes);
}

/** 任何版本的資料 → library。舊版（單一行程）會變成 trips 的第一個 */
function normalizeLibrary(raw) {
  const lib = emptyLibrary();
  if (!raw || typeof raw !== "object") return lib;
  if (Array.isArray(raw.trips)) {
    lib.trips = raw.trips.map(normalizeTrip);
    lib.backups = normalizeBackups(raw.backups);
    lib.currentTripId = str(raw.currentTripId);
    for (const [id, ts] of Object.entries(raw.deleted || {})) if (num(ts)) lib.deleted[id] = num(ts);
  } else {
    const t = normalizeTrip(raw);
    if (tripHasContent(t)) lib.trips = [t];
    lib.backups = normalizeBackups(raw.backups);
    lib.currentTripId = t.id;
  }
  return lib;
}

function inferStartDate(t) {
  const i = t.days.findIndex(d => d.date);
  if (i >= 0) return addDays(t.days[i].date, -i);
  const dep = parseLooseDateTime(t.flight.depart);
  return dep ? dep.date : "";
}

// ===== 讀寫 =====

let library = loadLibrary();
let tripData = null;
let _sigs = new Map();   // 記錄每個行程 / 口袋地點上次儲存時的內容，用來判斷「哪個有改過」
rememberSignatures();
selectTrip(library.currentTripId, { save: false });

function loadLibrary() {
  try {
    const saved = localStorage.getItem(LIB_KEY);
    if (saved) return normalizeLibrary(JSON.parse(saved));
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      // 舊版單一行程 → 新版多行程（舊資料保留在原位置，不刪除）
      const lib = normalizeLibrary(JSON.parse(legacy));
      const now = Date.now();
      lib.trips.forEach(t => { t.meta.updatedAt = t.meta.updatedAt || now; });
      lib.backups.forEach(b => { b.updatedAt = b.updatedAt || now; });
      // 立刻存成新格式，避免每次開啟都重新轉換（行程 id 會不一樣）
      try { localStorage.setItem(LIB_KEY, JSON.stringify(lib)); } catch (e) { /* ignore */ }
      return lib;
    }
  } catch (e) {
    console.error("讀取資料失敗", e);
  }
  return emptyLibrary();
}

/** 讓 trip.backups 指向共用的口袋名單（不會被存進行程本身） */
function attachTrip(t) {
  if (!Object.getOwnPropertyDescriptor(t, "backups")) {
    Object.defineProperty(t, "backups", {
      get: () => library.backups,
      set: v => { library.backups = v; },
      enumerable: false,
      configurable: true
    });
  }
  return t;
}

function tripSig(t) { return JSON.stringify({ ...t, meta: { ...t.meta, updatedAt: 0, exportedAt: 0 } }); }
function backupSig(b) { return JSON.stringify({ ...b, updatedAt: 0 }); }

function rememberSignatures() {
  _sigs = new Map();
  library.trips.forEach(t => _sigs.set(t.id, tripSig(t)));
  library.backups.forEach(b => _sigs.set(b.id, backupSig(b)));
}

/**
 * 儲存。會自動找出哪些行程 / 口袋地點有改動並更新它們的修改時間，
 * 被刪掉的會記錄下來（雲端同步時才知道要在其他裝置刪除）。
 */
function saveTrip() {
  const now = Date.now();
  // 目前的行程有內容了才放進資料庫（避免留下空白行程）
  if (tripData && !library.trips.includes(tripData) && tripHasContent(tripData)) {
    library.trips.push(tripData);
  }
  if (tripData && library.trips.includes(tripData)) library.currentTripId = tripData.id;

  const alive = new Set();
  let changed = false;
  for (const t of library.trips) {
    alive.add(t.id);
    const s = tripSig(t);
    if (_sigs.get(t.id) !== s) { t.meta.updatedAt = now; _sigs.set(t.id, s); changed = true; }
  }
  for (const b of library.backups) {
    alive.add(b.id);
    const s = backupSig(b);
    if (_sigs.get(b.id) !== s) { b.updatedAt = now; _sigs.set(b.id, s); changed = true; }
  }
  for (const id of [..._sigs.keys()]) {
    if (!alive.has(id)) { library.deleted[id] = now; _sigs.delete(id); changed = true; }
  }
  // 刪除紀錄只保留 180 天
  for (const [id, ts] of Object.entries(library.deleted)) if (now - ts > 180 * 86400000) delete library.deleted[id];

  writeLibrary();
  if (changed && typeof onLibraryChanged === "function") onLibraryChanged();
}

function writeLibrary() {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(library));
  } catch (e) {
    console.error(e);
    toast("儲存失敗：瀏覽器空間可能已滿");
  }
}

/** 取代整個資料庫之前先留一份，可以復原一次 */
function snapshotLibrary() {
  try { localStorage.setItem(PREV_KEY, JSON.stringify(library)); } catch (e) { /* ignore */ }
}

function hasPrevLibrary() {
  try { return !!localStorage.getItem(PREV_KEY); } catch (e) { return false; }
}

function restorePrevLibrary() {
  try {
    const prev = localStorage.getItem(PREV_KEY);
    if (!prev) return false;
    const current = JSON.stringify(library);
    setLibrary(normalizeLibrary(JSON.parse(prev)));
    localStorage.setItem(PREV_KEY, current); // 可以再切換回來
    saveTrip();
    return true;
  } catch (e) {
    return false;
  }
}

/** 換掉整個資料庫（匯入、同步合併後） */
function setLibrary(lib, { keepSignatures = false } = {}) {
  library = lib;
  if (!keepSignatures) rememberSignatures();
  selectTrip(library.currentTripId, { save: false });
}

// ===== 行程切換 / 新增 / 刪除 =====

/** 依日期挑一個最適合打開的行程：旅途中 > 最近要出發 > 最近修改 */
function pickDefaultTrip() {
  const ts = library.trips;
  if (!ts.length) return null;
  const during = ts.find(t => tripPhaseOf(t) === "during");
  if (during) return during;
  const upcoming = ts.filter(t => tripPhaseOf(t) === "before").sort((a, b) => dayDateOf(a, 0).localeCompare(dayDateOf(b, 0)));
  if (upcoming.length) return upcoming[0];
  return ts.slice().sort((a, b) => b.meta.updatedAt - a.meta.updatedAt)[0];
}

function selectTrip(id, { save = true } = {}) {
  const t = library.trips.find(x => x.id === id) || pickDefaultTrip();
  tripData = attachTrip(t || emptyTrip());
  library.currentTripId = t ? t.id : "";
  if (save) writeLibrary();
}

/** 新增一個行程並切換過去 */
function createTrip(raw) {
  const t = attachTrip(normalizeTrip({ ...raw, id: undefined }));
  t.meta.createdAt = Date.now();
  library.trips.push(t);
  tripData = t;
  saveTrip();
  return t;
}

/** 開一個空白行程（有內容後才會存進資料庫） */
function startBlankTrip() {
  tripData = attachTrip(emptyTrip());
}

function deleteTrip(id) {
  const idx = library.trips.findIndex(t => t.id === id);
  if (idx < 0) return null;
  const [t] = library.trips.splice(idx, 1);
  // 範例行程的範例口袋名單一起移除
  let demoBackups = [];
  if (t.meta.demo && !library.trips.some(x => x.meta.demo)) {
    demoBackups = library.backups.filter(b => b.demo);
    library.backups = library.backups.filter(b => !b.demo);
  }
  if (tripData === t) selectTrip("", { save: false });
  saveTrip();
  return { trip: t, index: idx, demoBackups };
}

function undoDeleteTrip(info) {
  library.trips.splice(info.index, 0, info.trip);
  library.backups.push(...info.demoBackups);
  delete library.deleted[info.trip.id];
  info.demoBackups.forEach(b => delete library.deleted[b.id]);
  tripData = attachTrip(info.trip);
  saveTrip();
}

/** 再去一次：複製行程（清掉日期和打勾，心得留著參考） */
function duplicateTrip(src) {
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.meta.title = `${src.meta.title || "行程"}（再訪）`;
  copy.meta.startDate = "";
  copy.meta.albumUrl = "";
  copy.meta.demo = false;
  copy.meta.updatedAt = 0;
  copy.meta.exportedAt = 0;
  copy.flight = { depart: "", return: "" };
  copy.days.forEach(d => {
    d.id = uid();
    d.date = "";
    d.items.forEach(it => { it.id = uid(); it.done = false; });
  });
  copy.hotels.forEach(h => { h.id = uid(); h.code = ""; h.dates = ""; });
  return createTrip(copy);
}

// ===== 合併（雲端同步、匯入備份檔時使用） =====

/** 兩份資料庫合併：同一個行程 / 地點取較新的，刪除紀錄較新的就刪掉 */
function mergeLibraries(local, remote) {
  const out = emptyLibrary();
  out.currentTripId = local.currentTripId || remote.currentTripId;
  out.deleted = { ...remote.deleted };
  for (const [id, ts] of Object.entries(local.deleted || {})) out.deleted[id] = Math.max(ts, out.deleted[id] || 0);

  const pick = (list, getTs) => {
    const map = new Map();
    for (const x of list) {
      const prev = map.get(x.id);
      if (!prev || getTs(x) > getTs(prev)) map.set(x.id, x);
    }
    return [...map.values()].filter(x => !(out.deleted[x.id] && out.deleted[x.id] >= getTs(x)));
  };
  const order = list => list.map(x => x.id);
  const localOrder = order(local.trips);
  out.trips = pick([...remote.trips, ...local.trips], t => t.meta.updatedAt || 0)
    .sort((a, b) => (localOrder.indexOf(a.id) + 1 || 1e9) - (localOrder.indexOf(b.id) + 1 || 1e9));

  // 口袋名單：同 id 取新的；不同 id 但同名的視為同一個地點
  const bs = pick([...remote.backups, ...local.backups], b => b.updatedAt || 0);
  const byName = new Map();
  for (const b of bs) {
    const k = b.name.toLowerCase();
    const prev = byName.get(k);
    if (!prev || (b.updatedAt || 0) > (prev.updatedAt || 0)) byName.set(k, b);
  }
  out.backups = [...byName.values()].sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

// ===== 介面偏好 =====

const prefs = (() => {
  const defaults = {
    view: "", expanded: {}, apiBase: "", theme: "auto", accent: "sky",
    pocket: { cat: "all", must: false, rainy: false, hideVisited: false, sort: "new" }
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

function dayDateOf(t, i) {
  const d = t.days[i];
  if (!d) return "";
  if (d.date) return d.date;
  return t.meta.startDate ? addDays(t.meta.startDate, i) : "";
}

/** 第 i 天的日期：優先用該天自己的日期，否則由出發日推算 */
function dayDate(i) { return dayDateOf(tripData, i); }

function todayIndex() {
  const today = toISODate(new Date());
  return tripData.days.findIndex((_, i) => dayDate(i) === today);
}

/** empty / undated / before / during / after */
function tripPhaseOf(t) {
  const n = t.days.length;
  if (!n) return "empty";
  const first = dayDateOf(t, 0), last = dayDateOf(t, n - 1);
  if (!first) return "undated";
  const today = toISODate(new Date());
  if (today < first) return "before";
  if (last && today > last) return "after";
  return "during";
}
function tripPhase() { return tripPhaseOf(tripData); }

function tripRangeLabel(t) {
  const n = t.days.length;
  const first = dayDateOf(t, 0);
  if (n === 1) return `${first ? formatDateLabel(first) + " · " : ""}一日遊`;
  if (n && first) return `${formatDateLabel(first)} – ${formatDateLabel(dayDateOf(t, n - 1))} · ${n} 天`;
  return n ? `${n} 天` : "還沒有行程內容";
}

/** 一日遊：只有一天的行程 */
function isDayTrip() { return tripData.days.length === 1; }

/**
 * 解析去程 / 回程文字的日期時間。
 * 一日遊常常只寫「17:35 自強號」沒寫日期，就當作是那一天。
 */
function legInfo(text) {
  const s = str(text);
  if (!s) return null;
  let r = parseLooseDateTime(s);
  if (!r) {
    const t = s.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    if (t && isDayTrip() && dayDate(0)) r = { date: dayDate(0), time: `${pad2(+t[1])}:${t[2]}` };
  }
  return r;
}

/** 今天要回程的話，回傳回程時間與倒數 */
function returnToday() {
  const r = legInfo(tripData.flight.return);
  if (!r || !r.time || r.date !== toISODate(new Date())) return null;
  return { time: r.time, countdown: countdownText(r.date, r.time) };
}

function findItem(dayIndex, id) {
  const day = tripData.days[dayIndex];
  if (!day) return null;
  const index = day.items.findIndex(x => x.id === id);
  return index >= 0 ? { day, item: day.items[index], index } : null;
}

function findBackup(id) { return library.backups.find(b => b.id === id); }

function itemMatchesBackup(it, b) { return it.backupId === b.id || it.text === b.name; }

/** 這個口袋名單地點被排進目前行程的哪幾天 */
function scheduledDays(backup) {
  const out = [];
  tripData.days.forEach((d, i) => {
    if (d.items.some(it => itemMatchesBackup(it, backup))) out.push(i);
  });
  return out;
}

/** 這個地點在所有行程裡實際去過（打勾）的紀錄，新的在前 */
function visitsOf(backup) {
  const out = [];
  for (const t of library.trips) {
    t.days.forEach((d, i) => {
      for (const it of d.items) {
        if (it.done && itemMatchesBackup(it, backup)) out.push({ trip: t, date: dayDateOf(t, i), rating: it.rating, review: it.review });
      }
    });
  }
  return out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function lastCoordItem(day) {
  return [...(day?.items || [])].reverse().find(i => i.lat != null && i.lng != null) || null;
}

function dayLabel(i) {
  const date = dayDate(i);
  return `D${i + 1}${date ? " · " + formatDateLabel(date) : ""}`;
}
