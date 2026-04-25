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
uniform sampler2D precipDepositionTexture;

uniform vec2  radarPos;
uniform float radarRange;
uniform int   productType;
uniform float opacity;
uniform int   colorScaleColumn;
uniform int   colorScaleStops;
uniform float radarResolution;
uniform float sensitivity;
uniform bool  dbzOpacityEnabled;
uniform float dbzOpacityStrength;

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
  vec2 precipDeposition = texture(precipDepositionTexture, snappedTC).xy;

  vec3  color        = vec3(0.0);
  float pixelOpacity = opacity;

  // Grid-based precipitation mass (smooth, no particle artifacts)
  float gridPrecip = waterData[2];
  // Dust/pollution (smoke) contribution - reflects less than water droplets
  float dust = waterData[3] * 0.15; // Reduced coefficient for weaker dust reflectivity
  // Combine precipitation and dust for total radar-reflective mass
  float totalReflectiveMass = (gridPrecip + dust) * sensitivity;

  if (productType == 0) {
    // --- Reflectivity ---
    float dBZ = 45.0 + 10.0 * log(max(totalReflectiveMass * 30.0, 1e-9)) / log(10.0);
    dBZ = clamp(dBZ, 0.0, 85.0);
    if (dBZ < 1.0) discard;

    if (dBZ < 5.0) {
      color        = vec3(0.45, 0.82, 1.0);
      pixelOpacity *= smoothstep(1.0, 5.0, dBZ);
    } else {
      float t = smoothstep(0.0, 1.0, dBZ / 85.0);
      color = sampleColorScaleStepped(t);
      if (dBZ < 25.0)
        color = mix(vec3(0.45, 0.82, 1.0), color, smoothstep(5.0, 25.0, dBZ));
    }

    // Apply dBZ-based opacity scaling if enabled
    if (dbzOpacityEnabled) {
      float dbzOpacityFactor = smoothstep(0.0, 50.0, dBZ);
      dbzOpacityFactor = mix(1.0, dbzOpacityFactor, dbzOpacityStrength);
      pixelOpacity *= dbzOpacityFactor;
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

    // Skip near-zero air velocity with no precip/dust to avoid noise
    if (totalReflectiveMass < 0.0001 && abs(radialVel) < maxRaw * 0.05) discard;

    float tSmooth = smoothstep(0.0, 1.0, t);
    color = sampleColorScaleStepped(tSmooth);
    // Precip gets full opacity; clear-air gets reduced opacity based on wind speed
    float airOpacity = clamp(abs(radialVel) / (maxRaw * 0.3), 0.0, 1.0) * 0.45;
    pixelOpacity *= (totalReflectiveMass > 0.0001) ? min(totalReflectiveMass * 300.0, 1.0) : airOpacity;

  } else if (productType == 3) {
    // --- Echo Tops ---
    // Find the highest altitude with significant precipitation or dust at this column.
    // Ray-march upward from ground to top of sim, track highest echo level.
    float echoTopFrac = 0.0; // normalized 0-1 height of highest echo
    float threshold = 0.0005;
    for (int step = 0; step < 300; step++) {
      float yFrac = float(step) / 300.0;
      vec2 sampleTC = vec2(snappedTC.x, yFrac);
      ivec4 wData = texture(wallTexture, sampleTC);
      if (wData[1] == 0) continue; // skip wall/ground cells
      vec4 wSample = texture(waterTexture, sampleTC);
      // Consider both precipitation (channel 2) and dust (channel 3)
      float reflectiveMass = wSample[2] + wSample[3] * 0.15;
      if (reflectiveMass > threshold) echoTopFrac = yFrac;
    }
    if (echoTopFrac < 0.001) discard;
    // Map height to color scale — sim top (~1.0) = 60 kft, scale linearly
    float t = clamp(echoTopFrac, 0.0, 1.0);
    float tSmooth = smoothstep(0.0, 1.0, t);
    color = sampleColorScaleStepped(tSmooth);
    pixelOpacity *= smoothstep(0.01, 0.05, echoTopFrac);

  } else {
    // CC is high for uniform particles (pure rain or pure snow),
    // low for mixed phase, large hail, or non-meteorological targets.
    float precip = totalReflectiveMass;
    if (precip < 0.0001) discard;

    // Use actual droplet properties from precipitation system
    float totalMass = precipFeedback[0]; // Total mass from feedback
    float rainDeposition = precipDeposition.x; // Rain deposition
    float snowDeposition = precipDeposition.y; // Snow/ice deposition

    // Calculate actual ice mass fraction based on deposition
    float totalDeposition = rainDeposition + snowDeposition;
    float iceFrac = (totalDeposition > 0.0001) ? (snowDeposition / totalDeposition) : 0.0;

    // Droplet size factor: larger droplets have lower correlation coefficient
    // Use total mass as proxy for droplet size (larger mass = larger droplets)
    float dropletSize = totalMass;
    float sizeFactor = clamp(dropletSize * 10.0, 0.0, 1.0); // Scale factor for size effect

    // Base correlation coefficient: high for uniform particles
    float cc = 1.0;

    // Mixed phase penalty: CC drops when rain and ice are mixed
    // Pure rain (iceFrac ~ 0) or pure ice (iceFrac ~ 1) have high CC
    float mixedPhase = 1.0 - abs(iceFrac - 0.5) * 2.0; // peaks at 50% mixed
    cc -= mixedPhase * 0.35;

    // Droplet size penalty: larger droplets have lower CC
    // This accounts for the user's request to show different values based on droplet size
    cc -= sizeFactor * 0.2;

    // Ice mass effect: very high ice mass (solid ice) has different CC than liquid
    // Solid ice particles (high ice mass) have higher CC than mixed
    if (iceFrac > 0.8) {
      cc += 0.05; // Bonus for pure ice
    }

    // Position-based variation: use x and y position to add spatial variation
    // This accounts for the user's request to include y and x axis
    float posX = snappedCell.x / resolution.x;
    float posY = snappedCell.y / resolution.y;
    float positionFactor = (sin(posX * 10.0) + cos(posY * 10.0)) * 0.02;
    cc += positionFactor;

    // Non-met / very light precip → lower CC
    cc -= clamp(1.0 - precip * 500.0, 0.0, 0.2);

    cc = clamp(cc, 0.2, 1.05);

    // Map 0.2–1.05 → 0–1 for color scale
    float t = clamp((cc - 0.2) / 0.85, 0.0, 1.0);
    float tSmooth = smoothstep(0.0, 1.0, t);
    color = sampleColorScaleStepped(tSmooth);
    pixelOpacity *= min(totalReflectiveMass * 300.0, 1.0);
  }

  float edgeFade = pow(max(1.0 - distFrac, 0.0), 0.3);
  fragmentColor  = vec4(color, pixelOpacity * edgeFade);
}
