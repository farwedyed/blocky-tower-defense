// src/editor.js
// Interactive In-Browser Visual UI Editor & Reference Overlay Tool

class UIEditor {
  constructor() {
    this.isActive = false;
    this.selectedElement = null;
    this.selectedSelector = '';
    this.refOverlay = null;

    // Auto-load saved modifications from localStorage so refresh never wipes your work
    try {
      this.modifications = JSON.parse(localStorage.getItem('btd2d_ui_editor_mods') || '{}');
      // Purge any empty keys that cause the querySelectorAll crash
      delete this.modifications[""];
      delete this.modifications[" "];
      delete this.modifications["undefined"];
      delete this.modifications["null"];
      localStorage.setItem('btd2d_ui_editor_mods', JSON.stringify(this.modifications));
    } catch (e) {
      this.modifications = {};
    }

    this.presets = [
      { label: '-- Click Element or Pick Below --', selector: '' },

      // ─── CHOOSE DIFFICULTY MENU ELEMENTS ───
      { label: '=== ⚔ DIFFICULTY MENU ===', selector: '' },
      { label: 'Difficulty Screen Container (#wizard-step-diff)', selector: '#wizard-step-diff' },
      { label: 'Top Banner Strip (.diff-banner-strip)', selector: '.diff-banner-strip' },
      { label: 'Title Badge Container (.diff-badge-container)', selector: '.diff-badge-container' },
      { label: 'Title Map Icon (.diff-map-icon)', selector: '.diff-map-icon' },
      { label: 'Title Text (.diff-badge-title)', selector: '.diff-badge-title' },
      { label: 'Back Button (#btn-wizard-back-diff)', selector: '#btn-wizard-back-diff' },
      { label: 'Preparation Button (#btn-wizard-next-diff)', selector: '#btn-wizard-next-diff' },

      { label: 'Cards Deck Grid (.difficulty-wizard-deck)', selector: '.difficulty-wizard-deck' },
      { label: 'All Difficulty Cards (.diff-wizard-card)', selector: '.diff-wizard-card' },
      { label: 'Card: Easy (.diff-card-easy)', selector: '.diff-card-easy' },
      { label: 'Card: Casual (.diff-card-casual)', selector: '.diff-card-casual' },
      { label: 'Card: Intermediate (.diff-card-intermediate)', selector: '.diff-card-intermediate' },
      { label: 'Card: Molten (.diff-card-molten)', selector: '.diff-card-molten' },
      { label: 'Card: Fallen (.diff-card-fallen)', selector: '.diff-card-fallen' },

      { label: 'Card Headers (.diff-card-header)', selector: '.diff-card-header' },
      { label: 'Card Titles (.diff-title)', selector: '.diff-title' },
      { label: 'Card Subtitles (.diff-sub)', selector: '.diff-sub' },
      { label: 'Card Bodies (.diff-card-body)', selector: '.diff-card-body' },
      { label: 'Boss Preview Canvases (.diff-boss-preview)', selector: '.diff-boss-preview' },
      { label: 'Metrics Lists (.diff-metrics-list)', selector: '.diff-metrics-list' },
      { label: 'Metric Rows (.diff-metric)', selector: '.diff-metric' },
      { label: 'Metric Icons (.diff-metric-icon)', selector: '.diff-metric-icon' },
      { label: 'Metric Texts (.diff-metric-text)', selector: '.diff-metric-text' },

      // ─── GENERAL LOBBY ELEMENTS ───
      { label: '=== 🗺️ LOBBY & HEADER ===', selector: '' },
      { label: 'Main Container (#app-container)', selector: '#app-container' },
      { label: 'Center Window (#lobby-panels)', selector: '#lobby-panels' },
      { label: '3D Logo (#main-lobby-logo)', selector: '#main-lobby-logo' },
      { label: 'Profile Pill (#cg-profile-widget)', selector: '#cg-profile-widget' },
      { label: 'Left Tabs Bar (#lobby-tabs)', selector: '#lobby-tabs' },
      { label: 'Tab Buttons (.tab-btn)', selector: '.tab-btn' }
    ];

    window.addEventListener('DOMContentLoaded', () => this.init());
  }

