#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform vec3 view;
uniform vec4 cursor;
uniform vec2 aspectRatios;
uniform float Xmult;

uniform sampler2D baseTexture;
uniform sampler2D waterTexture;
uniform isampler2D wallTexture;
uniform sampler2D colorScalesTex;
uniform sampler2D precipFeedbackTexture;

uniform vec2  radarPos;
uniform float radarRange;
uniform int   productType;
uniform float opacity;
uniform int   colorScaleColumn;
uniform int   colorScaleStops;
uniform float radarResolution;

out vec4 fragmentColor;

// Stepped (pixelated) color scale - no interpolation between stops
vec3 sampleColorScaleStepped(float t)
{
  int idx = clamp(int(t * float(colorScaleStops)), 0, colorScaleStops - 1);
  return texelFetch(colorScalesTex, ivec2(colorScaleColumn, idx), 0).rgb;
}

void main()
{
  float fx      = mod(fragCoord.x, resolution.x);
  vec2  cellPos = vec2(fx, fragCoord.y);

  vec2  delta = cellPos - radarPos;
  float dist  = length(delta);
  float angle = atan(delta.y, delta.x);

  if (dist > radarRange || dist < 0.5) discard;

  float distFrac = dist / radarRange;

  // Polar range-gate snapping — same for all products for visual consistency
  float resMult   = 1.0 / max(radarResolution, 0.1);
  float rangeStep = max(0.01, distFrac * distFrac * 3.0 * resMult * (radarRange / 400.0));
  float azStep    = max(0.001, 0.03 * resMult * (radarRange / 400.0));

  float snappedDist  = (floor(dist  / rangeStep + 0.5)) * rangeStep;
  float snappedAngle = (floor(angle / azStep    + 0.5)) * azStep;

  vec2 snappedCell = radarPos + vec2(cos(snappedAngle), sin(snappedAngle)) * snappedDist;
  snappedCell.x    = mod(snappedCell.x, resolution.x);
  vec2 snappedTC   = clamp(snappedCell * texelSize,
                           texelSize * 0.5, vec2(1.0) - texelSize * 0.5);

  ivec4 wallData = texture(wallTexture, snappedTC);

  // Grey land background, discard underground
  if (wallData[1] == 0) {
    if (wallData[0] != 0) {
      fragmentColor = vec4(0.25, 0.25, 0.25, 0.5);
    } else {
      discard;
    }
    return;
  }

  vec4 precipFeedback = texture(precipFeedbackTexture, snappedTC);
  vec4 waterData      = texture(waterTexture,          snappedTC);
  vec4 baseData       = texture(baseTexture,           snappedTC);

  vec3  color        = vec3(0.0);
  float pixelOpacity = opacity;

  // Grid-based precipitation mass (smooth, no particle artifacts)
  float gridPrecip = waterData[2];

  if (productType == 0) {
    // --- Reflectivity ---
    float dBZ = 45.0 + 10.0 * log(max(gridPrecip * 30.0, 1e-9)) / log(10.0);
    dBZ = clamp(dBZ, 0.0, 85.0);
    if (dBZ < 1.0) discard;

    if (dBZ < 5.0) {
      color        = vec3(0.45, 0.82, 1.0);
      pixelOpacity *= smoothstep(1.0, 5.0, dBZ);
    } else {
      color = sampleColorScaleStepped(dBZ / 85.0);
      if (dBZ < 25.0)
        color = mix(vec3(0.45, 0.82, 1.0), color, smoothstep(5.0, 25.0, dBZ));
    }

  } else if (productType == 1) {
    // --- Radial Velocity ---

    // Use the original angle (before snapping) for radial direction
    // to avoid wrap-around artifacts
    vec2 radialDir = vec2(cos(angle), sin(angle));

    float radialVel = dot(baseData.xy, radialDir);
    // maxRaw = 0.15 maps ~20 m/s to full scale (138.9 m/s per raw unit)
    float maxRaw = 0.15;
    // t=0.5 = zero velocity (grey at center stop 16 of 33)
    float t = clamp((radialVel / maxRaw + 1.0) * 0.5, 0.0, 1.0);

    // Skip near-zero air velocity with no precip to avoid noise
    if (gridPrecip < 0.0001 && abs(radialVel) < maxRaw * 0.05) discard;

    color = sampleColorScaleStepped(t);
    // Precip gets full opacity; clear-air gets reduced opacity based on wind speed
    float airOpacity = clamp(abs(radialVel) / (maxRaw * 0.3), 0.0, 1.0) * 0.45;
    pixelOpacity *= (gridPrecip > 0.0001) ? min(gridPrecip * 300.0, 1.0) : airOpacity;

  } else if (productType == 3) {
    // --- Echo Tops ---
    // Find the highest altitude with significant precipitation at this column.
    // Ray-march upward from ground to top of sim, track highest echo level.
    float echoTopFrac = 0.0; // normalized 0-1 height of highest echo
    float threshold = 0.0005;
    for (int step = 0; step < 300; step++) {
      float yFrac = float(step) / 300.0;
      vec2 sampleTC = vec2(snappedTC.x, yFrac);
      ivec4 wData = texture(wallTexture, sampleTC);
      if (wData[1] == 0) continue; // skip wall/ground cells
      vec4 wSample = texture(waterTexture, sampleTC);
      if (wSample[2] > threshold) echoTopFrac = yFrac;
    }
    if (echoTopFrac < 0.001) discard;
    // Map height to color scale — sim top (~1.0) = 60 kft, scale linearly
    float t = clamp(echoTopFrac, 0.0, 1.0);
    color = sampleColorScaleStepped(t);
    pixelOpacity *= smoothstep(0.01, 0.05, echoTopFrac);

  } else {
    // CC is high for uniform particles (pure rain or pure snow),
    // low for mixed phase, large hail, or non-meteorological targets.
    float precip = gridPrecip;
    if (precip < 0.0001) discard;

    // Temperature at this cell (potential T → real T approximation)
    float texY   = snappedTC.y;
    float dryLapseApprox = 120.0; // typical total lapse (K) across sim height
    float tempK  = baseData[3] - texY * dryLapseApprox;
    float tempC  = tempK - 273.15;

    // Ice fraction: 0 = pure rain (>5°C), 1 = pure ice (<-20°C)
    float iceFrac = clamp((-tempC - 5.0) / 25.0, 0.0, 1.0);

    // Mixed phase penalty: CC drops near 0°C melting layer
    float mixedPhase = 1.0 - abs(iceFrac - 0.5) * 2.0; // peaks at 50% mixed
    float cc = 1.0 - mixedPhase * 0.35;

    // Large hail: high mass near freezing → lower CC
    float hailFactor = clamp(precip * 8.0, 0.0, 1.0)
                     * clamp(1.0 - abs(tempC + 5.0) / 15.0, 0.0, 1.0);
    cc -= hailFactor * 0.25;

    // Non-met / very light precip → lower CC
    cc -= clamp(1.0 - precip * 500.0, 0.0, 0.2);

    cc = clamp(cc, 0.2, 1.05);

    // Map 0.2–1.05 → 0–1 for color scale
    float t = clamp((cc - 0.2) / 0.85, 0.0, 1.0);
    color = sampleColorScaleStepped(t);
    pixelOpacity *= min(gridPrecip * 300.0, 1.0);
  }

  float edgeFade = pow(max(1.0 - distFrac, 0.0), 0.3);
  fragmentColor  = vec4(color, pixelOpacity * edgeFade);
}
