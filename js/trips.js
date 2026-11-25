// =========================================
// trips.js — 我的行程（切換 / 新增 / 刪除）、行程設定、旅行回顧、加到其他行程
// =========================================

const PHASE_GROUPS = [
  ["during", "旅途中"],
  ["before", "即將出發"],
  ["undated", "還沒排日期"],
  ["after", "過去的旅行"]
];

/** 旅行統計：去了幾個地方、平均評分 */
function tripStats(t) {
  const items = t.days.flatMap(d => d.items);
  const done = items.filter(i => i.done);
  const rated = items.filter(i => i.rating > 0);
  const avg = rated.length ? rated.reduce((s, i) => s + i.rating, 0) / rated.length : 0;
  return { total: items.length, done: done.length, avg, reviews: items.filter(i => i.review).length };
}

function openTripList() {
  const groups = PHASE_GROUPS.map(([phase, label]) => {
    let list = library.trips.filter(t => (tripPhaseOf(t) === "empty" ? "undated" : tripPhaseOf(t)) === phase);
    if (!list.length) return "";
    const byStart = (a, b) => dayDateOf(a, 0).localeCompare(dayDateOf(b, 0));
    list = phase === "after" ? list.sort(byStart).reverse() : phase === "undated" ? list : list.sort(byStart);
    return `
      <h4 class="sheet-group">${label}</h4>
      <div class="sheet-list">
        ${list.map(t => {
          const s = tripStats(t);
          const current = t === tripData;
          const sub = [tripRangeLabel(t)];
          if (phase === "after") sub.push(`去了 ${s.done} 個地方${s.avg ? ` · ⭐${s.avg.toFixed(1)}` : ""}`);
          const name = t.meta.title || "未命名行程";
          return `<div class="trip-row">
            <button type="submit" name="_action" value="open:${t.id}" class="list-btn ${current ? "current" : ""}">
              ${icon(t.days.length === 1 ? "sun" : phase === "after" ? "check" : "calendar")}
              <span><b>${esc(name)}${current ? ' <span class="pill primary">目前</span>' : ""}</b><small>${esc(sub.join(" · "))}</small></span>
            </button>
            <button type="submit" name="_action" value="del:${t.id}" class="icon-btn trip-del" formnovalidate title="刪除「${esc(name)}」" aria-label="刪除「${esc(name)}」">${icon("trash")}</button>
          </div>`;
        }).join("")}
      </div>`;
  }).join("");

  openSheet({
    title: "我的行程",
    body: `
      <div class="new-trip-row">
        <button type="submit" name="_action" value="new-day" class="btn">${icon("sun")}一日遊</button>
        <button type="submit" name="_action" value="new-ai" class="btn">${icon("sparkles")}AI 整理</button>
        <button type="submit" name="_action" value="new-blank" class="btn">${icon("calendar")}空白多日</button>
      </div>
      ${groups || `<p class="muted">還沒有任何行程。</p>`}`,
    actions: [{ label: "關閉", value: "cancel", variant: "ghost" }],
    onAction(v) {
      if (v.startsWith("del:")) {
        deleteTripWithUndo(v.slice(4));
        // 刪完留在清單，方便一次清掉好幾個
        if (library.trips.length) setTimeout(openTripList, 50);
        return;
      }
      if (v.startsWith("open:")) {
        selectTrip(v.slice(5));
        todaySel = null;
        setView(tripPhase() === "during" ? "today" : "plan");
        return;
      }
      if (v === "new-day") { setTimeout(openDayTripSheet, 50); return; }
      if (v === "new-ai") { setView("tools"); setTimeout(() => $("#rawInput")?.focus(), 50); return; }
      if (v === "new-blank") {
        startBlankTrip();
        setView("plan");
        setTimeout(() => openTripSettings({ isNew: true }), 50);
      }
    }
  });
}
ACTIONS["trip-list"] = () => openTripList();

