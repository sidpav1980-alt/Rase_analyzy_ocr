window.CHARA_BG_IMG=new Image(); window.CHARA_BG_IMG.src='chara_bg_102_20260822_clean2.png?v=102-20260822-clean2'; window.CHARA_BG_IMG.onload=()=>{try{drawTrack(run?.p||0)}catch(e){}};
const APP_VERSION='1.03';





function realLeaderBattleName(){
  try{
    if(!run || !run.running) return '';
    const L=levelData();
    const pKm=Math.max(0,Math.min(Number(L[1]||0),Number(run.p||0)*Number(L[1]||0)));
    const rows=dynamicLeaderRows(L).filter(r=>r && r.c && !r.c.dnf);
    if(!rows.length) return '';

    // Prefer the closest real rival ahead of the player.
    const ahead=rows
      .filter(r=>Number(r.liveKm||0)>=pKm)
      .sort((a,b)=>Number(a.liveKm||0)-Number(b.liveKm||0));
    const rival=ahead[0] || rows.sort((a,b)=>Number(b.liveKm||0)-Number(a.liveKm||0))[0];
    return String(rival?.c?.name||'').trim();
  }catch(e){ return ''; }
}
function leaderBattleLabel(){
  const name=realLeaderBattleName();
  return name ? `Борьба с лидером: ${name}` : 'Борьба с лидером';
}

function setWaterBottlesIndependent(value){
  game.waterBottles=Math.max(0,Number(value||0));
  saveGame();
  render();
}
function setGelsIndependent(value){
  game.gels=Math.max(0,Number(value||0));
  saveGame();
  render();
}

function dynamicLeaderGroupExchange(run){
  if(!run) return;
  const arr=Array.isArray(run.participants)?run.participants:
            Array.isArray(run.runners)?run.runners:null;
  if(!arr || arr.length<4) return;

  const distOf=r=>Number(r.distance ?? r.km ?? r.progressKm ?? r.dist ?? 0);
  const active=arr.filter(r=>r && !r.dnf && !r.dropped);
  if(active.length<4) return;

  active.sort((a,b)=>distOf(b)-distOf(a));

  // Small live variation around the front pack. This allows a runner from the
  // main group to attack into top-3 and a current leader to fall back.
  const front=active.slice(0,Math.min(10,active.length));
  for(const r of front){
    if(r.isPlayer) continue;
    const swing=(Math.random()-.5)*0.18; // temporary speed variation
    if('speedFactor' in r) r.speedFactor=Math.max(.82,Math.min(1.28,(Number(r.speedFactor)||1)+swing*.08));
    if('paceFactor' in r) r.paceFactor=Math.max(.72,Math.min(1.18,(Number(r.paceFactor)||1)-swing*.07));
  }

  // Always derive leader/group membership from current distance, never from
  // a fixed list selected at race start.
  active.sort((a,b)=>distOf(b)-distOf(a));
  active.forEach((r,i)=>{
    r.liveRank=i+1;
    r.isLeader=(i<3);
    r.inMainGroup=(i>=3 && i<10);
  });
}

function ensureRussianElitesAfterLevel7(race, runners){
  const raceLevel=Number((race&&(race.level ?? race.difficulty ?? race.stars ?? race.requiredLevel))||0);
  if(raceLevel<=7 || !Array.isArray(runners)) return runners;

  // All Russian elite rivals from the in-game ITRA table are permanent from level 8.
  const elites=[
    {name:'Алексей Береснев',itra:905},
    {name:'Антонина Юшина',itra:890},
    {name:'Анастасия Кабенина',itra:850},
    {name:'Алексей Толстенко',itra:865},
    {name:'Константин Иванов',itra:850},
    {name:'Елена Носкова',itra:840},
    {name:'Василий Корыткин',itra:835},
    {name:'Алексей Макалюкин',itra:825},
    {name:'Алексей Бабушкин',itra:815},
    {name:'Павел Тарасов',itra:805},
    {name:'Виктория Жукова',itra:795},
    {name:'Мария Гостева',itra:785},
    {name:'Вера Чекалина',itra:775}
  ];
  const norm=s=>String(s||'').trim().toLowerCase();

  for(const elite of elites){
    if(runners.some(r=>norm(r.name||r.fullName)===norm(elite.name))) continue;
    const sample=runners.find(r=>r && typeof r==='object')||{};
    const npc={...sample};
    npc.name=elite.name;
    if('fullName' in npc) npc.fullName=elite.name;
    if('itra' in npc || !('rating' in npc)) npc.itra=elite.itra;
    if('rating' in npc) npc.rating=elite.itra;
    if('country' in npc) npc.country='RU';
    if('isPlayer' in npc) npc.isPlayer=false;
    if('dnf' in npc) npc.dnf=false;
    if('dropped' in npc) npc.dropped=false;

    // Scale competitive strength by ITRA: stronger names tend to run nearer the front,
    // but live-race variation can still change their order.
    const strength=Math.max(0,Math.min(1,(elite.itra-775)/(905-775)));
    if('paceFactor' in npc) npc.paceFactor=0.86-(0.08*strength);
    if('speedFactor' in npc) npc.speedFactor=1.10+(0.08*strength);
    runners.push(npc);
  }
  return runners;
}
function purchasesLockedDuringRace(){
  if(run && run.running){
    showGameError('Во время гонки нельзя покупать или менять экипировку и расходники. Дождитесь финиша.');
    return true;
  }
  return false;
}


const LEVELS=[["Парковый трейл", 5, 80, 2040, 900, 1, "Лёгкий разогрев: дорожки, корни и первый подъём."], ["Лесная десятка", 10, 220, 4080, 1300, 1, "Первые камни, грязь и короткие технические спуски."], ["Грязевой полумарафон", 21, 600, 9300, 2200, 2, "Дождь, лужи, первые серьёзные штрафы за обувь."], ["Скальный забег", 25, 1100, 11400, 2800, 2, "Камни и острые спуски. Палки начинают приносить пользу."], ["Ночной трейл", 30, 900, 13500, 3500, 2, "Фонарик становится критичным."], ["Горный марафон", 42, 1900, 21600, 4700, 3, "Длинные подъёмы и первый серьёзный тест выносливости."], ["Хребет ветров", 50, 2300, 27000, 5600, 3, "Ветер и холод усиливают износ мембранки."], ["Ультра 60", 60, 2500, 32400, 6500, 3, "Четыре ПП, жара и длинные участки без воды."], ["Каменный лабиринт", 70, 3300, 39600, 7600, 3, "Камни ускоряют износ обуви и палок."], ["Северный шторм", 80, 3600, 46800, 9000, 4, "Дождь, ветер и холод. Дешёвая экипировка быстро сдаётся."], ["100 км классика", 100, 4300, 61200, 11000, 4, "Первый настоящий 100 км ультратрейл."], ["Высотная сотня", 110, 6000, 79200, 13500, 4, "Много набора и технический рельеф."], ["Чара. Первая уникальная трейл-экспедиция", 138, 3200, 82800, 14500, 4, "Чарские пески: 138 км, песчаные барханы на фоне заснеженных гор, 4 пункта питания, длинные открытые участки и повышенный расход воды."], ["Дикий 130", 130, 5200, 90000, 15000, 4, "Длинные ночные часы и риск поломок."], ["200 км пустошь", 200, 6500, 151200, 21000, 4, "Жара, вода и питание становятся главным ресурсом."], ["Альпийский 250", 250, 12000, 208800, 27000, 5, "Очень высокий износ, долгие спуски, холодные ночи."], ["Трансгорный 300", 300, 15000, 259200, 33000, 5, "Экипировка среднего класса уже на пределе."], ["Дикий пояс 400", 400, 18000, 345600, 42000, 5, "Многосуточный забег: прочность вещей решает."], ["Край света 500", 500, 23000, 450000, 52000, 5, "Погода, сон и поломки начинают складываться."], ["Безумие 700", 700, 32000, 648000, 70000, 5, "Предфинальная гонка. Нужен высокий уровень трейлраннера."], ["АРМАГЕДДОН 1000", 1000, 50000, 1008000, 100000, 5, "Финал: 1000 км, 50 000 м+, ночь, жара, шторм и максимальный износ."]];
const GEAR={"shoes":[["Базовые кроссовки",0,1.0,65,0.0],["Trail Grip",450,0.97,110,0.04],["Mountain Pro",1300,0.94,180,0.08],["Ultra Carbon",3000,0.91,280,0.12],["Armageddon X",7500,0.88,500,0.18],["Hyper Trail Pro",13000,0.845,760,0.23],["Titanium Speed X",23750,0.81,1100,0.3]],"jacket":[["Нет мембранки",0,1.0,999,0],["Лёгкая мембранка",400,0.99,90,0.03],["Storm Shell",1125,0.98,160,0.06],["Alpine Shield",2500,0.97,260,0.1],["Armageddon Shell",6500,0.96,480,0.15],["Expedition Shield",11500,0.945,760,0.21],["Titan Storm Armor",21250,0.93,1150,0.28]],"lamp":[["Простой фонарь",0,1.0,70,0.0],["Night 400",350,0.995,120,0.03],["Night 800",950,0.99,200,0.06],["Ultra Beam",2250,0.985,320,0.1],["Recharge Pro X",5500,0.98,520,0.14],["Recharge Ultra 2000",10500,0.965,780,0.22],["Night Reactor 3000",20000,0.95,1200,0.3]],"pack":[["Старый рюкзак",0,1.0,80,0.0],["Race Vest 5L",425,0.99,120,0.03],["Ultra Vest 12L",1200,0.98,210,0.06],["Endurance Pack",2750,0.97,330,0.1],["Armageddon Pack",6750,0.96,550,0.15],["Expedition Vest 18L",11750,0.945,800,0.22],["Titan Ultra Pack",22000,0.93,1250,0.3]],"poles":[["Без палок",0,1.0,999,0.0],["Алюминиевые палки",475,0.985,100,0.04],["Carbon Trek",1300,0.97,180,0.08],["LEKI Ultra Carbon",3000,0.955,300,0.12],["LEKI Armageddon",7250,0.94,520,0.18],["LEKI Vertical Pro",12500,0.915,780,0.24],["LEKI Titanium X",23000,0.89,1200,0.32]],"hydration":[["Фляга 500 мл",0,1.0,100,0.0],["2×Soft Flask",300,0.99,160,0.03],["Hydro Vest",900,0.98,250,0.06],["Ultra Hydro",2125,0.97,380,0.1],["Armageddon Hydro",5250,0.96,600,0.15],["Expedition Hydro",9750,0.945,850,0.22],["Titan Hydro System",19000,0.93,1300,0.3]],"watch":[["Нет часов",0,1.0,999,0.0],["GPS Start",450,0.998,180,0.02],["Trail GPS",1400,0.995,280,0.05],["Endurance GPS",3600,0.99,420,0.08],["Fenix Ultra",9000,0.985,650,0.12],["Fenix Expedition",19000,0.975,900,0.2],["Fenix Armageddon",36000,0.965,1400,0.28]],"medkit":[["Базовая аптечка · 1 комплект",0,1.0,100,0.0],["Мини-аптечка · 2 комплекта",350,0.999,120,0.03],["Trail аптечка · 3 комплекта",1050,0.997,220,0.06],["Ultra аптечка · 4 комплекта",2600,0.995,360,0.1],["Armageddon Med · 5 комплектов",6500,0.99,600,0.15],["Expedition Med Pro · 6 комплектов",14000,0.985,900,0.22],["Trauma Armageddon Kit · 7 комплектов",27500,0.975,1400,0.3]],"hrm":[["Базовый пульсометр",250,1.0,120,0.01],["HR Pace 2",700,0.998,180,0.03],["Trail HR",1600,0.996,260,0.05],["Endurance HR",3400,0.994,380,0.08],["Pro Pace Sensor",7200,0.992,560,0.12],["Elite HR Guide",13500,0.990,820,0.18],["Armageddon HR Pro",25000,0.988,1200,0.25]]};
const CATEGORY_NAMES={shoes:'Кроссовки',pack:'Рюкзак / жилет',jacket:'Мембранка',lamp:'Фонарик',poles:'Палки',watch:'Часы',medkit:'Аптечка',hydration:'Вода',hrm:'Пульсометр'};
const RESOURCE_CATALOG={
  waterBottles:{name:'Вода 0,5 л',price:80,unit:'бут.',desc:'Обязательна с 4 уровня. Расход зависит от дистанции, жары и солнца.'},
  gels:{name:'Энергетический гель «УГЛИ»',price:60,unit:'шт.',desc:'Снижает голод и потерю темпа на длинной гонке.'},
  guarana:{name:'Гуарана',price:180,unit:'шт.',desc:'До 100 км — 1 приём за гонку; свыше 100 км — до 2 приёмов; на 500 км и больше — до 4 приёмов. 60% шанс получить ускорение на следующие 20 км. После окончания этих 20 км есть 30% шанс отката: скорость −40% на следующие 30 км.'},
  batteries:{name:'Комплект батареек',price:130,unit:'компл.',desc:'Для фонарей 1–4 уровня. Один комплект ≈ 5 часов света.'},
  bandage:{name:'Бинт',price:40,unit:'шт.',desc:'Сильные ссадины и растяжения.'},
  gauze:{name:'Марля',price:22,unit:'уп.',desc:'Кровь и глубокие царапины.'},
  peroxide:{name:'Перекись',price:35,unit:'фл.',desc:'Обработка ран.'},
  plaster:{name:'Пластырь',price:28,unit:'уп.',desc:'Мелкие порезы и мозоли.'},
  cream:{name:'Крем от натирания',price:60,unit:'тюб.',desc:'Снижает риск натираний.'},
  sunCream:{name:'Крем от солнца',price:70,unit:'тюб.',desc:'Компонент аптечки для защиты на солнечных и жарких гонках.'},
  rescueBlanket:{name:'Спасательное одеяло',price:120,unit:'шт.',desc:'Теплозащита при переохлаждении, травме и вынужденной остановке.'},
  medkits:{name:'Собранная аптечка',price:0,unit:'компл.',desc:'Готовый комплект: бинт + марля + перекись + пластырь + крем от натирания + крем от солнца + спасательное одеяло.'},
  accumulator:{name:'Сменный аккумулятор фонаря',price:900,unit:'шт.',desc:'Для фонарей уровней 5–7. Можно заменить разряженный аккумулятор прямо в гонке.'},
  powerbank:{name:'Переносной powerbank',price:2250,unit:'шт.',desc:'Заряжает аккумулятор фонаря уровней 5–7.'}
};
const START_GEAR={shoes:0,pack:0,jacket:0,lamp:0,poles:0,watch:0,medkit:0,hydration:0,hrm:0};
const $=id=>document.getElementById(id);
function showGameError(message){
 const el=$('gameErrorToast');
 if(!el) return;
 el.textContent='⚠️ '+message;
 el.classList.add('show');
 clearTimeout(window.__gameErrorTimer);
 window.__gameErrorTimer=setTimeout(()=>el.classList.remove('show'),4500);
}

let game=loadGame();
let run=null,timer=null,lastTs=0;

function setRaceSessionFlag(active){
  try{ sessionStorage.setItem('trailArmageddonRaceActive', active ? '1' : '0'); }catch(e){}
}
function consumeReloadedRaceFlag(){
  try{
    const wasActive=sessionStorage.getItem('trailArmageddonRaceActive')==='1';
    if(!wasActive) return false;
    sessionStorage.setItem('trailArmageddonRaceActive','0');
    return true;
  }catch(e){ return false; }
}
function clearTransientRaceUi(){
  try{ if(typeof clearRaceOverlayQueue==='function') clearRaceOverlayQueue(); }catch(e){}
  try{ if(timer) cancelAnimationFrame(timer); }catch(e){}
  timer=null;
  lastTs=0;
  run=null;
  const ids=['raceStartRiskOverlay','eventOverlay','finishOverlay'];
  ids.forEach(id=>{
    const el=$(id);
    if(el){ el.classList.remove('show'); el.innerHTML=''; }
  });
  const log=$('eventLog');
  if(log) log.innerHTML='<div class="muted">События появятся по ходу гонки.</div>';
  const pb=$('progressBar'); if(pb) pb.style.width='0%';
  const km=$('progressKm'); if(km){ const L=levelData(); km.textContent=`0.0 / ${Number(L?.[1]||5).toFixed(1)} км`; }
  const clock=$('clock'); if(clock) clock.textContent='0:00:00';
}

const COACHES=[
 {name:'Без тренера',price:0,mult:1.00,maxDifficulty:1,trainingGain:1.0,fitnessCap:30,
  desc:'Самостоятельная база. Тренированность можно поднять только до 30/100.',
  bonuses:'без тренера: нет специальных бонусов'},
 {name:'Базовый тренер',price:2000,mult:1.25,maxDifficulty:2,trainingGain:1.25,fitnessCap:50,
  bonuses:'−2% базового времени · −4% усталости · −3% штрафа за подъёмы',
  desc:'Готовит до 50/100 и открывает стабильную работу на ★–★★.'},
 {name:'Трейл-тренер',price:6250,mult:1.55,maxDifficulty:3,trainingGain:1.5,fitnessCap:65,
  bonuses:'−4% базового времени · −8% усталости · −6% штрафа за подъёмы',
  desc:'Готовит до 65/100 и специализируется на техничном трейле ★★–★★★.'},
 {name:'Горный тренер',price:12500,mult:1.90,maxDifficulty:4,trainingGain:2.0,fitnessCap:80,
  bonuses:'−6% базового времени · −11% усталости · −8% штрафа за подъёмы',
  desc:'Готовит до 80/100 и усиливает работу на наборе ★★★–★★★★.'},
 {name:'Elite Coach',price:22500,mult:2.35,maxDifficulty:5,trainingGain:2.5,fitnessCap:100,
  bonuses:'−8% базового времени · −15% усталости · −10% штрафа за подъёмы · −5% риска травмы',
  desc:'Готовит до 100/100 и даёт максимальные бонусы на ★★★★–★★★★★.'}
];
const ELITE_RUNNERS=[
{name:'Артем Чернов',itra:920,country:'🇷🇺'},
{name:'Алексей Береснев',itra:905,country:'🇷🇺'},{name:'Антонина Юшина',itra:890,country:'🇷🇺'},
{name:'Алексей Толстенко',itra:865,country:'🇷🇺'},{name:'Константин Иванов',itra:850,country:'🇷🇺'},
{name:'Елена Носкова',itra:840,country:'🇷🇺'},{name:'Василий Корыткин',itra:835,country:'🇷🇺'},
{name:'Алексей Макалюкин',itra:825,country:'🇷🇺'},{name:'Алексей Бабушкин',itra:815,country:'🇷🇺'},
{name:'Павел Тарасов',itra:805,country:'🇷🇺'},{name:'Виктория Жукова',itra:795,country:'🇷🇺'},
{name:'Мария Гостева',itra:785,country:'🇷🇺'},{name:'Вера Чекалина',itra:775,country:'🇷🇺'},
{name:'Анастасия Кабенина',itra:850,country:'🇷🇺'}];
function loadGame(){
  try{
    const x=JSON.parse(localStorage.getItem('trailArmageddonSave')||'null');
    if(x) return Object.assign({
      money:1500,xp:0,level:1,completed:0,rep:0,wins:0,current:0,fitness:1,coach:0,coachOwned:[0],trainingUntil:0,itra:250,gear:{...START_GEAR},
      durability:{},best:{},playerName:'',fatigue:0,lastFinishAt:0,restUntil:0,hospitalUntil:0,needsHospital:false,achievements:{},raceSlotsPurchased:{},lastTrainingCoach:0,lastTrainingAt:0,
      resources:{waterBottles:4,gels:4,guarana:0,batteries:2,accumulator:0,bandage:1,gauze:1,peroxide:1,plaster:2,cream:1,sunCream:1,rescueBlanket:1,medkits:0,powerbank:0},
      lampCharge:100,gearOwned:{}
    },x);
  }catch(e){}
  return {
    money:1500,xp:0,level:1,completed:0,rep:0,wins:0,current:0,fitness:1,coach:0,coachOwned:[0],trainingUntil:0,itra:250,gear:{...START_GEAR},
    durability:{},best:{},playerName:'',fatigue:0,lastFinishAt:0,restUntil:0,hospitalUntil:0,needsHospital:false,achievements:{},raceSlotsPurchased:{},lastTrainingCoach:0,lastTrainingAt:0,
    resources:{waterBottles:4,gels:4,guarana:0,batteries:2,accumulator:0,bandage:1,gauze:1,peroxide:1,plaster:2,cream:1,sunCream:1,rescueBlanket:1,medkits:0,powerbank:0},
    lampCharge:100,gearOwned:{}
  };
}
function saveGame(){
  localStorage.setItem('trailArmageddonSave',JSON.stringify(game));
}
function ensureTraining(){
 if(game.fitness==null) game.fitness=Math.max(1,Math.min(100,game.level||1));
 if(game.coach==null) game.coach=0;
 if(!Array.isArray(game.coachOwned)) game.coachOwned=[0];
 if(!game.coachOwned.includes(0)) game.coachOwned.push(0);
 if(game.trainingUntil==null) game.trainingUntil=0;
 const coach=COACHES[Number(game.coach)||0]||COACHES[0];
 if(Number(game.fitness)>Number(coach.fitnessCap||100)) game.fitness=Number(coach.fitnessCap||100);
 if(game.itra==null) game.itra=250;
 if(game.playerName==null) game.playerName='';
}
function ensureResources(){
 if(game && Number(game.waterBottles||0)>0 && Number(game.resources?.waterBottles||0)<=0){
   game.resources.waterBottles=Number(game.waterBottles||0);
   game.waterBottles=0;
 }

  if(!game.resources) game.resources={};
  const defaults={waterBottles:4,gels:4,guarana:0,batteries:2,accumulator:0,bandage:1,gauze:1,peroxide:1,plaster:2,cream:1,sunCream:1,rescueBlanket:1,medkits:0,powerbank:0};
  Object.entries(defaults).forEach(([k,v])=>{if(game.resources[k]==null)game.resources[k]=v});
  if(game.fatigue==null)game.fatigue=0;
  if(game.restUntil==null)game.restUntil=0;
  if(game.lastFinishAt==null)game.lastFinishAt=0;
  if(game.lampCharge==null)game.lampCharge=100;
  if(!game.raceSlotsPurchased || typeof game.raceSlotsPurchased!=='object') game.raceSlotsPurchased={};
  if(game.lastTrainingCoach==null) game.lastTrainingCoach=0;
  if(game.lastTrainingAt==null) game.lastTrainingAt=0;
}
function restRemainingMs(){return Math.max(0,(game.restUntil||0)-Date.now())}
function isResting(){return restRemainingMs()>0}
function fmtRest(ms){
  const s=Math.ceil(ms/1000),m=Math.floor(s/60),r=s%60;
  return `${m}:${String(r).padStart(2,'0')}`;
}
function gelsNeeded(L){
  return Math.max(1,Math.min(80,Math.ceil(L[3]/2700)));
}
function weatherForLevel(){
  // Stable for a selected race until that race is changed/reloaded.
  if(!game.weatherByLevel) game.weatherByLevel={};
  const key=String(game.current);
  if(game.weatherByLevel[key]) return game.weatherByLevel[key];

  const pool=[
    {name:'Ясно',emoji:'☀️',temp:24,sun:85,rain:false,cold:false},
    {name:'Переменная облачность',emoji:'🌤️',temp:19,sun:55,rain:false,cold:false},
    {name:'Облачно',emoji:'☁️',temp:14,sun:25,rain:false,cold:false},
    {name:'Дождь',emoji:'🌧️',temp:9,sun:10,rain:true,cold:true},
    {name:'Ливень',emoji:'⛈️',temp:6,sun:5,rain:true,cold:true},
    {name:'Холодный ветер',emoji:'💨',temp:4,sun:20,rain:false,cold:true},
    {name:'Жара',emoji:'🥵',temp:31,sun:100,rain:false,cold:false}
  ];
  // Higher levels slightly more likely to have bad weather.
  let idx=Math.floor(Math.random()*pool.length);
  if(game.current>=8 && Math.random()<0.35) idx=3+Math.floor(Math.random()*3);
  game.weatherByLevel[key]={...pool[idx]};
  return game.weatherByLevel[key];
}
function waterLitersNeeded(L,w){
  if(game.current<3) return 0; // mandatory only after level 3
  // Water means the realistic START/CARRY reserve between aid stations,
  // not enough water for the entire race from start to finish.
  const km=Number(L[1]||0);
  let liters;
  if(km<=25) liters=1.0;
  else if(km<=42) liters=1.5;
  else if(km<=60) liters=2.0;
  else if(km<=100) liters=2.5;
  else if(km<=130) liters=3.0;
  else liters=3.5;

  // Weather changes the carried reserve moderately, without making
  // multi-day races require tens of litres at the start.
  if(w.temp>=28 || w.sun>=85) liters+=0.5;
  if(w.temp<=8 && !w.rain) liters-=0.5;
  if(w.rain && w.temp<=8) liters=Math.max(liters,1.5);
  return Math.max(1.0,Math.min(4.0,liters));
}
function waterBottlesNeeded(L,w){
  const liters=waterLitersNeeded(L,w);
  return liters<=0?0:Math.ceil(liters/0.5);
}
function hydrationCapacityLiters(idx=Number(game.gear?.hydration||0)){
  // Реальная вместимость системы воды по 7 уровням.
  return [0.5,1.0,1.5,2.0,2.5,3.0,4.0][Math.max(0,Math.min(6,Number(idx)||0))]||0.5;
}
function hydrationCapacityBottles(idx=Number(game.gear?.hydration||0)){
  return Math.round(hydrationCapacityLiters(idx)/0.5);
}
function totalWaterCarryCapacityBottles(available=Number(game.resources?.waterBottles||0)){
  // Воду можно нести не только в гидраторе: каждая купленная бутылка 0,5 л — отдельная ёмкость.
  return Math.max(0,hydrationCapacityBottles()+Math.max(0,Number(available||0)));
}
function totalWaterCarryCapacityLiters(available=Number(game.resources?.waterBottles||0)){
  return totalWaterCarryCapacityBottles(available)*0.5;
}
function waterEffectText(){
  const cap=hydrationCapacityLiters();
  return `вместимость ${cap.toFixed(1).replace('.0','')} л · больше воды = меньше риск жажды и штрафов`;
}
function membraneRequiredLevel(L=levelData(),w=weatherForLevel()){
  // Баланс ранних уровней:
  // 1–2 уровень: мембранка не обязательна вообще.
  // С 3 уровня при дожде/холоде нужна первая настоящая мембранка — ур. 2/7.
  const raceNo=game.current+1;
  if(raceNo<=2) return 0;
  if(!(w.rain||w.cold)) return 0;

  let req=2;
  if(raceNo>=6 && (L[5]>=3 || L[1]>=50)) req=3;
  if(raceNo>=6 && (L[5]>=4 || L[1]>=100)) req=4;
  if(raceNo>=6 && (L[5]>=5 || L[1]>=250)) req=5;
  if(raceNo>=6 && L[1]>=500) req=6;
  if(raceNo>=6 && L[1]>=700) req=7;
  if(raceNo>=6 && w.name==='Ливень') req+=1;
  if(raceNo>=6 && w.cold && w.temp<=4) req+=1;
  return Math.max(2,Math.min(7,req));
}
function membraneEquippedLevel(){
  return Math.max(1,Math.min(7,Number(game.gear.jacket||0)+1));
}
function hasMembrane(requiredLevel=2){
  return membraneEquippedLevel()>=requiredLevel &&
         Number(game.gear.jacket||0)>0 &&
         durability('jacket')>0;
}
function isRechargeableLamp(){return Number(game.gear.lamp)>=4}
function lampHoursNeeded(L){
  // Nights start to matter from level 5 onward; longer races require more light.
  if(game.current<4) return 0;
  return Math.max(1,Math.min(80,Math.ceil(L[3]/3600*0.42)));
}
function medkitScore(){
  const r=game.resources;
  return ['bandage','gauze','peroxide','plaster','cream','sunCream','rescueBlanket'].reduce((a,k)=>a+(Number(r[k])>0?1:0),0);
}
function useResource(k,n=1,reason=''){
 n=Math.max(0,Number(n)||0);
 const before=Math.max(0,Number(game.resources[k])||0);
 const used=Math.min(before,n);
 game.resources[k]=Math.max(0,before-used);
 if(used>0 && reason && run && run.running){
   if(!run.eventResourceSpend) run.eventResourceSpend={};
   run.eventResourceSpend[k]=(Number(run.eventResourceSpend[k])||0)+used;
 }
 return used;
}

