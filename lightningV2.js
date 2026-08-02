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
    strobe: 4,
  };

  const DEFAULT_SETTINGS = {
    lightningV2Enabled: true,
    lightningPreset: 'Enhanced Realistic',
    useRealisticLightningRatios: false,

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

    enableLightning: true,
    ltSdfQuality: 'Balanced',
    ltDrawSdfBolts: true,

    lightningBrightness: 0.48,
    lightningContrast: 0.9,
    channelThickness: 1.05,
    branchDensity: 1.45,
    branchLength: 1.35,
    flashDuration: 1.0,
    channelGlowDuration: 1.0,
    bloomStrength: 0.7,
    glowStrength: 0.45,
    atmosphericIlluminationStrength: 0.45,
    cloudIlluminationStrength: 0.28,
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

    intracloudChannelVisibility: 0.95,
    cloudToCloudChannelVisibility: 1.0,
    spiderChannelVisibility: 1.05,
    anvilChannelVisibility: 1.0,
    cloudLightningBranchDensity: 1.2,
    cloudLightningBranchLength: 0.45,
    cloudLightningOpacity: 1.0,
    cloudObscurationStrength: 0.55,
    channelIllumRatio: 0.35,
    precipOnlyLightningChance: 0.38,

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
    lightningSpawnStrictness: 1.0,
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
    performanceAutoScaling: true,

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
    debugShowChannelVisibilityMask: false,
    debugShowCloudObscurationMask: false,
    debugShowGeneratedCloudPath: false,
    debugShowRenderedCloudPath: false,
    debugShowBoltGeometryStats: false,
    debugShowBoltDiagnostics: false,
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
      lightningBrightness: 0.62,
      glowStrength: 0.48,
      nighttimeFlashStrength: 0.6,
      branchDensity: 1.1,
      cloudLightningBranchDensity: 1.3,
      cloudLightningBranchLength: 1.25,
      intracloudChannelVisibility: 1.0,
      cloudToCloudChannelVisibility: 1.05,
      spiderChannelVisibility: 1.15,
      anvilChannelVisibility: 1.1,
      channelIllumRatio: 0.5,
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
      cloudLightningBranchDensity: 1.55,
      cloudLightningBranchLength: 1.45,
      intracloudChannelVisibility: 1.1,
      cloudToCloudChannelVisibility: 1.15,
      spiderChannelVisibility: 1.35,
      anvilChannelVisibility: 1.25,
      cloudLightningOpacity: 1.1,
      cloudObscurationStrength: 0.45,
      channelIllumRatio: 0.5,
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

  const MAX_SHADER_STRIKES = 16;

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

  // Maps each slider's UI range to a common 0–100 strike-rate scale.
  const FREQ_UI_SCALE = {
    intracloud: 1,
    cloudToCloud: 1,
    sheet: 5,
    cg: 1,
    cgPositive: 20,
    spider: 20,
    anvilCrawler: 20,
    upward: 50,
    boltFromBlue: 50,
    dry: 20,
    strobe: 8,
  };

  function getEffectiveFrequency(controls, typeKey, stormFactor, profile) {
    if (controls.enableLightning === false)
      return 0;
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
      strobe: controls.strobeLightningFrequency ?? 0.8,
    };
    const uiScale = FREQ_UI_SCALE[typeKey] || 1;
    const stormBoost = 0.75 + stormFactor * 0.5;
    return (map[typeKey] || 0) * uiScale * controls.globalLightningMultiplier * personality * stormBoost;
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

  function getSpawnThresholds(controls, channelId) {
    let cloudTh = controls.cloudLightningThreshold ?? 0.3;
    if (channelId === 'cg')
      cloudTh = controls.cloudGroundLightningThreshold ?? 0.3;
    else if (channelId === 'strobe')
      cloudTh = controls.strobeLightningThreshold ?? 0.3;
    else if (channelId === 'sheet' || channelId === 'flash')
      cloudTh = controls.cloudFlashThreshold ?? 0.25;
    else if (channelId === 'dry')
      cloudTh = Math.max(controls.cloudLightningThreshold ?? 0.3, 0.35);
    const scale = controls.lightningSpawnStrictness ?? 1.0;
    return {
      minCloudGate: (0.34 + cloudTh * 0.56) * scale,
      minChargeMag: (0.32 + cloudTh * 0.52) * scale,
      minPotential: (0.30 + cloudTh * 0.40) * scale,
      minRawCloud: (controls.chargeMinCloudDensity ?? 0.32) * (0.88 + cloudTh * 0.48) * scale,
    };
  }

  /** Min cloud density for in-cloud channel pathing (IC/CC/spider/anvil). */
  function cloudPathMinCloud(controls, channelId) {
    const t = getSpawnThresholds(controls || {}, channelId || 'intracloud');
    return Math.max(0.08, (t.minRawCloud || 0.2) * 0.45);
  }

  function isCloudChannelType(ltType) {
    return ltType === LT.INTRACLOUD || ltType === LT.CLOUD_TO_CLOUD
      || ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER || ltType === LT.SHEET;
  }

  /** Walk dest back toward origin until cloud gate passes. */
  function snapDestToCloud(cache, ox, oy, destX, destY, minCloud) {
    if (!cache || !cache.data)
      return { destX, destY };
    if (readCloud(cache, destX, destY) >= minCloud)
      return { destX, destY };
    let bx = destX;
    let by = destY;
    for (let i = 1; i <= 10; i++) {
      const t = 1.0 - i * 0.09;
      const tx = ox + (destX - ox) * t;
      const ty = oy + (destY - oy) * t;
      if (readCloud(cache, tx, ty) >= minCloud)
        return { destX: tx, destY: ty };
      bx = tx;
      by = ty;
    }
    return { destX: bx, destY: by };
  }

  function isSimInCloudLayer(simX, simY, simResX, simResY, allowGround) {
    if (!Number.isFinite(simX) || !Number.isFinite(simY))
      return false;
    if (simX < 0 || simX > simResX - 1 || simY < 0 || simY > simResY - 1)
      return false;
    if (allowGround)
      return simY >= simResY * 0.02 && simY <= simResY * 0.98;
    return simY >= simResY * 0.07 && simY <= simResY * 0.88;
  }

  function clampLightningSimPos(simX, simY, simResX, simResY, allowGround) {
    const yMin = allowGround ? simResY * 0.02 : simResY * 0.07;
    const yMax = allowGround ? simResY * 0.98 : simResY * 0.88;
    return {
      x: clamp(simX, 0, simResX - 1),
      y: clamp(simY, yMin, yMax),
    };
  }

  function isChargeValidForLtType(charge, ltType, controls, channelId) {
    const t = getSpawnThresholds(controls, channelId || 'intracloud');
    const min = t.minChargeMag;
    const c = Number.isFinite(charge) ? charge : 0;
    if (ltType === LT.CG)
      return c <= -min * 0.88;
    if (ltType === LT.CG_POSITIVE)
      return c >= min * 0.92;
    if (ltType === LT.UPWARD)
      return c >= min * 0.78;
    if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER)
      return c >= min * 0.62;
    if (ltType === LT.BOLT_FROM_BLUE)
      return c <= -min * 0.55;
    return Math.abs(c) >= min * 0.88;
  }

  function isOriginEligibleForStrike(cache, pick, controls, channelId, ltType, simResX, simResY) {
    if (!cache || !pick)
      return false;
    const t = getSpawnThresholds(controls, channelId);
    const ox = pick.originX ?? pick.x;
    const oy = pick.originY ?? pick.y;
    const charge = pick.chargeVal ?? pick.charge ?? readCharge(cache, ox, oy);
    const cloud = pick.cloud ?? readCloud(cache, ox, oy);
    const cg = pick.cloudGate ?? cloudGate(cloud);
    const chargeMag = Math.abs(charge);
    const sx = simResX ?? 1;
    const sy = simResY ?? 1;

    if (!isSimInCloudLayer(ox, oy, sx, sy, false))
      return false;
    if (cloud < t.minRawCloud || cg < t.minCloudGate)
      return false;
    if (chargeMag < t.minChargeMag)
      return false;
    if (chargeMag * cg < t.minChargeMag * t.minCloudGate * 0.90)
      return false;

    if (ltType != null)
      return isChargeValidForLtType(charge, ltType, controls, channelId);

    if (channelId === 'cg')
      return charge <= -t.minChargeMag * 0.75 || charge >= t.minChargeMag * 0.95;
    if (channelId === 'upward')
      return charge >= t.minChargeMag * 0.78;
    if (channelId === 'spider' || channelId === 'anvil')
      return charge >= t.minChargeMag * 0.62;
    return chargeMag >= t.minChargeMag;
  }

  function computeLightningPotentialAt(cache, simX, simY) {
    const charge = readCharge(cache, simX, simY);
    const cloud = readCloud(cache, simX, simY);
    const potential = readPotential(cache, simX, simY);
    const cg = cloudGate(cloud);
    return potential * 0.55 + Math.abs(charge) * cg * 0.35 + cloud * cg * 0.1;
  }

  function pickOriginFromPotential(cache, eventId, slot, numSlots, simResX, simResY, channelId, controls) {
    controls = controls || {};
    let bestScore = -1;
    let best = null;
    const anvilBias = channelId === 'spider' || channelId === 'anvil';
    const thresholds = getSpawnThresholds(controls, channelId);

    for (let c = 0; c < 14; c++) {
      const cs = c * 503 + slot * 131;
      const xSlot = (slot + shaderRand(eventId * 1.37 + cs) * 0.85) / Math.max(numSlots, 1);
      const ox = (xSlot * 0.75 + shaderRand(eventId * 2.11 + cs) * 0.18 + 0.04) * simResX;
      const probeY = anvilBias
        ? (shaderRand(eventId * 3.07 + cs) * 0.35 + 0.48) * simResY
        : (shaderRand(eventId * 3.07 + cs) * 0.75 + 0.12) * simResY;

      for (let v = 0; v < 5; v++) {
        const vy = clamp(probeY + (v - 2) * simResY * 0.05, simResY * 0.05, simResY * 0.92);
        const cloud = readCloud(cache, ox, vy);
        const charge = readCharge(cache, ox, vy);
        const potential = readPotential(cache, ox, vy);
        const cg = cloudGate(cloud);
        const candidate = {
          x: ox, y: vy, charge, cloud, potential,
          originX: ox, originY: vy, chargeVal: charge, cloudGate: cg,
        };
        if (!isOriginEligibleForStrike(cache, candidate, controls, channelId, null, simResX, simResY))
          continue;
        let score = computeLightningPotentialAt(cache, ox, vy);
        score += Math.abs(charge) * 0.25 + cg * 0.18 + potential * 0.12;
        if (anvilBias) score *= 0.55 + cloud * 1.1 + (vy > simResY * 0.42 ? 0.35 : 0.0);
        if (cloud < thresholds.minRawCloud) score *= 0.35;
        const noise = 0.55 + shaderRand(eventId * 5.03 + cs + v * 17) * 0.9;
        if (score * noise > bestScore) {
          bestScore = score * noise;
          best = candidate;
        }
      }
    }
    if (best)
      return best;
    return {
      x: -1, y: -1,
      charge: 0, cloud: 0, potential: 0,
      originX: -1, originY: -1,
      chargeVal: 0, cloudGate: 0, eligible: false,
    };
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

  function scoreCloudCell(cache, x, y, opts) {
    if (!cache || !cache.data) return -1;
    const cloud = readCloud(cache, x, y);
    if (cloud < (opts.minCloud || 0.04)) return -1;
    const pot = readPotential(cache, x, y);
    const chg = readCharge(cache, x, y);
    const cond = readConductivity(cache, x, y);
    let score = cloud * 1.5 + pot * 0.95 + Math.abs(chg) * 0.4 + cond * 0.2;
    if (opts.anvilBias && y > (opts.simResY || 1) * 0.40) score *= 1.0 + cloud * 0.5;
    if (opts.preferOpposite && opts.originCharge !== undefined) {
      const oppose = (opts.originCharge > 0 && chg < 0) || (opts.originCharge < 0 && chg > 0);
      if (oppose) score += Math.min(Math.abs(chg), 0.7) * 0.55;
    }
    if (opts.towardX !== undefined && opts.towardY !== undefined) {
      const dist = Math.hypot(x - opts.towardX, y - opts.towardY);
      const maxD = (opts.simResX || 1) * (opts.towardWeight || 0.12);
      score += (1.0 - clamp(dist / maxD, 0, 1)) * (opts.towardWeight || 0.5);
    }
    if (opts.minDistFrom && opts.minDistFrac) {
      const d = Math.hypot(x - opts.minDistFrom.x, y - opts.minDistFrom.y);
      if (d < (opts.simResX || 1) * opts.minDistFrac) score *= 0.15;
      else score += Math.min(d / (opts.simResX || 1), 0.5) * 0.4;
    }
    return score;
  }

  function chargesOppose(c1, c2) {
    return (c1 > 0.04 && c2 < -0.04) || (c1 < -0.04 && c2 > 0.04);
  }

  function scaleBoltProfile(seed, ltType) {
    const r = shaderRand(seed + 211);
    const h = shaderRand(seed + 313);
    let lenScale = 0.58 + r * 1.15;
    let heightScale = 0.45 + h * 1.05;
    let branchScale = 0.78 + shaderRand(seed + 419) * 0.72;
    if (ltType === LT.SPIDER)
      lenScale *= 0.95 + shaderRand(seed + 521) * 0.45;
    if (ltType === LT.ANVIL_CRAWLER)
      lenScale *= 0.85 + shaderRand(seed + 523) * 0.60;
    if (ltType === LT.SHEET) {
      lenScale *= 0.65 + shaderRand(seed + 525) * 1.0;
      heightScale *= 1.2;
    }
    if (ltType === LT.INTRACLOUD) {
      lenScale *= 0.70 + shaderRand(seed + 527) * 0.55;
      heightScale *= 0.85 + shaderRand(seed + 529) * 0.45;
    }
    if (ltType === LT.CLOUD_TO_CLOUD) {
      lenScale *= 0.90 + shaderRand(seed + 531) * 0.55;
      heightScale *= 0.70 + shaderRand(seed + 533) * 0.50;
    }
    return { lenScale, heightScale, branchScale };
  }

  function rollPrecipOnlyStrike(seed, ltType, controls) {
    // IC/CC are visible bolt channels — never hide them as precip-only shafts.
    if (ltType === LT.INTRACLOUD || ltType === LT.CLOUD_TO_CLOUD)
      return false;
    const base = controls.precipOnlyLightningChance ?? 0.38;
    let p = base;
    if (ltType === LT.SHEET)
      p = Math.min(0.62, base + 0.12);
    else if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER)
      p = Math.min(0.55, base + 0.08);
    else if (ltType === LT.CG || ltType === LT.CG_POSITIVE)
      p = base * 0.45;
    return shaderRand(seed + 727) < p;
  }

  function encodeStrikeMetaY(strike) {
    if (strike.precipOnly) {
      if (strike.flashOnly)
        return strike.flashInFront ? 1.05 : 0.05;
      return 1.15;
    }
    if (strike.flashOnly)
      return strike.flashInFront ? 1.0 : 0.0;
    return (strike.branchCount || 3) / 8.0;
  }

  /** Pick origin/dest with opposing charge and enforced vertical separation. */
  function findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, opts) {
    opts = opts || {};
    const seed = eventId * 29 + slot * 401;
    let ox = pick.originX;
    let oy = pick.originY;
    let originCharge = pick.chargeVal ?? readCharge(cache, ox, oy);

    if (opts.refineOrigin !== false) {
      let bestOriginScore = scoreCloudCell(cache, ox, oy, { simResX, simResY, originCharge });
      for (let i = 0; i < 10; i++) {
        const tx = clamp(ox + (shaderRand(seed + i * 7) - 0.5) * simResX * 0.06, 0, simResX - 1);
        const ty = clamp(oy + (shaderRand(seed + i * 11) - 0.5) * simResY * 0.08, simResY * 0.06, simResY * 0.92);
        const chg = readCharge(cache, tx, ty);
        if (Math.sign(chg || 0) !== Math.sign(originCharge || 0) && Math.abs(originCharge) > 0.05)
          continue;
        const score = scoreCloudCell(cache, tx, ty, { simResX, simResY, originCharge });
        if (score > bestOriginScore) {
          bestOriginScore = score;
          ox = tx;
          oy = ty;
          originCharge = chg;
        }
      }
    }

    const minYDelta = simResY * (opts.minYDeltaFrac ?? 0.035);
    const maxYDelta = simResY * (opts.maxYDeltaFrac ?? 0.28);
    const minDist = simResX * (opts.minDistFrac ?? 0.06);
    const maxDist = simResX * (opts.maxDistFrac ?? 0.55);
    const samples = opts.samples ?? 32;
    const horizontal = opts.horizontal ?? false;
    let bestDest = { x: ox, y: oy, score: -1, charge: 0 };

    for (let i = 0; i < samples; i++) {
      const rx = shaderRand(seed * 1.3 + i * 17);
      const ry = shaderRand(seed * 2.1 + i * 23);
      let tx;
      let ty;
      if (horizontal) {
        const dir = shaderRand(seed + i * 31) > 0.5 ? 1 : -1;
        tx = clamp(ox + dir * (minDist + rx * (maxDist - minDist)), 0, simResX - 1);
        const ySign = shaderRand(seed + i * 41) > 0.5 ? 1 : -1;
        ty = clamp(oy + ySign * (minYDelta + ry * (maxYDelta - minYDelta)), simResY * 0.06, simResY * 0.92);
      } else {
        const angle = rx * Math.PI * 2;
        const dist = minDist + ry * (maxDist - minDist);
        tx = clamp(ox + Math.cos(angle) * dist, 0, simResX - 1);
        ty = clamp(oy + Math.sin(angle) * dist * (0.25 + shaderRand(seed + i * 29) * 0.55),
          simResY * 0.06, simResY * 0.92);
      }
      const destCharge = readCharge(cache, tx, ty);
      if (opts.requireOpposite !== false && !chargesOppose(originCharge, destCharge))
        continue;
      const yDelta = Math.abs(ty - oy);
      if (yDelta < minYDelta)
        continue;
      const minCloud = opts.minCloud ?? 0.08;
      let score = scoreCloudCell(cache, tx, ty, {
        simResX, simResY, originCharge, preferOpposite: true,
        minCloud,
        minDistFrom: { x: ox, y: oy }, minDistFrac: (opts.minDistFrac ?? 0.06) * 0.5,
        anvilBias: opts.anvilBias,
      });
      score += Math.min(yDelta / simResY, 0.35) * 0.55;
      score += Math.min(Math.abs(destCharge), 0.8) * 0.4;
      const noise = 0.75 + shaderRand(seed + i * 37) * 0.5;
      if (score * noise > bestDest.score)
        bestDest = { x: tx, y: ty, score: score * noise, charge: destCharge };
    }

    if (bestDest.score < 0) {
      const minCloud = opts.minCloud ?? 0.08;
      const span = ensureMinimumSpan(ox, oy, ox, oy, simResX, simResY,
        opts.minDistFrac ?? 0.08, horizontal, {
          vertFrac: 0.12 + shaderRand(seed + 99) * 0.28,
          slopeSign: shaderRand(seed + 107) > 0.5 ? 1 : -1,
          lenScale: opts.lenScale ?? 1,
          cache,
          minCloud,
        });
      let fx = span.destX;
      let fy = span.destY;
      // Prefer in-cloud samples near the span target; never keep clear air.
      let bestCloud = { x: fx, y: fy, score: scoreCloudCell(cache, fx, fy, { simResX, simResY, minCloud }) };
      for (let j = 0; j < 12; j++) {
        const tx = clamp(fx + (shaderRand(seed + j * 43) - 0.5) * simResX * 0.10, 0, simResX - 1);
        const ty = clamp(fy + (shaderRand(seed + j * 47) - 0.5) * simResY * 0.12, simResY * 0.06, simResY * 0.92);
        const score = scoreCloudCell(cache, tx, ty, { simResX, simResY, minCloud, originCharge, preferOpposite: true });
        if (score > bestCloud.score) bestCloud = { x: tx, y: ty, score };
      }
      if (bestCloud.score < 0) {
        const snapped = snapDestToCloud(cache, ox, oy, fx, fy, minCloud);
        fx = snapped.destX;
        fy = snapped.destY;
      } else {
        fx = bestCloud.x;
        fy = bestCloud.y;
      }
      bestDest = { x: fx, y: fy, score: 1, charge: readCharge(cache, fx, fy) };
    }

    return {
      originX: ox,
      originY: oy,
      originCharge,
      destX: bestDest.x,
      destY: bestDest.y,
      destCharge: bestDest.charge,
    };
  }

  function findDistantChargedCell(cache, origin, eventId, slot, simResX, simResY, opts) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    const originCharge = origin.chargeVal ?? readCharge(cache, ox, oy);
    let best = { x: ox, y: oy, score: -1 };
    const samples = opts.samples || 28;
    const yMin = opts.yMin ?? simResY * 0.38;
    const yMax = opts.yMax ?? simResY * 0.90;

    for (let i = 0; i < samples; i++) {
      const rx = shaderRand(eventId * 3.71 + slot * 47 + i * 13);
      const ry = shaderRand(eventId * 5.13 + slot * 61 + i * 17);
      const tx = clamp(ox + (rx - 0.5) * simResX * (opts.spreadX || 0.55), 0, simResX - 1);
      const ty = clamp(yMin + ry * (yMax - yMin), simResY * 0.08, simResY * 0.92);
      const score = scoreCloudCell(cache, tx, ty, {
        minCloud: opts.minCloud || 0.05,
        anvilBias: opts.anvilBias,
        simResX, simResY,
        minDistFrom: { x: ox, y: oy },
        minDistFrac: opts.minDistFrac || 0.14,
        originCharge,
      });
      const noise = 0.7 + shaderRand(eventId * 7.3 + i * 23) * 0.6;
      if (score * noise > best.score) best = { x: tx, y: ty, score: score * noise };
    }
    return best;
  }

  function findOpposingChargeCell(cache, origin, eventId, slot, simResX, simResY, minDistFrac) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    const originCharge = origin.chargeVal ?? readCharge(cache, ox, oy);
    let best = { x: ox, y: oy, score: -1 };

    for (let i = 0; i < 24; i++) {
      const angle = shaderRand(eventId * 2.9 + slot * 37 + i * 11) * Math.PI * 2;
      const dist = (minDistFrac + shaderRand(eventId + i * 19) * 0.14) * simResX;
      const tx = clamp(ox + Math.cos(angle) * dist, 0, simResX - 1);
      const ty = clamp(oy + Math.sin(angle) * simResY * 0.14, simResY * 0.08, simResY * 0.9);
      const score = scoreCloudCell(cache, tx, ty, {
        simResX, simResY, originCharge, preferOpposite: true,
        minDistFrom: { x: ox, y: oy }, minDistFrac: minDistFrac * 0.6,
      });
      if (score > best.score) best = { x: tx, y: ty, score };
    }
    return best;
  }

  function findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, opts) {
    const points = [{ x: ox, y: oy }];
    let cx = ox;
    let cy = oy;
    const steps = opts.steps || 20;
    const horizontal = opts.horizontal || false;
    const originCharge = opts.originCharge;
    const minCloud = opts.minCloud ?? 0.08;

    for (let step = 0; step < steps; step++) {
      const t = (step + 1) / steps;
      const targetX = ox + (destX - ox) * t;
      const targetY = oy + (destY - oy) * t;
      let best = { x: cx, y: cy, score: -1 };
      const probes = horizontal ? 13 : 9;
      const slopeMag = Math.abs(destY - oy) / Math.max(Math.abs(destX - ox), simResX * 0.02);
      const stepX = (horizontal ? 0.020 : 0.016) * simResX;
      const stepY = (horizontal ? 0.008 + slopeMag * 0.038 : 0.012) * simResY;
      const baseAngle = Math.atan2(destY - oy, destX - ox);

      for (let a = 0; a < probes; a++) {
        const spread = horizontal ? 0.22 : 0.38;
        const theta = baseAngle + (a - (probes >> 1)) * spread;
        const nx = clamp(cx + Math.cos(theta) * stepX, 0, simResX - 1);
        const ny = clamp(cy + Math.sin(theta) * stepY, simResY * 0.08, simResY * 0.92);
        const score = scoreCloudCell(cache, nx, ny, {
          minCloud, simResX, simResY, originCharge,
          towardX: targetX, towardY: targetY, towardWeight: 0.65,
          anvilBias: horizontal,
        });
        if (score > best.score) best = { x: nx, y: ny, score };
      }
      // Stay in cloud — do not step into clear air toward a distant dest.
      if (best.score < 0) break;
      cx = best.x;
      cy = best.y;
      points.push({ x: cx, y: cy });
    }
    const last = points[points.length - 1];
    return { points, destX: last.x, destY: last.y };
  }

  function usesBentPath(ltType, opts) {
    return ltType === LT.SHEET || ltType === LT.STROBE || ltType === LT.INTRACLOUD
      || ltType === LT.CLOUD_TO_CLOUD || !!(opts && opts.strobeBurst);
  }

  /** Point C between A and B, offset off the straight chord into charged cloud. */
  function findPathMidpoint(cache, ax, ay, bx, by, originCharge, eventId, slot, simResX, simResY, seed, minCloud) {
    const mx = (ax + bx) * 0.5;
    const my = (ay + by) * 0.5;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.max(Math.hypot(dx, dy), simResX * 0.02);
    const perpX = -dy / len;
    const perpY = dx / len;
    const offsetFrac = 0.14 + shaderRand(seed + 601) * 0.32;
    const side = shaderRand(seed + 613) > 0.5 ? 1 : -1;
    let cx = mx + perpX * len * offsetFrac * side;
    let cy = my + perpY * len * offsetFrac * side;
    const gate = minCloud ?? 0.08;

    if (cache) {
      let best = { x: cx, y: cy, score: -1 };
      for (let i = 0; i < 14; i++) {
        const tx = clamp(cx + (shaderRand(seed + i * 29) - 0.5) * simResX * 0.08, 0, simResX - 1);
        const ty = clamp(cy + (shaderRand(seed + i * 31) - 0.5) * simResY * 0.10, simResY * 0.06, simResY * 0.92);
        const score = scoreCloudCell(cache, tx, ty, {
          minCloud: gate, simResX, simResY, originCharge,
          towardX: mx, towardY: my, towardWeight: 0.55,
          anvilBias: true,
        });
        if (score > best.score) best = { x: tx, y: ty, score };
      }
      if (best.score > 0) { cx = best.x; cy = best.y; }
      else {
        const snapped = snapDestToCloud(cache, mx, my, cx, cy, gate);
        cx = snapped.destX;
        cy = snapped.destY;
      }
    }
    return { x: cx, y: cy };
  }

  function buildPathViaMidpoint(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, opts) {
    const seed = eventId * 29 + slot * 401 + ox * 0.01;
    const minCloud = opts.minCloud ?? 0.08;
    const mid = findPathMidpoint(cache, ox, oy, destX, destY, opts.originCharge,
      eventId, slot, simResX, simResY, seed, minCloud);
    const totalSteps = opts.steps || 14;
    const stepsA = Math.max(4, Math.floor(totalSteps * 0.52));
    const stepsB = Math.max(4, Math.floor(totalSteps * 0.52));
    const pathA = findChargedPath(cache, ox, oy, mid.x, mid.y, eventId, slot, simResX, simResY, {
      ...opts, steps: stepsA, minCloud,
    });
    const pathB = findChargedPath(cache, mid.x, mid.y, destX, destY, eventId, slot + 791, simResX, simResY, {
      ...opts, steps: stepsB, minCloud,
    });
    const points = pathA.points.concat(pathB.points.slice(1));
    return {
      points,
      destX: pathB.destX,
      destY: pathB.destY,
      midX: mid.x,
      midY: mid.y,
      viaMidpoint: true,
    };
  }

  /** Resolve IC/CC path; fall back to bent chord if charge pathfinding collapses. */
  function resolveCloudBoltPath(cache, ox, oy, spanDestX, spanDestY, eventId, slot, simResX, simResY, pathOpts) {
    const minCloud = pathOpts.minCloud ?? 0.08;
    const snappedSpan = snapDestToCloud(cache, ox, oy, spanDestX, spanDestY, minCloud);
    spanDestX = snappedSpan.destX;
    spanDestY = snappedSpan.destY;
    const path = buildPathViaMidpoint(
      cache, ox, oy, spanDestX, spanDestY, eventId, slot, simResX, simResY,
      { ...pathOpts, minCloud });
    const plen = pathLengthNorm(path.points || [], simResX, simResY);
    if (path.points && path.points.length >= 2 && plen >= 0.02) {
      return {
        points: path.points,
        destX: path.destX,
        destY: path.destY,
        midX: path.midX,
        midY: path.midY,
        viaMidpoint: true,
      };
    }
    const mid = findPathMidpoint(
      cache, ox, oy, spanDestX, spanDestY, pathOpts.originCharge,
      eventId, slot, simResX, simResY, eventId * 29 + slot * 401 + 911, minCloud);
    const lastGood = path.points && path.points.length
      ? path.points[path.points.length - 1]
      : { x: ox, y: oy };
    const destSnap = snapDestToCloud(cache, ox, oy, spanDestX, spanDestY, minCloud);
    const useDest = destSnap.destX;
    const useDestY = destSnap.destY;
    // Prefer last in-cloud path point over forcing a clear-air span dest.
    const finalDestX = readCloud(cache, useDest, useDestY) >= minCloud ? useDest : lastGood.x;
    const finalDestY = readCloud(cache, useDest, useDestY) >= minCloud ? useDestY : lastGood.y;
    return {
      points: [{ x: ox, y: oy }, { x: mid.x, y: mid.y }, { x: finalDestX, y: finalDestY }],
      destX: finalDestX,
      destY: finalDestY,
      midX: mid.x,
      midY: mid.y,
      viaMidpoint: true,
    };
  }

  function ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY, minFrac, horizontal, spanOpts) {
    spanOpts = spanOpts || {};
    const dx = destX - ox;
    const dy = destY - oy;
    const len = Math.hypot(dx, dy);
    const minLen = simResX * minFrac * (spanOpts.lenScale ?? 1);
    const minYDelta = simResY * (spanOpts.minYDeltaFrac ?? (horizontal ? 0.04 : 0.03));
    let outX = destX;
    let outY = destY;
    if (!(len >= minLen && Math.abs(dy) >= minYDelta)) {
      if (horizontal) {
        const dirSign = dx >= 0 ? 1 : (dx < 0 ? -1 : (shaderRand(ox * 0.01 + oy) > 0.5 ? 1 : -1));
        const slopeSign = spanOpts.slopeSign ?? (dy >= 0 ? 1 : -1);
        const vertFrac = spanOpts.vertFrac ?? 0.10 + shaderRand(ox * 0.02 + oy) * 0.32;
        outX = clamp(ox + dirSign * minLen, 0, simResX - 1);
        outY = clamp(oy + slopeSign * Math.max(minLen * vertFrac, minYDelta), simResY * 0.06, simResY * 0.92);
      } else {
        const angle = Math.atan2(dy || -0.12, dx || 0.1);
        outX = clamp(ox + Math.cos(angle) * minLen, 0, simResX - 1);
        outY = clamp(oy + Math.sin(angle) * minLen * 0.35, simResY * 0.06, simResY * 0.92);
      }
    }
    if (spanOpts.cache && spanOpts.minCloud != null) {
      const snapped = snapDestToCloud(spanOpts.cache, ox, oy, outX, outY, spanOpts.minCloud);
      outX = snapped.destX;
      outY = snapped.destY;
    }
    return { destX: outX, destY: outY };
  }

  /**
   * Multi-level geometric branches. Tips are cloud-gated when cache is provided.
   * Returns { x,y,ex,ey, level, intensity }.
   */
  function buildBoltBranches(routePoints, seed, branchCount, simResX, branchScale, opts) {
    opts = opts || {};
    branchScale = branchScale ?? 1;
    const branches = [];
    if (!routePoints || routePoints.length < 2) return branches;
    const pathLen = routePoints.length;
    const density = opts.branchDensity ?? 1;
    const lengthMul = opts.branchLength ?? 1;
    const cache = opts.cache;
    const minCloud = opts.minCloud ?? 0.08;
    const simResY = opts.simResY || simResX * 0.5;
    const primaryCount = Math.max(4, Math.min(8, Math.round(branchCount * density)));

    // Branch length from full trunk path length (not densified step spacing).
    let totalPathLen = 0;
    for (let i = 1; i < pathLen; i++) {
      totalPathLen += Math.hypot(
        routePoints[i].x - routePoints[i - 1].x,
        routePoints[i].y - routePoints[i - 1].y);
    }
    totalPathLen = Math.max(totalPathLen, simResX * 0.08);

    const tryTip = (px, py, ang, blen, vertBias) => {
      let ex = px + Math.cos(ang) * blen;
      let ey = py + Math.sin(ang) * blen * vertBias;
      if (!cache) return { ex, ey, ok: true };
      // Shorten to last in-cloud point instead of hard-rejecting the fork.
      let lastOk = null;
      for (let t = 1; t >= 0.02; t -= 0.08) {
        const tx = px + (ex - px) * t;
        const ty = py + (ey - py) * t;
        if (scoreCloudCell(cache, tx, ty, { simResX, simResY, minCloud }) >= 0) {
          lastOk = { ex: tx, ey: ty, ok: true };
          break;
        }
      }
      if (lastOk) {
        const got = Math.hypot(lastOk.ex - px, lastOk.ey - py);
        if (got < blen * 0.02) return { ex, ey, ok: false };
        return lastOk;
      }
      return { ex, ey, ok: false };
    };

    for (let b = 0; b < primaryCount; b++) {
      const attachIdx = 1 + Math.floor(shaderRand(seed + b * 17) * Math.max(1, pathLen - 2));
      const p = routePoints[clamp(attachIdx, 0, pathLen - 1)];
      const next = routePoints[clamp(attachIdx + 1, 0, pathLen - 1)];
      const segAngle = Math.atan2(next.y - p.y, next.x - p.x);
      const ang = segAngle + (shaderRand(seed + b * 31) - 0.5) * 1.8;
      const blen = Math.min(
        totalPathLen * (0.12 + shaderRand(seed + b * 43) * 0.23) * branchScale * lengthMul,
        simResX * 0.18 * branchScale * lengthMul);
      const vertBias = 0.35 + shaderRand(seed + b * 53) * 0.65;
      const tip = tryTip(p.x, p.y, ang, blen, vertBias);
      if (!tip.ok) continue;

      // Mid-knot for 2-segment zig-zag packing.
      const mdx = tip.ex - p.x;
      const mdy = tip.ey - p.y;
      const mlen = Math.max(Math.hypot(mdx, mdy), 1e-3);
      const mpx = -mdy / mlen;
      const mpy = mdx / mlen;
      const moff = (shaderRand(seed + b * 59) - 0.5) * blen * 0.28;
      let mx = p.x + mdx * 0.5 + mpx * moff;
      let my = p.y + mdy * 0.5 + mpy * moff;
      if (cache && scoreCloudCell(cache, mx, my, { simResX, simResY, minCloud }) < 0) {
        mx = p.x + mdx * 0.5;
        my = p.y + mdy * 0.5;
      }

      branches.push({
        x: p.x, y: p.y,
        ex: tip.ex, ey: tip.ey,
        mx, my,
        level: 0,
        intensity: 0.72 + shaderRand(seed + b * 61) * 0.2,
      });

      // Level-1 secondaries off ~45% of primary tips.
      if (shaderRand(seed + b * 71) < 0.45) {
        const subCount = 1 + (shaderRand(seed + b * 73) > 0.5 ? 1 : 0);
        for (let s = 0; s < subCount; s++) {
          const sang = ang + (shaderRand(seed + b * 79 + s * 13) - 0.5) * 1.4;
          const slen = blen * (0.35 + shaderRand(seed + b * 83 + s) * 0.35);
          const stip = tryTip(tip.ex, tip.ey, sang, slen, 0.5 + shaderRand(seed + b * 89 + s) * 0.5);
          if (!stip.ok) continue;
          branches.push({
            x: tip.ex, y: tip.ey,
            ex: stip.ex, ey: stip.ey,
            level: 1,
            intensity: 0.42 + shaderRand(seed + b * 97 + s) * 0.18,
          });
          // Level-2 wisps off ~25% of L1 tips.
          if (shaderRand(seed + b * 101 + s * 7) < 0.25) {
            const wang = sang + (shaderRand(seed + b * 103 + s) - 0.5) * 1.2;
            const wlen = slen * (0.30 + shaderRand(seed + b * 107 + s) * 0.30);
            const wtip = tryTip(stip.ex, stip.ey, wang, wlen, 0.45 + shaderRand(seed + b * 109 + s) * 0.4);
            if (!wtip.ok) continue;
            branches.push({
              x: stip.ex, y: stip.ey,
              ex: wtip.ex, ey: wtip.ey,
              level: 2,
              intensity: 0.28 + shaderRand(seed + b * 113 + s) * 0.12,
            });
          }
        }
      }
    }
    return branches;
  }

  /**
   * Perpendicular micro-jitter for ragged bolt paths.
   * Keeps endpoints fixed; cloud-gates midpoints when cache/minCloud provided.
   */
  function jitterRoutePoints(points, seed, simResX, simResY, ampFrac, cache, minCloud) {
    if (!points || points.length < 3) return points ? points.slice() : [];
    const amp = simResX * (ampFrac != null ? ampFrac : 0.008);
    const out = [{ x: points[0].x, y: points[0].y }];
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const next = points[i + 1];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.max(Math.hypot(dx, dy), 1e-3);
      const px = -dy / len;
      const py = dx / len;
      const off = (shaderRand(seed + i * 19.7) - 0.5) * 2.0 * amp
        + (shaderRand(seed + i * 41.3) - 0.5) * amp * 0.55;
      let nx = points[i].x + px * off;
      let ny = points[i].y + py * off;
      nx = clamp(nx, 0, simResX - 1);
      ny = clamp(ny, simResY * 0.06, simResY * 0.92);
      if (cache && minCloud != null && readCloud(cache, nx, ny) < minCloud) {
        // Keep original if jitter left the cloud.
        nx = points[i].x;
        ny = points[i].y;
      }
      out.push({ x: nx, y: ny });
    }
    out.push({ x: points[points.length - 1].x, y: points[points.length - 1].y });
    return out;
  }

  /** Resample route to K cloud-validated knots for GPU polyline packing. */
  function resampleRouteKnots(routePoints, knotCount, cache, minCloud, simResX, simResY) {
    if (!routePoints || routePoints.length < 2)
      return routePoints ? routePoints.slice() : [];
    const n = Math.max(2, Math.min(knotCount || 4, routePoints.length));
    if (routePoints.length <= n)
      return routePoints.slice();
    const knots = [];
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const idx = Math.min(routePoints.length - 1, Math.round(t * (routePoints.length - 1)));
      let p = routePoints[idx];
      if (cache && minCloud != null && k > 0 && k < n - 1) {
        const score = scoreCloudCell(cache, p.x, p.y, { simResX, simResY, minCloud });
        if (score < 0) {
          // Search nearby route points for in-cloud substitute.
          for (let d = 1; d < 6; d++) {
            const a = routePoints[clamp(idx - d, 0, routePoints.length - 1)];
            const b = routePoints[clamp(idx + d, 0, routePoints.length - 1)];
            if (scoreCloudCell(cache, a.x, a.y, { simResX, simResY, minCloud }) >= 0) { p = a; break; }
            if (scoreCloudCell(cache, b.x, b.y, { simResX, simResY, minCloud }) >= 0) { p = b; break; }
          }
        }
      }
      knots.push({ x: p.x, y: p.y });
    }
    // Deduplicate consecutive identical knots.
    const out = [knots[0]];
    for (let i = 1; i < knots.length; i++) {
      if (Math.hypot(knots[i].x - out[out.length - 1].x, knots[i].y - out[out.length - 1].y) > 0.5)
        out.push(knots[i]);
    }
    if (out.length < 2)
      out.push(routePoints[routePoints.length - 1]);
    return out;
  }

  function pathLengthNorm(points, simResX, simResY) {
    if (!points || points.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < points.length; i++)
      len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    const diag = Math.hypot(simResX, simResY);
    return clamp(len / Math.max(diag, 1), 0, 1.5);
  }

  function findChargedCloudAbove(cache, origin, eventId, slot, simResX, simResY, originCharge) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    let best = { x: ox, y: oy, score: -1 };
    for (let i = 0; i < 22; i++) {
      const tx = clamp(ox + (shaderRand(eventId * 2.1 + slot * 29 + i * 11) - 0.5) * simResX * 0.12, 0, simResX - 1);
      const ty = clamp(oy - simResY * (0.08 + shaderRand(eventId + i * 17) * 0.22), simResY * 0.06, oy - simResY * 0.02);
      const score = scoreCloudCell(cache, tx, ty, { simResX, simResY, originCharge, minCloud: 0.05 });
      if (score > best.score) best = { x: tx, y: ty, score };
    }
    return best;
  }

  function pickBFTBGroundTarget(cache, origin, eventId, slot, simResX, simResY, controls) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    const dir = shaderRand(eventId * 4.7 + slot * 53) > 0.5 ? 1 : -1;
    let best = { x: ox, y: simResY * 0.03, score: -1 };
    for (let i = 0; i < 16; i++) {
      const tx = clamp(ox + dir * simResX * (0.12 + shaderRand(eventId + i * 23) * 0.22), 0, simResX - 1);
      const ty = clamp(simResY * 0.01 + shaderRand(eventId * 3.1 + i * 7) * simResY * 0.08, 0, simResY * 0.14);
      let cond = readConductivity(cache, tx, ty);
      if (!controls.enableGroundConductivity) cond = 0.5;
      const score = cond + shaderRand(eventId * 6.3 + i) * 0.15;
      if (score > best.score) best = { x: tx, y: ty, score };
    }
    return best;
  }

  /**
   * Sheet (and legacy flash) placement — diffuse cloud glow, no bolt channels.
   * 50% in-front of cloud layer, 50% behind.
   */
  function buildFlashPlacement(ltType, pick, cache, eventId, slot, simResX, simResY, seed, controls, opts) {
    opts = opts || {};
    const profile = scaleBoltProfile(seed, ltType);
    let ox = pick.originX;
    let oy = pick.originY;
    let cx = ox;
    let cy = oy;

    if (cache && (ltType === LT.CLOUD_TO_CLOUD || ltType === LT.INTRACLOUD || ltType === LT.SHEET)) {
      const pair = findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, {
        minYDeltaFrac: ltType === LT.SHEET ? 0.04 * profile.heightScale : 0.025 * profile.heightScale,
        maxYDeltaFrac: ltType === LT.SHEET ? 0.30 * profile.heightScale : 0.20 * profile.heightScale,
        minDistFrac: ltType === LT.SHEET ? 0.05 * profile.lenScale : 0.03 * profile.lenScale,
        maxDistFrac: ltType === LT.SHEET ? 0.32 * profile.lenScale : 0.16 * profile.lenScale,
        lenScale: profile.lenScale,
        horizontal: ltType === LT.SHEET,
        anvilBias: ltType === LT.SHEET,
      });
      ox = pair.originX;
      oy = pair.originY;
      cx = pair.destX;
      cy = pair.destY;
    } else if (ltType === LT.CLOUD_TO_CLOUD) {
      const dest = findOpposingChargeCell(cache, pick, eventId, slot, simResX, simResY, 0.06);
      cx = (ox + dest.x) * 0.5;
      cy = (oy + dest.y) * 0.5;
    } else if (ltType === LT.INTRACLOUD) {
      const dest = findOpposingChargeCell(cache, pick, eventId, slot, simResX, simResY, 0.03);
      cx = (ox + dest.x) * 0.5;
      cy = (oy + dest.y) * 0.5;
    } else if (ltType === LT.SHEET) {
      cx = ox + (shaderRand(seed + 13) - 0.5) * simResX * 0.10 * profile.lenScale;
      cy = oy + (shaderRand(seed + 17) - 0.5) * simResY * 0.12 * profile.heightScale;
    }

    const originMag = Math.abs(pick.chargeVal ?? readCharge(cache, ox, oy));
    let flashSize = 0.28 + clamp((originMag - 0.12) / 0.65, 0, 1) * 0.52
      + shaderRand(eventId * 5.13 + slot * 97 + 311) * 0.55;
    if (ltType === LT.SHEET)
      flashSize *= 1.65;
    if (opts.dryBurst && ltType === LT.INTRACLOUD)
      flashSize *= 0.68;

    let midX = null;
    let midY = null;
    let viaMidpoint = false;
    let routePoints = [{ x: ox, y: oy }, { x: cx, y: cy }];
    const bent = ltType === LT.SHEET || opts.strobeBurst;
    if (bent) {
      const mid = findPathMidpoint(cache, ox, oy, cx, cy,
        pick.chargeVal ?? (cache ? readCharge(cache, ox, oy) : 0),
        eventId, slot, simResX, simResY, seed + 811);
      midX = mid.x;
      midY = mid.y;
      viaMidpoint = true;
      routePoints = [{ x: ox, y: oy }, { x: midX, y: midY }, { x: cx, y: cy }];
    }

    return {
      originX: ox,
      originY: oy,
      destX: cx,
      destY: cy,
      midX,
      midY,
      viaMidpoint,
      routePoints,
      originCharge: pick.chargeVal,
      destCharge: cache ? readCharge(cache, cx, cy) : undefined,
      branches: [],
      branchCount: 0,
      pathLengthNorm: 0,
      visibilityMult: 1,
      flashSize,
      flashInFront: shaderRand(seed + 91) < 0.5,
      flashOnly: true,
    };
  }

  function isFlashOnlyType(ltType, _strobeBurst) {
    // IC/CC use bolt channels; sheet stays diffuse flash.
    return ltType === LT.SHEET;
  }

  function isStrobeChannel(channelId) {
    return channelId === 'strobe';
  }

  /** Strobe burst composition: sheet + intracloud flashes + anvil/spider crawlers. */
  function selectTypeForStrobeBurst(eventId, slot, charge, controls) {
    controls = controls || {};
    const r = shaderRand(eventId * 5.31 + slot * 73.0 + 1913.0);
    const pool = [
      [0.34, LT.SHEET],
      [0.33, LT.INTRACLOUD],
      [0.17, LT.SPIDER],
      [0.16, LT.ANVIL_CRAWLER],
    ].filter(([, type]) => isChargeValidForLtType(charge, type, controls, 'strobe'));
    if (pool.length === 0)
      return null;
    const sum = pool.reduce((acc, [w]) => acc + w, 0);
    let pick = r * sum;
    for (const [w, type] of pool) {
      pick -= w;
      if (pick <= 0)
        return type;
    }
    return pool[pool.length - 1][1];
  }

  function strobeBurstStrikeCount(eventId, channel, maxBolts, controls) {
    const intensity = controls.strobeLightningIntensity ?? 2.0;
    const base = 3 + Math.floor(shaderRand(eventId * 29 + channel.salt + 401) * 3);
    const extra = Math.floor(intensity * 0.8);
    return Math.min(maxBolts, base + extra);
  }

  function isDryChannel(channelId) {
    return channelId === 'dry';
  }

  /** Dry lightning: intracloud flash burst, optionally capped with one small spider crawler. */
  function dryBurstMode(eventId) {
    const r = shaderRand(eventId * 7.13 + 6311.0);
    if (r < 0.22) return 'spider_only';
    if (r < 0.58) return 'ic_plus_spider';
    return 'ic_only';
  }

  function dryBurstStrikeCount(eventId, channel, maxBolts, controls, mode) {
    if (mode === 'spider_only') return 1;
    const base = 2 + Math.floor(shaderRand(eventId * 23 + channel.salt + 631) * 2);
    return Math.min(maxBolts, mode === 'ic_plus_spider' ? base + 1 : base);
  }

  function selectTypeForDryBurst(eventId, slot, mode, numStrikes, charge, controls) {
    controls = controls || {};
    const icOk = isChargeValidForLtType(charge, LT.INTRACLOUD, controls, 'dry');
    const spiderOk = isChargeValidForLtType(charge, LT.SPIDER, controls, 'dry');
    if (mode === 'spider_only')
      return spiderOk ? LT.SPIDER : null;
    if (mode === 'ic_plus_spider' && slot === numStrikes - 1)
      return spiderOk ? LT.SPIDER : (icOk ? LT.INTRACLOUD : null);
    return icOk ? LT.INTRACLOUD : null;
  }

  function jitterPickNearAnchor(anchor, eventId, slot, simResX, simResY, cache, controls, channelId) {
    controls = controls || {};
    const thresholds = getSpawnThresholds(controls, channelId || 'intracloud');
    const minCloud = thresholds.minRawCloud;
    const spreadX = simResX * (0.06 + shaderRand(eventId + slot * 37) * 0.10);
    const spreadY = simResY * (0.03 + shaderRand(eventId + slot * 53) * 0.06);
    let ox = clamp(anchor.originX + (shaderRand(eventId * 2.1 + slot * 11) - 0.5) * spreadX, 0, simResX - 1);
    let oy = clamp(anchor.originY + (shaderRand(eventId * 3.7 + slot * 19) - 0.5) * spreadY, simResY * 0.12, simResY * 0.88);
    if (cache) {
      let best = { x: ox, y: oy, score: -1 };
      for (let i = 0; i < 10; i++) {
        const tx = clamp(ox + (shaderRand(eventId + i * 23) - 0.5) * spreadX * 0.5, 0, simResX - 1);
        const ty = clamp(oy + (shaderRand(eventId + i * 31) - 0.5) * spreadY * 0.5, simResY * 0.10, simResY * 0.90);
        const score = scoreCloudCell(cache, tx, ty, { simResX, simResY, minCloud });
        if (score > best.score)
          best = { x: tx, y: ty, score };
      }
      if (best.score > 0) {
        ox = best.x;
        oy = best.y;
      }
    }
    const cloud = cache ? readCloud(cache, ox, oy) : (anchor.cloud ?? 0);
    const charge = cache ? readCharge(cache, ox, oy) : (anchor.chargeVal ?? 0);
    const potential = cache ? readPotential(cache, ox, oy) : (anchor.potential ?? 0);
    const cg = cloudGate(cloud);
    return {
      originX: ox,
      originY: oy,
      cloud,
      cloudGate: cg,
      chargeVal: charge,
      charge,
      potential,
    };
  }

  /**
   * V2.6 — Bolt geometry for bolt-type lightning (renderer shared; only paths differ).
   */
  function buildBoltGeometry(ltType, pick, cache, profile, eventId, slot, simResX, simResY, controls, opts) {
    opts = opts || {};
    controls = controls || {};
    if (isFlashOnlyType(ltType)) return null;
    const seed = eventId * 29 + slot * 401 + pick.originX * 0.01;
    const boltProfile = scaleBoltProfile(seed, ltType);
    const cloudType = isCloudChannelType(ltType);
    const pathMinCloud = cloudType ? cloudPathMinCloud(controls, 'intracloud') : 0.04;
    let ox = pick.originX;
    let oy = pick.originY;
    let originCharge = pick.chargeVal ?? readCharge(cache, ox, oy);
    let destX = ox;
    let destY = oy;
    let routePoints = [{ x: ox, y: oy }];
    let branchCount = 3;
    let horizontal = false;
    let midX = null;
    let midY = null;
    let viaMidpoint = false;

    if (ltType === LT.CG || ltType === LT.CG_POSITIVE) {
      branchCount = ltType === LT.CG_POSITIVE ? 5 : 4;
      const dest = pickGroundTarget(cache, pick, eventId, slot, simResX, simResY, controls);
      destX = dest.x;
      destY = dest.y;
      routePoints = [{ x: ox, y: oy }, { x: destX, y: destY }];
    } else if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER) {
      horizontal = true;
      const isSpider = ltType === LT.SPIDER;
      const small = isSpider && opts.smallSpider;
      branchCount = small ? 3 : Math.max(3, Math.floor(
        (isSpider ? 5 : 4) * boltProfile.branchScale + shaderRand(seed + 7) * 2));
      const pair = findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, {
        horizontal: true,
        anvilBias: true,
        requireOpposite: true,
        minCloud: pathMinCloud,
        lenScale: boltProfile.lenScale * (small ? 0.55 : 1),
        minDistFrac: small ? 0.05 : (isSpider ? 0.08 : 0.06) * boltProfile.lenScale,
        maxDistFrac: small ? 0.18 : (isSpider ? 0.62 : 0.48) * boltProfile.lenScale,
        minYDeltaFrac: small ? 0.03 : (isSpider ? 0.04 : 0.06) * boltProfile.heightScale,
        maxYDeltaFrac: small ? 0.14 : (isSpider ? 0.22 : 0.34) * boltProfile.heightScale,
        samples: small ? 18 : (isSpider ? 44 : 34),
      });
      ox = pair.originX;
      oy = pair.originY;
      originCharge = pair.originCharge;
      destX = pair.destX;
      destY = pair.destY;
      const minFrac = small ? 0.06 : (isSpider ? 0.10 : 0.08) * boltProfile.lenScale;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY, minFrac, true, {
        vertFrac: 0.08 + shaderRand(seed + 83) * (small ? 0.18 : 0.38) * boltProfile.heightScale,
        slopeSign: pair.destY >= oy ? 1 : -1,
        lenScale: boltProfile.lenScale,
        minYDeltaFrac: (small ? 0.03 : 0.05) * boltProfile.heightScale,
        cache, minCloud: pathMinCloud,
      });
      destX = span.destX;
      destY = span.destY;
      const pathOpts = {
        steps: small ? 12 : Math.floor((isSpider ? 28 : 22) * (0.75 + boltProfile.lenScale * 0.35)),
        horizontal: true, originCharge, minCloud: pathMinCloud,
      };
      const path = usesBentPath(ltType, opts)
        ? buildPathViaMidpoint(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, pathOpts)
        : findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, pathOpts);
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
      if (path.viaMidpoint) {
        midX = path.midX;
        midY = path.midY;
        viaMidpoint = true;
      }
    } else if (ltType === LT.CLOUD_TO_CLOUD) {
      horizontal = true;
      branchCount = 4;
      const pair = findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, {
        horizontal: true,
        requireOpposite: true,
        minCloud: pathMinCloud,
        lenScale: boltProfile.lenScale,
        minDistFrac: 0.10 * boltProfile.lenScale,
        maxDistFrac: 0.42 * boltProfile.lenScale,
        minYDeltaFrac: 0.03 * boltProfile.heightScale,
        maxYDeltaFrac: 0.22 * boltProfile.heightScale,
        samples: 36,
      });
      ox = pair.originX;
      oy = pair.originY;
      originCharge = pair.originCharge;
      destX = pair.destX;
      destY = pair.destY;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY,
        0.12 * boltProfile.lenScale, true, {
          vertFrac: 0.08 + shaderRand(seed + 83) * 0.28 * boltProfile.heightScale,
          slopeSign: destY >= oy ? 1 : -1,
          lenScale: boltProfile.lenScale,
          minYDeltaFrac: 0.03 * boltProfile.heightScale,
          cache, minCloud: pathMinCloud,
        });
      const spanDestX = span.destX;
      const spanDestY = span.destY;
      const path = resolveCloudBoltPath(
        cache, ox, oy, spanDestX, spanDestY, eventId, slot, simResX, simResY,
        { steps: 28, horizontal: true, originCharge, minCloud: pathMinCloud });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
      midX = path.midX;
      midY = path.midY;
      viaMidpoint = true;
    } else if (ltType === LT.INTRACLOUD) {
      horizontal = Math.abs(shaderRand(seed + 41) - 0.5) > 0.12;
      branchCount = 4;
      const pair = findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, {
        horizontal,
        requireOpposite: true,
        minCloud: pathMinCloud,
        lenScale: boltProfile.lenScale,
        minDistFrac: 0.05 * boltProfile.lenScale,
        maxDistFrac: 0.28 * boltProfile.lenScale,
        minYDeltaFrac: 0.025 * boltProfile.heightScale,
        maxYDeltaFrac: 0.18 * boltProfile.heightScale,
        samples: 28,
      });
      ox = pair.originX;
      oy = pair.originY;
      originCharge = pair.originCharge;
      destX = pair.destX;
      destY = pair.destY;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY,
        0.07 * boltProfile.lenScale, horizontal, {
          vertFrac: 0.06 + shaderRand(seed + 85) * 0.22 * boltProfile.heightScale,
          slopeSign: destY >= oy ? 1 : -1,
          lenScale: boltProfile.lenScale,
          minYDeltaFrac: 0.025 * boltProfile.heightScale,
          cache, minCloud: pathMinCloud,
        });
      const spanDestX = span.destX;
      const spanDestY = span.destY;
      const path = resolveCloudBoltPath(
        cache, ox, oy, spanDestX, spanDestY, eventId, slot, simResX, simResY, {
          steps: 26,
          horizontal: Math.abs(spanDestX - ox) > Math.abs(spanDestY - oy) * 0.85,
          originCharge,
          minCloud: pathMinCloud,
        });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
      midX = path.midX;
      midY = path.midY;
      viaMidpoint = true;
    } else if (ltType === LT.SHEET) {
      branchCount = Math.max(2, Math.floor(3 * boltProfile.branchScale + shaderRand(seed + 9)));
      const pair = findChargedEndpointPair(cache, pick, eventId, slot, simResX, simResY, {
        horizontal: shaderRand(seed + 61) > 0.35,
        anvilBias: true,
        minCloud: pathMinCloud,
        lenScale: boltProfile.lenScale,
        minDistFrac: 0.05 * boltProfile.lenScale,
        maxDistFrac: 0.38 * boltProfile.lenScale,
        minYDeltaFrac: 0.04 * boltProfile.heightScale,
        maxYDeltaFrac: 0.32 * boltProfile.heightScale,
        samples: 36,
      });
      ox = pair.originX;
      oy = pair.originY;
      originCharge = pair.originCharge;
      destX = pair.destX;
      destY = pair.destY;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY,
        0.06 * boltProfile.lenScale, shaderRand(seed + 67) > 0.5, {
          vertFrac: 0.12 + shaderRand(seed + 71) * 0.35 * boltProfile.heightScale,
          slopeSign: destY >= oy ? 1 : -1,
          lenScale: boltProfile.lenScale,
          cache, minCloud: pathMinCloud,
        });
      destX = span.destX;
      destY = span.destY;
      const pathOpts = {
        steps: Math.floor(18 + boltProfile.lenScale * 12),
        horizontal: Math.abs(destX - ox) > Math.abs(destY - oy) * 1.2,
        originCharge,
        minCloud: pathMinCloud,
      };
      const path = buildPathViaMidpoint(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, pathOpts);
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
      midX = path.midX;
      midY = path.midY;
      viaMidpoint = true;
    } else if (ltType === LT.UPWARD) {
      branchCount = 3;
      const destCell = findChargedCloudAbove(cache, pick, eventId, slot, simResX, simResY, originCharge);
      destX = destCell.x;
      destY = destCell.y;
      const path = findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, {
        steps: 18, originCharge,
      });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
    } else if (ltType === LT.BOLT_FROM_BLUE) {
      branchCount = 5;
      const dest = pickBFTBGroundTarget(cache, pick, eventId, slot, simResX, simResY, controls);
      destX = dest.x;
      destY = dest.y;
      const span = ensureMinimumSpan(ox, oy, destX, destY, simResX, simResY, 0.14, true);
      destX = span.destX;
      destY = span.destY;
      const path = findChargedPath(cache, ox, oy, destX, destY, eventId, slot, simResX, simResY, {
        steps: 28, horizontal: true, originCharge,
      });
      routePoints = path.points;
      destX = path.destX;
      destY = path.destY;
    } else if (ltType === LT.STROBE) {
      branchCount = 2;
      destY = clamp(oy + simResY * 0.04, 0, simResY - 1);
      const mid = findPathMidpoint(cache, ox, oy, destX, destY, originCharge,
        eventId, slot, simResX, simResY, seed + 821);
      midX = mid.x;
      midY = mid.y;
      viaMidpoint = true;
      routePoints = [{ x: ox, y: oy }, { x: midX, y: midY }, { x: destX, y: destY }];
    } else {
      return null;
    }

    // Densify short routes so CG/simple chords can receive ragged mid-jitter.
    if (routePoints.length === 2) {
      const a = routePoints[0];
      const b = routePoints[1];
      const denser = [a];
      const densifyN = ltType === LT.CG || ltType === LT.CG_POSITIVE ? 8 : 5;
      for (let k = 1; k < densifyN; k++) {
        const t = k / densifyN;
        denser.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      denser.push(b);
      routePoints = denser;
    }
    // Ragged micro-jitter on the trunk (cloud-gated for in-cloud types).
    routePoints = jitterRoutePoints(
      routePoints, seed + 1201, simResX, simResY,
      cloudType ? 0.010 : 0.008,
      cloudType ? cache : null,
      cloudType ? pathMinCloud : null);
    // IC/CC fractal look needs dense CPU knots (≥10) so SDF segments stay jagged.
    if (cloudType && routePoints.length < 10) {
      const target = 10;
      const denser = [routePoints[0]];
      for (let k = 1; k < target; k++) {
        const t = k / target;
        const f = t * (routePoints.length - 1);
        const i0 = Math.floor(f);
        const i1 = Math.min(i0 + 1, routePoints.length - 1);
        const u = f - i0;
        const a = routePoints[i0];
        const b = routePoints[i1];
        denser.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      }
      denser.push(routePoints[routePoints.length - 1]);
      routePoints = denser;
      routePoints = jitterRoutePoints(
        routePoints, seed + 1403, simResX, simResY,
        0.006, cache, pathMinCloud);
    }
    if (routePoints.length >= 2) {
      destX = routePoints[routePoints.length - 1].x;
      destY = routePoints[routePoints.length - 1].y;
      ox = routePoints[0].x;
      oy = routePoints[0].y;
    }
    if (viaMidpoint && routePoints.length >= 3) {
      const midIdx = Math.floor(routePoints.length * 0.5);
      midX = routePoints[midIdx].x;
      midY = routePoints[midIdx].y;
    }

    let branches = buildBoltBranches(routePoints, seed, branchCount, simResX, boltProfile.branchScale, {
      cache: cloudType ? cache : null,
      minCloud: pathMinCloud,
      simResY,
      branchDensity: controls.branchDensity ?? controls.cloudLightningBranchDensity ?? 1,
      branchLength: controls.branchLength ?? controls.cloudLightningBranchLength ?? 1,
    });
    // Ensure L0 branches carry a mid-knot for 2-segment GPU zig-zag packing.
    for (let bi = 0; bi < branches.length; bi++) {
      const br = branches[bi];
      if ((br.level || 0) > 0) continue;
      if (Number.isFinite(br.mx) && Number.isFinite(br.my)) continue;
      const dx = br.ex - br.x;
      const dy = br.ey - br.y;
      const len = Math.max(Math.hypot(dx, dy), 1e-3);
      const px = -dy / len;
      const py = dx / len;
      const off = (shaderRand(seed + bi * 53 + 331) - 0.5) * simResX * 0.012;
      let jx = (br.x + br.ex) * 0.5 + px * off;
      let jy = (br.y + br.ey) * 0.5 + py * off;
      if (cloudType && cache && readCloud(cache, jx, jy) < pathMinCloud) {
        jx = (br.x + br.ex) * 0.5;
        jy = (br.y + br.ey) * 0.5;
      }
      br.mx = jx;
      br.my = jy;
    }
    const pathNorm = pathLengthNorm(routePoints, simResX, simResY);
    const cloud = readCloud(cache, ox, oy);
    const pierce = controls.cloudObscurationStrength ?? 0.55;
    const visibilityMult = clamp(0.88 + cloud * 0.12 * pierce, 0.88, 1.2);

    return {
      originX: ox,
      originY: oy,
      destX,
      destY,
      midX,
      midY,
      viaMidpoint,
      routePoints,
      branches,
      branchCount,
      pathLengthNorm: pathNorm,
      visibilityMult,
      flashSize: pathNorm,
      originCharge,
      destCharge: readCharge(cache, destX, destY),
    };
  }

  const buildCloudBoltGeometry = buildBoltGeometry;

  function routeCloudPath(cache, origin, eventId, slot, simResX, simResY) {
    const ox = origin.x ?? origin.originX;
    const oy = origin.y ?? origin.originY;
    const destCell = findOpposingChargeCell(cache, origin, eventId, slot, simResX, simResY, 0.06);
    const path = findChargedPath(cache, ox, oy, destCell.x, destCell.y, eventId, slot, simResX, simResY, {
      steps: 14,
      originCharge: origin.chargeVal ?? readCharge(cache, ox, oy),
    });
    return { destX: path.destX, destY: path.destY, points: path.points };
  }

  function placementForSpiderAnvil(origin, profile, simResX, simResY, seed, ltType) {
    const x = origin.x ?? origin.originX;
    const y = origin.y ?? origin.originY;
    const isSpider = ltType === LT.SPIDER;
    const anvilBoost = profile ? profile.anvilFactor : 0.4;
    const horizFrac = (isSpider ? 0.52 : 0.46) * (0.75 + anvilBoost * 0.65) * (0.85 + shaderRand(seed + 2) * 0.55);
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
    const charge = origin.charge ?? 0;
    const chargeMag = Math.abs(charge);
    const isHigh = chargeMag > 0.42 || origin.potential > 0.55;

    if (isDry && r < 0.72) return LT.INTRACLOUD;
    switch (channelId) {
      case 'intracloud': return LT.INTRACLOUD;
      case 'cc': return r > 0.35 ? LT.CLOUD_TO_CLOUD : LT.INTRACLOUD;
      case 'sheet': return LT.SHEET;
      case 'strobe': return selectTypeForStrobeBurst(eventId, slot, charge, controls);
      case 'cg':
        if (charge >= 0.18 && isHigh && r < 0.12 * (controls.positiveCgFrequency + 0.1))
          return LT.CG_POSITIVE;
        if (charge > -0.12)
          return null;
        return LT.CG;
      case 'spider':
        if (charge < 0.08)
          return null;
        return LT.SPIDER;
      case 'anvil':
        if (charge < 0.08)
          return null;
        return LT.ANVIL_CRAWLER;
      case 'upward':
        if (charge < 0.12)
          return null;
        return LT.UPWARD;
      case 'bftb':
        if (charge > -0.08)
          return null;
        return LT.BOLT_FROM_BLUE;
      case 'dry': return LT.INTRACLOUD;
      default: return LT.SHEET;
    }
  }

  function numReturnStrokesForType(ltType, originMag, seed, controls) {
    if (ltType === LT.DRY) return 1;
    let base = 1;
    if (shaderRand(seed + 77) < controls.returnStrokeProbability) base = 2;
    if (ltType === LT.CG_POSITIVE && shaderRand(seed + 113) < 0.62) base = 3;
    if (ltType === LT.CG_POSITIVE && shaderRand(seed + 131) < 0.28) base = Math.min(controls.maxReturnStrokes, base + 1);
    if (shaderRand(seed + 199) < 0.08 && originMag > 0.5) base = Math.min(controls.maxReturnStrokes, base + 1);
    return clamp(base, 1, controls.maxReturnStrokes);
  }

  function brightnessForType(ltType, originMag, controls, opts) {
    opts = opts || {};
    const mag = clamp(Number.isFinite(originMag) ? originMag : 0.3, 0.0, 1.2);
    let b = 0.28 + mag * 0.32;
    if (ltType === LT.DRY) b *= 0.18;
    else if (ltType === LT.CG_POSITIVE) b *= 1.38;
    else b *= 0.95;
    if (opts.dryBurst) {
      if (ltType === LT.SPIDER) b *= 0.40;
      else if (ltType === LT.INTRACLOUD) b *= 0.52;
    }
    const bright = (controls.lightningBrightness ?? 0.55) * b;
    return clamp(bright, 0.04, 1.2);
  }

  function illuminationRadiusForType(ltType, controls) {
    let r = controls.maxIlluminationRadius;
    if (ltType === LT.DRY) r *= 0.32;
    else if (ltType === LT.CG_POSITIVE) r *= 2.2;
    else if (ltType === LT.SPIDER || ltType === LT.ANVIL_CRAWLER) r *= 1.5;
    else r *= 1.1;
    return r;
  }

  function isDryLightningType(ltType) {
    return ltType === LT.DRY;
  }

  /** @deprecated Single-strike dry flash — dry channel now uses IC burst + optional small spider. */
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

  /** Prefer cleaner trunk atlas variants for cloud channels (geometric branches supply forks). */
  function boltTextureIndexForType(ltType, seed) {
    if (ltType === LT.CG_POSITIVE) return Math.floor(shaderRand(seed + 5) * 2);
    if (isCloudChannelType(ltType))
      return Math.floor(shaderRand(seed + 1) * 2); // variants 0–1: cleaner trunk
    return Math.floor(shaderRand(seed + 1) * 4);
  }

  function getChannels(controls, stormActivity, profile) {
    const ch = [
      { id: 'intracloud', salt: 311, freq: () => getEffectiveFrequency(controls, 'intracloud', stormActivity, profile) },
      { id: 'cc', salt: 911, freq: () => getEffectiveFrequency(controls, 'cloudToCloud', stormActivity, profile) },
      { id: 'sheet', salt: 1511, freq: () => getEffectiveFrequency(controls, 'sheet', stormActivity, profile) },
      { id: 'strobe', salt: 1913, freq: () => getEffectiveFrequency(controls, 'strobe', stormActivity, profile) },
      { id: 'cg', salt: 2917, freq: () => getEffectiveFrequency(controls, 'cg', stormActivity, profile) },
      { id: 'spider', salt: 3911, freq: () => getEffectiveFrequency(controls, 'spider', stormActivity, profile) },
      { id: 'anvil', salt: 4513, freq: () => getEffectiveFrequency(controls, 'anvilCrawler', stormActivity, profile) },
      { id: 'upward', salt: 5117, freq: () => getEffectiveFrequency(controls, 'upward', stormActivity, profile) },
      { id: 'bftb', salt: 5719, freq: () => getEffectiveFrequency(controls, 'boltFromBlue', stormActivity, profile) },
      { id: 'dry', salt: 6311, freq: () => getEffectiveFrequency(controls, 'dry', stormActivity, profile) },
    ];
    return ch.filter(c => c.freq() > 0);
  }

  function strikeChance(freq, burstIntensity, clustering) {
    const norm = clamp(freq / 100, 0, 1);
    let chance = norm * 0.14 + norm * norm * 0.11 + 0.001;
    chance = Math.min(0.58, chance);
    chance *= Math.max(0.08, burstIntensity);
    if (clustering > 0.5) chance *= 1.0 + (clustering - 0.5) * 0.45;
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

  function buildLightningV2GUI(datGui, controls, callbacks) {
    const folder = datGui.addFolder('Lightning');
    const onChanged = () => {
      controls.lightningPreset = 'Custom';
      if (callbacks && callbacks.onSettingsChanged)
        callbacks.onSettingsChanged();
    };
    const onFreqChanged = () => {
      controls.useRealisticLightningRatios = false;
      onChanged();
    };

    // Flat controls only — frequency, look, performance, force spawn.
    if (controls.enableLightning == null) controls.enableLightning = true;
    if (controls.ltDrawSdfBolts == null) controls.ltDrawSdfBolts = true;
    if (!controls.ltSdfQuality) controls.ltSdfQuality = 'Balanced';

    folder.add(controls, 'enableLightning').name('Enable Lightning').onChange(onChanged);
    folder.add(controls, 'globalLightningMultiplier', 0, 100, 0.5).name('Frequency').onChange(onFreqChanged);
    folder.add(controls, 'cloudToGroundFrequency', 0, 100, 0.5).name('Cloud-to-Ground').onChange(onFreqChanged);
    folder.add(controls, 'intracloudFrequency', 0, 100, 0.5).name('Intracloud').onChange(onFreqChanged);
    folder.add(controls, 'spiderLightningFrequency', 0, 100, 0.5).name('Spider').onChange(onFreqChanged);

    folder.add(controls, 'lightningBrightness', 0.1, 3, 0.05).name('Brightness').onChange(onChanged);
    folder.add(controls, 'lightningContrast', 0.1, 3, 0.05).name('Contrast').onChange(onChanged);
    folder.add(controls, 'glowStrength', 0, 3, 0.05).name('Glow').onChange(onChanged);
    folder.add(controls, 'flashDuration', 0.2, 3, 0.05).name('Flash Duration').onChange(onChanged);

    folder.add(controls, 'enableThunder').name('Thunder').onChange(onChanged);
    folder.add(controls, 'thunderVolume', 0, 3, 0.05).name('Thunder Volume').onChange(onChanged);

    folder.add(controls, 'ltSdfQuality', ['Fast', 'Balanced', 'Full']).name('Bolt Quality').onChange(onChanged);
    folder.add(controls, 'ltDrawSdfBolts').name('Draw Bolts').onChange(onChanged);

    if (callbacks && callbacks.forceSpawnLightningType) {
      const actions = {
        'Force CG': () => callbacks.forceSpawnLightningType(LT.CG),
        'Force Spider': () => callbacks.forceSpawnLightningType(LT.SPIDER),
      };
      folder.add(actions, 'Force CG');
      folder.add(actions, 'Force Spider');
    }

    folder.open();
    return { folder, presetCtrl: null };
  }

  const MIN_LIGHTNING_FIRE_INTENSITY = 0.002;

  function vegetationInfluenceJS(veg) {
      const grass = Math.min(veg, 50);
      const forest = Math.max(veg - 50, 0);
      return grass * 0.38 + forest + 0.08;
    }

  function computeStormChargeReadiness(cache, simResX, simResY) {
      if (!cache || !cache.data) return 0.2;
      let peakPotential = 0;
      let peakCharge = 0;
      let eligible = 0;
      let cells = 0;
      const step = Math.max(1, Math.floor(cache.cacheW / 12));
      for (let py = 0; py < cache.cacheH; py += step) {
        for (let px = 0; px < cache.cacheW; px += step) {
          const i = (py * cache.cacheW + px) * 4;
          const charge = Math.abs(cache.data[i]);
          const cloud = cache.data[i + 1];
          const potential = cache.data[i + 2];
          const cg = cloudGate(cloud);
          cells++;
          if (cloud > 0.07 && cg > 0.18) {
            eligible++;
            peakPotential = Math.max(peakPotential, potential);
            peakCharge = Math.max(peakCharge, charge * cg);
          }
        }
      }
      const coverage = eligible / Math.max(cells, 1);
      const mag = peakPotential * 0.64 + peakCharge * 0.36;
      return clamp(mag * 0.58 + coverage * 0.42, 0, 1);
    }

  function rollLightningSpawn(channels, getStrikeChance, stormActivity, chargeReadiness, iterNum, validateChannel, globalMult) {
      if (!channels || channels.length === 0) return null;
      const readiness = clamp(chargeReadiness, 0, 1);
      if (readiness < 0.18) return null;
  
      const mult = clamp(globalMult ?? 1, 0, 100);
  
      let aggChance = 0;
      const weights = [];
      for (const ch of channels) {
        let w = getStrikeChance(ch);
        if (ch.id === 'intracloud') w *= 2.8;
        else if (ch.id === 'cc') w *= 1.35;
        weights.push(w);
        aggChance += w;
      }
      if (aggChance <= 0) return null;
  
      const stormGate = clamp(stormActivity * 0.85 + 0.12, 0.1, 1.0);
      const spawnCap = Math.min(0.95, 0.12 * mult);
      const globalChance = Math.min(spawnCap, aggChance * 0.26) * readiness * stormGate;
      if (shaderRand(iterNum * 1.37 + 911.0) >= globalChance) return null;
  
      const sum = weights.reduce((a, b) => a + b, 0);
      for (let attempt = 0; attempt < 5; attempt++) {
        let r = shaderRand(iterNum * 7.31 + 613.0 + attempt * 83.0) * sum;
        let pick = channels[channels.length - 1];
        for (let i = 0; i < channels.length; i++) {
          r -= weights[i];
          if (r <= 0) {
            pick = channels[i];
            break;
          }
        }
        if (validateChannel(iterNum, pick)) return pick;
      }
      return null;
    }

  function isCgStrikeType(ltType) {
      return ltType === LT.CG || ltType === LT.CG_POSITIVE;
    }

  function calcFireIntensityJS(veg, soilMoist, precip) {
      return Math.max(
        vegetationInfluenceJS(veg) * 0.00032 - soilMoist * 0.00020 - precip * 0.02,
        0);
    }

  function canSurfaceSupportFire(wallType, veg, soilMoist, precip) {
      if (wallType === 3 || wallType === 27) // already on fire
        return false;
      // LAND (1), SUBURBAN (7), FOREST2 (26)
      if (wallType !== 1 && wallType !== 7 && wallType !== 26)
        return false;
      return calcFireIntensityJS(veg, soilMoist, precip) >= MIN_LIGHTNING_FIRE_INTENSITY;
    }

  function rollCgLightningFireChance(ltType, fireIntensity, seed, controls) {
      controls = controls || {};
      // Default on; optional guiControls.cgLightningFireEnabled can disable.
      if (controls.cgLightningFireEnabled === false)
        return false;
      if (!isCgStrikeType(ltType))
        return false;
      // Flat 50/50 chance at the strike point (override via cgLightningFireChance).
      const chance = clamp(
        controls.cgLightningFireChance != null ? controls.cgLightningFireChance : 0.5,
        0, 1);
      return shaderRand(seed + 947.3) < chance;
    }

  global.LightningV2 = {
    LT,
    LT_NAMES,
    SPAWNABLE_LT_TYPES,
    DEFAULT_SETTINGS,
    PRESETS,
    PERFORMANCE_TIERS,
    MAX_SHADER_STRIKES,
    cloudPathMinCloud,
    isCloudChannelType,
    isCgStrikeType,
    resampleRouteKnots,
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
    buildBoltGeometry,
    buildFlashPlacement,
    isFlashOnlyType,
    isStrobeChannel,
    selectTypeForStrobeBurst,
    strobeBurstStrikeCount,
    isDryChannel,
    dryBurstMode,
    dryBurstStrikeCount,
    selectTypeForDryBurst,
    jitterPickNearAnchor,
    rollPrecipOnlyStrike,
    encodeStrikeMetaY,
    findChargedEndpointPair,
    scaleBoltProfile,
    buildCloudBoltGeometry,
    findChargedPath,
    pathLengthNorm,
    placementForSpiderAnvil,
    cloudGate,
    getSpawnThresholds,
    isOriginEligibleForStrike,
    isChargeValidForLtType,
    isSimInCloudLayer,
    clampLightningSimPos,
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
    rollCgLightningFireChance,
    canSurfaceSupportFire,
    calcFireIntensityJS,
    isCgStrikeType,
    rollLightningSpawn,
    computeStormChargeReadiness,
    strikeChance,
    createEventRecord,
    buildLightningV2GUI,
    shaderRand,
  };
})(typeof window !== 'undefined' ? window : globalThis);
