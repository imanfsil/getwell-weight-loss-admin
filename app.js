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

const SETTINGS_KEY =
  "GETWELL_SYSTEM_CONFIG_V1";

const SETTINGS_UPDATED_KEY =
  "GETWELL_SETTINGS_UPDATED";


const seed = {
  patients: []
};


/* =========================================================
   DEFAULT SYSTEM SETTINGS
========================================================= */

const DEFAULT_SYSTEM_SETTINGS = {

  general: {

    clinicName:
      "Getwell Clinic",

    clinicLocation:
      "Puncak Alam",

    contactNumber:
      "",

    email:
      "",

    operatingHours:
      "8:00 AM - 12:00 AM"

  },


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


  panels: [

    {
      id:
        "PMCARE",

      name:
        "PMCare",

      enabled:
        true
    },

    {
      id:
        "MICARE",

      name:
        "MiCare",

      enabled:
        true
    },

    {
      id:
        "UITM",

      name:
        "UITM",

      enabled:
        true
    },

    {
      id:
        "COMPUMED",

      name:
        "CompuMed",

      enabled:
        true
    },

    {
      id:
        "SELCARE",

      name:
        "Selcare",

      enabled:
        true
    }

  ],


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


  dashboard: {

    showTotalPatients:
      true,

    showActivePatients:
      true,

    showDueFollowUp:
      true,

    showPanelPatients:
      true,

    showAttention:
      true,

    showPanelClaimOverview:
      true

  },


  reports: {

    showPerformance:
      true,

    showRevenue:
      true,

    showPatientActivity:
      true,

    showVisitSummary:
      true,

    showPanelPerformance:
      true,

    showSuspendedPolicies:
      true,

    showAppointmentPerformance:
      true,

    showDownloadPDF:
      true

  },


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


/* =========================================================
   CONFIG HELPERS
========================================================= */

function cloneObject(
  object
){

  return JSON.parse(
    JSON.stringify(
      object
    )
  );

}


function mergeSystemSettings(
  defaults,
  saved
){

  if(
    Array.isArray(
      defaults
    )
  ){

    return Array.isArray(
      saved
    )
      ? saved
      : cloneObject(
          defaults
        );

  }


  if(
    defaults &&
    typeof defaults ===
      "object"
  ){

    const result = {};


    Object.keys(
      defaults
    )
    .forEach(
      key => {

        result[key] =
          mergeSystemSettings(
            defaults[key],
            saved &&
            saved[key] !==
              undefined
              ? saved[key]
              : defaults[key]
          );

      }
    );


    return result;

  }


  return saved !==
    undefined
      ? saved
      : defaults;

}


/* =========================================================
   GET SYSTEM SETTINGS
========================================================= */

function getSystemSettings(){

  const raw =
    localStorage.getItem(
      SETTINGS_KEY
    );


  if(!raw){

    const defaults =
      cloneObject(
        DEFAULT_SYSTEM_SETTINGS
      );


    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(
        defaults
      )
    );


    return defaults;

  }


  try{

    const saved =
      JSON.parse(
        raw
      );


    const merged =
      mergeSystemSettings(
        DEFAULT_SYSTEM_SETTINGS,
        saved
      );


    /*
      Automatically update missing
      settings introduced by future
      versions.
    */

    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(
        merged
      )
    );


    return merged;

  }catch(error){

    console.error(
      "Unable to read Getwell settings:",
      error
    );


    const defaults =
      cloneObject(
        DEFAULT_SYSTEM_SETTINGS
      );


    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(
        defaults
      )
    );


    return defaults;

  }

}


/* =========================================================
   SAVE SYSTEM SETTINGS
========================================================= */

function saveSystemSettings(
  settings
){

  if(
    !settings ||
    typeof settings !==
      "object"
  ){

    return false;

  }


  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(
      settings
    )
  );


  localStorage.setItem(
    SETTINGS_UPDATED_KEY,
    String(
      Date.now()
    )
  );


  return true;

}


/* =========================================================
   GLOBAL CONFIG ACCESS
========================================================= */

function systemSettings(){

  return getSystemSettings();

}


/* =========================================================
   PATIENT STATUS
========================================================= */

function getPatientStatuses(){

  const settings =
    getSystemSettings();


  return (
    settings.patient &&
    Array.isArray(
      settings.patient.statuses
    )
  )
    ? settings.patient.statuses
    : [];

}


function getActivePatientStatuses(){

  return getPatientStatuses()
    .filter(
      status =>
        status &&
        status.enabled
    );

}


