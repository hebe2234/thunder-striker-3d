// DOM UI：HUD / 選單 / 橫幅 / 觸控按鈕
import { WEAPON_INFO } from './weapons.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.bannerTimer = null;
    $('start-btn').onclick = () => this.startGame();
    $('retry-btn').onclick = () => this.startGame();
    $('resume-btn').onclick = () => this.game.togglePause(false);
    $('quit-btn').onclick = () => { this.hidePause(); this.game.toTitle(); };
    $('go-title-btn').onclick = () => this.game.toTitle();
    $('nextloop-btn').onclick = () => this.game.nextLoop();
    $('mute-btn').onclick = () => this.toggleMute();
    $('pause-btn').onclick = () => this.togglePause();
    $('bomb-btn').onclick = () => this.game.tryBomb();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.state === 'playing') this.game.togglePause(true);
    });
  }
  startGame() { this.game.startGame(); }
  togglePause() { this.game.togglePause(); }
  toggleMute() {
    const m = this.game.audio.toggleMute();
    $('mute-btn').textContent = m ? '🔇' : '🔊';
  }
  showHud() { $('hud').classList.add('on'); }
  hideHud() { $('hud').classList.remove('on'); }
  hideTitle() { $('title-screen').classList.add('hidden'); }
  showTitle(hi) { $('title-hi').textContent = hi.toLocaleString(); $('title-screen').classList.remove('hidden'); }
  setScore(s) { $('score').textContent = s.toLocaleString(); }
  setHi(h) { $('hiscore').textContent = h.toLocaleString(); }
  setChain(c) { $('chain').textContent = c >= 5 ? `🔥 連擊 x${c}` : ''; }
  setLives(n) {
    const el = $('lives'); el.innerHTML = '';
    for (let i = 0; i < 5; i++) { const d = document.createElement('div'); d.className = 'ship' + (i < n ? '' : ' lost'); el.appendChild(d); }
  }
  setBombs(n) {
    const el = $('bombs'); el.querySelectorAll('.bomb').forEach(e => e.remove());
    for (let i = 0; i < 5; i++) { const d = document.createElement('div'); d.className = 'bomb' + (i < n ? '' : ' lost'); el.appendChild(d); }
  }
  syncWeapon(w) {
    $('weapon-name').textContent = WEAPON_INFO[w.type].name;
    $('weapon-name').style.color = WEAPON_INFO[w.type].color;
    const pips = $('weapon-pips').children;
    for (let i = 0; i < 8; i++) pips[i].classList.toggle('on', i < w.level);
    $('missile-name').textContent = w.missile === 'homing' ? '追蹤飛彈 HOMING' : w.missile === 'napalm' ? '燃燒飛彈 NAPALM' : '無飛彈';
  }
  setStage(name) { $('stage-name').textContent = name; }
  banner(big, sub, dur = 2.6) {
    $('banner-big').textContent = big; $('banner-sub').textContent = sub || '';
    const b = $('banner');
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('on'), dur * 1000);
  }
  setBoss(name, frac) {
    $('boss-bar').classList.add('on');
    if (name) $('boss-name').textContent = name;
    $('boss-fill').style.width = `${Math.max(0, frac * 100)}%`;
  }
  hideBoss() { $('boss-bar').classList.remove('on'); }
  damageFlash() {
    const v = $('dmg-vignette');
    v.style.opacity = 1; setTimeout(() => v.style.opacity = 0, 180);
  }
  showPause() { $('pause-screen').classList.remove('hidden'); }
  hidePause() { $('pause-screen').classList.add('hidden'); }
  showGameOver(score) {
    this.hideHud(); $('final-score').textContent = score.toLocaleString();
    $('gameover-screen').classList.remove('hidden');
  }
  showVictory(score) {
    this.hideHud(); $('victory-score').textContent = score.toLocaleString();
    $('victory-screen').classList.remove('hidden');
  }
  hideVictory() { $('victory-screen').classList.add('hidden'); this.showHud(); }
  stageClear(text, cb) {
    $('stageclear-sub').textContent = text;
    $('stageclear-screen').classList.remove('hidden');
    setTimeout(() => { $('stageclear-screen').classList.add('hidden'); cb && cb(); }, 2600);
  }
}
