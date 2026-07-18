/**
 * Shared utilities: math helpers, safe colors, safe JSON, downloads.
 */
(function (global) {
  'use strict';

  var HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  var MAX_IMPORT_JSON_CHARS = 2 * 1024 * 1024;
  var MAX_DATA_URL_CHARS = 512 * 1024;

  function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  function mod(a, b) {
    return ((a % b) + b) % b;
  }

  function map_range(value, low1, high1, low2, high2) {
    return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1);
  }

  function map_range_C(value, low1, high1, low2, high2) {
    return clamp(
      low2 + ((high2 - low2) * (value - low1)) / (high1 - low1),
      Math.min(low2, high2),
      Math.max(low2, high2)
    );
  }

  function sanitizeCssColor(value, fallback) {
    var fb = fallback || '#88aacc';
    if (typeof value !== 'string') return fb;
    var v = value.trim();
    if (HEX_COLOR_RE.test(v)) return v;
    return fb;
  }

  function safeJsonReviver(key, value) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype')
      return undefined;
    return value;
  }

  function safeJsonParse(text, fallback) {
    if (typeof text !== 'string') {
      if (text == null) return fallback;
      return text;
    }
    if (text.length > MAX_IMPORT_JSON_CHARS)
      throw new Error('Imported JSON exceeds size limit');
    try {
      return JSON.parse(text, safeJsonReviver);
    } catch (e) {
      if (arguments.length > 1) return fallback;
      throw e;
    }
  }

  function isOversizedDataUrl(s) {
    return typeof s === 'string' && s.indexOf('data:') === 0 && s.length > MAX_DATA_URL_CHARS;
  }

  function download(filename, data) {
    var url = URL.createObjectURL(data);
    var element = document.createElement('a');
    element.setAttribute('href', url);
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
    }, 1000);
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.utils = {
    clamp: clamp,
    mod: mod,
    map_range: map_range,
    map_range_C: map_range_C,
    sanitizeCssColor: sanitizeCssColor,
    safeJsonParse: safeJsonParse,
    safeJsonReviver: safeJsonReviver,
    isOversizedDataUrl: isOversizedDataUrl,
    download: download,
    MAX_IMPORT_JSON_CHARS: MAX_IMPORT_JSON_CHARS,
    MAX_DATA_URL_CHARS: MAX_DATA_URL_CHARS,
  };

  // Expose common helpers as globals for existing app.js call sites
  global.clamp = clamp;
  global.mod = mod;
  global.map_range = map_range;
  global.map_range_C = map_range_C;
  global.sanitizeCssColor = sanitizeCssColor;
  global.safeJsonParse = safeJsonParse;
  global.download = download;
})(typeof window !== 'undefined' ? window : globalThis);
