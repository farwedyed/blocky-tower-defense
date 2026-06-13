// UI and Lobby Module for Blocky TDS 2D
import { soundManager } from './sound.js';
import { fetchTopRecords } from './firebase.js';
import { Network } from './network.js';

export class UI {
  constructor(game) {
    this.game = game;

    // Cache Lobby Elements
    this.lobbyView = document.getElementById('lobby-view');
    this.gameView = document.getElementById('game-view');

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

    // Cache Match HUD Elements
    this.hudLives = document.getElementById('hud-lives');
    this.hudGold = document.getElementById('hud-gold');
    this.hudWave = document.getElementById('hud-wave');
    this.hudMapName = document.getElementById('hud-map-name');

    this.btnNextWave = document.getElementById('btn-next-wave');
    this.btnSkipWave = document.getElementById('btn-skip-wave');
    this.btnSpeed = document.getElementById('btn-speed');
    this.btnAutoWave = document.getElementById('btn-auto-wave');
    this.btnReturnLobby = document.getElementById('btn-return-lobby');
    this.equippedAgentsList = document.getElementById('equipped-agents-list');

    // Selection controls
    this.selectionPanel = document.getElementById('selection-panel');
    this.selectionInfo = document.getElementById('selection-info');
    this.selectTargeting = document.getElementById('select-targeting');
    this.btnUpgrade = document.getElementById('btn-upgrade');
    this.btnSell = document.getElementById('btn-sell');

    this.overlay = document.getElementById('game-overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlaySubtitle = document.getElementById('overlay-subtitle');

    this.injectCoopControls();
    this.initEventListeners();
    this.drawAllStaticPreviews();

    // Default Lobby UI to clean Splash State
    this.showSplashState();
  }

  injectCoopControls() {
    const parentPanel = document.getElementById('panel-maps');
    if (!parentPanel) return;

    // Inject temporary styles for Name Input Shake Animation
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
    
    // Create Splash selector container
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
      <p style="font-size: 0.9rem; color: var(--text-muted); max-width: 380px; line-height: 1.45;">Play solo to set speedrun records, or join forces with up to 8 players in cooperative matchmaking!</p>
      <div style="display: flex; gap: 12px; width: 100%; max-width: 420px; margin-top: 6px;">
        <button id="btn-select-solo" class="btn" style="flex: 1; font-size: 1rem; padding: 12px; background: var(--primary-green); color: #fff; box-shadow: 0 4px 0 var(--primary-green-dark), 0 4px 0 var(--border-color);">👤 PLAY SOLO</button>
        <button id="btn-select-coop" class="btn" style="flex: 1; font-size: 1rem; padding: 12px; background: var(--primary-blue); color: #fff; box-shadow: 0 4px 0 var(--primary-blue-dark), 0 4px 0 var(--border-color);">👥 CO-OP PARTY</button>
      </div>
    `;

    // Create Matchmaking setup container
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
      
      <!-- MANDATORY PLAYER NAME INPUT BOX -->
      <div id="username-container" style="margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
        <label for="input-player-name" style="font-size: 0.8rem; font-weight: 900; color: var(--text-muted);">PLAYER ACCOUNT NAME (REQUIRED TO PLAY CO-OP):</label>
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

      <!-- Setup State controls -->
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

      <!-- Active Connected Lobby status -->
      <div id="coop-lobby-status-container" class="hidden" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; background: #eaedf2; padding: 10px; border-radius: 8px; border: 2px solid var(--border-color);">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="label-room-code" style="font-weight: 900; font-size: 1.05rem; color: var(--text-dark);">ROOM CODE: ---</span>
            <!-- COPY CODE BUTTON ICON -->
            <button id="btn-copy-code" class="hidden" style="
              background: none;
              border: none;
              cursor: pointer;
              padding: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              outline: none;
            " title="Copy Room Code">
              <img src="https://img.icons8.com/color/48/copy.png" style="width: 20px; height: 20px;" />
            </button>
          </div>
          <span id="label-lobby-status" style="font-weight: 900; font-size: 0.85rem; color: #7f8c8d; text-transform: uppercase;">OFFLINE</span>
        </div>

        <div style="background: #fff; border: 2px solid var(--border-color); border-radius: 8px; padding: 8px;">
          <h4 style="font-size: 0.8rem; font-weight: 900; color: var(--text-muted); border-bottom: 1.5px dashed #ccc; padding-bottom: 4px; margin-bottom: 6px;">SQUAD MEMBERS</h4>
          <div id="coop-player-slots" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-weight: 800; font-size: 0.85rem;">
          </div>
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
    const hc = document.getElementById('hardcore-toggle-container');
    const deploy = document.getElementById('btn-deploy');
    
    // PRECISION SELECTOR: Targets the parent of the leaderboard box directly to avoid structural conflicts
    const leaderboard = document.getElementById('leaderboard-box');
    const bottomBoxes = leaderboard ? leaderboard.parentElement : null;

    const displayStyle = visible ? 'grid' : 'none';
    const flexStyle = visible ? 'flex' : 'none';
    const blockStyle = visible ? 'block' : 'none';

    if (grid) grid.style.display = displayStyle;
    if (hc) hc.style.display = flexStyle;
    if (deploy) deploy.style.display = blockStyle;
    if (bottomBoxes) bottomBoxes.style.display = flexStyle;
  }

  initEventListeners() {
    // 1. Lobby Navigation Tabs
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

        if (targetPanelId === 'panel-loadout') {
          this.renderLoadoutConfig();
        }
      });
    });

    // Clean Splash Select Event Listeners
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

    // Co-op elements cached
    const btnHost = document.getElementById('btn-host-coop');
    const btnJoin = document.getElementById('btn-join-coop');
    const inputJoinCode = document.getElementById('input-join-code');
    const btnDisconnect = document.getElementById('btn-disconnect-coop');
    const btnCopyCode = document.getElementById('btn-copy-code');
    const nameInput = document.getElementById('input-player-name');

    // Restore username cache memory
    const savedUsername = localStorage.getItem('tds_player_username');
    if (savedUsername && nameInput) {
      nameInput.value = savedUsername;
    }

    // Validation helper to enforce mandatory username and activate shake animation
    const validatePlayerName = () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.classList.add('shake-active');
        soundManager.playShoot(); // warning audio queue
        setTimeout(() => {
          nameInput.classList.remove('shake-active');
        }, 400);
        return null;
      }
      // Save name to device local memory
      localStorage.setItem('tds_player_username', name);
      return name;
    };

    if (btnHost) {
      btnHost.addEventListener('click', () => {
        const playerName = validatePlayerName();
        if (!playerName) return; // Halt if empty!

        Network.mode = 'HOST';
        document.getElementById('username-container').style.display = 'none';
        document.getElementById('coop-setup-controls').classList.add('hidden');
        document.getElementById('coop-lobby-status-container').classList.remove('hidden');
        
        const labelStatus = document.getElementById('label-lobby-status');
        labelStatus.textContent = "ESTABLISHING SIGNAL...";
        labelStatus.style.color = "var(--primary-orange)";

        this.game.playerWallets = {};
        this.game.playerWallets['p1'] = this.game.isHardcore ? 250 : 100;
        window.lobbyPlayers['p1'] = playerName + ` [Lv. ${this.game.playerLevel}]`;

        if (Network.peer && Network.peer.id) {
          const roomCode = Network.peer.id.toUpperCase();
          document.getElementById('label-room-code').textContent = `ROOM CODE: ${roomCode}`;
          btnCopyCode.classList.remove('hidden');
          labelStatus.textContent = "HOSTING LOBBY";
          labelStatus.style.color = "var(--primary-green-dark)";
          this.updateCoopPlayerList();
          this.toggleSoloElements(true); // Host can see maps and deploy controls
        } else {
          Network.init(this.game, (id) => {
            const roomCode = id.toUpperCase();
            document.getElementById('label-room-code').textContent = `ROOM CODE: ${roomCode}`;
            btnCopyCode.classList.remove('hidden');
            labelStatus.textContent = "HOSTING LOBBY";
            labelStatus.style.color = "var(--primary-green-dark)";
            this.updateCoopPlayerList();
            this.toggleSoloElements(true); // Host can see maps and deploy controls
          });
        }
      });
    }

    if (btnJoin) {
      btnJoin.addEventListener('click', () => {
        const playerName = validatePlayerName();
        if (!playerName) return; // Halt if empty!

        const code = inputJoinCode.value.trim().toLowerCase();
        if (!code) {
          alert("Please enter a valid room code.");
          return;
        }

        Network.mode = 'CLIENT';
        document.getElementById('username-container').style.display = 'none';
        document.getElementById('coop-setup-controls').classList.add('hidden');
        document.getElementById('coop-lobby-status-container').classList.remove('hidden');
        
        const labelStatus = document.getElementById('label-lobby-status');
        labelStatus.textContent = "CONNECTING...";
        labelStatus.style.color = "var(--primary-orange)";

        Network.join(code, playerName, () => {
          document.getElementById('label-room-code').textContent = `CONNECTED TO HOST`;
          labelStatus.textContent = "IN SQUAD (WAITING FOR HOST TO DEPLOY)";
          labelStatus.style.color = "var(--primary-blue)";
          this.updateCoopPlayerList();
          this.toggleSoloElements(false); // Guest maps/deploy are cleanly hidden
        });
      });
    }

    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', () => {
        const rawCode = Network.peer ? Network.peer.id.toUpperCase() : "";
        if (rawCode) {
          navigator.clipboard.writeText(rawCode).then(() => {
            this.game.effectManager.spawnText(400, 260, "ROOM CODE COPIED!", '#2ecc71');
          }).catch(err => {
            console.error("Clipboard copy failed:", err);
          });
        }
      });
    }

    if (btnDisconnect) {
      btnDisconnect.addEventListener('click', () => {
        location.reload();
      });
    }

    // 2. Map Selector Cards
    this.mapCards.forEach(card => {
      card.addEventListener('click', () => {
        this.mapCards.forEach(c => c.classList.remove('active'));
        card.active = true;
        const mapId = card.getAttribute('data-map-id');
        this.game.setSelectedMap(mapId);
        this.renderLeaderboard(mapId);
      });
    });

    // 3. Shop Purchase Recruit Clickers
    const btnBuyCrates = document.querySelectorAll('.btn-buy-crate');
    btnBuyCrates.forEach(btn => {
      btn.addEventListener('click', () => {
        const crateType = btn.getAttribute('data-crate');
        this.game.buyCrate(crateType);
      });
    });

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

    // 4. Lobby Deployment
    this.btnDeploy.addEventListener('click', () => {
      this.game.deployToMatch();
    });

    // 5. Quit Match
    this.btnReturnLobby.addEventListener('click', () => {
      this.game.quitToLobby();
    });

    // 6. Next Wave, Skip Wave and Game Speed
    this.btnNextWave.addEventListener('click', () => {
      this.game.startNextWave();
    });

    if (this.btnSkipWave) {
      this.btnSkipWave.addEventListener('click', () => {
        this.game.voteSkipWave();
      });
    }

    this.btnSpeed.addEventListener('click', () => {
      this.game.toggleSpeed();
    });

    // Auto Wave toggle
    if (this.btnAutoWave) {
      this.btnAutoWave.addEventListener('click', () => {
        this.game.toggleAutoMode();
      });
    }

    // 7. Targeting Dropdown Selection Change
    this.selectTargeting.addEventListener('change', (e) => {
      if (this.game.selectedPlacedTower) {
        this.game.selectedPlacedTower.targetingStrategy = e.target.value;
      }
    });

    // 8. In-game upgrade and sell buttons
    this.btnUpgrade.addEventListener('click', () => {
      this.game.upgradeSelectedTower();
    });

    this.btnSell.addEventListener('click', () => {
      this.game.sellSelectedTower();
    });

    // 9. Overlay reboot click
    this.overlay.addEventListener('click', () => {
      if (this.game.state === 'gameover' || this.game.state === 'victory') {
        this.game.quitToLobby();
        this.hideOverlay();
      }
    });
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

  // Redraw Lobby panels (credits/level badges)
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

    // Apply strict Level Gating restrictions
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

  // Draw Loadout cards setup tab
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
          <select class="skin-select styled-select" style="font-size: 0.75rem; font-weight: 800;">
            <option value="default" ${currentEquippedSkin === 'default' ? 'selected' : ''}>Default</option>
            ${skins.map(s => {
              const displayName = s.substring(prefix.length);
              return `<option value="${s}" ${currentEquippedSkin === s ? 'selected' : ''}>${displayName}</option>`;
            }).join('')}
          </select>
        </div>`;
      }

      card.innerHTML = `
        <div class="agent-avatar"><canvas width="60" height="60"></canvas></div>
        <span class="name" style="margin-top: 6px">${type.toUpperCase()}</span>
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

  // Render Equipped Sidebar selection buttons during match play
  renderPlacementShop() {
    this.equippedAgentsList.innerHTML = '';

    this.game.equippedAgents.forEach(type => {
      const btn = document.createElement('button');
      btn.className = `placement-btn ${this.game.selectedShopTower === type ? 'active' : ''}`;
      btn.setAttribute('data-type', type);

      let name = type.charAt(0).toUpperCase() + type.slice(1);
      if (type === 'dj') name = 'DJ Unit';
      const cost = this.game.getTowerCost(type);

      btn.innerHTML = `
        <div class="icon"><canvas width="45" height="45"></canvas></div>
        <div class="info">
          <span class="name">${name}</span>
          <span class="cost">$${cost}</span>
        </div>
      `;

      const cvs = btn.querySelector('canvas');
      this.drawAgentPreview(cvs, type);

      btn.addEventListener('click', () => {
        document.querySelectorAll('.placement-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.game.setSelectedShopTower(type);
        this.game.setSelectedPlacedTower(null);
      });

      this.equippedAgentsList.appendChild(btn);
    });
  }

  // Update in-game values
  updateHUD(lives, gold, wave, maxWaves) {
    if (this.hudLives) {
      const valEl = document.getElementById('hud-lives-val');
      if (valEl) {
        valEl.textContent = Math.max(0, lives);
      } else {
        this.hudLives.textContent = `❤️ ${Math.max(0, lives)}`;
      }
    }
    if (this.hudGold) {
      const valEl = document.getElementById('hud-gold-val');
      if (valEl) {
        valEl.textContent = `$${gold}`;
      } else {
        this.hudGold.textContent = `💵 $${gold}`;
      }
    }
    if (this.hudWave) {
      const valEl = document.getElementById('hud-wave-val');
      if (valEl) {
        valEl.textContent = `${wave} / ${maxWaves}`;
      } else {
        this.hudWave.textContent = `🌊 ${wave} / ${maxWaves}`;
      }
    }

    const placementBtns = document.querySelectorAll('.placement-btn');
    placementBtns.forEach(btn => {
      const type = btn.getAttribute('data-type');
      const cost = this.game.getTowerCost(type);
      if (gold < cost) {
        btn.style.opacity = '0.4';
      } else {
        btn.style.opacity = '1.0';
      }
    });

    // Skip wave vote progression indicator
    if (this.btnSkipWave) {
      const showSkip = this.game.waveInProgress && this.game.spawnQueue.length === 0 && this.game.wave < this.game.maxWaves;
      if (showSkip) {
        this.btnSkipWave.classList.remove('hidden');
        if (this.game.skipVotes && this.game.skipVotes.size > 0) {
          const required = Math.ceil((Network.conns.filter(c => c && c.open).length + 1) / 2);
          this.btnSkipWave.textContent = `SKIP VOTE (${this.game.skipVotes.size}/${required})`;
        } else {
          this.btnSkipWave.textContent = "SKIP WAVE";
        }
      } else {
        this.btnSkipWave.classList.add('hidden');
      }
    }

    if (this.game.selectedPlacedTower) {
      this.updateSelectionPanel(this.game.selectedPlacedTower);
    }
  }

  // Show selected placed Agent panel
  updateSelectionPanel(agent) {
    if (!agent) {
      this.selectionPanel.classList.add('hidden');
      return;
    }

    this.selectionPanel.classList.remove('hidden');
    document.querySelectorAll('.placement-btn').forEach(b => b.classList.remove('active'));

    this.selectTargeting.value = agent.targetingStrategy;

    const upgradeCost = agent.getUpgradeCost();
    const sellValue = agent.getSellValue();

    let detailsHtml = `
      <p class="unit-name">${agent.name} <span style="color: #f39c12">Lvl ${agent.level}</span></p>
      <p class="unit-stats">Damage: ${Math.round(agent.damage)} | Range: ${Math.round(agent.range * (agent.djRangeBuffed ? 1.15 : 1.0))}px | Rate: ${(agent.fireRate * (agent.commanderSpeedBuffed ? 1.35 : 1.0)).toFixed(1)}/s</p>
    `;

    if (agent.type === 'commander') {
      detailsHtml += `<p class="unit-stats" style="color: #e74c3c">Call to Arms: +35% Shoot Speed</p>`;
    } else if (agent.type === 'dj') {
      detailsHtml += `<p class="unit-stats" style="color: #9b59b6">Plays Tracks: +15% Range & -10% Upgrades</p>`;
    } else if (agent.type === 'pyromancer') {
      const burnDps = 15 + agent.level * 4;
      detailsHtml += `<p class="unit-stats" style="color: #e67e22">Fire Spray DoT: ${burnDps} Dmg/sec</p>`;
    } else if (agent.type === 'farm') {
      const income = agent.getHarvestIncome();
      detailsHtml += `<p class="unit-stats" style="color: #2ecc71">Wave Harvest Income: +$${income}</p>`;
    } else if (agent.type === 'gladiator') {
      detailsHtml += `<p class="unit-stats" style="color: #7f8c8d">Centurion Plume: Fast Centurion Sword swing</p>`;
    } else if (agent.type === 'soldier') {
      detailsHtml += `<p class="unit-stats" style="color: #27ae60">Assault Rifle: Rapid 3/5 round bursts</p>`;
    } else if (agent.type === 'sniper') {
      detailsHtml += `<p class="unit-stats" style="color: #e67e22">Sniper Scope: Single high physical damage shot</p>`;
    } else if (agent.type === 'medic') {
      detailsHtml += `<p class="unit-stats" style="color: #2ecc71">Syringe Gun: Heals base HP and targets status effects</p>`;
    } else if (agent.type === 'rocketeer') {
      detailsHtml += `<p class="unit-stats" style="color: #95a5a6">Rocket Launcher: Splash area impact damage</p>`;
    }

    const targetingContainer = document.querySelector('.targeting-container');
    if (targetingContainer) {
      if (agent.type === 'farm') {
        targetingContainer.classList.add('hidden');
      } else {
        targetingContainer.classList.remove('hidden');
      }
    }

    this.selectionInfo.innerHTML = detailsHtml;

    if (agent.level >= 5) {
      this.btnUpgrade.textContent = "MAX LEVEL";
      this.btnUpgrade.disabled = true;
      this.btnUpgrade.style.opacity = '0.5';
    } else {
      this.btnUpgrade.textContent = `UPGRADE ($${upgradeCost})`;
      if (this.game.gold < upgradeCost) {
        this.btnUpgrade.disabled = true;
        this.btnUpgrade.style.opacity = '0.5';
      } else {
        this.btnUpgrade.disabled = false;
        this.btnUpgrade.style.opacity = '1.0';
      }
    }

    this.btnSell.textContent = `SELL ($${sellValue})`;

    let btnAbility = document.getElementById('btn-ability');
    if (!btnAbility) {
      btnAbility = document.createElement('button');
      btnAbility.id = 'btn-ability';
      btnAbility.className = 'btn btn-secondary';
      btnAbility.style.marginTop = '8px';
      btnAbility.style.width = '100%';
      this.selectionPanel.appendChild(btnAbility);
    }

    if (agent.type === 'commander' || agent.type === 'gladiator' || agent.type === 'medic') {
      btnAbility.classList.remove('hidden');
      if (agent.isAbilityActive) {
        btnAbility.textContent = `ACTIVE (${Math.ceil(agent.abilityActiveTimer)}s)`;
        btnAbility.disabled = true;
        btnAbility.style.opacity = '0.7';
        btnAbility.style.background = '#e74c3c';
      } else if (agent.abilityCooldownTimer > 0) {
        btnAbility.textContent = `COOLDOWN (${Math.ceil(agent.abilityCooldownTimer)}s)`;
        btnAbility.disabled = true;
        btnAbility.style.opacity = '0.5';
        btnAbility.style.background = '#7f8c8d';
      } else {
        if (agent.type === 'commander') btnAbility.textContent = "ACTIVATE: CALL TO ARMS";
        else if (agent.type === 'gladiator') btnAbility.textContent = "ACTIVATE: WARRIOR'S RAGE";
        else btnAbility.textContent = "ACTIVATE: RESTORE INTEGRITY";
        
        btnAbility.disabled = false;
        btnAbility.style.opacity = '1.0';
        btnAbility.style.background = 'var(--primary-blue)';
      }

      btnAbility.onclick = () => {
        const success = agent.activateAbility(this.game.effectManager, this.game);
        if (success) {
          this.updateSelectionPanel(agent);
        }
      };
    } else {
      btnAbility.classList.add('hidden');
    }
  }

  hideSelectionPanel() {
    this.selectionPanel.classList.add('hidden');
  }

  updateWaveButton(waveInProgress) {
    if (waveInProgress) {
      this.btnNextWave.textContent = "DEFENDING...";
      this.btnNextWave.disabled = true;
      this.btnNextWave.style.opacity = '0.5';
    } else {
      this.btnNextWave.textContent = "START WAVE";
      this.btnNextWave.disabled = false;
      this.btnNextWave.style.opacity = '1.0';
    }
  }

  updateSpeedButton(multiplier) {
    if (this.btnSpeed) {
      this.btnSpeed.textContent = `SPEED x${multiplier}`;
    }
  }

  updateAutoWaveButton(isOn) {
    if (!this.btnAutoWave) return;
    if (isOn) {
      this.btnAutoWave.textContent = 'AUTO WAVE: ON';
      this.btnAutoWave.style.background = '#27ae60';
      this.btnAutoWave.style.color = '#fff';
      this.btnAutoWave.style.opacity = '1.0';
    } else {
      this.btnAutoWave.textContent = 'AUTO WAVE: OFF';
      this.btnAutoWave.style.background = '#7f8c8d';
      this.btnAutoWave.style.color = '#fff';
      this.btnAutoWave.style.opacity = '0.85';
    }
  }

  showAutoCountdown(seconds) {
    if (!this.btnNextWave) return;
    let remaining = seconds;
    this.btnNextWave.textContent = `NEXT WAVE IN ${remaining}s...`;
    this.btnNextWave.disabled = true;
    this.btnNextWave.style.opacity = '0.7';
    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(interval);
      } else {
        this.btnNextWave.textContent = `NEXT WAVE IN ${remaining}s...`;
      }
    }, 1000);
  }

  showOverlay(title, subtitle) {
    this.overlayTitle.textContent = title;
    this.overlaySubtitle.textContent = subtitle;
    this.overlay.classList.remove('hidden');
  }

  hideOverlay() {
    this.overlay.classList.add('hidden');
  }

  showGameLayout(mapName) {
    this.lobbyView.classList.add('hidden');
    this.gameView.classList.remove('hidden');
    this.hudMapName.textContent = mapName.toUpperCase();
  }

  showLobbyLayout() {
    this.gameView.classList.add('hidden');
    this.lobbyView.classList.remove('hidden');
    this.drawAllStaticPreviews();
    this.renderDailyQuests();
    this.renderLeaderboard(this.game.selectedMap);
    
    // Return back to initial splash choices instead of showing active setups
    this.showSplashState();
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
      ctx.fillStyle = '#000';
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

  startUnboxingAnimation(crateType, chosenAgent, chosenRarity) {
    const overlay = document.getElementById('crate-opening-overlay');
    const canvas = document.getElementById('crate-opening-canvas');
    const revealCard = document.getElementById('crate-reveal-card');
    const revealRarity = document.getElementById('crate-reveal-rarity');
    const revealAgentCanvas = document.getElementById('crate-reveal-agent-canvas');
    const revealName = document.getElementById('crate-reveal-name');

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

    function spawnConfetti(x, y, colorCode) {
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
    }

    // Programmatic splinter particles
    function spawnSplinters(x, y) {
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
    }

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

          setTimeout(() => {
            state = 'revealed';
            revealCard.classList.remove('hidden');
            revealRarity.textContent = chosenRarity.toUpperCase();
            revealRarity.className = `rarity-${chosenRarity}`;
            revealName.textContent = chosenAgent.toUpperCase();
            
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
          <span>${medals[i] || `#${i + 1}`} ${entry.time}</span>
          <span style="color:#95a5a6;font-size:0.7rem;">${entry.date}</span>
        </div>
      `).join('')}
    `;
  }

