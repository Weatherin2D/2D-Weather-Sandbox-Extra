/**
 * Simulation replay + free-run forecast timeline.
 * Full-state keyframes (base/water/wall/precip/light/charge) with scrubbing.
 */
(function (global) {
  'use strict';

  var MAGIC = 'WSREPLAY';
  var FILE_VERSION = 1;
  var DB_NAME = 'WeatherSandboxReplay';
  var DB_STORE = 'sessions';
  var DB_VERSION = 1;
  var DEFAULT_MAX_KEYFRAMES = 120;
  var DEFAULT_FORECAST_LEADS = [0, 15, 30, 60, 120, 180];

  var hooks = null;
  var session = null; // active in-memory session
  var mode = 'idle'; // idle | recording | replay | forecastRun | forecastView
  var playback = {
    playing: false,
    speed: 1,
    index: 0,
    lastAdvanceMs: 0,
  };
  var forecastState = {
    icPayload: null,
    icMeta: null,
    targetLeadMin: 180,
    nextLeadIdx: 0,
    startIter: 0,
    startSimMs: 0,
    leads: DEFAULT_FORECAST_LEADS.slice(),
    savedIterPerFrame: null,
    savedAutoIter: null,
    savedPaused: null,
  };
  var ui = {
    bar: null,
    scrub: null,
    status: null,
    playBtn: null,
  };

  function NS() {
    return global.WeatherSandbox || (global.WeatherSandbox = {});
  }

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function pako() {
    return global.pako;
  }

  function downloadBlob(filename, blob) {
    if (NS().saveLoad && typeof NS().saveLoad.downloadBlob === 'function') {
      NS().saveLoad.downloadBlob(filename, blob);
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
    }, 1000);
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        resolve(null);
        return;
      }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE))
          db.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }

  function idbPut(record) {
    return openDb().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(record);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
        } catch (e) {
          resolve();
        }
      });
    });
  }

  function idbGet(id) {
    return openDb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(DB_STORE, 'readonly');
          var req = tx.objectStore(DB_STORE).get(id);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        } catch (e) {
          resolve(null);
        }
      });
    });
  }

  function compressPayload(arrayBuffer) {
    var u8 = arrayBuffer instanceof Uint8Array
      ? arrayBuffer
      : new Uint8Array(arrayBuffer);
    var pk = pako();
    if (!pk || !pk.deflate)
      return u8;
    return pk.deflate(u8, { level: 1 });
  }

  function decompressPayload(u8) {
    var pk = pako();
    if (!pk || !pk.inflate)
      return u8;
    return pk.inflate(u8);
  }

  function createSession(kind, headerExtra) {
    var res = hooks && hooks.getResolution ? hooks.getResolution() : { x: 0, y: 0 };
    var meta0 = hooks && hooks.getMeta ? hooks.getMeta() : {};
    return {
      id: 'sess_' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
      kind: kind || 'replay',
      version: FILE_VERSION,
      createdAt: new Date().toISOString(),
      resX: res.x | 0,
      resY: res.y | 0,
      startSimDateTimeMs: meta0.simDateTimeMs || 0,
      startIterNum: meta0.iterNum || 0,
      maxKeyframes: (hooks && hooks.getMaxKeyframes)
        ? hooks.getMaxKeyframes()
        : DEFAULT_MAX_KEYFRAMES,
      keyframes: [], // { meta, compressed: Uint8Array }
      headerExtra: headerExtra || {},
    };
  }

  function trimRingBuffer(sess) {
    var maxK = sess.maxKeyframes || DEFAULT_MAX_KEYFRAMES;
    while (sess.keyframes.length > maxK)
      sess.keyframes.shift();
  }

  function captureKeyframeNow(extraMeta) {
    if (!hooks || !hooks.capturePayload)
      throw new Error('Replay hooks not registered');
    var payload = hooks.capturePayload();
    var compressed = compressPayload(payload);
    var meta = Object.assign({}, hooks.getMeta ? hooks.getMeta() : {}, extraMeta || {});
    meta.capturedAt = new Date().toISOString();
    return { meta: meta, compressed: compressed };
  }

  function appendKeyframe(extraMeta) {
    if (!session) return null;
    var kf = captureKeyframeNow(extraMeta);
    session.keyframes.push(kf);
    trimRingBuffer(session);
    // Fire-and-forget IndexedDB autosave of session shell (without huge payloads every time
    // would be better, but we persist full session for crash recovery on stop/export).
    return kf;
  }

  function applyKeyframeAt(index) {
    if (!session || !session.keyframes.length) return false;
    var i = clamp(index | 0, 0, session.keyframes.length - 1);
    playback.index = i;
    var kf = session.keyframes[i];
    var raw = decompressPayload(kf.compressed);
    var buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    if (hooks.applyPayload)
      hooks.applyPayload(buf);
    if (hooks.applyMeta)
      hooks.applyMeta(kf.meta || {});
    updateUi();
    return true;
  }

  function encodeFile(sess) {
    var header = {
      magic: MAGIC,
      version: FILE_VERSION,
      kind: sess.kind,
      createdAt: sess.createdAt,
      resX: sess.resX,
      resY: sess.resY,
      startSimDateTimeMs: sess.startSimDateTimeMs,
      startIterNum: sess.startIterNum,
      keyframeCount: sess.keyframes.length,
      headerExtra: sess.headerExtra || {},
    };
    var headerJson = JSON.stringify(header);
    var headerBytes = new TextEncoder().encode(headerJson);

    var parts = [];
    // [magic8][ver u32][headerLen u32][header][count u32][frames...]
    var preface = new ArrayBuffer(8 + 4 + 4);
    var pv = new DataView(preface);
    for (var m = 0; m < 8; m++)
      pv.setUint8(m, MAGIC.charCodeAt(m));
    pv.setUint32(8, FILE_VERSION, true);
    pv.setUint32(12, headerBytes.length, true);
    parts.push(preface, headerBytes);

    var countBuf = new ArrayBuffer(4);
    new DataView(countBuf).setUint32(0, sess.keyframes.length, true);
    parts.push(countBuf);

    for (var i = 0; i < sess.keyframes.length; i++) {
      var kf = sess.keyframes[i];
      var metaBytes = new TextEncoder().encode(JSON.stringify(kf.meta || {}));
      var metaLenBuf = new ArrayBuffer(4);
      new DataView(metaLenBuf).setUint32(0, metaBytes.length, true);
      var payload = kf.compressed;
      var payLenBuf = new ArrayBuffer(4);
      new DataView(payLenBuf).setUint32(0, payload.byteLength, true);
      parts.push(metaLenBuf, metaBytes, payLenBuf, payload);
    }
    return new Blob(parts, { type: 'application/octet-stream' });
  }

  function decodeFile(arrayBuffer) {
    var view = new DataView(arrayBuffer);
    var magic = '';
    for (var i = 0; i < 8; i++)
      magic += String.fromCharCode(view.getUint8(i));
    if (magic !== MAGIC)
      throw new Error('Not a Weather Sandbox replay file');
    var ver = view.getUint32(8, true);
    if (ver !== FILE_VERSION)
      throw new Error('Unsupported replay version: ' + ver);
    var headerLen = view.getUint32(12, true);
    var offset = 16;
    var headerJson = new TextDecoder().decode(new Uint8Array(arrayBuffer, offset, headerLen));
    offset += headerLen;
    var header = JSON.parse(headerJson);
    var count = view.getUint32(offset, true);
    offset += 4;
    var keyframes = [];
    for (var k = 0; k < count; k++) {
      var metaLen = view.getUint32(offset, true);
      offset += 4;
      var meta = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, offset, metaLen)));
      offset += metaLen;
      var payLen = view.getUint32(offset, true);
      offset += 4;
      var compressed = new Uint8Array(arrayBuffer, offset, payLen).slice();
      offset += payLen;
      keyframes.push({ meta: meta, compressed: compressed });
    }
    return {
      id: 'loaded_' + Date.now(),
      kind: header.kind || 'replay',
      version: ver,
      createdAt: header.createdAt,
      resX: header.resX,
      resY: header.resY,
      startSimDateTimeMs: header.startSimDateTimeMs,
      startIterNum: header.startIterNum,
      maxKeyframes: DEFAULT_MAX_KEYFRAMES * 4,
      keyframes: keyframes,
      headerExtra: header.headerExtra || {},
    };
  }

  function ensureUi() {
    if (ui.bar) return;
    if (typeof document === 'undefined' || !document.body) return;
    var bar = document.createElement('div');
    bar.id = 'wsReplayBar';
    bar.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:12px', 'transform:translateX(-50%)',
      'z-index:10050', 'display:none', 'align-items:center', 'gap:10px',
      'padding:8px 14px', 'background:rgba(10,14,22,0.88)', 'border:1px solid rgba(255,255,255,0.18)',
      'border-radius:10px', 'color:#eee', 'font:12px/1.3 Arial,sans-serif',
      'box-shadow:0 6px 24px rgba(0,0,0,0.45)', 'min-width:420px', 'max-width:90vw',
    ].join(';');
    bar.innerHTML =
      '<button type="button" id="wsReplayPlay" style="cursor:pointer;padding:4px 10px;">Play</button>' +
      '<input type="range" id="wsReplayScrub" min="0" max="0" value="0" step="1" style="flex:1;min-width:160px;">' +
      '<span id="wsReplayStatus" style="white-space:nowrap;opacity:0.9;">—</span>' +
      '<button type="button" id="wsReplayExit" style="cursor:pointer;padding:4px 10px;">Exit</button>';
    document.body.appendChild(bar);
    ui.bar = bar;
    ui.scrub = bar.querySelector('#wsReplayScrub');
    ui.status = bar.querySelector('#wsReplayStatus');
    ui.playBtn = bar.querySelector('#wsReplayPlay');
    ui.scrub.addEventListener('input', function () {
      playback.playing = false;
      if (ui.playBtn) ui.playBtn.textContent = 'Play';
      applyKeyframeAt(parseInt(ui.scrub.value, 10) || 0);
    });
    ui.playBtn.addEventListener('click', function () {
      playback.playing = !playback.playing;
      playback.lastAdvanceMs = nowMs();
      ui.playBtn.textContent = playback.playing ? 'Pause' : 'Play';
    });
    bar.querySelector('#wsReplayExit').addEventListener('click', function () {
      exitReplayOrForecast();
    });
  }

  function formatLead(meta) {
    if (meta && Number.isFinite(meta.leadMinutes))
      return 'T+' + meta.leadMinutes + 'm';
    if (meta && Number.isFinite(meta.simDateTimeMs)) {
      try {
        return new Date(meta.simDateTimeMs).toISOString().replace('T', ' ').slice(0, 19);
      } catch (e) { /* fall through */ }
    }
    if (meta && Number.isFinite(meta.iterNum))
      return 'iter ' + meta.iterNum;
    return '';
  }

  function updateUi() {
    if (typeof document === 'undefined' || !document.body) return;
    ensureUi();
    if (!ui.bar) return;
    var show = mode === 'replay' || mode === 'forecastView' || mode === 'forecastRun' || mode === 'recording';
    ui.bar.style.display = show ? 'flex' : 'none';
    if (!session) {
      if (ui.status) ui.status.textContent = mode === 'recording' ? 'Recording…' : '—';
      return;
    }
    var n = session.keyframes.length;
    if (ui.scrub) {
      ui.scrub.max = Math.max(0, n - 1);
      ui.scrub.value = String(playback.index);
      ui.scrub.disabled = mode === 'forecastRun' || mode === 'recording';
    }
    if (ui.playBtn)
      ui.playBtn.disabled = mode === 'forecastRun' || mode === 'recording' || n < 2;
    var kf = session.keyframes[playback.index];
    var label = (session.kind === 'forecast' ? 'Forecast' : 'Replay')
      + ' ' + (playback.index + 1) + '/' + n
      + (kf ? ' · ' + formatLead(kf.meta) : '');
    if (mode === 'recording')
      label = 'Recording · ' + n + ' keyframes';
    if (mode === 'forecastRun')
      label = 'Forecast running… ' + n + ' products · next '
        + (forecastState.leads[forecastState.nextLeadIdx] != null
          ? ('T+' + forecastState.leads[forecastState.nextLeadIdx] + 'm')
          : 'done');
    if (ui.status) ui.status.textContent = label;
  }

  function setMode(next) {
    mode = next;
    if (hooks && hooks.onModeChange)
      hooks.onModeChange(mode);
    updateUi();
  }

  function isPhysicsBlocked() {
    return mode === 'replay' || mode === 'forecastView';
  }

  function isRecording() {
    return mode === 'recording';
  }

  function isForecastRunning() {
    return mode === 'forecastRun';
  }

  function startRecording() {
    if (!hooks) {
      alert('Replay system not ready');
      return;
    }
    if (mode !== 'idle') {
      alert('Exit replay/forecast before recording');
      return;
    }
    session = createSession('replay');
    playback.index = 0;
    playback.playing = false;
    appendKeyframe({ reason: 'start' });
    setMode('recording');
    persistSessionSoon();
  }

  function stopRecording(andDownload) {
    if (mode !== 'recording' || !session) return;
    appendKeyframe({ reason: 'stop' });
    var sess = session;
    setMode('idle');
    persistSessionSoon();
    if (andDownload !== false)
      downloadBlob('recording_' + Date.now() + '.wsreplay', encodeFile(sess));
    // Keep session loaded for immediate scrubbing
    session = sess;
    setMode('replay');
    applyKeyframeAt(session.keyframes.length - 1);
  }

  function persistSessionSoon() {
    if (!session) return;
    // Store a light index + last few frames only to avoid huge IDB writes mid-record;
    // full export is via file download.
    var light = {
      id: 'last',
      kind: session.kind,
      createdAt: session.createdAt,
      resX: session.resX,
      resY: session.resY,
      keyframeCount: session.keyframes.length,
      updatedAt: new Date().toISOString(),
    };
    idbPut(light);
  }

  function exportCurrentSession() {
    if (!session || !session.keyframes.length) {
      alert('No replay session to export');
      return;
    }
    var ext = session.kind === 'forecast' ? '.wsforecast' : '.wsreplay';
    downloadBlob((session.kind || 'replay') + '_' + Date.now() + ext, encodeFile(session));
  }

  function loadFromArrayBuffer(arrayBuffer) {
    var sess = decodeFile(arrayBuffer);
    if (hooks && hooks.getResolution) {
      var res = hooks.getResolution();
      if (res.x && res.y && (sess.resX !== res.x || sess.resY !== res.y)) {
        throw new Error('Replay resolution ' + sess.resX + 'x' + sess.resY
          + ' does not match current sim ' + res.x + 'x' + res.y);
      }
    }
    session = sess;
    playback.index = 0;
    playback.playing = false;
    setMode(sess.kind === 'forecast' ? 'forecastView' : 'replay');
    applyKeyframeAt(0);
  }

  function loadFromFileInput() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.wsreplay,.wsforecast,application/octet-stream';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          loadFromArrayBuffer(reader.result);
        } catch (e) {
          alert('Failed to load replay: ' + (e && e.message ? e.message : e));
        }
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  }

  function exitReplayOrForecast() {
    playback.playing = false;
    if (mode === 'forecastView' || mode === 'forecastRun') {
      // Restore IC if we have one
      if (forecastState.icPayload && hooks && hooks.applyPayload) {
        hooks.applyPayload(forecastState.icPayload);
        if (hooks.applyMeta && forecastState.icMeta)
          hooks.applyMeta(forecastState.icMeta);
      }
      if (forecastState.savedIterPerFrame != null && hooks && hooks.restoreSimSpeed)
        hooks.restoreSimSpeed(forecastState.savedIterPerFrame, forecastState.savedAutoIter, forecastState.savedPaused);
      forecastState.icPayload = null;
      forecastState.icMeta = null;
    }
    setMode('idle');
    updateUi();
  }

  function enterReplayOfCurrentSession() {
    if (!session || !session.keyframes.length) {
      alert('No keyframes loaded');
      return;
    }
    setMode(session.kind === 'forecast' ? 'forecastView' : 'replay');
    applyKeyframeAt(playback.index);
  }

  /** Called from app draw loop while recording. */
  function maybeCaptureDuringRecord(iterNum) {
    if (mode !== 'recording' || !hooks) return;
    var intervalSec = hooks.getRecordIntervalSimSec
      ? hooks.getRecordIntervalSimSec()
      : 60;
    var timePerIterHours = hooks.getTimePerIterationHours
      ? hooks.getTimePerIterationHours()
      : 0.00008;
    var intervalIters = Math.max(1, Math.round(intervalSec / (timePerIterHours * 3600)));
    var last = session.keyframes[session.keyframes.length - 1];
    var lastIter = last && last.meta ? (last.meta.iterNum || 0) : 0;
    if ((iterNum - lastIter) >= intervalIters)
      appendKeyframe({ reason: 'interval' });
    updateUi();
  }

  /** Start free-run forecast from current state. */
  function startForecast(leadHours) {
    if (!hooks) {
      alert('Forecast system not ready');
      return;
    }
    if (mode !== 'idle' && mode !== 'replay' && mode !== 'forecastView') {
      alert('Finish recording first');
      return;
    }
    var hours = Number(leadHours);
    if (!Number.isFinite(hours) || hours <= 0)
      hours = 3;
    var leadMin = Math.round(hours * 60);
    var leads = DEFAULT_FORECAST_LEADS.filter(function (m) { return m <= leadMin; });
    if (leads.length === 0 || leads[leads.length - 1] !== leadMin)
      leads.push(leadMin);

    // Capture IC
    var ic = captureKeyframeNow({ reason: 'ic' });
    var rawIc = decompressPayload(ic.compressed);
    forecastState.icPayload = rawIc.buffer.slice(rawIc.byteOffset, rawIc.byteOffset + rawIc.byteLength);
    forecastState.icMeta = Object.assign({}, ic.meta);
    forecastState.targetLeadMin = leadMin;
    forecastState.leads = leads.slice();
    forecastState.nextLeadIdx = 0;
    forecastState.startIter = (ic.meta && ic.meta.iterNum) || 0;
    forecastState.startSimMs = (ic.meta && ic.meta.simDateTimeMs) || 0;

    session = createSession('forecast', { leadMinutesList: leads.slice() });
    // Frame 0 = analysis
    session.keyframes.push({
      meta: Object.assign({}, ic.meta, { leadMinutes: 0, reason: 'analysis' }),
      compressed: ic.compressed,
    });
    forecastState.nextLeadIdx = 1; // next after 0

    if (hooks.prepareForecastRun) {
      var speed = hooks.prepareForecastRun();
      forecastState.savedIterPerFrame = speed.iterPerFrame;
      forecastState.savedAutoIter = speed.autoIter;
      forecastState.savedPaused = speed.paused;
    }
    setMode('forecastRun');
    updateUi();
  }

  function forecastLeadIters(leadMinutes) {
    var timePerIterHours = hooks.getTimePerIterationHours
      ? hooks.getTimePerIterationHours()
      : 0.00008;
    var hours = leadMinutes / 60;
    return Math.max(1, Math.round(hours / timePerIterHours));
  }

  /** Called each frame during forecast free-run. */
  function tickForecast(iterNum) {
    if (mode !== 'forecastRun' || !session) return;
    var leads = forecastState.leads || DEFAULT_FORECAST_LEADS;
    while (forecastState.nextLeadIdx < leads.length) {
      var lead = leads[forecastState.nextLeadIdx];
      var targetIter = forecastState.startIter + forecastLeadIters(lead);
      if (iterNum < targetIter)
        break;
      appendKeyframe({ leadMinutes: lead, reason: 'forecast' });
      forecastState.nextLeadIdx++;
      updateUi();
    }
    if (forecastState.nextLeadIdx >= leads.length) {
      if (hooks && hooks.onForecastComplete)
        hooks.onForecastComplete();
      setMode('forecastView');
      playback.index = session.keyframes.length - 1;
      playback.playing = false;
      if (hooks.buildForecastMeteogram)
        hooks.buildForecastMeteogram(session);
      updateUi();
    }
  }

  /** Advance playback during draw when playing. */
  function tickPlayback(dtMs) {
    if (!playback.playing) return;
    if (mode !== 'replay' && mode !== 'forecastView') return;
    if (!session || session.keyframes.length < 2) return;
    var intervalMs = 400 / Math.max(0.25, playback.speed);
    playback.lastAdvanceMs = playback.lastAdvanceMs || nowMs();
    if (nowMs() - playback.lastAdvanceMs < intervalMs) return;
    playback.lastAdvanceMs = nowMs();
    var next = playback.index + 1;
    if (next >= session.keyframes.length) {
      playback.playing = false;
      if (ui.playBtn) ui.playBtn.textContent = 'Play';
      return;
    }
    applyKeyframeAt(next);
  }

  function registerHooks(h) {
    hooks = h || null;
  }

  function getMode() { return mode; }
  function getSession() { return session; }
  function getPlaybackIndex() { return playback.index; }
  function setPlaybackSpeed(s) { playback.speed = clamp(Number(s) || 1, 0.25, 8); }

  function seek(index) {
    if (mode === 'replay' || mode === 'forecastView')
      applyKeyframeAt(index);
  }

  NS().replay = {
    registerHooks: registerHooks,
    startRecording: startRecording,
    stopRecording: stopRecording,
    exportCurrentSession: exportCurrentSession,
    loadFromFileInput: loadFromFileInput,
    loadFromArrayBuffer: loadFromArrayBuffer,
    exitReplayOrForecast: exitReplayOrForecast,
    enterReplayOfCurrentSession: enterReplayOfCurrentSession,
    startForecast: startForecast,
    maybeCaptureDuringRecord: maybeCaptureDuringRecord,
    tickForecast: tickForecast,
    tickPlayback: tickPlayback,
    isPhysicsBlocked: isPhysicsBlocked,
    isRecording: isRecording,
    isForecastRunning: isForecastRunning,
    getMode: getMode,
    getSession: getSession,
    getPlaybackIndex: getPlaybackIndex,
    setPlaybackSpeed: setPlaybackSpeed,
    seek: seek,
    updateUi: updateUi,
    DEFAULT_FORECAST_LEADS: DEFAULT_FORECAST_LEADS,
    DEFAULT_MAX_KEYFRAMES: DEFAULT_MAX_KEYFRAMES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
