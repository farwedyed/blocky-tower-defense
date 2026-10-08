// src/lobby-coop.js
// Sub-controller handling the Co-op Matchmaking UI, Connection controls, and player slot replication.

import { Network } from './network.js';
import { CrazyGamesManager } from './crazygames.js';
import { soundManager } from './sound.js';
import { drawBossPreviewOnCanvas } from './game-renderer.js';

export class LobbyCoop {
  constructor(lobbyUI, game) {
    this.lobbyUI = lobbyUI;
    this.game = game;
  }

  injectCoopControls() {
    const parentPanel = document.getElementById('panel-maps');
    if (!parentPanel) return;

    // Clean up any stale instances
    const oldSplash = document.getElementById('lobby-splash-container');
    if (oldSplash) oldSplash.remove();
    const oldHeader = document.getElementById('coop-header-panel');
    if (oldHeader) oldHeader.remove();
    const oldFooter = document.getElementById('coop-footer-panel');
    if (oldFooter) oldFooter.remove();

    // 1. Splash Screen
    const splashContainer = document.createElement('div');
    splashContainer.id = 'lobby-splash-container';
    splashContainer.className = 'splash-container-v2';
    splashContainer.innerHTML = `
      <div class="splash-art-backdrop"></div>
      <div class="splash-curved-podium">
        <svg class="splash-curve-svg" viewBox="0 0 1000 320" preserveAspectRatio="none">
          <defs>
            <linearGradient id="podiumGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#004eb7" />
              <stop offset="35%" stop-color="#00358e" />
              <stop offset="100%" stop-color="#001848" />
            </linearGradient>
            <filter id="cyanGlow" x="-20%" y="-40%" width="140%" height="180%">
              <feDropShadow dx="0" dy="-3" stdDeviation="5" flood-color="#00ffe0" flood-opacity="1.0"/>
            </filter>
          </defs>
          <path d="M 0,320 L 0,110 Q 500,0 1000,110 L 1000,320 Z" fill="url(#podiumGrad)" />
          <path d="M 0,110 Q 500,0 1000,110" fill="none" stroke="#00ffe0" stroke-width="5" filter="url(#cyanGlow)" />
        </svg>

        <div class="splash-podium-content">
          <img src="assets/ui/menu/sprite_16.png" class="splash-title-img" alt="Select Gameplay Mode" />
          <p class="splash-subtext">Equip loadouts and enter solo battlegrounds or create high-tactical co-op squad parties with friends!</p>
          <div class="splash-action-row">
            <button id="btn-select-solo" class="btn-splash-solo">
              <img src="assets/ui/menu/sprite_19.png" class="splash-btn-icon" /> PLAY SOLO
            </button>
            <button id="btn-select-coop" class="btn-splash-coop">
              <img src="assets/ui/menu/sprite_20.png" class="splash-btn-icon" /> CO-OP PARTY
            </button>
          </div>
        </div>
      </div>
    `;

    // 2. Co-op Main Panel (Setup View + In-Room View)
    const coopPanelHeader = document.createElement('div');
    coopPanelHeader.id = 'coop-header-panel';
    coopPanelHeader.className = 'coop-main-panel hidden';
    coopPanelHeader.innerHTML = `
      <!-- ================= PHASE A: SQUAD BROWSER / SETUP ================= -->
      <div id="coop-setup-phase" class="coop-phase-view">
        <div class="coop-panel-top-row">
          <div class="coop-title-cluster">
            <img src="assets/ui/coop/sprite_01.png" class="coop-header-icon" alt="" />
            <img src="assets/ui/coop/Text.png" class="coop-header-title-img" alt="CO-OP MULTIPLAYER LOBBY" />
          </div>
          <button id="btn-back-to-modes-coop" class="coop-btn-change-mode">
            <span class="coop-gear-icon">⚙</span> CHANGE MODE
          </button>
        </div>

        <div id="coop-setup-controls" class="coop-controls-row">
          <div class="coop-field-block">
            <span class="coop-field-label">PLAYER NAME</span>
            <div class="coop-input-pill">
              <span class="coop-pencil-icon">✏️</span>
              <input type="text" id="input-player-name" placeholder="User1" />
            </div>
          </div>

          <button id="btn-host-coop" class="btn-coop-pill-host">
            <img src="assets/ui/coop/sprite_01.png" class="btn-coop-host-icon" alt="" />
            <span>HOST SQUAD</span>
          </button>

          <div class="coop-field-block">
            <span class="coop-field-label">ROOM CODE</span>
            <div class="coop-input-pill">
              <span class="coop-code-icon">🎟️</span>
              <input type="text" id="input-join-code" placeholder="ENTER ROOM CODE" />
            </div>
          </div>

          <button id="btn-join-coop" class="btn-coop-pill-join">
            <img src="assets/ui/coop/sprite_02.png" class="btn-coop-join-icon" alt="" />
            <span>JOIN</span>
          </button>
        </div>

        <!-- Server Browser Box -->
        <div id="server-browser-panel" class="coop-browser-card">
          <div class="coop-browser-header">
            <div class="coop-browser-title-left">
              <img src="assets/ui/coop/sprite_01.png" class="coop-browser-header-icon" alt="" />
              <span>ACTIVE PUBLIC SQUADS</span>
            </div>
            <button id="btn-refresh-servers" class="btn-coop-refresh">
              <img src="assets/ui/coop/sprite_03.png" class="btn-coop-refresh-icon" alt="" />
              <span>REFRESH</span>
            </button>
          </div>
          <div id="server-browser-list" class="coop-browser-list"></div>
        </div>
      </div>

      <!-- ================= PHASE B: ACTIVE SQUAD ROOM (HOST & MEMBERS) ================= -->
      <div id="coop-room-phase" class="coop-phase-view hidden">
        <!-- Room Status Strip -->
        <div class="coop-room-header-strip">
          <div class="coop-room-badge-cluster">
            <span id="label-room-code" class="coop-code-display">ROOM: ------</span>
            <button id="btn-copy-code" class="btn-coop-copy-code" title="Copy Invite Link">
              <img src="https://img.icons8.com/color/48/copy.png" class="copy-icon-img" alt="" />
              <span>COPY INVITE</span>
            </button>
            <div id="host-privacy-container" class="coop-privacy-toggle hidden">
              <input type="checkbox" id="check-public-room" checked />
              <label for="check-public-room">🌐 PUBLIC</label>
            </div>
          </div>
          <div class="coop-room-right-cluster">
            <span id="label-lobby-status" class="coop-status-tag">HOSTING</span>
            <button id="btn-disconnect-coop" class="btn-coop-leave-room">✕ LEAVE SQUAD</button>
          </div>
        </div>

        <!-- Connecting state (joining from an invite / auto-hosting) -->
        <div id="coop-connecting-card" class="coop-connecting-card hidden">
          <div class="coop-connecting-spinner"></div>
          <div class="coop-connecting-title" id="coop-connecting-title">JOINING SQUAD...</div>
          <div class="coop-connecting-sub" id="coop-connecting-sub">Connecting to your friend's room</div>
        </div>

        <!-- Squad Roster Grid (8 Styled Slots) -->
        <div class="coop-roster-section">
          <div class="coop-section-label">SQUAD MEMBERS (<span id="coop-count-label">1/8</span>)</div>
          <div id="coop-player-slots" class="coop-slots-grid"></div>
        </div>

        <!-- Map & Difficulty Section for Co-op -->
        <div class="coop-map-section">
          <div class="coop-section-label" id="coop-map-section-title">BATTLEGROUND SELECTION</div>

          <!-- HOST VIEW: All 5 Map Cards -->
          <div id="coop-host-map-row" class="coop-map-row">
            <button class="map-card coop-map-card active" data-map-id="grassland">
              <canvas class="map-preview-canvas" width="120" height="90"></canvas>
              <div class="map-info">
                <span class="name">Grassland</span>
                <span class="difficulty easy">x1.0 Coins / XP</span>
              </div>
            </button>
            <button class="map-card coop-map-card" data-map-id="desert">
              <canvas class="map-preview-canvas" width="120" height="90"></canvas>
              <div class="map-info">
                <span class="name">Desert Outpost</span>
                <span class="difficulty medium">x1.25 Coins / XP</span>
              </div>
            </button>
            <button class="map-card coop-map-card" data-map-id="tundra">
              <canvas class="map-preview-canvas" width="120" height="90"></canvas>
              <div class="map-info">
                <span class="name">Frost Tundra</span>
                <span class="difficulty hard">x1.5 Coins / XP</span>
              </div>
            </button>
            <button class="map-card coop-map-card" data-map-id="cyber_city">
              <canvas class="map-preview-canvas" width="120" height="90"></canvas>
              <div class="map-info">
                <span class="name">Cyber City</span>
                <span class="difficulty locked-badge">🔒 REQ. LVL 5</span>
              </div>
            </button>
            <button class="map-card coop-map-card" data-map-id="fallen_outpost">
              <canvas class="map-preview-canvas" width="120" height="90"></canvas>
              <div class="map-info">
                <span class="name">Fallen Outpost</span>
                <span class="difficulty locked-badge">🔒 REQ. LVL 10</span>
              </div>
            </button>
          </div>

          <!-- CLIENT VIEW: Live Synced Map & Difficulty Cards -->
          <div id="coop-client-live-deck" class="coop-client-live-deck hidden">
            <!-- Map Card -->
            <div id="coop-client-map-card" class="coop-single-live-card">
              <div class="live-card-badge">👑 SELECTED MAP</div>
              <canvas id="coop-live-preview-canvas" width="130" height="98"></canvas>
              <div class="live-card-details">
                <span id="coop-live-map-name" class="live-map-title">Grassland</span>
                <span id="coop-live-map-diff" class="live-map-sub">x1.0 Coins / XP</span>
              </div>
            </div>

            <!-- Difficulty Card -->
            <div id="coop-client-diff-card" class="coop-single-live-card">
              <div class="live-card-badge">👑 SELECTED DIFFICULTY</div>
              <canvas id="coop-live-diff-boss-canvas" width="98" height="98"></canvas>
              <div class="live-card-details">
                <span id="coop-live-diff-name" class="live-map-title" style="color: #2ecc71;">EASY</span>
                <span id="coop-live-diff-boss" class="live-map-sub">BOSS: BRUTE</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Launch / Readiness Bar -->
        <div class="coop-bottom-action-bar">
          <div id="coop-client-waiting-msg" class="coop-waiting-pill hidden">
            <span>⏳ WAITING FOR SQUAD LEADER...</span>
          </div>
          <button id="btn-coop-next-diff" class="btn-coop-launch">
            <img src="assets/ui/solo/sprite_02.png" class="btn-launch-swords" alt="" />
            <span>CHOOSE DIFFICULTY ➔</span>
          </button>
        </div>
      </div>
    `;

    parentPanel.prepend(coopPanelHeader);
    parentPanel.appendChild(splashContainer);
  }

