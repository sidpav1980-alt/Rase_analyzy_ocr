/* ==========================================================================
   RACE3D — lightweight Three.js backdrop for the race screen.
   Mountains, trees, grass, a river crossing, a day/night cycle and rain.
   Purely decorative/atmospheric — does not affect game logic or numbers.
   ========================================================================== */
(function(){
  if(typeof THREE === "undefined"){ window.Race3D = { init(){}, setLevel(){}, setRainActive(){}, setProgress(){}, updateSnails(){}, onResize(){}, getFocusT(){return 0.12;} }; return; }

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
  let snailsGroup, modelCache = new Map();
  let pathGroup, pathCurve = null, focusT = 0.12, targetFocusT = 0.12;

  const SNAIL_COLORS = {
    player:  {shell:0xff5d5d, body:0xffd0c0},
    leader:  {shell:0xffd166, body:0xf0e2c0},
    group:   {shell:0x6fae5a, body:0xd8cdb0},
    straggler:{shell:0x556055, body:0x9a9a8a}
  };
  const SHELL_TEX_CACHE = {};
  function getShellTexture(hex){
    if(SHELL_TEX_CACHE[hex]) return SHELL_TEX_CACHE[hex];
    const c = document.createElement("canvas"); c.width=c.height=128;
    const ctx = c.getContext("2d");
    const base = "#"+hex.toString(16).padStart(6,"0");
    ctx.fillStyle = base; ctx.fillRect(0,0,128,128);
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 7;
    ctx.translate(64,64);
    for(let r=10;r<62;r+=11){ ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    SHELL_TEX_CACHE[hex] = tex;
    return tex;
  }
  function buildSnailModel(kind){
    const c = SNAIL_COLORS[kind] || SNAIL_COLORS.group;
    const grp = new THREE.Group();
    const scale = (kind==="player"?1.5:(kind==="leader"?1.2:(kind==="straggler"?0.7:1.0))) * 2.1;
    const bodyMat = new THREE.MeshLambertMaterial({color:c.body});

    // foot/body: smaller now — the neck+head carry the "forward" read instead
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), bodyMat);
    foot.scale.set(0.6, 0.4, 1.35);
    foot.position.set(0, 0.12, -0.06);
    foot.castShadow = true;
    grp.add(foot);

    // tail point, tapering off behind the shell
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), bodyMat);
    tail.scale.set(0.75, 0.55, 1);
    tail.position.set(0, 0.09, -0.32);
    grp.add(tail);

    // neck: lengthened, angled up and forward, lifting the head clear above the shell
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.1, 0.46, 8), bodyMat);
    neck.position.set(0, 0.3, 0.4);
    neck.rotation.x = -0.8;
    neck.castShadow = true;
    grp.add(neck);

    // head: raised well above the shell now, unmistakably "looking forward"
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10), bodyMat);
    head.scale.set(1, 0.92, 1.05);
    head.position.set(0, 0.5, 0.68);
    head.castShadow = true;
    grp.add(head);
    // small snout tip so the front reads even more clearly
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.078, 8, 8), bodyMat);
    snout.position.set(0, 0.46, 0.83);
    grp.add(snout);

    // shell: coiled dome sitting up on the back, now clearly lower than the head
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.36, 16, 14, 0, Math.PI*2, 0, Math.PI*0.82),
      new THREE.MeshLambertMaterial({map:getShellTexture(c.shell), emissive:kind==="player"?0x440000:(kind==="leader"?0x442c00:0x000000), emissiveIntensity:0.35})
    );
    shell.scale.set(1, 0.95, 1.15);
    shell.position.set(0, 0.36, -0.16);
    shell.castShadow = true;
    grp.add(shell);

    // cartoon-style dark outline for silhouette clarity at a distance
    const outline = new THREE.Mesh(
      shell.geometry,
      new THREE.MeshBasicMaterial({color:0x0a0a0a, side:THREE.BackSide})
    );
    outline.scale.copy(shell.scale).multiplyScalar(1.1);
    outline.position.copy(shell.position);
    grp.add(outline);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09,8,8), new THREE.MeshLambertMaterial({color:c.shell}));
    tip.position.set(0, 0.54, -0.38);
    grp.add(tip);

    // усики (feelers): now sprouting from the raised head, long and clearly
    // visible — the strongest "this is the front" signal on the model
    [-0.08, 0.08].forEach(dx=>{
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.024,0.32,4), bodyMat);
      stalk.position.set(dx, 0.66, 0.78);
      stalk.rotation.x = -0.3;
      grp.add(stalk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038,6,6), new THREE.MeshLambertMaterial({color:0x141414}));
      eye.position.set(dx, 0.8, 0.87);
      grp.add(eye);
    });

    grp.scale.set(scale,scale,scale);
    grp.userData.phase = Math.random()*10;
    grp.userData.kind = kind;
    grp.userData.facing = new THREE.Vector3(0,0,1);
    grp.userData.placed = false;
    return grp;
  }
  function getSnailModel(key, kind){
    let s = modelCache.get(key);
    if(!s){ s = buildSnailModel(kind); snailsGroup.add(s); modelCache.set(key, s); }
    s.userData.seen = true;
    return s;
  }
  function updateSnails(list){
    if(!ready || !snailsGroup) return;
    modelCache.forEach(s=>{ s.userData.seen=false; });
    list.forEach(item=>{
      const sp = getSnailModel(item.key, item.kind);
      let px=item.x||0, py=item.y!==undefined?item.y:0.04, pz=item.z||0, facing=Math.PI;
      let facingVec = new THREE.Vector3(0,0,1);
      if(pathCurve && item.t!==undefined){
        const ct = clamp01(item.t);
        const p = pathCurve.getPointAt(ct);
        const tangent = pathCurve.getTangentAt(ct);
        const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(item.laneOffset||0);
        px = p.x+side.x; pz = p.z+side.z; py = (item.y!==undefined?item.y:0.04)+p.y;
        facing = Math.atan2(tangent.x, tangent.z);
        facingVec = tangent.clone().normalize();
      }
      // these are TARGETS the render loop eases toward each frame — updateSnails
      // itself only runs a few times a second (tied to the game tick), so
      // snapping straight to these would look jerky; animateSnails smooths it
      sp.userData.baseY = py;
      sp.userData.baseX = px;
      sp.userData.baseZ = pz;
      sp.userData.targetRot = facing;
      sp.userData.facing = facingVec;
      if(!sp.userData.placed){
        sp.position.set(px, py, pz);
        sp.rotation.y = facing;
        sp.userData.placed = true;
      }
      sp.visible = true;
    });
    modelCache.forEach((s,key)=>{
      if(!s.userData.seen){ snailsGroup.remove(s); modelCache.delete(key); }
    });
  }
  function animateSnails(elapsed, dt){
    if(!snailsGroup) return;
    const followK = 1 - Math.pow(0.0008, Math.min(dt,0.1)); // frame-rate-independent easing
    modelCache.forEach(s=>{
      const speed = s.userData.kind==="straggler"?2.6:3.6;
      const amp = s.userData.kind==="player"?0.018:0.013;
      const wob = Math.sin(elapsed*speed + s.userData.phase);
      const inch = Math.sin(elapsed*speed*0.5 + s.userData.phase) * 0.22;
      const f = s.userData.facing || {x:0,z:1};
      const targetX = (s.userData.baseX||0) + f.x*inch;
      const targetY = (s.userData.baseY||0.04) + Math.abs(wob)*amp;
      const targetZ = (s.userData.baseZ||0) + f.z*inch;
      s.position.x += (targetX - s.position.x)*followK;
      s.position.y += (targetY - s.position.y)*followK;
      s.position.z += (targetZ - s.position.z)*followK;

      let dRot = (s.userData.targetRot||0) - s.rotation.y;
      dRot = Math.atan2(Math.sin(dRot), Math.cos(dRot)); // shortest angular path
      s.rotation.y += dRot*followK;

      const squash = 1 + wob*0.06;
      const baseScale = (s.userData.kind==="player"?1.5:(s.userData.kind==="leader"?1.2:(s.userData.kind==="straggler"?0.7:1.0))) * 2.1;
      s.scale.set(baseScale*(1-wob*0.03), baseScale*squash, baseScale*(1-wob*0.03));
    });
  }

  // small reusable speckle-noise textures — multiplied by each level's themed
  // color (map × material.color in MeshStandardMaterial), so we don't need to
  // regenerate a tinted texture per level
  let grassTex, dirtTex;
  function makeNoiseTexture(baseGray, variance, size){
    const c = document.createElement("canvas"); c.width=c.height=size;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size,size);
    for(let i=0;i<size*size;i++){
      const v = Math.max(0, Math.min(255, baseGray + (Math.random()-0.5)*variance));
      img.data[i*4]=v; img.data[i*4+1]=v; img.data[i*4+2]=v; img.data[i*4+3]=255;
    }
    ctx.putImageData(img,0,0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  function init(containerEl){
    container = containerEl;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    camera.position.set(0, 5.5, 13);
    camera.lookAt(0, 1.2, -30);

    renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    hemi = new THREE.HemisphereLight(0xffffff, 0x223322, 0.9);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024,1024);
    sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.002;
    scene.add(sun);
    scene.add(sun.target);

    grassTex = makeNoiseTexture(185, 60, 128);
    grassTex.repeat.set(20, 44);
    dirtTex = makeNoiseTexture(205, 75, 96);
    dirtTex.repeat.set(2, 46);

    ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 260, 1, 1),
      new THREE.MeshStandardMaterial({color:0x4f8a3d, map:grassTex, roughness:1, metalness:0})
    );
    ground.rotation.x = -Math.PI/2;
    ground.position.set(0, 0, -80);
    ground.receiveShadow = true;
    scene.add(ground);

    // path strip (rebuilt as a curved ribbon per level in buildLevel)
    pathGroup = new THREE.Group();
    scene.add(pathGroup);

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

  // a gently winding trail, seeded per level — mirrors the reference app's
  // CatmullRomCurve3 + perpendicular-offset ribbon technique
  function buildPathCurve(rnd){
    const segCount = 22;
    const pts = [];
    let x = 0;
    for(let i=0;i<=segCount;i++){
      const tt = i/segCount;
      const z = 12 - tt*160;
      x += (rnd()-0.5)*6.5;
      x = Math.max(-9, Math.min(9, x));
      const y = Math.sin(tt*Math.PI*2.1)*0.5;
      pts.push(new THREE.Vector3(x, Math.max(0,y), z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    curve.curveType = "catmullrom";
    return curve;
  }
  function buildPathRibbon(curve, color){
    const n = 90;
    const ribbonPts = curve.getPoints(n);
    const positions = [], idxArr = [], uvs = [];
    for(let i=0;i<ribbonPts.length;i++){
      const p = ribbonPts[i];
      const next = ribbonPts[Math.min(i+1, ribbonPts.length-1)];
      const dir = new THREE.Vector3().subVectors(next,p).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(2.1);
      positions.push(p.x+side.x, p.y+0.02, p.z+side.z, p.x-side.x, p.y+0.02, p.z-side.z);
      const v = i/(ribbonPts.length-1);
      uvs.push(0,v, 1,v);
    }
    for(let i=0;i<ribbonPts.length-1;i++){
      const i0=i*2,i1=i*2+1,i2=i*2+2,i3=i*2+3;
      idxArr.push(i0,i2,i1, i1,i2,i3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs,2));
    geo.setIndex(idxArr);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color, map:dirtTex, roughness:0.95, metalness:0}));
    mesh.receiveShadow = true;
    return mesh;
  }

  function keepClearOfPath(x){
    // the path wanders up to ±9 and snails fan out a bit further with lane
    // offsets — keep mountain bases outside that corridor so nothing clips
    // through solid rock
    const clearance = 21;
    if(Math.abs(x) >= clearance) return x;
    return x<0 ? x-clearance : x+clearance;
  }

  function buildLevel(idx){
    currentLevel = idx;
    const t = THEME_3D[idx] || THEME_3D[0];
    const rnd = mulberry32(idx*97+13);

    ground.material.color.setHex(t.ground);
    scene.fog = new THREE.Fog(t.fog, 55, 210);

    pathCurve = buildPathCurve(rnd);
    clearGroup(pathGroup);
    pathGroup.add(buildPathRibbon(pathCurve, t.sand ? 0xd8c48a : 0xb89a6a));

    clearGroup(mountainsGroup);
    for(let i=0;i<11;i++){
      const w = 12+rnd()*16, h = 10+rnd()*20;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(w, h, 5),
        new THREE.MeshStandardMaterial({color:t.mtn, roughness:0.95, metalness:0})
      );
      cone.position.set(keepClearOfPath((i-5)*13 + (rnd()-0.5)*8), h/2-1, -80 - rnd()*22);
      cone.rotation.y = rnd()*Math.PI;
      cone.receiveShadow = true;
      mountainsGroup.add(cone);
      if(t.snow){
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(w*0.4, h*0.32, 5),
          new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.7, metalness:0})
        );
        cap.position.set(cone.position.x, h - h*0.16, cone.position.z);
        mountainsGroup.add(cap);
      }
    }

    clearGroup(treesGroup);
    const treeCount = Math.round(70*t.trees);
    for(let i=0;i<treeCount;i++){
      const side = rnd()<0.5?-1:1;
      const x = side*(11 + rnd()*14); // clear of the curve's ±9 wander
      const z = -8 - rnd()*95;
      const s = 0.6+rnd()*0.9;
      const grp = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12*s,0.16*s,1.1*s,5), new THREE.MeshStandardMaterial({color:0x4a3323, roughness:0.9, metalness:0}));
      trunk.position.y = 0.55*s;
      trunk.castShadow = true;
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.75*s,1.8*s,6), new THREE.MeshStandardMaterial({color:t.treeColor, roughness:0.85, metalness:0}));
      canopy.position.y = 1.5*s;
      canopy.castShadow = true;
      grp.add(trunk, canopy);
      grp.position.set(x, 0, z);
      treesGroup.add(grp);
    }

    fordMesh.position.z = -30 - rnd()*20;
    fordMesh.visible = !t.sand || rnd()>0.4;

    hemi.groundColor.setHex(t.sand? 0x8a6a3a : 0x223322);

    clearGroup(snailsGroup);
    modelCache.clear();
  }

  function updateDayNight(dt){
    const t = THEME_3D[currentLevel] || THEME_3D[0];
    const cycle = 100; // seconds for a full day/night loop
    dayPhase = (dayPhase + dt/cycle) % 1;
    const angle = dayPhase*Math.PI*2;

    let light, sunY, sunX;
    if(t.night){
      // a level explicitly themed as a night race stays dark throughout —
      // only a small moonlit shimmer, never swings back to daylight
      sunY = -30; sunX = Math.cos(angle)*10;
      light = 0.06 + Math.max(0, Math.sin(angle))*0.05;
    } else {
      // any other level stays in daylight the whole race — only a gentle
      // sun-arc wobble for atmosphere, never dips into night darkness
      sunY = 18 + Math.sin(angle)*10;
      sunX = Math.cos(angle)*40;
      light = clamp01((sunY+10)/34);
      light = 0.72 + light*0.28; // keep it firmly in daytime range
    }
    sunMesh.position.set(sunX, sunY+5, -70);
    moonMesh.position.set(-sunX, -sunY+5, -70);
    sunMesh.visible = !t.night;
    moonMesh.visible = !!t.night;

    sun.intensity = 0.25 + light*1.1;
    sun.color.setHSL(0.12, 0.5, 0.55+light*0.3);
    hemi.intensity = 0.35 + light*0.7;

    const dayFog = new THREE.Color(t.fog);
    const nightFog = new THREE.Color(t.fog).multiplyScalar(0.18).lerp(new THREE.Color(0x05070f), 0.55);
    const skyColor = nightFog.clone().lerp(dayFog, light);
    scene.fog.color.copy(skyColor);
    scene.background = skyColor;
  }
  function clamp01(v){ return Math.max(0, Math.min(1, v)); }

  let elapsedTotal = 0;
  function animate(){
    requestAnimationFrame(animate);
    if(!ready) return;
    const dt = Math.min(0.1, clock.getDelta());
    elapsedTotal += dt;
    updateDayNight(dt);

    // rate-limited visual catch-up: the real race can jump focusT by a huge
    // amount in one game tick at high speeds, but the camera/scene should
    // never visually "teleport" — cap how fast the on-screen progress can move
    const maxStep = dt * 0.35; // full-course sweep takes ~3s minimum, even from a huge jump
    let diff = targetFocusT - focusT;
    if(Math.abs(diff) > maxStep) diff = diff>0 ? maxStep : -maxStep;
    focusT += diff;

    animateSnails(elapsedTotal, dt);
    updateChaseCamera();

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

  function updateChaseCamera(){
    if(!pathCurve) return;
    const camT = clamp01(focusT - 0.07);
    const lookT = clamp01(focusT + 0.10);
    const camP = pathCurve.getPointAt(camT);
    const camTangent = pathCurve.getTangentAt(camT);
    const camPos = camP.clone().addScaledVector(camTangent, -6).add(new THREE.Vector3(0, 5.4, 0));
    camera.position.lerp(camPos, 0.06);
    const lookP = pathCurve.getPointAt(lookT);
    camera.lookAt(lookP.x, lookP.y+1.2, lookP.z);

    // keep the shadow-casting sun aimed at the action so shadows stay sharp
    // near the runner instead of a fixed origin frustum
    sun.position.set(camP.x+10, 20, camP.z+10);
    sun.target.position.set(camP.x, camP.y, camP.z);
    sun.target.updateMatrixWorld();
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
    // this is the "true" race progress, which can jump hugely between game
    // ticks at high sim speeds (e.g. 600x can finish a race in a few real
    // seconds) — animate() eases the visual camera/scene toward it at a
    // capped rate instead of snapping straight to it, so the 3D view sweeps
    // smoothly forward instead of visibly teleporting
    if(!ready) return;
    targetFocusT = clamp01(0.12 + clamp01(pct/100)*0.72);
  }

  function getFocusT(){ return focusT; }

  window.Race3D = { init, setLevel, setRainActive, setProgress, updateSnails, onResize, getFocusT };
})();
