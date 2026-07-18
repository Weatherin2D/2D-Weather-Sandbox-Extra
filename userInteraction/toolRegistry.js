/**
 * Built-in + custom tool registry for the User Interaction menu.
 */
(function(global) {
  'use strict';

  const STORAGE_KEY = 'uie-custom-tools-v1';
  const MAX_ATLAS_SLOTS = 8;

  const CATEGORIES = [
    'All',
    'Atmosphere',
    'Terrain',
    'Vegetation',
    'Instruments',
    'Aviation',
    'Synoptic',
    'Custom',
    'Utility',
  ];

  const SURFACE_KINDS = ['land', 'fresh', 'sea', 'iceSheet', 'iceCap', 'custom'];
  const TERRAIN_ROLES = ['base', 'overlay'];

  const BUILTIN_TOOLS = [
    { id: 'TOOL_NONE', name: 'Flashlight', category: 'Utility', kind: 'none', builtin: true, tags: ['view', 'pan'] },
    { id: 'TOOL_TEMPERATURE', name: 'Temperature', category: 'Atmosphere', kind: 'brush', builtin: true, tags: ['heat', 'paint', 'temp'] },
    { id: 'TOOL_WATER', name: 'Water Vapor / Cloud', category: 'Atmosphere', kind: 'brush', builtin: true, tags: ['moisture', 'cloud', 'humidity'] },
    { id: 'TOOL_PRECIP', name: 'Precipitation', category: 'Atmosphere', kind: 'brush', builtin: true, tags: ['rain', 'snow', 'precip'] },
    { id: 'TOOL_SMOKE', name: 'Smoke / Dust', category: 'Atmosphere', kind: 'brush', builtin: true, tags: ['aerosol', 'dust'] },
    { id: 'TOOL_WIND', name: 'Wind', category: 'Atmosphere', kind: 'brush', builtin: true, tags: ['air', 'shear'] },
    { id: 'TOOL_CHARGE', name: 'Charge', category: 'Atmosphere', kind: 'brush', builtin: true, tags: ['lightning', 'electric'] },
    { id: 'TOOL_WALL_LAND', name: 'Land', category: 'Terrain', kind: 'brush', builtin: true, tags: ['ground', 'surface'] },
    { id: 'TOOL_WALL_FRESH', name: 'Fresh Water / Lake', category: 'Terrain', kind: 'brush', builtin: true, tags: ['lake', 'river', 'water'] },
    { id: 'TOOL_WALL_SEA', name: 'Salt Water / Ocean', category: 'Terrain', kind: 'brush', builtin: true, tags: ['ocean', 'sea', 'water'] },
    { id: 'TOOL_WALL_ICE_SHEET', name: 'Ice Sheet', category: 'Terrain', kind: 'brush', builtin: true, tags: ['ice', 'cold'] },
    { id: 'TOOL_WALL_ICE_CAP', name: 'Ice Cap / Glacier', category: 'Terrain', kind: 'brush', builtin: true, tags: ['glacier', 'ice'] },
    { id: 'TOOL_WALL_URBAN', name: 'Urban', category: 'Terrain', kind: 'brush', builtin: true, tags: ['city', 'surface'] },
    { id: 'TOOL_WALL_SUBURBAN', name: 'Suburban', category: 'Terrain', kind: 'brush', builtin: true, tags: ['city', 'surface'] },
    { id: 'TOOL_WALL_RUNWAY', name: 'Runway', category: 'Terrain', kind: 'brush', builtin: true, tags: ['paved', 'airport'] },
    { id: 'TOOL_WALL_INDUSTRIAL', name: 'Industrial', category: 'Terrain', kind: 'brush', builtin: true, tags: ['factory', 'surface'] },
    { id: 'TOOL_WALL_FIRE', name: 'Fire', category: 'Terrain', kind: 'brush', builtin: true, tags: ['burn', 'ignite'] },
    { id: 'TOOL_WALL_MOIST', name: 'Soil Moisture', category: 'Terrain', kind: 'brush', builtin: true, tags: ['soil', 'wet'] },
    { id: 'TOOL_FLOOD', name: 'Floodwater', category: 'Terrain', kind: 'brush', builtin: true, tags: ['flood', 'ponding', 'runoff'] },
    { id: 'TOOL_WALL_SNOW', name: 'Snow', category: 'Terrain', kind: 'brush', builtin: true, tags: ['snow', 'cold'] },
    { id: 'TOOL_VEG_GRASS', name: 'Grass / Shrub', category: 'Vegetation', kind: 'brush', builtin: true, tags: ['plants', 'grass'] },
    { id: 'TOOL_VEG_FOREST', name: 'Forest', category: 'Vegetation', kind: 'brush', builtin: true, tags: ['trees', 'forest'] },
    { id: 'TOOL_STATION', name: 'Weather Station', category: 'Instruments', kind: 'place', builtin: true, tags: ['station', 'obs'] },
    { id: 'TOOL_BALLOON', name: 'Weather Balloon', category: 'Instruments', kind: 'place', builtin: true, tags: ['sounding', 'balloon'] },
    { id: 'TOOL_RADAR', name: 'Radar Tower', category: 'Instruments', kind: 'place', builtin: true, tags: ['radar'] },
    { id: 'TOOL_MARKER', name: 'Marker', category: 'Instruments', kind: 'place', builtin: true, tags: ['label', 'pin'] },
    { id: 'TOOL_AIRPORT', name: 'Airport', category: 'Aviation', kind: 'place', builtin: true, tags: ['airport', 'traffic', 'runway'] },
    { id: 'TOOL_FLIGHT_ROUTE', name: 'Flight Route', category: 'Aviation', kind: 'place', builtin: true, tags: ['airport', 'route', 'traffic'] },
    { id: 'TOOL_AIRMASS', name: 'Airmass Generator', category: 'Synoptic', kind: 'place', builtin: true, tags: ['heating', 'generator'] },
    { id: 'TOOL_SYNOPTIC_LOW', name: 'Synoptic Low', category: 'Synoptic', kind: 'place', builtin: true, tags: ['low', 'pressure'] },
    { id: 'TOOL_SYNOPTIC_HIGH', name: 'Synoptic High', category: 'Synoptic', kind: 'place', builtin: true, tags: ['high', 'pressure'] },
    { id: 'TOOL_DRYLINE', name: 'Dryline', category: 'Synoptic', kind: 'place', builtin: true, tags: ['moisture', 'boundary', 'dryline'] },
    { id: 'TOOL_SEA_BREEZE', name: 'Sea / Lake Breeze', category: 'Synoptic', kind: 'place', builtin: true, tags: ['coast', 'breeze', 'circulation'] },
    { id: 'TOOL_NUKE', name: 'Nuke', category: 'Utility', kind: 'nuke', builtin: true, tags: ['explosion'] },
  ];

  const EFFECT_KEYS = [
    'temperature', 'vapor', 'smoke', 'windX', 'windY', 'charge',
    'terrain', 'soilMoisture', 'snow', 'grass', 'forest', 'friction',
  ];

  const TERRAIN_VALUES = [
    'none', 'land', 'fresh', 'sea', 'iceSheet', 'iceCap',
    'urban', 'suburban', 'runway', 'industrial', 'fire',
  ];

  let customTools = [];
  const listeners = [];

  function uid() {
    return 'CUSTOM_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36);
  }

  function cloneTool(tool) {
    return JSON.parse(JSON.stringify(tool));
  }

  function terrainDefaultParams() {
    return [
      { key: 'freezingTemp', label: 'Freezing Temp (°C)', min: -40, max: 10, step: 0.5, default: 0 },
      { key: 'snowAmount', label: 'Snow Amount', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'moisture', label: 'Moisture', min: -1, max: 1, step: 0.01, default: 0.2 },
      { key: 'heat', label: 'Heat', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'friction', label: 'Friction', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'albedoBias', label: 'Albedo Bias', min: 0, max: 1, step: 0.01, default: 0.15 },
    ];
  }

  function defaultScript() {
    return {
      when: 'true',
      effects: {
        temperature: 'intensity * param.heat',
        vapor: '0',
        smoke: '0',
        windX: '0',
        windY: '0',
        charge: '0',
        terrain: '"none"',
        soilMoisture: 'intensity * param.moisture',
        snow: 'intensity * param.snowAmount',
        grass: '0',
        forest: '0',
        friction: 'param.friction',
      },
      params: terrainDefaultParams(),
    };
  }

  const TEMPLATES = {
    'Warm Forest': {
      name: 'Warm Forest',
      mode: 'brush',
      tags: ['trees', 'heat', 'forest'],
      script: {
        when: 'true',
        effects: {
          temperature: 'intensity * param.heat',
          vapor: 'intensity * 0.15',
          smoke: '0',
          windX: '0',
          windY: '0',
          charge: '0',
          terrain: '"land"',
          soilMoisture: 'intensity * 0.2',
          snow: '0',
          grass: '0',
          forest: 'intensity * param.density',
          friction: 'param.friction',
        },
        params: [
          { key: 'heat', label: 'Heat', min: -1, max: 1, step: 0.01, default: 0.35 },
          { key: 'density', label: 'Forest Density', min: 0, max: 1, step: 0.01, default: 0.8 },
          { key: 'friction', label: 'Friction', min: 0, max: 1, step: 0.01, default: 0.55 },
        ],
      },
    },
    'Cool Lake': {
      name: 'Cool Lake',
      mode: 'brush',
      tags: ['water', 'lake', 'cool'],
      script: {
        when: 'true',
        effects: {
          temperature: 'intensity * param.heat',
          vapor: 'intensity * param.moisture',
          smoke: '0',
          windX: '0',
          windY: '0',
          charge: '0',
          terrain: '"fresh"',
          soilMoisture: '0',
          snow: '0',
          grass: '0',
          forest: '0',
          friction: '0.05',
        },
        params: [
          { key: 'heat', label: 'Heat', min: -1, max: 1, step: 0.01, default: -0.25 },
          { key: 'moisture', label: 'Moisture', min: 0, max: 1, step: 0.01, default: 0.4 },
        ],
      },
    },
    'Dry Wind': {
      name: 'Dry Wind',
      mode: 'brush',
      tags: ['wind', 'dry'],
      script: {
        when: 'true',
        effects: {
          temperature: 'intensity * param.heat',
          vapor: '-intensity * param.drying',
          smoke: '0',
          windX: 'intensity * param.wind',
          windY: '0',
          charge: '0',
          terrain: '"none"',
          soilMoisture: '-intensity * 0.1',
          snow: '0',
          grass: '0',
          forest: '0',
          friction: '0',
        },
        params: [
          { key: 'heat', label: 'Heat', min: -1, max: 1, step: 0.01, default: 0.1 },
          { key: 'drying', label: 'Drying', min: 0, max: 1, step: 0.01, default: 0.5 },
          { key: 'wind', label: 'Wind Push', min: -1, max: 1, step: 0.01, default: 0.6 },
        ],
      },
    },
    'Custom Trees': {
      name: 'Custom Trees',
      mode: 'brush',
      tags: ['trees', 'vegetation'],
      script: {
        when: 'true',
        effects: {
          temperature: '0',
          vapor: 'if param.moisture > 0 then intensity * param.moisture else 0',
          smoke: '0',
          windX: '0',
          windY: '0',
          charge: '0',
          terrain: '"land"',
          soilMoisture: 'intensity * 0.15',
          snow: '0',
          grass: 'intensity * (1 - param.forestMix)',
          forest: 'intensity * param.forestMix',
          friction: 'param.friction',
        },
        params: [
          { key: 'forestMix', label: 'Forest Mix', min: 0, max: 1, step: 0.01, default: 0.85 },
          { key: 'moisture', label: 'Moisture', min: 0, max: 1, step: 0.01, default: 0.2 },
          { key: 'friction', label: 'Friction', min: 0, max: 1, step: 0.01, default: 0.6 },
        ],
      },
    },
    'Atmosphere Spot': {
      name: 'Atmosphere Spot',
      mode: 'place',
      tags: ['place', 'heating', 'generator'],
      script: {
        when: 'dist < brushRadius',
        effects: {
          temperature: 'param.heat * intensity * (1 - dist / max(brushRadius, 1))',
          vapor: 'param.moisture * intensity * (1 - dist / max(brushRadius, 1))',
          smoke: '0',
          windX: '0',
          windY: '0',
          charge: '0',
          terrain: '"none"',
          soilMoisture: '0',
          snow: '0',
          grass: '0',
          forest: '0',
          friction: '0',
        },
        params: [
          { key: 'heat', label: 'Heat', min: -1, max: 1, step: 0.01, default: 0.4 },
          { key: 'moisture', label: 'Moisture', min: -1, max: 1, step: 0.01, default: 0.1 },
          { key: 'radius', label: 'Radius', min: 20, max: 400, step: 1, default: 120 },
        ],
      },
    },
    'Custom Land': {
      name: 'Custom Land',
      mode: 'terrain',
      terrainRole: 'base',
      surfaceKind: 'land',
      tags: ['terrain', 'land', 'base'],
      script: {
        when: 'true',
        effects: {
          temperature: 'intensity * param.heat',
          vapor: '0',
          smoke: '0',
          windX: '0',
          windY: '0',
          charge: '0',
          terrain: '"land"',
          soilMoisture: 'intensity * param.moisture',
          snow: 'if param.snowAmount > 0 then intensity * param.snowAmount else 0',
          grass: '0',
          forest: '0',
          friction: 'param.friction',
        },
        params: terrainDefaultParams(),
      },
    },
    'Custom Ocean': {
      name: 'Custom Ocean',
      mode: 'terrain',
      terrainRole: 'base',
      surfaceKind: 'sea',
      tags: ['terrain', 'ocean', 'base'],
      script: {
        when: 'true',
        effects: {
          temperature: 'intensity * param.heat',
          vapor: 'intensity * max(param.moisture, 0)',
          smoke: '0',
          windX: '0',
          windY: '0',
          charge: '0',
          terrain: '"sea"',
          soilMoisture: '0',
          snow: '0',
          grass: '0',
          forest: '0',
          friction: '0.05',
        },
        params: terrainDefaultParams().map(function(p) {
          if (p.key === 'moisture') return Object.assign({}, p, { default: 0.35 });
          if (p.key === 'heat') return Object.assign({}, p, { default: -0.05 });
          if (p.key === 'friction') return Object.assign({}, p, { default: 0.05 });
          return p;
        }),
      },
    },
    'Custom Urban Overlay': {
      name: 'Custom Urban Overlay',
      mode: 'terrain',
      terrainRole: 'overlay',
      surfaceKind: 'custom',
      tags: ['terrain', 'urban', 'overlay'],
      script: {
        when: 'true',
        effects: {
          temperature: 'intensity * param.heat',
          vapor: '0',
          smoke: '0',
          windX: '0',
          windY: '0',
          charge: '0',
          terrain: '"urban"',
          soilMoisture: 'intensity * param.moisture',
          snow: '0',
          grass: '0',
          forest: '0',
          friction: 'param.friction',
        },
        params: terrainDefaultParams().map(function(p) {
          if (p.key === 'heat') return Object.assign({}, p, { default: 0.15 });
          if (p.key === 'friction') return Object.assign({}, p, { default: 0.4 });
          if (p.key === 'albedoBias') return Object.assign({}, p, { default: 0.08 });
          if (p.key === 'moisture') return Object.assign({}, p, { default: -0.1 });
          return p;
        }),
      },
    },
    'Custom Ice': {
      name: 'Custom Ice',
      mode: 'terrain',
      terrainRole: 'base',
      surfaceKind: 'iceSheet',
      tags: ['terrain', 'ice', 'base', 'cold'],
      script: {
        when: 'true',
        effects: {
          temperature: 'intensity * param.heat',
          vapor: '0',
          smoke: '0',
          windX: '0',
          windY: '0',
          charge: '0',
          terrain: '"iceSheet"',
          soilMoisture: '0',
          snow: 'intensity * max(param.snowAmount, 0.3)',
          grass: '0',
          forest: '0',
          friction: '0.1',
        },
        params: terrainDefaultParams().map(function(p) {
          if (p.key === 'freezingTemp') return Object.assign({}, p, { default: 0 });
          if (p.key === 'snowAmount') return Object.assign({}, p, { default: 0.6 });
          if (p.key === 'heat') return Object.assign({}, p, { default: -0.4 });
          if (p.key === 'albedoBias') return Object.assign({}, p, { default: 0.7 });
          return p;
        }),
      },
    },
  };

  function normalizeParam(p) {
    if (!p || typeof p !== 'object') return null;
    const key = String(p.key || '').trim();
    if (!key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) return null;
    return {
      key: key,
      label: String(p.label || key),
      min: Number.isFinite(+p.min) ? +p.min : 0,
      max: Number.isFinite(+p.max) ? +p.max : 1,
      step: Number.isFinite(+p.step) ? +p.step : 0.01,
      default: Number.isFinite(+p.default) ? +p.default : 0,
    };
  }

  function normalizeScript(script) {
    const base = defaultScript();
    const src = script && typeof script === 'object' ? script : {};
    const effects = {};
    for (let i = 0; i < EFFECT_KEYS.length; i++) {
      const k = EFFECT_KEYS[i];
      let v = src.effects && src.effects[k] != null ? String(src.effects[k]) : base.effects[k];
      // Bare terrain tokens → string literals (land → "land")
      if (k === 'terrain') {
        const bare = v.trim();
        if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bare))
          v = '"' + bare + '"';
      }
      effects[k] = v;
    }
    const params = [];
    const rawParams = Array.isArray(src.params) ? src.params : base.params;
    for (let i = 0; i < rawParams.length; i++) {
      const np = normalizeParam(rawParams[i]);
      if (np) params.push(np);
    }
    return {
      when: src.when != null ? String(src.when) : 'true',
      effects: effects,
      params: params,
    };
  }

  function normalizeMode(mode) {
    if (mode === 'place') return 'place';
    if (mode === 'terrain') return 'terrain';
    return 'brush';
  }

  function normalizeTerrainRole(role) {
    return role === 'overlay' ? 'overlay' : 'base';
  }

  function normalizeSurfaceKind(kind) {
    const k = String(kind || 'land');
    return SURFACE_KINDS.indexOf(k) >= 0 ? k : 'land';
  }

  function usedAtlasSlots(excludeId) {
    const used = new Set();
    for (let i = 0; i < customTools.length; i++) {
      const t = customTools[i];
      if (excludeId && t.id === excludeId) continue;
      if (t.textureDataUrl && Number.isFinite(+t.atlasSlot) && +t.atlasSlot >= 0)
        used.add(+t.atlasSlot);
    }
    return used;
  }

  function allocateAtlasSlot(excludeId) {
    const used = usedAtlasSlots(excludeId);
    for (let s = 0; s < MAX_ATLAS_SLOTS; s++) {
      if (!used.has(s)) return s;
    }
    return -1;
  }

  function defaultTerrainTextureDataUrl(surfaceKind) {
    const colors = {
      land: '#6b5344',
      fresh: '#3a7a8c',
      sea: '#1a4a6e',
      iceSheet: '#c8dce8',
      iceCap: '#e8f2f8',
      custom: '#8a7058',
    };
    const fill = colors[surfaceKind] || colors.land;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Simple facade bands so vertical walls have visible texture
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let y = 8; y < canvas.height; y += 16)
        ctx.fillRect(0, y, canvas.width, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let x = 16; x < canvas.width; x += 32)
        ctx.fillRect(x, 0, 2, canvas.height);
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  function normalizeCustomTool(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = raw.id && String(raw.id).startsWith('CUSTOM_') ? String(raw.id) : uid();
    const mode = normalizeMode(raw.mode);
    let textureDataUrl = raw.textureDataUrl && String(raw.textureDataUrl).startsWith('data:')
      ? String(raw.textureDataUrl)
      : null;
    // Terrain tools always get a texture strip (user upload or generated default)
    if (mode === 'terrain' && !textureDataUrl)
      textureDataUrl = defaultTerrainTextureDataUrl(normalizeSurfaceKind(raw.surfaceKind));
    let atlasSlot = Number.isFinite(+raw.atlasSlot) ? +raw.atlasSlot : null;
    if (textureDataUrl) {
      if (atlasSlot == null || atlasSlot < 0 || atlasSlot >= MAX_ATLAS_SLOTS)
        atlasSlot = null; // assigned on upsert
    } else {
      atlasSlot = null;
    }
    return {
      id: id,
      name: String(raw.name || 'Custom Tool').slice(0, 64),
      category: 'Custom',
      kind: mode === 'place' ? 'place' : 'brush',
      mode: mode,
      terrainRole: normalizeTerrainRole(raw.terrainRole),
      surfaceKind: normalizeSurfaceKind(raw.surfaceKind),
      atlasSlot: atlasSlot,
      textureDataUrl: textureDataUrl,
      builtin: false,
      tags: Array.isArray(raw.tags) ? raw.tags.map(function(t) { return String(t); }) : [],
      script: normalizeScript(raw.script),
      paramValues: (raw.paramValues && typeof raw.paramValues === 'object') ? raw.paramValues : {},
    };
  }

  function loadCustomTools() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { customTools = []; return; }
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) { customTools = []; return; }
      customTools = arr.map(normalizeCustomTool).filter(Boolean);
    } catch (e) {
      customTools = [];
    }
  }

  function saveCustomTools() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customTools));
    } catch (e) { /* ignore quota */ }
  }

  function notify() {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (e) { /* ignore */ }
    }
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
  }

  function getAllTools() {
    return BUILTIN_TOOLS.concat(customTools).map(cloneTool);
  }

  function getTool(id) {
    if (!id) return null;
    for (let i = 0; i < BUILTIN_TOOLS.length; i++) {
      if (BUILTIN_TOOLS[i].id === id) return cloneTool(BUILTIN_TOOLS[i]);
    }
    for (let i = 0; i < customTools.length; i++) {
      if (customTools[i].id === id) return cloneTool(customTools[i]);
    }
    return null;
  }

  function isCustomToolId(id) {
    return !!(id && String(id).startsWith('CUSTOM_'));
  }

  function filterTools(query, category) {
    const q = (query || '').trim().toLowerCase();
    const cat = category || 'All';
    return getAllTools().filter(function(tool) {
      if (cat !== 'All' && tool.category !== cat) return false;
      if (!q) return true;
      if (tool.name.toLowerCase().includes(q)) return true;
      if (tool.category.toLowerCase().includes(q)) return true;
      if (tool.id.toLowerCase().includes(q)) return true;
      if (tool.tags && tool.tags.some(function(t) { return String(t).toLowerCase().includes(q); }))
        return true;
      return false;
    });
  }

  function selectTool(id) {
    if (typeof global.setGuiTool === 'function')
      return global.setGuiTool(id);
    if (global.guiControls)
      global.guiControls.tool = id;
    return true;
  }

  function upsertCustomTool(def) {
    const tool = normalizeCustomTool(def);
    if (!tool) return null;
    // Terrain tools need an atlas slot even if the default texture failed to generate
    const needsSlot = !!(tool.textureDataUrl || tool.mode === 'terrain');
    if (needsSlot) {
      const keep = Number.isFinite(+tool.atlasSlot) && +tool.atlasSlot >= 0
        && !usedAtlasSlots(tool.id).has(+tool.atlasSlot);
      if (!keep) {
        const slot = allocateAtlasSlot(tool.id);
        if (slot < 0)
          throw new Error('All ' + MAX_ATLAS_SLOTS + ' custom texture slots are in use. Delete a textured tool first.');
        tool.atlasSlot = slot;
      }
      if (!tool.textureDataUrl && tool.mode === 'terrain')
        tool.textureDataUrl = defaultTerrainTextureDataUrl(tool.surfaceKind);
    } else {
      tool.atlasSlot = null;
    }
    const idx = customTools.findIndex(function(t) { return t.id === tool.id; });
    if (idx >= 0) customTools[idx] = tool;
    else customTools.push(tool);
    saveCustomTools();
    notify();
    if (global.UserInteraction && global.UserInteraction.atlas)
      global.UserInteraction.atlas.scheduleRebuild();
    return cloneTool(tool);
  }

  function deleteCustomTool(id) {
    const before = customTools.length;
    customTools = customTools.filter(function(t) { return t.id !== id; });
    if (customTools.length !== before) {
      saveCustomTools();
      notify();
      if (global.UserInteraction && global.UserInteraction.atlas)
        global.UserInteraction.atlas.scheduleRebuild();
      return true;
    }
    return false;
  }

  function exportCustomTools() {
    return JSON.stringify({ version: 1, tools: customTools }, null, 2);
  }

  function exportSingleTool(id) {
    const tool = getTool(id);
    if (!tool || tool.builtin) throw new Error('Custom tool not found');
    return JSON.stringify({ version: 1, tools: [tool] }, null, 2);
  }

  function getCustomToolsForSave() {
    if (!customTools.length) return null;
    return customTools.map(cloneTool);
  }

  function restoreCustomToolsFromSave(saved) {
    if (!Array.isArray(saved) || saved.length === 0) return 0;
    let count = 0;
    for (let i = 0; i < saved.length; i++) {
      try {
        upsertCustomTool(saved[i]);
        count++;
      } catch (e) { /* skip slot conflicts */ }
    }
    return count;
  }

  function importCustomTools(jsonText, merge) {
    const MAX_CHARS = 2 * 1024 * 1024;
    const MAX_DATA_URL = 512 * 1024;
    let data = jsonText;
    if (typeof jsonText === 'string') {
      if (jsonText.length > MAX_CHARS)
        throw new Error('Custom tools JSON exceeds size limit');
      const reviver = (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype')
          return undefined;
        return value;
      };
      data = JSON.parse(jsonText, reviver);
    }
    const arr = Array.isArray(data) ? data : (data && data.tools);
    if (!Array.isArray(arr)) throw new Error('Invalid custom tools JSON');
    if (!merge) customTools = [];
    let count = 0;
    for (let i = 0; i < arr.length; i++) {
      try {
        const tool = arr[i];
        if (tool && typeof tool.textureDataUrl === 'string' && tool.textureDataUrl.length > MAX_DATA_URL)
          continue;
        if (tool && typeof tool.script === 'string' && tool.script.length > 100000)
          continue;
        upsertCustomTool(tool);
        count++;
      } catch (e) {
        // skip tools that cannot claim a texture slot
      }
    }
    return count;
  }

  function getTemplateNames() {
    return Object.keys(TEMPLATES);
  }

  function createFromTemplate(name) {
    const tpl = TEMPLATES[name];
    if (!tpl) return null;
    return normalizeCustomTool({
      id: uid(),
      name: tpl.name,
      mode: tpl.mode,
      terrainRole: tpl.terrainRole,
      surfaceKind: tpl.surfaceKind,
      tags: tpl.tags,
      script: tpl.script,
    });
  }

  function countTexturedTools() {
    return usedAtlasSlots(null).size;
  }

  function getParamValues(tool) {
    const out = {};
    if (!tool || !tool.script || !tool.script.params) return out;
    for (let i = 0; i < tool.script.params.length; i++) {
      const p = tool.script.params[i];
      const stored = tool.paramValues && tool.paramValues[p.key];
      out[p.key] = Number.isFinite(+stored) ? +stored : p.default;
    }
    return out;
  }

  loadCustomTools();

  const api = {
    STORAGE_KEY: STORAGE_KEY,
    CATEGORIES: CATEGORIES,
    EFFECT_KEYS: EFFECT_KEYS,
    TERRAIN_VALUES: TERRAIN_VALUES,
    SURFACE_KINDS: SURFACE_KINDS,
    TERRAIN_ROLES: TERRAIN_ROLES,
    MAX_ATLAS_SLOTS: MAX_ATLAS_SLOTS,
    TEMPLATES: TEMPLATES,
    getAllTools: getAllTools,
    getTool: getTool,
    filterTools: filterTools,
    selectTool: selectTool,
    isCustomToolId: isCustomToolId,
    upsertCustomTool: upsertCustomTool,
    deleteCustomTool: deleteCustomTool,
    exportCustomTools: exportCustomTools,
    exportSingleTool: exportSingleTool,
    importCustomTools: importCustomTools,
    getCustomToolsForSave: getCustomToolsForSave,
    restoreCustomToolsFromSave: restoreCustomToolsFromSave,
    getTemplateNames: getTemplateNames,
    createFromTemplate: createFromTemplate,
    defaultScript: defaultScript,
    terrainDefaultParams: terrainDefaultParams,
    normalizeCustomTool: normalizeCustomTool,
    getParamValues: getParamValues,
    countTexturedTools: countTexturedTools,
    allocateAtlasSlot: allocateAtlasSlot,
    onChange: onChange,
    reload: loadCustomTools,
  };

  global.UserInteraction = global.UserInteraction || {};
  global.UserInteraction.registry = api;
  global.UserInteraction.CATEGORIES = CATEGORIES;
})(typeof window !== 'undefined' ? window : global);
