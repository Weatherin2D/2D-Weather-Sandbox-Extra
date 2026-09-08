#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

uniform sampler2D baseTex;
uniform isampler2D wallTex;
uniform vec2 resolution;
uniform vec2 texelSize;
uniform ivec2 tileSize;

layout(location = 0) out vec4 fragmentColor;

#define VY 1
#define DISTANCE 1

const int MAX_TILE = 16;

void main()
{
  ivec2 outPx = ivec2(gl_FragCoord.xy);
  ivec2 origin = outPx * tileSize;
  ivec2 simSize = ivec2(resolution);

  float bestVy = -1.0e10;
  float bestX = 0.0;
  float bestY = 0.0;
  bool found = false;

  for (int j = 0; j < MAX_TILE; j++) {
    if (j >= tileSize.y)
      break;
    for (int i = 0; i < MAX_TILE; i++) {
      if (i >= tileSize.x)
        break;
      ivec2 cell = origin + ivec2(i, j);
      if (cell.x >= simSize.x || cell.y >= simSize.y)
        continue;
      ivec4 wall = texelFetch(wallTex, cell, 0);
      if (wall[DISTANCE] < 2)
        continue;
      vec4 base = texelFetch(baseTex, cell, 0);
      float vy = base[VY];
      if (!found || vy > bestVy) {
        found = true;
        bestVy = vy;
        bestX = float(cell.x) + 0.5;
        bestY = float(cell.y) + 0.5;
      }
    }
  }

  if (!found)
    fragmentColor = vec4(-1.0e10, 0.0, 0.0, 0.0);
  else
    fragmentColor = vec4(bestVy, bestX, bestY, 1.0);
}
