#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D waterTex;
uniform float sunAngle;
uniform vec2 aspectRatios;
uniform vec2 texelSize;
uniform vec2 resolution;

uniform float dryLapse;

#include "common.glsl"
#include "lightningV2.glsl"

layout(location = 0) out vec4 onLightOut;
layout(location = 1) out vec4 cloudFlashOut;
layout(location = 2) out vec4 surfFlashOut;

void main()
{
  vec2 uv = texCoord;
  vec4 water = texture(waterTex, uv);
  float cloudwater = water[CLOUD];
  float precip = water[PRECIPITATION];
  float nightFactor = clamp(map_range(abs(sunAngle), 60. * deg2rad, 90. * deg2rad, 0., 1.), 0., 1.);

  vec3 flashEmit;
  vec3 flashCloud;
  vec3 flashSurf;
  vec3 precipShafts;
  ltAccumulateFlashes(uv, aspectRatios[0], cloudwater, precip, nightFactor,
    flashEmit, flashCloud, flashSurf, precipShafts);

  vec3 boltsUnused;
  vec3 behindUnused;
  vec3 illum;
  ltAccumulateBoltsAndIllum(uv, aspectRatios[0], cloudwater, precip, nightFactor,
    boltsUnused, behindUnused, illum);

  onLightOut = vec4(illum, 1.0);
  cloudFlashOut = vec4(flashCloud, 1.0);
  surfFlashOut = vec4(flashSurf + precipShafts, 1.0);
}
