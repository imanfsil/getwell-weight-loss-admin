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

function getwellSystemSettings(){

  const raw =
    localStorage.getItem(
      "GETWELL_SYSTEM_CONFIG_V1"
    );


  if(!raw){

    return {

      general: {},

      patient: {

        idPrefix:
          "GW-",

        idDigits:
          4,

        nextNumber:
          1,

        autoGenerateId:
          true,

        statuses: [

          {
            name:
              "Active",

            enabled:
              true
          },

          {
            name:
              "Inactive",

            enabled:
              true
          },

          {
            name:
              "Completed",

            enabled:
              true
          }

        ],

        defaultStatus:
          "Active"

      },


      panels: [],


      appointments: {

        statuses: [

          {
            name:
              "Upcoming",

            enabled:
              true
          },

          {
            name:
              "Completed",

            enabled:
              true
          },

          {
            name:
              "No Show",

            enabled:
              true
          },

          {
            name:
              "Cancelled",

            enabled:
              true
          }

        ],

        defaultStatus:
          "Upcoming",

        defaultDuration:
          30

      },


      followUp: {

        dueAfterDays:
          5,

        overdueAfterDays:
          7

      },


      dashboard: {},

      reports: {},


      features: {

        patients:
          true,

        appointments:
          true,

        panel:
          true,

        reports:
          true,

        followUpAlerts:
          true,

        panelClaims:
          true

      }

    };

  }


  try{

    return JSON.parse(
      raw
    );

  }catch(error){

    console.error(
      "Unable to read Getwell system settings:",
      error
    );


    return {};

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


  return Array.isArray(
    settings.panels
  )
    ? settings.panels
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
   GOOGLE SHEETS REMOTE STORAGE
   ========================================================= */

const GETWELL_SHEETS_API_URL =
  "https://script.google.com/macros/s/AKfycbwCAUk-c4fV3Ny7SfY2x3mWity4W8MKxJwlajxdFdUOaDAjFP7lgtb17_BbOXWlGT8kSg/exec";

const GETWELL_REMOTE_POLL_MS = 30000;
const GETWELL_REMOTE_SAVE_KEY = "GETWELL_REMOTE_LAST_SAVE";

function getwellRemoteConfigured(){
  return (
    GETWELL_SHEETS_API_URL &&
    !GETWELL_SHEETS_API_URL.includes("PASTE_YOUR_")
  );
}

function getwellLocalStoreSnapshot(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : structuredClone(seed);
  }catch(error){
    return structuredClone(seed);
  }
}

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

function getwellRemoteSave(data){
  if(!getwellRemoteConfigured()){
    return;
  }

  try{
    localStorage.setItem(
      GETWELL_REMOTE_SAVE_KEY,
      String(Date.now())
    );

    fetch(
      GETWELL_SHEETS_API_URL,
      {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "save",
          data
        })
      }
    ).catch(error => {
      console.error(
        "Getwell Google Sheets save failed:",
        error
      );
    });
  }catch(error){
    console.error(
      "Getwell Google Sheets save error:",
      error
    );
  }
}

function getwellSyncRemoteStore(forceReload){
  if(!getwellRemoteConfigured()){
    return;
  }

  getwellRemoteRead(payload => {
    if(
      !payload ||
      payload.ok !== true ||
      !payload.data ||
      !Array.isArray(payload.data.patients)
    ){
      return;
    }

    const remote =
      payload.data;

    const local =
      getwellLocalStoreSnapshot();

    const remoteJson =
      JSON.stringify(remote);

    const localJson =
      JSON.stringify(local);

    /*
      If the Google Sheet has records, it is the
      source of truth. This makes manual Sheet edits
      appear in the web application.
    */
    if(
      remote.dataVersion !== "EMPTY" &&
      remoteJson !== localJson
    ){
      localStorage.setItem(
        STORE_KEY,
        remoteJson
      );

      localStorage.setItem(
        MIGRATION_KEY,
        "done"
      );

      if(forceReload !== false){
        location.reload();
      }

      return;
    }

    /*
      First-time setup:
      if the Sheet is empty but this browser already
      contains patients, push the browser data up once.
    */
    if(
      payload.dataVersion === "EMPTY" &&
      Array.isArray(local.patients) &&
      local.patients.length
    ){
      getwellRemoteSave(local);
    }
  });
}

