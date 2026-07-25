// src/game-config.js
// Difficulty settings, base upgrade costs, targeting ranges, and balanced scales.

export const DEFAULT_UNLOCKED_AGENTS = ['scout', 'soldier', 'sniper', 'demoman'];
export const DEFAULT_EQUIPPED_AGENTS = ['scout', 'sniper'];

export const QUEST_GOALS = {
  kills: 100,
  cashSpent: 2000,
  wavesSurvived: 25,
  scoutsPlaced: 15,
  snipersPlaced: 10,
  farmsPlaced: 5
};

export const DEFAULT_QUEST_PROGRESS = {
  kills: 0,
  cashSpent: 0,
  wavesSurvived: 0,
  scoutsPlaced: 0,
  snipersPlaced: 0,
  farmsPlaced: 0
};

export const DEFAULT_QUEST_REWARDED = {
  kills: false,
  cashSpent: false,
  wavesSurvived: false,
  scoutsPlaced: false,
  snipersPlaced: false,
  farmsPlaced: false
};

// Rebalanced Difficulty Scales to closely mirror Roblox TDS
// Easy mode starting gold is increased to $650 to allow immediate deployment of early Scout & Sniper defenses.
export const DIFFICULTY_SETTINGS = {
  easy: {
    hpMultiplier: 0.70, // Scaled down to guarantee winnability with Scout and Sniper
    startGold: 650,     
    maxWaves: 30,
    coinMultiplier: 1.0,
    xpMultiplier: 1.0
  },
  casual: {
    hpMultiplier: 1.0,  // Baseline Casual
    startGold: 600,     
    maxWaves: 35,
    coinMultiplier: 1.2,
    xpMultiplier: 1.2
  },
  intermediate: {
    hpMultiplier: 1.5,  // Balanced intermediate
    startGold: 600,     
    maxWaves: 40,
    coinMultiplier: 1.5,
    xpMultiplier: 1.5
  },
  molten: {
    hpMultiplier: 2.2,  // High damage sponge
    startGold: 600,     
    maxWaves: 40,
    coinMultiplier: 2.0,
    xpMultiplier: 2.0
  },
  fallen: {
    hpMultiplier: 3.5,  // Extreme test of defense efficiency
    startGold: 600,     
    maxWaves: 40,
    coinMultiplier: 3.0,
    xpMultiplier: 3.0
  }
};

/**
 * Returns the base deployment cost for each agent type.
 * @param {string} type 
 * @param {boolean} isHardcore 
 */
export function getTowerCost(type, isHardcore = false) {
  const baseCosts = {
    scout: 100,
    soldier: 350,
    sniper: 250,
    demoman: 300,
    farm: 250,
    medic: 350,
    pyromancer: 300,
    rocketeer: 500,
    freezer: 250,
    shotgunner: 350,
    crook_boss: 500,
    military_base: 400,
    minigunner: 650,
    commander: 450,
    dj: 500,
    ranger: 850,
    turret: 800,
    gladiator: 300
  };

  const cost = baseCosts[type] || 100;
  return isHardcore ? Math.floor(cost * 1.20) : cost;
}

/**
 * Returns the base range for each agent type.
 * @param {string} type 
 */
export function getTowerRange(type) {
  switch (type) {
    case 'scout': return 90;
    case 'soldier': return 90;
    case 'sniper': return 180;
    case 'demoman': return 110;
    case 'farm': return 0;
    case 'medic': return 100;
    case 'pyromancer': return 90;
    case 'rocketeer': return 110;
    case 'freezer': return 100;
    case 'shotgunner': return 90;
    case 'crook_boss': return 120;
    case 'military_base': return 0;
    case 'minigunner': return 130;
    case 'commander': return 110;
    case 'dj': return 120;
    case 'ranger': return 220; // Extremely long range but lacks Camo detection by default
    case 'turret': return 150;
    case 'gladiator': return 55;
    default: return 80;
  }
}