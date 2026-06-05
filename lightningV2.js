/**
 * Lightning Revamp V2 — modular lightning system for 2D Weather Sandbox.
 * Settings, presets, strike logic, electrical burst cycles, and GUI builder.
 */
(function (global) {
  'use strict';

  const LT = {
    NONE: 0,
    INTRACLOUD: 1,
    CLOUD_TO_CLOUD: 2,
    SHEET: 3,
    STROBE: 4,
    CG: 5,
    CG_POSITIVE: 6,
    SPIDER: 7,
    ANVIL_CRAWLER: 8,
    UPWARD: 9,
    BOLT_FROM_BLUE: 10,
    DRY: 11,
  };

  const LT_NAMES = {
    [LT.INTRACLOUD]: 'Intracloud',
    [LT.CLOUD_TO_CLOUD]: 'Cloud-to-Cloud',
    [LT.SHEET]: 'Sheet',
    [LT.STROBE]: 'Strobe',
    [LT.CG]: 'Cloud-to-Ground',
    [LT.CG_POSITIVE]: 'Positive CG',
    [LT.SPIDER]: 'Spider',
    [LT.ANVIL_CRAWLER]: 'Anvil Crawler',
    [LT.UPWARD]: 'Upward',
    [LT.BOLT_FROM_BLUE]: 'Bolt From Blue',
    [LT.DRY]: 'Dry Lightning',
  };

  const SPAWNABLE_LT_TYPES = [
    LT.INTRACLOUD,
    LT.CLOUD_TO_CLOUD,
    LT.SHEET,
    LT.STROBE,
    LT.CG,
    LT.CG_POSITIVE,
    LT.SPIDER,
    LT.ANVIL_CRAWLER,
    LT.UPWARD,
    LT.BOLT_FROM_BLUE,
    LT.DRY,
  ];

  const REALISTIC_RATIOS = {
    intracloud: 58,
    cloudToCloud: 22,
    sheet: 14,
    cg: 5,
    cgPositive: 1.2,
    spider: 9,
    anvilCrawler: 7,
    upward: 0.25,
    boltFromBlue: 0.4,
    dry: 0.8,
  };

  const DEFAULT_SETTINGS = {
    lightningV2Enabled: true,
    lightningPreset: 'Enhanced Realistic',
    useRealisticLightningRatios: true,

    globalLightningMultiplier: 1.0,
    intracloudFrequency: 18.0,
    cloudToCloudFrequency: 8.0,
    cloudToGroundFrequency: 1.2,
    positiveCgFrequency: 0.35,
    spiderLightningFrequency: 1.2,
    anvilCrawlerFrequency: 0.9,
    upwardLightningFrequency: 0.08,
    boltFromBlueFrequency: 0.12,
    dryLightningFrequency: 0.25,
    sheetLightningFrequency: 2.5,

    lightningBrightness: 0.62,
    lightningContrast: 0.9,
    channelThickness: 1.05,
    branchDensity: 1.25,
    branchLength: 1.15,
    flashDuration: 1.0,
    channelGlowDuration: 1.0,
    bloomStrength: 0.7,
    glowStrength: 0.45,
    atmosphericIlluminationStrength: 0.45,
    cloudIlluminationStrength: 0.4,
    rainShaftIlluminationStrength: 0.5,
    terrainIlluminationStrength: 0.45,
    nighttimeFlashStrength: 0.6,
    daytimeFlashStrength: 0.25,
    ltEnableBloom: true,
    ltEnableAtmosphericLighting: true,
    ltEnableCloudIllumination: true,
    ltEnableRainShaftIllumination: true,
    ltEnableTerrainIllumination: true,
    ltEnablePersistentChannelGlow: true,
    ltEnableVolumetricCloudFlashing: true,

    leaderSpeed: 1.0,
    returnStrokeProbability: 0.35,
    maxReturnStrokes: 4,
    electricalBurstFrequency: 0.6,
    electricalBurstIntensity: 1.0,
    chargeDissipationRate: 1.0,
    chargeTransportStrength: 1.0,
    groundConductivityInfluence: 1.0,
    terrainInfluence: 1.0,
    stormOrganizationInfluence: 1.0,
    lightningClusteringStrength: 0.7,
    enableChargeTransport: true,
    enableGroundConductivity: true,
    enableElectricalBurstCycles: true,
    enableLightningClustering: true,
    enableTerrainTargeting: true,
    enableDynamicStormElectricalEvolution: true,

    thunderVolume: 1.0,
    thunderDelayMultiplier: 1.0,
    thunderDuration: 1.0,
    thunderBassStrength: 1.0,
    thunderDistanceAttenuation: 1.0,
    enableThunder: true,
    enableDistanceBasedThunderDelay: true,
    enableRollingThunder: true,
    enableThunderEchoes: false,

    lightningPerformanceTier: 'High',
    maxActiveLightningEvents: 24,
    maxActiveBolts: 8,
    maxBranchCount: 48,
    maxIlluminationRadius: 1.0,
    lightningLODDistance: 1.0,
    gpuEffectQuality: 1.0,
    atmosphericLightingResolution: 1.0,
    dynamicLOD: true,
    adaptiveLightningQuality: true,
    performanceAutoScaling: false,

    debugShowChargeField: false,
    debugShowChargeGradient: false,
    debugShowLightningPotential: false,
    debugShowConductivityMap: false,
    debugShowStrikeOrigins: false,
    debugShowStrikeDestinations: false,
    debugShowLightningTypeLabels: false,
    debugShowElectricalBurstRegions: false,
    debugShowActiveLightningEvents: false,
    debugShowThunderRadius: false,
    debugShowPerformanceMetrics: false,
    debugShowSurfaceCharge: false,
    debugShowChargeOrganization: false,
    debugShowSpiderRoutes: false,
    debugShowAnvilRoutes: false,
    debugShowCloudPaths: false,
    debugShowLightningProbability: false,
  };

  const PRESETS = {
    'Realistic': {
      globalLightningMultiplier: 0.85,
      atmosphericIlluminationStrength: 0.7,
      cloudIlluminationStrength: 0.75,
      glowStrength: 0.65,
      useRealisticLightningRatios: true,
      positiveCgFrequency: 0.2,
      spiderLightningFrequency: 0.15,
      anvilCrawlerFrequency: 0.12,
      branchDensity: 0.85,
      nighttimeFlashStrength: 0.9,
      daytimeFlashStrength: 0.35,
      lightningPerformanceTier: 'High',
    },
    'Enhanced Realistic': {
      globalLightningMultiplier: 1.0,
      atmosphericIlluminationStrength: 0.5,
      cloudIlluminationStrength: 0.45,
      lightningBrightness: 0.55,
      glowStrength: 0.45,
      nighttimeFlashStrength: 0.6,
      branchDensity: 1.1,
      useRealisticLightningRatios: true,
      positiveCgFrequency: 0.35,
      spiderLightningFrequency: 0.35,
      lightningPerformanceTier: 'High',
    },
    'Cinematic': {
      globalLightningMultiplier: 1.4,
      atmosphericIlluminationStrength: 1.5,
      cloudIlluminationStrength: 1.4,
      rainShaftIlluminationStrength: 1.3,
      glowStrength: 1.4,
      bloomStrength: 1.3,
      branchDensity: 1.25,
      branchLength: 1.2,
      positiveCgFrequency: 0.6,
      spiderLightningFrequency: 0.5,
      nighttimeFlashStrength: 1.3,
      lightningPerformanceTier: 'High',
    },
    'Supercell Showcase': {
      globalLightningMultiplier: 1.6,
      positiveCgFrequency: 1.2,
      spiderLightningFrequency: 1.0,
      anvilCrawlerFrequency: 0.9,
      atmosphericIlluminationStrength: 1.6,
      cloudIlluminationStrength: 1.7,
      rainShaftIlluminationStrength: 1.6,
      glowStrength: 1.5,
      bloomStrength: 1.4,
      branchDensity: 1.35,
      nighttimeFlashStrength: 1.5,
      lightningPerformanceTier: 'Ultra',
    },
    'Extreme Lightning': {
      globalLightningMultiplier: 2.5,
      intracloudFrequency: 25,
      sheetLightningFrequency: 8,
      cloudToGroundFrequency: 5,
      atmosphericIlluminationStrength: 1.3,
      cloudIlluminationStrength: 1.4,
      electricalBurstIntensity: 1.8,
      lightningPerformanceTier: 'Medium',
    },
    'Performance': {
      globalLightningMultiplier: 0.7,
      branchDensity: 0.5,
      branchLength: 0.6,
      atmosphericIlluminationStrength: 0.45,
      cloudIlluminationStrength: 0.5,
      rainShaftIlluminationStrength: 0.4,
      glowStrength: 0.4,
      maxActiveBolts: 4,
      maxBranchCount: 20,
      gpuEffectQuality: 0.5,
      lightningPerformanceTier: 'Low',
      ltEnableVolumetricCloudFlashing: false,
    },
    'Custom': {},
  };

  const PERFORMANCE_TIERS = {
    Low: { maxActiveBolts: 4, maxBranchCount: 16, gpuEffectQuality: 0.45, maxIlluminationRadius: 0.6 },
    Medium: { maxActiveBolts: 6, maxBranchCount: 32, gpuEffectQuality: 0.7, maxIlluminationRadius: 0.8 },
    High: { maxActiveBolts: 8, maxBranchCount: 48, gpuEffectQuality: 1.0, maxIlluminationRadius: 1.0 },
    Ultra: { maxActiveBolts: 12, maxBranchCount: 64, gpuEffectQuality: 1.2, maxIlluminationRadius: 1.3 },
  };

  const MAX_SHADER_STRIKES = 8;

  function shaderRand(n) {
    return Math.sin(n) * 43758.5453123 - Math.floor(Math.sin(n) * 43758.5453123);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function applyPreset(controls, presetName) {
    const preset = PRESETS[presetName];
    if (!preset) return;
    Object.assign(controls, preset);
    controls.lightningPreset = presetName;
    const tier = PERFORMANCE_TIERS[controls.lightningPerformanceTier];
    if (tier && presetName !== 'Custom') {
      Object.assign(controls, tier);
    }
  }

  function applyPerformanceTier(controls) {
    const tier = PERFORMANCE_TIERS[controls.lightningPerformanceTier];
    if (tier && controls.lightningPreset !== 'Custom')
      Object.assign(controls, tier);
  }

  function getEffectiveFrequency(controls, typeKey, stormFactor, profile) {
    const personality = getTypeFrequencyMult(profile, typeKey);
    if (controls.useRealisticLightningRatios) {
      const ratio = REALISTIC_RATIOS[typeKey] || 1;
      const total = Object.values(REALISTIC_RATIOS).reduce((a, b) => a + b, 0);
      const base = (ratio / total) * 48 * controls.globalLightningMultiplier;
      return base * (0.6 + stormFactor * 0.85) * personality;
    }
    const map = {
      intracloud: controls.intracloudFrequency,
      cloudToCloud: controls.cloudToCloudFrequency,
      sheet: controls.sheetLightningFrequency,
      cg: controls.cloudToGroundFrequency,
      cgPositive: controls.positiveCgFrequency,
      spider: controls.spiderLightningFrequency,
      anvilCrawler: controls.anvilCrawlerFrequency,
      upward: controls.upwardLightningFrequency,
      boltFromBlue: controls.boltFromBlueFrequency,
      dry: controls.dryLightningFrequency,
    };
    return (map[typeKey] || 0) * controls.globalLightningMultiplier * personality;
  }

  function createBurstState() {
    return {
      phase: 'quiet',
      quietUntil: 0,
      burstRemaining: 0,
      burstIntensity: 1.0,
      regionSeed: Math.random() * 10000,
    };
  }

  function updateBurstState(state, iterNum, controls, stormActivity) {
    if (!controls.enableElectricalBurstCycles) {
      state.phase = 'burst';
      state.burstIntensity = 1.0;
      return state;
    }
    if (state.phase === 'quiet') {
      if (iterNum >= state.quietUntil) {
        const burstLen = 2 + Math.floor(shaderRand(iterNum * 1.7 + state.regionSeed) * 5
          * controls.electricalBurstIntensity);
        state.phase = 'burst';
        state.burstRemaining = burstLen;
        state.burstIntensity = 0.8 + stormActivity * 0.6;
      }
    } else {
      if (state.burstRemaining <= 0) {
        const quietLen = 15 + Math.floor(shaderRand(iterNum * 2.3 + state.regionSeed) * 80
          / (0.3 + controls.electricalBurstFrequency));
        state.phase = 'quiet';
        state.quietUntil = iterNum + quietLen;
      } else {
        state.burstRemaining--;
      }
    }
    return state;
  }

  function readCacheField(cache, simX, simY, channel) {
    if (!cache || !cache.data) return 0;
    const px = clamp(Math.floor(simX / cache.scale), 0, cache.cacheW - 1);
    const py = clamp(Math.floor(simY / cache.scale), 0, cache.cacheH - 1);
    return cache.data[(py * cache.cacheW + px) * 4 + channel];
  }

  function readCharge(cache, x, y) { return readCacheField(cache, x, y, 0); }
  function readCloud(cache, x, y) { return readCacheField(cache, x, y, 1); }
  function readPotential(cache, x, y) { return readCacheField(cache, x, y, 2); }
  function readConductivity(cache, x, y) { return readCacheField(cache, x, y, 3); }

  function readSurfaceCharge(cache, x, y) {
    return readCacheField(cache, x, Math.max(0, y), 0);
  }

  function analyzeStormElectricalProfile(cache, simResX, simResY) {
    if (!cache || !cache.data) {
      return { type: 'multicell', stormActivity: 0.4, anvilFactor: 0.3, spread: 0.4,
        icMult: 1.2, ccMult: 1.2, spiderMult: 1.0, anvilMult: 0.8, cgMult: 0.75 };
    }
    let upperCloud = 0, lowerCloud = 0, potentialSum = 0, gradSum = 0, cells = 0;
    const step = Math.max(1, Math.floor(cache.cacheW / 10));
    for (let py = 0; py < cache.cacheH; py += step) {
      for (let px = 0; px < cache.cacheW; px += step) {
        const simY = py * cache.scale;
        const i = (py * cache.cacheW + px) * 4;
        const cloud = cache.data[i + 1];
        const pot = cache.data[i + 2];
        const grad = cache.data[i + 3];
        if (simY > simResY * 0.45) upperCloud += cloud;
        else lowerCloud += cloud;
        potentialSum += pot;
        gradSum += grad;
        cells++;
      }
    }
    cells = Math.max(cells, 1);
    const stormActivity = clamp(potentialSum / cells * 1.8, 0.05, 1.0);
    const anvilFactor = clamp(upperCloud / (lowerCloud + upperCloud + 0.01), 0, 1);
    const spread = clamp(gradSum / cells * 2.2, 0, 1);

    if (stormActivity < 0.22)
      return { type: 'weak', stormActivity, anvilFactor, spread, icMult: 1.3, ccMult: 0.9, spiderMult: 0.15, anvilMult: 0.12, cgMult: 0.35 };
    if (stormActivity > 0.58 && anvilFactor > 0.48)
      return { type: 'supercell', stormActivity, anvilFactor, spread, icMult: 2.0, ccMult: 1.6, spiderMult: 2.8, anvilMult: 2.4, cgMult: 0.65 };
    if (stormActivity > 0.42 && spread > 0.38 && anvilFactor > 0.35)
      return { type: 'mcs', stormActivity, anvilFactor, spread, icMult: 2.4, ccMult: 2.0, spiderMult: 2.2, anvilMult: 1.9, cgMult: 0.45 };
    return { type: 'multicell', stormActivity, anvilFactor, spread, icMult: 1.6, ccMult: 1.4, spiderMult: 0.9, anvilMult: 0.75, cgMult: 0.8 };
  }

  function getTypeFrequencyMult(profile, typeKey) {
    if (!profile) return 1;
    const map = {
      intracloud: profile.icMult, cloudToCloud: profile.ccMult,
      spider: profile.spiderMult, anvilCrawler: profile.anvilMult, cg: profile.cgMult,
    };
    return map[typeKey] || 1;
  }

  function cloudGate(cloud) {
    return clamp(1.0 - 1.0 / (1.0 + cloud * 13.0), 0, 1);
  }

  function computeLightningPotentialAt(cache, simX, simY) {
    const charge = readCharge(cache, simX, simY);
    const cloud = readCloud(cache, simX, simY);
    const potential = readPotential(cache, simX, simY);
    const cg = cloudGate(cloud);
    return potential * 0.55 + Math.abs(charge) * cg * 0.35 + cloud * cg * 0.1;
  }

  function pickOriginFromPotential(cache, eventId, slot, numSlots, simResX, simResY, channelId) {
    let bestScore = -1;
    let best = { x: simResX * 0.5, y: simResY * 0.35, charge: 0, cloud: 0, potential: 0 };
    const anvilBias = channelId === 'spider' || channelId === 'anvil';

    for (let c = 0; c < 8; c++) {
      const cs = c * 503 + slot * 131;
      const xSlot = (slot + shaderRand(eventId * 1.37 + cs) * 0.85) / Math.max(numSlots, 1);
      const ox = (xSlot * 0.75 + shaderRand(eventId * 2.11 + cs) * 0.18 + 0.04) * simResX;
      const probeY = anvilBias
        ? (shaderRand(eventId * 3.07 + cs) * 0.35 + 0.48) * simResY
        : (shaderRand(eventId * 3.07 + cs) * 0.75 + 0.12) * simResY;

      for (let v = 0; v < 4; v++) {
        const vy = clamp(probeY + (v - 1.5) * simResY * 0.05, simResY * 0.05, simResY * 0.92);
        let score = computeLightningPotentialAt(cache, ox, vy);
        const cloud = readCloud(cache, ox, vy);
        if (anvilBias) score *= 0.55 + cloud * 1.1 + (vy > simResY * 0.42 ? 0.35 : 0.0);
        const noise = 0.55 + shaderRand(eventId * 5.03 + cs + v * 17) * 0.9;
        if (score * noise > bestScore) {
          bestScore = score * noise;
          best = {
            x: ox, y: vy,
            charge: readCharge(cache, ox, vy),
            cloud,
            potential: readPotential(cache, ox, vy),
          };
        }
      }
    }
    return best;
  }

  function pickGroundTarget(cache, origin, eventId, slot, simResX, simResY, controls) {
    let bestScore = -1;
    let best = { x: origin.x, y: simResY * 0.02 };
    const originCharge = origin.chargeVal ?? readCharge(cache, origin.x, origin.y);
    const searchRadius = simResX * 0.14;

    for (let i = 0; i < 14; i++) {
      const angle = shaderRand(eventId * 4.1 + slot * 31 + i * 7) * Math.PI * 2;
      const dist = shaderRand(eventId * 6.2 + i * 13) * searchRadius;
      const tx = clamp(origin.x + Math.cos(angle) * dist, 0, simResX - 1);
      const ty = clamp(simResY * 0.01 + shaderRand(eventId + i * 19) * simResY * 0.07, 0, simResY * 0.12);

      let cond = readConductivity(cache, tx, ty);
      if (!controls.enableGroundConductivity) cond = 0.5;
      cond *= controls.groundConductivityInfluence;

      const surfCharge = readSurfaceCharge(cache, tx, ty);
      const oppose = (originCharge > 0 && surfCharge < 0) || (originCharge < 0 && surfCharge > 0)
        ? Math.min(Math.abs(surfCharge), 0.8) * 0.35 : 0;

      const elevBonus = controls.enableTerrainTargeting
        ? readPotential(cache, tx, ty) * controls.terrainInfluence * 0.35 : 0;

      const score = cond + oppose + elevBonus + shaderRand(eventId * 8.1 + i) * 0.12;
      if (score > bestScore) {
        bestScore = score;
        best = { x: tx, y: ty };
      }
    }
    return best;
  }

  function routeCloudPath(cache, origin, eventId, slot, simResX, simResY) {
    let x = origin.x ?? origin.originX;
    let y = origin.y ?? origin.originY;
    const baseAngle = shaderRand(eventId * 2.37 + slot * 53) * Math.PI * 2;
    const steps = 10;

    for (let s = 0; s < steps; s++) {
      let bestLocal = { x, y, score: -1 };
      for (let a = 0; a < 7; a++) {
        const theta = baseAngle + (a - 3) * 0.38 + s * 0.05;
        const nx = clamp(x + Math.cos(theta) * simResX * 0.038, 0, simResX - 1);
        const ny = clamp(y + Math.sin(theta) * simResY * 0.028, simResY * 0.08, simResY * 0.9);
        const cloud = readCloud(cache, nx, ny);
        if (cloud < 0.06) continue;
        const pot = readPotential(cache, nx, ny);
        const chg = Math.abs(readCharge(cache, nx, ny));
        const grad = readConductivity(cache, nx, ny);
        const score = cloud * 1.4 + pot * 0.9 + chg * 0.35 + grad * 0.25;
        if (score > bestLocal.score) bestLocal = { x: nx, y: ny, score };
      }
      if (bestLocal.score < 0) break;
      x = bestLocal.x;
      y = bestLocal.y;
    }
    return { destX: x, destY: y };
  }

  function placementForSpiderAnvil(origin, profile, simResX, simResY, seed, ltType) {
    const x = origin.x ?? origin.originX;
    const y = origin.y ?? origin.originY;
    const isSpider = ltType === LT.SPIDER;
    const anvilBoost = profile ? profile.anvilFactor : 0.4;
    const horizFrac = (isSpider ? 0.38 : 0.44) * (0.70 + anvilBoost * 0.55) * (0.80 + shaderRand(seed + 2) * 0.5);
    const angle = (shaderRand(seed + 5) - 0.5) * Math.PI * 0.55;
    const dx = Math.cos(angle) * horizFrac * simResX;
    const dy = Math.sin(angle) * horizFrac * simResY * 0.06;
    return {
      destX: clamp(x + dx, 0, simResX - 1),
      destY: clamp(y + dy, simResY * 0.12, simResY * 0.88),
      flashSize: horizFrac,
      branchCount: isSpider ? 4 + Math.floor(shaderRand(seed + 9) * 2) : 3 + Math.floor(shaderRand(seed + 9)),
    };
  }

  function selectTypeForChannel(channelId, origin, eventId, slot, controls, isDry) {
    const r = shaderRand(eventId * 3.17 + slot * 41 + channelId.length * 7);
    const chargeMag = Math.abs(origin.charge);
    const isHigh = chargeMag > 0.42 || origin.potential > 0.55;

    if (isDry && r < 0.72) return LT.DRY;
    switch (channelId) {
      case 'intracloud': return isDry ? LT.DRY : LT.INTRACLOUD;
      case 'cc': return isDry ? LT.DRY : (r > 0.35 ? LT.CLOUD_TO_CLOUD : LT.INTRACLOUD);
      case 'sheet': return isDry ? LT.DRY : LT.SHEET;
      case 'strobe': return isDry ? LT.DRY : LT.STROBE;
      case 'cg':
        if (isDry) return LT.DRY;
        if (isHigh && r < 0.12 * (controls.positiveCgFrequency + 0.1))
          return LT.CG_POSITIVE;
        return LT.CG;
      case 'spider': return LT.SPIDER;
      case 'anvil': return LT.ANVIL_CRAWLER;
      case 'upward': return LT.UPWARD;
      case 'bftb': return LT.BOLT_FROM_BLUE;
      default: return LT.SHEET;
    }
  }

  function numReturnStrokesForType(ltType, originMag, seed, controls) {
    if (ltType === LT.DRY) return 1;
    let base = 1;
    if (shaderRand(seed + 77) < controls.returnStrokeProbability) base = 2;
    if (ltType === LT.CG_POSITIVE && shaderRand(seed + 113) < 0.45) base = 3;
    if (shaderRand(seed + 199) < 0.08 && originMag > 0.5) base = Math.min(controls.maxReturnStrokes, base + 1);
    return clamp(base, 1, controls.maxReturnStrokes);
  }

  function brightnessForType(ltType, originMag, controls) {
    const mag = clamp(Number.isFinite(originMag) ? originMag : 0.3, 0.0, 1.2);
    let b = 0.28 + mag * 0.32;
    if (ltType === LT.DRY) b *= 0.18;
    else if (ltType === LT.CG_POSITIVE) b *= 1.05;
    else if (ltType === LT.STROBE || ltType === LT.CG) b *= 0.95;
    else if (ltType === LT.CLOUD_TO_CLOUD) b *= 0.78;
    else if (ltType === LT.SHEET) b *= 0.48;
    else if (ltType === LT.INTRACLOUD) b *= 0.72;
    else if (ltType === LT.SPIDER) b *= 0.88;
    else if (ltType === LT.ANVIL_CRAWLER) b *= 0.82;
    const bright = (controls.lightningBrightness ?? 0.55) * b;
    return clamp(bright, 0.04, 1.0);
  }

  function illuminationRadiusForType(ltType, controls) {
    let r = controls.maxIlluminationRadius;
    if (ltType === LT.DRY) r *= 0.32;
    else if (ltType === LT.CG_POSITIVE) r *= 1.8;
    else if (ltType === LT.SHEET || ltType === LT.INTRACLOUD) r *= 1.3;
    else if (ltType === LT.SPIDER) r *= 1.85;
    else if (ltType === LT.ANVIL_CRAWLER) r *= 2.1;
    else if (ltType === LT.CG) r *= 1.1;
    return r;
  }

  function isDryLightningType(ltType) {
    return ltType === LT.DRY;
  }

  /** Dry lightning: distant cloud-base flash, virga evaporates before the surface. */
  function placementForDryStrike(origin, simResX, simResY, seed) {
    const x = origin.originX ?? origin.x;
    const y = origin.originY ?? origin.y;
    return {
      destX: x + (shaderRand(seed + 31) - 0.5) * simResX * 0.035,
      destY: Math.max(simResY * 0.18, y - simResY * (0.015 + shaderRand(seed + 47) * 0.045)),
      flashSize: 0.22 + shaderRand(seed + 59) * 0.18,
    };
  }

  function isGroundStrike(ltType) {
    return ltType === LT.CG || ltType === LT.CG_POSITIVE
      || ltType === LT.UPWARD || ltType === LT.BOLT_FROM_BLUE;
  }

  function boltTextureIndexForType(ltType, seed) {
    if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER) return 2 + Math.floor(shaderRand(seed) * 2);
    if (ltType === LT.CLOUD_TO_CLOUD) return 4 + Math.floor(shaderRand(seed + 3) * 2);
    if (ltType === LT.CG_POSITIVE) return Math.floor(shaderRand(seed + 5) * 2);
    return Math.floor(shaderRand(seed + 1) * 4);
  }

  function getChannels(controls, stormActivity, profile) {
    const ch = [
      { id: 'intracloud', salt: 311, freq: () => getEffectiveFrequency(controls, 'intracloud', stormActivity, profile) },
      { id: 'cc', salt: 911, freq: () => getEffectiveFrequency(controls, 'cloudToCloud', stormActivity, profile) },
      { id: 'sheet', salt: 1511, freq: () => getEffectiveFrequency(controls, 'sheet', stormActivity, profile) },
      { id: 'strobe', salt: 1913, freq: () => getEffectiveFrequency(controls, 'cg', stormActivity, profile) * 0.35 },
      { id: 'cg', salt: 2917, freq: () => getEffectiveFrequency(controls, 'cg', stormActivity, profile) },
      { id: 'spider', salt: 3911, freq: () => getEffectiveFrequency(controls, 'spider', stormActivity, profile) },
      { id: 'anvil', salt: 4513, freq: () => getEffectiveFrequency(controls, 'anvilCrawler', stormActivity, profile) },
      { id: 'upward', salt: 5117, freq: () => getEffectiveFrequency(controls, 'upward', stormActivity, profile) },
      { id: 'bftb', salt: 5719, freq: () => getEffectiveFrequency(controls, 'boltFromBlue', stormActivity, profile) },
    ];
    return ch.filter(c => c.freq() > 0);
  }

  function strikeChance(freq, burstIntensity, clustering) {
    const norm = freq / 100;
    let chance = Math.min(0.75, norm * norm * 0.45 + norm * 0.35 + 0.004);
    chance *= burstIntensity;
    if (clustering > 0.5) chance *= 1.0 + (clustering - 0.5) * 0.6;
    return chance;
  }

  function createEventRecord(strike, eventId, iterNum) {
    return {
      id: strike.eventRecordId,
      strikeId: strike.eventRecordId,
      ltType: strike.ltType,
      time: iterNum,
      originX: strike.originX,
      originY: strike.originY,
      destX: strike.destX,
      destY: strike.destY,
      polarity: strike.chargeVal >= 0 ? 1 : -1,
      brightness: strike.brightness,
      intensity: strike.originMag,
      groundStrike: strike.groundStrike,
      stormId: null,
      numReturnStrokes: strike.numReturnStrokes,
      seed: strike.seed,
      flashSize: strike.flashSize,
      eventId,
      texIndex: strike.texIndex,
    };
  }

  function buildSpawnToolsFolder(parentFolder, callbacks) {
    if (!callbacks.forceSpawnLightningType || !callbacks.forceSpawnAllLightningTypes)
      return;
    const spawnFolder = parentFolder.addFolder('Spawn Tools');
    const actions = {
      'Spawn All Types': () => callbacks.forceSpawnAllLightningTypes(),
    };
    for (const ltType of SPAWNABLE_LT_TYPES) {
      const label = LT_NAMES[ltType] || ('Type ' + ltType);
      actions['Spawn ' + label] = () => callbacks.forceSpawnLightningType(ltType);
    }
    spawnFolder.add(actions, 'Spawn All Types');
    for (const ltType of SPAWNABLE_LT_TYPES) {
      const label = LT_NAMES[ltType] || ('Type ' + ltType);
      spawnFolder.add(actions, 'Spawn ' + label);
    }
    return spawnFolder;
  }

  function buildLightningV2GUI(datGui, controls, callbacks) {
    const folder = datGui.addFolder('Lightning');
    const presetCtrl = folder.add(controls, 'lightningPreset', Object.keys(PRESETS))
      .name('Preset').onChange(name => {
        if (name !== 'Custom') {
          applyPreset(controls, name);
          callbacks.onSettingsChanged();
        }
      });

    const freqFolder = folder.addFolder('Frequency');
    freqFolder.add(controls, 'globalLightningMultiplier', 0, 3, 0.05).name('Global Multiplier');
    freqFolder.add(controls, 'useRealisticLightningRatios').name('Realistic Ratios');
    freqFolder.add(controls, 'intracloudFrequency', 0, 100, 0.5).name('Intracloud');
    freqFolder.add(controls, 'cloudToCloudFrequency', 0, 100, 0.5).name('Cloud-to-Cloud');
    freqFolder.add(controls, 'cloudToGroundFrequency', 0, 100, 0.5).name('Cloud-to-Ground');
    freqFolder.add(controls, 'positiveCgFrequency', 0, 5, 0.05).name('Positive CG');
    freqFolder.add(controls, 'spiderLightningFrequency', 0, 5, 0.05).name('Spider');
    freqFolder.add(controls, 'anvilCrawlerFrequency', 0, 5, 0.05).name('Anvil Crawler');
    freqFolder.add(controls, 'upwardLightningFrequency', 0, 2, 0.02).name('Upward');
    freqFolder.add(controls, 'boltFromBlueFrequency', 0, 2, 0.02).name('Bolt From Blue');
    freqFolder.add(controls, 'dryLightningFrequency', 0, 5, 0.05).name('Dry Lightning');
    freqFolder.add(controls, 'sheetLightningFrequency', 0, 20, 0.1).name('Sheet');

    const visualFolder = folder.addFolder('Visual');
    visualFolder.add(controls, 'lightningBrightness', 0.1, 3, 0.05).name('Brightness');
    visualFolder.add(controls, 'lightningContrast', 0.1, 3, 0.05).name('Contrast');
    visualFolder.add(controls, 'channelThickness', 0.25, 4, 0.05).name('Channel Thickness');
    visualFolder.add(controls, 'branchDensity', 0.1, 3, 0.05).name('Branch Density');
    visualFolder.add(controls, 'branchLength', 0.1, 3, 0.05).name('Branch Length');
    visualFolder.add(controls, 'flashDuration', 0.2, 3, 0.05).name('Flash Duration');
    visualFolder.add(controls, 'channelGlowDuration', 0.1, 3, 0.05).name('Channel Glow');
    visualFolder.add(controls, 'bloomStrength', 0, 3, 0.05).name('Bloom Strength');
    visualFolder.add(controls, 'glowStrength', 0, 3, 0.05).name('Glow Strength');
    visualFolder.add(controls, 'atmosphericIlluminationStrength', 0, 3, 0.05).name('Atmospheric');
    visualFolder.add(controls, 'cloudIlluminationStrength', 0, 3, 0.05).name('Cloud');
    visualFolder.add(controls, 'rainShaftIlluminationStrength', 0, 3, 0.05).name('Rain Shaft');
    visualFolder.add(controls, 'terrainIlluminationStrength', 0, 3, 0.05).name('Terrain');
    visualFolder.add(controls, 'nighttimeFlashStrength', 0, 3, 0.05).name('Night Flash');
    visualFolder.add(controls, 'daytimeFlashStrength', 0, 2, 0.05).name('Day Flash');
    visualFolder.add(controls, 'ltEnableBloom').name('Enable Bloom');
    visualFolder.add(controls, 'ltEnableAtmosphericLighting').name('Atmospheric Lighting');
    visualFolder.add(controls, 'ltEnableCloudIllumination').name('Cloud Illumination');
    visualFolder.add(controls, 'ltEnableRainShaftIllumination').name('Rain Shaft Illumination');
    visualFolder.add(controls, 'ltEnableTerrainIllumination').name('Terrain Illumination');
    visualFolder.add(controls, 'ltEnablePersistentChannelGlow').name('Persistent Channel Glow');
    visualFolder.add(controls, 'ltEnableVolumetricCloudFlashing').name('Volumetric Cloud Flash');

    const behaviorFolder = folder.addFolder('Behavior');
    behaviorFolder.add(controls, 'chargeGenerationRate', 0, 5, 0.05).name('Charge Generation')
      .onChange(callbacks.setChargeGenerationUniforms);
    behaviorFolder.add(controls, 'chargeMinCloudDensity', 0.05, 0.7, 0.01).name('Min Cloud Density')
      .onChange(callbacks.setChargeGenerationUniforms);
    behaviorFolder.add(controls, 'chargeStormCoreThreshold', 0.1, 0.8, 0.01).name('Storm Core Threshold')
      .onChange(callbacks.setChargeGenerationUniforms);
    behaviorFolder.add(controls, 'leaderSpeed', 0.2, 3, 0.05).name('Leader Speed');
    behaviorFolder.add(controls, 'returnStrokeProbability', 0, 1, 0.05).name('Return Stroke Prob');
    behaviorFolder.add(controls, 'maxReturnStrokes', 1, 8, 1).name('Max Return Strokes');
    behaviorFolder.add(controls, 'electricalBurstFrequency', 0, 2, 0.05).name('Burst Frequency');
    behaviorFolder.add(controls, 'electricalBurstIntensity', 0.2, 3, 0.05).name('Burst Intensity');
    behaviorFolder.add(controls, 'chargeDissipationRate', 0.2, 3, 0.05).name('Charge Dissipation');
    behaviorFolder.add(controls, 'chargeTransportStrength', 0, 3, 0.05).name('Charge Transport');
    behaviorFolder.add(controls, 'groundConductivityInfluence', 0, 3, 0.05).name('Conductivity Influence');
    behaviorFolder.add(controls, 'terrainInfluence', 0, 3, 0.05).name('Terrain Influence');
    behaviorFolder.add(controls, 'stormOrganizationInfluence', 0, 3, 0.05).name('Storm Organization');
    behaviorFolder.add(controls, 'lightningClusteringStrength', 0, 1, 0.05).name('Clustering Strength');
    behaviorFolder.add(controls, 'enableChargeTransport').name('Charge Transport');
    behaviorFolder.add(controls, 'enableGroundConductivity').name('Ground Conductivity');
    behaviorFolder.add(controls, 'enableElectricalBurstCycles').name('Electrical Bursts');
    behaviorFolder.add(controls, 'enableLightningClustering').name('Lightning Clustering');
    behaviorFolder.add(controls, 'enableTerrainTargeting').name('Terrain Targeting');
    behaviorFolder.add(controls, 'enableDynamicStormElectricalEvolution').name('Dynamic Evolution');

    const thunderFolder = folder.addFolder('Thunder');
    thunderFolder.add(controls, 'enableThunder').name('Enable Thunder');
    thunderFolder.add(controls, 'thunderVolume', 0, 3, 0.05).name('Volume');
    thunderFolder.add(controls, 'thunderDelayMultiplier', 0.2, 3, 0.05).name('Delay Multiplier');
    thunderFolder.add(controls, 'thunderDuration', 0.2, 3, 0.05).name('Duration');
    thunderFolder.add(controls, 'thunderBassStrength', 0, 3, 0.05).name('Bass Strength');
    thunderFolder.add(controls, 'thunderDistanceAttenuation', 0, 3, 0.05).name('Distance Attenuation');
    thunderFolder.add(controls, 'enableDistanceBasedThunderDelay').name('Distance Delay');
    thunderFolder.add(controls, 'enableRollingThunder').name('Rolling Thunder');
    thunderFolder.add(controls, 'enableThunderEchoes').name('Thunder Echoes');

    const perfFolder = folder.addFolder('Performance');
    perfFolder.add(controls, 'lightningPerformanceTier', ['Low', 'Medium', 'High', 'Ultra', 'Custom'])
      .name('Quality Tier').onChange(() => {
        if (controls.lightningPerformanceTier !== 'Custom')
          applyPerformanceTier(controls);
      });
    perfFolder.add(controls, 'maxActiveLightningEvents', 4, 48, 1).name('Max Events');
    perfFolder.add(controls, 'maxActiveBolts', 1, 12, 1).name('Max Bolts');
    perfFolder.add(controls, 'maxBranchCount', 8, 96, 4).name('Max Branches');
    perfFolder.add(controls, 'maxIlluminationRadius', 0.2, 2, 0.05).name('Illumination Radius');
    perfFolder.add(controls, 'lightningLODDistance', 0.2, 3, 0.05).name('LOD Distance');
    perfFolder.add(controls, 'gpuEffectQuality', 0.2, 2, 0.05).name('GPU Effect Quality');
    perfFolder.add(controls, 'dynamicLOD').name('Dynamic LOD');
    perfFolder.add(controls, 'adaptiveLightningQuality').name('Adaptive Quality');
    perfFolder.add(controls, 'performanceAutoScaling').name('Auto Scaling');

    const debugFolder = folder.addFolder('Debug');
    debugFolder.add(controls, 'debugShowChargeField').name('Charge Field');
    debugFolder.add(controls, 'debugShowChargeGradient').name('Charge Gradient');
    debugFolder.add(controls, 'debugShowLightningPotential').name('Potential Field');
    debugFolder.add(controls, 'debugShowConductivityMap').name('Conductivity Map');
    debugFolder.add(controls, 'debugShowStrikeOrigins').name('Strike Origins');
    debugFolder.add(controls, 'debugShowStrikeDestinations').name('Strike Destinations');
    debugFolder.add(controls, 'debugShowLightningTypeLabels').name('Type Labels');
    debugFolder.add(controls, 'debugShowElectricalBurstRegions').name('Burst Regions');
    debugFolder.add(controls, 'debugShowActiveLightningEvents').name('Active Events');
    debugFolder.add(controls, 'debugShowThunderRadius').name('Thunder Radius');
    debugFolder.add(controls, 'debugShowPerformanceMetrics').name('Performance Metrics');
    debugFolder.add(controls, 'debugShowSurfaceCharge').name('Surface Charge');
    debugFolder.add(controls, 'debugShowChargeOrganization').name('Charge Organization');
    debugFolder.add(controls, 'debugShowSpiderRoutes').name('Spider Routes');
    debugFolder.add(controls, 'debugShowAnvilRoutes').name('Anvil Routes');
    debugFolder.add(controls, 'debugShowCloudPaths').name('Cloud Paths');
    debugFolder.add(controls, 'debugShowLightningProbability').name('Probability Field');

    buildSpawnToolsFolder(folder, callbacks);

    folder.open();
    return { folder, presetCtrl };
  }

  global.LightningV2 = {
    LT,
    LT_NAMES,
    SPAWNABLE_LT_TYPES,
    DEFAULT_SETTINGS,
    PRESETS,
    PERFORMANCE_TIERS,
    MAX_SHADER_STRIKES,
    applyPreset,
    applyPerformanceTier,
    getEffectiveFrequency,
    createBurstState,
    updateBurstState,
    readCharge,
    readCloud,
    readPotential,
    readConductivity,
    readSurfaceCharge,
    analyzeStormElectricalProfile,
    getTypeFrequencyMult,
    routeCloudPath,
    placementForSpiderAnvil,
    cloudGate,
    computeLightningPotentialAt,
    pickOriginFromPotential,
    pickGroundTarget,
    selectTypeForChannel,
    numReturnStrokesForType,
    brightnessForType,
    illuminationRadiusForType,
    isDryLightningType,
    placementForDryStrike,
    isGroundStrike,
    boltTextureIndexForType,
    getChannels,
    strikeChance,
    createEventRecord,
    buildLightningV2GUI,
    shaderRand,
  };
})(typeof window !== 'undefined' ? window : globalThis);
