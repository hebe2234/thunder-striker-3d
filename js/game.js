// 遊戲主邏輯：場景 / 關卡 / 碰撞 / 生成器 / 狀態機
import * as THREE from 'three';
import { AudioSys } from './audio.js';
import { WeaponSystem, WEAPON_INFO, SKILL_DEFS, buildChoices } from './weapons.js';
import { Enemy, Midboss, FinalBoss, Item, spawnEnemyHomingMissile, disposeGroup } from './entities.js';
import { Particles, Rings, Shake, Booms } from './particles.js';
import { makePlayer, makeDrone, groundTexture, onGroundTexture, makeGroundProp, makeCloud, glowSprite, blobShadow, MB } from './models.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;

// 難度設定：speed 影響遊戲速度（敵方移動/開火節奏、敵彈速度、地面捲動）
export const DIFFICULTIES = {
  easy:      { id: 'easy',      name: '簡單', speed: 0.88, hp: 0.6, fireRate: 0.55, playerDmg: 1.3, dmgTaken: 0.7, score: 0.8 },
  normal:    { id: 'normal',    name: '普通', speed: 1.0,  hp: 1.0, fireRate: 1.0,  playerDmg: 1.0, dmgTaken: 1.0, score: 1.0 },
  hard:      { id: 'hard',      name: '困難', speed: 1.12, hp: 1.5, fireRate: 1.4,  playerDmg: 0.9, dmgTaken: 1.3, score: 1.25 },
  nightmare: { id: 'nightmare', name: '噩夢', speed: 1.25, hp: 2.2, fireRate: 1.85, playerDmg: 0.8, dmgTaken: 1.6, score: 1.5 },
};
export const DIFF_IDS = ['easy', 'normal', 'hard', 'nightmare'];

export class Game {
  constructor(container, ui) {
    this.ui = ui; this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
    this.camBase = new V3(0, 16.5, 22.5);
    this.camLook = new V3(0, 0.5, -11);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(this.camLook);

    this.scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x1a1410, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(8, 20, 6); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x4488ff, 0.7);
    rim.position.set(-10, 8, -14); this.scene.add(rim);

    this.audio = new AudioSys();
    this.particles = new Particles(this.scene);
    this.booms = new Booms(this.scene);
    this.rings = new Rings(this.scene);
    this.shake = new Shake();
    this.weapons = new WeaponSystem(this);

    // 地面
    this.groundTex = null; this.ground = null;
    // 星空（夜關）
    this.stars = this._makeStars(); this.stars.visible = false; this.scene.add(this.stars);
    this.props = []; this.clouds = [];
    for (let i = 0; i < 24; i++) this.props.push(this._newProp(true));
    for (let i = 0; i < 9; i++) { const c = makeCloud(); this._resetCloud(c, true); this.clouds.push(c); this.scene.add(c); }

    // 玩家
    const pb = makePlayer();
    this.playerMesh = pb.group; this.engGlows = pb.engGlows;
    this.scene.add(this.playerMesh);
    this.playerShadow = blobShadow(3.4); this.scene.add(this.playerShadow);
    this.player = { x: 0, y: 2.4, z: 7, vx: 0, vz: 0, alive: false, invuln: 0, lives: 3, bombs: 3, maxBombs: 5, respawnT: 0,
      hp: 100, maxHp: 100, regenT: 0 };
    // 護盾視覺
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.shieldMesh.visible = false; this.scene.add(this.shieldMesh);
    // 技能樹狀態
    this.skills = {}; this.shields = 0; this.magnetLvl = 0;
    this.wingmen = []; this.lightnings = [];
    this.kills = 0; this.sinceChoice = 0; this.choiceQueued = false; this._pendingAdvance = null; this._pendingVictory = false;

    // 實體池
    this.enemies = []; this.bullets = []; this.enemyBullets = [];
    this.plasmas = []; this.missiles = []; this.items = []; this.burns = [];
    this._bulletPool = []; this._ebPool = [];

    this.state = 'title';
    this.score = 0; this.hi = +(localStorage.getItem('ts3d_hi') || 0);
    this.chain = 0; this.chainT = 0;
    this.loop = 1; this.stageIdx = 0; this.waveT = 0; this.waves = [];
    this.boss = null; this.bossMode = false;
    this.bombWave = null; this.flashBomb = 0;
    this.diffId = localStorage.getItem('ts3d_diff') || 'normal';
    if (!DIFFICULTIES[this.diffId]) this.diffId = 'normal';
    this.gameSpeed = 1;
    this.difficulty = { hp: 1, fireRate: 1, playerDmg: 1, dmgTaken: 1, score: 1 };
    this.scrollSpeed = 13;
    this.routeDist = 0;   // 彎曲路線累積捲動距離（世界單位）
    this._routeDX = 0;    // 本幀路線橫向位移
    this.attractT = 0;
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane(new V3(0, 1, 0), -2.4);
    this._ndc = new THREE.Vector2();
    this.dragging = false;

    this.keys = {};
    addEventListener('keydown', e => this._key(e, true));
    addEventListener('keyup', e => this._key(e, false));
    addEventListener('resize', () => this._resize());
    this._bindPointer();

