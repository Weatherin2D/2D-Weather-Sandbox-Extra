#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform vec2 resolution;
uniform vec2 texelSize;

const float dryLapse = 0.;

uniform float blockSize;
uniform float sensitivity;
uniform bool  dbzOpacityEnabled;
uniform float dbzOpacityStrength;

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

uniform vec3 view;
uniform vec4 cursor;

uniform sampler2D waterTexture;
uniform isampler2D wallTexture;
uniform sampler2D colorScalesTex;

uniform float opacity;
uniform int   colorScaleColumn;
uniform int   colorScaleStops;

vec3 sampleColorScaleStepped(float t)
{
  int idx = clamp(int(t * float(colorScaleStops)), 0, colorScaleStops - 1);
  return texelFetch(colorScalesTex, ivec2(colorScaleColumn, idx), 0).rgb;
}

void main()
{
  float fx      = mod(fragCoord.x, resolution.x);
  vec2  cellPos = vec2(fx, fragCoord.y);

  // Coarse block snapping for lower-quality nationwide coverage
  vec2 snappedCell = floor(cellPos / blockSize + 0.5) * blockSize;
  snappedCell.x    = mod(snappedCell.x, resolution.x);
  vec2 snappedTC   = clamp(snappedCell * texelSize,
                           texelSize * 0.5, vec2(1.0) - texelSize * 0.5);

  ivec4 wallData = texture(wallTexture, snappedTC);

  if (wallData[1] == 0) {
    if (wallData[0] != 0) {
      fragmentColor = vec4(0.25, 0.25, 0.25, 0.5);
    } else {
      fragmentColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
    drawCursor(cursor, view);
    return;
  }

  // Column-max reflectivity: scan upward through the atmosphere
  float maxReflectiveMass = 0.0;
  float threshold = 0.0003;
  int   stepCount = int(ceil(resolution.y / blockSize));
  stepCount = clamp(stepCount, 4, 64);

  for (int step = 0; step < 64; step++) {
    if (step >= stepCount) break;
    float yFrac = float(step) / float(max(stepCount - 1, 1));
    vec2 sampleTC = vec2(snappedTC.x, yFrac);
    ivec4 wData = texture(wallTexture, sampleTC);
    if (wData[1] == 0) continue;
    vec4 wSample = texture(waterTexture, sampleTC);
    float reflectiveMass = wSample[2] + wSample[3] * 0.15;
    maxReflectiveMass = max(maxReflectiveMass, reflectiveMass);
  }

  // Sensitivity scales echo strength (higher = brighter returns)
  float totalReflectiveMass = maxReflectiveMass * sensitivity;
  float dBZ = 45.0 + 10.0 * log(max(totalReflectiveMass * 30.0, 1e-9)) / log(10.0);
  dBZ = clamp(dBZ, 0.0, 85.0);

  if (dBZ < 1.0) {
    fragmentColor = vec4(0.0, 0.0, 0.0, 1.0);
    drawCursor(cursor, view);
    return;
  }

  vec3  color        = vec3(0.0);
  float pixelOpacity = opacity;

  if (dBZ < 5.0) {
    color        = vec3(0.45, 0.82, 1.0);
    pixelOpacity *= smoothstep(1.0, 5.0, dBZ);
  } else {
    float t = smoothstep(0.0, 1.0, dBZ / 85.0);
    color = sampleColorScaleStepped(t);
    if (dBZ < 25.0)
      color = mix(vec3(0.45, 0.82, 1.0), color, smoothstep(5.0, 25.0, dBZ));
  }

  if (dbzOpacityEnabled) {
    float dbzOpacityFactor = smoothstep(0.0, 50.0, dBZ);
    dbzOpacityFactor = mix(1.0, dbzOpacityFactor, dbzOpacityStrength);
    pixelOpacity *= dbzOpacityFactor;
  }

  fragmentColor = vec4(color, pixelOpacity);
  drawCursor(cursor, view);
}
