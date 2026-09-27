// 敵人 / BOSS / 道具實體
import * as THREE from 'three';
import { makeScout, makeWeaver, makeAce, makeTank, makeTurret, makeGunship, makeCarrier,
  makeMidboss, makeBoss, makeItemSprite, itemStyle, blobShadow, glowSprite } from './models.js';

export function disposeGroup(g) {
  g.traverse(o => {
    if (o.isMesh) { o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.dispose()); }
    if (o.isSprite) { o.material.dispose(); } // 貼圖共用快取，不 dispose texture
  });
}

const STATS = {
  scout:   { hp: 4,  r: 1.1, score: 100, air: true },
  weaver:  { hp: 9,  r: 1.3, score: 150, air: true },
  ace:     { hp: 7,  r: 1.0, score: 200, air: true },
  tank:    { hp: 14, r: 1.5, score: 120, air: false },
  turret:  { hp: 11, r: 1.3, score: 150, air: false },
  gunship: { hp: 55, r: 2.2, score: 500, air: true },
  carrier: { hp: 34, r: 2.0, score: 300, air: true },
  missile: { hp: 3,  r: 0.8, score: 50,  air: true },
};

export class Enemy {
  constructor(game, kind, x, z, opts = {}) {
    this.game = game; this.kind = kind;
    const st = STATS[kind];
    this.hp = this.maxHp = Math.round(st.hp * game.difficulty.hp * (opts.hpMul || 1));
    this.r = st.r; this.score = st.score; this.air = st.air;
    this.x = x; this.z = z; this.x0 = x;
    this.y = st.air ? (opts.y || 2.4 + Math.random() * 1.6) : 0.9;
    this.t = Math.random() * 10; this.fireT = 0.8 + Math.random() * 1.6;
    this.dead = false; this.flashT = 0;
    this.vx = 0; this.vz = 0;
    const builders = { scout: makeScout, weaver: makeWeaver, ace: makeAce, tank: makeTank,
      turret: makeTurret, gunship: makeGunship, carrier: makeCarrier };
    const built = builders[kind] ? builders[kind]() : { group: new THREE.Group() }; // missile 由 spawnEnemyHomingMissile 另建
    this.mesh = built.group; this.head = built.head || null;
    this.mesh.position.set(x, this.y, z);
    if (kind === 'missile') { /* boss用，另建 */ }
    game.scene.add(this.mesh);
    if (st.air) { this.shadow = blobShadow(this.r * 2.2); game.scene.add(this.shadow); }
    // homing missile 專用
    this.homing = opts.homing || false;
    this.seed = Math.random() * 100;
  }
  get px() { return this.x; }
  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    const S = g.scrollSpeed;
    switch (this.kind) {
      case 'scout':
        this.vz = 8.5; this.vx = THREE.MathUtils.clamp((p.x - this.x) * 0.9, -6, 6);
        break;
      case 'weaver':
        this.vz = 5.5; this.x = this.x0 + Math.sin(this.t * 2.3) * 5; this.vx = 0;
        this.mesh.rotation.z = Math.cos(this.t * 2.3) * 0.5;
        break;
      case 'ace':
        this.vz = 21; this.vx = THREE.MathUtils.clamp((p.x - this.x) * 2.2, -14, 14);
        break;
      case 'tank': case 'turret':
        this.vz = S; this.vx = 0;
        break;
      case 'gunship':
        this.vz = 3.2; this.x = this.x0 + Math.sin(this.t * 0.9) * 3; this.vx = 0;
        break;
      case 'carrier':
        this.vz = 7; this.vx = Math.sin(this.t * 0.6) * 2;
        break;
      case 'missile':
        this.vz = 10;
        if (this.homing && p.alive) {
          const dx = p.x - this.x, dz = (p.z - 4) - this.z;
          const d = Math.hypot(dx, dz) || 1;
          this.vx += (dx / d * 30 - this.vx) * Math.min(1, dt * 3);
          this.vz += (dz / d * 30 - this.vz) * Math.min(1, dt * 3);
        }
        g.particles.trail(this.x, this.y, this.z + 0.8, 0xff8844, 0.6, 0.3, 0.5);
        break;
    }
    this.x += this.vx * dt; this.z += this.vz * dt;
    if (!this.air && this.head) this.head.rotation.y = Math.atan2(p.x - this.x, p.z - this.z);
    if (this.air) this.mesh.rotation.z = THREE.MathUtils.clamp(-this.vx * 0.06, -0.6, 0.6);

