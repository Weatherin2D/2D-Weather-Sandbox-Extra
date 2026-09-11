/**
 * NWS-style watches / mesoscale discussions / warnings + EAS crawl.
 * Products are horizontal spans on the side-view domain.
 */
(function (global) {
  'use strict';

  var PRODUCTS = {
    TOR_WATCH: {
      type: 'TOR_WATCH', kind: 'watch', priority: 40,
      title: 'TORNADO WATCH', short: 'TOA',
      fill: 'rgba(255,48,48,0.14)', stroke: '#ff3a3a', text: '#ffd0d0',
      expireMin: 15, padBars: 1,
    },
    SVR_WATCH: {
      type: 'SVR_WATCH', kind: 'watch', priority: 30,
      title: 'SEVERE THUNDERSTORM WATCH', short: 'SVA',
      fill: 'rgba(255,90,170,0.12)', stroke: '#ff78c8', text: '#ffd0ee',
      expireMin: 15, padBars: 1,
    },
    MD: {
      type: 'MD', kind: 'md', priority: 15,
      title: 'MESOSCALE DISCUSSION', short: 'MD',
      fill: 'rgba(255,170,40,0.08)', stroke: '#ffb040', text: '#ffe0a8',
      expireMin: 12, padBars: 0, dashed: true,
    },
    TOR_WARN: {
      type: 'TOR_WARN', kind: 'warning', priority: 100,
      title: 'TORNADO WARNING', short: 'TOR',
      fill: 'rgba(220,0,0,0.30)', stroke: '#ff2020', text: '#ffffff',
      expireMin: 15, padBars: 0,
    },
    SVR_WARN: {
      type: 'SVR_WARN', kind: 'warning', priority: 70,
      title: 'SEVERE THUNDERSTORM WARNING', short: 'SVR',
      fill: 'rgba(255,170,0,0.24)', stroke: '#ffcc22', text: '#111',
      expireMin: 15, padBars: 0,
    },
    FFW_WARN: {
      type: 'FFW_WARN', kind: 'warning', priority: 80,
      title: 'FLASH FLOOD WARNING', short: 'FFW',
      fill: 'rgba(0,170,70,0.24)', stroke: '#22dd66', text: '#e8ffe8',
      expireMin: 15, padBars: 0,
    },
  };

  var TYPE_ORDER = ['TOR_WATCH', 'SVR_WATCH', 'MD', 'SVR_WARN', 'FFW_WARN', 'TOR_WARN'];

  var products = [];
  var lastUpdateIter = -1;
  var UPDATE_MINUTES = 12;
  var mdSeq = 0;
  var nextId = 1;
  var alertedKeys = Object.create(null);
  var townTypeAlerted = Object.create(null);
  var townCooldownUntil = Object.create(null);

  var easQueue = [];
  var easActive = null;
  var toneNodes = [];
  var ownAudioCtx = null;
  var crawlEl = null;
  var crawlTextEl = null;
  var crawlProductEl = null;

  function wrapX(x, resX, wrap) {
    if (!wrap) return x;
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

  function xInSpan(x, x0, x1, resX, wrap) {
    if (!wrap || x0 <= x1)
      return x >= x0 && x <= x1;
    return x >= x0 || x <= x1;
  }

  function spanWidth(x0, x1, resX, wrap) {
    if (!wrap || x0 <= x1) return Math.max(0, x1 - x0);
    return (resX - x0) + x1;
  }

  function spansOverlap(a0, a1, b0, b1, resX, wrap) {
    if (!wrap) return !(a1 < b0 || b1 < a0);
    if (a0 <= a1 && b0 <= b1) return !(a1 < b0 || b1 < a0);
    function covers(x) { return xInSpan(x, a0, a1, resX, wrap); }
    return covers(b0) || covers(b1) || xInSpan(a0, b0, b1, resX, wrap) || xInSpan(a1, b0, b1, resX, wrap);
  }

  function m(col) {
    return (col && col.metrics) || {};
  }

  function isSupercellMode(key) {
    return key === 'lp' || key === 'classic' || key === 'hp';
  }

  function hasPrecip(met, min) {
    return (met.colPrecipMax || 0) >= (min != null ? min : 0.08);
  }

  function hasConvectiveFocus(met) {
    if (hasPrecip(met, 0.08)) return true;
    if (isSupercellMode(met.stormModeKey) && hasPrecip(met, 0.04)) return true;
    var stormHaz = Math.max(met.hazardLargeHail || 0, met.hazardHail || 0, met.hazardSupercell || 0);
    return stormHaz >= 22 && hasPrecip(met, 0.04);
  }

  function qualifiesTorWatch(met) {
    if (!hasConvectiveFocus(met)) return false;
    var cape = met.muCape || 0;
    var shear = met.shear6km || 0;
    var stp = met.stp || 0;
    var srh = met.srh3km || 0;
    var haz = met.hazardTornado || 0;
    return (cape >= 900 && shear >= 14 && (stp >= 0.8 || srh >= 120 || haz >= 12))
      || (haz >= 22 && cape >= 600 && shear >= 12);
  }

  function qualifiesSvrWatch(met) {
    if (qualifiesTorWatch(met)) return false;
    if (!hasConvectiveFocus(met)) return false;
    var cape = met.muCape || 0;
    var shear = met.shear6km || 0;
    var hail = Math.max(met.hazardLargeHail || 0, met.hazardHail || 0, (met.estHailIn || 0) * 20);
    var wind = Math.max(met.hazardDamagingWinds || 0, met.hazardDestructiveWinds || 0);
    return cape >= 900 && (shear >= 14 || hail >= 22 || wind >= 22 || (met.dcape || 0) >= 900);
  }

  function qualifiesMd(met) {
    var init = met.initiation || 0;
    var cape = met.muCape || 0;
    var precip = met.colPrecipMax || 0;
    var watchEnv = cape >= 800 && (met.shear6km || 0) >= 12;
    if (precip < 0.05 && !hasConvectiveFocus(met)) return false;
    return (init >= 48 && precip >= 0.05 && cape >= 400)
      || (init >= 40 && precip >= 0.10 && watchEnv);
  }

  function qualifiesTorWarn(met, tornadoNear, labelTornado) {
    if (tornadoNear) return true;
    var precip = met.colPrecipMax || 0;
    if (labelTornado && precip >= 0.08) return true;
    var haz = met.hazardTornado || 0;
    var srh = met.srh3km || 0;
    var sc = (met.hazardSupercell || 0) >= 16 || isSupercellMode(met.stormModeKey);
    return haz >= 30 && precip >= 0.12 && srh >= 140 && sc;
  }

  function qualifiesSvrWarn(met, labelHail) {
    if (qualifiesTorWarn(met, false, false)) return false;
    var precip = met.colPrecipMax || 0;
    if (precip < 0.14) return false;
    var hail = Math.max(met.hazardLargeHail || 0, met.hazardHail || 0, (met.estHailIn || 0) * 22);
    var wind = Math.max(met.hazardDamagingWinds || 0, met.hazardDestructiveWinds || 0);
    if (labelHail && precip >= 0.14) return true;
    return precip >= 0.18 && (hail >= 28 || wind >= 28 || (met.estHailIn || 0) >= 1.0);
  }

  function qualifiesFfw(met) {
    var flood = met.hazardFlooding || 0;
    var accum = met.rainAccum_mm || 0;
    var precip = met.colPrecipMax || 0;
    return (accum >= 20 && precip >= 0.15)
      || (flood >= 28 && accum >= 15 && precip >= 0.10);
  }

  function watchColumnScore(met, tor) {
    if (tor)
      return (met.stp || 0) * 20 + (met.hazardTornado || 0) + (met.srh3km || 0) * 0.05;
    return Math.max(met.hazardLargeHail || 0, met.hazardDamagingWinds || 0, met.hazardHail || 0)
      + (met.estHailIn || 0) * 15 + (met.shear6km || 0);
  }

  function capWatchFlags(flags, pending, isTor, maxFrac) {
    var n = flags.length;
    if (!n) return flags;
    var count = 0;
    var i;
    for (i = 0; i < n; i++) if (flags[i]) count++;
    var cap = Math.max(3, Math.ceil(n * (maxFrac || 0.30)));
    if (count <= cap) return flags;
    var scored = [];
    for (i = 0; i < n; i++) {
      if (!flags[i]) continue;
      scored.push({ i: i, s: watchColumnScore(m(pending[i]), isTor) });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    var keep = new Uint8Array(n);
    for (i = 0; i < cap && i < scored.length; i++)
      keep[scored[i].i] = 1;
    var out = new Array(n);
    for (i = 0; i < n; i++) out[i] = !!keep[i];
    return out;
  }

  function uncoveredTornado(detections, resX, wrap) {
    if (!detections || !detections.length) return false;
    var tors = [];
    var i;
    for (i = 0; i < products.length; i++) {
      if (products[i].type === 'TOR_WARN') tors.push(products[i]);
    }
    for (i = 0; i < detections.length; i++) {
      var x = detections[i].x;
      var covered = false;
      for (var j = 0; j < tors.length; j++) {
        if (xInSpan(x, tors[j].x0, tors[j].x1, resX, wrap)) {
          covered = true;
          break;
        }
      }
      if (!covered) return true;
    }
    return false;
  }

  function nearestTornado(detections, x, resX, wrap, maxDist) {
    if (!detections || !detections.length) return null;
    var best = null;
    var bestD = maxDist;
    for (var i = 0; i < detections.length; i++) {
      var d = Math.abs(wrapDx(detections[i].x, x, resX, wrap));
      if (d < bestD) {
        bestD = d;
        best = detections[i];
      }
    }
    return best;
  }

  function labelsNear(labels, x, resX, wrap, name, maxDist) {
    if (!labels || !labels.length) return false;
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].name !== name) continue;
      if (Math.abs(wrapDx(labels[i].x, x, resX, wrap)) <= maxDist)
        return true;
    }
    return false;
  }

  function clusterFlags(flags, pending, padBars, minBars, wrap) {
    var n = flags.length;
    if (!n) return [];
    var spans = [];
    var i = 0;
    while (i < n) {
      if (!flags[i]) { i++; continue; }
      var start = i;
      var end = i;
      var j = i + 1;
      var gap = 0;
      while (j < n) {
        if (flags[j]) {
          end = j;
          gap = 0;
        } else {
          gap++;
          if (gap > 2) break;
        }
        j++;
      }
      var bars = end - start + 1;
      if (bars >= minBars) {
        start = Math.max(0, start - padBars);
        end = Math.min(n - 1, end + padBars);
        var c0 = pending[start];
        var c1 = pending[end];
        if (c0 && c1) {
          spans.push({
            i0: start,
            i1: end,
            x0: c0.sx,
            x1: c1.sx + (c1.step || 1),
            sfcY: Math.min(c0.sfcY || 0, c1.sfcY || 0),
          });
        }
      }
      i = j;
    }
    if (wrap && spans.length > 1) {
      var first = spans[0];
      var last = spans[spans.length - 1];
      if (first.i0 === 0 && last.i1 === n - 1) {
        first.x0 = last.x0;
        first.i0 = last.i0;
        first.wrapped = true;
        spans.pop();
      }
    }
    return spans;
  }

  function mergeSpans(spans, resX, wrap) {
    if (!spans || spans.length < 2) return spans || [];
    var out = spans.slice();
    var changed = true;
    while (changed) {
      changed = false;
      for (var i = 0; i < out.length; i++) {
        for (var j = i + 1; j < out.length; j++) {
          if (!spansOverlap(out[i].x0, out[i].x1, out[j].x0, out[j].x1, resX, wrap))
            continue;
          var a = out[i];
          var b = out[j];
          if (!wrap || (a.x0 <= a.x1 && b.x0 <= b.x1)) {
            a.x0 = Math.min(a.x0, b.x0);
            a.x1 = Math.max(a.x1, b.x1);
            a.wrapped = false;
          } else if (spanWidth(b.x0, b.x1, resX, wrap) > spanWidth(a.x0, a.x1, resX, wrap)) {
            a.x0 = b.x0;
            a.x1 = b.x1;
            a.wrapped = !!b.wrapped || a.x0 > a.x1;
          }
          a.sfcY = Math.min(a.sfcY || 0, b.sfcY || 0);
          a.tornado = a.tornado || b.tornado;
          out.splice(j, 1);
          changed = true;
          break;
        }
        if (changed) break;
      }
    }
    return out;
  }

  function tornadoSpans(detections, pending, resX, wrap) {
    if (!detections || !detections.length || !pending || !pending.length)
      return [];
    var spans = [];
    for (var i = 0; i < detections.length; i++) {
      var d = detections[i];
      var half = Math.max(10, (d.halfW || 8) + 6);
      var x0 = wrapX(d.x - half, resX, wrap);
      var x1 = wrapX(d.x + half, resX, wrap);
      var sfcY = d.sfcY != null ? d.sfcY : 1;
      spans.push({
        x0: x0,
        x1: wrap ? x1 : Math.min(resX, d.x + half),
        sfcY: sfcY,
        tornado: d,
        wrapped: wrap && x0 > x1,
      });
      if (!wrap)
        spans[spans.length - 1].x0 = Math.max(0, d.x - half);
    }
    return spans;
  }

  function matchSticky(prev, nextList, type, iterNum, expireIters, resX, wrap) {
    var used = new Uint8Array(prev.length);
    var out = [];
    for (var n = 0; n < nextList.length; n++) {
      var cand = nextList[n];
      var best = -1;
      var bestScore = 0;
      for (var p = 0; p < prev.length; p++) {
        if (used[p] || prev[p].type !== type) continue;
        if (!spansOverlap(cand.x0, cand.x1, prev[p].x0, prev[p].x1, resX, wrap))
          continue;
        var wN = spanWidth(cand.x0, cand.x1, resX, wrap) + 1;
        var wP = spanWidth(prev[p].x0, prev[p].x1, resX, wrap) + 1;
        var score = Math.min(wN, wP) / Math.max(wN, wP);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      var meta = PRODUCTS[type];
      var prod;
      if (best >= 0 && bestScore >= 0.35) {
        used[best] = 1;
        prod = prev[best];
        prod.x0 = cand.x0;
        prod.x1 = cand.x1;
        prod.sfcY = cand.sfcY;
        prod.expireIter = iterNum + expireIters;
        prod.tornado = cand.tornado || prod.tornado;
        prod.wrapped = !!cand.wrapped;
      } else {
        prod = {
          id: type + '-' + (nextId++),
          type: type,
          kind: meta.kind,
          x0: cand.x0,
          x1: cand.x1,
          sfcY: cand.sfcY,
          issuedIter: iterNum,
          expireIter: iterNum + expireIters,
          mdNum: type === 'MD' ? (++mdSeq) : 0,
          tornado: cand.tornado || null,
          wrapped: !!cand.wrapped,
          towns: [],
        };
      }
      out.push(prod);
    }
    return out;
  }

  function dropCovered(lower, higher, resX, wrap) {
    if (!higher.length) return lower;
    var kept = [];
    for (var i = 0; i < lower.length; i++) {
      var L = lower[i];
      var covered = false;
      for (var j = 0; j < higher.length; j++) {
        if (spansOverlap(L.x0, L.x1, higher[j].x0, higher[j].x1, resX, wrap)) {
          var wL = spanWidth(L.x0, L.x1, resX, wrap) + 1;
          var wH = spanWidth(higher[j].x0, higher[j].x1, resX, wrap) + 1;
          if (wH >= wL * 0.55) { covered = true; break; }
        }
      }
      if (!covered) kept.push(L);
    }
    return kept;
  }

  function formatClock(date, twelveHour) {
    if (!date || isNaN(date.getTime())) return '';
    if (twelveHour)
      return date.toLocaleString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit' });
    return date.toLocaleString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
  }

  function townsInProduct(prod, towns, resX, wrap) {
    var hit = [];
    if (!towns) return hit;
    for (var i = 0; i < towns.length; i++) {
      var t = towns[i];
      var x = t.getXpos ? t.getXpos() : t.x;
      if (!Number.isFinite(x)) continue;
      if (xInSpan(x, prod.x0, prod.x1, resX, wrap))
        hit.push(t);
    }
    return hit;
  }

  function townNames(list) {
    var names = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i].getName ? list[i].getName() : 'the warned area';
      if (names.indexOf(n) < 0) names.push(n);
    }
    if (!names.length) return 'THE WARNED AREA';
    if (names.length === 1) return names[0].toUpperCase();
    if (names.length === 2) return names[0].toUpperCase() + ' AND ' + names[1].toUpperCase();
    return names.slice(0, -1).map(function (s) { return s.toUpperCase(); }).join(', ')
      + ', AND ' + names[names.length - 1].toUpperCase();
  }

  function townKey(t) {
    var x = t.getXpos ? t.getXpos() : t.x;
    var n = t.getName ? t.getName() : 'Town';
    return n + '@' + Math.round(x);
  }

  function buildCrawl(prod, untilStr) {
    var meta = PRODUCTS[prod.type];
    var area = townNames(prod.towns);
    var until = untilStr ? (' UNTIL ' + untilStr) : '';
    var extra = '';
    if (prod.type === 'TOR_WARN') {
      extra = prod.tornado && prod.tornado.ef && prod.tornado.ef !== 'EFU'
        ? ' A TORNADO WAS INDICATED. RATED ' + prod.tornado.ef + '. TAKE COVER NOW.'
        : ' A TORNADO WAS INDICATED. TAKE COVER NOW.';
    } else if (prod.type === 'SVR_WARN') {
      extra = ' DESTRUCTIVE WINDS AND LARGE HAIL ARE POSSIBLE. SEEK STURDY SHELTER.';
    } else if (prod.type === 'FFW_WARN') {
      extra = ' MOVE TO HIGHER GROUND. DO NOT DRIVE THROUGH FLOOD WATERS.';
    }
    return 'THE NATIONAL WEATHER SERVICE HAS ISSUED A ' + meta.title + ' FOR ' + area + until + '.' + extra;
  }

  function headlineFor(prod) {
    var meta = PRODUCTS[prod.type];
    if (prod.type === 'MD')
      return 'MD ' + prod.mdNum;
    return meta.short;
  }

  function itersForMinutes(minutes, timePerIteration) {
    var tpi = Number.isFinite(timePerIteration) && timePerIteration > 0 ? timePerIteration : 0.00008;
    return Math.max(40, Math.round((minutes / 60) / tpi));
  }

  function ensureCrawlDom() {
    if (crawlEl) return crawlEl;
    crawlEl = document.getElementById('easCrawl');
    if (crawlEl) {
      crawlTextEl = crawlEl.querySelector('.eas-crawl-text');
      crawlProductEl = crawlEl.querySelector('.eas-crawl-product');
      return crawlEl;
    }
    crawlEl = document.createElement('div');
    crawlEl.id = 'easCrawl';
    crawlEl.className = 'eas-crawl';
    crawlEl.setAttribute('aria-live', 'assertive');
    crawlEl.innerHTML =
      '<div class="eas-crawl-badge">EAS</div>' +
      '<div class="eas-crawl-product"></div>' +
      '<div class="eas-crawl-track"><div class="eas-crawl-text"></div></div>';
    document.body.appendChild(crawlEl);
    crawlTextEl = crawlEl.querySelector('.eas-crawl-text');
    crawlProductEl = crawlEl.querySelector('.eas-crawl-product');
    return crawlEl;
  }

  function showCrawl(prod, text) {
    ensureCrawlDom();
    var meta = PRODUCTS[prod.type];
    crawlEl.classList.add('visible');
    crawlEl.setAttribute('data-type', prod.type);
    if (crawlProductEl) crawlProductEl.textContent = meta.title;
    if (crawlTextEl) {
      crawlTextEl.textContent = text + '     •     ' + text;
      crawlTextEl.style.animationDuration = Math.max(18, Math.min(48, text.length * 0.18)) + 's';
    }
  }

  function hideCrawl() {
    if (crawlEl) crawlEl.classList.remove('visible');
  }

  function getAudioCtx(ctx) {
    var ac = null;
    if (ctx && typeof ctx.getAudioContext === 'function')
      ac = ctx.getAudioContext();
    if (!ac && global.soundSystem && global.soundSystem.audioCtx)
      ac = global.soundSystem.audioCtx;
    if (!ac) {
      if (!ownAudioCtx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (AC) {
          try { ownAudioCtx = new AC(); } catch (e) { ownAudioCtx = null; }
        }
      }
      ac = ownAudioCtx;
    }
    if (ac && ac.state === 'suspended')
      ac.resume();
    return ac;
  }

  function stopTones() {
    for (var i = 0; i < toneNodes.length; i++) {
      try { toneNodes[i].stop(); } catch (e) { /* already stopped */ }
    }
    toneNodes = [];
  }

  function playDualTone(ac, freqA, freqB, duration, volume, when) {
    var t0 = (when != null ? when : ac.currentTime);
    var t1 = t0 + duration;
    var master = ac.createGain();
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(volume * 0.45, t0 + 0.04);
    master.gain.setValueAtTime(volume * 0.45, t1 - 0.08);
    master.gain.linearRampToValueAtTime(0, t1);
    master.connect(ac.destination);
    function osc(freq) {
      var o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(master);
      o.start(t0);
      o.stop(t1);
      toneNodes.push(o);
    }
    osc(freqA);
    osc(freqB);
    return t1;
  }

  function speakText(text, onend) {
    if (!global.speechSynthesis) {
      if (onend) onend();
      return;
    }
    try { global.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    var u = new global.SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    u.pitch = 1.0;
    u.volume = 1.0;
    u.onend = function () { if (onend) onend(); };
    u.onerror = function () { if (onend) onend(); };
    global.speechSynthesis.speak(u);
  }

  function startEasSequence(item, ctx) {
    var gui = ctx.guiControls || global.guiControls || {};
    var voiceOn = gui.easVoiceEnabled !== false;
    var vol = Number.isFinite(gui.easVolume) ? gui.easVolume : 0.85;
    var soundOn = gui.sound !== false && gui.easAlertsEnabled !== false;
    showCrawl(item.prod, item.crawl);
    easActive = {
      prod: item.prod,
      crawl: item.crawl,
      phase: 'tone',
      startedAt: performance.now(),
      holdUntil: 0,
    };
    if (!soundOn) {
      easActive.phase = 'hold';
      easActive.holdUntil = performance.now() + 14000;
      return;
    }
    var ac = getAudioCtx(ctx);
    if (!ac) {
      easActive.phase = 'hold';
      easActive.holdUntil = performance.now() + 14000;
      return;
    }
    var endTone = playDualTone(ac, 853, 960, 6.0, vol, ac.currentTime);
    easActive.toneEndMs = performance.now() + 6000;
    easActive.audioCtx = ac;
    easActive.eomAt = endTone;
    easActive.voiceOn = voiceOn;
    easActive.volume = vol;
  }

  function finishEas() {
    stopTones();
    try { if (global.speechSynthesis) global.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    hideCrawl();
    easActive = null;
  }

  function tickEas(nowMs, ctx) {
    if (!easActive) {
      if (easQueue.length) {
        var gui = (ctx && ctx.guiControls) || global.guiControls || {};
        if (gui.easAlertsEnabled === false) {
          easQueue.length = 0;
          return;
        }
        startEasSequence(easQueue.shift(), ctx || {});
      }
      return;
    }
    if (easActive.phase === 'tone' && nowMs >= (easActive.toneEndMs || 0)) {
      easActive.phase = 'voice';
      var spoken = easActive.crawl.replace(/\s+/g, ' ').trim();
      if (easActive.voiceOn) {
        speakText(spoken, function () {
          if (!easActive) return;
          easActive.phase = 'eom';
          if (easActive.audioCtx)
            playDualTone(easActive.audioCtx, 853, 960, 1.0, easActive.volume || 0.7, easActive.audioCtx.currentTime);
          easActive.holdUntil = performance.now() + 2500;
        });
      } else {
        easActive.phase = 'eom';
        if (easActive.audioCtx)
          playDualTone(easActive.audioCtx, 853, 960, 1.0, easActive.volume || 0.7, easActive.audioCtx.currentTime);
        easActive.holdUntil = nowMs + 2500;
      }
      return;
    }
    if ((easActive.phase === 'eom' || easActive.phase === 'hold') && easActive.holdUntil && nowMs >= easActive.holdUntil) {
      finishEas();
    }
  }

  function enqueueWarning(prod, crawl, nowMs) {
    var item = { prod: prod, crawl: crawl, enqueuedAt: nowMs };
    var ranks = { TOR_WARN: 3, FFW_WARN: 2, SVR_WARN: 1 };
    var newRank = ranks[prod.type] || 0;
    if (easActive && easActive.prod) {
      var curRank = ranks[easActive.prod.type] || 0;
      if (newRank > curRank) {
        finishEas();
        easQueue.unshift(item);
        return;
      }
    }
    easQueue.push(item);
  }

  function updateFromScan(ctx) {
    ctx = ctx || {};
    var pending = ctx.pending || [];
    var resX = ctx.simResX | 0;
    var wrap = !!ctx.wrapX;
    var iterNum = ctx.iterNum | 0;
    var tpi = ctx.timePerIteration;
    var detections = ctx.tornadoDetections || [];
    var labels = ctx.labels || [];
    var towns = ctx.towns || [];
    var gui = ctx.guiControls || global.guiControls || {};
    var prev = products.slice();

    if (!pending.length || !resX) {
      products = products.filter(function (p) { return iterNum <= p.expireIter; });
      return;
    }

    var interval = itersForMinutes(UPDATE_MINUTES, tpi);
    var due = lastUpdateIter < 0 || (iterNum - lastUpdateIter) >= interval;
    var torForce = uncoveredTornado(detections, resX, wrap);
    if (!ctx.force && !due && !torForce)
      return;

    var n = pending.length;
    var torWatch = new Array(n);
    var svrWatch = new Array(n);
    var mdFlags = new Array(n);
    var torWarn = new Array(n);
    var svrWarn = new Array(n);
    var ffwWarn = new Array(n);
    var i;
    for (i = 0; i < n; i++) {
      var met = m(pending[i]);
      var sx = pending[i].sx;
      var tornadoNear = !!nearestTornado(detections, sx, resX, wrap, 14);
      var labTor = labelsNear(labels, sx, resX, wrap, 'Tornado', 18);
      var labHail = labelsNear(labels, sx, resX, wrap, 'Hail core', 16);
      torWatch[i] = qualifiesTorWatch(met);
      svrWatch[i] = qualifiesSvrWatch(met);
      mdFlags[i] = qualifiesMd(met);
      torWarn[i] = qualifiesTorWarn(met, tornadoNear, labTor);
      svrWarn[i] = qualifiesSvrWarn(met, labHail);
      ffwWarn[i] = qualifiesFfw(met);
    }

    torWatch = capWatchFlags(torWatch, pending, true, 0.30);
    svrWatch = capWatchFlags(svrWatch, pending, false, 0.30);

    var torWatchSpans = mergeSpans(clusterFlags(torWatch, pending, PRODUCTS.TOR_WATCH.padBars, 3, wrap), resX, wrap);
    var svrWatchSpans = mergeSpans(clusterFlags(svrWatch, pending, PRODUCTS.SVR_WATCH.padBars, 3, wrap), resX, wrap);
    var mdSpans = mergeSpans(clusterFlags(mdFlags, pending, 0, 2, wrap), resX, wrap);
    var torWarnSpans = mergeSpans(
      clusterFlags(torWarn, pending, 0, 1, wrap).concat(tornadoSpans(detections, pending, resX, wrap)),
      resX, wrap);
    var svrWarnSpans = mergeSpans(clusterFlags(svrWarn, pending, 0, 1, wrap), resX, wrap);
    var ffwSpans = mergeSpans(clusterFlags(ffwWarn, pending, 0, 1, wrap), resX, wrap);

    var next = [];
    function take(type, spans, minBars) {
      var meta = PRODUCTS[type];
      var expire = itersForMinutes(meta.expireMin, tpi);
      var list = matchSticky(prev, spans, type, iterNum, expire, resX, wrap);
      for (var p = 0; p < list.length; p++) {
        var w = spanWidth(list[p].x0, list[p].x1, resX, wrap);
        if (w < (minBars || 1) * 2 && type.indexOf('WATCH') >= 0) continue;
        next.push(list[p]);
      }
    }

    take('TOR_WATCH', torWatchSpans, 3);
    take('SVR_WATCH', svrWatchSpans, 3);
    take('MD', mdSpans, 2);
    take('SVR_WARN', svrWarnSpans, 1);
    take('FFW_WARN', ffwSpans, 1);
    take('TOR_WARN', torWarnSpans, 1);

    var tors = next.filter(function (p) { return p.type === 'TOR_WARN'; });
    next = next.filter(function (p) {
      if (p.type !== 'SVR_WARN') return true;
      return dropCovered([p], tors, resX, wrap).length > 0;
    });

    var untilBase = ctx.simDateTime instanceof Date ? ctx.simDateTime : new Date();
    var twelve = !!gui.twelveHourClock;
    for (i = 0; i < next.length; i++) {
      var prod = next[i];
      var meta = PRODUCTS[prod.type];
      prod.towns = townsInProduct(prod, towns, resX, wrap);
      var until = new Date(untilBase.getTime() + meta.expireMin * 60 * 1000);
      prod.untilStr = formatClock(until, twelve);
      prod.headline = headlineFor(prod);
      prod.crawlText = buildCrawl(prod, prod.untilStr);
    }

    products = next;
    lastUpdateIter = iterNum;

    if (gui.easAlertsEnabled === false)
      return;

    var nowMs = performance.now();
    var TYPE_RANK = { TOR_WARN: 3, FFW_WARN: 2, SVR_WARN: 1 };
    for (i = 0; i < products.length; i++) {
      var w = products[i];
      if (w.kind !== 'warning' || !w.towns.length) continue;
      for (var t = 0; t < w.towns.length; t++) {
        var tk = townKey(w.towns[t]);
        var prevType = townTypeAlerted[tk];
        var rank = TYPE_RANK[w.type] || 0;
        var prevRank = TYPE_RANK[prevType] || 0;
        var cd = townCooldownUntil[tk] || 0;
        if (alertedKeys[w.id + ':' + tk]) continue;
        if (prevType === w.type && nowMs < cd) continue;
        if (prevType && rank <= prevRank && nowMs < cd) continue;
        alertedKeys[w.id + ':' + tk] = true;
        townTypeAlerted[tk] = w.type;
        townCooldownUntil[tk] = nowMs + 22000;
        enqueueWarning(w, w.crawlText, nowMs);
      }
    }
  }

  function draw(ctx2d, simToScreenX, simToScreenY, viewW, viewH, simResY) {
    if (!ctx2d || !products.length) return;
    ctx2d.save();
    var sorted = products.slice().sort(function (a, b) {
      return (PRODUCTS[a.type].priority || 0) - (PRODUCTS[b.type].priority || 0);
    });
    for (var i = 0; i < sorted.length; i++) {
      var p = sorted[i];
      var meta = PRODUCTS[p.type];
      var sfcY = Number.isFinite(p.sfcY) ? p.sfcY : 1;
      var topY = p.kind === 'warning'
        ? sfcY + Math.max(18, (simResY || 200) * 0.22)
        : sfcY + Math.max(28, (simResY || 200) * 0.38);
      var y0 = simToScreenY(topY);
      var y1 = simToScreenY(Math.max(0, sfcY - 1));
      var h = Math.abs(y1 - y0);
      var top = Math.min(y0, y1);
      if (!Number.isFinite(h) || h < 4) continue;

      function drawBox(xa, xb) {
        var sx0 = simToScreenX(xa);
        var sx1 = simToScreenX(xb);
        var left = Math.min(sx0, sx1);
        var w = Math.abs(sx1 - sx0);
        if (w < 3) w = 3;
        ctx2d.fillStyle = meta.fill;
        ctx2d.fillRect(left, top, w, h);
        ctx2d.strokeStyle = meta.stroke;
        ctx2d.lineWidth = p.kind === 'warning' ? 2.5 : 1.8;
        if (meta.dashed) ctx2d.setLineDash([7, 5]);
        else ctx2d.setLineDash([]);
        ctx2d.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
        ctx2d.setLineDash([]);
        var label = p.headline || meta.short;
        ctx2d.font = 'bold 11px Arial, sans-serif';
        ctx2d.fillStyle = meta.text;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'top';
        var lx = left + w * 0.5;
        var ly = top + 4;
        if (lx > -40 && lx < viewW + 40 && ly > -20 && ly < viewH + 20)
          ctx2d.fillText(label, lx, ly);
      }

      if (p.x0 <= p.x1) {
        drawBox(p.x0, p.x1);
      } else {
        drawBox(p.x0, (typeof simToScreenX === 'function' ? p.x0 : p.x0));
        var resGuess = Math.max(p.x0, p.x1) + 8;
        drawBox(p.x0, resGuess);
        drawBox(0, p.x1);
      }
    }
    ctx2d.restore();
  }

  function drawWrapped(ctx2d, simToScreenX, simToScreenY, viewW, viewH, simResX, simResY) {
    if (!ctx2d || !products.length) return;
    ctx2d.save();
    var sorted = products.slice().sort(function (a, b) {
      return (PRODUCTS[a.type].priority || 0) - (PRODUCTS[b.type].priority || 0);
    });
    for (var i = 0; i < sorted.length; i++) {
      var p = sorted[i];
      var meta = PRODUCTS[p.type];
      var sfcY = Number.isFinite(p.sfcY) ? p.sfcY : 1;
      var topY = p.kind === 'warning'
        ? sfcY + Math.max(18, (simResY || 200) * 0.22)
        : sfcY + Math.max(28, (simResY || 200) * 0.38);
      var y0 = simToScreenY(topY);
      var y1 = simToScreenY(Math.max(0, sfcY - 1));
      var h = Math.abs(y1 - y0);
      var top = Math.min(y0, y1);
      if (!Number.isFinite(h) || h < 4) continue;

      function paint(xa, xb) {
        var sx0 = simToScreenX(xa);
        var sx1 = simToScreenX(xb);
        var left = Math.min(sx0, sx1);
        var w = Math.abs(sx1 - sx0);
        if (w < 3) w = 3;
        if (left + w < -20 || left > viewW + 20) return;
        ctx2d.fillStyle = meta.fill;
        ctx2d.fillRect(left, top, w, h);
        ctx2d.strokeStyle = meta.stroke;
        ctx2d.lineWidth = p.kind === 'warning' ? 2.5 : 1.8;
        if (meta.dashed) ctx2d.setLineDash([7, 5]);
        else ctx2d.setLineDash([]);
        ctx2d.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
        ctx2d.setLineDash([]);
        ctx2d.font = 'bold 11px Arial, sans-serif';
        ctx2d.fillStyle = meta.text;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'top';
        var label = p.headline || meta.short;
        ctx2d.fillText(label, left + w * 0.5, top + 4);
      }

      if (!p.wrapped && p.x0 <= p.x1) {
        paint(p.x0, p.x1);
      } else {
        paint(p.x0, simResX);
        paint(0, p.x1);
      }
    }
    ctx2d.restore();
  }

  function tick(nowMs, ctx) {
    tickEas(nowMs != null ? nowMs : performance.now(), ctx || {});
  }

  function getProducts() {
    return products;
  }

  function clear() {
    products = [];
    lastUpdateIter = -1;
    easQueue.length = 0;
    finishEas();
  }

  function stopAlerts() {
    easQueue.length = 0;
    finishEas();
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.eas = {
    updateFromScan: updateFromScan,
    draw: drawWrapped,
    tick: tick,
    getProducts: getProducts,
    clear: clear,
    stopAlerts: stopAlerts,
    PRODUCTS: PRODUCTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
