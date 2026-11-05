// =========================================
// safety.js — 防止資料遺失
// 資料只存在瀏覽器時提醒開啟雲端同步；iPhone 的 Safari 可能在大約 7 天沒打開網站後清掉資料，
// 加到主畫面或開啟雲端同步就不會有這個問題。
// =========================================

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPadOS 會偽裝成 Mac

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function hasWorthKeeping() {
  return library.trips.length >= 1 || library.backups.length >= 3;
}

function safetyRisk() {
  if (syncEnabled() || !hasWorthKeeping()) return null;
  if (prefs.safetyLater && Date.now() - prefs.safetyLater < 7 * 86400000) return null;
  return isIOS && !isStandalone() ? "ios" : "local";
}

function renderSafetyBanner() {
  const box = $("#safetyBanner");
  if (!box) return;
  const risk = safetyRisk();
  if (risk && navigator.storage?.persist && !prefs.persistAsked) {
    // 請瀏覽器盡量保留資料（不一定會答應，也不會跳出詢問）
    navigator.storage.persist().catch(() => {});
    prefs.persistAsked = true;
    savePrefs();
  }
  if (!risk || !["today", "plan"].includes(currentView)) { box.innerHTML = ""; return; }
  box.innerHTML = `
  <div class="safety-banner ${risk}" role="note">
    <span class="safety-icon">${icon("info")}</span>
    <div class="safety-text">
      <b>${risk === "ios" ? "iPhone 的 Safari 可能會清掉你的行程" : "行程目前只存在這個瀏覽器"}</b>
      <span>${risk === "ios"
        ? "大約 7 天沒打開，Safari 可能會清掉網站資料。開啟雲端同步就不會不見。"
        : "換手機或清除瀏覽器資料時會不見，開啟雲端同步就安全了。"}</span>
      <div class="btn-row">
        <button class="btn sm primary" data-action="safety-sync">${icon("refresh")}開啟雲端同步</button>
        ${risk === "ios" ? `<button class="btn sm" data-action="safety-install">${icon("phoneDevice")}加到主畫面</button>` : ""}
        <button class="btn sm ghost" data-action="safety-later">稍後提醒</button>
      </div>
    </div>
  </div>`;
}

ACTIONS["safety-sync"] = async el => {
  setBusy(el, true, "開啟中…");
  try {
    await createSyncCode();
    renderSafetyBanner();
    showSyncCodeSheet("雲端同步已開啟");
  } catch (e) {
    setBusy(el, false);
    toast(`開啟失敗：${e.message}`);
  }
};

ACTIONS["safety-install"] = () => {
  if (window._installPrompt) return ACTIONS["install"]();
  openSheet({
    title: "加到主畫面",
    body: `
      <ol class="steps">
        <li>用 <b>Safari</b> 打開 Etrip（其他瀏覽器沒有這個選項）</li>
        <li>點畫面下方的「分享」按鈕 ${icon("share")}</li>
        <li>往下滑，選「<b>加入主畫面</b>」</li>
        <li>之後從主畫面的 Etrip 圖示打開，資料就不會被清掉，沒網路也能看行程</li>
      </ol>
      <p class="field-hint">加到主畫面後，裡面是一份新的資料。建議先開啟雲端同步，再到主畫面的 Etrip 輸入同步碼，就能把資料帶過去。</p>`,
    actions: [{ label: "知道了", value: "ok", variant: "primary" }]
  });
};

ACTIONS["safety-later"] = () => {
  prefs.safetyLater = Date.now();
  savePrefs();
  renderSafetyBanner();
  toast("好，7 天後再提醒你");
};
