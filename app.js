/* =========================================================
   GETWELL WEIGHT LOSS ADMIN
   CENTRAL APP.JS
========================================================= */


/* =========================================================
   STORAGE
========================================================= */

const STORE_KEY =
  "getwell_final_v4";

const THEME_KEY =
  "getwell_theme_v4";

const MIGRATION_KEY =
  "getwell_pat_to_gw_v1";

const GW_SETTINGS_UPDATED_KEY =
  "GETWELL_SETTINGS_UPDATED";


const seed = {
  patients: []
};


/* =========================================================
   SHARED HTML ESCAPING

   escapeHtml() is called by app.js itself and by the inline
   scripts in patients.html, appointments.html,
   patient-profile.html, panel.html and reports.html, but it
   used to be defined ONLY inside settings.html's inline
   script. On every other page it was therefore undefined and
   threw "escapeHtml is not defined", which is what stopped
   the Add Patient / Add Appointment modals from opening.

   It lives here now because app.js is the shared script all
   pages load. settings.html still declares its own identical
   escapeHtml() further down its inline script; a plain
   function declaration there simply overrides this one, so
   settings.html keeps working unchanged.
========================================================= */

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   SYSTEM SETTINGS
   IMPORTANT:
   settings.html already owns:
   SETTINGS_KEY
   DEFAULT_SETTINGS
   getSettings()
   saveSettings()
   settings

   Therefore app.js MUST NOT declare
   those names.
========================================================= */

/* ---------------------------------------------------------
   DEFAULT SYSTEM SETTINGS

   This is the single source of truth for defaults on the
   READ side. It must stay shape-compatible with
   DEFAULT_SETTINGS in settings.html (the WRITE side).

   Previously the "general", "dashboard" and "reports" keys
   were empty objects here, so on any browser that had never
   opened the Settings page every dashboard/report toggle
   read back as undefined.
--------------------------------------------------------- */

function getwellDefaultSystemSettings(){
  return {
    general: {
      clinicName: "Getwell Clinic",
      clinicLocation: "Puncak Alam",
      contactNumber: "",
      email: "",
      operatingHours: "8:00 AM - 12:00 AM"
    },

    patient: {
      idPrefix: "GW-",
      idDigits: 4,
      nextNumber: 1,
      autoGenerateId: true,
      statuses: [
        {name:"Active",    enabled:true},
        {name:"Inactive",  enabled:true},
        {name:"Completed", enabled:true}
      ],
      defaultStatus: "Active"
    },

    panels: [
      {id:"PMCARE",         name:"PMCARE",         enabled:true},
      {id:"UITM",           name:"UITM",           enabled:true},
      {id:"COMPUMED",       name:"COMPUMED",       enabled:true},
      {id:"MICARE",         name:"MiCare",         enabled:true},
      {id:"SELCARE",        name:"SELCARE",        enabled:true},
      {id:"IHP",            name:"IHP",            enabled:true},
      {id:"ASP",            name:"ASP",            enabled:true},
      {id:"HEALTHCONNECT",  name:"HEALTHCONNECT",  enabled:true},
      {id:"EMAS",           name:"EMAS",           enabled:true},
      {id:"SPONSORED",      name:"SPONSORED",      enabled:true}
    ],

    doctors: [],

    chargeCatalog: {
      Injection: [],
      Medication: [],
      Treatment: [],
      Additional: []
    },

    appointments: {
      statuses: [
        {name:"Upcoming",  enabled:true},
        {name:"Completed", enabled:true},
        {name:"No Show",   enabled:true},
        {name:"Cancelled", enabled:true}
      ],
      types: [
        {name:"Weight Loss Injection", enabled:true},
        {name:"Consultation", enabled:true},
        {name:"Follow-Up", enabled:true},
        {name:"Body Composition Review", enabled:true},
        {name:"Medication Review", enabled:true},
        {name:"Treatment", enabled:true},
        {name:"Other", enabled:true}
      ],
      defaultStatus: "Upcoming",
      defaultType: "Follow-Up",
      defaultDuration: 30
    },

    followUp: {
      dueAfterDays: 5,
      overdueAfterDays: 7,
      defaultDays: 5,
      minDays: 1,
      maxDays: 30,
      specialIntervals: []
    },

    dashboard: {
      showTotalPatients: true,
      showActivePatients: true,
      showDueFollowUp: true,
      showPanelPatients: true,
      showAttention: true,
      showPanelClaimOverview: true
    },

    reports: {
      showPerformance: true,
      showRevenue: true,
      showPatientActivity: true,
      showVisitSummary: true,
      showPanelPerformance: true,
      showSuspendedPolicies: true,
      showAppointmentPerformance: true,
      showDownloadPDF: true
    },

    features: {
      patients: true,
      appointments: true,
      panel: true,
      reports: true,
      followUpAlerts: true,
      panelClaims: true
    }
  };
}


function getwellSystemSettings(){

  const defaults = getwellDefaultSystemSettings();

  const raw =
    localStorage.getItem(
      "GETWELL_SYSTEM_CONFIG_V1"
    );

  if(!raw){
    return defaults;
  }

  try{

    const saved = JSON.parse(raw);

    /*
      Shallow-merge each top-level section over the defaults
      so a config saved by an older build (which may be
      missing whole sections) still returns a complete shape.
    */
    const merged = {...defaults};

    Object.keys(saved || {}).forEach(key => {
      const value = saved[key];

      if(Array.isArray(value)){
        merged[key] = value;
      }else if(value && typeof value === "object"){
        merged[key] = {...(defaults[key] || {}), ...value};
      }else if(value !== undefined){
        merged[key] = value;
      }
    });

    return merged;

  }catch(error){

    console.error(
      "Unable to read Getwell system settings:",
      error
    );

    /*
      Returning {} here used to blank out every panel, doctor
      and charge item across the whole application after a
      single malformed config value. Fall back to defaults.
    */
    return defaults;

  }

}


/* =========================================================
   PATIENT SETTINGS
========================================================= */

function getwellPatientStatuses(){

  const settings =
    getwellSystemSettings();


  return Array.isArray(
    settings.patient?.statuses
  )
    ? settings.patient.statuses
    : [];

}


function getwellActivePatientStatuses(){

  return getwellPatientStatuses()
    .filter(
      status =>
        status &&
        status.enabled
    );

}


function getwellDefaultPatientStatus(){

  const settings =
    getwellSystemSettings();


  const active =
    getwellActivePatientStatuses();


  const wanted =
    settings.patient?.defaultStatus;


  const match =
    active.find(
      status =>
        status.name ===
        wanted
    );


  if(match){

    return match.name;

  }


  return (
    active[0]?.name ||
    "Active"
  );

}


/* =========================================================
   PATIENT ID SETTINGS
========================================================= */

function getwellPatientIdSettings(){

  const settings =
    getwellSystemSettings();


  const patient =
    settings.patient ||
    {};


  return {

    prefix:
      String(
        patient.idPrefix ||
        "GW-"
      ),

    digits:
      Math.max(
        1,
        Number(
          patient.idDigits
        ) ||
        4
      ),

    nextNumber:
      Math.max(
        1,
        Number(
          patient.nextNumber
        ) ||
        1
      ),

    autoGenerate:
      patient.autoGenerateId !==
      false

  };

}


function getwellFormatPatientId(
  number
){

  const config =
    getwellPatientIdSettings();


  return (
    config.prefix +
    String(
      number
    ).padStart(
      config.digits,
      "0"
    )
  );

}


function getwellNextPatientId(){

  const config =
    getwellPatientIdSettings();


  return getwellFormatPatientId(
    config.nextNumber
  );

}


/* =========================================================
   PANELS
========================================================= */

function getwellAllPanels(){

  const settings =
    getwellSystemSettings();


  return Array.isArray(settings.panels)
    ? settings.panels.map(panel => {
        const copy = {...panel};
        if(String(copy.id || "").toUpperCase() === "MICARE"){
          copy.name = "MiCare";
        }
        return copy;
      })
    : [];

}


function getwellActivePanels(){

  return getwellAllPanels()
    .filter(
      panel =>
        panel &&
        panel.enabled
    );

}


function getwellPanelById(
  id
){

  if(!id){

    return null;

  }


  return getwellAllPanels()
    .find(
      panel =>
        String(
          panel.id
        )
        .toUpperCase() ===
        String(
          id
        )
        .toUpperCase()
    ) ||
    null;

}


function getwellPanelByName(
  name
){

  if(!name){

    return null;

  }


  return getwellAllPanels()
    .find(
      panel =>
        String(
          panel.name
        )
        .toLowerCase() ===
        String(
          name
        )
        .toLowerCase()
    ) ||
    null;

}


function getwellPanelOptions(){

  return [

    {
      id:
        "SELF_PAY",

      name:
        "Self-Pay",

      enabled:
        true

    },

    ...getwellActivePanels()

  ];

}


/* =========================================================
   PANEL NAME
========================================================= */

function getPanelName(
  p
){

  if(
    !p ||
    p.panelProvider ===
      "SELF_PAY"
  ){

    return "Self-Pay";

  }


  const configured =
    getwellPanelById(
      p.panelProvider
    );


  if(configured){

    return configured.name;

  }


  /* Legacy values */

  if(
    p.panelProvider ===
      "PANEL_A"
  ){

    return "MiCare";

  }


  if(
    p.panelProvider ===
      "PANEL_B"
  ){

    return "PMCare";

  }


  if(
    p.panelProvider ===
      "PANEL_C"
  ){

    return "Other Panel";

  }


  if(
    p.panelProvider ===
      "Other"
  ){

    return (
      p.otherPanelName ||
      "Panel"
    );

  }


  return (
    p.otherPanelName ||
    p.panelProvider ||
    "Panel"
  );

}


/* =========================================================
   DOCTORS & CHARGE CATALOG
========================================================= */

function getwellDoctors(){
  const settings = getwellSystemSettings();
  return Array.isArray(settings.doctors)
    ? settings.doctors.filter(d => d && d.enabled !== false && String(d.name || "").trim())
    : [];
}

function getwellDoctorOptions(){
  return getwellDoctors().map(d => ({
    id: d.id || String(d.name).trim(),
    name: String(d.name).trim()
  }));
}

function getwellChargeCatalog(){
  const settings = getwellSystemSettings();
  const fallback = {Injection:[], Medication:[], Treatment:[], Additional:[]};
  const source = settings.chargeCatalog || {};
  return ["Injection","Medication","Treatment","Additional"].reduce((out, category) => {
    out[category] = Array.isArray(source[category])
      ? source[category].filter(item => item && item.enabled !== false && String(item.name || "").trim())
      : fallback[category];
    return out;
  }, {});
}

function getwellChargeItem(category, id){
  return getwellChargeCatalog()[category]?.find(item => String(item.id) === String(id)) || null;
}

function getwellChargePrice(category, id){
  const item = getwellChargeItem(category, id);
  return item ? Number(item.price) || 0 : 0;
}

/* =========================================================
   APPOINTMENT SETTINGS
========================================================= */

function getwellAppointmentStatuses(){

  const settings =
    getwellSystemSettings();


  return Array.isArray(
    settings.appointments?.statuses
  )
    ? settings.appointments.statuses
        .filter(
          status =>
            status &&
            status.enabled
        )
    : [];

}

function getwellAppointmentTypes(){
  const settings=getwellSystemSettings();
  const list=Array.isArray(settings.appointments?.types)
    ? settings.appointments.types
    : [];
  return list.filter(x=>x && x.enabled!==false && String(x.name||"").trim());
}

function getwellFollowUpSettings(){
  const settings=getwellSystemSettings();
  const f=settings.followUp||{};
  return {
    dueAfterDays:Math.max(1,Number(f.dueAfterDays)||5),
    overdueAfterDays:Math.max(1,Number(f.overdueAfterDays)||7),
    defaultDays:Math.max(1,Number(f.defaultDays)||Number(f.dueAfterDays)||5),
    minDays:Math.max(1,Number(f.minDays)||1),
    maxDays:Math.max(1,Number(f.maxDays)||30),
    specialIntervals:Array.isArray(f.specialIntervals)?f.specialIntervals:[]
  };
}