    this.setStage(0, true);
    ui.setHi(this.hi); ui.setScore(0);
    this.clock = new THREE.Clock();
  }

  // ---------- 場景佈置 ----------
  _makeStars() {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i*3] = (Math.random() - .5) * 160; pos[i*3+1] = 20 + Math.random() * 60; pos[i*3+2] = -140 + Math.random() * 120;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaaccff, size: 0.9, sizeAttenuation: true }));
  }
  _newProp(randomZ) {
    const p = makeGroundProp(this.stage ? this.stage.theme : 'city');
    p.position.set((Math.random() < .5 ? -1 : 1) * (10 + Math.random() * 14), 0, randomZ ? -100 + Math.random() * 115 : -105 - Math.random() * 10);
    p.rotation.y = Math.random() * 6;
    this.scene.add(p); return p;
  }
  _resetCloud(c, randomZ) {
    c.position.set((Math.random() - .5) * 60, 11 + Math.random() * 9, randomZ ? -100 + Math.random() * 115 : -105 - Math.random() * 15);
  }
  setStage(i, first) {
    this.stageIdx = i;
    this.stage = STAGES[i];
    this.routeDist = 0; this._routeDX = 0; // 換關路線重來
    if (this.ground) { this.scene.remove(this.ground); this.ground.geometry.dispose(); const _mp = this.ground.material.map; if (_mp && !_mp.userData.shared) _mp.dispose(); this.ground.material.dispose(); }
    this.groundTex = groundTexture(this.stage.theme);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 220),
      new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1, metalness: 0,
        color: this.stage.theme === 'night' ? 0x5f6f9e : 0xffffff }));
    this.ground.userData.theme = this.stage.theme;
    const _gr = this.ground, _want = this.stage.theme;
    onGroundTexture(_want, t => {
      if (this.ground !== _gr) return; // 已又換關：丟棄遲到的貼圖
      const cur = _gr.material.map;
      if (cur) { t.offset.copy(cur.offset); t.repeat.copy(cur.repeat); }
      _gr.material.map = t; _gr.material.needsUpdate = true;
      this.groundTex = t;
    });
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, 0, -70);
    this.scene.add(this.ground);
    this.scene.background = new THREE.Color(this.stage.sky);
    this.scene.fog = new THREE.Fog(this.stage.sky, 42, 135);
    this.stars.visible = this.stage.theme === 'night';
    for (const p of this.props) { this.scene.remove(p); disposeGroup(p); }
    this.props = [];
    for (let k = 0; k < 24; k++) this.props.push(this._newProp(true));
    const dn = (DIFFICULTIES[this.diffId] || DIFFICULTIES.normal).name;
    this.ui.setStage(`${this.stage.name} · ${dn}`);
  }

  // ---------- 輸入 ----------
  _key(e, down) {
    if (e.repeat) return;
    this.keys[e.code] = down;
    if (!down) return;
    this.audio.init();
    if (e.code === 'KeyM') this.ui.toggleMute();
    if (e.code === 'KeyP' || e.code === 'Escape') this.ui.togglePause();
    if ((e.code === 'KeyX' || e.code === 'Space') && this.state === 'playing') this.tryBomb();
    if (e.code === 'Enter' && this.state === 'title') this.ui.startGame();
  }
  _bindPointer() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => {
      this.audio.init();
      if (this.state !== 'playing') return;
      this.dragging = true; el.setPointerCapture(e.pointerId);
      this._lastPX = e.clientX; this._lastPY = e.clientY;
      document.body.classList.add('touch');
    });
    el.addEventListener('pointermove', e => {
      if (!this.dragging || this.state !== 'playing') return;
      const dx = e.clientX - this._lastPX, dy = e.clientY - this._lastPY;
      this._lastPX = e.clientX; this._lastPY = e.clientY;
      const p = this.player;
      if (!p.alive) return;
      p.x = clamp(p.x + dx * 0.028, -7.6, 7.6);
      p.z = clamp(p.z + dy * 0.028, -2, 10);
      p.vx = dx * 0.9; p.vz = dy * 0.9;
    });
    const up = () => { this.dragging = false; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  _resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  // ---------- 流程 ----------
  startGame() {
    this.audio.init(); this.audio.stopMusic(); this.audio.startMusic(1);
    this.score = 0; this.loop = 1; this.chain = 0;
    this.player.lives = 3; this.player.bombs = 3; this.player.maxBombs = 5;
    this.weapons.reset();
    // 技能樹重置
    this.skills = {}; this.shields = 0; this.magnetLvl = 0;
    this.kills = 0; this.sinceChoice = 0; this.choiceQueued = false; this._pendingAdvance = null; this._pendingVictory = false;
    for (const wm of this.wingmen) { this.scene.remove(wm.mesh); disposeGroup(wm.mesh); }
    this.wingmen = [];
    for (const l of this.lightnings) this.scene.remove(l.line);
    this.lightnings = [];
    this._updateShieldMesh();
    this._applyDifficulty();
    this._clearField();
    this.setStage(0);
    this._beginStage();
    this.state = 'playing';
    this.ui.showHud(); this.ui.hideTitle(); this.ui.hideChoice(); this.ui.syncWeapon(this.weapons);
    this.ui.setScore(0); this.ui.setLives(3); this.ui.setBombs(3, 5);
    this._spawnPlayer(true);
  }
  _applyDifficulty() {
    const d = DIFFICULTIES[this.diffId] || DIFFICULTIES.normal;
    const l = this.loop;
    this.gameSpeed = d.speed * (1 + (l - 1) * 0.05);
    this.difficulty = {
      hp: d.hp * (1 + (l - 1) * 0.55),
      fireRate: Math.min(2.4, d.fireRate * (1 + (l - 1) * 0.18)),
      playerDmg: d.playerDmg,
      dmgTaken: d.dmgTaken,
      score: d.score,
    };
  }
  setDifficulty(id) {
    if (!DIFFICULTIES[id]) return;
    this.diffId = id;
    localStorage.setItem('ts3d_diff', id);
    this._applyDifficulty();
    const dn = (DIFFICULTIES[this.diffId] || DIFFICULTIES.normal).name;
    this.ui.setStage(`${this.stage.name} · ${dn}`);
    this.ui.syncDifficulty(id);
  }
  _clearField() {
    for (const e of this.enemies) { this.scene.remove(e.mesh); if (e.shadow) this.scene.remove(e.shadow); }
    for (const b of [...this.bullets, ...this.enemyBullets]) this.scene.remove(b.mesh);
    for (const it of this.items) this.scene.remove(it.mesh);
    for (const pl of this.plasmas) { this.scene.remove(pl.mesh); }
    for (const m of this.missiles) { this.scene.remove(m.mesh); }
    this.enemies = []; this.bullets = []; this.enemyBullets = []; this.plasmas = []; this.missiles = []; this.items = [];
    this.boss = null; this.bossMode = false; this.bombWave = null;
    this.weapons.clearBeams();
    this.ui.hideBoss();
  }
  _beginStage() {
    this.waveT = 0;
    this.waves = this.stage.waves(this);
    this.ui.banner(this.stage.bannerBig, this.stage.bannerSub);
    this.audio.setIntensity(1);
  }
  _spawnPlayer(fresh) {
    const p = this.player;
    p.x = 0; p.z = 7; p.vx = 0; p.vz = 0; p.alive = true;
    p.invuln = fresh ? 2 : 3;
    p.hp = p.maxHp; p.regenT = 0;
    this.ui.setHp(p.hp, p.maxHp);
    this._updateShieldMesh();
    this.playerMesh.visible = true;
  }
  onBossDown() {
    this.boss = null; this.bossMode = false;
    const bonus = 2000 * (this.stageIdx + 1) * this.loop;
    this.addScore(bonus, 0, -10);
    this.player.bombs = Math.min(this.player.maxBombs, this.player.bombs + 1); this.ui.setBombs(this.player.bombs, this.player.maxBombs);
    const advance = () => { if (this.stageIdx < 2) { this.setStage(this.stageIdx + 1); this._beginStage(); } };
    if (this.choiceQueued) {
      // 有排隊的選擇：等 STAGE CLEAR 橫幅播完再開選擇，選完才進下一關
      this.choiceQueued = false;
      this.ui.stageClear(this.stage.clearText, () => { this._pendingAdvance = advance; this.openChoice(); });
    } else {
      this.ui.stageClear(this.stage.clearText, advance);
    }
  }
  // ---------- 技能樹 ----------
  onKill() {
    this.kills++; this.sinceChoice++;
    if (this.sinceChoice >= 12 && this.state === 'playing') {
      if (this.bossMode) this.choiceQueued = true;
      else this.openChoice();
    }
  }
  openChoice() {
    const opts = buildChoices(this);
    this.state = 'choosing';
    this.weapons.clearBeams();
    this.ui.showChoice(opts, id => this.applyChoice(id));
    this.audio.powerup();
  }
  applyChoice(id) {
    const def = SKILL_DEFS.find(d => d.id === id) || { id: 'u_score', kind: 'bonus' };
    const w = this.weapons;
    this.skills[id] = (this.skills[id] || 0) + 1;
    if (def.kind === 'weapon') {
      w.setWeapon(def.wid);
      this.ui.banner(WEAPON_INFO[def.wid].name, '武器切換！', 1.4);
    } else if (def.kind === 'missile') {
      w.setMissile(def.mid);
      this.ui.banner(def.name, def.desc, 1.4);
    } else if (id === 'u_level') w.addLevel();
    else if (id === 'u_dmg') w.dmgMul *= 1.2;
    else if (id === 'u_rate') w.rateMul *= 1.12;
    else if (id === 'u_crit') w.crit += 0.10;
    else if (id === 'u_shield') { this.shields = Math.min(3, this.shields + 1); this._updateShieldMesh(); }
    else if (id === 'u_wing') this.addWingman();
    else if (id === 'u_magnet') this.magnetLvl++;
    else if (id === 'u_bomb') { this.player.maxBombs = Math.min(7, this.player.maxBombs + 1); this.player.bombs = this.player.maxBombs; this.ui.setBombs(this.player.bombs, this.player.maxBombs); }
    else if (id === 'u_life') { this.player.lives = Math.min(5, this.player.lives + 1); this.ui.setLives(this.player.lives); this.player.hp = this.player.maxHp; }
    else if (id === 'u_score') this.addScore(5000, this.player.x, this.player.z);
    // 每次選擇都回復部分血量
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
    this.player.regenT = 0;
    this.ui.setHp(this.player.hp, this.player.maxHp);
    this.audio.powerup();
    this.ui.syncWeapon(w);
    this.ui.hideChoice();
    this.sinceChoice = 0;
    this.state = 'playing';
    // 選擇後待辦：進下一關 / 顯示勝利
    if (this._pendingAdvance) { const f = this._pendingAdvance; this._pendingAdvance = null; f(); }
    else if (this._pendingVictory) {
      this._pendingVictory = false;
      this.state = 'victory'; this.ui.showVictory(this.score); this.audio.stopMusic();
      if (this.score > this.hi) { this.hi = this.score; localStorage.setItem('ts3d_hi', this.hi); }
    }
  }
  _updateShieldMesh() {
    this.shieldMesh.visible = this.shields > 0 && this.player.alive;
  }
  addWingman() {
    if (this.wingmen.length >= 2) return;
    const d = makeDrone();
    this.scene.add(d.group);
    this.wingmen.push({ mesh: d.group, side: this.wingmen.length === 0 ? -1 : 1, cd: Math.random() * 0.3 });
  }
  _updateWingmen(dt) {
    const p = this.player;
    for (const wm of this.wingmen) {
      const tx = p.x + wm.side * 2.8, tz = p.z + 1.4;
      wm.mesh.position.x += (tx - wm.mesh.position.x) * Math.min(1, dt * 6);
      wm.mesh.position.z += (tz - wm.mesh.position.z) * Math.min(1, dt * 6);
      wm.mesh.position.y = p.y + Math.sin(performance.now() * 0.004 + wm.side) * 0.15;
      wm.mesh.rotation.y = Math.sin(performance.now() * 0.002) * 0.1;
      if (!p.alive) continue;
      wm.cd -= dt;
      if (wm.cd <= 0) {
        wm.cd = 0.34 / this.weapons.rateMul;
        this.spawnBullet({ x: wm.mesh.position.x, y: wm.mesh.position.y, z: wm.mesh.position.z - 1,
          vx: 0, vz: -55, dmg: (1.5 + this.weapons.level * 0.2) * this.weapons.dmgMul, r: 0.45, color: 0x9fe8ff });
      }
    }
  }
  spawnLightning(x1, y1, z1, x2, y2, z2, color = 0xffee55) {
    const pts = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const jx = (Math.random() - .5) * 1.6 * (i > 0 && i < n ? 1 : 0);
      pts.push(new THREE.Vector3(x1 + (x2 - x1) * t + jx, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t + (Math.random() - .5) * 1.6 * (i > 0 && i < n ? 1 : 0)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(line);
    this.lightnings.push({ line, life: 0.22 });
  }
  _updateLightning(dt) {
    for (const l of this.lightnings) {
      l.life -= dt;
      l.line.material.opacity = Math.max(0, l.life / 0.22);
      if (l.life <= 0) { this.scene.remove(l.line); l.line.geometry.dispose(); l.line.material.dispose(); }
    }
    this.lightnings = this.lightnings.filter(l => l.life > 0);
  }
  onFinalBossDown() {
    this.boss = null; this.bossMode = false;
    this.addScore(20000 * this.loop, 0, -10);
    const showVic = () => {
      this.state = 'victory';
      this.ui.showVictory(this.score);
      this.audio.stopMusic();
      if (this.score > this.hi) { this.hi = this.score; localStorage.setItem('ts3d_hi', this.hi); }
    };
    if (this.choiceQueued) {
      // 尾王戰中排隊的選擇：先選完再顯示勝利
      this.choiceQueued = false;
      this._pendingVictory = true;
      this.openChoice();
    } else showVic();
  }
  nextLoop() {
    this.loop++; this._applyDifficulty();
    this.ui.hideVictory(); this.setStage(0); this._beginStage();
    this.state = 'playing'; this.audio.startMusic(1);
    if (!this.player.alive) this._spawnPlayer(true);
  }
  gameOver() {
    this.state = 'gameover';
    this.audio.stopMusic();
    this.ui.showGameOver(this.score);
    if (this.score > this.hi) { this.hi = this.score; localStorage.setItem('ts3d_hi', this.hi); this.ui.setHi(this.hi); }
  }
  toTitle() {
    this._clearField(); this.state = 'title';
    this.player.alive = false; this.playerMesh.visible = false;
    this.setStage(0, true);
    this.ui.showTitle(this.hi); this.ui.hideHud();
    this.audio.stopMusic();
  }
  togglePause(force) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    const toPause = force !== undefined ? force : this.state === 'playing';
    if (toPause && this.state === 'playing') { this.state = 'paused'; this.ui.showPause(); }
    else if (!toPause && this.state === 'paused') { this.state = 'playing'; this.ui.hidePause(); this.clock.getDelta(); }
  }

  // ---------- 生成 ----------
  spawnEnemy(kind, x, z, opts) {
    if (this.enemies.length > 80) return null;
    x += this.routeX(this.routeDist) * 0.5; // 波次跟著路線走
    const e = new Enemy(this, kind, x, z, opts);
    this.enemies.push(e); return e;
  }
  _getBullet() {
    let b = this._bulletPool.pop();
    if (!b) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 1.3), MB(0x9fe8ff));
      const halo = glowSprite(0x66ccff, 1.4); mesh.add(halo);
      mesh.visible = false; this.scene.add(mesh);
      b = { mesh };
    }
    b.mesh.visible = true; return b;
  }
  spawnBullet(o) {
    const b = this._getBullet();
    const pdmg = this.difficulty.playerDmg || 1;
    Object.assign(b, { x: o.x, y: o.y, z: o.z, vx: o.vx, vz: o.vz, dmg: o.dmg * pdmg, r: o.r || 0.5, dead: false, life: 2.2, pierce: !!o.pierce, _hitSet: null });
    b.mesh.material.color.set(o.color || 0x9fe8ff);
    b.mesh.children[0].material.color.set(o.color || 0x66ccff);
    const s = o.scale || 1;
    b.mesh.scale.set(s, s, o.scale ? s * 1.4 : 1);
    b.mesh.position.set(o.x, o.y, o.z);
    b.mesh.rotation.y = Math.atan2(o.vx, -o.vz);
    this.bullets.push(b);
  }
  spawnPlasma(o) {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), MB(o.tint || 0xd9a8ff));
    mesh.add(core);
    const halo = glowSprite(o.haloTint || 0xb45eff, o.tesla ? 4.2 : 3.2); mesh.add(halo);
    mesh.position.set(o.x, o.y, o.z); this.scene.add(mesh);
    const pl = Object.assign({ mesh, dead: false, life: 2.4, r: 0.9, tesla: false, chains: 0 }, o);
    pl.dmg = (o.dmg || 0) * (this.difficulty.playerDmg || 1);
    this.plasmas.push(pl);
  }
  spawnMissile(o) {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.1, 6), MB(0xffe9a8));
    body.rotation.x = Math.PI / 2; mesh.add(body);
    const halo = glowSprite(o.cluster ? 0xffe066 : o.rocket ? 0xffb066 : o.homing ? 0x7bff9e : 0xff9d2e, 1.2); mesh.add(halo);
    mesh.position.set(o.x, o.y, o.z); this.scene.add(mesh);
    const mm = Object.assign({ mesh, dead: false, life: 4, r: 0.6, t: 0, tx: 0, tz: 0 }, o);
    mm.dmg = (o.dmg || 0) * (this.difficulty.playerDmg || 1);
    this.missiles.push(mm);
  }
  _getEB() {
    let b = this._ebPool.pop();
    if (!b) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), MB(0xff4455));
      const halo = glowSprite(0xff2244, 1.7); mesh.add(halo);
      mesh.visible = false; this.scene.add(mesh);
      b = { mesh };
    }
    b.mesh.visible = true; return b;
  }
  spawnEnemyBullet(o) {
    if (this.state !== 'playing' || this.enemyBullets.length > 420) return;
    const b = this._getEB();
    Object.assign(b, { x: o.x, y: o.y || 2.2, z: o.z, vx: o.vx, vy: o.vy || 0, vz: o.vz, r: o.r || 0.55, dead: false, life: 9 });
    b.mesh.position.set(b.x, b.y, b.z);
    this.enemyBullets.push(b);
  }
  dropItem(x, z, kind) { if (this.items.length < 24) this.items.push(new Item(this, kind, x, z)); }
  randomDrop() {
    // 武器/飛彈改由技能選擇取得；只掉炸彈、勳章、稀有 1UP
    const t = ['bomb', 'medal', 'medal', 'medal', 'bomb', 'medal', 'oneup'];
    return t[(Math.random() * t.length) | 0];
  }
  collectItem(kind, x, z) {
    const ui = this.ui;
    this.particles.spark(x, 2.2, z, 0xffffff, 10, 8);
    this.rings.spawn(x, 1.4, z, 0xffffff, 3, 0.4);
    if (kind === 'bomb') { this.player.bombs = Math.min(this.player.maxBombs, this.player.bombs + 1); this.audio.pickup(); ui.setBombs(this.player.bombs, this.player.maxBombs); }
    else if (kind === 'medal') { this.addScore(Math.round(500 * (1 + Math.min(this.chain, 50) * 0.04)), x, z); this.audio.pickup(); }
    else if (kind === 'oneup') { this.player.lives = Math.min(5, this.player.lives + 1); this.audio.oneUp(); ui.setLives(this.player.lives); ui.banner('1UP', '戰機增加！', 1.4); }
  }

  // ---------- 計分 / 連擊 ----------
  addScore(n, x, z) {
    this.score += Math.round(n * (this.difficulty.score || 1));
    if (this.score > this.hi) { this.hi = this.score; this.ui.setHi(this.hi); }
    this.ui.setScore(this.score);
  }
  chainHit() {
    this.chain++; this.chainT = 3;
    this.ui.setChain(this.chain);
  }

  // ---------- 戰鬥 ----------
  laserDamage(x, y, z, dx, dz, dmg, width) {
    dmg *= (this.difficulty.playerDmg || 1);
    for (const e of this.enemies) {
      const ex = e.x - x, ez = e.z - z;
      const t = ex * dx + ez * dz;
      if (t < -2 || t > 72) continue;
      const px = x + dx * t, pz = z + dz * t;
      const d = Math.hypot(e.x - px, e.z - pz);
      if (d < width / 2 + e.r) { e.hurt(dmg, e.x, e.z); this.audio.hit(); }
    }
    if (this.boss && !this.boss.dead) {
      const b = this.boss, ex = b.x - x, ez = b.z - z;
      const t = ex * dx + ez * dz;
      if (t > -2 && t < 72) {
        const d = Math.hypot(b.x - (x + dx * t), b.z - (z + dz * t));
        if (d < width / 2 + b.r) { b.hurt(dmg, b.x, b.z + 2); this.audio.hit(); }
      }
    }
  }
  tryBomb() {
    const p = this.player;
    if (!p.alive || p.bombs <= 0 || this.bombWave) return;
    p.bombs--; this.ui.setBombs(p.bombs);
    this.weapons.bomb(this);
  }
  // 玩家受傷（血量制；護盾優先抵擋）
  hurtPlayer(dmg) {
    const p = this.player;
    if (!p.alive || p.invuln > 0) return;
    if (this.shields > 0) {
      this.shields--; this._updateShieldMesh();
      p.invuln = Math.max(p.invuln, 1.2);
      this.particles.spark(p.x, p.y, p.z, 0x66ccff, 18, 11);
      this.rings.spawn(p.x, p.y - 1, p.z, 0x66ccff, 5, 0.5);
      this.audio.pickup();
      return;
    }
    p.hp -= dmg * (this.difficulty.dmgTaken || 1); p.regenT = 4;
    this.ui.setHp(p.hp, p.maxHp);
    this.ui.damageFlash(); this.shake.add(0.28);
    this.audio.hit();
    if (p.hp <= 0) { p.hp = 0; this.ui.setHp(0, p.maxHp); this.killPlayer(); }
  }
  killPlayer() {
    const p = this.player;
    if (!p.alive || p.invuln > 0) return;
    p.alive = false; this.playerMesh.visible = false;
    this.shieldMesh.visible = false;
    this.particles.explosion(p.x, p.y, p.z, 2.4);
    this.booms.spawn(p.x, p.y, p.z, 2.8);
    this.rings.spawn(p.x, 1, p.z, 0x66ccff, 10, 0.8);
    this.audio.playerDown(); this.shake.add(0.8);
    this.ui.damageFlash();
    this.weapons.clearBeams();
    p.lives--; this.ui.setLives(Math.max(0, p.lives));
    this.chain = 0; this.ui.setChain(0);
    this.weapons.onDeath(); this.ui.syncWeapon(this.weapons);
    if (p.lives > 0) { p.respawnT = 1.6; }
    else setTimeout(() => this.gameOver(), 1400);
  }

  // ---------- 主迴圈 ----------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'title') this._attract(dt);
    // 'choosing' / 'paused'：凍結遊戲邏輯，只渲染
    this.particles.update(this.state === 'paused' || this.state === 'choosing' ? 0 : dt);
    this.booms.update(this.state === 'paused' || this.state === 'choosing' ? 0 : dt);
    this.rings.update(this.state === 'paused' || this.state === 'choosing' ? 0 : dt);
    this.shake.update(dt);
    this._updateCamera(dt);
    // 地面捲動（標題也捲；遊戲速度隨難度）
    if (this.state !== 'paused' && this.groundTex) {
      const sd = this.scrollSpeed * this.gameSpeed * dt;
      this.groundTex.offset.y -= sd / 22;
      // 彎曲路線：地面貼圖橫向跟著路線走
      const rx0 = this.routeX(this.routeDist);
      this.routeDist += sd;
      const rx1 = this.routeX(this.routeDist);
      this.groundTex.offset.x = -rx1 / 22;
      this._routeDX = rx1 - rx0;
    }
    this.renderer.render(this.scene, this.camera);
  }
  _attract(dt) {
    this.attractT -= dt;
    if (this.attractT <= 0) {
      this.attractT = 1.6;
      const kinds = ['scout', 'weaver', 'ace'];
      this.spawnEnemy(kinds[(Math.random() * 3) | 0], (Math.random() - .5) * 14, -60);
    }
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter(e => !e.dead && e.z <= 14);
    this._scrollWorld(dt);
    this.camera.position.x = Math.sin(performance.now() * 0.0001) * 3;
  }
  // 彎曲路線：捲動距離 -> 橫向偏移（世界單位），每關不同彎法
  routeX(d) {
    const r = this.stage && this.stage.route;
    if (!r) return 0;
    return r[0] * Math.sin(d * r[1] + r[2]) + r[3] * Math.sin(d * r[4] + r[5]);
  }
  _scrollWorld(dt) {
    const rdx = this._routeDX || 0; // 路線橫向位移：建築跟著彎
    for (const p of this.props) { p.position.z += this.scrollSpeed * dt; p.position.x += rdx; if (p.position.z > 16) { this.scene.remove(p); disposeGroup(p); this.props.splice(this.props.indexOf(p), 1); this.props.push(this._newProp(false)); } }
    for (const c of this.clouds) { c.position.z += this.scrollSpeed * 0.55 * dt; c.position.x += rdx * 0.55; if (c.position.z > 20) this._resetCloud(c, false); }
  }
  _updateCamera(dt) {
    this.camera.position.set(
      this.camBase.x + this.player.x * 0.22 + this.shake.ox,
      this.camBase.y + this.shake.oy,
      this.camBase.z);
    if (this.state !== 'title') this.camera.position.x += 0; // attract 另外處理
    this.camera.lookAt(this.camLook);
    if (this.state === 'title') this.camera.position.x = Math.sin(performance.now() * 0.00012) * 4;
  }

  update(dt) {
    const p = this.player, ui = this.ui;
    const wdt = dt * this.gameSpeed; // 世界 dt：敵方移動/開火、捲動、敵彈都吃遊戲速度
    // ---- 波次 ----
    if (!this.bossMode) {
      this.waveT += dt;
      while (this.waves.length && this.waves[0].t <= this.waveT) this.waves.shift().fn();
    }
    this._scrollWorld(wdt);
    // ---- 玩家 ----
    if (p.alive) {
      this._movePlayer(dt);
      p.invuln = Math.max(0, p.invuln - dt);
      this.playerMesh.visible = p.invuln <= 0 || (performance.now() * 0.02 | 0) % 2 === 0;
      this.weapons.fire(dt);
      // 脫戰回血
      if (p.regenT > 0) p.regenT -= dt;
      else if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 7 * dt); this.ui.setHp(p.hp, p.maxHp); }
      // 護盾跟隨
      if (this.shields > 0) {
        this.shieldMesh.position.set(p.x, p.y, p.z);
        this.shieldMesh.material.opacity = 0.13 + Math.sin(performance.now() * 0.006) * 0.05;
      }
      this._updateWingmen(dt);
      this.engGlows.forEach((gl, i) => { const s = 1.3 + Math.random() * 0.7; gl.scale.set(s, s, 1); });
      // 引擎尾焰
      if (Math.random() < 0.6) this.particles.trail(p.x + (Math.random() - .5) * 0.6, p.y - 0.1, p.z + 1.9, 0x55bbff, 0.55, 0.3, 0.4);
    } else if (p.lives > 0 && this.state === 'playing') {
      p.respawnT -= dt;
      if (p.respawnT <= 0) this._spawnPlayer(false);
    }
    this.playerMesh.position.set(p.x, p.y, p.z);
    this.playerMesh.rotation.z = clamp(-p.vx * 0.05, -0.65, 0.65);
    this.playerMesh.rotation.x = clamp(p.vz * 0.03, -0.3, 0.3);
    this.playerShadow.position.set(p.x, 0.06, p.z);
    this.playerShadow.visible = p.alive;

    // ---- 實體更新 ----
    for (const e of this.enemies) e.update(wdt);
    if (this.boss && !this.boss.dead) this.boss.update(wdt);
    for (const it of this.items) it.update(wdt);
    this._updateBullets(dt);
    this._updatePlasmas(dt);
    this._updateMissiles(dt);
    this._updateBurns(dt);
    this._updateLightning(dt);
    this._collide();

    // 炸彈波
    if (this.bombWave) {
      const bw = this.bombWave; bw.t += dt;
      const k = Math.min(1, bw.t / bw.dur);
      const rad = bw.maxR * (1 - Math.pow(1 - k, 2));
      bw.hit = bw.hit || new Set();
      const dmgAll = e => { if (!bw.hit.has(e) && Math.hypot(e.x - p.x, e.z - p.z) < rad + e.r) { bw.hit.add(e); e.hurt(90 * (this.difficulty.playerDmg || 1), e.x, e.z); } };
      this.enemies.forEach(dmgAll);
      if (this.boss && !this.boss.dead) dmgAll(this.boss);
      if (Math.random() < 0.8) this.particles.explosion(p.x + (Math.random() - .5) * rad, 1.5, p.z + (Math.random() - .5) * rad, 0.9);
      if (Math.random() < 0.5) this.booms.spawn(p.x + (Math.random() - .5) * rad, 1.5, p.z + (Math.random() - .5) * rad, 1.3);
      if (k >= 1) this.bombWave = null;
    }
    if (this.flashBomb > 0) { this.flashBomb -= dt; }

    // 連擊衰減
    if (this.chainT > 0) { this.chainT -= dt; if (this.chainT <= 0) { this.chain = 0; ui.setChain(0); } }

    // 清理
    this.enemies = this.enemies.filter(e => !e.dead);
    this.items = this.items.filter(i => !i.dead);
    for (let i = this.bullets.length - 1; i >= 0; i--) if (this.bullets[i].dead) { const b = this.bullets[i]; b.mesh.visible = false; this._bulletPool.push(b); this.bullets.splice(i, 1); }
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) if (this.enemyBullets[i].dead) { const b = this.enemyBullets[i]; b.mesh.visible = false; this._ebPool.push(b); this.enemyBullets.splice(i, 1); }
    this.plasmas = this.plasmas.filter(pl => !pl.dead);
    this.missiles = this.missiles.filter(m => !m.dead);
  }

  _movePlayer(dt) {
    const p = this.player, sp = 17;
    let ax = 0, az = 0;
    if (this.keys.KeyLeft || this.keys.KeyA) ax -= 1;
    if (this.keys.KeyRight || this.keys.KeyD) ax += 1;
    if (this.keys.KeyUp || this.keys.KeyW) az -= 1;
    if (this.keys.KeyDown || this.keys.KeyS) az += 1;
    if (!this.dragging) {
      p.vx = ax * sp; p.vz = az * sp;
      p.x = clamp(p.x + p.vx * dt, -7.6, 7.6);
      p.z = clamp(p.z + p.vz * dt, -2, 10);
    } else { p.vx *= 0.85; p.vz *= 0.85; }
  }

  _updateBullets(dt) {
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      if (b.life <= 0 || b.z < -70) b.dead = true;
      b.mesh.position.set(b.x, b.y, b.z);
    }
    const wdt = dt * this.gameSpeed; // 敵彈速度吃遊戲速度
    for (const b of this.enemyBullets) {
      b.x += b.vx * wdt; b.y += b.vy * wdt; b.z += b.vz * wdt; b.life -= wdt;
      if (b.life <= 0 || b.z > 16 || Math.abs(b.x) > 20 || b.y < -2) b.dead = true;
      b.mesh.position.set(b.x, b.y, b.z);
    }
  }
  _updatePlasmas(dt) {
    for (const pl of this.plasmas) {
      pl.x += pl.vx * dt; pl.z += pl.vz * dt; pl.life -= dt;
      pl.mesh.position.set(pl.x, pl.y, pl.z);
      const s = 1 + Math.sin(performance.now() * 0.02) * 0.15;
      pl.mesh.scale.set(s, s, s);
      if (Math.random() < 0.7) this.particles.trail(pl.x, pl.y, pl.z, pl.tesla ? 0xffee55 : 0xb45eff, 0.7, 0.35, 0.8);
      if (pl.life <= 0 || pl.z < -65) {
        if (pl.tesla) { this._teslaDischarge(pl); pl.dead = true; }
        else { this._plasmaBoom(pl); pl.dead = true; }
      }
    }
  }
  _teslaDischarge(pl) {
    // 閃電鏈：從電弧球位置跳向最近的敵人，連鎖傳導
    const targets = this.enemies.filter(e => !e.dead);
    if (this.boss && !this.boss.dead) targets.push(this.boss);
    targets.sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z));
    let fx = pl.x, fy = pl.y, fz = pl.z, n = 0;
    for (const e of targets) {
      if (n >= pl.chains) break;
      if (Math.hypot(e.x - fx, e.z - fz) > 17) continue;
      const ey = e.y || 2.4;
      this.spawnLightning(fx, fy, fz, e.x, ey, e.z);
      this.particles.spark(e.x, ey, e.z, 0xffee55, 8, 9);
      e.hurt(pl.dmg, e.x, e.z);
      fx = e.x; fy = ey; fz = e.z; n++;
    }
    this.audio.explosion(false);
    this.scene.remove(pl.mesh); disposeGroup(pl.mesh);
  }
  _plasmaBoom(pl) {
    const g = this;
    this.particles.explosion(pl.x, pl.y, pl.z, 1.5, [0xc07bff, 0x8a3bff, 0xffccff]);
    this.rings.spawn(pl.x, Math.max(0.4, pl.y - 1), pl.z, 0xc07bff, pl.aoe, 0.4);
    this.audio.explosion(false); this.shake.add(0.18);
    const hit = e => { const d = Math.hypot(e.x - pl.x, e.z - pl.z); if (d < pl.aoe + e.r) e.hurt(pl.dmg * (d < e.r + 1 ? 1 : 0.6), e.x, e.z); };
    this.enemies.forEach(hit);
    if (this.boss && !this.boss.dead) hit(this.boss);
    this.scene.remove(pl.mesh); disposeGroup(pl.mesh);
  }
  _updateMissiles(dt) {
    for (const m of this.missiles) {
      m.t += dt;
      // 分裂飛彈：升空後分裂為 3 枚追蹤彈
      if (m.cluster && !m.split && m.t > 0.45) {
        m.split = true;
        for (const s of [-1, 1]) {
          this.spawnMissile({ x: m.x + s * 0.5, y: m.y, z: m.z,
            vx: s * 14, vz: -20, dmg: m.dmg * 0.7, homing: true });
        }
        m.homing = true; m.cluster = false; m.dmg *= 0.7;
        this.particles.spark(m.x, m.y, m.z, 0xffe066, 10, 8);
      }
      if (m.homing) {
        let best = null, bd = 46;
        for (const e of this.enemies) { const d = Math.hypot(e.x - m.x, e.z - m.z); if (d < bd && e.z < m.z + 6) { bd = d; best = e; } }
        if (!best && this.boss && !this.boss.dead) best = this.boss;
        if (best) { m.tx = best.x; m.tz = best.z; }
        const dx = m.tx - m.x, dz = m.tz - m.z, d = Math.hypot(dx, dz) || 1;
        const want = Math.atan2(dx, -dz);
        const cur = Math.atan2(m.vx, -m.vz);
        let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const na = cur + clamp(da, -5 * dt, 5 * dt), sp = 38;
        m.vx = Math.sin(na) * sp; m.vz = -Math.cos(na) * sp;
        m.mesh.rotation.y = na;
        if (best && bd < 1.6) { this._missileBoom(m); m.dead = true; continue; }
      } else {
        if (Math.random() < 0.8) this.particles.trail(m.x, m.y, m.z + 0.7, 0xff9d2e, 0.55, 0.3, 0.4);
      }
      m.x += m.vx * dt; m.z += m.vz * dt; m.life -= dt;
      m.mesh.position.set(m.x, m.y, m.z);
      // 命中
      for (const e of this.enemies) {
        if (Math.hypot(e.x - m.x, e.z - m.z) < e.r + 0.7) { this._missileBoom(m); m.dead = true; break; }
      }
      if (!m.dead && this.boss && !this.boss.dead && Math.hypot(this.boss.x - m.x, this.boss.z - m.z) < this.boss.r + 0.7) { this._missileBoom(m); m.dead = true; }
      if (m.life <= 0 || m.z < -68) m.dead = true;
      if (m.dead && m.mesh.parent) { this.scene.remove(m.mesh); disposeGroup(m.mesh); }
    }
  }
  _missileBoom(m) {
    const aoe = m.napalm ? 3.2 : m.rocket ? 1.8 : 1.9;
    this.particles.explosion(m.x, m.y, m.z, m.napalm ? 1.3 : 0.9, m.napalm ? [0xff9d2e, 0xff5511, 0xffdd66] : m.rocket ? [0xffb066, 0xffdd66] : [0x7bff9e, 0xfff2cc]);
    if (m.napalm) { this.burns.push({ x: m.x, z: m.z, t: 3 }); this.rings.spawn(m.x, 0.4, m.z, 0xff9d2e, aoe, 0.5); }
    this.audio.explosion(false);
    const hit = e => { const d = Math.hypot(e.x - m.x, e.z - m.z); if (d < aoe + e.r) e.hurt(m.dmg * (m.napalm && !e.air ? 1.6 : 1), e.x, e.z); };
    this.enemies.forEach(hit);
    if (this.boss && !this.boss.dead) hit(this.boss);
  }
  _updateBurns(dt) {
    for (const b of this.burns) {
      b.t -= dt;
      if (Math.random() < 0.5) this.particles.spawn(b.x + (Math.random() - .5) * 3, 0.4, b.z + (Math.random() - .5) * 3,
        (Math.random() - .5) * 2, 3 + Math.random() * 3, (Math.random() - .5) * 2, 0.5, 0.9, 0xff7b2e, 2);
      for (const e of this.enemies) {
        if (!e.air && Math.hypot(e.x - b.x, e.z - b.z) < 3.4) e.hurt(9 * dt, e.x, e.z);
      }
    }
    this.burns = this.burns.filter(b => b.t > 0);
  }

  _collide() {
    const p = this.player;
    // 玩家子彈 vs 敵人
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.x - b.x, dz = e.z - b.z;
        if (dx * dx + dz * dz < (e.r + b.r) * (e.r + b.r)) {
          e.hurt(b.dmg, b.x, b.z); this.audio.hit();
          if (b.pierce) { b._hitSet = b._hitSet || new Set(); if (b._hitSet.has(e)) continue; b._hitSet.add(e); continue; }
          b.dead = true; break;
        }
      }
      if (!b.dead && this.boss && !this.boss.dead) {
        const bo = this.boss, dx = bo.x - b.x, dz = bo.z - b.z;
        if (dx * dx + dz * dz < (bo.r + b.r) * (bo.r + b.r)) {
          bo.hurt(b.dmg, b.x, b.z); this.audio.hit();
          if (!b.pierce) b.dead = true;
        }
      }
    }
    // 電漿 / 特斯拉 vs 敵人
    for (const pl of this.plasmas) {
      if (pl.dead) continue;
      if (pl.tesla) {
        // 電弧球碰到敵人即放電
        let touched = false;
        for (const e of this.enemies) {
          if (!e.dead && Math.hypot(e.x - pl.x, e.z - pl.z) < e.r + pl.r) { touched = true; break; }
        }
        if (!touched && this.boss && !this.boss.dead && Math.hypot(this.boss.x - pl.x, this.boss.z - pl.z) < this.boss.r + pl.r) touched = true;
        if (touched) { this._teslaDischarge(pl); pl.dead = true; }
        continue;
      }
      let hitAny = false;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (Math.hypot(e.x - pl.x, e.z - pl.z) < e.r + pl.r) {
          e.hurt(pl.dmg, pl.x, pl.z); hitAny = true;
          this.particles.explosion(pl.x, pl.y, pl.z, 0.8, [0xc07bff, 0xffccff]); break;
        }
      }
      if (!hitAny && this.boss && !this.boss.dead && Math.hypot(this.boss.x - pl.x, this.boss.z - pl.z) < this.boss.r + pl.r) {
        this.boss.hurt(pl.dmg, pl.x, pl.z);
        this.particles.explosion(pl.x, pl.y, pl.z, 0.8, [0xc07bff, 0xffccff]);
      }
    }
    if (!p.alive) return;
    const pr = 0.55;
    // 敵彈 vs 玩家
    if (p.invuln <= 0) {
      for (const b of this.enemyBullets) {
        if (b.dead) continue;
        const dx = b.x - p.x, dz = b.z - p.z;
        if (dx * dx + dz * dz < (pr + b.r) * (pr + b.r) && Math.abs(b.y - p.y) < 2.4) {
          b.dead = true; this.hurtPlayer(22); break;
        }
      }
    }
    // 撞擊
    if (p.invuln <= 0 && p.alive) {
      const targets = this.boss && !this.boss.dead ? [...this.enemies, this.boss] : this.enemies;
      for (const e of targets) {
        if (e.dead) continue;
        const dx = e.x - p.x, dz = e.z - p.z, rr = e.r * 0.85 + pr;
        if (dx * dx + dz * dz < rr * rr) { e.hurt(60 * (this.difficulty.playerDmg || 1), p.x, p.z); this.hurtPlayer(34); break; }
      }
    }
  }
}

