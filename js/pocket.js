// =========================================
// pocket.js — 「口袋」頁：收藏、分類、篩選、景點雷達
// =========================================

let pocketQuery = "";

function filteredBackups({ query = pocketQuery, opts = prefs.pocket } = {}) {
  const q = query.trim().toLowerCase();
  const me = cachedPosition();
  let list = tripData.backups.slice();
  if (q) list = list.filter(b => [b.name, b.area, b.note].join(" ").toLowerCase().includes(q));
  if (opts.cat !== "all") list = list.filter(b => b.category === opts.cat);
  if (opts.must) list = list.filter(b => b.priority === "must");
  if (opts.rainy) list = list.filter(b => b.rainy);
  if (opts.hideVisited) list = list.filter(b => b.status !== "visited" && !visitsOf(b).length);

  const withDist = list.map(b => ({ b, d: me && b.lat != null ? haversine(me.lat, me.lng, b.lat, b.lng) : null }));
  const sorters = {
    new: (x, y) => y.b.createdAt - x.b.createdAt,
    must: (x, y) => (y.b.priority === "must") - (x.b.priority === "must") || y.b.createdAt - x.b.createdAt,
    near: (x, y) => (x.d ?? Infinity) - (y.d ?? Infinity),
    area: (x, y) => (x.b.area || "~").localeCompare(y.b.area || "~", "zh-Hant") || x.b.name.localeCompare(y.b.name, "zh-Hant")
  };
  withDist.sort(sorters[opts.sort] || sorters.new);
  return withDist;
}

