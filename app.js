
const state = {
  track: [],
  dist: 0,
  gain: 0,
  loss: 0,
  roster: [],
  shots: [],
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
  $('gainMetric').textContent=Math.round(gain)+' м';
  $('lossMetric').textContent=Math.round(loss)+' м';
  updateItraDifficulty();
  updateTrailDifficulty();
  drawTrackProfiles();
  updateTraversalTimes();
}
function readFileIOS(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error);r.readAsText(file,'UTF-8');
  });
}
let selectedGPXFile=null;


$('basePace').addEventListener('change',()=>{ if(state.track&&state.track.length) drawTrackProfiles(); });
window.addEventListener('resize',()=>{ if(state.track&&state.track.length) drawTrackProfiles(); });

$('gpxFile').addEventListener('change', e=>{
  clearResultForecast();
  selectedGPXFile=e.currentTarget.files&&e.currentTarget.files[0] ? e.currentTarget.files[0] : null;
  resetMapAnalysisForNewGPX();
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
    $('gpxStatus').textContent='✓ GPX обработан: '+state.dist.toFixed(1)+' км · +'+Math.round(state.gain)+' м · −'+Math.round(state.loss)+' м';
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
    ctx.fillText('Загрузите GPX для построения профиля',16,30);
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

async function analyzeMapOSM(){
  if(!state.track || !state.track.length) throw new Error('Сначала обработайте GPX');
  const pts=sampleTrackPoints(220);
  const query=buildOverpassQuery(pts);

  $('mapAnalyzeStatus').textContent='⏳ Отправляю запрос через Render proxy…';

  const controller=new AbortController();
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

  if(!resp.ok){
    let detail='';
    try{
      const e=await resp.json();
      detail=e.error||'';
    }catch(e){}
    throw new Error('Proxy HTTP '+resp.status+(detail?' · '+detail:''));
  }

  const data=await resp.json();
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
  const fordKms=crossings.fords;
  const bridgeKms=crossings.bridges;

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

let selectedShotFile=null;

$('shotFiles').addEventListener('change', e=>{
  selectedShotFile=e.currentTarget.files&&e.currentTarget.files[0] ? e.currentTarget.files[0] : null;
  if(!selectedShotFile){
    state.shots=[];
    $('shotsName').innerHTML='<span class="file-check">○</span> Файл не выбран';
    $('shotsStatus').textContent='1. Выберите один скриншот.';
    $('shotsLoadBtn').disabled=true;
    setActionState('shotsLoadBtn','idle');
    return;
  }
  $('shotsName').innerHTML='<span class="file-check selected">✓</span> Выбран: '+selectedShotFile.name;
  $('shotsStatus').textContent='2. Файл выбран. Нажмите кнопку загрузки.';
  $('shotsLoadBtn').disabled=false;
  setActionState('shotsLoadBtn','ready');
});

$('shotsLoadBtn').addEventListener('click',async ()=>{
  if(!selectedShotFile){
    $('shotsStatus').textContent='✕ Сначала выберите скриншот.';
    setActionState('shotsLoadBtn','error');
    return;
  }

  const btn=$('shotsLoadBtn'), p=$('shotsProgress');
  btn.disabled=true;
  setActionState('shotsLoadBtn','working');
  p.style.display='block';
  p.value=20;
  $('shotsStatus').textContent='⏳ Загружаю скриншот…';

  try{
    state.shots=[selectedShotFile];
    p.value=70;
    renderShots();
    await new Promise(r=>setTimeout(r,60));
    p.value=100;
    $('shotsStatus').textContent='✓ Скриншот успешно загружен.';
    setActionState('shotsLoadBtn','success');
    setTimeout(()=>{p.style.display='none';},1000);
  }catch(err){
    p.style.display='none';
    $('shotsStatus').textContent='✕ Ошибка загрузки скриншота: '+(err.message||String(err));
    setActionState('shotsLoadBtn','error');
  }finally{
    btn.disabled=false;
  }
});

function renderShots(){
  const box=$('shotsList'); box.innerHTML='';
  state.shots.forEach((f,i)=>{
    const url=URL.createObjectURL(f);
    const d=document.createElement('div'); d.className='shot';
    d.innerHTML=`<img src="${url}"><div><b>${f.name}</b><textarea id="shotText${i}" rows="4" placeholder="Вставьте текст с тренировки"></textarea></div>`;
    box.appendChild(d);
  });
}

$('ocrBtn').addEventListener('click', ()=>{
  if(!state.shots.length){$('ocrStatus').textContent='Сначала загрузите скриншот.';return;}
  let merged='';
  for(let i=0;i<state.shots.length;i++){
    const el=$(`shotText${i}`);
    if(el) merged += '\\n' + el.value;
  }
  applyOCR(merged);
  $('ocrStatus').textContent='Данные из вставленного текста применены. Проверь значения ниже.';
});

function applyOCR(text){
  const low=text.toLowerCase().replace(',','.');
  let m=low.match(/(\d+(?:\.\d+)?)\s*км/); if(m)$('refDist').value=m[1];
  m=low.match(/(?:набор|elevation|gain|\+)\D{0,8}(\d{2,5})\s*м/); if(m)$('refGain').value=m[1];
  m=low.match(/(?:средн\w*\s*пульс|avg\s*hr|average heart rate)\D{0,12}(\d{2,3})/); if(m)$('refAvgHr').value=m[1];
  m=low.match(/(?:макс\w*\s*пульс|max\s*hr|max heart rate)\D{0,12}(\d{2,3})/); if(m)$('refMaxHr').value=m[1];
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
  const hr=+$('refAvgHr').value||0, mins=+$('refMinutes').value||100;
  if(mins<=50)return Math.round(hr*.98);
  if(mins<=100)return Math.round(hr*1.01);
  return Math.round(hr*1.03);
}

function movingTimeMinutes(){
  const el=$('refTime');
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
    const result=await analyzeMapOSM();
    p.value=85;
    renderMapAnalysis(result);
    p.value=100;
    $('mapAnalyzeStatus').textContent='✓ Анализ карты готов и сохранён локально.';
    setActionState('mapAnalyzeBtn','success');
    setTimeout(()=>p.style.display='none',1200);
  }catch(err){
    p.style.display='none';
    $('mapAnalyzeStatus').textContent='✕ Ошибка анализа карты: '+(err.message||String(err));
    setActionState('mapAnalyzeBtn','error');
  }finally{
    btn.disabled=false;
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

$('calcBtn').addEventListener('click',()=>{
  if(!hasAnalysisData()){
    clearResultForecast();
    document.querySelector('[data-tab="result"]').click();
    return;
  }

  const finish=finishPrediction();
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
  // upper OCR result cards
  if($('ocrDistance')) $('ocrDistance').textContent='—';
  if($('ocrTime')) $('ocrTime').textContent='—';
  if($('ocrPace')) $('ocrPace').textContent='—';
  if($('ocrHr')) $('ocrHr').textContent='—';
  if($('ocrGain')) $('ocrGain').textContent='—';

  // lower editable fields
  if($('refDist')) $('refDist').value='';
  if($('refTime')) $('refTime').value='';
  if($('refPace')) $('refPace').value='';
  if($('refAvgHr')) $('refAvgHr').value='';

  // OCR stats
  if($('ocrRecognitionPercent')) $('ocrRecognitionPercent').textContent='0%';
  if($('ocrElapsedTime')) $('ocrElapsedTime').textContent='0.0 с';

  if($('ocrPreview')) $('ocrPreview').style.display='none';
  if($('ocrPreviewText')) $('ocrPreviewText').textContent='';

  state.bestTraining=null;
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

  return out;
}


function setMovingTimeFieldFromOCR(value){
  const el=$('refTime');
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

window.addEventListener('DOMContentLoaded',clearBestTrainingData);
