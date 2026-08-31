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
   CALENDAR DATES  (DATE-ONLY, TIMEZONE-SAFE)

   ROOT CAUSE OF THE "VISIT DATE SHIFTS BY ONE DAY" BUG
   ---------------------------------------------------------
   Visit Date, Date of Birth, Program Start Date, Appointment
   Date and Claim Date are CALENDAR DATES, not instants in
   time. They must never be turned into a JavaScript Date and
   then serialised with toISOString(), because toISOString()
   renders in UTC. In Malaysia (GMT+8) the calendar date
   2025-11-13 becomes "2025-11-12T16:00:00.000Z" -- the day
   before.

   The same trap exists on the Google Sheets side: writing the
   string "2025-11-13" into a cell whose number format is
   "automatic" makes Sheets store a real date/time value, and
   reading it back hands Apps Script a Date object that then
   gets rendered in whatever timezone happens to be active.

   Everything below keeps calendar dates as plain
   "YYYY-MM-DD" strings from the <input type="date"> all the
   way to the Sheet and back.
========================================================= */

/*
  Local calendar day for a JS Date. Uses the LOCAL parts, so
  it never crosses a day boundary the way toISOString() does.
*/
function getwellIsoDay(date){
  const pad = n => String(n).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}


/*
  Today's calendar date in the browser's own timezone.
  Replaces every `getwellTodayKey()`, which
  in GMT+8 returned YESTERDAY between 00:00 and 08:00.
*/
function getwellTodayKey(){
  return getwellIsoDay(new Date());
}


/*
  THE SINGLE NORMALISER for every date-only value in the app.

  - ""                          -> ""
  - "2025-11-13"                -> "2025-11-13"   (untouched)
  - "2025-11-13T00:00:00"       -> "2025-11-13"   (no zone: plain slice)
  - "2025-11-12T16:00:00.000Z"  -> "2025-11-13"   (zoned: converted back
                                                   to the local calendar
                                                   day, which is what the
                                                   user originally picked)
  - Date object                 -> its local calendar day
  - "13/11/2025" or "13-11-2025"-> "2025-11-13"
  - anything else               -> "" rather than corrupt data

  The zoned branch is what repairs records already stored in
  Google Sheets as full ISO timestamps: it is a lossless
  round-trip back to the day the user actually selected.
*/
function getwellDateKey(value){
  if(value === null || value === undefined || value === "") return "";

  if(value instanceof Date){
    return Number.isNaN(value.getTime()) ? "" : getwellIsoDay(value);
  }

  const text = String(value).trim();
  if(!text) return "";

  /* Already a plain calendar date. */
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  /* ISO datetime carrying a timezone (Z or +08:00): re-render locally. */
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(text)){
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? text.slice(0,10) : getwellIsoDay(parsed);
  }

  /* ISO datetime with no timezone: the date part is already local. */
  if(/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0,10);

  /* dd/mm/yyyy or dd-mm-yyyy, as typed by hand into the Sheet. */
  const dmy = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(dmy){
    const pad = n => String(n).padStart(2,"0");
    return `${dmy[3]}-${pad(dmy[2])}-${pad(dmy[1])}`;
  }

  /* yyyy/mm/dd */
  const ymd = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if(ymd){
    const pad = n => String(n).padStart(2,"0");
    return `${ymd[1]}-${pad(ymd[2])}-${pad(ymd[3])}`;
  }

  /* Last resort: let the engine try, but only accept a real date. */
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : getwellIsoDay(parsed);
}


