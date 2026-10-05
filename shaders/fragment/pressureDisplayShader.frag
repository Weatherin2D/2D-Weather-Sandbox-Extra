#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D baseTex;
uniform isampler2D wallTex;
uniform sampler2D refProfileTex;   // R = P_ref hPa, G = rho_ref, B = vapor_ref
uniform sampler2D rowMeanTex;      // (sim_res_y x 1): R = row mean of fluid PRESSURE, G = air cell count

uniform vec2 resolution;
uniform vec2 texelSize;

uniform float paPerUnitPerRho;     // (cellHeight / dt)^2 * user scale
uniform int anelastic;
uniform float isobarIntervalHpa;   // anomaly isobars (H/L structure)
uniform float isobarSpacingHpa;    // full-pressure isobars; every 5th is a major line

uniform vec4 synopticSys[16];
uniform int synopticCount;

uniform float displayVectorField;

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // xpos   Ypos  Size   type

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

// Linear in y like bilerpWall, so the baseline does not step at row boundaries.
float rowMeanAt(float cellY)
{
  float maxY = resolution.y - 1.0;
  float cy = clamp(cellY, 0.0, maxY);
  int y0 = int(floor(cy));
  int y1 = min(y0 + 1, int(maxY));
  vec4 a = texelFetch(rowMeanTex, ivec2(y0, 0), 0);
  vec4 b = texelFetch(rowMeanTex, ivec2(y1, 0), 0);
  if (a.g < 0.5)
    return b.r;
  if (b.g < 0.5)
    return a.r;
  return mix(a.r, b.r, cy - float(y0));
}

// Anti-aliased line where value crosses a multiple of interval.
float contourLine(float value, float interval)
{
  float f = value / interval;
  float w = max(fwidth(f), 1e-5);
  float d = abs(fract(f + 0.5) - 0.5);
  return 1.0 - smoothstep(0.5 * w, 1.5 * w, d);
}

void main()
{
  vec4 base = bilerpWall(baseTex, wallTex, fragCoord);
  ivec2 wall = texture(wallTex, texCoord).xy;

  float cellY = fragCoord.y - 0.5;
  float fluidP = base[PRESSURE] - rowMeanAt(cellY);
  float perturbHpa = fluidToPa(refProfileTex, fluidP, cellY, resolution.y, paPerUnitPerRho, anelastic) * 0.01;
  perturbHpa += synopticBackgroundHpa(synopticSys, synopticCount, fragCoord.x - 0.5, cellY, resolution, wrapHorizontally != 0);
  float totalHpa = refPressureHpa(refProfileTex, cellY, resolution.y) + perturbHpa;

  float anomInterval = max(isobarIntervalHpa, 0.05);
  float anomLine = contourLine(perturbHpa, anomInterval) * step(anomInterval * 0.5, abs(perturbHpa));
  // Below-average pressure is dashed (diagonal pattern so vertical lines dash too).
  float dash = perturbHpa < 0.0 ? step(0.45, fract((gl_FragCoord.x + gl_FragCoord.y) / 9.0)) : 1.0;

  float spacing = max(isobarSpacingHpa, 1.0);
  float minorLine = contourLine(totalHpa, spacing);
  float majorLine = contourLine(totalHpa, spacing * 5.0);

  if (displayIsSolidTerrain(wallTex)) {
    if (wall[TYPE] == WALLTYPE_WATER || wall[TYPE] == WALLTYPE_FRESH_WATER || wall[TYPE] == WALLTYPE_ICE)
      fragmentColor = vec4(0.05, 0.07, 0.09, 1.0);
    else if (wall[TYPE] == WALLTYPE_INERT)
      fragmentColor = vec4(0.0, 0.0, 0.0, 1.0);
    else
      fragmentColor = vec4(vec3(0.07), 1.0);
  } else {
    vec3 col = vec3(0.14, 0.145, 0.15);
    col = mix(col, vec3(0.55), minorLine * 0.55);
    col = mix(col, vec3(0.95), majorLine * 0.85);
    col = mix(col, vec3(0.80), anomLine * dash * 0.8);
    fragmentColor = vec4(col, 1.0);

    drawVectorField(base.xy, displayVectorField);
  }

  drawCursor(cursor, view);
}
