// 武器系統：6種主武器 + 3種飛彈 + 炸彈 + 技能樹
import * as THREE from 'three';
import { MB, glowSprite, PLAYER_GUN_X } from './models.js';
import { t } from './i18n.js';

export const WEAPON_INFO = {
  vulcan:  { name: t('weapon.vulcan'), color: '#ff5e5e' },
  laser:   { name: t('weapon.laser'), color: '#29c7ff' },
  plasma:  { name: t('weapon.plasma'), color: '#c07bff' },
  railgun: { name: t('weapon.railgun'), color: '#7dff9e' },
  rockets: { name: t('weapon.rockets'), color: '#ffb066' },
  tesla:   { name: t('weapon.tesla'), color: '#fff066' },
};
export const MISSILE_INFO = {
  homing:  { name: t('missile.homing') },
  napalm:  { name: t('missile.napalm') },
  cluster: { name: t('missile.cluster') },
  none:    { name: t('missile.none') },
};

// ================= 技能樹 =================
export const SKILL_DEFS = [
  { id: 'w_railgun', kind: 'weapon', wid: 'railgun', icon: '🟢', name: t('skill.w_railgun.name'), desc: t('skill.w_railgun.desc') },
  { id: 'w_rockets', kind: 'weapon', wid: 'rockets', icon: '🟠', name: t('skill.w_rockets.name'), desc: t('skill.w_rockets.desc') },
  { id: 'w_tesla', kind: 'weapon', wid: 'tesla', icon: '⚡', name: t('skill.w_tesla.name'), desc: t('skill.w_tesla.desc') },
  { id: 'w_vulcan', kind: 'weapon', wid: 'vulcan', icon: '🔴', name: t('skill.w_vulcan.name'), desc: t('skill.w_vulcan.desc') },
  { id: 'w_laser', kind: 'weapon', wid: 'laser', icon: '🔵', name: t('skill.w_laser.name'), desc: t('skill.w_laser.desc') },
  { id: 'w_plasma', kind: 'weapon', wid: 'plasma', icon: '🟣', name: t('skill.w_plasma.name'), desc: t('skill.w_plasma.desc') },
  { id: 'm_homing', kind: 'missile', mid: 'homing', icon: '🎯', name: t('skill.m_homing.name'), desc: t('skill.m_homing.desc') },
  { id: 'm_napalm', kind: 'missile', mid: 'napalm', icon: '🔥', name: t('skill.m_napalm.name'), desc: t('skill.m_napalm.desc') },
  { id: 'm_cluster', kind: 'missile', mid: 'cluster', icon: '💥', name: t('skill.m_cluster.name'), desc: t('skill.m_cluster.desc') },
  { id: 'u_level', kind: 'upgrade', max: 99, icon: '⬆️', name: t('skill.u_level.name'), desc: t('skill.u_level.desc') },
  { id: 'u_dmg', kind: 'upgrade', max: 5, icon: '💢', name: t('skill.u_dmg.name'), desc: t('skill.u_dmg.desc') },
  { id: 'u_rate', kind: 'upgrade', max: 5, icon: '🚀', name: t('skill.u_rate.name'), desc: t('skill.u_rate.desc') },
  { id: 'u_crit', kind: 'upgrade', max: 3, icon: '🎯', name: t('skill.u_crit.name'), desc: t('skill.u_crit.desc') },
  { id: 'u_shield', kind: 'upgrade', max: 3, icon: '🛡️', name: t('skill.u_shield.name'), desc: t('skill.u_shield.desc') },
  { id: 'u_wing', kind: 'upgrade', max: 2, icon: '🛩️', name: t('skill.u_wing.name'), desc: t('skill.u_wing.desc') },
  { id: 'u_magnet', kind: 'upgrade', max: 2, icon: '🧲', name: t('skill.u_magnet.name'), desc: t('skill.u_magnet.desc') },
  { id: 'u_bomb', kind: 'upgrade', max: 2, icon: '💣', name: t('skill.u_bomb.name'), desc: t('skill.u_bomb.desc') },
  { id: 'u_life', kind: 'upgrade', max: 99, icon: '❤️', name: t('skill.u_life.name'), desc: t('skill.u_life.desc') },
];

