// src/crazygames.js
// Defensive Wrapper Module for CrazyGames SDK v3 supporting robust offline/out-of-iframe execution

import { soundManager } from './sound.js';

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
        
        // Wait for the SDK to really finish init before using it. (It used to give up after 800ms and
        // mark itself ready anyway; on slow connections every SDK call then failed with
        // "CrazySDK is not initialized yet".) Local dev keeps the short wait.
        const host = (window.location && window.location.hostname) || '';
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || window.location.protocol === 'file:';
        const waitMs = isLocal ? 800 : 6000;
        const initDone = Promise.resolve()
          .then(() => this.sdk.init())
          .then(() => true, (e) => { console.warn('[CrazyGames] SDK init failed:', e); return false; });
        this._sdkInitDone = initDone;
        const initResult = await Promise.race([
          initDone,
          new Promise((resolve) => setTimeout(() => resolve(null), waitMs))
        ]);

        if (initResult === null) {
          // Still initializing: boot the game now and switch the SDK on as soon as init completes
          console.warn('[CrazyGames] SDK init is slow; continuing boot and enabling the SDK when ready.');
          this._sdkLateInit = initDone.then((ok) => (ok ? this._afterInit().catch(() => {}) : null));
          this._resolveInit();
          return this.initPromise;
        }
        if (initResult === false) {
          this.isInitialized = false;
          this._resolveInit();
          return this.initPromise;
        }

        await this._afterInit();
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

  /** Runs once the SDK has really finished init: marks it ready and registers listeners. */
  _afterInit: async function() {
    if (this._afterInitDone) return;
    this._afterInitDone = true;

    // If hosted on GitHub Pages or custom domain, CrazyGames disables itself
    if (this.sdk.environment === 'disabled') {
      console.warn('[CrazyGames] SDK disabled on this domain (GitHub Pages/standalone). Running in offline fallback.');
      this.isInitialized = false;
      return;
    }

    this.isInitialized = true;
    console.log('[CrazyGames] SDK successfully initialized in', this.sdk.environment, 'environment!');
    setTimeout(() => this._flushGameplay(), 0);

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
  /**
   * Lets the telemetry script count ads that were actually shown.
   * kind: 'rewarded' | 'midgame', placement: where in the game it was shown.
   */
  reportAdWatched: function(kind, placement) {
    try {
      window.dispatchEvent(new CustomEvent('btd:ad-watched', { detail: { kind, placement: placement || 'unknown' } }));
    } catch (e) {}
  },

  /**
   * Lets the telemetry script count every ad REQUEST and how it ended.
   * outcome: 'shown' | 'timeout' | 'late_start' | 'no_sdk' | the SDK's error code (adCooldown, unfilled, adblock, other...)
   */
  reportAdRequest: function(kind, placement, outcome) {
    try {
      window.dispatchEvent(new CustomEvent('btd:ad-request', { detail: { kind, placement: placement || 'unknown', outcome: outcome || 'unknown' } }));
    } catch (e) {}
  },

  _adErrorCode: function(error) {
    let code = 'unknown';
    try {
      if (error) code = error.code || error.message || (typeof error === 'string' ? error : 'unknown');
    } catch (e) {}
    return String(code).replace(/[^a-z0-9_]/gi, '_').slice(0, 30) || 'unknown';
  },

  // True while an ad video is on screen. Solo matches freeze while it is set (see Game.loop).
  adPlaying: false,
  _adPlayingTimer: null,
  _setAdPlaying: function(on) {
    this.adPlaying = !!on;
    if (this._adPlayingTimer) { clearTimeout(this._adPlayingTimer); this._adPlayingTimer = null; }
    // Never leave the game frozen if the SDK forgets to call back
    if (on) this._adPlayingTimer = setTimeout(() => { this.adPlaying = false; this._adPlayingTimer = null; }, 90000);
  },

  /**
   * The SDK can still be finishing init (slow connections, see init()). Instead of failing the
   * ad with 'no_sdk', wait for it up to maxMs, then run fn.
   */
  _whenSdkReady: function(maxMs, fn) {
    if (this.isInitialized || !this.sdk || !this._sdkLateInit) { fn(); return; }
    let done = false;
    const go = () => { if (done) return; done = true; fn(); };
    this._sdkLateInit.then(go, go);
    setTimeout(go, maxMs);
  },

  // How long we wait for the SDK to START an ad before giving up. CrazyGames requires the game
  // to stay blocked until adStarted/adFinished/adError, and the SDK always answers (an
  // unavailable ad or the 3-minute midgame limit comes back quickly as adError). This is only a
  // last resort in case the SDK never answers. (It used to be 4s, so slow ads started on top of
  // a running match, and rewarded ads that started after 7s paid nothing.)
  MIDGAME_START_TIMEOUT_MS: 12000,
  REWARDED_START_TIMEOUT_MS: 15000,

  requestMidgameAd: function(onFinished, placement) {
    this._whenSdkReady(5000, () => this._requestMidgameAd(onFinished, placement));
  },

  _requestMidgameAd: function(onFinished, placement) {
    let finishedCalled = false;
    let midgameStarted = false;
    let outcomeReported = false;
    const reportOutcome = (outcome) => {
      if (outcomeReported) return;
      outcomeReported = true;
      this.reportAdRequest('midgame', placement, outcome);
    };
    const safeFinish = () => {
      if (finishedCalled) return;
      finishedCalled = true;
      if (onFinished) onFinished();
    };

    // Last-resort timeout (see MIDGAME_START_TIMEOUT_MS). A late start still freezes solo play.
    let safetyTimeout = setTimeout(() => {
      console.warn('[CrazyGames] Midgame Ad request timed out or was blocked. Bypassing.');
      reportOutcome('timeout');
      safeFinish();
    }, this.MIDGAME_START_TIMEOUT_MS);

    if (this.sdk && this.isInitialized && this.sdk.ad) {
      const originalSoundState = soundManager.enabled;
      
      try {
        this.sdk.ad.requestAd("midgame", {
          adStarted: () => {
            clearTimeout(safetyTimeout);
            midgameStarted = true;
            if (finishedCalled) this.reportAdRequest('midgame', placement, 'late_start');
            else reportOutcome('shown');
            this._setAdPlaying(true);
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
            this._setAdPlaying(false);
            if (midgameStarted) this.reportAdWatched('midgame', placement);
            else reportOutcome('finished_no_start');
            safeFinish();
          },
          adError: (error) => {
            soundManager.setEnabled(originalSoundState); // Restore sound
            if (typeof soundManager.unmuteMusic === 'function') {
              soundManager.unmuteMusic();
            }
            console.warn('[CrazyGames] Midgame Ad error:', error);
            clearTimeout(safetyTimeout);
            this._setAdPlaying(false);
            reportOutcome(this._adErrorCode(error));
            safeFinish(); // Proceed smoothly if ads fail to load
          }
        });
      } catch (e) {
        clearTimeout(safetyTimeout);
        console.warn('[CrazyGames] Failed to request midgame ad:', e);
        reportOutcome('exception');
        safeFinish();
      }
    } else {
      clearTimeout(safetyTimeout);
      reportOutcome('no_sdk');
      safeFinish();
    }
  },

  /**
   * Triggers a rewarded video ad.
   * Automatically handles muting states.
   * @param {function} onRewardEarned - Callback executed ONLY if user fully watches the video
   * @param {function} onAdError - Callback executed if ad fails or is closed early
   */
  requestRewardedAd: function(onRewardEarned, onAdError, placement) {
    this._whenSdkReady(5000, () => this._requestRewardedAd(onRewardEarned, onAdError, placement));
  },

  _requestRewardedAd: function(onRewardEarned, onAdError, placement) {
    let finishedCalled = false;
    let timedOut = false;
    let rewarded = false;
    let safetyTimeout = null;
    let outcomeReported = false;
    const reportOutcome = (outcome) => {
      if (outcomeReported) return;
      outcomeReported = true;
      this.reportAdRequest('rewarded', placement, outcome);
    };

    const safeFinish = () => {
      // Normally once only. Exception: we gave up waiting (timeout) and the ad then started and
      // was watched to the end anyway -> the player still gets the reward (CrazyGames rule:
      // a fully watched rewarded ad must pay out).
      if (rewarded) return;
      if (finishedCalled && !timedOut) return;
      finishedCalled = true;
      rewarded = true;
      if (safetyTimeout) clearTimeout(safetyTimeout);
      if (onRewardEarned) onRewardEarned();
    };

    const safeError = () => {
      if (finishedCalled) return;
      finishedCalled = true;
      if (safetyTimeout) clearTimeout(safetyTimeout);
      if (onAdError) onAdError();
    };

    // Last-resort timeout (see REWARDED_START_TIMEOUT_MS)
    safetyTimeout = setTimeout(() => {
      console.warn('[CrazyGames] Rewarded Ad request timed out.');
      reportOutcome('timeout');
      safeError();
      timedOut = true;
    }, this.REWARDED_START_TIMEOUT_MS);

    if (this.sdk && this.isInitialized && this.sdk.ad) {
      const originalSoundState = soundManager.enabled;

      try {
        this.sdk.ad.requestAd("rewarded", {
          adStarted: () => {
            if (safetyTimeout) clearTimeout(safetyTimeout);
            if (finishedCalled) this.reportAdRequest('rewarded', placement, 'late_start');
            else reportOutcome('shown');
            this._setAdPlaying(true);
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
            this._setAdPlaying(false);
            reportOutcome('shown');
            if (!rewarded) this.reportAdWatched('rewarded', placement);
            safeFinish();
          },
          adError: (error) => {
            soundManager.setEnabled(originalSoundState); // Restore sound
            if (typeof soundManager.unmuteMusic === 'function') {
              soundManager.unmuteMusic();
            }
            console.warn('[CrazyGames] Rewarded Ad failed or skipped:', error);
            this._setAdPlaying(false);
            reportOutcome(this._adErrorCode(error));
            safeError();
          }
        });
      } catch (e) {
        console.warn('[CrazyGames] Failed to request rewarded ad:', e);
        reportOutcome('exception');
        safeError();
      }
    } else {
      reportOutcome('no_sdk');
      safeError();
    }
  },

  onRoomJoinReceived: function(callback) {
    this.roomJoinCallbacks.push(callback);
    // Deliver an invite that arrived before the game registered its listener
    if (this.pendingRoomJoin) {
      const pending = this.pendingRoomJoin;
      this.pendingRoomJoin = null;
      callback(pending);
    }
  },

  triggerRoomJoin: function(inviteParams) {
    if (!this.roomJoinCallbacks.length) {
      this.pendingRoomJoin = inviteParams;
      return;
    }
    this.roomJoinCallbacks.forEach(cb => cb(inviteParams));
  },

  /**
   * Room id from the invite the game was launched with (CrazyGames invite link), or null.
   */
  getStartupInviteRoomId: function() {
    try {
      // Only ask the SDK once it is initialized (a slow init used to log "not initialized" here)
      const p = this.isAvailable() && this.sdk.game ? this.sdk.game.inviteParams : null;
      return p && p.roomId ? String(p.roomId) : null;
    } catch (e) {
      return null;
    }
  },

  // Track Gameplay active state for performance throttling
  // gameplayStart/Stop: the SDK throttles calls closer than 1s apart (and logs "call throttled").
  // We keep the state the game WANTS and send it to the SDK at most once per 1.1s, skipping repeats.
  _gameplayActive: false,   // what the SDK was last told
  _gameplayWanted: false,   // what the game wants now
  _gameplayLastCall: 0,
  _gameplayTimer: null,
  _flushGameplay: function() {
    if (this._gameplayTimer) return; // a flush is already scheduled
    if (!(this.sdk && this.isInitialized)) return;
    if (this._gameplayWanted === this._gameplayActive) return;
    const wait = 1100 - (Date.now() - this._gameplayLastCall);
    if (wait > 0) {
      this._gameplayTimer = setTimeout(() => { this._gameplayTimer = null; this._flushGameplay(); }, wait);
      return;
    }
    const on = this._gameplayWanted;
    this._gameplayActive = on;
    this._gameplayLastCall = Date.now();
    try {
      if (on) this.sdk.game.gameplayStart(); else this.sdk.game.gameplayStop();
      console.log('[CrazyGames] gameplay' + (on ? 'Start' : 'Stop') + ' called.');
    } catch (e) {
      console.warn('[CrazyGames] gameplay' + (on ? 'Start' : 'Stop') + ' failed caught gracefully:', e);
    }
  },
  gameplayStart: function() {
    this._gameplayWanted = true;
    this._flushGameplay();
  },
  gameplayStop: function() {
    this._gameplayWanted = false;
    this._flushGameplay();
  },

  // Trigger achievement confetti (at most once every few seconds; repeats are throttled + logged by the SDK)
  _lastHappytime: 0,
  happytime: function() {
    if (Date.now() - this._lastHappytime < 3000) return;
    if (this.sdk && this.isInitialized) {
      this._lastHappytime = Date.now();
      try {
        this.sdk.game.happytime();
      } catch (e) {
        console.warn('[CrazyGames] happytime failed caught gracefully:', e);
      }
    }
  }
};