    // 開火
    this.fireT -= dt;
    const ahead = this.z < p.z - 3 && this.z > -52;
    if (this.fireT <= 0 && ahead && p.alive && !g.bossMode) {
      const mul = g.difficulty.fireRate;
      if (this.kind === 'scout') { this.aimedShot(15); this.fireT = (1.8 + Math.random()) / mul; }
      else if (this.kind === 'weaver') { this.spreadShot(3, 16, 0.35); this.fireT = (2.4 + Math.random()) / mul; }
      else if (this.kind === 'ace') { this.aimedShot(20); this.aimedShot(20); this.fireT = (1.4 + Math.random() * 0.8) / mul; }
      else if (this.kind === 'tank') { this.aimedShot(14); this.fireT = (2.2 + Math.random()) / mul; }
      else if (this.kind === 'turret') { for (let i = 0; i < 3; i++) setTimeout(() => !this.dead && this.aimedShot(16), i * 140); this.fireT = (3 + Math.random()) / mul; }
      else if (this.kind === 'gunship') { this.spreadShot(5, 14, 0.5); this.fireT = (2.8 + Math.random()) / mul; }
    }
    // 出界
    if (this.z > 14 || Math.abs(this.x) > 26) this.remove(true);

    this.mesh.position.set(this.x, this.y + (this.air ? Math.sin(this.t * 3) * 0.12 : 0), this.z);
    if (this.shadow) { this.shadow.position.set(this.x, 0.06, this.z); }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.setFlash(false); }
  }
  aimedShot(speed) {
    const g = this.game, p = g.player;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) || 1;
    // 預判一點點
    g.spawnEnemyBullet({ x: this.x, y: this.y, z: this.z,
      vx: dx / d * speed + p.vx * 0.25, vz: dz / d * speed, r: 0.55 });
    g.audio.enemyShoot();
  }
  spreadShot(n, speed, spread) {
    const g = this.game, p = g.player;
    const base = Math.atan2(p.x - this.x, p.z - this.z);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      g.spawnEnemyBullet({ x: this.x, y: this.y, z: this.z,
        vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, r: 0.55 });
    }
    g.audio.enemyShoot();
  }
  setFlash(on) {
    this.mesh.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(on ? 0xaaaaaa : 0x000000); });
  }
  hurt(dmg, hx, hz) {
    if (this.dead) return;
    this.hp -= dmg; this.flashT = 0.07; this.setFlash(true);
    this.game.particles.spark(hx, this.y, hz, 0xffee88, 4, 8);
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return; this.dead = true;
    const g = this.game;
    const big = this.kind === 'gunship' || this.kind === 'carrier';
    g.particles.explosion(this.x, this.y, this.z, big ? 1.8 : 1.0);
    g.rings.spawn(this.x, Math.max(0.3, this.y - 1), this.z, 0xffaa33, big ? 6 : 3.5, 0.45);
    g.audio.explosion(big);
    g.shake.add(big ? 0.35 : 0.12);
    g.addScore(this.score, this.x, this.z);
    g.chainHit();
    g.onKill(this);
    // 掉落（武器/飛彈改由技能選擇取得，不再掉球）
    const roll = Math.random();
    if (this.kind === 'carrier') g.dropItem(this.x, this.z, 'bomb');
    else if (this.kind === 'gunship' && roll < 0.5) g.dropItem(this.x, this.z, g.randomDrop());
    else if (roll < 0.07) g.dropItem(this.x, this.z, 'medal');
    this.remove();
  }
  remove(silent) { this.dead = true; this.game.scene.remove(this.mesh); if (this.shadow) this.game.scene.remove(this.shadow); disposeGroup(this.mesh); }
}

// 敵方追蹤飛彈（BOSS用）
export function spawnEnemyHomingMissile(game, x, z) {
  const e = new Enemy(game, 'missile', x, z, { homing: true, y: 2.6, hpMul: 1 });
  game.scene.remove(e.mesh); disposeGroup(e.mesh);
  const g = new THREE.Group();
  const bodyM = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x883333, roughness: .5, metalness: .5, flatShading: true }));
  bodyM.rotation.x = Math.PI / 2; g.add(bodyM);
  const gl = glowSprite(0xff6622, 1.2); gl.position.z = 0.9; g.add(gl);
  e.mesh = g; e.y = 2.6; game.scene.add(g);
  return e;
}

