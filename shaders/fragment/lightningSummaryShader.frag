#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 texCoord;

uniform sampler2D chargeTex;
uniform sampler2D waterTex;

layout(location = 0) out vec4 summary;

void main()
{
  float charge = texture(chargeTex, texCoord).r;
  float cloud  = texture(waterTex, texCoord)[1]; // cloud water channel
  summary = vec4(charge, cloud, 0.0, 0.0);
}