// ================= 關卡定義 =================
function line(g, kind, n, x0, dx, z, opts) { for (let i = 0; i < n; i++) g.spawnEnemy(kind, x0 + i * dx, z - Math.abs(i - (n - 1) / 2) * 2, opts); }
function vee(g, kind, n, cx, z) { for (let i = 0; i < n; i++) { const k = i - (n - 1) / 2; g.spawnEnemy(kind, cx + k * 3, z - Math.abs(k) * 3); } }

const STAGES = [
  {
    name: 'STAGE 1 · 黃昏都市', theme: 'city', sky: 0x241a38,
    route: [7, 0.009, 0, 3, 0.023, 1.7], // 彎曲路線：[A1,f1,p1,A2,f2,p2]
    bannerBig: 'STAGE 1', bannerSub: '黃昏都市 — 作戰開始', clearText: '黃昏都市制壓！',
    waves(g) {
      return [
        { t: 1.5, fn: () => line(g, 'scout', 5, -6, 3, -50) },
        { t: 7, fn: () => vee(g, 'scout', 5, 0, -50) },
        { t: 12, fn: () => g.spawnEnemy('carrier', 0, -55) },
        { t: 17, fn: () => line(g, 'weaver', 4, -5, 3.4, -52) },
        { t: 24, fn: () => line(g, 'tank', 4, -6, 4, -58) },
        { t: 30, fn: () => { g.spawnEnemy('gunship', -3, -55); vee(g, 'scout', 3, 4, -52); } },
        { t: 37, fn: () => g.spawnEnemy('carrier', 3, -55) },
        { t: 42, fn: () => line(g, 'ace', 4, -6, 4, -55) },
        { t: 50, fn: () => { line(g, 'weaver', 5, -6.5, 3.2, -52); line(g, 'tank', 3, -4, 4, -60); } },
        { t: 58, fn: () => { g.spawnEnemy('gunship', 3, -56); g.spawnEnemy('gunship', -4, -60); } },
        { t: 66, fn: () => vee(g, 'ace', 5, 0, -54) },
        { t: 72, fn: () => { g.spawnEnemy('carrier', -2, -55); line(g, 'scout', 4, -4.5, 3, -52); } },
        { t: 78, fn: () => {
            g.bossMode = true; g.boss = new Midboss(g, 1);;
            g.audio.setIntensity(2);
          } },
      ];
    },
  },
  {
    name: 'STAGE 2 · 沙漠風暴', theme: 'desert', sky: 0x8fb8d8,
    route: [10, 0.010, 0.5, 4, 0.023, 2.9],
    bannerBig: 'STAGE 2', bannerSub: '沙漠風暴 — 敵軍增援', clearText: '沙漠空域確保！',
    waves(g) {
      return [
        { t: 1.5, fn: () => vee(g, 'ace', 4, 0, -52) },
        { t: 6, fn: () => line(g, 'tank', 5, -7, 3.5, -58) },
        { t: 11, fn: () => line(g, 'weaver', 6, -8, 3.2, -52) },
        { t: 18, fn: () => { g.spawnEnemy('gunship', 0, -55); line(g, 'turret', 3, -5, 5, -58); } },
        { t: 25, fn: () => g.spawnEnemy('carrier', -3, -55) },
        { t: 30, fn: () => vee(g, 'scout', 7, 0, -52) },
        { t: 37, fn: () => { line(g, 'ace', 5, -7, 3.5, -54); line(g, 'tank', 4, -6, 4, -60); } },
        { t: 45, fn: () => { g.spawnEnemy('gunship', -4, -56); g.spawnEnemy('gunship', 4, -60); } },
        { t: 52, fn: () => g.spawnEnemy('carrier', 2, -55) },
        { t: 57, fn: () => line(g, 'weaver', 7, -9, 3, -52) },
        { t: 64, fn: () => { line(g, 'turret', 4, -6, 4, -58); vee(g, 'ace', 4, 0, -54); } },
        { t: 72, fn: () => { g.spawnEnemy('gunship', 0, -56); line(g, 'scout', 5, -6, 3, -52); } },
        { t: 80, fn: () => {
            g.bossMode = true; g.boss = new Midboss(g, 2);;
            g.audio.setIntensity(2);
          } },
      ];
    },
  },
  {
    name: 'STAGE 3 · 午夜要塞', theme: 'night', sky: 0x04060f,
    route: [6, 0.014, 2.0, 3.5, 0.031, 0.6],
    bannerBig: 'FINAL STAGE', bannerSub: '午夜要塞 — 決戰', clearText: '',
    waves(g) {
      return [
        { t: 1.5, fn: () => vee(g, 'ace', 5, 0, -52) },
        { t: 7, fn: () => line(g, 'turret', 4, -6, 4, -58) },
        { t: 13, fn: () => { line(g, 'weaver', 6, -8, 3.2, -52); g.spawnEnemy('gunship', 3, -56); } },
        { t: 21, fn: () => g.spawnEnemy('carrier', 0, -55) },
        { t: 26, fn: () => { vee(g, 'scout', 6, -2, -52); vee(g, 'scout', 6, 2, -58); } },
        { t: 34, fn: () => { line(g, 'tank', 5, -7, 3.5, -58); line(g, 'ace', 4, -6, 4, -54); } },
        { t: 42, fn: () => { g.spawnEnemy('gunship', -4, -56); g.spawnEnemy('gunship', 4, -60); g.spawnEnemy('carrier', 0, -62); } },
        { t: 52, fn: () => line(g, 'weaver', 8, -10, 2.8, -52) },
        { t: 60, fn: () => { line(g, 'turret', 5, -8, 4, -58); vee(g, 'ace', 5, 0, -54); } },
        { t: 68, fn: () => { g.spawnEnemy('gunship', 0, -55); g.spawnEnemy('gunship', -5, -60); g.spawnEnemy('gunship', 5, -60); } },
        { t: 76, fn: () => g.spawnEnemy('carrier', -2, -55) },
        { t: 82, fn: () => {
            g.bossMode = true; g.boss = new FinalBoss(g);;
          } },
      ];
    },
  },
];
