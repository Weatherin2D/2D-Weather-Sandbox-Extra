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

uniform int colorScaleColumn;
uniform float colorScaleTwMin;
uniform float colorScaleTwMax;
uniform float colorScaleTwOffset;

uniform float displayVectorField;

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // xpos   Ypos  Size   type

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

// Simplified wet-bulb (°C) matching JS sounding export: tw = T − (100 − RH%) / 5
float wetBulbC(float tC, float rhFraction)
{
  float rhPct = clamp(rhFraction * 100.0, 0.0, 100.0);
  return tC - (100.0 - rhPct) / 5.0;
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
    float tC = KtoC(realTemp);
    float rh = relativeHumd(realTemp, water[TOTAL]);
    float twC = wetBulbC(tC, rh);
    float lookup = twC + colorScaleTwOffset;
    float range = max(colorScaleTwMax - colorScaleTwMin, 0.001);
    float v = clamp((lookup - colorScaleTwMin) / range, 0.0, 1.0);
    ivec2 scaleSize = textureSize(colorScalesTex, 0);
    float u = (float(colorScaleColumn) + 0.5) / float(scaleSize.x);
    fragmentColor = texture(colorScalesTex, vec2(u, v));

    drawVectorField(base.xy, displayVectorField);
  }

  drawCursor(cursor, view);
}
