// 啟動入口
import { Game } from './game.js';
import { UI } from './ui.js';

// 錯誤收集（headless 測試用）
const errBox = document.getElementById('errlog');
window.addEventListener('error', e => { errBox.textContent += `[error] ${e.message} @${e.lineno}\n`; });
window.addEventListener('unhandledrejection', e => { errBox.textContent += `[reject] ${e.reason}\n`; });

const ui = new UI(null);
const game = new Game(document.getElementById('stage'), ui);
ui.game = game;
ui.syncDifficulty(game.diffId);

const params = new URLSearchParams(location.search);
if (params.get('muted') === '1') { game.audio.init(); game.audio.toggleMute(); document.getElementById('mute-btn').textContent = '🔇'; }

function loop() { requestAnimationFrame(loop); game.frame(); }
loop();

if (params.get('autostart') === '1') {
  setTimeout(() => ui.startGame(), 600);
}
window.__game = game;
