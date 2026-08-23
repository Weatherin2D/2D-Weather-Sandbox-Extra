#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D colorScalesTex;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform float dryLapse;
uniform float simHeight;

uniform int colorScaleColumn;
uniform int colorScaleStops;
uniform int colorScaleInterpolate;
uniform float colorScaleThetaeMin;
uniform float colorScaleThetaeMax;
uniform float colorScaleThetaeOffset;

uniform float displayVectorField;

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // xpos   Ypos  Size   type

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

// Bolton-style θe (°C) matching JS equivalentPotentialTempK intent.
float equivalentPotentialTempC(float tK, float vapor, float altM)
{
  float tdK = max(dewpoint(max(vapor, 1e-6)), 1.0);
  float p = 1013.25 * pow(max(1.0 - 2.25577e-5 * max(altM, 0.0), 0.05), 5.25588);
  // Absolute humidity → rough mixing ratio (g/kg); adequate for display contrast.
  float wGkg = clamp(vapor * 622.0 / max(p, 1.0), 0.01, 40.0);
  float tl = 1.0 / (1.0 / max(tdK - 56.0, 1e-3) + log(max(tK / max(tdK, 1e-3), 1e-6)) / 800.0) + 56.0;
  float theta = tK * pow(1000.0 / max(p, 1.0), 0.2854);
  float thetaE = theta * exp((3.376 / tl - 0.00254) * wGkg * (1.0 + 0.00081 * wGkg));
  return KtoC(thetaE);
}

void main()
{
  vec4 base = bilerpWall(baseTex, wallTex, fragCoord);
  vec4 water = bilerpWall(waterTex, wallTex, fragCoord);
  ivec2 wall = texture(wallTex, texCoord).xy;

  float realTemp = potentialToRealT(base[TEMPERATURE]);

  if (wall[DISTANCE] == 0) {
    switch (wall[TYPE]) {
    case WALLTYPE_INERT:
      fragmentColor = vec4(0, 0, 0, 1.);
      break;
    case WALLTYPE_LAND:
    case WALLTYPE_FOREST2:
      fragmentColor = vec4(vec3(0.10), 1.);
      break;
    case WALLTYPE_FRESH_WATER:
    case WALLTYPE_WATER:
    case WALLTYPE_ICE:
      int palletteIndex = int(map_range(KtoC(base[3]), -26. - 2., 30., 0., 29.));
      palletteIndex = clamp(palletteIndex, 0, 29);
      fragmentColor = vec4(tempColorPalette[palletteIndex], 1.0);
      break;
    case WALLTYPE_FIRE:
    case WALLTYPE_FIRE_FOREST2:
      fragmentColor = vec4(1.0, 0.5, 0.0, 1.);
      break;
    }
  } else {
    float altM = texCoord.y * simHeight;
    float thetaeC = equivalentPotentialTempC(realTemp, water[TOTAL], altM);
    float lookup = thetaeC + colorScaleThetaeOffset;
    float range = max(colorScaleThetaeMax - colorScaleThetaeMin, 0.001);
    float v = clamp((lookup - colorScaleThetaeMin) / range, 0.0, 1.0);
    fragmentColor = sampleColorScale(colorScalesTex, colorScaleColumn, v, colorScaleStops, colorScaleInterpolate);

    drawVectorField(base.xy, displayVectorField);
  }

  drawCursor(cursor, view);
}