function fmt(sec){
 sec=Math.max(0,Math.round(sec)); const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
 return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
}
function fmtMoney(n){return '₽ '+Math.round(n).toLocaleString('ru-RU')}
function levelData(i=game.current){return LEVELS[Math.max(0,Math.min(19,i))]}
function raceSlotCost(i=game.current){
  if(Number(i)<3) return 0;
  const L=levelData(i);
  const diff=Number(L[5]||1),km=Number(L[1]||5);
  const base=Math.round((120 + diff*180 + Math.sqrt(km)*45 + km*3)/50)*50; return Number(i)>=8 ? base*3 : base;
}
function hasRaceSlot(i=game.current){ ensureResources(); return Number(i)<3 || !!game.raceSlotsPurchased?.[String(i)]; }
function renderRaceSlot(){
  const card=$('raceSlotCard'),status=$('raceSlotStatus'),btn=$('buyRaceSlotBtn'),merch=$('raceSlotMerch');
  if(!card||!status||!btn) return;
  const cost=raceSlotCost(),owned=hasRaceSlot(),free=Number(game.current)<3;
  // Показываем компактный блок только когда слот реально нужно купить.
  card.style.display=(!free && !owned)?'block':'none';
  status.innerHTML=`<b>⛔ 🎟️ Нужен слот на гонку</b><small>Без купленного слота старт недоступен.</small>`;
  btn.style.display='inline-flex';
  btn.disabled=game.money<cost;
  btn.textContent=game.money<cost?`Не хватает ${fmtMoney(cost-game.money)}`:`Купить · ${fmtMoney(cost)}`;
  if(merch) merch.textContent='Иногда вместе со слотом выпадает бесплатный мерч экипировки.';
}
function buyRaceSlot(){
  ensureResources(); if(hasRaceSlot()) return;
  const cost=raceSlotCost(); if(game.money<cost){showGameError('Не хватает '+fmtMoney(cost-game.money)+' на слот.');return;}
  game.money-=cost; game.raceSlotsPurchased[String(game.current)]=true;
  let merchMsg='';
  if(Math.random()<0.18){
    keepEquippedGear();
    const cats=['shoes','pack','jacket','lamp','poles','watch','medkit','hydration'];
    const cat=cats[Math.floor(Math.random()*cats.length)];
    const cur=Math.max(0,Number(game.gear?.[cat]||0));
    const found=Math.min(6,cur+1);
    if(!game.gearOwned[cat].includes(found)) game.gearOwned[cat].push(found);
    merchMsg=` 🎁 Мерч: ${CATEGORY_NAMES[cat]} ур. ${found+1}/7 добавлены в инвентарь.`;
  }
  saveGame(); showGameError('Слот куплен.'+merchMsg); render();
}
function refreshRaceRisks(){
 const el=$('raceResourceWarning'); if(!el || (run&&run.running)) return;
 ensureResources(); const L=levelData(),w=weatherForLevel(),warnings=[];

 // Показываем точный дефицит сразу после выбора уровня, ещё ДО нажатия «Старт».
 const needWater=waterBottlesNeeded(L,w);
 const haveWater=Math.max(0,Number(game.resources.waterBottles||0));
 const missWater=Math.max(0,needWater-haveWater);
 const totalCap=totalWaterCarryCapacityBottles(haveWater);
 if(missWater>0) warnings.push(`воды не хватает ${missWater} бут. · есть ${haveWater}/${needWater} × 0,5 л`);
 if(needWater>totalCap) warnings.push(`ёмкости воды недостаточно: можно нести ${Number(totalCap*0.5).toFixed(1).replace('.0','')} л, нужно ${Number(needWater*0.5).toFixed(1).replace('.0','')} л`);

 const needGels=gelsNeeded(L);
 const haveGels=Math.max(0,Number(game.resources.gels||0));
 const missGels=Math.max(0,needGels-haveGels);
 if(missGels>0) warnings.push(`гелей не хватает ${missGels} шт. · есть ${haveGels}/${needGels}`);

 const medKeys=['bandage','gauze','peroxide','plaster','cream','sunCream','rescueBlanket'];
 const medMissing=medKeys.filter(k=>Number(game.resources[k]||0)<=0);
 const readyMedkits=Math.max(0,Number(game.resources.medkits||0));
 if(readyMedkits<=0 && medMissing.length){
   const medNames={bandage:'бинт',gauze:'марля',peroxide:'перекись',plaster:'пластырь',cream:'крем от натирания',sunCream:'крем от солнца',rescueBlanket:'спас-одеяло'};
   warnings.push(`аптечка: не хватает ${medMissing.length} поз. (${medMissing.map(k=>medNames[k]).join(', ')})`);
 }

 const lampHours=lampHoursNeeded(L);
 if(lampHours>0){
   if(isRechargeableLamp()){
     const requiredCharge=Math.min(100,Math.ceil(lampHours*12));
     if(Number(game.lampCharge||0)<requiredCharge && Number(game.resources.powerbank||0)<=0){
       warnings.push(`фонарь: заряд ${Math.round(Number(game.lampCharge||0))}%, нужно ≈ ${requiredCharge}% или powerbank`);
     }
   }else{
     const needBat=Math.ceil(lampHours/5);
     const haveBat=Math.max(0,Number(game.resources.batteries||0));
     const missBat=Math.max(0,needBat-haveBat);
     if(missBat>0) warnings.push(`батареек не хватает ${missBat} компл. · есть ${haveBat}/${needBat}`);
   }
 }

 Object.keys(GEAR).filter(cat=>!['medkit','hydration'].includes(cat)).forEach(cat=>{ const prep=equipmentPreparedness(cat,L,w); if(prep.gap>0) warnings.push(`${CATEGORY_NAMES[cat]}: ур. ${prep.current}/7, желательно ${prep.required}/7`); });
 if(Number(game.fatigue||0)>=70) warnings.push(`усталость ${Math.round(game.fatigue)}%`);
 el.textContent=warnings.length?'🎒 Не хватает / риск: '+[...new Set(warnings)].join(' · '):'✅ С собой всё готово.';
}
const TOP_ITRA_LEADERS=[
 'Jim Walmsley','Kilian Jornet','Tom Evans','Mathieu Blanchard',
 'François D’Haene','Jonathan Albon','Hannes Namberger','Ruth Croft',
 'Courtney Dauwalter','Katie Schide','Blandine L’Hirondel','Judith Wyder'
];

const RUSSIAN_ITRA_RIVALS=[
 {name:'Артем Чернов',itra:920},
 {name:'Алексей Береснев',itra:905},
 {name:'Антонина Юшина',itra:890},
 {name:'Анастасия Кабенина',itra:850},
 {name:'Алексей Толстенко',itra:865},
 {name:'Константин Иванов',itra:850},
 {name:'Елена Носкова',itra:840},
 {name:'Василий Корыткин',itra:835},
 {name:'Алексей Макалюкин',itra:825},
 {name:'Алексей Бабушкин',itra:815},
 {name:'Павел Тарасов',itra:805},
 {name:'Виктория Жукова',itra:795},
 {name:'Мария Гостева',itra:785},
 {name:'Вера Чекалина',itra:775}
];

function isRussianEliteName(name){
 const n=String(name||'').trim().toLowerCase();
 return RUSSIAN_ITRA_RIVALS.some(r=>r.name.toLowerCase()===n);
}

function attachRivalNamesToVirtualField(){
 if(!run || !Array.isArray(run.virtualField)) return;

 const levelIndex=Number(game.current||0);
 const field=[...run.virtualField].sort((a,b)=>a.finishSec-b.finishSec);

 let names=[];
 if(levelIndex>=7){
   // Первые 7 имён — ровно те же, что показаны до старта.
   const shown=[...(run.raceLeaders||leadersForRace(game.current))].slice(0,14);
   names=[...shown];

   const ru=shuffledCopy(RUSSIAN_ITRA_RIVALS.map(r=>r.name))
     .filter(n=>!names.includes(n));
   const intl=shuffledCopy(TOP_ITRA_LEADERS)
     .filter(n=>!names.includes(n));

   names.push(...ru);
   names.push(...intl);
 }else{
   names=[...(run.raceLeaders||[])];
 }

 let seed=(game.current+1)*10000+(game.completed||0)*101;
 for(let i=0;i<field.length;i++){
   const c=field[i];
   c.name=names[i] || randomFio(seed+i*37);
   c.country=isRussianEliteName(c.name)?'RU':'';
   const ruData=RUSSIAN_ITRA_RIVALS.find(r=>r.name===c.name);
   if(ruData) c.itra=ruData.itra;
 }
}

const RANDOM_FIRST_NAMES=['Алексей','Илья','Дмитрий','Сергей','Максим','Андрей','Никита','Роман','Антон','Егор','Мария','Анна','Елена','Ольга','Дарья','Ирина','Алина','Виктория'];
const RANDOM_LAST_NAMES=['Волков','Орлов','Соколов','Лебедев','Морозов','Крылов','Белов','Громов','Зайцев','Титов','Смирнова','Орлова','Волкова','Белова','Морозова','Крылова','Соколова','Лебедева'];
function seededIndex(seed,n){ return Math.abs((seed*9301+49297)%233280)%n; }
function randomFio(seed){
 const first=RANDOM_FIRST_NAMES[seededIndex(seed*7+11,RANDOM_FIRST_NAMES.length)];
 let last=RANDOM_LAST_NAMES[seededIndex(seed*13+29,RANDOM_LAST_NAMES.length)];
 // Roughly match surname ending to first-name gender for more natural generated names.
 const female=['Мария','Анна','Елена','Ольга','Дарья','Ирина','Алина','Виктория'].includes(first);
 if(female && !last.endsWith('а')) last=last+'а';
 if(!female && last.endsWith('а')) last=last.slice(0,-1);
 return `${first} ${last}`;
}
function shuffledCopy(arr){
 const a=[...arr];
 for(let i=a.length-1;i>0;i--){
   const j=Math.floor(Math.random()*(i+1));
   [a[i],a[j]]=[a[j],a[i]];
 }
 return a;
}

function createLeadersForAttempt(raceIndex=game.current){
 // 1–7: один атлет TOP ITRA + случайные соперники.
 if(raceIndex<7){
   const top=TOP_ITRA_LEADERS[Math.floor(Math.random()*TOP_ITRA_LEADERS.length)];
   let a=randomFio(Math.floor(Math.random()*1000000));
   let b=randomFio(Math.floor(Math.random()*1000000));
   let guard=0;
   while((b===a || b===top) && guard++<20){
     b=randomFio(Math.floor(Math.random()*1000000));
   }
   const extras=[];
   while(extras.length<11){
     const x=randomFio(Math.floor(Math.random()*1000000));
     if(x!==top && x!==a && x!==b && !extras.includes(x)) extras.push(x);
   }
   return [top,a,b,...extras];
 }

 // С 8 уровня до старта показываем сильный состав лидеров.
 // На Чаре Анастасия Кабенина участвует всегда. На остальных гонках
 // она появляется иногда (примерно в 35% попыток), ITRA 850.
 const kabenina='Анастасия Кабенина';
 const isChara=Number(raceIndex)===12;
 const includeKabenina=isChara || Math.random()<0.35;
 const ru=shuffledCopy(RUSSIAN_ITRA_RIVALS.map(r=>r.name).filter(n=>n!==kabenina));
 const intl=shuffledCopy(TOP_ITRA_LEADERS);
 const combined=[...ru,...intl].filter((n,i,a)=>n!==kabenina && a.indexOf(n)===i);
 const need=includeKabenina?13:14;
 while(combined.length<need){
   const x=randomFio(Math.floor(Math.random()*1000000));
   if(x!==kabenina && !combined.includes(x)) combined.push(x);
 }
 return includeKabenina ? [...combined.slice(0,13),kabenina] : combined.slice(0,14);
}

function leadersForRace(raceIndex=game.current){
 // Во время конкретной попытки состав фиксирован, чтобы не менялся на каждом кадре.
 if(run && Array.isArray(run.raceLeaders) && run.raceLeaders.length>=14){
   return run.raceLeaders;
 }
 // До старта показываем реальный состав будущей группы лидеров.
 // Состав стабилен до нажатия "Старт".
 if(!game.preStartLeadersByRace) game.preStartLeadersByRace={};
 const key=String(raceIndex);
 const cached=game.preStartLeadersByRace[key];
 const mustHaveKabenina=Number(raceIndex)===12;
 if(!Array.isArray(cached) || cached.length<14 || (mustHaveKabenina && !cached.includes('Анастасия Кабенина'))){
   game.preStartLeadersByRace[key]=createLeadersForAttempt(raceIndex);
   try{ saveGame(); }catch(e){}
 }
 return game.preStartLeadersByRace[key];
}

function visibleLeaderName(name){
 return (run && run.running===true && run.startedByUser===true)
   ? name
   : 'Неизвестный участник';
}

function leaderKmForPosition(rank,L,playerKm,playerPos){
 const dist=L[1];
 const p=Math.max(1,Number(playerPos||18));

 // TOP-3 positions must agree with the displayed player place.
 // If the player is 1st, all three named rivals are slightly behind.
 // If the player is 2nd, only leader #1 is ahead; if 3rd — #1 and #2 are ahead.
 if(p===1){
   const behind=[0.010,0.018,0.026][rank-1]*dist;
   return Math.max(0,Math.min(dist,playerKm-behind));
 }
 if(p===2){
   if(rank===1) return Math.max(0,Math.min(dist,playerKm+0.014*dist));
   const behind=(rank===2?0.008:0.018)*dist;
   return Math.max(0,Math.min(dist,playerKm-behind));
 }
 if(p===3){
   if(rank<=2) return Math.max(0,Math.min(dist,playerKm+(rank===1?0.016:0.008)*dist));
   return Math.max(0,Math.min(dist,playerKm-0.008*dist));
 }

 // Outside TOP-3 the leaders stay ahead. The gap gradually shrinks through the race.
 const base=[0.055,0.040,0.028][rank-1]*dist;
 const dynamic=base*(0.65+0.35*(1-(run?.p||0)));
 return Math.max(0,Math.min(dist,playerKm+dynamic));
}

function leaderKmFor(rank,L,playerKm){
 if(!run || !run.running) return 0;
 const rows=dynamicLeaderRows(L);
 const row=rows[Math.max(0,rank-1)];
 return row ? Math.max(0,Math.min(L[1],row.liveKm)) : 0;
}

function updateRaceTerrainOverlay(){
 const el=document.getElementById('raceTerrainOverlay');
 if(!el||!run) return;
 const gainEl=document.getElementById('raceGain');
 const slopeEl=document.getElementById('raceSlope');
 const gain=(gainEl?.textContent||'0 м').trim();
 const slope=(slopeEl?.textContent||'0%').trim();
 el.innerHTML=`⛰ ${gain}<br>↗ ${slope}`;
}

function renderRaceLeaders(playerKm=0){
 setTimeout(()=>{updateRaceTerrainOverlay();},0);
 const box=$('raceLeaders'); if(!box)return;
 const L=levelData();
 if($('leadersRaceName')) $('leadersRaceName').textContent=`${game.current+1}. ${L[0]}`;

 if(run && run.running){
   const npcRows=dynamicLeaderRows(L).map(r=>({
     player:false,
     c:r.c,
     name:String(r?.c?.name||'Участник'),
     liveKm:Number(r.liveKm||0)
   }));

   const pKm=Math.max(0,Math.min(Number(L[1]||0),Number(run.p||0)*Number(L[1]||0)));
   const allRows=[
     ...npcRows,
     {player:true,name:safeProfileNameForRace(),liveKm:pKm}
   ].sort((a,b)=>{
     if(run.finishWinnerHold){
       if(a.player) return -1;
       if(b.player) return 1;
     }
     return b.liveKm-a.liveKm;
   });

   const top14=allRows.slice(0,14);

   box.innerHTML=top14.map((r,i)=>{
     const km=Math.max(0,Math.min(L[1],Number(r.liveKm||0)));
     const status=km>=L[1]?'Финиш':`${km.toFixed(1)} км`;
     const cls=r.player?' race-leader-player':'';
     return `<div class="race-leader-row${cls}"><b>${i+1}</b><span>${r.name}</span><strong>${status}</strong></div>`;
   }).join('');
 }else{
   const names=leadersForRace();
   box.innerHTML=names.slice(0,14).map((name,i)=>
     `<div class="race-leader-row"><b>${i+1}</b><span>${name}</span><strong>на старте</strong></div>`
   ).join('');
 }
}
function xpNeeded(lvl){return 100+Math.floor(lvl*18)}
function addXp(n){
 game.xp+=Math.round(n);
 while(game.level<100 && game.xp>=xpNeeded(game.level)){
   game.xp-=xpNeeded(game.level); game.level++;
 }
 if(game.level>=100){game.level=100;game.xp=0}
}
function item(cat,idx=game.gear[cat]){return GEAR[cat][idx]}
function durKey(cat){return cat+'_'+game.gear[cat]}
function durability(cat){
 const key=durKey(cat), max=item(cat)[3];
 if(game.durability[key]==null) game.durability[key]=max;
 return game.durability[key];
}
function setDur(cat,v){game.durability[durKey(cat)]=Math.max(0,v)}


function applyAppVersion(){
 const v='v'+APP_VERSION;
 if($('appVersion')) $('appVersion').textContent=v;
 if($('footerVersion')) $('footerVersion').textContent=v;
}


function renderPreStartRaceState(L){
 if(run && run.running) return;
 // До фактического нажатия «Старт» никакие стартовые плашки не показываем.
 // Это особенно важно для Чары: «Миша с топором» появляется только ПОСЛЕ запуска гонки на 3 секунды.
 const preOv=$('eventOverlay');
 if(preOv){ preOv.classList.remove('show'); preOv.innerHTML=''; }
 if($('progressKm')) $('progressKm').textContent=`0.0 / ${Number(L[1]).toFixed(1)} км`;
 if($('clock')) $('clock').textContent='0:00:00';
 if($('progressBar')) $('progressBar').style.width='0%';
 if($('pace')) $('pace').textContent=fmt(Math.max(1,L[3])/Math.max(1,L[1]))+'/км';
 if($('position')) $('position').textContent='—';
 if($('penalties')) $('penalties').textContent='+0:00';
 if($('condition')) $('condition').textContent='ГОТОВ';
 if($('liveGain')){
   const _L=levelData();
   $('liveGain').textContent='0 м';
   $('liveGainTotal').textContent=`из ${Number(_L[2]||0).toLocaleString('ru-RU')} м`;
   $('liveSlope').textContent='0%';
   $('liveSlopeType').textContent='ровно';
 }
 if($('liveDnfStatus')) $('liveDnfStatus').textContent='🚫 Сошли: 0';
}


const NAME_BAD_WORDS=['хуй','хуя','хуе','хуи','хуйн','пизд','пезд','еба','еби','ебу','ёб','бля','бляд','сука','сучк','мраз','мудак','долбоеб','долбоёб','гандон','пидор','пидар','залуп','шлюх'];
function normName(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]/gi,'');}
function hasBadName(v){const n=normName(v);return NAME_BAD_WORDS.some(w=>n.includes(normName(w)));}

function safeProfileNameForRace(){
  try{
    const candidates=[
      game?.playerName,
      game?.profileName,
      game?.runnerName,
      document.querySelector('#playerName')?.value,
      document.querySelector('#profileName')?.value,
      localStorage.getItem('playerName'),
      localStorage.getItem('profileName'),
      localStorage.getItem('runnerName')
    ];
    for(const v of candidates){
      const s=String(v??'').trim();
      if(s) return s;
    }
  }catch(e){}
  return 'Вы';
}

function safePlayerName(){const n=String(game.playerName||'').trim();return n&&!hasBadName(n)?n:'Трейлраннер';}


function fitPlayerNameFont(){
  try{
    const el=document.querySelector('#playerName');
    if(!el) return;
    const n=String(el.value||'').trim().length;
    el.style.fontSize = n>24 ? '17px' : n>18 ? '18px' : n>13 ? '20px' : '22px';
  }catch(e){}
}

function hospitalRemainingMs(){return Math.max(0,(game.hospitalUntil||0)-Date.now())}
function isInHospital(){return hospitalRemainingMs()>0}
function needsHospitalTreatment(){return !!game.needsHospital}
function startHospitalTreatment(){
 if(run&&run.running){showGameError('Во время гонки лечение недоступно');return}
 if(isInHospital())return;
 if(!needsHospitalTreatment()){showGameError('Лечение не требуется: перелома нет.');updateRestUi();return;}
 game.restUntil=0; game.trainingUntil=0;
 game.hospitalUntil=Date.now()+5*60*1000;
 // Лечение одновременно является полным восстановлением: после окончания усталость будет 0%.
 saveGame();render();updateRestUi();
}
function finishHospitalIfReady(){
 if((game.hospitalUntil||0)>0 && Date.now()+900>=game.hospitalUntil){
   game.hospitalUntil=0;
   game.needsHospital=false;
   game.fatigue=0;
   saveGame();
 }
}
const LEVEL_ACHIEVEMENTS=[
 'Первые следы','Каменный характер','Дождевой волк','Ночная смена','Горный характер',
 'Без паники','Технический трейл','Охотник за километрами','Железные ноги','Десятка уровней',
 'Предел выносливости','Пыль и кровь','Упрямый трейлраннер','Сотня','Дальний рубеж',
 'Пустая трасса','Экспедиция','Полярная воля','ПредАрмагеддон','Армагеддон'
];
function tryAwardLevelAchievement(levelIndex=game.current){
 const idx=Math.max(0,Math.min(19,Number(levelIndex||0)));
 const key=String(idx+1);
 if(game.achievements?.[key]) return false;
 // Редкая ачивка: около 6% на финиш этого уровня, пока она не получена.
 // Раньше шанс был слишком высоким, поэтому плашка появлялась почти постоянно.
 if(Math.random()>=0.06) return false;
 if(!game.achievements)game.achievements={};
 game.achievements[key]={name:LEVEL_ACHIEVEMENTS[idx],date:Date.now()};
 return true;
}
function renderAchievements(){
 const g=$('achievementsGrid');if(!g)return;
 const a=game.achievements||{};
 g.innerHTML=LEVEL_ACHIEVEMENTS.map((name,i)=>{
   const got=a[String(i+1)];
   return `<div class="achievement-item ${got?'earned':''}"><b>${got?'🏆':'🔒'} ${i+1}. ${name}</b><small>${got?'Редкая ачивка собрана':'Редкая ачивка этого уровня ещё не найдена'}</small></div>`;
 }).join('');
}
function render(){
 fitPlayerNameFont();
 applyAppVersion();
 const raceShoppingLocked=!!(run&&run.running);
 const restRaceLocked=raceShoppingLocked;
 const restBtnRace=$('restBtn');
 if(restBtnRace){
   restBtnRace.disabled=restRaceLocked || isResting() || Number(game.fatigue||0)<=0;
   restBtnRace.title=restRaceLocked?'Во время гонки отдых недоступен':'';
 }
 const shopJump=$('scrollShopBtn');
 if(shopJump){
   shopJump.disabled=raceShoppingLocked;
   shopJump.title=raceShoppingLocked?'Покупки недоступны до финиша':'Купить / сменить экипировку';
 }
 keepEquippedGear();

 const repairBtn=$('repairAllBtn');
 if(repairBtn){
   const repairCost=totalRepairCost();
   const raceLocked=!!(run&&run.running);
   repairBtn.textContent=repairCost>0 ? `🔧 Починить всё — ${fmtMoney(repairCost)}` : '✅ Всё исправно';
   repairBtn.disabled=raceLocked || repairCost<=0 || game.money<repairCost;
   repairBtn.title=raceLocked
     ? 'Во время гонки ремонт недоступен'
     : repairCost<=0
       ? 'Экипировка полностью исправна'
       : game.money<repairCost
         ? `Не хватает рублей. Нужно ${fmtMoney(repairCost)}`
         : `Полностью восстановить надетую экипировку за ${fmtMoney(repairCost)}`;
 }

 const L=levelData();
 const jumpLastBtn=$('jumpToLastUnplayedBtn');
 const replayNav=$('replayLevelNav');
 const campaignReplayBtn=$('openCampaignFromRaceBtn');
 {
   const target=Math.max(0,Math.min(LEVELS.length-1,Number(game.completed||0)));
   const hasUnplayed=Number(game.completed||0)<LEVELS.length;
   const outsideRace=!(run&&run.running);
   const replayingPassed=outsideRace && Number(game.current||0)<Number(game.completed||0);
   const shouldShowJump=outsideRace && hasUnplayed && Number(game.current||0)!==target;
   // Кампания доступна на любом выбранном уровне, пока гонка не запущена.
   // На пройденном уровне дополнительно показываем переход к последнему непройденному.
   const showNav=outsideRace && (replayingPassed || shouldShowJump || true);
   if(replayNav) replayNav.style.display=showNav?'flex':'none';
   if(campaignReplayBtn){
     campaignReplayBtn.style.display=outsideRace?'inline-flex':'none';
     campaignReplayBtn.disabled=!outsideRace;
     campaignReplayBtn.title=outsideRace?'Выбрать любой доступный уровень в Кампании':'Кампания недоступна во время гонки';
   }
   if(jumpLastBtn){
     jumpLastBtn.style.display=shouldShowJump?'inline-flex':'none';
     jumpLastBtn.disabled=!shouldShowJump;
     jumpLastBtn.textContent=shouldShowJump?`⏭ К последнему уровню · ${target+1}`:'⏭ К последнему уровню';
     jumpLastBtn.title=shouldShowJump?`Перейти к первому ещё не пройденному уровню №${target+1}`:'';
   }
 }
 $('runnerLevel').textContent=game.level;
 $('xpText').textContent=game.level>=100?'MAX':`${game.xp} / ${xpNeeded(game.level)} XP до следующего уровня`;
 $('money').textContent=fmtMoney(game.money);
 $('completed').textContent=`${game.completed} / ${LEVELS.length}`;
 $('rep').textContent=game.rep;
 $('wins').textContent=game.wins||0;
 if($('racePlayerName')) $('racePlayerName').innerHTML='Вы: <strong style="color:#eef5ff">'+safePlayerName().replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</strong>';
 if($('playerNameInput') && document.activeElement!==$('playerNameInput')) $('playerNameInput').value=game.playerName||'';
 ensureResources();ensureTraining();
 const restMs=restRemainingMs();
 $('fatigueValue').textContent=Math.round(game.fatigue)+'%';
 if($('restFatigueValue')) $('restFatigueValue').textContent=Math.round(game.fatigue)+'%';
 $('fatigueBar').style.width=Math.min(100,game.fatigue)+'%';
 $('fatigueBar').className=game.fatigue>=80?'danger-fatigue':game.fatigue>=55?'warn-fatigue':'';
 $('restText').textContent=restMs>0?'отдых ещё '+fmtRest(restMs):game.fatigue>=70?'нужен отдых':'готов к гонке';
 $('gelCount').textContent=String(game.resources.gels||0);
 const gelNeedNow=gelsNeeded(L);
 $('gelNeedText').textContent='на эту гонку нужно ≈ '+gelNeedNow;
 const gelQuick=$('quickBuyGels');
 if(gelQuick){
   const miss=Math.max(0,gelNeedNow-Number(game.resources.gels||0));
   gelQuick.classList.toggle('quick-buy-ok',miss===0);
   const h=gelQuick.querySelector('.quick-buy-hint');
   if(h) h.textContent=miss===0?'Запас на гонку готов':`Докупить ${miss} шт. · ${fmtMoney(miss*RESOURCE_CATALOG.gels.price)}`;
 }
 if(isRechargeableLamp()){
   $('lampPowerText').textContent='🔋 АКБ '+Math.round(game.lampCharge)+'%';
   $('lampPowerSub').textContent=`запасных АКБ: ${game.resources.accumulator||0} · ${game.resources.powerbank>0?'powerbank есть':'без powerbank'}`;
   const carrySwap=$('carrySwapLampBatteryBtn');
   if(carrySwap){
     const canSwap=Number(game.resources.accumulator||0)>0 && Number(game.lampCharge||0)<100;
     carrySwap.style.display=canSwap?'block':'none';
     carrySwap.disabled=!canSwap;
     carrySwap.textContent=`🔋 Поставить заряженный АКБ · запас ${game.resources.accumulator||0}`;
   }
 }else{
   $('lampPowerText').textContent='🔦 '+game.resources.batteries+' компл.';
   $('lampPowerSub').textContent='фонарь на батарейках';
   const carrySwap=$('carrySwapLampBatteryBtn'); if(carrySwap) carrySwap.style.display='none';
 }
 const lampQuick=$('quickBuyLampPower');
 if(lampQuick){
   const lampHours=lampHoursNeeded(L);
   const hint=lampQuick.querySelector('.quick-buy-hint');
   let ready=true, hintText='Питание фонаря готово';
   if(isRechargeableLamp()){
     const requiredCharge=Math.min(100,Math.ceil(lampHours/8*100));
     if(lampHours>0 && game.lampCharge<requiredCharge && Number(game.resources.powerbank||0)<=0){
       ready=false; hintText=`Докупить powerbank · ${fmtMoney(RESOURCE_CATALOG.powerbank.price)}`;
     }
   }else{
     const needBat=Math.ceil(lampHours/5);
     const miss=Math.max(0,needBat-Number(game.resources.batteries||0));
     if(miss>0){ ready=false; hintText=`Докупить ${miss} компл. · ${fmtMoney(miss*RESOURCE_CATALOG.batteries.price)}`; }
   }
   lampQuick.classList.toggle('quick-buy-ok',ready);
   if(hint) hint.textContent=hintText;
 }
 const medReadyKits=Number(game.resources.medkits||0);
 $('medkitSummary').textContent=medReadyKits>0?`${medReadyKits} готов. компл. + ${medkitScore()}/7`:medkitScore()+'/7';
 const medQuick=$('quickBuyMedkit');
 if(medQuick){
   const medKeys=['bandage','gauze','peroxide','plaster','cream','sunCream','rescueBlanket'];
   const missing=medKeys.filter(k=>Number(game.resources[k]||0)<=0);
   const cost=missing.reduce((s,k)=>s+RESOURCE_CATALOG[k].price,0);
   medQuick.classList.toggle('quick-buy-ok',medReadyKits>0||missing.length===0);
   const h=medQuick.querySelector('.quick-buy-hint');
   if(h) h.textContent=medReadyKits>0?`Готовых комплектов: ${medReadyKits}`:(missing.length===0?'Аптечка укомплектована':`Докупить ${missing.length} поз. · ${fmtMoney(cost)}`);
 }
 ensureTraining();
 if($('fitnessText'))$('fitnessText').textContent=`${Math.round(game.fitness)} / 100`;
 if($('coachText'))$('coachText').textContent=COACHES[game.coach]?.name||'Без тренера';
 if($('itraText'))$('itraText').textContent=Math.round(game.itra);
 if($('itraNameText')) $('itraNameText').textContent=safePlayerName();
 if($('itraRankText'))$('itraRankText').textContent=`место в базе: ${ELITE_RUNNERS.filter(r=>r.itra>game.itra).length+1}`;
 const rescueBlanketTotal=Number(game.resources.rescueBlanket||0)+Number(game.resources.medkits||0);
 if($('rescueBlanketText')) $('rescueBlanketText').textContent=`🆘 ${rescueBlanketTotal} шт.`;
 if($('rescueBlanketSub')) $('rescueBlanketSub').textContent=rescueBlanketTotal>0?'50/50 против погодного DNF':'нет защиты от погодного DNF';
 const raceWeather=weatherForLevel();
 const waterNeedNow=waterBottlesNeeded(L,raceWeather);
 if($('waterCount')) $('waterCount').textContent=String(game.resources.waterBottles||0);
 if($('waterNeedText')) $('waterNeedText').textContent=`на эту гонку нужно ≈ ${waterNeedNow} × 0,5 л`;
 // Compact “С собой” screen in bottom navigation.
 if($('carryGels')) $('carryGels').textContent=`${Number(game.resources.gels||0)} шт.`;
 if($('carryGelsNeed')) $('carryGelsNeed').textContent=`на текущую гонку нужно ≈ ${gelNeedNow}`;
 if($('carryMedkit')) $('carryMedkit').textContent=medReadyKits>0?`${medReadyKits} готов. компл. + ${medkitScore()}/7`:`${medkitScore()}/7`;
 if($('carryMedkitStatus')) $('carryMedkitStatus').textContent=medReadyKits>0?'готовый комплект куплен':(medkitScore()>=7?'аптечка укомплектована':'нужно докупить компоненты');
 if($('carryWater')) $('carryWater').textContent=`${Number(game.resources.waterBottles||0)} × 0,5 л`;
 if($('carryWaterNeed')) $('carryWaterNeed').textContent=`на текущую гонку нужно ≈ ${waterNeedNow} × 0,5 л`;
 const waterQuick=$('quickBuyWater');
 if(waterQuick){
   const miss=Math.max(0,waterNeedNow-Number(game.resources.waterBottles||0));
   const cost=miss*RESOURCE_CATALOG.waterBottles.price;
   waterQuick.classList.toggle('quick-buy-ok',miss===0);
   const h=waterQuick.querySelector('.quick-buy-hint');
   if(h) h.textContent=miss===0?'Запас воды готов':`Докупить ${miss} бут. · ${fmtMoney(cost)}`;
 }
 if($('weatherText')) $('weatherText').textContent=`${raceWeather.emoji} ${raceWeather.name}`;
 if($('weatherSub')){
   const reqMem=membraneRequiredLevel(L,raceWeather);
   $('weatherSub').textContent=`${raceWeather.temp}°C${reqMem>0?` · нужна мембранка ур. ${reqMem}/7+`:(raceWeather.rain||raceWeather.cold?' · мембранка не обязательна на этом уровне':'')}`;
 }
 if($('sunText')) $('sunText').textContent=`${raceWeather.sun}%`;
 if($('sunSub')) $('sunSub').textContent=raceWeather.sun>=80?'высокий расход воды':raceWeather.sun>=45?'средний расход воды':'низкий расход воды';
 const bottlesNeed=waterBottlesNeeded(L,raceWeather);
 if($('raceWaterNeed')) $('raceWaterNeed').textContent=bottlesNeed>0?`${bottlesNeed} × 0,5 л`:'не требуется';
 if($('raceWaterCapacity')) $('raceWaterCapacity').textContent=`гидратор ${hydrationCapacityLiters().toFixed(1).replace('.0','')} л + бутылки`;
 if($('raceWaterLive')) $('raceWaterLive').textContent=run&&run.running?`${(Number(run.waterRemaining||0)*0.5).toFixed(1).replace('.0','')} л / ${(Number(run.waterStart||0)*0.5).toFixed(1).replace('.0','')} л`:'—';
 $('raceTitle').textContent=`${game.current+1}. ${L[0]}`;
 if($('simulationRaceTitle')) $('simulationRaceTitle').textContent=`${game.current+1}. ${L[0]}`;
 $('raceDistance').textContent=L[1]+' км';
 $('raceGain').textContent=L[2]+' м';
 $('raceTarget').textContent=fmt(L[3]);
 $('raceReward').textContent='база '+fmtMoney(L[4]);
 if($('raceSlotCostCurrent')) $('raceSlotCostCurrent').textContent=game.current<3?'Бесплатно':hasRaceSlot()?`✅ Куплен · ${fmtMoney(raceSlotCost())}`:fmtMoney(raceSlotCost());
 if($('raceSlotCostCurrentStatus')) $('raceSlotCostCurrentStatus').textContent=game.current<3?'первые 3 уровня без оплаты':hasRaceSlot()?'слот этой гонки уже оплачен':'нужно купить перед стартом';
 const rr=$('raceReward')?.parentElement;
 if(rr){
   let note=rr.querySelector('.reward-place-note');
   if(!note){
     note=document.createElement('small');
     note.className='reward-place-note';
     rr.appendChild(note);
   }
   note.textContent='Чем выше место на финише, тем больше рублей. За сильный результат выплата может быть выше базовой суммы.';
 }
 $('difficultyBadge').textContent='★'.repeat(L[5])+'☆'.repeat(5-L[5]);
 $('raceDesc').textContent=L[6];
 renderPreStartRaceState(L);
 renderRaceSlot();
 renderCoachRaceEffects();
 updateRaceGuaranaButton();
 refreshRaceRisks();
 renderLevels();renderShop();renderGear();renderAchievements();renderRaceGearSummary();renderResources();renderLampPower();updateRestUi();updateRaceStartTrainingLock();renderRaceLeaders(0);drawTrack(0);
}
function renderLevels(){
 const g=$('levelsGrid');g.innerHTML='';
 LEVELS.forEach((L,i)=>{
  const d=document.createElement('div');
  const locked=i>game.completed;
  d.className='level '+(i<game.completed?'done ':i===game.current?'current ':'')+(locked?'locked':'');
  const slotOwned=hasRaceSlot(i);
  d.innerHTML=`<h3>${i+1}. ${L[0]}</h3><div class="meta">${L[1]} км · +${L[2]} м · цель ${fmt(L[3])}<br><span class="money">до ${fmtMoney(L[4])}</span><br><span class="slot-price">🎟️ слот: ${i<3?'Бесплатно':fmtMoney(raceSlotCost(i))}${i<3?'':slotOwned?' · ✅ куплен':''}</span></div>
  <button class="secondary" ${locked?'disabled':''} data-level="${i}">${i<game.completed?'Переиграть':i===game.current?'Текущий уровень':'Выбрать'}</button>`;
  g.appendChild(d);
 });
 g.querySelectorAll('button[data-level]').forEach(b=>b.onclick=()=>{
  game.current=+b.dataset.level;
  saveGame();
  render();
  switchTab('race');
  // При выборе или переигрывании уровня через Кампанию сразу поднимаем
  // экран симуляции максимально вверх, как и у кнопки «К последнему уровню».
  const scrollSimulationTop=()=>{
    const sim=document.querySelector('#race .sim-card');
    const topbar=document.querySelector('.topbar');
    if(!sim) return;
    const topOffset=(topbar?topbar.getBoundingClientRect().height:0)+4;
    const y=Math.max(0,sim.getBoundingClientRect().top+window.scrollY-topOffset);
    window.scrollTo({top:y,behavior:'smooth'});
  };
  // После смены уровня сразу пересчитать воду, гели, аптечку и питание фонаря,
  // чтобы игрок видел дефицит до старта гонки.
  setTimeout(refreshRaceRisks,20);
  setTimeout(refreshRaceRisks,180);
  setTimeout(scrollSimulationTop,80);
  setTimeout(scrollSimulationTop,360);
 });
}
let activeShopCategory='shoes';
function renderShop(){
 const tabs=$('shopCategoryTabs'),g=$('shopGrid');
 if(!tabs||!g)return;
 keepEquippedGear();

 const cats=Object.keys(GEAR);
 if(!cats.includes(activeShopCategory)) activeShopCategory=cats[0];

 tabs.innerHTML='';
 cats.forEach(cat=>{
   const b=document.createElement('button');
   b.className='shop-cat-btn '+(cat===activeShopCategory?'active':'');
   b.textContent=CATEGORY_NAMES[cat];
   b.onclick=()=>{activeShopCategory=cat;renderShop()};
   tabs.appendChild(b);
 });

 g.innerHTML='';
 const list=GEAR[activeShopCategory]||[];
 list.forEach((it,idx)=>{
   const equipped=game.gear[activeShopCategory]===idx;
   const purchased=(game.gearOwned[activeShopCategory]||[]).includes(idx);
   const d=document.createElement('div');
   d.className='shop-item equipment-card';
   const lvl=idx+1;
   let label,disabled=false,cls='primary';
   if(equipped){
     label=durability(activeShopCategory)<=0?'✓ Надето · сломано':'✓ Надето';
     disabled=true; cls='secondary equipped-btn';
   }else if(purchased){
     label='Надеть';
     cls='secondary';
   }else if(game.money<it[1]){
     label=`Не хватает ${fmtMoney(it[1]-game.money)}`;
     disabled=true;
   }else{
     label='Купить и надеть';
   }
   const prep=equipmentPreparedness(activeShopCategory,levelData(),weatherForLevel());
   d.innerHTML=`<div class="equipment-card-title"><b>${CATEGORY_NAMES[activeShopCategory]} · ур. ${lvl}/7 · ${it[0]}</b>${equipped?'<span class="equipped-badge">НАДЕТО</span>':''}</div>
     <div class="shop-item-detail-body">
       <div class="meta">
         Цена: <span class="money">${fmtMoney(it[1])}</span><br>
         Эффект: ${gearEffectText(activeShopCategory,idx,it)}<br>
         Прочность: ${it[3]} ед. · защита от поломки +${Math.round(it[4]*100)}%<br>
         Для текущей гонки: желательно <b>${prep.required}/7</b> · у тебя <b>${prep.current}/7</b>${prep.gap?` · ⚠️ недобор ${prep.gap} ур.`:' · ✅ уровень подходит'}
       </div>
       <button class="${cls}" ${disabled?'disabled':''} data-buy="${activeShopCategory}:${idx}">
         ${label}
       </button>
     </div>`;
   g.appendChild(d);
 });

 g.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{
   if(purchasesLockedDuringRace())return;
   const [cat,idxS]=b.dataset.buy.split(':'),idx=+idxS,it=GEAR[cat][idx];
   keepEquippedGear();
   const purchased=(game.gearOwned[cat]||[]).includes(idx);
   if(!purchased){
     if(game.money<it[1])return;
     game.money-=it[1];
     game.gearOwned[cat].push(idx);
     game.durability[cat+'_'+idx]=it[3];
   }
   game.gear[cat]=idx;
   if(game.durability[cat+'_'+idx]==null) game.durability[cat+'_'+idx]=it[3];
   saveGame();
   render();
 });
}
function gearEffectText(cat,idx,it){
  if(cat==='shoes') return idx===0?'базовая скорость':`скорость +${Math.round((1-it[2])*100)}%`;
  if(cat==='poles') return idx>=3?`LEKI · скорость на подъёмах +${idx>=6?12:idx===5?9:idx===4?6:3}%`:(idx===0?'без бонуса':'помощь на подъёмах');
  if(cat==='jacket') return idx===0?'защита от дождя отсутствует':`защита от дождя · ур. ${idx+1}`;
  if(cat==='lamp') return idx>=4?`аккумулятор · ур. ${idx+1} + сменный АКБ / powerbank`:'работает на батарейках';
  if(cat==='pack') return `перенос снаряжения · ур. ${idx+1}`;
  if(cat==='watch') return idx===0?'пустой слот · навигации нет':`GPS/навигация · ур. ${idx+1}`;
  if(cat==='medkit') return `ёмкость ${idx+1} компл. · защита от травм · ур. ${idx+1}`;
  if(cat==='hrm') return `точность раскладки темпа: ${55+idx*7}% · подсказка темпа во время гонки`;
  if(cat==='hydration') return `вместимость ${hydrationCapacityLiters(idx).toFixed(1).replace('.0','')} л · запас воды снижает риск жажды и штрафов`;
  return '';
}
function renderRaceGearSummary(){
 const g=$('raceGearSummary'); if(!g) return;
 g.innerHTML='';
 if(run && run.running && run.eventResourceSpend){
   const labels={bandage:'бинт',gauze:'марля',peroxide:'перекись',plaster:'пластырь',cream:'крем от натирания',sunCream:'крем от солнца',rescueBlanket:'спас. одеяло',gels:'гель «УГЛИ»',medkits:'комплект аптечки'};
   const spent=Object.entries(run.eventResourceSpend).filter(([,v])=>Number(v)>0);
   if(spent.length){
     const box=document.createElement('div'); box.className='notice warning-note race-spend-note';
     box.innerHTML='<b>🩹 Потрачено на событиях:</b> '+spent.map(([k,v])=>`−${v} ${labels[k]||k}`).join(' · ');
     g.appendChild(box);
   }
 }
 Object.keys(GEAR).forEach(cat=>{
   const idx=Number(game.gear[cat]||0),it=item(cat),cur=durability(cat),max=it[3];
   const pct=Math.max(0,Math.min(100,cur/max*100));
   const slot=document.createElement('div'); slot.className='race-gear-slot '+(pct<20?'gear-danger':pct<50?'gear-warn':'');
   slot.innerHTML=`<div class="gear-slot-title"><b>${CATEGORY_NAMES[cat]}</b><span>ур. ${idx+1}/7</span></div>
     <div class="equipped-line"><span class="equipped-badge">${cur<=0?'НАДЕТО · СЛОМАНО':'НАДЕТО'}</span></div>
     <strong>${it[0]}</strong>
     <div class="gear-slot-effect">${gearEffectText(cat,idx,it)}${cat==='hydration' ? `<br><b>В гонку:</b> ${run&&run.running ? `${(Number(run.waterRemaining||0)*0.5).toFixed(1).replace('.0','')} л осталось из ${(Number(run.waterStart||0)*0.5).toFixed(1).replace('.0','')} л` : `можно нести до ${hydrationCapacityLiters(idx).toFixed(1).replace('.0','')} л`}` : ''}</div>
     <div class="durability"><div style="width:${pct}%"></div></div>
     <small>прочность ${Math.round(pct)}% · доступно уровней: 1–7</small>`;
   g.appendChild(slot);
 });
}

