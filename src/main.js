// Main Orchestration Module for Blocky TDS 2D

import { Grid } from './grid.js';
import { UI } from './ui.js';
import { EffectManager } from './particle.js';
import { Enemy, Runner, Quick, Slow, Hidden, Lead, Shadow, Goliath, Templar, GraveDigger, MoltenTitan, FallenGuardian, FallenKing, VoidReaver } from './enemy.js';
import { Scout, Minigunner, Commander, DJUnit, Pyromancer, Farm, Gladiator, Soldier, Sniper, Medic, Rocketeer } from './tower.js';
import { soundManager } from './sound.js';
import { uploadRecord, fetchTopRecords } from './firebase.js';
import { Network } from './network.js';
import { CrazyGamesManager } from './crazygames.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    // 1. Meta Progression (loaded from localStorage or initialized defaults)
    this.playerLevel = 1;
    this.playerXp = 0;
    this.playerCoins = 150;
    this.unlockedAgents = ['scout'];
    this.equippedAgents = ['scout'];
    this.ownedSkins = [];
    this.equippedSkins = {};

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
      cashSpent: false,
      farmsPlaced: false
    };

    // Speedrun matchmaking time tracker
    this.matchTime = 0;

    // Tutorial
    this.tutorialCompleted = false;
    this.tutorialStep = 0; // 0=lobby hint, 1=placement hint, 2=upgrade hint, 3=done

    this.loadStatsFromStorage();

    // 2. In-Match Stats
    this.lives = 100;
    this.gold = 400; // starting cash
    this.wave = 0;
    this.isHardcore = false;
    this.maxWaves = 40;
    this.state = 'lobby'; // 'lobby', 'playing', 'gameover', 'victory'
    this.selectedMap = 'grassland';
    this.waveInProgress = false;
    this.hasRevivedThisMatch = false; // Limit players to 1 rewarded ad revive per match

    // Cooperative multiplayer wallets & skip votes
    this.playerWallets = {}; // key: player slot ('p1'...'p8'), value: cash balance
    this.skipVotes = new Set(); // Stores slots of voted players

    // Auto Wave Mode (default enabled)
    this.autoMode = true;
    this.autoStartTimer = 0; // counts down from 2.0 when a wave ends in autoMode
    this.showMapDirections = false;

    // Speeds
    this.speedMultiplier = 1;

    // Match Selections
    this.selectedShopTower = 'scout';
    this.selectedPlacedTower = null;

    // Mouse grid
    this.mouseGrid = { col: -1, row: -1 };
    this.mousePos = { x: -1, y: -1 };
    this.isMouseOnCanvas = false;
    this.smoothHoverPos = { x: 0, y: 0 };
    this.targetHoverPos = { x: 0, y: 0 };

    // Play lists
    this.enemies = [];
    this.bullets = [];
    this.spawnQueue = [];
    this.spawnInterval = 0.8;
    this.spawnTimer = 0;

    // Instantiate engine components
    this.grid = new Grid(this.canvas.width, this.canvas.height, 40);
    this.effectManager = new EffectManager();
    this.ui = new UI(this);

    // Initialize WebRTC Multiplayer Signal Network with this Game instance
    Network.init(this, (peerId) => {
      console.log("[Signal] established Peer ID room link:", peerId);
    });

    this.lastTime = 0;

    this.initWaveData();
    this.initEventListeners();
    
    // Sync Lobby displays immediately
    this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);
    // Render daily quests and leaderboard for the default map on first load
    this.ui.renderDailyQuests();
    this.ui.renderLeaderboard(this.selectedMap);

    if (!this.tutorialCompleted) {
      this.ui.showTutorialHint(0);
    }

    // Initialize CrazyGames SDK Integration
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

  /**
   * Seamlessly redirects players into direct co-op lobbies via incoming invite parameters.
   * @param {string} roomId 
   */
  handleCrazyGamesInvite(roomId) {
    console.log('[CrazyGames] Executing automated squad connection sequence for:', roomId);
    if (this.state === 'playing') {
      this.quitToLobby();
    }

    // Switch to Map Selector / Setup View
    const mapsTab = document.querySelector('.tab-btn[data-target="panel-maps"]');
    if (mapsTab) mapsTab.click();

    // Select CO-OP Party option
    const btnSelectCoop = document.getElementById('btn-select-coop');
    if (btnSelectCoop) btnSelectCoop.click();

    // Insert room code into joining input field
    const inputJoinCode = document.getElementById('input-join-code');
    if (inputJoinCode) {
      inputJoinCode.value = roomId.toUpperCase();
    }

    // Connect to room after visual states settle
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
      if (tutorial === 'true') this.tutorialCompleted = true;
      if (leaderboard) {
        const parsed = JSON.parse(leaderboard);
        if (parsed && typeof parsed === 'object') {
          this.leaderboard = parsed;
        }
      }
    } catch (e) {
      console.warn("Storage load failed, utilizing initial defaults.", e);
    }

    // Ensure safe defaults
    if (!Array.isArray(this.unlockedAgents) || this.unlockedAgents.length === 0) {
      this.unlockedAgents = ['scout'];
    }
    if (!Array.isArray(this.equippedAgents) || this.equippedAgents.length === 0) {
      this.equippedAgents = ['scout'];
    }
    if (!Array.isArray(this.ownedSkins)) {
      this.ownedSkins = [];
    }
    if (!this.equippedSkins || typeof this.equippedSkins !== 'object') {
      this.equippedSkins = {};
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
      this.effectManager && this.effectManager.spawnText
        && this.effectManager.spawnText(400, 260, 'QUEST COMPLETE! +🪙 75 Coins', '#f1c40f');
    }
    if (!this.questRewarded.cashSpent && this.questProgress.cashSpent >= this.questGoals.cashSpent) {
      this.questRewarded.cashSpent = true;
      this.playerCoins += 100;
      anyCompleted = true;
      this.effectManager && this.effectManager.spawnText
        && this.effectManager.spawnText(400, 240, 'QUEST COMPLETE! +🪙 100 Coins', '#f1c40f');
    }
    if (!this.questRewarded.farmsPlaced && this.questProgress.farmsPlaced >= this.questGoals.farmsPlaced) {
      this.questRewarded.farmsPlaced = true;
      this.playerCoins += 50;
      anyCompleted = true;
      this.effectManager && this.effectManager.spawnText
        && this.effectManager.spawnText(400, 220, 'QUEST COMPLETE! +🪙 50 Coins', '#f1c40f');
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
    const entry = {
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
    }).catch(e => console.warn('[Leaderboard] Post-victory sync error:', e));
  }

  initWaveData() {
    // 40 Wave Blueprint (Spawning matching Roblox Zombie Classes)
    this.waveBlueprints = [
      // 1-5 (Early Game Basics)
      { runners: 8, quicks: 0, slows: 0, hiddens: 0, leads: 0, shadows: 0, goliaths: 0, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 1.2 },
      { runners: 12, quicks: 3, slows: 0, hiddens: 0, leads: 0, shadows: 0, goliaths: 0, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 1.0 },
      { runners: 10, quicks: 6, slows: 2, hiddens: 0, leads: 0, shadows: 0, goliaths: 0, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.9 },
      { runners: 15, quicks: 10, slows: 4, hiddens: 0, leads: 0, shadows: 0, goliaths: 0, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.8 },
      { runners: 10, quicks: 15, slows: 6, hiddens: 0, leads: 0, shadows: 0, goliaths: 0, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.75 },

      // 6-10 (Ramping up, first Boss)
      { runners: 18, quicks: 12, slows: 8, hiddens: 0, leads: 0, shadows: 0, goliaths: 0, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.7 },
      { runners: 20, quicks: 15, slows: 10, hiddens: 0, leads: 0, shadows: 0, goliaths: 1, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.65 },
      { runners: 15, quicks: 20, slows: 12, hiddens: 0, leads: 0, shadows: 0, goliaths: 2, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.6 },
      { runners: 25, quicks: 25, slows: 15, hiddens: 0, leads: 0, shadows: 0, goliaths: 3, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.55 },
      { runners: 20, quicks: 20, slows: 15, hiddens: 0, leads: 0, shadows: 0, goliaths: 4, templars: 0, diggers: 1, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.6 }, // Wave 10: Grave Digger

      // 11-15 (Hidden & Lead Introduction)
      { runners: 15, quicks: 15, slows: 10, hiddens: 5, leads: 0, shadows: 0, goliaths: 2, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.7 }, // Wave 11 Hiddens
      { runners: 12, quicks: 12, slows: 8, hiddens: 10, leads: 2, shadows: 0, goliaths: 3, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.65 }, // Wave 12 Leads
      { runners: 15, quicks: 15, slows: 12, hiddens: 12, leads: 6, shadows: 0, goliaths: 4, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.6 },
      { runners: 10, quicks: 10, slows: 10, hiddens: 15, leads: 10, shadows: 0, goliaths: 5, templars: 0, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.55 },
      { runners: 20, quicks: 20, slows: 15, hiddens: 15, leads: 12, shadows: 0, goliaths: 6, templars: 1, diggers: 0, titans: 1, guardians: 0, kings: 0, reavers: 0, rate: 0.5 }, // Wave 15 Templar

      // 16-20 (Armored swarms, Molten Titan)
      { runners: 15, quicks: 15, slows: 12, hiddens: 18, leads: 15, shadows: 0, goliaths: 6, templars: 2, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.5 },
      { runners: 20, quicks: 20, slows: 15, hiddens: 20, leads: 18, shadows: 0, goliaths: 8, templars: 3, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.45 },
      { runners: 25, quicks: 25, slows: 20, hiddens: 22, leads: 20, shadows: 2, goliaths: 10, templars: 4, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.4 }, // Shadows
      { runners: 30, quicks: 30, slows: 25, hiddens: 25, leads: 25, shadows: 4, goliaths: 12, templars: 5, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.35 },
      { runners: 20, quicks: 20, slows: 20, hiddens: 20, leads: 20, shadows: 6, goliaths: 10, templars: 6, diggers: 1, titans: 1, guardians: 0, kings: 0, reavers: 0, rate: 0.4 }, // Wave 20: Molten Titan

      // 21-25 (Shadow Swarms, Heavy Armors)
      { runners: 15, quicks: 15, slows: 15, hiddens: 20, leads: 20, shadows: 10, goliaths: 8, templars: 5, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.4 },
      { runners: 20, quicks: 20, slows: 18, hiddens: 25, leads: 25, shadows: 12, goliaths: 10, templars: 6, diggers: 0, titans: 0, goldReward: 10, rate: 0.38 },
      { runners: 25, quicks: 25, slows: 20, hiddens: 30, leads: 30, shadows: 15, goliaths: 12, templars: 8, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.35 },
      { runners: 30, quicks: 30, slows: 25, hiddens: 35, leads: 35, shadows: 18, goliaths: 15, templars: 10, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.32 },
      { runners: 25, quicks: 25, slows: 25, hiddens: 25, leads: 25, shadows: 15, goliaths: 12, templars: 12, diggers: 0, titans: 2, guardians: 0, kings: 0, reavers: 0, rate: 0.35 }, // Wave 25 Duel Titans

      // 26-30 (Endgame Preparation, Fallen Guardian)
      { runners: 20, quicks: 20, slows: 20, hiddens: 30, leads: 30, shadows: 20, goliaths: 14, templars: 10, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.32 },
      { runners: 25, quicks: 25, slows: 25, hiddens: 35, leads: 35, shadows: 25, goliaths: 16, templars: 12, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.3 },
      { runners: 30, quicks: 30, slows: 30, hiddens: 40, leads: 40, shadows: 30, goliaths: 18, templars: 15, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.28 },
      { runners: 35, quicks: 35, slows: 35, hiddens: 45, leads: 45, shadows: 35, goliaths: 20, templars: 18, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.25 },
      { runners: 20, quicks: 20, slows: 20, hiddens: 20, leads: 20, shadows: 20, goliaths: 15, templars: 10, diggers: 1, titans: 1, guardians: 1, kings: 0, reavers: 0, rate: 0.3 }, // Wave 30: Fallen Guardian

      // 31-35 (Heavy End onslaught)
      { runners: 25, quicks: 25, slows: 25, hiddens: 35, leads: 35, shadows: 25, goliaths: 18, templars: 12, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.28 },
      { runners: 30, quicks: 30, slows: 30, hiddens: 40, leads: 40, shadows: 30, goliaths: 20, templars: 15, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.25 },
      { runners: 35, quicks: 35, slows: 35, hiddens: 45, leads: 45, shadows: 35, goliaths: 22, templars: 18, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.22 },
      { runners: 40, quicks: 40, slows: 40, hiddens: 50, leads: 50, shadows: 40, goliaths: 25, templars: 20, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.2 },
      { runners: 30, quicks: 30, slows: 30, hiddens: 30, leads: 30, shadows: 30, goliaths: 20, templars: 15, diggers: 0, titans: 3, guardians: 1, kings: 0, reavers: 0, rate: 0.25 }, // Wave 35 Giant Titan swarm

      // 36-39 (Pre-boss Apocalyptic onslaught)
      { runners: 35, quicks: 35, slows: 35, hiddens: 45, leads: 45, shadows: 35, goliaths: 22, templars: 18, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.22 },
      { runners: 40, quicks: 40, slows: 40, hiddens: 50, leads: 50, shadows: 40, goliaths: 25, templars: 20, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.2 },
      { runners: 45, quicks: 45, slows: 45, hiddens: 55, leads: 55, shadows: 45, goliaths: 28, templars: 22, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.18 },
      { runners: 50, quicks: 50, slows: 50, hiddens: 60, leads: 60, shadows: 50, goliaths: 30, templars: 25, diggers: 0, titans: 0, guardians: 0, kings: 0, reavers: 0, rate: 0.15 },

      // Wave 40 (The Apocalypse: Fallen King & Void Reaver)
      { runners: 40, quicks: 40, slows: 40, hiddens: 40, leads: 40, shadows: 30, goliaths: 20, templars: 15, diggers: 2, titans: 2, guardians: 1, kings: 1, reavers: 1, rate: 0.22 }
    ];
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
      
      // Tutorial hook: Upon the first canvas tap (which clears directions overlay), launch Step 1!
      if (!this.tutorialCompleted && this.tutorialStep === 0) {
        this.tutorialStep = 1;
        this.ui.showTutorialHint(1);
      }
      return;
    }
    const col = this.mouseGrid.col;
    const row = this.mouseGrid.row;

    // CLIENT OR HOST SEPARATION FOR CO-OP ACTIONS
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
      // Authoritative Host or Offline Mode
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

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
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
    
    // Clear sidebar pointing arrow when Scout is chosen in Step 1
    if (!this.tutorialCompleted && this.tutorialStep === 1 && type === 'scout') {
      this.ui.hidePointer();
    }
  }

  setSelectedPlacedTower(agent) {
    this.selectedPlacedTower = agent;
    this.ui.updateSelectionPanel(agent);

    // Tutorial hook: if they select the scout on Step 2, show pointer to upgrade button
    if (!this.tutorialCompleted && this.tutorialStep === 2) {
      if (agent && agent.gridX === 2 && agent.gridY === 1) {
        const upgradeBtn = document.getElementById('btn-upgrade');
        if (upgradeBtn && this.ui) {
          this.ui.showPointerAt(upgradeBtn, 'left');
          upgradeBtn.classList.add('tut-highlight');
        }
      } else {
        if (this.ui) this.ui.hidePointer();
      }
    }
  }

  buyAgentFromShop(type) {
    let price = 0;
    if (type === 'minigunner') price = 250;
    else if (type === 'commander') price = 350;
    else if (type === 'dj') price = 400;
    else if (type === 'pyromancer') price = 300;

    if (this.playerCoins >= price && !this.unlockedAgents.includes(type)) {
      this.playerCoins -= price;
      this.unlockedAgents.push(type);
      
      if (this.equippedAgents.length < 5) {
        this.equippedAgents.push(type);
      }

      this.saveStatsToStorage();
      this.ui.updateLobbyMeta(this.playerLevel, this.playerXp, this.playerCoins);
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
        chosenAgent = subRoll < 0.33 ? 'pyromancer' : (subRoll < 0.66 ? 'gladiator' : 'farm');
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
    this.state = 'playing';
    this.showMapDirections = true;
    
    this.grid.selectMap(this.selectedMap);
    
    const hcCheckbox = document.getElementById('hardcore-toggle');
    this.isHardcore = hcCheckbox ? hcCheckbox.checked : false;
    Enemy.hardcoreMode = this.isHardcore;

    this.lives = this.isHardcore ? 20 : 100;
    this.gold = this.isHardcore ? 250 : 400;
    this.wave = 0;
    this.waveInProgress = false;
    this.hasRevivedThisMatch = false; // Reset revive usage for the new game
    this.speedMultiplier = 1;
    this.enemies = [];
    this.bullets = [];
    this.spawnQueue = [];
    this.matchTime = 0;
    this.skipVotes.clear();
    
    this.grid.clear();
    this.effectManager.clear();
    this.setSelectedPlacedTower(null);

    // Initial empty shop selection: Force player to tap sidebar Scout button
    if (!this.tutorialCompleted) {
      this.selectedShopTower = null;
    } else {
      this.selectedShopTower = this.equippedAgents[0];
    }

    // Initialize individual wallets
    this.playerWallets = {};
    this.playerWallets[window.myPlayerId] = this.gold;
    for (const c of Network.conns) {
      if (c && c.open) {
        this.playerWallets[c.playerId] = this.gold;
      }
    }

    // --- TRANSMIT START SIGNAL TO ALL CONNECTED CO-OP CLIENTS ---
    if (Network.mode === 'HOST') {
      Network.broadcastToAll({
        type: 'START',
        selectedMap: this.selectedMap,
        isHardcore: this.isHardcore,
        playerWallets: this.playerWallets,
        obstacles: this.grid.obstacles // <-- Synchronize generated obstacles!
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

    // Deployment tutorial: Wait for initial tap instead of showing immediately
    if (!this.tutorialCompleted) {
      this.tutorialStep = 0;
    }
  }

  quitToLobby() {
    // Request a CrazyGames midroll ad break when returning to lobby
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

  /**
   * Action trigger that revives the player with 50 Lives upon watching a rewarded video ad.
   */
  revivePlayer() {
    this.state = 'playing';
    this.lives = 50; // Restore half health
    this.hasRevivedThisMatch = true;
    this.waveInProgress = false; // Allow players to reform defense strategy

    // Notify performance tracker
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
      case 'minigunner': baseVal = 250; break;
      case 'commander': baseVal = 350; break;
      case 'dj': baseVal = 400; break;
      case 'pyromancer': baseVal = 300; break;
      case 'farm': baseVal = 250; break;
      case 'gladiator': baseVal = 200; break;
      case 'soldier': baseVal = 150; break;
      case 'sniper': baseVal = 200; break;
      case 'medic': baseVal = 300; break;
      case 'rocketeer': baseVal = 400; break;
      default: baseVal = 0;
    }
    if (this.isHardcore) {
      baseVal = Math.floor(baseVal * 1.20);
    }
    return baseVal;
  }

  placeShopAgent(col, row, ownerId = 'p1') {
    // Restrict placement coordinates to target grid during onboarding phase
    if (!this.tutorialCompleted && this.tutorialStep === 1) {
      if (col !== 2 || row !== 1) {
        this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "PLACE ON THE HIGHLIGHTED TILE", '#f1c40f');
        return;
      }
    }

    let currentPlacedOfTypeCount = 0;
    for (const t of this.grid.towers.values()) {
      if (t.type === this.selectedShopTower) {
        currentPlacedOfTypeCount++;
      }
    }

    if (this.selectedShopTower === 'farm' && currentPlacedOfTypeCount >= 8) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 8 FARMS)", '#e74c3c');
      return;
    }
    if (this.selectedShopTower === 'commander' && currentPlacedOfTypeCount >= 3) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 3 COMMANDERS)", '#e74c3c');
      return;
    }
    if (this.selectedShopTower === 'dj' && currentPlacedOfTypeCount >= 1) {
      this.effectManager.spawnText(col * this.grid.cellSize + this.grid.cellSize / 2, row * this.grid.cellSize + this.grid.cellSize / 2, "LIMIT (MAX 1 DJ UNIT)", '#e74c3c');
      return;
    }

    const cost = this.getTowerCost(this.selectedShopTower);
    
    // Authoritative gold check
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

      switch (this.selectedShopTower) {
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
      }

      if (newAgent) {
        newAgent.equippedSkin = this.equippedSkins[this.selectedShopTower] || 'default';
        newAgent.ownerId = ownerId; // Save placing player ID for separate incomes
        this.grid.placeTower(col, row, newAgent);
        
        // Authoritative co-op gold deduction
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

        if (this.selectedShopTower === 'farm') {
          this.questProgress.farmsPlaced++;
        }
        this.questProgress.cashSpent += cost;
        this.checkQuestCompletion();

        // Advance onboarding state on placement
        if (!this.tutorialCompleted && this.tutorialStep === 1) {
          this.tutorialStep = 1.5;
          this.ui.showTutorialHint(1.5);
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

        // Terminate tutorial upon completing first active upgrade
        if (!this.tutorialCompleted && this.tutorialStep === 2) {
          this.tutorialStep = 3;
          this.tutorialCompleted = true;
          this.saveStatsToStorage();
          this.ui.dismissTutorial();
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
      const refund = this.selectedPlacedTower.getSellValue();
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
        this.game.skipWave();
      } else {
        this.effectManager.spawnText(400, 260, `SKIP VOTE: ${this.skipVotes.size}/${required}`, '#e67e22');
      }
    }
  }

  skipWave() {
    if (!this.waveInProgress || this.spawnQueue.length > 0 || this.wave >= this.maxWaves) return;
    const reward = 50 + this.wave * 15;
    
    // Credit reward to all active co-op wallets
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
    
    this.effectManager.spawnText(400, 260, `WAVE SKIPPED! +$${reward}`, '#e67e22');
    this.waveInProgress = false;
    this.startNextWave();
  }

  toggleAutoMode() {
    this.autoMode = !this.autoMode;
    if (!this.autoMode) this.autoStartTimer = 0;
    this.ui.updateAutoWaveButton(this.autoMode);
  }

  startNextWave() {
    if (this.showMapDirections) return;
    if (this.waveInProgress || this.state !== 'playing') return;

    this.wave++;
    this.waveInProgress = true;
    this.ui.updateWaveButton(true);
    this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);

    const blueprint = this.waveBlueprints[this.wave - 1];
    this.spawnInterval = blueprint.rate;
    this.spawnQueue = [];

    const spawnList = [];
    for (let i = 0; i < (blueprint.runners || 0); i++) spawnList.push('runner');
    for (let i = 0; i < (blueprint.quicks || 0); i++) spawnList.push('quick');
    for (let i = 0; i < (blueprint.slows || 0); i++) spawnList.push('slow');
    for (let i = 0; i < (blueprint.hiddens || 0); i++) spawnList.push('hidden');
    for (let i = 0; i < (blueprint.leads || 0); i++) spawnList.push('lead');
    for (let i = 0; i < (blueprint.shadows || 0); i++) spawnList.push('shadow');
    for (let i = 0; i < (blueprint.goliaths || 0); i++) spawnList.push('goliath');
    for (let i = 0; i < (blueprint.templars || 0); i++) spawnList.push('templar');
    for (let i = 0; i < (blueprint.diggers || 0); i++) spawnList.push('grave_digger');
    for (let i = 0; i < (blueprint.titans || 0); i++) spawnList.push('molten_titan');
    for (let i = 0; i < (blueprint.guardians || 0); i++) spawnList.push('fallen_guardian');
    for (let i = 0; i < (blueprint.kings || 0); i++) spawnList.push('fallen_king');
    for (let i = 0; i < (blueprint.reavers || 0); i++) spawnList.push('void_reaver');

    this.spawnQueue = spawnList.sort(() => Math.random() - 0.5);
    this.spawnTimer = 0;

    this.effectManager.spawnText(400, 300, `WAVE ${this.wave}`, '#f1c40f');

    // Tutorial hook: if they start the wave on Step 1.5, progress to Step 2
    if (!this.tutorialCompleted && this.tutorialStep === 1.5) {
      this.tutorialStep = 2;
      setTimeout(() => {
        this.ui.showTutorialHint(2);
      }, 600);
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

    if (this.state === 'playing') {
      this.matchTime += dt;
      this.update(dt);
    }
    
    this.draw();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (this.isMouseOnCanvas) {
      this.targetHoverPos.x = this.mousePos.x;
      this.targetHoverPos.y = this.mousePos.y;

      this.smoothHoverPos.x += (this.targetHoverPos.x - this.smoothHoverPos.x) * 18 * dt;
      this.smoothHoverPos.y += (this.targetHoverPos.y - this.smoothHoverPos.y) * 18 * dt;
    }

    // Transmit client cursor vectors to the host & perform smooth client interpolation
    if (Network.mode === 'CLIENT') {
      Network.sendClientData();
      Network.checkHostHeartbeat();
      this.effectManager.update(dt);

      // Frame-rate independent sliding interpolation for client-side enemies
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

      // Smooth visual tick updates for client-side towers
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

      return; // Clients bypass authoritative loop calculations
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

    if (this.spawnQueue.length > 0 && !this.showMapDirections) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        const nextType = this.spawnQueue.shift();
        this.spawnZombie(nextType);
      }
    }

    this.evaluateSupportBuffs();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const zombie = this.enemies[i];
      zombie.update(this.grid.pixelPath, this.effectManager, dt, this.enemies, this.grid.towers);

      if (zombie.health <= 0) {
        this.questProgress.kills++;
        this.checkQuestCompletion();
        this.enemies.splice(i, 1);
        continue;
      }

      if (zombie.targetNodeIndex >= this.grid.pixelPath.length) {
        this.lives--;
        this.effectManager.spawnText(zombie.x, zombie.y, "-1 Life", '#e74c3c');
        this.enemies.splice(i, 1);
        this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);

        if (this.lives <= 0) {
          this.state = 'gameover';
          soundManager.playDefeat();
          this.ui.showMatchSummaryCard(false);
          if (Network.mode === 'HOST') {
            Network.broadcastGameOver(this.wave);
          }
        }
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

    if (this.waveInProgress && this.enemies.length === 0 && this.spawnQueue.length === 0) {
      this.waveInProgress = false;

      // Harvest Farm economy end-of-wave payouts
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
          this.effectManager.spawnImpact(agent.x, agent.y, '#2ecc71', 6, 0.5);
        }
      }

      let cashBonus = 80 + this.wave * 10;
      if (this.isHardcore) {
        cashBonus = Math.floor(cashBonus * 0.75);
      }

      // Distribute cash bonus to all active co-op wallets
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

      const multiplier = this.selectedMap === 'tundra' ? 1.5 : this.selectedMap === 'desert' ? 1.25 : 1.0;
      let coinReward = Math.round((10 + this.wave * 5) * multiplier);
      let xpReward = Math.round((15 + this.wave * 4) * multiplier);

      if (this.wave >= this.maxWaves && this.isHardcore) {
        coinReward *= 3;
        xpReward *= 3;
      }

      this.playerCoins += coinReward;
      this.playerXp += xpReward;

      const nextLevelXp = this.playerLevel * 100;
      if (this.playerXp >= nextLevelXp) {
        this.playerXp -= nextLevelXp;
        this.playerLevel++;
        this.effectManager.spawnText(400, 240, `LEVEL UP! REACHED LEVEL ${this.playerLevel}`, '#f1c40f');
      }

      this.saveStatsToStorage();
      
      this.effectManager.spawnText(400, 200, `WAVE SECURED! +🪙 ${coinReward} / +🌟 ${xpReward} XP`, '#2ecc71');

      if (this.wave >= this.maxWaves) {
        this.state = 'victory';
        soundManager.playVictory();
        this.saveSpeedrunRecord();
        this.ui.showMatchSummaryCard(true);
        if (Network.mode === 'HOST') {
          Network.broadcastGameOver(this.wave);
        }
      } else {
        this.ui.updateWaveButton(false);
        if (this.autoMode) {
          this.autoStartTimer = 2.0;
          this.ui.showAutoCountdown(2);
        }
      }

      this.ui.updateHUD(this.lives, this.gold, this.wave, this.maxWaves);
    }

    // Host continuously broadcasts server game-states to guests
    if (Network.mode === 'HOST') {
      // Record Host's local cursor data so that Clients can see it
      window.playerCursors['p1'] = {
        mouseX: this.isMouseOnCanvas ? this.mousePos.x : undefined,
        mouseY: this.isMouseOnCanvas ? this.mousePos.y : undefined,
        selectedShopTower: this.selectedShopTower,
        equippedSkin: this.equippedSkins[this.selectedShopTower] || 'default'
      };

      Network.broadcastState();
    }
  }

  evaluateSupportBuffs() {
    for (const agent of this.grid.towers.values()) {
      agent.djRangeBuffed = false;
      agent.djCamoDetectionBuffed = false;
      agent.commanderSpeedBuffed = false;
      agent.commanderAbilityActive = false;
    }

    for (const dj of this.grid.towers.values()) {
      if (dj.type === 'dj') {
        for (const agent of this.grid.towers.values()) {
          if (agent !== dj) {
            const dist = Math.hypot(agent.x - dj.x, agent.y - dj.y);
            if (dist <= dj.range) {
              agent.djRangeBuffed = true;
              if (dj.level >= 3) {
                agent.djCamoDetectionBuffed = true;
              }
            }
          }
        }
      }
    }

    for (const cmd of this.grid.towers.values()) {
      if (cmd.type === 'commander') {
        const hasBuff = cmd.buffDurationLeft > 0 || cmd.isAbilityActive;
        for (const agent of this.grid.towers.values()) {
          if (agent !== cmd) {
            const dist = Math.hypot(agent.x - cmd.x, agent.y - cmd.y);
            if (dist <= cmd.range) {
              if (hasBuff) {
                agent.commanderSpeedBuffed = true;
              }
              if (cmd.isAbilityActive) {
                agent.commanderAbilityActive = true;
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
      case 'grave_digger': e = new GraveDigger(startPoint.x, startPoint.y); break;
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

    if (this.state === 'playing') {
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
      this.drawPlayerCursors(); // Draw other players' mouse vectors on canvas
      
      // Render target placement and bouncing guide only when Scout is selected
      if (!this.tutorialCompleted && this.tutorialStep === 1 && this.selectedShopTower === 'scout') {
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
      this.ctx.fillText("Manage loadout and map selection in your console sidebar", 400, 335);
    }

    if (this.state === 'victory') {
      this.drawConfetti();
    }

    this.ctx.restore();
  }

  /**
   * Draws a glowing target tile overlay and bouncing indicator arrow on the canvas.
   */
  drawTutorialCanvasHighlight(ctx) {
    const cellSize = this.grid.cellSize;
    // Set target coordinate to Col 2, Row 1 (valid placement spot on Grassland)
    const targetX = 2 * cellSize + cellSize / 2;
    const targetY = 1 * cellSize + cellSize / 2;
    
    // Smooth bouncing factor
    const bounce = Math.sin(Date.now() / 150) * 6;
    
    ctx.save();
    ctx.translate(targetX, targetY);
    
    // Draw pulsating golden highlight border
    const pulse = Math.abs(Math.sin(Date.now() / 200)) * 6;
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 3.5 + pulse;
    ctx.strokeRect(-cellSize / 2 + 2, -cellSize / 2 + 2, cellSize - 4, cellSize - 4);
    
    // Draw "PLACE HERE" guide text
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = "bold 13px 'Fredoka', 'Nunito', sans-serif";
    ctx.textAlign = 'center';
    ctx.strokeText("PLACE HERE", 0, -cellSize / 2 - 25 + bounce);
    ctx.fillText("PLACE HERE", 0, -cellSize / 2 - 25 + bounce);
    
    // Draw bouncing arrow pointing directly down onto the grid cell
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-8, -cellSize / 2 - 15 + bounce);
    ctx.lineTo(8, -cellSize / 2 - 15 + bounce);
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

      // 1. Snapped Tile Box (Shows the destination tile slot)
      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(col * size + 2, row * size + 2, size - 4, size - 4);
      this.ctx.fillStyle = isValid ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)';
      this.ctx.fillRect(col * size + 2, row * size + 2, size - 4, size - 4);
      this.ctx.restore();

      // 2. Completely Smooth (un-snapped) Range Circle & Character Preview
      // Centered directly on the real-time mouse coordinate!
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
    if (Network.mode === 'OFFLINE') return;

    for (const [pId, cursor] of Object.entries(window.playerCursors || {})) {
      if (pId === window.myPlayerId) continue; // Don't draw our own locally
      if (!cursor || cursor.mouseX === undefined) continue;

      const cx = cursor.mouseX;
      const cy = cursor.mouseY;

      // Draw color-coded vector mouse cursor
      this.ctx.save();
      this.ctx.fillStyle = this.getPlayerColor(pId);
      this.ctx.strokeStyle = '#222';
      this.ctx.lineWidth = 2;

      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(cx + 5, cy + 15);
      this.ctx.lineTo(cx + 10, cy + 10);
      this.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Render player label above pointer
      const name = (window.lobbyPlayers[pId] || "Player").split(" [")[0];
      this.ctx.fillStyle = '#fff';
      this.ctx.font = "900 11px 'Fredoka', sans-serif";
      this.ctx.strokeStyle = '#222';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(name, cx + 12, cy + 12);
      this.ctx.fillText(name, cx + 12, cy + 12);

      // Render their selected placement preview hologram if active
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
      default: return 0;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new Game();
});