// src/game-storage.js
// Handles reading and writing player stats, daily quests, and speedrun records.

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
 * Loads saved progression stats from localStorage into the active game state.
 * @param {object} game - The main game instance
 */
export function loadStatsFromStorage(game) {
  try {
    const level = localStorage.getItem('tds_level');
    const xp = localStorage.getItem('tds_xp');
    const coins = localStorage.getItem('tds_coins');
    const unlocked = localStorage.getItem('tds_unlocked');
    const equipped = localStorage.getItem('tds_equipped');
    const skins = localStorage.getItem('tds_skins');
    const eqSkins = localStorage.getItem('tds_equipped_skins');
    const quests = localStorage.getItem('tds_quests');
    const questRewarded = localStorage.getItem('tds_quest_rewarded');
    const tutorial = localStorage.getItem('tds_tutorial_completed');
    const leaderboard = localStorage.getItem('tds_leaderboard');

    if (level) game.playerLevel = parseInt(level);
    if (xp) game.playerXp = parseInt(xp);
    if (coins) game.playerCoins = parseInt(coins);
    
    if (unlocked) game.unlockedAgents = JSON.parse(unlocked);
    if (equipped) game.equippedAgents = JSON.parse(equipped);
    if (skins) game.ownedSkins = JSON.parse(skins);
    if (eqSkins) game.equippedSkins = JSON.parse(eqSkins);
    
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
    
    if (tutorial === 'true') {
      game.tutorialCompleted = true;
      game.tutorialActive = false;
    } else {
      game.tutorialCompleted = false;
      game.tutorialActive = true;
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

  // Sanitize arrays to filter out corrupted or null items
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
 * Persists current progression stats to localStorage.
 * @param {object} game - The main game instance
 */
export function saveStatsToStorage(game) {
  try {
    localStorage.setItem('tds_level', game.playerLevel.toString());
    localStorage.setItem('tds_xp', game.playerXp.toString());
    localStorage.setItem('tds_coins', game.playerCoins.toString());
    localStorage.setItem('tds_unlocked', JSON.stringify(game.unlockedAgents));
    localStorage.setItem('tds_equipped', JSON.stringify(game.equippedAgents));
    localStorage.setItem('tds_skins', JSON.stringify(game.ownedSkins));
    localStorage.setItem('tds_equipped_skins', JSON.stringify(game.equippedSkins));
    localStorage.setItem('tds_quests', JSON.stringify(game.questProgress));
    localStorage.setItem('tds_quest_rewarded', JSON.stringify(game.questRewarded));
    localStorage.setItem('tds_tutorial_completed', game.tutorialCompleted ? 'true' : 'false');
    localStorage.setItem('tds_leaderboard', JSON.stringify(game.leaderboard));
  } catch (e) {
    console.warn("Storage save failed.", e);
  }
}

/**
 * Checks for completed daily quests and awards coins.
 * @param {object} game - The main game instance
 */
export function checkQuestCompletion(game) {
  let anyCompleted = false;

  if (!game.questRewarded.kills && game.questProgress.kills >= QUEST_GOALS.kills) {
    game.questRewarded.kills = true;
    game.playerCoins += 75;
    anyCompleted = true;
    game.effectManager.spawnText(400, 260, 'QUEST COMPLETE! +🪙 75 Coins', '#f1c40f');
  }
  if (!game.questRewarded.cashSpent && game.questProgress.cashSpent >= QUEST_GOALS.cashSpent) {
    game.questRewarded.cashSpent = true;
    game.playerCoins += 100;
    anyCompleted = true;
    game.effectManager.spawnText(400, 260, 'QUEST COMPLETE! +🪙 100 Coins', '#f1c40f');
  }
  if (!game.questRewarded.farmsPlaced && game.questProgress.farmsPlaced >= QUEST_GOALS.farmsPlaced) {
    game.questRewarded.farmsPlaced = true;
    game.playerCoins += 50;
    anyCompleted = true;
    game.effectManager.spawnText(400, 220, 'QUEST COMPLETE! +🪙 50 Coins', '#f1c40f');
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