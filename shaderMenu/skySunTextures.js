/**
 * Custom sky gradient + sun disc texture upload/management for the Shader Menu.
 * Stores GL textures plus their source data URLs so packs can persist them.
 */
(function(global) {
  'use strict';

  const SKY_W = 256;
  const SKY_H = 512;
  const SUN_W = 256;
  const SUN_H = 256;

  let gl = null;
  let skyTexture = null;
  let sunTexture = null;
  let skyDataUrl = null;
  let sunDataUrl = null;

  function setGL(glCtx, skyTex, sunTex) {
    gl = glCtx || null;
    skyTexture = skyTex || null;
    sunTexture = sunTex || null;
  }

  function getSkyTexture() { return skyTexture; }
  function getSunTexture() { return sunTexture; }
  function hasSky() { return !!skyDataUrl; }
  function hasSun() { return !!sunDataUrl; }
  function getSkyDataUrl() { return skyDataUrl; }
  function getSunDataUrl() { return sunDataUrl; }

  function makePlaceholderCanvas(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    return canvas;
  }

  function uploadTexture(texture, source) {
    if (!gl || !texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  function ensurePlaceholder(texture, w, h) {
    if (!gl || !texture) return;
    uploadTexture(texture, makePlaceholderCanvas(w, h));
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('Invalid image data')); };
      img.src = dataUrl;
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function() { resolve(String(reader.result)); };
      reader.onerror = function() { reject(new Error('Failed to read file')); };
      reader.readAsDataURL(file);
    });
  }

  function drawResizedCover(img, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const scale = Math.max(w / img.width, h / img.height);
    const dw = Math.max(1, Math.round(img.width * scale));
    const dh = Math.max(1, Math.round(img.height * scale));
    const dx = Math.floor((w - dw) / 2);
    const dy = Math.floor((h - dh) / 2);
    ctx.drawImage(img, dx, dy, dw, dh);
    return canvas;
  }

  async function processSkyUpload(file) {
    if (!file) throw new Error('No file provided');
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImageFromDataUrl(dataUrl);
    const canvas = drawResizedCover(img, SKY_W, SKY_H);
    let outUrl = canvas.toDataURL('image/png');
    if (outUrl.length > 900000) outUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (gl && skyTexture) uploadTexture(skyTexture, canvas);
    skyDataUrl = outUrl;
    return outUrl;
  }

  async function processSunUpload(file) {
    if (!file) throw new Error('No file provided');
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImageFromDataUrl(dataUrl);
    const canvas = drawResizedCover(img, SUN_W, SUN_H);
    let outUrl = canvas.toDataURL('image/png');
    if (outUrl.length > 900000) outUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (gl && sunTexture) uploadTexture(sunTexture, canvas);
    sunDataUrl = outUrl;
    return outUrl;
  }

  function clearSky() {
    skyDataUrl = null;
    if (gl && skyTexture) ensurePlaceholder(skyTexture, 1, 1);
  }

  function clearSun() {
    sunDataUrl = null;
    if (gl && sunTexture) ensurePlaceholder(sunTexture, 1, 1);
  }

  async function loadSkyFromDataUrl(dataUrl) {
    if (!dataUrl) { clearSky(); return; }
    const img = await loadImageFromDataUrl(dataUrl);
    const canvas = drawResizedCover(img, SKY_W, SKY_H);
    if (gl && skyTexture) uploadTexture(skyTexture, canvas);
    skyDataUrl = dataUrl;
  }

  async function loadSunFromDataUrl(dataUrl) {
    if (!dataUrl) { clearSun(); return; }
    const img = await loadImageFromDataUrl(dataUrl);
    const canvas = drawResizedCover(img, SUN_W, SUN_H);
    if (gl && sunTexture) uploadTexture(sunTexture, canvas);
    sunDataUrl = dataUrl;
  }

  function triggerDownload(dataUrl, filename) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  function downloadSkyTemplate() {
    const canvas = document.createElement('canvas');
    canvas.width = SKY_W;
    canvas.height = SKY_H;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, SKY_H);
    gradient.addColorStop(0, '#1a3d7c');
    gradient.addColorStop(0.5, '#3f7fd6');
    gradient.addColorStop(1, '#bfe0f7');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SKY_W, SKY_H);
    triggerDownload(canvas.toDataURL('image/png'), 'sky-texture-template.png');
  }

  function downloadSunTemplate() {
    const canvas = document.createElement('canvas');
    canvas.width = SUN_W;
    canvas.height = SUN_H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, SUN_W, SUN_H);
    const cx = SUN_W / 2;
    const cy = SUN_H / 2;
    const r = Math.min(SUN_W, SUN_H) * 0.42;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, 'rgba(255, 250, 210, 1.0)');
    gradient.addColorStop(0.6, 'rgba(255, 236, 150, 0.85)');
    gradient.addColorStop(1, 'rgba(255, 230, 120, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    triggerDownload(canvas.toDataURL('image/png'), 'sun-texture-template.png');
  }

  function bindForDraw(glCtx, unitSky, unitSun) {
    const useGl = glCtx || gl;
    const useSky = hasSky() && skyTexture ? 1 : 0;
    const useSun = hasSun() && sunTexture ? 1 : 0;
    if (useGl) {
      if (skyTexture) {
        useGl.activeTexture(useGl.TEXTURE0 + unitSky);
        useGl.bindTexture(useGl.TEXTURE_2D, skyTexture);
      }
      if (sunTexture) {
        useGl.activeTexture(useGl.TEXTURE0 + unitSun);
        useGl.bindTexture(useGl.TEXTURE_2D, sunTexture);
      }
    }
    return { useSky: useSky, useSun: useSun };
  }

  const api = {
    SKY_W: SKY_W,
    SKY_H: SKY_H,
    SUN_W: SUN_W,
    SUN_H: SUN_H,
    setGL: setGL,
    getSkyTexture: getSkyTexture,
    getSunTexture: getSunTexture,
    hasSky: hasSky,
    hasSun: hasSun,
    getSkyDataUrl: getSkyDataUrl,
    getSunDataUrl: getSunDataUrl,
    processSkyUpload: processSkyUpload,
    processSunUpload: processSunUpload,
    clearSky: clearSky,
    clearSun: clearSun,
    loadSkyFromDataUrl: loadSkyFromDataUrl,
    loadSunFromDataUrl: loadSunFromDataUrl,
    downloadSkyTemplate: downloadSkyTemplate,
    downloadSunTemplate: downloadSunTemplate,
    bindForDraw: bindForDraw,
  };

  global.ShaderMenu = global.ShaderMenu || {};
  global.ShaderMenu.textures = api;
})(typeof window !== 'undefined' ? window : this);
