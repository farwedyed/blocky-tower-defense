// src/game-combat.js
// Handles active combat mechanics, support buffs, placing, upgrading, selling, and wave handling.

import { Network } from './network.js';
import { soundManager } from './sound.js';
import { getTowerCost } from './game-config.js';
import { checkQuestCompletion } from './game-storage.js';
import { 
  Runner, Quick, Slow, Hidden, Lead, Shadow, Goliath, Templar, 
  Brute, GraveDigger, HazardGiant, MoltenTitan, FallenGuardian, FallenKing, VoidReaver 
} from './enemy.js';
import { 
  Scout, Minigunner, Commander, DJUnit, Pyromancer, Farm, Gladiator, 
  Soldier, Sniper, Medic, Rocketeer, Demoman, Freezer, Shotgunner, 
  CrookBoss, MilitaryBase, Ranger, Turret 
} from './tower.js';
import { Rocket, VehicleProjectile } from './bullet.js';

/**
 * Re-evaluates DJ range extensions, DJ camo, and Commander fire-rate buffs.
 * @param {object} game 
 */
export function evaluateSupportBuffs(game) {
  for (const t of game.grid.towers.values()) {
    t.djRangeBuffed = false;
    t.djCamoDetectionBuffed = false;
    t.commanderSpeedBuffed = false;
    t.commanderAbilityActive = false;
  }

  for (const dj of game.grid.towers.values()) {
    if (dj.type === 'dj') {
      const r = dj.range * (dj.djRangeBuffed ? (dj.level >= 5 ? 1.20 : 1.15) : 1.0);
      for (const target of game.grid.towers.values()) {
        if (target !== dj) {
          const dist = Math.hypot(target.x - dj.x, target.y - dj.y);
          if (dist <= r) {
            target.djRangeBuffed = true;
            if (dj.level >= 3) {
              target.djCamoDetectionBuffed = true;
            }
          }
        }
      }
    }
  }

  for (const cmd of game.grid.towers.values()) {
    if (cmd.type === 'commander') {
      const hasBuff = cmd.buffDurationLeft > 0 || cmd.isAbilityActive;
      const r = cmd.range * (cmd.djRangeBuffed ? 1.15 : 1.0);
      for (const target of game.grid.towers.values()) {
        if (target !== cmd) {
          const dist = Math.hypot(target.x - cmd.x, target.y - cmd.y);
          if (dist <= r) {
            if (hasBuff) {
              target.commanderSpeedBuffed = true;
            }
            if (cmd.isAbilityActive) {
              target.commanderAbilityActive = true;
            }
          }
        }
      }
    }
  }
}

/**
 * Places an agent at specified tile coordinate, checking limits and wallets.
 */
