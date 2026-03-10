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

// ===== AI解析 =====

async function parseTrip(){

const rawText=document.getElementById("rawInput").value
const loading=document.getElementById("loading")

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
console.log("JSON解析錯誤",aiText)
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

// ===== render 行程 =====

function renderTrip(){

let html=""

html+=`
<div class="card">
<h2>✈️ 航班</h2>
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

let item={
name:value,
map:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`,
link:""
}

tripData.backups.push(item)

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

// ===== AI抽取景點 =====

async function extractPlaces(){

const text=document.getElementById("aiText").value.trim()

if(!text){
alert("請貼上內容")
return
}

document.getElementById("aiStatus").innerText="AI解析中..."

const res=await fetch("https://etrip.onrender.com/extract_places",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({text:text})

})

const data=await res.json()

let places=[]

try{
places=JSON.parse(data.places)
}catch{
console.log(data)
}

places.forEach(p=>{

tripData.backups.push({
name:p,
map:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}`
})

})

saveTrip()

renderBackups()

document.getElementById("aiStatus").innerText="完成"


}
