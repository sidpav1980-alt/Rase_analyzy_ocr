/* ==========================================================================
   СИМУЛЯТОР ТРЕЙЛРАННЕРА: АРМАГЕДДОН — v1.03
   Vanilla JS, localStorage save. No frameworks.
   NOTE: all competitors are fictional characters — no real athletes are used.
   ========================================================================== */

/* ---------------------------- DATA: LEVELS ------------------------------ */
const LEVELS = [
  {name:"Парковый трейл", km:5, weather:"clear", tier:0, desc:"Лёгкий разогрев по дорожкам."},
  {name:"Лесная десятка", km:10, weather:"clear", tier:0, desc:"Первые камни и короткие спуски."},
  {name:"Грязевой полумарафон", km:21, weather:"rain", tier:1, desc:"Дождь и грязь, штрафуют слабую обувь."},
  {name:"Скальный забег", km:25, weather:"clear", tier:1, desc:"Камни и острые спуски — палки пригодятся."},
  {name:"Ночной трейл", km:30, weather:"cold", tier:1, desc:"Фонарь становится критичным."},
  {name:"Горный марафон", km:42, weather:"clear", tier:2, desc:"Длинные подъёмы, первый тест выносливости."},
  {name:"Хребет ветров", km:50, weather:"cold", tier:2, desc:"Ветер усиливает износ мембраны."},
  {name:"Ультра 60", km:60, weather:"heat", tier:2, desc:"Жара и длинные участки без воды."},
  {name:"Каменный лабиринт", km:70, weather:"clear", tier:3, desc:"Камни ускоряют износ обуви и палок."},
  {name:"Северный шторм", km:80, weather:"severe", tier:3, desc:"Дождь, ветер и холод — экипировка на пределе."},
  {name:"100 км классика", km:100, weather:"clear", tier:3, desc:"Первый настоящий ультратрейл."},
  {name:"Высотная сотня", km:110, weather:"cold", tier:3, desc:"Много набора и технический рельеф."},
  {name:"Чара. Первая уникальная трейл-экспедиция", km:138, weather:"mixed", tier:4,
    desc:"Чарские пески: 138 км, 4 пункта питания, длинные открытые участки.",
    special:"chara", aid:[27,54,82,109]},
  {name:"Дикий 130", km:130, weather:"cold", tier:4, desc:"Долгие ночные часы и риск поломок."},
  {name:"200 км пустошь", km:200, weather:"heat", tier:4, desc:"Жара — вода и питание решают всё."},
  {name:"Альпийский 250", km:250, weather:"cold", tier:4, desc:"Высокий износ, холодные ночи."},
  {name:"Трансгорный 300", km:300, weather:"severe", tier:5, desc:"Экипировка среднего класса уже на пределе."},
  {name:"Дикий пояс 400", km:400, weather:"cold", tier:5, desc:"Многосуточный забег — прочность решает."},
  {name:"Край света 500", km:500, weather:"severe", tier:5, desc:"Погода, сон и поломки складываются."},
  {name:"Безумие 700", km:700, weather:"severe", tier:6, desc:"Предфинальная гонка. Нужен высокий уровень."},
  {name:"АРМАГЕДДОН 1000", km:1000, weather:"severe", tier:6, special:"armageddon",
    desc:"Финал: 1000 км, ночь, жара, шторм и максимальный износ."}
];
// aid stations for non-special levels: every 50-70km
LEVELS.forEach((lv,i)=>{
  if(!lv.aid){
    if(lv.km<=20){ lv.aid=[]; }
    else{
      const stations=[]; let k=Math.min(45,Math.round(lv.km*0.35));
      while(k < lv.km-5){ stations.push(k); k+=55+Math.round(Math.random()*10); }
      lv.aid=stations;
    }
  }
});

/* ---------------------------- LEVEL BACKGROUND THEMES --------------------------- */
// one distinct visual theme per level; Chara (index 12) uses a real photo background.
const LEVEL_THEMES = [
  "t-park","t-forest","t-mud","t-rocky","t-night","t-alpine","t-windy","t-desert",
  "t-canyon","t-storm1","t-dusk","t-highalt","t-chara","t-wildnight","t-wasteland",
  "t-icealpine","t-stormpurple","t-violet","t-edgeworld","t-madness","t-armageddon"
];
const LEVEL_DECOR = [
  "","","rain","","stars","snow","wind","heat",
  "","storm","","snow","","stars","heat",
  "snow","storm","stars","storm","heat","storm"
];
function levelThemeClass(i){ return LEVEL_THEMES[i] || "t-park"; }
function levelDecorClass(i){ return LEVEL_DECOR[i] || ""; }

/* ---------------------------- DATA: GEAR --------------------------------- */
// each slot: 7 tiers -> [name, price, paceFactor(lower=faster), durabilityMax, breakRiskBase]
const GEAR_NAMES = {
  shoes:["Базовые кроссовки","Трейл Грип","Горный Про","Ультра Карбон","Армагеддон X","Гипер Трейл Про","Титан Спид X"],
  jacket:["Без мембраны","Лёгкая мембрана","Штормовая оболочка","Альпийский щит","Армагеддон Шелл","Экспедишн Шилд","Титан Шторм Армор"],
  poles:["Без палок","Алюминиевые палки","Карбон Трек","Ультра Карбон Трек","Армагеддон Трек","Вертикаль Про","Титан X"],
  lamp:["Простой фонарь","Найт 400","Найт 800","Ультра Луч","Recharge Pro X","Recharge Ultra 2000","Найт Реактор 3000"],
  watch:["Нет часов","GPS Старт","Трейл GPS","Endurance GPS","Ультра Про","Экспедишн Про","Армагеддон Про"],
  pack:["Старый рюкзак","Race Vest 5L","Ультра Vest 12L","Endurance Pack","Армагеддон Pack","Экспедишн 18L","Титан Ультра Pack"]
};
const GEAR = {};
Object.keys(GEAR_NAMES).forEach(slot=>{
  GEAR[slot]=GEAR_NAMES[slot].map((name,tier)=>({
    name, tier,
    price: tier===0?0:Math.round(350*Math.pow(2.15,tier)),
    paceFactor: +(1 - tier*0.028).toFixed(3),
    durabilityMax: 60+tier*140,
    breakRisk: +(0.03+tier*0.045).toFixed(3)
  }));
});
const SLOT_LABEL = {shoes:"👟 Кроссовки", jacket:"🧥 Мембрана", poles:"🥾 Палки", lamp:"🔦 Фонарь", watch:"⌚ Часы/пульсометр", pack:"🎒 Рюкзак/гидратор"};

/* ---------------------------- DATA: RESOURCES ---------------------------- */
const RES_PRICE = { water:60, gel:90, medkit:450, battery:300, guarana:250, blanket:600 };

/* ---------------------------- DATA: COACHES ------------------------------ */
const COACHES = [
  {id:"none", name:"Без тренера", price:0, cap:30, paceBonus:0, injuryCut:0},
  {id:"basic", name:"Базовый тренер", price:4000, cap:50, paceBonus:0.02, injuryCut:0.05},
  {id:"trail", name:"Трейл тренер", price:12000, cap:65, paceBonus:0.045, injuryCut:0.10},
  {id:"mountain", name:"Горный тренер", price:30000, cap:80, paceBonus:0.07, injuryCut:0.16},
  {id:"elite", name:"Elite Coach", price:70000, cap:100, paceBonus:0.10, injuryCut:0.25}
];

/* ---------------------------- DATA: RIVALS (fictional) -------------------
   All names below are entirely fictional and not modeled on real athletes.
   One rival ("Анна Кораблёва") has a hidden-form mechanic: her displayed
   ITRA never changes, but on some attempts she secretly performs like a
   much higher rating. This is a fictional game mechanic only. */
