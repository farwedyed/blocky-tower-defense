// src/lobby-crate.js
// Sub-controller handling the Crate unboxing mechanics, custom physics loop, and rewards overlay.

import { soundManager } from './sound.js';
import { CrazyGamesManager } from './crazygames.js';
import { drawAgentPreviewOnCanvas } from './game-renderer.js';

export class LobbyCrate {
  constructor(lobbyUI, game) {
    this.lobbyUI = lobbyUI;
    this.game = game;
  }

  startUnboxingAnimation(crateType, chosenAgent, chosenRarity, revealedSkinName) {
    const overlay = document.getElementById('crate-opening-overlay');
    const canvas = document.getElementById('crate-opening-canvas');
    const revealCard = document.getElementById('crate-reveal-card');
    const revealRarity = document.getElementById('crate-reveal-rarity');
    const revealAgentCanvas = document.getElementById('crate-reveal-agent-canvas');
    const revealName = document.getElementById('crate-reveal-name');
    const revealText = document.getElementById('crate-reveal-unlocked');

    if (!overlay || !canvas) return;

    overlay.classList.remove('hidden');
    revealCard.classList.add('hidden');

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    let startTime = null;
    let particles = [];
    let state = 'dropping';
    let crateY = -100;
    let crateVelocity = 0;
    const gravity = 800;
    const targetY = h / 2 + 20;
    const bounceCount = 2;
    let currentBounce = 0;
    let shakeTimer = 0;
    let shakeOffset = { x: 0, y: 0 };
    let burstTriggered = false;

    const spawnConfetti = (x, y, colorCode) => {
      const colors = colorCode === 'legendary' ? ['#f1c40f', '#f39c12', '#fff'] :
                     colorCode === 'epic' ? ['#9b59b6', '#8e44ad', '#fff'] :
                     colorCode === 'rare' ? ['#3498db', '#2980b9', '#fff'] :
                     ['#bdc3c7', '#7f8c8d', '#fff'];
      for (let i = 0; i < 60; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 250;
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 100,
          color: colors[Math.floor(Math.random() * colors.length)],
          radius: 3 + Math.random() * 6,
          life: 1.2 + Math.random() * 0.8,
          alpha: 1.0,
          rotation: Math.random() * Math.PI,
          spinSpeed: (Math.random() - 0.5) * 10
        });
      }
    };

    const spawnSplinters = (x, y) => {
      for (let i = 0; i < 30; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 50 + Math.random() * 150;
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 50,
          color: '#8d6e63',
          radius: 2 + Math.random() * 4,
          life: 0.8 + Math.random() * 0.5,
          alpha: 1.0,
          rotation: Math.random() * Math.PI,
          spinSpeed: (Math.random() - 0.5) * 5
        });
      }
    };

    const loop = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const dt = Math.min(0.1, (timestamp - startTime) / 1000.0);
      startTime = timestamp;

      ctx.clearRect(0, 0, w, h);

      if (state === 'dropping') {
        crateVelocity += gravity * dt;
        crateY += crateVelocity * dt;

        if (crateY >= targetY) {
          crateY = targetY;
          if (currentBounce < bounceCount) {
            crateVelocity = -crateVelocity * 0.45;
            if (currentBounce === 0) soundManager.playCrateDrop();
            currentBounce++;
          } else {
            state = 'shaking';
            shakeTimer = 0;
          }
        }
      } else if (state === 'shaking') {
        shakeTimer += dt;
        if (shakeTimer < 1.5) {
          const shakeFreq = 35;
          const intensity = 8;
          shakeOffset.x = Math.sin(shakeTimer * shakeFreq) * intensity;
          shakeOffset.y = Math.cos(shakeTimer * shakeFreq * 0.8) * intensity;

          if (Math.random() < 0.15) {
            spawnSplinters(w / 2 + shakeOffset.x, crateY + shakeOffset.y);
          }
        } else {
          state = 'bursting';
          shakeOffset = { x: 0, y: 0 };
        }
      } else if (state === 'bursting') {
        if (!burstTriggered) {
          burstTriggered = true;
          soundManager.playCrateReveal();
          spawnConfetti(w / 2, targetY, chosenRarity);
          spawnSplinters(w / 2, targetY);

          if (chosenRarity === 'epic' || chosenRarity === 'legendary') {
            CrazyGamesManager.happytime();
          }

          setTimeout(() => {
            state = 'revealed';
            revealCard.classList.remove('hidden');
            revealRarity.textContent = chosenRarity.toUpperCase();
            revealRarity.className = `rarity-${chosenRarity}`;
            
            if (revealedSkinName) {
              const baseName = chosenAgent.charAt(0).toUpperCase() + chosenAgent.slice(1);
              const suffix = revealedSkinName.split('_')[1];
              revealName.textContent = `${suffix.toUpperCase()} ${baseName.toUpperCase()}`;
              if (revealText) revealText.textContent = "SKIN UNLOCKED & ADDED TO LOADOUT!";
            } else {
              revealName.textContent = chosenAgent.toUpperCase();
              if (revealText) revealText.textContent = "UNLOCKED & ADDED TO LOADOUT!";
            }
            
            if (revealAgentCanvas) {
              drawAgentPreviewOnCanvas(revealAgentCanvas, chosenAgent);
            }

            const btnEquip = document.getElementById('btn-equip-revealed');
            if (btnEquip) {
              btnEquip.disabled = false;
              btnEquip.style.background = '';
              btnEquip.style.color = '';
              
              const isEquipped = this.game.equippedAgents.includes(chosenAgent);
              if (isEquipped) {
                btnEquip.textContent = "ALREADY EQUIPPED";
                btnEquip.disabled = true;
                btnEquip.style.background = '#7f8c8d';
              } else {
                btnEquip.textContent = "EQUIP";
                btnEquip.style.background = '#27ae60';
                btnEquip.style.color = '#fff';
              }

              btnEquip.onclick = () => {
                const nowEquipped = this.game.equippedAgents.includes(chosenAgent);
                if (nowEquipped) {
                  btnEquip.textContent = "ALREADY EQUIPPED";
                  btnEquip.disabled = true;
                  btnEquip.style.background = '#7f8c8d';
                  return;
                }
                if (this.game.equippedAgents.length >= 5) {
                  btnEquip.textContent = "LOADOUT FULL (MAX 5)";
                  btnEquip.style.background = '#e74c3c';
                  btnEquip.style.color = '#fff';
                  return;
                }
                this.game.equippedAgents.push(chosenAgent);
                this.game.saveStatsToStorage();
                
                btnEquip.textContent = "EQUIPPED";
                btnEquip.disabled = true;
                btnEquip.style.background = '#2ecc71';
                btnEquip.style.color = '#fff';
                
                this.lobbyUI.renderLoadoutConfig();
              };
            }
          }, 400);
        }
      }

      // Draw active unboxing particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
        p.life -= dt;
        p.rotation += p.spinSpeed * dt;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.radius, -p.radius, p.radius * 2, p.radius * 2);
        ctx.restore();
      }

      // Draw the blocky toy crate dropping and shaking!
      if (state === 'dropping' || state === 'shaking' || state === 'bursting') {
        ctx.save();
        ctx.translate(w / 2 + shakeOffset.x, crateY + shakeOffset.y);
        
        // Draw crate body base
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 4;
        ctx.fillStyle = '#8d6e63'; // Wood brown
        ctx.fillRect(-35, -35, 70, 70);
        ctx.strokeRect(-35, -35, 70, 70);
        
        // Wood grain panel diagonal crosses
        ctx.strokeStyle = '#5d4037';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-28, -28); ctx.lineTo(28, 28);
        ctx.moveTo(28, -28); ctx.lineTo(-28, 28);
        ctx.stroke();

        // Corner blocky reinforcements
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 4;
        ctx.fillStyle = '#5d4037'; // Dark brown trim
        ctx.fillRect(-35, -35, 12, 70);
        ctx.strokeRect(-35, -35, 12, 70);
        ctx.fillRect(23, -35, 12, 70);
        ctx.strokeRect(23, -35, 12, 70);
        ctx.fillRect(-35, -35, 70, 12);
        ctx.strokeRect(-35, -35, 70, 12);
        ctx.fillRect(-35, 23, 70, 12);
        ctx.strokeRect(-35, 23, 70, 12);

        // Center Lock latch
        ctx.fillStyle = '#f1c40f'; // Golden latch lock
        ctx.fillRect(-10, -8, 20, 16);
        ctx.strokeRect(-10, -8, 20, 16);
        ctx.fillStyle = '#222';
        ctx.fillRect(-3, -2, 6, 6);
        
        ctx.restore();
      }

      // Request next frame recursively if not fully revealed yet
      if (state !== 'revealed') {
        requestAnimationFrame(loop);
      }
    };

    requestAnimationFrame(loop);
  }
}