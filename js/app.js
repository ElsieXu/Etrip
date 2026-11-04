// =========================================
// app.js — 啟動、分頁切換、頁首、PWA
// =========================================

const VIEWS = {
  today:  { label: "今天", icon: "sun",      render: () => renderToday() },
  plan:   { label: "行程", icon: "calendar", render: () => renderPlan() },
  pocket: { label: "口袋", icon: "bookmark", render: () => renderPocket() },
  tools:  { label: "工具", icon: "sliders",  render: () => renderTools() }
};

let currentView = "plan";

function setView(v, { scroll = true } = {}) {
  if (!VIEWS[v]) v = "plan";
  currentView = v;
  prefs.view = v;
  savePrefs();
  $$(".view").forEach(s => { s.hidden = s.dataset.view !== v; });
  $$("[data-nav]").forEach(b => {
    const on = b.dataset.nav === v;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  refresh();
  if (scroll) window.scrollTo({ top: 0 });
}

/** 資料變動後重新畫目前的頁面 */
function refresh() {
  renderHeader();
  VIEWS[currentView].render();
}

function renderHeader() {
  const m = tripData.meta;
  const n = tripData.days.length;
  const phase = tripPhase();
  let status = "";
  if (phase === "before") {
    const dep = legInfo(tripData.flight.depart);
    const cd = dep && dep.date === dayDate(0) ? countdownText(dep.date, dep.time) : countdownText(dayDate(0));
    status = `<span class="pill primary">${esc(cd || "即將出發")}</span>`;
  } else if (phase === "during") {
    const ret = returnToday();
    if (ret) status = `<span class="pill accent">${ret.countdown ? "回程" + esc(ret.countdown) : "回程時間到了"}</span>`;
    else status = `<span class="pill accent">${n === 1 ? "今天出發" : `旅途中 · Day ${todayIndex() + 1}/${n}`}</span>`;
  } else if (phase === "after") {
    status = `<span class="pill">已結束</span>`;
  }
  const range = n ? tripRangeLabel(tripData) : "";

  $("#tripHeader").innerHTML = `
    <button class="trip-title" data-action="trip-list" title="切換或新增行程">
      <span class="trip-name">${esc(m.title || (n ? "我的旅程" : "還沒有行程"))}${icon("chevron", "title-chev")}</span>
      ${range ? `<span class="trip-range">${range}</span>` : `<span class="trip-range">行前功課 × 旅途隨行</span>`}
    </button>
    ${status}`;

  // 工具分頁：雲端同步有修改還沒上傳時顯示小點
  updateSyncIndicators();
  // 口袋分頁顯示數量
  $$('[data-nav="pocket"] .nav-count').forEach(c => { c.textContent = tripData.backups.length || ""; });
}

function buildNav() {
  const html = Object.entries(VIEWS).map(([k, v]) => `
    <button class="nav-btn" data-nav="${k}" data-action="go" data-view="${k}">
      ${icon(v.icon)}<span>${v.label}</span>${k === "pocket" ? '<span class="nav-count"></span>' : ""}
    </button>`).join("");
  $("#bottomNav").innerHTML = html;
  $("#topNav").innerHTML = html;
}

ACTIONS["go"] = el => {
  setView(el.dataset.view);
  if (el.dataset.focus) setTimeout(() => $(el.dataset.focus)?.focus(), 50);
};

function initialView() {
  const phase = tripPhase();
  if (phase === "during") return "today";
  if (phase === "empty" && !tripData.backups.length) return "plan";
  return VIEWS[prefs.view] && prefs.view !== "today" ? prefs.view : "plan";
}

function init() {
  // 正在旅途中的行程優先打開
  if (tripPhase() !== "during") {
    const during = library.trips.find(t => tripPhaseOf(t) === "during");
    if (during) selectTrip(during.id);
  }
  buildNav();
  initSheet();
  initEvents();
  setView(initialView(), { scroll: false });
  checkIncomingLink();
  // 網站已經開著時點同步連結，只會改變 #hash，不會重新載入
  window.addEventListener("hashchange", checkIncomingLink);
  initSync();

  // 每分鐘更新倒數；切回網站時如果換日了就重畫
  let lastDay = toISODate(new Date());
  setInterval(() => {
    renderHeader();
    const now = toISODate(new Date());
    if (now !== lastDay) { lastDay = now; todaySel = null; if (!$("#sheet").open) refresh(); }
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !$("#sheet").open) {
      if (toISODate(new Date()) !== lastDay) { lastDay = toISODate(new Date()); todaySel = null; }
      refresh();
    }
  });
  window.addEventListener("online", () => toast("網路已連線"));
  window.addEventListener("offline", () => toast("目前離線，仍然可以查看與編輯行程"));

  // PWA：安裝提示與離線快取
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    window._installPrompt = e;
    if (currentView === "tools") refresh();
  });
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(err => console.warn("Service worker 註冊失敗", err));
  }
}

init();
