// --- 狀態管理 ---
// 用來記錄哪些天數是展開的，避免重新渲染時自動縮合
let expandedDays = {};
// ===== render 行程 =====
function renderTrip() {
    let html = "";

    // 1. 渲染航班卡片
    html += `
    <div class="card">
        <h2>✈️ 航班</h2>
        <p style="color:#c0392b">${getFlightCountdown()}</p>
        <p style="color:#16a34a">${getReturnCountdown()}</p>
        <p>${tripData.flight.depart || ""}</p>
        <p>${tripData.flight.return || ""}</p>
    </div>
    `;

    // 2. 渲染飯店卡片 (支援複數飯店)
    html += `
    <div class="card">
        <h2>🏨 住宿資訊</h2>
        ${(tripData.hotels || []).map(h => `
            <div style="margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                <p style="font-size: 18px; font-weight: bold; margin: 4px 0;">${h.name || ""}</p>
                <p style="color: #666; margin: 4px 0;">📍 ${h.address || ""}</p>
            </div>
        `).join("")}
    </div>
    `;

    // 3. 渲染每日行程
    tripData.days.forEach((day, dayIndex) => {
        const isExpanded = expandedDays[dayIndex] ? "block" : "none";

        html += `
        <div class="card">
            <div class="collapsible" onclick="toggleDay(${dayIndex})">
                ${day.title} ${expandedDays[dayIndex] ? '▼' : '▶'}
            </div>
            
            <button onclick="openDayMap(${dayIndex})" style="background:#059669; margin: 10px 0; width: 100%; font-weight: bold;">
                🗺️ 一鍵生成路線
            </button>

            <div class="content sortable" id="day-${dayIndex}" style="display: ${isExpanded}">
                ${(day.items || []).map((item, itemIndex) => `
                    <div class="timeline-item" data-day="${dayIndex}" data-index="${itemIndex}">
                        <div><b>${item.time || ""}</b> ${item.text}</div>
                        ${item.note ? `<div style="color:#64748b;font-size:13px; margin-top:2px;">📝 ${item.note}</div>` : ""}
                        <div class="timeline-actions">
                            <button onclick="editItem(${dayIndex},${itemIndex})">編輯</button>
                            <button onclick="addNote(${dayIndex},${itemIndex})">備註</button>
                            <button onclick="deleteItem(${dayIndex},${itemIndex})">刪除</button>
                        </div>
                    </div>
                `).join("")}
            </div>
        </div>
        `;
    });

    document.getElementById("result").innerHTML = html;

    // 初始化拖曳排序 (SortableJS)
    document.querySelectorAll(".sortable").forEach((el, dayIndex) => {
        Sortable.create(el, {
            animation: 150,
            onEnd: function (evt) {
                const list = tripData.days[dayIndex].items;
                const moved = list.splice(evt.oldIndex, 1)[0];
                list.splice(evt.newIndex, 0, moved);
                saveTrip();
                renderTrip();
            }
        });
    });
}

// 新增切換函式
function toggleDay(index) {
    expandedDays[index] = !expandedDays[index];
    renderTrip(); // 重新渲染以套用樣式
}

// ===== 備案池 =====

async function addBackup() {
    const input = document.getElementById("backupInput");
    const value = input.value.trim();
    if (!value) return;

    // 1. 先把基本資料加進去（預設 null）
    const newItem = {
        name: value,
        lat: null,
        lng: null,
        map: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
    };
    
    tripData.backups.push(newItem);
    input.value = "";
    saveTrip();
    renderBackups();

    // 2. ✅ 主動去抓座標 (呼叫 api.js 裡的定位功能)
    const enriched = await enrichLocations([{ text: value }]);
    if (enriched && enriched[0] && enriched[0].lat) {
        newItem.lat = enriched[0].lat;
        newItem.lng = enriched[0].lng;
        saveTrip();
        renderBackups(); // 抓到座標後重新渲染，公里數就會噴出來了！
    }
}

function deleteBackup(i) {
    tripData.backups.splice(i, 1);
    saveTrip();
    renderBackups();
}


