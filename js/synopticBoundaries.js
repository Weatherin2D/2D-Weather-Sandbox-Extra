/**
 * Dryline and sea-breeze placeables + CPU forcing.
 * Relies on app.js globals (gl, textures, guiControls, sim_res_*, helpers).
 */
(function (global) {
  'use strict';

  const MAX_DRYLINES = 8;
  const MAX_SEA_BREEZES = 8;

  const DRYLINE_DRY_SCALE = 0.0000012;
  const DRYLINE_MOIST_SCALE = 0.0000012;
  const DRYLINE_HEAT_SCALE = 0.00001;
  const DRYLINE_CONVERGE = 0.0025;

  const SEABREEZE_HEAT_SCALE = 0.000012;
  const SEABREEZE_WIND_SCALE = 0.0035;
  const SEABREEZE_CACHE_ITERS = 45;

  var drylines = [];
  var seaBreezes = [];
  var displayDrylines = true;
  var displaySeaBreezes = true;

  var seaBreezeCoastCache = {
    iter: -9999,
    nx: null,       // Float32Array sim_res_x — onshore +X direction (0 if no coast)
    surfaceY: null, // Int16Array sim_res_x
  };

  function isWaterWallType(t) {
    return t === 2 || t === 8;
  }

  function isLandishWallType(t) {
    return t === 1 || t === 3 || t === 4 || t === 5 || t === 6 || t === 7
      || (t >= 10 && t <= 17);
  }

  function smoothstep01(t) {
    const x = t < 0 ? 0 : t > 1 ? 1 : t;
    return x * x * (3 - 2 * x);
  }

  function wrappedDx(x, cx, wrapX, resX) {
    let dx = x - cx;
    if (!wrapX) return dx;
    const adx = Math.abs(dx);
    if (adx <= resX - adx) return dx;
    return dx > 0 ? dx - resX : dx + resX;
  }

  /** +1 sea breeze (onshore day), -1 land breeze (night). Magnitude 0..1. */
  function seaBreezeDayFactor() {
    const a = (guiControls && Number.isFinite(guiControls.sunAngle)) ? guiControls.sunAngle : 90;
    if (a <= 2 || a >= 178) return -0.85;
    const elev = a <= 90 ? a : (180 - a);
    return clamp(elev / 90, 0, 1);
  }

  function applyDrylinesCpu() {
    if (!guiControls || guiControls.enableDrylines === false || !drylines.length || typeof gl === 'undefined')
      return;

    const wrapX = !!guiControls.wrapHorizontally;
    const startAlt = guiControls.globalEffectsStartAlt / guiControls.simHeight;
    const endAlt = Math.min(0.55, guiControls.globalEffectsEndAlt / guiControls.simHeight);

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);

    for (let g = 0; g < drylines.length; g++) {
      const line = drylines[g];
      const cx = line.getXpos();
      const halfWidth = line.getWidth() * 0.5;
      const influence = line.getInfluence();
      const strength = line.getStrength();
      const moistOnRight = line.getMoistOnRight();
      const heatContrast = line.getHeatingContrast();
      if (strength <= 0.0001 || influence < 2)
        continue;

      const x0 = wrapX ? 0 : Math.max(0, Math.floor(cx - influence));
      const x1 = wrapX ? sim_res_x - 1 : Math.min(sim_res_x - 1, Math.ceil(cx + influence));
      const y0 = 0;
      const y1 = Math.min(sim_res_y - 1, Math.ceil(sim_res_y * endAlt) + 2);
      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      if (w <= 0 || h <= 0) continue;

      const baseData = new Float32Array(w * h * 4);
      const waterData = new Float32Array(w * h * 4);
      const wallData = new Int8Array(w * h * 4);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.FLOAT, baseData);
      gl.readBuffer(gl.COLOR_ATTACHMENT1);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.FLOAT, waterData);
      gl.readBuffer(gl.COLOR_ATTACHMENT2);
      gl.readPixels(x0, y0, w, h, gl.RGBA_INTEGER, gl.BYTE, wallData);

      let changed = false;
      for (let ly = 0; ly < h; ly++) {
        const y = y0 + ly;
        const texY = (y + 0.5) / sim_res_y;
        if (texY < startAlt || texY > endAlt) continue;

        for (let lx = 0; lx < w; lx++) {
          const x = x0 + lx;
          const idx = (ly * w + lx) * 4;
          if (wallData[idx + 1] === 0) continue;

          const dx = wrappedDx(x, cx, wrapX, sim_res_x);
          const adx = Math.abs(dx);
          if (adx >= influence) continue;

          const radial = 1.0 - adx / influence;
          // side: -1 dry … +1 moist
          let sideRaw = moistOnRight ? dx : -dx;
          const side = halfWidth > 0.5 ? clamp(sideRaw / halfWidth, -1, 1) : (sideRaw >= 0 ? 1 : -1);
          const moistFrac = (side + 1) * 0.5;
          const dryFrac = 1.0 - moistFrac;
          const wgt = strength * radial;

          if (heatContrast > 0) {
            // Classic dryline: dry side warmer
            baseData[idx + 3] += DRYLINE_HEAT_SCALE * heatContrast * wgt * (dryFrac - moistFrac);
            changed = true;
          }

          const realTemp = potentialToRealT(baseData[idx + 3], y);
          if (dryFrac > 0.05) {
            const dryAmt = DRYLINE_DRY_SCALE * wgt * dryFrac;
            const floorW = maxWater(Math.max(realTemp - 25.0, CtoK(-80)));
            const remove = Math.min(dryAmt, Math.max(0, waterData[idx] - floorW));
            if (remove > 0) {
              waterData[idx] -= remove;
              changed = true;
            }
          }
          if (moistFrac > 0.05) {
            const addAmt = DRYLINE_MOIST_SCALE * wgt * moistFrac;
            const headroom = Math.max(0, maxWater(realTemp) - waterData[idx]);
            const add = Math.min(addAmt, headroom);
            if (add > 0) {
              waterData[idx] += add;
              changed = true;
            }
          }

          // Low-level convergence toward the dryline
          if (adx > 0.5 && texY < 0.35) {
            const conv = DRYLINE_CONVERGE * wgt * (1.0 - texY / 0.35);
            baseData[idx] -= Math.sign(dx) * conv;
            changed = true;
          }
        }
      }

      if (!changed) continue;

      [baseTexture_0, baseTexture_1].forEach(tex => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA, gl.FLOAT, baseData);
      });
      [waterTexture_0, waterTexture_1].forEach(tex => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA, gl.FLOAT, waterData);
      });
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function refreshSeaBreezeCoastCache() {
    if (typeof gl === 'undefined' || typeof iterNum === 'undefined') return;
    if (seaBreezeCoastCache.nx && (iterNum - seaBreezeCoastCache.iter) < SEABREEZE_CACHE_ITERS)
      return;

    const wallAll = new Int8Array(sim_res_x * sim_res_y * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(0, 0, sim_res_x, sim_res_y, gl.RGBA_INTEGER, gl.BYTE, wallAll);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    if (!seaBreezeCoastCache.nx || seaBreezeCoastCache.nx.length !== sim_res_x) {
      seaBreezeCoastCache.nx = new Float32Array(sim_res_x);
      seaBreezeCoastCache.surfaceY = new Int16Array(sim_res_x);
    }

    const wrapX = !!(guiControls && guiControls.wrapHorizontally);
    for (let x = 0; x < sim_res_x; x++) {
      let sfc = -1;
      let sfcType = 0;
      for (let y = 0; y < sim_res_y; y++) {
        const idx = (y * sim_res_x + x) * 4;
        if (wallAll[idx + 1] !== 0) {
          sfc = y;
          // wall below fluid
          if (y > 0)
            sfcType = wallAll[((y - 1) * sim_res_x + x) * 4];
          break;
        }
      }
      seaBreezeCoastCache.surfaceY[x] = sfc;
      seaBreezeCoastCache.nx[x] = 0;
      if (sfc < 0) continue;

      const leftX = wrapX ? ((x - 1 + sim_res_x) % sim_res_x) : (x - 1);
      const rightX = wrapX ? ((x + 1) % sim_res_x) : (x + 1);
      let leftType = -1, rightType = -1;
      if (leftX >= 0 && leftX < sim_res_x) {
        const ly = seaBreezeCoastCache.surfaceY[leftX];
        // Will fill in second pass — for now peek wall under fluid at left
        for (let y = 0; y < sim_res_y; y++) {
          if (wallAll[(y * sim_res_x + leftX) * 4 + 1] !== 0) {
            leftType = y > 0 ? wallAll[((y - 1) * sim_res_x + leftX) * 4] : 0;
            break;
          }
        }
      }
      if (rightX >= 0 && rightX < sim_res_x) {
        for (let y = 0; y < sim_res_y; y++) {
          if (wallAll[(y * sim_res_x + rightX) * 4 + 1] !== 0) {
            rightType = y > 0 ? wallAll[((y - 1) * sim_res_x + rightX) * 4] : 0;
            break;
          }
        }
      }

      // Onshore nx: direction FROM water TOWARD land (+1 = need +VX over water west of land)
      if (isLandishWallType(sfcType)) {
        if (isWaterWallType(leftType) && !isWaterWallType(rightType))
          seaBreezeCoastCache.nx[x] = 1;  // water left → onshore +X
        else if (isWaterWallType(rightType) && !isWaterWallType(leftType))
          seaBreezeCoastCache.nx[x] = -1; // water right → onshore -X
        else if (isWaterWallType(leftType) && isWaterWallType(rightType))
          seaBreezeCoastCache.nx[x] = 0;
      }
    }

    seaBreezeCoastCache.iter = iterNum;
  }

  function applySeaBreezePatch(cx, cy, radius, strength, dayFactor) {
    if (strength <= 0.0001 || radius < 2) return;

    const wrapX = !!guiControls.wrapHorizontally;
    const x0 = wrapX ? 0 : Math.max(0, Math.floor(cx - radius));
    const x1 = wrapX ? sim_res_x - 1 : Math.min(sim_res_x - 1, Math.ceil(cx + radius));
    const y0 = 0;
    const y1 = Math.min(sim_res_y - 1, Math.ceil(sim_res_y * 0.55));
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;

    const baseData = new Float32Array(w * h * 4);
    const wallData = new Int8Array(w * h * 4);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.FLOAT, baseData);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(x0, y0, w, h, gl.RGBA_INTEGER, gl.BYTE, wallData);

    let changed = false;
    const lowFrac = 0.22;
    const returnFrac = 0.45;

    for (let lx = 0; lx < w; lx++) {
      const x = x0 + lx;
      const dx = wrappedDx(x, cx, wrapX, sim_res_x);
      const adx = Math.abs(dx);
      if (adx >= radius) continue;
      const radial = 1.0 - adx / radius;

      const nxCoast = seaBreezeCoastCache.nx ? seaBreezeCoastCache.nx[x] : 0;
      const sfcY = seaBreezeCoastCache.surfaceY ? seaBreezeCoastCache.surfaceY[x] : -1;
      if (!nxCoast || sfcY < 0) continue;

      // Onshore during day (dayFactor>0); offshore at night
      const onshore = nxCoast * (dayFactor >= 0 ? 1 : -1);
      const mag = Math.abs(dayFactor) * strength * radial;

      for (let ly = 0; ly < h; ly++) {
        const y = y0 + ly;
        const idx = (ly * w + lx) * 4;
        if (wallData[idx + 1] === 0) continue;
        if (y < sfcY) continue;

        const aglFrac = (y - sfcY) / Math.max(1, sim_res_y - sfcY);

        // Differential heating: warm land-side air by day, cool by night
        if (aglFrac < 0.12) {
          baseData[idx + 3] += SEABREEZE_HEAT_SCALE * dayFactor * mag;
          changed = true;
        }

        if (aglFrac < lowFrac) {
          const wgt = (1.0 - aglFrac / lowFrac) * mag * SEABREEZE_WIND_SCALE;
          baseData[idx] += onshore * wgt;
          // Weak lift near coast
          baseData[idx + 1] += Math.abs(dayFactor) * mag * 0.0012 * (1.0 - aglFrac / lowFrac);
          changed = true;
        } else if (aglFrac < returnFrac) {
          const t = (aglFrac - lowFrac) / (returnFrac - lowFrac);
          const wgt = smoothstep01(t) * mag * SEABREEZE_WIND_SCALE * 0.65;
          baseData[idx] -= onshore * wgt; // return flow
          changed = true;
        }
      }
    }

    if (!changed) return;

    [baseTexture_0, baseTexture_1].forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, w, h, gl.RGBA, gl.FLOAT, baseData);
    });
  }

  function applySeaBreezesCpu() {
    if (!guiControls || guiControls.enableSeaBreezes === false || typeof gl === 'undefined')
      return;

    const dayFactor = seaBreezeDayFactor();
    const needAuto = !!guiControls.enableAutoSeaBreeze;
    if (!seaBreezes.length && !needAuto)
      return;

    refreshSeaBreezeCoastCache();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);

    for (let g = 0; g < seaBreezes.length; g++) {
      const sb = seaBreezes[g];
      applySeaBreezePatch(sb.getXpos(), sb.getYpos(), sb.getRadius(), sb.getStrength(), dayFactor);
    }

    if (needAuto) {
      const autoStr = Number.isFinite(guiControls.autoSeaBreezeStrength)
        ? guiControls.autoSeaBreezeStrength : 0.6;
      // Domain-wide: one patch per coastline cluster (skip columns still inside prior radius)
      const step = 100;
      let lastX = -9999;
      for (let x = 0; x < sim_res_x; x++) {
        if (!seaBreezeCoastCache.nx || !seaBreezeCoastCache.nx[x]) continue;
        if (x - lastX < step * 0.75) continue;
        const sy = seaBreezeCoastCache.surfaceY[x];
        if (sy < 0) continue;
        applySeaBreezePatch(x, sy, step * 0.55, autoStr, dayFactor);
        lastX = x;
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // --- Dryline placeable ---
  class Dryline {
    #width = 48;
    #height = 64;
    #mainDiv;
    #canvas;
    #c;
    #x;
    #y;
    #lineWidth = 36;
    #influence = 220;
    #strength = 1.0;
    #moistOnRight = true;
    #heatingContrast = 1.0;
    #menuDiv;

    constructor(xIn, yIn) {
      this.#x = Math.floor(xIn);
      this.#y = Math.floor(yIn);
      this.#mainDiv = document.createElement('div');
      this.#canvas = document.createElement('canvas');
      this.#mainDiv.appendChild(this.#canvas);
      document.body.appendChild(this.#mainDiv);
      this.#canvas.height = this.#height;
      this.#canvas.width = this.#width;
      this.#mainDiv.style.position = 'absolute';
      this.#mainDiv.style.width = '0px';
      this.#mainDiv.style.height = '0px';
      this.#c = this.#canvas.getContext('2d');
      this.#canvas.style.position = 'absolute';
      this.#canvas.style.zIndex = 1;

      const thisObj = this;
      this.#canvas.addEventListener('mousedown', function (event) {
        if (event.button == 0) {
          if (guiControls.tool == 'TOOL_DRYLINE') {
            thisObj.destroy();
            event.stopPropagation();
          } else {
            thisObj.toggleMenu();
          }
        }
      });
      this.#canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
      this.createMenu();
    }

    createMenu() {
      this.#menuDiv = document.createElement('div');
      this.#menuDiv.style.cssText = `
        position: absolute; display: none; z-index: 1000; background: #13131f;
        border: 1px solid #252540; border-radius: 12px; padding: 12px; color: white;
        font-family: Arial, sans-serif; font-size: 13px; min-width: 230px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.75);`;
      document.body.appendChild(this.#menuDiv);

      const title = document.createElement('div');
      title.style.cssText = 'font-weight: bold; margin-bottom: 8px;';
      title.textContent = 'Dryline';
      this.#menuDiv.appendChild(title);

      const thisObj = this;
      const addSlider = (label, min, max, step, getter, setter, fmt) => {
        const row = document.createElement('div');
        row.style.marginBottom = '6px';
        const lab = document.createElement('div');
        lab.textContent = label + ': ' + (fmt ? fmt(getter()) : getter());
        const sl = document.createElement('input');
        sl.type = 'range';
        sl.min = String(min);
        sl.max = String(max);
        sl.step = String(step);
        sl.value = String(getter());
        sl.style.width = '100%';
        sl.oninput = () => {
          setter(parseFloat(sl.value));
          lab.textContent = label + ': ' + (fmt ? fmt(getter()) : getter());
          thisObj.updateCanvas();
        };
        row.appendChild(lab);
        row.appendChild(sl);
        this.#menuDiv.appendChild(row);
      };

      addSlider('Transition width', 8, 120, 1, () => this.#lineWidth, v => { this.#lineWidth = v; });
      addSlider('Influence', 40, 500, 1, () => this.#influence, v => { this.#influence = v; });
      addSlider('Strength', 0.1, 3.0, 0.05, () => this.#strength, v => { this.#strength = v; });
      addSlider('Heating contrast', 0, 2, 0.05, () => this.#heatingContrast, v => { this.#heatingContrast = v; });

      const flipBtn = document.createElement('button');
      flipBtn.textContent = this.#moistOnRight ? 'Moist → Right (East)' : 'Moist → Left (West)';
      flipBtn.style.cssText = 'margin-top: 6px; width: 100%; cursor: pointer;';
      flipBtn.onclick = () => {
        this.#moistOnRight = !this.#moistOnRight;
        flipBtn.textContent = this.#moistOnRight ? 'Moist → Right (East)' : 'Moist → Left (West)';
        thisObj.updateCanvas();
      };
      this.#menuDiv.appendChild(flipBtn);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Remove';
      delBtn.style.cssText = 'margin-top: 6px; width: 100%; cursor: pointer;';
      delBtn.onclick = () => thisObj.destroy();
      this.#menuDiv.appendChild(delBtn);
    }

    toggleMenu() {
      const show = this.#menuDiv.style.display === 'none';
      this.#menuDiv.style.display = show ? 'block' : 'none';
      if (show) {
        this.#menuDiv.style.left = (simToScreenX(this.#x) + 30) + 'px';
        this.#menuDiv.style.top = (simToScreenY(this.#y) - 20) + 'px';
      }
    }

    destroy() {
      this.#menuDiv.remove();
      this.#mainDiv.remove();
      const index = drylines.indexOf(this);
      if (index > -1) drylines.splice(index, 1);
    }

    setHidden(hidden) { this.#mainDiv.style.display = hidden ? 'none' : 'block'; }

    updateCanvas() {
      const screenX = simToScreenX(this.#x) - this.#width / 2;
      const screenY = simToScreenY(this.#y) - this.#height / 2;
      this.#mainDiv.style.left = screenX + 'px';
      this.#mainDiv.style.top = screenY + 'px';
      const c = this.#c;
      c.clearRect(0, 0, this.#width, this.#height);
      const cx = this.#width / 2;
      c.strokeStyle = '#e8a040';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(cx, 6);
      c.lineTo(cx, this.#height - 6);
      c.stroke();
      c.fillStyle = this.#moistOnRight ? '#c87820' : '#4080c0';
      c.beginPath();
      c.moveTo(cx - 14, 14);
      c.lineTo(cx - 4, 22);
      c.lineTo(cx - 14, 30);
      c.closePath();
      c.fill();
      c.fillStyle = this.#moistOnRight ? '#4080c0' : '#c87820';
      c.beginPath();
      c.moveTo(cx + 14, 14);
      c.lineTo(cx + 4, 22);
      c.lineTo(cx + 14, 30);
      c.closePath();
      c.fill();
      c.fillStyle = '#fff';
      c.font = 'bold 11px Arial';
      c.textAlign = 'center';
      c.fillText('DL', cx, this.#height - 10);
    }

    drawRadiusOverlay(ctx) {
      if (!ctx) return;
      const sx = simToScreenX(this.#x);
      const yTop = simToScreenY(sim_res_y - 1);
      const yBot = simToScreenY(0);
      const halfInf = Math.abs(simToScreenX(this.#x + this.#influence) - sx);
      ctx.fillStyle = 'rgba(232, 160, 64, 0.08)';
      ctx.fillRect(sx - halfInf, Math.min(yTop, yBot), halfInf * 2, Math.abs(yBot - yTop));
      ctx.strokeStyle = 'rgba(232, 160, 64, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, yTop);
      ctx.lineTo(sx, yBot);
      ctx.stroke();
    }

    getXpos() { return this.#x; }
    getYpos() { return this.#y; }
    getWidth() { return this.#lineWidth; }
    getInfluence() { return this.#influence; }
    getStrength() { return this.#strength; }
    getMoistOnRight() { return this.#moistOnRight; }
    getHeatingContrast() { return this.#heatingContrast; }

    getSettings() {
      return {
        lineWidth: this.#lineWidth,
        influence: this.#influence,
        strength: this.#strength,
        moistOnRight: this.#moistOnRight,
        heatingContrast: this.#heatingContrast,
      };
    }

    setSettings(s) {
      if (!s) return;
      if (s.lineWidth !== undefined) this.#lineWidth = s.lineWidth;
      if (s.influence !== undefined) this.#influence = s.influence;
      if (s.strength !== undefined) this.#strength = s.strength;
      if (s.moistOnRight !== undefined) this.#moistOnRight = !!s.moistOnRight;
      if (s.heatingContrast !== undefined) this.#heatingContrast = s.heatingContrast;
    }
  }

  // --- Sea breeze placeable ---
  class SeaBreeze {
    #width = 56;
    #height = 56;
    #mainDiv;
    #canvas;
    #c;
    #x;
    #y;
    #radius = 160;
    #strength = 1.0;
    #menuDiv;

    constructor(xIn, yIn) {
      this.#x = Math.floor(xIn);
      this.#y = Math.floor(yIn);
      this.#mainDiv = document.createElement('div');
      this.#canvas = document.createElement('canvas');
      this.#mainDiv.appendChild(this.#canvas);
      document.body.appendChild(this.#mainDiv);
      this.#canvas.height = this.#height;
      this.#canvas.width = this.#width;
      this.#mainDiv.style.position = 'absolute';
      this.#mainDiv.style.width = '0px';
      this.#mainDiv.style.height = '0px';
      this.#c = this.#canvas.getContext('2d');
      this.#canvas.style.position = 'absolute';
      this.#canvas.style.zIndex = 1;

      const thisObj = this;
      this.#canvas.addEventListener('mousedown', function (event) {
        if (event.button == 0) {
          if (guiControls.tool == 'TOOL_SEA_BREEZE') {
            thisObj.destroy();
            event.stopPropagation();
          } else {
            thisObj.toggleMenu();
          }
        }
      });
      this.#canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
      this.createMenu();
    }

    createMenu() {
      this.#menuDiv = document.createElement('div');
      this.#menuDiv.style.cssText = `
        position: absolute; display: none; z-index: 1000; background: #13131f;
        border: 1px solid #252540; border-radius: 12px; padding: 12px; color: white;
        font-family: Arial, sans-serif; font-size: 13px; min-width: 220px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.75);`;
      document.body.appendChild(this.#menuDiv);

      const title = document.createElement('div');
      title.style.cssText = 'font-weight: bold; margin-bottom: 8px;';
      title.textContent = 'Sea / Lake Breeze';
      this.#menuDiv.appendChild(title);

      const thisObj = this;
      const addSlider = (label, min, max, step, getter, setter) => {
        const row = document.createElement('div');
        row.style.marginBottom = '6px';
        const lab = document.createElement('div');
        lab.textContent = label + ': ' + getter();
        const sl = document.createElement('input');
        sl.type = 'range';
        sl.min = String(min);
        sl.max = String(max);
        sl.step = String(step);
        sl.value = String(getter());
        sl.style.width = '100%';
        sl.oninput = () => {
          setter(parseFloat(sl.value));
          lab.textContent = label + ': ' + getter();
          thisObj.updateCanvas();
        };
        row.appendChild(lab);
        row.appendChild(sl);
        this.#menuDiv.appendChild(row);
      };

      addSlider('Radius', 40, 400, 1, () => this.#radius, v => { this.#radius = v; });
      addSlider('Strength', 0.1, 3.0, 0.05, () => this.#strength, v => { this.#strength = v; });

      const hint = document.createElement('div');
      hint.style.cssText = 'margin-top: 8px; font-size: 11px; color: #888;';
      hint.textContent = 'Day: onshore (sea breeze). Night: offshore (land breeze). Place near a coast.';
      this.#menuDiv.appendChild(hint);

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Remove';
      delBtn.style.cssText = 'margin-top: 6px; width: 100%; cursor: pointer;';
      delBtn.onclick = () => thisObj.destroy();
      this.#menuDiv.appendChild(delBtn);
    }

    toggleMenu() {
      const show = this.#menuDiv.style.display === 'none';
      this.#menuDiv.style.display = show ? 'block' : 'none';
      if (show) {
        this.#menuDiv.style.left = (simToScreenX(this.#x) + 30) + 'px';
        this.#menuDiv.style.top = (simToScreenY(this.#y) - 20) + 'px';
      }
    }

    destroy() {
      this.#menuDiv.remove();
      this.#mainDiv.remove();
      const index = seaBreezes.indexOf(this);
      if (index > -1) seaBreezes.splice(index, 1);
    }

    setHidden(hidden) { this.#mainDiv.style.display = hidden ? 'none' : 'block'; }

    updateCanvas() {
      const screenX = simToScreenX(this.#x) - this.#width / 2;
      const screenY = simToScreenY(this.#y) - this.#height / 2;
      this.#mainDiv.style.left = screenX + 'px';
      this.#mainDiv.style.top = screenY + 'px';
      const c = this.#c;
      c.clearRect(0, 0, this.#width, this.#height);
      const cx = this.#width / 2;
      const cy = this.#height / 2;
      c.fillStyle = 'rgba(40, 140, 200, 0.9)';
      c.beginPath();
      c.arc(cx, cy, 18, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = '#fff';
      c.font = 'bold 12px Arial';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('SB', cx, cy + 1);
    }

    drawRadiusOverlay(ctx) {
      if (!ctx) return;
      const sx = simToScreenX(this.#x);
      const sy = simToScreenY(this.#y);
      const rScreen = Math.abs(simToScreenX(this.#x + this.#radius) - sx);
      ctx.beginPath();
      ctx.arc(sx, sy, rScreen, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(60, 180, 230, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    getXpos() { return this.#x; }
    getYpos() { return this.#y; }
    getRadius() { return this.#radius; }
    getStrength() { return this.#strength; }

    getSettings() {
      return { radius: this.#radius, strength: this.#strength };
    }

    setSettings(s) {
      if (!s) return;
      if (s.radius !== undefined) this.#radius = s.radius;
      if (s.strength !== undefined) this.#strength = s.strength;
    }
  }

  function placeDryline(x, y) {
    if (drylines.length >= MAX_DRYLINES) return null;
    const d = new Dryline(x, y);
    drylines.push(d);
    displayDrylines = true;
    if (guiControls) guiControls.displayDrylines = true;
    return d;
  }

  function placeSeaBreeze(x, y) {
    if (seaBreezes.length >= MAX_SEA_BREEZES) return null;
    const s = new SeaBreeze(x, y);
    seaBreezes.push(s);
    displaySeaBreezes = true;
    if (guiControls) guiControls.displaySeaBreezes = true;
    return s;
  }

  function destroyAllDrylines() {
    while (drylines.length) drylines[0].destroy();
  }

  function destroyAllSeaBreezes() {
    while (seaBreezes.length) seaBreezes[0].destroy();
  }

  function updateDrylineSeaBreezeMarkers() {
    for (let i = 0; i < drylines.length; i++) {
      drylines[i].updateCanvas();
      drylines[i].setHidden(!displayDrylines);
    }
    for (let i = 0; i < seaBreezes.length; i++) {
      seaBreezes[i].updateCanvas();
      seaBreezes[i].setHidden(!displaySeaBreezes);
    }
  }

  function drawDrylineSeaBreezeOverlays(ctx) {
    if (displayDrylines) {
      for (let i = 0; i < drylines.length; i++)
        drylines[i].drawRadiusOverlay(ctx);
    }
    if (displaySeaBreezes) {
      for (let i = 0; i < seaBreezes.length; i++)
        seaBreezes[i].drawRadiusOverlay(ctx);
    }
  }

  function buildSavedDrylinesForGuiControls() {
    if (!drylines.length) return null;
    return drylines.map(d => ({ x: d.getXpos(), y: d.getYpos(), ...d.getSettings() }));
  }

  function buildSavedSeaBreezesForGuiControls() {
    if (!seaBreezes.length) return null;
    return seaBreezes.map(s => ({ x: s.getXpos(), y: s.getYpos(), ...s.getSettings() }));
  }

  function restoreSavedDrylinesFromGuiControls() {
    const saved = guiControls && guiControls.__savedDrylines;
    if (!Array.isArray(saved) || !saved.length) return;
    destroyAllDrylines();
    for (let i = 0; i < saved.length; i++) {
      const e = saved[i];
      if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      const d = placeDryline(e.x, e.y);
      if (d) d.setSettings(e);
    }
    delete guiControls.__savedDrylines;
    finalizeLoadedDrylines();
  }

  function restoreSavedSeaBreezesFromGuiControls() {
    const saved = guiControls && guiControls.__savedSeaBreezes;
    if (!Array.isArray(saved) || !saved.length) return;
    destroyAllSeaBreezes();
    for (let i = 0; i < saved.length; i++) {
      const e = saved[i];
      if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      const s = placeSeaBreeze(e.x, e.y);
      if (s) s.setSettings(e);
    }
    delete guiControls.__savedSeaBreezes;
    finalizeLoadedSeaBreezes();
  }

  function finalizeLoadedDrylines() {
    if (guiControls && guiControls.displayDrylines !== undefined)
      displayDrylines = guiControls.displayDrylines;
    updateDrylineSeaBreezeMarkers();
  }

  function finalizeLoadedSeaBreezes() {
    if (guiControls && guiControls.displaySeaBreezes !== undefined)
      displaySeaBreezes = guiControls.displaySeaBreezes;
    updateDrylineSeaBreezeMarkers();
  }

  function setDisplayDrylines(v) {
    displayDrylines = !!v;
    for (let i = 0; i < drylines.length; i++)
      drylines[i].setHidden(!displayDrylines);
  }

  function setDisplaySeaBreezes(v) {
    displaySeaBreezes = !!v;
    for (let i = 0; i < seaBreezes.length; i++)
      seaBreezes[i].setHidden(!displaySeaBreezes);
  }

  var NS = global.WeatherSandbox || (global.WeatherSandbox = {});
  NS.synopticBoundaries = {
    Dryline,
    SeaBreeze,
    getDrylines: () => drylines,
    getSeaBreezes: () => seaBreezes,
    placeDryline,
    placeSeaBreeze,
    destroyAllDrylines,
    destroyAllSeaBreezes,
    applyDrylinesCpu,
    applySeaBreezesCpu,
    updateMarkers: updateDrylineSeaBreezeMarkers,
    drawOverlays: drawDrylineSeaBreezeOverlays,
    buildSavedDrylinesForGuiControls,
    buildSavedSeaBreezesForGuiControls,
    restoreSavedDrylinesFromGuiControls,
    restoreSavedSeaBreezesFromGuiControls,
    finalizeLoadedDrylines,
    finalizeLoadedSeaBreezes,
    setDisplayDrylines,
    setDisplaySeaBreezes,
    get displayDrylines() { return displayDrylines; },
    get displaySeaBreezes() { return displaySeaBreezes; },
    MAX_DRYLINES,
    MAX_SEA_BREEZES,
  };

  // Convenience globals matching app.js style
  global.applyDrylinesCpu = applyDrylinesCpu;
  global.applySeaBreezesCpu = applySeaBreezesCpu;
})(typeof window !== 'undefined' ? window : globalThis);
