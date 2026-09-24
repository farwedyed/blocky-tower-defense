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
  saveSpeedrunRecord,
  awardMatchRewards
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

import { draw, preloadAllAssets, preloadUIAssets } from './game-renderer.js';

class Game {
  constructor() {
    window.game = this;
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // 1. Initialize all core engine modules FIRST to prevent race conditions
    this.grid = new Grid(800, 600, 40);
    this.effectManager = new EffectManager();
    this.ui = new UI(this);

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

    // Cash Case Airdrop System
    this.activeCashCase = null;
    this.cashCaseSpawnTimer = 40.0;
    this.cashCaseImg = new Image();
    this.cashCaseImg.src = 'assets/sprites/CashCase.png'; 

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

    this.initWaveBlueprints();
    this.initEventListeners();

    
    // Network initialization
    if (typeof Network !== 'undefined') {
      Network.init(this, () => {
        console.log("[Network] Connected to Azure Cloud Server!");
      });
    } else {
      console.warn("[Network] Offline mode forced on start: network SDK missing or blocked.");
    }

    this.lastTime = 0;
    this.lastTouchTime = 0;

    // Initialize CrazyGames SDK
    CrazyGamesManager.init().then(async () => {
      CrazyGamesManager.gameLoadingStart();

      await this.loadStatsFromStorage();

      let savedUser = localStorage.getItem('tds_player_username');
      if (!savedUser || savedUser === 'Guest' || savedUser.toLowerCase().startsWith('guest')) {
        const randomId = String(Math.floor(1000 + Math.random() * 9000));
        savedUser = `Guest Player_${randomId}`;
        localStorage.setItem('tds_player_username', savedUser);
      }
      const nameInput = document.getElementById('input-player-name');
      if (nameInput) {
        nameInput.value = savedUser;
        nameInput.disabled = true;
      }

      this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);
      this.ui.renderDailyQuests();
      this.ui.renderLeaderboard(this.selectedMap);

      CrazyGamesManager.onRoomJoinReceived((params) => {
        if (params && params.roomId) {
          this.handleCrazyGamesInvite(params.roomId);
        }
      });

      const barFillImg = document.getElementById('loading-bar-fill-img');
      const percentText = document.getElementById('loading-percent');
      const statusText = document.getElementById('loading-status');

      // ─── HYBRID ASYMPTOTIC PROGRESS ENGINE ───
      let displayedPercent = 0;
      let targetPercent = 5;
      let isFullyLoaded = false;
      let lastFrameTime = performance.now();

      const updateProgressVisuals = (pct) => {
        const rounded = Math.min(100, Math.floor(pct));
        if (barFillImg) {
          barFillImg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
          barFillImg.style.webkitClipPath = `inset(0 ${100 - pct}% 0 0)`;
        }
        if (percentText) percentText.textContent = `${rounded}%`;
      };

      // Continuous loop: creeps forward on slow net, surges forward when assets download
      const progressLoop = (now) => {
        const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
        lastFrameTime = now;

        if (!isFullyLoaded) {
          // Creep forward slowly (min 2.5% per sec) so it never completely stops
          targetPercent = Math.min(92, targetPercent + 2.5 * dt);

          // Fast smooth interpolation toward the target
          const catchUpSpeed = displayedPercent < targetPercent ? 10.0 : 3.0;
          displayedPercent += (targetPercent - displayedPercent) * Math.min(1.0, dt * catchUpSpeed);
          updateProgressVisuals(displayedPercent);

          requestAnimationFrame(progressLoop);
        } else {
          // Final surge to 100%
          displayedPercent += (100 - displayedPercent) * Math.min(1.0, dt * 18.0);
          updateProgressVisuals(displayedPercent);

          if (displayedPercent < 99.5) {
            requestAnimationFrame(progressLoop);
          } else {
            updateProgressVisuals(100);
          }
        }
      };
      requestAnimationFrame(progressLoop);

      if (statusText) statusText.textContent = "Loading Interface Assets...";

      // Step 1: Preload UI folder
      preloadUIAssets(() => {
        targetPercent = Math.max(targetPercent, 18);
        if (statusText) statusText.textContent = "Deploying Combat Units...";

        // Step 2: Preload game sprites
        preloadAllAssets(
          (percent, loaded, total) => {
            // Map real download progress from 18% to 92%
            const realMapped = 18 + (percent * 0.74);
            if (realMapped > targetPercent) {
              targetPercent = realMapped; // Instant surge forward when batch finishes!
            }
            if (statusText) statusText.textContent = `Deploying Assets: ${loaded} / ${total}`;
          },
          () => {
            // All assets finished downloading!
            isFullyLoaded = true;
            if (statusText) statusText.textContent = "Operational Ready!";

            setTimeout(() => {
              const loader = document.getElementById('loading-screen');
              if (loader) loader.classList.add('fade-out');

              CrazyGamesManager.gameLoadingStop();

              const params = new URLSearchParams(window.location.search);
              const startupRoomId = params.get('roomId');

              if (CrazyGamesManager.isInstantMultiplayer() || startupRoomId) {
                console.log('[CrazyGames] Multiplayer join/host triggered on launch. Bypassing onboarding.');
                this.tutorialCompleted = true;
                this.tutorialActive = false;
                this.saveStatsToStorage();

                if (startupRoomId) {
                  this.handleCrazyGamesInvite(startupRoomId);
                } else {
                  this.autoHostMultiplayerLobby();
                }
                return;
              }

              if (!this.tutorialCompleted) {
                console.log('[Onboarding] First-time player detected! Deploying directly to tutorial match.');
                this.selectedMap = 'grassland';
                this.selectedDifficulty = 'easy';
                this.deployToMatch();
              } else {
                if (this.ui && this.ui.lobby) {
                  this.ui.lobby.showSplashState();
                }
              }

              if (this.ui && this.ui.lobby) {
                this.ui.lobby.drawAllStaticPreviews();
                this.ui.lobby.renderDailyQuests();
                this.ui.lobby.renderLeaderboard(this.selectedMap);
              }
            }, 450);
          }
        );
      });
    });

