// =========================================
// plan.js — 「行程」頁：每日行程、拖曳排序、新增 / 編輯
// =========================================

function isExpanded(day, i) {
  if (isDayTrip()) return true; // 一日遊只有一天，永遠展開
  if (day.id in prefs.expanded) return !!prefs.expanded[day.id];
  const ti = todayIndex();
  return ti >= 0 ? i === ti : i === 0;
}

function renderPlan() {
  const el = $("#view-plan");
  if (!tripData.days.length) {
    el.innerHTML = `<div class="plan-layout"><div class="plan-main">${emptyStateHTML()}</div>${pocketAsideHTML()}</div>`;
    initPocketAside();
    return;
  }
  const allOpen = tripData.days.every((d, i) => isExpanded(d, i));
  // 出發前行李清單放上面；旅途中、結束後以行程為主，花費和行李放下面
  const packingFirst = ["before", "undated", "empty"].includes(tripPhase());
  el.innerHTML = `
  <div class="plan-layout">
    <div class="plan-main">
      ${tripPhase() === "after" ? reviewCardHTML() : ""}
      ${infoCardHTML()}
      ${packingFirst ? packingCardHTML() : ""}
      ${tipHTML("plan")}
      <div class="section-head">
        <h2>${isDayTrip() ? "行程" : "每日行程"}</h2>
        ${isDayTrip() ? "" : `<button class="btn sm ghost" data-action="days-expand-all" data-open="${allOpen ? 0 : 1}">${allOpen ? "全部收合" : "全部展開"}</button>`}
      </div>
      ${tripData.days.map((d, i) => dayCardHTML(d, i)).join("")}
      ${isDayTrip()
        ? `<button class="add-day subtle" data-action="day-add">${icon("plus")}行程變長了？改成多日行程（新增第 2 天）</button>`
        : `<button class="add-day" data-action="day-add">${icon("plus")}新增一天</button>`}
      <p class="hint-line">小技巧：按住 ${icon("grip")} 可以拖曳排序${isDayTrip() ? "" : "，也能拖到其他天"}。</p>
      ${expensesCardHTML()}
      ${!packingFirst && tripPhase() !== "after" ? packingCardHTML() : ""}
    </div>
    ${pocketAsideHTML()}
  </div>`;
  initDaySortables();
  initPocketAside();
}

function dayCardHTML(day, i) {
  const open = isExpanded(day, i);
  const date = dayDate(i);
  const isToday = i === todayIndex();
  const done = day.items.filter(x => x.done).length;
  const single = isDayTrip();
  const wx = dayWeather(tripData, i);
  const d = parseISODate(date);
  const badge = single && d ? `<span class="day-badge date"><small>${d.getMonth() + 1}月</small>${d.getDate()}</span>` : `<span class="day-badge">D${i + 1}</span>`;
  const head = `
        ${badge}
        <span class="day-title-wrap">
          <span class="day-title">${esc(day.title)}${isToday ? '<span class="pill accent">今天</span>' : ""}</span>
          <span class="day-sub">${date ? formatDateLabel(date) + " · " : ""}<span class="nowrap">${day.items.length} 個行程</span>${done ? `<span class="nowrap">・完成 ${done}</span>` : ""}${wx ? `<span class="nowrap day-wx">　${weatherShort(wx)}</span>` : ""}</span>
        </span>`;
  return `
  <article class="card day-card ${isToday ? "is-today" : ""}" data-day="${i}">
    <header class="day-head">
      ${single
        ? `<div class="day-toggle static">${head}</div>`
        : `<button class="day-toggle" data-action="day-toggle" data-id="${day.id}" aria-expanded="${open}">${head}${icon("chevron", "chev")}</button>`}
      <div class="day-tools">
        ${dayRouteButtonHTML(i)}
        <button class="icon-btn" data-action="day-menu" data-day="${i}" title="這天的選項" aria-label="這天的選項">${icon("more")}</button>
      </div>
    </header>
    <div class="day-body" ${open ? "" : "hidden"}>
      <div class="day-items" data-day="${i}">
        ${day.items.map(it => itemRowHTML(it, i)).join("")}
      </div>
      <button class="add-row" data-action="item-add" data-day="${i}">${icon("plus")}新增行程</button>
    </div>
  </article>`;
}