// ===== render 備案 =====
// 計算兩點之間的直線距離 (單位：公里)
function getDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return null;
    // 簡易經緯度轉換公式
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function renderBackups() {
    const list = document.getElementById("backupList");
    list.innerHTML = "";

    tripData.backups.forEach((item, index) => {
        // 動態生成天數按鈕，支援任何天數 (Day1 ~ DayN)
        let dayButtons = "";
        tripData.days.forEach((day, dIndex) => {
            // 尋找該天最後一個有座標的點來計算距離
            const lastWithCoord = [...day.items].reverse().find(i => i.lat && i.lng);
            let distInfo = "";
            
            // 在 renderBackups 函式內修改這段：
            if (lastWithCoord && item.lat) {
                const d = getDistance(item.lat, item.lng, lastWithCoord.lat, lastWithCoord.lng);
                // ✅ 加大字體並改為白色，加上 bold 加粗
                distInfo = `<br><span style="font-size:12px; font-weight:600; color:#64748b; margin-top: 2px; display: inline-block;">${d.toFixed(1)}km</span>`;
            }

            dayButtons += `
                <button onclick="addToDay(${dIndex}, '${item.name.replace(/'/g, "\\'")}')" style="padding: 4px 8px;">
                    D${dIndex + 1}${distInfo}
                </button>`;
            });

        list.innerHTML += `
        <div class="backup-item">
            <div class="backup-header">
                <div class="backup-name">${item.name}</div>
                <div>
                    <a href="${item.map}" target="_blank" style="text-decoration:none; font-size: 14px; margin-right: 8px;">📍地圖</a>
                    <button onclick="deleteBackup(${index})" style="background:#fee2e2; color:#ef4444; padding: 4px 8px; font-size:12px;">刪除</button>
                </div>
            </div>
            <div class="backup-buttons">
                ${dayButtons}
            </div>
        </div>
        `;
    });
}

// ===== 刪除備案 =====

function deleteBackup(i){

 tripData.backups.splice(i,1)

 saveTrip()
 renderBackups()

}

// ===== 加入行程 =====

function addToDay(dayIndex, place) {
    if (!tripData.days[dayIndex]) return;
    
    // 找到備案中對應的座標資料
    const backupItem = tripData.backups.find(b => b.name === place) || {};

    tripData.days[dayIndex].items.push({
        time: "備案",
        text: place,
        lat: backupItem.lat || null,
        lng: backupItem.lng || null
    });

    saveTrip();
    renderTrip();
}

// --- 行程操作 ---

function deleteItem(dayIndex, itemIndex) {
    if (confirm("確定要刪除此行程嗎？")) {
        tripData.days[dayIndex].items.splice(itemIndex, 1);
        saveTrip();
        renderTrip();
    }
}

function editItem(dayIndex, itemIndex) {
    const item = tripData.days[dayIndex].items[itemIndex];
    const newTime = prompt("修改時間", item.time || "");
    if (newTime === null) return;
    const newText = prompt("修改內容", item.text || "");
    if (newText === null) return;

    item.time = newTime;
    item.text = newText;
    saveTrip();
    renderTrip();
}

function addNote(dayIndex, itemIndex) {
    const item = tripData.days[dayIndex].items[itemIndex];
    const note = prompt("新增備註", item.note || "");
    if (note !== null) {
        item.note = note;
        saveTrip();
        renderTrip();
    }
}

// --- 航班倒數邏輯 ---

function getFlightCountdown() {
    if (!tripData.flight.depart) return "";
    return calculateCountdown(tripData.flight.depart, "⏳ 距離出發航班");
}

function getReturnCountdown() {
    if (!tripData.flight.return) return "";
    return calculateCountdown(tripData.flight.return, "🏠 距離回程航班");
}

