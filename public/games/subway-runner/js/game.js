/* =========================================================================
   SUBWAY RUNNER — a 3D endless runner built with Three.js
   ---------------------------------------------------------------------------
   World moves toward the player along +Z. Player stays near z=0 and switches
   between 3 lanes, jumps, and slides to dodge obstacles and collect coins.
   ========================================================================= */

(() => {
  const THREE = window.THREE;

  // ---- Tunables -----------------------------------------------------------
  const LANES = [-2.4, 0, 2.4];        // x positions of the 3 lanes
  const START_SPEED = 0.17;            // gentle Stage-1 pace (world units / frame)
  const MAX_SPEED = 0.6;
  const SPEED_RAMP = 0.000014;         // speed gained per unit travelled
  const STAGE_DISTANCE = 320;          // distance travelled before the next stage
  const MAX_STAGE = 8;
  const GRAVITY = -0.024;
  const JUMP_V = 0.44;                 // first jump
  const JUMP_V2 = 0.42;                // second (double) jump — tap Space again in mid-air to reach train roofs
  const SPAWN_AHEAD = -120;            // z where things appear
  const DESPAWN = 12;                  // z where things get recycled (behind cam)
  const LANE_LERP = 0.22;              // lane-switch smoothing
  const SLIDE_TIME = 36;               // frames a slide lasts

  // ---- DOM ----------------------------------------------------------------
  const canvas = document.getElementById('scene');
  const hud = document.getElementById('hud');
  const startScreen = document.getElementById('start');
  const overScreen = document.getElementById('gameover');
  const scoreEl = document.getElementById('score');
  const coinsEl = document.getElementById('coins');
  const stageEl = document.getElementById('stage');
  const bannerEl = document.getElementById('stage-banner');
  const muteBtn = document.getElementById('mute');
  const finalScoreEl = document.getElementById('final-score');
  const finalCoinsEl = document.getElementById('final-coins');
  const bestScoreEl = document.getElementById('best-score');

  // ---- Renderer / Scene / Camera -----------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2b1a4d, 35, 115);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  camera.position.set(0, 4.2, 8);
  camera.lookAt(0, 1.6, -10);

  // ---- Sunset sky backdrop (gradient) ------------------------------------
  function makeSky() {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 256;
    const g = c.getContext('2d').createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, '#3a1d6e');
    g.addColorStop(0.35, '#7a2c84');
    g.addColorStop(0.62, '#d24b6a');
    g.addColorStop(0.80, '#ff8c42');
    g.addColorStop(1.00, '#ffd27a');
    const ctx = c.getContext('2d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  scene.background = makeSky();

  // ---- Lights -------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xffd9b0, 0x331a4d, 0.85));
  const sun = new THREE.DirectionalLight(0xffd0a0, 1.15);
  sun.position.set(-8, 16, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  scene.add(sun);
  scene.add(sun.target);

  // ---- Track texture (sleepers) ------------------------------------------
  function makeTrackTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5a4a3a';
    ctx.fillRect(0, 0, 256, 256);
    // gravel speckle
    for (let i = 0; i < 1400; i++) {
      const v = 40 + Math.floor(Math.random() * 60);
      ctx.fillStyle = `rgb(${v + 30},${v + 18},${v})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // wooden sleepers
    ctx.fillStyle = '#3f2c1c';
    for (let y = 8; y < 256; y += 64) ctx.fillRect(0, y, 256, 26);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 60);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 600),
    new THREE.MeshStandardMaterial({ map: makeTrackTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -280;
  ground.receiveShadow = true;
  scene.add(ground);

  // steel rails (thin emissive strips along the lanes' edges)
  function addRail(x) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 600),
      new THREE.MeshStandardMaterial({ color: 0xcfd6e0, metalness: 0.9, roughness: 0.3 })
    );
    rail.position.set(x, 0.03, -280);
    scene.add(rail);
  }
  [-3.1, -1.7, -0.7, 0.7, 1.7, 3.1].forEach(addRail);

  // ---- City buildings on both sides (recycled) ---------------------------
  const buildings = [];
  const buildingMat = [0x241a3a, 0x2c2046, 0x1d1530, 0x322452].map(
    (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 })
  );
  const winMat = new THREE.MeshBasicMaterial({ color: 0xffce6b });

  function makeBuilding(side) {
    const grp = new THREE.Group();
    const w = 3 + Math.random() * 3;
    const h = 8 + Math.random() * 26;
    const d = 3 + Math.random() * 3;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      buildingMat[(Math.random() * buildingMat.length) | 0]
    );
    body.position.y = h / 2;
    body.castShadow = true;
    grp.add(body);
    // lit windows
    const cols = Math.max(2, Math.floor(w / 1.1));
    const rows = Math.max(3, Math.floor(h / 2.2));
    for (let r = 0; r < rows; r++) {
      for (let cl = 0; cl < cols; cl++) {
        if (Math.random() < 0.45) continue;
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.8), winMat);
        win.position.set(
          -w / 2 + 0.7 + cl * (w / cols),
          1.2 + r * (h / rows),
          (d / 2) * side + 0.01 * side
        );
        if (side < 0) win.rotation.y = Math.PI;
        grp.add(win);
      }
    }
    grp.userData = { w, h, d };
    return grp;
  }

  for (let i = 0; i < 24; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const b = makeBuilding(side);
    b.position.set(side * (7 + Math.random() * 5), 0, -i * 11 - 8);
    buildings.push(b);
    scene.add(b);
  }

  // ---- Player -------------------------------------------------------------
  function makePlayer() {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98a, roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xff5a2c, roughness: 0.6 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x3355dd, roughness: 0.6 });
    const hair = new THREE.MeshStandardMaterial({ color: 0xbfc4cc, roughness: 0.5 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.4), shirt);
    torso.position.y = 1.15; g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 18), skin);
    head.position.y = 1.85; g.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 18, 0, Math.PI * 2, 0, Math.PI / 2), hair);
    cap.position.y = 1.92; g.add(cap);

    // Player photo face — loaded from assets/player.jpg. The disc sits on the
    // camera-facing side of the head so you see the runner's face as you play.
    // If the file is missing, it stays hidden and the plain head shows instead.
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.31, 28), faceMat);
    face.position.set(0, 1.87, 0.345);
    face.visible = false;
    g.add(face);
    new THREE.TextureLoader().load(
      'assets/player.jpg',
      (tex) => { tex.colorSpace = THREE.SRGBColorSpace; faceMat.map = tex; faceMat.needsUpdate = true; face.visible = true; },
      undefined,
      () => {}   // missing file → keep the default head
    );

    // arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.62, 0.18);
    const armL = new THREE.Mesh(armGeo, shirt); armL.position.set(-0.46, 1.18, 0);
    const armR = new THREE.Mesh(armGeo, shirt); armR.position.set(0.46, 1.18, 0);
    g.add(armL, armR);

    // legs
    const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
    const legL = new THREE.Mesh(legGeo, pants); legL.position.set(-0.18, 0.4, 0);
    const legR = new THREE.Mesh(legGeo, pants); legR.position.set(0.18, 0.4, 0);
    g.add(legL, legR);

    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.userData = { armL, armR, legL, legR };
    return g;
  }

  const player = makePlayer();
  scene.add(player);

  // ---- Obstacles & coins pools -------------------------------------------
  // Obstacle types: 'train' (change lane), 'low' (jump), 'high' (slide)
  const obstacles = [];
  const coins = [];

  const trainMat = new THREE.MeshStandardMaterial({ color: 0xc23b3b, roughness: 0.5, metalness: 0.2 });
  const trainTop = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.4 });
  const lowMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6 });
  const highMat = new THREE.MeshStandardMaterial({ color: 0x3aa0ff, roughness: 0.5 });
  const coinMat = new THREE.MeshStandardMaterial({
    color: 0xffd23c, metalness: 0.7, roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.5
  });

  function makeObstacle(type) {
    let mesh;
    if (type === 'train') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.4, 7), trainMat);
      body.position.y = 1.2;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.25, 7), trainTop);
      roof.position.y = 2.45;
      mesh.add(body, roof);
      mesh.userData.size = { x: 1.9, y: 2.4, z: 7 };
    } else if (type === 'low') {
      // long low block — JUMP onto it and run across the top until it ends
      mesh = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 3.5), lowMat);
      mesh.position.y = 0.4;
      mesh.userData.size = { x: 1.9, y: 0.8, z: 3.5 };
    } else {
      // overhead barrier — SLIDE under it
      mesh = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.5), highMat);
      bar.position.y = 1.9;
      const legA = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.9, 0.15), highMat);
      legA.position.set(-0.9, 0.95, 0);
      const legB = legA.clone(); legB.position.x = 0.9;
      mesh.add(bar, legA, legB);
      mesh.userData.size = { x: 2.0, y: 0.6, z: 0.5, gap: 1.6 }; // clearance under bar
    }
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    mesh.userData.type = type;
    return mesh;
  }

  function makeCoin() {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), coinMat);
    m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    return m;
  }

  // ---- Game state ---------------------------------------------------------
  const state = {
    running: false,
    speed: START_SPEED,
    distance: 0,
    coins: 0,
    score: 0,
    best: Number(localStorage.getItem('sr_best') || 0),
    stage: 1,
    lane: 1,
    targetX: 0,
    y: 0,
    vy: 0,
    onGround: true,
    jumps: 0,
    sliding: 0,
    spawnAccum: 0,
    runCycle: 0,
  };
  bestScoreEl.textContent = state.best;

  let bannerTimer = null;
  function showBanner(text) {
    bannerEl.textContent = text;
    bannerEl.classList.remove('hidden', 'show');
    void bannerEl.offsetWidth;       // restart the CSS animation
    bannerEl.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => bannerEl.classList.add('hidden'), 1500);
  }

  // ---- Spawning -----------------------------------------------------------
  function clearWorld() {
    obstacles.forEach((o) => scene.remove(o));
    coins.forEach((c) => scene.remove(c));
    obstacles.length = 0;
    coins.length = 0;
  }

  function spawnRow(z) {
    const stage = state.stage;
    // Stage 1 is forgiving: lots of clear "breather" rows; they thin out as
    // the stage climbs so the track gets busier over time.
    const breather = Math.max(0.06, 0.36 - stage * 0.045);
    if (Math.random() < breather) return;

    // Choose how many lanes get an obstacle (never block all 3).
    // Early stages almost always block just 1 lane; double-blocks ramp up later.
    const blocked = new Set();
    const twoChance = Math.min(0.6, (stage - 1) * 0.12);
    const nBlock = Math.random() < twoChance ? 2 : 1;
    while (blocked.size < nBlock) blocked.add((Math.random() * 3) | 0);

    const types = ['train', 'low', 'high'];
    blocked.forEach((lane) => {
      const type = types[(Math.random() * types.length) | 0];
      const o = makeObstacle(type);
      o.position.set(LANES[lane], 0, z);
      o.userData.lane = lane;
      obstacles.push(o);
      scene.add(o);
    });

    // Coins in a free lane, sometimes in an arc (encouraging a jump).
    // More generous at easy stages.
    const coinChance = Math.max(0.35, 0.7 - stage * 0.03);
    for (let lane = 0; lane < 3; lane++) {
      if (blocked.has(lane)) continue;
      if (Math.random() < coinChance) {
        const arc = Math.random() < 0.3;
        const n = 4;
        for (let i = 0; i < n; i++) {
          const c = makeCoin();
          const cz = z + i * 1.6;
          const cy = arc ? 0.7 + Math.sin((i / (n - 1)) * Math.PI) * 1.6 : 0.7;
          c.position.set(LANES[lane], cy, cz);
          coins.push(c);
          scene.add(c);
        }
      }
    }
  }

  // ---- Input --------------------------------------------------------------
  function moveLane(dir) {
    if (!state.running) return;
    state.lane = Math.max(0, Math.min(2, state.lane + dir));
    state.targetX = LANES[state.lane];
  }
  function jump() {
    if (!state.running) return;
    if (state.onGround) {
      state.vy = JUMP_V;
      state.onGround = false;
      state.sliding = 0;
      state.jumps = 1;
      GameAudio.jump();
    } else if (state.jumps < 2) {
      state.vy = JUMP_V2;          // double jump — tap Space again in the air
      state.jumps = 2;
      GameAudio.jump();
    }
  }
  function slide() {
    if (!state.running || !state.onGround) return;
    state.sliding = SLIDE_TIME;
    GameAudio.slide();
  }

  window.addEventListener('keydown', (e) => {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': moveLane(-1); break;
      case 'ArrowRight': case 'KeyD': moveLane(1); break;
      case 'ArrowUp': case 'KeyW': case 'Space': jump(); e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': slide(); break;
    }
  });

  // touch swipe
  let tStart = null;
  canvas.addEventListener('touchstart', (e) => {
    tStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!tStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) > 24) moveLane(dx > 0 ? 1 : -1);
    } else {
      if (dy < -24) jump();
      else if (dy > 24) slide();
    }
    tStart = null;
  }, { passive: true });

  // ---- Collision ----------------------------------------------------------
  function hitsObstacle(o) {
    // Use the character's ACTUAL position (not the instant lane index) so a
    // crash only happens on real contact — never before, and never the moment
    // you merely tap toward a lane.
    const dz = Math.abs(o.position.z - player.position.z);
    const halfZ = (o.userData.size.z || 0.5) / 2 + 0.25;   // obstacle half-depth + player half-depth
    if (dz > halfZ) return false;

    const dx = Math.abs(o.position.x - player.position.x);
    if (dx > 1.15) return false;   // physically standing in a different lane

    const type = o.userData.type;
    if (type === 'train') return state.y < o.userData.size.y - 0.2; // land on the roof (double-jump) or change lanes — side hit crashes
    if (type === 'low') return state.y < o.userData.size.y - 0.2;   // only a side hit crashes; landing on top is safe
    if (type === 'high') return state.sliding <= 0; // slide clears it
    return false;
  }

  // ---- Loop ---------------------------------------------------------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let raf = null;
  function loop() {
    raf = requestAnimationFrame(loop);
    const moving = state.running ? state.speed : 0.12; // idle drift on menus

    // speed ramp + stage progression
    if (state.running) {
      state.distance += state.speed;
      state.speed = Math.min(
        MAX_SPEED,
        START_SPEED + (state.stage - 1) * 0.03 + state.distance * SPEED_RAMP
      );

      const newStage = Math.min(MAX_STAGE, Math.floor(state.distance / STAGE_DISTANCE) + 1);
      if (newStage !== state.stage) {
        state.stage = newStage;
        stageEl.textContent = newStage;
        showBanner('STAGE ' + newStage);
        GameAudio.stageUp();
        GameAudio.setStage(newStage);
      }
    }

    // ---- world scroll ----
    ground.material.map.offset.y -= moving * 0.05;

    for (const b of buildings) {
      b.position.z += moving;
      if (b.position.z > 18) {
        b.position.z = -250 - Math.random() * 20; // recycle to the far end
      }
    }

    // obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.position.z += moving;
      if (o.position.z > DESPAWN) {
        scene.remove(o);
        obstacles.splice(i, 1);
        if (state.running) { state.score += 5; } // survived a row
      } else if (state.running && hitsObstacle(o)) {
        return gameOver();
      }
    }

    // coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.position.z += moving;
      c.rotation.z += 0.12;
      if (state.running) {
        const dz = Math.abs(c.position.z - player.position.z);
        const sameLane = Math.abs(c.position.x - state.targetX) < 1.2;
        const dy = Math.abs(c.position.y - (state.y + 0.9));
        if (dz < 0.7 && sameLane && dy < 1.1) {
          state.coins++; state.score += 10;
          GameAudio.coin();
          scene.remove(c); coins.splice(i, 1);
          continue;
        }
      }
      if (c.position.z > DESPAWN) { scene.remove(c); coins.splice(i, 1); }
    }

    // spawn ahead — rows get tighter (closer together) as stages climb
    if (state.running) {
      const gap = Math.max(6.5, 11 - state.stage * 0.6);
      state.spawnAccum += state.speed;
      while (state.spawnAccum >= gap) {
        spawnRow(SPAWN_AHEAD - Math.random() * 3);
        state.spawnAccum -= gap;
      }
    }

    // ---- player physics (low blocks act as stand-on platforms) ----
    // Work out the support height under the player: the track (0), or the top
    // of a low block when the player is descending onto it and horizontally
    // over it. Support holds until the block's end passes — then the player
    // drops back to the track.
    let groundY = 0;
    if (state.vy <= 0) {
      for (const o of obstacles) {
        // low blocks AND trains can be stood on (jump / double-jump onto the top)
        if (o.userData.type !== 'low' && o.userData.type !== 'train') continue;
        if (Math.abs(o.position.x - player.position.x) > 1.0) continue;
        // Support reaches slightly past the collision box so the player is
        // always held up while over the block (no clipping the front/back edge).
        const halfZ = (o.userData.size.z || 0.5) / 2 + 0.3;
        if (Math.abs(o.position.z - player.position.z) > halfZ) continue;
        const top = o.userData.size.y;
        if (state.y >= top - 0.2) groundY = Math.max(groundY, top);
      }
    }

    state.vy += GRAVITY;
    state.y += state.vy;
    if (state.y <= groundY) {
      state.y = groundY;
      state.vy = 0;
      state.onGround = true;
      state.jumps = 0;            // landing refreshes the double jump
    } else {
      state.onGround = false;
    }
    if (state.sliding > 0) state.sliding--;

    // smooth lane move
    player.position.x += (state.targetX - player.position.x) * LANE_LERP;
    player.position.y = state.y;

    // squash for slide, lean for lane change
    const slideK = state.sliding > 0 ? 1 : 0;
    player.scale.y += ((slideK ? 0.55 : 1) - player.scale.y) * 0.3;
    player.scale.z += ((slideK ? 1.5 : 1) - player.scale.z) * 0.3;
    player.rotation.z += (((state.targetX - player.position.x) * -0.12) - player.rotation.z) * 0.2;

    // running animation (arm/leg swing)
    if (state.running && state.onGround && state.sliding <= 0) {
      state.runCycle += state.speed * 1.6;
      const s = Math.sin(state.runCycle) * 0.7;
      const u = player.userData;
      u.legL.rotation.x = s; u.legR.rotation.x = -s;
      u.armL.rotation.x = -s; u.armR.rotation.x = s;
    }

    // camera subtle follow + bob, lifting to keep the player framed when elevated
    camera.position.x += (player.position.x * 0.35 - camera.position.x) * 0.1;
    const camTargetY = 4.2 + state.y * 0.32 + Math.sin(state.runCycle * 0.5) * 0.04;
    camera.position.y += (camTargetY - camera.position.y) * 0.15;
    camera.lookAt(player.position.x * 0.4, 1.4 + state.y * 0.45, -10);

    // keep the sun shadow centered on the player
    sun.target.position.set(player.position.x, 0, player.position.z);

    // HUD
    if (state.running) {
      state.score += state.speed * 0.6; // distance points
      scoreEl.textContent = Math.floor(state.score);
      coinsEl.textContent = state.coins;
    }

    renderer.render(scene, camera);
  }

  // ---- Flow ---------------------------------------------------------------
  function startGame() {
    clearWorld();
    Object.assign(state, {
      running: true, speed: START_SPEED, distance: 0,
      coins: 0, score: 0, stage: 1, lane: 1, targetX: 0,
      y: 0, vy: 0, onGround: true, jumps: 0, sliding: 0,
      spawnAccum: 0, runCycle: 0,
    });
    player.position.set(0, 0, 0);
    player.scale.set(1, 1, 1);
    // pre-fill the track (Stage 1 spacing)
    for (let z = SPAWN_AHEAD; z < -15; z += 11) spawnRow(z);

    startScreen.classList.add('hidden');
    overScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    scoreEl.textContent = '0';
    coinsEl.textContent = '0';
    stageEl.textContent = '1';

    // audio (kicked off by this user gesture, satisfying autoplay policy)
    GameAudio.init();
    GameAudio.resume();
    GameAudio.setStage(1);
    GameAudio.startMusic();
  }

  function gameOver() {
    state.running = false;
    GameAudio.crash();
    GameAudio.stopMusic();
    const sc = Math.floor(state.score);
    if (sc > state.best) {
      state.best = sc;
      localStorage.setItem('sr_best', sc);
    }
    finalScoreEl.textContent = sc;
    finalCoinsEl.textContent = state.coins;
    bestScoreEl.textContent = state.best;
    hud.classList.add('hidden');
    overScreen.classList.remove('hidden');
  }

  document.getElementById('play-btn').addEventListener('click', () => { GameAudio.button(); startGame(); });
  document.getElementById('retry-btn').addEventListener('click', () => { GameAudio.button(); startGame(); });

  muteBtn.addEventListener('click', () => {
    const m = !GameAudio.isMuted();
    GameAudio.setMuted(m);
    muteBtn.innerHTML = m ? '&#128263;' : '&#128266;';   // 🔇 / 🔊
  });

  loop();
})();