function itemRowHTML(it, dayIndex) {
  return `
  <div class="item-row ${it.done ? "done" : ""}" data-id="${it.id}">
    <span class="drag-handle" title="拖曳排序" aria-hidden="true">${icon("grip")}</span>
    <button class="item-main" data-action="item-edit" data-day="${dayIndex}" data-id="${it.id}">
      ${it.time ? `<span class="item-time">${esc(it.time)}</span>` : ""}
      <span class="item-text">${esc(it.text)}</span>
      ${it.note ? `<span class="item-note">${esc(it.note)}</span>` : ""}
      ${it.rating || it.review ? `<span class="item-review">${it.rating ? `<span class="stars">${"★".repeat(it.rating)}${"☆".repeat(5 - it.rating)}</span>` : ""}${esc(it.review)}</span>` : ""}
    </button>
    <a class="icon-btn" href="${esc(mapsNavUrl(it))}" target="_blank" rel="noopener" title="導航" aria-label="導航到 ${esc(it.text)}">${icon("nav")}</a>
  </div>`;
}

function initDaySortables() {
  $$(".day-items").forEach(list => {
    Sortable.create(list, {
      group: { name: "items", pull: true, put: true },
      handle: ".drag-handle",
      animation: 150,
      ghostClass: "drag-ghost",
      onEnd(evt) {
        if (!evt.from.classList.contains("day-items")) return;
        const from = +evt.from.dataset.day, to = +evt.to.dataset.day;
        if (from === to && evt.oldIndex === evt.newIndex) return;
        const [moved] = tripData.days[from].items.splice(evt.oldIndex, 1);
        tripData.days[to].items.splice(evt.newIndex, 0, moved);
        if (from !== to) prefs.expanded[tripData.days[to].id] = true;
        saveTrip(); savePrefs();
        renderPlan();
      },
      onAdd(evt) {
        // 從右側口袋名單拖進來（電腦版）
        if (!evt.from.classList.contains("pocket-drag-list")) return;
        const backup = findBackup(evt.item.dataset.id);
        evt.item.remove();
        if (backup) addBackupToDay(backup, +evt.to.dataset.day, evt.newIndex);
      }
    });
  });
}

// ===== 新增 / 編輯行程項目 =====

function openItemSheet(dayIndex, item) {
  const isNew = !item;
  const it = item || normalizeItem({});
  const dayOptions = tripData.days.map((d, i) => ({ value: i, label: `${dayLabel(i)}　${d.title}` }));
  openSheet({
    title: isNew ? `新增行程到 Day ${dayIndex + 1}` : "編輯行程",
    body: `
      <div class="field-row">
        ${field({ name: "time", label: "時間", value: it.time, placeholder: "09:30" })}
        ${field({ name: "day", label: "日期", type: "select", value: dayIndex, options: dayOptions })}
      </div>
      ${field({ name: "text", label: "地點或活動", value: it.text, required: true, autofocus: true, placeholder: "例：首里城、國際通晚餐", hint: "寫店名或景點名稱，導航會比較準" })}
      ${field({ name: "note", label: "備註", value: it.note, type: "textarea", placeholder: "要點的菜、營業時間、注意事項…" })}
      ${isNew ? "" : toggleField({ name: "done", label: "已完成", checked: it.done })}
      ${isNew ? "" : (() => {
        const spent = tripData.expenses.filter(e => e.place && e.place === it.text);
        return `<button type="submit" name="_action" value="expense" class="list-btn" formnovalidate>${icon("wallet")}<span><b>記一筆這裡的花費</b><small>${spent.length ? `已記 ${spent.length} 筆，共 ${fmtMoney(sumExpenses(spent).total, "TWD")}` : "例如門票、餐點"}</small></span></button>`;
      })()}
      ${isNew ? "" : `
      <details class="review-fields" ${it.rating || it.review || it.done || tripPhase() === "after" ? "open" : ""}>
        <summary>去過之後：評分與心得</summary>
        <div class="star-input" role="radiogroup" aria-label="評分">
          ${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}" ${it.rating === n ? "checked" : ""}><span aria-hidden="true">★</span><span class="sr-only">${n} 顆星</span></label>`).join("")}
          <label class="star-clear"><input type="radio" name="rating" value="0" ${!it.rating ? "checked" : ""}><span>不評分</span></label>
        </div>
        ${field({ name: "review", label: "一句心得", value: it.review, type: "textarea", rows: 2, placeholder: "例：芋圓普通，下次換別家；景色超值得" })}
      </details>`}`,
    actions: [
      ...(isNew ? [] : [{ label: "刪除", value: "delete", variant: "danger" }]),
      { label: "取消", value: "cancel", variant: "ghost" },
      { label: isNew ? "新增" : "儲存", value: "save", variant: "primary" }
    ],
    onAction(v, d) {
      if (v === "delete") return deleteItem(dayIndex, it.id);
      if (v === "expense") {
        setTimeout(() => openExpenseSheet({ dayIndex, place: it.text }), 50);
        return;
      }
      if (v !== "save") return;
      const text = str(d.text);
      if (!text) return false;
      const target = +d.day;
      const nameChanged = text !== it.text;
      Object.assign(it, { time: str(d.time), text, note: str(d.note), done: isNew ? false : !!d.done });
      if (!isNew) {
        it.rating = Math.min(5, Math.max(0, parseInt(d.rating, 10) || 0));
        it.review = str(d.review);
      }
      if (nameChanged) { it.lat = null; it.lng = null; it.placeId = ""; }
      if (isNew) {
        tripData.days[target].items.push(it);
      } else if (target !== dayIndex) {
        // 換到別天：從原本那天移除，加到新那天的最後
        const src = tripData.days[dayIndex].items;
        src.splice(src.indexOf(it), 1);
        tripData.days[target].items.push(it);
      }
      prefs.expanded[tripData.days[target].id] = true;
      saveTrip(); savePrefs(); refresh();
      if (nameChanged) enrichAndSave([it]);
    }
  });
}

