const STORE_KEY = "getwell_ui_sync_v1";

/* =========================================================
   GLOBAL DAY / NIGHT MODE
========================================================= */
const THEME_KEY = "getwell_theme";

function getSavedTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "dark" ? "dark" : "light";
}

function applyTheme(theme){
  const selected = theme === "dark" ? "dark" : "light";

  document.documentElement.dataset.theme = selected;
  localStorage.setItem(THEME_KEY, selected);

  const toggle = document.getElementById("themeToggle");

  if(toggle){
    toggle.textContent = selected === "dark" ? "☀" : "☾";
    toggle.title = selected === "dark"
      ? "Switch to Day Mode"
      : "Switch to Night Mode";
    toggle.setAttribute("aria-label", toggle.title);
  }
}

function toggleTheme(){
  const current =
    document.documentElement.dataset.theme || getSavedTheme();

  applyTheme(current === "dark" ? "light" : "dark");
}

function initTheme(){
  applyTheme(getSavedTheme());
}

initTheme();


const seed = {
  patients: [
    {
      id:"PAT-0001",
      name:"PATIENT 001",
      initials:"P1",
      status:"Active",
      panelProvider:"PANEL_A",
      startDate:"2026-07-01",
      goalWeight:65,
      currentWeight:72,
      startingWeight:78,
      visits:[
        {
          id:"PAT-0001-V1",
          dateKey:"2026-08-14",
          visit:"Visit #1",
          type:"Body Composition Review",
          weight:72,
          injection:"Tirzepatide",
          dose:"2.5 mg",
          medication:"",
          additionalTreatment:"Gut Detox",
          notes:"",
          billing:{
            injection:{
              price:120,
              notes:"Tirzepatide 2.5 mg"
            },
            medication:{
              price:0,
              notes:""
            },
            treatment:{
              price:50,
              notes:"Gut Detox"
            },
            other:{
              price:0,
              notes:""
            },
            panel:120,
            selfPay:50,
            panelClaimAmount:0,
            panelClaimDate:"",
            coverageType:"panel"
          }
        }
      ]
    },

    {
      id:"PAT-0002",
      name:"PATIENT 002",
      initials:"P2",
      status:"Active",
      panelProvider:"SELF_PAY",
      startDate:"2026-07-10",
      goalWeight:68,
      currentWeight:76,
      startingWeight:82,
      visits:[
        {
          id:"PAT-0002-V1",
          dateKey:"2026-08-17",
          visit:"Visit #1",
          type:"Weekly Follow-Up",
          weight:76,
          injection:"",
          dose:"",
          medication:"",
          additionalTreatment:"",
          notes:"",
          billing:{
            injection:{
              price:100,
              notes:""
            },
            medication:{
              price:20,
              notes:""
            },
            treatment:{
              price:0,
              notes:""
            },
            other:{
              price:0,
              notes:""
            },
            panel:0,
            selfPay:120,
            panelClaimAmount:0,
            panelClaimDate:"",
            coverageType:"self"
          }
        }
      ]
    },

    {
      id:"PAT-0003",
      name:"PATIENT 003",
      initials:"P3",
      status:"Active",
      panelProvider:"PANEL_B",
      startDate:"2026-06-20",
      goalWeight:70,
      currentWeight:80,
      startingWeight:90,
      visits:[
        {
          id:"PAT-0003-V1",
          dateKey:"2026-08-12",
          visit:"Visit #1",
          type:"Treatment",
          weight:80,
          injection:"Semaglutide",
          dose:"1 mg",
          medication:"",
          additionalTreatment:"Physio",
          notes:"",
          billing:{
            injection:{
              price:150,
              notes:"Semaglutide 1 mg"
            },
            medication:{
              price:0,
              notes:""
            },
            treatment:{
              price:80,
              notes:"Physio"
            },
            other:{
              price:0,
              notes:""
            },
            panel:200,
            selfPay:30,
            panelClaimAmount:120,
            panelClaimDate:"2026-08-16",
            coverageType:"panel"
          }
        }
      ]
    },

    {
      id:"PAT-0004",
      name:"PATIENT 004",
      initials:"P4",
      status:"Inactive",
      panelProvider:"SELF_PAY",
      startDate:"2026-06-10",
      goalWeight:70,
      currentWeight:83,
      startingWeight:86,
      visits:[
        {
          id:"PAT-0004-V1",
          dateKey:"2026-08-10",
          visit:"Visit #1",
          type:"Weekly Follow-Up",
          weight:83,
          injection:"",
          dose:"",
          medication:"",
          additionalTreatment:"",
          notes:"",
          billing:{
            injection:{
              price:0,
              notes:""
            },
            medication:{
              price:0,
              notes:""
            },
            treatment:{
              price:0,
              notes:""
            },
            other:{
              price:0,
              notes:""
            },
            panel:0,
            selfPay:0,
            panelClaimAmount:0,
            panelClaimDate:"",
            coverageType:"self"
          }
        }
      ]
    }
  ]
};