/** 刪除行程（可以按復原）。刪的不是目前這個行程時，畫面留在原本的行程 */
function deleteTripWithUndo(id) {
  const keep = tripData.id !== id ? tripData.id : null;
  const info = deleteTrip(id);
  if (!info) return null;
  todaySel = null;
  refresh();
  toast(`已刪除「${info.trip.meta.title || "行程"}」`, { action: { label: "復原", fn: () => {
    undoDeleteTrip(info);
    selectTrip(keep || info.trip.id);
    refresh();
  } } });
  return info;
}
ACTIONS["trip-delete"] = () => deleteTripWithUndo(tripData.id);

// ===== 行程設定 =====

function openTripSettings({ isNew = false } = {}) {
  const m = tripData.meta;
  const saved = library.trips.includes(tripData);
  openSheet({
    title: isNew ? "新的多日行程" : "行程設定",
    body: `
      ${field({ name: "title", label: "行程名稱", value: m.title, placeholder: "例：沖繩 5 天 4 夜", autofocus: true })}
      ${field({ name: "region", label: "主要地區（選填）", value: m.region, placeholder: "例：沖繩；南投、台中", hint: "填縣市或城市就好，跨好幾個地方用頓號分開。不要填景點名稱，地點會被定位到那個景點" })}
      ${field({ name: "startDate", label: "出發日（Day 1）", value: m.startDate, type: "date", hint: "之後每一天的日期會自動往後推算" })}
      ${isNew ? field({ name: "days", label: "天數", value: 3, type: "number" }) : ""}
      <div class="field-row">
        ${field({ name: "abroad", label: "國內 / 國外", type: "select", value: m.abroad === true ? "abroad" : m.abroad === false ? "domestic" : "auto",
          options: [{ value: "auto", label: `自動（${isAbroad(tripData) ? "國外" : "國內"}）` }, { value: "domestic", label: "國內" }, { value: "abroad", label: "國外" }] })}
        ${field({ name: "currency", label: "當地幣別", type: "select", value: m.currency || "",
          options: [{ value: "", label: `自動${tripCurrency(tripData) && tripCurrency(tripData) !== "TWD" ? `（${currencyName(tripCurrency(tripData))}）` : ""}` },
            ...Object.entries(CURRENCIES).filter(([k]) => k !== "TWD").map(([k, c]) => ({ value: k, label: `${c.name} ${k}` }))] })}
      </div>
      <p class="field-hint">國外行程會顯示匯率，記帳也能用當地幣別。</p>
      ${isNew ? "" : `<div class="sheet-list">
        <button type="submit" name="_action" value="places" class="list-btn" formnovalidate>${icon("route")}<span><b>從哪出發、回到哪裡</b><small>${esc(tripPlacesSummary(tripData))}</small></span></button>
      </div>`}
      ${isNew ? "" : field({ name: "albumUrl", label: "相簿連結", value: m.albumUrl, type: "url", placeholder: "Google 相簿分享網址", hint: "旅行回顧時可以一鍵打開照片" })}
      ${saved && !isNew ? `<div class="sheet-list">
        <button type="submit" name="_action" value="duplicate" class="list-btn">${icon("copy")}<span><b>再去一次</b><small>複製成新行程：日期和打勾清掉，心得留著參考</small></span></button>
        <button type="submit" name="_action" value="delete" class="list-btn danger">${icon("trash")}<span><b>刪除這個行程</b><small>口袋名單不會被刪除，可以復原</small></span></button>
      </div>` : ""}`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: isNew ? "建立" : "儲存", value: "save", variant: "primary" }],
    onAction(v, d) {
      if (v === "places") { setTimeout(() => openTripPlaces(), 50); return; }
      if (v === "duplicate") {
        const copy = duplicateTrip(tripData);
        todaySel = null;
        setView("plan");
        setTimeout(() => openTripSettings(), 50);
        toast(`已建立「${copy.meta.title}」，設定新的出發日吧`);
        return;
      }
      if (v === "delete") { deleteTripWithUndo(tripData.id); return; }
      if (v !== "save") {
        if (isNew && !library.trips.includes(tripData)) { selectTrip(library.currentTripId); refresh(); }
        return;
      }
      const newStart = isISODate(d.startDate) ? d.startDate : "";
      if (newStart !== m.startDate) tripData.days.forEach(day => { day.date = ""; });
      m.title = str(d.title);
      m.region = str(d.region);
      m.startDate = newStart;
      if (!isNew) m.albumUrl = safeUrl(d.albumUrl);
      m.abroad = d.abroad === "abroad" ? true : d.abroad === "domestic" ? false : null;
      m.currency = /^[A-Z]{3}$/.test(d.currency || "") ? d.currency : "";
      if (isNew) {
        const n = Math.min(30, Math.max(1, parseInt(d.days, 10) || 1));
        while (tripData.days.length < n) tripData.days.push({ id: uid(), title: `Day ${tripData.days.length + 1}`, date: "", items: [] });
        if (!m.title) m.title = m.region ? `${m.region} ${n} 天` : "新的行程";
      }
      saveTrip();
      refresh();
      toast(isNew ? "行程建立好了" : "已更新行程設定");
    }
  });
}
ACTIONS["trip-settings"] = () => openTripSettings();

