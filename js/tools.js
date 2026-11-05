// =========================================
// tools.js — 「工具」頁：AI 整理、雲端同步、傳送行程、備份、進階設定
// =========================================

function renderTools() {
  wakeServer();
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const nTrips = library.trips.length;

  $("#view-tools").innerHTML = `
  <div class="tools-grid">
    <section class="card span-2">
      <div class="card-head"><h2>${icon("sparkles")}AI 整理行程</h2></div>
      <p class="muted small">貼上機票、訂房確認信、或隨手寫的行程筆記，AI 會整理成每天的行程、住宿與交通，存成一個新行程。</p>
      <textarea id="rawInput" rows="6" placeholder="例：&#10;11/20 CI120 08:30 桃園→那霸&#10;住 Hotel Collective（國際通）&#10;Day1 首里城、國際通晚餐&#10;Day2 美麗海水族館、古宇利島…"></textarea>
      <button class="btn primary block" data-action="parse-run">${icon("sparkles")}開始整理</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>${icon("refresh")}雲端同步</h2></div>
      ${DEMO ? `<p class="muted small">示範模式不能使用雲端同步。離開示範後，就能在自己的 Etrip 開啟。</p>` : syncEnabled() ? `
        <p class="muted small">電腦和手機輸入同一組同步碼，修改後會自動同步，所有行程、口袋名單和旅行記錄都會帶著走。</p>
        <p id="syncStatus" class="sync-status"></p>
        <div class="code-box">
          <span class="muted small">同步碼</span>
          <b id="syncCode" class="sync-code">${esc(syncState.code.slice(0, 4))}-••••-••••</b>
          <button class="btn sm ghost" data-action="sync-reveal">顯示</button>
        </div>
        <div class="btn-row">
          <button class="btn primary" data-action="sync-now">${icon("refresh")}立即同步</button>
          <button class="btn" data-action="sync-add-device">${icon("qr")}加入另一台裝置</button>
        </div>
        <button class="btn sm ghost" data-action="sync-leave">在這台裝置停止同步</button>
        <p class="field-hint">同步碼就像密碼，知道的人都能看到你的行程，請不要公開分享。</p>
      ` : `
        <p class="muted small">在電腦整理好，手機打開就是最新的；之前的旅行記錄也都在。不需要註冊帳號，只要一組同步碼。</p>
        <div class="btn-row">
          <button class="btn primary" data-action="sync-create">${icon("refresh")}開啟雲端同步</button>
          <button class="btn" data-action="sync-join">我已經有同步碼</button>
        </div>
      `}
    </section>

    ${appearanceCardHTML()}

    ${guideCardHTML()}

    <section class="card">
      <div class="card-head"><h2>${icon("download")}備份與匯出</h2></div>
      <div class="sheet-list">
        <button class="list-btn" data-action="backup-download">${icon("download")}<span><b>下載備份檔（.json）</b><small>全部 ${nTrips} 個行程和口袋名單</small></span></button>
        <label class="list-btn" for="importFile">${icon("upload")}<span><b>匯入備份檔</b><small>和現有資料合併，不會覆蓋</small></span></label>
        <input type="file" id="importFile" accept=".json,application/json" hidden>
        <button class="list-btn" data-action="text-download">${icon("download")}<span><b>下載目前行程文字版（.txt）</b><small>方便列印或貼到記事本</small></span></button>
        <button class="list-btn" data-action="text-copy">${icon("copy")}<span><b>複製目前行程文字</b><small>貼到 LINE 或筆記</small></span></button>
        ${hasPrevLibrary() ? `<button class="list-btn" data-action="restore-prev">${icon("undo")}<span><b>復原上一版</b><small>回到上次匯入、加入同步或清除之前的狀態</small></span></button>` : ""}
      </div>
    </section>

    <details class="card collapsible-card">
      <summary><h2>${icon("qr")}不用雲端：傳送這個行程</h2>${icon("chevron", "chev")}</summary>
      <div class="collapsible-body">
        <p class="muted small">產生 QR Code 或連結，把「${esc(tripData.meta.title || "目前的行程")}」和口袋名單傳到另一台裝置，對方會合併進去。</p>
        <div id="qrBox" class="qr-box" hidden></div>
        <div class="btn-row">
          <button class="btn" data-action="share-qr">${icon("qr")}產生 QR Code</button>
          <button class="btn" data-action="share-copy">${icon("copy")}複製連結</button>
          ${navigator.share ? `<button class="btn" data-action="share-send">${icon("share")}分享</button>` : ""}
        </div>
      </div>
    </details>

    <section class="card">
      <div class="card-head"><h2>${icon("phoneDevice")}加到手機主畫面</h2></div>
      ${standalone ? `<p>✅ 已經從主畫面開啟，沒有網路時也能看行程。</p>`
        : window._installPrompt ? `<p class="muted small">安裝後像 App 一樣從主畫面開啟，沒有網路也能看行程。</p><button class="btn primary block" data-action="install">${icon("download")}安裝 Etrip</button>`
        : isIOS ? `<p class="muted small">用 Safari 開啟這個網站，點下方的「分享」按鈕 ${icon("share")}，再選「加入主畫面」。之後沒有網路也能看行程。</p>`
        : `<p class="muted small">在手機瀏覽器的選單中選「加到主畫面」或「安裝應用程式」。之後沒有網路也能看行程。</p>`}
    </section>

    <details class="card collapsible-card span-2">
      <summary><h2>${icon("settings")}進階設定</h2>${icon("chevron", "chev")}</summary>
      <div class="collapsible-body">
        <form data-form="api-base" class="stack">
          <label class="field" for="apiBaseInput"><span class="field-label">伺服器網址</span>
            <input id="apiBaseInput" name="apiBase" type="url" placeholder="${esc(DEFAULT_API_BASE)}" value="${esc(prefs.apiBase)}">
            <span class="field-hint">Cloud Run 部署完成後顯示的 Service URL。留空就使用預設值（${esc(DEFAULT_API_BASE)}）。</span>
          </label>
          <div class="btn-row">
            <button class="btn" type="submit">儲存</button>
            <button class="btn ghost" type="button" data-action="api-test">測試連線</button>
          </div>
        </form>
        <hr>
        <p class="muted small">清除這個瀏覽器裡的所有行程與口袋名單（雲端同步會在這台裝置關閉，雲端和其他裝置的資料不受影響）。</p>
        <button class="btn danger" data-action="clear-all">${icon("trash")}清除這台裝置的資料</button>
      </div>
    </details>
  </div>`;

  $("#importFile").addEventListener("change", onImportFile);
  updateSyncIndicators();
}