function getDefaultPatientStatus(){

  const settings =
    getSystemSettings();


  const statuses =
    getActivePatientStatuses();


  const wanted =
    settings.patient
      ?.defaultStatus;


  if(
    statuses.some(
      status =>
        status.name ===
        wanted
    )
  ){

    return wanted;

  }


  return statuses[0]
    ?.name ||
    "Active";

}


/* =========================================================
   PATIENT ID
========================================================= */

function getPatientIdSettings(){

  const settings =
    getSystemSettings();


  return {

    prefix:
      String(
        settings.patient
          ?.idPrefix ||
        "GW-"
      ),

    digits:
      Math.max(
        1,
        Number(
          settings.patient
            ?.idDigits
        ) ||
        4
      ),

    nextNumber:
      Math.max(
        1,
        Number(
          settings.patient
            ?.nextNumber
        ) ||
        1
      ),

    autoGenerate:
      settings.patient
        ?.autoGenerateId !==
        false

  };

}


function formatPatientId(
  number
){

  const config =
    getPatientIdSettings();


  return (
    config.prefix +
    String(
      number
    )
    .padStart(
      config.digits,
      "0"
    )
  );

}


function getNextPatientId(){

  const config =
    getPatientIdSettings();


  return formatPatientId(
    config.nextNumber
  );

}


function reserveNextPatientId(){

  const settings =
    getSystemSettings();


  const current =
    Math.max(
      1,
      Number(
        settings.patient
          ?.nextNumber
      ) ||
      1
    );


  const id =
    formatPatientId(
      current
    );


  settings.patient
    .nextNumber =
    current + 1;


  saveSystemSettings(
    settings
  );


  return id;

}


/* =========================================================
   PANELS
========================================================= */

function getAllPanels(){

  const settings =
    getSystemSettings();


  return Array.isArray(
    settings.panels
  )
    ? settings.panels
    : [];

}


function getActivePanels(){

  return getAllPanels()
    .filter(
      panel =>
        panel &&
        panel.enabled
    );

}


function getPanelById(
  id
){

  if(!id)
    return null;


  return getAllPanels()
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
    ) || null;

}


function getPanelByName(
  name
){

  if(!name)
    return null;


  return getAllPanels()
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
    ) || null;

}


function getPanelOptions(){

  return [

    {
      id:
        "SELF_PAY",

      name:
        "Self-Pay",

      enabled:
        true

    },

    ...getActivePanels()

  ];

}


/* =========================================================
   PANEL NAME RESOLUTION
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


  /*
    New Settings-based panel IDs.
  */

  const configured =
    getPanelById(
      p.panelProvider
    );


  if(configured){

    return configured.name;

  }


  /*
    Existing / legacy panel values.
    Kept so existing patients are
    NOT broken.
  */

  if(
    p.panelProvider ===
      "Other"
  ){

    return (
      p.otherPanelName ||
      "Panel"
    );

  }


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


  return (
    p.otherPanelName ||
    p.panelProvider ||
    "Panel"
  );

}


/* =========================================================
   NORMALIZE PANEL TYPE
========================================================= */

function normalizePanelType(
  value
){

  if(
    !value ||
    value ===
      "SELF_PAY"
  ){

    return "SELF_PAY";

  }


  /*
    If the value already belongs
    to the current Settings list,
    preserve it.
  */

  const configured =
    getPanelById(
      value
    );


  if(configured){

    return configured.id;

  }


  /*
    Legacy values.
  */

  if(
    value ===
      "MiCare"
  ){

    return "PANEL_A";

  }


  if(
    value ===
      "PMCare"
  ){

    return "PANEL_B";

  }


  if(
    value ===
      "Other Panel"
  ){

    return "PANEL_C";

  }


  return value;

}


/* =========================================================
   APPOINTMENT SETTINGS
========================================================= */

function getAppointmentStatuses(){

  const settings =
    getSystemSettings();


  return Array.isArray(
    settings.appointments
      ?.statuses
  )
    ? settings.appointments
        .statuses
        .filter(
          status =>
            status &&
            status.enabled
        )
    : [];

}


function getDefaultAppointmentStatus(){

  const settings =
    getSystemSettings();


  const statuses =
    getAppointmentStatuses();


  const wanted =
    settings.appointments
      ?.defaultStatus;


  if(
    statuses.some(
      status =>
        status.name ===
        wanted
    )
  ){

    return wanted;

  }


  return statuses[0]
    ?.name ||
    "Upcoming";

}