// ================= 道具 =================
const _itemTex = {};
function itemTexture(kind) {
  if (_itemTex[kind]) return _itemTex[kind];
  const s = makeItemSprite(kind);
  _itemTex[kind] = s.material.map; // 快取貼圖
  return _itemTex[kind];
}
export class Item {
  constructor(game, kind, x, z) {
    this.game = game; this.kind = kind;
    this.x = x; this.z = z; this.y = 2.2; this.t = Math.random() * 5;
    this.dead = false;
    const tex = itemTexture(kind);
    this.mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.mesh.scale.set(1.9, 1.9, 1);
    game.scene.add(this.mesh);
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    this.z += g.scrollSpeed * 0.35 * dt;
    this.y = 2.2 + Math.sin(this.t * 3) * 0.35;
    this.mesh.material.rotation += dt * 1.5;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    const magnetR = 7 + g.magnetLvl * 7;
    if (p.alive && d < magnetR) { const sp = 26 + g.magnetLvl * 10; this.x += dx / d * sp * dt; this.z += dz / d * sp * dt; }
    if (p.alive && d < 1.7) { this.collect(); return; }
    if (this.z > 13) this.remove();
    this.mesh.position.set(this.x, this.y, this.z);
  }
  collect() {
    if (this.dead) return; this.dead = true;
    this.game.collectItem(this.kind, this.x, this.z);
    this.remove();
  }
  remove() { this.game.scene.remove(this.mesh); this.mesh.material.dispose(); }
}

// ================= 中BOSS：鐵鷲 =================
export class Midboss {
  constructor(game, tier = 1) {
    this.game = game; this.isBoss = true; this.kind = 'midboss';
    this.tier = tier;
    this.maxHp = Math.round((tier === 1 ? 950 : 1500) * game.difficulty.hp);
    this.hp = this.maxHp; this.r = 3.4;
    this.x = 0; this.z = -58; this.y = 3.2; this.t = 0;
    this.dead = false; this.flashT = 0; this.entered = false;
    this.atkT = 2.5; this.atkKind = 0;
    const built = makeMidboss();
    this.mesh = built.group; this.core = built.core;
    game.scene.add(this.mesh);
    this.shadow = blobShadow(9); game.scene.add(this.shadow);
    game.ui.setBoss(tier === 1 ? '鐵鷲 · IRON VULTURE' : '鐵鷲改 · IRON VULTURE KAI', 1);
    game.audio.warning();
    game.ui.banner('⚠ 警 告 ⚠', '大型空中目標接近中');
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    if (!this.entered) { this.z += 14 * dt; if (this.z >= -33) { this.z = -33; this.entered = true; } }
    else this.x = Math.sin(this.t * 0.55) * 5.5;
    this.core.material.rotation += dt * 2;
    // 攻擊循環
    this.atkT -= dt;
    if (this.atkT <= 0 && this.entered && p.alive) {
      this.atkKind = (this.atkKind + 1) % 3;
      if (this.atkKind === 0) { // 瞄準三連
        for (let i = 0; i < 3; i++) setTimeout(() => { if (!this.dead) this.aimed(17); }, i * 180);
        this.atkT = 2.2 / g.difficulty.fireRate;
      } else if (this.atkKind === 1) { // 扇形
        const base = Math.atan2(p.x - this.x, p.z - this.z);
        for (let i = 0; i < 7; i++) {
          const a = base + (i - 3) * 0.22;
          g.spawnEnemyBullet({ x: this.x, y: this.y, z: this.z + 2, vx: Math.sin(a) * 15, vz: Math.cos(a) * 15, r: 0.6 });
        }
        g.audio.enemyShoot(); this.atkT = 2.8 / g.difficulty.fireRate;
      } else { // 召喚僚機
        for (const s of [-1, 1]) g.spawnEnemy('scout', this.x + s * 6, this.z - 6);
        this.atkT = 3.4 / g.difficulty.fireRate;
      }
    }
    this.mesh.position.set(this.x, this.y + Math.sin(this.t * 1.7) * 0.25, this.z);
    this.mesh.rotation.z = Math.cos(this.t * 0.55) * 0.08;
    this.shadow.position.set(this.x, 0.06, this.z);
    g.ui.setBoss(null, this.hp / this.maxHp);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.setFlash(false); }
  }
  aimed(speed) {
    const g = this.game, p = g.player;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz) || 1;
    for (const s of [-1.5, 1.5])
      g.spawnEnemyBullet({ x: this.x + s, y: this.y, z: this.z + 2, vx: dx / d * speed, vz: dz / d * speed, r: 0.6 });
    g.audio.enemyShoot();
  }
  setFlash(on) { this.mesh.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(on ? 0x777777 : 0x000000); }); }
  hurt(dmg, hx, hz) {
    if (this.dead) return;
    this.hp -= dmg; this.flashT = 0.06; this.setFlash(true);
    this.game.particles.spark(hx, this.y + 0.5, hz, 0xffee88, 5, 9);
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return; this.dead = true;
    const g = this.game;
    g.audio.bossDie(); g.shake.add(1);
    // 連環爆炸
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        const ox = (Math.random() - .5) * 8, oz = (Math.random() - .5) * 8;
        g.particles.explosion(this.x + ox, this.y, this.z + oz, 1.6);
        g.audio.explosion(true);
      }, i * 160);
    }
    setTimeout(() => {
      g.particles.explosion(this.x, this.y, this.z, 3.2);
      g.rings.spawn(this.x, 1, this.z, 0xffcc66, 16, 0.9);
      g.scene.remove(this.mesh); g.scene.remove(this.shadow); disposeGroup(this.mesh);
      g.addScore(this.tier === 1 ? 10000 : 15000, this.x, this.z);
      // 掉落雨
      const drops = ['bomb', 'bomb', 'medal', 'medal', 'medal', 'medal'];
      drops.forEach((k, i) => setTimeout(() => g.dropItem(this.x + (Math.random() - .5) * 8, this.z + (Math.random() - .5) * 6, k), i * 120));
      g.onBossDown();
    }, 1700);
    g.ui.hideBoss();
  }
  remove() {}
}