const RIVAL_BOSS = "Артём Волков";
const RIVAL_HIDDEN = "Анна Кораблёва";
const RIVALS = [
  {name:RIVAL_BOSS, itra:920, country:"🏔️", boss:true},
  {name:"Данила Беляков", itra:905, country:"🏔️"},
  {name:"Ольга Гришина", itra:890, country:"🏔️"},
  {name:"Emma Larsen", itra:900, country:"🌍"},
  {name:"Николай Тростенко", itra:865, country:"🏔️"},
  {name:"Роман Иванцов", itra:850, country:"🏔️"},
  {name:RIVAL_HIDDEN, itra:850, country:"🏔️", hiddenForm:true},
  {name:"Marco Bellini", itra:880, country:"🌍"},
  {name:"Марина Носова", itra:840, country:"🏔️"},
  {name:"Виктор Корытин", itra:835, country:"🏔️"},
  {name:"Егор Малюкин", itra:825, country:"🏔️"},
  {name:"Дмитрий Бабин", itra:815, country:"🏔️"},
  {name:"Степан Тарасенко", itra:805, country:"🏔️"},
  {name:"Виктория Жарова", itra:795, country:"🏔️"},
  {name:"Мария Голубева", itra:785, country:"🏔️"},
  {name:"Вера Черкасова", itra:775, country:"🏔️"}
];
const FILLER_FIRST=["Алекс","Максим","Кирилл","Павел","Игорь","Тимур","Слава","Артур","Юлия","Ксения","Анастасия","Дарья","Полина","Софья"];
const FILLER_LAST=["Орлов","Соколов","Лебедев","Морозов","Волчков","Зимин","Родин","Кузьмин","Санин","Белов","Громов","Ясная"];

const WEATHER_LABEL = {clear:"☀️ Ясно", rain:"🌧️ Дождь", heat:"🥵 Жара", cold:"🥶 Холод", severe:"⛈️ Тяжёлая погода", mixed:"🌗 Переменная"};
const WEATHER_WATER_MULT = {clear:1, rain:0.85, heat:1.5, cold:0.8, severe:1.15, mixed:1.15};
const WEATHER_TIME_MULT = {clear:1, rain:1.05, heat:1.08, cold:1.05, severe:1.15, mixed:1.08};
const WEATHER_HAZARD = {clear:1, rain:1.3, heat:1.4, cold:1.3, severe:1.8, mixed:1.4};

/* ---------------------------- STATE --------------------------------------- */
const SAVE_KEY = "trailArmageddonSave_v103";
function defaultState(){
  return {
    profile:{name:""},
    money:1500, level:1, xp:0, xpNext:100, itra:250, reputation:0, wins:0,
    fatigue:0, training:1, coachId:"none",
    campaignDone:0, completedLevels:[], slotsOwned:[true,true,true],
    gear:{shoes:0,jacket:0,poles:0,lamp:0,watch:0,pack:0},
    durability:{shoes:GEAR.shoes[0].durabilityMax,jacket:GEAR.jacket[0].durabilityMax,poles:GEAR.poles[0].durabilityMax,
      lamp:GEAR.lamp[0].durabilityMax,watch:GEAR.watch[0].durabilityMax,pack:GEAR.pack[0].durabilityMax},
    res:{water:0, gels:0, medkit:0, battery:0, guarana:0, blanket:0, lampCharge:100},
    restUntil:0, treatmentUntil:0, trainingUntil:0,
    currentLevel:0, achievements:[], champion:false
  };
}
let S = loadGame();
function loadGame(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  }catch(e){ return defaultState(); }
}
function saveGame(){
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(S)); }catch(e){ /* storage unavailable */ }
}

function coach(){ return COACHES.find(c=>c.id===S.coachId) || COACHES[0]; }
function trainingCap(){ return coach().cap; }
function xpForLevel(lvl){ return 90 + lvl*35; }
function addXP(n){
  S.xp+=n;
  while(S.xp>=S.xpNext){ S.xp-=S.xpNext; S.level++; S.xpNext=xpForLevel(S.level); }
}
function reputationBonus(){ return Math.min(30, Math.floor(S.reputation/10)) / 100; }

/* ---------------------------- HELPERS -------------------------------------- */
function fmtTime(sec){
  sec=Math.max(0,Math.round(sec));
  const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}
