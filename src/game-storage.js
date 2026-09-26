// src/game-storage.js
// Handles reading and writing player stats, daily quests, and speedrun records.
// Integrated with CrazyGames Data module for seamless cross-device cloud saving.

import { uploadRecord, fetchTopRecords } from './firebase.js';
import { CrazyGamesManager } from './crazygames.js';
import { soundManager } from './sound.js';
import { 
  DEFAULT_UNLOCKED_AGENTS, 
  DEFAULT_EQUIPPED_AGENTS, 
  QUEST_GOALS, 
  DEFAULT_QUEST_PROGRESS, 
  DEFAULT_QUEST_REWARDED 
} from './game-config.js';

/**
 * Defensive getter utilizing the CrazyGames SDK Data Module if available,
 * falling back gracefully to traditional window.localStorage.
 */
function getStorageItem(key) {
  if (CrazyGamesManager.isAvailable() && window.CrazyGames?.SDK?.data) {
    try {
      return window.CrazyGames.SDK.data.getItem(key);
    } catch (e) {
      // Fallback silently without throwing errors
    }
  }
  try {
    const val = localStorage.getItem(key);
    return val === 'undefined' ? null : val;
  } catch (e) {
    return null;
  }
}

/**
 * Defensive setter utilizing the CrazyGames SDK Data Module if available,
 * falling back gracefully to traditional window.localStorage.
 */
function setStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch(e) {}

  if (CrazyGamesManager.isAvailable() && window.CrazyGames?.SDK?.data) {
    try {
      window.CrazyGames.SDK.data.setItem(key, value);
    } catch (e) {}
  }
}

/**
 * Loads saved progression stats from cloud or local storage into the active game state.
 * @param {object} game - The main game instance
 */
export async function loadStatsFromStorage(game) {
  if (typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK) {
    await CrazyGamesManager.initPromise;
  }

  try {
    const level = getStorageItem('tds_level');
    const xp = getStorageItem('tds_xp');
    const coins = getStorageItem('tds_coins');
    const unlocked = getStorageItem('tds_unlocked');
    const equipped = getStorageItem('tds_equipped');
    const skins = getStorageItem('tds_skins');
    const eqSkins = getStorageItem('tds_equipped_skins');
    const quests = getStorageItem('tds_quests');
    const questRewarded = getStorageItem('tds_quest_rewarded');
    const tutorial = getStorageItem('tds_tutorial_completed');
    const soloGuided = getStorageItem('tds_solo_guided');
    const leaderboard = getStorageItem('tds_leaderboard');

    if (level) game.playerLevel = parseInt(level);
    if (xp) game.playerXp = parseInt(xp);
    if (coins) game.playerCoins = parseInt(coins);
    
    if (unlocked) game.unlockedAgents = JSON.parse(unlocked);
    if (equipped) game.equippedAgents = JSON.parse(equipped);
    if (skins) game.ownedSkins = JSON.parse(skins);
    if (eqSkins) game.equippedSkins = JSON.parse(eqSkins);
    
    const todayStr = new Date().toLocaleDateString();
    const lastQuestDate = getStorageItem('tds_last_quest_date');

    if (lastQuestDate !== todayStr) {
      game.questProgress = {
        kills: 0,
        cashSpent: 0,
        wavesSurvived: 0,
        scoutsPlaced: 0,
        snipersPlaced: 0,
        farmsPlaced: 0
      };
      game.questRewarded = {
        kills: false,
        cashSpent: false,
        wavesSurvived: false,
        scoutsPlaced: false,
        snipersPlaced: false,
        farmsPlaced: false
      };
      setStorageItem('tds_last_quest_date', todayStr);
      saveStatsToStorage(game);
    } else {
      if (quests) {
        const parsedQuests = JSON.parse(quests);
        if (parsedQuests && typeof parsedQuests === 'object') {
          game.questProgress = { ...game.questProgress, ...parsedQuests };
        }
      }
      if (questRewarded) {
        const parsed = JSON.parse(questRewarded);
        if (parsed && typeof parsed === 'object') {
          game.questRewarded = { ...game.questRewarded, ...parsed };
        }
      }
    }
    
    game.soloGuided = (soloGuided === 'true');
    if (tutorial === 'true') {
      game.tutorialCompleted = true;
      game.tutorialActive = false;
    } else {
      game.tutorialCompleted = false;
      game.tutorialActive = true;
      game.soloGuided = false;
    }
    
    if (leaderboard) {
      const parsed = JSON.parse(leaderboard);
      if (parsed && typeof parsed === 'object') {
        game.leaderboard = parsed;
      }
    }
  } catch (e) {
    console.warn("Storage load failed, adopting defaults.", e);
  }

  if (Array.isArray(game.unlockedAgents)) {
    game.unlockedAgents = game.unlockedAgents.filter(a => a && typeof a === 'string');
  }
  if (Array.isArray(game.equippedAgents)) {
    game.equippedAgents = game.equippedAgents.filter(a => a && typeof a === 'string');
  }
  if (Array.isArray(game.ownedSkins)) {
    game.ownedSkins = game.ownedSkins.filter(s => s && typeof s === 'string');
  }

  if (game.equippedSkins && typeof game.equippedSkins === 'object') {
    for (const k of Object.keys(game.equippedSkins)) {
      if (!k || typeof k !== 'string' || typeof game.equippedSkins[k] !== 'string') {
        delete game.equippedSkins[k];
      }
    }
  } else {
    game.equippedSkins = {};
  }

  if (!Array.isArray(game.unlockedAgents) || game.unlockedAgents.length === 0) {
    game.unlockedAgents = [...DEFAULT_UNLOCKED_AGENTS];
  }
  if (!Array.isArray(game.equippedAgents) || game.equippedAgents.length === 0) {
    game.equippedAgents = [...DEFAULT_EQUIPPED_AGENTS];
  }
  if (!Array.isArray(game.ownedSkins)) {
    game.ownedSkins = [];
  }
  if (!game.leaderboard || typeof game.leaderboard !== 'object') {
    game.leaderboard = { grassland: [], desert: [], tundra: [], cyber_city: [], fallen_outpost: [] };
  }
}

