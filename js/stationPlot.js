/**
 * Synoptic station-model renderer (Weather Station 2).
 * Draws a WMO-style plot: sky-cover circle, wind barb, coded MSLP, weather, clouds.
 */
(function(global) {
  'use strict';

  var KT_PER_MS = 1.94384;
  var PLOT_R = 10;
  var STAFF_LEN = 38;
  var BARB_LEN = 13;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function pressureCode(hpa) {
    if (!Number.isFinite(hpa)) return '---';
    var tenths = Math.round(hpa * 10);
    var code = ((tenths % 1000) + 1000) % 1000;
    return String(code).padStart(3, '0');
  }

  function pressureTendLabel(hpa) {
    if (!Number.isFinite(hpa)) return null;
    var tenths = Math.round(hpa * 10);
    if (tenths === 0) return '0';
    var sign = tenths > 0 ? '+' : '-';
    return sign + String(Math.abs(tenths));
  }

  function msToKnots(ms) {
    return ms * KT_PER_MS;
  }

  function halo(ctx, drawFn) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.72)';
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawFn(ctx);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 1.45;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    drawFn(ctx);
    ctx.restore();
  }

  function drawSkyCover(ctx, x, y, r, oktas) {
    oktas = clamp(Math.round(Number(oktas) || 0), 0, 8);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (oktas <= 0)
      return;
    if (oktas === 1) {
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.85);
      ctx.lineTo(x, y + r * 0.85);
      ctx.stroke();
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 0.6, 0, Math.PI * 2);
    ctx.clip();

    if (oktas === 8) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (oktas === 7) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.moveTo(x + r * 0.15, y - r);
      ctx.lineTo(x + r, y - r);
      ctx.lineTo(x + r, y + r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    var span;
    if (oktas <= 3) span = Math.PI * 0.5;
    else if (oktas === 4) span = Math.PI * 0.7;
    else if (oktas === 5) span = Math.PI;
    else span = Math.PI * 1.5;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + span, false);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCalm(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawWindBarb(ctx, x, y, r, uMs, vMs) {
    var speed = Math.hypot(uMs || 0, vMs || 0);
    var kt = msToKnots(speed);
    if (!(kt >= 2.5) || speed < 1e-6) {
      drawCalm(ctx, x, y, r);
      return;
    }

    var rounded = Math.round(kt / 5) * 5;
    if (rounded < 5) rounded = 5;

    var pennants = Math.floor(rounded / 50);
    var rest = rounded % 50;
    var full = Math.floor(rest / 10);
    var half = rest % 10 >= 5 ? 1 : 0;

    // Staff points toward the direction the wind is coming FROM.
    // Sim +y is up; canvas +y is down, so from = (-u, v).
    var fromX = -(uMs || 0);
    var fromY = (vMs || 0);
    var len = Math.hypot(fromX, fromY) || 1;
    var dx = fromX / len;
    var dy = fromY / len;
    var startX = x + dx * (r + 1);
    var startY = y + dy * (r + 1);
    var endX = x + dx * (r + STAFF_LEN);
    var endY = y + dy * (r + STAFF_LEN);

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    var ang = Math.atan2(dy, dx);
    var barbAng = ang - Math.PI / 3;
    var bx = Math.cos(barbAng);
    var by = Math.sin(barbAng);
    var spacing = 6.2;
    var pos = r + STAFF_LEN;

    function attachAt() {
      return { x: x + dx * pos, y: y + dy * pos };
    }

    var i;
    for (i = 0; i < pennants; i++) {
      var p0 = attachAt();
      pos -= spacing * 0.85;
      var p1 = attachAt();
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p0.x + bx * BARB_LEN, p0.y + by * BARB_LEN);
      ctx.lineTo(p1.x, p1.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      pos -= spacing * 0.35;
    }
    for (i = 0; i < full; i++) {
      var f = attachAt();
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      ctx.lineTo(f.x + bx * BARB_LEN, f.y + by * BARB_LEN);
      ctx.stroke();
      pos -= spacing;
    }
    if (half) {
      if (pennants === 0 && full === 0)
        pos -= spacing * 0.55;
      var h = attachAt();
      ctx.beginPath();
      ctx.moveTo(h.x, h.y);
      ctx.lineTo(h.x + bx * BARB_LEN * 0.55, h.y + by * BARB_LEN * 0.55);
      ctx.stroke();
    }
  }

  function drawWeatherSymbol(ctx, x, y, kind) {
    if (!kind) return;
    ctx.save();
    ctx.translate(x, y);
    switch (kind) {
    case 'fog':
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(8, -4);
      ctx.moveTo(-8, 0);
      ctx.lineTo(8, 0);
      ctx.moveTo(-8, 4);
      ctx.lineTo(8, 4);
      ctx.stroke();
      break;
    case 'snow':
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 6);
      ctx.moveTo(-5.2, -3);
      ctx.lineTo(5.2, 3);
      ctx.moveTo(-5.2, 3);
      ctx.lineTo(5.2, -3);
      ctx.stroke();
      break;
    case 'rain':
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'drizzle':
      ctx.beginPath();
      ctx.arc(-1.5, -2, 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.2, -1);
      ctx.quadraticCurveTo(4, 1, 1.5, 5);
      ctx.stroke();
      break;
    case 'showers':
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(6, 5);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.stroke();
      break;
    case 'thunderstorm':
      ctx.beginPath();
      ctx.moveTo(-5, -7);
      ctx.lineTo(4, -7);
      ctx.lineTo(1, -1);
      ctx.lineTo(6, -1);
      ctx.lineTo(-2, 8);
      ctx.lineTo(0, 1);
      ctx.lineTo(-6, 1);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2, 4);
      ctx.lineTo(7, 9);
      ctx.stroke();
      break;
    default:
      break;
    }
    ctx.restore();
  }

  function drawHighCloud(ctx, x, y, amount) {
    if (!(amount > 0.04)) return;
    ctx.beginPath();
    if (amount > 0.45) {
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x + 6, y);
      ctx.quadraticCurveTo(x + 11, y - 6, x + 4, y - 7);
    } else if (amount > 0.18) {
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 4, y);
      ctx.quadraticCurveTo(x + 10, y - 5, x + 3, y - 6);
      ctx.moveTo(x - 2, y);
      ctx.quadraticCurveTo(x + 4, y - 5, x - 2, y - 6);
    } else {
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 4, y);
      ctx.quadraticCurveTo(x + 9, y - 5, x + 2, y - 6);
    }
    ctx.stroke();
  }

  function drawMidCloud(ctx, x, y, amount) {
    if (!(amount > 0.04)) return;
    ctx.beginPath();
    if (amount > 0.4) {
      ctx.moveTo(x - 7, y + 5);
      ctx.lineTo(x + 2, y - 5);
      ctx.moveTo(x - 3, y + 5);
      ctx.lineTo(x + 6, y - 5);
    } else if (amount > 0.18) {
      ctx.moveTo(x - 8, y);
      ctx.quadraticCurveTo(x, y - 8, x + 8, y);
    } else {
      ctx.moveTo(x - 6, y + 4);
      ctx.lineTo(x + 3, y - 5);
    }
    ctx.stroke();
  }

  function drawLowCloud(ctx, x, y, amount, weather) {
    if (!(amount > 0.04)) return;
    ctx.beginPath();
    if (weather === 'rain' || weather === 'snow' || weather === 'showers' || weather === 'thunderstorm') {
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x - 3, y);
      ctx.moveTo(x - 1, y);
      ctx.lineTo(x + 4, y);
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 10, y);
    } else if (amount > 0.5) {
      ctx.moveTo(x - 10, y);
      ctx.lineTo(x + 10, y);
    } else if (amount > 0.2) {
      ctx.moveTo(x - 8, y);
      ctx.quadraticCurveTo(x, y + 7, x + 8, y);
    } else {
      ctx.moveTo(x - 8, y);
      ctx.quadraticCurveTo(x, y - 7, x + 8, y);
    }
    ctx.stroke();
  }

  function draw(ctx, width, height, obs) {
    if (!ctx || !obs) return;
    var cx = width * 0.5;
    var cy = height * 0.5;
    var r = PLOT_R;

    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 13px Arial, sans-serif';

    halo(ctx, function(c) {
      drawSkyCover(c, cx, cy, r, obs.oktas);
      drawWindBarb(c, cx, cy, r, obs.windU, obs.windV);
      drawWeatherSymbol(c, cx - 28, cy + 1, obs.weather);
      drawHighCloud(c, cx + 2, cy - 28, obs.cloudHigh);
      drawMidCloud(c, cx - 22, cy - 22, obs.cloudMid);
      drawLowCloud(c, cx + 20, cy + 22, obs.cloudLow, obs.weather);
    });

    function label(text, lx, ly, fill) {
      if (text == null || text === '') return;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 3;
      ctx.fillStyle = fill || '#ffffff';
      ctx.fillText(String(text), lx, ly);
      ctx.restore();
    }

    if (obs.displaySunAndIR) {
      ctx.font = '11px Arial, sans-serif';
      label((Number.isFinite(obs.rh) ? obs.rh.toFixed(0) + '%' : ''), cx - 48, cy - 20, '#7fffff');
      label((Number.isFinite(obs.solarPower) ? obs.solarPower.toFixed(0) + ' W' : ''), cx - 48, cy + 18);
      label((Number.isFinite(obs.netIRpow) ? obs.netIRpow.toFixed(0) + ' IR' : ''), cx + 16, cy + 18);
    } else {
      label(obs.tempLabel, cx - 48, cy - 18);
      label(obs.dewLabel, cx - 48, cy + 20, '#7fffff');
      ctx.font = 'bold 12px Arial, sans-serif';
      label(pressureCode(obs.mslpHpa), cx + 16, cy - 20);
      ctx.font = '11px Arial, sans-serif';
      var tend = pressureTendLabel(obs.pressureTendHpa);
      if (tend)
        label(tend, cx + 16, cy - 4, '#ffd27a');
    }
  }

  var api = {
    draw: draw,
    pressureCode: pressureCode,
    pressureTendLabel: pressureTendLabel,
  };

  global.WeatherSandbox = global.WeatherSandbox || {};
  global.WeatherSandbox.stationPlot = api;
})(typeof window !== 'undefined' ? window : this);