  showSplashState() {
    this.clearConnectingState();
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const mapTab = document.querySelector('.tab-btn[data-target="panel-maps"]');
    if (mapTab) mapTab.classList.add('active');

    document.querySelectorAll('.lobby-panel').forEach(p => {
      p.classList.remove('active');
      p.style.display = '';
    });
    const panelMaps = document.getElementById('panel-maps');
    if (panelMaps) panelMaps.classList.add('active');

    const splash = document.getElementById('lobby-splash-container');
    if (splash) {
      splash.style.display = 'flex';
      splash.classList.remove('hidden');
    }
    
    const coopHeader = document.getElementById('coop-header-panel');
    if (coopHeader) {
      coopHeader.classList.add('hidden');
      coopHeader.style.setProperty('display', 'none', 'important');
    }

    const setupPhase = document.getElementById('coop-setup-phase');
    if (setupPhase) setupPhase.classList.remove('hidden');
    const roomPhase = document.getElementById('coop-room-phase');
    if (roomPhase) roomPhase.classList.add('hidden');

    this.lobbyUI.toggleSoloElements(false);

    const btnBack = document.getElementById('btn-lobby-back');
    if (btnBack) btnBack.style.display = 'none';

    if (this.lobbyUI.parentUI) {
      this.lobbyUI.parentUI.hidePointer();
    }
  }

