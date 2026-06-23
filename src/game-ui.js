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

    // Redesigned zero-scroll selection controls
    this.selectionPanel = document.getElementById('selection-panel');
    this.selectionInfo = document.getElementById('selection-info');
    this.selectTargeting = document.getElementById('select-targeting');
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

  drawCommanderFace() {
    if (!this.commanderFaceCanvas) return;
    const ctx = this.commanderFaceCanvas.getContext('2d');
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

  showPointerAtCanvasTile(col, row) {
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
      const showSkip = this.game.waveInProgress && this.game.wave < this.game.maxWaves;
      if (showSkip) {
        this.btnSkipWave.style.display = 'block';
        this.btnSkipWave.classList.remove('hidden');

        // Added UI Cooldown Visual check and lock to prevent skips spamming [4]
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

    let displayName = agent.name;
    if (agent.type === 'crook_boss') displayName = 'Crook Boss';
    else if (agent.type === 'military_base') displayName = 'Military Base';
    else if (agent.type === 'dj') displayName = 'DJ Booth';

    let detailsHtml = `
      <p class="unit-name" style="text-transform: uppercase;">${displayName} <span style="color: #f39c12">Lvl ${agent.level}</span></p>
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
        btnAbility.textContent = "ABILITY";
        btnAbility.disabled = false;
        btnAbility.style.opacity = '1.0';
        btnAbility.style.background = '#f39c12';
        btnAbility.style.color = '#fff';
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
      this.showTutorialHint(0.5); // Starts at Step 0.5: Point arrow to Canvas to prompt overlay clearance [4]
    }
  }

  showLobbyLayout() {
    this.parentUI.gameView.classList.add('hidden');
    this.parentUI.lobbyView.classList.remove('hidden');
    this.dismissCommanderDialog(); // Safely hide balloon
    
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
    // Only hide balloon on step changes, leaving the physical bouncing pointers visible [4]
    this.dismissCommanderDialog(); 
    if (!this.commanderWrapper) return;

    this.commanderWrapper.classList.remove('hidden');
    this.drawCommanderFace();

    const messages = {
      0.5: "Welcome to the battleground, rookie! I am your Commander. Tap anywhere on the map grid to clear the direction directives and ready up.",
      1: "Let's set up a perimeter. Select the Scout from your troops panel on the right.",
      1.5: "Excellent. Now, place your Scout on the highlighted yellow tile on the field.",
      2: "Good job! Now, tap directly on the placed Scout to select him.",
      2.5: "Great! Now press UPGRADE in your action panel to power him up before starting the wave.",
      3: "Looking strong! Now, press 'START WAVE' to summon the training zombies!",
      4: "Superb work, rookie. You've mastered the basics of Blocky tactical defenses. Dismissed!"
    };

    this.commanderText.textContent = messages[step] || "Awaiting operational instructions...";

    if (step === 4) {
      this.btnCommanderAction.textContent = "FINISH TUTORIAL ✓";
      this.btnCommanderAction.onclick = () => {
        this.game.tutorialCompleted = true;
        this.game.saveStatsToStorage();
        this.dismissTutorial(); // Closes dialog AND removes pointer highlights [4]
      };
    } else {
      this.btnCommanderAction.textContent = "GOT IT ✓";
      this.btnCommanderAction.onclick = () => {
        this.dismissCommanderDialog(); // ONLY hides speech balloon, leaves pointers active! [4]
      };
    }

    this.activateStepPointers(step);
  }

  showCommanderAnnouncement(msg) {
    if (!this.commanderWrapper) return;
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

    if (step === 0.5) {
      this.showPointerAtCanvasCenter(); // Points arrow to the center of the canvas [4]
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
          this.game.tutorialStep = 1.5;
          this.showTutorialHint(1.5);
        };
        scoutBtn.addEventListener('click', onScoutSelect);
      }
    } 
    else if (step === 1.5) {
      this.showPointerAtCanvasTile(2, 1); // Points arrow directly to the glowing tile coordinates (2,1) [4]
    }
    else if (step === 2) {
      this.showPointerAtCanvasTile(2, 1); // Points arrow to placed Scout to select him [4]
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
      this.commanderWrapper.classList.add('hidden'); // ONLY hides dialogue speech bubble, leaving arrows intact [4]
    }
  }

  dismissTutorial() {
    document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
    this.hidePointer();
    this.dismissCommanderDialog(); // Fully hides dialogue overlay [4]
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
            <input type="text" id="input-feedback-msg" placeholder="Write feedback here..." style="
              flex: 1;
              font-size: 0.8rem;
              padding: 6px;
              border: 2px solid var(--border-color);
              border-radius: 6px;
              outline: none;
            "/>
            <button id="btn-submit-feedback" class="btn btn-primary" style="font-size: 0.72rem; padding: 6px 12px; margin: 0; min-height: 32px;">SEND</button>
          </div>
        </div>
      `;
    }

    summaryCard.innerHTML = `
      <h2 style="font-family:var(--font-title); font-size:1.8rem; margin-bottom:15px; color:${isVictory ? 'var(--primary-yellow)' : 'var(--primary-red)'}">${isVictory ? '🏆 VICTORY' : '💀 DEFEAT'}</h2>
      <div style="font-size:0.9rem; font-weight:800; margin-bottom:15px;">
        <p>MAP: <span style="color:var(--primary-blue)">${mapName}</span></p>
        <p>WAVES DEFENDED: <span style="color:var(--primary-yellow-dark)" id="tally-wave">0</span></p>
        <p>TIME ELAPSED: <span style="color:#00ffe0" id="tally-time">--:--</span></p>
      </div>
      <div style="display:flex; gap:10px; justify-content:center; font-weight:900; margin-bottom:20px;">
        <div style="background:rgba(255,255,255,0.06); padding:8px; border-radius:10px; border:2.5px solid var(--border-color); flex:1;">
          <span style="font-size:0.75rem; color:var(--text-muted)">REWARD COINS</span>
          <p style="font-size:1.3rem; color:var(--primary-yellow)" id="tally-coins">+🪙 0</p>
        </div>
        <div style="background:rgba(255,255,255,0.06); padding:8px; border-radius:10px; border:2.5px solid var(--border-color); flex:1;">
          <span style="font-size:0.75rem; color:var(--text-muted)">REWARD XP</span>
          <p style="font-size:1.3rem; color:var(--primary-green)" id="tally-xp">+🌟 0</p>
        </div>
      </div>
      ${reviveButtonHtml}
      ${feedbackFormHtml}
      <button id="btn-summary-close" class="btn btn-primary" style="width:100%; font-size:1.1rem; padding:12px; margin-top:10px; box-shadow:0 4px 0 var(--primary-blue-dark), 0 4px 0 var(--border-color);">RETURN TO LOBBY</button>
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
        }).catch(err => console.warn('Failed to load firebase context:', err));
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