/**
 * Public play URL — GitHub Pages (primary).
 * Used by Live Server / file:// to open the hosted version in a browser.
 * On Node servers, RENDER_EXTERNAL_URL may still be injected in index.html.
 */
(function(global) {
  'use strict';
  if (global.__WEATHER_PUBLIC_PLAY_URL == null)
    global.__WEATHER_PUBLIC_PLAY_URL = 'https://weatherin2d.github.io/2D-Weather-Sandbox-Extra/';
})(typeof window !== 'undefined' ? window : global);
