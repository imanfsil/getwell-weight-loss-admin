const STORE_KEY="getwell_final_v4";
const THEME_KEY="getwell_theme_v4";
const MIGRATION_KEY="getwell_pat_to_gw_v1";

const seed={patients:[]};

function rawStore(){
  const raw=localStorage.getItem(STORE_KEY);
  if(!raw){
    localStorage.setItem(STORE_KEY,JSON.stringify(seed));
    return structuredClone(seed);
  }
  try{return JSON.parse(raw)}catch(e){localStorage.setItem(STORE_KEY,JSON.stringify(seed));return structuredClone(seed)}
}

function migrateLegacyIds(data){
  if(localStorage.getItem(MIGRATION_KEY)==="done") return data;
  const used=new Set(), map={};
  (data.patients||[]).forEach(p=>{
    const old=String(p.id||"");
    const m=old.match(/^PAT-(\d+)$/i);
    if(m){
      const n=String(Number(m[1])).padStart(4,"0");
      const neu=`GW-${n}`;
      map[old]=neu;
      p.id=neu;
      used.add(neu);
    }
  });
  let next=1;
  (data.patients||[]).forEach(p=>{
    if(!/^GW-\d+$/i.test(p.id||"")){
      while(used.has(`GW-${String(next).padStart(4,"0")}`)) next++;
      p.id=`GW-${String(next).padStart(4,"0")}`;
      used.add(p.id); next++;
    }
    if(!p.panelStatus && patientUsesPanel(p)) p.panelStatus="Active";
    if(!p.panelSuspensionNote) p.panelSuspensionNote="";
    (p.appointments||[]).forEach(a=>{
      if(a.patientId && map[a.patientId]) a.patientId=map[a.patientId];
    });
  });
  localStorage.setItem(STORE_KEY,JSON.stringify(data));
  localStorage.setItem(MIGRATION_KEY,"done");
  return data;
}

function store(){return migrateLegacyIds(rawStore())}
function saveStore(d){localStorage.setItem(STORE_KEY,JSON.stringify(d))}

function getPatient(id){
  const wanted=mapLegacyId(id);
  return (store().patients||[]).find(p=>p.id===wanted)||null;
}

function mapLegacyId(id){
  const s=String(id||"");
  const m=s.match(/^PAT-(\d+)$/i);
  return m?`GW-${String(Number(m[1])).padStart(4,"0")}`:s;
}

function upsertPatient(p){
  const d=store(), i=d.patients.findIndex(x=>x.id===p.id);
  if(i>=0)d.patients[i]=p; else d.patients.push(p);
  saveStore(d);
}

function ensureClaims(p){
  if(!Array.isArray(p.claims))p.claims=[];
  return p.claims
}

function ensureVisit(v){
  if(!v.billing)v.billing={};
  v.billing.injection ||= {price:0,notes:""};
  v.billing.medication ||= {price:0,notes:""};
  v.billing.treatment ||= {price:0,notes:""};
  v.billing.other ||= {price:0,notes:""};
  v.billing.panel=Number(v.billing.panel||0);
  v.billing.selfPay=Number(v.billing.selfPay||0);
  return v;
}

function visitTotal(v){
  const b=ensureVisit(v).billing;
  return (+b.injection.price||0)+(+b.medication.price||0)+(+b.treatment.price||0)+(+b.other.price||0)
}

function patientUsesPanel(p){
  return !!p?.panelProvider && p.panelProvider!=="SELF_PAY"
}

function isPanelSuspended(p){
  return patientUsesPanel(p) && (
    p.panelStatus === "Suspended" ||
    p.insuranceStatus === "Suspended"
  );
}

function panelSuspensionNote(p){
  return p.panelSuspensionNote || p.insuranceSuspensionNote || "";
}

function getPanelName(p){
  if(!p||p.panelProvider==="SELF_PAY")return "Self-Pay";
  if(p.panelProvider==="Other")return p.otherPanelName||"Panel";
  if(p.panelProvider==="PANEL_A")return "MiCare";
  if(p.panelProvider==="PANEL_B")return "PMCare";
  if(p.panelProvider==="PANEL_C")return "Other Panel";
  return "Panel";
}

function grandTotal(p){
  return (p.visits||[]).reduce((s,v)=>s+visitTotal(v),0)
}

function claimsTotal(p){
  return ensureClaims(p).reduce((s,c)=>s+(+c.amount||0),0)
}

function finance(p){
  let injection=0,medication=0,treatment=0,selfpay=0;

  (p.visits||[]).forEach(v=>{
    const b=ensureVisit(v).billing;
    injection+=+b.injection.price||0;
    medication+=+b.medication.price||0;
    treatment+=+b.treatment.price||0;
    selfpay+=+b.selfPay||0;
  });

  const grand=grandTotal(p),claimed=claimsTotal(p);

  return {
    grand,
    claimed,
    balance:Math.max(0,grand-claimed),
    injection,
    medication,
    treatment,
    selfpay
  }
}

function latestVisit(p){
  return [...(p.visits||[])]
    .sort((a,b)=>(a.dateKey||"").localeCompare(b.dateKey||""))
    .at(-1)||null
}

