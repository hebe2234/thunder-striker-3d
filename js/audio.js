// 全程式化音效 + 背景音樂（WebAudio 合成，無外部素材）
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.musicGain = null; this.sfxGain = null;
    this.muted = false; this.musicTimer = null; this.step = 0;
    this._lastShoot = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.55; this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.30; this.musicGain.connect(this.master);
    // noise buffer
    const len = this.ctx.sampleRate * 1.2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.9; return this.muted; }

  _osc(type, f0, f1, t0, dur, vol, dest) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  _noise(t0, dur, vol, filterFreq, q) {
    if (!this.ctx || this.muted) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq; f.Q.value = q || 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t0); s.stop(t0 + dur + 0.02);
  }
  now() { return this.ctx ? this.ctx.currentTime : 0; }

  shoot() { // 節流，避免連射爆音
    if (!this.ctx || this.muted) return;
    const t = performance.now();
    if (t - this._lastShoot < 70) return;
    this._lastShoot = t;
    this._osc('square', 880 + Math.random() * 220, 220, this.now(), 0.09, 0.10);
  }
  plasmaFire() { this._osc('sawtooth', 160, 420, this.now(), 0.22, 0.16); }
  laserHum() { this._osc('sawtooth', 140, 90, this.now(), 0.12, 0.05); }
  enemyShoot() { this._osc('square', 320, 140, this.now(), 0.12, 0.06); }
  explosion(big) {
    const t = this.now(), dur = big ? 0.9 : 0.45;
    this._noise(t, dur, big ? 0.5 : 0.3, big ? 900 : 1600);
    this._osc('sine', big ? 120 : 180, 30, t, dur, big ? 0.5 : 0.3);
  }
  hit() { this._noise(this.now(), 0.08, 0.12, 3000); }
  pickup() { const t = this.now(); this._osc('square', 660, 0, t, 0.08, 0.14); this._osc('square', 990, 0, t + 0.08, 0.12, 0.14); }
  powerup() { const t = this.now(); [523, 659, 784, 1046].forEach((f, i) => this._osc('square', f, 0, t + i * 0.07, 0.12, 0.13)); }
  oneUp() { const t = this.now(); [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this._osc('triangle', f, 0, t + i * 0.09, 0.18, 0.16)); }
  bomb() {
    const t = this.now();
    this._osc('sine', 90, 24, t, 1.4, 0.6);
    this._noise(t, 1.2, 0.45, 700);
    this._osc('sawtooth', 400, 40, t, 0.8, 0.2);
  }
  warning() {
    const t = this.now();
    for (let i = 0; i < 3; i++) {
      this._osc('square', 440, 0, t + i * 0.5, 0.22, 0.16);
      this._osc('square', 349, 0, t + i * 0.5 + 0.25, 0.22, 0.16);
    }
  }
  playerDown() {
    const t = this.now();
    this._osc('sawtooth', 300, 40, t, 1.0, 0.3);
    this._noise(t, 0.8, 0.4, 1200);
  }
  bossDie() {
    const t = this.now();
    for (let i = 0; i < 5; i++) {
      this._noise(t + i * 0.25, 0.5, 0.4, 800 + i * 300);
      this._osc('sine', 100 - i * 8, 28, t + i * 0.25, 0.5, 0.4);
    }
  }

  // ---- 背景音樂：132 BPM，Am - F - C - G 進行 ----
  startMusic(intensity) {
    if (!this.ctx || this.musicTimer) return;
    this.intensity = intensity || 1;
    const spb = 60 / 132 / 2; // 8分音符
    const bassSeq = [45, 0, 45, 0, 41, 0, 41, 0, 48, 0, 48, 0, 43, 0, 43, 0]; // A2 F2 C3 G2
    const leadSeq = [69, 0, 72, 76, 0, 74, 72, 0, 69, 0, 72, 76, 79, 76, 74, 72];
    const midi = m => 440 * Math.pow(2, (m - 69) / 12);
    this.step = 0;
    const tick = () => {
      if (!this.ctx || this.muted) { this.step++; return; }
      const t = this.now(), s = this.step % 16;
      const b = bassSeq[s];
      if (b) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = midi(b);
        f.type = 'lowpass'; f.frequency.value = 320;
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.8);
        o.connect(f); f.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + spb * 2);
      }
      if (this.intensity >= 1) {
        const l = leadSeq[s];
        if (l && s % 2 === 0) {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain();
          o.type = 'square'; o.frequency.value = midi(l);
          g.gain.setValueAtTime(0.10, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.4);
          o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + spb * 1.6);
        }
      }
      // hihat
      const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
      const nf = this.ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 7000;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(s % 2 ? 0.05 : 0.10, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      n.connect(nf); nf.connect(ng); ng.connect(this.musicGain); n.start(t); n.stop(t + 0.06);
      this.step++;
    };
    tick();
    this.musicTimer = setInterval(tick, spb * 1000);
  }
  stopMusic() { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
  setIntensity(i) { this.intensity = i; }
}
