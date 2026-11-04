// =========================================
// expenses.js — 記帳：金額、幣別、分類、付款方式；外幣自動換算台幣
// =========================================

let expShowAll = false;

function expenseTWD(e) {
  if (e.currency === "TWD") return { v: e.amount, approx: false };
  if (e.twd != null) return { v: e.twd, approx: false };
  const v = toTWD(e.amount, e.currency);
  return { v, approx: true };
}

function sumExpenses(list) {
  let total = 0, approx = false, missing = 0;
  for (const e of list) {
    const r = expenseTWD(e);
    if (r.v == null) { missing++; continue; }
    total += r.v;
    if (r.approx) approx = true;
  }
  return { total, approx, missing };
}

/** 依幣別分開加總，例如 { JPY: 8000, TWD: 350 } */
function sumByCurrency(list) {
  const out = {};
  for (const e of list) out[e.currency] = (out[e.currency] || 0) + e.amount;
  return out;
}
function fmtCurrencySums(sums) {
  return Object.entries(sums).sort(([a], [b]) => (a === "TWD") - (b === "TWD")).map(([c, v]) => fmtMoney(v, c)).join(" + ");
}

function dayIndexById(id) { return tripData.days.findIndex(d => d.id === id); }

function radioChips(name, options, value) {
  return `<div class="radio-chips" role="radiogroup">${Object.entries(options).map(([k, o]) =>
    `<label class="rchip"><input type="radio" name="${name}" value="${k}" ${k === value ? "checked" : ""}><span>${o.icon} ${esc(o.label)}</span></label>`).join("")}</div>`;
}

// ===== 新增 / 編輯 =====

function openExpenseSheet({ expense = null, dayIndex = null, place = "" } = {}) {
  const t = tripData;
  const isNew = !expense;
  const localCur = tripCurrency(t);
  const curOptions = [...new Set([localCur && localCur !== "TWD" ? localCur : null, "TWD", expense?.currency].filter(Boolean))];
  const ti = todayIndex();
  const di = expense ? dayIndexById(expense.dayId) : dayIndex != null ? dayIndex : ti >= 0 ? ti : 0;
  const e = expense || normalizeExpense({
    currency: prefs.lastCurrency?.[t.id] || curOptions[0],
    method: prefs.lastMethod || "cash",
    category: "food",
    place
  });
  const dayOpts = t.days.map((d, i) => ({ value: d.id, label: `${dayLabel(i)}　${d.title}` }));
  const placeNames = [...new Set([...t.days.flatMap(d => d.items.map(x => x.text)), ...library.backups.map(b => b.name)])];

  openSheet({
    title: isNew ? "記一筆" : "編輯花費",
    body: `
      <div class="field-row amount-row">
        ${field({ name: "amount", label: "金額", type: "number", value: isNew ? "" : e.amount, required: true, autofocus: true, placeholder: "0" })}
        ${curOptions.length > 1 ? field({ name: "currency", label: "幣別", type: "select", value: e.currency, options: curOptions.map(c => ({ value: c, label: `${currencyName(c)} ${c}` })) })
          : `<input type="hidden" name="currency" value="${esc(curOptions[0])}">`}
      </div>
      <p class="field-hint" id="expConv"></p>
      <span class="field-label">分類</span>
      ${radioChips("category", EXPENSE_CATS, e.category)}
      <span class="field-label">付款方式</span>
      ${radioChips("method", PAY_METHODS, e.method)}
      ${dayOpts.length ? field({ name: "dayId", label: "哪一天", type: "select", value: t.days[Math.max(0, di)]?.id, options: dayOpts }) : ""}
      ${field({ name: "place", label: "地點（選填）", value: e.place, placeholder: "例：阿妹茶樓" })}
      <datalist id="placeList">${placeNames.map(n => `<option value="${esc(n)}">`).join("")}</datalist>
      ${field({ name: "note", label: "備註（選填）", value: e.note, placeholder: "例：芋圓兩碗" })}`,
    actions: [
      ...(isNew ? [] : [{ label: "刪除", value: "delete", variant: "danger" }]),
      { label: "取消", value: "cancel", variant: "ghost" },
      { label: "儲存", value: "save", variant: "primary" }
    ],
    onAction(v, d) {
      if (v === "delete") {
        const idx = t.expenses.indexOf(expense);
        t.expenses.splice(idx, 1);
        saveTrip(); refresh();
        toast("已刪除這筆花費", { action: { label: "復原", fn: () => { t.expenses.splice(idx, 0, expense); saveTrip(); refresh(); } } });
        return;
      }
      if (v !== "save") return;
      const amount = Math.round(parseFloat(d.amount) * 100) / 100;
      if (!(amount > 0)) { toast("請輸入金額"); return false; }
      const cur = d.currency || "TWD";
      Object.assign(e, {
        amount, currency: cur, category: d.category || "other", method: d.method || "cash",
        dayId: d.dayId || "", place: str(d.place), note: str(d.note)
      });
      // 記下當時的匯率換算（之後匯率變動也不影響這筆）
      if (isNew || e.twd == null || expense.amount !== amount || expense.currency !== cur) e.twd = cur === "TWD" ? amount : toTWD(amount, cur);
      if (isNew) t.expenses.push(e);
      prefs.lastMethod = e.method;
      prefs.lastCurrency = { ...(prefs.lastCurrency || {}), [t.id]: cur };
      saveTrip(); savePrefs(); refresh();
      if (isNew) toast(`已記下 ${fmtMoney(amount, cur)}`);
    }
  });
  const placeInput = $("#f_place");
  if (placeInput) placeInput.setAttribute("list", "placeList");
  const amountInput = $("#f_amount");
  if (amountInput) { amountInput.step = "any"; amountInput.inputMode = "decimal"; amountInput.min = "0"; }
  updateExpConv();
}

