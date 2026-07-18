/**
 * Save/load helpers wrapping safe JSON parse and downloads.
 */
(function (global) {
  'use strict';

  function parseSaveJson(text) {
    var parse = global.safeJsonParse || JSON.parse;
    return parse(text);
  }

  function downloadBlob(filename, blob) {
    if (typeof global.download === 'function') {
      global.download(filename, blob);
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

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.saveLoad = {
    parseSaveJson: parseSaveJson,
    downloadBlob: downloadBlob,
  };
})(typeof window !== 'undefined' ? window : globalThis);
