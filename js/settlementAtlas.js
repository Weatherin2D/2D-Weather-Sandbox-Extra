/**
 * Urban / suburban settlement catalog, wall-type helpers, and runtime atlas baker.
 * Extra looks are painted in the same side-view silhouette style as surfaceTextureMap.png
 * and appended below the 7 builtin strips (texture unit 5, no extra sampler).
 */
(function(global) {
  'use strict';

  const STRIP_W = 4096;
  const STRIP_H = 512;
  const BUILTIN_STRIPS = 7;
  const EXTRA_STRIPS = 21;
  const TOTAL_STRIPS = BUILTIN_STRIPS + EXTRA_STRIPS;

  const WALLTYPE_URBAN = 4;
  const WALLTYPE_SUBURBAN = 7;
  const WALLTYPE_AMERICAN_SUBURBAN = 28;
  const WALLTYPE_URBAN_VARIANTS_BEGIN = 29;
  const WALLTYPE_URBAN_VARIANTS_END = 39;
  const WALLTYPE_SUBURBAN_VARIANTS_BEGIN = 40;
  const WALLTYPE_SUBURBAN_VARIANTS_END = 49;

  const URBAN_TYPES = [
    { name: 'Downtown Skyline', wallType: WALLTYPE_URBAN, height: 400, strip: 0 },
    { name: 'Mid-rise City', wallType: 29, height: 120, strip: 7 },
    { name: 'Historic Old Town', wallType: 30, height: 80, strip: 8 },
    { name: 'Brownstone Rows', wallType: 31, height: 35, strip: 9 },
    { name: 'Waterfront Docks', wallType: 32, height: 70, strip: 10 },
    { name: 'Financial Towers', wallType: 33, height: 400, strip: 11 },
    { name: 'Housing Blocks', wallType: 34, height: 90, strip: 12 },
    { name: 'Stadium District', wallType: 35, height: 80, strip: 13 },
    { name: 'Civic Center', wallType: 36, height: 110, strip: 14 },
    { name: 'Market District', wallType: 37, height: 40, strip: 15 },
    { name: 'Brutalist Towers', wallType: 38, height: 150, strip: 16 },
    { name: 'Small Downtown', wallType: 39, height: 45, strip: 17 },
  ];

  const SUBURBAN_TYPES = [
    { name: 'Gabled Suburb', wallType: WALLTYPE_SUBURBAN, height: 35, strip: -1 },
    { name: 'American Tract', wallType: WALLTYPE_AMERICAN_SUBURBAN, height: 55, strip: 6 },
    { name: 'Townhouses', wallType: 40, height: 40, strip: 18 },
    { name: 'Ranch Houses', wallType: 41, height: 25, strip: 19 },
    { name: 'McMansions', wallType: 42, height: 55, strip: 20 },
    { name: 'Garden Apartments', wallType: 43, height: 45, strip: 21 },
    { name: 'Mobile Homes', wallType: 44, height: 20, strip: 22 },
    { name: 'Victorian Street', wallType: 45, height: 40, strip: 23 },
    { name: 'Mediterranean', wallType: 46, height: 30, strip: 24 },
    { name: 'Cottage Lane', wallType: 47, height: 28, strip: 25 },
    { name: 'Duplex Split-level', wallType: 48, height: 32, strip: 26 },
    { name: 'Strip Commercial', wallType: 49, height: 35, strip: 27 },
  ];

  function isAnyUrban(t) {
    return t === WALLTYPE_URBAN || (t >= WALLTYPE_URBAN_VARIANTS_BEGIN && t <= WALLTYPE_URBAN_VARIANTS_END);
  }
  function isAnySuburban(t) {
    return t === WALLTYPE_SUBURBAN || t === WALLTYPE_AMERICAN_SUBURBAN
      || (t >= WALLTYPE_SUBURBAN_VARIANTS_BEGIN && t <= WALLTYPE_SUBURBAN_VARIANTS_END);
  }
  function isUrbanLike(t) { return isAnyUrban(t) || t === WALLTYPE_AMERICAN_SUBURBAN; }
  function isSoftSuburban(t) { return isAnySuburban(t) && t !== WALLTYPE_AMERICAN_SUBURBAN; }
  function isSettlementWall(t) { return isAnyUrban(t) || isAnySuburban(t); }
  function isLandSurfaceWall(t) {
    if (t === 1 || t === 3 || t === 5 || t === 6 || t === 26 || t === 27)
      return true;
    if (isAnyUrban(t) || isAnySuburban(t))
      return true;
    if (t >= 10 && t <= 17)
      return true;
    return false;
  }

  function urbanVariantIndex(name) {
    const i = URBAN_TYPES.findIndex(function(t) { return t.name === name; });
    return i >= 0 ? i : 0;
  }
  function suburbanVariantIndex(name) {
    const i = SUBURBAN_TYPES.findIndex(function(t) { return t.name === name; });
    return i >= 0 ? i : 0;
  }
  function urbanWallTypeFromVariant(v) {
    v = Math.max(0, Math.min(11, v | 0));
    return URBAN_TYPES[v].wallType;
  }
  function suburbanWallTypeFromVariant(v) {
    v = Math.max(0, Math.min(11, v | 0));
    return SUBURBAN_TYPES[v].wallType;
  }
  function guiOptions(list) {
    const o = {};
    for (let i = 0; i < list.length; i++)
      o[list[i].name] = list[i].name;
    return o;
  }

  function mulberry32(a) {
    return function() {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function fillBuilding(ctx, x, groundY, w, h, shade, winGapX, winGapY, rng) {
    x = x | 0; w = Math.max(4, w | 0); h = Math.max(6, h | 0);
    const y = groundY - h;
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000000';
    const winW = Math.max(1, Math.min(3, (winGapX * 0.45) | 0));
    const winH = Math.max(1, Math.min(4, (winGapY * 0.45) | 0));
    for (let py = y + 3; py < y + h - 3; py += winGapY) {
      for (let px = x + 2; px < x + w - 2; px += winGapX) {
        if (rng() > 0.12)
          ctx.fillRect(px, py, winW, winH);
      }
    }
  }

  function drawSpire(ctx, cx, topY, h, shade) {
    ctx.fillStyle = shade;
    ctx.fillRect(cx - 1, topY - h, 2, h);
    ctx.fillRect(cx - 3, topY - 4, 6, 3);
  }

  function drawCrane(ctx, x, groundY, h, rng) {
    const mastX = x + 4;
    ctx.fillStyle = '#c8c8c8';
    ctx.fillRect(mastX, groundY - h, 3, h);
    const arm = 18 + (rng() * 22) | 0;
    ctx.fillRect(mastX - 2, groundY - h, arm, 3);
    ctx.fillRect(mastX + arm - 8, groundY - h + 3, 2, 10 + (rng() * 12) | 0);
  }

  function drawDome(ctx, cx, topY, r, shade) {
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(cx, topY, r, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 2, topY - r - 8, 4, 10);
  }

  function paintUrbanSkyline(ctx, w, h, opts) {
    const rng = mulberry32(opts.seed);
    const groundY = h;
    ctx.clearRect(0, 0, w, h);
    let x = 4;
    while (x < w - 8) {
      const gap = opts.gapMin + (rng() * (opts.gapMax - opts.gapMin + 1)) | 0;
      const bw = opts.minW + (rng() * (opts.maxW - opts.minW + 1)) | 0;
      let bh = (opts.minH + rng() * (opts.maxH - opts.minH)) * h | 0;
      if (opts.step && rng() < 0.35)
        bh = Math.min(h - 4, bh + ((rng() * 40) | 0));
      const g = 210 + ((rng() * 40) | 0);
      const shade = opts.tint
        ? opts.tint(g, rng)
        : 'rgb(' + g + ',' + g + ',' + Math.min(255, g + 8) + ')';
      fillBuilding(ctx, x, groundY, bw, bh, shade, opts.winGapX, opts.winGapY, rng);
      if (opts.spireChance && rng() < opts.spireChance)
        drawSpire(ctx, x + (bw >> 1), groundY - bh, 12 + (rng() * 28) | 0, shade);
      if (opts.onBuilding)
        opts.onBuilding(ctx, x, groundY, bw, bh, rng, shade);
      x += bw + gap;
    }
  }

  function paintMidRise(ctx, w, h) {
    paintUrbanSkyline(ctx, w, h, {
      seed: 1101, minW: 28, maxW: 70, minH: 0.42, maxH: 0.88,
      gapMin: 2, gapMax: 8, winGapX: 5, winGapY: 6, step: true,
    });
  }

  function paintHistoric(ctx, w, h) {
    paintUrbanSkyline(ctx, w, h, {
      seed: 2202, minW: 16, maxW: 42, minH: 0.28, maxH: 0.62,
      gapMin: 1, gapMax: 5, winGapX: 4, winGapY: 5, spireChance: 0.22,
      onBuilding: function(c, x, gy, bw, bh, rng, shade) {
        if (rng() < 0.12) {
          const peak = 18 + (rng() * 36) | 0;
          c.fillStyle = shade;
          c.beginPath();
          c.moveTo(x + (bw >> 1), gy - bh - peak);
          c.lineTo(x + (bw >> 1) - 7, gy - bh);
          c.lineTo(x + (bw >> 1) + 7, gy - bh);
          c.fill();
        }
      },
    });
  }

  function paintBrownstone(ctx, w, h) {
    const rng = mulberry32(3303);
    ctx.clearRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = 18 + (rng() * 8) | 0;
      const bh = (0.72 + rng() * 0.22) * h | 0;
      const g = 168 + ((rng() * 28) | 0);
      fillBuilding(ctx, x, h, bw, bh, 'rgb(' + (g + 20) + ',' + g + ',' + (g - 8) + ')', 4, 7, rng);
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x, h - bh - 6, bw, 6);
      x += bw + 1;
    }
  }

  function paintWaterfront(ctx, w, h) {
    paintUrbanSkyline(ctx, w, h, {
      seed: 4404, minW: 36, maxW: 90, minH: 0.22, maxH: 0.55,
      gapMin: 6, gapMax: 18, winGapX: 6, winGapY: 5,
    });
    const rng = mulberry32(4405);
    for (let i = 0; i < 18; i++) {
      const x = (rng() * (w - 40)) | 0;
      drawCrane(ctx, x, h, (0.55 + rng() * 0.4) * h | 0, rng);
    }
    ctx.fillStyle = '#9aa0a6';
    for (let x = 0; x < w; x += 80) {
      ctx.fillRect(x + 10, h - 14, 50, 14);
    }
  }

  function paintFinancial(ctx, w, h) {
    paintUrbanSkyline(ctx, w, h, {
      seed: 5505, minW: 22, maxW: 48, minH: 0.35, maxH: 0.98,
      gapMin: 8, gapMax: 22, winGapX: 4, winGapY: 4, spireChance: 0.4,
      tint: function(g) { return 'rgb(' + (g + 8) + ',' + (g + 10) + ',' + Math.min(255, g + 22) + ')'; },
    });
  }

  function paintHousingBlocks(ctx, w, h) {
    const rng = mulberry32(6606);
    ctx.clearRect(0, 0, w, h);
    let x = 6;
    while (x < w - 10) {
      const bw = 70 + (rng() * 40) | 0;
      const bh = (0.62 + rng() * 0.28) * h | 0;
      const g = 200 + ((rng() * 30) | 0);
      fillBuilding(ctx, x, h, bw, bh, 'rgb(' + g + ',' + g + ',' + g + ')', 6, 8, rng);
      x += bw + 10 + (rng() * 16) | 0;
    }
  }

  function paintStadium(ctx, w, h) {
    paintUrbanSkyline(ctx, w, h, {
      seed: 7707, minW: 24, maxW: 55, minH: 0.25, maxH: 0.55,
      gapMin: 4, gapMax: 12, winGapX: 5, winGapY: 6,
    });
    const rng = mulberry32(7708);
    for (let i = 0; i < 5; i++) {
      const cx = 350 + i * 780;
      const r = 55 + (rng() * 18) | 0;
      ctx.fillStyle = '#d8d8d8';
      ctx.beginPath();
      ctx.ellipse(cx, h - 8, r * 1.6, r * 0.55, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.ellipse(cx, h - 10, r * 1.15, r * 0.32, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(cx - 4, h - r - 20, 8, 28);
    }
  }

  function paintCivic(ctx, w, h) {
    paintUrbanSkyline(ctx, w, h, {
      seed: 8808, minW: 28, maxW: 64, minH: 0.30, maxH: 0.62,
      gapMin: 6, gapMax: 16, winGapX: 5, winGapY: 6,
    });
    const rng = mulberry32(8809);
    for (let i = 0; i < 6; i++) {
      const cx = 280 + i * 640;
      const bw = 90;
      const bh = (0.55 * h) | 0;
      fillBuilding(ctx, cx - (bw >> 1), h, bw, bh, '#e8e8ea', 5, 7, rng);
      drawDome(ctx, cx, h - bh, 22 + (rng() * 10) | 0, '#f0f0f2');
    }
  }

  function paintMarket(ctx, w, h) {
    paintUrbanSkyline(ctx, w, h, {
      seed: 9909, minW: 14, maxW: 32, minH: 0.35, maxH: 0.78,
      gapMin: 1, gapMax: 4, winGapX: 4, winGapY: 5,
      onBuilding: function(c, x, gy, bw, bh, rng) {
        if (rng() < 0.45) {
          c.fillStyle = '#c4c4c8';
          c.fillRect(x - 2, gy - ((0.22 + rng() * 0.12) * bh | 0), bw + 4, 4);
        }
      },
    });
  }

  function paintBrutalist(ctx, w, h) {
    const rng = mulberry32(1010);
    ctx.clearRect(0, 0, w, h);
    let x = 8;
    while (x < w - 12) {
      const bw = 50 + (rng() * 55) | 0;
      const bh = (0.45 + rng() * 0.50) * h | 0;
      const g = 150 + ((rng() * 40) | 0);
      fillBuilding(ctx, x, h, bw, bh, 'rgb(' + g + ',' + g + ',' + (g + 4) + ')', 7, 9, rng);
      if (rng() < 0.5) {
        const stepW = (bw * 0.55) | 0;
        const stepH = (bh * 0.28) | 0;
        fillBuilding(ctx, x + ((rng() * (bw - stepW)) | 0), h - bh, stepW, stepH,
          'rgb(' + (g + 12) + ',' + (g + 12) + ',' + (g + 16) + ')', 7, 9, rng);
      }
      x += bw + 8 + (rng() * 20) | 0;
    }
  }

  function paintSmallDowntown(ctx, w, h) {
    paintUrbanSkyline(ctx, w, h, {
      seed: 1111, minW: 18, maxW: 40, minH: 0.38, maxH: 0.72,
      gapMin: 3, gapMax: 8, winGapX: 5, winGapY: 6,
    });
    const rng = mulberry32(1112);
    for (let i = 0; i < 8; i++) {
      const x = 200 + i * 480;
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(x, h - (0.92 * h | 0), 6, 0.92 * h | 0);
      ctx.beginPath();
      ctx.arc(x + 3, h - (0.92 * h | 0), 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#888';
      ctx.fillRect(x + 1, h - (0.55 * h | 0), 4, 8);
    }
  }

  function drawRoad(ctx, w, h, roadH) {
    ctx.fillStyle = '#3a322c';
    ctx.fillRect(0, h - roadH, w, roadH);
    ctx.fillStyle = '#5a534c';
    for (let x = 0; x < w; x += 18)
      ctx.fillRect(x, h - ((roadH / 2) | 0), 10, 2);
  }

  function drawTree(ctx, x, groundY, size, rng) {
    const trunkH = (size * 0.35) | 0;
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(x - 1, groundY - trunkH, 3, trunkH);
    ctx.fillStyle = rng() > 0.5 ? '#2e7a32' : '#246628';
    ctx.beginPath();
    ctx.arc(x, groundY - trunkH - (size * 0.25), size * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGableRoof(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - 2, y + h);
    ctx.lineTo(x + (w >> 1), y);
    ctx.lineTo(x + w + 2, y + h);
    ctx.closePath();
    ctx.fill();
  }

  function paintHouseRow(ctx, w, h, opts) {
    const rng = mulberry32(opts.seed);
    ctx.clearRect(0, 0, w, h);
    const roadH = opts.roadH || 18;
    drawRoad(ctx, w, h, roadH);
    ctx.fillStyle = opts.lawn || '#2f8a38';
    ctx.fillRect(0, h - roadH - 8, w, 8);
    const ground = h - roadH;
    let x = opts.pad || 10;
    while (x < w - 20) {
      const lot = opts.lotMin + (rng() * (opts.lotMax - opts.lotMin + 1)) | 0;
      opts.drawHouse(ctx, x, ground, lot, rng);
      if (opts.trees) {
        const n = opts.trees;
        for (let i = 0; i < n; i++) {
          if (rng() > 0.35)
            drawTree(ctx, x + 4 + ((rng() * (lot - 8)) | 0), ground, 10 + (rng() * 10) | 0, rng);
        }
      }
      x += lot + (opts.gap || 4);
    }
  }

  function paintTownhouses(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2010, lotMin: 22, lotMax: 28, gap: 0, trees: 0, roadH: 16,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = 70 + (rng() * 18) | 0;
        const siding = rng() > 0.5 ? '#e8e0d4' : '#d5dbe0';
        c.fillStyle = siding;
        c.fillRect(x, gy - wallH, lot, wallH);
        drawGableRoof(c, x, gy - wallH - 22, lot, 22, '#2c2c30');
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 4, gy - wallH + 12, 6, 8);
        c.fillRect(x + 4, gy - 28, 6, 8);
        c.fillStyle = '#5a3a22';
        c.fillRect(x + lot - 10, gy - 22, 6, 22);
      },
    });
  }

  function paintRanch(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2020, lotMin: 70, lotMax: 100, gap: 18, trees: 2, roadH: 16,
      drawHouse: function(c, x, gy, lot, rng) {
        const hw = (lot * 0.72) | 0;
        const wallH = 34 + (rng() * 8) | 0;
        c.fillStyle = rng() > 0.5 ? '#ece6dc' : '#cfd6dc';
        c.fillRect(x + 8, gy - wallH, hw, wallH);
        c.fillStyle = '#2a2a2c';
        c.fillRect(x + 6, gy - wallH - 10, hw + 4, 12);
        c.fillStyle = '#b8b8bc';
        c.fillRect(x + 8, gy - 22, 16, 22);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 30, gy - 20, 10, 8);
        c.fillRect(x + 46, gy - 20, 10, 8);
      },
    });
  }

  function paintMcMansions(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2030, lotMin: 90, lotMax: 130, gap: 22, trees: 2, roadH: 18,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = 55 + (rng() * 16) | 0;
        c.fillStyle = '#f0ebe3';
        c.fillRect(x + 10, gy - wallH, 50, wallH);
        c.fillRect(x + 48, gy - wallH + 10, 36, wallH - 10);
        drawGableRoof(c, x + 8, gy - wallH - 28, 54, 28, '#262628');
        drawGableRoof(c, x + 46, gy - wallH - 8, 40, 18, '#262628');
        c.fillStyle = '#b8b8bc';
        c.fillRect(x + 12, gy - 26, 18, 26);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 36, gy - wallH + 16, 10, 10);
        c.fillRect(x + 36, gy - 24, 10, 10);
        c.fillRect(x + 62, gy - 24, 10, 10);
      },
    });
  }

  function paintGardenApts(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2040, lotMin: 80, lotMax: 110, gap: 16, trees: 3, roadH: 16,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = 88 + (rng() * 18) | 0;
        c.fillStyle = '#d8d2c8';
        c.fillRect(x + 6, gy - wallH, lot - 12, wallH);
        c.fillStyle = '#2c2c30';
        c.fillRect(x + 4, gy - wallH - 8, lot - 8, 10);
        c.fillStyle = '#4a6a88';
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 4; col++)
            c.fillRect(x + 14 + col * 14, gy - 22 - row * 24, 8, 10);
        }
      },
    });
  }

  function paintMobileHomes(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2050, lotMin: 85, lotMax: 110, gap: 14, trees: 1, roadH: 14,
      drawHouse: function(c, x, gy, lot, rng) {
        const hw = (lot * 0.78) | 0;
        const wallH = 28;
        c.fillStyle = rng() > 0.5 ? '#cfd4d8' : '#d8cfc4';
        c.fillRect(x + 6, gy - wallH, hw, wallH);
        c.fillStyle = '#3a3a3c';
        c.fillRect(x + 4, gy - wallH - 6, hw + 4, 8);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 16, gy - 18, 10, 8);
        c.fillRect(x + 32, gy - 18, 10, 8);
        c.fillStyle = '#222';
        c.fillRect(x + 10, gy - 4, 6, 4);
        c.fillRect(x + hw - 8, gy - 4, 6, 4);
      },
    });
  }

  function paintVictorian(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2060, lotMin: 42, lotMax: 58, gap: 10, trees: 1, roadH: 16,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = 62 + (rng() * 14) | 0;
        const pal = ['#e8dcc8', '#c8d0d8', '#d4c8c0', '#c8c8b8'];
        c.fillStyle = pal[(rng() * pal.length) | 0];
        c.fillRect(x + 4, gy - wallH, lot - 8, wallH);
        drawGableRoof(c, x + 2, gy - wallH - 32, lot - 4, 32, '#2a2420');
        c.fillStyle = pal[(rng() * pal.length) | 0];
        c.fillRect(x + lot - 16, gy - wallH - 18, 12, wallH + 18);
        c.fillStyle = '#2a2420';
        c.fillRect(x + lot - 18, gy - wallH - 28, 16, 12);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 10, gy - wallH + 14, 8, 10);
        c.fillRect(x + 10, gy - 24, 8, 10);
      },
    });
  }

  function paintMediterranean(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2070, lotMin: 55, lotMax: 80, gap: 14, trees: 2, lawn: '#6b9a44', roadH: 16,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = 42 + (rng() * 10) | 0;
        c.fillStyle = rng() > 0.5 ? '#f0e4d0' : '#ead8c0';
        c.fillRect(x + 8, gy - wallH, lot - 16, wallH);
        c.fillStyle = '#a84a32';
        c.fillRect(x + 4, gy - wallH - 10, lot - 8, 12);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 16, gy - 22, 10, 8);
        c.fillRect(x + 32, gy - 22, 10, 8);
        c.fillStyle = '#7a4a28';
        c.fillRect(x + lot - 28, gy - 24, 8, 24);
      },
    });
  }

  function paintCottage(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2080, lotMin: 48, lotMax: 70, gap: 16, trees: 4, roadH: 14,
      drawHouse: function(c, x, gy, lot, rng) {
        const hw = (lot * 0.5) | 0;
        const wallH = 32 + (rng() * 8) | 0;
        c.fillStyle = rng() > 0.5 ? '#efe8dc' : '#dce3e8';
        c.fillRect(x + 12, gy - wallH, hw, wallH);
        drawGableRoof(c, x + 10, gy - wallH - 18, hw + 4, 18, '#3a3028');
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 18, gy - 18, 8, 8);
        c.fillStyle = '#6a4030';
        c.fillRect(x + 30, gy - 20, 6, 20);
      },
    });
  }

  function paintDuplex(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2090, lotMin: 70, lotMax: 90, gap: 12, trees: 1, roadH: 16,
      drawHouse: function(c, x, gy, lot, rng) {
        const half = (lot / 2) | 0;
        const wallL = 48;
        const wallR = 36;
        c.fillStyle = '#e6e0d6';
        c.fillRect(x + 4, gy - wallL, half - 2, wallL);
        c.fillStyle = '#d0d6dc';
        c.fillRect(x + half, gy - wallR, half - 6, wallR);
        drawGableRoof(c, x + 2, gy - wallL - 16, half, 16, '#2c2c30');
        c.fillStyle = '#2c2c30';
        c.fillRect(x + half - 2, gy - wallR - 8, half - 2, 10);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 10, gy - 22, 8, 8);
        c.fillRect(x + half + 8, gy - 20, 8, 8);
        c.fillStyle = '#5a3a22';
        c.fillRect(x + 22, gy - 20, 6, 20);
        c.fillRect(x + half + 22, gy - 20, 6, 20);
      },
    });
  }

  function paintStripCommercial(ctx, w, h) {
    const rng = mulberry32(2100);
    ctx.clearRect(0, 0, w, h);
    drawRoad(ctx, w, h, 22);
    ctx.fillStyle = '#6a6a6e';
    ctx.fillRect(0, h - 40, w, 18);
    let x = 12;
    while (x < w - 30) {
      const bw = 90 + (rng() * 70) | 0;
      const bh = 40 + (rng() * 28) | 0;
      ctx.fillStyle = rng() > 0.5 ? '#d8d8dc' : '#c8c0b4';
      ctx.fillRect(x, h - 40 - bh, bw, bh);
      ctx.fillStyle = '#2a2a2c';
      ctx.fillRect(x - 2, h - 40 - bh - 8, bw + 4, 10);
      ctx.fillStyle = '#3a5a78';
      for (let i = 0; i < 5; i++)
        ctx.fillRect(x + 8 + i * 16, h - 40 - 18, 10, 12);
      x += bw + 24 + (rng() * 30) | 0;
    }
  }

  const EXTRA_PAINTERS = [
    paintMidRise, paintHistoric, paintBrownstone, paintWaterfront, paintFinancial,
    paintHousingBlocks, paintStadium, paintCivic, paintMarket, paintBrutalist, paintSmallDowntown,
    paintTownhouses, paintRanch, paintMcMansions, paintGardenApts, paintMobileHomes,
    paintVictorian, paintMediterranean, paintCottage, paintDuplex, paintStripCommercial,
  ];

  function bakeExpandedAtlas(sourceImage) {
    const canvas = document.createElement('canvas');
    canvas.width = STRIP_W;
    canvas.height = STRIP_H * TOTAL_STRIPS;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceImage, 0, 0);
    for (let i = 0; i < EXTRA_PAINTERS.length; i++) {
      const strip = document.createElement('canvas');
      strip.width = STRIP_W;
      strip.height = STRIP_H;
      const sctx = strip.getContext('2d');
      sctx.imageSmoothingEnabled = false;
      EXTRA_PAINTERS[i](sctx, STRIP_W, STRIP_H);
      ctx.drawImage(strip, 0, (BUILTIN_STRIPS + i) * STRIP_H);
    }
    return canvas;
  }

  function uploadExpandedAtlas(gl, texture, sourceImage) {
    const stripCanvas = document.createElement('canvas');
    stripCanvas.width = STRIP_W;
    stripCanvas.height = STRIP_H;
    const sctx = stripCanvas.getContext('2d');
    sctx.imageSmoothingEnabled = false;

    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, STRIP_W, STRIP_H, TOTAL_STRIPS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    function uploadLayer(layer) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, STRIP_W, STRIP_H, 1, gl.RGBA, gl.UNSIGNED_BYTE, stripCanvas);
    }

    const builtinH = Math.floor(sourceImage.height / BUILTIN_STRIPS);
    for (let i = 0; i < BUILTIN_STRIPS; i++) {
      sctx.clearRect(0, 0, STRIP_W, STRIP_H);
      sctx.drawImage(sourceImage, 0, i * builtinH, sourceImage.width, builtinH, 0, 0, STRIP_W, STRIP_H);
      uploadLayer(i);
    }
    for (let i = 0; i < EXTRA_PAINTERS.length; i++) {
      sctx.clearRect(0, 0, STRIP_W, STRIP_H);
      EXTRA_PAINTERS[i](sctx, STRIP_W, STRIP_H);
      uploadLayer(BUILTIN_STRIPS + i);
    }
    return stripCanvas;
  }

  global.SettlementAtlas = {
    STRIP_W: STRIP_W,
    STRIP_H: STRIP_H,
    BUILTIN_STRIPS: BUILTIN_STRIPS,
    EXTRA_STRIPS: EXTRA_STRIPS,
    TOTAL_STRIPS: TOTAL_STRIPS,
    URBAN_TYPES: URBAN_TYPES,
    SUBURBAN_TYPES: SUBURBAN_TYPES,
    urbanGuiOptions: function() { return guiOptions(URBAN_TYPES); },
    suburbanGuiOptions: function() { return guiOptions(SUBURBAN_TYPES); },
    isAnyUrban: isAnyUrban,
    isAnySuburban: isAnySuburban,
    isUrbanLike: isUrbanLike,
    isSoftSuburban: isSoftSuburban,
    isSettlementWall: isSettlementWall,
    isLandSurfaceWall: isLandSurfaceWall,
    urbanVariantIndex: urbanVariantIndex,
    suburbanVariantIndex: suburbanVariantIndex,
    urbanWallTypeFromVariant: urbanWallTypeFromVariant,
    suburbanWallTypeFromVariant: suburbanWallTypeFromVariant,
    bakeExpandedAtlas: bakeExpandedAtlas,
    uploadExpandedAtlas: uploadExpandedAtlas,
  };
})(typeof window !== 'undefined' ? window : global);
