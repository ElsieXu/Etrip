// =========================================
// guide.js — 導覽：歡迎卡片、情境小提示、示範模式、使用說明
// 原則：不跳出擋畫面的視窗；提示是頁面裡的小卡片，一次最多一個、看過就不再出現。
// =========================================

// ===== 情境小提示 =====
const TIPS = [
  { id: "pocket-radar", view: "pocket", when: () => true,
    text: "看到心動的旅遊影片？點「從 YouTube 影片或文章抓地點」貼上網址，AI 會幫你找出店家和景點。" },
  { id: "pocket-menu", view: "pocket", when: () => library.backups.length > 0,
    text: "點地點右邊的 ⋯ 可以導航、排進行程；臨時去了就按「打卡」，會記進當天行程，還能評分。" },
  { id: "pocket-area", view: "pocket", when: () => areaCounts().length >= 2,
    text: "收藏多了，用上面的地區按鈕只看某個城市；「這趟附近」只列出這次行程會經過的地方。" },
  { id: "today-nearby", view: "today", when: () => tripPhase() === "during",
    text: "「附近的口袋名單」依距離排好，按「用我的位置」看離你最近的；花了錢就按右下角「＋記帳」。" },
  { id: "plan-edit", view: "plan", when: () => tripData.days.some(d => d.items.length),
    text: "點行程可以編輯、換到別天、記花費；按住左邊的 ⠿ 可以拖曳排序。" },
  { id: "plan-trips", view: "plan", when: () => library.trips.length >= 2,
    text: "點最上面的行程名稱，可以切換或新增行程，過去的旅行也都在那裡。" }
];

// 已經在使用的人：更新後不顯示小提示（只給新使用者和示範模式）
(() => {
  if (prefs.tipsInit) return;
  prefs.tipsInit = 1;
  if (!DEMO && (library.trips.length || library.backups.length)) {
    prefs.tips = Object.fromEntries(TIPS.map(t => [t.id, 1]));
    prefs.welcomeSeen = true;
  }
  savePrefs();
})();

/** 這一頁要顯示的提示（只挑第一個還沒看過的） */
function tipHTML(view) {
  if (DEMO && !prefs.demoTourDone) return "";
  const seen = prefs.tips || {};
  const tip = TIPS.find(t => t.view === view && !seen[t.id] && (() => { try { return t.when(); } catch (e) { return false; } })());
  if (!tip) return "";
  return `
  <div class="tip-card" role="note">
    <span class="tip-icon">💡</span>
    <p>${esc(tip.text)}</p>
    <button class="btn sm ghost" data-action="tip-dismiss" data-id="${tip.id}">知道了</button>
  </div>`;
}

ACTIONS["tip-dismiss"] = el => {
  prefs.tips = { ...(prefs.tips || {}), [el.dataset.id]: 1 };
  savePrefs();
  refresh();
};

// ===== 歡迎卡片（第一次打開、還沒有任何資料時） =====
function welcomeHTML() {
  return `
  <div class="empty-state welcome">
    <div class="empty-art">${icon("pin")}</div>
    <h2>歡迎使用 Etrip</h2>
    <p>行前做功課，旅途隨心走。下面三個分頁是這樣用的：</p>
    ${guideListHTML()}
    <div class="empty-actions">
      <button class="btn primary" data-action="demo-enter">${icon("sparkles")}先看範例（示範模式）</button>
      <button class="btn" data-action="welcome-done">直接開始</button>
    </div>
    <p class="empty-foot">示範模式的資料不會存進你自己的行程，隨時可以離開。</p>
  </div>`;
}

function guideListHTML() {
  return `
    <ul class="guide-list">
      <li>${icon("sun")}<div><b>今天</b><span>旅途中打開，看下一站、天氣，還有附近的口袋名單</span></div></li>
      <li>${icon("calendar")}<div><b>行程</b><span>規劃每一天；貼上機票或筆記，AI 幫你整理</span></div></li>
      <li>${icon("bookmark")}<div><b>口袋</b><span>看到想去的地方先收藏，旅途中再看心情挑</span></div></li>
    </ul>`;
}

ACTIONS["welcome-done"] = () => {
  prefs.welcomeSeen = true;
  savePrefs();
  refresh();
};

// ===== 使用說明（工具頁可以再看一次） =====
ACTIONS["guide-open"] = () => {
  openSheet({
    title: "Etrip 怎麼用",
    body: `
      ${guideListHTML()}
      <h4 class="sheet-group">幾個好用的小技巧</h4>
      <ul class="guide-tips">
        ${TIPS.map(t => `<li>${esc(t.text)}</li>`).join("")}
        <li>電腦整理、手機帶著走：到「工具 → 雲端同步」開啟同步碼。</li>
      </ul>`,
    actions: [{ label: "重新顯示小提示", value: "reset", variant: "ghost" }, { label: "知道了", value: "ok", variant: "primary" }],
    onAction(v) {
      if (v !== "reset") return;
      prefs.tips = {};
      savePrefs();
      toast("小提示會在各頁重新出現一次");
    }
  });
};

