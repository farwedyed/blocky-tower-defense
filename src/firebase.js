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
    // 1. Create/Update the master device document
    await db.collection('devices').doc(currentDeviceId).set({
      deviceId: currentDeviceId,
      username: username || "Guest",
      isLoggedIn: !!isLoggedIn,
      deviceType: deviceType,
      browser: browser,
      userAgent: ua,
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 2. Nest the individual session document inside the device's subcollection
    await db.collection('devices').doc(currentDeviceId).collection('sessions').doc(currentSessionId).set({
      sessionId: currentSessionId,
      startTime: firebase.firestore.FieldValue.serverTimestamp(),
      totalSessionTime: 0,
      deployed: false,
      selectedMap: "none",
      clicks: [],
      consoleLogs: [],
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    });

    console.log('[Firebase Telemetry] Device registered:', currentDeviceId, 'Session nested:', currentSessionId);
    return currentSessionId;
  } catch (e) {
    console.error('[Firebase Telemetry] Session initialization failed:', e);
    return null;
  }
}

/**
 * Appends interactive clicks and console telemetry to the active nested session document.
 */
export async function updateSessionTelemetry(updates) {
  initFirebase();
  if (!isUsingFirebase || !db || !currentSessionId || !currentDeviceId) return;

  try {
    const docRef = db.collection('devices').doc(currentDeviceId).collection('sessions').doc(currentSessionId);
    const formattedUpdates = { ...updates };
    formattedUpdates.lastActive = firebase.firestore.FieldValue.serverTimestamp();

    // Process and unpack the raw batch array of click objects
    if (updates.click) {
      if (Array.isArray(updates.click)) {
        formattedUpdates.clicks = firebase.firestore.FieldValue.arrayUnion(...updates.click);
      } else {
        formattedUpdates.clicks = firebase.firestore.FieldValue.arrayUnion(updates.click);
      }
      delete formattedUpdates.click;
    }

    // Process and unpack the raw batch array of log objects
    if (updates.log) {
      if (Array.isArray(updates.log)) {
        formattedUpdates.consoleLogs = firebase.firestore.FieldValue.arrayUnion(...updates.log);
      } else {
        formattedUpdates.consoleLogs = firebase.firestore.FieldValue.arrayUnion(updates.log);
      }
      delete formattedUpdates.log;
    }

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

/**
 * Fetches the top 5 records for a map.
 */
export async function fetchTopRecords(mapId) {
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
        const raw = localStorage.getItem('tds_leaderboard') || '{}';
        const lb = JSON.parse(raw);
        lb[mapId] = records;
        localStorage.setItem('tds_leaderboard', JSON.stringify(lb));
      }

      return records;
    } catch (e) {
      console.error('[Firebase] Fetch failed, reading locally:', e);
      return _localLoad(mapId);
    }
  } else {
    return _localLoad(mapId);
  }
}

function _localSave(mapId, entry) {
  try {
    const raw = localStorage.getItem('tds_leaderboard') || '{}';
    const lb = JSON.parse(raw);
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
    const raw = localStorage.getItem('tds_leaderboard') || '{}';
    const lb = JSON.parse(raw);
    return Array.isArray(lb[mapId]) ? lb[mapId] : [];
  } catch (e) {
    return [];
  }
}