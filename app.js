/* =========================================================
   GETWELL WEIGHT LOSS ADMIN
   CENTRAL APP.JS
   Compatible with existing settings.html
========================================================= */


/* =========================================================
   STORAGE KEYS
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


/* =========================================================
   DEFAULT DATA
========================================================= */

const seed = {
  patients: []
};


/* =========================================================
   DEFAULT SETTINGS
   Used only when settings.html has not
   created the configuration yet.
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
   DEEP CLONE
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


/* =========================================================
   MERGE SETTINGS
========================================================= */

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
   SYSTEM SETTINGS
========================================================= */

function getSystemSettings(){

  const raw =
    localStorage.getItem(
      SETTINGS_KEY
    );


  /*
    IMPORTANT:
    If settings.html has already created
    the configuration, use that exact
    configuration.
  */

  if(raw){

    try{

      const saved =
        JSON.parse(
          raw
        );


      return mergeSystemSettings(
        DEFAULT_SYSTEM_SETTINGS,
        saved
      );

    }catch(error){

      console.error(
        "Getwell settings error:",
        error
      );

    }

  }


  /*
    Only create defaults when the
    configuration doesn't exist yet.
  */

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


/* =========================================================
   SAVE SYSTEM SETTINGS
========================================================= */

function saveSystemSettings(
  settings
){

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

}


/* =========================================================
   SETTINGS ALIAS
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


  return Array.isArray(
    settings.patient?.statuses
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


  const active =
    getActivePatientStatuses();


  const wanted =
    settings.patient
      ?.defaultStatus;


  const match =
    active.find(
      status =>
        status.name ===
        wanted
    );


  if(match){

    return match.name;

  }


  return active[0]
    ?.name ||
    "Active";

}


/* =========================================================
   PATIENT ID SETTINGS
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


/* =========================================================
   FORMAT PATIENT ID
========================================================= */

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


/* =========================================================
   NEXT PATIENT ID
========================================================= */

function getNextPatientId(){

  const config =
    getPatientIdSettings();


  return formatPatientId(
    config.nextNumber
  );

}


/* =========================================================
   RESERVE PATIENT ID
========================================================= */

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

  if(!id){

    return null;

  }


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
    ) ||
    null;

}


function getPanelByName(
  name
){

  if(!name){

    return null;

  }


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
    ) ||
    null;

}


/* =========================================================
   PANEL OPTIONS
========================================================= */

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
    getPanelById(
      p.panelProvider
    );


  if(configured){

    return configured.name;

  }


  /*
    Legacy support.
  */

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


  const active =
    getAppointmentStatuses();


  const wanted =
    settings.appointments
      ?.defaultStatus;


  const match =
    active.find(
      status =>
        status.name ===
        wanted
    );


  if(match){

    return match.name;

  }


  return active[0]
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


    return cloneObject(
      seed
    );

  }


  try{

    return JSON.parse(
      raw
    );

  }catch(error){

    console.error(
      "Getwell data error:",
      error
    );


    localStorage.setItem(
      STORE_KEY,
      JSON.stringify(
        seed
      )
    );


    return cloneObject(
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
        appointment => {

          if(
            appointment.patientId &&
            map[
              appointment.patientId
            ]
          ){

            appointment.patientId =
              map[
                appointment.patientId
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
  data
){

  localStorage.setItem(
    STORE_KEY,
    JSON.stringify(
      data
    )
  );

}


/* =========================================================
   MAP LEGACY PATIENT ID
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


  if(match){

    return (
      "GW-" +
      String(
        Number(
          match[1]
        )
      )
      .padStart(
        4,
        "0"
      )
    );

  }


  return value;

}


/* =========================================================
   GET PATIENT
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
    patient =>
      patient.id ===
      wanted
  ) ||
  null;

}


/* =========================================================
   UPSERT PATIENT
========================================================= */

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
   VISIT
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


/* =========================================================
   VISIT TOTAL
========================================================= */

function visitTotal(
  visit
){

  const billing =
    ensureVisit(
      visit
    )
    .billing;


  return (
    (+billing.injection.price || 0) +
    (+billing.medication.price || 0) +
    (+billing.treatment.price || 0) +
    (+billing.other.price || 0)
  );

}


/* =========================================================
   CLAIM TOTAL
========================================================= */

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
        Number(
          claim.amount
        ) ||
        0
      ),
    0
  );

}


/* =========================================================
   GRAND TOTAL
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


/* =========================================================
   FINANCE
========================================================= */

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
        )
        .billing;


      injection +=
        Number(
          billing.injection.price
        ) ||
        0;


      medication +=
        Number(
          billing.medication.price
        ) ||
        0;


      treatment +=
        Number(
          billing.treatment.price
        ) ||
        0;


      selfpay +=
        Number(
          billing.selfPay
        ) ||
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
   LATEST VISIT
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
      String(
        a.dateKey ||
        ""
      )
      .localeCompare(
        String(
          b.dateKey ||
          ""
        )
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
    patient => {

      const last =
        latestVisit(
          patient
        );


      const days =
        daysSince(
          last?.dateKey
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
        event.key === 'Enter' ||
        event.key === ' '
      ){
        event.preventDefault();
        goHome();
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
   SETTINGS CROSS-TAB UPDATE
========================================================= */

window.addEventListener(
  "storage",
  event => {

    if(
      event.key ===
      SETTINGS_UPDATED_KEY
    ){

      /*
        Do NOT reload settings.html
        here unnecessarily.

        Other pages reload so they
        immediately use the new config.
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
      Ensure settings exist.
      This does not overwrite
      existing Settings data.
    */

    getSystemSettings();


    initTheme();


    renderNotifications();

  }
);
