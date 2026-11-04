// =========================================
// today.js — 「今天」頁：旅途中打開就看到今天、下一站、附近的口袋名單
// =========================================

let todaySel = null;          // 目前查看第幾天
let nearCat = "all";          // 附近口袋名單的分類篩選
let nearRainy = false;        // 只看雨天備案

function renderToday() {
  const el = $("#view-today");
  const days = tripData.days;
  if (!days.length) { el.innerHTML = emptyStateHTML(); return; }

  const ti = todayIndex();
  const phase = tripPhase();
  if (todaySel == null || todaySel >= days.length) todaySel = ti >= 0 ? ti : 0;
  const i = todaySel;
  const day = days[i];
  const next = day.items.find(x => !x.done);

  // 頂部狀態
  let banner = "";
  const single = days.length === 1;
  if (phase === "before") {
    const n = daysBetween(toISODate(new Date()), dayDate(0));
    banner = `<div class="banner">${icon(single ? "sun" : "plane")}<span>出發前預覽 · ${n === 1 ? "<b>明天</b>就出發" : `還有 <b>${n}</b> 天出發`}</span></div>`;
  } else if (phase === "after") {
    banner = `<div class="banner muted">${icon("check")}<span>旅程已經結束，補上評分和心得，留個紀錄吧</span><button class="btn sm" data-action="go" data-view="plan">看回顧</button></div>`;
  } else if (phase === "undated") {
    banner = `<div class="banner muted">${icon("calendar")}<span>還沒設定出發日，設定後打開網站就會自動跳到當天</span><button class="btn sm" data-action="trip-settings">設定</button></div>`;
  } else if (ti >= 0 && i !== ti) {
    banner = `<div class="banner">${icon("calendar")}<span>正在看 Day ${i + 1}，今天是 Day ${ti + 1}</span><button class="btn sm" data-action="today-pick" data-i="${ti}">回到今天</button></div>`;
  }

  const chips = days.map((d, j) => {
    const date = dayDate(j);
    return `<button class="day-chip ${j === i ? "active" : ""} ${j === ti ? "is-today" : ""}" data-action="today-pick" data-i="${j}">
      <b>D${j + 1}</b><small>${date ? formatDateLabel(date).replace(/（.）/, "") : esc(d.title).slice(0, 6)}</small>
    </button>`;
  }).join("");

  const doneCount = day.items.filter(x => x.done).length;
  const dayName = single ? "這趟" : `Day ${i + 1}`;
  const ret = i === ti ? returnToday() : null;
  const retHTML = ret ? `<p class="return-chip">${icon("clock")}回程 ${esc(ret.time)} · ${esc(ret.countdown || "時間到了，準備出發")}</p>` : "";

  // 時間軸：接下來第一個超過 2 小時的空檔，提示可以看看附近的口袋名單（只顯示一個，避免太雜）
  const rows = [];
  const nextIdx = next ? day.items.indexOf(next) : day.items.length;
  let gapShown = false;
  day.items.forEach((it, k) => {
    if (!gapShown && k > 0 && k - 1 >= nextIdx) {
      const a = timeToMin(day.items[k - 1].time), b = timeToMin(it.time);
      if (a != null && b != null && b - a >= 120) {
        gapShown = true;
        rows.push(`<li class="gap-row"><button data-action="scroll-nearby">${icon("bookmark")}到下一站前有 ${formatDuration(b - a)}，看看附近的口袋名單</button></li>`);
      }
    }
    rows.push(`
          <li class="tl-item ${it.done ? "done" : ""} ${next && it.id === next.id ? "current" : ""}">
            <button class="check" data-action="item-done" data-day="${i}" data-id="${it.id}" aria-label="${it.done ? "取消完成" : "標記完成"}" aria-pressed="${it.done}">${icon("check")}</button>
            <button class="tl-main" data-action="item-edit" data-day="${i}" data-id="${it.id}">
              ${it.time ? `<span class="item-time">${esc(it.time)}</span>` : ""}
              <span class="item-text">${esc(it.text)}</span>
              ${it.note ? `<span class="item-note">${esc(it.note)}</span>` : ""}
            </button>
            <a class="icon-btn" href="${esc(mapsNavUrl(it))}" target="_blank" rel="noopener" aria-label="導航到 ${esc(it.text)}">${icon("nav")}</a>
          </li>`);
  });

  el.innerHTML = `
  <div class="today-layout">
    <div class="today-main">
      ${banner}
      ${single ? "" : `<div class="day-chips" role="tablist">${chips}</div>`}
      ${weatherRowHTML(i)}

      <section class="card next-card">
        ${next ? `
          <p class="eyebrow">${i === ti ? "下一站" : single ? "第一站" : `Day ${i + 1} 第一個未完成`}</p>
          <h2 class="next-title">${esc(next.text)}</h2>
          <p class="next-meta">${next.time ? `<span>${icon("clock")}${esc(next.time)}</span>` : ""}${next.note ? `<span>${esc(next.note)}</span>` : ""}</p>
          ${retHTML}
          <div class="next-actions">
            <a class="btn primary lg" href="${esc(mapsNavUrl(next))}" target="_blank" rel="noopener">${icon("nav")}導航過去</a>
            <button class="btn lg" data-action="item-done" data-day="${i}" data-id="${next.id}">${icon("check")}完成</button>
          </div>` : day.items.length ? `
          <p class="eyebrow">${dayName}</p>
          <h2 class="next-title">今天的行程都完成了 🎉</h2>
          <p class="muted">還有時間的話，看看下面附近的口袋名單吧。</p>${retHTML}` : `
          <p class="eyebrow">${dayName}</p>
          <h2 class="next-title">${single ? "還沒有排行程" : "這天還沒有排行程"}</h2>
          <p class="muted">隨心所欲的一天！從下方的口袋名單挑幾個吧。</p>
          <button class="btn" data-action="item-add" data-day="${i}">${icon("plus")}新增行程</button>`}
      </section>

      <section class="card">
        <div class="card-head">
          <h2>${icon("calendar")}${esc(day.title)}<span class="muted small">${doneCount}/${day.items.length}</span></h2>
          <div class="row-gap">
            ${dayRouteButtonHTML(i)}
            <button class="icon-btn" data-action="item-add" data-day="${i}" title="新增行程" aria-label="新增行程">${icon("plus")}</button>
          </div>
        </div>
        <ol class="timeline">
          ${rows.join("") || `<li class="muted small">沒有行程</li>`}
        </ol>
      </section>
    </div>

    <div class="today-side">
      ${todayExpenseHTML(i)}
      ${currencyCardHTML()}
      ${nearbyCardHTML(day, next)}
      ${infoCardHTML({ compact: true })}
    </div>
  </div>`;
}