    requestAnimationFrame((t) => this.loop(t));
  }

  async loadStatsFromStorage() {
    await loadStatsFromStorage(this);
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

    // Trigger mid-game Cash Case 5 seconds into scheduled mid-game waves
    if (Network.mode !== 'CLIENT' && this.cashCaseTargetWaves && this.cashCaseTargetWaves.includes(this.wave) && this.cashCaseSpawnCount < this.maxCashCasesPerMatch) {
      setTimeout(() => {
        if (this.state === 'playing' && !this.activeCashCase) {
          this.spawnCashCase();
        }
      }, 5000);
    }
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
    
    Network.mode = 'CLIENT';
    const nameInput = document.getElementById('input-player-name');
    const name = nameInput ? nameInput.value.trim() : "";
    const activeName = (CrazyGamesManager.currentUser && CrazyGamesManager.currentUser.username)
        || name || localStorage.getItem('tds_player_username') || "Guest";
    
    const joinCodeInput = document.getElementById('input-join-code');
    if (joinCodeInput) joinCodeInput.value = roomId.toUpperCase();
    if (nameInput && !nameInput.value) nameInput.value = activeName;

    const splash = document.getElementById('lobby-splash-container');
    if (splash) splash.style.display = 'none';

    const coopHeaderPanel = document.getElementById('coop-header-panel');
    if (coopHeaderPanel) coopHeaderPanel.classList.remove('hidden');
    
    const coopControls = document.getElementById('coop-setup-controls');
    if (coopControls) coopControls.classList.add('hidden');
    
    const coopLobbyStatus = document.getElementById('coop-lobby-status-container');
    if (coopLobbyStatus) coopLobbyStatus.classList.remove('hidden');

    const coopLobbyFooter = document.getElementById('coop-footer-panel');
    if (coopLobbyFooter) {
      coopLobbyFooter.classList.remove('hidden');
      coopLobbyFooter.style.display = 'block';
    }
    
    const usernameContainer = document.getElementById('username-container');
    if (usernameContainer) usernameContainer.style.display = 'none';
    
    const labelStatus = document.getElementById('label-lobby-status');
    if (labelStatus) {
      labelStatus.textContent = "CONNECTING...";
      labelStatus.style.color = "var(--primary-orange)";
    }

    Network.join(roomId.toLowerCase(), activeName, () => {
      const labelRoomCode = document.getElementById('label-room-code');
      if (labelRoomCode) labelRoomCode.textContent = `ROOM CODE: ${roomId.toUpperCase()}`;

      // Unhide copy link button when joining through CrazyGames invite link
      const copyCodeBtn = document.getElementById('btn-copy-code');
      if (copyCodeBtn) copyCodeBtn.classList.remove('hidden');
      
      if (labelStatus) {
        labelStatus.textContent = "IN SQUAD (WAITING FOR LEADER)";
        labelStatus.style.color = "var(--primary-blue)";
      }
      this.ui.lobby.updateCoopPlayerList();
      this.ui.lobby.toggleSoloElements(false);
      Network.syncRoomPresence();
    }, true);
  }
  
  autoHostMultiplayerLobby() {
    const splash = document.getElementById('lobby-splash-container');
    if (splash) splash.style.display = 'none';
    
    const coopHeaderPanel = document.getElementById('coop-header-panel');
    if (coopHeaderPanel) coopHeaderPanel.classList.remove('hidden');

    const nameInput = document.getElementById('input-player-name');
    if (nameInput) {
      nameInput.disabled = true;
    }

    const btnHost = document.getElementById('btn-host-coop');
    if (btnHost) {
      btnHost.click();
    }
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

    const mx = this.mousePos.x;
    const my = this.mousePos.y;

    // Check if Cash Case was clicked
    if (this.activeCashCase && !this.showMapDirections) {
      const dist = Math.hypot(mx - this.activeCashCase.x, my - this.activeCashCase.y);
      if (dist <= 30) {
        soundManager.playTick();
        this.ui.gameUI.showCashCaseModal(this.activeCashCase);
        return;
      }
    }

    if (this.showMapDirections) {
      this.showMapDirections = false;
      if (!this.tutorialActive) CrazyGamesManager.gameplayStart();
      if (this.tutorialActive && this.tutorialStep === 0.5) {
        this.tutorialStep = 1;
        this.ui.showTutorialHint(1);
      }
      return;
    }

    // Check if player clicked directly on an existing placed tower
    const clickedTower = this.grid.getTowerAt(mx, my);

    if (clickedTower) {
      this.setSelectedPlacedTower(clickedTower);
      this.selectedShopTower = null;
      soundManager.playTick();
      return;
    }

    // If placing a new troop from the shop at exact (x, y)
    if (this.selectedShopTower) {
      if (Network.mode === 'CLIENT') {
        const activeSkin = this.equippedSkins[this.selectedShopTower] || 'default';
        Network.conn.send({
          type: 'PLACE_TOWER',
          x: mx,
          y: my,
          col: Math.floor(mx / this.grid.cellSize),
          row: Math.floor(my / this.grid.cellSize),
          targetShopTower: this.selectedShopTower,
          skin: activeSkin
        });
      } else {
        this.placeShopAgent(mx, my, window.myPlayerId);
      }
    } else {
      this.setSelectedPlacedTower(null);
    }
  }

  updateFullscreenClass() {
    const container = document.getElementById('app-container');
    if (!container) return;

    const isCrazyGames = window.location.hostname.includes('crazygames') || window.location.hostname.includes('game-files');
    if (isCrazyGames) {
      container.classList.add('fullscreen-active');
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const screenWidthLogical = window.screen.width / dpr;
    const screenHeightLogical = window.screen.height / dpr;

    const isNativeFull = !!(document.fullscreenElement || 
                            document.webkitFullscreenElement || 
                            document.mozFullScreenElement || 
                            document.msFullscreenElement ||
                            window.matchMedia('(display-mode: fullscreen)').matches);

    const matchesScreenSize = (window.innerWidth >= screenWidthLogical - 150) && 
                              (window.innerHeight >= screenHeightLogical - 250);

    if (isNativeFull || matchesScreenSize) {
      container.classList.add('fullscreen-active');
    } else {
      container.classList.remove('fullscreen-active');
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

    // Right-click anywhere on the map cancels placement mode
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.setSelectedShopTower(null);
      this.setSelectedPlacedTower(null);
      document.querySelectorAll('.placement-btn').forEach(b => b.classList.remove('active'));
    });

    this.canvas.addEventListener('click', () => {
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
      this.lastTouchTime = Date.now();
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

    window.addEventListener('keydown', (e) => {
      if (this.state !== 'playing') return;
      
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'u') {
        e.preventDefault();
        this.upgradeSelectedTower();
      } else if (key === 's') {
        e.preventDefault();
        this.sellSelectedTower();
      } else if (key === 'escape') {
        e.preventDefault();
        this.setSelectedShopTower(null);
        this.setSelectedPlacedTower(null);
        document.querySelectorAll('.placement-btn').forEach(b => b.classList.remove('active'));
      }
    });

    window.addEventListener('resize', () => {
      this.updateFullscreenClass();
    });
    
    // Automatically clean up multiplayer rooms when closing or refreshing the tab
    const handleTabExit = () => {
      if (typeof Network !== 'undefined' && Network.mode !== 'OFFLINE' && Network.roomId) {
        Network.disconnect();
      }
    };
    window.addEventListener('beforeunload', handleTabExit);
    window.addEventListener('pagehide', handleTabExit);

    this.updateFullscreenClass();
  }

  setSelectedMap(mapId) {
    this.selectedMap = mapId;
  }

  setSelectedShopTower(type) {
    this.selectedShopTower = type;

    if (this.showMapDirections) {
      this.showMapDirections = false;
      
      if (!this.tutorialActive) {
        CrazyGamesManager.gameplayStart();
      }

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
    // Avoid calling midgame ads for first-time players entering the tutorial match
    if (Network.mode === 'OFFLINE' && this.tutorialCompleted) {
      CrazyGamesManager.requestMidgameAd(() => {
        this.continueDeployment();
      });
    } else {
      this.continueDeployment();
    }
  }

  continueDeployment() {
    try {
      this._rewardsClaimed = false; // Reset rewards claim flag for new match
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
      this.matchTime = 0;
      this.enemies = [];
      this.bullets = [];
      this.spawnQueue = [];
      this.activeSpawners = [];
      this.activeCashCase = null;

      // Limit to 1 - 2 drops per game, scheduled for mid-game waves
      this.cashCaseSpawnCount = 0;
      this.maxCashCasesPerMatch = Math.random() < 0.5 ? 1 : 2;
      const firstWave = Math.max(6, Math.floor(this.maxWaves * 0.25));
      const secondWave = Math.max(firstWave + 7, Math.floor(this.maxWaves * 0.60));
      this.cashCaseTargetWaves = this.maxCashCasesPerMatch === 2 ? [firstWave, secondWave] : [firstWave];

      this.grid.clear();
      this.effectManager.clear();

      const runTutorialThisMatch = !this.tutorialCompleted && (Network.mode === 'OFFLINE');

      if (runTutorialThisMatch) {
        this.tutorialActive = true;
        this.tutorialStep = 0.5; 
        this.selectedShopTower = null;
        this.tutorialCompleted = true;
        this.saveStatsToStorage();
      } else {
        this.tutorialActive = false;
        // Start match with clean battlefield (no troop pre-selected until clicked)
        this.selectedShopTower = null;
      }

      this.playerWallets = {};
      for (const slot of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
        if (window.lobbyPlayers[slot]) {
          this.playerWallets[slot] = this.gold;
        }
      }

      if (Network.mode === 'HOST') {
        if (Network.peer && Network.peer.id) {
          CrazyGamesManager.updateRoomPresence(Network.peer.id.toLowerCase(), false);
        }

        Network.broadcastToAll({
          type: 'START',
          selectedMap: this.selectedMap,
          selectedDifficulty: this.selectedDifficulty,
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

  quitToLobby(forceDisconnect = false) {
    this.tutorialActive = false; 
    this.tutorialCompleted = true;
    this.waveInProgress = false; // CRITICAL: Reset wave state so isJoinable stays true in lobby
    this.saveStatsToStorage();
    CrazyGamesManager.gameplayStop();

    // Grant earned coins and XP when quitting mid-match from the game view
    if (this.state === 'playing') {
      awardMatchRewards(this);
    }
    
    const returnAction = () => {
      this.state = 'lobby';
      this.waveInProgress = false;
      this.ui.showLobbyLayout();
      if (Network.mode === 'HOST' && Network.roomId) {
        Network.syncRoomPresence();
      }
    };

    if (Network.mode !== 'OFFLINE' && !forceDisconnect) {
      this.state = 'lobby';
      this.ui.showLobbyLayout();

      if (Network.mode === 'HOST') {
        Network.syncRoomPresence();
        Network.broadcastToAll({
          type: 'RETURN_TO_LOBBY'
        });
      }
      return;
    }

    if (Network.mode !== 'OFFLINE') {
        try {
          CrazyGamesManager.leaveRoomPresence();
        } catch (err) {
          console.warn("[CrazyGames] leftRoom notification exception caught:", err);
        }

        // Properly disconnect from WebSocket server so room is purged immediately
        Network.disconnect();

        Network.mode = 'OFFLINE';
        window.lobbyPlayers = { p1: "Host Survivor", p2: "", p3: "", p4: "", p5: "", p6: "", p7: "", p8: "" };
        window.myPlayerId = "p1";

        CrazyGamesManager.requestMidgameAd(returnAction);
      } else {
        returnAction();
      }
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
      this.skipVotes.add(window.myPlayerId);
      
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
    if (!this.autoMode) {
      this.autoStartTimer = 0;
      if (this.ui) {
        this.ui.updateWaveButton(this.waveInProgress);
      }
    }
    this.ui.updateAutoWaveButton(this.autoMode);
  }

  toggleSpeed() {
    this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
    this.ui.updateSpeedButton(this.speedMultiplier);
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000.0) * this.speedMultiplier;
    this.lastTime = timestamp;

    if (this.state === 'playing') {
      if (!this.fpsTicks) {
        this.fpsTicks = 0;
        this.fpsAccumulator = 0;
      }
      this.fpsTicks++;
      this.fpsAccumulator += dt;

      if (this.fpsAccumulator >= 5.0) { 
        const avgFps = Math.round(this.fpsTicks / this.fpsAccumulator);
        if (avgFps < 20) {
          console.warn(`[Performance Alert] Low FPS detected: ${avgFps} FPS over last 5s.`);
        }
        this.fpsTicks = 0;
        this.fpsAccumulator = 0;
      }
    }

    if (this.state === 'playing' || this.state === 'victory' || this.state === 'gameover') {
      if (this.state === 'playing') {
        this.matchTime += dt;
      }
      this.update(dt);
      this.draw(); 
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (this.state !== 'playing') return; 

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
      } else {
        if (this.ui) {
          this.ui.showAutoCountdown(Math.ceil(this.autoStartTimer));
        }
      }
    }

    // Cash Case Lifespan Timer (Disappears after 25s if not claimed)
    if (this.activeCashCase && !this.showMapDirections) {
      this.activeCashCase.life -= dt;
      if (this.activeCashCase.life <= 0) {
        this.dismissCashCase();
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
      if (this.ui && this.ui.gameUI && this.ui.gameUI.btnSkipWave) {
        this.ui.gameUI.btnSkipWave.textContent = `COOLDOWN (${Math.ceil(this.skipCooldown)}s)`;
      }
      if (this.skipCooldown <= 0) {
        this.skipCooldown = 0;
        if (this.ui) {
          this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
        }
      }
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
          this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
          soundManager.playDefeat();
          this.ui.showMatchSummaryCard(false);
          this.saveStatsToStorage();
          CrazyGamesManager.gameplayStop(); 
          if (Network.mode === 'HOST') {
            Network.broadcastGameOver(this.wave);
          }
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

      this.questProgress.wavesSurvived = (this.questProgress.wavesSurvived || 0) + 1;
      this.checkQuestCompletion();

      if (this.wave >= this.maxWaves) {
        this.state = 'victory';
        soundManager.playVictory();
        this.saveSpeedrunRecord();
        CrazyGamesManager.gameplayStop(); 

        this.saveStatsToStorage();

        this.ui.showMatchSummaryCard(true);
        if (Network.mode === 'HOST') {
          Network.broadcastGameOver(this.wave);
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

  spawnCashCase() {
    if (this.cashCaseSpawnCount >= this.maxCashCasesPerMatch) return;

    // Filter for valid open spots that are NEVER on the road and NEVER on top of agents
    const validSpots = [];
    for (let col = 1; col < this.grid.cols - 1; col++) {
      for (let row = 1; row < this.grid.rows - 1; row++) {
        const key = `${col},${row}`;
        if (this.grid.pathTiles && this.grid.pathTiles.has(key)) continue; // Not on the road
        if (this.grid.towers && this.grid.towers.has(key)) continue;       // Not on top of agents
        validSpots.push({ col, row });
      }
    }

    if (validSpots.length === 0) return;

    const chosen = validSpots[Math.floor(Math.random() * validSpots.length)];
    const x = chosen.col * this.grid.cellSize + this.grid.cellSize / 2;
    const y = chosen.row * this.grid.cellSize + this.grid.cellSize / 2;
    const reward = Math.round(200 + (this.wave * 50));

    const newCase = {
      id: 'case_' + Date.now(),
      x: Math.round(x),
      y: Math.round(y),
      reward: reward,
      life: 25.0,
      maxLife: 25.0
    };

    this.activeCashCase = newCase;
    this.cashCaseSpawnCount++;
    soundManager.playCrateDrop();

    if (Network.mode === 'HOST') {
      Network.broadcastToAll({
        type: 'SPAWN_CASH_CASE',
        cashCase: newCase
      });
    }
  }

  dismissCashCase() {
    if (!this.activeCashCase) return;
    const caseId = this.activeCashCase.id;
    this.activeCashCase = null;

    const modal = document.getElementById('cash-case-modal');
    if (modal) {
      modal.remove();
      CrazyGamesManager.gameplayStart();
    }

    if (Network.mode === 'CLIENT') {
      Network.conn.send({ type: 'DISMISS_CASH_CASE', id: caseId });
    } else if (Network.mode === 'HOST') {
      Network.broadcastToAll({ type: 'DISMISS_CASH_CASE', id: caseId });
    }
  }

  claimCashCase(claimedBy = 'p1') {
    if (!this.activeCashCase) return;
    const reward = this.activeCashCase.reward;
    const caseId = this.activeCashCase.id;

    this.activeCashCase = null;
    soundManager.playVictory();

    if (Network.mode === 'CLIENT') {
      Network.conn.send({ type: 'CONSUME_CASH_CASE', id: caseId, claimedBy: window.myPlayerId, reward: reward });
      this.gold += reward;
    } else {
      if (Network.mode === 'HOST') {
        if (claimedBy === 'p1') {
          this.gold += reward;
        } else if (this.playerWallets) {
          this.playerWallets[claimedBy] = (this.playerWallets[claimedBy] || 0) + reward;
        }
        Network.broadcastToAll({ type: 'CONSUME_CASH_CASE', id: caseId, claimedBy: claimedBy, reward: reward });
      } else {
        this.gold += reward;
      }
    }

    this.effectManager.spawnPlacementSparks(this.canvas.width / 2, this.canvas.height / 2, 50);
    this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
  }

  getPlayerColor(id) {
    if (id === 'p1') return '#00d2ff'; // Cyan
    if (id === 'p2') return '#ff7b00'; // Orange
    if (id === 'p3') return '#2ecc71'; // Lime Green
    if (id === 'p4') return '#bd00ff'; // Purple
    if (id === 'p5') return '#ffd700'; // Gold
    if (id === 'p6') return '#ff3b30'; // Red
    if (id === 'p7') return '#ff2d78'; // Pink
    return '#e0e7ff';                  // Silver
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});