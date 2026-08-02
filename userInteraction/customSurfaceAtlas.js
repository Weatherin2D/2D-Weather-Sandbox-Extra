/**
 * Custom surface atlas: template download, PNG upload resize, GPU atlas rebuild (8 slots).
 */
(function(global) {
  'use strict';

  const MAX_SLOTS = 8;
  const STRIP_W = 1024;
  const STRIP_H = 512;
  const BUILTIN_ATLAS_URL = 'resources/img/surfaceTextureMap.png';

  let glTexture = null;
  let gl = null;
  let lastFingerprint = '';

  function registry() {
    return global.UserInteraction && global.UserInteraction.registry;
  }

  function setGL(glCtx, texture) {
    gl = glCtx || null;
    glTexture = texture || null;
  }

  function getGLTexture() {
    return glTexture;
  }

  function loadImage(url) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('Failed to load ' + url)); };
      img.src = url;
    });
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise(function(resolve, reject) {
      const img = new Image();
      img.onload = function() { resolve(img); };
      img.onerror = function() { reject(new Error('Invalid texture data')); };
      img.src = dataUrl;
    });
  }

  /** Download a template strip from the builtin urban facade atlas. */
  async function downloadTemplate() {
    const img = await loadImage(BUILTIN_ATLAS_URL);
    const stripH = Math.floor(img.height / 7);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = stripH;
    const ctx = canvas.getContext('2d');
    // Strip 0 = URBAN
    ctx.drawImage(img, 0, 0, img.width, stripH, 0, 0, img.width, stripH);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'custom-terrain-texture-template.png';
    a.click();
  }

  /** Resize/letterbox an uploaded image into a strip data URL. */
  async function processUploadFile(file) {
    if (!file) throw new Error('No file');
    const dataUrl = await new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function() { resolve(String(reader.result)); };
      reader.onerror = function() { reject(new Error('Read failed')); };
      reader.readAsDataURL(file);
    });
    const img = await loadImageFromDataUrl(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = STRIP_W;
    canvas.height = STRIP_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, STRIP_W, STRIP_H);
    const scale = Math.min(STRIP_W / img.width, STRIP_H / img.height);
    const w = Math.max(1, Math.floor(img.width * scale));
    const h = Math.max(1, Math.floor(img.height * scale));
    const x = Math.floor((STRIP_W - w) / 2);
    const y = Math.floor((STRIP_H - h) / 2);
    ctx.drawImage(img, x, y, w, h);
    // Prefer PNG to keep alpha for facades; compress if huge
    let out = canvas.toDataURL('image/png');
    if (out.length > 900000) {
      out = canvas.toDataURL('image/jpeg', 0.85);
    }
    return out;
  }

  function toolsWithTextures() {
    const reg = registry();
    if (!reg) return [];
    return reg.getAllTools().filter(function(t) {
      return !t.builtin && t.textureDataUrl && Number.isFinite(+t.atlasSlot) && +t.atlasSlot >= 0;
    }).sort(function(a, b) { return (+a.atlasSlot) - (+b.atlasSlot); });
  }

  function fingerprint(tools) {
    return tools.map(function(t) {
      return t.id + ':' + t.atlasSlot + ':' + (t.textureDataUrl || '').length;
    }).join('|');
  }

  async function rebuildAtlas() {
    if (!gl || !glTexture) return false;
    const tools = toolsWithTextures();
    const fp = fingerprint(tools);
    if (fp === lastFingerprint && tools.length > 0) return true;

    const canvas = document.createElement('canvas');
    canvas.width = STRIP_W;
    canvas.height = STRIP_H * MAX_SLOTS;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < tools.length; i++) {
      const t = tools[i];
      const slot = Math.max(0, Math.min(MAX_SLOTS - 1, +t.atlasSlot));
      try {
        const img = await loadImageFromDataUrl(t.textureDataUrl);
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, slot * STRIP_H, STRIP_W, STRIP_H);
      } catch (e) { /* skip bad image */ }
    }

    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    lastFingerprint = fp;
    return true;
  }

  function scheduleRebuild() {
    rebuildAtlas().catch(function() { /* ignore */ });
  }

  const api = {
    MAX_SLOTS: MAX_SLOTS,
    STRIP_W: STRIP_W,
    STRIP_H: STRIP_H,
    setGL: setGL,
    getGLTexture: getGLTexture,
    downloadTemplate: downloadTemplate,
    processUploadFile: processUploadFile,
    rebuildAtlas: rebuildAtlas,
    scheduleRebuild: scheduleRebuild,
  };

  global.UserInteraction = global.UserInteraction || {};
  global.UserInteraction.atlas = api;
})(typeof window !== 'undefined' ? window : global);
