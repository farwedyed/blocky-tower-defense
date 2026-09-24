// src/game-ui.js
// Sub-controller handling the HUD, modifications, tutorial system, and overlays

import { soundManager } from './sound.js';
import { Network } from './network.js';
import { CrazyGamesManager } from './crazygames.js';
import { awardMatchRewards } from './game-storage.js';

export class GameUI {
  constructor(game, parentUI) {
    this.game = game;
    this.parentUI = parentUI;

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

    // Redesigned zero-scroll selection controls
    this.selectionPanel = document.getElementById('selection-panel');
    this.selectionInfo = document.getElementById('selection-info');
    
    // Custom drop-down bindings
    this.targetingSelected = document.getElementById('custom-targeting-selected');
    this.targetingOptions = document.getElementById('custom-targeting-options');

    this.btnUpgrade = document.getElementById('btn-upgrade');
    this.btnSell = document.getElementById('btn-sell');

    this.overlay = document.getElementById('game-overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlaySubtitle = document.getElementById('overlay-subtitle');

    // Commander Dialog bindings
    this.commanderWrapper = document.getElementById('commander-dialog-wrapper');
    this.commanderFaceCanvas = document.getElementById('commander-face-canvas');
    this.commanderText = document.getElementById('commander-dialog-text');
    this.btnCommanderAction = document.getElementById('btn-commander-action');
    this.btnCommanderSkip = document.getElementById('btn-commander-skip');

    // Track active target element for real-time updates
    this.activePointerTarget = null;
    this.activePointerDirection = 'down';

    this.initEventListeners();
  }

  initEventListeners() {
    // Mobile Sidebar slide-out handler
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const gameSidebar = document.getElementById('game-sidebar');
    if (btnToggleSidebar && gameSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        gameSidebar.classList.toggle('sidebar-open');
        if (gameSidebar.classList.contains('sidebar-open')) {
          btnToggleSidebar.textContent = "✕ CLOSE MENU";
          btnToggleSidebar.style.background = "var(--primary-red)";
        } else {
          btnToggleSidebar.textContent = "☰ SHOP & MENU";
          btnToggleSidebar.style.background = "var(--primary-blue)";
        }
      });
    }

    this.btnReturnLobby.addEventListener('click', () => {
      soundManager.playTick(); // Add click sound
      this.game.quitToLobby(true); // Force fully leaving/disconnecting from the co-op match
    });

    this.btnNextWave.addEventListener('click', () => {
      soundManager.playTick(); // Add click sound
      this.game.startNextWave();
    });

    if (this.btnSkipWave) {
      this.btnSkipWave.addEventListener('click', () => {
        soundManager.playTick(); // Add click sound
        this.game.voteSkipWave();
      });
    }

    this.btnSpeed.addEventListener('click', () => {
      soundManager.playTick(); // Add click sound
      if (Network.mode === 'CLIENT') return;
      this.game.toggleSpeed();
    });

    if (this.btnAutoWave) {
      this.btnAutoWave.addEventListener('click', () => {
        soundManager.playTick(); // Add click sound
        this.game.toggleAutoMode();
      });
    }

    // Toggle dropdown options visibility on click
    if (this.targetingSelected && this.targetingOptions) {
      this.targetingSelected.addEventListener('click', (e) => {
        e.stopPropagation();
        this.targetingOptions.classList.toggle('hidden');
      });
    }

    // Handle selecting a dropdown option
    const dropdownOptions = document.querySelectorAll('.dropdown-option');
    dropdownOptions.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = opt.getAttribute('data-value');
        const text = opt.textContent;

        if (this.targetingSelected) {
          this.targetingSelected.textContent = `${text} ▾`;
        }
        if (this.targetingOptions) {
          this.targetingOptions.classList.add('hidden');
        }