ACTIONS["item-add"] = el => openItemSheet(+el.dataset.day, null);
ACTIONS["item-edit"] = el => {
  const f = findItem(+el.dataset.day, el.dataset.id);
  if (f) openItemSheet(+el.dataset.day, f.item);
};

function deleteItem(dayIndex, id) {
  const f = findItem(dayIndex, id);
  if (!f) return;
  f.day.items.splice(f.index, 1);
  saveTrip(); refresh();
  toast(`已刪除「${f.item.text}」`, {
    action: { label: "復原", fn: () => { f.day.items.splice(f.index, 0, f.item); saveTrip(); refresh(); } }
  });
}

ACTIONS["item-done"] = el => {
  const f = findItem(+el.dataset.day, el.dataset.id);
  if (!f) return;
  f.item.done = !f.item.done;
  // 從口袋名單排進來的地點，完成後順便標記「去過了」
  const b = f.item.backupId ? findBackup(f.item.backupId) : null;
  if (b && f.item.done) b.status = "visited";
  saveTrip(); refresh();
};

// ===== 每天的操作 =====

ACTIONS["day-toggle"] = el => {
  const i = tripData.days.findIndex(d => d.id === el.dataset.id);
  prefs.expanded[el.dataset.id] = !isExpanded(tripData.days[i], i);
  savePrefs();
  renderPlan();
};

ACTIONS["days-expand-all"] = el => {
  const open = el.dataset.open === "1";
  tripData.days.forEach(d => { prefs.expanded[d.id] = open; });
  savePrefs();
  renderPlan();
};

ACTIONS["day-add"] = () => {
  const n = tripData.days.length;
  const day = { id: uid(), title: `Day ${n + 1}`, date: "", items: [] };
  tripData.days.push(day);
  prefs.expanded[day.id] = true;
  saveTrip(); savePrefs();
  if (currentView !== "plan") setView("plan"); else refresh();
  toast(`已新增 Day ${n + 1}`);
};

const ROUTE_MAX = 10; // Google 地圖一條路線最多約 10 個點

/** 整天路線（只放還沒完成的行程） */
function dayRouteStops(i) {
  return (tripData.days[i]?.items || []).filter(x => !x.done).map(x => x.text).filter(Boolean);
}

function dayRouteButtonHTML(i) {
  const stops = dayRouteStops(i);
  if (!stops.length) {
    return `<button class="icon-btn" data-action="route-empty" title="整天路線" aria-label="整天路線">${icon("route")}</button>`;
  }
  const url = "https://www.google.com/maps/dir/" + stops.slice(0, ROUTE_MAX).map(encodeURIComponent).join("/");
  const more = stops.length > ROUTE_MAX ? "1" : "";
  return `<a class="icon-btn" href="${esc(url)}" target="_blank" rel="noopener" data-route-more="${more}" title="在 Google 地圖開啟整天路線" aria-label="整天路線">${icon("route")}</a>`;
}

ACTIONS["route-empty"] = () => toast("這天沒有尚未完成的行程");
document.addEventListener("click", e => {
  if (e.target.closest("[data-route-more='1']")) toast(`Google 地圖一次最多 ${ROUTE_MAX} 個點，已先放前 ${ROUTE_MAX} 個`);
});

