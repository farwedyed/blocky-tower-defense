// src/firebase.js
// Firebase is loaded via CDN Compat scripts in index.html

const firebaseConfig = {
  apiKey: "AIzaSyBut_a8nZHJz6CinDkl6mzyGa9JgVdhzjw",
  authDomain: "towerdefense-fb511.firebaseapp.com",
  projectId: "towerdefense-fb511",
  storageBucket: "towerdefense-fb511.firebasestorage.app",
  messagingSenderId: "535164958070",
  appId: "1:535164958070:web:8e2377b16a45a8407bf657"
};

let db = null;
let isUsingFirebase = false;
let currentSessionId = null;
let currentDeviceId = null; // Tracks parent device reference across updates

// ─── QUOTA GUARD ───
// Firebase is only our own stats. When the free daily quota runs out, Firestore keeps retrying
// and logs "Quota exceeded" / "Using maximum backoff delay" as console errors, which look like
// game errors. So: Firestore's own logging is switched off, and as soon as a write fails with
// resource-exhausted (or hangs for 20s) we stop writing for the rest of the session and, for
// the quota case, for every session until the quota resets (midnight Pacific = 10:00 Cairo).
// Nothing in the game depends on these writes.
const WRITE_STALL_MS = 20000;
let _writesBlocked = false;

function _pacificDay() {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()); }
  catch (e) { return new Date().toISOString().slice(0, 10); }
}

function _quotaBlockedToday() {
  try { return localStorage.getItem('tds_fs_quota_day') === _pacificDay(); } catch (e) { return false; }
}

function _blockWrites(reason, rememberForToday) {
  if (_writesBlocked) return;
  _writesBlocked = true;
  if (rememberForToday) { try { localStorage.setItem('tds_fs_quota_day', _pacificDay()); } catch (e) {} }
  console.warn('[Firebase] Stats writes paused (' + reason + ').');
}

function _isQuotaError(e) {
  const code = e && (e.code || '');
  return code === 'resource-exhausted' || /quota|resource.exhausted/i.test(String(e && e.message || e));
}

// Wraps a Firestore write: skipped when blocked, never hangs our code, never rejects loudly.
function _guardWrite(promise) {
  let timer;
  const stall = new Promise((_, reject) => { timer = setTimeout(() => reject({ code: 'stalled' }), WRITE_STALL_MS); });
  return Promise.race([promise, stall]).then(
    (v) => { clearTimeout(timer); return v; },
    (e) => {
      clearTimeout(timer);
      if (_isQuotaError(e)) _blockWrites('quota', true);
      else if (e && e.code === 'stalled') _blockWrites('write stalled', false);
      throw e;
    }
  );
}

function _installWriteGuard() {
  try {
    const fs = firebase.firestore;
    if (fs.setLogLevel) fs.setLogLevel('silent'); // no Firestore console errors (quota, backoff, offline)
    const patch = (proto, name) => {
      if (!proto || !proto[name] || proto[name].__btdGuarded) return;
      const orig = proto[name];
      const wrapped = function () {
        if (_writesBlocked) return Promise.reject({ code: 'blocked', message: 'stats writes paused' });
        return _guardWrite(orig.apply(this, arguments));
      };
      wrapped.__btdGuarded = true;
      proto[name] = wrapped;
    };
    patch(fs.DocumentReference && fs.DocumentReference.prototype, 'set');
    patch(fs.DocumentReference && fs.DocumentReference.prototype, 'update');
    patch(fs.CollectionReference && fs.CollectionReference.prototype, 'add');
  } catch (e) {}
  if (_quotaBlockedToday()) _writesBlocked = true;
}

function initFirebase() {
  if (db) return;
  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();
      _installWriteGuard();
      isUsingFirebase = true;
      console.log('[Firebase] Firestore connected.');
    } else {
      console.warn('[Firebase] SDK not loaded - falling back to localStorage.');
    }
  } catch (e) {
    console.warn('[Firebase] Init failed:', e);
    isUsingFirebase = false;
    db = null;
  }
}