function getwellSuggestedFollowUpDate(dateValue,days){
  const d=new Date(String(dateValue||"").slice(0,10)+"T00:00:00");
  if(Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate()+Math.max(1,Number(days)||5));
  return d.toISOString().slice(0,10);
}

function getwellHasFutureAppointment(patient){
  const today=new Date().toISOString().slice(0,10);
  return (patient?.appointments||[]).some(a=>
    a && a.date && String(a.date).slice(0,10)>=today &&
    a.status!=="Cancelled" && a.status!=="No Show"
  );
}

function getwellCreateSuggestedAppointment(patient, visit){
  if(!patient || !visit || getwellHasFutureAppointment(patient)) return null;

  const f=getwellFollowUpSettings();
  const days=Math.min(f.maxDays,Math.max(f.minDays,f.defaultDays));
  const date=getwellSuggestedFollowUpDate(visit.dateKey,days);
  if(!date) return null;

  const appointment={
    id:getwellNextAppointmentId(),
    date,
    time:"",
    doctor:patient.doctor||"",
    type:getwellSystemSettings().appointments?.defaultType || getwellAppointmentTypes()[0]?.name || "Follow-Up",
    status:getwellDefaultAppointmentStatus(),
    notes:`Automatically suggested ${days}-day follow-up after visit ${visit.visit||visit.id}.`,
    source:"automatic",
    autoGenerated:true,
    followUpDays:days,
    sourceVisitId:visit.id,
    manuallyEdited:false,
    updatedAt:new Date().toISOString()
  };

  if(!Array.isArray(patient.appointments)) patient.appointments=[];
  patient.appointments.push(appointment);
  return appointment;
}




function getwellDefaultAppointmentStatus(){

  const settings =
    getwellSystemSettings();


  const statuses =
    getwellAppointmentStatuses();


  const wanted =
    settings.appointments
      ?.defaultStatus;


  const match =
    statuses.find(
      status =>
        status.name ===
        wanted
    );


  return match
    ? match.name
    : (
        statuses[0]?.name ||
        "Upcoming"
      );

}


function getwellAppointmentDuration(){

  const settings =
    getwellSystemSettings();


  return Math.max(
    5,
    Number(
      settings.appointments
        ?.defaultDuration
    ) ||
    30
  );

}


/* =========================================================
   FOLLOW-UP
========================================================= */

function getwellFollowUpSettings(){

  const settings =
    getwellSystemSettings();


  return {

    dueAfterDays:
      Math.max(
        1,
        Number(
          settings.followUp
            ?.dueAfterDays
        ) ||
        5
      ),

    overdueAfterDays:
      Math.max(
        1,
        Number(
          settings.followUp
            ?.overdueAfterDays
        ) ||
        7
      )

  };

}


/* =========================================================
   FEATURES
========================================================= */

function getwellFeatureEnabled(
  feature
){

  const settings =
    getwellSystemSettings();


  if(
    !settings.features ||
    settings.features[feature] ===
      undefined
  ){

    return true;

  }


  return !!settings.features[
    feature
  ];

}


/* =========================================================
   DASHBOARD SETTINGS
========================================================= */

function getwellDashboardSettings(){

  const settings =
    getwellSystemSettings();


  return (
    settings.dashboard ||
    {}
  );

}


/* =========================================================
   REPORT SETTINGS
========================================================= */

function getwellReportSettings(){

  const settings =
    getwellSystemSettings();


  return (
    settings.reports ||
    {}
  );

}



/* =========================================================
/* =========================================================
   GOOGLE SHEETS REMOTE STORAGE  (two-way)

   Design notes — this section was rewritten because the
   previous version could destroy data:

   1. The old poller replaced the whole local store with the
      whole remote store whenever the two differed. Any edit
      made locally but not yet written to the Sheet was lost
      on the next 30-second tick.
      -> Now every sync MERGES per patient record, keeping
         whichever side has the newer updatedAt stamp.

   2. The old save used fetch(..., {mode:"no-cors"}), whose
      response is unreadable, so a rejected or failed write
      looked exactly like a successful one.
      -> Now the save reads the JSON reply and surfaces a
         clear success / failure message.

   3. The old first-run push tested payload.dataVersion but
      the value actually lives at payload.data.dataVersion,
      so it never fired.
      -> The merge handles an empty Sheet naturally.
========================================================= */

const GETWELL_SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbwCAUk-c4fV3Ny7SfY2x3mWity4W8MKxJwlajxdFdUOaDAjFP7lgtb17_BbOXWlGT8kSg/exec";

const GETWELL_REMOTE_POLL_MS = 30000;
const GETWELL_REMOTE_SAVE_KEY = "GETWELL_REMOTE_LAST_SAVE";
const GETWELL_REMOTE_BASELINE_KEY = "GETWELL_REMOTE_BASELINE_V2";
const GETWELL_PERSISTED_STORE_KEY = "GETWELL_PERSISTED_STORE_V2";

let getwellSyncInFlight = false;


function getwellRemoteConfigured(){
  return (
    GETWELL_SHEETS_API_URL &&
    !GETWELL_SHEETS_API_URL.includes("PASTE_YOUR_")
  );
}


/* ---------------------------------------------------------
   STATUS MESSAGES
   Small non-blocking toast so an operation never silently
   does nothing. Styles are injected once so no page needs
   a stylesheet change.
--------------------------------------------------------- */

function getwellEnsureToastStyles(){
  if(document.getElementById("gwToastStyles")) return;
  const style = document.createElement("style");
  style.id = "gwToastStyles";
  style.textContent = `
    #gwToastHost{position:fixed;right:16px;bottom:16px;z-index:99999;
      display:flex;flex-direction:column;gap:8px;pointer-events:none}
    .gw-toast{pointer-events:auto;min-width:210px;max-width:360px;
      padding:11px 13px;border-radius:10px;font-family:inherit;font-size:11px;
      font-weight:500;line-height:16px;box-shadow:0 10px 30px rgba(15,23,42,.18);
      border:1px solid transparent;opacity:0;transform:translateY(6px);
      transition:opacity .18s ease,transform .18s ease}
    .gw-toast.show{opacity:1;transform:translateY(0)}
    .gw-toast.success{background:#ECFDF5;border-color:#A7F3D0;color:#15803D}
    .gw-toast.error{background:#FEF2F2;border-color:#FECACA;color:#B91C1C}
    .gw-toast.info{background:#E8F2FF;border-color:#C7DFFF;color:#1D4ED8}
    html[data-theme="dark"] .gw-toast.success{background:#102A1A;border-color:#1F5133;color:#86EFAC}
    html[data-theme="dark"] .gw-toast.error{background:#3A1515;border-color:#7F2626;color:#FCA5A5}
    html[data-theme="dark"] .gw-toast.info{background:#15365C;border-color:#2F65A0;color:#93C5FD}
  `;
  document.head.appendChild(style);
}