// ===== 旅行回顧（旅程結束後顯示在「行程」頁最上方） =====

function reviewCardHTML() {
  const s = tripStats(tripData);
  const m = tripData.meta;
  return `
  <section class="card review-card">
    <div class="card-head">
      <h2>${icon("check")}旅行回顧</h2>
      <button class="btn sm ghost" data-action="trip-settings">${icon("edit")}編輯</button>
    </div>
    <div class="review-stats">
      <div><b>${tripData.days.length}</b><span>天</span></div>
      <div><b>${s.done}</b><span>個去過的地方</span></div>
      <div><b>${s.avg ? s.avg.toFixed(1) : "—"}</b><span>平均評分</span></div>
      <div><b>${tripData.expenses.length ? fmtMoney(sumExpenses(tripData.expenses).total, "TWD") : "—"}</b><span>花費</span></div>
    </div>
    <p class="muted small">點每個地點可以補上星星和一句心得，下次規劃時會很有用。</p>
    <div class="btn-row">
      ${m.albumUrl
        ? `<a class="btn primary" href="${esc(m.albumUrl)}" target="_blank" rel="noopener">${icon("external")}打開相簿</a>`
        : `<button class="btn" data-action="trip-settings">${icon("link")}加上相簿連結</button>`}
      <button class="btn" data-action="trip-again">${icon("copy")}再去一次</button>
    </div>
  </section>`;
}

ACTIONS["trip-again"] = () => {
  const copy = duplicateTrip(tripData);
  todaySel = null;
  setView("plan");
  setTimeout(() => openTripSettings(), 50);
  toast(`已建立「${copy.meta.title}」，設定新的出發日吧`);
};

// ===== 把這天的地點加到其他行程（例如：一日遊挑幾個點，併進下個月的三天兩夜） =====

