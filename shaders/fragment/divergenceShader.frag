#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 texCoord;     // this
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
out float divergence;

void main()
{
  vec4 cell = texture(baseTex, texCoord);
  vec4 cellXpY0 = texture(baseTex, texCoordXpY0);
  vec4 cellX0Yp = texture(baseTex, texCoordX0Yp);

  // Discrete divergence: ∂u/∂x + ∂v/∂y (sibling of curl)
  divergence = cellXpY0[0] - cell[0] + cellX0Yp[1] - cell[1];
}
