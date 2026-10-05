#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;     // this
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpYm; // right down
in vec2 texCoordXmYp; // left up

uniform sampler2D baseTex;
uniform isampler2D wallTex;
uniform sampler2D refProfileTex;

uniform float dragMultiplier;

uniform float wind;
uniform float coriolisStrength;

uniform vec2 texelSize;
uniform vec2 simResolution;

uniform vec4 initial_Tv[126];

// Physical pressure
uniform int anelastic;          // 1 = divide pressure-gradient force by reference density
uniform float paPerUnitPerRho;  // (cellHeight / dt)^2 * user scale
uniform vec4 synopticSys[16];   // x, y, radius (cells), signed amplitude (hPa)
uniform int synopticCount;
uniform float synopticCoupling; // 0 = synoptic pressure is display-only
uniform int wrapHorizontally;
uniform int acousticSubstep;    // 1 = extra pressure substep: pressure-gradient force only

// Jet stream: VX nudged toward jetSpeed (cells/iteration) in a Gaussian band around jetCenterCell
uniform float jetSpeed;
uniform float jetCenterCell;
uniform float jetHalfWidthCells;

layout(location = 0) out vec4 base;
layout(location = 2) out ivec4 wall;

float dryLapse; // NOT USED needs to be declared for common.glsl
vec2 resolution;
#include "common.glsl"

// Background synoptic pressure in solver units at a cell.
float synopticFluidPressure(float cellX, float cellY)
{
  float hpa = synopticBackgroundHpa(synopticSys, synopticCount, cellX, cellY, simResolution, wrapHorizontally != 0);
  return paToFluid(refProfileTex, hpa * 100.0, cellY, simResolution.y, paPerUnitPerRho, anelastic);
}

// Must stay below (0.5 - 0.45) / 2, where 0.45 is the pressureShader divergence factor.
#define DIVERGENCE_DAMPING 0.02

// Same (mass-flux) divergence the pressure shader integrates.
float cellDivergence(float vxL, float vx0, float vyD, float vy0, float cellY)
{
  vxL = clamp(vxL, -2.5, 2.5);
  vx0 = clamp(vx0, -2.5, 2.5);
  vyD = clamp(vyD, -2.5, 2.5);
  vy0 = clamp(vy0, -2.5, 2.5);
  if (anelastic != 0) {
    float rhoC = refDensityNorm(refProfileTex, cellY, simResolution.y);
    float rhoD = refDensityNorm(refProfileTex, cellY - 0.5, simResolution.y);
    float rhoU = refDensityNorm(refProfileTex, cellY + 0.5, simResolution.y);
    float divM = rhoC * (vx0 - vxL) + rhoU * vy0 - rhoD * vyD;
    return divM == divM ? divM : 0.0;
  }
  float div = vx0 - vxL + vy0 - vyD;
  return div == div ? div : 0.0;
}

void main()
{
  resolution = simResolution;
  base = texture(baseTex, texCoord);
  vec4 baseXpY0 = texture(baseTex, texCoordXpY0);
  vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);

  wall = texture(wallTex, texCoord);
  ivec4 wallX0Yp = texture(wallTex, texCoordX0Yp);
  ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);

  float cellX = fragCoord.x - 0.5;
  float cellY = fragCoord.y - 0.5;

  // Anelastic: thinner air aloft accelerates more for the same pressure difference.
  // VX sits at the cell's right face (same height), VY at its top face (half a cell up).
  float invRhoX = 1.0;
  float invRhoY = 1.0;
  if (anelastic != 0) {
    invRhoX = 1.0 / refDensityNorm(refProfileTex, cellY, simResolution.y);
    invRhoY = 1.0 / refDensityNorm(refProfileTex, cellY + 0.5, simResolution.y);
  }

  // set boundaries: no flow in or out of wall cells
  if (wall[DISTANCE] == 0) // is wall
  {
    base[VX] = 0.0;        // velocities in wall are 0
    base[VY] = 0.0;        // this will make a wall not let any pressure trough and
                           // thereby reflect any pressure waves back
  } else {

    // Divergence damping: the pressure gradient uses p - k*div, which damps sound waves
    // (otherwise energy from vorticity confinement builds up into growing oscillations).
    vec4 baseXmY0 = texture(baseTex, texCoordXmY0);
    vec4 baseX0Ym = texture(baseTex, texCoordX0Ym);
    vec4 baseXpYm = texture(baseTex, texCoordXpYm);
    vec4 baseXmYp = texture(baseTex, texCoordXmYp);
    float pEff = base[PRESSURE] - DIVERGENCE_DAMPING * cellDivergence(baseXmY0[VX], base[VX], baseX0Ym[VY], base[VY], cellY);
    float pEffXp = baseXpY0[PRESSURE] - DIVERGENCE_DAMPING * cellDivergence(base[VX], baseXpY0[VX], baseXpYm[VY], baseXpY0[VY], cellY);
    float pEffYp = baseX0Yp[PRESSURE] - DIVERGENCE_DAMPING * cellDivergence(baseXmYp[VX], baseX0Yp[VX], base[VY], baseX0Yp[VY], cellY + 1.0);

    bool xBlocked = wallXpY0[DISTANCE] == 0;
    if (xBlocked) {
      base[VX] = 0.0;                                  // Since X velocity is defined at the right of the cell, it has to be done in the cell to the left of the wall
    } else {
      base[VX] += (pEff - pEffXp) * invRhoX; // The velocity through the cell changes proportionally to the pressure gradient across the cell. It's basically just newtons 2nd law.

      // Synoptic Low/High as a hydrostatically balanced background pressure: horizontal gradient only.
      if (synopticCoupling > 0.0 && synopticCount > 0)
        base[VX] += synopticCoupling * (synopticFluidPressure(cellX, cellY) - synopticFluidPressure(cellX + 1.0, cellY)) * invRhoX;
    }

    base[VY] += (pEff - pEffYp) * invRhoY;

    if (acousticSubstep != 0) {
      base = sanitizeSimBase(base, wall[DISTANCE]);
      return;
    }

    if (!xBlocked) {
      base[VX] *= 1. - dragMultiplier * 0.0002;        // linear drag
      if (jetSpeed != 0.0) {
        float d = (cellY - jetCenterCell) / max(jetHalfWidthCells, 1.0);
        base[VX] += (jetSpeed - base[VX]) * 0.0005 * exp(-d * d);
      }
    }
    base[VY] *= 1. - dragMultiplier * 0.0002;
    // quadratic drag
    // base[VX] -= base[VX] * base[VX] * base[VX] * base[VX] * base[VX] *
    // dragMultiplier; base[VY] -= base[VY] * base[VY] * base[VY] * base[VY] *
    // base[VY] * dragMultiplier;

    base[VX] += wind * 0.000001;

    // Weak Coriolis-like deflection (f-plane). Strength 0 disables.
    if (coriolisStrength > 1e-8 && wall[DISTANCE] != 0) {
      float vx = base[VX];
      float vy = base[VY];
      base[VX] += -coriolisStrength * vy;
      base[VY] += coriolisStrength * vx;
    }
  }

  base = sanitizeSimBase(base, wall[DISTANCE]);
}
