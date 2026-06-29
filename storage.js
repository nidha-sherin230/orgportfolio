/* ==========================================
   STORAGE.JS
   Local Storage Manager
========================================== */

const STORAGE_KEYS = {

    medicines: "medicineReminder_medicines",

    history: "medicineReminder_history",

    settings: "medicineReminder_settings",

    doctor: "medicineReminder_doctor",

    emergency: "medicineReminder_emergency"

};

/* ==========================================
   GENERIC FUNCTIONS
========================================== */

function saveData(key, data){

    localStorage.setItem(key, JSON.stringify(data));

}

function loadData(key, defaultValue = []){

    const data = localStorage.getItem(key);

    if(!data){

        return defaultValue;

    }

    try{

        return JSON.parse(data);

    }

    catch{

        return defaultValue;

    }

}

/* ==========================================
   MEDICINES
========================================== */

function getMedicines(){

    return loadData(STORAGE_KEYS.medicines, []);

}

function saveMedicines(list){

    saveData(STORAGE_KEYS.medicines, list);

}

function addMedicine(medicine){

    const medicines = getMedicines();

    medicine.id = Date.now().toString();

    medicine.createdAt = new Date().toISOString();

    medicine.takenToday = false;

    medicine.history = [];

    medicines.push(medicine);

    saveMedicines(medicines);

}

function updateMedicine(id, updatedMedicine){

    const medicines = getMedicines();

    const index = medicines.findIndex(item => item.id === id);

    if(index === -1){

        return false;

    }

    medicines[index] = {

        ...medicines[index],

        ...updatedMedicine

    };

    saveMedicines(medicines);

    return true;

}

function deleteMedicine(id){

    const medicines = getMedicines();

    const filtered = medicines.filter(item => item.id !== id);

    saveMedicines(filtered);

}

function getMedicine(id){

    return getMedicines().find(item => item.id === id);

}

/* ==========================================
   MARK AS TAKEN
========================================== */

function markMedicineTaken(id){

    const medicines = getMedicines();

    const medicine = medicines.find(item => item.id === id);

    if(!medicine){

        return;

    }

    medicine.takenToday = true;

    medicine.lastTaken = new Date().toISOString();

    medicine.history.push({

        date: new Date().toLocaleDateString(),

        time: new Date().toLocaleTimeString()

    });

    saveMedicines(medicines);

}

/* ==========================================
   RESET DAILY STATUS
========================================== */

function resetDailyStatus(){

    const medicines = getMedicines();

    medicines.forEach(item => {

        item.takenToday = false;

    });

    saveMedicines(medicines);

}

/* ==========================================
   MISSED MEDICINES
========================================== */

function getMissedMedicines(){

    return getMedicines().filter(item => !item.takenToday);

}

/* ==========================================
   TODAY'S MEDICINES
========================================== */

function getTodayMedicines(){

    return getMedicines();

}
/* ==========================================
   SETTINGS
========================================== */

function getSettings(){

    return loadData(STORAGE_KEYS.settings,{
        darkMode:false,
        notifications:true
    });

}

function saveSettings(settings){

    saveData(STORAGE_KEYS.settings,settings);

}

function toggleDarkMode(){

    const settings=getSettings();

    settings.darkMode=!settings.darkMode;

    saveSettings(settings);

    return settings.darkMode;

}

/* ==========================================
   DOCTOR INFORMATION
========================================== */

function getDoctor(){

    return loadData(STORAGE_KEYS.doctor,{
        name:"",
        hospital:"",
        phone:"",
        email:"",
        address:""
    });

}

function saveDoctor(doctor){

    saveData(STORAGE_KEYS.doctor,doctor);

}

/* ==========================================
   EMERGENCY CONTACT
========================================== */

function getEmergency(){

    return loadData(STORAGE_KEYS.emergency,{
        name:"",
        relation:"",
        phone:""
    });

}

function saveEmergency(contact){

    saveData(STORAGE_KEYS.emergency,contact);

}

/* ==========================================
   HISTORY
========================================== */

function getHistory(){

    return loadData(STORAGE_KEYS.history,[]);

}

function addHistory(record){

    const history=getHistory();

    history.unshift(record);

    saveData(STORAGE_KEYS.history,history);

}

/* ==========================================
   STOCK
========================================== */

function updateMedicineStock(id,amount=1){

    const medicines=getMedicines();

    const medicine=medicines.find(m=>m.id===id);

    if(!medicine){

        return;

    }

    medicine.stock=Math.max(0,(medicine.stock||0)-amount);

    saveMedicines(medicines);

}

function refillMedicine(id,newStock){

    const medicines=getMedicines();

    const medicine=medicines.find(m=>m.id===id);

    if(!medicine){

        return;

    }

    medicine.stock=newStock;

    saveMedicines(medicines);

}

/* ==========================================
   LOW STOCK
========================================== */

function getLowStockMedicines(){

    return getMedicines().filter(medicine=>{

        return (medicine.stock||0)<=
               (medicine.minimumStock||5);

    });

}

/* ==========================================
   DASHBOARD STATS
========================================== */

function getDashboardStats(){

    const medicines=getMedicines();

    const total=medicines.length;

    const taken=medicines.filter(m=>m.takenToday).length;

    const missed=total-taken;

    let nextReminder="--";

    if(total){

        medicines.sort((a,b)=>

            a.time.localeCompare(b.time)

        );

        nextReminder=medicines[0].time;

    }

    return{

        total,
        taken,
        missed,
        nextReminder

    };

}

/* ==========================================
   EXPORT BACKUP
========================================== */

function exportBackup(){

    const backup={

        medicines:getMedicines(),

        history:getHistory(),

        doctor:getDoctor(),

        emergency:getEmergency(),

        settings:getSettings(),

        exportedAt:new Date().toISOString()

    };

    return JSON.stringify(backup,null,2);

}

/* ==========================================
   IMPORT BACKUP
========================================== */

function importBackup(json){

    try{

        const data=JSON.parse(json);

        if(data.medicines){

            saveMedicines(data.medicines);

        }

        if(data.history){

            saveData(STORAGE_KEYS.history,data.history);

        }

        if(data.settings){

            saveSettings(data.settings);

        }

        if(data.doctor){

            saveDoctor(data.doctor);

        }

        if(data.emergency){

            saveEmergency(data.emergency);

        }

        return true;

    }

    catch{

        return false;

    }

}

/* ==========================================
   REFILL ALERTS
========================================== */

function getRefillAlerts(){

    return getMedicines().filter(medicine=>{

        return medicine.stock<=medicine.minimumStock;

    });

}

/* ==========================================
   STORAGE INITIALIZATION
========================================== */

(function(){

    if(!localStorage.getItem(STORAGE_KEYS.medicines)){

        saveMedicines([]);

    }

})();