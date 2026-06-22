// src/ui.js
// Main UI Orchestrator coordinating Lobby and Gameplay sub-controllers

import { LobbyUI } from './lobby-ui.js';
import { GameUI } from './game-ui.js';
import { CrazyGamesManager } from './crazygames.js';

export class UI {
  constructor(game) {
    this.game = game;

    // Common viewport elements cached globally for sub-controllers
    this.lobbyView = document.getElementById('lobby-view');
    this.gameView = document.getElementById('game-view');

    // Instantiate sub-controllers safely
    this.lobby = new LobbyUI(this.game, this);
    this.gameUI = new GameUI(this.game, this);

    this.initGlobalListeners();
    this.initPointerUpdateLoop();
  }

  initGlobalListeners() {
    // Sync CrazyGames Auth Status
    CrazyGamesManager.onAuthChanged((user) => {
      if (this.lobby) {
        this.lobby.updateLobbyMeta(this.game.playerLevel, this.game.playerXp, this.game.playerCoins);
      }
    });

    // Touch optimization for overlay card scrolling on mobile
    const handleSummaryCardScrollTouch = (e) => {
      const summaryCard = document.getElementById('match-summary-card');
      if (summaryCard) {
        const rect = summaryCard.getBoundingClientRect();
        const touch = e.touches[0];
        const isInsideCard = touch.clientX >= rect.left && touch.clientX <= rect.right &&
                             touch.clientY >= rect.top && touch.clientY <= rect.bottom;
        if (isInsideCard) {
          e.stopPropagation();
        }
      }
    };

    if (this.gameUI && this.gameUI.overlay) {
      this.gameUI.overlay.addEventListener('touchstart', handleSummaryCardScrollTouch, { passive: true });
      this.gameUI.overlay.addEventListener('touchmove', handleSummaryCardScrollTouch, { passive: true });
    }
  }

  initPointerUpdateLoop() {
    const updatePointerLoop = () => {
      if (this.gameUI && this.gameUI.activePointerTarget) {
        if (this.gameUI.activePointerTarget.isConnected) {
          this.gameUI.repositionPointer(this.gameUI.activePointerTarget, this.gameUI.activePointerDirection);
        } else {
          this.gameUI.hidePointer();
        }
      }
      requestAnimationFrame(updatePointerLoop);
    };
    requestAnimationFrame(updatePointerLoop);
  }

  /* ───────────────────────────────────────────────────────────
     DEFENSIVE DELEGATION METHODS WITH NULL-GUARDS [4]
     ─────────────────────────────────────────────────────────── */

  showCommanderAnnouncement(msg) {
    if (this.gameUI) {
      this.gameUI.showCommanderAnnouncement(msg);
    }
  }

  updateLobbyMeta(level, xp, coins) {
    if (this.lobby) {
      this.lobby.updateLobbyMeta(level, xp, coins);
    }
  }

  renderLoadoutConfig() {
    if (this.lobby) {
      this.lobby.renderLoadoutConfig();
    }
  }

  renderPlacementShop() {
    if (this.gameUI) {
      this.gameUI.renderPlacementShop();
    }
  }

  updateHUD(lives, gold, wave, maxWaves) {
    if (this.gameUI) {
      this.gameUI.updateHUD(lives, gold, wave, maxWaves);
    }
  }

  updateSelectionPanel(agent) {
    if (this.gameUI) {
      this.gameUI.updateSelectionPanel(agent);
    }
  }

  hideSelectionPanel() {
    if (this.gameUI) {
      this.gameUI.hideSelectionPanel();
    }
  }

  updateWaveButton(waveInProgress) {
    if (this.gameUI) {
      this.gameUI.updateWaveButton(waveInProgress);
    }
  }

  updateSpeedButton(multiplier) {
    if (this.gameUI) {
      this.gameUI.updateSpeedButton(multiplier);
    }
  }

  updateAutoWaveButton(isOn) {
    if (this.gameUI) {
      this.gameUI.updateAutoWaveButton(isOn);
    }
  }

  showAutoCountdown(seconds) {
    if (this.gameUI) {
      this.gameUI.showAutoCountdown(seconds);
    }
  }

  showOverlay(title, subtitle) {
    if (this.gameUI) {
      this.gameUI.showOverlay(title, subtitle);
    }
  }

  hideOverlay() {
    if (this.gameUI) {
      this.gameUI.hideOverlay();
    }
  }

  showGameLayout(mapName) {
    if (this.gameUI) {
      this.gameUI.showGameLayout(mapName);
    }
  }

  showLobbyLayout() {
    if (this.gameUI) {
      this.gameUI.showLobbyLayout();
    }
  }

  startUnboxingAnimation(crateType, chosenAgent, chosenRarity, revealedSkinName) {
    if (this.lobby) {
      this.lobby.startUnboxingAnimation(crateType, chosenAgent, chosenRarity, revealedSkinName);
    }
  }

  renderDailyQuests() {
    if (this.lobby) {
      this.lobby.renderDailyQuests();
    }
  }

  renderLeaderboard(mapId) {
    if (this.lobby) {
      this.lobby.renderLeaderboard(mapId);
    }
  }

  showTutorialHint(step) {
    if (this.gameUI) {
      this.gameUI.showTutorialHint(step);
    }
  }

  dismissTutorial() {
    if (this.gameUI) {
      this.gameUI.dismissTutorial();
    }
  }

  showMatchSummaryCard(isVictory) {
    if (this.gameUI) {
      this.gameUI.showMatchSummaryCard(isVictory);
    }
  }

  updateCoopPlayerList() {
    if (this.lobby) {
      this.lobby.updateCoopPlayerList();
    }
  }

  showPointerAt(targetElement, direction) {
    if (this.gameUI) {
      this.gameUI.showPointerAt(targetElement, direction);
    }
  }

  showPointerAtCanvasCenter() {
    if (this.gameUI) {
      this.gameUI.showPointerAtCanvasCenter();
    }
  }

  hidePointer() {
    if (this.gameUI) {
      this.gameUI.hidePointer();
    }
  }
}