// src/lobby-loadout.js
// Sub-controller handling the Loadout inventory setup and character visual skins selectors.

import { drawAgentPreviewOnCanvas } from './game-renderer.js';
import { soundManager } from './sound.js';

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
        const activeSkinName = currentEquippedSkin === 'default' ? 'DEFAULT' : currentEquippedSkin.split('_')[1].toUpperCase();
        selectHtml = `
          <div class="skin-select-container" style="margin-top: 8px; position: relative;">
            <span style="font-size: 0.7rem; color: #7f8c8d;">SKIN: </span>
            <div class="custom-skin-dropdown" style="display: inline-block; min-width: 80px; cursor: pointer; user-select: none;">
              <div class="skin-dropdown-selected" style="font-size: 0.72rem; font-weight: 900; color: var(--primary-blue-dark); border: 2px solid var(--border-color); border-radius: 4px; padding: 2px 6px; background: #fff; text-align: center;">${activeSkinName} ▾</div>
              <div class="skin-dropdown-options hidden" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); width: 95px; background: #fff; border: 2px solid var(--border-color); border-radius: 6px; z-index: 1000; margin-bottom: 4px; overflow: hidden; box-shadow: 0 -3px 8px rgba(0,0,0,0.15);">
                <div class="skin-option ${currentEquippedSkin === 'default' ? 'active' : ''}" data-value="default" style="padding: 4px 6px; font-size: 0.72rem; font-weight: 800; border-bottom: 1.5px dashed #eee; text-align: center; ${currentEquippedSkin === 'default' ? 'background: var(--primary-blue); color: #fff;' : ''}">DEFAULT</div>
                ${skins.map(s => {
                  const isActive = currentEquippedSkin === s;
                  return `
                    <div class="skin-option ${isActive ? 'active' : ''}" data-value="${s}" style="padding: 4px 6px; font-size: 0.72rem; font-weight: 800; border-bottom: 1.5px dashed #eee; text-align: center; ${isActive ? 'background: var(--primary-blue); color: #fff;' : ''}">${s.split('_')[1].toUpperCase()}</div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        `;
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
        // Stop equipment toggle if they are interacting with the custom skin dropdown
        if (e.target.closest('.custom-skin-dropdown')) return;

        this.game.toggleLoadoutAgent(type);
        this.renderLoadoutConfig();
      });

      // Bind custom skin dropdown interactivity
      const dropdown = card.querySelector('.custom-skin-dropdown');
      if (dropdown) {
        const selected = dropdown.querySelector('.skin-dropdown-selected');
        const optionsContainer = dropdown.querySelector('.skin-dropdown-options');

        selected.addEventListener('click', (e) => {
          e.stopPropagation();
          // Hide all other open dropdowns to keep UI clean
          document.querySelectorAll('.skin-dropdown-options').forEach(el => {
            if (el !== optionsContainer) el.classList.add('hidden');
          });
          optionsContainer.classList.toggle('hidden');
        });

        const options = dropdown.querySelectorAll('.skin-option');
        options.forEach(opt => {
          opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = opt.getAttribute('data-value');
            this.game.equippedSkins[type] = val;
            this.game.saveStatsToStorage();
            optionsContainer.classList.add('hidden');
            
            // Re-render to apply the skin immediately
            this.renderLoadoutConfig();
            soundManager.playTick();
          });
        });
      }

      this.loadoutGrid.appendChild(card);
    });

    // Close any open skin dropdowns when clicking outside
    const documentClickClose = () => {
      document.querySelectorAll('.skin-dropdown-options').forEach(el => {
        el.classList.add('hidden');
      });
    };
    document.removeEventListener('click', documentClickClose);
    document.addEventListener('click', documentClickClose);
  }
}