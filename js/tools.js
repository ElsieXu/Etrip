// =========================================
// tools.js — 「工具」頁：AI 匯入、同步到手機（QR / 連結）、備份、安裝
// =========================================

function isDirty() {
  const m = tripData.meta;
  return !!m.updatedAt && m.updatedAt > (m.exportedAt || 0);
}

function syncStatusHTML() {
  const m = tripData.meta;
  return `<span>最後修改：${formatDateTime(m.updatedAt)}</span>
    <span>最後匯出：${formatDateTime(m.exportedAt)}</span>
    ${isDirty() ? `<b>有新的修改還沒同步</b>` : ""}`;
}

function renderTools() {
  wakeServer();
  const m = tripData.meta;
  const dirty = isDirty();
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  $("#view-tools").innerHTML = `
  <div class="tools-grid">
    <section class="card span-2">
      <div class="card-head"><h2>${icon("sparkles")}AI 整理行程</h2></div>
      <p class="muted small">貼上機票、訂房確認信、或隨手寫的行程筆記，AI 會整理成每天的行程、住宿與交通。</p>
      <textarea id="rawInput" rows="6" placeholder="例：&#10;11/20 CI120 08:30 桃園→那霸&#10;住 Hotel Collective（國際通）&#10;Day1 首里城、國際通晚餐&#10;Day2 美麗海水族館、古宇利島…"></textarea>
      <button class="btn primary block" data-action="parse-run">${icon("sparkles")}開始整理</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>${icon("qr")}同步到手機</h2></div>
      <p class="muted small">在電腦整理好之後，用手機相機掃描 QR Code，就能把行程和口袋名單一起帶走。之後有修改，再掃一次就好。</p>
      <div class="sync-status ${dirty ? "warn" : ""}">${syncStatusHTML()}</div>
      <div id="qrBox" class="qr-box" hidden></div>
      <div class="btn-row">
        <button class="btn primary" data-action="sync-qr">${icon("qr")}產生 QR Code</button>
        <button class="btn" data-action="sync-copy">${icon("copy")}複製連結</button>
        ${navigator.share ? `<button class="btn" data-action="sync-share">${icon("share")}分享</button>` : ""}
      </div>
      <p class="field-hint">行程太大放不進 QR Code 時，可以「複製連結」或「分享」，用 LINE 或 AirDrop 傳給自己，在手機上點開就會匯入。</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>${icon("download")}備份與匯出</h2></div>
      <div class="sheet-list">
        <button class="list-btn" data-action="backup-download">${icon("download")}<span><b>下載備份檔（.json）</b><small>完整資料，之後可以用「匯入備份檔」還原</small></span></button>
        <label class="list-btn" for="importFile">${icon("upload")}<span><b>匯入備份檔</b><small>選擇之前下載的 .json 檔</small></span></label>
        <input type="file" id="importFile" accept=".json,application/json" hidden>
        <button class="list-btn" data-action="text-download">${icon("download")}<span><b>下載文字版（.txt）</b><small>方便列印或貼到記事本</small></span></button>
        <button class="list-btn" data-action="text-copy">${icon("copy")}<span><b>複製行程文字</b><small>貼到 LINE 或筆記</small></span></button>
        ${hasPrevTrip() ? `<button class="list-btn" data-action="restore-prev">${icon("undo")}<span><b>復原上一版行程</b><small>回到上次「取代」或「匯入」之前的狀態</small></span></button>` : ""}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>${icon("settings")}行程設定</h2></div>
      <div class="info-rows">
        <div class="info-row"><span class="info-key">名稱</span><span class="info-val">${esc(m.title) || "—"}</span></div>
        <div class="info-row"><span class="info-key">目的地</span><span class="info-val">${esc(m.region) || "—"}</span></div>
        <div class="info-row"><span class="info-key">出發日</span><span class="info-val">${m.startDate ? formatDateLabel(m.startDate) : "—"}</span></div>
      </div>
      <button class="btn block" data-action="trip-settings">${icon("edit")}修改設定</button>
    </section>

    <section class="card">
      <div class="card-head"><h2>${icon("phoneDevice")}加到手機主畫面</h2></div>
      ${standalone ? `<p>✅ 已經從主畫面開啟，沒有網路時也能看行程。</p>`
        : window._installPrompt ? `<p class="muted small">安裝後像 App 一樣從主畫面開啟，沒有網路也能看行程。</p><button class="btn primary block" data-action="install">${icon("download")}安裝 Etrip</button>`
        : isIOS ? `<p class="muted small">用 Safari 開啟這個網站，點下方的「分享」按鈕 ${icon("share")}，再選「加入主畫面」。之後沒有網路也能看行程。</p>`
        : `<p class="muted small">在手機瀏覽器的選單中選「加到主畫面」或「安裝應用程式」。之後沒有網路也能看行程。</p>`}
    </section>

    <section class="card danger-zone span-2">
      <div class="card-head"><h2>清除資料</h2></div>
      <p class="muted small">刪除這個瀏覽器裡的所有行程與口袋名單。建議先下載備份檔。</p>
      <button class="btn danger" data-action="clear-all">${icon("trash")}清除所有資料</button>
    </section>
  </div>`;

  $("#importFile").addEventListener("change", onImportFile);
}

