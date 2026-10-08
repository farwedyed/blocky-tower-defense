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
        if (this.stepMaps) {
          this.stepMaps.classList.add('hidden');
          this.stepMaps.classList.remove('active');
          this.stepMaps.style.display = '';
        }
        if (this.stepDiff) {
          this.stepDiff.classList.remove('hidden');
          this.stepDiff.classList.add('active');
          this.stepDiff.style.display = '';
        }
        this.drawAllBossPreviews();
      });
    }

    const btnSoloBack = document.getElementById('btn-solo-top-back');
    if (btnSoloBack) {
      btnSoloBack.addEventListener('click', () => {
        soundManager.playTick();
        this.lobbyUI.showSplashState();
      });
    }
    // Step 2: Back to Maps / Co-op Room
    if (this.btnBackDiff) {
      this.btnBackDiff.addEventListener('click', () => {
        soundManager.playTick();
        
        // Hide Difficulty Step
        if (this.stepDiff) {
          this.stepDiff.classList.add('hidden');
          this.stepDiff.classList.remove('active');
          this.stepDiff.style.setProperty('display', 'none', 'important');
        }

        if (Network.mode !== 'OFFLINE') {
          // In Co-op: Return to Co-op Squad Room
          this.lobbyUI.coop.showCoopLobbyState();
          Network.broadcastToAll({ type: 'COOP_STEP_CHANGE', step: 'room' });
        } else {
          // In Solo: Return to Solo Maps
          if (this.stepMaps) {
            this.stepMaps.classList.remove('hidden');
            this.stepMaps.classList.add('active');
            this.stepMaps.style.setProperty('display', 'flex', 'important');
          }
        }
      });
    }

    // Step 2: Next (Squad Prep)
    if (this.btnNextDiff) {
      this.btnNextDiff.addEventListener('click', () => {
        soundManager.playTick();
        
        // Hide Difficulty Step
        if (this.stepDiff) {
          this.stepDiff.classList.add('hidden');
          this.stepDiff.classList.remove('active');
          this.stepDiff.style.setProperty('display', 'none', 'important');
        }

        // Show Prep Step
        if (this.stepPrep) {
          this.stepPrep.classList.remove('hidden');
          this.stepPrep.classList.add('active');
          this.stepPrep.style.setProperty('display', 'flex', 'important');
        }

        // Update button text for Co-op
        const deployBtn = document.getElementById('btn-deploy');
        if (deployBtn) {
          deployBtn.innerHTML = Network.mode !== 'OFFLINE' 
            ? '<span>DEPLOY SQUAD TO MATCH</span><img src="assets/ui/solo/sprite_02.png" class="prep-deploy-swords" alt="" />'
            : '<span>DEPLOY TO MATCH</span><img src="assets/ui/solo/sprite_02.png" class="prep-deploy-swords" alt="" />';
        }

        // Solo-only rewarded start boost button
        if (this.lobbyUI && typeof this.lobbyUI.refreshPrepBoost === 'function') this.lobbyUI.refreshPrepBoost();

        // Clients stay in squad room waiting for Host to deploy
      });
    }

    // Step 3: Back to Difficulty
    if (this.btnBackPrep) {
      this.btnBackPrep.addEventListener('click', () => {
        soundManager.playTick();
        if (this.stepPrep) {
          this.stepPrep.classList.add('hidden');
          this.stepPrep.classList.remove('active');
          this.stepPrep.style.display = '';
        }
        if (this.stepDiff) {
          this.stepDiff.classList.remove('hidden');
          this.stepDiff.classList.add('active');
          this.stepDiff.style.display = '';
        }
      });
    }

    // Difficulty selection cards (Synced across squad)
    this.diffWizardCards.forEach(card => {
      card.addEventListener('click', () => {
        if (Network.mode === 'CLIENT') return; // Only host chooses difficulty
        this.diffWizardCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        const diff = card.getAttribute('data-difficulty');
        this.game.selectedDifficulty = diff;
        soundManager.playTick();

        if (Network.mode === 'HOST') {
          Network.broadcastToAll({
            type: 'COOP_DIFF_SELECTED',
            difficulty: diff
          });
        }
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
        if (typeof Network !== 'undefined' && Network.mode === 'HOST') {
          Network.broadcastToAll({
            type: 'COOP_MAP_SELECTED',
            selectedMap: mapId
          });
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

    const mapSrcs = {
      grassland: 'assets/maps/grassmap/grassmap.png',
      desert: 'assets/maps/sandmap/sandmap.png',
      tundra: 'assets/maps/snowmap/snowmap.png'
    };

    if (mapSrcs[mapId]) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, w, h);
      };
      img.src = mapSrcs[mapId];
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, w, h);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, w, h);
        return;
      }
    }

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
    const availableQuests = [];

    availableQuests.push({
      key: 'kills',
      icon: 'https://img.icons8.com/color/48/skull.png',
      label: 'Slay Zombies',
      current: questProgress.kills || 0,
      goal: questGoals.kills,
      reward: 75,
      rewarded: questRewarded.kills
    });

    availableQuests.push({
      key: 'cashSpent',
      icon: 'https://img.icons8.com/color/48/stack-of-money.png',
      label: 'Spend $2,000 Cash',
      current: questProgress.cashSpent || 0,
      goal: questGoals.cashSpent,
      reward: 100,
      rewarded: questRewarded.cashSpent
    });

    availableQuests.push({
      key: 'wavesSurvived',
      icon: 'https://img.icons8.com/color/48/tsunami.png',
      label: 'Survive 25 Waves',
      current: questProgress.wavesSurvived || 0,
      goal: questGoals.wavesSurvived,
      reward: 75,
      rewarded: questRewarded.wavesSurvived
    });

    availableQuests.push({
      key: 'scoutsPlaced',
      icon: 'https://img.icons8.com/color/48/detective.png',
      label: 'Deploy 15 Scouts',
      current: questProgress.scoutsPlaced || 0,
      goal: questGoals.scoutsPlaced,
      reward: 50,
      rewarded: questRewarded.scoutsPlaced
    });

    if (this.game.unlockedAgents.includes('farm')) {
      availableQuests.push({
        key: 'farmsPlaced',
        icon: 'https://img.icons8.com/color/48/wheat.png',
        label: 'Place 5 Farms',
        current: questProgress.farmsPlaced || 0,
        goal: questGoals.farmsPlaced,
        reward: 60,
        rewarded: questRewarded.farmsPlaced
      });
    }

    const displayQuests = availableQuests.slice(0, 4);

    listEl.innerHTML = displayQuests.map(q => {
      const pct = Math.min(100, Math.round((q.current / q.goal) * 100));
      const done = q.rewarded || q.current >= q.goal;
      return `
        <div class="prep-quest-row ${done ? 'quest-done' : ''}">
          <img src="${q.icon}" class="quest-row-icon" alt="" />
          <div class="quest-row-info">
            <span class="quest-name">${q.label}</span>
            <div class="quest-progress-line">
              <div class="quest-track">
                <div class="quest-fill" style="width: ${pct}%;"></div>
              </div>
              <span class="quest-counter">${Math.min(q.current, q.goal)} / ${q.goal}</span>
            </div>
          </div>
          <div class="quest-reward-pill" title="Reward: ${q.reward} coins">
            <img src="assets/ui/solo/selectdifficulty/sprite_20.png" class="quest-coin-img" alt="Coins" />
            <span class="quest-reward-val">+${q.reward}</span>
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
    
    // Fill up to 5 rows matching reference image exactly
    const rows = [];
    for (let i = 0; i < 5; i++) {
      rows.push(safeRecords[i] || { name: 'Guest', time: '06:05' });
    }

    const medalIcons = [
      '🥇', // 1st - Gold
      '🥈', // 2nd - Silver
      '🥉', // 3rd - Bronze
      '<span class="rank-blue-badge">4</span>',
      '<span class="rank-blue-badge">5</span>'
    ];

    listEl.innerHTML = rows.map((entry, i) => `
      <div class="prep-leaderboard-row ${i === 0 ? 'first-place-row' : ''}">
        <div class="rank-name-cluster">
          <span class="rank-icon-slot">${medalIcons[i]}</span>
          <span class="rank-player-name">${entry.name || 'Guest'}</span>
        </div>
        <span class="rank-time-text">${entry.time || '06:05'}</span>
      </div>
    `).join('');
  }
}