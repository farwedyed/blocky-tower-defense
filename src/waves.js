// src/waves.js
// Procedural wave generator mapping out five active difficulty scales (Easy, Casual, Intermediate, Molten, Fallen)

export function generateWaves(count, difficulty) {
  const waves = [];
  for (let w = 1; w <= count; w++) {
    const isBossWave = (w === count);

    // Early game variety: waves 1-10 match waves configurations
    if (w === 1) {
      waves.push({ runners: 4, quicks: 0, slows: 0, hiddens: 0, rate: 2.0 });
      continue;
    }
    if (w === 2) {
      waves.push({ runners: 8, quicks: 0, slows: 0, hiddens: 0, rate: 1.8 });
      continue;
    }
    if (w === 3) {
      waves.push({ runners: 10, quicks: 4, slows: 0, hiddens: 0, rate: 1.5 }); 
      continue;
    }
    if (w === 4) {
      waves.push({ runners: 12, quicks: 6, slows: 0, hiddens: 0, rate: 1.4 });
      continue;
    }
    if (w === 5) {
      waves.push({ runners: 8, quicks: 4, slows: 2, hiddens: 0, rate: 1.4 }); 
      continue;
    }
    if (w === 6) {
      waves.push({ runners: 0, quicks: 10, slows: 4, hiddens: 0, rate: 1.3 });
      continue;
    }
    if (w === 7) {
      waves.push({ goliaths: 1, quicks: 6, slows: 2, hiddens: 0, rate: 1.2 }); 
      continue;
    }
    if (w === 8) {
      waves.push({ runners: 12, quicks: 8, slows: 4, hiddens: 0, rate: 1.1 });
      continue;
    }
    if (w === 9) {
      waves.push({ goliaths: 1, quicks: 15, slows: 6, hiddens: 0, rate: 1.0 });
      continue;
    }
    if (w === 10) {
      waves.push({ quicks: 10, slows: 6, hiddens: 4, rate: 1.0 }); 
      continue;
    }

    // Beyond Wave 10, scale up dynamically across all modes
    waves.push({
      runners: isBossWave ? 15 : 8 + w * 2,
      quicks: isBossWave ? 15 : Math.max(0, w - 5) * 1.5,
      slows: isBossWave ? 10 : Math.max(0, w - 8) * 1.2,
      hiddens: Math.round(Math.max(0, w - 9) * 0.8), 
      leads: Math.round(Math.max(0, w - 11) * 0.6),   
      shadows: (difficulty === 'fallen') ? Math.max(0, w - 20) * 0.5 : 0,
      goliaths: Math.round(Math.max(0, w - 13) * 0.4), 
      templars: (difficulty === 'fallen') ? Math.max(0, w - 25) * 0.2 : 0,
      brute: (isBossWave && difficulty === 'easy') ? 1 : 0,
      diggers: (isBossWave && difficulty === 'casual') ? 1 : 0,
      hazard_giants: (isBossWave && difficulty === 'intermediate') ? 1 : 0,
      titans: (isBossWave && difficulty === 'molten') ? 1 : 0,
      kings: (isBossWave && difficulty === 'fallen') ? 1 : 0,
      reavers: (isBossWave && difficulty === 'fallen') ? 1 : 0,
      rate: Math.max(0.4, 1.6 - w * 0.03)
    });
  }
  return waves;
}

export function initWaveData() {
  return {
    waveBlueprintsEasy: generateWaves(30, 'easy'),
    waveBlueprintsCasual: generateWaves(35, 'casual'),
    waveBlueprintsIntermediate: generateWaves(40, 'intermediate'),
    waveBlueprintsMolten: generateWaves(40, 'molten'),
    waveBlueprintsFallen: generateWaves(40, 'fallen')
  };
}