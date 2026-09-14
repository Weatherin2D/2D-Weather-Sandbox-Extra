#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 fragCoord;
in vec2 texCoord;

uniform sampler2D terrainHeightTex;
uniform vec2 resolution;
uniform vec2 texelSize;
uniform vec4 userInputValues; // xpos Ypos intensity brushRadiusCells
uniform bool wrapHorizontally;
uniform int flatSculpt; // 1 = lakes/oceans: set a level height, no circular dome

#define BRUSH_INTENSITY 2
#define BRUSH_SIZE 3

layout(location = 0) out float outHeight;

float absHorizontalDist(float a, float b)
{
  float d = abs(a - b);
  return min(d, 1.0 - d);
}

void main()
{
  int ix = int(floor(fragCoord.x));
  float h = texelFetch(terrainHeightTex, ivec2(ix, 0), 0).r;
  float minH = 1.0;
  float maxH = max(resolution.y - 1.0, minH);

  float radiusTex = userInputValues[BRUSH_SIZE] * texelSize.y;
  float dxTex;
  if (userInputValues.x < -0.5) {
    dxTex = 0.0;
  } else if (wrapHorizontally) {
    dxTex = absHorizontalDist(userInputValues.x, texCoord.x);
  } else {
    dxTex = abs(userInputValues.x - texCoord.x);
  }
  dxTex *= texelSize.y / texelSize.x;

  if (dxTex <= radiusTex) {
    if (flatSculpt != 0) {
      float target = userInputValues.y * resolution.y;
      h = target;
    } else {
      float dyTex = sqrt(max(radiusTex * radiusTex - dxTex * dxTex, 0.0));
      float topCells = (userInputValues.y + dyTex) * resolution.y;
      float botCells = (userInputValues.y - dyTex) * resolution.y;
      if (userInputValues[BRUSH_INTENSITY] > 0.0)
        h = max(h, topCells);
      else
        h = min(h, max(botCells, minH));
    }
  }

  outHeight = clamp(h, minH, maxH);
}