function updateExpConv() {
  const box = $("#expConv");
  if (!box) return;
  const v = parseFloat($("#f_amount")?.value);
  const cur = $("#sheetForm [name=currency]")?.value || "TWD";
  if (cur === "TWD" || isNaN(v)) { box.textContent = ""; return; }
  const twd = toTWD(v, cur);
  box.textContent = twd == null ? "目前沒有匯率，連上網路後會自動換算" : `約 ${fmtMoney(twd, "TWD")}`;
}
document.addEventListener("input", e => { if (e.target.closest("#sheetForm") && e.target.matches("#f_amount")) updateExpConv(); });
document.addEventListener("change", e => { if (e.target.closest("#sheetForm") && e.target.matches("[name=currency]")) updateExpConv(); });

ACTIONS["exp-add"] = el => openExpenseSheet({ dayIndex: el.dataset.day != null ? +el.dataset.day : null, place: el.dataset.place || "" });
ACTIONS["exp-edit"] = el => {
  const e = tripData.expenses.find(x => x.id === el.dataset.id);
  if (e) openExpenseSheet({ expense: e });
};
ACTIONS["exp-all"] = () => { expShowAll = !expShowAll; refresh(); };

// ===== 顯示 =====

function expenseRowHTML(e) {
  const r = expenseTWD(e);
  const title = e.place || e.note || EXPENSE_CATS[e.category].label;
  return `
  <button class="exp-row" data-action="exp-edit" data-id="${e.id}">
    <span class="exp-icon">${EXPENSE_CATS[e.category].icon}</span>
    <span class="exp-main"><b>${esc(title)}</b><small>${PAY_METHODS[e.method].icon} ${PAY_METHODS[e.method].label}${e.place && e.note ? ` · ${esc(e.note)}` : ""}</small></span>
    <span class="exp-amt"><b>${fmtMoney(e.amount, e.currency)}</b>${e.currency !== "TWD" && r.v != null ? `<small>≈ ${fmtMoney(r.v, "TWD")}</small>` : ""}</span>
  </button>`;
}