export function placeShopAgent(game, posX, posY, ownerId = 'p1', towerType = null) {
  // Support both pixel positions (posX > 30) and legacy tile indices (col, row)
  const isPixel = posX > 25 || posY > 25;
  const x = isPixel ? posX : posX * game.grid.cellSize + game.grid.cellSize / 2;
  const y = isPixel ? posY : posY * game.grid.cellSize + game.grid.cellSize / 2;

  const totalPlacedTowers = game.grid.towers.size;
  if (totalPlacedTowers >= 40) {
    game.effectManager.spawnText(x, y, "PLACEMENT LIMIT REACHED (40)", '#e74c3c');
    return;
  }

  // Use the passed towerType directly (prevents hijacking other players' active cursor)
  const type = towerType || game.selectedShopTower;
  if (!type) return;

  const cost = game.getTowerCost(type);

  if (!game.playerWallets) game.playerWallets = {};
  if (game.playerWallets[ownerId] === undefined) {
    game.playerWallets[ownerId] = game.gold;
  }
  const wallet = (Network.mode === 'HOST') ? game.playerWallets[ownerId] : game.gold;

  if (wallet < cost) {
    game.effectManager.spawnText(x, y, "CASH INSUFFICIENT!", '#e74c3c');
    return;
  }

  let currentPlacedOfTypeCount = 0;
  for (const t of game.grid.towers.values()) {
    if (t.type === type) currentPlacedOfTypeCount++;
  }

  // TDS Specific Placement Limits
  const limits = { farm: 8, commander: 3, dj: 1, medic: 3, crook_boss: 4, turret: 5, military_base: 5 };
  if (limits[type] !== undefined && currentPlacedOfTypeCount >= limits[type]) {
    const errorMsg = `LIMIT REACHED! (MAX ${limits[type]} ${type.replace('_', ' ').toUpperCase()}S)`;
    game.effectManager.spawnText(x, y, errorMsg, '#e74c3c');
    return;
  }

  const check = game.grid.isPositionValidForPlacement(x, y, 18);
  if (check.valid) {
    let newAgent;
    const size = game.grid.cellSize;
    const col = Math.floor(x / size);
    const row = Math.floor(y / size);

    switch (type) {
      case 'scout': newAgent = new Scout(col, row, size); break;
      case 'minigunner': newAgent = new Minigunner(col, row, size); break;
      case 'commander': newAgent = new Commander(col, row, size); break;
      case 'dj': newAgent = new DJUnit(col, row, size); break;
      case 'pyromancer': newAgent = new Pyromancer(col, row, size); break;
      case 'farm': newAgent = new Farm(col, row, size); break;
      case 'gladiator': newAgent = new Gladiator(col, row, size); break;
      case 'soldier': newAgent = new Soldier(col, row, size); break;
      case 'sniper': newAgent = new Sniper(col, row, size); break;
      case 'medic': newAgent = new Medic(col, row, size); break;
      case 'rocketeer': newAgent = new Rocketeer(col, row, size); break;
      case 'demoman': newAgent = new Demoman(col, row, size); break;
      case 'freezer': newAgent = new Freezer(col, row, size); break;
      case 'shotgunner': newAgent = new Shotgunner(col, row, size); break;
      case 'crook_boss': newAgent = new CrookBoss(col, row, size); break;
      case 'military_base': newAgent = new MilitaryBase(col, row, size); break;
      case 'ranger': newAgent = new Ranger(col, row, size); break;
      case 'turret': newAgent = new Turret(col, row, size); break;
    }

    if (newAgent) {
      newAgent.equippedSkin = game.equippedSkins[type] || 'default';
      newAgent.ownerId = ownerId;
      game.grid.placeTowerAt(x, y, newAgent);
      
      if (Network.mode === 'HOST') {
        if (ownerId === 'p1') {
          game.gold -= cost;
          game.playerWallets['p1'] = game.gold;
        } else {
          game.playerWallets[ownerId] -= cost;
        }
      } else {
        game.gold -= cost;
      }
      soundManager.playPlace();

      if (type === 'farm') {
        game.questProgress.farmsPlaced = (game.questProgress.farmsPlaced || 0) + 1;
      } else if (type === 'scout') {
        game.questProgress.scoutsPlaced = (game.questProgress.scoutsPlaced || 0) + 1;
      } else if (type === 'sniper') {
        game.questProgress.snipersPlaced = (game.questProgress.snipersPlaced || 0) + 1;
      }

      game.questProgress.cashSpent += cost;
      checkQuestCompletion(game);

      // Tutorial Progress Check
      if (game.tutorialActive && game.tutorialStep === 1.5) {
        game.tutorialStep = 2;
        game.ui.showTutorialHint(2);
      }

      game.effectManager.spawnPlacementSparks(newAgent.x, newAgent.y, size);
      game.ui.updateHUD(game.lives, game.gold, game.wave, game.maxWaves);
    }
  }
}

/**
 * Upgrades the selected tower.
 */
export function upgradeSelectedTower(game) {
  if (!game.selectedPlacedTower) return;
  const tower = game.selectedPlacedTower;
  if (tower.level >= 5) return;

  const cost = tower.getUpgradeCost();
  if (game.gold < cost) {
    game.effectManager.spawnText(tower.x, tower.y - 15, "NEED CASH!", '#e74c3c');
    return;
  }

  if (Network.mode === 'CLIENT') {
    // Send exact tower ID and pixel coordinates so the host finds the tower instantly
    Network.conn.send({
      type: 'UPGRADE_TOWER',
      towerId: tower.id,
      key: tower.id,
      x: Math.round(tower.x),
      y: Math.round(tower.y),
      col: tower.gridX,
      row: tower.gridY
    });
  } else {
    game.gold -= cost;
    if (game.playerWallets) game.playerWallets['p1'] = game.gold;

    game.questProgress.cashSpent += cost;
    checkQuestCompletion(game);

    tower.upgrade(game.effectManager);
    soundManager.playUpgrade();
    game.ui.updateSelectionPanel(tower);
    game.ui.updateHUD(game.lives, game.gold, game.wave, game.maxWaves);

    if (game.tutorialActive && game.tutorialStep === 2.5) {
      game.tutorialStep = 3;
      game.ui.showTutorialHint(3);
    }
  }
}

/**
 * Sells the selected tower.
 */
