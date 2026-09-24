// src/lobby-coop.js
// Sub-controller handling the Co-op Matchmaking UI, Connection controls, and player slot replication.

import { Network } from './network.js';
import { CrazyGamesManager } from './crazygames.js';

export class LobbyCoop {
  constructor(lobbyUI, game) {
    this.lobbyUI = lobbyUI;
    this.game = game;
  }

  injectCoopControls() {
    const parentPanel = document.getElementById('panel-maps');
    if (!parentPanel) return;

    if (!document.getElementById('coop-shake-style')) {
      const style = document.createElement('style');
      style.id = 'coop-shake-style';
      style.textContent = `
        @keyframes coopShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-8px); }
          40%, 80% { transform: translateX(8px); }
        }
        .shake-active {
          animation: coopShake 0.4s ease-in-out;
          border-color: var(--primary-red) !important;
          box-shadow: 0 0 8px rgba(231, 76, 60, 0.4);
        }
      `;
      document.head.appendChild(style);
    }

    const splashContainer = document.createElement('div');
    splashContainer.id = 'lobby-splash-container';
    splashContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 15px;
      padding: 30px 20px;
      text-align: center;
      background: #f8fafc;
      border: 3px solid var(--border-color);
      border-radius: 16px;
      margin: 15px 0;
      box-shadow: 0 6px 0 var(--border-color);
    `;
    splashContainer.innerHTML = `
      <h3 style="font-family: var(--font-title); font-size: 1.4rem; color: var(--text-dark);">SELECT GAMEPLAY MODE</h3>
      <p style="font-size: 0.9rem; color: var(--text-muted); max-width: 360px; margin: 0 auto; line-height: 1.4;">Equip loadouts and enter solo battlegrounds or create high-tactical co-op squad parties with friends!</p>
      <div style="display: flex; gap: 12px; width: 100%; max-width: 360px; justify-content: center; margin-top: 5px;">
        <button id="btn-select-solo" class="btn" style="flex: 1; padding: 10px; border-radius: 8px; font-size: 0.95rem; background: #fff; border: 3px solid var(--border-color); box-shadow: 0 4px 0 var(--border-color);">👤 PLAY SOLO</button>
        <button id="btn-select-coop" class="btn" style="flex: 1; padding: 10px; border-radius: 8px; font-size: 0.95rem; background: #fff; border: 3px solid var(--border-color); box-shadow: 0 4px 0 var(--border-color);">👥 CO-OP PARTY</button>
      </div>
    `;

    const coopPanelHeader = document.createElement('div');
    coopPanelHeader.id = 'coop-header-panel';
    coopPanelHeader.className = 'hidden';
    coopPanelHeader.style.cssText = `
      background: #fdfefe;
      border: 3px solid var(--border-color);
      border-radius: 12px;
      padding: 12px 15px;
      margin: 0 0 5px 0;
      box-shadow: 0 4px 0 var(--border-color);
    `;
    coopPanelHeader.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 2px dashed #ddd; padding-bottom: 6px;">
        <h3 style="font-family: var(--font-title); font-size: 1.15rem; color: var(--text-dark); display: flex; align-items: center; gap: 8px; margin: 0;">
          <img src="https://img.icons8.com/color/48/groups.png" style="width:24px; height:24px;" /> CO-OP MULTIPLAYER LOBBY
        </h3>
        <button id="btn-back-to-modes-coop" class="btn btn-secondary" style="font-size: 0.75rem; padding: 4px 10px; margin: 0;">⇠ CHANGE MODE</button>
      </div>
      
      <div id="username-container" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
        <label for="input-player-name" style="font-size: 0.8rem; font-weight: 900; color: var(--text-muted); text-align: left;">PLAYER ACCOUNT NAME (CO-OP USERNAME):</label>
        <input type="text" id="input-player-name" placeholder="ENTER YOUR ACCOUNT NAME FIRST" style="
          border: 3px solid var(--border-color);
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 0.9rem;
          font-weight: 900;
          outline: none;
          width: 100%;
          box-sizing: border-box;
          transition: border-color 0.2s;
        " />
      </div>

      <div id="coop-setup-controls" style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          <button id="btn-host-coop" class="btn" style="background: var(--primary-blue); color: #fff; flex: 1; font-size: 0.88rem;">HOST SQUAD</button>
          <div style="display: flex; flex: 1.3; gap: 6px; min-width: 200px;">
            <input type="text" id="input-join-code" placeholder="ROOM CODE" style="
              flex: 1;
              border: 3px solid var(--border-color);
              border-radius: 8px;
              padding: 6px 10px;
              font-size: 0.85rem;
              font-weight: 900;
              outline: none;
              text-transform: uppercase;
              text-align: center;
            " />
            <button id="btn-join-coop" class="btn" style="background: var(--primary-green); color: #fff; font-size: 0.85rem; padding: 6px 12px;">JOIN</button>
          </div>
        </div>

        <!-- SERVER BROWSER CONTAINER -->
        <div id="server-browser-panel" style="
          margin-top: 4px;
          background: #fff;
          border: 2px solid var(--border-color);
          border-radius: 8px;
          padding: 8px;
          max-height: 150px;
          overflow-y: auto;
        ">
          <div style="font-size: 0.72rem; font-weight: 900; color: var(--text-muted); border-bottom: 1.5px dashed #ccc; padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
            <span style="display: flex; align-items: center; gap: 6px;">ACTIVE PUBLIC SQUADS</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="label-server-count">0 SQUADS ONLINE</span>
              <button id="btn-refresh-servers" class="btn btn-secondary" style="font-size: 0.65rem; padding: 2px 7px; margin: 0; min-height: 22px;">🔄 REFRESH</button>
            </div>
          </div>
          <div id="server-browser-list" style="display: flex; flex-direction: column; gap: 4px;">
            <div style="color: #7f8c8d; font-size: 0.75rem; text-align: center; padding: 8px;">Searching for active squads...</div>
          </div>
        </div>
      </div>

      <div id="coop-lobby-status-container" class="hidden" style="display: flex; justify-content: space-between; align-items: center; background: #eaedf2; padding: 10px; border-radius: 8px; border: 2px solid var(--border-color); flex-wrap: wrap; gap: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span id="label-room-code" style="font-weight: 900; font-size: 1.05rem; color: var(--text-dark);">ROOM CODE: ---</span>
          <button id="btn-copy-code" class="hidden" style="background: none; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; outline: none;" title="Copy Platform Invitation Link">
            <img src="https://img.icons8.com/color/48/copy.png" style="width: 20px; height: 20px;" />
          </button>
        </div>
        
        <!-- SQUAD LEADER ONLY PRIVACY TOGGLE -->
        <div id="host-privacy-container" class="hidden" style="display: flex; align-items: center; gap: 6px; background: #fff; padding: 3px 8px; border-radius: 6px; border: 1.5px solid var(--border-color);">
          <input type="checkbox" id="check-public-room" checked style="width: 15px; height: 15px; cursor: pointer;" />
          <label for="check-public-room" style="font-size: 0.72rem; font-weight: 900; color: var(--text-dark); cursor: pointer; user-select: none;">
            🌐 PUBLIC LOBBY
          </label>
        </div>

        <span id="label-lobby-status" style="font-weight: 900; font-size: 0.85rem; color: #7f8c8d; text-transform: uppercase;">OFFLINE</span>
      </div>
    `;

    const coopPanelFooter = document.createElement('div');
    coopPanelFooter.id = 'coop-footer-panel';
    coopPanelFooter.className = 'hidden';
    coopPanelFooter.style.cssText = `
      background: #fdfefe;
      border: 3px solid var(--border-color);
      border-radius: 12px;
      padding: 12px 15px;
      margin: 10px 0 0 0;
      box-shadow: 0 4px 0 var(--border-color);
    `;
    coopPanelFooter.innerHTML = `
      <div style="background: #fff; border: 2px solid var(--border-color); border-radius: 8px; padding: 8px; margin-bottom: 10px;">
        <h4 style="font-size: 0.8rem; font-weight: 900; color: var(--text-muted); border-bottom: 1.5px dashed #ccc; padding-bottom: 4px; margin-bottom: 6px;">SQUAD MEMBERS</h4>
        <div id="coop-player-slots" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-weight: 800; font-size: 0.85rem;"></div>
      </div>
      <button id="btn-disconnect-coop" class="btn" style="background: var(--primary-red); color: #fff; width: 100%; font-size: 0.85rem; padding: 6px 12px;">LEAVE CO-OP PARTY</button>
    `;

    parentPanel.prepend(coopPanelHeader);
    parentPanel.appendChild(splashContainer);
    parentPanel.appendChild(coopPanelFooter);
  }