/** 「行程」頁的花費卡片 */
function expensesCardHTML() {
  const list = tripData.expenses;
  const head = `
    <div class="card-head">
      <h2>${icon("wallet")}花費</h2>
      <button class="btn sm primary-soft" data-action="exp-add">${icon("plus")}記一筆</button>
    </div>`;
  if (!list.length) {
    return `<section class="card exp-card">${head}<p class="muted small">還沒有記帳。旅途中隨手記一筆，回來就知道這趟花了多少、現金用了多少。</p></section>`;
  }
  const s = sumExpenses(list);
  // 依付款方式（分幣別）
  const methods = Object.keys(PAY_METHODS).map(m => {
    const items = list.filter(e => e.method === m);
    return items.length ? `<div class="exp-method"><span>${PAY_METHODS[m].icon} ${PAY_METHODS[m].label}</span><b>${fmtCurrencySums(sumByCurrency(items))}</b></div>` : "";
  }).join("");
  // 依分類（台幣）
  const cats = Object.keys(EXPENSE_CATS).map(c => ({ c, v: sumExpenses(list.filter(e => e.category === c)).total })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
  const max = Math.max(...cats.map(x => x.v), 1);
  // 依天分組（新的在前）
  const sorted = list.slice().sort((a, b) => (dayIndexById(b.dayId) - dayIndexById(a.dayId)) || (b.createdAt - a.createdAt));
  const shown = expShowAll ? sorted : sorted.slice(0, 5);
  let lastDay = null;
  const rows = shown.map(e => {
    const di = dayIndexById(e.dayId);
    let h = "";
    if (di !== lastDay) { lastDay = di; h = `<h4 class="exp-day">${di >= 0 ? `${dayLabel(di)}　小計 ${fmtMoney(sumExpenses(list.filter(x => x.dayId === e.dayId)).total, "TWD")}` : "未指定日期"}</h4>`; }
    return h + expenseRowHTML(e);
  }).join("");

  return `
  <section class="card exp-card">
    ${head}
    <div class="exp-total">
      <span class="muted small">這趟共花了${s.approx ? "（約）" : ""}</span>
      <b>${fmtMoney(s.total, "TWD")}</b>
      <span class="muted small">${list.length} 筆${s.missing ? `・${s.missing} 筆外幣等待匯率換算` : ""}</span>
    </div>
    <div class="exp-methods">${methods}</div>
    <div class="exp-cats">${cats.map(x => `
      <div class="exp-cat"><span>${EXPENSE_CATS[x.c].icon} ${EXPENSE_CATS[x.c].label}</span>
        <span class="bar"><i style="width:${Math.max(4, Math.round(x.v / max * 100))}%"></i></span>
        <b>${fmtMoney(x.v, "TWD")}</b></div>`).join("")}
    </div>
    <div class="exp-list">${rows}</div>
    ${list.length > 5 ? `<button class="btn sm ghost block" data-action="exp-all">${expShowAll ? "收合" : `看全部 ${list.length} 筆`}</button>` : ""}
  </section>`;
}

/** 「今天」頁的精簡版 */
function todayExpenseHTML(dayIndex) {
  const day = tripData.days[dayIndex];
  if (!day) return "";
  const list = tripData.expenses.filter(e => e.dayId === day.id);
  const s = sumExpenses(list);
  const cash = list.filter(e => e.method === "cash");
  return `
  <section class="card exp-card compact">
    <div class="card-head">
      <h2>${icon("wallet")}${dayIndex === todayIndex() ? "今天" : `Day ${dayIndex + 1}`}的花費</h2>
      <button class="btn sm primary-soft" data-action="exp-add" data-day="${dayIndex}">${icon("plus")}記一筆</button>
    </div>
    ${list.length ? `
      <div class="exp-total"><b>${fmtMoney(s.total, "TWD")}</b><span class="muted small">${list.length} 筆${cash.length ? `・現金 ${fmtCurrencySums(sumByCurrency(cash))}` : ""}</span></div>
      <div class="exp-list">${list.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 3).map(expenseRowHTML).join("")}</div>`
      : `<p class="muted small">隨手記下每一筆，旅行結束就知道花了多少。</p>`}
  </section>`;
}
