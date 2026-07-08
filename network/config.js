/**
 * Multiplayer public URL — online play link (Render).
 * Used by Live Server / file:// to open the hosted multiplayer version.
 * On Render itself, RENDER_EXTERNAL_URL is injected automatically in index.html.
 */
(function(global) {
  'use strict';
  if (global.__WEATHER_PUBLIC_PLAY_URL == null)
    global.__WEATHER_PUBLIC_PLAY_URL = 'https://weather-sandbox.onrender.com';
})(typeof window !== 'undefined' ? window : global);