function getwellStartRemoteSync(){
  if(!getwellRemoteConfigured()){
    return;
  }

  /*
    Give the page a moment to render first.
    Then Google Sheets becomes the persistent source.
  */
  setTimeout(
    () => getwellSyncRemoteStore(true),
    250
  );

  setInterval(
    () => {
      const lastSave =
        Number(
          localStorage.getItem(
            GETWELL_REMOTE_SAVE_KEY
          ) || 0
        );

      /*
        Avoid replacing a just-saved local record
        while the POST is still travelling to Apps Script.
      */
      if(
        Date.now() - lastSave < 5000
      ){
        return;
      }

      getwellSyncRemoteStore(true);
    },
    GETWELL_REMOTE_POLL_MS
  );
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

  const snapshot =
    structuredClone(data);

  localStorage.setItem(
    STORE_KEY,
    JSON.stringify(
      snapshot
    )
  );

  /*
    Persist every web save to Google Sheets.
    localStorage remains the fast local cache;
    Google Sheets is the permanent shared backend.
  */
  getwellRemoteSave(
    snapshot
  );

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


  saveStore(
    data
  );

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

function ensureVisit(
  visit
){

  if(
    !visit.billing
  ){

    visit.billing =
      {};

  }


  visit.billing.injection ||=
    {
      price:0,
      notes:""
    };


  visit.billing.medication ||=
    {
      price:0,
      notes:""
    };


  visit.billing.treatment ||=
    {
      price:0,
      notes:""
    };


  visit.billing.other ||=
    {
      price:0,
      notes:""
    };


  visit.billing.panel =
    Number(
      visit.billing.panel ||
      0
    );


  visit.billing.selfPay =
    Number(
      visit.billing.selfPay ||
      0
    );


  return visit;

}


function visitTotal(
  visit
){

  const billing =
    ensureVisit(
      visit
    ).billing;


  return (
    (+billing.injection.price || 0) +
    (+billing.medication.price || 0) +
    (+billing.treatment.price || 0) +
    (+billing.other.price || 0)
  );

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

      const billing =
        ensureVisit(
          visit
        ).billing;


      injection +=
        +billing.injection.price ||
        0;


      medication +=
        +billing.medication.price ||
        0;


      treatment +=
        +billing.treatment.price ||
        0;


      selfpay +=
        +billing.selfPay ||
        0;

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
      Math.max(
        0,
        grand -
        claimed
      ),

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


  applyTheme(
    current ===
      "dark"
      ? "light"
      : "dark"
  );

}


/* =========================================================
   HEADER
========================================================= */

function header(){

  const followUp =
    getwellFollowUpSettings();


  return `

<header class="topbar">

  <div class="topbar-left">

    <div>

      <div class="page-title">
        ${document.title
          .split("|")[0]
          .trim()}
      </div>

      <div class="page-subtitle">
        Getwell Weight Loss Admin
      </div>

    </div>

  </div>


  <div class="topbar-right">

    <div class="search-box">

      <span>
        ⌕
      </span>
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
        onclick="toggleNotifications(event)"
      >

        🔔

        <span
          class="notification-count"
          id="notifCount"
          hidden
        >
          0
        </span>

      </button>


      <div
        id="notifPanel"
        class="global-notification-panel"
        hidden
      >

        <div class="notif-head">

          <div>

            <strong>
              Follow-Up Alerts
            </strong>

            <span>
              ${followUp.dueAfterDays}
              days due ·
              ${followUp.overdueAfterDays}
              days overdue
            </span>

          </div>

        </div>


        <div id="notifBody"></div>

      </div>

    </div>


    <button
      class="theme-toggle"
      id="themeToggle"
      onclick="toggleTheme()"
    >
      ☾
    </button>


    <div class="user-avatar">
      A
    </div>


  </div>

</header>

`;

}


/* =========================================================
   SIDEBAR
========================================================= */

function sidebar(
  active
){

  const showPatients =
    getwellFeatureEnabled(
      "patients"
    );


  const showAppointments =
    getwellFeatureEnabled(
      "appointments"
    );


  const showPanel =
    getwellFeatureEnabled(
      "panel"
    );


  const showReports =
    getwellFeatureEnabled(
      "reports"
    );


  return `

<aside class="sidebar">


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

  </div>


  <nav class="nav">

    <div class="nav-label">
      MAIN
    </div>


    <a
      class="${
        active ===
          "dashboard"
          ? "active"
          : ""
      }"
      href="index.html"
    >
      ⌂ Dashboard
    </a>


    ${
      showPatients
        ? `

          <a
            class="${
              active ===
                "patients"
                ? "active"
                : ""
            }"
            href="patients.html"
          >
            ♙ Patients
          </a>

        `
        : ""
    }


    ${
      showAppointments
        ? `

          <a
            class="${
              active ===
                "appointments"
                ? "active"
                : ""
            }"
            href="appointments.html"
          >
            ▣ Appointments
          </a>

        `
        : ""
    }


    <div
      class="nav-label"
      style="margin-top:18px"
    >
      MANAGEMENT
    </div>


    ${
      showPanel
        ? `

          <a
            class="${
              active ===
                "panel"
                ? "active"
                : ""
            }"
            href="panel.html"
          >
            ▣ Panel
          </a>

        `
        : ""
    }


    ${
      showReports
        ? `

          <a
            class="${
              active ===
                "reports"
                ? "active"
                : ""
            }"
            href="reports.html"
          >
            ▤ Reports
          </a>

        `
        : ""
    }


    <a
      class="${
        active ===
          "settings"
          ? "active"
          : ""
      }"
      href="settings.html"
    >
      ⚙ Settings
    </a>


  </nav>


  <div class="sidebar-user">

    <div class="user-card">

      <div class="user-dot">
        A
      </div>

      <div>

        <div class="user-name">
          Administrator
        </div>

        <div class="user-role">
          Weight Loss Program
        </div>

      </div>

    </div>

  </div>


</aside>

`;

}


