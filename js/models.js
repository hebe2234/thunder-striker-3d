// 程序化 3D 模型：玩家戰機 / 敵機 / 地面單位 / BOSS / 道具 / 地景
import * as THREE from 'three';

export function M(color, o = {}) {
  return new THREE.MeshStandardMaterial(Object.assign(
    { color, roughness: 0.55, metalness: 0.45, flatShading: true }, o));
}
export function MB(color, o = {}) { // 自發光（子彈、光束用）
  return new THREE.MeshBasicMaterial(Object.assign({ color }, o));
}

const _texCache = {};
export function glowTexture() {
  if (_texCache.glow) return _texCache.glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _texCache.glow = new THREE.CanvasTexture(c); return _texCache.glow;
}
export function glowSprite(color, size = 1.6) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s;
}
export function shadowTexture() {
  if (_texCache.shadow) return _texCache.shadow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  _texCache.shadow = new THREE.CanvasTexture(c); return _texCache.shadow;
}
export function blobShadow(scale = 2.4) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(scale, scale),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
}

// ================= 玩家戰機 =================
export function makePlayer() {
  const g = new THREE.Group();
  const body = M(0x4a7fd6), dark = M(0x24407c), red = M(0xd83a3a), glass = M(0x0a1a3a, { roughness: 0.15, metalness: 0.9 });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.7, 6), body);
  nose.rotation.x = -Math.PI / 2; nose.position.z = -1.35; g.add(nose);
  const fus = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 2.4), body);
  fus.position.z = 0.1; g.add(fus);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.6), dark);
  spine.position.set(0, 0.4, 0.3); g.add(spine);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), glass);
  cockpit.scale.set(1, 0.7, 1.7); cockpit.position.set(0, 0.48, -0.35); g.add(cockpit);
  // 主翼（後掠）
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 1.05), body);
    w.position.set(s * 1.35, 0, 0.55); w.rotation.y = -s * 0.42; g.add(w);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), red);
    tip.position.set(s * 2.15, 0, 0.95); tip.rotation.y = -s * 0.42; g.add(tip);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.13, 0.2), red);
    stripe.position.set(s * 1.35, 0, 0.32); stripe.rotation.y = -s * 0.42; g.add(stripe);
    // 尾翼
    const hs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.5), dark);
    hs.position.set(s * 0.62, 0.28, 1.25); hs.rotation.y = -s * 0.3; g.add(hs);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.95, 0.8), red);
  fin.position.set(0, 0.6, 1.2); fin.rotation.x = 0.25; g.add(fin);
  // 翼下機炮（火神側炮 / 雷射側束的發射器）
  for (const s of [-1, 1]) {
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.25, 6), dark);
    gun.rotation.x = Math.PI / 2; gun.position.set(s * 1.35, -0.16, -0.35); g.add(gun);
    const tip = glowSprite(0x88ddff, 0.6); tip.position.set(s * 1.35, -0.16, -1.02); g.add(tip);
  }
  // 引擎
  const engGlows = [];
  for (const s of [-1, 1]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.8, 8), dark);
    eng.rotation.x = Math.PI / 2; eng.position.set(s * 0.48, -0.08, 1.35); g.add(eng);
    const gl = glowSprite(0x66ccff, 1.5); gl.position.set(s * 0.48, -0.08, 1.85); g.add(gl);
    engGlows.push(gl);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { group: g, engGlows };
}

// 僚機（玩家技能召喚的小型無人機）
export function makeDrone() {
  const g = new THREE.Group();
  const hull = M(0x3fa9f5), dark = M(0x1c4e80);
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), hull);
  body.scale.set(1, 0.55, 1.5); g.add(body);
  const eye = glowSprite(0x9fe8ff, 0.9); eye.position.set(0, 0.15, -0.3); g.add(eye);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.4), dark);
    w.position.set(s * 0.5, 0, 0.15); g.add(w);
  }
  const gl = glowSprite(0x66ccff, 0.8); gl.position.set(0, 0, 0.6); g.add(gl);
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { group: g };
}

