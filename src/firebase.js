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
 * Upload an optional, anonymous player feedback submission directly to Firestore.
 * @param {string} text - The text comment provided by the player.
 * @param {number} rating - Auto-generated context rating based on win/loss status.
 * @param {object} metadata - Context data containing mapId, finalWave, and isVictory.
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
      console.log('[Firebase] Feedback uploaded successfully.');
    } catch (e) {
      console.error('[Firebase] Failed to send feedback:', e);
    }
  } else {
    console.log('[Firebase Sandbox] Offline fallback. Feedback logged:', text, rating, metadata);
  }
}

/**
 * Upload a speedrun record to Firestore (and always cache locally).
 * @param {string} mapId  - e.g. 'grassland', 'desert', 'tundra'
 * @param {object} entry  - { name, time, timeRaw, date }
 */
export async function uploadRecord(mapId, entry) {
  initFirebase();
  // Always cache locally first so we have an instant, reliable offline backup
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
 * Fetch the top 5 speedrun records for a given map.
 * Syncs local records up to Firestore if the online database is empty.
 * @param {string} mapId
 * @returns {Promise<Array>} sorted array of { name, time, timeRaw, date }
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
        // Firestore is empty. Check if we have offline records from when rules were closed.
        const localRecords = _localLoad(mapId);
        if (localRecords.length > 0) {
          console.log('[Firebase] Local cache found while database is empty. Syncing records to database...');
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
        // Sync local cache with latest database records to keep them in perfect alignment
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
    
    // Prevent duplicate score entries
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