function renderPocket() {
  wakeServer();
  const p = prefs.pocket;
  const cats = [["all", "全部"], ...Object.entries(CATEGORIES).map(([k, v]) => [k, `${v.icon} ${v.label}`])];
  const counts = { all: tripData.backups.length };
  tripData.backups.forEach(b => { counts[b.category] = (counts[b.category] || 0) + 1; });

  $("#view-pocket").innerHTML = `
  <div class="pocket-top">
    <section class="card">
      <form class="quick-add" data-form="backup-quick">
        <input id="quickAdd" name="name" placeholder="收藏一個地方：店名、景點…" autocomplete="off" aria-label="新增口袋名單">
        <button class="btn primary" type="submit">${icon("plus")}收藏</button>
      </form>
      <p class="muted small">想多記一點（分類、必去、來源影片）？收藏後點卡片右上角的 ⋯ 編輯。</p>
    </section>

    <details class="card radar" ${tripData.backups.length ? "" : "open"}>
      <summary><h2>${icon("radar")}景點雷達：從文章或影片抓地點</h2>${icon("chevron", "chev")}</summary>
      <div class="radar-body">
        <textarea id="radarText" rows="4" placeholder="貼上 YouTube 影片網址、部落格網址，或影片說明文字、筆記、清單…"></textarea>
        <input id="radarSource" placeholder="來源連結（選填）：IG / TikTok 網址">
        <p class="field-hint">▶ YouTube 公開影片：直接貼網址，AI 會看完影片找出介紹的地點（約 30 秒～2 分鐘）。<br>IG、TikTok 的網址讀不到內容：請把影片說明文字貼在上面，網址填在「來源連結」，到現場可以一鍵打開影片。</p>
        <button class="btn primary block" data-action="radar-run">${icon("sparkles")}抓取地點</button>
      </div>
    </details>
  </div>

  <div class="filter-bar">
    <label class="search">${icon("search")}<input id="pocketSearch" type="search" placeholder="搜尋名稱、地區、備註" value="${esc(pocketQuery)}"></label>
    <div class="chip-row scroll">
      ${cats.map(([k, label]) => `<button class="chip ${p.cat === k ? "active" : ""}" data-action="pocket-cat" data-v="${k}">${label}<small>${counts[k] || 0}</small></button>`).join("")}
    </div>
    <div class="chip-row">
      <button class="chip ${p.must ? "active" : ""}" data-action="pocket-flag" data-k="must">⭐ 必去</button>
      <button class="chip ${p.rainy ? "active" : ""}" data-action="pocket-flag" data-k="rainy">🌧 雨天備案</button>
      <button class="chip ${p.hideVisited ? "active" : ""}" data-action="pocket-flag" data-k="hideVisited">隱藏去過的</button>
      <label class="sort-select">排序
        <select id="pocketSort">
          ${[["new", "最新收藏"], ["must", "必去優先"], ["near", "離我最近"], ["area", "依地區"]].map(([v, l]) =>
            `<option value="${v}" ${p.sort === v ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </label>
    </div>
  </div>

  <div id="pocketList" class="poi-grid"></div>`;

  renderPocketList();

  $("#pocketSearch").addEventListener("input", debounce(e => { pocketQuery = e.target.value; renderPocketList(); }, 150));
  $("#pocketSort").addEventListener("change", async e => {
    prefs.pocket.sort = e.target.value;
    savePrefs();
    if (e.target.value === "near" && !cachedPosition()) {
      try { await getMyPosition(); } catch (err) { toast(err.message); }
    }
    renderPocketList();
  });
}

function renderPocketList() {
  const box = $("#pocketList");
  if (!box) return;
  const list = filteredBackups();
  if (!tripData.backups.length) {
    box.innerHTML = `<div class="empty-inline">${icon("bookmark")}<p>還沒有收藏。看到心動的店家、景點就先丟進來，旅途中再看心情挑。</p></div>`;
    return;
  }
  if (!list.length) {
    box.innerHTML = `<div class="empty-inline"><p>沒有符合條件的地點</p></div>`;
    return;
  }
  let lastArea = null;
  box.innerHTML = list.map(({ b, d }) => {
    let header = "";
    if (prefs.pocket.sort === "area" && b.area !== lastArea) {
      lastArea = b.area;
      header = `<h3 class="group-head">${esc(b.area || "未分地區")}</h3>`;
    }
    return header + poiCardHTML(b, d);
  }).join("");
}

function poiCardHTML(b, d) {
  const cat = CATEGORIES[b.category];
  const sched = scheduledDays(b);
  const meta = [b.area, cat.label, d != null ? formatKm(d) : ""].filter(Boolean).map(esc).join(" · ");
  return `
  <article class="poi card ${b.status !== "todo" ? "dim" : ""}">
    <div class="poi-head">
      <span class="poi-icon">${cat.icon}</span>
      <div class="poi-title">
        <h3>${esc(b.name)}${b.priority === "must" ? `<span class="must" title="必去">${icon("star")}</span>` : ""}</h3>
        <p class="poi-meta">${meta}</p>
      </div>
      <button class="icon-btn" data-action="backup-edit" data-id="${b.id}" aria-label="編輯 ${esc(b.name)}">${icon("more")}</button>
    </div>
    ${b.note ? `<p class="poi-note">${esc(b.note)}</p>` : ""}
    <div class="poi-tags">
      ${visitTagHTML(b)}
      ${b.status === "skipped" ? `<span class="tag">沒去成</span>` : ""}
      ${sched.length ? `<span class="tag primary">已排入 ${sched.map(i => "D" + (i + 1)).join("、")}</span>` : ""}
      ${b.rainy ? `<span class="tag">🌧 雨天OK</span>` : ""}
      ${b.source ? `<a class="tag link" href="${esc(b.source)}" target="_blank" rel="noopener">${icon("link")}來源</a>` : ""}
      ${b.lat == null ? `<span class="tag warn" title="沒有座標，無法計算距離">未定位</span>` : ""}
    </div>
    <div class="poi-actions">
      <a class="btn sm" href="${esc(mapsSearchUrl(b))}" target="_blank" rel="noopener">${icon("pin")}地圖</a>
      <a class="btn sm" href="${esc(mapsNavUrl(b))}" target="_blank" rel="noopener">${icon("nav")}導航</a>
      <button class="btn sm primary-soft" data-action="backup-schedule" data-id="${b.id}">${icon("calendar")}排入行程</button>
      ${b.status === "todo" ? `<button class="btn sm ghost" data-action="backup-visited" data-id="${b.id}">${icon("check")}去過</button>` : ""}
    </div>
  </article>`;
}

// ===== 電腦版「行程」頁右側的精簡口袋名單（可以直接拖進每天） =====

let asideQuery = "";
let asideCat = "all";

function pocketAsideHTML() {
  return `
  <aside class="plan-aside">
    <section class="card">
      <div class="card-head">
        <h2>${icon("bookmark")}口袋名單</h2>
        <button class="btn sm ghost" data-action="go" data-view="pocket">管理</button>
      </div>
      <form class="quick-add sm" data-form="backup-quick">
        <input name="name" placeholder="快速收藏…" autocomplete="off" aria-label="快速收藏">
        <button class="icon-btn" type="submit" aria-label="收藏">${icon("plus")}</button>
      </form>
      <div class="chip-row">
        ${[["all", "全部"], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.icon])].map(([k, l]) =>
          `<button class="chip ${asideCat === k ? "active" : ""}" data-action="aside-cat" data-v="${k}" title="${k === "all" ? "全部" : CATEGORIES[k].label}">${l}</button>`).join("")}
      </div>
      <label class="search sm">${icon("search")}<input id="asideSearch" type="search" placeholder="搜尋" value="${esc(asideQuery)}"></label>
      <p class="muted small">把 ${icon("grip")} 拖到左邊任一天，或按 ＋ 選擇要排進哪天。</p>
      <ul class="pocket-drag-list" id="asideList"></ul>
    </section>
  </aside>`;
}

function renderAsideList() {
  const ul = $("#asideList");
  if (!ul) return;
  const list = filteredBackups({ query: asideQuery, opts: { ...prefs.pocket, cat: asideCat, must: false, rainy: false, hideVisited: true, sort: "must" } });
  ul.innerHTML = list.map(({ b }) => {
    const sched = scheduledDays(b);
    return `
    <li class="aside-item" data-id="${b.id}">
      <span class="drag-handle" aria-hidden="true">${icon("grip")}</span>
      <span class="poi-icon sm">${CATEGORIES[b.category].icon}</span>
      <span class="aside-name">${esc(b.name)}${b.priority === "must" ? `<span class="must">${icon("star")}</span>` : ""}
        ${sched.length ? `<small>已排 ${sched.map(i => "D" + (i + 1)).join("、")}</small>` : b.area ? `<small>${esc(b.area)}</small>` : ""}</span>
      <button class="icon-btn" data-action="backup-schedule" data-id="${b.id}" aria-label="排入行程">${icon("plus")}</button>
    </li>`;
  }).join("") || `<li class="muted small">${tripData.backups.length ? "沒有符合的地點" : "還沒有收藏"}</li>`;
}

function initPocketAside() {
  renderAsideList();
  const ul = $("#asideList");
  if (!ul || !window.matchMedia("(min-width: 1024px)").matches) return;
  Sortable.create(ul, {
    group: { name: "items", pull: "clone", put: false },
    sort: false,
    handle: ".drag-handle",
    animation: 150,
    onEnd: () => renderAsideList()
  });
  $("#asideSearch")?.addEventListener("input", debounce(e => { asideQuery = e.target.value; renderAsideList(); }, 150));
}

ACTIONS["aside-cat"] = el => { asideCat = el.dataset.v; renderPlan(); };

// ===== 篩選 =====

ACTIONS["pocket-cat"] = el => { prefs.pocket.cat = el.dataset.v; savePrefs(); renderPocket(); };
ACTIONS["pocket-flag"] = el => {
  const k = el.dataset.k;
  prefs.pocket[k] = !prefs.pocket[k];
  savePrefs();
  renderPocket();
};

// ===== 新增 / 編輯 / 排入行程 =====

FORMS["backup-quick"] = form => {
  const input = form.querySelector("input[name=name]");
  const name = str(input.value);
  if (!name) return;
  if (tripData.backups.some(b => b.name.toLowerCase() === name.toLowerCase())) {
    toast(`「${name}」已經在口袋名單裡了`);
    return;
  }
  const b = normalizeBackup({ name, category: normCategory(name) });
  tripData.backups.push(b);
  input.value = "";
  saveTrip(); refresh();
  toast(`已收藏「${name}」`, { action: { label: "編輯細節", fn: () => openBackupSheet(b) } });
  enrichAndSave([b]);
  // 保持輸入框焦點，方便連續新增
  setTimeout(() => $(`form[data-form="backup-quick"] input`, $(`#view-${currentView}`))?.focus(), 0);
};

