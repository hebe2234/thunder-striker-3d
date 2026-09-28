# 雷霆戰機3D · Thunder Striker 3D

[繁體中文](#繁體中文) | [English](#english)

🎮 **線上遊玩 / Play online**：https://hebe2234.github.io/thunder-striker-3d/

---

## 繁體中文

向經典街機《雷電》致敬的 3D 縱向捲軸射擊遊戲。立體戰機、景深地面、粒子爆破、鏡頭震動。

### 玩法

- **操作**：滑鼠／手指拖曳移動（自動開火）、空白鍵／X 炸彈、P 暫停、M 靜音
- **技能樹三選一**：每擊墜 12 架敵機可三選一強化
  - **主武器**（6 種）：🔴 火神散射炮 VULCAN（扇形彈幕）／🔵 雷射光束 LASER（高貫穿，BOSS 剋星）／🟣 電漿爆裂彈 PLASMA（範圍爆炸）／🟢 電磁軌道炮 RAILGUN（單發毀滅）／🟠 火箭彈幕 ROCKETS（連射壓制）／⚡ 特斯拉電弧 TESLA（閃電鏈群體殺傷）
  - **飛彈**：追蹤飛彈（自動鎖定）／燃燒飛彈（範圍燃燒）
  - **強化**：傷害、射速、護盾、僚機等
- **炸彈**：全螢幕衝擊波＋短暫無敵；吃 💣 補充
- **戰機有 HP**，脫戰 4 秒後緩慢回復
- **3 個關卡**：黃昏都市 → 沙漠風暴 → 午夜要塞（真實照片地面材質＋蜿蜒捲動路線），含中 BOSS「鐵鷲」與三階段最終 BOSS「暴風要塞」
- **4 種難度**：簡單／普通／困難／噩夢（影響敵機血量、火力與遊戲速度）
- 通關後進入下一輪，敵軍全面強化；最高分保存在本機
- 介面中英雙語：右上角可隨時切換，會自動偵測系統語言

### 技術

- Three.js（CDN）程序化低多邊形建模；地面為 CC0 真實照片材質，爆炸為 50 幀 sprite 動畫
- WebAudio 全程式合成音效＋背景音樂
- 物件池（子彈／粒子）＋包圍體碰撞，手機也能順跑

### 本機開發

直接用靜態伺服器開啟即可（需連網載入 Three.js CDN）：

```bash
python3 -m http.server 8000
# 瀏覽器開 http://localhost:8000/
```

---

## English

A 3D vertical-scrolling shooter paying tribute to the arcade classic *Raiden*. Full-3D fighter, parallax ground, particle explosions, screen shake.

### Gameplay

- **Controls**: drag with mouse / finger to move (auto-fire), Space / X for bomb, P pause, M mute
- **Skill-tree draft**: every 12 kills, pick 1 of 3 upgrades
  - **Main weapons** (6): 🔴 VULCAN spread cannon (fan barrage) / 🔵 LASER beam (high pierce, boss killer) / 🟣 PLASMA orbs (AoE blasts) / 🟢 RAILGUN (devastating single shots) / 🟠 ROCKETS (rapid-fire suppression) / ⚡ TESLA arcs (chain lightning crowds)
  - **Missiles**: homing (auto-lock) / incendiary (burn AoE)
  - **Upgrades**: damage, fire rate, shield, wingman, and more
- **Bomb**: fullscreen shockwave + brief invincibility; pick up 💣 to restock
- **Your fighter has HP**, slowly regenerates after 4 s out of combat
- **3 stages**: Dusk City → Desert Storm → Midnight Fortress (real-photo ground textures + winding scroll routes), featuring mid-boss "Iron Vulture" and the 3-phase final boss "Storm Fortress"
- **4 difficulties**: Easy / Normal / Hard / Nightmare (enemy HP, firepower, and game speed)
- Clearing the game starts the next loop with tougher enemies; high score saved locally
- Bilingual UI (Traditional Chinese / English): switch anytime from the top-right button, auto-detects system language

### Tech

- Three.js (CDN) procedural low-poly modeling; CC0 real-photo ground textures, 50-frame sprite explosion animations
- WebAudio fully synthesized SFX + background music
- Object pooling (bullets / particles) + bounding-volume collision, smooth on phones too

### Local dev

Just serve it statically (needs internet for the Three.js CDN):

```bash
python3 -m http.server 8000
# open http://localhost:8000/ in your browser
```
