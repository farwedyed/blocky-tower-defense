// src/game-ui.js
// Sub-controller handling the HUD, modifications, tutorial system, and overlays

import { soundManager } from './sound.js';
import { Network } from './network.js';
import { CrazyGamesManager } from './crazygames.js';

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

    // Selection controls
    this.selectionPanel = document.getElementById('selection-panel');
    this.selectionInfo = document.getElementById('selection-info');
    this.selectTargeting = document.getElementById('select-targeting');
    this.btnUpgrade = document.getElementById('btn-upgrade');
    this.btnSell = document.getElementById('btn-sell');

    this.overlay = document.getElementById('game-overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlaySubtitle = document.getElementById('overlay-subtitle');

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
      this.game.quitToLobby();
    });

    this.btnNextWave.addEventListener('click', () => {
      this.game.startNextWave();
    });

    if (this.btnSkipWave) {
      this.btnSkipWave.addEventListener('click', () => {
        this.game.voteSkipWave();
      });
    }

    this.btnSpeed.addEventListener('click', () => {
      if (Network.mode === 'CLIENT') return;
      this.game.toggleSpeed();
    });

    if (this.btnAutoWave) {
      this.btnAutoWave.addEventListener('click', () => {
        this.game.toggleAutoMode();
      });
    }

    this.selectTargeting.addEventListener('change', (e) => {
      if (this.game.selectedPlacedTower) {
        this.game.selectedPlacedTower.targetingStrategy = e.target.value;
      }
    });

    this.btnUpgrade.addEventListener('click', () => {
      this.game.upgradeSelectedTower();
    });

    this.btnSell.addEventListener('click', () => {
      this.game.sellSelectedTower();
    });

    this.overlay.addEventListener('click', (e) => {
      const targetTag = e.target.tagName;
      if (targetTag === 'INPUT' || targetTag === 'BUTTON' || targetTag === 'TEXTAREA') {
        return;
      }
      if (this.game.state === 'gameover' || this.game.state === 'victory') {
        const activeSummaryCard = document.getElementById('match-summary-card');
        if (activeSummaryCard && activeSummaryCard.contains(e.target)) {
          return;
        }
        this.game.quitToLobby();
        this.hideOverlay();
      }
    });
  }

  showPointerAt(targetElement, direction = 'down') {
    this.hidePointer();
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
      arrow.style.transform = 'rotate(-90deg)';
      arrow.style.top = `${rect.top + rect.height / 2 - 10}px`;
      arrow.style.left = `${rect.right + 12}px`;
    } else if (direction === 'right') {
      arrow.style.animation = 'tutArrowBounceRight 0.6s infinite ease-in-out';
      arrow.style.transform = 'rotate(90deg)';
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
      
      if (this.parentUI.lobby) {
        this.parentUI.lobby.drawAgentPreview(cvs, type);
      }

      btn.addEventListener('click', () => {
        document.querySelectorAll('.placement-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.game.setSelectedShopTower(type);
        this.game.setSelectedPlacedTower(null);
      });

      this.equippedAgentsList.appendChild(btn);
    });
  }

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

    if (this.btnSkipWave) {
      const showSkip = this.game.waveInProgress && this.game.spawnQueue.length === 0 && this.game.wave < this.game.maxWaves;
      if (showSkip) {
        this.btnSkipWave.classList.remove('hidden');
        const votesCount = Network.mode === 'CLIENT' ? (this.game.skipVotesCount || 0) : (this.game.skipVotes ? this.game.skipVotes.size : 0);
        const votesReq = Network.mode === 'CLIENT' ? (this.game.skipVotesRequired || 1) : Math.ceil((Network.conns.filter(c => c && c.open).length + 1) / 2);
        
        if (votesCount > 0) {
          this.btnSkipWave.textContent = `SKIP VOTE (${votesCount}/${votesReq})`;
        } else {
          this.btnSkipWave.textContent = "SKIP WAVE";
        }
      } else {
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

    if (this.game.selectedPlacedTower) {
      this.updateSelectionPanel(this.game.selectedPlacedTower);
    }
  }

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
    
    if (Network.mode === 'CLIENT') {
      this.btnNextWave.textContent = "WAITING FOR HOST";
      this.btnNextWave.disabled = true;
      this.btnNextWave.style.opacity = '0.6';
    } else {
      this.btnNextWave.textContent = `NEXT WAVE IN ${remaining}s...`;
      this.btnNextWave.disabled = true;
      this.btnNextWave.style.opacity = '0.7';
    }

    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(interval);
      } else {
        if (Network.mode === 'CLIENT') {
          this.btnNextWave.textContent = "WAITING FOR HOST";
        } else {
          this.btnNextWave.textContent = `NEXT WAVE IN ${remaining}s...`;
        }
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
    if (this.parentUI.lobby) {
      this.parentUI.lobby.lobbyView.classList.add('hidden');
    }
    this.parentUI.gameView.classList.remove('hidden');
    this.hudMapName.textContent = mapName.toUpperCase();
    
    CrazyGamesManager.gameplayStart();
    this.hidePointer();

    if (!this.game.tutorialCompleted) {
      this.showPointerAtCanvasCenter();
    }
  }

  showLobbyLayout() {
    this.parentUI.gameView.classList.add('hidden');
    this.parentUI.lobbyView.classList.remove('hidden');
    
    if (this.parentUI.lobby) {
      this.parentUI.lobby.drawAllStaticPreviews();
      this.parentUI.lobby.renderDailyQuests();
      this.parentUI.lobby.renderLeaderboard(this.game.selectedMap);
    }
    CrazyGamesManager.gameplayStop();
    if (this.parentUI.lobby) {
      this.parentUI.lobby.showSplashState();
    }
  }

  showTutorialHint(step) {
    this.dismissTutorial();

    const isMobileSize = window.innerWidth <= 900 || window.innerHeight <= 600;
    if (isMobileSize) {
      this.activateStepPointers(step);
      return;
    }

    const existing = document.getElementById('tutorial-hint-box');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));

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
        body: 'Equip your loadout, select a map, and tap <strong style="color: #f1c40f;">PLAY SOLO</strong> or <strong style="color: #f1c40f;">DEPLOY</strong> to begin your defense!'
      },
      {
        icon: '🏗️',
        title: 'Deploy Your First Scout!',
        body: 'Select the <strong style="color: #f1c40f;">Scout</strong> in your sidebar placement panel, then tap the <strong style="color: #f1c40f;">glowing yellow tile</strong> on the map grid to place him!'
      },
      {
        icon: '🌊',
        title: 'Send in the Horde!',
        body: 'Tap the <strong style="color: #f1c40f;">START WAVE</strong> button in your controls sidebar to summon the first wave of training zombies!'
      },
      {
        icon: '🔼',
        title: 'Upgrade Your Scout!',
        body: 'Tap your placed Scout on the field to select him, then choose <strong style="color: #2ecc71;">UPGRADE</strong> in the modifications panel to increase his fire rate and damage!'
      }
    ];

    let msgIndex = 0;
    if (step === 0) msgIndex = 0;
    else if (step === 1) msgIndex = 1;
    else if (step === 1.5) msgIndex = 2;
    else if (step === 2) msgIndex = 3;
    const msg = messages[msgIndex];
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

    this.activateStepPointers(step);

    const dismissBtn = document.getElementById('btn-dismiss-tutorial');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.dismissTutorialHintOnly();
      });
    }
  }

  activateStepPointers(step) {
    this.hidePointer();

    if (step === 0) {
      const playSoloBtn = document.getElementById('btn-select-solo');
      if (playSoloBtn && document.getElementById('lobby-splash-container').style.display !== 'none') {
        this.showPointerAt(playSoloBtn, 'down');
        playSoloBtn.classList.add('tut-highlight');

        const onSoloClick = () => {
          playSoloBtn.removeEventListener('click', onSoloClick);
          playSoloBtn.classList.remove('tut-highlight');
          this.hidePointer();

          setTimeout(() => {
            if (this.parentUI.lobby && this.parentUI.lobby.btnDeploy) {
              const deployBtn = this.parentUI.lobby.btnDeploy;
              this.showPointerAt(deployBtn, 'down');
              deployBtn.classList.add('tut-highlight');
            }
          }, 350);
        };
        playSoloBtn.addEventListener('click', onSoloClick);
      } else {
        if (this.parentUI.lobby && this.parentUI.lobby.btnDeploy) {
          const deployBtn = this.parentUI.lobby.btnDeploy;
          this.showPointerAt(deployBtn, 'down');
          deployBtn.classList.add('tut-highlight');
        }
      }
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
        };
        scoutBtn.addEventListener('click', onScoutSelect);
      }
    } 
    else if (step === 1.5) {
      const startWaveBtn = document.getElementById('btn-next-wave');
      if (startWaveBtn) {
        this.showPointerAt(startWaveBtn, 'down');
        startWaveBtn.classList.add('tut-highlight');
      }
    }
    else if (step === 2) {
      if (this.game.selectedPlacedTower && this.game.selectedPlacedTower.gridX === 2 && this.game.selectedPlacedTower.gridY === 1) {
        if (this.btnUpgrade) {
          this.showPointerAt(this.btnUpgrade, 'right');
          this.btnUpgrade.classList.add('tut-highlight');
        }
      } else {
        this.game.effectManager.spawnText(400, 300, "TAP YOUR SCOUT TO SELECT!", '#f1c40f');
      }
    }
  }

  dismissTutorialHintOnly() {
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

  dismissTutorial() {
    this.dismissTutorialHintOnly();
    document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
    this.hidePointer();
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
      padding: 16px 20px 20px 20px;
      width: 360px;
      max-width: 90%;
      max-height: 95vh;
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

    const mapMult = this.game.selectedMap === 'tundra' ? 1.5 : this.game.selectedMap === 'desert' ? 1.25 : 1.0;
    const isHc = this.game.isHardcore;

    let baseCoins = Math.round((10 + finalWave * 5) * mapMult);
    let baseXP = Math.round((15 + finalWave * 4) * mapMult);

    if (isVictory && isHc) {
      baseCoins *= 3;
      baseXP *= 3;
    }

    let reviveButtonHtml = '';
    if (!isVictory && !this.game.hasRevivedThisMatch) {
      reviveButtonHtml = `
        <button id="btn-summary-revive" class="btn" style="
          background: #27ae60;
          color: #fff;
          width: 100%;
          font-size: 1.1rem;
          margin-bottom: 8px;
          box-shadow: 0 4px 0 #219653, 0 4px 0 var(--border-color);
        ">📺 WATCH AD TO REVIVE (+50 LIVES)</button>
      `;
    }

    const feedbackSubmittedBefore = localStorage.getItem('tds_feedback_submitted') === 'true';
    let feedbackFormHtml = '';

    if (!feedbackSubmittedBefore) {
      feedbackFormHtml = `
        <div id="summary-feedback-container" style="
          margin-top: 14px;
          background: rgba(241, 196, 15, 0.04);
          border: 2px dashed rgba(241, 196, 15, 0.3);
          border-radius: 10px;
          padding: 10px 12px;
          text-align: left;
          transition: all 0.2s ease;
        ">
          <label for="input-feedback-msg" style="
            font-family: var(--font-title);
            font-size: 0.8rem;
            font-weight: 900;
            color: #f1c40f;
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 6px;
            text-shadow: 1px 1px 0 #000;
          ">
            📝 HELP IMPROVE THE GAME! (SUGGESTIONS & BUGS)
          </label>
          <div style="display:flex; gap:6px; align-items: center;">
            <input type="text" id="input-feedback-msg" placeholder="Type a suggestion or bug report..." style="
              flex:1;
              background: rgba(0, 0, 0, 0.35);
              border: 2px solid var(--border-color);
              border-radius: 8px;
              color: #fff;
              padding: 8px 12px;
              font-size: 0.82rem;
              font-weight: 700;
              outline: none;
              min-height: 38px;
              box-sizing: border-box;
              transition: border-color 0.2s;
            " />
            <button id="btn-submit-feedback" class="btn" style="
              background: var(--primary-yellow);
              color: #000;
              font-family: var(--font-title);
              font-size: 0.8rem;
              font-weight: 900;
              padding: 0 14px;
              height: 38px;
              box-shadow: 0 3px 0 var(--primary-yellow-dark), 0 3px 0 var(--border-color);
              border-radius: 8px;
              border-width: 2px;
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
            ">SEND</button>
          </div>
        </div>
      `;
    }

    summaryCard.innerHTML = `
      <h2 style="font-family: var(--font-title); font-size: 1.8rem; margin-bottom: 6px; color: ${isVictory ? '#f1c40f' : '#e74c3c'}">${isVictory ? '🏆 VICTORY!' : '💀 DEFEATED'}</h2>
      <div style="font-size: 0.85rem; color: #7f8c8d; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 12px;">${mapName} ${isHc ? '<span style="color:#e74c3c; font-weight:900;">[HARDCORE]</span>' : ''}</div>
      
      <div style="display:flex; flex-direction:column; gap:8px; font-weight:800; font-size:0.95rem; margin-bottom: 12px;">
        <div style="display:flex; justify-content:space-between; border-bottom: 1px dashed rgba(255,255,255,0.15); padding-bottom: 4px;">
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
      
      ${reviveButtonHtml}
      ${feedbackFormHtml}
      
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
        margin-top: 10px;
        transition: transform 0.1s;
      ">RETURN TO LOBBY</button>
    `;

    this.overlay.appendChild(summaryCard);

    // Active Input Glow Effects
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
        }).catch(err => console.warn('Failed to load firebase connection context:', err));
      });
    }

    const reviveBtn = document.getElementById('btn-summary-revive');
    if (reviveBtn) {
      reviveBtn.addEventListener('click', () => {
        CrazyGamesManager.requestRewardedAd(() => {
          this.game.revivePlayer();
          summaryCard.remove();
          this.overlay.classList.add('hidden');
          this.overlayTitle.classList.remove('hidden');
          this.overlaySubtitle.classList.remove('hidden');
        });
      });
    }

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

          if (isVictory) {
            CrazyGamesManager.happytime();
          }

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