function openBackupSheet(b) {
  const catOpts = Object.entries(CATEGORIES).map(([k, v]) => ({ value: k, label: `${v.icon} ${v.label}` }));
  openSheet({
    title: "編輯口袋名單",
    body: `
      ${field({ name: "name", label: "名稱", value: b.name, required: true })}
      <div class="field-row">
        ${field({ name: "category", label: "分類", type: "select", value: b.category, options: catOpts })}
        ${field({ name: "area", label: "地區", value: b.area, placeholder: "例：天神、赤崁樓附近" })}
      </div>
      <div class="field-row">
        ${field({ name: "priority", label: "想去程度", type: "select", value: b.priority, options: [{ value: "must", label: "⭐ 必去" }, { value: "maybe", label: "有空再去" }] })}
        ${field({ name: "status", label: "狀態", type: "select", value: b.status, options: [{ value: "todo", label: "還沒去" }, { value: "visited", label: "✓ 去過了" }, { value: "skipped", label: "沒去成" }] })}
      </div>
      ${toggleField({ name: "rainy", label: "🌧 下雨也適合去（室內）", checked: b.rainy })}
      ${field({ name: "source", label: "來源連結", value: b.source, type: "url", placeholder: "IG / YouTube / 部落格網址" })}
      ${field({ name: "note", label: "筆記", value: b.note, type: "textarea", placeholder: "必點菜色、營業時間、要預約嗎…" })}`,
    actions: [
      { label: "刪除", value: "delete", variant: "danger" },
      { label: "取消", value: "cancel", variant: "ghost" },
      { label: "儲存", value: "save", variant: "primary" }
    ],
    onAction(v, d) {
      if (v === "delete") {
        const idx = tripData.backups.indexOf(b);
        tripData.backups.splice(idx, 1);
        saveTrip(); refresh();
        toast(`已刪除「${b.name}」`, { action: { label: "復原", fn: () => { tripData.backups.splice(idx, 0, b); saveTrip(); refresh(); } } });
        return;
      }
      if (v !== "save") return;
      const name = str(d.name);
      if (!name) return false;
      const relocate = name !== b.name || str(d.area) !== b.area;
      Object.assign(b, {
        name, category: normCategory(d.category), area: str(d.area), priority: d.priority === "must" ? "must" : "maybe",
        status: d.status, rainy: !!d.rainy, source: safeUrl(d.source), note: str(d.note)
      });
      if (str(d.source) && !b.source) toast("來源連結需要以 http 開頭，這次沒有存");
      if (relocate) { b.lat = null; b.lng = null; b.placeId = ""; }
      saveTrip(); refresh();
      if (relocate) enrichAndSave([b]);
    }
  });
}

