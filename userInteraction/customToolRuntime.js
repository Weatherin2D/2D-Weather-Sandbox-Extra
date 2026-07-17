/**
 * Compile custom tool scripts and map evaluated effects onto GPU brush passes / CPU cells.
 */
(function(global) {
  'use strict';

  const TERRAIN_TO_INPUT = {
    none: null,
    land: 11,
    fresh: 12,
    sea: 24,
    iceSheet: 25,
    iceCap: 26,
    fire: 13,
    urban: 14,
    suburban: 17,
    runway: 15,
    industrial: 16,
  };

  const SURFACE_KIND_TO_UNIFORM = {
    land: 0,
    custom: 0,
    fresh: 1,
    sea: 2,
    iceSheet: 3,
    iceCap: 4,
  };

  const CUSTOM_BASE_INPUT = 29;
  const CUSTOM_OVERLAY_INPUT = 30;

  const compiledCache = new Map();

  function lang() {
    return global.UserInteraction && global.UserInteraction.lang;
  }

  function registry() {
    return global.UserInteraction && global.UserInteraction.registry;
  }

  function cacheKey(toolId, script) {
    return toolId + '::' + JSON.stringify(script);
  }

  function compileScript(tool) {
    const L = lang();
    if (!L || !tool || !tool.script) return null;
    const key = cacheKey(tool.id, tool.script);
    if (compiledCache.has(key)) return compiledCache.get(key);

    const effects = {};
    const keys = (registry() && registry().EFFECT_KEYS) || Object.keys(tool.script.effects || {});
    try {
      const when = L.compile(tool.script.when != null ? tool.script.when : 'true');
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const src = tool.script.effects[k];
        let effectSrc = src != null ? src : (k === 'terrain' ? '"none"' : '0');
        if (k === 'terrain') {
          const bare = String(effectSrc).trim();
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bare))
            effectSrc = '"' + bare + '"';
        }
        effects[k] = L.compile(effectSrc);
      }
      const compiled = { when: when, effects: effects, error: null };
      compiledCache.set(key, compiled);
      return compiled;
    } catch (e) {
      const compiled = { when: null, effects: null, error: e.message || String(e) };
      compiledCache.set(key, compiled);
      return compiled;
    }
  }

  function invalidate(toolId) {
    if (!toolId) { compiledCache.clear(); return; }
    for (const key of compiledCache.keys()) {
      if (key.startsWith(toolId + '::')) compiledCache.delete(key);
    }
  }

  function validateToolScript(script) {
    const L = lang();
    if (!L) return { ok: false, error: 'Expression language not loaded' };
    const errors = [];
    const whenCheck = L.validate(script && script.when != null ? script.when : 'true');
    if (!whenCheck.ok) errors.push('when: ' + whenCheck.error);
    const effects = (script && script.effects) || {};
    const keys = (registry() && registry().EFFECT_KEYS) || Object.keys(effects);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const src = effects[k] != null ? effects[k] : (k === 'terrain' ? '"none"' : '0');
      const check = L.validate(src);
      if (!check.ok) errors.push(k + ': ' + check.error);
    }
    return errors.length ? { ok: false, error: errors.join('; ') } : { ok: true, error: null };
  }

  function defaultContext() {
    return {
      temp: 0,
      vapor: 0,
      smoke: 0,
      windX: 0,
      windY: 0,
      charge: 0,
      isLand: 1,
      isWater: 0,
      isFresh: 0,
      isIce: 0,
      isUrban: 0,
      soilMoisture: 0,
      snow: 0,
      veg: 0,
      vegGrass: 0,
      vegForest: 0,
      onFire: 0,
      intensity: 0.01,
      brushRadius: 10,
      invert: 0,
      dt: 1,
      x: 0,
      y: 0,
      dist: 0,
      param: {},
      terrain: 'none',
    };
  }

  function buildContext(overrides) {
    const ctx = defaultContext();
    if (!overrides) return ctx;
    for (const k of Object.keys(overrides)) {
      if (k === 'param' && overrides.param && typeof overrides.param === 'object') {
        ctx.param = Object.assign({}, overrides.param);
      } else {
        ctx[k] = overrides[k];
      }
    }
    return ctx;
  }

  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0 && Number.isFinite(v);
    if (typeof v === 'string') return v.length > 0 && v !== 'none' && v !== 'false';
    return !!v;
  }

  function evaluateEffects(tool, contextOverrides) {
    const compiled = compileScript(tool);
    if (!compiled || compiled.error || !compiled.when)
      return { ok: false, error: (compiled && compiled.error) || 'Compile failed', effects: null };

    const reg = registry();
    const paramValues = reg ? reg.getParamValues(tool) : {};
    const ctx = buildContext(Object.assign({}, contextOverrides, {
      param: Object.assign({}, paramValues, (contextOverrides && contextOverrides.param) || {}),
    }));

    try {
      if (!truthy(compiled.when.eval(ctx)))
        return { ok: true, skipped: true, effects: null };
      const out = {};
      for (const k of Object.keys(compiled.effects)) {
        out[k] = compiled.effects[k].eval(ctx);
      }
      return { ok: true, skipped: false, effects: out, ctx: ctx };
    } catch (e) {
      return { ok: false, error: e.message || String(e), effects: null };
    }
  }

  function terrainToInputType(terrain) {
    if (terrain == null) return null;
    const key = String(terrain).trim();
    if (Object.prototype.hasOwnProperty.call(TERRAIN_TO_INPUT, key))
      return TERRAIN_TO_INPUT[key];
    return null;
  }

  /**
   * Convert evaluated effects into sequenced GPU brush payloads.
   * Shared fields (x,y,brushSize,wrap,invertTool,move) come from baseBrush.
   */
  function effectsToBrushPasses(effects, baseBrush, options) {
    if (!effects || !baseBrush) return [];
    const opts = options || {};
    const passes = [];
    const base = {
      x: baseBrush.x,
      y: baseBrush.y,
      brushSize: baseBrush.brushSize,
      wrap: !!baseBrush.wrap,
      invertTool: !!baseBrush.invertTool,
      moveX: baseBrush.moveX || 0,
      moveY: baseBrush.moveY || 0,
      active: true,
      customSlot: opts.customSlot != null ? opts.customSlot : 0,
      surfaceKind: opts.surfaceKindUniform != null ? opts.surfaceKindUniform : 0,
    };

    function addPass(inputType, intensity, extra) {
      if (inputType == null || inputType < 0) return;
      if (!Number.isFinite(+intensity) || +intensity === 0) return;
      passes.push(Object.assign({}, base, extra || {}, {
        inputType: inputType,
        intensity: +intensity,
      }));
    }

    // Terrain-mode primary paint
    if (opts.terrainMode) {
      const mag = Math.max(0.01, Math.abs(+baseBrush.intensity || 0.01));
      if (opts.terrainRole === 'overlay') {
        if (opts.useCustomWall)
          addPass(CUSTOM_OVERLAY_INPUT, mag);
        else
          addPass(14, mag); // urban fallback
      } else {
        // Build mountains/terrain with the proven builtin wall brush first.
        const sk = opts.surfaceKind || 'land';
        const mapped = terrainToInputType(sk === 'custom' ? 'land' : sk);
        if (mapped != null) addPass(mapped, mag);
      }
    } else {
      const terrainType = terrainToInputType(effects.terrain);
      if (terrainType != null)
        addPass(terrainType, Math.max(0.01, Math.abs(+baseBrush.intensity || 0.01)));
    }

    addPass(1, effects.temperature);
    addPass(2, effects.vapor);
    addPass(3, effects.smoke);
    addPass(23, effects.charge);
    addPass(20, effects.soilMoisture);
    addPass(21, effects.snow);
    // Grass/forest on the builtin land surface (before custom type stamp).
    if (!(opts.terrainMode && opts.terrainRole === 'overlay')) {
      addPass(27, effects.grass);
      addPass(28, effects.forest);
      const friction = +effects.friction;
      if (Number.isFinite(friction) && friction > 0.001) {
        if (friction >= 0.45)
          addPass(28, friction * Math.max(0.01, Math.abs(+baseBrush.intensity || 0.01)));
        else
          addPass(27, friction * Math.max(0.01, Math.abs(+baseBrush.intensity || 0.01)));
      }
    }
    // Stamp custom type + atlas slot last so VEGETATION from forest/grass is kept
    // (atlas slot is encoded in TYPE, not VEGETATION).
    if (opts.terrainMode && opts.terrainRole !== 'overlay' && opts.useCustomWall) {
      const mag = Math.max(0.01, Math.abs(+baseBrush.intensity || 0.01));
      addPass(CUSTOM_BASE_INPUT, mag);
    }

    const windX = +effects.windX || 0;
    const windY = +effects.windY || 0;
    if (windX !== 0 || windY !== 0) {
      addPass(4, Math.max(0.01, Math.abs(+baseBrush.intensity || 0.01)), {
        moveX: windX * 0.02,
        moveY: windY * 0.02,
      });
    }

    return passes;
  }

  function computeCustomBrush(tool, simX, simY, moveX, moveY, painting, gui) {
    if (!painting || !tool || tool.builtin) {
      return { inputType: -1, active: false, passes: [] };
    }
    // Place tools do not paint
    if (tool.mode === 'place') {
      return { inputType: -1, active: false, passes: [] };
    }

    let intensity = gui && gui.brushIntensity != null ? gui.brushIntensity : 0.01;
    let posXinSim;
    if (gui && gui.wholeWidth)
      posXinSim = -1.0;
    else if (gui && gui.wrapHorizontally)
      posXinSim = ((simX % 1) + 1) % 1;
    else
      posXinSim = Math.min(1, Math.max(0, simX));

    const baseBrush = {
      x: posXinSim,
      y: simY,
      intensity: intensity,
      brushSize: (gui && gui.brushSize) || 20,
      moveX: moveX || 0,
      moveY: moveY || 0,
      wrap: !!(gui && gui.wrapHorizontally),
      invertTool: !!(gui && gui.invertTool),
      active: true,
    };

    const paramValues = registry() ? registry().getParamValues(tool) : {};
    const evaluated = evaluateEffects(tool, {
      intensity: intensity,
      brushRadius: baseBrush.brushSize * 0.5,
      invert: baseBrush.invertTool ? 1 : 0,
      x: posXinSim,
      y: simY,
      dist: 0,
      dt: 1,
      param: paramValues,
    });

    if (!evaluated.ok) {
      return {
        inputType: -1,
        active: false,
        passes: [],
        error: evaluated.error,
        customToolId: tool.id,
      };
    }
    if (evaluated.skipped) {
      return { inputType: -1, active: false, passes: [], customToolId: tool.id };
    }

    // Scale snow by freezingTemp proximity for ice-oriented tools
    const effects = Object.assign({}, evaluated.effects);
    if (Number.isFinite(+paramValues.freezingTemp) && Number.isFinite(+effects.snow)) {
      // Keep snow; scripts already use param.snowAmount / freezingTemp
    }

    const hasTexture = !!(tool.textureDataUrl && Number.isFinite(+tool.atlasSlot) && +tool.atlasSlot >= 0);
    const terrainMode = tool.mode === 'terrain';
    // Terrain tools always paint WALLTYPE_CUSTOM_* so they are a distinct surface type.
    // Textured brushes also use the custom wall path.
    const useCustomWall = terrainMode || hasTexture;
    const slot = hasTexture ? +tool.atlasSlot
      : (terrainMode && Number.isFinite(+tool.atlasSlot) && +tool.atlasSlot >= 0 ? +tool.atlasSlot : 0);

    const passes = effectsToBrushPasses(effects, baseBrush, {
      terrainMode: terrainMode,
      terrainRole: tool.terrainRole || 'base',
      surfaceKind: tool.surfaceKind || 'land',
      surfaceKindUniform: SURFACE_KIND_TO_UNIFORM[tool.surfaceKind] != null
        ? SURFACE_KIND_TO_UNIFORM[tool.surfaceKind]
        : 0,
      customSlot: slot,
      useCustomWall: useCustomWall,
    });

    const primary = passes.length ? passes[0].inputType : -1;
    return {
      inputType: primary,
      x: baseBrush.x,
      y: baseBrush.y,
      intensity: baseBrush.intensity,
      brushSize: baseBrush.brushSize,
      moveX: baseBrush.moveX,
      moveY: baseBrush.moveY,
      wrap: baseBrush.wrap,
      invertTool: baseBrush.invertTool,
      active: passes.length > 0,
      passes: passes,
      customToolId: tool.id,
      customSlot: slot,
      surfaceKind: SURFACE_KIND_TO_UNIFORM[tool.surfaceKind] != null
        ? SURFACE_KIND_TO_UNIFORM[tool.surfaceKind]
        : 0,
      effectSnapshot: effects,
    };
  }

  /**
   * Apply numeric effect deltas to a single CPU cell (placeable continuous tools).
   * Mutates typed arrays in place. Returns true if anything changed.
   */
  function applyEffectsToCell(effects, baseData, waterData, wallData, idx, y, helpers) {
    if (!effects) return false;
    let changed = false;
    const H = helpers || {};

    const tempDelta = +effects.temperature;
    if (Number.isFinite(tempDelta) && tempDelta !== 0) {
      baseData[idx + 3] += tempDelta;
      changed = true;
    }

    const vaporDelta = +effects.vapor;
    if (Number.isFinite(vaporDelta) && vaporDelta !== 0 && waterData) {
      waterData[idx] = Math.max(0, waterData[idx] + vaporDelta);
      changed = true;
    }

    const smokeDelta = +effects.smoke;
    if (Number.isFinite(smokeDelta) && smokeDelta !== 0 && waterData) {
      // smoke often lives in water tex channel 2 in this sim — best-effort
      waterData[idx + 2] = Math.max(0, (waterData[idx + 2] || 0) + smokeDelta);
      changed = true;
    }

    const windX = +effects.windX;
    const windY = +effects.windY;
    if ((Number.isFinite(windX) && windX !== 0) || (Number.isFinite(windY) && windY !== 0)) {
      baseData[idx] += (windX || 0) * 0.05;
      baseData[idx + 1] += (windY || 0) * 0.05;
      changed = true;
    }

    if (wallData) {
      const terrainType = terrainToInputType(effects.terrain);
      if (terrainType != null && H.wallTypeFromInput) {
        const wt = H.wallTypeFromInput(terrainType);
        if (wt != null) {
          wallData[idx] = wt;
          changed = true;
        }
      }

      // Vegetation channels: wallData layout varies; use helper if provided
      if (H.applyVegDelta) {
        const grass = +effects.grass || 0;
        const forest = +effects.forest || 0;
        const friction = +effects.friction || 0;
        if (grass || forest || friction) {
          if (H.applyVegDelta(wallData, idx, grass, forest, friction))
            changed = true;
        }
      }

      if (H.applySnowDelta) {
        const snow = +effects.snow || 0;
        if (snow && H.applySnowDelta(wallData, idx, snow))
          changed = true;
      }

      if (H.applyMoistureDelta) {
        const moist = +effects.soilMoisture || 0;
        if (moist && H.applyMoistureDelta(wallData, idx, moist))
          changed = true;
      }
    }

    return changed;
  }

  const api = {
    TERRAIN_TO_INPUT: TERRAIN_TO_INPUT,
    CUSTOM_BASE_INPUT: CUSTOM_BASE_INPUT,
    CUSTOM_OVERLAY_INPUT: CUSTOM_OVERLAY_INPUT,
    SURFACE_KIND_TO_UNIFORM: SURFACE_KIND_TO_UNIFORM,
    compileScript: compileScript,
    invalidate: invalidate,
    validateToolScript: validateToolScript,
    evaluateEffects: evaluateEffects,
    effectsToBrushPasses: effectsToBrushPasses,
    computeCustomBrush: computeCustomBrush,
    applyEffectsToCell: applyEffectsToCell,
    buildContext: buildContext,
    defaultContext: defaultContext,
    terrainToInputType: terrainToInputType,
  };

  global.UserInteraction = global.UserInteraction || {};
  global.UserInteraction.runtime = api;
})(typeof window !== 'undefined' ? window : global);
