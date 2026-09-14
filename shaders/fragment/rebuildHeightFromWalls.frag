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
  // Scan from the top so we can stop at the highest wall. The old bottom-up
  // 2048-iteration pass always touched every cell and could TDR the GPU while
  // painting caves (rebuild runs every frame).
  const int kMaxScan = 2048;
  for (int s = 0; s < kMaxScan; s++) {
    int y = ny - 1 - s;
    if (y < 0)
      break;
    if (texelFetch(wallTex, ivec2(ix, y), 0)[1] == 0) {
      h = float(y) + 1.0;
      break;
    }
  }
  outHeight = clamp(h, 1.0, max(resolution.y - 1.0, 1.0));
}