  showSplashState() {
    const splash = document.getElementById('lobby-splash-container');
    if (splash) splash.style.display = 'flex';
    
    const matchmakingHeader = document.getElementById('coop-header-panel');
    if (matchmakingHeader) matchmakingHeader.classList.add('hidden');

    const matchmakingFooter = document.getElementById('coop-footer-panel');
    if (matchmakingFooter) {
      matchmakingFooter.classList.add('hidden');
      matchmakingFooter.style.display = 'none';
    }

    const coopControls = document.getElementById('coop-setup-controls');
    if (coopControls) coopControls.classList.remove('hidden');

    const coopLobbyStatus = document.getElementById('coop-lobby-status-container');
    if (coopLobbyStatus) coopLobbyStatus.classList.add('hidden');

    const usernameContainer = document.getElementById('username-container');
    if (usernameContainer) usernameContainer.style.display = 'flex';

    const nameInput = document.getElementById('input-player-name');
    if (nameInput) {
      nameInput.disabled = !!CrazyGamesManager.currentUser;
    }

    const labelRoomCode = document.getElementById('label-room-code');
    if (labelRoomCode) labelRoomCode.textContent = 'ROOM CODE: ---';

    const copyCodeBtn = document.getElementById('btn-copy-code');
    if (copyCodeBtn) copyCodeBtn.classList.add('hidden');

    const labelStatus = document.getElementById('label-lobby-status');
    if (labelStatus) {
      labelStatus.textContent = 'OFFLINE';
      labelStatus.style.color = '#7f8c8d';
    }

    const joinCodeInput = document.getElementById('input-join-code');
    if (joinCodeInput) joinCodeInput.value = '';

    this.lobbyUI.toggleSoloElements(false);

    if (!this.game.tutorialCompleted) {
      this.lobbyUI.parentUI.hidePointer();
      setTimeout(() => {
        const playSoloBtn = document.getElementById('btn-select-solo');
        if (playSoloBtn) {
          this.lobbyUI.parentUI.showPointerAt(playSoloBtn, 'down');
          playSoloBtn.classList.add('tut-highlight');
        }
      }, 400);
    }
  }

