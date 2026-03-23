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