  init() {
    // Secret flag: only active if ?editor=true is in URL or enabled via localStorage
    const isAllowed = window.location.search.includes('editor=true') || localStorage.getItem('btd_dev_editor') === 'true';

    // Global helper so you can toggle it anytime from F12 console
    window.toggleEditor = () => {
      const active = localStorage.getItem('btd_dev_editor') === 'true';
      localStorage.setItem('btd_dev_editor', active ? 'false' : 'true');
      location.reload();
    };

    if (!isAllowed) {
      // In production, keep editor completely hidden
      return;
    }

    this.refOverlay = document.getElementById('ui-editor-ref-overlay');
    this.buildDockUI();
    this.bindGlobalShortcuts();
    this.bindClickInspector();

    setTimeout(() => {
      Object.keys(this.modifications).forEach(selector => {
        if (selector && selector.trim()) {
          this.applyMods(selector);
        }
      });
    }, 100);
  }

  buildDockUI() {
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'btn-toggle-editor';
    toggleBtn.innerHTML = '🎨 EDIT UI (F2)';
    toggleBtn.onclick = () => this.toggle();
    document.body.appendChild(toggleBtn);

    const dock = document.createElement('div');
    dock.id = 'ui-editor-dock';
    dock.style.display = 'none';

    dock.innerHTML = `
      <div class="editor-header" id="ui-editor-drag-handle" style="cursor: move; user-select: none;">
        <h3>🎨 VISUAL UI EDITOR ✥</h3>
        <span>[F2] TOGGLE</span>
      </div>

      <!-- Quick Screen Switcher -->
      <div class="editor-section" style="padding: 6px 8px;">
        <button id="btn-editor-open-diff" style="width: 100%; background: #0088ff; color: #fff; border: 2px solid #00ffe0; border-radius: 6px; padding: 6px; font-family: var(--font-title); font-size: 0.82rem; font-weight: 900; cursor: pointer;">
          ⚔ JUMP TO DIFFICULTY SCREEN
        </button>
      </div>

      <!-- Reference Overlay Controls -->
      <div class="editor-section">
        <div class="editor-section-title">🖼️ REFERENCE OVERLAY (refrence.png)</div>
        <div class="editor-field">
          <label>Overlay Opacity: <span id="val-ref-op">0%</span></label>
          <input type="range" id="slider-ref-op" min="0" max="100" value="0" />
        </div>
      </div>

      <!-- Element Selector -->
      <div class="editor-section">
        <div class="editor-section-title">🎯 SELECT ELEMENT</div>
        <select id="editor-elem-select" class="editor-select">
          ${this.presets.map(p => `<option value="${p.selector}">${p.label}</option>`).join('')}
        </select>
        <div style="font-size:0.68rem; color:#94a3b8; margin-top:2px;">
          Tip: You can also <strong>click directly</strong> on any element on screen!
        </div>
      </div>

      <!-- Live Transform & Sizing Controls -->
      <div class="editor-section" id="editor-controls-section" style="opacity: 0.5; pointer-events: none;">
        <div class="editor-section-title" id="editor-current-target-title">⚙️ PROPERTIES</div>

        <div class="editor-field">
          <label>Position X: <span id="val-pos-x">0px</span></label>
          <input type="range" id="slider-pos-x" min="-1000" max="1000" value="0" />
        </div>

        <div class="editor-field">
          <label>Position Y: <span id="val-pos-y">0px</span></label>
          <input type="range" id="slider-pos-y" min="-1000" max="1000" value="0" />
        </div>

        <div class="editor-field">
          <label>Width: <span id="val-width">auto</span></label>
          <input type="range" id="slider-width" min="10" max="2500" value="200" />
        </div>

        <div class="editor-field">
          <label>Height: <span id="val-height">auto</span></label>
          <input type="range" id="slider-height" min="10" max="1600" value="60" />
        </div>

        <div class="editor-field">
          <label>Spacing / Gap: <span id="val-gap">8px</span></label>
          <input type="range" id="slider-gap" min="0" max="100" value="8" />
        </div>

        <div class="editor-field">
          <label>Button Spacing (Margin Bottom): <span id="val-mb">0px</span></label>
          <input type="range" id="slider-mb" min="0" max="100" value="0" />
        </div>

        <div class="editor-field">
          <label>Scale / Zoom: <span id="val-scale">1.0x</span></label>
          <input type="range" id="slider-scale" min="30" max="250" value="100" />
        </div>

        <div class="editor-field">
          <label>Font Size: <span id="val-font-size">16px</span></label>
          <input type="range" id="slider-font-size" min="8" max="48" value="16" />
        </div>

        <div class="editor-field">
          <label>Artwork Vertical Focus: <span id="val-bg-y">35%</span></label>
          <input type="range" id="slider-bg-y" min="0" max="100" value="35" />
        </div>

        <div style="font-size:0.68rem; color:#94a3b8; margin-top:4px;">
          Nudge: Use <strong>Arrow Keys</strong> (Shift = 10px).
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="editor-btn-row">
        <button id="btn-editor-copy-css" class="btn-editor-action btn-editor-copy">📋 COPY CSS</button>
        <button id="btn-editor-reset-styles" class="btn-editor-action btn-editor-reset">↺ RESET</button>
      </div>
    `;

    document.body.appendChild(dock);
    this.bindDockControls();

    // Make Editor Dock Draggable across the screen
    const dragHandle = document.getElementById('ui-editor-drag-handle');
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dockInitialX = 0, dockInitialY = 0;

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = dock.getBoundingClientRect();
      dockInitialX = rect.left;
      dockInitialY = rect.top;
      dock.style.right = 'auto'; // release right-pinning
      dock.style.left = `${dockInitialX}px`;
      dock.style.top = `${dockInitialY}px`;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      dock.style.left = `${Math.max(10, Math.min(window.innerWidth - dock.offsetWidth - 10, dockInitialX + dx))}px`;
      dock.style.top = `${Math.max(10, Math.min(window.innerHeight - dock.offsetHeight - 10, dockInitialY + dy))}px`;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  toggle() {
    this.isActive = !this.isActive;
    const dock = document.getElementById('ui-editor-dock');
    const toggleBtn = document.getElementById('btn-toggle-editor');
    if (dock) dock.style.display = this.isActive ? 'flex' : 'none';
    if (toggleBtn) {
      toggleBtn.style.background = this.isActive ? '#00ffe0' : '#111827';
      toggleBtn.style.color = this.isActive ? '#0b192c' : '#00ffe0';
    }
    if (!this.isActive) {
      this.clearHighlights();
    }
  }

  bindGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        this.toggle();
      }

