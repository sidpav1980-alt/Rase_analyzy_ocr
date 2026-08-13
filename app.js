
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

  raw=raw.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  const groups=[];
  let cur=null;
  for(const km of raw){
    if(!cur || km-cur.start>0.500001){
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
  btn.disabled=!ready;
  if(ready){
    setActionState('mapAnalyzeBtn','ready');
    if($('mapAnalyzeStatus') && !$('mapAnalyzeStatus').textContent.includes('✓')){
      $('mapAnalyzeStatus').textContent='GPX готов. Можно запускать анализ карты.';
    }
  }else{
    setActionState('mapAnalyzeBtn','idle');
  }
}



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
  navigator.serviceWorker.register('./sw.js').catch(()=>{});
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
  // Preserve original GPX timestamps for moving/elapsed time.
  const _gpxTimeNodes=[...xml.querySelectorAll('trkpt')];
  state.track.forEach((p,i)=>{
    const tn=_gpxTimeNodes[i]?.querySelector('time');
    p.time=tn ? tn.textContent.trim() : null;
  });
state.dist=total/1000;state.gain=gain;state.loss=loss;
  syncMapAnalyzeButton();
  $('distMetric').textContent=state.dist.toFixed(1)+' км';
  $('gainMetric').textContent=state.hasElevation ? Math.round(gain)+' м' : 'нет данных';
  $('lossMetric').textContent=state.hasElevation ? Math.round(loss)+' м' : 'нет данных';
  updateItraDifficulty();
  updateTrailDifficulty();
  drawTrackProfiles();
  updateTraversalTimes();
  updateRaceForecastAvailability();
}
function readFileIOS(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsText(file,'UTF-8');
  });
}
let selectedGPXFile=null;
let mapAnalysisAbortController=null;
let mapAnalysisRunId=0;

function abortMapAnalysisForNewGpx(){
  mapAnalysisRunId++;
  if(mapAnalysisAbortController){
    try{ mapAnalysisAbortController.abort(); }catch(e){}
    mapAnalysisAbortController=null;
  }
  stopMapAnalysisTimer();
  const p=$('mapAnalyzeProgress');
  if(p){ p.value=0; p.style.display='none'; }
  const btn=$('mapAnalyzeBtn');
  if(btn){
    btn.disabled=true;
    setActionState('mapAnalyzeBtn','idle');
  }
  const status=$('mapAnalyzeStatus');
  if(status) status.textContent='Анализ карты остановлен. Сначала обработайте новый GPX.';
}


$('basePace').addEventListener('change',()=>{ if(state.track&&state.track.length) drawTrackProfiles(); });
window.addEventListener('resize',()=>{ if(state.track&&state.track.length) drawTrackProfiles(); });

