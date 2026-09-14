
    const $ = (selector, root=document) => root.querySelector(selector);
    const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
    const icons = {
      check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 4 4L19 6"/></svg>',
      heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z"/></svg>',
      shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>'
    };
    const state = { portal:'personnel', choice:'A quiet pause', music:false, currentView:'overview', model:null, session:localStorage.getItem('stressmitra_session')||null, account:null, musicIndex:0, musicTracks:[{name:'Calm stress-relief ringtone',file:'/music/calm-stress-relief.wav',reason:'Gentle chimes and slow tones for a short reset'},{name:'Clear-head instrumental',file:'/music/clear-head.wav',reason:'Lower-load state · calm focus'},{name:'Evening recovery',file:'/music/evening-recovery.wav',reason:'Recovery window · softer transition'},{name:'Low-tempo focus flow',file:'/music/low-tempo.wav',reason:'Higher-load state · gentle downshift'}] };

    async function api(path, options={}) {
      const authHeaders = state.session ? {'Authorization':`Bearer ${state.session}`} : {};
      const baseHeaders = {'Content-Type':'application/json', ...authHeaders, ...(options.headers||{})};
      // Don't force JSON content type for file uploads.
      if (options.body instanceof ArrayBuffer || options.body instanceof Blob || options.body instanceof FormData) delete baseHeaders['Content-Type'];
      let response;
      try { response = await fetch(path, { headers:baseHeaders, ...options }); }
      catch { throw new Error('Local server unavailable. Start StressMitra and open http://127.0.0.1:8000 — do not open index.html directly.'); }
      if (!response.ok) { const problem=await response.json().catch(()=>({})); throw new Error(problem.detail || problem.error || `Request failed (${response.status})`); }
      return response.json();
    }
    function setText(id,value){ const el=$('#'+id); if(el) el.textContent=value; }
    function updateAnalytics(data) {
      // Adapt the Python/SQLite dashboard into the visual language of this interface.
      const people = data.personnel || [];
      const probs = people.map(p => Number(p.risk_probability || 0));
      const avgRisk = probs.length ? probs.reduce((a,b)=>a+b,0)/probs.length : 0;
      const wellbeing = Math.max(0, Math.round((1-avgRisk)*100));
      const rd = data.risk_distribution || {};
      setText('forceIndex', wellbeing);
      setText('activeSignals', data.open_alerts ?? 0);
      setText('followupCount', data.interventions_open ?? 0);
      setText('completionPct', people.length ? Math.round((data.checkins_count||0)/Math.max(1,people.length)*100) : 0);
      setText('readinessPct', wellbeing);
      const total=(rd.Low||0)+(rd.Medium||0)+(rd.High||0);
      setText('riskTotal',total); setText('riskStable',rd.Low||0); setText('riskWatch',rd.Medium||0); setText('riskFollow',rd.High||0);
      if(total){
        const a=(rd.Low||0)/total*360,b=((rd.Low||0)+(rd.Medium||0))/total*360;
        $('#riskDonut').style.background=`conic-gradient(var(--teal) 0deg ${a}deg,var(--yellow) ${a}deg ${b}deg,var(--orange) ${b}deg 360deg)`;
      }
      const units={};
      people.forEach(p=>{const u=p.unit||'Unassigned'; (units[u] ||= []).push(Number(p.risk_probability||0));});
      $('#unitBars').innerHTML=Object.entries(units).map(([unit,vals])=>{const v=Math.max(0,Math.round((1-vals.reduce((a,b)=>a+b,0)/vals.length)*100));return `<div class="unit-row"><span>${unit}</span><div class="unit-track"><i style="width:${v}%"></i></div><b>${v}%</b></div>`;}).join('') || '<div class="empty-state">No screening data yet.</div>';
      setMusicForWellbeing(wellbeing);
      return wellbeing;
    }
    function escHtml(value){ return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function fmtDate(value){
      if(!value) return 'No check-in yet';
      const d=new Date(value); if(Number.isNaN(d.getTime())) return String(value).slice(0,16).replace('T',' · ');
      return d.toLocaleString([], {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    }
    function riskLabel(prob){ const p=Number(prob||0)*100; return p>=67?'High':p>=34?'Medium':'Low'; }
    function renderOverviewTrend(trend){
      const svg=$('#stressChart'); if(!svg) return;
      const values=(Array.isArray(trend)?trend:[]).slice(-7).map(x=>Number(x.value)||0);
      if(!values.length){ svg.innerHTML='<text x="320" y="92" text-anchor="middle" class="chart-label">No screening data yet</text>'; return; }
      const W=640,H=180,L=45,R=20,T=25,B=29,min=0,max=Math.max(100,...values,55);
      const x=i=>values.length===1?(W+L-R)/2:L+i*(W-L-R)/(values.length-1);
      const y=v=>H-B-(v/max)*(H-T-B);
      const pts=values.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const area=`M ${x(0)} ${y(values[0])} ${values.slice(1).map((v,i)=>`L ${x(i+1)} ${y(v)}`).join(' ')} L ${x(values.length-1)} ${H-B} L ${x(0)} ${H-B} Z`;
      const dots=values.map((v,i)=>`<circle class="point" cx="${x(i)}" cy="${y(v)}" r="4"><title>${v.toFixed(1)}% risk</title></circle>`).join('');
      const labels=values.map((_,i)=>{const idx=i; return `<text class="chart-label" x="${x(idx)}" y="171" text-anchor="middle">${escHtml((trend[trend.length-values.length+i]?.label||'').slice(5,10))}</text>`;}).join('');
      svg.innerHTML=`<line class="chart-grid" x1="45" x2="620" y1="25" y2="25"/><line class="chart-grid" x1="45" x2="620" y1="73" y2="73"/><line class="chart-grid" x1="45" x2="620" y1="121" y2="121"/><line class="chart-grid" x1="45" x2="620" y1="151" y2="151"/><text class="chart-label" x="8" y="28">100</text><text class="chart-label" x="8" y="76">67</text><text class="chart-label" x="8" y="124">34</text><text class="chart-label" x="8" y="154">0</text><path class="area" d="${area}"/><polyline class="chart-line" points="${pts}" fill="none"/><path class="threshold" d="M45 ${y(67)}H620"/>${dots}${labels}`;
      const latest=values[values.length-1];
      const tagX=Math.min(590,Math.max(50,x(values.length-1)-15));
      svg.insertAdjacentHTML('beforeend',`<rect class="chart-tag" x="${tagX}" y="${Math.max(30,y(latest)-28)}" width="38" height="18" rx="5"/><text class="chart-tag-text" x="${tagX+8}" y="${Math.max(43,y(latest)-15)}">${Math.round(latest)}</text>`);
    }
    function renderAlerts(alerts){
      const stack=$('#alertsStack'), empty=$('#emptyAlerts');
      if(!stack||!empty) return;
      const open=(Array.isArray(alerts)?alerts:[]).filter(a=>!Number(a.acknowledged));
      stack.innerHTML=open.length?open.map(a=>{
        const level=String(a.level||'Medium').toLowerCase();
        const icon=level==='high'?'!':level==='medium'?'•':'✓';
        const name=a.full_name||'Personnel';
        return `<article class="alert-card ${escHtml(level)}" data-alert="${Number(a.id)}">
          <div class="alert-level"><strong style="font-size:18px">${icon}</strong></div>
          <div><h3>${escHtml(level.charAt(0).toUpperCase()+level.slice(1))} welfare signal · ${escHtml(name)}</h3>
          <p>${escHtml(a.message)}</p><div class="alert-foot"><span>Created <b>${escHtml(fmtDate(a.created_at))}</b></span><span>Human review required</span></div></div>
          <div class="alert-actions"><button class="btn small alert-open" data-person="${escHtml(name)}">View context</button><button class="btn small alert-resolve" data-alert="${Number(a.id)}">Acknowledge</button></div>
        </article>`;
      }).join(''):'';
      empty.style.display=open.length?'none':'block';
      const badges=$$('.nav-badge'); if(badges[1]) badges[1].textContent=String(open.length);
      $$('.alert-open',stack).forEach(btn=>btn.addEventListener('click',()=>showPerson(btn.dataset.person)));
      $$('.alert-resolve',stack).forEach(btn=>btn.addEventListener('click',async()=>{
        const card=btn.closest('.alert-card'); const id=card?.dataset.alert;
        try{ await api(`/api/alerts/${id}/ack`,{method:'POST'}); card.remove(); renderAlerts((Array.isArray(alerts)?alerts:[]).map(a=>String(a.id)===String(id)?{...a,acknowledged:1}:a)); toast('Alert acknowledged. The support action remains human-led.','heart'); }
        catch(err){ toast(err.message||'Could not acknowledge the alert.'); }
      }));
    }
    function updateOverview(data){
      const people=Array.isArray(data.personnel)?data.personnel:[];
      const latestPeople=people.filter(p=>p.risk_probability!==null && p.risk_probability!==undefined);
      const avg=latestPeople.length?latestPeople.reduce((s,p)=>s+Number(p.risk_probability||0),0)/latestPeople.length:0;
      const wellbeing=Math.round((1-avg)*100);
      const screened = data.screened_personnel_count ?? latestPeople.length;
      const totalPeople=data.personnel_count ?? people.length;
      const completion=totalPeople?Math.round(screened/totalPeople*100):0;
      setText('forceIndex', wellbeing); setText('readinessPct',wellbeing);
      setText('activeSignals',data.open_alerts||0); setText('followupCount',data.open_alerts||0);
      setText('completionPct',Math.min(100,completion));
      const rd=data.risk_distribution||{}; const total=(rd.Low||0)+(rd.Medium||0)+(rd.High||0);
      setText('riskTotal',total); setText('riskStable',rd.Low||0); setText('riskWatch',rd.Medium||0); setText('riskFollow',rd.High||0);
      if(total){ const a=(rd.Low||0)/total*360,b=((rd.Low||0)+(rd.Medium||0))/total*360; $('#riskDonut').style.background=`conic-gradient(var(--teal) 0deg ${a}deg,var(--yellow) ${a}deg ${b}deg,var(--orange) ${b}deg 360deg)`; }
      else $('#riskDonut').style.background='conic-gradient(rgba(219,245,240,.1) 0deg 360deg)';
      const trend=Array.isArray(data.risk_trend)?data.risk_trend:[]; renderOverviewTrend(trend);
      const latest=people.slice().sort((a,b)=>String(a.last_checkin||'').localeCompare(String(b.last_checkin||''))).find(p=>p.risk_probability!=null) || people[0];
      const currentProb=latest?Number(latest.risk_probability||0):0;
      const currentPct=Math.round(currentProb*100);
      const trendMain=$('.trend-main'); if(trendMain) trendMain.innerHTML=`${currentPct}<span> / 100</span>`;
      const trendCaption=$('.trend-caption'); if(trendCaption) trendCaption.textContent=latest?`Current ${riskLabel(currentProb).toLowerCase()} risk band · ${fmtDate(latest.last_checkin)}`:'No screening submitted yet';
      const alerts=Array.isArray(data.alerts)?data.alerts:[];
      renderAlerts(alerts);
      const brief=document.querySelector('.brief-items');
      if(brief){
        const items=alerts.slice(0,3).map(a=>({title:`${a.level} welfare signal`,desc:a.message,time:fmtDate(a.created_at)}));
        if(!items.length){ const missing=Math.max(0,totalPeople-screened); items.push({title:'Monitoring status',desc:screened?`${screened} of ${totalPeople} personnel have a current screening.`:'No screening records are available yet.',time:'Live'}); if(missing>0) items.push({title:'Check-in coverage',desc:`${missing} personnel have no current screening record.`,time:'Live'}); }
        brief.innerHTML=items.map(x=>`<div class="brief-item"><div class="brief-icon">${icons.heart}</div><div><strong>${escHtml(x.title)}</strong><p>${escHtml(x.desc)}</p></div><time>${escHtml(x.time)}</time></div>`).join('');
      }
      const priority=document.getElementById('priorityTable');
      if(priority){
        const ranked=people.slice().sort((a,b)=>Number(b.risk_probability||0)-Number(a.risk_probability||0)).slice(0,6);
        priority.innerHTML=ranked.length?ranked.map(p=>{const pct=Math.round(Number(p.risk_probability||0)*100), level=riskLabel(p.risk_probability); const initials=(p.full_name||'P').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase(); return `<tr><td><div class="name-cell"><div class="mini-avatar">${escHtml(initials)}</div><div><strong>${escHtml(p.full_name||'Personnel')}</strong><small>${escHtml(p.unit||'Unit')} · Personnel</small></div></div></td><td><div class="risk-cell"><span class="risk-bar"><i style="width:${pct}%"></i></span><span class="risk-num">${pct}</span></div></td><td>${escHtml(fmtDate(p.last_checkin))}</td><td><span class="status ${level==='High'?'attention':level==='Medium'?'watch':''}">${level}</span></td></tr>`}).join(''):`<tr><td colspan="4"><div class="empty-state">No screening data yet.</div></td></tr>`;
      }
      const mine = data.user?.role==='personnel' ? (data.latest || latest) : latest;
      const score=document.getElementById('myScore'); if(score) score.textContent=mine?Math.max(0,100-Math.round(Number(mine.risk_probability||0)*100)):0;
      const wellbeingTitle=document.querySelector('.wellbeing .score-ring h3'); const wellbeingDesc=document.querySelector('.wellbeing .score-ring p');
      if(wellbeingTitle) wellbeingTitle.textContent=mine?`${riskLabel(mine.risk_probability)} risk · recovery ${Math.max(0,100-Math.round(Number(mine.risk_probability||0)*100))}/100`:'No check-in yet';
      if(wellbeingDesc) wellbeingDesc.textContent=mine?`Last check-in: ${fmtDate(mine.last_checkin||mine.created_at)}. Use the next check-in to update your support plan.`:'Submit a check-in to generate your personal recovery view.';
      const balanceRows=document.querySelectorAll('.wellbeing .balance-row');
      if(balanceRows.length && mine){ const sleep=Number(mine.sleep_hours||0); const load=Number(mine.workload||0); const sleepPct=Math.max(0,Math.min(100,Math.round(sleep/8*100))); const loadPct=Math.max(0,Math.min(100,Math.round((10-load)/9*100))); balanceRows[0].querySelector('b').textContent=`${sleepPct}%`; balanceRows[0].querySelector('.balance-fill').style.width=`${sleepPct}%`; balanceRows[1].querySelector('b').textContent=`${loadPct}%`; balanceRows[1].querySelector('.balance-fill').style.width=`${loadPct}%`; }
      const drivers=document.getElementById('driverList');
      if(drivers){
        let factors=[]; people.forEach(p=>{ if(p.factors_json){try{factors=factors.concat(JSON.parse(p.factors_json)||[])}catch{}} });
        if(data.latest?.factors_json){try{factors=JSON.parse(data.latest.factors_json)||factors}catch{}}
        const grouped={}; factors.forEach(f=>{const k=f.label||f.feature||'Signal'; grouped[k]=(grouped[k]||0)+1}); const entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,4);
        drivers.innerHTML=entries.length?entries.map(([label,count])=>{const pct=Math.min(100,Math.round(count/Math.max(1,factors.length)*100));return `<div><span>${escHtml(label)}</span><b>${count}</b><div class="driver-meter"><i style="width:${pct}%"></i></div></div>`}).join(''):`<div class="empty-state">No elevated factors in current screening data.</div>`;
      }
      const dateBlock=document.querySelector('.date-block'); if(dateBlock) dateBlock.innerHTML=`<strong>${new Date().toLocaleDateString([], {weekday:'long',day:'2-digit',month:'long'})}</strong>Live screening data · ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`;
      const crumbUnit=document.getElementById('crumbUnit'); if(crumbUnit) crumbUnit.textContent=` / ${data.user?.unit||'Current unit'}`;
      const wbName=document.getElementById('wellbeingName'); if(wbName) wbName.textContent=data.user?.full_name || latest?.full_name || 'Current profile';
      const trendMainValue=document.getElementById('trendMainValue'); if(trendMainValue) trendMainValue.textContent=currentPct;
    }
    let mapsReady=false, nearbyMap=null, nearbyOrigin=null, nearbyMarkers=[];
    async function loadGoogleMaps(){
      if(mapsReady && window.google?.maps) return true;
      try{
        const cfg=await fetch('/api/config',{cache:'no-store'}).then(r=>r.json());
        const key=cfg.googleMapsApiKey||'';
        if(!key){ $('#mapStatus').textContent='Add your Google Maps API key to config/google-maps-api-key.txt.'; return false; }
        await new Promise((resolve,reject)=>{ const existing=document.querySelector('script[data-stressmitra-maps]'); if(existing){ if(window.google?.maps) return resolve(); existing.addEventListener('load',resolve,{once:true}); existing.addEventListener('error',reject,{once:true}); return; } const sc=document.createElement('script'); sc.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`; sc.async=true; sc.defer=true; sc.dataset.stressmitraMaps='1'; sc.onload=resolve; sc.onerror=reject; document.head.appendChild(sc); });
        const [{Map}]=await Promise.all([google.maps.importLibrary('maps')]);
        nearbyMap=new Map($('#nearbyMap'),{center:{lat:28.6139,lng:77.2090},zoom:13,mapTypeControl:false,streetViewControl:false,fullscreenControl:true});
        mapsReady=true; $('#mapStatus').textContent='Ready. Select a place to route.'; return true;
      }catch(e){ $('#mapStatus').textContent='Google Maps could not load. Check the API key and enabled APIs.'; return false; }
    }
    async function searchNearbyPlaces(){
      const ok=await loadGoogleMaps(); if(!ok) return;
      if(!navigator.geolocation){ $('#mapStatus').textContent='Location is unavailable in this browser.'; return; }
      $('#mapStatus').textContent='Requesting your location…';
      navigator.geolocation.getCurrentPosition(async pos=>{
        nearbyOrigin={lat:pos.coords.latitude,lng:pos.coords.longitude}; nearbyMap.setCenter(nearbyOrigin); nearbyMap.setZoom(14);
        try{
          const {Place,SearchNearbyRankPreference}=await google.maps.importLibrary('places');
          const type=$('#nearbyType').value;
          const request={fields:['displayName','location','formattedAddress','googleMapsURI'],locationRestriction:{center:nearbyOrigin,radius:5000},includedPrimaryTypes:[type],maxResultCount:8,rankPreference:SearchNearbyRankPreference.DISTANCE,language:'en',region:'IN'};
          const {places}=await Place.searchNearby(request);
          nearbyMarkers.forEach(m=>m.setMap?.(null)); nearbyMarkers=[];
          if(!places?.length){ $('#nearbyPlaces').innerHTML='<div class="empty-state">No matching places were found within 5 km.</div>'; $('#mapStatus').textContent='No places found nearby.'; return; }
          const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
          const bounds=new google.maps.LatLngBounds();
          $('#nearbyPlaces').innerHTML=places.map((pl,i)=>`<article class="nearby-place"><div><strong>${escHtml(pl.displayName||'Nearby place')}</strong><small>${escHtml(pl.formattedAddress||'')}</small></div><div class="nearby-actions"><button class="btn small route-place" data-index="${i}">Route</button><a class="btn small" target="_blank" rel="noopener" href="${escHtml(pl.googleMapsURI||'#')}">Open map</a></div></article>`).join('');
          places.forEach((pl,i)=>{ if(!pl.location)return; bounds.extend(pl.location); const m=new AdvancedMarkerElement({map:nearbyMap,position:pl.location,title:pl.displayName||'Nearby place'}); nearbyMarkers.push(m); }); nearbyMap.fitBounds(bounds);
          $$('.route-place',$('#nearbyPlaces')).forEach(btn=>btn.addEventListener('click',()=>routeToPlace(places[Number(btn.dataset.index)])));
          $('#mapStatus').textContent=`Found ${places.length} nearby places.`;
        }catch(e){ $('#mapStatus').textContent='Nearby search failed. Check that Places API (New) is enabled.'; }
      },()=>{ $('#mapStatus').textContent='Location permission was not granted. You can still use Open map links after searching manually.'; },{enableHighAccuracy:true,timeout:10000,maximumAge:300000});
    }
    async function routeToPlace(place){
      if(!nearbyOrigin||!place?.location) return;
      try{
        const {Route}=await google.maps.importLibrary('routes');
        const result=await Route.computeRoutes({origin:nearbyOrigin,destination:place.location,travelMode:'WALK',fields:['path','distanceMeters','duration']});
        const route=result?.routes?.[0];
        if(route?.path){ const line=new google.maps.Polyline({map:nearbyMap,path:route.path,strokeOpacity:.9,strokeWeight:5}); window._smRoute=line; }
        const km=route?.distanceMeters?`${(route.distanceMeters/1000).toFixed(1)} km`:''; const min=route?.duration?`${Math.round(parseFloat(route.duration)/60)} min`:''; $('#mapStatus').textContent=`Walking route to ${place.displayName||'place'} · ${km} · ${min}`;
      }catch(e){ const dest=place.googleMapsURI||`https://www.google.com/maps/dir/?api=1&origin=${nearbyOrigin.lat},${nearbyOrigin.lng}&destination=${encodeURIComponent(place.formattedAddress||place.displayName||'')}&travelmode=walking`; window.open(dest,'_blank','noopener'); $('#mapStatus').textContent='Opened Google Maps for the walking route.'; }
    }
    $('#findNearbyPlaces')?.addEventListener('click',searchNearbyPlaces);
    $('#nearbyType')?.addEventListener('change',()=>{ if(nearbyOrigin) searchNearbyPlaces(); });

    async function loadLiveData() {
      try {
        const analytics = await api('/api/dashboard');
        updateAnalytics(analytics);
        updateOverview(analytics);
        await loadPersonnel(analytics.personnel || []);
        state.model = await api('/api/evaluation').catch(()=>null);
        if(state.model){ $('#modelFooter').textContent=`Random Forest · ${state.model.samples || state.model.sample_size || 'demo'} training records · human review required.`; }
      } catch (error) { console.info('StressMitra live data unavailable:', error.message); toast(error.message,'shield'); }
    }

    function toast(message, icon='check') {
      const item = document.createElement('div'); item.className='toast'; item.innerHTML=`${icons[icon] || icons.check}<span>${message}</span>`;
      $('#toastRegion').append(item); setTimeout(()=>item.remove(), 3800);
    }
    function navigate(view) {
      const viewEl = $('#'+view); if (!viewEl) return;
      $$('.tab-view').forEach(el=>el.classList.toggle('active',el.id===view));
      $$('.nav-item[data-view]').forEach(el=>el.classList.toggle('active',el.dataset.view===view));
      $('#crumbTitle').textContent = ({overview:'Command centre',personnel:'Personnel overview',alerts:'Welfare alerts',recommendations:'Recovery companion',checkin:'Daily check-in',puzzle:'Calm puzzle'})[view];
      state.currentView=view; $('#sidebar').classList.remove('open'); window.scrollTo({top:0,behavior:'smooth'});
    }
    $$('.nav-item[data-view]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.view)));
    $$('[data-view-jump]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.viewJump)));
    $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));

    function modal(title, intro, content) { $('#modalTitle').textContent=title; $('#modalIntro').textContent=intro; $('#modalContent').innerHTML=content; $('#modalBackdrop').classList.add('open'); $('#modalBackdrop').setAttribute('aria-hidden','false'); $('#modalClose').focus(); }
    function closeModal(){ $('#modalBackdrop').classList.remove('open'); $('#modalBackdrop').setAttribute('aria-hidden','true'); }
    $('#modalClose').addEventListener('click',closeModal); $('#modalBackdrop').addEventListener('click',e=>{if(e.target===$('#modalBackdrop')) closeModal()}); document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
    function openAuth(mode='signin', portal=state.portal||'personnel'){
      state.portal=portal;
      $('#siteIntro').style.display='none'; $('#authPortal').classList.add('open'); showAuthForm(mode);
      const welfare=portal==='welfare';
      $('#authPortalLabel').textContent=welfare?'Welfare officer portal · secure local access':'Personnel portal · secure local access';
      $('#signInTitle').textContent=welfare?'Welfare team sign in':'Welcome back';
      $('#signInIntro').textContent=welfare?'Use an authorised welfare, commander or admin account to enter the support workspace.':'Sign in to continue to your protected StressMitra workspace.';
      $('#createAccountForm').style.display=welfare?'none':'';
      if(welfare) showAuthForm('signin');
    }
    $('#introSignIn').addEventListener('click',()=>openAuth('signin','personnel'));
    $('#introWelfare').addEventListener('click',()=>openAuth('signin','welfare'));
    $('#introRegister').addEventListener('click',()=>openAuth('create','personnel'));
    function setMusicForWellbeing(score){ const idx = score >= 67 ? 3 : score >= 45 ? 1 : 0; state.musicIndex=idx; const track=state.musicTracks[idx]; $('#healthAudio').src=track.file; $('#playerTitle').textContent=track.name; $('#playerReason').textContent=track.reason; $('#musicTitle').textContent=track.name; $('#musicDesc').textContent='Original instrumental audio selected from the current wellbeing signal.'; }
    function updatePlayer(){ const audio=$('#healthAudio'); if(!audio) return; const pct=audio.duration ? (audio.currentTime/audio.duration)*100 : 0; $('#playerProgress').style.width=`${pct}%`; $('#playerTime').textContent=`${Math.floor(audio.currentTime/60)}:${String(Math.floor(audio.currentTime%60)).padStart(2,'0')} / ${audio.duration && isFinite(audio.duration) ? `${Math.floor(audio.duration/60)}:${String(Math.floor(audio.duration%60)).padStart(2,'0')}` : '0:20'}`; }
    function chooseMusic(index){ state.musicIndex=(index+state.musicTracks.length)%state.musicTracks.length; const track=state.musicTracks[state.musicIndex]; const audio=$('#healthAudio'); audio.src=track.file; $('#playerTitle').textContent=track.name; $('#playerReason').textContent=track.reason; audio.play().then(()=>{state.music=true; $('#playIcon').innerHTML='<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';}).catch(()=>{}); }
    $('#playerPlay').addEventListener('click',()=>{const audio=$('#healthAudio'); if(!audio.src) chooseMusic(state.musicIndex); else if(audio.paused){audio.play().then(()=>{state.music=true; $('#playIcon').innerHTML='<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';});}else{audio.pause();state.music=false;$('#playIcon').innerHTML='<path d="M8 5v14l11-7z"/>';}});
    $('#playerPrev').addEventListener('click',()=>chooseMusic(state.musicIndex-1)); $('#playerNext').addEventListener('click',()=>chooseMusic(state.musicIndex+1));
    $('#healthAudio').addEventListener('timeupdate',updatePlayer); $('#healthAudio').addEventListener('loadedmetadata',updatePlayer); $('#healthAudio').addEventListener('ended',()=>chooseMusic(state.musicIndex+1)); $('#healthAudio').addEventListener('error',()=>toast('Audio could not be loaded. Restart StressMitra and try again.')); 
    function showAuthForm(name) { $$('.auth-tab').forEach(tab=>{const active=tab.dataset.authTab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',active);}); $$('.auth-form').forEach(form=>form.classList.toggle('active',form.dataset.authForm===name)); }
    function activateAccount(payload) { state.session=payload.token; state.account=payload.account || payload.user; state.portal=payload.portal || (state.account.role==='personnel'?'personnel':'welfare'); localStorage.setItem('stressmitra_session',payload.token); const words=payload.account.name.replace(/[^a-zA-Z ]/g,'').trim().split(/\s+/); const initials=words.slice(-2).map(word=>word[0]).join('').toUpperCase() || 'SM'; $('#operatorInitials').textContent=initials; $('#operatorName').textContent=payload.account.name; $('#operatorRole').textContent=`${payload.account.role} · ${payload.account.unit}`; $('#authPortal').classList.remove('open'); $('#siteIntro').style.display='none'; $('#appShell').style.display='grid'; document.body.classList.toggle('welfare-mode', state.portal==='welfare'); toast(`Welcome to StressMitra, ${payload.account.name}.`, 'shield'); loadLiveData(); }
    $$('.auth-tab').forEach(tab=>tab.addEventListener('click',()=>showAuthForm(tab.dataset.authTab)));
    $('#signInForm').addEventListener('submit',async event=>{ event.preventDefault(); const error=$('#signInError'); error.textContent=''; try { const response=await api('/api/auth/login',{method:'POST',body:JSON.stringify({username:$('#signInEmail').value,password:$('#signInPassword').value,portal:state.portal})}); activateAccount(response); } catch (problem) { error.textContent=problem.message || 'Unable to sign in.'; } });
    $('#createAccountForm').addEventListener('submit',async event=>{ event.preventDefault(); const error=$('#createError'); error.textContent=''; try { const response=await api('/api/auth/register',{method:'POST',body:JSON.stringify({username:$('#createEmail').value,full_name:$('#createName').value,unit:$('#createUnit').value,password:$('#createPassword').value})}); activateAccount(response); } catch (problem) { error.textContent=problem.message || 'Unable to create account.'; } });
    async function waitForGoogle(){ for(let i=0;i<60;i++){ if(window.google?.accounts?.id) return true; await new Promise(r=>setTimeout(r,150)); } return false; }
    async function setupGoogleButton(){
      const error=$('#signInError');
      const host=$('#googleSignIn');
      try {
        const ready=await waitForGoogle();
        if(!ready){ throw new Error('Google Identity Services could not load. Check your internet connection and reload the page.'); }
        let clientId=window.GOOGLE_CLIENT_ID||'';
        if(!clientId){ try { const r=await fetch('/api/config',{cache:'no-store'}); const c=await r.json(); clientId=c.googleClientId||''; window.GOOGLE_CLIENT_ID=clientId; } catch(_) {} }
        if(!clientId){ throw new Error('Google sign-in is not configured yet. Add your Google OAuth Web Client ID to config/google-client-id.txt, then restart StressMitra.'); }
        window.google.accounts.id.initialize({
          client_id:clientId,
          ux_mode:'popup',
          callback:async response=>{
            try {
              const payload=await api('/api/auth/google',{method:'POST',body:JSON.stringify({credential:response.credential})});
              activateAccount(payload);
            } catch(e) { error.textContent=e.message||'Google sign-in failed.'; }
          }
        });
        host.innerHTML='';
        window.google.accounts.id.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:320});
      } catch(e) {
        host.innerHTML='<button class="google-btn" type="button" id="googleFallback"><span class="google-g">G</span> Google sign-in unavailable</button>';
        error.textContent=e.message||'Google sign-in failed.';
      }
    }
    setupGoogleButton();
    $('#useDemo').addEventListener('click',()=>{ $('#signInEmail').value='personnel01'; $('#signInPassword').value='demo123'; $('#signInForm').requestSubmit(); });
    $('#forgotPassword').addEventListener('click',()=>modal('Account support','For the SIH prototype, account recovery is handled by the local administrator.', `<div class="modal-section"><strong>Demo account</strong><p>Use the prototype access button for the sample account. In a production deployment, recovery would use the organisation’s verified identity provider and never expose passwords.</p></div>`));
    $('#privacyButton').addEventListener('click',()=>modal('Privacy & safeguards','StressMitra is designed to increase access to support—not to monitor or penalise people.', `<div class="modal-section"><strong>How this prototype handles information</strong><div class="modal-list"><div class="modal-item">Individual journal notes <span>Private</span></div><div class="modal-item">Team wellbeing patterns <span>De-identified</span></div><div class="modal-item">Support alerts <span>Human review</span></div><div class="modal-item">Automated disciplinary action <span>Never</span></div></div></div>`));
    $('#notificationButton').addEventListener('click',()=>modal('Today’s notifications','Three items are ready for your review.', `<div class="modal-section"><div class="modal-list"><div class="modal-item">Bravo recovery window opens at 09:30 <span>New</span></div><div class="modal-item">Two late rotations detected <span>Review</span></div><div class="modal-item">21 optional check-ins pending <span>FYI</span></div></div></div>`));
    $('#alertSettings').addEventListener('click',()=>modal('Alert preferences','Configure who may see welfare prompts and how often reminders appear.', `<div class="modal-section"><strong>Current safety settings</strong><div class="modal-list"><div class="modal-item">Escalation route <span>Welfare officer</span></div><div class="modal-item">Quiet hours <span>22:00–06:00</span></div><div class="modal-item">Alert threshold <span>Human-reviewed</span></div></div></div>`));
    $('#openModelCard').addEventListener('click',()=>{ const m=state.model; const rows=m ? `<div class="modal-item">Model <span>${m.type}</span></div><div class="modal-item">Training data <span>Synthetic demo</span></div><div class="modal-item">Model version <span>${m.version}</span></div><div class="modal-item">Training samples <span>${m.sampleSize || '—'}</span></div>` : `<div class="modal-item">Mode <span>Presentation</span></div><div class="modal-item">Data source <span>Local demo</span></div>`; modal('StressMitra model card','Transparent model information for responsible use. This score is a support prompt, never a diagnosis.', `<div class="modal-section"><strong>Early-risk model overview</strong><p>The logistic-regression model considers sleep, voluntary stress input, workload, recent rotations, recovery time, trend, and support connection. It exposes its strongest drivers for every result.</p><div class="modal-list">${rows}<div class="modal-item">Decision authority <span>Human only</span></div></div></div>`); });

    function renderPersonnel(people){
      const grid=$('#personnelGrid');
      if(!people.length){ grid.innerHTML=''; $('#emptyRoster').style.display='block'; return; }
      grid.innerHTML=people.map(person=>{
        const probability=Number(person.risk_probability||0);
        const status=person.risk_level==='High'?'attention':person.risk_level==='Medium'?'watch':'stable';
        const label=person.risk_level==='High'?'Needs follow-up':person.risk_level==='Medium'?'Watch trend':'Stable wellbeing';
        const score=Math.round(probability*100);
        const safe=v=>String(v??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
        const safeName=safe(person.full_name), safeUnit=safe(person.unit), safeRole=safe(person.role||'Personnel');
        const initials=safeName.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'SM';
        const last=person.last_checkin ? String(person.last_checkin).replace('T',' ').slice(0,16) : 'No check-in yet';
        return `<article class="person-card" data-name="${safeName.toLowerCase()} ${safeUnit.toLowerCase()} ${safeRole.toLowerCase()}" data-status="${status}"><div class="person-top"><div class="mini-avatar">${initials}</div><span class="role-tag">${safeRole}</span></div><h3>${safeName}</h3><span class="unit">${safeUnit}</span><div class="card-score"><div class="score-num">${score}</div><div class="score-copy"><strong>${label}</strong>Current advisory risk signal</div></div><div class="person-meta"><span>Last check-in <b>${last}</b></span><span>Sleep <b>${person.sleep_hours ?? '—'}h</b></span></div><div class="card-actions"><button class="btn small person-detail" data-person-id="${person.id}" data-person="${safeName}">View context</button><button class="btn primary small person-support" data-person="${safeName}">Offer support</button></div></article>`;
      }).join('');
      $('#emptyRoster').style.display='none';
      $('#personnelBadge').textContent=String(people.length);
    }
    async function loadPersonnel(peopleOverride=null){
      try {
        if(peopleOverride){ renderPersonnel(peopleOverride); return; }
        const data=await api('/api/dashboard'); renderPersonnel(data.personnel||[]);
      } catch(e){ console.info('Personnel data unavailable:',e.message); }
    }

    function filterRoster(){ const query=$('#personSearch').value.trim().toLowerCase(), filter=$('#riskFilter').value; let count=0; $$('.person-card').forEach(card=>{ const match=card.dataset.name.includes(query)&&(filter==='all'||card.dataset.status===filter); card.classList.toggle('hidden',!match); if(match)count++; }); $('#emptyRoster').style.display=count?'none':'block'; }
    $('#personSearch').addEventListener('input',filterRoster); $('#riskFilter').addEventListener('change',filterRoster);
    $('.personnel-grid').addEventListener('click',e=>{ const detail=e.target.closest('.person-detail'), support=e.target.closest('.person-support'); if(detail) showPerson(detail.dataset.person); if(support) offerSupport(support.dataset.person); });
    function showPerson(person){ modal(`${person} · support context`, 'A bounded, respectful summary for a private conversation. It is not a diagnosis.', `<div class="modal-section"><strong>What the pattern suggests</strong><p>Recent rest and self-reported load indicate a possible recovery need. Ask open questions and let ${person} choose whether to accept support.</p><div class="modal-list"><div class="modal-item">Suggested opening <span>“How are you holding up?”</span></div><div class="modal-item">Optional support <span>Recovery block</span></div><div class="modal-item">Recommended follow-up <span>Tomorrow</span></div></div><button class="btn primary full" style="margin-top:14px" onclick="window.sentinelOffer('${person}')">Offer a support check-in</button></div>`); }
    function offerSupport(person){ closeModal(); toast(`Private support check-in drafted for ${person}. They can accept, decline, or choose another time.`, 'heart'); }
    window.sentinelOffer=offerSupport;
    $('#exportRoster').addEventListener('click',()=>toast('Support brief prepared with de-identified trends only.','shield'));

    $$('.alert-open').forEach(btn=>btn.addEventListener('click',()=>showPerson(btn.dataset.person)));
    $$('.alert-resolve').forEach(btn=>btn.addEventListener('click',async()=>{ const card=btn.closest('.alert-card'); try { await api(`/api/alerts/${card.dataset.alert}/ack`,{method:'POST'}); } catch { /* The presentation build preserves the local acknowledgement flow. */ } card.style.opacity='.35'; card.style.transform='scale(.985)'; setTimeout(()=>{card.remove(); const n=$$('.alert-card').length; $$('.nav-badge')[1].textContent=n; if(!n)$('#emptyAlerts').style.display='block'; toast('Alert acknowledged. The support action remains human-led.');},180); }));
    $('#sendReminder')?.addEventListener('click',()=>toast('A gentle, optional check-in reminder has been queued for 21 personnel.','heart'));

    const recoOptions=[
      {music:['Low-tempo focus flow','Instrumental textures designed for a calm transition after a high-focus shift.'],place:['Lakeside perimeter walk','A shaded, low-noise route suited to a gentle decompress with no planning overhead.'],yoga:['Shoulder & spine reset','Three accessible, uniform-friendly poses to release desk and equipment tension.']},
      {music:['Evening downshift','Warm ambient rhythm to make the handoff from duty to personal time feel less abrupt.'],place:['Botanical garden loop','A quiet green route with bench stops for an unhurried 20-minute reset.'],yoga:['Desk recovery flow','Neck, wrist and hip mobility that fits between two briefings.']},
      {music:['Clear-head instrumental','Soft piano and slow percussion for an uncluttered end-of-shift mental reset.'],place:['Sunset viewpoint trail','A short, familiar walk with open sightlines and low decision load.'],yoga:['Breath & balance','A calm standing sequence combining paced breathing and gentle balance.']}
    ]; let recoIndex=0;
    function refreshReco(){ recoIndex=(recoIndex+1)%recoOptions.length; const v=recoOptions[recoIndex]; $('#musicTitle').textContent=v.music[0]; $('#musicDesc').textContent=v.music[1]; $('#placeTitle').textContent=v.place[0]; $('#placeDesc').textContent=v.place[1]; $('#yogaTitle').textContent=v.yoga[0]; $('#yogaDesc').textContent=v.yoga[1]; toast('Fresh suggestions are ready, based on your stated preferences.'); }
    $('#refreshReco').addEventListener('click',refreshReco);
    $('#tuneProfile').addEventListener('click',()=>modal('Tune your recovery profile','Choose what feels practical today. These preferences stay in your personal space.', `<div class="modal-section"><strong>Preference signals</strong><div class="modal-list"><div class="modal-item">Available time <span>15–30 min</span></div><div class="modal-item">Preferred environment <span>Outdoors</span></div><div class="modal-item">Audio preference <span>Instrumental</span></div></div><button class="btn primary full" style="margin-top:14px" onclick="window.sentinelTune()">Save preferences</button></div>`));
    window.sentinelTune=()=>{closeModal();toast('Your recovery preferences have been updated.');refreshReco()};
    $$('.reco-action').forEach(btn=>btn.addEventListener('click',()=>{ const type=btn.dataset.type; if(type==='music'){ navigate('recommendations'); $('#musicPlayer').scrollIntoView({behavior:'smooth',block:'center'}); chooseMusic(state.musicIndex); btn.textContent='Player open'; toast('Playing the track matched to the current wellbeing state.');} if(type==='place')modal('Lakeside perimeter walk','A suggested low-noise reset route.', `<div class="modal-section"><div class="modal-list"><div class="modal-item">Distance <span>1.4 km</span></div><div class="modal-item">Estimated time <span>22 min</span></div><div class="modal-item">Best moment <span>After 18:30</span></div></div><button class="btn primary full" style="margin-top:14px" onclick="window.sentinelRoute()">Save as my reset</button></div>`); if(type==='yoga')modal('6-minute shoulder & spine reset','Move gently; stop if anything hurts or feels unsuitable.', `<div class="modal-section"><div class="modal-list"><div class="modal-item">1. Shoulder rolls <span>90 sec</span></div><div class="modal-item">2. Standing side reach <span>2 min</span></div><div class="modal-item">3. Forward fold & breathe <span>2.5 min</span></div></div><button class="btn primary full" style="margin-top:14px" onclick="window.sentinelYoga()">Start gentle timer</button></div>`); }));
    window.sentinelRoute=()=>{closeModal();toast('Your decompression walk is saved for 18:30.');}; window.sentinelYoga=()=>{closeModal();toast('Gentle movement timer started. Take it at your pace.','heart');};

    function updateRange(input, output){ output.textContent=`${input.value} / 10`; }
    $('#energy').addEventListener('input',e=>updateRange(e.target,$('#energyValue'))); $('#load').addEventListener('input',e=>updateRange(e.target,$('#loadValue')));
    $('#supportChoices').addEventListener('click',e=>{const b=e.target.closest('.choice');if(!b)return; $$('.choice',$('#supportChoices')).forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.choice=b.dataset.choice;});
    const rangeSpecs={dutyHours:['dutyHoursValue',v=>`${v} h`],sleepHours:['sleepHoursValue',v=>`${v} h`],energy:['energyValue',v=>`${v} / 10`],load:['loadValue',v=>`${v} / 10`],stressLevel:['stressLevelValue',v=>`${v} / 10`],moodLevel:['moodLevelValue',v=>`${v} / 10`],focusLevel:['focusLevelValue',v=>`${v} / 10`],nightShifts:['nightShiftsValue',v=>`${v}`],recoveryDays:['recoveryDaysValue',v=>`${v}`],socialSupport:['socialSupportValue',v=>`${v} / 10`]};
    Object.entries(rangeSpecs).forEach(([id,[out,fmt]])=>$('#'+id)?.addEventListener('input',e=>$('#'+out).textContent=fmt(e.target.value)));
    $('#healthReport')?.addEventListener('change',e=>{const f=e.target.files?.[0]; $('#reportFile').textContent=f ? `${f.name} · ${(f.size/1024/1024).toFixed(2)} MB` : 'No report selected.'; if(f && (!(f.name||'').toLowerCase().endsWith('.pdf') || f.size>8*1024*1024)){toast('Please choose a PDF smaller than 8 MB.'); e.target.value=''; $('#reportFile').textContent='No report selected.';}});
    async function uploadHealthReport(){ const f=$('#healthReport')?.files?.[0]; if(!f)return null; if(f.type!=='application/pdf'||f.size>8*1024*1024) throw new Error('Health report must be a PDF smaller than 8 MB.'); const buf=await f.arrayBuffer(); const r=await fetch('/api/health-report',{method:'POST',headers:{'Content-Type':'application/pdf','X-Filename':encodeURIComponent(f.name),'Authorization':`Bearer ${state.session}`},body:buf}); const data=await r.json(); if(!r.ok) throw new Error(data.error||'Health report upload failed.'); return data; }
    const puzzleSymbols=['◐','✦','☁','☀','◈','✿','♢','≈'];
    let puzzleState={cards:[],first:null,lock:false,moves:0,pairs:0};
    function newPuzzle(){
      const cards=[...puzzleSymbols,...puzzleSymbols].sort(()=>Math.random()-.5);
      puzzleState={cards,first:null,lock:false,moves:0,pairs:0};
      const board=$('#puzzleBoard'); if(!board)return;
      $('#puzzleMoves').textContent='0'; $('#puzzlePairs').textContent='0/8';
      board.innerHTML=cards.map((sym,i)=>`<button type="button" class="puzzle-tile" data-index="${i}" aria-label="Hidden puzzle tile"><span aria-hidden="true">?</span></button>`).join('');
    }
    window.newPuzzle=newPuzzle;
    $('#puzzleBoard')?.addEventListener('click',e=>{
      const tile=e.target.closest('.puzzle-tile');
      if(!tile||puzzleState.lock||tile.classList.contains('flipped')||tile.classList.contains('matched'))return;
      const i=Number(tile.dataset.index); if(!Number.isInteger(i))return;
      tile.textContent=puzzleState.cards[i]; tile.classList.add('flipped');
      if(puzzleState.first===null){puzzleState.first=i;return;}
      const first=puzzleState.first; puzzleState.moves++; $('#puzzleMoves').textContent=puzzleState.moves;
      if(puzzleState.cards[first]===puzzleState.cards[i]){
        [first,i].forEach(idx=>document.querySelector(`.puzzle-tile[data-index="${idx}"]`)?.classList.add('matched'));
        puzzleState.pairs++; $('#puzzlePairs').textContent=`${puzzleState.pairs}/8`; puzzleState.first=null;
        if(puzzleState.pairs===8)toast(`Puzzle complete in ${puzzleState.moves} moves. Nice reset.`,'heart');
      } else {
        puzzleState.lock=true;
        setTimeout(()=>{[first,i].forEach(idx=>{const x=document.querySelector(`.puzzle-tile[data-index="${idx}"]`);if(x){x.classList.remove('flipped');x.innerHTML='<span aria-hidden="true">?</span>';}});puzzleState.first=null;puzzleState.lock=false;},700);
      }
    });
    $('#newPuzzle')?.addEventListener('click',newPuzzle);
    newPuzzle();
    $('#checkinForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const submit=e.submitter||$('#checkinForm button[type="submit"]'); if(submit){submit.disabled=true;submit.textContent='Saving check-in…';}
      const dutyHours=+$('#dutyHours').value, sleepHours=+$('#sleepHours').value, energy=+$('#energy').value, manageability=+$('#load').value, stressLevel=+$('#stressLevel').value, mood=+$('#moodLevel').value, focus=+$('#focusLevel').value, nightShifts=+$('#nightShifts').value, recoveryDays=+$('#recoveryDays').value, socialSupport=+$('#socialSupport').value;
      const fatigue=Math.max(0,Math.min(10,10-energy)); const recoveryGap=Math.max(0,Math.min(30,7-recoveryDays));
      const workload=Math.max(1,Math.min(10,Math.round((manageability+dutyHours/1.6)/2)));
      const f=$('#healthReport')?.files?.[0];
      if(!state.session){ if(submit){submit.disabled=false;submit.textContent='Submit check-in';} openAuth('signin'); $('#signInError').textContent='Please sign in before submitting your private check-in.'; return; }
      if(f && (!(f.name||'').toLowerCase().endsWith('.pdf') || f.size>8*1024*1024)){toast('Please choose a PDF smaller than 8 MB.'); if(submit){submit.disabled=false;submit.textContent='Submit check-in';} return;}
      try{
        const fd=new FormData();
        fd.append('duty_hours',dutyHours); fd.append('sleep_hours',sleepHours); fd.append('fatigue',fatigue); fd.append('mood',mood); fd.append('focus',focus); fd.append('social_support',socialSupport); fd.append('recovery_gap',recoveryGap); fd.append('workload',workload);
        fd.append('night_shifts_7d',nightShifts); fd.append('recovery_days_7d',recoveryDays); fd.append('supportNeed',state.choice); fd.append('note',$('#note').value);
        fd.append('duty_location',$('#dutyLocation')?.value||''); fd.append('last_trip',$('#lastTrip')?.value||'');
        if(f) fd.append('health_report',f,f.name);
        const response=await fetch('/api/checkins-with-report',{method:'POST',headers:{'Authorization':`Bearer ${state.session}`},body:fd});
        const data=await response.json().catch(()=>({}));
        if(response.status===401){throw new Error('AUTH_EXPIRED');}
        if(!response.ok) throw new Error(data.detail||data.error||`Check-in failed (${response.status})`);
        const riskScore=data.prediction?.riskScore ?? Math.round(Number(data.risk_probability||0)*100); const wellness=100-riskScore;
        if(data.recommendations){setMusicForWellbeing(wellness);$('#placeTitle').textContent=data.recommendations.place;$('#yogaTitle').textContent=data.recommendations.yoga;$('#targetDuty').textContent=data.recommendations.targetDutyHours;$('#targetSleep').textContent=data.recommendations.targetSleepHours;$('#targetWorkload').textContent=data.recommendations.targetWorkload;
          const spots=data.recommendations.vacationSpots||[]; const vList=$('#vacationList');
          if(vList){ vList.innerHTML = spots.map(s=>`<li><b>${s.name}</b>${s.blurb}</li>`).join(''); }
          if(spots.length){ $('#vacationTitle').textContent = spots[0].name; $('#vacationDesc').textContent = spots[0].blurb; }
          else { $('#vacationTitle').textContent = 'Add your duty location for tailored ideas'; $('#vacationDesc').textContent = "Suggested family getaways will appear here based on where you're posted and where you last went."; }
          $('#vacationNote').textContent = data.recommendations.vacationNote || '';
          const breathing=data.recommendations.breathing;
          if(breathing?.primary){ $('#breathingTitle').textContent=breathing.primary.name; $('#breathingDesc').textContent=breathing.primary.steps;
            const alts=(breathing.alternates||[]).map(a=>a.name).join(' · ');
            $('#breathingAlt').textContent = alts ? `Also try: ${alts}` : 'More options appear after your next check-in';
          }
        }
        toast(data.report?`Check-in saved and PDF report received for authorised review.`:`Check-in saved. Your advisory support result is ready.`,'heart');
        $('#myScore').textContent=wellness; const ring=$('.ring'); if(ring)ring.style.background=`conic-gradient(var(--teal) 0deg ${wellness*3.6}deg,rgba(219,245,240,.1) ${wellness*3.6}deg)`;
        $('#note').value=''; if($('#healthReport'))$('#healthReport').value=''; $('#reportFile').textContent='No report selected.'; navigate('overview');
      }catch(problem){
        if(problem.message==='AUTH_EXPIRED'){state.session=null;state.account=null;localStorage.removeItem('stressmitra_session');openAuth('signin');$('#signInError').textContent='Your session expired. Please sign in again to submit this private check-in.';}
        else toast(problem.message||'Could not save the check-in. Please try again.');
      }finally{if(submit){submit.disabled=false;submit.textContent='Submit check-in';}}
    });
    $('#skipCheckin').addEventListener('click',()=>{toast('Private draft saved on this device. You can return whenever you are ready.');});
    $$('.support-link').forEach(btn=>btn.addEventListener('click',()=>toast(`${btn.dataset.support} request started. In a real deployment this connects to the approved support channel.`, 'heart')));
    (async()=>{ if(!state.session) return; try { const session=await api('/api/auth/me'); state.account=session.user; const words=session.user.full_name.replace(/[^a-zA-Z ]/g,'').trim().split(/\s+/); const initials=words.slice(-2).map(word=>word[0]).join('').toUpperCase() || 'SM'; $('#operatorInitials').textContent=initials; $('#operatorName').textContent=session.user.full_name; $('#operatorRole').textContent=`${session.user.role} · ${session.user.unit}`; $('#siteIntro').style.display='none'; state.portal=session.user.role==='personnel'?'personnel':'welfare'; document.body.classList.toggle('welfare-mode', state.portal==='welfare'); $('#appShell').style.display='grid'; loadLiveData(); } catch { state.session=null; localStorage.removeItem('stressmitra_session'); } })();
    setMusicForWellbeing(31);
  

    async function searchSpotify(category='Calm'){
      const box=$('#spotifyResults');
      if(!box) return;
      box.innerHTML='<div class="empty">Searching Spotify…</div>';
      try{
        const data=await api('/api/spotify/search?category='+encodeURIComponent(category));
        const tracks=data.tracks||[];
        if(!tracks.length){ box.innerHTML='<div class="empty">No tracks found for this category.</div>'; return; }
        box.innerHTML=tracks.map(t=>`<div class="spotify-track"><div style="min-width:0"><strong>${escHtml(t.name)}</strong><small>${escHtml(t.artist)} · ${escHtml(t.album||'')}</small></div>${t.url?`<a class="spotify-open" href="${t.url}" target="_blank" rel="noopener noreferrer">Open ↗</a>`:''}</div>`).join('');
      }catch(err){
        box.innerHTML=`<div class="empty">${escHtml(err.message||'Spotify search is unavailable.')}</div>`;
      }
    }
    $$('.spotify-chip').forEach(btn=>btn.addEventListener('click',()=>{
      $$('.spotify-chip').forEach(b=>b.classList.toggle('active',b===btn));
      searchSpotify(btn.dataset.spotifyCategory);
    }));