function daysSince(d){
  if(!d)return null;

  const a=new Date(d+"T00:00:00"),
        b=new Date();

  b.setHours(0,0,0,0);

  return Math.floor((b-a)/86400000)
}

function alerts(){
  return (store().patients||[])
    .map(p=>{
      const d=daysSince(
        latestVisit(p)?.dateKey
      );

      if(d===null||d<5)return null;

      return {
        id:p.id,
        name:p.name,
        days:d,
        level:d>=7?"overdue":"warning"
      }
    })
    .filter(Boolean)
    .sort((a,b)=>b.days-a.days)
}

function money(n){
  return "RM "+Number(n||0).toLocaleString(
    "en-MY",
    {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }
  )
}

function applyTheme(t){
  t=t==="dark"?"dark":"light";

  document.documentElement.dataset.theme=t;

  localStorage.setItem(
    THEME_KEY,
    t
  );

  const b=document.getElementById(
    "themeToggle"
  );

  if(b){
    b.textContent=t==="dark"?"☀":"☾";

    b.title=t==="dark"
      ?"Switch to Day Mode"
      :"Switch to Night Mode"
  }
}

function initTheme(){
  applyTheme(
    localStorage.getItem(THEME_KEY)||"light"
  )
}

function toggleTheme(){
  applyTheme(
    (document.documentElement.dataset.theme||"light")==="dark"
      ?"light"
      :"dark"
  )
}

function header(){
return `<header class="topbar"><div class="topbar-left"><div><div class="page-title">${document.title.split("|")[0].trim()}</div><div class="page-subtitle">Getwell Weight Loss Admin</div></div></div><div class="topbar-right"><div class="search-box"><span>⌕</span><input id="globalSearch" placeholder="Search patient or ID"></div><div id="notifWrap" class="global-notification-wrap"><button class="icon-button" onclick="toggleNotifications(event)">🔔<span class="notification-count" id="notifCount" hidden>0</span></button><div id="notifPanel" class="global-notification-panel" hidden><div class="notif-head"><div><strong>Follow-Up Alerts</strong><span>5 days due · 7 days overdue</span></div></div><div id="notifBody"></div></div></div><button class="theme-toggle" id="themeToggle" onclick="toggleTheme()">☾</button><div class="user-avatar">A</div></div></header>`
}

function sidebar(active){
return `<aside class="sidebar"><div class="brand" role="button" tabindex="0" aria-label="Go to Dashboard" onclick="goHome()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();goHome()}"><div class="brand-mark">G</div><div><div class="brand-name">GETWELL</div><div class="brand-sub">Weight Loss Admin</div></div></div><nav class="nav"><div class="nav-label">MAIN</div><a class="${active==="dashboard"?"active":""}" href="index.html">⌂ Dashboard</a><a class="${active==="patients"?"active":""}" href="patients.html">♙ Patients</a><a class="${active==="appointments"?"active":""}" href="appointments.html">▣ Appointments</a><div class="nav-label" style="margin-top:18px">MANAGEMENT</div><a class="${active==="panel"?"active":""}" href="panel.html">▣ Panel</a><a class="${active==="reports"?"active":""}" href="reports.html">▤ Reports</a><a href="appointments.html">⚙ Settings</a></nav><div class="sidebar-user"><div class="user-card"><div class="user-dot">A</div><div><div class="user-name">Administrator</div><div class="user-role">Weight Loss Program</div></div></div></div></aside>`
}

function goHome(){
  window.location.href = "index.html";
}

function shell(title,active,body){
  document.title=title+" | Getwell";

  return `<div class="app">${sidebar(active)}<main class="main">${header()}<div class="content">${body}</div></main></div>`
}

function toggleNotifications(e){
  e.stopPropagation();

  const p=document.getElementById(
    "notifPanel"
  );

  if(p){
    p.hidden=!p.hidden;

    if(!p.hidden)
      renderNotifications()
  }
}

function renderNotifications(){
  const a=alerts(),
        c=document.getElementById("notifCount"),
        b=document.getElementById("notifBody");

  if(!c||!b)return;

  c.hidden=!a.length;

  c.textContent=
    a.length>99
      ?"99+"
      :a.length;

  b.innerHTML=a.length
    ? a.map(
        x=>`<div class="notif-item" onclick="location.href='patient-profile.html?patient=${encodeURIComponent(x.id)}'"><span class="notif-dot ${x.level}"></span><div><div class="notif-name">${x.name}</div><div class="notif-text">${x.level==="overdue"?"Overdue":"Due for Follow-Up"} · ${x.days} days since last visit.</div></div></div>`
      ).join("")
    : `<div class="notif-empty">No patients are due.</div>`
}

document.addEventListener(
  "click",
  e=>{
    const w=document.getElementById(
      "notifWrap"
    );

    const p=document.getElementById(
      "notifPanel"
    );

    if(
      w &&
      p &&
      !w.contains(e.target)
    ){
      p.hidden=true
    }
  }
);

document.addEventListener(
  "DOMContentLoaded",
  ()=>{
    initTheme();
    renderNotifications()
  }
);