ACTIONS["day-menu"] = el => {
  const i = +el.dataset.day;
  const day = tripData.days[i];
  openSheet({
    title: isDayTrip() ? "行程選項" : `Day ${i + 1} 選項`,
    body: `
      ${field({ name: "title", label: "這天的標題", value: day.title, placeholder: "例：Day 1 那霸市區" })}
      <div class="sheet-list">
        <button type="submit" name="_action" value="copy-other" class="list-btn">${icon("copy")}<span><b>加到其他行程</b><small>挑幾個地點複製到另一個行程（例如併進下次的多日旅行）</small></span></button>
        <button type="submit" name="_action" value="sort" class="list-btn">${icon("route")}<span><b>依順路重新排序</b><small>用直線距離重排（第一站不動），可以復原</small></span></button>
        ${isDayTrip() ? "" : `<button type="submit" name="_action" value="up" class="list-btn" ${i === 0 ? "disabled" : ""}>${icon("chevron", "rot180")}<span><b>往前移一天</b></span></button>
        <button type="submit" name="_action" value="down" class="list-btn" ${i === tripData.days.length - 1 ? "disabled" : ""}>${icon("chevron")}<span><b>往後移一天</b></span></button>`}
        <button type="submit" name="_action" value="delete" class="list-btn danger">${icon("trash")}<span><b>刪除這一天</b><small>${day.items.length} 個行程會一起刪除，可以復原</small></span></button>
      </div>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "儲存標題", value: "save", variant: "primary" }],
    onAction(v, d) {
      if (v === "cancel") return;
      if (str(d.title)) day.title = str(d.title);
      if (v === "copy-other") { setTimeout(() => openCopyToTrip(i), 50); return; }
      if (v === "sort") {
        const before = day.items.slice();
        day.items = sortByDistance(day.items);
        const missing = day.items.filter(x => x.lat == null).length;
        saveTrip(); refresh();
        toast(missing ? `已重新排序（${missing} 個沒有座標的放在最後）` : "已依順路重新排序", {
          action: { label: "復原", fn: () => { day.items = before; saveTrip(); refresh(); } }
        });
        return;
      }
      if (v === "up" || v === "down") {
        const j = v === "up" ? i - 1 : i + 1;
        [tripData.days[i], tripData.days[j]] = [tripData.days[j], tripData.days[i]];
      }
      if (v === "delete") {
        tripData.days.splice(i, 1);
        saveTrip(); refresh();
        toast(`已刪除 ${day.title}`, { action: { label: "復原", fn: () => { tripData.days.splice(i, 0, day); saveTrip(); refresh(); } } });
        return;
      }
      saveTrip(); refresh();
    }
  });
};

// ===== 把口袋名單加入某天 =====

function addBackupToDay(backup, dayIndex, position) {
  const day = tripData.days[dayIndex];
  if (!day) return;
  const item = normalizeItem({
    text: backup.name, note: backup.note, lat: backup.lat, lng: backup.lng,
    placeId: backup.placeId, backupId: backup.id
  });
  const pos = position == null ? day.items.length : position;
  day.items.splice(pos, 0, item);
  prefs.expanded[day.id] = true;
  saveTrip(); savePrefs(); refresh();
  toast(`已把「${backup.name}」加入 Day ${dayIndex + 1}`, {
    action: { label: "復原", fn: () => { day.items.splice(day.items.indexOf(item), 1); saveTrip(); refresh(); } }
  });
}

/** 補座標後存檔（背景執行，不擋畫面） */
async function enrichAndSave(targets, { silent = true } = {}) {
  if (!targets.some(t => t.lat == null)) return 0;
  const found = await enrichTargets(targets, tripData.meta.region);
  if (found) { saveTrip(); refresh(); }
  if (!silent) toast(found ? `已補上 ${found} 個地點的座標` : "這次沒有找到新的座標");
  return found;
}

// ===== 建立一日遊 =====

function openDayTripSheet() {
  openSheet({
    title: "建立一日遊",
    body: `
      ${field({ name: "title", label: "名稱", placeholder: "例：九份金瓜石一日遊", autofocus: true })}
      ${field({ name: "region", label: "目的地", placeholder: "例：九份、台中", hint: "用來提高地點定位的準確度" })}
      ${field({ name: "date", label: "日期", type: "date", value: toISODate(new Date()) })}
      <div class="field-row">
        ${field({ name: "depart", label: "出發時間", type: "time" })}
        ${field({ name: "ret", label: "回程時間", type: "time", hint: "例如末班車，當天會倒數提醒" })}
      </div>
      <p class="field-hint">會建立成一個新行程，目前的行程不受影響。</p>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "建立", value: "create", variant: "primary" }],
    onAction(v, d) {
      if (v !== "create") return;
      const date = isISODate(d.date) ? d.date : toISODate(new Date());
      const slash = date.replace(/-/g, "/");
      const region = str(d.region);
      const t = createTrip({
        meta: { title: str(d.title) || `${region}一日遊`, region, startDate: date },
        flight: {
          depart: d.depart ? `${slash} ${d.depart} 出發` : "",
          return: d.ret ? `${slash} ${d.ret} 回程` : ""
        },
        days: [{ title: "一日遊", items: [] }]
      });
      todaySel = null;
      setView("plan");
      toast("一日遊建立好了，開始新增行程，或從口袋名單挑幾個吧", {
        action: { label: "復原", fn: () => { deleteTrip(t.id); refresh(); } }
      });
    }
  });
}
ACTIONS["daytrip-new"] = () => openDayTripSheet();