function renderGear(){
 const g=$('gearGrid');g.innerHTML='';
 Object.keys(GEAR).forEach(cat=>{
  const it=item(cat),cur=durability(cat),max=it[3],pct=Math.max(0,Math.min(100,cur/max*100));
  const d=document.createElement('div');d.className='gear-item';
  d.innerHTML=`<h3>${CATEGORY_NAMES[cat]} · ${it[0]}</h3>
  <div class="equipped-line"><span class="equipped-badge">${cur<=0?'НАДЕТО · СЛОМАНО':'НАДЕТО'}</span></div>
  <div class="meta">Прочность ${Math.round(cur)} / ${max}</div>
  <div class="durability"><div style="width:${pct}%"></div></div><div class="meta">${pct<=0?'❌ сломано, но остаётся надето':pct<20?'⚠️ высокий риск поломки':pct<50?'изношено':'состояние нормальное'}</div>`;
  g.appendChild(d);
 });
}
function medkitComponentsReady(){
 const r=game.resources||{};
 return ['bandage','gauze','peroxide','plaster','cream','sunCream','rescueBlanket'].every(k=>Number(r[k]||0)>0);
}
function assembleMedkit(){
 if(purchasesLockedDuringRace()){showGameError('Во время гонки сборка аптечки недоступна');return}
 if(!medkitComponentsReady()){showGameError('Нужны: бинт, марля, перекись, пластырь, крем от натирания, крем от солнца и спасательное одеяло.');return}
 ['bandage','gauze','peroxide','plaster','cream','sunCream','rescueBlanket'].forEach(k=>useResource(k));
 game.resources.medkits=(Number(game.resources.medkits)||0)+1;
 saveGame();render();
}
function renderResources(){
 const g=$('resourceGrid');if(!g)return;g.innerHTML='';
 const kit=document.createElement('div');kit.className='shop-item medkit-assembly';
 const kitCount=Number(game.resources.medkits||0);
 kit.innerHTML=`<h3>🧰 Сборка аптечек</h3>
   <div class="meta">Готовых комплектов: <b>${kitCount}</b><br>1 комплект = бинт + марля + перекись + пластырь + крем от натирания + крем от солнца + спасательное одеяло.<br>На сложных гонках можно взять несколько комплектов.</div>
   <button class="primary" id="assembleMedkitBtn" ${medkitComponentsReady()?'':'disabled'}>Собрать аптечку</button>`;
 g.appendChild(kit);
 $('assembleMedkitBtn')?.addEventListener('click',assembleMedkit);
 Object.entries(RESOURCE_CATALOG).filter(([key])=>key!=='medkits').forEach(([key,it])=>{
   const count=Number(game.resources[key]||0);
   const d=document.createElement('div');d.className='shop-item';
   const oneOnly=key==='powerbank';
   d.innerHTML=`<h3>${it.name}</h3>
     <div class="meta">${it.desc}<br>В наличии: <b>${count}</b> ${it.unit}<br><span class="money">${fmtMoney(it.price)}</span></div>
     <button class="primary" ${(oneOnly&&count>0)||game.money<it.price?'disabled':''} data-resource-buy="${key}">
       ${oneOnly&&count>0
         ? 'Уже куплен'
         : game.money<it.price
           ? `Не хватает ${fmtMoney(it.price-game.money)}`
           : 'Купить'}
     </button>`;
   g.appendChild(d);
 });
 g.querySelectorAll('[data-resource-buy]').forEach(b=>b.onclick=()=>{
   const key=b.dataset.resourceBuy,it=RESOURCE_CATALOG[key];
   if(game.money<it.price){showGameError('Не хватает '+fmtMoney(it.price-game.money));return}
   game.money-=it.price;game.resources[key]=(game.resources[key]||0)+1;saveGame();render();
 });
}

function renderLampPower(){
 const p=$('lampPowerPanel');if(!p)return;
 const idx=Number(game.gear.lamp),it=item('lamp');
 if(idx>=4){
   p.innerHTML=`<div class="gear-item"><h3>${it[0]} · аккумулятор</h3>
   <div class="meta">Заряд: ${Math.round(game.lampCharge)}% · сменных аккумуляторов: ${game.resources.accumulator||0} · powerbank: ${game.resources.powerbank>0?'есть':'нет'}</div>
   <div class="durability"><div style="width:${Math.max(0,Math.min(100,game.lampCharge))}%"></div></div>
   <button id="swapLampBatteryBtn" class="secondary" ${(game.resources.accumulator||0)<=0||game.lampCharge>=100?'disabled':''}>🔋 Поставить заряженный аккумулятор</button>
   <button id="chargeLampBtn" class="secondary" ${game.resources.powerbank<=0||game.lampCharge>=100?'disabled':''}>⚡ Зарядить от powerbank</button></div>`;
   $('swapLampBatteryBtn')?.addEventListener('click',()=>{
     if((game.resources.accumulator||0)<=0)return;
     useResource('accumulator',1);game.lampCharge=100;saveGame();render();
   });
   $('chargeLampBtn')?.addEventListener('click',()=>{
     if(game.resources.powerbank<=0)return;
     game.lampCharge=100;saveGame();render();
   });
 }else{
   p.innerHTML=`<div class="gear-item"><h3>${it[0]} · батарейки</h3>
   <div class="meta">Комплектов батареек: ${game.resources.batteries}. Один комплект даёт примерно 5 часов света.</div></div>`;
 }
}

function updateRestUi(){
 finishHospitalIfReady();
 // If a started rest has reached its end, apply the recovery exactly once.
 // Previously the timer ended but fatigue itself was never changed.
 if((game.restUntil||0)>0 && Date.now()>=(game.restUntil||0)){
   game.fatigue=0;
   game.restUntil=0;
   saveGame();
 }
 const resting=isResting();
 const restMs=restRemainingMs();
 if($('fatigueValue')) $('fatigueValue').textContent=Math.round(Number(game.fatigue||0))+'%';
 if($('fatigueBar')){
   $('fatigueBar').style.width=Math.min(100,Number(game.fatigue||0))+'%';
   $('fatigueBar').className=game.fatigue>=80?'danger-fatigue':game.fatigue>=55?'warn-fatigue':'';
 }
 if($('restFatigueValue')) $('restFatigueValue').textContent=Math.round(Number(game.fatigue||0))+'%';

 if($('restBtn')){
   $('restBtn').disabled = !!(run&&run.running) || resting || trainingActive() || isInHospital() || needsHospitalTreatment() || Number(game.fatigue||0)<=0;
   $('restBtn').textContent = isInHospital()?`🏥 Лечение ${fmtRest(hospitalRemainingMs())}`:resting ? '😴 Отдых идёт…' : trainingActive() ? `🏃 Тренировка ${trainingCountdownText()}` : '😴 Отдых 1 минуту';
 }

 if($('restStatus')){
   $('restStatus').style.display=(resting||trainingActive()||isInHospital())?'block':'none';
   $('restStatus').textContent=isInHospital()?`🏥 Лечение идёт. До конца: ${fmtRest(hospitalRemainingMs())}. После лечения усталость будет 0%.`:
     resting ? `До полного отдыха: ${fmtRest(restMs)}. Старт гонки заблокирован.`
     : trainingActive() ? `Идёт тренировка. Отдых недоступен ещё ${trainingCountdownText()}.` : '';
 }
 if($('hospitalCard')){
   $('hospitalCard').style.display='block';
   const hs=$('hospitalStatus'),ht=$('hospitalTimer'),hb=$('hospitalBtn');
   if(isInHospital()){
     if(ht)ht.textContent=fmtRest(hospitalRemainingMs());
     if(hs)hs.textContent=`🏥 Лечение идёт. Осталось ${fmtRest(hospitalRemainingMs())}. Старт заблокирован.`;
     if(hb){hb.disabled=true;hb.textContent='🏥 Лечение идёт…';}
   }else if(needsHospitalTreatment()){
     if(ht)ht.textContent='требуется';
     if(hs)hs.textContent='🦴 Перелом требует лечения. Нажмите кнопку — лечение займёт 5 минут.';
     if(hb){hb.disabled=!!(run&&run.running);hb.textContent='🏥 Лечь на лечение · 5 минут';}
   }else{
     if(ht)ht.textContent='не требуется';
     if(hs)hs.textContent='Травмы, требующей больницы, нет.';
     if(hb){hb.disabled=true;hb.textContent='🏥 Лечение не требуется';}
   }
 }

 const startBtn=$('startBtn');
 if(startBtn && !(run&&run.running)){
   if(isInHospital() || needsHospitalTreatment()){
     startBtn.disabled=false;
     startBtn.textContent=isInHospital()?`🏥 Лечение ${fmtRest(hospitalRemainingMs())}`:'🏥 Требуется лечение';
     startBtn.dataset.treatmentJump='1';
   }else if(resting){
     startBtn.disabled=true;
     startBtn.textContent=`😴 Отдых ${fmtRest(restMs)}`;
     delete startBtn.dataset.treatmentJump;
   }else if(!trainingActive()){
     delete startBtn.dataset.treatmentJump;
     startBtn.disabled=!hasRaceSlot();
     startBtn.textContent='▶ Старт';
   }
 }

 const req=$('startRequirementsError');
 if(req && !(run&&run.running)){
   if(isInHospital()){
     req.innerHTML=`<b>🏥 Лечение перелома</b><ul><li>До окончания лечения: ${fmtRest(hospitalRemainingMs())}.</li><li>Старт гонки заблокирован.</li></ul>`;
     req.style.display='block';
   }else if(needsHospitalTreatment()){
     req.innerHTML=`<b>🦴 Требуется лечение перелома</b><ul><li>Сначала пройдите лечение в больнице.</li><li>Старт гонки заблокирован.</li></ul>`;
     req.style.display='block';
   }else if(resting){
     req.innerHTML=`<b>😴 Отдых идёт</b><ul><li>До полного отдыха: ${fmtRest(restMs)}.</li><li>Старт гонки заблокирован до окончания отдыха.</li></ul>`;
     req.style.display='block';
   }else if(/Отдых идёт/.test(req.textContent||'')){
     req.innerHTML='';
     req.style.display='none';
   }
 }
 // Keep the compact pre-start risk line synchronized with fatigue/rest state.
 // This fixes stale "усталость 100%" after rest has already completed.
 refreshRaceRisks();
}
setInterval(()=>{
 if($('restBtn')){
   updateRestUi();
   if($('restText')) $('restText').textContent=isInHospital()?'лечение ещё '+fmtRest(hospitalRemainingMs()):isResting()?'отдых ещё '+fmtRest(restRemainingMs()):game.fatigue>=70?'нужен отдых':'готов к гонке';
 }
 if($('startTrainingBtn')) renderTraining();
},1000);
$('playerNameInput')?.addEventListener('input',e=>{
  const v=(e.target.value||'').slice(0,40);
  if(hasBadName(v)){ e.target.setCustomValidity('Мат и оскорбительные слова запрещены'); e.target.reportValidity(); return; }
  e.target.setCustomValidity(''); game.playerName=v; if($('itraNameText')) $('itraNameText').textContent=safePlayerName(); saveGame();
});
$('playerNameInput')?.addEventListener('change',e=>{
  const v=(e.target.value||'').trim().slice(0,40);
  if(hasBadName(v)){ e.target.setCustomValidity('Мат и оскорбительные слова запрещены'); e.target.reportValidity(); e.target.value=game.playerName||''; return; }
  e.target.setCustomValidity(''); game.playerName=v; e.target.value=v; if($('itraNameText')) $('itraNameText').textContent=safePlayerName(); saveGame();
});

$('hospitalBtn')?.addEventListener('click',startHospitalTreatment);

$('restBtn')?.addEventListener('click',()=>{
  try{ if(typeof clearRaceOverlayQueue==='function') clearRaceOverlayQueue(); }catch(e){}
  if(run && run.running){ showGameError('Во время гонки отдых недоступен. Сначала завершите гонку.'); return; }
  if(isInHospital() || needsHospitalTreatment()){ showGameError(isInHospital()?`Во время лечения отдых недоступен. Осталось ${fmtRest(hospitalRemainingMs())}.`:'Сначала необходимо пройти лечение в больнице.'); return; }
  if(trainingActive()){showGameError(`Во время тренировки отдых недоступен. До конца тренировки: ${trainingCountdownText()}.`);updateRestUi();return;}
  if(isResting())return;
  if(Number(game.fatigue||0)<=0){updateRestUi();return;}
  game.restUntil=Date.now()+60*1000;saveGame();updateRestUi();renderTraining();
});

function trainingRemainingMs(){return Math.max(0,(game.trainingUntil||0)-Date.now())}
function trainingActive(){return trainingRemainingMs()>0}
function trainingCountdownText(){
 const ms=trainingRemainingMs();
 const s=Math.ceil(ms/1000),m=Math.floor(s/60),r=s%60;
 return `${m}:${String(r).padStart(2,'0')}`;
}
function updateRaceStartTrainingLock(){
 const b=$('startBtn');
 if(!b)return;
 if(run&&run.running){
   b.disabled=true;
   return;
 }
 // Лечение имеет абсолютный приоритет над остальными состояниями.
 // Это исключает мигание/краткое включение кнопки "Старт" между таймерами UI.
 if(isInHospital() || needsHospitalTreatment()){
   b.disabled=false;
   b.dataset.treatmentJump='1';
   b.textContent=isInHospital()?`🏥 Лечение ${fmtRest(hospitalRemainingMs())}`:'🏥 Требуется лечение';
   const el=$('startRequirementsError');
   if(el){
     el.innerHTML=isInHospital()
       ? `<b>🏥 Лечение перелома</b><ul><li>До окончания лечения: ${fmtRest(hospitalRemainingMs())}.</li><li>Старт гонки заблокирован.</li></ul>`
       : `<b>🦴 Требуется лечение перелома</b><ul><li>Сначала пройдите лечение в больнице.</li><li>Старт гонки заблокирован.</li></ul>`;
     el.style.display='block';
   }
   return;
 }
 if(trainingActive()){
   b.disabled=true;
   b.textContent=`🏃 Тренировка ${trainingCountdownText()}`;
   const el=$('startRequirementsError');
   if(el){
     el.innerHTML=`<b>🏃 Идёт тренировка</b><ul><li>Старт гонки будет доступен через ${trainingCountdownText()}.</li></ul>`;
     el.style.display='block';
   }
 }else{
   delete b.dataset.treatmentJump;
   if(isResting()){
     b.disabled=true;
     b.textContent=`😴 Отдых ${fmtRest(restRemainingMs())}`;
   }else{
     b.disabled=!hasRaceSlot();
     b.textContent='▶ Старт';
   }
   const el=$('startRequirementsError');
   if(el && /Идёт тренировка/.test(el.textContent||'')){
     el.style.display='none';
     el.innerHTML='';
   }
 }
}
function finishTrainingIfReady(){
 ensureTraining();
 if(game.trainingUntil && game.trainingUntil<=Date.now()){
   const coach=COACHES[game.coach]||COACHES[0];
   const cap=Math.min(100,Number(coach.fitnessCap||100));
   const before=Math.round(Number(game.fitness||0));
   const gain=before<cap ? Math.min(Number(coach.trainingGain||1),cap-before) : 0;
   game.fitness=Math.min(cap,Math.max(0,Number(game.fitness||0)+gain));
   game.trainingUntil=0;
   game.lastTrainingCoach=Number(game.coach||0); game.lastTrainingAt=Date.now(); game.fatigue=Math.min(100,Number(game.fatigue||0)+(Number(game.coach||0)>0?8:5));
   saveGame();
   return gain;
 }
 return false;
}

function activeRaceCoachIndex(){ return Number(game.lastTrainingAt||0)>Number(game.lastFinishAt||0) ? Number(game.lastTrainingCoach||0) : 0; }
function coachRaceBonuses(){ return coachRaceBonusesForIndex(activeRaceCoachIndex()); }

function renderCoachRaceEffects(){
 const el=$('coachRaceEffects'); if(!el) return;
 ensureTraining(); const idx=activeRaceCoachIndex(),coach=COACHES[idx]||COACHES[0];
 if(!game.lastTrainingAt){ el.innerHTML='<b>🏋️ Эффекты тренировки</b><small>Перед этой гонкой тренировки ещё не было.</small>'; return; } if(idx<=0){ el.innerHTML='<b>🏃 Обычная тренировка без тренера</b><small>Тренированность повышена, специальных бонусов темпа/усталости/подъёмов нет.</small>'; return; }
 const b=coachRaceBonusesForIndex(idx);
 el.innerHTML=`<b>🏋️ Получено от тренировки с ${coach.name}</b><small>Темп −${Math.round(b.pace*100)}% · усталость −${Math.round(b.fatigue*100)}% · подъёмы −${Math.round(b.climb*100)}% · риск травмы −${Math.round(b.injury*100)}%</small>`;
}
function coachRaceBonusesForIndex(idx){
 idx=Math.max(0,Number(idx||0));
 return {pace:[0,.02,.04,.06,.08][idx]||0,fatigue:[0,.04,.08,.11,.15][idx]||0,climb:[0,.03,.06,.08,.10][idx]||0,injury:[0,0,.01,.03,.05][idx]||0};
}
function coachSupportsCurrentRace(){
 const coach=COACHES[game.coach]||COACHES[0];
 const diff=levelData()[5];
 return coach.maxDifficulty>=diff;
}
function trainingSceneMarkup(){
 const ms=trainingRemainingMs();
 if(ms<=0){
   return `<div class="training-scene training-idle"><div class="training-scene-title">🐌 Готов к тренировке</div><div class="training-track"><div class="training-snail">🐌</div></div><div class="training-scene-caption">Спринт · интервалы · бег в горку · заминка</div></div>`;
 }
 const elapsed=Math.max(0,60000-ms);
 if(elapsed<15000){
   return `<div class="training-scene training-sprint"><div class="training-scene-title">⚡ Спринт на дорожке</div><div class="training-track"><div class="training-speed-lines"></div><div class="training-snail">🐌</div></div><div class="training-scene-caption">Улитка разгоняется всё быстрее</div></div>`;
 }
 if(elapsed<30000){
   return `<div class="training-scene training-intervals"><div class="training-scene-title">🏟️ Интервалы на стадионе</div><div class="training-track"><div class="training-snail">🐌</div></div><div class="training-scene-caption">Быстрый отрезок → восстановление → снова ускорение</div></div>`;
 }
 if(elapsed<45000){
   return `<div class="training-scene training-uphill"><div class="training-scene-title">⛰️ Бег в горку</div><div class="training-track"><div class="training-snail">🐌</div></div><div class="training-scene-caption">Тяжёлый подъём · мощная работа ног</div></div>`;
 }
 return `<div class="training-scene training-cooldown"><div class="training-scene-title">💦 Заминка</div><div class="training-track"><div class="training-snail">🐌</div><div class="snail-face">👅</div><div class="sweat-drop d1">💧</div><div class="sweat-drop d2">💦</div><div class="sweat-drop d3">💧</div></div><div class="training-scene-caption">Язык на плече, пот градом — тренировка почти закончена</div></div>`;
}
function renderTrainingAnimation(){
 const el=$('trainingAnimation');
 if(el) el.innerHTML=trainingSceneMarkup();
}