// 切換語言時重填所有顯示文字（UI 由此重渲染）
export function localizeWeapons() {
  for (const [id, w] of Object.entries(WEAPON_INFO)) w.name = t('weapon.' + id);
  for (const [id, m] of Object.entries(MISSILE_INFO)) m.name = t('missile.' + id);
  for (const d of SKILL_DEFS) { d.name = t('skill.' + d.id + '.name'); d.desc = t('skill.' + d.id + '.desc'); }
}

export function buildChoices(game) {
  const w = game.weapons;
  const pool = [];
  for (const d of SKILL_DEFS) {
    if (d.kind === 'weapon' && d.wid === w.type) continue;
    if (d.kind === 'missile' && d.mid === w.missile) continue;
    if (d.kind === 'upgrade') {
      const lv = game.skills[d.id] || 0;
      if (lv >= d.max) continue;
      if (d.id === 'u_level' && w.level >= 8) continue;
      if (d.id === 'u_life' && game.player.lives >= 5) continue;
      if (d.id === 'u_shield' && game.shields >= 3) continue;
    }
    pool.push(d);
  }
  const picks = [];
  while (picks.length < 3 && pool.length) picks.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  while (picks.length < 3) picks.push({ id: 'u_score', kind: 'bonus', icon: '⭐', name: t('skill.u_score.name'), desc: t('skill.u_score.desc') });
  return picks;
}

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
    // 技能乘區
    this.dmgMul = 1; this.rateMul = 1; this.crit = 0;
  }
  setWeapon(t) { if (this.type !== t) { this.type = t; this.clearBeams(); } }
  setMissile(m) { this.missile = m; }
  addLevel() { this.level = Math.min(8, this.level + 1); }
  onDeath() { this.level = Math.max(1, this.level - 2); } // 被擊墜懲罰
  reset() { this.type = 'vulcan'; this.level = 1; this.missile = 'homing'; this.dmgMul = 1; this.rateMul = 1; this.crit = 0; this.clearBeams(); }
  clearBeams() { for (const b of this.beams) { this.game.scene.remove(b); } this.beams = []; }
  _critMul() { return Math.random() < this.crit ? 2 : 1; }

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
    // 側束從翼下機炮發射（不再憑空出現）
    const xoffs = want === 3 ? [-PLAYER_GUN_X, 0, PLAYER_GUN_X] : [0];
    const angles = want === 3 ? [-8, 0, 8] : [0];
    this.beams.forEach((b, i) => {
      b.userData.angle = angles[i] * Math.PI / 180;
      b.userData.xOff = xoffs[i];
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
        this.cd = 0.085 / this.rateMul;
        const dmg = (1 + this.level * 0.15) * this.dmgMul * this._critMul();
        const fan = VULCAN_FAN[this.level];
        for (const deg of fan) {
          const a = deg * Math.PI / 180;
          g.spawnBullet({ x: p.x, y: p.y, z: p.z - 1.6,
            vx: Math.sin(a) * 60, vz: -Math.cos(a) * 60,
            dmg, r: 0.5, color: 0x9fe8ff });
        }
        if (this.level >= 6) { // 側炮（從翼下機炮發射）
          for (const s of [-1, 1]) {
            const a = (this.level >= 8 ? s * 18 : 0) * Math.PI / 180;
            g.spawnBullet({ x: p.x + s * PLAYER_GUN_X, y: p.y, z: p.z - 1.0,
              vx: Math.sin(a) * 60, vz: -Math.cos(a) * 60,
              dmg: dmg * 0.8, r: 0.5, color: 0xffb066 });
          }
        }
        g.audio.shoot();
        g.particles.trail(p.x, p.y, p.z - 1.8, 0x9fe8ff, 0.5, 0.12, 0.6);
      }
    } else if (this.type === 'laser') {
      // 持續光束：每幀傷害（爆擊以期望值折入）
      const dps = (30 + this.level * 17) * this.dmgMul * (1 + this.crit);
      this._humT -= dt;
      if (this._humT <= 0) { this._humT = 0.14; g.audio.laserHum(); }
      for (const b of this.beams) {
        const a = b.userData.angle, xOff = b.userData.xOff || 0;
        const ox = p.x + xOff, oz = p.z - 1.6;
        const dx = Math.sin(a), dz = -Math.cos(a);
        b.position.set(ox + dx * 32, p.y, oz + dz * 32);
        b.rotation.y = a;
        g.laserDamage(ox, p.y - 0.3, oz, dx, dz, dps * dt, 0.5 + this.level * 0.14);
        if (Math.random() < 0.5) g.particles.trail(ox + dx * 6, p.y, oz + dz * 6, 0x66ddff, 0.6, 0.2, 1.2);
      }
    } else if (this.type === 'plasma') {
      if (this.cd <= 0) {
        this.cd = (0.52 - this.level * 0.02) / this.rateMul;
        const n = this.level >= 5 ? 3 : this.level >= 3 ? 2 : 1;
        const dmg = (9 + this.level * 3.2) * this.dmgMul * this._critMul();
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2);
          g.spawnPlasma({ x: p.x + off * 1.2, y: p.y, z: p.z - 1.6,
            vx: off * 7, vz: -30, dmg,
            aoe: 2.4 + this.level * 0.38, level: this.level });
        }
        g.audio.plasmaFire();
        g.shake.add(0.06);
      }
      this.clearBeamsIfNone();
    } else if (this.type === 'railgun') {
      if (this.cd <= 0) {
        this.cd = 0.95 / this.rateMul;
        const dmg = (34 + this.level * 11) * this.dmgMul * this._critMul();
        for (const s of [-1, 1]) {
          g.spawnBullet({ x: p.x + s * PLAYER_GUN_X, y: p.y, z: p.z - 1.6,
            vx: 0, vz: -110, dmg, r: 0.9, color: 0xaaffcc, scale: 2.6, pierce: true });
        }
        g.audio.plasmaFire(); g.shake.add(0.22);
        g.particles.trail(p.x, p.y, p.z - 2, 0xaaffcc, 0.9, 0.2, 1.2);
      }
      this.clearBeamsIfNone();
    } else if (this.type === 'rockets') {
      if (this.cd <= 0) {
        this.cd = 0.26 / this.rateMul;
        this.mslSide *= -1;
        const s = this.mslSide;
        const dmg = (4.5 + this.level * 0.9) * this.dmgMul * this._critMul();
        for (const dx of [-0.35, 0.35]) {
          g.spawnMissile({ x: p.x + s * 0.9 + dx, y: p.y - 0.3, z: p.z - 0.5,
            vx: s * 5 + dx * 12, vz: -58, dmg, homing: false, rocket: true, life: 2.4 });
        }
        g.audio.shoot();
      }
      this.clearBeamsIfNone();
    } else if (this.type === 'tesla') {
      if (this.cd <= 0) {
        this.cd = 0.55 / this.rateMul;
        const dmg = (7 + this.level * 2.6) * this.dmgMul * this._critMul();
        g.spawnPlasma({ x: p.x, y: p.y, z: p.z - 1.6, vx: 0, vz: -24,
          dmg, aoe: 0, level: this.level, tesla: true, life: 1.6,
          tint: 0xfff066, haloTint: 0xffee55, chains: 2 + ((this.level / 2) | 0) });
        g.audio.plasmaFire();
      }
      this.clearBeamsIfNone();
    }

    // 飛彈
    if (this.missile && this.missile !== 'none' && this.mslCd <= 0) {
      this.mslSide *= -1;
      const s = this.mslSide;
      const mdmg = (4 + this.level * 0.6) * this.dmgMul;
      if (this.missile === 'homing') {
        this.mslCd = 0.30 / this.rateMul;
        g.spawnMissile({ x: p.x + s * 1.1, y: p.y - 0.2, z: p.z + 0.4,
          vx: s * 8, vz: -6, dmg: mdmg, homing: true });
      } else if (this.missile === 'napalm') {
        this.mslCd = 0.36 / this.rateMul;
        g.spawnMissile({ x: p.x + s * 1.1, y: p.y - 0.2, z: p.z - 0.6,
          vx: 0, vz: -64, dmg: mdmg * 0.9, homing: false, napalm: true });
      } else if (this.missile === 'cluster') {
        this.mslCd = 0.55 / this.rateMul;
        g.spawnMissile({ x: p.x + s * 1.1, y: p.y - 0.2, z: p.z - 0.4,
          vx: s * 4, vz: -34, dmg: mdmg, homing: false, cluster: true });
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