/**
 * Retrieves an existing device ID from local storage, or generates a persistent one.
 */
function getOrCreateDeviceId() {
  let deviceId = localStorage.getItem('tds_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
    localStorage.setItem('tds_device_id', deviceId);
  }
  return deviceId;
}

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
}

/**
 * Initializes a persistent device log and nests the page-load session inside it.
 */
export async function startSessionTelemetry(username, isLoggedIn) {
  initFirebase();
  if (!isUsingFirebase || !db || _writesBlocked) return null; // quota used up today: no stats this session

  if (!currentSessionId) {
    currentSessionId = generateSessionId();
  }
  if (!currentDeviceId) {
    currentDeviceId = getOrCreateDeviceId();
  }

  // Browser and Device type tracking
  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.indexOf("Chrome") > -1) browser = "Chrome";
  else if (ua.indexOf("Safari") > -1) browser = "Safari";
  else if (ua.indexOf("Firefox") > -1) browser = "Firefox";
  else if (ua.indexOf("Edge") > -1) browser = "Edge";

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const deviceType = isMobile ? "Mobile" : "Desktop";

  try {
    _retention = _computeRetention();
    const level = parseInt(_lsGet('tds_level') || '1', 10) || 1;
    const coins = parseInt(String(_lsGet('tds_coins') || '0').replace(/,/g, ''), 10) || 0;

    // 1. Create/Update the master device document
    await db.collection('devices').doc(currentDeviceId).set({
      deviceId: currentDeviceId,
      username: username || "Guest",
      isLoggedIn: !!isLoggedIn,
      deviceType: deviceType,
      browser: browser,
      userAgent: ua,
      firstSeen: _retention.first,
      lastSeen: _retention.today,
      retentionDay: _retention.dayIndex,
      activeDays: firebase.firestore.FieldValue.arrayUnion(_retention.dayIndex),
      level: level,
      coins: coins,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      // Counters: increment(0) makes them show up as 0 for new players without touching existing totals
      sessionCount: firebase.firestore.FieldValue.increment(1),
      totalPlaySeconds: firebase.firestore.FieldValue.increment(0),
      gameplaySessions: firebase.firestore.FieldValue.increment(0),
      rewardedAdsTotal: firebase.firestore.FieldValue.increment(0),
      midgameAdsTotal: firebase.firestore.FieldValue.increment(0),
      adsByDay: { [_retention.today]: { rewarded: firebase.firestore.FieldValue.increment(0), midgame: firebase.firestore.FieldValue.increment(0) } },
      // Start info of the latest visit (was a separate sessions/{id} doc = 1 extra write per load)
      lastSessionStart: { sessionId: currentSessionId, startTime: firebase.firestore.FieldValue.serverTimestamp(), startLevel: level, startCoins: coins }
    }, { merge: true });

    // 3. Aggregate retention / daily counters (never blocks the game)
    _writeRetentionCounters(_retention).catch(e => console.warn('[Firebase Telemetry] Retention update failed:', e.message));

    console.log('[Firebase Telemetry] Device registered:', currentDeviceId, 'Session nested:', currentSessionId);
    return currentSessionId;
  } catch (e) {
    console.warn('[Firebase Telemetry] Session initialization failed:', e && (e.code || e.message));
    return null;
  }
}

// ─── RETENTION + CONVERSION (aggregate counters, cheap to read in the console) ───
// retention/{YYYY-MM-DD of first visit}: players, d1, d2, d7
//   D1 retention for that day = d1 / players (same for d2, d7)
// daily/{YYYY-MM-DD}: sessions, gameplaySessions, newPlayers, returningSessions
//   Gameplay conversion for that day = gameplaySessions / sessions

function _localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function _daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = fromStr.split('-').map(Number);
  const [y2, m2, d2] = toStr.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function _lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function _lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/**
 * Works out this player's retention day from their first visit date (kept in
 * localStorage) and bumps the cohort + daily counters. Each milestone is only
 * counted once per player. Returns info that is also stored on the device doc.
 */