function renderTraining(){

 if(!$('coachGrid')) return;
 ensureTraining();
 const completedGain=finishTrainingIfReady();

 const trainingBtn=$('startTrainingBtn');
 if(trainingBtn){
   const restingNow=isResting();
   const hospitalNow=isInHospital() || needsHospitalTreatment();
   const trainingNow=trainingActive();
   trainingBtn.disabled = restingNow || hospitalNow || trainingNow || !!(run&&run.running) || Number(game.fitness||0)>=100;
   trainingBtn.title = hospitalNow ? 'Во время лечения тренировка недоступна' : restingNow ? `До окончания отдыха: ${fmtRest(restRemainingMs())}` : '';
   if(hospitalNow) trainingBtn.textContent=isInHospital()?`🏥 Лечение ${fmtRest(hospitalRemainingMs())}`:'🏥 Сначала лечение';
   else if(restingNow) trainingBtn.textContent=`😴 Отдых ${fmtRest(restRemainingMs())}`;
 }


 $('coachGrid').innerHTML='';
 COACHES.forEach((coach,i)=>{
   const d=document.createElement('div');
   d.className='shop-item coach-item';
   const owned=game.coachOwned.includes(i);
   const active=i===game.coach;
   const stars='★'.repeat(coach.maxDifficulty)+'☆'.repeat(5-coach.maxDifficulty);
   d.innerHTML=`<h3>${i===0?'🧍':'🏋️'} ${coach.name}</h3>
     <div class="coach-compact-line">${stars} · потолок <b>${coach.fitnessCap}/100</b> · тренировка <b>+${coach.trainingGain}</b></div>
     <div class="coach-compact-line">${i===0?'Бесплатно':`<span class="money">${fmtMoney(coach.price)}</span>`} · финиш ×${coach.mult}</div>
     <details><summary>Подробнее ▾</summary><div class="coach-details">
       ${coach.desc}<br>${coach.bonuses}<br>
       ${(()=>{const b=coachRaceBonuses();return `Темп −${Math.round(b.pace*100)}% · усталость −${Math.round(b.fatigue*100)}% · подъёмы −${Math.round(b.climb*100)}% · травмы −${Math.round(b.injury*100)}%`;})()}
     </div></details>
     <button class="${active?'secondary':'primary'}" ${active||(!owned&&game.money<coach.price)?'disabled':''} data-coach="${i}">
       ${active
         ? 'Активен'
         : owned
           ? 'Выбрать тренера'
           : game.money<coach.price
             ? `Не хватает ${fmtMoney(coach.price-game.money)}`
             : 'Купить тренера'}
     </button>`;
   $('coachGrid').appendChild(d);
 });

 $('coachGrid').querySelectorAll('[data-coach]').forEach(b=>b.onclick=()=>{
   const i=Number(b.dataset.coach);
   const coach=COACHES[i];
   if(!game.coachOwned.includes(i)){
     if(game.money<coach.price){showGameError('Не хватает '+fmtMoney(coach.price-game.money)+' на тренера.');return}
     game.money-=coach.price;
     game.coachOwned.push(i);
   }
   game.coach=i;
   saveGame();
   render();
 });

 if($('fitnessPanelValue')) $('fitnessPanelValue').textContent=`${Math.round(game.fitness)} / 100`;
 if($('fitnessPanelBar')) $('fitnessPanelBar').style.width=`${game.fitness}%`;

 const coach=COACHES[game.coach]||COACHES[0];
 if($('fitnessPanelText')){
   $('fitnessPanelText').textContent=
     `Тренированность растёт и за прохождение гонок. Текущий тренер: ${coach.name}. Подготовка до ${'★'.repeat(coach.maxDifficulty)} · максимум ${coach.fitnessCap}/100.`;
 }

 const btn=$('startTrainingBtn');
 const status=$('trainingStatus');
 if(btn&&status){
   const ms=trainingRemainingMs();
   if(ms>0){
     btn.disabled=true;
     btn.textContent='🏃 Тренировка идёт…';
     const s=Math.ceil(ms/1000), mm=Math.floor(s/60), ss=s%60;
     status.textContent=`До окончания тренировки: ${mm}:${String(ss).padStart(2,'0')}`;
   }else{
     const hospitalLock=isInHospital() || needsHospitalTreatment();
     const restLock=isResting();
     btn.disabled=hospitalLock || restLock || Number(game.fitness||0)>=100;
     if(hospitalLock){
       btn.textContent=isInHospital()?`🏥 Лечение ${fmtRest(hospitalRemainingMs())}`:'🏥 Сначала лечение';
       status.textContent=isInHospital()?`До окончания лечения: ${fmtRest(hospitalRemainingMs())}. Тренировки недоступны.`:'Сначала пройдите лечение в больнице.';
     }else if(restLock){
       btn.textContent=`😴 Отдых ${fmtRest(restRemainingMs())}`;
       status.textContent=`До завершения отдыха: ${fmtRest(restRemainingMs())}. После этого можно тренироваться.`;
     }else if(Number(game.fitness||0)>=100){btn.disabled=true;btn.textContent='🏆 Максимальная тренированность';status.textContent='100/100 — выше тренироваться нельзя, достигнут максимальный уровень.';
     }else{
       btn.textContent='▶ Начать тренировку на 1 минуту';
       status.textContent=completedGain>0
         ? `✓ Тренировка завершена: +${completedGain.toFixed(1)} к тренированности.`
         : `1 минуту реального времени → +${coach.trainingGain.toFixed(1)} к тренированности.`;
     }
   }
 }
 renderTrainingAnimation();

 const playerName=safePlayerName();
 const rows=[...ELITE_RUNNERS,{name:playerName,itra:Math.round(game.itra),country:'🎮',player:true}]
   .sort((a,b)=>b.itra-a.itra);
 if($('itraLeaderboard')){
   $('itraLeaderboard').innerHTML=rows.map((r,i)=>`<div class="leader-row ${r.player?'player-row':''}">
     <b>${i+1}</b><span>${r.country} ${r.name}</span><strong>${r.itra}</strong>
   </div>`).join('');
 }
}
$('startTrainingBtn')?.addEventListener('click',()=>{
  ensureResources();
  ensureTraining();
  if(isInHospital() || needsHospitalTreatment()){
    const msg=isInHospital()?`Во время лечения тренировка недоступна. Осталось ${fmtRest(hospitalRemainingMs())}.`:'Сначала необходимо пройти лечение в больнице.';
    showGameError(msg); renderTraining(); return;
  }
  if(isResting()){
    showGameError(`Во время отдыха тренировку запускать нельзя. До завершения отдыха: ${fmtRest(restRemainingMs())}.`);
    renderTraining();
    return;
  }
  if(run&&run.running){showGameError('Во время гонки тренироваться нельзя.');return;} if(Number(game.fitness||0)>=100){showGameError('Тренированность 100/100. Выше тренироваться нельзя — достигнут максимальный уровень.');renderTraining();return;}
  if(trainingActive()) return;
  game.trainingUntil=Date.now()+60*1000;
  saveGame();
  renderTraining();
  updateRaceStartTrainingLock();
});
setInterval(()=>{
 if($('startTrainingBtn')) renderTraining();
 updateRaceStartTrainingLock();
},1000);

function totalRepairCost(){
 let s=0;Object.keys(GEAR).forEach(cat=>{const it=item(cat),cur=durability(cat);s+=(it[3]-cur)*Math.max(2,it[1]/it[3]*.28)});return Math.ceil(s);
}
$('repairAllBtn').onclick=()=>{
  if(run&&run.running){showGameError('Во время гонки ремонт недоступен');return}
  const cost=totalRepairCost();
  if(cost<=0){showGameError('Экипировка уже полностью исправна');return}
  if(game.money<cost){showGameError('Не хватает рублей. Нужно '+fmtMoney(cost));return}
  game.money-=cost;
  Object.keys(GEAR).forEach(cat=>setDur(cat,item(cat)[3]));
  saveGame();
  render();
};

function switchTab(id){
 const el=document.getElementById(id);
 if(!el) return;
 if(el.tagName==='DETAILS') el.open=true;
 el.scrollIntoView({behavior:'smooth',block:'start'});
}
$('scrollShopBtn')?.addEventListener('click',()=>{
  if(purchasesLockedDuringRace())return;
  switchTab('shop');
});

function keepEquippedGear(){
  // Сломанная вещь остаётся выбранной/надетой, пока игрок сам не наденет другую.
  if(!game.gear) game.gear={...START_GEAR};
  if(!game.gearOwned) game.gearOwned={};
  Object.keys(START_GEAR).forEach(cat=>{
    if(game.gear[cat]==null) game.gear[cat]=START_GEAR[cat];
    if(!Array.isArray(game.gearOwned[cat])) game.gearOwned[cat]=[];
    // Миграция старых сохранений: раз надет ур. N, уровни 1..N уже были куплены.
    for(let i=0;i<=Number(game.gear[cat]||0);i++){
      if(!game.gearOwned[cat].includes(i)) game.gearOwned[cat].push(i);
    }
  });
}
function gearTimeFactor(){
 let f=1;
 Object.keys(GEAR).forEach(cat=>{
   const it=item(cat);
   // Broken gear loses its speed benefit.
   if(durability(cat)<=0) return;
   f*=it[2];
 });
 // LEKI poles give an extra climbing/running bonus.
 if(game.gear.poles===3 && durability('poles')>0) f*=0.985;
 if(game.gear.poles===4 && durability('poles')>0) f*=0.97;
 const fit=Math.max(1,Math.min(100,game.fitness||1));f*=1-(fit-1)*.00152;return Math.max(.58,f);
}
function requiredGearLevel(cat,L=levelData(),w=weatherForLevel()){
  const raceNo=Math.max(1,Number(game.current||0)+1);
  const diff=Math.max(1,Number(L[5]||1));
  const dist=Number(L[1]||0);
  const climb=Number(L[2]||0);
  let req=1;
  if(['shoes','pack','watch','hrm'].includes(cat)) req=1+Math.floor((raceNo-1)/3);
  if(cat==='hydration') req=1+Math.floor((raceNo-1)/4);
  if(cat==='medkit') req=1+Math.floor((raceNo-1)/3);
  if(cat==='poles') req=(diff>=2||climb>=500)?1+Math.floor((raceNo-1)/4):1;
  if(cat==='lamp') req=(game.current>=4||L[3]>=3*3600)?1+Math.floor((raceNo-4)/3):1;
  if(cat==='jacket'){
    const weatherReq=membraneRequiredLevel(L,w);
    req=Math.max(1,weatherReq||1);
  }
  return Math.max(1,Math.min(7,req));
}
function equipmentPreparedness(cat,L=levelData(),w=weatherForLevel()){
  const idx=Number(game.gear?.[cat]||0);
  const current=idx+1;
  const required=requiredGearLevel(cat,L,w);
  return {current,required,gap:Math.max(0,required-current)};
}

function equipmentPenaltyChance(cat,diff,dist){
 const it=item(cat),cur=durability(cat),max=it[3];
 const wear=1-cur/max;
 const protect=it[4];
 const prep=equipmentPreparedness(cat);
 // Недостаточный уровень экипировки теперь напрямую повышает шанс сбоя.
 const preparednessPenalty=prep.gap*.055;
 // Неподготовленные палки ломаются особенно часто на наборе.
 const polePenalty=cat==='poles' ? prep.gap*.045 : 0;
 return Math.min(.95,Math.max(.012,(.035*diff + dist/2800 + wear*.30 - protect*.75 + preparednessPenalty*1.25 + polePenalty*1.25)*3));
}
function wearFor(cat,L){
 const it=item(cat),diff=L[5],dist=L[1],gain=L[2];
 let base=dist/18 + gain/1800 + diff*.5;
 if(cat==='shoes')base*=1.55;
 if(cat==='poles')base*=1.15+gain/6500;
 if(cat==='jacket')base*=1+diff*.12;
 const prep=equipmentPreparedness(cat,L,weatherForLevel());
 base*=1+prep.gap*.22;
 return base*(1.00+Math.random()*.85)*3;
}
function buildEvents(L){
 const n=Math.max(3,Math.min(10,3+Math.floor(L[1]/80)+L[5]));
 const pool=[
  ['🪨','Каменный участок',60,'shoes'],
  ['🌧️','Ливень',120,'jacket'],
  ['🌙','Ночь',180,'lamp'],
  ['🥵','Жара',150,'hydration'],
  ['🎒','Потёр плечи',90,'pack'],
  ['⛰️','Крутой подъём',120,'poles'],
  ['📸','Остановились пофоткать',180,null],
  ['👏','Болельщики включили турбо',-180,null],
  ['🔥','Второе дыхание',-120,null],
  ['🍊','Удачный ПП',-90,null],
  ['🧭','Сбился с трека',240,null],
  ['🦟','Атака насекомых',75,null],
  ['🩹','Ссадина',90,'medkit'],
  ['🦶','Натёр ногу',120,'cream'],
  ['🤕','Падение',180,'injury'],
  ['🦶','Подвернул голеностоп',240,'injury'],
  ['🦵','Ударил колено',210,'injury'],
  ['🪨','Падение на камнях',300,'injury'],
  ['😅','Слишком быстро на старте',120,null],
  ['👟','Развязался шнурок',60,'shoes'],
  ['🚰','Очередь за водой на ПП',180,'hydration'],
  ['💧','Брод пройден идеально',-120,null],
  ['💦','Тяжёлый брод',150,'shoes'],
  ['🍌','Банан на ПП зашёл идеально',-60,null],
  ['🎵','Музыка на ПП придала сил',-75,null],
  ['😫','Накрыла усталость',300,null],
  ['🤢','Гель не зашёл',120,null],
  ['🔥','Кофеиновый гель «УГЛИ» сработал!',-300,'ugli'],
  ['🌬️','Попутный ветер',-120,null],
  ['💨','Сильный встречный ветер',180,null],
  ['☀️','Стало жарко',120,'hydration'],
  ['❄️','Резко похолодало',120,'jacket'],
  ['🧦','Камешек в кроссовке',75,'shoes'],
  ['🪵','Перепрыгнул поваленное дерево',-30,null],
  ['🧠','Идеально разложил силы',-150,null]
 ];

 const ev=[];
 for(let i=0;i<n;i++){
   const p=.08+(i+1)/(n+1)*.84;
   let x=pool[Math.floor(Math.random()*pool.length)];
   // Стартовые события только в первой половине; очередь за водой — только на условном ПП.
   if(x[1]==='Слишком быстро на старте' && p>.5) x=pool[0];
   if(x[1]==='Очередь за водой на ПП') p=Math.min(.9, Math.max(.25, Math.round(p*4)/4));
   ev.push({p,...{emoji:x[0],name:x[1],sec:x[2],cat:x[3]}});
 }
 // Hard/long races with high fatigue have a real chance of an additional injury event.
 const fatigue=Number(game.fatigue||0);
 const injuryChance=Math.min(.75,.04 + L[5]*.055 + L[1]/500 + Math.max(0,fatigue-35)/140);
 if(Math.random()<injuryChance){
   const injuryNames=[
     {emoji:'🦶',name:'Подвернул голеностоп',sec:240,cat:'injury'},
     {emoji:'🦵',name:'Ударил колено',sec:210,cat:'injury'},
     {emoji:'🪨',name:'Падение на камнях',sec:300,cat:'injury'}
   ];
   const x=injuryNames[Math.floor(Math.random()*injuryNames.length)];
   ev.push({p:.22+Math.random()*.68,...x});
 }
 // На каждой гонке есть шанс найти редкую экипировку. Она бесплатна и
 // может быть надета прямо во время гонки, если её уровень выше текущего.
 if(Math.random()<0.42){
   const cats=['shoes','pack','jacket','poles','watch','medkit','hydration'];
   const cat=cats[Math.floor(Math.random()*cats.length)];
   const current=Number(game.gear?.[cat]||0);
   const found=Math.min(6,current+1+Math.floor(Math.random()*2));
   if(found>current){
     ev.push({p:.12+Math.random()*.76,emoji:'🎒',name:`Найдена экипировка · ${CATEGORY_NAMES[cat]} ур. ${found+1}/7`,sec:-90,cat:'gearFind',foundCat:cat,foundLevel:found});
   }
 }
 // Гелевые события не должны идти рядом.
 // Если «УГЛИ сработал» и «Гель не зашёл» ближе чем на 12% дистанции,
 // оставляем только первое из них.
 const sorted=ev.sort((a,b)=>a.p-b.p);
 const filtered=[];
 for(const e of sorted){
   const isGel=(e.cat==='ugli' || e.name==='Гель не зашёл');
   if(isGel){
     const prevGel=[...filtered].reverse().find(x=>x.cat==='ugli' || x.name==='Гель не зашёл');
     if(prevGel && Math.abs(Number(e.p)-Number(prevGel.p))<0.12) continue;
   }
   filtered.push(e);
 }
 return filtered;
}
function clearStartRequirementsError(){
 const el=$('startRequirementsError');
 if(!el)return;
 el.style.display='none';
 el.innerHTML='';
}
function showStartRequirementsError(title,items=[]){
 const el=$('startRequirementsError');
 if(!el)return;
 const rows=(items||[]).filter(Boolean);
 el.innerHTML=`<b>⛔ ${title}</b>${rows.length?`<ul>${rows.map(x=>`<li>${x}</li>`).join('')}</ul>`:''}`;
 el.style.display='block';
 // Keep the message visible on screen instead of silently moving the player elsewhere.
 el.scrollIntoView({behavior:'smooth',block:'center'});
}

function weatherDnfRisk(L,w){
 // На дистанциях до 20 км плохая погода сама по себе не вызывает DNF игрока.
 if(Number(L[1]||0)<=20) return 0;
 let risk=0.01 + Math.max(0,game.fatigue-55)*0.0015;
 if(w.temp>=30){ let heatRisk=0.12+L[5]*0.018; const hasSunCream=Number(game.resources?.sunCream||0)>0||Number(game.resources?.medkits||0)>0; if(hasSunCream)heatRisk*=0.60; risk+=heatRisk; }
 if(w.name==='Ливень') risk += 0.16 + L[5]*0.015;
 else if(w.rain) risk += 0.08 + L[5]*0.012;
 if(w.cold) risk += 0.06 + L[5]*0.01;
 if(L[1]>=80) risk += 0.025;
 if(L[1]>=150) risk += 0.035;
 return Math.min(0.38,Math.max(0.01,risk));
}
function fatigueDnfRisk(){
 const f=Math.max(0,Math.min(100,Number(game.fatigue||0)));
 if(f<80) return 0;
 // 80% ≈ 45%, 90% ≈ 70%, 100% ≈ 92% схода независимо от погоды.
 return Math.min(.92,.45 + (f-80)*.0235);
}
function competitorDnfRate(L,w){
 let p=0.025 + L[5]*0.012 + Math.min(0.05,L[1]/3000);
 if(w.temp>=30) p+=0.09;
 if(w.name==='Ливень') p+=0.13;
 else if(w.rain) p+=0.07;
 if(w.cold) p+=0.05;
 return Math.min(0.32,p);
}
function simulateOtherDnfs(fieldSize,L,w){
 const p=competitorDnfRate(L,w);
 let n=0;
 for(let i=0;i<fieldSize-1;i++) if(Math.random()<p) n++;
 return n;
}


function playerItraPlace(){
  return ELITE_RUNNERS.filter(r=>Number(r.itra||0)>Number(game.itra||0)).length+1;
}

function itraEarlyRaceBoost(){
  const place=playerItraPlace();
  const earlyRace=Number(game.current||0)<10; // уровни 1–10

  if(!earlyRace) return {active:false,place,chance:0,mult:1,tier:'off'};

  let chance=0;
  let mult=1;
  let tier='none';

  if(place===1){
    // Логика ранней 1.0: лидер ITRA на уровнях 1–10 почти всегда
    // реально борется за подиум и часто за победу.
    chance=0.92; mult=1.18; tier='1';
  }else if(place===2){
    chance=0.78; mult=1.12; tier='2';
  }else if(place===3){
    chance=0.68; mult=1.095; tier='3';
  }else if(place<=5){
    chance=0.54; mult=1.07; tier='4-5';
  }else if(place<=10){
    chance=0.38; mult=1.05; tier='6-10';
  }else if(place<=15){
    chance=0.24; mult=1.03; tier='11-15';
  }

  const active=chance>0 && Math.random()<chance;
  return {active,place,chance,mult:active?mult:1,tier};
}


function seededNoise01(seed){
  // deterministic pseudo-random 0..1 for this race/competitor
  const x=Math.sin(seed*12.9898+78.233)*43758.5453;
  return x-Math.floor(x);
}

function applyEarlyItraWinnerDistribution(field,playerBaseSec){
  // Восстановленная логика 1.0: ITRA-позиция влияет не только на общий
  // коэффициент соперников, но и на распределение реальной борьбы за победу.
  // События гонки и штрафы всё ещё могут изменить итог по ходу дистанции.
  if(Number(game.current||0)>=10 || !Array.isArray(field) || !field.length) return field;
  const place=playerItraPlace();
  const roll=Math.random();
  let maxAhead=null;
  if(place===1){
    maxAhead = roll<0.58 ? 0 : roll<0.82 ? 2 : roll<0.96 ? 4 : null;
  }else if(place===2){
    maxAhead = roll<0.40 ? 0 : roll<0.70 ? 2 : roll<0.90 ? 4 : null;
  }else if(place===3){
    maxAhead = roll<0.30 ? 0 : roll<0.60 ? 2 : roll<0.84 ? 4 : null;
  }else if(place<=5){
    maxAhead = roll<0.20 ? 0 : roll<0.46 ? 2 : roll<0.72 ? 4 : null;
  }else if(place<=10){
    maxAhead = roll<0.11 ? 0 : roll<0.30 ? 2 : roll<0.56 ? 4 : null;
  }else if(place<=15){
    maxAhead = roll<0.06 ? 0 : roll<0.18 ? 2 : roll<0.40 ? 4 : null;
  }
  if(maxAhead===null) return field;

  const sorted=[...field].sort((a,b)=>a.finishSec-b.finishSec);
  const playerExpected=Math.max(60,Number(playerBaseSec||60));
  sorted.forEach((c,i)=>{
    if(i<maxAhead){
      // Оставляем нужное число сильных соперников впереди.
      const gap=(maxAhead-i)*0.006;
      c.finishSec=Math.min(c.finishSec,playerExpected*(0.992-gap));
    }else{
      // Остальное поле — за ожидаемым временем игрока; небольшой разброс
      // сохраняет естественные перестановки во время гонки.
      const gap=0.006+(i-maxAhead)*0.0025;
      c.finishSec=Math.max(c.finishSec,playerExpected*(1+gap));
    }
  });
  return field;
}

function createVirtualField(L,fieldSize,playerBaseSec){
  const n=Math.max(20,Math.min(124,fieldSize||50));
  const itraBoost=itraEarlyRaceBoost();
  const strength=Math.max(0,Math.min(1,
    (Number(game.fitness||0)/100)*0.52 +
    (Number(game.level||1)/100)*0.24 +
    Math.max(0,((COACHES[game.coach]||COACHES[0]).mult-1))*0.14 +
    (game.itra||250)/1000*0.07 +
    (game.rep||0)/500*0.03
  ));

  const field=[];
  for(let i=0;i<n-1;i++){
    const q=(i+0.5)/(n-1); // 0 strongest -> 1 weakest
    const seed=(game.current+1)*1000+(game.completed||0)*37+i*17+(game.level||1)*13;
    const noise=(seededNoise01(seed)-0.5)*0.10;

    // Strongest runners are clearly faster; the middle pack stays close enough
    // that +/- race events can cause natural overtakes.
    let relative=0.82 + q*0.42 + noise;

    // Harder races attract a slightly stronger field.
    relative-=Math.max(0,L[5]-2)*0.012;

    // Player strength shifts the expected field relation, but not enough to
    // create huge unrealistic jumps.
    relative+=strength*0.05;

    field.push({
      id:i,
      relative:Math.max(0.72,Math.min(1.34,relative)),
      finishSec:Math.max(
        60,
        playerBaseSec*relative*(
          // Результат теперь реально зависит от навыков игрока.
          // Новичок получает сильное поле и обычно не борется за победу.
          // По мере роста тренированности/уровня/тренера/ITRA соперники
          // становятся относительно доступнее.
          Math.max(0.82,Math.min(1.12,
            0.84 + strength*0.28 - Math.max(0,L[5]-2)*0.006
          )) * itraBoost.mult
        )
      ),
      dnf:false
    });
  }
  // Если игрок №1 в ITRA на уровнях 1–10, не даём случайной генерации
  // слишком часто выбрасывать его далеко за TOP-5.
  if(Number(game.current||0)<10 && playerItraPlace()===1){
    const sorted=[...field].sort((a,b)=>a.finishSec-b.finishSec);
    const top5Cut=Math.max(60,playerBaseSec*0.995);
    for(let i=4;i<Math.min(sorted.length,12);i++){
      sorted[i].finishSec=Math.max(sorted[i].finishSec, top5Cut+(i-4)*6);
    }
  }

  applyEarlyItraWinnerDistribution(field,playerBaseSec);
  return field.sort((a,b)=>a.finishSec-b.finishSec);
}

function competitorProgressAt(c,elapsed,L){
  if(!c || c.dnf) return 0;
  const total=Math.max(60,c.finishSec);
  let p=Math.max(0,Math.min(1,elapsed/total));

  // Small stable pacing variation: competitors do not run like robots,
  // but the wiggle is intentionally mild to avoid position flicker.
  const wave=Math.sin((elapsed/180)+(c.id%7))*0.004;
  p=Math.max(0,Math.min(1,p+wave));

  // Прокачанный игрок может иметь высокий шанс победы, но это не должно
  // визуально фиксировать его на 1-м месте с самого старта. В победном/
  // подиумном сценарии сильные соперники начинают чуть быстрее, а этот
  // стартовый запас плавно исчезает к последней трети гонки.
  if(Number(c.liveStartBoost||0)>0 && p<0.82){
    const fade=Math.pow(Math.max(0,1-p/0.82),1.15);
    p=Math.max(0,Math.min(1,p+Number(c.liveStartBoost||0)*fade));
  }

  // В Армагеддоне Артём Чернов обычно держит лидерство почти до финиша.
  // В редких проигрышных попытках он проседает только на последних ~12%.
  if(c.armageddonStar && !c.armageddonWins && p>0.88){
    const late=(p-0.88)/0.12;
    p=Math.max(0,Math.min(1,p-late*0.035));
  }
  return p;
}



function showDnfBatch(batch, reason=''){
  try{
    if(!run || !run.running || run.dnf || !Array.isArray(batch) || !batch.length) return;
    const rows=batch.map(x=>`${String(x.name||'Участник')} — ${Number(x.km||0).toFixed(1)} км`);
    const ov=$('eventOverlay');
    if(ov){
      queueRaceOverlay(
        `<div class="overlay-box"><div class="emoji">🚫</div><b>Сошли ${batch.length} участников</b><span>${rows.join('<br>')}${reason?`<br>${reason}`:''}</span></div>`,
        2000
      );
    }
    const el=$('eventLog');
    if(el){
      const kmMin=Math.min(...batch.map(x=>Number(x.km||0)));
      const kmMax=Math.max(...batch.map(x=>Number(x.km||0)));
      const kmLabel=Math.abs(kmMax-kmMin)<0.05 ? `${kmMin.toFixed(1)} км` : `${kmMin.toFixed(1)}–${kmMax.toFixed(1)} км`;
      el.insertAdjacentHTML(
        'afterbegin',
        `<div class="event-row dnf-event-row"><span>${kmLabel}</span><b>🚫 Сошли ${batch.length}</b><span class="neutral">${rows.join(' · ')}${reason?` · ${reason}`:''}</span></div>`
      );
    }
    if(run) run.eventPause=false;
  }catch(e){}
}

// Обычные сходы копятся и показываются только группами по 5 человек.
// Это не даёт после первой пятёрки снова сыпать одиночные плашки.
function queueDnfGrouped(name, kmOverride=null, extra=''){
  try{
    if(!run || !run.running || run.dnf) return;
    if(run.riverMassOverlayActive) return;
    if(!Array.isArray(run.dnfDisplayPending)) run.dnfDisplayPending=[];
    const km=Number.isFinite(Number(kmOverride)) ? Number(kmOverride) : ((run?.p||0)*Number(levelData()?.[1]||0));
    run.dnfDisplayPending.push({name:String(name||'Участник'),km,extra:String(extra||'')});
    while(run.dnfDisplayPending.length>=5){
      const batch=run.dnfDisplayPending.splice(0,5);
      showDnfBatch(batch);
    }
  }catch(e){}
}

function showDnfNotice(name, extra='', kmOverride=null){
  queueDnfGrouped(name,kmOverride,extra);
}

function isItraDnfProtectedRunner(c){
 const n=String(c?.name||c?.runnerName||c?.fullName||'').trim().toLowerCase();
 if(!n) return false;

 const intl=(Array.isArray(TOP_ITRA_LEADERS)?TOP_ITRA_LEADERS:[])
   .some(x=>String(x||'').trim().toLowerCase()===n);

 const ru=(Array.isArray(RUSSIAN_ITRA_RIVALS)?RUSSIAN_ITRA_RIVALS:[])
   .some(x=>String(x?.name||'').trim().toLowerCase()===n);

 return intl || ru;
}

function updateLiveDnfs(){
 if(!run || !run.running || run.dnf) return;
 const raceKmNow=Number(run.p||0)*Number(levelData()?.[1]||0);
 if(raceKmNow<30){
   const box=$('liveDnfStatus');
   if(box){
     const total=Math.max(1,Number(run.fieldSize||0));
     box.textContent=`🚫 Сошли: ${Number(run.liveDnfCount||0)} из ${total}`;
   }
   return;
 }
 if(!run || !run.running) return;

 const points=Array.isArray(run.otherDnfPoints)?run.otherDnfPoints:[];
 let targetCount=0;
 for(const p of points) if((run.p||0)>=p) targetCount++;

 const already=Number(run.liveDnfCount||0);
 if(targetCount>already){
   // Не вываливаем десятки сходов одной лавиной: за одно обновление
   // оформляем максимум 5 участников, остальные дойдут следующими пачками.
   const requested=Math.min(5,targetCount-already);
   const active=(run.virtualField||[]).filter(c=>c && !c.dnf);

   if(!(run.dnfNames instanceof Set)){
     run.dnfNames=new Set(Array.isArray(run.dnfNames)?run.dnfNames:[]);
   }

   let actuallyAdded=0;
   const dnfBatch=[];

   for(let i=0;i<requested && active.length;i++){
     const L=levelData();
     const raceKm=Number(run.p||0)*Number(L?.[1]||0);

     // Rank by actual live progress, not empty c.km fields.
     const ranked=[...active].sort((a,b)=>{
       const pa=competitorProgressAt(a,Number(run.elapsed||0),L);
       const pb=competitorProgressAt(b,Number(run.elapsed||0),L);
       return pb-pa;
     });
     const currentTop7=new Set(ranked.slice(0,7));

     // Never use a name that has already appeared in a DNF event.
     const unseen=c=>{
       const n=String(c?.name||c?.runnerName||c?.fullName||'').trim();
       return n && !run.dnfNames.has(n.toLowerCase());
     };

     let pool=active.filter(unseen);

     // TOP ITRA runners are protected from DNF until 130 km.
     if(raceKm < 130){
       pool=pool.filter(c=>!isItraDnfProtectedRunner(c));
     }

     // TOP-7 may DNF only rarely. Prefer anyone outside current TOP-7.
     if(pool.length){
       if(Math.random()<0.02){
         const topPool=pool.filter(c=>currentTop7.has(c));
         if(topPool.length) pool=topPool;
       }else{
         const outside=pool.filter(c=>!currentTop7.has(c));
         if(outside.length) pool=outside;
       }
     }

     // If no legal unique candidate exists, skip this DNF instead of breaking the rules.
     if(!pool.length) continue;

     const dnfRunner=pool[Math.floor(Math.random()*pool.length)];
     const idx=active.indexOf(dnfRunner);
     if(idx<0) continue;

     const dnfName=String(
       dnfRunner.name ||
       dnfRunner.runnerName ||
       dnfRunner.fullName ||
       'Неизвестный участник'
     ).trim();

     dnfRunner.dnf=true;
     const dnfKm=Math.max(0,Math.min(Number(L?.[1]||0),raceKm));
     dnfRunner.dnfKm=dnfKm;
     dnfRunner.dnfReason=dnfRunner.dnfReason||'сход';
     active.splice(idx,1);
     run.dnfNames.add(dnfName.toLowerCase());
     dnfBatch.push({name:dnfName,km:dnfKm});
     actuallyAdded++;
   }

   if(dnfBatch.length){
     try{
       for(const x of dnfBatch) queueDnfGrouped(x.name,x.km,'');
     }catch(e){ console.warn('DNF batch queue error',e); }
   }

   // Count only DNF events that were really allowed and created.
   run.liveDnfCount=already+actuallyAdded;
 }

 const box=$('liveDnfStatus');
 if(box){
   const total=Math.max(1,Number(run.fieldSize||0));
   box.textContent=`🚫 Сошли: ${Number(run.liveDnfCount||0)} из ${total}`;
 }
}



