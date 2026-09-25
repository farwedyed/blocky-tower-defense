/* --- SECURE CLOUD NETWORKING MODULE (AZURE WEBSOCKETS) --- */

import { Enemy, Runner, Quick, Slow, Hidden, Lead, Shadow, Goliath, Templar, GraveDigger, HazardGiant, MoltenTitan, FallenGuardian, FallenKing, VoidReaver, Brute, FrostSpirit } from './enemy.js';
import { Scout, Minigunner, Commander, DJUnit, Pyromancer, Farm, Gladiator, Soldier, Sniper, Medic, Rocketeer, Demoman, Freezer, Shotgunner, CrookBoss, MilitaryBase, Ranger, Turret } from './tower.js';
import { soundManager } from './sound.js';
import { CrazyGamesManager } from './crazygames.js';

if (!window.lobbyPlayers) {
    window.lobbyPlayers = { p1: "Host Survivor", p2: "", p3: "", p4: "", p5: "", p6: "", p7: "", p8: "" };
}
if (!window.myPlayerId) {
    window.myPlayerId = "p1";
}
if (!window.playerCursors) {
    window.playerCursors = {};
}

export const Network = {
    ws: null,
    mode: 'OFFLINE',
    serverUrl: 'wss://server.farwede.workers.dev', // Your secure SSL domain
    roomId: null,
    lastUpdate: 0,
    lastClientUpdate: 0,
    hostPlayerId: 'p1',
    game: null,
    pendingEvents: [],
    conns: [], // Preserves legacy compatibility for vote count checks
    _effectsIntercepted: false,
    _soundsIntercepted: false,
    isJoining: false,
    isInviteLinkJoin: false,
    attemptedRoomCode: null,
    connectionTimeout: null,
    connectionWatchdog: null,

    // Backward compatibility shim for Network.conn.send(...)
    conn: {
        send: function(data) {
            Network.send(data);
        },
        get open() {
            return Network.ws && Network.ws.readyState === WebSocket.OPEN;
        }
    },

    // Backward compatibility shim for Network.peer.id
    peer: {
        get id() {
            return Network.roomId;
        },
        destroy: function() {
            Network.disconnect();
        }
    },

    init: function(gameInstance, onOpen) {
        this.game = gameInstance;
        this.pendingEvents = [];
        this.interceptEffects();
        this.interceptSounds();

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            if (onOpen) onOpen();
            return;
        }

        try {
            this.ws = new WebSocket(this.serverUrl);

            this.ws.onopen = () => {
                console.log("[Network] Connected to Game Server!");
                if (onOpen) onOpen();
            };

            this.ws.onmessage = (event) => {
                this.handleServerMessage(event.data);
            };

            this.ws.onerror = (err) => {
                console.warn("[Network Error] WebSocket error:", err);
                if (this.isJoining) {
                    this.handleJoinError('CONNECTION_FAILED');
                }
            };

            this.ws.onclose = () => {
                console.log("[Network] Cloud socket closed.");
                if (this.isJoining) {
                    this.handleJoinError('CONNECTION_FAILED');
                }
            };
        } catch (err) {
            console.error("[Network] Failed to initialize WebSocket:", err);
            this.mode = 'OFFLINE';
            if (this.isJoining) {
                this.handleJoinError('CONNECTION_FAILED');
            }
        }
    },

    send: function(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    },

    hostRoom: function(playerName, isPublic, onCreated) {
        this.mode = 'HOST';
        this.onCreatedCallback = typeof isPublic === 'function' ? isPublic : onCreated;
        const publicFlag = typeof isPublic === 'boolean' ? isPublic : true;

        const sendHost = () => {
            this.send({ type: 'HOST_ROOM', name: playerName, isPublic: publicFlag });
        };

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.init(this.game, sendHost);
        } else {
            sendHost();
        }
    },

    join: function(roomId, playerName, onConnected, isInviteLink = false) {
        this.clearConnectionTimers();
        this.mode = 'CLIENT';
        this.isJoining = true;
        this.isInviteLinkJoin = !!isInviteLink;
        this.attemptedRoomCode = (roomId || '').toUpperCase();
        this.onConnectedCallback = onConnected;

        const sendJoin = () => {
            this.send({ type: 'JOIN_ROOM', roomId: this.attemptedRoomCode, name: playerName });
        };

        // 8-second watchdog timer matching CrazyGames QA checklist
        this.connectionTimeout = setTimeout(() => {
            if (this.isJoining) {
                console.warn("[Network] Connection watchdog timeout (8s) triggered.");
                this.handleJoinError('TIMEOUT');
            }
        }, 8000);

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.init(this.game, sendJoin);
        } else {
            sendJoin();
        }
    },

    disconnect: function() {
        const leavingRoomId = this.roomId;
        this.clearConnectionTimers();
        this.mode = 'OFFLINE';
        this.roomId = null;
        this.isJoining = false;
        this.isInviteLinkJoin = false;
        this.attemptedRoomCode = null;
        window.lobbyPlayers = { p1: "Host Survivor", p2: "", p3: "", p4: "", p5: "", p6: "", p7: "", p8: "" };
        window.myPlayerId = "p1";
        window.playerCursors = {};

        // 1. Notify CrazyGames platform of exit
        CrazyGamesManager.leaveRoomPresence();

        // 2. Send LEAVE_ROOM and close socket so the server 100% registers the exit
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN && leavingRoomId) {
                try {
                    this.ws.send(JSON.stringify({ type: 'LEAVE_ROOM', roomId: leavingRoomId }));
                } catch(e) {}
            }
            try {
                this.ws.close();
            } catch(e) {}
            this.ws = null;
        }
    },

    clearConnectionTimers: function() {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        if (this.connectionWatchdog) {
            clearTimeout(this.connectionWatchdog);
            this.connectionWatchdog = null;
        }
    },

    syncRoomPresence: function() {
        if (!this.roomId || this.mode === 'OFFLINE') return;

        // Based on actual player count rather than a specific player slot
        let activePlayerCount = 0;
        if (window.lobbyPlayers && typeof window.lobbyPlayers === 'object') {
            for (const slot of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
                const name = window.lobbyPlayers[slot];
                if (name && typeof name === 'string' && name.trim() !== '') {
                    activePlayerCount++;
                }
            }
        } else {
            activePlayerCount = 1;
        }

        const inLobby = !this.game || this.game.state === 'lobby';
        const waveInProgress = this.game ? !!this.game.waveInProgress : false;
        const isJoinable = (activePlayerCount < 8) && inLobby && !waveInProgress;

        CrazyGamesManager.updateRoomPresence(this.roomId.toLowerCase(), isJoinable);
    },

    handleJoinError: function(reason, customMsg) {
        this.isJoining = false;
        this.clearConnectionTimers();
        const wasInvite = this.isInviteLinkJoin;
        const roomCode = this.attemptedRoomCode || '---';

        try {
            const url = new URL(window.location.href);
            if (url.searchParams.has('roomId')) {
                url.searchParams.delete('roomId');
                window.history.replaceState({}, document.title, url.pathname + url.search);
            }
        } catch (e) {}

        this.disconnect();

        let title = "CONNECTION NOTICE ⚠️";
        let message = "Unable to connect to the squad.";

        if (reason === 'ROOM_FULL') {
            title = "ROOM IS FULL ⚠️";
            message = "This squad room is currently full (8/8 players). Please try another squad or host your own.";
        } else if (reason === 'ROOM_NOT_FOUND') {
            if (wasInvite) {
                title = "ROOM NOT AVAILABLE ⚠️";
                message = "This squad room is no longer available or has been disbanded by the host.";
            } else {
                title = "ROOM NOT FOUND ⚠️";
                message = `No active squad was found with room code: ${roomCode}. Please verify the code and try again.`;
            }
        } else if (reason === 'MATCH_IN_PROGRESS') {
            title = "BATTLE IN PROGRESS ⚠️";
            message = "That squad is already in battle! You can only join open squads in the lobby.";
        } else if (reason === 'TIMEOUT' || reason === 'CONNECTION_FAILED') {
            title = "CONNECTION FAILED ⚠️";
            message = customMsg || "Connection timed out. Unable to reach the squad session. Please check your network and try again.";
        }

        const returnToMenu = () => {
            if (this.game && this.game.ui && this.game.ui.lobby) {
                if (reason === 'ROOM_NOT_FOUND' && !wasInvite) {
                    if (this.game.ui.lobby.coop && typeof this.game.ui.lobby.coop.resetJoinControls === 'function') {
                        this.game.ui.lobby.coop.resetJoinControls();
                        return;
                    }
                }
                this.game.ui.lobby.showSplashState();
            }
        };

        if (this.game && this.game.ui && this.game.ui.gameUI) {
            this.game.ui.gameUI.showInGameAlert(message, title, returnToMenu);
        } else {
            alert(`${title}\n\n${message}`);
            returnToMenu();
        }
    },

    checkHostHeartbeat: function() {
        // No-op: Handled by server keep-alives automatically
    },

    handleServerMessage: function(raw) {
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            return;
        }

        // Direct peer-to-peer mouse updates
        if (data.type === 'P_DATA') {
            const pId = data.senderId;
            if (pId && pId !== window.myPlayerId) {
                if (!window.playerCursors) window.playerCursors = {};
                let c = window.playerCursors[pId];
                if (!c) {
                    c = {
                        x: data.mouseX,
                        y: data.mouseY,
                        targetX: data.mouseX,
                        targetY: data.mouseY,
                        lastTime: performance.now()
                    };
                    window.playerCursors[pId] = c;
                }
                c.targetX = data.mouseX;
                c.targetY = data.mouseY;
                c.selectedShopTower = data.selectedShopTower;
                c.equippedSkin = data.equippedSkin;
            }
            return;
        }

        // Room Creation Confirmation
        if (data.type === 'ROOM_CREATED') {
            this.roomId = data.roomId;
            window.myPlayerId = 'p1';
            window.lobbyPlayers = data.lobbyPlayers;
            this.syncRoomPresence();
            if (this.onCreatedCallback) this.onCreatedCallback(data.roomId);
            if (this.game && this.game.ui) this.game.ui.updateCoopPlayerList();
        }

        // Rejection when joining mid-match
        else if (data.type === 'MATCH_IN_PROGRESS_REJECT') {
            this.handleJoinError('MATCH_IN_PROGRESS');
        }

        // Server Rejection: Room is Full (8/8)
        else if (data.type === 'ROOM_FULL_REJECT' || data.type === 'ROOM_FULL') {
            this.handleJoinError('ROOM_FULL');
        }

        // Server Rejection: Room Code Not Found or Disbanded
        else if (data.type === 'JOIN_FAILED' || data.type === 'ROOM_NOT_FOUND') {
            this.handleJoinError('ROOM_NOT_FOUND');
        }

        // Room Browser Updates
        else if (data.type === 'ROOM_LIST') {
            if (this.game && this.game.ui && this.game.ui.lobby && this.game.ui.lobby.coop) {
                this.game.ui.lobby.coop.renderServerBrowser(data.rooms || []);
            }
        }

        // Client Joined Confirmation
        else if (data.type === 'LOBBY_WELCOME') {
            this.isJoining = false;
            this.clearConnectionTimers();
            this.roomId = data.roomId || this.roomId;
            window.myPlayerId = data.assignedId;
            window.lobbyPlayers = data.lobbyPlayers;
            this.game.selectedMap = data.selectedMap;
            this.game.isHardcore = data.isHardcore;

            this.syncRoomPresence();

            if (this.onConnectedCallback) this.onConnectedCallback();
            if (this.game && this.game.ui) this.game.ui.updateCoopPlayerList();
        }

        // Lobby Roster Updates (Ensures starting wallets exist and syncs 8/8 capacity with CrazyGames)
        else if (data.type === 'LOBBY_UPDATE') {
            window.lobbyPlayers = data.lobbyPlayers;
            
            this.syncRoomPresence();

            if (this.mode === 'HOST' && this.game) {
                if (!this.game.playerWallets) this.game.playerWallets = {};
                for (const slot of Object.keys(data.lobbyPlayers)) {
                    if (data.lobbyPlayers[slot] && this.game.playerWallets[slot] === undefined) {
                        this.game.playerWallets[slot] = this.game.isHardcore ? 250 : 400;
                    }
                }
            }
            if (this.game && this.game.ui) this.game.ui.updateCoopPlayerList();
        }

        // Announcement for other clients when a new host takes over
        else if (data.type === 'NEW_LEADER_ANNOUNCED') {
            if (data.assignedId) window.myPlayerId = data.assignedId;
            if (data.lobbyPlayers) window.lobbyPlayers = data.lobbyPlayers;
            if (this.game && this.game.ui && this.game.ui.lobby) {
                this.game.ui.lobby.updateCoopPlayerList();
            }
        }

        // Host Promotion (If leader drops, server promotes next player seamlessly)
        else if (data.type === 'PROMOTED_TO_HOST') {
            this.mode = 'HOST';
            window.myPlayerId = 'p1';
            if (data.roomId) this.roomId = data.roomId;
            if (data.lobbyPlayers) window.lobbyPlayers = data.lobbyPlayers;

            this.syncRoomPresence();

            // Unhide privacy toggle and copy link icon for newly promoted host
            const hostPrivacyBox = document.getElementById('host-privacy-container');
            if (hostPrivacyBox) hostPrivacyBox.classList.remove('hidden');
            const copyCodeBtn = document.getElementById('btn-copy-code');
            if (copyCodeBtn) copyCodeBtn.classList.remove('hidden');

            const labelStatus = document.getElementById('label-lobby-status');
            if (labelStatus) {
                labelStatus.textContent = "HOSTING SQUAD LOBBY";
                labelStatus.style.color = "var(--primary-green-dark)";
            }

            if (this.game && this.game.ui) {
                // Unlock Map Selection & Deploy controls in the Lobby for the new host
                if (this.game.ui.lobby) {
                    this.game.ui.lobby.toggleSoloElements(true);
                    this.game.ui.lobby.updateCoopPlayerList();
                }

                // Unlock In-Game Match Controls if a game is currently playing
                if (this.game.state === 'playing') {
                    this.game.ui.updateWaveButton(this.game.waveInProgress);
                    this.game.ui.updateAutoWaveButton(this.game.autoMode);
                    this.game.ui.updateSpeedButton(this.game.speedMultiplier);
                    this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);

                    // Resume spawners if leader disconnected mid-wave
                    if (this.game.waveInProgress && this.game.activeSpawners.length === 0) {
                        let blueprints = this.game.waveBlueprintsEasy;
                        if (this.game.selectedDifficulty === 'casual') blueprints = this.game.waveBlueprintsCasual;
                        else if (this.game.selectedDifficulty === 'intermediate') blueprints = this.game.waveBlueprintsIntermediate;
                        else if (this.game.selectedDifficulty === 'molten') blueprints = this.game.waveBlueprintsMolten;
                        else if (this.game.selectedDifficulty === 'fallen') blueprints = this.game.waveBlueprintsFallen;

                        const blueprint = blueprints[this.game.wave - 1];
                        if (blueprint) {
                            const spawnList = [];
                            for (let i = 0; i < Math.max(1, Math.floor((blueprint.runners || 0) * 0.4)); i++) spawnList.push('runner');
                            for (let i = 0; i < Math.max(1, Math.floor((blueprint.quicks || 0) * 0.4)); i++) spawnList.push('quick');
                            for (let i = 0; i < Math.max(1, Math.floor((blueprint.slows || 0) * 0.4)); i++) spawnList.push('slow');

                            this.game.activeSpawners.push({
                                queue: spawnList.sort(() => Math.random() - 0.5),
                                timer: 0,
                                interval: Math.max(1.0, blueprint.rate)
                            });
                        }
                    }
                }
            }
        }

        // Match Start
        else if (data.type === 'START') {
            this.game.selectedMap = data.selectedMap;
            this.game.selectedDifficulty = data.selectedDifficulty || 'easy';
            this.game.isHardcore = data.isHardcore;
            this.game.playerWallets = data.playerWallets || {};

            this.game.state = 'playing';
            this.game.tutorialActive = false;
            this.game.showMapDirections = true;

            // Disable joining once active match begins
            if (this.roomId) {
                CrazyGamesManager.updateRoomPresence(this.roomId.toLowerCase(), false);
            }
            this.game.grid.selectMap(data.selectedMap);

            if (data.obstacles) this.game.grid.obstacles = data.obstacles;

            const startingCash = data.gold !== undefined ? data.gold : (data.isHardcore ? 250 : 600);
            this.game.playerWallets = data.playerWallets || {};
            for (const slot of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
              if (this.game.playerWallets[slot] === undefined) {
                this.game.playerWallets[slot] = startingCash;
              }
            }
            this.game.lives = data.lives !== undefined ? data.lives : (data.isHardcore ? 10 : 150);
            this.game.gold = (this.game.playerWallets[window.myPlayerId] !== undefined)
              ? this.game.playerWallets[window.myPlayerId]
              : startingCash;
            this.game.maxWaves = data.maxWaves !== undefined ? data.maxWaves : 30;

            this.game.wave = 0;
            this.game.waveInProgress = false;
            this.game.speedMultiplier = 1;
            this.game.enemies = [];
            this.game.bullets = [];
            this.game.spawnQueue = [];
            this.game.matchTime = 0;

            this.game.grid.clear();
            this.game.effectManager.clear();
            this.game.setSelectedPlacedTower(null);
            this.game.selectedShopTower = this.game.equippedAgents[0];

            let mapName = data.selectedMap.replace('_', ' ').toUpperCase();
            this.game.ui.showGameLayout(mapName);
            this.game.ui.renderPlacementShop();
            this.game.ui.updateSpeedButton(1);
            this.game.ui.updateWaveButton(false);
            this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
        }

        // Return to Lobby
        else if (data.type === 'RETURN_TO_LOBBY') {
            if (this.game) {
                this.game.state = 'lobby';
                this.game.waveInProgress = false;
                if (this.game.ui) {
                    const summaryCard = document.getElementById('match-summary-card');
                    if (summaryCard) summaryCard.remove();
                    this.game.ui.hideOverlay();
                    this.game.ui.showLobbyLayout();
                }
            }
        }

        // Team Revive
        else if (data.type === 'TEAM_REVIVE') {
            if (this.game) {
                this.game.revivePlayer();
                const summaryCard = document.getElementById('match-summary-card');
                if (summaryCard) summaryCard.remove();
                this.game.ui.hideOverlay();
            }
        }

        // Match Game Over (Victory / Defeat Synchronization for Joined Players)
        else if (data.type === 'GAME_OVER') {
            if (this.game && this.game.state === 'playing') {
                this.game.state = data.isVictory ? 'victory' : 'gameover';
                this.game.wave = data.wave !== undefined ? data.wave : this.game.wave;
                
                CrazyGamesManager.gameplayStop();

                if (data.isVictory) {
                    soundManager.playVictory();
                    this.game.saveSpeedrunRecord();
                } else {
                    soundManager.playDefeat();
                }

                this.game.saveStatsToStorage();

                if (this.game.ui) {
                    this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
                    this.game.ui.showMatchSummaryCard(data.isVictory);
                }
            }
        }

        // Cash Case Multiplayer Sync
        else if (data.type === 'SPAWN_CASH_CASE') {
            if (this.game) {
                this.game.activeCashCase = data.cashCase;
                soundManager.playCrateDrop();
            }
        }
        else if (data.type === 'CONSUME_CASH_CASE') {
            if (this.game) {
                this.game.activeCashCase = null;
                const modal = document.getElementById('cash-case-modal');
                if (modal) {
                    modal.remove();
                    CrazyGamesManager.gameplayStart();
                }
                if (data.claimedBy === window.myPlayerId && data.reward) {
                    this.game.gold += data.reward;
                }
                this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
            }
        }
        else if (data.type === 'DISMISS_CASH_CASE') {
            if (this.game) {
                this.game.activeCashCase = null;
                const modal = document.getElementById('cash-case-modal');
                if (modal) {
                    modal.remove();
                    CrazyGamesManager.gameplayStart();
                }
            }
        }

        // Replicated Game State (Client side)
        else if (data.type === 'GAME_STATE' && this.mode === 'CLIENT') {
            this.applyGameState(data);
        }

        // Actions received on Host from clients
        else if (this.mode === 'HOST') {
            this.handleClientActionOnHost(data);
        }
    },

    handleClientActionOnHost: function(data) {
        const cPlayerId = data.senderId;

        if (data.type === 'P_DATA') {
            window.playerCursors[cPlayerId] = {
                mouseX: data.mouseX,
                mouseY: data.mouseY,
                selectedShopTower: data.selectedShopTower,
                equippedSkin: data.equippedSkin
            };
        }
        else if (data.type === 'PLACE_TOWER') {
            if (this.game) {
                const type = data.towerType || data.targetShopTower;
                if (!type) return;
                const cost = this.game.getTowerCost(type);

                if (!this.game.playerWallets) this.game.playerWallets = {};
                if (this.game.playerWallets[cPlayerId] === undefined) {
                    this.game.playerWallets[cPlayerId] = this.game.gold;
                }
                const wallet = this.game.playerWallets[cPlayerId];

                const posX = data.x !== undefined ? data.x : data.col;
                const posY = data.y !== undefined ? data.y : data.row;
                const check = this.game.grid.isPositionValidForPlacement ? this.game.grid.isPositionValidForPlacement(posX, posY, 18) : { valid: true };

                if (wallet >= cost && check.valid) {
                    // Pass `type` directly without overwriting the Host's own selectedShopTower!
                    this.game.placeShopAgent(posX, posY, cPlayerId, type);
                }
            }
        }
        else if (data.type === 'UPGRADE_TOWER') {
            if (this.game) {
                // Find tower by ID, key, pixel location, or grid cell
                let tower = null;
                if (data.towerId) tower = this.game.grid.towers.get(data.towerId);
                if (!tower && data.key) tower = this.game.grid.towers.get(data.key);
                if (!tower && data.x !== undefined && data.y !== undefined && this.game.grid.getTowerAt) {
                    tower = this.game.grid.getTowerAt(data.x, data.y, 14);
                }
                if (!tower) {
                    tower = this.game.grid.towers.get(`${data.col},${data.row}`);
                }

                if (tower && tower.level < 5) {
                    const cost = tower.getUpgradeCost();
                    const wallet = this.game.playerWallets ? this.game.playerWallets[cPlayerId] : this.game.gold;
                    if (wallet >= cost) {
                        tower.upgrade(this.game.effectManager);
                        soundManager.playUpgrade();
                        if (this.game.playerWallets) {
                            this.game.playerWallets[cPlayerId] -= cost;
                        } else {
                            this.game.gold -= cost;
                        }
                    }
                }
            }
        }
        else if (data.type === 'SELL_TOWER') {
            if (this.game) {
                let tower = null;
                if (data.towerId) tower = this.game.grid.towers.get(data.towerId);
                if (!tower && data.key) tower = this.game.grid.towers.get(data.key);
                if (!tower && data.x !== undefined && data.y !== undefined && this.game.grid.getTowerAt) {
                    tower = this.game.grid.getTowerAt(data.x, data.y, 14);
                }
                if (!tower) {
                    tower = this.game.grid.towers.get(`${data.col},${data.row}`);
                }

                if (tower) {
                    const refund = tower.getSellValue();
                    this.game.grid.removeTower(tower);
                    if (this.game.playerWallets) {
                        this.game.playerWallets[cPlayerId] += refund;
                    } else {
                        this.game.gold -= refund;
                    }
                    this.game.effectManager.spawnPlacementSparks(tower.x, tower.y, 40);
                }
            }
        }
        else if (data.type === 'VOTE_SKIP') {
            if (this.game) {
                if (!this.game.skipVotes) this.game.skipVotes = new Set();
                this.game.skipVotes.add(cPlayerId);

                const totalPlayers = Object.values(window.lobbyPlayers).filter(p => p).length;
                const required = Math.ceil(totalPlayers / 2);
                if (this.game.skipVotes.size >= required) {
                    this.game.skipVotes.clear();
                    this.game.skipWave();
                }
            }
        }
        else if (data.type === 'REQUEST_TEAM_REVIVE') {
            if (this.game) {
                this.game.revivePlayer();
                this.broadcastToAll({ type: 'TEAM_REVIVE' });
            }
        }
        else if (data.type === 'CONSUME_CASH_CASE') {
            if (this.game) {
                this.game.claimCashCase(cPlayerId);
            }
        }
        else if (data.type === 'DISMISS_CASH_CASE') {
            if (this.game) {
                this.game.dismissCashCase();
            }
        }
    },

    applyGameState: function(data) {
        this.game.lives = data.lives;
        this.game.wave = data.wave;
        if (data.maxWaves !== undefined) this.game.maxWaves = data.maxWaves;
        this.game.waveInProgress = data.waveInProgress;
        this.game.speedMultiplier = data.speedMultiplier !== undefined ? data.speedMultiplier : 1;

        // Synchronize Victory/Defeat states even if tab was in background
        if (data.gameState && data.gameState !== this.game.state) {
            if (data.gameState === 'victory' && this.game.state === 'playing') {
                this.game.state = 'victory';
                CrazyGamesManager.gameplayStop();
                soundManager.playVictory();
                this.game.saveSpeedrunRecord();
                this.game.saveStatsToStorage();
                if (this.game.ui) this.game.ui.showMatchSummaryCard(true);
                return;
            } else if (data.gameState === 'gameover' && this.game.state === 'playing') {
                this.game.state = 'gameover';
                CrazyGamesManager.gameplayStop();
                soundManager.playDefeat();
                this.game.saveStatsToStorage();
                if (this.game.ui) this.game.ui.showMatchSummaryCard(false);
                return;
            }
        }

        // Instant fallback: If synced lives reach 0, immediately trigger Defeat screen
        if (this.game.lives <= 0 && this.game.state === 'playing') {
            this.game.state = 'gameover';
            CrazyGamesManager.gameplayStop();
            soundManager.playDefeat();
            this.game.saveStatsToStorage();
            if (this.game.ui) {
                this.game.ui.showMatchSummaryCard(false);
            }
            return;
        }
        this.game.skipVotesCount = data.skipVotesCount !== undefined ? data.skipVotesCount : 0;
        this.game.skipVotesRequired = data.skipVotesRequired !== undefined ? data.skipVotesRequired : 1;

        // Smoothly blend cursor targets without snapping
        if (data.playerCursors) {
            if (!window.playerCursors) window.playerCursors = {};
            for (const [pId, cData] of Object.entries(data.playerCursors)) {
                if (pId === window.myPlayerId) continue;
                let c = window.playerCursors[pId];
                if (!c) {
                    c = { x: cData.mouseX, y: cData.mouseY, targetX: cData.mouseX, targetY: cData.mouseY, lastTime: performance.now() };
                    window.playerCursors[pId] = c;
                }
                c.targetX = cData.mouseX;
                c.targetY = cData.mouseY;
                c.selectedShopTower = cData.selectedShopTower;
                c.equippedSkin = cData.equippedSkin;
            }
        }

        if (data.playerWallets && data.playerWallets[window.myPlayerId] !== undefined) {
            this.game.gold = data.playerWallets[window.myPlayerId];
        } else {
            this.game.gold = data.gold;
        }

        const activeKeys = new Set();
        data.towers.forEach(tData => {
            const key = tData.key || tData.id;
            activeKeys.add(key);

            let tower = this.game.grid.towers.get(key);
            if (!tower && tData.x !== undefined && tData.y !== undefined && this.game.grid.getTowerAt) {
                tower = this.game.grid.getTowerAt(tData.x, tData.y, 6);
            }

            if (!tower) {
                const size = this.game.grid.cellSize;
                switch (tData.type) {
                    case 'scout': tower = new Scout(tData.col, tData.row, size); break;
                    case 'minigunner': tower = new Minigunner(tData.col, tData.row, size); break;
                    case 'commander': tower = new Commander(tData.col, tData.row, size); break;
                    case 'dj': tower = new DJUnit(tData.col, tData.row, size); break;
                    case 'pyromancer': tower = new Pyromancer(tData.col, tData.row, size); break;
                    case 'farm': tower = new Farm(tData.col, tData.row, size); break;
                    case 'gladiator': tower = new Gladiator(tData.col, tData.row, size); break;
                    case 'soldier': tower = new Soldier(tData.col, tData.row, size); break;
                    case 'sniper': tower = new Sniper(tData.col, tData.row, size); break;
                    case 'medic': tower = new Medic(tData.col, tData.row, size); break;
                    case 'rocketeer': tower = new Rocketeer(tData.col, tData.row, size); break;
                    case 'demoman': tower = new Demoman(tData.col, tData.row, size); break;
                    case 'freezer': tower = new Freezer(tData.col, tData.row, size); break;
                    case 'shotgunner': tower = new Shotgunner(tData.col, tData.row, size); break;
                    case 'crook_boss': tower = new CrookBoss(tData.col, tData.row, size); break;
                    case 'military_base': tower = new MilitaryBase(tData.col, tData.row, size); break;
                    case 'ranger': tower = new Ranger(tData.col, tData.row, size); break;
                    case 'turret': tower = new Turret(tData.col, tData.row, size); break;
                }
                if (tower) {
                    tower.id = key;
                    if (tData.x !== undefined) tower.x = tData.x;
                    if (tData.y !== undefined) tower.y = tData.y;
                    this.game.grid.towers.set(key, tower);
                }
            }

            if (tower) {
                if (tData.x !== undefined) tower.x = tData.x;
                if (tData.y !== undefined) tower.y = tData.y;

                // Sync level and immediately refresh selection menu if currently selected
                if (tower.level !== tData.level) {
                    tower.level = tData.level;
                    if (this.game.selectedPlacedTower === tower && this.game.ui) {
                        this.game.ui.updateSelectionPanel(tower);
                    }
                }

                tower.equippedSkin = tData.skin;
                tower.targetingStrategy = tData.targetingStrategy;
                tower.fireCooldown = tData.fireCooldown;
                tower.recoilOffset = tData.recoilOffset;
                tower.angle = tData.angle;
                tower.ownerId = tData.ownerId;
                if (!tower.timeAccumulator) tower.timeAccumulator = 0;
            }
        });

        for (const key of this.game.grid.towers.keys()) {
            if (!activeKeys.has(key)) {
                this.game.grid.towers.delete(key);
            }
        }

        const getEnemyClass = (name) => {
            switch (name) {
                case 'Zombie': return Runner;
                case 'Quick Zombie': return Quick;
                case 'Slow Zombie': return Slow;
                case 'Hidden': return Hidden;
                case 'Lead': return Lead;
                case 'Shadow': return Shadow;
                case 'Toxic Giant': return Goliath;
                case 'Templar': return Templar;
                case 'Brute': return Brute;
                case 'Grave Digger': return GraveDigger;
                case 'Hazard Giant': return HazardGiant; // Added Intermediate Boss mapping
                case 'Molten Titan': return MoltenTitan;
                case 'Fallen Guardian': return FallenGuardian;
                case 'Fallen King': return FallenKing;
                case 'Frost Spirit': return FrostSpirit;
                case 'Void Reaver': return VoidReaver;
                default: return Runner;
            }
        };

        const updatedEnemies = [];
        data.enemies.forEach(eData => {
            let enemy = this.game.enemies.find(e => e.id === eData.id);
            if (!enemy) {
                const EnemyClass = getEnemyClass(eData.name);
                enemy = new EnemyClass(eData.x, eData.y);
                enemy.id = eData.id;
                enemy.x = eData.x;
                enemy.y = eData.y;
            }

            enemy.targetX = eData.x;
            enemy.targetY = eData.y;
            enemy.health = eData.health;
            enemy.maxHealth = eData.maxHealth;
            enemy.shield = eData.shield;
            enemy.maxShield = eData.maxShield;
            enemy.speed = eData.speed;
            enemy.isCamo = eData.isCamo;
            enemy.isLead = eData.isLead;
            enemy.isFlying = eData.isFlying;
            enemy.enraged = eData.enraged;
            enemy.slowDuration = eData.slowDuration;
            enemy.burnDuration = eData.burnDuration;

            if (eData.baseDamage !== undefined) enemy.baseDamage = eData.baseDamage;
            if (eData.targetNodeIndex !== undefined) enemy.targetNodeIndex = eData.targetNodeIndex;

            updatedEnemies.push(enemy);
        });
        this.game.enemies = updatedEnemies;

        this.game.bullets = data.bullets.map(bData => ({
            x: bData.x,
            y: bData.y,
            color: bData.color,
            radius: bData.radius,
            isRocket: bData.isRocket || bData.color === '#e67e22' || bData.color === '#e74c3c' || bData.radius >= 5,
            draw: function(ctx) {
                ctx.save();
                if (this.isRocket) {
                    // Draw vibrant blocky missile with orange body and yellow warhead
                    ctx.fillStyle = '#e67e22';
                    ctx.strokeStyle = '#222';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.rect(this.x - 6, this.y - 3, 12, 6);
                    ctx.fill();
                    ctx.stroke();

                    // Yellow nose cone tip
                    ctx.fillStyle = '#f1c40f';
                    ctx.beginPath();
                    ctx.rect(this.x + 6, this.y - 3, 3, 6);
                    ctx.fill();
                    ctx.stroke();

                    // Red exhaust flame
                    ctx.fillStyle = '#e74c3c';
                    ctx.fillRect(this.x - 9, this.y - 2, 3, 4);
                } else {
                    ctx.fillStyle = (this.color && this.color !== '#34495e') ? this.color : '#f1c40f';
                    ctx.strokeStyle = '#222';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.rect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.restore();
            }
        }));

        if (data.events && data.events.length > 0) {
            data.events.forEach(evt => {
                if (evt.type === 'sound') {
                    if (soundManager[evt.name]) {
                        soundManager[evt.name].apply(soundManager, evt.args || []);
                    }
                } else {
                    const em = this.game.effectManager;
                    if (em) {
                        const methodMap = {
                            placementSparks: 'spawnPlacementSparks',
                            impact: 'spawnImpact',
                            musicNote: 'spawnMusicNote',
                            muzzleFlash: 'spawnMuzzleFlash',
                            explosion: 'spawnExplosion',
                            swingArc: 'spawnSwingArc',
                            text: 'spawnText'
                        };
                        const realMethod = methodMap[evt.type];
                        if (realMethod && em[realMethod]) {
                            em[realMethod].apply(em, evt.args || []);
                        }
                    }
                }
            });
        }

        if (this.game.ui) {
            this.game.ui.updateSpeedButton(this.game.speedMultiplier);
            this.game.ui.updateWaveButton(this.game.waveInProgress); // Keeps START/DEFENDING button in sync
            this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
        }
    },

    broadcastToAll: function(data) {
        this.send(data);
    },

    broadcastGameOver: function(wave) {
        const isVictory = this.game ? this.game.state === 'victory' : false;
        this.broadcastToAll({
            type: 'GAME_OVER',
            isVictory: isVictory,
            wave: wave
        });
    },

    broadcastState: function() {
        this.interceptEffects();
        this.interceptSounds();

        const now = Date.now();
        if (now - this.lastUpdate < 45) return;
        this.lastUpdate = now;

        if (!this.game || this.game.state === 'lobby') return;

        const equippedSkin = (this.game.equippedSkins && this.game.selectedShopTower)
            ? (this.game.equippedSkins[this.game.selectedShopTower] || 'default')
            : 'default';

        window.playerCursors[window.myPlayerId || 'p1'] = {
            mouseX: this.game.mousePos ? this.game.mousePos.x : 0,
            mouseY: this.game.mousePos ? this.game.mousePos.y : 0,
            selectedShopTower: this.game.selectedShopTower || null,
            equippedSkin: equippedSkin
        };

        const totalPlayers = Object.values(window.lobbyPlayers).filter(p => p).length;

        const statePayload = {
            type: 'GAME_STATE',
            lives: this.game.lives,
            gold: this.game.gold,
            wave: this.game.wave,
            maxWaves: this.game.maxWaves, // Synchronize max waves
            gameState: this.game.state,   // Synchronize match state
            waveInProgress: this.game.waveInProgress,
            speedMultiplier: this.game.speedMultiplier,
            skipVotesCount: this.game.skipVotes ? this.game.skipVotes.size : 0,
            skipVotesRequired: Math.ceil(totalPlayers / 2),
            playerCursors: window.playerCursors,
            playerWallets: this.game.playerWallets || {},

            towers: Array.from(this.game.grid.towers.entries()).map(([key, t]) => ({
                id: t.id || key,
                key: key,
                x: Math.round(t.x),
                y: Math.round(t.y),
                col: t.gridX,
                row: t.gridY,
                type: t.type,
                level: t.level,
                skin: t.equippedSkin,
                targetingStrategy: t.targetingStrategy,
                fireCooldown: t.fireCooldown,
                recoilOffset: t.recoilOffset,
                angle: t.angle,
                ownerId: t.ownerId
            })),

            enemies: this.game.enemies.map(e => ({
                id: e.id,
                name: e.name,
                x: e.x,
                y: e.y,
                health: e.health,
                maxHealth: e.maxHealth,
                shield: e.shield,
                maxShield: e.maxShield,
                speed: e.speed,
                isCamo: e.isCamo,
                isLead: e.isLead,
                isFlying: e.isFlying,
                enraged: e.enraged,
                slowDuration: e.slowDuration,
                burnDuration: e.burnDuration,
                baseDamage: e.baseDamage,
                targetNodeIndex: e.targetNodeIndex
            })),

            bullets: this.game.bullets.map(b => ({
                x: b.x,
                y: b.y,
                color: b.color,
                radius: b.radius,
                isRocket: !!(b.splashRadius || b.damageType === 'explosive')
            })),

            events: [...this.pendingEvents]
        };

        this.pendingEvents = [];
        this.send(statePayload);
    },

    sendClientData: function() {
        if (this.mode === 'OFFLINE') return;
        const now = performance.now();
        // Send responsive mouse updates (~35Hz / every 28ms)
        if (now - this.lastClientUpdate < 28) return;
        this.lastClientUpdate = now;

        if (this.game && this.game.mousePos) {
            this.send({
                type: 'P_DATA',
                mouseX: Math.round(this.game.mousePos.x),
                mouseY: Math.round(this.game.mousePos.y),
                selectedShopTower: this.game.selectedShopTower || null,
                equippedSkin: (this.game.equippedSkins && this.game.selectedShopTower)
                    ? (this.game.equippedSkins[this.game.selectedShopTower] || 'default')
                    : 'default'
            });
        }
    },

    interceptEffects: function() {
        if (!this.game || !this.game.effectManager || this._effectsIntercepted) return;
        this._effectsIntercepted = true;

        const em = this.game.effectManager;
        const self = this;

        const wrap = (methodName, type) => {
            const original = em[methodName];
            if (!original) return;
            em[methodName] = function(...args) {
                original.apply(this, args);
                if (self.mode === 'HOST') {
                    self.pendingEvents.push({ type, args });
                }
            };
        };

        wrap('spawnPlacementSparks', 'placementSparks');
        wrap('spawnImpact', 'impact');
        wrap('spawnMusicNote', 'musicNote');
        wrap('spawnMuzzleFlash', 'muzzleFlash');
        wrap('spawnExplosion', 'explosion');
        wrap('spawnSwingArc', 'swingArc');
        wrap('spawnText', 'text');
    },

    interceptSounds: function() {
        if (this._soundsIntercepted) return;
        this._soundsIntercepted = true;

        const self = this;
        const wrap = (methodName) => {
            const original = soundManager[methodName];
            if (!original) return;
            soundManager[methodName] = function(...args) {
                original.apply(this, args);
                if (self.mode === 'HOST') {
                    self.pendingEvents.push({ type: 'sound', name: methodName, args });
                }
            };
        };

        wrap('playPlace');
        wrap('playUpgrade');
        wrap('playShoot');
        wrap('playCrateDrop');
        wrap('playCrateReveal');
        wrap('playTick');
        wrap('playVictory');
        wrap('playDefeat');
    }
};

window.Network = Network;