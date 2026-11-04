// =========================================
// packing.js — 行李清單：一日遊 / 國內多日 / 國外範本，可存成自己的範本
// =========================================

const PACK_TEMPLATES = {
  day: { label: "一日遊", items: ["手機", "行動電源", "充電線", "錢包 / 悠遊卡", "衛生紙 / 濕紙巾", "水壺", "雨傘", "防曬乳", "薄外套", "零錢"] },
  domestic: { label: "國內多日", items: ["身分證", "健保卡", "手機", "行動電源", "充電器", "錢包 / 悠遊卡", "換洗衣物", "睡衣", "盥洗用品", "保養品", "常備藥品", "雨具", "防曬乳", "拖鞋", "塑膠袋", "耳機"] },
  abroad: { label: "國外", items: ["護照", "簽證 / 入境資料", "機票 / 登機證", "網卡 / eSIM", "當地現金", "信用卡", "轉接頭", "行動電源", "充電器", "手機", "換洗衣物", "盥洗用品", "保養品", "常備藥品", "旅平險資料", "訂房確認信", "原子筆（填入境卡）", "耳機", "雨具", "防曬乳"] }
};

const _packOpen = {};   // 每個行程的清單展開狀態（只記在這次開啟）

function suggestedPackType(t = tripData) {
  if (t.days.length === 1) return "day";
  return isAbroad(t) ? "abroad" : "domestic";
}
function templateItems(type) {
  return library.templates?.[type]?.items || PACK_TEMPLATES[type].items;
}

function packingCardHTML() {
  const t = tripData;
  const list = t.packing;
  const suggest = suggestedPackType(t);
  if (!list.length) {
    return `
    <section class="card pack-card">
      <div class="card-head"><h2>${icon("suitcase")}行李清單</h2></div>
      <p class="muted small">從範本開始，再依這趟旅行增減。</p>
      <div class="btn-row">
        ${Object.entries(PACK_TEMPLATES).map(([k, v]) =>
          `<button class="btn sm ${k === suggest ? "primary-soft" : ""}" data-action="pack-apply" data-type="${k}">${esc(v.label)}${library.templates?.[k] ? "（我的）" : ""}</button>`).join("")}
      </div>
    </section>`;
  }
  const done = list.filter(p => p.done).length;
  const phase = tripPhase();
  const open = _packOpen[t.id] ?? (phase !== "during" && done < list.length);
  return `
  <details class="card collapsible-card pack-card" ${open ? "open" : ""} data-pack-trip="${t.id}">
    <summary>
      <h2>${icon("suitcase")}行李清單<span class="muted small">${done}/${list.length}</span></h2>
      <span class="pack-progress"><i style="width:${Math.round(done / list.length * 100)}%"></i></span>
      ${icon("chevron", "chev")}
    </summary>
    <div class="collapsible-body">
      <div class="pack-list">
        ${list.map(p => `
        <div class="pack-row ${p.done ? "done" : ""}">
          <button class="pack-check" data-action="pack-toggle" data-id="${p.id}" aria-pressed="${p.done}">${icon("check")}<span>${esc(p.text)}</span></button>
          <button class="icon-btn sm" data-action="pack-del" data-id="${p.id}" aria-label="刪除 ${esc(p.text)}">${icon("x")}</button>
        </div>`).join("")}
      </div>
      <form class="quick-add sm" data-form="pack-add">
        <input name="text" placeholder="新增物品…" autocomplete="off" aria-label="新增行李物品">
        <button class="icon-btn" type="submit" aria-label="新增">${icon("plus")}</button>
      </form>
      <div class="btn-row">
        <button class="btn sm ghost" data-action="pack-save-template" data-type="${suggest}">存成我的「${PACK_TEMPLATES[suggest].label}」範本</button>
        ${done ? `<button class="btn sm ghost" data-action="pack-reset">全部取消打勾</button>` : ""}
      </div>
    </div>
  </details>`;
}

// 記住展開 / 收合
document.addEventListener("toggle", e => {
  const d = e.target;
  if (d.matches && d.matches("[data-pack-trip]")) _packOpen[d.dataset.packTrip] = d.open;
}, true);

ACTIONS["pack-apply"] = el => {
  const type = el.dataset.type;
  tripData.packing = templateItems(type).map(text => normalizePackItem({ text }));
  _packOpen[tripData.id] = true;
  saveTrip(); refresh();
  toast(`已套用「${PACK_TEMPLATES[type].label}」清單`);
};

ACTIONS["pack-toggle"] = el => {
  const p = tripData.packing.find(x => x.id === el.dataset.id);
  if (!p) return;
  p.done = !p.done;
  saveTrip(); refresh();
};

ACTIONS["pack-del"] = el => {
  const list = tripData.packing;
  const idx = list.findIndex(x => x.id === el.dataset.id);
  if (idx < 0) return;
  const [p] = list.splice(idx, 1);
  saveTrip(); refresh();
  toast(`已刪除「${p.text}」`, { action: { label: "復原", fn: () => { list.splice(idx, 0, p); saveTrip(); refresh(); } } });
};

ACTIONS["pack-reset"] = () => {
  tripData.packing.forEach(p => { p.done = false; });
  saveTrip(); refresh();
};

ACTIONS["pack-save-template"] = el => {
  const type = el.dataset.type;
  library.templates = library.templates || {};
  library.templates[type] = { items: tripData.packing.map(p => p.text), updatedAt: Date.now() };
  saveTrip();
  toast(`已存成你的「${PACK_TEMPLATES[type].label}」範本，下次直接套用`);
};

FORMS["pack-add"] = form => {
  const input = form.querySelector("input[name=text]");
  const text = str(input.value);
  if (!text) return;
  tripData.packing.push(normalizePackItem({ text }));
  input.value = "";
  saveTrip(); refresh();
  setTimeout(() => $('form[data-form="pack-add"] input')?.focus(), 0);
};
