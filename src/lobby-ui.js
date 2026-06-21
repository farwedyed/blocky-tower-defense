// src/lobby-ui.js
// Sub-controller handling the Main Menu, Progression, Shop, Crates, and Loadouts

import { soundManager } from './sound.js';
import { fetchTopRecords } from './firebase.js';
import { Network } from './network.js';
import { CrazyGamesManager } from './crazygames.js';

export class LobbyUI {
  constructor(game, parentUI) {
    this.game = game;
    this.parentUI = parentUI; // Reference back to the parent orchestrator

    // Cache Lobby DOM Elements
    this.lobbyView = document.getElementById('lobby-view');
    this.playerLevel = document.getElementById('player-level');
    this.playerCoins = document.getElementById('player-coins');
    this.playerCoinsVal = document.getElementById('player-coins-val');
    this.playerXpFill = document.getElementById('player-xp-fill');
    this.playerXpText = document.getElementById('player-xp-text');

    this.tabButtons = document.querySelectorAll('.tab-btn');
    this.lobbyPanels = document.querySelectorAll('.lobby-panel');
    this.mapCards = document.querySelectorAll('.map-card');
    this.shopCards = document.querySelectorAll('.shop-card');

    this.btnDeploy = document.getElementById('btn-deploy');
    this.loadoutGrid = document.getElementById('loadout-selection-grid');

    // CrazyGames Profile DOM bindings
    this.cgProfileWidget = document.getElementById('cg-profile-widget');
    this.cgAvatar = document.getElementById('cg-avatar');
    this.cgUsername = document.getElementById('cg-username');
    this.btnCgAuth = document.getElementById('btn-cg-auth');

    this.injectCoopControls();
    this.injectTutorialStyles();
    
    // Cache Difficulty Buttons
    this.diffButtons = document.querySelectorAll('.diff-btn');

    this.initEventListeners();
    this.drawAllStaticPreviews();

    // Sync CrazyGames Auth Status
    CrazyGamesManager.onAuthChanged((user) => {
      this.updateCgProfileUI(user);
    });

    // Default Lobby UI to clean Splash State on startup
    this.showSplashState();
  }

  injectTutorialStyles() {
    if (document.getElementById('tutorial-visual-styles')) return;
    const style = document.createElement('style');
    style.id = 'tutorial-visual-styles';
    style.textContent = `
      @keyframes pulseTutorialHighlight {
        0% { box-shadow: 0 0 0 0 rgba(241, 196, 15, 0.8); border-color: #f1c40f !important; }
        70% { box-shadow: 0 0 0 12px rgba(241, 196, 15, 0); border-color: #f1c40f !important; }
        100% { box-shadow: 0 0 0 0 rgba(241, 196, 15, 0); border-color: #f1c40f !important; }
      }
      @keyframes tutArrowBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      @keyframes tutArrowBounceLeft {
        0%, 100% { transform: translateX(0) rotate(-90deg); }
        50% { transform: translateX(-10px) rotate(-90deg); }
      }
      @keyframes tutArrowBounceRight {
        0%, 100% { transform: translateX(0) rotate(90deg); }
        50% { transform: translateX(10px) rotate(90deg); }
      }
      .tut-highlight {
        animation: pulseTutorialHighlight 1.6s infinite !important;
        border: 3px solid #f1c40f !important;
        position: relative;
        z-index: 9999 !important;
      }
    `;
    document.head.appendChild(style);
  }

  updateCgProfileUI(user) {
    if (user) {
      if (this.cgUsername) this.cgUsername.textContent = user.username;
      if (this.cgAvatar && user.profilePictureUrl) {
        this.cgAvatar.src = user.profilePictureUrl;
      }
      if (this.btnCgAuth) {
        this.btnCgAuth.style.display = 'none';
      }
      
      const nameInput = document.getElementById('input-player-name');
      if (nameInput) {
        nameInput.value = user.username;
      }
    } else {
      if (this.cgUsername) this.cgUsername.textContent = "Guest Player";
      if (this.cgAvatar) this.cgAvatar.src = "https://img.icons8.com/color/48/user-male-circle.png";
      if (this.btnCgAuth) {
        this.btnCgAuth.style.display = 'block';
      }
    }
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

    const h2 = parentPanel.querySelector('h2');
    
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

    if (h2) {
      h2.insertAdjacentElement('afterend', splashContainer);
      splashContainer.insertAdjacentElement('afterend', coopPanel);
    } else {
      parentPanel.prepend(coopPanel);
      parentPanel.prepend(splashContainer);
    }
  }

  showSplashState() {
    document.getElementById('lobby-splash-container').style.display = 'flex';
    document.getElementById('coop-matchmaking-panel').classList.add('hidden');
    this.toggleSoloElements(false);
  }