/*
  Walks the whole store and rewrites every calendar date to
  "YYYY-MM-DD". Called from store(), so EVERY page - profile,
  patients, appointments, panel, reports, dashboard - sees
  normalised dates without each of them having to remember.

  Legacy rows already holding "2025-11-12T16:00:00.000Z" are
  repaired here, and the repair is written back to
  localStorage once so the next save pushes the clean value
  to Google Sheets.
*/
function getwellNormalizeStoreDates(data){
  if(!data || !Array.isArray(data.patients)) return data;

  let changed = false;

  const fix = (record, field) => {
    if(!record || record[field] === undefined || record[field] === null) return;
    const next = getwellDateKey(record[field]);
    if(next !== record[field]){
      record[field] = next;
      changed = true;
    }
  };

  data.patients.forEach(patient => {
    if(!patient) return;

    fix(patient, "dob");
    fix(patient, "startDate");

    (patient.visits || []).forEach(visit => {
      if(!visit) return;
      /* Some very old rows used `date` instead of `dateKey`. */
      if(!visit.dateKey && visit.date) visit.dateKey = visit.date;
      fix(visit, "dateKey");
      if(visit.date !== undefined) fix(visit, "date");
    });

    (patient.appointments || []).forEach(appointment => fix(appointment, "date"));
    (patient.claims || []).forEach(claim => fix(claim, "claimDate"));
    (patient.measurements || []).forEach(measurement => fix(measurement, "date"));
  });

  if(changed){
    try{
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    }catch(e){}
  }

  return data;
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

    /*
      VISIT TYPES

      Visit Type used to be a free-text box on the Add Visit
      form, so every member of staff spelled it differently and
      nothing could be reported on reliably. It is now a
      dropdown fed from here, managed in
      Settings -> Doctors & Charges -> Visit Types.

      Same shape as the other catalogs on purpose:
      {id, name, enabled}. `enabled:false` removes a type from
      NEW visits while leaving every historical visit that
      already used it untouched.
    */
    visitTypes: [
      {id:"VT-CONSULTATION",  name:"Consultation",       enabled:true},
      {id:"VT-FOLLOWUP",      name:"Follow-up",          enabled:true},
      {id:"VT-INJECTION",     name:"Injection",          enabled:true},
      {id:"VT-REVIEW",        name:"Weight Loss Review", enabled:true},
      {id:"VT-MEDREVIEW",     name:"Medication Review",  enabled:true},
      {id:"VT-PROCEDURE",     name:"Procedure",          enabled:true},
      {id:"VT-OTHER",         name:"Other",              enabled:true}
    ],

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
      specialIntervals: [],
      messageTemplate: [
        "Greetings from GetWell Clinic Puncak Alam ☺️",
        "",
        "We would like to follow up regarding your next weight loss injection appointment.",
        "",
        "May we know your preferred date and time so that we can arrange your appointment accordingly? Thank you 🙏"
      ].join("\n")
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

/*
  Every configured item INCLUDING the disabled ones.

  getwellChargeCatalog() above filters to what may be chosen
  for a NEW visit. History needs the unfiltered list: a visit
  saved last month that used an item since disabled must still
  show that item's real name when it is reopened.
*/
function getwellChargeCatalogAll(){
  const settings = getwellSystemSettings();
  const source = settings.chargeCatalog || {};
  return ["Injection","Medication","Treatment","Additional"].reduce((out, category) => {
    out[category] = Array.isArray(source[category])
      ? source[category].filter(item => item && String(item.name || "").trim())
      : [];
    return out;
  }, {});
}

function getwellChargeItem(category, id){
  return getwellChargeCatalog()[category]?.find(item => String(item.id) === String(id)) || null;
}

/* Lookup across enabled AND disabled items, for historical rows. */
function getwellChargeItemAny(category, id){
  if(!id) return null;
  return getwellChargeCatalogAll()[category]?.find(item => String(item.id) === String(id)) || null;
}

function getwellChargePrice(category, id){
  const item = getwellChargeItem(category, id);
  return item ? Number(item.price) || 0 : 0;
}


/* =========================================================
   VISIT TYPES  (Settings -> Doctors & Charges -> Visit Types)

   Mirrors the doctor / charge-catalog readers exactly, so the
   Visit Type dropdown behaves like every other Settings-driven
   dropdown in the application.
========================================================= */

/* Every configured type, including disabled ones. */
function getwellAllVisitTypes(){
  const settings = getwellSystemSettings();
  return Array.isArray(settings.visitTypes)
    ? settings.visitTypes.filter(type => type && String(type.name || "").trim())
    : [];
}

/* Only the types that may be chosen for a NEW visit. */
function getwellVisitTypes(){
  return getwellAllVisitTypes().filter(type => type.enabled !== false);
}

/*
  The visit record stores the type NAME, not an id, exactly as
  it always did. That keeps every historical visit readable
  and keeps the Visits sheet's `Type` column unchanged.
*/
function getwellVisitTypeOptions(){
  return getwellVisitTypes().map(type => ({
    id: type.id || String(type.name).trim(),
    name: String(type.name).trim()
  }));
}

function getwellDefaultVisitType(){
  return getwellVisitTypes()[0]?.name || "";
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

function getwellSuggestedFollowUpDate(dateValue,days){
  const base=getwellDateKey(dateValue);
  if(!base) return "";
  const d=new Date(base+"T00:00:00");
  if(Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate()+Math.max(1,Number(days)||5));
  /* Local parts, not toISOString(): in GMT+8 the latter
     returned the previous calendar day. */
  return getwellIsoDay(d);
}

function getwellHasFutureAppointment(patient){
  const today=getwellTodayKey();
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
  const settings = getwellSystemSettings();
  const f = settings.followUp || {};

  return {
    dueAfterDays: Math.max(1, Number(f.dueAfterDays) || 5),
    overdueAfterDays: Math.max(1, Number(f.overdueAfterDays) || 7),
    defaultDays: Math.max(1, Number(f.defaultDays) || Number(f.dueAfterDays) || 5),
    minDays: Math.max(1, Number(f.minDays) || 1),
    maxDays: Math.max(1, Number(f.maxDays) || 30),
    specialIntervals: Array.isArray(f.specialIntervals) ? f.specialIntervals : [],
    messageTemplate:
      typeof f.messageTemplate === "string" && f.messageTemplate.trim()
        ? f.messageTemplate
        : [
            "Greetings from GetWell Clinic Puncak Alam ☺️",
            "",
            "We would like to follow up regarding your next weight loss injection appointment.",
            "",
            "May we know your preferred date and time so that we can arrange your appointment accordingly? Thank you 🙏"
          ].join("\n")
  };
}

function getwellFollowUpRecords(){
  const config = getwellFollowUpSettings();
  const today = getwellTodayKey();

  return (store().patients || [])
    .map(patient => {
      if(!patient) return null;

      const last = latestVisit(patient);
      const lastVisitDate = last?.dateKey || "";
      const daysSinceLastVisit = lastVisitDate ? daysSince(lastVisitDate) : null;

      if(daysSinceLastVisit === null || daysSinceLastVisit < Math.max(1, config.dueAfterDays - 1)){
        return null;
      }

      const nextExpectedVisit = getwellSuggestedFollowUpDate(lastVisitDate, config.defaultDays);

      const upcomingAppointment = (patient.appointments || [])
        .filter(a =>
          a &&
          a.date &&
          String(a.date).slice(0,10) >= today &&
          a.status !== "Cancelled" &&
          a.status !== "No Show"
        )
        .sort((a,b) =>
          `${a.date||""} ${a.time||""}`.localeCompare(`${b.date||""} ${b.time||""}`)
        )[0] || null;

      const highAttentionThreshold = Math.max(config.overdueAfterDays, config.overdueAfterDays * 2);

      let status = "Due Soon";
      let level = "soon";

      if(daysSinceLastVisit >= highAttentionThreshold){
        status = "High Attention";
        level = "danger";
      }else if(daysSinceLastVisit >= config.overdueAfterDays){
        status = "Overdue";
        level = "overdue";
      }else if(daysSinceLastVisit >= config.dueAfterDays){
        status = "Due";
        level = "due";
      }

      return {
        id: patient.id,
        name: patient.name,
        phone: patient.phone || "",
        patient,
        lastVisit: lastVisitDate,
        nextExpectedVisit,
        daysSinceLastVisit,
        daysOverdue: Math.max(0, daysSinceLastVisit - config.overdueAfterDays),
        upcomingAppointment,
        programmeStatus: patient.status || "Active",
        status,
        level
      };
    })
    .filter(Boolean)
    .sort((a,b) => {
      const priority = {danger:0, overdue:1, due:2, soon:3};
      return (priority[a.level] - priority[b.level]) ||
        (b.daysSinceLastVisit - a.daysSinceLastVisit) ||
        String(a.name||"").localeCompare(String(b.name||""));
    });
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
const GETWELL_REMOTE_BASELINE_KEY = "GETWELL_REMOTE_BASELINE_V3";
const GETWELL_PERSISTED_STORE_KEY = "GETWELL_PERSISTED_STORE_V2";

/* Records this browser has created but has NOT seen confirmed on a
   row in Google Sheets. See the OUTBOX section below. */
const GETWELL_UNCONFIRMED_KEY = "GETWELL_UNCONFIRMED_V1";

/* The Code.gs contract this build expects. A deployment that does
   not report a version at all is older than the verified-write
   backend and cannot prove that a visit reached the sheet. */
const GETWELL_REQUIRED_BACKEND = "2026-08-31.verified-writes.3";

const GETWELL_RECORD_KEYS =
  ["patients","appointments","visits","charges","claims","files"];

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


/* =========================================================
   THE OUTBOX
   ---------------------------------------------------------
   Google Sheets is the database. localStorage is a cache and
   a QUEUE, never the record of truth.

   Every ID this browser has written but has not yet seen
   confirmed on a row in the spreadsheet is listed here. Two
   rules follow from that list, and together they are what
   stops a visit from disappearing:

     1. An unconfirmed record is retried on the next sync.
     2. An unconfirmed record is NEVER removed by the
        synchroniser. "Absent from the Sheets response" means
        "not written yet", not "deleted".

   An ID leaves the outbox only when the backend has read it
   back off a row, or when a remote snapshot contains it.
========================================================= */

function getwellUnconfirmed(){
  try{
    const raw = localStorage.getItem(GETWELL_UNCONFIRMED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const out = {};
    GETWELL_RECORD_KEYS.forEach(key => {
      out[key] = new Set((Array.isArray(parsed[key]) ? parsed[key] : []).map(String));
    });
    return out;
  }catch(e){
    const out = {};
    GETWELL_RECORD_KEYS.forEach(key => { out[key] = new Set(); });
    return out;
  }
}

function getwellWriteUnconfirmed(sets){
  try{
    const plain = {};
    GETWELL_RECORD_KEYS.forEach(key => { plain[key] = [...(sets[key] || [])]; });
    localStorage.setItem(GETWELL_UNCONFIRMED_KEY, JSON.stringify(plain));
  }catch(e){}
}

function getwellMarkUnconfirmed(ids){
  const sets = getwellUnconfirmed();
  GETWELL_RECORD_KEYS.forEach(key => {
    (ids?.[key] || []).forEach(id => sets[key].add(String(id)));
  });
  getwellWriteUnconfirmed(sets);
}

function getwellMarkConfirmed(ids){
  const sets = getwellUnconfirmed();
  GETWELL_RECORD_KEYS.forEach(key => {
    (ids?.[key] || []).forEach(id => sets[key].delete(String(id)));
  });
  getwellWriteUnconfirmed(sets);
}

function getwellHasUnconfirmed(){
  const sets = getwellUnconfirmed();
  return GETWELL_RECORD_KEYS.some(key => sets[key].size > 0);
}


/* ---------------------------------------------------------
   WHAT THIS PAYLOAD CLAIMS TO BE SAVING

   Mirrors exactly what Code.gs turns into rows, including the
   fallback FileID it generates for a photo that has no id of
   its own, so the two sides agree on what "confirmed" means.
--------------------------------------------------------- */

function getwellExpectedRemoteIds(payload){
  const ids = {};
  GETWELL_RECORD_KEYS.forEach(key => { ids[key] = []; });

  (payload?.patients || []).forEach(patient => {
    if(!patient || !patient.id) return;
    ids.patients.push(String(patient.id));

    (patient.appointments || []).forEach(appointment => {
      if(appointment && appointment.id) ids.appointments.push(String(appointment.id));
    });

    (patient.claims || []).forEach(claim => {
      if(claim && claim.id) ids.claims.push(String(claim.id));
    });

    (patient.visits || []).forEach(visit => {
      if(!visit || !visit.id) return;
      const visitId = String(visit.id);
      ids.visits.push(visitId);

      (visit.charges || []).forEach(charge => {
        if(charge && charge.id) ids.charges.push(String(charge.id));
      });

      /* Only Drive-backed photos become rows; device-only ones do not. */
      (visit.photos || []).forEach((photo, position) => {
        if(!photo || !photo.driveId) return;
        ids.files.push(String(photo.id || ("FILE-" + visitId + "-" + (position + 1))));
      });
    });
  });

  return ids;
}


/* ---------------------------------------------------------
   DID THE BACKEND ACTUALLY STORE IT?

   ROOT CAUSE OF "THE VISITS TAB IS EMPTY BUT THE APP SAID
   THE VISIT WAS SAVED"
   ---------------------------------------------------------
   The old code took `ok:true` from Apps Script as proof and
   went no further. `ok:true` is not proof. A deployment that
   is behind this file, that ignores visits, or that dies after
   writing the Patients sheet all answer `ok:true` just as
   happily -- which is why the patient appeared in the sheet
   and the visit did not, with no error anywhere.

   Code.gs now reads every ID back OFF A ROW after writing and
   returns them in `verified`. This function refuses to call a
   save successful unless every ID that went out came back in
   that list.
--------------------------------------------------------- */

function getwellVerifyRemoteSave(expected, payload){
  if(!payload || !payload.verified){
    return {
      ok:false,
      stale:true,
      error:
        "The Google Apps Script deployment is older than this version of the app " +
        "and cannot confirm that the record reached the spreadsheet. Re-paste Code.gs, " +
        "run setupGetwell(), then Deploy \u2192 Manage deployments \u2192 edit \u2192 Version: New version."
    };
  }

  const missing = {};
  let shortfall = 0;

  GETWELL_RECORD_KEYS.forEach(key => {
    const confirmed = new Set((payload.verified[key] || []).map(String));
    const gone = (expected[key] || []).filter(id => !confirmed.has(String(id)));
    if(gone.length){
      missing[key] = gone;
      shortfall += gone.length;
    }
  });

  if(shortfall){
    const detail = Object.keys(missing)
      .map(key => missing[key].length + " " + key + " (" + missing[key].slice(0, 3).join(", ") + ")")
      .join("; ");

    return {
      ok:false,
      missing,
      error:"Google Sheets did not store: " + detail + "."
    };
  }

  return {ok:true};
}


/* ---------------------------------------------------------
   WRITE  (Web -> Sheets)
   Real CORS request so the reply can actually be read.
   Resolves {ok:true} or {ok:false, error:"..."}.
--------------------------------------------------------- */

function getwellRemoteSave(data){
  const sanitized = getwellSanitizeForRemote(data);
  const expected  = getwellExpectedRemoteIds(sanitized);

  const fail = (message, extra) => {
    getwellRecordSyncStatus(false, message);
    getwellMarkUnconfirmed(expected);
    return Object.assign({ok:false, error:message, expected}, extra || {});
  };

  if(!getwellRemoteConfigured()){
    return Promise.resolve(fail("Google Sheets URL is not configured."));
  }

  try{
    localStorage.setItem(GETWELL_REMOTE_SAVE_KEY, String(Date.now()));
  }catch(e){}

  return fetch(
    GETWELL_SHEETS_API_URL,
    {
      method: "POST",
      headers: {"Content-Type": "text/plain;charset=utf-8"},
      body: JSON.stringify({action:"save", data:sanitized})
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
        return fail(
          "Google Sheets rejected the save. Check the Apps Script deployment is shared with \"Anyone\"."
        );
      }

      if(!payload || !payload.ok){
        return fail(
          (payload && payload.error) || "Google Sheets returned an unknown error.",
          {missing: payload && payload.missing}
        );
      }

      /*
        ok:true is where the old code stopped. It is not enough.
        Every ID that went out must come back in payload.verified,
        which Code.gs builds by reading the ID column back OFF THE
        SHEET after writing.
      */
      const proof = getwellVerifyRemoteSave(expected, payload);

      if(!proof.ok){
        return fail(proof.error, {missing:proof.missing, stale:proof.stale});
      }

      getwellRecordSyncStatus(true);
      getwellMarkConfirmed(expected);

      return {
        ok:true,
        verified:true,
        saved:payload.saved || null,
        confirmed:payload.verified,
        version:payload.version || ""
      };
    })
    .catch(error => fail(
      "Unable to reach Google Sheets. " +
      (error && error.message ? error.message : "Check the connection.")
    ));
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

/* =========================================================
   THE BASELINE
   ---------------------------------------------------------
   The baseline answers one question: "which records did Google
   Sheets confirm it was holding, the last time we looked?"

   The old code answered it with getwellSetRemoteBaseline(snapshot)
   from inside saveStore() -- i.e. with the browser's OWN copy of
   the data, which had never been confirmed by anything. That is
   the second half of the reported bug. Once the browser believed
   the sheet was holding a visit it had in fact never stored, the
   next 30-second poll saw the visit "missing from the sheet",
   concluded it had been deleted, and removed it from
   localStorage too.

   A baseline is now stamped with where it came from, and only a
   baseline read back out of Google Sheets ("remote") is ever
   allowed to justify a deletion.
========================================================= */

function getwellReadBaseline(){
  try{
    const raw = localStorage.getItem(GETWELL_REMOTE_BASELINE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed) return null;

    /* Older builds stored the bare store. Treat it as untrusted. */
    if(Array.isArray(parsed.patients)) return {source:"legacy", store:parsed};

    return parsed.store ? parsed : null;
  }catch(e){ return null; }
}

/* The store part, whatever its origin. Used for diffing deletions
   the USER made in this browser. */
function getwellRemoteBaseline(){
  const baseline = getwellReadBaseline();
  return baseline ? baseline.store : null;
}

/* The store part ONLY when it genuinely came from Google Sheets.
   Used for the one operation that removes data. */
function getwellAuthoritativeBaseline(){
  const baseline = getwellReadBaseline();
  return baseline && baseline.source === "remote" ? baseline.store : null;
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


function getwellSetRemoteBaseline(remote, source){
  try{
    localStorage.setItem(
      GETWELL_REMOTE_BASELINE_KEY,
      JSON.stringify({
        source: source || "remote",
        at:     new Date().toISOString(),
        store:  getwellClone(remote || {patients:[]})
      })
    );
  }catch(e){}
}

function getwellChildIds(patient,field){
  return new Set((patient?.[field]||[]).filter(x=>x&&x.id).map(x=>String(x.id)));
}

/*
   Removes, from this browser, records that Google Sheets has
   genuinely had deleted out from under it.

   THREE GUARDS, all of them absent before:

   1. `baseline` must have come from an actual Sheets read
      (getwellAuthoritativeBaseline). A snapshot of our own
      unconfirmed local data can no longer authorise a deletion.

   2. A record listed in the outbox -- created here, never yet
      confirmed on a row -- is never removed. Its absence from
      the response means "not written yet", not "deleted".

   3. A failed request never reaches this function at all, so a
      network error still cannot masquerade as a deletion.
*/
function getwellReconcileRemoteDeletions(local,remote,baseline){
  if(!baseline||!Array.isArray(baseline.patients)) return local;

  const pending=getwellUnconfirmed();

  const remotePatients=new Map((remote.patients||[]).filter(p=>p&&p.id).map(p=>[String(p.id),p]));
  const baselinePatients=new Map((baseline.patients||[]).filter(p=>p&&p.id).map(p=>[String(p.id),p]));

  const patients=(local.patients||[])
    .filter(lp=>{
      if(!lp||!lp.id) return false;
      const id=String(lp.id);
      if(pending.patients.has(id)) return true;
      return !(baselinePatients.has(id)&&!remotePatients.has(id));
    })
    .map(lp=>{
      const id=String(lp.id), rp=remotePatients.get(id), bp=baselinePatients.get(id);
      if(!rp||!bp) return lp;
      const out=getwellClone(lp);
      ["appointments","visits","claims"].forEach(field=>{
        const oldIds=getwellChildIds(bp,field);
        const newIds=getwellChildIds(rp,field);
        if(!oldIds.size) return;
        out[field]=(out[field]||[]).filter(child=>{
          if(!child||!child.id) return false;
          const childId=String(child.id);
          if(pending[field] && pending[field].has(childId)) return true;
          return !(oldIds.has(childId)&&!newIds.has(childId));
        });
      });
      return out;
    });

  return {...local,patients};
}


/*
   When the remote copy of a patient wins the timestamp contest,
   the whole local record used to be thrown away -- including a
   visit saved here seconds ago that simply had not reached the
   sheet yet. Anything still in the outbox is carried across.
*/
function getwellPreserveUnconfirmedChildren(incoming, existing){
  if(!incoming || !existing) return incoming;

  const pending = getwellUnconfirmed();

  ["visits","appointments","claims"].forEach(field => {
    const have = new Set((incoming[field] || []).filter(x => x && x.id).map(x => String(x.id)));

    (existing[field] || []).forEach(child => {
      if(!child || !child.id) return;
      const childId = String(child.id);
      if(have.has(childId)) return;
      if(!(pending[field] && pending[field].has(childId))) return;

      if(!Array.isArray(incoming[field])) incoming[field] = [];
      incoming[field].push(getwellClone(child));
    });
  });

  return incoming;
}

/* =========================================================
   CANONICAL RECORD COMPARISON
   ---------------------------------------------------------
   WHY THIS EXISTS  (root cause of the reloading page)

   A patient held in this browser and the SAME patient
   reassembled by Code.gs out of the Sheet are never
   byte-identical, because the Sheet only stores a subset of
   the fields:

     dropped on the way through the Sheet
       visit.injection, visit.dose, visit.medication,
       visit.additionalTreatment, visit.otherName
       appointment.source, appointment.autoGenerated,
       appointment.followUpDays, appointment.sourceVisitId,
       appointment.manuallyEdited
     added on the way back
       patient.photoDriveId, patient.photoUrl

   The merge below used to settle an equal-timestamp tie with
   a raw JSON.stringify() comparison, so it declared "the
   remote copy is different" on EVERY single poll even when
   nothing whatsoever had changed. That verdict is what made
   the old code reload the document every 30 seconds.

   getwellCanonicalPatient() projects a record down to exactly
   the fields that survive a Sheet round-trip, in a stable
   order, with stable types. Two records that mean the same
   thing now compare equal, so a sync only reports a change
   when the data genuinely differs.
========================================================= */

function getwellSyncText(value){
  return String(value === undefined || value === null ? "" : value);
}

function getwellSyncNumber(value){
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getwellSyncPick(source, textKeys, numberKeys, dateKeys){
  const out = {};
  (textKeys || []).forEach(key => { out[key] = getwellSyncText(source?.[key]); });
  (numberKeys || []).forEach(key => { out[key] = getwellSyncNumber(source?.[key]); });
  /* Dates go through the one normaliser, so "2025-11-13" and a
     legacy "2025-11-12T16:00:00.000Z" are recognised as the
     same calendar day instead of looking like an edit. */
  (dateKeys || []).forEach(key => { out[key] = getwellDateKey(source?.[key]); });
  return out;
}

function getwellSyncSorted(list, build){
  return (Array.isArray(list) ? list : [])
    .filter(item => item && item.id)
    .map(build)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function getwellCanonicalPatient(patient){
  if(!patient) return null;

  return {
    ...getwellSyncPick(
      patient,
      ["id","name","initials","status","panelProvider","otherPanelName","panelStatus",
       "panelSuspensionNote","phone","gender","height","doctor","photoDriveId","photoUrl"],
      ["startingWeight","currentWeight","goalWeight"],
      ["dob","startDate"]
    ),

    visits: getwellSyncSorted(patient.visits, visit => ({
      ...getwellSyncPick(
        visit,
        ["id","visit","type","weight","invoiceReference","notes","status","pdfName","arboleafText"],
        [],
        ["dateKey"]
      ),
      panel:   getwellSyncNumber(visit.billing?.panel),
      selfPay: getwellSyncNumber(visit.billing?.selfPay),
      pdfDriveId: getwellSyncText(visit.pdfFile?.driveId),
      pdfUrl:     getwellSyncText(visit.pdfFile?.url),
      metrics: JSON.stringify(visit.arboleafMetrics || {}),
      charges: getwellSyncSorted(visit.charges, charge => ({
        ...getwellSyncPick(charge, ["id","category","itemId","itemName","notes"], ["price"]),
      })),
      /* Only Drive-backed files reach the Sheet, so device-only
         photos must not count as a difference. */
      photos: getwellSyncSorted(
        (visit.photos || []).filter(photo => photo && photo.driveId),
        photo => getwellSyncPick(photo, ["id","name","driveId","url"])
      )
    })),

    appointments: getwellSyncSorted(patient.appointments, appointment => ({
      ...getwellSyncPick(
        appointment,
        ["id","time","doctor","type","status","notes"],
        [],
        ["date"]
      )
    })),

    claims: getwellSyncSorted(patient.claims, claim => ({
      ...getwellSyncPick(claim, ["id","visitId","status","notes"], ["amount"], ["claimDate"])
    }))
  };
}

/* True when two records carry the same information as far as
   Google Sheets is concerned. */
function getwellSameRecord(a, b){
  return JSON.stringify(getwellCanonicalPatient(a)) ===
         JSON.stringify(getwellCanonicalPatient(b));
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
    const adopt=incoming=>getwellPreserveUnconfirmedChildren(
      getwellPreserveLocalPhoto(getwellClone(incoming),mine),
      mine
    );
    if(rt>lt){byId.set(id,adopt(p));remoteWon=true;}
    else if(lt>rt){localWon=true;}
    /* Equal timestamps: compare what the Sheet actually stores,
       not the raw objects. See getwellCanonicalPatient(). */
    else if(!getwellSameRecord(mine,p)){byId.set(id,adopt(p));remoteWon=true;}
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

/* =========================================================
   UI-SAFE BACKGROUND REFRESH
   ---------------------------------------------------------
   Background synchronisation must never destroy what the user
   is doing. It previously called location.reload(), which threw
   away the whole document: an open Add Visit / Edit Patient /
   Add Appointment / Add Claim modal vanished mid-typing, the
   active tab reset to Overview, and search boxes cleared.

   Synchronisation itself is unchanged and still runs every
   30 seconds in both directions. What changed is how the
   result reaches the screen:

     merge -> write localStorage -> emit "getwell:data-updated"

   Each page listens for that event and re-renders its own
   lists in place. Nothing reloads.

   While the user is BUSY -- a modal is open, or a form control
   has focus -- the merged data is still written to
   localStorage, but the re-render is QUEUED instead of run, so
   no input is ever overwritten underneath the user. The queue
   is flushed the moment the modal closes or focus leaves,
   driven by real DOM events, not a timer.
========================================================= */

/* Any visible modal, including the ones app.js builds on the
   fly (delete confirmation, administrator overlays) and the
   logout lock screen. */
function getwellHasOpenModal(){
  const open = document.querySelector(".modal-wrap.show, .admin-modal-wrap.show");
  if(open) return true;

  const lock = document.getElementById("getwellLockScreen");
  if(lock && !lock.hidden) return true;

  return false;
}

/*
  A focused form control means the user is typing right now.

  IMPORTANT: a field inside a modal that has just been CLOSED
  does not count. Closing a modal only removes the "show"
  class, so the field it contained can keep document focus even
  though it is no longer on screen. Treating that as "the user
  is typing" would park the deferred refresh forever and the
  page would never pick up the synced data.
*/
function getwellHasFocusedField(){
  const active = document.activeElement;
  if(!active || !active.isConnected) return false;

  const tag = active.tagName;
  const isField =
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active.isContentEditable === true;

  if(!isField) return false;

  /* Inside a modal? Then it only counts while that modal is open. */
  const wrap = active.closest ? active.closest(".modal-wrap, .admin-modal-wrap") : null;
  if(wrap && !wrap.classList.contains("show")) return false;

  return true;
}

function getwellUiBusy(){
  return getwellHasOpenModal() || getwellHasFocusedField();
}


let getwellPendingRefresh = null;
let getwellFlushQueued = false;

/*
  Pages call this instead of reloading. It fires
  "getwell:data-updated" on document; every page listens and
  re-renders its own content.
*/
function getwellEmitDataUpdated(detail){
  const payload = detail || getwellPendingRefresh || {};
  getwellPendingRefresh = null;

  try{
    document.dispatchEvent(new CustomEvent("getwell:data-updated", {detail: payload}));
  }catch(error){
    console.error("[Getwell] Unable to broadcast the data update:", error);
  }
}

function getwellEmitSettingsUpdated(){
  try{
    document.dispatchEvent(new CustomEvent("getwell:settings-updated", {detail: {}}));
  }catch(error){
    console.error("[Getwell] Unable to broadcast the settings update:", error);
  }
}

/*
  THE MODAL / FORM GUARD.

  Requests a re-render. If the user is busy the request is
  parked and replayed later; it is never dropped and it never
  interrupts.
*/
function getwellRequestUiRefresh(detail){
  if(getwellUiBusy()){
    getwellPendingRefresh = {...(getwellPendingRefresh || {}), ...(detail || {}), deferred: true};
    return false;
  }

  getwellEmitDataUpdated(detail);
  return true;
}

/* Replays a parked refresh once the user is free again. */
function getwellFlushPendingRefresh(){
  if(!getwellPendingRefresh || getwellFlushQueued) return;
  if(getwellUiBusy()) return;

  getwellFlushQueued = true;

  requestAnimationFrame(() => {
    getwellFlushQueued = false;
    if(!getwellPendingRefresh || getwellUiBusy()) return;

    /* Release focus stranded inside a closed modal before the
       re-render replaces that part of the DOM. */
    const active = document.activeElement;
    const wrap = active && active.closest ? active.closest(".modal-wrap, .admin-modal-wrap") : null;
    if(wrap && !wrap.classList.contains("show") && typeof active.blur === "function"){
      active.blur();
    }

    getwellEmitDataUpdated();
  });
}

/*
  Event-driven, not polled. A modal closing is a class change,
  and leaving a field is a focusout, so both are observable
  directly.
*/
function getwellWatchUiBusyState(){
  if(!document.body) return;

  document.addEventListener("focusout", getwellFlushPendingRefresh, true);
  document.addEventListener("click", getwellFlushPendingRefresh, true);
  document.addEventListener("keyup", event => {
    if(event.key === "Escape") getwellFlushPendingRefresh();
  }, true);

  try{
    new MutationObserver(getwellFlushPendingRefresh).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });
  }catch(error){
    /* Older engines without MutationObserver still flush on the
       focusout / click / Escape listeners above. */
  }
}

/*
  Re-renders without losing where the user was on the page.
  Every page renderer is wrapped in this.
*/
function getwellRefreshInPlace(render){
  if(typeof render !== "function") return;

  const x = window.scrollX;
  const y = window.scrollY;

  try{
    render();
  }catch(error){
    console.error("[Getwell] A background refresh failed to render:", error);
  }

  /* The lists that were replaced are the same height as before
     in the overwhelming majority of cases; restoring the offset
     covers the rest so the page never jumps under the reader. */
  if(window.scrollX !== x || window.scrollY !== y){
    window.scrollTo(x, y);
  }
}

/*
  One-line helper each page uses to subscribe. Keeping it here
  means no page has to know about the guard or the scroll
  restore.
*/
function getwellOnDataUpdated(render){
  document.addEventListener("getwell:data-updated", () => getwellRefreshInPlace(render));
}

function getwellOnSettingsUpdated(render){
  document.addEventListener("getwell:settings-updated", () => getwellRefreshInPlace(render));
}


/*
  BACKGROUND SYNCHRONISATION  (Sheets <-> Web)

  Reads the Sheet, reconciles deletions, merges per record,
  pushes anything that exists only in this browser, and then
  asks the page to re-render.

  It NEVER reloads the document. That is the whole point of
  this rewrite: a reload is what was closing modals and wiping
  half-typed forms every 30 seconds.
*/
function getwellSyncRemoteStore(){
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
    getwellNoteBackendVersion(payload.version);

    const remote=payload.data;
    const local=getwellLocalStoreSnapshot();

    /* ONLY a snapshot that genuinely came back out of Google
       Sheets may authorise removing anything. */
    const baseline=getwellAuthoritativeBaseline();

    /* Anything the sheet is now holding is confirmed, so it can
       leave the outbox. */
    getwellMarkConfirmed(getwellExpectedRemoteIds(remote));

    /* -----------------------------------------------------
       SETTINGS

       A newer configuration from the Sheet is adopted
       silently and announced with an event. It used to call
       location.reload() here, which is one of the reasons a
       modal could disappear while it was being filled in.

       settings.html is deliberately excluded: that page IS
       the settings editor, so overwriting its working copy
       mid-edit would throw away the user's unsaved changes.
       It is told about the update and decides for itself.
    ----------------------------------------------------- */
    if(remote.settings&&typeof remote.settings==="object"){
      try{
        const raw=localStorage.getItem("GETWELL_SYSTEM_CONFIG_V1");
        const localSettings=raw?JSON.parse(raw):null;
        const rt=Date.parse(remote.settings.updatedAt||"")||0;
        const lt=Date.parse(localSettings?.updatedAt||"")||0;

        if(rt>lt){
          const onSettingsPage=
            location.pathname.toLowerCase().endsWith("settings.html");

          if(onSettingsPage){
            /* Notify only. The editor keeps what the user typed. */
            getwellEmitSettingsUpdated();
          }else{
            localStorage.setItem("GETWELL_SYSTEM_CONFIG_V1",JSON.stringify(remote.settings));
            localStorage.setItem("GETWELL_SETTINGS_UPDATED",String(Date.now()));
            getwellEmitSettingsUpdated();
            /* Dropdowns fed from Settings are rebuilt by the
               page's own renderer on the next refresh. */
            getwellRequestUiRefresh({reason:"settings"});
          }
        }
      }catch(e){
        console.error("[Getwell] Unable to apply remote settings:",e);
      }
    }

    const reconciled=getwellReconcileRemoteDeletions(local,remote,baseline);
    const result=getwellMergeStores(reconciled,remote);

    getwellSetRemoteBaseline(remote,"remote");

    /*
      storeChanged is now honest. getwellSameRecord() means a
      record that merely round-tripped through the Sheet no
      longer counts as a change, so this is true only when the
      data really moved.
    */
    const storeChanged =
      result.remoteWon || JSON.stringify(reconciled)!==JSON.stringify(local);

    if(storeChanged){
      localStorage.setItem(STORE_KEY,JSON.stringify(result.merged));
      getwellSetPersistedStore(result.merged);
      localStorage.setItem(MIGRATION_KEY,"done");
    }

    /*
      Records that exist only in this browser are pushed first,
      exactly as before, so a patient registered seconds ago
      reaches the Sheet on this cycle rather than the next one.
    */
    if(result.localWon || getwellHasUnconfirmed()){
      getwellRemoteSave(result.merged).then(saveResult=>{
        if(!saveResult.ok){
          getwellNotify(saveResult.error,"error");
        }else{
          getwellSetRemoteBaseline(result.merged,"verified-save");
          getwellSetPersistedStore(result.merged);
        }
        if(storeChanged) getwellRequestUiRefresh({reason:"merge"});
      });
      return;
    }

    if(storeChanged) getwellRequestUiRefresh({reason:"merge"});
  });
}

let getwellRemoteSyncTimer = null;
let getwellRemoteSyncHooksInstalled = false;

function getwellStartRemoteSync(){
  if(!getwellRemoteConfigured()) return false;

  /*
    Cross-device sync is REQUIRED: localStorage belongs to the
    current browser/device, so a phone can never see data saved
    on the PC unless we read the shared Google Sheets store.

    The old implementation used a full page reload after sync.
    This version keeps the safe in-place merge/refresh mechanism
    above, so polling can be enabled without closing modals or
    navigating to Dashboard.
  */
  if(!getwellRemoteSyncHooksInstalled){
    getwellRemoteSyncHooksInstalled = true;

    /* Pull immediately when the page opens. */
    setTimeout(() => getwellSyncRemoteStore(), 150);

    /* Pull periodically so another device's changes appear. */
    getwellRemoteSyncTimer = setInterval(
      () => getwellSyncRemoteStore(),
      GETWELL_REMOTE_POLL_MS
    );

    /* Phones often suspend timers in the background. Pull again
       when the page becomes visible or is restored from history. */
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible') getwellSyncRemoteStore();
    });
    window.addEventListener('pageshow', () => getwellSyncRemoteStore());
  }

  return true;
}

/* ---------------------------------------------------------
   IS THE DEPLOYMENT RUNNING THE CODE.GS IN THIS PROJECT?

   Warns once per page if the /exec URL answers without a
   version, or with one this build does not expect. That is the
   single most likely reason for a record to be accepted and
   then not appear in the spreadsheet.
--------------------------------------------------------- */

let getwellBackendWarned = false;

function getwellNoteBackendVersion(version){
  if(getwellBackendWarned) return;

  if(!version){
    getwellBackendWarned = true;
    getwellNotify(
      "The Google Apps Script deployment is older than this app. Re-paste Code.gs, " +
      "run setupGetwell(), then re-deploy as a New version.",
      "error"
    );
    return;
  }

  if(version !== GETWELL_REQUIRED_BACKEND){
    getwellBackendWarned = true;
    console.warn(
      "[Getwell] Backend version " + version +
      " differs from the expected " + GETWELL_REQUIRED_BACKEND + "."
    );
  }
}


/* Prints what the deployment can see. Run getwellDiagnose() in
   the browser console when a record does not reach a sheet. */
function getwellDiagnose(){
  if(!getwellRemoteConfigured()){
    console.error("[Getwell] Google Sheets URL is not configured.");
    return Promise.resolve(null);
  }

  return fetch(
    GETWELL_SHEETS_API_URL +
    (GETWELL_SHEETS_API_URL.includes("?") ? "&" : "?") +
    "action=diagnose&t=" + Date.now()
  )
    .then(response => response.text())
    .then(text => {
      let payload = null;
      try{ payload = JSON.parse(text); }catch(e){
        console.error("[Getwell] The deployment did not answer with JSON. " +
          "It is probably not shared with \"Anyone\". First 200 characters:", text.slice(0, 200));
        return null;
      }
      console.log("[Getwell] Backend diagnosis:", payload);
      console.log("[Getwell] Unconfirmed records still queued in this browser:",
        JSON.parse(localStorage.getItem(GETWELL_UNCONFIRMED_KEY) || "{}"));
      return payload;
    })
    .catch(error => {
      console.error("[Getwell] Could not reach the deployment:", error);
      return null;
    });
}

window.getwellDiagnose = getwellDiagnose;


/* ---------------------------------------------------------
   ONE PLACE THAT DECIDES WHETHER A SAVE WORKED

   Every "... saved successfully" message in the app goes
   through here. saveStore() has already raised a detailed red
   toast describing the failure, so this only adds the green
   confirmation, and only when Google Sheets has confirmed the
   row. Callers use the boolean to decide whether to close the
   modal.
--------------------------------------------------------- */

function getwellAnnounceSave(result, successMessage){
  if(result && result.ok === false) return false;
  if(successMessage) getwellNotify(successMessage, "success");
  return true;
}

window.getwellAnnounceSave = getwellAnnounceSave;


function getwellManualSync(){
  if(!getwellRemoteConfigured()){
    getwellNotify("Google Sheets sync is not configured.","error");
    return false;
  }
  getwellSyncRemoteStore();
  return true;
}

window.getwellManualSync = getwellManualSync;


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

  /*
    Calendar dates are normalised on the way OUT of storage,
    so every page reads "YYYY-MM-DD" no matter what the Sheet,
    an older build or a hand-typed row put in there.
  */
  return getwellNormalizeStoreDates(
    migrateLegacyIds(
      rawStore()
    )
  );

}


function getwellHasDeletions(deletions){
  return Object.values(deletions || {}).some(
    list => Array.isArray(list) && list.length
  );
}

function getwellQueuePendingDeletions(deletions){
  try{
    const existing = JSON.parse(
      localStorage.getItem("GETWELL_PENDING_DELETIONS") || "{}"
    );
    const merged = {};
    ["patients","appointments","visits","charges","claims","files"].forEach(key=>{
      merged[key] = [...new Set([
        ...(Array.isArray(existing[key]) ? existing[key] : []),
        ...(Array.isArray(deletions?.[key]) ? deletions[key] : [])
      ])];
    });
    localStorage.setItem("GETWELL_PENDING_DELETIONS", JSON.stringify(merged));
  }catch(e){}
}

function saveStore(
  data
){
  const snapshot=structuredClone(data);
  const deletions=getwellCollectDeletions(
    getwellRemoteBaseline() || getwellPersistedStore(),
    snapshot
  );
  const hasDeletions=getwellHasDeletions(deletions);

  localStorage.setItem(STORE_KEY,JSON.stringify(snapshot));

  /*
    A deletion endpoint may be one deployment behind the frontend.
    Do NOT let that stale endpoint block an otherwise valid save.
    Save the current state first. If deletion sync fails, queue the
    deletion IDs for a later retry instead of showing the misleading
    red "visit was not saved" style error.
  */
  const syncDelete = hasDeletions
    ? getwellRemoteDelete(deletions)
    : Promise.resolve({ok:true});

  return syncDelete.then(deleteResult=>{
    if(!deleteResult.ok && hasDeletions){
      getwellQueuePendingDeletions(deletions);
    }

    return getwellRemoteSave(snapshot).then(saveResult=>{
      if(!saveResult.ok){
        /*
          The record stays in localStorage and in the outbox so
          nothing the user typed is thrown away and the write is
          retried -- but the caller is told plainly that Google
          Sheets does NOT have it, and the baseline is left
          untouched so the synchroniser cannot later mistake the
          record for one the sheet has deleted.
        */
        getwellNotify(
          "NOT saved to Google Sheets. Kept on this device and will be retried. " +
          saveResult.error,
          "error"
        );
        return saveResult;
      }

      /*
        Only a VERIFIED save updates the baseline, because the
        baseline is what authorises deletions later on. The old
        code set it here unconditionally from the local snapshot,
        which is how an unsaved visit ended up being deleted from
        the browser on the next poll.
      */
      getwellSetRemoteBaseline(snapshot,"verified-save");
      getwellSetPersistedStore(snapshot);

      if(!deleteResult.ok && hasDeletions){
        getwellNotify(
          "Saved to Google Sheets. Some deletion changes are still pending synchronization.",
          "info"
        );
      }

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

  let miscellaneous =
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
      miscellaneous += visitCategoryTotal(visit,"Additional");
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

    miscellaneous,

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
  return getwellFollowUpRecords()
    .filter(record => record.status !== "Due Soon")
    .map(record => ({
      id: record.id,
      name: record.name,
      days: record.daysSinceLastVisit,
      level: record.status === "Overdue" || record.status === "High Attention"
        ? "overdue"
        : "warning"
    }));
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
   PATIENT PROFILE PHOTO
   ---------------------------------------------------------
   Storage follows the pattern that visit photos already use:

     photoDriveId   Google Drive file ID   -> Sheets
     photoUrl       Drive direct-view URL  -> Sheets
     photoLocal     data URL fallback      -> this device only

   The binary never reaches a Sheets cell. photoLocal exists
   only so a photo taken while Drive is unreachable is not
   lost, and getwellSanitizeForRemote() strips it out of every
   request body before it is sent.
========================================================= */

function getwellPatientPhotoUrl(
  patient
){

  if(!patient) return "";

  return (
    String(patient.photoUrl || "") ||
    String(patient.photoLocal || "")
  );

}


function getwellPatientHasPhoto(patient){
  return !!getwellPatientPhotoUrl(patient);
}


function getwellPatientInitials(patient){
  const stored = String((patient && patient.initials) || "").trim();
  if(stored) return stored.slice(0,2).toUpperCase();

  const parts = String((patient && patient.name) || "")
    .trim().split(/\s+/).filter(Boolean);

  if(!parts.length) return "PT";
  if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}


/*
  Returns the INNER html for an avatar container that is
  already sized by CSS (.patient-avatar, .avatar-small,
  .patient-photo-preview). Used everywhere a patient is shown
  so one patient looks the same across the whole app.
*/
function getwellPatientAvatar(patient){
  const url = getwellPatientPhotoUrl(patient);

  if(url){
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml((patient && patient.name) || "Patient")}" loading="lazy">`;
  }

  return escapeHtml(getwellPatientInitials(patient));
}


/* ---------------------------------------------------------
   RESIZE
   A profile photo is only ever shown small, so it is capped
   well below the visit-photo size before it travels.
--------------------------------------------------------- */

function getwellResizeImage(file, maxSize, quality){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");

        canvas.width  = Math.max(1, Math.round(image.width  * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

        resolve({
          name: file.name || "photo.jpg",
          dataUrl: canvas.toDataURL("image/jpeg", quality)
        });
      };

      image.onerror = reject;
      image.src = reader.result;
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


function getwellDataUrlToBase64(dataUrl){
  const value = String(dataUrl || "");
  const comma = value.indexOf(",");
  return comma >= 0 ? value.slice(comma + 1) : value;
}


/* ---------------------------------------------------------
   UPLOAD
   Reuses getwellUploadFile(), which is the same Apps Script
   "uploadFile" action the visit photos and Arboleaf PDFs
   already go through, so the file lands in the existing
   Getwell Patient Files folder in Drive.
--------------------------------------------------------- */

function getwellUploadPatientPhoto(patient, file){
  if(!patient || !file){
    return Promise.resolve({ok:false, error:"No photo was selected."});
  }

  if(!/^image\//i.test(file.type || "")){
    return Promise.resolve({ok:false, error:"Please choose an image file."});
  }

  return getwellResizeImage(file, 640, 0.82)
    .then(resized =>
      getwellUploadFile({
        name: resized.name,
        mimeType: "image/jpeg",
        dataBase64: getwellDataUrlToBase64(resized.dataUrl),
        patientId: patient.id || "",
        visitId: "profile"
      })
      .then(uploaded => {
        if(uploaded.ok && uploaded.file){
          return {
            ok: true,
            photo: {
              photoDriveId: uploaded.file.id,
              photoUrl: uploaded.file.url,
              photoLocal: ""
            }
          };
        }

        /*
          Drive is unreachable. Keep the photo on this device
          so nothing is lost, and tell the caller so the UI can
          badge it. The next successful upload replaces it.
        */
        return {
          ok: true,
          local: true,
          error: uploaded.error || "Google Drive is unavailable.",
          photo: {
            photoDriveId: "",
            photoUrl: "",
            photoLocal: resized.dataUrl
          }
        };
      })
    )
    .catch(error => ({
      ok:false,
      error:"The image could not be read. " + ((error && error.message) || "")
    }));
}


function getwellClearedPatientPhoto(){
  return {photoDriveId:"", photoUrl:"", photoLocal:""};
}


/* ---------------------------------------------------------
   KEEP A DEVICE-ONLY PHOTO THROUGH A SYNC
   A record arriving from Sheets carries no photoLocal. If it
   also has no Drive photo, the local fallback is carried over
   rather than silently dropped.
--------------------------------------------------------- */

function getwellPreserveLocalPhoto(incoming, existing){
  if(!incoming || !existing) return incoming;

  if(!incoming.photoUrl && !incoming.photoDriveId && existing.photoLocal){
    incoming.photoLocal = existing.photoLocal;
  }

  return incoming;
}


/* ---------------------------------------------------------
   STRIP DEVICE-ONLY BINARIES FROM EVERY REQUEST BODY
   Sheets cells cap at 50,000 characters. Nothing base64 is
   ever written to a cell, and this makes sure it is not even
   uploaded in the request.
--------------------------------------------------------- */

function getwellSanitizeForRemote(data){
  const copy = getwellClone(data || {});

  (copy.patients || []).forEach(patient => {
    if(!patient) return;

    delete patient.photoLocal;

    (patient.visits || []).forEach(visit => {
      if(!visit) return;

      (visit.photos || []).forEach(photo => {
        if(photo && photo.data) delete photo.data;
      });

      if(visit.pdfFile && visit.pdfFile.data) delete visit.pdfFile.data;
    });
  });

  return copy;
}


/* =========================================================
   PROGRAMME OVERVIEW
   ---------------------------------------------------------
   Every number here is derived from fields the app already
   stores: patient.startingWeight, patient.currentWeight,
   patient.goalWeight and the weight recorded on each visit.
   Nothing is invented, and nothing new is written anywhere.
========================================================= */

function getwellNumber(value){
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}


function getwellProgrammePatients(){
  return (store().patients || []).filter(patient =>
    patient && getwellNumber(patient.startingWeight) > 0
  );
}


/* The patient's weight as it was on a given date, taken from
   the latest visit up to that date, or their starting weight
   if they had not been weighed yet. */
function getwellPatientWeightAt(patient, dateKey){
  let best = null;

  (patient.visits || []).forEach(visit => {
    if(!visit || !visit.dateKey) return;
    if(visit.dateKey > dateKey) return;

    const weight = getwellNumber(visit.weight);
    if(weight <= 0) return;

    if(!best || visit.dateKey > best.dateKey) best = {dateKey:visit.dateKey, weight};
  });

  if(best) return best.weight;

  const start = String(patient.startDate || "");
  if(start && start > dateKey) return null;

  return getwellNumber(patient.startingWeight) || null;
}


function getwellAverageChangeAt(patients, dateKey){
  let total = 0;
  let count = 0;

  patients.forEach(patient => {
    const weight = getwellPatientWeightAt(patient, dateKey);
    if(weight === null) return;

    total += weight - getwellNumber(patient.startingWeight);
    count++;
  });

  return count ? {value: total / count, count} : null;
}


function getwellShiftMonths(date, months){
  const shifted = new Date(date.getTime());
  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() + months);
  return shifted;
}


/*
  getwellIsoDay() now lives in the CALENDAR DATES section at
  the top of this file next to getwellDateKey() and
  getwellTodayKey(). It used to be declared here as well; two
  identical declarations of the same name is exactly the kind
  of drift that makes a date fix look like it did not apply.
*/

function getwellProgrammeOverview(range){
  const patients = getwellProgrammePatients();
  const today = new Date();

  const result = {
    range: range || "month",
    patients: patients.length,
    avgChange: null,
    deltaKg: null,
    goalsAchieved: 0,
    onTrack: 0,
    series: []
  };

  patients.forEach(patient => {
    const start = getwellNumber(patient.startingWeight);
    const current = getwellNumber(patient.currentWeight) || start;
    const goal = getwellNumber(patient.goalWeight);

    if(goal > 0 && current <= goal) result.goalsAchieved++;
    else if(current < start) result.onTrack++;
  });

  if(!patients.length) return result;

  /* Buckets. A month is shown week by week, longer ranges
     month by month, mirroring how the visits actually land. */
  const points = [];

  if(range === "quarter" || range === "all"){
    const months = range === "quarter" ? 3 : 12;

    for(let i = months - 1; i >= 0; i--){
      const monthStart = getwellShiftMonths(today, -i);
      const monthEnd = i === 0
        ? today
        : new Date(getwellShiftMonths(today, -i + 1).getTime() - 86400000);

      points.push({
        dateKey: getwellIsoDay(monthEnd),
        label: monthStart.toLocaleDateString("en-GB", {month:"short"})
      });
    }
  }else{
    const first = new Date(today.getFullYear(), today.getMonth(), 1);

    for(let day = 1; day <= today.getDate(); day += 7){
      const point = new Date(first.getFullYear(), first.getMonth(), day);
      points.push({
        dateKey: getwellIsoDay(point),
        label: point.toLocaleDateString("en-GB", {day:"numeric", month:"short"})
      });
    }

    const lastKey = getwellIsoDay(today);
    if(!points.length || points[points.length - 1].dateKey !== lastKey){
      points.push({
        dateKey: lastKey,
        label: today.toLocaleDateString("en-GB", {day:"numeric", month:"short"})
      });
    }
  }

  result.series = points
    .map(point => {
      const average = getwellAverageChangeAt(patients, point.dateKey);
      return average ? {label:point.label, value:average.value} : null;
    })
    .filter(Boolean);

  const latest = getwellAverageChangeAt(patients, getwellIsoDay(today));
  if(latest) result.avgChange = latest.value;

  /* Comparison against the same measure one period earlier. */
  const previousDate = range === "all"
    ? getwellShiftMonths(today, -12)
    : range === "quarter"
      ? getwellShiftMonths(today, -3)
      : getwellShiftMonths(today, -1);

  const previous = getwellAverageChangeAt(patients, getwellIsoDay(previousDate));

  /*
    Reported in kilograms rather than as a percentage. A
    percentage against a near-zero starting average produces
    meaningless numbers like "389%", whereas "1.6 kg further
    down than last month" is exactly what the clinic wants to
    read.
  */
  if(latest && previous && Math.abs(latest.value - previous.value) >= 0.05){
    result.deltaKg = latest.value - previous.value;
  }

  return result;
}


/* ---------------------------------------------------------
   MINI CHART
   Inline SVG so it needs no library and inherits the theme
   through the stylesheet.
--------------------------------------------------------- */

function getwellRenderMiniChart(series){
  if(!series || series.length < 2){
    return `<div class="notif-empty">Not enough visit history yet to chart progress.</div>`;
  }

  const width = 320;
  const height = 96;
  const padLeft = 22;
  const padRight = 6;
  const padTop = 8;
  const padBottom = 6;

  const values = series.map(point => point.value);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);

  if(max - min < 1){
    max += 0.5;
    min -= 0.5;
  }

  const spanX = width - padLeft - padRight;
  const spanY = height - padTop - padBottom;

  const x = index => padLeft + (spanX * index) / (series.length - 1);
  const y = value => padTop + spanY * (1 - (value - min) / (max - min));

  const line = series.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");

  const area =
    `${padLeft},${y(min).toFixed(1)} ` + line + ` ${x(series.length - 1).toFixed(1)},${y(min).toFixed(1)}`;

  const ticks = [max, (max + min) / 2, min].map(value => `
      <line class="grid-line" x1="${padLeft}" y1="${y(value).toFixed(1)}" x2="${width - padRight}" y2="${y(value).toFixed(1)}"></line>
      <text class="axis-text" x="0" y="${(y(value) + 3).toFixed(1)}">${value.toFixed(1)}</text>
  `).join("");

  const dots = series.map((point, index) => `
      <circle class="series-dot" cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="2.4"></circle>
  `).join("");

  const lastIndex = series.length - 1;

  const labelIndexes = series.length <= 5
    ? series.map((_, index) => index)
    : [0, Math.round(lastIndex / 3), Math.round((lastIndex * 2) / 3), lastIndex];

  const labels = [...new Set(labelIndexes)].map(index => {
    const anchor = index === 0 ? "start" : index === lastIndex ? "end" : "middle";
    return `<text class="axis-text" x="${x(index).toFixed(1)}" y="${height + 11}" text-anchor="${anchor}">${escapeHtml(series[index].label)}</text>`;
  }).join("");

  return `
    <svg class="mini-chart" viewBox="0 0 ${width} ${height + 16}" preserveAspectRatio="xMidYMid meet" role="img"
         aria-label="Average weight change over the selected period">
      <defs>
        <linearGradient id="gwSeriesFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="currentColor" stop-opacity=".22"></stop>
          <stop offset="100%" stop-color="currentColor" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <g style="color:var(--ink-blue)">
        ${ticks}
        <polygon class="series-area" points="${area}"></polygon>
        <polyline class="series-line" points="${line}"></polyline>
        ${dots}
        <circle class="series-end" cx="${x(lastIndex).toFixed(1)}" cy="${y(series[lastIndex].value).toFixed(1)}" r="3.4"></circle>
        ${labels}
      </g>
    </svg>
  `;
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


function getwellAdminFirstName(){
  const name = String(getwellAdminProfile().name || "").trim();
  if(!name || /^administrator$/i.test(name)) return "Admin";
  return name.split(/\s+/)[0];
}


function getwellGreeting(){
  const hour = new Date().getHours();
  if(hour < 12) return "Good morning";
  if(hour < 18) return "Good afternoon";
  return "Good evening";
}


/*
  The avatar in the top-right is deliberately a fixed letter "A"
  for Administrator. It never shows the uploaded profile photo —
  that belongs to My Profile, the sidebar card and the menu head,
  which all carry [data-admin-initials] instead.
*/
function getwellRefreshAdminIdentity(){
  const profile = getwellAdminProfile();
  const initials = getwellAdminInitials(profile);

  document.querySelectorAll("[data-admin-display-name]").forEach(node => {
    node.textContent = profile.name;
  });

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

function header(
  active
){

  const profile = getwellAdminProfile();

  /*
    The dashboard greets the user, exactly as in the approved
    design. Every other page keeps its own page title, so the
    existing 17px/700 title + 11px/400 subtitle hierarchy is
    unchanged on all of them.
  */
  const isDashboard = active === "dashboard";

  const title = isDashboard
    ? `${getwellGreeting()}, ${escapeHtml(getwellAdminFirstName())} \u{1F44B}`
    : escapeHtml(document.title.split("|")[0].trim());

  const pageSubtitles = {
    patients: "Manage patient records.",
    appointments: "Manage appointments and follow-up attention from one place.",
    panel: "Track panel patients, claim progress and outstanding balances.",
    reports: "View clinic performance and financial reports.",
    settings: "Manage how the Getwell Weight Loss Admin system works.",
    patients_profile: "View and manage this patient's programme details.",
    dashboard: "Here's what's happening with your clinic today."
  };

  const subtitle = pageSubtitles[active] || pageSubtitles.dashboard;

  return `

<header class="topbar${isDashboard ? " dashboard-topbar" : ""}">

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
        ${title}
      </div>

      <div class="page-subtitle">
        ${subtitle}
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
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label="Administrator menu"
        onclick="toggleAdminMenu(event)"
      >
        <span class="admin-avatar-letter" aria-hidden="true">A</span>
        <span class="admin-avatar-name" data-admin-display-name>${escapeHtml(profile.name)}</span>
        <span class="admin-avatar-caret" aria-hidden="true">\u25BE</span>
      </button>


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
    const todayKey = getwellIsoDay(today);

    const horizon = getwellIsoDay(new Date(today.getTime() + 7 * 86400000));

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

  <main class="main${
    active === "dashboard"
      ? " main-dash"
      : ""
  }">

    ${header(
      active
    )}

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
            <span class="avatar-small search-avatar">${getwellPatientAvatar(p)}</span>
            <span class="global-search-text">
              <strong>${escapeHtml(p.name || "Unnamed")}</strong>
              <span>${escapeHtml(p.id || "")} · ${escapeHtml(getPanelName(p))}</span>
            </span>
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
   SETTINGS UPDATE  (another browser tab saved Settings)

   This used to call location.reload() on every page except
   settings.html. Saving Settings in one tab therefore wiped a
   half-filled Add Visit modal in another tab -- the same
   destructive pattern as the sync reload, just triggered
   across tabs.

   The new configuration is already in localStorage by the time
   this event fires (that is what a storage event means), so the
   page only has to re-render. Every Settings-driven dropdown is
   rebuilt from getwellSystemSettings() inside the page's own
   renderer, and the modal guard defers the render if the user
   happens to be mid-form.

   The `storage` event never fires in the tab that did the
   writing, so this is genuinely cross-tab only.
========================================================= */

window.addEventListener(
  "storage",
  event => {

    if(
      event.key !==
      GW_SETTINGS_UPDATED_KEY
    ){

      return;

    }


    /*
      settings.html is the editor itself and must never be
      re-rendered from underneath the person using it.
    */
    if(
      location.pathname
        .toLowerCase()
        .endsWith(
          "settings.html"
        )
    ){

      return;

    }


    getwellEmitSettingsUpdated();

    getwellRequestUiRefresh(
      {reason:"settings"}
    );

  }
);


/* =========================================================
   NAVIGATION / FORM SAFETY
   ---------------------------------------------------------
   The admin application is a multi-page app. A form submission
   or an accidental Dashboard anchor must never be able to
   replace the current page while the user is working.
========================================================= */

document.addEventListener("submit", event => {
  /* There are no application forms that should submit to a URL.
     All saves are handled by JavaScript. */
  event.preventDefault();
  event.stopPropagation();
}, true);

/* Record every real page transition for troubleshooting without
   changing navigation behaviour. */
window.addEventListener("beforeunload", () => {
  try {
    sessionStorage.setItem("GETWELL_LAST_PAGE", location.pathname + location.search);
  } catch(e) {}
});

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


    /* The modal / form guard is installed before anything can
       request a refresh, and independently of whether Google
       Sheets is configured, because the cross-tab settings
       listener uses the same deferred-refresh mechanism. */
    getwellWatchUiBusyState();

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


    /*
      CROSS-DEVICE SYNC:
      Start the safe background reader. It reads Google Sheets
      immediately and every 30 seconds, then merges changes in
      place. It NEVER reloads the document, so forms/modals are
      protected by getwellUiBusy().

      The manual sync remains available through
      getwellManualSync() as well.
    */
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
   


/* =========================================================
   PATIENT PROGRESS — SERIES BUILDERS AND CHART RENDERER
   ---------------------------------------------------------
   Added for the per-patient "Weight Progress" and "Body
   Composition Progress" sections on patient-profile.html.

   These helpers are PURE READERS. They never write, never
   touch saveStore()/upsertPatient() and never change the
   Google Sheets architecture. Every point is read straight
   out of the visits that are already persisted on the
   patient record:

       visit.dateKey
       visit.visit
       visit.weight
       visit.arboleafMetrics

   Nothing is averaged across patients, nothing is
   interpolated and nothing is invented: a visit with no
   value for the requested measurement is simply skipped.
========================================================= */


/* =========================================================
   ARBOLEAF METRIC REGISTRY
   ---------------------------------------------------------
   Taken directly from the Arboleaf / Yolanda "Body
   Composition Analysis" report supplied by the clinic. Both
   layouts in circulation were read to build this list — the
   3-page single-column export and the 2-page two-column
   export. They print the same measurements in a different
   arrangement, so the parser below works off labels rather
   than positions.

   THE 12 CORE CATEGORIES (core:true) are the measurements the
   report prints with a printed Normal Range, in report order:

     Body Composition Analysis  Body Water, Protein,
                                Bone Mass, Body Fat Mass
     Muscle Fat Analysis        Weight, Body Fat Mass,
                                Skeletal Muscle
     Fat Analysis               BMI, PBF (Body Fat
                                Percentage), Visceral Fat
     Additional Data            Subcutaneous Fat Percentage,
                                BMR, LBM (Fat-free Body
                                Weight), Skeletal Muscle

   De-duplicated that is exactly twelve, and those twelve are
   the selectable metrics in the patient profile.

   Everything else the report prints — the second Additional
   Data block, the derived Soft Lean Mass column, the Fitness
   score and the Weight Control block — is still parsed and
   still stored, listed under "Additional data" so the
   headline list stays the twelve the clinic asked for.

   `aliases` carry the keys older saved visits already use, so
   history recorded by the previous parser keeps resolving
   without migrating a single row in Google Sheets.

   `min` / `max` are generous physiological bounds. They never
   change a value — they only flag a reading that almost
   certainly came out of OCR wrong, so staff can see which
   numbers to check before the visit is saved.
========================================================= */

const GETWELL_ARBOLEAF_METRICS = [

  /* ---- the twelve core categories, in report order ---- */
  {name:"Weight",                      unit:"kg",    decimals:1, core:true, min:20,  max:400, better:"lower",
   aliases:[], labels:["Weight"]},
  {name:"BMI",                         unit:"kg/m²", decimals:1, core:true, min:8,   max:90, better:"lower",
   aliases:[], labels:["BMI"]},
  {name:"Body Fat Percentage",         unit:"%",     decimals:1, core:true, min:2,   max:75, better:"lower",
   aliases:["PBF","PBF(%)","Body Fat","Body Fat %"], labels:["Body Fat Percentage","PBF"]},
  {name:"Body Fat Mass",               unit:"kg",    decimals:2, core:true, min:1,   max:200, better:"lower",
   aliases:[], labels:["Body Fat Mass"]},
  {name:"Skeletal Muscle",             unit:"kg",    decimals:1, core:true, min:5,   max:80, better:"higher",
   aliases:[], labels:["Skeletal Muscle"]},
  {name:"Body Water",                  unit:"L",     decimals:1, core:true, min:10,  max:90, better:"higher",
   aliases:[], labels:["Body Water"]},
  {name:"Protein",                     unit:"kg",    decimals:1, core:true, min:2,   max:30, better:"higher",
   aliases:[], labels:["Protein"]},
  {name:"Bone Mass",                   unit:"kg",    decimals:2, core:true, min:0.8, max:8,
   aliases:[], labels:["Bone Mass"]},
  {name:"Visceral Fat",                unit:"",      decimals:0, core:true, min:1,   max:60, better:"lower",
   aliases:["Visceral Fat Grade"], labels:["Visceral Fat"]},
  {name:"Subcutaneous Fat Percentage", unit:"%",     decimals:1, core:true, min:2,   max:70, better:"lower",
   aliases:["Subcutaneous Fat"], labels:["Subcutaneous Fat Percentage"]},
  {name:"BMR",                         unit:"kcal",  decimals:0, core:true, min:500, max:4000,
   aliases:["Basal Metabolic Rate"], labels:["BMR","Basal Metabolic Rate"]},
  {name:"Fat-free Body Weight",        unit:"kg",    decimals:1, core:true, min:15,  max:150, better:"higher",
   aliases:["LBM","Fat Free Mass","Fat-free Mass"], labels:["LBM","Fat-free Body Weight","Fat Free Mass"]},

  /* ---- supplementary values the same report prints ---- */
  {name:"Soft Lean Mass",             unit:"kg",   decimals:1, min:10,  max:150, aliases:[], labels:["Soft Lean Mass"]},
  {name:"Muscle Mass Percentage",     unit:"%",    decimals:1, min:15,  max:95,  aliases:[], labels:["Muscle Mass Percentage"]},
  {name:"Subcutaneous Fat Mass",      unit:"kg",   decimals:2, min:1,   max:150, aliases:[], labels:["Subcutaneous Fat"]},
  {name:"Skeletal Muscle Percentage", unit:"%",    decimals:1, min:8,   max:70,
   aliases:["Skeletal Muscle (%)"], labels:["Skeletal Muscle (%)"]},
  {name:"Bone Mass Percentage",       unit:"%",    decimals:1, min:1,   max:12,  aliases:[], labels:["Bone Mass Percentage"]},
  {name:"Protein Percentage",         unit:"%",    decimals:1, min:5,   max:30,  aliases:[], labels:["Protein Percentage"]},
  {name:"Body Water Percentage",      unit:"%",    decimals:1, min:20,  max:80,  aliases:[], labels:["Body Water Percentage"]},
  {name:"SMI",                        unit:"",     decimals:1, min:2,   max:20,  aliases:[], labels:["SMI"]},
  {name:"Waist-to-Hip Ratio",         unit:"",     decimals:2, min:0.4, max:2,
   aliases:["Waist-Hip Ratio","Estimated Waist-to-Hip Ratio"],
   labels:["Estimated Waist-to-Hip Ratio","Waist-to-Hip Ratio","Waist-Hip Ratio"]},
  {name:"Fitness Score",              unit:"/100", decimals:1, min:0,    max:100, aliases:["Fitness score"], labels:["Fitness score"]},
  {name:"Normal Weight",              unit:"kg",   decimals:2, min:20,   max:200, aliases:["Normal weight"], labels:["Normal weight"]},
  {name:"Weight Control",             unit:"kg",   decimals:2, min:-200, max:200, aliases:[], labels:["Weight Control"]},
  {name:"Fat Mass Control",           unit:"kg",   decimals:2, min:-200, max:200, aliases:["Fat mass control"], labels:["Fat mass control"]},
  {name:"Muscle Control",             unit:"kg",   decimals:2, min:-200, max:200, aliases:["Muscle control"], labels:["Muscle control"]},

  /* ---- carried for history recorded by the previous parser ---- */
  /* Body Type is a word, not a number: it is stored, shown and
     carried into the comparison, but never charted.
     getwellArboleafValue() returns null for it, which keeps it
     out of every metric selector automatically. */
  {name:"Body Type",                  unit:"",     decimals:0, text:true, aliases:[], labels:["Body Type"]},
  {name:"Muscle Mass",                unit:"kg",   decimals:1, min:5, max:120, legacy:true, aliases:[], labels:[]},
  {name:"Metabolic Age",              unit:"yrs",  decimals:0, min:5, max:120, legacy:true, aliases:[], labels:["Metabolic Age"]}
];

/* The twelve the clinic selects between. */
const GETWELL_ARBOLEAF_CORE = GETWELL_ARBOLEAF_METRICS.filter(metric => metric.core);

/* Kept under its previous name so nothing that already reads
   this list has to change. */
const GETWELL_BODY_METRICS = GETWELL_ARBOLEAF_METRICS;


/* Loose key so "Body Fat %", "body fat percentage" and
   "BodyFatPercentage" all land on the same metric. */
function getwellMetricKey(name){
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const GETWELL_METRIC_INDEX = (() => {
  const index = {};
  GETWELL_ARBOLEAF_METRICS.forEach(metric => {
    index[getwellMetricKey(metric.name)] = metric;
    (metric.aliases || []).forEach(alias => {
      const key = getwellMetricKey(alias);
      if(!index[key]) index[key] = metric;
    });
  });
  return index;
})();

function getwellMetricDefinition(name){
  return GETWELL_METRIC_INDEX[getwellMetricKey(name)]
      || {name, unit:"", decimals:1, aliases:[], labels:[]};
}


/* Every name a stored visit might have used for this metric:
   canonical first, then its aliases. */
function getwellMetricNameCandidates(metricName){
  const definition = getwellMetricDefinition(metricName);
  return [definition.name].concat(definition.aliases || []);
}


/*
  A single Arboleaf reading, read off ONE visit.

  The parser stores numbers as {value, unit} and older builds
  sometimes stored a bare number or a string, so every shape is
  handled and anything that is not a finite number is reported
  as "not recorded".
*/
function getwellArboleafValue(visit, metricName){
  const metrics = visit && visit.arboleafMetrics;
  if(!metrics || typeof metrics !== "object") return null;

  const definition = getwellMetricDefinition(metricName);

  /* Canonical name first, then every name an older build may
     have written, then a loose key match. Nothing is migrated;
     the reader simply understands the older spellings. */
  let raw;

  for(const candidate of getwellMetricNameCandidates(metricName)){
    if(Object.prototype.hasOwnProperty.call(metrics, candidate)){
      raw = metrics[candidate];
      break;
    }
  }

  if(raw === undefined){
    const wanted = getwellMetricKey(definition.name);
    const match = Object.keys(metrics).find(key => getwellMetricKey(key) === wanted);
    if(match) raw = metrics[match];
  }

  if(raw === null || raw === undefined || raw === "") return null;

  /* Number(null) and Number("") are both 0, which would turn a
     missing reading into a real-looking measurement of zero.
     The blank shapes are rejected before the conversion. */
  const rawValue = (typeof raw === "object") ? raw.value : raw;
  if(rawValue === null || rawValue === undefined || String(rawValue).trim() === "") return null;

  const value = Number(rawValue);
  if(!Number.isFinite(value)) return null;

  const unit = (typeof raw === "object" && raw.unit) ? String(raw.unit) : definition.unit;
  return {value, unit};
}


/*
  The one non-numeric measurement. Kept separate from
  getwellArboleafValue() so a word can never leak into a chart
  or a change calculation.
*/
function getwellArboleafText(visit, metricName){
  const metrics = visit && visit.arboleafMetrics;
  if(!metrics || typeof metrics !== "object") return "";

  for(const candidate of getwellMetricNameCandidates(metricName)){
    const raw = metrics[candidate];
    if(typeof raw === "string" && raw.trim()) return raw.trim();
    if(raw && typeof raw === "object" && typeof raw.value === "string" && raw.value.trim()){
      return raw.value.trim();
    }
  }
  return "";
}


/* Does this visit carry any Arboleaf reading at all? */
function getwellVisitHasArboleaf(visit){
  const metrics = visit && visit.arboleafMetrics;
  if(!metrics || typeof metrics !== "object") return false;
  return GETWELL_ARBOLEAF_METRICS.some(metric =>
    metric.text ? getwellArboleafText(visit, metric.name) : getwellArboleafValue(visit, metric.name)
  );
}


/* =========================================================
   CHRONOLOGICAL VISIT ORDER  +  DERIVED VISIT NUMBERS
   ---------------------------------------------------------
   VISIT DATE is the only thing that decides order. The order
   staff happened to type visits in, the order rows sit in the
   Google Sheet, the creation timestamp and the visit number
   somebody typed into the form are all ignored for ordering.

   Consequences, all of them deliberate:

     - a visit entered late but dated earlier drops straight
       into its correct place;
     - "Visit 1, Visit 2, Visit 3…" is DERIVED from that
       order every single time it is displayed, so inserting
       or deleting a visit renumbers the rest immediately;
     - the stored visit.visit text is never trusted for
       display, only re-written to match on save so the Sheet
       stays consistent;
     - VisitID is never touched by any of this.

   Ties on the same calendar day are broken deterministically —
   visit time if the record has one, then creation timestamp,
   then VisitID — so a page reload never shuffles two visits
   recorded on the same day.
========================================================= */

/* "Visit #3" -> 3. Only ever a last-resort tie-break. */
function getwellVisitOrdinal(visit){
  const match = String((visit && visit.visit) || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}


/* A stable secondary key for two visits on the same date. */
function getwellVisitTieBreak(visit){
  if(!visit) return "";

  /* If the record carries a time, that is the most meaningful
     ordering within a day. */
  const time = String(visit.time || visit.visitTime || "").trim();
  if(/^\d{1,2}:\d{2}/.test(time)) return "1|" + time.padStart(5, "0");

  const created = String(visit.createdAt || visit.created || "").trim();
  if(created) return "2|" + created;

  /* VisitIDs are sequential (VIS-000001, VIS-000002, …), so
     they order by creation without needing a timestamp. */
  return "3|" + String(visit.id || "");
}


/*
  Every visit on ONE patient, oldest first, each row carrying
  its DERIVED visit number and label.

  - Duplicate visit ids are collapsed, so an id that appears
    twice cannot produce two points on a graph or two rows in
    the history.
  - A visit with no usable date is kept, placed after the
    dated ones, and left out of the numbering rather than
    silently dropped.
*/
function getwellPatientVisitsSorted(patient){
  const seen = new Set();
  const rows = [];

  ((patient && patient.visits) || []).forEach(visit => {
    if(!visit) return;

    const dateKey = getwellDateKey(visit.dateKey || visit.date || "");
    const identity = visit.id || `${dateKey}|${visit.visit || ""}`;
    if(seen.has(identity)) return;
    seen.add(identity);

    rows.push({visit, dateKey});
  });

  rows.sort((a, b) => {
    /* Undated visits go last instead of pretending to be the
       oldest reading in the programme. */
    if(!a.dateKey && b.dateKey) return 1;
    if(a.dateKey && !b.dateKey) return -1;

    const byDate = String(a.dateKey).localeCompare(String(b.dateKey));
    if(byDate) return byDate;

    const byTie = getwellVisitTieBreak(a.visit).localeCompare(getwellVisitTieBreak(b.visit));
    if(byTie) return byTie;

    return getwellVisitOrdinal(a.visit) - getwellVisitOrdinal(b.visit);
  });

  rows.forEach((row, index) => {
    row.number = index + 1;
    row.label  = `Visit ${index + 1}`;
    row.id     = row.visit.id || "";
    row.hasArboleaf = getwellVisitHasArboleaf(row.visit);
  });

  return rows;
}


/* The derived number/label for one visit of one patient. */
function getwellVisitNumber(patient, visit){
  if(!visit) return null;
  const rows = getwellPatientVisitsSorted(patient);
  const row = rows.find(item => item.visit === visit)
           || rows.find(item => visit.id && item.visit.id === visit.id);
  return row ? row.number : null;
}

function getwellVisitLabel(patient, visit){
  const number = getwellVisitNumber(patient, visit);
  return number ? `Visit ${number}` : (visit && visit.visit) || "Visit";
}


/*
  Re-write the stored visit.visit text so Google Sheets agrees
  with what the app displays.

  Called just before a save. It only ever touches the visit
  NUMBER field:

    - VisitID is never read, written or regenerated here;
    - no visit is added, removed or reordered in the array;
    - a visit whose number is already correct is left exactly
      as it is, so a save that changes nothing writes nothing
      new into that column.

  Returns the number of visits whose label actually changed.
*/
function getwellRenumberVisits(patient){
  if(!patient || !Array.isArray(patient.visits)) return 0;

  let changed = 0;

  getwellPatientVisitsSorted(patient).forEach(row => {
    /* Undated visits keep whatever they had; there is no
       honest chronological position to give them. */
    if(!row.dateKey) return;

    if(row.visit.visit !== row.label){
      row.visit.visit = row.label;
      changed++;
    }
  });

  return changed;
}


/* "2026-08-01" -> "1 Aug" / "1 Aug 2026". */
function getwellShortVisitDate(dateKey, withYear){
  const key = getwellDateKey(dateKey);
  if(!key) return "No date";

  const parts = key.split("-");
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if(Number.isNaN(date.getTime())) return key;

  return date.toLocaleDateString("en-GB", withYear
    ? {day:"numeric", month:"short", year:"numeric"}
    : {day:"numeric", month:"short"});
}


/*
  WEIGHT AT A VISIT

  Priority, exactly as specified:
    1. the Weight field typed into that visit;
    2. the Arboleaf "Weight" parsed from that same visit's PDF;
    3. nothing — the visit is skipped.

  The patient's current/starting weight is never substituted
  for a historical visit, and no other patient is ever read.
*/
function getwellVisitWeight(visit){
  const typed = Number(visit && visit.weight);
  if(Number.isFinite(typed) && typed > 0) return {value:typed, source:"visit"};

  const parsed = getwellArboleafValue(visit, "Weight");
  if(parsed && parsed.value > 0) return {value:parsed.value, source:"arboleaf"};

  return null;
}


/*
  The patient's weight series: one point per visit that
  actually recorded a weight.
*/
function getwellPatientWeightSeries(patient){
  const points = [];

  getwellPatientVisitsSorted(patient).forEach(row => {
    const weight = getwellVisitWeight(row.visit);
    if(!weight) return;

    points.push({
      id:      row.visit.id || "",
      dateKey: row.dateKey,
      label:   getwellShortVisitDate(row.dateKey),
      full:    getwellShortVisitDate(row.dateKey, true),
      /* The DERIVED label, so a tooltip never shows a stale
         "Visit 5" for what is chronologically Visit 2. */
      visit:   row.label,
      number:  row.number,
      value:   weight.value,
      source:  weight.source
    });
  });

  return points;
}


/*
  The patient's series for one Arboleaf metric. Visits with no
  reading for that metric are skipped, never filled in.
*/
function getwellPatientMetricSeries(patient, metricName){
  const definition = getwellMetricDefinition(metricName);
  const points = [];

  getwellPatientVisitsSorted(patient).forEach(row => {
    const reading = getwellArboleafValue(row.visit, metricName);
    if(!reading) return;

    points.push({
      id:      row.visit.id || "",
      dateKey: row.dateKey,
      label:   getwellShortVisitDate(row.dateKey),
      full:    getwellShortVisitDate(row.dateKey, true),
      visit:   row.label,
      number:  row.number,
      value:   reading.value,
      unit:    reading.unit || definition.unit
    });
  });

  return points;
}


/*
  Which metrics this patient actually has at least one reading
  for. Nothing else is offered, so the selector can never open
  an empty chart.

  The result keeps the registry's order, which is the order the
  Arboleaf report prints them in: the twelve core categories
  first, the supplementary values after.
*/
function getwellPatientAvailableMetrics(patient){
  const visits = getwellPatientVisitsSorted(patient);

  return GETWELL_ARBOLEAF_METRICS.filter(metric =>
    visits.some(row => getwellArboleafValue(row.visit, metric.name))
  );
}

/* How many visits carry a reading for this metric. Part 23:
   a single reading is shown but never drawn as a trend. */
function getwellMetricReadingCount(patient, metricName){
  return getwellPatientVisitsSorted(patient)
    .filter(row => getwellArboleafValue(row.visit, metricName)).length;
}


/*
  SUMMARY FIGURES FOR THE WEIGHT PROGRESS HEADER

  Starting weight prefers the registered Starting Weight on
  the patient record and falls back to the earliest recorded
  visit weight when the field was never filled in.
*/
function getwellPatientWeightSummary(patient, series){
  const points = series || getwellPatientWeightSeries(patient);

  const registeredStart = Number(patient && patient.startingWeight);
  const firstPoint = points.length ? points[0].value : null;
  const latest = points.length ? points[points.length - 1].value : null;

  const start = (Number.isFinite(registeredStart) && registeredStart > 0)
    ? registeredStart
    : firstPoint;

  const goalRaw = Number(patient && patient.goalWeight);
  const goal = (Number.isFinite(goalRaw) && goalRaw > 0) ? goalRaw : null;

  const lost = (start !== null && latest !== null) ? (start - latest) : null;

  return {
    start,
    latest,
    goal,
    lost,
    startFromVisit: !(Number.isFinite(registeredStart) && registeredStart > 0),
    visits: points.length
  };
}


/* =========================================================
   PROGRESS CHART

   Inline SVG, no charting library, no network dependency, so
   it renders the same offline as it does online and inherits
   the Poppins/blue theme through styles.css.

   It draws exactly the points it is handed: real dots on real
   visits, joined by straight segments. Nothing is smoothed,
   averaged, interpolated or resampled.
========================================================= */

/* Shared hover tooltip, created once and reused. */
function getwellChartTooltipNode(){
  let node = document.getElementById("gwChartTooltip");
  if(!node){
    node = document.createElement("div");
    node.id = "gwChartTooltip";
    node.className = "gw-chart-tooltip";
    node.setAttribute("role", "status");
    document.body.appendChild(node);
  }
  return node;
}

function getwellChartPointIn(target){
  const node = getwellChartTooltipNode();
  const box = target.getBoundingClientRect();

  node.innerHTML =
    `<span class="gw-chart-tooltip-title">${escapeHtml(target.getAttribute("data-tip-title") || "")}</span>` +
    `<span class="gw-chart-tooltip-value">${escapeHtml(target.getAttribute("data-tip-value") || "")}</span>` +
    (target.getAttribute("data-tip-note")
      ? `<span class="gw-chart-tooltip-note">${escapeHtml(target.getAttribute("data-tip-note"))}</span>`
      : "");

  node.classList.add("show");

  /* Measured after the content is in place so the tooltip is
     centred on the dot and never runs off the viewport. */
  const width = node.offsetWidth;
  const height = node.offsetHeight;

  let left = box.left + box.width / 2 - width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

  let top = box.top - height - 10;
  if(top < 8) top = box.bottom + 10;

  node.style.left = `${Math.round(left)}px`;
  node.style.top  = `${Math.round(top)}px`;
}

function getwellChartPointOut(){
  const node = document.getElementById("gwChartTooltip");
  if(node) node.classList.remove("show");
}

function getwellFormatMetric(value, decimals){
  const places = Number.isFinite(decimals) ? decimals : 1;
  return Number(value).toFixed(places);
}


/*
  config = {
    points:    [{label, full, visit, value}]   required
    unit:      "kg"                            axis + tooltip suffix
    decimals:  1
    yLabel:    "Weight (kg)"
    xLabel:    "Visit date"
    reference: {value, label}   optional target line (goal weight)
    ariaLabel: "..."
  }
*/
/*
  RESPONSIVE GEOMETRY

  The chart is one SVG scaled to the width of its card, so the
  viewBox itself has to change shape on a narrow screen —
  otherwise a 760x300 box squashed into a phone column ends up
  about 130px tall with 4px axis labels. Three bands: phone,
  tablet, desktop. getwellChartBand() lets a page notice when
  the band actually changed and redraw, instead of redrawing on
  every pixel of a resize.
*/
function getwellChartBand(){
  const width = (typeof window !== "undefined" && window.innerWidth) || 1200;
  if(width <= 560) return 0;
  if(width <= 900) return 1;
  return 2;
}

function getwellChartLayout(){
  const band = getwellChartBand();

  /* padLeft has to clear the widest tick label at that band's
     font size, or the rotated Y-axis title collides with it. */
  if(band === 0) return {
    width:400, height:340, padLeft:60, padRight:14, padTop:16, padBottom:78,
    axisSize:13, titleSize:14, maxLabels:4
  };

  if(band === 1) return {
    width:580, height:320, padLeft:56, padRight:18, padTop:18, padBottom:70,
    axisSize:11.5, titleSize:12, maxLabels:6
  };

  return {
    width:760, height:300, padLeft:54, padRight:20, padTop:20, padBottom:62,
    axisSize:10, titleSize:10.5, maxLabels:8
  };
}

function getwellRenderProgressChart(config){
  const points = (config && config.points) || [];
  if(!points.length) return "";

  const unit     = (config.unit || "").trim();
  const decimals = Number.isFinite(config.decimals) ? config.decimals : 1;
  const suffix   = unit ? ` ${unit}` : "";

  const layout = getwellChartLayout();

  const width  = layout.width;
  const height = layout.height;
  const padLeft   = layout.padLeft;
  const padRight  = layout.padRight;
  const padTop    = layout.padTop;
  const padBottom = layout.padBottom;

  const spanX = width  - padLeft - padRight;
  const spanY = height - padTop  - padBottom;

  const values = points.map(point => point.value);
  const reference = (config.reference && Number.isFinite(Number(config.reference.value)))
    ? {value:Number(config.reference.value), label:config.reference.label || "Target"}
    : null;

  /* The goal line is inside the scale so it is always visible
     rather than clipped off the top or bottom of the plot. */
  const domain = reference ? values.concat([reference.value]) : values;

  let min = Math.min(...domain);
  let max = Math.max(...domain);

  if(max - min < 0.5){
    /* A flat or single-point series still needs a readable
       axis instead of a divide-by-zero. */
    const centre = (max + min) / 2;
    min = centre - 1;
    max = centre + 1;
  }else{
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
  }

  const x = index => points.length === 1
    ? padLeft + spanX / 2
    : padLeft + (spanX * index) / (points.length - 1);

  const y = value => padTop + spanY * (1 - (value - min) / (max - min));

  /* --- Y axis: five evenly spaced gridlines --- */
  const tickCount = 4;
  const gridlines = [];
  for(let i = 0; i <= tickCount; i++){
    const value = max - ((max - min) * i) / tickCount;
    const py = y(value);
    gridlines.push(`
      <line class="gw-grid" x1="${padLeft}" y1="${py.toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${py.toFixed(1)}"></line>
      <text class="gw-axis-text" x="${(padLeft - 9).toFixed(1)}" y="${(py + 3.5).toFixed(1)}" text-anchor="end">${getwellFormatMetric(value, decimals)}</text>
    `);
  }

  /* --- X axis labels: thinned out when there are many visits,
         but every visit still gets its own dot and tooltip. --- */
  const lastIndex = points.length - 1;
  const maxLabels = layout.maxLabels;
  const step = points.length <= maxLabels ? 1 : Math.ceil(points.length / maxLabels);
  const rotate = points.length > Math.min(5, maxLabels);

  const xLabels = points.map((point, index) => {
    if(index !== lastIndex && index % step !== 0) return "";
    const px = x(index);
    const py = height - padBottom + 20;
    /* The outermost labels are pinned to the plot edges so a
       long date at either end is not clipped by the viewBox. */
    const anchor = index === 0 ? "start" : index === lastIndex ? "end" : "middle";

    return rotate
      ? `<text class="gw-axis-text" transform="translate(${px.toFixed(1)},${py.toFixed(1)}) rotate(-38)" text-anchor="end">${escapeHtml(point.label)}</text>`
      : `<text class="gw-axis-text" x="${px.toFixed(1)}" y="${py.toFixed(1)}" text-anchor="${anchor}">${escapeHtml(point.label)}</text>`;
  }).join("");

  /* --- Series --- */
  const coords = points.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`);

  const line = points.length > 1
    ? `<polyline class="gw-series-line" points="${coords.join(" ")}"></polyline>`
    : "";

  const area = points.length > 1
    ? `<polygon class="gw-series-area" points="${padLeft},${(height - padBottom).toFixed(1)} ${coords.join(" ")} ${x(lastIndex).toFixed(1)},${(height - padBottom).toFixed(1)}"></polygon>`
    : "";

  const dots = points.map((point, index) => {
    const px = x(index).toFixed(1);
    const py = y(point.value).toFixed(1);
    const title = `${point.visit || "Visit"} · ${point.full || point.label}`;
    const value = `${getwellFormatMetric(point.value, decimals)}${suffix}`;

    return `
      <g class="gw-point">
        <circle class="gw-dot" cx="${px}" cy="${py}" r="4.5"></circle>
        <circle class="gw-dot-hit" cx="${px}" cy="${py}" r="16"
                data-tip-title="${escapeHtml(title)}"
                data-tip-value="${escapeHtml(value)}"
                ${point.note ? `data-tip-note="${escapeHtml(point.note)}"` : ""}
                tabindex="0"
                onmouseenter="getwellChartPointIn(this)"
                onmouseleave="getwellChartPointOut()"
                onfocus="getwellChartPointIn(this)"
                onblur="getwellChartPointOut()"
                ontouchstart="getwellChartPointIn(this)"><title>${escapeHtml(title)} — ${escapeHtml(value)}</title></circle>
      </g>`;
  }).join("");

  /* --- Optional target line (goal weight) --- */
  const referenceLine = reference ? `
    <line class="gw-reference" x1="${padLeft}" y1="${y(reference.value).toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${y(reference.value).toFixed(1)}"></line>
    <text class="gw-reference-text" x="${(width - padRight).toFixed(1)}" y="${(y(reference.value) - 6).toFixed(1)}" text-anchor="end">${escapeHtml(reference.label)} ${getwellFormatMetric(reference.value, decimals)}${escapeHtml(suffix)}</text>
  ` : "";

  const yAxisTitle = config.yLabel
    ? `<text class="gw-axis-title" transform="translate(12,${(padTop + spanY / 2).toFixed(1)}) rotate(-90)" text-anchor="middle">${escapeHtml(config.yLabel)}</text>`
    : "";

  const xAxisTitle = config.xLabel
    ? `<text class="gw-axis-title" x="${(padLeft + spanX / 2).toFixed(1)}" y="${(height - 6).toFixed(1)}" text-anchor="middle">${escapeHtml(config.xLabel)}</text>`
    : "";

  return `
    <div class="gw-chart-wrap">
      <svg class="gw-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"
           style="--gw-axis-size:${layout.axisSize}px;--gw-title-size:${layout.titleSize}px"
           role="img" aria-label="${escapeHtml(config.ariaLabel || "Progress chart")}">
        <defs>
          <linearGradient id="gwProgressFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stop-color="#2563EB" stop-opacity=".20"></stop>
            <stop offset="100%" stop-color="#2563EB" stop-opacity="0"></stop>
          </linearGradient>
        </defs>

        ${gridlines.join("")}
        <line class="gw-axis-line" x1="${padLeft}" y1="${(height - padBottom).toFixed(1)}" x2="${(width - padRight).toFixed(1)}" y2="${(height - padBottom).toFixed(1)}"></line>
        <line class="gw-axis-line" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${(height - padBottom).toFixed(1)}"></line>

        ${referenceLine}
        ${area}
        ${line}
        ${dots}
        ${xLabels}
        ${yAxisTitle}
        ${xAxisTitle}
      </svg>
    </div>`;
}


/* =========================================================
   TWO-VISIT COMPARISON
   ---------------------------------------------------------
   Compares ANY two visits of ONE patient — they do not have
   to be consecutive, and the order they were picked in does
   not matter: the earlier/later roles are decided from the
   VISIT DATES (falling back to the derived chronological
   position when two visits share a date), never from the
   visit number typed into the form.

   Every numeric change is later − earlier, so a loss reads
   as a negative number.

   Arboleaf is optional throughout. With no Arboleaf on either
   visit the comparison still carries date, weight, height,
   absolute change and percentage change; the metric rows are
   simply empty and the caller renders the basic form.
========================================================= */

function getwellVisitRow(patient, visitId){
  return getwellPatientVisitsSorted(patient).find(row => row.id === visitId) || null;
}


function getwellCompareVisits(patient, visitIdA, visitIdB){
  const rowA = getwellVisitRow(patient, visitIdA);
  const rowB = getwellVisitRow(patient, visitIdB);

  if(!rowA || !rowB) return null;
  if(rowA.id === rowB.id) return {sameVisit:true};

  /* THE DATE DECIDES. getwellPatientVisitsSorted() is already
     ordered oldest -> newest, so the row with the smaller
     chronological position is the earlier visit whichever way
     round the user picked them. */
  const earlier = rowA.number <= rowB.number ? rowA : rowB;
  const later   = rowA.number <= rowB.number ? rowB : rowA;

  const earlierWeight = getwellVisitWeight(earlier.visit);
  const laterWeight   = getwellVisitWeight(later.visit);

  const heightRaw = Number(patient && patient.height);
  const height = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : null;

  let weightChange = null;
  let weightPercent = null;

  if(earlierWeight && laterWeight){
    weightChange = laterWeight.value - earlierWeight.value;
    if(earlierWeight.value > 0){
      weightPercent = (weightChange / earlierWeight.value) * 100;
    }
  }

  /*
    One row per metric either visit actually recorded. A metric
    present on one side only is kept with a null on the other
    and a null change — the caller shows an em dash. No value
    is ever carried across from the other visit, from the
    patient record, or from any other patient.
  */
  const metrics = GETWELL_ARBOLEAF_METRICS.map(definition => {
    const before = getwellArboleafValue(earlier.visit, definition.name);
    const after  = getwellArboleafValue(later.visit,   definition.name);

    if(!before && !after) return null;

    return {
      name:     definition.name,
      unit:     (after && after.unit) || (before && before.unit) || definition.unit,
      decimals: definition.decimals,
      core:     !!definition.core,
      /* Which direction counts as progress for this
         measurement: losing fat is good, losing muscle is not.
         Used only for colour, never for the arithmetic. */
      better:   definition.better || null,
      earlier:  before ? before.value : null,
      later:    after  ? after.value  : null,
      change:   (before && after) ? after.value - before.value : null,
      percent:  (before && after && before.value !== 0)
                  ? ((after.value - before.value) / Math.abs(before.value)) * 100
                  : null
    };
  }).filter(Boolean);

  const bothHaveArboleaf = earlier.hasArboleaf && later.hasArboleaf;

  return {
    sameVisit: false,
    patient,
    height,
    earlier: {
      id:      earlier.id,
      number:  earlier.number,
      label:   earlier.label,
      dateKey: earlier.dateKey,
      date:    getwellShortVisitDate(earlier.dateKey, true),
      weight:  earlierWeight ? earlierWeight.value : null,
      weightSource: earlierWeight ? earlierWeight.source : null,
      hasArboleaf: earlier.hasArboleaf,
      visit:   earlier.visit
    },
    later: {
      id:      later.id,
      number:  later.number,
      label:   later.label,
      dateKey: later.dateKey,
      date:    getwellShortVisitDate(later.dateKey, true),
      weight:  laterWeight ? laterWeight.value : null,
      weightSource: laterWeight ? laterWeight.source : null,
      hasArboleaf: later.hasArboleaf,
      visit:   later.visit
    },
    weightChange,
    weightPercent,
    metrics,
    coreMetrics: metrics.filter(metric => metric.core),
    bothHaveArboleaf,
    /* Only render the body-composition section when there is
       something real to render (Part 13: no empty Arboleaf
       sections). */
    hasComposition: metrics.length > 0,
    days: (earlier.dateKey && later.dateKey)
      ? Math.round(
          (new Date(later.dateKey + "T00:00:00") - new Date(earlier.dateKey + "T00:00:00"))
          / 86400000
        )
      : null
  };
}


/*
  Is this change progress? Returns "good", "warn" or "" when
  the measurement has no meaningful direction (Metabolic Age
  aside, things like SMI or Body Type do not).
*/
function getwellChangeTone(change, better){
  if(change === null || change === undefined || !Number.isFinite(change) || change === 0) return "";
  if(!better) return "";
  const improving = better === "lower" ? change < 0 : change > 0;
  return improving ? "good" : "warn";
}


/*
  jsPDF's built-in Helvetica is WinAnsi, so "kg/m²" and the
  typographic minus come out as blanks. Text bound for the PDF
  goes through here first.
*/
function getwellPdfText(value){
  return String(value === null || value === undefined ? "" : value)
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/−/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/·/g, "-")
    .replace(/[^\x00-\xFF]/g, "");
}


/* "-8.0 kg" / "+1.2 kg" / "—" */
function getwellSignedValue(value, decimals, unit){
  if(value === null || value === undefined || !Number.isFinite(value)) return "—";
  const places = Number.isFinite(decimals) ? decimals : 1;
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const text = Math.abs(value).toFixed(places);
  return `${sign}${text}${unit ? " " + unit : ""}`;
}


/* =========================================================
   ARBOLEAF REPORT PARSER
   ---------------------------------------------------------
   Reads the text of an Arboleaf / Yolanda "Body Composition
   Analysis" report and maps it onto the registry above.

   Two things about these reports drive the design:

   1. THE EXPORTS THE CLINIC ACTUALLY HAS CARRY NO TEXT.
      Both sample PDFs are produced by the Arboleaf app as
      page images (Skia/PDF, no embedded fonts, zero text
      objects). pdf.js therefore extracts nothing from them,
      which is exactly why uploading a report used to record
      no metrics at all. The upload path now falls back to
      OCR, and this parser is written to cope with OCR output
      rather than clean text.

   2. THE VALUE ALWAYS SITS NEXT TO ITS PRINTED NORMAL RANGE.
      Every measured row reads
          <label> … <value> <low>~<high>
      so the printed range is used as an anchor: the reading is
      the last plausible number in front of it. That survives
      the bar-chart tick labels ("55 85 115 145 175 205%")
      that sit between the label and the value on the Muscle
      Fat and Fat Analysis rows, and it works for both report
      layouts without hard-coding any coordinates.

   Nothing here guesses. A value that cannot be read is left
   out, and a value that lands outside the metric's
   physiological bounds is returned flagged rather than
   silently trusted — the Add Visit form shows both states and
   asks staff to confirm before anything is saved.
========================================================= */

/*
  Label matchers. `need` tokens must ALL appear in the line,
  `avoid` tokens must not — which is how "Body Fat Mass",
  "Body Fat Percentage" and "Subcutaneous Fat" stay separate
  even when OCR mangles a label's first character ("nody
  Water", "aay Fat Mass").

  `byUnit` handles the pairs the report distinguishes only by
  unit: Subcutaneous Fat is printed once as a percentage and
  once in kilograms under the same words, and so is Skeletal
  Muscle. The unit printed next to the number decides which
  metric the reading belongs to, which is far more reliable
  than hoping the word "Percentage" survived OCR on the right
  line.
*/
const GETWELL_ARBOLEAF_MATCHERS = [
  {metric:"Fitness Score",              need:["fitness score"],          avoid:[]},
  {metric:"Body Water Percentage",      need:["body water percentage"],  avoid:[]},
  {metric:"Muscle Mass Percentage",     need:["muscle mass percentage"], avoid:[]},
  {metric:"Bone Mass Percentage",       need:["bone mass percentage"],   avoid:[]},
  {metric:"Protein Percentage",         need:["protein percentage"],     avoid:[]},
  {metric:"Waist-to-Hip Ratio",         need:["waist"],                  avoid:[]},
  {metric:"SMI",                        need:["smi"],                    avoid:[]},
  {metric:"Normal Weight",              need:["normal weight"],          avoid:[]},
  {metric:"Fat Mass Control",           need:["fat mass control"],       avoid:[]},
  {metric:"Muscle Control",             need:["muscle control"],         avoid:[]},
  {metric:"Weight Control",             need:["weight control"],         avoid:[]},
  {metric:"BMR",                        need:["bmr"],                    avoid:[]},
  {metric:"BMR",                        need:["basal metabolic"],        avoid:[]},
  {metric:"Fat-free Body Weight",       need:["lbm"],                    avoid:[]},
  {metric:"Fat-free Body Weight",       need:["fat-free body weight"],   avoid:[]},
  {metric:"Fat-free Body Weight",       need:["fat free mass"],          avoid:[]},
  {metric:"Soft Lean Mass",             need:["soft lean mass"],         avoid:[]},
  {metric:"Metabolic Age",              need:["metabolic age"],          avoid:[]},
  {metric:"Body Fat Percentage",        need:["pbf"],                    avoid:[]},
  {metric:"Body Fat Percentage",        need:["body fat percentage"],    avoid:["segmental","/"]},

  /* Same words, different unit -> different metric. */
  {metric:"Subcutaneous Fat Percentage", need:["subcutaneous"], avoid:[],
   byUnit:{"%":"Subcutaneous Fat Percentage", "kg":"Subcutaneous Fat Mass"}},
  {metric:"Skeletal Muscle",             need:["skeletal muscle"], avoid:[],
   byUnit:{"%":"Skeletal Muscle Percentage", "kg":"Skeletal Muscle"}},

  /* "Body Fat Mass" wraps mid-word in the two-column export
     ("Body Fat Ma" / "ss"), so the anchor stops short of the
     full phrase. */
  {metric:"Body Fat Mass", need:["fat ma"],
   avoid:["control","percentage","segmental","subcutaneous","/","normal","lack"]},
  {metric:"Visceral Fat",  need:["visceral"], avoid:[]},
  {metric:"Bone Mass",     need:["bone mass"], avoid:["percentage","normal","lack"]},
  {metric:"Body Water",    need:["water"],     avoid:["percentage","normal","lack"]},
  {metric:"Protein",       need:["protein"],   avoid:["percentage","normal","lack"]},
  {metric:"BMI",           need:["bmi"],       avoid:["under","normal","over"]},
  {metric:"Weight",        need:["weight"],
   avoid:["normal","control","fat-free","fat free","lbm","height","body water","ideal"]},

  /*
    Fallbacks for the plainer wording a text-layer export (or a
    differently worded Arboleaf firmware) may use. They come
    last and both step aside when the fuller label is on the
    same line, so they can never take a reading away from "Body
    Fat Mass" or "Muscle Mass Percentage".
  */
  {metric:"Body Fat Percentage", need:["body fat"],    avoid:["fat ma","mass","segmental","/"], fallback:true},
  {metric:"Muscle Mass",         need:["muscle mass"], avoid:["percentage","skeletal","control"], fallback:true}
];

/* The report's own wording is always tried first; the plainer
   forms only run as a second pass, for metrics the first pass
   did not find at all. */
const GETWELL_ARBOLEAF_PRIMARY  = GETWELL_ARBOLEAF_MATCHERS.filter(m => !m.fallback);
const GETWELL_ARBOLEAF_FALLBACK = GETWELL_ARBOLEAF_MATCHERS.filter(m => m.fallback);


/*
  OCR clean-up that cannot change a reading: table pipes and
  box-drawing become spaces, the various tilde/dash forms used
  for ranges are normalised, and a thousands comma inside a
  number is dropped.
*/
function getwellNormalizeReportText(text){
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[|¦︱│]/g, " ")
    .replace(/[—–−‐‑]/g, "-")
    .replace(/[〜～≈]/g, "~")
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/[ \t ]+/g, " ");
}


/* Every number in a fragment, with where it was found. */
function getwellNumbersIn(fragment){
  const found = [];
  const pattern = /-?\d+(?:\.\d+)?/g;
  let match;
  while((match = pattern.exec(fragment)) !== null){
    found.push({value:Number(match[0]), index:match.index, text:match[0], end:pattern.lastIndex});
  }
  return found;
}


/*
  The printed normal range next to a reading: "18.5~25",
  "<=0.85", "< 1.0". Tolerant of one or two OCR characters
  sitting between the low value and the tilde, because
  "47.7~58.2" routinely comes back as "47./~58.2".
*/
function getwellFindPrintedRange(text){
  return text.match(/(-?\d+(?:\.\d+)?)\.?\s*[^\d~\n]{0,2}~\s*(-?\d+(?:\.\d+)?)/)
      || text.match(/<\s*=?\s*(-?\d+(?:\.\d+)?)/);
}


/*
  Read one measurement out of a fragment of text belonging to a
  single metric.

  Returns {value, unit, anchored, plausible} or null.

    anchored  - the number sits directly in front of the
                report's own printed normal range. That is the
                structural signature of a real reading, and the
                strongest confidence signal available.
    plausible - the number is inside the metric's
                physiological bounds.

  A reading that is neither is still returned, but the caller
  keeps looking and, failing that, marks it for checking.
*/
function getwellReadMetricFragment(fragment, definition, depth){
  let text = String(fragment || "");

  /* Visceral Fat prints its scale inline as "Under 10 Over";
     that 10 is an axis label, not a measurement. */
  text = text.replace(/under\s+-?\d+(?:\.\d+)?\s+over/ig, " ");

  /*
    Two cells of a two-column table can land in one fragment —
    "30.6% 18.5~26.7  45.8kg 35.89~43.86". Each printed range
    closes a cell, so the fragment is split after every range
    and the cell whose printed unit matches this metric wins.
    Without that, a weight in kilograms would be read off the
    percentage cell that happens to come first.
  */
  if(!depth){
    const ranges = [];
    const pattern = /(-?\d+(?:\.\d+)?)\.?\s*[^\d~\n]{0,2}~\s*(-?\d+(?:\.\d+)?)/g;
    let hit;
    while((hit = pattern.exec(text)) !== null) ranges.push(pattern.lastIndex);

    if(ranges.length > 1){
      const cells = [];
      let from = 0;
      ranges.forEach(to => { cells.push(text.slice(from, to)); from = to; });
      if(from < text.length) cells.push(text.slice(from));

      const readings = cells
        .map(cell => getwellReadMetricFragment(cell, definition, 1))
        .filter(Boolean);

      if(readings.length){
        readings.sort((a, b) =>
          (Number(b.unitMatched) - Number(a.unitMatched)) ||
          (Number(b.plausible)   - Number(a.plausible))   ||
          (Number(b.anchored)    - Number(a.anchored))
        );
        return readings[0];
      }
    }
  }

  const rangeMatch = getwellFindPrintedRange(text);
  const anchored = !!rangeMatch && rangeMatch.index > 0;
  const searchArea = anchored ? text.slice(0, rangeMatch.index) : text;

  /*
    Bar-chart tick labels sit between the label and the value
    and always finish with a percent sign ("55 85 115 145 175
    205%"). Everything up to that marker is scale, not reading.
  */
  const tick = /\d+\s*%(?=[^%]*$)/.exec(searchArea);
  const afterTicks = (tick && /\d\s+\d+\s+\d+/.test(searchArea.slice(0, tick.index)))
    ? searchArea.slice(tick.index + tick[0].length)
    : searchArea;

  let candidates = getwellNumbersIn(afterTicks);
  let area = afterTicks;

  if(!candidates.length){
    candidates = getwellNumbersIn(searchArea);
    area = searchArea;
  }
  if(!candidates.length) return null;

  /*
    A run of four or more ascending numbers with no printed
    range is a chart axis ("55 85 115 145 175 205"), not a
    reading. Rejecting it outright sends the scan on to the
    line underneath, which is where the bar-chart rows actually
    print their value.
  */
  if(!anchored && candidates.length >= 4){
    const ascending = candidates.every((item, i) => i === 0 || item.value > candidates[i - 1].value);
    if(ascending) return null;
  }

  const min = Number.isFinite(definition.min) ? definition.min : -Infinity;
  const max = Number.isFinite(definition.max) ? definition.max : Infinity;
  const inBounds = value => value >= min && value <= max;

  /*
    OCR drops decimal points, so "34.7" arrives as "34 7" and
    "97.15" as "97.1 5". When the final candidate is a lone
    digit sitting immediately after another number, the two are
    re-joined — as a new decimal place if the first already has
    one, otherwise as the decimal point itself — but only when
    the result lands inside the metric's bounds.
  */
  if(candidates.length >= 2){
    const last = candidates[candidates.length - 1];
    const prev = candidates[candidates.length - 2];
    const between = area.slice(prev.end, last.index);

    if(/^ ?$/.test(between) && /^\d$/.test(last.text)){
      const joinedText = prev.text.includes(".")
        ? `${prev.text}${last.text}`
        : `${prev.text}.${last.text}`;
      const joined = Number(joinedText);

      if(Number.isFinite(joined) && inBounds(joined) && !inBounds(last.value)){
        candidates = candidates.slice(0, -2).concat([{
          value: joined, index: prev.index, text: joinedText, end: last.end
        }]);
      }else if(Number.isFinite(joined) && inBounds(joined) && !prev.text.includes(".")){
        candidates = candidates.slice(0, -2).concat([{
          value: joined, index: prev.index, text: joinedText, end: last.end
        }]);
      }
    }
  }

  /* The unit printed straight after a number: "45.8kg",
     "1360kcal", "30.6%". */
  const unitAfter = item => {
    const tail = area.slice(item.end, item.end + 8);
    const match = tail.match(/^\s*(kg\/m2|kg\/m²|kcal|kg|lbs|%|L\b)/i);
    return match ? match[1] : "";
  };

  const wantedUnit = String(definition.unit || "").toLowerCase();
  const plausible = candidates.filter(item => inBounds(item.value));
  const pool = plausible.length ? plausible : candidates;

  /*
    When the report prints the unit, it settles which number on
    a shared line belongs to this metric — "30.6% … 45.8kg" is
    unambiguous even though both numbers are plausible for a
    weight.
  */
  const unitMatched = (wantedUnit && anchored)
    ? pool.filter(item => unitAfter(item).toLowerCase() === wantedUnit)
    : [];

  const shortlist = unitMatched.length ? unitMatched : pool;

  /*
    With a printed range to anchor against, the reading is the
    number closest in front of it, so take the last. With no
    anchor the reading follows its label directly, so take the
    first.
  */
  const chosen = anchored ? shortlist[shortlist.length - 1] : shortlist[0];
  const unit = unitAfter(chosen);

  return {
    value: chosen.value,
    unit: unit || definition.unit,
    anchored,
    plausible: inBounds(chosen.value),
    unitMatched: !!unit && unit.toLowerCase() === wantedUnit
  };
}


/*
  Parse a whole Arboleaf report.

  Returns {metrics, flagged} where `metrics` is keyed by
  canonical metric name in the {value, unit} shape the rest of
  the app already stores, and `flagged` names the metrics whose
  reading was not confirmed by a printed normal range or fell
  outside physiological bounds — the Add Visit form shows those
  in amber and asks staff to check them.
*/
function getwellParseArboleafReport(text){
  const normalized = getwellNormalizeReportText(text);
  const lines = normalized.split("\n").map(line => line.trim()).filter(Boolean);

  const readings = {};   /* metric -> best reading so far */

  const offer = (metricName, reading) => {
    if(!reading || !Number.isFinite(reading.value)) return;

    /* Anchored to the report's own printed normal range is the
       strongest signal, then physiological plausibility, then a
       matching printed unit. */
    const score = (reading.anchored ? 4 : 0)
                + (reading.plausible ? 2 : 0)
                + (reading.unitMatched ? 1 : 0);
    const held = readings[metricName];
    if(held && held.score >= score) return;

    readings[metricName] = {reading, score};
  };

  const scan = (matchers) => lines.forEach((line, lineIndex) => {
    const lower = line.toLowerCase();

    /* Where each known label starts on this line. A two-column
       layout puts two metrics on one line, so each label owns
       only the text up to the next label. */
    const hits = [];

    matchers.forEach(matcher => {
      const anchor = matcher.need[0];
      const at = lower.indexOf(anchor);
      if(at < 0) return;
      if(!matcher.need.every(token => lower.includes(token))) return;

      hits.push({matcher, at, end:at + anchor.length});
    });

    if(!hits.length) return;

    /* Longest label first at the same position, so "Normal
       weight" beats the "weight" sitting inside it. */
    hits.sort((a, b) => (a.at - b.at) || ((b.end - b.at) - (a.end - a.at)));

    /*
      Drop any label that starts INSIDE a label already
      accepted on this line. "Normal weight 63.86kg" holds one
      reading, not a Normal Weight and a Weight, and without
      this the plain Weight matcher would swallow the value.
    */
    const outer = [];
    hits.forEach(hit => {
      const nested = outer.some(kept => hit.at >= kept.at && hit.at < kept.end);
      if(!nested) outer.push(hit);
    });

    hits.length = 0;
    outer.forEach(hit => hits.push(hit));

    /*
      `avoid` is judged on the label's OWN slice of the line,
      not the whole line. The two-column export prints a
      measured row and a tick-box row side by side — "Protein
      90.3   Body Fat Mass | Normal | Lack | Over" — and only
      the tick-box half should be discarded.
    */
    const kept = hits.filter((hit, index) => {
      const nextAt = index + 1 < hits.length ? hits[index + 1].at : line.length;
      const own = lower.slice(hit.at, nextAt);
      return !(hit.matcher.avoid || []).some(token => own.includes(token));
    });

    hits.length = 0;
    kept.forEach(hit => hits.push(hit));
    if(!hits.length) return;

    hits.forEach((hit, index) => {
      const nextAt = index + 1 < hits.length ? hits[index + 1].at : line.length;
      const definition = getwellMetricDefinition(hit.matcher.metric);

      /*
        Candidate fragments, best first: the label's own slice
        of this line, then the next two lines. A wrapped table
        cell prints the label on one line and the value on the
        next, and the bar-chart rows print the scale beside the
        label and the value underneath it.

        The scan stops as soon as another metric's label
        appears, so a reading is never stolen from the row below.
      */
      const fragments = [{text:line.slice(hit.end, nextAt), own:true}];

      for(let ahead = 1; ahead <= 2; ahead++){
        const nextLine = lines[lineIndex + ahead];
        if(!nextLine) break;

        const nextLower = nextLine.toLowerCase();
        const firstDigit = nextLine.search(/\d/);

        /*
          Only a label at the START of the next line means the
          next row has begun. The two-column export prints the
          right-hand column's label after the left-hand
          column's value on the same physical line, and that
          must not stop the scan.
        */
        const startsAnotherMetric = GETWELL_ARBOLEAF_MATCHERS.some(other => {
          if(other.metric === hit.matcher.metric) return false;
          if(!other.need.every(token => nextLower.includes(token))) return false;

          const at = nextLower.indexOf(other.need[0]);
          return at <= 8 || (firstDigit >= 0 && at < firstDigit);
        });
        if(startsAnotherMetric) break;

        fragments.push({text:nextLine, own:false});
      }

      fragments.forEach(fragment => {
        const reading = getwellReadMetricFragment(fragment.text, definition);
        if(!reading) return;

        /*
          A number picked up from a following line is only
          accepted when the report's own structure confirms it —
          a printed normal range, or a printed unit that matches
          the metric. Without that, a stray "1%" from a diagram
          caption two lines down would be read as a Visceral Fat
          grade of 1.
        */
        if(!fragment.own && !reading.anchored && !(reading.unitMatched && reading.plausible)) return;

        /* Same words, different unit -> different metric. */
        let target = hit.matcher.metric;
        if(hit.matcher.byUnit){
          const unitKey = String(reading.unit || "").toLowerCase();
          target = hit.matcher.byUnit[unitKey] || hit.matcher.byUnit["kg"] || target;
          reading.unit = getwellMetricDefinition(target).unit;
        }

        offer(target, reading);
      });
    });
  });

  scan(GETWELL_ARBOLEAF_PRIMARY);
  scan(GETWELL_ARBOLEAF_FALLBACK.filter(matcher => !readings[matcher.metric]));

  const metrics = {};
  const flagged = [];

  Object.keys(readings).forEach(name => {
    const {reading, score} = readings[name];
    metrics[name] = {value:reading.value, unit:reading.unit || ""};
    /* Only a reading confirmed by its own printed normal range
       AND inside physiological bounds is taken on trust. */
    if(score < 6) flagged.push(name);
  });

  /* Body Type is the one non-numeric measurement the report
     carries, and older visits already store it. */
  const bodyType = normalized.match(/\bBody\s*Type\b\s*[:\-]?\s*([A-Za-z][A-Za-z ]{1,28})/i);
  if(bodyType){
    const word = bodyType[1].trim().replace(/\s+/g, " ");
    if(word) metrics["Body Type"] = word;
  }

  return {metrics, flagged};
}