$('gpxFile').addEventListener('change', e=>{
  abortMapAnalysisForNewGpx();
  invalidateRaceForecast();
  state.hasElevation=false;
  state.raceForecast=null;
  if($('raceForecastTable')) $('raceForecastTable').querySelector('tbody').innerHTML='';
  if($('raceForecastTime')) $('raceForecastTime').textContent='—';
  if($('raceForecastPace')) $('raceForecastPace').textContent='—';
  if($('raceForecastRange')) $('raceForecastRange').textContent='—';

  clearResultForecast();
  selectedGPXFile=e.currentTarget.files&&e.currentTarget.files[0] ? e.currentTarget.files[0] : null;
  state.mapAnalysis=null;
  state.mapAnalysisReadyForCurrentGpx=false;
  resetMapAnalysisForNewGPX();
  applyForecastModeColors();
  resetOwnItraForNewGPX();
  if(!selectedGPXFile){
    $('gpxName').innerHTML='<span id="gpxCheck" class="file-check">○</span> Файл не выбран';
    $('gpxStatus').textContent='1. Выберите файл GPX.';
    $('gpxLoadBtn').disabled=true; setActionState('gpxLoadBtn','idle');
    return;
  }
  $('gpxName').innerHTML='<span id="gpxCheck" class="file-check selected">✓</span> Выбран: '+selectedGPXFile.name;
  
  $('gpxStatus').textContent='2. Файл выбран. Нажмите «Загрузить и обработать GPX».';
  $('gpxLoadBtn').disabled=false; setActionState('gpxLoadBtn','ready');
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
    syncMapAnalyzeButton(); setActionState('gpxLoadBtn','success');
    setTimeout(()=>{prog.style.display='none';},1200);
  }catch(err){
    prog.style.display='none';
    $('gpxStatus').textContent='✕ Ошибка обработки GPX: '+(err.message||String(err));
    if($('mapAnalyzeBtn')){$('mapAnalyzeBtn').disabled=true;setActionState('mapAnalyzeBtn','idle');} setActionState('gpxLoadBtn','error');
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

function updateItraDifficulty(){
  const kmEffort=(state.dist||0)+((state.gain||0)/100);
  const points=itraEndurancePoints(kmEffort);
  const k=$('itraKmEffort'), p=$('itraPoints');
  if(k) k.textContent=kmEffort ? kmEffort.toFixed(1) : '—';
  if(p) p.textContent=(state.dist||state.gain) ? String(points) : '—';
  return {kmEffort, points};
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

  // Trail Difficulty 0-10.
  // Weights emphasize vertical density and sustained steepness.
  let score=0;

  // vertical density: 0..3.5
  score += Math.min(3.5, vertPerKm/30);

  // steepness exposure: 0..3.0
  score += Math.min(1.5, steep10Pct/20);
  score += Math.min(1.0, steep15Pct/18);
  score += Math.min(0.5, steep20Pct/15);

  // profile ruggedness / reversals: 0..1.5
  const revPer10=(reversals/Math.max(state.dist,1))*10;
  score += Math.min(1.5, revPer10/8);

  // sustained climbs: 0..1.0
  score += Math.min(1.0, longClimbs/6);

  // very steep max grade: 0..1.0
  if(maxGrade>=30) score+=1.0;
  else if(maxGrade>=20) score+=0.7;
  else if(maxGrade>=15) score+=0.4;

  score=Math.max(0,Math.min(10,score));

  let label='Почти плоская';
  if(score>=9) label='Очень тяжёлая / альпийская';
  else if(score>=7) label='Тяжёлая';
  else if(score>=5) label='Средняя';
  else if(score>=3) label='Лёгкий трейл';

  return {
    score,
    steep15Pct,
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
  if(l) l.textContent=(state.dist>0)?`${d.label} · max уклон ${d.maxGrade.toFixed(0)}% · подъёмов >500 м: ${d.longClimbs}`:'—';
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
  const lats=points.map(p=>p.lat), lons=points.map(p=>p.lon);
  const pad=0.01;
  const s=Math.min(...lats)-pad, n=Math.max(...lats)+pad, w=Math.min(...lons)-pad, e=Math.max(...lons)+pad;
  return `[out:json][timeout:30];
(
  way["natural"="wetland"](${s},${w},${n},${e});
  way["natural"="water"](${s},${w},${n},${e});
  way["waterway"](${s},${w},${n},${e});
  way["highway"](${s},${w},${n},${e});
  node["ford"](${s},${w},${n},${e});
);
out tags geom;`;
}




function analyzeWaterCrossings(samples,elements=[]){
  if(!samples || samples.length<2) return {fords:[],bridges:[]};

  const bridgeWays=(elements||[]).filter(el=>{
    const t=el.tags||{};
    return el.type==='way' && Array.isArray(el.geometry) && el.geometry.length>=2 &&
      (t.bridge==='yes' || t.bridge==='true' || t.bridge==='viaduct' || t.man_made==='bridge');
  });

  function trackPointAtKm(km){
    let best=null,bestDiff=Infinity;
    for(const p of (state.track||[])){
      if(!Number.isFinite(p.km)||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)) continue;
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
        const a={lat:g[i-1].lat,lon:g[i-1].lon};
        const b={lat:g[i].lat,lon:g[i].lon};
        const d=distancePointToSegmentKm({lat:p.lat,lon:p.lon},a,b);
        if(Number.isFinite(d) && d<=0.035) return true;
      }
    }
    return false;
  }

  const fords=[],bridges=[];
  let inWater=false,startKm=0;

  function finish(endKm){
    const len=Math.max(0,endKm-startKm);
    // Ignore tiny OSM/GPS water fragments: a crossing must be at least 2 metres.
    if(len<0.002) return;
    if(len>0.30) return;
    const mid=(startKm+endKm)/2;
    if(bridgeNearKm(mid)) bridges.push(mid);
    else fords.push(mid);
  }

  for(let i=0;i<samples.length;i++){
    const water=String(samples[i].cls||'').toLowerCase()==='water';
    if(water && !inWater){
      inWater=true;
      startKm=Number(samples[i].km||0);
    }else if(!water && inWater){
      finish(Number(samples[Math.max(0,i-1)].km||startKm));
      inWater=false;
    }
  }

  if(inWater) finish(Number(samples[samples.length-1].km||startKm));
  return {fords,bridges};
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



function groupFordKmPoints(kms){
  const pts=(Array.isArray(kms)?kms:[])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a,b)=>a-b);

  const groups=[];
  let current=null;

  for(const km of pts){
    if(!current || km-current.start>0.50){
      if(current) groups.push(current);
      current={start:km,end:km,points:[km]};
    }else{
      current.end=km;
      current.points.push(km);
    }
  }
  if(current) groups.push(current);

  return groups.map(g=>({
    start:g.start,
    end:g.end,
    points:g.points,
    label:g.start.toFixed(1)
  }));
}