  showCoopLobbyState() {
    const splash = document.getElementById('lobby-splash-container');
    if (splash) splash.style.display = 'none';

    const matchmakingHeader = document.getElementById('coop-header-panel');
    if (matchmakingHeader) matchmakingHeader.classList.remove('hidden');

    const matchmakingFooter = document.getElementById('coop-footer-panel');
    if (matchmakingFooter) {
      matchmakingFooter.classList.remove('hidden');
      matchmakingFooter.style.display = 'block';
    }

    const coopControls = document.getElementById('coop-setup-controls');
    if (coopControls) coopControls.classList.add('hidden');

    const coopLobbyStatus = document.getElementById('coop-lobby-status-container');
    if (coopLobbyStatus) coopLobbyStatus.classList.remove('hidden');

    const usernameContainer = document.getElementById('username-container');
    if (usernameContainer) usernameContainer.style.display = 'none';

    const labelRoomCode = document.getElementById('label-room-code');
    if (labelRoomCode && Network.roomId) {
      labelRoomCode.textContent = `ROOM CODE: ${Network.roomId.toUpperCase()}`;
    }

    const copyCodeBtn = document.getElementById('btn-copy-code');
    if (copyCodeBtn) copyCodeBtn.classList.remove('hidden');

    const labelStatus = document.getElementById('label-lobby-status');
    const hostPrivacyBox = document.getElementById('host-privacy-container');

    if (Network.mode === 'HOST') {
      if (hostPrivacyBox) hostPrivacyBox.classList.remove('hidden');
      if (labelStatus) {
        labelStatus.textContent = "HOSTING SQUAD LOBBY";
        labelStatus.style.color = "var(--primary-green-dark)";
      }
      this.lobbyUI.toggleSoloElements(true);
    } else {
      if (hostPrivacyBox) hostPrivacyBox.classList.add('hidden');
      if (labelStatus) {
        labelStatus.textContent = "IN SQUAD (WAITING FOR LEADER)";
        labelStatus.style.color = "var(--primary-blue)";
      }
      this.lobbyUI.toggleSoloElements(false);
    }

    this.updateCoopPlayerList();
  }