function getwellConfirmDelete(label){
  return new Promise(resolve=>{
    const wrap=document.createElement("div");
    wrap.className="modal-wrap show";
    wrap.style.zIndex="100000";
    wrap.innerHTML=`
      <div class="modal" style="width:min(420px,92vw)">
        <div class="modal-head">
          <div><h2>Delete ${escapeHtml(label||"record")}</h2><p>Are you sure you want to delete this?</p></div>
          <button class="modal-close" type="button" data-cancel>×</button>
        </div>
        <div class="modal-body"><div class="row-sub">This action cannot be undone.</div></div>
        <div class="modal-foot">
          <button class="secondary" type="button" data-cancel>Cancel</button>
          <button class="primary" type="button" data-delete>Delete</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const finish=value=>{wrap.remove();resolve(value);};
    wrap.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>finish(false)));
    wrap.querySelector("[data-delete]").addEventListener("click",()=>finish(true));
  });
}

function getwellNotify(message, kind){
  const type = kind || "info";

  /* Always leave a console trail for debugging. */
  if(type === "error"){
    console.error("[Getwell] " + message);
  }else{
    console.log("[Getwell] " + message);
  }

  if(!document.body) return;

  getwellEnsureToastStyles();

  let host = document.getElementById("gwToastHost");
  if(!host){
    host = document.createElement("div");
    host.id = "gwToastHost";
    document.body.appendChild(host);
  }

  const toast = document.createElement("div");
  toast.className = "gw-toast " + type;
  toast.textContent = message;
  host.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 220);
  }, type === "error" ? 6000 : 3000);
}


/* ---------------------------------------------------------
   RECORD STAMPING
   Every write stamps updatedAt so the merge can decide
   which side of the sync is newer.
--------------------------------------------------------- */

function getwellStampRecord(record){
  if(record && typeof record === "object"){
    record.updatedAt = new Date().toISOString();
  }
  return record;
}


function getwellRecordTime(record){
  const value = record && record.updatedAt;
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}


function getwellLocalStoreSnapshot(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(seed);
  }catch(error){
    return structuredClone(seed);
  }
}


/* ---------------------------------------------------------
   READ  (Sheets -> Web)
   JSONP, because a plain GET to Apps Script from a file://
   or a different origin is blocked, and JSONP is what the
   existing deployment already answers.
--------------------------------------------------------- */

function getwellRemoteRead(callback){
  if(!getwellRemoteConfigured()){
    callback(null);
    return;
  }

  const callbackName =
    "__getwellRemote_" +
    Date.now() +
    "_" +
    Math.random().toString(36).slice(2);

  const script = document.createElement("script");
  let finished = false;

  const cleanup = () => {
    try{ delete window[callbackName]; }catch(e){}
    script.remove();
  };

  const done = payload => {
    if(finished) return;
    finished = true;
    cleanup();
    callback(payload);
  };

  window[callbackName] = payload => done(payload);
  script.onerror = () => done(null);

  script.src =
    GETWELL_SHEETS_API_URL +
    (GETWELL_SHEETS_API_URL.includes("?") ? "&" : "?") +
    "action=get&callback=" +
    encodeURIComponent(callbackName) +
    "&t=" +
    Date.now();

  document.head.appendChild(script);

  setTimeout(() => done(null), 15000);
}


/* ---------------------------------------------------------
   WRITE  (Web -> Sheets)
   Real CORS request so the reply can actually be read.
   Resolves {ok:true} or {ok:false, error:"..."}.
--------------------------------------------------------- */

function getwellRemoteSave(data){
  if(!getwellRemoteConfigured()){
    return Promise.resolve({ok:false, error:"Google Sheets URL is not configured."});
  }

  try{
    localStorage.setItem(GETWELL_REMOTE_SAVE_KEY, String(Date.now()));
  }catch(e){}

  return fetch(
    GETWELL_SHEETS_API_URL,
    {
      method: "POST",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify({action:"save", data})
    }
  )
    .then(response => response.text())
    .then(text => {
      let payload;
      try{
        payload = JSON.parse(text);
      }catch(e){
        /*
          A login page instead of JSON almost always means the
          Apps Script deployment is not set to
          "Who has access: Anyone".
        */
        const message =
          "Google Sheets rejected the save. Check the Apps Script deployment is shared with \"Anyone\".";

        getwellRecordSyncStatus(false, message);

        return {
          ok:false,
          error:message
        };
      }

      if(payload && payload.ok){
        getwellRecordSyncStatus(true);
        return {ok:true, saved:payload.saved || null};
      }

      const message =
        (payload && payload.error) || "Google Sheets returned an unknown error.";

      getwellRecordSyncStatus(false, message);

      return {
        ok:false,
        error:message
      };
    })
    .catch(error => {
      const message =
        "Unable to reach Google Sheets. " +
        (error && error.message ? error.message : "Check the connection.");

      getwellRecordSyncStatus(false, message);

      return {
        ok:false,
        error:message
      };
    });
}


/* ---------------------------------------------------------
   FILE UPLOAD  (binary -> Google Drive)
   Sheets cells cap out at 50,000 characters, so base64
   images cannot live in the store. The binary goes to
   Drive; only {id, name, url} is persisted.
--------------------------------------------------------- */

function getwellUploadFile(file){
  if(!getwellRemoteConfigured()){
    return Promise.resolve({ok:false, error:"Google Drive is not configured."});
  }

  return fetch(
    GETWELL_SHEETS_API_URL,
    {
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify({
        action:"uploadFile",
        file:{
          name: file.name,
          mimeType: file.mimeType,
          dataBase64: file.dataBase64,
          patientId: file.patientId || "",
          visitId: file.visitId || ""
        }
      })
    }
  )
    .then(response => response.text())
    .then(text => {
      let payload;
      try{ payload = JSON.parse(text); }
      catch(e){ return {ok:false, error:"Drive upload rejected (deployment not public?)."}; }

      if(payload && payload.ok && payload.file){
        return {ok:true, file:payload.file};
      }
      return {ok:false, error:(payload && payload.error) || "Drive upload failed."};
    })
    .catch(error => ({
      ok:false,
      error:"Unable to reach Google Drive. " + (error && error.message ? error.message : "")
    }));
}


/* ---------------------------------------------------------
   MERGE
   Per-patient last-write-wins. Never deletes a record that
   exists on only one side, so a row typed by hand into the
   Sheet survives, and a patient added offline survives too.
--------------------------------------------------------- */

function getwellClone(value){
  try{return structuredClone(value);}
  catch(e){return JSON.parse(JSON.stringify(value));}
}

function getwellRemoteBaseline(){
  try{
    const raw=localStorage.getItem(GETWELL_REMOTE_BASELINE_KEY);
    return raw?JSON.parse(raw):null;
  }catch(e){return null;}
}

function getwellPersistedStore(){
  try{
    const raw=localStorage.getItem(GETWELL_PERSISTED_STORE_KEY);
    return raw?JSON.parse(raw):null;
  }catch(e){return null;}
}

function getwellSetPersistedStore(store){
  try{localStorage.setItem(GETWELL_PERSISTED_STORE_KEY,JSON.stringify(getwellClone(store||{patients:[]})));}catch(e){}
}


function getwellSetRemoteBaseline(remote){
  try{localStorage.setItem(GETWELL_REMOTE_BASELINE_KEY,JSON.stringify(getwellClone(remote||{patients:[]})));}catch(e){}
}

function getwellChildIds(patient,field){
  return new Set((patient?.[field]||[]).filter(x=>x&&x.id).map(x=>String(x.id)));
}

/* Successful authoritative Sheet snapshots reconcile deletions.
   A failed request never enters this function, so it can never
   masquerade as a deletion. */
function getwellReconcileRemoteDeletions(local,remote,baseline){
  if(!baseline||!Array.isArray(baseline.patients)) return local;

  const remotePatients=new Map((remote.patients||[]).filter(p=>p&&p.id).map(p=>[String(p.id),p]));
  const baselinePatients=new Map((baseline.patients||[]).filter(p=>p&&p.id).map(p=>[String(p.id),p]));

  const patients=(local.patients||[])
    .filter(lp=>lp&&lp.id&&!(baselinePatients.has(String(lp.id))&&!remotePatients.has(String(lp.id))))
    .map(lp=>{
      const id=String(lp.id), rp=remotePatients.get(id), bp=baselinePatients.get(id);
      if(!rp||!bp) return lp;
      const out=getwellClone(lp);
      ["appointments","visits","claims"].forEach(field=>{
        const oldIds=getwellChildIds(bp,field);
        const newIds=getwellChildIds(rp,field);
        if(!oldIds.size) return;
        out[field]=(out[field]||[]).filter(child=>child&&child.id&&!(oldIds.has(String(child.id))&&!newIds.has(String(child.id))));
      });
      return out;
    });

  return {...local,patients};
}

function getwellMergeStores(local,remote){
  const localPatients=Array.isArray(local?.patients)?local.patients:[];
  const remotePatients=Array.isArray(remote?.patients)?remote.patients:[];
  const byId=new Map();
  let remoteWon=false,localWon=false;

  localPatients.forEach(p=>{if(p&&p.id)byId.set(String(p.id),p);});
  remotePatients.forEach(p=>{
    if(!p||!p.id)return;
    const id=String(p.id),mine=byId.get(id);
    if(!mine){byId.set(id,getwellClone(p));remoteWon=true;return;}
    const lt=getwellRecordTime(mine),rt=getwellRecordTime(p);
    if(rt>lt){byId.set(id,getwellClone(p));remoteWon=true;}
    else if(lt>rt){localWon=true;}
    else if(JSON.stringify(mine)!==JSON.stringify(p)){byId.set(id,getwellClone(p));remoteWon=true;}
  });

  const remoteIds=new Set(remotePatients.filter(p=>p&&p.id).map(p=>String(p.id)));
  localPatients.forEach(p=>{if(p&&p.id&&!remoteIds.has(String(p.id)))localWon=true;});

  return {merged:{...(remote||{}),...(local||{}),patients:Array.from(byId.values())},remoteWon,localWon};
}

function getwellCollectDeletions(before,current){
  const d={patients:[],appointments:[],visits:[],charges:[],claims:[],files:[]};
  if(!before||!Array.isArray(before.patients)) return d;
  const currentPatients=new Map((current.patients||[]).filter(p=>p&&p.id).map(p=>[String(p.id),p]));

  (before.patients||[]).forEach(bp=>{
    if(!bp||!bp.id)return;
    const pid=String(bp.id),cp=currentPatients.get(pid);
    if(!cp){
      d.patients.push(pid);
      (bp.appointments||[]).forEach(a=>a?.id&&d.appointments.push(String(a.id)));
      (bp.visits||[]).forEach(v=>{
        if(!v?.id)return;
        d.visits.push(String(v.id));
        (v.charges||[]).forEach(c=>c?.id&&d.charges.push(String(c.id)));
        (v.photos||[]).forEach(f=>f?.id&&d.files.push(String(f.id)));
      });
      (bp.claims||[]).forEach(c=>c?.id&&d.claims.push(String(c.id)));
      return;
    }
    ["appointments","visits","claims"].forEach(field=>{
      const oldIds=getwellChildIds(bp,field),newIds=getwellChildIds(cp,field);
      oldIds.forEach(id=>{if(!newIds.has(id))d[field].push(id);});
    });
    const cv=new Map((cp.visits||[]).filter(v=>v?.id).map(v=>[String(v.id),v]));
    (bp.visits||[]).forEach(v=>{
      if(!v?.id)return;
      const nv=cv.get(String(v.id));
      if(!nv){
        (v.charges||[]).forEach(c=>c?.id&&d.charges.push(String(c.id)));
        (v.photos||[]).forEach(f=>f?.id&&d.files.push(String(f.id)));
        return;
      }
      const nc=getwellChildIds(nv,"charges"),nf=getwellChildIds(nv,"photos");
      (v.charges||[]).forEach(c=>c?.id&&!nc.has(String(c.id))&&d.charges.push(String(c.id)));
      (v.photos||[]).forEach(f=>f?.id&&!nf.has(String(f.id))&&d.files.push(String(f.id)));
    });
  });
  Object.keys(d).forEach(k=>d[k]=[...new Set(d[k])]);
  return d;
}

function getwellRemoteDelete(deletions){
  const has=Object.values(deletions||{}).some(x=>Array.isArray(x)&&x.length);
  if(!has)return Promise.resolve({ok:true});
  return fetch(GETWELL_SHEETS_API_URL,{
    method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify({action:"deleteRecords",deletions})
  }).then(r=>r.text()).then(text=>{
    try{
      const p=JSON.parse(text);
      return p&&p.ok?p:{ok:false,error:p?.error||"Google Sheets deletion failed."};
    }catch(e){return {ok:false,error:"Invalid Google Sheets deletion response."};}
  }).catch(e=>({ok:false,error:"Unable to reach Google Sheets for deletion. "+(e?.message||"")}));
}

function getwellRemoteSaveSettings(settings){
  if(!getwellRemoteConfigured())return Promise.resolve({ok:false,error:"Google Sheets URL is not configured."});
  return fetch(GETWELL_SHEETS_API_URL,{
    method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify({action:"saveSettings",settings})
  }).then(r=>r.text()).then(text=>{
    try{
      const p=JSON.parse(text);
      return p&&p.ok?p:{ok:false,error:p?.error||"Settings save failed."};
    }catch(e){return {ok:false,error:"Invalid settings response."};}
  }).catch(e=>({ok:false,error:"Unable to reach Google Sheets for settings. "+(e?.message||"")}));
}

function getwellSyncRemoteStore(allowReload){
  if(!getwellRemoteConfigured()||getwellSyncInFlight)return;
  getwellSyncInFlight=true;
  getwellRemoteRead(payload=>{
    getwellSyncInFlight=false;

    if(!payload||payload.ok!==true||!payload.data){
      getwellRecordSyncStatus(
        false,
        "Could not read the latest data from Google Sheets."
      );
      return;
    }

    getwellRecordSyncStatus(true);

    const remote=payload.data;
    const local=getwellLocalStoreSnapshot();
    const baseline=getwellRemoteBaseline();

    if(remote.settings&&typeof remote.settings==="object"){
      try{
        const raw=localStorage.getItem("GETWELL_SYSTEM_CONFIG_V1");
        const localSettings=raw?JSON.parse(raw):null;
        const rt=Date.parse(remote.settings.updatedAt||"")||0;
        const lt=Date.parse(localSettings?.updatedAt||"")||0;
        if(rt>lt){
          localStorage.setItem("GETWELL_SYSTEM_CONFIG_V1",JSON.stringify(remote.settings));
          localStorage.setItem("GETWELL_SETTINGS_UPDATED",String(Date.now()));
          location.reload();
          return;
        }
      }catch(e){}
    }

    const reconciled=getwellReconcileRemoteDeletions(local,remote,baseline);
    const result=getwellMergeStores(reconciled,remote);

    getwellSetRemoteBaseline(remote);

    if(result.remoteWon||JSON.stringify(reconciled)!==JSON.stringify(local)){
      localStorage.setItem(STORE_KEY,JSON.stringify(result.merged));
      getwellSetPersistedStore(result.merged);
      localStorage.setItem(MIGRATION_KEY,"done");
      if(allowReload!==false){location.reload();return;}
    }

    if(result.localWon){
      getwellRemoteSave(result.merged).then(saveResult=>{
        if(!saveResult.ok)getwellNotify(saveResult.error,"error");
        else {
          getwellSetRemoteBaseline(result.merged);
          getwellSetPersistedStore(result.merged);
        }
      });
    }
  });
}

function getwellStartRemoteSync(){
  if(!getwellRemoteConfigured()) return;

  setTimeout(() => getwellSyncRemoteStore(true), 250);

  setInterval(() => {
    const lastSave = Number(localStorage.getItem(GETWELL_REMOTE_SAVE_KEY) || 0);

    /* Do not read back while a write is still travelling. */
    if(Date.now() - lastSave < 5000) return;

    getwellSyncRemoteStore(true);
  }, GETWELL_REMOTE_POLL_MS);
}


/* =========================================================
   RAW STORE
========================================================= */

function rawStore(){

  const raw =
    localStorage.getItem(
      STORE_KEY
    );


  if(!raw){

    localStorage.setItem(
      STORE_KEY,
      JSON.stringify(
        seed
      )
    );


    return structuredClone(
      seed
    );

  }


  try{

    return JSON.parse(
      raw
    );

  }catch(e){

    localStorage.setItem(
      STORE_KEY,
      JSON.stringify(
        seed
      )
    );


    return structuredClone(
      seed
    );

  }

}


/* =========================================================
   LEGACY ID MIGRATION
========================================================= */

function migrateLegacyIds(
  data
){

  if(
    localStorage.getItem(
      MIGRATION_KEY
    ) ===
    "done"
  ){

    return data;

  }


  const used =
    new Set();


  const map =
    {};


  (
    data.patients ||
    []
  )
  .forEach(
    p => {

      const old =
        String(
          p.id ||
          ""
        );


      const match =
        old.match(
          /^PAT-(\d+)$/i
        );


      if(match){

        const number =
          String(
            Number(
              match[1]
            )
          )
          .padStart(
            4,
            "0"
          );


        const newer =
          `GW-${number}`;


        map[old] =
          newer;


        p.id =
          newer;


        used.add(
          newer
        );

      }

    }
  );


  let next =
    1;


  (
    data.patients ||
    []
  )
  .forEach(
    p => {

      if(
        !/^GW-\d+$/i.test(
          p.id ||
          ""
        )
      ){

        while(
          used.has(
            `GW-${String(next).padStart(4,"0")}`
          )
        ){

          next++;

        }


        p.id =
          `GW-${String(next).padStart(4,"0")}`;


        used.add(
          p.id
        );


        next++;

      }


      if(
        !p.panelStatus &&
        patientUsesPanel(
          p
        )
      ){

        p.panelStatus =
          "Active";

      }


      if(
        !p.panelSuspensionNote
      ){

        p.panelSuspensionNote =
          "";

      }


      (
        p.appointments ||
        []
      )
      .forEach(
        a => {

          if(
            a.patientId &&
            map[
              a.patientId
            ]
          ){

            a.patientId =
              map[
                a.patientId
              ];

          }

        }
      );

    }
  );


  localStorage.setItem(
    STORE_KEY,
    JSON.stringify(
      data
    )
  );


  localStorage.setItem(
    MIGRATION_KEY,
    "done"
  );


  return data;

}


/* =========================================================
   STORE
========================================================= */

function store(){

  return migrateLegacyIds(
    rawStore()
  );

}


function saveStore(
  data
){
  const snapshot=structuredClone(data);
  const deletions=getwellCollectDeletions(
    getwellRemoteBaseline() || getwellPersistedStore(),
    snapshot
  );
  localStorage.setItem(STORE_KEY,JSON.stringify(snapshot));

  return getwellRemoteDelete(deletions).then(deleteResult=>{
    if(!deleteResult.ok){
      getwellNotify("Saved on this device, but deletion was NOT synchronized to Google Sheets. "+deleteResult.error,"error");
      return deleteResult;
    }
    return getwellRemoteSave(snapshot).then(saveResult=>{
      if(!saveResult.ok){
        getwellNotify("Saved on this device, but NOT to Google Sheets. "+saveResult.error,"error");
        return saveResult;
      }
      getwellSetRemoteBaseline(snapshot);
      getwellSetPersistedStore(snapshot);
      return saveResult;
    });
  });
}


/* =========================================================
   PATIENT
========================================================= */

function mapLegacyId(
  id
){

  const value =
    String(
      id ||
      ""
    );


  const match =
    value.match(
      /^PAT-(\d+)$/i
    );


  return match
    ? `GW-${String(Number(match[1])).padStart(4,"0")}`
    : value;

}


function getPatient(
  id
){

  const wanted =
    mapLegacyId(
      id
    );


  return (
    store().patients ||
    []
  )
  .find(
    patient =>
      patient.id ===
      wanted
  ) ||
  null;

   
}


function upsertPatient(
  patient
){

  /*
    Stamp the record so the two-way merge can tell which
    side of the sync holds the newer version.
  */
  getwellStampRecord(patient);

  const data =
    store();


  const index =
    data.patients
      .findIndex(
        existing =>
          existing.id ===
          patient.id
      );


  if(index >= 0){

    data.patients[index] =
      patient;

  }else{

    data.patients.push(
      patient
    );

  }


  return saveStore(
    data
  );

}


/* ---------------------------------------------------------
   PATIENT ID ALLOCATION
   Advances settings.patient.nextNumber so the ID series
   configured in Settings is actually honoured and never
   hands out the same number twice.
--------------------------------------------------------- */

function getwellAdvancePatientNumber(usedNumber){
  try{
    const raw = localStorage.getItem("GETWELL_SYSTEM_CONFIG_V1");
    const saved = raw ? JSON.parse(raw) : getwellDefaultSystemSettings();

    if(!saved.patient || typeof saved.patient !== "object"){
      saved.patient = getwellDefaultSystemSettings().patient;
    }

    const next = Math.max(
      Number(saved.patient.nextNumber) || 1,
      (Number(usedNumber) || 0) + 1
    );

    saved.patient.nextNumber = next;

    localStorage.setItem(
      "GETWELL_SYSTEM_CONFIG_V1",
      JSON.stringify(saved)
    );
  }catch(error){
    console.error("Unable to advance the patient ID counter:", error);
  }
}


/*
  Allocates the next free patient ID using the prefix and
  digit width from Settings, skipping any number already
  present in the store.
*/
function getwellAllocatePatientId(){
  const config = getwellPatientIdSettings();
  const existing = store().patients || [];

  const pattern = new RegExp(
    "^" + config.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)$",
    "i"
  );

  let highest = 0;
  existing.forEach(patient => {
    const match = String(patient.id || "").match(pattern);
    if(match) highest = Math.max(highest, Number(match[1]) || 0);
  });

  const number = Math.max(config.nextNumber, highest + 1);

  return {
    id: getwellFormatPatientId(number),
    number
  };
}


/* ---------------------------------------------------------
   STABLE RECORD IDS

   Appointments, visits and claims used to be keyed on
   `${patient.id}-A${Date.now()}`, which is unstable, unsorted
   and meaningless in a spreadsheet. They now use a readable
   sequential series so a row can be identified by eye in the
   Google Sheet and matched on upsert:

     Patient      GW-0001
     Appointment  APT-000001
     Visit        VIS-000001
     Claim        CLM-000001
     File         FILE-000001

   Existing records keep whatever id they already have.
--------------------------------------------------------- */

function getwellNextSequentialId(prefix, digits, collect){
  const data = store();
  const pattern = new RegExp("^" + prefix + "(\\d+)$", "i");

  let highest = 0;

  (data.patients || []).forEach(patient => {
    (collect(patient) || []).forEach(item => {
      const match = String((item && item.id) || "").match(pattern);
      if(match) highest = Math.max(highest, Number(match[1]) || 0);
    });
  });

  return prefix + String(highest + 1).padStart(digits, "0");
}

function getwellNextAppointmentId(){
  return getwellNextSequentialId("APT-", 6, p => p.appointments);
}

function getwellNextVisitId(){
  return getwellNextSequentialId("VIS-", 6, p => p.visits);
}

function getwellNextClaimId(){
  return getwellNextSequentialId("CLM-", 6, p => p.claims);
}


/* =========================================================
   CLAIMS
========================================================= */

function ensureClaims(
  patient
){

  if(
    !Array.isArray(
      patient.claims
    )
  ){

    patient.claims =
      [];

  }


  return patient.claims;

}


/* =========================================================
   VISITS
========================================================= */

function ensureVisit(visit){

  if(!visit.billing){
    visit.billing = {};
  }

  visit.billing.injection ||= {price:0,notes:""};
  visit.billing.medication ||= {price:0,notes:""};
  visit.billing.treatment ||= {price:0,notes:""};
  visit.billing.other ||= {price:0,notes:""};

  visit.billing.panel = Number(visit.billing.panel || 0);
  visit.billing.selfPay = Number(visit.billing.selfPay || 0);

  /*
    New structure:
    charges = [
      {id, category, itemId, itemName, price, notes}
    ]

    Legacy visits are automatically converted once.
  */
  if(!Array.isArray(visit.charges)){
    const legacy = [];

    if(visit.injection || (+visit.billing.injection.price || 0)){
      legacy.push({
        id:`legacy-injection-${Date.now()}-${Math.random()}`,
        category:"Injection",
        itemId:"",
        itemName:visit.injection || "",
        price:+visit.billing.injection.price || 0,
        notes:visit.billing.injection.notes || ""
      });
    }

    if(visit.medication || (+visit.billing.medication.price || 0)){
      legacy.push({
        id:`legacy-medication-${Date.now()}-${Math.random()}`,
        category:"Medication",
        itemId:"",
        itemName:visit.medication || "",
        price:+visit.billing.medication.price || 0,
        notes:visit.billing.medication.notes || ""
      });
    }

    if(visit.additionalTreatment || (+visit.billing.treatment.price || 0)){
      legacy.push({
        id:`legacy-treatment-${Date.now()}-${Math.random()}`,
        category:"Treatment",
        itemId:"",
        itemName:visit.additionalTreatment || "",
        price:+visit.billing.treatment.price || 0,
        notes:visit.billing.treatment.notes || ""
      });
    }

    if(visit.otherName || (+visit.billing.other.price || 0)){
      legacy.push({
        id:`legacy-additional-${Date.now()}-${Math.random()}`,
        category:"Additional",
        itemId:"",
        itemName:visit.otherName || "",
        price:+visit.billing.other.price || 0,
        notes:visit.billing.other.notes || ""
      });
    }

    visit.charges = legacy;
  }

  return visit;
}

function visitTotal(visit){
  ensureVisit(visit);
  if(Array.isArray(visit.charges)){
    return visit.charges.reduce(
      (sum, item) => sum + (Number(item.price) || 0),
      0
    );
  }

  const billing = visit.billing;
  return (
    (+billing.injection.price || 0) +
    (+billing.medication.price || 0) +
    (+billing.treatment.price || 0) +
    (+billing.other.price || 0)
  );
}

function visitCategoryTotal(visit, category){
  ensureVisit(visit);
  return (visit.charges || [])
    .filter(item => item.category === category)
    .reduce((sum,item) => sum + (Number(item.price) || 0), 0);
}



/* =========================================================
   PANEL TYPE NORMALIZER
========================================================= */

function normalizePanelType(value){

  const v = String(
    value || ""
  ).trim().toUpperCase();

  if(!v){
    return "SELF_PAY";
  }

  if(
    v === "SELF PAY" ||
    v === "SELF-PAY" ||
    v === "SELFPAY"
  ){
    return "SELF_PAY";
  }

  if(v === "OTHER"){
    return "Other";
  }

  return v;
}


/* =========================================================
   PANEL
========================================================= */

function patientUsesPanel(
  patient
){

  return !!(
    patient?.panelProvider &&
    patient.panelProvider !==
      "SELF_PAY"
  );

}


function isPanelSuspended(
  patient
){

  return (
    patientUsesPanel(
      patient
    ) &&
    (
      patient.panelStatus ===
        "Suspended" ||

      patient.insuranceStatus ===
        "Suspended"
    )
  );

}


function panelSuspensionNote(
  patient
){

  return (
    patient.panelSuspensionNote ||
    patient.insuranceSuspensionNote ||
    ""
  );

}


/* =========================================================
   FINANCE
========================================================= */

function grandTotal(
  patient
){

  return (
    patient.visits ||
    []
  )
  .reduce(
    (
      total,
      visit
    ) =>
      total +
      visitTotal(
        visit
      ),
    0
  );

}


function claimsTotal(
  patient
){

  return ensureClaims(
    patient
  )
  .reduce(
    (
      total,
      claim
    ) =>
      total +
      (
        +claim.amount ||
        0
      ),
    0
  );

}


function finance(
  patient
){

  let injection =
    0;

  let medication =
    0;

  let treatment =
    0;

  let selfpay =
    0;


  (
    patient.visits ||
    []
  )
  .forEach(
    visit => {

      const billing = ensureVisit(visit).billing;

      injection += visitCategoryTotal(visit,"Injection");
      medication += visitCategoryTotal(visit,"Medication");
      treatment += visitCategoryTotal(visit,"Treatment");
      selfpay += +billing.selfPay || 0;

    }
  );


  const grand =
    grandTotal(
      patient
    );


  const claimed =
    claimsTotal(
      patient
    );


  return {

    grand,

    claimed,

    balance:
      grand - claimed,

    injection,

    medication,

    treatment,

    selfpay

  };

}


/* =========================================================
   FOLLOW-UP
========================================================= */

function latestVisit(
  patient
){

  return [
    ...(patient.visits ||
      [])
  ]
  .sort(
    (
      a,
      b
    ) =>
      (
        a.dateKey ||
        ""
      )
      .localeCompare(
        b.dateKey ||
        ""
      )
  )
  .at(
    -1
  ) ||
  null;

}


function daysSince(
  date
){

  if(!date){

    return null;

  }


  const start =
    new Date(
      date +
      "T00:00:00"
    );


  const today =
    new Date();


  today.setHours(
    0,
    0,
    0,
    0
  );


  return Math.floor(
    (
      today -
      start
    ) /
    86400000
  );

}


function alerts(){

  const config =
    getwellFollowUpSettings();


  return (
    store().patients ||
    []
  )
  .map(
    patient => {

      const days =
        daysSince(
          latestVisit(
            patient
          )
          ?.dateKey
        );


      if(
        days === null ||
        days <
          config.dueAfterDays
      ){

        return null;

      }


      return {

        id:
          patient.id,

        name:
          patient.name,

        days,

        level:
          days >=
            config.overdueAfterDays
            ? "overdue"
            : "warning"

      };

    }
  )
  .filter(
    Boolean
  )
  .sort(
    (
      a,
      b
    ) =>
      b.days -
      a.days
  );

}


/* =========================================================
   MONEY
========================================================= */

function money(
  value
){

  return (
    "RM " +
    Number(
      value ||
      0
    )
    .toLocaleString(
      "en-MY",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    )
  );

}


/* =========================================================
   THEME
========================================================= */

function applyTheme(
  theme
){

  theme =
    theme ===
      "dark"
      ? "dark"
      : "light";


  document.documentElement
    .dataset.theme =
    theme;


  localStorage.setItem(
    THEME_KEY,
    theme
  );


  const button =
    document.getElementById(
      "themeToggle"
    );


  if(button){

    button.textContent =
      theme ===
        "dark"
        ? "☀"
        : "☾";


    button.title =
      theme ===
        "dark"
        ? "Switch to Day Mode"
        : "Switch to Night Mode";

  }

}


function initTheme(){

  applyTheme(
    localStorage.getItem(
      THEME_KEY
    ) ||
    "light"
  );

}


function toggleTheme(){

  const current =
    document.documentElement
      .dataset.theme ||
    "light";


  const next =
    current ===
      "dark"
      ? "light"
      : "dark";


  applyTheme(
    next
  );


  /*
    The theme button and Account Settings -> Appearance must
    not disagree, so an explicit toggle also becomes the
    stored appearance preference.
  */
  try{
    getwellSaveAdminPrefs({appearance:{theme:next}});
  }catch(e){}

}


/* =========================================================
   ADMINISTRATOR ACCOUNT
   ---------------------------------------------------------
   The "A" avatar in the top-right opens an administrator
   menu. Everything it stores lives in localStorage under the
   keys below and is deliberately kept OUT of the patient
   store, so nothing here can ever touch a patient record,
   the Google Sheet or Google Drive.
========================================================= */

const GW_ADMIN_PROFILE_KEY   = "GETWELL_ADMIN_PROFILE_V1";
const GW_ADMIN_PREFS_KEY     = "GETWELL_ADMIN_PREFS_V1";
const GW_ACTIVITY_LOG_KEY    = "GETWELL_ACTIVITY_LOG_V1";
const GW_SESSION_KEY         = "GETWELL_SESSION_V1";
const GW_NOTIF_READ_KEY      = "GETWELL_NOTIF_READ_V1";
const GW_SYNC_STATUS_KEY     = "GETWELL_SYNC_STATUS_V1";
const GW_ACTIVITY_LIMIT      = 400;


function getwellReadJson(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    if(parsed === null || typeof parsed !== "object") return structuredClone(fallback);
    return parsed;
  }catch(e){
    return structuredClone(fallback);
  }
}


function getwellWriteJson(key, value){
  try{
    localStorage.setItem(key, JSON.stringify(value));
  }catch(e){}
  return value;
}


/* ---------------------------------------------------------
   PROFILE
--------------------------------------------------------- */

function getwellDefaultAdminProfile(){
  return {
    name: "Administrator",
    role: "Weight Loss Program",
    email: "",
    phone: "",
    photo: "",
    initials: ""
  };
}


function getwellAdminProfile(){
  const profile = Object.assign(
    getwellDefaultAdminProfile(),
    getwellReadJson(GW_ADMIN_PROFILE_KEY, {})
  );

  if(!String(profile.name || "").trim()) profile.name = "Administrator";
  if(!String(profile.role || "").trim()) profile.role = "Weight Loss Program";

  return profile;
}


function getwellAdminInitials(profile){
  const p = profile || getwellAdminProfile();
  const manual = String(p.initials || "").trim();
  if(manual) return manual.slice(0,2).toUpperCase();

  const parts = String(p.name || "Administrator").trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return "A";
  if(parts.length === 1) return parts[0].slice(0,1).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}


function getwellSaveAdminProfile(profile){
  const merged = Object.assign(getwellAdminProfile(), profile || {});
  getwellWriteJson(GW_ADMIN_PROFILE_KEY, merged);
  getwellRefreshAdminIdentity();
  return merged;
}


function getwellRefreshAdminIdentity(){
  const profile = getwellAdminProfile();
  const initials = getwellAdminInitials(profile);

  document.querySelectorAll("[data-admin-initials]").forEach(node => {
    if(profile.photo){
      node.innerHTML = `<img src="${escapeHtml(profile.photo)}" alt="">`;
      node.classList.add("has-photo");
    }else{
      node.textContent = initials;
      node.classList.remove("has-photo");
    }
  });

  document.querySelectorAll("[data-admin-name]").forEach(node => {
    node.textContent = profile.name;
  });

  document.querySelectorAll("[data-admin-role]").forEach(node => {
    node.textContent = profile.role;
  });
}


/* ---------------------------------------------------------
   PREFERENCES
--------------------------------------------------------- */

function getwellDefaultAdminPrefs(){
  return {
    notifications: {
      followUp: true,
      appointments: true,
      panel: true,
      suspended: true,
      sync: true
    },
    appearance: {
      theme: "light",
      density: "comfortable"
    },
    security: {
      passcodeEnabled: false,
      passcode: ""
    }
  };
}


function getwellAdminPrefs(){
  const stored = getwellReadJson(GW_ADMIN_PREFS_KEY, {});
  const defaults = getwellDefaultAdminPrefs();

  return {
    notifications: Object.assign(defaults.notifications, stored.notifications || {}),
    appearance:    Object.assign(defaults.appearance,    stored.appearance    || {}),
    security:      Object.assign(defaults.security,      stored.security      || {})
  };
}


function getwellSaveAdminPrefs(prefs){
  const current = getwellAdminPrefs();

  const merged = {
    notifications: Object.assign(current.notifications, (prefs||{}).notifications || {}),
    appearance:    Object.assign(current.appearance,    (prefs||{}).appearance    || {}),
    security:      Object.assign(current.security,      (prefs||{}).security      || {})
  };

  getwellWriteJson(GW_ADMIN_PREFS_KEY, merged);
  getwellApplyAppearance();
  return merged;
}


function getwellApplyAppearance(){
  const appearance = getwellAdminPrefs().appearance;

  document.documentElement.dataset.density =
    appearance.density === "compact" ? "compact" : "comfortable";

  if(appearance.theme === "system"){
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    applyTheme(prefersDark ? "dark" : "light", true);
  }
}


/* ---------------------------------------------------------
   ACTIVITY LOG
--------------------------------------------------------- */

function getwellActivityLog(){
  const stored = getwellReadJson(GW_ACTIVITY_LOG_KEY, []);
  return Array.isArray(stored) ? stored : [];
}


/*
  getwellLogActivity("Add", "Patient", "GW-0007 · Aisyah", "Created from Patients page")

  Never throws: an activity-log failure must not be able to
  stop a patient record from being saved.
*/
function getwellLogActivity(action, entity, record, detail){
  try{
    const log = getwellActivityLog();

    log.unshift({
      id: "ACT-" + Date.now().toString(36) + Math.random().toString(36).slice(2,7),
      at: new Date().toISOString(),
      user: getwellAdminProfile().name || "Administrator",
      action: String(action || ""),
      entity: String(entity || ""),
      record: String(record || ""),
      detail: String(detail || "")
    });

    getwellWriteJson(GW_ACTIVITY_LOG_KEY, log.slice(0, GW_ACTIVITY_LIMIT));
  }catch(e){}
}


function getwellClearActivityLog(){
  getwellWriteJson(GW_ACTIVITY_LOG_KEY, []);
}


function getwellFormatDateTime(value){
  const date = new Date(value);
  if(isNaN(date.getTime())) return String(value || "");

  const pad = n => String(n).padStart(2,"0");

  return (
    date.getFullYear() + "-" +
    pad(date.getMonth()+1) + "-" +
    pad(date.getDate()) + "  " +
    pad(date.getHours()) + ":" +
    pad(date.getMinutes())
  );
}


/* ---------------------------------------------------------
   SYNC STATUS  (feeds the Google Sheets notification)
--------------------------------------------------------- */

function getwellSyncStatus(){
  return getwellReadJson(GW_SYNC_STATUS_KEY, {
    lastOkAt: "",
    lastErrorAt: "",
    lastError: ""
  });
}


function getwellRecordSyncStatus(ok, error){
  const status = getwellSyncStatus();

  if(ok){
    status.lastOkAt = new Date().toISOString();
    status.lastError = "";
    status.lastErrorAt = "";
  }else{
    status.lastErrorAt = new Date().toISOString();
    status.lastError = String(error || "Google Sheets is unreachable.");
  }

  getwellWriteJson(GW_SYNC_STATUS_KEY, status);
}


/* =========================================================
   HEADER
========================================================= */

function header(){

  const profile = getwellAdminProfile();

  return `

<header class="topbar">

  <div class="topbar-left">

    <button
      class="nav-toggle"
      id="navToggle"
      type="button"
      aria-label="Open navigation menu"
      aria-expanded="false"
      onclick="toggleMobileNav(event)"
    >☰</button>

    <div class="topbar-titles">

      <div class="page-title">
        ${escapeHtml(document.title.split("|")[0].trim())}
      </div>

      <div class="page-subtitle">
        Getwell Weight Loss Admin
      </div>

    </div>

  </div>


  <div class="topbar-right">

    <button
      class="icon-button search-toggle"
      id="searchToggle"
      type="button"
      aria-label="Search patients"
      onclick="toggleMobileSearch(event)"
    >⌕</button>

    <div class="search-box" id="searchBox">

      <span>⌕</span>

      <input
        id="globalSearch"
        placeholder="Search patient or ID"
      >

    </div>


    <div
      id="notifWrap"
      class="global-notification-wrap"
    >

      <button
        class="icon-button"
        type="button"
        aria-label="Notifications"
        onclick="toggleNotifications(event)"
      >

        🔔

        <span
          class="notification-count"
          id="notifCount"
          hidden
        >0</span>

      </button>


      <div
        id="notifPanel"
        class="global-notification-panel"
        hidden
      >

        <div class="notif-head">

          <div>

            <strong>Notifications</strong>

            <span id="notifHeadSub">Alerts across the whole system</span>

          </div>

          <button
            type="button"
            class="notif-viewall"
            onclick="openAdminNotifications(event)"
          >View all</button>

        </div>


        <div id="notifBody"></div>

      </div>

    </div>


    <button
      class="theme-toggle"
      id="themeToggle"
      type="button"
      aria-label="Switch theme"
      onclick="toggleTheme()"
    >☾</button>


    <div class="admin-menu-wrap" id="adminMenuWrap">

      <button
        class="user-avatar"
        id="adminMenuButton"
        type="button"
        data-admin-initials
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label="Administrator menu"
        onclick="toggleAdminMenu(event)"
      >${escapeHtml(getwellAdminInitials(profile))}</button>


      <div class="admin-menu" id="adminMenu" role="menu" hidden>

        <div class="admin-menu-head">

          <div class="admin-menu-avatar" data-admin-initials>${escapeHtml(getwellAdminInitials(profile))}</div>

          <div class="admin-menu-id">

            <div class="admin-menu-name" data-admin-name>${escapeHtml(profile.name)}</div>

            <div class="admin-menu-role" data-admin-role>${escapeHtml(profile.role)}</div>

          </div>

        </div>


        <button class="admin-menu-item" role="menuitem" type="button" onclick="openAdminProfile(event)">
          <span class="admin-menu-icon">👤</span> My Profile
        </button>

        <button class="admin-menu-item" role="menuitem" type="button" onclick="openAdminNotifications(event)">
          <span class="admin-menu-icon">🔔</span> Notifications
          <span class="admin-menu-badge" id="adminMenuBadge" hidden>0</span>
        </button>

        <button class="admin-menu-item" role="menuitem" type="button" onclick="openActivityLog(event)">
          <span class="admin-menu-icon">📋</span> Activity Log
        </button>

        <button class="admin-menu-item" role="menuitem" type="button" onclick="openAccountSettings(event)">
          <span class="admin-menu-icon">⚙️</span> Account Settings
        </button>

        <div class="admin-menu-sep"></div>

        <button class="admin-menu-item danger" role="menuitem" type="button" onclick="requestLogout(event)">
          <span class="admin-menu-icon">🚪</span> Logout
        </button>

      </div>

    </div>


  </div>

</header>

`;

}


/* =========================================================
   SIDEBAR

   One structure, used by every page through shell():

     MAIN         Dashboard · Patients · Appointments
     MANAGEMENT   Panel · Reports · Settings

   The Settings page can still hide individual modules; when
   a module is switched off its link is not rendered, exactly
   as before.
========================================================= */

function getwellNavItems(){

  return [
    {group:"MAIN", key:"dashboard",    icon:"🏠", label:"Dashboard",    href:"index.html",        feature:null},
    {group:"MAIN", key:"patients",     icon:"👤", label:"Patients",     href:"patients.html",     feature:"patients"},
    {group:"MAIN", key:"appointments", icon:"📅", label:"Appointments", href:"appointments.html", feature:"appointments"},

    {group:"MANAGEMENT", key:"panel",    icon:"🏥", label:"Panel",    href:"panel.html",    feature:"panel"},
    {group:"MANAGEMENT", key:"reports",  icon:"📊", label:"Reports",  href:"reports.html",  feature:"reports"},
    {group:"MANAGEMENT", key:"settings", icon:"⚙️", label:"Settings", href:"settings.html", feature:null}
  ]
  .filter(item => !item.feature || getwellFeatureEnabled(item.feature));

}


function sidebar(
  active
){

  const items = getwellNavItems();

  const link = item => `

    <a
      class="${active === item.key ? "active" : ""}"
      href="${item.href}"
      ${active === item.key ? 'aria-current="page"' : ""}
      onclick="closeMobileNav()"
    >
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-text">${item.label}</span>
    </a>

  `;

  const group = name => {
    const rows = items.filter(item => item.group === name);
    if(!rows.length) return "";

    return `
      <div class="nav-label${name === "MANAGEMENT" ? " nav-label-spaced" : ""}">${name}</div>
      ${rows.map(link).join("")}
    `;
  };

  const profile = getwellAdminProfile();

  return `

<aside class="sidebar" id="appSidebar">


  <div
    class="brand"
    role="button"
    tabindex="0"
    aria-label="Go to Dashboard"
    onclick="goHome()"
    onkeydown="
      if(
        event.key==='Enter' ||
        event.key===' '
      ){
        event.preventDefault();
        goHome()
      }
    "
  >

    <div class="brand-mark">
      G
    </div>


    <div>

      <div class="brand-name">
        GETWELL
      </div>

      <div class="brand-sub">
        Weight Loss Admin
      </div>

    </div>


    <button
      type="button"
      class="sidebar-close"
      aria-label="Close navigation menu"
      onclick="event.stopPropagation();closeMobileNav()"
    >×</button>

  </div>


  <nav class="nav" aria-label="Main navigation">

    ${group("MAIN")}

    ${group("MANAGEMENT")}

  </nav>


  <div class="sidebar-user">

    <button
      type="button"
      class="user-card"
      onclick="openAdminProfile(event)"
    >

      <div class="user-dot" data-admin-initials>${escapeHtml(getwellAdminInitials(profile))}</div>

      <div class="user-card-text">

        <div class="user-name" data-admin-name>${escapeHtml(profile.name)}</div>

        <div class="user-role" data-admin-role>${escapeHtml(profile.role)}</div>

      </div>

    </button>

  </div>


</aside>

`;

}


/* =========================================================
   MOBILE NAVIGATION
========================================================= */

function openMobileNav(){
  document.body.classList.add("nav-open");

  const toggle = document.getElementById("navToggle");
  if(toggle) toggle.setAttribute("aria-expanded","true");
}


function closeMobileNav(){
  document.body.classList.remove("nav-open");

  const toggle = document.getElementById("navToggle");
  if(toggle) toggle.setAttribute("aria-expanded","false");
}


function toggleMobileNav(event){
  if(event) event.stopPropagation();

  if(document.body.classList.contains("nav-open")) closeMobileNav();
  else openMobileNav();
}


function toggleMobileSearch(event){
  if(event) event.stopPropagation();

  const open = document.body.classList.toggle("search-open");

  if(open){
    const input = document.getElementById("globalSearch");
    if(input) setTimeout(() => input.focus(), 30);
  }
}


/* =========================================================
   HOME
========================================================= */

function goHome(){

  window.location.href =
    "index.html";

}


/* =========================================================
   ADMIN MENU
========================================================= */

function closeAdminMenu(){
  const menu = document.getElementById("adminMenu");
  const button = document.getElementById("adminMenuButton");

  if(menu) menu.hidden = true;
  if(button) button.setAttribute("aria-expanded","false");
}


function toggleAdminMenu(event){
  if(event) event.stopPropagation();

  const menu = document.getElementById("adminMenu");
  const button = document.getElementById("adminMenuButton");
  if(!menu) return;

  menu.hidden = !menu.hidden;
  if(button) button.setAttribute("aria-expanded", menu.hidden ? "false" : "true");

  if(!menu.hidden){
    const panel = document.getElementById("notifPanel");
    if(panel) panel.hidden = true;
    getwellRefreshAdminIdentity();
    renderNotifications();
  }
}


function getwellUpdateAdminBadge(){
  const badge = document.getElementById("adminMenuBadge");
  if(!badge) return;

  const count = getwellNotifications().length;
  badge.hidden = count === 0;
  badge.textContent = count > 99 ? "99+" : String(count);
}


/* =========================================================
   ADMIN MODAL  (My Profile / Notifications / Activity Log /
   Account Settings / Logout)

   One reusable modal so it inherits the existing modal
   styling, including dark mode, on every page.
========================================================= */

function getwellAdminOverlays(){

  return `

<div class="modal-wrap admin-modal-wrap" id="adminModal">

  <div class="modal" id="adminModalCard">

    <div class="modal-head">

      <div>
        <h2 id="adminModalTitle">Administrator</h2>
        <p id="adminModalSub"></p>
      </div>

      <button
        type="button"
        class="modal-close"
        aria-label="Close"
        onclick="closeAdminModal()"
      >×</button>

    </div>

    <div class="modal-body" id="adminModalBody"></div>

    <div class="modal-foot" id="adminModalFoot"></div>

  </div>

</div>


<div class="lock-screen" id="lockScreen" hidden>

  <div class="lock-card">

    <div class="lock-mark">G</div>

    <h2 id="lockTitle">Signed out</h2>

    <p id="lockText">
      Your data is safe. Patient records stay in Google Sheets
      and on this device.
    </p>

    <div class="lock-passcode" id="lockPasscodeWrap" hidden>

      <label for="lockPasscode">Passcode</label>

      <input
        id="lockPasscode"
        type="password"
        inputmode="numeric"
        autocomplete="off"
        placeholder="Enter passcode"
        onkeydown="if(event.key==='Enter'){event.preventDefault();signBackIn()}"
      >

      <div class="lock-error" id="lockError" hidden></div>

    </div>

    <button class="primary lock-button" type="button" onclick="signBackIn()">
      Sign back in
    </button>

    <button class="lock-link" type="button" id="lockForgot" hidden onclick="forgotPasscode()">
      Forgot passcode?
    </button>

  </div>

</div>

`;

}


function openAdminModal(title, subtitle, bodyHtml, footHtml, wide){
  const wrap = document.getElementById("adminModal");
  if(!wrap) return;

  closeAdminMenu();
  closeMobileNav();

  document.getElementById("adminModalTitle").textContent = title;
  document.getElementById("adminModalSub").textContent = subtitle || "";
  document.getElementById("adminModalBody").innerHTML = bodyHtml || "";
  document.getElementById("adminModalFoot").innerHTML = footHtml || "";

  const card = document.getElementById("adminModalCard");
  if(card) card.classList.toggle("wide", !!wide);

  wrap.classList.add("show");
}


function closeAdminModal(){
  const wrap = document.getElementById("adminModal");
  if(wrap) wrap.classList.remove("show");
}


/* ---------------------------------------------------------
   MY PROFILE
--------------------------------------------------------- */

function openAdminProfile(event){
  if(event) event.stopPropagation();

  const profile = getwellAdminProfile();

  openAdminModal(
    "My Profile",
    "Administrator details used across the app.",
    `
      <div class="profile-head">

        <div class="profile-avatar" id="profileAvatarPreview">
          ${
            profile.photo
              ? `<img src="${escapeHtml(profile.photo)}" alt="">`
              : escapeHtml(getwellAdminInitials(profile))
          }
        </div>

        <div class="profile-head-actions">
          <label class="secondary file-button">
            Change photo
            <input type="file" id="adminPhotoInput" accept="image/*" hidden onchange="handleAdminPhoto(this)">
          </label>

          <button type="button" class="secondary" onclick="removeAdminPhoto()">Use initials</button>
        </div>

      </div>

      <div class="form-grid" style="margin-top:14px">

        <div class="form-group">
          <label for="adminName">Name</label>
          <input id="adminName" value="${escapeHtml(profile.name)}">
        </div>

        <div class="form-group">
          <label for="adminRole">Role</label>
          <input id="adminRole" value="${escapeHtml(profile.role)}">
        </div>

        <div class="form-group">
          <label for="adminEmail">Email</label>
          <input id="adminEmail" type="email" value="${escapeHtml(profile.email)}">
        </div>

        <div class="form-group">
          <label for="adminPhone">Phone</label>
          <input id="adminPhone" type="tel" value="${escapeHtml(profile.phone)}">
        </div>

        <div class="form-group">
          <label for="adminInitials">Initials (optional)</label>
          <input id="adminInitials" maxlength="2" placeholder="Auto" value="${escapeHtml(profile.initials)}">
        </div>

      </div>
    `,
    `
      <button class="secondary" type="button" onclick="closeAdminModal()">Cancel</button>
      <button class="primary" type="button" onclick="saveAdminProfileForm()">Save Profile</button>
    `
  );
}


function handleAdminPhoto(input){
  const file = input && input.files && input.files[0];
  if(!file) return;

  if(file.size > 700 * 1024){
    getwellNotify("Please choose a photo smaller than 700 KB.","error");
    input.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const preview = document.getElementById("profileAvatarPreview");
    if(preview) preview.innerHTML = `<img src="${reader.result}" alt="">`;
    preview.dataset.photo = String(reader.result);
  };

  reader.readAsDataURL(file);
}


function removeAdminPhoto(){
  const preview = document.getElementById("profileAvatarPreview");
  if(!preview) return;

  preview.dataset.photo = "";
  preview.textContent = getwellAdminInitials(
    Object.assign(getwellAdminProfile(), {
      name: (document.getElementById("adminName")||{}).value || "",
      initials: (document.getElementById("adminInitials")||{}).value || ""
    })
  );
}


function saveAdminProfileForm(){
  const preview = document.getElementById("profileAvatarPreview");
  const current = getwellAdminProfile();

  const photo =
    preview && preview.dataset.photo !== undefined
      ? preview.dataset.photo
      : current.photo;

  getwellSaveAdminProfile({
    name:     (document.getElementById("adminName")||{}).value || "",
    role:     (document.getElementById("adminRole")||{}).value || "",
    email:    (document.getElementById("adminEmail")||{}).value || "",
    phone:    (document.getElementById("adminPhone")||{}).value || "",
    initials: (document.getElementById("adminInitials")||{}).value || "",
    photo:    photo || ""
  });

  getwellLogActivity("Edit","Administrator","My Profile","Administrator details updated");
  getwellNotify("Profile saved.","success");
  closeAdminModal();
}


/* ---------------------------------------------------------
   NOTIFICATIONS

   Categories:
     followUp     Follow-up due / overdue
     appointments Upcoming appointments
     panel        Balance still to claim
     suspended    Suspended panel patients
     sync         Google Sheets synchronization
--------------------------------------------------------- */

function getwellNotifications(){

  const prefs = getwellAdminPrefs().notifications;
  const patients = store().patients || [];
  const list = [];

  if(prefs.followUp !== false){
    alerts().forEach(alert => {
      list.push({
        category: "followUp",
        level: alert.level,
        icon: alert.level === "overdue" ? "⏰" : "🔔",
        title: alert.name,
        text:
          (alert.level === "overdue" ? "Overdue" : "Due for follow-up") +
          " · " + alert.days + " days since last visit.",
        href: "patient-profile.html?patient=" + encodeURIComponent(alert.id),
        sort: 1000 + alert.days
      });
    });
  }

  if(prefs.appointments !== false){
    const today = new Date();
    const todayKey = today.toISOString().slice(0,10);

    const horizon = new Date(today.getTime() + 7 * 86400000)
      .toISOString().slice(0,10);

    patients.forEach(patient => {
      (patient.appointments || []).forEach(appointment => {
        if(!appointment || !appointment.date) return;
        if(appointment.date < todayKey || appointment.date > horizon) return;
        if(appointment.status === "Completed" || appointment.status === "Cancelled") return;

        list.push({
          category: "appointments",
          level: appointment.date === todayKey ? "warning" : "info",
          icon: "📅",
          title: patient.name || patient.id,
          text:
            (appointment.date === todayKey ? "Appointment today" : "Upcoming appointment") +
            " · " + appointment.date +
            (appointment.time ? " " + appointment.time : "") +
            (appointment.type ? " · " + appointment.type : ""),
          href: "patient-profile.html?patient=" + encodeURIComponent(patient.id),
          sort: 800
        });
      });
    });
  }

  if(prefs.panel !== false){
    patients.forEach(patient => {
      if(!patientUsesPanel(patient)) return;

      const money = finance(patient);
      const balance = Math.max(0, (money.grand || 0) - (money.claimed || 0));
      if(balance <= 0) return;

      list.push({
        category: "panel",
        level: "info",
        icon: "🏥",
        title: patient.name || patient.id,
        text:
          "Panel balance still to claim · " +
          getwellMoney(balance) +
          " · " + getPanelName(patient),
        href: "panel.html",
        sort: 600
      });
    });
  }

  if(prefs.suspended !== false){
    patients.forEach(patient => {
      if(!isPanelSuspended(patient)) return;

      list.push({
        category: "suspended",
        level: "overdue",
        icon: "⛔",
        title: patient.name || patient.id,
        text:
          "Panel suspended · " + getPanelName(patient) +
          (panelSuspensionNote(patient) ? " · " + panelSuspensionNote(patient) : ""),
        href: "patient-profile.html?patient=" + encodeURIComponent(patient.id),
        sort: 900
      });
    });
  }

  if(prefs.sync !== false && getwellRemoteConfigured()){
    const status = getwellSyncStatus();

    if(status.lastError){
      list.push({
        category: "sync",
        level: "overdue",
        icon: "☁",
        title: "Google Sheets sync problem",
        text: status.lastError + " (" + getwellFormatDateTime(status.lastErrorAt) + ")",
        href: "",
        sort: 1200
      });
    }else if(status.lastOkAt){
      const minutes = Math.round((Date.now() - Date.parse(status.lastOkAt)) / 60000);

      if(minutes >= 30){
        list.push({
          category: "sync",
          level: "warning",
          icon: "☁",
          title: "Google Sheets not synchronized recently",
          text: "Last successful sync " + getwellFormatDateTime(status.lastOkAt) + ".",
          href: "",
          sort: 1100
        });
      }
    }
  }

  return list.sort((a,b) => (b.sort || 0) - (a.sort || 0));

}


/*
  money() is also the name of a helper used inside these
  functions' local scope, so the notification builder calls
  this alias instead of shadowing it.
*/
function getwellMoney(value){
  return money(value);
}


function toggleNotifications(
  event
){

  if(event){

    event.stopPropagation();

  }


  const panel =
    document.getElementById(
      "notifPanel"
    );


  if(!panel){

    return;

  }


  panel.hidden =
    !panel.hidden;


  if(!panel.hidden){

    closeAdminMenu();
    renderNotifications();

  }

}


function getwellNotificationItemHtml(item, index){

  const clickable = !!item.href;

  return `

    <div
      class="notif-item${clickable ? " clickable" : ""}"
      ${clickable ? `role="button" tabindex="0"` : ""}
      data-notif-index="${index}"
      ${clickable ? `onclick="location.href=this.dataset.href"` : ""}
      ${clickable ? `data-href="${escapeHtml(item.href)}"` : ""}
      ${clickable ? `onkeydown="if(event.key==='Enter'){location.href=this.dataset.href}"` : ""}
    >

      <span class="notif-dot ${escapeHtml(item.level)}"></span>

      <div class="notif-item-main">

        <div class="notif-name">
          <span class="notif-icon">${item.icon}</span>
          ${escapeHtml(item.title)}
        </div>

        <div class="notif-text">${escapeHtml(item.text)}</div>

      </div>

    </div>

  `;

}


function renderNotifications(){

  const list = getwellNotifications();

  const count = document.getElementById("notifCount");
  const body  = document.getElementById("notifBody");
  const sub   = document.getElementById("notifHeadSub");

  getwellUpdateAdminBadge();

  if(!count || !body) return;

  count.hidden = list.length === 0;
  count.textContent = list.length > 99 ? "99+" : String(list.length);

  if(sub){
    const config = getwellFollowUpSettings();
    sub.textContent =
      list.length
        ? list.length + " active alert" + (list.length === 1 ? "" : "s")
        : "Follow-up due after " + config.dueAfterDays + " days";
  }

  if(!list.length){
    body.innerHTML = `<div class="notif-empty">Nothing needs attention right now.</div>`;
    return;
  }

  body.innerHTML =
    list.slice(0,12).map(getwellNotificationItemHtml).join("");

}


function openAdminNotifications(event){
  if(event) event.stopPropagation();

  const panel = document.getElementById("notifPanel");
  if(panel) panel.hidden = true;

  const list = getwellNotifications();

  const groups = [
    {key:"followUp",     label:"Follow-up"},
    {key:"suspended",    label:"Suspended panel"},
    {key:"appointments", label:"Appointments"},
    {key:"panel",        label:"Panel / claims"},
    {key:"sync",         label:"Google Sheets"}
  ];

  const sections = groups.map(group => {
    const rows = list.filter(item => item.category === group.key);
    if(!rows.length) return "";

    return `
      <div class="notif-group">
        <div class="notif-group-head">${group.label} <span>${rows.length}</span></div>
        ${rows.map(getwellNotificationItemHtml).join("")}
      </div>
    `;
  }).join("");

  openAdminModal(
    "Notifications",
    list.length
      ? list.length + " alert" + (list.length === 1 ? "" : "s") + " across the system"
      : "Nothing needs attention right now.",
    sections || `<div class="notif-empty">Nothing needs attention right now.</div>`,
    `
      <button class="secondary" type="button" onclick="openAccountSettings(event)">Notification settings</button>
      <button class="primary" type="button" onclick="closeAdminModal()">Close</button>
    `,
    true
  );
}


/* ---------------------------------------------------------
   ACTIVITY LOG
--------------------------------------------------------- */

function openActivityLog(event){
  if(event) event.stopPropagation();

  openAdminModal(
    "Activity Log",
    "Recent actions recorded on this device.",
    `
      <div class="activity-filters">

        <div class="form-group">
          <label for="activityEntity">Record type</label>
          <select id="activityEntity" onchange="renderActivityLog()">
            <option value="">All records</option>
            <option>Patient</option>
            <option>Appointment</option>
            <option>Visit</option>
            <option>Claim</option>
            <option>Settings</option>
            <option>Administrator</option>
          </select>
        </div>

        <div class="form-group">
          <label for="activityAction">Action</label>
          <select id="activityAction" onchange="renderActivityLog()">
            <option value="">All actions</option>
            <option>Add</option>
            <option>Edit</option>
            <option>Delete</option>
          </select>
        </div>

        <div class="form-group">
          <label for="activitySearch">Search</label>
          <input id="activitySearch" placeholder="Name, ID or detail" oninput="renderActivityLog()">
        </div>

      </div>

      <div class="table-wrap activity-table-wrap">

        <table class="table activity-table">

          <thead>
            <tr>
              <th>Date / Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Record</th>
              <th>Details</th>
            </tr>
          </thead>

          <tbody id="activityRows"></tbody>

        </table>

      </div>
    `,
    `
      <button class="secondary" type="button" onclick="clearActivityLogConfirm()">Clear log</button>
      <button class="primary" type="button" onclick="closeAdminModal()">Close</button>
    `,
    true
  );

  renderActivityLog();
}


function renderActivityLog(){
  const rows = document.getElementById("activityRows");
  if(!rows) return;

  const entity = (document.getElementById("activityEntity")||{}).value || "";
  const action = (document.getElementById("activityAction")||{}).value || "";
  const search = String((document.getElementById("activitySearch")||{}).value || "")
    .trim().toLowerCase();

  const list = getwellActivityLog().filter(entry => {
    if(entity && entry.entity !== entity) return false;
    if(action && entry.action !== action) return false;

    if(search){
      const haystack =
        `${entry.record||""} ${entry.detail||""} ${entry.user||""} ${entry.entity||""} ${entry.action||""}`
        .toLowerCase();

      if(!haystack.includes(search)) return false;
    }

    return true;
  });

  rows.innerHTML =
    list.map(entry => `
      <tr>
        <td>${escapeHtml(getwellFormatDateTime(entry.at))}</td>
        <td>${escapeHtml(entry.user || "Administrator")}</td>
        <td><span class="badge ${
          entry.action === "Delete" ? "red" :
          entry.action === "Add"    ? "green" : "blue"
        }">${escapeHtml(entry.action || "")}</span></td>
        <td><strong>${escapeHtml(entry.entity || "")}</strong><div class="row-sub">${escapeHtml(entry.record || "")}</div></td>
        <td>${escapeHtml(entry.detail || "")}</td>
      </tr>
    `).join("") ||
    `<tr><td colspan="5" class="notif-empty">No activity recorded yet.</td></tr>`;
}


async function clearActivityLogConfirm(){
  const ok = await getwellConfirmDelete("Activity Log");
  if(!ok) return;

  getwellClearActivityLog();
  renderActivityLog();
  getwellNotify("Activity log cleared. No patient data was changed.","success");
}


/* ---------------------------------------------------------
   ACCOUNT SETTINGS
   Administrator account only. The system-wide Settings page
   is untouched and still lives at settings.html.
--------------------------------------------------------- */

function openAccountSettings(event){
  if(event) event.stopPropagation();

  const profile = getwellAdminProfile();
  const prefs = getwellAdminPrefs();

  const check = (id, label, on) => `
    <label class="switch-row" for="${id}">
      <input type="checkbox" id="${id}" ${on ? "checked" : ""}>
      <span>${label}</span>
    </label>
  `;

  openAdminModal(
    "Account Settings",
    "These settings apply to the administrator account only.",
    `
      <div class="visit-section-title">Account</div>

      <div class="form-grid">

        <div class="form-group">
          <label for="acctName">Name</label>
          <input id="acctName" value="${escapeHtml(profile.name)}">
        </div>

        <div class="form-group">
          <label for="acctEmail">Email</label>
          <input id="acctEmail" type="email" value="${escapeHtml(profile.email)}">
        </div>

        <div class="form-group">
          <label for="acctPhone">Phone</label>
          <input id="acctPhone" type="tel" value="${escapeHtml(profile.phone)}">
        </div>

        <div class="form-group">
          <label for="acctRole">Role</label>
          <input id="acctRole" value="${escapeHtml(profile.role)}">
        </div>

      </div>


      <div class="visit-section-title">Security</div>

      <p class="hint">
        This app has no server login. An optional passcode can
        lock this browser after logout. It protects the screen
        only — it is not account authentication, and it never
        affects Google Sheets data.
      </p>

      ${check("acctPasscodeEnabled","Ask for a passcode after logout", prefs.security.passcodeEnabled)}

      <div class="form-grid" style="margin-top:8px">

        <div class="form-group">
          <label for="acctPasscode">Passcode</label>
          <input id="acctPasscode" type="password" inputmode="numeric" placeholder="${prefs.security.passcode ? "Unchanged" : "4–8 digits"}">
        </div>

        <div class="form-group">
          <label for="acctPasscode2">Confirm passcode</label>
          <input id="acctPasscode2" type="password" inputmode="numeric" placeholder="Repeat passcode">
        </div>

      </div>


      <div class="visit-section-title">Notification preferences</div>

      ${check("acctNotifFollowUp","Follow-up due and overdue", prefs.notifications.followUp)}
      ${check("acctNotifAppointments","Upcoming appointments", prefs.notifications.appointments)}
      ${check("acctNotifPanel","Panel / claim balance alerts", prefs.notifications.panel)}
      ${check("acctNotifSuspended","Suspended panel patients", prefs.notifications.suspended)}
      ${check("acctNotifSync","Google Sheets synchronization alerts", prefs.notifications.sync)}


      <div class="visit-section-title">Appearance</div>

      <div class="form-grid">

        <div class="form-group">
          <label for="acctTheme">Theme</label>
          <select id="acctTheme">
            <option value="light"  ${prefs.appearance.theme === "light"  ? "selected" : ""}>Light</option>
            <option value="dark"   ${prefs.appearance.theme === "dark"   ? "selected" : ""}>Dark</option>
            <option value="system" ${prefs.appearance.theme === "system" ? "selected" : ""}>Follow device</option>
          </select>
        </div>

        <div class="form-group">
          <label for="acctDensity">Layout density</label>
          <select id="acctDensity">
            <option value="comfortable" ${prefs.appearance.density !== "compact" ? "selected" : ""}>Comfortable</option>
            <option value="compact"     ${prefs.appearance.density === "compact" ? "selected" : ""}>Compact</option>
          </select>
        </div>

      </div>
    `,
    `
      <button class="secondary" type="button" onclick="closeAdminModal()">Cancel</button>
      <button class="primary" type="button" onclick="saveAccountSettings()">Save Settings</button>
    `,
    true
  );
}


function saveAccountSettings(){
  const value = id => (document.getElementById(id) || {}).value || "";
  const checked = id => !!(document.getElementById(id) || {}).checked;

  const prefs = getwellAdminPrefs();

  const wantsPasscode = checked("acctPasscodeEnabled");
  const entered = value("acctPasscode").trim();
  const confirmed = value("acctPasscode2").trim();

  let passcode = prefs.security.passcode;

  if(entered || confirmed){
    if(entered !== confirmed){
      getwellNotify("The two passcodes do not match.","error");
      return;
    }

    if(entered.length < 4){
      getwellNotify("Please use a passcode of at least 4 characters.","error");
      return;
    }

    passcode = btoa(entered);
  }

  if(wantsPasscode && !passcode){
    getwellNotify("Please set a passcode before switching the lock on.","error");
    return;
  }

  getwellSaveAdminProfile({
    name:  value("acctName"),
    email: value("acctEmail"),
    phone: value("acctPhone"),
    role:  value("acctRole")
  });

  getwellSaveAdminPrefs({
    notifications: {
      followUp:     checked("acctNotifFollowUp"),
      appointments: checked("acctNotifAppointments"),
      panel:        checked("acctNotifPanel"),
      suspended:    checked("acctNotifSuspended"),
      sync:         checked("acctNotifSync")
    },
    appearance: {
      theme:   value("acctTheme")   || "light",
      density: value("acctDensity") || "comfortable"
    },
    security: {
      passcodeEnabled: wantsPasscode,
      passcode: passcode
    }
  });

  if(value("acctTheme") !== "system"){
    applyTheme(value("acctTheme"), true);
  }

  getwellLogActivity("Edit","Administrator","Account Settings","Account preferences updated");
  getwellNotify("Account settings saved.","success");

  renderNotifications();
  closeAdminModal();
}


/* ---------------------------------------------------------
   LOGOUT

   There is no server session to end, so logout locks the
   screen and clears the in-memory view only. It never
   touches:
     - the patient store
     - the Google Sheets data
     - the Google Drive files
     - system settings
--------------------------------------------------------- */

function requestLogout(event){
  if(event) event.stopPropagation();

  openAdminModal(
    "Log out",
    "",
    `
      <p class="logout-text">
        Log out of the Getwell admin screen?
      </p>

      <p class="hint">
        Patient records, visits, claims, appointments and every
        Google Sheets and Google Drive item stay exactly as they
        are. Nothing is deleted.
      </p>
    `,
    `
      <button class="secondary" type="button" onclick="closeAdminModal()">Cancel</button>
      <button class="primary" type="button" onclick="confirmLogout()">Log out</button>
    `
  );
}


function confirmLogout(){
  closeAdminModal();

  getwellLogActivity("Edit","Administrator","Session","Logged out");

  getwellWriteJson(GW_SESSION_KEY, {
    signedIn: false,
    at: new Date().toISOString()
  });

  getwellShowLockScreen();
}


function getwellSessionActive(){
  const session = getwellReadJson(GW_SESSION_KEY, {signedIn:true});
  return session.signedIn !== false;
}


function getwellShowLockScreen(){
  const screen = document.getElementById("lockScreen");
  if(!screen) return;

  const prefs = getwellAdminPrefs();
  const needsPasscode = prefs.security.passcodeEnabled && prefs.security.passcode;

  const wrap = document.getElementById("lockPasscodeWrap");
  const forgot = document.getElementById("lockForgot");
  const error = document.getElementById("lockError");
  const input = document.getElementById("lockPasscode");

  if(wrap)   wrap.hidden = !needsPasscode;
  if(forgot) forgot.hidden = !needsPasscode;
  if(error){ error.hidden = true; error.textContent = ""; }
  if(input)  input.value = "";

  const text = document.getElementById("lockText");
  if(text){
    text.textContent = needsPasscode
      ? "Enter your passcode to return. Patient data and Google Sheets data are untouched."
      : "Your data is safe. Patient records stay in Google Sheets and on this device.";
  }

  screen.hidden = false;
  document.body.classList.add("locked");

  closeAdminMenu();
  closeMobileNav();
}


function signBackIn(){
  const prefs = getwellAdminPrefs();
  const needsPasscode = prefs.security.passcodeEnabled && prefs.security.passcode;

  if(needsPasscode){
    const input = document.getElementById("lockPasscode");
    const error = document.getElementById("lockError");
    const entered = String((input || {}).value || "");

    let stored = "";
    try{ stored = atob(prefs.security.passcode); }catch(e){ stored = ""; }

    if(!entered || entered !== stored){
      if(error){
        error.hidden = false;
        error.textContent = "Incorrect passcode.";
      }
      return;
    }
  }

  getwellWriteJson(GW_SESSION_KEY, {
    signedIn: true,
    at: new Date().toISOString()
  });

  const screen = document.getElementById("lockScreen");
  if(screen) screen.hidden = true;

  document.body.classList.remove("locked");
  renderNotifications();
}


function forgotPasscode(){
  const answer = prompt(
    "Type RESET to remove the screen passcode.\n" +
    "This removes the passcode only. No patient data, " +
    "Google Sheets data or settings are affected."
  );

  if(String(answer || "").trim().toUpperCase() !== "RESET") return;

  getwellSaveAdminPrefs({
    security: {passcodeEnabled:false, passcode:""}
  });

  getwellNotify("Passcode removed.","success");
  getwellShowLockScreen();
}


/* =========================================================
   SHELL
========================================================= */

function shell(
  title,
  active,
  body
){

  document.title =
    title +
    " | Getwell";


  return `

<div class="app">

  ${sidebar(
    active
  )}

  <div
    class="nav-backdrop"
    id="navBackdrop"
    onclick="closeMobileNav()"
  ></div>

  <main class="main">

    ${header()}

    <div class="content">

      ${body}

    </div>

  </main>

</div>

${getwellAdminOverlays()}

`;

}


/* =========================================================
   GLOBAL SEARCH
========================================================= */

function initGlobalSearch(){
  const input = document.getElementById("globalSearch");
  if(!input || input.dataset.bound === "1") return;
  input.dataset.bound = "1";

  const wrap = input.closest(".search-box");
  if(!wrap) return;

  let menu = wrap.querySelector(".global-search-results");
  if(!menu){
    menu = document.createElement("div");
    menu.className = "global-search-results";
    /* Stay out of the way until there is something to show. */
    menu.hidden = true;
    wrap.appendChild(menu);
  }

  const render = () => {
    const q = String(input.value || "").trim().toLowerCase();
    if(!q){
      menu.innerHTML = "";
      menu.hidden = true;
      return;
    }

    const matches = (store().patients || [])
      .filter(p => (`${p.name||""} ${p.id||""} ${p.phone||""} ${getPanelName(p)}`).toLowerCase().includes(q))
      .slice(0,8);

    menu.innerHTML = matches.length
      ? matches.map(p => `
          <button type="button" class="global-search-result"
            onclick="window.location.href='patient-profile.html?patient=${encodeURIComponent(p.id)}'">
            <strong>${escapeHtml(p.name || "Unnamed")}</strong>
            <span>${escapeHtml(p.id || "")} · ${escapeHtml(getPanelName(p))}</span>
          </button>
        `).join("")
      : `<div class="global-search-empty">No patients found.</div>`;

    menu.hidden = false;
  };

  input.addEventListener("input", render);
  input.addEventListener("keydown", event => {
    if(event.key === "Enter"){
      const first = menu.querySelector(".global-search-result");
      if(first) first.click();
    }
    if(event.key === "Escape"){
      menu.hidden = true;
      input.blur();
    }
  });

  document.addEventListener("click", event => {
    if(!wrap.contains(event.target)) menu.hidden = true;
  });
}

/* =========================================================
   CLOSE POPOVERS ON OUTSIDE CLICK
========================================================= */

document.addEventListener(
  "click",
  event => {

    const wrapper =
      document.getElementById(
        "notifWrap"
      );


    const panel =
      document.getElementById(
        "notifPanel"
      );


    if(
      wrapper &&
      panel &&
      !wrapper.contains(
        event.target
      )
    ){

      panel.hidden =
        true;

    }


    const adminWrap =
      document.getElementById(
        "adminMenuWrap"
      );


    if(
      adminWrap &&
      !adminWrap.contains(
        event.target
      )
    ){

      closeAdminMenu();

    }


    const searchBox =
      document.getElementById(
        "searchBox"
      );


    const searchToggle =
      document.getElementById(
        "searchToggle"
      );


    if(
      document.body.classList.contains("search-open") &&
      searchBox &&
      !searchBox.contains(event.target) &&
      (!searchToggle || !searchToggle.contains(event.target))
    ){

      document.body.classList.remove("search-open");

    }

  }
);


document.addEventListener(
  "keydown",
  event => {

    if(event.key !== "Escape") return;

    closeAdminMenu();
    closeMobileNav();

    document.body.classList.remove("search-open");

    const panel = document.getElementById("notifPanel");
    if(panel) panel.hidden = true;

    const modal = document.getElementById("adminModal");
    if(modal && modal.classList.contains("show")) closeAdminModal();

  }
);


/* =========================================================
   SETTINGS UPDATE
========================================================= */

window.addEventListener(
  "storage",
  event => {

    if(
      event.key ===
      GW_SETTINGS_UPDATED_KEY
    ){

      /*
        Settings page stays open.

        Every other page reloads so
        the new configuration applies.
      */

      if(
        !location.pathname
          .toLowerCase()
          .endsWith(
            "settings.html"
          )
      ){

        location.reload();

      }

    }

  }
);


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    /*
      Only READ settings here.

      Do not call:
      getSettings()
      saveSettings()
      mergeSettings()
      because those belong to
      settings.html.
    */

    getwellSystemSettings();


    initTheme();
    getwellApplyAppearance();
    getwellRefreshAdminIdentity();
    initGlobalSearch();

    renderNotifications();


    /*
      No server session exists, so "logged out" is a locked
      screen on this browser only. Data is never cleared.
    */
    if(!getwellSessionActive()){
      getwellShowLockScreen();
    }


    getwellStartRemoteSync();

  }
);


/* =========================================================
   KEEP THE ALERT COUNT FRESH
   Notifications are derived, not stored, so they follow the
   data automatically. A slow refresh keeps the badge honest
   when a page is left open all day.
========================================================= */

setInterval(
  () => {
    try{ renderNotifications(); }catch(e){}
  },
  60000
);
   