// ===== AI 整理行程 =====

ACTIONS["parse-run"] = async el => {
  const text = str($("#rawInput").value);
  if (!text) return toast("請先貼上行程內容");
  setBusy(el, true, "AI 整理中…");
  try {
    const ai = await aiParseTrip(text, { onSlow: () => setBusy(el, true, "伺服器喚醒中，請稍候…") });
    setBusy(el, false);
    const parsed = normalizeTrip({
      meta: { title: ai.title, region: ai.destination || ai.region, startDate: ai.start_date },
      flight: ai.flight, hotels: ai.hotels || ai.hotel, days: ai.days
    });
    if (!parsed.days.length && !parsed.hotels.length && !parsed.flight.depart) {
      return toast("AI 沒有整理出內容，試著多貼一點資訊");
    }
    showParsePreview(parsed);
  } catch (e) {
    setBusy(el, false);
    toast(e.message);
  }
};

function showParsePreview(parsed) {
  const itemCount = parsed.days.reduce((n, d) => n + d.items.length, 0);
  const canMerge = library.trips.includes(tripData) && tripData.days.length > 0;
  openSheet({
    title: "整理完成",
    body: `
      <div class="preview">
        <h3>${esc(parsed.meta.title || "（未命名行程）")}</h3>
        <ul class="preview-stats">
          ${parsed.meta.startDate ? `<li>${icon("calendar")}${formatDateLabel(parsed.meta.startDate)} 出發</li>` : ""}
          <li>${icon("calendar")}${parsed.days.length} 天、${itemCount} 個行程</li>
          ${parsed.hotels.length ? `<li>${icon("bed")}${parsed.hotels.map(h => esc(h.name)).join("、")}</li>` : ""}
          ${parsed.flight.depart ? `<li>${icon("plane")}${esc(parsed.flight.depart)}</li>` : ""}
        </ul>
        ${parsed.days.slice(0, 3).map(d => `<p class="small"><b>${esc(d.title)}</b>：${d.items.map(i => esc(i.text)).join("、") || "—"}</p>`).join("")}
        ${parsed.days.length > 3 ? `<p class="muted small">…還有 ${parsed.days.length - 3} 天</p>` : ""}
      </div>
      ${canMerge ? `<p class="muted small">也可以加在目前的「${esc(tripData.meta.title || "行程")}」後面。</p>` : ""}`,
    actions: [
      { label: "取消", value: "cancel", variant: "ghost" },
      ...(canMerge ? [{ label: "加到目前行程", value: "merge" }] : []),
      { label: "存成新行程", value: "new", variant: "primary" }
    ],
    onAction(v) {
      if (v === "new") {
        createTrip(parsed);
      } else if (v === "merge") {
        tripData.days.push(...parsed.days);
        const names = new Set(tripData.hotels.map(h => h.name));
        tripData.hotels.push(...parsed.hotels.filter(h => !names.has(h.name)));
        if (!tripData.flight.depart) tripData.flight.depart = parsed.flight.depart;
        if (!tripData.flight.return) tripData.flight.return = parsed.flight.return;
        for (const k of ["title", "region", "startDate"]) if (!tripData.meta[k]) tripData.meta[k] = parsed.meta[k];
        saveTrip();
      } else return;
      const raw = $("#rawInput"); if (raw) raw.value = "";
      todaySel = null;
      setView("plan");
      toast(v === "merge" ? `已加入 ${parsed.days.length} 天，正在補上地點座標…` : "新行程建立好了！正在補上地點座標…");
      enrichAndSave(tripData.days.flatMap(d => d.items));
    }
  });
}

