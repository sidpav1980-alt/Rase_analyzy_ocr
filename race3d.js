/* ==========================================================================
   RACE3D — lightweight Three.js backdrop for the race screen.
   Mountains, trees, grass, a river crossing, a day/night cycle and rain.
   Purely decorative/atmospheric — does not affect game logic or numbers.
   ========================================================================== */
(function(){
  if(typeof THREE === "undefined"){ window.Race3D = { init(){}, setLevel(){}, setRainActive(){}, setProgress(){}, updateSnails(){}, onResize(){} }; return; }

  // deterministic PRNG so a level's trees/mountains look the same every time
  function mulberry32(seed){
    return function(){
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // per-level palette (index-aligned with LEVEL_THEMES in app.js)
  const THEME_3D = [
    {ground:0x4f8a3d, mtn:0x6b7d55, snow:false, trees:0.9,  treeColor:0x2f6b34, fog:0xbfe6c8, sand:false}, // park
    {ground:0x2f5a34, mtn:0x3f5540, snow:false, trees:1.0,  treeColor:0x224a28, fog:0x7fae7a, sand:false}, // forest
    {ground:0x5c5a44, mtn:0x585850, snow:false, trees:0.5,  treeColor:0x3c4a34, fog:0x8f978f, sand:false}, // mud
    {ground:0x8a7d5c, mtn:0x8a7d69, snow:false, trees:0.3,  treeColor:0x5c6b40, fog:0xc9c2b0, sand:false}, // rocky
    {ground:0x1c2438, mtn:0x232c46, snow:false, trees:0.4,  treeColor:0x16321c, fog:0x0a1330, sand:false, night:true}, // night
    {ground:0x6f9a5a, mtn:0x9fb0c4, snow:true,  trees:0.5,  treeColor:0x3c6b3c, fog:0xa9d3ef, sand:false}, // alpine
    {ground:0x5c6a70, mtn:0x707d88, snow:true,  trees:0.2,  treeColor:0x445048, fog:0x8fa9bd, sand:false}, // windy
    {ground:0xc7a35c, mtn:0xb08a52, snow:false, trees:0.05, treeColor:0x8a6b34, fog:0xffd98a, sand:true},  // desert heat
    {ground:0xa5744a, mtn:0x9a5c3a, snow:false, trees:0.1,  treeColor:0x6b4a2c, fog:0xe0a377, sand:true},  // canyon
    {ground:0x38424a, mtn:0x2b333f, snow:false, trees:0.3,  treeColor:0x232c28, fog:0x4a5568, sand:false}, // storm
    {ground:0x3c5a70, mtn:0x33507a, snow:false, trees:0.4,  treeColor:0x224038, fog:0x5b7fa6, sand:false}, // dusk
    {ground:0x8a7d9e, mtn:0xa090b8, snow:true,  trees:0.15, treeColor:0x5a5070, fog:0xc9b7e0, sand:false}, // high alt
    {ground:0xd8c48a, mtn:0xd8d8dc, snow:true,  trees:0.02, treeColor:0x9a8a5a, fog:0xcbb98a, sand:true},  // chara
    {ground:0x241a3d, mtn:0x2c2044, snow:false, trees:0.2,  treeColor:0x16102a, fog:0x1a1230, sand:false, night:true}, // wild night
    {ground:0xd89a52, mtn:0xb87a3a, snow:false, trees:0.02, treeColor:0x8a5c2c, fog:0xf2b25e, sand:true},  // wasteland
    {ground:0xdcecf5, mtn:0xeaf6ff, snow:true,  trees:0.05, treeColor:0x6a8a70, fog:0xeaf6ff, sand:false}, // ice alpine
    {ground:0x4a4260, mtn:0x453a5c, snow:true,  trees:0.15, treeColor:0x2c2440, fog:0x5b4a75, sand:false}, // storm purple
    {ground:0x241a3d, mtn:0x2c2050, snow:false, trees:0.1,  treeColor:0x160f2a, fog:0x241a3d, sand:false, night:true}, // violet
    {ground:0x2c4a4a, mtn:0x274a52, snow:false, trees:0.25, treeColor:0x1a3230, fog:0x3f6e73, sand:false}, // edge world
    {ground:0x7a3a1e, mtn:0x6b2a16, snow:false, trees:0.05, treeColor:0x4a2410, fog:0xff8a4a, sand:true},  // madness
    {ground:0x2a0806, mtn:0x1c0504, snow:false, trees:0.0,  treeColor:0x1a0503, fog:0x7a1210, sand:true}   // armageddon
  ];

  let renderer, scene, camera, clock;
  let ground, mountainsGroup, treesGroup, fordMesh, rainPoints, sunMesh, moonMesh, hemi, sun;
  let container, currentLevel = 0, rainActive = false, ready = false;
  let dayPhase = 0.25; // 0..1 across a slow real-time day/night loop
  let snailsGroup, spriteCache = new Map();

  function buildSnailSprite(kind){
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.font = (kind==="leader"?"44px":"38px")+" serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if(kind==="player"){
      ctx.shadowColor = "#ff5d5d"; ctx.shadowBlur = 14;
    } else if(kind==="leader"){
      ctx.shadowColor = "#ffd166"; ctx.shadowBlur = 10;
    } else if(kind==="straggler"){
      ctx.globalAlpha = 0.55;
    }
    ctx.fillText("🐌", size/2, size/2+2);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({map:tex, transparent:true, depthTest:true});
    const sprite = new THREE.Sprite(mat);
    const s = kind==="player"?1.5:(kind==="leader"?1.25:(kind==="straggler"?0.75:1.0));
    sprite.scale.set(s,s,s);
    return sprite;
  }
  function getSnailSprite(key, kind){
    let s = spriteCache.get(key);
    if(!s){ s = buildSnailSprite(kind); snailsGroup.add(s); spriteCache.set(key, s); }
    s.userData.seen = true;
    return s;
  }
  function updateSnails(list){
    if(!ready || !snailsGroup) return;
    spriteCache.forEach(s=>{ s.userData.seen=false; });
    list.forEach(item=>{
      const sp = getSnailSprite(item.key, item.kind);
      sp.position.set(item.x, item.y!==undefined?item.y:1.1, item.z);
      sp.visible = true;
    });
    spriteCache.forEach((s,key)=>{
      if(!s.userData.seen){ snailsGroup.remove(s); spriteCache.delete(key); }
    });
  }

  function init(containerEl){
    container = containerEl;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    camera.position.set(0, 5.5, 13);
    camera.lookAt(0, 1.2, -30);

    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    container.appendChild(renderer.domElement);

    hemi = new THREE.HemisphereLight(0xffffff, 0x223322, 0.9);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(10, 20, 10);
    scene.add(sun);

    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 260, 1, 1),
      new THREE.MeshLambertMaterial({color:0x4f8a3d})
    );
    ground.rotation.x = -Math.PI/2;
    ground.position.set(0, 0, -80);
    scene.add(ground);

    // path strip down the middle
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 260, 1, 1),
      new THREE.MeshLambertMaterial({color:0xb89a6a})
    );
    path.rotation.x = -Math.PI/2;
    path.position.set(0, 0.02, -80);
    scene.add(path);

    mountainsGroup = new THREE.Group(); scene.add(mountainsGroup);
    treesGroup = new THREE.Group(); scene.add(treesGroup);
    snailsGroup = new THREE.Group(); scene.add(snailsGroup);

    fordMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 3.6),
      new THREE.MeshPhongMaterial({color:0x2f78c9, transparent:true, opacity:0.75, shininess:80})
    );
    fordMesh.rotation.x = -Math.PI/2;
    fordMesh.position.set(0, 0.03, -34);
    scene.add(fordMesh);

    const sunGeo = new THREE.SphereGeometry(1.6, 12, 12);
    sunMesh = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({color:0xfff2c0}));
    scene.add(sunMesh);
    moonMesh = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({color:0xdfe6ff}));
    scene.add(moonMesh);

    buildRain();
    clock = new THREE.Clock();
    ready = true;
    buildLevel(currentLevel);
    onResize();
    window.addEventListener("resize", onResize);
    animate();
  }

  function buildRain(){
    const N = 260;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N*3);
    for(let i=0;i<N;i++){
      pos[i*3] = (Math.random()-0.5)*60;
      pos[i*3+1] = Math.random()*30;
      pos[i*3+2] = -80 + (Math.random()-0.5)*140;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos,3));
    const m = new THREE.PointsMaterial({color:0xaad4ff, size:0.18, transparent:true, opacity:0.75});
    rainPoints = new THREE.Points(g, m);
    rainPoints.visible = false;
    scene.add(rainPoints);
  }

  function clearGroup(g){ while(g.children.length){ g.remove(g.children[0]); } }

  function buildLevel(idx){
    currentLevel = idx;
    const t = THEME_3D[idx] || THEME_3D[0];
    const rnd = mulberry32(idx*97+13);

    ground.material.color.setHex(t.ground);
    scene.fog = new THREE.Fog(t.fog, 40, 170);

    clearGroup(mountainsGroup);
    for(let i=0;i<11;i++){
      const w = 12+rnd()*16, h = 10+rnd()*20;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(w, h, 5),
        new THREE.MeshLambertMaterial({color:t.mtn})
      );
      cone.position.set((i-5)*13 + (rnd()-0.5)*8, h/2-1, -110 - rnd()*30);
      cone.rotation.y = rnd()*Math.PI;
      mountainsGroup.add(cone);
      if(t.snow){
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(w*0.4, h*0.32, 5),
          new THREE.MeshLambertMaterial({color:0xffffff})
        );
        cap.position.set(cone.position.x, h - h*0.16, cone.position.z);
        mountainsGroup.add(cap);
      }
    }

    clearGroup(treesGroup);
    const treeCount = Math.round(70*t.trees);
    for(let i=0;i<treeCount;i++){
      const side = rnd()<0.5?-1:1;
      const x = side*(3 + rnd()*16);
      const z = -10 - rnd()*140;
      const s = 0.6+rnd()*0.9;
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12*s,0.16*s,1.1*s,5), new THREE.MeshLambertMaterial({color:0x4a3323}));
      trunk.position.y = 0.55*s;
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.75*s,1.8*s,6), new THREE.MeshLambertMaterial({color:t.treeColor}));
      canopy.position.y = 1.5*s;
      grp.add(trunk, canopy);
      grp.position.set(x, 0, z);
      treesGroup.add(grp);
    }

    fordMesh.position.z = -30 - rnd()*20;
    fordMesh.visible = !t.sand || rnd()>0.4;

    hemi.groundColor.setHex(t.sand? 0x8a6a3a : 0x223322);

    clearGroup(snailsGroup);
    spriteCache.clear();
  }

  function updateDayNight(dt){
    const cycle = 100; // seconds for a full day/night loop
    dayPhase = (dayPhase + dt/cycle) % 1;
    const angle = dayPhase*Math.PI*2;
    const sunY = Math.sin(angle)*40;
    const sunX = Math.cos(angle)*40;
    sunMesh.position.set(sunX, sunY+5, -70);
    moonMesh.position.set(-sunX, -sunY+5, -70);
    sunMesh.visible = sunY > -6;
    moonMesh.visible = sunY <= -6;

    const light = clamp01((sunY+10)/34); // 0 at deep night, 1 at midday
    sun.intensity = 0.25 + light*1.1;
    sun.color.setHSL(0.12, 0.5, 0.55+light*0.3);
    hemi.intensity = 0.35 + light*0.7;

    const t = THEME_3D[currentLevel] || THEME_3D[0];
    const dayFog = new THREE.Color(t.fog);
    const nightFog = new THREE.Color(t.fog).multiplyScalar(0.18).lerp(new THREE.Color(0x05070f), 0.55);
    const skyColor = nightFog.clone().lerp(dayFog, light);
    scene.fog.color.copy(skyColor);
    scene.background = skyColor;
  }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }

  function animate(){
    requestAnimationFrame(animate);
    if(!ready) return;
    const dt = Math.min(0.1, clock.getDelta());
    updateDayNight(dt);

    if(rainPoints.visible){
      const pos = rainPoints.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        let y = pos.getY(i) - dt*22;
        if(y < 0) y = 25 + Math.random()*5;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }

  function onResize(){
    if(!container) return;
    const w = container.clientWidth || 320, h = container.clientHeight || 200;
    renderer.setSize(w, h, false);
    camera.aspect = w/Math.max(1,h);
    camera.updateProjectionMatrix();
  }

  function setLevel(idx){
    if(!ready){ currentLevel = idx; return; }
    if(idx===currentLevel) return;
    buildLevel(idx);
  }
  function setRainActive(active){
    rainActive = active;
    if(rainPoints) rainPoints.visible = active;
  }
  function setProgress(pct){
    // subtle forward dolly to sell a sense of movement along the trail
    if(!ready) return;
    const z = 13 - clamp01(pct/100)*3;
    camera.position.z = z;
  }

  window.Race3D = { init, setLevel, setRainActive, setProgress, updateSnails, onResize };
})();
