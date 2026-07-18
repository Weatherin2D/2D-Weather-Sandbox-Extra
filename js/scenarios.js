/**
 * Lightweight scenario packs — terrain + synoptic placeables + GUI presets.
 */
(function (global) {
  'use strict';

  let catalog = null;
  let loadPromise = null;

  function findSurfaceY(x) {
    if (typeof findSimYposAboveSurfaceAtX === 'function') {
      const y = findSimYposAboveSurfaceAtX(x);
      if (y !== undefined && Number.isFinite(y)) return y;
    }
    return Math.max(1, Math.floor(sim_res_y * 0.08));
  }

  async function loadCatalog() {
    if (catalog) return catalog;
    if (loadPromise) return loadPromise;
    loadPromise = fetch('scenarios/packs.json')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load scenarios/packs.json (' + r.status + ')');
        return r.json();
      })
      .then((data) => {
        catalog = data;
        return catalog;
      })
      .catch((e) => {
        loadPromise = null;
        throw e;
      });
    return loadPromise;
  }

  function listPacks() {
    return catalog && Array.isArray(catalog.packs) ? catalog.packs.slice() : [];
  }

  function applyGuiPreset(gui) {
    if (!gui || !guiControls) return;
    const keys = Object.keys(gui);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (guiControls[k] !== undefined)
        guiControls[k] = gui[k];
    }
    if (gui.displaySynopticSystems !== undefined)
      displaySynopticSystems = !!gui.displaySynopticSystems;
    if (gui.displayDrylines !== undefined && window.WeatherSandbox && window.WeatherSandbox.synopticBoundaries)
      window.WeatherSandbox.synopticBoundaries.setDisplayDrylines(gui.displayDrylines);
    if (gui.displaySeaBreezes !== undefined && window.WeatherSandbox && window.WeatherSandbox.synopticBoundaries)
      window.WeatherSandbox.synopticBoundaries.setDisplaySeaBreezes(gui.displaySeaBreezes);
    if (typeof datGui !== 'undefined' && datGui && datGui.updateDisplay)
      datGui.updateDisplay();
  }

  function clearPlaceables() {
    while (typeof synopticSystems !== 'undefined' && synopticSystems.length)
      synopticSystems[0].destroy();
    if (window.WeatherSandbox && window.WeatherSandbox.synopticBoundaries) {
      window.WeatherSandbox.synopticBoundaries.destroyAllDrylines();
      window.WeatherSandbox.synopticBoundaries.destroyAllSeaBreezes();
    }
  }

  function placeFromPack(pack) {
    const sb = window.WeatherSandbox && window.WeatherSandbox.synopticBoundaries;

    if (Array.isArray(pack.synoptic) && typeof SynopticSystem === 'function') {
      for (let i = 0; i < pack.synoptic.length; i++) {
        const e = pack.synoptic[i];
        const x = Math.floor(clamp((e.xFrac != null ? e.xFrac : 0.5) * sim_res_x, 0, sim_res_x - 1));
        const y = findSurfaceY(x);
        const type = e.type === 1 ? 1 : 0;
        const sys = new SynopticSystem(x, y, type);
        sys.setSettings({
          type,
          radius: e.radius != null ? e.radius : 180,
          strength: e.strength != null ? e.strength : 1.0,
        });
        synopticSystems.push(sys);
      }
      if (typeof finalizeLoadedSynopticSystems === 'function')
        finalizeLoadedSynopticSystems();
      displaySynopticSystems = true;
      if (guiControls) guiControls.displaySynopticSystems = true;
    }

    if (sb && Array.isArray(pack.drylines)) {
      for (let i = 0; i < pack.drylines.length; i++) {
        const e = pack.drylines[i];
        const x = Math.floor(clamp((e.xFrac != null ? e.xFrac : 0.5) * sim_res_x, 0, sim_res_x - 1));
        const y = findSurfaceY(x);
        const d = sb.placeDryline(x, y);
        if (d) d.setSettings(e);
      }
    }

    if (sb && Array.isArray(pack.seaBreezes)) {
      for (let i = 0; i < pack.seaBreezes.length; i++) {
        const e = pack.seaBreezes[i];
        const x = Math.floor(clamp((e.xFrac != null ? e.xFrac : 0.5) * sim_res_x, 0, sim_res_x - 1));
        const y = findSurfaceY(x);
        const s = sb.placeSeaBreeze(x, y);
        if (s) s.setSettings(e);
      }
    }
  }

  async function applyPack(packOrId) {
    if (typeof SETUP_MODE !== 'undefined' && SETUP_MODE)
      throw new Error('Start the simulation before loading a scenario');

    const data = await loadCatalog();
    let pack = packOrId;
    if (typeof packOrId === 'string') {
      pack = (data.packs || []).find((p) => p.id === packOrId);
      if (!pack) throw new Error('Unknown scenario: ' + packOrId);
    }
    if (!pack || !pack.id) throw new Error('Invalid scenario pack');

    clearPlaceables();
    applyGuiPreset(pack.gui);

    if (pack.terrain && window.WeatherSandbox && window.WeatherSandbox.terrainGen) {
      await window.WeatherSandbox.terrainGen.applyTerrain(pack.terrain);
    }

    if (pack.resetAtmosphere && typeof resetAtmosphereKeepTerrain === 'function')
      resetAtmosphereKeepTerrain();

    placeFromPack(pack);
    return pack;
  }

  async function promptAndLoad() {
    try {
      const data = await loadCatalog();
      const packs = data.packs || [];
      if (!packs.length) {
        alert('No scenario packs found.');
        return;
      }
      const lines = packs.map((p, i) => (i + 1) + '. ' + p.name + ' — ' + (p.description || '')).join('\n');
      const choice = prompt('Load scenario pack:\n\n' + lines + '\n\nEnter number (1–' + packs.length + '):', '1');
      if (choice === null) return;
      const idx = parseInt(choice, 10) - 1;
      if (!Number.isFinite(idx) || idx < 0 || idx >= packs.length) {
        alert('Invalid choice');
        return;
      }
      if (!confirm('Load “' + packs[idx].name + '”? This replaces terrain and placeable synoptic tools.'))
        return;
      const pack = await applyPack(packs[idx]);
      alert('Loaded scenario: ' + pack.name);
    } catch (e) {
      console.error(e);
      alert('Scenario load failed: ' + (e && e.message ? e.message : e));
    }
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.scenarios = {
    loadCatalog,
    listPacks,
    applyPack,
    promptAndLoad,
  };
})(typeof window !== 'undefined' ? window : globalThis);
