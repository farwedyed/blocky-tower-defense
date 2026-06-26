// src/main.js
// Main Orchestration Module for Blocky TDS 2D

import { Grid } from './grid.js';
import { UI } from './ui.js';
import { EffectManager } from './particle.js';
import { 
  Enemy, 
  Runner, 
  Quick, 
  Slow, 
  Hidden, 
  Lead, 
  Shadow, 
  Goliath, 
  Templar, 
  GraveDigger, 
  MoltenTitan, 
  FallenGuardian, 
  FallenKing, 
  VoidReaver, 
  Brute,
  HazardGiant
} from './enemy.js';
import { 
  Scout, 
  Minigunner, 
  Commander, 
  DJUnit, 
  Pyromancer, 
  Farm, 
  Gladiator, 
  Soldier, 
  Sniper, 
  Medic, 
  Rocketeer, 
  Demoman, 
  Freezer, 
  Shotgunner, 
  CrookBoss, 
  MilitaryBase, 
  Ranger, 
  Turret 
} from './tower.js';
import { soundManager } from './sound.js';
import { uploadRecord, fetchTopRecords } from './firebase.js';
import { Network } from './network.js';
import { CrazyGamesManager } from './crazygames.js';
import { initWaveData } from './waves.js';

window.lobbyPlayers = window.lobbyPlayers || { p1: "Host Survivor", p2: "", p3: "", p4: "", p5: "", p6: "", p7: "", p8: "" };
window.myPlayerId = window.myPlayerId || "p1";
window.playerCursors = window.playerCursors || {};

class Game {
  constructor() {
    window.game = this;
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // 1. Meta Progression
    this.playerLevel = 1;
    this.playerXp = 0;
    this.playerCoins = 150;
    this.unlockedAgents = ['scout', 'sniper']; // Starter loadout aligned with Roblox TDS
    this.equippedAgents = ['scout', 'sniper'];
    this.ownedSkins = [];
    this.equippedSkins = {};

    // Five Active Difficulty Settings Mappings (Balanced to match Roblox TDS)
    this.selectedDifficulty = 'easy';
    this.difficultySettings = {
      easy: {
        hpMultiplier: 0.80, 
        startGold: 600,     
        maxWaves: 30,
        coinMultiplier: 1.0,
        xpMultiplier: 1.0
      },
      casual: {
        hpMultiplier: 1.00, 
        startGold: 600,
        maxWaves: 35,
        coinMultiplier: 1.3,
        xpMultiplier: 1.3
      },
      intermediate: {
        hpMultiplier: 1.40,
        startGold: 600,
        maxWaves: 40,
        coinMultiplier: 1.6,
        xpMultiplier: 1.6
      },
      molten: {
        hpMultiplier: 1.80,
        startGold: 600,
        maxWaves: 40,
        coinMultiplier: 2.0,
        xpMultiplier: 2.0
      },
      fallen: {
        hpMultiplier: 2.40, 
        startGold: 600,
        maxWaves: 40,
        coinMultiplier: 2.8,
        xpMultiplier: 2.8
      }
    };

    // Daily Quests structure:
    this.questGoals = {
      kills: 50,
      cashSpent: 2000,
      farmsPlaced: 5
    };
    this.questProgress = {
      kills: 0,
      cashSpent: 0,
      farmsPlaced: 0
    };
    this.questRewarded = {
      kills: false,
      saveSpent: false,
      farmsPlaced: false
    };

    this.matchTime = 0;

    // Tutorial Progression
    this.tutorialCompleted = false;
    this.tutorialActive = false; // Session-only active flag
    this.tutorialStep = 0; // 0=lobby, 1=placement, 1.5=start wave, 2=upgrade, 3=done

    this.loadStatsFromStorage();

    // 2. In-Match Stats
    this.lives = 150;
    this.gold = 400;
    this.wave = 0;
    this.isHardcore = false;
    this.maxWaves = 30;
    this.state = 'lobby'; 
    this.selectedMap = 'grassland';
    this.waveInProgress = false;
    this.hasRevivedThisMatch = false; 

    // Wave skip cooldown state
    this.skipCooldown = 0;

    // Cooperative multiplayer wallets & skip votes
    this.playerWallets = {};
    this.skipVotes = new Set();

    // Auto Wave Mode (default enabled)
    this.autoMode = true;
    this.autoStartTimer = 0;
    this.showMapDirections = true;

    // Interactive mouse positioning trackers
    this.mousePos = { x: -1, y: -1 };
    this.mouseGrid = { col: -1, row: -1 };
    this.isMouseOnCanvas = false;
    this.smoothHoverPos = { x: 0, y: 0 };
    this.targetHoverPos = { x: 0, y: 0 };

    this.speedMultiplier = 1;
    this.enemies = [];
    this.bullets = [];
    this.spawnQueue = [];
    this.activeSpawners = []; // Simultaneous spawners handler

    this.grid = new Grid(800, 600, 40);
    this.effectManager = new EffectManager();
    this.ui = new UI(this);

    // Initialize WebRTC Signaling Network Safely (Adblocker Guard)
    if (typeof Network !== 'undefined' && typeof Peer !== 'undefined') {
      Network.init(this, (peerId) => {
        console.log("[Signal] established Peer ID room link:", peerId);
      });
    } else {
      console.warn("[Network] Offline mode forced on start: network SDK missing or blocked.");
    }

    this.lastTime = 0;

    this.initWaveBlueprints();
    this.initEventListeners();
    
    // Sync Lobby displays immediately
    this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);
    this.ui.renderDailyQuests();
    this.ui.renderLeaderboard(this.selectedMap);

    this.loadStatsFromStorage();
    if (!this.tutorialCompleted) {
      this.tutorialStep = 0;
    }

    // Initialize CrazyGames SDK
    CrazyGamesManager.init().then(() => {
      CrazyGamesManager.onRoomJoinReceived((params) => {
        if (params && params.roomId) {
          this.handleCrazyGamesInvite(params.roomId);
        }
      });
    });

