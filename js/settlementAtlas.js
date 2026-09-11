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
    { name: 'Townhouses', wallType: 40, height: 80, strip: 18 },
    { name: 'Ranch Houses', wallType: 41, height: 55, strip: 19 },
    { name: 'McMansions', wallType: 42, height: 100, strip: 20 },
    { name: 'Garden Apartments', wallType: 43, height: 90, strip: 21 },
    { name: 'Mobile Homes', wallType: 44, height: 40, strip: 22 },
    { name: 'Victorian Street', wallType: 45, height: 80, strip: 23 },
    { name: 'Mediterranean', wallType: 46, height: 60, strip: 24 },
    { name: 'Cottage Lane', wallType: 47, height: 50, strip: 25 },
    { name: 'Duplex Split-level', wallType: 48, height: 70, strip: 26 },
    { name: 'Strip Commercial', wallType: 49, height: 85, strip: 27 },
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

  function gray(g) {
    return 'rgb(' + g + ',' + g + ',' + Math.min(255, g + 8) + ')';
  }

  function drawCornice(ctx, x, y, w) {
    ctx.fillStyle = '#c8c8cc';
    ctx.fillRect(x - 1, y, w + 2, 4);
  }

  function drawGable(ctx, x, top, w, peak, shade) {
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + (w >> 1), top - peak);
    ctx.lineTo(x + w, top);
    ctx.closePath();
    ctx.fill();
  }

  function paintMidRise(ctx, w, h) {
    const rng = mulberry32(1101);
    ctx.clearRect(0, 0, w, h);
    let x = 2;
    while (x < w - 6) {
      const bw = 90 + (rng() * 60) | 0;
      const stories = 6 + ((rng() * 7) | 0);
      const bh = Math.min(h - 10, (stories * 36) | 0);
      const g = 220 + ((rng() * 28) | 0);
      fillBuilding(ctx, x, h, bw, bh, gray(g), 6, 7, rng);
      for (let band = 36; band < bh - 8; band += 36)
        drawCornice(ctx, x, h - band, bw);
      drawCornice(ctx, x, h - bh, bw);
      x += bw + 2 + ((rng() * 4) | 0);
    }
  }

  function paintHistoric(ctx, w, h) {
    const rng = mulberry32(2202);
    ctx.clearRect(0, 0, w, h);
    let x = 2;
    let n = 0;
    while (x < w - 10) {
      const church = (n % 7) === 3;
      n++;
      if (church) {
        const naveW = 64 + ((rng() * 18) | 0);
        const naveH = (0.42 + rng() * 0.08) * h | 0;
        const shade = gray(210 + ((rng() * 20) | 0));
        fillBuilding(ctx, x, h, naveW, naveH, shade, 5, 8, rng);
        drawGable(ctx, x, h - naveH, naveW, 18, shade);
        const spireW = 32;
        const spireH = (0.92 * h) | 0;
        const sx = x + naveW + 2;
        fillBuilding(ctx, sx, h, spireW, (0.55 * h) | 0, shade, 4, 10, rng);
        ctx.fillStyle = shade;
        ctx.beginPath();
        ctx.moveTo(sx, h - ((0.55 * h) | 0));
        ctx.lineTo(sx + (spireW >> 1), h - spireH);
        ctx.lineTo(sx + spireW, h - ((0.55 * h) | 0));
        ctx.fill();
        x += naveW + spireW + 6;
        continue;
      }
      const bw = 48 + (rng() * 28) | 0;
      const bh = (0.32 + rng() * 0.22) * h | 0;
      const g = 200 + ((rng() * 40) | 0);
      const shade = gray(g);
      fillBuilding(ctx, x, h, bw, bh, shade, 4, 6, rng);
      const steps = 2 + ((rng() * 3) | 0);
      ctx.fillStyle = shade;
      for (let s = 0; s < steps; s++) {
        const sw = bw - s * 6;
        ctx.fillRect(x + ((bw - sw) >> 1), h - bh - 8 - s * 8, sw, 8);
      }
      drawGable(ctx, x, h - bh - steps * 8, bw, 14 + ((rng() * 12) | 0), shade);
      x += bw + 1;
    }
  }

  function paintBrownstone(ctx, w, h) {
    const rng = mulberry32(3303);
    ctx.clearRect(0, 0, w, h);
    let x = 0;
    while (x < w) {
      const bw = 92 + (rng() * 28) | 0;
      const bh = (0.78 + rng() * 0.16) * h | 0;
      const g = 150 + ((rng() * 36) | 0);
      const shade = 'rgb(' + (g + 28) + ',' + (g + 8) + ',' + (g - 12) + ')';
      fillBuilding(ctx, x, h, bw, bh, shade, 5, 9, rng);
      ctx.fillStyle = '#2a2420';
      ctx.fillRect(x, h - bh - 8, bw, 8);
      ctx.fillStyle = '#6a4030';
      for (let s = 0; s < 5; s++)
        ctx.fillRect(x + 3, h - 6 - s * 5, 12 + s * 2, 5);
      ctx.fillStyle = '#3a2018';
      ctx.fillRect(x + bw - 10, h - 28, 7, 28);
      x += bw;
    }
  }

  function paintWaterfront(ctx, w, h) {
    const rng = mulberry32(4404);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#8a9096';
    ctx.fillRect(0, h - 22, w, 22);
    ctx.fillStyle = '#6a7076';
    for (let px = 0; px < w; px += 16)
      ctx.fillRect(px, h - 22, 10, 4);
    let x = 8;
    while (x < w - 20) {
      const bw = 170 + (rng() * 110) | 0;
      const bh = (0.16 + rng() * 0.16) * h | 0;
      const g = 180 + ((rng() * 30) | 0);
      fillBuilding(ctx, x, h - 22, bw, bh, gray(g), 10, 8, rng);
      ctx.fillStyle = '#6a6a70';
      ctx.fillRect(x, h - 22 - bh - 6, bw, 6);
      x += bw + 12 + ((rng() * 28) | 0);
    }
    let cx = 40;
    while (cx < w - 80) {
      const mastH = (0.72 + rng() * 0.24) * h | 0;
      const mastX = cx + 8;
      ctx.fillStyle = '#c0c4c8';
      ctx.fillRect(mastX, h - 22 - mastH, 10, mastH);
      const arm = 110 + (rng() * 90) | 0;
      ctx.fillRect(mastX - 8, h - 22 - mastH, arm, 8);
      ctx.fillRect(mastX + arm - 18, h - 22 - mastH + 8, 5, 28 + (rng() * 40) | 0);
      ctx.fillRect(mastX - 14, h - 32, 36, 12);
      cx += 220 + ((rng() * 160) | 0);
    }
  }

  function paintFinancial(ctx, w, h) {
    const rng = mulberry32(5505);
    ctx.clearRect(0, 0, w, h);
    let x = 20 + ((rng() * 40) | 0);
    while (x < w - 30) {
      const bw = 22 + (rng() * 18) | 0;
      const bh = (0.78 + rng() * 0.18) * h | 0;
      const g = 228 + ((rng() * 22) | 0);
      const shade = 'rgb(' + (g + 4) + ',' + (g + 8) + ',' + Math.min(255, g + 22) + ')';
      fillBuilding(ctx, x, h, bw, bh, shade, 4, 5, rng);
      const needle = 50 + (rng() * 70) | 0;
      ctx.fillStyle = shade;
      ctx.fillRect(x + (bw >> 1) - 1, h - bh - needle, 2, needle);
      ctx.fillRect(x + (bw >> 1) - 4, h - bh - 6, 8, 6);
      x += bw + 55 + ((rng() * 90) | 0);
    }
  }

  function paintHousingBlocks(ctx, w, h) {
    const rng = mulberry32(6606);
    ctx.clearRect(0, 0, w, h);
    const bw = 210;
    const bh = (0.74 * h) | 0;
    const courtyard = 72;
    let x = 8;
    while (x < w - 10) {
      fillBuilding(ctx, x, h, bw, bh, '#c8c8c8', 8, 10, rng);
      ctx.fillStyle = '#b0b0b4';
      ctx.fillRect(x, h - bh - 6, bw, 6);
      x += bw + courtyard;
    }
  }

  function paintStadium(ctx, w, h) {
    const rng = mulberry32(7707);
    ctx.clearRect(0, 0, w, h);
    let x = 4;
    while (x < w - 8) {
      const bw = 40 + (rng() * 28) | 0;
      const bh = (0.14 + rng() * 0.12) * h | 0;
      fillBuilding(ctx, x, h, bw, bh, gray(210 + ((rng() * 20) | 0)), 5, 6, rng);
      x += bw + 4 + ((rng() * 8) | 0);
    }
    for (let i = 0; i < 5; i++) {
      const cx = 500 + i * 1000;
      const rx = 320 + ((rng() * 50) | 0);
      const ry = (0.78 * h) | 0;
      ctx.fillStyle = '#d0d0d4';
      ctx.beginPath();
      ctx.ellipse(cx, h - 6, rx, ry, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.ellipse(cx, h - 10, rx * 0.62, ry * 0.42, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#b8b8bc';
      for (let k = 0; k < 9; k++) {
        const a = Math.PI + (k / 8) * Math.PI;
        ctx.fillRect(cx + Math.cos(a) * rx * 0.85 - 3, h - 8 + Math.sin(a) * ry * 0.85 - 14, 6, 16);
      }
    }
  }

  function paintCivic(ctx, w, h) {
    const rng = mulberry32(8808);
    ctx.clearRect(0, 0, w, h);
    let x = 6;
    while (x < w - 8) {
      const bw = 36 + (rng() * 28) | 0;
      const bh = (0.18 + rng() * 0.12) * h | 0;
      fillBuilding(ctx, x, h, bw, bh, gray(216 + ((rng() * 20) | 0)), 6, 7, rng);
      x += bw + 8 + ((rng() * 14) | 0);
    }
    for (let i = 0; i < 4; i++) {
      const cx = 480 + i * 980;
      const baseW = 340;
      const baseH = (0.42 * h) | 0;
      fillBuilding(ctx, cx - (baseW >> 1), h, baseW, baseH, '#ececef', 8, 10, rng);
      ctx.fillStyle = '#e0e0e4';
      for (let c = 0; c < 10; c++)
        ctx.fillRect(cx - 140 + c * 28, h - baseH, 12, baseH);
      const domeR = 96;
      ctx.fillStyle = '#f2f2f4';
      ctx.beginPath();
      ctx.arc(cx, h - baseH, domeR, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(cx - 4, h - baseH - domeR - 22, 8, 26);
      ctx.fillRect(cx - 10, h - baseH - domeR - 8, 20, 8);
    }
  }

  function paintMarket(ctx, w, h) {
    const rng = mulberry32(9909);
    ctx.clearRect(0, 0, w, h);
    let x = 2;
    while (x < w - 8) {
      const bw = 70 + (rng() * 42) | 0;
      const stories = 2 + ((rng() * 3) | 0);
      const bh = Math.min((0.58 * h) | 0, stories * 48);
      const g = 205 + ((rng() * 35) | 0);
      fillBuilding(ctx, x, h, bw, bh, gray(g), 5, 8, rng);
      ctx.fillStyle = '#3a3a3c';
      ctx.fillRect(x + 3, h - 28, Math.max(8, bw - 10), 22);
      ctx.fillStyle = rng() > 0.5 ? '#c8c8cc' : '#b8b0a8';
      ctx.fillRect(x - 3, h - 34, bw + 6, 6);
      x += bw + 1;
    }
  }

  function paintBrutalist(ctx, w, h) {
    const rng = mulberry32(1010);
    ctx.clearRect(0, 0, w, h);
    let x = 10;
    while (x < w - 20) {
      const topW = 160 + (rng() * 80) | 0;
      const totalH = (0.70 + rng() * 0.24) * h | 0;
      const g = 118 + ((rng() * 32) | 0);
      const shade = 'rgb(' + g + ',' + g + ',' + (g + 6) + ')';
      const midW = (topW * 0.72) | 0;
      const botW = (topW * 0.48) | 0;
      const h1 = (totalH * 0.34) | 0;
      const h2 = (totalH * 0.33) | 0;
      const h3 = totalH - h1 - h2;
      fillBuilding(ctx, x + ((topW - botW) >> 1), h, botW, h1, shade, 9, 12, rng);
      fillBuilding(ctx, x + ((topW - midW) >> 1), h - h1, midW, h2, shade, 9, 12, rng);
      fillBuilding(ctx, x, h - h1 - h2, topW, h3, shade, 9, 12, rng);
      x += topW + 18 + ((rng() * 36) | 0);
    }
  }

  function paintSmallDowntown(ctx, w, h) {
    const rng = mulberry32(1111);
    ctx.clearRect(0, 0, w, h);
    let x = 8;
    let n = 0;
    while (x < w - 16) {
      const kind = n % 6;
      n++;
      if (kind === 1) {
        const mast = (0.88 * h) | 0;
        ctx.fillStyle = '#c4c4c8';
        ctx.fillRect(x + 8, h - mast, 10, mast);
        ctx.fillRect(x, h - 16, 28, 16);
        ctx.beginPath();
        ctx.arc(x + 13, h - mast, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#888890';
        ctx.fillRect(x + 8, h - ((0.45 * h) | 0), 10, 12);
        x += 90;
        continue;
      }
      if (kind === 4) {
        const eh = (0.94 * h) | 0;
        fillBuilding(ctx, x, h, 48, eh, '#b8b8bc', 6, 8, rng);
        ctx.fillStyle = '#a8a8ac';
        ctx.fillRect(x - 8, h - eh - 22, 64, 28);
        x += 90;
        continue;
      }
      const bw = 86 + (rng() * 48) | 0;
      const bh = (0.32 + rng() * 0.18) * h | 0;
      fillBuilding(ctx, x, h, bw, bh, gray(200 + ((rng() * 30) | 0)), 5, 7, rng);
      ctx.fillStyle = '#3a3a3c';
      ctx.fillRect(x + 4, h - 22, 10, 22);
      x += bw + 14 + ((rng() * 22) | 0);
    }
  }

  function drawRoad(ctx, w, h, roadH) {
    ctx.fillStyle = '#3a322c';
    ctx.fillRect(0, h - roadH, w, roadH);
    ctx.fillStyle = '#5a534c';
    for (let x = 0; x < w; x += 22)
      ctx.fillRect(x, h - ((roadH / 2) | 0), 12, 3);
  }

  function drawTree(ctx, x, groundY, size, rng) {
    const trunkH = Math.max(10, (size * 0.38) | 0);
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(x - 2, groundY - trunkH, 5, trunkH);
    ctx.fillStyle = rng() > 0.5 ? '#2e7a32' : '#246628';
    ctx.beginPath();
    ctx.arc(x, groundY - trunkH - (size * 0.22), size * 0.48, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGableRoof(ctx, x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x - 3, y + h);
    ctx.lineTo(x + (w >> 1), y);
    ctx.lineTo(x + w + 3, y + h);
    ctx.closePath();
    ctx.fill();
  }

  function paintHouseRow(ctx, w, h, opts) {
    const rng = mulberry32(opts.seed);
    ctx.clearRect(0, 0, w, h);
    const roadH = opts.roadH || 32;
    const lawnH = opts.lawnH || 40;
    drawRoad(ctx, w, h, roadH);
    ctx.fillStyle = opts.lawn || '#2f8a38';
    ctx.fillRect(0, h - roadH - lawnH, w, lawnH);
    const ground = h - roadH;
    let x = opts.pad || 12;
    while (x < w - 24) {
      const lot = opts.lotMin + (rng() * (opts.lotMax - opts.lotMin + 1)) | 0;
      opts.drawHouse(ctx, x, ground, lot, rng, h);
      if (opts.trees) {
        for (let i = 0; i < opts.trees; i++) {
          if (rng() > 0.28)
            drawTree(ctx, x + 8 + ((rng() * Math.max(8, lot - 16)) | 0), ground,
              22 + (rng() * 18) | 0, rng);
        }
      }
      x += lot + (opts.gap || 8);
    }
  }

  function paintTownhouses(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2010, lotMin: 110, lotMax: 128, gap: 0, trees: 0, roadH: 30, lawnH: 18,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = (0.62 + rng() * 0.08) * h | 0;
        const roofH = (0.18 * h) | 0;
        c.fillStyle = rng() > 0.5 ? '#e8e0d4' : '#d5dbe0';
        c.fillRect(x, gy - wallH, lot, wallH);
        drawGableRoof(c, x, gy - wallH - roofH, lot, roofH, '#2c2c30');
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 10, gy - wallH + 24, 14, 16);
        c.fillRect(x + 10, gy - 48, 14, 16);
        c.fillRect(x + 32, gy - wallH + 24, 14, 16);
        c.fillRect(x + 32, gy - 48, 14, 16);
        c.fillStyle = '#5a3a22';
        c.fillRect(x + lot - 22, gy - 40, 12, 40);
      },
    });
  }

  function paintRanch(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2020, lotMin: 190, lotMax: 230, gap: 20, trees: 2, roadH: 32, lawnH: 44,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = (0.50 + rng() * 0.06) * h | 0;
        const mainW = (lot * 0.62) | 0;
        const garW = (lot * 0.22) | 0;
        c.fillStyle = rng() > 0.5 ? '#ece6dc' : '#cfd6dc';
        c.fillRect(x + 12, gy - wallH, mainW, wallH);
        c.fillRect(x + 12 + mainW, gy - ((wallH * 0.82) | 0), garW, (wallH * 0.82) | 0);
        c.fillStyle = '#2a2a2c';
        c.fillRect(x + 8, gy - wallH - 16, mainW + 8, 18);
        c.fillRect(x + 10 + mainW, gy - ((wallH * 0.82) | 0) - 12, garW + 6, 14);
        c.fillStyle = '#b8b8bc';
        c.fillRect(x + 16 + mainW, gy - 36, garW - 10, 36);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 28, gy - 32, 18, 14);
        c.fillRect(x + 56, gy - 32, 18, 14);
        c.fillRect(x + 84, gy - 32, 18, 14);
        c.fillStyle = '#5a3a22';
        c.fillRect(x + 110, gy - 38, 12, 38);
      },
    });
  }

  function paintMcMansions(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2030, lotMin: 200, lotMax: 240, gap: 24, trees: 2, roadH: 32, lawnH: 36,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = (0.62 + rng() * 0.08) * h | 0;
        const roofH = (0.22 * h) | 0;
        const leftW = (lot * 0.42) | 0;
        const midW = (lot * 0.28) | 0;
        const garW = (lot * 0.22) | 0;
        c.fillStyle = '#f0ebe3';
        c.fillRect(x + 10, gy - wallH, leftW, wallH);
        c.fillRect(x + 8 + leftW, gy - ((wallH * 0.78) | 0), midW, (wallH * 0.78) | 0);
        c.fillRect(x + 6 + leftW + midW, gy - ((wallH * 0.52) | 0), garW, (wallH * 0.52) | 0);
        drawGableRoof(c, x + 6, gy - wallH - roofH, leftW + 8, roofH, '#262628');
        drawGableRoof(c, x + 6 + leftW, gy - ((wallH * 0.78) | 0) - ((roofH * 0.7) | 0), midW + 6, (roofH * 0.7) | 0, '#262628');
        c.fillStyle = '#262628';
        c.fillRect(x + 4 + leftW + midW, gy - ((wallH * 0.52) | 0) - 16, garW + 8, 18);
        c.fillStyle = '#b8b8bc';
        c.fillRect(x + 10 + leftW + midW, gy - 44, 22, 44);
        c.fillRect(x + 36 + leftW + midW, gy - 44, 22, 44);
        c.fillRect(x + 62 + leftW + midW, gy - 44, 22, 44);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 22, gy - wallH + 28, 16, 18);
        c.fillRect(x + 48, gy - wallH + 28, 16, 18);
        c.fillRect(x + 22, gy - 50, 16, 18);
        c.fillRect(x + 48, gy - 50, 16, 18);
        c.fillRect(x + 14 + leftW, gy - 46, 16, 18);
      },
    });
  }

  function paintGardenApts(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2040, lotMin: 180, lotMax: 220, gap: 28, trees: 3, roadH: 30, lawnH: 28,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = (0.72 + rng() * 0.08) * h | 0;
        const bw = lot - 28;
        c.fillStyle = '#d8d2c8';
        c.fillRect(x + 8, gy - wallH, bw, wallH);
        c.fillStyle = '#2c2c30';
        c.fillRect(x + 4, gy - wallH - 12, bw + 8, 14);
        c.fillStyle = '#6a6a70';
        c.fillRect(x + 8, gy - 18, bw, 18);
        c.fillStyle = '#4a6a88';
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 6; col++)
            c.fillRect(x + 20 + col * 24, gy - 48 - row * 52, 16, 20);
        }
        c.fillStyle = '#5a3a22';
        c.fillRect(x + 16, gy - 40, 12, 40);
        c.fillRect(x + bw - 16, gy - 40, 12, 40);
      },
    });
  }

  function paintMobileHomes(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2050, lotMin: 170, lotMax: 210, gap: 18, trees: 1, roadH: 28, lawnH: 36,
      drawHouse: function(c, x, gy, lot, rng) {
        const hw = (lot * 0.82) | 0;
        const wallH = (0.42 + rng() * 0.06) * h | 0;
        c.fillStyle = rng() > 0.5 ? '#c8ced4' : '#d4c8bc';
        c.fillRect(x + 16, gy - wallH - 8, hw, wallH);
        c.fillStyle = '#3a3a3c';
        c.fillRect(x + 12, gy - wallH - 18, hw + 8, 12);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 36, gy - 40, 18, 14);
        c.fillRect(x + 64, gy - 40, 18, 14);
        c.fillRect(x + 92, gy - 40, 18, 14);
        c.fillStyle = '#5a3a22';
        c.fillRect(x + hw - 20, gy - 36, 12, 28);
        c.fillStyle = '#222';
        c.fillRect(x + 22, gy - 10, 14, 10);
        c.fillRect(x + hw - 8, gy - 10, 14, 10);
        c.fillStyle = '#6a6a70';
        c.fillRect(x + 4, gy - 14, 16, 6);
        c.fillRect(x, gy - 8, 8, 8);
      },
    });
  }

  function paintVictorian(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2060, lotMin: 120, lotMax: 150, gap: 16, trees: 1, roadH: 30, lawnH: 28,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = (0.58 + rng() * 0.08) * h | 0;
        const roofH = (0.26 * h) | 0;
        const pal = ['#e8dcc8', '#c8d0d8', '#d4c8c0', '#c8c8b8'];
        const body = pal[(rng() * pal.length) | 0];
        const tw = 28;
        c.fillStyle = body;
        c.fillRect(x + 8, gy - wallH, lot - 40, wallH);
        drawGableRoof(c, x + 4, gy - wallH - roofH, lot - 32, roofH, '#2a2420');
        c.fillStyle = pal[(rng() * pal.length) | 0];
        c.fillRect(x + lot - 36, gy - wallH - 36, tw, wallH + 36);
        c.fillStyle = '#2a2420';
        c.fillRect(x + lot - 40, gy - wallH - 52, tw + 8, 18);
        c.fillRect(x + lot - 26, gy - wallH - 78, 8, 28);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 16, gy - wallH + 28, 14, 16);
        c.fillRect(x + 38, gy - wallH + 28, 14, 16);
        c.fillRect(x + 16, gy - 48, 14, 16);
        c.fillRect(x + 38, gy - 48, 14, 16);
        c.fillRect(x + lot - 30, gy - wallH - 8, 12, 14);
        c.fillStyle = '#5a3a22';
        c.fillRect(x + 22, gy - 44, 12, 44);
      },
    });
  }

  function paintMediterranean(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2070, lotMin: 160, lotMax: 200, gap: 18, trees: 2, lawn: '#6b9a44', roadH: 30, lawnH: 40,
      drawHouse: function(c, x, gy, lot, rng) {
        const wallH = (0.48 + rng() * 0.08) * h | 0;
        const hw = lot - 28;
        c.fillStyle = rng() > 0.5 ? '#f0e4d0' : '#ead8c0';
        c.fillRect(x + 10, gy - wallH, hw, wallH);
        c.fillStyle = '#a84a32';
        c.fillRect(x + 4, gy - wallH - 18, hw + 12, 20);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 24, gy - 40, 18, 14);
        c.fillRect(x + 52, gy - 40, 18, 14);
        c.fillRect(x + 80, gy - 40, 18, 14);
        c.fillStyle = '#7a4a28';
        const doorX = x + hw - 36;
        c.beginPath();
        c.arc(doorX + 8, gy - 36, 10, Math.PI, 0);
        c.fill();
        c.fillRect(doorX, gy - 36, 16, 36);
      },
    });
  }

  function paintCottage(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2080, lotMin: 140, lotMax: 180, gap: 22, trees: 5, roadH: 28, lawnH: 48,
      drawHouse: function(c, x, gy, lot, rng) {
        const hw = (lot * 0.48) | 0;
        const wallH = (0.40 + rng() * 0.08) * h | 0;
        const roofH = (0.18 * h) | 0;
        c.fillStyle = rng() > 0.5 ? '#efe8dc' : '#dce3e8';
        c.fillRect(x + 18, gy - wallH, hw, wallH);
        drawGableRoof(c, x + 14, gy - wallH - roofH, hw + 8, roofH, '#3a3028');
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 30, gy - 32, 16, 14);
        c.fillRect(x + 54, gy - 32, 16, 14);
        c.fillStyle = '#6a4030';
        c.fillRect(x + 48, gy - 36, 10, 36);
      },
    });
  }

  function paintDuplex(ctx, w, h) {
    paintHouseRow(ctx, w, h, {
      seed: 2090, lotMin: 170, lotMax: 210, gap: 16, trees: 1, roadH: 30, lawnH: 32,
      drawHouse: function(c, x, gy, lot, rng) {
        const half = (lot / 2) | 0;
        const wallL = (0.58 * h) | 0;
        const wallR = (0.42 * h) | 0;
        const roofL = (0.16 * h) | 0;
        c.fillStyle = '#e6e0d6';
        c.fillRect(x + 8, gy - wallL, half - 8, wallL);
        c.fillStyle = '#d0d6dc';
        c.fillRect(x + half, gy - wallR, half - 12, wallR);
        drawGableRoof(c, x + 4, gy - wallL - roofL, half, roofL, '#2c2c30');
        c.fillStyle = '#2c2c30';
        c.fillRect(x + half - 4, gy - wallR - 16, half - 4, 18);
        c.fillStyle = '#4a6a88';
        c.fillRect(x + 18, gy - 40, 16, 14);
        c.fillRect(x + 42, gy - 40, 16, 14);
        c.fillRect(x + half + 16, gy - 36, 16, 14);
        c.fillRect(x + half + 40, gy - 36, 16, 14);
        c.fillStyle = '#5a3a22';
        c.fillRect(x + 28, gy - 40, 12, 40);
        c.fillRect(x + half + 28, gy - 40, 12, 40);
      },
    });
  }

  function paintStripCommercial(ctx, w, h) {
    const rng = mulberry32(2100);
    ctx.clearRect(0, 0, w, h);
    drawRoad(ctx, w, h, 36);
    ctx.fillStyle = '#6a6a6e';
    ctx.fillRect(0, h - 70, w, 34);
    ctx.fillStyle = '#8a8a90';
    for (let px = 8; px < w; px += 28)
      ctx.fillRect(px, h - 66, 16, 8);
    let x = 16;
    while (x < w - 40) {
      const bw = 160 + (rng() * 90) | 0;
      const bh = (0.52 + rng() * 0.18) * h | 0;
      ctx.fillStyle = rng() > 0.5 ? '#d8d8dc' : '#c8c0b4';
      ctx.fillRect(x, h - 70 - bh, bw, bh);
      ctx.fillStyle = '#2a2a2c';
      ctx.fillRect(x - 4, h - 70 - bh - 10, bw + 8, 12);
      ctx.fillStyle = '#3a5a78';
      const cols = Math.max(4, (bw / 28) | 0);
      for (let i = 0; i < cols; i++)
        ctx.fillRect(x + 12 + i * 28, h - 70 - 32, 18, 22);
      const poleX = x + bw + 18;
      ctx.fillStyle = '#4a4a50';
      ctx.fillRect(poleX, h - 70 - ((0.78 * h) | 0), 8, (0.78 * h) | 0);
      ctx.fillStyle = rng() > 0.5 ? '#c04040' : '#d0d040';
      ctx.fillRect(poleX - 18, h - 70 - ((0.78 * h) | 0) - 36, 46, 36);
      x += bw + 70 + ((rng() * 40) | 0);
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