  /**
   * Shows the multiplayer room UI in a "connecting" state. Used when a player
   * joins a friend through a CrazyGames invite (or instant multiplayer
   * auto-host) so they never land on an empty menu panel.
   * @param {string|null} roomCode  room being joined, or null when hosting
   */
  showCoopConnectingState(roomCode) {
    // Make the Map Select tab + panel the visible ones
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const mapTab = document.querySelector('.tab-btn[data-target="panel-maps"]');
    if (mapTab) mapTab.classList.add('active');
    document.querySelectorAll('.lobby-panel').forEach(p => {
      p.classList.remove('active');
      p.style.display = '';
    });
    const panelMaps = document.getElementById('panel-maps');
    if (panelMaps) panelMaps.classList.add('active');

    const splash = document.getElementById('lobby-splash-container');
    if (splash) {
      splash.style.setProperty('display', 'none', 'important');
      splash.classList.add('hidden');
    }
    this.lobbyUI.toggleSoloElements(false);

    const coopHeader = document.getElementById('coop-header-panel');
    if (coopHeader) {
      coopHeader.classList.remove('hidden');
      coopHeader.style.setProperty('display', 'flex', 'important');
    }
    const setupPhase = document.getElementById('coop-setup-phase');
    if (setupPhase) {
      setupPhase.classList.add('hidden');
      setupPhase.style.setProperty('display', 'none', 'important');
    }
    const roomPhase = document.getElementById('coop-room-phase');
    if (roomPhase) {
      roomPhase.classList.remove('hidden');
      roomPhase.classList.add('is-connecting');
      roomPhase.style.setProperty('display', 'flex', 'important');
    }
    const connectingCard = document.getElementById('coop-connecting-card');
    if (connectingCard) connectingCard.classList.remove('hidden');

    const title = document.getElementById('coop-connecting-title');
    const sub = document.getElementById('coop-connecting-sub');
    if (title) title.textContent = roomCode ? 'JOINING SQUAD...' : 'CREATING SQUAD...';
    if (sub) sub.textContent = roomCode ? `Connecting to room ${roomCode}` : 'Setting up your multiplayer room';

    const labelRoomCode = document.getElementById('label-room-code');
    if (labelRoomCode) labelRoomCode.textContent = roomCode ? `ROOM: ${roomCode}` : 'ROOM: ------';
    const labelStatus = document.getElementById('label-lobby-status');
    if (labelStatus) {
      labelStatus.textContent = 'CONNECTING...';
      labelStatus.style.color = 'var(--primary-orange)';
    }
    const copyBtn = document.getElementById('btn-copy-code');
    if (copyBtn) copyBtn.classList.add('hidden');
    const hostPrivacyBox = document.getElementById('host-privacy-container');
    if (hostPrivacyBox) {
      hostPrivacyBox.classList.add('hidden');
      hostPrivacyBox.style.display = 'none';
    }

    const btnBack = document.getElementById('btn-lobby-back');
    if (btnBack) btnBack.style.display = 'block';
    if (this.lobbyUI.parentUI) this.lobbyUI.parentUI.hidePointer();
  }

