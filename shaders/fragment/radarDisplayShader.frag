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

vec3 sampleColorScale(float t)
{
  float fIdx = clamp(t, 0.0, 1.0) * float(colorScaleStops - 1);
  int   lo   = clamp(int(fIdx),     0, colorScaleStops - 1);
  int   hi   = clamp(int(fIdx) + 1, 0, colorScaleStops - 1);
  vec3  cLo  = texelFetch(colorScalesTex, ivec2(colorScaleColumn, lo), 0).rgb;
  vec3  cHi  = texelFetch(colorScalesTex, ivec2(colorScaleColumn, hi), 0).rgb;
  return mix(cLo, cHi, smoothstep(0.0, 1.0, fract(fIdx)));
}

void main()
{
  float fx      = mod(fragCoord.x, resolution.x);
  vec2  cellPos = vec2(fx, fragCoord.y);

  vec2  delta    = cellPos - radarPos;
  float dist     = length(delta);
  float angle    = atan(delta.y, delta.x);

  if (dist > radarRange || dist < 0.5) discard;

  float distFrac = dist / radarRange;

  // --- Polar range-gate snapping (same for all products for consistency) ---
  float resMult  = 1.0 / max(radarResolution, 0.1);
  float rangeStep = max(0.3, distFrac * distFrac * 3.0 * resMult * (radarRange / 400.0));
  float azStep    = max(0.008, 0.03 * resMult * (radarRange / 400.0));

  float snappedDist  = (floor(dist  / rangeStep + 0.5)) * rangeStep;
  float snappedAngle = (floor(angle / azStep    + 0.5)) * azStep;

  vec2 snappedCell = radarPos + vec2(cos(snappedAngle), sin(snappedAngle)) * snappedDist;
  snappedCell.x    = mod(snappedCell.x, resolution.x);
  vec2 snappedTC   = clamp(snappedCell * texelSize,
                           texelSize * 0.5, vec2(1.0) - texelSize * 0.5);

  ivec4 wallData = texture(wallTexture, snappedTC);

  // Show land as subtle grey background, discard underground cells
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

  if (productType == 0) {
    // --- Reflectivity ---
    float massScore = precipFeedback.r;
    float dBZ = 45.0 + 10.0 * log(max(massScore * 10.0, 1e-9)) / log(10.0);
    dBZ = clamp(dBZ, 0.0, 85.0);
    if (dBZ < 1.0) discard;

    float t = dBZ / 85.0;
    if (dBZ < 5.0) {
      color        = vec3(0.45, 0.82, 1.0);
      pixelOpacity *= smoothstep(1.0, 5.0, dBZ);
    } else {
      color = sampleColorScale(t);
      if (dBZ < 25.0)
        color = mix(vec3(0.45, 0.82, 1.0), color, smoothstep(5.0, 25.0, dBZ));
    }

  } else if (productType == 1) {
    // --- Radial Velocity (relative to radar position) ---
    // Unit vector from radar to sample cell
    vec2 radialDir = normalize(delta);

    // Wind velocity in sim units/iteration — convert to m/s
    // baseData.xy = raw velocity (cells/iteration)
    // rawVelocityTo_ms: vel * 3600 / cellHeight * timePerIteration (approx)
    // Use a simple scale factor matching the JS rawVelocityTo_ms
    const float velScale = 3600.0 * 0.00008; // timePerIteration * 3600
    // cellHeight varies but use a representative value; actual m/s = raw * 3600 / cellHeight * timePerIteration
    // We'll just use raw units scaled to a visible range
    float vx = baseData.x;
    float vy = baseData.y;

    // Radial component: dot product of wind with unit vector toward radar
    float radialVel = dot(vec2(vx, vy), radialDir);

    // Scale: map ±0.005 raw units to ±1 (typical max wind in sim)
    float maxRaw = 0.005;
    float t = clamp((radialVel / maxRaw + 1.0) * 0.5, 0.0, 1.0);

    // Only show where there's precipitation
    float massScore = precipFeedback.r;
    if (massScore < 0.0001) discard;

    color = sampleColorScale(t);
    pixelOpacity *= min(massScore * 200.0, 1.0); // fade in with precip intensity

  } else {
    // --- Correlation Coefficient ---
    // CC measures how uniform the particles are.
    // High CC (>0.97) = uniform rain drops
    // Low CC (<0.8)   = mixed phase, large hail, non-met
    // We derive CC from the ice/water ratio and particle size

    float water = waterData.r; // vapor+cloud
    float cloud = waterData.g; // cloud water
    float precip = precipFeedback.r; // precipitation mass

    if (precip < 0.0001) discard;

    // Ice fraction from precipitation feedback
    // precipFeedback: .r=mass, .g=heat, .b=vapor
    // Use temperature to estimate ice fraction
    float tempK = baseData[3]; // potential temperature (approx real T at low levels)
    float tempC = tempK - 273.15;

    // Ice fraction: 0=pure rain, 1=pure ice/snow
    float iceFrac = clamp(-tempC / 20.0, 0.0, 1.0);

    // CC is high for pure rain or pure snow, low for mixed phase
    // Mixed phase occurs near 0°C
    float mixedPhase = 1.0 - abs(iceFrac - 0.5) * 2.0; // peaks at 0.5 (mixed)
    float cc = 1.0 - mixedPhase * 0.4; // range ~0.6-1.0

    // Large hail: very high precip mass + near-freezing = lower CC
    float hailFactor = clamp(precip * 5.0, 0.0, 1.0) * clamp(1.0 - abs(tempC) / 10.0, 0.0, 1.0);
    cc -= hailFactor * 0.3;
    cc = clamp(cc, 0.2, 1.05);

    // Map 0.2-1.05 to 0-1 for color scale
    float t = clamp((cc - 0.2) / 0.85, 0.0, 1.0);
    color = sampleColorScale(t);
    pixelOpacity *= min(precip * 200.0, 1.0);
  }

  float edgeFade = pow(max(1.0 - distFrac, 0.0), 0.3);
  fragmentColor  = vec4(color, pixelOpacity * edgeFade);
}
