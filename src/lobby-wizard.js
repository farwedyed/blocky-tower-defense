// src/lobby-wizard.js
// Sub-controller handling the Map Select, Difficulty selections, Daily Quests, and Leaderboards.

import { soundManager } from './sound.js';
import { fetchTopRecords } from './firebase.js';
import { drawBossPreviewOnCanvas } from './game-renderer.js';

export class LobbyWizard {
  constructor(lobbyUI, game) {
    this.lobbyUI = lobbyUI;
    this.game = game;

    // Wizard step nodes
    this.stepMaps = document.getElementById('wizard-step-maps');
    this.stepDiff = document.getElementById('wizard-step-diff');
    this.stepPrep = document.getElementById('wizard-step-prep');

    // Navigation buttons
    this.btnNextMaps = document.getElementById('btn-wizard-next-maps');
    this.btnBackDiff = document.getElementById('btn-wizard-back-diff');
    this.btnNextDiff = document.getElementById('btn-wizard-next-diff');
    this.btnBackPrep = document.getElementById('btn-wizard-back-prep');

    this.mapCards = document.querySelectorAll('.map-card');
    this.diffWizardCards = document.querySelectorAll('.diff-wizard-card');
  }

  initEventListeners() {
    // Step 1: Next (Choose Difficulty)
    if (this.btnNextMaps) {
      this.btnNextMaps.addEventListener('click', () => {
        soundManager.playTick();
        if (this.stepMaps) this.stepMaps.classList.add('hidden');
        if (this.stepDiff) {
          this.stepDiff.classList.remove('hidden');
          this.stepDiff.classList.add('active');
        }
        this.drawAllBossPreviews();

        // Tutorial Step 2: Point directly to PREPARATION button
        if (!this.game.tutorialCompleted) {
          this.lobbyUI.parentUI.hidePointer();
          document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
          
          const nextDiffBtn = document.getElementById('btn-wizard-next-diff');
          if (nextDiffBtn) {
            this.lobbyUI.parentUI.showPointerAt(nextDiffBtn, 'down');
            nextDiffBtn.classList.add('tut-highlight');
          }
        }
      });
    }

    // Step 2: Back to Maps
    if (this.btnBackDiff) {
      this.btnBackDiff.addEventListener('click', () => {
        soundManager.playTick();
        if (this.stepDiff) this.stepDiff.classList.add('hidden');
        if (this.stepMaps) {
          this.stepMaps.classList.remove('hidden');
          this.stepMaps.classList.add('active');
        }
        this.lobbyUI.triggerStep1Pointer();
      });
    }

    // Step 2: Next (Squad Prep)
    if (this.btnNextDiff) {
      this.btnNextDiff.addEventListener('click', () => {
        soundManager.playTick();
        if (this.stepDiff) this.stepDiff.classList.add('hidden');
        if (this.stepPrep) {
          this.stepPrep.classList.remove('hidden');
          this.stepPrep.classList.add('active');
        }

        // Tutorial Step 3: Point to DEPLOY TO MATCH button
        if (!this.game.tutorialCompleted) {
          this.lobbyUI.parentUI.hidePointer();
          document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
          
          const deployBtn = document.getElementById('btn-deploy');
          if (deployBtn) {
            this.lobbyUI.parentUI.showPointerAt(deployBtn, 'down');
            deployBtn.classList.add('tut-highlight');
          }
        }
      });
    }

    // Step 3: Back to Difficulty
    if (this.btnBackPrep) {
      this.btnBackPrep.addEventListener('click', () => {
        soundManager.playTick();
        if (this.stepPrep) this.stepPrep.classList.add('hidden');
        if (this.stepDiff) {
          this.stepDiff.classList.remove('hidden');
          this.stepDiff.classList.add('active');
        }

        if (!this.game.tutorialCompleted) {
          this.lobbyUI.parentUI.hidePointer();
          document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
          
          const nextDiffBtn = document.getElementById('btn-wizard-next-diff');
          if (nextDiffBtn) {
            this.lobbyUI.parentUI.showPointerAt(nextDiffBtn, 'down');
            nextDiffBtn.classList.add('tut-highlight');
          }
        }
      });
    }

    // Difficulty selection cards
    this.diffWizardCards.forEach(card => {
      card.addEventListener('click', () => {
        this.diffWizardCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        const diff = card.getAttribute('data-difficulty');
        this.game.selectedDifficulty = diff;
        soundManager.playTick();
      });
    });

    // Map selection cards
    this.mapCards.forEach(card => {
      card.addEventListener('click', () => {
        this.mapCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const mapId = card.getAttribute('data-map-id');
        this.game.setSelectedMap(mapId);
        this.renderLeaderboard(mapId);

        if (!this.game.tutorialCompleted) {
          this.lobbyUI.parentUI.hidePointer();
          document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
          
          const nextMapsBtn = document.getElementById('btn-wizard-next-maps');
          if (nextMapsBtn) {
            this.lobbyUI.parentUI.showPointerAt(nextMapsBtn, 'down');
            nextMapsBtn.classList.add('tut-highlight');
          }
        }
      });
    });
  }