// ===== 示範模式 =====
// 用「網址#demo」打開時進入。資料存在另一個位置（demo: 開頭），不會動到自己的行程，也不能雲端同步。

function demoLink() { return `${location.origin}${location.pathname}#demo`; }

ACTIONS["demo-enter"] = () => {
  location.hash = "demo";
  location.reload();
};

ACTIONS["demo-exit"] = () => {
  try {
    Object.keys(localStorage).filter(k => k.startsWith("demo:")).forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem("etrip_demo");
  } catch (e) { /* ignore */ }
  location.replace(location.pathname + location.search);
};

// 示範導覽：每一頁最上方一張說明卡，帶朋友走過四個分頁
const DEMO_STEPS = [
  { view: "today", title: "旅途中的「今天」",
    text: "旅行當天打開就是這頁：下一站和導航、回程倒數、天氣，往下滑還有「附近的口袋名單」。試著按「完成」，下一站會自動換。" },
  { view: "pocket", title: "收藏想去的地方",
    text: "平常看到想去的店家或景點就收藏，貼 YouTube 影片網址，AI 也會幫你找出地點。點任一個地點的 ⋯，試試「打卡」。" },
  { view: "plan", title: "規劃每一天",
    text: "每天的行程、住宿與交通、行李清單、花費都在這裡。點一個行程可以編輯，旅行結束後還能打分數寫心得。" },
  { view: "tools", title: "更多工具",
    text: "貼上機票或筆記讓 AI 整理行程、雲端同步讓電腦和手機資料一致、換配色。看完了就開始建立自己的行程吧！" }
];

function renderDemoBanner() {
  const box = $("#demoBanner");
  if (!box) return;
  if (!DEMO) { box.innerHTML = ""; return; }
  const k = DEMO_STEPS.findIndex(st => st.view === currentView);
  if (prefs.demoTourDone || k < 0) {
    box.innerHTML = `
    <div class="demo-banner" role="note">
      <span>👀 <b>示範模式</b>：隨意點點看，這裡的資料不會存進你自己的行程</span>
      ${prefs.demoTourDone ? `<button class="btn sm ghost" data-action="demo-tour-restart">重看導覽</button>` : ""}
      <button class="btn sm" data-action="demo-exit">離開示範</button>
    </div>`;
    return;
  }
  const st = DEMO_STEPS[k];
  const next = DEMO_STEPS[k + 1];
  box.innerHTML = `
  <section class="demo-tour" aria-live="polite">
    <div class="demo-tour-head">
      <span class="demo-tour-step">示範導覽 ${k + 1} / ${DEMO_STEPS.length}</span>
      <span class="demo-dots">${DEMO_STEPS.map((_, j) => `<i class="${j === k ? "on" : ""}"></i>`).join("")}</span>
      <button class="link-btn" data-action="demo-exit">離開示範</button>
      <button class="icon-btn sm" data-action="demo-tour-end" aria-label="關閉導覽">${icon("x")}</button>
    </div>
    <h2>${esc(st.title)}</h2>
    <p>${esc(st.text)}</p>
    <div class="btn-row">
      ${next
        ? `<button class="btn primary" data-action="go" data-view="${next.view}">下一步：${esc(next.title)} →</button>`
        : `<button class="btn primary" data-action="demo-exit">開始建立我的行程</button>`}
      ${k > 0 ? `<button class="btn ghost" data-action="go" data-view="${DEMO_STEPS[k - 1].view}">← 上一步</button>` : ""}
    </div>
  </section>`;
}

ACTIONS["demo-tour-end"] = () => { prefs.demoTourDone = 1; savePrefs(); renderDemoBanner(); };
ACTIONS["demo-tour-restart"] = () => { prefs.demoTourDone = 0; savePrefs(); setView("today"); };

/** 進入示範模式時放入兩個範例行程 */
function setupDemo() {
  if (!DEMO || library.trips.length) return;
  addDemoTrip("multi");
  const day = addDemoTrip("day");
  selectTrip(day.id);
  prefs.view = "today";
  savePrefs();
}

// ===== 分享給朋友 =====
ACTIONS["demo-share"] = async () => {
  const url = demoLink();
  if (navigator.share) {
    try { await navigator.share({ title: "Etrip 旅遊筆記", text: "這是我在用的旅遊筆記工具，點連結就能先玩看看範例：", url }); return; } catch (e) { /* 取消就改用複製 */ }
  }
  toast((await copyText(url)) ? "已複製示範連結，貼給朋友就可以了" : "複製失敗");
};

function guideCardHTML() {
  return `
  <section class="card">
    <div class="card-head"><h2>${icon("info")}使用說明與分享</h2></div>
    <p class="muted small">忘記某個功能在哪裡，可以再看一次說明。想推薦給朋友，傳示範連結給他，點開就能直接玩範例，不會影響他自己的資料。</p>
    <div class="btn-row">
      <button class="btn" data-action="guide-open">${icon("info")}看使用說明</button>
      <button class="btn primary-soft" data-action="demo-share">${icon("share")}分享示範給朋友</button>
    </div>
    <p class="field-hint">示範連結：<span class="selectable">${esc(demoLink())}</span></p>
  </section>`;
}
