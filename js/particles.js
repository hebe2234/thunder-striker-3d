// 粒子池 / 衝擊波環 / 螢幕震動
import * as THREE from 'three';
import { glowTexture } from './models.js';

export class Particles {
  constructor(scene, max = 2600) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.life0 = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 1.0, map: glowTexture(), vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
    this._c = new THREE.Color();
  }
  spawn(x, y, z, vx, vy, vz, life, size, color, grav = 0) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = (Math.random() * this.max) | 0; // 滿了就覆寫隨機舊粒子
    this.pos[i*3] = x; this.pos[i*3+1] = y; this.pos[i*3+2] = z;
    this.vel[i*3] = vx; this.vel[i*3+1] = vy; this.vel[i*3+2] = vz;
    this.life[i] = this.life0[i] = life; this.size[i] = size; this.grav[i] = grav;
    this._c.set(color);
    this.col[i*3] = this._c.r; this.col[i*3+1] = this._c.g; this.col[i*3+2] = this._c.b;
  }
  explosion(x, y, z, scale = 1, palette = [0xffdd66, 0xff8c2e, 0xff4d2e, 0x888888]) {
    const n = Math.floor(26 * scale) + 8;
    for (let k = 0; k < n; k++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const sp = (4 + Math.random() * 14) * scale;
      const c = palette[(Math.random() * palette.length) | 0];
      this.spawn(x, y, z,
        Math.sin(ph) * Math.cos(th) * sp, Math.abs(Math.cos(ph)) * sp * 0.9, Math.sin(ph) * Math.sin(th) * sp,
        0.5 + Math.random() * 0.7, (0.5 + Math.random() * 0.9) * scale, c, -6);
    }
    // 火光閃
    for (let k = 0; k < 6; k++)
      this.spawn(x, y, z, 0, 2, 0, 0.18, 3.2 * scale, 0xfff2cc, 0);
  }
  trail(x, y, z, color, size = 0.5, life = 0.35, spread = 1) {
    this.spawn(x + (Math.random()-.5)*spread, y + (Math.random()-.5)*spread, z + (Math.random()-.5)*spread,
      (Math.random()-.5)*2, (Math.random()-.5)*2, (Math.random()-.5)*2 + 6, life, size, color, 0);
  }
  spark(x, y, z, color = 0xffee88, n = 8, sp = 12) {
    for (let k = 0; k < n; k++) {
      const th = Math.random() * Math.PI * 2;
      this.spawn(x, y, z, Math.cos(th)*sp*Math.random(), Math.random()*sp*0.7, Math.sin(th)*sp*Math.random(),
        0.3 + Math.random()*0.3, 0.45, color, -14);
    }
  }
  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      this.vel[i*3+1] += this.grav[i] * dt;
      this.pos[i*3] += this.vel[i*3] * dt;
      this.pos[i*3+1] += this.vel[i*3+1] * dt;
      this.pos[i*3+2] += this.vel[i*3+2] * dt;
      if (this.pos[i*3+1] < 0.05 && this.vel[i*3+1] < 0) { this.pos[i*3+1] = 0.05; this.vel[i*3+1] *= -0.4; }
      if (i !== w) {
        for (let k = 0; k < 3; k++) {
          this.pos[w*3+k] = this.pos[i*3+k]; this.vel[w*3+k] = this.vel[i*3+k]; this.col[w*3+k] = this.col[i*3+k];
        }
        this.life[w] = this.life[i]; this.life0[w] = this.life0[i]; this.size[w] = this.size[i]; this.grav[w] = this.grav[i];
      }
      w++;
    }
    this.n = w;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}

export class Rings {
  constructor(scene, max = 24) {
    this.pool = [];
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 6;
      scene.add(m);
      this.pool.push({ m, t: 0, dur: 0, r0: 0, r1: 0, active: false });
    }
  }
  spawn(x, y, z, color, r1, dur = 0.6, r0 = 0.5) {
    const r = this.pool.find(p => !p.active) || this.pool[0];
    r.active = true; r.t = 0; r.dur = dur; r.r0 = r0; r.r1 = r1;
    r.m.visible = true; r.m.position.set(x, y, z);
    r.m.material.color.set(color); r.m.material.opacity = 0.9;
  }
  update(dt) {
    for (const r of this.pool) {
      if (!r.active) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const rad = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 3));
      r.m.scale.set(rad, rad, 1);
      r.m.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { r.active = false; r.m.visible = false; }
    }
  }
}

export class Shake {
  constructor() { this.trauma = 0; this.ox = 0; this.oy = 0; }
  add(a) { this.trauma = Math.min(1, this.trauma + a); }
  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * 1.6;
    this.ox = (Math.random() * 2 - 1) * s; this.oy = (Math.random() * 2 - 1) * s;
  }
}
