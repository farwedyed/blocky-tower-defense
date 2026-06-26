// src/tower.js
// Aggregator file bridging all newly modularized agent categories.
// Re-exports modules cleanly to preserve existing codebase import paths.

export { Agent } from './towers/agent-base.js';

export { 
  Scout, 
  Soldier, 
  Sniper, 
  Demoman, 
  Gladiator 
} from './towers/basic-towers.js';

export { 
  Farm, 
  Medic, 
  Commander, 
  DJUnit, 
  MilitaryBase 
} from './towers/support-towers.js';

export { 
  Minigunner, 
  Pyromancer, 
  Rocketeer, 
  Freezer, 
  Shotgunner, 
  CrookBoss, 
  Ranger, 
  Turret 
} from './towers/advanced-towers.js';