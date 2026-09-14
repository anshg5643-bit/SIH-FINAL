
async function registerPersonnel(){
  const full_name = document.getElementById("reg-name").value.trim();
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value;
  const unit = document.getElementById("reg-unit").value.trim();
  const status = document.getElementById("register-status");

  if(!full_name || !username || !password || !unit){
    status.className = "register-status error";
    status.textContent = "Please complete all fields.";
    return;
  }
  if(password.length < 6){
    status.className = "register-status error";
    status.textContent = "Password must contain at least 6 characters.";
    return;
  }

  try{
    const r = await fetch("/api/auth/register", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({full_name, username, password, unit})
    });
    const data = await r.json();
    if(!r.ok) throw new Error(data.detail || data.message || "Registration failed");

    status.className = "register-status success";
    status.textContent = "Account created successfully. You can now sign in.";
    document.getElementById("loginUser").value = username;
    document.getElementById("loginPass").value = password;
  }catch(e){
    status.className = "register-status error";
    status.textContent = e.message;
  }
}

function openRegister(){
  const panel=document.getElementById("register-panel");
  panel.classList.remove("hidden");
  panel.scrollIntoView({behavior:"smooth",block:"center"});
  document.getElementById("reg-name")?.focus();
}
function closeRegister(){
  const panel=document.getElementById("register-panel");
  panel.classList.add("hidden");
  document.getElementById("loginView")?.scrollIntoView({behavior:"smooth",block:"center"});
}

let token=localStorage.getItem("sm_token"), user=JSON.parse(localStorage.getItem("sm_user")||"null"), charts={};

const navByRole={
 personnel:[["home","Dashboard"],["checkin","Future Outlook"],["history","My History"],["alerts","My Alerts"]],
 welfare_officer:[["home","Welfare Dashboard"],["personnel","Personnel"],["alerts","Alert Center"],["interventions","Interventions"],["evaluation","ML Evaluation"],["import","CSV / HRMS Import"]],
 commander:[["home","Command Dashboard"],["personnel","Personnel"],["alerts","Alert Center"],["interventions","Interventions"],["evaluation","ML Evaluation"]],
 admin:[["home","Admin Dashboard"],["personnel","Personnel"],["alerts","Alert Center"],["interventions","Interventions"],["evaluation","ML Evaluation"],["import","CSV / HRMS Import"]]
};

async function api(path,opts={}){
  const headers={...(opts.headers||{})};
  if(token) headers.Authorization="Bearer "+token;
  opts.headers=headers;
  const r=await fetch(path,opts);
  if(r.status===401){
    clearSession();
    throw Error("Session expired. Please sign in again.");
  }
  if(!r.ok){
    let msg="";
    try{const body=await r.json();msg=body.detail||body.message||"";}catch{}
    throw Error(msg||`Request failed (${r.status})`);
  }
  return r;
}

function clearSession(){
  token=null;
  user=null;
  localStorage.removeItem("sm_token");
  localStorage.removeItem("sm_user");
}

async function init(){
  const loginView=document.getElementById("loginView");
  const mainView=document.getElementById("mainView");
  if(!token || !user){
    clearSession();
    loginView.classList.remove("hidden");
    mainView.classList.add("hidden");
    return;
  }
  try{
    const r=await fetch("/api/auth/me",{headers:{Authorization:"Bearer "+token}});
    if(!r.ok) throw new Error("stale session");
    user=await r.json();
    localStorage.setItem("sm_user",JSON.stringify(user));
    showApp();
  }catch{
    clearSession();
    loginView.classList.remove("hidden");
    mainView.classList.add("hidden");
    const msg=document.getElementById("loginMsg");
    if(msg) msg.textContent="Please sign in again.";
  }
}

function showApp(){
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("mainView").classList.remove("hidden");
  document.getElementById("roleLabel").textContent=user.role.replaceAll("_"," ");
  document.getElementById("userBadge").textContent=`${user.full_name} · ${user.unit}`;
  buildNav();
  initSidebarState();
  load("home").catch(err=>console.warn("Initial dashboard load failed:",err));
  setTimeout(refreshVisualAnalytics,250);
}

function buildNav(){
  const items=navByRole[user?.role]||[];
  document.getElementById("nav").innerHTML=items.map(x=>`<button type="button" id="nav-${x[0]}" onclick="load('${x[0]}')">${x[1]}</button>`).join("");
}

async function login(){
  const usernameEl=document.getElementById("loginUser");
  const passwordEl=document.getElementById("loginPass");
  const msg=document.getElementById("loginMsg");
  const username=usernameEl.value.trim();
  const password=passwordEl.value;
  msg.textContent="";
  if(!username || !password){
    msg.textContent="Enter your username and password.";
    return;
  }
  const button=document.querySelector(".auth-card > button[onclick='login()']");
  if(button){button.disabled=true;button.textContent="Signing in…";}
  try{
    const r=await fetch("/api/auth/login",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username,password})
    });
    let d={};
    try{d=await r.json();}catch{}
    if(!r.ok) throw Error(d.detail||"Login failed");
    token=d.token;
    user=d.user;
    localStorage.setItem("sm_token",token);
    localStorage.setItem("sm_user",JSON.stringify(user));
    showApp();
  }catch(e){
    msg.textContent=e.message||"Unable to sign in.";
  }finally{
    if(button){button.disabled=false;button.textContent="Sign in";}
  }
}

async function logout(){
  try{if(token)await api("/api/auth/logout",{method:"POST"});}catch{}
  clearSession();
  location.reload();
}

/* ============ Sidebar show/hide (3-line toggle) ============ */
function toggleSidebar(force){
  const aside=document.getElementById("appSidebar");
  const main=document.getElementById("appMain");
  const btn=document.getElementById("sidebarToggle");
  const overlay=document.getElementById("sidebarOverlay");
  const show = force!==undefined ? force : aside.classList.contains("sidebar-hidden");
  aside.classList.toggle("sidebar-hidden", !show);
  main.classList.toggle("sidebar-collapsed", !show);
  btn.classList.toggle("open", show);
  overlay.classList.toggle("visible", show && window.innerWidth<=900);
  localStorage.setItem("sm_sidebar", show ? "open" : "closed");
}
function initSidebarState(){
  const pref = localStorage.getItem("sm_sidebar");
  const show = pref ? pref==="open" : window.innerWidth>900;
  toggleSidebar(show);
}

