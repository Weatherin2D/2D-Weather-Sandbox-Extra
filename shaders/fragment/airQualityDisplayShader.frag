#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D colorScalesTex;
uniform sampler2D smokeTex;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform float dryLapse;

uniform float displayVectorField;
uniform int colorScaleInterpolate;

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // xpos   Ypos  Size   type

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"


void main()
{
  vec4 base = bilerpWall(baseTex, wallTex, fragCoord);
  vec4 water = bilerpWall(waterTex, wallTex, fragCoord);
  ivec2 wall = texture(wallTex, texCoord).xy;

  if (wall[1] == 0) {  // is wall
    switch (wall[0]) { // wall type
    case 0:
      fragmentColor = vec4(0, 0, 0, 1);
      break;
    case 1: // land wall
      fragmentColor = vec4(vec3(0.10), 1.0);
      break;
    case 2: // water wall
      // fragmentColor = vec4(0, 0.5, 0.99, 1);
      int palletteIndex = int(map_range(KtoC(base[3]), -26. - 2., 30., 0., 29.));
      palletteIndex = clamp(palletteIndex, 0, 29);
      fragmentColor = vec4(tempColorPalette[palletteIndex], 1.0);
      break;
    case 3: // Fire wall
      fragmentColor = vec4(1.0, 0.5, 0.0, 1);
      break;
    }
  } else { // fluid

    float smokeDensity = water[DUST] + bilerpWall(smokeTex, wallTex, fragCoord).r;

    float t = clamp(map_range(smokeDensity, 0.0, 1.0, 0.0, 1.0), 0.0, 1.0);
    fragmentColor = sampleColorScale(colorScalesTex, 1, t, 27, colorScaleInterpolate);

    drawVectorField(base.xy, displayVectorField);
  }

  drawCursor(cursor, view);
}