/**
 * Meteociel sounding scrape helpers with CORS proxy host allowlist.
 */
(function (global) {
  'use strict';

  var DEFAULT_CORS_PROXY = 'https://my-cors-proxy.nielsdaemen747.workers.dev/?url=';
  var ALLOWED_HOSTS = new Set([
    'meteociel.fr',
    'www.meteociel.fr',
  ]);

  function getCorsProxyBase() {
    if (typeof global.__WEATHER_CORS_PROXY === 'string' && global.__WEATHER_CORS_PROXY)
      return global.__WEATHER_CORS_PROXY;
    return DEFAULT_CORS_PROXY;
  }

  function assertAllowedSoundingUrl(url) {
    var parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      throw new Error('Invalid sounding URL');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      throw new Error('Unsupported sounding URL protocol');
    var host = String(parsed.hostname || '').toLowerCase();
    if (!ALLOWED_HOSTS.has(host))
      throw new Error('Sounding host not allowed: ' + host);
    return parsed.href;
  }

  async function proxiedFetch(url) {
    var safeUrl = assertAllowedSoundingUrl(url);
    var response = await fetch(getCorsProxyBase() + encodeURIComponent(safeUrl));
    if (!response.ok)
      throw new Error('Sounding fetch failed: ' + response.status);
    return response;
  }

  async function getSoundingGraphImgUrl(url) {
    try {
      var response = await proxiedFetch(url);
      var html = await response.text();
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      var img = doc.querySelectorAll('img')[0];
      if (!img) return null;
      var src = img.getAttribute('src') || '';
      if (src.indexOf('http') === 0) return src;
      return 'https://www.meteociel.fr/' + src.replace(/^\//, '');
    } catch (error) {
      console.error('Error fetching the data:', error);
      return null;
    }
  }

  async function scrapeTableData(url) {
    try {
      var response = await proxiedFetch(url);
      var html = await response.text();
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');
      var rows = doc.querySelectorAll('table:nth-of-type(2) tr:not(:first-child)');
      var tableData = [];

      rows.forEach(function (row) {
        var cells = row.querySelectorAll('td');
        if (cells.length < 7) return;
        var windParts = (cells[6].textContent || '').split(' / ');
        var rowData = {
          alt: parseFloat(cells[0].textContent),
          p: parseFloat(cells[1].textContent),
          t: parseFloat(cells[2].textContent),
          tw: parseFloat(cells[3].textContent),
          td: parseFloat(cells[4].textContent),
          rh: parseFloat(cells[5].textContent),
          vel: parseFloat(windParts[1]),
          angle: parseFloat(windParts[0]),
        };
        var hasNaN = Object.values(rowData).some(function (v) { return Number.isNaN(v); });
        if (!hasNaN)
          tableData.push(rowData);
      });
      return tableData;
    } catch (error) {
      console.error('Error fetching the data:', error);
      return undefined;
    }
  }

  async function loadSounding(stationID, timeStamp) {
    var imgMapType = 1;
    var graphPageUrl = 'https://www.meteociel.fr/cartes_obs/sondage_display.php?id=' + stationID +
      '&map=' + imgMapType + '&date=' + timeStamp;
    var tablePageUrl = 'https://www.meteociel.fr/cartes_obs/sondage_display.php?id=' + stationID +
      '&map=4&date=' + timeStamp;

    var SoundingGraphImgUrl = await getSoundingGraphImgUrl(graphPageUrl);
    var soundingImgEl = document.getElementById('soundingPreview');
    if (soundingImgEl && SoundingGraphImgUrl)
      soundingImgEl.src = SoundingGraphImgUrl;

    return scrapeTableData(tablePageUrl);
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.sounding = {
    getCorsProxyBase: getCorsProxyBase,
    assertAllowedSoundingUrl: assertAllowedSoundingUrl,
    getSoundingGraphImgUrl: getSoundingGraphImgUrl,
    scrapeTableData: scrapeTableData,
    loadSounding: loadSounding,
  };

  global.getSoundingGraphImgUrl = getSoundingGraphImgUrl;
  global.scrapeTableData = scrapeTableData;
  global.loadSounding = loadSounding;
})(typeof window !== 'undefined' ? window : globalThis);