/** 附近的口袋名單：有定位就用目前位置，沒有就用下一站 / 當天最後一站 */
function nearbyCardHTML(day, next) {
  const me = cachedPosition();
  let origin = null, originLabel = "";
  if (me) { origin = me; originLabel = "你目前的位置"; }
  else if (next && next.lat != null) { origin = next; originLabel = `「${next.text}」`; }
  else {
    const last = lastCoordItem(day);
    if (last) { origin = last; originLabel = `「${last.text}」`; }
  }

  let list = tripData.backups.filter(b => b.status !== "visited");
  if (nearCat !== "all") list = list.filter(b => b.category === nearCat);
  if (nearRainy) list = list.filter(b => b.rainy);
  list = list.map(b => ({ b, d: origin && b.lat != null ? haversine(origin.lat, origin.lng, b.lat, b.lng) : null }));
  list.sort((x, y) => (x.d ?? Infinity) - (y.d ?? Infinity) || (y.b.priority === "must") - (x.b.priority === "must"));
  const shown = list.slice(0, 6);

  const cats = [["all", "全部"], ...Object.entries(CATEGORIES).map(([k, v]) => [k, `${v.icon} ${v.label}`])];

  return `
  <section class="card nearby-card" id="nearbyCard">
    <div class="card-head">
      <h2>${icon("bookmark")}附近的口袋名單</h2>
      <button class="btn sm ${me ? "ghost" : "primary-soft"}" data-action="locate" data-then="today">${icon("locate")}${me ? "更新位置" : "用我的位置"}</button>
    </div>
    <p class="muted small">${origin ? `距離${esc(originLabel)}由近到遠` : "按「用我的位置」就能看到離你最近的收藏"}</p>
    <div class="chip-row">
      ${cats.map(([k, label]) => `<button class="chip ${nearCat === k ? "active" : ""}" data-action="near-cat" data-v="${k}">${label}</button>`).join("")}
      <button class="chip ${nearRainy ? "active" : ""}" data-action="near-rainy">🌧 雨天備案</button>
    </div>
    <ul class="near-list">
      ${shown.map(({ b, d }) => `
      <li class="near-item">
        <span class="poi-icon sm">${CATEGORIES[b.category].icon}</span>
        <div class="near-main">
          <span class="near-name">${esc(b.name)}${b.priority === "must" ? `<span class="must" title="必去">${icon("star")}</span>` : ""}</span>
          <span class="near-meta">${d != null ? formatKm(d) : "沒有座標"}${b.area ? ` · ${esc(b.area)}` : ""}${b.note ? ` · ${esc(b.note)}` : ""}</span>
        </div>
        <a class="icon-btn" href="${esc(mapsNavUrl(b))}" target="_blank" rel="noopener" aria-label="導航到 ${esc(b.name)}">${icon("nav")}</a>
        <button class="icon-btn" data-action="backup-to-day" data-id="${b.id}" data-day="${todaySel}" aria-label="加入這天">${icon("plus")}</button>
      </li>`).join("") || `<li class="muted small">${tripData.backups.length ? "沒有符合條件的地點" : "口袋名單還是空的，到「口袋」分頁收藏想去的地方吧"}</li>`}
    </ul>
    ${list.length > shown.length ? `<button class="btn sm ghost block" data-action="go" data-view="pocket">看全部 ${list.length} 個 →</button>` : ""}
  </section>`;
}