  /**
   * Big "RECONNECT" prompt shown on login when the co-op match this player dropped out of is
   * still being played (the server checked: same match, not back in lobby, not finished).
   */
  showRejoinPrompt(info, status) {
    this.hideRejoinPrompt();
    const app = document.getElementById('app-container');
    if (!app || !info) return;

    const mapNames = { grassland: 'Grassland', desert: 'Desert Outpost', tundra: 'Frost Tundra', cyber_city: 'Cyber City', fallen_outpost: 'Fallen Outpost' };
    const mapName = mapNames[status && status.selectedMap] || 'your map';
    const players = status && status.players ? status.players : 0;
    const diff = status && status.selectedDifficulty ? String(status.selectedDifficulty).toUpperCase() : '';

    const overlay = document.createElement('div');
    overlay.id = 'rejoin-prompt-overlay';
    overlay.innerHTML = `
      <div class="rejoin-card" role="dialog" aria-labelledby="rejoin-title">
        <div class="rejoin-pulse-dot"></div>
        <div id="rejoin-title" class="rejoin-title">YOUR MATCH IS STILL ON!</div>
        <div class="rejoin-sub">You got disconnected from your squad. They're still fighting on <b>${mapName}</b>${diff ? ` (${diff})` : ''}${players ? ` with ${players} player${players === 1 ? '' : 's'}` : ''}.</div>
        <button id="btn-rejoin-match" class="btn-rejoin-big">
          <img src="assets/ui/solo/sprite_02.png" class="btn-rejoin-swords" alt="" />
          <span>RECONNECT</span>
        </button>
        <button id="btn-rejoin-dismiss" class="btn-rejoin-dismiss">No thanks, go to menu</button>
      </div>
    `;
    app.appendChild(overlay);

    overlay.querySelector('#btn-rejoin-match').addEventListener('click', () => {
      soundManager.playTick();
      this.hideRejoinPrompt();
      this.showCoopConnectingState(info.roomId);
      const title = document.getElementById('coop-connecting-title');
      const sub = document.getElementById('coop-connecting-sub');
      if (title) title.textContent = 'RECONNECTING...';
      if (sub) sub.textContent = `Getting you back into room ${info.roomId}`;
      Network.rejoinMatch(info);
    });
    overlay.querySelector('#btn-rejoin-dismiss').addEventListener('click', () => {
      soundManager.playTick();
      Network.clearRejoinInfo();
      this.hideRejoinPrompt();
    });
  }

  hideRejoinPrompt() {
    const old = document.getElementById('rejoin-prompt-overlay');
    if (old) old.remove();
  }

  clearConnectingState() {
    const roomPhase = document.getElementById('coop-room-phase');
    if (roomPhase) roomPhase.classList.remove('is-connecting');
    const connectingCard = document.getElementById('coop-connecting-card');
    if (connectingCard) connectingCard.classList.add('hidden');
    const copyBtn = document.getElementById('btn-copy-code');
    if (copyBtn) copyBtn.classList.remove('hidden');
  }