function fmtPace(secPerKm){
  const m=Math.floor(secPerKm/60), s=Math.round(secPerKm%60);
  return m+":"+String(s).padStart(2,"0")+" /км";
}
function rnd(a,b){ return a+Math.random()*(b-a); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function requiredWater(distanceKm, weather){ return Math.ceil(distanceKm * 0.3 * (WEATHER_WATER_MULT[weather]||1)); } // 0.5L bottles
function requiredGels(distanceKm){ return Math.ceil(distanceKm/12); }
function slotPrice(levelIndex){
  if(levelIndex<3) return 0;
  let base = 250*(levelIndex-1)*(levelIndex-1);
  if(levelIndex>=8) base*=3;
  return Math.round(base/50)*50;
}

/* ---------------------------- PLAYER PACE CALC ------------------------------ */
function gearAvgPaceFactor(){
  let f=1;
  Object.keys(S.gear).forEach(slot=>{
    const tier=GEAR[slot][S.gear[slot]];
    let factor=tier.paceFactor;
    const durRatio = S.durability[slot]/tier.durabilityMax;
    if(durRatio<0.3) factor += 0.06; // worn gear slows you down
    f *= (1 + (factor-1)/6); // spread influence across 6 slots
  });
  return f;
}
function gearMeetsTier(levelTier){
  // worst-equipped slot must be within 2 tiers of level requirement for hard checks (shoes/jacket/lamp)
  return true; // soft system: handled via risks, not hard block except missing mandatory items
}
function playerBaseSecPerKm(level){
  // ITRA-driven pace, same curve family as rivals, improved by training/coach
  let paceSecPerKm = 480 - (S.itra-250)*0.28;
  paceSecPerKm = clamp(paceSecPerKm, 220, 520);
  const trainFactor = 1 - (S.training/100)*0.22;
  const coachFactor = 1 - coach().paceBonus;
  const fatigueFactor = 1 + (S.fatigue/100)*0.30;
  const gearFactor = gearAvgPaceFactor();
  const weatherFactor = WEATHER_TIME_MULT[level.weather]||1;
  return paceSecPerKm * trainFactor * coachFactor * fatigueFactor * gearFactor * weatherFactor;
}
function distanceFatigueMult(km){ return 1 + km/800; }

/* ---------------------------- VIRTUAL FIELD --------------------------------- */
function finishSecForItra(itra, distanceKm, weather, varianceOverride){
  const paceSecPerKm = clamp(480-(itra-250)*0.28, 190, 520);
  const variance = varianceOverride!==undefined?varianceOverride:rnd(-0.06,0.06);
  return distanceKm*paceSecPerKm*distanceFatigueMult(distanceKm)*(WEATHER_TIME_MULT[weather]||1)*(1+variance);
}
function createVirtualField(levelIndex){
  const level=LEVELS[levelIndex];
  const field=[];
  const isChara = level.special==="chara";
  const isFinal = level.special==="armageddon";
  const advanced = levelIndex>=12;

  RIVALS.forEach(r=>{
    let include=false;
    if(r.boss) include = isFinal ? true : (advanced && Math.random()<0.35);
    else if(r.hiddenForm) include = isChara ? true : Math.random()<0.55;
    else include = Math.random() < (advanced?0.7:0.5);
    if(!include) return;

    let effItra = r.itra;
    let hiddenFormActive=false;
    if(r.hiddenForm){
      const chance = isChara?0.45:0.30;
      if(Math.random()<chance){ effItra = 950; hiddenFormActive=true; }
    }
    if(r.boss){
      const strongDay = Math.random() < (isFinal?0.72:0.55);
      effItra = strongDay ? 960 : 905;
    }
    let finishSec = finishSecForItra(effItra, level.km, level.weather);
    if(isChara) finishSec = Math.max(finishSec, 18*3600 + rnd(0,1800)); // no NPC beats 18:00:00 on Chara
    field.push({
      id:"r_"+r.name, name:r.name, itra:r.itra, country:r.country||"🏔️",
      boss:!!r.boss, hiddenFormActive, finishSec, liveKm:0, liveRank:0,
      dnf:false, dnfKm:null, dnfReason:null, finished:false,
      hazardScale: r.itra>=870 ? 0.35 : (r.itra>=820?0.7:1)
    });
  });
  // filler pack to make the field feel alive
  const fillerCount = 20 + Math.floor(levelIndex*1.4);
  for(let i=0;i<fillerCount;i++){
    const itra = Math.round(rnd(500, 800));
    let finishSec = finishSecForItra(itra, level.km, level.weather);
    if(isChara) finishSec = Math.max(finishSec, 18*3600+rnd(0,3600));
    field.push({
      id:"f_"+i, name:pick(FILLER_FIRST)+" "+pick(FILLER_LAST), itra, country:"🏔️",
      boss:false, hiddenFormActive:false, finishSec, liveKm:0, liveRank:0,
      dnf:false, dnfKm:null, dnfReason:null, finished:false,
      hazardScale: itra>=870?0.35:(itra>=820?0.7:1)
    });
  }
  return field;
}
function competitorProgressAt(npc, simSec, distanceKm){
  if(npc.dnf) return npc.liveKm;
  if(npc.finished) return distanceKm;
  const ratio = clamp(simSec/npc.finishSec, 0, 1);
  const jitterAmp = distanceKm*0.035*(1-ratio);
  const seed = (npc.id.charCodeAt(2)||1)+(npc.id.charCodeAt(npc.id.length-1)||2);
  const noise = Math.sin((simSec/240)+seed) * jitterAmp;
  return clamp(ratio*distanceKm + noise, 0, distanceKm);
}

/* ---------------------------- EVENT POOL ------------------------------------ */
const EVENT_POOL = [
  {emoji:"🪨", name:"Падение на камнях", penalty:180, kind:"neg"},
  {emoji:"🔥", name:"Потёртость", penalty:120, kind:"neg", healable:true},
  {emoji:"💧", name:"Проблема с водой", penalty:150, kind:"neg"},
  {emoji:"🍯", name:"Не зашёл гель", penalty:90, kind:"neg"},
  {emoji:"🧦", name:"Поломка снаряжения", penalty:240, kind:"gear"},
  {emoji:"🌊", name:"Брод", penalty:200, kind:"neg"},
  {emoji:"🌤️", name:"Второе дыхание", penalty:-180, kind:"pos"},
  {emoji:"🚀", name:"Отличный участок трассы", penalty:-240, kind:"pos"},
  {emoji:"🤝", name:"Помог другой бегун", penalty:-90, kind:"pos"}
];
const SEVERE_EVENTS = [
  {emoji:"🦴", name:"Перелом", reason:"перелом", fracture:true},
  {emoji:"🥶", name:"Переохлаждение", reason:"переохлаждение"},
  {emoji:"🥵", name:"Тепловой удар", reason:"перегрев"}
];

/* ---------------------------- RACE STATE ------------------------------------ */
let RACE = null;
let raceTimer = null;

function buildAidStations(level){
  return level.aid.map(km=>({km, visited:false}));
}

function startRace(){
  const level = LEVELS[S.currentLevel];
  if(!level) return;
  if(!canStartRace()) return;

  const guaranaUses = level.km<=100 ? 1 : (level.km<500 ? 2 : 4);
  RACE = {
    levelIndex:S.currentLevel, level, distanceKm:level.km, weather:level.weather,
    aid:buildAidStations(level), simSeconds:0, speed:parseInt(document.getElementById("speedSelect").value)||100,
    paused:false, playerKm:0, playerBaseSecPerKm: playerBaseSecPerKm(level),
    guaranaUsesLeft:guaranaUses, guaranaBoostKmLeft:0, guaranaRollbackKmLeft:0,
    field:createVirtualField(S.currentLevel), dnfQueue:[], eventsLog:[],
    overlayQueue:[], overlayShowing:false, playerDNF:false, playerFinished:false,
    playerPenaltySec:0, floodTriggered:false, gelsCarried:S.res.gels, gelsUsedInRace:0,
    waterCarried:S.res.water, waterUsedInRace:0
  };
  S.res.gels=0; S.res.water=0; // consumed items move into the race bag
  document.getElementById("btnStart").style.display="none";
  document.getElementById("bottomStart").classList.remove("show");
  raceTimer = setInterval(tick, 250);
  logEvent("▶ Старт гонки: "+level.name);
  renderRaceUI();
}

function canStartRace(){
  if(S.trainingUntil>Date.now() || S.restUntil>Date.now() || S.treatmentUntil>Date.now()) return false;
  if(!S.slotsOwned[S.currentLevel]) return false;
  return true;
}

function tick(){
  if(!RACE || RACE.paused || RACE.playerDNF || RACE.playerFinished) return;
  const simDelta = 0.25 * RACE.speed;
  RACE.simSeconds += simDelta;

  let paceFactor=1;
  if(RACE.guaranaBoostKmLeft>0) paceFactor*=0.8;
  if(RACE.guaranaRollbackKmLeft>0) paceFactor*=1.4;
  const paceSecPerKm = RACE.playerBaseSecPerKm*paceFactor;
  const kmDelta = simDelta/paceSecPerKm;
  RACE.playerKm = Math.min(RACE.playerKm+kmDelta, RACE.distanceKm);

  if(RACE.guaranaBoostKmLeft>0){
    RACE.guaranaBoostKmLeft-=kmDelta;
    if(RACE.guaranaBoostKmLeft<=0){
      RACE.guaranaBoostKmLeft=0;
      if(Math.random()<0.30){
        RACE.guaranaRollbackKmLeft=30;
        showEvent({emoji:"📉", name:"Спад после гуараны", penalty:0});
      }
    }
  }
  if(RACE.guaranaRollbackKmLeft>0) RACE.guaranaRollbackKmLeft=Math.max(0,RACE.guaranaRollbackKmLeft-kmDelta);

  applyWaterUsage(kmDelta);
  applyGelUsage(kmDelta);
  checkAidStations();
  maybeTriggerRandomEvent(kmDelta);

  if(RACE.level.special==="chara" && !RACE.floodTriggered && RACE.playerKm>=82){
    triggerCharaFloodEvent();
  }

  updateLiveDnfs(simDelta, kmDelta);
  updateRacePosition();
  renderRaceUI();

  if(RACE.playerKm>=RACE.distanceKm && !RACE.playerDNF){
    finishRace();
  }
}

function applyWaterUsage(kmDelta){
  const need = kmDelta*0.3*(WEATHER_WATER_MULT[RACE.weather]||1);
  RACE.waterUsedInRace+=need;
  if(RACE.waterCarried - RACE.waterUsedInRace < 0 && Math.random()<0.02*kmDelta){
    showEvent({emoji:"🥵", name:"Не хватает воды", penalty:200});
  }
}
function applyGelUsage(kmDelta){
  RACE._gelAcc = (RACE._gelAcc||0)+kmDelta;
  while(RACE._gelAcc>=12){
    RACE._gelAcc-=12;
    RACE.gelsUsedInRace++;
    if(RACE.gelsUsedInRace>RACE.gelsCarried){
      showEvent({emoji:"🍯", name:"Гелей не хватило", penalty:150});
    }
  }
}
function checkAidStations(){
  RACE.aid.forEach(st=>{
    if(!st.visited && RACE.playerKm>=st.km){
      st.visited=true;
      RACE.waterCarried += requiredWater(RACE.distanceKm, RACE.weather)/Math.max(1,RACE.aid.length);
      RACE.playerPenaltySec += 60;
      showEvent({emoji:"🚰", name:"Пункт питания "+st.km+" км: пополнил воду", penalty:60});
    }
  });
}

function maybeTriggerRandomEvent(kmDelta){
  const hazard = 0.006*kmDelta*(WEATHER_HAZARD[RACE.weather]||1);
  if(Math.random() < hazard){
    // small chance of a severe (player DNF-risk) event, mostly ordinary events
    if(Math.random() < 0.06 && RACE.playerKm>10){
      triggerSevereEvent();
    } else {
      const ev = pick(EVENT_POOL);
      let penalty = ev.penalty;
      if(ev.healable){
        if(S.res.medkitUses===undefined) S.res.medkitUses = S.res.medkit*3;
      }
      if(ev.emoji==="🔥"){ // потёртость uses medkit
        if(RACE._medkitLeft===undefined) RACE._medkitLeft = S.res.medkit;
        if(RACE._medkitLeft>0){ RACE._medkitLeft--; }
        else { penalty*=2; ev.name="Потёртость (аптечка пуста — хуже)"; }
      }
      if(ev.kind==="gear") applyGearWear(0.08);
      showEvent(ev);
      RACE.playerPenaltySec += Math.max(0,penalty);
      if(penalty<0) RACE.playerPenaltySec += penalty; // bonus reduces elapsed effectively via base pace credit
    }
  }
}

function triggerSevereEvent(){
  const ev = pick(SEVERE_EVENTS);
  const injuryCut = coach().injuryCut;
  if(Math.random() < injuryCut){ // coach helps avoid it
    showEvent({emoji:"🍀", name:"Едва избежал травмы (тренер помог)", penalty:60});
    return;
  }
  if(ev.reason==="перегрев" && RACE.weather!=="heat" && RACE.weather!=="severe") return;
  if(ev.reason==="переохлаждение" && RACE.weather!=="cold" && RACE.weather!=="severe" && RACE.weather!=="mixed") return;
  if(RACE.weather==="severe" && S.res.blanket>0 && Math.random()<0.5){
    S.res.blanket--;
    showEvent({emoji:"🆘", name:"Спас-одеяло спасло от DNF по погоде", penalty:300});
    return;
  }
  handlePlayerDNF(ev);
}

function applyGearWear(amount){
  const slots=Object.keys(S.gear);
  const slot=pick(slots);
  const tier=GEAR[slot][S.gear[slot]];
  S.durability[slot]=Math.max(0,S.durability[slot]-tier.durabilityMax*amount);
  if(S.durability[slot]<=0 && Math.random()<tier.breakRisk+0.15){
    S.durability[slot]=0;
    if(Math.random()<0.20){ S.gear[slot]=0; showEvent({emoji:"💥", name:SLOT_LABEL[slot]+" полностью сломан(а)", penalty:0}); }
    else showEvent({emoji:"⚠️", name:SLOT_LABEL[slot]+" изношен(а), нужен ремонт", penalty:0});
  }
}

/* ---------------------------- DNF LOGIC -------------------------------------- */
function updateLiveDnfs(simDelta, kmDelta){
  RACE.field.forEach(npc=>{
    if(npc.dnf || npc.finished) return;
    if(RACE.simSeconds>=npc.finishSec){ npc.finished=true; npc.liveKm=RACE.distanceKm; return; }
    const hazardPerSec = 0.00003*(WEATHER_HAZARD[RACE.weather]||1)*npc.hazardScale;
    if(Math.random() < hazardPerSec*simDelta){
      npc.dnf=true;
      npc.liveKm = competitorProgressAt(npc, RACE.simSeconds, RACE.distanceKm);
      npc.dnfKm = +npc.liveKm.toFixed(1);
      npc.dnfReason = pick(["падение","травма","сход по погоде","истощение"]);
      RACE.dnfQueue.push(npc);
      if(RACE.dnfQueue.length>=5) flushDnfBatch();
    }
  });
}
function flushDnfBatch(){
  if(!RACE.dnfQueue.length) return;
  const batch = RACE.dnfQueue.splice(0, RACE.dnfQueue.length);
  const lines = batch.map(n=>n.name+" — "+n.dnfKm+" км").join("\n");
  logEvent("🚫 Сошли "+batch.length+" участник(ов):\n"+lines);
  queueRaceOverlay({type:"dnfbatch", title:"🚫 Сошли "+batch.length+" участников", lines:batch.map(n=>n.name+" — "+n.dnfKm+" км")});
}

function triggerCharaFloodEvent(){
  RACE.floodTriggered = true;
  const active = RACE.field.filter(n=>!n.dnf && !n.finished);
  const affected = active.filter(()=>Math.random()<0.70);
  affected.forEach(n=>{
    n.dnf=true; n.liveKm=82; n.dnfKm=82; n.dnfReason="река разлилась";
  });
  RACE.playerPenaltySec += 20*60;
  logEvent("🌊 РЕКА РАЗЛИЛАСЬ на 82 км. DNF: "+affected.length+" участник(ов). Игрок нашёл обход (+20:00).");
  RACE.paused = true;
  queueRaceOverlay({
    type:"flood",
    title:"🌊 РЕКА РАЗЛИЛАСЬ",
    subtitle:"Список DNF из-за разлива · всего "+affected.length,
    lines: affected.map((n,i)=>(i+1)+". "+n.name+" — 82.0 км"),
    footer:"Игрок нашёл обход · +20:00",
    holdMs: 5000,
    onDone: ()=>{ RACE.paused=false; }
  });
}

/* ---------------------------- GUARANA ---------------------------------------- */
function useGuarana(){
  if(!RACE || RACE.playerDNF || RACE.playerFinished){
    openResourcesAndHighlight("guarana");
    return;
  }
  if(S.res.guarana<=0 || RACE.guaranaUsesLeft<=0){
    openResourcesAndHighlight("guarana");
    return;
  }
  S.res.guarana--; RACE.guaranaUsesLeft--;
  if(Math.random()<0.60){
    RACE.guaranaBoostKmLeft = 20;
    showEvent({emoji:"🫘", name:"Гуарана сработала! Буст на 20 км", penalty:0});
  } else {
    showEvent({emoji:"🫘", name:"Гуарана не сработала", penalty:0});
  }
  renderRaceUI();
}
function openResourcesAndHighlight(key){
  showView("resources");
  setTimeout(()=>{
    const el=document.getElementById("res_"+key);
    if(el){ el.scrollIntoView({behavior:"smooth", block:"center"}); el.classList.add("glow"); setTimeout(()=>el.classList.remove("glow"),2000); }
  }, 60);
}

/* ---------------------------- POSITION --------------------------------------- */
function updateRacePosition(){
  const all = RACE.field.filter(n=>!n.dnf).map(n=>{
    n.liveKm = n.finished ? RACE.distanceKm : competitorProgressAt(n, RACE.simSeconds, RACE.distanceKm);
    return n;
  });
  all.push({id:"player", name:S.profile.name||"Трейлраннер", isPlayer:true, liveKm:RACE.playerKm, finished:RACE.playerFinished, finishSec:RACE.simSeconds});
  all.sort((a,b)=> b.liveKm - a.liveKm);
  all.forEach((n,i)=>{ n.liveRank=i+1; if(n.isPlayer) RACE.playerRank=i+1; });
  RACE.liveField = all;
}

/* ---------------------------- FINISH / DNF ------------------------------------ */
function handlePlayerDNF(ev){
  RACE.playerDNF = true;
  RACE.paused = true;
  clearInterval(raceTimer);
  RACE.overlayQueue = [];
  const dnfKm = +RACE.playerKm.toFixed(1);
  logEvent("⛔ DNF игрока: "+ev.name+" на "+dnfKm+" км");
  S.fatigue = clamp(S.fatigue+25,0,100);
  if(ev.fracture){
    S.treatmentUntil = Date.now() + 5*60*1000;
  }
  saveGame();
  renderRaceUI();
  showFinishSummary({dnf:true, reason:ev.name, dnfKm});
}

function finishRace(){
  RACE.playerFinished = true;
  RACE.paused = true;
  clearInterval(raceTimer);
  flushDnfBatch();
  updateRacePosition();

  const finishSec = RACE.simSeconds + RACE.playerPenaltySec;
  const finishers = RACE.field.filter(n=>!n.dnf);
  finishers.forEach(n=>{ if(!n.finishSec) n.finishSec = n.finishSec; });
  const ranked = finishers.map(n=>({name:n.name, sec:n.finishSec}))
    .concat([{name:S.profile.name||"Трейлраннер", sec:finishSec, isPlayer:true}])
    .sort((a,b)=>a.sec-b.sec);
  const place = ranked.findIndex(r=>r.isPlayer)+1;
  const totalFinishers = ranked.length;

  const level = RACE.level;
  const baseReward = Math.round(level.km*35 + level.km*level.km*0.4);
  const posMultiplier = clamp(1.3 - (place-1)/Math.max(4,totalFinishers*0.5)*0.9, 0.35, 1.3);
  const reward = Math.round(baseReward*posMultiplier*(1+reputationBonus()));
  S.money += reward;
  addXP(Math.round(20+level.km*0.6));
  S.itra = Math.round(clamp(S.itra + (place<=3?8:(place<=10?3:1)) - (place>totalFinishers*0.6?2:0), 200, 999));
  S.reputation += place===1?4:(place<=3?2:1);
  if(place===1) S.wins++;

  Object.keys(S.gear).forEach(slot=>{
    const tier=GEAR[slot][S.gear[slot]];
    S.durability[slot]=Math.max(0, S.durability[slot]-tier.durabilityMax*(0.08+level.km/2000));
  });
  S.res.guarana = S.res.guarana; // unchanged, already decremented on use

  if(!S.completedLevels.includes(S.currentLevel)) S.completedLevels.push(S.currentLevel);
  S.campaignDone = S.completedLevels.length;
  const nextIdx = S.currentLevel+1;
  if(nextIdx<LEVELS.length && !S.slotsOwned[nextIdx] && nextIdx<3) S.slotsOwned[nextIdx]=true;
  if(level.special==="armageddon" && S.completedLevels.length>=21) S.champion=true;

  saveGame();
  const top3 = ranked.slice(0,3);
  showFinishSummary({dnf:false, place, totalFinishers, reward, top3, ranked});
}

function showFinishSummary(data){
  const host = document.getElementById("raceOverlayHost");
  let html = "";
  if(data.dnf){
    html += `<div class="overlay"><b>⛔ DNF</b><br>Причина: ${data.reason}<br>Сошёл на ${data.dnfKm} км.<br>Награда не начислена.</div>`;
  } else {
    html += `<div class="overlay"><b>🏁 Финиш!</b><br>Место: ${data.place} / ${data.totalFinishers}<br>Награда: ₽ ${data.reward.toLocaleString("ru-RU")}<br></div>`;
    html += `<div class="overlay"><b>🏆 ТОП-3 · время финиша</b><br>`;
    const medals=["🥇","🥈","🥉"];
    data.top3.forEach((r,i)=>{ html += medals[i]+" "+(i+1)+". "+r.name+" — "+fmtTime(r.sec)+"<br>"; });
    html += `</div>`;
    if(S.champion){ html += `<div class="overlay"><b>👑 ЧЕМПИОН АРМАГЕДДОНА!</b><br>Кампания пройдена 21/21.</div>`; }
  }
  host.innerHTML = html + host.innerHTML;
  document.getElementById("btnStart").style.display="";
  renderStatbar(); renderCampaign(); renderRaceView();
}

/* ---------------------------- EVENTS / OVERLAY QUEUE --------------------------- */
function logEvent(text){
  if(!RACE) return;
  RACE.eventsLog.unshift({t:fmtTime(RACE.simSeconds), text});
  const el = document.getElementById("eventsLog");
  if(el){
    el.innerHTML = RACE.eventsLog.slice(0,80).map(e=>`<div class="ev"><b>${e.t}</b> ${e.text.replace(/\n/g,"<br>")}</div>`).join("");
  }
}
function showEvent(ev){
  logEvent(ev.emoji+" "+ev.name+(ev.penalty?" ("+(ev.penalty>0?"+":"")+Math.round(ev.penalty)+"с)":""));
  queueRaceOverlay({type:"event", title:ev.emoji+" "+ev.name, holdMs:2000});
}
function queueRaceOverlay(item){
  RACE.overlayQueue.push(item);
  if(!RACE.overlayShowing) drainOverlayQueue();
}
function drainOverlayQueue(){
  if(!RACE || !RACE.overlayQueue.length){ if(RACE) RACE.overlayShowing=false; return; }
  RACE.overlayShowing = true;
  const item = RACE.overlayQueue.shift();
  const host = document.getElementById("raceOverlayHost");
  const div = document.createElement("div");
  if(item.type==="flood"){
    div.className="overlay flood";
    div.innerHTML = `<div class="flood-title">${item.title}<br><span style="font-weight:400;font-size:11px">${item.subtitle}</span></div>
      <div class="flood-list">${item.lines.map(l=>`<div>${l}</div>`).join("")}</div>
      <div class="flood-foot">${item.footer}</div>`;
  } else if(item.type==="dnfbatch"){
    div.className="overlay";
    div.innerHTML = `<b>${item.title}</b><br>`+item.lines.map(l=>`<div>${l}</div>`).join("");
  } else {
    div.className="overlay";
    div.innerHTML = `<b>${item.title}</b>`;
  }
  host.prepend(div);
  const hold = item.holdMs || 2000;
  setTimeout(()=>{
    div.remove();
    if(item.onDone) item.onDone();
    drainOverlayQueue();
  }, hold);
}

/* ---------------------------- RENDER: STATBAR ---------------------------------- */
function renderStatbar(){
  const el = document.getElementById("statbar");
  el.innerHTML = `
    <div class="stat">Уровень<b>${S.level}</b>${S.xp}/${S.xpNext} XP</div>
    <div class="stat">Рубли<b>₽ ${S.money.toLocaleString("ru-RU")}</b></div>
    <div class="stat">Пройдено<b>${S.campaignDone} / 21</b></div>
    <div class="stat">Репутация<b>${S.reputation}</b>+${Math.min(30,Math.floor(S.reputation/10))}%</div>
    <div class="stat">Победы<b>${S.wins}</b></div>
    <div class="stat">Усталость<b>${S.fatigue}%</b></div>
    <div class="stat">Тренированность<b>${S.training} / ${trainingCap()}</b></div>
    <div class="stat">ITRA<b>${S.itra}</b></div>
  `;
}

/* ---------------------------- RENDER: RACE (pre-start) -------------------------- */
function computeRisks(){
  const level = LEVELS[S.currentLevel];
  const risks = [];
  if(!S.slotsOwned[S.currentLevel]){
    risks.push({key:"slot", text:"⛔ 🎟️ Нужен слот на гонку · ₽ "+slotPrice(S.currentLevel).toLocaleString("ru-RU"), ok:false, go:"slot"});
  }
  const needWater = requiredWater(level.km, level.weather);
  if(S.res.water < needWater) risks.push({key:"water", text:"💧 Не хватает воды: есть "+S.res.water+"/"+needWater, ok:false, go:"carry"});
  const needGels = requiredGels(level.km);
  if(S.res.gels < needGels) risks.push({key:"gels", text:"🍯 Не хватает гелей «УГЛИ»: есть "+S.res.gels+"/"+needGels, ok:false, go:"carry"});
  if(S.res.medkit < 1) risks.push({key:"medkit", text:"🩹 Нет аптечки", ok:false, go:"carry"});
  if(level.weather!=="clear" && S.res.blanket<1 && level.km>=100) risks.push({key:"blanket", text:"🆘 Нет спас-одеяла на сложную погоду", ok:false, go:"carry"});
  if((S.currentLevel>=4) && S.res.lampCharge<40 && S.res.battery<1){
    risks.push({key:"battery", text:"🔦 Питание фонаря низкое, запасных батарей нет", ok:false, go:"lamp"});
  }
  if(S.treatmentUntil>Date.now()) risks.push({key:"treat", text:"🏥 Идёт лечение — старт заблокирован", ok:false, go:"rest"});
  if(S.trainingUntil>Date.now()) risks.push({key:"train", text:"🏋️ Идёт тренировка — старт заблокирован", ok:false, go:"training"});
  if(S.restUntil>Date.now()) risks.push({key:"rest", text:"😴 Идёт отдых — старт заблокирован", ok:false, go:"rest"});
  if(S.fatigue>=70) risks.push({key:"fatigue", text:"😓 Высокая усталость ("+S.fatigue+"%) — стоит отдохнуть", ok:false, go:"rest"});
  return risks;
}
function ensure3DInit(){
  if(!window.Race3D || window._race3dInited) return;
  const host = document.getElementById("scene3d");
  if(!host) return;
  window.Race3D.init(host);
  window._race3dInited = true;
}
function renderRaceView(){
  ensure3DInit();
  const level = LEVELS[S.currentLevel];
  document.getElementById("raceLevelTitle").textContent = "Уровень "+(S.currentLevel+1)+": "+level.name;
  if(window.Race3D){
    window.Race3D.setLevel(S.currentLevel);
    window.Race3D.setRainActive(level.weather==="rain" || level.weather==="severe" || level.weather==="mixed");
    window.Race3D.setProgress(RACE ? (RACE.playerKm/RACE.distanceKm*100) : 0);
  }
  const mapEl = document.getElementById("raceMap");
  mapEl.className = "race-map "+levelThemeClass(S.currentLevel);
  const decor = levelDecorClass(S.currentLevel);
  let decorHost = document.getElementById("raceMapDecor");
  if(!decorHost){
    decorHost = document.createElement("div");
    decorHost.id = "raceMapDecor";
    decorHost.className = "map-decor";
    mapEl.prepend(decorHost);
  }
  decorHost.className = "map-decor "+(decor?"decor-"+decor:"");
  if(decorHost.dataset.builtFor!==decor){ decorHost.innerHTML=""; decorHost.dataset.builtFor=decor; decorHost.dataset.built=""; }
  if(decor==="stars" && !decorHost.dataset.built){
    decorHost.dataset.built="1";
    for(let i=0;i<28;i++){
      const s=document.createElement("span");
      s.className="star"; s.style.left=Math.random()*100+"%"; s.style.top=Math.random()*70+"%";
      s.style.animationDelay=(Math.random()*3).toFixed(2)+"s";
      decorHost.appendChild(s);
    }
  }
  if(decor==="snow" && !decorHost.dataset.built){
    decorHost.dataset.built="1";
    for(let i=0;i<20;i++){
      const s=document.createElement("span");
      s.className="flake"; s.style.left=Math.random()*100+"%";
      s.style.animationDuration=(4+Math.random()*4).toFixed(2)+"s";
      s.style.animationDelay=(Math.random()*4).toFixed(2)+"s";
      decorHost.appendChild(s);
    }
  }
  const risks = computeRisks();
  const risksEl = document.getElementById("raceRisks");
  risksEl.innerHTML = risks.length
    ? risks.map(r=>`<div class="risk" data-go="${r.go}">${r.text}</div>`).join("")
    : `<div class="risk ok">✅ Готов к гонке</div>`;
  risksEl.querySelectorAll(".risk[data-go]").forEach(elm=>{
    elm.onclick = ()=>showView(elm.dataset.go);
  });
  const blocked = risks.some(r=>["slot","treat","train","rest"].includes(r.key));
  document.getElementById("btnStart").disabled = blocked;
  document.getElementById("btnStart").style.opacity = blocked?0.5:1;
  document.getElementById("btnBuySlot").style.display = S.slotsOwned[S.currentLevel]?"none":"inline-block";
  document.getElementById("btnBuySlot").textContent = "Купить · ₽ "+slotPrice(S.currentLevel).toLocaleString("ru-RU");
  document.getElementById("gelInRace").textContent = "🍯 Гели в гонке: "+(RACE?RACE.gelsUsedInRace:0)+" / "+(RACE?RACE.gelsCarried:S.res.gels);
  document.getElementById("guaranaCount").textContent = "· "+S.res.guarana+" шт.";
  if(!RACE || RACE.playerFinished || RACE.playerDNF){
    document.getElementById("top7").innerHTML="";
    document.getElementById("trackFill").style.width="0%";
    document.getElementById("playerDot").style.left="0%";
    document.getElementById("raceMetrics").innerHTML="";
  }
}
function renderRaceUI(){
  if(!RACE) return;
  const pct = (RACE.playerKm/RACE.distanceKm*100).toFixed(1);
  document.getElementById("trackFill").style.width = pct+"%";
  document.getElementById("playerDot").style.left = pct+"%";
  document.getElementById("gelInRace").textContent = "🍯 Гели в гонке: "+RACE.gelsUsedInRace+" / "+RACE.gelsCarried;

  const top7 = (RACE.liveField||[]).slice(0,7);
  document.getElementById("top7").innerHTML = top7.map(n=>
    `<div class="row ${n.isPlayer?'me':''}">${n.liveRank}. ${n.isPlayer?"🔴 "+n.name:n.country+" "+n.name}<span>${n.liveKm.toFixed(1)} км</span></div>`
  ).join("");

  const paceFactor = RACE.guaranaBoostKmLeft>0?0.8:(RACE.guaranaRollbackKmLeft>0?1.4:1);
  document.getElementById("raceMetrics").innerHTML = `
    <div>Темп<b>${fmtPace(RACE.playerBaseSecPerKm*paceFactor)}</b></div>
    <div>Позиция<b>${RACE.playerRank||"—"} / ${(RACE.liveField||[]).length}</b></div>
    <div>Дистанция<b>${RACE.playerKm.toFixed(1)} / ${RACE.distanceKm} км</b></div>
    <div>Время<b>${fmtTime(RACE.simSeconds)}</b></div>
    <div>Погода<b>${WEATHER_LABEL[RACE.weather]}</b></div>
    <div>Штрафы<b>+${fmtTime(RACE.playerPenaltySec)}</b></div>
  `;
  renderTop14();
  document.getElementById("guaranaCount").textContent = "· "+S.res.guarana+" шт. (в гонке "+RACE.guaranaUsesLeft+")";
  if(window.Race3D) window.Race3D.setProgress(pct);
}
function renderTop14(){
  const el = document.getElementById("top14");
  if(!RACE){ el.innerHTML=""; return; }
  const list = (RACE.liveField||[]).slice(0,14);
  el.innerHTML = list.map(n=>
    `<div class="row ${n.isPlayer?'me':''}">${n.liveRank}. ${n.isPlayer?"Вы — "+n.name:n.name}<span>${n.liveKm.toFixed(1)} км</span></div>`
  ).join("") +
  (RACE.field.filter(n=>n.dnf).length?`<p class="hint">🚫 Сошли: ${RACE.field.filter(n=>n.dnf).length}</p>`:"");
}

/* ---------------------------- RENDER: CARRY ------------------------------------ */
function renderCarry(){
  const level = LEVELS[S.currentLevel];
  const needWater = requiredWater(level.km, level.weather);
  const needGels = requiredGels(level.km);
  const el = document.getElementById("carryList");
  el.innerHTML = `
    <div class="shop-item">
      <h3>🍯 Гели «УГЛИ»</h3>
      <p>Есть: ${S.res.gels} · нужно по дистанции: ${needGels}</p>
      <button data-buy="gel-tonorm">Докупить до нормы</button>
    </div>
    <div class="shop-item">
      <h3>🩹 Аптечка</h3>
      <p>Комплектов: ${S.res.medkit} · бинт, марля, перекись, пластырь, крем от натирания, крем от солнца, спас-одеяло</p>
      <button data-buy="medkit-1">Докупить 1 комплект (₽ ${RES_PRICE.medkit})</button>
    </div>
    <div class="shop-item">
      <h3>💧 Вода</h3>
      <p>Есть: ${S.res.water} · нужно по погоде и дистанции: ${needWater}</p>
      <button data-buy="water-tonorm">Докупить до нормы</button>
    </div>
    <div class="shop-item">
      <h3>🆘 Спас-одеяло</h3>
      <p>Есть: ${S.res.blanket} шт. · 50/50 против погодного DNF</p>
      <button data-buy="blanket-1">Докупить 1 шт. (₽ ${RES_PRICE.blanket})</button>
    </div>
  `;
  el.querySelectorAll("[data-buy]").forEach(btn=>{
    btn.onclick = ()=>{
      const [what,qty]=btn.dataset.buy.split("-");
      if(what==="gel"){ const need=Math.max(0,needGels-S.res.gels); buyRes("gel",need); }
      if(what==="water"){ const need=Math.max(0,needWater-S.res.water); buyRes("water",need); }
      if(what==="medkit") buyRes("medkit",1);
      if(what==="blanket") buyRes("blanket",1);
      renderCarry(); renderStatbar(); renderRaceView();
    };
  });
}
function buyRes(key,qty){
  const price = RES_PRICE[key]*qty;
  if(qty<=0) return;
  if(S.money<price){ alert("НЕ ХВАТАЕТ ₽ — можно переиграть старые уровни и заработать."); return; }
  S.money-=price; S.res[key]+=qty; saveGame();
}

/* ---------------------------- RENDER: CAMPAIGN --------------------------------- */
function renderCampaign(){
  document.getElementById("campaignProgress").textContent = "Пройдено "+S.campaignDone+" / 21";
  const el = document.getElementById("campaignList");
  el.innerHTML = LEVELS.map((lv,i)=>{
    const done = S.completedLevels.includes(i);
    const current = i===S.currentLevel;
    const locked = i>0 && !S.completedLevels.includes(i-1) && !done && i> (Math.max(0,...S.completedLevels, -1)+1);
    const cls = done?"done":(current?"current":(locked?"locked":""));
    return `<div class="lvl ${cls}">
      <div><b>${i+1}. ${lv.name}</b>${lv.km} км · ${WEATHER_LABEL[lv.weather]} ${done?"· ✅":""}</div>
      <button data-lvl="${i}">${current?"Выбран":"Выбрать"}</button>
    </div>`;
  }).join("");
  el.querySelectorAll("[data-lvl]").forEach(btn=>{
    btn.onclick = ()=>{
      if(RACE && !RACE.playerFinished && !RACE.playerDNF){ alert("Во время активной гонки переключение кампании запрещено."); return; }
      S.currentLevel = parseInt(btn.dataset.lvl);
      RACE=null; saveGame();
      renderCampaign(); showView("race");
    };
  });
}

/* ---------------------------- RENDER: EQUIPMENT / REPAIR ------------------------ */
function renderEquipment(){
  const el = document.getElementById("equipmentShop");
  el.innerHTML = Object.keys(GEAR).map(slot=>{
    const tiers = GEAR[slot].map((t,i)=>{
      const equipped = S.gear[slot]===i;
      return `<div class="tier ${equipped?'equipped':''}">
        <span>${t.name} (ур.${i+1})</span>
        <span>${equipped?"✅ надето":(t.price===0?`<button data-eq="${slot}:${i}">Надеть</button>`:`₽ ${t.price.toLocaleString("ru-RU")} <button data-eq="${slot}:${i}">Купить/надеть</button>`)}</span>
      </div>`;
    }).join("");
    return `<div class="shop-item"><h3>${SLOT_LABEL[slot]}</h3>${tiers}</div>`;
  }).join("");
  el.querySelectorAll("[data-eq]").forEach(btn=>{
    btn.onclick=()=>{
      const [slot,tierStr]=btn.dataset.eq.split(":"); const tier=parseInt(tierStr);
      const t=GEAR[slot][tier];
      if(S.gear[slot]===tier) return;
      if(t.price>0 && S.money<t.price){ alert("НЕ ХВАТАЕТ ₽"); return; }
      if(t.price>0) S.money-=t.price;
      S.gear[slot]=tier; S.durability[slot]=t.durabilityMax;
      saveGame(); renderEquipment(); renderStatbar(); renderRaceView();
    };
  });
}
function renderRepair(){
  const el = document.getElementById("repairList");
  el.innerHTML = Object.keys(S.gear).map(slot=>{
    const t=GEAR[slot][S.gear[slot]];
    const pct = Math.round(S.durability[slot]/t.durabilityMax*100);
    const cost = Math.round(t.price*0.25*(1-pct/100)) || 50;
    return `<div class="repair-item">
      <b>${SLOT_LABEL[slot]} — ${t.name}</b>
      <div class="durability-bar"><i style="width:${pct}%;background:${pct<30?'#ff5d5d':pct<60?'#ffb020':'#3ddc84'}"></i></div>
      <p>Прочность: ${pct}%</p>
      ${pct<100?`<button data-repair="${slot}">Починить (₽ ${cost.toLocaleString("ru-RU")})</button>`:"<p class='hint'>В порядке</p>"}
    </div>`;
  }).join("");
  el.querySelectorAll("[data-repair]").forEach(btn=>{
    btn.onclick=()=>{
      const slot=btn.dataset.repair; const t=GEAR[slot][S.gear[slot]];
      const pct = S.durability[slot]/t.durabilityMax;
      const cost = Math.round(t.price*0.25*(1-pct)) || 50;
      if(S.money<cost){ alert("НЕ ХВАТАЕТ ₽"); return; }
      S.money-=cost; S.durability[slot]=t.durabilityMax;
      saveGame(); renderRepair(); renderStatbar();
    };
  });
}
document.addEventListener("click", e=>{
  if(e.target && e.target.id==="btnRepairAll"){
    Object.keys(S.gear).forEach(slot=>{ S.durability[slot]=GEAR[slot][S.gear[slot]].durabilityMax; });
    saveGame(); renderRepair(); renderStatbar();
  }
});

/* ---------------------------- RENDER: RESOURCES / LAMP -------------------------- */
function renderResources(){
  const el = document.getElementById("resourcesShop");
  const rows = [
    ["water","💧 Вода (0.5л)"],["gel","🍯 Гели «УГЛИ»"],["medkit","🩹 Комплект аптечки"],
    ["battery","🔋 Запасной АКБ"],["guarana","🫘 Гуарана"],["blanket","🆘 Спас-одеяло"]
  ];
  el.innerHTML = rows.map(([key,label])=>`
    <div class="res-item" id="res_${key}">
      <b>${label}</b> — есть: ${S.res[key]} · ₽ ${RES_PRICE[key]}/шт.
      <div><button data-res="${key}:1">+1</button> <button data-res="${key}:5">+5</button></div>
    </div>
  `).join("");
  el.querySelectorAll("[data-res]").forEach(btn=>{
    btn.onclick=()=>{ const [key,qty]=btn.dataset.res.split(":"); buyRes(key,parseInt(qty)); renderResources(); renderStatbar(); renderRaceView(); };
  });
}
function renderLamp(){
  const el=document.getElementById("lampPanel");
  el.innerHTML = `
    <p>Фонари 1–4 уровня работают на батарейках. Фонари 5–7 уровня — на аккумуляторе.</p>
    <div class="res-item">АКБ ${S.res.lampCharge}% · запасных АКБ: ${S.res.battery}
      ${S.res.lampCharge<100 && S.res.battery>0?`<div><button id="btnSwapBattery">🔋 Поставить заряженный АКБ</button></div>`:""}
    </div>
  `;
  const swap=document.getElementById("btnSwapBattery");
  if(swap) swap.onclick=()=>{ S.res.battery--; S.res.lampCharge=100; saveGame(); renderLamp(); renderRaceView(); };
}

/* ---------------------------- RENDER: REST / TREATMENT / TRAINING --------------- */
function renderRest(){
  const restEl=document.getElementById("restPanel");
  const now=Date.now();
  if(S.restUntil>now){
    restEl.innerHTML = `<p>😴 Отдых идёт... осталось ${Math.ceil((S.restUntil-now)/1000)} с.</p>`;
  } else {
    restEl.innerHTML = `<p>Усталость: ${S.fatigue}%</p>
      <button id="btnRest" ${S.fatigue<=0?"disabled":""}>😴 Отдыхать 1 минуту</button>
      ${RACE && !RACE.playerFinished && !RACE.playerDNF ? "<p class='hint'>Во время гонки отдых запустить нельзя.</p>":"<p class='hint'>Можно стартовать.</p>"}`;
    const b=document.getElementById("btnRest");
    if(b) b.onclick=()=>{
      if(RACE && !RACE.playerFinished && !RACE.playerDNF){ alert("Во время гонки отдых запустить нельзя."); return; }
      S.restUntil=Date.now()+60*1000; saveGame(); renderRest(); renderRaceView();
    };
  }
  const hospEl=document.getElementById("hospitalPanel");
  if(S.treatmentUntil>now){
    hospEl.innerHTML = `<h3>🏥 Больница</h3><p>Лечение идёт... осталось ${Math.ceil((S.treatmentUntil-now)/1000)} с. До окончания старт заблокирован.</p>`;
  } else {
    hospEl.innerHTML = `<h3>🏥 Больница</h3><p>не требуется</p><p class="hint">Больница появляется как обязательный этап после перелома. Лечение занимает 5 минут реального времени.</p>`;
  }
}
function renderTraining(){
  const el=document.getElementById("trainingPanel");
  const now=Date.now();
  if(S.trainingUntil>now){
    el.innerHTML = `<p>🏋️ Тренировка идёт... осталось ${Math.ceil((S.trainingUntil-now)/1000)} с.</p>`;
  } else {
    const cap=trainingCap();
    el.innerHTML = `<p>${S.training} / ${cap}${coach().id==="none"?" (без тренера, максимум 30)":""}</p>
      <button id="btnTrain" ${S.training>=cap?"disabled":""}>▶ Начать тренировку на 1 минуту</button>
      <p class="hint">Одна тренировка длится 1 минуту и даёт +1 к тренированности, пока не достигнут предел тренера.</p>`;
    const b=document.getElementById("btnTrain");
    if(b) b.onclick=()=>{
      if(RACE && !RACE.playerFinished && !RACE.playerDNF){ alert("Во время гонки тренироваться нельзя."); return; }
      S.trainingUntil=Date.now()+60*1000; saveGame(); renderTraining(); renderRaceView();
    };
  }
}
function renderCoachView(){
  const el=document.getElementById("coachList");
  el.innerHTML = COACHES.map(c=>`
    <div class="coach-item">
      <h3>${c.name} ${S.coachId===c.id?"✅":""}</h3>
      <p>Максимум тренированности: ${c.cap} · бонус темпа: ${Math.round(c.paceBonus*100)}% · снижение травматизма: ${Math.round(c.injuryCut*100)}%</p>
      ${S.coachId===c.id?"":`<button data-coach="${c.id}">${c.price?("Нанять · ₽ "+c.price.toLocaleString("ru-RU")):"Выбрать"}</button>`}
    </div>
  `).join("");
  el.querySelectorAll("[data-coach]").forEach(btn=>{
    btn.onclick=()=>{
      const c=COACHES.find(x=>x.id===btn.dataset.coach);
      if(c.price>0 && S.money<c.price){ alert("НЕ ХВАТАЕТ ₽"); return; }
      if(c.price>0) S.money-=c.price;
      S.coachId=c.id; saveGame(); renderCoachView(); renderStatbar(); renderTraining();
    };
  });
}
function renderItra(){
  const el=document.getElementById("itraTable");
  const rows = RIVALS.slice().sort((a,b)=>b.itra-a.itra).map(r=>
    `<tr><td>${r.country}</td><td>${r.name}</td><td>${r.itra}</td></tr>`).join("");
  el.innerHTML = `<p class="hint">Игровая лига: известные соперники — вымышленные персонажи. Баллы игровые, для баланса.</p>
    <table class="itra-table"><tr><th></th><th>Спортсмен</th><th>ITRA</th></tr>
    <tr><td>🔴</td><td><b>${S.profile.name||"Вы"}</b></td><td>${S.itra}</td></tr>${rows}</table>`;
}
function renderAchievements(){
  const el=document.getElementById("achList");
  el.innerHTML = S.achievements.length
    ? S.achievements.map(a=>`<div class="shop-item">${a}</div>`).join("")
    : `<p class="hint">На каждом уровне есть своя редкая ачивка. Найденные остаются в коллекции навсегда.</p>`;
}

/* ---------------------------- VIEW SWITCHING ------------------------------------ */
const VIEW_IDS = ["profile","race","carry","campaign","equipment","repair","resources","lamp","rest","training","coach","itra","achievements","about"];
function showView(name){
  VIEW_IDS.forEach(v=>{
    const el=document.getElementById("view-"+v);
    if(el) el.classList.toggle("active", v===name);
  });
  document.querySelectorAll("#navItems button").forEach(b=>b.classList.toggle("active", b.dataset.view===name));
  if(name==="race") renderRaceView();
  if(name==="carry") renderCarry();
  if(name==="campaign") renderCampaign();
  if(name==="equipment") renderEquipment();
  if(name==="repair") renderRepair();
  if(name==="resources") renderResources();
  if(name==="lamp") renderLamp();
  if(name==="rest") renderRest();
  if(name==="training") renderTraining();
  if(name==="coach") renderCoachView();
  if(name==="itra") renderItra();
  if(name==="achievements") renderAchievements();
  document.getElementById("views").scrollIntoView({behavior:"smooth", block:"start"});
}

/* ---------------------------- HELP MODAL CONTENT --------------------------------- */
const HELP_HTML = `
<h3>🏁 Суть игры</h3>
<p>Ты проходишь трейловые гонки одну за другой. Подготовь бегуна, нажми «Старт» — гонка идёт автоматически. Финишируй как можно выше, зарабатывай рубли и XP, улучшай бегуна и пройди кампанию из 21 гонки до «Армагеддона».</p>
<h3>🎒 Перед стартом проверь</h3>
<p>Слот → усталость → тренированность → экипировка → вода → гели → аптечка → фонарь → погода.</p>
<h3>🎟️ Слоты</h3>
<p>Уровни 1–3 бесплатны. С 4-го уровня нужен слот, с 9-го стоимость увеличивается в 3 раза.</p>
<h3>🫘 Гуарана</h3>
<p>До 100 км — 1 применение за гонку, 100–500 км — 2, от 500 км — 4. Шанс срабатывания 60%, буст действует 20 км. После буста 30% шанс отката: скорость −40% на 30 км.</p>
<h3>😴 Усталость и отдых</h3>
<p>Отдых длится 1 минуту реального времени и снижает усталость. Во время гонки отдых недоступен.</p>
<h3>🏥 Лечение</h3>
<p>После перелома нужна больница — 5 минут реального времени. До конца лечения старт заблокирован.</p>
<h3>🏋️ Тренировки и тренеры</h3>
<p>Тренировка длится 1 минуту, +1 к тренированности. Без тренера максимум 30/100, тренеры поднимают потолок и дают бонусы.</p>
<h3>🏜️ Чара</h3>
<p>13-й уровень: 138 км, пункты питания на 27/54/82/109 км. На 82 км — «Река разлилась»: часть ещё бегущих участников сходит одной большой плашкой, игрок всегда находит обход (+20:00).</p>
<h3>🚫 DNF</h3>
<p>Обычные сходы участников показываются группами по 5. Игрок может сойти из-за перелома, переохлаждения или перегрева — гонка сразу останавливается, награда не начисляется.</p>
<h3>✉️ Связь</h3>
<p>Почта: sim_trail@mail.ru · Telegram: @trail_armageddon</p>
`;

/* ---------------------------- INIT ------------------------------------------------ */
function wireUI(){
  document.getElementById("btnHelp").onclick=()=>{ document.getElementById("helpContent").innerHTML=HELP_HTML; document.getElementById("helpModal").classList.add("open"); };
  document.getElementById("btnHelpClose").onclick=()=>document.getElementById("helpModal").classList.remove("open");
  document.getElementById("helpModal").onclick=(e)=>{ if(e.target.id==="helpModal") e.currentTarget.classList.remove("open"); };

  document.getElementById("profileName").value = S.profile.name;
  document.getElementById("profileName").oninput = (e)=>{
    const v = e.target.value.replace(/(бляд|хуй|пизд|еба[тн]|сук[аи])/gi,"***");
    S.profile.name=v; saveGame();
  };

  document.getElementById("btnStart").onclick=startRace;
  document.getElementById("bottomStart").onclick=startRace;
  document.getElementById("btnBuySlot").onclick=()=>{
    const price=slotPrice(S.currentLevel);
    if(S.money<price){ alert("НЕ ХВАТАЕТ ₽ — можно переиграть старые уровни."); return; }
    S.money-=price; S.slotsOwned[S.currentLevel]=true;
    if(Math.random()<0.15){
      const slot=pick(Object.keys(S.gear));
      alert("🎁 Бонус: бесплатный предмет экипировки для слота "+SLOT_LABEL[slot]+"!");
    }
    saveGame(); renderRaceView(); renderStatbar();
  };
  document.getElementById("btnGuarana").onclick=useGuarana;
  document.getElementById("speedSelect").onchange=(e)=>{ if(RACE) RACE.speed=parseInt(e.target.value); };

  document.getElementById("btnLatestLevel").onclick=()=>{
    const next = Math.max(0,...S.completedLevels.map(i=>i+1), 0);
    S.currentLevel = Math.min(next, LEVELS.length-1);
    saveGame(); renderCampaign(); showView("race");
  };
  document.getElementById("btnResetCampaign").onclick=()=>{
    if(!confirm("Сбросить весь прогресс кампании и профиль?")) return;
    S = defaultState(); saveGame(); location.reload();
  };

  document.getElementById("navToggle").onclick=()=>{
    document.getElementById("navItems").classList.toggle("collapsed");
    document.getElementById("bottomStart").classList.toggle("show");
    setTimeout(()=>{ if(window.Race3D) window.Race3D.onResize(); }, 260);
  };
  window.addEventListener("orientationchange", ()=>setTimeout(()=>{ if(window.Race3D) window.Race3D.onResize(); },300));
  document.querySelectorAll("#navItems button").forEach(b=>{
    b.onclick=()=>showView(b.dataset.view);
  });
}

function tickTimers(){
  const now=Date.now();
  if(document.getElementById("view-rest").classList.contains("active")) renderRest();
  if(document.getElementById("view-training").classList.contains("active")) renderTraining();
  if(document.getElementById("view-race").classList.contains("active") && !RACE) renderRaceView();
}

function init(){
  wireUI();
  renderStatbar();
  showView("race");
  setInterval(tickTimers, 1000);
  saveGame();
}
document.addEventListener("DOMContentLoaded", init);
