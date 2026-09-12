/**
 * dat.GUI settings search + import/export.
 * Presentation / UX only — does not change fluid dynamics by itself.
 */
(function (global) {
  'use strict';

  var FORMAT = 'weather-sandbox-settings';
  var VERSION = 1;
  var searchState = {
    gui: null,
    input: null,
    wrap: null,
    status: null,
    query: '',
  };

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function controllerLabel(controller) {
    if (!controller) return '';
    try {
      if (controller.__li) {
        var nameEl = controller.__li.querySelector('.property-name');
        if (nameEl && nameEl.textContent)
          return String(nameEl.textContent).trim();
      }
    } catch (e) { /* ignore */ }
    return String(controller.property || '');
  }

  function walkGui(gui, visitController, visitFolder) {
    if (!gui) return;
    if (gui.__controllers) {
      for (var i = 0; i < gui.__controllers.length; i++)
        visitController(gui.__controllers[i], gui);
    }
    if (gui.__folders) {
      var folders = Array.isArray(gui.__folders)
        ? gui.__folders
        : Object.keys(gui.__folders).map(function (k) { return gui.__folders[k]; });
      for (var f = 0; f < folders.length; f++) {
        var folder = folders[f];
        if (!folder) continue;
        if (visitFolder) visitFolder(folder, gui);
        walkGui(folder, visitController, visitFolder);
      }
    }
  }

  function setLiVisible(li, visible) {
    if (!li || !li.style) return;
    li.style.display = visible ? '' : 'none';
  }

  function openFolder(folder) {
    if (!folder) return;
    try {
      if (folder.closed) folder.open();
    } catch (e) { /* ignore */ }
  }

  function applySearch(query) {
    var gui = searchState.gui;
    if (!gui) return;
    var q = String(query || '').trim().toLowerCase();
    searchState.query = q;

    if (!q) {
      walkGui(gui, function (controller) {
        setLiVisible(controller && controller.__li, true);
      }, function (folder) {
        setLiVisible(folder && folder.__ul && folder.__ul.parentElement, true);
        // Leave folder open/closed state alone when clearing search.
      });
      // Also show folder title rows (parent <li> of folder ul)
      walkGui(gui, function () {}, function (folder) {
        if (folder && folder.__ul && folder.__ul.parentElement)
          setLiVisible(folder.__ul.parentElement, true);
      });
      if (searchState.status)
        searchState.status.textContent = '';
      return;
    }

    var matchCount = 0;
    var folderHasMatch = new Map();

    function markAncestors(folder) {
      var cur = folder;
      while (cur) {
        folderHasMatch.set(cur, true);
        cur = cur.parent || cur.__parent || null;
      }
    }

    walkGui(gui, function (controller, parent) {
      var label = controllerLabel(controller).toLowerCase();
      var prop = String(controller.property || '').toLowerCase();
      var hit = label.indexOf(q) >= 0 || prop.indexOf(q) >= 0;
      setLiVisible(controller && controller.__li, hit);
      if (hit) {
        matchCount++;
        markAncestors(parent);
      }
    }, function () {});

    walkGui(gui, function () {}, function (folder) {
      var title = '';
      try {
        if (folder.__ul && folder.__ul.parentElement) {
          var nameEl = folder.__ul.parentElement.querySelector('.title');
          if (nameEl) title = String(nameEl.textContent || '').trim().toLowerCase();
        }
      } catch (e) { /* ignore */ }
      var nameHit = title.indexOf(q) >= 0;
      if (nameHit) {
        folderHasMatch.set(folder, true);
        markAncestors(folder.parent || folder.__parent || null);
      }
      var show = folderHasMatch.get(folder) || nameHit;
      if (folder && folder.__ul && folder.__ul.parentElement)
        setLiVisible(folder.__ul.parentElement, !!show);
      if (show)
        openFolder(folder);
    });

    if (searchState.status)
      searchState.status.textContent = matchCount
        ? (matchCount + ' match' + (matchCount === 1 ? '' : 'es'))
        : 'No matches';
  }

  function detachSearch() {
    if (searchState.wrap && searchState.wrap.parentNode)
      searchState.wrap.parentNode.removeChild(searchState.wrap);
    searchState.gui = null;
    searchState.input = null;
    searchState.wrap = null;
    searchState.status = null;
    searchState.query = '';
  }

  function attachSearch(gui) {
    detachSearch();
    if (!gui || !gui.domElement || typeof document === 'undefined') return;

    var wrap = document.createElement('div');
    wrap.className = 'ws-gui-search';
    wrap.innerHTML =
      '<input type="search" class="ws-gui-search-input" placeholder="Search settings…" autocomplete="off" spellcheck="false">' +
      '<span class="ws-gui-search-status" aria-live="polite"></span>';

    var input = wrap.querySelector('.ws-gui-search-input');
    var status = wrap.querySelector('.ws-gui-search-status');

    // Insert above the controller list inside the main GUI.
    var root = gui.domElement;
    if (root.firstChild)
      root.insertBefore(wrap, root.firstChild);
    else
      root.appendChild(wrap);

    var timer = null;
    input.addEventListener('input', function () {
      var value = input.value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { applySearch(value); }, 80);
    });
    input.addEventListener('keydown', function (ev) {
      // Keep typing from triggering global sim keybinds.
      ev.stopPropagation();
      if (ev.key === 'Escape') {
        input.value = '';
        applySearch('');
        input.blur();
      }
    });

    searchState.gui = gui;
    searchState.input = input;
    searchState.wrap = wrap;
    searchState.status = status;
  }

  function serializeSettings(guiControls, defaults) {
    var src = guiControls || {};
    var out = {};
    var keys = {};
    var k;
    if (defaults && typeof defaults === 'object') {
      for (k in defaults) {
        if (Object.prototype.hasOwnProperty.call(defaults, k))
          keys[k] = true;
      }
    }
    for (k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k))
        keys[k] = true;
    }
    for (k in keys) {
      if (!Object.prototype.hasOwnProperty.call(keys, k)) continue;
      var v = src[k];
      if (typeof v === 'function') continue;
      if (v === undefined) continue;
      // Skip DOM / non-JSON values
      if (typeof v === 'symbol') continue;
      try {
        out[k] = JSON.parse(JSON.stringify(v));
      } catch (e) {
        // skip non-serializable
      }
    }
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      settings: out,
    };
  }

  function stampFilename() {
    var d = new Date();
    function pad(n) { return String(n).padStart(2, '0'); }
    return 'weather-sandbox-settings-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
      + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.json';
  }

  function downloadJson(obj) {
    var text = JSON.stringify(obj, null, 2);
    var blob = new Blob([text], { type: 'application/json' });
    if (global.WeatherSandbox && global.WeatherSandbox.utils && global.WeatherSandbox.utils.download)
      global.WeatherSandbox.utils.download(stampFilename(), blob);
    else if (typeof global.download === 'function')
      global.download(stampFilename(), blob);
    else {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = stampFilename();
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 1000);
    }
  }

  function exportSettings(guiControls, defaults) {
    downloadJson(serializeSettings(guiControls, defaults));
  }

  function normalizeImported(raw) {
    if (!raw || typeof raw !== 'object')
      throw new Error('Invalid settings file');
    var settings = raw.settings;
    if (!settings && raw.format !== FORMAT && isPlainObject(raw)) {
      // Allow bare guiControls dumps.
      settings = raw;
    }
    if (!isPlainObject(settings))
      throw new Error('Settings payload missing');
    var cleaned = {};
    for (var k in settings) {
      if (!Object.prototype.hasOwnProperty.call(settings, k)) continue;
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      var v = settings[k];
      if (typeof v === 'function') continue;
      cleaned[k] = v;
    }
    return cleaned;
  }

  function importSettings(hooks) {
    hooks = hooks || {};
    if (typeof document === 'undefined') return;
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      document.body.removeChild(input);
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var text = String(reader.result || '');
          if (text.length > (global.WeatherSandbox && global.WeatherSandbox.utils
            ? global.WeatherSandbox.utils.MAX_IMPORT_JSON_CHARS : 2 * 1024 * 1024)) {
            throw new Error('Settings file too large');
          }
          var parsed = typeof global.safeJsonParse === 'function'
            ? global.safeJsonParse(text)
            : JSON.parse(text);
          var settings = normalizeImported(parsed);
          if (typeof hooks.onImport === 'function')
            hooks.onImport(settings);
        } catch (err) {
          console.error('Settings import failed:', err);
          alert('Could not import settings: ' + (err && err.message ? err.message : err));
        }
      };
      reader.onerror = function () {
        alert('Could not read settings file');
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function attach(gui) {
    attachSearch(gui);
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.guiSettings = {
    attach: attach,
    detachSearch: detachSearch,
    applySearch: applySearch,
    exportSettings: exportSettings,
    importSettings: importSettings,
    serializeSettings: serializeSettings,
    FORMAT: FORMAT,
    VERSION: VERSION,
  };
})(typeof window !== 'undefined' ? window : globalThis);
