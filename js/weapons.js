// 武器系統：火神散射炮 / 雷射光束 / 電漿爆裂彈 + 追蹤/燃燒飛彈 + 炸彈
import * as THREE from 'three';
import { MB, glowSprite } from './models.js';

export const WEAPON_INFO = {
  vulcan: { name: '火神炮 VULCAN', color: '#ff5e5e' },
  laser:  { name: '雷射 LASER', color: '#29c7ff' },
  plasma: { name: '電漿 PLASMA', color: '#c07bff' },
};

// 每級散射角度（度）
const VULCAN_FAN = {
  1: [0], 2: [-3, 3], 3: [0, -7, 7], 4: [0, -6, 6, -13, 13],
  5: [0, -5, 5, -11, 11], 6: [0, -5, 5, -11, 11],
  7: [0, -4, 4, -9, 9, -15, 15], 8: [0, -4, 4, -9, 9, -15, 15],
};

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.type = 'vulcan';
    this.level = 1;
    this.missile = 'homing';
    this.cd = 0; this.mslCd = 0; this.mslSide = 1;
    this.beams = []; // laser 視覺
    this._humT = 0;
  }
  setWeapon(t) { if (this.type !== t) { this.type = t; this.level = Math.max(1, this.level - 0); this.clearBeams(); } }
  setMissile(m) { this.missile = m; }
  addLevel() { this.level = Math.min(8, this.level + 1); }
  onDeath() { this.level = Math.max(1, this.level - 2); } // 被擊墜懲罰
  clearBeams() { for (const b of this.beams) { this.game.scene.remove(b); } this.beams = []; }

  _beamMesh(width, color) {
    const geo = new THREE.BoxGeometry(width, width * 0.7, 70);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    const halo = glowSprite(color, width * 6);
    halo.position.z = -20; m.add(halo);
    m.renderOrder = 4;
    return m;
  }
  _syncBeams() {
    const want = this.type === 'laser' ? (this.level >= 3 ? 3 : 1) : 0;
    while (this.beams.length < want) { const b = this._beamMesh(0.5, 0x66ddff); this.game.scene.add(b); this.beams.push(b); }
    while (this.beams.length > want) { const b = this.beams.pop(); this.game.scene.remove(b); }
    const width = 0.45 + this.level * 0.14;
    this.beams.forEach((b, i) => {
      const angles = want === 3 ? [-8, 0, 8] : [0];
      b.userData.angle = angles[i] * Math.PI / 180;
      b.scale.x = b.scale.y = width / 0.5;
    });
  }

  fire(dt) {
    const g = this.game, p = g.player;
    if (!p || !p.alive) { this.clearBeams(); return; }
    this._syncBeams();
    this.cd -= dt; this.mslCd -= dt;

    if (this.type === 'vulcan') {
      if (this.cd <= 0) {
        this.cd = 0.085;
        const dmg = 1 + this.level * 0.15;
        const fan = VULCAN_FAN[this.level];
        for (const deg of fan) {
          const a = deg * Math.PI / 180;
          g.spawnBullet({ x: p.x, y: p.y, z: p.z - 1.6,
            vx: Math.sin(a) * 60, vz: -Math.cos(a) * 60,
            dmg, r: 0.5, color: 0x9fe8ff, kind: 'vulcan' });
        }
        if (this.level >= 6) { // 側炮
          for (const s of [-1, 1]) {
            const a = (this.level >= 8 ? s * 18 : 0) * Math.PI / 180;
            g.spawnBullet({ x: p.x + s * 1.9, y: p.y, z: p.z - 0.6,
              vx: Math.sin(a) * 60, vz: -Math.cos(a) * 60,
              dmg: dmg * 0.8, r: 0.5, color: 0xffb066, kind: 'vulcan' });
          }
        }
        g.audio.shoot();
        g.particles.trail(p.x, p.y, p.z - 1.8, 0x9fe8ff, 0.5, 0.12, 0.6);
      }
    } else if (this.type === 'laser') {
      // 持續光束：每幀傷害
      const dps = (30 + this.level * 17);
      this._humT -= dt;
      if (this._humT <= 0) { this._humT = 0.14; g.audio.laserHum(); }
      for (const b of this.beams) {
        const a = b.userData.angle;
        const dx = Math.sin(a), dz = -Math.cos(a);
        b.position.set(p.x + dx * 32, p.y, p.z - 1.6 + dz * 32);
        b.rotation.y = a;
        g.laserDamage(p.x, p.y - 0.3, p.z - 1.6, dx, dz, dps * dt, 0.5 + this.level * 0.14);
        if (Math.random() < 0.5) g.particles.trail(p.x + dx * 6, p.y, p.z - 1.6 + dz * 6, 0x66ddff, 0.6, 0.2, 1.2);
      }
    } else if (this.type === 'plasma') {
      if (this.cd <= 0) {
        this.cd = 0.52 - this.level * 0.02;
        const n = this.level >= 5 ? 3 : this.level >= 3 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2);
          g.spawnPlasma({ x: p.x + off * 1.2, y: p.y, z: p.z - 1.6,
            vx: off * 7, vz: -30, dmg: 9 + this.level * 3.2,
            aoe: 2.4 + this.level * 0.38, level: this.level });
        }
        g.audio.plasmaFire();
        g.shake.add(0.06);
      }
      this.clearBeamsIfNone();
    }

    // 飛彈
    if (this.missile && this.mslCd <= 0) {
      this.mslSide *= -1;
      const s = this.mslSide;
      if (this.missile === 'homing') {
        this.mslCd = 0.30;
        g.spawnMissile({ x: p.x + s * 1.1, y: p.y - 0.2, z: p.z + 0.4,
          vx: s * 8, vz: -6, dmg: 4 + this.level * 0.6, homing: true });
      } else {
        this.mslCd = 0.36;
        g.spawnMissile({ x: p.x + s * 1.1, y: p.y - 0.2, z: p.z - 0.6,
          vx: 0, vz: -64, dmg: 3.5 + this.level * 0.5, homing: false, napalm: true });
      }
    }
  }
  clearBeamsIfNone() { if (this.type !== 'laser') this.clearBeams(); }

  bomb(g) {
    // 衝擊波：半徑擴張傷害
    g.bombWave = { t: 0, dur: 1.25, maxR: 34 };
    g.rings.spawn(g.player.x, 1.2, g.player.z, 0xffcc66, 34, 1.25, 1);
    g.rings.spawn(g.player.x, 1.2, g.player.z, 0xff8833, 26, 1.0, 0.5);
    g.audio.bomb();
    g.shake.add(0.9);
    g.flashBomb = 0.35;
    // 清除敵彈
    for (const b of g.enemyBullets) {
      g.particles.spark(b.x, b.y, b.z, 0xffcc66, 3, 6);
      b.dead = true;
    }
    g.player.invuln = Math.max(g.player.invuln, 2.2);
  }
}
