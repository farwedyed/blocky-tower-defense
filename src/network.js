/* --- NETWORKING MODULE WITH CO-OP TOWER DEFENSE REPLICATION & HOST MIGRATION --- */

import { Enemy, Runner, Quick, Slow, Hidden, Lead, Shadow, Goliath, Templar, GraveDigger, MoltenTitan, FallenGuardian, FallenKing, VoidReaver } from './enemy.js';
import { Scout, Minigunner, Commander, DJUnit, Pyromancer, Farm, Gladiator, Soldier, Sniper, Medic, Rocketeer } from './tower.js';
import { soundManager } from './sound.js';

if (!window.lobbyPlayers) {
    window.lobbyPlayers = { p1: "Host Survivor", p2: "", p3: "", p4: "", p5: "", p6: "", p7: "", p8: "" };
}
if (!window.myPlayerId) {
    window.myPlayerId = "p1"; // Default for host/offline
}

// Track individual cursors and placements
if (!window.playerCursors) {
    window.playerCursors = {}; // key: playerId, value: { mouseX, mouseY, selectedShopTower, equippedSkin }
}

export const Network = {
    peer: null,
    conns: [], // Host: Stores up to 7 guest connections (P2 through P8)
    conn: null, // Client: Single connection back to the host
    mode: 'OFFLINE', 
    lastUpdate: 0,
    lastClientUpdate: 0, // Throttle client-to-host payloads
    lastGameStateTime: 0, // Watchdog tracker for host status
    peerIds: {}, // Master mapping of active player slots ('p1'...'p8') to PeerJS IDs
    isMigrating: false, // Network guard to prevent duplicate migration triggers
    hostPlayerId: 'p1', // Tracks current active host slot ID
    game: null, // Ref assigned in main.js to access authoritative game loops
    pendingEvents: [], // Queue for replicated visual and audio events
    _effectsIntercepted: false,
    _soundsIntercepted: false,
    
    init: function(gameInstance, onOpen) {
        this.game = gameInstance;
        this.pendingEvents = [];
        this._effectsIntercepted = false;
        this._soundsIntercepted = false;

        // Try to intercept systems early
        this.interceptEffects();
        this.interceptSounds();

        // Provider 1: Metered.ca Credentials
        const METERED_USER = "ec41d9c5a5a8f7a1a1b19e9e";
        const METERED_PASS = "rzCBD4AfbDn7JjG8";

        // Provider 2: ExpressTURN Credentials
        const EXPRESSTURN_USER = "000000002095335910";
        const EXPRESSTURN_PASS = "GK3y4yS5fDUutl+1ITp1BTxZgR4=";

        // Reset tracking variables
        this.peerIds = {};
        this.isMigrating = false;
        this.hostPlayerId = 'p1';

        // Generate a clean, native 6-character ID so connections can be made using simple room codes
        const cleanShortId = Math.random().toString(36).substring(2, 8).toLowerCase();

        this.peer = new Peer(cleanShortId, { 
            host: 'farwedd-zombie-dombie-server.hf.space',
            port: 443,
            path: '/peerjs/myapp',
            secure: true,
            debug: 1,
            config: {
                iceServers: [
                    // --- STUN SERVERS ---
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                    { urls: 'stun:stun.relay.metered.ca:80' },
                    { urls: 'stun:free.expressturn.com:3478' },
                    
                    // --- METERED.CA TURN SERVERS ---
                    { 
                        urls: 'turn:standard.relay.metered.ca:80', 
                        username: METERED_USER, 
                        credential: METERED_PASS 
                    },
                    { 
                        urls: 'turn:standard.relay.metered.ca:80?transport=tcp', 
                        username: METERED_USER, 
                        credential: METERED_PASS 
                    },
                    { 
                        urls: 'turn:standard.relay.metered.ca:443', 
                        username: METERED_USER, 
                        credential: METERED_PASS 
                    },
                    { 
                        urls: 'turns:standard.relay.metered.ca:443?transport=tcp', 
                        username: METERED_USER, 
                        credential: METERED_PASS 
                    },

                    // --- METERED.CA OPEN RELAY PROJECT ---
                    { 
                        urls: 'turn:openrelay.metered.ca:80', 
                        username: 'openrelayproject', 
                        credential: 'openrelayproject' 
                    },
                    { 
                        urls: 'turn:openrelay.metered.ca:443', 
                        username: 'openrelayproject', 
                        credential: 'openrelayproject' 
                    },
                    { 
                        urls: 'turns:openrelay.metered.ca:443?transport=tcp', 
                        username: 'openrelayproject', 
                        credential: 'openrelayproject' 
                    },

                    // --- EXPRESSTURN FREE TIER ---
                    { 
                        urls: 'turn:free.expressturn.com:3478', 
                        username: EXPRESSTURN_USER, 
                        credential: EXPRESSTURN_PASS 
                    },
                    { 
                        urls: 'turn:free.expressturn.com:3478?transport=tcp', 
                        username: EXPRESSTURN_USER, 
                        credential: EXPRESSTURN_PASS 
                    }
                ]
            }
        });

        // Global Signaling Error Boundary
        this.peer.on('error', (err) => {
            console.warn("PeerJS global error caught gracefully:", err);
        });

        this.peer.on('open', (id) => { 
            this.peerIds[window.myPlayerId] = id;
            onOpen(id); 

            // Sync host room state to CrazyGames safely
            if (window.CrazyGames && window.CrazyGames.SDK && window.crazyGamesInitialized && window.CrazyGames.SDK.game && typeof window.CrazyGames.SDK.game.updateRoom === 'function') {
                console.log("Registering active room ID on CrazyGames:", id);
                try {
                    window.CrazyGames.SDK.game.updateRoom({ 
                        roomId: id, 
                        isJoinable: true, 
                        inviteParams: { roomId: id } 
                    });
                } catch (e) {
                    console.warn("Failed to update room state on CrazyGames:", e);
                }
            }
        });

        this.peer.on('connection', (c) => {
            if (this.conns.length >= 7) {
                console.warn("Lobby connection refused: lobby is full (max 8 players).");
                setTimeout(() => {
                    try { c.close(); } catch(e) {}
                }, 500);
                return;
            }
            this.conns.push(c);
            this.setupHostConnection(c);
        });
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
    },

    join: function(hostId, playerName, onConnected) {
        this.mode = 'CLIENT';
        this.conn = this.peer.connect(hostId, {
            reliable: true,
            serialization: 'json'
        });

        this.conn.on('error', (err) => {
            console.warn("Client data channel error caught gracefully:", err);
        });

        this.conn.on('open', () => {
            this.lastGameStateTime = Date.now();
            if(onConnected) onConnected();
            this.setupClient();

            // Sync client joined state to CrazyGames safely
            if (window.CrazyGames && window.CrazyGames.SDK && window.crazyGamesInitialized && window.CrazyGames.SDK.game && typeof window.CrazyGames.SDK.game.updateRoom === 'function') {
                try {
                    window.CrazyGames.SDK.game.updateRoom({ 
                        roomId: hostId, 
                        isJoinable: true, 
                        inviteParams: { roomId: hostId } 
                    });
                } catch (e) {
                    console.warn("Failed to update client room state on CrazyGames:", e);
                }
            }
            
            try {
                this.conn.send({ type: 'JOIN_LOBBY', name: playerName, level: this.game.playerLevel });
            } catch (e) {
                console.warn("Failed to send JOIN_LOBBY packet:", e);
            }
        });
    },

    /* --- HOST CONNECTION TRANSACTION CHANNELS --- */
    setupHostConnection: function(c) {
        let assignedId = "";
        
        if (!window.lobbyPlayers.p2 || window.lobbyPlayers.p2 === "Reserved") { assignedId = "p2"; }
        else if (!window.lobbyPlayers.p3 || window.lobbyPlayers.p3 === "Reserved") { assignedId = "p3"; }
        else if (!window.lobbyPlayers.p4 || window.lobbyPlayers.p4 === "Reserved") { assignedId = "p4"; }
        else if (!window.lobbyPlayers.p5 || window.lobbyPlayers.p5 === "Reserved") { assignedId = "p5"; }
        else if (!window.lobbyPlayers.p6 || window.lobbyPlayers.p6 === "Reserved") { assignedId = "p6"; }
        else if (!window.lobbyPlayers.p7 || window.lobbyPlayers.p7 === "Reserved") { assignedId = "p7"; }
        else if (!window.lobbyPlayers.p8 || window.lobbyPlayers.p8 === "Reserved") { assignedId = "p8"; }
        else {
            console.warn("Incoming connection rejected: All lobby player slots from P1 to P8 are full.");
            try { c.close(); } catch(e) {}
            return;
        }
        
        console.log(`Lobby slot matched! Assigning peer connection to slot: ${assignedId}`);
        c.playerId = assignedId;
        window.lobbyPlayers[assignedId] = "Reserved";

        c.on('error', (err) => {
            console.warn(`Host Connection Error for ${c.playerId} caught gracefully:`, err);
        });

        c.on('data', (data) => {
            if (data.type === 'JOIN_LOBBY') {
                const clientLvl = data.level || 1;
                window.lobbyPlayers[c.playerId] = (data.name || ("Player " + c.playerId.substring(1))) + " [Lv. " + clientLvl + "]";
                this.peerIds[c.playerId] = c.peer;

                // Initialize starting cash pool and cursors
                if (this.game) {
                    if (!this.game.playerWallets) this.game.playerWallets = {};
                    this.game.playerWallets[c.playerId] = this.game.isHardcore ? 250 : 100;

                    // Force Host UI redraw to show newly joined client
                    if (this.game.ui) {
                        this.game.ui.updateCoopPlayerList();
                    }
                }

                try {
                    c.send({
                        type: 'LOBBY_WELCOME',
                        assignedId: c.playerId,
                        lobbyPlayers: window.lobbyPlayers,
                        selectedMap: this.game.selectedMap,
                        isHardcore: this.game.isHardcore,
                        peerIds: this.peerIds,
                        hostPlayerId: this.hostPlayerId
                    });
                } catch(e) {
                    console.warn("Failed to send LOBBY_WELCOME:", e);
                }

                this.broadcastToAll({
                    type: 'LOBBY_UPDATE',
                    lobbyPlayers: window.lobbyPlayers,
                    peerIds: this.peerIds,
                    hostPlayerId: this.hostPlayerId
                });
            }
            else if (data.type === 'MIGRATE_REJOIN') {
                c.playerId = data.playerId;
                this.peerIds[c.playerId] = c.peer;
                window.lobbyPlayers[c.playerId] = data.name || ("Player " + c.playerId.substring(1));

                this.broadcastToAll({
                    type: 'LOBBY_UPDATE',
                    lobbyPlayers: window.lobbyPlayers,
                    peerIds: this.peerIds,
                    hostPlayerId: this.hostPlayerId
                });
            }
            else if (data.type === 'P_DATA') {
                window.playerCursors[c.playerId] = {
                    mouseX: data.mouseX,
                    mouseY: data.mouseY,
                    selectedShopTower: data.selectedShopTower,
                    equippedSkin: data.equippedSkin
                };
            }
            else if (data.type === 'PLACE_TOWER') {
                if (this.game) {
                    const cost = this.game.getTowerCost(data.towerType);
                    const wallet = this.game.playerWallets ? this.game.playerWallets[c.playerId] : this.game.gold;
                    
                    if (wallet >= cost && this.game.grid.isCellValidForPlacement(data.col, data.row)) {
                        this.game.selectedShopTower = data.towerType;
                        this.game.placeShopAgent(data.col, data.row, c.playerId);
                    }
                }
            }
            else if (data.type === 'UPGRADE_TOWER') {
                if (this.game) {
                    const tower = this.game.grid.towers.get(`${data.col},${data.row}`);
                    if (tower) {
                        const cost = tower.getUpgradeCost();
                        const wallet = this.game.playerWallets ? this.game.playerWallets[c.playerId] : this.game.gold;
                        if (wallet >= cost) {
                            tower.upgrade(this.game.effectManager);
                            if (this.game.playerWallets) {
                                this.game.playerWallets[c.playerId] -= cost;
                            } else {
                                this.game.gold -= cost;
                            }
                        }
                    }
                }
            }
            else if (data.type === 'SELL_TOWER') {
                if (this.game) {
                    const tower = this.game.grid.towers.get(`${data.col},${data.row}`);
                    if (tower) {
                        const refund = tower.getSellValue();
                        this.game.grid.removeTower(data.col, data.row);
                        if (this.game.playerWallets) {
                            this.game.playerWallets[c.playerId] += refund;
                        } else {
                            this.game.gold += refund;
                        }
                        this.game.effectManager.spawnPlacementSparks(tower.x, tower.y, 40);
                    }
                }
            }
            else if (data.type === 'VOTE_SKIP') {
                if (this.game) {
                    if (!this.game.skipVotes) this.game.skipVotes = new Set();
                    this.game.skipVotes.add(c.playerId);
                    
                    const required = Math.ceil((this.conns.length + 1) / 2);
                    if (this.game.skipVotes.size >= required) {
                        this.game.skipVotes.clear();
                        this.game.skipWave();
                    }
                }
            }
        });
        
        c.on('close', () => {
            console.log(c.playerId + " Disconnected from Host");
            window.lobbyPlayers[c.playerId] = "";
            delete this.peerIds[c.playerId];
            delete window.playerCursors[c.playerId];
            this.conns = this.conns.filter(conn => conn !== c);

            this.broadcastToAll({
                type: 'LOBBY_UPDATE',
                lobbyPlayers: window.lobbyPlayers,
                peerIds: this.peerIds,
                hostPlayerId: this.hostPlayerId
            });

            // Force Host UI redraw on client leave
            if (this.game && this.game.ui) {
                this.game.ui.updateCoopPlayerList();
            }
        });
    },

    broadcastToAll: function(data) {
        this.conns.forEach(c => {
            if (c && c.open) {
                try {
                    c.send(data);
                } catch (e) {
                    console.warn(`Failed to broadcast packet to ${c.playerId || "unknown guest"}:`, e);
                }
            }
        });
    },

    broadcastState: function() {
        // Intercept loops dynamically if they aren't configured yet
        this.interceptEffects();
        this.interceptSounds();

        const now = Date.now();
        if(now - this.lastUpdate < 45) return; 
        this.lastUpdate = now;

        if (!this.game || this.game.state === 'lobby') return;

        // Authoritative Co-op State Payload
        const statePayload = {
            type: 'GAME_STATE',
            lives: this.game.lives,
            gold: this.game.gold,
            wave: this.game.wave,
            waveInProgress: this.game.waveInProgress,
            playerCursors: window.playerCursors,
            playerWallets: this.game.playerWallets || {},
            
            towers: Array.from(this.game.grid.towers.entries()).map(([key, t]) => ({
                key: key,
                col: t.gridX,
                row: t.gridY,
                type: t.type,
                level: t.level,
                skin: t.equippedSkin,
                targetingStrategy: t.targetingStrategy,
                fireCooldown: t.fireCooldown,
                recoilOffset: t.recoilOffset,
                angle: t.angle
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
                burnDuration: e.burnDuration
            })),

            bullets: this.game.bullets.map(b => ({
                x: b.x,
                y: b.y,
                color: b.color,
                radius: b.radius
            })),

            peerIds: this.peerIds, 
            hostPlayerId: this.hostPlayerId,
            events: [...this.pendingEvents] // Replicate all spawned sounds & visuals
        };

        // Reset tracking stack to avoid double triggers
        this.pendingEvents = [];

        this.conns.forEach(c => {
            if (c && c.open) {
                try {
                    const dc = c._dc || c.dataChannel;
                    if (dc && dc.bufferedAmount > 65536) {
                        return; 
                    }
                    c.send(statePayload);
                } catch(e) {
                    console.warn(`Failed to send state payload to ${c.playerId || "unknown guest"}:`, e);
                }
            }
        });
    },

    /* --- CLIENT INCOMING PACKET RECEPTION --- */
    setupClient: function() {
        this.conn.on('data', (data) => {
            if (data.type === 'LOBBY_WELCOME') {
                window.myPlayerId = data.assignedId;
                window.lobbyPlayers = data.lobbyPlayers;
                this.game.selectedMap = data.selectedMap;
                this.game.isHardcore = data.isHardcore;
                this.peerIds = data.peerIds || {};
                if (data.hostPlayerId) this.hostPlayerId = data.hostPlayerId;
                this.lastGameStateTime = Date.now(); 

                // Force Client UI redraw to show host and other guest slots
                if (this.game && this.game.ui) {
                    this.game.ui.updateCoopPlayerList();
                }
            }
            else if (data.type === 'LOBBY_UPDATE') {
                window.lobbyPlayers = data.lobbyPlayers;
                this.peerIds = data.peerIds || {};
                if (data.hostPlayerId) this.hostPlayerId = data.hostPlayerId;
                this.lastGameStateTime = Date.now(); 

                // Force Client UI redraw on lobby squad adjustments
                if (this.game && this.game.ui) {
                    this.game.ui.updateCoopPlayerList();
                }
            }
            else if (data.type === 'START') {
                // Client transitions to gameplay state automatically
                this.game.selectedMap = data.selectedMap;
                this.game.isHardcore = data.isHardcore;
                this.game.playerWallets = data.playerWallets || {};

                this.game.state = 'playing';
                this.game.showMapDirections = true;
                this.game.grid.selectMap(data.selectedMap);

                // Replicate map obstacles perfectly from host (solves tree/rock placement conflicts)
                if (data.obstacles) {
                    this.game.grid.obstacles = data.obstacles;
                }

                this.game.lives = data.isHardcore ? 20 : 100;
                // Safe lookup: assigns gold accurately from playerWallets map
                this.game.gold = this.game.playerWallets[window.myPlayerId] || (data.isHardcore ? 250 : 100);
                this.game.wave = 0;
                this.game.waveInProgress = false;
                this.game.speedMultiplier = 1;
                this.game.enemies = [];
                this.game.bullets = [];
                this.game.spawnQueue = [];
                this.game.matchTime = 0;
                this.game.skipVotes.clear();

                this.game.grid.clear();
                this.game.effectManager.clear();
                this.game.setSelectedPlacedTower(null);
                this.game.selectedShopTower = this.game.equippedAgents[0];

                let mapName = 'Grassland';
                if (data.selectedMap === 'desert') mapName = 'Desert Outpost';
                else if (data.selectedMap === 'tundra') mapName = 'Frost Tundra';
                else if (data.selectedMap === 'cyber_city') mapName = 'Cyber City';
                else if (data.selectedMap === 'fallen_outpost') mapName = 'Fallen Outpost';

                this.game.ui.showGameLayout(mapName);
                this.game.ui.renderPlacementShop();
                this.game.ui.updateSpeedButton(1);
                this.game.ui.updateWaveButton(false);
                this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
            }
            else if (data.type === 'GAME_STATE') {
                this.lastGameStateTime = Date.now(); 
                this.peerIds = data.peerIds || {}; 
                if (data.hostPlayerId) this.hostPlayerId = data.hostPlayerId;

                this.game.lives = data.lives;
                this.game.wave = data.wave;
                this.game.waveInProgress = data.waveInProgress;
                window.playerCursors = data.playerCursors || {};
                
                if (data.playerWallets && data.playerWallets[window.myPlayerId] !== undefined) {
                    this.game.gold = data.playerWallets[window.myPlayerId];
                } else {
                    this.game.gold = data.gold;
                }

                // 1. Synchronize Towers (Update existing instances to reduce visual lag)
                const activeKeys = new Set();
                data.towers.forEach(tData => {
                    const key = tData.key;
                    activeKeys.add(key);
                    
                    let tower = this.game.grid.towers.get(key);
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
                        }
                        if (tower) {
                            this.game.grid.towers.set(key, tower);
                        }
                    }
                    if (tower) {
                        tower.level = tData.level;
                        tower.equippedSkin = tData.skin;
                        tower.targetingStrategy = tData.targetingStrategy;
                        tower.fireCooldown = tData.fireCooldown;
                        tower.recoilOffset = tData.recoilOffset;
                        tower.angle = tData.angle;
                        if (!tower.timeAccumulator) tower.timeAccumulator = 0;
                    }
                });

                // Clear missing client towers
                for (const key of this.game.grid.towers.keys()) {
                    if (!activeKeys.has(key)) {
                        this.game.grid.towers.delete(key);
                    }
                }

                // 2. Synchronize Enemies (Re-use instances & map class prototypes for custom visuals)
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
                        case 'Grave Digger': return GraveDigger;
                        case 'Molten Titan': return MoltenTitan;
                        case 'Fallen Guardian': return FallenGuardian;
                        case 'Fallen King': return FallenKing;
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

                        // Snap coordinate position immediately on first creation
                        enemy.x = eData.x;
                        enemy.y = eData.y;
                    }

                    // Save coordinates as target vectors for smooth local interpolation
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

                    updatedEnemies.push(enemy);
                });
                this.game.enemies = updatedEnemies;

                // 3. Bullets / Visual Tracers
                this.game.bullets = data.bullets.map(bData => ({
                    x: bData.x,
                    y: bData.y,
                    color: bData.color,
                    radius: bData.radius,
                    draw: function(ctx) {
                        ctx.save();
                        ctx.fillStyle = this.color;
                        ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
                        ctx.restore();
                    }
                }));

                // 4. Trigger visual particles and sound events on client machines
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

                // --- CRITICAL HUD RE-RENDER ON THE CLIENT-SIDE ---
                if (this.game.ui) {
                    this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
                }
            }
        });

        this.conn.on('close', () => {
            this.attemptHostMigration();
        });
    },

    checkHostHeartbeat: function() {
        if (this.mode !== 'CLIENT' || this.state === 'lobby') return;
        
        const elapsed = Date.now() - this.lastGameStateTime;
        if (elapsed > 4000) { 
            console.warn("Watchdog: Host heartbeat lost. Attempting host migration...");
            this.attemptHostMigration();
        }
    },

    attemptHostMigration: function() {
        if (this.isMigrating) return;
        this.isMigrating = true;

        console.log("Host disconnected! Evaluating migration candidates...");
        const activePlayerIds = Object.keys(this.peerIds || {}).filter(pId => pId !== 'p1');
        
        activePlayerIds.sort((a, b) => {
            return parseInt(a.substring(1)) - parseInt(b.substring(1));
        });

        if (activePlayerIds.length === 0) {
            console.log("No surviving clients remaining to migrate hosting to.");
            this.handleDisconnectFallback("⚠️ Connection Lost: Host dropped and lobby is empty.");
            return;
        }

        const nextHostId = activePlayerIds[0];
        console.log("Next elected squad leader is:", nextHostId);

        if (window.myPlayerId === nextHostId) {
            this.becomeNewHost();
        } else {
            const newHostPeerId = this.peerIds[nextHostId];
            if (newHostPeerId) {
                this.connectToNewHost(newHostPeerId, nextHostId);
            } else {
                this.isMigrating = false;
                this.handleDisconnectFallback("⚠️ Host Migration Failed: Selected leader is unreachable.");
            }
        }
    },

    becomeNewHost: function() {
        console.log("I am taking over as the new lobby host!");
        this.mode = 'HOST';
        this.isMigrating = false;
        this.hostPlayerId = window.myPlayerId;
        this.pendingEvents = [];

        if (this.conn) {
            try { this.conn.close(); } catch(e) {}
            this.conn = null;
        }

        window.lobbyPlayers['p1'] = "";
        delete this.peerIds['p1'];
        this.conns = [];

        if (this.game) {
            this.game.effectManager.spawnText(400, 200, "⚠️ YOU ARE THE SQUAD LEADER!", '#ffd700');
        }

        this.interceptEffects();
        this.interceptSounds();
    },

    connectToNewHost: function(peerId, hostPlayerId) {
        this.mode = 'CLIENT';
        this.hostPlayerId = hostPlayerId; 

        if (this.conn) {
            try { this.conn.close(); } catch(e) {}
            this.conn = null;
        }

        this.conn = this.peer.connect(peerId, {
            reliable: true,
            serialization: 'json'
        });

        this.conn.on('error', (err) => {
            console.warn("Connection to migrated host failed:", err);
            this.isMigrating = false;
            this.handleDisconnectFallback("⚠️ Host Migration Failed: Selected leader is unreachable.");
        });

        this.conn.on('open', () => {
            this.lastGameStateTime = Date.now();
            this.isMigrating = false;
            console.log("Connected to migrated host successfully!");
            
            try {
                this.conn.send({
                    type: 'MIGRATE_REJOIN',
                    playerId: window.myPlayerId,
                    name: "Survivor_" + window.myPlayerId
                });
            } catch(e) {
                console.warn("Failed to transmit re-join packet:", e);
            }
        });

        this.setupClient();
    },

    handleDisconnectFallback: function(customMsg) {
        this.isMigrating = false;
        this.mode = 'OFFLINE';
        alert(customMsg || "Connection Lost.");
        location.reload();
    },

    sendClientData: function() {
        const now = Date.now();
        if (now - this.lastClientUpdate < 45) return;
        this.lastClientUpdate = now;

        if(this.conn && this.conn.open && this.game) {
            try {
                this.conn.send({
                    type: 'P_DATA',
                    mouseX: this.game.mousePos.x,
                    mouseY: this.game.mousePos.y,
                    selectedShopTower: this.game.selectedShopTower,
                    equippedSkin: this.game.equippedSkins[this.game.selectedShopTower] || 'default'
                });
            } catch (e) {
                console.warn("Failed to send client cursor state:", e);
            }
        }
    }
};