  renderServerBrowser(rooms) {
    const listEl = document.getElementById('server-browser-list');
    const countEl = document.getElementById('label-server-count');
    if (!listEl) return;

    if (countEl) countEl.textContent = `${rooms.length} SQUAD${rooms.length === 1 ? '' : 'S'} ONLINE`;

    if (!rooms || rooms.length === 0) {
      listEl.innerHTML = `
        <div style="color: #7f8c8d; font-size: 0.75rem; text-align: center; padding: 10px;">
          No public squads active right now.<br/>Host one above to lead your own squad!
        </div>
      `;
      return;
    }

    listEl.innerHTML = rooms.map(r => {
      const isFull = r.players >= r.maxPlayers;
      const mapLabel = (r.map || 'Grassland').replace('_', ' ').toUpperCase();
      const statusColor = r.inGame ? '#e67e22' : '#2ecc71';
      const statusText = r.inGame ? 'IN BATTLE' : 'IN LOBBY';

      return `
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border: 1.5px solid var(--border-color);
          border-radius: 6px;
          padding: 5px 8px;
          font-size: 0.75rem;
          font-weight: 800;
        ">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-family: var(--font-title); font-size: 0.85rem; color: var(--primary-blue);">${r.id}</span>
              <span style="color: var(--text-dark);">${r.hostName}</span>
              <span style="font-size: 0.65rem; color: #fff; background: ${statusColor}; padding: 1px 4px; border-radius: 3px;">${statusText}</span>
            </div>
            <span style="font-size: 0.65rem; color: #7f8c8d;">MAP: ${mapLabel} | PLAYERS: ${r.players}/${r.maxPlayers}</span>
          </div>
          <button class="btn btn-primary btn-quick-join" data-code="${r.id}" ${isFull ? 'disabled' : ''} style="
            font-size: 0.68rem;
            padding: 4px 10px;
            margin: 0;
            background: ${isFull ? '#bdc3c7' : 'var(--primary-green)'};
          ">${isFull ? 'FULL' : 'JOIN'}</button>
        </div>
      `;
    }).join('');

    // Attach 1-click Join listeners
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
    const coopControls = document.getElementById('coop-setup-controls');
    if (coopControls) coopControls.classList.remove('hidden');

    const coopLobbyStatus = document.getElementById('coop-lobby-status-container');
    if (coopLobbyStatus) coopLobbyStatus.classList.add('hidden');

    const coopLobbyFooter = document.getElementById('coop-footer-panel');
    if (coopLobbyFooter) {
      coopLobbyFooter.classList.add('hidden');
      coopLobbyFooter.style.display = 'none';
    }

    const usernameContainer = document.getElementById('username-container');
    if (usernameContainer) usernameContainer.style.display = 'flex';

    const labelStatus = document.getElementById('label-lobby-status');
    if (labelStatus) {
      labelStatus.textContent = 'OFFLINE';
      labelStatus.style.color = '#7f8c8d';
    }

    const inputJoinCode = document.getElementById('input-join-code');
    if (inputJoinCode) {
      inputJoinCode.disabled = false;
      inputJoinCode.focus();
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
      btnSelectSolo.addEventListener('click', () => {
        // If the player was previously hosting or connected to a room, disconnect cleanly
        if (Network.mode !== 'OFFLINE') {
          Network.disconnect();
        }
        Network.mode = 'OFFLINE';
        const splash = document.getElementById('lobby-splash-container');
        if (splash) splash.style.display = 'none';
        this.lobbyUI.toggleSoloElements(true);
      });
    }

    if (btnSelectCoop) {
      btnSelectCoop.addEventListener('click', () => {
        const splash = document.getElementById('lobby-splash-container');
        if (splash) splash.style.display = 'none';
        
        const matchmakingHeader = document.getElementById('coop-header-panel');
        if (matchmakingHeader) matchmakingHeader.classList.remove('hidden');

        // Ensure connection is active and fetch fresh public squads immediately
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

    // Host live privacy toggle
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
        
        const coopControls = document.getElementById('coop-setup-controls');
        if (coopControls) coopControls.classList.add('hidden');
        
        const coopLobbyStatus = document.getElementById('coop-lobby-status-container');
        if (coopLobbyStatus) coopLobbyStatus.classList.remove('hidden');

        // Show Public toggle ONLY to the Host
        const hostPrivacyBox = document.getElementById('host-privacy-container');
        if (hostPrivacyBox) hostPrivacyBox.classList.remove('hidden');

        const coopLobbyFooter = document.getElementById('coop-footer-panel');
        if (coopLobbyFooter) {
          coopLobbyFooter.classList.remove('hidden');
          coopLobbyFooter.style.display = 'block';
        }
        
        const usernameContainer = document.getElementById('username-container');
        if (usernameContainer) usernameContainer.style.display = 'none';
        
        const labelStatus = document.getElementById('label-lobby-status');
        if (labelStatus) {
          labelStatus.textContent = "ESTABLISHING SIGNAL...";
          labelStatus.style.color = "var(--primary-orange)";
        }

        const isPublicChecked = checkPublic ? checkPublic.checked : true;
        Network.hostRoom(name, isPublicChecked, (roomCode) => {
          const labelRoomCode = document.getElementById('label-room-code');
          if (labelRoomCode) labelRoomCode.textContent = `ROOM CODE: ${roomCode}`;
          
          const copyCodeBtn = document.getElementById('btn-copy-code');
          if (copyCodeBtn) copyCodeBtn.classList.remove('hidden');
          
          if (labelStatus) {
            labelStatus.textContent = "HOSTING SQUAD LOBBY";
            labelStatus.style.color = "var(--primary-green-dark)";
          }
          this.updateCoopPlayerList();
          this.lobbyUI.toggleSoloElements(true);
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

        Network.join(code, name, () => {
          const hostPrivacyBox = document.getElementById('host-privacy-container');
          if (hostPrivacyBox) hostPrivacyBox.classList.add('hidden'); // Hidden for squad members

          const labelRoomCode = document.getElementById('label-room-code');
          if (labelRoomCode) labelRoomCode.textContent = `ROOM CODE: ${code.toUpperCase()}`;

          // Unhide the copy link button for joined players
          const copyCodeBtn = document.getElementById('btn-copy-code');
          if (copyCodeBtn) copyCodeBtn.classList.remove('hidden');
          
          if (labelStatus) {
            labelStatus.textContent = "IN SQUAD (WAITING FOR LEADER)";
            labelStatus.style.color = "var(--primary-blue)";
          }
          this.updateCoopPlayerList();
          this.lobbyUI.toggleSoloElements(false);
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

        // Notify CrazyGames platform that player left room cleanly without any redundant updates
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
  }

  updateCoopPlayerList() {
    const listContainer = document.getElementById('coop-player-slots');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    const slots = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    
    slots.forEach(slotId => {
      const nameText = window.lobbyPlayers[slotId] || "";
      const isCurrent = slotId === window.myPlayerId;
      
      if (nameText) {
        const div = document.createElement('div');
        div.style.cssText = `
          padding: 4px 8px;
          border-radius: 6px;
          background: ${isCurrent ? '#e3f2fd' : '#f0f2f5'};
          border: 1.5px solid ${isCurrent ? 'var(--primary-blue)' : 'var(--border-color)'};
          color: ${isCurrent ? 'var(--primary-blue-dark)' : 'var(--text-dark)'};
          display: flex;
          justify-content: space-between;
        `;
        div.innerHTML = `
          <span>${slotId.toUpperCase()}: ${nameText.split(" [")[0]}</span>
          <span style="font-size:0.75rem; color:#7f8c8d;">${nameText.includes("[Lv.") ? "[Lv." + nameText.split("[Lv.")[1] : ""}</span>
        `;
        listContainer.appendChild(div);
      } else {
        const div = document.createElement('div');
        div.style.cssText = `
          padding: 4px 8px;
          border-radius: 6px;
          border: 1.5px dashed #ccc;
          color: #bdc3c7;
          text-align: center;
        `;
        div.innerText = `${slotId.toUpperCase()}: EMPTY`;
        listContainer.appendChild(div);
      }
    });
  }
}