ACTIONS["backup-edit"] = el => { const b = findBackup(el.dataset.id); if (b) openBackupSheet(b); };

ACTIONS["backup-visited"] = el => {
  const b = findBackup(el.dataset.id);
  if (!b) return;
  b.status = "visited";
  saveTrip(); refresh();
  toast(`「${b.name}」標記為去過了`, { action: { label: "復原", fn: () => { b.status = "todo"; saveTrip(); refresh(); } } });
};

ACTIONS["backup-schedule"] = el => {
  const b = findBackup(el.dataset.id);
  if (!b) return;
  if (!tripData.days.length) {
    toast("還沒有任何一天的行程，先建立一天吧");
    return;
  }
  const ti = todayIndex();
  const sched = scheduledDays(b);
  openSheet({
    title: `把「${b.name}」排進哪一天？`,
    body: `<div class="sheet-list">
      ${tripData.days.map((d, i) => {
        const last = lastCoordItem(d);
        const km = last && b.lat != null ? haversine(b.lat, b.lng, last.lat, last.lng) : null;
        return `<button type="submit" name="_action" value="${i}" class="list-btn">
          <span class="day-badge">D${i + 1}</span>
          <span><b>${esc(d.title)}${i === ti ? ' <span class="pill accent">今天</span>' : ""}${sched.includes(i) ? ' <span class="pill">已排</span>' : ""}</b>
          <small>${[formatDateLabel(dayDate(i)), `${d.items.length} 個行程`, km != null ? `離最後一站「${esc(last.text)}」${formatKm(km)}` : ""].filter(Boolean).join(" · ")}</small></span>
        </button>`;
      }).join("")}
    </div>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }],
    onAction(v) {
      if (v === "cancel" || v == null) return;
      addBackupToDay(b, +v);
    }
  });
};

// ===== 景點雷達 =====

ACTIONS["radar-run"] = async el => {
  const text = str($("#radarText").value);
  let source = str($("#radarSource").value);
  if (!text) {
    toast(source ? "請在上面的框框貼上影片說明文字或筆記，AI 才有內容可以讀" : "請先貼上網址或文字");
    return;
  }
  if (isUrl(text)) {
    if (!source) source = text;
    if (SOCIAL_RE.test(text)) toast("IG、TikTok 等社群網站通常讀不到內容，若沒有結果，請改貼影片說明文字");
  }
  const isVideo = YOUTUBE_RE.test(text);
  setBusy(el, true, isVideo ? "AI 正在看影片…" : "AI 抓取中…");
  try {
    const places = await aiExtractPlaces(text, { onSlow: () => setBusy(el, true, isVideo ? "AI 正在看影片，影片越長越久…" : "伺服器喚醒中，請稍候…") });
    setBusy(el, false);
    if (!places.length) {
      toast(isVideo ? "影片裡沒有找到明確的地點" : "沒有找到地點。若是社群影片，請改貼影片說明文字");
      return;
    }
    showRadarPreview(places, safeUrl(source));
  } catch (e) {
    setBusy(el, false);
    toast(e.message);
  }
};

function showRadarPreview(places, source) {
  const existing = new Set(tripData.backups.map(b => b.name.toLowerCase()));
  openSheet({
    title: `找到 ${places.length} 個地點`,
    body: `
      <p class="muted small">勾選要收藏的地點${source ? "，會一起記下來源連結" : ""}。</p>
      <div class="check-list">
        ${places.map((p, i) => {
          const dup = existing.has(p.name.toLowerCase());
          return `<label class="check-item ${dup ? "dim" : ""}">
            <input type="checkbox" name="pick" value="${i}" data-multi="1" ${dup ? "" : "checked"}>
            <span class="poi-icon sm">${CATEGORIES[p.category].icon}</span>
            <span><b>${esc(p.name)}</b><small>${[CATEGORIES[p.category].label, p.area, p.note, dup ? "已在清單中" : ""].filter(Boolean).map(esc).join(" · ")}</small></span>
          </label>`;
        }).join("")}
      </div>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "加入口袋名單", value: "add", variant: "primary" }],
    onAction(v, d) {
      if (v !== "add") return;
      const picks = (d.pick || []).map(Number);
      const added = picks.map(i => places[i])
        .filter(p => !existing.has(p.name.toLowerCase()))
        .map(p => normalizeBackup({ ...p, source }));
      if (!added.length) return toast("沒有新的地點");
      tripData.backups.push(...added);
      saveTrip(); refresh();
      $("#radarText") && ($("#radarText").value = "");
      $("#radarSource") && ($("#radarSource").value = "");
      toast(`已收藏 ${added.length} 個地點，正在補上座標…`);
      enrichAndSave(added, { silent: false });
    }
  });
}

/** 去過的紀錄：所有行程裡打勾過的次數、最近一次和評分 */
function visitTagHTML(b) {
  const visits = visitsOf(b);
  if (!visits.length) return b.status === "visited" ? `<span class="tag success">✓ 去過了</span>` : "";
  const last = visits[0];
  const when = last.date ? `${parseISODate(last.date).getFullYear()}/${parseISODate(last.date).getMonth() + 1}` : "";
  const title = last.trip.meta.title || "行程";
  return `<span class="tag success" title="${esc(last.review || "")}">✓ 去過 ${visits.length} 次 · ${esc([when, title].filter(Boolean).join(" "))}${last.rating ? ` ⭐${last.rating}` : ""}</span>`;
}
