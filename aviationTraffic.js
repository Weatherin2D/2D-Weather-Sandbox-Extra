/**
 * Airport + NPC air traffic system.
 * Place airports, link flight routes, spawn lightweight AI planes that react to weather.
 */
(function(global) {
  'use strict';

  const MAX_TRAFFIC_PLANES_HARD = 40;
  const AIRPORT_HIT_RADIUS = 28;
  const RUNWAY_HALF_CELLS = 36;     // half-length of runway along X
  const TERMINAL_WIDTH = 10;        // urban terminal footprint width
  const TOWER_WIDTH = 3;            // ATC tower urban footprint
  const WALLTYPE_LAND = 1;
  const WALLTYPE_URBAN = 4;
  const WALLTYPE_RUNWAY = 5;
  const WALLTYPE_INDUSTRIAL = 6;
  const CH_TYPE = 0;
  const CH_DISTANCE = 1;
  const CRUISE_SPEED_MPS = 220;
  const TAKEOFF_SPEED_MPS = 70;
  const TAKEOFF_CLEARANCE_CELLS = 4; // spawn / path endpoints above airport surface cell
  const WAYPOINT_HIT_RADIUS = 14;
  const STRESS_DISTRESS = 0.7;
  const STRESS_CRASH = 1.15;
  const SPAWN_GRACE_SEC = 5.0;
  // Planes are not balloons: only a fraction of wind drifts them off the path
  const WIND_PATH_INFLUENCE = 0.22;
  const WIND_STRESS_MIN_MS = 45; // ignore light breeze for stress
  const MAX_STRESS_ADD_PER_STEP = 0.05;

  let airports = [];
  let flightRoutes = [];
  let trafficPlanes = [];
  let nextAirportId = 1;
  let nextRouteId = 1;
  let nextPlaneId = 1;
  let routePickFromId = null;
  let draftWaypoints = []; // pending waypoints while drawing a new route
  let selectedRouteId = null;
  let dragState = null; // { routeId, index } while dragging a waypoint
  let routeOverlayCanvas = null;
  let routeOverlayCtx = null;
  let displayAirports = true;
  let displayFlightRoutes = true;
  let lastInfraSig = '';
  let pointerHooksInstalled = false;

  function uidAirport() { return 'ap_' + (nextAirportId++); }
  function uidRoute() { return 'rt_' + (nextRouteId++); }
  function uidPlane() { return 'tp_' + (nextPlaneId++); }

  function wrapSimX(x) {
    if (typeof mod === 'function' && typeof sim_res_x === 'number')
      return mod(x, sim_res_x);
    if (typeof sim_res_x === 'number' && sim_res_x > 0) {
      x = x % sim_res_x;
      if (x < 0) x += sim_res_x;
      return x;
    }
    return x;
  }

  function shortestDeltaX(fromX, toX) {
    let dx = toX - fromX;
    if (typeof sim_res_x === 'number' && sim_res_x > 0) {
      if (dx > sim_res_x * 0.5) dx -= sim_res_x;
      if (dx < -sim_res_x * 0.5) dx += sim_res_x;
    }
    return dx;
  }

  function findAirportById(id) {
    for (let i = 0; i < airports.length; i++) {
      if (airports[i].id === id) return airports[i];
    }
    return null;
  }

  function findNearestAirport(simX, simY, maxDist) {
    let best = null;
    let bestD = maxDist != null ? maxDist : AIRPORT_HIT_RADIUS;
    for (let i = 0; i < airports.length; i++) {
      const a = airports[i];
      const dx = a.getXpos() - simX;
      const dy = (simY != null ? a.getYpos() - simY : 0);
      // Prefer horizontal proximity (side-view: click near column)
      const d = Math.sqrt(dx * dx + dy * dy * 0.15);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  function airportAirY(airport) {
    return airport.getYpos() + TAKEOFF_CLEARANCE_CELLS;
  }

  function altToSimY(altM, surfaceY) {
    const ch = typeof cellHeight === 'number' ? cellHeight : 50;
    return surfaceY + altM / ch; // sim Y increases upward
  }

  function simYToAlt(simY, surfaceY) {
    const ch = typeof cellHeight === 'number' ? cellHeight : 50;
    return (simY - surfaceY) * ch;
  }

  function routesFromAirport(airportId) {
    return flightRoutes.filter(r => r.fromId === airportId && r.active);
  }

  function ensureRouteOverlay() {
    if (routeOverlayCanvas) return;
    routeOverlayCanvas = document.createElement('canvas');
    routeOverlayCanvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:0;';
    routeOverlayCtx = routeOverlayCanvas.getContext('2d');
    document.body.appendChild(routeOverlayCanvas);
  }

  function canSampleGl() {
    return typeof gl !== 'undefined' && gl && typeof frameBuff_1 !== 'undefined' && frameBuff_1
      && typeof sim_res_x === 'number' && sim_res_x > 0;
  }

  // ─── Crash / fire burst (Nuke-style local write, host only) ───────────────

  function applyCrashBurst(simX, simY) {
    if (!canSampleGl()) return;
    if (typeof multiplayerPeerMode !== 'undefined' && multiplayerPeerMode
        && !(typeof multiplayerHostMode !== 'undefined' && multiplayerHostMode))
      return;

    const centerX = Math.floor(wrapSimX(simX));
    const centerY = Math.floor(clamp(simY, 0, sim_res_y - 1));
    const blastRadius = 8;
    const blastTemp = typeof CtoK === 'function' ? CtoK(400) : 673;

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    const w = blastRadius * 2 + 1;
    const h = blastRadius * 2 + 1;
    const x0 = Math.max(0, centerX - blastRadius);
    const y0 = Math.max(0, centerY - blastRadius);
    const x1 = Math.min(sim_res_x - 1, centerX + blastRadius);
    const y1 = Math.min(sim_res_y - 1, centerY + blastRadius);
    const rw = x1 - x0 + 1;
    const rh = y1 - y0 + 1;
    if (rw <= 0 || rh <= 0) return;

    const baseData = new Float32Array(rw * rh * 4);
    const waterData = new Float32Array(rw * rh * 4);
    const wallData = new Int8Array(rw * rh * 4);

    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(x0, y0, rw, rh, gl.RGBA, gl.FLOAT, baseData);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(x0, y0, rw, rh, gl.RGBA, gl.FLOAT, waterData);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(x0, y0, rw, rh, gl.RGBA_INTEGER, gl.BYTE, wallData);

    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const gx = x0 + dx;
        const gy = y0 + dy;
        const dist = Math.sqrt((gx - centerX) * (gx - centerX) + (gy - centerY) * (gy - centerY));
        if (dist > blastRadius) continue;
        const intensity = 1.0 - dist / blastRadius;
        const index = (dy * rw + dx) * 4;
        baseData[index + 3] = Math.max(baseData[index + 3], blastTemp * intensity);
        waterData[index + 3] = Math.min(waterData[index + 3] + 1.2 * intensity, 2.0);
        if (wallData[index + 0] === 1)
          wallData[index + 0] = 3; // FIRE
      }
    }

    const texPairs = [
      [window.baseTexture_0, window.baseTexture_1, baseData, gl.RGBA, gl.FLOAT],
      [window.waterTexture_0, window.waterTexture_1, waterData, gl.RGBA, gl.FLOAT],
      [window.wallTexture_0, window.wallTexture_1, wallData, gl.RGBA_INTEGER, gl.BYTE],
    ];
    for (let t = 0; t < texPairs.length; t++) {
      const [a, b, data, fmt, typ] = texPairs[t];
      [a, b].forEach(tex => {
        if (!tex) return;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, rw, rh, fmt, typ, data);
      });
    }
  }

  function writeWallTextures(x0, y0, rw, rh, wallData) {
    [window.wallTexture_0, window.wallTexture_1].forEach(tex => {
      if (!tex) return;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, rw, rh, gl.RGBA_INTEGER, gl.BYTE, wallData);
    });
  }

  /**
   * Paint real simulation terrain for an airport:
   * - RUNWAY tiles along a long surface strip
   * - URBAN tiles for terminal / ATC tower footprints
   * - INDUSTRIAL for a small hangar block
   */
  function paintAirportInfrastructure(simX, simY) {
    if (!canSampleGl()) return;
    const cx = Math.floor(wrapSimX(simX));
    const hintY = Math.floor(clamp(simY, 0, sim_res_y - 1));

    const xLeft = Math.max(0, cx - RUNWAY_HALF_CELLS - TERMINAL_WIDTH - 6);
    const xRight = Math.min(sim_res_x - 1, cx + RUNWAY_HALF_CELLS + 4);
    const rw = xRight - xLeft + 1;
    if (rw <= 0) return;

    const wallData = new Int8Array(rw * sim_res_y * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
    gl.readBuffer(gl.COLOR_ATTACHMENT2);
    gl.readPixels(xLeft, 0, rw, sim_res_y, gl.RGBA_INTEGER, gl.BYTE, wallData);

    function canConvertType(t) {
      return t === WALLTYPE_LAND || t === WALLTYPE_URBAN || t === WALLTYPE_RUNWAY
        || t === WALLTYPE_INDUSTRIAL || t === 7; // suburban
    }

    function setSurfaceType(worldX, type) {
      const lx = worldX - xLeft;
      if (lx < 0 || lx >= rw) return false;
      // Walk from hint downward/upward for surface wall cell
      let sy = -1;
      const yStart = clamp(hintY, 1, sim_res_y - 2);
      for (let y = yStart; y >= 1; y--) {
        const idx = (y * rw + lx) * 4;
        const idxAbove = ((y + 1) * rw + lx) * 4;
        if (wallData[idx + CH_DISTANCE] === 0 && wallData[idxAbove + CH_DISTANCE] !== 0) {
          sy = y;
          break;
        }
      }
      if (sy < 0) {
        for (let y = yStart + 1; y < sim_res_y - 1; y++) {
          const idx = (y * rw + lx) * 4;
          const idxAbove = ((y + 1) * rw + lx) * 4;
          if (wallData[idx + CH_DISTANCE] === 0 && wallData[idxAbove + CH_DISTANCE] !== 0) {
            sy = y;
            break;
          }
        }
      }
      if (sy < 0) return false;
      const idx = (sy * rw + lx) * 4;
      const cur = wallData[idx + CH_TYPE];
      if (!canConvertType(cur)) return false;
      wallData[idx + CH_TYPE] = type;
      return true;
    }

    // Main runway strip — real WALLTYPE_RUNWAY surface tiles
    for (let x = cx - RUNWAY_HALF_CELLS; x <= cx + RUNWAY_HALF_CELLS; x++) {
      if (x < 0 || x >= sim_res_x) continue;
      setSurfaceType(x, WALLTYPE_RUNWAY);
    }

    // Terminal = URBAN block at left end of runway (renders as city buildings)
    const termRight = cx - RUNWAY_HALF_CELLS + 2;
    const termLeft = termRight - TERMINAL_WIDTH;
    for (let x = termLeft; x <= termRight; x++) {
      if (x < 0 || x >= sim_res_x) continue;
      setSurfaceType(x, WALLTYPE_URBAN);
    }

    // ATC tower footprint = compact URBAN beside terminal
    const towerX0 = termLeft - TOWER_WIDTH - 1;
    for (let x = towerX0; x < towerX0 + TOWER_WIDTH; x++) {
      if (x < 0 || x >= sim_res_x) continue;
      setSurfaceType(x, WALLTYPE_URBAN);
    }

    // Hangar = INDUSTRIAL next to terminal
    for (let x = termRight + 1; x <= termRight + 5; x++) {
      if (x < 0 || x >= sim_res_x) continue;
      setSurfaceType(x, WALLTYPE_INDUSTRIAL);
    }

    writeWallTextures(xLeft, 0, rw, sim_res_y, wallData);
  }

  function paintRunwayStrip(simX, simY) {
    paintAirportInfrastructure(simX, simY);
  }

  // ─── Airport ──────────────────────────────────────────────────────────────

  class Airport {
    constructor(xIn, yIn, opts) {
      opts = opts || {};
      this.id = opts.id || uidAirport();
      this._x = Math.floor(xIn);
      this._y = Math.floor(yIn);
      this._name = opts.name || ('Airport ' + (airports.length + 1));
      this._freqPerMin = opts.freqPerMin != null ? opts.freqPerMin : 2;
      this._cruiseAltM = opts.cruiseAltM != null ? opts.cruiseAltM : 3500;
      this._active = opts.active !== false;
      this._spawnAccum = 0;
      this._width = 52;
      this._height = 64;
      this._menuDiv = null;
      this._hdrTextEl = null;
      this._freqBadge = null;
      this._altBadge = null;

      this._mainDiv = document.createElement('div');
      this._canvas = document.createElement('canvas');
      this._mainDiv.appendChild(this._canvas);
      document.body.appendChild(this._mainDiv);
      this._canvas.height = this._height;
      this._canvas.width = this._width;
      this._mainDiv.style.position = 'absolute';
      this._mainDiv.style.width = '0px';
      this._mainDiv.style.height = '0px';
      this._c = this._canvas.getContext('2d');
      this._canvas.style.position = 'absolute';
      this._canvas.style.zIndex = '2';
      this._canvas.style.cursor = 'pointer';

      const self = this;
      this._canvas.addEventListener('mousedown', function(event) {
        if (event.button !== 0) return;
        if (typeof guiControls !== 'undefined' && guiControls.tool === 'TOOL_AIRPORT') {
          self.destroy();
          event.stopPropagation();
          return;
        }
        if (typeof guiControls !== 'undefined' && guiControls.tool === 'TOOL_FLIGHT_ROUTE') {
          handleRouteAirportClick(self);
          event.stopPropagation();
          return;
        }
        self.toggleMenu();
        event.stopPropagation();
      });
      this._canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });

      this._createMenu();
      if (opts.paintRunway !== false && typeof gl !== 'undefined' && gl && typeof frameBuff_1 !== 'undefined')
        paintAirportInfrastructure(this._x, this._y);
    }

    _createMenu() {
      const self = this;
      this._menuDiv = document.createElement('div');
      this._menuDiv.style.cssText =
        'position:absolute;display:none;z-index:1000;background:#13131f;border:1px solid #252540;' +
        'border-radius:12px;padding:0;color:white;font-family:Arial,sans-serif;font-size:13px;' +
        'min-width:260px;box-shadow:0 8px 32px rgba(0,0,0,0.75);overflow:hidden;';

      const hdr = document.createElement('div');
      hdr.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;padding:11px 14px;' +
        'background:linear-gradient(135deg,#191930,#0e0e22);border-bottom:1px solid #252540;cursor:move;user-select:none;gap:8px;';

      let dragOffX = 0, dragOffY = 0, dragging = false;
      hdr.addEventListener('mousedown', (e) => {
        if (e.target === closeBtn) return;
        dragging = true;
        dragOffX = e.clientX - self._menuDiv.getBoundingClientRect().left;
        dragOffY = e.clientY - self._menuDiv.getBoundingClientRect().top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        self._menuDiv.style.left = (e.clientX - dragOffX) + 'px';
        self._menuDiv.style.top = (e.clientY - dragOffY) + 'px';
      });
      document.addEventListener('mouseup', () => { dragging = false; });

      const hdrTitle = document.createElement('span');
      hdrTitle.style.cssText = 'font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;flex:1;min-width:0;';
      hdrTitle.innerHTML = '<span style="flex-shrink:0">✈</span>';
      const hdrText = document.createElement('span');
      hdrText.textContent = this._name;
      hdrText.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      hdrTitle.appendChild(hdrText);
      this._hdrTextEl = hdrText;

      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&#x2715;';
      closeBtn.style.cssText =
        'background:rgba(255,255,255,0.07);border:none;color:#777;font-size:12px;cursor:pointer;' +
        'padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;';
      closeBtn.addEventListener('click', () => { self._menuDiv.style.display = 'none'; });
      hdr.appendChild(hdrTitle);
      hdr.appendChild(closeBtn);
      this._menuDiv.appendChild(hdr);

      const body = document.createElement('div');
      body.style.cssText = 'padding:14px 15px 16px;';

      const mkLabel = (text) => {
        const l = document.createElement('div');
        l.textContent = text;
        l.style.cssText =
          'color:#4a5060;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;margin-bottom:6px;margin-top:12px;';
        return l;
      };

      body.appendChild(mkLabel('Name'));
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = this._name;
      nameInput.style.cssText =
        'width:100%;box-sizing:border-box;background:#0b0b17;border:1px solid #252540;border-radius:6px;color:#d0d0e0;padding:7px 10px;font-size:12px;';
      nameInput.addEventListener('change', function() {
        self._name = this.value || 'Airport';
        if (self._hdrTextEl) self._hdrTextEl.textContent = self._name;
      });
      body.appendChild(nameInput);

      // Active toggle
      body.appendChild(mkLabel('Active'));
      const activeRow = document.createElement('div');
      activeRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const activeChk = document.createElement('input');
      activeChk.type = 'checkbox';
      activeChk.checked = this._active;
      activeChk.addEventListener('change', function() { self._active = this.checked; });
      const activeLbl = document.createElement('span');
      activeLbl.textContent = 'Departures enabled';
      activeLbl.style.color = '#aaa';
      activeRow.appendChild(activeChk);
      activeRow.appendChild(activeLbl);
      body.appendChild(activeRow);

      const mkSlider = (label, init, min, max, step, unit, onChange) => {
        const hd = document.createElement('div');
        hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;margin-top:13px;';
        const lb = document.createElement('span');
        lb.textContent = label;
        lb.style.cssText = 'color:#4a5060;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;';
        const badge = document.createElement('span');
        badge.textContent = init + unit;
        badge.style.cssText =
          'color:#4a90e2;font-size:11px;font-weight:700;background:rgba(74,144,226,0.13);padding:1px 8px;border-radius:10px;';
        hd.appendChild(lb);
        hd.appendChild(badge);
        const sl = document.createElement('input');
        sl.type = 'range';
        sl.min = min; sl.max = max; sl.step = step; sl.value = init;
        sl.style.cssText = 'width:100%;accent-color:#4a90e2;cursor:pointer;margin-top:2px;';
        sl.addEventListener('input', function() {
          const v = onChange(parseFloat(this.value));
          badge.textContent = v + unit;
        });
        body.appendChild(hd);
        body.appendChild(sl);
        return badge;
      };

      this._freqBadge = mkSlider('Default route freq', this._freqPerMin, 0, 12, 0.1, '/min', (v) => {
        self._freqPerMin = v;
        return v.toFixed(1);
      });
      this._altBadge = mkSlider('Default cruise alt', this._cruiseAltM, 500, 12000, 100, ' m', (v) => {
        self._cruiseAltM = v;
        return Math.round(v);
      });

      body.appendChild(mkLabel('Routes from here'));
      const routesBox = document.createElement('div');
      routesBox.style.cssText = 'font-size:12px;color:#aaa;max-height:140px;overflow:auto;';
      const outs = routesFromAirport(this.id);
      if (outs.length === 0) {
        routesBox.textContent = 'None — use Flight Route tool';
      } else {
        outs.forEach(r => {
          const dest = findAirportById(r.toId);
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;margin:4px 0;';
          const label = document.createElement('span');
          label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
          label.textContent = '→ ' + (dest ? dest.getName() : r.toId) + ' (' + (r.freqPerMin || 0).toFixed(1) + '/min)';
          const editBtn = document.createElement('button');
          editBtn.textContent = 'Edit';
          editBtn.style.cssText = 'background:#1a2a3a;border:1px solid #3a5a7a;color:#9cf;border-radius:4px;cursor:pointer;font-size:11px;padding:2px 6px;';
          editBtn.addEventListener('click', () => {
            selectedRouteId = r.id;
            r.openMenu();
          });
          const del = document.createElement('button');
          del.textContent = '✕';
          del.style.cssText = 'background:none;border:none;color:#c66;cursor:pointer;';
          del.addEventListener('click', () => { r.destroy(); self.toggleMenu(); self.toggleMenu(); });
          row.appendChild(label);
          row.appendChild(editBtn);
          row.appendChild(del);
          routesBox.appendChild(row);
        });
      }
      body.appendChild(routesBox);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove Airport';
      removeBtn.style.cssText =
        'width:100%;margin-top:14px;padding:8px;background:#3a1520;border:1px solid #632;color:#faa;' +
        'border-radius:6px;cursor:pointer;font-size:12px;';
      removeBtn.addEventListener('click', () => self.destroy());
      body.appendChild(removeBtn);

      this._menuDiv.appendChild(body);
      document.body.appendChild(this._menuDiv);
      if (typeof ControlHelp !== 'undefined' && ControlHelp.registerEntityMenu)
        ControlHelp.registerEntityMenu(this._menuDiv);
    }

    toggleMenu() {
      if (!this._menuDiv) return;
      const screenX = typeof simToScreenX === 'function' ? simToScreenX(this._x) : this._x;
      const screenY = typeof simToScreenY === 'function' ? simToScreenY(this._y) : this._y;
      this._menuDiv.style.left = screenX + 'px';
      this._menuDiv.style.top = (screenY - 220) + 'px';
      this._menuDiv.style.display = (this._menuDiv.style.display === 'none') ? 'block' : 'none';
    }

    updateCanvas() {
      if (!displayAirports) {
        this._mainDiv.style.display = 'none';
        return;
      }
      this._mainDiv.style.display = 'block';
      // Small selection marker above the terrain (buildings/runway are real wall tiles)
      const screenX = simToScreenX(this._x) - this._width / 2;
      const screenY = simToScreenY(this._y) - this._height + 8;
      this._mainDiv.style.left = screenX + 'px';
      this._mainDiv.style.top = screenY + 'px';

      const c = this._c;
      const W = this._width;
      const H = this._height;
      c.clearRect(0, 0, W, H);

      const selected = routePickFromId === this.id;
      const accent = selected ? '#ffcc44' : (this._active ? '#7eb6ff' : '#888');

      // Soft pin stem
      c.strokeStyle = accent;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(W / 2, H - 6);
      c.lineTo(W / 2, 28);
      c.stroke();

      // Marker disc
      c.fillStyle = 'rgba(20,24,36,0.85)';
      c.strokeStyle = accent;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(W / 2, 22, 16, 0, Math.PI * 2);
      c.fill();
      c.stroke();

      // Simple ATC tower glyph (marker only — real tower is urban terrain)
      c.fillStyle = accent;
      c.fillRect(W / 2 - 3, 14, 6, 14);
      c.fillRect(W / 2 - 7, 12, 14, 5);
      c.beginPath();
      c.arc(W / 2, 11, 2, 0, Math.PI * 2);
      c.fill();

      // Name tag
      c.fillStyle = '#eee';
      c.font = 'bold 10px Arial';
      c.textAlign = 'center';
      c.fillText(this._name, W / 2, H - 2);
    }

    destroy() {
      // Remove routes touching this airport
      for (let i = flightRoutes.length - 1; i >= 0; i--) {
        const r = flightRoutes[i];
        if (r.fromId === this.id || r.toId === this.id)
          r.destroy();
      }
      if (this._mainDiv) this._mainDiv.remove();
      if (this._menuDiv) this._menuDiv.remove();
      const idx = airports.indexOf(this);
      if (idx >= 0) airports.splice(idx, 1);
      if (routePickFromId === this.id) routePickFromId = null;
    }

    getXpos() { return this._x; }
    getYpos() { return this._y; }
    getName() { return this._name; }
    getFreqPerMin() { return this._freqPerMin; }
    getCruiseAltM() { return this._cruiseAltM; }
    isActive() { return this._active; }
    getSettings() {
      return {
        id: this.id,
        name: this._name,
        freqPerMin: this._freqPerMin,
        cruiseAltM: this._cruiseAltM,
        active: this._active,
      };
    }
    setSettings(s) {
      if (!s) return;
      if (s.id) this.id = s.id;
      if (s.name != null) this._name = s.name;
      if (s.freqPerMin != null) this._freqPerMin = s.freqPerMin;
      if (s.cruiseAltM != null) this._cruiseAltM = s.cruiseAltM;
      if (s.active != null) this._active = !!s.active;
      if (this._hdrTextEl) this._hdrTextEl.textContent = this._name;
    }

    tickSpawn(dtSec, freqMult, maxPlanes) {
      // Spawning is per-route now; airport only seeds default freq for new routes.
      void dtSec; void freqMult; void maxPlanes;
    }
  }

  // ─── FlightRoute ──────────────────────────────────────────────────────────

  class FlightRoute {
    constructor(fromId, toId, opts) {
      opts = opts || {};
      this.id = opts.id || uidRoute();
      this.fromId = fromId;
      this.toId = toId;
      this.cruiseAltM = opts.cruiseAltM != null ? opts.cruiseAltM : null;
      this.freqPerMin = opts.freqPerMin != null ? opts.freqPerMin : 2;
      this.active = opts.active !== false;
      this.waypoints = Array.isArray(opts.waypoints)
        ? opts.waypoints.map(w => ({ x: w.x, y: w.y })).filter(w => Number.isFinite(w.x) && Number.isFinite(w.y))
        : [];
      this._spawnAccum = 0;
      this._menuDiv = null;
    }

    getPathPoints() {
      const a = findAirportById(this.fromId);
      const b = findAirportById(this.toId);
      if (!a || !b) return [];
      const pts = [{ x: a.getXpos(), y: airportAirY(a) }];
      for (let i = 0; i < this.waypoints.length; i++)
        pts.push({ x: this.waypoints[i].x, y: this.waypoints[i].y });
      pts.push({ x: b.getXpos(), y: airportAirY(b) });
      return pts;
    }

    ensureDefaultWaypoints() {
      if (this.waypoints.length > 0) return;
      const a = findAirportById(this.fromId);
      const b = findAirportById(this.toId);
      if (!a || !b) return;
      const cruise = this.cruiseAltM != null ? this.cruiseAltM : a.getCruiseAltM();
      const midX = a.getXpos() + shortestDeltaX(a.getXpos(), b.getXpos()) * 0.5;
      const midY = altToSimY(cruise, Math.min(a.getYpos(), b.getYpos()));
      this.waypoints.push({ x: wrapSimX(midX), y: midY });
    }

    tickSpawn(dtSec, freqMult, maxPlanes) {
      if (!this.active || this.freqPerMin <= 0) return;
      if (trafficPlanes.length >= maxPlanes) return;
      const from = findAirportById(this.fromId);
      const dest = findAirportById(this.toId);
      if (!from || !dest || !from.isActive()) return;
      this.ensureDefaultWaypoints();

      const rate = this.freqPerMin * (freqMult || 1) / 60;
      this._spawnAccum += rate * dtSec;
      while (this._spawnAccum >= 1 && trafficPlanes.length < maxPlanes) {
        this._spawnAccum -= 1;
        const cruise = this.cruiseAltM != null ? this.cruiseAltM : from.getCruiseAltM();
        trafficPlanes.push(new TrafficPlane(from, dest, this, cruise));
      }
    }

    openMenu() {
      selectedRouteId = this.id;
      if (!this._menuDiv) this._createMenu();
      else this._refreshMenuValues();
      const a = findAirportById(this.fromId);
      const screenX = a && typeof simToScreenX === 'function' ? simToScreenX(a.getXpos()) : 80;
      const screenY = a && typeof simToScreenY === 'function' ? simToScreenY(a.getYpos()) : 80;
      this._menuDiv.style.left = (screenX + 40) + 'px';
      this._menuDiv.style.top = Math.max(20, screenY - 180) + 'px';
      this._menuDiv.style.display = 'block';
    }

    closeMenu() {
      if (this._menuDiv) this._menuDiv.style.display = 'none';
    }

    _refreshMenuValues() {
      if (!this._menuDiv) return;
      const freq = this._menuDiv.querySelector('[data-f="freq"]');
      const active = this._menuDiv.querySelector('[data-f="active"]');
      const badge = this._menuDiv.querySelector('[data-f="freqBadge"]');
      if (freq) freq.value = this.freqPerMin;
      if (badge) badge.textContent = this.freqPerMin.toFixed(1) + '/min';
      if (active) active.checked = this.active;
      const wpInfo = this._menuDiv.querySelector('[data-f="wpInfo"]');
      if (wpInfo) wpInfo.textContent = this.waypoints.length + ' path node(s)';
      this._rebuildNodeList();
    }

    _rebuildNodeList() {
      if (!this._menuDiv) return;
      const list = this._menuDiv.querySelector('[data-f="nodeList"]');
      if (!list) return;
      const self = this;
      list.innerHTML = '';
      if (this.waypoints.length === 0) {
        list.textContent = 'No nodes yet — click the dashed path or sky to add.';
        list.style.color = '#888';
        return;
      }
      list.style.color = '#ccc';
      for (let i = 0; i < this.waypoints.length; i++) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:6px;margin:3px 0;';
        const label = document.createElement('span');
        const alt = Math.round(simYToAlt(this.waypoints[i].y,
          (findAirportById(this.fromId) || { getYpos: () => 0 }).getYpos()));
        label.textContent = 'Node ' + (i + 1) + '  ·  ~' + alt + ' m';
        label.style.cssText = 'font-size:12px;flex:1;';
        const del = document.createElement('button');
        del.textContent = '✕';
        del.title = 'Delete node';
        del.style.cssText = 'background:none;border:none;color:#c66;cursor:pointer;';
        del.addEventListener('click', () => {
          self.waypoints.splice(i, 1);
          self._refreshMenuValues();
        });
        row.appendChild(label);
        row.appendChild(del);
        list.appendChild(row);
      }
    }

    _createMenu() {
      const self = this;
      this._menuDiv = document.createElement('div');
      this._menuDiv.style.cssText =
        'position:absolute;display:none;z-index:1000;background:#13131f;border:1px solid #252540;' +
        'border-radius:12px;padding:0;color:white;font-family:Arial,sans-serif;font-size:13px;' +
        'min-width:270px;box-shadow:0 8px 32px rgba(0,0,0,0.75);overflow:hidden;';

      const from = findAirportById(this.fromId);
      const to = findAirportById(this.toId);
      const titleText = (from ? from.getName() : '?') + ' → ' + (to ? to.getName() : '?');

      const hdr = document.createElement('div');
      hdr.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;padding:11px 14px;' +
        'background:linear-gradient(135deg,#191930,#0e0e22);border-bottom:1px solid #252540;cursor:move;user-select:none;gap:8px;';
      let dragOffX = 0, dragOffY = 0, dragging = false;
      hdr.addEventListener('mousedown', (e) => {
        if (e.target === closeBtn) return;
        dragging = true;
        dragOffX = e.clientX - self._menuDiv.getBoundingClientRect().left;
        dragOffY = e.clientY - self._menuDiv.getBoundingClientRect().top;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        self._menuDiv.style.left = (e.clientX - dragOffX) + 'px';
        self._menuDiv.style.top = (e.clientY - dragOffY) + 'px';
      });
      document.addEventListener('mouseup', () => { dragging = false; });

      const hdrTitle = document.createElement('span');
      hdrTitle.style.cssText = 'font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
      hdrTitle.textContent = '✈ ' + titleText;
      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = '&#x2715;';
      closeBtn.style.cssText =
        'background:rgba(255,255,255,0.07);border:none;color:#777;font-size:12px;cursor:pointer;' +
        'padding:3px 8px;border-radius:5px;line-height:1;flex-shrink:0;';
      closeBtn.addEventListener('click', () => self.closeMenu());
      hdr.appendChild(hdrTitle);
      hdr.appendChild(closeBtn);
      this._menuDiv.appendChild(hdr);

      const body = document.createElement('div');
      body.style.cssText = 'padding:14px 15px 16px;';

      const mkLabel = (text) => {
        const l = document.createElement('div');
        l.textContent = text;
        l.style.cssText =
          'color:#4a5060;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;margin-bottom:6px;margin-top:12px;';
        return l;
      };

      body.appendChild(mkLabel('Active'));
      const activeRow = document.createElement('div');
      activeRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
      const activeChk = document.createElement('input');
      activeChk.type = 'checkbox';
      activeChk.checked = this.active;
      activeChk.setAttribute('data-f', 'active');
      activeChk.addEventListener('change', function() { self.active = this.checked; });
      const activeLbl = document.createElement('span');
      activeLbl.textContent = 'Flights on this route';
      activeLbl.style.color = '#aaa';
      activeRow.appendChild(activeChk);
      activeRow.appendChild(activeLbl);
      body.appendChild(activeRow);

      const hd = document.createElement('div');
      hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;margin-top:13px;';
      const lb = document.createElement('span');
      lb.textContent = 'Frequency';
      lb.style.cssText = 'color:#4a5060;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;';
      const badge = document.createElement('span');
      badge.setAttribute('data-f', 'freqBadge');
      badge.textContent = this.freqPerMin.toFixed(1) + '/min';
      badge.style.cssText =
        'color:#4a90e2;font-size:11px;font-weight:700;background:rgba(74,144,226,0.13);padding:1px 8px;border-radius:10px;';
      hd.appendChild(lb);
      hd.appendChild(badge);
      const sl = document.createElement('input');
      sl.type = 'range';
      sl.min = 0; sl.max = 12; sl.step = 0.1;
      sl.value = this.freqPerMin;
      sl.setAttribute('data-f', 'freq');
      sl.style.cssText = 'width:100%;accent-color:#4a90e2;cursor:pointer;margin-top:2px;';
      sl.addEventListener('input', function() {
        self.freqPerMin = parseFloat(this.value);
        badge.textContent = self.freqPerMin.toFixed(1) + '/min';
      });
      body.appendChild(hd);
      body.appendChild(sl);

      body.appendChild(mkLabel('Path nodes'));
      const wpInfo = document.createElement('div');
      wpInfo.setAttribute('data-f', 'wpInfo');
      wpInfo.style.cssText = 'color:#aaa;font-size:12px;line-height:1.4;margin-bottom:6px;';
      wpInfo.textContent = this.waypoints.length + ' path node(s)';
      body.appendChild(wpInfo);

      const nodeList = document.createElement('div');
      nodeList.setAttribute('data-f', 'nodeList');
      nodeList.style.cssText = 'max-height:110px;overflow:auto;margin-bottom:8px;';
      body.appendChild(nodeList);

      const tip = document.createElement('div');
      tip.style.cssText = 'color:#666;font-size:11px;margin-top:4px;line-height:1.35;';
      tip.textContent = 'Flight Route tool: click path to insert a node, click sky to append, drag handles, right-click to delete.';
      body.appendChild(tip);

      const addClimb = document.createElement('button');
      addClimb.textContent = 'Add Mid-Route Node';
      addClimb.style.cssText =
        'width:100%;margin-top:10px;padding:7px;background:#1a2a3a;border:1px solid #3a5a7a;color:#9cf;' +
        'border-radius:6px;cursor:pointer;font-size:12px;';
      addClimb.addEventListener('click', () => {
        const a = findAirportById(self.fromId);
        const b = findAirportById(self.toId);
        if (!a || !b) return;
        const cruise = self.cruiseAltM != null ? self.cruiseAltM : a.getCruiseAltM();
        const t = (self.waypoints.length + 1) / (self.waypoints.length + 2);
        const midX = a.getXpos() + shortestDeltaX(a.getXpos(), b.getXpos()) * t;
        const midY = altToSimY(cruise, Math.min(a.getYpos(), b.getYpos()));
        self.waypoints.push({ x: wrapSimX(midX), y: midY });
        self._refreshMenuValues();
      });
      body.appendChild(addClimb);

      const clearWp = document.createElement('button');
      clearWp.textContent = 'Reset Path (one cruise node)';
      clearWp.style.cssText =
        'width:100%;margin-top:8px;padding:7px;background:#1a1a2e;border:1px solid #3a3a5c;color:#ccc;' +
        'border-radius:6px;cursor:pointer;font-size:12px;';
      clearWp.addEventListener('click', () => {
        self.waypoints = [];
        self.ensureDefaultWaypoints();
        self._refreshMenuValues();
      });
      body.appendChild(clearWp);

      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Delete Route';
      removeBtn.style.cssText =
        'width:100%;margin-top:8px;padding:8px;background:#3a1520;border:1px solid #632;color:#faa;' +
        'border-radius:6px;cursor:pointer;font-size:12px;';
      removeBtn.addEventListener('click', () => self.destroy());
      body.appendChild(removeBtn);

      this._menuDiv.appendChild(body);
      document.body.appendChild(this._menuDiv);
      this._rebuildNodeList();
      if (typeof ControlHelp !== 'undefined' && ControlHelp.registerEntityMenu)
        ControlHelp.registerEntityMenu(this._menuDiv);
    }

    destroy() {
      if (this._menuDiv) this._menuDiv.remove();
      this._menuDiv = null;
      if (selectedRouteId === this.id) selectedRouteId = null;
      const idx = flightRoutes.indexOf(this);
      if (idx >= 0) flightRoutes.splice(idx, 1);
      for (let i = trafficPlanes.length - 1; i >= 0; i--) {
        if (trafficPlanes[i].routeId === this.id)
          trafficPlanes[i].destroy();
      }
    }

    getSettings() {
      return {
        id: this.id,
        fromId: this.fromId,
        toId: this.toId,
        cruiseAltM: this.cruiseAltM,
        freqPerMin: this.freqPerMin,
        active: this.active,
        waypoints: this.waypoints.map(w => ({ x: w.x, y: w.y })),
      };
    }

    setSettings(s) {
      if (!s) return;
      if (s.freqPerMin != null) this.freqPerMin = s.freqPerMin;
      if (s.cruiseAltM != null) this.cruiseAltM = s.cruiseAltM;
      if (s.active != null) this.active = !!s.active;
      if (Array.isArray(s.waypoints)) {
        this.waypoints = s.waypoints.map(w => ({ x: w.x, y: w.y }))
          .filter(w => Number.isFinite(w.x) && Number.isFinite(w.y));
      }
      this._refreshMenuValues();
    }
  }

  function findRouteById(id) {
    for (let i = 0; i < flightRoutes.length; i++) {
      if (flightRoutes[i].id === id) return flightRoutes[i];
    }
    return null;
  }

  function distPointToSeg(px, py, ax, ay, bx, by) {
    const abx = shortestDeltaX(ax, bx);
    const aby = by - ay;
    const apx = shortestDeltaX(ax, px);
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 > 1e-8 ? (apx * abx + apy * aby) / ab2 : 0;
    t = clamp(t, 0, 1);
    const cx = wrapSimX(ax + abx * t);
    const cy = ay + aby * t;
    const dx = shortestDeltaX(cx, px);
    const dy = cy - py;
    return { dist: Math.sqrt(dx * dx + dy * dy), t, cx, cy };
  }

  function hitTestWaypoint(simX, simY, maxDist) {
    const maxD = maxDist != null ? maxDist : WAYPOINT_HIT_RADIUS;
    let best = null;
    let bestD = maxD;
    for (let r = 0; r < flightRoutes.length; r++) {
      const route = flightRoutes[r];
      for (let i = 0; i < route.waypoints.length; i++) {
        const w = route.waypoints[i];
        const dx = shortestDeltaX(w.x, simX);
        const dy = w.y - simY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestD) {
          bestD = d;
          best = { route, index: i };
        }
      }
    }
    return best;
  }

  function hitTestRouteSegment(simX, simY, maxDist) {
    const maxD = maxDist != null ? maxDist : 12;
    let best = null;
    let bestD = maxD;
    for (let r = 0; r < flightRoutes.length; r++) {
      const route = flightRoutes[r];
      const pts = route.getPathPoints();
      for (let i = 0; i < pts.length - 1; i++) {
        const hit = distPointToSeg(simX, simY, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        if (hit.dist < bestD) {
          bestD = hit.dist;
          best = { route, segIndex: i, x: hit.cx, y: hit.cy, t: hit.t };
        }
      }
    }
    return best;
  }

  function finishDraftRoute(toAirport) {
    if (!routePickFromId || !toAirport || routePickFromId === toAirport.id) {
      routePickFromId = null;
      draftWaypoints = [];
      return;
    }
    const exists = flightRoutes.find(r => r.fromId === routePickFromId && r.toId === toAirport.id);
    if (exists) {
      // Re-edit existing: replace waypoints with draft if any
      if (draftWaypoints.length)
        exists.waypoints = draftWaypoints.map(w => ({ x: w.x, y: w.y }));
      selectedRouteId = exists.id;
      exists.openMenu();
    } else {
      const from = findAirportById(routePickFromId);
      const cruise = from ? from.getCruiseAltM() : 3500;
      const freq = from ? from.getFreqPerMin() : 2;
      const route = new FlightRoute(routePickFromId, toAirport.id, {
        cruiseAltM: cruise,
        freqPerMin: freq,
        waypoints: draftWaypoints.map(w => ({ x: w.x, y: w.y })),
      });
      if (route.waypoints.length === 0)
        route.ensureDefaultWaypoints();
      flightRoutes.push(route);
      selectedRouteId = route.id;
      route.openMenu();
    }
    routePickFromId = null;
    draftWaypoints = [];
  }

  function handleRouteAirportClick(airport) {
    if (!routePickFromId) {
      routePickFromId = airport.id;
      draftWaypoints = [];
      selectedRouteId = null;
      return;
    }
    if (routePickFromId === airport.id) {
      routePickFromId = null;
      draftWaypoints = [];
      return;
    }
    finishDraftRoute(airport);
  }

  function clientToSim(clientX, clientY) {
    if (typeof canvas === 'undefined' || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    if (typeof screenToSimX !== 'function' || typeof screenToSimY !== 'function') return null;
    if (typeof sim_res_x !== 'number' || typeof sim_res_y !== 'number') return null;
    return {
      x: screenToSimX(sx) * sim_res_x,
      y: screenToSimY(sy) * sim_res_y,
    };
  }

  function isFlightRouteTool() {
    return typeof guiControls !== 'undefined' && guiControls.tool === 'TOOL_FLIGHT_ROUTE';
  }

  function tryPlaceOrSelectRoute(simX, simY, opts) {
    opts = opts || {};
    const isRight = !!opts.rightClick;

    // Right-click waypoint → delete
    if (isRight) {
      const wp = hitTestWaypoint(simX, simY, WAYPOINT_HIT_RADIUS);
      if (wp) {
        wp.route.waypoints.splice(wp.index, 1);
        selectedRouteId = wp.route.id;
        wp.route._refreshMenuValues();
        return true;
      }
      return false;
    }

    // Drag start on waypoint
    const wpHit = hitTestWaypoint(simX, simY, WAYPOINT_HIT_RADIUS);
    if (wpHit) {
      selectedRouteId = wpHit.route.id;
      dragState = { routeId: wpHit.route.id, index: wpHit.index };
      wpHit.route.openMenu();
      return true;
    }

    // Click existing path → select / insert waypoint node
    const segHit = hitTestRouteSegment(simX, simY, 14);
    if (segHit && !routePickFromId) {
      selectedRouteId = segHit.route.id;
      const wpInsertIndex = segHit.segIndex;
      if (segHit.segIndex < segHit.route.getPathPoints().length - 1) {
        const newWp = { x: wrapSimX(segHit.x), y: segHit.y };
        const at = clamp(wpInsertIndex, 0, segHit.route.waypoints.length);
        const nearExisting = hitTestWaypoint(newWp.x, newWp.y, 8);
        if (!nearExisting) {
          segHit.route.waypoints.splice(at, 0, newWp);
          dragState = { routeId: segHit.route.id, index: at };
        }
      }
      segHit.route.openMenu();
      return true;
    }

    // Airport click for create flow
    const ap = findNearestAirport(simX, simY, 35);
    if (ap) {
      handleRouteAirportClick(ap);
      return true;
    }

    // Drawing new route: click air adds draft waypoint
    if (routePickFromId) {
      draftWaypoints.push({ x: wrapSimX(simX), y: simY });
      return true;
    }

    // Editing selected route: click air appends waypoint
    if (selectedRouteId) {
      const route = findRouteById(selectedRouteId);
      if (route) {
        route.waypoints.push({ x: wrapSimX(simX), y: simY });
        route._refreshMenuValues();
        return true;
      }
    }

    return false;
  }

  function onRoutePointerMove(simX, simY) {
    if (!dragState) return;
    const route = findRouteById(dragState.routeId);
    if (!route || !route.waypoints[dragState.index]) {
      dragState = null;
      return;
    }
    route.waypoints[dragState.index].x = wrapSimX(simX);
    route.waypoints[dragState.index].y = clamp(simY, 0, (typeof sim_res_y === 'number' ? sim_res_y : 300) - 1);
  }

  function onRoutePointerUp() {
    dragState = null;
  }

  function installPointerHooks() {
    if (pointerHooksInstalled) return;
    pointerHooksInstalled = true;
    document.addEventListener('mousemove', function(e) {
      if (!dragState || !isFlightRouteTool()) return;
      const sim = clientToSim(e.clientX, e.clientY);
      if (sim) onRoutePointerMove(sim.x, sim.y);
    });
    document.addEventListener('mouseup', function() {
      onRoutePointerUp();
    });
    document.addEventListener('contextmenu', function(e) {
      if (!isFlightRouteTool()) return;
      const sim = clientToSim(e.clientX, e.clientY);
      if (!sim) return;
      if (hitTestWaypoint(sim.x, sim.y, WAYPOINT_HIT_RADIUS)) {
        e.preventDefault();
        tryPlaceOrSelectRoute(sim.x, sim.y, { rightClick: true });
      }
    });
  }

  installPointerHooks();

  // ─── A380 assets (same as flight mode) ────────────────────────────────────

  let a380ImgL = null;
  let a380ImgR = null;
  let a380GearImg = null;
  let a380ImagesReady = false;

  function ensureA380Images() {
    if (a380ImgL) return;
    a380ImgL = new Image();
    a380ImgR = new Image();
    a380GearImg = new Image();
    let loaded = 0;
    const onLoad = () => {
      loaded++;
      if (loaded >= 2) a380ImagesReady = true;
    };
    a380ImgL.onload = onLoad;
    a380ImgR.onload = onLoad;
    a380ImgL.src = 'resources/img/A380.png';
    a380ImgR.src = 'resources/img/A380_R.png';
    a380GearImg.src = 'resources/img/A380_gear.png';
  }
  ensureA380Images();

  // ─── TrafficPlane (A380 look + balloon-style sim-iter physics) ─────────────

  class TrafficPlane {
    constructor(fromAirport, toAirport, route, cruiseAltM) {
      ensureA380Images();
      this.id = uidPlane();
      this.routeId = route ? route.id : null;
      this.fromId = fromAirport.id;
      this.toId = toAirport.id;
      this._cruiseAltM = cruiseAltM || 3500;
      this._pathIndex = 1; // aim at first node after departure airport
      this._state = 'takeoff';
      this._stress = 0;
      this._grace = SPAWN_GRACE_SEC;
      this._smoke = 0;
      this._alive = true;

      this._x = wrapSimX(fromAirport.getXpos());
      this._y = airportAirY(fromAirport);
      this.directionIsLeft = shortestDeltaX(fromAirport.getXpos(), toAirport.getXpos()) < 0;
      this.angle = 0.08;
      this.velX = TAKEOFF_SPEED_MPS; // world m/s (for sync / display)
      this.velY = 20;
      this.throttle = 0.9;
      this.n1 = 0.7;
      this.gearExtPos = 0; // 0 = down, 7 = up

      this._sampleBase = new Float32Array(4);
      this._sampleWall = new Int8Array(4);
      this._sampleWater = new Float32Array(4);
      this._sampleCharge = new Float32Array(4);
      this._prevU = null; // null until first sample (avoid fake shear spike)
      this._prevV = null;
      this._smoothU = 0;
      this._smoothV = 0;
      this._motionPrimed = false;

      this._syncMetersFromCells();

      this._width = 220;
      this._height = 110;
      this._mainDiv = document.createElement('div');
      this._canvas = document.createElement('canvas');
      this._mainDiv.appendChild(this._canvas);
      document.body.appendChild(this._mainDiv);
      this._canvas.width = this._width;
      this._canvas.height = this._height;
      this._mainDiv.style.position = 'absolute';
      this._mainDiv.style.width = '0px';
      this._mainDiv.style.height = '0px';
      this._mainDiv.style.pointerEvents = 'none';
      this._c = this._canvas.getContext('2d');
      this._canvas.style.position = 'absolute';
      this._canvas.style.zIndex = '3';
    }

    _syncMetersFromCells() {
      const ch = typeof cellHeight === 'number' ? cellHeight : 50;
      this.posX = this._x * ch;
      this.posY = this._y * ch;
      this._pitch = this.angle;
      this._heading = this.directionIsLeft ? -1 : 1;
    }

    _getRoutePathCells() {
      const route = this.routeId ? findRouteById(this.routeId) : null;
      if (route) return route.getPathPoints();
      const from = findAirportById(this.fromId);
      const to = findAirportById(this.toId);
      if (!from || !to) return [];
      return [
        { x: from.getXpos(), y: airportAirY(from) },
        { x: to.getXpos(), y: airportAirY(to) },
      ];
    }

    _speedToRaw(mps) {
      if (typeof msToRawVelocity === 'function')
        return msToRawVelocity(mps);
      const ch = typeof cellHeight === 'number' ? cellHeight : 50;
      const tpi = typeof timePerIteration === 'number' ? timePerIteration : 0.00008;
      return (mps * 3600 / ch) * tpi;
    }

    // Balloon-style sample: wind in cells/iteration (raw), plus weather for stress
    _sampleAtmosphere() {
      if (!canSampleGl()) {
        return { uRaw: 0, vRaw: 0, uMs: 0, vMs: 0, tempC: 15, vapor: 0, charge: 0, wallAir: 1, wallType: 0, radarAlt: 500 };
      }
      const ix = Math.floor(clamp(wrapSimX(this._x), 0, sim_res_x - 1));
      const iy = Math.floor(clamp(this._y, 0, sim_res_y - 1));

      gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuff_1);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(ix, iy, 1, 1, gl.RGBA, gl.FLOAT, this._sampleBase);
      // Wall is RGBA8I — must read as BYTE (INT mis-reads and causes false mid-air crashes)
      gl.readBuffer(gl.COLOR_ATTACHMENT2);
      gl.readPixels(ix, iy, 1, 1, gl.RGBA_INTEGER, gl.BYTE, this._sampleWall);

      const wallType = this._sampleWall[0];
      const wallAir = this._sampleWall[1];
      const uRaw = wallAir === 0 ? 0 : (this._sampleBase[0] || 0);
      const vRaw = wallAir === 0 ? 0 : (this._sampleBase[1] || 0);
      const tempK = this._sampleBase[3];
      let tempC = 15;
      if (typeof potentialToRealT === 'function' && typeof KtoC === 'function')
        tempC = KtoC(potentialToRealT(tempK, iy));

      const ch = typeof cellHeight === 'number' ? cellHeight : 50;
      let uMs = 0, vMs = 0;
      if (typeof rawVelocityTo_ms === 'function') {
        uMs = rawVelocityTo_ms(uRaw);
        vMs = rawVelocityTo_ms(vRaw);
      }

      let vapor = 0, charge = 0;
      try {
        gl.readBuffer(gl.COLOR_ATTACHMENT1);
        gl.readPixels(ix, iy, 1, 1, gl.RGBA, gl.FLOAT, this._sampleWater);
        vapor = this._sampleWater[0] || 0;
      } catch (e) { /* optional */ }
      try {
        const latest = window.latestChargeTexture;
        const tex0 = window.chargeTexture_0;
        const cfb = (latest === tex0) ? window.chargeFrameBuff_0 : window.chargeFrameBuff_1;
        if (cfb) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, cfb);
          gl.readBuffer(gl.COLOR_ATTACHMENT0);
          gl.readPixels(ix, iy, 1, 1, gl.RGBA, gl.FLOAT, this._sampleCharge);
          charge = this._sampleCharge[0] || 0;
        }
      } catch (e) { /* optional */ }

      const vertDist = this._sampleWall[2];
      const radarAlt = Math.max(0, (vertDist - 1) * ch);

      return {
        uRaw, vRaw, uMs, vMs, tempC, vapor, charge,
        wallAir, wallType, radarAlt,
      };
    }

    _lightningNear() {
      if (!Array.isArray(chargeDischargesThisIter)) return false;
      for (let i = 0; i < chargeDischargesThisIter.length; i++) {
        const d = chargeDischargesThisIter[i];
        if (!d) continue;
        const sx = (d.u || 0) * sim_res_x;
        const sy = (d.v || 0) * sim_res_y;
        const dx = shortestDeltaX(this._x, sx);
        const dy = this._y - sy;
        if (dx * dx + dy * dy < 40 * 40) return true;
      }
      return false;
    }

    /**
     * Advance like WeatherBalloon.step(numSimIters), but with strong path
     * authority and only partial wind drift (planes fight the wind).
     */
    step(numSimIters) {
      if (!this._alive) return;
      const iters = Math.max(1, numSimIters || 1);
      const dtSec = (typeof timePerIteration === 'number' ? timePerIteration : 0.00008) * 3600 * iters;
      const atm = this._sampleAtmosphere();
      const path = this._getRoutePathCells();
      if (!path.length) return;

      if (this._pathIndex >= path.length)
        this._pathIndex = path.length - 1;
      if (this._pathIndex < 1 && path.length > 1)
        this._pathIndex = 1;

      const target = path[this._pathIndex];
      const dx = shortestDeltaX(this._x, target.x);
      const dy = target.y - this._y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const lastIdx = path.length - 1;
      const progress = lastIdx > 0 ? this._pathIndex / lastIdx : 1;
      let gearDown = false;
      let targetMps = CRUISE_SPEED_MPS;
      const keepDistress = this._state === 'distressed' && this._stress >= STRESS_DISTRESS * 0.85;
      if (keepDistress) {
        this._state = 'distressed';
        targetMps = 140;
        gearDown = false;
      } else if (this._pathIndex <= 1 && progress < 0.35) {
        this._state = 'takeoff';
        targetMps = TAKEOFF_SPEED_MPS + 50;
        gearDown = true;
      } else if (progress < 0.5) {
        this._state = 'climb';
        targetMps = 170;
      } else if (this._pathIndex >= lastIdx) {
        this._state = dist < 18 ? 'land' : 'descend';
        targetMps = this._state === 'land' ? 90 : 150;
        gearDown = dist < 30;
      } else if (this._pathIndex >= lastIdx - 1) {
        this._state = 'descend';
        targetMps = 155;
        gearDown = dist < 25;
      } else {
        this._state = 'cruise';
        targetMps = CRUISE_SPEED_MPS;
      }

      if (gearDown) this.gearExtPos = Math.max(0, this.gearExtPos - 0.02 * iters);
      else this.gearExtPos = Math.min(7, this.gearExtPos + 0.02 * iters);

      // Weather stress — only real hazards; cap so sim bursts don't one-shot the plane
      let stressAdd = 0;
      const windMag = Math.sqrt(atm.uMs * atm.uMs + atm.vMs * atm.vMs);
      const dtCap = Math.min(dtSec, 1);
      if (windMag > WIND_STRESS_MIN_MS)
        stressAdd += (windMag - WIND_STRESS_MIN_MS) * 0.0015 * dtCap;
      if (this._prevU != null && this._prevV != null) {
        const shear = Math.abs(atm.uMs - this._prevU) + Math.abs(atm.vMs - this._prevV);
        if (shear > 25)
          stressAdd += Math.min(0.04, (shear - 25) * 0.002) * dtCap;
      }
      this._prevU = atm.uMs;
      this._prevV = atm.vMs;
      if (-atm.vMs > 20) stressAdd += (-atm.vMs - 20) * 0.002 * dtCap;
      if (atm.tempC < -10 && atm.vapor > 0.003) stressAdd += 0.03 * dtCap;
      if (Math.abs(atm.charge) > 0.5) stressAdd += 0.06 * dtCap;
      if (this._lightningNear()) stressAdd += 0.25;
      stressAdd = Math.min(MAX_STRESS_ADD_PER_STEP, stressAdd);
      this._stress = clamp(this._stress + stressAdd - 0.02 * dtCap, 0, 1.25);
      if (this._grace > 0) this._grace = Math.max(0, this._grace - dtSec);

      if (this._stress >= STRESS_DISTRESS && this._state !== 'land' && this._state !== 'crash') {
        this._state = 'distressed';
        this._smoke = Math.min(1, this._smoke + 0.1 * dtCap);
        targetMps *= (1 - this._stress * 0.25);
      } else {
        this._smoke = Math.max(0, this._smoke - 0.05 * dtCap);
      }

      let ux = 0, uy = 0;
      if (dist > 1e-4) {
        ux = dx / dist;
        uy = dy / dist;
      }

      const pathAuthority = this._state === 'distressed'
        ? Math.max(0.55, 1 - this._stress * 0.35)
        : 1;
      const speedRaw = this._speedToRaw(targetMps) * pathAuthority;
      // Partial wind only (unlike balloons which are fully advected)
      const windBlend = this._state === 'distressed' ? WIND_PATH_INFLUENCE * 1.6 : WIND_PATH_INFLUENCE;
      const desireU = ux * speedRaw + atm.uRaw * windBlend;
      const desireV = uy * speedRaw + atm.vRaw * windBlend;

      // Smooth motion so calm air doesn't jitter
      if (!this._motionPrimed) {
        this._smoothU = desireU;
        this._smoothV = desireV;
        this._motionPrimed = true;
      }
      const smooth = 1 - Math.pow(0.85, Math.min(iters, 12));
      this._smoothU += (desireU - this._smoothU) * smooth;
      this._smoothV += (desireV - this._smoothV) * smooth;
      const moveU = this._smoothU;
      const moveV = this._smoothV;

      this._x = wrapSimX(this._x + moveU * iters);
      this._y += moveV * iters;
      this._y = clamp(this._y, 2, (typeof sim_res_y === 'number' ? sim_res_y : 300) - 2);

      // Angle toward actual velocity (where the plane is going)
      if (Math.abs(moveU) > 1e-8)
        this.directionIsLeft = moveU < 0;
      let desiredPitch = Math.atan2(moveV, Math.max(Math.abs(moveU), 1e-6));
      desiredPitch = clamp(desiredPitch, -0.5, 0.5);
      if (Math.abs(desiredPitch) < 0.05 && Math.abs(dy) > 2)
        desiredPitch = clamp(dy * 0.01, -0.2, 0.2);
      const turnRate = Math.min(1, 0.15 * iters);
      this.angle += (desiredPitch - this.angle) * turnRate;
      this.angle = clamp(this.angle, -0.55, 0.55);

      const ch = typeof cellHeight === 'number' ? cellHeight : 50;
      if (typeof rawVelocityTo_ms === 'function') {
        this.velX = rawVelocityTo_ms(moveU);
        this.velY = rawVelocityTo_ms(moveV);
      } else {
        this.velX = moveU * ch;
        this.velY = moveV * ch;
      }
      this.throttle = clamp(targetMps / CRUISE_SPEED_MPS, 0.15, 1);
      this.n1 = 0.35 + this.throttle * 0.55;

      const stepDist = Math.sqrt(moveU * moveU + moveV * moveV) * iters;
      const capture = Math.max(4, stepDist * 1.35);
      // Were we already flying the final leg before any index bump this frame?
      const onFinalLeg = this._pathIndex >= lastIdx;

      if (!onFinalLeg && dist < capture) {
        this._pathIndex++;
      } else if (!onFinalLeg && dist < capture * 2.5) {
        if (moveU * dx + moveV * dy < 0)
          this._pathIndex++;
      }

      // Despawn only at the destination airport. Capturing a mid-route node
      // advances onto lastIdx while `dist` is still the mid-node distance —
      // that must not count as a landing.
      if (onFinalLeg && dist < 6) {
        this.destroy();
        return;
      }

      // Crash only on real terrain contact — never mid-air from noisy wall reads
      if (this._grace <= 0) {
        const inGround = atm.wallAir === 0 && atm.radarAlt < 8;
        const skimCrash = atm.radarAlt < 2 && this._state !== 'land' && this._state !== 'takeoff';
        if (inGround || skimCrash) {
          this._crash();
          return;
        }
      }
      if (this._stress >= STRESS_CRASH) {
        this._crash();
        return;
      }

      this._syncMetersFromCells();
    }

    _crash() {
      if (!this._alive) return;
      this._state = 'crash';
      this._syncMetersFromCells();
      applyCrashBurst(this._x, this._y);
      this.destroy();
    }

    _planePixelSize() {
      const ch = typeof cellHeight === 'number' ? cellHeight : 50;
      // Flight-mode A380 uses scaleMult = 60/cellHeight; ~72 m long on screen
      const lenCells = 72 / ch;
      if (typeof simToScreenX === 'function') {
        const a = simToScreenX(this._x);
        const b = simToScreenX(this._x + lenCells);
        return clamp(Math.abs(b - a), 48, 480);
      }
      return 140;
    }

    updateCanvas() {
      if (!this._alive) return;
      const pxSize = this._planePixelSize();
      const w = Math.ceil(pxSize * 1.4);
      const h = Math.ceil(pxSize * 0.7);
      if (this._canvas.width !== w || this._canvas.height !== h) {
        this._canvas.width = w;
        this._canvas.height = h;
        this._width = w;
        this._height = h;
      }
      const screenX = simToScreenX(this._x) - w / 2;
      const screenY = simToScreenY(this._y) - h / 2;
      this._mainDiv.style.left = screenX + 'px';
      this._mainDiv.style.top = screenY + 'px';

      const c = this._c;
      c.clearRect(0, 0, w, h);
      c.save();
      c.translate(w / 2, h / 2);
      // Align sprite with velocity: +angle = nose up in sim (Y up).
      // Canvas Y is down, so left-facing uses -angle, right-facing uses +angle.
      const faceLeft = this.directionIsLeft;
      c.rotate(faceLeft ? -this.angle : this.angle);

      const img = faceLeft ? a380ImgL : a380ImgR;
      const iw = pxSize;
      const ih = img && img.naturalWidth > 0
        ? pxSize * (img.naturalHeight / img.naturalWidth)
        : pxSize * 0.4;

      if (a380ImagesReady && img && img.complete && img.naturalWidth > 0) {
        c.globalAlpha = this._state === 'distressed' ? 0.88 : 1;

        // Gear only when clearly extended (avoid mid-cruise gear crumbs looking like debris)
        if (this.gearExtPos < 1.5 && a380GearImg && a380GearImg.complete && a380GearImg.naturalWidth > 0) {
          const gearDrop = (1.5 - this.gearExtPos) * 0.05 * ih;
          const gw = iw * 0.5;
          const gh = ih * 0.45;
          c.globalAlpha = 0.95;
          if (faceLeft)
            c.drawImage(a380GearImg, -iw * 0.2, ih * 0.12 + gearDrop, gw, gh);
          else {
            c.save();
            c.scale(-1, 1);
            c.drawImage(a380GearImg, -iw * 0.2, ih * 0.12 + gearDrop, gw, gh);
            c.restore();
          }
          c.globalAlpha = this._state === 'distressed' ? 0.88 : 1;
        }

        if (this._smoke > 0.1) {
          c.fillStyle = 'rgba(30,30,30,' + Math.min(0.65, this._smoke) + ')';
          c.beginPath();
          c.arc(faceLeft ? iw * 0.32 : -iw * 0.32, -ih * 0.05, 5 + this._smoke * 10, 0, Math.PI * 2);
          c.fill();
        }

        c.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      } else {
        c.fillStyle = this._state === 'distressed' ? '#c44' : '#cfd8e3';
        c.scale(faceLeft ? 1 : -1, 1);
        c.beginPath();
        c.ellipse(0, 0, pxSize * 0.45, pxSize * 0.08, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }

    destroy() {
      this._alive = false;
      if (this._mainDiv) this._mainDiv.remove();
      const idx = trafficPlanes.indexOf(this);
      if (idx >= 0) trafficPlanes.splice(idx, 1);
    }

    getState() {
      return {
        id: this.id,
        x: this._x,
        y: this._y,
        posX: this.posX,
        posY: this.posY,
        velX: this.velX,
        velY: this.velY,
        angle: this.angle,
        state: this._state,
        stress: this._stress,
        heading: this.directionIsLeft ? -1 : 1,
        pitch: this.angle,
        smoke: this._smoke,
        gearExtPos: this.gearExtPos,
        directionIsLeft: this.directionIsLeft,
        fromId: this.fromId,
        toId: this.toId,
        routeId: this.routeId,
        cruiseAltM: this._cruiseAltM,
        pathIndex: this._pathIndex,
      };
    }

    applyRemoteState(s) {
      if (!s) return;
      if (s.x != null) this._x = s.x;
      else if (s.posX != null) {
        const ch = typeof cellHeight === 'number' ? cellHeight : 50;
        this._x = s.posX / ch;
      }
      if (s.y != null) this._y = s.y;
      else if (s.posY != null) {
        const ch = typeof cellHeight === 'number' ? cellHeight : 50;
        this._y = s.posY / ch;
      }
      if (s.velX != null) this.velX = s.velX;
      if (s.velY != null) this.velY = s.velY;
      if (s.angle != null) this.angle = s.angle;
      this._state = s.state || this._state;
      this._stress = s.stress != null ? s.stress : this._stress;
      this._smoke = s.smoke != null ? s.smoke : this._smoke;
      if (s.gearExtPos != null) this.gearExtPos = s.gearExtPos;
      if (s.directionIsLeft != null) this.directionIsLeft = !!s.directionIsLeft;
      if (s.pathIndex != null) this._pathIndex = s.pathIndex;
      this._syncMetersFromCells();
    }
  }

  // ─── Manager API ──────────────────────────────────────────────────────────

  function placeAirport(simX, simY, opts) {
    const ap = new Airport(simX, simY, opts);
    airports.push(ap);
    return ap;
  }

  function clearAll() {
    for (let i = trafficPlanes.length - 1; i >= 0; i--)
      trafficPlanes[i].destroy();
    for (let i = flightRoutes.length - 1; i >= 0; i--)
      flightRoutes[i].destroy();
    for (let i = airports.length - 1; i >= 0; i--)
      airports[i].destroy();
    routePickFromId = null;
    draftWaypoints = [];
    selectedRouteId = null;
    dragState = null;
    lastInfraSig = '';
  }

  function step(simIters) {
    if (typeof guiControls !== 'undefined' && guiControls.airTrafficEnabled === false)
      return;

    // Peers: don't simulate spawn/physics; they get state from snapshots
    const isPeerOnly = typeof multiplayerPeerMode !== 'undefined' && multiplayerPeerMode
      && !(typeof multiplayerHostMode !== 'undefined' && multiplayerHostMode);
    if (isPeerOnly) return;

    // Same contract as WeatherBalloon.step(numSimIters)
    const iters = Math.max(1, simIters || 1);
    const dtSec = (typeof timePerIteration === 'number' ? timePerIteration : 0.00008) * 3600 * iters;
    const freqMult = (typeof guiControls !== 'undefined' && guiControls.airTrafficFreqMult != null)
      ? guiControls.airTrafficFreqMult : 1;
    const maxPlanes = Math.min(
      MAX_TRAFFIC_PLANES_HARD,
      (typeof guiControls !== 'undefined' && guiControls.airTrafficMaxPlanes != null)
        ? guiControls.airTrafficMaxPlanes : 24
    );

    for (let i = 0; i < flightRoutes.length; i++)
      flightRoutes[i].tickSpawn(dtSec, freqMult, maxPlanes);

    for (let i = trafficPlanes.length - 1; i >= 0; i--)
      trafficPlanes[i].step(iters);
  }

  function drawRoutePolyline(ctx, pts, strokeStyle, lineWidth, dashed) {
    if (!pts || pts.length < 2) return;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    if (dashed) ctx.setLineDash([8, 6]);
    else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(simToScreenX(pts[0].x), simToScreenY(pts[0].y));
    for (let i = 1; i < pts.length; i++)
      ctx.lineTo(simToScreenX(pts[i].x), simToScreenY(pts[i].y));
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrow at end
    const n = pts.length;
    const x0 = simToScreenX(pts[n - 2].x);
    const y0 = simToScreenY(pts[n - 2].y);
    const x1 = simToScreenX(pts[n - 1].x);
    const y1 = simToScreenY(pts[n - 1].y);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    ctx.fillStyle = strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 9 * Math.cos(ang - 0.4), y1 - 9 * Math.sin(ang - 0.4));
    ctx.lineTo(x1 - 9 * Math.cos(ang + 0.4), y1 - 9 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
  }

  function updateOverlays() {
    ensureRouteOverlay();
    const main = typeof canvas !== 'undefined' ? canvas : null;
    if (main && routeOverlayCanvas) {
      if (routeOverlayCanvas.width !== main.width || routeOverlayCanvas.height !== main.height) {
        routeOverlayCanvas.width = main.width;
        routeOverlayCanvas.height = main.height;
      }
      const rect = main.getBoundingClientRect();
      routeOverlayCanvas.style.left = rect.left + 'px';
      routeOverlayCanvas.style.top = rect.top + 'px';
      routeOverlayCanvas.style.width = rect.width + 'px';
      routeOverlayCanvas.style.height = rect.height + 'px';
    }

    const showRoutes = displayFlightRoutes
      && (typeof guiControls === 'undefined' || guiControls.airTrafficShowRoutes !== false);
    const ctx = routeOverlayCtx;
    if (ctx && routeOverlayCanvas) {
      ctx.clearRect(0, 0, routeOverlayCanvas.width, routeOverlayCanvas.height);
      if (showRoutes) {
        for (let i = 0; i < flightRoutes.length; i++) {
          const r = flightRoutes[i];
          if (!r.active && selectedRouteId !== r.id) continue;
          const pts = r.getPathPoints();
          const selected = selectedRouteId === r.id;
          const color = selected ? 'rgba(255,200,80,0.9)' : (r.active ? 'rgba(120,180,255,0.7)' : 'rgba(120,120,140,0.4)');
          drawRoutePolyline(ctx, pts, color, selected ? 2.5 : 1.5, true);

          // Waypoint handles (numbered path nodes)
          for (let w = 0; w < r.waypoints.length; w++) {
            const wx = simToScreenX(r.waypoints[w].x);
            const wy = simToScreenY(r.waypoints[w].y);
            ctx.fillStyle = selected ? '#ffcc44' : '#8ab4ff';
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(wx, wy, selected ? 7 : 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#111';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(w + 1), wx, wy);
          }

          // Frequency label mid-path
          if (pts.length >= 2) {
            const mid = pts[Math.floor(pts.length / 2)];
            ctx.fillStyle = selected ? '#ffcc44' : 'rgba(180,210,255,0.85)';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(r.freqPerMin.toFixed(1) + '/min', simToScreenX(mid.x), simToScreenY(mid.y) - 10);
          }
        }

        // Draft path while creating
        if (routePickFromId) {
          const from = findAirportById(routePickFromId);
          if (from) {
            const draftPts = [{ x: from.getXpos(), y: airportAirY(from) }]
              .concat(draftWaypoints);
            if (draftPts.length >= 2)
              drawRoutePolyline(ctx, draftPts, 'rgba(255,220,100,0.85)', 2, true);
            else {
              ctx.fillStyle = '#ffcc44';
              ctx.beginPath();
              ctx.arc(simToScreenX(from.getXpos()), simToScreenY(airportAirY(from)), 5, 0, Math.PI * 2);
              ctx.fill();
            }
            for (let w = 0; w < draftWaypoints.length; w++) {
              ctx.fillStyle = '#ffcc44';
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = 1.5;
              const wx = simToScreenX(draftWaypoints[w].x);
              const wy = simToScreenY(draftWaypoints[w].y);
              ctx.beginPath();
              ctx.arc(wx, wy, 6, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = '#111';
              ctx.font = 'bold 10px Arial';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(String(w + 1), wx, wy);
            }
            ctx.fillStyle = 'rgba(255,220,100,0.95)';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText('Click sky to add path nodes, then click destination airport', 12, 22);
          }
        }
      }
    }

    if (displayAirports) {
      for (let i = 0; i < airports.length; i++)
        airports[i].updateCanvas();
    } else {
      for (let i = 0; i < airports.length; i++)
        airports[i]._mainDiv.style.display = 'none';
    }

    const showPlanes = typeof guiControls === 'undefined' || guiControls.airTrafficEnabled !== false;
    if (showPlanes) {
      for (let i = 0; i < trafficPlanes.length; i++)
        trafficPlanes[i].updateCanvas();
    }
  }

  function buildSavedForGuiControls() {
    if (airports.length === 0 && flightRoutes.length === 0) return null;
    return {
      airports: airports.map(a => ({
        x: a.getXpos(),
        y: a.getYpos(),
        ...a.getSettings(),
      })),
      routes: flightRoutes.map(r => r.getSettings()),
    };
  }

  function restoreFromGuiControls() {
    const saved = typeof guiControls !== 'undefined' ? guiControls.__savedAviationTraffic : null;
    if (!saved || !Array.isArray(saved.airports)) return;
    syncInfrastructure(saved);
    if (typeof guiControls !== 'undefined')
      delete guiControls.__savedAviationTraffic;
  }

  function infraSignature(data) {
    if (!data) return '';
    const ap = (data.airports || []).map(a => a.id + ':' + a.x + ',' + a.y + ',' + a.freqPerMin + ',' + a.active).join('|');
    const rt = (data.routes || []).map(r => {
      const wps = (r.waypoints || []).map(w => Math.round(w.x) + ',' + Math.round(w.y)).join(';');
      return r.id + ':' + r.fromId + '>' + r.toId + ',' + r.active + ',' + r.freqPerMin + ',' + wps;
    }).join('|');
    return ap + '#' + rt;
  }

  function syncInfrastructure(data) {
    if (!data || !Array.isArray(data.airports)) return;
    const sig = infraSignature(data);
    if (sig === lastInfraSig && airports.length === data.airports.length) {
      for (let i = 0; i < data.airports.length; i++) {
        const e = data.airports[i];
        const ap = e && e.id ? findAirportById(e.id) : null;
        if (ap) ap.setSettings(e);
      }
      if (Array.isArray(data.routes)) {
        for (let i = 0; i < data.routes.length; i++) {
          const e = data.routes[i];
          const r = e && e.id ? findRouteById(e.id) : null;
          if (r) r.setSettings(e);
        }
      }
      return;
    }
    lastInfraSig = sig;

    clearAll();
    let maxAp = 0;
    let maxRt = 0;
    for (let i = 0; i < data.airports.length; i++) {
      const e = data.airports[i];
      if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
      placeAirport(e.x, e.y, {
        id: e.id,
        name: e.name,
        freqPerMin: e.freqPerMin,
        cruiseAltM: e.cruiseAltM,
        active: e.active,
        paintRunway: false,
      });
      if (e.id && typeof e.id === 'string') {
        const n = parseInt(e.id.replace(/\D/g, ''), 10);
        if (n > maxAp) maxAp = n;
      }
    }
    if (Array.isArray(data.routes)) {
      for (let i = 0; i < data.routes.length; i++) {
        const e = data.routes[i];
        if (!e || !e.fromId || !e.toId) continue;
        if (!findAirportById(e.fromId) || !findAirportById(e.toId)) continue;
        flightRoutes.push(new FlightRoute(e.fromId, e.toId, e));
        const created = flightRoutes[flightRoutes.length - 1];
        // Lift any legacy underground nodes (old y-down math) above the airports
        const a = findAirportById(created.fromId);
        const b = findAirportById(created.toId);
        if (a && b) {
          const minSurf = Math.min(a.getYpos(), b.getYpos());
          for (let wi = 0; wi < created.waypoints.length; wi++) {
            if (created.waypoints[wi].y < minSurf + 2) {
              const cruise = created.cruiseAltM != null ? created.cruiseAltM : a.getCruiseAltM();
              created.waypoints[wi].y = altToSimY(cruise * 0.6, minSurf);
            }
          }
        }
        if (created.waypoints.length === 0)
          created.ensureDefaultWaypoints();
        if (e.id && typeof e.id === 'string') {
          const n = parseInt(e.id.replace(/\D/g, ''), 10);
          if (n > maxRt) maxRt = n;
        }
      }
    }
    nextAirportId = Math.max(nextAirportId, maxAp + 1);
    nextRouteId = Math.max(nextRouteId, maxRt + 1);
  }

  function buildTrafficStateForSync() {
    return trafficPlanes.map(p => p.getState());
  }

  function applyTrafficStateFromSync(states) {
    if (!Array.isArray(states)) return;
    const byId = {};
    for (let i = 0; i < trafficPlanes.length; i++)
      byId[trafficPlanes[i].id] = trafficPlanes[i];

    const seen = {};
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      if (!s || s.id == null) continue;
      seen[s.id] = true;
      let p = byId[s.id];
      if (!p) {
        const fromAp = findAirportById(s.fromId) || {
          id: s.fromId || 'remote',
          getXpos: () => s.x,
          getYpos: () => s.y + 2,
        };
        const toAp = findAirportById(s.toId) || {
          id: s.toId || 'remote',
          getXpos: () => s.x,
          getYpos: () => s.y + 2,
        };
        p = new TrafficPlane(fromAp, toAp, { id: s.routeId }, s.cruiseAltM || 3500);
        p.id = s.id;
        trafficPlanes.push(p);
      }
      p.applyRemoteState(s);
    }
    for (let i = trafficPlanes.length - 1; i >= 0; i--) {
      if (!seen[trafficPlanes[i].id])
        trafficPlanes[i].destroy();
    }
  }

  function handleToolClick(tool, simX, simY) {
    if (tool === 'TOOL_AIRPORT') {
      placeAirport(simX, simY);
      return true;
    }
    if (tool === 'TOOL_FLIGHT_ROUTE') {
      tryPlaceOrSelectRoute(simX, simY);
      return true;
    }
    return false;
  }

  function setDisplayAirports(v) { displayAirports = !!v; }
  function setDisplayFlightRoutes(v) { displayFlightRoutes = !!v; }

  function getAirports() { return airports; }
  function getFlightRoutes() { return flightRoutes; }
  function getTrafficPlanes() { return trafficPlanes; }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  global.AviationTraffic = {
    Airport,
    FlightRoute,
    TrafficPlane,
    placeAirport,
    clearAll,
    step,
    updateOverlays,
    buildSavedForGuiControls,
    restoreFromGuiControls,
    syncInfrastructure,
    buildTrafficStateForSync,
    applyTrafficStateFromSync,
    handleToolClick,
    findNearestAirport,
    setDisplayAirports,
    setDisplayFlightRoutes,
    getAirports,
    getFlightRoutes,
    getTrafficPlanes,
    paintRunwayStrip,
    paintAirportInfrastructure,
    applyCrashBurst,
  };
})(typeof window !== 'undefined' ? window : this);
