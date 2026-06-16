// src/crazygames.js
// Corrected Wrapper Module for CrazyGames SDK v3 with Mute settings, accounts, and Video Ads

import { soundManager } from './sound.js';

export const CrazyGamesManager = {
  sdk: null,
  isInitialized: false,
  currentUser: null,
  authCallbacks: [],
  roomJoinCallbacks: [],

  /**
   * Initializes the CrazyGames SDK and hooks up real-time authentication listeners.
   */
  init: async function() {
    if (this.isInitialized) return;

    try {
      if (typeof window.CrazyGames !== 'undefined' && window.CrazyGames.SDK) {
        this.sdk = window.CrazyGames.SDK;
        
        // Asynchronously initialize the SDK
        await this.sdk.init();
        this.isInitialized = true;
        console.log('[CrazyGames] SDK successfully initialized!');

        // Dynamic Auth Listener
        if (this.sdk.user) {
          const authListener = (user) => {
            if (user) {
              console.log('[CrazyGames] Auth Listener triggered:', user);
              this.handleUserLoggedIn(user);
            }
          };

          try {
            this.sdk.user.addAuthListener(authListener);
          } catch (e) {
            console.warn('[CrazyGames] Failed to register auth listener:', e);
          }

          // Initial check: Attempt to fetch current user immediately on startup
          try {
            const initialUser = await this.sdk.user.getUser();
            if (initialUser) {
              console.log('[CrazyGames] Initial user session detected:', initialUser);
              this.handleUserLoggedIn(initialUser);
            }
          } catch (e) {
            console.warn('[CrazyGames] Failed to sync startup user profile:', e);
          }
        }

        // 3. Register multiplayer room join listeners for players already in the page
        this.sdk.game.addJoinRoomListener((inviteParams) => {
          console.log('[CrazyGames] Room join triggered in-game:', inviteParams);
          this.triggerRoomJoin(inviteParams);
        });

        // 4. Check if the game was opened directly from an invite link
        const startupInviteParams = this.sdk.game.inviteParams;
        if (startupInviteParams) {
          console.log('[CrazyGames] Startup invite parameters detected:', startupInviteParams);
          // Wait slightly for main.js and PeerJS to load before handling redirect
          setTimeout(() => {
            this.triggerRoomJoin(startupInviteParams);
          }, 800);
        }

        // 5. Setup Game Settings listener (Audio muting)
        const applyMuteSetting = (settings) => {
          if (settings && typeof settings.muteAudio === 'boolean') {
            soundManager.setEnabled(!settings.muteAudio);
            console.log('[CrazyGames] Audio system state sync. Muted:', settings.muteAudio);
          }
        };

        // Apply initial settings if available at startup
        if (this.sdk.game.settings) {
          applyMuteSetting(this.sdk.game.settings);
        }

        // Listen for real-time muting changes
        this.sdk.game.addSettingsChangeListener(applyMuteSetting);

      } else {
        console.warn('[CrazyGames] SDK script is not available on window. Falling back.');
      }
    } catch (e) {
      console.error('[CrazyGames] Initialization error:', e);
    }
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
      }
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
    if (this.sdk && this.isInitialized) {
      try {
        this.sdk.game.updateRoom({
          roomId: roomId,
          isJoinable: isJoinable,
          inviteParams: { roomId: roomId }
        });
        console.log('[CrazyGames] Platform room state sync:', roomId, 'Joinable:', isJoinable);
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
        this.sdk.game.leftRoom();
        console.log('[CrazyGames] Notified left room.');
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
    if (this.sdk && this.isInitialized && this.sdk.ad) {
      const originalSoundState = soundManager.enabled;
      
      this.sdk.ad.requestAd("midgame", {
        adStarted: () => {
          soundManager.setEnabled(false); // Mute sound during ads
          console.log('[CrazyGames] Midgame Ad started.');
        },
        adFinished: () => {
          soundManager.setEnabled(originalSoundState); // Restore sound
          console.log('[CrazyGames] Midgame Ad finished.');
          if (onFinished) onFinished();
        },
        adError: (error) => {
          soundManager.setEnabled(originalSoundState); // Restore sound
          console.warn('[CrazyGames] Midgame Ad error:', error);
          if (onFinished) onFinished(); // Proceed smoothly if ads fail to load
        }
      });
    } else {
      // Offline fallback
      if (onFinished) onFinished();
    }
  },

  /**
   * Triggers a rewarded video ad.
   * Automatically handles muting states.
   * @param {function} onRewardEarned - Callback executed ONLY if user fully watches the video
   */
  requestRewardedAd: function(onRewardEarned) {
    if (this.sdk && this.isInitialized && this.sdk.ad) {
      const originalSoundState = soundManager.enabled;
      let rewardGiven = false;

      this.sdk.ad.requestAd("rewarded", {
        adStarted: () => {
          soundManager.setEnabled(false); // Mute sound during ads
          console.log('[CrazyGames] Rewarded Ad started.');
        },
        adFinished: () => {
          soundManager.setEnabled(originalSoundState); // Restore sound
          console.log('[CrazyGames] Rewarded Ad successfully finished.');
          rewardGiven = true;
          if (onRewardEarned) onRewardEarned();
        },
        adError: (error) => {
          soundManager.setEnabled(originalSoundState); // Restore sound
          console.warn('[CrazyGames] Rewarded Ad failed or skipped:', error);
        }
      });
    } else {
      // Offline fallback: Automatically award reward for testing
      if (onRewardEarned) onRewardEarned();
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
      this.sdk.game.gameplayStart();
    }
  },

  gameplayStop: function() {
    if (this.sdk && this.isInitialized) {
      this.sdk.game.gameplayStop();
    }
  },

  // Trigger achievement confetti
  happytime: function() {
    if (this.sdk && this.isInitialized) {
      this.sdk.game.happytime();
    }
  }
};