function _computeRetention() {
  const today = _localDateStr();
  let first = _lsGet('tds_ret_first');
  let isNew = false;
  let legacy = _lsGet('tds_ret_legacy') === 'true';

  if (!first) {
    first = today;
    _lsSet('tds_ret_first', first);
    // Players who already had progress before retention tracking existed are not
    // a real "day 0" — keep them out of the cohort numbers.
    const hadProgress = _lsGet('tds_tutorial_completed') === 'true' || parseInt(_lsGet('tds_level') || '1', 10) > 1;
    if (hadProgress) {
      legacy = true;
      _lsSet('tds_ret_legacy', 'true');
    } else {
      isNew = true;
    }
  }

  const dayIndex = Math.max(0, _daysBetween(first, today));
  let counted = [];
  try { counted = JSON.parse(_lsGet('tds_ret_counted') || '[]'); } catch (e) { counted = []; }

  const milestones = [];
  if (!legacy) {
    for (const n of [1, 2, 7]) {
      if (dayIndex === n && !counted.includes(n)) {
        milestones.push(n);
        counted.push(n);
      }
    }
    if (milestones.length) _lsSet('tds_ret_counted', JSON.stringify(counted));
  }

  // Count the session only once per page load
  return { today, first, dayIndex, isNew, legacy, milestones };
}

let _retention = null;
let _gameplayCounted = false;

async function _writeRetentionCounters(info) {
  const inc = firebase.firestore.FieldValue.increment;
  const daily = { sessions: inc(1) };
  if (info.isNew) daily.newPlayers = inc(1);
  if (info.dayIndex > 0) daily.returningSessions = inc(1);
  await db.collection('daily').doc(info.today).set(daily, { merge: true });

  if (info.isNew || info.milestones.length) {
    const cohort = {};
    if (info.isNew) cohort.players = inc(1);
    for (const n of info.milestones) cohort['d' + n] = inc(1);
    await db.collection('retention').doc(info.first).set(cohort, { merge: true });
  }
}

// ─── BUFFERED COUNTERS (cuts Firestore writes) ───
// Ad requests, ads watched and the gameplay conversion used to be written the moment they
// happened (1-3 writes each). Now they are added up in memory and written together with the
// regular progress save (every 10 min + when the tab is hidden/closed): at most 1 device write
// + 1 daily write per save, however many ads happened.
const _pendingDaily = {};   // dotted path -> amount, e.g. 'adRequests.midgame.match_start.shown': 2
const _pendingDevice = {};  // same, for devices/{id}
let _pendingDailyDate = null;

function _addPending(target, path, n = 1) {
  target[path] = (target[path] || 0) + n;
}

function _nestIncrements(flat) {
  const inc = firebase.firestore.FieldValue.increment;
  const out = {};
  for (const path of Object.keys(flat)) {
    const parts = path.split('.');
    let o = out;
    for (let i = 0; i < parts.length - 1; i++) o = (o[parts[i]] = o[parts[i]] || {});
    o[parts[parts.length - 1]] = inc(flat[path]);
  }
  return out;
}

function _takePending(target) {
  const copy = { ...target };
  for (const k of Object.keys(target)) delete target[k];
  return copy;
}

function _putBack(target, copy) {
  for (const k of Object.keys(copy)) _addPending(target, k, copy[k]);
}

async function _flushDaily() {
  if (!Object.keys(_pendingDaily).length) return;
  const date = _pendingDailyDate || _localDateStr();
  const batch = _takePending(_pendingDaily);
  _pendingDailyDate = null;
  try {
    await db.collection('daily').doc(date).set(_nestIncrements(batch), { merge: true });
  } catch (e) {
    _putBack(_pendingDaily, batch);
    console.warn('[Firebase Telemetry] Daily counters save failed:', e.message);
  }
}

function _dailyKeyFor(path) {
  // Counters are filed under the day they happened; if the day changes, write the old day first
  const today = _localDateStr();
  if (_pendingDailyDate && _pendingDailyDate !== today) _flushDaily();
  if (!_pendingDailyDate) _pendingDailyDate = today;
  _addPending(_pendingDaily, path);
}

