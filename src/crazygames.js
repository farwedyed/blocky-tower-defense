// src/crazygames.js
// Pristine, error-silenced wrapper for CrazyGames SDK v3 supporting offline, out-of-iframe, and GitHub Pages execution.

import { soundManager } from './sound.js';

export const CrazyGamesManager = {
  sdk: null,
  isInitialized: false,
  currentUser: null,
  authCallbacks: [],
  roomJoinCallbacks: [],

  /**
   * Initializes the CrazyGames SDK and hooks up real-time authentication listeners safely.
   */
  init: async function() {
    if (this.isInitialized) return;

    try {
      if (typeof window.CrazyGames !== 'undefined' && window.CrazyGames.SDK) {
        this.sdk = window.CrazyGames.SDK;
        
        // Asynchronously initialize the SDK
        await this.sdk.init();
        console.log('[CrazyGames] SDK base successfully initialized!');

        // Dynamic Auth Listener
        if (this.sdk.user) {
          const authListener = (user) => {
            if (user) this.handleUserLoggedIn(user);
          };

          try {
            this.sdk.user.addAuthListener(authListener);
          } catch (e) {
            // Muted
          }

          // Initial check: Attempt to fetch current user immediately on startup.
          try {
            const initialUser = await this.sdk.user.getUser();
            if (initialUser) {
              this.handleUserLoggedIn(initialUser);
            }
          } catch (e) {
            // Muted expected outside iframe
          }
        }

        // Register multiplayer room join listeners safely
        try {
          this.sdk.game.addJoinRoomListener((inviteParams) => {
            this.triggerRoomJoin(inviteParams);
          });
        } catch (e) {
          // Muted
        }

        // Check if the game was opened directly from an invite link safely
        try {
          const startupInviteParams = this.sdk.game.inviteParams;
          if (startupInviteParams) {
            setTimeout(() => {
              this.triggerRoomJoin(startupInviteParams);
            }, 800);
          }
        } catch (e) {
          // Muted
        }

        // Setup Game Settings listener (Audio muting) safely
        try {
          const applyMuteSetting = (settings) => {
            if (settings && typeof settings.muteAudio === 'boolean') {
              soundManager.setEnabled(!settings.muteAudio);
            }
          };

          if (this.sdk.game.settings) {
            applyMuteSetting(this.sdk.game.settings);
          }

          this.sdk.game.addSettingsChangeListener(applyMuteSetting);
        } catch (e) {
          // Muted
        }

        // ONLY mark as fully initialized if the entire setup was safe and successful
        this.isInitialized = true;

      } else {
        console.log('[CrazyGames] SDK not available on window. Running in local fallback mode.');
      }
    } catch (e) {
      // SAFELY MARK AS FALSE so we never call any disabled SDK game methods!
      this.isInitialized = false; 
      console.log('[CrazyGames] Platform SDK disabled on this domain (running in developer sandbox).');
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
      // Muted
    }
    return null;
  },

  /**
   * Handles successful login profile mapping.
   */
  handleUserLoggedIn: function(user) {
    this.currentUser = user;
    
    if (user && user.username) {
      const cleanName = user.username.substring(0, 12);
      localStorage.setItem('tds_player_username', cleanName);
      const nameInput = document.getElementById('input-player-name');
      if (nameInput) {
        nameInput.value = cleanName;
      }
    }

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
   */
  getInviteLink: async function(roomId) {
    if (this.sdk && this.isInitialized) {
      try {
        const link = await this.sdk.game.inviteLink({ roomId: roomId });
        return link;
      } catch (e) {
        // Muted
      }
    }
    return `${window.location.origin}${window.location.pathname}?roomId=${roomId}`;
  },

  /**
   * Updates platform-level room visibility status for friends drawer.
   */
  updateRoomPresence: function(roomId, isJoinable) {
    if (this.sdk && this.isInitialized) {
      try {
        this.sdk.game.updateRoom({
          roomId: roomId,
          isJoinable: isJoinable,
          inviteParams: { roomId: roomId }
        });
      } catch (e) {
        // Muted
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
      } catch (e) {
        // Muted
      }
    }
  },

  /**
   * Triggers a standard midgame ad break.
   */
  requestMidgameAd: function(onFinished) {
    let finishedCalled = false;
    const safeFinish = () => {
      if (finishedCalled) return;
      finishedCalled = true;
      if (onFinished) onFinished();
    };

    let safetyTimeout = setTimeout(() => {
      safeFinish();
    }, 1500);

    if (this.sdk && this.isInitialized && this.sdk.ad) {
      const originalSoundState = soundManager.enabled;
      
      try {
        const adPromise = this.sdk.ad.requestAd("midgame", {
          adStarted: () => {
            clearTimeout(safetyTimeout);
            soundManager.setEnabled(false); 
          },
          adFinished: () => {
            soundManager.setEnabled(originalSoundState); 
            safeFinish();
          },
          adError: (error) => {
            soundManager.setEnabled(originalSoundState); 
            safeFinish(); 
          }
        });

        if (adPromise && typeof adPromise.catch === 'function') {
          adPromise.catch((err) => {
            safeFinish();
          });
        }
      } catch (e) {
        clearTimeout(safetyTimeout);
        safeFinish();
      }
    } else {
      clearTimeout(safetyTimeout);
      safeFinish();
    }
  },

  /**
   * Triggers a rewarded video ad.
   */
  requestRewardedAd: function(onRewardEarned) {
    let finishedCalled = false;
    const safeFinish = () => {
      if (finishedCalled) return;
      finishedCalled = true;
      if (onRewardEarned) onRewardEarned();
    };

    let safetyTimeout = setTimeout(() => {
      safeFinish();
    }, 2000);

    if (this.sdk && this.isInitialized && this.sdk.ad) {
      const originalSoundState = soundManager.enabled;

      try {
        const adPromise = this.sdk.ad.requestAd("rewarded", {
          adStarted: () => {
            clearTimeout(safetyTimeout);
            soundManager.setEnabled(false); 
          },
          adFinished: () => {
            soundManager.setEnabled(originalSoundState); 
            safeFinish();
          },
          adError: (error) => {
            soundManager.setEnabled(originalSoundState); 
            safeFinish();
          }
        });

        if (adPromise && typeof adPromise.catch === 'function') {
          adPromise.catch((err) => {
            safeFinish();
          });
        }
      } catch (e) {
        clearTimeout(safetyTimeout);
        safeFinish();
      }
    } else {
      clearTimeout(safetyTimeout);
      safeFinish();
    }
  },

  onRoomJoinReceived: function(callback) {
    this.roomJoinCallbacks.push(callback);
  },

  triggerRoomJoin: function(inviteParams) {
    this.roomJoinCallbacks.forEach(cb => cb(inviteParams));
  },

  gameplayStart: function() {
    if (this.sdk && this.isInitialized) {
      try {
        const p = this.sdk.game.gameplayStart();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            // Muted
          });
        }
      } catch (e) {
        // Muted
      }
    }
  },

  gameplayStop: function() {
    if (this.sdk && this.isInitialized) {
      try {
        const p = this.sdk.game.gameplayStop();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            // Muted
          });
        }
      } catch (e) {
        // Muted
      }
    }
  },

  happytime: function() {
    if (this.sdk && this.isInitialized) {
      try {
        const p = this.sdk.game.happytime();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            // Muted
          });
        }
      } catch (e) {
        // Muted
      }
    }
  }
};