function calculateCountdown(rawText, label) {
    try {
        const parts = rawText.trim().split(" ");
        const datePart = parts.find(p => p.includes("/")) || "";
        const timePart = parts.find(p => p.includes(":")) || "";

        if (!datePart || !timePart) return "";

        const dateParts = datePart.split("/");
        let year = dateParts.length === 3 ? parseInt(dateParts[0]) : new Date().getFullYear();
        let month = parseInt(dateParts[dateParts.length === 3 ? 1 : 0]);
        let day = parseInt(dateParts[dateParts.length === 3 ? 2 : 1]);

        const [hour, minute] = timePart.split(":");
        const target = new Date(year, month - 1, day, parseInt(hour), parseInt(minute));
        const diff = target - new Date();

        if (diff <= 0) return "已過期";

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${label}：${hours}小時 ${mins}分`;
    } catch (e) {
        return "";
    }
}

// ===== 回程航班倒數 =====
function getReturnCountdown(){

 if(!tripData.flight.return) return ""

 const raw = tripData.flight.return.trim()

 try{

// ✅ 新解析方式（支援航班代碼）
const parts = raw.split(" ")

let datePart = ""
let timePart = ""

datePart = parts.find(p => p.includes("/")) || ""
timePart = parts.find(p => p.includes(":")) || ""

if(!datePart || !timePart) return ""
const dateParts = datePart.split("/")

  let year,month,day

  if(dateParts.length === 3){
   year = parseInt(dateParts[0])
   month = parseInt(dateParts[1])
   day = parseInt(dateParts[2])
  }else{
   year = new Date().getFullYear()
   month = parseInt(dateParts[0])
   day = parseInt(dateParts[1]) 
  }

  const [hour,minute]=timePart.split(":")

  const target=new Date(
   year,
   month-1,
   day,
   parseInt(hour),
   parseInt(minute)
  )

  const now=new Date()

  const diff=target-now

  if(diff<=0) return "已回程"

  const hours=Math.floor(diff/(1000*60*60))
  const mins=Math.floor((diff%(1000*60*60))/(1000*60))

  return `🏠 距離回程航班：${hours}小時 ${mins}分`

 }catch(e){
  return ""
 }

}
function editItem(dayIndex,itemIndex){

 const item = tripData.days[dayIndex].items[itemIndex]

 // 👉 先改時間
 const newTime = prompt("修改時間", item.time || "")
 if(newTime === null) return

 // 👉 再改內容
 const newText = prompt("修改內容", item.text || "")
 if(newText === null) return

 item.time = newTime
 item.text = newText

 saveTrip()
 renderTrip()

}

function addNote(dayIndex,itemIndex){

 const item=tripData.days[dayIndex].items[itemIndex]

 const note=prompt("新增備註",item.note||"")

 if(note!==null){

  item.note=note

  saveTrip()
  renderTrip()
 }

}

// --- 匯出功能 ---

function downloadTripTxt() {
    let content = `=== Etrip 旅遊行程備份 ===\n\n`;
    content += `【✈️ 航班】\n- 出發：${tripData.flight.depart || "未設定"}\n- 回程：${tripData.flight.return || "未設定"}\n\n`;
    content += `【🏨 住宿】\n- 名稱：${tripData.hotel.name || "未設定"}\n- 地址：${tripData.hotel.address || "未設定"}\n\n`;

    content += `【📅 詳細行程】\n`;
    tripData.days.forEach(day => {
        content += `--- ${day.title} ---\n`;
        day.items.forEach(item => {
            content += `• ${item.time || ""} ${item.text}`;
            if (item.note) content += ` (備註：${item.note})`;
            content += `\n`;
        });
        content += `\n`;
    });

    content += `【🧩 備案池】\n`;
    tripData.backups.forEach(item => {
        content += `- ${item.name} (${item.map})\n`;
    });

    content += `\n產出時間：${new Date().toLocaleString()}`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `My_Trip_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
}

function exportTrip() {
    let text = `✈️ 航班: ${tripData.flight.depart || ""}\n🏨 飯店: ${tripData.hotel.name || ""}\n\n`;
    tripData.days.forEach(day => {
        text += `[${day.title}]\n`;
        day.items.forEach(item => {
            text += `${item.time} ${item.text} ${item.note ? '(' + item.note + ')' : ''}\n`;
        });
        text += `\n`;
    });
    
    navigator.clipboard.writeText(text).then(() => alert("行程已複製到剪貼簿"));
}

// 一鍵生成該天所有景點的 Google Maps 路線
function openDayMap(dayIndex) {
    const day = tripData.days[dayIndex];
    if (!day || !day.items || day.items.length === 0) {
        alert("這天沒有行程喔！");
        return;
    }

    // 取得所有地點名稱並過濾掉空的項目
    const places = day.items
        .map(item => item.text.trim())
        .filter(text => text !== "");

    if (places.length === 0) {
        alert("找不到有效的地點名稱！");
        return;
    }

    // 串接 URL: https://www.google.com/maps/dir/地點1/地點2/地點3/...
    const baseUrl = "https://www.google.com/maps/dir/";
    const query = places.map(p => encodeURIComponent(p)).join("/");
    
    window.open(baseUrl + query, "_blank");
}
