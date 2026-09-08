/**
 * Tornado Detection overlay: narrow near-surface updraft + condensation to ground,
 * intensity from left/right horizontal wind difference.
 */
(function (global) {
  'use strict';

  var CLOUD_THRESH = 0.012;
  var MAX_DETECTIONS = 4;
  var STICKY_CELLS = 22;
  var MIN_UPDRAFT_MS = 10;
  var MIN_DELTA_MS = 12;

  var detections = [];
  var prevDetections = [];

  function wrapIdx(x, resX, wrap) {
    if (!wrap)
      return x < 0 ? 0 : (x >= resX ? resX - 1 : x);
    var m = x % resX;
    return m < 0 ? m + resX : m;
  }

  function wrapDx(a, b, resX, wrap) {
    var dx = a - b;
    if (!wrap) return dx;
    var half = resX * 0.5;
    if (dx > half) dx -= resX;
    if (dx < -half) dx += resX;
    return dx;
  }

  function velMs(raw) {
    if (typeof rawVelocityTo_ms === 'function')
      return rawVelocityTo_ms(raw);
    return raw * 80;
  }

  function mphFromMs(ms) {
    if (typeof msToMPH === 'function')
      return msToMPH(ms);
    return ms * 2.23694;
  }

  function efFromDeltaMph(mph) {
    if (!(mph >= 65)) return 'EFU';
    if (mph < 86) return 'EF0';
    if (mph < 111) return 'EF1';
    if (mph < 136) return 'EF2';
    if (mph < 166) return 'EF3';
    if (mph < 201) return 'EF4';
    return 'EF5';
  }

  function surfaceYAt(wallAll, x, simResX, simResY) {
    for (var y = 0; y < simResY; y++) {
      if (wallAll[(y * simResX + x) * 4 + 1] !== 0)
        return y;
    }
    return 1;
  }

  function sampleCloud(waterAll, x, y, simResX) {
    return Math.max(0, waterAll[(y * simResX + x) * 4 + 1]);
  }

  function sampleVx(baseAll, x, y, simResX) {
    return velMs(baseAll[(y * simResX + x) * 4]);
  }

  function sampleVy(baseAll, x, y, simResX) {
    return velMs(baseAll[(y * simResX + x) * 4 + 1]);
  }

  function isFluid(wallAll, x, y, simResX) {
    return wallAll[(y * simResX + x) * 4 + 1] !== 0;
  }

  function scanCandidates(waterAll, baseAll, wallAll, simResX, simResY, cellHeight, wrap) {
    var cloudH = Math.max(2, Math.round(300 / Math.max(8, cellHeight)));
    var upH = Math.max(4, Math.round(700 / Math.max(8, cellHeight)));
    var stride = simResX > 2500 ? 2 : 1;
    var sfc = new Int16Array(simResX);
    var peakVy = new Float32Array(simResX);
    var peakY = new Int16Array(simResX);
    var cloudOk = new Uint8Array(simResX);
    var x, y, y1, vy, bestVy, bestY, cloudHit;

    for (x = 0; x < simResX; x += stride) {
      sfc[x] = surfaceYAt(wallAll, x, simResX, simResY);
      y1 = Math.min(simResY - 1, sfc[x] + cloudH);
      cloudHit = 0;
      for (y = sfc[x]; y <= y1; y++) {
        if (!isFluid(wallAll, x, y, simResX)) continue;
        if (sampleCloud(waterAll, x, y, simResX) >= CLOUD_THRESH) {
          cloudHit = 1;
          break;
        }
      }
      cloudOk[x] = cloudHit;
      y1 = Math.min(simResY - 1, sfc[x] + upH);
      bestVy = -1e9;
      bestY = sfc[x] + 1;
      for (y = sfc[x]; y <= y1; y++) {
        if (!isFluid(wallAll, x, y, simResX)) continue;
        vy = sampleVy(baseAll, x, y, simResX);
        if (vy > bestVy) {
          bestVy = vy;
          bestY = y;
        }
      }
      peakVy[x] = bestVy;
      peakY[x] = bestY;
    }

    var hits = [];
    var nbLo = Math.max(6, Math.round(400 / Math.max(8, cellHeight)));
    var nbHi = Math.max(nbLo + 2, Math.round(750 / Math.max(8, cellHeight)));
    if (stride > 1) {
      nbLo += (stride - (nbLo % stride)) % stride;
      nbHi += (stride - (nbHi % stride)) % stride;
      if (nbHi <= nbLo) nbHi = nbLo + stride;
    }
    for (x = 0; x < simResX; x += stride) {
      if (!cloudOk[x] || peakVy[x] < MIN_UPDRAFT_MS)
        continue;
      var nSum = 0;
      var nCount = 0;
      var d;
      for (d = nbLo; d <= nbHi; d += stride) {
        var xl = wrapIdx(x - d, simResX, wrap);
        var xr = wrapIdx(x + d, simResX, wrap);
        nSum += Math.max(0, peakVy[xl]);
        nCount++;
        nSum += Math.max(0, peakVy[xr]);
        nCount++;
      }
      var nMean = nCount > 0 ? nSum / nCount : 0;
      if (peakVy[x] < nMean * 1.55 && (peakVy[x] - nMean) < 6)
        continue;

      var halfW = 3;
      var coreFloor = peakVy[x] * 0.55;
      for (d = stride; d <= 10; d += stride) {
        var vxL = wrapIdx(x - d, simResX, wrap);
        var vxR = wrapIdx(x + d, simResX, wrap);
        if (peakVy[vxL] >= coreFloor && peakVy[vxR] >= coreFloor)
          halfW = Math.max(2, Math.min(8, d));
        else
          break;
      }
      halfW = Math.max(2, Math.min(8, halfW));
      var ySamp = peakY[x];
      var left = sampleVx(baseAll, wrapIdx(x - halfW, simResX, wrap), ySamp, simResX);
      var right = sampleVx(baseAll, wrapIdx(x + halfW, simResX, wrap), ySamp, simResX);
      var delta = Math.abs(right - left);
      if (delta < MIN_DELTA_MS)
        continue;

      hits.push({
        x: x,
        y: ySamp,
        sfcY: sfc[x],
        updraftMs: peakVy[x],
        vxLeft: left,
        vxRight: right,
        deltaMs: delta,
        halfW: halfW,
      });
    }
    return clusterHits(hits, simResX, wrap);
  }

  function clusterHits(hits, simResX, wrap) {
    if (!hits.length) return [];
    hits.sort(function (a, b) { return a.x - b.x; });
    var groups = [];
    var cur = [hits[0]];
    var i;
    for (i = 1; i < hits.length; i++) {
      var dx = hits[i].x - cur[cur.length - 1].x;
      if (wrap && dx > simResX * 0.5)
        dx -= simResX;
      if (dx <= 8)
        cur.push(hits[i]);
      else {
        groups.push(cur);
        cur = [hits[i]];
      }
    }
    groups.push(cur);
    if (wrap && groups.length > 1) {
      var first = groups[0];
      var last = groups[groups.length - 1];
      var gap = first[0].x + simResX - last[last.length - 1].x;
      if (gap <= 8) {
        groups[0] = last.concat(first);
        groups.pop();
      }
    }

    var out = [];
    for (i = 0; i < groups.length; i++) {
      var g = groups[i];
      var best = g[0];
      for (var j = 1; j < g.length; j++) {
        if (g[j].deltaMs > best.deltaMs ||
            (g[j].deltaMs === best.deltaMs && g[j].updraftMs > best.updraftMs))
          best = g[j];
      }
      var mph = mphFromMs(best.deltaMs);
      best.ef = efFromDeltaMph(mph);
      best.deltaMph = mph;
      out.push(best);
    }
    out.sort(function (a, b) { return b.deltaMs - a.deltaMs; });
    if (out.length > MAX_DETECTIONS)
      out.length = MAX_DETECTIONS;
    return out;
  }

  function stickify(next, simResX, wrap) {
    var used = new Uint8Array(prevDetections.length);
    var out = [];
    for (var i = 0; i < next.length; i++) {
      var n = next[i];
      var best = -1;
      var bestD = STICKY_CELLS;
      for (var p = 0; p < prevDetections.length; p++) {
        if (used[p]) continue;
        var d = Math.abs(wrapDx(n.x, prevDetections[p].x, simResX, wrap));
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best >= 0) {
        used[best] = 1;
        var prev = prevDetections[best];
        var dx = wrapDx(n.x, prev.x, simResX, wrap);
        n.x = wrapIdx(Math.round(prev.x + dx * 0.4), simResX, wrap);
        n.y = Math.round(prev.y + (n.y - prev.y) * 0.4);
      }
      out.push(n);
    }
    prevDetections = out.map(function (d) {
      return { x: d.x, y: d.y };
    });
    return out;
  }

  function formatDelta(ms) {
    if (typeof printVelocity === 'function')
      return printVelocity(ms);
    return Math.round(mphFromMs(ms)) + ' MPH';
  }

  function updateFromScan(opts) {
    opts = opts || {};
    var simResX = opts.simResX | 0;
    var simResY = opts.simResY | 0;
    if (!opts.waterAll || !opts.baseAll || !opts.wallAll || simResX < 16 || simResY < 8) {
      detections = [];
      return;
    }
    var wrap = !!opts.wrapX;
    var cellHeight = opts.cellHeight || 50;
    var hits = scanCandidates(
      opts.waterAll, opts.baseAll, opts.wallAll,
      simResX, simResY, cellHeight, wrap);
    detections = stickify(hits, simResX, wrap);
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
    if (!ctx || !detections.length) return;
    ctx.save();
    ctx.font = '12px "Segoe UI", Tahoma, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < detections.length; i++) {
      var d = detections[i];
      var sx = simToScreenX(d.x);
      var sy = simToScreenY(d.y);
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      if (sx < -90 || sx > viewW + 90 || sy < -50 || sy > viewH + 50)
        continue;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 90, 40, 0.95)';
      ctx.fillStyle = 'rgba(255, 70, 30, 0.35)';
      ctx.lineWidth = 2;
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx, sy - 12);
      ctx.lineTo(sx, sy + 5);
      ctx.stroke();

      var text = 'Tornado  ·  ' + formatDelta(d.deltaMs) + '  ·  ' + d.ef;
      var tw = ctx.measureText(text).width;
      var w = tw + 14;
      var h = 18;
      var px = sx;
      var py = sy - 22;
      roundRect(ctx, px - w * 0.5, py - h * 0.5, w, h, 4);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, px, py + 0.5);
    }
    ctx.restore();
  }

  function clear() {
    detections = [];
    prevDetections = [];
  }

  function getDetections() {
    return detections;
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.tornadoDetection = {
    updateFromScan: updateFromScan,
    draw: draw,
    clear: clear,
    getDetections: getDetections,
  };
})(typeof window !== 'undefined' ? window : globalThis);