export function sellSelectedTower(game) {
  if (!game.selectedPlacedTower) return;
  const tower = game.selectedPlacedTower;

  if (Network.mode === 'CLIENT') {
    Network.conn.send({
      type: 'SELL_TOWER',
      towerId: tower.id,
      id: tower.id,
      key: tower.id,
      x: Math.round(tower.x),
      y: Math.round(tower.y),
      col: tower.gridX,
      row: tower.gridY,
      senderId: window.myPlayerId
    });
    game.setSelectedPlacedTower(null);
  } else {
    const refund = game.tutorialActive ? tower.cost : tower.getSellValue();
    game.gold += refund;
    if (game.playerWallets) game.playerWallets['p1'] = game.gold;

    game.grid.removeTower(tower);
    game.effectManager.spawnPlacementSparks(tower.x, tower.y, 40);
    game.setSelectedPlacedTower(null);
    game.ui.updateHUD(game.lives, game.gold, game.wave, game.maxWaves);
  }
}

/**
 * Processes wave skipping payouts, including Economic Farm dividends.
 */
export function skipWave(game) {
  if (!game.waveInProgress || game.wave >= game.maxWaves || game.skipCooldown > 0) return;
  const reward = 50 + game.wave * 15;
  
  if (Network.mode === 'HOST' && game.playerWallets) {
    game.gold += reward;
    game.playerWallets['p1'] = game.gold;
    for (const pId of Object.keys(game.playerWallets)) {
      if (pId !== 'p1') {
        game.playerWallets[pId] = (game.playerWallets[pId] || 0) + reward;
      }
    }
  } else {
    game.gold += reward;
  }

  // Harvest Farm payouts immediately on skips
  for (const agent of game.grid.towers.values()) {
    if (agent.type === 'farm') {
      const income = agent.getHarvestIncome();
      const owner = agent.ownerId || 'p1';
      
      if (Network.mode === 'HOST') {
        if (owner === 'p1') {
          game.gold += income;
          game.playerWallets['p1'] = game.gold;
        } else {
          game.playerWallets[owner] = (game.playerWallets[owner] || 0) + income;
        }
      } else {
        game.gold += income;
      }
      game.effectManager.spawnText(agent.x, agent.y - 20, `+$${income}`, '#2ecc71');
    }
  }
  
  game.effectManager.spawnText(400, 260, `WAVE SKIPPED! +$${reward}`, '#e67e22');
  game.skipCooldown = 15.0; 
  game.waveInProgress = false;
  game.startNextWave(true); 
}

/**
 * Triggers wave deployment patterns using difficulty blueprint configurations.
 */
export function startNextWave(game, isFromSkip = false) {
  if (game.showMapDirections) return;
  if (game.waveInProgress || game.state !== 'playing') return;

  // Never attempt to start a wave past maxWaves
  if (game.wave >= game.maxWaves) {
    game.waveInProgress = false;
    return;
  }

  game.wave++;
  game.waveInProgress = true;
  game.ui.updateWaveButton(true);
  game.ui.updateHUD(game.lives, game.gold, game.wave, game.maxWaves);

  triggerCommanderAlerts(game);

  if (!isFromSkip) {
    game.skipCooldown = 0; 
  }

  let blueprints = game.waveBlueprintsEasy;
  if (game.selectedDifficulty === 'casual') blueprints = game.waveBlueprintsCasual;
  else if (game.selectedDifficulty === 'intermediate') blueprints = game.waveBlueprintsIntermediate;
  else if (game.selectedDifficulty === 'molten') blueprints = game.waveBlueprintsMolten;
  else if (game.selectedDifficulty === 'fallen') blueprints = game.waveBlueprintsFallen;

  const blueprint = blueprints[game.wave - 1];
  if (!blueprint) {
    console.warn(`[Wave System] Blueprint missing for wave ${game.wave}.`);
    game.waveInProgress = false;
    return;
  }

  const spawnList = [];
  const bossList = []; // Kept separate so the Boss enters early

  for (let i = 0; i < (blueprint.runners || 0); i++) spawnList.push('runner');
  for (let i = 0; i < (blueprint.quicks || 0); i++) spawnList.push('quick');
  for (let i = 0; i < (blueprint.slows || 0); i++) spawnList.push('slow');
  for (let i = 0; i < (blueprint.hiddens || 0); i++) spawnList.push('hidden');
  for (let i = 0; i < (blueprint.leads || 0); i++) spawnList.push('lead');
  for (let i = 0; i < (blueprint.shadows || 0); i++) spawnList.push('shadow');
  for (let i = 0; i < (blueprint.goliaths || 0); i++) spawnList.push('goliath');
  for (let i = 0; i < (blueprint.templars || 0); i++) spawnList.push('templar');

  // Boss units
  for (let i = 0; i < (blueprint.brute || 0); i++) bossList.push('brute');
  for (let i = 0; i < (blueprint.diggers || 0); i++) {
    bossList.push(game.selectedDifficulty === 'easy' ? 'brute' : 'grave_digger');
  }
  for (let i = 0; i < (blueprint.hazard_giants || 0); i++) bossList.push('hazard_giant');
  for (let i = 0; i < (blueprint.titans || 0); i++) bossList.push('molten_titan');
  for (let i = 0; i < (blueprint.guardians || 0); i++) bossList.push('fallen_guardian');
  for (let i = 0; i < (blueprint.kings || 0); i++) bossList.push('fallen_king');
  for (let i = 0; i < (blueprint.reavers || 0); i++) bossList.push('void_reaver');

  // Shuffle minions, then place the Boss near the front (after 3 minions)
  spawnList.sort(() => Math.random() - 0.5);
  if (bossList.length > 0) {
    spawnList.splice(Math.min(3, spawnList.length), 0, ...bossList);
  }

  game.activeSpawners.push({
    queue: spawnList,
    timer: 0,
    interval: blueprint.rate
  });

  game.effectManager.spawnText(400, 300, `WAVE ${game.wave}`, '#f1c40f');

  if (game.tutorialActive && game.tutorialStep === 3) {
    game.tutorialStep = 4;
    game.ui.showTutorialHint(4);
  }
}