// 機翼機炮的 X 座標（武器發射器對齊用）
export const PLAYER_GUN_X = 1.35;

// ================= 敵機 =================
export function makeScout() {
  const g = new THREE.Group();
  const hull = M(0x8a2f2f), dark = M(0x3a1c1c);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 5), hull);
  nose.rotation.x = Math.PI / 2; nose.position.z = 0.9; g.add(nose); // 朝玩家(+z)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 1.6), hull);
  g.add(body);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.7), dark);
    w.position.set(s * 1.0, 0.1, -0.2); w.rotation.y = s * 0.4; g.add(w);
  }
  const eye = glowSprite(0xff3333, 0.9); eye.position.set(0, 0.3, 0.3); g.add(eye);
  return { group: g };
}
export function makeWeaver() {
  const g = new THREE.Group();
  const hull = M(0x6a4a8a), dark = M(0x2e1c44);
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), hull);
  body.scale.set(1, 0.55, 1.5); g.add(body);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.1), dark);
    w.position.set(s * 1.05, 0, 0.1); g.add(w);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 6), hull);
    pod.rotation.x = Math.PI / 2; pod.position.set(s * 1.5, 0, 0.1); g.add(pod);
  }
  const eye = glowSprite(0xcc66ff, 1.0); eye.position.set(0, 0.35, -0.5); g.add(eye);
  return { group: g };
}
export function makeAce() {
  const g = new THREE.Group();
  const hull = M(0xc22a4a), dark = M(0x5c1224);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.0, 5), hull);
  nose.rotation.x = Math.PI / 2; nose.position.z = 1.0; g.add(nose);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 1.8), dark);
  g.add(body);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.55), hull);
    w.position.set(s * 1.0, 0.05, -0.45); w.rotation.y = s * 0.55; g.add(w);
  }
  return { group: g };
}
export function makeTank() {
  const g = new THREE.Group();
  const hull = M(0x5a6b3f), dark = M(0x333d22);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.4), hull);
  body.position.y = 0.55; g.add(body);
  for (const s of [-1, 1]) for (const f of [-1, 1]) {
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 8), dark);
    wh.rotation.z = Math.PI / 2; wh.position.set(s * 0.95, 0.34, f * 0.75); g.add(wh);
  }
  const head = new THREE.Group(); head.position.y = 1.0;
  const tur = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.2), dark);
  head.add(tur);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.6, 6), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.1; head.add(barrel);
  g.add(head);
  return { group: g, head };
}
export function makeTurret() {
  const g = new THREE.Group();
  const base = M(0x4a4a55), dark = M(0x26262e);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.7, 8), base);
  b.position.y = 0.35; g.add(b);
  const head = new THREE.Group(); head.position.y = 0.95;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), dark);
  dome.scale.y = 0.7; head.add(dome);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.8, 6), base);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 1.2; head.add(barrel);
  const eye = glowSprite(0xff4444, 0.8); eye.position.set(0, 0.2, 0.4); head.add(eye);
  g.add(head);
  return { group: g, head };
}
export function makeGunship() {
  const g = new THREE.Group();
  const hull = M(0x3f6b4a), dark = M(0x1f3524);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 3.6), hull);
  g.add(body);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 1.0), dark);
  bridge.position.set(0, 0.7, 0.6); g.add(bridge);
  for (const s of [-1, 1]) for (const f of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 1.0), dark);
    w.position.set(s * 1.4, f * 0.3, f * 1.1); g.add(w);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8), hull);
    eng.rotation.x = Math.PI / 2; eng.position.set(s * 1.4, f * 0.3, f * 1.1); g.add(eng);
  }
  const eye = glowSprite(0xff5533, 1.2); eye.position.set(0, 0.2, 1.9); g.add(eye);
  return { group: g };
}
export function makeCarrier() {
  const g = new THREE.Group();
  const hull = M(0xd88f2e), dark = M(0x6b4517);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 3.0), hull);
  g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.9), dark);
  cab.position.set(0, 0.85, -0.8); g.add(cab);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 1.2), hull);
    w.position.set(s * 1.6, 0.2, 0.3); g.add(w);
  }
  const cont = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.4), M(0x2e8ad8));
  cont.position.set(0, 0.9, 0.7); g.add(cont);
  return { group: g };
}