  showCoopLobbyState() {
    this.clearConnectingState();
    const splash = document.getElementById('lobby-splash-container');
    if (splash) {
      splash.style.setProperty('display', 'none', 'important');
      splash.classList.add('hidden');
    }

    this.lobbyUI.toggleSoloElements(false);

    const coopHeader = document.getElementById('coop-header-panel');
    if (coopHeader) {
      coopHeader.classList.remove('hidden');
      coopHeader.style.setProperty('display', 'flex', 'important');
    }

    // ─── CRITICAL: PHASE SWITCHING (FORCE HIDE SETUP, FORCE SHOW ROOM) ───
    const setupPhase = document.getElementById('coop-setup-phase');
    if (setupPhase) {
      setupPhase.classList.add('hidden');
      setupPhase.style.setProperty('display', 'none', 'important'); // Force off
    }

    const roomPhase = document.getElementById('coop-room-phase');
    if (roomPhase) {
      roomPhase.classList.remove('hidden');
      roomPhase.style.setProperty('display', 'flex', 'important'); // Force on
    }

    const labelRoomCode = document.getElementById('label-room-code');
    if (labelRoomCode && Network.roomId) {
      labelRoomCode.textContent = `ROOM: ${Network.roomId.toUpperCase()}`;
    }

    const labelStatus = document.getElementById('label-lobby-status');
    const hostPrivacyBox = document.getElementById('host-privacy-container');
    const btnNextDiff = document.getElementById('btn-coop-next-diff');
    const clientWaitMsg = document.getElementById('coop-client-waiting-msg');

    const isHost = Network.mode === 'HOST';
    const hostMapRow = document.getElementById('coop-host-map-row');
    const clientDeck = document.getElementById('coop-client-live-deck');
    const sectionTitle = document.getElementById('coop-map-section-title');

    if (isHost) {
      if (hostPrivacyBox) {
        hostPrivacyBox.classList.remove('hidden');
        hostPrivacyBox.style.display = 'flex';
      }
      if (btnNextDiff) {
        btnNextDiff.classList.remove('hidden');
        btnNextDiff.style.display = 'flex';
      }
      if (clientWaitMsg) {
        clientWaitMsg.classList.add('hidden');
        clientWaitMsg.style.display = 'none';
      }
      if (labelStatus) {
        labelStatus.textContent = "SQUAD LEADER";
        labelStatus.style.color = "#00ffe0";
      }
      if (sectionTitle) sectionTitle.textContent = "CHOOSE BATTLEGROUND";

      // Show all 5 map cards to Host
      if (hostMapRow) hostMapRow.classList.remove('hidden');
      if (clientDeck) clientDeck.classList.add('hidden');

      // Draw all 5 map previews for Host
      requestAnimationFrame(() => {
        document.querySelectorAll('.coop-map-card').forEach(card => {
          const cvs = card.querySelector('.map-preview-canvas');
          const mapId = card.getAttribute('data-map-id');
          if (cvs && mapId && this.lobbyUI && this.lobbyUI.wizard) {
            this.lobbyUI.wizard.drawMapPreview(cvs, mapId);
          }
        });
      });
    } else {
      // CLIENT: Hide host privacy toggle and launch button
      if (hostPrivacyBox) {
        hostPrivacyBox.classList.add('hidden');
        hostPrivacyBox.style.display = 'none';
      }
      if (btnNextDiff) {
        btnNextDiff.classList.add('hidden');
        btnNextDiff.style.display = 'none';
      }
      if (clientWaitMsg) {
        clientWaitMsg.classList.remove('hidden');
        clientWaitMsg.style.display = 'flex';
      }
      if (labelStatus) {
        labelStatus.textContent = "SQUAD MEMBER";
        labelStatus.style.color = "#2ecc71";
      }
      if (sectionTitle) sectionTitle.textContent = "MISSION DIRECTIVES";

      // Hide the 5-card row from Client and show the live deck!
      if (hostMapRow) hostMapRow.classList.add('hidden');
      if (clientDeck) clientDeck.classList.remove('hidden');

      // Render both live cards with current map and difficulty
      this.renderClientLiveMapCard(this.game.selectedMap || 'grassland');
      this.renderClientLiveDiffCard(this.game.selectedDifficulty || 'easy');
    }

    this.updateCoopPlayerList();
  }

  renderClientLiveMapCard(mapId) {
    const canvas = document.getElementById('coop-live-preview-canvas');
    const nameEl = document.getElementById('coop-live-map-name');
    const diffEl = document.getElementById('coop-live-map-diff');

    const meta = {
      grassland: { name: 'Grassland', diff: 'x1.0 Coins / XP', color: '#2ecc71' },
      desert: { name: 'Desert Outpost', diff: 'x1.25 Coins / XP', color: '#e67e22' },
      tundra: { name: 'Frost Tundra', diff: 'x1.5 Coins / XP', color: '#3498db' },
      cyber_city: { name: 'Cyber City', diff: 'x1.0 Coins / XP', color: '#9b59b6' },
      fallen_outpost: { name: 'Fallen Outpost', diff: 'x1.0 Coins / XP', color: '#e74c3c' }
    };

    const current = meta[mapId] || meta.grassland;
    if (nameEl) nameEl.textContent = current.name;
    if (diffEl) {
      diffEl.textContent = current.diff;
      diffEl.style.color = current.color;
    }

    if (canvas && this.lobbyUI && this.lobbyUI.wizard) {
      requestAnimationFrame(() => {
        this.lobbyUI.wizard.drawMapPreview(canvas, mapId);
      });
    }
  }