function filterFordCandidatesClient(fords){
  if(!Array.isArray(fords)) return [];

  const arr=fords
    .filter(f=>{
      const w=Number(f?.width_m ?? f?.width);
      return !(Number.isFinite(w) && w<2.0);
    })
    .filter(f=>Number.isFinite(Number(f?.km)))
    .sort((a,b)=>Number(a.km)-Number(b.km));

  const groups=groupFordKmPoints(arr.map(f=>Number(f.km)));

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
  if(mapAnalysisAbortController){
    try{ mapAnalysisAbortController.abort(); }catch(e){}
  }
  mapAnalysisAbortController=new AbortController();
  const controller=mapAnalysisAbortController;

  const pts=sampleTrackPoints(220);
  const query=buildOverpassQuery(pts);

  $('mapAnalyzeStatus').textContent='⏳ Отправляю запрос через Render proxy…';

  const timer=setTimeout(()=>controller.abort(),45000);

  let resp;
  try{
    resp=await fetch('/api/osm',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query}),
      signal:controller.signal,
      cache:'no-store'
    });
  }finally{
    clearTimeout(timer);
  }

  if(runId!==mapAnalysisRunId || controller.signal.aborted){
    const err=new Error('Анализ карты остановлен');
    err.name='AbortError';
    throw err;
  }

  if(!resp.ok){
    let detail='';
    try{
      const e=await resp.json();
      detail=e.error||'';
    }catch(e){}
    throw new Error('Proxy HTTP '+resp.status+(detail?' · '+detail:''));
  }

  const data=await resp.json();
  if(runId!==mapAnalysisRunId || controller.signal.aborted){
    const err=new Error('Анализ карты остановлен');
    err.name='AbortError';
    throw err;
  }
  mapAnalysisAbortController=null;
    normalizeFordData(data);
    {
      let rawFordKm=[];
      if(Array.isArray(data.ford_kms)) rawFordKm=data.ford_kms;
      else if(Array.isArray(data.fords)) rawFordKm=data.fords.map(f=>Number(f?.km)).filter(Number.isFinite);

      const groupedFords=groupFordKmPoints(rawFordKm);
      data.ford_groups=groupedFords;
      data.ford_count=groupedFords.length;
      data.ford_kms=groupedFords.map(g=>g.start);
      data.ford_labels=groupedFords.map(g=>g.label);
      const cEl=$('fordCount')||$('fordsCount')||$('ford-count');
      if(cEl) cEl.textContent=String(data.ford_count);
      const lEl=$('fordKms')||$('fordsKm')||$('fordKmList')||$('ford-kms');
      if(lEl) lEl.textContent=data.ford_labels.length ? 'Броды на км: '+data.ford_labels.join(', ') : 'Броды на км: —';
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

  return {samples,summary,elements};
}
function renderMapAnalysis(result){
  const {samples,summary,elements=[]}=result;
  const crossings=analyzeWaterCrossings(samples,elements);
  // One physical water section = one ford. Display only the first (entry) km.
  const fordGroups=groupFordKmPoints(crossings.fords);
  const fordKms=fordGroups.map(g=>g.start);
  const bridgeKms=crossings.bridges;
  state.mapAnalysis={
    result,
    samples:[...samples],
    summary:{...summary},
    fordKms:[...fordKms],
    fordCount:fordKms.length,
    bridgeKms:[...bridgeKms]
  };
  state.mapAnalysisReadyForCurrentGpx=true;

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
  $('coverageMetric').textContent=summary.coverage.toFixed(0)+'%';
  $('wetlandMetric').textContent=summary.wetland.toFixed(1)+'%';
  $('waterCrossMetric').textContent=summary.water.toFixed(1)+'%';
  $('trailMetric').textContent=summary.trail.toFixed(1)+'%';
  $('dirtMetric').textContent=summary.dirt.toFixed(1)+'%';
  $('pavedMetric').textContent=summary.paved.toFixed(1)+'%';

  const fordCount=$('fordCountMetric');
  if(fordCount) fordCount.textContent=String(fordKms.length);

  const fordList=$('fordKmList');
  if(fordList) fordList.textContent=fordKms.length
    ? 'Броды на км: '+fordKms.map(x=>x.toFixed(1)).join(', ')
    : 'Броды: не обнаружены';

  const bridgeList=$('bridgeFordKmList');
  if(bridgeList) bridgeList.textContent=bridgeKms.length
    ? 'Пересечение воды по мосту на км: '+bridgeKms.map(x=>x.toFixed(1)).join(', ')
    : 'По мосту: не обнаружено';

  $('mapAnalysisNote').textContent=`OSM-классификация маршрута. Неизвестно: ${(100-summary.coverage).toFixed(0)}%. Данные зависят от полноты разметки OpenStreetMap.`;
  drawSurfaceStrip(samples);
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
    $('rosterLoadBtn').disabled=true;setActionState('rosterLoadBtn','idle');$('rosterStatus').textContent='1. Выберите файл стартового списка.';return;
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
    $('rosterStatus').textContent='✓ Готово: '+state.roster.length+' участников.'; setActionState('rosterLoadBtn','success');setTimeout(()=>p.style.display='none',1000);
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
    return {athlete, gender:gen?String(r[gen]):'', pi:pi?parseFloat(r[pi])||0:0, tech:0,end:0,form:0};
  }).filter(x=>x.athlete);
}
function genderOkay(g){
  const mode=$('genderFilter').value, s=String(g).toLowerCase();
  if(mode==='Все')return true;
  if(mode==='Женщины')return s.startsWith('ж')||s==='f'||s.includes('female');
  return s.startsWith('м')||s==='m'||s.includes('male');
}
function renderRoster(){
  const tb=$('rosterTable').querySelector('tbody'); tb.innerHTML='';
  const athlete=$('athleteName').value.trim().toLowerCase();
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
$('genderFilter').addEventListener('change',renderRoster);

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
  const v=Number($('refAvgHr')?.value||state.bestTraining?.hr||0);
  return Number.isFinite(v) ? v : 0;
}