// ================= 中BOSS：鐵鷲 =================
export function makeMidboss() {
  const g = new THREE.Group();
  const hull = M(0x5a5a6a), dark = M(0x2a2a33), red = M(0xc22a2a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 5.5), hull);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.2, 6), dark);
  nose.rotation.x = Math.PI / 2; nose.position.z = 3.8; g.add(nose);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 2.2), dark);
    wing.position.set(s * 3.4, 0.3, -0.6); wing.rotation.y = s * 0.25; g.add(wing);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.6, 8), hull);
    pod.rotation.x = Math.PI / 2; pod.position.set(s * 3.2, 0.3, -0.6); g.add(pod);
    const tur = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8), red);
    tur.rotation.x = Math.PI / 2; tur.position.set(s * 1.5, -0.4, 3.2); g.add(tur);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), red);
  dome.scale.y = 0.6; dome.position.set(0, 0.9, 0.4); g.add(dome);
  const core = glowSprite(0xff2222, 2.2); core.position.set(0, 0.4, 2.9); g.add(core);
  return { group: g, core };
}

// ================= 最終BOSS：暴風要塞 =================
export function makeBoss() {
  const g = new THREE.Group();
  const hull = M(0x4a3a5a), dark = M(0x241a2e), red = M(0xd83a6a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, 7), hull);
  g.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 4.5), dark);
  deck.position.y = 1.6; g.add(deck);
  const turrets = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = new THREE.Group(); t.position.set(sx * 3.4, 1.4, sz * 2.2);
    const dm = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), red);
    dm.scale.y = 0.65; t.add(dm);
    const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.4, 6), dark);
    bl.rotation.x = Math.PI / 2; bl.position.z = 1.5; t.add(bl);
    g.add(t); turrets.push(t);
  }
  const pods = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(s * 5.6, 0.6, -1);
    const pm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 2.6), dark);
    p.add(pm);
    for (let i = 0; i < 4; i++) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 6), M(0x111116));
      tube.rotation.x = Math.PI / 2;
      tube.position.set((i % 2 - 0.5) * 0.8, (Math.floor(i / 2) - 0.5) * 0.8, 1.5); p.add(tube);
    }
    g.add(p); pods.push(p);
  }
  const coreShell = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), dark);
  coreShell.position.set(0, 0.4, 3.6); g.add(coreShell);
  const core = glowSprite(0xff33cc, 3.4); core.position.set(0, 0.4, 3.9); core.visible = false; g.add(core);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.6), red);
  bridge.position.set(0, 2.6, -1.2); g.add(bridge);
  return { group: g, turrets, pods, core, coreShell };
}

