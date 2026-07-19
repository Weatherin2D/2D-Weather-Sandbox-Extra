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
uniform float floodThreshold; // when > 0, value = max(0, cell[q] - floodThreshold)
uniform int colorScaleColumn; // which column of colorScalesTex to sample (4=universal, 5=waterVapor)
uniform int useUnipolarScale;  // 1 = clamp(val,0,1), 0 = bipolar (val+1)*0.5
uniform int colorScaleStops;  // number of palette stops in colorScalesTex

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // xpos   Ypos  Size   type

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

bool isLandSurfaceWall(int wallType)
{
  // Land / fire / urban / suburban / industrial / runway / custom base — soil moisture lives here
  return wallType == 1 || wallType == 3 || wallType == 4 || wallType == 5
      || wallType == 6 || wallType == 7
      || (wallType >= 10 && wallType <= 17);
}

bool isSnowSurfaceWall(int wallType)
{
  // Snow depth also lives on ice sheets / caps
  return isLandSurfaceWall(wallType) || wallType == WALLTYPE_ICE;
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

// Flood palette: full scale at 20 m ponding; steep curve keeps deep opacities hard to reach
vec4 floodDepthColor(float depthMm)
{
  float t = clamp(depthMm * dispMultiplier, 0.0, 1.0);
  t = pow(t, 1.85); // match realistic flood opacity curve
  float mixAmt = clamp(t, 0.0, 1.0);
  vec3 land = vec3(0.08, 0.09, 0.10);
  vec3 shallow = vec3(0.10, 0.50, 1.0);
  vec3 mid = vec3(0.18, 0.72, 1.0);
  vec3 deep = vec3(0.55, 0.92, 1.0);
  vec3 water = mix(shallow, mid, smoothstep(0.0, 0.45, mixAmt));
  water = mix(water, deep, smoothstep(0.45, 1.0, mixAmt));
  return vec4(mix(land, water, mixAmt), 1.0);
}

void main()
{
  vec4 cell = texture(anyTex, texCoord);
  ivec4 wall = texture(wallTex, texCoord);

  float raw = cell[quantityIndex];
  if (floodThreshold > 0.0)
    raw = max(raw - floodThreshold, 0.0);
  float val = raw * dispMultiplier;

  // Soil moisture / flood / snow depth are stored on surface wall cells, not fluid air.
  // Underground cells copy soil moisture from above — only color VERT_DISTANCE == 0.
  bool snowDepthView = colorScaleColumn == 62;
  bool surfaceFieldView = floodThreshold > 0.0 || colorScaleColumn == 14 || snowDepthView;
  bool atSurface = wall[DISTANCE] == 0 && wall[VERT_DISTANCE] == 0;
  bool validSurfaceWall = snowDepthView ? isSnowSurfaceWall(wall[TYPE]) : isLandSurfaceWall(wall[TYPE]);

  if (wall[DISTANCE] == 0) {  // is wall
    if (surfaceFieldView && validSurfaceWall && atSurface) {
      if (floodThreshold > 0.0) {
        if (raw <= 0.05)
          fragmentColor = vec4(vec3(0.08), 1.0); // dry land under flood view
        else
          fragmentColor = floodDepthColor(raw);
      } else {
        fragmentColor = sampleQuantityColor(val);
      }
    } else if (surfaceFieldView) {
      // Subsurface / non-land walls stay dark in soil, flood & snow views
      fragmentColor = vec4(vec3(0.05), 1.0);
    } else {
      switch (wall[TYPE]) { // wall type
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
