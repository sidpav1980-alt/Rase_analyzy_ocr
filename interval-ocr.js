// v0.0262: standalone Garmin interval OCR (up to 4 screenshots).
(function initIntervalOcrBlock(){
  const filesInput=document.getElementById('intervalOcrFiles');
  const pickBtn=document.getElementById('intervalOcrPickBtn');
  const photoList=document.getElementById('intervalOcrPhotoList');
  const status=document.getElementById('intervalOcrStatus');
  const results=document.getElementById('intervalOcrResults');
  const rowsEl=document.getElementById('intervalOcrRows');
  const copyBtn=document.getElementById('intervalOcrCopyAll');
  const copyStatus=document.getElementById('intervalOcrCopyStatus');
  const clearBtn=document.getElementById('intervalOcrClear');
  if(!filesInput||!photoList||!rowsEl) return;

  const found=new Map();
  let objectUrls=[];

  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function fmtDist(v){return Number(v).toFixed(2).replace('.',',')+' км';}
  function paceSecs(p){const m=String(p||'').match(/^(\d{1,2}):([0-5]\d)$/);return m?Number(m[1])*60+Number(m[2]):null;}
  function derivedTime(dist,pace){
    const ps=paceSecs(pace); if(!Number.isFinite(dist)||!ps) return '';
    const sec=dist*ps; const min=Math.floor(sec/60); const s=sec-min*60;
    return `${min}:${s.toFixed(1).padStart(4,'0')}`;
  }
  function normalizeRunWord(line){
    return line.replace(/(?:ber|6er|6ег|бeг|бег|beg|6eг|беr|bег)/ig,'Бег');
  }
  function parseRows(text){
    const out=[];
    const lines=String(text||'').split(/\n+/).map(x=>normalizeRunWord(x.trim())).filter(Boolean);
    for(const raw of lines){
      // Strictly require a numbered work row: "N Бег ...". Never infer an interval from "Всего".
      const head=raw.match(/^\s*(\d{1,2})\s*[.)-]?\s*Бег(?=\s|$)\s*(.*)$/i);
      if(!head) continue;
      const index=Number(head[1]); if(index<1||index>99) continue;
      const tail=head[2].replace(/,/g,'.').replace(/[|]/g,' ');

      // Pace is normally the last m:ss token in a Garmin interval row.
      const paces=[...tail.matchAll(/\b([2-9]|1[0-5])[:.]([0-5]\d)\b/g)];
      let pace='';
      if(paces.length){ const p=paces[paces.length-1]; pace=`${Number(p[1])}:${p[2]}`; }

      // Distance is a decimal km value, normally immediately before pace.
      const distMatches=[...tail.matchAll(/\b(\d{1,2}\.\d{1,3})\b/g)]
        .map(m=>({v:Number(m[1]),i:m.index})).filter(x=>x.v>=0.01&&x.v<=100);
      let distance=null;
      if(distMatches.length){
        // Prefer the last plausible decimal before the pace token.
        const pacePos=paces.length?paces[paces.length-1].index:Infinity;
        const before=distMatches.filter(x=>x.i<pacePos);
        const pick=(before.length?before:distMatches).slice(-1)[0];
        if(pick) distance=pick.v;
      }

      // Time: accept h:mm:ss(.d), m:ss(.d), or Garmin OCR variants with separators.
      let time='';
      const timeMatches=[...tail.matchAll(/\b(?:\d{1,2}:)?\d{1,2}[:.]\d{2}(?:[.,]\d)?\b/g)].map(m=>({t:m[0].replace(',', '.'),i:m.index}));
      if(timeMatches.length){
        const pacePos=paces.length?paces[paces.length-1].index:Infinity;
        const distPos=distMatches.length?distMatches[distMatches.length-1].i:Infinity;
        const candidates=timeMatches.filter(x=>x.i<Math.min(distPos,pacePos));
        if(candidates.length) time=candidates[0].t;
      }
      if(!time && distance!=null && pace) time=derivedTime(distance,pace);

      if(distance!=null && pace){ out.push({index,type:'Бег',distance,time,pace,raw}); }
    }
    return out;
  }

  function fmtHr(v){ return Number.isFinite(Number(v)) ? Math.round(Number(v))+' уд/мин' : '—'; }
  function fmtDuration(sec){
    sec=Math.max(0,Number(sec)||0);
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), ss=sec%60;
    if(h) return `${h}:${String(m).padStart(2,'0')}:${ss.toFixed(1).padStart(4,'0')}`;
    return `${m}:${ss.toFixed(1).padStart(4,'0')}`;
  }
  function parseTimeToken(t){
    const a=String(t||'').trim().replace(',', '.').split(':').map(Number);
    if(a.some(x=>!Number.isFinite(x))) return null;
    if(a.length===3) return a[0]*3600+a[1]*60+a[2];
    if(a.length===2) return a[0]*60+a[1];
    return null;
  }
  function loadImageForOcr(file){
    return new Promise((resolve,reject)=>{ const img=new Image(); const u=URL.createObjectURL(file); img.onload=()=>{URL.revokeObjectURL(u);resolve(img)}; img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('Не удалось открыть изображение'))}; img.src=u; });
  }
  function isBlue(r,g,b){ return b>125 && g>70 && b>r*1.35 && b>g*1.12 && r<135; }
  function isRed(r,g,b){ return r>145 && r>g*1.55 && r>b*1.35 && g<145; }
  function longestBands(counts,minCount,minLen=18){
    const out=[]; let st=-1;
    for(let i=0;i<=counts.length;i++){ const on=i<counts.length && counts[i]>=minCount; if(on&&st<0)st=i; if(!on&&st>=0){ if(i-st>=minLen)out.push([st,i-1]); st=-1; } }
    return out;
  }
  function fitLinear(points){
    if(points.length<2)return null; const n=points.length; let sx=0,sy=0,sxx=0,sxy=0;
    for(const [x,y] of points){sx+=x;sy+=y;sxx+=x*x;sxy+=x*y;} const d=n*sxx-sx*sx; if(Math.abs(d)<1e-9)return null;
    const a=(n*sxy-sx*sy)/d,b=(sy-a*sx)/n; return x=>a*x+b;
  }
  function ocrWords(result){ return Array.isArray(result?.data?.words)?result.data.words:[]; }
  function wordBox(w){ const b=w?.bbox||{}; return {x0:Number(b.x0)||0,x1:Number(b.x1)||0,y0:Number(b.y0)||0,y1:Number(b.y1)||0}; }
  function parsePaceWord(t){ const m=String(t||'').match(/^([2-9]|1[0-5]):([0-5]\d)$/); return m?Number(m[1])*60+Number(m[2]):null; }
  function parseGraphScreenshot(img,result,nextStartIndex){
    const W=img.naturalWidth||img.width,H=img.naturalHeight||img.height; if(!W||!H)return [];
    const maxW=900, scale=Math.min(1,maxW/W), cw=Math.round(W*scale),ch=Math.round(H*scale);
    const c=document.createElement('canvas'); c.width=cw;c.height=ch; const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0,cw,ch);
    const d=ctx.getImageData(0,0,cw,ch).data;
    const blueRows=new Array(ch).fill(0), redRows=new Array(ch).fill(0);
    for(let y=0;y<ch;y++){ for(let x=0;x<cw;x+=2){ const i=(y*cw+x)*4,r=d[i],g=d[i+1],b=d[i+2]; if(isBlue(r,g,b))blueRows[y]++; if(isRed(r,g,b))redRows[y]++; } }
    const blueBands=longestBands(blueRows,Math.max(8,cw*0.035),35).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));
    if(!blueBands.length) return []; const paceBand=blueBands[0];
    const redBands=longestBands(redRows,Math.max(8,cw*0.03),35).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0])); const hrBand=redBands[0]||null;
    const [py0,py1]=paceBand; const blueCols=new Array(cw).fill(0), topBlue=new Array(cw).fill(null);
    for(let x=0;x<cw;x++){ let cnt=0,top=null; for(let y=py0;y<=py1;y++){ const i=(y*cw+x)*4; if(isBlue(d[i],d[i+1],d[i+2])){cnt++; if(top==null)top=y;} } blueCols[x]=cnt;topBlue[x]=top; }
    const segments=longestBands(blueCols,Math.max(4,(py1-py0)*0.035),12); if(segments.length<2)return [];
    const minX=segments[0][0],maxX=segments[segments.length-1][1];
    const text=String(result?.data?.text||''); const timeTokens=[...text.matchAll(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d)?\b/g)].map(m=>({t:m[0],s:parseTimeToken(m[0])})).filter(x=>x.s&&x.s<6*3600);
    const total=timeTokens.length?Math.max(...timeTokens.map(x=>x.s)):null; if(!total)return [];
    // Tick labels from OCR words: left-side pace labels such as 4:10, 5:00, 5:50.
    const words=ocrWords(result), pacePts=[];
    for(const w of words){ const ps=parsePaceWord(String(w.text||'').trim()); if(ps==null)continue; const b=wordBox(w); const cy=(b.y0+b.y1)/2*scale; const cx=(b.x0+b.x1)/2*scale; if(cx<cw*0.24 && cy>py0-70 && cy<py1+70) pacePts.push([cy,ps]); }
    let paceMap=fitLinear(pacePts);
    // Fallback for Garmin chart when labels OCR poorly: infer 50 sec/tick from visible graph height, anchored by header average pace only as sanity.
    if(!paceMap){ paceMap=y=>240 + (y-py0)/Math.max(1,py1-py0)*180; }
    const work=segments.map(([a,b])=>{ const vals=[]; for(let x=a;x<=b;x++) if(topBlue[x]!=null) vals.push(paceMap(topBlue[x])); const med=vals.sort((x,y)=>x-y)[Math.floor(vals.length/2)]||null; return {a,b,len:b-a+1,paceSec:med}; });
    // Prefer long, faster plateaus; ignore warm-up/cool-down fragments.
    const maxLen=Math.max(...work.map(x=>x.len)); let picks=work.filter(x=>x.len>=maxLen*0.55 && x.paceSec!=null);
    if(picks.length<2) picks=[...work].sort((a,b)=>b.len-a.len).slice(0,2).sort((a,b)=>a.a-b.a); else picks=picks.sort((a,b)=>a.a-b.a);
    const hrPts=[]; let hrMap=null, topRed=null;
    if(hrBand){ const [hy0,hy1]=hrBand; for(const w of words){ const t=String(w.text||'').trim(); if(!/^\d{2,3}$/.test(t))continue; const v=Number(t); if(v<70||v>230)continue; const b=wordBox(w); const cy=(b.y0+b.y1)/2*scale,cx=(b.x0+b.x1)/2*scale; if(cx<cw*0.24&&cy>hy0-60&&cy<hy1+60)hrPts.push([cy,v]); } hrMap=fitLinear(hrPts); topRed=new Array(cw).fill(null); for(let x=0;x<cw;x++){ for(let y=hy0;y<=hy1;y++){ const i=(y*cw+x)*4;if(isRed(d[i],d[i+1],d[i+2])){topRed[x]=y;break;} } } }
    const arr=[]; let idx=nextStartIndex;
    for(const seg of picks){ const startSec=(seg.a-minX)/Math.max(1,maxX-minX)*total, endSec=(seg.b-minX)/Math.max(1,maxX-minX)*total; const dur=Math.max(1,endSec-startSec); const paceSec=Math.max(120,Math.min(900,seg.paceSec||300)); const dist=dur/paceSec; let avgHr=null,maxHr=null;
      if(hrMap&&topRed){ const hrs=[]; for(let x=seg.a;x<=seg.b;x++) if(topRed[x]!=null){const h=hrMap(topRed[x]); if(h>=70&&h<=230)hrs.push(h);} if(hrs.length){avgHr=hrs.reduce((a,b)=>a+b,0)/hrs.length;maxHr=Math.max(...hrs);} }
      arr.push({index:idx++,type:'Бег',distance:dist,time:fmtDuration(dur),pace:`${Math.floor(paceSec/60)}:${String(Math.round(paceSec%60)).padStart(2,'0')}`,avgHr,maxHr,approx:true,raw:'Garmin график'});
    }
    return arr;
  }

  function render(){
    const arr=[...found.values()].sort((a,b)=>a.index-b.index);
    rowsEl.innerHTML=arr.map(r=>`<tr><td>${r.index}</td><td>${r.approx?'Бег ≈':'Бег'}</td><td>${fmtDist(r.distance)}</td><td>${esc(r.time||'—')}</td><td>${esc(r.pace)}/км</td><td>${fmtHr(r.avgHr)}</td><td>${fmtHr(r.maxHr)}</td></tr>`).join('');
    results.hidden=!arr.length;
    if(arr.length){
      const nums=arr.map(r=>r.index);
      const gaps=[];
      for(let n=Math.min(...nums);n<=Math.max(...nums);n++) if(!found.has(n)) gaps.push(n);
      status.textContent=gaps.length?`Найдено ${arr.length} интервалов. Не найдены номера: ${gaps.join(', ')}.`:`Найдено ${arr.length} интервалов: ${Math.min(...nums)}–${Math.max(...nums)}.`;
      status.className='interval-ocr-status '+(gaps.length?'warn':'ok');
    }
  }

  function clearAll(){
    found.clear(); rowsEl.innerHTML=''; results.hidden=true; photoList.innerHTML=''; photoList.hidden=true;
    objectUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch{}}); objectUrls=[];
    filesInput.value=''; status.textContent=''; status.className='interval-ocr-status'; if(copyStatus) copyStatus.textContent='';
  }

  async function recognizeOne(file,slot){
    const url=URL.createObjectURL(file); objectUrls.push(url);
    const card=document.createElement('div'); card.className='interval-ocr-photo';
    card.innerHTML=`<div class="interval-ocr-photo-top"><b>Фото ${slot}</b><button type="button" class="btn secondary interval-ocr-toggle">Свернуть</button></div><div class="interval-ocr-photo-body"><img src="${url}" alt="Фото ${slot}"><div class="interval-ocr-photo-status">Ожидает распознавания…</div></div>`;
    photoList.appendChild(card);
    const body=card.querySelector('.interval-ocr-photo-body'); const toggle=card.querySelector('.interval-ocr-toggle'); const st=card.querySelector('.interval-ocr-photo-status');
    toggle.addEventListener('click',()=>{ const hidden=body.hidden=!body.hidden; toggle.textContent=hidden?'Развернуть':'Свернуть'; });
    try{
      if(!window.Tesseract?.recognize) throw new Error('Модуль OCR не загрузился');
      const result=await window.Tesseract.recognize(file,'rus+eng',{logger:m=>{if(m?.status==='recognizing text'&&Number.isFinite(m.progress)) st.textContent=`Распознаю… ${Math.round(m.progress*100)}%`;}});
      const text=String(result?.data?.text||'');
      const compact=text.replace(/\s+/g,' ').trim(); const lines=text.split(/\n+/).filter(x=>x.trim());
      if(compact.length>2600||lines.length>70) throw new Error('Слишком много текста — загрузите скриншот Garmin «Бег → Интервалы»');
      let parsed=parseRows(text);
      let graphMode=false;
      if(!parsed.length){
        const img=await loadImageForOcr(file);
        const nextIndex=found.size?Math.max(...found.keys())+1:1;
        parsed=parseGraphScreenshot(img,result,nextIndex);
        graphMode=parsed.length>0;
      }
      if(!parsed.length){ st.textContent='Не найдены строки «N Бег» и не удалось уверенно выделить рабочие отрезки на графике.'; st.className='interval-ocr-photo-status warn'; return; }
      for(const r of parsed){
        const old=found.get(r.index);
        if(!old || ((r.time?1:0)+(r.distance?1:0)+(r.pace?1:0) > (old.time?1:0)+(old.distance?1:0)+(old.pace?1:0))) found.set(r.index,r);
      }
      st.textContent=graphMode?`По графику найдено ${parsed.length} рабочих отрезка(ов). Значения приблизительные.`:`Найдены: ${parsed.map(r=>r.index+' Бег').join(', ')}`;
      st.className='interval-ocr-photo-status '+(graphMode?'approx':'ok'); render();
    }catch(e){ st.textContent=`Ошибка: ${e.message||e}`; st.className='interval-ocr-photo-status err'; }
  }

  let intervalOcrBusy=false;
  async function handleIntervalFiles(){
    if(intervalOcrBusy) return;
    let files=Array.from(filesInput.files||[]);
    if(!files.length){
      status.textContent='Фото не выбраны.'; status.className='interval-ocr-status warn';
      return;
    }
    if(files.length>4){
      status.textContent='Выбрано больше 4 фото — будут обработаны первые 4.';
      status.className='interval-ocr-status warn';
      files=files.slice(0,4);
    }
    intervalOcrBusy=true;
    // Не вызываем clearAll(): на iPhone сброс value у file-input в момент change может
    // обнулить выбор до того, как Safari закончит передавать файлы. Очищаем UI отдельно.
    found.clear(); rowsEl.innerHTML=''; results.hidden=true; photoList.innerHTML=''; photoList.hidden=false;
    objectUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch{}}); objectUrls=[];
    if(copyStatus) copyStatus.textContent='';
    status.textContent=`Выбрано ${files.length} фото. Начинаю распознавание…`;
    status.className='interval-ocr-status';
    try{
      // Сначала мгновенно показываем карточки/превью, затем OCR идёт по очереди.
      for(let i=0;i<files.length;i++) await recognizeOne(files[i],i+1);
      render();
    } finally {
      intervalOcrBusy=false;
      // Сброс после обработки позволяет повторно выбрать те же изображения.
      setTimeout(()=>{ try{filesInput.value='';}catch{} },0);
    }
  }
  // iOS Safari: сам file-input лежит поверх видимой кнопки/label.
  // Поэтому открытие медиатеки не зависит от JavaScript .click().
  filesInput.addEventListener('change',()=>{
    if(!intervalOcrBusy && filesInput.files?.length) handleIntervalFiles();
  });
  filesInput.addEventListener('input',()=>{
    if(!intervalOcrBusy && filesInput.files?.length) handleIntervalFiles();
  });

  copyBtn?.addEventListener('click',async()=>{
    const arr=[...found.values()].sort((a,b)=>a.index-b.index);
    if(!arr.length) return;
    const text=arr.map(r=>`${r.index} Бег${r.approx?' ≈':''} — ${fmtDist(r.distance)} — ${r.time||'—'} — ${r.pace}/км${Number.isFinite(Number(r.avgHr))?' — ср. пульс '+Math.round(r.avgHr):''}${Number.isFinite(Number(r.maxHr))?' — макс. '+Math.round(r.maxHr):''}`).join('\n');
    try{ await navigator.clipboard.writeText(text); if(copyStatus) copyStatus.textContent=`Скопировано ${arr.length} интервалов.`; }
    catch{ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); if(copyStatus) copyStatus.textContent=`Скопировано ${arr.length} интервалов.`; }
  });
  clearBtn?.addEventListener('click',clearAll);
})();