/**
 * Call once when the player first enters a match this page load.
 * Counts the session as "converted" for the daily gameplay conversion rate.
 */
export async function trackGameplayConversion() {
  if (_gameplayCounted || !isUsingFirebase || !db || !currentSessionId || !_retention) return;
  _gameplayCounted = true;
  _dailyKeyFor('gameplaySessions'); // written with the next progress save
}

/**
 * Counts an ad the player actually watched.
 * devices/{id}: rewardedAdsTotal, midgameAdsTotal, adsByDay.{date}.rewarded / .midgame,
 *               rewardedByPlacement.{placement}
 * daily/{date}: rewardedAds, midgameAds
 */
export async function trackAdWatched(kind, placement) {
  if (!isUsingFirebase || !db || !currentSessionId || !currentDeviceId) return;
  if (kind !== 'rewarded' && kind !== 'midgame') return;
  const today = _localDateStr();
  const safePlacement = String(placement || 'unknown').replace(/[^a-z0-9_]/gi, '_');
  // Buffered: written with the next progress save (see BUFFERED COUNTERS)
  _addPending(_pendingDevice, kind === 'rewarded' ? 'rewardedAdsTotal' : 'midgameAdsTotal');
  _addPending(_pendingDevice, 'adsByDay.' + today + '.' + kind);
  if (kind === 'rewarded') _addPending(_pendingDevice, 'rewardedByPlacement.' + safePlacement);
  _dailyKeyFor(kind === 'rewarded' ? 'rewardedAds' : 'midgameAds');
}

/**
 * Counts every ad REQUEST and how it ended, so "0 ads" can be told apart from "ads refused".
 * daily/{date}: midgameRequests / rewardedRequests (+1),
 *               adRequests.{kind}.{placement}.{outcome} (+1)
 * outcome: shown | adCooldown | unfilled | adblock | timeout | late_start | no_sdk | other...
 */
export async function trackAdRequest(kind, placement, outcome) {
  if (!isUsingFirebase || !db || !currentSessionId) return;
  if (kind !== 'rewarded' && kind !== 'midgame') return;
  const clean = (s) => String(s || 'unknown').replace(/[^a-z0-9_]/gi, '_').slice(0, 30) || 'unknown';
  // Buffered: written with the next progress save (see BUFFERED COUNTERS)
  _dailyKeyFor(kind + 'Requests');
  _dailyKeyFor('adRequests.' + kind + '.' + clean(placement) + '.' + clean(outcome));
}

/**
 * Saves one JavaScript error (queued by the error catcher in index.html).
 * errors/{signature}: message, file, line, stack, count, byDay.{date}, lastSeen, lastContext
 * daily/{date}: errorSessions (+1 once per session that had any error)
 * The catcher already limits this to 5 unique errors per session.
 */