function enforceMinRussianTop7(L){
  if(!run || !run.running) return;

  const raceLevel=Number((levelData()?.[0])||0);
  if(raceLevel < 8) return;

  const russianNames=new Set([
    'Алексей Береснев','Антонина Юшина','Анастасия Кабенина','Алексей Толстенко','Константин Иванов',
    'Елена Носкова','Василий Корыткин','Алексей Макалюкин','Алексей Бабушкин',
    'Павел Тарасов','Виктория Жукова','Мария Гостева','Вера Чекалина'
  ].map(x=>x.toLowerCase()));

  const rows=dynamicLeaderRows(L);
  if(!rows.length) return;

  const top7=rows.slice(0,7);
  const isRu=r=>russianNames.has(String(r?.c?.name||r?.c?.fullName||'').trim().toLowerCase());

  let ruCount=top7.filter(isRu).length;
  if(ruCount>=4) return;

  const outsiders=rows.slice(7).filter(isRu);
  if(!outsiders.length) return;

  // Promote enough Russian runners into the live top-7 by nudging their live position
  // just above the current 7th-place threshold. This keeps the order dynamic while
  // guaranteeing at least four Russian athletes in TOP-7 from level 8 onward.
  const threshold=Number(top7[top7.length-1]?.liveKm ?? top7[top7.length-1]?.km ?? 0);
  let need=4-ruCount;

  for(let i=0;i<outsiders.length && need>0;i++,need--){
    const r=outsiders[i];
    const target=Math.min(Number(L[1]||0), threshold + 0.02 + i*0.01);
    r.liveKm=target;

    if(r.c){
      // Keep a tiny persistent competitive bump so they do not instantly fall out next tick.
      if('speedFactor' in r.c) r.c.speedFactor=Math.max(Number(r.c.speedFactor)||1,1.08);
      if('paceFactor' in r.c) r.c.paceFactor=Math.min(Number(r.c.paceFactor)||1,0.94);
    }
  }
}

function maybeLeaderDNF(){
  if(!run || !run.running || run.dnf) return;
  const leaderDnfKm=Number(run.p||0)*Number(levelData()?.[1]||0);
  if(leaderDnfKm<30) return;
  if(!run || !run.running || !Array.isArray(run.virtualField)) return;
  const elapsed=Number(run.elapsed||0);
  if(elapsed<240) return; // no leader DNFs immediately after start

  const bucket=Math.floor(elapsed/180); // check about once per 3 race minutes
  if(run.lastLeaderDnfBucket===bucket) return;
  run.lastLeaderDnfBucket=bucket;

  const active=run.virtualField.filter(c=>c && !c.dnf);
  if(active.length<8) return;

  const L=levelData();
  const ranked=active.map(c=>({
    c,
    p:competitorProgressAt(c,elapsed,L)
  })).sort((a,b)=>b.p-a.p);

  // Only someone currently in the front 7 can suffer a leader DNF.
  const candidates=ranked.slice(0,7);
  if(!candidates.length) return;

  // Usually nothing happens. Approx. 4% chance per check.
  if(Math.random()>=0.04) return;

  let c=candidates[Math.floor(Math.random()*candidates.length)].c;
  const n=String(c.name||'');
  if(!(run.dnfNames instanceof Set)) run.dnfNames=new Set(Array.isArray(run.dnfNames)?run.dnfNames:[]);
  if(run.dnfNames.has(n.trim().toLowerCase())) return;

  // TOP ITRA may not DNF before 70 km, including the separate leader-DNF path.
  const leaderRaceKm=Number(run.p||0)*Number(levelData()?.[1]||0);
  if(leaderRaceKm<70 && isItraDnfProtectedRunner(c)) return;

  // Star leaders can also DNF, but more rarely.
  let chance=1;
  if(n==='Алексей Береснев' || n==='Антонина Юшина') chance=.55;
  if(n==='Артем Чернов') chance=.35;
  if(Math.random()>chance) return;

  c.dnf=true;
  c.dnfKm=Math.max(0,Math.min(Number(L[1]||0),competitorProgressAt(c,elapsed,L)*Number(L[1]||0)));
  const reasons=['травма','сильная усталость','проблемы с желудком','падение','переохлаждение'];
  c.dnfReason=reasons[Math.floor(Math.random()*reasons.length)];
  run.dnfNames.add(n.trim().toLowerCase());
  try{ showDnfNotice(n||'Лидер',c.dnfReason||'',c.dnfKm); }catch(e){}
}

function dynamicLeaderRows(L){
  if(!run) return [];
  maybeLeaderDNF();
  if(!run.running){
    return (run.virtualField||[])
      .filter(c=>!c.dnf)
      .map((c,idx)=>({c,idx,km:0,liveKm:0}));
  }

  const dist=Math.max(1,Number(L[1]||1));
  let rows=(run.virtualField||[])
    .filter(c=>!c.dnf)
    .map((c,idx)=>({
      c,
      idx,
      km:Math.max(0,Math.min(dist,competitorProgressAt(c,run.elapsed||0,L)*dist))
    }));

  const p=Math.max(0,Math.min(1,Number(run.p||0)));
  rows.forEach((r,i)=>{
    const seed=(Number(r.c?.id||i)+1)*0.83 + (i+1)*0.37;
    const surge=
      Math.sin(p*Math.PI*(5.5 + (i%4)*.7) + seed)*dist*.0045 +
      Math.sin(p*Math.PI*(11.0 + (i%3)*.9) + seed*.63)*dist*.0022;
    r.liveKm=Math.max(0,Math.min(dist,r.km+surge));
  });

  rows.sort((a,b)=>b.liveKm-a.liveKm);

  // Живая борьба за позицию: даже в победном сценарии игрок не должен
  // однажды выйти на 1-е место и оставаться там до финиша. Пока не пройдено
  // ~92% дистанции, несколько сильнейших соперников могут темповыми рывками
  // снова выходить вперёд. Итоговое место всё равно определяется реальными
  // финишными временами и событиями гонки.
  if((run.playerWinBoostActive || run.playerPodiumBoostActive) && p>0.10 && p<0.92 && rows.length){
    const playerKm=Math.max(0,Math.min(dist,p*dist));
    const challengers=rows.slice(0,Math.min(5,rows.length));
    challengers.forEach((r,i)=>{
      const id=Number(r.c?.id||i);
      const phase=p*Math.PI*(13.5+i*1.25)+(id%11)*0.71;
      const pulse=Math.sin(phase);
      // Диапазон около ±0,2–0,55% дистанции: достаточно для обгонов,
      // но без огромных скачков по карте.
      const amp=dist*(0.0055-i*0.00065);
      const target=playerKm + pulse*amp;
      // Подтягиваем соперника к борьбе, но не телепортируем далеко назад.
      if(target>r.liveKm || pulse<0){
        const floor=playerKm-dist*0.0065;
        r.liveKm=Math.max(floor,Math.min(dist,target));
      }
    });
    rows.sort((a,b)=>b.liveKm-a.liveKm);
  }

  // Levels 12-19: Beresnev and Yushina appear near the leaders much more often.
  // Level 20 is reserved for Artem Chernov's special Armageddon behavior.
  const shownLevel=Number(game.current||0);
  if(shownLevel>=12 && shownLevel<20){
    const stars=rows.filter(r=>{
      const n=String(r?.c?.name||'');
      return n==='Алексей Береснев' || n==='Антонина Юшина';
    });
    if(stars.length){
      const leaderKm=Number(rows[0]?.liveKm||0);
      stars.forEach((r,i)=>{
        // Usually keep them in/around the leading pack, with small oscillation
        // so they can swap places and occasionally drop a little.
        const wobble=(Math.sin((Number(run.elapsed||0)/95)+(i*2.1))+1)/2;
        const gap=Number(L[1]||1)*(0.0015+0.006*wobble);
        r.liveKm=Math.max(r.liveKm, Math.max(0,leaderKm-gap));
      });
      rows.sort((a,b)=>b.liveKm-a.liveKm);
    }
  }

  // From level 8, guarantee at least four REAL Russian rivals in live TOP-7.
  if(Number(game.current||0)>=7 && rows.length>=7){
    const isRu=r=>isRussianEliteName(r?.c?.name);
    let top=rows.slice(0,7);
    let ruCount=top.filter(isRu).length;

    if(ruCount<4){
      const outsiders=rows.slice(7).filter(isRu);
      const nonRuTop=top.filter(r=>!isRu(r)).sort((a,b)=>a.liveKm-b.liveKm);
      let need=Math.min(4-ruCount,outsiders.length,nonRuTop.length);

      for(let i=0;i<need;i++){
        const promote=outsiders[i];
        const replace=nonRuTop[i];
        // Put the Russian rival just above the runner being replaced.
        promote.liveKm=Math.min(dist,replace.liveKm+0.015+i*0.003);
      }
      rows.sort((a,b)=>b.liveKm-a.liveKm);
    }
  }

  return rows;
}

function currentRaceStandings(){
  if(!run || !run.running) return [];
  const L=levelData();
  const dist=Number(L[1]||0);
  const playerKm=Math.max(0,Math.min(dist,(run.p||0)*dist));

  const rows=dynamicLeaderRows(L).map(r=>({
      id:r.c.id,
      player:false,
      km:r.liveKm,
      finishSec:Number(r.c.finishSec||Infinity)
    }));

  const playerFinishSec=Math.max(1,Number(run.base||0)+Number(run.penalty||0));
  rows.push({id:'player',player:true,km:playerKm,finishSec:playerFinishSec});

  // Основной критерий — фактическое продвижение по трассе.
  // ВАЖНО: когда несколько участников уже на финише (100%),
  // нельзя ставить игрока первым просто из-за равенства километров.
  // Среди финишировавших сортируем по реальному времени финиша.
  rows.sort((a,b)=>{
    const aFinished=a.km>=dist-0.0001;
    const bFinished=b.km>=dist-0.0001;
    if(aFinished && bFinished){
      if(Math.abs(a.finishSec-b.finishSec)>0.001) return a.finishSec-b.finishSec;
    }
    if(Math.abs(b.km-a.km)>0.0001) return b.km-a.km;
    if(a.player&&!b.player) return 1;
    if(!a.player&&b.player) return -1;
    return String(a.id).localeCompare(String(b.id));
  });
  return rows;
}

function updateRealisticPosition(){
  if(!run || !run.running) return;
  const rows=currentRaceStandings();
  const idx=rows.findIndex(r=>r.player);
  const place=idx>=0?idx+1:1;

  run.currentPosition=place;
  run.position=place;
  return place;
}

function startRaceCore(){
 if(trainingActive()){
   const left=trainingCountdownText();
   showStartRequirementsError('🏃 Идёт тренировка',[`Старт гонки будет доступен через ${left}.`]);
   showGameError(`Сначала закончите тренировку. Осталось ${left}.`);
   updateRaceStartTrainingLock();
   renderTraining();
   return;
 }

 clearStartRequirementsError();
 

 if(run && run.running)return;
 ensureResources();

 // Normalize mutable branches before the race consumes water/gels/medkits,
 // changes lamp charge, durability and slot state.
 game.resources={...(game.resources||{})};
 game.gear={...(game.gear||{})};
 game.durability={...(game.durability||{})};
 game.raceSlotsPurchased={...(game.raceSlotsPurchased||{})};
 game.best={...(game.best||{})};

 const L=levelData();

 if(!hasRaceSlot()){
   const cost=raceSlotCost();
   showStartRequirementsError('🎟️ Нужен слот на гонку',[`Купите слот за ${fmtMoney(cost)}. Разблокировка трассы сама по себе старт не разрешает.`]);
   showGameError('Сначала купите слот на эту гонку.'); renderRaceSlot(); return;
 }

 if(isInHospital()){
   const left=fmtRest(hospitalRemainingMs());
   showStartRequirementsError('🏥 Лечение перелома',[`До окончания лечения: ${left}.`]);
   return;
 }
 if(needsHospitalTreatment()){
   showStartRequirementsError('🦴 Требуется лечение перелома',['Сначала пройдите 5-минутное лечение в больнице.']);
   showGameError('После перелома сначала нужно пройти лечение в больнице.');
   return;
 }

 if(isResting()){
   const left=fmtRest(restRemainingMs());
   $('preRaceNote').textContent='😴 Вы отдыхаете. До следующего старта: '+left;
   showStartRequirementsError('Старт пока недоступен',[`Идёт отдых. Осталось: ${left}.`]);
   return;
 }

  const needGels=gelsNeeded(L);
 const lampHours=lampHoursNeeded(L);
 const activeCoach=COACHES[game.coach]||COACHES[0];
 const coachDifficultyGap=Math.max(0,L[5]-activeCoach.maxDifficulty);
 const raceWeather=weatherForLevel();
 let warnings=[];
 let mandatoryGearWarnings=[];
 if(Number(game.fitness||0)>=Number(activeCoach.fitnessCap||100) && activeCoach.fitnessCap<100){
   warnings.push(`тренированность упёрлась в предел ${activeCoach.fitnessCap}/100 — нужен более сильный тренер`);
 }
 const needWater=waterBottlesNeeded(L,raceWeather);
 const hydrationCapBottles=hydrationCapacityBottles();
 const bottleCount=Math.max(0,Number(game.resources.waterBottles||0));
 const totalCarry=totalWaterCarryCapacityBottles(bottleCount);
 if(needWater>totalCarry) warnings.push(`ёмкости для воды: гидратор ${hydrationCapacityLiters()} л + ${bottleCount} бутыл. × 0,5 л; рекомендовано ${Number(needWater*0.5).toFixed(1).replace('.0','')} л`);

 // Каждый слот экипировки теперь имеет минимальный рабочий уровень для
 // конкретной гонки. Недобор не всегда блокирует старт, но резко повышает
 // риск событий и износа; критические слоты блокируют старт.
 Object.keys(GEAR).forEach(cat=>{
   const prep=equipmentPreparedness(cat,L,raceWeather);
   if(prep.gap>0){
     const text=`${CATEGORY_NAMES[cat]}: ур. ${prep.current}/7, желательно ${prep.required}/7`;
     if(['shoes','jacket','lamp'].includes(cat) && (
       (cat==='jacket' && (raceWeather.rain||raceWeather.cold)) ||
       (cat==='lamp' && lampHours>0) ||
       (cat==='shoes' && L[1]>=50)
     )) mandatoryGearWarnings.push('⚠️ '+text);
     else warnings.push(text);
   }
 });

 // Critical broken equipment is reported directly on the race screen.
 const brokenRequired=[];
 if(durability('shoes')<=0) brokenRequired.push(`Кроссовки: ${item('shoes')[0]} сломаны — замените или почините.`);
 if((raceWeather.rain||raceWeather.cold) && durability('jacket')<=0) brokenRequired.push(`Мембранка: ${item('jacket')[0]} сломана.`);
 if(lampHours>0 && durability('lamp')<=0) brokenRequired.push(`Фонарик: ${item('lamp')[0]} сломан.`);
 if(brokenRequired.length){
   showStartRequirementsError(
     '⛔ Нельзя стартовать — обязательная экипировка неисправна',
     brokenRequired
   );
   return;
 }

 // Water shortage is only a warning; start is still allowed.
 if((game.resources.waterBottles||0)<needWater){
   const have=Number(game.resources.waterBottles||0);
   warnings.push(`воды ${have}/${needWater} × 0,5 л`);
 }

 // In cold/rainy weather the required membrane level rises with race difficulty.
 if(raceWeather.rain || raceWeather.cold){
   const requiredMembrane=membraneRequiredLevel(L,raceWeather);
   const equippedMembrane=membraneEquippedLevel();
   if(requiredMembrane>0 && !hasMembrane(requiredMembrane)){
     const equippedName=GEAR.jacket[Number(game.gear.jacket||0)]?.[0]||'Нет мембранки';
     showStartRequirementsError(
       '⛔ Нельзя стартовать — нет обязательной мембранки',
       [
         `${raceWeather.emoji} ${raceWeather.name}, ${raceWeather.temp}°C.`,
         `Мембранка: нужна ур. ${requiredMembrane}/7 или выше.`,
         `Сейчас: ${equippedMembrane <= 1 ? 'мембранки нет' : equippedName+' · ур. '+equippedMembrane+'/7'}.`
       ]
     );
     activeShopCategory='jacket';
     renderShop();
     return;
   }
 }

 if(game.resources.gels<needGels) warnings.push(`гелей ${game.resources.gels}/${needGels}`);
 if(lampHours>0){
   if(durability('lamp')<=0){
     showStartRequirementsError(
       '⛔ Нельзя стартовать — обязательный фонарь неисправен',
       ['Отремонтируйте или замените фонарь перед стартом.']
     );
     return;
   }
   if(isRechargeableLamp()){
     const requiredCharge=Math.min(100,Math.ceil(lampHours*12));
     if(game.lampCharge<requiredCharge && game.resources.powerbank<=0) warnings.push('не хватает заряда фонаря');
   }else{
     const needBat=Math.ceil(lampHours/5);
     if(game.resources.batteries<needBat) warnings.push(`батареек ${game.resources.batteries}/${needBat}`);
   }
 }
 if(medkitScore()<7 && Number(game.resources.medkits||0)<=0) warnings.push('аптечка неполная');
 if(game.fatigue>=70) warnings.push(`усталость ${Math.round(game.fatigue)}%`);

 // Mandatory equipment never blocks the start, but is always highlighted separately.
 if(mandatoryGearWarnings.length){
   warnings.unshift(...mandatoryGearWarnings);
 }

 $('raceResourceWarning').textContent=warnings.length
   ? '🎒 Не хватает / риск: '+warnings.join(' · ')
   : '✅ С собой всё готово.';
 // Не занимаем место большим блоком под кнопкой «Старт».
 // При фактическом старте эти риски показываются 3 секунды справа прямо на трассе.
 const startWarnEl=$('startRequirementsError');
 if(startWarnEl) startWarnEl.style.display='none';


 // Water is transferred into the current race and consumed gradually.
 const waterAvailable=Math.max(0,Number(game.resources.waterBottles||0),Number(game.waterBottles||0));
 const waterCapacity=totalWaterCarryCapacityBottles(waterAvailable);
 const waterUsed=Math.min(waterAvailable,needWater,waterCapacity);
 const waterShortage=Math.max(0,needWater-waterUsed);
 // В стартовый сегмент берём только рассчитанный запас. Остальные бутылки
 // остаются в инвентаре — прежняя версия списывала весь запас сразу.
 game.resources.waterBottles=Math.max(0,waterAvailable-waterUsed);
 game.waterBottles=0;

 if(waterUsed>0){
   $('eventLog').insertAdjacentHTML('afterbegin',`<div class="event-row"><span>СТАРТ</span><b>💧 Вода взята: ${waterUsed} × 0,5 л</b><span class="neutral">${waterShortage>0?'не хватает '+waterShortage:'запас готов'}</span></div>`);
 }else{
   $('eventLog').insertAdjacentHTML('afterbegin',`<div class="event-row"><span>СТАРТ</span><b>💧 Старт без воды</b><span class="bad">риск обезвоживания</span></div>`);
 }

 // Consume gels gradually through the race, but reserve the planned amount here.
 const gelsAvailable=Math.min(game.resources.gels,needGels);
 const gelShortage=Math.max(0,needGels-gelsAvailable);
 useResource('gels',gelsAvailable); // reserved for this race; consumed from run.gelsRemaining during events

 // Lamp power consumed at start for predictable gameplay.
 let lightShortageHours=0;
 if(lampHours>0){
   if(isRechargeableLamp()){
     const chargeNeed=Math.min(100,Math.ceil(lampHours*12));
     if(game.lampCharge>=chargeNeed){
       game.lampCharge-=chargeNeed;
     }else{
       let deficit=chargeNeed-game.lampCharge;
       game.lampCharge=0;
       if((game.resources.accumulator||0)>0){
         useResource('accumulator',1);
         game.lampCharge=Math.max(0,100-deficit);
       }else if(game.resources.powerbank>0){
         game.lampCharge=Math.max(0,100-deficit);
       }else{
         lightShortageHours=Math.ceil(deficit/12);
       }
     }
   }else{
     const needBat=Math.ceil(lampHours/5);
     const used=Math.min(needBat,game.resources.batteries);
     useResource('batteries',used);
     lightShortageHours=Math.max(0,lampHours-used*5);
   }
 }

 const guaranaTaken=0;
 const requiredMedkits=Math.max(1,Math.min(7,Math.ceil((L[5]+(L[1]>100?1:0))/2)));
 const medkitCapacity=Math.max(1,Math.min(7,Number(game.gear?.medkit||0)+1));
 const medkitsForRace=Math.min(Number(game.resources.medkits||0),requiredMedkits,medkitCapacity);
 game.resources.medkits=Math.max(0,Number(game.resources.medkits||0)-medkitsForRace);

 saveGame();

 const fatiguePenaltySec=Math.round(Math.max(0,game.fatigue-35)*L[3]/1000*(1-coachRaceBonuses().fatigue));
 const gelPenaltySec=Math.round(gelShortage*Math.min(420,120+L[5]*45));
 const lightPenaltySec=Math.round(lightShortageHours*600);

 // Weather consequences while racing.
 if(raceWeather.sun>=80){
   const hasSunCream=Number(game.resources?.sunCream||0)>0||Number(game.resources?.medkits||0)>0; const hotPenalty=Math.round(Math.max(0,raceWeather.sun-70)*L[3]/1200*(hasSunCream?0.60:1));
   if(hotPenalty>0){
     $('eventLog').insertAdjacentHTML('afterbegin',`<div class="event-row"><span>СТАРТ</span><b>☀️ Солнце ${raceWeather.sun}% · вода расходуется быстрее</b><span class="bad">+${fmt(hotPenalty)}</span></div>`);
   }
 }

 run={
   running:true,startedByUser:true,attemptId:Date.now()+'-'+Math.random().toString(36).slice(2),winCounted:false,paused:false,p:0,base:L[3]*gearTimeFactor()*(1-coachRaceBonuses().pace),
   weatherDnfRisk:weatherDnfRisk(L,raceWeather),
   fatigueDnfRisk:fatigueDnfRisk(),
   fatigueDnfPlanned:false,
   fatigueDnfTriggered:false,
   fatigueDnfAt:.12+Math.random()*.68,
   eventResourceSpend:{},
   weatherDnfPlanned:false,
   weatherDnfTriggered:false,
   weatherDnfAt:.35+Math.random()*.55,
   weatherDnfReason:raceWeather.temp>=30?'heat':((raceWeather.rain||raceWeather.cold)?'weather':'other'),
   virtualField:[],
   raceDistance:Number(L[1]||5),
   fieldSize:Math.min(250,Math.max(35,Math.round(42+L[5]*18+L[1]*.55))),
   otherDnfCount:0,
   raceLeaders:[...leadersForRace(game.current)],
   elapsed:0,penalty:fatiguePenaltySec+gelPenaltySec+lightPenaltySec+(raceWeather.sun>=80?Math.round((raceWeather.sun-70)*L[3]/1200):0)+Math.round(coachDifficultyGap*L[3]*0.04),
   events:buildEvents(L),fired:new Set(),
   position:Math.max(1,Math.round(12+L[5]*6-game.level/4+Math.random()*8)),
   startPenalty:fatiguePenaltySec+gelPenaltySec+lightPenaltySec+(raceWeather.sun>=80?Math.round((raceWeather.sun-70)*L[3]/1200):0)+Math.round(coachDifficultyGap*L[3]*0.04),
   positionDrift:0,
   condition:game.fatigue>=75?'сильная усталость':'нормально',
   waterStart:waterUsed,waterRemaining:waterUsed,waterCapacity:waterCapacity,medkitsRemaining:medkitsForRace,waterNeed:needWater,waterSegmentStartKm:0,waterSegmentStartAmount:waterUsed,waterEmptyNotified:(waterAvailable<=0),aidStations:buildAidStations(Number(L[1]||0)),aidStationsPassed:new Set(),waterShortage,gelShortage,lightShortageHours,gelsStart:gelsAvailable,gelsRemaining:gelsAvailable,gelsPlannedUsed:0,
   fractureRisk:Math.min(.42, Math.max(0,((game.fatigue-55)/140) * (1-coachRaceBonuses().injury)) + (Date.now()-(game.lastFinishAt||0)<10*60*1000 ? .08*(1-coachRaceBonuses().injury) : 0)),
   guaranaTaken:false,guaranaAvailable:Number(game.resources.guarana||0)>0,guaranaTriggered:false,guaranaUses:0,guaranaMaxUses:(Number(L[1]||0)>=500?4:(Number(L[1]||0)>100?2:1)),guaranaBoostUntil:0,guaranaTriggerKm:0,guaranaCrash:false,guaranaCrashChecked:false,guaranaCrashEndKm:0,charaFloodResolved:false,
   dnf:false,finishWinnerHold:false,finishHold:false,lastPositionBeforeFinish:null,dnfDisplayPending:[]
 };
 run.virtualField=createVirtualField(L,run.fieldSize,Math.max(60,run.base+run.penalty));
 // Чара 138 км: реальный ориентир результатов — даже самый быстрый соперник
 // не финиширует быстрее 18:00:00. Остальные сохраняют свой естественный разрыв.
 if(Math.abs(Number(L[1]||0)-138)<0.01 && Array.isArray(run.virtualField) && run.virtualField.length){
   const minCharaNpcFinish=18*60*60;
   const fastest=Math.min(...run.virtualField.map(c=>Number(c?.finishSec||Infinity)));
   if(Number.isFinite(fastest) && fastest<minCharaNpcFinish){
     const shift=minCharaNpcFinish-fastest;
     run.virtualField.forEach(c=>{ if(c) c.finishSec=Math.max(minCharaNpcFinish,Number(c.finishSec||0)+shift); });
   }else{
     run.virtualField.forEach(c=>{ if(c) c.finishSec=Math.max(minCharaNpcFinish,Number(c.finishSec||0)); });
   }
 }

 run.playerItraPlace=playerItraPlace();
 run.itraBoostTier=(run.playerItraPlace<=3?'TOP-3':
                    run.playerItraPlace<=5?'TOP-5':
                    run.playerItraPlace<=10?'TOP-10':
                    run.playerItraPlace<=15?'TOP-15':'обычный');
 attachRivalNamesToVirtualField();

 // Чара 138 км: Анастасия Кабенина (ITRA 850) обязательно участвует в каждой попытке.
 // Даже старый сохранённый/закэшированный состав не может исключить её из виртуального поля.
 if(Math.abs(Number(L[1]||0)-138)<0.01 && Array.isArray(run.virtualField) && run.virtualField.length){
   const kabName='Анастасия Кабенина';
   let kab=run.virtualField.find(c=>String(c?.name||'').trim()===kabName);
   if(!kab){
     const field=[...run.virtualField].sort((a,b)=>a.finishSec-b.finishSec);
     // Закрепляем её в сильной части стартового поля, но не гарантируем конкретное место по ходу гонки.
     kab=field[Math.min(13,Math.max(0,field.length-1))];
     kab.name=kabName;
   }
   kab.country='RU';
   kab.itra=850;
   kab.charaGuaranteed=true;
   if(!Array.isArray(run.raceLeaders)) run.raceLeaders=[];
   if(!run.raceLeaders.includes(kabName)){
     if(run.raceLeaders.length>=14) run.raceLeaders[13]=kabName;
     else run.raceLeaders.push(kabName);
   }
 }

 // Армагеддон: Артём Чернов — главный соперник.
 // В большинстве попыток он ведёт почти всю гонку и часто выигрывает.
 if(Number(game.current||0)===20 && Array.isArray(run.virtualField) && run.virtualField.length){
   const field=[...run.virtualField].sort((a,b)=>a.finishSec-b.finishSec);
   const artem=field[0];
   artem.name='Артем Чернов';
   artem.country='RU';
   artem.itra=920;
   artem.armageddonStar=true;
   artem.armageddonWins=Math.random()<0.72; // примерно 72% побед
   const expectedPlayer=Math.max(60,Number(run.base||0)+Number(run.penalty||0));
   artem.finishSec=expectedPlayer*(artem.armageddonWins ? (0.91+Math.random()*0.045) : (1.015+Math.random()*0.035));
   // Остальных не пускаем слишком далеко вперёд Артёма.
   field.slice(1,7).forEach((c,i)=>{
     c.finishSec=Math.max(c.finishSec, artem.finishSec*(1.012+i*0.006));
   });
 }


 // Все уровни: прокачка игрока реально повышает шанс победы.
 // Учитываются тренированность, уровень, ITRA и сила тренера.
 // Чем сильнее игрок, тем чаще виртуальные соперники оказываются позади его ожидаемого времени.
 // Это не гарантирует победу: штрафы, DNF, усталость и события гонки всё ещё влияют на итог.
 if(Array.isArray(run.virtualField) && run.virtualField.length){
   const fitness=Math.max(0,Math.min(100,Number(game.fitness||0)));
   const level=Math.max(1,Math.min(100,Number(game.level||1)));
   const itra=Math.max(200,Math.min(950,Number(game.itra||250)));
   const coach=COACHES[game.coach]||COACHES[0];
   const coachPower=Math.max(0,Math.min(1,(Number(coach.mult||1)-1)/0.8));
   const power=(fitness/100)*0.38+(level/100)*0.17+((itra-200)/750)*0.35+coachPower*0.10;
   const winChance=Math.max(0.05,Math.min(0.80,0.05+Math.max(0,power-0.42)*1.35));
   run.playerWinChance=winChance;

   const expectedPlayer=Math.max(60,Number(run.base||0)+Number(run.penalty||0));
   const sorted=[...run.virtualField].sort((a,b)=>Number(a.finishSec||Infinity)-Number(b.finishSec||Infinity));
   const roll=Math.random();
   const isChara=Math.abs(Number(L[1]||0)-138)<0.01;
   const minOpponentFinish=isChara ? 18*60*60 : 0;

   if(roll<winChance){
     sorted.forEach((c,i)=>{
       const gap=1.010+i*0.0025;
       c.finishSec=Math.max(minOpponentFinish,Number(c.finishSec||0),expectedPlayer*gap);
       // 6–12 сильнейших могут идти впереди в первой/средней части гонки.
       // К ~82% дистанции бонус полностью исчезает, поэтому итог решает
       // реальное финишное время, а позиция игрока меняется по ходу гонки.
       c.liveStartBoost=i<12 ? Math.max(0.010,0.065-i*0.0045) : 0;
     });
     run.playerWinBoostActive=true;
   }else if(roll<Math.min(0.95,winChance+0.18)){
     const ahead=1+Math.floor(Math.random()*3);
     sorted.forEach((c,i)=>{
       if(i<ahead){
         c.finishSec=Math.max(minOpponentFinish,Math.min(Number(c.finishSec||Infinity),expectedPlayer*(0.985-i*0.004)));
       }else{
         c.finishSec=Math.max(minOpponentFinish,Number(c.finishSec||0),expectedPlayer*(1.006+(i-ahead)*0.002));
       }
       c.liveStartBoost=i<10 ? Math.max(0.008,0.050-i*0.004) : 0;
     });
     run.playerPodiumBoostActive=true;
   }else{
     sorted.forEach(c=>{ if(c) c.liveStartBoost=0; });
   }
 }
 applyKabeninaHiddenPerformanceBoost(L);
 run.p=0;
 run.elapsed=0;
 const expectedStart=Math.max(1,Math.min(run.fieldSize,
   Math.round((run.fieldSize||50)*(0.30 + L[5]*0.055 - (game.fitness||0)/420 - game.level/500))
 ));
 run.position=expectedStart;
 run.currentPosition=expectedStart;
 run.running=true;

 run.startedByUser=true;
 setRaceSessionFlag(true);
 run.weatherDnfPlanned=run.weatherDnfRisk>0 && Math.random()<run.weatherDnfRisk;
 run.fatigueDnfPlanned=run.fatigueDnfRisk>0 && Math.random()<run.fatigueDnfRisk;
 run.otherDnfCount=Math.floor(simulateOtherDnfs(run.fieldSize,L,raceWeather)/2);
 run.liveDnfCount=0;
 run.otherDnfPoints=Array.from({length:run.otherDnfCount},(_,i)=>{
   const base=(i+1)/(run.otherDnfCount+1);
   return Math.max(.06,Math.min(.97,base + (Math.random()-.5)*.12));
 }).sort((a,b)=>a-b);
 if(game.current>=9){
   const rivalName=(run.raceLeaders && run.raceLeaders.length)
     ? run.raceLeaders[Math.floor(Math.random()*run.raceLeaders.length)]
     : TOP_ITRA_LEADERS[Math.floor(Math.random()*TOP_ITRA_LEADERS.length)];
   run.events.push({p:.68+Math.random()*.18,emoji:'🏆',name:`Борьба с лидером: ${rivalName}`,sec:Math.round(35+Math.random()*90),cat:null});
   run.events.sort((a,b)=>a.p-b.p);
 }
 $('eventLog').innerHTML='';
 if(gelShortage>0) $('eventLog').insertAdjacentHTML('afterbegin',`<div class="event-row"><span>СТАРТ</span><b>🍯 Не хватает гелей: ${gelShortage}</b><span class="bad">+${fmt(gelPenaltySec)}</span></div>`);
 if(lightShortageHours>0) $('eventLog').insertAdjacentHTML('afterbegin',`<div class="event-row"><span>СТАРТ</span><b>🔦 Не хватает света: ${lightShortageHours} ч</b><span class="bad">+${fmt(lightPenaltySec)}</span></div>`);
 if(fatiguePenaltySec>0) $('eventLog').insertAdjacentHTML('afterbegin',`<div class="event-row"><span>СТАРТ</span><b>😫 Накопленная усталость ${Math.round(game.fatigue)}%</b><span class="bad">+${fmt(fatiguePenaltySec)}</span></div>`);
 const trainedCoachIdx=activeRaceCoachIndex();
 if(trainedCoachIdx>0){ const tc=COACHES[trainedCoachIdx]||COACHES[0],tb=coachRaceBonusesForIndex(trainedCoachIdx); $('eventLog').insertAdjacentHTML('afterbegin',`<div class="event-row"><span>СТАРТ</span><b>🏋️ ${tc.name}: темп −${Math.round(tb.pace*100)}%, усталость −${Math.round(tb.fatigue*100)}%, подъёмы −${Math.round(tb.climb*100)}%</b><span class="good">бонус тренировки</span></div>`); }
 
 $('startBtn').disabled=true;$('pauseBtn').disabled=false;

 // Первые 3 секунды гонки показываем стартовые риски компактно справа на трассе.
 // Симуляцию эта плашка не ставит на паузу.
 if(warnings.length){
   const riskOv=$('raceStartRiskOverlay');
   if(riskOv){
     riskOv.innerHTML=`<b>⚠️ Риски на старте</b><ul>${warnings.map(x=>`<li>${x}</li>`).join('')}</ul>`;
     riskOv.classList.add('show');
     setTimeout(()=>riskOv.classList.remove('show'),3000);
   }
 }else{
   const riskOv=$('raceStartRiskOverlay');
   if(riskOv){ riskOv.innerHTML=''; riskOv.classList.remove('show'); }
 }

 // Только уровень «Чара»: сразу после старта на 3 секунды показываем
 // специальную плашку с медведем и топором. На остальных гонках её нет.
 if(String(L[0]||'').trim().toLowerCase().includes('чара')){
   const ov=$('eventOverlay');
   if(ov){
     ov.innerHTML=`<div class="overlay-box chara-bear-card chara-misha-source"><img src="misha_start.png" alt="Миша с топором — старт"></div>`;
     ov.classList.add('show');
     run.eventPause=true;
     setTimeout(()=>{
       ov.classList.remove('show');
       if(run){ run.eventPause=false; lastTs=performance.now(); }
     },3000);
   }
 }

 // Start the simulation loop first. A rendering error must never prevent
 // the race from actually starting.
 lastTs=performance.now();
 timer=requestAnimationFrame(tick);

 try{ updateRun(); }catch(e){ console.warn('initial updateRun error',e); }
 try{ renderRaceLeaders(0); }catch(e){ console.warn('initial leaders render error',e); }
 try{ drawTrack(0); }catch(e){ console.warn('initial track render error',e); }
}



