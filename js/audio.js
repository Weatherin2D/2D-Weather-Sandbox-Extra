/**
 * Audio fetch helpers with response checks and error handling.
 */
(function (global) {
  'use strict';

  async function fetchAudioArrayBuffer(url) {
    const resp = await fetch(url);
    if (!resp.ok)
      throw new Error('Audio fetch failed: ' + resp.status + ' ' + url);
    return resp.arrayBuffer();
  }

  async function decodeAudioUrl(audioCtx, url) {
    const arrayBuffer = await fetchAudioArrayBuffer(url);
    return audioCtx.decodeAudioData(arrayBuffer);
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.audio = {
    fetchAudioArrayBuffer: fetchAudioArrayBuffer,
    decodeAudioUrl: decodeAudioUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
