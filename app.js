
let mapAnalysisStartedAt=0;
let mapAnalysisTimer=null;
function startMapAnalysisTimer(){
  mapAnalysisStartedAt=performance.now();
  if(mapAnalysisTimer) clearInterval(mapAnalysisTimer);
  mapAnalysisTimer=setInterval(()=>{
    const sec=(performance.now()-mapAnalysisStartedAt)/1000;
    const el=$('mapTimingNote');
    if(el) el.textContent=`Среднее время анализа карты — 15 секунд. Прошло: ${sec.toFixed(1)} с`;
  },200);
}
function stopMapAnalysisTimer(){
  if(mapAnalysisTimer){clearInterval(mapAnalysisTimer);mapAnalysisTimer=null;}
  const sec=mapAnalysisStartedAt?((performance.now()-mapAnalysisStartedAt)/1000):0;
  const el=$('mapTimingNote');
  if(el) el.textContent=`Среднее время анализа карты — 15 секунд. Последний анализ: ${sec.toFixed(1)} с`;
}


function syncFordCards(data){
  normalizeFordData(data);
  const count=String(data?.ford_count ?? 0);
  const list=(data?.ford_labels||[]).join(', ');

  // Use visible labels to find the actual cards, independent of legacy element ids.
  const all=[...document.querySelectorAll('div,span,p')];
  for(const el of all){
    const t=(el.textContent||'').trim();
    if(t==='Броды'){
      const card=el.parentElement;
      if(card){
        const vals=[...card.querySelectorAll('div,span,p')].filter(x=>x!==el);
        const target=vals.find(x=>/^\d+$/.test((x.textContent||'').trim()));
        if(target) target.textContent=count;
      }
    }
    if(t.startsWith('Броды на км:')){
      el.textContent='Броды на км: '+(list||'—');
    }
  }
}


function normalizeFordData(data){
  if(!data || typeof data!=='object') return data;

  let raw=[];
  if(Array.isArray(data._raw_ford_kms)) raw=data._raw_ford_kms;
  else if(Array.isArray(data.ford_kms)) raw=data.ford_kms;
  else if(Array.isArray(data.fords)) raw=data.fords.map(f=>Number(f?.km)).filter(Number.isFinite);

  raw=raw.map(Number).filter(Number.isFinite).filter(km=>km>=0.2).sort((a,b)=>a-b);
  const groups=[];
  let cur=null;
  for(const km of raw){
    if(!cur || km-cur.start>0.400001){
      if(cur) groups.push(cur);
      cur={start:km,end:km};
    }else{
      cur.end=km;
    }
  }
  if(cur) groups.push(cur);

  const starts=groups.map(g=>Number(g.start.toFixed(1)));
  data._raw_ford_kms=raw;
  data.ford_kms=starts;
  data.ford_count=starts.length;
  data.ford_labels=starts.map(x=>x.toFixed(1));

  // Also overwrite common aliases so no old renderer can display raw crossings.
  if('fordCount' in data) data.fordCount=starts.length;
  if('fords_count' in data) data.fords_count=starts.length;
  if('ford_points' in data) data.ford_points=starts;
  if('ford_crossings' in data) data.ford_crossings=starts;
  return data;
}


const state = {
  track: [],
  dist: 0,
  gain: 0,
  loss: 0,
  roster: [],
  shots: [],
  raceReferences: {
    strength: null,
    fastTrail: null,
    flatRace: null
  },
  raceModel: null,
  raceForecast: null,
  forecastMode: null,
  mapAnalysis: null,
  mapAnalysisReadyForCurrentGpx: false,
  syntheticFlatRoute: false,
  deferredPrompt: null
};

const $ = id => document.getElementById(id);

function setActionState(id,state){
  const b=$(id);
  if(!b) return;
  b.classList.remove('action-idle','action-ready','action-working','action-success','action-error');
  b.classList.add('action-'+state);
}


function resetOwnItraForNewGPX(){
  const piEl=getAthletePiElement ? getAthletePiElement() : ($('athletePi')||$('itraPi')||$('pi'));
  if(piEl) piEl.value='0';

  const profileEl=$('ownItraProfile');
  if(profileEl) profileEl.value='';

  const ownStatus=$('ownItraLookupStatus');
  if(ownStatus) ownStatus.textContent='ITRA не загружен. PI = 0.';

  const ownBtn=$('ownItraLookupBtn');
  if(ownBtn){
    ownBtn.disabled=false;
    setActionState('ownItraLookupBtn','ready');
  }

  try{ localStorage.removeItem('trailOwnItraProfile'); }catch(e){}
}


function clearMapAnalysisOnPageStart(){
  try{ localStorage.removeItem('trailMapAnalysis'); }catch(e){}

  const box=$('mapAnalysisResults');
  if(box) box.style.display='none';

  ['coverageMetric','wetlandMetric','waterCrossMetric','trailMetric','dirtMetric','pavedMetric','fordCountMetric']
    .forEach(id=>{
      const el=$(id);
      if(el) el.textContent='—';
    });

  const fordList=$('fordKmList');
  if(fordList) fordList.textContent='Броды: —';
  const bridgeList=$('bridgeFordKmList');
  if(bridgeList) bridgeList.textContent='По мосту: —';

  const note=$('mapAnalysisNote');
  if(note) note.textContent='—';

  const canvas=$('surfaceStripCanvas');
  if(canvas){
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  const p=$('mapAnalyzeProgress');
  if(p){ p.value=0; p.style.display='none'; }

  const s=$('mapAnalyzeStatus');
  if(s) s.textContent='Сначала обработайте GPX и запустите анализ карты.';
}

function resetMapAnalysisForNewGPX(){
  if($('movingPaceMetric')) $('movingPaceMetric').textContent='— мин/км';
  if($('elapsedPaceMetric')) $('elapsedPaceMetric').textContent='— мин/км';
  if($('movingTimeMetric')) $('movingTimeMetric').textContent='—';
  if($('elapsedTimeMetric')) $('elapsedTimeMetric').textContent='—';
  // A new GPX invalidates all surface information from the previous route.
  try{ localStorage.removeItem('trailMapAnalysis'); }catch(e){}

  const box=$('mapAnalysisResults');
  if(box) box.style.display='none';

  const fields=[
    'coverageMetric','wetlandMetric','waterCrossMetric',
    'trailMetric','dirtMetric','pavedMetric','fordCountMetric'
  ];
  fields.forEach(id=>{
    const el=$(id);
    if(el) el.textContent='—';
  });

  const fordList=$('fordKmList'); if(fordList) fordList.textContent='Броды: —';
  const bridgeList=$('bridgeFordKmList');
  if(bridgeList) bridgeList.textContent='По мосту: —';
  const note=$('mapAnalysisNote');
  if(note) note.textContent='—';

  const canvas=$('surfaceStripCanvas');
  if(canvas){
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  const progress=$('mapAnalyzeProgress');
  if(progress){
    progress.value=0;
    progress.style.display='none';
  }

  const status=$('mapAnalyzeStatus');
  if(status) status.textContent='Сначала обработайте выбранный GPX.';

  const btn=$('mapAnalyzeBtn');
  if(btn){
    btn.disabled=true;
    setActionState('mapAnalyzeBtn','idle');
  }
}

function syncMapAnalyzeButton(){
  const btn=$('mapAnalyzeBtn');
  if(!btn) return;
  const ready=!!(state.track && state.track.length>1 && state.dist>0);
  const online=navigator.onLine!==false;

  if(state.syntheticFlatRoute){
    btn.disabled=true;
    setActionState('mapAnalyzeBtn','success');
    if($('mapAnalyzeStatus')) $('mapAnalyzeStatus').textContent='✓ Ровный асфальт задан вручную: анализ карты не требуется.';
    return;
  }

  btn.disabled=!(ready&&online);

  if(!online){
    setActionState('mapAnalyzeBtn','idle');
    const cached=state.mapAnalysis || (()=>{try{return JSON.parse(localStorage.getItem('trailMapAnalysis')||'null')}catch(e){return null}})();
    if($('mapAnalyzeStatus')){
      $('mapAnalyzeStatus').textContent=cached
        ? 'Офлайн: новый анализ карты недоступен. Сохранённый анализ можно использовать в прогнозе.'
        : 'Офлайн: анализ карты требует интернет. Обычный прогноз по GPX доступен.';
    }
    return;
  }

  if(ready){
    setActionState('mapAnalyzeBtn','ready');
    if($('mapAnalyzeStatus') && !$('mapAnalyzeStatus').textContent.includes('✓')){
      $('mapAnalyzeStatus').textContent='GPX готов. Можно запускать анализ карты.';
    }
  }else{
    setActionState('mapAnalyzeBtn','idle');
  }
}

function restoreMapInfoNote(){
  const n=$('mapTimingNote');
  if(n){
    n.style.display='block';
  }
}

function updateOfflineUi(){
  const el=$('offlineState');
  const online=navigator.onLine!==false;
  if(el){
    el.textContent=online?'ONLINE / OFFLINE READY':'OFFLINE';
    el.className='app-offline-state '+(online?'online':'offline');
  }
  syncMapAnalyzeButton(); restoreMapInfoNote();
}

window.addEventListener('online',updateOfflineUi);
window.addEventListener('offline',updateOfflineUi);
setTimeout(updateOfflineUi,0);




document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    $(btn.dataset.tab).classList.add('active');
  });
});

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  state.deferredPrompt = e;
  $('installBtn').hidden = false;
});
$('installBtn').addEventListener('click', async () => {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  await state.deferredPrompt.userChoice;
  state.deferredPrompt = null;
  $('installBtn').hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async ()=>{
    try{
      const reg=await navigator.serviceWorker.register('./sw.js?v=230', {updateViaCache:'none'});
      await reg.update();
      let refreshing=false;
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(refreshing) return;
        refreshing=true;
        location.reload();
      });
    }catch(e){}
  });
}

function haversine(a,b,c,d){
  const R=6371000, rad=x=>x*Math.PI/180;
  const p1=rad(a), p2=rad(c), dp=rad(c-a), dl=rad(d-b);
  const q=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}

function median(arr){
  const a=arr.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(!a.length) return NaN;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}

function smoothElevations(points){
  // Median smoothing over a 5-point window to suppress GPS altitude spikes.
  return points.map((p,i)=>{
    const vals=[];
    for(let j=Math.max(0,i-2);j<=Math.min(points.length-1,i+2);j++){
      if(Number.isFinite(points[j].ele)) vals.push(points[j].ele);
    }
    return {...p, ele:median(vals)};
  });
}

function parseGPX(text){
  const xml=new DOMParser().parseFromString(text,'application/xml');
  if(xml.querySelector('parsererror')) throw new Error('Некорректный XML');
  let pts=[...xml.getElementsByTagName('trkpt')];
  if(!pts.length) pts=[...xml.getElementsByTagNameNS('*','trkpt')];
  if(!pts.length) pts=[...xml.getElementsByTagName('rtept')];
  if(!pts.length) pts=[...xml.getElementsByTagNameNS('*','rtept')];
  if(pts.length<2) throw new Error('Не найдены точки трека');

  let raw=[],total=0,prev=null;
  pts.forEach(p=>{
    const lat=parseFloat(p.getAttribute('lat')),lon=parseFloat(p.getAttribute('lon'));
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return;
    let ee=p.getElementsByTagName('ele')[0]||p.getElementsByTagNameNS('*','ele')[0];
    const ele=ee?parseFloat(ee.textContent):NaN;

    if(prev){
      const step=haversine(prev.lat,prev.lon,lat,lon);
      if(Number.isFinite(step)&&step<5000) total+=step;
    }
    raw.push({km:total/1000,lat,lon,ele});
    prev={lat,lon};
  });

  const out=smoothElevations(raw);
  state.hasElevation=raw.filter(p=>Number.isFinite(p.ele)).length>=2;

  // Count ascent/descent only after a 3 m threshold to avoid tiny GPS noise.
  let gain=0,loss=0,lastAccepted=null;
  for(const p of out){
    if(!Number.isFinite(p.ele)) continue;
    if(lastAccepted===null){
      lastAccepted=p.ele;
      continue;
    }
    const de=p.ele-lastAccepted;
    if(Math.abs(de)>=3){
      if(de>0) gain+=de; else loss+=-de;
      lastAccepted=p.ele;
    }
  }

  state.track=out;
  setTimeout(()=>{
    try{drawFordScheme();renderFordMap();}catch(e){}
  },120);
  document.getElementById('mishaStartSendoff')?.classList.remove('show');
  document.getElementById('mishaFinishWelcome')?.classList.remove('show');
  // v0.97: a new GPX must never leave the previous route/map analysis on screen.
  state.mapAnalysis=null;
  if(typeof fordLeafletMap!=='undefined' && fordLeafletMap){
    try{fordLeafletMap.remove()}catch(e){}
    fordLeafletMap=null;
  }
  if(typeof simFordLeafletMap!=='undefined' && simFordLeafletMap){
    try{simFordLeafletMap.remove()}catch(e){}
    simFordLeafletMap=null;
  }
  // Preserve original GPX timestamps for moving/elapsed time.
  const _gpxTimeNodes=[...xml.querySelectorAll('trkpt')];
  state.track.forEach((p,i)=>{
    const tn=_gpxTimeNodes[i]?.querySelector('time');
    p.time=tn ? tn.textContent.trim() : null;
  });
state.dist=total/1000;state.gain=gain;state.loss=loss;
  syncMapAnalyzeButton(); restoreMapInfoNote();
  $('distMetric').textContent=state.dist.toFixed(1)+' км';
  $('gainMetric').textContent=state.hasElevation ? Math.round(gain)+' м' : 'нет данных';
  $('lossMetric').textContent=state.hasElevation ? Math.round(loss)+' м' : 'нет данных';
  updateItraDifficulty();
  updateTrailDifficulty();
  drawTrackProfiles();
  updateTraversalTimes();
  updateRaceForecastAvailability();
  // Repaint route even before OSM analysis: the red GPX line must always be visible.
  setTimeout(()=>{
    try{ renderSimFordMap(); }catch(e){ console.warn('simulation map redraw',e); }
  },120);
}
function buildSyntheticFlatAsphaltRoute(km,gain){
  const d=Math.max(0.1,Math.min(600,Number(km)||0));
  const totalGain=Math.max(0,Math.min(50000,Number(gain)||0));
  const step=Math.max(0.1,Math.min(1,d/400));
  const count=Math.max(2,Math.ceil(d/step)+1);
  const pts=[];
  const samples=[];

  // Smooth rolling asphalt profile whose total ascent is approximately totalGain.
  // gain=0 stays perfectly flat.
  const waves=totalGain>0 ? Math.max(1,Math.round(d/20)) : 0;
  const amp=waves>0 ? totalGain/(2*waves) : 0;

  for(let i=0;i<count;i++){
    const x=i===count-1 ? d : Math.min(d,i*step);
    const phase=d>0 ? x/d : 0;
    const ele=waves>0 ? 100 + amp*(1-Math.cos(phase*Math.PI*2*waves)) : 100;
    pts.push({
      km:x,
      lat:55.75 + x*0.00001,
      lon:37.60 + x*0.00001,
      ele,
      time:null
    });
    samples.push({
      km:x,
      lat:55.75 + x*0.00001,
      lon:37.60 + x*0.00001,
      ele,
      cls:'paved'
    });
  }

  return {dist:d,gain:totalGain,track:pts,samples};
}

function activateFlatAsphaltRoute(){
  const raw=Number($('flatRouteKm')?.value);
  const rawGain=Number($('flatRouteGain')?.value||0);
  if(!Number.isFinite(raw) || raw<0.1 || raw>600){
    if($('flatRouteStatus')) $('flatRouteStatus').textContent='✕ Введите дистанцию от 0.1 до 600 км.';
    return;
  }
  if(!Number.isFinite(rawGain) || rawGain<0 || rawGain>50000){
    if($('flatRouteStatus')) $('flatRouteStatus').textContent='✕ Введите набор высоты от 0 до 50000 м.';
    return;
  }

  if(typeof clearSimulationTrackChoice==='function') clearSimulationTrackChoice();
  try{ document.getElementById('simReset')?.click(); }catch(_e){}
  abortMapAnalysisForNewGpx();
  invalidateRaceForecast();

  selectedGPXFile=null;
  if($('gpxFile')) $('gpxFile').value='';

  const synthetic=buildSyntheticFlatAsphaltRoute(raw,rawGain);
  state.track=synthetic.track;
  state.dist=synthetic.dist;
  state.gain=synthetic.gain;
  state.loss=synthetic.gain;
  state.hasElevation=true;
  state.syntheticFlatRoute=true;

  // Treat the manual route as a fully classified flat asphalt track.
  state.mapAnalysis={
    synthetic:true,
    samples:synthetic.samples,
    fordKms:[],
    fordCount:0,
    bridgeKms:[],
    confirmedFordKms:[],
    likelyFordKms:[],
    summary:{coverage:100,wetland:0,water:0,trail:0,dirt:0,paved:100}
  };
  state.mapAnalysisReadyForCurrentGpx=true;

  if($('gpxName')) $('gpxName').innerHTML='<span class="file-check selected">✓</span> Ровный асфальтовый трек';
  if($('gpxStatus')) $('gpxStatus').textContent=`✓ Создан асфальтовый трек: ${state.dist.toFixed(1)} км · набор ${Math.round(state.gain)} м`;
  if($('flatRouteStatus')) $('flatRouteStatus').textContent=`✓ Активен асфальтовый трек ${state.dist.toFixed(1)} км · набор ${Math.round(state.gain)} м без GPX.`;
  if($('flatRouteBtn')){
    $('flatRouteBtn').classList.add('flat-route-active');
    $('flatRouteBtn').textContent='✓ Асфальтовый трек активен';
  }
  if($('gpxLoadBtn')){
    $('gpxLoadBtn').disabled=true;
    $('gpxLoadBtn').textContent='Загрузить и обработать GPX';
    setActionState('gpxLoadBtn','idle');
  }

  if($('distMetric')) $('distMetric').textContent=state.dist.toFixed(1)+' км';
  if($('gainMetric')) $('gainMetric').textContent=Math.round(state.gain)+' м';
  if($('lossMetric')) $('lossMetric').textContent=Math.round(state.loss)+' м';
  if($('movingTimeMetric')) $('movingTimeMetric').textContent='—';
  if($('movingPaceMetric')) $('movingPaceMetric').textContent='— мин/км';
  if($('elapsedTimeMetric')) $('elapsedTimeMetric').textContent='—';
  if($('elapsedPaceMetric')) $('elapsedPaceMetric').textContent='— мин/км';

  // No internet map analysis is necessary for a manually declared flat asphalt course.
  if($('mapAnalyzeBtn')){
    $('mapAnalyzeBtn').disabled=true;
    setActionState('mapAnalyzeBtn','success');
  }
  if($('mapAnalyzeStatus')) $('mapAnalyzeStatus').textContent='✓ Ровный асфальт задан вручную: анализ карты не требуется.';

  // Populate map-analysis metrics so "Прогноз с анализом GPX" can use the same flat route.
  if($('mapAnalysisResults')) $('mapAnalysisResults').style.display='block';
  if($('coverageMetric')) $('coverageMetric').textContent='100%';
  if($('wetlandMetric')) $('wetlandMetric').textContent='0.0%';
  if($('waterCrossMetric')) $('waterCrossMetric').textContent='0.0%';
  if($('trailMetric')) $('trailMetric').textContent='0.0%';
  if($('dirtMetric')) $('dirtMetric').textContent='0.0%';
  if($('pavedMetric')) $('pavedMetric').textContent='100.0%';
  if($('fordCountMetric')) $('fordCountMetric').textContent='0';
  if($('fordKmList')) $('fordKmList').textContent='Броды: не обнаружены';
  if($('bridgeFordKmList')) $('bridgeFordKmList').textContent='По мосту: не обнаружено';
  if($('mapAnalysisNote')) $('mapAnalysisNote').textContent=`Ручной режим: 100% асфальт, набор ${Math.round(state.gain)} м, без грунта, троп, воды и бродов.`;

  updateItraDifficulty();
  updateTrailDifficulty();
  drawTrackProfiles();
  updateRaceForecastAvailability();
  applyForecastModeColors();
  updateFinalCalcAvailability();
  resetOwnItraForNewGPX();

  try{ renderSimFordMap(); }catch(e){}
}

function readFileIOS(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsText(file,'UTF-8');
  });
}
let selectedGPXFile=null;
let mapAnalysisRunId=0;
let currentMapAnalysisFetchController=null;

function abortMapAnalysisForNewGpx(){
  // Invalidate the old analysis result immediately.
  mapAnalysisRunId++;

  // Abort the currently active network request right now instead of waiting
  // for its per-source timeout.
  try{
    if(currentMapAnalysisFetchController){
      currentMapAnalysisFetchController.abort();
    }
  }catch(e){}
  currentMapAnalysisFetchController=null;

  stopMapAnalysisTimer();

  const p=$('mapAnalyzeProgress');
  if(p){ p.value=0; p.style.display='none'; }

  const running=$('mapAnalyzeRunningCard');
  if(running) running.style.display='none';

  const retry=$('mapAnalyzeRetryText');
  if(retry) retry.textContent='';

  const btn=$('mapAnalyzeBtn');
  if(btn){
    btn.disabled=true;
    setActionState('mapAnalyzeBtn','idle');
  }

  const status=$('mapAnalyzeStatus');
  if(status) status.textContent='⏹ Анализ карты остановлен: выбран новый GPX.';
}


$('basePace').addEventListener('change',()=>{ if(state.track&&state.track.length) drawTrackProfiles(); });
window.addEventListener('resize',()=>{ if(state.track&&state.track.length) drawTrackProfiles(); });

function handleGpxFileSelected(e){
  state.syntheticFlatRoute=false;
  if($('flatRouteBtn')){
    $('flatRouteBtn').classList.remove('flat-route-active');
    $('flatRouteBtn').textContent='Асфальтовый трек';
  }
  if($('flatRouteStatus')) $('flatRouteStatus').textContent='Создаёт асфальтовый маршрут без GPX: 0.1–600 км, набор 0–50000 м.';
  // A new GPX invalidates the previous simulation source and run.
  if(typeof clearSimulationTrackChoice==='function') clearSimulationTrackChoice();
  try{ document.getElementById('simReset')?.click(); }catch(_e){}
  abortMapAnalysisForNewGpx();
  invalidateRaceForecast();
  state.hasElevation=false;
  state.raceForecast=null;
  if($('raceForecastTable')) $('raceForecastTable').querySelector('tbody').innerHTML='';
  if($('raceForecastTime')) $('raceForecastTime').textContent='—';
  if($('raceForecastDistance')) $('raceForecastDistance').textContent=`${Number(state.dist||0).toFixed(Number(state.dist||0)%1?1:0)} км`;
  if($('raceForecastPace')) $('raceForecastPace').textContent='—';
  if($('raceForecastRange')) $('raceForecastRange').textContent='—';

  clearResultForecast();
  selectedGPXFile=(e?.target?.files&&e.target.files[0]) || (e?.currentTarget?.files&&e.currentTarget.files[0]) || null;
  state.mapAnalysis=null;
  state.mapAnalysisReadyForCurrentGpx=false;
  resetMapAnalysisForNewGPX();
  applyForecastModeColors();
  resetOwnItraForNewGPX();
  if(!selectedGPXFile){
    $('gpxName').innerHTML='<span id="gpxCheck" class="file-check">○</span> Файл не выбран';
    $('gpxStatus').textContent='1. Выберите файл GPX.';
    $('gpxLoadBtn').disabled=true; $('gpxLoadBtn').textContent='Загрузить и обработать GPX'; setActionState('gpxLoadBtn','idle');
    return;
  }
  $('gpxName').innerHTML='<span id="gpxCheck" class="file-check selected">✓</span> Выбран: '+selectedGPXFile.name;
  
  $('gpxStatus').textContent='⏳ Файл выбран. Загружаю и обрабатываю автоматически…';
  $('gpxLoadBtn').disabled=false;
  $('gpxLoadBtn').textContent='⏳ Загрузка GPX…';
  setActionState('gpxLoadBtn','working');
  setTimeout(()=>$('gpxLoadBtn').click(),0);
}

let __lastGpxSelectionSig='';
function dispatchGpxSelection(e){
  const f=e?.target?.files?.[0] || e?.currentTarget?.files?.[0] || null;
  const sig=f ? `${f.name}|${f.size}|${f.lastModified}` : '';
  if(sig && sig===__lastGpxSelectionSig) return;
  __lastGpxSelectionSig=sig;
  handleGpxFileSelected(e);
}
$('gpxFile').addEventListener('change',dispatchGpxSelection);
$('gpxFile').addEventListener('input',dispatchGpxSelection);
$('flatRouteBtn')?.addEventListener('click',activateFlatAsphaltRoute);
['flatRouteKm','flatRouteGain'].forEach(id=>{
  $(id)?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      e.preventDefault();
      activateFlatAsphaltRoute();
    }
  });
});

$('gpxLoadBtn').addEventListener('click',async ()=>{
  abortMapAnalysisForNewGpx();
  if(!selectedGPXFile){
    $('gpxStatus').textContent='✕ Сначала выберите GPX.'; setActionState('gpxLoadBtn','error');
    return;
  }
  const btn=$('gpxLoadBtn'), prog=$('gpxProgress');
  btn.disabled=true; setActionState('gpxLoadBtn','working');
  prog.style.display='block';
  prog.value=10;
  $('gpxStatus').textContent='⏳ Читаю файл…';

  try{
    const text=await readFileIOS(selectedGPXFile);
    prog.value=45;
    $('gpxStatus').textContent='⏳ Разбираю точки GPX…';
    await new Promise(r=>setTimeout(r,30));
    parseGPX(text);
    prog.value=100;
    $('gpxStatus').textContent=state.hasElevation
      ? '✓ GPX обработан: '+state.dist.toFixed(1)+' км · +'+Math.round(state.gain)+' м · −'+Math.round(state.loss)+' м'
      : '⚠ GPX обработан: '+state.dist.toFixed(1)+' км. В файле нет данных высоты — профиль высоты, набор и сброс не рассчитываются.';
    syncMapAnalyzeButton(); restoreMapInfoNote();
    btn.textContent='✓ GPX загружен';
    $('gpxName').innerHTML='<span id="gpxCheck" class="file-check selected">✓</span> Загружен: '+selectedGPXFile.name;
    setActionState('gpxLoadBtn','success');
    setTimeout(()=>{prog.style.display='none';},1200);
  }catch(err){
    prog.style.display='none';
    $('gpxStatus').textContent='✕ Ошибка обработки GPX: '+(err.message||String(err));
    if($('mapAnalyzeBtn')){$('mapAnalyzeBtn').disabled=true;setActionState('mapAnalyzeBtn','idle');} btn.textContent='Повторить загрузку GPX'; setActionState('gpxLoadBtn','error');
  }finally{
    btn.disabled=false;
  }
});



function itraEndurancePoints(kmEffort){
  if(kmEffort < 25) return 0;
  if(kmEffort < 45) return 1;
  if(kmEffort < 75) return 2;
  if(kmEffort < 115) return 3;
  if(kmEffort < 155) return 4;
  if(kmEffort < 210) return 5;
  return 6;
}



function formatDurationSeconds(seconds){
  if(!Number.isFinite(seconds) || seconds<0) return '—';
  const totalMin=Math.round(seconds/60);
  const h=Math.floor(totalMin/60);
  const m=totalMin%60;
  return `${h}:${String(m).padStart(2,'0')}`;
}

function getTrackTimesFromGPX(){
  const pts=(state.track||[]).filter(p=>p && p.time);
  if(pts.length<2) return null;

  const parsed=pts.map(p=>({
    ...p,
    _ts:new Date(p.time).getTime()
  })).filter(p=>Number.isFinite(p._ts));

  if(parsed.length<2) return null;

  const elapsedSec=Math.max(0,(parsed[parsed.length-1]._ts-parsed[0]._ts)/1000);

  // Moving time: sum intervals where the athlete actually moved.
  // GPX points farther apart than 3 minutes are treated as a pause/gap unless
  // distance between the points proves continued movement.
  let movingSec=0;
  for(let i=1;i<parsed.length;i++){
    const a=parsed[i-1], b=parsed[i];
    const dt=(b._ts-a._ts)/1000;
    if(!(dt>0) || dt>180) continue;

    let distKm=0;
    if(Number.isFinite(a.km) && Number.isFinite(b.km)){
      distKm=Math.max(0,b.km-a.km);
    }else if(Number.isFinite(a.lat)&&Number.isFinite(a.lon)&&Number.isFinite(b.lat)&&Number.isFinite(b.lon)){
      distKm=haversineKm(a.lat,a.lon,b.lat,b.lon);
    }

    // At least ~0.5 km/h. This excludes stationary GPS jitter.
    const speedKmh=distKm/(dt/3600);
    if(speedKmh>=0.5) movingSec+=dt;
  }

  return {movingSec,elapsedSec};
}


function formatTrackPace(seconds,distanceKm){
  if(!Number.isFinite(seconds) || seconds<=0 || !Number.isFinite(distanceKm) || distanceKm<=0) return '— мин/км';
  const secPerKm=seconds/distanceKm;
  const min=Math.floor(secPerKm/60);
  const sec=Math.round(secPerKm%60);
  if(sec===60) return `${min+1}:00 мин/км`;
  return `${min}:${String(sec).padStart(2,'0')} мин/км`;
}

function updateTraversalTimes(){
  const moving=$('movingTimeMetric'), elapsed=$('elapsedTimeMetric');
  const movingPace=$('movingPaceMetric'), elapsedPace=$('elapsedPaceMetric');
  if(!moving || !elapsed) return;

  const times=getTrackTimesFromGPX();
  if(!times){
    moving.textContent='нет времени в GPX';
    elapsed.textContent='нет времени в GPX';
    if(movingPace) movingPace.textContent='— мин/км';
    if(elapsedPace) elapsedPace.textContent='— мин/км';
    return;
  }

  moving.textContent=formatDurationSeconds(times.movingSec);
  elapsed.textContent=formatDurationSeconds(times.elapsedSec);

  const distanceKm=Number(state.dist||0);
  if(movingPace) movingPace.textContent=formatTrackPace(times.movingSec,distanceKm);
  if(elapsedPace) elapsedPace.textContent=formatTrackPace(times.elapsedSec,distanceKm);
}


function adjustedTrailEndurancePoints(kmEffort){
  let pts=itraEndurancePoints(kmEffort);
  const d=computeTrailDifficulty();
  const vertPerKm=(state.gain||0)/Math.max(0.1,state.dist||0);

  const nearNextBoundary =
    (pts===1 && kmEffort>=42) ||
    (pts===2 && kmEffort>=72) ||
    (pts===3 && kmEffort>=112) ||
    (pts===4 && kmEffort>=152) ||
    (pts===5 && kmEffort>=205);

  const extremeVertical =
    vertPerKm>=120 ||
    d.steep15Pct>=40 ||
    d.score>=7.5;

  if(pts<6 && nearNextBoundary && extremeVertical) pts+=1;
  return pts;
}

function updateItraDifficulty(){
  const kmEffort=(state.dist||0)+((state.gain||0)/100);
  const points=itraEndurancePoints(kmEffort);
  const k=$('itraKmEffort'), p=$('itraPoints'), ap=$('itraAdjustedPoints');
  const adjustedPoints=adjustedTrailEndurancePoints(kmEffort);
  if(k) k.textContent=kmEffort ? kmEffort.toFixed(1) : '—';
  if(p) p.textContent=(state.dist||state.gain) ? String(points) : '—';
  if(ap) ap.textContent=(state.dist||state.gain) ? String(adjustedPoints) : '—';
  return {kmEffort, points, adjustedPoints};
}


function computeTrailDifficulty(){
  const pts=(state.track||[]).filter(p=>Number.isFinite(p.km)&&Number.isFinite(p.ele));
  if(pts.length<3 || !(state.dist>0)){
    return {
      score:0, steep15Pct:0, vertPerKm:0,
      maxGrade:0, reversals:0, longClimbs:0,
      label:'Недостаточно данных'
    };
  }

  let totalHoriz=0;
  let steep15Dist=0;
  let steep10Dist=0;
  let steep20Dist=0;
  let steepDown15Dist=0;
  let maxGrade=0;
  let reversals=0;
  let prevSign=0;
  let longClimbs=0;
  let climbRun=0;

  for(let i=1;i<pts.length;i++){
    const dk=(pts[i].km-pts[i-1].km);
    if(!(dk>0)) continue;
    const de=pts[i].ele-pts[i-1].ele;
    const grade=(de/(dk*1000))*100;
    const absGrade=Math.abs(grade);
    totalHoriz+=dk;
    if(absGrade>=10) steep10Dist+=dk;
    if(absGrade>=15) steep15Dist+=dk;
    if(absGrade>=20) steep20Dist+=dk;
    if(grade<=-15) steepDown15Dist+=dk;
    if(absGrade>maxGrade && absGrade<80) maxGrade=absGrade;

    const sign=de>1 ? 1 : (de<-1 ? -1 : 0);
    if(sign && prevSign && sign!==prevSign) reversals++;
    if(sign) prevSign=sign;

    if(de>0){
      climbRun+=dk;
    }else{
      if(climbRun>=0.5) longClimbs++;
      climbRun=0;
    }
  }
  if(climbRun>=0.5) longClimbs++;

  const vertPerKm=(state.gain||0)/(state.dist||1);
  const steep15Pct=totalHoriz>0 ? (steep15Dist/totalHoriz)*100 : 0;
  const steep10Pct=totalHoriz>0 ? (steep10Dist/totalHoriz)*100 : 0;
  const steep20Pct=totalHoriz>0 ? (steep20Dist/totalHoriz)*100 : 0;
  const steepDown15Pct=totalHoriz>0 ? (steepDown15Dist/totalHoriz)*100 : 0;

  // Trail Difficulty 0-10, v0.43.
  // Short repeated steep climbs/descents matter more; long climbs are only
  // an extra factor and can no longer pull a punchy course score too low.
  let score=0;

  // Vertical density: 0..3.0. Around 25-30 m+/km is already meaningful.
  score += Math.min(3.0, vertPerKm/22);

  // Exposure to steep terrain: 0..3.6.
  // These intentionally overlap: a >20% section is harder than a plain >10% one.
  score += Math.min(1.4, steep10Pct/18);
  score += Math.min(1.4, steep15Pct/14);
  score += Math.min(0.8, steep20Pct/12);

  // Steep descents add eccentric/technical load: 0..0.8.
  score += Math.min(0.8, steepDown15Pct/12);

  // Profile ruggedness / repeated up-down changes: 0..1.2.
  const revPer10=(reversals/Math.max(state.dist,1))*10;
  score += Math.min(1.2, revPer10/9);

  // Sustained climbs are a bonus, not a prerequisite for difficulty: 0..0.5.
  score += Math.min(0.5, longClimbs/8);

  // Max grade contributes modestly because a single GPS spike can exaggerate it.
  if(maxGrade>=30) score+=0.6;
  else if(maxGrade>=20) score+=0.45;
  else if(maxGrade>=15) score+=0.3;

  score=Math.max(0,Math.min(10,score));

  let label='Почти плоская';
  if(score>=8.5) label='Очень тяжёлая / альпийская';
  else if(score>=6.5) label='Тяжёлая';
  else if(score>=4.5) label='Средняя';
  else if(score>=2.5) label='Лёгкий трейл';

  return {
    score,
    steep15Pct,
    steepDown15Pct,
    vertPerKm,
    maxGrade,
    reversals,
    longClimbs,
    label
  };
}