function applyKabeninaHiddenPerformanceBoost(L){
  try{
    if(!run || !Array.isArray(run.virtualField) || !run.virtualField.length) return;
    const kabName='Анастасия Кабенина';
    const kab=run.virtualField.find(c=>String(c?.name||'').trim()===kabName);
    if(!kab || kab.dnf) return;

    // Иногда Кабенина проводит особенно сильную гонку и бежит так,
    // будто её текущая форма примерно на +100 ITRA выше базового рейтинга.
    // Это скрытый соревновательный буст: в таблицах базовый ITRA остаётся прежним.
    const isChara=Math.abs(Number(L?.[1]||0)-138)<0.01;
    const triggerChance=isChara ? 0.45 : 0.30;
    kab.hiddenItraBoostActive=Math.random()<triggerChance;
    if(!kab.hiddenItraBoostActive) return;

    kab.hiddenItraEquivalent=Math.min(980, Number(kab.itra||850)+100);
    const minOpponentFinish=isChara ? 18*60*60 : 0;
    const currentFinish=Math.max(60, Number(kab.finishSec||0));
    const fasterFactor=isChara ? (0.94 + Math.random()*0.02) : (0.89 + Math.random()*0.04);
    kab.finishSec=Math.max(minOpponentFinish, currentFinish*fasterFactor);
    kab.liveStartBoost=Math.max(Number(kab.liveStartBoost||0), (isChara?0.020:0.014) + Math.random()*0.010);
    kab.hiddenHotFormLabel='Скрытая форма: бежит сильнее своего ITRA';
  }catch(e){}
}

function buildAidStations(distanceKm){
  const d=Math.max(0,Number(distanceKm||0));
  // Чара 138 км: фиксированные 4 пункта питания.
  if(Math.abs(d-138)<0.01) return [27,54,82,109];
  if(d<100) return [];
  const pts=[];
  let km=50+Math.random()*20; // first PP at 50–70 km
  while(km<d-20){
    pts.push(Math.round(km*10)/10);
    km+=50+Math.random()*20;  // next PP every 50–70 km
  }
  return pts;
}


function triggerCharaFloodEvent(ppKm, dist){
  if(!run || !run.running) return;
  if(run.charaFloodResolved) return;
  if(Math.abs(Number(dist||0)-138)>=0.01) return;
  if(Math.abs(Number(ppKm||0)-82)>0.2) return;
  run.charaFloodResolved=true;
  run.riverMassOverlayActive=true;

  // Убираем любые накопленные обычные DNF, чтобы они не могли
  // показаться пятёркой поверх массового события реки.
  if(Array.isArray(run.dnfDisplayPending)) run.dnfDisplayPending.length=0;
  clearRaceOverlayQueue();

  if(!(run.dnfNames instanceof Set)){
    run.dnfNames=new Set(Array.isArray(run.dnfNames)?run.dnfNames:[]);
  }

  const active=Array.isArray(run.virtualField)
    ? run.virtualField.filter(c=>c && !c.dnf)
    : [];
  const target=Math.max(0,Math.min(active.length,Math.round(active.length*0.70)));
  const floodDnfs=[];
  const shuffled=[...active].sort(()=>Math.random()-0.5);

  for(let i=0;i<target;i++){
    const c=shuffled[i];
    if(!c || c.dnf) continue;
    c.dnf=true;
    c.dnfKm=82;
    c.dnfReason='река разлилась';
    const n=String(c.name||c.runnerName||c.fullName||'Участник').trim();
    if(n) run.dnfNames.add(n.toLowerCase());
    floodDnfs.push({name:n,km:82});
  }

  const affected=floodDnfs.length;
  run.liveDnfCount=Math.max(0,Number(run.liveDnfCount||0)+affected);

  // ЖЁСТКО отдельная плашка реки: все имена сразу, без showDnfBatch
  // и без очереди обычных DNF. Держится 5 реальных секунд.
  const ov=$('eventOverlay');
  if(ov && affected){
    const rows=floodDnfs
      .map((x,i)=>`${i+1}. ${String(x.name||'Участник')} — 82.0 км`)
      .join('<br>');

    ov.innerHTML=
      `<div class="overlay-box river-dnf-all-card">
        <div class="river-dnf-head">
          <div class="emoji">🌊</div>
          <div class="river-dnf-title">РЕКА РАЗЛИЛАСЬ</div>
          <div class="river-dnf-subtitle">Список DNF из-за разлива · всего ${affected}</div>
        </div>
        <div class="river-dnf-scroll"><div class="river-dnf-list">${rows}</div></div>
        <div class="river-player-safe">Игрок нашёл обход · +20:00</div>
      </div>`;
    ov.classList.add('show','river-mass-show');
    const scrollBox=ov.querySelector('.river-dnf-scroll');
    if(scrollBox) scrollBox.scrollTop=0;
    run.eventPause=true;
    lastTs=performance.now();

    const riverEpoch=(run.riverOverlayEpoch=Number(run.riverOverlayEpoch||0)+1);
    setTimeout(()=>{
      if(!run || Number(run.riverOverlayEpoch||0)!==riverEpoch) return;
      ov.classList.remove('show','river-mass-show');
      ov.innerHTML='';
      run.riverMassOverlayActive=false;
      run.eventPause=false;
      lastTs=performance.now();
    },5000);
  }else{
    try{ ov?.classList.remove('river-mass-show'); }catch(e){}
    run.riverMassOverlayActive=false;
  }

  // В журнале одна строка массового схода, а не 5-ки.
  try{
    $('eventLog').insertAdjacentHTML(
      'afterbegin',
      `<div class="event-row dnf-event-row"><span>82.0 км</span><b>🌊 Река разлилась · сошло ${affected}</b><span class="neutral">все участники массового схода перечислены в плашке</span></div>`
    );
  }catch(e){}

  // Игрок под правило 70% не попадает.
  run.penalty=(Number(run.penalty)||0)+1200;
  try{
    $('eventLog').insertAdjacentHTML(
      'afterbegin',
      `<div class="event-row"><span>82.0 км</span><b>🌊 Найден обход</b><span class="bad">+20:00</span></div>`
    );
  }catch(e){}
}

function updateAidStationsAndWater(){
  if(!run || !run.running) return;
  const L=levelData();
  const dist=Math.max(1,Number(L[1]||run.raceDistance||1));
  if(dist<100) return;

  const playerKm=Math.max(0,Math.min(dist,Number(run.p||0)*dist));
  if(!Array.isArray(run.aidStations)) run.aidStations=buildAidStations(dist);
  if(!run.aidStationsPassed) run.aidStationsPassed=new Set();

  for(const ppKm of run.aidStations){
    const key=String(ppKm);
    if(playerKm+1e-9<ppKm || run.aidStationsPassed.has(key)) continue;

    run.aidStationsPassed.add(key);

    // Refill enough water for the next ~70 km section.
    const rate=Math.max(0.001,Number(run.waterNeed||1)/dist);
    const refill=Math.max(1,Math.ceil(rate*70));
    run.waterRemaining=refill;
    // Stop at aid station to refill water: costs 1 minute.
    run.penalty=(Number(run.penalty)||0)+60;
    run.waterSegmentStartKm=ppKm;
    run.waterSegmentStartAmount=refill;
    run.waterEmptyNotified=false;
    if(run.condition==='жажда') run.condition='нормально';

    const msg=`ПП ${ppKm.toFixed(1)} км · вода пополнена: ${refill} × 0,5 л · остановка +1:00`;
    showEvent({emoji:'🥤',name:'Пункт питания'},60,` · вода пополнена: ${refill} × 0,5 л`);
    try{
      $('eventLog').insertAdjacentHTML(
        'afterbegin',
        `<div class="event-row"><span>${ppKm.toFixed(1)} км</span><b>🥤 Пункт питания · вода пополнена: ${refill} × 0,5 л</b><span class="bad">+1:00</span></div>`
      );
    }catch(e){}

    triggerCharaFloodEvent(ppKm, dist);
    if(run?.dnf) return;
  }
}

function notifyWaterEndedDuringRace(){
  try{
    if(!run || !run.running) return;
    const p=Number(run.p||0);
    if(p<=0) return;

    // Если на этой гонке вода по балансу не требуется (ранние короткие уровни),
    // событие «Вода закончилась» вообще не создаём. Покупка воды остаётся
    // отдельной от покупки рюкзака/жилета: воду можно покупать всегда до старта.
    if(Number(run.waterNeed||0)<=0){
      run.waterEmptyNotified=true;
      if(run.condition==='жажда') run.condition='нормально';
      return;
    }

    // Ignore transitional/undefined state: it must not create thirst.
    if(run.waterRemaining===undefined || run.waterRemaining===null) return;

    const waterNow=Math.max(0,Number(run.waterRemaining));
    if(waterNow>0){
      run.waterEmptyNotified=false;
      if(run.condition==='жажда') run.condition='нормально';
      return;
    }

    // If the runner started with water, only declare thirst after the
    // calculated section has actually consumed it.
    const startAmount=Math.max(0,Number(run.waterSegmentStartAmount||run.waterStart||0));
    const L=levelData();
    const dist=Math.max(1,Number(L[1]||1));
    const playerKm=Math.max(0,Math.min(dist,p*dist));
    const segKm=Math.max(0,Number(run.waterSegmentStartKm||0));
    const rate=Math.max(0.001,Number(run.waterNeed||1)/dist);
    const consumed=Math.floor(Math.max(0,playerKm-segKm)*rate + 1e-9);
    if(startAmount>0 && consumed<startAmount) return;

    if(run.waterEmptyNotified) return;
    run.waterEmptyNotified=true;
    run.condition='жажда';
    showEvent({emoji:'💧',name:'Вода закончилась'},0,' · дальше без воды');
    try{
      $('eventLog').insertAdjacentHTML(
        'afterbegin',
        `<div class="event-row"><span>${playerKm.toFixed(1)} км</span><b>💧 Вода закончилась</b><span class="bad">дальше без воды</span></div>`
      );
    }catch(e){}
  }catch(e){}
}

function tick(ts){
 if(!run||!run.running)return;

 // Schedule the next frame immediately. If a DNF/UI update throws later in this
 // frame, the race loop will still continue on the next frame instead of freezing.
 timer=requestAnimationFrame(tick);

 const L=levelData();
 // Визуальная скорость прохождения увеличена в 2 раза относительно предыдущей сборки; игровое финишное время не меняется.
 const dt=(ts-lastTs)/1000*Number($('speed').value||2);lastTs=ts;
 if(!run.paused && !run.eventPause){
   const total=Math.max(60,run.base+run.penalty);
   const raceKmBefore=Math.max(0,Number(run.p||0)*Number(L[1]||0));
   // Гуарана: до 100 км — 1 использование, свыше 100 км — 2, на 500 км+ — 4.
   // После успешного буста через 20 км отрицательный откат срабатывает только с шансом 30%.
   if(run.guaranaTriggerKm>0&&!run.guaranaCrashChecked&&raceKmBefore>=run.guaranaTriggerKm+20){
     run.guaranaCrashChecked=true;
     if(Math.random()<0.30){
       run.guaranaCrash=true;
       run.guaranaCrashEndKm=run.guaranaTriggerKm+50;
       showEvent({emoji:'⚠️',name:'Откат после гуараны'},0,' · шанс 30% сработал · скорость −40% на 30 км');
     }else{
       run.guaranaCrash=false;
       run.guaranaCrashEndKm=0;
       run.guaranaTriggerKm=0;
       showEvent({emoji:'✅',name:'Без отката после гуараны'},0,' · отрицательный эффект не сработал');
     }
   }
   if(run.guaranaCrash&&raceKmBefore>=Number(run.guaranaCrashEndKm||0)){run.guaranaCrash=false;run.guaranaTriggerKm=0;run.guaranaCrashEndKm=0;showEvent({emoji:'✅',name:'Откат гуараны закончился'},0,' · обычный темп восстановлен');}
   let speedMult=1;
   if(Number(run.guaranaTriggerKm||0)>0 && !run.guaranaCrashChecked && raceKmBefore<Number(run.guaranaTriggerKm||0)+20) speedMult*=1.15;
   if(run.guaranaCrash) speedMult*=0.60;
   run.elapsed+=dt*speedMult;
   run.p=Math.min(1,run.elapsed/total);
   fireEvents();
   updateLiveDnfs();
   updateRealisticPosition();

   // Gradually consume water within the current section (start → PP or PP → PP).
   const raceDist=Math.max(1,Number(L[1]||1));
   const playerKm=Math.max(0,Math.min(raceDist,Number(run.p||0)*raceDist));
   const rate=Math.max(0.001,Number(run.waterNeed||1)/raceDist);
   const segmentStartKm=Math.max(0,Number(run.waterSegmentStartKm||0));
   const segmentStartAmount=Math.max(0,Number(run.waterSegmentStartAmount||0));
   const usedSinceSegment=Math.floor(Math.max(0,playerKm-segmentStartKm)*rate + 1e-9);
   run.waterRemaining=Math.max(0,segmentStartAmount-usedSinceSegment);

   updateAidStationsAndWater();
   updateRun();
   notifyWaterEndedDuringRace();
   renderRaceLeaders((run.p||0)*Number((run&&run.raceDistance)||L[1]||5));
   drawTrack(run.p||0);
 }
 if(!run.dnf && run.fatigueDnfPlanned && !run.fatigueDnfTriggered && run.p>=run.fatigueDnfAt){
    run.fatigueDnfTriggered=true; run.dnf=true; run.condition='критическая усталость';
    showEvent({emoji:'😵',name:'Критическая усталость'},0,` · усталость ${Math.round(game.fatigue)}% → DNF`);
    setTimeout(()=>finishRace(true,'fatigue'),900); return;
  }
 if(!run.dnf && run.weatherDnfPlanned && !run.weatherDnfTriggered && run.p>=run.weatherDnfAt){
    run.weatherDnfTriggered=true;
    run.dnf=true;
    if(run.weatherDnfReason==='heat'){
      run.condition='перегрев';
      showEvent({emoji:'🥵',name:'Перегрев'},0,' · жара → DNF');
      setTimeout(()=>finishRace(true,'heat'),900);
    }else{
      run.condition='плохая погода';
      showEvent({emoji:'🌪️',name:'Экстремальная погода'},0,' · условия → DNF');
      setTimeout(()=>finishRace(true,'weather'),900);
    }
    return;
  }
  if(run.dnf){
    cancelAnimationFrame(timer);
    return;
  }
  if(run.p>=1){
    cancelAnimationFrame(timer);
    finishRace(false);
  }
}
function fireEvents(){
 run.events.forEach((ev,i)=>{
  if(run.p>=ev.p&&!run.fired.has(i)){
   run.fired.add(i);
   let sec=ev.sec,extra='';

   // Gel «УГЛИ»: событие возможно в пуле, но бонус работает только при наличии геля.
   if(ev.cat==='ugli'){
     ensureResources();
     if(Number(run.gelsRemaining||0)>0){
       run.gelsRemaining=Math.max(0,Number(run.gelsRemaining||0)-1);
       if(!run.eventResourceSpend)run.eventResourceSpend={}; run.eventResourceSpend.gels=(Number(run.eventResourceSpend.gels)||0)+1;
       // Небольшая вариативность эффекта: примерно 1–3 минуты выигрыша.
       const bonuses=[60,90,120,180];
       sec=-bonuses[Math.floor(Math.random()*bonuses.length)];
       extra=' · израсходован 1 гель «УГЛИ»';
       saveGame();
     }else{
       // Нет геля — событие «УГЛИ сработал» не показываем вообще.
       return;
     }
   // Medical events.
   }else if(ev.cat==='medkit'){
     if(game.resources.bandage>0 && game.resources.peroxide>0){
       useResource('bandage',1,'event');useResource('peroxide',1,'event');sec=0;
       extra=' · бинт + перекись → обработано';
     }else if(game.resources.gauze>0 && game.resources.peroxide>0){
       useResource('gauze',1,'event');useResource('peroxide',1,'event');sec=Math.round(sec*.35);
       extra=' · марля + перекись → частично обработано';
     }else{
       sec+=180;extra=' · аптечки не хватает';
     }
     saveGame();
   }else if(ev.cat==='cream'){
     if(game.resources.cream>0){
       useResource('cream',1,'event');sec=0;extra=' · крем помог';
     }else if(game.resources.plaster>0){
       useResource('plaster',1,'event');sec=Math.round(sec*.4);extra=' · крем закончился, пластырь помог частично';
     }else if(Number(run.medkitsRemaining||0)>0){
       run.medkitsRemaining=Math.max(0,Number(run.medkitsRemaining)-1);
       if(!run.eventResourceSpend)run.eventResourceSpend={}; run.eventResourceSpend.medkits=(Number(run.eventResourceSpend.medkits)||0)+1;
       sec=Math.round(sec*.35);extra=' · крема нет, использована готовая аптечка';
     }else{
       sec+=360;run.condition='сильное натирание';extra=' · крем и аптечка закончились → сильное натирание';
     }
     saveGame();
   }else if(ev.cat==='injury'){
     const medLevel=Math.max(1,Number(game.gear?.medkit||0)+1);
     const medItem=item('medkit');
     const medDur=durability('medkit');
     const medWorking=medDur>0;
     const coachInjuryReduction=coachRaceBonuses().injury;
     const kitsAvailable=Math.max(0,Number(run.medkitsRemaining||0));
     if(kitsAvailable>0){ run.medkitsRemaining=Math.max(0,kitsAvailable-1); if(!run.eventResourceSpend)run.eventResourceSpend={}; run.eventResourceSpend.medkits=(Number(run.eventResourceSpend.medkits)||0)+1; }

     // Higher-level medkits reduce both the chance of a severe injury and its time cost.
     // Level 1 gives almost no protection; level 7 is substantially safer, but never invulnerable.
     const injuryProtection=medWorking ? Math.min(.72,(medLevel-1)*.11 + (medItem?.[4]||0)*.8) : 0;
     const severeRisk=Math.max(.01,run.fractureRisk*(1-injuryProtection)*(1-coachInjuryReduction));
     const noTraumaSupplies = kitsAvailable<=0 && Number(game.resources.gauze||0)<=0 && Number(game.resources.bandage||0)<=0 && Number(game.resources.plaster||0)<=0;
     const fracture=noTraumaSupplies || Math.random()<severeRisk;

     if(fracture){
       run.dnf=true;
       run.condition='перелом ноги';
       game.hospitalUntil=0;
       game.needsHospital=true;
       saveGame();
       showEvent({emoji:'🦴',name:'Перелом ноги'},0,` · аптечка ур. ${medLevel}/7 не спасла → DNF · нужна больница`);
       setTimeout(()=>finishRace(true,'fracture'),1200);
       return;
     }

     // Ordinary injury: medkit level reduces lost time.
     const baseSec=sec;
     if(medWorking){
       sec=Math.max(20,Math.round(sec*(1-injuryProtection*.78)));
       extra=` · аптечка ур. ${medLevel}/7 уменьшила последствия`;
     }else{
       sec+=180;
       extra=' · аптечка сломана';
     }

     // Готовый комплект расходует заранее собранную аптечку целиком.
     // Если комплекты закончились, последствия повторных травм/натираний тяжелее.
     if(kitsAvailable>0){
       sec=Math.max(8,Math.round(sec*.62));
       extra+=' · использован готовый комплект аптечки';
     }else if(game.resources.gauze>0 && game.resources.bandage>0){
       useResource('gauze',1,'event');useResource('bandage',1,'event');
       sec=Math.max(10,Math.round(sec*.55));
       extra+=' · марля + бинт';
       saveGame();
     }else if(game.resources.plaster>0){
       useResource('plaster',1,'event');
       sec=Math.max(15,Math.round(sec*.78));
       extra+=' · пластырь';
       saveGame();
     }else{
       extra+=' · без расходников';
     }

     run.condition=sec>=180?'травма':'нормально';
   }else if(ev.cat==='gearFind'){
     const cat=ev.foundCat,found=Number(ev.foundLevel||0);
     if(cat && found>Number(game.gear?.[cat]||0)){
       if(!game.gearOwned)game.gearOwned={};
       if(!Array.isArray(game.gearOwned[cat]))game.gearOwned[cat]=[];
       if(!game.gearOwned[cat].includes(found))game.gearOwned[cat].push(found);
       if(game.durability[cat+'_'+found]==null)game.durability[cat+'_'+found]=GEAR[cat][found][3];
       const oldLevel=Number(game.gear[cat]||0);
       game.gear[cat]=found;
       saveGame();
       sec=-90;
       extra=` · найдено бесплатно · ${CATEGORY_NAMES[cat]} ${found+1}/7 надета вместо ур. ${oldLevel+1}`;
       showEvent(ev,sec,extra);
       if(!game.achievements)game.achievements={};
       game.achievements['found_'+cat+'_'+found]={name:`Охотник за ${CATEGORY_NAMES[cat]}`,date:Date.now()};
       saveGame();
       return;
     }
   }else if(ev.cat){
     const currentMembraneReq=membraneRequiredLevel(levelData(),weatherForLevel());
     if(ev.cat==='jacket' && currentMembraneReq>0 &&
        (weatherForLevel().rain||weatherForLevel().cold) &&
        !hasMembrane(currentMembraneReq)){
       if((Number(game.resources.rescueBlanket||0)+Number(game.resources.medkits||0))>0 && Math.random()<0.50){
         if(Number(game.resources.rescueBlanket||0)>0) useResource('rescueBlanket',1,'event');
         else useResource('medkits',1,'event');
         sec=Math.round(sec*.35);
         extra=' · спасательное одеяло сработало (50/50), DNF предотвращён';
       }else{
         run.dnf=true;run.condition='переохлаждение';
         showEvent({emoji:'🥶',name:'Переохлаждение'},0,` · нужна мембранка ур. ${membraneRequiredLevel(levelData(),weatherForLevel())}/7+ и нет спасательного одеяла → DNF`);
         setTimeout(()=>finishRace(true,'freeze'),1200);
         return;
       }
     }
     const broken=Math.random()<equipmentPenaltyChance(ev.cat,levelData()[5],levelData()[1]);
     const it=item(ev.cat),cur=durability(ev.cat);
     if(cur<=0||broken){
       sec+=180+levelData()[5]*60;
       extra=` · ⚠️ ${CATEGORY_NAMES[ev.cat]} подвела`;
       run.condition='проблема с экипировкой';
       if(ev.cat==='poles'){
         setDur('poles',0);
         extra+=' · палки сломаны';
       }
       // Полная поломка = предмет исчезает из инвентаря, его надо покупать заново.
       const brokenLevel=Number(game.gear?.[ev.cat]||0);
       if(brokenLevel>0 && Math.random()<0.20){
         if(Array.isArray(game.gearOwned?.[ev.cat])){
           game.gearOwned[ev.cat]=game.gearOwned[ev.cat].filter(x=>Number(x)!==brokenLevel);
         }
         game.gear[ev.cat]=0;
         extra+=` · ${CATEGORY_NAMES[ev.cat]} уничтожена полностью — нужна новая`;
       }
     }else if(it[4]>.05 && sec>0){
       const saved=Math.round(sec*Math.min(.65,it[4]*3));
       sec-=saved;extra=` · экипировка спасла ${fmt(saved)}`;
     }
   }

   run.penalty+=sec;
   showEvent(ev,sec,extra);
   renderRaceGearSummary();
  }
 });
}
// Очередь плашек событий: каждая держится ровно 2 реальные секунды,
// независимо от скорости симуляции (480×, 600× и т.п.). Новое событие
// больше не затирает текущее раньше времени.
window.__raceOverlayQueue=window.__raceOverlayQueue||[];
window.__raceOverlayBusy=window.__raceOverlayBusy||false;
function clearRaceOverlayQueue(){
  window.__raceOverlayEpoch=Number(window.__raceOverlayEpoch||0)+1;
  if(Array.isArray(window.__raceOverlayQueue)) window.__raceOverlayQueue.length=0;
  window.__raceOverlayBusy=false;
  const ov=$('eventOverlay');
  if(ov){ov.classList.remove('show');ov.innerHTML='';}
}
function queueRaceOverlay(html,duration=2000){
  if(!run || !run.running) return;
  if(!Array.isArray(window.__raceOverlayQueue)) window.__raceOverlayQueue=[];
  const epoch=Number(window.__raceOverlayEpoch||0);
  window.__raceOverlayQueue.push({html,duration:Math.max(300,Number(duration)||2000),epoch});
  if(window.__raceOverlayBusy) return;
  const playNext=()=>{
    const currentEpoch=Number(window.__raceOverlayEpoch||0);
    const item=window.__raceOverlayQueue.shift();
    if(!item){window.__raceOverlayBusy=false;return;}
    if(item.epoch!==currentEpoch){window.__raceOverlayBusy=false;playNext();return;}
    window.__raceOverlayBusy=true;
    const ov=$('eventOverlay');
    if(!ov){window.__raceOverlayBusy=false;playNext();return;}
    ov.innerHTML=item.html;
    ov.classList.add('show');
    setTimeout(()=>{
      if(item.epoch!==Number(window.__raceOverlayEpoch||0)) return;
      ov.classList.remove('show');
      setTimeout(()=>{
        if(item.epoch!==Number(window.__raceOverlayEpoch||0)) return;
        window.__raceOverlayBusy=false;
        playNext();
      },80);
    },item.duration);
  };
  playNext();
}
function showEvent(ev,sec,extra){
 const html=`<div class="overlay-box"><div class="emoji">${ev.emoji}</div><b>${ev.name}</b><span>${sec>=0?'+':'−'}${fmt(Math.abs(sec))}${extra}</span></div>`;
 queueRaceOverlay(html,2000);
 const cls=sec<0?'good':sec>0?'bad':'neutral';
 $('eventLog').insertAdjacentHTML('afterbegin',`<div class="event-row"><span>${(run.p*levelData()[1]).toFixed(1)} км</span><b>${ev.emoji} ${ev.name}${extra}</b><span class="${cls}">${sec>=0?'+':'−'}${fmt(Math.abs(sec))}</span></div>`);
}

function terrainStateForProgress(L,p){
  p=Math.max(0,Math.min(1,Number(p||0)));
  const distKm=Math.max(1,Number(L[1]||1));
  const totalGain=Math.max(0,Number(L[2]||0));
  const difficulty=Math.max(1,Number(L[5]||1));
  const avgClimbPct=totalGain/(distKm*1000)*100;

  // Deterministic changing profile for each race: uphill/downhill/rolling sections.
  const phase=distKm*.071 + difficulty*.63;
  const wave=
    Math.sin(p*Math.PI*(7+difficulty)+phase)*.72 +
    Math.sin(p*Math.PI*19+phase*.47)*.28;

  // Bigger total climbing and harder races produce steeper local grades.
  const amplitude=Math.min(20,Math.max(4.5,avgClimbPct*2.35+difficulty*1.15));
  let slope=wave*amplitude;

  // Avoid unrealistic cliffs while still allowing steep trail sections.
  slope=Math.max(-18,Math.min(24,slope));

  const gainDone=Math.round(totalGain*p);
  let slopeType='ровно';
  if(slope>=12) slopeType='крутой подъём';
  else if(slope>=5) slopeType='подъём';
  else if(slope>=2) slopeType='лёгкий подъём';
  else if(slope<=-12) slopeType='крутой спуск';
  else if(slope<=-5) slopeType='спуск';
  else if(slope<=-2) slopeType='лёгкий спуск';

  return {slope,gainDone,totalGain,slopeType};
}

