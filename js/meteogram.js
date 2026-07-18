/**
 * Time-height meteogram panel for weather stations.
 * Samples on each station measure (~60 sim-seconds); keeps ≥1 sim-hour history.
 */
(function (global) {
  'use strict';

  const MAX_TIMES = 180;       // ~3 sim-hours at 60s cadence
  const NUM_LEVELS = 36;
  const MIN_HISTORY_FOR_HOUR = 60;

  const buffers = new WeakMap();
  let activeStation = null;
  let panelEl = null;
  let canvasEl = null;
  let ctx = null;
  let fieldMode = 'temp'; // temp | dew | wind | rh | cloud
  let scrubIndex = -1;     // -1 = latest
  let dragOffset = null;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function ensureBuffer(station) {
    let buf = buffers.get(station);
    if (!buf) {
      buf = {
        times: [],
        altsM: new Float32Array(NUM_LEVELS),
        tempC: [],
        dewC: [],
        windMs: [],
        cloud: [],
        sfcWind: [],
        sfcMslp: [],
        sfcPrecip: [],
        prevSoil: null,
      };
      buffers.set(station, buf);
    }
    return buf;
  }

  /**
   * Record one column sample from a weather station (called after measure).
   * @param {object} station
   * @param {object} sample
   */
  function record(station, sample) {
    if (!station || !sample) return;
    const buf = ensureBuffer(station);
    const levels = NUM_LEVELS;

    if (!buf.altsM || buf.altsM.length !== levels) {
      buf.altsM = new Float32Array(levels);
    }
    for (let i = 0; i < levels; i++)
      buf.altsM[i] = sample.altsM[i];

    buf.times.push(sample.timeIso || new Date().toISOString());
    buf.tempC.push(Float32Array.from(sample.tempsC));
    buf.dewC.push(Float32Array.from(sample.dewsC));
    buf.windMs.push(Float32Array.from(sample.windsMs));
    buf.cloud.push(Float32Array.from(sample.clouds));

    buf.sfcWind.push(sample.sfcWind);
    buf.sfcMslp.push(sample.mslp);
    let precip = 0;
    if (Number.isFinite(sample.precipHint))
      precip = Math.max(0, sample.precipHint);
    else if (buf.prevSoil != null && Number.isFinite(sample.soilMoisture))
      precip = Math.max(0, sample.soilMoisture - buf.prevSoil);
    buf.sfcPrecip.push(precip);
    if (Number.isFinite(sample.soilMoisture))
      buf.prevSoil = sample.soilMoisture;

    while (buf.times.length > MAX_TIMES) {
      buf.times.shift();
      buf.tempC.shift();
      buf.dewC.shift();
      buf.windMs.shift();
      buf.cloud.shift();
      buf.sfcWind.shift();
      buf.sfcMslp.shift();
      buf.sfcPrecip.shift();
    }

    if (activeStation === station && isOpen())
      draw();
  }

  function clearStation(station) {
    buffers.delete(station);
    if (activeStation === station) {
      activeStation = null;
      hide();
    }
  }

  function openForStation(station) {
    if (!station) return;
    activeStation = station;
    ensurePanel();
    panelEl.style.display = 'flex';
    if (guiControls)
      guiControls.displayMeteogram = true;
    scrubIndex = -1;
    draw();
  }

  function hide() {
    if (panelEl)
      panelEl.style.display = 'none';
    if (guiControls)
      guiControls.displayMeteogram = false;
  }

  function isOpen() {
    return !!(panelEl && panelEl.style.display !== 'none' && panelEl.style.display !== '');
  }

  function toggleForStation(station) {
    if (isOpen() && activeStation === station) {
      hide();
      return;
    }
    openForStation(station);
  }

  function setFieldMode(mode) {
    fieldMode = mode;
    draw();
  }

  function ensurePanel() {
    if (panelEl) return;

    panelEl = document.createElement('div');
    panelEl.id = 'meteogramPanel';
    panelEl.setAttribute('aria-label', 'Meteogram');
    panelEl.innerHTML = [
      '<div class="meteogram-header" id="meteogramDragHandle">',
      '  <span class="meteogram-title">Meteogram</span>',
      '  <div class="meteogram-controls">',
      '    <select id="meteogramField">',
      '      <option value="temp">Temperature</option>',
      '      <option value="dew">Dewpoint</option>',
      '      <option value="rh">Relative Humidity</option>',
      '      <option value="wind">Wind Speed</option>',
      '      <option value="cloud">Cloud Water</option>',
      '    </select>',
      '    <button type="button" id="meteogramClose" title="Close">✕</button>',
      '  </div>',
      '</div>',
      '<canvas id="meteogramCanvas" width="640" height="420"></canvas>',
      '<div class="meteogram-footer" id="meteogramFooter">Double-click a weather station to attach. Hover to scrub time.</div>',
    ].join('');

    const style = document.createElement('style');
    style.textContent = [
      '#meteogramPanel {',
      '  position: fixed; right: 16px; bottom: 16px; z-index: 1200;',
      '  display: none; flex-direction: column;',
      '  width: 660px; max-width: calc(100vw - 24px);',
      '  background: #13131f; border: 1px solid #252540; border-radius: 12px;',
      '  box-shadow: 0 8px 32px rgba(0,0,0,0.75); color: #fff;',
      '  font-family: Arial, sans-serif; font-size: 12px;',
      '  overflow: hidden;',
      '}',
      '#meteogramPanel .meteogram-header {',
      '  display: flex; justify-content: space-between; align-items: center;',
      '  padding: 8px 12px; background: linear-gradient(135deg,#191930,#0e0e22);',
      '  border-bottom: 1px solid #252540; cursor: move; user-select: none;',
      '}',
      '#meteogramPanel .meteogram-title { font-weight: 700; font-size: 13px; }',
      '#meteogramPanel .meteogram-controls { display: flex; gap: 8px; align-items: center; }',
      '#meteogramPanel select, #meteogramPanel button {',
      '  background: #1c1c30; color: #ddd; border: 1px solid #333; border-radius: 6px;',
      '  padding: 4px 8px; cursor: pointer;',
      '}',
      '#meteogramPanel canvas { display: block; width: 100%; height: auto; background: #0a0a14; cursor: crosshair; }',
      '#meteogramPanel .meteogram-footer {',
      '  padding: 6px 12px; color: #889; border-top: 1px solid #1c1c30; font-size: 11px;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
    document.body.appendChild(panelEl);

    canvasEl = panelEl.querySelector('#meteogramCanvas');
    ctx = canvasEl.getContext('2d');

    panelEl.querySelector('#meteogramClose').onclick = () => hide();
    panelEl.querySelector('#meteogramField').onchange = (e) => setFieldMode(e.target.value);

    canvasEl.addEventListener('mousemove', (e) => {
      const rect = canvasEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (canvasEl.width / rect.width);
      const buf = activeStation ? buffers.get(activeStation) : null;
      if (!buf || !buf.times.length) return;
      const plot = getPlotRect();
      if (x < plot.x || x > plot.x + plot.w) {
        scrubIndex = -1;
      } else {
        const t = (x - plot.x) / plot.w;
        scrubIndex = clamp(Math.round(t * (buf.times.length - 1)), 0, buf.times.length - 1);
      }
      draw();
    });
    canvasEl.addEventListener('mouseleave', () => {
      scrubIndex = -1;
      draw();
    });

    const handle = panelEl.querySelector('#meteogramDragHandle');
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('select') || e.target.closest('button')) return;
      const rect = panelEl.getBoundingClientRect();
      dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragOffset) return;
      panelEl.style.left = (e.clientX - dragOffset.x) + 'px';
      panelEl.style.top = (e.clientY - dragOffset.y) + 'px';
      panelEl.style.right = 'auto';
      panelEl.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { dragOffset = null; });
  }

  function getPlotRect() {
    const padL = 52, padR = 16, padT = 28, padB = 70;
    return {
      x: padL,
      y: padT,
      w: canvasEl.width - padL - padR,
      h: canvasEl.height - padT - padB - 60,
    };
  }

  function getStripRect() {
    const plot = getPlotRect();
    return {
      x: plot.x,
      y: plot.y + plot.h + 18,
      w: plot.w,
      h: 44,
    };
  }

  function tempColor(tC) {
    // -40 .. 40 °C blue → cyan → green → yellow → red
    const u = clamp((tC + 40) / 80, 0, 1);
    const r = Math.floor(255 * clamp(1.5 * u - 0.2, 0, 1));
    const g = Math.floor(255 * clamp(1.2 - Math.abs(u - 0.55) * 2.2, 0, 1));
    const b = Math.floor(255 * clamp(1.2 - u * 1.4, 0, 1));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function dewColor(tdC) {
    return tempColor(tdC);
  }

  function windColor(ms) {
    const u = clamp(ms / 40, 0, 1);
    return 'rgb(' + Math.floor(40 + 200 * u) + ',' + Math.floor(180 - 100 * u) + ',' + Math.floor(255 - 200 * u) + ')';
  }

  function rhColor(rh) {
    const u = clamp(rh / 100, 0, 1);
    return 'rgb(' + Math.floor(30 + 40 * u) + ',' + Math.floor(60 + 160 * u) + ',' + Math.floor(100 + 120 * u) + ')';
  }

  function cloudColor(c) {
    const u = clamp(c * 8, 0, 1);
    const v = Math.floor(30 + 200 * u);
    return 'rgb(' + v + ',' + v + ',' + Math.floor(v + 20) + ')';
  }

  function cellColor(mode, temp, dew, wind, cloud) {
    if (mode === 'dew') return dewColor(dew);
    if (mode === 'wind') return windColor(wind);
    if (mode === 'cloud') return cloudColor(cloud);
    if (mode === 'rh') {
      // Magnus approximation RH from T/Td
      const a = 17.625, b = 243.04;
      const es = Math.exp((a * temp) / (b + temp));
      const e = Math.exp((a * dew) / (b + dew));
      const rh = temp > -90 ? clamp(100 * e / es, 0, 100) : 0;
      return rhColor(rh);
    }
    return tempColor(temp);
  }

  function formatTimeLabel(iso) {
    try {
      const d = new Date(iso);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return hh + ':' + mm;
    } catch (e) {
      return '';
    }
  }

  function printVal(mode, temp, dew, wind, cloud) {
    if (typeof convertTempToSelectedUnit === 'function' && (mode === 'temp' || mode === 'dew')) {
      const v = mode === 'temp' ? temp : dew;
      return (typeof printTemp === 'function') ? printTemp(v) : v.toFixed(1) + '°';
    }
    if (mode === 'wind') {
      return (typeof printVelocity === 'function') ? printVelocity(wind) : wind.toFixed(1) + ' m/s';
    }
    if (mode === 'rh') {
      const a = 17.625, b = 243.04;
      const es = Math.exp((a * temp) / (b + temp));
      const e = Math.exp((a * dew) / (b + dew));
      return clamp(100 * e / es, 0, 100).toFixed(0) + '%';
    }
    if (mode === 'cloud') return cloud.toFixed(3);
    return temp.toFixed(1);
  }

  function draw() {
    ensurePanel();
    if (!ctx || !activeStation) return;
    const buf = buffers.get(activeStation);
    const W = canvasEl.width;
    const H = canvasEl.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    const title = panelEl.querySelector('.meteogram-title');
    if (title && typeof activeStation.getXpos === 'function')
      title.textContent = 'Meteogram @ x=' + activeStation.getXpos();

    const footer = panelEl.querySelector('#meteogramFooter');
    if (!buf || buf.times.length < 2) {
      ctx.fillStyle = '#889';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Collecting samples… (~60 sim-seconds each). Need a few minutes of history.', W / 2, H / 2);
      if (footer)
        footer.textContent = 'History: 0 samples. Run the sim with this station placed.';
      return;
    }

    const nT = buf.times.length;
    const nZ = buf.altsM.length;
    const plot = getPlotRect();
    const strip = getStripRect();
    const ti = scrubIndex >= 0 ? scrubIndex : (nT - 1);

    const altMin = buf.altsM[0];
    const altMax = buf.altsM[nZ - 1];
    const altSpan = Math.max(1, altMax - altMin);

    // Heatmap
    const cellW = plot.w / Math.max(1, nT - 1);
    const cellH = plot.h / nZ;
    for (let t = 0; t < nT; t++) {
      for (let z = 0; z < nZ; z++) {
        const temp = buf.tempC[t][z];
        const dew = buf.dewC[t][z];
        const wind = buf.windMs[t][z];
        const cloud = buf.cloud[t][z];
        ctx.fillStyle = cellColor(fieldMode, temp, dew, wind, cloud);
        const x = plot.x + (t / Math.max(1, nT - 1)) * plot.w - cellW * 0.5;
        const y = plot.y + plot.h - ((z + 1) / nZ) * plot.h;
        ctx.fillRect(x, y, Math.ceil(cellW + 1), Math.ceil(cellH + 1));
      }
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x, plot.y, plot.w, plot.h);

    ctx.fillStyle = '#ccd';
    ctx.font = '11px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let k = 0; k <= 4; k++) {
      const frac = k / 4;
      const alt = altMin + frac * altSpan;
      const y = plot.y + plot.h - frac * plot.h;
      const label = (typeof guiControls !== 'undefined' && guiControls.lengthUnit === 'LENGTH_UNIT_IMPERIAL')
        ? Math.round(alt * 3.28084) + ' ft'
        : Math.round(alt) + ' m';
      ctx.fillText(label, plot.x - 6, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(plot.x, y);
      ctx.lineTo(plot.x + plot.w, y);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#aabbcc';
    const labelStep = Math.max(1, Math.floor(nT / 6));
    for (let t = 0; t < nT; t += labelStep) {
      const x = plot.x + (t / Math.max(1, nT - 1)) * plot.w;
      ctx.fillText(formatTimeLabel(buf.times[t]), x, plot.y + plot.h + 4);
    }

    // Scrub line + readout
    const scrubX = plot.x + (ti / Math.max(1, nT - 1)) * plot.w;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(scrubX, plot.y);
    ctx.lineTo(scrubX, plot.y + plot.h);
    ctx.stroke();

    const midZ = Math.floor(nZ * 0.25);
    const readout = printVal(fieldMode, buf.tempC[ti][midZ], buf.dewC[ti][midZ], buf.windMs[ti][midZ], buf.cloud[ti][midZ]);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(formatTimeLabel(buf.times[ti]) + '  ·  ' + readout + ' (near-sfc)', plot.x, 8);

    // Surface strip: wind + MSLP + precip
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(strip.x, strip.y, strip.w, strip.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(strip.x, strip.y, strip.w, strip.h);

    function drawSeries(arr, color, minV, maxV) {
      if (!arr.length) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let t = 0; t < arr.length; t++) {
        const x = strip.x + (t / Math.max(1, arr.length - 1)) * strip.w;
        const u = (arr[t] - minV) / Math.max(1e-6, maxV - minV);
        const y = strip.y + strip.h - clamp(u, 0, 1) * strip.h;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    let maxWind = 1, maxPrecip = 0.01;
    let minMslp = 1080, maxMslp = 870;
    for (let i = 0; i < nT; i++) {
      maxWind = Math.max(maxWind, buf.sfcWind[i]);
      maxPrecip = Math.max(maxPrecip, buf.sfcPrecip[i]);
      minMslp = Math.min(minMslp, buf.sfcMslp[i]);
      maxMslp = Math.max(maxMslp, buf.sfcMslp[i]);
    }
    if (maxMslp - minMslp < 2) {
      minMslp -= 1;
      maxMslp += 1;
    }

    drawSeries(buf.sfcWind, '#aaaaaa', 0, maxWind * 1.1);
    drawSeries(buf.sfcMslp, '#ffcc66', minMslp, maxMslp);
    drawSeries(buf.sfcPrecip, '#55aaff', 0, maxPrecip * 1.2);

    ctx.fillStyle = '#889';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Surface: wind (gray) · MSLP (amber) · precip Δ (blue)', strip.x, strip.y + strip.h + 14);

    if (footer) {
      const mins = Math.round((nT - 1)); // ~1 sample/min
      footer.textContent = 'History: ' + nT + ' samples (~' + mins + ' sim-min)'
        + (nT >= MIN_HISTORY_FOR_HOUR ? ' — ≥1 hour ready' : ' — building toward 1 sim-hour')
        + ' · Hover plot to scrub';
    }
  }

  function syncVisibilityFromGui() {
    if (!guiControls) return;
    if (guiControls.displayMeteogram) {
      if (activeStation)
        openForStation(activeStation);
      else if (typeof weatherStations !== 'undefined' && weatherStations.length)
        openForStation(weatherStations[weatherStations.length - 1]);
      else
        ensurePanel();
    } else {
      hide();
    }
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.meteogram = {
    record,
    clearStation,
    openForStation,
    toggleForStation,
    hide,
    isOpen,
    draw,
    syncVisibilityFromGui,
    MAX_TIMES,
    NUM_LEVELS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
