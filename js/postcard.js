/**
 * Photoreal postcard export — PNG stills and short motion clips.
 * Presentation only; does not touch fluid / weather dynamics.
 */
(function (global) {
  'use strict';

  var pendingPng = null;
  var motionState = null;
  var HIDDEN_CLASS = 'ws-postcard-hide-chrome';

  function downloadBlob(filename, blob) {
    if (global.WeatherSandbox && global.WeatherSandbox.utils && global.WeatherSandbox.utils.download) {
      global.WeatherSandbox.utils.download(filename, blob);
      return;
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
    }, 1000);
  }

  function stampFilename(prefix, ext) {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return prefix + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
      + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.' + ext;
  }

  function setChromeHidden(hidden) {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle(HIDDEN_CLASS, !!hidden);
    try {
      var guis = document.querySelectorAll('.dg.ac, .dg.main');
      for (var i = 0; i < guis.length; i++)
        guis[i].style.visibility = hidden ? 'hidden' : '';
    } catch (e) { /* ignore */ }
  }

  function drawWatermark(ctx, w, h, opts) {
    opts = opts || {};
    var label = opts.label || '2D Weather Sandbox';
    var timeLine = opts.timeLine || '';
    ctx.save();
    ctx.font = '600 14px "Segoe UI", Tahoma, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(12, h - 44, Math.min(w - 24, 360), 32);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(label, 20, h - 26);
    if (timeLine) {
      ctx.font = '12px "Segoe UI", Tahoma, sans-serif';
      ctx.fillStyle = 'rgba(220,230,240,0.85)';
      ctx.fillText(timeLine, 20, h - 10);
    }
    ctx.restore();
  }

  function composePostcardCanvas(sourceCanvas, opts) {
    var out = document.createElement('canvas');
    out.width = sourceCanvas.width;
    out.height = sourceCanvas.height;
    var ctx = out.getContext('2d');
    ctx.drawImage(sourceCanvas, 0, 0);
    if (opts && opts.watermark !== false)
      drawWatermark(ctx, out.width, out.height, opts);
    return out;
  }

  function requestPng(opts) {
    opts = opts || {};
    pendingPng = {
      watermark: opts.watermark !== false,
      label: opts.label,
      timeLine: opts.timeLine || '',
      hideChrome: opts.hideChrome !== false,
      framesWait: opts.hideChrome !== false ? 2 : 0,
    };
    if (pendingPng.hideChrome)
      setChromeHidden(true);
  }

  function requestMotion(opts) {
    opts = opts || {};
    if (typeof MediaRecorder === 'undefined') {
      alert('Motion postcard needs MediaRecorder support in this browser. Use PNG export instead.');
      return;
    }
    if (motionState) return;
    motionState = {
      durationMs: Math.max(1000, Number(opts.durationMs) || 3000),
      watermark: opts.watermark !== false,
      label: opts.label,
      timeLine: opts.timeLine || '',
      hideChrome: opts.hideChrome !== false,
      started: false,
      chunks: [],
      recorder: null,
      stream: null,
      startAt: 0,
      framesWait: opts.hideChrome !== false ? 2 : 0,
    };
    if (motionState.hideChrome)
      setChromeHidden(true);
  }

  function finishPng(sourceCanvas, pending) {
    try {
      var composed = composePostcardCanvas(sourceCanvas, pending);
      composed.toBlob(function (blob) {
        if (blob)
          downloadBlob(stampFilename('weather-postcard', 'png'), blob);
      }, 'image/png');
    } catch (err) {
      console.error('Postcard PNG failed:', err);
      alert('Postcard export failed');
    }
    setChromeHidden(false);
    pendingPng = null;
  }

  function startMotionRecorder(sourceCanvas, state) {
    try {
      state.stream = sourceCanvas.captureStream(30);
      var mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : (MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '');
      state.recorder = mime
        ? new MediaRecorder(state.stream, { mimeType: mime, videoBitsPerSecond: 8e6 })
        : new MediaRecorder(state.stream);
      state.chunks = [];
      state.recorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size)
          state.chunks.push(ev.data);
      };
      state.recorder.onstop = function () {
        var blob = new Blob(state.chunks, { type: state.recorder.mimeType || 'video/webm' });
        downloadBlob(stampFilename('weather-postcard', 'webm'), blob);
        if (state.stream) {
          state.stream.getTracks().forEach(function (t) { t.stop(); });
        }
        setChromeHidden(false);
        motionState = null;
      };
      state.recorder.start(200);
      state.started = true;
      state.startAt = performance.now();
    } catch (err) {
      console.error('Motion postcard failed:', err);
      alert('Motion postcard failed');
      setChromeHidden(false);
      motionState = null;
    }
  }

  /**
   * Call once per frame after the main canvas has been fully drawn.
   * @param {HTMLCanvasElement} canvas
   * @param {{timeLine?: string}} [frameOpts]
   */
  function onFrameEnd(canvas, frameOpts) {
    if (!canvas) return;
    frameOpts = frameOpts || {};

    if (pendingPng) {
      if (pendingPng.framesWait > 0) {
        pendingPng.framesWait--;
        return;
      }
      if (!pendingPng.timeLine && frameOpts.timeLine)
        pendingPng.timeLine = frameOpts.timeLine;
      finishPng(canvas, pendingPng);
      return;
    }

    if (motionState) {
      if (motionState.framesWait > 0) {
        motionState.framesWait--;
        return;
      }
      if (!motionState.started) {
        if (!motionState.timeLine && frameOpts.timeLine)
          motionState.timeLine = frameOpts.timeLine;
        startMotionRecorder(canvas, motionState);
        return;
      }
      if (performance.now() - motionState.startAt >= motionState.durationMs) {
        try {
          if (motionState.recorder && motionState.recorder.state !== 'inactive')
            motionState.recorder.stop();
        } catch (e) {
          setChromeHidden(false);
          motionState = null;
        }
      }
    }
  }

  function isBusy() {
    return !!(pendingPng || motionState);
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.postcard = {
    requestPng: requestPng,
    requestMotion: requestMotion,
    onFrameEnd: onFrameEnd,
    isBusy: isBusy,
    HIDDEN_CLASS: HIDDEN_CLASS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