/* =========================================================
   HOME
========================================================= */

function goHome(){

  window.location.href =
    "index.html";

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

  <main class="main">

    ${header()}

    <div class="content">

      ${body}

    </div>

  </main>

</div>

`;

}


/* =========================================================
   NOTIFICATIONS
========================================================= */

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


  if(
    !panel.hidden
  ){

    renderNotifications();

  }

}


function renderNotifications(){

  const list =
    alerts();


  const count =
    document.getElementById(
      "notifCount"
    );


  const body =
    document.getElementById(
      "notifBody"
    );


  if(
    !count ||
    !body
  ){

    return;

  }


  count.hidden =
    list.length ===
    0;


  count.textContent =
    list.length >
      99
      ? "99+"
      : list.length;


  if(!list.length){

    body.innerHTML = `

      <div class="notif-empty">
        No patients are due.
      </div>

    `;


    return;

  }


  body.innerHTML =
    list
      .map(
        patient => `

          <div
            class="notif-item"
            onclick="
              location.href=
                'patient-profile.html?patient=' +
                encodeURIComponent(
                  '${String(
                    patient.id
                  )
                  .replace(
                    /'/g,
                    "\\'"
                  )}'
                )
            "
          >

            <span
              class="
                notif-dot
                ${patient.level}
              "
            ></span>


            <div>

              <div class="notif-name">
                ${patient.name}
              </div>


              <div class="notif-text">

                ${
                  patient.level ===
                    "overdue"
                    ? "Overdue"
                    : "Due for Follow-Up"
                }

                ·

                ${patient.days}

                days since last visit.

              </div>

            </div>

          </div>

        `
      )
      .join("");

}


/* =========================================================
   CLOSE NOTIFICATIONS
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


    renderNotifications();


    getwellStartRemoteSync();

  }
);
