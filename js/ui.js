// =========================================
// ui.js — 圖示、提示訊息、底部面板（sheet）、事件分派、共用元件
// =========================================

// ===== 圖示（線條風格 SVG） =====
const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  bookmark: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  nav: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4M12 2v13"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17 21h4v-4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>',
  bed: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
  ticket: '<path d="M2 9a3 3 0 0 0 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 0 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  phoneDevice: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="M12 12l6.5-6.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'
};

function icon(name, cls = "") {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

// ===== 提示訊息（toast），可附「復原」按鈕 =====
function toast(message, { action, duration = 3200 } = {}) {
  const box = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = action.label;
    btn.onclick = () => { action.fn(); el.remove(); };
    el.appendChild(btn);
  }
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, action ? Math.max(duration, 5000) : duration);
  return el;
}

// ===== 底部面板 / 對話框 =====
/**
 * openSheet({ title, body, actions, onAction })
 * actions: [{ label, value, variant: "primary" | "danger" | "ghost" }]
 * onAction(value, data, form) 回傳 false 可保持開啟
 */
let _sheetHandler = null;
let _sheetDefault = null;

function openSheet({ title, body, actions = [], onAction, wide = false }) {
  const dlg = $("#sheet");
  $("#sheetTitle").textContent = title || "";
  $("#sheetBody").innerHTML = body || "";
  $("#sheetFooter").innerHTML = actions.map((a, i) =>
    `<button type="submit" name="_action" value="${esc(a.value)}" class="btn ${a.variant || ""}" ${a.variant === "primary" ? "" : "formnovalidate"} style="order:${a.variant === "primary" ? 9 : i}">${esc(a.label)}</button>`
  ).join("");
  $("#sheetFooter").hidden = !actions.length;
  dlg.classList.toggle("wide", wide);
  _sheetHandler = onAction || null;
  // 在輸入框按 Enter 時要觸發的動作（主要按鈕）
  _sheetDefault = (actions.find(a => a.variant === "primary") || {}).value ?? null;
  if (!dlg.open) dlg.showModal();
  // 自動聚焦第一個欄位（手機上不自動跳鍵盤）
  const first = $("#sheetBody [autofocus]");
  if (first && window.matchMedia("(pointer: fine)").matches) first.focus();
}

function closeSheet() {
  const dlg = $("#sheet");
  if (dlg.open) dlg.close();
  _sheetHandler = null;
}

function initSheet() {
  const dlg = $("#sheet");
  const form = $("#sheetForm");
  form.addEventListener("submit", e => {
    e.preventDefault();
    let value = e.submitter?.value;
    if (value === "__default" || value == null) {
      // Enter 送出：沒有主要按鈕就什麼都不做
      if (_sheetDefault == null) return;
      value = _sheetDefault;
    }
    const data = Object.fromEntries(new FormData(form));
    $$("input[type=checkbox]", form).forEach(cb => {
      if (!cb.name) return;
      if (cb.dataset.multi) data[cb.name] = $$(`input[name="${cb.name}"]:checked`, form).map(x => x.value);
      else data[cb.name] = cb.checked;
    });
    const result = _sheetHandler ? _sheetHandler(value, data, form) : undefined;
    if (result !== false) closeSheet();
  });
  dlg.addEventListener("click", e => {
    if (e.target === dlg || e.target.closest("[data-close]")) closeSheet();
  });
}

// 表單欄位小幫手
function field({ name, label, value = "", type = "text", placeholder = "", required = false, autofocus = false, hint = "", rows = 3, options }) {
  let input;
  const common = `name="${esc(name)}" id="f_${esc(name)}" ${required ? "required" : ""} ${autofocus ? "autofocus" : ""} placeholder="${esc(placeholder)}"`;
  if (type === "textarea") input = `<textarea ${common} rows="${rows}">${esc(value)}</textarea>`;
  else if (type === "select") input = `<select ${common}>${options.map(o =>
    `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
  else input = `<input type="${type}" ${common} value="${esc(value)}">`;
  return `<label class="field" for="f_${esc(name)}"><span class="field-label">${esc(label)}</span>${input}${hint ? `<span class="field-hint">${esc(hint)}</span>` : ""}</label>`;
}

function toggleField({ name, label, checked }) {
  return `<label class="toggle-field"><input type="checkbox" name="${esc(name)}" ${checked ? "checked" : ""}><span>${esc(label)}</span></label>`;
}

// ===== 事件分派：所有按鈕用 data-action，不再用 onclick 字串 =====
const ACTIONS = {};
const FORMS = {};