// ================= 最終BOSS：暴風要塞 =================
export class FinalBoss {
  constructor(game) {
    this.game = game; this.isBoss = true; this.kind = 'finalboss';
    this.maxHp = Math.round(2800 * game.difficulty.hp);
    this.hp = this.maxHp; this.r = 5.2;
    this.x = 0; this.z = -60; this.y = 3.4; this.t = 0;
    this.dead = false; this.flashT = 0; this.entered = false;
    this.phase = 1; this.atkT = 3; this.sweepT = 0; this.sweepDir = 1; this.sweepX = 0;
    const built = makeBoss();
    this.mesh = built.group; this.turrets = built.turrets; this.pods = built.pods;
    this.core = built.core; this.coreShell = built.coreShell;
    game.scene.add(this.mesh);
    this.shadow = blobShadow(16); game.scene.add(this.shadow);
    game.ui.setBoss('暴風要塞 · STORM FORTRESS', 1);
    game.audio.warning();
    game.ui.banner('⚠ 最終警告 ⚠', '暴風要塞出現 — 擊破核心！');
    game.audio.setIntensity(2);
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.t += dt;
    if (!this.entered) { this.z += 12 * dt; if (this.z >= -36) { this.z = -36; this.entered = true; } }
    else this.x = Math.sin(this.t * 0.4) * 4;
    const frac = this.hp / this.maxHp;
    const newPhase = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1;
    if (newPhase !== this.phase) {
      this.phase = newPhase;
      g.ui.banner(newPhase === 2 ? '第二階段' : '核心露出！', newPhase === 2 ? '飛彈莢艙全開' : '集中火力攻擊核心');
      g.audio.warning(); g.shake.add(0.5);
      if (newPhase === 3) { this.core.visible = true; }
    }
    // 炮塔轉向玩家
    for (const tr of this.turrets) tr.rotation.y = Math.atan2(p.x - (this.x + tr.position.x), p.z - (this.z + tr.position.z));
    this.atkT -= dt;
    if (this.atkT <= 0 && this.entered && p.alive && !this.dead) {
      const fr = g.difficulty.fireRate;
      if (this.phase === 1) {
        this.turretVolley(15); this.fanSpread(5, 14); this.atkT = 2.6 / fr;
      } else if (this.phase === 2) {
        this.turretVolley(16);
        for (const s of [-1, 1]) { const e = spawnEnemyHomingMissile(g, this.x + s * 5.6, this.z); g.enemies.push(e); }
        this.rotFan(); this.atkT = 3.2 / fr;
      } else {
        this.turretVolley(18); this.fanSpread(7, 16);
        this.sweepT = 2.2; this.sweepDir = Math.random() < 0.5 ? -1 : 1; this.sweepX = -this.sweepDir * 8;
        this.atkT = 3.6 / fr;
      }
    }
    // P3 掃射雷射（預警線→傷害）
    if (this.sweepT > 0) {
      this.sweepT -= dt;
      this.sweepX += this.sweepDir * dt * 14;
      const lx = this.x + this.sweepX;
      g.particles.trail(lx, 1.2, p.z - 6, 0xff2266, 1.4, 0.25, 0.4); // 預警
      if (this.sweepT <= 1.2 && Math.abs(p.x - lx) < 1.1 && p.invuln <= 0 && p.alive) g.hurtPlayer(30);
      if (this.sweepT <= 0) g.particles.explosion(lx, 1, p.z - 6, 1.2, [0xff2266, 0xff88aa]);
    }
    this.mesh.position.set(this.x, this.y + Math.sin(this.t * 1.2) * 0.2, this.z);
    this.shadow.position.set(this.x, 0.06, this.z);
    g.ui.setBoss(null, frac);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.setFlash(false); }
  }
  turretVolley(speed) {
    const g = this.game, p = g.player;
    for (const tr of this.turrets) {
      const wx = this.x + tr.position.x, wz = this.z + tr.position.z;
      const dx = p.x - wx, dz = p.z - wz, d = Math.hypot(dx, dz) || 1;
      g.spawnEnemyBullet({ x: wx, y: 2.2, z: wz, vx: dx / d * speed, vz: dz / d * speed, r: 0.6 });
    }
    g.audio.enemyShoot();
  }
  fanSpread(n, speed) {
    const g = this.game, p = g.player;
    const base = Math.atan2(p.x - this.x, p.z - this.z);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.24;
      g.spawnEnemyBullet({ x: this.x, y: this.y, z: this.z + 3, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, r: 0.6 });
    }
    g.audio.enemyShoot();
  }
  rotFan() {
    const g = this.game;
    const base = this.t * 1.3;
    for (let i = 0; i < 10; i++) {
      const a = base + i * (Math.PI * 2 / 10);
      g.spawnEnemyBullet({ x: this.x, y: this.y, z: this.z + 2, vx: Math.sin(a) * 11, vz: Math.cos(a) * 11, r: 0.6 });
    }
    g.audio.enemyShoot();
  }
  setFlash(on) { this.mesh.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(on ? 0x666666 : 0x000000); }); }
  hurt(dmg, hx, hz) {
    if (this.dead) return;
    // P3 之前核心有裝甲減傷 30%
    this.hp -= dmg * (this.phase === 3 ? 1 : 0.85);
    this.flashT = 0.06; this.setFlash(true);
    this.game.particles.spark(hx, this.y + 0.6, hz, 0xffccff, 5, 9);
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return; this.dead = true;
    const g = this.game;
    g.audio.bossDie(); g.shake.add(1);
    for (let i = 0; i < 14; i++) {
      setTimeout(() => {
        const ox = (Math.random() - .5) * 12, oz = (Math.random() - .5) * 9;
        g.particles.explosion(this.x + ox, this.y, this.z + oz, 2.0);
        g.audio.explosion(true); g.shake.add(0.3);
      }, i * 150);
    }
    setTimeout(() => {
      g.particles.explosion(this.x, this.y, this.z, 4.5);
      g.rings.spawn(this.x, 1, this.z, 0xffcc66, 24, 1.2);
      g.rings.spawn(this.x, 1, this.z, 0xff66aa, 18, 1.0);
      g.scene.remove(this.mesh); g.scene.remove(this.shadow); disposeGroup(this.mesh);
      g.addScore(50000, this.x, this.z);
      g.audio.setIntensity(1);
      g.ui.hideBoss();
      g.onFinalBossDown();
    }, 2200);
  }
  remove() {}
}