function updateTrailDifficulty(){
  const d=computeTrailDifficulty();
  const s=$('trailDifficulty'), p=$('steep15Metric'), v=$('vertPerKmMetric'), l=$('trailDifficultyLabel');
  if(s) s.textContent=(state.dist>0)?d.score.toFixed(1)+'/10':'—';
  if(p) p.textContent=(state.dist>0)?d.steep15Pct.toFixed(1)+'%':'—';
  if(v) v.textContent=(state.dist>0)?d.vertPerKm.toFixed(0)+' м/км':'—';
  if(l) l.textContent=(state.dist>0)?`${d.label} · max уклон ${d.maxGrade.toFixed(0)}% · подъёмов длиной >500 м: ${d.longClimbs}`:'—';
  return d;
}


function formatClockHours(hours){
  if(!Number.isFinite(hours)) return '—';
  const total=Math.round(hours*60);
  const h=Math.floor(total/60), m=total%60;
  return `${h}:${String(m).padStart(2,'0')}`;
}

function estimatedTimeAtKm(km){
  const dist=Math.max(state.dist||0,0.001);
  const basePaceSec=paceSec($('basePace').value);
  const frac=Math.max(0,Math.min(1,km/dist));

  // Approximate cumulative gain up to this point.
  const pts=(state.track||[]).filter(p=>Number.isFinite(p.km)&&Number.isFinite(p.ele));
  let gain=0;
  let prev=null;
  for(const p of pts){
    if(p.km>km) break;
    if(prev){
      const de=p.ele-prev.ele;
      if(de>0 && de<250) gain+=de;
    }
    prev=p;
  }

  // Base time + 1 hour per 1000 m ascent, proportional along the route.
  const baseHours=(km*basePaceSec)/3600;
  const ascentHours=gain/1000;
  return baseHours+ascentHours;
}

function drawElevationCanvas(canvasId, xMode){
  const canvas=$(canvasId);
  if(!canvas) return;

  const pts=(state.track||[]).filter(p=>Number.isFinite(p.km)&&Number.isFinite(p.ele));
  const ctx=canvas.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const w=Math.max(300,canvas.clientWidth||600);
  const h=220;
  canvas.width=Math.round(w*dpr);
  canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);

  if(pts.length<2){
    ctx.fillStyle='#94a3b8';
    ctx.font='14px system-ui,-apple-system,sans-serif';
    const msg=(state.track?.length && state.hasElevation===false)
      ? 'В GPX нет данных высоты'
      : 'Загрузите GPX для построения профиля';
    ctx.fillText(msg,16,30);
    return;
  }

  const pad={l:48,r:16,t:16,b:34};
  const minE=Math.min(...pts.map(p=>p.ele));
  const maxE=Math.max(...pts.map(p=>p.ele));
  const eRange=Math.max(1,maxE-minE);

  const xs=pts.map(p=>xMode==='time'?estimatedTimeAtKm(p.km):p.km);
  const maxX=Math.max(...xs)||1;

  // axes
  ctx.strokeStyle='#334155';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(pad.l,pad.t);
  ctx.lineTo(pad.l,h-pad.b);
  ctx.lineTo(w-pad.r,h-pad.b);
  ctx.stroke();

  // profile
  ctx.strokeStyle='#38bdf8';
  ctx.lineWidth=2;
  ctx.beginPath();
  pts.forEach((p,i)=>{
    const x=pad.l+(xs[i]/maxX)*(w-pad.l-pad.r);
    const y=pad.t+(1-(p.ele-minE)/eRange)*(h-pad.t-pad.b);
    if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // fill
  ctx.fillStyle='rgba(56,189,248,.12)';
  const lastX=pad.l+(xs[xs.length-1]/maxX)*(w-pad.l-pad.r);
  ctx.lineTo(lastX,h-pad.b);
  ctx.lineTo(pad.l,h-pad.b);
  ctx.closePath();
  ctx.fill();

  // labels
  ctx.fillStyle='#94a3b8';
  ctx.font='12px system-ui,-apple-system,sans-serif';
  ctx.fillText(Math.round(maxE)+' м',4,pad.t+5);
  ctx.fillText(Math.round(minE)+' м',4,h-pad.b);

  const steps=4;
  for(let i=0;i<=steps;i++){
    const val=maxX*i/steps;
    const x=pad.l+(i/steps)*(w-pad.l-pad.r);
    const label=xMode==='time'?formatClockHours(val):val.toFixed(i===steps?1:0)+' км';
    const tw=ctx.measureText(label).width;
    ctx.fillText(label,Math.min(w-pad.r-tw,Math.max(pad.l-tw/2,x-tw/2)),h-9);
  }
}

function drawTrackProfiles(){
  drawElevationCanvas('elevationDistanceCanvas','distance');
  drawElevationCanvas('elevationTimeCanvas','time');
}


function sampleTrackPoints(maxSamples=220){
  const pts=(state.track||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(p.km));
  if(pts.length<=maxSamples) return pts;
  const step=(pts.length-1)/(maxSamples-1);
  const out=[];
  for(let i=0;i<maxSamples;i++) out.push(pts[Math.round(i*step)]);
  return out;
}

function osmTagClass(tags={}){
  const natural=tags.natural||'';
  const wetland=tags.wetland||'';
  const highway=tags.highway||'';
  const surface=(tags.surface||'').toLowerCase();
  const waterway=tags.waterway||'';

  if(natural==='wetland' || wetland) return 'wetland';
  if(waterway || natural==='water') return 'water';
  if(highway==='path' || highway==='footway' || highway==='track') {
    if(['asphalt','paved','concrete','concrete:plates','paving_stones'].includes(surface)) return 'paved';
    if(['ground','dirt','earth','mud','sand','grass','gravel','fine_gravel','unpaved'].includes(surface)) return 'dirt';
    return 'trail';
  }
  if(['residential','service','tertiary','secondary','primary','unclassified','road'].includes(highway)){
    if(['asphalt','paved','concrete','paving_stones'].includes(surface) || !surface) return 'paved';
    return 'dirt';
  }
  return 'unknown';
}

function pointInPolygon(lat,lon,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const yi=poly[i][0], xi=poly[i][1], yj=poly[j][0], xj=poly[j][1];
    const intersect=((yi>lat)!=(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi+1e-12)+xi);
    if(intersect) inside=!inside;
  }
  return inside;
}

function haversineKm(a,b,c,d){
  return haversine(a,b,c,d)/1000;
}

function distancePointToSegmentKm(p,a,b){
  const x0=p.lon,y0=p.lat,x1=a.lon,y1=a.lat,x2=b.lon,y2=b.lat;
  const dx=x2-x1,dy=y2-y1;
  let t=((x0-x1)*dx+(y0-y1)*dy)/(dx*dx+dy*dy||1);
  t=Math.max(0,Math.min(1,t));
  const x=x1+t*dx,y=y1+t*dy;
  return haversineKm(y,x,p.lat,p.lon);
}

function classifyPointFromOSM(p, elements){
  let best={cls:'unknown',dist:1e9};
  for(const el of elements){
    const tags=el.tags||{};
    const cls=osmTagClass(tags);
    if(cls==='unknown') continue;

    if(el.type==='node' && Number.isFinite(el.lat)&&Number.isFinite(el.lon)){
      const d=haversineKm(p.lat,p.lon,el.lat,el.lon);
      if(d<best.dist && d<=0.05) best={cls,dist:d};
    } else if(el.type==='way' && Array.isArray(el.geometry) && el.geometry.length>=2){
      const geom=el.geometry.map(g=>({lat:g.lat,lon:g.lon}));
      if((tags.natural==='wetland' || tags.natural==='water') && geom.length>=3){
        const poly=geom.map(g=>[g.lat,g.lon]);
        if(pointInPolygon(p.lat,p.lon,poly)) return cls;
      }
      for(let i=1;i<geom.length;i++){
        const d=distancePointToSegmentKm(p,geom[i-1],geom[i]);
        if(d<best.dist && d<=0.035) best={cls,dist:d};
      }
    }
  }
  return best.cls;
}

function buildOverpassQuery(points){
  const pts=(points||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  if(!pts.length) return '[out:json][timeout:90];();out;';

  // v0.0245: do NOT ask Overpass for one huge route bbox. On long/curvy tracks
  // that query was too heavy and all endpoints could time out, producing 0%.
  // Build several small boxes along the GPX corridor instead.
  const boxes=[];
  const stride=Math.max(1,Math.floor(pts.length/18));
  for(let i=0;i<pts.length;i+=stride){
    const chunk=pts.slice(i,Math.min(pts.length,i+stride+1));
    const lats=chunk.map(p=>p.lat),lons=chunk.map(p=>p.lon);
    const pad=0.0035; // ~250-390 m corridor around this part of route
    boxes.push([
      Math.min(...lats)-pad,Math.min(...lons)-pad,
      Math.max(...lats)+pad,Math.max(...lons)+pad
    ]);
  }

  const selectors=[];
  for(const [s,w,n,e] of boxes){
    selectors.push(
      `way["natural"="wetland"](${s},${w},${n},${e});`,
      `way["natural"="water"](${s},${w},${n},${e});`,
      `way["waterway"](${s},${w},${n},${e});`,
      `way["highway"](${s},${w},${n},${e});`,
      `node["ford"](${s},${w},${n},${e});`
    );
  }
  return `[out:json][timeout:90];\n(\n${selectors.join('\n')}\n);\nout tags geom;`;
}




function analyzeWaterCrossings(samples,elements=[]){
  if(!samples || samples.length<2) return {fords:[],bridges:[],confirmed:[],likely:[]};

  const track=(state.track||[]).filter(p=>
    Number.isFinite(p.km)&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)
  );
  if(track.length<2) return {fords:[],bridges:[],confirmed:[],likely:[]};

  const bridgeWays=(elements||[]).filter(el=>{
    const t=el.tags||{};
    return el.type==='way' && Array.isArray(el.geometry) && el.geometry.length>=2 &&
      (t.bridge==='yes'||t.bridge==='true'||t.bridge==='viaduct'||t.man_made==='bridge');
  });

  const waterWays=(elements||[]).filter(el=>{
    const t=el.tags||{};
    return el.type==='way' && Array.isArray(el.geometry) && el.geometry.length>=2 &&
      (
        ['river','stream','canal','ditch','drain'].includes(String(t.waterway||'').toLowerCase()) ||
        t.natural==='water' || t.water==='river' || t.water==='stream'
      );
  });

  const explicitFordNodes=(elements||[]).filter(el=>{
    const t=el.tags||{};
    return el.type==='node' && Number.isFinite(el.lat)&&Number.isFinite(el.lon) &&
      (t.ford==='yes'||t.ford==='stepping_stones'||t.highway==='ford');
  });

  function trackPointAtKm(km){
    let best=null,bestDiff=Infinity;
    for(const p of track){
      const d=Math.abs(p.km-km);
      if(d<bestDiff){best=p;bestDiff=d;}
    }
    return best;
  }

  function bridgeNearKm(km){
    const p=trackPointAtKm(km);
    if(!p) return false;
    for(const way of bridgeWays){
      const g=way.geometry||[];
      for(let i=1;i<g.length;i++){
        const d=distancePointToSegmentKm(
          {lat:p.lat,lon:p.lon},
          {lat:g[i-1].lat,lon:g[i-1].lon},
          {lat:g[i].lat,lon:g[i].lon}
        );
        if(Number.isFinite(d)&&d<=0.080) return true;
      }
    }
    return false;
  }

  function orient(a,b,c){
    return (b.lon-a.lon)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lon-a.lon);
  }
  function segmentIntersects(a,b,c,d){
    const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
    const eps=1e-12;
    return ((o1>eps&&o2<-eps)||(o1<-eps&&o2>eps)) &&
           ((o3>eps&&o4<-eps)||(o3<-eps&&o4>eps));
  }

  function nearestTrackKmToPoint(lat,lon,maxKm=0.035){
    let bestKm=NaN,bestD=Infinity;
    for(let i=1;i<track.length;i++){
      const a=track[i-1],b=track[i];
      const d=distancePointToSegmentKm({lat,lon},a,b);
      if(d<bestD){
        bestD=d;
        const da=haversineKm(a.lat,a.lon,lat,lon);
        const db=haversineKm(b.lat,b.lon,lat,lon);
        const t=(da+db)>0?da/(da+db):0.5;
        bestKm=a.km+(b.km-a.km)*Math.max(0,Math.min(1,t));
      }
    }
    return bestD<=maxKm?bestKm:NaN;
  }

  // v0.0245: suppress false "city fords".
  // If GPX follows an OSM road/paved way at the crossing, water geometry alone
  // is not enough: only an explicit OSM ford node can create a ford there.
  const roadWays=(elements||[]).filter(el=>{
    const t=el.tags||{};
    return el.type==='way' && Array.isArray(el.geometry) && el.geometry.length>=2 &&
      !!t.highway && !['path','footway','track','bridleway','steps'].includes(String(t.highway).toLowerCase());
  });
  function roadNearKm(km){
    const p=trackPointAtKm(km);
    if(!p) return false;
    for(const way of roadWays){
      const g=way.geometry||[];
      for(let i=1;i<g.length;i++){
        const d=distancePointToSegmentKm(
          {lat:p.lat,lon:p.lon},
          {lat:g[i-1].lat,lon:g[i-1].lon},
          {lat:g[i].lat,lon:g[i].lon}
        );
        if(Number.isFinite(d)&&d<=0.025) return true;
      }
    }
    return false;
  }
  function explicitFordNearKm(km){
    const p=trackPointAtKm(km);
    if(!p) return false;
    return explicitFordNodes.some(n=>haversineKm(p.lat,p.lon,n.lat,n.lon)<=0.060);
  }
  function falseRoadFord(km){
    return roadNearKm(km) && !explicitFordNearKm(km);
  }

  function waterObjectKey(way){
    const t=way.tags||{};
    const name=String(t.name||t['name:ru']||t.ref||'').trim().toLowerCase();
    const type=String(t.waterway||t.water||t.natural||'water').toLowerCase();
    return name ? `${type}:${name}` : `${type}:way:${way.id||Math.random()}`;
  }

  // Candidate = one raw hit with an OSM water-object identity.
  const candidates=[];

  // Explicit ford nodes are authoritative and kept as confirmed.
  for(const n of explicitFordNodes){
    const km=nearestTrackKmToPoint(n.lat,n.lon,0.050);
    if(Number.isFinite(km)&&!bridgeNearKm(km)){
      candidates.push({km,kind:'confirmed',objectKey:`ford-node:${n.id||km}`});
    }
  }

  // Detect geometric crossing of GPX with every water object.
  for(const ww of waterWays){
    const g=ww.geometry||[];
    const objectKey=waterObjectKey(ww);
    for(let wi=1;wi<g.length;wi++){
      const c={lat:g[wi-1].lat,lon:g[wi-1].lon};
      const d={lat:g[wi].lat,lon:g[wi].lon};
      const minLat=Math.min(c.lat,d.lat)-0.00015,maxLat=Math.max(c.lat,d.lat)+0.00015;
      const minLon=Math.min(c.lon,d.lon)-0.00020,maxLon=Math.max(c.lon,d.lon)+0.00020;

      for(let ti=1;ti<track.length;ti++){
        const a=track[ti-1],b=track[ti];
        if(Math.max(a.lat,b.lat)<minLat||Math.min(a.lat,b.lat)>maxLat||
           Math.max(a.lon,b.lon)<minLon||Math.min(a.lon,b.lon)>maxLon) continue;

        let hit=segmentIntersects(a,b,c,d);

        if(!hit){
          const da=distancePointToSegmentKm(a,c,d);
          const db=distancePointToSegmentKm(b,c,d);
          hit=Math.min(da,db)<=0.018;
        }

        if(hit){
          const km=(a.km+b.km)/2;
          if(!bridgeNearKm(km) && !falseRoadFord(km)){
            candidates.push({km,kind:'likely',objectKey});
          }
        }
      }
    }
  }

  // Water polygons / sampled water bands: collapse each continuous band.
  let inWater=false,startKm=0;
  function finishWaterBand(endKm){
    const center=(startKm+endKm)/2;
    if(!bridgeNearKm(center) && !falseRoadFord(center)){
      candidates.push({
        km:center,
        kind:'likely',
        objectKey:`water-band:${Math.round(center*2)/2}`
      });
    }
  }
  for(let i=0;i<samples.length;i++){
    const water=String(samples[i].cls||'').toLowerCase()==='water';
    if(water&&!inWater){
      inWater=true;
      startKm=Number(samples[i].km||0);
    }else if(!water&&inWater){
      finishWaterBand(Number(samples[Math.max(0,i-1)].km||startKm));
      inWater=false;
    }
  }
  if(inWater) finishWaterBand(Number(samples[samples.length-1].km||startKm));

  // First cluster hits that belong to the SAME OSM water object.
  const byObject=new Map();
  for(const c of candidates){
    if(!byObject.has(c.objectKey)) byObject.set(c.objectKey,[]);
    byObject.get(c.objectKey).push(c);
  }

  const objectCrossings=[];
  for(const [key,arr0] of byObject){
    const arr=arr0.slice().sort((a,b)=>a.km-b.km);
    let cluster=[];
    const flush=()=>{
      if(!cluster.length) return;
      const kms=cluster.map(x=>x.km);
      const confirmed=cluster.some(x=>x.kind==='confirmed');
      objectCrossings.push({
        km:kms.reduce((a,b)=>a+b,0)/kms.length,
        start:Math.min(...kms),
        end:Math.max(...kms),
        kind:confirmed?'confirmed':'likely',
        objectKey:key
      });
      cluster=[];
    };

    for(const c of arr){
      // Same named/object water system can have braided arms spread along the
      // route. Up to 400 m is treated as one crossing of that object.
      if(!cluster.length || c.km-cluster[cluster.length-1].km<=0.40){
        cluster.push(c);
      }else{
        flush();
        cluster.push(c);
      }
    }
    flush();
  }

  // Second pass: merge duplicated representations of the same physical ford.
  // Different OSM objects are merged when their crossings are within 400 m.
  objectCrossings.sort((a,b)=>a.km-b.km);
  const physical=[];
  for(const c of objectCrossings){
    const prev=physical[physical.length-1];
    if(prev && c.km-prev.km<=0.40){
      const n=prev.count||1;
      prev.km=(prev.km*n+c.km)/(n+1);
      prev.start=Math.min(prev.start,c.start);
      prev.end=Math.max(prev.end,c.end);
      prev.count=n+1;
      if(c.kind==='confirmed') prev.kind='confirmed';
    }else{
      physical.push({...c,count:1});
    }
  }

  // Final bridge exclusion after all grouping.
  const clean=physical.filter(c=>
    Number(c.km)>=0.2 &&
    !bridgeNearKm(c.km) &&
    (c.kind==='confirmed' || !falseRoadFord(c.km))
  );
  const confirmed=clean.filter(c=>c.kind==='confirmed').map(c=>c.km);
  const likely=clean.filter(c=>c.kind!=='confirmed').map(c=>c.km);
  const all=clean.map(c=>c.km);

  // Display bridge crossings separately.
  const bridgeHits=[];
  for(const s of samples){
    if(String(s.cls||'').toLowerCase()==='water'&&bridgeNearKm(Number(s.km||0))){
      bridgeHits.push(Number(s.km||0));
    }
  }
  const bridges=groupFordKmPoints(bridgeHits,0.25).map(g=>g.center||g.start);

  return {fords:all,bridges,confirmed,likely};
}
function findLikelyFords(samples,elements=[]){
  return analyzeWaterCrossings(samples,elements).fords;
}

function summarizeSurfaceClasses(samples){
  const counts={wetland:0,water:0,trail:0,dirt:0,paved:0,unknown:0};
  samples.forEach(x=>counts[x.cls]=(counts[x.cls]||0)+1);
  const total=samples.length||1;
  const pct=k=>counts[k]/total*100;
  const known=total-counts.unknown;
  return {
    counts,
    coverage:known/total*100,
    wetland:pct('wetland'),
    water:pct('water'),
    trail:pct('trail'),
    dirt:pct('dirt'),
    paved:pct('paved')
  };
}

function drawSurfaceStrip(samples){
  const canvas=$('surfaceStripCanvas');
  if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const w=Math.max(300,canvas.clientWidth||600), h=90;
  canvas.width=w*dpr; canvas.height=h*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const map={
    wetland:'#22c55e',
    water:'#38bdf8',
    trail:'#a78bfa',
    dirt:'#d97706',
    paved:'#94a3b8',
    unknown:'#334155'
  };
  const n=samples.length||1;
  samples.forEach((s,i)=>{
    ctx.fillStyle=map[s.cls]||map.unknown;
    const x=i*w/n, ww=Math.ceil(w/n)+1;
    ctx.fillRect(x,18,ww,34);
  });
  ctx.fillStyle='#cbd5e1';ctx.font='12px system-ui,-apple-system,sans-serif';
  ctx.fillText('0 км',0,74);
  const end=(state.dist||0).toFixed(1)+' км';
  const tw=ctx.measureText(end).width;
  ctx.fillText(end,w-tw,74);
}



function groupFordKmPoints(kms, maxGapKm=0.35){
  const pts=(Array.isArray(kms)?kms:[])
    .map(Number)
    .filter(Number.isFinite)
    .filter(km=>km>=0.2)
    .sort((a,b)=>a-b);

  const groups=[];
  let current=null;

  for(const km of pts){
    if(!current){
      current={start:km,end:km,points:[km]};
      continue;
    }

    // v0.0245: only nearby parts of the SAME water crossing are merged.
    // 150 m is enough for braided channels / GPS jitter, while separate
    // crossings 200+ m apart remain separate.
    if(km-current.end<=maxGapKm){
      current.end=km;
      current.points.push(km);
    }else{
      groups.push(current);
      current={start:km,end:km,points:[km]};
    }
  }

  if(current) groups.push(current);

  return groups.map(g=>({
    start:g.start,
    end:g.end,
    center:(g.start+g.end)/2,
    points:g.points,
    label:(g.end-g.start>=0.05)
      ? `${g.start.toFixed(1)}–${g.end.toFixed(1)}`
      : g.start.toFixed(1)
  }));
}

function removeBridgeCrossings(kms, bridgeKms, radiusKm=0.08){
  const bridges=(Array.isArray(bridgeKms)?bridgeKms:[])
    .map(Number).filter(Number.isFinite);
  return (Array.isArray(kms)?kms:[])
    .map(Number).filter(Number.isFinite)
    .filter(km=>!bridges.some(b=>Math.abs(km-b)<=radiusKm));
}

function groupedFordStarts(kms, bridgeKms=[]){
  return groupFordKmPoints(removeBridgeCrossings(kms,bridgeKms),0.35)
    .map(g=>g.start);
}
function filterFordCandidatesClient(fords){
  if(!Array.isArray(fords)) return [];

  const arr=fords
    .filter(f=>{
      const w=Number(f?.width_m ?? f?.width);
      return !(Number.isFinite(w) && w<2.0);
    })
    .filter(f=>Number.isFinite(Number(f?.km)) && Number(f.km)>=0.2)
    .sort((a,b)=>Number(a.km)-Number(b.km));

  const groups=groupFordKmPoints(arr.map(f=>Number(f.km)),0.35);

  return groups.map(g=>({
    km:g.start,
    km_start:g.start,
    km_end:g.end,
    km_label:g.label,
    crossing_count:g.points.length
  }));
}

async function analyzeMapOSM(){
  startMapAnalysisTimer();
  if(!state.track || !state.track.length) throw new Error('Сначала обработайте GPX');

  const runId=++mapAnalysisRunId;
  const pts=sampleTrackPoints(220);
  const query=buildOverpassQuery(pts);

  const retryEl=document.getElementById('mapAnalyzeRetryText');

  async function fetchWithLimit(url, options, ms=22000){
    const controller=new AbortController();
    currentMapAnalysisFetchController=controller;
    const t=setTimeout(()=>controller.abort(),ms);
    try{
      return await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
    }finally{
      clearTimeout(t);
      if(currentMapAnalysisFetchController===controller){
        currentMapAnalysisFetchController=null;
      }
    }
  }

  let data=null;
  const attempts=[
    {
      name:'серверный proxy',
      url:'/api/osm',
      options:{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({query})
      },
      jsonBody:true
    },
    {
      name:'Overpass 1',
      url:'https://overpass-api.de/api/interpreter',
      options:{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:'data='+encodeURIComponent(query)
      }
    },
    {
      name:'Overpass 2',
      url:'https://overpass.kumi.systems/api/interpreter',
      options:{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:'data='+encodeURIComponent(query)
      }
    }
,
    {
      name:'Overpass 3',
      url:'https://overpass.nchc.org.tw/api/interpreter',
      options:{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:'data='+encodeURIComponent(query)
      }
    },
    {
      name:'Overpass 4',
      url:'https://overpass.private.coffee/api/interpreter',
      options:{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:'data='+encodeURIComponent(query)
      }
    }
  ];

  for(let i=0;i<attempts.length;i++){
    if(runId!==mapAnalysisRunId) throw new Error('Запущен новый анализ карты');

    const a=attempts[i];
    $('mapAnalyzeStatus').textContent=`⏳ Анализ карты: ${a.name}…`;
    if(retryEl) retryEl.textContent=i ? `Резервный источник ${i}/${attempts.length-1}…` : '';

    try{
      const resp=await fetchWithLimit(a.url,a.options,22000);
      if(!resp.ok){
        let detail='';
        try{
          const er=await resp.clone().json();
          detail=er.error||er.remark||'';
        }catch(e){}
        throw new Error(`HTTP ${resp.status}${detail?' · '+detail:''}`);
      }

      data=await resp.json();
      if(data && Array.isArray(data.elements)){
        break;
      }
      throw new Error('Ответ не содержит OSM-данных');
    }catch(err){
      // A new GPX was selected: terminate the old analysis quietly and immediately.
      if(runId!==mapAnalysisRunId || err?.name==='AbortError' && currentMapAnalysisFetchController===null){
        if(runId!==mapAnalysisRunId){
          throw new Error('ANALYSIS_CANCELLED_BY_NEW_GPX');
        }
      }

      console.warn('OSM source failed:',a.name,err);
      if(i<attempts.length-1){
        $('mapAnalyzeStatus').textContent=`⏳ ${a.name} недоступен. Пробую резервный источник…`;
        await new Promise(r=>setTimeout(r,500));
      }
    }
  }

  // Do not hang forever. If all OSM sources are unavailable, complete the
  // analysis with the GPX itself. Surface/ford values remain unknown rather
  // than stopping the whole analysis.
  if(!data){
    // v0.0245: if OSM is temporarily down, reuse ONLY a cache matching this GPX.
    try{
      const c=JSON.parse(localStorage.getItem('trailOSMElementsCache')||'null');
      const first=state.track?.[0], last=state.track?.[state.track.length-1];
      const sameDist=Math.abs(Number(c?.routeDist||0)-Number(state.dist||0))<0.15;
      const sameGain=Math.abs(Number(c?.routeGain||0)-Number(state.gain||0))<80;
      const sameEnds=c?.first&&c?.last&&first&&last &&
        Math.abs(c.first[0]-first.lat)<0.001 && Math.abs(c.first[1]-first.lon)<0.001 &&
        Math.abs(c.last[0]-last.lat)<0.001 && Math.abs(c.last[1]-last.lon)<0.001;
      if(sameDist&&sameGain&&sameEnds&&Array.isArray(c.elements)&&c.elements.length){
        data={elements:c.elements,fromCache:true};
        $('mapAnalyzeStatus').textContent='✓ OSM временно недоступен — использованы сохранённые данные этой трассы.';
      }
    }catch(e){}
  }

  if(!data){
    const samples=pts.map(p=>({km:p.km,cls:'unknown'}));
    const summary=summarizeSurfaceClasses(samples);
    return {samples,summary,elements:[],osmUnavailable:true};
  }

  normalizeFordData(data);

  // Keep the last successful OSM response for this exact GPX geometry.
  try{
    localStorage.setItem('trailOSMElementsCache',JSON.stringify({
      routeDist:Number(state.dist||0),
      routeGain:Number(state.gain||0),
      first:state.track?.[0] ? [state.track[0].lat,state.track[0].lon] : null,
      last:state.track?.length ? [state.track[state.track.length-1].lat,state.track[state.track.length-1].lon] : null,
      savedAt:Date.now(),
      elements:data.elements||[]
    }));
  }catch(e){}

  {
    let rawFordKm=[];
    if(Array.isArray(data.ford_kms)) rawFordKm=data.ford_kms;
    else if(Array.isArray(data.fords)) rawFordKm=data.fords.map(f=>Number(f?.km)).filter(Number.isFinite);

    const groupedFords=groupFordKmPoints(rawFordKm,0.35);
    data.ford_groups=groupedFords;
    data.ford_count=groupedFords.length;
    data.ford_kms=groupedFords.map(g=>g.start);
    data.ford_labels=groupedFords.map(g=>g.label);

    const cEl=$('fordCount')||$('fordsCount')||$('ford-count');
    if(cEl) cEl.textContent=String(data.ford_count);

    const lEl=$('fordKms')||$('fordsKm')||$('fordKmList')||$('ford-kms');
    if(lEl) lEl.textContent=data.ford_labels.length
      ? 'Броды на км: '+data.ford_labels.join(', ')
      : 'Броды на км: —';
  }

  const elements=data.elements||[];
  const samples=pts.map(p=>({km:p.km,cls:classifyPointFromOSM(p,elements)}));
  const summary=summarizeSurfaceClasses(samples);

  try{
    localStorage.setItem('trailMapAnalysis',JSON.stringify({
      routeDist:state.dist,
      routeGain:state.gain,
      savedAt:new Date().toISOString(),
      samples,summary
    }));
  }catch(e){}

  return {samples,summary,elements,osmUnavailable:false};
}

let fordLeafletMap=null;
let fordLeafletLayerGroup=null;

function nearestTrackPointByKm(km){
  let best=null,bestDiff=Infinity;
  for(const p of (state.track||[])){
    if(!Number.isFinite(p.km)||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)) continue;
    const d=Math.abs(p.km-km);
    if(d<bestDiff){best=p;bestDiff=d;}
  }
  return best;
}

