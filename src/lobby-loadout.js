// src/lobby-loadout.js
// Sub-controller handling the Loadout inventory setup and character visual skins selectors.

import { drawAgentPreviewOnCanvas } from './game-renderer.js';

export class LobbyLoadout {
  constructor(lobbyUI, game) {
    this.lobbyUI = lobbyUI;
    this.game = game;
    this.loadoutGrid = document.getElementById('loadout-selection-grid');
  }

  renderLoadoutConfig() {
    if (!this.loadoutGrid) return;
    this.loadoutGrid.innerHTML = '';

    const allAgentTypes = [
      'scout', 'soldier', 'sniper', 'demoman',
      'farm', 'medic', 'pyromancer', 'rocketeer', 'freezer', 'shotgunner', 'crook_boss', 'military_base',
      'minigunner', 'commander', 'dj', 'ranger', 'turret',
      'gladiator'
    ];

    allAgentTypes.forEach(type => {
      const isUnlocked = this.game.unlockedAgents.includes(type);
      if (!isUnlocked) return;

      const isEquipped = this.game.equippedAgents.includes(type);
      const card = document.createElement('div');
      card.className = `loadout-card ${isEquipped ? 'equipped' : ''}`;

      const prefix = type + '_';
      const skins = this.game.ownedSkins.filter(s => s.startsWith(prefix));
      const currentEquippedSkin = this.game.equippedSkins[type] || 'default';

      let selectHtml = '';
      if (skins.length > 0) {
        selectHtml = `<div class="skin-select-container" style="margin-top: 8px;">
          <span style="font-size: 0.7rem; color: #7f8c8d;">SKIN: </span>
          <select class="skin-select styled-select" style="font-size: 0.75rem; font-weight: 900; color: var(--primary-blue-dark);">
            <option value="default">DEFAULT</option>
            ${skins.map(s => `<option value="${s}" ${currentEquippedSkin === s ? 'selected' : ''}>${s.split('_')[1].toUpperCase()}</option>`).join('')}
          </select>
        </div>`;
      }

      card.innerHTML = `
        <div class="icon"><canvas width="55" height="55" data-agent-type="${type}"></canvas></div>
        <div class="agent-info" style="margin-top:6px; text-align:center;">
          <span class="name" style="font-size:0.85rem; font-weight:900;">${type.toUpperCase()}</span>
        </div>
        ${isEquipped ? '<span class="equipped-indicator">EQUIPPED</span>' : ''}
        ${selectHtml}
      `;

      const cvs = card.querySelector('canvas');
      
      // Draw crisp preloaded texture inside the selector grid canvas card
      drawAgentPreviewOnCanvas(cvs, type);

      card.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
        this.game.toggleLoadoutAgent(type);
        this.renderLoadoutConfig();
      });

      const selector = card.querySelector('.skin-select');
      if (selector) {
        selector.addEventListener('change', (e) => {
          this.game.equippedSkins[type] = e.target.value;
          this.game.saveStatsToStorage();
          drawAgentPreviewOnCanvas(cvs, type);
        });
      }

      this.loadoutGrid.appendChild(card);
    });
  }
}