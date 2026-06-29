// src/main.js
// Main Orchestration Module for Blocky TDS 2D.

import { Grid } from './grid.js';
import { UI } from './ui.js';
import { EffectManager } from './particle.js';
import { Enemy } from './enemy.js';
import { soundManager } from './sound.js';
import { updateSessionTelemetry } from './firebase.js';
import { Network } from './network.js';
import { CrazyGamesManager } from './crazygames.js';
import { initWaveData } from './waves.js';

import { 
  DEFAULT_UNLOCKED_AGENTS, 
  DEFAULT_EQUIPPED_AGENTS, 
  QUEST_GOALS, 
  DEFAULT_QUEST_PROGRESS, 
  DEFAULT_QUEST_REWARDED, 
  DIFFICULTY_SETTINGS,
  getTowerCost,
  getTowerRange
} from './game-config.js';

import { 
  loadStatsFromStorage, 
  saveStatsToStorage, 
  checkQuestCompletion, 
  saveSpeedrunRecord 
} from './game-storage.js';

import { 
  evaluateSupportBuffs, 
  placeShopAgent, 
  upgradeSelectedTower, 
  sellSelectedTower, 
  skipWave, 
  startNextWave, 
  triggerCommanderAlerts, 
  spawnZombie 
} from './game-combat.js';

import { draw, preloadAllAssets } from './game-renderer.js';

class Game {
  constructor() {
    window.game = this;
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // Progression Stats
    this.playerLevel = 1;
    this.playerXp = 0;
    this.playerCoins = 150;
    this.unlockedAgents = [...DEFAULT_UNLOCKED_AGENTS];
    this.equippedAgents = [...DEFAULT_EQUIPPED_AGENTS];
    this.ownedSkins = [];
    this.equippedSkins = {};

    // Difficulty Settings
    this.selectedDifficulty = 'easy';
    this.difficultySettings = DIFFICULTY_SETTINGS;

    // Daily Quests
    this.questGoals = QUEST_GOALS;
    this.questProgress = { ...DEFAULT_QUEST_PROGRESS };
    this.questRewarded = { ...DEFAULT_QUEST_REWARDED };

    this.matchTime = 0;

    // Tutorial state
    this.tutorialCompleted = false;
    this.tutorialActive = false;
    this.tutorialStep = 0;

    this.loadStatsFromStorage();

    // In-Match stats
    this.lives = 150;
    this.gold = 400;
    this.wave = 0;
    this.isHardcore = false;
    this.maxWaves = 30;
    this.state = 'lobby'; 
    this.selectedMap = 'grassland';
    this.waveInProgress = false;
    this.hasRevivedThisMatch = false; 

    // Skipping properties
    this.skipCooldown = 0;
    this.playerWallets = {};
    this.skipVotes = new Set();

    // Economic and view properties
    this.autoMode = true;
    this.autoStartTimer = 0;
    this.showMapDirections = true;

    // Mouse metrics
    this.mousePos = { x: -1, y: -1 };
    this.mouseGrid = { col: -1, row: -1 };
    this.isMouseOnCanvas = false;
    this.smoothHoverPos = { x: 0, y: 0 };
    this.targetHoverPos = { x: 0, y: 0 };

    this.speedMultiplier = 1;
    this.enemies = [];
    this.bullets = [];
    this.spawnQueue = [];
    this.activeSpawners = [];

    this.grid = new Grid(800, 600, 40);
    this.effectManager = new EffectManager();
    this.ui = new UI(this);

    // Network initialization
    if (typeof Network !== 'undefined' && typeof Peer !== 'undefined') {
      Network.init(this, (peerId) => {
        console.log("[Signal] established Peer ID room link:", peerId);
      });
    } else {
      console.warn("[Network] Offline mode forced on start: network SDK missing or blocked.");
    }

    this.lastTime = 0;
    this.lastTouchTime = 0; // Tracks real touches to suppress fake click events

    this.initWaveBlueprints();
    this.initEventListeners();
    
    // Sync display elements
    this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);
    this.ui.renderDailyQuests();
    this.ui.renderLeaderboard(this.selectedMap);

    this.loadStatsFromStorage();
    if (!this.tutorialCompleted) {
      this.tutorialStep = 0;
    }

