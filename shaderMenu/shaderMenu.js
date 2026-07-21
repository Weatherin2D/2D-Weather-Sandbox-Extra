/**
 * Floating "Shader Menu" panel: appearance packs, look/clouds/sky tuning,
 * custom sky+sun textures and live custom shader editing.
 *
 * Visual language matches the Sky Editor / User Interaction panels (dark
 * #13131f theme, draggable header, top tab bar). CSS class prefix: shm-.
 *
 * Host contract: call buildShaderMenu(deps) once (from app.js) after
 * window.ShaderMenu.packs / .textures / .runtime have been loaded and
 * window.ShaderMenu.runtime.init(...) has been wired up. Afterwards use
 * openShaderMenu()/closeShaderMenu()/refreshShaderMenu() freely.
 *
 * See the deps object documentation inline below for exactly what app.js
 * is expected to provide.
 */
(function(global) {
  'use strict';

  const TAB_DEFS = [
    { id: 'packs', label: 'Packs' },
    { id: 'look', label: 'Look' },
    { id: 'clouds', label: 'Clouds & Rain' },
    { id: 'sky', label: 'Sky' },
    { id: 'textures', label: 'Textures' },
    { id: 'glsl', label: 'Custom Shaders' },
  ];

  const SKY_SUB_TABS = [
    { id: 'time', label: 'Time & Sun' },
    { id: 'day', label: 'Day Sky' },
    { id: 'twilight', label: 'Twilight' },
    { id: 'horizon', label: 'Horizon' },
    { id: 'stars', label: 'Stars' },
    { id: 'effects', label: 'Effects' },
  ];

  const SHADER_STAGES = [
    { id: 'post', label: 'Post-processing' },
    { id: 'sky', label: 'Sky background' },
    { id: 'realistic', label: 'Realistic display' },
  ];

  let panel = null;
  let deps = null;
  let activeTab = 'packs';
  const tabRefreshers = {};

  function textures() {
    return global.ShaderMenu && global.ShaderMenu.textures;
  }
  function runtime() {
    return global.ShaderMenu && global.ShaderMenu.runtime;
  }
  function packsApi() {
    return global.ShaderMenu && global.ShaderMenu.packs;
  }

  function guiC() {
    return (deps && typeof deps.getGuiControls === 'function' && deps.getGuiControls()) || {};
  }
  function skyS() {
    return (deps && typeof deps.getSkySettings === 'function' && deps.getSkySettings()) || {};
  }
  function cloudsRainS() {
    return (deps && typeof deps.getCloudsRain === 'function' && deps.getCloudsRain()) || {};
  }
  function timeChangeFns() {
    return (deps && deps.onSkyTimeChange) || {};
  }

  function localVec3ToHex(v) {
    const arr = Array.isArray(v) ? v : [1, 1, 1];
    const r = Math.round(Math.max(0, Math.min(1, arr[0])) * 255);
    const g = Math.round(Math.max(0, Math.min(1, arr[1])) * 255);
    const b = Math.round(Math.max(0, Math.min(1, arr[2])) * 255);
    return '#' + [r, g, b].map(function(x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  function localHexToVec3(hex) {
    const h = String(hex).replace('#', '');
    if (h.length !== 6) return [1, 1, 1];
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  }

  function vec3ToHex(v) {
    if (deps && typeof deps.skyVec3ToHex === 'function') return deps.skyVec3ToHex(v);
    return localVec3ToHex(v);
  }

  function hexToVec3(hex) {
    if (deps && typeof deps.skyHexToVec3 === 'function') return deps.skyHexToVec3(hex);
    return localHexToVec3(hex);
  }

  function ensureStyles() {
    if (document.getElementById('shm-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'shm-styles';
    styleEl.textContent = `
      #shaderMenuPanel{display:none;position:fixed;top:50px;right:420px;width:540px;
        background:#13131f;border:1px solid #252540;border-radius:10px;
        z-index:10000;font-family:Arial,sans-serif;color:#eee;max-height:92vh;
        overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.75);}
      .shm-hdr{display:flex;align-items:center;gap:8px;padding:11px 15px;
        background:linear-gradient(135deg,#191930,#0e0e22);
        border-bottom:1px solid #252540;cursor:move;user-select:none;flex-shrink:0;}
      .shm-hdr span{font-size:14px;font-weight:700;flex:1;}
      .shm-close{background:rgba(255,255,255,0.07);border:none;color:#777;cursor:pointer;
        font-size:12px;padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;}
      .shm-close:hover{background:rgba(220,60,60,0.35);color:#fff;}
      .shm-body{padding:14px 15px 16px;overflow-y:auto;max-height:calc(92vh - 46px);
        scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .shm-body::-webkit-scrollbar{width:4px;}
      .shm-body::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .shm-tabs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:12px;}
      .shm-tab{padding:5px 11px;border:1px solid #252540;border-radius:20px;
        background:#13131f;color:#5a6070;cursor:pointer;font-size:11px;
        font-weight:600;transition:all 0.15s;}
      .shm-tab:hover{background:#1e1e38;color:#aaa;border-color:#3a3a60;}
      .shm-tab.active{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .shm-section{display:none;}
      .shm-section.active{display:block;}
      .shm-subtabs{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:10px;}
      .shm-subtab{padding:4px 9px;border:1px solid #252540;border-radius:16px;
        background:#0e0e1a;color:#5a6070;cursor:pointer;font-size:10px;
        font-weight:600;transition:all 0.15s;}
      .shm-subtab:hover{background:#1e1e38;color:#aaa;border-color:#3a3a60;}
      .shm-subtab.active{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .shm-subsection{display:none;}
      .shm-subsection.active{display:block;}
      .shm-grad{height:28px;border-radius:6px;margin-bottom:10px;border:1px solid #252540;}
      .shm-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
      .shm-lbl{flex:1;font-size:11px;color:#888;min-width:0;}
      .shm-lbl small{display:block;color:#555;font-size:10px;margin-top:1px;}
      .shm-inp{width:72px;height:26px;border:1px solid #252540;border-radius:4px;
        background:#0b0b17;color:#c0c0d0;font-size:11px;text-align:right;padding:2px 6px;
        box-sizing:border-box;flex-shrink:0;}
      .shm-inp:focus{outline:none;border-color:#3050c0;}
      .shm-inp[type=color]{width:42px;height:26px;padding:1px;cursor:pointer;}
      select.shm-inp{width:150px;text-align:left;}
      .shm-chk{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#888;cursor:pointer;}
      .shm-chk input{width:15px;height:15px;accent-color:#4a90e2;cursor:pointer;}
      .shm-divider{border-top:1px solid #1c1c30;margin:10px 0;}
      .shm-group{border:1px solid #1c1c30;border-radius:8px;padding:10px 12px;
        margin-bottom:12px;background:#0e0e1a;}
      .shm-group-title{font-size:11px;font-weight:700;color:#a0c0ff;margin-bottom:8px;}
      .shm-io-lbl{font-size:10px;color:#4a5060;text-transform:uppercase;
        letter-spacing:1.2px;font-weight:600;margin-bottom:6px;}
      .shm-io-area{width:100%;box-sizing:border-box;height:72px;border:1px solid #252540;
        border-radius:6px;background:#0b0b17;color:#888;font-size:10px;padding:8px;
        font-family:Consolas,monospace;resize:vertical;margin-bottom:8px;}
      .shm-glsl-area{width:100%;box-sizing:border-box;height:280px;border:1px solid #252540;
        border-radius:6px;background:#0b0b17;color:#c0c0d0;font-size:11px;padding:8px;
        font-family:Consolas,monospace;resize:vertical;margin-bottom:10px;white-space:pre;}
      .shm-footer{display:flex;gap:8px;margin-top:4px;margin-bottom:4px;flex-wrap:wrap;}
      .shm-footer-btn{flex:1;min-width:100px;padding:8px;border:none;border-radius:5px;
        cursor:pointer;font-size:11px;font-weight:700;color:#fff;}
      .shm-footer-btn.reset{background:#401828;}
      .shm-footer-btn.reset:hover{filter:brightness(1.15);}
      .shm-footer-btn.io{background:#182840;}
      .shm-footer-btn.io:hover{filter:brightness(1.15);}
      .shm-footer-btn.primary{background:#1e3080;}
      .shm-footer-btn.primary:hover{filter:brightness(1.15);}
      .shm-list{display:flex;flex-direction:column;gap:6px;max-height:260px;
        overflow-y:auto;margin-bottom:10px;scrollbar-width:thin;scrollbar-color:#252540 #0d0d18;}
      .shm-list::-webkit-scrollbar{width:4px;}
      .shm-list::-webkit-scrollbar-thumb{background:#252540;border-radius:2px;}
      .shm-pack-row{display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;
        border:1px solid #252540;background:#0e0e1a;}
      .shm-pack-name{flex:1;font-size:12px;color:#bbb;min-width:0;overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap;}
      .shm-badge{font-size:9px;font-weight:700;color:#c0a060;background:rgba(192,160,96,0.12);
        padding:2px 6px;border-radius:10px;flex-shrink:0;}
      .shm-btn-sm{padding:4px 9px;border:1px solid #252540;border-radius:4px;
        background:#181828;color:#777;cursor:pointer;font-size:10px;font-weight:600;flex-shrink:0;}
      .shm-btn-sm:hover{background:#1e3080;color:#a0c0ff;border-color:#3050c0;}
      .shm-btn-sm.danger{color:#c06070;}
      .shm-btn-sm.danger:hover{background:#401828;color:#e08090;border-color:#602030;}
      .shm-msg{display:none;padding:8px 10px;margin-bottom:10px;border-radius:6px;font-size:11px;}
      .shm-msg.ok{display:block;background:#182818;border:1px solid #305030;color:#a0e0a0;}
      .shm-msg.err{display:block;background:#281820;border:1px solid #503030;color:#e0a0a0;}
      .shm-hint{font-size:10px;color:#4a5060;margin-bottom:10px;line-height:1.4;}
      .shm-note{font-size:10px;color:#4a5060;line-height:1.4;margin-top:6px;}
      .shm-tex-card{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;}
      .shm-tex-preview{width:120px;height:90px;border:1px solid #252540;border-radius:6px;
        background:#0b0b17;object-fit:cover;display:none;}
      .shm-tex-actions{display:flex;flex-direction:column;gap:6px;flex:1;min-width:170px;}
      .shm-status{font-size:11px;color:#777;}
      .shm-status.ok{color:#7cc47c;}
      .shm-log{width:100%;box-sizing:border-box;max-height:120px;overflow-y:auto;
        border:1px solid #252540;border-radius:6px;background:#0b0b17;color:#e0a0a0;
        font-size:10px;padding:8px;font-family:Consolas,monospace;white-space:pre-wrap;
        margin-bottom:6px;}
      .shm-log.ok{color:#7cc47c;}
    `;
    document.head.appendChild(styleEl);
  }

  function makeDraggable(el, hdrSelector) {
    let dragX = 0, dragY = 0, dragging = false;
    const hdr = el.querySelector(hdrSelector);
    if (!hdr) return;
    hdr.addEventListener('mousedown', function(e) {
      if (e.target.classList.contains('shm-close')) return;
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

  // ---------------------------------------------------------------------
  // Generic row builders
  // ---------------------------------------------------------------------

  function addSlider(sectionEl, label, hint, getVal, setVal, min, max, step, syncArr) {
    const row = document.createElement('div');
    row.className = 'shm-row';
    const lbl = document.createElement('div');
    lbl.className = 'shm-lbl';
    lbl.innerHTML = label + (hint ? '<small>' + hint + '</small>' : '');
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'shm-inp';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.value = String(getVal());
    inp.onchange = function() {
      const v = parseFloat(inp.value);
      if (Number.isFinite(v)) setVal(v);
    };
    row.appendChild(lbl);
    row.appendChild(inp);
    sectionEl.appendChild(row);
    if (syncArr) syncArr.push(function() { inp.value = String(getVal()); });
    return inp;
  }

  function addColorRow(sectionEl, label, getVal, setVal, syncArr) {
    const row = document.createElement('div');
    row.className = 'shm-row';
    const lbl = document.createElement('div');
    lbl.className = 'shm-lbl';
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.className = 'shm-inp';
    inp.value = vec3ToHex(getVal());
    inp.oninput = function() { setVal(hexToVec3(inp.value)); };
    row.appendChild(lbl);
    row.appendChild(inp);
    sectionEl.appendChild(row);
    if (syncArr) syncArr.push(function() { inp.value = vec3ToHex(getVal()); });
    return inp;
  }

  function addCheckboxRow(sectionEl, label, getVal, setVal, syncArr) {
    const wrap = document.createElement('label');
    wrap.className = 'shm-chk';
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    wrap.appendChild(inp);
    wrap.appendChild(document.createTextNode(' ' + label));
    inp.checked = !!getVal();
    inp.onchange = function() { setVal(!!inp.checked); };
    sectionEl.appendChild(wrap);
    if (syncArr) syncArr.push(function() { inp.checked = !!getVal(); });
    return inp;
  }

  function addSelectRow(sectionEl, label, options, getVal, setVal, syncArr) {
    const row = document.createElement('div');
    row.className = 'shm-row';
    const lbl = document.createElement('div');
    lbl.className = 'shm-lbl';
    lbl.textContent = label;
    const sel = document.createElement('select');
    sel.className = 'shm-inp';
    for (let i = 0; i < options.length; i++) {
      const opt = document.createElement('option');
      opt.value = options[i].value;
      opt.textContent = options[i].label;
      sel.appendChild(opt);
    }
    sel.value = getVal();
    sel.onchange = function() { setVal(sel.value); };
    row.appendChild(lbl);
    row.appendChild(sel);
    sectionEl.appendChild(row);
    if (syncArr) syncArr.push(function() { sel.value = getVal(); });
    return sel;
  }

  function addGroup(parentEl, title) {
    const group = document.createElement('div');
    group.className = 'shm-group';
    const titleEl = document.createElement('div');
    titleEl.className = 'shm-group-title';
    titleEl.textContent = title;
    group.appendChild(titleEl);
    parentEl.appendChild(group);
    return group;
  }

  // ---------------------------------------------------------------------
  // Packs tab
  // ---------------------------------------------------------------------

  function buildPacksTab(sectionEl) {
    sectionEl.innerHTML =
      '<div class="shm-hint">Packs bundle appearance, clouds/rain tuning, and optionally sky, textures and custom shaders. Apply a pack to load it instantly.</div>' +
      '<div class="shm-msg" id="shm-packs-msg"></div>' +
      '<div class="shm-list" id="shm-packs-list"></div>' +
      '<div class="shm-footer">' +
        '<button type="button" class="shm-footer-btn primary" id="shm-pack-save">Save current as pack</button>' +
        '<button type="button" class="shm-footer-btn reset" id="shm-pack-vanilla">Reset to Vanilla</button>' +
      '</div>' +
      '<div class="shm-divider"></div>' +
      '<div class="shm-io-lbl">Export / Import pack JSON</div>' +
      '<textarea class="shm-io-area" id="shm-pack-io" placeholder="Paste pack JSON here..."></textarea>' +
      '<div class="shm-footer">' +
        '<button type="button" class="shm-footer-btn io" id="shm-pack-export">Export current</button>' +
        '<button type="button" class="shm-footer-btn io" id="shm-pack-import">Import</button>' +
      '</div>';

    const listEl = sectionEl.querySelector('#shm-packs-list');
    const ioEl = sectionEl.querySelector('#shm-pack-io');
    const msgEl = sectionEl.querySelector('#shm-packs-msg');

    function showMsg(msg, isErr) {
      if (!msg) { msgEl.className = 'shm-msg'; msgEl.textContent = ''; return; }
      msgEl.className = 'shm-msg ' + (isErr ? 'err' : 'ok');
      msgEl.textContent = msg;
    }

    function allPacks() {
      const p = packsApi();
      if (!p) return [];
      return p.getBuiltinPacks().concat(p.loadUserPacks());
    }

    function refreshList() {
      listEl.innerHTML = '';
      const list = allPacks();
      if (!list.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px;color:#555;font-size:12px;text-align:center;';
        empty.textContent = 'No packs available.';
        listEl.appendChild(empty);
        return;
      }
      for (let i = 0; i < list.length; i++) {
        const pack = list[i];
        const row = document.createElement('div');
        row.className = 'shm-pack-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'shm-pack-name';
        nameEl.textContent = pack.name;
        nameEl.title = pack.name;
        row.appendChild(nameEl);

        if (pack.builtin) {
          const badge = document.createElement('span');
          badge.className = 'shm-badge';
          badge.textContent = 'Builtin';
          row.appendChild(badge);
        }

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'shm-btn-sm';
        applyBtn.textContent = 'Apply';
        applyBtn.onclick = function() {
          applyPack(pack).then(function() {
            showMsg('Applied "' + pack.name + '"', false);
          });
        };
        row.appendChild(applyBtn);

        const expBtn = document.createElement('button');
        expBtn.type = 'button';
        expBtn.className = 'shm-btn-sm';
        expBtn.textContent = 'Export';
        expBtn.onclick = function() {
          const p = packsApi();
          if (!p) return;
          ioEl.value = p.exportPackJson(pack);
        };
        row.appendChild(expBtn);

        if (!pack.builtin) {
          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'shm-btn-sm danger';
          delBtn.textContent = 'Delete';
          delBtn.onclick = function() {
            if (!confirm('Delete pack "' + pack.name + '"?')) return;
            const p = packsApi();
            if (p) p.deleteUserPack(pack.id);
            refreshList();
          };
          row.appendChild(delBtn);
        }

        listEl.appendChild(row);
      }
    }

    function buildPackFromCurrentState(name) {
      const p = packsApi();
      const g = guiC();
      const appearanceDefaults = (p && p.APPEARANCE_DEFAULTS) || {};
      const appearance = {};
      for (const key in appearanceDefaults) {
        if (Object.prototype.hasOwnProperty.call(appearanceDefaults, key))
          appearance[key] = g[key];
      }
      const cloudsRain = cloudsRainS();
      const sky = skyS();
      const tex = textures();
      const texObj = {
        sky: (tex && tex.hasSky()) ? tex.getSkyDataUrl() : null,
        sun: (tex && tex.hasSun()) ? tex.getSunDataUrl() : null,
      };
      const rt = runtime();
      const shadersObj = {
        post: (rt && rt.hasCustom('post')) ? rt.getEditedSource('post') : null,
        sky: (rt && rt.hasCustom('sky')) ? rt.getEditedSource('sky') : null,
        realistic: (rt && rt.hasCustom('realistic')) ? rt.getEditedSource('realistic') : null,
      };
      return {
        name: name,
        appearance: appearance,
        cloudsRain: cloudsRain,
        sky: sky,
        textures: texObj,
        shaders: shadersObj,
      };
    }

    sectionEl.querySelector('#shm-pack-save').onclick = function() {
      const name = prompt('Pack name:', 'My Pack');
      if (!name) return;
      const p = packsApi();
      if (!p) { showMsg('Packs module unavailable', true); return; }
      try {
        const draft = buildPackFromCurrentState(name.trim() || 'My Pack');
        const saved = p.upsertUserPack(draft);
        showMsg('Saved "' + saved.name + '"', false);
        refreshList();
      } catch (e) {
        showMsg(e.message || String(e), true);
      }
    };

    sectionEl.querySelector('#shm-pack-vanilla').onclick = function() {
      const p = packsApi();
      if (!p) { showMsg('Packs module unavailable', true); return; }
      const builtins = p.getBuiltinPacks();
      let vanilla = null;
      for (let i = 0; i < builtins.length; i++) {
        if (builtins[i].id === 'builtin_vanilla') { vanilla = builtins[i]; break; }
      }
      if (!vanilla) { showMsg('Vanilla pack not found', true); return; }
      applyPack(vanilla).then(function() { showMsg('Reset to Vanilla', false); });
    };

    sectionEl.querySelector('#shm-pack-export').onclick = function() {
      const p = packsApi();
      if (!p) { showMsg('Packs module unavailable', true); return; }
      const draft = buildPackFromCurrentState('Exported Pack');
      ioEl.value = p.exportPackJson(draft);
    };

    sectionEl.querySelector('#shm-pack-import').onclick = function() {
      const p = packsApi();
      if (!p) { showMsg('Packs module unavailable', true); return; }
      try {
        const pack = p.importPackJson(ioEl.value);
        const saved = p.upsertUserPack(pack);
        showMsg('Imported "' + saved.name + '" (click Apply to use it)', false);
        refreshList();
      } catch (e) {
        showMsg(e.message || String(e), true);
      }
    };

    refreshList();
    return function refreshPacksTab() {
      refreshList();
    };
  }

  // ---------------------------------------------------------------------
  // Look tab
  // ---------------------------------------------------------------------

  function buildLookTab(sectionEl) {
    sectionEl.innerHTML = '';
    const syncArr = [];

    function commit() {
      if (deps && typeof deps.uploadAppearanceUniforms === 'function') deps.uploadAppearanceUniforms();
    }

    addSlider(sectionEl, 'Exposure', '', function() { return guiC().exposure; },
      function(v) { guiC().exposure = v; commit(); }, 0.25, 5, 0.01, syncArr);
    addSlider(sectionEl, 'Saturation', '', function() { return guiC().saturation; },
      function(v) { guiC().saturation = v; commit(); }, 0, 3, 0.01, syncArr);
    addSlider(sectionEl, 'Contrast', '', function() { return guiC().contrast; },
      function(v) { guiC().contrast = v; commit(); }, 0.5, 3, 0.01, syncArr);
    addSlider(sectionEl, 'Bloom strength', '', function() { return guiC().bloomStrength; },
      function(v) { guiC().bloomStrength = v; commit(); }, 0, 3, 0.01, syncArr);
    addCheckboxRow(sectionEl, 'Enable rainbows', function() { return guiC().enableRainbows; },
      function(v) { guiC().enableRainbows = v; commit(); }, syncArr);
    addCheckboxRow(sectionEl, 'Smooth clouds', function() { return guiC().smoothClouds; },
      function(v) { guiC().smoothClouds = v; commit(); }, syncArr);
    addSlider(sectionEl, 'Flood water opacity', '', function() { return guiC().floodWaterOpacity; },
      function(v) { guiC().floodWaterOpacity = v; commit(); }, 0, 1, 0.01, syncArr);
    addSlider(sectionEl, 'Fog haze strength', '', function() { return guiC().fogHazeStrength; },
      function(v) { guiC().fogHazeStrength = v; commit(); }, 0, 2, 0.01, syncArr);
    addSlider(sectionEl, 'Min shadow light', '0 = darkest shadows', function() { return guiC().minShadowLight; },
      function(v) { guiC().minShadowLight = v; commit(); }, 0, 0.2, 0.001, syncArr);

    return function refreshLookTab() {
      for (let i = 0; i < syncArr.length; i++) syncArr[i]();
    };
  }

  // ---------------------------------------------------------------------
  // Clouds & Rain tab
  // ---------------------------------------------------------------------

  function buildCloudsTab(sectionEl) {
    sectionEl.innerHTML = '';
    const syncArr = [];

    function setCR(partial) {
      const cur = cloudsRainS();
      const next = Object.assign({}, cur, partial || {});
      if (deps && typeof deps.setCloudsRain === 'function') deps.setCloudsRain(next);
    }

    const colours = addGroup(sectionEl, 'Colours');
    addColorRow(colours, 'Cloud bright tint', function() { return cloudsRainS().cloudBrightTint; },
      function(v) { setCR({ cloudBrightTint: v }); }, syncArr);
    addColorRow(colours, 'Cloud dark tint', function() { return cloudsRainS().cloudDarkTint; },
      function(v) { setCR({ cloudDarkTint: v }); }, syncArr);
    addColorRow(colours, 'Rain shaft tint', function() { return cloudsRainS().rainShaftTint; },
      function(v) { setCR({ rainShaftTint: v }); }, syncArr);
    addColorRow(colours, 'Snow shaft tint', function() { return cloudsRainS().snowShaftTint; },
      function(v) { setCR({ snowShaftTint: v }); }, syncArr);

    const lighting = addGroup(sectionEl, 'Lighting');
    addSlider(lighting, 'Cloud light response', '', function() { return cloudsRainS().cloudLightResponse; },
      function(v) { setCR({ cloudLightResponse: v }); }, 0, 2, 0.01, syncArr);
    addSlider(lighting, 'Cloud shadow strength', '', function() { return cloudsRainS().cloudShadowStrength; },
      function(v) { setCR({ cloudShadowStrength: v }); }, 0, 1, 0.01, syncArr);
    addSlider(lighting, 'Shaft backlight', '', function() { return cloudsRainS().shaftBacklight; },
      function(v) { setCR({ shaftBacklight: v }); }, 0, 1, 0.01, syncArr);
    addSlider(lighting, 'Cloud density scale', '', function() { return cloudsRainS().cloudDensityScale; },
      function(v) { setCR({ cloudDensityScale: v }); }, 0, 2, 0.01, syncArr);

    const transparency = addGroup(sectionEl, 'Transparency');
    addSlider(transparency, 'Cloud opacity mult', '', function() { return cloudsRainS().cloudOpacityMult; },
      function(v) { setCR({ cloudOpacityMult: v }); }, 0, 2, 0.01, syncArr);
    addSlider(transparency, 'Rain opacity mult', '', function() { return cloudsRainS().rainOpacityMult; },
      function(v) { setCR({ rainOpacityMult: v }); }, 0, 2, 0.01, syncArr);
    addSlider(transparency, 'Cloud softness', '', function() { return cloudsRainS().cloudSoftness; },
      function(v) { setCR({ cloudSoftness: v }); }, 0, 2, 0.01, syncArr);

    const reflections = addGroup(sectionEl, 'Reflections');
    addSlider(reflections, 'Shaft specular', '', function() { return cloudsRainS().shaftSpecular; },
      function(v) { setCR({ shaftSpecular: v }); }, 0, 1, 0.01, syncArr);
    addSlider(reflections, 'Sky reflect amount', '', function() { return cloudsRainS().skyReflectAmount; },
      function(v) { setCR({ skyReflectAmount: v }); }, 0, 1, 0.01, syncArr);
    addSlider(reflections, 'Refract distort', '', function() { return cloudsRainS().refractDistort; },
      function(v) { setCR({ refractDistort: v }); }, 0, 1, 0.01, syncArr);
    addSlider(reflections, 'Rainbow strength', '', function() { return cloudsRainS().rainbowStrength; },
      function(v) { setCR({ rainbowStrength: v }); }, 0, 2, 0.01, syncArr);

    const fx = addGroup(sectionEl, 'FX Mix / Harmony');
    addSlider(fx, 'Lightning cloud fill', '', function() { return cloudsRainS().lightningCloudFill; },
      function(v) { setCR({ lightningCloudFill: v }); }, 0, 2, 0.01, syncArr);
    addSlider(fx, 'Lightning shaft glow', '', function() { return cloudsRainS().lightningShaftGlow; },
      function(v) { setCR({ lightningShaftGlow: v }); }, 0, 2, 0.01, syncArr);
    addSlider(fx, 'Sheet flash mix', '', function() { return cloudsRainS().sheetFlashMix; },
      function(v) { setCR({ sheetFlashMix: v }); }, 0, 2, 0.01, syncArr);
    addSelectRow(fx, 'Lightning tint mode', [
      { value: 'neutral', label: 'Neutral' },
      { value: 'matchClouds', label: 'Match clouds' },
      { value: 'custom', label: 'Custom' },
    ], function() { return cloudsRainS().lightningTintMode; },
      function(v) { setCR({ lightningTintMode: v }); }, syncArr);
    addColorRow(fx, 'Lightning tint', function() { return cloudsRainS().lightningTint; },
      function(v) { setCR({ lightningTint: v }); }, syncArr);
    addSlider(fx, 'Flash soft clip', '', function() { return cloudsRainS().flashSoftClip; },
      function(v) { setCR({ flashSoftClip: v }); }, 0, 2, 0.01, syncArr);
    addSlider(fx, 'Lightning bloom coupling', '', function() { return cloudsRainS().lightningBloomCoupling; },
      function(v) { setCR({ lightningBloomCoupling: v }); }, 0, 2, 0.01, syncArr);

    const footer = document.createElement('div');
    footer.className = 'shm-footer';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'shm-footer-btn reset';
    resetBtn.textContent = 'Reset clouds / rain to defaults';
    resetBtn.onclick = function() {
      if (deps && typeof deps.resetCloudsRain === 'function') deps.resetCloudsRain();
      refreshCloudsTab();
    };
    footer.appendChild(resetBtn);
    sectionEl.appendChild(footer);

    function refreshCloudsTab() {
      for (let i = 0; i < syncArr.length; i++) syncArr[i]();
    }
    return refreshCloudsTab;
  }

  // ---------------------------------------------------------------------
  // Sky tab
  // ---------------------------------------------------------------------

  function buildSkyTab(sectionEl) {
    sectionEl.innerHTML =
      '<div class="shm-grad" id="shm-sky-preview"></div>' +
      '<div class="shm-subtabs" id="shm-sky-subtabs"></div>' +
      '<div class="shm-subsection active" id="shm-sky-sec-time"></div>' +
      '<div class="shm-subsection" id="shm-sky-sec-day"></div>' +
      '<div class="shm-subsection" id="shm-sky-sec-twilight"></div>' +
      '<div class="shm-subsection" id="shm-sky-sec-horizon"></div>' +
      '<div class="shm-subsection" id="shm-sky-sec-stars"></div>' +
      '<div class="shm-subsection" id="shm-sky-sec-effects"></div>' +
      '<div class="shm-divider"></div>' +
      '<div class="shm-io-lbl">Import / Export sky JSON</div>' +
      '<textarea class="shm-io-area" id="shm-sky-io" placeholder="Paste sky settings JSON here..."></textarea>' +
      '<div class="shm-footer">' +
        '<button type="button" class="shm-footer-btn io" id="shm-sky-export">Export</button>' +
        '<button type="button" class="shm-footer-btn io" id="shm-sky-import">Import</button>' +
        '<button type="button" class="shm-footer-btn reset" id="shm-sky-reset">Reset defaults</button>' +
      '</div>';

    const previewEl = sectionEl.querySelector('#shm-sky-preview');
    const subTabsEl = sectionEl.querySelector('#shm-sky-subtabs');
    const syncArr = [];
    let activeSkySub = 'time';

    function updatePreview() {
      const s = skyS();
      const stops = [s.twilightHorizon, s.twilightLow, s.twilightMid, s.twilightUpper, s.twilightTop];
      const pct = 100 / (stops.length - 1);
      const parts = stops.map(function(c, i) { return vec3ToHex(c) + ' ' + (i * pct) + '%'; });
      previewEl.style.background = 'linear-gradient(to top, ' + parts.join(', ') + ')';
    }

    function commitSky() {
      if (deps && typeof deps.saveSkySettings === 'function') deps.saveSkySettings();
      if (deps && typeof deps.uploadSkyUniforms === 'function') deps.uploadSkyUniforms();
      updatePreview();
    }

    function setSkyField(key, val) {
      const cur = skyS();
      cur[key] = val;
      if (deps && typeof deps.setSkySettings === 'function') deps.setSkySettings(cur);
      commitSky();
    }

    function addSkySlider(sectionElInner, label, hint, key, min, max, step) {
      addSlider(sectionElInner, label, hint, function() { return skyS()[key]; },
        function(v) { setSkyField(key, v); }, min, max, step, syncArr);
    }

    function addSkyColor(sectionElInner, label, key) {
      addColorRow(sectionElInner, label, function() { return skyS()[key]; },
        function(v) { setSkyField(key, v); }, syncArr);
    }

    function addGuiSlider(sectionElInner, label, hint, key, min, max, step, onExtra) {
      addSlider(sectionElInner, label, hint, function() { return guiC()[key]; },
        function(v) {
          guiC()[key] = v;
          if (typeof onExtra === 'function') onExtra();
        }, min, max, step, syncArr);
    }

    // --- Time & Sun ---
    const secTime = sectionEl.querySelector('#shm-sky-sec-time');
    addGuiSlider(secTime, 'Time of day (hours)', '0-24, noon = 12', 'timeOfDay', 0, 23.96, 0.01, function() {
      const f = timeChangeFns();
      if (typeof f.onUpdateTimeOfDaySlider === 'function') f.onUpdateTimeOfDaySlider();
    });
    addGuiSlider(secTime, 'Sun angle (deg)', 'Zenith angle; 90 = overhead', 'sunAngle', 0, 180, 0.1, function() {
      const f = timeChangeFns();
      if (typeof f.updateSunlight === 'function') f.updateSunlight();
    });
    addGuiSlider(secTime, 'Month', 'Affects moon phase', 'month', 1, 12, 0.01);
    addGuiSlider(secTime, 'Latitude (deg)', 'Day/night cycle latitude', 'latitude', -90, 90, 0.1, function() {
      const f = timeChangeFns();
      if (typeof f.updateSunlight === 'function') f.updateSunlight();
    });
    addGuiSlider(secTime, 'Latitude left (deg)', 'Multi Latitude left edge', 'latitudeLeft', -90, 90, 0.1, function() {
      const f = timeChangeFns();
      if (typeof f.updateSunlight === 'function') f.updateSunlight();
    });
    addGuiSlider(secTime, 'Latitude right (deg)', 'Multi Latitude right edge', 'latitudeRight', -90, 90, 0.1, function() {
      const f = timeChangeFns();
      if (typeof f.updateSunlight === 'function') f.updateSunlight();
    });
    addGuiSlider(secTime, 'Longitude left (deg)', 'Local time shift left', 'longitudeLeft', -180, 180, 0.1, function() {
      const f = timeChangeFns();
      if (typeof f.updateSunlight === 'function') f.updateSunlight();
    });
    addGuiSlider(secTime, 'Longitude right (deg)', 'Local time shift right', 'longitudeRight', -180, 180, 0.1, function() {
      const f = timeChangeFns();
      if (typeof f.updateSunlight === 'function') f.updateSunlight();
    });
    addGuiSlider(secTime, 'Sun intensity', 'Radiation strength', 'sunIntensity', 0, 3, 0.01, function() {
      const f = timeChangeFns();
      if (typeof f.updateSunlight === 'function') f.updateSunlight();
    });
    addSkySlider(secTime, 'Sun horizontal amplitude', 'East-west travel range', 'sunHorizAmplitude', 0, 0.8, 0.01);
    addSkySlider(secTime, 'Sun vertical scale', 'Height above horizon', 'sunVertScale', 0, 1.5, 0.01);

    addCheckboxRow(secTime, 'Multi Latitude mode', function() { return guiC().multiLatitudeMode; },
      function(v) {
        const g = guiC();
        g.multiLatitudeMode = v;
        if (v && !g._multiLatEdgesCustomized) {
          g.latitudeLeft = g.latitude;
          g.latitudeRight = g.latitude;
          g.longitudeLeft = 0.0;
          g.longitudeRight = 0.0;
          g._multiLatEdgesCustomized = true;
        }
        const f = timeChangeFns();
        if (typeof f.updateSunlight === 'function') f.updateSunlight();
        if (typeof f.uploadClimateUniforms === 'function') f.uploadClimateUniforms();
        refreshSkyTab();
      }, syncArr);

    addCheckboxRow(secTime, 'Latitude-based temperatures', function() { return guiC().latitudeBasedTemperature; },
      function(v) {
        guiC().latitudeBasedTemperature = v;
        const f = timeChangeFns();
        if (typeof f.updateSunlight === 'function') f.updateSunlight();
        if (typeof f.uploadClimateUniforms === 'function') f.uploadClimateUniforms();
      }, syncArr);

    addCheckboxRow(secTime, 'Day / night cycle', function() { return guiC().dayNightCycle; },
      function(v) { guiC().dayNightCycle = v; }, syncArr);

    addCheckboxRow(secTime, 'Realtime (1:1 wall clock)', function() { return guiC().realtimeMode; },
      function(v) {
        guiC().realtimeMode = v;
        const f = timeChangeFns();
        if (v) { if (typeof f.enableRealtimeMode === 'function') f.enableRealtimeMode(); }
        else { if (typeof f.resetRealtimeClockState === 'function') f.resetRealtimeClockState(); }
      }, syncArr);

    addCheckboxRow(secTime, 'Accelerate night', function() { return guiC().accelerateNight; },
      function(v) { guiC().accelerateNight = v; }, syncArr);

    // --- Day Sky ---
    const secDay = sectionEl.querySelector('#shm-sky-sec-day');
    addSkySlider(secDay, 'Day sky hue', 'HSV hue (0-1)', 'dayHue', 0, 1, 0.01);
    addSkySlider(secDay, 'Saturation (horizon)', 'Lower Y = horizon', 'daySatLow', 0, 1, 0.01);
    addSkySlider(secDay, 'Saturation (zenith)', 'Higher Y = top', 'daySatHigh', 0, 1, 0.01);
    addSkySlider(secDay, 'Brightness (horizon)', 'Value at bottom', 'dayValLow', 0, 1, 0.01);
    addSkySlider(secDay, 'Brightness (zenith)', 'Value at top', 'dayValHigh', 0, 1, 0.01);
    addSkySlider(secDay, 'Brightness curve power', 'Steepness of gradient', 'dayValPow', 0.5, 10, 0.1);

    // --- Twilight ---
    const secTwilight = sectionEl.querySelector('#shm-sky-sec-twilight');
    addSkyColor(secTwilight, 'Horizon band', 'twilightHorizon');
    addSkyColor(secTwilight, 'Low sky', 'twilightLow');
    addSkyColor(secTwilight, 'Mid sky', 'twilightMid');
    addSkyColor(secTwilight, 'Upper sky', 'twilightUpper');
    addSkyColor(secTwilight, 'Zenith', 'twilightTop');

    // --- Horizon ---
    const secHorizon = sectionEl.querySelector('#shm-sky-sec-horizon');
    addSkySlider(secHorizon, 'Horizon line Y', 'Normalized screen height', 'horizonLine', 0, 0.15, 0.001);
    addSkyColor(secHorizon, 'Deep red', 'horizonDeepRed');
    addSkyColor(secHorizon, 'Burnt orange', 'horizonBurntOrange');
    addSkyColor(secHorizon, 'Gold', 'horizonGold');
    addSkyColor(secHorizon, 'Pale gold', 'horizonPaleGold');
    addSkySlider(secHorizon, 'Haze mix strength', '', 'hazeMixStrength', 0, 1, 0.01);
    addSkySlider(secHorizon, 'Haze glow strength', '', 'hazeBoostStrength', 0, 1, 0.01);

    // --- Stars ---
    const secStars = sectionEl.querySelector('#shm-sky-sec-stars');
    addGuiSlider(secStars, 'Star visibility', '', 'starVisibility', 0, 1, 0.01, function() { commitSky(); });
    addGuiSlider(secStars, 'Star light emit', '', 'starLightEmitStrength', 0, 0.5, 0.01, function() { commitSky(); });
    addGuiSlider(secStars, 'Star density', '', 'starDensity', 0, 1, 0.01, function() { commitSky(); });

    // --- Effects ---
    const secEffects = sectionEl.querySelector('#shm-sky-sec-effects');
    addSkyColor(secEffects, 'Crepuscular ray color', 'crepuscularColor');
    addSkySlider(secEffects, 'Crepuscular strength', '', 'crepuscularStrength', 0, 1, 0.01);
    addGuiSlider(secEffects, 'Min shadow light', '0 = darkest shadows', 'minShadowLight', 0, 0.2, 0.001, function() {
      if (!guiC().autoMinShadowLight) {
        if (deps && typeof deps.uploadAppearanceUniforms === 'function') deps.uploadAppearanceUniforms();
        commitSky();
      }
    });
    addCheckboxRow(secEffects, 'Auto shadow light', function() { return guiC().autoMinShadowLight; },
      function(v) { guiC().autoMinShadowLight = v; }, syncArr);

    function renderSkySubTabs() {
      subTabsEl.innerHTML = '';
      for (let i = 0; i < SKY_SUB_TABS.length; i++) {
        const tab = SKY_SUB_TABS[i];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shm-subtab' + (tab.id === activeSkySub ? ' active' : '');
        btn.textContent = tab.label;
        btn.onclick = function() {
          activeSkySub = tab.id;
          renderSkySubTabs();
          for (let j = 0; j < SKY_SUB_TABS.length; j++) {
            const sec = sectionEl.querySelector('#shm-sky-sec-' + SKY_SUB_TABS[j].id);
            if (sec) sec.classList.toggle('active', SKY_SUB_TABS[j].id === activeSkySub);
          }
        };
        subTabsEl.appendChild(btn);
      }
    }

    sectionEl.querySelector('#shm-sky-export').onclick = function() {
      const s = skyS();
      const g = guiC();
      const payload = Object.assign({}, s, {
        timeOfDay: g.timeOfDay,
        sunAngle: g.sunAngle,
        month: g.month,
        latitude: g.latitude,
        multiLatitudeMode: g.multiLatitudeMode,
        latitudeLeft: g.latitudeLeft,
        latitudeRight: g.latitudeRight,
        longitudeLeft: g.longitudeLeft,
        longitudeRight: g.longitudeRight,
        latitudeBasedTemperature: g.latitudeBasedTemperature,
        sunIntensity: g.sunIntensity,
        dayNightCycle: g.dayNightCycle,
        realtimeMode: g.realtimeMode,
        accelerateNight: g.accelerateNight,
        starVisibility: g.starVisibility,
        starLightEmitStrength: g.starLightEmitStrength,
        starDensity: g.starDensity,
        minShadowLight: g.minShadowLight,
        autoMinShadowLight: g.autoMinShadowLight,
      });
      sectionEl.querySelector('#shm-sky-io').value = JSON.stringify(payload, null, 2);
    };

    sectionEl.querySelector('#shm-sky-import').onclick = function() {
      try {
        const parsed = JSON.parse(sectionEl.querySelector('#shm-sky-io').value);
        const defaults = (deps && typeof deps.getSkyDefaults === 'function') ? deps.getSkyDefaults() : {};
        const merged = Object.assign({}, defaults, parsed);
        if (deps && typeof deps.setSkySettings === 'function') deps.setSkySettings(merged);
        const g = guiC();
        const guiKeys = ['timeOfDay', 'sunAngle', 'month', 'latitude', 'multiLatitudeMode',
          'latitudeLeft', 'latitudeRight', 'longitudeLeft', 'longitudeRight', 'latitudeBasedTemperature',
          'sunIntensity', 'dayNightCycle', 'realtimeMode', 'accelerateNight', 'starVisibility',
          'starLightEmitStrength', 'starDensity', 'minShadowLight', 'autoMinShadowLight'];
        for (let i = 0; i < guiKeys.length; i++) {
          const k = guiKeys[i];
          if (parsed[k] !== undefined) g[k] = parsed[k];
        }
        if (deps && typeof deps.saveSkySettings === 'function') deps.saveSkySettings();
        if (deps && typeof deps.uploadSkyUniforms === 'function') deps.uploadSkyUniforms();
        const f = timeChangeFns();
        if (typeof f.updateSunlight === 'function') f.updateSunlight();
        if (typeof f.onUpdateTimeOfDaySlider === 'function') f.onUpdateTimeOfDaySlider();
        refreshSkyTab();
      } catch (e) {
        alert('Invalid sky settings JSON: ' + (e.message || e));
      }
    };

    sectionEl.querySelector('#shm-sky-reset').onclick = function() {
      if (!confirm('Reset all sky settings to defaults?')) return;
      if (deps && typeof deps.resetSkySettings === 'function') {
        deps.resetSkySettings();
      } else {
        const defaults = (deps && typeof deps.getSkyDefaults === 'function') ? deps.getSkyDefaults() : {};
        if (deps && typeof deps.setSkySettings === 'function') deps.setSkySettings(defaults);
        if (deps && typeof deps.saveSkySettings === 'function') deps.saveSkySettings();
        if (deps && typeof deps.uploadSkyUniforms === 'function') deps.uploadSkyUniforms();
      }
      refreshSkyTab();
    };

    function refreshSkyTab() {
      for (let i = 0; i < syncArr.length; i++) syncArr[i]();
      updatePreview();
    }

    renderSkySubTabs();
    updatePreview();
    return refreshSkyTab;
  }

  // ---------------------------------------------------------------------
  // Textures tab
  // ---------------------------------------------------------------------

  function buildTexturesTab(sectionEl) {
    sectionEl.innerHTML =
      '<div class="shm-group">' +
        '<div class="shm-group-title">Sky texture</div>' +
        '<div class="shm-tex-card">' +
          '<img class="shm-tex-preview" id="shm-tex-sky-preview" alt="">' +
          '<div class="shm-tex-actions">' +
            '<div class="shm-status" id="shm-tex-sky-status">No custom sky texture</div>' +
            '<input type="file" id="shm-tex-sky-file" accept="image/png,image/jpeg,.png,.jpg" style="display:none">' +
            '<button type="button" class="shm-btn-sm" id="shm-tex-sky-upload">Upload image</button>' +
            '<button type="button" class="shm-btn-sm danger" id="shm-tex-sky-clear">Clear</button>' +
            '<button type="button" class="shm-btn-sm" id="shm-tex-sky-template">Download template</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="shm-group">' +
        '<div class="shm-group-title">Sun texture</div>' +
        '<div class="shm-tex-card">' +
          '<img class="shm-tex-preview" id="shm-tex-sun-preview" alt="">' +
          '<div class="shm-tex-actions">' +
            '<div class="shm-status" id="shm-tex-sun-status">No custom sun texture</div>' +
            '<input type="file" id="shm-tex-sun-file" accept="image/png,image/jpeg,.png,.jpg" style="display:none">' +
            '<button type="button" class="shm-btn-sm" id="shm-tex-sun-upload">Upload image</button>' +
            '<button type="button" class="shm-btn-sm danger" id="shm-tex-sun-clear">Clear</button>' +
            '<button type="button" class="shm-btn-sm" id="shm-tex-sun-template">Download template</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="shm-note">Custom textures are stored in the browser and used in place of the procedural sky/sun. Clearing reverts to the procedural look.</div>';

    function wireSide(prefix, upload, clear, download) {
      const fileInput = sectionEl.querySelector('#shm-tex-' + prefix + '-file');
      const uploadBtn = sectionEl.querySelector('#shm-tex-' + prefix + '-upload');
      const clearBtn = sectionEl.querySelector('#shm-tex-' + prefix + '-clear');
      const templateBtn = sectionEl.querySelector('#shm-tex-' + prefix + '-template');

      uploadBtn.onclick = function() { fileInput.click(); };
      fileInput.onchange = function() {
        const file = this.files && this.files[0];
        this.value = '';
        const tex = textures();
        if (!file || !tex) return;
        upload(tex, file).then(function() {
          refreshTexturesTab();
        }).catch(function(e) {
          alert(e.message || String(e));
        });
      };
      clearBtn.onclick = function() {
        const tex = textures();
        if (tex) clear(tex);
        refreshTexturesTab();
      };
      templateBtn.onclick = function() {
        const tex = textures();
        if (tex) download(tex);
      };
    }

    wireSide('sky',
      function(tex, file) { return tex.processSkyUpload(file); },
      function(tex) { tex.clearSky(); },
      function(tex) { tex.downloadSkyTemplate(); });
    wireSide('sun',
      function(tex, file) { return tex.processSunUpload(file); },
      function(tex) { tex.clearSun(); },
      function(tex) { tex.downloadSunTemplate(); });

    function refreshTexturesTab() {
      const tex = textures();
      const skyPrev = sectionEl.querySelector('#shm-tex-sky-preview');
      const skyStatus = sectionEl.querySelector('#shm-tex-sky-status');
      const sunPrev = sectionEl.querySelector('#shm-tex-sun-preview');
      const sunStatus = sectionEl.querySelector('#shm-tex-sun-status');

      if (tex && tex.hasSky()) {
        skyPrev.src = tex.getSkyDataUrl();
        skyPrev.style.display = 'block';
        skyStatus.textContent = 'Custom sky texture loaded';
        skyStatus.className = 'shm-status ok';
      } else {
        skyPrev.removeAttribute('src');
        skyPrev.style.display = 'none';
        skyStatus.textContent = 'No custom sky texture';
        skyStatus.className = 'shm-status';
      }

      if (tex && tex.hasSun()) {
        sunPrev.src = tex.getSunDataUrl();
        sunPrev.style.display = 'block';
        sunStatus.textContent = 'Custom sun texture loaded';
        sunStatus.className = 'shm-status ok';
      } else {
        sunPrev.removeAttribute('src');
        sunPrev.style.display = 'none';
        sunStatus.textContent = 'No custom sun texture';
        sunStatus.className = 'shm-status';
      }
    }

    refreshTexturesTab();
    return refreshTexturesTab;
  }

  // ---------------------------------------------------------------------
  // Custom Shaders (GLSL) tab
  // ---------------------------------------------------------------------

  function buildGlslTab(sectionEl) {
    let stageOptions = '';
    for (let i = 0; i < SHADER_STAGES.length; i++) {
      stageOptions += '<option value="' + SHADER_STAGES[i].id + '">' + SHADER_STAGES[i].label + '</option>';
    }
    sectionEl.innerHTML =
      '<div class="shm-row">' +
        '<div class="shm-lbl">Stage</div>' +
        '<select class="shm-inp" id="shm-glsl-stage" style="width:170px;">' + stageOptions + '</select>' +
      '</div>' +
      '<textarea class="shm-glsl-area" id="shm-glsl-src" spellcheck="false"></textarea>' +
      '<div class="shm-footer">' +
        '<button type="button" class="shm-footer-btn io" id="shm-glsl-stock">Load stock template</button>' +
        '<button type="button" class="shm-footer-btn primary" id="shm-glsl-apply">Compile &amp; Apply</button>' +
        '<button type="button" class="shm-footer-btn reset" id="shm-glsl-revert">Revert to stock</button>' +
      '</div>' +
      '<pre class="shm-log ok" id="shm-glsl-log">No errors.</pre>' +
      '<div class="shm-note">Only look-stage shaders (post-processing, sky background, realistic display) can be edited here. Core weather physics simulation shaders are locked and cannot be modified.</div>';

    const stageSel = sectionEl.querySelector('#shm-glsl-stage');
    const srcArea = sectionEl.querySelector('#shm-glsl-src');
    const logEl = sectionEl.querySelector('#shm-glsl-log');

    function currentStage() { return stageSel.value; }

    function setLog(msg) {
      if (!msg) {
        logEl.textContent = 'No errors.';
        logEl.className = 'shm-log ok';
      } else {
        logEl.textContent = msg;
        logEl.className = 'shm-log';
      }
    }

    function loadCurrentIntoTextarea() {
      const rt = runtime();
      const stage = currentStage();
      if (rt && rt.hasCustom(stage)) {
        srcArea.value = rt.getEditedSource(stage) || '';
        setLog(rt.getCompileLog(stage));
        return;
      }
      if (deps && typeof deps.getStockShaderSource === 'function') {
        deps.getStockShaderSource(stage).then(function(src) {
          srcArea.value = src || '';
          setLog(null);
        }).catch(function(e) {
          setLog(e.message || String(e));
        });
      } else {
        srcArea.value = '';
        setLog(null);
      }
    }

    stageSel.onchange = loadCurrentIntoTextarea;

    sectionEl.querySelector('#shm-glsl-stock').onclick = function() {
      if (!deps || typeof deps.getStockShaderSource !== 'function') return;
      deps.getStockShaderSource(currentStage()).then(function(src) {
        srcArea.value = src || '';
        setLog(null);
      }).catch(function(e) {
        setLog(e.message || String(e));
      });
    };

    sectionEl.querySelector('#shm-glsl-apply').onclick = function() {
      const stage = currentStage();
      const src = srcArea.value;
      const rt = runtime();
      if (rt) {
        rt.setEditedSource(stage, src);
        rt.applyStage(stage).then(function(result) {
          if (result && result.ok) {
            setLog('Compiled OK. Reload the page to apply custom shaders to the live view.');
            if (confirm('Custom shader compiled. Reload now to apply?'))
              location.reload();
          } else {
            setLog((result && result.error) || 'Unknown compile error');
          }
        }).catch(function(e) {
          setLog(e.message || String(e));
        });
      } else if (deps && typeof deps.recompileStage === 'function') {
        deps.recompileStage(stage, src).then(function(result) {
          if (result && result.ok) {
            setLog('Compiled OK. Reload the page to apply.');
            if (confirm('Custom shader compiled. Reload now to apply?'))
              location.reload();
          } else {
            setLog((result && result.error) || 'Unknown compile error');
          }
        }).catch(function(e) {
          setLog(e.message || String(e));
        });
      } else {
        setLog('No shader runtime available');
      }
    };

    sectionEl.querySelector('#shm-glsl-revert').onclick = function() {
      const stage = currentStage();
      const rt = runtime();
      if (!rt) { setLog('No shader runtime available'); return; }
      rt.clearEditedSource(stage);
      setLog('Reverted to stock. Reload the page to restore the default shader.');
      if (confirm('Stock shader restored in storage. Reload now?'))
        location.reload();
      loadCurrentIntoTextarea();
    };

    loadCurrentIntoTextarea();

    return function refreshGlslTab() {
      const rt = runtime();
      if (rt) setLog(rt.getCompileLog(currentStage()));
    };
  }

  // ---------------------------------------------------------------------
  // Apply pack helper
  // ---------------------------------------------------------------------

  async function applyPack(pack) {
    if (!pack) return;
    try {
      if (pack.appearance && deps && typeof deps.applyAppearanceFromPack === 'function') {
        deps.applyAppearanceFromPack(pack.appearance);
      }

      const p = packsApi();
      if (pack.cloudsRain && deps && typeof deps.setCloudsRain === 'function') {
        const merged = p ? p.mergeCloudsRain(pack.cloudsRain) : pack.cloudsRain;
        deps.setCloudsRain(merged);
      }

      if (pack.sky && deps && typeof deps.getSkySettings === 'function' && typeof deps.setSkySettings === 'function') {
        const merged = Object.assign({}, deps.getSkySettings(), pack.sky);
        deps.setSkySettings(merged);
        if (typeof deps.saveSkySettings === 'function') deps.saveSkySettings();
        if (typeof deps.uploadSkyUniforms === 'function') deps.uploadSkyUniforms();
      }

      const tex = textures();
      if (pack.textures && tex) {
        if (pack.textures.sky) await tex.loadSkyFromDataUrl(pack.textures.sky);
        if (pack.textures.sun) await tex.loadSunFromDataUrl(pack.textures.sun);
      }

      const rt = runtime();
      if (pack.shaders && rt) {
        const stages = ['post', 'sky', 'realistic'];
        for (let i = 0; i < stages.length; i++) {
          const stage = stages[i];
          const src = pack.shaders[stage];
          if (src) {
            rt.setEditedSource(stage, src);
            await rt.applyStage(stage);
          }
        }
      }
    } catch (e) {
      console.error('ShaderMenu: failed to apply pack', e);
    }
    refreshShaderMenu();
  }

  // ---------------------------------------------------------------------
  // Top-level tabs + build/open/close/refresh
  // ---------------------------------------------------------------------

  function renderTopTabs() {
    const tabsEl = panel.querySelector('#shm-tabs');
    tabsEl.innerHTML = '';
    for (let i = 0; i < TAB_DEFS.length; i++) {
      const tab = TAB_DEFS[i];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'shm-tab' + (tab.id === activeTab ? ' active' : '');
      btn.textContent = tab.label;
      btn.onclick = function() { setActiveTab(tab.id); };
      tabsEl.appendChild(btn);
    }
  }

  function setActiveTab(id) {
    let found = false;
    for (let i = 0; i < TAB_DEFS.length; i++) {
      if (TAB_DEFS[i].id === id) { found = true; break; }
    }
    if (!found) return;
    activeTab = id;
    renderTopTabs();
    for (let i = 0; i < TAB_DEFS.length; i++) {
      const sec = panel.querySelector('#shm-sec-' + TAB_DEFS[i].id);
      if (sec) sec.classList.toggle('active', TAB_DEFS[i].id === activeTab);
    }
    if (typeof tabRefreshers[activeTab] === 'function') tabRefreshers[activeTab]();
  }

  function buildShaderMenu(hostDeps) {
    if (panel) {
      if (hostDeps) deps = hostDeps;
      return panel;
    }
    deps = hostDeps || {};
    ensureStyles();

    panel = document.createElement('div');
    panel.id = 'shaderMenuPanel';
    panel.innerHTML =
      '<div class="shm-hdr"><span>Shader Menu</span>' +
        '<button type="button" class="shm-close" title="Close">X</button></div>' +
      '<div class="shm-body">' +
        '<div class="shm-tabs" id="shm-tabs"></div>' +
        '<div class="shm-section active" id="shm-sec-packs"></div>' +
        '<div class="shm-section" id="shm-sec-look"></div>' +
        '<div class="shm-section" id="shm-sec-clouds"></div>' +
        '<div class="shm-section" id="shm-sec-sky"></div>' +
        '<div class="shm-section" id="shm-sec-textures"></div>' +
        '<div class="shm-section" id="shm-sec-glsl"></div>' +
      '</div>';
    document.body.appendChild(panel);
    makeDraggable(panel, '.shm-hdr');
    panel.querySelector('.shm-close').onclick = function() { closeShaderMenu(); };

    tabRefreshers.packs = buildPacksTab(panel.querySelector('#shm-sec-packs'));
    tabRefreshers.look = buildLookTab(panel.querySelector('#shm-sec-look'));
    tabRefreshers.clouds = buildCloudsTab(panel.querySelector('#shm-sec-clouds'));
    tabRefreshers.sky = buildSkyTab(panel.querySelector('#shm-sec-sky'));
    tabRefreshers.textures = buildTexturesTab(panel.querySelector('#shm-sec-textures'));
    tabRefreshers.glsl = buildGlslTab(panel.querySelector('#shm-sec-glsl'));

    renderTopTabs();
    return panel;
  }

  function openShaderMenu(tabIdOptional) {
    if (!panel) {
      console.warn('ShaderMenu: buildShaderMenu(deps) must be called before openShaderMenu().');
      return;
    }
    if (tabIdOptional) setActiveTab(tabIdOptional);
    refreshShaderMenu();
    panel.style.display = 'block';
  }

  function closeShaderMenu() {
    if (panel) panel.style.display = 'none';
  }

  function refreshShaderMenu() {
    if (!panel) return;
    for (const key in tabRefreshers) {
      if (Object.prototype.hasOwnProperty.call(tabRefreshers, key) && typeof tabRefreshers[key] === 'function') {
        tabRefreshers[key]();
      }
    }
  }

  function isBuilt() {
    return !!panel;
  }

  const api = {
    buildShaderMenu: buildShaderMenu,
    openShaderMenu: openShaderMenu,
    closeShaderMenu: closeShaderMenu,
    refreshShaderMenu: refreshShaderMenu,
    isBuilt: isBuilt,
  };

  global.ShaderMenu = global.ShaderMenu || {};
  global.ShaderMenu.menu = api;
})(typeof window !== 'undefined' ? window : this);
