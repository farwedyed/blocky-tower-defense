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

    // Socket dropped mid co-op match: back to the menu and offer to reconnect.
    // (This used to sit inside the conn shim below, so the call in ws.onclose threw
    // "handleUnexpectedMatchDrop is not a function".)
    handleUnexpectedMatchDrop: function() {
        this.clearConnectionTimers();
        this.ws = null;
        this.mode = 'OFFLINE';
        this.roomId = null;
        window.lobbyPlayers = { p1: "Host Survivor", p2: "", p3: "", p4: "", p5: "", p6: "", p7: "", p8: "" };
        window.myPlayerId = "p1";
        window.playerCursors = {};
        const g = this.game;
        try { CrazyGamesManager.gameplayStop(); } catch (e) {}
        if (!g) { setTimeout(() => this.checkForRejoin(), 800); return; }
        g.state = 'lobby';
        g.waveInProgress = false;
        if (g.ui) {
            const summaryCard = document.getElementById('match-summary-card');
            if (summaryCard) summaryCard.remove();
            g.ui.hideOverlay();
            g.ui.showLobbyLayout();
            if (g.ui.lobby) g.ui.lobby.showSplashState();
        }
        setTimeout(() => this.checkForRejoin(), 800);
    },

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
            const sock = new WebSocket(this.serverUrl);
            this.ws = sock;

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
                if (this.ws !== sock) return; // an old socket we already replaced / closed on purpose
                if (this.isJoining) {
                    this.handleJoinError('CONNECTION_FAILED');
                    return;
                }
                // Connection dropped in the middle of a co-op match: go back to the menu and
                // offer to reconnect to the same match.
                if (this.mode !== 'OFFLINE' && this.game && this.game.state !== 'lobby' && this.getRejoinInfo()) {
                    this.handleUnexpectedMatchDrop();
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
            this.send({ type: 'HOST_ROOM', name: playerName, isPublic: publicFlag, token: this.getPlayerToken() });
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
            this.send({ type: 'JOIN_ROOM', roomId: this.attemptedRoomCode, name: playerName, token: this.getPlayerToken() });
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

    disconnect: function(opts) {
        const leavingRoomId = this.roomId;
        if (!(opts && opts.keepRejoin)) this.clearRejoinInfo(); // left on purpose: no reconnect prompt later
        this.isRejoining = false;
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

    // ─── MATCH RECONNECT ───
    // A per-device secret lets the server recognise this player when they come back after a
    // disconnect. The match they were in is remembered until it is left on purpose.
    REJOIN_KEY: 'tds_mp_rejoin',
    REJOIN_MAX_AGE_MS: 3 * 60 * 60 * 1000,

    getPlayerToken: function() {
        try {
            let t = localStorage.getItem('tds_mp_token');
            if (!t || !/^[A-Za-z0-9_-]{8,64}$/.test(t)) {
                t = 'tk_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                localStorage.setItem('tds_mp_token', t);
            }
            return t;
        } catch (e) {
            if (!this._memToken) this._memToken = 'tk_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            return this._memToken;
        }
    },

    saveRejoinInfo: function(matchId) {
        if (!matchId || !this.roomId) return;
        try {
            localStorage.setItem(this.REJOIN_KEY, JSON.stringify({ roomId: this.roomId.toUpperCase(), matchId, savedAt: Date.now() }));
        } catch (e) {}
    },

    clearRejoinInfo: function() {
        try { localStorage.removeItem(this.REJOIN_KEY); } catch (e) {}
    },

    getRejoinInfo: function() {
        try {
            const info = JSON.parse(localStorage.getItem(this.REJOIN_KEY) || 'null');
            if (!info || !info.roomId || !info.matchId) return null;
            if (Date.now() - (info.savedAt || 0) > this.REJOIN_MAX_AGE_MS) {
                this.clearRejoinInfo();
                return null;
            }
            return info;
        } catch (e) {
            return null;
        }
    },

    /**
     * Ask the server whether the match this player dropped out of is still being played.
     * Shows the big RECONNECT prompt only if it is (same match, not lobby, not finished).
     */
    checkForRejoin: function() {
        const info = this.getRejoinInfo();
        if (!info || this.mode !== 'OFFLINE' || this.roomId) return;
        this._rejoinCheckPending = info;
        const ask = () => this.send({ type: 'CHECK_REJOIN', roomId: info.roomId, matchId: info.matchId, token: this.getPlayerToken() });
        if (this.ws && this.ws.readyState === WebSocket.OPEN) ask();
        else this.init(this.game, ask);
    },

    rejoinMatch: function(info) {
        if (!info) return;
        this.clearConnectionTimers();
        this.mode = 'CLIENT';
        this.isJoining = true;
        this.isInviteLinkJoin = false;
        this.isRejoining = true;
        this.attemptedRoomCode = info.roomId;
        this.onConnectedCallback = null;

        const nameInput = document.getElementById('input-player-name');
        const name = (CrazyGamesManager.currentUser && CrazyGamesManager.currentUser.username)
            || (nameInput && nameInput.value.trim()) || localStorage.getItem('tds_player_username') || 'Guest';

        this.connectionTimeout = setTimeout(() => {
            if (this.isJoining) this.handleJoinError('MATCH_ENDED');
        }, 10000);

        const go = () => this.send({ type: 'REJOIN_MATCH', roomId: info.roomId, matchId: info.matchId, token: this.getPlayerToken(), name });
        if (this.ws && this.ws.readyState === WebSocket.OPEN) go();
        else this.init(this.game, go);
    },

    /** Host: move a player's cash and tower ownership from one id to another. */
    moveOwnership: function(fromId, toId) {
        if (!this.game || !fromId || !toId || fromId === toId) return;
        const w = this.game.playerWallets || (this.game.playerWallets = {});
        if (w[fromId] !== undefined) {
            w[toId] = w[fromId];
            delete w[fromId];
        }
        for (const t of this.game.grid.towers.values()) {
            if (t.ownerId === fromId) t.ownerId = toId;
        }
    },

    /** Host: apply the server's slot renumbering (players shift up when someone leaves). */
    applySlotRemap: function(remap) {
        if (!this.game || !remap) return;
        const oldW = this.game.playerWallets || {};
        const newW = {};
        for (const [k, v] of Object.entries(oldW)) {
            if (/^p[1-8]$/.test(k)) {
                if (remap[k]) newW[remap[k]] = v; // remaining player, maybe renumbered
                // slots not in the remap belonged to someone who left the lobby
            } else {
                newW[k] = v; // parked seats of disconnected players ("gone_...")
            }
        }
        for (const t of this.game.grid.towers.values()) {
            if (t.ownerId && /^p[1-8]$/.test(t.ownerId) && remap[t.ownerId]) t.ownerId = remap[t.ownerId];
        }
        this.game.playerWallets = newW;
        if (newW.p1 !== undefined) this.game.gold = newW.p1;
    },

    /** Drop cursors of players who are no longer in the room (e.g. after someone leaves). */
    pruneStaleCursors: function() {
        if (!window.playerCursors || !window.lobbyPlayers) return;
        for (const pId of Object.keys(window.playerCursors)) {
            if (!window.lobbyPlayers[pId] || pId === window.myPlayerId) {
                delete window.playerCursors[pId];
            }
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
        } else if (reason === 'MATCH_ENDED') {
            title = "MATCH ENDED ⚠️";
            message = "That match has already ended, so it can't be rejoined. Host or join a new squad to keep playing!";
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

        // ─── MATCH RECONNECT ───
        else if (data.type === 'REJOIN_STATUS') {
            const pending = this._rejoinCheckPending;
            this._rejoinCheckPending = null;
            if (!pending || (data.matchId && data.matchId !== pending.matchId)) return;
            if (data.available && this.mode === 'OFFLINE' && this.game && this.game.state === 'lobby') {
                if (this.game.ui && this.game.ui.lobby && this.game.ui.lobby.coop) {
                    this.game.ui.lobby.coop.showRejoinPrompt(pending, data);
                }
            } else if (!data.available) {
                this.clearRejoinInfo();
            }
        }
        else if (data.type === 'REJOIN_FAILED') {
            this.isRejoining = false;
            this.handleJoinError(data.reason === 'ROOM_FULL' ? 'ROOM_FULL' : 'MATCH_ENDED');
        }
        else if (data.type === 'REJOIN_WELCOME') {
            this.roomId = data.roomId;
            this.mode = 'CLIENT';
            window.myPlayerId = data.assignedId;
            window.lobbyPlayers = data.lobbyPlayers;
            window.playerCursors = {};
            this.game.selectedMap = data.selectedMap || this.game.selectedMap;
            this.game.selectedDifficulty = data.selectedDifficulty || this.game.selectedDifficulty;
            this.game.isHardcore = !!data.isHardcore;
            this.saveRejoinInfo(data.matchId);
            // Still "joining" until the host's snapshot (REJOIN_START) arrives
        }
        else if (data.type === 'REJOIN_START' && this.mode === 'CLIENT') {
            if (data.targetId && data.targetId !== window.myPlayerId) return;
            this.isJoining = false;
            this.isRejoining = false;
            this.clearConnectionTimers();
            this.applyMatchStart(data);
            // Jump straight into the running match
            this.game.wave = data.wave || 0;
            this.game.waveInProgress = !!data.waveInProgress;
            this.game.showMapDirections = false;
            this.game.matchTime = data.matchTime || 0;
            this.saveRejoinInfo(data.matchId);
            try { CrazyGamesManager.gameplayStart(); } catch (e) {}
            this._lastUiWave = undefined;
            this.game.ui.updateWaveButton(this.game.waveInProgress);
            this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
            this.syncRoomPresence();
            if (this.game.effectManager && this.game.effectManager.spawnWaveText) {
                this.game.effectManager.spawnWaveText('RECONNECTED!', '#2ecc71');
            }
        }
        else if (data.type === 'PLAYER_LEFT_MATCH') {
            // Host: park the dropped player's cash & towers until they come back
            if (this.mode === 'HOST') this.moveOwnership(data.oldPlayerId, 'gone_' + data.seatId);
        }
        else if (data.type === 'PLAYER_REJOINED') {
            if (this.mode === 'HOST' && this.game) {
                const parked = 'gone_' + data.seatId;
                const w = this.game.playerWallets || (this.game.playerWallets = {});
                if (w[parked] !== undefined) this.moveOwnership(parked, data.playerId);
                else if (w[data.playerId] === undefined) w[data.playerId] = this.game.isHardcore ? 250 : 400;
                if (this.game.state !== 'lobby') this.sendRejoinSnapshot(data.playerId);
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
            if (data.yourId) window.myPlayerId = data.yourId;
            if (this.mode === 'HOST' && data.slotRemap) this.applySlotRemap(data.slotRemap);
            this.pruneStaleCursors();
            
            this.syncRoomPresence();

            if (this.mode === 'HOST' && this.game) {
                if (!this.game.playerWallets) this.game.playerWallets = {};
                for (const slot of Object.keys(data.lobbyPlayers)) {
                    if (data.lobbyPlayers[slot] && this.game.playerWallets[slot] === undefined) {
                        this.game.playerWallets[slot] = this.game.isHardcore ? 250 : 400;
                    }
                }
                // Immediately synchronize the chosen map and difficulty to all connected squad members
                this.broadcastToAll({
                    type: 'COOP_MAP_SELECTED',
                    selectedMap: this.game.selectedMap
                });
                this.broadcastToAll({
                    type: 'COOP_DIFF_SELECTED',
                    difficulty: this.game.selectedDifficulty
                });
            }
            if (this.game && this.game.ui) this.game.ui.updateCoopPlayerList();
        }

        // Announcement for other clients when a new host takes over
        else if (data.type === 'NEW_LEADER_ANNOUNCED') {
            if (data.assignedId) window.myPlayerId = data.assignedId;
            if (data.lobbyPlayers) window.lobbyPlayers = data.lobbyPlayers;
            // Slots were reassigned: forget cursors/host lock from the old roster
            window.playerCursors = {};
            this.activeStateSender = null;
            this.lastStateFromActiveSender = 0;
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
            if (data.selectedMap) this.game.selectedMap = data.selectedMap;
            if (data.selectedDifficulty) this.game.selectedDifficulty = data.selectedDifficulty;
            window.playerCursors = {};
            this.activeStateSender = null;

            // A promoted player was only mirroring the old host, so its local
            // "click the map to begin" flag and auto-wave timer were never armed.
            // Without this the match stalled forever between waves.
            if (this.game.state === 'playing') {
                this.game.showMapDirections = false;
                this.game.skipVotes = new Set();
                // Client-side bullets are draw-only copies of the old host's shots (no update()).
                // The new host's towers fire real ones, so drop the copies.
                this.game.bullets = (this.game.bullets || []).filter(b => b && typeof b.update === 'function');
                if (!this.game.waveInProgress && this.game.autoMode && this.game.wave < this.game.maxWaves) {
                    this.game.autoStartTimer = 3.0;
                }
            }

            this.syncRoomPresence();

            // Unhide privacy toggle and copy link icon for newly promoted host
            const hostPrivacyBox = document.getElementById('host-privacy-container');
            if (hostPrivacyBox) {
                hostPrivacyBox.classList.remove('hidden');
                hostPrivacyBox.style.display = 'flex';
            }
            const copyCodeBtn = document.getElementById('btn-copy-code');
            if (copyCodeBtn) copyCodeBtn.classList.remove('hidden');

            const labelStatus = document.getElementById('label-lobby-status');
            if (labelStatus) {
                labelStatus.textContent = "SQUAD LEADER";
                labelStatus.style.color = "#00ffe0";
            }

            if (this.game && this.game.ui) {
                // If in Lobby, switch UI to host squad state so map choices & difficulty launch are unlocked
                if (this.game.state === 'lobby') {
                    if (this.game.ui.lobby && this.game.ui.lobby.coop) {
                        this.game.ui.lobby.coop.showCoopLobbyState();
                    }
                }

                // Unlock In-Game Match Controls if a game is currently playing
                if (this.game.state === 'playing') {
                    this.game.ui.updateWaveButton(this.game.waveInProgress);
                    this.game.ui.updateAutoWaveButton(this.game.autoMode);
                    this.game.ui.updateSpeedButton(this.game.speedMultiplier);
                    this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);

                    // Ensure playerWallets has an entry for all active slots
                    if (!this.game.playerWallets) this.game.playerWallets = {};
                    for (const slot of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
                        if (this.game.playerWallets[slot] === undefined) {
                            this.game.playerWallets[slot] = this.game.gold;
                        }
                    }

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

        // ─── REAL-TIME CO-OP SQUAD SYNC ───
        else if (data.type === 'COOP_MAP_SELECTED') {
            if (this.game) {
                this.game.setSelectedMap(data.selectedMap);
                
                // Update selection cards visually
                document.querySelectorAll('.coop-map-card, .map-card').forEach(card => {
                    if (card.getAttribute('data-map-id') === data.selectedMap) {
                        card.classList.add('active');
                    } else {
                        card.classList.remove('active');
                    }
                });

                // Update Client's Live Map Card in real time
                if (this.game.ui && this.game.ui.lobby && this.game.ui.lobby.coop) {
                    this.game.ui.lobby.coop.renderClientLiveMapCard(data.selectedMap);
                }
            }
        }
        else if (data.type === 'COOP_DIFF_SELECTED') {
            if (this.game) {
                this.game.selectedDifficulty = data.difficulty;
                document.querySelectorAll('.diff-wizard-card').forEach(card => {
                    if (card.getAttribute('data-difficulty') === data.difficulty) {
                        card.classList.add('active');
                    } else {
                        card.classList.remove('active');
                    }
                });

                // Update Client's Live Difficulty Card in real time
                if (this.game.ui && this.game.ui.lobby && this.game.ui.lobby.coop) {
                    this.game.ui.lobby.coop.renderClientLiveDiffCard(data.difficulty);
                }
            }
        }
        else if (data.type === 'COOP_STEP_CHANGE') {
            // Non-hosts always remain in the Squad Room viewing live cards
            if (this.mode === 'CLIENT' && this.game && this.game.ui && this.game.ui.lobby) {
                const diffStep = document.getElementById('wizard-step-diff');
                const prepStep = document.getElementById('wizard-step-prep');
                if (diffStep) {
                    diffStep.classList.add('hidden');
                    diffStep.style.setProperty('display', 'none', 'important');
                }
                if (prepStep) {
                    prepStep.classList.add('hidden');
                    prepStep.style.setProperty('display', 'none', 'important');
                }
                if (this.game.ui.lobby.coop) {
                    this.game.ui.lobby.coop.showCoopLobbyState();
                }
            }
        }

        // Match Start
        else if (data.type === 'START') {
            this.applyMatchStart(data);
            if (data.matchId) this.saveRejoinInfo(data.matchId);
        }

        // Return to Lobby
        else if (data.type === 'RETURN_TO_LOBBY') {
            this.clearRejoinInfo(); // squad is back in the lobby: nothing to reconnect to
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
                this.applyCompletedWaves(data);
                
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
            // Only mirror a match we are actually in (never while sitting in the lobby)
            if (!this.game || this.game.state === 'lobby') return;

            // Only follow ONE host. During a leader hand-over two players can briefly
            // both broadcast state; mixing them showed wave 0 with a full map of zombies.
            const sender = data.senderId || null;
            const now = Date.now();
            if (sender) {
                const lockAlive = this.activeStateSender && (now - (this.lastStateFromActiveSender || 0) < 3000);
                if (!lockAlive) {
                    this.activeStateSender = sender;
                } else if (sender !== this.activeStateSender) {
                    return;
                }
                this.lastStateFromActiveSender = now;
            }
            this.applyGameState(data);
        }

        // Actions received on Host from clients
        else if (this.mode === 'HOST') {
            this.handleClientActionOnHost(data);
        }
    },

    /** Shared by START and REJOIN_START: put this player into the match. */
    applyMatchStart: function(data) {
        this.game.selectedMap = data.selectedMap;
        this.game.selectedDifficulty = data.selectedDifficulty || 'easy';
        this.game.isHardcore = data.isHardcore;
        this.game.playerWallets = data.playerWallets || {};

        this.game.state = 'playing';
        window.dispatchEvent(new CustomEvent('btd:gameplay-start'));
        this.game.tutorialActive = false;
        // Fresh reward bookkeeping for joined players (they never run continueDeployment)
        this.game.isTutorialMatch = false;
        this.game._rewardsGiven = { coins: 0, xp: 0 };
        this.game.completedWaves = data.completedWaves || 0;
        this.game.startBoostUsed = false;
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
        this._lastUiGold = undefined;
        this._lastUiLives = undefined;
        this._lastUiWave = undefined;
        this._lastUiWaveInProgress = undefined;
        this.activeStateSender = data.senderId || null;
        this.lastStateFromActiveSender = Date.now();
        this.game.enemies = [];
        this.game.bullets = [];
        this.game.spawnQueue = [];
        this.game.matchTime = 0;

        this.game.grid.clear();
        this.game.effectManager.clear();
        this.game.setSelectedPlacedTower(null);
        this.game.selectedShopTower = (this.game.equippedAgents && this.game.equippedAgents.length > 0) ? this.game.equippedAgents[0] : 'scout';

        let mapName = data.selectedMap.replace('_', ' ').toUpperCase();
        this.game.ui.showGameLayout(mapName);
        this.game.ui.renderPlacementShop();
        this.game.ui.updateSpeedButton(1);
        this.game.ui.updateWaveButton(false);
        this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
    },

    /** Host -> reconnecting player: everything they need to drop back into the running match. */
    sendRejoinSnapshot: function(targetId) {
        const g = this.game;
        this.broadcastToAll({
            type: 'REJOIN_START',
            targetId: targetId,
            selectedMap: g.selectedMap,
            selectedDifficulty: g.selectedDifficulty,
            isHardcore: g.isHardcore,
            playerWallets: g.playerWallets,
            obstacles: g.grid.obstacles,
            lives: g.lives,
            gold: (g.playerWallets && g.playerWallets[targetId] !== undefined) ? g.playerWallets[targetId] : 400,
            maxWaves: g.maxWaves,
            wave: g.wave,
            completedWaves: g.completedWaves || 0,
            waveInProgress: g.waveInProgress,
            matchTime: g.matchTime
        });
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

                // Pixel position; very old clients only sent the tile (col,row), so convert that to the tile centre
                const cs = (this.game.grid && this.game.grid.cellSize) || 40;
                const posX = data.x !== undefined ? data.x : data.col * cs + cs / 2;
                const posY = data.y !== undefined ? data.y : data.row * cs + cs / 2;
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
                const targetPlayerId = data.senderId || cPlayerId || 'p1';
                let tower = null;

                const targetId = data.towerId || data.id || data.key;
                if (targetId) tower = this.game.grid.towers.get(targetId);
                if (!tower && data.x !== undefined && data.y !== undefined && this.game.grid.getTowerAt) {
                    tower = this.game.grid.getTowerAt(data.x, data.y, 20);
                }
                if (!tower) {
                    tower = this.game.grid.towers.get(`${data.col},${data.row}`);
                }

                if (tower) {
                    // Only allow players to sell their own towers (or allow Host to sell anything)
                    if (tower.ownerId && tower.ownerId !== targetPlayerId && targetPlayerId !== 'p1') {
                        return;
                    }

                    const refund = tower.getSellValue();
                    this.game.grid.removeTower(tower);

                    if (!this.game.playerWallets) this.game.playerWallets = {};
                    if (this.game.playerWallets[targetPlayerId] === undefined) {
                        this.game.playerWallets[targetPlayerId] = this.game.gold;
                    }
                    this.game.playerWallets[targetPlayerId] += refund;

                    if (targetPlayerId === 'p1') {
                        this.game.gold += refund;
                    }

                    this.game.effectManager.spawnPlacementSparks(tower.x, tower.y, 40);
                    soundManager.playPlace();
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
        // Trigger floating wave banner for multiplayer clients when wave advances
        if (data.wave > this.game.wave && this.game.state === 'playing') {
            const maxW = data.maxWaves !== undefined ? data.maxWaves : this.game.maxWaves;
            if (this.game.effectManager && this.game.effectManager.spawnWaveText) {
                this.game.effectManager.spawnWaveText(`WAVE ${data.wave} / ${maxW}`, '#f1c40f');
            }
        }

        this.game.lives = data.lives;
        this.game.wave = data.wave;
        if (data.maxWaves !== undefined) this.game.maxWaves = data.maxWaves;
        this.game.waveInProgress = data.waveInProgress;
        this.applyCompletedWaves(data);
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

        if (data.playerWallets) {
            this.game.playerWallets = data.playerWallets;
            if (data.playerWallets[window.myPlayerId] !== undefined) {
                this.game.gold = data.playerWallets[window.myPlayerId];
            } else {
                this.game.gold = data.gold;
            }
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
            if (eData.sf !== undefined) enemy.slowFactor = eData.sf;   // lets clients show the ice block on deep freeze
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
                            text: 'spawnText',
                            waveText: 'spawnWaveText'
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
            // Only update HUD elements when stats actually change to avoid layout thrashing
            if (this._lastUiGold !== this.game.gold || this._lastUiLives !== this.game.lives || this._lastUiWave !== this.game.wave) {
                this._lastUiGold = this.game.gold;
                this._lastUiLives = this.game.lives;
                this._lastUiWave = this.game.wave;
                this.game.ui.updateHUD(this.game.lives, this.game.gold, this.game.wave, this.game.maxWaves);
            }
            // Show "DEFENDING..." during the host's waves instead of a stuck "WAITING FOR HOST"
            if (this._lastUiWaveInProgress !== this.game.waveInProgress) {
                this._lastUiWaveInProgress = this.game.waveInProgress;
                this.game.ui.updateWaveButton(this.game.waveInProgress);
            }
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
            wave: wave,
            completedWaves: this.game ? (this.game.completedWaves || 0) : 0
        });
    },

    /** Joined players don't simulate waves, so they take the host's count (rewards depend on it). */
    applyCompletedWaves: function(data) {
        if (!this.game || this.mode !== 'CLIENT') return;
        let done;
        if (data.completedWaves !== undefined) {
            done = data.completedWaves;
        } else {
            // Older host without the field: estimate from the wave counter
            const w = data.wave !== undefined ? data.wave : this.game.wave;
            const midWave = data.type === 'GAME_OVER' ? !data.isVictory : !!data.waveInProgress;
            done = Math.max(0, (w || 0) - (midWave ? 1 : 0));
        }
        if (typeof done === 'number' && done > (this.game.completedWaves || 0)) {
            this.game.completedWaves = done;
        }
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
            completedWaves: this.game.completedWaves || 0,
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
                sf: Math.round((e.slowFactor !== undefined ? e.slowFactor : 1) * 100) / 100,
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
                // ONLY broadcast large, essential visual events (prevents flooding during giant fights)
                if (self.mode === 'HOST' && self.pendingEvents.length < 30) {
                    self.pendingEvents.push({ type, args });
                }
            };
        };

        wrap('spawnPlacementSparks', 'placementSparks');
        wrap('spawnExplosion', 'explosion');
        wrap('spawnText', 'text');
        wrap('spawnWaveText', 'waveText');
        // impact, muzzleFlash, and swingArc run purely on client-side simulation to protect bandwidth
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
                // Do NOT broadcast playShoot over WebSocket (each client already plays sounds when bullets fire)
                if (self.mode === 'HOST' && methodName !== 'playShoot') {
                    self.pendingEvents.push({ type: 'sound', name: methodName, args });
                }
            };
        };

        wrap('playPlace');
        wrap('playUpgrade');
        wrap('playCrateDrop');
        wrap('playCrateReveal');
        wrap('playVictory');
        wrap('playDefeat');
    }
};

window.Network = Network;