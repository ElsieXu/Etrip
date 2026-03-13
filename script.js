let tripData={
 flight:{},
 hotel:{},
 days:[],
 backups:[]
}

// ===== localStorage =====

function saveTrip(){
 localStorage.setItem("tripData",JSON.stringify(tripData))
}

function loadTrip(){

 const saved=localStorage.getItem("tripData")

 if(saved){
  tripData=JSON.parse(saved)
  renderTrip()
  renderBackups()
 }

}

loadTrip()

// ===== AI解析行程 =====

async function parseTrip(){

 const rawText=document.getElementById("rawInput").value
 const loading=document.getElementById("loading")

 if(!rawText){
  alert("請貼上行程")
  return
 }

 loading.innerText="AI解析中..."

 const res=await fetch(
 "https://etrip.onrender.com/parse",
 {
  method:"POST",
  headers:{
   "Content-Type":"application/json"
  },
  body:JSON.stringify({text:rawText})
 }
 )

 const data=await res.json()

 let aiText=data.result

 aiText=aiText.replace(/```json/g,"")
 aiText=aiText.replace(/```/g,"")

 let ai={}

 try{
  ai=JSON.parse(aiText)
 }catch(e){
  console.log(aiText)
  alert("AI回傳格式錯誤")
  return
 }

 tripData.flight=ai.flight||{}
 tripData.hotel=ai.hotel||{}
 tripData.days=ai.days||[]

 saveTrip()
 renderTrip()

 loading.innerText="完成"

}

// ===== AI抽取景點 =====

async function extractPlaces(){

 const text=document.getElementById("aiText").value.trim()

 if(!text){
  alert("請貼上內容")
  return
 }

  let api="/extract_places"

  if(text.startsWith("http")){
 api="/extract_url"
  }

 const status=document.getElementById("aiStatus")
 status.innerText="AI解析中..."

 try{

  const res=await fetch(
   "https://etrip.onrender.com"+api,
   {
    method:"POST",
    headers:{
     "Content-Type":"application/json"
    },
    body:JSON.stringify({text:text})
   }
  )

  const data=await res.json()

  let raw=data.places

  // 清理AI格式
  raw=raw.replace(/```json/g,"")
  raw=raw.replace(/```/g,"")
  raw=raw.trim()

  console.log("AI回傳:",raw)

  let places=[]

  try{
   places=JSON.parse(raw)
  }catch(e){

   // 如果 JSON 壞掉就強制拆字串
   places=raw
    .replace("[","")
    .replace("]","")
    .split(",")
    .map(p=>p.replace(/"/g,"").trim())
  }

  places.forEach(p=>{

   if(!p) return

   tripData.backups.push({
    name:p,
    map:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}`
   })

  })

  saveTrip()
  renderBackups()

  status.innerText="完成"

 }catch(e){

  console.error(e)
  status.innerText="API錯誤"

 }

}

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

 <div class="content" id="day-${dayIndex}">

 ${day.items.map((item,itemIndex)=>`

 <div class="timeline-item">

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

  const [datePart,timePart] = raw.split(" ")

  const parts = datePart.split("/")

  let year,month,day

  if(parts.length === 3){
   year = parseInt(parts[0])
   month = parseInt(parts[1])
   day = parseInt(parts[2])
  }else{
   year = new Date().getFullYear()
   month = parseInt(parts[0])
   day = parseInt(parts[1])
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
// ===== 回程航班倒數 =====
}

function getReturnCountdown(){

 if(!tripData.flight.return) return ""

 const raw = tripData.flight.return.trim()

 try{

  const [datePart,timePart] = raw.split(" ")

  const parts = datePart.split("/")

  let year,month,day

  if(parts.length===3){
   year=parseInt(parts[0])
   month=parseInt(parts[1])
   day=parseInt(parts[2])
  }else{
   year=new Date().getFullYear()
   month=parseInt(parts[0])
   day=parseInt(parts[1])
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

 const item=tripData.days[dayIndex].items[itemIndex]

 const text=prompt("修改內容",item.text)

 if(text!==null){

  item.text=text

  saveTrip()
  renderTrip()

 }

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
