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
export function placeShopAgent(game, col, row, ownerId = 'p1') {
  const totalPlacedTowers = game.grid.towers.size;
  const maxTowersAllowed = 40;
  if (totalPlacedTowers >= maxTowersAllowed) {
    console.log(`[Placement Fail] Limit reached. Total placed: ${totalPlacedTowers}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "LIMIT REACHED (MAX 40)", '#e74c3c');
    return;
  }

  let currentPlacedOfTypeCount = 0;
  for (const t of game.grid.towers.values()) {
    if (t.type === game.selectedShopTower) {
      currentPlacedOfTypeCount++;
    }
  }

  if (game.selectedShopTower === 'farm' && currentPlacedOfTypeCount >= 8) {
    console.log(`[Placement Fail] Limit reached. Current placed farms: ${currentPlacedOfTypeCount}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "LIMIT (MAX 8 FARMS)", '#e74c3c');
    return;
  }
  if (game.selectedShopTower === 'commander' && currentPlacedOfTypeCount >= 3) {
    console.log(`[Placement Fail] Limit reached. Current placed commanders: ${currentPlacedOfTypeCount}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "LIMIT (MAX 3)", '#e74c3c');
    return;
  }
  if (game.selectedShopTower === 'dj' && currentPlacedOfTypeCount >= 1) {
    console.log(`[Placement Fail] Limit reached. Current placed DJs: ${currentPlacedOfTypeCount}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "LIMIT (MAX 1 DJ)", '#e74c3c');
    return;
  }
  if (game.selectedShopTower === 'medic' && currentPlacedOfTypeCount >= 3) {
    console.log(`[Placement Fail] Limit reached. Current placed medics: ${currentPlacedOfTypeCount}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "LIMIT (MAX 3)", '#e74c3c');
    return;
  }
  if (game.selectedShopTower === 'crook_boss' && currentPlacedOfTypeCount >= 4) {
    console.log(`[Placement Fail] Limit reached. Current placed crook bosses: ${currentPlacedOfTypeCount}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "LIMIT (MAX 4)", '#e74c3c');
    return;
  }
  if (game.selectedShopTower === 'turret' && currentPlacedOfTypeCount >= 5) {
    console.log(`[Placement Fail] Limit reached. Current placed turrets: ${currentPlacedOfTypeCount}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "LIMIT (MAX 5)", '#e74c3c');
    return;
  }
  if (game.selectedShopTower === 'military_base' && currentPlacedOfTypeCount >= 5) {
    console.log(`[Placement Fail] Limit reached. Current placed military bases: ${currentPlacedOfTypeCount}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "LIMIT (MAX 5)", '#e74c3c');
    return;
  }

  const cost = getTowerCost(game.selectedShopTower, game.isHardcore);
  
  let wallet = 0;
  if (Network.mode === 'HOST') {
    wallet = (ownerId === 'p1') ? game.gold : (game.playerWallets[ownerId] || 0);
  } else {
    wallet = game.gold;
  }

  if (wallet < cost) {
    console.log(`[Placement Fail] Insufficient gold. Cost: ${cost}, Wallet: ${wallet}`);
    game.effectManager.spawnText(col * game.grid.cellSize + game.grid.cellSize / 2, row * game.grid.cellSize + game.grid.cellSize / 2, "CASH INSUFFICIENT", '#e74c3c');
    return;
  }

  if (game.grid.isCellValidForPlacement(col, row)) {
    let newAgent;
    const size = game.grid.cellSize;

    switch (game.selectedShopTower) {
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
      newAgent.equippedSkin = game.equippedSkins[game.selectedShopTower] || 'default';
      newAgent.ownerId = ownerId; 
      game.grid.placeTower(col, row, newAgent);
      
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

      if (game.selectedShopTower === 'farm') {
        game.questProgress.farmsPlaced++;
      }
      game.questProgress.cashSpent += cost;
      checkQuestCompletion(game);

      // Tutorial Flow Handler
      if (game.tutorialActive && game.tutorialStep === 1.5) {
        game.tutorialStep = 2;
        game.ui.showTutorialHint(2);
      }

      console.log(`[Placement Success] ${game.selectedShopTower} at (${col}, ${row})`);
      game.effectManager.spawnPlacementSparks(newAgent.x, newAgent.y, size);
      game.ui.updateHUD(game.lives, game.gold, game.wave, game.maxWaves);
    }
  } else {
    const isPath = game.grid.pathTiles ? game.grid.pathTiles.has(`${col},${row}`) : false;
    const isOccupied = game.grid.towers ? game.grid.towers.has(`${col},${row}`) : false;
    console.log(`[Placement Fail] Invalid cell at (${col}, ${row}). Path: ${isPath}, Occupied: ${isOccupied}`);
  }
}