function renderFordMap(fordKms=[],confirmedFordKms=[],likelyFordKms=[],bridgeKms=[]){
  const el=document.getElementById('fordLeafletMap');
  if(!el) return;

  const pts=(state.track||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  if(pts.length<2){
    el.innerHTML='<div class="muted" style="padding:12px">Нет координат GPX для карты.</div>';
    return;
  }

  // Fallback if Leaflet CDN is unavailable.
  if(typeof L==='undefined'){
    el.innerHTML='<div class="muted" style="padding:12px">Карта OSM недоступна. Проверьте интернет-соединение.</div>';
    return;
  }

  if(fordLeafletMap){
    try{fordLeafletMap.remove()}catch(e){}
    fordLeafletMap=null;
  }

  fordLeafletMap=L.map(el,{zoomControl:false,attributionControl:true,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false,tap:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; OpenStreetMap'
  }).addTo(fordLeafletMap);

  fordLeafletLayerGroup=L.layerGroup().addTo(fordLeafletMap);

  const latlngs=pts.map(p=>[p.lat,p.lon]);
  const route=L.polyline(latlngs,{color:'#ff2020',weight:6,opacity:1,lineCap:'round',lineJoin:'round'}).addTo(fordLeafletLayerGroup);
  fordLeafletMap.fitBounds(route.getBounds(),{padding:[16,16]});

  function addMarker(km,kind){
    const p=nearestTrackPointByKm(km);
    if(!p) return;

    let emoji='🌊', label='Вероятный брод', cls='#38bdf8';
    if(kind==='confirmed'){emoji='✅';label='Подтверждённый брод OSM';cls='#22c55e'}
    if(kind==='bridge'){emoji='🌉';label='Пересечение воды по мосту';cls='#f59e0b'}

    const icon=L.divIcon({
      className:'',
      html:`<div style="
        width:30px;height:30px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        background:#0f172a;border:2px solid ${cls};
        box-shadow:0 2px 8px rgba(0,0,0,.35);
        font-size:16px">${emoji}</div>`,
      iconSize:[30,30],
      iconAnchor:[15,15]
    });

    L.marker([p.lat,p.lon],{icon})
      .bindPopup(`<b>${label}</b><br>${Number(km).toFixed(1)} км`)
      .addTo(fordLeafletLayerGroup);
  }

  confirmedFordKms.forEach(k=>addMarker(k,'confirmed'));
  likelyFordKms.forEach(k=>addMarker(k,'likely'));
  bridgeKms.forEach(k=>addMarker(k,'bridge'));

  // If old data has only a combined ford list, show them as likely.
  if(!confirmedFordKms.length&&!likelyFordKms.length){
    fordKms.forEach(k=>addMarker(k,'likely'));
  }

  setTimeout(()=>{try{fordLeafletMap.invalidateSize()}catch(e){}},120);
}
function renderMapAnalysis(result){
  const {samples,summary,elements=[]}=result;
  const crossings=analyzeWaterCrossings(samples,elements);

  // v0.0245: analyzeWaterCrossings already groups by OSM water object first,
  // then deduplicates only near-identical physical crossings.
  const bridgeKms=(crossings.bridges||[]).slice();
  const confirmedFordKms=(crossings.confirmed||[]).slice();

  // v0.0259: on city/road races, an early generic water intersection is
  // usually a false ford (stream/culvert/road drainage). Do not count
  // probable fords in the first 1 km on predominantly paved routes.
  // Explicit OSM ford tags remain untouched.
  const urbanLike=Number(summary?.paved||0)>=70
    && (Number(summary?.trail||0)+Number(summary?.dirt||0))<=20;
  const urbanStartIgnoreKm=Math.min(1.0, Math.max(0.2, Number(state.dist||0)*0.10));
  const likelyFordKms=(crossings.likely||[]).slice().filter(k=>
    !(urbanLike && Number(k)<urbanStartIgnoreKm)
  );
  const fordKms=[...confirmedFordKms,...likelyFordKms]
    .filter(Number.isFinite)
    .sort((a,b)=>a-b)
    .filter((v,i,a)=>i===0 || Math.abs(v-a[i-1])>0.05);
  state.mapAnalysis={
    result,
    samples:[...samples],
    summary:{...summary},
    fordKms:[...fordKms],
    fordCount:fordKms.length,
    bridgeKms:[...bridgeKms],
    confirmedFordKms:[...confirmedFordKms],
    likelyFordKms:[...likelyFordKms]
  };
  state.mapAnalysisReadyForCurrentGpx=true;
  if(window.innerWidth>800){
    renderFordMap(fordKms,confirmedFordKms,likelyFordKms,bridgeKms);
  }

  // New route analysis becomes the source of automatic segment boundaries.
  // Reset any previously entered manual table step back to AUTO.
  const stepEl=$('forecastStepKm');
  if(stepEl) stepEl.value='';
  if($('recalcForecastStepBtn')){
    $('recalcForecastStepBtn').disabled=true;
    setActionState('recalcForecastStepBtn','idle');
  }

  applyForecastModeColors();

  $('mapAnalysisResults').style.display='block';
  ensureAnalysisTrackScheme();
  setTimeout(()=>{try{drawFordScheme()}catch(e){console.error(e)}},60);
  $('coverageMetric').textContent=summary.coverage.toFixed(0)+'%';
  $('wetlandMetric').textContent=summary.wetland.toFixed(1)+'%';
  $('waterCrossMetric').textContent=summary.water.toFixed(1)+'%';
  $('trailMetric').textContent=summary.trail.toFixed(1)+'%';
  $('dirtMetric').textContent=summary.dirt.toFixed(1)+'%';
  $('pavedMetric').textContent=summary.paved.toFixed(1)+'%';

  const fordCount=$('fordCountMetric');
  if(fordCount) fordCount.textContent=String(fordKms.length);

  const fordList=$('fordKmList');
  if(fordList){
    if(fordKms.length){
      const parts=[];
      if(confirmedFordKms.length) parts.push('подтверждённые OSM: '+confirmedFordKms.map(x=>x.toFixed(1)).join(', '));
      if(likelyFordKms.length) parts.push('вероятные по пересечению воды: '+likelyFordKms.map(x=>x.toFixed(1)).join(', '));
      fordList.textContent='Броды ('+fordKms.length+'): '+parts.join(' · ');
    }else{
      fordList.textContent='Броды: не обнаружены';
    }
  }

  const bridgeList=$('bridgeFordKmList');
  if(bridgeList) bridgeList.textContent=bridgeKms.length
    ? 'Пересечение воды по мосту на км: '+bridgeKms.map(x=>x.toFixed(1)).join(', ')
    : 'По мосту: не обнаружено';

  $('mapAnalysisNote').textContent=result?.osmUnavailable
    ? 'OSM-серверы временно недоступны. Профиль GPX сохранён; повторите анализ позже для покрытия и бродов.'
    : `OSM-классификация маршрута. Броды в пределах 400 м объединяются в один; рукава одной реки также объединяются, мосты исключаются.${urbanLike ? ' На преимущественно асфальтовом городском маршруте вероятные броды в первом километре не учитываются.' : ''} Неизвестно: ${(100-summary.coverage).toFixed(0)}%.`;
  drawSurfaceStrip(samples);
  requestAnimationFrame(()=>drawFordScheme());
}

function terrainMultiplier(){
  return 1.0;
}

function paceSec(s){
  const m=String(s).match(/(\d+):(\d+)/); return m?+m[1]*60 + +m[2]:330;
}
function hms(sec){
  sec=Math.max(0,Math.round(sec)); const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function paceFmt(sec){
  sec=Math.round(sec); return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
}

async function inflateRaw(bytes){
  if(typeof DecompressionStream==='undefined') throw new Error('Safari слишком старый для автономного XLSX. Сохраните файл как CSV.');
  const ds=new DecompressionStream('deflate-raw');
  const stream=new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function u16(a,o){return a[o]|(a[o+1]<<8)}
function u32(a,o){return (a[o]|(a[o+1]<<8)|(a[o+2]<<16)|(a[o+3]<<24))>>>0}
async function unzipXlsx(arrayBuffer){
  const a=new Uint8Array(arrayBuffer), files={};
  let eocd=-1;
  for(let i=a.length-22;i>=Math.max(0,a.length-65557);i--){
    if(u32(a,i)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0) throw new Error('Некорректный XLSX/ZIP');
  const total=u16(a,eocd+10), cdOff=u32(a,eocd+16);
  let p=cdOff;
  for(let n=0;n<total;n++){
    if(u32(a,p)!==0x02014b50) break;
    const method=u16(a,p+10), compSize=u32(a,p+20);
    const nameLen=u16(a,p+28), extraLen=u16(a,p+30), commentLen=u16(a,p+32);
    const localOff=u32(a,p+42);
    const name=new TextDecoder().decode(a.slice(p+46,p+46+nameLen));
    if(u32(a,localOff)!==0x04034b50) throw new Error('Ошибка ZIP');
    const ln=u16(a,localOff+26), le=u16(a,localOff+28);
    const dataStart=localOff+30+ln+le;
    const comp=a.slice(dataStart,dataStart+compSize);
    let raw;
    if(method===0) raw=comp;
    else if(method===8) raw=await inflateRaw(comp);
    else throw new Error('Неподдерживаемое сжатие XLSX');
    files[name]=raw;
    p+=46+nameLen+extraLen+commentLen;
  }
  return files;
}
function xmlText(bytes){
  return new TextDecoder('utf-8').decode(bytes);
}
function colIndex(cellRef){
  const m=String(cellRef).match(/[A-Z]+/i); if(!m)return 0;
  let x=0; for(const ch of m[0].toUpperCase()) x=x*26+(ch.charCodeAt(0)-64);
  return x-1;
}
async function parseXlsxOffline(arrayBuffer){
  const files=await unzipXlsx(arrayBuffer);
  let shared=[];
  if(files['xl/sharedStrings.xml']){
    const doc=new DOMParser().parseFromString(xmlText(files['xl/sharedStrings.xml']),'application/xml');
    shared=[...doc.getElementsByTagNameNS('*','si')].map(si=>[...si.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join(''));
  }
  let sheetName=Object.keys(files).find(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x));
  if(!sheetName) throw new Error('Лист XLSX не найден');
  const doc=new DOMParser().parseFromString(xmlText(files[sheetName]),'application/xml');
  const rows=[];
  [...doc.getElementsByTagNameNS('*','row')].forEach(r=>{
    const vals=[];
    [...r.getElementsByTagNameNS('*','c')].forEach(c=>{
      const idx=colIndex(c.getAttribute('r')||'A1');
      const t=c.getAttribute('t')||'';
      const v=c.getElementsByTagNameNS('*','v')[0];
      let val='';
      if(v){
        val=v.textContent;
        if(t==='s') val=shared[parseInt(val,10)] ?? val;
      } else {
        const inline=c.getElementsByTagNameNS('*','t')[0];
        if(inline) val=inline.textContent;
      }
      vals[idx]=val;
    });
    rows.push(vals);
  });
  if(!rows.length)return [];
  const headers=rows[0].map((x,i)=>String(x||`col_${i+1}`).trim());
  return rows.slice(1).filter(r=>r.some(v=>String(v??'').trim()!=='')).map(r=>{
    const o={}; headers.forEach((h,i)=>o[h]=r[i]??''); return o;
  });
}

let selectedRosterFile=null;
$('rosterFile').addEventListener('change',e=>{
  selectedRosterFile=e.currentTarget.files&&e.currentTarget.files[0];
  if(!selectedRosterFile){
    $('rosterName').innerHTML='<span class="file-check">○</span> Файл не выбран';
    $('rosterLoadBtn').disabled=true;setActionState('rosterLoadBtn','idle');$('rosterStatus').textContent='1. Выберите файл стартового списка.';
    if($('itraLookupBtn')){$('itraLookupBtn').disabled=true;setActionState('itraLookupBtn','idle');}
    if($('saveItraRosterBtn')){$('saveItraRosterBtn').disabled=true;setActionState('saveItraRosterBtn','idle');}
    return;
  }
  $('rosterName').innerHTML='<span class="file-check selected">✓</span> Выбран: '+selectedRosterFile.name;
  $('rosterLoadBtn').disabled=false;setActionState('rosterLoadBtn','ready');$('rosterStatus').textContent='2. Файл выбран. Нажмите кнопку загрузки.';
});
$('rosterLoadBtn').addEventListener('click',async ()=>{
  if(!selectedRosterFile)return;
  const btn=$('rosterLoadBtn'),p=$('rosterProgress');btn.disabled=true;setActionState('rosterLoadBtn','working');p.style.display='block';p.value=15;
  try{
    let rows=[]; const f=selectedRosterFile;$('rosterStatus').textContent='⏳ Читаю стартовый список…';
    if(f.name.toLowerCase().endsWith('.csv')) rows=parseCSV(await f.text());
    else rows=await parseXlsxOffline(await f.arrayBuffer());
    p.value=75;state.roster=normalizeRoster(rows);renderRoster();p.value=100;
    $('rosterStatus').textContent='✓ Обычный стартовый список загружен: '+state.roster.length+' участников.';
    activeItraRoster=false;
    simpleRosterBackup=(state.roster||[]).map(r=>({...r,_raw:{...(r._raw||{})}}));
    setItraRosterActiveUi(false);
    if($('itraLookupBtn')){
      $('itraLookupBtn').disabled=false;
      setActionState('itraLookupBtn','ready');
    }
    if($('saveItraRosterBtn')){
      const hasPi=state.roster.some(r=>Number(r.pi)>0);
      $('saveItraRosterBtn').disabled=!hasPi;
      setActionState('saveItraRosterBtn',hasPi?'ready':'idle');
    }
    if($('itraLookupStatus')) $('itraLookupStatus').textContent=state.roster.length
      ? `✓ Обычный список загружен: ${state.roster.length}. При необходимости ниже можно заменить его отдельным списком с баллами ITRA.`
      : 'В списке нет участников.';
    setActionState('rosterLoadBtn','success');setTimeout(()=>p.style.display='none',1000);
  }catch(err){p.style.display='none';$('rosterStatus').textContent='✕ '+(err.message||err);setActionState('rosterLoadBtn','error');}
  finally{btn.disabled=false;}
});
function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(Boolean), sep=(lines[0].split(';').length>lines[0].split(',').length?';':',');
  const h=lines[0].split(sep).map(x=>x.trim());
  return lines.slice(1).map(l=>{const v=l.split(sep); let o={};h.forEach((k,i)=>o[k]=v[i]??'');return o;});
}
function normalizeRoster(rows){
  if(!rows.length)return [];
  const keys=Object.keys(rows[0]), norm=s=>String(s).toLowerCase().replace(/[_\-./]+/g,' ');
  const pick=arr=>keys.find(k=>arr.some(a=>norm(k)===a||norm(k).includes(a)));
  const sur=pick(['фамилия','surname','last name']), nam=pick(['имя','first name','name']);
  const fio=pick(['фио','спортсмен','участник','athlete','runner']);
  const gen=pick(['пол','gender','sex']), pi=pick(['itra pi','itra','performance index','рейтинг','pi']);
  return rows.map(r=>{
    let athlete=fio?String(r[fio]).trim():[nam?r[nam]:'',sur?r[sur]:''].join(' ').trim();
    return {athlete, gender:gen?String(r[gen]):'', pi:pi?parseFloat(r[pi])||0:0, tech:0,end:0,form:0, _raw:{...r}};
  }).filter(x=>x.athlete);
}
function genderOkay(g){
  const mode=($('genderFilter')?.value||'Все'), s=String(g).toLowerCase();
  if(mode==='Все')return true;
  if(mode==='Женщины')return s.startsWith('ж')||s==='f'||s.includes('female');
  return s.startsWith('м')||s==='m'||s.includes('male');
}
function renderRoster(){
  const tb=$('rosterTable').querySelector('tbody'); tb.innerHTML='';
  const athlete=($('athleteName')?.value||'').trim().toLowerCase();
  state.roster.filter(x=>genderOkay(x.gender)).forEach((r,i)=>{
    if(r.athlete.toLowerCase()===athlete && !r.pi) r.pi=+$('itraPi').value||0;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.athlete}</td>
      <td><input type="number" value="${r.pi}" data-i="${i}" data-k="pi"></td>
      <td><input type="number" value="${r.tech}" data-i="${i}" data-k="tech"></td>
      <td><input type="number" value="${r.end}" data-i="${i}" data-k="end"></td>
      <td><input type="number" value="${r.form}" data-i="${i}" data-k="form"></td>`;
    tb.appendChild(tr);
  });
  tb.querySelectorAll('input').forEach(inp=>inp.addEventListener('change',()=>{
    const visible=state.roster.filter(x=>genderOkay(x.gender));
    visible[+inp.dataset.i][inp.dataset.k]=+inp.value||0;
  }));
}
$('genderFilter')?.addEventListener('change',renderRoster);

function estimateLTHR(){
  const known=+$('lthr').value||0; if(known)return known;
  const hr=+$('refAvgHr').value||0, mins=trainingMovingMinutes()||100;
  if(mins<=50)return Math.round(hr*.98);
  if(mins<=100)return Math.round(hr*1.01);
  return Math.round(hr*1.03);
}

function movingTimeMinutes(){
  const el=$('refMinutes');
  if(!el) return 0;
  const s=String(el.value||'').trim().replace(',','.');
  let m=s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if(m) return Number(m[1])*60+Number(m[2])+Number(m[3])/60;
  m=s.match(/^(\d{1,3}):(\d{2})$/);
  if(m) return Number(m[1])+Number(m[2])/60;
  const n=Number(s);
  return Number.isFinite(n)?n:0;
}


function trainingMovingMinutes(){
  const el=$('refMinutes');
  if(!el) return 0;
  const s=String(el.value||'').trim().replace(',','.');
  let m=s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if(m) return Number(m[1])*60+Number(m[2])+Number(m[3])/60;
  m=s.match(/^(\d{1,3}):(\d{2})$/);
  if(m) return Number(m[1])+Number(m[2])/60;
  const n=Number(s);
  return Number.isFinite(n)?n:0;
}

function formScore(){
  let s=0;
  const d=+$('refDist').value||0,g=+$('refGain').value||0,hr=+$('refAvgHr').value||0;
  if(d>=25)s+=4; else if(d>=15)s+=2;
  if(g>=800)s+=3; else if(g>=500)s+=2;
  if(hr>=180)s+=2;
  if(state.shots.length>=3)s+=2;
  return Math.min(12,s);
}

function hasAnalysisData(){
  const pi=Number($('itraPi')?.value||0);
  const training=
    Number($('refDist')?.value||0)>0 ||
    Number($('refGain')?.value||0)>0 ||
    Number($('refAvgHr')?.value||0)>0 ||
    (Array.isArray(state.shots) && state.shots.length>0);
  const roster=Array.isArray(state.roster) && state.roster.length>0;
  return Number(state.dist||0)>0 && (pi>0 || training || roster);
}

function clearResultForecast(){
  ['finishMetric','podiumMetric','top10Metric','top30Metric','top50Metric','winMetric','rankMetric']
    .forEach(id=>{
      const el=$(id);
      if(el) el.textContent='—';
    });

  const pt=$('planTable')?.querySelector('tbody');
  if(pt) pt.innerHTML='';
  const rt=$('rivalsTable')?.querySelector('tbody');
  if(rt) rt.innerHTML='';
}


function getBestTrainingHr(){
  const cal=trainingHrCalibration();
  return cal ? cal.upperWorkingHr : 0;
}

function buildHrStrategy(){
  const dist=Number(state.dist||0);
  const cal=trainingHrCalibration();
  if(!(dist>0) || !cal) return [];

  const clamp=(x,a,b)=>Math.max(a,Math.min(b,Math.round(x)));
  const sustainable=cal.sustainableHr;
  const upper=cal.upperWorkingHr;
  const threshold=cal.thresholdHr;
  const finish=cal.finishCeiling;

  // Long-race guidance is now bounded by BOTH endurance GPXs and the observed
  // fast-session distribution.
  const earlyLo=clamp(sustainable-7,120,195);
  const earlyHi=clamp(Math.min(upper-8,sustainable+1),earlyLo,198);

  const midLo=clamp(sustainable-3,120,198);
  const midHi=clamp(Math.min(upper-3,threshold-3),midLo,200);

  const lateLo=clamp(Math.max(sustainable,upper-6),120,200);
  const lateHi=clamp(Math.min(threshold+1,upper+2),lateLo,202);

  const finishLo=clamp(Math.max(upper-2,threshold-4),120,202);
  const finishHi=clamp(finish,finishLo,205);

  const p1=Math.max(1,Math.round(dist*0.35));
  const p2=Math.max(p1+1,Math.round(dist*0.70));
  const p3=Math.max(p2+1,Math.round(dist*0.92));

  return [
    {
      km:`0–${p1} км`,
      hr:`${earlyLo}–${earlyHi}`,
      mode:'Контролируемый старт. На подъёмах допустим короткий выход к верхней границе, но без раннего закисления.'
    },
    {
      km:`${p1}–${p2} км`,
      hr:`${midLo}–${midHi}`,
      mode:'Рабочая зона по данным тренировочных GPX. На спусках пульс специально не удерживать.'
    },
    {
      km:`${p2}–${p3} км`,
      hr:`${lateLo}–${lateHi}`,
      mode:'При нормальном питании и состоянии можно постепенно переходить к верхнему рабочему диапазону.'
    },
    {
      km:`${p3}–${dist.toFixed(1).replace(/\.0$/,'')} км`,
      hr:`${finishLo}–${finishHi}`,
      mode:'Финишный блок. Верхняя граница основана на реально наблюдавшемся HR скоростной тренировки.'
    }
  ];
}

function renderHrStrategy(){
  const tbody=$('hrStrategyTable')?.querySelector('tbody');
  const summary=$('hrStrategySummary');
  if(!tbody || !summary) return;

  const rows=buildHrStrategy();
  tbody.innerHTML='';

  if(!rows.length){
    summary.textContent='Нужны GPX трассы и тренировочные GPX с HR.';
    return;
  }

  rows.forEach(r=>{
    tbody.insertAdjacentHTML('beforeend',
      `<tr><td>${r.km}</td><td><b>${r.hr}</b></td><td>${r.mode}</td></tr>`);
  });

  const cal=trainingHrCalibration();
  summary.textContent=
    `HR-модель по распределению тренировок: устойчивый ${Math.round(cal.sustainableHr)}, `
    + `скоростной рабочий ${Math.round(cal.upperWorkingHr)}, `
    + `пороговый ориентир ${Math.round(cal.thresholdHr)} уд/мин.`;
}

function finishPrediction(){
  if(!state.dist)return 0;
  const base=paceSec($('basePace').value), tech=Math.max(1,computeTrailDifficulty().score), tm=terrainMultiplier();
  const climb=state.gain*1.0, downhill=Math.min(state.loss*.20,state.dist*18);
  let sec=(state.dist*base + climb - downhill)*tm*(1+tech*.018);
  sec*=1-formScore()*.004;
  return sec;
}
function score(r){
  const diff=(Math.max(1,computeTrailDifficulty().score))/10, tm=terrainMultiplier();
  const difficulty=Math.max(0,Math.min(1,(diff+(tm-1)/.35)/2));
  return (+r.pi||0)+(+r.tech||0)*(.55+.75*difficulty)+(+r.end||0)*(.75+.55*difficulty)+(+r.form||0)*.65;
}
function gaussian(){
  let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function monteCarlo(rows,name){
  const sigma=+$('sigma').value||20;
  const idx=rows.findIndex(r=>r.athlete.toLowerCase()===name.toLowerCase());
  if(idx<0)return null;

  let win=0,pod=0,top10=0,top30=0,top50=0,ranks=[];
  const iterations=10000;

  for(let n=0;n<iterations;n++){
    const p=rows.map(r=>score(r)+gaussian()*sigma);
    const me=p[idx];
    const rank=1+p.filter(x=>x>me).length;
    ranks.push(rank);

    if(rank===1)win++;
    if(rank<=3)pod++;
    if(rank<=10)top10++;
    if(rank<=30)top30++;
    if(rank<=50)top50++;
  }

  ranks.sort((a,b)=>a-b);
  return {
    win:win/iterations,
    pod:pod/iterations,
    top10:top10/iterations,
    top30:top30/iterations,
    top50:top50/iterations,
    rank:ranks[Math.floor(ranks.length/2)]
  };
}
function buildPlan(){
  const l=estimateLTHR(), rows=[], n=Math.max(6,Math.ceil(state.dist/5));
  for(let i=0;i<n;i++){
    const a=state.dist*i/n,b=state.dist*(i+1)/n,p=(i+.5)/n;
    let lo,hi,mode;
    if(p<.2){lo=.86;hi=.90;mode='Экономия'}
    else if(p<.55){lo=.88;hi=.92;mode='Ровная работа'}
    else if(p<.8){lo=.90;hi=.94;mode='Рабочий блок'}
    else if(p<.94){lo=.92;hi=.97;mode='Начать гонку'}
    else{lo=.95;hi=1.02;mode='Финиш'}
    const pace=paceSec($('basePace').value)*terrainMultiplier()*(1+(Math.max(1,computeTrailDifficulty().score))*.018);
    rows.push({km:`${a.toFixed(1)}–${b.toFixed(1)}`,hr:`${Math.round(l*lo)}–${Math.round(l*hi)}`,mode,pace:paceFmt(pace)});
  }
  return rows;
}
function threat(delta){
  if(delta>30)return 'очень высокая';if(delta>12)return 'высокая';if(delta>=-12)return 'прямая';if(delta>=-30)return 'умеренная';return 'низкая';
}

$('mapAnalyzeBtn')?.addEventListener('click',async ()=>{
const btn=$('mapAnalyzeBtn'), p=$('mapAnalyzeProgress');
  if(!state.track || !state.track.length){
    $('mapAnalyzeStatus').textContent='✕ Сначала обработайте GPX.';
    setActionState('mapAnalyzeBtn','error');
    return;
  }

  btn.disabled=true;
  setActionState('mapAnalyzeBtn','working');
  p.style.display='block';
  p.value=15;
  $('mapAnalyzeStatus').textContent='⏳ Анализ карты… дождитесь полного завершения.';
  const runningCard=$('mapAnalyzeRunningCard');
  if(runningCard) runningCard.style.display='grid';
  const rt=$('mapAnalyzeRunningTitle'); if(rt) rt.textContent='Анализ карты запущен…';
  const rtxt=$('mapAnalyzeRunningText'); if(rtxt) rtxt.textContent='Пожалуйста, подождите. Проверяю OSM и резервные источники; если они недоступны, GPX-анализ всё равно завершится.';
  const rr=$('mapAnalyzeRetryText'); if(rr) rr.textContent='';
  startMapAnalysisTimer();


  try{
    const result=await analyzeMapOSM();
    p.value=85;
    renderMapAnalysis(result); setTimeout(()=>{try{drawFordScheme();renderFordMap();}catch(e){}},120);
    p.value=100;
    stopMapAnalysisTimer();
    $('mapAnalyzeStatus').textContent=result?.osmUnavailable
      ? '⚠️ GPX проанализирован. OSM сейчас недоступен — покрытие и броды не определены.'
      : '✓ Анализ карты завершён.';
    if($('mapAnalyzeRunningCard')) $('mapAnalyzeRunningCard').style.display='none';
    setActionState('mapAnalyzeBtn','success');
    setTimeout(()=>{p.style.display='none'},900);
  }catch(err){
    stopMapAnalysisTimer();
    p.style.display='none';
    p.value=0;
    if(err?.message==='ANALYSIS_CANCELLED_BY_NEW_GPX'){
      $('mapAnalyzeStatus').textContent='⏹ Анализ карты остановлен: выбран новый GPX.';
      setActionState('mapAnalyzeBtn','idle');
    }else{
      $('mapAnalyzeStatus').textContent='✕ Ошибка анализа карты: '+(err.message||String(err));
    }
    if($('mapAnalyzeRunningCard')) $('mapAnalyzeRunningCard').style.display='none';
    setActionState('mapAnalyzeBtn','error');
  }finally{
      syncMapAnalyzeButton();
    restoreMapInfoNote();
  }
});




function getAthletePiElement(){
  return $('athletePi') || $('itraPi') || $('pi');
}

function getManualOpenRouterKey(){
  try{return localStorage.getItem('openRouterApiKey')||'';}catch(e){return '';}
}

async function refreshOpenRouterStatus(){
  const el=$('openRouterStatus');
  if(!el) return;
  if(navigator.onLine===false){
    el.textContent='офлайн';
    el.className='or-status or-bad';
    return;
  }
  el.textContent='проверка…';
  el.className='or-status or-checking';
  try{
    const manual=!!getManualOpenRouterKey();
    const r=await fetch('/health',{cache:'no-store'});
    const h=await r.json();
    if(manual){
      el.textContent='ключ на iPhone ✓';
      el.className='or-status or-ok';
    }else if(h.itra_enabled){
      el.textContent='сервер подключён ✓';
      el.className='or-status or-ok';
    }else{
      el.textContent='ключ не настроен ✕';
      el.className='or-status or-bad';
    }
  }catch(e){
    el.textContent=getManualOpenRouterKey()?'ключ на iPhone ✓':'статус недоступен';
    el.className='or-status '+(getManualOpenRouterKey()?'or-ok':'or-bad');
  }
}

function initOpenRouterKeyUI(){
  const input=$('openRouterKey');
  if(!input) return;
  input.value=getManualOpenRouterKey();

  $('saveOpenRouterKeyBtn')?.addEventListener('click',()=>{
    const key=input.value.trim();
    try{
      if(key) localStorage.setItem('openRouterApiKey',key);
      else localStorage.removeItem('openRouterApiKey');
    }catch(e){}
    refreshOpenRouterStatus();
  });

  $('clearOpenRouterKeyBtn')?.addEventListener('click',()=>{
    input.value='';
    try{localStorage.removeItem('openRouterApiKey');}catch(e){}
    refreshOpenRouterStatus();
  });

  refreshOpenRouterStatus();
}





let simpleRosterBackup=null;
let activeItraRoster=false;

function updateItraForecastButton(){
  const btn=$('saveItraRosterBtn');
  if(!btn) return;
  const ownPi=Number($('itraPi')?.value||0);
  const usable=(state.roster||[]).filter(r=>Number(r.pi)>0).length;
  btn.disabled=!(ownPi>0 && usable>0);
  setActionState('saveItraRosterBtn',btn.disabled?'idle':'ready');

  if($('saveItraRosterStatus') && btn.disabled){
    $('saveItraRosterStatus').textContent=
      usable<=0
        ? 'Сначала загрузите список с баллами ITRA.'
        : 'Введите свой ITRA PI, чтобы рассчитать прогноз.';
  }
}

function setItraRosterActiveUi(active,loaded=0,withPi=0){
  activeItraRoster=!!active;
  const ordinaryFile=$('rosterFile');
  const ordinaryBtn=$('rosterLoadBtn');
  const resetBtn=$('resetItraRosterBtn');
  const notice=$('itraRosterActiveNotice');

  if(active){
    if(ordinaryFile) ordinaryFile.disabled=true;
    if(ordinaryBtn) ordinaryBtn.disabled=true;
    if(resetBtn) resetBtn.style.display='block';
    if(notice){
      notice.style.display='block';
      notice.textContent=`✓ Список с баллами ITRA активен: ${withPi} из ${loaded} участников с PI. Обычный стартовый список отключён и в расчёте не используется.`;
    }
    if($('rosterStatus')){
      $('rosterStatus').textContent='ℹ️ Обычный стартовый список временно отключён: используется загруженный список с ITRA.';
    }
  }else{
    if(ordinaryFile) ordinaryFile.disabled=false;
    if(ordinaryBtn) ordinaryBtn.disabled=!selectedRosterFile;
    if(resetBtn) resetBtn.style.display='none';
    if(notice) notice.style.display='none';
    if($('rosterStatus')){
      $('rosterStatus').textContent=selectedRosterFile
        ? '2. Файл выбран. Нажмите кнопку загрузки.'
        : '1. Выберите файл стартового списка.';
    }
  }
  updateItraForecastButton();
}

$('itraLookupBtn')?.addEventListener('click',()=>{
  $('itraRosterFile')?.click();
});

$('itraRosterFile')?.addEventListener('change',async e=>{
  const f=e.currentTarget.files?.[0];
  if(!f) return;

  const btn=$('itraLookupBtn');
  btn.disabled=true;
  setActionState('itraLookupBtn','working');
  if($('itraLookupStatus')) $('itraLookupStatus').textContent='⏳ Загружаю список с баллами ITRA…';

  try{
    let rows=[];
    if(f.name.toLowerCase().endsWith('.csv')) rows=parseCSV(await f.text());
    else rows=await parseXlsxOffline(await f.arrayBuffer());

    const normalized=normalizeRoster(rows);
    const withPi=normalized.filter(r=>Number(r.pi)>0).length;

    if(!normalized.length) throw new Error('В файле не найдено участников.');
    if(!withPi) throw new Error('В файле не найдена колонка с баллами ITRA / PI.');

    if(!activeItraRoster){
      simpleRosterBackup=(state.roster||[]).map(r=>({...r,_raw:{...(r._raw||{})}}));
    }

    state.roster=normalized;
    renderRoster();
    setItraRosterActiveUi(true,normalized.length,withPi);

    if($('itraLookupStatus')){
      $('itraLookupStatus').textContent=`✓ Загружен ${f.name}: ${normalized.length} участников, PI найден у ${withPi}.`;
    }
    btn.textContent='✓ Список с баллами ITRA активен';
    setActionState('itraLookupBtn','success');
  }catch(err){
    if($('itraLookupStatus')) $('itraLookupStatus').textContent='✕ '+(err.message||String(err));
    setActionState('itraLookupBtn','error');
  }finally{
    btn.disabled=false;
    e.currentTarget.value='';
  }
});

$('resetItraRosterBtn')?.addEventListener('click',()=>{
  if(simpleRosterBackup){
    state.roster=simpleRosterBackup.map(r=>({...r,_raw:{...(r._raw||{})}}));
    renderRoster();
  }
  activeItraRoster=false;
  setItraRosterActiveUi(false);
  if($('itraLookupBtn')){
    $('itraLookupBtn').textContent='Загрузить список с баллами ITRA';
    setActionState('itraLookupBtn','ready');
  }
  if($('itraLookupStatus')) $('itraLookupStatus').textContent='Список ITRA отключён. Снова используется обычный стартовый список.';
});

$('itraPi')?.addEventListener('input',updateItraForecastButton);



function csvEscape(value){
  const s=String(value??'');
  return /[;"\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}

function buildEnrichedRosterCsv(){
  const rows=state.roster||[];
  if(!rows.length) return '';

  // Preserve the original columns when possible and append/overwrite ITRA PI.
  const rawHeaders=[];
  rows.forEach(r=>{
    Object.keys(r._raw||{}).forEach(k=>{
      if(!rawHeaders.includes(k)) rawHeaders.push(k);
    });
  });

  const normalizedHeaderNames=rawHeaders.map(h=>String(h).toLowerCase().replace(/[_\-./]+/g,' '));
  let piHeaderIndex=normalizedHeaderNames.findIndex(h=>
    h==='pi' || h.includes('itra pi') || h==='itra' || h.includes('performance index') || h.includes('рейтинг')
  );

  const headers=[...rawHeaders];
  if(piHeaderIndex<0){
    headers.push('ITRA PI');
    piHeaderIndex=headers.length-1;
  }

  // If original file had no usable columns, create a compact useful file.
  if(headers.length===1 && headers[0]==='ITRA PI'){
    headers.unshift('Спортсмен','Пол');
    piHeaderIndex=2;
  }

  const lines=[headers.map(csvEscape).join(';')];

  rows.forEach(r=>{
    const raw=r._raw||{};
    const values=headers.map(h=>{
      if(h==='ITRA PI' && !(h in raw)) return Number(r.pi)||0;
      return raw[h]??'';
    });

    // overwrite whichever original PI column was detected
    if(piHeaderIndex>=0) values[piHeaderIndex]=Number(r.pi)||0;

    // fallback compact columns
    if(headers[0]==='Спортсмен'){
      values[0]=r.athlete||'';
      values[1]=r.gender||'';
    }

    lines.push(values.map(csvEscape).join(';'));
  });

  return '\ufeff'+lines.join('\r\n');
}

$('saveItraRosterBtn')?.addEventListener('click',()=>{
  const ownPi=Number($('itraPi')?.value||0);
  const competitors=(state.roster||[])
    .filter(r=>Number(r.pi)>0)
    .map(r=>({...r}));

  if(!(ownPi>0)){
    if($('saveItraRosterStatus')) $('saveItraRosterStatus').textContent='Введите свой ITRA PI.';
    updateItraForecastButton();
    return;
  }
  if(!competitors.length){
    if($('saveItraRosterStatus')) $('saveItraRosterStatus').textContent='Сначала загрузите список с баллами ITRA.';
    updateItraForecastButton();
    return;
  }

  const myName='Я · ITRA '+Math.round(ownPi);
  const rows=[...competitors,{athlete:myName,gender:'',pi:ownPi,tech:0,end:0,form:0}];
  const mc=monteCarlo(rows,myName);
  const medianRank=mc?.rank || (1+competitors.filter(r=>Number(r.pi)>ownPi).length);

  if($('podiumMetric')) $('podiumMetric').textContent=mc?(mc.pod*100).toFixed(1)+'%':'—';
  if($('top10Metric')) $('top10Metric').textContent=mc?(mc.top10*100).toFixed(1)+'%':'—';
  if($('top30Metric')) $('top30Metric').textContent=mc?(mc.top30*100).toFixed(1)+'%':'—';
  if($('top50Metric')) $('top50Metric').textContent=mc?(mc.top50*100).toFixed(1)+'%':'—';
  if($('winMetric')) $('winMetric').textContent=mc?(mc.win*100).toFixed(1)+'%':'—';
  if($('rankMetric')) $('rankMetric').textContent=String(medianRank);
  if($('finishMetric')){
    $('finishMetric').textContent=state.raceForecast?.totalSec ? hms(state.raceForecast.totalSec) : 'по ITRA';
  }

  const ranked=[...competitors].sort((a,b)=>Number(b.pi)-Number(a.pi));
  const rt=$('rivalsTable')?.querySelector('tbody');
  if(rt){
    rt.innerHTML='';
    ranked.slice(0,10).forEach((r,i)=>{
      rt.insertAdjacentHTML('beforeend',
        `<tr><td>${i+1}</td><td>${r.athlete}</td><td>${r.pi||0}</td><td>${Number(r.pi||0).toFixed(0)}</td><td>${Number(r.pi)>ownPi?'выше PI':Math.abs(Number(r.pi)-ownPi)<=15?'рядом':'ниже PI'}</td></tr>`);
    });
  }

  if($('saveItraRosterStatus')){
    $('saveItraRosterStatus').textContent=
      `✓ Прогноз рассчитан: медианное место ${medianRank} из ${rows.length}. Мой ITRA PI: ${Math.round(ownPi)}.`;
  }
  setActionState('saveItraRosterBtn','success');

  document.querySelector('[data-tab="result"]')?.click();
});


// ---------- Race forecast calibrated from a timed reference activity ----------
// Model:
// ln(v) = a + b1*G+ + b2*G+^2 + b3*G- + b4*G-^2 + b5*progress
// v = speed in m/s, G+/G- = positive/negative decimal grade,
// progress = 0..1 through the race.
// "Effort %" scales speed relative to the reference activity.

function fmtClockSec(sec){
  if(!Number.isFinite(sec) || sec<0) return '—';
  sec=Math.round(sec);
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return h>0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
}

function fmtPaceSecPerKm(sec){
  if(!Number.isFinite(sec) || sec<=0) return '—';
  let m=Math.floor(sec/60), s=Math.round(sec%60);
  if(s===60){m++;s=0;}
  return `${m}:${String(s).padStart(2,'0')} /км`;
}

function solveLinearSystem(A,b){
  const n=b.length;
  const M=A.map((r,i)=>r.slice().concat([b[i]]));
  for(let col=0;col<n;col++){
    let pivot=col;
    for(let r=col+1;r<n;r++) if(Math.abs(M[r][col])>Math.abs(M[pivot][col])) pivot=r;
    if(Math.abs(M[pivot][col])<1e-10) return null;
    [M[col],M[pivot]]=[M[pivot],M[col]];
    const div=M[col][col];
    for(let c=col;c<=n;c++) M[col][c]/=div;
    for(let r=0;r<n;r++){
      if(r===col) continue;
      const f=M[r][col];
      for(let c=col;c<=n;c++) M[r][c]-=f*M[col][c];
    }
  }
  return M.map(r=>r[n]);
}

function fitRaceModel(samples){
  // x=[1,up,up²,down,down²,progress], y=ln(speed)
  const n=6;
  const ATA=Array.from({length:n},()=>Array(n).fill(0));
  const ATy=Array(n).fill(0);
  for(const s of samples){
    const up=Math.max(s.grade,0), dn=Math.max(-s.grade,0);
    const x=[1,up,up*up,dn,dn*dn,s.progress];
    const y=Math.log(s.speed);
    for(let i=0;i<n;i++){
      ATy[i]+=x[i]*y;
      for(let j=0;j<n;j++) ATA[i][j]+=x[i]*x[j];
    }
  }
  return solveLinearSystem(ATA,ATy);
}

function parseTimedActivityGPX(text){
  const xml=new DOMParser().parseFromString(text,'application/xml');
  if(xml.querySelector('parsererror')) throw new Error('Некорректный GPX activity');
  let nodes=[...xml.getElementsByTagName('trkpt')];
  if(!nodes.length) nodes=[...xml.getElementsByTagNameNS('*','trkpt')];
  if(nodes.length<10) throw new Error('Слишком мало точек в activity');

  const pts=[];
  let km=0,prev=null,gain=0;
  for(const n of nodes){
    const lat=Number(n.getAttribute('lat')), lon=Number(n.getAttribute('lon'));
    const e=n.getElementsByTagName('ele')[0]||n.getElementsByTagNameNS('*','ele')[0];
    const t=n.getElementsByTagName('time')[0]||n.getElementsByTagNameNS('*','time')[0];

    let hrNode=null;
    const descendants=[...n.getElementsByTagName('*')];
    hrNode=descendants.find(x=>String(x.localName||x.nodeName||'').toLowerCase()==='hr')||null;

    const ele=e?Number(e.textContent):NaN;
    const ts=t?Date.parse(t.textContent):NaN;
    const hr=hrNode?Number(hrNode.textContent):NaN;
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!Number.isFinite(ele)||!Number.isFinite(ts)) continue;
    if(prev){
      const d=haversine(prev.lat,prev.lon,lat,lon)/1000;
      if(Number.isFinite(d)&&d<5) km+=d;
      const de=ele-prev.ele;
      if(de>0) gain+=de;
    }
    pts.push({km,lat,lon,ele,ts,hr:Number.isFinite(hr)&&hr>=50&&hr<=230?hr:NaN});
    prev={lat,lon,ele};
  }
  if(pts.length<10 || pts[pts.length-1].km<1) throw new Error('Недостаточно данных activity');

  const totalKm=pts[pts.length-1].km;
  const samples=[];
  let st=0;
  for(let i=1;i<pts.length;i++){
    if(pts[i].km-pts[st].km>=0.20){
      const dm=(pts[i].km-pts[st].km)*1000;
      const de=pts[i].ele-pts[st].ele;
      const dt=(pts[i].ts-pts[st].ts)/1000;
      const speed=dm/dt;
      const grade=dm>0?de/dm:0;
      const progress=((pts[i].km+pts[st].km)/2)/totalKm;
      // reject stops, teleportation and extreme GPS spikes
      if(dt>=15 && dt<=1800 && speed>=0.20 && speed<=8 && Math.abs(grade)<0.60){
        const h1=Number(pts[st].hr),h2=Number(pts[i].hr);
        const hrs=[h1,h2].filter(x=>Number.isFinite(x)&&x>=50&&x<=230);
        const hr=hrs.length?hrs.reduce((a,b)=>a+b,0)/hrs.length:NaN;
        samples.push({speed,grade,progress,hr});
      }
      st=i;
    }
  }
  if(samples.length<20) throw new Error('Недостаточно валидных участков с временем');

  const coeff=fitRaceModel(samples);
  if(!coeff || coeff.some(x=>!Number.isFinite(x))) throw new Error('Не удалось откалибровать модель');

  const elapsedSec=(pts[pts.length-1].ts-pts[0].ts)/1000;
  const avgSpeed=(totalKm*1000)/Math.max(1,elapsedSec);

  const flatSpeeds=samples
    .filter(s=>Math.abs(Number(s.grade)||0)<=0.015)
    .map(s=>Number(s.speed))
    .filter(v=>Number.isFinite(v)&&v>0.5&&v<8)
    .sort((a,b)=>a-b);

  function q(arr,p){
    if(!arr.length) return NaN;
    const x=(arr.length-1)*p, lo=Math.floor(x), hi=Math.ceil(x);
    if(lo===hi) return arr[lo];
    return arr[lo]+(arr[hi]-arr[lo])*(x-lo);
  }

  const q50=q(flatSpeeds,0.50);
  const q75=q(flatSpeeds,0.75);
  const q85=q(flatSpeeds,0.85);
  const variability=(Number.isFinite(q85)&&Number.isFinite(q50)&&q50>0)?q85/q50:1;
  const fastWeight=Math.max(0.20,Math.min(0.65,(variability-1)*2.2+0.25));
  const calibratedFlatSpeed=Number.isFinite(q75)
    ? Math.max(avgSpeed*0.95,Math.min(avgSpeed*1.45,
        q75*(1-fastWeight)+(Number.isFinite(q85)?q85:q75)*fastWeight))
    : avgSpeed;

  const climbDensity=totalKm>0?gain/totalKm:0;
  const durationHours=elapsedSec/3600;

  const pointHrs=pts.map(p=>Number(p.hr)).filter(x=>Number.isFinite(x)&&x>=50&&x<=230);
  const avgHr=pointHrs.length?pointHrs.reduce((a,b)=>a+b,0)/pointHrs.length:NaN;
  const sortedHrs=pointHrs.slice().sort((a,b)=>a-b);
  const hrQ25=q(sortedHrs,0.25);
  const hrQ50=q(sortedHrs,0.50);
  const hrQ75=q(sortedHrs,0.75);
  const hrQ90=q(sortedHrs,0.90);
  const hrQ95=q(sortedHrs,0.95);
  const hrMax=sortedHrs.length?sortedHrs[sortedHrs.length-1]:NaN;
  const highHrThreshold=Number.isFinite(hrQ75)?hrQ75:avgHr;
  const highHrShare=(pointHrs.length && Number.isFinite(highHrThreshold))
    ? pointHrs.filter(v=>v>=highHrThreshold).length/pointHrs.length
    : 0;

  const hrSamples=samples.filter(s=>Number.isFinite(s.hr)&&s.hr>=50&&s.hr<=230);
  let hrSpeedSlope=30;
  if(hrSamples.length>=8){
    const xs=hrSamples.map(s=>s.speed/Math.max(0.5,avgSpeed));
    const ys=hrSamples.map(s=>s.hr);
    const mx=xs.reduce((a,b)=>a+b,0)/xs.length;
    const my=ys.reduce((a,b)=>a+b,0)/ys.length;
    const cov=xs.reduce((a,v,i)=>a+(v-mx)*(ys[i]-my),0);
    const vr=xs.reduce((a,v)=>a+(v-mx)*(v-mx),0);
    if(vr>1e-6) hrSpeedSlope=Math.max(10,Math.min(55,cov/vr));
  }

  return {
    coeff,
    source:'uploaded activity',
    segmentCount:samples.length,
    dist:totalKm,
    gain,
    elapsedSec,
    avgSpeed,
    avgHr:Number.isFinite(avgHr)?avgHr:0,
    hrPointCount:pointHrs.length,
    hrSpeedSlope,
    hrStats:{
      q25:Number.isFinite(hrQ25)?hrQ25:0,
      median:Number.isFinite(hrQ50)?hrQ50:0,
      q75:Number.isFinite(hrQ75)?hrQ75:0,
      q90:Number.isFinite(hrQ90)?hrQ90:0,
      q95:Number.isFinite(hrQ95)?hrQ95:0,
      max:Number.isFinite(hrMax)?hrMax:0,
      highShare:highHrShare
    },
    calibratedFlatSpeed,
    calibrationStats:{
      flatQ50:q50,
      flatQ75:q75,
      flatQ85:q85,
      variability,
      climbDensity,
      durationHours
    }
  };
}

function allRaceReferencesReady(){
  return !!(state.raceReferences?.strength && state.raceReferences?.fastTrail && state.raceReferences?.flatRace);
}

function combinedRaceModelInfo(){
  const r=state.raceReferences||{};
  if(!allRaceReferencesReady()) return null;

  const strength=r.strength;
  const fast=r.fastTrail;
  const flat=r.flatRace;

  const ss=strength.calibrationStats||{};
  const fs=fast.calibrationStats||{};

  const strengthLoad=
    Math.max(0,Number(ss.climbDensity||0))/35 * 0.55 +
    Math.max(0,Number(ss.durationHours||0))/4 * 0.45;

  const fastLoad=
    Math.max(0,Number(fs.climbDensity||0))/35 * 0.35 +
    Math.max(0,Number(fs.durationHours||0))/4 * 0.20 +
    Math.max(0,Number(fast.calibratedFlatSpeed||fast.avgSpeed||0))/4 * 0.45;

  const sum=Math.max(0.001,strengthLoad+fastLoad);
  const strengthW=Math.max(0.30,Math.min(0.75,strengthLoad/sum));
  const fastW=1-strengthW;

  const cs=strength.coeff, cf=fast.coeff;
  const gradeCoeff=[
    0,
    cs[1]*strengthW+cf[1]*fastW,
    cs[2]*strengthW+cf[2]*fastW,
    cs[3]*strengthW+cf[3]*fastW,
    cs[4]*strengthW+cf[4]*fastW
  ];

  const fatigueK=Math.max(-0.30,Math.min(0,
    Number(cs[5]||0)*strengthW+Number(cf[5]||0)*fastW
  ));

  const flatSpeed=Number(flat.calibratedFlatSpeed||flat.avgSpeed);
  const fastFlat=Number(fast.calibratedFlatSpeed||fast.avgSpeed);
  const fastTrailFactor=Math.pow(
    Math.max(0.94,Math.min(1.06,fastFlat/Math.max(0.1,flatSpeed))),
    0.12
  );

  return {flatSpeed,gradeCoeff,fatigueK,fastTrailFactor,strengthW,fastW};
}
function trainingHrCalibration(){
  const refsObj=state.raceReferences||{};
  const refs=Object.values(refsObj).filter(Boolean);
  const withHr=refs.filter(r=>Number(r.avgHr)>60 && Number(r.avgHr)<220);
  const manual=Number($('refAvgHr')?.value||state.bestTraining?.hr||0);
  const manualLthr=Number($('lthr')?.value||0);

  if(withHr.length){
    // Sustainable anchor: longer sessions are more representative of long-race HR.
    let wSum=0, sustainableSum=0, slopeSum=0, slopeW=0;
    for(const r of withHr){
      const hours=Math.max(0.4,Number(r.elapsedSec||0)/3600);
      const durationW=Math.max(0.65,Math.min(2.2,Math.sqrt(hours)));
      const med=Number(r.hrStats?.median||r.avgHr);
      const sustainable=(Number(r.avgHr)*0.55 + med*0.45);
      sustainableSum+=sustainable*durationW;
      wSum+=durationW;
      if(Number(r.hrSpeedSlope)>0){
        slopeSum+=Number(r.hrSpeedSlope)*durationW;
        slopeW+=durationW;
      }
    }

    const sustainableHr=sustainableSum/Math.max(0.001,wSum);

    // The short/flat speed reference is the best upper physiological anchor.
    // If it has HR, use its real distribution instead of pulling targets down
    // to the mean of all training files.
    const speedRef=(refsObj.flatRace && Number(refsObj.flatRace.avgHr)>60)
      ? refsObj.flatRace
      : withHr.slice().sort((a,b)=>(a.elapsedSec||0)-(b.elapsedSec||0))[0];

    const speedStats=speedRef?.hrStats||{};
    const speedAvg=Number(speedRef?.avgHr||0);
    const speedMedian=Number(speedStats.median||speedAvg);
    const speedQ75=Number(speedStats.q75||speedAvg);
    const speedQ90=Number(speedStats.q90||speedQ75||speedAvg);
    const speedQ95=Number(speedStats.q95||speedQ90||speedAvg);
    const speedMax=Number(speedStats.max||speedQ95||speedAvg);

    // Upper working HR is intentionally based mostly on the actual speed-race
    // average/median. q75/q90 are kept as threshold/finish ceilings.
    const upperWorkingHr=Math.max(
      sustainableHr,
      speedAvg*0.60 + speedMedian*0.25 + speedQ75*0.15
    );

    // Estimate threshold only from observed HR distribution; don't invent it
    // below the athlete's actual fast-session average.
    const estimatedLthr=manualLthr>0
      ? manualLthr
      : Math.max(upperWorkingHr+2, Math.min(speedQ90||upperWorkingHr+5, speedQ95||upperWorkingHr+8));

    return {
      anchorHr:sustainableHr,
      sustainableHr,
      upperWorkingHr,
      thresholdHr:estimatedLthr,
      finishCeiling:Math.max(estimatedLthr,Math.min(speedMax||estimatedLthr+6,estimatedLthr+10)),
      speedSlope:slopeW?slopeSum/slopeW:30,
      source:`GPX: ${withHr.length}/3 с HR; верхний ориентир ${Math.round(upperWorkingHr)}`,
      count:withHr.length,
      lthr:estimatedLthr,
      speedRefAvg:speedAvg,
      speedRefMedian:speedMedian,
      speedRefQ75:speedQ75,
      speedRefQ90:speedQ90,
      speedRefMax:speedMax
    };
  }

  if(manual>60){
    const lthr=manualLthr>0?manualLthr:manual+7;
    return {
      anchorHr:manual,sustainableHr:manual,upperWorkingHr:manual+4,
      thresholdHr:lthr,finishCeiling:lthr+6,speedSlope:30,
      source:'ручной средний пульс',count:0,lthr
    };
  }
  if(manualLthr>0){
    return {
      anchorHr:manualLthr*0.88,sustainableHr:manualLthr*0.88,
      upperWorkingHr:manualLthr*0.95,thresholdHr:manualLthr,
      finishCeiling:manualLthr+6,speedSlope:30,
      source:'LTHR',count:0,lthr:manualLthr
    };
  }
  return null;
}

function racePhysiologyFactors(predictedSec){
  const refs=Object.values(state.raceReferences||{}).filter(Boolean);
  const T=Math.max(0.5,predictedSec/3600);

  // Reference duration: prefer the longest uploaded effort because it best describes endurance.
  const longRef=refs.slice().sort((x,y)=>(y.elapsedSec||0)-(x.elapsedSec||0))[0];
  const Tref=Math.max(0.5,(longRef?.elapsedSec||3600)/3600);

  // Fatigue grows when target duration exceeds the athlete's longest uploaded reference.
  // k is intentionally meaningful for ultra/trail distances: pace must not stay at short-race level.
  const ratio=Math.max(1,T/Tref);
  const baseK=0.10;
  const extraK=Math.min(0.10,Math.max(0,ratio-1)*0.035);
  const k=baseK+extraK;
  const durationFactor=Math.max(0.78,Math.min(1.0,Math.pow(ratio,-k)));

  const vo2=Number($('vo2max')?.value||52);
  if(!(vo2>=20 && vo2<=90)) throw new Error('Введите VO₂max от 20 до 90 мл/кг/мин');
  const vo2Factor=Math.max(0.97,Math.min(1.03,1+(vo2-50)*0.002));

  const hrVals=refs.map(r=>Number(r.avgHr||0)).filter(x=>x>60);
  const avgHr=hrVals.length?hrVals.reduce((x,y)=>x+y,0)/hrVals.length:0;
  const lthr=Number($('lthr')?.value||0);

  let hrFactor=1,hrRatio=0,acidHours=0,acidSource='';
  if(avgHr>0 && lthr>0){
    hrRatio=avgHr/lthr;
    acidHours=hrRatio>=1.02?0.75:hrRatio>=0.98?1.5:hrRatio>=0.94?2.5:hrRatio>=0.90?4:hrRatio>=0.86?6:10;
    acidSource='HR/LTHR';
    if(T>acidHours) hrFactor=Math.max(0.88,Math.pow(acidHours/T,0.045));
  }else{
    acidHours=Math.max(1.0,Math.min(3.5,2.0+(vo2-50)*0.025));
    acidSource='VO₂max';
  }

  return {durationFactor,hrFactor,hrRatio,acidHours,exponent:k,vo2Factor,vo2,acidSource,
          targetHours:T,referenceHours:Tref,fatigueRatio:ratio};
}
function raceModelSpeed(grade,progress,effortPct=100,elapsedSec=0){
  const info=combinedRaceModelInfo();
  if(!info) return NaN;

  const g=Math.max(-0.45,Math.min(0.45,grade));
  const up=Math.max(g,0),dn=Math.max(-g,0);
  const c=info.gradeCoeff;

  const gradeFactor=Math.exp(
    c[1]*up+c[2]*up*up+c[3]*dn+c[4]*dn*dn
  );
  const fatigueFactor=Math.exp(
    info.fatigueK*Math.max(0,Math.min(1,progress))
  );
  const effortFactor=Math.max(70,Math.min(130,effortPct))/100;
  const phys=racePhysiologyFactors(elapsedSec);

  const v=info.flatSpeed*gradeFactor*info.fastTrailFactor*fatigueFactor*phys.durationFactor*phys.hrFactor*phys.vo2Factor*effortFactor;
  return Math.max(0.25,Math.min(7,v));
}

function buildRaceMicroSegments(){
  const tr=state.track||[];
  if(tr.length<2 || !(state.dist>0)) return [];
  const micro=[];
  let st=0;
  for(let i=1;i<tr.length;i++){
    const dkm=tr[i].km-tr[st].km;
    if(dkm>=0.20 || i===tr.length-1){
      const dm=Math.max(1,dkm*1000);
      const e0=Number(tr[st].ele),e1=Number(tr[i].ele);
      const de=Number.isFinite(e0)&&Number.isFinite(e1)?e1-e0:0;
      const grade=de/dm;
      const progress=((tr[i].km+tr[st].km)/2)/state.dist;
      micro.push({from:tr[st].km,to:tr[i].km,dm,de,grade,progress});
      st=i;
    }
  }
  return micro;
}


function riegelExponentForDistance(targetKm,refKm){
  const ratio=Math.max(1,targetKm/Math.max(0.1,refKm));
  // 10 km -> HM: classic Riegel ~1.06.
  // Longer targets get progressively more conservative.
  if(targetKm<=25) return 1.06;
  if(targetKm<=42.5) return 1.07;
  if(targetKm<=60) return 1.085;
  if(targetKm<=100) return 1.105;
  return 1.12;
}


function vo2SpeedForDistanceKm(vo2,km){
  const v=Number(vo2);
  const d=Math.max(5,Math.min(15,Number(km)||10));
  if(!(v>=20&&v<=90)) return null;

  // Conservative sustainable fraction of VO2max for a 5–15 km speed anchor.
  // 5 km ~93%, 10 km ~90%, 15 km ~87%.
  const frac=Math.max(0.87,Math.min(0.93,0.93-(d-5)*0.006));
  const targetO2=v*frac;

  // Daniels oxygen-cost relation, v in metres/min.
  const a=0.000104, b=0.182258, c=-4.60-targetO2;
  const disc=b*b-4*a*c;
  if(!(disc>0)) return null;
  const mPerMin=(-b+Math.sqrt(disc))/(2*a);
  if(!(mPerMin>0)) return null;
  return mPerMin/60; // m/s
}

function vo2AdjustedFlatCalibration(ref,vo2){
  const refKm=Math.max(5,Math.min(Number(ref?.dist||0),15));
  const fileSpeed=Math.max(0.5,Number(ref?.calibratedFlatSpeed||ref?.avgSpeed||0));
  const vo2Speed=vo2SpeedForDistanceKm(vo2,refKm);

  if(!(vo2Speed>0)){
    return {speed:fileSpeed,mode:'file',fileSpeed,vo2Speed:0,vo2Weight:0,refKm};
  }

  const filePace=1000/fileSpeed;
  const vo2Pace=1000/vo2Speed;

  // Only intervene when the uploaded "speed" file is clearly slower than
  // the conservative VO2-derived capability estimate.
  const slowRatio=filePace/vo2Pace;
  if(slowRatio<=1.08){
    return {speed:fileSpeed,mode:'file',fileSpeed,vo2Speed,vo2Weight:0,refKm,slowRatio};
  }

  // The slower the file, the more VO2 contributes, but never 100%.
  const vo2Weight=Math.max(0.25,Math.min(0.70,(slowRatio-1.08)*1.8+0.25));
  const speed=fileSpeed*(1-vo2Weight)+vo2Speed*vo2Weight;

  return {speed,mode:'blend',fileSpeed,vo2Speed,vo2Weight,refKm,slowRatio};
}

function flatRaceAnchorForTarget(){
  const ref=state.raceReferences?.flatRace;
  if(!ref || !(ref.dist>=5) || !(ref.elapsedSec>0)) return null;

  const targetKm=Number(state.dist||0);
  const exponent=riegelExponentForDistance(targetKm,ref.dist);
  const vo2=Number($('vo2max')?.value||52);

  const speedCal=vo2AdjustedFlatCalibration(ref,vo2);

  // v0.0259: for short races the real flat/speed GPX is the primary anchor.
  // If the target is essentially the same distance as the speed reference,
  // use the actually recorded pace directly instead of allowing q75/q85 or
  // VO2max to make the forecast faster than the reference performance.
  const rawSpeed=Math.max(0.5,Number(ref.avgSpeed||0));
  const refKm=Math.max(5,Math.min(ref.dist,15));
  const distanceRatio=targetKm/Math.max(0.1,refKm);
  const sameShortDistance=targetKm<=15 && distanceRatio>=0.90 && distanceRatio<=1.10;

  let calibrationSpeed=Math.max(0.5,speedCal.speed);
  let shortAnchorMode='normal';
  if(sameShortDistance){
    calibrationSpeed=rawSpeed;
    shortAnchorMode='raw-speed-file';
  }else if(targetKm<=15){
    // Nearby short distances still stay strongly tied to the real speed file.
    calibrationSpeed=rawSpeed*0.80+calibrationSpeed*0.20;
    shortAnchorMode='80%-raw-speed-file';
  }

  const refSec=(refKm*1000)/calibrationSpeed;
  const targetSec=refSec*Math.pow(targetKm/refKm,exponent);
  const targetPaceSec=targetSec/Math.max(0.001,targetKm);
  const targetSpeed=(targetKm*1000)/Math.max(1,targetSec);

  return {
    refKm,refSec,
    rawFileKm:ref.dist,
    rawFileSec:ref.elapsedSec,
    rawFilePaceSec:ref.elapsedSec/ref.dist,
    refPaceSec:refSec/refKm,
    exponent,targetKm,targetSec,targetPaceSec,targetSpeed,calibrationSpeed,
    speedCalibration:speedCal,
    shortAnchorMode
  };
}
function gradeOnlyFactor(grade){
  const info=combinedRaceModelInfo();
  if(!info) return 1;
  const g=Math.max(-0.45,Math.min(0.45,grade));
  const up=Math.max(g,0),dn=Math.max(-g,0);
  const c=info.gradeCoeff;
  return Math.max(0.20,Math.min(2.5,Math.exp(
    c[1]*up+c[2]*up*up+c[3]*dn+c[4]*dn*dn
  )));
}

function longDistanceEnduranceFactor(baseSec,vo2){
  const hours=Math.max(0,baseSec/3600);
  if(hours<=2) return 1;
  // Riegel already accounts for distance-related slowdown.
  // This is only an extra ultra-duration correction.
  const vo2Adj=Math.max(0.85,Math.min(1.20,50/Math.max(20,vo2)));
  const extra=Math.min(0.28,(hours-2)*0.012*vo2Adj);
  return 1+extra;
}


function forecastCustomStepKm(){
  const raw=String($('forecastStepKm')?.value||'').trim();
  if(!raw) return 0;
  const n=Number(raw);
  return Number.isFinite(n) && n>=1 && n<=10 ? n : 0;
}

function forecastSurfaceAtKm(km){
  const samples=state.mapAnalysis?.samples||state.mapAnalysis?.result?.samples||[];
  if(!Array.isArray(samples)||!samples.length) return '';
  let best=samples[0],bestD=Math.abs(Number(samples[0].km||0)-km);
  for(let i=1;i<samples.length;i++){
    const d=Math.abs(Number(samples[i].km||0)-km);
    if(d<bestD){best=samples[i];bestD=d;}
  }
  return String(best?.cls||'');
}

function autoForecastBoundariesFromAnalysis(){
  const dist=Number(state.dist||0);
  const samples=(state.mapAnalysis?.samples||state.mapAnalysis?.result?.samples||[])
    .filter(x=>Number.isFinite(Number(x?.km)))
    .sort((a,b)=>Number(a.km)-Number(b.km));
  if(!samples.length) return [0,dist];

  const boundaries=[0,dist];
  let lastClass=String(samples[0]?.cls||'unknown');
  let lastBoundary=0;

  for(let i=1;i<samples.length;i++){
    const km=Number(samples[i].km);
    const cls=String(samples[i]?.cls||'unknown');
    if(cls!==lastClass && km-lastBoundary>=0.25 && dist-km>=0.15){
      boundaries.push(km);
      lastBoundary=km;
    }
    if(cls!==lastClass) lastClass=cls;
  }

  const eventKms=[
    ...(state.mapAnalysis?.fordKms||[])
  ].map(Number).filter(Number.isFinite);

  for(const km of eventKms){
    if(km>0.1 && km<dist-0.1) boundaries.push(km);
  }

  const clean=[...new Set(boundaries.map(x=>Math.max(0,Math.min(dist,Number(x)))))]
    .filter(Number.isFinite).sort((a,b)=>a-b);

  const out=[clean[0]||0];
  for(let i=1;i<clean.length;i++){
    const x=clean[i];
    if(x-out[out.length-1]<0.15 && x<dist) continue;
    out.push(x);
  }
  if(out[out.length-1]!==dist) out.push(dist);
  return out;
}

function buildForecastGroups(detailed){
  const customStep=forecastCustomStepKm();
  const groups=[];

  if(customStep>0){
    let current=null;
    for(const s of detailed){
      const bucket=Math.floor(s.from/customStep)*customStep;
      if(!current||current.bucket!==bucket){
        if(current) groups.push(current);
        current={bucket,from:s.from,to:s.to,distM:0,gain:0,loss:0,sec:0,cumSec:0,weightedGrade:0,segmentMode:'step'};
      }
      current.to=s.to;
      current.distM+=s.dm;
      current.sec+=s.sec;
      current.cumSec=s.cumSec;
      current.weightedGrade+=s.grade*s.dm;
      if(s.de>0) current.gain+=s.de; else current.loss+=-s.de;
    }
    if(current) groups.push(current);
    return {groups,groupKm:customStep,mode:'step'};
  }

  if(!state.mapAnalysis){
    // No route analysis: safe default = 5 km rows.
    const fallbackStep=5;
    let current=null;
    for(const s of detailed){
      const bucket=Math.floor(s.from/fallbackStep)*fallbackStep;
      if(!current||current.bucket!==bucket){
        if(current) groups.push(current);
        current={bucket,from:s.from,to:s.to,distM:0,gain:0,loss:0,sec:0,cumSec:0,weightedGrade:0,segmentMode:'fallback5'};
      }
      current.to=s.to;
      current.distM+=s.dm;
      current.sec+=s.sec;
      current.cumSec=s.cumSec;
      current.weightedGrade+=s.grade*s.dm;
      if(s.de>0) current.gain+=s.de; else current.loss+=-s.de;
    }
    if(current) groups.push(current);
    return {groups,groupKm:fallbackStep,mode:'fallback5'};
  }

  const bounds=autoForecastBoundariesFromAnalysis();
  for(let bi=0;bi<bounds.length-1;bi++){
    const from=bounds[bi],to=bounds[bi+1];
    const g={bucket:bi,from,to,distM:0,gain:0,loss:0,sec:0,cumSec:0,weightedGrade:0,segmentMode:'auto'};
    for(const s of detailed){
      const left=Math.max(from,s.from),right=Math.min(to,s.to);
      if(right<=left) continue;
      const frac=(right-left)/Math.max(1e-9,s.to-s.from);
      const dm=s.dm*frac;
      g.distM+=dm;
      g.sec+=s.sec*frac;
      g.weightedGrade+=s.grade*dm;
      const de=s.de*frac;
      if(de>0) g.gain+=de; else g.loss+=-de;
    }
    if(g.distM>=20){
      g.surface=forecastSurfaceAtKm((from+to)/2);
      g.fordAtStart=(state.mapAnalysis?.fordKms||[]).some(k=>Math.abs(Number(k)-from)<0.12);
      g.bridgeAtStart=(state.mapAnalysis?.bridgeKms||[]).some(k=>Math.abs(Number(k)-from)<0.12);
      g.cumSec=groups.length?groups[groups.length-1].cumSec+g.sec:g.sec;
      groups.push(g);
    }
  }
  // Merge adjacent AUTO rows when they are genuinely the same route type.
  // A ford/bridge starts a new event row and therefore must not be swallowed
  // by the preceding ordinary surface row.
  const merged=[];
  for(const g of groups){
    const prev=merged[merged.length-1];
    const sameSurface=prev && String(prev.surface||'')===String(g.surface||'');
    const eventBoundary=!!g.fordAtStart;
    const prevEvent=prev && !!prev.fordAtStart;
    if(prev && sameSurface && !eventBoundary && !prevEvent){
      prev.to=g.to;
      prev.distM+=g.distM;
      prev.gain+=g.gain;
      prev.loss+=g.loss;
      prev.sec+=g.sec;
      prev.weightedGrade+=g.weightedGrade;
      prev.cumSec=(merged.length>1?merged[merged.length-2].cumSec:0)+prev.sec;
    }else{
      const copy={...g};
      copy.cumSec=(merged.length?merged[merged.length-1].cumSec:0)+copy.sec;
      merged.push(copy);
    }
  }
  return {groups:merged,groupKm:0,mode:'auto'};
}

function forecastSurfaceLabel(cls){
  const m={paved:'асфальт',trail:'тропа',dirt:'грунт',wetland:'болото',water:'вода',unknown:'неизвестно'};
  return m[String(cls||'')]||'';
}


function enduranceCapacityFromReferences(){
  const r=state.raceReferences||{};
  const strength=r.strength;
  const fast=r.fastTrail;
  if(!strength || !fast) return null;

  function eqHours(ref,role){
    const sec=Number(ref.elapsedSec||0);
    const h=Math.max(0.25,sec/3600);
    const km=Math.max(0.1,Number(ref.dist||0));
    const gain=Math.max(0,Number(ref.gain||0));
    const climbDensity=gain/km; // m+/km

    // Vertical load increases the endurance value of the session.
    // Strength reference is intentionally more influential than fast-trail.
    const verticalBonus=Math.min(role==='strength'?0.55:0.30,
      (climbDensity/120)*(role==='strength'?0.55:0.30));

    return h*(1+Math.max(0,verticalBonus));
  }

  const strengthEq=eqHours(strength,'strength');
  const fastEq=eqHours(fast,'fast');

  // Both files matter, but the strength/trail-long reference is the main durability source.
  const capacityHours=0.72*strengthEq+0.28*fastEq;

  return {
    capacityHours,
    strengthEqHours:strengthEq,
    fastEqHours:fastEq
  };
}

function enduranceCalibrationFactor(baseSec){
  const c=enduranceCapacityFromReferences();
  if(!c) return {factor:1,capacityHours:0,targetHours:baseSec/3600,ratio:1};

  const targetHours=Math.max(0.25,baseSec/3600);
  const ratio=targetHours/Math.max(0.5,c.capacityHours);

  // If target duration fits inside demonstrated durability, no extra slowdown.
  // If it exceeds it, pace gradually falls with duration.
  let factor=1;
  if(ratio>1){
    factor=1+Math.min(0.24,Math.pow(ratio-1,1.08)*0.115);
  }else if(ratio<0.70){
    // Strong long-duration evidence can slightly reduce the generic ultra penalty,
    // but never make the forecast unrealistically faster.
    factor=0.995;
  }

  return {
    factor,
    capacityHours:c.capacityHours,
    targetHours,
    ratio,
    strengthEqHours:c.strengthEqHours,
    fastEqHours:c.fastEqHours
  };
}

function calculateRaceForecast(){
  if(!(state.dist>0) || !(state.track?.length>1)){
    throw new Error('Сначала загрузите GPX трассы');
  }
  if(!allRaceReferencesReady()){
    throw new Error('Загрузите все 3 эталонные GPX тренировки');
  }

  const vo2=Number($('vo2max')?.value||52);
  if(!(vo2>=20 && vo2<=90)){
    throw new Error('Введите обязательный VO₂max от 20 до 90 мл/кг/мин');
  }

  const flatAnchor=flatRaceAnchorForTarget();
  if(!flatAnchor){
    throw new Error('Скоростная плоская GPX должна быть не менее 5 км и содержать корректное время');
  }

  const effort=Number($('raceEffortPct')?.value||100);
  const requestedStepKm=forecastCustomStepKm();
  const micro=buildRaceMicroSegments();
  if(!micro.length) throw new Error('Не удалось разбить трассу на участки');

  // Main anchor = actual flat-race performance scaled to target distance.
  // At 100% effort, a flat asphalt route stays close to the Riegel-scaled anchor.
  const effortFactor=Math.max(0.75,Math.min(1.20,100/Math.max(70,Math.min(130,effort))));
  const vo2Factor=Math.max(0.97,Math.min(1.03,1-(vo2-50)*0.0015));

  let totalSec=0;
  const detailed=[];

  for(const s of micro){
    const gradeFactor=gradeOnlyFactor(s.grade);
    const flatSec=s.dm/Math.max(0.25,flatAnchor.targetSpeed);
    // gradeFactor >1 means faster in the legacy speed model, so convert to time.
    const terrainTimeFactor=1/Math.max(0.25,gradeFactor);
    const sec=flatSec*terrainTimeFactor*effortFactor*vo2Factor;
    totalSec+=sec;
    detailed.push({...s,sec,cumSec:totalSec});
  }

  // Normalize completely flat routes to the real flat-race anchor.
  // For hilly routes, keep the relative terrain cost learned from trail references.
  const routeGain=Number(state.gain||0);
  const flatEnough=(routeGain/state.dist)<=8; // <=8 m gain/km: effectively flat/rolling
  if(flatEnough && totalSec>0){
    const desired=flatAnchor.targetSec*effortFactor*vo2Factor;
    const scale=desired/totalSec;
    totalSec=0;
    detailed.forEach(s=>{
      s.sec*=scale;
      totalSec+=s.sec;
      s.cumSec=totalSec;
    });
  }

  // Additional correction is only for long events; Riegel already includes normal
  // distance-related slowdown from 10 km to half/marathon distances.
  const ultraFactor=longDistanceEnduranceFactor(totalSec,vo2);
  if(ultraFactor!==1){
    totalSec=0;
    detailed.forEach(s=>{
      s.sec*=ultraFactor;
      totalSec+=s.sec;
      s.cumSec=totalSec;
    });
  }

  // v0.52: steep-course reality checks.
  // 1) Strength GPX becomes increasingly important when the race has much more
  //    ascent per km than the strength reference.
  // 2) If the race GPX itself contains timestamps (same-course prior effort),
  //    that real moving time is an additional anchor on very vertical routes.

  const strengthRef=state.raceReferences?.strength;
  const routeGainNow=Math.max(0,Number(state.gain||0));
  const routeDistNow=Math.max(0.1,Number(state.dist||0));
  const routeVD=routeGainNow/routeDistNow; // m+/km

  let strengthRealityFloorSec=0;
  let sameCourseFloorSec=0;

  if(strengthRef && Number(strengthRef.elapsedSec)>0 && Number(strengthRef.dist)>0){
    const refVD=Math.max(0,Number(strengthRef.gain||0))/Math.max(0.1,Number(strengthRef.dist||0));

    if(routeVD>=50 && refVD>=20){
      const targetEffortKm=routeDistNow+routeGainNow/100;
      const refEffortKm=Number(strengthRef.dist||0)+Math.max(0,Number(strengthRef.gain||0))/100;

      let scaledStrengthSec=Number(strengthRef.elapsedSec)*Math.pow(
        Math.max(0.25,targetEffortKm/Math.max(0.25,refEffortKm)),1.06
      );

      // Nonlinear vertical-density penalty.
      // If target VD is 2–3x the strength reference, km-effort alone is too optimistic.
      const vdRatio=routeVD/Math.max(20,refVD);
      let verticalPenalty=1;

      if(routeVD>80){
        const absoluteExcess=(routeVD-80)/80;
        verticalPenalty *= 1 + Math.min(0.28,0.13*Math.pow(absoluteExcess,1.15));
      }
      if(vdRatio>1.35){
        verticalPenalty *= 1 + Math.min(0.30,0.12*Math.pow(vdRatio-1.35,1.20));
      }

      scaledStrengthSec*=verticalPenalty;

      // Race day may be better than training, but less improvement is allowed
      // as vertical density becomes extreme.
      const allowedGain =
        routeVD>=140 ? 0.08 :
        routeVD>=110 ? 0.10 :
        routeVD>=80  ? 0.12 : 0.15;

      strengthRealityFloorSec=scaledStrengthSec*(1-allowedGain);

      if(totalSec<strengthRealityFloorSec){
        const scale=strengthRealityFloorSec/Math.max(1,totalSec);
        totalSec=0;
        detailed.forEach(s=>{
          s.sec*=scale;
          totalSec+=s.sec;
          s.cumSec=totalSec;
        });
      }
    }
  }

  // Same-course anchor: if the route GPX has timestamps, it may be a previously
  // completed activity on this exact profile. On extreme vertical terrain,
  // do not assume an enormous unexplained improvement over that real moving time.
  const routeTimes=getTrackTimesFromGPX();
  if(routeTimes && Number(routeTimes.movingSec)>0 && routeVD>=70){
    const actualMovingSec=Number(routeTimes.movingSec);

    // Ignore obviously broken timestamps.
    const actualPace=actualMovingSec/routeDistNow;
    if(actualPace>=180 && actualPace<=3600){
      const maxImprovement =
        routeVD>=140 ? 0.12 :
        routeVD>=110 ? 0.14 :
        routeVD>=80  ? 0.16 : 0.18;

      sameCourseFloorSec=actualMovingSec*(1-maxImprovement);

      if(totalSec<sameCourseFloorSec){
        const scale=sameCourseFloorSec/Math.max(1,totalSec);
        totalSec=0;
        detailed.forEach(s=>{
          s.sec*=scale;
          totalSec+=s.sec;
          s.cumSec=totalSec;
        });
      }

      // v0.53: the same-course result is not only a lower bound.
      // If the generic mountain model becomes much slower than a real completed
      // effort on this exact route, cap the pessimism as well.
      const maxSlowdown =
        routeVD>=140 ? 0.08 :
        routeVD>=110 ? 0.10 :
        routeVD>=80  ? 0.12 : 0.15;
      const sameCourseCeilingSec=actualMovingSec*(1+maxSlowdown);
      if(totalSec>sameCourseCeilingSec){
        const scale=sameCourseCeilingSec/Math.max(1,totalSec);
        totalSec=0;
        detailed.forEach(s=>{
          s.sec*=scale;
          totalSec+=s.sec;
          s.cumSec=totalSec;
        });
      }
    }
  }


  // v0.28: durability must react to the uploaded strength and fast-trail files.
  // Previously physiology was mostly diagnostic and replacing the strength GPX
  // could leave the race prediction unchanged.
  const enduranceCalibration=enduranceCalibrationFactor(totalSec);
  if(enduranceCalibration.factor!==1){
    totalSec=0;
    detailed.forEach(s=>{
      s.sec*=enduranceCalibration.factor;
      totalSec+=s.sec;
      s.cumSec=totalSec;
    });
  }

  const grouped=buildForecastGroups(detailed);
  const groups=grouped.groups;
  const groupKm=grouped.groupKm;
  const segmentMode=grouped.mode;

  const avgRacePaceSec=totalSec/state.dist;

  groups.forEach(g=>{
    g.grade=g.distM?g.weightedGrade/g.distM:0;

    // Recommended distribution around the target average:
    // no artificial "very slow first 5 km" on a flat road race.
    const mid=((g.from+g.to)/2)/state.dist;
    let pacingFactor=1;
    if(mid<0.25) pacingFactor=1.010;       // only ~1% conservative early
    else if(mid<0.75) pacingFactor=1.000;
    else pacingFactor=0.995;

    const terrainRatio=(g.sec/Math.max(0.001,g.distM/1000))/avgRacePaceSec;
    g.recommendedPaceSec=avgRacePaceSec*terrainRatio*pacingFactor;

    // A short final remainder (for example 20.1–20.7 km) must not absorb
    // normalization error and turn into an impossible sprint. On an effectively
    // flat route keep every recommended split close to the race-average pace.
    // Hills still retain their terrain-derived variation.
    if(flatEnough){
      const lo=avgRacePaceSec*0.96;
      const hi=avgRacePaceSec*1.04;
      g.recommendedPaceSec=Math.max(lo,Math.min(hi,g.recommendedPaceSec));
    }
    g.recommendedSec=g.recommendedPaceSec*(g.distM/1000);
  });

  // Normalize section recommendations to total forecast time.
  const recommendedRaw=groups.reduce((sum,g)=>sum+g.recommendedSec,0);
  const norm=recommendedRaw>0?totalSec/recommendedRaw:1;
  let recommendedCum=0;

  groups.forEach(g=>{
    g.recommendedSec*=norm;
    g.recommendedPaceSec*=norm;

    // Final safety clamp for flat/road races. The last partial split is a
    // recommendation, not a requirement to sprint unrealistically fast.
    if(flatEnough){
      const lo=avgRacePaceSec*0.95;
      const hi=avgRacePaceSec*1.05;
      g.recommendedPaceSec=Math.max(lo,Math.min(hi,g.recommendedPaceSec));
      g.recommendedSec=g.recommendedPaceSec*(g.distM/1000);
    }

    recommendedCum+=g.recommendedSec;
    g.recommendedCumSec=recommendedCum;
    g.paceSec=g.recommendedPaceSec;
    g.sec=g.recommendedSec;
    g.cumSec=g.recommendedCumSec;
  });

  const physiology=racePhysiologyFactors(totalSec);

  const shortRace=state.dist<=15;
  const realisticLowFactor=shortRace ? 0.938 : 0.95;
  const realisticHighFactor=shortRace ? 1.045 : 1.05;

  return {
    totalSec,
    avgPaceSec:totalSec/state.dist,
    lowSec:totalSec*realisticLowFactor,
    highSec:totalSec*realisticHighFactor,
    effort,
    groupKm,
    segmentMode,
    groups,
    physiology,
    flatAnchor,
    ultraFactor,
    enduranceCalibration
  };
}

function raceFormulaText(){
  const info=combinedRaceModelInfo();
  const anchor=flatRaceAnchorForTarget();
  if(!info || !anchor) return 'Загрузите все 3 эталонные GPX.';

  const cap=enduranceCapacityFromReferences();
  const sc=anchor.speedCalibration;
  let speedText='';
  if(sc?.mode==='blend'){
    speedText=`Скоростная плоская GPX оказалась медленнее оценки по VO₂max, поэтому скоростной якорь смешан: `
      + `файл ${fmtPaceSecPerKm(1000/sc.fileSpeed)} + VO₂max ${fmtPaceSecPerKm(1000/sc.vo2Speed)}, `
      + `доля VO₂max ${(sc.vo2Weight*100).toFixed(0)}%. `;
  }else{
    speedText=`Скоростная плоская GPX используется напрямую как скоростной якорь. `;
  }
  if(anchor.shortAnchorMode==='raw-speed-file'){
    speedText+=`Для короткой дистанции, близкой к скоростному эталону, прогноз жёстко привязан к реально показанному темпу этого GPX. `;
  }else if(anchor.shortAnchorMode==='80%-raw-speed-file'){
    speedText+=`Для короткой дистанции 80% скоростного якоря берётся из фактически показанной скорости GPX и только 20% — из корректирующей модели. `;
  }

  return `Калибровка считается по фактическим данным трёх загруженных GPX. `
    + speedText
    + `Итоговый скоростной якорь: ${fmtPaceSecPerKm(anchor.refPaceSec)} на ${anchor.refKm.toFixed(1)} км. `
    + `Быстрая трейловая GPX влияет на рабочую скорость и рельеф. `
    + `Силовая трейловая GPX влияет на уклон и запас выносливости. `
    + (cap?`Запас выносливости: ${cap.capacityHours.toFixed(1)} ч. `:'')
    + `Далее применяются Riegel, усталость по длительности, рельеф и анализ покрытия. `
    + `На очень вертикальных трассах действует нелинейная поправка по м+/км и силовому GPX. `
    + `Если GPX самой трассы содержит реальные временные метки предыдущего прохождения, его moving time используется как дополнительный reality-check.`;
}

function surfaceDistanceInRange(samples,fromKm,toKm,cls){
  if(!Array.isArray(samples) || samples.length<2) return 0;
  const s=[...samples]
    .filter(x=>Number.isFinite(Number(x?.km)))
    .sort((a,b)=>Number(a.km)-Number(b.km));

  let km=0;
  for(let i=0;i<s.length-1;i++){
    const a=Number(s[i].km), b=Number(s[i+1].km);
    if(!(b>a)) continue;
    if(s[i].cls!==cls) continue;

    const left=Math.max(fromKm,a);
    const right=Math.min(toKm,b);
    if(right>left) km+=right-left;
  }
  return km;
}

function trailDistanceInRange(samples,fromKm,toKm){
  return surfaceDistanceInRange(samples,fromKm,toKm,'trail');
}

function renderRaceForecast(options={}){
  const tbody=$('raceForecastTable')?.querySelector('tbody');
  if(!tbody) return;
  try{
    const f=calculateRaceForecast();
    const fordKms=Array.isArray(options.fordKms)?options.fordKms:[];
    const fordPenaltyPer=Number(options.fordPenaltyPerSec)||0;
    const trailSamples=Array.isArray(options.trailSamples)?options.trailSamples:[];
    const trailPenaltyPerKmSec=Number(options.trailPenaltyPerKmSec)||0;
    const dirtPenaltyPerKmSec=Number(options.dirtPenaltyPerKmSec)||0;
    const unknownPenaltyPerKmSec=Number(options.unknownPenaltyPerKmSec)||0;
    let extraTotal=0;
    let fordExtraTotal=0;
    let trailExtraTotal=0;
    let dirtExtraTotal=0;
    let unknownExtraTotal=0;
    let totalTrailKm=0;
    let totalDirtKm=0;
    let totalUnknownKm=0;

    // v0.0259: detect a predominantly paved/asphalt route from the OSM samples.
    // On such routes tiny OSM gaps / water polygons / short path fragments must
    // not turn a road race into a 6:30/km trail forecast.
    const pavedKmAll=trailSamples.length
      ? surfaceDistanceInRange(trailSamples,0,Math.max(0.001,state.dist),'paved')
      : 0;
    const pavedShareAll=state.dist>0 ? pavedKmAll/state.dist : 0;
    const asphaltRaceAnalysis=pavedShareAll>=0.80;

    // Analysis-mode local penalties:
    // ford: +40 sec each;
    // trail: +60 sec per OSM trail km;
    // dirt: +30 sec/km; unknown: local pace floor 6:30/km.
    if(
      (fordPenaltyPer>0 && fordKms.length) ||
      (trailPenaltyPerKmSec>0 && trailSamples.length) ||
      (dirtPenaltyPerKmSec>0 && trailSamples.length) ||
      (trailSamples.length>0)
    ){
      let cumExtra=0;
      f.groups.forEach(g=>{
        const fordCount=fordKms.filter(km=>km>=g.from-1e-9 && km<g.to+1e-9).length;
        const fordExtra=fordCount*fordPenaltyPer;

        const trailKm=(!asphaltRaceAnalysis && trailPenaltyPerKmSec>0)
          ? surfaceDistanceInRange(trailSamples,g.from,g.to,'trail')
          : 0;
        const trailExtra=trailKm*trailPenaltyPerKmSec;

        const dirtKm=(!asphaltRaceAnalysis && dirtPenaltyPerKmSec>0)
          ? surfaceDistanceInRange(trailSamples,g.from,g.to,'dirt')
          : 0;
        const dirtExtra=dirtKm*dirtPenaltyPerKmSec;

        const unknownKm=(!asphaltRaceAnalysis && trailSamples.length)
          ? surfaceDistanceInRange(trailSamples,g.from,g.to,'unknown')
          : 0;
        const waterKm=(!asphaltRaceAnalysis && trailSamples.length)
          ? surfaceDistanceInRange(trailSamples,g.from,g.to,'water')
          : 0;

        // Unknown and WATER must never be modeled faster than 6:30/km.
        const groupKm=Math.max(0.001,g.distM/1000);
        const knownExtra=fordExtra+trailExtra+dirtExtra;
        const paceAfterKnown=(g.sec+knownExtra)/groupKm;
        const slowKm=Math.min(groupKm,unknownKm+waterKm);
        const slowShare=Math.max(0,Math.min(1,slowKm/groupKm));
        const slowTargetPace=Math.max(paceAfterKnown,390);
        const unknownExtra=(slowTargetPace-paceAfterKnown)*slowShare*groupKm;

        const extra=knownExtra+unknownExtra;

        g.trailKm=trailKm;
        g.dirtKm=dirtKm;
        g.unknownKm=unknownKm;
        g.fordCount=fordCount;

        g.sec+=extra;
        g.recommendedSec=(g.recommendedSec||0)+extra;
        g.paceSec=g.sec/Math.max(0.001,g.distM/1000);

        cumExtra+=extra;
        g.cumSec+=cumExtra;

        fordExtraTotal+=fordExtra;
        trailExtraTotal+=trailExtra;
        dirtExtraTotal+=dirtExtra;
        unknownExtraTotal+=unknownExtra;
        totalTrailKm+=trailKm;
        totalDirtKm+=dirtKm;
        totalUnknownKm+=unknownKm;
      });

      extraTotal=fordExtraTotal+trailExtraTotal+dirtExtraTotal+unknownExtraTotal;

      f.fordCount=fordKms.length;
      f.fordPenaltySec=fordExtraTotal;

      f.trailKm=totalTrailKm;
      f.trailPenaltySec=trailExtraTotal;

      f.dirtKm=totalDirtKm;
      f.dirtPenaltySec=dirtExtraTotal;

      f.unknownKm=totalUnknownKm;
      f.unknownPenaltySec=unknownExtraTotal;

      f.analysisPenaltySec=extraTotal;

      f.totalSec+=extraTotal;
      f.avgPaceSec=f.totalSec/state.dist;
      if(state.dist<=15){
        f.lowSec=f.totalSec*0.938;
        f.highSec=f.totalSec*1.045;
      }else{
        f.lowSec=f.totalSec*0.95;
        f.highSec=f.totalSec*1.05;
      }
      f.physiology=racePhysiologyFactors(f.totalSec);
    }
    // v0.50: HR targets use the real HR DISTRIBUTION of the uploaded GPXs.
    // Fast/flat GPX sets the upper working/threshold anchor; longer GPXs set
    // sustainable HR. Race duration decides where between those anchors we sit.
    const hrCal=trainingHrCalibration();
    const forecastHrForGroup=(g)=>{
      if(!hrCal) return '—';

      const totalHours=Math.max(0.5,Number(f.totalSec||0)/3600);
      const raceAvg=Math.max(1,Number(f.avgPaceSec||g.paceSec));
      const localPace=Math.max(1,Number(g.paceSec||raceAvg));
      const speedRatio=Math.max(0.65,Math.min(1.35,raceAvg/localPace));
      const progress=Math.max(0,Math.min(1,((g.from+g.to)/2)/Math.max(0.1,state.dist)));

      // v0.53: for multi-hour races HR is based on a sustainable fraction of
      // the athlete's observed threshold, not on short-race HR.
      const lthr=Math.max(120,Number(hrCal.thresholdHr||hrCal.lthr||hrCal.upperWorkingHr));
      let frac;
      if(totalHours<=1.5) frac=0.92;
      else if(totalHours<=3) frac=0.89;
      else if(totalHours<=5) frac=0.86;
      else if(totalHours<=7) frac=0.83;
      else frac=0.80;

      let center=lthr*frac;

      // Small personalization from the longer uploaded training files.
      const sustainable=Number(hrCal.sustainableHr||center);
      center=center*0.70+sustainable*0.30;

      // Terrain pace is a weak HR signal: 30–40 min/km on a climb must not
      // imply either walking HR or threshold HR by itself.
      center+=(speedRatio-1)*8;

      // Conservative progression. Only the final part may approach threshold.
      center+=progress<0.15?-4:
              progress<0.50?-1:
              progress<0.80?1:
              progress<0.95?3:6;

      const grade=Number(g.grade||0);
      if(grade>0.04) center+=Math.min(4,grade*25);
      if(grade<-0.05) center-=Math.min(3,Math.abs(grade)*15);

      // Long-duration ceiling: sustained 170+ bpm for 4–7 hours should not be
      // proposed merely because a 10 km reference reached that HR.
      const durationCeiling =
        totalHours>=7 ? lthr*0.88 :
        totalHours>=5 ? lthr*0.90 :
        totalHours>=3 ? lthr*0.93 :
        lthr*0.97;
      const finishCeiling=progress>=0.95
        ? Math.min(Number(hrCal.finishCeiling||lthr), lthr*0.97)
        : durationCeiling;

      center=Math.min(center,finishCeiling);
      center=Math.max(105,center);

      const spread=totalHours>=4?3:4;
      return `${Math.round(center-spread)}–${Math.round(center+spread)}`;
    };
    state.raceForecast=f;
    tbody.innerHTML='';
    f.groups.forEach(g=>{
      const from=g.from.toFixed(1).replace('.0','');
      const to=Math.min(state.dist,g.to).toFixed(1).replace('.0','');
      const autoLabel=g.segmentMode==='auto'
        ? [forecastSurfaceLabel(g.surface),g.fordAtStart?'брод':''].filter(Boolean).join(' · ')
        : '';
      tbody.insertAdjacentHTML('beforeend',
        `<tr>
          <td>${from}–${to}${autoLabel?`<small class="forecast-segment-label">${autoLabel}</small>`:''}</td>
          <td>+${Math.round(g.gain)} / −${Math.round(g.loss)} м</td>
          <td>${(g.grade*100).toFixed(1)}%</td>
          <td>${fmtPaceSecPerKm(g.paceSec)}</td>
          <td><b>${forecastHrForGroup(g)}</b></td>
          <td>${fmtClockSec(g.sec)}</td>
          <td>${fmtClockSec(g.cumSec)}</td>
          <td>${Math.round(f.effort)}%</td>
        </tr>`);
    });
    $('raceForecastTime').textContent=fmtClockSec(f.totalSec);
  if($('raceForecastDistance')) $('raceForecastDistance').textContent=`${Number(state.dist||0).toFixed(Number(state.dist||0)%1?1:0)} км`;
    $('raceForecastPace').textContent=fmtPaceSecPerKm(f.avgPaceSec);
    if($('raceCalibration') && f.flatAnchor){
      const sc=f.flatAnchor.speedCalibration;
      const extra=sc?.mode==='blend'
        ? ` · VO₂max в скоростном якоре ${(sc.vo2Weight*100).toFixed(0)}%`
        : '';
      $('raceCalibration').textContent=
        `${state.raceReferences.flatRace.source}: ${f.flatAnchor.refKm.toFixed(1)} км · `
        + `${fmtClockSec(f.flatAnchor.refSec)} · ${fmtPaceSecPerKm(f.flatAnchor.refPaceSec)}`
        + extra
        + ` → ${f.flatAnchor.targetKm.toFixed(1)} км: ${fmtPaceSecPerKm(f.flatAnchor.targetPaceSec)}`;
    }
    $('raceForecastRange').textContent=`${fmtClockSec(f.lowSec)}–${fmtClockSec(f.highSec)}`;
    if(asphaltRaceAnalysis && $('raceForecastStatus')){
      $('raceForecastStatus').textContent='✓ Асфальтовый режим анализа: OSM-разрывы, вода и короткие фрагменты тропы не замедляют дорожный прогноз. Реальные броды учитываются отдельно.';
    }
    if($('raceDurationFactor')){
      const ec=f.enduranceCalibration;
      if(ec){
        const pct=(100/Math.max(1,ec.factor)).toFixed(0);
        $('raceDurationFactor').textContent=`${pct}% · запас ${ec.capacityHours.toFixed(1)} ч`;
      }else{
        $('raceDurationFactor').textContent=(f.physiology.durationFactor*100).toFixed(0)+'%';
      }
    }
    if($('raceHrFactor')) $('raceHrFactor').textContent=(f.physiology.hrFactor*100).toFixed(0)+'%';
    if($('raceAcidTime')) $('raceAcidTime').textContent=Number.isFinite(f.physiology.acidHours)?f.physiology.acidHours.toFixed(1)+' ч':'—';
    if($('raceVo2Factor')) {
      const vo2Delta=(f.physiology.vo2Factor-1)*100;
      $('raceVo2Factor').textContent=`${vo2Delta>=0?'+':''}${vo2Delta.toFixed(1)}%`;
    }
    if($('raceVo2Value')) $('raceVo2Value').textContent=`VO₂max: ${f.physiology.vo2.toFixed(0)} мл/кг/мин`;
    $('raceModelSource').textContent=allRaceReferencesReady()
      ? `${state.raceReferences.strength.source} + ${state.raceReferences.fastTrail.source} + ${state.raceReferences.flatRace.source}`
      : 'нужно 3 GPX';
    $('raceModelFormula').textContent=raceFormulaText();
    const hrSource=trainingHrCalibration();
    $('raceForecastStatus').textContent=f.fordPenaltySec ? `✓ Прогноз с анализом GPX: ${state.dist.toFixed(1)} км · бродов ${f.fordCount} · +${f.fordPenaltySec} с (${f.fordCount} × 40 с).` : `✓ Общий прогноз по 3 GPX: ${state.dist.toFixed(1)} км. Темпы участков нормированы к среднему прогнозному темпу.`;
    if(hrSource){
      $('raceForecastStatus').textContent += ` Целевой пульс: ${hrSource.source}.`;
    }else{
      $('raceForecastStatus').textContent += ' В GPX нет HR — целевой пульс не рассчитан.';
    }
    state.forecastMode=options.analysisMode?'analysis':'normal';
    applyForecastModeColors();
    updateFinalCalcAvailability();
  }catch(err){
    tbody.innerHTML='';
    $('raceForecastStatus').textContent='✕ '+(err.message||String(err));
    if(options.analysisMode) setActionState('raceForecastGpxBtn','error');
    else setActionState('raceForecastBtn','error');
    state.raceForecast=null;
    state.forecastMode=null;
    updateFinalCalcAvailability();
  }
}

function updateRaceForecastAvailability(){
  updateRaceReferenceState();
}


const raceRefSelections={strength:null,fastTrail:null,flatRace:null};

function raceRefUI(role){
  if(role==='strength') return ['strengthActivityFile','strengthActivityName','strengthActivityLoadBtn','strengthActivityStatus'];
  if(role==='fastTrail') return ['fastTrailActivityFile','fastTrailActivityName','fastTrailActivityLoadBtn','fastTrailActivityStatus'];
  return ['flatRaceActivityFile','flatRaceActivityName','flatRaceActivityLoadBtn','flatRaceActivityStatus'];
}
function raceRefTitle(role){
  return role==='strength'?'Силовая трейловая GPX':
         role==='fastTrail'?'Быстрая трейловая GPX':'Скоростная плоская GPX';
}

function forecastInputsReady(){
  const count=['strength','fastTrail','flatRace'].filter(k=>state.raceReferences?.[k]).length;
  const routeReady=Number(state.dist||0)>0 && state.track?.length>1;
  const vo2=Number($('vo2max')?.value||52);
  return routeReady && count===3 && vo2>=20 && vo2<=90;
}

function applyForecastModeColors(){
  const normal=$('raceForecastBtn');
  const analysis=$('raceForecastGpxBtn');
  const ready=forecastInputsReady();

  if(!normal || !analysis) return;

  normal.disabled=!ready;
  const analysisReady=ready && !!state.mapAnalysis && state.mapAnalysisReadyForCurrentGpx===true;
  analysis.disabled=!analysisReady;
  analysis.title=analysisReady ? 'Анализ текущего GPX готов' : 'Сначала выполните «Анализ карты» для текущего GPX';

  if(!ready){
    setActionState('raceForecastBtn','idle');
    setActionState('raceForecastGpxBtn','idle');
    return;
  }
  if(!analysisReady){
    setActionState('raceForecastBtn',state.forecastMode==='normal'?'success':'ready');
    setActionState('raceForecastGpxBtn','idle');
    if(state.forecastMode==='analysis') state.forecastMode=null;
    return;
  }

  if(state.forecastMode==='normal'){
    setActionState('raceForecastBtn','success');
    setActionState('raceForecastGpxBtn','ready');
  }else if(state.forecastMode==='analysis'){
    setActionState('raceForecastBtn','ready');
    setActionState('raceForecastGpxBtn','success');
  }else{
    setActionState('raceForecastBtn','ready');
    setActionState('raceForecastGpxBtn','ready');
  }
}

function hasFinalCalculationData(){
  return !!(state.raceForecast && Number(state.raceForecast.totalSec)>0);
}

function updateFinalCalcAvailability(){
  const btn=$('calcBtn');
  const status=$('calcAvailabilityStatus');
  if(!btn) return;

  const ready=hasFinalCalculationData();
  btn.disabled=!ready;

  if(!ready){
    setActionState('calcBtn','idle');
    if(status) status.textContent='Сначала рассчитайте прогноз во вкладке «Прогноз».';
  }else{
    setActionState('calcBtn','ready');
    if(status){
      status.textContent=state.forecastMode==='analysis'
        ? 'Готово: используется прогноз с анализом GPX.'
        : 'Готово: используется обычный прогноз по трассе.';
    }
  }
}


function clearRaceForecastUI(){
  const simpleIds=[
    'raceForecastTime',
    'raceForecastPace',
    'raceForecastRange',
    'raceDurationFactor',
    'raceHrFactor',
    'raceAcidTime',
    'raceVo2Factor'
  ];

  simpleIds.forEach(id=>{
    const el=$(id);
    if(el) el.textContent='—';
  });

  const source=$('raceModelSource');
  if(source) source.textContent='—';

  const vo2Value=$('raceVo2Value');
  if(vo2Value) vo2Value.textContent='VO₂max: — мл/кг/мин';

  const tbody=$('raceForecastTable')?.querySelector('tbody');
  if(tbody) tbody.innerHTML='';

  const formula=$('raceModelFormula');
  if(formula) formula.textContent='—';

  const status=$('raceForecastStatus');
  if(status) status.textContent='Прогноз очищен. Загрузите новый эталонный GPX.';

  clearResultForecast();
}

function invalidateRaceForecast(){
  state.raceForecast=null;
  state.forecastMode=null;
  clearRaceForecastUI();
  applyForecastModeColors();
  updateFinalCalcAvailability();
}

function updateRaceReferenceState(){
  const count=['strength','fastTrail','flatRace'].filter(k=>state.raceReferences[k]).length;
  if($('referenceCount')) $('referenceCount').textContent=`${count} / 3`;
  if($('combinedModelState')) $('combinedModelState').textContent=count===3?'готова':'ожидает 3 GPX';
  if($('raceModelFormula')) $('raceModelFormula').textContent=raceFormulaText();

  const routeReady=state.dist>0 && state.track?.length>1;
  const vo2=Number($('vo2max')?.value||52);
  const vo2Ready=vo2>=20 && vo2<=90;
  const ready=routeReady && count===3 && vo2Ready;
  applyForecastModeColors();
if($('raceForecastStatus')){
    if(!routeReady) $('raceForecastStatus').textContent='Сначала загрузите GPX трассы во вкладке «Трасса».';
    else if(count<3) $('raceForecastStatus').textContent=`Трасса готова. Загрузите ещё ${3-count} эталонных GPX.`;
    else if(!vo2Ready) $('raceForecastStatus').textContent='Введите обязательный VO₂max (20–90 мл/кг/мин).';
    else $('raceForecastStatus').textContent='Трасса, 3 тренировки и VO₂max готовы. Можно считать общий прогноз.';
  }
}

let lastForecastModeBeforeReferenceChange=null;
const pendingReferenceForecastMode={strength:null,fastTrail:null,flatRace:null};

function bindRaceReference(role){
  const [fileId,nameId,btnId,statusId]=raceRefUI(role);
  const fileEl=$(fileId),nameEl=$(nameId),btn=$(btnId),status=$(statusId);
  if(!fileEl||!nameEl||!btn||!status) return;

  fileEl.addEventListener('change',e=>{
    const previousMode=state.forecastMode || lastForecastModeBeforeReferenceChange || null;
    pendingReferenceForecastMode[role]=previousMode;
    lastForecastModeBeforeReferenceChange=previousMode;

    const f=e.currentTarget.files?.[0]||null;
    raceRefSelections[role]=f;

    // Remove the previous etalon before clearing the UI, so nothing stale can be reused.
    state.raceReferences[role]=null;
    state.raceForecast=null;
    state.forecastMode=null;
    clearRaceForecastUI();
    applyForecastModeColors();
    updateFinalCalcAvailability();

    if($('raceForecastStatus')){
      $('raceForecastStatus').textContent='Эталонный GPX изменён. Старый прогноз очищен. Загрузите выбранный файл.';
    }
    if(!f){
      nameEl.innerHTML='<span class="file-check">○</span> Файл не выбран';
      btn.disabled=true;
      btn.textContent=role==='strength'?'Загрузить Силовую трейловую GPX':
                      role==='fastTrail'?'Загрузить Быструю трейловую GPX':
                      'Загрузить Скоростную плоскую GPX';
      setActionState(btnId,'idle');
      status.textContent='Не загружена.';
      updateRaceReferenceState();
      return;
    }
    nameEl.innerHTML='<span class="file-check selected">✓</span> Выбран: '+f.name;
    btn.disabled=false;
    btn.textContent='⏳ Загрузка файла…';
    setActionState(btnId,'working');
    status.textContent='⏳ Файл выбран. Загружаю автоматически…';
    updateRaceReferenceState();

    // v0.71: no second tap is required.
    setTimeout(()=>btn.click(),0);
  });

  btn.addEventListener('click',async()=>{
    const f=raceRefSelections[role];
    if(!f) return;
    try{
      state.raceForecast=null;
      state.forecastMode=null;
      clearRaceForecastUI();
      applyForecastModeColors();
      updateFinalCalcAvailability();
      setActionState(btnId,'working');
      status.textContent='Анализирую '+raceRefTitle(role)+'…';
      const text=await readFileIOS(f);
      const parsed=parseTimedActivityGPX(text);

      // v0.51: reject a speed/flat GPX when it is loaded as the strength-trail reference.
      const verticalPerKm=parsed.dist>0 ? parsed.gain/parsed.dist : 0;
      const avgPace=parsed.dist>0 ? parsed.elapsedSec/parsed.dist : 0;

      if(role==='strength'){
        const tooFlat = verticalPerKm < 20 || (parsed.dist >= 5 && parsed.gain < 250);
        const clearlySpeedLike =
          parsed.dist >= 5 && parsed.dist <= 15 &&
          avgPace > 0 && avgPace < 330 &&
          verticalPerKm < 25;

        if(tooFlat || clearlySpeedLike){
          throw new Error(
            `Этот GPX не подходит для «Силовой трейловой»: `
            + `${parsed.dist.toFixed(2)} км · +${Math.round(parsed.gain)} м · `
            + `${Math.round(verticalPerKm)} м набора/км · ${fmtPaceSecPerKm(avgPace)}. `
            + `Силовой эталон должен быть действительно горным: минимум 20 м набора/км, `
            + `а для файла от 5 км — не менее +250 м. `
            + `Быстрый почти плоский файл загрузите как скоростной эталон.`
          );
        }
      }

      if(role==='flatRace'){
        const tooMountainous = verticalPerKm > 35 || (parsed.dist >= 5 && parsed.gain > 500);
        if(tooMountainous){
          throw new Error(
            `Этот GPX слишком горный для «Скоростной плоской»: `
            + `${parsed.dist.toFixed(2)} км · +${Math.round(parsed.gain)} м `
            + `(${Math.round(verticalPerKm)} м/км). Используйте его как силовую/трейловую тренировку.`
          );
        }
      }

      if(role==='flatRace' && parsed.dist < 5){
        throw new Error(
          `Скоростная плоская GPX должна быть не менее 5 км. В файле: ${parsed.dist.toFixed(2)} км.`
        );
      }

      parsed.source=f.name;
      state.raceReferences[role]=parsed;

      status.textContent=
        `✓ ${parsed.dist.toFixed(2)} км · +${Math.round(parsed.gain)} м · `
        + `${fmtClockSec(parsed.elapsedSec)} · ${fmtPaceSecPerKm(parsed.elapsedSec/parsed.dist)}`
        + (parsed.avgHr>0
          ? ` · HR ср ${Math.round(parsed.avgHr)} · med ${Math.round(parsed.hrStats?.median||parsed.avgHr)} · q75 ${Math.round(parsed.hrStats?.q75||parsed.avgHr)} · max ${Math.round(parsed.hrStats?.max||parsed.avgHr)}`
          : ' · HR нет');
      btn.textContent='✓ Файл загружен';
      setActionState(btnId,'success');
      updateRaceReferenceState();

      // v0.31: after a new etalon has been parsed successfully,
      // always build a fresh forecast when all inputs are ready.
      // Prefer the previously selected mode; otherwise use the normal forecast.
      if(forecastInputsReady()){
        const rememberedMode=
          pendingReferenceForecastMode[role] ||
          lastForecastModeBeforeReferenceChange ||
          'normal';

        if(
          rememberedMode==='analysis' &&
          state.mapAnalysis &&
          state.mapAnalysisReadyForCurrentGpx===true
        ){
          const fordKms=state.mapAnalysis?.fordKms||[];
          const trailSamples=state.mapAnalysis?.samples||state.mapAnalysis?.result?.samples||[];

          renderRaceForecast({
            fordKms,
            fordPenaltyPerSec:40,
            trailSamples,
            trailPenaltyPerKmSec:60,
            dirtPenaltyPerKmSec:30,
            unknownPenaltyPerKmSec:0,
            analysisMode:true
          });
        }else{
          renderRaceForecast({analysisMode:false});
        }

        pendingReferenceForecastMode[role]=null;
        lastForecastModeBeforeReferenceChange=state.forecastMode;

        if($('raceForecastStatus')){
          $('raceForecastStatus').textContent +=
            ` · Эталон «${raceRefTitle(role)}» загружен, прогноз рассчитан заново.`;
        }
      }else{
        if($('raceForecastStatus')){
          $('raceForecastStatus').textContent=
            'Эталон загружен. Для нового прогноза нужны трасса, все 3 GPX и VO₂max.';
        }
      }
    }catch(err){
      state.raceReferences[role]=null;
      status.textContent='✕ '+raceRefTitle(role)+': '+(err.message||String(err));
      btn.textContent='Повторить загрузку';
      btn.disabled=false;
      setActionState(btnId,'error');
      updateRaceReferenceState();
    }
  });
}

bindRaceReference('strength');
bindRaceReference('fastTrail');
bindRaceReference('flatRace');
$('raceForecastGpxBtn')?.addEventListener('click',async()=>{
  const btn=$('raceForecastGpxBtn');
  if(!(state.mapAnalysis && state.mapAnalysisReadyForCurrentGpx===true)){
    applyForecastModeColors();
    return;
  }
  try{
    if(!state.track?.length) throw new Error('Сначала загрузите GPX трассы во вкладке «Трасса».');
    setActionState('raceForecastGpxBtn','working'); btn.disabled=true;
    if(!state.mapAnalysis){
      if($('raceForecastStatus')) $('raceForecastStatus').textContent='⏳ Анализирую GPX/OSM и ищу броды…';
      const result=await analyzeMapOSM();
      renderMapAnalysis(result);
    }
    const fordKms=state.mapAnalysis?.fordKms||[];
    const trailSamples=state.mapAnalysis?.samples||state.mapAnalysis?.result?.samples||[];
    renderRaceForecast({
      fordKms,
      fordPenaltyPerSec:40,
      trailSamples,
      trailPenaltyPerKmSec:60,
      dirtPenaltyPerKmSec:30,
      unknownPenaltyPerKmSec:0,
      analysisMode:true
    });
    state.forecastMode='analysis';
    applyForecastModeColors();
    updateFinalCalcAvailability();
  }catch(err){
    if($('raceForecastStatus')) $('raceForecastStatus').textContent='✕ '+(err.message||String(err));
    setActionState('raceForecastGpxBtn','error');
  }finally{
    applyForecastModeColors();
    updateFinalCalcAvailability();
  }
});


function updateForecastStepRecalcButton(){
  const btn=$('recalcForecastStepBtn');
  if(!btn) return;
  const raw=String($('forecastStepKm')?.value||'').trim();
  const step=Number(raw);
  const valid=raw!=='' && Number.isFinite(step) && step>=1 && step<=10;
  btn.disabled=!(valid && state.raceForecast);
  setActionState('recalcForecastStepBtn',btn.disabled?'idle':'ready');
}

function recalculateForecastWithCurrentMode(){
  if(state.forecastMode==='analysis'){
    if(!state.mapAnalysis) throw new Error('Сначала выполните анализ трассы.');
    const fordKms=state.mapAnalysis?.fordKms||[];
    const trailSamples=state.mapAnalysis?.samples||state.mapAnalysis?.result?.samples||[];
    renderRaceForecast({
      fordKms,
      fordPenaltyPerSec:40,
      trailSamples,
      trailPenaltyPerKmSec:60,
      dirtPenaltyPerKmSec:30,
      unknownPenaltyPerKmSec:0,
      analysisMode:true
    });
  }else{
    renderRaceForecast({analysisMode:false});
  }
}

$('recalcForecastStepBtn')?.addEventListener('click',()=>{
  try{
    setActionState('recalcForecastStepBtn','working');
    recalculateForecastWithCurrentMode();
    setActionState('recalcForecastStepBtn','success');
  }catch(err){
    if($('raceForecastStatus')) $('raceForecastStatus').textContent='✕ '+(err.message||String(err));
    setActionState('recalcForecastStepBtn','error');
  }
});

$('forecastStepKm')?.addEventListener('input',updateForecastStepRecalcButton);

$('vo2max')?.addEventListener('input',()=>{
  if(state.raceForecast) invalidateRaceForecast();
  updateRaceReferenceState();
});
$('raceForecastBtn')?.addEventListener('click',()=>{
  renderRaceForecast({analysisMode:false});
});
$('raceEffortPct')?.addEventListener('change',()=>{invalidateRaceForecast(); updateRaceReferenceState();});
$('forecastStepKm')?.addEventListener('change',updateForecastStepRecalcButton);

window.addEventListener('DOMContentLoaded',()=>{
  if($('raceModelFormula')) $('raceModelFormula').textContent=raceFormulaText();
  updateRaceReferenceState();
  applyForecastModeColors();
  updateFinalCalcAvailability();
});

$('calcBtn').addEventListener('click',()=>{
  if(!hasFinalCalculationData()){
    clearResultForecast();
    updateFinalCalcAvailability();
    return;
  }
  setActionState('calcBtn','working');

  const finish = state.raceForecast?.totalSec || finishPrediction();
  $('finishMetric').textContent=finish?hms(finish):'—';

  const athlete=($('athleteName')?.value||'').trim();
  const rows=state.roster.filter(x=>genderOkay(x.gender));
  const a=rows.find(r=>r.athlete.toLowerCase()===athlete.toLowerCase());

  if(a){
    a.pi=+($('itraPi').value||a.pi);
    a.form+=formScore();
  }

  const ranked=[...rows].sort((x,y)=>score(y)-score(x));
  const me=ranked.find(r=>r.athlete.toLowerCase()===athlete.toLowerCase());
  const meScore=me?score(me):0;
  const mc=monteCarlo(ranked,athlete);

  $('podiumMetric').textContent=mc?(mc.pod*100).toFixed(1)+'%':'—';
  $('top10Metric').textContent=mc?(mc.top10*100).toFixed(1)+'%':'—';
  $('top30Metric').textContent=mc?(mc.top30*100).toFixed(1)+'%':'—';
  $('top50Metric').textContent=mc?(mc.top50*100).toFixed(1)+'%':'—';
  $('winMetric').textContent=mc?(mc.win*100).toFixed(1)+'%':'—';
  $('rankMetric').textContent=mc?String(mc.rank):'—';

  const pt=$('planTable').querySelector('tbody');
  pt.innerHTML='';
  buildPlan().forEach(r=>pt.insertAdjacentHTML('beforeend',
    `<tr><td>${r.km}</td><td>${r.hr}</td><td>${r.mode}</td><td>${r.pace}</td></tr>`));

  const rt=$('rivalsTable').querySelector('tbody');
  rt.innerHTML='';
  ranked
    .filter(r=>r.athlete.toLowerCase()!==athlete.toLowerCase())
    .slice(0,10)
    .forEach((r,i)=>{
      const s=score(r), d=s-meScore;
      rt.insertAdjacentHTML('beforeend',
        `<tr><td>${i+1}</td><td>${r.athlete}</td><td>${r.pi||0}</td><td>${s.toFixed(1)}</td><td>${threat(d)}</td></tr>`);
    });

  setActionState('calcBtn','success');
  document.querySelector('[data-tab="result"]').click();
});

$('saveBtn').addEventListener('click',()=>{
  const payload={
    athlete:($('athleteName')?.value||''), pi:($('itraPi')?.value||''),
    route:{dist:state.dist,gain:state.gain,loss:state.loss},
    training:{dist:$('refDist').value,gain:$('refGain').value,avgHr:$('refAvgHr').value,maxHr:$('refMaxHr').value,lthr:$('lthr').value},
    roster:state.roster,
    savedAt:new Date().toISOString()
  };
  localStorage.setItem('trailRaceAnalyzerState',JSON.stringify(payload));
  $('saveStatus').textContent='Сохранено локально на этом iPhone.';
});



window.addEventListener('DOMContentLoaded',initOpenRouterKeyUI);

window.addEventListener('DOMContentLoaded',syncMapAnalyzeButton);




window.addEventListener('DOMContentLoaded',clearMapAnalysisOnPageStart);




function clearBestTrainingData(){
  if($('hrStrategyTable')){
    const tb=$('hrStrategyTable').querySelector('tbody');
    if(tb) tb.innerHTML='';
  }
  if($('hrStrategySummary')) $('hrStrategySummary').textContent='Стратегия появится после анализа трассы и лучшей тренировки.';

  // upper OCR result cards
  if($('ocrDistance')) $('ocrDistance').textContent='—';
  if($('ocrTime')) $('ocrTime').textContent='—';
  if($('ocrPace')) $('ocrPace').textContent='—';
  if($('ocrHr')) $('ocrHr').textContent='—';
  if($('ocrGain')) $('ocrGain').textContent='—';

  // lower editable fields
  if($('refDist')) $('refDist').value='';
  if($('refMinutes')) $('refMinutes').value='';
  if($('refPace')) $('refPace').value='';
  if($('refAvgHr')) $('refAvgHr').value='';

  // OCR stats
  if($('ocrRecognitionPercent')) $('ocrRecognitionPercent').textContent='0%';
  if($('ocrElapsedTime')) $('ocrElapsedTime').textContent='0.0 с';

  if($('ocrPreview')) $('ocrPreview').style.display='none';
  if($('ocrPreviewText')) $('ocrPreviewText').textContent='';

  state.bestTraining=null;
}


function hardClearBestTrainingFields(clearFile=false){
  const ids=['refDist','refMinutes','refPace','refAvgHr'];
  ids.forEach(id=>{
    const el=$(id);
    if(el) el.value='';
  });

  const resultIds=['ocrDistance','ocrTime','ocrPace','ocrHr','ocrGain'];
  resultIds.forEach(id=>{
    const el=$(id);
    if(el) el.textContent='—';
  });

  if($('ocrRecognitionPercent')) $('ocrRecognitionPercent').textContent='0%';
  if($('ocrElapsedTime')) $('ocrElapsedTime').textContent='0.0 с';
  if($('trainingOcrStatus')) $('trainingOcrStatus').textContent='Выберите один скриншот тренировки.';
  if($('ocrSlowWarning')) $('ocrSlowWarning').style.display='none';

  state.bestTraining=null;

  try{
    sessionStorage.removeItem('trail_best_training');
    localStorage.removeItem('trail_best_training');
    localStorage.removeItem('bestTraining');
  }catch(e){}

  if(clearFile && $('trainingScreenshot')) $('trainingScreenshot').value='';

  if(clearFile && $('trainingSelectedFileName')) $('trainingSelectedFileName').textContent='';
}

function resetTrainingOcr(){
  clearBestTrainingData();
  if($('ocrSlowWarning')) $('ocrSlowWarning').style.display='none';
  if($('ocrMeta')) $('ocrMeta').style.display='grid';
  if($('ocrRecognitionPercent')) $('ocrRecognitionPercent').textContent='0%';
  if($('ocrElapsedTime')) $('ocrElapsedTime').textContent='0.0 с';

  if($('ocrParsedMetrics')) $('ocrParsedMetrics').style.display='none';
  if($('trainingOcrText')) $('trainingOcrText').value='';
  if($('trainingOcrStatus')) $('trainingOcrStatus').textContent='Скриншот выбран. Нажмите «Распознать текст со скриншота».';
  setActionState('trainingOcrBtn','ready');
}
$('trainingScreenshot')?.addEventListener('change',resetTrainingOcr);
$('trainingOcrBtn')?.addEventListener('click',async()=>{
  const selected=$('trainingScreenshot')?.files?.[0];
  if($('trainingSelectedFileName')) $('trainingSelectedFileName').textContent=selected ? `Выбран: ${selected.name}` : '';

  hardClearBestTrainingFields(false);
  const file=$('trainingScreenshot')?.files?.[0], status=$('trainingOcrStatus');
  if(!file){ if(status) status.textContent='✕ Сначала выберите скриншот.'; setActionState('trainingOcrBtn','error'); return; }
  
  try{
    const hr=await fetch('/api/ocr-health',{cache:'no-store'});
    const hs=await hr.json().catch(()=>({}));
    if(!hs.ok){
      if(status) status.textContent='✕ OCR на сервере не установлен. Нужен Docker-deploy v0.63.';
      setActionState('trainingOcrBtn','error');
      return;
    }
  }catch(e){
    if(status) status.textContent='✕ Не удалось проверить OCR-сервис.';
    setActionState('trainingOcrBtn','error');
    return;
  }

  const ocrStartedAt=performance.now();
  let ocrTimer=setInterval(()=>{if($('ocrElapsedTime')) $('ocrElapsedTime').textContent=Math.min((performance.now()-ocrStartedAt)/1000,60).toFixed(1)+' с';},200);
  let ocrSlowWarningTimer=setTimeout(()=>{
    if($('ocrSlowWarning')) $('ocrSlowWarning').style.display='block';
  },60000);
  setActionState('trainingOcrBtn','loading');
  if(status) status.textContent='Распознаю текст…';
  try{
    const fd=new FormData(); fd.append('image',file);
    const controller=new AbortController();
    const hardTimeout=setTimeout(()=>controller.abort(),60000);
    let resp;
    try{
      resp=await fetch('/api/training-ocr',{
        method:'POST',
        body:fd,
        signal:controller.signal
      });
    }finally{
      clearTimeout(hardTimeout);
    }
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok) throw new Error(data.error||`HTTP ${resp.status}`);
    const text=String(data.text||'').trim();
    $('trainingOcrText').value=text;
    let parsedMetrics=parseTrainingMetricsFromText(text);
    parsedMetrics=normalizeGarminTrainingMetrics(text,parsedMetrics);
    renderTrainingOcrMetrics(parsedMetrics);
    renderHrStrategy();
    if(typeof ocrTimer!=='undefined' && ocrTimer){clearInterval(ocrTimer);ocrTimer=null;}
    const elapsedSec=(performance.now()-ocrStartedAt)/1000;
    if($('ocrMeta')) $('ocrMeta').style.display='grid';
    if($('ocrRecognitionPercent')) $('ocrRecognitionPercent').textContent=getOcrRecognitionPercent(parsedMetrics)+'%';
    if($('ocrElapsedTime')) $('ocrElapsedTime').textContent=elapsedSec.toFixed(1)+' с';
    if(status) status.textContent=text?'✓ Текст распознан. Можно исправить вручную.':'✕ Текст не найден.';
    setActionState('trainingOcrBtn',text?'success':'error');
  }catch(err){
    if(err.name==='AbortError') clearBestTrainingData();
    if(typeof ocrSlowWarningTimer!=='undefined') clearTimeout(ocrSlowWarningTimer);
    if($('ocrSlowWarning')) $('ocrSlowWarning').style.display='none';
    if(typeof ocrTimer!=='undefined' && ocrTimer){clearInterval(ocrTimer);ocrTimer=null;}
    const failedSec=(performance.now()-ocrStartedAt)/1000;
    if($('ocrMeta')) $('ocrMeta').style.display='grid';
    if($('ocrRecognitionPercent')) $('ocrRecognitionPercent').textContent='0%';
    if($('ocrElapsedTime')) $('ocrElapsedTime').textContent=(err.name==='AbortError'?'60.0 с':failedSec.toFixed(1)+' с');
    if(status) status.textContent = err.name==='AbortError'
      ? '✕ Ошибка распознавания: превышено 60 секунд. Повторите снова.'
      : '✕ Ошибка распознавания: '+err.message;
    setActionState('trainingOcrBtn','error');
  }
});


function getOcrRecognitionPercent(metrics){
  const keys=['distance','time','pace','hr'];
  const found=keys.filter(k=>metrics && metrics[k]!==undefined && metrics[k]!==null && metrics[k]!=='').length;
  return Math.round(found/keys.length*100);
}

function parseTrainingMetricsFromText(text){
  const t=String(text||'').replace(/\u00a0/g,' ').replace(/,/g,'.');
  const out={};

  const dist=t.match(/(?:дистанц(?:ия|ии)?|distance)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*(?:км|km)\b/i)
           || t.match(/\b(\d+(?:\.\d+)?)\s*(?:км|km)\b/i);
  if(dist) out.distance=Number(dist[1]);

  const gain=t.match(/(?:набор(?:\s+высоты)?|elevation\s*gain|ascent)\s*[:\-]?\s*(\d{2,5})\s*(?:м|m)\b/i);
  if(gain) out.gain=Number(gain[1]);

  const hr=t.match(/(?:средн(?:ий|яя)\s+пульс|avg(?:erage)?\s+hr|average\s+heart\s+rate)\s*[:\-]?\s*(\d{2,3})\b/i);
  if(hr) out.hr=Number(hr[1]);

  const pace=t.match(/(?:темп|pace)\s*[:\-]?\s*(\d{1,2})[:.](\d{2})\s*(?:\/км|\/km|min\/km|мин\/км)?/i);
  if(pace) out.pace=`${pace[1]}:${pace[2]}`;

  const time=t.match(/(?:время|time|elapsed\s*time|moving\s*time)\s*[:\-]?\s*(\d{1,2}):(\d{2}):(\d{2})\b/i)
           || t.match(/\b(\d{1,2}):(\d{2}):(\d{2})\b/);
  if(time) out.time=`${time[1]}:${time[2]}:${time[3]}`;

  
  // Garmin paired row: "Расстояние Набор высоты" -> "16.16 км 2755 м"
  let pair=t.match(/Расстояние\s+Набор\s+высоты[\s\S]{0,100}?(\d+(?:\.\d+)?)\s*(?:км|km)\s+(\d{1,5})\s*(?:м|m)\b/i);
  if(pair){
    out.distance=Number(pair[1]);
    out.gain=Number(pair[2]);
  }

  return out;
}


function normalizeGarminTrainingMetrics(text, metrics){
  const s=String(text||'')
    .replace(/\u00a0/g,' ')
    .replace(/,/g,'.')
    .replace(/\r/g,'');
  const out={...(metrics||{})};
  let m;

  // Paired Garmin row:
  // "Расстояние Средний темп"
  // "8.03 км 5:53 /км"
  m=s.match(/Расстояние\s+Средн(?:ий)?\s+темп[\s\S]{0,80}?(\d+(?:\.\d+)?)\s*(?:км|km)\s+(\d{1,2}):(\d{2})\s*\/?\s*(?:км|km)/i);
  if(m){
    out.distance=Number(m[1]);
    out.pace=m[2]+':'+m[3];
  }

  // Explicit distance.
  m=s.match(/(?:Расстояние|Дистанция|Distance)[\s\S]{0,80}?(\d+(?:\.\d+)?)\s*(?:км|km)\b/i);
  if(m) out.distance=Number(m[1]);

  // Explicit average pace, with unit context so 8.03 km cannot become 8:03 pace.
  m=s.match(/(?:Средн(?:ий)?\s+темп|Темп|Pace)[\s\S]{0,100}?(\d{1,2}):(\d{2})\s*\/?\s*(?:км|km)\b/i);
  if(m) out.pace=m[1]+':'+m[2];

  // Paired Garmin row:
  // "Время в движении Набор высоты"
  // "47:14 17 м"
  m=s.match(/Время\s+в\s+движении(?:\s+Набор\s+высоты)?[\s\S]{0,80}?(\d{1,2}:\d{2}(?::\d{2})?)/i);
  if(m) out.time=m[1];

  // Paired Garmin row:
  // "Калории Сред. пульс"
  // "636 Ккал 155 уд/мин"
  m=s.match(/Калории\s+Сред\.?\s*пульс[\s\S]{0,80}?\d+\s*Ккал\s+(\d{2,3})\s*уд\/мин/i);
  if(m) out.hr=Number(m[1]);

  // Explicit average HR fallback.
  m=s.match(/(?:Сред\.?\s*пульс|Средн(?:ий|яя)\s+пульс|Avg(?:erage)?\s+HR)[\s\S]{0,80}?(\d{2,3})\s*(?:уд\/мин|bpm)\b/i);
  if(m) out.hr=Number(m[1]);

  
  // Paired Garmin row:
  // "Расстояние Набор высоты"
  // "16.16 км 2755 м"
  m=s.match(/Расстояние\s+Набор\s+высоты[\s\S]{0,100}?(\d+(?:\.\d+)?)\s*(?:км|km)\s+(\d{1,5})\s*(?:м|m)\b/i);
  if(m){
    out.distance=Number(m[1]);
    out.gain=Number(m[2]);
  }

  // More tolerant paired-label OCR: labels may be on one line,
  // values on the following line with extra spaces/newlines.
  if(out.distance==null){
    m=s.match(/Расстояние[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*(?:км|km)\b/i);
    if(m) out.distance=Number(m[1]);
  }

  if(out.gain==null){
    m=s.match(/Набор\s+высоты[\s\S]{0,120}?(\d{1,5})\s*(?:м|m)\b/i);
    if(m) out.gain=Number(m[1]);
  }

  return out;
}


function setMovingTimeFieldFromOCR(value){
  const el=$('refMinutes');
  if(!el || !value) return;

  const s=String(value).trim();
  let seconds=null;
  let m=s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if(m){
    seconds=Number(m[1])*3600+Number(m[2])*60+Number(m[3]);
  }else{
    m=s.match(/^(\d{1,3}):(\d{2})$/);
    if(m) seconds=Number(m[1])*60+Number(m[2]);
  }

  // v0.97 lower field originally inherited a numeric "minutes" input.
  if(el.type==='number'){
    if(seconds!=null) el.value=(seconds/60).toFixed(2).replace(/\.00$/,'');
    else{
      const n=Number(s.replace(',','.'));
      el.value=Number.isFinite(n)?String(n):'';
    }
  }else{
    el.value=s;
  }
}

function renderTrainingOcrMetrics(metrics){
  if($('refDist') && metrics.distance!=null) $('refDist').value=metrics.distance;
  if(metrics.time) setMovingTimeFieldFromOCR(metrics.time);
  if($('refPace') && metrics.pace) $('refPace').value=metrics.pace;
  if($('refAvgHr') && metrics.hr!=null) $('refAvgHr').value=metrics.hr;

  const box=$('ocrParsedMetrics');
  if(!box) return;

  const has=Object.keys(metrics||{}).length>0;
  box.style.display=has?'grid':'none';

  if($('ocrDistance')) $('ocrDistance').textContent=metrics.distance!=null?`${metrics.distance} км`:'—';
  if($('ocrGain')) $('ocrGain').textContent=metrics.gain!=null?`${metrics.gain} м`:'—';
  if($('ocrTime')) $('ocrTime').textContent=metrics.time||'—';
  if($('ocrPace')) $('ocrPace').textContent=metrics.pace?`${metrics.pace} /км`:'—';
  if($('ocrHr')) $('ocrHr').textContent=metrics.hr!=null?`${metrics.hr} уд/мин`:'—';

  // Auto-fill existing training fields when present.
  if(metrics.distance!=null && $('refDist')) $('refDist').value=String(metrics.distance);
  if(metrics.gain!=null && $('refGain')) $('refGain').value=String(metrics.gain);
  if(metrics.hr!=null && $('refAvgHr')) $('refAvgHr').value=String(metrics.hr);
}




function clearBestTrainingOnPageLoad(){
  hardClearBestTrainingFields(true);
  // Safari may restore form values after DOMContentLoaded, so clear again shortly after paint.
  requestAnimationFrame(()=>{
    hardClearBestTrainingFields(true);
    setTimeout(()=>hardClearBestTrainingFields(true),120);
    setTimeout(()=>hardClearBestTrainingFields(true),500);
  });
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',clearBestTrainingOnPageLoad,{once:true});
}else{
  clearBestTrainingOnPageLoad();
}

window.addEventListener('pageshow',()=>{
  clearBestTrainingOnPageLoad();
});

// v0.59 profile-driven race simulation
(()=>{
const events=[
  ['🩹','Нашли аптечку','По дороге нашли аптечку — теперь она есть до конца гонки.',0],
  ['🔦','Нашли фонарик','По дороге нашли фонарик — теперь он есть до конца гонки.',0],
  ['🌙','Ночь','Стемнело — результат зависит от наличия фонарика.',0],
  ['🩸','Поранился','Нужно обработать травму.',0],
  ['🐻','Встреча с Мишей с топором','Миша подбодрил — ноги неожиданно побежали быстрее.',-300],
  ['😅','Слишком быстро на старте','Пришлось сбросить темп и восстановить дыхание.',120],
  ['📸','Остановились пофоткать','Вид оказался слишком красивым, чтобы пройти мимо.',180],
  ['🐱','Засмотрелись на котика','Котик уверенно выиграл борьбу за внимание.',300],
  ['📱','Потеряли телефон','Обыскали рюкзак, карманы и немного вернулись назад.',300],
  ['🍔','Зажрались на ПП','Пункт питания оказался подозрительно хорош.',420],
  ['🗺️','Сбились с трека','Пришлось вернуться к разметке.',360],
  ['😣','Свело ногу','Остановка, растяжка и осторожный рестарт.',240],
  ['🌧️','Дождь','Проверяем мембранку.',0],
  ['☀️','Жара','Проверяем запас воды.',0],
  ['👟','Развязался шнурок','Короткая техническая остановка.',60],
  ['🪨','Споткнулись о камень','Ритм потерян, но падения удалось избежать.',90],
  ['🤳','Селфи с волонтёром','Память о гонке важнее пары минут.',120],
  ['🧦','Поправили носок','Та самая мелочь, которую невозможно игнорировать.',90],
  ['🧥','Куртка туда-сюда','Сняли, убрали, достали и снова надели.',120],
  ['🚰','Очередь за водой','На пункте питания внезапно аншлаг.',180],
  ['🦟','Атака насекомых','Пришлось отбиваться на ходу.',75],
  ['💧','Брод пройден идеально','Не тормозили и быстро вернулись в ритм.',-120],
  ['🥤','Кола сработала','Появилась энергия и несколько быстрых минут.',-150],
  ['🍌','Банан спас гонку','Топливо поступило точно вовремя.',-120],
  ['🎵','Любимый трек','Поймали ритм и незаметно ускорились.',-75],
  ['🔥','Второе дыхание','Ноги неожиданно вспомнили, зачем они здесь.',-120],
  ['⚡','Идеальный спуск','Отпустили ноги и отыграли время.',-150],
  ['📣','Болельщики включили турбо','Поддержка сработала лучше геля. Бонус: минус 5 минут от финишного времени.',-300],
  ['🦌','Встретили оленя','Пришлось остановиться и убедиться, что это реально.',150],
  ['🌄','Залипли на рассвет','Красиво. Очень красиво. Время идёт.',180],
  ['🧭','Идеально срезали развилку','Разметку прочитали с первого раза.',-45],
  ['🏃','Прицепились к сильной группе','Группа помогла держать хороший ритм.',-90],
  ['🧃','Гель открылся в рюкзаке','Спасательная операция липких запасов.',105],
  ['🫠','Засосало в грязь','Кроссовок остался с вами, но не сразу.',150],
  ['🌬️','Попутный ветер','Несколько открытых километров прошли легче.',-75],
  ['🦫','Бобр сделал плотину','Пришлось искать обход и разбираться с новой гидротехнической обстановкой.',300],
  ['🧠','Идеально разложились','Не форсировали начало и отыграли на второй половине.',-120]
];


let simFordLeafletMap=null;
function renderSimFordMap(){
  const el=document.getElementById('simFordMap');
  if(!el) return;
  const pts=(state.track||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  const ma=simMapAnalysis();
  const conf=(ma.confirmedFordKms||[]).map(Number).filter(Number.isFinite);
  const likely=(ma.likelyFordKms||ma.fordKms||[]).map(Number).filter(Number.isFinite);
  const bridges=(ma.bridgeKms||[]).map(Number).filter(Number.isFinite);
  const s=document.getElementById('simFordSummary');
  if(s) s.innerHTML=`Броды на трассе: <b>${new Set([...conf,...likely].map(x=>x.toFixed(2))).size}</b><br>Подтверждённые OSM: ${conf.length}<br>Вероятные: ${likely.length}<br>По мосту: ${bridges.length}`;

  if(typeof L==='undefined'||pts.length<2){el.innerHTML='<div class="muted" style="padding:16px">Схема трека появится после загрузки GPX. Фоновая карта требует интернет.</div>';return}
  if(simFordLeafletMap){try{simFordLeafletMap.remove()}catch(e){}}
  simFordLeafletMap=L.map(el,{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false,tap:false});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(simFordLeafletMap);
  const route=L.polyline(pts.map(p=>[p.lat,p.lon]),{color:'#ff2020',weight:7,opacity:1,lineCap:'round',lineJoin:'round',interactive:false}).addTo(simFordLeafletMap); route.bringToFront();
  simFordLeafletMap.fitBounds(route.getBounds(),{padding:[10,10]});

  const nearest=km=>{
    let b=null,d=1e9;
    for(const p of (state.track||[])){
      if(!Number.isFinite(p.km)||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
      const q=Math.abs(p.km-km);if(q<d){d=q;b=p}
    }
    return b;
  };
  const add=(km,emoji,border,label)=>{
    const p=nearest(km);if(!p)return;
    const icon=L.divIcon({className:'',html:`<div style="width:26px;height:26px;border-radius:50%;background:#0f172a;border:2px solid ${border};display:flex;align-items:center;justify-content:center;font-size:14px">${emoji}</div>`,iconSize:[26,26],iconAnchor:[13,13]});
    L.marker([p.lat,p.lon],{icon}).bindPopup(`<b>${label}</b><br>${km.toFixed(1)} км`).addTo(simFordLeafletMap);
  };
  likely.forEach(k=>add(k,'🌊','#38bdf8','Вероятный брод'));
  conf.forEach(k=>add(k,'✓','#22c55e','Подтверждённый брод OSM'));
  bridges.forEach(k=>add(k,'🌉','#8b5cf6','Мост'));
  setTimeout(()=>simFordLeafletMap.invalidateSize(),100);
}

function drawSimProfile(){
  const c=document.getElementById('simProfileCanvas');if(!c)return;
  const pts=(state.track||[]).filter(p=>Number.isFinite(p.km)&&Number.isFinite(p.ele));
  const r=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1,W=Math.max(320,r.width),H=r.height||260;
  c.width=W*dpr;c.height=H*dpr;const x=c.getContext('2d');x.scale(dpr,dpr);x.clearRect(0,0,W,H);
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0d1a2b');g.addColorStop(1,'#07111f');x.fillStyle=g;x.fillRect(0,0,W,H);
  if(!pts.length)return;
  const L=45,R=15,T=18,B=28,minE=Math.min(...pts.map(p=>p.ele)),maxE=Math.max(...pts.map(p=>p.ele)),range=Math.max(1,maxE-minE);
  const maxKm=Math.max(.1,Number(state.dist)||pts.at(-1).km||1),xx=km=>L+(km/maxKm)*(W-L-R),yy=e=>H-B-((e-minE)/range)*(H-T-B);
  x.beginPath();pts.forEach((p,i)=>i?x.lineTo(xx(p.km),yy(p.ele)):x.moveTo(xx(p.km),yy(p.ele)));x.lineTo(W-R,H-B);x.lineTo(L,H-B);x.closePath();x.fillStyle='rgba(22,163,74,.28)';x.fill();
  x.beginPath();pts.forEach((p,i)=>i?x.lineTo(xx(p.km),yy(p.ele)):x.moveTo(xx(p.km),yy(p.ele)));x.strokeStyle='#4ade80';x.lineWidth=2.5;x.stroke();

  const km=maxKm*progress, px=xx(km);
  x.strokeStyle='#fff';x.lineWidth=2;x.beginPath();x.moveTo(px,T);x.lineTo(px,H-B);x.stroke();
  const el=interpElevation(km),py=yy(el);x.fillStyle='#fff';x.beginPath();x.arc(px,py,5,0,Math.PI*2);x.fill();
  x.font='17px system-ui, Apple Color Emoji';x.fillText('🏃',px-6,Math.max(17,py-10));
  x.fillStyle='#cbd5e1';x.font='11px system-ui';x.textAlign='left';x.fillText(`${Math.round(maxE)} м`,4,18);x.fillText(`${Math.round(minE)} м`,4,H-B);
  x.textAlign='center';for(let i=0;i<=5;i++){const k=maxKm*i/5;x.fillText(`${k.toFixed(i===0?0:1)} км`,xx(k),H-8)}
}

const E=id=>document.getElementById(id);

function showMishaStartDirect(){
  const el=document.getElementById('mishaStartSendoff');
  if(!el) return;
  const b=el.querySelector('b'), s=el.querySelector('span');
  if(b) b.textContent='🐻 Миша с топором';
  if(s) s.textContent='СТАРТ 🏁';
  el.classList.add('show');
  clearTimeout(window.__mishaStartTimer);
  window.__mishaStartTimer=setTimeout(()=>el.classList.remove('show'),3000);
}
function showMishaFinishDirect(){
  const el=document.getElementById('mishaFinishWelcome');
  if(!el) return;
  const b=el.querySelector('b'), s=el.querySelector('span');
  if(b) b.textContent='🐻 Миша с топором';
  if(s) s.textContent='ФИНИШ 🏁';
  el.classList.add('show');
  clearTimeout(window.__mishaFinishTimer);
  window.__mishaFinishTimer=setTimeout(()=>el.classList.remove('show'),3000);
}

function hideFirstPlaceOverlay(){
  const el=document.getElementById('simFirstPlaceBadge');
  if(el) el.classList.remove('show');
  clearTimeout(window.__firstPlaceTimer);
  clearTimeout(window.__firstPlaceDelayTimer);
}
function showFirstPlaceOverlay(){
  const el=document.getElementById('simFirstPlaceBadge');
  if(!el) return;
  const finish=Math.max(0,baseSec()+penalty);
  const gain=Math.max(0,baseSec()-finish);
  const text=document.getElementById('simFirstPlaceText');
  if(text){
    text.textContent=`быстрее на ${fmt(gain)}`;
  }
  el.classList.add('show');
  clearTimeout(window.__firstPlaceTimer);
  // v0.0259: keep the "1 МЕСТО" result on screen for 5 full seconds.
  window.__firstPlaceTimer=setTimeout(()=>el.classList.remove('show'),5000);
}
function maybeShowFirstPlaceAtFinish(){
  const b=baseSec();
  const finish=b+penalty;
  // v0.0245: in the virtual championship, 1st place is earned
  // whenever the final race time is strictly faster than the forecast.
  if(b>0 && finish<b){
    clearTimeout(window.__firstPlaceDelayTimer);
    // Misha meets the runner first; then the 1st-place picture appears.
    window.__firstPlaceDelayTimer=setTimeout(showFirstPlaceOverlay,3100);
    return true;
  }
  return false;
}

if(!E('simStart')) return;
let timer=null,pauseTimer=null,countTimer=null,progress=0,penalty=0,fired=new Set(),schedule=[],particles=[],simStartDate=null;
let aidStations=[],fatigueActive=false,luckActive=false,demotivationActive=false,negativeEventCount=0,simulationDNF=false,lastAidIndex=-1;
const equipmentState={
  checked:false,
  medkit:true,
  water:true,
  membrane:true,
  flashlight:true
};

let randomEventAdjustmentSec=0;


const activeEventCount=()=>{
  const hours=Math.max(0.1,baseSec()/3600);

  // v0.0245 — event count by forecast duration:
  // ~1 h  -> exactly 3
  // ~2 h  -> 4–6
  // ~3 h  -> 5–7
  // ~4 h  -> 6–8
  // ~5 h  -> 7–9
  // ~6 h  -> 8–10
  // Longer races continue growing gradually.
  let minEvents,maxEvents;

  if(hours<=1.25){
    minEvents=3; maxEvents=3;
  }else if(hours<=2.5){
    minEvents=4; maxEvents=6;
  }else if(hours<=3.5){
    minEvents=5; maxEvents=7;
  }else if(hours<=4.5){
    minEvents=6; maxEvents=8;
  }else if(hours<=5.5){
    minEvents=7; maxEvents=9;
  }else if(hours<=6.5){
    minEvents=8; maxEvents=10;
  }else{
    minEvents=Math.max(9,Math.floor(hours)+2);
    maxEvents=Math.max(minEvents,Math.min(events.length-1,Math.ceil(hours*1.7)));
  }

  maxEvents=Math.min(maxEvents,Math.max(0,events.length-1));
  minEvents=Math.min(minEvents,maxEvents);

  if(maxEvents<=0) return 0;
  return minEvents + Math.floor(Math.random()*(maxEvents-minEvents+1));
};
let virtualSimTrack=null;
let simulationTrackMode=null; // null | 'virtual' | 'real'

function dist(){
  if(simulationTrackMode==='virtual' && virtualSimTrack) return Number(virtualSimTrack.dist||0);
  if(simulationTrackMode==='real') return Number(state?.dist||0);
  return 0;
}
function gain(){
  if(simulationTrackMode==='virtual' && virtualSimTrack) return Number(virtualSimTrack.gain||0);
  if(simulationTrackMode==='real') return Number(state?.gain||0);
  return 0;
}
function baseSec(){
  if(simulationTrackMode==='virtual' && virtualSimTrack) return Number(virtualSimTrack.totalSec||0);
  if(simulationTrackMode==='real') return Number(state?.raceForecast?.totalSec||0);
  return 0;
}
function simTrackPoints(){
  if(simulationTrackMode==='virtual' && virtualSimTrack) return virtualSimTrack.track||[];
  if(simulationTrackMode==='real') return state?.track||[];
  return [];
}
function simMapAnalysis(){
  if(simulationTrackMode==='virtual' && virtualSimTrack) return virtualSimTrack.mapAnalysis||{};
  if(simulationTrackMode==='real') return state?.mapAnalysis||{};
  return {};
}
function updateSimulationSourceButtons(){
  const vb=E('simVirtual20Btn'), rb=E('simRealTrackBtn');
  if(vb){
    vb.disabled=false;
    vb.classList.toggle('active-source',simulationTrackMode==='virtual');
  }
  if(rb){
    rb.disabled=false;
    rb.classList.toggle('active-source',simulationTrackMode==='real');
  }
}
function clearSimulationTrackChoice(){
  simulationTrackMode=null;
  virtualSimTrack=null;
  updateSimulationSourceButtons();
  renderVirtualCampaign();
  const s=E('simVirtual20Status');
  if(s) s.textContent='Выберите виртуальный трек 20 км или реальный загруженный трек.';
}

const VIRTUAL_LEVELS=[
  {
    id:1, dist:20, gain:500, totalSec:2*3600,
    aidStations:[14],
    fords:[6],
    label:'20 км · +500 м · ПП 14 км'
  },
  {
    id:2, dist:60, gain:2500, totalSec:6*3600,
    aidStations:[12,24,36,48],
    fords:[18,42],
    label:'60 км · +2500 м · 4 ПП'
  },
  {
    id:3, dist:100, gain:6000, totalSec:12*3600,
    aidStations:[15,35,55,75,90],
    fords:[28,68],
    label:'100 км · +6000 м · 5 ПП'
  }
];
let virtualCampaign={
  level:1,
  lives:3,
  passed:[false,false,false],
  champion:false,
  attemptActive:false
};

function buildLevelTrack(level){
  const raw=[];
  const n=Math.max(201,Math.round(level.dist*10)+1);

  for(let i=0;i<n;i++){
    const km=level.dist*i/(n-1);
    let ele=100;

    if(level.id===1){
      // Level 1 stays exactly as requested:
      // 0–3 km +500 m, 3–7 km down, then flat.
      if(km<=3) ele=100+(500/3)*km;
      else if(km<=7) ele=600-(500/4)*(km-3);
      else ele=100;
    }else{
      // Repeating triangular climbs whose cumulative ascent equals level.gain.
      const climbs=level.id===2 ? 5 : 6;
      const climbGain=level.gain/climbs;
      const cycle=level.dist/climbs;
      const phase=(km%cycle)/cycle;
      ele=phase<=0.5
        ? 100+climbGain*(phase/0.5)
        : 100+climbGain*((1-phase)/0.5);
    }

    raw.push({
      km, ele,
      lat:55.75+km*0.00003,
      lon:37.60+km*0.00003
    });
  }
  return raw;
}

function virtualLevelConfig(){
  return VIRTUAL_LEVELS[Math.max(0,Math.min(2,virtualCampaign.level-1))];
}

function renderVirtualCampaign(){
  const panel=E('virtualCampaignPanel');
  if(panel) panel.classList.toggle('show',simulationTrackMode==='virtual');

  const lives=E('virtualLives');
  if(lives){
    lives.textContent='❤️'.repeat(Math.max(0,virtualCampaign.lives))+
      '🖤'.repeat(Math.max(0,3-virtualCampaign.lives));
  }

  for(let i=1;i<=3;i++){
    const el=E('virtualLevel'+i);
    if(!el) continue;
    el.classList.remove('current','passed','locked');
    if(virtualCampaign.passed[i-1]) el.classList.add('passed');
    else if(i===virtualCampaign.level && !virtualCampaign.champion) el.classList.add('current');
    else if(i>virtualCampaign.level) el.classList.add('locked');
  }

  const hint=E('virtualCampaignHint');
  if(hint){
    if(virtualCampaign.champion) hint.textContent='🏆 Все уровни пройдены.';
    else if(virtualCampaign.lives<=0) hint.textContent='💔 Жизни закончились. Начните чемпионат заново.';
    else hint.textContent=`Уровень ${virtualCampaign.level}/3. Чтобы стать первым, надо финишировать быстрее времени прогноза. Первое место открывает следующий уровень и восстанавливает 3 жизни.`;
  }

  const restart=E('virtualCampaignRestart');
  if(restart) restart.classList.toggle('show',virtualCampaign.lives<=0 || virtualCampaign.champion);
}

function showVirtualChampion(){
  virtualCampaign.champion=true;
  renderVirtualCampaign();
  const el=E('virtualChampionOverlay');
  if(el){
    el.classList.add('show');
    el.setAttribute('aria-hidden','false');
  }
}

function restartVirtualCampaign(){
  virtualCampaign={level:1,lives:3,passed:[false,false,false],champion:false,attemptActive:false};
  E('virtualChampionOverlay')?.classList.remove('show');
  if(simulationTrackMode==='virtual') activateVirtualSimulationTrack();
  else renderVirtualCampaign();
}

function loadCurrentVirtualLevel(){
  const level=virtualLevelConfig();
  virtualSimTrack={
    dist:level.dist,
    gain:level.gain,
    totalSec:level.totalSec,
    track:buildLevelTrack(level),
    mapAnalysis:{
      fordKms:level.fords.slice(),
      confirmedFordKms:level.fords.slice(),
      likelyFordKms:[],
      bridgeKms:[]
    },
    aidStations:level.aidStations.slice(),
    level:level.id
  };
  chooseAidStations();
  return level;
}

function activateVirtualSimulationTrack(){
  const level=loadCurrentVirtualLevel();
  simulationTrackMode='virtual';
  virtualCampaign.attemptActive=false;
  updateSimulationSourceButtons();
  renderVirtualCampaign();

  const s=E('simVirtual20Status');
  if(s) s.textContent=`✓ Виртуальный уровень ${level.id}: ${level.label}. Жизни: ${virtualCampaign.lives}/3.`;
  reset();
}

function beginVirtualAttempt(){
  if(simulationTrackMode!=='virtual') return true;
  if(virtualCampaign.champion){
    showVirtualChampion();
    return false;
  }
  if(virtualCampaign.lives<=0){
    renderVirtualCampaign();
    E('simStatus').textContent='💔 Жизни закончились. Нажмите «Начать чемпионат заново».';
    return false;
  }
  if(!virtualCampaign.attemptActive){
    virtualCampaign.lives--;
    virtualCampaign.attemptActive=true;
    renderVirtualCampaign();
    const level=virtualLevelConfig();
    const s=E('simVirtual20Status');
    if(s) s.textContent=`▶ Уровень ${level.id}: попытка началась. Осталось жизней: ${virtualCampaign.lives}/3.`;
  }
  return true;
}

function finishVirtualAttempt(firstPlace){
  if(simulationTrackMode!=='virtual' || !virtualCampaign.attemptActive) return;
  virtualCampaign.attemptActive=false;

  if(firstPlace){
    const idx=virtualCampaign.level-1;
    virtualCampaign.passed[idx]=true;
    virtualCampaign.lives=3;

    if(virtualCampaign.level>=3){
      showVirtualChampion();
      E('simStatus').textContent='🏆 ТЫ ЧЕМПИОН! Все три уровня пройдены.';
      return;
    }

    virtualCampaign.level++;
    virtualCampaign.lives=3;

    // v0.0245: immediately rebuild the track/profile/map for the newly unlocked level.
    const next=loadCurrentVirtualLevel();
    renderVirtualCampaign();
    reset();
    renderVirtualCampaign();

    const s=E('simVirtual20Status');
    if(s) s.textContent=`🥇 Уровень пройден! Жизни: 3/3. Загружен уровень ${next.id}: ${next.label}.`;
  }else{
    renderVirtualCampaign();
    const s=E('simVirtual20Status');
    if(s){
      s.textContent=virtualCampaign.lives>0
        ? `Финиш без 1 места. Уровень ${virtualCampaign.level} не пройден. Осталось жизней: ${virtualCampaign.lives}/3.`
        : `💔 Жизни закончились на уровне ${virtualCampaign.level}.`;
    }
  }
}

function activateRealSimulationTrack(){
  if(!(state?.track?.length>1)){
    const s=E('simVirtual20Status');
    if(s) s.textContent='⚠️ Сначала загрузите реальный GPX во вкладке «Трек гонки».';
    return;
  }
  if(!(state?.raceForecast?.totalSec>0)){
    const s=E('simVirtual20Status');
    if(s) s.textContent='⚠️ Для реального трека сначала рассчитайте «Прогноз гонки» в разделе 2.';
    return;
  }
  virtualSimTrack=null;
  simulationTrackMode='real';
  virtualCampaign.attemptActive=false;
  updateSimulationSourceButtons();
  renderVirtualCampaign();
  const s=E('simVirtual20Status');
  if(s) s.textContent=`✓ Выбран реальный трек: ${Number(state.dist||0).toFixed(1)} км · +${Math.round(Number(state.gain||0))} м.`;
  reset();
}
function fmt(sec){sec=Math.max(0,Math.round(sec||0));const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function delta(s){const sign=s>=0?'+':'−',a=Math.abs(Math.round(s));return `${sign}${Math.floor(a/60)}:${String(a%60).padStart(2,'0')}`}
function shuffled(a){return a.slice().sort(()=>Math.random()-.5)}

function chooseAidStations(){
  const d=dist();
  if(!d){aidStations=[];return}

  // v0.0245: each virtual level has its own fixed aid stations.
  if(simulationTrackMode==='virtual' && virtualSimTrack){
    aidStations=(virtualSimTrack.aidStations||[]).slice();
    return;
  }

  // Минимум 5 ПП на 90 км и длиннее.
  let minCount=Math.max(1,Math.ceil(d/18));
  if(d>=90) minCount=Math.max(5,minCount);

  // В текущей логике максимум 5 ПП.
  const count=Math.min(5,minCount);

  // ПП не ближе 10 км друг от друга.
  const minGap=10;
  const firstMin=Math.min(8,Math.max(3,d*.08));
  const lastMax=d-3;
  const usable=Math.max(0,lastMax-firstMin);
  const baseGap=count>1?usable/(count-1):0;

  aidStations=[];

  for(let i=0;i<count;i++){
    let km=count===1 ? d*.5 : firstMin+i*baseGap;

    // Небольшой рандом только когда хватает места сверх минимальных 10 км.
    if(i>0 && i<count-1){
      const room=Math.max(0,baseGap-minGap);
      km += (Math.random()-.5)*Math.min(4,room*.7);
    }

    if(i>0) km=Math.max(km,aidStations[i-1]+minGap);
    km=Math.min(km,lastMax-(count-1-i)*minGap);
    aidStations.push(Math.max(1,km));
  }

  // Контрольный проход.
  for(let i=1;i<aidStations.length;i++){
    if(aidStations[i]-aidStations[i-1]<minGap){
      aidStations[i]=aidStations[i-1]+minGap;
    }
  }

  aidStations=aidStations.filter((km,i,arr)=>
    km<d && (i===0 || km-arr[i-1]>=minGap-0.01)
  );
}
function renderSimConditions(){
  const f=E('simFatigueState'),l=E('simLuckState'),m=E('simMotivationState');
  if(f){f.textContent=fatigueActive?'🥱 Усталость: +30:00 до ПП':'💪 без усталости';f.className=fatigueActive?'warn':''}
  if(l){l.textContent=luckActive?'🍀 Удача: +20% к позитивным событиям':'🍀 обычная удача';l.className=luckActive?'good':''}
  if(m){m.textContent=demotivationActive?'😞 Демотивация: 3 минуса = DNF':'🔥 мотивация стабильна';m.className=demotivationActive?'bad':''}
}
function conditionChip(icon,title,deltaText=''){
  const c=E('simEventChip');if(!c)return;
  E('simEventChipIcon').textContent=icon;E('simEventChipTitle').textContent=title;E('simEventChipDelta').textContent=deltaText;
  c.classList.add('show');setTimeout(()=>c.classList.remove('show'),3000);
}
function initStartConditions(){
  fatigueActive=false;
  luckActive=false;
  demotivationActive=false;
  fatigueApplied=false;
  negativeEventCount=0;
  simulationDNF=false;
  lastAidIndex=-1;

  // v0.97: only one start state can appear, and only in 30% of simulations total.
  if(Math.random()<0.30){
    const pick=Math.floor(Math.random()*3);
    if(pick===0){
      fatigueActive=true;
      fatigueApplied=true;
      fatigueStartVirtualSec=0;
      fatiguePenaltyAppliedSec=1800;
      penalty+=1800;
      setTimeout(()=>showConditionChip('🥱','Усталость на старте','до +30:00, пока не доберёшься до ПП'),250);
    }else if(pick===1){
      luckActive=true;
      setTimeout(()=>showConditionChip('🍀','Редкая удача','+20% к положительным событиям'),250);
    }else{
      demotivationActive=true;
      setTimeout(()=>showConditionChip('😞','Демотивация','3 минуса = DNF'),250);
    }
  }

  renderSimConditions();
}

function celebrateAidStation(km,index){
  // Visual burst: music notes, smiles and fruit.
  const icons=['🎵','🎶','😄','🤩','🍌','🍊','🍎','🍉','🥤'];
  for(let i=0;i<20;i++){
    const icon=icons[Math.floor(Math.random()*icons.length)];
    particles.push({
      icon,
      life:1.4,
      x:0,
      y:0,
      vx:(Math.random()-.5)*4.2,
      vy:-1.8-Math.random()*2.8,
      rot:(Math.random()-.5)*.35,
      size:22+Math.random()*14
    });
  }

  showConditionChip('🍊',`ПП ${index+1} · ${km.toFixed(1)} км`,'🎵 перекусили');

  // Short cheerful jingle via WebAudio; ignore silently if browser blocks audio.
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC){
      const ctx=new AC();
      const now=ctx.currentTime;
      [523.25,659.25,783.99].forEach((freq,i)=>{
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.type='sine';
        osc.frequency.value=freq;
        gain.gain.setValueAtTime(0.0001,now+i*.12);
        gain.gain.exponentialRampToValueAtTime(0.08,now+i*.12+.02);
        gain.gain.exponentialRampToValueAtTime(0.0001,now+i*.12+.22);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now+i*.12);
        osc.stop(now+i*.12+.24);
      });
      setTimeout(()=>{try{ctx.close()}catch(_e){}},1200);
    }
  }catch(_e){}
}

function checkAidStation(km){
  if(!aidStations.length)return;

  for(let i=lastAidIndex+1;i<aidStations.length;i++){
    if(km>=aidStations[i]){
      lastAidIndex=i;
      celebrateAidStation(aidStations[i],i);

      if(fatigueActive){
        fatigueActive=false;

        // Штраф усталости уже получен на старте (+30:00). На ПП эффект
        // заканчивается, но потерянное время НЕ возвращается и остаётся
        // в текущем и финишном времени.
        fatiguePenaltyAppliedSec=1800;
        showConditionChip('🍊',`ПП ${i+1}: усталость прошла`,'+30:00 сохранено');
        renderSimConditions();
      }else{
        showConditionChip('🍊',`ПП ${i+1}`,'подкрепились');
      }
    }else break;
  }
}
function endSimulationDNF(){
  simulationDNF=true;clearInterval(timer);timer=null;clearTimeout(pauseTimer);clearInterval(countTimer);
  E('simStart').textContent='↻';E('simStatus').textContent='DNF — три отрицательных события.';
  E('simDnfBanner')?.classList.add('show');updateResults();draw();
  finishVirtualAttempt(false);
}



function renderEquipmentState(){
  const map=[
    ['eqMedkit','medkit','🩹 Аптечка'],
    ['eqWater','water','💧 Вода'],
    ['eqMembrane','membrane','🧥 Мембранка'],
    ['eqFlashlight','flashlight','🔦 Фонарик']
  ];
  for(const [id,key,label] of map){
    const el=E(id); if(!el) continue;
    if(!equipmentState.checked){
      el.textContent=label+': ?'; el.className='';
    }else if(equipmentState[key]){
      el.textContent=label+': есть'; el.className='ok';
    }else{
      el.textContent=label+': НЕТ'; el.className='miss';
    }
  }
}
function checkEquipmentRandom(){
  if(equipmentState.checked) return;
  // 0, 1 or 2 missing items; never more than two.
  const keys=['medkit','water','membrane','flashlight'];
  const missingCount=Math.floor(Math.random()*3);
  const shuffledKeys=shuffled(keys);
  for(const key of keys) equipmentState[key]=true;
  for(let i=0;i<missingCount;i++) equipmentState[shuffledKeys[i]]=false;
  equipmentState.checked=true;
  renderEquipmentState();
  const equipmentBtn=E('equipmentCheckBtn');
  if(equipmentBtn){
    equipmentBtn.disabled=true;
    equipmentBtn.textContent='Проверка пройдена';
  }

  const names={medkit:'аптечки',water:'воды',membrane:'мембранки',flashlight:'фонарика'};
  const missing=keys.filter(k=>!equipmentState[k]);
  const summary=E('equipmentCheckSummary');
  const result=E('equipmentCheckResult');

  if(!missing.length){
    if(summary) summary.textContent='✅ Всё есть.';
    if(result){result.className='equipment-check-result good';result.textContent='✅ Всё в порядке! Вся обязательная экипировка на месте.'}
  }else{
    const txt=missing.map(k=>names[k]).join(' и ');
    if(summary) summary.textContent='⚠️ Не хватает: '+txt+'.';
    if(result){result.className='equipment-check-result bad';result.textContent='⚠️ Проверка: не хватает '+txt+'.'}
  }
  E('equipmentCheckModal')?.classList.add('show');
}
function closeEquipmentModal(){
  E('equipmentCheckModal')?.classList.remove('show');
}
function makeSchedule(){
  const n=Math.max(1,activeEventCount());
  const misha=events.find(e=>e[1]==='Встреча с Мишей с топором');

  const negatives=shuffled(events.filter(e=>e!==misha && e[3]>0));
  const positives=shuffled(events.filter(e=>e!==misha && e[3]<0));
  const neutral=shuffled(events.filter(e=>e!==misha && e[3]===0));

  let negNeed=Math.floor(n/2);
  let posNeed=Math.floor(n/2);
  if(n%2){
    if(Math.random()<.5) negNeed++; else posNeed++;
  }
  if(luckActive && n%2){
    posNeed=Math.ceil(n/2);
    negNeed=Math.floor(n/2);
  }

  const selected=[];
  selected.push(...negatives.slice(0,negNeed));
  selected.push(...positives.slice(0,posNeed));

  if(selected.length<n){
    const rest=shuffled([
      ...negatives.slice(negNeed),
      ...positives.slice(posNeed),
      ...neutral
    ]).filter(e=>!selected.includes(e));
    selected.push(...rest.slice(0,n-selected.length));
  }

  if(misha && selected.length && Math.random()<.08){
    const positiveIndexes=selected.map((e,i)=>e[3]<0?i:-1).filter(i=>i>=0);
    const idx=positiveIndexes.length
      ? positiveIndexes[Math.floor(Math.random()*positiveIndexes.length)]
      : Math.floor(Math.random()*selected.length);
    selected[idx]=misha;
  }

  const total=Math.max(1,baseSec());
  const count=Math.max(1,selected.length);

  // Random event moments. No even distribution requirement.
  const minGapSec=Math.min(900,Math.max(90,total/count*0.28));
  const times=[];
  let attempts=0;
  while(times.length<count && attempts++<5000){
    const t=total*(.05+Math.random()*.90);
    if(times.every(x=>Math.abs(x-t)>=minGapSec)) times.push(t);
  }
  while(times.length<count){
    let t=total*(.05+Math.random()*.90);
    let guard=0;
    while(times.some(x=>Math.abs(x-t)<Math.max(20,minGapSec*.35)) && guard++<300){
      t=total*(.05+Math.random()*.90);
    }
    times.push(t);
  }
  times.sort((a,b)=>a-b);

  let balanced=shuffled(selected);

  // v0.0245: each equipment-dependent event may occur at most once per race.
  // We still guarantee at least one equipment event, but do not repeat the same
  // injury/rain/heat/night event several times.
  const equipmentNames=['Поранился','Дождь','Жара','Ночь'];
  const seenEquipment=new Set();
  balanced=balanced.map(ev=>{
    if(!equipmentNames.includes(ev?.[1])) return ev;
    if(!seenEquipment.has(ev[1])){
      seenEquipment.add(ev[1]);
      return ev;
    }
    const replacementPool=shuffled(events.filter(x=>
      x!==misha &&
      !equipmentNames.includes(x?.[1]) &&
      !balanced.includes(x)
    ));
    return replacementPool[0] || shuffled(events.filter(x=>x!==misha && !equipmentNames.includes(x?.[1])))[0] || ev;
  });

  // v0.0245: Night/Heat depend on the same virtual time that controls the sky.
  // If a selected Night/Heat event has no compatible time slot, replace it
  // with another ordinary event instead of showing it against the wrong sky.
  const used=new Set();
  const scheduleDraft=[];
  for(const ev of balanced){
    let compatible=times
      .map((t,i)=>({t,i,p:t/total}))
      .filter(x=>!used.has(x.i) && eventAllowedAtProgress(ev,x.p));

    if(!compatible.length){
      const fallbackPool=shuffled(events.filter(x=>
        x!==misha &&
        x[1]!=='Ночь' &&
        x[1]!=='Жара'
      ));
      const replacement=fallbackPool.find(x=>
        times.some((t,i)=>!used.has(i) && eventAllowedAtProgress(x,t/total))
      );
      if(replacement) ev.splice(0,ev.length,...replacement);
      compatible=times.map((t,i)=>({t,i,p:t/total})).filter(x=>!used.has(x.i));
    }

    const slot=compatible[Math.floor(Math.random()*compatible.length)];
    used.add(slot.i);
    scheduleDraft.push({at:slot.p,e:ev});
  }

  // Guarantee at least one equipment-related event that is valid for its time.
  if(!scheduleDraft.some(x=>equipmentNames.includes(x.e?.[1]))){
    const candidates=[];
    for(const eventName of equipmentNames){
      const ev=events.find(x=>x[1]===eventName);
      if(!ev) continue;
      for(let i=0;i<times.length;i++){
        const p=times[i]/total;
        if(eventAllowedAtProgress(ev,p)) candidates.push({ev,p});
      }
    }
    // Injury/Rain are always valid, so this should always have options.
    if(candidates.length){
      const chosen=candidates[Math.floor(Math.random()*candidates.length)];
      const idx=Math.floor(Math.random()*scheduleDraft.length);
      scheduleDraft[idx]={at:scheduleDraft[idx].at,e:chosen.ev};
    }
  }

  // Final repair for Night/Heat if a later replacement/guarantee ever conflicts.
  for(let i=0;i<scheduleDraft.length;i++){
    const item=scheduleDraft[i];
    if(!eventAllowedAtProgress(item.e,item.at)){
      const validEquipmentFallback=events.find(x=>x[1]==='Дождь') || events.find(x=>x[1]==='Поранился');
      item.e=validEquipmentFallback || item.e;
    }
  }

  // v0.0245: positional rules for specific events.
  for(const item of scheduleDraft){
    if(item.e?.[1]==='Слишком быстро на старте' && item.at>=0.5){
      item.at=0.06+Math.random()*0.42; // only first half of the track
    }

    if(item.e?.[1]==='Очередь за водой'){
      const d=Math.max(0.1,dist());
      if(aidStations.length){
        // Queue can happen only exactly at one of this race's aid stations.
        const ppKm=aidStations[Math.floor(Math.random()*aidStations.length)];
        item.at=Math.max(0.01,Math.min(0.99,ppKm/d));
      }else{
        // No aid station => this event cannot happen; replace with another ordinary event.
        const fallback=shuffled(events.filter(x=>x[1]!=='Очередь за водой'))[0];
        if(fallback) item.e=fallback;
      }
    }
  }

  schedule=scheduleDraft.sort((a,b)=>a.at-b.at);
}
function firstTrackDate(){
  const p=simTrackPoints().find(x=>x?.time);
  if(p?.time){const d=new Date(p.time);if(!Number.isNaN(d.getTime()))return d}
  const d=new Date();d.setHours(6,0,0,0);return d;
}
function interpElevation(km){
  const pts=simTrackPoints().filter(p=>Number.isFinite(p.km)&&Number.isFinite(p.ele));
  if(!pts.length)return 0;if(km<=pts[0].km)return pts[0].ele;
  for(let i=1;i<pts.length;i++){if(pts[i].km>=km){const a=pts[i-1],b=pts[i],r=(km-a.km)/Math.max(.0001,b.km-a.km);return a.ele+(b.ele-a.ele)*r}}
  return pts.at(-1).ele;
}
function simClockSec(){return baseSec()*progress+penalty}
function fordState(km){
  const ma=simMapAnalysis();
  const confirmed=(ma.confirmedFordKms||[]).map(Number).filter(Number.isFinite);
  const likely=(ma.likelyFordKms||[]).map(Number).filter(Number.isFinite);
  const grouped=(ma.fordKms||[]).map(Number).filter(Number.isFinite);
  const all=[...new Set([...confirmed,...likely,...grouped])];
  if(!all.length) return {active:false,nearest:null,confirmed:false};
  let nearest=all[0];
  for(const x of all) if(Math.abs(x-km)<Math.abs(nearest-km)) nearest=x;
  return {
    active:Math.abs(nearest-km)<=0.22,
    nearest,
    confirmed:confirmed.some(x=>Math.abs(x-nearest)<=0.12)
  };
}
function skyInfo(){
  const d=new Date(simStartDate.getTime()+simClockSec()*1000);const h=d.getHours()+d.getMinutes()/60;
  const sunrise=6,sunset=18.5;let day=0,sunT=0;
  if(h>=sunrise&&h<=sunset){day=1;sunT=(h-sunrise)/(sunset-sunrise)}
  const twilight=(h>=5&&h<6)||(h>18.5&&h<=19.5);
  return {d,h,day,twilight,sunT};
}
function skyInfoAtProgress(p){
  const sec=Math.max(0,baseSec()*Math.max(0,Math.min(1,p)));
  const d=new Date(simStartDate.getTime()+sec*1000);
  const h=d.getHours()+d.getMinutes()/60;
  const sunrise=6,sunset=18.5;
  const day=(h>=sunrise&&h<=sunset);
  const twilight=(h>=5&&h<6)||(h>18.5&&h<=19.5);
  return {d,h,day,twilight};
}
function eventAllowedAtProgress(e,p){
  if(!e) return false;
  const info=skyInfoAtProgress(p);

  // «Слишком быстро на старте» — только в первой половине дистанции.
  if(e[1]==='Слишком быстро на старте'){
    return p < 0.5;
  }

  // «Очередь за водой» привязана отдельно к фактическому ПП в makeSchedule().
  // Здесь не ограничиваем, чтобы событие можно было выбрать в пул.
  if(e[1]==='Очередь за водой'){
    return true;
  }

  if(e[1]==='Ночь'){
    // Only when the visual simulator is in night mode.
    return !info.day && !info.twilight;
  }
  if(e[1]==='Жара'){
    // Heat only during daytime, and preferably away from sunrise/sunset.
    return info.day && info.h>=9 && info.h<=17.5;
  }
  return true;
}

function addParticles(icon){
  const n=3+Math.floor(Math.random()*5);
  for(let i=0;i<n;i++)particles.push({icon,life:1,x:0,y:0,vx:(Math.random()-.5)*2.5,vy:-1.2-Math.random()*2.1,rot:(Math.random()-.5)*.25,size:20+Math.random()*11});
}
function fire(idx){
  let {at,e}=schedule[idx];
  fired.add(idx);

  // Safety check: visual sky and time-dependent events must agree.
  if(!eventAllowedAtProgress(e,at)){
    const fallback=events.find(x=>x[1]==='Дождь') || events.find(x=>x[1]==='Поранился');
    if(fallback){
      e=fallback;
      schedule[idx].e=e;
    }
  }
  let timeAdjustmentSec=Number(e[3])||0;
  if(e[1]==='Поранился'){
    if(equipmentState.medkit){
      timeAdjustmentSec=0;
      e[2]='Есть аптечка — травму обработали сразу, время не потеряно.';
    }else{
      timeAdjustmentSec=300;
      e[2]='Аптечки нет — потеряно 5 минут на решение проблемы.';
    }
  }
  if(e[1]==='Дождь'){
    if(equipmentState.membrane){
      timeAdjustmentSec=0;
      e[2]='Мембранка есть — дождь не дал штрафа по времени.';
    }else{
      timeAdjustmentSec=300;
      e[2]='Мембранки нет — дождь добавил 5 минут.';
    }
  }
  if(e[1]==='Жара'){
    if(equipmentState.water){
      timeAdjustmentSec=0;
      e[2]='Вода есть — жару прошли без штрафа.';
    }else{
      timeAdjustmentSec=300;
      e[2]='Воды нет — жара добавила 5 минут.';
    }
  }
  if(e[1]==='Ночь'){
    if(equipmentState.flashlight){
      timeAdjustmentSec=0;
      e[2]='Фонарик есть — ночь не замедлила гонку.';
    }else{
      timeAdjustmentSec=300;
      e[2]='Фонарика нет — в темноте потеряно 5 минут.';
    }
  }
  // v0.0245: equipment events always show the actual equipment result in the popup.
  // A zero adjustment is intentional when the required item is present.
  if(e[1]==='Нашли аптечку'){
    equipmentState.medkit=true;
    timeAdjustmentSec=0;
    e[2]='Аптечка найдена — теперь она есть до конца этой гонки.';
    renderEquipmentState();
  }
  if(e[1]==='Нашли фонарик'){
    equipmentState.flashlight=true;
    timeAdjustmentSec=0;
    e[2]='Фонарик найден — теперь он есть до конца этой гонки.';
    renderEquipmentState();
  }
  if(e[1]==='Дождь'){
    if(equipmentState.membrane){
      timeAdjustmentSec=0;
      e[2]='Мембранка есть — дождь не добавил времени.';
    }else{
      timeAdjustmentSec=300;
      e[2]='Мембранки нет — +5 минут к финишному времени.';
    }
  }
  if(e[1]==='Жара'){
    if(equipmentState.water){
      timeAdjustmentSec=0;
      e[2]='Вода есть — жара не добавила времени.';
    }else{
      timeAdjustmentSec=300;
      e[2]='Воды нет — +5 минут к финишному времени.';
    }
  }

  // v0.0245: explicit equipment result message for ALL equipment-dependent events.
  let equipmentOutcomeText='';
  if(e[1]==='Поранился'){
    equipmentOutcomeText = equipmentState.medkit
      ? '🩸 Поранился → аптечка есть → травма обработана → штраф 0:00'
      : '🩸 Поранился → аптечки нет → штраф +5:00';
  }else if(e[1]==='Дождь'){
    equipmentOutcomeText = equipmentState.membrane
      ? '🌧️ Дождь → мембранка есть → штраф 0:00'
      : '🌧️ Дождь → мембранки нет → штраф +5:00';
  }else if(e[1]==='Жара'){
    equipmentOutcomeText = equipmentState.water
      ? '☀️ Жара → вода есть → штраф 0:00'
      : '☀️ Жара → воды нет → штраф +5:00';
  }else if(e[1]==='Ночь'){
    equipmentOutcomeText = equipmentState.flashlight
      ? '🌙 Ночь → фонарик есть → штраф 0:00'
      : '🌙 Ночь → фонарика нет → штраф +5:00';
  }else if(e[1]==='Нашли аптечку'){
    equipmentOutcomeText = '🩹 Нашли аптечку → аптечка добавлена в экипировку → штраф 0:00';
  }else if(e[1]==='Нашли фонарик'){
    equipmentOutcomeText = '🔦 Нашли фонарик → фонарик добавлен в экипировку → штраф 0:00';
  }

  // Event sign convention:
  // positive event -> negative adjustment -> time is SUBTRACTED;
  // negative event -> positive adjustment -> time is ADDED.
  // v0.0245: случайное событие меняет ТОЛЬКО время текущей симуляции.
  // Исходный прогноз raceForecast не изменяется.
  penalty+=timeAdjustmentSec;
  randomEventAdjustmentSec+=timeAdjustmentSec;
  addParticles(e[0]);
  if(timeAdjustmentSec>0)negativeEventCount++;
  if(demotivationActive&&negativeEventCount>=3){
    const km=(at*dist()).toFixed(1),row=document.createElement('div');row.className='current';
    row.innerHTML=`<span>${km} км</span><span>😞 Три отрицательных события</span><b class="plus">DNF</b>`;
    E('simLog').prepend(row);endSimulationDNF();return;
  }
  if(e[1]==='Встреча с Мишей с топором'){
    const m=document.getElementById('mishaStartSendoff');
    if(m){
      const b=m.querySelector('b'), s=m.querySelector('span');
      if(b) b.textContent='🐻 Встреча с Мишей с топором!';
      if(s) s.textContent='Миша ускорил тебя: −5:00 🪓';
      m.classList.add('show');
      setTimeout(()=>m.classList.remove('show'),3000);
    }
  }
  E('simEventTitle').textContent=e[0]+' '+e[1];
  E('simEventText').textContent=equipmentOutcomeText || e[2];
  E('simEventDelta').textContent=delta(timeAdjustmentSec);
    const chip=E('simEventChip');
    if(chip){
      E('simEventChipIcon').textContent=e[0];
      E('simEventChipTitle').textContent=equipmentOutcomeText || e[1];
      E('simEventChipDelta').textContent=delta(timeAdjustmentSec);
      chip.classList.add('show');
      const chipPauseSeconds=['Поранился','Дождь','Жара','Ночь'].includes(e[1]) ? 6 : 3;
      setTimeout(()=>chip.classList.remove('show'),chipPauseSeconds*1000);
    }
  E('simEventDelta').className=timeAdjustmentSec<0?'positive':(timeAdjustmentSec>0?'negative':'neutral');E('simEventCard').classList.add('show');E('simPauseBadge').classList.add('show');

  // v0.0245: mandatory equipment-dependent events stay on screen 3 seconds longer.
  // Normal event = 3 sec; injury/rain/heat/night = 6 sec.
  const mandatoryEquipmentEventNames=['Поранился','Дождь','Жара','Ночь'];
  const eventPauseSeconds=mandatoryEquipmentEventNames.includes(e[1]) ? 6 : 3;

  let left=eventPauseSeconds;E('simPauseCountdown').textContent=left;
  const km=(at*dist()).toFixed(1);const row=document.createElement('div');row.className='current';
  row.innerHTML=`<span>${km} км</span><span>${equipmentOutcomeText || (e[0]+' '+e[1])}</span><b class="${timeAdjustmentSec<0?'minus':(timeAdjustmentSec>0?'plus':'zero')}">${delta(timeAdjustmentSec)}</b>`;E('simLog').prepend(row);
  E('simEventsCount').textContent=`${fired.size} / ${schedule.length}`;E('simPenalty').textContent=delta(penalty);updateResults();
  clearInterval(timer);timer=null;clearInterval(countTimer);countTimer=setInterval(()=>{left--;E('simPauseCountdown').textContent=Math.max(0,left);if(left<=0)clearInterval(countTimer)},1000);
  pauseTimer=setTimeout(()=>{E('simEventCard')?.classList.remove('show'); E('simEventChip')?.classList.remove('show');E('simPauseBadge').classList.remove('show');if(!simulationDNF){E('simStatus').textContent='Гонка продолжается';run()}},eventPauseSeconds*1000);
}
function draw(){
  const c=E('simCourseCanvas');if(!c)return;
  const r=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1,W=Math.max(320,r.width),H=Math.max(420,r.height||460);
  if(c.width!==Math.round(W*dpr)||c.height!==Math.round(H*dpr)){c.width=Math.round(W*dpr);c.height=Math.round(H*dpr)}
  const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);

  const sky=skyInfo();
  let top='#07111f',bottom='#102a43';
  if(sky.day){top='#123c62';bottom='#d97706'}
  else if(sky.twilight){top='#14213d';bottom='#9a3412'}
  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,top);grad.addColorStop(.55,bottom);grad.addColorStop(1,'#07111f');
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);

  if(!sky.day){
    ctx.fillStyle='rgba(255,255,255,.72)';
    for(let i=0;i<34;i++){
      const sx=(i*83%997)/997*W,sy=15+((i*137)%211)/211*H*.34;
      ctx.fillRect(sx,sy,1.3,1.3);
    }
  }

  // Sun / moon travels through the race according to virtual race time.
  const sunX=sky.day?30+sky.sunT*(W-60):W-45;
  const sunY=sky.day?(88-Math.sin(Math.PI*sky.sunT)*60):42;
  ctx.font='29px system-ui, Apple Color Emoji';ctx.textAlign='center';
  ctx.fillText(sky.day?'☀️':'🌙',sunX,sunY);
  ctx.strokeStyle='rgba(255,255,255,.24)';ctx.setLineDash([3,5]);ctx.beginPath();
  for(let sx=30;sx<W-30;sx+=8){
    const t=(sx-30)/(W-60),sy=88-Math.sin(Math.PI*t)*60;
    if(sx===30)ctx.moveTo(sx,sy);else ctx.lineTo(sx,sy);
  }
  ctx.stroke();ctx.setLineDash([]);

  const pts=simTrackPoints().filter(p=>Number.isFinite(p.km)&&Number.isFinite(p.ele));
  const L=42,R=16,T=104;
  const profileBottom=Math.round(H*.58);
  let minE=0,maxE=1;
  if(pts.length){
    minE=Math.min(...pts.map(p=>p.ele));maxE=Math.max(...pts.map(p=>p.ele));
    if(maxE-minE<1)maxE=minE+1;
  }
  const xOf=km=>L+(km/Math.max(.1,dist()))*(W-L-R);
  const yOf=ele=>profileBottom-((ele-minE)/(maxE-minE))*(profileBottom-T);

  // Upper chart: real GPX elevation profile.
  if(pts.length){
    ctx.beginPath();
    pts.forEach((p,i)=>{const px=xOf(p.km),py=yOf(p.ele);i?ctx.lineTo(px,py):ctx.moveTo(px,py)});
    ctx.lineTo(xOf(dist()),profileBottom);ctx.lineTo(L,profileBottom);ctx.closePath();
    ctx.fillStyle='rgba(22,163,74,.30)';ctx.fill();

    ctx.beginPath();
    pts.forEach((p,i)=>{const px=xOf(p.km),py=yOf(p.ele);i?ctx.lineTo(px,py):ctx.moveTo(px,py)});
    ctx.strokeStyle='#22c55e';ctx.lineWidth=3;ctx.stroke();
  }

  ctx.fillStyle='rgba(226,232,240,.82)';ctx.font='11px system-ui';ctx.textAlign='left';
  ctx.fillText(`${Math.round(maxE)} м`,6,T+4);ctx.fillText(`${Math.round(minE)} м`,6,profileBottom);
  ctx.textAlign='center';
  for(let i=0;i<=4;i++){
    const k=dist()*i/4;ctx.fillText(`${k.toFixed(k<10?1:0)} км`,xOf(k),profileBottom+20);
  }

  if(aidStations.length){
    ctx.font='16px system-ui, Apple Color Emoji';ctx.textAlign='center';
    aidStations.forEach(ak=>ctx.fillText('🍊',xOf(ak),Math.max(T+14,yOf(interpElevation(ak))-10)));
  }
  // White marker shows where the runner currently is on the profile.
  const km=dist()*progress,x=xOf(km),ele=interpElevation(km),y=yOf(ele);
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,T-5);ctx.lineTo(x,profileBottom+2);ctx.stroke();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();

  // Lower scene: runner stays on the trail, separate from the graph.
  const sceneTop=profileBottom+28;
  const groundY=H-46;
  const hillGrad=ctx.createLinearGradient(0,sceneTop,0,groundY);
  hillGrad.addColorStop(0,'rgba(15,40,35,.18)');hillGrad.addColorStop(1,'rgba(30,55,35,.75)');
  ctx.fillStyle=hillGrad;ctx.fillRect(0,sceneTop,W,groundY-sceneTop);

  // distant mountain silhouettes
  ctx.fillStyle='rgba(9,25,38,.75)';ctx.beginPath();ctx.moveTo(0,groundY-48);
  const peaks=[0,.13,.25,.39,.52,.68,.82,1];
  const heights=[20,58,35,75,42,66,32,54];
  peaks.forEach((p,i)=>ctx.lineTo(p*W,groundY-heights[i]));ctx.lineTo(W,groundY);ctx.lineTo(0,groundY);ctx.fill();

  // rocky trail
  ctx.fillStyle='#55483b';ctx.fillRect(0,groundY-18,W,64);
  ctx.fillStyle='rgba(148,163,184,.35)';
  for(let i=0;i<18;i++){const px=(i*71)%W,py=groundY-10+((i*29)%34);ctx.beginPath();ctx.ellipse(px,py,4+(i%4),2+(i%3),0,0,Math.PI*2);ctx.fill()}

  // v0.67: animated water appears when the simulated runner reaches a detected ford.
  const ford=fordState(km);
  if(ford.active){
    const pulse=(Math.sin(Date.now()/180)+1)/2;
    const waterY=groundY+4;
    const waterGrad=ctx.createLinearGradient(0,waterY-18,0,waterY+42);
    waterGrad.addColorStop(0,'rgba(56,189,248,.58)');
    waterGrad.addColorStop(1,'rgba(2,132,199,.88)');
    ctx.fillStyle=waterGrad;
    ctx.beginPath();
    ctx.ellipse(W*.52,waterY+10,W*.47,31+pulse*5,0,0,Math.PI*2);
    ctx.fill();

    const runnerWaterX=55+progress*Math.max(40,W-135);
    ctx.strokeStyle='rgba(224,242,254,.78)';
    ctx.lineWidth=2;
    for(let i=0;i<5;i++){
      const rr=20+i*24+((Date.now()/45+i*13)%22);
      ctx.beginPath();
      ctx.ellipse(runnerWaterX,waterY+5,rr,6+rr*.10,0,0,Math.PI*2);
      ctx.stroke();
    }
    ctx.fillStyle='rgba(14,165,233,.22)';
    ctx.fillRect(0,groundY-7,W,53);
    ctx.font='15px system-ui, Apple Color Emoji';
    ctx.textAlign='left';ctx.fillStyle='#e0f2fe';
    ctx.fillText(`${ford.confirmed?'🌊 Подтверждённый брод':'💦 Вероятный брод'} · ${ford.nearest.toFixed(1)} км`,16,sceneTop+22);
  }

  // Runner moves subtly across the lower scene, always facing right.
  const rx=55+progress*Math.max(40,W-135);
  const bob=Math.sin(progress*180)*2.5;
  const ry=groundY-24+bob;
  ctx.save();ctx.translate(rx,ry);
  ctx.lineCap='round';
  // legs
  const phase=Math.sin(progress*220);
  ctx.strokeStyle='#e5e7eb';ctx.lineWidth=4;ctx.beginPath();
  ctx.moveTo(0,-5);ctx.lineTo(12+phase*5,18);ctx.moveTo(0,-5);ctx.lineTo(-10-phase*5,18);ctx.stroke();
  // torso leaning forward
  ctx.strokeStyle='#f59e0b';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-2,-31);ctx.lineTo(4,-6);ctx.stroke();
  // head
  ctx.fillStyle='#f1c27d';ctx.beginPath();ctx.arc(2,-40,8,0,Math.PI*2);ctx.fill();
  // cap pointing right
  ctx.fillStyle='#3b82f6';ctx.beginPath();ctx.arc(0,-45,7,Math.PI,0);ctx.fill();ctx.fillRect(3,-45,10,3);
  // arms + poles
  ctx.strokeStyle='#f1c27d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-27);ctx.lineTo(15,-17);ctx.moveTo(0,-25);ctx.lineTo(-12,-14);ctx.stroke();
  ctx.strokeStyle='#cbd5e1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(15,-17);ctx.lineTo(28,23);ctx.moveTo(-12,-14);ctx.lineTo(-22,24);ctx.stroke();
  // backpack / vest
  ctx.fillStyle='#ef4444';ctx.beginPath();ctx.roundRect(-13,-34,11,22,4);ctx.fill();
  ctx.font='18px system-ui, Apple Color Emoji';ctx.textAlign='center';ctx.fillText('🎒',-10,-18);

  if(ford.active){
    const splashPhase=Date.now()/120;
    ctx.font='22px system-ui, Apple Color Emoji';ctx.textAlign='center';
    ctx.fillText('💦',-18+Math.sin(splashPhase)*7,10);
    ctx.fillText('💧',18+Math.cos(splashPhase*.9)*8,5);
  }
  if(E('simPauseBadge').classList.contains('show')){
    ctx.font='30px system-ui, Apple Color Emoji';ctx.fillText('😲',3,-68);
  }
  ctx.restore();

  // Event emojis fly out from the runner in the lower scene.
  ctx.textAlign='center';
  particles.forEach(p=>{
    if(p.x===0&&p.y===0){p.x=rx+8;p.y=ry-48}
    p.x+=p.vx;p.y+=p.vy;p.vy+=.035;p.life-=.024;
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.font=`${p.size}px system-ui, Apple Color Emoji`;
    ctx.fillText(p.icon,p.x,p.y);
  });
  ctx.globalAlpha=1;
  particles=particles.filter(p=>p.life>0);
}
function updateResults(){
  const b=baseSec();
  const cur=Math.max(0,b*progress+penalty);
  const finish=Math.max(0,b+penalty);

  const baseMain=E('simBaseTimeMain');
  if(baseMain) baseMain.textContent=b?fmt(b):'—';

  const progressTime=E('simProgressTime');
  if(progressTime) progressTime.textContent=b?`Текущее время: ${fmt(cur)}`:'Текущее время: —';

  // Backward compatibility for any old cached markup that still has these IDs.
  const oldBase=E('simBaseTime');
  if(oldBase) oldBase.textContent=b?fmt(b):'—';
  const oldTime=E('simTime');
  if(oldTime) oldTime.textContent=b?fmt(cur):'—';

  E('simResultBase').textContent=b?fmt(b):'—';
  E('simResultDelta').textContent=delta(penalty);
  E('simResultFinish').textContent=b?fmt(finish):'—';

  const penaltyEl=E('simPenalty');
  if(penaltyEl) penaltyEl.textContent='Поправка: '+delta(penalty);

  const mirror=E('simResultFinishMirror');
  if(mirror) mirror.textContent=b?fmt(finish):'—';

  E('simResultProgress').textContent=Math.round(progress*100)+'%';

  const pace=dist()>0&&b>0?b/dist():0;
  const pm=Math.floor(pace/60),ps=Math.round(pace%60);
  const av=E('simAvgPace');
  if(av) av.textContent=pace?`${pm}:${String(ps).padStart(2,'0')} /км`:'—';
}

function maybePauseForFord(km){
  const fs=fordState(km);
  if(!fs.active || fs.nearest==null) return false;

  // Don't pause repeatedly while runner remains inside the same crossing zone.
  if(lastFordPauseKm!==null && Math.abs(lastFordPauseKm-fs.nearest)<0.18) return false;

  lastFordPauseKm=fs.nearest;
  fordPauseActive=true;

  clearInterval(timer);
  timer=null;

  E('simStatus').textContent=`💦 Брод ${fs.nearest.toFixed(1)} км — переход через воду`;
  E('simPauseBadge').classList.add('show');
  let left=3;
  E('simPauseCountdown').textContent=left;

  clearInterval(countTimer);
  countTimer=setInterval(()=>{
    left--;
    E('simPauseCountdown').textContent=Math.max(0,left);
    draw();
    if(left<=0) clearInterval(countTimer);
  },1000);

  // Water animation keeps rendering during the pause.
  const waterAnim=setInterval(draw,120);

  clearTimeout(pauseTimer);
  pauseTimer=setTimeout(()=>{
    clearInterval(waterAnim);
    fordPauseActive=false;
    E('simPauseBadge').classList.remove('show');
    E('simStatus').textContent='Брод пройден. Гонка продолжается.';
    run();
  },3000);

  return true;
}

function tick(){
  const b=baseSec();if(!b||!dist()){stop('Сначала загрузите GPX и рассчитайте прогноз гонки.');return}
  const speed=+E('simSpeed').value||1;const realDuration=Math.max(28000,Math.min(75000,28000+dist()*450));progress=Math.min(1,progress+(120/realDuration)*speed);E('simProgress').style.width=(progress*100)+'%';E('simDistance').textContent=`${(progress*dist()).toFixed(1)} / ${dist().toFixed(1)} км`;checkAidStation(progress*dist());updateResults();draw();

  // Ford is a route event, not a random event: stop for exactly 3 seconds.
  if(maybePauseForFord(progress*dist())) return;

  const idx=schedule.findIndex((x,i)=>!fired.has(i)&&progress>=x.at);if(idx>=0){fire(idx);return}
  if(progress>=1){
    clearInterval(timer);timer=null;
    E('simStart').textContent='↻';
    E('simStart').setAttribute('aria-label','Запустить снова');
    E('simStart').title='Запустить снова';
    E('simStatus').textContent=`🏁 Финишное время: ${fmt(baseSec()+penalty)} · исходный прогноз ${fmt(baseSec())} · поправка ${delta(penalty)}`;
    updateResults();draw();renderSimFordMap();
    showMishaFinishDirect();
    const firstPlace=maybeShowFirstPlaceAtFinish();

    // v0.0259: if the runner takes 1st place, do not immediately advance
    // the championship screen. Let the 1st-place message be visible first.
    if(firstPlace){
      setTimeout(()=>finishVirtualAttempt(true),8100); // 3.1 s delay + 5 s display
    }else{
      finishVirtualAttempt(false);
    }
  }
}
function run(){clearInterval(timer);timer=setInterval(tick,120);E('simStart').textContent='⏸';E('simStatus').textContent=simulationTrackMode==='virtual'?`Виртуальный чемпионат · уровень ${virtualCampaign.level}/3 · ${dist().toFixed(0)} км.`:'Симуляция идёт по выбранному реальному треку.'}
function stop(msg){clearInterval(timer);clearTimeout(pauseTimer);clearInterval(countTimer);timer=null;if(msg)E('simStatus').textContent=msg;E('simStart').textContent='▶'}
function reset(){
  const abandoningVirtualAttempt=(simulationTrackMode==='virtual' && virtualCampaign.attemptActive && progress>0 && progress<1);
  clearTimeout(window.__simStartGateTimer);stop();hideFirstPlaceOverlay();
  if(abandoningVirtualAttempt){
    virtualCampaign.attemptActive=false;
    renderVirtualCampaign();
  }
  equipmentState.checked=false;
  equipmentState.medkit=true;
  equipmentState.water=true;
  equipmentState.membrane=true;
  equipmentState.flashlight=true;
  const equipmentBtn=E('equipmentCheckBtn');
  if(equipmentBtn){equipmentBtn.disabled=false;equipmentBtn.textContent='Проверить';}
  const equipmentSummary=E('equipmentCheckSummary');
  if(equipmentSummary) equipmentSummary.textContent='Перед каждой новой гонкой нажмите «Проверить».';
  renderEquipmentState();progress=0;penalty=0;randomEventAdjustmentSec=0;fired.clear();particles=[];lastFordPauseKm=null;fordPauseActive=false;fatigueStartVirtualSec=0;fatiguePenaltyAppliedSec=0;simStartDate=firstTrackDate();E('simDnfBanner')?.classList.remove('show');chooseAidStations();initStartConditions();makeSchedule();E('simProgress').style.width='0';E('simDistance').textContent=dist()?`0.0 / ${dist().toFixed(1)} км`:'—';E('simGain').textContent=gain()?`${Math.round(gain())} м`:'—';E('simEventsCount').textContent=`0 / ${schedule.length}`;E('simPenalty').textContent='+0:00';E('simLog').innerHTML='<div><span>—</span><span>События появятся случайно по ходу гонки</span><b>31 событие в пуле</b></div>';E('simEventCard')?.classList.remove('show'); E('simEventChip')?.classList.remove('show');E('simPauseBadge').classList.remove('show');E('simStart').textContent='▶';E('simStart').setAttribute('aria-label','Старт');E('simStart').title='Старт';E('simStart').disabled=!(baseSec()&&dist());updateResults();E('simStatus').textContent=baseSec()&&dist()
    ? (simulationTrackMode==='virtual'
        ? `Готово: виртуальный уровень ${virtualCampaign.level}/3 · ${dist().toFixed(0)} км.`
        : 'Готово: выбран реальный загруженный трек.')
    : 'Выберите «Симуляция трека 20 км» или «Симуляция реального трека».';
  draw()}

setInterval(()=>{
  const b=E('simStart');
  if(!b||timer) return;
  if(window.__simStartGateTimer){
    b.disabled=true;
  }else{
    b.disabled=!(baseSec()&&dist());
  }
},500);
setInterval(()=>{if(document.querySelector('[data-tab="simulation"]')?.classList.contains('active')) draw();},120);
E('simStart').addEventListener('click',()=>{
  // v0.0245: completed race = a NEW race.
  // Reset first, so the old equipment check can never carry over.
  if(progress>=1) reset();

  const startingFresh=(progress<=0);

  // v0.0245: every fresh run starts with a clean finish-time adjustment.
  // Do not carry penalties/bonuses from the previous run into the new race.
  if(startingFresh){
    penalty=0;
    randomEventAdjustmentSec=0;
    negativeEventCount=0;
    simulationDNF=false;
    fired.clear();
    E('simPenalty').textContent='+0:00';
    updateResults();
  }

  if(startingFresh && !equipmentState.checked){
    const msg='⚠️ Перед каждой гонкой пройдите проверку экипировки.';
    E('simStatus').textContent=msg;
    const summary=E('equipmentCheckSummary');
    if(summary) summary.textContent=msg;
    E('equipmentCheckBtn')?.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }

  if(startingFresh && simulationTrackMode==='virtual' && !beginVirtualAttempt()){
    return;
  }

  if(!baseSec()||!dist()){reset();return}

  if(timer){
    clearInterval(timer);
    timer=null;
    E('simStart').textContent='▶';
    E('simStart').setAttribute('aria-label','Продолжить');
    E('simStart').title='Продолжить';
    E('simStatus').textContent='Пауза';
    return;
  }

  // v0.0245: start animation is always a real 3-second start gate.
  // Simulation speed (including 4×) cannot skip or outrun Misha.
  if(startingFresh){
    showMishaStartDirect();
    E('simStart').disabled=true;
    E('simStatus').textContent='🐻 Миша с топором провожает тебя со старта…';
    clearTimeout(window.__simStartGateTimer);
    window.__simStartGateTimer=setTimeout(()=>{
      window.__simStartGateTimer=null;
      if(progress<=0 && !timer && baseSec() && dist()){
        E('simStart').disabled=false;
        run();
        E('simStart').setAttribute('aria-label','Пауза');
        E('simStart').title='Пауза';
      }
    },3000);
  }else{
    run();
    E('simStart').setAttribute('aria-label','Пауза');
    E('simStart').title='Пауза';
  }
});

E('equipmentCheckBtn')?.addEventListener('click',checkEquipmentRandom);
E('equipmentCheckClose')?.addEventListener('click',closeEquipmentModal);
E('equipmentCheckOk')?.addEventListener('click',closeEquipmentModal);
E('equipmentCheckModal')?.addEventListener('click',(ev)=>{
  if(ev.target===E('equipmentCheckModal')) closeEquipmentModal();
});
renderEquipmentState();
E('simVirtual20Btn')?.addEventListener('click',activateVirtualSimulationTrack);
E('simRealTrackBtn')?.addEventListener('click',activateRealSimulationTrack);
E('virtualCampaignRestart')?.addEventListener('click',restartVirtualCampaign);
E('virtualChampionOverlay')?.addEventListener('click',()=>E('virtualChampionOverlay')?.classList.remove('show'));
E('simReset').addEventListener('click',reset);E('simSpeed').addEventListener('change',draw);window.addEventListener('resize',draw);
// Keep simulation synced when user switches to tab 5 or recalculates forecast.
document.querySelector('[data-tab="simulation"]')?.addEventListener('click',()=>setTimeout(reset,0));
reset();
})();;

window.addEventListener('resize',()=>{
  try{ if(fordLeafletMap) fordLeafletMap.invalidateSize(); }catch(e){}
});
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(btn.dataset.tab==='route'){
      setTimeout(()=>{try{if(fordLeafletMap)fordLeafletMap.invalidateSize()}catch(e){}},150);
    }
  });
});


function mapAnalysisTimeoutMessage(){
  return '⏳ Анализ карты выполняется до полного завершения.';
}

function ensureAnalysisTrackScheme(){
  const results=document.getElementById('mapAnalysisResults');
  if(!results) return null;
  let layout=results.querySelector('.ford-map-layout');
  if(!layout) return null;
  let panel=layout.querySelector('.ford-map-panel');
  if(!panel){
    panel=document.createElement('div');
    panel.className='ford-map-panel';
    layout.appendChild(panel);
  }
  let title=panel.querySelector('.ford-map-title');
  if(!title){
    title=document.createElement('div');
    title.className='ford-map-title';
    title.textContent='Схема трека и броды';
    panel.prepend(title);
  }
  let canvas=panel.querySelector('#fordSchemeCanvas');
  if(!canvas){
    canvas=document.createElement('canvas');
    canvas.id='fordSchemeCanvas';
    canvas.className='ford-scheme-canvas';
    panel.appendChild(canvas);
  }
  canvas.style.display='block';
  canvas.style.width='100%';
  canvas.style.height='350px';
  return canvas;
}

function drawFordScheme(){
  const c=ensureAnalysisTrackScheme() || document.getElementById('fordSchemeCanvas');
  if(!c) return;

  const cssW=Math.max(220,c.clientWidth||320);
  const cssH=Math.max(260,c.clientHeight||350);
  const dpr=Math.min(2,window.devicePixelRatio||1);
  c.width=Math.round(cssW*dpr);
  c.height=Math.round(cssH*dpr);

  const x=c.getContext('2d');
  x.setTransform(dpr,0,0,dpr,0,0);
  x.clearRect(0,0,cssW,cssH);
  x.fillStyle='#081321';
  x.fillRect(0,0,cssW,cssH);

  // Actual parsed GPX lives in state.track.
  const pts=(state?.track||[]).filter(p=>
    Number.isFinite(Number(p.lat)) &&
    Number.isFinite(Number(p.lon)) &&
    Number.isFinite(Number(p.km))
  );

  const ma=state?.mapAnalysis||{};
  const confirmed=(ma.confirmedFordKms||[]).map(Number).filter(Number.isFinite);
  const likely=(ma.likelyFordKms||[]).map(Number).filter(Number.isFinite);
  const combined=(ma.fordKms||[]).map(Number).filter(Number.isFinite);
  const bridges=(ma.bridgeKms||[]).map(Number).filter(Number.isFinite);
  const total=Math.max(.001,Number(state?.dist||0),...(pts.map(p=>Number(p.km)||0)));

  if(pts.length<2){
    x.fillStyle='#94a3b8';
    x.font='14px system-ui';
    x.textAlign='center';
    x.fillText('Нет координат GPX для схемы',cssW/2,cssH/2);
    return;
  }

  const minLat=Math.min(...pts.map(p=>+p.lat));
  const maxLat=Math.max(...pts.map(p=>+p.lat));
  const minLon=Math.min(...pts.map(p=>+p.lon));
  const maxLon=Math.max(...pts.map(p=>+p.lon));

  const pad=30;
  const dx=Math.max(1e-7,maxLon-minLon);
  const dy=Math.max(1e-7,maxLat-minLat);
  const scale=Math.min((cssW-pad*2)/dx,(cssH-pad*2)/dy);
  const usedW=dx*scale, usedH=dy*scale;
  const offX=(cssW-usedW)/2, offY=(cssH-usedH)/2;

  const route=pts.map(p=>({
    x:offX+(+p.lon-minLon)*scale,
    y:cssH-(offY+(+p.lat-minLat)*scale),
    km:+p.km
  }));

  // route shadow + bright red route line
  x.lineJoin='round';x.lineCap='round';
  x.strokeStyle='rgba(0,0,0,.55)';x.lineWidth=7;
  x.beginPath();route.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.stroke();
  x.strokeStyle='#ef4444';x.lineWidth=4;
  x.beginPath();route.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));x.stroke();

  function pointAtKm(km){
    let best=route[0],bestD=Infinity;
    for(const p of route){
      const d=Math.abs(p.km-km);
      if(d<bestD){best=p;bestD=d}
    }
    return best;
  }

  // Kilometer dots every 10 km for orientation.
  x.font='10px system-ui';x.textAlign='center';
  for(let km=10;km<total;km+=10){
    const p=pointAtKm(km);
    x.fillStyle='#e2e8f0';
    x.beginPath();x.arc(p.x,p.y,3,0,Math.PI*2);x.fill();
    x.fillStyle='#94a3b8';
    x.fillText(km+' км',p.x,p.y-8);
  }

  function marker(km,kind){
    const p=pointAtKm(km);
    const confirmedKind=kind==='confirmed';
    const bridgeKind=kind==='bridge';
    const fill=confirmedKind?'#22c55e':bridgeKind?'#a78bfa':'#38bdf8';
    const label=confirmedKind?'✓':bridgeKind?'🌉':'🌊';

    x.fillStyle=fill;
    x.beginPath();x.arc(p.x,p.y,9,0,Math.PI*2);x.fill();
    x.strokeStyle='#fff';x.lineWidth=2;x.stroke();

    x.font=bridgeKind?'13px system-ui':'bold 11px system-ui';
    x.textAlign='center';x.textBaseline='middle';x.fillStyle=confirmedKind?'#052e16':'#082f49';
    x.fillText(label,p.x,p.y+.5);

    // km label next to the marker
    x.textBaseline='alphabetic';
    x.font='bold 10px system-ui';
    x.textAlign=p.x>cssW*.64?'right':'left';
    x.fillStyle='#f8fafc';
    x.fillText(Number(km).toFixed(1),p.x+(p.x>cssW*.64?-12:12),p.y+3);
  }

  // Avoid drawing a likely marker on top of a confirmed one.
  const likelyClean=likely.filter(k=>!confirmed.some(c=>Math.abs(c-k)<=.18));
  const sourceLikely=likelyClean.length?likelyClean:
    combined.filter(k=>!confirmed.some(c=>Math.abs(c-k)<=.18));

  sourceLikely.forEach(k=>marker(k,'likely'));
  confirmed.forEach(k=>marker(k,'confirmed'));
  bridges.forEach(k=>marker(k,'bridge'));

  // Start / finish
  const a=route[0],b=route[route.length-1];
  x.fillStyle='#22c55e';x.beginPath();x.arc(a.x,a.y,7,0,Math.PI*2);x.fill();
  x.fillStyle='#fff';x.font='bold 11px system-ui';x.textAlign='left';
  x.fillText('Старт',Math.min(cssW-42,a.x+10),Math.max(14,a.y-7));
  x.font='15px system-ui';x.textAlign='center';x.fillText('🏁',b.x,b.y-10);
}
window.addEventListener('resize',()=>setTimeout(drawFordScheme,100));

setInterval(()=>{if(document.getElementById('fordSchemeCanvas')) drawFordScheme();},2500);


setInterval(()=>{if(document.querySelector('[data-tab="simulation"]')?.classList.contains('active')){}},250);

document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.tab==='simulation'){
    setTimeout(()=>{renderSimFordMap();},80);
    setTimeout(()=>{
      try{
        if(simFordLeafletMap){
          simFordLeafletMap.invalidateSize();
          const pts=(state.track||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
          if(pts.length>1) simFordLeafletMap.fitBounds(L.latLngBounds(pts.map(p=>[p.lat,p.lon])),{padding:[10,10]});
        }
      }catch(e){}
    },350);
  }
}));







// v0.97 route map redraw

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(btn.dataset.tab==='route'){
      setTimeout(()=>{
        try{
          drawFordScheme();
          renderFordMap();
          if(fordLeafletMap) fordLeafletMap.invalidateSize();
        }catch(e){}
      },180);
    }
  });
});
// v0.0261: the ITRA button now loads a roster that already contains ITRA PI.
$('itraLookupBtn')?.addEventListener('click',(ev)=>{
  ev.preventDefault();
  ev.stopImmediatePropagation();
  $('rosterFile')?.click();
},true);

// v0.0261: calculate race placing from uploaded ITRA list + own PI.
$('saveItraRosterBtn')?.addEventListener('click',(ev)=>{
  ev.preventDefault();
  ev.stopImmediatePropagation();
  const pi=Number($('itraPi')?.value||0);
  if(!state.roster.length){
    if($('saveItraRosterStatus')) $('saveItraRosterStatus').textContent='Сначала загрузите стартовый список с баллами ITRA.';
    return;
  }
  if(!(pi>0)){
    if($('saveItraRosterStatus')) $('saveItraRosterStatus').textContent='Введите свой ITRA PI.';
    return;
  }
  let athlete=($('athleteName')?.value||'').trim();
  if(!athlete){
    athlete='Вы';
    const existing=state.roster.find(r=>String(r.athlete||'').toLowerCase()==='вы');
    if(existing) existing.pi=pi;
    else state.roster.push({athlete:'Вы',gender:'',pi,tech:0,end:0,form:0,_raw:{}});
  }
  const nameEl=$('athleteName'); if(nameEl) nameEl.value=athlete;
  if($('saveItraRosterStatus')) $('saveItraRosterStatus').textContent='✓ PI принят. Рассчитываю прогноз гонки…';
  updateFinalCalcAvailability();
  const calc=$('calcBtn');
  if(calc){ calc.disabled=false; calc.click(); }
},true);