// ===== AI 整理行程 =====

ACTIONS["parse-run"] = async el => {
  const text = str($("#rawInput").value);
  if (!text) return toast("請先貼上行程內容");
  setBusy(el, true, "AI 整理中…");
  try {
    const ai = await aiParseTrip(text, { onSlow: () => setBusy(el, true, "伺服器喚醒中，第一次約需 30~60 秒…") });
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
  const hasCurrent = tripData.days.length > 0;
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
      ${hasCurrent ? `<p class="muted small">目前已經有 ${tripData.days.length} 天的行程。不論選哪個，口袋名單和訂位 / 緊急聯絡資訊都會保留。</p>` : ""}`,
    actions: hasCurrent
      ? [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "加在後面", value: "merge" }, { label: "取代目前行程", value: "replace", variant: "primary" }]
      : [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "建立行程", value: "replace", variant: "primary" }],
    onAction(v) {
      if (v === "replace") {
        const keep = { backups: tripData.backups, info: tripData.info };
        replaceTrip({ ...parsed, ...keep, hotels: parsed.hotels });
        prefs.expanded = {};
      } else if (v === "merge") {
        tripData.days.push(...parsed.days);
        const names = new Set(tripData.hotels.map(h => h.name));
        tripData.hotels.push(...parsed.hotels.filter(h => !names.has(h.name)));
        if (!tripData.flight.depart) tripData.flight.depart = parsed.flight.depart;
        if (!tripData.flight.return) tripData.flight.return = parsed.flight.return;
        for (const k of ["title", "region", "startDate"]) if (!tripData.meta[k]) tripData.meta[k] = parsed.meta[k];
        saveTrip();
      } else return;
      saveTrip(); savePrefs();
      const raw = $("#rawInput"); if (raw) raw.value = "";
      setView("plan");
      toast(v === "merge" ? `已加入 ${parsed.days.length} 天` : "行程建立完成！正在補上地點座標…", v === "replace" && hasPrevTrip()
        ? { action: { label: "復原", fn: () => { restorePrevTrip(); refresh(); } } } : {});
      enrichAndSave(tripData.days.flatMap(d => d.items));
    }
  });
}

// ===== 同步：分享連結 / QR Code =====

/** 精簡資料：去掉空欄位與 id，讓 QR Code 裝得下 */
function compactForShare(t, level = 0) {
  const clean = o => {
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === "" || v == null || v === false || (Array.isArray(v) && !v.length)) continue;
      out[k] = v;
    }
    return out;
  };
  const r5 = n => (n == null || level >= 2 ? null : Math.round(n * 1e5) / 1e5);
  const pid = p => (level >= 1 ? "" : p);
  return clean({
    v: SCHEMA_VERSION,
    meta: clean({ title: t.meta.title, region: t.meta.region, startDate: t.meta.startDate, updatedAt: t.meta.updatedAt }),
    flight: clean(t.flight),
    hotels: t.hotels.map(h => clean({ ...h, id: "" })),
    info: clean(t.info),
    days: t.days.map(d => clean({
      title: d.title, date: d.date,
      items: d.items.map(it => clean({ time: it.time, text: it.text, note: it.note, done: it.done, lat: r5(it.lat), lng: r5(it.lng), placeId: pid(it.placeId) }))
    })),
    backups: t.backups.map(b => clean({
      name: b.name, category: b.category === "other" ? "" : b.category, area: b.area, note: b.note, source: b.source,
      priority: b.priority === "must" ? "must" : "", rainy: b.rainy, status: b.status === "todo" ? "" : b.status,
      lat: r5(b.lat), lng: r5(b.lng), placeId: pid(b.placeId), createdAt: b.createdAt
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
  saveTrip({ touch: false });
  renderHeader();
  const box = $(".sync-status");
  if (box) { box.classList.remove("warn"); box.innerHTML = syncStatusHTML(); }
}

function warnIfLocalFile() {
  if (location.protocol === "file:") {
    toast("目前是從電腦檔案開啟，手機打不開這個連結。請把網站放到網路上（例如 GitHub Pages）再分享");
    return true;
  }
  return false;
}

ACTIONS["sync-qr"] = () => {
  if (!tripData.days.length && !tripData.backups.length) return toast("還沒有行程可以同步");
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
    box.innerHTML = `<p class="warn-text">行程內容太多，放不進 QR Code 😢<br>請改用「複製連結」或「分享」傳給自己，或下載備份檔。</p>`;
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

ACTIONS["sync-copy"] = async () => {
  if (warnIfLocalFile()) return;
  const ok = await copyText(buildShareLink(0));
  if (ok) { markExported(); toast("已複製連結，傳給自己後在手機上點開即可匯入"); }
  else toast("複製失敗");
};

ACTIONS["sync-share"] = async () => {
  if (warnIfLocalFile()) return;
  try {
    await navigator.share({ title: tripData.meta.title || "Etrip 行程", url: buildShareLink(0) });
    markExported();
  } catch (e) { /* 使用者取消 */ }
};

/** 開啟網站時，如果網址帶有 #t=...，就是從另一台裝置傳來的行程 */
function checkIncomingLink() {
  const m = location.hash.match(/^#t=(.+)$/);
  if (!m) return false;
  history.replaceState(null, "", location.pathname + location.search);
  let incoming;
  try {
    incoming = normalizeTrip(JSON.parse(LZString.decompressFromEncodedURIComponent(m[1])));
  } catch (e) {
    toast("這個同步連結好像不完整，請重新產生一次");
    return false;
  }
  confirmImport(incoming, "收到行程");
  return true;
}

function confirmImport(incoming, title) {
  // 依名稱把行程項目和口袋名單重新連結
  const byName = new Map(incoming.backups.map(b => [b.name, b.id]));
  incoming.days.forEach(d => d.items.forEach(it => { if (!it.backupId && byName.has(it.text)) it.backupId = byName.get(it.text); }));

  const apply = () => {
    replaceTrip(incoming);
    prefs.expanded = {};
    savePrefs();
    todaySel = null;
    setView(tripPhase() === "during" ? "today" : "plan");
    toast("匯入完成！", hasPrevTrip() ? { action: { label: "復原", fn: () => { restorePrevTrip(); refresh(); } } } : {});
    const missing = [...incoming.days.flatMap(d => d.items), ...incoming.backups].filter(x => x.lat == null);
    if (missing.length) enrichAndSave(missing);
  };

  if (!tripData.days.length && !tripData.backups.length) return apply();

  const items = incoming.days.reduce((n, d) => n + d.items.length, 0);
  openSheet({
    title,
    body: `
      <div class="preview">
        <h3>${esc(incoming.meta.title || "（未命名行程）")}</h3>
        <ul class="preview-stats">
          <li>${icon("calendar")}${incoming.days.length} 天、${items} 個行程</li>
          <li>${icon("bookmark")}口袋名單 ${incoming.backups.length} 個</li>
          ${incoming.meta.updatedAt ? `<li>${icon("clock")}最後修改：${formatDateTime(incoming.meta.updatedAt)}</li>` : ""}
        </ul>
      </div>
      <p class="muted small">要用這份取代這台裝置上目前的資料嗎？目前的資料會先保留一份，之後可以在「工具 → 復原上一版行程」找回。</p>`,
    actions: [{ label: "先不要", value: "cancel", variant: "ghost" }, { label: "取代並匯入", value: "ok", variant: "primary" }],
    onAction(v) { if (v === "ok") apply(); }
  });
}

// ===== 備份檔 =====

function fileSafeTitle() {
  return (tripData.meta.title || "My_Trip").replace(/[\\/:*?"<>|\s]+/g, "_");
}

ACTIONS["backup-download"] = () => {
  downloadFile(`Etrip_${fileSafeTitle()}_${toISODate(new Date())}.json`, JSON.stringify(tripData, null, 2), "application/json");
  markExported();
  refresh();
};

function onImportFile(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      confirmImport(normalizeTrip(JSON.parse(reader.result)), "匯入備份檔");
    } catch (err) {
      toast("這個檔案無法讀取，請確認是 Etrip 的備份檔（.json）");
    }
  };
  reader.readAsText(file);
}

ACTIONS["restore-prev"] = () => {
  if (restorePrevTrip()) { refresh(); toast("已復原上一版（再按一次可以切換回來）"); }
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
  downloadFile(`Etrip_${fileSafeTitle()}_${toISODate(new Date())}.txt`, buildTripText(), "text/plain;charset=utf-8");
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
    title: "清除所有資料？",
    body: `<p>會刪除這個瀏覽器裡的所有行程與口袋名單。清除後可以在「工具 → 復原上一版行程」救回一次。</p>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "清除", value: "clear", variant: "danger" }],
    onAction(v) {
      if (v !== "clear") return;
      replaceTrip(emptyTrip());
      prefs.expanded = {};
      savePrefs();
      refresh();
      toast("已清除");
    }
  });
};