function getAppointmentDuration(){

  const settings =
    getSystemSettings();


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
   FOLLOW-UP SETTINGS
========================================================= */

function getFollowUpSettings(){

  const settings =
    getSystemSettings();


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
   FEATURE SETTINGS
========================================================= */

function isFeatureEnabled(
  feature
){

  const settings =
    getSystemSettings();


  /*
    Unknown features remain
    enabled so older pages
    don't unexpectedly disappear.
  */

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

function getDashboardSettings(){

  const settings =
    getSystemSettings();


  return (
    settings.dashboard ||
    {}
  );

}


/* =========================================================
   REPORT SETTINGS
========================================================= */

function getReportSettings(){

  const settings =
    getSystemSettings();


  return (
    settings.reports ||
    {}
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


      const m =
        old.match(
          /^PAT-(\d+)$/i
        );


      if(m){

        const n =
          String(
            Number(
              m[1]
            )
          )
          .padStart(
            4,
            "0"
          );


        const neu =
          `GW-${n}`;


        map[old] =
          neu;


        p.id =
          neu;


        used.add(
          neu
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
            map[a.patientId]
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


/* =========================================================
   SAVE STORE
========================================================= */

function saveStore(
  d
){

  localStorage.setItem(
    STORE_KEY,
    JSON.stringify(
      d
    )
  );

}


/* =========================================================
   PATIENT
========================================================= */

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
    p =>
      p.id ===
      wanted
  ) ||
  null;

}


function mapLegacyId(
  id
){

  const s =
    String(
      id ||
      ""
    );


  const m =
    s.match(
      /^PAT-(\d+)$/i
    );


  return m
    ? `GW-${String(Number(m[1])).padStart(4,"0")}`
    : s;

}


/* =========================================================
   UPSERT PATIENT
========================================================= */

function upsertPatient(
  p
){

  const d =
    store();


  const i =
    d.patients
      .findIndex(
        x =>
          x.id ===
          p.id
      );


  if(i >= 0){

    d.patients[i] =
      p;

  }else{

    d.patients.push(
      p
    );

  }


  saveStore(
    d
  );

}


/* =========================================================
   CLAIMS
========================================================= */

function ensureClaims(
  p
){

  if(
    !Array.isArray(
      p.claims
    )
  ){

    p.claims =
      [];

  }


  return p.claims;

}


/* =========================================================
   VISIT
========================================================= */

function ensureVisit(
  v
){

  if(
    !v.billing
  ){

    v.billing =
      {};

  }


  v.billing.injection ||=
    {
      price:0,
      notes:""
    };


  v.billing.medication ||=
    {
      price:0,
      notes:""
    };


  v.billing.treatment ||=
    {
      price:0,
      notes:""
    };


  v.billing.other ||=
    {
      price:0,
      notes:""
    };


  v.billing.panel =
    Number(
      v.billing.panel ||
      0
    );


  v.billing.selfPay =
    Number(
      v.billing.selfPay ||
      0
    );


  return v;

}


/* =========================================================
   VISIT TOTAL
========================================================= */

function visitTotal(
  v
){

  const b =
    ensureVisit(
      v
    )
    .billing;


  return (
    (+b.injection.price || 0) +
    (+b.medication.price || 0) +
    (+b.treatment.price || 0) +
    (+b.other.price || 0)
  );

}


/* =========================================================
   PANEL CHECK
========================================================= */

function patientUsesPanel(
  p
){

  return !!(
    p?.panelProvider &&
    p.panelProvider !==
      "SELF_PAY"
  );

}


/* =========================================================
   PANEL SUSPENSION
========================================================= */

function isPanelSuspended(
  p
){

  return (
    patientUsesPanel(
      p
    ) &&
    (
      p.panelStatus ===
        "Suspended" ||

      p.insuranceStatus ===
        "Suspended"
    )
  );

}


function panelSuspensionNote(
  p
){

  return (
    p.panelSuspensionNote ||
    p.insuranceSuspensionNote ||
    ""
  );

}


/* =========================================================
   TOTALS
========================================================= */

function grandTotal(
  p
){

  return (
    p.visits ||
    []
  )
  .reduce(
    (
      s,
      v
    ) =>
      s +
      visitTotal(
        v
      ),
    0
  );

}


function claimsTotal(
  p
){

  return ensureClaims(
    p
  )
  .reduce(
    (
      s,
      c
    ) =>
      s +
      (
        +c.amount ||
        0
      ),
    0
  );

}


/* =========================================================
   FINANCE
========================================================= */

function finance(
  p
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
    p.visits ||
    []
  )
  .forEach(
    v => {

      const b =
        ensureVisit(
          v
        )
        .billing;


      injection +=
        +b.injection.price ||
        0;


      medication +=
        +b.medication.price ||
        0;


      treatment +=
        +b.treatment.price ||
        0;


      selfpay +=
        +b.selfPay ||
        0;

    }
  );


  const grand =
    grandTotal(
      p
    );


  const claimed =
    claimsTotal(
      p
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
   LATEST VISIT
========================================================= */

function latestVisit(
  p
){

  return [
    ...(p.visits ||
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


/* =========================================================
   DAYS SINCE
========================================================= */

function daysSince(
  d
){

  if(!d)
    return null;


  const a =
    new Date(
      d +
      "T00:00:00"
    );


  const b =
    new Date();


  b.setHours(
    0,
    0,
    0,
    0
  );


  return Math.floor(
    (
      b -
      a
    ) /
    86400000
  );

}


/* =========================================================
   FOLLOW-UP ALERTS
========================================================= */

function alerts(){

  const config =
    getFollowUpSettings();


  return (
    store().patients ||
    []
  )
  .map(
    p => {

      const d =
        daysSince(
          latestVisit(
            p
          )
          ?.dateKey
        );


      if(
        d === null ||
        d <
          config.dueAfterDays
      ){

        return null;

      }


      return {

        id:
          p.id,

        name:
          p.name,

        days:
          d,

        level:
          d >=
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
  n
){

  return (
    "RM " +
    Number(
      n ||
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
  t
){

  t =
    t ===
      "dark"
      ? "dark"
      : "light";


  document.documentElement
    .dataset.theme =
    t;


  localStorage.setItem(
    THEME_KEY,
    t
  );


  const b =
    document.getElementById(
      "themeToggle"
    );


  if(b){

    b.textContent =
      t ===
        "dark"
        ? "☀"
        : "☾";


    b.title =
      t ===
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

  applyTheme(

    (
      document.documentElement
        .dataset.theme ||
      "light"
    ) ===
      "dark"

      ? "light"

      : "dark"

  );

}


/* =========================================================
   HEADER
========================================================= */

function header(){

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
              ${getFollowUpSettings().dueAfterDays}
              days due ·
              ${getFollowUpSettings().overdueAfterDays}
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

  const settings =
    getSystemSettings();


  const showPatients =
    isFeatureEnabled(
      "patients"
    );


  const showAppointments =
    isFeatureEnabled(
      "appointments"
    );


  const showPanel =
    isFeatureEnabled(
      "panel"
    );


  const showReports =
    isFeatureEnabled(
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
      style="
        margin-top:18px
      "
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
   APP SHELL
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
  e
){

  e.stopPropagation();


  const p =
    document.getElementById(
      "notifPanel"
    );


  if(p){

    p.hidden =
      !p.hidden;


    if(
      !p.hidden
    ){

      renderNotifications();

    }

  }

}


function renderNotifications(){

  const a =
    alerts();


  const c =
    document.getElementById(
      "notifCount"
    );


  const b =
    document.getElementById(
      "notifBody"
    );


  if(
    !c ||
    !b
  ){

    return;

  }


  c.hidden =
    !a.length;


  c.textContent =
    a.length >
      99
      ? "99+"
      : a.length;


  b.innerHTML =
    a.length

      ? a
          .map(
            x => `

              <div
                class="notif-item"
                onclick="
                  location.href=
                    'patient-profile.html?patient='+
                    encodeURIComponent(
                      '${String(
                        x.id
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
                    ${x.level}
                  "
                ></span>


                <div>

                  <div
                    class="notif-name"
                  >
                    ${x.name}
                  </div>


                  <div
                    class="notif-text"
                  >

                    ${
                      x.level ===
                        "overdue"
                        ? "Overdue"
                        : "Due for Follow-Up"
                    }

                    ·

                    ${x.days}

                    days since last visit.

                  </div>

                </div>

              </div>

            `
          )
          .join("")

      : `

          <div class="notif-empty">
            No patients are due.
          </div>

        `;

}


/* =========================================================
   CLOSE NOTIFICATIONS
========================================================= */

document.addEventListener(
  "click",
  e => {

    const w =
      document.getElementById(
        "notifWrap"
      );


    const p =
      document.getElementById(
        "notifPanel"
      );


    if(
      w &&
      p &&
      !w.contains(
        e.target
      )
    ){

      p.hidden =
        true;

    }

  }
);


/* =========================================================
   SETTINGS CHANGE LISTENER
========================================================= */

window.addEventListener(
  "storage",
  event => {

    if(
      event.key ===
      SETTINGS_UPDATED_KEY
    ){

      /*
        Settings were changed in
        another browser tab.

        Reload the current page so
        the new configuration is
        immediately applied.
      */

      location.reload();

    }

  }
);


/* =========================================================
   SETTINGS READY
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    /*
      Make sure the configuration
      exists before pages start
      using it.
    */

    getSystemSettings();


    initTheme();


    renderNotifications();

  }
);