      if (!this.isActive || !this.selectedElement) return;

      const step = e.shiftKey ? 10 : 1;
      let handled = false;

      const mod = this.getMod(this.selectedSelector);

      if (e.key === 'ArrowLeft') {
        mod.x -= step;
        handled = true;
      } else if (e.key === 'ArrowRight') {
        mod.x += step;
        handled = true;
      } else if (e.key === 'ArrowUp') {
        mod.y -= step;
        handled = true;
      } else if (e.key === 'ArrowDown') {
        mod.y += step;
        handled = true;
      }

      if (handled) {
        e.preventDefault();
        this.applyMods(this.selectedSelector);
        this.syncSliderUI();
      }
    });
  }

  bindClickInspector() {
    document.addEventListener('mouseover', (e) => {
      if (!this.isActive) return;
      if (e.target.closest('#ui-editor-dock') || e.target.closest('#btn-toggle-editor')) return;

      document.querySelectorAll('.ui-editor-hover-target').forEach(el => el.classList.remove('ui-editor-hover-target'));
      e.target.classList.add('ui-editor-hover-target');
    });

    document.addEventListener('click', (e) => {
      if (!this.isActive) return;
      if (e.target.closest('#ui-editor-dock') || e.target.closest('#btn-toggle-editor')) return;

      e.preventDefault();
      e.stopPropagation();

      const el = e.target;
      let selector = '';

      if (el.id) {
        selector = `#${el.id}`;
      } else if (el.closest('.diff-wizard-card') && (el.classList.contains('diff-wizard-card') || el.parentElement.classList.contains('difficulty-wizard-deck'))) {
        // Identify specific difficulty card (e.g. .diff-card-easy, .diff-card-molten)
        const card = el.closest('.diff-wizard-card');
        const specificCardClass = Array.from(card.classList).find(c => c.startsWith('diff-card-'));
        selector = specificCardClass ? `.${specificCardClass}` : '.diff-wizard-card';
      } else if (el.classList.contains('hud-label')) {
        // Automatically target the exact parent container label so they never move together
        const parent = el.closest('.hud-level-wrapper, .hud-xp-wrapper, .hud-coins-wrapper');
        if (parent) {
          selector = `.${parent.className.split(' ')[0]} .hud-label`;
        } else {
          selector = '.hud-label';
        }
      } else if (el.className) {
        const firstClass = String(el.className).split(' ').filter(c => !c.startsWith('ui-editor'))[0];
        if (firstClass) selector = `.${firstClass}`;
      } else {
        selector = el.tagName.toLowerCase();
      }

      this.selectTarget(selector, el);
    }, true);
  }

  bindDockControls() {
    // Quick Jump to Difficulty Screen
    const btnJumpDiff = document.getElementById('btn-editor-open-diff');
    if (btnJumpDiff) {
      btnJumpDiff.addEventListener('click', () => {
        // Activate Map Tab & Panel
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const mapTab = document.querySelector('.tab-btn[data-target="panel-maps"]');
        if (mapTab) mapTab.classList.add('active');

        document.querySelectorAll('.lobby-panel').forEach(p => { p.classList.remove('active'); p.style.display = ''; });
        const panelMaps = document.getElementById('panel-maps');
        if (panelMaps) panelMaps.classList.add('active');

        // Hide Splash Screen & Solo Maps step
        const splash = document.getElementById('lobby-splash-container');
        if (splash) { splash.style.display = 'none'; splash.classList.add('hidden'); }
        const mapsStep = document.getElementById('wizard-step-maps');
        if (mapsStep) { mapsStep.classList.add('hidden'); mapsStep.classList.remove('active'); }

        // Show Difficulty Step
        const diffStep = document.getElementById('wizard-step-diff');
        if (diffStep) {
          diffStep.classList.remove('hidden');
          diffStep.classList.add('active');
          diffStep.style.display = '';
        }

        const btnBack = document.getElementById('btn-lobby-back');
        if (btnBack) btnBack.style.display = 'block';

        if (window.game && window.game.ui && window.game.ui.lobby && window.game.ui.lobby.wizard) {
          window.game.ui.lobby.wizard.drawAllBossPreviews();
        }
      });
    }

    // 1. Reference Overlay Slider
    const refSlider = document.getElementById('slider-ref-op');
    const refVal = document.getElementById('val-ref-op');
    if (refSlider && this.refOverlay) {
      refSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        this.refOverlay.style.display = val > 0 ? 'block' : 'none';
        this.refOverlay.style.opacity = val / 100;
        if (refVal) refVal.textContent = `${val}%`;
      });
    }

    // 2. Dropdown element select
    const select = document.getElementById('editor-elem-select');
    if (select) {
      select.addEventListener('change', (e) => {
        const sel = e.target.value;
        if (sel) {
          const el = document.querySelector(sel);
          this.selectTarget(sel, el);
        }
      });
    }

    // 3. Property Sliders
    const bindSlider = (id, key, unit = 'px', transformKey = false) => {
      const slider = document.getElementById(id);
      if (!slider) return;
      slider.addEventListener('input', (e) => {
        if (!this.selectedSelector) return;
        const val = parseFloat(e.target.value);
        const mod = this.getMod(this.selectedSelector);
        mod[key] = val;
        this.applyMods(this.selectedSelector);
        this.syncSliderUI();
      });
    };

    bindSlider('slider-pos-x', 'x');
    bindSlider('slider-pos-y', 'y');
    bindSlider('slider-width', 'w');
    bindSlider('slider-height', 'h');
    bindSlider('slider-gap', 'gap');
    bindSlider('slider-mb', 'mb');
    bindSlider('slider-scale', 'scale');
    bindSlider('slider-font-size', 'fontSize');
    bindSlider('slider-bg-y', 'bgY');

    // 4. Copy CSS Overrides
    const btnCopy = document.getElementById('btn-editor-copy-css');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const css = this.generateCSS();
        navigator.clipboard.writeText(css).then(() => {
          btnCopy.textContent = '✓ COPIED!';
          setTimeout(() => btnCopy.textContent = '📋 COPY CSS', 1500);
        });
      });
    }

    // 5. Reset all
    const btnReset = document.getElementById('btn-editor-reset-styles');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        Object.keys(this.modifications).forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.transform = '';
            el.style.transformOrigin = '';
            el.style.width = '';
            el.style.maxWidth = '';
            el.style.minWidth = '';
            el.style.height = '';
            el.style.maxHeight = '';
            el.style.minHeight = '';
            el.style.flex = '';
            el.style.flexShrink = '';
            el.style.gap = '';
            el.style.marginBottom = '';
            el.style.fontSize = '';
            el.style.backgroundPosition = '';
          });
        });
        this.modifications = {};
        try {
          localStorage.removeItem('btd2d_ui_editor_mods');
        } catch (e) {}
        this.syncSliderUI();
      });
    }
  }

  selectTarget(selector, el) {
    this.clearHighlights();

    this.selectedSelector = selector;
    this.selectedElement = el;

    if (el) el.classList.add('ui-editor-selected-target');

    const controls = document.getElementById('editor-controls-section');
    const title = document.getElementById('editor-current-target-title');
    const select = document.getElementById('editor-elem-select');

    if (controls) {
      controls.style.opacity = '1.0';
      controls.style.pointerEvents = 'auto';
    }

    if (title) title.textContent = `TARGET: ${selector}`;
    if (select) select.value = selector;

    // Do NOT automatically stamp hardcoded w, h, or fontSize onto the element.
    // Dimensions should only be applied if the user manually drags the width/height sliders.
    this.syncSliderUI();
  }

  getMod(selector) {
    if (!this.modifications[selector]) {
      this.modifications[selector] = {
        // Only set values if the user intentionally changes them
        x: 0,
        y: 0,
        scale: 100
      };
    }
    return this.modifications[selector];
  }

  applyMods(selector) {
    if (!selector || typeof selector !== 'string' || !selector.trim()) return;

    const mod = this.getMod(selector);
    let elements;
    try {
      elements = document.querySelectorAll(selector);
    } catch (e) {
      return;
    }
    if (!elements || elements.length === 0) return;

    elements.forEach(el => {
      if (selector === '#app-container') {
        el.style.setProperty('position', 'absolute', 'important');
        el.style.setProperty('left', '50%', 'important');
        el.style.setProperty('top', '50%', 'important');
        el.style.setProperty('transform', 'translate(-50%, -50%) scale(var(--app-scale, 1))', 'important');
        el.style.setProperty('transform-origin', 'center center', 'important');
        return;
      }

      // Only apply transform if moved or scaled
      const hasTransform = (mod.x !== 0 || mod.y !== 0 || (mod.scale !== undefined && mod.scale !== 100));
      if (hasTransform) {
        const scaleVal = (mod.scale !== undefined ? mod.scale : 100) / 100;
        el.style.setProperty('transform', `translate(${mod.x || 0}px, ${mod.y || 0}px) scale(${scaleVal})`, 'important');
        if (selector.includes('tab-btn')) {
          el.style.setProperty('transform-origin', 'left center', 'important');
        }
      }

      // Surgically apply properties ONLY if the user explicitly set them
      if (mod.w !== undefined) {
        el.style.setProperty('width', `${mod.w}px`, 'important');
        el.style.setProperty('max-width', 'none', 'important');
        el.style.setProperty('min-width', '0px', 'important');
        el.style.setProperty('flex', '0 0 auto', 'important');
      }
      if (mod.h !== undefined) {
        el.style.setProperty('height', `${mod.h}px`, 'important');
        el.style.setProperty('max-height', 'none', 'important');
        el.style.setProperty('min-height', '0px', 'important');
      }
      if (mod.gap !== undefined) {
        el.style.setProperty('gap', `${mod.gap}px`, 'important');
      }
      if (mod.mb !== undefined) {
        el.style.setProperty('margin-bottom', `${mod.mb}px`, 'important');
      }
      if (mod.fontSize !== undefined) {
        el.style.setProperty('font-size', `${mod.fontSize}px`, 'important');
      }
      if (mod.bgY !== undefined && (selector.includes('backdrop') || selector.includes('splash') || selector.includes('art'))) {
        el.style.setProperty('background-position', `center ${mod.bgY}%`, 'important');
      }
    });

    try {
      localStorage.setItem('btd2d_ui_editor_mods', JSON.stringify(this.modifications));
    } catch (e) {}
  }

  syncSliderUI() {
    if (!this.selectedSelector) return;
    const mod = this.getMod(this.selectedSelector);

    const updateSlider = (id, valId, val, suffix = 'px') => {
      const slider = document.getElementById(id);
      const label = document.getElementById(valId);
      if (slider && val !== undefined) slider.value = val;
      if (label && val !== undefined) label.textContent = `${val}${suffix}`;
    };

    updateSlider('slider-pos-x', 'val-pos-x', mod.x, 'px');
    updateSlider('slider-pos-y', 'val-pos-y', mod.y, 'px');
    updateSlider('slider-width', 'val-width', mod.w, 'px');
    updateSlider('slider-height', 'val-height', mod.h, 'px');
    updateSlider('slider-gap', 'val-gap', mod.gap !== undefined ? mod.gap : 8, 'px');
    updateSlider('slider-mb', 'val-mb', mod.mb !== undefined ? mod.mb : 0, 'px');
    updateSlider('slider-scale', 'val-scale', mod.scale, '%');
    updateSlider('slider-font-size', 'val-font-size', mod.fontSize, 'px');
    updateSlider('slider-bg-y', 'val-bg-y', mod.bgY, '%');
  }

  clearHighlights() {
    document.querySelectorAll('.ui-editor-hover-target').forEach(el => el.classList.remove('ui-editor-hover-target'));
    document.querySelectorAll('.ui-editor-selected-target').forEach(el => el.classList.remove('ui-editor-selected-target'));
  }

  generateCSS() {
    let css = '/* ─── SURGICAL UI OVERRIDES (SAFE TO PASTE) ─── */\n';

    for (const [selector, mod] of Object.entries(this.modifications)) {
      if (!selector || !selector.trim()) continue;

      if (selector === '#app-container') {
        css += `#app-container {\n`;
        css += `  position: absolute !important;\n`;
        css += `  left: 50% !important;\n`;
        css += `  top: 50% !important;\n`;
        css += `  width: 2122px !important;\n`;
        css += `  height: 1188px !important;\n`;
        css += `  transform: translate(-50%, -50%) scale(var(--app-scale, 1)) !important;\n`;
        css += `  transform-origin: center center !important;\n`;
        css += `}\n\n`;
        continue;
      }

      const lines = [];

      // 1. Position and Scale (only if actually changed)
      const hasX = mod.x !== undefined && mod.x !== 0;
      const hasY = mod.y !== undefined && mod.y !== 0;
      const hasScale = mod.scale !== undefined && mod.scale !== 100;
      if (hasX || hasY || hasScale) {
        const scaleVal = (mod.scale !== undefined ? mod.scale : 100) / 100;
        lines.push(`  transform: translate(${mod.x || 0}px, ${mod.y || 0}px) scale(${scaleVal}) !important;`);
        if (selector.includes('tab-btn')) {
          lines.push(`  transform-origin: left center !important;`);
        }
      }

      // 2. Width (Special guard for text/labels/cg-username)
      if (mod.w !== undefined) {
        if (selector === '#cg-username') {
          lines.push(`  width: auto !important;\n  min-width: max-content !important;\n  white-space: nowrap !important;`);
        } else {
          lines.push(`  width: ${mod.w}px !important;\n  max-width: none !important;\n  flex: 0 0 auto !important;`);
        }
      }

      // 3. Height
      if (mod.h !== undefined) {
        lines.push(`  height: ${mod.h}px !important;`);
      }

      // 4. Flex/Grid Gap
      if (mod.gap !== undefined) {
        lines.push(`  gap: ${mod.gap}px !important;`);
      }

      // 5. Margin Bottom
      if (mod.mb !== undefined && mod.mb !== 0) {
        lines.push(`  margin-bottom: ${mod.mb}px !important;`);
      }

      // 6. Font Size
      if (mod.fontSize !== undefined) {
        lines.push(`  font-size: ${mod.fontSize}px !important;`);
      }

      // 7. Background image position
      if (mod.bgY !== undefined && (selector.includes('backdrop') || selector.includes('splash') || selector.includes('art'))) {
        lines.push(`  background-position: center ${mod.bgY}% !important;`);
      }

      // If nothing was modified on this selector, do not emit empty brackets
      if (lines.length > 0) {
        css += `${selector} {\n${lines.join('\n')}\n}\n\n`;
      }
    }
    return css;
  }
}

// Automatically mount the editor instance
new UIEditor();