function updateRun(){
 try{
   if(run && run.running){
     // Вода расходуется по фактическому прогрессу, а не потому, что
     // стартовый инвентарь уже обнулён при переносе в race-state.
     notifyWaterEndedDuringRace();
   }
 }catch(e){}

  try{ dynamicLeaderGroupExchange(typeof run!=='undefined'?run:(typeof game!=='undefined'?game.run:null)); }catch(e){}

 const L=levelData(),km=run.p*L[1],total=Math.max(1,run.base+run.penalty);
 $('progressKm').textContent=`${km.toFixed(1)} / ${L[1].toFixed(1)} км`;
 $('clock').textContent=fmt(run.elapsed);
 $('progressBar').style.width=(run.p*100)+'%';
 updateRaceGuaranaButton();
 const plannedGelUse=Math.min(Number(run.gelsStart||0),Math.floor(Math.max(0,Math.min(1,Number(run.p||0)))*Number(run.gelsStart||0)));
 const prevPlannedGelUse=Number(run.gelsPlannedUsed||0);
 if(plannedGelUse>prevPlannedGelUse){ run.gelsRemaining=Math.max(0,Number(run.gelsRemaining||0)-(plannedGelUse-prevPlannedGelUse)); run.gelsPlannedUsed=plannedGelUse; }
 if($('raceGelStatus')) $('raceGelStatus').textContent=`🍯 Гели в гонке: ${Number(run.gelsRemaining||0)} / ${Number(run.gelsStart||0)}`;
 // Live climb and gradient.
 const terrain=terrainStateForProgress(L,run.p||0);
 if($('liveGain')){
   $('liveGain').textContent=`${terrain.gainDone.toLocaleString('ru-RU')} м`;
   $('liveGainTotal').textContent=`из ${terrain.totalGain.toLocaleString('ru-RU')} м`;
 }
 if($('liveSlope')){
   const sign=terrain.slope>0?'+':'';
   $('liveSlope').textContent=`${sign}${terrain.slope.toFixed(1)}%`;
   $('liveSlopeType').textContent=terrain.slopeType;
 }

 // Current pace is directly affected by the current gradient.
 const avgPaceSec=total/Math.max(.1,L[1]);
 const progress=Math.max(0,Math.min(1,Number(run.p||0)));
 const slope=terrain.slope;

 let slopeFactor=1;
 if(slope>=0){
   // Uphill: coach reduces the climbing penalty.
   const climbReduction=coachRaceBonuses().climb;
   slopeFactor += Math.min(.58,slope*.027)*(1-climbReduction);
 }else{
   const down=Math.abs(slope);
   // Moderate descents are faster; very steep descents become technical and slow again.
   if(down<=8) slopeFactor -= down*.018;
   else slopeFactor -= .144 - (down-8)*.012;
 }

 // Ultra fatigue gradually slows pace later in the race.
 const distanceFatigue=Math.max(0,Number(L[1]||0)-30)/270;
 const lateRace=Math.pow(progress,1.7);
 const fatigueFactor=1 + lateRace*(.04 + .14*Math.min(1,distanceFatigue));

 // Small natural variation so identical slopes do not look mechanically fixed.
 const strideFactor=1 + Math.sin(progress*Math.PI*53)*.012;

 let livePaceSec=avgPaceSec*slopeFactor*fatigueFactor*strideFactor;

 if(run.condition==='сильная усталость') livePaceSec*=1+(0.08*(1-coachRaceBonuses().fatigue));
 else if(run.condition==='травма') livePaceSec*=1.12;
 else if(run.condition==='проблема с экипировкой') livePaceSec*=1.06;

 livePaceSec=Math.max(avgPaceSec*.72,Math.min(avgPaceSec*1.75,livePaceSec));
 run.livePaceSec=livePaceSec;
 run.liveSlope=terrain.slope;
 run.liveGain=terrain.gainDone;
 if($('raceWaterLive')) $('raceWaterLive').textContent=`${(Number(run.waterRemaining||0)*0.5).toFixed(1).replace('.0','')} л / ${(Number(run.waterStart||0)*0.5).toFixed(1).replace('.0','')} л`;
 renderRaceGearSummary();
 $('pace').textContent=fmt(livePaceSec).replace(/\s*:\s*/g,':')+'/км'; const hrmLvl=Math.max(1,Number(game.gear?.hrm||0)+1),accuracy=Math.min(97,55+(hrmLvl-1)*7),target=avgPaceSec*slopeFactor,spread=Math.max(3,Math.round((1-accuracy/100)*70)); if($('paceGuide'))$('paceGuide').textContent=`❤️ Пульсометр ур. ${hrmLvl}/7 · цель ${fmt(target).replace(/\s*:\s*/g,':')}/км ±${spread}с`;

 // Realistic live position from virtual competitors.
 let estimatedPos=updateRealisticPosition() || Math.max(1,run.currentPosition||run.position||1);

 // Calculate leader progress using the candidate place itself, so the UI cannot say
 // "1st place" while one or more TOP-3 athletes are already shown as finished ahead.
 const leaderKms=[1,2,3].map(rank=>leaderKmForPosition(rank,L,km,estimatedPos));
 if(km<L[1]-0.001){
   const leadersFinished=leaderKms.filter(v=>v>=L[1]-0.001).length;
   estimatedPos=Math.max(estimatedPos,leadersFinished+1);
 }

 if(km < L[1]-0.001) run.lastPositionBeforeFinish=estimatedPos;
 run.currentPosition=estimatedPos;
 $('position').textContent=estimatedPos;
 $('penalties').textContent=(run.penalty>=0?'+':'−')+fmt(Math.abs(run.penalty));
 $('condition').textContent=run.condition;
 renderRaceLeaders(km);
 drawTrack(run.p);
}
function finalizeVirtualRaceAfterPlayerDnf(){
  if(!run || !Array.isArray(run.virtualField)) return {finishers:[],dnfs:0};
  const L=levelData(), w=weatherForLevel();
  const p=competitorDnfRate(L,w);
  const raceKm=Number(L[1]||0);
  // После схода игрока остальная гонка виртуально доигрывается до конца.
  for(const c of run.virtualField){
    if(!c || c.dnf) continue;
    let risk=p;
    const name=String(c.name||'');
    if(isItraDnfProtectedRunner(c) && raceKm<130) risk=0;
    else if(isItraDnfProtectedRunner(c)) risk*=0.28;
    if(/Береснев|Юшина/.test(name)) risk*=0.35;
    if(Math.random()<risk) c.dnf=true;
  }
  const finishers=run.virtualField.filter(c=>c&&!c.dnf).sort((a,b)=>Number(a.finishSec||Infinity)-Number(b.finishSec||Infinity));
  const dnfs=run.virtualField.filter(c=>c&&c.dnf).length+1; // + игрок
  run.liveDnfCount=Math.max(Number(run.liveDnfCount||0),dnfs-1);
  return {finishers,dnfs};
}
function virtualResultsHtml(result){
  const top=(result?.finishers||[]).slice(0,14);
  if(!top.length) return '';
  return `<div class="virtual-final" style="margin-top:12px;text-align:left"><b>🏁 Итог виртуальной гонки:</b><br>${top.map((c,i)=>`${i+1}. ${String(c.name||('Участник '+(c.id+1)))} — ${fmt(Number(c.finishSec||0))}`).join('<br>')}<br>🚫 Всего сходов: ${result.dnfs} из ${run.fieldSize}</div>`;
}

// v1.03: always show the first three finishers on the normal finish card.
function finishTop3Html(playerPos, playerFinalSec){
  const medal=['🥇','🥈','🥉'];
  const npcs=(Array.isArray(run?.virtualField)?run.virtualField:[])
    .filter(c=>c && !c.dnf)
    .slice()
    .sort((a,b)=>Number(a.finishSec||Infinity)-Number(b.finishSec||Infinity));
  const player={player:true,name:safeProfileNameForRace(),finishSec:Number(playerFinalSec||0)};
  let rows=[];
  const p=Math.max(1,Math.round(Number(playerPos||1)));
  if(p<=3){
    let ni=0;
    for(let rank=1;rank<=3;rank++){
      if(rank===p){
        rows.push(player);
      }else{
        const c=npcs[ni++];
        if(c) rows.push({player:false,name:String(c.name||('Участник '+(Number(c.id||0)+1))),finishSec:Number(c.finishSec||0)});
      }
    }
  }else{
    rows=npcs.slice(0,3).map(c=>({player:false,name:String(c.name||('Участник '+(Number(c.id||0)+1))),finishSec:Number(c.finishSec||0)}));
  }
  if(!rows.length) return '';
  return `<br><br><b>🏆 Первые 3 места:</b><br>${rows.map((r,i)=>`${medal[i]} ${i+1}. ${r.name}${r.player?' (Вы)':''} — ${fmt(Math.max(1,Number(r.finishSec||0)))}`).join('<br>')}`;
}


function logFinishTop3ToRaceEvents(playerPos, playerFinalSec){
  try{
    const log=$('eventLog');
    if(!log) return;
    const medal=['🥇','🥈','🥉'];
    const npcs=(Array.isArray(run?.virtualField)?run.virtualField:[])
      .filter(c=>c && !c.dnf)
      .slice()
      .sort((a,b)=>Number(a.finishSec||Infinity)-Number(b.finishSec||Infinity));
    const player={player:true,name:safeProfileNameForRace(),finishSec:Number(playerFinalSec||0)};
    const p=Math.max(1,Math.round(Number(playerPos||1)));
    let rows=[];
    if(p<=3){
      let ni=0;
      for(let rank=1;rank<=3;rank++){
        if(rank===p){
          rows.push(player);
        }else{
          const c=npcs[ni++];
          if(c) rows.push({player:false,name:String(c.name||('Участник '+(Number(c.id||0)+1))),finishSec:Number(c.finishSec||0)});
        }
      }
    }else{
      rows=npcs.slice(0,3).map(c=>({player:false,name:String(c.name||('Участник '+(Number(c.id||0)+1))),finishSec:Number(c.finishSec||0)}));
    }
    if(!rows.length) return;
    const dist=Number(levelData()?.[1]||0);
    for(let i=rows.length-1;i>=0;i--){
      const r=rows[i];
      log.insertAdjacentHTML(
        'afterbegin',
        `<div class="event-row finish-top3-event"><span>${dist.toFixed(1)} км</span><b>${medal[i]} ${i+1}. ${r.name}${r.player?' (Вы)':''}</b><span class="good">${fmt(Math.max(1,Number(r.finishSec||0)))}</span></div>`
      );
    }
    log.insertAdjacentHTML('afterbegin',`<div class="event-row finish-top3-title"><span>ФИНИШ</span><b>🏆 ТОП-3 · время финиша</b><span class="neutral">итог</span></div>`);
  }catch(e){console.warn('TOP-3 event log error',e);}
}

function finishRace(forceDnf=false,dnfReason='fracture'){
 if(!run||!run.running)return;
 // После завершения любой гонки автоматически сворачиваем блок «Текущая экипировка».
 const equipmentSection=$('currentEquipmentSection');
 if(equipmentSection) equipmentSection.open=false;
 cancelAnimationFrame(timer);$('pauseBtn').disabled=true;$('startBtn').disabled=false;updateRaceGuaranaButton();
 const L=levelData();
 const isPlayerDnf=Boolean(forceDnf || run.dnf);
 // При DNF фиксируем игрока ровно в точке схода. Только успешный финиш ставит прогресс на 100%.
 run.finishHold=!isPlayerDnf;
 if(!isPlayerDnf){
   clearRaceOverlayQueue();
   run.p=1;
   drawTrack(1);
   renderRaceLeaders(Number(L[1]||0));
 }else{
   drawTrack(run.p||0);
   renderRaceLeaders((run.p||0)*Number(L[1]||0));
 }
 updateRestUi();

 if(isPlayerDnf){
   run.running=false; run.finishHold=false;
   clearRaceOverlayQueue();
   setRaceSessionFlag(false);
   // DNF never gives race money.
   game.fatigue=Math.min(100,game.fatigue+18+L[5]*3);
   game.lastFinishAt=Date.now();
   saveGame();
   const ov=$('finishOverlay');
   const coach=COACHES[game.coach]||COACHES[0];
   let dnfCoachAdvice='';
   if(game.coach===0){
     dnfCoachAdvice='<br><br>💡 Рекомендация: нанять тренера перед следующей попыткой.';
   }else if(coach.maxDifficulty<L[5]){
     const stronger=COACHES.findIndex((x,i)=>i>game.coach && x.maxDifficulty>=L[5]);
     if(stronger>=0) dnfCoachAdvice=`<br><br>💡 Рекомендация: сменить тренера на «${COACHES[stronger].name}» — текущий уровень подготовки ниже сложности гонки.`;
   }
   const virtualResult=finalizeVirtualRaceAfterPlayerDnf();
   const totalDnfs=Math.min(run.fieldSize,Math.max((run.liveDnfCount??run.otherDnfCount??0)+1,virtualResult.dnfs||0));
   const dnfStats=`<br><br>🚫 Сошло с дистанции: ${totalDnfs} из ${run.fieldSize}.`+virtualResultsHtml({...virtualResult,dnfs:totalDnfs});
   // При переломе игрока в плашке симуляции не перечисляем отдельные DNF.
   // Оставляем только общее число сходов по виртуально досчитанной гонке.
   if(dnfReason==='fracture'){
     const log=$('eventLog');
     if(log){
       log.querySelectorAll('.dnf-event-row').forEach(x=>x.remove());
       log.insertAdjacentHTML('afterbegin',`<div class="event-row dnf-total-row"><span>ИТОГ</span><b>🚫 DNF: ${totalDnfs}</b><span class="neutral">всего сходов из ${run.fieldSize}</span></div>`);
     }
   }
   if(dnfReason==='freeze'){
     ov.innerHTML=`<div class="overlay-box"><div class="emoji">🥶</div><b>DNF · переохлаждение</b><span>Вы замёрзли до финиша.<br><br>💰 За DNF награда: ₽ 0.${dnfStats}${dnfCoachAdvice}</span></div>`;
   }else if(dnfReason==='heat'){
     ov.innerHTML=`<div class="overlay-box"><div class="emoji">🥵</div><b>DNF · перегрев</b><span>Жара и нагрузка привели к сходу с дистанции.<br><br>💰 За DNF награда: ₽ 0.${dnfStats}${dnfCoachAdvice}</span></div>`;
   }else if(dnfReason==='weather'){
     ov.innerHTML=`<div class="overlay-box"><div class="emoji">🌪️</div><b>DNF · плохая погода</b><span>Тяжёлые погодные условия привели к сходу.<br><br>💰 За DNF награда: ₽ 0.${dnfStats}${dnfCoachAdvice}</span></div>`;
   }else if(dnfReason==='flood'){
     ov.innerHTML=`<div class="overlay-box"><div class="emoji">🌊</div><b>DNF · река разлилась</b><span>После ПП на 82 км переход оказался невозможен.<br><br>💰 За DNF награда: ₽ 0.${dnfStats}${dnfCoachAdvice}</span></div>`;
   }else{
     ov.innerHTML=`<div class="overlay-box"><div class="emoji">🦴</div><b>DNF · перелом ноги</b><span>Слишком высокая нагрузка и мало отдыха. Перелом ноги требует лечения в больнице 5 минут перед новой попыткой.<br><br>💰 За DNF награда: ₽ 0.${dnfStats}${dnfCoachAdvice}</span></div>`;
   }
   ov.classList.add('show');
   setTimeout(()=>{ov.classList.remove('show');render();switchTab('resources')},12000);
   return;
 }

 // durability after race
 let breaks=[];
 Object.keys(GEAR).forEach(cat=>{
  const before=durability(cat),loss=wearFor(cat,L),after=Math.max(0,before-loss);setDur(cat,after);
  if(before>0&&after<=0){
    breaks.push(CATEGORY_NAMES[cat]);
    if(Number(game.gear?.[cat]||0)>0 && Math.random()<0.20){
      const destroyed=Number(game.gear[cat]);
      if(Array.isArray(game.gearOwned?.[cat])) game.gearOwned[cat]=game.gearOwned[cat].filter(x=>Number(x)!==destroyed);
      game.gear[cat]=0;
      breaks[breaks.length-1]+=' (уничтожена, купить заново)';
    }
  }
 });
 saveGame();

 updateRealisticPosition();
 const final=Math.max(1,run.base+run.penalty);
 const ratio=L[3]/final;

 // Финальная позиция должна продолжать живую позицию на трассе.
 // Раньше здесь место пересчитывалось заново со случайностью, поэтому, например,
 // 23-е место на 50.0 км могло внезапно превратиться в 1-е в окне финиша.
 let pos=Math.max(1,Math.min(run.fieldSize||50,Math.round(Number(run.currentPosition||run.position||1))));
 run.currentPosition=pos;
 if($('position')) $('position').textContent=pos;

 // On victory, hold the player as #1 in the visible TOP-7 until the result closes.
 if(pos===1){
   run.finishWinnerHold=true;
   run.p=1;
   if($('position')) $('position').textContent='1';
   drawTrack(1);
   renderRaceLeaders(Number(L[1]||0));
 }

 const quality=Math.max(.45,Math.min(1.55,ratio));
 const repIncomeBonus=Math.min(0.30,Math.max(0,Number(game.rep||0))*0.001); // +1% per 10 rep, max +30%
 let reward=Math.round(L[4]*Math.max(.35,Math.min(1.55,.55+quality*.55))*(pos===1?1.35:pos<=3?1.18:1)*(1+repIncomeBonus));
 const xp=Math.round(35+L[5]*18+L[1]/8+(pos===1?45:pos<=3?25:0));

 game.money+=reward;addXp(xp);game.rep+=pos===1?8:pos<=3?5:pos<=10?2:1;
 if(pos===1 && !run.winCounted){
   game.wins=(game.wins||0)+1;
   run.winCounted=true;
 }
 ensureTraining();
 const coach=COACHES[game.coach]||COACHES[0];
 const finishBase=1.0 + L[5]*0.35 + Math.min(2.0,L[1]/180);
 const placeBonus=pos===1?1.2:pos<=3?0.7:pos<=10?0.3:0;
 const fitnessGain=Math.max(0.4,(finishBase+placeBonus)*coach.mult*(1-game.fitness/140));
 game.fitness=Math.min(Number(coach.fitnessCap||100),game.fitness+fitnessGain);
 const itraGain=Math.max(1,Math.round((ratio-.72)*22 + L[5]*1.4 + (pos===1?7:pos<=3?4:0)));
 game.itra=Math.min(950,Math.max(200,game.itra+itraGain));
 if(game.best[game.current]==null||final<game.best[game.current])game.best[game.current]=final;

 // Fatigue: long races and quick repeats accumulate it heavily.
 const sinceLast=Date.now()-(game.lastFinishAt||0);
 const repeatPenalty=(game.lastFinishAt && sinceLast<15*60*1000)?16:0;
 const raceFatigue=Math.min(48,7+L[5]*4+Math.sqrt(L[1])*1.5);
 game.fatigue=Math.min(100,game.fatigue+raceFatigue+repeatPenalty);
 game.lastFinishAt=Date.now();

 const firstClear=game.current===game.completed;
 if(firstClear)game.completed=Math.min(LEVELS.length,game.completed+1);
 if(game.current<LEVELS.length-1 && firstClear)game.current++;
 saveGame();

 const newRareAchievement=tryAwardLevelAchievement(game.current-(firstClear?1:0));
 const champ=game.completed>=LEVELS.length;
 const ov=$('finishOverlay');

 let coachAdvice='';
 const currentCoach=COACHES[game.coach]||COACHES[0];
 const poorRun=(pos>10 || final>L[3]*1.12 || ratio<0.90);

 if(poorRun){
   if(game.coach===0){
     coachAdvice='<br>💡 Тренер: наймите тренера — тренированность будет расти быстрее.';
   }else if(currentCoach.maxDifficulty<L[5]){
     const stronger=COACHES.findIndex((x,i)=>i>game.coach && x.maxDifficulty>=L[5]);
     coachAdvice=stronger>=0
       ? `<br>💡 Тренер: для этой гонки лучше «${COACHES[stronger].name}» (текущий до ${'★'.repeat(currentCoach.maxDifficulty)}).`
       : '<br>💡 Тренер: нужен более сильный тренер для этой сложности.';
   }else{
     coachAdvice='<br>💡 Тренер подходит. Продолжайте тренировки для роста тренированности.';
   }
 }

 const totalDnfs=Math.min(run.fieldSize,run.liveDnfCount??run.otherDnfCount??0);
 logFinishTop3ToRaceEvents(pos,final);
 const top3Finish=finishTop3Html(pos,final);
 ov.innerHTML=`<div class="overlay-box"><div class="emoji">${champ?'👑🏆':'🏁'}</div><b>${champ?'ТЫ ЧЕМПИОН АРМАГЕДДОНА!':`Финиш · ${pos} место`}</b><span>Время ${fmt(final)} · заработано ${fmtMoney(reward)} · +${xp} XP<br>🚫 Сошло с дистанции: ${totalDnfs} из ${run.fieldSize}<br>Тренированность: ${Math.round(game.fitness)}/100<br>Усталость: ${Math.round(game.fatigue)}%${breaks.length?`<br>Сломалось: ${breaks.join(', ')}`:''}${newRareAchievement?'<br>🏆 Получена редкая ачивка уровня!':''}${coachAdvice}${top3Finish}</span></div>`;
 ov.classList.add('show');
 setTimeout(()=>{
   ov.classList.remove('show');
   if(run){
     run.running=false;
     run.finishHold=false;
     run.finishWinnerHold=false;
     run.p=0;
   }
   setRaceSessionFlag(false);
   render();
 }, 5000);
}
function startRace(){
  // A previous DNF/finish may still have real-time overlay timers pending.
  // Invalidate them before any new start/navigation so old race cards can never reappear at 0.0 km.
  try{ if(typeof clearRaceOverlayQueue==='function') clearRaceOverlayQueue(); }catch(e){}
  const gameSnapshot=JSON.parse(JSON.stringify(game));

  function makeFullyMutableState(src){
    // После ручного обновления iOS-браузер иногда возвращает вложенные части
    // сохранения как объекты с non-writable дескрипторами. Пересобираем ВСЕ
    // изменяемые ветки и массивы в обычные JS-объекты перед новым стартом.
    const g=JSON.parse(JSON.stringify(src||{}));
    g.resources={...(g.resources||{})};
    g.gear={...(g.gear||{})};
    g.durability={...(g.durability||{})};
    g.best={...(g.best||{})};
    g.raceSlotsPurchased={...(g.raceSlotsPurchased||{})};
    g.gearOwned={...(g.gearOwned||{})};
    g.achievements={...(g.achievements||{})};
    g.preStartLeadersByRace={...(g.preStartLeadersByRace||{})};
    g.coachOwned=Array.isArray(g.coachOwned)?[...g.coachOwned]:[0];
    return g;
  }

  function doStart(){
    game=makeFullyMutableState(game);
    clearTransientRaceUi(); // после reload старая незавершённая симуляция не продолжается
    ensureResources();
    return startRaceCore();
  }

  try{
    return doStart();
  }catch(e){
    const msg=String(e?.message||e||'');

    // Специальный hotfix для сценария: гонка шла -> ручной reload -> новый Старт.
    // Если браузер один раз дал "Attempted to assign to readonly property",
    // откатываем все списания первой попытки и запускаем старт ещё раз из
    // полностью нового mutable-состояния.
    if(/readonly|read-only|non-writable/i.test(msg)){
      try{
        game=makeFullyMutableState(gameSnapshot);
        run=null;
        timer=null;
        lastTs=0;
        setRaceSessionFlag(false);
        saveGame();
        return doStart();
      }catch(retryError){
        e=retryError;
      }
    }

    // Старт — транзакция: при любой JS-ошибке возвращаем состояние до нажатия.
    game=makeFullyMutableState(gameSnapshot);
    run=null;
    timer=null;
    lastTs=0;
    setRaceSessionFlag(false);
    try{ saveGame(); render(); updateRestUi(); renderTraining(); }catch(_restoreError){}
    showGameError(`Ошибка старта: ${String(e?.message||e)}`);
    return false;
  }
}

$('buyRaceSlotBtn')?.addEventListener('click',buyRaceSlot);

// Плашка «Нужен слот на гонку» тоже является кнопкой покупки.
$('startRequirementsError')?.addEventListener('click',()=>{
  const el=$('startRequirementsError');
  if(!el || hasRaceSlot()) return;
  if(/Нужен слот на гонку/i.test(el.textContent||'')) buyRaceSlot();
});
const quickRestBtn=$('quickRestBtn');
if(quickRestBtn){
  quickRestBtn.addEventListener('click',()=>{$('restBtn')?.click();});
  const syncQuickRest=()=>{
    const blocked=!!(run&&run.running) || isResting() || trainingActive() || isInHospital() || needsHospitalTreatment() || Number(game.fatigue||0)<=0;
    quickRestBtn.disabled=blocked;
    quickRestBtn.textContent=isInHospital()?'🏥 Лечение':isResting()?'😴 Отдых…':'😴 Отдых';
  };
  setInterval(syncQuickRest,1000);
  syncQuickRest();
}
const quickTreatBtn=$('quickTreatBtn');
if(quickTreatBtn){
  quickTreatBtn.addEventListener('click',()=>{
    if(run&&run.running){showGameError('Во время гонки лечение недоступно.');return;}
    if(isInHospital()){showGameError(`Лечение уже идёт. Осталось ${fmtRest(hospitalRemainingMs())}.`);return;}
    if(!needsHospitalTreatment()){showGameError('Лечение не требуется: перелома нет.');return;}
    $('hospitalBtn')?.click();
  });
  const syncQuickTreat=()=>{
    const inHospital=isInHospital();
    quickTreatBtn.disabled=!!(run&&run.running) || trainingActive() || isResting() || (!inHospital && !needsHospitalTreatment());
    quickTreatBtn.textContent=inHospital?`🏥 ${fmtRest(hospitalRemainingMs())}`:'🏥 Лечение';
  };
  setInterval(syncQuickTreat,1000);
  syncQuickTreat();
}
$('startBtn').onclick=()=>{
  // Без слота старт не запускаем: отдельная кнопка покупки находится рядом в блоке слота.
  if(!hasRaceSlot()){
    renderRaceSlot();
    showGameError('Сначала купите слот на эту гонку.');
    return;
  }
  if(isInHospital() || needsHospitalTreatment()){
    const nav=document.querySelector('.trail3d-bottom-nav button[data-target="restSection"]');
    if(nav) nav.click();
    setTimeout(()=>{
      const hospital=document.getElementById('hospitalCard') || document.getElementById('restSection');
      if(hospital) hospital.scrollIntoView({behavior:'smooth',block:'start'});
    },120);
    return;
  }
  try{
    startRace();
  }catch(e){
    console.error('Race start error',e);
    showStartRequirementsError(
      'Ошибка запуска гонки',
      [String(e?.message||e||'Неизвестная ошибка')]
    );
  }
};

function updateRaceGuaranaButton(){
 const b=$('raceGuaranaBtn');const g=$('raceGelStatus');
 const active=!!(run&&run.running);
 const qty=Number(game.resources.guarana||0);
 if(b){
   b.style.display='inline-flex';
   const maxUses=run?Number(run.guaranaMaxUses||(Number(levelData()[1]||0)>=500?4:(Number(levelData()[1]||0)>100?2:1))):(Number(levelData()[1]||0)>=500?4:(Number(levelData()[1]||0)>100?2:1));
   const uses=run?Number(run.guaranaUses||0):0;
   const raceKm=run?Number(run.p||0)*Number(levelData()[1]||0):0;
   const effectPending=!!(run&&(
     (Number(run.guaranaTriggerKm||0)>0 && !run.guaranaCrashChecked && raceKm<Number(run.guaranaTriggerKm||0)+20) ||
     run.guaranaCrash ||
     (Number(run.guaranaTriggerKm||0)>0 && raceKm<Number(run.guaranaTriggerKm||0)+50)
   ));
   const limitReached=uses>=maxUses;
   b.disabled=active&&(qty<=0||limitReached||effectPending);

   if(active){
     if(limitReached)b.textContent=`🫘 Гуарана: лимит ${uses}/${maxUses}`;
     else if(effectPending)b.textContent=`🫘 Гуарана: эффект активен · ${uses}/${maxUses}`;
     else if(qty>0)b.textContent=`🫘 Использовать гуарану (${qty}) · ${uses}/${maxUses}`;
     else b.textContent='🫘 Гуарана: 0 · нет в гонке';
   }else{
     b.textContent=qty>0
       ?`🫘 Гуарана (${qty}) · ${Number(levelData()[1]||0)>=500?'до 4 раз':(Number(levelData()[1]||0)>100?'до 2 раз':'1 раз')}`
       :'🫘 Гуарана: 0 · купить в расходниках';
   }
 }
 if(g){
   g.style.display=active?'inline-flex':'none';
   if(active)g.textContent=`🍯 Гели в гонке: ${Number(run.gelsRemaining||0)} / ${Number(run.gelsStart||0)}`;
 }
}

$('raceGuaranaBtn')?.addEventListener('click',()=>{
 const qty=Number(game.resources.guarana||0);
 const active=!!(run&&run.running);
 // Вне гонки клик по гуаране всегда открывает «Расходники» и акцентирует карточку гуараны,
 // даже если гуарана уже есть в запасе.
 if(!active){
   const nav=document.querySelector('#bottomNav button[data-target="resources"], .trail3d-bottom-nav button[data-target="resources"]');
   if(nav) nav.click();
   else if(typeof switchTab==='function') switchTab('resources');
   const focusGuarana=()=>{
     const resources=document.getElementById('resources');
     if(resources){ resources.open=true; resources.style.display=''; }
     const buy=document.querySelector('#resources [data-resource-buy="guarana"]');
     const card=buy && (buy.closest('.shop-item,.gear-item,.resource-item,.card') || buy);
     if(card){
       card.scrollIntoView({behavior:'smooth',block:'center'});
       card.classList.add('guarana-nav-focus');
       setTimeout(()=>card.classList.remove('guarana-nav-focus'),2200);
     }else if(resources){
       resources.scrollIntoView({behavior:'smooth',block:'start'});
     }
   };
   setTimeout(focusGuarana,120);
   setTimeout(focusGuarana,420);
   return;
 }
 if(!run||!run.running)return;

 const maxUses=Number(run.guaranaMaxUses||(Number(levelData()[1]||0)>=500?4:(Number(levelData()[1]||0)>100?2:1)));
 const uses=Number(run.guaranaUses||0);
 if(uses>=maxUses)return;
 if(qty<=0){
   showGameError('Гуарана закончилась. Во время гонки докупка недоступна.');
   return;
 }

 const raceKm=Number(run.p||0)*Number(levelData()[1]||0);
 const effectPending=(
   (Number(run.guaranaTriggerKm||0)>0 && !run.guaranaCrashChecked && raceKm<Number(run.guaranaTriggerKm||0)+20) ||
   run.guaranaCrash ||
   (Number(run.guaranaTriggerKm||0)>0 && raceKm<Number(run.guaranaTriggerKm||0)+50)
 );
 if(effectPending){
   showGameError('Сначала должен закончиться текущий буст на 20 км и возможный откат гуараны.');
   return;
 }

 useResource('guarana',1,'event');
 run.guaranaTaken=true;
 run.guaranaTriggered=true;
 run.guaranaUses=uses+1;

 const km=raceKm;
 if(Math.random()<0.60){
   run.guaranaBoostUntil=0;
   run.guaranaTriggerKm=km;
   run.guaranaCrash=false;
   run.guaranaCrashChecked=false;
   run.guaranaCrashEndKm=0;
   showEvent({emoji:'🫘',name:'Гуарана сработала'},-60,` · буст на 20 км · ${run.guaranaUses}/${maxUses}`);
 }else{
   run.guaranaBoostUntil=0;
   run.guaranaTriggerKm=0;
   run.guaranaCrash=false;
   run.guaranaCrashChecked=false;
   run.guaranaCrashEndKm=0;
   showEvent({emoji:'🫘',name:'Гуарана не сработала'},0,` · буста нет · ${run.guaranaUses}/${maxUses}`);
 }
 saveGame();
 updateRaceGuaranaButton();
});
$('resetGameBtn').onclick=()=>{if(confirm('Сбросить весь прогресс, деньги и экипировку?')){localStorage.removeItem('trailArmageddonSave');game=loadGame();render()}};

