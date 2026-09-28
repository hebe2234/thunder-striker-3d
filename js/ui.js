// DOM UI：HUD / 選單 / 橫幅 / 觸控按鈕 / 技能選擇
import { WEAPON_INFO, MISSILE_INFO, localizeWeapons } from './weapons.js';
import { localizeGameData } from './game.js';
import { localizeModels } from './models.js';
import { t, getLang, setLang } from './i18n.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.bannerTimer = null;
    this._bossKey = null;    // 重渲染用：boss 名稱 key
    this._bannerKeys = null; // 重渲染用：橫幅 key
    this._clearKey = null;   // 重渲染用：stage clear key
    this._choiceOpts = null; // 重渲染用：技能選項
    this._choiceCb = null;
    $('start-btn').onclick = () => this.startGame();
    $('retry-btn').onclick = () => this.startGame();
    $('resume-btn').onclick = () => this.game.togglePause(false);
    $('quit-btn').onclick = () => { this.hidePause(); this.game.toTitle(); };
    $('go-title-btn').onclick = () => this.game.toTitle();
    $('nextloop-btn').onclick = () => this.game.nextLoop();
    $('mute-btn').onclick = () => this.toggleMute();
    $('pause-btn').onclick = () => this.togglePause();
    $('bomb-btn').onclick = () => this.game.tryBomb();
    $('lang-btn').onclick = () => this.toggleLang();
    document.querySelectorAll('.diff-btn').forEach(b => {
      b.onclick = () => { if (this.game) this.game.setDifficulty(b.dataset.diff); };
    });
    if (this.game) this.syncDifficulty(this.game.diffId);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.state === 'playing') this.game.togglePause(true);
    });
    this.applyLanguage();
  }
  syncDifficulty(id) {
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.toggle('sel', b.dataset.diff === id));
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
  showTitle(hi) { $('title-hi').textContent = hi.toLocaleString(); $('title-screen').classList.remove('hidden'); if (this.game) this.syncDifficulty(this.game.diffId); }
  setScore(s) { $('score').textContent = s.toLocaleString(); }
  setHi(h) { $('hiscore').textContent = h.toLocaleString(); }
  setChain(c) { $('chain').textContent = c >= 5 ? `🔥 ${t('hud.combo')} x${c}` : ''; }
  setLives(n) {
    const el = $('lives'); el.innerHTML = '';
    for (let i = 0; i < 5; i++) { const d = document.createElement('div'); d.className = 'ship' + (i < n ? '' : ' lost'); el.appendChild(d); }
  }
  setBombs(n, max = 5) {
    const el = $('bombs'); el.querySelectorAll('.bomb').forEach(e => e.remove());
    for (let i = 0; i < max; i++) { const d = document.createElement('div'); d.className = 'bomb' + (i < n ? '' : ' lost'); el.appendChild(d); }
  }
  setHp(hp, max) {
    const f = $('hp-fill');
    const frac = Math.max(0, hp / max);
    f.style.width = `${frac * 100}%`;
    f.style.background = frac > 0.5 ? 'linear-gradient(90deg,#37e08b,#a8ff7a)' : frac > 0.25 ? 'linear-gradient(90deg,#e0a837,#ffe17a)' : 'linear-gradient(90deg,#e03737,#ff7a7a)';
    $('hp-num').textContent = `${Math.ceil(Math.max(0, hp))}`;
  }
  syncWeapon(w) {
    $('weapon-name').textContent = WEAPON_INFO[w.type].name;
    $('weapon-name').style.color = WEAPON_INFO[w.type].color;
    const pips = $('weapon-pips').children;
    for (let i = 0; i < 8; i++) pips[i].classList.toggle('on', i < w.level);
    $('missile-name').textContent = (MISSILE_INFO[w.missile] || MISSILE_INFO.none).name;
  }
  setStage(name) { $('stage-name').textContent = name; }
  // banner：直接給字串；bannerK：給 i18n key（切換語言時可重渲染）
  banner(big, sub, dur = 2.6) { this._showBanner(big, sub, dur, null); }
  bannerK(bigKey, subKey, dur = 2.6) { this._showBanner(t(bigKey), t(subKey), dur, { bigKey, subKey }); }
  _showBanner(big, sub, dur, keys) {
    $('banner-big').textContent = big; $('banner-sub').textContent = sub || '';
    this._bannerKeys = keys;
    const b = $('banner');
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('on'), dur * 1000);
  }
  setBoss(nameKey, frac) {
    $('boss-bar').classList.add('on');
    if (nameKey) { this._bossKey = nameKey; $('boss-name').textContent = t(nameKey); }
    $('boss-fill').style.width = `${Math.max(0, frac * 100)}%`;
  }
  hideBoss() { $('boss-bar').classList.remove('on'); this._bossKey = null; }
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
  stageClear(clearKey, cb) {
    this._clearKey = clearKey;
    $('stageclear-sub').textContent = t(clearKey);
    $('stageclear-screen').classList.remove('hidden');
    setTimeout(() => { $('stageclear-screen').classList.add('hidden'); cb && cb(); }, 2600);
  }
  showChoice(opts, onPick) {
    this._choiceOpts = opts; this._choiceCb = onPick;
    const scr = $('choice-screen');
    const tagName = { weapon: t('choice.tag.weapon'), missile: t('choice.tag.missile'), upgrade: t('choice.tag.upgrade'), bonus: t('choice.tag.bonus') };
    const tagCls = { weapon: 'tw', missile: 'tm', upgrade: 'tu', bonus: 'tb' };
    opts.forEach((o, i) => {
      const c = $(`choice-${i}`);
      c.innerHTML = `<div class="ctag ${tagCls[o.kind] || 'tu'}">${tagName[o.kind] || t('choice.tag.upgrade')}</div>` +
        `<div class="cicon">${o.icon}</div><div class="cname">${o.name}</div><div class="cdesc">${o.desc}</div>`;
      c.onclick = () => onPick(o.id);
    });
    scr.classList.remove('hidden');
  }
  hideChoice() { $('choice-screen').classList.add('hidden'); this._choiceOpts = null; this._choiceCb = null; }

  // ---------- 語言 ----------
  toggleLang() {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
    this.applyLanguage();
  }
  // 切換語言後重渲染所有可見文字（靜態 DOM＋動態狀態）
  applyLanguage() {
    const lang = getLang();
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    document.title = t('meta.title');
    localizeWeapons(); localizeGameData(); localizeModels();
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    $('lang-btn').innerHTML = lang === 'zh' ? '<b>中文</b> / EN' : '中文 / <b>EN</b>';
    if (!this.game) return;
    this.syncDifficulty(this.game.diffId);
    this.syncWeapon(this.game.weapons);
    this.setStage(`${this.game.stage.name} · ${t('diff.' + this.game.diffId)}`);
    this.setChain(this.game.chain || 0);
    if (this._bossKey) $('boss-name').textContent = t(this._bossKey);
    if (this._bannerKeys && $('banner').classList.contains('on')) {
      $('banner-big').textContent = t(this._bannerKeys.bigKey);
      $('banner-sub').textContent = t(this._bannerKeys.subKey);
    }
    if (this._clearKey && !$('stageclear-screen').classList.contains('hidden'))
      $('stageclear-sub').textContent = t(this._clearKey);
    if (this._choiceOpts && this._choiceCb) this.showChoice(this._choiceOpts, this._choiceCb);
  }
}
