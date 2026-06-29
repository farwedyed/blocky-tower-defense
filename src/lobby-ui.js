// src/lobby-ui.js
// Orchestrator module coordinating tabs, visual profiles, progression status, and delegated sub-controllers.

import { LobbyCoop } from './lobby-coop.js';
import { LobbyWizard } from './lobby-wizard.js';
import { LobbyCrate } from './lobby-crate.js';
import { LobbyLoadout } from './lobby-loadout.js';
import { drawAgentPreviewOnCanvas, drawBossPreviewOnCanvas } from './game-renderer.js';
import { soundManager } from './sound.js';
import { CrazyGamesManager } from './crazygames.js';

export class LobbyUI {
  constructor(game, parentUI) {
    window.lobbyPlayers = window.lobbyPlayers || { p1: "", p2: "", p3: "", p4: "", p5: "", p6: "", p7: "", p8: "" };
    window.myPlayerId = window.myPlayerId || "p1";
    this.game = game;
    this.parentUI = parentUI;

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

    // CrazyGames Profile DOM bindings
    this.cgProfileWidget = document.getElementById('cg-profile-widget');
    this.cgAvatar = document.getElementById('cg-avatar');
    this.cgUsername = document.getElementById('cg-username');
    this.btnCgAuth = document.getElementById('btn-cg-auth');

    // Instantiate modular sub-controllers
    this.coop = new LobbyCoop(this, this.game);
    this.wizard = new LobbyWizard(this, this.game);
    this.crates = new LobbyCrate(this, this.game);
    this.loadout = new LobbyLoadout(this, this.game);

    this.injectCoopControls();
    this.injectTutorialStyles();
    
    this.initEventListeners();
    this.drawAllStaticPreviews();

    // Sync CrazyGames Auth Status
    CrazyGamesManager.onAuthChanged((user) => {
      try {
        this.updateCgProfileUI(user);
      } catch (e) {
        console.warn("[LobbyUI] Failed to update profile UI safely:", e);
      }
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
    this.coop.injectCoopControls();
  }

  showSplashState() {
    this.coop.showSplashState();
  }

  toggleSoloElements(visible) {
    const mapsStep = document.getElementById('wizard-step-maps');
    const diffStep = document.getElementById('wizard-step-diff');
    const prepStep = document.getElementById('wizard-step-prep');

    if (!visible) {
      if (mapsStep) mapsStep.classList.add('hidden');
      if (diffStep) diffStep.classList.add('hidden');
      if (prepStep) prepStep.classList.add('hidden');
    } else {
      if (mapsStep) {
        mapsStep.classList.remove('hidden');
        mapsStep.classList.add('active');
        this.triggerStep1Pointer();
      }
      if (diffStep) diffStep.classList.add('hidden');
      if (prepStep) prepStep.classList.add('hidden');
    }
  }

  triggerStep1Pointer() {
    if (!this.game.tutorialCompleted) {
      this.parentUI.hidePointer();
      document.querySelectorAll('.tut-highlight').forEach(el => el.classList.remove('tut-highlight'));
      
      const nextMapsBtn = document.getElementById('btn-wizard-next-maps');
      if (nextMapsBtn) {
        this.parentUI.showPointerAt(nextMapsBtn, 'down');
        nextMapsBtn.classList.add('tut-highlight');
      }
    }
  }

  initEventListeners() {
    if (this.btnCgAuth) {
      this.btnCgAuth.addEventListener('click', () => {
        CrazyGamesManager.promptAuth();
      });
    }

    // Delegate Connection buttons and matching inputs to coop module
    this.coop.initEventListeners();

    // Delegate Map Step and Difficulty step button triggers to wizard module
    this.wizard.initEventListeners();

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

    const shopPanel = document.getElementById('panel-shop');
    if (shopPanel) {
      shopPanel.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-shop-action');
        if (!btn || btn.disabled) return;

        const card = btn.closest('.shop-card');
        if (!card) return;

        const type = card.getAttribute('data-agent-type');
        const cost = parseInt(btn.getAttribute('data-cost')) || 0;

        if (type && cost > 0) {
          this.game.buyAgentFromShopDirect(type, cost);
        }
      });
    }

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
    this.coop.updateCoopPlayerList();
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

    this.shopCards = document.querySelectorAll('.shop-card');
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
          costText.textContent = (type === 'scout') ? "STARTER" : "UNLOCKED";
          costText.style.color = "var(--primary-green-dark)";
        }
        if (btn) {
          btn.textContent = "UNLOCKED";
          btn.disabled = true;
          btn.style.opacity = '0.6';
          btn.style.background = '#bdc3c7';
          btn.style.borderColor = 'var(--border-color)';
          btn.style.boxShadow = 'none';
        }
      } else {
        card.classList.add('locked');
        card.classList.remove('purchased');
        const cost = parseInt(btn ? btn.getAttribute('data-cost') : '0') || 0;
        
        if (costText) {
          costText.innerHTML = `<img src="https://img.icons8.com/color/48/coins.png" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 2px;" /> ${cost.toLocaleString()}`;
          costText.style.color = "var(--primary-orange)";
        }
        if (btn) {
          btn.textContent = "BUY";
          btn.disabled = false;
          if (coins < cost) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.background = '#e74c3c';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.boxShadow = 'none';
          } else {
            btn.style.opacity = '1.0';
            btn.style.background = 'var(--primary-green)';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.boxShadow = '0 3px 0 var(--primary-green-dark)';
          }
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
    this.loadout.renderLoadoutConfig();
  }

  drawAllStaticPreviews() {
    this.mapCards.forEach(card => {
      const canvas = card.querySelector('.map-preview-canvas');
      const mapId = card.getAttribute('data-map-id');
      if (canvas && mapId) {
        this.drawMapPreview(canvas, mapId);
      }
    });

    this.shopCards = document.querySelectorAll('.shop-card');
    this.shopCards.forEach(card => {
      const canvas = card.querySelector('.agent-preview-canvas');
      const type = card.getAttribute('data-agent-type');
      if (canvas && type) {
        this.drawAgentPreview(canvas, type);
      }
    });

    this.wizard.drawAllBossPreviews();
  }

  drawMapPreview(canvas, mapId) {
    this.wizard.drawMapPreview(canvas, mapId);
  }

  drawAgentPreview(canvas, agentType) {
    drawAgentPreviewOnCanvas(canvas, agentType);
  }

  startUnboxingAnimation(crateType, chosenAgent, chosenRarity, revealedSkinName) {
    this.crates.startUnboxingAnimation(crateType, chosenAgent, chosenRarity, revealedSkinName);
  }

  renderDailyQuests() {
    this.wizard.renderDailyQuests();
  }

  renderLeaderboard(mapId) {
    this.wizard.renderLeaderboard(mapId);
  }
}