    CrazyGamesManager.init().then(() => {
      CrazyGamesManager.onRoomJoinReceived((params) => {
        if (params && params.roomId) {
          this.handleCrazyGamesInvite(params.roomId);
        }
      });
    });

    // Start Robust Asset Preloading
    const barFill = document.getElementById('loading-bar-fill');
    const statusText = document.getElementById('loading-status');
    preloadAllAssets(
      (percent, loaded, total) => {
        if (barFill) barFill.style.width = `${percent}%`;
        if (statusText) statusText.textContent = `Deploying Assets: ${loaded} / ${total} (${percent}%)`;
      },
      () => {
        if (statusText) statusText.textContent = "Operational Ready!";
        setTimeout(() => {
          const loader = document.getElementById('loading-screen');
          if (loader) loader.classList.add('fade-out');

          // Force Redraw Preview Canvases with newly preloaded textures
          if (this.ui && this.ui.lobby) {
            this.ui.lobby.drawAllStaticPreviews();
            this.ui.lobby.renderDailyQuests();
            this.ui.lobby.renderLeaderboard(this.selectedMap);
          }
        }, 400);
      }
    );

    requestAnimationFrame((t) => this.loop(t));
  }

  /* ───────────────────────────────────────────────────────────
     MODULE DELEGATION HOOKS
     ─────────────────────────────────────────────────────────── */

  loadStatsFromStorage() {
    loadStatsFromStorage(this);
  }

  saveStatsToStorage() {
    saveStatsToStorage(this);
  }

  checkQuestCompletion() {
    checkQuestCompletion(this);
  }

  saveSpeedrunRecord() {
    saveSpeedrunRecord(this);
  }

  evaluateSupportBuffs() {
    evaluateSupportBuffs(this);
  }

  placeShopAgent(col, row, ownerId) {
    placeShopAgent(this, col, row, ownerId);
  }

  upgradeSelectedTower() {
    upgradeSelectedTower(this);
  }

  sellSelectedTower() {
    sellSelectedTower(this);
  }

  skipWave() {
    skipWave(this);
  }

  startNextWave(isFromSkip = false) {
    startNextWave(this, isFromSkip);
  }

  triggerCommanderAlerts() {
    triggerCommanderAlerts(this);
  }

  spawnZombie(type) {
    spawnZombie(this, type);
  }

  draw() {
    draw(this);
  }

  getTowerCost(type) {
    return getTowerCost(type, this.isHardcore);
  }

  getTowerRange(type) {
    return getTowerRange(type);
  }

  /* ───────────────────────────────────────────────────────────
     CORE LIFECYCLE & INPUT PROCESSING
     ─────────────────────────────────────────────────────────── */

  buyCrate(crateType) {
    let cost = 150;
    if (crateType === 'elite') cost = 350;
    else if (crateType === 'deluxe') cost = 500;

    if (this.playerCoins < cost) {
      alert("Not enough coins to buy this crate!");
      return;
    }

    this.playerCoins -= cost;
    this.saveStatsToStorage();
    this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);

    let chosenAgent = 'scout';
    let chosenRarity = 'common';

    const roll = Math.random();

    if (crateType === 'basic') {
      if (roll < 0.80) {
        chosenRarity = 'common';
        chosenAgent = Math.random() < 0.5 ? 'scout' : 'soldier';
      } else {
        chosenRarity = 'rare';
        const subRoll = Math.random();
        chosenAgent = subRoll < 0.33 ? 'gladiator' : (subRoll < 0.66 ? 'farm' : 'sniper');
      }
    } else if (crateType === 'elite') {
      if (roll < 0.60) {
        chosenRarity = 'rare';
        const subRoll = Math.random();
        chosenAgent = subRoll < 0.33 ? 'pyromancer' : (subRoll < 0.66 ? 'farm' : 'sniper');
      } else {
        chosenRarity = 'epic';
        chosenAgent = Math.random() < 0.5 ? 'commander' : 'medic';
      }
    } else if (crateType === 'deluxe') {
      if (roll < 0.50) {
        chosenRarity = 'epic';
        chosenAgent = 'minigunner';
      } else {
        chosenRarity = 'legendary';
        chosenAgent = Math.random() < 0.5 ? 'dj' : 'rocketeer';
      }
    }

    let revealedSkinName = null;
    if (!this.unlockedAgents.includes(chosenAgent)) {
      this.unlockedAgents.push(chosenAgent);
      if (this.equippedAgents.length < 5 && !this.equippedAgents.includes(chosenAgent)) {
        this.equippedAgents.push(chosenAgent);
      }
      this.saveStatsToStorage();
    } else {
      const skinsList = ['Golden', 'Cyber', 'Hazmat'];
      const skinSuffix = skinsList[Math.floor(Math.random() * skinsList.length)];
      revealedSkinName = `${chosenAgent}_${skinSuffix}`;
      if (!this.ownedSkins.includes(revealedSkinName)) {
        this.ownedSkins.push(revealedSkinName);
        this.saveStatsToStorage();
      }
    }

    this.ui.startUnboxingAnimation(crateType, chosenAgent, chosenRarity, revealedSkinName);
  }

  handleCrazyGamesInvite(roomId) {
    if (this.state !== 'lobby') return;
    
    // Switch to client mode and join the room
    Network.mode = 'CLIENT';
    const nameInput = document.getElementById('input-player-name');
    const name = nameInput ? nameInput.value.trim() : "";
    const activeName = name || localStorage.getItem('tds_player_username') || "Guest";
    
    const joinCodeInput = document.getElementById('input-join-code');
    if (joinCodeInput) joinCodeInput.value = roomId.toUpperCase();
    if (nameInput && !nameInput.value) nameInput.value = activeName;
    
    const coopControls = document.getElementById('coop-setup-controls');
    if (coopControls) coopControls.classList.add('hidden');
    
    const coopLobbyStatus = document.getElementById('coop-lobby-status-container');
    if (coopLobbyStatus) coopLobbyStatus.classList.remove('hidden');
    
    const usernameContainer = document.getElementById('username-container');
    if (usernameContainer) usernameContainer.style.display = 'none';
    
    const labelStatus = document.getElementById('label-lobby-status');
    if (labelStatus) {
      labelStatus.textContent = "CONNECTING...";
      labelStatus.style.color = "var(--primary-orange)";
    }

    Network.join(roomId.toLowerCase(), activeName, () => {
      const labelRoomCode = document.getElementById('label-room-code');
      if (labelRoomCode) labelRoomCode.textContent = `CONNECTED TO HOST`;
      
      if (labelStatus) {
        labelStatus.textContent = "IN SQUAD (WAITING FOR HOST)";
        labelStatus.style.color = "var(--primary-blue)";
      }
      this.ui.lobby.updateCoopPlayerList();
      this.ui.lobby.toggleSoloElements(false);
      CrazyGamesManager.updateRoomPresence(roomId.toLowerCase(), true);
    });
  }

  initWaveBlueprints() {
    const data = initWaveData();
    this.waveBlueprintsEasy = data.waveBlueprintsEasy;
    this.waveBlueprintsCasual = data.waveBlueprintsCasual;
    this.waveBlueprintsIntermediate = data.waveBlueprintsIntermediate;
    this.waveBlueprintsMolten = data.waveBlueprintsMolten;
    this.waveBlueprintsFallen = data.waveBlueprintsFallen;
  }

  _getCanvasCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  _handleGridInteraction() {
    if (this.state !== 'playing') return;

    if (this.showMapDirections) {
      this.showMapDirections = false;
      if (this.tutorialActive && this.tutorialStep === 0.5) {
        this.tutorialStep = 1;
        this.ui.showTutorialHint(1);
      }
      return;
    }
    const col = this.mouseGrid.col;
    const row = this.mouseGrid.row;

    if (Network.mode === 'CLIENT') {
      const key = `${col},${row}`;
      if (this.grid.towers.has(key)) {
        const agent = this.grid.towers.get(key);
        this.setSelectedPlacedTower(agent);
        this.selectedShopTower = null;
      } else if (this.selectedShopTower) {
        const activeSkin = this.equippedSkins[this.selectedShopTower] || 'default';
        Network.conn.send({
          type: 'PLACE_TOWER',
          col: col,
          row: row,
          targetShopTower: this.selectedShopTower,
          skin: activeSkin
        });
      } else {
        this.setSelectedPlacedTower(null);
      }
    } else {
      const key = `${col},${row}`;
      if (this.grid.towers.has(key)) {
        const agent = this.grid.towers.get(key);
        this.setSelectedPlacedTower(agent);
        this.selectedShopTower = null;
      } else {
        if (this.selectedShopTower) {
          this.placeShopAgent(col, row, window.myPlayerId);
        } else {
          this.setSelectedPlacedTower(null);
        }
      }
    }
  }

  initEventListeners() {
    this.canvas.addEventListener('mousemove', (e) => {
      const { x, y } = this._getCanvasCoords(e.clientX, e.clientY);
      this.mousePos.x = x;
      this.mousePos.y = y;
      this.mouseGrid = this.grid.pixelToGrid(x, y);
      this.isMouseOnCanvas = true;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isMouseOnCanvas = false;
      this.mouseGrid = { col: -1, row: -1 };
    });

    this.canvas.addEventListener('click', () => {
      // Ignore click event if it was triggered by a touch event within the last 500ms
      if (this.lastTouchTime && (Date.now() - this.lastTouchTime < 500)) {
        return;
      }
      this._handleGridInteraction();
    });

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const { x, y } = this._getCanvasCoords(touch.clientX, touch.clientY);
      this.mousePos.x = x;
      this.mousePos.y = y;
      this.mouseGrid = this.grid.pixelToGrid(x, y);
      this.isMouseOnCanvas = true;
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const { x, y } = this._getCanvasCoords(touch.clientX, touch.clientY);
      this.mousePos.x = x;
      this.mousePos.y = y;
      this.mouseGrid = this.grid.pixelToGrid(x, y);
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.lastTouchTime = Date.now(); // Record real touch time
      const touch = e.changedTouches[0];
      if (touch) {
        const { x, y } = this._getCanvasCoords(touch.clientX, touch.clientY);
        this.mousePos.x = x;
        this.mousePos.y = y;
        this.mouseGrid = this.grid.pixelToGrid(x, y);
        this.isMouseOnCanvas = true;
      }
      this._handleGridInteraction();
      setTimeout(() => {
        this.isMouseOnCanvas = false;
        this.mouseGrid = { col: -1, row: -1 };
      }, 250);
    }, { passive: false });
  }

  setSelectedMap(mapId) {
    this.selectedMap = mapId;
  }

  setSelectedShopTower(type) {
    this.selectedShopTower = type;

    // Clear directions immediately if they select a unit first
    if (this.showMapDirections) {
      this.showMapDirections = false;
      if (this.tutorialActive && this.tutorialStep === 0.5) {
        this.tutorialStep = 1;
        this.ui.showTutorialHint(1);
      }
    }

    if (this.tutorialActive && this.tutorialStep === 1 && type === 'scout') {
      this.tutorialStep = 1.5;
      this.ui.showTutorialHint(1.5);
    }
  }

  setSelectedPlacedTower(agent) {
    this.selectedPlacedTower = agent;
    this.ui.updateSelectionPanel(agent);

    if (this.tutorialActive && this.tutorialStep === 2) {
      if (agent && agent.type === 'scout') {
        this.tutorialStep = 2.5;
        this.ui.showTutorialHint(2.5); 
      } else {
        this.ui.hidePointer();
      }
    }
  }

  toggleLoadoutAgent(type) {
    const idx = this.equippedAgents.indexOf(type);
    if (idx !== -1) {
      if (this.equippedAgents.length > 1) {
        this.equippedAgents.splice(idx, 1);
      }
    } else {
      if (this.equippedAgents.length < 5) {
        this.equippedAgents.push(type);
      } else {
        this.effectManager.spawnText(400, 300, "LOADOUT FULL (MAX 5)", '#e74c3c');
      }
    }
    this.saveStatsToStorage();
  }

  deployToMatch() {
    try {
      this.state = 'playing';
      this.showMapDirections = true;
      this.autoStartTimer = 0; 
      
      this.grid.selectMap(this.selectedMap);

      updateSessionTelemetry({ deployed: true, selectedMap: this.selectedMap });
      
      const diffConfig = this.difficultySettings[this.selectedDifficulty];

      const hcCheckbox = document.getElementById('hardcore-toggle');
      this.isHardcore = hcCheckbox ? hcCheckbox.checked : false;
      Enemy.hardcoreMode = this.isHardcore;

      this.lives = this.isHardcore ? 10 : (this.selectedDifficulty === 'easy' ? 150 : 100);
      this.gold = this.isHardcore ? 250 : diffConfig.startGold;
      this.wave = 0;
      this.maxWaves = diffConfig.maxWaves;
      this.waveInProgress = false;
      this.hasRevivedThisMatch = false; 
      this.speedMultiplier = 1;
      this.enemies = [];
      this.bullets = [];
      this.spawnQueue = [];
      this.activeSpawners = [];

      this.grid.clear();
      this.effectManager.clear();

      const runTutorialThisMatch = !this.tutorialCompleted;

      if (runTutorialThisMatch) {
        this.tutorialActive = true;
        this.tutorialStep = 0.5; 
        this.selectedShopTower = null;

        this.tutorialCompleted = true;
        this.saveStatsToStorage();
      } else {
        this.tutorialActive = false;
        this.selectedShopTower = this.equippedAgents[0];
      }

      this.playerWallets = {};
      this.playerWallets[window.myPlayerId] = this.gold;
      for (const c of Network.conns) {
        if (c && c.open) {
          this.playerWallets[c.playerId] = this.gold;
        }
      }

      if (Network.mode === 'HOST') {
        Network.broadcastToAll({
          type: 'START',
          selectedMap: this.selectedMap,
          isHardcore: this.isHardcore,
          playerWallets: this.playerWallets,
          obstacles: this.grid.obstacles,
          lives: this.lives,
          gold: this.gold,
          maxWaves: this.maxWaves
        });
      }

      let mapName = 'Grassland';
      if (this.selectedMap === 'desert') mapName = 'Desert Outpost';
      else if (this.selectedMap === 'tundra') mapName = 'Frost Tundra';
      else if (this.selectedMap === 'cyber_city') mapName = 'Cyber City';
      else if (this.selectedMap === 'fallen_outpost') mapName = 'Fallen Outpost';

      this.ui.showGameLayout(mapName);
      this.ui.renderPlacementShop();
      this.ui.updateSpeedButton(1);
      this.ui.updateWaveButton(false);
      this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);

      if (runTutorialThisMatch) {
        this.tutorialStep = 0.5;
      }
    } catch (e) {
      console.error("Defensive Guard: Error caught in deployToMatch():", e);
    }
  }

  quitToLobby() {
    this.tutorialActive = false; 
    CrazyGamesManager.requestMidgameAd(() => {
      this.state = 'lobby';
      this.ui.showLobbyLayout();
      this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);
      this.ui.renderDailyQuests();
      this.ui.renderLeaderboard(this.selectedMap);

      if (!this.tutorialCompleted && this.tutorialStep === 0) {
        this.ui.showTutorialHint(0);
      }
    });
  }

  revivePlayer() {
    this.state = 'playing';
    this.lives = 50; 
    this.hasRevivedThisMatch = true;
    this.waveInProgress = false; 

    CrazyGamesManager.gameplayStart();

    this.ui.updateWaveButton(false);
    this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
    
    this.effectManager.spawnText(this.canvas.width / 2, this.canvas.height / 2, "REVIVED!", '#2ecc71');
    this.effectManager.spawnPlacementSparks(this.canvas.width / 2, this.canvas.height / 2, 80);
  }

  voteSkipWave() {
    if (Network.mode === 'CLIENT') {
      if (Network.conn && Network.conn.open) {
        Network.conn.send({ type: 'VOTE_SKIP' });
      }
    } else {
      if (!this.skipVotes) this.skipVotes = new Set();
      this.skipVotes.add('p1');
      
      const required = Math.ceil((Network.conns.filter(c => c && c.open).length + 1) / 2);
      if (this.skipVotes.size >= required) {
        this.skipVotes.clear();
        this.skipWave(); 
      } else {
        this.effectManager.spawnText(400, 260, `SKIP VOTE: ${this.skipVotes.size}/${required}`, '#e67e22');
      }
    }
  }

  toggleAutoMode() {
    this.autoMode = !this.autoMode;
    if (!this.autoMode) this.autoStartTimer = 0;
    this.ui.updateAutoWaveButton(this.autoMode);
  }

  toggleSpeed() {
    this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
    this.ui.updateSpeedButton(this.speedMultiplier);
  }

  /* ───────────────────────────────────────────────────────────
     ANIMATION & STATE SYNCHRONIZATION RUNTIME
     ─────────────────────────────────────────────────────────── */

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000.0) * this.speedMultiplier;
    this.lastTime = timestamp;

    if (this.state === 'playing' || this.state === 'victory' || this.state === 'gameover') {
      this.matchTime += dt;
      this.update(dt);
      this.draw(); 
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (this.isMouseOnCanvas) {
      this.targetHoverPos.x = this.mousePos.x;
      this.targetHoverPos.y = this.mousePos.y;

      this.smoothHoverPos.x += (this.targetHoverPos.x - this.smoothHoverPos.x) * 18 * dt;
      this.smoothHoverPos.y += (this.targetHoverPos.y - this.smoothHoverPos.y) * 18 * dt;
    }

    if (Network.mode === 'CLIENT') {
      Network.sendClientData();
      Network.checkHostHeartbeat();
      this.effectManager.update(dt);

      for (const zombie of this.enemies) {
        if (zombie.targetX !== undefined && zombie.targetY !== undefined) {
          const lerpFactor = 1.0 - Math.exp(-18 * dt); 
          zombie.x += (zombie.targetX - zombie.x) * lerpFactor;
          zombie.y += (zombie.targetY - zombie.y) * lerpFactor;
        }
        if (zombie.hitFlashTimer > 0) {
          zombie.hitFlashTimer -= dt;
        }
        if (!zombie.timeAccumulator) zombie.timeAccumulator = 0;
        zombie.timeAccumulator += dt;
      }

      for (const tower of this.grid.towers.values()) {
        if (!tower.timeAccumulator) tower.timeAccumulator = 0;
        tower.timeAccumulator += dt;
        if (tower.fireCooldown > 0) {
          tower.fireCooldown -= dt;
        }
        if (tower.recoilOffset > 0) {
          tower.recoilOffset -= dt * 30;
          if (tower.recoilOffset < 0) tower.recoilOffset = 0;
        }
      }

      return; 
    }

    if (Network.mode === 'HOST') {
      Network.broadcastState();
    }

    if (this.autoMode && !this.waveInProgress && this.autoStartTimer > 0 && this.state === 'playing' && !this.showMapDirections) {
      this.autoStartTimer -= dt;
      if (this.autoStartTimer <= 0) {
        this.autoStartTimer = 0;
        if (this.wave < this.maxWaves) {
          this.startNextWave();
        }
      }
    }

    if (!this.showMapDirections) {
      for (let i = this.activeSpawners.length - 1; i >= 0; i--) {
        const spawner = this.activeSpawners[i];
        spawner.timer += dt;
        if (spawner.timer >= spawner.interval) {
          spawner.timer = 0;
          const nextType = spawner.queue.shift();
          this.spawnZombie(nextType);
        }
        if (spawner.queue.length === 0) {
          this.activeSpawners.splice(i, 1);
        }
      }
    }

    this.evaluateSupportBuffs();

    if (this.skipCooldown > 0) {
      this.skipCooldown -= dt;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const zombie = this.enemies[i];
      zombie.update(this.grid.pixelPath, this.effectManager, dt, this.enemies, this.grid.towers);

      if (zombie.health <= 0) {
        const reward = zombie.goldReward || 10;
        this.gold += reward;
        if (this.playerWallets) {
          this.playerWallets['p1'] = (this.playerWallets['p1'] || 0) + reward;
        }
        this.effectManager.spawnText(zombie.x, zombie.y - 10, `+$${reward}`, '#f1c40f');
        this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);

        this.questProgress.kills++;
        this.checkQuestCompletion();
        this.enemies.splice(i, 1);
        continue;
      }

      if (zombie.targetNodeIndex >= this.grid.pixelPath.length) {
        const damage = zombie.baseDamage || 1;
        this.lives -= damage;
        this.effectManager.spawnText(zombie.x, zombie.y - 18, `-${damage} HP`, '#e74c3c');
        this.enemies.splice(i, 1);
        
        if (this.lives <= 0) {
          this.lives = 0;
          this.state = 'gameover';
          soundManager.playDefeat();
          this.ui.showMatchSummaryCard(false);
          this.saveStatsToStorage();
        } else {
          this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
        }
        continue;
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const projectile = this.bullets[i];
      const isDead = projectile.update(this.effectManager, this.enemies, dt);
      if (isDead) {
        this.bullets.splice(i, 1);
      }
    }

    for (const agent of this.grid.towers.values()) {
      agent.update(this.enemies, this.effectManager, this.bullets, dt);
    }

    this.effectManager.update(dt);

    if (this.waveInProgress && this.enemies.length === 0 && this.activeSpawners.length === 0) {
      this.waveInProgress = false;

      for (const agent of this.grid.towers.values()) {
        if (agent.type === 'farm') {
          const income = agent.getHarvestIncome();
          const owner = agent.ownerId || 'p1';
          
          if (Network.mode === 'HOST') {
            if (owner === 'p1') {
              this.gold += income;
              this.playerWallets['p1'] = this.gold;
            } else {
              this.playerWallets[owner] = (this.playerWallets[owner] || 0) + income;
            }
          } else {
            this.gold += income;
          }
          this.effectManager.spawnText(agent.x, agent.y - 20, `+$${income}`, '#2ecc71');
        }
      }

      let cashBonus = 80 + this.wave * 10;
      if (this.isHardcore) {
        cashBonus = Math.floor(cashBonus * 0.75);
      }

      if (Network.mode === 'HOST' && this.playerWallets) {
        this.gold += cashBonus;
        this.playerWallets['p1'] = this.gold;
        for (const pId of Object.keys(this.playerWallets)) {
          if (pId !== 'p1') {
            this.playerWallets[pId] = (this.playerWallets[pId] || 0) + cashBonus;
          }
        }
      } else {
        this.gold += cashBonus;
      }

      let coinReward = 0;
      let xpReward = 0;

      if (this.wave >= this.maxWaves) {
        this.state = 'victory';
        soundManager.playVictory();
        this.saveSpeedrunRecord();
        
        const diffConfig = this.difficultySettings[this.selectedDifficulty];
        coinReward = Math.round(300 * diffConfig.coinMultiplier);
        xpReward = Math.round(200 * diffConfig.xpMultiplier);

        if (this.isHardcore) {
          coinReward *= 3;
          xpReward *= 3;
        }

        this.playerCoins += coinReward;
        this.playerXp += xpReward;

        const nextLevelXp = this.playerLevel * 100;
        if (this.playerXp >= nextLevelXp) {
          this.playerXp -= nextLevelXp;
          this.playerLevel++;
          soundManager.playUpgrade();
          this.effectManager.spawnText(400, 200, `LEVEL UP! LEVEL ${this.playerLevel}`, '#f1c40f');
        }

        this.saveStatsToStorage();

        this.ui.showMatchSummaryCard(true);
        if (Network.mode === 'HOST') {
          Network.broadcastToAll({
            type: 'MATCH_OVER',
            isVictory: true
          });
        }
      } else {
        this.autoStartTimer = this.selectedDifficulty === 'easy' ? 6.0 : 4.0;
        this.ui.showAutoCountdown(Math.ceil(this.autoStartTimer));
      }

      this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
    }
  }

  updateWaveButton(waveInProgress) {
    if (this.ui) {
      this.ui.updateWaveButton(waveInProgress);
    }
  }

  getPlayerColor(id) {
    if (id === 'p1') return '#3498db'; 
    if (id === 'p2') return '#e67e22'; 
    if (id === 'p3') return '#2ecc71'; 
    if (id === 'p4') return '#9b59b6'; 
    if (id === 'p5') return '#f1c40f'; 
    if (id === 'p6') return '#e74c3c'; 
    if (id === 'p7') return '#1abc9c'; 
    return '#10ac84'; 
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});