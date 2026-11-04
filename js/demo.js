// =========================================
// demo.js — 範例行程（第一次使用時可以先看看效果）
// 日期以「今天」為第 2 天，打開就能體驗「今天」頁
// =========================================

function demoTrip() {
  const start = addDays(toISODate(new Date()), -1);
  return {
    meta: { title: "範例：台南 3 天 2 夜", region: "台南", startDate: start },
    flight: { depart: `${start.replace(/-/g, "/")} 08:03 高鐵 0803 台北→台南`, return: `${addDays(start, 2).replace(/-/g, "/")} 17:35 高鐵 1735 台南→台北` },
    hotels: [{ name: "晶英酒店", address: "台南市中西區中山路89號", dates: "入住 2 晚", code: "AB123", phone: "06-213-6290", note: "15:00 後 Check-in" }],
    info: { codes: "奇美博物館門票（已買，出示 QR Code）", emergency: "旅平險客服 0800-000-000", notes: "" },
    days: [
      { title: "Day1 中西區", items: [
        { time: "10:00", text: "赤崁樓", done: true, lat: 22.9975, lng: 120.2025 },
        { time: "12:00", text: "阿堂鹹粥", note: "虱目魚肚粥", done: true, lat: 22.9867, lng: 120.1975 },
        { time: "15:00", text: "林百貨", done: true, lat: 22.9917, lng: 120.2006 }
      ] },
      { title: "Day2 安平", items: [
        { time: "09:30", text: "安平古堡", lat: 23.0015, lng: 120.1606 },
        { time: "11:00", text: "安平樹屋", note: "和古堡買套票比較划算", lat: 23.0035, lng: 120.1593 },
        { time: "13:00", text: "周氏蝦捲", lat: 22.9998, lng: 120.1688 },
        { time: "18:00", text: "花園夜市", note: "只有週四、六、日", lat: 23.0109, lng: 120.2063 }
      ] },
      { title: "Day3 回程", items: [
        { time: "10:00", text: "奇美博物館", lat: 22.9346, lng: 120.2264 }
      ] }
    ],
    backups: [
      { name: "蜷尾家甘味處", category: "cafe", area: "中西區", note: "季節限定霜淇淋", priority: "must", source: "https://www.instagram.com/", lat: 22.9935, lng: 120.1975 },
      { name: "國華街小吃", category: "food", area: "中西區", note: "富盛號碗粿、邱家小卷米粉", priority: "must", lat: 22.9935, lng: 120.1985 },
      { name: "文章牛肉湯", category: "food", area: "安平", priority: "must", lat: 22.9985, lng: 120.1830 },
      { name: "神農街", category: "sight", area: "中西區", note: "晚上點燈後比較好拍", lat: 22.9973, lng: 120.1966 },
      { name: "台南市美術館二館", category: "sight", area: "中西區", rainy: true, lat: 22.9906, lng: 120.2016 },
      { name: "正興街", category: "shop", area: "中西區", status: "visited", lat: 22.9939, lng: 120.1973 }
    ]
  };
}

/** 一日遊範例：日期是今天，可以體驗回程倒數與空檔提示 */
function demoDayTrip() {
  const today = toISODate(new Date());
  const slash = today.replace(/-/g, "/");
  return {
    meta: { title: "範例：九份金瓜石一日遊", region: "新北市瑞芳區", startDate: today },
    flight: { depart: `${slash} 08:10 台鐵 自強號 台北→瑞芳`, return: `${slash} 20:10 區間車 基隆→台北（末班 22:30）` },
    info: { notes: "悠遊卡記得加值，788 公車可刷卡" },
    days: [{ title: "一日遊", items: [
      { time: "09:00", text: "瑞芳車站", note: "轉 788 公車往九份", lat: 25.1088, lng: 121.8060 },
      { time: "10:00", text: "九份老街", note: "阿柑姨芋圓、豎崎路拍照", lat: 25.1097, lng: 121.8448 },
      { time: "13:00", text: "黃金博物館", note: "摸金磚，週一休館", lat: 25.1076, lng: 121.8580 },
      { time: "16:00", text: "陰陽海", lat: 25.1205, lng: 121.8593 },
      { time: "18:00", text: "基隆廟口夜市", note: "營養三明治、鼎邊趖", lat: 25.1283, lng: 121.7432 }
    ] }],
    backups: [
      { name: "阿妹茶樓", category: "cafe", area: "九份", note: "神隱少女場景", priority: "must", lat: 25.1092, lng: 121.8446 },
      { name: "九份茶坊", category: "cafe", area: "九份", rainy: true, lat: 25.1094, lng: 121.8450 },
      { name: "黃金瀑布", category: "sight", area: "金瓜石", lat: 25.1167, lng: 121.8611 },
      { name: "祈堂老街", category: "sight", area: "金瓜石", lat: 25.1063, lng: 121.8555 },
      { name: "連珍芋泥球", category: "food", area: "基隆", priority: "must", lat: 25.1290, lng: 121.7415 }
    ]
  };
}

function loadDemo(kind) {
  replaceTrip(kind === "day" ? demoDayTrip() : demoTrip());
  prefs.expanded = {};
  savePrefs();
  todaySel = null;
  setView("today");
  toast("已載入範例行程，可以隨意點點看", { action: { label: "復原", fn: () => { restorePrevTrip(); refresh(); } } });
}

ACTIONS["load-demo"] = el => loadDemo(el.dataset.kind);

ACTIONS["demo-pick"] = () => {
  openSheet({
    title: "看看範例行程",
    body: `<div class="sheet-list">
      <button type="submit" name="_action" value="day" class="list-btn">${icon("sun")}<span><b>一日遊：九份金瓜石</b><small>今天出發，體驗回程倒數與空檔提示</small></span></button>
      <button type="submit" name="_action" value="multi" class="list-btn">${icon("calendar")}<span><b>多日旅行：台南 3 天 2 夜</b><small>今天是第 2 天，體驗切換天數與住宿資訊</small></span></button>
    </div>
    ${tripData.days.length ? `<p class="field-hint">目前的行程會被取代，可以在「工具 → 復原上一版行程」找回。</p>` : ""}`,
    actions: [{ label: "取消", value: "cancel", variant: "ghost" }],
    onAction(v) { if (v === "day" || v === "multi") loadDemo(v); }
  });
};