let _errorSessionCounted = false;
const _errorsSent = new Set();
function _hashKey(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
export async function reportClientError(item) {
  if (!isUsingFirebase || !db || !currentSessionId || !item || !item.key) return;
  if (_errorsSent.has(item.key)) return;
  _errorsSent.add(item.key);
  const inc = firebase.firestore.FieldValue.increment;
  const today = _localDateStr();
  try {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
    await db.collection('errors').doc(item.kind + '_' + _hashKey(item.key)).set({
      kind: item.kind,
      message: item.message,
      file: item.file || '',
      line: item.line || 0,
      col: item.col || 0,
      stack: item.stack || '',
      count: inc(1),
      byDay: { [today]: inc(1) },
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      lastContext: { ...(item.ctx || {}), browser }
    }, { merge: true });
    if (!_errorSessionCounted) {
      _errorSessionCounted = true;
      await db.collection('daily').doc(today).set({ errorSessions: inc(1) }, { merge: true });
    }
  } catch (e) {
    console.warn('[Firebase Telemetry] Error report failed:', e.message);
  }
}

/**
 * Saves play time + progress on the DEVICE doc in a single write (so everything is visible in one place):
 * totalPlaySeconds (+ seconds since the last save), sessionSeconds.{sessionId}, lastSessionSeconds,
 * gameplaySessions (+1 the first save after this session started a match), level, coins.
 */
let _gameplayCountedOnDevice = false;
export async function saveSessionProgress(p) {
  if (!isUsingFirebase || !db || !currentSessionId || !currentDeviceId) return;
  const inc = firebase.firestore.FieldValue.increment;
  const update = {
    totalPlaySeconds: inc(Math.max(0, Math.round(p.deltaSeconds || 0))),
    sessionSeconds: { [currentSessionId]: p.seconds },
    lastSessionSeconds: p.seconds,
    lastActive: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (p.level !== undefined) update.level = p.level;
  if (p.coins !== undefined) update.coins = p.coins;
  if (p.reachedGameplay && !_gameplayCountedOnDevice) {
    _gameplayCountedOnDevice = true;
    update.gameplaySessions = inc(1);
  }
  const deviceCounters = _takePending(_pendingDevice);
  Object.assign(update, _deepMerge(update, _nestIncrements(deviceCounters)));
  const dailyDone = _flushDaily();
  try {
    await db.collection('devices').doc(currentDeviceId).set(update, { merge: true });
  } catch (e) {
    if (update.gameplaySessions) _gameplayCountedOnDevice = false;
    _putBack(_pendingDevice, deviceCounters);
    console.warn('[Firebase Telemetry] Progress save failed:', e.message);
  }
  await dailyDone;
}

function _deepMerge(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    const bv = b[k];
    if (bv && typeof bv === 'object' && bv.constructor === Object && out[k] && typeof out[k] === 'object' && out[k].constructor === Object) {
      out[k] = _deepMerge(out[k], bv);
    } else {
      out[k] = bv;
    }
  }
  return out;
}

/**
 * Updates the active session document.
 */
export async function updateSessionTelemetry(updates) {
  initFirebase();
  if (!isUsingFirebase || !db || !currentSessionId || !currentDeviceId) return;

  try {
    const docRef = db.collection('devices').doc(currentDeviceId).collection('sessions').doc(currentSessionId);
    const formattedUpdates = { ...updates };
    formattedUpdates.lastActive = firebase.firestore.FieldValue.serverTimestamp();

    // Use set with merge: true to avoid "No document to update" errors entirely
    await docRef.set(formattedUpdates, { merge: true });
  } catch (e) {
    console.warn('[Firebase Telemetry] Update failed:', e.message);
  }
}

/**
 * Uploads player feedback to Firestore.
 */
export async function uploadFeedback(text, rating, metadata = {}) {
  initFirebase();
  if (isUsingFirebase && db) {
    try {
      await db.collection('feedback').add({
        text: text,
        rating: rating,
        mapId: metadata.mapId || 'unknown',
        finalWave: metadata.finalWave || 0,
        isVictory: metadata.isVictory !== undefined ? metadata.isVictory : false,
        playerName: localStorage.getItem('tds_player_username') || "Guest",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log('[Firebase] Feedback uploaded.');
    } catch (e) {
      console.warn('[Firebase] Failed to send feedback:', e && (e.code || e.message));
    }
  } else {
    console.log('[Firebase Sandbox] Offline fallback. Feedback logged:', text, rating, metadata);
  }
}

/**
 * Uploads speedrun records locally and to Firestore.
 */
export async function uploadRecord(mapId, entry) {
  initFirebase();
  _localSave(mapId, entry);

  if (isUsingFirebase && db) {
    try {
      await db
        .collection('leaderboards')
        .doc(mapId)
        .collection('records')
        .add({
          name: entry.name || "Guest",
          time: entry.time,
          timeRaw: entry.timeRaw,
          date: entry.date,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      console.log('[Firebase] Record uploaded for "' + mapId + '":', entry.time);
    } catch (e) {
      console.warn('[Firebase] Upload failed, preserved locally:', e && (e.code || e.message));
    }
  }
}

// Leaderboard reads are cached so opening the menu / switching maps doesn't hit
// Firestore every time (each fetch costs 5 document reads; the free plan allows 50,000/day).
const LEADERBOARD_CACHE_MS = 10 * 60 * 1000;
const _lbCache = {};     // mapId -> { at, records }
const _lbInFlight = {};  // mapId -> Promise

/**
 * Fetches the top 5 records for a map (cached for 10 minutes).
 * Pass { force: true } right after uploading a new record.
 */
export async function fetchTopRecords(mapId, opts = {}) {
  const cached = _lbCache[mapId];
  if (!opts.force && cached && Date.now() - cached.at < LEADERBOARD_CACHE_MS) {
    return cached.records;
  }
  if (!opts.force && _lbInFlight[mapId]) return _lbInFlight[mapId];

  const p = _fetchTopRecordsUncached(mapId).then(records => {
    _lbCache[mapId] = { at: Date.now(), records };
    return records;
  }).finally(() => { delete _lbInFlight[mapId]; });
  _lbInFlight[mapId] = p;
  return p;
}

async function _fetchTopRecordsUncached(mapId) {
  initFirebase();
  if (isUsingFirebase && db) {
    try {
      const snap = await db
        .collection('leaderboards')
        .doc(mapId)
        .collection('records')
        .orderBy('timeRaw', 'asc')
        .limit(5)
        .get();
      const records = snap.docs.map(doc => {
        const d = doc.data();
        return { 
          name: d.name || "Guest",
          time: d.time, 
          timeRaw: d.timeRaw, 
          date: d.date 
        };
      });
      
      console.log('[Firebase] Fetched ' + records.length + ' record(s) online for "' + mapId + '".');
      
      if (records.length === 0) {
        const localRecords = _localLoad(mapId);
        if (localRecords.length > 0) {
          for (const entry of localRecords) {
            db.collection('leaderboards')
              .doc(mapId)
              .collection('records')
              .add({
                name: entry.name || "Guest",
                time: entry.time,
                timeRaw: entry.timeRaw,
                date: entry.date,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              }).catch(err => console.warn('[Firebase] Background sync failed:', err && (err.code || err.message)));
          }
          return localRecords;
        }
      } else {
        const raw = localStorage.getItem('tds_leaderboard');
        let lb = {};
        if (raw && raw !== 'undefined' && raw !== 'null') {
          try { lb = JSON.parse(raw); } catch (err) { lb = {}; }
        }
        lb[mapId] = records;
        localStorage.setItem('tds_leaderboard', JSON.stringify(lb));
      }

      return records;
    } catch (e) {
      console.warn('[Firebase] Fetch failed, reading locally:', e);
      return _localLoad(mapId);
    }
  } else {
    return _localLoad(mapId);
  }
}

function _localSave(mapId, entry) {
  try {
    const raw = localStorage.getItem('tds_leaderboard');
    let lb = {};
    if (raw && raw !== 'undefined' && raw !== 'null') {
      try { lb = JSON.parse(raw); } catch (err) { lb = {}; }
    }
    if (!Array.isArray(lb[mapId])) lb[mapId] = [];
    
    const exists = lb[mapId].some(item => item.timeRaw === entry.timeRaw && item.date === entry.date);
    if (!exists) {
      lb[mapId].push(entry);
      lb[mapId].sort((a, b) => a.timeRaw - b.timeRaw);
      lb[mapId] = lb[mapId].slice(0, 5);
      localStorage.setItem('tds_leaderboard', JSON.stringify(lb));
    }
  } catch (e) {
    console.warn('[Firebase][local] localStorage save failed:', e);
  }
}

function _localLoad(mapId) {
  try {
    const raw = localStorage.getItem('tds_leaderboard');
    if (!raw || raw === 'undefined' || raw === 'null') return [];
    const lb = JSON.parse(raw);
    return Array.isArray(lb[mapId]) ? lb[mapId] : [];
  } catch (e) {
    return [];
  }
}