function buildHrStrategy(){
  const dist=Number(state.dist||0);
  const avgHr=getBestTrainingHr();
  if(!(dist>0) || !(avgHr>0)) return [];

  // Use best-training HR as an anchor.
  // Early race = controlled, middle = working range, final = race effort.
  // Clamp to sane running ranges so OCR mistakes don't create absurd targets.
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,Math.round(x)));

  const earlyLo=clamp(avgHr-10,120,185);
  const earlyHi=clamp(avgHr-7,earlyLo,190);

  const midLo=clamp(avgHr-7,120,190);
  const midHi=clamp(avgHr-3,midLo,195);

  const lateLo=clamp(avgHr-3,120,195);
  const lateHi=clamp(avgHr+1,lateLo,198);

  const finishLo=clamp(avgHr,120,198);
  const finishHi=clamp(avgHr+5,finishLo,202);

  const p1=Math.max(1,Math.round(dist*0.52));
  const p2=Math.max(p1+1,Math.round(dist*0.78));
  const p3=Math.max(p2+1,Math.round(dist*0.95));

  return [
    {
      km:`0–${p1} км`,
      hr:`${earlyLo}–${earlyHi}`,
      mode:'На подъёмах держать запас. Короткий выход выше диапазона допустим, но не висеть там постоянно.'
    },
    {
      km:`${p1}–${p2} км`,
      hr:`${midLo}–${midHi}`,
      mode:'Рабочий горный пульс. На спусках и лёгких участках дать пульсу опуститься и восстановиться.'
    },
    {
      km:`${p2}–${p3} км`,
      hr:`${lateLo}–${lateHi}`,
      mode:'Если питание и ноги в порядке — постепенно повышать усилие. Основная атака.'
    },
    {
      km:`${p3}–${dist.toFixed(1).replace(/\.0$/,'')} км`,
      hr:`${finishLo}–${finishHi}+`,
      mode:'Финишный участок. Можно работать без экономии, если нет признаков перегрева или развала.'
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
    summary.textContent='Нужны GPX трассы и средний пульс лучшей тренировки.';
    return;
  }

  rows.forEach(r=>{
    tbody.insertAdjacentHTML('beforeend',
      `<tr><td>${r.km}</td><td><b>${r.hr}</b></td><td>${r.mode}</td></tr>`);
  });

  const avgHr=getBestTrainingHr();
  summary.textContent=`Основа: средний пульс лучшей тренировки ${avgHr} уд/мин. На спусках высокий пульс специально не удерживать.`;
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
  p.style.display='block'; p.value=15;
  $('mapAnalyzeStatus').textContent='⏳ Запрашиваю OSM/Overpass…';
  try{
    const myRunId=mapAnalysisRunId+1;
    const result=await analyzeMapOSM();
    if(myRunId!==mapAnalysisRunId) return;
    p.value=85;
    renderMapAnalysis(result);
    p.value=100;
    $('mapAnalyzeStatus').textContent='✓ Анализ карты готов и сохранён локально.';
    stopMapAnalysisTimer();
    setActionState('mapAnalyzeBtn','success');
    setTimeout(()=>p.style.display='none',1200);
  }catch(err){
    p.style.display='none';
    if(err?.name==='AbortError'){
      $('mapAnalyzeStatus').textContent='Анализ карты остановлен.';
      setActionState('mapAnalyzeBtn','idle');
    }else{
      $('mapAnalyzeStatus').textContent='✕ Ошибка анализа карты: '+(err.message||String(err));
      setActionState('mapAnalyzeBtn','error');
    }
  }finally{
    mapAnalysisAbortController=null;
    syncMapAnalyzeButton();
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
      el.textContent='Render подключён ✓';
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




$('itraLookupBtn')?.addEventListener('click', async ()=>{
  if(!state.roster.length){
    $('itraLookupStatus').textContent='Сначала загрузите стартовый список.';
    setActionState('itraLookupBtn','ready');
    return;
  }

  const btn=$('itraLookupBtn');
  btn.disabled=true;
  setActionState('itraLookupBtn','working');
  $('itraLookupStatus').textContent='Ищу ITRA и анализирую участников…';

  try{
    const names=state.roster.map(r=>r.athlete).filter(Boolean);
    const manualKey=getManualOpenRouterKey();
    const headers={'Content-Type':'application/json'};
    if(manualKey) headers['X-OpenRouter-Key']=manualKey;
    const resp=await fetch('/api/itra-batch',{
      method:'POST',
      headers,
      body:JSON.stringify({names})
    });

    if(!resp.ok){
      let detail='';
      try{
        const e=await resp.json();
        detail=e.error||'';
      }catch(e){}
      throw new Error('HTTP '+resp.status+(detail?' · '+detail:''));
    }

    const data=await resp.json();
    normalizeFordData(data);
    let found=0;
    (data.results||[]).forEach(x=>{
      const r=state.roster.find(r=>r.athlete.toLowerCase()===String(x.name||'').toLowerCase());
      if(r && x.pi){
        r.pi=Number(x.pi);
        found++;
      }
    });

    renderRoster();
    $('itraLookupStatus').textContent='✓ ITRA загружен: '+found+' из '+names.length+' участников.';
    setActionState('itraLookupBtn','success');
  }catch(err){
    $('itraLookupStatus').textContent='✕ Ошибка ITRA: '+(err.message||String(err));
    setActionState('itraLookupBtn','error');
  }finally{
    btn.disabled=false;
  }
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
  const refs=Object.values(state.raceReferences||{}).filter(Boolean);
  const withHr=refs.filter(r=>Number(r.avgHr)>60 && Number(r.avgHr)<220);
  const manual=Number($('refAvgHr')?.value||state.bestTraining?.hr||0);
  const lthr=Number($('lthr')?.value||0);

  if(withHr.length){
    let wSum=0, hrSum=0, slopeSum=0, slopeW=0;
    for(const r of withHr){
      const hours=Math.max(0.5,Number(r.elapsedSec||0)/3600);
      const w=Math.max(0.7,Math.min(2.0,Math.sqrt(hours)));
      hrSum+=Number(r.avgHr)*w;
      wSum+=w;
      if(Number(r.hrSpeedSlope)>0){
        slopeSum+=Number(r.hrSpeedSlope)*w;
        slopeW+=w;
      }
    }
    return {
      anchorHr:hrSum/Math.max(0.001,wSum),
      speedSlope:slopeW?slopeSum/slopeW:30,
      source:`GPX: ${withHr.length}/3 с пульсом`,
      count:withHr.length,
      lthr:lthr>0?lthr:0
    };
  }

  if(manual>60) return {anchorHr:manual,speedSlope:30,source:'ручной средний пульс',count:0,lthr:lthr>0?lthr:0};
  if(lthr>0) return {anchorHr:lthr*0.90,speedSlope:30,source:'LTHR',count:0,lthr};
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

  const vo2=Number($('vo2max')?.value||0);
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
  if(targetKm<=100) return 1.10;
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
  const vo2=Number($('vo2max')?.value||0);

  const speedCal=vo2AdjustedFlatCalibration(ref,vo2);
  const calibrationSpeed=Math.max(0.5,speedCal.speed);

  const refKm=Math.max(5,Math.min(ref.dist,15));
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
    speedCalibration:speedCal
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

  const vo2=Number($('vo2max')?.value||0);
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

  return {
    totalSec,
    avgPaceSec:totalSec/state.dist,
    lowSec:totalSec*0.95,
    highSec:totalSec*1.05,
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

  return `Калибровка считается по фактическим данным трёх загруженных GPX. `
    + speedText
    + `Итоговый скоростной якорь: ${fmtPaceSecPerKm(anchor.refPaceSec)} на ${anchor.refKm.toFixed(1)} км. `
    + `Быстрая трейловая GPX влияет на рабочую скорость и рельеф. `
    + `Силовая трейловая GPX влияет на уклон и запас выносливости. `
    + (cap?`Запас выносливости: ${cap.capacityHours.toFixed(1)} ч. `:'')
    + `Далее применяются Riegel, усталость по длительности, рельеф и анализ покрытия.`;
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

        const trailKm=trailPenaltyPerKmSec>0
          ? surfaceDistanceInRange(trailSamples,g.from,g.to,'trail')
          : 0;
        const trailExtra=trailKm*trailPenaltyPerKmSec;

        const dirtKm=dirtPenaltyPerKmSec>0
          ? surfaceDistanceInRange(trailSamples,g.from,g.to,'dirt')
          : 0;
        const dirtExtra=dirtKm*dirtPenaltyPerKmSec;

        const unknownKm=trailSamples.length
          ? surfaceDistanceInRange(trailSamples,g.from,g.to,'unknown')
          : 0;

        // Unknown OSM coverage is conservative: the unknown part of a segment
        // must never be modeled faster than 6:30/km.
        const groupKm=Math.max(0.001,g.distM/1000);
        const knownExtra=fordExtra+trailExtra+dirtExtra;
        const paceAfterKnown=(g.sec+knownExtra)/groupKm;
        const unknownShare=Math.max(0,Math.min(1,unknownKm/groupKm));
        const unknownTargetPace=Math.max(paceAfterKnown,390);
        const unknownExtra=(unknownTargetPace-paceAfterKnown)*unknownShare*groupKm;

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
      f.lowSec=f.totalSec*0.90;
      f.highSec=f.totalSec*1.10;
      f.physiology=racePhysiologyFactors(f.totalSec);
    }
    // v0.39: HR comes from the uploaded training GPXs and the predicted pace of this segment.
    const hrCal=trainingHrCalibration();
    const forecastHrForGroup=(g)=>{
      if(!hrCal) return '—';

      const raceAvg=Math.max(1,Number(f.avgPaceSec||g.paceSec));
      const localPace=Math.max(1,Number(g.paceSec||raceAvg));
      const speedRatio=raceAvg/localPace;
      const progress=Math.max(0,Math.min(1,((g.from+g.to)/2)/Math.max(0.1,state.dist)));

      let center=hrCal.anchorHr + (speedRatio-1)*hrCal.speedSlope;
      center += progress<0.20 ? -6 :
                progress<0.55 ? -3 :
                progress<0.80 ? 0 :
                progress<0.95 ? 3 : 6;

      const grade=Number(g.grade||0);
      if(grade>0.02) center+=Math.min(5,grade*55);
      if(grade<-0.02) center-=Math.min(4,Math.abs(grade)*35);

      if(hrCal.lthr>0){
        const maxFrac=progress<0.25?0.94:
                      progress<0.75?0.97:
                      progress<0.95?1.00:1.03;
        center=Math.min(center,hrCal.lthr*maxFrac);
      }

      center=Math.max(105,Math.min(198,center));
      const spread=progress<0.25?3:progress<0.90?3:4;
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
  const vo2=Number($('vo2max')?.value||0);
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
  const vo2=Number($('vo2max')?.value||0);
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
      setActionState(btnId,'idle');
      status.textContent='Не загружена.';
      updateRaceReferenceState();
      return;
    }
    nameEl.innerHTML='<span class="file-check selected">✓</span> Выбран: '+f.name;
    btn.disabled=false;
    setActionState(btnId,'ready');
    status.textContent='Файл выбран. Нажмите загрузить.';
    updateRaceReferenceState();
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
        + (parsed.avgHr>0?` · HR ${Math.round(parsed.avgHr)}`:' · HR нет');
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
      setActionState(btnId,'error');
      updateRaceReferenceState();
    }
  });
}

bindRaceReference('strength');
bindRaceReference('fastTrail');
bindRaceReference('flatRace');

$('clearOpenAiKeyBtn')?.addEventListener('click',()=>{
  const el=$('openAiKey'); if(el) el.value='';
  try{sessionStorage.removeItem('openAiApiKey');}catch(e){}
});
$('openAiKey')?.addEventListener('input',e=>{
  try{sessionStorage.setItem('openAiApiKey',e.currentTarget.value||'');}catch(err){}
});
window.addEventListener('DOMContentLoaded',()=>{
  try{const k=sessionStorage.getItem('openAiApiKey')||''; if($('openAiKey')) $('openAiKey').value=k;}catch(e){}
});

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

  const athlete=$('athleteName').value.trim();
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
    athlete:$('athleteName').value, pi:$('itraPi').value,
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

  // v0.80 lower field originally inherited a numeric "minutes" input.
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
