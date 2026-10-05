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

function initFirebase() {
  if (db) return;
  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
      db = firebase.firestore();
      isUsingFirebase = true;
      console.log('[Firebase] Firestore connected.');
    } else {
      console.warn('[Firebase] SDK not loaded - falling back to localStorage.');
    }
  } catch (e) {
    console.error('[Firebase] Init failed:', e);
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
  if (!isUsingFirebase || !db) return null;

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
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 2. Nest the individual session document inside the device's subcollection
    await db.collection('devices').doc(currentDeviceId).collection('sessions').doc(currentSessionId).set({
      sessionId: currentSessionId,
      startTime: firebase.firestore.FieldValue.serverTimestamp(),
      totalSessionTime: 0,
      retentionDay: _retention.dayIndex,
      startLevel: level,
      startCoins: coins,
      reachedGameplay: false,
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    });

    // 3. Aggregate retention / daily counters (never blocks the game)
    _writeRetentionCounters(_retention).catch(e => console.warn('[Firebase Telemetry] Retention update failed:', e.message));

    console.log('[Firebase Telemetry] Device registered:', currentDeviceId, 'Session nested:', currentSessionId);
    return currentSessionId;
  } catch (e) {
    console.error('[Firebase Telemetry] Session initialization failed:', e);
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

/**
 * Call once when the player first enters a match this page load.
 * Counts the session as "converted" for the daily gameplay conversion rate.
 */
export async function trackGameplayConversion() {
  if (_gameplayCounted || !isUsingFirebase || !db || !currentSessionId || !_retention) return;
  _gameplayCounted = true;
  try {
    await db.collection('daily').doc(_retention.today).set({
      gameplaySessions: firebase.firestore.FieldValue.increment(1)
    }, { merge: true });
  } catch (e) {
    console.warn('[Firebase Telemetry] Conversion update failed:', e.message);
  }
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
  const inc = firebase.firestore.FieldValue.increment;
  const today = _localDateStr();
  const safePlacement = String(placement || 'unknown').replace(/[^a-z0-9_]/gi, '_');
  try {
    const device = {
      [kind === 'rewarded' ? 'rewardedAdsTotal' : 'midgameAdsTotal']: inc(1),
      adsByDay: { [today]: { [kind]: inc(1) } }
    };
    if (kind === 'rewarded') device.rewardedByPlacement = { [safePlacement]: inc(1) };
    await db.collection('devices').doc(currentDeviceId).set(device, { merge: true });
    await db.collection('daily').doc(today).set({
      [kind === 'rewarded' ? 'rewardedAds' : 'midgameAds']: inc(1)
    }, { merge: true });
  } catch (e) {
    console.warn('[Firebase Telemetry] Ad tracking failed:', e.message);
  }
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
      console.error('[Firebase] Failed to send feedback:', e);
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
      console.error('[Firebase] Upload failed, preserved locally:', e);
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
              }).catch(err => console.error('[Firebase] Background sync failed:', err));
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