function drawSnailBase(ctx,x,y,scale=1,opts={}){
 const bodyColor=opts.bodyColor||'#f5d0a6';
 const shellColor=opts.shellColor||'#ef4444';
 const shellStroke=opts.shellStroke||'rgba(15,23,42,.75)';
 const eyeColor=opts.eyeColor||'#07111f';
 const shellSpiral=opts.shellSpiral||'rgba(255,245,230,.68)';
 const showBadge=Number(opts.rank||0)>0;
 const badgeRank=Number(opts.rank||0)||0;
 const showTrailDots=!!opts.trailDots;

 ctx.save();
 ctx.translate(x,y);
 ctx.scale(scale,scale);
 ctx.lineCap='round';
 ctx.lineJoin='round';

 // Ground shadow.
 ctx.fillStyle='rgba(0,0,0,.24)';
 ctx.beginPath();
 ctx.ellipse(2,15,21,5,0,0,Math.PI*2);
 ctx.fill();

 // Body.
 ctx.fillStyle=bodyColor;
 ctx.beginPath();
 ctx.moveTo(-28,13);
 ctx.quadraticCurveTo(-18,2,-5,2);
 ctx.quadraticCurveTo(9,1,19,-2);
 ctx.quadraticCurveTo(31,-6,35,0);
 ctx.quadraticCurveTo(39,6,31,11);
 ctx.quadraticCurveTo(18,18,-3,17);
 ctx.quadraticCurveTo(-18,17,-28,13);
 ctx.closePath();
 ctx.fill();

 // Belly line.
 ctx.strokeStyle='rgba(255,255,255,.32)';
 ctx.lineWidth=1.7;
 ctx.beginPath();
 ctx.moveTo(-18,13);
 ctx.quadraticCurveTo(4,16,27,11);
 ctx.stroke();

 // Shell.
 ctx.fillStyle=shellColor;
 ctx.strokeStyle=shellStroke;
 ctx.lineWidth=2.2;
 ctx.beginPath();
 ctx.arc(-8,-3,15,0,Math.PI*2);
 ctx.fill();
 ctx.stroke();

 // Shell spiral.
 ctx.strokeStyle=shellSpiral;
 ctx.lineWidth=2.2;
 ctx.beginPath();
 ctx.arc(-8,-3,8,0.15*Math.PI,2.1*Math.PI);
 ctx.stroke();
 ctx.beginPath();
 ctx.arc(-8,-3,3.7,0,2*Math.PI);
 ctx.stroke();

 // Head.
 ctx.fillStyle=bodyColor;
 ctx.beginPath();
 ctx.ellipse(28,2,9,7,0,0,Math.PI*2);
 ctx.fill();

 // Eye stalks.
 ctx.strokeStyle=bodyColor;
 ctx.lineWidth=3.2;
 ctx.beginPath();
 ctx.moveTo(27,-1); ctx.lineTo(31,-13);
 ctx.moveTo(33,0); ctx.lineTo(40,-11);
 ctx.stroke();

 ctx.fillStyle='#ffffff';
 ctx.beginPath(); ctx.arc(31,-13,2.9,0,Math.PI*2); ctx.fill();
 ctx.beginPath(); ctx.arc(40,-11,2.9,0,Math.PI*2); ctx.fill();
 ctx.fillStyle=eyeColor;
 ctx.beginPath(); ctx.arc(31,-13,1.3,0,Math.PI*2); ctx.fill();
 ctx.beginPath(); ctx.arc(40,-11,1.3,0,Math.PI*2); ctx.fill();

 // Cheerful mouth.
 ctx.strokeStyle='rgba(7,17,31,.65)';
 ctx.lineWidth=1.6;
 ctx.beginPath();
 ctx.arc(27,5,3.4,0.15*Math.PI,0.85*Math.PI);
 ctx.stroke();

 if(showTrailDots){
   ctx.fillStyle='rgba(255,255,255,.4)';
   [[-34,15],[-40,14],[-46,15]].forEach(function(pt){
     ctx.beginPath();ctx.arc(pt[0],pt[1],1.3,0,Math.PI*2);ctx.fill();
   });
 }

 if(showBadge){
   const badgeColor=badgeRank===1?'#fbbf24':badgeRank===2?'#cbd5e1':'#d97706';
   ctx.fillStyle=badgeColor;
   ctx.beginPath();
   ctx.arc(18,-22,8.5,0,Math.PI*2);
   ctx.fill();
   ctx.fillStyle='#07111f';
   ctx.font='bold 10px sans-serif';
   ctx.textAlign='center';
   ctx.textBaseline='middle';
   ctx.fillText(String(badgeRank),18,-22);
 }

 ctx.restore();
}
function drawRunnerFacingForward(ctx,x,y,scale=1){
 drawSnailBase(ctx,x,y,scale,{
   bodyColor:'#f5cfaa',
   shellColor:'#dc2626',
   shellStroke:'rgba(127,29,29,.95)',
   shellSpiral:'rgba(255,230,230,.72)',
   trailDots:true
 });
}
function drawOpponent(ctx,x,y,scale=1,color='#60a5fa',rank=0){
 drawSnailBase(ctx,x,y,scale,{
   bodyColor:'#ead8ba',
   shellColor:color,
   shellStroke:'rgba(15,23,42,.85)',
   shellSpiral:'rgba(226,232,240,.6)',
   rank:rank
 });
}
function drawTrack(p){
 const c=$('trackCanvas'),ctx=c.getContext('2d'),W=c.width,H=c.height,L=levelData();
 ctx.clearRect(0,0,W,H);
 const isChara=String(L[0]||'').toLowerCase().includes('чара');
 if(isChara && window.CHARA_BG_IMG && window.CHARA_BG_IMG.complete && window.CHARA_BG_IMG.naturalWidth){ ctx.drawImage(window.CHARA_BG_IMG,0,0,W,H); }
 const sky=ctx.createLinearGradient(0,0,0,H);
 if(isChara){sky.addColorStop(0,'rgba(0,0,0,0)');sky.addColorStop(1,'rgba(0,0,0,0)');}
 else {sky.addColorStop(0,'#153554');sky.addColorStop(.62,'#8b5a24');sky.addColorStop(1,'#503a2d');}
 ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);

 if(isChara && !(window.CHARA_BG_IMG && window.CHARA_BG_IMG.complete && window.CHARA_BG_IMG.naturalWidth)){
   // Snow-covered Kodar-like mountains in the distance.
   ctx.fillStyle='#71869a';ctx.beginPath();ctx.moveTo(0,H*.58);
   const peaks=[[0,.55],[.12,.29],[.22,.52],[.36,.23],[.49,.50],[.63,.26],[.76,.53],[.9,.31],[1,.56]];
   peaks.forEach(([px,py])=>ctx.lineTo(px*W,py*H));ctx.lineTo(W,H*.66);ctx.lineTo(0,H*.66);ctx.fill();
   ctx.fillStyle='#f4f8fb';
   [[.12,.29],[.36,.23],[.63,.26],[.9,.31]].forEach(([px,py])=>{const x=px*W,y=py*H;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-38,y+48);ctx.lineTo(x-10,y+39);ctx.lineTo(x,y+53);ctx.lineTo(x+14,y+35);ctx.lineTo(x+42,y+50);ctx.closePath();ctx.fill();});
   // Chara: dramatic rain clouds with a warm break of sunlight.
   ctx.save();
   const cloud=ctx.createLinearGradient(0,0,0,H*.38);cloud.addColorStop(0,'rgba(25,38,52,.78)');cloud.addColorStop(1,'rgba(70,82,92,.16)');ctx.fillStyle=cloud;
   for(let i=0;i<8;i++){const cx=(i*.15-.04)*W,cy=H*(.08+.035*(i%3));ctx.beginPath();ctx.ellipse(cx,cy,W*.15,H*.08,0,0,Math.PI*2);ctx.fill();}
   const glow=ctx.createRadialGradient(W*.82,H*.16,4,W*.82,H*.16,W*.28);glow.addColorStop(0,'rgba(255,240,177,.85)');glow.addColorStop(.35,'rgba(255,210,120,.28)');glow.addColorStop(1,'rgba(255,220,150,0)');ctx.fillStyle=glow;ctx.fillRect(W*.48,0,W*.52,H*.55);
   ctx.fillStyle='rgba(255,232,170,.13)';for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(W*(.74+i*.035),H*.12);ctx.lineTo(W*(.58+i*.06),H*.62);ctx.lineTo(W*(.64+i*.06),H*.62);ctx.closePath();ctx.fill();}
   ctx.restore();

   // Chara sand dunes in foreground.
   const sand=ctx.createLinearGradient(0,H*.55,0,H);sand.addColorStop(0,'#e6b85f');sand.addColorStop(.48,'#c98a37');sand.addColorStop(1,'#875022');ctx.fillStyle=sand;
   ctx.beginPath();ctx.moveTo(0,H*.70);for(let i=0;i<=12;i++){const x=i*W/12;const y=H*(.69-.09*Math.sin(i*.95)-.025*Math.sin(i*2.2));ctx.lineTo(x,y);}ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();

   // Scattered marshes and shallow fords among the dunes.
   ctx.save();ctx.globalAlpha=.9;
   ctx.fillStyle='#315d43';[[.12,.79,.10,.028],[.43,.86,.13,.032],[.76,.80,.11,.03]].forEach(([x,y,rx,ry])=>{ctx.beginPath();ctx.ellipse(x*W,y*H,rx*W,ry*H,0,0,Math.PI*2);ctx.fill();});
   const water=ctx.createLinearGradient(0,H*.72,0,H*.94);water.addColorStop(0,'#7bc7d5');water.addColorStop(1,'#315f78');ctx.fillStyle=water;
   ctx.beginPath();ctx.moveTo(W*.24,H*.76);ctx.bezierCurveTo(W*.34,H*.83,W*.40,H*.73,W*.49,H*.80);ctx.bezierCurveTo(W*.57,H*.87,W*.64,H*.76,W*.73,H*.83);ctx.lineTo(W*.72,H*.875);ctx.bezierCurveTo(W*.64,H*.82,W*.57,H*.93,W*.48,H*.86);ctx.bezierCurveTo(W*.40,H*.79,W*.33,H*.89,W*.23,H*.81);ctx.closePath();ctx.fill();
   ctx.strokeStyle='rgba(235,250,255,.78)';ctx.lineWidth=2;ctx.stroke();ctx.restore();

   // Rain streaks: visible but light enough to keep dunes and snowy peaks readable.
   ctx.save();ctx.strokeStyle='rgba(210,235,248,.42)';ctx.lineWidth=1.4;for(let i=0;i<42;i++){const rx=(i*83%997)/997*W,ry=((i*137)%701)/701*H*.72;ctx.beginPath();ctx.moveTo(rx,ry);ctx.lineTo(rx-7,ry+17);ctx.stroke();}ctx.restore();
 }
 if(!isChara){
   ctx.fillStyle='#0c2130';ctx.beginPath();ctx.moveTo(0,H*.72);
   for(let i=0;i<=8;i++)ctx.lineTo(i*W/8,H*(.58+(i%2)*.08));ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.fill();
 }

 const base=H*.55,amp=Math.min(H*.28,60+L[5]*25);
 ctx.beginPath();
 for(let i=0;i<=100;i++){
  const xx=i/100*W;
  const yy=base-Math.sin(i/100*Math.PI*(2+L[5]))*amp*.45-Math.sin(i/100*Math.PI*6)*amp*.18;
  i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy);
 }
 ctx.strokeStyle='#22c55e';ctx.lineWidth=8;ctx.stroke();

 const pos=run?.currentPosition||run?.position||18;
 const playerKm=p*L[1];
 const x=65+p*(W-160),ground=H*.82;

 // Calculate TOP-3 first. Every object on the map uses the same km -> x scale.
 const leaderKms=[1,2,3].map(rank=>leaderKmFor(rank,L,playerKm));
 const leaderColors=['#fbbf24','#cbd5e1','#d97706'];
 const leaderXs=leaderKms.map(km=>65+(km/L[1])*(W-160));

 // Пункты питания (ПП) показываем на карте и ДО старта, если они есть на дистанции.
 // Для Чары это фиксированные 27/54/82/109 км; для других длинных гонок
 // превью запоминается, чтобы метки не прыгали при перерисовке.
 const distForPP=Number(L[1]||0);
 window.__aidPreviewCache=window.__aidPreviewCache||{};
 const ppKey=String(L[0]||'')+'|'+distForPP;
 if(!run && !Array.isArray(window.__aidPreviewCache[ppKey])){
   window.__aidPreviewCache[ppKey]=buildAidStations(distForPP);
 }
 const ppList=(run && Array.isArray(run.aidStations)) ? run.aidStations : (window.__aidPreviewCache[ppKey]||[]);
 if(Array.isArray(ppList) && ppList.length){
   const passed=(run && run.aidStationsPassed instanceof Set) ? run.aidStationsPassed : new Set();
   ppList.forEach((ppKm,idx)=>{
     const ppX=65+(Number(ppKm)/Number(L[1]))*(W-160);
     const ppY=H*.61 + (idx%2)*34;
     const isPassed=passed.has(String(ppKm));

     // Вертикальный ориентир до линии трассы.
     ctx.save();
     ctx.setLineDash([5,5]);
     ctx.strokeStyle=isPassed?'rgba(74,222,128,.45)':'rgba(255,255,255,.42)';
     ctx.lineWidth=2;
     ctx.beginPath();
     ctx.moveTo(ppX,ppY+28);
     ctx.lineTo(ppX,H*.72);
     ctx.stroke();
     ctx.restore();

     // Компактная плашка ПП.
     const pw=104,ph=42;
     const bx=Math.max(5,Math.min(W-pw-5,ppX-pw/2));
     const by=ppY-22;
     ctx.fillStyle=isPassed?'rgba(6,55,35,.94)':'rgba(8,26,42,.95)';
     ctx.beginPath();ctx.roundRect(bx,by,pw,ph,10);ctx.fill();
     ctx.strokeStyle=isPassed?'rgba(74,222,128,.8)':'rgba(56,189,248,.72)';
     ctx.lineWidth=2;ctx.stroke();

     ctx.textAlign='center';
     ctx.fillStyle=isPassed?'#86efac':'#e0f2fe';
     ctx.font='bold 14px sans-serif';
     ctx.fillText(isPassed?'✓ ПП':'🥤 ПП',bx+pw/2,by+17);
     ctx.font='12px sans-serif';
     ctx.fillText(`${Number(ppKm).toFixed(0)} км`,bx+pw/2,by+34);
   });
 }


 // Compact live TOP-7 leaderboard on the race image.
 // Kept deliberately small so it does not hide the route/background.
 if(run){
   const liveRows=dynamicLeaderRows(L).slice(0,7);
   if(liveRows.length){
     const panelW=Math.min(340,W-24);
     const rowH=23;
     const headH=31;
     const panelH=headH+liveRows.length*rowH+9;
     const px=(W-panelW)/2;
     const py=10;

     ctx.save();
     ctx.fillStyle='rgba(4,13,25,.78)';
     ctx.beginPath();ctx.roundRect(px,py,panelW,panelH,10);ctx.fill();
     ctx.strokeStyle='rgba(125,211,252,.48)';
     ctx.lineWidth=1.5;ctx.stroke();

     ctx.textBaseline='middle';
     ctx.textAlign='left';
     ctx.fillStyle='#bae6fd';
     ctx.font='bold 15px sans-serif';
     ctx.fillText('🏆 ТОП-7',px+12,py+16);

     liveRows.forEach((r,i)=>{
       const y=py+headH+i*rowH+rowH/2;
       const name=String(r?.c?.name||'Участник');
       const shortName=name.length>25?name.slice(0,24)+'…':name;
       ctx.fillStyle=i<3?'#fde68a':'#e2e8f0';
       ctx.font=(i<3?'bold ':'')+'13px sans-serif';
       ctx.fillText(`${i+1}. ${shortName}`,px+12,y);

       ctx.textAlign='right';
       ctx.fillStyle='#93c5fd';
       ctx.font='12px sans-serif';
       ctx.fillText(`${Number(r.liveKm||0).toFixed(1)} км`,px+panelW-12,y);
       ctx.textAlign='left';
     });
     ctx.restore();
   }
 }

 // Main pack stays visible for the whole race. Previously it was tied to
 // pos>6, so it disappeared/reappeared whenever the player crossed 6th place.
 // Keep drawing it while a race state exists; its km is still recalculated live.
 if(run){
   // Main pack is kept behind the player so it does not cover the player icon.
   // Its gap varies slightly with current position, but it never jumps ahead.
   const behindGapKm=Math.max(L[1]*.006, Math.min(L[1]*.025, 0.18 + Math.max(0,pos-6)*L[1]*.00035));
   let groupKm=Math.max(0, playerKm-behindGapKm);

   const gx=65+(groupKm/L[1])*(W-160);
   const gy=ground-18;
   const packColors=['#60a5fa','#34d399','#f59e0b','#a78bfa','#fb7185','#22d3ee'];
   const packOffsets=[[0,0],[34,-4],[68,1],[16,32],[50,29],[84,34]];

   for(let i=0;i<6;i++){
     drawOpponent(ctx,gx+packOffsets[i][0],gy+packOffsets[i][1],.82,packColors[i],0);
   }

   const pw=145,ph=50;
   const px=Math.max(8,Math.min(W-pw-8,gx-10));
   const py=gy-86,r=12;
   ctx.fillStyle='rgba(5,15,28,.93)';
   ctx.beginPath();ctx.roundRect(px,py,pw,ph,r);ctx.fill();
   ctx.strokeStyle='rgba(96,165,250,.55)';ctx.lineWidth=2;ctx.stroke();
   ctx.fillStyle='#dbeafe';ctx.font='bold 16px sans-serif';ctx.textAlign='left';
   ctx.fillText('👥 ГРУППА',px+13,py+20);
   ctx.fillStyle='#93c5fd';ctx.font='13px sans-serif';
   ctx.fillText(`места 6–${Math.max(10,pos-1)}`,px+13,py+40);
 }

 // TOP-3 icons follow actual virtual kilometres.
 // Keep leaders visible for the whole race, even when the player is 1st.
 if(run){
   const ly=ground-70;
   for(let i=0;i<3;i++){
     drawOpponent(ctx,leaderXs[i],ly+i* Number((run&&run.raceDistance)||L[1]||5),.96,leaderColors[i],i+1);
   }

   const leadKm=leaderKms[0];
   const lw=164,lh=52;
   const lxBox=Math.max(8,Math.min(W-lw-8,leaderXs[0]-14));
   const lyBox=ly-92,r=12;
   ctx.fillStyle='rgba(22,15,5,.95)';
   ctx.beginPath();ctx.roundRect(lxBox,lyBox,lw,lh,r);ctx.fill();
   ctx.strokeStyle='rgba(251,191,36,.7)';ctx.lineWidth=2;ctx.stroke();
   ctx.fillStyle='#fde68a';ctx.font='bold 15px sans-serif';ctx.textAlign='left';
   ctx.fillText('🏆 ЛИДЕРЫ 1–3',lxBox+12,lyBox+20);
   ctx.fillStyle='#fef3c7';ctx.font='13px sans-serif';
   ctx.fillText(`${leadKm.toFixed(1)} км`,lxBox+12,lyBox+41);
 }

 drawRunnerFacingForward(ctx,x,ground,1.15);
 ctx.fillStyle='#fff';ctx.font='22px sans-serif';
 ctx.fillText(`${playerKm.toFixed(1)} км`,Math.max(10,x-35),ground+48);
}


function quickBuyWater(){
 if(purchasesLockedDuringRace()){ showGameError('Во время гонки покупки недоступны'); return; }
 const L=levelData();
 const weather=weatherForLevel();
 const need=waterBottlesNeeded(L,weather);
 const missing=Math.max(0,need-Number(game.resources.waterBottles||0));
 if(missing<=0){
   // Не показываем красную ошибку, если воды уже хватает: это штатное состояние.
   const el=$('gameErrorToast');
   if(el){ el.textContent='💧 Воды достаточно для этой гонки'; el.classList.add('show'); clearTimeout(window.__gameErrorTimer); window.__gameErrorTimer=setTimeout(()=>el.classList.remove('show'),2500); }
   return;
 }
 const cost=missing*RESOURCE_CATALOG.waterBottles.price;
 if(game.money<cost){ showGameError(`Не хватает рублей: нужно ${fmtMoney(cost)}`); return; }
 game.money-=cost;
 game.resources.waterBottles=Number(game.resources.waterBottles||0)+missing;
 const req=$('startRequirementsError');
 if(req && /Перед стартом обратите внимание|Риски перед стартом|воды|гелей/i.test(req.textContent||'')){
   req.innerHTML=''; req.style.display='none';
 }
 saveGame(); render();
}

function quickBuyGels(){
 if(purchasesLockedDuringRace()){ showGameError('Во время гонки покупки недоступны'); return; }
 const need=gelsNeeded(levelData());
 const missing=Math.max(0,need-Number(game.resources.gels||0));
 if(missing<=0){ showGameError('Гелей уже достаточно для этой гонки'); return; }
 const cost=missing*RESOURCE_CATALOG.gels.price;
 if(game.money<cost){ showGameError(`Не хватает рублей: нужно ${fmtMoney(cost)}`); return; }
 game.money-=cost;
 game.resources.gels=Number(game.resources.gels||0)+missing;
 const req=$('startRequirementsError');
 if(req && /Перед стартом обратите внимание|Риски перед стартом|воды|гелей/i.test(req.textContent||'')){
   req.innerHTML=''; req.style.display='none';
 }
 saveGame(); render();
}


function quickBuyLampPower(){
 if(purchasesLockedDuringRace()){ showGameError('Во время гонки покупки недоступны'); return; }
 // Карточка питания фонаря теперь всегда ведёт в «Расходники», даже если
 // текущего запаса уже достаточно. Там игрок сам видит батарейки/powerbank
 // и при необходимости покупает нужное.
 const navBtn=document.querySelector('#bottomNav button[data-target="resources"]');
 if(navBtn) navBtn.click(); else if(typeof switchTab==='function') switchTab('resources');
 setTimeout(()=>{
   const resources=document.getElementById('resources');
   if(resources){ resources.open=true; resources.style.display=''; }
   const key=isRechargeableLamp()?'powerbank':'batteries';
   const buy=document.querySelector(`[data-resource-buy="${key}"]`);
   const card=buy && (buy.closest('.shop-item,.gear-item,.resource-item,.card') || buy);
   if(card) card.scrollIntoView({behavior:'smooth',block:'center'});
   else if(resources) resources.scrollIntoView({behavior:'smooth',block:'start'});
 },140);
}
function quickBuyMedkit(){
 if(purchasesLockedDuringRace()){ showGameError('Во время гонки покупки недоступны'); return; }
 const keys=['bandage','gauze','peroxide','plaster','cream','sunCream','rescueBlanket'];
 const missing=keys.filter(k=>Number(game.resources[k]||0)<=0);
 if(!missing.length){ showGameError('Компоненты для одного комплекта аптечки уже собраны'); return; }
 const cost=missing.reduce((sum,k)=>sum+RESOURCE_CATALOG[k].price,0);
 if(game.money<cost){ showGameError(`Не хватает рублей: нужно ${fmtMoney(cost)}`); return; }
 game.money-=cost;
 missing.forEach(k=>game.resources[k]=Number(game.resources[k]||0)+1);
 saveGame(); render();
}

function bindQuickBuyCard(id,fn){
 const el=$(id); if(!el || el.dataset.quickBuyBound==='1') return;
 el.dataset.quickBuyBound='1';
 el.addEventListener('click',fn);
 el.addEventListener('keydown',e=>{
   if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fn(); }
 });
}
const openCampaignFromRaceBtn=$('openCampaignFromRaceBtn');
if(openCampaignFromRaceBtn && openCampaignFromRaceBtn.dataset.bound!=='1'){
 openCampaignFromRaceBtn.dataset.bound='1';
 openCampaignFromRaceBtn.addEventListener('click',()=>{
   if(run&&run.running){ showGameError('Сначала завершите текущую гонку'); return; }
   const navBtn=document.querySelector('#bottomNav button[data-target="levels"]');
   if(navBtn) navBtn.click(); else switchTab('levels');
   setTimeout(()=>{
     const levels=document.getElementById('levels');
     if(levels){ levels.open=true; levels.scrollIntoView({behavior:'smooth',block:'start'}); }
   },100);
 });
}
const jumpLastUnplayedBtn=$('jumpToLastUnplayedBtn');
if(jumpLastUnplayedBtn && jumpLastUnplayedBtn.dataset.bound!=='1'){
 jumpLastUnplayedBtn.dataset.bound='1';
 jumpLastUnplayedBtn.addEventListener('click',()=>{
   if(run&&run.running){ showGameError('Сначала завершите текущую гонку'); return; }
   const target=Math.max(0,Math.min(LEVELS.length-1,Number(game.completed||0)));
   if(Number(game.completed||0)>=LEVELS.length){ showGameError('Все уровни уже пройдены'); return; }
   game.current=target;
   saveGame();
   render();
   switchTab('race');
   // После перехода к первому непройденному уровню сразу поднимаем
   // экран симуляции максимально вверх, чтобы новый уровень был виден целиком.
   const scrollSimulationTop=()=>{
     const sim=document.querySelector('#race .sim-card');
     const topbar=document.querySelector('.topbar');
     if(!sim) return;
     const topOffset=(topbar?topbar.getBoundingClientRect().height:0)+4;
     const y=Math.max(0,sim.getBoundingClientRect().top+window.scrollY-topOffset);
     window.scrollTo({top:y,behavior:'smooth'});
   };
   setTimeout(scrollSimulationTop,80);
   setTimeout(scrollSimulationTop,360);
 });
}

const carrySwapLampBatteryBtn=$('carrySwapLampBatteryBtn');
if(carrySwapLampBatteryBtn){
 carrySwapLampBatteryBtn.addEventListener('click',(e)=>{
   e.preventDefault();e.stopPropagation();
   if(!isRechargeableLamp() || Number(game.lampCharge||0)>=100)return;
   if(Number(game.resources.accumulator||0)<=0){showGameError('Нет запасного аккумулятора');return;}
   useResource('accumulator',1);
   game.lampCharge=100;
   saveGame();render();
 });
}

bindQuickBuyCard('quickBuyWater',quickBuyWater);
bindQuickBuyCard('quickBuyLampPower',quickBuyLampPower);
bindQuickBuyCard('quickBuyGels',quickBuyGels);
bindQuickBuyCard('quickBuyMedkit',quickBuyMedkit);

render();

(function recoverRaceAfterManualReload(){
  try{
    if(!consumeReloadedRaceFlag()) return;
    clearTransientRaceUi();
    saveGame();
    render();
    updateRestUi();
    try{ renderTraining(); }catch(e){}
    setTimeout(()=>showGameError('Страница была обновлена во время гонки. Симуляция сброшена — можно стартовать заново.'),120);
  }catch(e){}
})();

(function(){
  function openHelp(){
    const m=document.getElementById('helpModal');
    document.body.classList.add('help-open');
    if(m){ m.classList.add('open'); m.setAttribute('aria-hidden','false'); }
  }
  function closeHelp(){
    const m=document.getElementById('helpModal');
    document.body.classList.remove('help-open');
    if(m){ m.classList.remove('open'); m.setAttribute('aria-hidden','true'); }
  }
  document.addEventListener('click',function(e){
    if(e.target.closest('#helpBtn') || e.target.closest('#topHelpBtn') || e.target.closest('#navHelpBtn')) openHelp();
    if(e.target.closest('#helpClose') || e.target.closest('#helpOk')) closeHelp();
    if(e.target.closest('#helpModal a[href^="mailto:"]')) closeHelp();
    if(e.target && e.target.id==='helpModal') closeHelp();
  });
})();

// iOS/Safari: ускоряем тапы и не даём случайному двойному событию выполнить действие дважды.
// Блокировка очень короткая и применяется только после уже принятого клика.
document.addEventListener('click',function(e){
  const b=e.target.closest('button');
  if(!b || b.disabled) return;
  const now=Date.now();
  const prev=Number(b.dataset.lastAcceptedClick||0);
  if(prev && now-prev<180){
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  b.dataset.lastAcceptedClick=String(now);
},true);

document.addEventListener('click', function(e){
  const b=e.target.closest('button');
  if(!b) return;
  const txt=(b.textContent||'').trim().toLowerCase();
  if((txt==='купить' || txt.includes('купить тренера')) && purchasesLockedDuringRace()){
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);

window.addEventListener('beforeunload',()=>{
  try{ setRaceSessionFlag(!!(run&&run.running)); }catch(e){}
});

setInterval(()=>{updateRestUi();},1000);


function showPlayerInsideTop3(){
 if(!run) return;

 const standings=currentRaceStandings();
 if(!Array.isArray(standings) || !standings.length) return;

 const playerIndex=standings.findIndex(r=>r && r.player);
 const rank=playerIndex>=0 ? playerIndex+1 : 0;
 if(rank<1 || rank>7) return;

 const name=safeProfileNameForRace();
 const box=document.getElementById('raceLeaders')||document.querySelector('.race-leaders');
 if(!box) return;

 const rows=[...box.querySelectorAll('.leader-row,.leaderboard-row,.race-leader-row')];
 const row=rows[rank-1];
 if(!row) return;

 const nameEl=row.querySelector('.leader-name,.name,[data-leader-name]') || row.children[1];
 if(nameEl) nameEl.textContent=name;

 // Keep the kilometre value equal to the player's live distance.
 const L=levelData();
 const playerKm=Math.max(0,Math.min(Number(L[1]||0),Number(run.p||0)*Number(L[1]||0)));
 const kmEl=row.querySelector('.leader-km,.km,[data-leader-km]') || row.children[row.children.length-1];
 if(kmEl && /км/i.test(kmEl.textContent||'')) kmEl.textContent=`${playerKm.toFixed(1)} км`;
}


try{const _pn=document.querySelector('#playerName');if(_pn){_pn.addEventListener('input',fitPlayerNameFont);_pn.addEventListener('change',fitPlayerNameFont);fitPlayerNameFont();}}catch(e){}
