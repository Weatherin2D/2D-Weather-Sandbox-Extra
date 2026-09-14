#version 300 es
precision highp float;
precision highp isampler2D;

in vec2 fragCoord;

uniform isampler2D wallTex;
uniform vec2 resolution;

layout(location = 0) out float outHeight;

void main()
{
  int ix = int(floor(fragCoord.x));
  int ny = int(resolution.y);
  float h = 1.0;
  for (int y = 0; y < 2048; y++) {
    if (y >= ny)
      break;
    if (texelFetch(wallTex, ivec2(ix, y), 0)[1] == 0)
      h = float(y) + 1.0;
  }
  outHeight = clamp(h, 1.0, max(resolution.y - 1.0, 1.0));
}