  renderClientLiveDiffCard(diffId) {
    const canvas = document.getElementById('coop-live-diff-boss-canvas');
    const nameEl = document.getElementById('coop-live-diff-name');
    const bossEl = document.getElementById('coop-live-diff-boss');

    const meta = {
      easy: { name: 'EASY', boss: 'BRUTE', bossType: 'brute', color: '#2ecc71' },
      casual: { name: 'CASUAL', boss: 'GRAVE DIGGER', bossType: 'grave_digger', color: '#7f8c8d' },
      intermediate: { name: 'INTERMEDIATE', boss: 'HAZARD GIANT', bossType: 'hazard_giant', color: '#0984e3' },
      molten: { name: 'MOLTEN', boss: 'MOLTEN TITAN', bossType: 'molten_titan', color: '#d35400' },
      fallen: { name: 'FALLEN', boss: 'FALLEN KING', bossType: 'fallen_king', color: '#8e44ad' }
    };

    const current = meta[diffId] || meta.easy;
    if (nameEl) {
      nameEl.textContent = current.name;
      nameEl.style.color = current.color;
    }
    if (bossEl) {
      bossEl.textContent = `BOSS: ${current.boss}`;
    }

    if (canvas) {
      requestAnimationFrame(() => {
        drawBossPreviewOnCanvas(canvas, current.bossType);
      });
    }
  }