        if (this.game.selectedPlacedTower) {
          this.game.selectedPlacedTower.targetingStrategy = value;
          
          // Re-trigger visual dropdown state refresh
          this.updateSelectionPanel(this.game.selectedPlacedTower);
          soundManager.playTick();
        }
      });
    });

    // Close dropdown when clicking anywhere else on document
    document.addEventListener('click', () => {
      if (this.targetingOptions) {
        this.targetingOptions.classList.add('hidden');
      }
    });

    this.btnUpgrade.addEventListener('click', () => {
      this.game.upgradeSelectedTower();
    });

    this.btnSell.addEventListener('click', () => {
      this.game.sellSelectedTower();
    });

    if (this.btnCommanderSkip) {
      this.btnCommanderSkip.addEventListener('click', () => {
        this.game.tutorialCompleted = true;
        this.game.tutorialActive = false; 
        this.game.showMapDirections = false; // Instantly dismiss the overlay instruction message
        this.game.saveStatsToStorage();
        this.dismissTutorial();
        CrazyGamesManager.gameplayStart();
      });
    }

    // Global listener to close upgrade/selection panel when clicking outside
    document.addEventListener('click', (e) => {
      if (this.game.state !== 'playing') return;

      const canvas = document.getElementById('game-canvas');
      const selectionPanel = document.getElementById('selection-panel');
      const sidebarToggle = document.getElementById('btn-toggle-sidebar');

      if (canvas && !canvas.contains(e.target) &&
          selectionPanel && !selectionPanel.contains(e.target) &&
          (!sidebarToggle || !sidebarToggle.contains(e.target))) {
        this.game.setSelectedPlacedTower(null);
      }
    });

    this.overlay.addEventListener('click', (e) => {
      // Locked lose screen overlay click behavior: do not return to lobby on empty clicks
    });
  }

  showInGameAlert(message, title = "TACTICAL NOTICE", onClose = null) {
    // If there's an existing styled alert modal, remove it
    const oldModal = document.getElementById('ingame-custom-alert');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'ingame-custom-alert';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.75);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
    `;

    modal.innerHTML = `
      <div style="
        background: #fff;
        border: 4px solid var(--border-color);
        border-radius: 16px;
        width: 320px;
        padding: 20px;
        box-shadow: 0 8px 0 var(--border-color);
        text-align: center;
        font-family: var(--font-body);
      ">
        <h3 style="
          font-family: var(--font-title);
          font-size: 1.3rem;
          color: #e74c3c;
          margin-bottom: 12px;
          text-shadow: none;
          -webkit-text-stroke: 0;
        ">${title}</h3>
        <p style="
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--text-dark);
          line-height: 1.4;
          margin-bottom: 18px;
        ">${message}</p>
        <button id="btn-custom-alert-ok" class="btn btn-primary" style="
          width: 100%;
          background: var(--primary-blue);
          color: #fff;
          box-shadow: 0 4px 0 var(--primary-blue-dark), 0 4px 0 var(--border-color);
        ">OK</button>
      </div>
    `;

    document.body.appendChild(modal);

    const okBtn = modal.querySelector('#btn-custom-alert-ok');
    okBtn.addEventListener('click', () => {
      soundManager.playTick();
      modal.remove();
      if (typeof onClose === 'function') {
        onClose();
      }
    });
  }

  showCashCaseModal(cashCase) {
    const oldModal = document.getElementById('cash-case-modal');
    if (oldModal) oldModal.remove();

    // CrazyGames requirement: pause active gameplay when opening Cash Case popup
    CrazyGamesManager.gameplayStop();

    const modal = document.createElement('div');
    modal.id = 'cash-case-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.75);
      z-index: 1000000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
    `;

    modal.innerHTML = `
      <div style="
        background: #1a2230;
        border: 4px solid #f1c40f;
        border-radius: 16px;
        width: 320px;
        padding: 20px;
        box-shadow: 0 0 25px rgba(241,196,15,0.4);
        text-align: center;
        color: #fff;
        font-family: var(--font-body);
      ">
        <img src="assets/sprites/CashCase.png" style="width: 64px; height: auto; margin-bottom: 8px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));" />
        <h3 style="font-family: var(--font-title); font-size: 1.4rem; color: #f1c40f; margin-bottom: 6px;">AIRDROP CASH CASE!</h3>
        <p style="font-size: 0.85rem; font-weight: 800; color: #cbd5e1; margin-bottom: 15px;">
          Watch a quick sponsor video to claim <strong style="color: #2ecc71;">+$${cashCase.reward} In-Game Cash</strong>!
        </p>
        <button id="btn-claim-cash-case" class="btn" style="
          width: 100%;
          background: #27ae60;
          color: #fff;
          font-size: 1.05rem;
          padding: 10px;
          margin-bottom: 8px;
          box-shadow: 0 4px 0 #219653;
        "><span style="display:inline-block; border: 2px solid #fff; border-radius: 3px; padding: 1px 5px; font-size: 0.8em; line-height: 1; margin-right: 4px;">▶</span> WATCH AD (+ $${cashCase.reward})</button>
        <button id="btn-dismiss-cash-case" class="btn btn-secondary" style="
          width: 100%;
          background: #34495e;
          color: #fff;
          font-size: 0.85rem;
          padding: 8px;
        ">NO THANKS (DISMISS)</button>
      </div>
    `;

    document.body.appendChild(modal);

    const claimBtn = modal.querySelector('#btn-claim-cash-case');
    const dismissBtn = modal.querySelector('#btn-dismiss-cash-case');

    claimBtn.addEventListener('click', () => {
      claimBtn.disabled = true;
      claimBtn.textContent = "LOADING AD...";

      CrazyGamesManager.requestRewardedAd(
        () => {
          this.game.claimCashCase(window.myPlayerId || 'p1');
          modal.remove();
          // CrazyGames requirement: resume active gameplay when popup closes after reward
          CrazyGamesManager.gameplayStart();
        },
        () => {
          claimBtn.disabled = false;
          claimBtn.innerHTML = `<span style="display:inline-block; border: 2px solid #fff; border-radius: 3px; padding: 1px 5px; font-size: 0.8em; line-height: 1; margin-right: 4px;">▶</span> WATCH AD (+ $${cashCase.reward})`;
        }
      );
    });

    dismissBtn.addEventListener('click', () => {
      soundManager.playTick();
      modal.remove();
      // CrazyGames requirement: Cash Case must disappear immediately when offer popup is closed
      this.game.dismissCashCase();
      // CrazyGames requirement: resume active gameplay when popup is dismissed
      CrazyGamesManager.gameplayStart();
    });
  }

  drawCommanderFace() {
    if (!this.commanderFaceCanvas) return;
    const ctx = this.commanderFaceCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.commanderFaceCanvas.width;
    const h = this.commanderFaceCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    
    // Face base (Skin)
    ctx.fillStyle = '#ffdbac';
    ctx.fillRect(10, 10, 50, 50);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 50, 50);

    // Shades
    ctx.fillStyle = '#111';
    ctx.fillRect(14, 25, 17, 9);
    ctx.fillRect(39, 25, 17, 9);
    ctx.fillRect(31, 28, 8, 2);

    // Mouth (Stern expression)
    ctx.fillStyle = '#222';
    ctx.fillRect(25, 48, 20, 3);

    // Military Cap
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(6, 6, 58, 12);
    ctx.strokeRect(6, 6, 58, 12);
    
    // Gold trim band on cap
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(10, 14, 50, 4);

    // Cap Peak visor
    ctx.fillStyle = '#111';
    ctx.fillRect(4, 16, 12, 4);
    ctx.fillRect(54, 16, 12, 4);

    ctx.restore();
  }

  showPointerAt(targetElement, direction = 'down') {
    this.hidePointer();
    if (!this.game.tutorialActive) return; // Prevent pointers outside tutorial
    if (!targetElement) return;

    this.activePointerTarget = targetElement;
    this.activePointerDirection = direction;

    const arrow = document.createElement('div');
    arrow.id = 'active-tut-arrow';
    arrow.style.cssText = `
      position: fixed;
      z-index: 20000;
      pointer-events: none;
      width: 0;
      height: 0;
      border-left: 12px solid transparent;
      border-right: 12px solid transparent;
      border-top: 20px solid #f1c40f;
      filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6));
      transition: all 0.2s ease-out;
    `;

    document.body.appendChild(arrow);
    this.repositionPointer(targetElement, direction);
  }

  showPointerAtCanvasCenter() {
    this.hidePointer();
    if (!this.game.tutorialActive) return;
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    const arrow = document.createElement('div');
    arrow.id = 'active-tut-arrow';
    arrow.style.cssText = `
      position: fixed;
      z-index: 20000;
      pointer-events: none;
      width: 0;
      height: 0;
      border-left: 12px solid transparent;
      border-right: 12px solid transparent;
      border-top: 20px solid #f1c40f;
      filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6));
      transition: all 0.2s ease-out;
    `;
    document.body.appendChild(arrow);

    const reposition = () => {
      const rect = canvas.getBoundingClientRect();
      arrow.style.animation = 'tutArrowBounce 0.6s infinite ease-in-out';
      arrow.style.transform = 'none';
      arrow.style.top = `${rect.top + rect.height / 2 - 45}px`;
      arrow.style.left = `${rect.left + rect.width / 2 - 12}px`;
    };

    reposition();
    window.addEventListener('resize', reposition);
    arrow._cleanupResize = () => window.removeEventListener('resize', reposition);
  }

  showPointerAtCanvasTile(col, row) {
    this.hidePointer();
    if (!this.game.tutorialActive) return;
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    const arrow = document.createElement('div');
    arrow.id = 'active-tut-arrow';
    arrow.style.cssText = `
      position: fixed;
      z-index: 20000;
      pointer-events: none;
      width: 0;
      height: 0;
      border-left: 12px solid transparent;
      border-right: 12px solid transparent;
      border-top: 20px solid #f1c40f;
      filter: drop-shadow(0 3px 5px rgba(0,0,0,0.6));
      transition: all 0.2s ease-out;
    `;
    document.body.appendChild(arrow);

    const reposition = () => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / 800;
      const scaleY = rect.height / 600;
      
      const tileX = (col * 40 + 20) * scaleX;
      const tileY = (row * 40 + 20) * scaleY;

      arrow.style.animation = 'tutArrowBounce 0.6s infinite ease-in-out';
      arrow.style.transform = 'none';
      arrow.style.top = `${rect.top + tileY - 45}px`;
      arrow.style.left = `${rect.left + tileX - 12}px`;
    };

    reposition();
    window.addEventListener('resize', reposition);
    arrow._cleanupResize = () => window.removeEventListener('resize', reposition);
  }

  repositionPointer(targetElement, direction = 'down') {
    const arrow = document.getElementById('active-tut-arrow');
    if (!arrow || !targetElement) return;

    const rect = targetElement.getBoundingClientRect();

    if (direction === 'down') {
      arrow.style.animation = 'tutArrowBounce 0.6s infinite ease-in-out';
      arrow.style.transform = 'none';
      arrow.style.top = `${rect.top - 28}px`;
      arrow.style.left = `${rect.left + rect.width / 2 - 12}px`;
    } else if (direction === 'left') {
      arrow.style.animation = 'tutArrowBounceLeft 0.6s infinite ease-in-out';
      arrow.style.transform = 'rotate(90deg)';
      arrow.style.top = `${rect.top + rect.height / 2 - 10}px`;
      arrow.style.left = `${rect.right + 12}px`;
    } else if (direction === 'right') {
      arrow.style.animation = 'tutArrowBounceRight 0.6s infinite ease-in-out';
      arrow.style.transform = 'rotate(-90deg)';
      arrow.style.top = `${rect.top + rect.height / 2 - 10}px`;
      arrow.style.left = `${rect.left - 28}px`;
    }
  }

  hidePointer() {
    this.activePointerTarget = null;
    const arrow = document.getElementById('active-tut-arrow');
    if (arrow) {
      if (arrow._cleanupResize) {
        arrow._cleanupResize();
      }
      arrow.remove();
    }
  }

  renderPlacementShop() {
    try {
      this.equippedAgentsList.innerHTML = '';

      this.game.equippedAgents.forEach(type => {
        if (!type || typeof type !== 'string') return;

        const btn = document.createElement('button');
        btn.className = `placement-btn ${this.game.selectedShopTower === type ? 'active' : ''}`;
        btn.setAttribute('data-type', type);

        let name = type.replace('_', ' ').toUpperCase();
        if (type === 'dj') name = 'DJ Booth';
        const cost = this.game.getTowerCost(type);

        btn.innerHTML = `
          <div class="icon"><canvas width="45" height="45"></canvas></div>
          <div class="info">
            <span class="name" style="text-transform: uppercase;">${name}</span>
            <span class="cost">$${cost}</span>
          </div>
        `;

        const cvs = btn.querySelector('canvas');
        
        if (this.parentUI.lobby) {
          this.parentUI.lobby.drawAgentPreview(cvs, type);
        }

        btn.addEventListener('click', () => {
          soundManager.playTick(); // Add click sound
          document.querySelectorAll('.placement-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.game.setSelectedShopTower(type);
          this.game.setSelectedPlacedTower(null);
        });

        this.equippedAgentsList.appendChild(btn);
      });
    } catch (e) {
      console.error("Defensive Guard: Error caught in renderPlacementShop():", e);
    }
  }

  updateHUD(lives, gold, wave, maxWaves) {
    try {
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

      if (this.btnSkipWave) {
        // Only allow showing Skip Wave controls on the Host machine
        const showSkip = this.game.waveInProgress && this.game.wave < this.game.maxWaves && Network.mode !== 'CLIENT';
        if (showSkip) {
          this.btnSkipWave.style.display = 'block';
          this.btnSkipWave.classList.remove('hidden');

          if (this.game.skipCooldown > 0) {
            this.btnSkipWave.disabled = true;
            this.btnSkipWave.style.opacity = '0.5';
            this.btnSkipWave.textContent = `COOLDOWN (${Math.ceil(this.game.skipCooldown)}s)`;
          } else {
            this.btnSkipWave.disabled = false;
            this.btnSkipWave.style.opacity = '1.0';
            const votesCount = Network.mode === 'CLIENT' ? (this.game.skipVotesCount || 0) : (this.game.skipVotes ? this.game.skipVotes.size : 0);
            const votesReq = Network.mode === 'CLIENT' ? (this.game.skipVotesRequired || 1) : Math.ceil((Network.conns.filter(c => c && c.open).length + 1) / 2);
            
            if (votesCount > 0) {
              this.btnSkipWave.textContent = `SKIP VOTE (${votesCount}/${votesReq})`;
            } else {
              this.btnSkipWave.textContent = "SKIP WAVE";
            }
          }
        } else {
          this.btnSkipWave.style.display = 'none';
          this.btnSkipWave.classList.add('hidden');
        }
      }

      if (this.btnSpeed) {
        if (Network.mode === 'CLIENT') {
          this.btnSpeed.disabled = true;
          this.btnSpeed.style.opacity = '0.6';
        } else {
          this.btnSpeed.disabled = false;
          this.btnSpeed.style.opacity = '1.0';
        }
      }

      if (this.btnAutoWave) {
        if (Network.mode === 'CLIENT') {
          this.btnAutoWave.style.display = 'none';
          this.btnAutoWave.classList.add('hidden');
        } else {
          this.btnAutoWave.style.display = 'block';
          this.btnAutoWave.classList.remove('hidden');
        }
      }
      // Update unit placement limit badge
      const limitBadge = document.getElementById('placement-limit-badge');
      if (limitBadge) {
        const totalTowers = this.game.grid.towers.size;
        limitBadge.textContent = `${totalTowers} / 40 PLACED`;
        if (totalTowers >= 40) {
          limitBadge.style.background = 'var(--primary-red)';
        } else {
          limitBadge.style.background = 'var(--primary-orange)';
        }
      }

      if (this.game.selectedPlacedTower) {
        this.updateSelectionPanel(this.game.selectedPlacedTower);
      }
    } catch (e) {
      console.error("Defensive Guard: Error caught in updateHUD():", e);
    }
  }

  updateSelectionPanel(agent) {
    if (!agent) {
      this.selectionPanel.classList.add('hidden');
      return;
    }

    this.selectionPanel.classList.remove('hidden');
    document.querySelectorAll('.placement-btn').forEach(b => b.classList.remove('active'));

    // Update custom dropdown selected item text
    if (this.targetingSelected) {
      this.targetingSelected.textContent = `${agent.targetingStrategy.toUpperCase()} ▾`;
    }

    // Refresh option item selected/active visual backgrounds
    const optElements = document.querySelectorAll('.dropdown-option');
    optElements.forEach(opt => {
      if (opt.getAttribute('data-value') === agent.targetingStrategy) {
        opt.classList.add('active');
        opt.style.background = 'var(--primary-blue)';
        opt.style.color = '#fff';
      } else {
        opt.classList.remove('active');
        opt.style.background = '';
        opt.style.color = '';
      }
    });

    const upgradeCost = agent.getUpgradeCost();
    const sellValue = agent.getSellValue();

    let displayName = agent.name;
    if (agent.type === 'crook_boss') displayName = 'Crook Boss';
    else if (agent.type === 'military_base') displayName = 'Military Base';
    else if (agent.type === 'dj') displayName = 'DJ Booth';

    let detailsHtml = `
      <p class="unit-name" style="text-transform: uppercase;">${displayName} <span style="color: #f39c12">Lvl ${agent.level} / 5</span></p>
      <p class="unit-stats">Damage: ${Math.round(agent.damage)} | Range: ${Math.round(agent.range * (agent.djRangeBuffed ? 1.15 : 1.0))}px | Rate: ${(agent.fireRate * (agent.commanderSpeedBuffed ? 1.35 : 1.0)).toFixed(1)}/s</p>
    `;

    // Specialized Agent details description
    if (agent.type === 'commander') {
      detailsHtml += `<p class="unit-stats" style="color: #e74c3c">Call to Arms: Active speed buffs for nearby agents.</p>`;
    } else if (agent.type === 'dj') {
      detailsHtml += `<p class="unit-stats" style="color: #9b59b6">Plays Tracks: Range expansion & upgrade cost discount inside aura.</p>`;
    } else if (agent.type === 'pyromancer') {
      const burnDps = 15 + agent.level * 4;
      detailsHtml += `<p class="unit-stats" style="color: #e67e22">Fire Spray DoT: ${burnDps} Dmg/sec. Removes lead armors.</p>`;
    } else if (agent.type === 'farm') {
      const income = agent.getHarvestIncome();
      detailsHtml += `<p class="unit-stats" style="color: #2ecc71">Wave Harvest Income: +$${income}</p>`;
    } else if (agent.type === 'gladiator') {
      detailsHtml += `<p class="unit-stats" style="color: #7f8c8d">Centurion Plume: Extreme fast melee cleave swings.</p>`;
    } else if (agent.type === 'soldier') {
      detailsHtml += `<p class="unit-stats" style="color: #27ae60">Assault Rifle: Rapid burst-fire configurations.</p>`;
    } else if (agent.type === 'sniper') {
      detailsHtml += `<p class="unit-stats" style="color: #e67e22">Sniper Scope: Heavy slow long-range armor-piercing tracer bullets.</p>`;
    } else if (agent.type === 'medic') {
      detailsHtml += `<p class="unit-stats" style="color: #2ecc71">Syringe Gun: Active heals base HP & cleanses active stun locks.</p>`;
    } else if (agent.type === 'rocketeer') {
      detailsHtml += `<p class="unit-stats" style="color: #95a5a6">Rocket Launcher: Slow high-damage heavy explosive splash impact.</p>`;
    } else if (agent.type === 'demoman') {
      detailsHtml += `<p class="unit-stats" style="color: #e67e22">Demolition Grenades: Quick area splash explosions.</p>`;
    } else if (agent.type === 'freezer') {
      detailsHtml += `<p class="unit-stats" style="color: #3498db">Freezing Beams: Sells freeze slow effects to stun marching zombies.</p>`;
    } else if (agent.type === 'shotgunner') {
      detailsHtml += `<p class="unit-stats" style="color: #34495e">Shotgun Spread: Launches multiple pellets in close-range cones.</p>`;
    } else if (agent.type === 'crook_boss') {
      detailsHtml += `<p class="unit-stats" style="color: #d4ac0d">Reinforcements Call: Tommy gun fire and periodic guard deployments.</p>`;
    } else if (agent.type === 'military_base') {
      detailsHtml += `<p class="unit-stats" style="color: #27ae60">Heavy Assembly: Deploys heavy armored military vehicles along path.</p>`;
    } else if (agent.type === 'ranger') {
      detailsHtml += `<p class="unit-stats" style="color: #ff0055">Heavy Railgun: Massive single-target damage, but cannot detect Camo.</p>`;
    } else if (agent.type === 'turret') {
      detailsHtml += `<p class="unit-stats" style="color: #00ffe0">Laser Gatling: Blazing-fast rapid laser bullet output stream.</p>`;
    }

    const targetingContainer = document.querySelector('.targeting-container');
    if (targetingContainer) {
      if (agent.type === 'farm' || agent.type === 'military_base') {
        targetingContainer.style.display = 'none';
      } else {
        targetingContainer.style.display = 'flex';
      }
    }

    this.selectionInfo.innerHTML = detailsHtml;

    // Detect if device is a standard computer (non-touch/mouse-pointer Fine)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    const hotkeySuffixUpgrade = !isMobile ? ' [U]' : '';
    const hotkeySuffixSell = !isMobile ? ' [S]' : '';

    if (agent.level >= 5) {
      this.btnUpgrade.textContent = "MAX LEVEL";
      this.btnUpgrade.disabled = true;
      this.btnUpgrade.style.opacity = '0.5';
    } else {
      this.btnUpgrade.textContent = `UPGRADE ($${upgradeCost})${hotkeySuffixUpgrade}`;
      if (this.game.gold < upgradeCost) {
        this.btnUpgrade.disabled = true;
        this.btnUpgrade.style.opacity = '0.5';
      } else {
        this.btnUpgrade.disabled = false;
        this.btnUpgrade.style.opacity = '1.0';
      }
    }

    this.btnSell.textContent = `SELL ($${sellValue})${hotkeySuffixSell}`;

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
      btnAbility.className = 'btn btn-secondary';
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
        btnAbility.textContent = "ABILITY";
        btnAbility.disabled = false;
        btnAbility.style.opacity = '1.0';
        btnAbility.style.background = '#f39c12';
        btnAbility.style.color = '#fff';
      }

      btnAbility.onclick = () => {
        const handled = agent.activateAbility(this.game.effectManager, this.game);
        if (handled) {
          this.updateSelectionPanel(agent);
        }
      };
    } else {
      btnAbility.className = 'btn btn-secondary hidden';
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
      if (Network.mode === 'CLIENT') {
        this.btnNextWave.textContent = "WAITING FOR HOST";
        this.btnNextWave.disabled = true;
        this.btnNextWave.style.opacity = '0.6';
      } else {
        this.btnNextWave.textContent = "START WAVE";
        this.btnNextWave.disabled = false;
        this.btnNextWave.style.opacity = '1.0';
      }
    }
  }

  updateSpeedButton(multiplier) {
    if (this.btnSpeed) {
      this.btnSpeed.textContent = `SPEED x${multiplier}`;
    }
  }

  updateAutoWaveButton(isOn) {
    if (!this.btnAutoWave) return;
    
    if (Network.mode === 'CLIENT') {
      this.btnAutoWave.style.display = 'none';
      this.btnAutoWave.classList.add('hidden');
      return;
    }

    if (isOn) {
      this.btnAutoWave.textContent = 'AUTO WAVE: ON';
      this.btnAutoWave.style.background = '#27ae60';
      this.btnAutoWave.style.color = '#fff';
      this.btnAutoWave.style.opacity = '1.0';
      this.btnAutoWave.style.display = 'block';      // Ensure visible for Host
      this.btnAutoWave.classList.remove('hidden');
    } else {
      this.btnAutoWave.textContent = 'AUTO WAVE: OFF';
      this.btnAutoWave.style.background = '#7f8c8d';
      this.btnAutoWave.style.color = '#fff';
      this.btnAutoWave.style.opacity = '0.85';
      this.btnAutoWave.style.display = 'block';      // Ensure visible for Host
      this.btnAutoWave.classList.remove('hidden');
    }
  }

  showAutoCountdown(seconds) {
    if (!this.btnNextWave) return;
    if (Network.mode === 'CLIENT') {
      this.btnNextWave.textContent = "WAITING FOR HOST";
      this.btnNextWave.disabled = true;
      this.btnNextWave.style.opacity = '0.6';
    } else {
      this.btnNextWave.textContent = `NEXT WAVE IN ${seconds}s...`;
      this.btnNextWave.disabled = true;
      this.btnNextWave.style.opacity = '0.7';
    }
  }

  showOverlay(title, subtitle) {
    this.overlayTitle.textContent = title;
    this.overlaySubtitle.textContent = subtitle;
    this.overlay.className = 'overlay-content';
  }

  hideOverlay() {
    const callout = document.getElementById('cg-like-bottom-callout');
    if (callout) callout.remove();
    this.overlay.className = 'overlay-content hidden';
  }

  showGameLayout(mapName) {
    if (this.parentUI.lobby) {
      this.parentUI.lobby.lobbyView.classList.add('hidden');
    }
    this.parentUI.gameView.classList.remove('hidden');
    this.hudMapName.textContent = mapName.toUpperCase();
    this.hidePointer();

    try {
      soundManager.startAmbience();
    } catch (e) {
      console.warn("[Sound] Ambience playback deferred until user interaction:", e);
    }

    if (this.game.tutorialActive) {
      this.showTutorialHint(0.5); 
    }
  }

  showLobbyLayout() {
    this.parentUI.gameView.classList.add('hidden');
    this.parentUI.lobbyView.classList.remove('hidden');
    this.dismissCommanderDialog(); 
    
    soundManager.stopAmbience();

    if (this.parentUI.lobby) {
      // Force immediate update of displayed Coins, Level, and XP in the menu
      this.parentUI.lobby.updateLobbyMeta(this.game.playerLevel, this.game.playerXp, this.game.playerCoins);
      this.parentUI.lobby.drawAllStaticPreviews();
      this.parentUI.lobby.renderDailyQuests();
      this.parentUI.lobby.renderLeaderboard(this.game.selectedMap);
    }
    CrazyGamesManager.gameplayStop();
    if (this.parentUI.lobby) {
      // If still in a co-op party, return to the Squad Lobby; otherwise return to the Solo Menu
      if (typeof Network !== 'undefined' && Network.mode !== 'OFFLINE' && Network.roomId) {
        this.parentUI.lobby.showCoopLobbyState();
      } else {
        this.parentUI.lobby.showSplashState();
      }
    }
  }

  showTutorialHint(step) {
    if (!this.game.tutorialActive) return;
    this.dismissCommanderDialog(); 
    if (!this.commanderWrapper) return;

    this.commanderWrapper.classList.remove('hidden');
    this.drawCommanderFace();

    const messages = {
      0.5: "Welcome to the battleground, rookie! I am your Commander. Tap anywhere on the map grid to clear the direction directives and ready up.",
      1: "Let's set up a perimeter. Select the Scout from your troops panel on the right.",
      1.5: "Excellent. Now, place your Scout near the path (like the highlighted tile). You can place him anywhere valid!",
      2: "Good job! Now, tap directly on your placed Scout to select him.",
      2.5: "Great! Now press UPGRADE in your action panel to power him up before starting the wave.",
      3: "Looking strong! Now, press 'START WAVE' to summon the training zombies!",
      4: "Superb work, rookie. You've mastered the basics of Blocky Tower Defense 2d. Dismissed!"
    };

    this.commanderText.textContent = messages[step] || "Awaiting operational instructions...";

    if (this.btnCommanderSkip) {
      if (step >= 0.5 && step < 4) {
        this.btnCommanderSkip.style.display = 'block';
      } else {
        this.btnCommanderSkip.style.display = 'none';
      }
    }

    if (step === 4) {
      this.btnCommanderAction.textContent = "FINISH TUTORIAL ✓";
      this.btnCommanderAction.onclick = () => {
        this.game.tutorialCompleted = true;
        this.game.tutorialActive = false; 
        this.game.saveStatsToStorage();
        this.dismissTutorial();
        CrazyGamesManager.gameplayStart();
      };
    } else {
      this.btnCommanderAction.textContent = "GOT IT ✓";
      this.btnCommanderAction.onclick = () => {
        this.dismissCommanderDialog(); 
      };
    }

    this.activateStepPointers(step);
  }

  showCommanderAnnouncement(msg) {
    if (!this.commanderWrapper) return;

    if (this.btnCommanderSkip) {
      this.btnCommanderSkip.style.display = 'none';
    }

    this.commanderWrapper.classList.remove('hidden');
    this.drawCommanderFace();
    this.commanderText.textContent = msg;
    this.btnCommanderAction.textContent = "DISMISS ✓";
    this.btnCommanderAction.onclick = () => {
      this.dismissCommanderDialog();
    };
  }

  activateStepPointers(step) {
    this.hidePointer();
    if (!this.game.tutorialActive) return;

    if (step === 0.5) {
      this.showPointerAtCanvasCenter(); 
    }
    else if (step === 1) {
      const scoutBtn = this.equippedAgentsList.querySelector('.placement-btn[data-type="scout"]');
      if (scoutBtn) {
        this.showPointerAt(scoutBtn, 'right');
        scoutBtn.classList.add('tut-highlight');

        const onScoutSelect = () => {
          scoutBtn.removeEventListener('click', onScoutSelect);
          scoutBtn.classList.remove('tut-highlight');
          this.hidePointer();
          if (this.game.tutorialActive) {
            this.game.tutorialStep = 1.5;
            this.showTutorialHint(1.5);
          }
        };
        scoutBtn.addEventListener('click', onScoutSelect);
      }
    } 
    else if (step === 1.5) {
      this.showPointerAtCanvasTile(2, 2); 
    }
    else if (step === 2) {
      let scout = null;
      for (const t of this.game.grid.towers.values()) {
        if (t.type === 'scout') {
          scout = t;
          break;
        }
      }
      if (scout) {
        this.showPointerAtCanvasTile(scout.gridX, scout.gridY);
      } else {
        this.showPointerAtCanvasTile(2, 2);
      }
    }
    else if (step === 2.5) {
      if (this.btnUpgrade) {
        this.showPointerAt(this.btnUpgrade, 'left');
        this.btnUpgrade.classList.add('tut-highlight');
      }
    }
    else if (step === 3) {
      if (this.btnNextWave) {
        this.showPointerAt(this.btnNextWave, 'down');
        this.btnNextWave.classList.add('tut-highlight');
      }
    }
  }

  dismissCommanderDialog() {
    if (this.commanderWrapper) {
      this.commanderWrapper.classList.add('hidden'); 
    }
  }

  dismissTutorial() {
    document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
    this.hidePointer();

    if (this.btnCommanderSkip) {
      this.btnCommanderSkip.style.display = 'none';
    }

    this.dismissCommanderDialog(); 
  }

  showMatchSummaryCard(isVictory) {
    this.overlay.classList.remove('hidden');
    this.overlayTitle.classList.add('hidden');
    this.overlaySubtitle.classList.add('hidden');

    let oldCard = document.getElementById('match-summary-card');
    if (oldCard) oldCard.remove();
    let oldCallout = document.getElementById('cg-like-bottom-callout');
    if (oldCallout) oldCallout.remove();

    // Awards and persists match rewards immediately on summary appearance
    const rewards = awardMatchRewards(this.game);

    const summaryCard = document.createElement('div');
    summaryCard.id = 'match-summary-card';
    summaryCard.className = 'summary-card-anim';
    summaryCard.style.cssText = `
      background: rgba(20, 30, 50, 0.98);
      border: 4px solid ${isVictory ? '#f1c40f' : '#e74c3c'};
      box-shadow: 0 0 25px ${isVictory ? 'rgba(241,196,15,0.4)' : 'rgba(231,76,60,0.4)'};
      border-radius: 14px;
      padding: 10px 16px 14px 16px;
      width: 360px;
      max-width: 90%;
      max-height: 88vh;
      overflow-y: auto;
      text-align: center;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      color: #fff;
      -webkit-overflow-scrolling: touch;
    `;

    const mapName = this.game.selectedMap.replace('_', ' ').toUpperCase();
    const finalWave = this.game.wave;
    const durationM = Math.floor(this.game.matchTime / 60);
    const durationS = Math.floor(this.game.matchTime % 60);
    const durationStr = `${String(durationM).padStart(2, '0')}:${String(durationS).padStart(2, '0')}`;

    const baseCoins = rewards.coinsEarned;
    const baseXP = rewards.xpEarned;

    let reviveButtonHtml = '';
    if (!isVictory && !this.game.hasRevivedThisMatch) {
      reviveButtonHtml = `
        <button id="btn-summary-revive" class="btn" style="
          background: #27ae60;
          color: #fff;
          width: 100%;
          font-size: 1.0rem;
          padding: 10px;
          margin-bottom: 6px;
          box-shadow: 0 3px 0 #219653, 0 3px 0 var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        "><span style="display:inline-block; border: 2px solid #fff; border-radius: 3px; padding: 1px 5px; font-size: 0.8em; line-height: 1;">▶</span> WATCH AD TO REVIVE (+50 LIVES)</button>
      `;
    }

    // ─── CRAZYGAMES LIKE PROMPT BANNER ───
    const likePromptHtml = `
      <div id="summary-like-prompt" style="
        margin: 10px 0 6px 0;
        background: linear-gradient(135deg, rgba(241, 196, 15, 0.15), rgba(46, 204, 113, 0.15));
        border: 2px dashed #f1c40f;
        border-radius: 10px;
        padding: 8px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        animation: pulseLikePrompt 2.2s infinite ease-in-out;
      ">
        <div style="text-align: left; line-height: 1.3;">
          <div style="font-family: var(--font-title); font-size: 0.95rem; color: #f1c40f; font-weight: 900;">
            ENJOYING BTD 2D?
          </div>
          <div style="font-size: 0.74rem; color: #ecf0f1; font-weight: 800;">
            Please leave a <strong style="color: #2ecc71;">👍 Like</strong> below the game!
          </div>
        </div>
        <div style="font-size: 1.6rem; animation: bounceDownArrow 0.8s infinite alternate ease-in-out;">
          👇
        </div>
      </div>
    `;

    const feedbackSubmittedBefore = localStorage.getItem('tds_feedback_submitted') === 'true';
    let feedbackFormHtml = '';

    if (!feedbackSubmittedBefore) {
      feedbackFormHtml = `
        <div id="summary-feedback-container" style="
          margin-top: 8px;
          background: rgba(241, 196, 15, 0.04);
          border: 2px dashed rgba(241, 196, 15, 0.3);
          border-radius: 8px;
          padding: 8px 10px;
          text-align: left;
          transition: all 0.2s ease;
        ">
          <label for="input-feedback-msg" style="
            font-family: var(--font-title);
            font-size: 0.75rem;
            font-weight: 900;
            color: #f1c40f;
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
            text-shadow: 1px 1px 0 #000;
          ">
            📝 HELP IMPROVE THE GAME! (SUGGESTIONS & BUGS)
          </label>
          <div style="display:flex; gap:6px; align-items: center;">
            <input type="text" id="input-feedback-msg" placeholder="Write feedback here..." style="
              flex: 1;
              font-size: 0.75rem;
              padding: 5px;
              border: 2px solid var(--border-color);
              border-radius: 6px;
              outline: none;
            "/>
            <button id="btn-submit-feedback" class="btn btn-primary" style="font-size: 0.68rem; padding: 5px 10px; margin: 0; min-height: 28px;">SEND</button>
          </div>
        </div>
      `;
    }

    let returnButtonsHtml = '';
    if (Network.mode !== 'OFFLINE') {
      returnButtonsHtml = `
        <button id="btn-summary-close" class="btn btn-primary" style="width:100%; font-size:1.0rem; padding:10px; margin-top:8px; box-shadow:0 3px 0 var(--primary-blue-dark), 0 3px 0 var(--border-color);">RETURN TO SQUAD LOBBY</button>
        <button id="btn-summary-disconnect" class="btn btn-secondary" style="width:100%; font-size:0.85rem; padding:8px; margin-top:6px; background:var(--primary-red); color:#fff; box-shadow:0 2px 0 var(--primary-red-dark), 0 2px 0 var(--border-color);">LEAVE PARTY & EXIT</button>
      `;
    } else {
      returnButtonsHtml = `
        <button id="btn-summary-close" class="btn btn-primary" style="width:100%; font-size:1.0rem; padding:10px; margin-top:8px; box-shadow:0 3px 0 var(--primary-blue-dark), 0 3px 0 var(--border-color);">RETURN TO MAIN MENU</button>
      `;
    }

    summaryCard.innerHTML = `
      <h2 style="font-family:var(--font-title); font-size:1.5rem; margin-bottom:10px; color:${isVictory ? 'var(--primary-yellow)' : 'var(--primary-red)'}">${isVictory ? '🏆 VICTORY' : '💀 DEFEAT'}</h2>
      <div style="font-size:0.82rem; font-weight:800; margin-bottom:10px;">
        <p>MAP: <span style="color:var(--primary-blue)">${mapName}</span> | WAVES: <span style="color:var(--primary-yellow-dark)" id="tally-wave">0</span> | TIME: <span style="color:#00ffe0" id="tally-time">--:--</span></p>
      </div>
      <div style="display:flex; gap:8px; justify-content:center; font-weight:900; margin-bottom:12px;">
        <div style="background:rgba(255,255,255,0.06); padding:6px; border-radius:8px; border:2px solid var(--border-color); flex:1;">
          <span style="font-size:0.68rem; color:var(--text-muted)">REWARD COINS</span>
          <p style="font-size:1.1rem; color:var(--primary-yellow)" id="tally-coins">+<img src="https://img.icons8.com/color/48/coins.png" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" /> 0</p>
        </div>
        <div style="background:rgba(255,255,255,0.06); padding:6px; border-radius:8px; border:2px solid var(--border-color); flex:1;">
          <span style="font-size:0.68rem; color:var(--text-muted)">REWARD XP</span>
          <p style="font-size:1.1rem; color:var(--primary-green)" id="tally-xp">+🌟 0 XP</p>
        </div>
      </div>
      ${reviveButtonHtml}
      ${likePromptHtml}
      ${feedbackFormHtml}
      ${returnButtonsHtml}
    `;

    this.overlay.appendChild(summaryCard);

    // ─── BOTTOM-LEFT POINTER CALLOUT (Points straight to CrazyGames thumbs-up rating button) ───
    const cgLikeCallout = document.createElement('div');
    cgLikeCallout.id = 'cg-like-bottom-callout';
    cgLikeCallout.style.cssText = `
      position: absolute;
      bottom: 12px;
      left: 16px;
      z-index: 10001;
      background: #111827;
      border: 2.5px solid #2ecc71;
      border-radius: 12px;
      padding: 6px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.7), 0 0 14px rgba(46, 204, 113, 0.4);
      animation: floatLikeCallout 2s infinite ease-in-out;
      pointer-events: none;
    `;
    cgLikeCallout.innerHTML = `
      <span style="font-size: 1.4rem;">👍</span>
      <div style="text-align: left; line-height: 1.15;">
        <span style="font-family: var(--font-title); font-size: 0.8rem; font-weight: 900; color: #ffffff;">Leave a Like below!</span><br/>
        <span style="font-size: 0.65rem; color: #2ecc71; font-weight: 800;">(CrazyGames Rating)</span>
      </div>
      <span style="font-size: 1.3rem; animation: bounceDownArrow 0.7s infinite alternate ease-in-out;">👇</span>
    `;
    this.overlay.appendChild(cgLikeCallout);

    const feedbackInput = document.getElementById('input-feedback-msg');
    const feedbackContainer = document.getElementById('summary-feedback-container');
    if (feedbackInput && feedbackContainer) {
      feedbackInput.addEventListener('focus', () => {
        feedbackContainer.style.borderColor = '#f1c40f';
        feedbackContainer.style.background = 'rgba(241, 196, 15, 0.08)';
        feedbackInput.style.borderColor = '#f1c40f';
      });
      feedbackInput.addEventListener('blur', () => {
        feedbackContainer.style.borderColor = 'rgba(241, 196, 15, 0.3)';
        feedbackContainer.style.background = 'rgba(241, 196, 15, 0.04)';
        feedbackInput.style.borderColor = 'var(--border-color)';
      });
    }

    const btnSubmitFeedback = document.getElementById('btn-submit-feedback');
    const inputFeedbackMsg = document.getElementById('input-feedback-msg');
    
    if (btnSubmitFeedback && inputFeedbackMsg) {
      btnSubmitFeedback.addEventListener('click', () => {
        const text = inputFeedbackMsg.value.trim();
        if (!text) return;

        import('./firebase.js').then((fb) => {
          const contextMeta = {
            mapId: this.game.selectedMap,
            finalWave: finalWave,
            isVictory: isVictory
          };
          fb.uploadFeedback(text, isVictory ? 5 : 3, contextMeta);

          localStorage.setItem('tds_feedback_submitted', 'true');

          btnSubmitFeedback.textContent = "✓ SENT";
          btnSubmitFeedback.disabled = true;
          btnSubmitFeedback.style.background = "#27ae60";
          btnSubmitFeedback.style.borderColor = "#27ae60";
          btnSubmitFeedback.style.boxShadow = "none";
          btnSubmitFeedback.style.color = "#fff";
          inputFeedbackMsg.disabled = true;
          inputFeedbackMsg.value = "Thank you for the support!";
        }).catch(err => console.warn('Failed to load firebase context:', err));
      });
    }

    const cleanupCallout = () => {
      const callout = document.getElementById('cg-like-bottom-callout');
      if (callout) callout.remove();
    };

    const reviveBtn = document.getElementById('btn-summary-revive');
    if (reviveBtn) {
      reviveBtn.addEventListener('click', () => {
        reviveBtn.disabled = true;
        reviveBtn.textContent = "LOADING AD...";

        CrazyGamesManager.requestRewardedAd(
          () => {
            cleanupCallout();
            if (Network.mode === 'CLIENT') {
              Network.conn.send({ type: 'REQUEST_TEAM_REVIVE' });
            } else {
              this.game.revivePlayer();
              if (Network.mode === 'HOST') {
                Network.broadcastToAll({ type: 'TEAM_REVIVE' });
              }
            }
            summaryCard.remove();
            this.overlay.className = 'overlay-content hidden';
            this.overlayTitle.classList.remove('hidden');
            this.overlaySubtitle.classList.remove('hidden');
          },
          () => {
            reviveBtn.disabled = false;
            reviveBtn.innerHTML = `<span style="display:inline-block; border: 2px solid #fff; border-radius: 3px; padding: 1px 5px; font-size: 0.8em; line-height: 1;">▶</span> WATCH AD TO REVIVE (+50 LIVES)`;
          }
        );
      });
    }

    const closeBtn = document.getElementById('btn-summary-close');
    closeBtn.addEventListener('click', () => {
      cleanupCallout();
      summaryCard.remove();
      this.overlay.className = 'overlay-content hidden';
      this.overlayTitle.classList.remove('hidden');
      this.overlaySubtitle.classList.remove('hidden');
      this.game.quitToLobby(false);
    });

    const disconnectBtn = document.getElementById('btn-summary-disconnect');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        cleanupCallout();
        Network.intentionalDisconnect = true;
        
        summaryCard.remove();
        this.overlay.className = 'overlay-content hidden';
        this.overlayTitle.classList.remove('hidden');
        this.overlaySubtitle.classList.remove('hidden');
        this.game.quitToLobby(true);
      });
    }

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

          if (isVictory) {
            CrazyGamesManager.happytime();
          }

          const coinsTally = setInterval(() => {
            if (currentCoins < baseCoins) {
              currentCoins += Math.ceil(baseCoins / 15);
              if (currentCoins >= baseCoins) currentCoins = baseCoins;
              coinsEl.innerHTML = `+<img src="https://img.icons8.com/color/48/coins.png" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 2px;" /> ${currentCoins}`;
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
              }, 30);
            }
          }, 30);
        }
      }, 50);
    }, 300);
  }
}