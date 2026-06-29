// src/game-config.js
// Houses difficulty configurations, quest definitions, base pricing, and static attributes.

export const DEFAULT_UNLOCKED_AGENTS = ['scout', 'sniper'];
export const DEFAULT_EQUIPPED_AGENTS = ['scout', 'sniper'];

export const QUEST_GOALS = {
  kills: 50,
  cashSpent: 2000,
  farmsPlaced: 5
};

export const DEFAULT_QUEST_PROGRESS = {
  kills: 0,
  cashSpent: 0,
  farmsPlaced: 0
};

export const DEFAULT_QUEST_REWARDED = {
  kills: false,
  cashSpent: false,
  farmsPlaced: false
};

export const DIFFICULTY_SETTINGS = {
  easy: {
    hpMultiplier: 0.80, 
    startGold: 600,     
    maxWaves: 30,
    coinMultiplier: 1.0,
    xpMultiplier: 1.0
  },
  casual: {
    hpMultiplier: 1.00, 
    startGold: 600,
    maxWaves: 35,
    coinMultiplier: 1.3,
    xpMultiplier: 1.3
  },
  intermediate: {
    hpMultiplier: 1.40,
    startGold: 600,
    maxWaves: 40,
    coinMultiplier: 1.6,
    xpMultiplier: 1.6
  },
  molten: {
    hpMultiplier: 1.80,
    startGold: 600,
    maxWaves: 40,
    coinMultiplier: 2.0,
    xpMultiplier: 2.0
  },
  fallen: {
    hpMultiplier: 2.40, 
    startGold: 600,
    maxWaves: 40,
    coinMultiplier: 2.8,
    xpMultiplier: 2.8
  }
};

/**
 * Returns the base deployment cost of a selected agent.
 * @param {string} type 
 * @param {boolean} isHardcore 
 * @returns {number}
 */
export function getTowerCost(type, isHardcore = false) {
  let baseVal = 0;
  switch (type) {
    case 'scout': baseVal = 100; break;
    case 'minigunner': baseVal = 650; break;
    case 'commander': baseVal = 450; break;
    case 'dj': baseVal = 500; break;
    case 'pyromancer': baseVal = 300; break;
    case 'farm': baseVal = 250; break;
    case 'gladiator': baseVal = 300; break;
    case 'soldier': baseVal = 300; break;
    case 'sniper': baseVal = 250; break;
    case 'medic': baseVal = 350; break;
    case 'rocketeer': baseVal = 500; break;
    case 'demoman': baseVal = 300; break;
    case 'freezer': baseVal = 250; break;
    case 'shotgunner': baseVal = 350; break;
    case 'crook_boss': baseVal = 500; break;
    case 'military_base': baseVal = 400; break;
    case 'ranger': baseVal = 850; break;
    case 'turret': baseVal = 800; break;
    default: baseVal = 0;
  }
  if (isHardcore) {
    baseVal = Math.floor(baseVal * 1.20);
  }
  return baseVal;
}

/**
 * Returns the base defensive targeting range of an agent type.
 * @param {string} type 
 * @returns {number}
 */
export function getTowerRange(type) {
  switch (type) {
    case 'scout': return 135;
    case 'minigunner': return 155;
    case 'commander': return 120;
    case 'dj': return 140;
    case 'pyromancer': return 105;
    case 'farm': return 0;
    case 'gladiator': return 65;
    case 'soldier': return 125;
    case 'sniper': return 220;
    case 'medic': return 110;
    case 'rocketeer': return 120;
    case 'demoman': return 110;
    case 'freezer': return 100;
    case 'shotgunner': return 90;
    case 'crook_boss': return 120;
    case 'military_base': return 120;
    case 'ranger': return 240;
    case 'turret': return 160;
    default: return 0;
  }
}