  renderServerBrowser(rooms) {
    const listEl = document.getElementById('server-browser-list');
    if (!listEl) return;

    if (!rooms || rooms.length === 0) {
      listEl.innerHTML = `
        <div class="coop-empty-showcase">
          <img src="assets/ui/coop/sprite_07.png" class="coop-empty-soldiers-img" alt="Troops" />
          <h2 class="coop-empty-heading">No squads available right now</h2>
          <p class="coop-empty-caption">Host a squad to invite friends into battle!</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `
      <div class="coop-rooms-deck">
        ${rooms.map(r => {
          const isFull = r.players >= r.maxPlayers;
          const mapLabel = (r.map || 'Grassland').replace('_', ' ').toUpperCase();
          const statusColor = r.inGame ? '#e67e22' : '#2ecc71';
          const statusText = r.inGame ? 'IN BATTLE' : 'IN LOBBY';

          return `
            <div class="coop-room-row">
              <div class="coop-room-info">
                <div class="coop-room-title-line">
                  <span class="coop-room-code">${r.id}</span>
                  <span class="coop-room-host">${r.hostName}</span>
                  <span class="coop-room-status" style="background:${statusColor};">${statusText}</span>
                </div>
                <span class="coop-room-meta">MAP: ${mapLabel} &bull; PLAYERS: ${r.players}/${r.maxPlayers}</span>
              </div>
              <button class="btn-coop-pill-join btn-quick-join" data-code="${r.id}" ${(isFull || r.inGame) ? 'disabled' : ''} title="${r.inGame ? 'This squad is already in a match' : ''}" style="height:44px; padding:0 20px; font-size:1rem;">
                <span>${isFull ? 'FULL' : (r.inGame ? 'IN MATCH' : 'JOIN')}</span>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;

    listEl.querySelectorAll('.btn-quick-join').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        const inputJoinCode = document.getElementById('input-join-code');
        if (inputJoinCode) inputJoinCode.value = code;
        const btnJoinCoop = document.getElementById('btn-join-coop');
        if (btnJoinCoop) btnJoinCoop.click();
      });
    });
  }

  resetJoinControls() {
    const setupPhase = document.getElementById('coop-setup-phase');
    if (setupPhase) {
      setupPhase.classList.remove('hidden');
      setupPhase.style.removeProperty('display');
    }
    const roomPhase = document.getElementById('coop-room-phase');
    if (roomPhase) {
      roomPhase.classList.add('hidden');
      roomPhase.style.setProperty('display', 'none', 'important');
    }

    const inputJoinCode = document.getElementById('input-join-code');
    if (inputJoinCode) {
      inputJoinCode.disabled = false;
      inputJoinCode.value = '';
    }

    const btnJoin = document.getElementById('btn-join-coop');
    if (btnJoin) btnJoin.disabled = false;
    const btnHost = document.getElementById('btn-host-coop');
    if (btnHost) btnHost.disabled = false;
  }

  initEventListeners() {
    const btnSelectSolo = document.getElementById('btn-select-solo');
    const btnSelectCoop = document.getElementById('btn-select-coop');

    if (btnSelectSolo) {
      btnSelectSolo.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof soundManager !== 'undefined' && soundManager.playTick) {
          soundManager.playTick();
        }

        this.game.shouldShowSoloGuide = false;
        this.game.soloGuided = true;
        this.game.saveStatsToStorage();
        if (this.lobbyUI && this.lobbyUI.parentUI) {
          this.lobbyUI.parentUI.hidePointer();
        }
        const guideEl = document.getElementById('tutorial-hand-guide');
        if (guideEl) guideEl.classList.add('hidden');

        if (Network.mode !== 'OFFLINE') {
          Network.disconnect();
        }
        Network.mode = 'OFFLINE';

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const mapTab = document.querySelector('.tab-btn[data-target="panel-maps"]');
        if (mapTab) mapTab.classList.add('active');

        document.querySelectorAll('.lobby-panel').forEach(p => p.classList.remove('active'));
        const panelMaps = document.getElementById('panel-maps');
        if (panelMaps) {
          panelMaps.classList.add('active');
          panelMaps.style.display = '';
        }

        const splash = document.getElementById('lobby-splash-container');
        if (splash) {
          splash.style.display = 'none';
          splash.classList.add('hidden');
        }

        const coopHeader = document.getElementById('coop-header-panel');
        if (coopHeader) {
          coopHeader.classList.add('hidden');
          coopHeader.style.setProperty('display', 'none', 'important');
        }

        this.lobbyUI.toggleSoloElements(true);

        const btnBack = document.getElementById('btn-lobby-back');
        if (btnBack) btnBack.style.display = 'block';
      });
    }

    if (btnSelectCoop) {
      btnSelectCoop.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof soundManager !== 'undefined' && soundManager.playTick) {
          soundManager.playTick();
        }

        this.game.shouldShowSoloGuide = false;
        this.game.soloGuided = true;
        this.game.saveStatsToStorage();
        if (this.lobbyUI && this.lobbyUI.parentUI) {
          this.lobbyUI.parentUI.hidePointer();
        }

        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const mapTab = document.querySelector('.tab-btn[data-target="panel-maps"]');
        if (mapTab) mapTab.classList.add('active');

        document.querySelectorAll('.lobby-panel').forEach(p => p.classList.remove('active'));
        const panelMaps = document.getElementById('panel-maps');
        if (panelMaps) {
          panelMaps.classList.add('active');
          panelMaps.style.setProperty('display', 'flex', 'important');
        }

        const splash = document.getElementById('lobby-splash-container');
        if (splash) {
          splash.style.setProperty('display', 'none', 'important');
          splash.classList.add('hidden');
        }
        this.lobbyUI.toggleSoloElements(false);

        const coopHeader = document.getElementById('coop-header-panel');
        if (coopHeader) {
          coopHeader.classList.remove('hidden');
          coopHeader.style.setProperty('display', 'flex', 'important');
        }

        // Reset to Phase A (Setup / Browser) view
        this.resetJoinControls();

        const btnBack = document.getElementById('btn-lobby-back');
        if (btnBack) btnBack.style.display = 'block';

        if (Network.ws && Network.ws.readyState === WebSocket.OPEN) {
          Network.send({ type: 'GET_ROOMS' });
        } else {
          Network.init(this.game, () => {
            Network.send({ type: 'GET_ROOMS' });
          });
        }
      });
    }

    const btnHostCoop = document.getElementById('btn-host-coop');
    const btnJoinCoop = document.getElementById('btn-join-coop');

    const btnRefreshServers = document.getElementById('btn-refresh-servers');
    if (btnRefreshServers) {
      btnRefreshServers.addEventListener('click', () => {
        if (Network.ws && Network.ws.readyState === WebSocket.OPEN) {
          Network.send({ type: 'GET_ROOMS' });
        } else {
          Network.init(this.game, () => {
            Network.send({ type: 'GET_ROOMS' });
          });
        }
      });
    }

    const checkPublic = document.getElementById('check-public-room');
    if (checkPublic) {
      checkPublic.addEventListener('change', () => {
        if (Network.mode === 'HOST') {
          Network.send({ type: 'SET_ROOM_PRIVACY', isPublic: checkPublic.checked });
        }
      });
    }

    if (btnHostCoop) {
      btnHostCoop.addEventListener('click', () => {
        const nameInput = document.getElementById('input-player-name');
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) {
          this.game.ui.gameUI.showInGameAlert("Please specify an active profile name first.", "NAME REQUIRED ⚠️");
          return;
        }
        localStorage.setItem('tds_player_username', name);
        
        Network.mode = 'HOST';
        window.lobbyPlayers = { p1: name + ` [Lv. ${this.game.playerLevel}]`, p2: "", p3: "", p4: "", p5: "", p6: "", p7: "", p8: "" };
        window.playerCursors = {};
        window.myPlayerId = "p1";

        const isPublicChecked = checkPublic ? checkPublic.checked : true;
        Network.hostRoom(name, isPublicChecked, (roomCode) => {
          this.showCoopLobbyState();
          Network.syncRoomPresence();
        });
      });
    }

    if (btnJoinCoop) {
      btnJoinCoop.addEventListener('click', () => {
        const nameInput = document.getElementById('input-player-name');
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) {
          this.game.ui.gameUI.showInGameAlert("Please specify an active profile name first.", "NAME REQUIRED ⚠️");
          return;
        }
        localStorage.setItem('tds_player_username', name);

        const inputJoinCode = document.getElementById('input-join-code');
        const code = inputJoinCode ? inputJoinCode.value.trim().toLowerCase() : "";
        if (!code) {
          this.game.ui.gameUI.showInGameAlert("Please enter a valid room code.", "CODE REQUIRED ⚠️");
          return;
        }

        Network.mode = 'CLIENT';

        Network.join(code, name, () => {
          this.showCoopLobbyState();
          Network.syncRoomPresence();
        }, false);
      });
    }

    const btnCopyCode = document.getElementById('btn-copy-code');
    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', () => {
        const rawCode = (Network.roomId || (Network.peer && Network.peer.id ? Network.peer.id : "")).toUpperCase();
        if (rawCode) {
          CrazyGamesManager.getInviteLink(rawCode.toLowerCase()).then((inviteUrl) => {
            navigator.clipboard.writeText(inviteUrl).then(() => {
              this.game.ui.gameUI.showInGameAlert("SQUAD INVITE LINK COPIED!\nShare it with your friends to play together.", "LINK COPIED ✓");
            }).catch(err => {
              console.error("Clipboard copy failed:", err);
            });
          });
        }
      });
    }

    const btnDisconnect = document.getElementById('btn-disconnect-coop');
    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', () => {
        Network.intentionalDisconnect = true;

        if (Network.connectionTimeout) clearTimeout(Network.connectionTimeout);
        if (Network.connectionWatchdog) clearTimeout(Network.connectionWatchdog);

        CrazyGamesManager.leaveRoomPresence();

        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has('roomId')) {
            url.searchParams.delete('roomId');
            window.history.replaceState({}, document.title, url.pathname + url.search);
          }
        } catch (e) {
          console.warn("Failed to clear URL parameters on disconnect:", e);
        }

        Network.disconnect();
        this.showSplashState();
      });
    }

    // STEP 1 -> STEP 2: Proceed to Difficulty Selection (Host only)
    const btnCoopNextDiff = document.getElementById('btn-coop-next-diff');
    if (btnCoopNextDiff) {
      btnCoopNextDiff.addEventListener('click', () => {
        if (Network.mode !== 'HOST') return;
        soundManager.playTick();

        // 1. FORCIBLY HIDE Co-op Room Panel completely
        const coopHeader = document.getElementById('coop-header-panel');
        if (coopHeader) {
          coopHeader.classList.add('hidden');
          coopHeader.style.setProperty('display', 'none', 'important');
        }

        // 2. FORCIBLY SHOW Step 2 (Difficulty Deck) for Host only
        const diffStep = document.getElementById('wizard-step-diff');
        if (diffStep) {
          diffStep.classList.remove('hidden');
          diffStep.classList.add('active');
          diffStep.style.setProperty('display', 'flex', 'important');
        }
        if (this.lobbyUI && this.lobbyUI.wizard) {
          this.lobbyUI.wizard.drawAllBossPreviews();
        }

        // Clients remain in the squad room viewing live map & difficulty cards
      });
    }

    // Co-op map selection cards with host broadcast
    const coopMapCards = document.querySelectorAll('.coop-map-card');
    coopMapCards.forEach(card => {
      card.addEventListener('click', () => {
        if (Network.mode !== 'HOST') return; // Only host can select
        coopMapCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const mapId = card.getAttribute('data-map-id');
        this.game.setSelectedMap(mapId);
        soundManager.playTick();

        // Sync selected map with teammates
        Network.broadcastToAll({
          type: 'COOP_MAP_SELECTED',
          selectedMap: mapId
        });
      });
    });
  }

  updateCoopPlayerList() {
    const listContainer = document.getElementById('coop-player-slots');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const slots = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    let count = 0;

    const avatarIcons = {
      p1: 'assets/ui/mouses/sprite_04.png',
      p2: 'assets/ui/mouses/sprite_09.png',
      p3: 'assets/ui/mouses/sprite_05.png',
      p4: 'assets/ui/mouses/sprite_01.png',
      p5: 'assets/ui/mouses/sprite_03.png',
      p6: 'assets/ui/mouses/sprite_02.png',
      p7: 'assets/ui/mouses/sprite_07.png',
      p8: 'assets/ui/mouses/sprite_08.png'
    };

    slots.forEach(slotId => {
      const nameText = window.lobbyPlayers[slotId] || "";
      const isCurrent = slotId === window.myPlayerId;
      const isHost = slotId === 'p1';

      if (nameText) {
        count++;
        const card = document.createElement('div');
        card.className = `coop-slot-card slot-occupied ${isCurrent ? 'slot-self' : ''}`;
        card.innerHTML = `
          <div class="slot-avatar-wrapper">
            <img src="${avatarIcons[slotId]}" class="slot-avatar-img" alt="" />
            <span class="slot-id-pill">${slotId.toUpperCase()}</span>
          </div>
          <div class="slot-info-col">
            <span class="slot-name">${nameText.split(" [")[0]}</span>
            <span class="slot-role-badge ${isHost ? 'role-host' : 'role-member'}">
              ${isHost ? '👑 LEADER' : '✓ READY'}
            </span>
          </div>
        `;
        listContainer.appendChild(card);
      } else {
        const card = document.createElement('div');
        card.className = 'coop-slot-card slot-empty';
        card.innerHTML = `
          <div class="slot-empty-icon">+</div>
          <span class="slot-empty-text">OPEN SLOT</span>
        `;
        listContainer.appendChild(card);
      }
    });

    const countLabel = document.getElementById('coop-count-label');
    if (countLabel) countLabel.textContent = `${count}/8`;
  }
}