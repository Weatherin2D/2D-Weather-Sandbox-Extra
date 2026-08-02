/**
 * Floating User Interaction panel — searchable tool browser + custom tool creator.
 * Visual language matches Keybind / Color Scale / Sky editors (uie-* prefix).
 */
(function(global) {
  'use strict';

  let panel = null;
  let creatorPanel = null;
  let activeCategory = 'All';
  let refreshList = function() {};
  let editingToolId = null;
  let draftTextureDataUrl = null;

  function registry() {
    return global.UserInteraction && global.UserInteraction.registry;
  }
  function runtime() {
    return global.UserInteraction && global.UserInteraction.runtime;
  }
  function atlas() {
    return global.UserInteraction && global.UserInteraction.atlas;
  }

  function ensureStyles() {
    if (document.getElementById('uie-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'uie-styles';
    styleEl.textContent = `
      #userInteractionPanel{display:none;position:fixed;top:50px;right:420px;width:540px;
        background:#13131f;border:1px solid #252540;border-radius:10px;
        z-index:10000;font-family:Arial,sans-serif;color:#eee;max-height:92vh;
        overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.75);}
      .uie-hdr{display:flex;align-items:center;gap:8px;padding:11px 15px;
        background:linear-gradient(135deg,#191930,#0e0e22);
        border-bottom:1px solid #252540;cursor:move;user-select:none;flex-shrink:0;}
      .uie-hdr span{font-size:14px;font-weight:700;flex:1;}
      .uie-close{background:rgba(255,255,255,0.07);border:none;color:#777;cursor:pointer;
        font-size:12px;padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;}
      .uie-close:hover{background:rgba(220,60,60,0.35);color:#fff;}
      .uie-body{padding:14px 15px 16px;overflow-y:auto;max-height:calc(92vh - 46px);
        scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .uie-body::-webkit-scrollbar{width:4px;}
      .uie-body::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .uie-hint{font-size:10px;color:#4a5060;margin-bottom:8px;line-height:1.4;}
      .uie-search{width:100%;box-sizing:border-box;padding:7px 10px;margin-bottom:10px;
        border:1px solid #252540;border-radius:6px;background:#0b0b17;color:#c0c0d0;font-size:12px;}
      .uie-search:focus{outline:none;border-color:#3050c0;}
      .uie-tabs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:10px;}
      .uie-tab{padding:5px 11px;border:1px solid #252540;border-radius:20px;
        background:#13131f;color:#5a6070;cursor:pointer;font-size:11px;
        font-weight:600;transition:all 0.15s;}
      .uie-tab:hover{background:#1e1e38;color:#aaa;border-color:#3a3a60;}
      .uie-tab.active{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .uie-list{display:flex;flex-direction:column;gap:3px;max-height:calc(92vh - 340px);
        min-height:120px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .uie-list::-webkit-scrollbar{width:4px;}
      .uie-list::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .uie-row{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;
        border:1px solid transparent;background:#0e0e1a;cursor:pointer;}
      .uie-row:hover{border-color:#252540;background:#12122a;}
      .uie-row.active{border-color:#3050c0;background:#121c40;}
      .uie-thumb{width:28px;height:28px;border-radius:4px;border:1px solid #252540;
        background:#0b0b17;object-fit:cover;flex-shrink:0;}
      .uie-name{flex:1;font-size:12px;color:#bbb;min-width:0;}
      .uie-cat{font-size:10px;font-weight:700;color:#6a90c8;background:rgba(74,144,226,0.12);
        padding:2px 7px;border-radius:10px;flex-shrink:0;}
      .uie-role{font-size:9px;font-weight:700;color:#c0a060;background:rgba(192,160,96,0.12);
        padding:2px 6px;border-radius:10px;flex-shrink:0;}
      .uie-btn-sm{padding:4px 9px;border:1px solid #252540;border-radius:4px;
        background:#181828;color:#777;cursor:pointer;font-size:10px;font-weight:600;}
      .uie-btn-sm:hover{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .uie-btn-sm.danger{color:#c06070;}
      .uie-btn-sm.danger:hover{background:#401828;color:#e08090;border-color:#602030;}
      .uie-brush{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0;
        padding:10px;border:1px solid #1c1c30;border-radius:8px;background:#0e0e1a;}
      .uie-brush label{display:flex;flex-direction:column;gap:4px;font-size:10px;
        color:#4a5060;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;}
      .uie-brush input[type=range]{width:100%;accent-color:#4a90e2;}
      .uie-brush .uie-chk{flex-direction:row;align-items:center;gap:8px;text-transform:none;
        letter-spacing:0;font-size:11px;color:#aaa;margin-top:14px;}
      .uie-brush .uie-chk input{accent-color:#4a90e2;}
      .uie-footer{display:flex;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid #1c1c30;flex-wrap:wrap;}
      .uie-footer-btn{flex:1;min-width:90px;padding:8px;border:none;border-radius:5px;cursor:pointer;
        font-size:11px;font-weight:700;color:#fff;}
      .uie-footer-btn.create{background:#1e3080;}
      .uie-footer-btn.create:hover{filter:brightness(1.15);}
      .uie-footer-btn.secondary{background:#181828;border:1px solid #252540;color:#aaa;}
      .uie-footer-btn.secondary:hover{border-color:#3050c0;color:#a0c0ff;}
      #uieCreatorPanel{display:none;position:fixed;top:60px;right:440px;width:620px;
        background:#13131f;border:1px solid #252540;border-radius:10px;
        z-index:10001;font-family:Arial,sans-serif;color:#eee;max-height:92vh;
        overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.75);}
      .uie-c-body{padding:14px 15px 16px;overflow-y:auto;max-height:calc(92vh - 46px);}
      .uie-field{margin-bottom:10px;}
      .uie-field label{display:block;font-size:10px;color:#4a5060;text-transform:uppercase;
        letter-spacing:1px;font-weight:600;margin-bottom:4px;}
      .uie-field input[type=text],.uie-field select,.uie-field textarea{
        width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid #252540;
        border-radius:6px;background:#0b0b17;color:#c0c0d0;font-size:12px;}
      .uie-field textarea{min-height:52px;font-family:Consolas,monospace;resize:vertical;}
      .uie-field input:focus,.uie-field select:focus,.uie-field textarea:focus{
        outline:none;border-color:#3050c0;}
      .uie-section{border:1px solid #1c1c30;border-radius:8px;padding:10px 12px;margin-bottom:12px;background:#0e0e1a;}
      .uie-section-title{font-size:11px;font-weight:700;color:#a0c0ff;margin-bottom:8px;}
      .uie-effects{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      .uie-warn{padding:8px 10px;margin-bottom:10px;border-radius:6px;font-size:11px;
        background:#281820;border:1px solid #503030;color:#e0a0a0;display:none;}
      .uie-ok{padding:8px 10px;margin-bottom:10px;border-radius:6px;font-size:11px;
        background:#182818;border:1px solid #305030;color:#a0e0a0;display:none;}
      .uie-params{display:flex;flex-direction:column;gap:6px;margin-bottom:10px;}
      .uie-param-row{display:grid;grid-template-columns:1fr 1fr 70px 70px 70px 70px 28px;gap:4px;align-items:center;}
      .uie-param-row input{width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid #252540;
        border-radius:4px;background:#0b0b17;color:#c0c0d0;font-size:11px;}
      .uie-tex-card{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;}
      .uie-tex-preview{width:96px;height:64px;border:1px solid #252540;border-radius:6px;
        background:#0b0b17;object-fit:cover;}
      .uie-tex-actions{display:flex;flex-direction:column;gap:6px;flex:1;min-width:160px;}
      .uie-quick-params{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
      .uie-quick-params label{font-size:10px;color:#4a5060;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;}
      .uie-quick-params input[type=range]{width:100%;accent-color:#4a90e2;}
      .uie-adv{display:none;}
      .uie-adv.open{display:block;}
      .uie-toggle-adv{width:100%;margin-bottom:8px;}
    `;
    document.head.appendChild(styleEl);
  }

  function makeDraggable(el, hdrSelector) {
    let dragX = 0, dragY = 0, dragging = false;
    const hdr = el.querySelector(hdrSelector);
    if (!hdr) return;
    hdr.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('uie-close')) return;
      dragging = true;
      const r = el.getBoundingClientRect();
      dragX = e.clientX - r.left;
      dragY = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.left = (e.clientX - dragX) + 'px';
      el.style.top = (e.clientY - dragY) + 'px';
    });
    document.addEventListener('mouseup', function() { dragging = false; });
  }

  function syncBrushControlsFromGui() {
    if (!panel || !global.guiControls) return;
    const g = global.guiControls;
    const size = panel.querySelector('#uie-brushSize');
    const intensity = panel.querySelector('#uie-brushIntensity');
    const whole = panel.querySelector('#uie-wholeWidth');
    const invert = panel.querySelector('#uie-invertTool');
    const sizeVal = panel.querySelector('#uie-brushSizeVal');
    const intVal = panel.querySelector('#uie-brushIntensityVal');
    if (size) size.value = g.brushSize;
    if (intensity) intensity.value = g.brushIntensity;
    if (whole) whole.checked = !!g.wholeWidth;
    if (invert) invert.checked = !!g.invertTool;
    if (sizeVal) sizeVal.textContent = String(g.brushSize);
    if (intVal) intVal.textContent = Number(g.brushIntensity).toFixed(3);
  }

  function wireBrushControls() {
    const g = global.guiControls;
    if (!g || !panel) return;
    const size = panel.querySelector('#uie-brushSize');
    const intensity = panel.querySelector('#uie-brushIntensity');
    const whole = panel.querySelector('#uie-wholeWidth');
    const invert = panel.querySelector('#uie-invertTool');
    const sizeVal = panel.querySelector('#uie-brushSizeVal');
    const intVal = panel.querySelector('#uie-brushIntensityVal');
    if (size) {
      size.oninput = function() {
        g.brushSize = parseInt(size.value, 10);
        if (sizeVal) sizeVal.textContent = size.value;
      };
    }
    if (intensity) {
      intensity.oninput = function() {
        g.brushIntensity = parseFloat(intensity.value);
        if (intVal) intVal.textContent = Number(intensity.value).toFixed(3);
      };
    }
    if (whole) whole.onchange = function() { g.wholeWidth = !!whole.checked; };
    if (invert) invert.onchange = function() { g.invertTool = !!invert.checked; };
  }

  function renderTabs(tabsEl) {
    const reg = registry();
    const cats = (reg && reg.CATEGORIES) || ['All'];
    tabsEl.innerHTML = '';
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'uie-tab' + (cat === activeCategory ? ' active' : '');
      btn.textContent = cat;
      btn.onclick = function() {
        activeCategory = cat;
        renderTabs(tabsEl);
        refreshList();
      };
      tabsEl.appendChild(btn);
    }
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function updateTerrainVisibility() {
    if (!creatorPanel) return;
    const mode = creatorPanel.querySelector('#uie-c-mode').value;
    const terr = creatorPanel.querySelector('#uie-c-terrain-section');
    if (terr) terr.style.display = mode === 'terrain' ? 'block' : 'none';
  }

  function updateTexturePreview() {
    if (!creatorPanel) return;
    const img = creatorPanel.querySelector('#uie-c-tex-preview');
    const meta = creatorPanel.querySelector('#uie-c-tex-meta');
    if (draftTextureDataUrl) {
      img.src = draftTextureDataUrl;
      img.style.display = 'block';
      meta.textContent = 'Custom texture loaded';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      meta.textContent = 'No custom texture (uses surface kind look)';
    }
  }

  function openCreator(existing) {
    ensureCreator();
    editingToolId = existing && existing.id ? existing.id : null;
    const reg = registry();
    const tool = existing || (reg && reg.normalizeCustomTool({
      name: 'New Custom Tool',
      mode: 'brush',
      script: reg.defaultScript(),
    }));
    fillCreatorForm(tool);
    creatorPanel.style.display = 'block';
  }

  function fillCreatorForm(tool) {
    if (!creatorPanel || !tool) return;
    draftTextureDataUrl = tool.textureDataUrl || null;
    creatorPanel.querySelector('#uie-c-name').value = tool.name || '';
    creatorPanel.querySelector('#uie-c-mode').value = tool.mode || 'brush';
    creatorPanel.querySelector('#uie-c-role').value = tool.terrainRole || 'base';
    creatorPanel.querySelector('#uie-c-surface').value = tool.surfaceKind || 'land';
    creatorPanel.querySelector('#uie-c-tags').value = (tool.tags || []).join(', ');
    creatorPanel.querySelector('#uie-c-when').value = (tool.script && tool.script.when) || 'true';
    const effects = (tool.script && tool.script.effects) || {};
    const keys = (registry() && registry().EFFECT_KEYS) || [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const el = creatorPanel.querySelector('#uie-c-eff-' + k);
      if (el) el.value = effects[k] != null ? effects[k] : (k === 'terrain' ? '"none"' : '0');
    }
    renderParamRows((tool.script && tool.script.params) || []);
    syncQuickParamsFromRows();
    updateTerrainVisibility();
    updateTexturePreview();
    showCreatorMsg('', false);
  }

  function renderParamRows(params) {
    const wrap = creatorPanel.querySelector('#uie-c-params');
    wrap.innerHTML = '';
    const list = params && params.length ? params : [];
    if (!list.length) {
      list.push({ key: 'heat', label: 'Heat', min: -1, max: 1, step: 0.01, default: 0.5 });
    }
    for (let i = 0; i < list.length; i++) {
      wrap.appendChild(makeParamRow(list[i]));
    }
  }

  function makeParamRow(p) {
    const row = document.createElement('div');
    row.className = 'uie-param-row';
    row.innerHTML =
      '<input type="text" data-f="key" placeholder="key" value="' + escapeAttr(p.key || '') + '">' +
      '<input type="text" data-f="label" placeholder="label" value="' + escapeAttr(p.label || '') + '">' +
      '<input type="number" data-f="min" placeholder="min" value="' + (p.min != null ? p.min : 0) + '">' +
      '<input type="number" data-f="max" placeholder="max" value="' + (p.max != null ? p.max : 1) + '">' +
      '<input type="number" data-f="step" placeholder="step" value="' + (p.step != null ? p.step : 0.01) + '">' +
      '<input type="number" data-f="default" placeholder="default" value="' + (p.default != null ? p.default : 0) + '">' +
      '<button type="button" class="uie-btn-sm danger" title="Remove">✕</button>';
    row.querySelector('button').onclick = function() { row.remove(); syncQuickParamsFromRows(); };
    row.querySelectorAll('input').forEach(function(inp) {
      inp.addEventListener('change', syncQuickParamsFromRows);
    });
    return row;
  }

  function getParamDefault(key, fallback) {
    const rows = creatorPanel.querySelectorAll('#uie-c-params .uie-param-row');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].querySelector('[data-f=key]').value.trim() === key) {
        const v = parseFloat(rows[i].querySelector('[data-f=default]').value);
        return Number.isFinite(v) ? v : fallback;
      }
    }
    return fallback;
  }

  function setParamDefault(key, value, label, min, max, step) {
    const rows = creatorPanel.querySelectorAll('#uie-c-params .uie-param-row');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].querySelector('[data-f=key]').value.trim() === key) {
        rows[i].querySelector('[data-f=default]').value = value;
        return;
      }
    }
    creatorPanel.querySelector('#uie-c-params').appendChild(makeParamRow({
      key: key, label: label || key, min: min, max: max, step: step, default: value,
    }));
  }

  function syncQuickParamsFromRows() {
    if (!creatorPanel) return;
    const map = {
      'uie-q-freezing': ['freezingTemp', 0],
      'uie-q-snow': ['snowAmount', 0],
      'uie-q-moisture': ['moisture', 0],
      'uie-q-heat': ['heat', 0],
      'uie-q-friction': ['friction', 0.2],
      'uie-q-albedo': ['albedoBias', 0.15],
    };
    Object.keys(map).forEach(function(id) {
      const el = creatorPanel.querySelector('#' + id);
      const badge = creatorPanel.querySelector('#' + id + 'Val');
      if (!el) return;
      const v = getParamDefault(map[id][0], map[id][1]);
      el.value = v;
      if (badge) badge.textContent = Number(v).toFixed(2);
    });
  }

  function wireQuickParams() {
    const pairs = [
      ['uie-q-freezing', 'freezingTemp', 'Freezing Temp (°C)', -40, 10, 0.5],
      ['uie-q-snow', 'snowAmount', 'Snow Amount', 0, 1, 0.01],
      ['uie-q-moisture', 'moisture', 'Moisture', -1, 1, 0.01],
      ['uie-q-heat', 'heat', 'Heat', -1, 1, 0.01],
      ['uie-q-friction', 'friction', 'Friction', 0, 1, 0.01],
      ['uie-q-albedo', 'albedoBias', 'Albedo Bias', 0, 1, 0.01],
    ];
    pairs.forEach(function(p) {
      const el = creatorPanel.querySelector('#' + p[0]);
      const badge = creatorPanel.querySelector('#' + p[0] + 'Val');
      if (!el) return;
      el.oninput = function() {
        setParamDefault(p[1], parseFloat(el.value), p[2], p[3], p[4], p[5]);
        if (badge) badge.textContent = Number(el.value).toFixed(2);
      };
    });
  }

  function readCreatorForm() {
    const params = [];
    creatorPanel.querySelectorAll('#uie-c-params .uie-param-row').forEach(function(row) {
      params.push({
        key: row.querySelector('[data-f=key]').value.trim(),
        label: row.querySelector('[data-f=label]').value.trim(),
        min: parseFloat(row.querySelector('[data-f=min]').value),
        max: parseFloat(row.querySelector('[data-f=max]').value),
        step: parseFloat(row.querySelector('[data-f=step]').value),
        default: parseFloat(row.querySelector('[data-f=default]').value),
      });
    });
    const effects = {};
    const keys = (registry() && registry().EFFECT_KEYS) || [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const el = creatorPanel.querySelector('#uie-c-eff-' + k);
      effects[k] = el ? el.value : '0';
    }
    const tagsRaw = creatorPanel.querySelector('#uie-c-tags').value || '';
    const mode = creatorPanel.querySelector('#uie-c-mode').value;
    return {
      id: editingToolId || undefined,
      name: creatorPanel.querySelector('#uie-c-name').value.trim() || 'Custom Tool',
      mode: mode === 'place' ? 'place' : (mode === 'terrain' ? 'terrain' : 'brush'),
      terrainRole: creatorPanel.querySelector('#uie-c-role').value === 'overlay' ? 'overlay' : 'base',
      surfaceKind: creatorPanel.querySelector('#uie-c-surface').value || 'land',
      textureDataUrl: draftTextureDataUrl,
      tags: tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean),
      script: {
        when: creatorPanel.querySelector('#uie-c-when').value.trim() || 'true',
        effects: effects,
        params: params,
      },
    };
  }

  function showCreatorMsg(msg, isError) {
    const warn = creatorPanel.querySelector('#uie-c-warn');
    const ok = creatorPanel.querySelector('#uie-c-ok');
    warn.style.display = 'none';
    ok.style.display = 'none';
    if (!msg) return;
    if (isError) {
      warn.textContent = msg;
      warn.style.display = 'block';
    } else {
      ok.textContent = msg;
      ok.style.display = 'block';
    }
  }

  function ensureCreator() {
    if (creatorPanel) return;
    ensureStyles();
    const reg = registry();
    const effectKeys = (reg && reg.EFFECT_KEYS) || [];
    let effectFields = '';
    for (let i = 0; i < effectKeys.length; i++) {
      const k = effectKeys[i];
      effectFields +=
        '<div class="uie-field"><label>' + k + '</label>' +
        '<textarea id="uie-c-eff-' + k + '" spellcheck="false"></textarea></div>';
    }
    const tplOptions = ((reg && reg.getTemplateNames()) || []).map(function(n) {
      return '<option value="' + escapeAttr(n) + '">' + escapeAttr(n) + '</option>';
    }).join('');

    creatorPanel = document.createElement('div');
    creatorPanel.id = 'uieCreatorPanel';
    creatorPanel.innerHTML =
      '<div class="uie-hdr"><span>Custom Tool Creator</span>' +
        '<button class="uie-close" title="Close">✕</button></div>' +
      '<div class="uie-c-body">' +
        '<div class="uie-warn" id="uie-c-warn"></div>' +
        '<div class="uie-ok" id="uie-c-ok"></div>' +
        '<div class="uie-field"><label>Template</label>' +
          '<select id="uie-c-template"><option value="">— blank / current —</option>' + tplOptions + '</select></div>' +
        '<div class="uie-field"><label>Name</label><input type="text" id="uie-c-name" maxlength="64"></div>' +
        '<div class="uie-field"><label>Mode</label>' +
          '<select id="uie-c-mode">' +
            '<option value="brush">Brush</option>' +
            '<option value="place">Place (continuous)</option>' +
            '<option value="terrain">Terrain</option>' +
          '</select></div>' +
        '<div class="uie-field"><label>Tags (comma-separated)</label><input type="text" id="uie-c-tags"></div>' +

        '<div class="uie-section" id="uie-c-terrain-section" style="display:none">' +
          '<div class="uie-section-title">Terrain settings</div>' +
          '<div class="uie-field"><label>Role</label>' +
            '<select id="uie-c-role">' +
              '<option value="base">Base terrain (replaces surface like land / ocean / ice)</option>' +
              '<option value="overlay">Overlay on land (like urban / industrial)</option>' +
            '</select></div>' +
          '<div class="uie-field"><label>Surface kind (physics)</label>' +
            '<select id="uie-c-surface">' +
              '<option value="land">Land</option>' +
              '<option value="fresh">Fresh water</option>' +
              '<option value="sea">Ocean / sea</option>' +
              '<option value="iceSheet">Ice sheet</option>' +
              '<option value="iceCap">Ice cap / glacier</option>' +
              '<option value="custom">Custom visual (land-like physics)</option>' +
            '</select></div>' +
          '<div class="uie-field"><label>Custom texture (facade atlas strip)</label>' +
            '<div class="uie-tex-card">' +
              '<img class="uie-tex-preview" id="uie-c-tex-preview" alt="">' +
              '<div class="uie-tex-actions">' +
                '<div id="uie-c-tex-meta" style="font-size:11px;color:#777;">No custom texture</div>' +
                '<button type="button" class="uie-btn-sm" id="uie-c-tex-download">Download base template</button>' +
                '<button type="button" class="uie-btn-sm" id="uie-c-tex-upload">Upload PNG</button>' +
                '<button type="button" class="uie-btn-sm danger" id="uie-c-tex-clear">Clear texture</button>' +
                '<input type="file" id="uie-c-tex-file" accept="image/png,image/jpeg,.png,.jpg" style="display:none">' +
                '<div style="font-size:10px;color:#4a5060;line-height:1.35;">Max 8 textured tools. Overlay tools only paint on land. Template is the urban strip (top) from surfaceTextureMap.png.</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="uie-section-title" style="margin-top:10px;">Quick parameters</div>' +
          '<div class="uie-quick-params">' +
            '<label>Freezing °C <span id="uie-q-freezingVal">0.00</span><input type="range" id="uie-q-freezing" min="-40" max="10" step="0.5" value="0"></label>' +
            '<label>Snow <span id="uie-q-snowVal">0.00</span><input type="range" id="uie-q-snow" min="0" max="1" step="0.01" value="0"></label>' +
            '<label>Moisture <span id="uie-q-moistureVal">0.00</span><input type="range" id="uie-q-moisture" min="-1" max="1" step="0.01" value="0"></label>' +
            '<label>Heat <span id="uie-q-heatVal">0.00</span><input type="range" id="uie-q-heat" min="-1" max="1" step="0.01" value="0"></label>' +
            '<label>Friction <span id="uie-q-frictionVal">0.20</span><input type="range" id="uie-q-friction" min="0" max="1" step="0.01" value="0.2"></label>' +
            '<label>Albedo bias <span id="uie-q-albedoVal">0.15</span><input type="range" id="uie-q-albedo" min="0" max="1" step="0.01" value="0.15"></label>' +
          '</div>' +
        '</div>' +

        '<button type="button" class="uie-btn-sm uie-toggle-adv" id="uie-c-toggle-adv">Show advanced script</button>' +
        '<div class="uie-adv" id="uie-c-adv">' +
          '<div class="uie-field"><label>When (gate)</label><textarea id="uie-c-when" spellcheck="false">true</textarea></div>' +
          '<div class="uie-field"><label>Parameters (key, label, min, max, step, default)</label>' +
            '<div class="uie-params" id="uie-c-params"></div>' +
            '<button type="button" class="uie-btn-sm" id="uie-c-add-param">+ Add parameter</button></div>' +
          '<div class="uie-field"><label>Effects (expressions)</label>' +
            '<div class="uie-effects">' + effectFields + '</div></div>' +
        '</div>' +
        '<div class="uie-footer">' +
          '<button type="button" class="uie-footer-btn secondary" id="uie-c-validate">Validate</button>' +
          '<button type="button" class="uie-footer-btn secondary" id="uie-c-export-one">Export Tool</button>' +
          '<button type="button" class="uie-footer-btn create" id="uie-c-save">Save Tool</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(creatorPanel);
    makeDraggable(creatorPanel, '.uie-hdr');
    creatorPanel.querySelector('.uie-close').onclick = function() {
      creatorPanel.style.display = 'none';
    };
    creatorPanel.querySelector('#uie-c-mode').onchange = updateTerrainVisibility;
    creatorPanel.querySelector('#uie-c-toggle-adv').onclick = function() {
      const adv = creatorPanel.querySelector('#uie-c-adv');
      const open = adv.classList.toggle('open');
      creatorPanel.querySelector('#uie-c-toggle-adv').textContent =
        open ? 'Hide advanced script' : 'Show advanced script';
    };
    creatorPanel.querySelector('#uie-c-add-param').onclick = function() {
      creatorPanel.querySelector('#uie-c-params').appendChild(makeParamRow({
        key: 'param' + Math.floor(Math.random() * 1000),
        label: 'Param', min: 0, max: 1, step: 0.01, default: 0,
      }));
    };
    creatorPanel.querySelector('#uie-c-template').onchange = function() {
      const name = creatorPanel.querySelector('#uie-c-template').value;
      if (!name || !reg) return;
      const tool = reg.createFromTemplate(name);
      if (tool) {
        if (editingToolId) tool.id = editingToolId;
        else tool.id = undefined;
        fillCreatorForm(tool);
      }
    };
    creatorPanel.querySelector('#uie-c-tex-download').onclick = function() {
      const a = atlas();
      if (!a) return;
      a.downloadTemplate().catch(function(e) {
        showCreatorMsg(e.message || String(e), true);
      });
    };
    creatorPanel.querySelector('#uie-c-tex-upload').onclick = function() {
      creatorPanel.querySelector('#uie-c-tex-file').click();
    };
    creatorPanel.querySelector('#uie-c-tex-file').onchange = function() {
      const file = this.files && this.files[0];
      this.value = '';
      const a = atlas();
      if (!file || !a) return;
      a.processUploadFile(file).then(function(url) {
        draftTextureDataUrl = url;
        updateTexturePreview();
        showCreatorMsg('Texture ready — save the tool to assign an atlas slot', false);
      }).catch(function(e) {
        showCreatorMsg(e.message || String(e), true);
      });
    };
    creatorPanel.querySelector('#uie-c-tex-clear').onclick = function() {
      draftTextureDataUrl = null;
      updateTexturePreview();
    };
    wireQuickParams();
    creatorPanel.querySelector('#uie-c-validate').onclick = function() {
      const draft = readCreatorForm();
      const rt = runtime();
      const result = rt ? rt.validateToolScript(draft.script) : { ok: false, error: 'Runtime missing' };
      if (result.ok) showCreatorMsg('Script OK', false);
      else showCreatorMsg(result.error, true);
    };
    creatorPanel.querySelector('#uie-c-export-one').onclick = function() {
      const draft = readCreatorForm();
      try {
        // Prefer saved registry copy (includes atlasSlot); fall back to draft
        let payload;
        if (editingToolId && reg.getTool(editingToolId))
          payload = reg.exportSingleTool(editingToolId);
        else {
          const normalized = reg.normalizeCustomTool(draft);
          payload = JSON.stringify({ version: 1, tools: [normalized] }, null, 2);
        }
        const blob = new Blob([payload], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (draft.name || 'custom-tool').replace(/[^\w\-]+/g, '_') + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
        showCreatorMsg('Exported tool JSON', false);
      } catch (e) {
        showCreatorMsg(e.message || String(e), true);
      }
    };
    creatorPanel.querySelector('#uie-c-save').onclick = function() {
      const draft = readCreatorForm();
      const rt = runtime();
      const result = rt ? rt.validateToolScript(draft.script) : { ok: false, error: 'Runtime missing' };
      if (!result.ok) {
        showCreatorMsg(result.error, true);
        return;
      }
      if (rt) rt.invalidate(draft.id);
      try {
        const saved = reg.upsertCustomTool(draft);
        if (!saved) {
          showCreatorMsg('Failed to save tool', true);
          return;
        }
        editingToolId = saved.id;
        draftTextureDataUrl = saved.textureDataUrl || null;
        updateTexturePreview();
        showCreatorMsg('Saved "' + saved.name + '"' +
          (saved.atlasSlot != null ? ' (texture slot ' + saved.atlasSlot + ')' : ''), false);
        refreshList();
        if (typeof global.ControlHelp !== 'undefined' && global.ControlHelp.TOOL_HELP) {
          global.ControlHelp.TOOL_HELP[saved.id] = {
            title: saved.name,
            body: 'Custom ' + saved.mode + ' tool' +
              (saved.mode === 'terrain'
                ? ' (' + saved.terrainRole + ' / ' + saved.surfaceKind + ').'
                : '.') +
              ' Effects are driven by your script expressions and parameters.',
            keys: '',
          };
        }
      } catch (e) {
        showCreatorMsg(e.message || String(e), true);
      }
    };
  }

  function buildUserInteractionMenu() {
    if (panel) return panel;
    ensureStyles();
    const reg = registry();

    panel = document.createElement('div');
    panel.id = 'userInteractionPanel';
    panel.innerHTML =
      '<div class="uie-hdr"><span>User Interaction</span>' +
        '<button class="uie-close" title="Close">✕</button></div>' +
      '<div class="uie-body">' +
        '<div class="uie-hint">Search tools by name or category. Create terrain tools with Base/Overlay roles and optional custom facade textures (download template → edit → upload).</div>' +
        '<input type="text" class="uie-search" id="uie-search" placeholder="Search tools or categories…">' +
        '<div class="uie-tabs" id="uie-tabs"></div>' +
        '<div class="uie-list" id="uie-list"></div>' +
        '<div class="uie-brush">' +
          '<label>Brush Diameter <span id="uie-brushSizeVal">20</span>' +
            '<input type="range" id="uie-brushSize" min="1" max="200" step="1" value="20"></label>' +
          '<label>Brush Intensity <span id="uie-brushIntensityVal">0.010</span>' +
            '<input type="range" id="uie-brushIntensity" min="0.005" max="1" step="0.001" value="0.01"></label>' +
          '<label class="uie-chk"><input type="checkbox" id="uie-wholeWidth"> Whole Width Brush</label>' +
          '<label class="uie-chk"><input type="checkbox" id="uie-invertTool"> Invert Tool (charge − / +)</label>' +
        '</div>' +
        '<div class="uie-footer">' +
          '<button type="button" class="uie-footer-btn create" id="uie-create">Create Custom Tool</button>' +
          '<button type="button" class="uie-footer-btn secondary" id="uie-import">Import Tools</button>' +
          '<button type="button" class="uie-footer-btn secondary" id="uie-export">Export All</button>' +
        '</div>' +
        '<div class="uie-hint" style="margin-top:8px;">Custom tools are stored in the browser and embedded in simulation save files. Use Exp on a row to export one tool, or Import Tools to load JSON.</div>' +
        '<input type="file" id="uie-import-file" accept="application/json,.json" style="display:none">' +
      '</div>';
    document.body.appendChild(panel);
    makeDraggable(panel, '.uie-hdr');
    panel.querySelector('.uie-close').onclick = function() { panel.style.display = 'none'; };

    const tabsEl = panel.querySelector('#uie-tabs');
    const listEl = panel.querySelector('#uie-list');
    const searchEl = panel.querySelector('#uie-search');
    renderTabs(tabsEl);
    wireBrushControls();
    syncBrushControlsFromGui();

    refreshList = function() {
      if (!reg) return;
      const query = searchEl.value || '';
      const tools = reg.filterTools(query, activeCategory);
      const activeTool = global.guiControls ? global.guiControls.tool : null;
      listEl.innerHTML = '';
      for (let i = 0; i < tools.length; i++) {
        const tool = tools[i];
        const row = document.createElement('div');
        row.className = 'uie-row' + (tool.id === activeTool ? ' active' : '');

        if (tool.textureDataUrl) {
          const thumb = document.createElement('img');
          thumb.className = 'uie-thumb';
          thumb.src = tool.textureDataUrl;
          row.appendChild(thumb);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'uie-name';
        nameEl.textContent = tool.name;
        const catEl = document.createElement('span');
        catEl.className = 'uie-cat';
        catEl.textContent = tool.category;
        row.appendChild(nameEl);
        row.appendChild(catEl);

        if (!tool.builtin && tool.mode === 'terrain') {
          const roleEl = document.createElement('span');
          roleEl.className = 'uie-role';
          roleEl.textContent = tool.terrainRole === 'overlay' ? 'Overlay' : 'Base';
          row.appendChild(roleEl);
        }

        if (!tool.builtin) {
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'uie-btn-sm';
          editBtn.textContent = 'Edit';
          editBtn.onclick = function(e) {
            e.stopPropagation();
            openCreator(reg.getTool(tool.id));
          };
          const expBtn = document.createElement('button');
          expBtn.type = 'button';
          expBtn.className = 'uie-btn-sm';
          expBtn.textContent = 'Exp';
          expBtn.title = 'Export this tool as JSON';
          expBtn.onclick = function(e) {
            e.stopPropagation();
            try {
              const blob = new Blob([reg.exportSingleTool(tool.id)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = (tool.name || 'custom-tool').replace(/[^\w\-]+/g, '_') + '.json';
              a.click();
              URL.revokeObjectURL(a.href);
            } catch (err) {
              alert(err.message || String(err));
            }
          };
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'uie-btn-sm danger';
          delBtn.textContent = 'Del';
          delBtn.onclick = function(e) {
            e.stopPropagation();
            if (!confirm('Delete custom tool "' + tool.name + '"?')) return;
            reg.deleteCustomTool(tool.id);
            if (runtime()) runtime().invalidate(tool.id);
            if (global.guiControls && global.guiControls.tool === tool.id)
              reg.selectTool('TOOL_NONE');
            refreshList();
          };
          row.appendChild(editBtn);
          row.appendChild(expBtn);
          row.appendChild(delBtn);
        }

        row.onclick = function() {
          reg.selectTool(tool.id);
          refreshList();
        };
        listEl.appendChild(row);
      }
      if (!tools.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px;color:#555;font-size:12px;text-align:center;';
        empty.textContent = 'No tools match.';
        listEl.appendChild(empty);
      }
    };

    searchEl.addEventListener('input', refreshList);
    panel.querySelector('#uie-create').onclick = function() { openCreator(null); };
    panel.querySelector('#uie-export').onclick = function() {
      if (!reg) return;
      const blob = new Blob([reg.exportCustomTools()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'custom-tools.json';
      a.click();
      URL.revokeObjectURL(a.href);
    };
    const fileInput = panel.querySelector('#uie-import-file');
    panel.querySelector('#uie-import').onclick = function() { fileInput.click(); };
    fileInput.onchange = function() {
      const file = fileInput.files && fileInput.files[0];
      if (!file || !reg) return;
      const reader = new FileReader();
      reader.onload = function() {
        try {
          const n = reg.importCustomTools(String(reader.result), true);
          alert('Imported ' + n + ' custom tool(s).');
          refreshList();
        } catch (e) {
          alert('Import failed: ' + (e.message || e));
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    };

    if (reg) {
      reg.onChange(function() { refreshList(); });
      if (typeof global.ControlHelp !== 'undefined' && global.ControlHelp.TOOL_HELP) {
        const customs = reg.getAllTools().filter(function(t) { return !t.builtin; });
        for (let i = 0; i < customs.length; i++) {
          const t = customs[i];
          global.ControlHelp.TOOL_HELP[t.id] = {
            title: t.name,
            body: 'Custom ' + t.mode + ' tool. Effects are driven by your script expressions and parameters.',
            keys: '',
          };
        }
      }
      if (atlas()) atlas().scheduleRebuild();
    }

    refreshList();
    return panel;
  }

  function openUserInteractionMenu() {
    buildUserInteractionMenu();
    syncBrushControlsFromGui();
    refreshList();
    panel.style.display = 'block';
  }

  function openCustomToolCreator(existing) {
    buildUserInteractionMenu();
    openCreator(existing || null);
  }

  function refreshUserInteractionMenu() {
    if (!panel || panel.style.display === 'none') return;
    syncBrushControlsFromGui();
    refreshList();
  }

  const api = {
    buildUserInteractionMenu: buildUserInteractionMenu,
    openUserInteractionMenu: openUserInteractionMenu,
    openCustomToolCreator: openCustomToolCreator,
    refreshUserInteractionMenu: refreshUserInteractionMenu,
  };

  global.UserInteraction = global.UserInteraction || {};
  global.UserInteraction.menu = api;
  global.buildUserInteractionMenu = buildUserInteractionMenu;
  global.openUserInteractionMenu = openUserInteractionMenu;
  global.openCustomToolCreator = openCustomToolCreator;
})(typeof window !== 'undefined' ? window : global);