  toggleSoloElements(visible) {
    const parentPanel = document.getElementById('panel-maps');
    if (!parentPanel) return;

    const grid = parentPanel.querySelector('.map-grid');
    const diffSelector = document.getElementById('difficulty-selector-container');
    const hc = document.getElementById('hardcore-toggle-container');
    const deploy = document.getElementById('btn-deploy');
    const leaderboard = document.getElementById('leaderboard-box');
    const bottomBoxes = leaderboard ? leaderboard.parentElement : null;

    const displayStyle = visible ? 'grid' : 'none';
    const flexStyle = visible ? 'flex' : 'none';
    const blockStyle = visible ? 'block' : 'none';

    if (grid) grid.style.display = displayStyle;
    if (diffSelector) diffSelector.style.display = flexStyle;
    if (hc) hc.style.display = flexStyle;
    if (deploy) deploy.style.display = blockStyle;
    if (bottomBoxes) bottomBoxes.style.display = flexStyle;
  }

  initEventListeners() {
    if (this.btnCgAuth) {
      this.btnCgAuth.addEventListener('click', () => {
        CrazyGamesManager.promptAuth();
      });
    }

    // Difficulty Button Click Listener
    this.diffButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.diffButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const diff = btn.getAttribute('data-difficulty');
        this.game.selectedDifficulty = diff;
        soundManager.playTick();
      });
    });

    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const targetPanelId = btn.getAttribute('data-target');
        this.lobbyPanels.forEach(panel => {
          panel.classList.remove('active');
          if (panel.id === targetPanelId) {
            panel.classList.add('active');
          }
        });

        this.parentUI.hidePointer();
        document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));

        if (targetPanelId === 'panel-loadout') {
          this.renderLoadoutConfig();
        }
      });
    });

    const btnSelectSolo = document.getElementById('btn-select-solo');
    const btnSelectCoop = document.getElementById('btn-select-coop');

    if (btnSelectSolo) {
      btnSelectSolo.addEventListener('click', () => {
        Network.mode = 'OFFLINE';
        document.getElementById('lobby-splash-container').style.display = 'none';
        this.toggleSoloElements(true);
      });
    }

    if (btnSelectCoop) {
      btnSelectCoop.addEventListener('click', () => {
        document.getElementById('lobby-splash-container').style.display = 'none';
        document.getElementById('coop-matchmaking-panel').classList.remove('hidden');
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
        document.getElementById('coop-setup-controls').classList.add('hidden');
        document.getElementById('coop-lobby-status-container').classList.remove('hidden');
        document.getElementById('username-container').style.display = 'none';
        
        const labelStatus = document.getElementById('label-lobby-status');
        labelStatus.textContent = "ESTABLISHING SIGNAL...";
        labelStatus.style.color = "var(--primary-orange)";

        if (Network.peer && Network.peer.id) {
          const roomCode = Network.peer.id.toUpperCase();
          document.getElementById('label-room-code').textContent = `ROOM CODE: ${roomCode}`;
          document.getElementById('btn-copy-code').classList.remove('hidden');
          labelStatus.textContent = "HOSTING LOBBY";
          labelStatus.style.color = "var(--primary-green-dark)";
          this.updateCoopPlayerList();
          this.toggleSoloElements(true);
          CrazyGamesManager.updateRoomPresence(roomCode.toLowerCase(), true);
        } else {
          Network.init(this.game, (id) => {
            const roomCode = id.toUpperCase();
            document.getElementById('label-room-code').textContent = `ROOM CODE: ${roomCode}`;
            document.getElementById('btn-copy-code').classList.remove('hidden');
            labelStatus.textContent = "HOSTING LOBBY";
            labelStatus.style.color = "var(--primary-green-dark)";
            this.updateCoopPlayerList();
            this.toggleSoloElements(true);
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
        document.getElementById('coop-setup-controls').classList.add('hidden');
        document.getElementById('coop-lobby-status-container').classList.remove('hidden');
        document.getElementById('username-container').style.display = 'none';
        
        const labelStatus = document.getElementById('label-lobby-status');
        labelStatus.textContent = "CONNECTING...";
        labelStatus.style.color = "var(--primary-orange)";

        Network.join(code, name, () => {
          document.getElementById('label-room-code').textContent = `CONNECTED TO HOST`;
          labelStatus.textContent = "IN SQUAD (WAITING FOR HOST)";
          labelStatus.style.color = "var(--primary-blue)";
          this.updateCoopPlayerList();
          this.toggleSoloElements(false);
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

    this.mapCards.forEach(card => {
      card.addEventListener('click', () => {
        this.mapCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const mapId = card.getAttribute('data-map-id');
        this.game.setSelectedMap(mapId);
        this.renderLeaderboard(mapId);
      });
    });

    const btnBuyCrates = document.querySelectorAll('.btn-buy-crate');
    btnBuyCrates.forEach(btn => {
      btn.addEventListener('click', () => {
        const crateType = btn.getAttribute('data-crate');
        this.game.buyCrate(crateType);
      });
    });

    if (this.btnDeploy) {
      this.btnDeploy.addEventListener('click', () => {
        this.game.deployToMatch();
      });
    }

    const btnCloseReveal = document.getElementById('btn-close-reveal');
    if (btnCloseReveal) {
      btnCloseReveal.addEventListener('click', () => {
        this.updateLobbyMeta(this.game.playerLevel, this.game.playerXp, this.game.playerCoins);
        this.drawAllStaticPreviews();

        const overlay = document.getElementById('crate-opening-overlay');
        if (overlay) overlay.classList.add('hidden');
        const revealCard = document.getElementById('crate-reveal-card');
        if (revealCard) revealCard.classList.add('hidden');
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

  updateLobbyMeta(level, xp, coins) {
    if (this.playerLevel) this.playerLevel.textContent = level;
    if (this.playerCoinsVal) {
      this.playerCoinsVal.textContent = coins;
    } else if (this.playerCoins) {
      const valEl = document.getElementById('player-coins-val');
      if (valEl) {
        valEl.textContent = coins;
      } else {
        this.playerCoins.textContent = `🪙 ${coins}`;
      }
    }

    const nextLevelXp = level * 100;
    const percent = Math.min(100, (xp / nextLevelXp) * 100);
    if (this.playerXpFill) this.playerXpFill.style.width = `${percent}%`;
    if (this.playerXpText) this.playerXpText.textContent = `${xp} / ${nextLevelXp}`;

    const cyberCard = document.querySelector('[data-map-id="cyber_city"]');
    if (cyberCard) {
      if (level < 5) {
        cyberCard.style.opacity = '0.5';
        cyberCard.style.pointerEvents = 'none';
        const info = cyberCard.querySelector('.difficulty');
        if (info) info.textContent = "LOCKED (REQ. LVL 5)";
      } else {
        cyberCard.style.opacity = '1.0';
        cyberCard.style.pointerEvents = 'auto';
      }
    }

    const fallenCard = document.querySelector('[data-map-id="fallen_outpost"]');
    if (fallenCard) {
      if (level < 10) {
        fallenCard.style.opacity = '0.5';
        fallenCard.style.pointerEvents = 'none';
        const info = fallenCard.querySelector('.difficulty');
        if (info) info.textContent = "LOCKED (REQ. LVL 10)";
      } else {
        fallenCard.style.opacity = '1.0';
        fallenCard.style.pointerEvents = 'auto';
      }
    }

    const hcToggle = document.getElementById('hardcore-toggle');
    const hcLabel = document.querySelector('label[for="hardcore-toggle"]');
    if (hcToggle && hcLabel) {
      if (level < 15) {
        hcToggle.disabled = true;
        hcLabel.style.color = '#7f8c8d';
        hcLabel.textContent = "🔥 HARDCORE MODE (LOCKED - REQ. LVL 15)";
      } else {
        hcToggle.disabled = false;
        hcLabel.style.color = '#e74c3c';
        hcLabel.textContent = "🔥 ACTIVATE HARDCORE MODE (10 Lives, $250 Cash, +20% Cost, 3x Victory Coins/XP)";
      }
    }

    this.shopCards.forEach(card => {
      const type = card.getAttribute('data-agent-type');
      if (!type) return;
      const isUnlocked = this.game.unlockedAgents.includes(type);
      const btn = card.querySelector('.btn-shop-action');
      const costText = card.querySelector('.cost-text');

      if (isUnlocked) {
        card.classList.remove('locked');
        card.classList.add('purchased');
        if (costText) {
          costText.textContent = "UNLOCKED";
          costText.style.color = "var(--primary-green-dark)";
        }
        if (btn) {
          btn.textContent = "UNLOCKED";
          btn.disabled = true;
          btn.style.opacity = '1.0';
        }
      } else {
        card.classList.add('locked');
        card.classList.remove('purchased');
        if (costText) {
          costText.textContent = "LOCKED - UNBOX TO UNLOCK";
          costText.style.color = "#e74c3c";
        }
        if (btn) {
          btn.textContent = "LOCKED";
          btn.disabled = true;
          btn.style.opacity = '0.5';
        }
      }
    });

    const crateButtons = document.querySelectorAll('.btn-buy-crate');
    crateButtons.forEach(btn => {
      const crateType = btn.getAttribute('data-crate');
      let cost = 150;
      if (crateType === 'elite') cost = 350;
      else if (crateType === 'deluxe') cost = 500;

      if (coins < cost) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
      } else {
        btn.disabled = false;
        btn.style.opacity = '1.0';
      }
    });

    this.updateCoopPlayerList();
  }

  renderLoadoutConfig() {
    this.loadoutGrid.innerHTML = '';
    const allAgentTypes = ['scout', 'minigunner', 'commander', 'dj', 'pyromancer', 'farm', 'soldier', 'gladiator', 'sniper', 'medic', 'rocketeer'];

    allAgentTypes.forEach(type => {
      const isUnlocked = this.game.unlockedAgents.includes(type);
      if (!isUnlocked) return;

      const isEquipped = this.game.equippedAgents.includes(type);
      const card = document.createElement('div');
      card.className = `loadout-card ${isEquipped ? 'equipped' : ''}`;

      const prefix = type + '_';
      const skins = this.game.ownedSkins.filter(s => s.startsWith(prefix));
      const currentEquippedSkin = this.game.equippedSkins[type] || 'default';

      let selectHtml = '';
      if (skins.length > 0) {
        selectHtml = `<div class="skin-select-container" style="margin-top: 8px;">
          <span style="font-size: 0.7rem; color: #7f8c8d;">SKIN: </span>
          <select class="skin-select styled-select" style="font-size: 0.75rem; font-weight: 900; color: var(--primary-blue-dark);">
            <option value="default">DEFAULT</option>
            ${skins.map(s => `<option value="${s}" ${currentEquippedSkin === s ? 'selected' : ''}>${s.split('_')[1].toUpperCase()}</option>`).join('')}
          </select>
        </div>`;
      }

      card.innerHTML = `
        <div class="icon"><canvas width="55" height="55" data-agent-type="${type}"></canvas></div>
        <div class="agent-info" style="margin-top:6px; text-align:center;">
          <span class="name" style="font-size:0.85rem; font-weight:900;">${type.toUpperCase()}</span>
        </div>
        ${isEquipped ? '<span class="equipped-indicator">EQUIPPED</span>' : ''}
        ${selectHtml}
      `;

      const cvs = card.querySelector('canvas');
      this.drawAgentPreview(cvs, type);

      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
        this.game.toggleLoadoutAgent(type);
        this.renderLoadoutConfig();
      });

      const selector = card.querySelector('.skin-select');
      if (selector) {
        selector.addEventListener('change', (e) => {
          this.game.equippedSkins[type] = e.target.value;
          this.game.saveStatsToStorage();
          this.drawAgentPreview(cvs, type);
        });
      }

      this.loadoutGrid.appendChild(card);
    });
  }

  drawAllStaticPreviews() {
    this.mapCards.forEach(card => {
      const canvas = card.querySelector('.map-preview-canvas');
      const mapId = card.getAttribute('data-map-id');
      if (canvas && mapId) {
        this.drawMapPreview(canvas, mapId);
      }
    });

    this.shopCards.forEach(card => {
      const canvas = card.querySelector('.agent-preview-canvas');
      const type = card.getAttribute('data-agent-type');
      if (canvas && type) {
        this.drawAgentPreview(canvas, type);
      }
    });
  }

  drawMapPreview(canvas, mapId) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;

    let terrainColor = '#7dcd40';
    let pathColor = '#dfc39e';
    let borderOutlineColor = '#222';
    if (mapId === 'desert') {
      terrainColor = '#f9e79f';
      pathColor = '#e5c494';
    } else if (mapId === 'tundra') {
      terrainColor = '#ebf5fb';
      pathColor = '#d4e6f1';
    } else if (mapId === 'cyber_city') {
      terrainColor = '#0a1628';
      pathColor = '#1e3a4a';
      borderOutlineColor = '#00ffe0';
    } else if (mapId === 'fallen_outpost') {
      terrainColor = '#c8a96e';
      pathColor = '#8b6914';
    }

    ctx.fillStyle = terrainColor;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = borderOutlineColor;
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.35);
    ctx.lineTo(w * 0.4, h * 0.35);
    ctx.lineTo(w * 0.4, h * 0.7);
    ctx.lineTo(w * 0.75, h * 0.7);
    ctx.lineTo(w * 0.75, h * 0.25);
    ctx.lineTo(w, h * 0.25);
    ctx.stroke();

    ctx.strokeStyle = pathColor;
    ctx.lineWidth = 12;
    ctx.stroke();

    ctx.lineWidth = 2.5;
    if (mapId === 'grassland') {
      ctx.fillStyle = '#784212';
      ctx.fillRect(20, 48, 3, 6);
      ctx.fillStyle = '#1e8449';
      ctx.beginPath();
      ctx.moveTo(21.5, 38);
      ctx.lineTo(27, 48);
      ctx.lineTo(16, 48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#784212';
      ctx.fillRect(95, 74, 3, 6);
      ctx.fillStyle = '#1e8449';
      ctx.beginPath();
      ctx.moveTo(96.5, 64);
      ctx.lineTo(102, 74);
      ctx.lineTo(91, 74);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (mapId === 'desert') {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(95, 38, 4, 12);
      ctx.strokeRect(95, 38, 4, 12);
      ctx.fillRect(91, 42, 4, 3);
      ctx.fillRect(91, 39, 3, 4);
      ctx.fillRect(99, 44, 4, 3);
      ctx.fillRect(101, 41, 3, 4);
    } else if (mapId === 'tundra') {
      ctx.fillStyle = '#5c3a21';
      ctx.fillRect(20, 48, 3, 6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(21.5, 36);
      ctx.lineTo(27, 48);
      ctx.lineTo(16, 48);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (mapId === 'cyber_city') {
      ctx.fillStyle = '#00ffe0';
      ctx.fillRect(20, 40, 4, 12);
      ctx.strokeRect(20, 40, 4, 12);
    } else if (mapId === 'fallen_outpost') {
      ctx.fillStyle = '#b3965b';
      ctx.fillRect(95, 70, 10, 6);
      ctx.strokeRect(95, 70, 10, 6);
    }

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, w, h);
    ctx.restore();
  }

  drawAgentPreview(canvas, agentType) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    
    const scale = w / 60;
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);

    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;

    let torsoColor = '#3498db';
    if (agentType === 'minigunner') torsoColor = '#e67e22';
    else if (agentType === 'commander') torsoColor = '#c0392b';
    else if (agentType === 'dj') torsoColor = '#9b59b6';
    else if (agentType === 'pyromancer') torsoColor = '#e67e22';
    else if (agentType === 'gladiator') torsoColor = '#7f8c8d';
    else if (agentType === 'soldier') torsoColor = '#27ae60';
    else if (agentType === 'farm') torsoColor = '#8d6e63';
    else if (agentType === 'sniper') torsoColor = '#e67e22';
    else if (agentType === 'medic') torsoColor = '#e74c3c';
    else if (agentType === 'rocketeer') torsoColor = '#95a5a6';

    const equippedSkin = this.game.equippedSkins[agentType] || 'default';
    if (equippedSkin.endsWith('_Golden')) {
      torsoColor = '#f1c40f';
    } else if (equippedSkin.endsWith('_Cyber')) {
      torsoColor = '#00ffe0';
    } else if (equippedSkin.endsWith('_Hazmat')) {
      torsoColor = '#2ecc71';
    }

    ctx.fillStyle = torsoColor;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeRect(-8, -8, 16, 16);

    if (agentType === 'farm') {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      ctx.fillStyle = '#8d6e63';
      ctx.fillRect(-15, -15, 30, 30);
      ctx.strokeRect(-15, -15, 30, 30);
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(-5, -6, 4, 4);
      ctx.fillRect(4, 2, 4, 4);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(-11, -11, 7, 9);
      ctx.strokeRect(-11, -11, 7, 9);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-11, -14, 7, 3);
      ctx.strokeRect(-11, -14, 7, 3);
      ctx.restore();
      return;
    }

    ctx.fillStyle = torsoColor;
    ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeRect(-8, -8, 16, 16);

    ctx.fillStyle = '#222';
    ctx.fillRect(-8, 5, 16, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(-6, -8, 3, 13);
    ctx.fillRect(3, -8, 3, 13);

    ctx.fillStyle = torsoColor;
    ctx.fillRect(4, -11, 5, 4);
    ctx.strokeRect(4, -11, 5, 4);
    ctx.fillRect(4, 7, 5, 4);
    ctx.strokeRect(4, 7, 5, 4);

    ctx.fillStyle = '#cca080';
    ctx.fillRect(-5.5, -5.5, 11, 11);

    ctx.fillStyle = '#ffdbac';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.strokeRect(-5, -5, 10, 10);

    ctx.fillStyle = '#111';
    ctx.fillRect(2, -3, 2, 2);
    ctx.fillRect(2, 1, 2, 2);

    if (agentType === 'scout') {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillRect(3, -4, 5, 8);
      ctx.fillStyle = '#34495e';
      ctx.fillRect(7, 2, 10, 4);
      ctx.fillStyle = '#ff3131';
      ctx.fillRect(17, 3, 1.5, 1.5);
    } else if (agentType === 'minigunner') {
      ctx.fillStyle = '#00';
      ctx.fillRect(3, -4, 2, 3);
      ctx.fillRect(3, 1, 2, 3);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(-6, -11, 4, 3);
      ctx.fillRect(-2, -12, 4, 3);
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(6, -4, 12, 8);
      ctx.fillStyle = '#7f8c8d';
      ctx.fillRect(18, -3, 12, 6);
    } else if (agentType === 'commander') {
      ctx.fillStyle = '#2c3e50';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(3, -2, 2, 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(7, 1, 6, 4);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(13, -1, 3, 8);
    } else if (agentType === 'dj') {
      ctx.fillStyle = '#9b59b6';
      ctx.fillRect(-7, -9, 14, 2);
      ctx.fillRect(-8, -6, 2, 4);
      ctx.fillRect(6, -6, 2, 4);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(8, -14, 10, 28);
      ctx.strokeRect(8, -14, 10, 28);
    } else if (agentType === 'pyromancer') {
      ctx.fillStyle = '#34495e';
      ctx.fillRect(2, -4, 3, 8);
      ctx.fillStyle = '#d35400';
      ctx.fillRect(-12, -7, 4, 14);
      ctx.fillStyle = '#7f8c8d';
      ctx.fillRect(6, 1, 12, 5);
    } else if (agentType === 'gladiator') {
      ctx.fillStyle = '#bdc3c7';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(-8, -2, 2, 4);
      ctx.fillRect(-6, -9, 12, 3);
      ctx.fillStyle = '#bdc3c7';
      ctx.fillRect(5, 1, 15, 4);
      ctx.fillStyle = '#f39c12';
      ctx.fillRect(5, -1, 2, 8);
    } else if (agentType === 'soldier') {
      ctx.fillStyle = '#27ae60';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillRect(3, -5, 3, 10);
      ctx.fillStyle = '#111';
      ctx.fillRect(6, 1, 14, 4);
    } else if (agentType === 'sniper') {
      ctx.fillStyle = '#d35400';
      ctx.fillRect(-5, -7, 10, 3);
      ctx.fillStyle = '#222';
      ctx.fillRect(6, 0, 18, 3);
    } else if (agentType === 'medic') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-5, -7, 10, 3);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(-1, -7, 2, 3);
      ctx.fillStyle = '#bdc3c7';
      ctx.fillRect(6, 1, 10, 3);
    } else if (agentType === 'rocketeer') {
      ctx.fillStyle = '#95a5a6';
      ctx.fillRect(-6, -6, 12, 12);
      ctx.fillStyle = '#34495e';
      ctx.fillRect(4, -3, 16, 6);
    }

    ctx.restore();
  }

  startUnboxingAnimation(crateType, chosenAgent, chosenRarity, revealedSkinName) {
    const overlay = document.getElementById('crate-opening-overlay');
    const canvas = document.getElementById('crate-opening-canvas');
    const revealCard = document.getElementById('crate-reveal-card');
    const revealRarity = document.getElementById('crate-reveal-rarity');
    const revealAgentCanvas = document.getElementById('crate-reveal-agent-canvas');
    const revealName = document.getElementById('crate-reveal-name');
    const revealText = document.getElementById('crate-reveal-unlocked');

    if (!overlay || !canvas) return;

    overlay.classList.remove('hidden');
    revealCard.classList.add('hidden');

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    let startTime = null;
    let particles = [];
    let state = 'dropping';
    let crateY = -100;
    let crateVelocity = 0;
    const gravity = 800;
    const targetY = h / 2 + 20;
    const bounceCount = 2;
    let currentBounce = 0;
    let shakeTimer = 0;
    let shakeOffset = { x: 0, y: 0 };
    let burstTriggered = false;

    const spawnConfetti = (x, y, colorCode) => {
      const colors = colorCode === 'legendary' ? ['#f1c40f', '#f39c12', '#fff'] :
                     colorCode === 'epic' ? ['#9b59b6', '#8e44ad', '#fff'] :
                     colorCode === 'rare' ? ['#3498db', '#2980b9', '#fff'] :
                     ['#bdc3c7', '#7f8c8d', '#fff'];
      for (let i = 0; i < 60; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 250;
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 100,
          color: colors[Math.floor(Math.random() * colors.length)],
          radius: 3 + Math.random() * 6,
          life: 1.2 + Math.random() * 0.8,
          alpha: 1.0,
          rotation: Math.random() * Math.PI,
          spinSpeed: (Math.random() - 0.5) * 10
        });
      }
    };

    const spawnSplinters = (x, y) => {
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 50 + Math.random() * 150;
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 50,
          color: '#8d6e63',
          radius: 2 + Math.random() * 4,
          life: 0.8 + Math.random() * 0.5,
          alpha: 1.0,
          rotation: Math.random() * Math.PI,
          spinSpeed: (Math.random() - 0.5) * 5
        });
      }
    };

    const loop = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const dt = Math.min(0.1, (timestamp - startTime) / 1000.0);
      startTime = timestamp;

      ctx.clearRect(0, 0, w, h);

      if (state === 'dropping') {
        crateVelocity += gravity * dt;
        crateY += crateVelocity * dt;

        if (crateY >= targetY) {
          crateY = targetY;
          if (currentBounce < bounceCount) {
            crateVelocity = -crateVelocity * 0.45;
            if (currentBounce === 0) soundManager.playCrateDrop();
            currentBounce++;
          } else {
            state = 'shaking';
            shakeTimer = 0;
          }
        }
      } else if (state === 'shaking') {
        shakeTimer += dt;
        if (shakeTimer < 1.5) {
          const shakeFreq = 35;
          const intensity = 8;
          shakeOffset.x = Math.sin(shakeTimer * shakeFreq) * intensity;
          shakeOffset.y = Math.cos(shakeTimer * shakeFreq * 0.8) * intensity;

          if (Math.random() < 0.15) {
            spawnSplinters(w / 2 + shakeOffset.x, crateY + shakeOffset.y);
          }
        } else {
          state = 'bursting';
          shakeOffset = { x: 0, y: 0 };
        }
      } else if (state === 'bursting') {
        if (!burstTriggered) {
          burstTriggered = true;
          soundManager.playCrateReveal();
          spawnConfetti(w / 2, targetY, chosenRarity);
          spawnSplinters(w / 2, targetY);

          if (chosenRarity === 'epic' || chosenRarity === 'legendary') {
            CrazyGamesManager.happytime();
          }

          setTimeout(() => {
            state = 'revealed';
            revealCard.classList.remove('hidden');
            revealRarity.textContent = chosenRarity.toUpperCase();
            revealRarity.className = `rarity-${chosenRarity}`;
            
            if (revealedSkinName) {
              const baseName = chosenAgent.charAt(0).toUpperCase() + chosenAgent.slice(1);
              const suffix = revealedSkinName.split('_')[1];
              revealName.textContent = `${suffix.toUpperCase()} ${baseName.toUpperCase()}`;
              if (revealText) revealText.textContent = "SKIN UNLOCKED & ADDED TO LOADOUT!";
            } else {
              revealName.textContent = chosenAgent.toUpperCase();
              if (revealText) revealText.textContent = "UNLOCKED & ADDED TO LOADOUT!";
            }
            
            if (revealAgentCanvas) {
              const prevCtx = revealAgentCanvas.getContext('2d');
              prevCtx.clearRect(0, 0, revealAgentCanvas.width, revealAgentCanvas.height);
              this.drawAgentPreview(revealAgentCanvas, chosenAgent);
            }

            const btnEquip = document.getElementById('btn-equip-revealed');
            if (btnEquip) {
              btnEquip.disabled = false;
              btnEquip.style.background = '';
              btnEquip.style.color = '';
              
              const isEquipped = this.game.equippedAgents.includes(chosenAgent);
              if (isEquipped) {
                btnEquip.textContent = "ALREADY EQUIPPED";
                btnEquip.disabled = true;
                btnEquip.style.background = '#7f8c8d';
              } else {
                btnEquip.textContent = "EQUIP";
                btnEquip.style.background = '#27ae60';
                btnEquip.style.color = '#fff';
              }

              btnEquip.onclick = () => {
                const nowEquipped = this.game.equippedAgents.includes(chosenAgent);
                if (nowEquipped) {
                  btnEquip.textContent = "ALREADY EQUIPPED";
                  btnEquip.disabled = true;
                  btnEquip.style.background = '#7f8c8d';
                  return;
                }
                if (this.game.equippedAgents.length >= 5) {
                  btnEquip.textContent = "LOADOUT FULL (MAX 5)";
                  btnEquip.style.background = '#e74c3c';
                  btnEquip.style.color = '#fff';
                  return;
                }
                this.game.equippedAgents.push(chosenAgent);
                this.game.saveStatsToStorage();
                
                btnEquip.textContent = "EQUIPPED";
                btnEquip.disabled = true;
                btnEquip.style.background = '#2ecc71';
                btnEquip.style.color = '#fff';
                
                this.renderLoadoutConfig();
              };
            }
          }, 400);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
        p.life -= dt;
        p.rotation += p.spinSpeed * dt;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
        ctx.restore();
      }

      if (state === 'dropping' || state === 'shaking') {
        ctx.save();
        ctx.translate(w / 2 + shakeOffset.x, crateY + shakeOffset.y);

        let crateColor = '#8d6e63';
        let bandColor = '#784212';
        if (crateType === 'elite') {
          crateColor = '#2980b9';
          bandColor = '#1f3a52';
        } else if (crateType === 'deluxe') {
          crateColor = '#9b59b6';
          bandColor = '#f1c40f';
        }

        ctx.fillStyle = crateColor;
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 4;
        ctx.fillRect(-40, -40, 80, 80);
        ctx.strokeRect(-40, -40, 80, 80);

        ctx.fillStyle = bandColor;
        ctx.fillRect(-10, -40, 20, 80);
        ctx.strokeRect(-10, -40, 20, 80);
        ctx.fillRect(-40, -10, 80, 20);
        ctx.strokeRect(-40, -10, 80, 20);

        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(-8, -8, 16, 16);
        ctx.strokeRect(-8, -8, 16, 16);
        ctx.fillStyle = '#222';
        ctx.fillRect(-2, -2, 4, 8);

        ctx.restore();
      }

      if (state !== 'revealed' || particles.length > 0) {
        requestAnimationFrame(loop);
      }
    };

    requestAnimationFrame(loop);
  }

  renderDailyQuests() {
    const listEl = document.getElementById('quests-list');
    if (!listEl) return;

    const { questProgress, questGoals, questRewarded } = this.game;

    const quests = [
      {
        key: 'kills',
        label: '<img src="https://img.icons8.com/color/48/skull.png" class="quest-icon" /> Slay Zombies',
        current: questProgress.kills,
        goal: questGoals.kills,
        reward: 75,
        rewarded: questRewarded.kills
      },
      {
        key: 'cashSpent',
        label: '<img src="https://img.icons8.com/color/48/stack-of-money.png" class="quest-icon" /> Spend $2,000 Cash',
        current: questProgress.cashSpent,
        goal: questGoals.cashSpent,
        reward: 100,
        rewarded: questRewarded.cashSpent
      },
      {
        key: 'farmsPlaced',
        label: '<img src="https://img.icons8.com/color/48/wheat.png" class="quest-icon" /> Place 5 Farms',
        current: questProgress.farmsPlaced,
        goal: questGoals.farmsPlaced,
        reward: 50,
        rewarded: questRewarded.farmsPlaced
      }
    ];

    listEl.innerHTML = quests.map(q => {
      const pct = Math.min(100, Math.round((q.current / q.goal) * 100));
      const done = q.rewarded || q.current >= q.goal;
      const barColor = done ? '#27ae60' : '#3498db';
      return `
        <div class="quest-item" style="
          background: ${done ? 'rgba(39,174,96,0.08)' : 'rgba(52,152,219,0.06)'};
          border: 2px solid ${done ? '#27ae60' : '#3498db'};
          border-radius: 10px;
          padding: 8px 10px;
          position: relative;
          overflow: hidden;
        ">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:900;font-size:0.82rem;">${q.label}</span>
            <span style="font-weight:800;font-size:0.78rem;color:${done ? '#27ae60' : '#f39c12'};">
              ${done ? '✅ DONE' : `${Math.min(q.current, q.goal)} / ${q.goal}`}
            </span>
          </div>
          <div style="margin-top:5px;height:7px;background:#e0e0e0;border-radius:6px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:6px;transition:width 0.4s;"></div>
          </div>
          <div style="margin-top:4px;font-size:0.7rem;color:#7f8c8d;text-align:right;">
            Reward: <img src="https://img.icons8.com/color/48/coins.png" class="quest-icon" /> ${q.reward} Coins
          </div>
        </div>
      `;
    }).join('');
  }

  renderLeaderboard(mapId) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;

    const mapLabel = mapId === 'desert' ? 'Desert Outpost' : mapId === 'tundra' ? 'Frost Tundra' : mapId === 'cyber_city' ? 'Cyber City' : mapId === 'fallen_outpost' ? 'Fallen Outpost' : 'Grassland';

    const records = (this.game.leaderboard && this.game.leaderboard[mapId]) || [];
    this._renderLeaderboardRows(listEl, mapLabel, records);

    fetchTopRecords(mapId).then(freshRecords => {
      if (!this.game.leaderboard) this.game.leaderboard = {};
      this.game.leaderboard[mapId] = freshRecords;
      this._renderLeaderboardRows(listEl, mapLabel, freshRecords);
    }).catch(e => {
      console.warn('[Leaderboard] Fetch error:', e);
    });
  }

  _renderLeaderboardRows(listEl, mapLabel, records) {
    if (records.length === 0) {
      listEl.innerHTML = `<div style="color:#7f8c8d;font-size:0.82rem;">
        No records yet for <strong>${mapLabel}</strong>.<br>Complete the map to set one!
      </div>`;
      return;
    }

    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    listEl.innerHTML = `
      <div style="font-size:0.72rem;color:#7f8c8d;margin-bottom:4px;">📍 ${mapLabel}</div>
      ${records.map((entry, i) => `
        <div style="
          display:flex;justify-content:space-between;align-items:center;
          padding:5px 8px;
          border-radius:8px;
          background:${i === 0 ? 'rgba(241,196,15,0.12)' : 'transparent'};
          border-bottom:1px dashed #e0e0e0;
          font-weight:800;
          font-size:0.82rem;
        ">
          <span style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">
            <span>${medals[i] || `#${i + 1}`}</span>
            <strong style="color:var(--text-dark);">${entry.name || 'Guest'}</strong>
          </span>
          <span style="color:var(--primary-blue-dark); font-family:var(--font-title); font-size:0.9rem;">${entry.time}</span>
        </div>
      `).join('')}
    `;
  }
}