/**
 * Persists current progression stats securely to cloud or local storage.
 * @param {object} game - The main game instance
 */
export function saveStatsToStorage(game) {
  try {
    setStorageItem('tds_level', game.playerLevel.toString());
    setStorageItem('tds_xp', game.playerXp.toString());
    setStorageItem('tds_coins', game.playerCoins.toString());
    setStorageItem('tds_unlocked', JSON.stringify(game.unlockedAgents));
    setStorageItem('tds_equipped', JSON.stringify(game.equippedAgents));
    setStorageItem('tds_skins', JSON.stringify(game.ownedSkins));
    setStorageItem('tds_equipped_skins', JSON.stringify(game.equippedSkins));
    setStorageItem('tds_quests', JSON.stringify(game.questProgress));
    setStorageItem('tds_quest_rewarded', JSON.stringify(game.questRewarded));
    setStorageItem('tds_tutorial_completed', game.tutorialCompleted ? 'true' : 'false');
    setStorageItem('tds_solo_guided', game.soloGuided ? 'true' : 'false');
    setStorageItem('tds_leaderboard', JSON.stringify(game.leaderboard));
  } catch (e) {
    console.warn("Storage save failed.", e);
  }
}

/**
 * Calculates, awards, and saves match earnings (coins & XP) based on wave progression and difficulty.
 * Guaranteed to run on Defeat, Victory, or Quit Lobby.
 * @param {object} game 
 * @returns {object} { coinsEarned, xpEarned }
 */
export function awardMatchRewards(game) {
  if (game._rewardsClaimed) {
    return { coinsEarned: 0, xpEarned: 0 };
  }
  game._rewardsClaimed = true;

  const finalWave = game.wave || 0;
  const mapMult = game.selectedMap === 'tundra' ? 1.5 : game.selectedMap === 'desert' ? 1.25 : 1.0;
  const diffConfig = game.difficultySettings[game.selectedDifficulty] || { coinMultiplier: 1.0, xpMultiplier: 1.0 };
  const isHc = game.isHardcore;

  // Base rewards scaled by waves defended and difficulty
  let coinsEarned = Math.round((10 + finalWave * 5) * mapMult * diffConfig.coinMultiplier);
  let xpEarned = Math.round((15 + finalWave * 4) * mapMult * diffConfig.xpMultiplier);

  if (game.state === 'victory' && isHc) {
    coinsEarned *= 3;
    xpEarned *= 3;
  }

  game.playerCoins += coinsEarned;
  game.playerXp += xpEarned;

  // Level up check
  const nextLevelXp = game.playerLevel * 100;
  if (game.playerXp >= nextLevelXp) {
    game.playerXp -= nextLevelXp;
    game.playerLevel++;
    soundManager.playUpgrade();
    if (game.effectManager) {
      game.effectManager.spawnText(400, 200, `LEVEL UP! LEVEL ${game.playerLevel}`, '#f1c40f');
    }
  }

  saveStatsToStorage(game);

  // Immediately update lobby meta UI so coin and XP counts are reflected accurately
  if (game.ui && game.ui.lobby) {
    game.ui.lobby.updateLobbyMeta(game.playerLevel, game.playerXp, game.playerCoins);
  }

  return { coinsEarned, xpEarned };
}

