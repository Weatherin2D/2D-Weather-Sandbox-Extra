#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 fragCoord;
in vec2 texCoord;

uniform sampler2D terrainHeightTex;

layout(location = 0) out vec4 outCol;

void main()
{
  int ix = int(floor(fragCoord.x));
  float h = texelFetch(terrainHeightTex, ivec2(ix, 0), 0).r;
  // Drawn only to row 1 of the 2-row sun column texture. Avoid sampling
  // sunColumnTex here — it is also the framebuffer attachment.
  outCol = vec4(h, 0.0, 0.0, 0.0);
}