function loadStore(){

  const raw =
    localStorage.getItem(STORE_KEY);

  if(!raw){

    localStorage.setItem(
      STORE_KEY,
      JSON.stringify(seed)
    );

    return structuredClone(seed);
  }

  try{

    return JSON.parse(raw);

  }catch(error){

    localStorage.setItem(
      STORE_KEY,
      JSON.stringify(seed)
    );

    return structuredClone(seed);
  }
}


function saveStore(store){

  localStorage.setItem(
    STORE_KEY,
    JSON.stringify(store)
  );
}


function store(){

  return loadStore();
}


function getPatient(id){

  return store()
    .patients
    .find(
      patient => patient.id === id
    ) || null;
}


function upsertPatient(patient){

  const data = store();

  const index =
    data.patients.findIndex(
      item => item.id === patient.id
    );

  if(index >= 0){

    data.patients[index] = patient;

  }else{

    data.patients.push(patient);
  }

  saveStore(data);
}


function patientUsesPanel(patient){

  return !!(
    patient &&
    patient.panelProvider &&
    patient.panelProvider !== "SELF_PAY"
  );
}


function getPanelName(patient){

  if(!patient){
    return "Self-Pay";
  }

  if(
    patient.panelProvider === "SELF_PAY"
  ){

    return "Self-Pay";
  }

  if(
    patient.panelProvider === "Other"
  ){

    return patient.otherPanelName ||
      "Panel";
  }

  return "Panel";
}


function ensureVisit(visit){

  if(!visit.billing){

    visit.billing = {

      injection:{
        price:0,
        notes:""
      },

      medication:{
        price:0,
        notes:""
      },

      treatment:{
        price:0,
        notes:""
      },

      other:{
        price:0,
        notes:""
      },

      panel:0,
      selfPay:0,
      panelClaimAmount:0,
      panelClaimDate:"",
      coverageType:"self"

    };

  }

  return visit;
}


function visitTotal(visit){

  const billing =
    ensureVisit(visit).billing;

  return (
    (+billing.injection?.price || 0) +
    (+billing.medication?.price || 0) +
    (+billing.treatment?.price || 0) +
    (+billing.other?.price || 0)
  );
}


function panelEligible(visit){

  return Math.max(
    0,
    +ensureVisit(visit).billing.panel || 0
  );
}


function totalClaimed(visit){

  return Math.max(
    0,
    +ensureVisit(visit).billing.panelClaimAmount || 0
  );
}


function finance(patient){

  const result = {

    grand:0,
    claimed:0,
    claimable:0,
    injection:0,
    medication:0,
    treatment:0,
    selfpay:0

  };

  (patient.visits || [])
    .forEach(visit => {

      const billing =
        ensureVisit(visit).billing;

      result.grand +=
        visitTotal(visit);

      result.claimable +=
        panelEligible(visit);

      result.claimed +=
        totalClaimed(visit);

      result.injection +=
        +billing.injection.price || 0;

      result.medication +=
        +billing.medication.price || 0;

      result.treatment +=
        +billing.treatment.price || 0;

      result.selfpay +=
        +billing.selfPay || 0;

    });


  result.balance =
    Math.max(
      0,
      result.claimable -
      result.claimed
    );

  return result;
}


function daysSince(dateKey){

  if(!dateKey){
    return null;
  }

  const visitDate =
    new Date(
      dateKey + "T00:00:00"
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
      visitDate
    ) /
    86400000
  );
}


function latestVisit(patient){

  return [
    ...(patient.visits || [])
  ]
    .sort(
      (a,b) =>
        (a.dateKey || "")
          .localeCompare(
            b.dateKey || ""
          )
    )
    .at(-1) || null;
}


function alerts(){

  return store()
    .patients
    .map(patient => {

      const visit =
        latestVisit(patient);

      const days =
        daysSince(
          visit?.dateKey
        );

      if(
        days === null ||
        days < 5
      ){

        return null;
      }

      return {

        id:patient.id,

        name:patient.name,

        days,

        level:
          days >= 7
            ? "overdue"
            : "warning",

        text:
          `${days} days since last recorded visit.`
      };

    })

    .filter(Boolean)

    .sort(
      (a,b) => {

        if(a.level === b.level){

          return b.days - a.days;
        }

        return a.level === "overdue"
          ? -1
          : 1;
      }
    );
}