  drawAllBossPreviews() {
    const bossPreviews = document.querySelectorAll('.diff-boss-preview');
    bossPreviews.forEach(canvas => {
      const bossType = canvas.getAttribute('data-boss');
      if (bossType) {
        drawBossPreviewOnCanvas(canvas, bossType);
      }
    });
  }

  drawMapPreview(canvas, mapId) {
    if (!canvas) return; 
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;

    let terrainColor = '#7dcd40';
    let pathColor = '#dfc39e';
    let borderOutlineColor = '#222222';
    
    if (mapId === 'desert') {
      terrainColor = '#f9e79f';
      pathColor = '#e5c494';
    } else if (mapId === 'tundra') {
      terrainColor = '#ebf5fb';
      pathColor = '#d4e6f1';
    } else if (mapId === 'cyber_city') {
      terrainColor = '#0a1628';
      pathColor = '#1e3a4a';
      borderOutlineColor = '#00ffe0';
    } else if (mapId === 'fallen_outpost') {
      terrainColor = '#c8a96e';
      pathColor = '#8b6914';
    }

    ctx.fillStyle = terrainColor;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = borderOutlineColor;
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.35);
    ctx.lineTo(w * 0.4, h * 0.35);
    ctx.lineTo(w * 0.4, h * 0.7);
    ctx.lineTo(w * 0.75, h * 0.7);
    ctx.lineTo(w * 0.75, h * 0.25);
    ctx.lineTo(w, h * 0.25);
    ctx.stroke();

    ctx.strokeStyle = pathColor;
    ctx.lineWidth = 12;
    ctx.stroke();

