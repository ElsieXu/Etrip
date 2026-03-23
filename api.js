async function parseTrip(){

 const rawText = document.getElementById("rawInput").value
 const loading = document.getElementById("loading")

 if(!rawText){
  alert("請貼上行程")
  return
 }

 loading.innerText = "AI解析中..."

 // ✅ fetch
 const res = await fetch(
  "https://etrip.onrender.com/parse",
  {
   method:"POST",
   headers:{
    "Content-Type":"application/json"
   },
   body:JSON.stringify({text:rawText})
  }
 )

 const data = await res.json()

 let aiText = data.result

 aiText = aiText.replace(/```json/g,"")
 aiText = aiText.replace(/```/g,"")

 let ai = {}

 try{
  ai = JSON.parse(aiText)
 }catch(e){
  console.log(aiText)
  alert("AI回傳格式錯誤")
  return
 }

// ✅ 新增：更新航班與飯店
tripData.flight = ai.flight || {}
tripData.hotel = ai.hotel || {}

 // ✅ 建立資料
 tripData.days = (ai.days || []).map(day => {
  return {
    ...day,
    items: (day.items || []).map(item => {
      return {
        time: item.time || "",
        text: item.text || "",
        note: item.note || "",
        lat: null,
        lng: null
      }
    })
  }
 })

for (let day of tripData.days) {

  // 1. 補座標
  day.items = await enrichLocations(day.items)

  // 2. 自動排序（空間感）
  day.items = sortByDistance(day.items)

}

 // ✅ render
 saveTrip()
 renderTrip()

 loading.innerText = "完成"
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
async function enrichLocations(items){

 try{

  const names = items.map(i => i.text)

  const res = await fetch("https://etrip.onrender.com/enrich_locations", {
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    body: JSON.stringify({ places: names })
  })

  const data = await res.json()

  items.forEach(item => {
    const found = data.find(d => d.name === item.text)
    if(found){
      item.lat = found.lat
      item.lng = found.lng
    }
  })

 }catch(e){
  console.error("定位失敗", e)
 }

 return items
}

function sortByDistance(items){

 if(items.length <= 2) return items

 const sorted = [items[0]]
 const remaining = items.slice(1)

 while(remaining.length){

  const last = sorted[sorted.length - 1]

  let nearestIndex = 0
  let minDist = Infinity

  remaining.forEach((item, i) => {

    if(!item.lat || !item.lng) return

    const dist = Math.hypot(
      item.lat - last.lat,
      item.lng - last.lng
    )

    if(dist < minDist){
      minDist = dist
      nearestIndex = i
    }

  })

  sorted.push(remaining.splice(nearestIndex,1)[0])
 }

 return sorted
}
