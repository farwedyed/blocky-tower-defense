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

const PREP_BOOST_CASH = 150; // solo-only rewarded start cash

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

    // Fit the username once now and again when the web fonts finish loading
    this.fitUsername();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this.fitUsername()).catch(() => {});
    }

    // Rewarded "+150 coins" ad cooldown ticker (survives tab switches / reloads)
    this._coinAdCooldownTimer = null;
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

  /**
   * Auto-fits the header username so any 6-20 character name stays fully visible
   * inside the profile pill: no overflow and no "..." truncation.
   * 1) single line, shrinking from 44px down to 30px (canvas px, see autoScaleGame)
   * 2) if a very wide name still doesn't fit, wrap it onto two lines.
   */
  fitUsername() {
    const el = this.cgUsername;
    if (!el || !el.parentElement) return;
    const box = el.parentElement;
    const maxW = box.clientWidth - 22; // cluster padding
    const maxH = box.clientHeight - 8;
    if (maxW <= 0) return;

    const setSize = (px) => el.style.setProperty('font-size', px + 'px', 'important');
    el.classList.remove('fit-2line');

    let size = 44;
    setSize(size);
    while (el.scrollWidth > maxW && size > 30) {
      size -= 1;
      setSize(size);
    }
    if (el.scrollWidth <= maxW) return;

    // Very wide names (e.g. 20 x "W"): two lines, still at a readable size
    el.classList.add('fit-2line');
    size = 38;
    setSize(size);
    while ((el.scrollHeight > maxH || el.scrollWidth > maxW) && size > 28) {
      size -= 1;
      setSize(size);
    }
  }

  updateCgProfileUI(user) {
    try {
      this._updateCgProfileUI(user);
    } finally {
      this.fitUsername();
    }
  }

  _updateCgProfileUI(user) {
    if (user) {
      if (this.cgUsername) this.cgUsername.textContent = user.username;
      if (this.cgAvatar) {
        this.cgAvatar.src = user.profilePictureUrl || 'assets/ui/menu/sprite_23.png';
        this.cgAvatar.style.display = 'block';
      }
      if (this.btnCgAuth) {
        this.btnCgAuth.style.display = 'none';
      }
      
      const nameInput = document.getElementById('input-player-name');
      if (nameInput) {
        nameInput.value = user.username;
        nameInput.disabled = true;
      }
    } else {
      if (this.cgUsername) this.cgUsername.textContent = "Guest Player";
      if (this.cgAvatar) {
        this.cgAvatar.src = 'assets/ui/menu/sprite_23.png';
        this.cgAvatar.style.display = 'block';
      }
      if (this.btnCgAuth) {
        this.btnCgAuth.style.display = 'none';
      }
    }
  }

  injectCoopControls() {
    this.coop.injectCoopControls();
  }

  showSplashState() {
    const btnBack = document.getElementById('btn-lobby-back');
    if (btnBack) btnBack.style.display = 'none';
    this.coop.showSplashState();
  }

  showCoopLobbyState() {
    this.coop.showCoopLobbyState();
  }

  toggleSoloElements(visible) {
    const mapsStep = document.getElementById('wizard-step-maps');
    const diffStep = document.getElementById('wizard-step-diff');
    const prepStep = document.getElementById('wizard-step-prep');

    // Remove any stuck inline styles from all wizard steps
    [mapsStep, diffStep, prepStep].forEach(step => {
      if (step) step.style.display = '';
    });

    if (!visible) {
      if (mapsStep) {
        mapsStep.classList.add('hidden');
        mapsStep.classList.remove('active');
      }
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
    const btnLobbyBack = document.getElementById('btn-lobby-back');
    if (btnLobbyBack) {
      btnLobbyBack.addEventListener('click', () => {
        soundManager.playTick();
        // Leaving the co-op screen (or cancelling a join in progress) disconnects cleanly,
        // same as the CHANGE MODE / LEAVE SQUAD buttons.
        const coopHeader = document.getElementById('coop-header-panel');
        const coopVisible = coopHeader && !coopHeader.classList.contains('hidden') && coopHeader.style.display !== 'none';
        const panelMaps = document.getElementById('panel-maps');
        const mapsActive = panelMaps && panelMaps.classList.contains('active');
        const inRoom = Network.mode !== 'OFFLINE' && (!!Network.roomId || Network.isJoining);

        // In a squad but browsing another tab: "back" returns to the squad room
        if (inRoom && !mapsActive) {
          const mapTab = document.querySelector('.tab-btn[data-target="panel-maps"]');
          if (mapTab) mapTab.click();
          return;
        }

        // In a squad on the difficulty/preparation step: "back" returns to the squad room
        if (inRoom && !coopVisible && !Network.isJoining) {
          this.coop.showCoopLobbyState();
          return;
        }

        if (inRoom && coopVisible) {
          try {
            Network.intentionalDisconnect = true;
            CrazyGamesManager.leaveRoomPresence();
            const url = new URL(window.location.href);
            if (url.searchParams.has('roomId')) {
              url.searchParams.delete('roomId');
              window.history.replaceState({}, document.title, url.pathname + url.search);
            }
            Network.disconnect();
          } catch (err) {
            console.warn("Disconnection error handled gracefully:", err);
          }
        }
        this.showSplashState();
      });
    }

    // Delegate Connection buttons and matching inputs to coop module
    this.coop.initEventListeners();

    // Delegate Map Step and Difficulty step button triggers to wizard module
    this.wizard.initEventListeners();

    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPanelId = btn.getAttribute('data-target');
        const btnBack = document.getElementById('btn-lobby-back');

        this.tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Clear inline display styles so all tabs switch instantly
        this.lobbyPanels.forEach(panel => {
          panel.classList.remove('active');
          panel.style.display = '';
          if (panel.id === targetPanelId) {
            panel.classList.add('active');
          }
        });

        // Hide back button on the main splash screen; show it on other sub-menus
        if (targetPanelId === 'panel-maps') {
          const splash = document.getElementById('lobby-splash-container');
          const isSplashVisible = splash && splash.style.display !== 'none' && !splash.classList.contains('hidden');
          if (btnBack) {
            btnBack.style.display = isSplashVisible ? 'none' : 'block';
          }
        } else {
          if (btnBack) btnBack.style.display = 'block';
        }

        this.game.shouldShowSoloGuide = false;
        this.game.soloGuided = true;
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

        // Searches for any card with data-agent-type (works for wide, vert, and standard cards)
        const card = btn.closest('[data-agent-type]');
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

    // ─── 30s COOLDOWN AFTER EACH SUCCESSFUL "+150 COINS" REWARDED AD ───
    // Stored as an absolute timestamp so switching tabs or reloading can't skip it.
    // The cooldown only starts when the reward is granted (adFinished), never on adError.
    const COIN_AD_COOLDOWN_MS = 30000;
    const COOLDOWN_KEY = 'tds_coin_ad_cooldown_until';
    let adRequestInFlight = false;

    const getCooldownRemainingMs = () => {
      let until = 0;
      try { until = parseInt(localStorage.getItem(COOLDOWN_KEY) || '0', 10) || 0; } catch (e) {}
      const left = until - Date.now();
      // Guard against a bogus far-future value (e.g. device clock changed)
      if (left > COIN_AD_COOLDOWN_MS) {
        try { localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COIN_AD_COOLDOWN_MS)); } catch (e) {}
        return COIN_AD_COOLDOWN_MS;
      }
      return Math.max(0, left);
    };

    const startCoinAdCooldown = () => {
      try { localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COIN_AD_COOLDOWN_MS)); } catch (e) {}
      ensureCooldownTicker();
    };

    const ensureCooldownTicker = () => {
      if (this._coinAdCooldownTimer) return;
      this._coinAdCooldownTimer = setInterval(() => {
        updateCoinsTabState();
        if (getCooldownRemainingMs() <= 0) {
          clearInterval(this._coinAdCooldownTimer);
          this._coinAdCooldownTimer = null;
          updateCoinsTabState();
        }
      }, 250);
    };

    const updateCoinsTabState = () => {
      const count = getDailyAdCount();
      const remaining = Math.max(0, 5 - count);
      if (tabCoinsRemaining) {
        tabCoinsRemaining.textContent = `${remaining} / 5`;
      }
      if (btnTabWatchAd) {
        let rewardSpan = btnTabWatchAd.querySelector('.btn-ad-reward');
        let headingSpan = btnTabWatchAd.querySelector('.btn-ad-heading');

        // Automatically rebuild the styled HTML structure if it was ever lost
        if (!headingSpan || !rewardSpan) {
          btnTabWatchAd.innerHTML = `
            <img src="assets/ui/ads/sprite_02.png" class="btn-ad-play-icon" alt="" />
            <div class="btn-ad-text-group">
              <span class="btn-ad-heading">WATCH AD</span>
              <span class="btn-ad-reward">+150 COINS</span>
            </div>
          `;
          headingSpan = btnTabWatchAd.querySelector('.btn-ad-heading');
          rewardSpan = btnTabWatchAd.querySelector('.btn-ad-reward');
        }

        if (adRequestInFlight) {
          // Keep the "PREPARING AD..." state untouched while the ad is running
          return;
        }

        const cooldownMs = getCooldownRemainingMs();

        if (remaining <= 0) {
          btnTabWatchAd.disabled = true;
          btnTabWatchAd.classList.add('disabled');
          btnTabWatchAd.classList.remove('on-cooldown');
          if (headingSpan) headingSpan.textContent = "DAILY LIMIT";
          if (rewardSpan) rewardSpan.textContent = "REACHED";
        } else if (cooldownMs > 0) {
          const secs = Math.ceil(cooldownMs / 1000);
          btnTabWatchAd.disabled = true;
          btnTabWatchAd.classList.add('disabled', 'on-cooldown');
          if (headingSpan) headingSpan.textContent = "COOLDOWN";
          if (rewardSpan) rewardSpan.textContent = `READY IN ${secs}s`;
          ensureCooldownTicker();
        } else {
          btnTabWatchAd.classList.remove('on-cooldown');
          btnTabWatchAd.disabled = false;
          btnTabWatchAd.classList.remove('disabled');
          if (headingSpan) headingSpan.textContent = "WATCH AD";
          if (rewardSpan) rewardSpan.textContent = "+150 COINS";
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

    updateCoinsTabState();

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
        if (adRequestInFlight) return;
        if (getCooldownRemainingMs() > 0) {
          updateCoinsTabState();
          return;
        }

        adRequestInFlight = true;
        btnTabWatchAd.disabled = true;

        // Keep the play icon, styles, and fonts intact while showing clean status
        const headingSpan = btnTabWatchAd.querySelector('.btn-ad-heading');
        const rewardSpan = btnTabWatchAd.querySelector('.btn-ad-reward');
        if (headingSpan) headingSpan.textContent = "LOADING";
        if (rewardSpan) rewardSpan.textContent = "PLEASE WAIT...";

        CrazyGamesManager.requestRewardedAd(
          () => {
            // Reward earned: +150 Coins! Start the 30s cooldown only on success.
            adRequestInFlight = false;
            this.game.playerCoins += 150;
            this.game.saveStatsToStorage();
            incrementDailyAdCount();
            startCoinAdCooldown();
            this.updateLobbyMeta(this.game.playerLevel, this.game.playerXp, this.game.playerCoins);
            soundManager.playVictory();
            this.game.effectManager.spawnText(400, 260, "+150 COINS!", "#f1c40f");
            updateCoinsTabState();
          },
          () => {
            // adError / canceled / timed out: no reward and NO cooldown
            adRequestInFlight = false;
            updateCoinsTabState();
          },
          'free_coins'
        );
      });
    }

    if (this.btnDeploy) {
      this.btnDeploy.addEventListener('click', () => {
        this.game.deployToMatch();
      });
    }

    // ─── SOLO START BOOST (rewarded ad): +$150 cash for the next solo match ───
    // Gold segment docked on the right end of DEPLOY. It has its own click target; after the ad
    // it merges into DEPLOY ("+$150 READY") and clicking it simply deploys.
    const btnBoost = document.getElementById('btn-prep-boost');
    const boostLabel = document.getElementById('prep-boost-label');
    const boostSub = document.getElementById('prep-boost-sub');
    const actionRow = btnBoost ? btnBoost.parentElement : null;
    let boostAdInFlight = false;
    let boostMsgTimer = null;
    try {
      const saved = parseInt(localStorage.getItem('tds_start_boost') || '0', 10);
      if (saved > 0) this.game.pendingStartBoost = saved;
    } catch (e) {}

    this.refreshPrepBoost = () => {
      if (!btnBoost || !boostLabel || !boostSub) return;
      const solo = Network.mode === 'OFFLINE';
      btnBoost.style.display = solo ? 'flex' : 'none';
      if (actionRow) actionRow.classList.toggle('has-boost', solo);
      if (!solo || boostAdInFlight || boostMsgTimer) return;
      const ready = (this.game.pendingStartBoost || 0) > 0;
      btnBoost.classList.toggle('is-ready', ready);
      if (actionRow) actionRow.classList.toggle('boost-ready', ready);
      btnBoost.classList.remove('is-busy', 'is-error');
      btnBoost.disabled = false;
      boostLabel.textContent = ready ? `+$${this.game.pendingStartBoost} READY` : `+$${PREP_BOOST_CASH} CASH`;
      boostSub.textContent = '▶ WATCH AD';
      btnBoost.title = ready
        ? 'Start cash boost is ready: your next solo match starts with +$' + this.game.pendingStartBoost + ' (unranked).'
        : 'Watch an ad: your next solo match starts with +$' + PREP_BOOST_CASH + '. Boosted runs don\'t count on the speedrun board.';
    };

    if (btnBoost) {
      btnBoost.addEventListener('click', () => {
        if (Network.mode !== 'OFFLINE' || boostAdInFlight || boostMsgTimer) return;
        // Already claimed: the segment is part of DEPLOY now
        if ((this.game.pendingStartBoost || 0) > 0) {
          this.game.deployToMatch();
          return;
        }
        soundManager.playTick();
        boostAdInFlight = true;
        btnBoost.disabled = true;
        btnBoost.classList.add('is-busy');
        boostSub.textContent = 'LOADING AD...';
        CrazyGamesManager.requestRewardedAd(
          () => {
            boostAdInFlight = false;
            this.game.pendingStartBoost = PREP_BOOST_CASH;
            try { localStorage.setItem('tds_start_boost', String(PREP_BOOST_CASH)); } catch (e) {}
            soundManager.playUpgrade();
            this.refreshPrepBoost();
          },
          () => {
            // adError / timeout: no reward, keep the offer
            boostAdInFlight = false;
            btnBoost.classList.remove('is-busy');
            btnBoost.classList.add('is-error');
            boostSub.textContent = 'AD UNAVAILABLE';
            boostMsgTimer = setTimeout(() => {
              boostMsgTimer = null;
              this.refreshPrepBoost();
            }, 2500);
          },
          'start_boost'
        );
      });
    }
    this.refreshPrepBoost();

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
    // Sanitize coins to guarantee it is always a pure valid number (strips any commas)
    const rawCoins = typeof this.game.playerCoins === 'string'
      ? parseInt(this.game.playerCoins.replace(/,/g, ''), 10)
      : Number(this.game.playerCoins);

    const safeCoins = isNaN(rawCoins) ? 0 : rawCoins;
    this.game.playerCoins = safeCoins;

    if (safeCoins >= cost) {
      this.game.playerCoins = safeCoins - cost;
      if (!this.game.unlockedAgents.includes(type)) {
        this.game.unlockedAgents.push(type);
      }
      if (this.game.equippedAgents.length < 5 && !this.game.equippedAgents.includes(type)) {
        this.game.equippedAgents.push(type);
      }
      this.game.saveStatsToStorage();
      this.updateLobbyMeta(this.game.playerLevel, this.game.playerXp, this.game.playerCoins);
      this.renderLoadoutConfig();
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

    // Map lock state (both the solo and the co-op copies of each card)
    const mapLocks = [
      { id: 'cyber_city', req: 5, unlockedText: 'x1.0 Coins / XP' },
      { id: 'fallen_outpost', req: 10, unlockedText: 'x1.0 Coins / XP' }
    ];
    mapLocks.forEach(({ id, req, unlockedText }) => {
      document.querySelectorAll(`.map-card[data-map-id="${id}"]`).forEach(card => {
        const info = card.querySelector('.difficulty');
        if (level < req) {
          card.style.opacity = '0.5';
          card.style.pointerEvents = 'none';
          if (info) {
            info.textContent = `🔒 REQ. LVL ${req}`;
            info.className = 'difficulty locked-badge';
          }
        } else {
          card.style.opacity = '1.0';
          card.style.pointerEvents = 'auto';
          if (info) {
            info.textContent = unlockedText;
            info.className = 'difficulty easy';
          }
        }
      });
    });

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

    const allShopCards = document.querySelectorAll('.shop-wide-card, .shop-vert-card, .shop-card');
    allShopCards.forEach(card => {
      const type = card.getAttribute('data-agent-type');
      if (!type) return;
      
      const isUnlocked = this.game.unlockedAgents.includes(type);
      const btn = card.querySelector('.btn-shop-action');
      const costText = card.querySelector('.cost-text');

      if (isUnlocked) {
        card.classList.add('purchased');
        if (card.classList.contains('shop-vert-card')) {
          card.classList.add('card-glow-green');
        }
        if (costText) {
          costText.textContent = "UNLOCKED";
          costText.style.color = "#27ae60";
        }
        if (btn) {
          btn.textContent = "✓ UNLOCKED";
          btn.className = "btn btn-shop-action btn-unlocked-pill";
          btn.disabled = true;
        }
      } else {
        card.classList.remove('purchased', 'card-glow-green');
        const cost = parseInt(btn ? btn.getAttribute('data-cost') : '0') || 0;
        
        if (costText) {
          costText.innerHTML = `<img src="assets/ui/solo/selectdifficulty/sprite_20.png" class="coin-icon-mini" /> ${cost.toLocaleString()}`;
          costText.style.color = "var(--primary-orange)";
        }
        if (btn) {
          btn.textContent = "BUY";
          btn.disabled = (coins < cost);
          btn.style.opacity = (coins < cost) ? '0.5' : '1.0';
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

    this.shopCards = document.querySelectorAll('.shop-wide-card, .shop-vert-card, .shop-card');
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