/**
 * World-space weather labels overlay: cloud types and storm/hazard tags.
 * Uses overlay-scan CPU buffers (water / base / wall + sounding metrics).
 */
(function (global) {
  'use strict';

  var CLOUD_THRESH = 0.012;
  var PRECIP_THRESH = 0.18;
  var MAX_LABELS = 16;
  var STICKY_CELLS = 55;

  var PRIORITY = {
    Tornado: 100,
    Supercell: 90,
    Mesocyclone: 80,
    'Hail core': 70,
    Cumulonimbus: 60,
    Lightning: 50,
    Outflow: 40,
    Fog: 36,
    'Cumulus congestus': 32,
    Cumulus: 26,
    Stratocumulus: 22,
    Altocumulus: 20,
    Cirrocumulus: 16,
    Cirrus: 15,
    Altostratus: 13,
    Stratus: 12,
  };

  var labels = [];
  var prevLabels = [];

  function wrapDx(a, b, resX, wrap) {
    var dx = a - b;
    if (!wrap) return dx;
    var half = resX * 0.5;
    if (dx > half) dx -= resX;
    if (dx < -half) dx += resX;
    return dx;
  }

  function wrapX(x, resX, wrap) {
    if (!wrap) return x;
    var m = ((x % resX) + resX) % resX;
    return m;
  }

  function vyMs(raw) {
    if (typeof rawVelocityTo_ms === 'function')
      return rawVelocityTo_ms(raw);
    return raw * 80;
  }

  function surfaceYAt(wallAll, x, simResX, simResY) {
    x = Math.max(0, Math.min(simResX - 1, x | 0));
    for (var y = 0; y < simResY; y++) {
      if (wallAll[(y * simResX + x) * 4 + 1] !== 0)
        return y;
    }
    return 1;
  }

  function extractCloudBlobs(waterAll, baseAll, wallAll, simResX, simResY, cellHeight, wrap) {
    if (!waterAll || !wallAll || simResX < 8 || simResY < 8)
      return [];

    var stepX = Math.max(3, Math.ceil(simResX / 160));
    var stepY = Math.max(2, Math.ceil(simResY / 48));
    var gw = Math.ceil(simResX / stepX);
    var gh = Math.ceil(simResY / stepY);
    var n = gw * gh;
    var parent = new Int32Array(n);
    var active = new Uint8Array(n);
    var i, gx, gy, x, y, idx, cloud, precip, vy, fluid;

    for (i = 0; i < n; i++)
      parent[i] = i;

    function find(a) {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    }
    function unite(a, b) {
      a = find(a);
      b = find(b);
      if (a !== b) parent[b] = a;
    }

    for (gy = 0; gy < gh; gy++) {
      y = Math.min(simResY - 1, gy * stepY);
      for (gx = 0; gx < gw; gx++) {
        x = Math.min(simResX - 1, gx * stepX);
        idx = gy * gw + gx;
        var wi = (y * simResX + x) * 4;
        fluid = wallAll[wi + 1] !== 0;
        cloud = fluid ? Math.max(0, waterAll[wi + 1]) : 0;
        if (cloud < CLOUD_THRESH) continue;
        active[idx] = 1;
        if (gx > 0 && active[idx - 1])
          unite(idx, idx - 1);
        if (gy > 0 && active[idx - gw])
          unite(idx, idx - gw);
        if (wrap && gx === gw - 1 && active[gy * gw])
          unite(idx, gy * gw);
      }
    }

    var groups = Object.create(null);
    for (i = 0; i < n; i++) {
      if (!active[i]) continue;
      var root = find(i);
      gy = (i / gw) | 0;
      gx = i - gy * gw;
      x = Math.min(simResX - 1, gx * stepX);
      y = Math.min(simResY - 1, gy * stepY);
      var bi = (y * simResX + x) * 4;
      cloud = Math.max(0, waterAll[bi + 1]);
      precip = Math.max(0, waterAll[bi + 2]);
      vy = baseAll ? baseAll[bi + 1] : 0;
      var g = groups[root];
      if (!g) {
        g = groups[root] = {
          minX: x, maxX: x, minY: y, maxY: y,
          sumX: 0, sumY: 0, mass: 0, count: 0,
          maxCloud: 0, maxPrecip: 0, maxVy: -1e9, sumCloud: 0,
        };
      }
      g.minX = Math.min(g.minX, x);
      g.maxX = Math.max(g.maxX, x);
      g.minY = Math.min(g.minY, y);
      g.maxY = Math.max(g.maxY, y);
      g.sumX += x * cloud;
      g.sumY += y * cloud;
      g.mass += cloud;
      g.sumCloud += cloud;
      g.count++;
      if (cloud > g.maxCloud) g.maxCloud = cloud;
      if (precip > g.maxPrecip) g.maxPrecip = precip;
      if (vy > g.maxVy) g.maxVy = vy;
    }

    var blobs = [];
    var keys = Object.keys(groups);
    for (i = 0; i < keys.length; i++) {
      var b = groups[keys[i]];
      if (b.count < 6 || b.mass < 0.12)
        continue;
      var cx = b.mass > 1e-6 ? b.sumX / b.mass : 0.5 * (b.minX + b.maxX);
      var cy = b.mass > 1e-6 ? b.sumY / b.mass : 0.5 * (b.minY + b.maxY);
      var sfc = surfaceYAt(wallAll, Math.round(cx), simResX, simResY);
      var baseAgl = Math.max(0, (b.minY - sfc) * cellHeight);
      var topAgl = Math.max(0, (b.maxY - sfc) * cellHeight);
      var widthM = Math.max(stepX, b.maxX - b.minX) * cellHeight;
      var thickness = Math.max(cellHeight, topAgl - baseAgl);
      blobs.push({
        x: cx,
        y: cy,
        minX: b.minX,
        maxX: b.maxX,
        minY: b.minY,
        maxY: b.maxY,
        sfcY: sfc,
        baseAgl: baseAgl,
        topAgl: topAgl,
        thickness: thickness,
        widthM: widthM,
        mass: b.mass,
        count: b.count,
        maxCloud: b.maxCloud,
        maxPrecip: b.maxPrecip,
        maxVyMs: vyMs(b.maxVy),
        meanCloud: b.mass / Math.max(1, b.count),
      });
    }

    return splitWideBlobs(blobs, simResX, cellHeight, wrap);
  }

  function splitWideBlobs(blobs, simResX, cellHeight, wrap) {
    var maxW = Math.max(70, simResX * 0.18);
    var out = [];
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      var w = b.maxX - b.minX;
      if (w <= maxW) {
        out.push(b);
        continue;
      }
      var parts = Math.min(6, Math.ceil(w / maxW));
      var slice = w / parts;
      for (var p = 0; p < parts; p++) {
        var x0 = b.minX + p * slice;
        var x1 = (p === parts - 1) ? b.maxX : b.minX + (p + 1) * slice;
        var copy = Object.assign({}, b);
        copy.minX = x0;
        copy.maxX = x1;
        copy.x = 0.5 * (x0 + x1);
        copy.widthM = Math.max(1, x1 - x0) * cellHeight;
        copy.mass = b.mass / parts;
        copy.count = Math.max(4, (b.count / parts) | 0);
        out.push(copy);
      }
    }
    return out;
  }

  function classifyCloudBlob(b) {
    var base = b.baseAgl;
    var top = b.topAgl;
    var th = b.thickness;
    var wide = b.widthM > th * 1.6;
    var up = b.maxVyMs;
    var precip = b.maxPrecip >= PRECIP_THRESH;
    var dense = b.maxCloud >= 0.06;
    var deep = base < 2800 && top > 7800 && th > 5000;
    var towering = base < 2800 && top > 4500 && th > 2800;

    if (deep || (precip && top > 6200 && up > 8 && th > 3500) || (up > 16 && th > 4500 && base < 3200))
      return 'Cumulonimbus';
    if (base < 280 && th < 700 && up < 4)
      return 'Fog';
    if (towering && up > 7 && top < 9200 && !precip)
      return 'Cumulus congestus';
    if (base < 2300 && th >= 700 && th < 4800 && top < 7200 && up >= 2 && up < 22 && !wide)
      return 'Cumulus';
    if (base < 2300 && th < 900 && up < 5 && wide)
      return 'Stratus';
    if (base < 2400 && th >= 350 && th < 2800 && up < 12)
      return 'Stratocumulus';
    if (base >= 2000 && base < 6200 && th < 1600 && wide && up < 6)
      return 'Altostratus';
    if (base >= 2000 && base < 6200 && th < 2800 && up < 11)
      return 'Altocumulus';
    if (base >= 5500 && th < 1400 && dense)
      return 'Cirrocumulus';
    if (base >= 5800 && th < 1600)
      return 'Cirrus';
    if (base < 2500)
      return wide ? 'Stratocumulus' : 'Cumulus';
    if (base < 6200)
      return 'Altocumulus';
    return 'Cirrus';
  }

  function localMaxima(pending, scoreFn, minScore, minSep) {
    var hits = [];
    if (!pending || pending.length < 3) return hits;
    for (var i = 1; i < pending.length - 1; i++) {
      var d = pending[i];
      var m = d && d.metrics;
      if (!m) continue;
      var s = scoreFn(m);
      if (!(s >= minScore)) continue;
      var sL = scoreFn(pending[i - 1].metrics || {});
      var sR = scoreFn(pending[i + 1].metrics || {});
      if (s < sL || s < sR) continue;
      hits.push({
        x: d.sx,
        y: Number.isFinite(m.precipMaxY) ? m.precipMaxY : (d.sfcY + 20),
        sfcY: d.sfcY,
        score: s,
        metrics: m,
      });
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    var kept = [];
    for (var h = 0; h < hits.length; h++) {
      var ok = true;
      for (var k = 0; k < kept.length; k++) {
        if (Math.abs(hits[h].x - kept[k].x) < minSep) {
          ok = false;
          break;
        }
      }
      if (ok) kept.push(hits[h]);
    }
    return kept;
  }

  function nearestBlob(blobs, x, simResX, wrap) {
    var best = null;
    var bestD = 1e9;
    for (var i = 0; i < blobs.length; i++) {
      var d = Math.abs(wrapDx(blobs[i].x, x, simResX, wrap));
      if (d < bestD) {
        bestD = d;
        best = blobs[i];
      }
    }
    return bestD < Math.max(40, simResX * 0.08) ? best : null;
  }

  function pushLabel(list, name, x, y, score) {
    if (!name) return;
    list.push({
      name: name,
      x: x,
      y: y,
      score: score == null ? (PRIORITY[name] || 10) : score,
      priority: PRIORITY[name] || 10,
    });
  }

  function stormLabelsFromPending(pending, blobs, simResX, wrap) {
    var out = [];
    if (!pending || !pending.length) return out;

    var torn = localMaxima(pending, function (m) {
      return Math.max(m.hazardTornado || 0, (m.stp || 0) * 8);
    }, 22, 50);
    for (var t = 0; t < torn.length; t++) {
      var tm = torn[t].metrics;
      if ((tm.hazardTornado || 0) < 22) continue;
      if ((tm.stp || 0) < 1.15) continue;
      if ((tm.srh3km || 0) < 140) continue;
      if ((tm.hazardSupercell || 0) < 12 && (tm.shear6km || 0) < 14) continue;
      var tb = nearestBlob(blobs, torn[t].x, simResX, wrap);
      pushLabel(out, 'Tornado', torn[t].x, tb ? tb.minY + 4 : torn[t].sfcY + 6, 100 + torn[t].score);
    }

    var sc = localMaxima(pending, function (m) {
      var h = m.hazardSupercell || 0;
      if (h > 0) return h;
      if ((m.muCape || 0) >= 850 && (m.shear6km || 0) >= 13 && (m.srh3km || 0) >= 70)
        return 16 + (m.muCape || 0) * 0.004;
      return 0;
    }, 16, 55);
    for (var s = 0; s < sc.length; s++) {
      var blob = nearestBlob(blobs, sc[s].x, simResX, wrap);
      var y = blob ? Math.min(blob.maxY - 2, blob.minY + (blob.maxY - blob.minY) * 0.72) : sc[s].y;
      if (blob && blob.topAgl < 4500 && (sc[s].metrics.hazardSupercell || 0) < 22)
        continue;
      pushLabel(out, 'Supercell', sc[s].x, y, 90 + sc[s].score);
    }

    var meso = localMaxima(pending, function (m) {
      return (m.srh3km || 0) * 0.12 + (m.hazardSupercell || 0) * 0.35;
    }, 28, 50);
    for (var z = 0; z < meso.length; z++) {
      if ((meso[z].metrics.srh3km || 0) < 170) continue;
      if ((meso[z].metrics.shear6km || 0) < 11) continue;
      var mb = nearestBlob(blobs, meso[z].x, simResX, wrap);
      if (mb && mb.maxVyMs < 6 && (meso[z].metrics.hazardSupercell || 0) < 18)
        continue;
      pushLabel(out, 'Mesocyclone', meso[z].x, mb ? mb.y : meso[z].y, 80 + meso[z].score);
    }

    var hail = localMaxima(pending, function (m) {
      return Math.max(m.hazardHail || 0, m.hazardLargeHail || 0, (m.estHailIn || 0) * 18);
    }, 16, 45);
    for (var h = 0; h < hail.length; h++) {
      var hm = hail[h].metrics;
      if ((hm.colPrecipMax || 0) < 0.12 && (hm.estHailIn || 0) < 0.7) continue;
      if ((hm.estHailIn || 0) < 0.55 && (hm.hazardHail || 0) < 18) continue;
      var hb = nearestBlob(blobs, hail[h].x, simResX, wrap);
      var hy = Number.isFinite(hm.precipMaxY) ? hm.precipMaxY : (hb ? hb.y : hail[h].y);
      pushLabel(out, 'Hail core', hail[h].x, hy, 70 + hail[h].score);
    }

    return out;
  }

  function outflowFromPending(pending) {
    var pts = [];
    if (!pending || pending.length < 3) return pts;
    for (var i = 1; i < pending.length - 1; i++) {
      var d = pending[i];
      var m = d && d.metrics;
      if (!m) continue;
      var cp = m.coldPool_K || 0;
      var mL = pending[i - 1].metrics || {};
      var mR = pending[i + 1].metrics || {};
      var vxL = Number.isFinite(mL.sfcVx) ? mL.sfcVx : 0;
      var vxR = Number.isFinite(mR.sfcVx) ? mR.sfcVx : 0;
      var divApprox = vxR - vxL;
      var edge = Math.abs(cp - (mL.coldPool_K || 0)) + Math.abs(cp - (mR.coldPool_K || 0));
      if (cp > 1.2 && (divApprox > 0.8 || edge > 1.5))
        pts.push({ x: d.sx, y: (d.sfcY || 0) + 4 });
    }
    return pts;
  }

  function eventLabels(outflowPoints, lightningStrikes, simResX, wrap) {
    var out = [];
    if (outflowPoints && outflowPoints.length) {
      var clusters = [];
      for (var i = 0; i < outflowPoints.length; i++) {
        var p = outflowPoints[i];
        var placed = false;
        for (var c = 0; c < clusters.length; c++) {
          if (Math.abs(wrapDx(p.x, clusters[c].x, simResX, wrap)) < 35) {
            clusters[c].x = 0.5 * (clusters[c].x + p.x);
            clusters[c].y = 0.5 * (clusters[c].y + p.y);
            clusters[c].n++;
            placed = true;
            break;
          }
        }
        if (!placed)
          clusters.push({ x: p.x, y: p.y, n: 1 });
      }
      clusters.sort(function (a, b) { return b.n - a.n; });
      var nOut = Math.min(4, clusters.length);
      for (var o = 0; o < nOut; o++)
        pushLabel(out, 'Outflow', clusters[o].x, clusters[o].y, 40 + clusters[o].n);
    }

    if (lightningStrikes && lightningStrikes.length) {
      var seen = [];
      for (var s = 0; s < lightningStrikes.length; s++) {
        var st = lightningStrikes[s];
        if (!st) continue;
        var lx = Number.isFinite(st.originX) ? st.originX : st.x;
        var ly = Number.isFinite(st.originY) ? st.originY : st.y;
        if (!Number.isFinite(lx) || !Number.isFinite(ly)) continue;
        var dup = false;
        for (var d = 0; d < seen.length; d++) {
          if (Math.abs(wrapDx(lx, seen[d], simResX, wrap)) < 40) {
            dup = true;
            break;
          }
        }
        if (dup) continue;
        seen.push(lx);
        pushLabel(out, 'Lightning', lx, ly, 50);
        if (seen.length >= 3) break;
      }
    }
    return out;
  }

  function nms(list, simResX, wrap) {
    list.sort(function (a, b) {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return (b.score || 0) - (a.score || 0);
    });
    var kept = [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var clash = false;
      for (var k = 0; k < kept.length; k++) {
        var b = kept[k];
        var dx = Math.abs(wrapDx(a.x, b.x, simResX, wrap));
        var dy = Math.abs(a.y - b.y);
        var sameTower = dx < 38 && dy < 42;
        var sameName = a.name === b.name && dx < 70;
        var cbUnderSc = a.name === 'Cumulonimbus' && b.name === 'Supercell' && dx < 55;
        var mesoUnderSc = a.name === 'Mesocyclone' && b.name === 'Supercell' && dx < 48 && dy < 50;
        if (sameTower || sameName || cbUnderSc || mesoUnderSc) {
          clash = true;
          break;
        }
      }
      if (!clash)
        kept.push(a);
      if (kept.length >= MAX_LABELS)
        break;
    }
    return kept;
  }

  function stickify(next, simResX, wrap) {
    var out = [];
    var usedPrev = new Uint8Array(prevLabels.length);
    for (var i = 0; i < next.length; i++) {
      var n = next[i];
      var best = -1;
      var bestD = STICKY_CELLS;
      for (var p = 0; p < prevLabels.length; p++) {
        if (usedPrev[p]) continue;
        var prev = prevLabels[p];
        if (prev.name !== n.name) continue;
        var d = Math.abs(wrapDx(n.x, prev.x, simResX, wrap));
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best >= 0) {
        usedPrev[best] = 1;
        var prevL = prevLabels[best];
        var dx = wrapDx(n.x, prevL.x, simResX, wrap);
        n.x = wrapX(prevL.x + dx * 0.42, simResX, wrap);
        n.y = prevL.y + (n.y - prevL.y) * 0.42;
      }
      out.push(n);
    }
    prevLabels = out.map(function (l) {
      return { name: l.name, x: l.x, y: l.y };
    });
    return out;
  }

  function updateFromScan(opts) {
    opts = opts || {};
    var simResX = opts.simResX | 0;
    var simResY = opts.simResY | 0;
    var cellHeight = opts.cellHeight || 50;
    var wrap = !!opts.wrapX;
    var pending = opts.pending || [];
    var blobs = extractCloudBlobs(
      opts.waterAll, opts.baseAll, opts.wallAll,
      simResX, simResY, cellHeight, wrap);

    var raw = [];
    for (var i = 0; i < blobs.length; i++) {
      var blob = blobs[i];
      var name = classifyCloudBlob(blob);
      var y = name === 'Cumulonimbus' || name === 'Cumulus congestus'
        ? blob.minY + (blob.maxY - blob.minY) * 0.78
        : blob.y;
      pushLabel(raw, name, blob.x, y, (PRIORITY[name] || 10) + Math.min(20, blob.mass));
    }

    raw = raw.concat(stormLabelsFromPending(pending, blobs, simResX, wrap));
    var outflowPts = (opts.outflowPoints && opts.outflowPoints.length)
      ? opts.outflowPoints
      : outflowFromPending(pending);
    raw = raw.concat(eventLabels(outflowPts, opts.lightningStrikes, simResX, wrap));
    labels = stickify(nms(raw, simResX, wrap), simResX, wrap);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function draw(ctx, simToScreenX, simToScreenY, viewW, viewH) {
    if (!ctx || !labels.length) return;
    ctx.save();
    ctx.font = '12px "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var padX = 7;
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      var sx = simToScreenX(L.x);
      var sy = simToScreenY(L.y) - 8;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      if (sx < -80 || sx > viewW + 80 || sy < -40 || sy > viewH + 40)
        continue;
      var tw = ctx.measureText(L.name).width;
      var w = tw + padX * 2;
      var h = 18;
      roundRect(ctx, sx - w * 0.5, sy - h * 0.5, w, h, 4);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(L.name, sx, sy + 0.5);
    }
    ctx.restore();
  }

  function noteLightning(strikes, simResX, wrap) {
    labels = labels.filter(function (l) { return l.name !== 'Lightning'; });
    var extra = eventLabels(null, strikes, simResX, wrap);
    if (extra.length)
      labels = nms(labels.concat(extra), simResX, !!wrap);
  }

  function clear() {
    labels = [];
    prevLabels = [];
  }

  function getLabels() {
    return labels;
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.weatherLabels = {
    updateFromScan: updateFromScan,
    noteLightning: noteLightning,
    draw: draw,
    clear: clear,
    getLabels: getLabels,
  };
})(typeof window !== 'undefined' ? window : globalThis);
