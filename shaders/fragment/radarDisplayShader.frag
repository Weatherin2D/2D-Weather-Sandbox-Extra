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

// Smooth interpolation between adjacent color scale stops
vec3 sampleColorScale(float dBZ)
{
  float normalized = clamp(dBZ / 85.0, 0.0, 1.0);
  float fIdx = normalized * float(colorScaleStops - 1);
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

  // --- Pure polar range-gate snapping ---
  // rangeStep: radial bin depth — tiny near radar, grows outward (arc-shaped bins)
  // azStep:    azimuth bin width in radians — fixed degrees, so arc width grows with dist
  //            This is exactly how real radar works: fixed angular resolution
  float resMult  = 1.0 / max(radarResolution, 0.1);

  // Range bins: start very small near radar, grow quadratically toward edge
  // Also scale with radarRange so large-range radars have coarser range resolution
  float rangeStep = max(0.3, distFrac * distFrac * 3.0 * resMult * (radarRange / 400.0));

  // Azimuth bins: fixed angular step (degrees), so arc width = dist * azDegStep
  // At dist=50 cells, azDegStep=0.06 rad → arc width = 3 cells (narrow near radar)
  // At dist=200 cells, same angle → arc width = 12 cells (wide at edge)
  // Scale azStep with radarRange so large-range radars get coarser angular resolution
  float azStep = max(0.008, 0.03 * resMult * (radarRange / 400.0));

  // Snap in polar coordinates only — this gives proper arc-shaped bins
  float snappedDist  = (floor(dist  / rangeStep + 0.5)) * rangeStep;
  float snappedAngle = (floor(angle / azStep    + 0.5)) * azStep;

  // Convert back to Cartesian for texture sampling
  vec2 snappedCell = radarPos + vec2(cos(snappedAngle), sin(snappedAngle)) * snappedDist;
  snappedCell.x    = mod(snappedCell.x, resolution.x);
  vec2 snappedTC   = clamp(snappedCell * texelSize,
                           texelSize * 0.5, vec2(1.0) - texelSize * 0.5);

  ivec4 wallData = texture(wallTexture, snappedTC);

  // Show land as subtle grey background, discard underground cells
  if (wallData[1] == 0) {
    if (wallData[0] != 0) {
      // surface cell (land/urban/water/etc) - draw grey
      fragmentColor = vec4(0.25, 0.25, 0.25, 0.5);
    } else {
      discard; // underground
    }
    return;
  }

  vec4 precipFeedback = texture(precipFeedbackTexture, snappedTC);
  vec4 waterData      = texture(waterTexture,          snappedTC);
  vec4 baseData       = texture(baseTexture,           snappedTC);

  vec3  color        = vec3(0.0);
  float pixelOpacity = opacity;

  if (productType == 0) {

    float massScore = precipFeedback.r;
    // dBZ = 10*log10(massScore * 1e5) = 50 + 10*log10(massScore)
    // Shift up by +45 so colors don't go green until genuinely heavy rain
    // massScore typical range: ~0.0001 (drizzle) to ~5.0 (extreme hail)
    // Target: drizzle->~15dBZ (light blue), moderate->~35dBZ (green),
    //         heavy->~50dBZ (yellow/orange), extreme->~70dBZ (red/white)
    // Formula: dBZ = 35 + 10*log10(massScore * 10) = 45 + 10*log10(massScore)
    float dBZ = 45.0 + 10.0 * log(max(massScore * 10.0, 1e-9)) / log(10.0);
    dBZ = clamp(dBZ, 0.0, 85.0);

    if (dBZ < 1.0) discard;

    if (dBZ < 5.0) {
      // 1-5 dBZ: light blue haze fading in
      color        = vec3(0.45, 0.82, 1.0);
      pixelOpacity *= smoothstep(1.0, 5.0, dBZ);
    } else {
      color = sampleColorScale(dBZ);
      // Soft blue outer halo for 5-25 dBZ (matches reference image)
      if (dBZ < 25.0) {
        color = mix(vec3(0.45, 0.82, 1.0), color, smoothstep(5.0, 25.0, dBZ));
      }
    }

  } else if (productType == 1) {

    float radialVel = baseData.r * cos(angle) + baseData.g * sin(angle);
    float t = clamp(abs(radialVel) * 1000.0 / 50.0, 0.0, 1.0);
    color = radialVel > 0.0 ? mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), t)
                            : mix(vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), t);

  } else {

    float iceFraction = waterData.g / (waterData.r + waterData.g + 0.001);
    float t = clamp((1.0 - iceFraction * 0.3 - 0.5) / 0.5, 0.0, 1.0);
    color = mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), t);

  }

  float edgeFade = pow(max(1.0 - distFrac, 0.0), 0.3);
  fragmentColor  = vec4(color, pixelOpacity * edgeFade);
}
