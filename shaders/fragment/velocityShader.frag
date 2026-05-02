#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;     // this
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform isampler2D wallTex;

uniform float dragMultiplier;
uniform float pressureInfluence;
uniform float asymmetricPressure; // 0.0 = symmetric, 1.0 = low pressure causes rising only

uniform float wind;

uniform vec2 texelSize;
// uniform vec2 resolution;

uniform vec4 initial_Tv[126];

float getInitialT(int y) { return initial_Tv[y / 4][y % 4]; }

layout(location = 0) out vec4 base;
layout(location = 2) out ivec4 wall;

float dryLapse; // NOT USED needs to be declared for common.glsl
vec2 resolution;
#include "common.glsl"

void main()
{
  base = texture(baseTex, texCoord);
  vec4 baseXpY0 = texture(baseTex, texCoordXpY0);
  
  // Clamp top boundary sampling to prevent reading outside valid range
  vec2 clampedTexCoordX0Yp = vec2(texCoordX0Yp.x, min(texCoordX0Yp.y, 1.0 - texelSize.y * 0.5));
  vec4 baseX0Yp = texture(baseTex, clampedTexCoordX0Yp);

  wall = texture(wallTex, texCoord);
  ivec4 wallX0Yp = texture(wallTex, clampedTexCoordX0Yp);
  ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);


  // set boundaries: no flow in or out of wall cells
  if (wall[DISTANCE] == 0) // is wall
  {
    base[VX] = 0.0;        // velocities in wall are 0
    base[VY] = 0.0;        // this will make a wall not let any pressure trough and
                           // thereby reflect any pressure waves back
  } else {

    if (wallXpY0[DISTANCE] == 0) {
      base[VX] = 0.0;                                  // Since X velocity is defined at the right of the cell, it has to be done in the cell to the left of the wall
    } else {
      float pressureGradX = base[PRESSURE] - baseXpY0[PRESSURE];
      // Clamp pressure gradient to prevent instability
      pressureGradX = clamp(pressureGradX, -0.03, 0.03);
      base[VX] += pressureGradX * pressureInfluence;
      base[VX] *= 1. - dragMultiplier * 0.0002;        // linear drag
      // Clamp velocity to prevent explosion - tighter clamp for stability
      base[VX] = clamp(base[VX], -0.3, 0.3);
    }

    // Pressure gradient for Y velocity with asymmetric pressure effect
    // baseX0Yp is already clamped at top boundary in main()
    float pressureGradY = base[PRESSURE] - baseX0Yp[PRESSURE];
    
    // Clamp pressure gradient to prevent instability - tighter clamp for Y
    pressureGradY = clamp(pressureGradY, -0.03, 0.03);
    
    // Asymmetric pressure effect: low pressure induces rising motion (negative pressure = rising)
    // but high pressure has reduced or no effect on sinking
    float pressureEffectY = pressureGradY;
    if (asymmetricPressure > 0.0) {
      // pressureGradY > 0 means this cell has higher pressure than above (should rise - negative for VY update)
      // pressureGradY < 0 means this cell has lower pressure than above (would sink - positive for VY update)
      // For asymmetric: only allow rising from low pressure, suppress sinking from high pressure
      // Very tight thresholds to prevent strong winds
      float lowPressureBoost = smoothstep(0.0, 0.01, pressureGradY); // gradual rising when pressureGradY > 0
      float highPressureSuppression = 1.0 - asymmetricPressure * (1.0 - smoothstep(-0.01, 0.0, pressureGradY)); // reduce sinking
      pressureEffectY = pressureGradY * (lowPressureBoost + highPressureSuppression * (1.0 - lowPressureBoost));
    }
    
    base[VY] += pressureEffectY * pressureInfluence;
    base[VY] *= 1. - dragMultiplier * 0.0002;
    // Clamp velocity to prevent explosion - tighter clamp for vertical
    base[VY] = clamp(base[VY], -0.3, 0.3);
    // quadratic drag
    // base[VX] -= base[VX] * base[VX] * base[VX] * base[VX] * base[VX] *
    // dragMultiplier; base[VY] -= base[VY] * base[VY] * base[VY] * base[VY] *
    // base[VY] * dragMultiplier;

    base[VX] += wind * 0.000001;
  }
}