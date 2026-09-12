/**
 * Forecast challenge — issue a short forecast, run existing free-run forecast,
 * then score against meteogram / station samples. No fluid/dynamics changes.
 */
(function (global) {
  'use strict';

  var panel = null;
  var pendingGuess = null;
  var lastResult = null;
  var challengeActive = false;

  var WIND_BINS = [
    { id: 'calm', label: 'Calm (<5 m/s)', maxMs: 5 },
    { id: 'breezy', label: 'Breezy (5–12 m/s)', maxMs: 12 },
    { id: 'windy', label: 'Windy (12–20 m/s)', maxMs: 20 },
    { id: 'severe', label: 'Severe (≥20 m/s)', maxMs: Infinity },
  ];

  var SEVERE_BINS = [
    { id: 'none', label: 'None', rank: 0 },
    { id: 'slight', label: 'Slight', rank: 1 },
    { id: 'enhanced', label: 'Enhanced', rank: 2 },
    { id: 'moderate', label: 'Moderate', rank: 3 },
    { id: 'high', label: 'High', rank: 4 },
  ];

  function windBinFromMs(ms) {
    for (var i = 0; i < WIND_BINS.length; i++) {
      if (ms < WIND_BINS[i].maxMs || WIND_BINS[i].maxMs === Infinity)
        return WIND_BINS[i];
    }
    return WIND_BINS[WIND_BINS.length - 1];
  }

  function severeBinFromMetrics(maxCape, maxSrh, maxPrecipRate) {
    var rank = 0;
    if (maxCape >= 500 || maxSrh >= 50 || maxPrecipRate >= 0.05) rank = 1;
    if (maxCape >= 1200 || maxSrh >= 120 || maxPrecipRate >= 0.12) rank = 2;
    if (maxCape >= 2000 || maxSrh >= 200 || maxPrecipRate >= 0.22) rank = 3;
    if (maxCape >= 3000 || maxSrh >= 300 || maxPrecipRate >= 0.35) rank = 4;
    return SEVERE_BINS[rank];
  }

  function ensurePanel() {
    if (panel || typeof document === 'undefined') return panel;
    panel = document.createElement('div');
    panel.id = 'wsForecastChallenge';
    panel.className = 'ws-overlay-panel';
    panel.style.cssText = 'left:16px;top:72px;width:320px;max-width:calc(100vw - 24px);display:none;z-index:10060;';
    panel.innerHTML =
      '<div class="ws-overlay-header">' +
        '<span class="ws-overlay-title">Forecast Challenge</span>' +
        '<button type="button" class="ws-overlay-close" id="wsFcClose" aria-label="Close">✕</button>' +
      '</div>' +
      '<div class="ws-fc-body" id="wsFcBody"></div>';
    document.body.appendChild(panel);
    panel.querySelector('#wsFcClose').addEventListener('click', function () {
      hide();
    });
    return panel;
  }

  function renderGuessForm(leadHours) {
    ensurePanel();
    var body = panel.querySelector('#wsFcBody');
    var windOpts = WIND_BINS.map(function (b) {
      return '<option value="' + b.id + '">' + b.label + '</option>';
    }).join('');
    var sevOpts = SEVERE_BINS.map(function (b) {
      return '<option value="' + b.id + '">' + b.label + '</option>';
    }).join('');
    body.innerHTML =
      '<p class="ws-fc-help">Call the next ' + leadHours + 'h, then we free-run the existing forecast and score your call. Place a weather station for best scoring.</p>' +
      '<label class="ws-fc-label">Precip onset (sim-minutes from now, 0 = none)</label>' +
      '<input type="number" id="wsFcPrecipMin" class="ws-fc-input" min="0" max="360" step="5" value="30">' +
      '<label class="ws-fc-label">Max wind category</label>' +
      '<select id="wsFcWind" class="ws-fc-input">' + windOpts + '</select>' +
      '<label class="ws-fc-label">Severe risk</label>' +
      '<select id="wsFcSevere" class="ws-fc-input">' + sevOpts + '</select>' +
      '<div class="ws-fc-actions">' +
        '<button type="button" class="ws-overlay-btn" id="wsFcRun">Lock call &amp; run forecast</button>' +
      '</div>' +
      '<div class="ws-fc-status" id="wsFcStatus"></div>';
    body.querySelector('#wsFcRun').onclick = function () {
      var precipMin = parseFloat(body.querySelector('#wsFcPrecipMin').value);
      if (!Number.isFinite(precipMin) || precipMin < 0) precipMin = 0;
      pendingGuess = {
        precipOnsetMin: precipMin,
        windBin: body.querySelector('#wsFcWind').value,
        severeBin: body.querySelector('#wsFcSevere').value,
        leadHours: leadHours,
        startedAtMs: Date.now(),
      };
      var replay = global.WeatherSandbox && global.WeatherSandbox.replay;
      if (!replay || typeof replay.startForecast !== 'function') {
        body.querySelector('#wsFcStatus').textContent = 'Replay / forecast module not loaded.';
        pendingGuess = null;
        return;
      }
      challengeActive = true;
      body.querySelector('#wsFcStatus').textContent = 'Running forecast… hang tight.';
      body.querySelector('#wsFcRun').disabled = true;
      replay.startForecast(leadHours);
      var mode = typeof replay.getMode === 'function' ? replay.getMode() : '';
      if (mode !== 'forecastRun' && mode !== 'forecastView') {
        challengeActive = false;
        pendingGuess = null;
        body.querySelector('#wsFcRun').disabled = false;
        body.querySelector('#wsFcStatus').textContent = 'Could not start forecast (finish recording first, or try again).';
      }
    };
  }

  function renderResult(result) {
    ensurePanel();
    panel.style.display = 'flex';
    var body = panel.querySelector('#wsFcBody');
    var rows = (result.breakdown || []).map(function (r) {
      return '<div class="ws-fc-row"><span>' + r.label + '</span><span>' + r.detail + '</span><strong>' + r.pts + '</strong></div>';
    }).join('');
    body.innerHTML =
      '<div class="ws-fc-score">Score: <strong>' + result.score + '</strong> / ' + result.maxScore + '</div>' +
      '<div class="ws-fc-breakdown">' + rows + '</div>' +
      '<p class="ws-fc-help">' + (result.summary || '') + '</p>' +
      '<div class="ws-fc-actions">' +
        '<button type="button" class="ws-overlay-btn" id="wsFcAgain">New challenge</button>' +
      '</div>';
    body.querySelector('#wsFcAgain').onclick = function () {
      openChallenge();
    };
  }

  function analyzeTruth(buf, leadHours) {
    var truth = {
      precipOnsetMin: null,
      maxWindMs: 0,
      maxCape: 0,
      maxSrh: 0,
      maxPrecipRate: 0,
      sampleCount: 0,
    };
    if (!buf || !buf.times || !buf.times.length)
      return truth;

    var t0 = Date.parse(buf.times[0]);
    truth.sampleCount = buf.times.length;
    for (var i = 0; i < buf.times.length; i++) {
      var wind = buf.sfcWind[i];
      var cape = buf.sfcCape ? buf.sfcCape[i] : 0;
      var srh = buf.sfcSrh ? buf.sfcSrh[i] : 0;
      var pr = buf.sfcPrecipRate ? buf.sfcPrecipRate[i] : (buf.sfcPrecip ? buf.sfcPrecip[i] : 0);
      if (Number.isFinite(wind) && wind > truth.maxWindMs) truth.maxWindMs = wind;
      if (Number.isFinite(cape) && cape > truth.maxCape) truth.maxCape = cape;
      if (Number.isFinite(srh) && srh > truth.maxSrh) truth.maxSrh = srh;
      if (Number.isFinite(pr) && pr > truth.maxPrecipRate) truth.maxPrecipRate = pr;
      if (truth.precipOnsetMin == null && Number.isFinite(pr) && pr >= 0.02) {
        var ti = Date.parse(buf.times[i]);
        if (Number.isFinite(t0) && Number.isFinite(ti))
          truth.precipOnsetMin = Math.max(0, Math.round((ti - t0) / 60000));
        else
          truth.precipOnsetMin = Math.round(i * (leadHours * 60) / Math.max(1, buf.times.length - 1));
      }
    }
    if (truth.precipOnsetMin == null && truth.maxPrecipRate < 0.02)
      truth.precipOnsetMin = null; // none
    return truth;
  }

  function scoreGuess(guess, truth) {
    var breakdown = [];
    var score = 0;
    var maxScore = 100;

    // Precip onset: 40 pts
    var precipPts = 0;
    var guessNone = !guess.precipOnsetMin || guess.precipOnsetMin <= 0;
    var truthNone = truth.precipOnsetMin == null;
    var precipDetail;
    if (guessNone && truthNone) {
      precipPts = 40;
      precipDetail = 'Both none';
    } else if (guessNone !== truthNone) {
      precipPts = 0;
      precipDetail = 'Guess ' + (guessNone ? 'none' : guess.precipOnsetMin + 'm')
        + ' vs truth ' + (truthNone ? 'none' : truth.precipOnsetMin + 'm');
    } else {
      var err = Math.abs(guess.precipOnsetMin - truth.precipOnsetMin);
      if (err <= 15) precipPts = 40;
      else if (err <= 30) precipPts = 28;
      else if (err <= 60) precipPts = 16;
      else precipPts = 4;
      precipDetail = 'Guess ' + guess.precipOnsetMin + 'm vs ' + truth.precipOnsetMin + 'm (Δ' + err + 'm)';
    }
    score += precipPts;
    breakdown.push({ label: 'Precip onset', detail: precipDetail, pts: precipPts + '/40' });

    // Wind: 30 pts
    var truthWind = windBinFromMs(truth.maxWindMs || 0);
    var windPts = guess.windBin === truthWind.id ? 30 : (
      Math.abs(WIND_BINS.findIndex(function (b) { return b.id === guess.windBin; })
        - WIND_BINS.findIndex(function (b) { return b.id === truthWind.id; })) === 1 ? 12 : 0
    );
    score += windPts;
    breakdown.push({
      label: 'Max wind',
      detail: 'Guess ' + guess.windBin + ' vs ' + truthWind.id + ' (' + (truth.maxWindMs || 0).toFixed(1) + ' m/s)',
      pts: windPts + '/30',
    });

    // Severe: 30 pts
    var truthSev = severeBinFromMetrics(truth.maxCape, truth.maxSrh, truth.maxPrecipRate);
    var gRank = (SEVERE_BINS.find(function (b) { return b.id === guess.severeBin; }) || SEVERE_BINS[0]).rank;
    var tRank = truthSev.rank;
    var sevPts = gRank === tRank ? 30 : (Math.abs(gRank - tRank) === 1 ? 14 : 0);
    score += sevPts;
    breakdown.push({
      label: 'Severe risk',
      detail: 'Guess ' + guess.severeBin + ' vs ' + truthSev.id
        + ' (CAPE ' + Math.round(truth.maxCape || 0) + ', SRH ' + Math.round(truth.maxSrh || 0) + ')',
      pts: sevPts + '/30',
    });

    return {
      score: score,
      maxScore: maxScore,
      breakdown: breakdown,
      summary: truth.sampleCount
        ? ('Scored from ' + truth.sampleCount + ' station/meteogram samples across the forecast.')
        : 'No station samples — place a weather station and try again for better scoring.',
      truth: truth,
    };
  }

  function onForecastComplete() {
    if (!challengeActive || !pendingGuess) return;
    challengeActive = false;
    var guess = pendingGuess;
    pendingGuess = null;

    var truth = { precipOnsetMin: null, maxWindMs: 0, maxCape: 0, maxSrh: 0, maxPrecipRate: 0, sampleCount: 0 };
    try {
      var stations = global.weatherStations;
      var met = global.WeatherSandbox && global.WeatherSandbox.meteogram;
      if (stations && stations.length && met && typeof met.getBuffer === 'function') {
        var buf = met.getBuffer(stations[0]);
        truth = analyzeTruth(buf, guess.leadHours);
      }
    } catch (e) {
      console.warn('Forecast challenge scoring:', e);
    }

    lastResult = scoreGuess(guess, truth);
    renderResult(lastResult);
  }

  function openChallenge() {
    var gui = global.guiControls;
    var lead = (gui && Number(gui.forecastLeadHours)) || 3;
    ensurePanel();
    panel.style.display = 'flex';
    challengeActive = false;
    pendingGuess = null;
    renderGuessForm(lead);
  }

  function hide() {
    if (panel) panel.style.display = 'none';
  }

  function isChallengePending() {
    return challengeActive;
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.forecastChallenge = {
    open: openChallenge,
    hide: hide,
    onForecastComplete: onForecastComplete,
    isChallengePending: isChallengePending,
    getLastResult: function () { return lastResult; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