    ctx.lineWidth = 2.5;
    if (mapId === 'grassland') {
      ctx.fillStyle = '#784212';
      ctx.fillRect(20, 48, 3, 6);
      ctx.fillStyle = '#1e8449';
      ctx.beginPath();
      ctx.moveTo(21.5, 38);
      ctx.lineTo(27, 48);
      ctx.lineTo(16, 48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#784212';
      ctx.fillRect(95, 74, 3, 6);
      ctx.fillStyle = '#1e8449';
      ctx.beginPath();
      ctx.moveTo(96.5, 64);
      ctx.lineTo(102, 74);
      ctx.lineTo(91, 74);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (mapId === 'desert') {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(95, 38, 4, 12);
      ctx.strokeRect(95, 38, 4, 12);
      ctx.fillRect(91, 42, 4, 3);
      ctx.fillRect(91, 39, 3, 4);
      ctx.fillRect(99, 44, 4, 3);
      ctx.fillRect(101, 41, 3, 4);
    } else if (mapId === 'tundra') {
      ctx.fillStyle = '#5c3a21';
      ctx.fillRect(20, 48, 3, 6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(21.5, 36);
      ctx.lineTo(27, 48);
      ctx.lineTo(16, 48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (mapId === 'cyber_city') {
      ctx.fillStyle = '#00ffe0';
      ctx.fillRect(20, 40, 4, 12);
      ctx.strokeRect(20, 40, 4, 12);
    } else if (mapId === 'fallen_outpost') {
      ctx.fillStyle = '#b3965b';
      ctx.fillRect(95, 70, 10, 6);
      ctx.strokeRect(95, 70, 10, 6);
    }

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
    ctx.restore();
  }

  renderDailyQuests() {
    const listEl = document.getElementById('quests-list');
    if (!listEl) return;

    const { questProgress, questGoals, questRewarded } = this.game;

    const quests = [
      {
        key: 'kills',
        label: '<img src="https://img.icons8.com/color/48/skull.png" class="quest-icon" /> Slay Zombies',
        current: questProgress.kills,
        goal: questGoals.kills,
        reward: 75,
        rewarded: questRewarded.kills
      },
      {
        key: 'cashSpent',
        label: '<img src="https://img.icons8.com/color/48/stack-of-money.png" class="quest-icon" /> Spend $2,000 Cash',
        current: questProgress.cashSpent,
        goal: questGoals.cashSpent,
        reward: 100,
        rewarded: questRewarded.cashSpent
      },
      {
        key: 'farmsPlaced',
        label: '<img src="https://img.icons8.com/color/48/wheat.png" class="quest-icon" /> Place 5 Farms',
        current: questProgress.farmsPlaced,
        goal: questGoals.farmsPlaced,
        reward: 50,
        rewarded: questRewarded.farmsPlaced
      }
    ];

    listEl.innerHTML = quests.map(q => {
      const pct = Math.min(100, Math.round((q.current / q.goal) * 100));
      const done = q.rewarded || q.current >= q.goal;
      const barColor = done ? '#27ae60' : '#3498db';
      return `
        <div class="quest-item" style="
          background: ${done ? 'rgba(39,174,96,0.08)' : 'rgba(52,152,219,0.06)'};
          border: 2px solid ${done ? '#27ae60' : '#3498db'};
          border-radius: 10px;
          padding: 8px 10px;
          position: relative;
          overflow: hidden;
        ">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:900;font-size:0.82rem;">${q.label}</span>
            <span style="font-weight:800;font-size:0.78rem;color:${done ? '#27ae60' : '#f39c12'};">
              ${done ? '✅ DONE' : `${Math.min(q.current, q.goal)} / ${q.goal}`}
            </span>
          </div>
          <div style="margin-top:5px;height:7px;background:#e0e0e0;border-radius:6px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:6px;transition:width 0.4s;"></div>
          </div>
          <div style="margin-top:4px;font-size:0.7rem;color:#7f8c8d;text-align:right;">
            Reward: <img src="https://img.icons8.com/color/48/coins.png" class="quest-icon" /> ${q.reward} Coins
          </div>
        </div>
      `;
    }).join('');
  }

  renderLeaderboard(mapId) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;

    const mapLabel = mapId === 'desert' ? 'Desert Outpost' : mapId === 'tundra' ? 'Frost Tundra' : mapId === 'cyber_city' ? 'Cyber City' : mapId === 'fallen_outpost' ? 'Fallen Outpost' : 'Grassland';

    const records = (this.game.leaderboard && this.game.leaderboard[mapId]) || [];
    this._renderLeaderboardRows(listEl, mapLabel, records);

    fetchTopRecords(mapId).then(freshRecords => {
      if (!this.game.leaderboard) this.game.leaderboard = {};
      this.game.leaderboard[mapId] = freshRecords;
      this._renderLeaderboardRows(listEl, mapLabel, freshRecords);
    }).catch(e => {
      console.warn('[Leaderboard] Fetch error safely ignored:', e);
    });
  }

  _renderLeaderboardRows(listEl, mapLabel, records) {
    const safeRecords = Array.isArray(records) ? records : [];
    if (safeRecords.length === 0) {
      listEl.innerHTML = `<div style="color:#7f8c8d;font-size:0.82rem;">
        No records yet for <strong>${mapLabel}</strong>.<br>Complete the map to set one!
      </div>`;
      return;
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    listEl.innerHTML = `
      <div style="font-size:0.72rem;color:#7f8c8d;margin-bottom:4px;">📍 ${mapLabel}</div>
      ${safeRecords.map((entry, i) => `
        <div style="
          display:flex;justify-content:space-between;align-items:center;
          padding:5px 8px;
          border-radius:8px;
          background:${i === 0 ? 'rgba(241,196,15,0.12)' : 'transparent'};
          border-bottom:1px dashed #e0e0e0;
          font-weight:800;
          font-size:0.82rem;
        ">
          <span style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">
            <span>${medals[i] || `#${i + 1}`}</span>
            <strong style="color:var(--text-dark);">${entry.name || 'Guest'}</strong>
          </span>
          <span style="color:var(--primary-blue-dark); font-family:var(--font-title); font-size:0.9rem;">${entry.time}</span>
        </div>
      `).join('')}
    `;
  }
}