  showTutorialHint(step) {
    const existing = document.getElementById('tutorial-hint-box');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    const tutorialEl = document.createElement('div');
    tutorialEl.id = 'tutorial-hint-box';
    tutorialEl.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9000;
      background: rgba(20, 30, 50, 0.97);
      border: 2.5px solid #f1c40f;
      border-radius: 14px;
      padding: 14px 22px;
      max-width: 480px;
      width: 90vw;
      box-shadow: 0 6px 30px rgba(0,0,0,0.6);
      display: flex;
      gap: 14px;
      align-items: flex-start;
      animation: tutorialSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
      font-family: var(--font-body, 'Nunito', sans-serif);
    `;
    document.body.appendChild(tutorialEl);

    if (!document.getElementById('tutorial-keyframe-style')) {
      const style = document.createElement('style');
      style.id = 'tutorial-keyframe-style';
      style.textContent = `
        @keyframes tutorialSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(30px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    const messages = [
      {
        icon: '👋',
        title: 'Welcome to Blocky TDS!',
        body: 'Open <strong>Crates</strong> in the CRATES tab to unlock Agents. Equip them in <strong>LOADOUT</strong>, pick a map, then hit <strong>DEPLOY TO MATCH</strong>!'
      },
      {
        icon: '🏗️',
        title: 'Place Your First Agent!',
        body: 'Click any <strong>green tile</strong> on the map canvas to place the selected agent from the sidebar. Avoid placing on the enemy path!'
      },
      {
        icon: '🏗️',
        title: 'Upgrade Your Agent!',
        body: 'Click a placed agent to select it, then press <strong>UPGRADE</strong> in the sidebar. Each level visually transforms your agent and boosts its stats!'
      }
    ];

    const msg = messages[step];
    if (!msg) return;

    tutorialEl.innerHTML = `
      <div style="font-size:2rem;line-height:1;flex-shrink:0;">${msg.icon}</div>
      <div style="flex:1;">
        <div style="font-weight:900;font-size:1rem;color:#f1c40f;margin-bottom:4px;">${msg.title}</div>
        <div style="font-size:0.85rem;color:#ecf0f1;line-height:1.5;">${msg.body}</div>
        <button id="btn-dismiss-tutorial" style="
          margin-top: 10px;
          background: #f1c40f;
          color: #1a1a2e;
          border: none;
          border-radius: 8px;
          font-weight: 900;
          font-size: 0.82rem;
          padding: 5px 14px;
          cursor: pointer;
          letter-spacing: 0.04em;
        ">GOT IT ✓</button>
      </div>
    `;

    const dismissBtn = document.getElementById('btn-dismiss-tutorial');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.dismissTutorial();
        if (!this.game.tutorialCompleted && this.game.tutorialStep === 0) {
          this.game.tutorialCompleted = true;
          this.game.saveStatsToStorage();
        }
      });
    }
  }

  dismissTutorial() {
    const tutorialEl = document.getElementById('tutorial-hint-box');
    if (tutorialEl) {
      tutorialEl.style.opacity = '0';
      tutorialEl.style.transform = 'translateX(-50%) translateY(20px)';
      tutorialEl.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(() => {
        if (tutorialEl.parentNode) tutorialEl.parentNode.removeChild(tutorialEl);
      }, 320);
    }
  }

  showMatchSummaryCard(isVictory) {
    this.overlay.classList.remove('hidden');
    this.overlayTitle.classList.add('hidden');
    this.overlaySubtitle.classList.add('hidden');

    let oldCard = document.getElementById('match-summary-card');
    if (oldCard) oldCard.remove();

    const summaryCard = document.createElement('div');
    summaryCard.id = 'match-summary-card';
    summaryCard.className = 'summary-card-anim';
    summaryCard.style.cssText = `
      background: rgba(20, 30, 50, 0.98);
      border: 4px solid ${isVictory ? '#f1c40f' : '#e74c3c'};
      box-shadow: 0 0 25px ${isVictory ? 'rgba(241,196,15,0.4)' : 'rgba(231,76,60,0.4)'};
      border-radius: 16px;
      padding: 24px;
      width: 360px;
      max-width: 90%;
      text-align: center;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      color: #fff;
    `;

    const mapName = this.game.selectedMap.replace('_', ' ').toUpperCase();
    const finalWave = this.game.wave;
    const durationM = Math.floor(this.game.matchTime / 60);
    const durationS = Math.floor(this.game.matchTime % 60);
    const durationStr = `${String(durationM).padStart(2, '0')}:${String(durationS).padStart(2, '0')}`;

    const mapMult = this.game.selectedMap === 'tundra' ? 1.5 : this.game.selectedMap === 'desert' ? 1.25 : 1.0;
    const isHc = this.game.isHardcore;

    let baseCoins = Math.round((10 + finalWave * 5) * mapMult);
    let baseXP = Math.round((15 + finalWave * 4) * mapMult);

    if (isVictory && isHc) {
      baseCoins *= 3;
      baseXP *= 3;
    }

    summaryCard.innerHTML = `
      <h2 style="font-family: var(--font-title); font-size: 1.8rem; margin-bottom: 8px; color: ${isVictory ? '#f1c40f' : '#e74c3c'}">${isVictory ? '🏆 VICTORY!' : '💀 DEFEATED'}</h2>
      <div style="font-size: 0.85rem; color: #7f8c8d; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 20px;">${mapName} ${isHc ? '<span style="color:#e74c3c; font-weight:900;">[HARDCORE]</span>' : ''}</div>
      
      <div style="display:flex; flex-direction:column; gap:12px; font-weight:800; font-size:0.95rem; margin-bottom: 24px;">
        <div style="display:flex; justify-content:space-between; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 6px;">
          <span>WAVES SURVIVED:</span>
          <span style="color:#f1c40f" id="tally-wave">0</span>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 6px;">
          <span>TIME:</span>
          <span style="color:#3498db" id="tally-time">--:--</span>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 6px;">
          <span>COINS REWARDED:</span>
          <span style="color:#2ecc71" id="tally-coins">0</span>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 6px;">
          <span>XP GAINED:</span>
          <span style="color:#e67e22" id="tally-xp">0</span>
        </div>
      </div>
      
      <button id="btn-summary-close" style="
        background: ${isVictory ? '#f1c40f' : '#e74c3c'};
        color: #111;
        border: none;
        border-radius: 8px;
        padding: 10px 24px;
        font-family: var(--font-title);
        font-weight: 900;
        font-size: 1.1rem;
        cursor: pointer;
        box-shadow: 0 4px 0 rgba(0,0,0,0.3);
        width: 100%;
        transition: transform 0.1s;
      ">RETURN TO LOBBY</button>
    `;

    this.overlay.appendChild(summaryCard);

    const closeBtn = document.getElementById('btn-summary-close');
    closeBtn.addEventListener('click', () => {
      summaryCard.remove();
      this.overlay.classList.add('hidden');
      this.overlayTitle.classList.remove('hidden');
      this.overlaySubtitle.classList.remove('hidden');
      this.game.quitToLobby();
    });

    setTimeout(() => {
      let currentWave = 0;
      let currentCoins = 0;
      let currentXP = 0;

      const waveEl = document.getElementById('tally-wave');
      const timeEl = document.getElementById('tally-time');
      const coinsEl = document.getElementById('tally-coins');
      const xpEl = document.getElementById('tally-xp');

      const waveTally = setInterval(() => {
        if (currentWave < finalWave) {
          currentWave++;
          waveEl.textContent = currentWave;
          soundManager.playTick();
        } else {
          clearInterval(waveTally);
          timeEl.textContent = durationStr;
          soundManager.playTick();

          const coinsTally = setInterval(() => {
            if (currentCoins < baseCoins) {
              currentCoins += Math.ceil(baseCoins / 15);
              if (currentCoins >= baseCoins) currentCoins = baseCoins;
              coinsEl.textContent = `+🪙 ${currentCoins}`;
              soundManager.playTick();
            } else {
              clearInterval(coinsTally);

              const xpTally = setInterval(() => {
                if (currentXP < baseXP) {
                  currentXP += Math.ceil(baseXP / 15);
                  if (currentXP >= baseXP) currentXP = baseXP;
                  xpEl.textContent = `+🌟 ${currentXP} XP`;
                  soundManager.playTick();
                } else {
                  clearInterval(xpTally);
                }
              }, 40);
            }
          }, 40);
        }
      }, 70);
    }, 400);
  }
}