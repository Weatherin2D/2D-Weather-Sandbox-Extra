/**
 * Gated debug logging. Enabled via ?debug=1, setWeatherDebugEnabled(true),
 * or when the in-game F3 debug overlay (guiControls.showDebugOverlay) is on.
 */
(function (global) {
  'use strict';

  function isDebugEnabled() {
    if (global.__WEATHER_DEBUG__ === true) return true;
    try {
      if (global.guiControls && global.guiControls.showDebugOverlay) return true;
    } catch (e) { /* ignore */ }
    try {
      if (typeof location !== 'undefined' && location.search) {
        const params = new URLSearchParams(location.search);
        if (params.get('debug') === '1') return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  function debugLog() {
    if (!isDebugEnabled()) return;
    if (typeof console !== 'undefined' && console.log)
      console.log.apply(console, arguments);
  }

  function setDebugEnabled(on) {
    global.__WEATHER_DEBUG__ = !!on;
  }

  global.debugLog = debugLog;
  global.setWeatherDebugEnabled = setDebugEnabled;
  global.isWeatherDebugEnabled = isDebugEnabled;
})(typeof window !== 'undefined' ? window : globalThis);