function initEvents() {
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if (!el || el.closest("#sheetFooter")) return;
    const fn = ACTIONS[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener("submit", e => {
    const f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    FORMS[f.dataset.form]?.(f, e);
  });
}

// ===== 載入中按鈕 =====
function setBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${esc(text || "處理中…")}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

// ===== 共用元件 =====

function emptyStateHTML() {
  return `
  <div class="empty-state">
    <div class="empty-art">${icon("plane")}</div>
    <h2>開始規劃你的旅程</h2>
    <p>把機票、訂房信、或隨手記的行程貼上來，AI 會幫你整理成每天的行程。也可以先收藏想去的地方，之後再排。</p>
    <div class="empty-actions">
      <button class="btn primary" data-action="go" data-view="tools" data-focus="#rawInput">${icon("sparkles")}貼上行程讓 AI 整理</button>
      <button class="btn" data-action="daytrip-new">${icon("sun")}建立一日遊</button>
      <button class="btn" data-action="day-add">${icon("calendar")}手動建立多日行程</button>
      <button class="btn ghost" data-action="go" data-view="pocket">${icon("bookmark")}先收藏口袋名單</button>
      <button class="btn ghost" data-action="demo-pick">${icon("sparkles")}先看看範例行程</button>
    </div>
    <p class="empty-foot">電腦上已經整理好了？在電腦上點「工具 → 同步到手機」，用手機掃 QR Code 就能帶走。</p>
  </div>`;
}

/** 行程資訊卡：交通、住宿、重要資訊（compact = 今天頁的精簡版） */
function infoCardHTML({ compact = false } = {}) {
  const f = tripData.flight, info = tripData.info;
  const legs = [["去程", f.depart], ["回程", f.return]].filter(([, v]) => v);
  const legHTML = legs.map(([label, v]) => {
    const dt = legInfo(v);
    const cd = dt ? countdownText(dt.date, dt.time) : "";
    return `<div class="info-row">
      <span class="info-key">${label}</span>
      <span class="info-val">${esc(v)}${cd ? `<span class="countdown">${esc(cd)}</span>` : ""}</span>
    </div>`;
  }).join("");

  const hotelHTML = tripData.hotels.map(h => `
    <div class="hotel">
      <button class="hotel-main" data-action="hotel-edit" data-id="${h.id}">
        <span class="hotel-name">${esc(h.name || "（未命名住宿）")}</span>
        ${h.dates ? `<span class="hotel-sub">${esc(h.dates)}</span>` : ""}
        ${h.address && !compact ? `<span class="hotel-sub">${esc(h.address)}</span>` : ""}
      </button>
      <div class="hotel-actions">
        ${h.code ? `<button class="chip-btn" data-action="copy" data-text="${esc(h.code)}" title="複製訂房代號">${icon("copy")}${esc(h.code)}</button>` : ""}
        ${h.phone ? `<a class="icon-btn" href="tel:${esc(h.phone.replace(/[^\d+]/g, ""))}" title="撥打電話" aria-label="撥打電話">${icon("phone")}</a>` : ""}
        ${(h.address || h.name) ? `<a class="icon-btn" href="${esc(mapsNavUrl({ name: h.address || h.name }))}" target="_blank" rel="noopener" title="導航到住宿" aria-label="導航到住宿">${icon("nav")}</a>` : ""}
      </div>
    </div>`).join("");

  const memo = [["訂位 / 票券", info.codes], ["緊急聯絡", info.emergency], ["備忘", info.notes]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="info-row"><span class="info-key">${k}</span><span class="info-val pre">${esc(v)}</span></div>`).join("");

  const empty = !legs.length && !tripData.hotels.length && !memo;
  const dayTrip = isDayTrip();
  return `
  <section class="card info-card ${compact ? "compact" : ""}">
    <div class="card-head">
      <h2>${icon("ticket")}行程資訊</h2>
      <button class="btn sm ghost" data-action="info-edit">${icon("edit")}編輯</button>
    </div>
    ${empty ? `<p class="muted">${dayTrip
      ? "還沒有交通資訊。填上回程時間（例如末班車），當天會幫你倒數。"
      : "還沒有交通、住宿或訂位資訊。旅途中最常需要翻找的資料，建議先放在這裡。"}</p>` : ""}
    ${legHTML ? `<div class="info-group">${icon("plane", "info-icon")}<div class="info-rows">${legHTML}</div></div>` : ""}
    ${hotelHTML ? `<div class="info-group">${icon("bed", "info-icon")}<div class="info-rows">${hotelHTML}</div></div>` : ""}
    ${memo ? `<div class="info-group">${icon("info", "info-icon")}<div class="info-rows">${memo}</div></div>` : ""}
    ${dayTrip && !tripData.hotels.length ? "" : `<div class="card-foot">
      <button class="btn sm ghost" data-action="hotel-add">${icon("plus")}新增住宿</button>
    </div>`}
  </section>`;
}

// ===== 行程資訊編輯 =====

ACTIONS["info-edit"] = () => {
  const f = tripData.flight, info = tripData.info;
  openSheet({
    title: "編輯行程資訊",
    body: `
      ${field({ name: "depart", label: "去程交通", value: f.depart, autofocus: true,
        placeholder: isDayTrip() ? "例：08:10 台鐵 自強號 台北→瑞芳" : "例：2025/11/20 08:30 CI120 桃園→那霸、或 高鐵 0803 車次" })}
      ${field({ name: "ret", label: "回程交通", value: f.return,
        placeholder: isDayTrip() ? "例：20:10 區間車 基隆→台北（末班車 22:30）" : "例：2025/11/24 18:30 CI121" })}
      ${field({ name: "codes", label: "訂位代號 / 票券", value: info.codes, type: "textarea", placeholder: "機票訂位代號、租車、門票、餐廳訂位…" })}
      ${field({ name: "emergency", label: "緊急聯絡", value: info.emergency, type: "textarea", placeholder: "旅平險客服、信用卡掛失、駐外辦事處電話…" })}
      ${field({ name: "notes", label: "其他備忘", value: info.notes, type: "textarea" })}
      <p class="field-hint">${isDayTrip() ? "寫上時間（例如 17:35）就會自動倒數，回程當天頁首會提醒你還剩多久。" : "去回程有寫日期與時間（例如 11/20 08:30）就會自動倒數。"}</p>`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "儲存", value: "save", variant: "primary" }],
    onAction(v, d) {
      if (v !== "save") return;
      tripData.flight.depart = str(d.depart);
      tripData.flight.return = str(d.ret);
      tripData.info = { codes: str(d.codes), emergency: str(d.emergency), notes: str(d.notes) };
      if (!tripData.meta.startDate) tripData.meta.startDate = inferStartDate(tripData);
      saveTrip();
      refresh();
      toast("已儲存行程資訊");
    }
  });
};

function openHotelSheet(hotel) {
  const isNew = !hotel;
  const h = hotel || normalizeHotel({});
  openSheet({
    title: isNew ? "新增住宿" : "編輯住宿",
    body: `
      ${field({ name: "name", label: "名稱", value: h.name, required: true, autofocus: true })}
      ${field({ name: "dates", label: "入住期間", value: h.dates, placeholder: "例：11/20–11/22（2 晚）" })}
      ${field({ name: "address", label: "地址", value: h.address, hint: "導航會用地址，比名稱更準確" })}
      ${field({ name: "phone", label: "電話", value: h.phone, type: "tel" })}
      ${field({ name: "code", label: "訂房代號", value: h.code })}
      ${field({ name: "note", label: "備註", value: h.note, type: "textarea", placeholder: "Check-in 時間、早餐、停車…" })}`,
    actions: [
      ...(isNew ? [] : [{ label: "刪除", value: "delete", variant: "danger" }]),
      { label: "取消", value: "cancel", variant: "ghost" },
      { label: "儲存", value: "save", variant: "primary" }
    ],
    onAction(v, d) {
      if (v === "delete") {
        const idx = tripData.hotels.indexOf(hotel);
        tripData.hotels.splice(idx, 1);
        saveTrip(); refresh();
        toast("已刪除住宿", { action: { label: "復原", fn: () => { tripData.hotels.splice(idx, 0, hotel); saveTrip(); refresh(); } } });
        return;
      }
      if (v !== "save") return;
      Object.assign(h, {
        name: str(d.name), dates: str(d.dates), address: str(d.address),
        phone: str(d.phone), code: str(d.code), note: str(d.note)
      });
      if (isNew) tripData.hotels.push(h);
      saveTrip(); refresh();
    }
  });
}
ACTIONS["hotel-add"] = () => openHotelSheet(null);
ACTIONS["hotel-edit"] = el => openHotelSheet(tripData.hotels.find(h => h.id === el.dataset.id));

ACTIONS["copy"] = async el => {
  const ok = await copyText(el.dataset.text || "");
  toast(ok ? "已複製" : "複製失敗");
};

// ===== 行程設定（名稱、目的地、出發日） =====

function openTripSettings() {
  const m = tripData.meta;
  openSheet({
    title: "行程設定",
    body: `
      ${field({ name: "title", label: "行程名稱", value: m.title, placeholder: "例：沖繩 5 天 4 夜", autofocus: true })}
      ${field({ name: "region", label: "目的地（城市 / 地區）", value: m.region, placeholder: "例：沖繩、台南", hint: "用來提高地點定位的準確度" })}
      ${field({ name: "startDate", label: "出發日（Day 1）", value: m.startDate, type: "date", hint: "之後每一天的日期會自動往後推算" })}`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }, { label: "儲存", value: "save", variant: "primary" }],
    onAction(v, d) {
      if (v !== "save") return;
      const newStart = isISODate(d.startDate) ? d.startDate : "";
      if (newStart !== m.startDate) tripData.days.forEach(day => { day.date = ""; });
      m.title = str(d.title);
      m.region = str(d.region);
      m.startDate = newStart;
      saveTrip();
      refresh();
      toast("已更新行程設定");
    }
  });
}
ACTIONS["trip-settings"] = () => openTripSettings();
