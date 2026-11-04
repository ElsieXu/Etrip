// =========================================
// sync.js — 雲端同步（同步碼，不用註冊帳號）
//
// 流程：每次修改後 2.5 秒自動上傳；打開網站、切回網站、恢復網路時自動下載。
// 兩台裝置都改過時，以「每個行程 / 每個口袋地點」為單位，保留較新的那一份。
// =========================================

const SYNC_KEY = "etrip_sync";

const syncState = (() => {
  const d = { code: "", version: 0, pending: false, lastSyncAt: 0, error: "" };
  try { return { ...d, ...JSON.parse(localStorage.getItem(SYNC_KEY) || "{}") }; } catch (e) { return d; }
})();
let _syncing = false;
let _syncAgain = false;
let _pushTimer = null;

function saveSyncState() {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(syncState)); } catch (e) { /* ignore */ }
}

function syncEnabled() { return !!syncState.code; }

/** 上傳用的資料：目前打開哪個行程是每台裝置自己的，不同步 */
function libraryForSync(lib = library) {
  const { currentTripId, ...rest } = lib;
  return rest;
}

/** store.js 在資料有變動時會呼叫 */
function onLibraryChanged() {
  if (!syncEnabled()) return;
  syncState.pending = true;
  saveSyncState();
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => syncNow(), 2500);
  updateSyncIndicators();
}

/** 用 id → 修改時間 來比較兩份資料是否相同 */
function libraryFingerprint(lib) {
  const parts = [];
  lib.trips.forEach(t => parts.push(`t:${t.id}:${t.meta.updatedAt || 0}`));
  lib.backups.forEach(b => parts.push(`b:${b.id}:${b.updatedAt || 0}`));
  Object.keys(lib.deleted || {}).forEach(id => parts.push(`d:${id}`));
  Object.entries(lib.templates || {}).forEach(([k, v]) => parts.push(`p:${k}:${v.updatedAt || 0}`));
  return parts.sort().join("|");
}

function applyMergedLibrary(merged) {
  const keepTrip = library.currentTripId;
  merged.currentTripId = keepTrip;
  setLibrary(merged);
  writeLibrary();
  // 正在編輯時不重畫，避免打斷
  if (!$("#sheet")?.open && typeof refresh === "function") refresh();
}

/** 同步一次：先下載合併，有需要再上傳。衝突時最多重試 3 次 */
async function syncNow({ silent = true } = {}) {
  if (!syncEnabled()) return false;
  if (!navigator.onLine) { updateSyncIndicators(); return false; }
  if ($("#sheet")?.open) {               // 編輯中先不要動資料，稍後再試
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => syncNow({ silent }), 4000);
    return false;
  }
  if (_syncing) { _syncAgain = true; return false; }
  _syncing = true;
  updateSyncIndicators();
  try {
    let remote = await apiRequest("GET", `/sync/${encodeURIComponent(syncState.code)}`, null, { timeout: 30000 });
    for (let attempt = 0; attempt < 3; attempt++) {
      const remoteLib = normalizeLibrary(remote.data);
      let merged = library;
      if (remote.version !== syncState.version) {
        merged = mergeLibraries(library, remoteLib);
        if (libraryFingerprint(merged) !== libraryFingerprint(library)) applyMergedLibrary(merged);
      }
      const needPush = syncState.pending || libraryFingerprint(library) !== libraryFingerprint(remoteLib);
      if (!needPush) { syncState.version = remote.version; break; }
      const res = await apiRequest("PUT", `/sync/${encodeURIComponent(syncState.code)}`,
        { data: libraryForSync(), baseVersion: remote.version }, { timeout: 30000, okStatuses: [409] });
      if (res.status === 409) { remote = res.data; continue; }   // 別台裝置剛好也存了：重新合併
      syncState.version = res.data.version;
      break;
    }
    syncState.pending = false;
    syncState.lastSyncAt = Date.now();
    syncState.error = "";
    saveSyncState();
    if (!silent) toast("已同步");
    return true;
  } catch (e) {
    syncState.error = e.status === 404 ? "找不到這個同步碼，可能已經被刪除" : e.message;
    saveSyncState();
    if (!silent) toast(`同步失敗：${syncState.error}`);
    return false;
  } finally {
    _syncing = false;
    updateSyncIndicators();
    if (_syncAgain) { _syncAgain = false; setTimeout(() => syncNow(), 500); }
  }
}

/** 第一台裝置：建立同步碼並上傳目前資料 */
async function createSyncCode() {
  const res = await apiPost("/sync", { data: libraryForSync() }, { timeout: 30000 });
  Object.assign(syncState, { code: res.code, version: res.version, pending: false, lastSyncAt: Date.now(), error: "" });
  saveSyncState();
  updateSyncIndicators();
  return res.code;
}

/** 其他裝置：輸入同步碼，和這台裝置的資料合併 */
async function joinSyncCode(code) {
  const clean = str(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length !== 12) throw new Error("同步碼是 12 個英文字母或數字，請再檢查一次");
  const pretty = `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8)}`;
  // 先確認同步碼存在
  await apiRequest("GET", `/sync/${pretty}`, null, { timeout: 30000 });
  snapshotLibrary();
  Object.assign(syncState, { code: pretty, version: -1, pending: true, error: "" });
  saveSyncState();
  const ok = await syncNow();
  if (!ok) throw new Error(syncState.error || "同步失敗");
  return pretty;
}

function leaveSync() {
  Object.assign(syncState, { code: "", version: 0, pending: false, error: "" });
  saveSyncState();
  updateSyncIndicators();
}

function syncStatusText() {
  if (!syncEnabled()) return "";
  if (_syncing) return "同步中…";
  if (!navigator.onLine) return syncState.pending ? "離線中，有修改等連線後上傳" : "離線中";
  if (syncState.error) return `同步失敗：${syncState.error}`;
  if (syncState.pending) return "有修改等待上傳…";
  return syncState.lastSyncAt ? `已同步 · ${formatDateTime(syncState.lastSyncAt)}` : "已開啟";
}

/** 工具分頁上的小點 + 工具頁的狀態文字 */
function updateSyncIndicators() {
  const warn = syncEnabled() && (syncState.pending || !!syncState.error);
  $$('[data-nav="tools"]').forEach(b => b.classList.toggle("has-dot", warn));
  const el = $("#syncStatus");
  if (el) {
    el.textContent = syncStatusText();
    el.className = `sync-status ${syncState.error ? "error" : syncState.pending ? "warn" : "ok"}`;
  }
}

function initSync() {
  updateSyncIndicators();
  syncNow();   // 沒開啟同步時什麼都不做
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  window.addEventListener("online", () => syncNow());
  setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, 60000);
}
