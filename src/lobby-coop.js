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

    const coopPanel = document.createElement('div');
    coopPanel.id = 'coop-matchmaking-panel';
    coopPanel.className = 'hidden';
    coopPanel.style.cssText = `
      background: #fdfefe;
      border: 3px solid var(--border-color);
      border-radius: 12px;
      padding: 15px;
      margin: 12px 0 15px;
      box-shadow: 0 4px 0 var(--border-color);
    `;

    coopPanel.innerHTML = `
      <h3 style="font-family: var(--font-title); font-size: 1.15rem; margin-bottom: 10px; color: var(--text-dark); display: flex; align-items: center; gap: 8px;">
        <img src="https://img.icons8.com/color/48/groups.png" style="width:24px; height:24px;" /> CO-OP MULTIPLAYER LOBBY
      </h3>
      
      <div id="username-container" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
        <label for="input-player-name" style="font-size: 0.8rem; font-weight: 900; color: var(--text-muted); text-align: left;">PLAYER ACCOUNT NAME (REQUIRED TO PLAY CO-OP):</label>
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

      <div id="coop-setup-controls" style="display: flex; flex-wrap: wrap; gap: 10px;">
        <button id="btn-host-coop" class="btn" style="background: var(--primary-blue); color: #fff; flex: 1; font-size: 0.9rem;">HOST CO-OP SESSION</button>
        <div style="display: flex; flex: 1.2; gap: 6px; min-width: 220px;">
          <input type="text" id="input-join-code" placeholder="ENTER ROOM CODE" style="
            flex: 1;
            border: 3px solid var(--border-color);
            border-radius: 10px;
            padding: 8px 12px;
            font-size: 0.9rem;
            font-weight: 900;
            outline: none;
            text-transform: uppercase;
            text-align: center;
          " />
          <button id="btn-join-coop" class="btn" style="background: var(--primary-green); color: #fff; font-size: 0.9rem;">JOIN</button>
        </div>
      </div>

      <div id="coop-lobby-status-container" class="hidden" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: #eaedf2; padding: 10px; border-radius: 8px; border: 2px solid var(--border-color);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="label-room-code" style="font-weight: 900; font-size: 1.05rem; color: var(--text-dark);">ROOM CODE: ---</span>
            <button id="btn-copy-code" class="hidden" style="
              background: none;
              border: none;
              cursor: pointer;
              padding: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              outline: none;
            " title="Copy Platform Invitation Link">
              <img src="https://img.icons8.com/color/48/copy.png" style="width: 20px; height: 20px;" />
            </button>
          </div>
          <span id="label-lobby-status" style="font-weight: 900; font-size: 0.85rem; color: #7f8c8d; text-transform: uppercase;">OFFLINE</span>
        </div>

        <div style="background: #fff; border: 2px solid var(--border-color); border-radius: 8px; padding: 8px;">
          <h4 style="font-size: 0.8rem; font-weight: 900; color: var(--text-muted); border-bottom: 1.5px dashed #ccc; padding-bottom: 4px; margin-bottom: 6px;">SQUAD MEMBERS</h4>
          <div id="coop-player-slots" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-weight: 800; font-size: 0.85rem;"></div>
        </div>
        
        <button id="btn-disconnect-coop" class="btn" style="background: var(--primary-red); color: #fff; width: 100%; font-size: 0.85rem; padding: 6px 12px;">LEAVE CO-OP PARTY</button>
      </div>
    `;

    parentPanel.prepend(coopPanel);
    parentPanel.prepend(splashContainer);
  }

  showSplashState() {
    const splash = document.getElementById('lobby-splash-container');
    if (splash) splash.style.display = 'flex';
    
    const matchmaking = document.getElementById('coop-matchmaking-panel');
    if (matchmaking) matchmaking.classList.add('hidden');
    
    this.lobbyUI.toggleSoloElements(false);

    // Tutorial Step 0: Point to PLAY SOLO button
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

  initEventListeners() {
    const btnSelectSolo = document.getElementById('btn-select-solo');
    const btnSelectCoop = document.getElementById('btn-select-coop');

    if (btnSelectSolo) {
      btnSelectSolo.addEventListener('click', () => {
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
        
        const matchmaking = document.getElementById('coop-matchmaking-panel');
        if (matchmaking) matchmaking.classList.remove('hidden');
      });
    }

    const btnHostCoop = document.getElementById('btn-host-coop');
    const btnJoinCoop = document.getElementById('btn-join-coop');

    if (btnHostCoop) {
      btnHostCoop.addEventListener('click', () => {
        const nameInput = document.getElementById('input-player-name');
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) {
          alert("Please specify an active profile name first.");
          return;
        }
        localStorage.setItem('tds_player_username', name);
        
        Network.mode = 'HOST';
        window.lobbyPlayers.p1 = name + ` [Lv. ${this.game.playerLevel}]`;
        
        const coopControls = document.getElementById('coop-setup-controls');
        if (coopControls) coopControls.classList.add('hidden');
        
        const coopLobbyStatus = document.getElementById('coop-lobby-status-container');
        if (coopLobbyStatus) coopLobbyStatus.classList.remove('hidden');
        
        const usernameContainer = document.getElementById('username-container');
        if (usernameContainer) usernameContainer.style.display = 'none';
        
        const labelStatus = document.getElementById('label-lobby-status');
        if (labelStatus) {
          labelStatus.textContent = "ESTABLISHING SIGNAL...";
          labelStatus.style.color = "var(--primary-orange)";
        }

        if (Network.peer && Network.peer.id) {
          const roomCode = Network.peer.id.toUpperCase();
          const labelRoomCode = document.getElementById('label-room-code');
          if (labelRoomCode) labelRoomCode.textContent = `ROOM CODE: ${roomCode}`;
          
          const copyCodeBtn = document.getElementById('btn-copy-code');
          if (copyCodeBtn) copyCodeBtn.classList.remove('hidden');
          
          if (labelStatus) {
            labelStatus.textContent = "HOSTING LOBBY";
            labelStatus.style.color = "var(--primary-green-dark)";
          }
          this.updateCoopPlayerList();
          this.lobbyUI.toggleSoloElements(true);
          CrazyGamesManager.updateRoomPresence(roomCode.toLowerCase(), true);
        } else {
          Network.init(this.game, (id) => {
            const roomCode = id.toUpperCase();
            const labelRoomCode = document.getElementById('label-room-code');
            if (labelRoomCode) labelRoomCode.textContent = `ROOM CODE: ${roomCode}`;
            
            const copyCodeBtn = document.getElementById('btn-copy-code');
            if (copyCodeBtn) copyCodeBtn.classList.remove('hidden');
            
            if (labelStatus) {
              labelStatus.textContent = "HOSTING LOBBY";
              labelStatus.style.color = "var(--primary-green-dark)";
            }
            this.updateCoopPlayerList();
            this.lobbyUI.toggleSoloElements(true);
            CrazyGamesManager.updateRoomPresence(roomCode.toLowerCase(), true);
          });
        }
      });
    }

    if (btnJoinCoop) {
      btnJoinCoop.addEventListener('click', () => {
        const nameInput = document.getElementById('input-player-name');
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) {
          alert("Please specify an active profile name first.");
          return;
        }
        localStorage.setItem('tds_player_username', name);

        const inputJoinCode = document.getElementById('input-join-code');
        const code = inputJoinCode ? inputJoinCode.value.trim().toLowerCase() : "";
        if (!code) {
          alert("Please enter a valid room code.");
          return;
        }

        Network.mode = 'CLIENT';
        
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

        Network.join(code, name, () => {
          const labelRoomCode = document.getElementById('label-room-code');
          if (labelRoomCode) labelRoomCode.textContent = `CONNECTED TO HOST`;
          
          if (labelStatus) {
            labelStatus.textContent = "IN SQUAD (WAITING FOR HOST)";
            labelStatus.style.color = "var(--primary-blue)";
          }
          this.updateCoopPlayerList();
          this.lobbyUI.toggleSoloElements(false);
          CrazyGamesManager.updateRoomPresence(code, true);
        });
      });
    }

    const btnCopyCode = document.getElementById('btn-copy-code');
    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', () => {
        const rawCode = Network.peer ? Network.peer.id.toUpperCase() : "";
        if (rawCode) {
          CrazyGamesManager.getInviteLink(rawCode.toLowerCase()).then((inviteUrl) => {
            navigator.clipboard.writeText(inviteUrl).then(() => {
              this.game.effectManager.spawnText(400, 260, "SQUAD INVITE LINK COPIED!", '#2ecc71');
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
        CrazyGamesManager.leaveRoomPresence();
        location.reload();
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