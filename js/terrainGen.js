/**
 * Procedural terrain generator — seeded heightmap → wall/water GPU upload.
 */
(function (global) {
  'use strict';

  const WALLTYPE_LAND = 1;
  const WALLTYPE_WATER = 2;
  const WALLTYPE_FRESH = 8;
  const WATER_MARKER_LAND = 1001.0;
  const WATER_MARKER_SALT = 1002.0;
  const WATER_MARKER_FRESH = 1003.0;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function hash2(x, seed) {
    let n = Math.sin(x * 127.1 + seed * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function valueNoise1D(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = hash2(i, seed);
    const b = hash2(i + 1, seed);
    return a + (b - a) * u;
  }

  /** Periodic FBM when wrap is true (period = resX). */
  function fbmHeight(x, resX, seed, octaves, wrap) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      let sampleX;
      if (wrap) {
        const period = Math.max(2, resX / freq);
        const xp = ((x % resX) + resX) % resX;
        // Sample with period so left/right edges match
        const t = (xp / resX) * period;
        const i0 = Math.floor(t);
        const i1 = (i0 + 1) % Math.max(1, Math.round(period));
        const f = t - Math.floor(t);
        const u = f * f * (3 - 2 * f);
        const a = hash2(i0 + o * 17, seed + o);
        const b = hash2(i1 + o * 17, seed + o);
        sampleX = a + (b - a) * u;
      } else {
        sampleX = valueNoise1D((x / resX) * freq * 4 + o * 3.1, seed + o * 19.2);
      }
      sum += sampleX * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return norm > 0 ? sum / norm : 0;
  }

  /**
   * Build column heights (solid wall top index inclusive).
   * @returns {{ heights: Int16Array, isOcean: Uint8Array }}
   */
  function buildHeightmap(opts) {
    const resX = opts.resX;
    const resY = opts.resY;
    const seed = opts.seed | 0;
    const wrap = !!opts.wrap;
    const seaFrac = clamp(opts.seaLevel != null ? opts.seaLevel : 0.06, 0, 0.45);
    const mountainFrac = clamp(opts.mountainHeight != null ? opts.mountainHeight : 0.35, 0.05, 0.85);
    const roughness = clamp(opts.roughness != null ? opts.roughness : 0.55, 0.1, 1);
    const octaves = 2 + Math.round(roughness * 5);
    const lakeChance = clamp(opts.lakeChance != null ? opts.lakeChance : 0.08, 0, 0.5);

    const heights = new Int16Array(resX);
    const isOcean = new Uint8Array(resX);
    const isLake = new Uint8Array(resX);

    const seaCells = Math.max(0, Math.floor(seaFrac * resY));
    const maxLand = Math.max(seaCells + 1, Math.floor(mountainFrac * resY));

    for (let x = 0; x < resX; x++) {
      let n = fbmHeight(x, resX, seed, octaves, wrap);
      // Bias so valleys can go to sea
      n = Math.pow(clamp(n, 0, 1), 1.1);
      let h = Math.floor(seaCells + n * (maxLand - seaCells));
      h = clamp(h, 0, resY - 2);
      heights[x] = h;
      isOcean[x] = h <= seaCells ? 1 : 0;
    }

    // Smooth a little for nicer slopes
    const smooth = new Int16Array(resX);
    for (let x = 0; x < resX; x++) {
      const xm = wrap ? (x - 1 + resX) % resX : Math.max(0, x - 1);
      const xp = wrap ? (x + 1) % resX : Math.min(resX - 1, x + 1);
      smooth[x] = Math.round((heights[xm] + heights[x] * 2 + heights[xp]) * 0.25);
    }
    for (let x = 0; x < resX; x++) {
      heights[x] = smooth[x];
      isOcean[x] = heights[x] <= seaCells ? 1 : 0;
    }

    // Occasional inland lakes in low basins
    if (lakeChance > 0) {
      for (let x = 2; x < resX - 2; x++) {
        if (isOcean[x]) continue;
        const basin = heights[x] < heights[x - 1] && heights[x] < heights[x + 1];
        if (basin && hash2(x, seed + 99) < lakeChance) {
          isLake[x] = 1;
          heights[x] = Math.max(seaCells, heights[x] - Math.max(1, Math.floor(resY * 0.02)));
        }
      }
    }

    // Enforce y=0 always wall: height at least 0
    for (let x = 0; x < resX; x++)
      heights[x] = Math.max(0, heights[x]);

    return { heights, isOcean, isLake, seaCells };
  }

  /**
   * Apply generated terrain onto CPU copies of base/water/wall, then upload.
   */
  async function applyTerrain(opts) {
    if (typeof gl === 'undefined' || typeof sim_res_x === 'undefined')
      throw new Error('Simulation not ready');
    if (typeof window.__applySnapshotInPlace !== 'function')
      throw new Error('Snapshot upload unavailable');

    const resX = sim_res_x;
    const resY = sim_res_y;
    const wrap = !!(guiControls && guiControls.wrapHorizontally);
    const map = buildHeightmap({
      resX,
      resY,
      wrap,
      seed: opts.seed,
      seaLevel: opts.seaLevel,
      mountainHeight: opts.mountainHeight,
      roughness: opts.roughness,
      lakeChance: opts.lakeChance,
    });

    const n = resX * resY;
    const base = new Float32Array(n * 4);
    const water = new Float32Array(n * 4);
    const wall = new Int8Array(n * 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_0);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, resX, resY, gl.RGBA, gl.FLOAT, base);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(0, 0, resX, resY, gl.RGBA, gl.FLOAT, water);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const simH = (guiControls && guiControls.simHeight) || 12000;
    const dz = simH / resY;
    const dl = (typeof dryLapse === 'number') ? dryLapse : 50;

    for (let x = 0; x < resX; x++) {
      const h = map.heights[x];
      const ocean = !!map.isOcean[x];
      const lake = !!map.isLake[x];
      const surfaceType = ocean ? WALLTYPE_WATER : (lake ? WALLTYPE_FRESH : WALLTYPE_LAND);

      for (let y = 0; y < resY; y++) {
        const i = (y * resX + x) * 4;
        const isWall = y === 0 || y <= h;

        if (isWall) {
          wall[i] = surfaceType;
          wall[i + 1] = 0;
          wall[i + 2] = Math.min(127, Math.max(0, y - h)); // below surface
          if (ocean || lake) {
            wall[i + 3] = 0;
            water[i] = ocean ? WATER_MARKER_SALT : WATER_MARKER_FRESH;
            water[i + 1] = ocean ? 35.0 : 0.0; // salinity
            water[i + 2] = 0;
            water[i + 3] = 0;
            // Keep / set water temperature
            if (!(base[i + 3] > 200))
              base[i + 3] = 273.15 + 18;
            base[i] = 0;
            base[i + 1] = 0;
            base[i + 2] = 0;
          } else {
            // Land surface moisture / veg / snow by altitude
            const altM = h * dz;
            const veg = clamp(Math.floor(90 - (h / resY) * 40 + hash2(x, opts.seed) * 40), 20, 120);
            wall[i + 3] = veg;
            water[i] = WATER_MARKER_LAND;
            water[i + 1] = 22 + hash2(x, opts.seed + 3) * 10; // sustained moisture
            water[i + 2] = 20 + hash2(x, opts.seed + 5) * 15; // soil moisture mm
            water[i + 3] = altM > 2200 ? clamp((altM - 2200) / 40, 0, 80) : 0; // snow cm
            if (!(base[i + 3] > 200))
              base[i + 3] = 273.15 + 15;
            base[i] = 0;
            base[i + 1] = 0;
            base[i + 2] = 0;
          }
        } else {
          wall[i] = 0;
          wall[i + 1] = 255;
          wall[i + 2] = Math.min(127, y - h);
          wall[i + 3] = 0;

          // If this cell was previously wall, seed a simple atmosphere profile
          const wasWall = !(base[i + 3] > 200) || water[i] > 1000;
          if (wasWall || water[i] > 1000) {
            const altFrac = y / resY;
            const realC = Math.max(-50, 25 - altFrac * 75);
            const realK = realC + 273.15;
            // potential temperature approx: app uses potentialToRealT = pot - (y/resY)*dryLapse
            // so pot = real + (y/resY)*dryLapse
            const pot = realK + altFrac * dl;
            base[i] = 0;
            base[i + 1] = 0;
            base[i + 2] = 0;
            base[i + 3] = pot;
            const tdOff = altFrac < 0.2 ? 2 : 20;
            if (typeof maxWater === 'function' && typeof CtoK === 'function') {
              water[i] = Math.max(maxWater(CtoK(realC - tdOff)), 0);
              water[i + 1] = 0;
              water[i + 2] = 0;
              water[i + 3] = 0;
            } else {
              water[i] = 0.01;
              water[i + 1] = 0;
              water[i + 2] = 0;
              water[i + 3] = 0;
            }
          } else {
            // Keep existing air; clear surface markers if any
            if (water[i] > 1000) {
              water[i] = 0.01;
              water[i + 1] = 0;
              water[i + 2] = 0;
              water[i + 3] = 0;
            }
          }
        }
      }
    }

    await window.__applySnapshotInPlace(base, water, wall, null);
    return { heights: map.heights, seaCells: map.seaCells };
  }

  function promptAndGenerate() {
    if (typeof SETUP_MODE !== 'undefined' && SETUP_MODE) {
      alert('Start the simulation first, then use Generate Terrain.');
      return;
    }
    const seedStr = prompt('Terrain seed (integer)', String((Date.now() % 100000)));
    if (seedStr === null) return;
    const seed = parseInt(seedStr, 10);
    if (!Number.isFinite(seed)) {
      alert('Invalid seed');
      return;
    }
    const seaStr = prompt('Sea level (0–0.4 of sim height)', '0.06');
    if (seaStr === null) return;
    const mountainStr = prompt('Mountain height (0.1–0.8 of sim height)', '0.35');
    if (mountainStr === null) return;
    const roughStr = prompt('Roughness (0.1–1)', '0.55');
    if (roughStr === null) return;

    if (!confirm('Replace current terrain with a new procedural landscape? Atmosphere above new ground will be reseeded where needed.'))
      return;

    applyTerrain({
      seed,
      seaLevel: parseFloat(seaStr),
      mountainHeight: parseFloat(mountainStr),
      roughness: parseFloat(roughStr),
      lakeChance: 0.1,
    }).then(() => {
      console.log('[terrainGen] Applied seed', seed);
    }).catch((e) => {
      console.error(e);
      alert('Terrain generation failed: ' + (e && e.message ? e.message : e));
    });
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.terrainGen = {
    buildHeightmap,
    applyTerrain,
    promptAndGenerate,
  };
})(typeof window !== 'undefined' ? window : globalThis);
