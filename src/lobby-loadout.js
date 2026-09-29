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

    // Update capacity counter
    const countBadge = document.getElementById('loadout-count-badge');
    const equippedCount = this.game.equippedAgents.length;
    if (countBadge) {
      countBadge.textContent = `EQUIPPED: ${equippedCount} / 5`;
      countBadge.style.color = equippedCount === 5 ? '#f1c40f' : '#00ffe0';
    }

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
      card.className = `loadout-card-v2 ${isEquipped ? 'is-equipped' : ''}`;

      const prefix = type + '_';
      const skins = this.game.ownedSkins.filter(s => s.startsWith(prefix));
      const currentEquippedSkin = this.game.equippedSkins[type] || 'default';

      let selectHtml = '';
      if (skins.length > 0) {
        const activeSkinName = currentEquippedSkin === 'default' ? 'DEFAULT' : currentEquippedSkin.split('_')[1].toUpperCase();
        selectHtml = `
          <div class="loadout-skin-container">
            <span class="loadout-skin-label">SKIN:</span>
            <div class="custom-skin-dropdown">
              <div class="skin-dropdown-selected">${activeSkinName} ▾</div>
              <div class="skin-dropdown-options hidden">
                <div class="skin-option ${currentEquippedSkin === 'default' ? 'active' : ''}" data-value="default">DEFAULT</div>
                ${skins.map(s => {
                  const isActive = currentEquippedSkin === s;
                  return `<div class="skin-option ${isActive ? 'active' : ''}" data-value="${s}">${s.split('_')[1].toUpperCase()}</div>`;
                }).join('')}
              </div>
            </div>
          </div>
        `;
      }

      const formattedName = type.replace('_', ' ').toUpperCase();

      const STATS_MAP = {
        scout: { dmg: '1', rng: '90px', rate: '1.0/s' },
        soldier: { dmg: '2', rng: '90px', rate: '2.0/s' },
        sniper: { dmg: '4', rng: '180px', rate: '0.25/s' },
        demoman: { dmg: '6', rng: '110px', rate: '0.45/s' },
        farm: { dmg: '0', rng: '0px', rate: '0/s' },
        medic: { dmg: '1', rng: '100px', rate: '0.8/s' },
        pyromancer: { dmg: '1', rng: '90px', rate: '2.0/s' },
        rocketeer: { dmg: '8', rng: '110px', rate: '0.35/s' },
        freezer: { dmg: '1', rng: '100px', rate: '0.65/s' },
        shotgunner: { dmg: '2', rng: '90px', rate: '0.55/s' },
        crook_boss: { dmg: '2', rng: '120px', rate: '1.8/s' },
        military_base: { dmg: '0', rng: '0px', rate: '0/s' },
        minigunner: { dmg: '1', rng: '130px', rate: '4.5/s' },
        commander: { dmg: '0', rng: '110px', rate: '0/s' },
        dj: { dmg: '0', rng: '120px', rate: '0/s' },
        ranger: { dmg: '20', rng: '220px', rate: '0.16/s' },
        turret: { dmg: '2', rng: '150px', rate: '6.0/s' },
        gladiator: { dmg: '2', rng: '55px', rate: '1.1/s' }
      };

      const stats = STATS_MAP[type] || { dmg: '-', rng: '-', rate: '-' };

      card.innerHTML = `
        <div class="loadout-card-top-tag">
          ${isEquipped ? '<span class="tag-equipped-badge">✓ EQUIPPED</span>' : '<span class="tag-ready-badge">READY</span>'}
        </div>
        <div class="loadout-disc-avatar">
          <canvas width="55" height="55" data-agent-type="${type}"></canvas>
        </div>
        <div class="loadout-info-cluster">
          <span class="loadout-agent-name">${formattedName}</span>
          <div class="loadout-stat-line">
            <span>🎯 ${stats.dmg}</span>
            <span class="stat-sep">|</span>
            <span>📍 ${stats.rng}</span>
            <span class="stat-sep">|</span>
            <span>⚡ ${stats.rate}</span>
          </div>
        </div>
        ${selectHtml}
        <button class="btn ${isEquipped ? 'btn-loadout-unequip' : 'btn-loadout-equip'}">
          ${isEquipped ? '✕ UNEQUIP' : '+ EQUIP'}
        </button>
      `;

      const cvs = card.querySelector('canvas');
      drawAgentPreviewOnCanvas(cvs, type);

      card.addEventListener('click', (e) => {
        if (e.target.closest('.custom-skin-dropdown')) return;
        soundManager.playTick();
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
            this.renderLoadoutConfig();
            soundManager.playTick();
          });
        });
      }

      this.loadoutGrid.appendChild(card);
    });

    const documentClickClose = () => {
      document.querySelectorAll('.skin-dropdown-options').forEach(el => {
        el.classList.add('hidden');
      });
    };
    document.removeEventListener('click', documentClickClose);
    document.addEventListener('click', documentClickClose);
  }
}