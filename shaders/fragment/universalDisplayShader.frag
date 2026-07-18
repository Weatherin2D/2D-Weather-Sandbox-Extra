#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform sampler2D anyTex; // can be any RGBW32F texture
uniform isampler2D wallTex;
uniform sampler2D colorScalesTex;

uniform int quantityIndex; // wich quantity to display
uniform float dispMultiplier;
uniform float floodThreshold; // when > 0, display = max(0, cell[q] - floodThreshold)
uniform int colorScaleColumn; // which column of colorScalesTex to sample (4=universal, 5=waterVapor)
uniform int useUnipolarScale;  // 1 = clamp(val,0,1), 0 = bipolar (val+1)*0.5
uniform int colorScaleStops;  // number of palette stops in colorScalesTex

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // xpos   Ypos  Size   type

out vec4 fragmentColor;

#include "commonDisplay.glsl"

bool isLandSurfaceWall(int wallType)
{
  // Land / fire / urban / suburban / industrial / runway / custom base — soil moisture lives here
  return wallType == 1 || wallType == 3 || wallType == 4 || wallType == 5
      || wallType == 6 || wallType == 7
      || (wallType >= 10 && wallType <= 17);
}

vec4 sampleQuantityColor(float val)
{
  float normalized = (useUnipolarScale == 1)
    ? clamp(val, 0.0, 1.0)
    : clamp((val + 1.0) * 0.5, 0.0, 1.0);
  int palIdx = int(normalized * float(colorScaleStops - 1));
  palIdx = clamp(palIdx, 0, colorScaleStops - 1);
  return texelFetch(colorScalesTex, ivec2(colorScaleColumn, palIdx), 0);
}

void main()
{
  vec4 cell = texture(anyTex, texCoord);
  ivec2 wall = texture(wallTex, texCoord).xy;

  float raw = cell[quantityIndex];
  if (floodThreshold > 0.0)
    raw = max(raw - floodThreshold, 0.0);
  float val = raw * dispMultiplier;

  // Soil moisture / flood depth are stored on land surface cells (walls), not fluid air.
  // Flood view (floodThreshold > 0) and soil-moisture scale (col 14) must color those walls.
  bool surfaceFieldView = floodThreshold > 0.0 || colorScaleColumn == 14;

  if (wall[1] == 0) {  // is wall
    if (surfaceFieldView && isLandSurfaceWall(wall[0])) {
      if (floodThreshold > 0.0 && raw <= 0.001)
        fragmentColor = vec4(vec3(0.06), 1.0); // dry land under flood view
      else
        fragmentColor = sampleQuantityColor(val);
    } else {
      switch (wall[0]) { // wall type
      case 0:
        fragmentColor = vec4(0, 0, 0, 1);
        break;
      case 1: // land wall
        fragmentColor = vec4(vec3(0.10), 1.0);
        break;
      case 2: // water wall
        fragmentColor = vec4(0, 0.5, 0.99, 1);
        break;
      case 3: // Fire wall
        fragmentColor = vec4(1.0, 0.5, 0.0, 1);
        break;
      default:
        fragmentColor = vec4(vec3(0.10), 1.0);
        break;
      }
    }
  } else {
    if (surfaceFieldView)
      fragmentColor = vec4(vec3(0.04), 1.0); // air columns stay dark in soil/flood views
    else
      fragmentColor = sampleQuantityColor(val);
  }
  drawCursor(cursor, view);
}
