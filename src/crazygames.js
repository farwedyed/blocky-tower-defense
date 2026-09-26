// src/crazygames.js
// Defensive Wrapper Module for CrazyGames SDK v3 supporting robust offline/out-of-iframe execution

import { soundManager } from './sound.js';
import { updateSessionTelemetry } from './firebase.js';

export const CrazyGamesManager = {
  sdk: null,
  isInitialized: false,
  initPromise: null,
  _resolveInit: null,
  currentUser: null,
  authCallbacks: [],
  roomJoinCallbacks: [],

  /**
   * Initializes the CrazyGames SDK and hooks up real-time authentication listeners.
   */
  // Helper to verify SDK is active and not disabled by domain restrictions
  isAvailable: function() {
    return this.isInitialized && this.sdk && this.sdk.environment !== 'disabled';
  },

  init: async function() {
    if (this.isInitialized) return this.initPromise;

    if (!this.initPromise) {
      this.initPromise = new Promise((resolve) => {
        this._resolveInit = resolve;
      });
    }

    try {
      if (typeof window.CrazyGames !== 'undefined' && window.CrazyGames.SDK) {
        this.sdk = window.CrazyGames.SDK;
        
        // Asynchronously initialize the SDK
        await this.sdk.init();

        // If hosted on GitHub Pages or custom domain, CrazyGames disables itself
        if (this.sdk.environment === 'disabled') {
          console.warn('[CrazyGames] SDK disabled on this domain (GitHub Pages/standalone). Running in offline fallback.');
          this.isInitialized = false;
          this._resolveInit();
          return this.initPromise;
        }

        this.isInitialized = true;
        console.log('[CrazyGames] SDK successfully initialized in', this.sdk.environment, 'environment!');

        // Dynamic Auth Listener
        try {
          if (this.sdk.user) {
            const authListener = (user) => {
              if (user) {
                console.log('[CrazyGames] Auth Listener triggered:', user);
                this.handleUserLoggedIn(user);
              }
            };
            this.sdk.user.addAuthListener(authListener);

            const initialUser = await this.sdk.user.getUser();
            if (initialUser) {
              console.log('[CrazyGames] Initial user session detected:', initialUser);
              this.handleUserLoggedIn(initialUser);
            }
          }
        } catch (e) {
          console.warn('[CrazyGames] Auth initialization bypassed:', e);
        }

        // Register multiplayer room join listeners safely
        try {
          this.sdk.game.addJoinRoomListener((inviteParams) => {
            console.log('[CrazyGames] Room join triggered in-game:', inviteParams);
            this.triggerRoomJoin(inviteParams);
          });
        } catch (e) {
          console.warn('[CrazyGames] Failed to add join room listener:', e);
        }

        // Check if the game was opened directly from an invite link safely
        try {
          const startupInviteParams = this.sdk.game.inviteParams;
          if (startupInviteParams) {
            console.log('[CrazyGames] Startup invite parameters detected:', startupInviteParams);
            setTimeout(() => {
              this.triggerRoomJoin(startupInviteParams);
            }, 800);
          }
        } catch (e) {
          console.warn('[CrazyGames] Failed to read startup invite params:', e);
        }

        // Setup Game Settings listener (Audio muting) safely
        try {
          const applyMuteSetting = (settings) => {
            if (settings && typeof settings.muteAudio === 'boolean') {
              soundManager.setEnabled(!settings.muteAudio);
              console.log('[CrazyGames] Audio system state sync. Muted:', settings.muteAudio);
            }
          };

          if (this.sdk.game.settings) {
            applyMuteSetting(this.sdk.game.settings);
          }

          this.sdk.game.addSettingsChangeListener(applyMuteSetting);
        } catch (e) {
          console.warn('[CrazyGames] Failed to register audio settings listener:', e);
        }

      } else {
        console.warn('[CrazyGames] SDK script is not available on window. Falling back.');
      }
    } catch (e) {
      console.error('[CrazyGames] Initialization error caught gracefully:', e);
    } finally {
      this._resolveInit();
    }

    return this.initPromise;
  },

  /**
   * Prompts user with sign-in / registration popup.
   */
  promptAuth: async function() {
    if (!this.sdk || !this.sdk.user) return null;
    try {
      const user = await this.sdk.user.showAuthPrompt();
      if (user) {
        this.handleUserLoggedIn(user);
        return user;
      }
    } catch (e) {
      console.warn('[CrazyGames] Auth prompt dismissed or failed:', e);
    }
    return null;
  },

  /**
   * Handles successful login profile mapping.
   */
  handleUserLoggedIn: function(user) {
    this.currentUser = user;
    
    // Auto-populate local player name with clean CrazyGames username
    if (user && user.username) {
      const cleanName = user.username.substring(0, 12);
      localStorage.setItem('tds_player_username', cleanName);
      
      const nameInput = document.getElementById('input-player-name');
      if (nameInput) {
        nameInput.value = cleanName;
        nameInput.disabled = true; // Do not allow manual modifications
      }

      // Sync user metadata to the active Firestore telemetry session
      updateSessionTelemetry({ username: cleanName, isLoggedIn: true });
    }

    // Trigger registered callback notifications for UI
    this.authCallbacks.forEach(cb => cb(user));
  },

  onAuthChanged: function(callback) {
    this.authCallbacks.push(callback);
    if (this.currentUser) {
      callback(this.currentUser);
    }
  },

  /**
   * Check if game has been launched in instant multiplayer mode
   */
  isInstantMultiplayer: function() {
    if (this.isAvailable()) {
      try {
        return !!this.sdk.game.isInstantMultiplayer;
      } catch (e) {
        // Fallback safely if SDK throws on external domains
      }
    }
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('isInstantMultiplayer') === 'true' || params.get('instantJoin') === 'true';
    } catch (e) {
      return false;
    }
  },

  /**
   * Notifies the platform that the game loading process has started.
   */
  gameLoadingStart: function() {
    if (this.isAvailable()) {
      try {
        this.sdk.game.loadingStart();
        console.log('[CrazyGames] loadingStart triggered.');
      } catch (e) {
        console.warn('[CrazyGames] loadingStart failed:', e);
      }
    }
  },

  /**
   * Notifies the platform that the game loading process has finished.
   */
  gameLoadingStop: function() {
    if (this.isAvailable()) {
      try {
        this.sdk.game.loadingStop();
        console.log('[CrazyGames] loadingStop triggered.');
      } catch (e) {
        console.warn('[CrazyGames] loadingStop failed:', e);
      }
    }
  },

  /**
   * Handles multiplayer invitation link generation.
   * @param {string} roomId - unique WebRTC room or PeerJS session ID
   * @returns {Promise<string>} invitation URL to copy to clipboard
   */
  getInviteLink: async function(roomId) {
    if (this.sdk && this.isInitialized) {
      try {
        const link = await this.sdk.game.inviteLink({ roomId: roomId });
        return link;
      } catch (e) {
        console.error('[CrazyGames] Link generation error:', e);
      }
    }
    // Fallback if local/embedded
    return `${window.location.origin}${window.location.pathname}?roomId=${roomId}`;
  },

  /**
   * Updates platform-level room visibility status for friends drawer.
   * @param {string} roomId
   * @param {boolean} isJoinable
   */
  updateRoomPresence: function(roomId, isJoinable) {
    if (this.sdk && this.isInitialized && roomId) {
      try {
        this.sdk.game.updateRoom({
          roomId: roomId.toLowerCase(),
          isJoinable: !!isJoinable,
          inviteParams: { roomId: roomId.toLowerCase() }
        });
        console.log('[CrazyGames] Platform room state sync:', roomId.toLowerCase(), 'Joinable:', !!isJoinable);
      } catch (e) {
        console.warn('[CrazyGames] Failed to update presence:', e);
      }
    }
  },

  /**
   * Clean notification when player completely leaves lobbies
   */
  leaveRoomPresence: function() {
    if (this.sdk && this.isInitialized) {
      try {
        // Set isJoinable to false first, then notify leftRoom
        this.sdk.game.updateRoom({ isJoinable: false });
        this.sdk.game.leftRoom();
        console.log('[CrazyGames] Notified left room and closed presence.');
      } catch (e) {
        console.warn('[CrazyGames] Left room failure:', e);
      }
    }
  },

  /**
   * Triggers a standard midgame ad break.
   * Automatically handles global game muting states during video playback.
   */
  requestMidgameAd: function(onFinished) {
    let finishedCalled = false;
    const safeFinish = () => {
      if (finishedCalled) return;
      finishedCalled = true;
      if (onFinished) onFinished();
    };

    // Safety timeout: If the ad doesn't start/error out within 1.5 seconds, bypass it.
    let safetyTimeout = setTimeout(() => {
      console.warn('[CrazyGames] Midgame Ad request timed out or was blocked. Bypassing.');
      safeFinish();
    }, 1500);

    if (this.sdk && this.isInitialized && this.sdk.ad) {
      const originalSoundState = soundManager.enabled;
      
      try {
        this.sdk.ad.requestAd("midgame", {
          adStarted: () => {
            clearTimeout(safetyTimeout);
            soundManager.setEnabled(false); // Mute sound during ads
            if (typeof soundManager.muteMusic === 'function') {
              soundManager.muteMusic();
            }
            console.log('[CrazyGames] Midgame Ad started.');
          },
          adFinished: () => {
            soundManager.setEnabled(originalSoundState); // Restore sound
            if (typeof soundManager.unmuteMusic === 'function') {
              soundManager.unmuteMusic();
            }
            console.log('[CrazyGames] Midgame Ad finished.');
            safeFinish();
          },
          adError: (error) => {
            soundManager.setEnabled(originalSoundState); // Restore sound
            if (typeof soundManager.unmuteMusic === 'function') {
              soundManager.unmuteMusic();
            }
            console.warn('[CrazyGames] Midgame Ad error:', error);
            safeFinish(); // Proceed smoothly if ads fail to load
          }
        });
      } catch (e) {
        clearTimeout(safetyTimeout);
        console.warn('[CrazyGames] Failed to request midgame ad:', e);
        safeFinish();
      }
    } else {
      clearTimeout(safetyTimeout);
      safeFinish();
    }
  },

  /**
   * Triggers a rewarded video ad.
   * Automatically handles muting states.
   * @param {function} onRewardEarned - Callback executed ONLY if user fully watches the video
   * @param {function} onAdError - Callback executed if ad fails or is closed early
   */
  requestRewardedAd: function(onRewardEarned, onAdError) {
    let finishedCalled = false;
    const safeFinish = () => {
      if (finishedCalled) return;
      finishedCalled = true;
      if (onRewardEarned) onRewardEarned();
    };

    // Safety timeout
    let safetyTimeout = setTimeout(() => {
      console.warn('[CrazyGames] Rewarded Ad failed to start.');
      if (onAdError) onAdError();
    }, 2000);

    if (this.sdk && this.isInitialized && this.sdk.ad) {
      const originalSoundState = soundManager.enabled;

      try {
        this.sdk.ad.requestAd("rewarded", {
          adStarted: () => {
            clearTimeout(safetyTimeout);
            soundManager.setEnabled(false); // Mute sound during ads
            if (typeof soundManager.muteMusic === 'function') {
              soundManager.muteMusic();
            }
            console.log('[CrazyGames] Rewarded Ad started.');
          },
          adFinished: () => {
            soundManager.setEnabled(originalSoundState); // Restore sound
            if (typeof soundManager.unmuteMusic === 'function') {
              soundManager.unmuteMusic();
            }
            console.log('[CrazyGames] Rewarded Ad successfully finished.');
            safeFinish();
          },
          adError: (error) => {
            soundManager.setEnabled(originalSoundState); // Restore sound
            if (typeof soundManager.unmuteMusic === 'function') {
              soundManager.unmuteMusic();
            }
            console.warn('[CrazyGames] Rewarded Ad failed or skipped:', error);
            clearTimeout(safetyTimeout);
            if (onAdError) onAdError(); // Do not trigger reward
          }
        });
      } catch (e) {
        clearTimeout(safetyTimeout);
        console.warn('[CrazyGames] Failed to request rewarded ad:', e);
        if (onAdError) onAdError();
      }
    } else {
      clearTimeout(safetyTimeout);
      if (onAdError) onAdError();
    }
  },

  onRoomJoinReceived: function(callback) {
    this.roomJoinCallbacks.push(callback);
  },

  triggerRoomJoin: function(inviteParams) {
    this.roomJoinCallbacks.forEach(cb => cb(inviteParams));
  },

  // Track Gameplay active state for performance throttling
  gameplayStart: function() {
    if (this.sdk && this.isInitialized) {
      try {
        this.sdk.game.gameplayStart();
        console.log('[CrazyGames] gameplayStart called.');
      } catch (e) {
        console.warn('[CrazyGames] gameplayStart failed caught gracefully:', e);
      }
    }
  },

  gameplayStop: function() {
    if (this.sdk && this.isInitialized) {
      try {
        this.sdk.game.gameplayStop();
        console.log('[CrazyGames] gameplayStop called.');
      } catch (e) {
        console.warn('[CrazyGames] gameplayStop failed caught gracefully:', e);
      }
    }
  },

  // Trigger achievement confetti
  happytime: function() {
    if (this.sdk && this.isInitialized) {
      try {
        this.sdk.game.happytime();
      } catch (e) {
        console.warn('[CrazyGames] happytime failed caught gracefully:', e);
      }
    }
  }
};