    // Run core animation frame
    requestAnimationFrame((t) => this.loop(t));
  }

  handleCrazyGamesInvite(roomId) {
    console.log('[CrazyGames] Connecting to room link:', roomId);
    if (this.state === 'playing') {
      this.quitToLobby();
    }

    const mapsTab = document.querySelector('.tab-btn[data-target="panel-maps"]');
    if (mapsTab) mapsTab.click();

    const btnSelectCoop = document.getElementById('btn-select-coop');
    if (btnSelectCoop) btnSelectCoop.click();

    const inputJoinCode = document.getElementById('input-join-code');
    if (inputJoinCode) {
      inputJoinCode.value = roomId.toUpperCase();
    }

    setTimeout(() => {
      const btnJoinCoop = document.getElementById('btn-join-coop');
      if (btnJoinCoop) btnJoinCoop.click();
    }, 400);
  }

  loadStatsFromStorage() {
    try {
      const level = localStorage.getItem('tds_level');
      const xp = localStorage.getItem('tds_xp');
      const coins = localStorage.getItem('tds_coins');
      const unlocked = localStorage.getItem('tds_unlocked');
      const equipped = localStorage.getItem('tds_equipped');
      const skins = localStorage.getItem('tds_skins');
      const eqSkins = localStorage.getItem('tds_equipped_skins');
      const quests = localStorage.getItem('tds_quests');
      const questRewarded = localStorage.getItem('tds_quest_rewarded');
      const tutorial = localStorage.getItem('tds_tutorial_completed');
      const leaderboard = localStorage.getItem('tds_leaderboard');

      if (level) this.playerLevel = parseInt(level);
      if (xp) this.playerXp = parseInt(xp);
      if (coins) this.playerCoins = parseInt(coins);
      if (unlocked) this.unlockedAgents = JSON.parse(unlocked);
      if (equipped) this.equippedAgents = JSON.parse(equipped);
      if (skins) this.ownedSkins = JSON.parse(skins);
      if (eqSkins) this.equippedSkins = JSON.parse(eqSkins);
      if (quests) {
        const parsedQuests = JSON.parse(quests);
        if (parsedQuests && typeof parsedQuests === 'object') {
          this.questProgress = { ...this.questProgress, ...parsedQuests };
        }
      }
      if (questRewarded) {
        const parsed = JSON.parse(questRewarded);
        if (parsed && typeof parsed === 'object') {
          this.questRewarded = { ...this.questRewarded, ...parsed };
        }
      }
      if (tutorial === 'true') {
        this.tutorialCompleted = true;
        this.tutorialActive = false;
      } else {
        this.tutorialCompleted = false;
        this.tutorialActive = true; // Guide them inside the session!
      }
      if (leaderboard) {
        const parsed = JSON.parse(leaderboard);
        if (parsed && typeof parsed === 'object') {
          this.leaderboard = parsed;
        }
      }
    } catch (e) {
      console.warn("Storage load failed, adopting defaults.", e);
    }

    // Defensive arrays cleaning to filter out any corrupted or null items
    if (Array.isArray(this.unlockedAgents)) {
      this.unlockedAgents = this.unlockedAgents.filter(a => a && typeof a === 'string');
    }
    if (Array.isArray(this.equippedAgents)) {
      this.equippedAgents = this.equippedAgents.filter(a => a && typeof a === 'string');
    }
    if (Array.isArray(this.ownedSkins)) {
      this.ownedSkins = this.ownedSkins.filter(s => s && typeof s === 'string');
    }

    if (this.equippedSkins && typeof this.equippedSkins === 'object') {
      for (const k of Object.keys(this.equippedSkins)) {
        if (!k || typeof k !== 'string' || typeof this.equippedSkins[k] !== 'string') {
          delete this.equippedSkins[k];
        }
      }
    } else {
      this.equippedSkins = {};
    }

    if (!Array.isArray(this.unlockedAgents) || this.unlockedAgents.length === 0) {
      this.unlockedAgents = ['scout', 'sniper'];
    }
    if (!Array.isArray(this.equippedAgents) || this.equippedAgents.length === 0) {
      this.equippedAgents = ['scout', 'sniper'];
    }
    if (!Array.isArray(this.ownedSkins)) {
      this.ownedSkins = [];
    }
    if (!this.leaderboard || typeof this.leaderboard !== 'object') {
      this.leaderboard = { grassland: [], desert: [], tundra: [], cyber_city: [], fallen_outpost: [] };
    }
  }

  saveStatsToStorage() {
    try {
      localStorage.setItem('tds_level', this.playerLevel.toString());
      localStorage.setItem('tds_xp', this.playerXp.toString());
      localStorage.setItem('tds_coins', this.playerCoins.toString());
      localStorage.setItem('tds_unlocked', JSON.stringify(this.unlockedAgents));
      localStorage.setItem('tds_equipped', JSON.stringify(this.equippedAgents));
      localStorage.setItem('tds_skins', JSON.stringify(this.ownedSkins));
      localStorage.setItem('tds_equipped_skins', JSON.stringify(this.equippedSkins));
      localStorage.setItem('tds_quests', JSON.stringify(this.questProgress));
      localStorage.setItem('tds_quest_rewarded', JSON.stringify(this.questRewarded));
      localStorage.setItem('tds_tutorial_completed', this.tutorialCompleted ? 'true' : 'false');
      localStorage.setItem('tds_leaderboard', JSON.stringify(this.leaderboard));
    } catch (e) {
      console.warn("Storage save failed.", e);
    }
  }

  checkQuestCompletion() {
    let anyCompleted = false;

    if (!this.questRewarded.kills && this.questProgress.kills >= this.questGoals.kills) {
      this.questRewarded.kills = true;
      this.playerCoins += 75;
      anyCompleted = true;
      this.effectManager.spawnText(400, 260, 'QUEST COMPLETE! +🪙 75 Coins', '#f1c40f');
    }
    if (!this.questRewarded.cashSpent && this.questProgress.cashSpent >= this.questGoals.cashSpent) {
      this.questRewarded.cashSpent = true;
      this.playerCoins += 100;
      anyCompleted = true;
      this.effectManager.spawnText(400, 260, 'QUEST COMPLETE! +🪙 100 Coins', '#f1c40f');
    }
    if (!this.questRewarded.farmsPlaced && this.questProgress.farmsPlaced >= this.questGoals.farmsPlaced) {
      this.questRewarded.farmsPlaced = true;
      this.playerCoins += 50;
      anyCompleted = true;
      this.effectManager.spawnText(400, 220, 'QUEST COMPLETE! +🪙 50 Coins', '#f1c40f');
    }

    if (anyCompleted) {
      this.saveStatsToStorage();
      if (this.ui) this.ui.renderDailyQuests();
    }
  }

  saveSpeedrunRecord() {
    const minutes = Math.floor(this.matchTime / 60);
    const seconds = Math.floor(this.matchTime % 60);
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    const activeUsername = CrazyGamesManager.currentUser?.username 
      || localStorage.getItem('tds_player_username') 
      || "Guest";

    const entry = {
      name: activeUsername,
      time: timeStr,
      timeRaw: this.matchTime,
      date: new Date().toLocaleDateString()
    };
    
    if (!Array.isArray(this.leaderboard[this.selectedMap])) {
      this.leaderboard[this.selectedMap] = [];
    }
    this.leaderboard[this.selectedMap].push(entry);
    this.leaderboard[this.selectedMap].sort((a, b) => a.timeRaw - b.timeRaw);
    this.leaderboard[this.selectedMap] = this.leaderboard[this.selectedMap].slice(0, 5);
    this.saveStatsToStorage();
    
    uploadRecord(this.selectedMap, entry).then(() => {
      return fetchTopRecords(this.selectedMap);
    }).then(records => {
      this.leaderboard[this.selectedMap] = records;
      if (this.ui) this.ui.renderLeaderboard(this.selectedMap);
    }).catch(e => console.warn('[Leaderboard] Sync error:', e));
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
      
      // Directions cleared: Transition to Step 1 tutorial (Prompt to Equip Scout)
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
          towerType: this.selectedShopTower,
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

    // Explicitly parse changedTouches on release to get highly accurate mobile landscape clicks
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
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
    
    // Scout button clicked: Transition immediately to Step 1.5
    if (this.tutorialActive && this.tutorialStep === 1 && type === 'scout') {
      this.tutorialStep = 1.5;
      this.ui.showTutorialHint(1.5);
    }
  }

  setSelectedPlacedTower(agent) {
    this.selectedPlacedTower = agent;
    this.ui.updateSelectionPanel(agent);

    // Scout selected on field: Transition to Step 2.5 (Point to Upgrade button)
    if (this.tutorialActive && this.tutorialStep === 2) {
      if (agent && agent.type === 'scout') {
        this.tutorialStep = 2.5;
        this.ui.showTutorialHint(2.5); 
      } else {
        this.ui.hidePointer();
      }
    }
  }

  buyAgentFromShopDirect(type, cost) {
    if (this.unlockedAgents.includes(type)) return;
    if (this.playerCoins >= cost) {
      this.playerCoins -= cost;
      this.unlockedAgents.push(type);
      
      if (this.equippedAgents.length < 5 && !this.equippedAgents.includes(type)) {
        this.equippedAgents.push(type);
      }
      
      this.saveStatsToStorage();
      soundManager.playUpgrade();
      this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);
      
      this.effectManager.spawnText(400, 300, `UNLOCKED ${type.toUpperCase().replace('_', ' ')}!`, '#2ecc71');
    } else {
      this.effectManager.spawnText(400, 300, "INSUFFICIENT COINS!", '#e74c3c');
    }
  }

  buyCrate(crateType) {
    let cost = 150;
    if (crateType === 'elite') cost = 350;
    else if (crateType === 'deluxe') cost = 500;

    if (this.playerCoins < cost) {
      alert("Not enough coins to buy this crate!");
      return;
    }

    // UPDATE: Filter only available unowned skins for the characters the player currently owns
    const skinsList = ['Golden', 'Cyber', 'Hazmat'];
    const availableUnownedSkins = [];

    this.unlockedAgents.forEach(agent => {
      skinsList.forEach(suffix => {
        const skinName = `${agent}_${suffix}`;
        if (!this.ownedSkins.includes(skinName)) {
          availableUnownedSkins.push({ agent, skinName });
        }
      });
    });

    // Zero-waste refund if they have fully unlocked 100% of their roster's skins
    if (availableUnownedSkins.length === 0) {
      alert("⚠️ You already own all possible skins for your current squad! Recruit more characters from the Agent Shop first.");
      return;
    }

    this.playerCoins -= cost;
    this.saveStatsToStorage();
    this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);

    // Roll a random skin from the unowned eligible pool
    const chosen = availableUnownedSkins[Math.floor(Math.random() * availableUnownedSkins.length)];
    const chosenAgent = chosen.agent;
    const revealedSkinName = chosen.skinName;

    // Map visual rarity based on crate selection
    let chosenRarity = 'common';
    const roll = Math.random();
    if (crateType === 'basic') {
      chosenRarity = roll < 0.80 ? 'common' : 'rare';
    } else if (crateType === 'elite') {
      chosenRarity = roll < 0.60 ? 'rare' : 'epic';
    } else if (crateType === 'deluxe') {
      chosenRarity = roll < 0.50 ? 'epic' : 'legendary';
    }

    // Award skin to player inventory
    this.ownedSkins.push(revealedSkinName);
    this.saveStatsToStorage();

    this.ui.startUnboxingAnimation(crateType, chosenAgent, chosenRarity, revealedSkinName);
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
      this.autoStartTimer = 0; // Fixes re-matched auto countdown freezes
      
      this.grid.selectMap(this.selectedMap);
      
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

      // Store a flag on whether we should run the tutorial session for this match
      const runTutorialThisMatch = !this.tutorialCompleted;

      // UPDATE: Mark the tutorial as completed instantly in storage so that if they 
      // refresh, leave, or play again, it never triggers a second time.
      if (runTutorialThisMatch) {
        this.tutorialActive = true;
        this.tutorialStep = 0.5; // Start at click anywhere stage
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
        this.tutorialStep = 0.5; // Start at click anywhere stage
      }
    } catch (e) {
      console.error("Defensive Guard: Error caught in deployToMatch():", e);
    }
  }

  quitToLobby() {
    this.tutorialActive = false; // UPDATE: Explicitly clear the active gameplay tutorial state on return
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

  getTowerCost(type) {
    let baseVal = 0;
    switch (type) {
      case 'scout': baseVal = 100; break;
      case 'minigunner': baseVal = 650; break;
      case 'commander': baseVal = 450; break;
      case 'dj': baseVal = 500; break;
      case 'pyromancer': baseVal = 300; break;
      case 'farm': baseVal = 250; break;
      case 'gladiator': baseVal = 300; break;
      case 'soldier': baseVal = 300; break;
      case 'sniper': baseVal = 250; break;
      case 'medic': baseVal = 350; break;
      case 'rocketeer': baseVal = 500; break;
      case 'demoman': baseVal = 300; break;
      case 'freezer': baseVal = 250; break;
      case 'shotgunner': baseVal = 350; break;
      case 'crook_boss': baseVal = 500; break;
      case 'military_base': baseVal = 400; break;
      case 'ranger': baseVal = 850; break;
      case 'turret': baseVal = 800; break;
      default: baseVal = 0;
    }
    if (this.isHardcore) {
      baseVal = Math.floor(baseVal * 1.20);
    }
    return baseVal;
  }

  placeShopAgent(col, row, ownerId = 'p1', type = null) {
    // FIX: Decouple from this.selectedShopTower so co-op placements do not scramble selections
    const towerType = type || this.selectedShopTower;
    if (!towerType) return;

    const totalPlacedTowers = this.grid.towers.size;
    const maxTowersAllowed = 40;
    if (totalPlacedTowers >= maxTowersAllowed) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT REACHED (MAX 40)", '#e74c3c');
      return;
    }

    let currentPlacedOfTypeCount = 0;
    for (const t of this.grid.towers.values()) {
      if (t.type === towerType) {
        currentPlacedOfTypeCount++;
      }
    }

    if (towerType === 'farm' && currentPlacedOfTypeCount >= 8) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 8 FARMS)", '#e74c3c');
      return;
    }
    if (towerType === 'commander' && currentPlacedOfTypeCount >= 3) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 3)", '#e74c3c');
      return;
    }
    if (towerType === 'dj' && currentPlacedOfTypeCount >= 1) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 1 DJ)", '#e74c3c');
      return;
    }
    if (towerType === 'medic' && currentPlacedOfTypeCount >= 3) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 3)", '#e74c3c');
      return;
    }
    if (towerType === 'crook_boss' && currentPlacedOfTypeCount >= 4) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 4)", '#e74c3c');
      return;
    }
    if (towerType === 'turret' && currentPlacedOfTypeCount >= 5) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 5)", '#e74c3c');
      return;
    }
    if (towerType === 'military_base' && currentPlacedOfTypeCount >= 5) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 5)", '#e74c3c');
      return;
    }

    const cost = this.getTowerCost(towerType);
    
    let wallet = 0;
    if (Network.mode === 'HOST') {
      wallet = (ownerId === 'p1') ? this.gold : (this.playerWallets[ownerId] || 0);
    } else {
      wallet = this.gold;
    }

    if (wallet < cost) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "CASH INSUFFICIENT", '#e74c3c');
      return;
    }

    if (this.grid.isCellValidForPlacement(col, row)) {
      let newAgent;
      const size = this.grid.cellSize;

      switch (towerType) {
        case 'scout': newAgent = new Scout(col, row, size); break;
        case 'minigunner': newAgent = new Minigunner(col, row, size); break;
        case 'commander': newAgent = new Commander(col, row, size); break;
        case 'dj': newAgent = new DJUnit(col, row, size); break;
        case 'pyromancer': newAgent = new Pyromancer(col, row, size); break;
        case 'farm': newAgent = new Farm(col, row, size); break;
        case 'gladiator': newAgent = new Gladiator(col, row, size); break;
        case 'soldier': newAgent = new Soldier(col, row, size); break;
        case 'sniper': newAgent = new Sniper(col, row, size); break;
        case 'medic': newAgent = new Medic(col, row, size); break;
        case 'rocketeer': newAgent = new Rocketeer(col, row, size); break;
        case 'demoman': newAgent = new Demoman(col, row, size); break;
        case 'freezer': newAgent = new Freezer(col, row, size); break;
        case 'shotgunner': newAgent = new Shotgunner(col, row, size); break;
        case 'crook_boss': newAgent = new CrookBoss(col, row, size); break;
        case 'military_base': newAgent = new MilitaryBase(col, row, size); break;
        case 'ranger': newAgent = new Ranger(col, row, size); break;
        case 'turret': newAgent = new Turret(col, row, size); break;
      }

      if (newAgent) {
        newAgent.equippedSkin = this.equippedSkins[towerType] || 'default';
        newAgent.ownerId = ownerId; 
        this.grid.placeTower(col, row, newAgent);
        
        if (Network.mode === 'HOST') {
          if (ownerId === 'p1') {
            this.gold -= cost;
            this.playerWallets['p1'] = this.gold;
          } else {
            this.playerWallets[ownerId] -= cost;
          }
        } else {
          this.gold -= cost;
        }
        soundManager.playPlace();

        if (towerType === 'farm') {
          this.questProgress.farmsPlaced++;
        }
        this.questProgress.cashSpent += cost;
        this.checkQuestCompletion();

        // Placed Scout: Transition to Step 2 (Prompt select placed Scout)
        if (this.tutorialActive && this.tutorialStep === 1.5) {
          this.tutorialStep = 2;
          this.ui.showTutorialHint(2);
        }

        this.effectManager.spawnPlacementSparks(newAgent.x, newAgent.y, size);
        this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
      }
    }
  }

  upgradeSelectedTower() {
    if (!this.selectedPlacedTower) return;
    const col = this.selectedPlacedTower.gridX;
    const row = this.selectedPlacedTower.gridY;

    if (Network.mode === 'CLIENT') {
      Network.conn.send({ type: 'UPGRADE_TOWER', col: col, row: row });
    } else {
      const cost = this.selectedPlacedTower.getUpgradeCost();
      if (this.gold >= cost) {
        this.gold -= cost;
        this.playerWallets['p1'] = this.gold;

        this.questProgress.cashSpent += cost;
        this.checkQuestCompletion();

        this.selectedPlacedTower.upgrade(this.effectManager);
        soundManager.playUpgrade();
        this.ui.updateSelectionPanel(this.selectedPlacedTower);
        this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);

        // Scout Upgraded First: Transition to Step 2.5 (Point to Upgrade button)
        if (this.tutorialActive && this.tutorialStep === 2.5) {
          this.tutorialStep = 3;
          this.ui.showTutorialHint(3);
        }
      }
    }
  }

  sellSelectedTower() {
    if (!this.selectedPlacedTower) return;
    const col = this.selectedPlacedTower.gridX;
    const row = this.selectedPlacedTower.gridY;

    if (Network.mode === 'CLIENT') {
      Network.conn.send({ type: 'SELL_TOWER', col: col, row: row });
      this.setSelectedPlacedTower(null);
    } else {
      const refund = this.tutorialActive ? this.selectedPlacedTower.cost : this.selectedPlacedTower.getSellValue();
      this.gold += refund;
      this.playerWallets['p1'] = this.gold;

      this.grid.removeTower(col, row);
      this.effectManager.spawnPlacementSparks(this.selectedPlacedTower.x, this.selectedPlacedTower.y, 40);
      this.setSelectedPlacedTower(null);
      this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
    }
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

  skipWave() {
    if (!this.waveInProgress || this.wave >= this.maxWaves || this.skipCooldown > 0) return;
    const reward = 50 + this.wave * 15;
    
    if (Network.mode === 'HOST' && this.playerWallets) {
      this.gold += reward;
      this.playerWallets['p1'] = this.gold;
      for (const pId of Object.keys(this.playerWallets)) {
        if (pId !== 'p1') {
          this.playerWallets[pId] = (this.playerWallets[pId] || 0) + reward;
        }
      }
    } else {
      this.gold += reward;
    }

    // Harvest Farm payouts immediately upon skipping a wave
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
    
    this.effectManager.spawnText(400, 260, `WAVE SKIPPED! +$${reward}`, '#e67e22');
    
    this.skipCooldown = 15.0; // 15-second skip cooldown to prevent spam skips
    
    this.waveInProgress = false;
    this.startNextWave(true); 
  }

  toggleAutoMode() {
    this.autoMode = !this.autoMode;
    if (!this.autoMode) this.autoStartTimer = 0;
    this.ui.updateAutoWaveButton(this.autoMode);
  }

  startNextWave(isFromSkip = false) {
    if (this.showMapDirections) return;
    if (this.waveInProgress || this.state !== 'playing') return;

    this.wave++;
    this.waveInProgress = true;
    this.ui.updateWaveButton(true);
    this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);

    // Call dynamic wave alerts from Commander
    this.triggerCommanderAlerts();

    if (!isFromSkip) {
      this.skipCooldown = 0; 
    }

    let blueprints = this.waveBlueprintsEasy;
    if (this.selectedDifficulty === 'casual') blueprints = this.waveBlueprintsCasual;
    else if (this.selectedDifficulty === 'intermediate') blueprints = this.waveBlueprintsIntermediate;
    else if (this.selectedDifficulty === 'molten') blueprints = this.waveBlueprintsMolten;
    else if (this.selectedDifficulty === 'fallen') blueprints = this.waveBlueprintsFallen;

    const blueprint = blueprints[this.wave - 1];
    const spawnList = [];
    for (let i = 0; i < (blueprint.runners || 0); i++) spawnList.push('runner');
    for (let i = 0; i < (blueprint.quicks || 0); i++) spawnList.push('quick');
    for (let i = 0; i < (blueprint.slows || 0); i++) spawnList.push('slow');
    for (let i = 0; i < (blueprint.hiddens || 0); i++) spawnList.push('hidden');
    for (let i = 0; i < (blueprint.leads || 0); i++) spawnList.push('lead');
    for (let i = 0; i < (blueprint.shadows || 0); i++) spawnList.push('shadow');
    for (let i = 0; i < (blueprint.goliaths || 0); i++) spawnList.push('goliath');
    for (let i = 0; i < (blueprint.templars || 0); i++) spawnList.push('templar');
    for (let i = 0; i < (blueprint.brute || 0); i++) spawnList.push('brute');
    for (let i = 0; i < (blueprint.diggers || 0); i++) {
      if (this.selectedDifficulty === 'easy') {
        spawnList.push('brute'); 
      } else {
        spawnList.push('grave_digger');
      }
    }
    for (let i = 0; i < (blueprint.hazard_giants || 0); i++) spawnList.push('hazard_giant');
    for (let i = 0; i < (blueprint.titans || 0); i++) spawnList.push('molten_titan');
    for (let i = 0; i < (blueprint.guardians || 0); i++) spawnList.push('fallen_guardian');
    for (let i = 0; i < (blueprint.kings || 0); i++) spawnList.push('fallen_king');
    for (let i = 0; i < (blueprint.reavers || 0); i++) spawnList.push('void_reaver');

    // Register a spawner
    this.activeSpawners.push({
      queue: spawnList.sort(() => Math.random() - 0.5),
      timer: 0,
      interval: blueprint.rate
    });

    this.effectManager.spawnText(400, 300, `WAVE ${this.wave}`, '#f1c40f');

    // Wave Started: Transition to Step 4
    if (this.tutorialActive && this.tutorialStep === 3) {
      this.tutorialStep = 4;
      this.ui.showTutorialHint(4);
    }
  }

  triggerCommanderAlerts() {
    let alertMsg = "";
    if (this.wave === 1) {
      alertMsg = "There's reports of zombie activity nearby.";
    } else if (this.wave === 2) {
      alertMsg = "Secure the area and keep an eye out. We have teams that are pushing them in our direction.";
    } else if (this.wave === 5) {
      alertMsg = "Heavy threat inbound! Watch out for those slow, tanky targets!";
    } else if (this.wave === 7) {
      alertMsg = "The Toxic Giant is approaching! Get those defenses up, let's get to work!";
    } else if (this.wave === 10) {
      alertMsg = "Warning: Camo zombies detected! Hiddens are approaching, keep your eyes open!";
    }

    if (alertMsg) {
      this.ui.showCommanderAnnouncement(alertMsg);
    }
  }

  toggleSpeed() {
    this.speedMultiplier = this.speedMultiplier === 1 ? 2 : 1;
    this.ui.updateSpeedButton(this.speedMultiplier);
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000.0) * this.speedMultiplier;
    this.lastTime = timestamp;

    // LOBBY RENDERING BYPASS OPTIMIZATION: Only draw if actively inside a match scenario
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

    // Authoritative Host Broadcast Frame Trigger
    if (Network.mode === 'HOST') {
      Network.broadcastState();
    }

    // Interactive Wave Autostart Loop 
    if (this.autoMode && !this.waveInProgress && this.autoStartTimer > 0 && this.state === 'playing' && !this.showMapDirections) {
      this.autoStartTimer -= dt;
      if (this.autoStartTimer <= 0) {
        this.autoStartTimer = 0;
        if (this.wave < this.maxWaves) {
          this.startNextWave();
        }
      }
    }

    // Authoritative simultaneous multiple active spawners handling
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
        
        // UPDATE: Credit zombie kill rewards to all connected co-op player wallets simultaneously
        if (Network.mode === 'HOST' && this.playerWallets) {
          this.gold += reward;
          this.playerWallets['p1'] = this.gold;
          for (const pId of Object.keys(this.playerWallets)) {
            if (pId !== 'p1') {
              this.playerWallets[pId] = (this.playerWallets[pId] || 0) + reward;
            }
          }
        } else {
          this.gold += reward;
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

      // Harvest Farm payouts
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
        const diffConfig = this.difficultySettings[this.selectedDifficulty];
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

  evaluateSupportBuffs() {
    for (const t of this.grid.towers.values()) {
      t.djRangeBuffed = false;
      t.djCamoDetectionBuffed = false;
      t.commanderSpeedBuffed = false;
      t.commanderAbilityActive = false;
    }

    for (const dj of this.grid.towers.values()) {
      if (dj.type === 'dj') {
        const r = dj.range * (dj.djRangeBuffed ? 1.15 : 1.0);
        for (const target of this.grid.towers.values()) {
          if (target !== dj) {
            const dist = Math.hypot(target.x - dj.x, target.y - dj.y);
            if (dist <= r) {
              target.djRangeBuffed = true;
              if (dj.level >= 3) {
                target.djCamoDetectionBuffed = true;
              }
            }
          }
        }
      }
    }

    for (const cmd of this.grid.towers.values()) {
      if (cmd.type === 'commander') {
        const hasBuff = cmd.buffDurationLeft > 0 || cmd.isAbilityActive;
        const r = cmd.range * (cmd.djRangeBuffed ? 1.15 : 1.0);
        for (const target of this.grid.towers.values()) {
          if (target !== cmd) {
            const dist = Math.hypot(target.x - cmd.x, target.y - cmd.y);
            if (dist <= r) {
              if (hasBuff) {
                target.commanderSpeedBuffed = true;
              }
              if (cmd.isAbilityActive) {
                target.commanderAbilityActive = true;
              }
            }
          }
        }
      }
    }
  }

  spawnZombie(type) {
    const startPoint = this.grid.pixelPath[0];
    let e;
    switch (type) {
      case 'runner': e = new Runner(startPoint.x, startPoint.y); break;
      case 'quick': e = new Quick(startPoint.x, startPoint.y); break;
      case 'slow': e = new Slow(startPoint.x, startPoint.y); break;
      case 'hidden': e = new Hidden(startPoint.x, startPoint.y); break;
      case 'lead': e = new Lead(startPoint.x, startPoint.y); break;
      case 'shadow': e = new Shadow(startPoint.x, startPoint.y); break;
      case 'goliath': e = new Goliath(startPoint.x, startPoint.y); break;
      case 'templar': e = new Templar(startPoint.x, startPoint.y); break;
      case 'brute': e = new Brute(startPoint.x, startPoint.y); break;
      case 'grave_digger': e = new GraveDigger(startPoint.x, startPoint.y); break;
      case 'hazard_giant': e = new HazardGiant(startPoint.x, startPoint.y); break;
      case 'molten_titan': e = new MoltenTitan(startPoint.x, startPoint.y); break;
      case 'fallen_guardian': e = new FallenGuardian(startPoint.x, startPoint.y); break;
      case 'fallen_king': e = new FallenKing(startPoint.x, startPoint.y); break;
      case 'void_reaver': e = new VoidReaver(startPoint.x, startPoint.y); break;
    }
    if (e) this.enemies.push(e);
  }

  draw() {
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.state === 'playing' || this.state === 'victory' || this.state === 'gameover') {
      this.effectManager.screenShake.apply(this.ctx);
      this.grid.draw(this.ctx);

      for (const agent of this.grid.towers.values()) {
        agent.draw(this.ctx);
      }

      for (const zombie of this.enemies) {
        zombie.draw(this.ctx);
      }

      for (const bullet of this.bullets) {
        bullet.draw(this.ctx);
      }

      this.drawHoverVisuals();
      this.drawPlayerCursors(); 
      
      if (this.tutorialActive && this.tutorialStep === 1.5 && this.selectedShopTower === 'scout') {
        this.drawTutorialCanvasHighlight(this.ctx);
      }

      this.effectManager.draw(this.ctx);

      if (this.showMapDirections) {
        this.ctx.save();
        const arrowBounce = Math.sin(Date.now() / 150) * 8;
        
        let startPt = this.grid.pixelPath[0];
        let startX = startPt.x < 0 ? 10 : startPt.x;
        let startY = startPt.y;
        
        let endPt = this.grid.pixelPath[this.grid.pixelPath.length - 1];
        let endX = endPt.x > this.canvas.width ? this.canvas.width - 25 : endPt.x;
        let endY = endPt.y;

        this.ctx.fillStyle = '#ff3333';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 4;
        this.ctx.font = "bold 14px 'Fredoka', 'Nunito', sans-serif";
        this.ctx.textAlign = 'left';
        
        this.ctx.strokeText("ENTRANCE - ZOMBIES SPAWN HERE!", startX + 25, startY - 45 + arrowBounce);
        this.ctx.fillText("ENTRANCE - ZOMBIES SPAWN HERE!", startX + 25, startY - 45 + arrowBounce);

        this.ctx.fillStyle = '#ff3333';
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY - 35 + arrowBounce);
        this.ctx.lineTo(startX - 10, startY - 55 + arrowBounce);
        this.ctx.lineTo(startX - 4, startY - 55 + arrowBounce);
        this.ctx.lineTo(startX - 4, startY - 70 + arrowBounce);
        this.ctx.lineTo(startX + 4, startY - 70 + arrowBounce);
        this.ctx.lineTo(startX + 4, startY - 55 + arrowBounce);
        this.ctx.lineTo(startX + 10, startY - 55 + arrowBounce);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = '#2ecc71';
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 4;
        this.ctx.font = "bold 14px 'Fredoka', 'Nunito', sans-serif";
        this.ctx.textAlign = 'right';
        
        this.ctx.strokeText("BASE - KEEP THE ZOMBIES OUT!", endX - 25, endY - 45 + arrowBounce);
        this.ctx.fillText("BASE - KEEP THE ZOMBIES OUT!", endX - 25, endY - 45 + arrowBounce);

        this.ctx.fillStyle = '#2ecc71';
        this.ctx.beginPath();
        this.ctx.moveTo(endX, endY - 35 + arrowBounce);
        this.ctx.lineTo(endX - 10, endY - 55 + arrowBounce);
        this.ctx.lineTo(endX - 4, endY - 55 + arrowBounce);
        this.ctx.lineTo(endX - 4, endY - 70 + arrowBounce);
        this.ctx.lineTo(endX + 4, endY - 70 + arrowBounce);
        this.ctx.lineTo(endX + 4, endY - 55 + arrowBounce);
        this.ctx.lineTo(endX + 10, endY - 55 + arrowBounce);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(0, 260, this.canvas.width, 80);
        this.ctx.strokeStyle = '#f1c40f';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 260);
        this.ctx.lineTo(this.canvas.width, 260);
        this.ctx.moveTo(0, 340);
        this.ctx.lineTo(this.canvas.width, 340);
        this.ctx.stroke();

        this.ctx.fillStyle = '#fff';
        this.ctx.font = "bold 20px 'Fredoka', 'Nunito', sans-serif";
        this.ctx.textAlign = 'center';
        this.ctx.strokeText("CLICK ANYWHERE ON THE MAP TO BEGIN MATCH", 400, 308);
        this.ctx.fillText("CLICK ANYWHERE ON THE MAP TO BEGIN MATCH", 400, 308);

        this.ctx.restore();
      }

      if (this.isHardcore) {
        this.ctx.save();
        const grad = this.ctx.createRadialGradient(
          this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.35,
          this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.55
        );
        grad.addColorStop(0, 'rgba(231, 76, 60, 0)');
        grad.addColorStop(1, 'rgba(231, 76, 60, 0.35)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.strokeStyle = '#e74c3c';
        this.ctx.lineWidth = 5;
        this.ctx.strokeRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
      }
    } else {
      this.ctx.fillStyle = '#2a3b5c';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#fff';
      this.ctx.font = "900 36px 'Fredoka', sans-serif";
      this.ctx.textAlign = 'center';
      this.ctx.fillText("LOBBY ACTIVE", 400, 300);
      this.ctx.font = "400 18px 'Nunito', sans-serif";
      this.ctx.fillText("Prepare loadout and choose maps inside the console sidebar wizard", 400, 335);
    }

    if (this.state === 'victory') {
      this.drawConfetti();
    }

    this.ctx.restore();
  }

  drawTutorialCanvasHighlight(ctx) {
    const cellSize = this.grid.cellSize;
    const targetX = 2 * cellSize + cellSize / 2;
    const targetY = 2 * cellSize + cellSize / 2; 
    
    const bounce = Math.sin(Date.now() / 150) * 8;
    
    ctx.save();
    ctx.translate(targetX, targetY);
    
    const pulse = Math.abs(Math.sin(Date.now() / 200)) * 6;
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3.5 + pulse;
    ctx.strokeRect(-cellSize / 2 + 2, -cellSize / 2 + 2, cellSize - 4, cellSize - 4);
    
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = "bold 13px 'Fredoka', 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.strokeText("PLACE HERE", 0, -cellSize / 2 - 25 + bounce);
    ctx.fillText("PLACE HERE", 0, -cellSize / 2 - 25 + bounce);
    
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, -cellSize / 2 - 15);
    ctx.lineTo(8, -cellSize / 2 - 8 + bounce);
    ctx.lineTo(14, -cellSize / 2 - 8 + bounce);
    ctx.lineTo(0, -cellSize / 2 + 2 + bounce);
    ctx.lineTo(-14, -cellSize / 2 - 8 + bounce);
    ctx.lineTo(-8, -cellSize / 2 - 8 + bounce);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
  }

  drawHoverVisuals() {
    if (this.state !== 'playing' || !this.isMouseOnCanvas) return;

    if (this.selectedPlacedTower) {
      this.ctx.save();
      this.ctx.globalAlpha = 0.12;
      this.ctx.fillStyle = this.selectedPlacedTower.color;
      this.ctx.beginPath();
      const currentRange = this.selectedPlacedTower.range * (this.selectedPlacedTower.djRangeBuffed ? (this.selectedPlacedTower.level >= 5 ? 1.20 : 1.15) : 1.0);
      this.ctx.arc(this.selectedPlacedTower.x, this.selectedPlacedTower.y, currentRange, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.globalAlpha = 0.45;
      this.ctx.strokeStyle = this.selectedPlacedTower.color;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
      this.ctx.restore();
    }

    if (this.selectedShopTower) {
      const col = this.mouseGrid.col;
      const row = this.mouseGrid.row;
      if (col < 0 || col >= this.grid.cols || row < 0 || row >= this.grid.rows) return;

      const size = this.grid.cellSize;
      const isValid = this.grid.isCellValidForPlacement(col, row);
      const color = isValid ? '#2ecc71' : '#e74c3c';

      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(col * size + 2, row * size + 2, size - 4, size - 4);
      this.ctx.fillStyle = isValid ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)';
      this.ctx.fillRect(col * size + 2, row * size + 2, size - 4, size - 4);
      this.ctx.restore();

      const cx = this.mousePos.x;
      const cy = this.mousePos.y;

      this.ctx.save();
      const range = this.getTowerRange(this.selectedShopTower);
      if (range > 0) {
        this.ctx.globalAlpha = 0.08;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, range, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.globalAlpha = 0.35;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, range, 0, Math.PI * 2);
        this.ctx.stroke();
      }

      let tempAgent;
      switch (this.selectedShopTower) {
        case 'scout': tempAgent = new Scout(0, 0, size); break;
        case 'minigunner': tempAgent = new Minigunner(0, 0, size); break;
        case 'commander': tempAgent = new Commander(0, 0, size); break;
        case 'dj': tempAgent = new DJUnit(0, 0, size); break;
        case 'pyromancer': tempAgent = new Pyromancer(0, 0, size); break;
        case 'farm': tempAgent = new Farm(0, 0, size); break;
        case 'gladiator': tempAgent = new Gladiator(0, 0, size); break;
        case 'soldier': tempAgent = new Soldier(0, 0, size); break;
        case 'sniper': tempAgent = new Sniper(0, 0, size); break;
        case 'medic': tempAgent = new Medic(0, 0, size); break;
        case 'rocketeer': tempAgent = new Rocketeer(0, 0, size); break;
        case 'demoman': tempAgent = new Demoman(0, 0, size); break;
        case 'freezer': tempAgent = new Freezer(0, 0, size); break;
        case 'shotgunner': tempAgent = new Shotgunner(0, 0, size); break;
        case 'crook_boss': tempAgent = new CrookBoss(0, 0, size); break;
        case 'military_base': tempAgent = new MilitaryBase(0, 0, size); break;
        case 'ranger': tempAgent = new Ranger(0, 0, size); break;
        case 'turret': tempAgent = new Turret(0, 0, size); break;
      }
      if (tempAgent) {
        tempAgent.x = cx;
        tempAgent.y = cy;
        tempAgent.angle = Math.atan2(this.mousePos.y - cy, this.mousePos.x - cx);
        this.ctx.globalAlpha = 0.55;
        tempAgent.draw(this.ctx);
      }

      this.ctx.restore();
    }
  }

  drawPlayerCursors() {
    if (Network.mode === 'OFFLINE' || !window.playerCursors) return;

    for (const [pId, cursor] of Object.entries(window.playerCursors)) {
      if (pId === window.myPlayerId) continue; 
      if (!cursor || cursor.mouseX === undefined) continue;

      const cx = cursor.mouseX;
      const cy = cursor.mouseY;

      this.ctx.save();
      this.ctx.fillStyle = this.getPlayerColor(pId);
      this.ctx.strokeStyle = '#222';
      this.ctx.lineWidth = 2;

      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(cx + 5, cy + 15);
      this.ctx.lineTo(cx + 10, cy + 10);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      const name = (window.lobbyPlayers[pId] || "Player").split(" [")[0];
      this.ctx.fillStyle = '#fff';
      this.ctx.font = "900 11px 'Fredoka', sans-serif";
      this.ctx.strokeStyle = '#222';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(name, cx + 12, cy + 12);
      this.ctx.fillText(name, cx + 12, cy + 12);

      if (cursor.selectedShopTower && cursor.selectedShopTower !== 'null') {
        this.ctx.globalAlpha = 0.22;
        this.ctx.strokeStyle = this.getPlayerColor(pId);
        this.ctx.lineWidth = 1.5;
        const range = this.getTowerRange(cursor.selectedShopTower);
        if (range > 0) {
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, range, 0, Math.PI * 2);
          this.ctx.stroke();
        }
      }

      this.ctx.restore();
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

  drawConfetti() {
    if (!this._confettiParticles) {
      this._confettiParticles = [];
      const colors = ['#f1c40f', '#2ecc71', '#3498db', '#e74c3c', '#9b59b6', '#e67e22'];
      for (let i = 0; i < 120; i++) {
        this._confettiParticles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height - this.canvas.height,
          size: Math.random() * 6 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          speedY: Math.random() * 80 + 50,
          speedX: Math.random() * 40 - 20,
          rot: Math.random() * Math.PI,
          rotSpeed: Math.random() * 4 - 2
        });
      }
    }

    this.ctx.save();
    const dt = 0.016;
    for (const p of this._confettiParticles) {
      p.y += p.speedY * dt;
      p.x += p.speedX * dt;
      p.rot += p.rotSpeed * dt;
      if (p.y > this.canvas.height) {
        p.y = -20;
        p.x = Math.random() * this.canvas.width;
      }
      this.ctx.fillStyle = p.color;
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rot);
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.rotate(-p.rot);
      this.ctx.translate(-p.x, -p.y);
    }
    this.ctx.restore();
  }

  getTowerRange(type) {
    switch (type) {
      case 'scout': return 135;
      case 'minigunner': return 155;
      case 'commander': return 120;
      case 'dj': return 140;
      case 'pyromancer': return 105;
      case 'farm': return 0;
      case 'gladiator': return 65;
      case 'soldier': return 125;
      case 'sniper': return 220;
      case 'medic': return 110;
      case 'rocketeer': return 120;
      case 'demoman': return 110;
      case 'freezer': return 100;
      case 'shotgunner': return 90;
      case 'crook_boss': return 120;
      case 'military_base': return 120;
      case 'ranger': return 240;
      case 'turret': return 160;
      default: return 0;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});