ACTIONS["today-pick"] = el => { todaySel = +el.dataset.i; renderToday(); };
ACTIONS["near-cat"] = el => { nearCat = el.dataset.v; renderToday(); };
ACTIONS["near-rainy"] = () => { nearRainy = !nearRainy; renderToday(); };

ACTIONS["locate"] = async el => {
  setBusy(el, true, "定位中…");
  try {
    await getMyPosition({ force: true });
    if (el.dataset.then === "pocket") { prefs.pocket.sort = "near"; savePrefs(); }
    refresh();
  } catch (e) {
    setBusy(el, false);
    toast(e.message);
  }
};

ACTIONS["backup-to-day"] = el => {
  const b = findBackup(el.dataset.id);
  if (b) addBackupToDay(b, +el.dataset.day);
};

ACTIONS["scroll-nearby"] = () => $("#nearbyCard")?.scrollIntoView({ behavior: "smooth", block: "start" });

/** 天氣：16 天內才有預報；降雨機率高時提醒看雨天備案 */
function weatherRowHTML(i) {
  const date = dayDate(i);
  if (!date) return "";
  const ahead = daysBetween(toISODate(new Date()), date);
  if (ahead < 0) return "";
  if (ahead > 15) return `<p class="weather-row muted">${icon("sun")}出發前兩週內會顯示天氣預報</p>`;
  const w = dayWeather(tripData, i);
  if (!w) return "";
  const info = wmoInfo(w.code);
  const rainy = w.pop >= 60;
  return `
  <div class="weather-row ${rainy ? "rainy" : ""}">
    <span class="wx-icon">${info.icon}</span>
    <span class="wx-main"><b>${esc(info.text)} ${w.max}° / ${w.min}°</b><small>降雨機率 ${w.pop ?? "—"}%${tripData.meta.region ? ` · ${esc(tripData.meta.region)}` : ""}</small></span>
    ${rainy ? `<button class="btn sm" data-action="rain-backup">${icon("umbrella")}看雨天備案</button>` : ""}
  </div>`;
}

ACTIONS["rain-backup"] = () => {
  nearRainy = true;
  renderToday();
  $("#nearbyCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
};
