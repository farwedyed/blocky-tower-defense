// src/lobby-ui.js
// Orchestrator module coordinating tabs, visual profiles, progression status, and delegated sub-controllers.

import { LobbyCoop } from './lobby-coop.js';
import { LobbyWizard } from './lobby-wizard.js';
import { LobbyCrate } from './lobby-crate.js';
import { LobbyLoadout } from './lobby-loadout.js';
import { drawAgentPreviewOnCanvas, drawBossPreviewOnCanvas } from './game-renderer.js';
import { soundManager } from './sound.js';
import { CrazyGamesManager } from './crazygames.js';
import { Network } from './network.js';

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

    // Guard against triggering startup animations or confetti
    this._animationsReady = false;
    this._armTimer = null;
    this._lastDisplayedCoins = undefined;
    this._lastDisplayedLevel = undefined;
    this._lastDisplayedXp = undefined;

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
        0%, 100% { transform: translateX(0) rotate(90deg); }
        50% { transform: translateX(-10px) rotate(90deg); }
      }
      @keyframes tutArrowBounceRight {
        0%, 100% { transform: translateX(0) rotate(-90deg); }
        50% { transform: translateX(10px) rotate(-90deg); }
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
        nameInput.disabled = true; // Disable editing on auth sync
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

  showCoopLobbyState() {
    this.coop.showCoopLobbyState();
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
      }
      if (diffStep) diffStep.classList.add('hidden');
      if (prepStep) prepStep.classList.add('hidden');
    }
  }

  triggerStep1Pointer() {
    // Left intentionally empty: the lobby wizard never displays tutorial highlights
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
          this.buyAgentFromShopDirect(type, cost);
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

    // ─── REDIRECT TO AGENT SHOP BUTTON (FROM LEVEL 5 LOCK) ───
    const btnGoToShop = document.getElementById('btn-go-to-agent-shop');
    if (btnGoToShop) {
      btnGoToShop.addEventListener('click', () => {
        soundManager.playTick();
        const shopTab = document.querySelector('.tab-btn[data-target="panel-shop"]');
        if (shopTab) {
          shopTab.click();
        }
      });
    }

    // ─── FREE COINS TAB & REWARDED AD CONTROLLERS ───
    const btnAddCoins = document.getElementById('btn-add-coins');
    const btnTabWatchAd = document.getElementById('btn-tab-watch-ad-coins');
    const tabCoinsRemaining = document.getElementById('tab-coins-remaining');

    const getDailyAdCount = () => {
      const todayStr = new Date().toLocaleDateString();
      const stored = localStorage.getItem('tds_daily_coin_ads');
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.date === todayStr) {
          return parsed.count;
        }
      } catch (e) {}
      return 0;
    };

    const incrementDailyAdCount = () => {
      const todayStr = new Date().toLocaleDateString();
      const current = getDailyAdCount();
      localStorage.setItem('tds_daily_coin_ads', JSON.stringify({ date: todayStr, count: current + 1 }));
    };

    const updateCoinsTabState = () => {
      const count = getDailyAdCount();
      const remaining = Math.max(0, 5 - count);
      if (tabCoinsRemaining) {
        tabCoinsRemaining.textContent = `${remaining} / 5 AVAILABLE TODAY`;
      }
      if (btnTabWatchAd) {
        if (remaining <= 0) {
          btnTabWatchAd.disabled = true;
          btnTabWatchAd.textContent = "DAILY LIMIT REACHED (COME BACK TOMORROW)";
          btnTabWatchAd.style.background = "#7f8c8d";
          btnTabWatchAd.style.opacity = "0.6";
          btnTabWatchAd.style.boxShadow = "none";
        } else {
          btnTabWatchAd.disabled = false;
          btnTabWatchAd.innerHTML = `<span class="ad-play-icon">▶</span> WATCH AD (+150 COINS)`;
          btnTabWatchAd.style.background = "var(--primary-green)";
          btnTabWatchAd.style.opacity = "1.0";
          btnTabWatchAd.style.boxShadow = "0 5px 0 var(--primary-green-dark), 0 5px 0 var(--border-color)";
        }
      }
    };

    // Clicking "+" in the header immediately opens the FREE COINS tab
    if (btnAddCoins) {
      btnAddCoins.addEventListener('click', () => {
        soundManager.playTick();
        const coinsTab = document.querySelector('.tab-btn[data-target="panel-coins"]');
        if (coinsTab) {
          coinsTab.click();
        }
      });
    }

    // Refresh state whenever tab is clicked
    const coinsTabBtn = document.querySelector('.tab-btn[data-target="panel-coins"]');
    if (coinsTabBtn) {
      coinsTabBtn.addEventListener('click', () => {
        updateCoinsTabState();
      });
    }

    if (btnTabWatchAd) {
      btnTabWatchAd.addEventListener('click', () => {
        const count = getDailyAdCount();
        if (count >= 5) return;

        btnTabWatchAd.disabled = true;
        btnTabWatchAd.textContent = "LOADING AD...";

        CrazyGamesManager.requestRewardedAd(
          () => {
            // Reward earned: +150 Coins!
            this.game.playerCoins += 150;
            this.game.saveStatsToStorage();
            incrementDailyAdCount();
            this.updateLobbyMeta(this.game.playerLevel, this.game.playerXp, this.game.playerCoins);
            soundManager.playVictory();
            this.game.effectManager.spawnText(400, 260, "+150 COINS!", "#f1c40f");
            updateCoinsTabState();
          },
          () => {
            // Error or closed early
            btnTabWatchAd.disabled = false;
            updateCoinsTabState();
          }
        );
      });
    }

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

    // Centralized Event Delegation to handle Navigation Back buttons perfectly
    document.addEventListener('click', (e) => {
      const backBtn = e.target.closest('#btn-back-to-modes-solo, #btn-back-to-modes-coop');
      if (backBtn) {
        e.preventDefault();
        soundManager.playTick();
        
        // Always disconnect cleanly if leaving co-op mode via ANY change mode button
        if (Network.mode !== 'OFFLINE') {
          try {
            Network.intentionalDisconnect = true;
            if (Network.connectionTimeout) clearTimeout(Network.connectionTimeout);
            if (Network.connectionWatchdog) clearTimeout(Network.connectionWatchdog);

            CrazyGamesManager.leaveRoomPresence();

            const url = new URL(window.location.href);
            if (url.searchParams.has('roomId')) {
              url.searchParams.delete('roomId');
              window.history.replaceState({}, document.title, url.pathname + url.search);
            }

            Network.disconnect();
          } catch(err) {
            console.warn("Disconnection error handled gracefully:", err);
          }
        }

        // Restore splash layout
        this.showSplashState();
      }
    });
  }

  buyAgentFromShopDirect(type, cost) {
    if (this.game.playerCoins >= cost) {
      this.game.playerCoins -= cost;
      this.game.unlockedAgents.push(type);
      this.game.saveStatsToStorage();
      this.updateLobbyMeta(this.game.playerLevel, this.game.playerXp, this.game.playerCoins);
      this.game.effectManager.spawnText(400, 260, "AGENT RECRUITED!", '#2ecc71');
      soundManager.playPlace();
    } else {
      this.parentUI.gameUI.showInGameAlert("Not enough coins to recruit this agent!", "INSUFFICIENT FUNDS ⚠️");
    }
  }

  updateCoopPlayerList() {
    this.coop.updateCoopPlayerList();
  }

  animateCoinIncrease(startVal, targetVal) {
    const valEl = this.playerCoinsVal || document.getElementById('player-coins-val');
    const badgeEl = this.playerCoins || document.getElementById('player-coins');
    if (!valEl) return;

    if (this._coinAnimInterval) {
      clearInterval(this._coinAnimInterval);
      this._coinAnimInterval = null;
    }

    if (badgeEl) {
      badgeEl.classList.remove('coin-badge-animate');
      void badgeEl.offsetWidth;
      badgeEl.classList.add('coin-badge-animate');
      setTimeout(() => {
        if (badgeEl) badgeEl.classList.remove('coin-badge-animate');
      }, 1100);
    }

    const duration = 850;
    const startTime = performance.now();
    const diff = targetVal - startVal;

    this._coinAnimInterval = setInterval(() => {
      const now = performance.now();
      const progress = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(startVal + diff * ease);

      valEl.textContent = current.toLocaleString();

      if (soundManager && typeof soundManager.playTick === 'function') {
        soundManager.playTick();
      }

      if (progress >= 1) {
        clearInterval(this._coinAnimInterval);
        this._coinAnimInterval = null;
        valEl.textContent = targetVal.toLocaleString();
        this._lastDisplayedCoins = targetVal;
      }
    }, 45);
  }

  animateXpIncrease(startVal, targetVal, level) {
    const fillEl = this.playerXpFill || document.getElementById('player-xp-fill');
    const textEl = this.playerXpText || document.getElementById('player-xp-text');
    const containerEl = document.querySelector('.xp-bar-container');
    if (!fillEl) return;

    const maxVal = level * 100;
    if (containerEl) containerEl.classList.add('xp-bar-glowing');

    const duration = 650;
    const startTime = performance.now();
    const diff = targetVal - startVal;

    const interval = setInterval(() => {
      const now = performance.now();
      const progress = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(startVal + diff * ease);
      const pct = Math.min(100, (current / maxVal) * 100);

      fillEl.style.width = `${pct}%`;
      if (textEl) textEl.textContent = `${current} / ${maxVal}`;

      if (progress >= 1) {
        clearInterval(interval);
        fillEl.style.width = `${Math.min(100, (targetVal / maxVal) * 100)}%`;
        if (textEl) textEl.textContent = `${targetVal} / ${maxVal}`;
        if (containerEl) {
          setTimeout(() => containerEl.classList.remove('xp-bar-glowing'), 300);
        }
      }
    }, 40);
  }

  animateLevelUp(prevLevel, prevXp, targetLevel, targetXp) {
    const levelEl = this.playerLevel || document.getElementById('player-level');
    const fillEl = this.playerXpFill || document.getElementById('player-xp-fill');
    const textEl = this.playerXpText || document.getElementById('player-xp-text');
    const containerEl = document.querySelector('.xp-bar-container');

    const prevMax = prevLevel * 100;
    const targetMax = targetLevel * 100;

    // Step 1: Fill XP bar to 100% of previous level
    if (containerEl) containerEl.classList.add('xp-bar-glowing');
    if (fillEl) fillEl.style.width = '100%';
    if (textEl) textEl.textContent = `${prevMax} / ${prevMax}`;

    setTimeout(() => {
      // Step 2: Trigger CELEBRATORY LEVEL UP ZOOM & NEON GLOW on level badge
      if (levelEl) {
        levelEl.classList.remove('level-badge-animate');
        void levelEl.offsetWidth;
        levelEl.classList.add('level-badge-animate');
        levelEl.textContent = targetLevel;
      }

      soundManager.playUpgrade();
      if (typeof CrazyGamesManager !== 'undefined' && CrazyGamesManager.happytime) {
        CrazyGamesManager.happytime();
      }

      // Step 3: Reset XP bar to 0% and animate to remainder XP of new level
      if (fillEl) fillEl.style.transition = 'none';
      if (fillEl) fillEl.style.width = '0%';
      if (textEl) textEl.textContent = `0 / ${targetMax}`;

      setTimeout(() => {
        if (fillEl) fillEl.style.transition = 'width 0.3s ease';
        this.animateXpIncrease(0, targetXp, targetLevel);
      }, 100);

      setTimeout(() => {
        if (levelEl) levelEl.classList.remove('level-badge-animate');
      }, 1250);
    }, 400);
  }

  updateLobbyMeta(level, xp, coins) {
    const isLobbyVisible = this.lobbyView && !this.lobbyView.classList.contains('hidden');
    const nextLevelXp = level * 100;

    // ─── STARTUP GUARD: Never play animations, sounds, or confetti on boot ───
    if (!this._animationsReady) {
      this._lastDisplayedCoins = coins;
      this._lastDisplayedLevel = level;
      this._lastDisplayedXp = xp;

      if (this.playerLevel) this.playerLevel.textContent = level;
      if (this.playerCoinsVal) {
        this.playerCoinsVal.textContent = coins.toLocaleString();
      } else if (this.playerCoins) {
        const valEl = document.getElementById('player-coins-val');
        if (valEl) valEl.textContent = coins.toLocaleString();
        else this.playerCoins.textContent = `🪙 ${coins}`;
      }

      const percent = Math.min(100, (xp / nextLevelXp) * 100);
      if (this.playerXpFill) this.playerXpFill.style.width = `${percent}%`;
      if (this.playerXpText) this.playerXpText.textContent = `${xp} / ${nextLevelXp}`;

      // Arm animations 1.5s after boot once saved stats are fully loaded
      if (!this._armTimer) {
        this._armTimer = setTimeout(() => {
          this._animationsReady = true;
          if (this.game) {
            this._lastDisplayedCoins = this.game.playerCoins;
            this._lastDisplayedLevel = this.game.playerLevel;
            this._lastDisplayedXp = this.game.playerXp;
          }
        }, 1500);
      }
    } else {
      // ─── ACTIVE GAMEPLAY: COINS ANIMATION ───
      if (coins > this._lastDisplayedCoins && isLobbyVisible) {
        const prev = this._lastDisplayedCoins;
        this._lastDisplayedCoins = coins;
        this.animateCoinIncrease(prev, coins);
      } else {
        if (isLobbyVisible) this._lastDisplayedCoins = coins;
        if (this.playerCoinsVal) {
          this.playerCoinsVal.textContent = coins.toLocaleString();
        } else if (this.playerCoins) {
          const valEl = document.getElementById('player-coins-val');
          if (valEl) valEl.textContent = coins.toLocaleString();
          else this.playerCoins.textContent = `🪙 ${coins}`;
        }
      }

      // ─── ACTIVE GAMEPLAY: LEVEL & XP ANIMATION ───
      if (isLobbyVisible) {
        if (level > this._lastDisplayedLevel) {
          // Player leveled up during gameplay!
          const pLevel = this._lastDisplayedLevel;
          const pXp = this._lastDisplayedXp;
          this._lastDisplayedLevel = level;
          this._lastDisplayedXp = xp;
          this.animateLevelUp(pLevel, pXp, level, xp);
        } else if (xp > this._lastDisplayedXp) {
          // Gained match XP
          const pXp = this._lastDisplayedXp;
          this._lastDisplayedXp = xp;
          this.animateXpIncrease(pXp, xp, level);
        } else {
          this._lastDisplayedLevel = level;
          this._lastDisplayedXp = xp;
          if (this.playerLevel) this.playerLevel.textContent = level;
          const percent = Math.min(100, (xp / nextLevelXp) * 100);
          if (this.playerXpFill) this.playerXpFill.style.width = `${percent}%`;
          if (this.playerXpText) this.playerXpText.textContent = `${xp} / ${nextLevelXp}`;
        }
      } else {
        // Lobby currently hidden (in battle): update DOM quietly
        if (this.playerLevel) this.playerLevel.textContent = level;
        const percent = Math.min(100, (xp / nextLevelXp) * 100);
        if (this.playerXpFill) this.playerXpFill.style.width = `${percent}%`;
        if (this.playerXpText) this.playerXpText.textContent = `${xp} / ${nextLevelXp}`;
      }
    }

    // Toggle Level 5 Cosmetic Shop (Crates) view
    const cratesLockedView = document.getElementById('crates-locked-view');
    const cratesUnlockedView = document.getElementById('crates-unlocked-view');
    if (cratesLockedView && cratesUnlockedView) {
      if (level < 5) {
        cratesLockedView.classList.remove('hidden');
        cratesUnlockedView.classList.add('hidden');
      } else {
        cratesLockedView.classList.add('hidden');
        cratesUnlockedView.classList.remove('hidden');
      }
    }

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
        cyberCard.style.pointerEvents = 'auto';
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