// ================= 道具 =================
const ITEM_STYLE = {
  vulcan:  ['R', '#ff5e5e', '火神炮'], laser: ['B', '#29c7ff', '雷射'],
  plasma:  ['P', '#c07bff', '電漿'], missile_h: ['M', '#7bff9e', '追蹤飛彈'],
  missile_n: ['H', '#ffd75e', '燃燒飛彈'], power: ['Ⓟ', '#ffffff', '火力提升'],
  bomb:    ['💣', '#ff9d2e', '炸彈'], medal: ['★', '#ffe97b', '勳章'], oneup: ['1UP', '#8effa8', '續命'],
};
export function itemStyle(kind) { return ITEM_STYLE[kind] || ITEM_STYLE.medal; }
export function makeItemSprite(kind) {
  const [letter, color] = itemStyle(kind);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fillStyle = 'rgba(6,10,24,.92)'; g.fill();
  g.lineWidth = 7; g.strokeStyle = color; g.stroke();
  g.fillStyle = color; g.font = `900 ${letter.length > 2 ? 34 : 56}px sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 16; g.fillText(letter, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.7, 1.7, 1);
  const halo = glowSprite(new THREE.Color(color).getHex(), 2.6); s.add(halo);
  return s;
}

// ================= 地面地景 =================
// 真實照片貼圖（CC0，見 assets/CREDITS.md）：先回傳程序化 canvas 頂著，照片載入完成後自動換上
const _groundCache = {};
const _groundWaiters = [];
const GROUND_PHOTO = {
  city: 'assets/asphalt_01.jpg',        // 都市：瀝青路基
  desert: 'assets/aerial_beach_01.jpg', // 沙漠：空拍沙地
  night: 'assets/aerial_ground_rock.jpg', // 午夜：深色岩地
};
export function groundTexture(theme) {
  if (!_groundCache[theme]) {
    _groundCache[theme] = _canvasGround(theme);
    const url = GROUND_PHOTO[theme];
    if (url) new THREE.TextureLoader().load(url, t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 10);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      t.userData.shared = true;
      _groundCache[theme] = t;
      for (let i = _groundWaiters.length - 1; i >= 0; i--)
        if (_groundWaiters[i].theme === theme) _groundWaiters.splice(i, 1)[0].cb(t);
    });
  }
  return _groundCache[theme];
}
// 照片就緒時通知；若已是照片則立即回呼
export function onGroundTexture(theme, cb) {
  const cur = groundTexture(theme);
  if (cur.userData && cur.userData.shared) cb(cur);
  else _groundWaiters.push({ theme, cb });
}
function _canvasGround(theme) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const pal = {
    city:   { base: '#2b2f45', line: '#3d4266', block: '#22263a', glow: '#ff9d2e' },
    desert: { base: '#b99a5e', line: '#a3854f', block: '#c7ab6d', glow: '#8a6a35' },
    night:  { base: '#141a2e', line: '#1e2742', block: '#0e1426', glow: '#29c7ff' },
  }[theme] || { base: '#2b2f45', line: '#3d4266', block: '#22263a', glow: '#ff9d2e' };
  g.fillStyle = pal.base; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = pal.line; g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if (Math.random() < 0.55) {
      g.fillStyle = pal.block;
      g.fillRect(i * 64 + 8, j * 64 + 8, 48, 48);
      if (Math.random() < 0.4) { g.fillStyle = pal.glow; g.globalAlpha = 0.5; g.fillRect(i * 64 + 8, j * 64 + 8, 48, 48); g.globalAlpha = 1; }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 10);
  return t;
}
export function makeGroundProp(theme) {
  const g = new THREE.Group();
  const r = Math.random();
  if (theme === 'city') {
    const h = 3 + Math.random() * 7, w = 2 + Math.random() * 3;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), M(0x39406b, { roughness: 0.8 }));
    b.position.y = h / 2; g.add(b);
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, h * 0.7, w * 1.01),
      MB(0xffc46b, { transparent: true, opacity: 0.28 }));
    win.position.y = h * 0.55; g.add(win);
  } else if (theme === 'desert') {
    if (r < 0.5) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 1.6), M(0x9a7a4e, { roughness: 0.95 }));
      rock.position.y = 0.6; rock.rotation.set(r * 3, r * 5, 0); g.add(rock);
    } else {
      const dune = new THREE.Mesh(new THREE.SphereGeometry(2.4 + Math.random() * 2, 10, 6), M(0xc7ab6d, { roughness: 1 }));
      dune.scale.y = 0.3; dune.position.y = 0; g.add(dune);
    }
  } else {
    const h = 4 + Math.random() * 6;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, h, 6), M(0x2a3550));
    t.position.y = h / 2; g.add(t);
    const lamp = glowSprite(0xff4444, 1.6); lamp.position.y = h + 0.3; g.add(lamp);
  }
  return g;
}
export function makeCloud() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 20 + Math.random() * 88, y = 20 + Math.random() * 24, r = 10 + Math.random() * 16;
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.8 }));
  s.scale.set(14 + Math.random() * 10, 5 + Math.random() * 3, 1);
  return s;
}