// ===== 雲端同步 =====

ACTIONS["sync-create"] = async el => {
  setBusy(el, true, "建立中…");
  try {
    await createSyncCode();
    renderTools();
    showSyncCodeSheet("同步已開啟");
  } catch (e) {
    setBusy(el, false);
    toast(e.message);
  }
};

ACTIONS["sync-join"] = () => openJoinSheet();

function openJoinSheet(prefill = "") {
  openSheet({
    title: "輸入同步碼",
    body: `
      ${field({ name: "code", label: "同步碼", value: prefill, placeholder: "XXXX-XXXX-XXXX", required: true, autofocus: true, hint: "在另一台裝置的「工具 → 雲端同步 → 加入另一台裝置」可以看到" })}
      <p class="muted small">這台裝置上的行程和口袋名單會和雲端合併，不會被刪除。</p>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "加入同步", value: "join", variant: "primary" }],
    onAction(v, d) {
      if (v !== "join") return;
      toast("同步中…");
      joinSyncCode(d.code)
        .then(() => { refresh(); toast("已加入同步！"); })
        .catch(e => toast(e.message));
    }
  });
}

function syncLink() { return `${shareBaseUrl()}#sync=${syncState.code}`; }

function showSyncCodeSheet(title = "加入另一台裝置") {
  let qrSvg = "";
  try {
    const qr = qrcode(0, "M");
    qr.addData(syncLink());
    qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true });
  } catch (e) { /* ignore */ }
  openSheet({
    title,
    body: `
      <p>在另一台裝置用相機掃描 QR Code，或打開 Etrip 後到「工具 → 雲端同步 → 我已經有同步碼」輸入：</p>
      <p class="big-code">${esc(syncState.code)}</p>
      ${qrSvg ? `<div class="qr-box">${qrSvg}</div>` : ""}
      <p class="field-hint">同步碼就像密碼，請不要公開分享。</p>`,
    actions: [{ label: "複製同步碼", value: "copy" }, { label: "完成", value: "done", variant: "primary" }],
    onAction(v) {
      if (v === "copy") { copyText(syncState.code).then(ok => toast(ok ? "已複製同步碼" : "複製失敗")); return false; }
    }
  });
}

ACTIONS["sync-add-device"] = () => showSyncCodeSheet();
ACTIONS["sync-reveal"] = el => {
  $("#syncCode").textContent = syncState.code;
  el.remove();
};
ACTIONS["sync-now"] = async el => {
  setBusy(el, true, "同步中…");
  await syncNow({ silent: false });
  setBusy(el, false);
  updateSyncIndicators();
};
ACTIONS["sync-leave"] = () => {
  openSheet({
    title: "在這台裝置停止同步？",
    body: `<p>這台裝置上的資料會保留，只是之後不會再自動同步。雲端和其他裝置的資料不受影響，之後輸入同一組同步碼就能再加入。</p>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "停止同步", value: "leave", variant: "danger" }],
    onAction(v) {
      if (v !== "leave") return;
      leaveSync();
      renderTools();
      toast("這台裝置已停止同步");
    }
  });
};

// ===== 不用雲端：傳送一個行程（QR / 連結） =====

/** 精簡資料：去掉空欄位，讓 QR Code 裝得下 */
function compactForShare(t, level = 0) {
  const clean = o => {
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === "" || v == null || v === false || v === 0 || (Array.isArray(v) && !v.length)) continue;
      out[k] = v;
    }
    return out;
  };
  const r5 = n => (n == null || level >= 2 ? null : Math.round(n * 1e5) / 1e5);
  const pid = p => (level >= 1 ? "" : p);
  return clean({
    v: SCHEMA_VERSION,
    id: t.id,
    meta: clean({ title: t.meta.title, region: t.meta.region, startDate: t.meta.startDate, albumUrl: t.meta.albumUrl, updatedAt: t.meta.updatedAt }),
    flight: clean(t.flight),
    hotels: t.hotels.map(h => clean({ ...h, id: "" })),
    info: clean(t.info),
    days: t.days.map(d => clean({
      title: d.title, date: d.date,
      id: d.id,
      items: d.items.map(it => clean({
        time: it.time, text: it.text, note: it.note, done: it.done, rating: it.rating, review: it.review,
        lat: r5(it.lat), lng: r5(it.lng), placeId: pid(it.placeId)
      }))
    })),
    expenses: (t.expenses || []).map(e => clean({ ...e, id: "", createdAt: 0 })),
    packing: (t.packing || []).map(p => clean({ text: p.text, done: p.done })),
    backups: library.backups.map(b => clean({
      id: b.id, name: b.name, category: b.category === "other" ? "" : b.category, area: b.area, note: b.note, source: b.source,
      priority: b.priority === "must" ? "must" : "", rainy: b.rainy, status: b.status === "todo" ? "" : b.status,
      lat: r5(b.lat), lng: r5(b.lng), placeId: pid(b.placeId), createdAt: b.createdAt, updatedAt: b.updatedAt
    }))
  });
}

function shareBaseUrl() { return location.href.split("#")[0]; }

function buildShareLink(level = 0) {
  const payload = LZString.compressToEncodedURIComponent(JSON.stringify(compactForShare(tripData, level)));
  return `${shareBaseUrl()}#t=${payload}`;
}

function markExported() {
  tripData.meta.exportedAt = Date.now();
  writeLibrary();
}

function warnIfLocalFile() {
  if (location.protocol === "file:") {
    toast("目前是從電腦檔案開啟，手機打不開這個連結。請把網站放到網路上（例如 GitHub Pages）再分享");
    return true;
  }
  return false;
}

ACTIONS["share-qr"] = () => {
  if (!tripHasContent(tripData) && !library.backups.length) return toast("目前沒有行程可以傳送");
  warnIfLocalFile();
  const QR_MAX = 2900; // QR Code 最大容量約 2953 字元
  let link = "", level = 0;
  for (level = 0; level <= 2; level++) {
    link = buildShareLink(level);
    if (link.length <= QR_MAX) break;
  }
  const box = $("#qrBox");
  box.hidden = false;
  if (link.length > QR_MAX) {
    box.innerHTML = `<p class="warn-text">內容太多，放不進 QR Code。請改用「複製連結」或「分享」傳給自己，或開啟雲端同步。</p>`;
    return;
  }
  try {
    const qr = qrcode(0, "L");
    qr.addData(link);
    qr.make();
    box.innerHTML = `
      ${qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true })}
      <p class="small">用手機相機掃描，開啟後就會匯入。</p>
      ${level >= 2 ? `<p class="muted small">為了裝進 QR Code 省略了座標，手機有網路時會自動補上。</p>` : ""}`;
    markExported();
  } catch (e) {
    box.innerHTML = `<p class="warn-text">產生 QR Code 失敗，請改用「複製連結」。</p>`;
  }
};

ACTIONS["share-copy"] = async () => {
  if (warnIfLocalFile()) return;
  const ok = await copyText(buildShareLink(0));
  if (ok) { markExported(); toast("已複製連結，傳給自己後在手機上點開即可匯入"); }
  else toast("複製失敗");
};

ACTIONS["share-send"] = async () => {
  if (warnIfLocalFile()) return;
  try {
    await navigator.share({ title: tripData.meta.title || "Etrip 行程", url: buildShareLink(0) });
    markExported();
  } catch (e) { /* 使用者取消 */ }
};

/** 開啟網站時檢查網址：#t=...（傳來的行程）或 #sync=...（同步碼） */
function checkIncomingLink() {
  const h = location.hash;
  const t = h.match(/^#t=(.+)$/);
  const s = h.match(/^#sync=([A-Za-z0-9-]+)$/);
  if (!t && !s) return false;
  history.replaceState(null, "", location.pathname + location.search);
  if (s) {
    if (syncEnabled()) { toast("這台裝置已經在同步了"); return true; }
    openJoinSheet(s[1]);
    return true;
  }
  let raw;
  try {
    raw = JSON.parse(LZString.decompressFromEncodedURIComponent(t[1]));
  } catch (e) {
    toast("這個連結好像不完整，請重新產生一次");
    return false;
  }
  confirmImportTrip(raw);
  return true;
}

/** 收到單一行程：同一個行程就更新，口袋名單合併 */
function confirmImportTrip(raw) {
  const incoming = normalizeTrip(raw);
  const backups = normalizeBackups(raw.backups);
  const items = incoming.days.reduce((n, d) => n + d.items.length, 0);
  const exists = library.trips.find(x => x.id === incoming.id);
  openSheet({
    title: "收到行程",
    body: `
      <div class="preview">
        <h3>${esc(incoming.meta.title || "（未命名行程）")}</h3>
        <ul class="preview-stats">
          <li>${icon("calendar")}${tripRangeLabel(incoming)}、${items} 個行程</li>
          <li>${icon("bookmark")}口袋名單 ${backups.length} 個（會合併，不會覆蓋）</li>
        </ul>
      </div>
      <p class="muted small">${exists ? "這台裝置已經有這個行程，會更新成收到的版本。" : "會新增成一個行程。"}</p>`,
    actions: [{ label: "先不要", value: "cancel", variant: "ghost" }, { label: exists ? "更新" : "加入", value: "ok", variant: "primary" }],
    onAction(v) {
      if (v !== "ok") return;
      snapshotLibrary();
      incoming.meta.updatedAt = Date.now();   // 使用者明確要收下這份，以它為準
      const merged = mergeLibraries(library, { ...emptyLibrary(), trips: [incoming], backups });
      merged.currentTripId = incoming.id;
      setLibrary(merged);
      saveTrip();
      relinkBackups(tripData);
      todaySel = null;
      setView(tripPhase() === "during" ? "today" : "plan");
      toast("已加入！", { action: { label: "復原", fn: () => { restorePrevLibrary(); refresh(); } } });
      const missing = [...tripData.days.flatMap(d => d.items), ...library.backups].filter(x => x.lat == null);
      if (missing.length) enrichAndSave(missing);
    }
  });
}

/** 依名稱把行程項目和口袋名單重新連結 */
function relinkBackups(t) {
  const byName = new Map(library.backups.map(b => [b.name, b.id]));
  t.days.forEach(d => d.items.forEach(it => { if (!it.backupId && byName.has(it.text)) it.backupId = byName.get(it.text); }));
}

// ===== 備份檔 =====

function fileSafeTitle(name) {
  return (name || "Etrip").replace(/[\\/:*?"<>|\s]+/g, "_");
}

ACTIONS["backup-download"] = () => {
  downloadFile(`Etrip_備份_${toISODate(new Date())}.json`, JSON.stringify(library, null, 2), "application/json");
};

function onImportFile(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let incoming;
    try {
      incoming = normalizeLibrary(JSON.parse(reader.result));
    } catch (err) {
      return toast("這個檔案無法讀取，請確認是 Etrip 的備份檔（.json）");
    }
    openSheet({
      title: "匯入備份檔",
      body: `<p>檔案裡有 <b>${incoming.trips.length}</b> 個行程、<b>${incoming.backups.length}</b> 個口袋名單地點。</p>
        <p class="muted small">會和這台裝置的資料合併：同一個行程或地點保留較新的版本，其他的都會保留。</p>`,
      actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "合併匯入", value: "ok", variant: "primary" }],
      onAction(v) {
        if (v !== "ok") return;
        snapshotLibrary();
        const merged = mergeLibraries(library, incoming);
        setLibrary(merged);
        saveTrip();
        refresh();
        toast("匯入完成", { action: { label: "復原", fn: () => { restorePrevLibrary(); refresh(); } } });
      }
    });
  };
  reader.readAsText(file);
}

ACTIONS["restore-prev"] = () => {
  if (restorePrevLibrary()) { refresh(); toast("已復原上一版（再按一次可以切換回來）"); }
};

// ===== 進階設定 =====

FORMS["api-base"] = form => {
  const v = str(form.apiBase.value).replace(/\/+$/, "");
  if (v && !isUrl(v)) return toast("網址要以 https:// 開頭");
  prefs.apiBase = v;
  savePrefs();
  _lastWake = 0;
  toast(v ? "已儲存伺服器網址" : "已改回預設伺服器");
};

ACTIONS["api-test"] = async el => {
  const input = $("#apiBaseInput");
  const before = prefs.apiBase;
  prefs.apiBase = str(input.value).replace(/\/+$/, "");
  setBusy(el, true, "測試中…");
  try {
    const r = await apiRequest("GET", "/health", null, { timeout: 60000 });
    toast(r && r.ok ? `連線成功（AI：${r.ai || "—"}${r.sync ? "，支援雲端同步" : "，不支援雲端同步"}）` : "伺服器有回應，但版本可能太舊");
  } catch (e) {
    toast(e.status === 404 ? "伺服器有回應，但還是舊版（沒有 /health），請重新部署" : e.message);
  } finally {
    prefs.apiBase = before;
    setBusy(el, false);
  }
};

// ===== 文字版 =====

function buildTripText() {
  const t = tripData;
  let s = `【${t.meta.title || "我的旅程"}】\n`;
  if (t.meta.startDate) s += `出發：${formatDateLabel(t.meta.startDate)}\n`;
  s += "\n";
  if (t.flight.depart || t.flight.return) {
    s += `■ 交通\n`;
    if (t.flight.depart) s += `去程：${t.flight.depart}\n`;
    if (t.flight.return) s += `回程：${t.flight.return}\n`;
    s += "\n";
  }
  if (t.hotels.length) {
    s += `■ 住宿\n`;
    t.hotels.forEach(h => {
      s += `・${h.name}${h.dates ? `（${h.dates}）` : ""}\n`;
      if (h.address) s += `  地址：${h.address}\n`;
      if (h.phone) s += `  電話：${h.phone}\n`;
      if (h.code) s += `  訂房代號：${h.code}\n`;
    });
    s += "\n";
  }
  t.days.forEach((d, i) => {
    const date = dayDate(i);
    s += `■ ${d.title}${date ? ` ${formatDateLabel(date)}` : ""}\n`;
    d.items.forEach(it => {
      s += `・${it.time ? it.time + " " : ""}${it.text}${it.note ? `（${it.note}）` : ""}\n`;
    });
    s += "\n";
  });
  const { codes, emergency, notes } = t.info;
  if (codes) s += `■ 訂位 / 票券\n${codes}\n\n`;
  if (emergency) s += `■ 緊急聯絡\n${emergency}\n\n`;
  if (notes) s += `■ 備忘\n${notes}\n\n`;
  if (t.expenses && t.expenses.length) {
    const sum = sumExpenses(t.expenses);
    s += `■ 花費：${sum.approx ? "約 " : ""}${fmtMoney(sum.total, "TWD")}（${t.expenses.length} 筆）\n`;
    for (const [m, info] of Object.entries(PAY_METHODS)) {
      const items = t.expenses.filter(e => e.method === m);
      if (items.length) s += `・${info.label}：${fmtCurrencySums(sumByCurrency(items))}\n`;
    }
    s += "\n";
  }
  if (t.backups.length) {
    s += `■ 口袋名單\n`;
    t.backups.forEach(b => {
      s += `・${CATEGORIES[b.category].icon} ${b.name}${b.priority === "must" ? " ⭐" : ""}${b.area ? `（${b.area}）` : ""}${b.note ? ` - ${b.note}` : ""}\n`;
      if (b.source) s += `  來源：${b.source}\n`;
    });
  }
  return s.trim() + "\n";
}

ACTIONS["text-download"] = () => {
  downloadFile(`Etrip_${fileSafeTitle(tripData.meta.title)}_${toISODate(new Date())}.txt`, buildTripText(), "text/plain;charset=utf-8");
};

ACTIONS["text-copy"] = async () => {
  toast((await copyText(buildTripText())) ? "已複製行程文字" : "複製失敗");
};

// ===== 安裝 / 清除 =====

ACTIONS["install"] = async () => {
  const p = window._installPrompt;
  if (!p) return;
  p.prompt();
  await p.userChoice.catch(() => {});
  window._installPrompt = null;
  refresh();
};

ACTIONS["clear-all"] = () => {
  openSheet({
    title: "清除這台裝置的資料？",
    body: `<p>會刪除這個瀏覽器裡的所有行程與口袋名單${syncEnabled() ? "，並在這台裝置停止雲端同步（雲端和其他裝置的資料不受影響）" : ""}。清除後可以在「工具 → 復原上一版」救回一次。</p>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "清除", value: "clear", variant: "danger" }],
    onAction(v) {
      if (v !== "clear") return;
      snapshotLibrary();
      leaveSync();
      setLibrary(emptyLibrary());
      writeLibrary();
      prefs.expanded = {};
      savePrefs();
      refresh();
      toast("已清除");
    }
  });
};