function openCopyToTrip(dayIndex) {
  const day = tripData.days[dayIndex];
  const others = library.trips.filter(t => t !== tripData);
  if (!day.items.length) return toast("這天沒有行程可以加");
  if (!others.length) return toast("還沒有其他行程，先建立一個新行程吧");
  const targets = others.flatMap(t => [
    ...t.days.map((d, i) => ({ value: `${t.id}:${i}`, label: `${t.meta.title || "未命名行程"} · D${i + 1}${dayDateOf(t, i) ? " " + formatDateLabel(dayDateOf(t, i)) : ""}` })),
    { value: `${t.id}:new`, label: `${t.meta.title || "未命名行程"} · 新增一天` }
  ]);
  openSheet({
    title: "加到其他行程",
    body: `
      <p class="muted small">勾選要加過去的地點，會複製一份（這裡的不會被移走）。</p>
      <div class="check-list">
        ${day.items.map((it, k) => `
        <label class="check-item">
          <input type="checkbox" name="pick" value="${k}" data-multi="1" checked>
          <span><b>${it.time ? esc(it.time) + " " : ""}${esc(it.text)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ""}</span>
        </label>`).join("")}
      </div>
      ${field({ name: "target", label: "加到", type: "select", value: targets[0].value, options: targets })}`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "加入", value: "copy", variant: "primary" }],
    onAction(v, d) {
      if (v !== "copy") return;
      const picks = (d.pick || []).map(Number);
      if (!picks.length) { toast("沒有勾選任何地點"); return false; }
      const [tripId, dayKey] = String(d.target).split(":");
      const target = library.trips.find(t => t.id === tripId);
      if (!target) return;
      let di = dayKey === "new" ? -1 : +dayKey;
      if (di < 0) {
        target.days.push({ id: uid(), title: `Day ${target.days.length + 1}`, date: "", items: [] });
        di = target.days.length - 1;
      }
      const copies = picks.map(k => {
        const src = day.items[k];
        return normalizeItem({ ...src, id: uid(), done: false, rating: 0, review: "" });
      });
      target.days[di].items.push(...copies);
      prefs.expanded[target.days[di].id] = true;
      saveTrip(); savePrefs();
      toast(`已把 ${copies.length} 個地點加到「${target.meta.title || "行程"}」D${di + 1}`, {
        action: { label: "前往", fn: () => { selectTrip(target.id); todaySel = null; setView("plan"); } }
      });
    }
  });
}

ACTIONS["trip-new-blank"] = () => {
  if (library.trips.includes(tripData)) startBlankTrip();
  if (currentView !== "plan") setView("plan"); else refresh();
  openTripSettings({ isNew: true });
};

// ===== 出發地／回家（常用地點）=====

function tripPlacesSummary(t) {
  const find = id => library.places.find(p => p.id === id);
  const s = find(t.meta.startPlace), e = find(t.meta.endPlace);
  if (!s && !e) return "還沒設定：設定後第一天從這裡開始排順路";
  if (s && s === e) return `從「${placeTitle(s)}」出發，最後回到這裡`;
  return [s ? `從「${placeTitle(s)}」出發` : "", e ? `回到「${placeTitle(e)}」` : ""].filter(Boolean).join("，");
}
// 常用地點存在整個資料庫（library.places），會跟著同步碼到其他裝置。
// 建議填附近的地標（例如捷運站），不必填門牌。

function placeOptions(empty) {
  return [{ value: "", label: empty }, ...library.places.map(p => ({ value: p.id, label: placeTitle(p) + (p.label && p.name !== p.label ? `（${p.name}）` : "") }))];
}