/**
 * Handles agent level upgrading.
 */
export function upgradeSelectedTower(game) {
  if (!game.selectedPlacedTower) return;
  const col = game.selectedPlacedTower.gridX;
  const row = game.selectedPlacedTower.gridY;

  if (Network.mode === 'CLIENT') {
    Network.conn.send({ type: 'UPGRADE_TOWER', col: col, row: row });
  } else {
    const cost = game.selectedPlacedTower.getUpgradeCost();
    if (game.gold >= cost) {
      game.gold -= cost;
      game.playerWallets['p1'] = game.gold;

      game.questProgress.cashSpent += cost;
      checkQuestCompletion(game);

      game.selectedPlacedTower.upgrade(game.effectManager);
      soundManager.playUpgrade();
      game.ui.updateSelectionPanel(game.selectedPlacedTower);
      game.ui.updateHUD(game.lives, game.gold, game.wave, game.maxWaves);

      if (game.tutorialActive && game.tutorialStep === 2.5) {
        game.tutorialStep = 3;
        game.ui.showTutorialHint(3);
      }
    }
  }
}

/**
 * Sells the selected agent on the field.
 */
export function sellSelectedTower(game) {
  if (!game.selectedPlacedTower) return;
  const col = game.selectedPlacedTower.gridX;
  const row = game.selectedPlacedTower.gridY;

  if (Network.mode === 'CLIENT') {
    Network.conn.send({ type: 'SELL_TOWER', col: col, row: row });
    game.setSelectedPlacedTower(null);
  } else {
    const refund = game.tutorialActive ? game.selectedPlacedTower.cost : game.selectedPlacedTower.getSellValue();
    game.gold += refund;
    game.playerWallets['p1'] = game.gold;

    game.grid.removeTower(col, row);
    game.effectManager.spawnPlacementSparks(game.selectedPlacedTower.x, game.selectedPlacedTower.y, 40);
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
  const spawnList = [];
  for (let i = 0; i < (blueprint.runners || 0); i++) spawnList.push('runner');
  for (let i = 0; i < (blueprint.quicks || 0); i++) spawnList.push('quick');
  for (let i = 0; i < (blueprint.slows || 0); i++) spawnList.push('slow');
  for (let i = 0; i < (blueprint.hiddens || 0); i++) spawnList.push('hidden');
  for (let i = 0; i < (blueprint.leads || 0); i++) spawnList.push('lead');
  for (let i = 0; i < (blueprint.shadows || 0); i++) spawnList.push('shadow');
  for (let i = 0; i < (blueprint.goliaths || 0); i++) spawnList.push('goliath');
  for (let i = 0; i < (blueprint.templars || 0); i++) spawnList.push('templar');
  for (let i = 0; i < (blueprint.brute || 0); i++) spawnList.push('brute');
  for (let i = 0; i < (blueprint.diggers || 0); i++) {
    if (game.selectedDifficulty === 'easy') {
      spawnList.push('brute'); 
    } else {
      spawnList.push('grave_digger');
    }
  }
  for (let i = 0; i < (blueprint.hazard_giants || 0); i++) spawnList.push('hazard_giant');
  for (let i = 0; i < (blueprint.titans || 0); i++) spawnList.push('molten_titan');
  for (let i = 0; i < (blueprint.guardians || 0); i++) spawnList.push('fallen_guardian');
  for (let i = 0; i < (blueprint.kings || 0); i++) spawnList.push('fallen_king');
  for (let i = 0; i < (blueprint.reavers || 0); i++) spawnList.push('void_reaver');

  game.activeSpawners.push({
    queue: spawnList.sort(() => Math.random() - 0.5),
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
 */
export function triggerCommanderAlerts(game) {
  let alertMsg = "";
  if (game.wave === 1) {
    alertMsg = "There's reports of zombie activity nearby.";
  } else if (game.wave === 2) {
    alertMsg = "Secure the area and keep an eye out. We have teams that are pushing them in our direction.";
  } else if (game.wave === 5) {
    alertMsg = "Heavy threat inbound! Watch out for those slow, tanky targets!";
  } else if (game.wave === 7) {
    alertMsg = "The Toxic Giant is approaching! Get those defenses up, let's get to work!";
  } else if (game.wave === 10) {
    alertMsg = "Warning: Camo zombies detected! Hiddens are approaching, keep your eyes open!";
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
  }
}