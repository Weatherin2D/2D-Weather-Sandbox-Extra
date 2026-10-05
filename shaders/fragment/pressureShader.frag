#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;     // this
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down

uniform sampler2D baseTex;
uniform isampler2D wallTex;
uniform sampler2D refProfileTex;
uniform vec2 resolution;
uniform vec2 texelSize;
uniform int anelastic; // 1 = mass-flux (rho-weighted) divergence

layout(location = 0) out vec4 base;
layout(location = 2) out ivec4 wall;

#include "common.glsl"

void main()
{
  base = texture(baseTex, texCoord);
  vec4 baseXmY0 = texture(baseTex, texCoordXmY0);
  vec4 baseX0Ym = texture(baseTex, texCoordX0Ym);

  wall = texture(wallTex, texCoord); // pass trough

  ivec2 wallX0Ym = texture(wallTex, texCoordX0Ym).xy;
  if (wallX0Ym[1] == 0 && wallX0Ym[0] == 1) { // cell below is land wall
    base[3] -= baseX0Ym[3] - 1000.0;          // Snow melting cools air
  }

  // if(wall[1] == 0) // if this is wall
  //    base[0] = 0.; // set velocity to 0

  //  if(texCoord.y > 0.99){ // keep pressure at top close to 0
  //     base[2] *= 0.995; // 0.999
  //     base[2] -= 0.001;
  // }

  //  if(texCoord.y > 0.2)
  //    base[3] -= 0.0005;

  // pressure changes proportional to the net in or outflow, to or from the cell.
  // 0.05 - 0.49   was 0.40, lower multiplier dampenes pressure waves.
  float vxL = baseXmY0[0];
  float vx0 = base[0];
  float vyD = baseX0Ym[1];
  float vy0 = base[1];
  if (vxL != vxL) vxL = 0.0;
  if (vx0 != vx0) vx0 = 0.0;
  if (vyD != vyD) vyD = 0.0;
  if (vy0 != vy0) vy0 = 0.0;
  vxL = clamp(vxL, -2.5, 2.5);
  vx0 = clamp(vx0, -2.5, 2.5);
  vyD = clamp(vyD, -2.5, 2.5);
  vy0 = clamp(vy0, -2.5, 2.5);
  if (anelastic != 0) {
    // Paired with velocityShader dividing the gradient by rho, so the wave speed matches Classic.
    float cellY = fragCoord.y - 0.5;
    float rhoC = refDensityNorm(refProfileTex, cellY, resolution.y);
    float rhoD = refDensityNorm(refProfileTex, cellY - 0.5, resolution.y);
    float rhoU = refDensityNorm(refProfileTex, cellY + 0.5, resolution.y);
    base[2] += (rhoC * (vxL - vx0) + rhoD * vyD - rhoU * vy0) * 0.45;
  } else {
    base[2] += (vxL - vx0 + vyD - vy0) * 0.45;
  }
  if (base[2] != base[2])
    base[2] = 0.0;
  base[2] = clamp(base[2], -8.0, 8.0);
  if (base[3] != base[3])
    base[3] = 1000.0;
}