function openTripPlaces() {
  const m = tripData.meta;
  const list = library.places.map(p => `
    <button type="submit" name="_action" value="edit:${esc(p.id)}" class="list-btn" formnovalidate>${icon("locate")}<span><b>${esc(placeTitle(p))}</b>
      <small>${esc(p.label && p.label !== p.name ? p.name + "・" : "")}${p.lat != null ? esc(p.address || "已定位") : "還沒有位置"}</small></span></button>`).join("");
  openSheet({
    title: "從哪出發、回到哪裡",
    body: `
      ${library.places.length ? `
      <div class="field-row">
        ${field({ name: "startPlace", label: "出發地", type: "select", value: m.startPlace, options: placeOptions("不設定") })}
        ${field({ name: "endPlace", label: "最後回到", type: "select",
          value: m.endPlace && m.endPlace === m.startPlace ? "same" : m.endPlace,
          options: [{ value: "same", label: "跟出發地一樣" }, ...placeOptions("不設定")] })}
      </div>
      <p class="field-hint">第一天從出發地開始排，最後一天接回這裡。中間幾天會用住宿（在住宿裡勾「住哪幾晚」）。</p>` :
      `<p class="muted small">先新增一個常用地點（例如「家」「集合點」），每趟行程就能選從哪出發、回到哪。</p>`}
      <span class="field-label">常用地點</span>
      <div class="sheet-list">
        ${list}
        <button type="submit" name="_action" value="add" class="list-btn" formnovalidate>${icon("plus")}<span><b>新增常用地點</b><small>家、公司、集合點…會跟著同步碼到其他裝置</small></span></button>
      </div>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, ...(library.places.length ? [{ label: "儲存", value: "save", variant: "primary" }] : [])],
    onAction(v, d) {
      if (v === "cancel") return;
      const keep = () => {
        if (!library.places.length) return;
        const ids = new Set(library.places.map(p => p.id));
        m.startPlace = ids.has(d.startPlace) ? d.startPlace : "";
        m.endPlace = d.endPlace === "same" ? m.startPlace : ids.has(d.endPlace) ? d.endPlace : "";
      };
      if (v === "add" || v.startsWith("edit:")) {
        keep(); saveTrip();
        const p = v === "add" ? null : library.places.find(x => x.id === v.slice(5));
        setTimeout(() => openPlaceSheet(p), 50);
        return;
      }
      keep();
      saveTrip(); refresh();
      toast("已更新出發地／回家");
    }
  });
}
ACTIONS["trip-places"] = () => openTripPlaces();

async function locatePlace(p) {
  const r = await locateText(p.name, null).catch(() => null);
  if (!library.places.includes(p)) return false;
  if (r) Object.assign(p, { lat: r.lat, lng: r.lng, placeId: r.placeId, address: r.foundAddress });
  saveTrip(); refresh();
  return !!r;
}

function openPlaceSheet(place) {
  const isNew = !place;
  const p = place || normalizePlace({});
  openSheet({
    title: isNew ? "新增常用地點" : "編輯常用地點",
    body: `
      ${field({ name: "label", label: "叫它什麼", value: p.label, placeholder: "例：家、公司、集合點", autofocus: true })}
      ${field({ name: "name", label: "地標或地址", value: p.name, required: true, placeholder: "例：土城捷運站",
        hint: "建議填附近的地標（捷運站、路口、公園），不用填門牌：資料會存到雲端，排路線用附近地標就夠準了" })}
      ${p.lat != null ? `<p class="field-hint">目前定位：${esc(p.address || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`)}</p>` : ""}`,
    actions: [
      ...(isNew ? [] : [{ label: "刪除", value: "delete", variant: "danger" }]),
      { label: "取消", value: "cancel", variant: "ghost" },
      { label: "儲存", value: "save", variant: "primary" }
    ],
    onAction(v, d) {
      const back = () => setTimeout(() => openTripPlaces(), 50);
      if (v === "cancel") { back(); return; }
      if (v === "delete") {
        const idx = library.places.indexOf(p);
        library.places.splice(idx, 1);
        // 用到這個地點的行程一起清掉，不留下找不到的 id
        const used = library.trips.filter(t => t.meta.startPlace === p.id || t.meta.endPlace === p.id);
        used.forEach(t => { if (t.meta.startPlace === p.id) t.meta.startPlace = ""; if (t.meta.endPlace === p.id) t.meta.endPlace = ""; });
        saveTrip(); refresh();
        toast(`已刪除「${placeTitle(p)}」`);
        back();
        return;
      }
      if (v !== "save") return;
      const moved = str(d.name) !== p.name;
      p.label = str(d.label);
      p.name = str(d.name);
      if (moved) Object.assign(p, { lat: null, lng: null, placeId: "", address: "" });
      if (isNew) {
        library.places.push(p);
        // 第一個常用地點：這趟行程直接用它當出發地和回程
        if (!tripData.meta.startPlace && !tripData.meta.endPlace) { tripData.meta.startPlace = p.id; tripData.meta.endPlace = p.id; }
      }
      saveTrip(); refresh();
      back();
      if (p.lat == null) {
        toast("正在查位置…");
        locatePlace(p).then(ok => toast(ok ? `「${placeTitle(p)}」定位在：${p.address || "已找到"}` : `找不到「${p.name}」的位置，換個更明確的地標試試`));
      }
    }
  });
}
