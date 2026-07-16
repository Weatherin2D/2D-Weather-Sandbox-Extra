#version 300 es
// Stub FBO illum pass — June 8 lightning illuminates inside realisticDisplayShader.
// Kept so older cached app.js builds that still load this file can compile.
precision highp float;
precision highp sampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D waterTex;
uniform float sunAngle;
uniform vec2 aspectRatios;
uniform vec2 texelSize;
uniform vec2 resolution;

layout(location = 0) out vec4 onLightOut;
layout(location = 1) out vec4 cloudFlashOut;
layout(location = 2) out vec4 surfFlashOut;

void main()
{
  onLightOut = vec4(0.0);
  cloudFlashOut = vec4(0.0);
  surfFlashOut = vec4(0.0);
}