/**
 * Triggers interactive context alerts from the base Commander.
 * Updated to match classic, commanding Roblox TDS style dialogue.
 */
export function triggerCommanderAlerts(game) {
  let alertMsg = "";
  if (game.wave === 1) {
    alertMsg = "Get ready! They're coming! Get some defenses up, let's get to work!";
  } else if (game.wave === 2) {
    alertMsg = "They're marching in, stay focused! Strength in numbers, place down more towers!";
  } else if (game.wave === 5) {
    alertMsg = "We need more firepower! Make sure to upgrade your troops to handle these faster target scales!";
  } else if (game.wave === 10) {
    alertMsg = "Warning: Camo zombies detected! Hiddens have entered the area, watch out!";
  } else if (game.wave === 15) {
    alertMsg = "Zombies with high shield capacities have been spotted! Focus fire immediately!";
  } else if (game.wave === 20) {
    alertMsg = "Lead armors detected! Sharp bullets won't pierce them. Bring in explosives or Pyromancer fire to melt them down!";
  } else if (game.wave === game.maxWaves) {
    alertMsg = "The final Boss is approaching! Prepare your lines and activate your abilities, survival is our only option!";
  }

  if (alertMsg) {
    game.ui.showCommanderAnnouncement(alertMsg);
  }
}

/**
 * Instantiates and appends a single zombie type onto the battlefield entrance.
 */
export function spawnZombie(game, type) {
  const startPoint = game.grid.pixelPath[0];
  let e;
  switch (type) {
    case 'runner': e = new Runner(startPoint.x, startPoint.y); break;
    case 'quick': e = new Quick(startPoint.x, startPoint.y); break;
    case 'slow': e = new Slow(startPoint.x, startPoint.y); break;
    case 'hidden': e = new Hidden(startPoint.x, startPoint.y); break;
    case 'lead': e = new Lead(startPoint.x, startPoint.y); break;
    case 'shadow': e = new Shadow(startPoint.x, startPoint.y); break;
    case 'goliath': e = new Goliath(startPoint.x, startPoint.y); break;
    case 'templar': e = new Templar(startPoint.x, startPoint.y); break;
    case 'brute': e = new Brute(startPoint.x, startPoint.y); break;
    case 'grave_digger': e = new GraveDigger(startPoint.x, startPoint.y); break;
    case 'hazard_giant': e = new HazardGiant(startPoint.x, startPoint.y); break;
    case 'molten_titan': e = new MoltenTitan(startPoint.x, startPoint.y); break;
    case 'fallen_guardian': e = new FallenGuardian(startPoint.x, startPoint.y); break;
    case 'fallen_king': e = new FallenKing(startPoint.x, startPoint.y); break;
    case 'void_reaver': e = new VoidReaver(startPoint.x, startPoint.y); break;
  }

  if (e) {
    game.enemies.push(e);
    
    // Play a friendly blocky zombie growl occasionally
    if (Math.random() < 0.25) {
      soundManager.playZombieGrunt();
    }
  }
}