function shell(title,html){document.getElementById("pageTitle").textContent=title;document.getElementById("content").innerHTML=html}
async function load(page){document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));document.getElementById("nav-"+page)?.classList.add("active");
if(page==="home")return user.role==="personnel"?personnelDash():aggregateDash();
if(page==="checkin")return checkinPage(); if(page==="history")return historyPage(); if(page==="personnel")return personnelPage(); if(page==="alerts")return alertsPage(); if(page==="interventions")return interventionsPage(); if(page==="evaluation")return evaluationPage(); if(page==="import")return importPage()}

async function personnelDash(){
  const d=await (await api("/api/dashboard")).json();
  const h=d.history||[], latest=d.latest;
  let forecast={status:"no_data"};
  try{ forecast=await (await api("/api/forecast")).json(); }catch(e){}
  const labels=h.map(x=>x.created_at.slice(0,10));
  const vals=h.map(x=>x.risk_probability*100);
  const factorCounts={};
  h.forEach(x=>{try{(JSON.parse(x.factors_json||"[]")||[]).forEach(f=>factorCounts[f.label]=(factorCounts[f.label]||0)+1)}catch{}});
  const topFactors=Object.entries(factorCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const recs=forecast.recommendations||[];
  shell("Personnel Dashboard",`
    <div class="grid g4">
      <div class="card"><div class="label">Current risk</div><div class="stat">${latest?`<span class="risk ${latest.risk_level}">${latest.risk_level}</span>`:"—"}</div></div>
      <div class="card"><div class="label">Risk probability</div><div class="stat">${latest?(latest.risk_probability*100).toFixed(0)+"%":"—"}</div></div>
      <div class="card"><div class="label">Screenings</div><div class="stat">${h.length}</div></div>
      <div class="card"><div class="label">Future outlook</div><div class="stat" style="font-size:20px">${forecast.trend||"—"}</div></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3 class="section-title">Risk trajectory</h3><div class="chartbox"><canvas id="trend"></canvas></div></div>
      <div class="card"><h3 class="section-title">Recurring signals</h3><div class="chartbox"><canvas id="factorChart"></canvas></div></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3 class="section-title">Future recommendations</h3>
        <div class="notice">${forecast.summary||"Complete an authorized screening to generate a forward-looking welfare outlook."}</div>
        <ul class="recommend-list">${recs.map(x=>`<li>${x}</li>`).join("")||"<li>No recommendation available yet.</li>"}</ul>
        ${forecast.recommended_plan?`<h4 style="margin:16px 0 8px">Condition-based target ranges</h4><div class="target-grid">${Object.entries(forecast.recommended_plan.targets||{}).map(([k,v])=>`<div><span>${analyticsEscape(k.replaceAll("_"," "))}</span><b>${analyticsEscape(v)}</b></div>`).join("")}</div><p class="kicker">${analyticsEscape(forecast.recommended_plan.disclaimer||"")}</p>`:""}
        <p class="kicker">This is a welfare-support forecast based on currently stored screening data, not a clinical diagnosis or guaranteed prediction.</p>
      </div>
      <div class="card"><h3 class="section-title">Latest welfare guidance</h3>
        ${latest?`<p class="kicker">Current contributing factors</p><ul>${JSON.parse(latest.factors_json||"[]").map(f=>`<li>${f.label}</li>`).join("")||"<li>No elevated factors detected.</li>"}</ul><p class="kicker">Immediate actions</p><ul>${JSON.parse(latest.actions_json||"[]").map(a=>`<li>${a}</li>`).join("")}</ul>`:"No screening data is available yet."}
      </div>
    </div>`);
  chart("trend","line",labels,[{label:"Risk probability",data:vals}],{suffix:"%"});
  chart("factorChart","bar",topFactors.map(x=>x[0]),[{label:"Occurrences",data:topFactors.map(x=>x[1])}],{});
}

function aggregateDash(){return api("/api/dashboard").then(r=>r.json()).then(async d=>{
  let p=d.personnel||[], counts=d.risk_distribution||{Low:0,Medium:0,High:0};
  let high=p.filter(x=>x.risk_level==="High").length, open=(d.interventions||[]).filter(x=>x.status!=="Closed").length;
  let forecast={}; try{forecast=await (await api("/api/forecast")).json()}catch(e){}
  const ranked=p.filter(x=>x.risk_level).sort((a,b)=>(b.risk_probability||0)-(a.risk_probability||0));
  const plans=ranked.slice(0,8);
  shell(user.role==="commander"?"Commander Aggregate Dashboard":"Welfare Officer Dashboard",`
    <div class="grid g4">
      <div class="card"><div class="label">Personnel</div><div class="stat">${p.length}</div></div>
      <div class="card"><div class="label">High risk</div><div class="stat">${high}</div></div>
      <div class="card"><div class="label">Open interventions</div><div class="stat">${open}</div></div>
      <div class="card"><div class="label">Alerts</div><div class="stat">${(d.alerts||[]).filter(a=>!a.acknowledged).length}</div></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Risk distribution</h3><div id="dist" class="chartbox native-chart"></div></div>
      <div class="card"><h3>Screening trajectory</h3><div id="orgTrend" class="chartbox native-chart"></div></div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Future welfare outlook</h3><div class="notice">${forecast.summary||"Not enough data for an outlook."}</div><ul class="recommend-list">${(forecast.recommendations||[]).map(x=>`<li>${x}</li>`).join("")||"<li>Continue collecting authorized screening data.</li>"}</ul></div>
      <div class="card"><h3>Priority queue</h3>${(d.alerts||[]).slice(0,6).map(a=>`<div class="alert"><b>${a.full_name||"Personnel"}</b><br>${a.message}<br><small>${a.created_at.slice(0,16)}</small></div>`).join("")||"<p class='muted'>No active alerts.</p>"}</div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Condition-based duty & wellness targets</h3>
      <p class="kicker">Prototype guardrails generated from each person's latest screening condition. They are not medical orders; authorized personnel must approve final scheduling.</p>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Risk</th><th>Duty target</th><th>Sleep target</th><th>Workload target</th><th>Recovery</th></tr></thead><tbody>${plans.map(x=>{const t=(x.recommended_plan||{}).targets||{};return `<tr><td><b>${analyticsEscape(x.full_name||"Personnel")}</b><br><small>${analyticsEscape(x.unit||"")}</small></td><td><span class="risk ${x.risk_level}">${x.risk_level} · ${((x.risk_probability||0)*100).toFixed(0)}%</span></td><td>${analyticsEscape(t.duty_hours||"—")}</td><td>${analyticsEscape(t.sleep_hours||"7–9 h/night")}</td><td>${analyticsEscape(t.workload||"—")}</td><td>${analyticsEscape(t.recovery||"—")}</td></tr>`}).join("") || `<tr><td colspan="6">No screening records yet.</td></tr>`}</tbody></table></div>
    </div>`);
  renderAggregateNativeCharts(d);
})}
\n\nfunction renderAggregateNativeCharts(d){\n  const counts=d.risk_distribution||{Low:0,Medium:0,High:0};\n  const total=(Number(counts.Low)||0)+(Number(counts.Medium)||0)+(Number(counts.High)||0);\n  nativeChartMount("dist", total ? `<div class="distribution-grid">${[["Low",counts.Low||0,"low"],["Medium",counts.Medium||0,"medium"],["High",counts.High||0,"high"]].map(([k,v,c])=>`<div class="distribution-tile ${c}"><span>${k}</span><b>${Number(v).toLocaleString()}</b><small>${Math.round(Number(v)/total*100)}%</small></div>`).join("")}</div><div class="native-caption">${total.toLocaleString()} latest personnel risk classifications</div>` : `<div class="analytics-empty"><b>No risk classifications yet</b><small>Import the HRMS CSV and run the model first.</small></div>`);\n  const trend=Array.isArray(d.risk_trend)?d.risk_trend:[];\n  if(trend.length){\n    const W=760,H=250,pad=38, vals=trend.map(x=>Number(x.value)||0);\n    const min=Math.max(0,Math.min(...vals)-5), max=Math.min(100,Math.max(...vals)+5), range=Math.max(10,max-min);\n    const x=i=>pad+(trend.length===1?(W-2*pad)/2:i*(W-2*pad)/(trend.length-1));\n    const y=v=>H-pad-((v-min)/range)*(H-2*pad);\n    const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");\n    const dots=vals.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="#176b3a"><title>${analyticsEscape(trend[i].label||"")}: ${v.toFixed(1)}%</title></circle>`).join("");\n    nativeChartMount("orgTrend", `<div class="native-line"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Screening trajectory"><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" class="svg-axis"/><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" class="svg-axis"/><polyline points="${pts}" fill="none" stroke="#176b3a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}</svg></div><div class="native-caption">${trend.length} recent screening observations • risk probability %</div>`);\n  } else {\n    nativeChartMount("orgTrend", `<div class="analytics-empty"><b>No screening trend yet</b><small>Import the HRMS CSV and run the model first.</small></div>`);\n  }\n}\n
/* ============ Predictive Risk Assessment: feature metadata ============ */
const FEATURE_META = {
  duty_hours:{label:"Duty hours (today)",min:0,max:24,step:0.5,def:8,worseWhenHigh:true,unit:"h",
    bands:[
      {upto:4.8,title:"Minimal load",desc:"Well below a standard shift; plenty of rest time available."},
      {upto:9.6,title:"Standard day",desc:"A normal single shift — sustainable long-term."},
      {upto:14.4,title:"Extended duty",desc:"Regular overtime; watch for creeping fatigue."},
      {upto:19.2,title:"Heavy load",desc:"Limited recovery time; elevated fatigue risk."},
      {upto:24,title:"Extreme load",desc:"Near round-the-clock duty; high burnout/injury risk."}
    ]},
  sleep_hours:{label:"Sleep last night",min:0,max:12,step:0.5,def:7,worseWhenHigh:false,unit:"h",
    bands:[
      {upto:2.4,title:"Severe deprivation",desc:"Critical rest deficit — safety and cognition heavily impaired."},
      {upto:4.8,title:"Very low",desc:"High fatigue and cognitive-risk territory."},
      {upto:7.2,title:"Below recommended",desc:"Moderate sleep debt building up."},
      {upto:9.6,title:"Healthy range",desc:"Adequate, restorative sleep."},
      {upto:12,title:"Extended rest",desc:"Long recovery sleep — strong restoration."}
    ]},
  fatigue:{label:"Fatigue level",min:0,max:10,step:1,def:4,worseWhenHigh:true,unit:"/10",
    bands:[
      {upto:2,title:"Minimal",desc:"Fully alert and energized."},
      {upto:4,title:"Mild",desc:"Slightly tired, functioning normally."},
      {upto:6,title:"Moderate",desc:"Noticeable tiredness affecting performance."},
      {upto:8,title:"High",desc:"Significant exhaustion, reduced alertness."},
      {upto:10,title:"Severe",desc:"Near-exhaustion — treat as a safety risk."}
    ]},
  mood:{label:"Mood",min:0,max:10,step:1,def:6,worseWhenHigh:false,unit:"/10",
    bands:[
      {upto:2,title:"Very low",desc:"Persistent distress or hopelessness reported."},
      {upto:4,title:"Low",desc:"Frequent irritability or low spirits."},
      {upto:6,title:"Neutral",desc:"Some ups and downs, no clear pattern."},
      {upto:8,title:"Good",desc:"Generally positive outlook."},
      {upto:10,title:"Excellent",desc:"Consistently upbeat and resilient."}
    ]},
  focus:{label:"Focus / concentration",min:0,max:10,step:1,def:6,worseWhenHigh:false,unit:"/10",
    bands:[
      {upto:2,title:"Severe difficulty",desc:"Struggling to concentrate on anything."},
      {upto:4,title:"Frequent distraction",desc:"Hard to complete tasks without losing thread."},
      {upto:6,title:"Average",desc:"Occasional lapses, generally workable."},
      {upto:8,title:"Good",desc:"Generally on task with minor lapses."},
      {upto:10,title:"Sharp",desc:"Sustained, high-quality focus."}
    ]},
  social_support:{label:"Social support",min:0,max:10,step:1,def:6,worseWhenHigh:false,unit:"/10",
    bands:[
      {upto:2,title:"Isolated",desc:"No one available to turn to."},
      {upto:4,title:"Limited",desc:"Very few close connections."},
      {upto:6,title:"Moderate",desc:"Some trusted contacts available."},
      {upto:8,title:"Good",desc:"A reliable support network."},
      {upto:10,title:"Strong",desc:"Close-knit, dependable network."}
    ]},
  recovery_gap:{label:"Days since last real rest/leave",min:0,max:30,step:1,def:5,worseWhenHigh:true,unit:"d",
    bands:[
      {upto:6,title:"Recently rested",desc:"Recovery need is currently low."},
      {upto:12,title:"Approaching due",desc:"Rest is coming due soon — worth monitoring."},
      {upto:18,title:"Overdue",desc:"Recovery gap is growing; schedule downtime."},
      {upto:24,title:"Long overdue",desc:"Significant fatigue accumulation risk."},
      {upto:30,title:"Critical",desc:"Urgent rest or leave is needed."}
    ]},
  workload:{label:"Workload",min:0,max:10,step:1,def:5,worseWhenHigh:true,unit:"/10",
    bands:[
      {upto:2,title:"Very light",desc:"Well under capacity."},
      {upto:4,title:"Manageable",desc:"Comfortable, sustainable pace."},
      {upto:6,title:"Moderate",desc:"Normal operational tempo."},
      {upto:8,title:"Heavy",desc:"Sustained pressure, watch for spillover."},
      {upto:10,title:"Overwhelming",desc:"Unsustainable pace — high burnout risk."}
    ]}
};

function bandFor(meta,value){
  for(const b of meta.bands){ if(value<=b.upto) return b; }
  return meta.bands[meta.bands.length-1];
}
function bandIndex(meta,value){
  for(let i=0;i<meta.bands.length;i++){ if(value<=meta.bands[i].upto) return i; }
  return meta.bands.length-1;
}
function riskColor(pct){ return pct>=67?"var(--bad)":pct>=34?"var(--warn)":"var(--good)"; }

function gaugeSVG(id,pct,label){
  const c=54, r=46, circ=2*Math.PI*r, off=circ*(1-pct/100);
  return `<svg viewBox="0 0 120 120" class="risk-gauge" id="${id}">
    <circle cx="60" cy="60" r="${r}" class="gauge-track"/>
    <circle cx="60" cy="60" r="${r}" class="gauge-fill" style="stroke:${riskColor(pct)};stroke-dasharray:${circ};stroke-dashoffset:${off}"/>
    <text x="60" y="56" class="gauge-num" fill="${riskColor(pct)}">${Math.round(pct)}%</text>
    <text x="60" y="76" class="gauge-sub">${label}</text>
  </svg>`;
}

function sliderRow(key,meta,value){
  const idx=bandIndex(meta,value), band=meta.bands[idx];
  return `<div class="slider-row" id="row-${key}">
    <div class="slider-head"><span>${meta.label}</span><b id="val-${key}">${value}${meta.unit}</b></div>
    <input type="range" id="in-${key}" min="${meta.min}" max="${meta.max}" step="${meta.step}" value="${value}"
      oninput="onSliderInput('${key}')" class="risk-slider band-${idx}">
    <div class="band-track">${meta.bands.map((b,i)=>`<span class="band-seg ${i===idx?'active':''}"></span>`).join("")}</div>
    <div class="band-note" id="note-${key}"><b>${band.title}</b> — ${band.desc}</div>
  </div>`;
}

function onSliderInput(key){
  const meta=FEATURE_META[key];
  const v=Number(document.getElementById("in-"+key).value);
  document.getElementById("val-"+key).textContent=v+meta.unit;
  const idx=bandIndex(meta,v), band=meta.bands[idx];
  document.getElementById("note-"+key).innerHTML=`<b>${band.title}</b> — ${band.desc}`;
  const slider=document.getElementById("in-"+key);
  slider.className="risk-slider band-"+idx;
  const segs=document.querySelectorAll(`#row-${key} .band-seg`);
  segs.forEach((s,i)=>s.classList.toggle("active",i===idx));
  liveEstimate();
}

function readSliderValues(){
  const out={};
  for(const key in FEATURE_META) out[key]=Number(document.getElementById("in-"+key).value);
  return out;
}

// Fast local heuristic used only for the live-preview gauge while dragging;
// the authoritative prediction always comes from the trained backend model on submit.
function liveEstimate(){
  const v=readSliderValues();
  let score=0,n=0;
  for(const key in FEATURE_META){
    const m=FEATURE_META[key];
    const norm=(v[key]-m.min)/(m.max-m.min);
    score+= m.worseWhenHigh? norm : (1-norm);
    n++;
  }
  const pct=Math.max(2,Math.min(98,(score/n)*100));
  const el=document.getElementById("livePreviewGauge");
  if(el) el.innerHTML=gaugeSVG("livePreviewSvg",pct,"live preview");
  const lbl=document.getElementById("livePreviewLabel");
  if(lbl) lbl.textContent = pct>=67?"Trending High":pct>=34?"Trending Medium":"Trending Low";
}

async function runAssessment(){
  const btn=document.getElementById("runAssessBtn");
  btn.disabled=true; btn.textContent="Running model…";
  try{
    const payload=readSliderValues();
    const r=await api("/api/checkins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const out=await r.json();
    renderAssessmentResult(out);
  }catch(e){
    document.getElementById("assessResult").innerHTML=`<div class="notice" style="background:#fee2e2;color:#991b1b">Could not run the prediction: ${e.message}</div>`;
  }finally{
    btn.disabled=false; btn.textContent="Run predictive assessment";
  }
}

function renderAssessmentResult(out){
  const pct=out.risk_probability*100;
  const factors=out.factors||[];
  const actions=out.actions||[];
  document.getElementById("assessResult").innerHTML=`
    <div class="result-top">
      ${gaugeSVG("resultGauge",pct,out.risk_level+" risk")}
      <div class="result-copy">
        <span class="risk ${out.risk_level}">${out.risk_level} risk</span>
        <p>Model-estimated probability of elevated stress based on the values you entered: <b>${pct.toFixed(1)}%</b>.</p>
      </div>
    </div>
    <div class="factor-chips">${factors.length? factors.map(f=>`<span class="chip sev-${f.severity||'moderate'}">${f.label}</span>`).join(""):`<span class="chip sev-ok">No elevated factors detected</span>`}</div>
    <h3 class="section-title" style="margin-top:18px">Recommendations to lower risk</h3>
    <ul class="recommend-list">${actions.map(a=>`<li>${a}</li>`).join("")}</ul>
    <p class="kicker">This is a decision-support estimate from a trained model, not a clinical diagnosis. Results are saved to your history and visible to authorized welfare staff if risk is elevated.</p>`;
  refreshLiveHistory();
}

async function refreshLiveHistory(){
  try{
    const d=await (await api("/api/dashboard")).json();
    const h=d.history||[];
    const labels=h.map(x=>x.created_at.slice(0,10));
    const vals=h.map(x=>x.risk_probability*100);
    chart("assessTrend","line",labels,[{label:"Risk probability",data:vals}],{suffix:"%"});
  }catch(e){}
}

async function checkinPage(){
  const d=await (await api("/api/dashboard")).json();
  let forecast={}; try{forecast=await (await api("/api/forecast")).json()}catch(e){}
  const proj=forecast.projection||{};
  const sliders=Object.keys(FEATURE_META).map(k=>sliderRow(k,FEATURE_META[k],FEATURE_META[k].def)).join("");

  shell("Future Outlook",`
    <div class="notice">Move the sliders to reflect current conditions, then run the assessment. The gauge below updates instantly as a rough guide; the trained model provides the official prediction and recommendations when you submit.</div>

    <div class="grid g2" style="margin-top:16px;align-items:start">
      <div class="card">
        <h3 class="section-title">Enter current conditions</h3>
        <div class="slider-grid">${sliders}</div>
        <button id="runAssessBtn" onclick="runAssessment()" style="margin-top:14px;width:100%">Run predictive assessment</button>
      </div>
      <div class="card">
        <h3 class="section-title">Live preview</h3>
        <div id="livePreviewGauge" class="gauge-wrap"></div>
        <p class="kicker" style="text-align:center" id="livePreviewLabel">Adjust sliders to preview</p>
        <div id="assessResult"></div>
      </div>
    </div>

    <div class="grid g3" style="margin-top:16px">
      <div class="card"><div class="label">Trajectory</div><div class="stat" style="font-size:20px">${forecast.trend||"Unknown"}</div></div>
      <div class="card"><div class="label">Projected in 14 days</div><div class="stat">${proj.in_14_days!=null?(proj.in_14_days*100).toFixed(0)+"%":"—"}</div></div>
      <div class="card"><div class="label">Projected in 30 days</div><div class="stat">${proj.in_30_days!=null?(proj.in_30_days*100).toFixed(0)+"%":"—"}</div></div>
    </div>

    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3 class="section-title">Risk trajectory (history)</h3><div class="chartbox"><canvas id="assessTrend"></canvas></div></div>
      <div class="card"><h3 class="section-title">How the outlook works</h3><ol class="recommend-list">
        <li>Sliders are converted into the model's 8 input features.</li>
        <li>The trained model returns a calibrated risk probability and level.</li>
        <li>Elevated factors are flagged with targeted, factor-specific recommendations.</li>
        <li>Recent trend is extrapolated to give a rough 7/14/30-day projection.</li>
      </ol></div>
    </div>
  `);
  liveEstimate();
  refreshLiveHistory();
}

async function historyPage(){let h=await (await api("/api/checkins")).json();shell("My History",`<div class="card"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Risk</th><th>Probability</th><th>Duty</th><th>Sleep</th><th>Fatigue</th><th>Mood</th><th>Workload</th></tr></thead><tbody>${h.map(x=>`<tr><td>${x.created_at.slice(0,16)}</td><td><span class="risk ${x.risk_level}">${x.risk_level}</span></td><td>${(x.risk_probability*100).toFixed(1)}%</td><td>${x.duty_hours}</td><td>${x.sleep_hours}</td><td>${x.fatigue}</td><td>${x.mood}</td><td>${x.workload}</td></tr>`).join("")}</tbody></table></div></div>`)}

async function personnelPage(){let p=await (await api("/api/personnel")).json();shell("Personnel Directory",`<div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Unit</th><th>Account</th><th>History</th><th>Report</th></tr></thead><tbody>${p.map(x=>`<tr><td>${x.full_name}</td><td>${x.unit}</td><td>${x.role}</td><td><button onclick="viewHistory(${x.id},'${x.full_name.replaceAll("'","")}')">View</button></td><td><button onclick="downloadReport(${x.id})">PDF</button></td></tr>`).join("")}</tbody></table></div></div>`)}

async function viewHistory(id,name){let h=await (await api("/api/personnel/"+id+"/history")).json();shell(name+" — History",`<div class="card"><div class="chartbox"><canvas id="ph"></canvas></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Risk</th><th>Probability</th></tr></thead><tbody>${h.map(x=>`<tr><td>${x.created_at.slice(0,16)}</td><td><span class="risk ${x.risk_level}">${x.risk_level}</span></td><td>${(x.risk_probability*100).toFixed(1)}%</td></tr>`).join("")}</tbody></table></div></div>`);chart("ph","line",h.map(x=>x.created_at.slice(0,10)),[{label:"Risk probability",data:h.map(x=>x.risk_probability*100)}],{suffix:"%"})}

async function alertsPage(){let a=await (await api("/api/alerts")).json();shell("Alert Center",`<div class="card"><div class="toolbar"><button onclick="load('alerts')">Refresh</button></div>${a.map(x=>`<div class="alert"><b>${x.full_name||"My alert"} · ${x.level}</b><br>${x.message}<br><small>${x.created_at.slice(0,16)}</small>${user.role!=="personnel"&&!x.acknowledged?`<div style="margin-top:8px"><button onclick="ack(${x.id})">Acknowledge</button></div>`:""}</div>`).join("")||"<p class='muted'>No alerts.</p>"}</div>`)}

async function ack(id){await api("/api/alerts/"+id+"/ack",{method:"POST"});load("alerts")}

async function interventionsPage(){let d=await (await api("/api/dashboard")).json(), p=d.personnel||[], ints=d.interventions||[];shell("Intervention Tracking",`<div class="grid g2"><div class="card"><h3>Create welfare action</h3><form id="intForm"><select name="personnel_id">${p.map(x=>`<option value="${x.id}">${x.full_name}</option>`).join("")}</select><input name="action" placeholder="e.g. Rest / workload review" required style="width:100%;padding:10px;margin:8px 0;border:1px solid var(--line);border-radius:9px"><select name="priority"><option>High</option><option selected>Medium</option><option>Low</option></select><textarea name="notes" placeholder="Notes" style="width:100%;padding:10px;margin:8px 0;border:1px solid var(--line);border-radius:9px"></textarea><button>Create intervention</button></form></div><div class="card"><h3>Case queue</h3>${ints.map(i=>`<div class="card" style="margin:8px 0;padding:12px"><b>${i.full_name}</b> · ${i.priority}<br>${i.action}<br><span class="kicker">${i.status}</span><br><select onchange="updateInt(${i.id},this.value)"><option ${i.status==="Open"?"selected":""}>Open</option><option ${i.status==="In Progress"?"selected":""}>In Progress</option><option ${i.status==="Closed"?"selected":""}>Closed</option></select></div>`).join("")||"<p class='muted'>No interventions.</p>"}</div></div>`);
document.getElementById("intForm").onsubmit=async e=>{e.preventDefault();let o=Object.fromEntries(new FormData(e.target));o.personnel_id=+o.personnel_id;await api("/api/interventions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(o)});load("interventions")}}
async function updateInt(id,status){await api(`/api/interventions/${id}?status=${encodeURIComponent(status)}`,{method:"PATCH"});load("interventions")}

async function evaluationPage(){let [m,f]=await Promise.all([(await api("/api/evaluation")).json(),(await api("/api/model/feature-importance")).json()]);shell("ML Evaluation & Explainability",`<div class="grid g4">${["accuracy","precision","recall","f1","roc_auc"].map(k=>`<div class="card"><div class="label">${k.replace("_"," ").toUpperCase()}</div><div class="stat">${(m[k]*100).toFixed(1)}%</div></div>`).join("")}</div><div class="grid g2" style="margin-top:16px"><div class="card"><h3>Feature importance</h3>${f.sort((a,b)=>b.importance-a.importance).map(x=>`<div class="feature"><span>${x.feature}</span><div class="bar"><i style="width:${x.importance*100}%"></i></div><b>${(x.importance*100).toFixed(1)}%</b></div>`).join("")}<p class="kicker">Importance is model-derived from the Random Forest and should be interpreted as predictive contribution, not causation.</p></div><div class="card"><h3>Test-set confusion matrix</h3><pre>${JSON.stringify(m.confusion_matrix,null,2)}</pre><div class="notice">${m.note}</div></div></div>`)}

async function importPage(){shell("CSV / HRMS Import",`<div class="card"><h3>Personnel / HRMS import</h3><p class="muted">Upload a CSV export with columns such as <b>username, full_name, unit</b>. In a production deployment, connect this flow to the approved HRMS API rather than storing raw HR data in the browser.</p><input id="csvFile" type="file" accept=".csv"><button style="margin-top:12px" onclick="doImport()">Import CSV</button><div id="importMsg" class="notice" style="margin-top:12px">Demo import only.</div></div><div class="card" style="margin-top:16px"><h3>Expected example</h3><pre>username,full_name,unit
service102,Rahul Kumar,Alpha Unit
service103,Meera Sharma,Bravo Unit</pre></div>`)}
async function doImport(){let f=document.getElementById("csvFile").files[0];if(!f)return;let fd=new FormData();fd.append("file",f);let r=await api("/api/import/csv",{method:"POST",body:fd});document.getElementById("importMsg").textContent=JSON.stringify(await r.json())}

async function downloadReport(id){let r=await api("/api/reports/welfare/"+id);let b=await r.blob(),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`welfare_report_${id}.pdf`;a.click();URL.revokeObjectURL(a.href)}
function chart(id,type,labels,datasets,opt={}){if(charts[id])charts[id].destroy();let c=document.getElementById(id);if(!c)return;charts[id]=new Chart(c,{type,data:{labels,datasets:datasets.map(d=>({label:d.label,data:d.data,tension:.3}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true}},scales:{y:{beginAtZero:true,ticks:{callback:v=>v+(opt.suffix||"")}}}}})}
init();


function renderExecutiveCharts(dashboard){
  if(typeof Chart === "undefined") return;

  const risk = dashboard?.risk_distribution || dashboard?.riskDistribution || {};
  const trend = dashboard?.risk_trend || dashboard?.riskTrend || [];

  const riskCanvas = document.getElementById("riskDistributionChart");
  if(riskCanvas){
    if(window._riskChart) window._riskChart.destroy();
    window._riskChart = new Chart(riskCanvas, {
      type:"doughnut",
      data:{labels:["Low","Medium","High"],datasets:[{data:[
        risk.Low ?? risk.low ?? 0,
        risk.Medium ?? risk.medium ?? 0,
        risk.High ?? risk.high ?? 0
      ]}]},
      options:{responsive:true,plugins:{legend:{position:"bottom"}}}
    });
  }

  const trendCanvas = document.getElementById("riskTrendChart");
  if(trendCanvas && Array.isArray(trend)){
    if(window._trendChart) window._trendChart.destroy();
    window._trendChart = new Chart(trendCanvas, {
      type:"line",
      data:{
        labels:trend.map(x=>x.label || x.date || x.day || ""),
        datasets:[{
          label:"Risk score",
          data:trend.map(x=>x.value ?? x.risk ?? x.score ?? 0),
          tension:.35,
          fill:true
        }]
      },
      options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100}}}
    });
  }
}


/* ================= StressMitra v4 interactions ================= */
function scrollToAnalytics(){
  document.getElementById("advanced-analytics")?.scrollIntoView({behavior:"smooth"});
}

function setQuickStat(id,value){
  const el=document.getElementById(id); if(el) el.textContent = value ?? "—";
}

function loadDemoHRMS(){
  const rows = [
    {personnel_ref:"P1001",unit:"Unit-A",duty_hours:10.5,sleep_hours:6.2,fatigue:6.8,mood:5.8,focus:5.6,social_support:5.0,recovery_gap:14,workload:8},
    {personnel_ref:"P1002",unit:"Unit-A",duty_hours:8.0,sleep_hours:7.8,fatigue:3.0,mood:8.0,focus:8.2,social_support:8.0,recovery_gap:5,workload:4},
    {personnel_ref:"P1003",unit:"Unit-B",duty_hours:12.0,sleep_hours:5.2,fatigue:8.4,mood:4.0,focus:3.8,social_support:3.5,recovery_gap:20,workload:9}
  ];
  const csv = [
    Object.keys(rows[0]).join(","),
    ...rows.map(r=>Object.values(r).join(","))
  ].join("\n");
  const file = new File([csv], "StressMitra_synthetic_sample.csv", {type:"text/csv"});
  window.stressmitraHRMSFile=file;
  const s=document.getElementById("hrms-status");
  if(s) s.textContent=`Synthetic HRMS sample ready: ${rows.length} records`;
  previewHRMS(file);
}

function previewHRMS(file){
  const s=document.getElementById("hrms-status");
  if(!file){if(s)s.textContent="No file loaded";return;}
  if(!file.name.toLowerCase().endsWith(".csv")){
    if(s)s.textContent="Please choose a CSV file."; return;
  }
  window.stressmitraHRMSFile=file;
  if(s)s.textContent=`Ready to import: ${file.name}`;
  const target=document.getElementById("hrms-preview");
  if(target){
    target.innerHTML = `
      <div class="import-ready-card">
        <div><b>${file.name}</b><small>CSV selected • validation will run before ML processing</small></div>
        <button class="primary-btn" id="processHRMSBtn" onclick="processHRMSFile()">Run StressMitra Analysis</button>
      </div>`;
  }
}

async function processHRMSFile(){
  const file=window.stressmitraHRMSFile;
  const s=document.getElementById("hrms-status");
  const target=document.getElementById("hrms-preview");
  if(!file){if(s)s.textContent="Choose a CSV first.";return;}

  const btn=document.getElementById("processHRMSBtn");
  if(btn){btn.disabled=true;btn.textContent="Validating + predicting…";}
  if(s)s.textContent="Validating CSV and running the Random Forest model…";

  try{
    const fd=new FormData();
    fd.append("file",file);
    const r=await api("/api/import/hrms",{method:"POST",body:fd});
    const result=await r.json();

    if(s)s.textContent=`Analysis complete: ${result.rows_processed} personnel processed.`;

    const dist=result.risk_distribution||{};
    const samples=result.sample_results||[];
    if(target){
      target.innerHTML=`
        <div class="import-result-card">
          <div class="import-result-head">
            <div><b>ML analysis complete</b><small>${result.rows_processed} records processed • ${result.rows_rejected||0} rejected</small></div>
            <span class="import-success">✓ PROCESSED</span>
          </div>
          <div class="import-kpis">
            <div><span>Personnel</span><b>${result.rows_processed}</b></div>
            <div><span>Low risk</span><b>${dist.Low||0}</b></div>
            <div><span>Medium risk</span><b>${dist.Medium||0}</b></div>
            <div><span>High risk</span><b>${dist.High||0}</b></div>
          </div>
          <div class="mini-table import-sample">
            <b>Personnel</b><b>Unit</b><b>Risk</b><b>Probability</b>
            ${samples.map(x=>`<span>${x.personnel_ref}</span><span>${x.unit}</span><span class="risk ${x.risk_level}">${x.risk_level}</span><span>${(Number(x.risk_probability)*100).toFixed(1)}%</span>`).join("")}
          </div>
          <p class="kicker">The full dataset is now stored as screening records for the authorized welfare dashboard. Use the charts below for aggregate review.</p>
        </div>`;
    }

    await refreshVisualAnalytics();
    if(typeof navigate==="function"){
      // Keep the user on the connector so they can immediately see the processed result.
    }
  }catch(e){
    if(s)s.textContent=`Import failed: ${e.message}`;
    if(btn){btn.disabled=false;btn.textContent="Run StressMitra Analysis";}
  }
}

function renderHRMSPreview(rows){
  const target=document.getElementById("hrms-preview");
  if(!target)return;
  target.innerHTML = `<div class="mini-table"><b>Personnel</b><b>Unit</b><b>Duty</b><b>Workload</b>`+
    rows.map(r=>`<span>${r.personnel_ref}</span><span>${r.unit}</span><span>${r.duty_hours}h</span><span>${r.workload}/10</span>`).join("")+
    `</div>`;
}

function analyticsEscape(value){
  return String(value ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}

function setAnalyticsStatus(text, ok=true){
  const el=document.getElementById("analytics-status");
  if(el){el.textContent=text;el.classList.toggle("is-error",!ok);}
}

function nativeChartMount(id, html){
  const old=document.getElementById(id);
  if(!old)return;
  let box=document.getElementById(id+"Native");
  if(!box){
    box=document.createElement("div");
    box.id=id+"Native";
    box.className="native-chart";
    old.replaceWith(box);
  }
  box.innerHTML=html;
}

function renderEmptyNative(id, message){
  nativeChartMount(id, `<div class="analytics-empty"><span>⌁</span><b>${analyticsEscape(message)}</b><small>Import screening data or complete a check-in to populate this panel.</small></div>`);
}

function renderAdvancedCharts(payload={}, featureList=[]){
  const people=Array.isArray(payload.personnel)?payload.personnel:[];
  const dist=payload.risk_distribution||{};
  const trend=Array.isArray(payload.risk_trend)?payload.risk_trend:[];
  const fi=Array.isArray(featureList)?featureList:[];

  // Risk by unit — use latest risk probability per personnel; if unavailable, show overall distribution.
  const byUnit={};
  people.forEach(p=>{
    if(!p.unit || p.risk_probability==null)return;
    const u=String(p.unit);
    (byUnit[u] ||= []).push(Number(p.risk_probability)*100);
  });
  const units=Object.keys(byUnit);
  if(units.length){
    const vals=units.map(u=>{
      const a=byUnit[u];
      return Number((a.reduce((x,y)=>x+y,0)/a.length).toFixed(1));
    });
    const max=Math.max(100,...vals);
    nativeChartMount("unitRiskChart", `<div class="native-bars">${units.map((u,i)=>`
      <div class="native-bar-row"><div class="native-bar-label"><span>${analyticsEscape(u)}</span><b>${vals[i].toFixed(1)}%</b></div>
      <div class="native-bar-track"><span style="width:${Math.max(2,Math.min(100,vals[i]))}%"></span></div></div>`).join("")}</div><div class="native-caption">Average latest risk probability by unit • ${people.length} personnel</div>`);
  } else {
    const values=[Number(dist.Low||0),Number(dist.Medium||0),Number(dist.High||0)];
    const total=values.reduce((a,b)=>a+b,0);
    if(total){
      nativeChartMount("unitRiskChart", `<div class="distribution-grid">${[["Low",values[0],"low"],["Medium",values[1],"medium"],["High",values[2],"high"]].map(([k,v,c])=>`<div class="distribution-tile ${c}"><span>${k}</span><b>${v}</b><small>${total?Math.round(v/total*100):0}%</small></div>`).join("")}</div><div class="native-caption">Overall risk distribution • ${total} screened records</div>`);
    }else renderEmptyNative("unitRiskChart","No screening data yet");
  }

  // Risk trend — self-contained SVG, no external chart library required.
  if(trend.length){
    const W=760,H=250,pad=38;
    const vals=trend.map(x=>Math.max(0,Math.min(100,Number(x.value??x.risk??x.score??0))));
    const min=Math.min(...vals), max=Math.max(...vals), range=Math.max(8,max-min);
    const x=i=>pad+(trend.length===1?(W-2*pad)/2:i*(W-2*pad)/(trend.length-1));
    const y=v=>H-pad-((v-(min-range*.1))/(range*1.2))*(H-2*pad);
    const pts=vals.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const dots=vals.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" fill="#176b3a"><title>${analyticsEscape(trend[i].label||"")}: ${v.toFixed(1)}%</title></circle>`).join("");
    const labelIndexes=[0,Math.floor((trend.length-1)/2),trend.length-1].filter((v,i,a)=>a.indexOf(v)===i);
    const labels=labelIndexes.map(i=>`<text x="${x(i).toFixed(1)}" y="${H-10}" text-anchor="middle" class="svg-label">${analyticsEscape(String(trend[i].label||"").slice(0,10))}</text>`).join("");
    nativeChartMount("advancedTrendChart", `<div class="native-line"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Risk probability trend"><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}" class="svg-axis"/><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" class="svg-axis"/><polyline points="${pts}" fill="none" stroke="#176b3a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg></div><div class="native-caption">Recent screening risk probability • ${trend.length} observations</div>`);
  } else renderEmptyNative("advancedTrendChart","No screening trend yet");

  // Feature importance — comes from the trained Random Forest endpoint.
  const top=fi.slice().sort((a,b)=>Number(b.importance)-Number(a.importance)).slice(0,8);
  if(top.length){
    const vals=top.map(x=>Number(x.importance)||0), maxImp=Math.max(...vals,0.01);
    nativeChartMount("featureImportanceChart", `<div class="native-bars">${top.map((x,i)=>{
      const value=Number(x.importance)||0;
      return `<div class="native-bar-row"><div class="native-bar-label"><span>${analyticsEscape(String(x.feature||"").replaceAll("_"," "))}</span><b>${(value*100).toFixed(1)}%</b></div><div class="native-bar-track importance"><span style="width:${Math.max(2,Math.min(100,value/maxImp*100))}%"></span></div></div>`;
    }).join("")}</div><div class="native-caption">Relative feature importance from the current Random Forest model</div>`);
  } else renderEmptyNative("featureImportanceChart","Model feature importance unavailable");
}

async function refreshVisualAnalytics(){
  try{
    // The app stores the auth token under sm_token. The previous version looked for token,
    // so /api/dashboard was called without authentication and the charts stayed blank.
    const authToken = token || localStorage.getItem("sm_token") || sessionStorage.getItem("sm_token");
    if(!authToken){setAnalyticsStatus("Sign in to load welfare analytics",false);return;}
    const headers={"Authorization":"Bearer "+authToken};
    const r=await fetch("/api/dashboard",{headers});
    if(!r.ok){setAnalyticsStatus(`Analytics request failed (${r.status})`,false);return;}
    const d=await r.json();
    const data=d.data||d;
    const personnel = data.personnel_count ?? data.total_personnel ?? data.totalPersonnel ?? (Array.isArray(data.personnel)?data.personnel.length:0);
    const checkins = data.checkins_count ?? data.recent_checkins ?? data.recentCheckins ?? (Array.isArray(data.risk_trend)?data.risk_trend.length:0);
    const alerts = data.open_alerts ?? data.alerts_open ?? data.openAlerts ?? 0;
    const support = data.interventions_open ?? data.support_cases ?? data.openInterventions ?? 0;
    setQuickStat("stat-personnel",personnel);
    setQuickStat("stat-checkins",checkins);
    setQuickStat("stat-alerts",alerts);
    setQuickStat("stat-support",support);

    let featureList=[];
    try{
      const fr=await fetch("/api/model/feature-importance",{headers});
      if(fr.ok)featureList=await fr.json();
    }catch(e){console.warn("Feature importance unavailable",e)}

    renderAdvancedCharts(data,featureList);
    const screened=Number(checkins||0);
    setAnalyticsStatus(`${Number(personnel||0).toLocaleString()} personnel • ${screened.toLocaleString()} screening records • live from authenticated dashboard`);
  }catch(e){
    setAnalyticsStatus("Analytics could not be loaded",false);
    console.warn("Interactive analytics unavailable:",e);
  }
}
document.addEventListener("DOMContentLoaded",()=>{init();});
