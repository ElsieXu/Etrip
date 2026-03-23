// ===== render 行程 =====

function renderTrip(){

 let html=""

 html+=`
 <div class="card">
 
<h2>✈️ 航班</h2>

<p style="color:#c0392b">${getFlightCountdown()}</p>
<p style="color:#16a34a">${getReturnCountdown()}</p>

<p>${tripData.flight.depart||""}</p>
<p>${tripData.flight.return||""}</p>
 </div>
 `

 html+=`
 <div class="card">
 <h2>🏨 飯店</h2>
 <p>${tripData.hotel.name||""}</p>
 <p>${tripData.hotel.address||""}</p>
 </div>
 `

 tripData.days.forEach((day,dayIndex)=>{

 html+=`

 <div class="card">

 <div class="collapsible">${day.title}</div>

 <div class="content sortable" id="day-${dayIndex}">

 ${(day.items || []).map((item,itemIndex)=>`

 <div class="timeline-item" data-day="${dayIndex}" data-index="${itemIndex}">

${item.time||""} ${item.text}

${item.note ? `<div style="color:#666;font-size:13px">📝 ${item.note}</div>` : ""}

<button onclick="editItem(${dayIndex},${itemIndex})">編輯</button>
<button onclick="addNote(${dayIndex},${itemIndex})">備註</button>
<button onclick="deleteItem(${dayIndex},${itemIndex})">刪除</button>

 </div>

 `).join("")}

 </div>

 </div>

 `

 })

 document.getElementById("result").innerHTML=html
// ✅ 初始化拖曳（一定要在 render 之後）
document.querySelectorAll(".sortable").forEach((el, dayIndex) => {

 Sortable.create(el, {
  animation: 150,

  onEnd: function (evt) {

   const list = tripData.days[dayIndex].items

   const moved = list.splice(evt.oldIndex, 1)[0]
   list.splice(evt.newIndex, 0, moved)

   saveTrip()
   renderTrip()

  }

 })

})
}

// ===== 收合 =====

document.addEventListener("click",e=>{

 if(e.target.classList.contains("collapsible")){

 const c=e.target.nextElementSibling
 c.style.display=c.style.display==="block"?"none":"block"

 }

})

// ===== 備案池 =====

function addBackup(){

 const input=document.getElementById("backupInput")
 const value=input.value.trim()

 if(!value) return

 tripData.backups.push({
 name:value,
 map:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
 })

 input.value=""

 saveTrip()
 renderBackups()

}

// ===== render 備案 =====

function renderBackups(){

 const list=document.getElementById("backupList")

 list.innerHTML=""

 tripData.backups.forEach((item,index)=>{

 list.innerHTML+=`

 <div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid #eee">

 <div>

 <b>${item.name}</b>

 <a href="${item.map}" target="_blank">📍Map</a>

 </div>

 <div>

 <button onclick="addToDay(0,'${item.name}')">Day1</button>
 <button onclick="addToDay(1,'${item.name}')">Day2</button>
 <button onclick="addToDay(2,'${item.name}')">Day3</button>
 <button onclick="addToDay(3,'${item.name}')">Day4</button>

 <button onclick="deleteBackup(${index})">🗑</button>

 </div>

 </div>

 `

 })

}

// ===== 刪除備案 =====

function deleteBackup(i){

 tripData.backups.splice(i,1)

 saveTrip()
 renderBackups()

}

// ===== 加入行程 =====

function addToDay(dayIndex,place){

 if(!tripData.days[dayIndex]) return

 tripData.days[dayIndex].items.push({

 time:"備案",
 text:place

 })

 saveTrip()
 renderTrip()

}

// ===== 刪除行程 =====

function deleteItem(dayIndex,itemIndex){

 tripData.days[dayIndex].items.splice(itemIndex,1)

 saveTrip()
 renderTrip()

}

// ===== 出發航班倒數 =====

function getFlightCountdown(){

 if(!tripData.flight.depart) return ""

 const raw = tripData.flight.depart.trim()

 try{

// ✅ 新解析（支援航班代碼）
 const parts = raw.split(" ")

 let datePart = ""
 let timePart = ""

 datePart = parts.find(p => p.includes("/")) || ""
 timePart = parts.find(p => p.includes(":")) || ""

 if(!datePart || !timePart) return "時間格式錯誤"

// 再拆日期
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

  const [hour,minute] = timePart.split(":")

  const target = new Date(
   year,
   month-1,
   day,
   parseInt(hour),
   parseInt(minute)
  )

  const now = new Date()

  const diff = target - now

  if(diff <= 0) return "航班已出發"

  const hours = Math.floor(diff/(1000*60*60))
  const mins = Math.floor((diff%(1000*60*60))/(1000*60))

  return `⏳ 距離出發航班：${hours}小時 ${mins}分`

 }catch(e){

  return ""

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

// ===== 下載成 .txt 檔案 =====
function downloadTripTxt() {
    // 1. 組合內容字串 (延用之前的邏輯，包含備註與備案)
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

    // 2. 建立 Blob 物件 (設定編碼為 UTF-8)
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    
    // 3. 建立虛擬 <a> 標籤觸發下載
    const link = document.createElement("a");
    const fileName = `My_Trip_${new Date().toISOString().slice(0,10)}.txt`;
    
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    
    // 4. 點擊並移除
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 釋放記憶體
    URL.revokeObjectURL(link.href);
}