function renderNotifications(){

  const count =
    document.getElementById(
      "notifCount"
    );

  const body =
    document.getElementById(
      "notifBody"
    );

  if(!count || !body){
    return;
  }

  const notifications =
    alerts();

  count.hidden =
    notifications.length === 0;

  count.textContent =
    notifications.length > 99
      ? "99+"
      : notifications.length;


  body.innerHTML =
    notifications.length

      ? notifications
          .map(
            item => `

              <div
                class="notif-item"
                onclick="
                  location.href=
                  'patient-profile.html?patient=${encodeURIComponent(item.id)}'
                "
              >

                <span
                  class="notif-dot ${item.level}"
                ></span>


                <div>

                  <div class="notif-name">
                    ${item.name}
                  </div>


                  <div class="notif-text">

                    ${
                      item.level === "overdue"
                        ? "Overdue"
                        : "Due for Follow-Up"
                    }

                  </div>


                  <div class="notif-text">
                    ${item.text}
                  </div>

                </div>

              </div>

            `
          )
          .join("")

      : `

        <div class="notif-empty">
          No patients are due for follow-up.
        </div>

      `;
}


function toggleNotifications(event){

  event.stopPropagation();

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
    renderNotifications();
  }
}


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

      panel.hidden = true;
    }

  }
);


function header(
  title,
  subtitle,
  active
){

  return `

    <header class="topbar">

      <div class="topbar-left">

        <button
          class="mobile-menu"
          onclick="
            document
            .querySelector('.sidebar')
            ?.classList.toggle('open')
          "
        >
          ☰
        </button>


        <div>

          <div class="page-title">
            ${title}
          </div>

          <div class="page-subtitle">
            ${subtitle}
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
            placeholder="Search patient, ID or phone..."
          >

        </div>


        <div
          class="global-notification-wrap"
          id="notifWrap"
        >

          <button
            type="button"
            class="icon-button"
            onclick="
              toggleNotifications(event)
            "
            aria-label="Notifications"
            title="Follow-Up Notifications"
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
            class="global-notification-panel"
            id="notifPanel"
            hidden
          >

            <div class="notif-head">

              <div>

                <strong>
                  Follow-Up Alerts
                </strong>

                <span>
                  5 days = due · 7 days = overdue
                </span>

              </div>


              <button
                type="button"
                class="icon-button"
                style="
                  width:28px;
                  height:28px
                "
                onclick="
                  document
                    .getElementById('notifPanel')
                    .hidden=true
                "
              >
                ×
              </button>

            </div>


            <div id="notifBody"></div>

          </div>

        </div>


        <button
          type="button"
          class="theme-toggle"
          id="themeToggle"
          onclick="
            toggleTheme()
          "
          aria-label="Switch to Night Mode"
          title="Switch to Night Mode"
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


function sidebar(active){

  return `

    <aside class="sidebar">

      <div class="brand">

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
            active === "dashboard"
              ? "active"
              : ""
          }"
          href="index.html"
        >
          ⌂ Dashboard
        </a>


        <a
          class="${
            active === "patients"
              ? "active"
              : ""
          }"
          href="patients.html"
        >
          ♙ Patients
        </a>


        <a
          href="appointments.html"
        >
          ▣ Appointments
        </a>


        <div
          class="nav-label"
          style="margin-top:18px"
        >
          PROGRAM
        </div>


        <a
          href="appointments.html"
        >
          ↗ Treatments
        </a>


        <a
          href="appointments.html"
        >
          ◒ Progress
        </a>


        <a
          href="appointments.html"
        >
          ! Follow-Up
        </a>


        <div
          class="nav-label"
          style="margin-top:18px"
        >
          MANAGEMENT
        </div>


        <a
          href="appointments.html"
        >
          ▤ Reports
        </a>


        <a
          href="appointments.html"
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


function shell(
  title,
  subtitle,
  active,
  body
){

  return `

    <div class="app">

      ${sidebar(active)}

      <main class="main">

        ${header(
          title,
          subtitle,
          active
        )}

        <div class="content">

          ${body}

        </div>

      </main>

    </div>

  `;
}


function render(){

  renderNotifications();
}


document.addEventListener(
  "DOMContentLoaded",
  render
);