/**
 * Checks for completed daily quests and awards coins.
 * @param {object} game - The main game instance
 */
export function checkQuestCompletion(game) {
  let anyCompleted = false;
  const goals = game.questGoals;

  if (!game.questRewarded.kills && (game.questProgress.kills || 0) >= goals.kills) {
    game.questRewarded.kills = true;
    game.playerCoins += 75;
    anyCompleted = true;
    game.effectManager.spawnText(400, 260, 'QUEST COMPLETE! +75 Coins', '#f1c40f');
  }
  if (!game.questRewarded.cashSpent && (game.questProgress.cashSpent || 0) >= goals.cashSpent) {
    game.questRewarded.cashSpent = true;
    game.playerCoins += 100;
    anyCompleted = true;
    game.effectManager.spawnText(400, 260, 'QUEST COMPLETE! +100 Coins', '#f1c40f');
  }
  if (!game.questRewarded.wavesSurvived && (game.questProgress.wavesSurvived || 0) >= goals.wavesSurvived) {
    game.questRewarded.wavesSurvived = true;
    game.playerCoins += 75;
    anyCompleted = true;
    game.effectManager.spawnText(400, 240, 'QUEST COMPLETE! +75 Coins', '#f1c40f');
  }
  if (!game.questRewarded.scoutsPlaced && (game.questProgress.scoutsPlaced || 0) >= goals.scoutsPlaced) {
    game.questRewarded.scoutsPlaced = true;
    game.playerCoins += 50;
    anyCompleted = true;
    game.effectManager.spawnText(400, 220, 'QUEST COMPLETE! +50 Coins', '#f1c40f');
  }
  if (!game.questRewarded.snipersPlaced && (game.questProgress.snipersPlaced || 0) >= goals.snipersPlaced) {
    game.questRewarded.snipersPlaced = true;
    game.playerCoins += 50;
    anyCompleted = true;
    game.effectManager.spawnText(400, 200, 'QUEST COMPLETE! +50 Coins', '#f1c40f');
  }
  
  if (game.unlockedAgents.includes('farm') && !game.questRewarded.farmsPlaced && (game.questProgress.farmsPlaced || 0) >= goals.farmsPlaced) {
    game.questRewarded.farmsPlaced = true;
    game.playerCoins += 60;
    anyCompleted = true;
    game.effectManager.spawnText(400, 180, 'QUEST COMPLETE! +60 Coins', '#f1c40f');
  }

  if (anyCompleted) {
    saveStatsToStorage(game);
    if (game.ui) game.ui.renderDailyQuests();
  }
}

/**
 * Computes match completion time and uploads records to Firestore and local leaderboards.
 * @param {object} game - The main game instance
 */
export function saveSpeedrunRecord(game) {
  const minutes = Math.floor(game.matchTime / 60);
  const seconds = Math.floor(game.matchTime % 60);
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  const activeUsername = CrazyGamesManager.currentUser?.username 
    || localStorage.getItem('tds_player_username') 
    || "Guest";

  const entry = {
    name: activeUsername,
    time: timeStr,
    timeRaw: game.matchTime,
    date: new Date().toLocaleDateString()
  };
  
  if (!Array.isArray(game.leaderboard[game.selectedMap])) {
    game.leaderboard[game.selectedMap] = [];
  }
  game.leaderboard[game.selectedMap].push(entry);
  game.leaderboard[game.selectedMap].sort((a, b) => a.timeRaw - b.timeRaw);
  game.leaderboard[game.selectedMap] = game.leaderboard[game.selectedMap].slice(0, 5);
  
  saveStatsToStorage(game);
  
  uploadRecord(game.selectedMap, entry).then(() => {
    return fetchTopRecords(game.selectedMap);
  }).then(records => {
    game.leaderboard[game.selectedMap] = records;
    if (game.ui) game.ui.renderLeaderboard(game.selectedMap);
  }).catch(e => console.warn('[Leaderboard] Sync error:', e));
}