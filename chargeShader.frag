#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D chargeTex; // previous frame charge

uniform vec2 texelSize;
uniform vec2 resolution;
uniform float dryLapse;

// Output: R = air charge (V, bipolar), G = ground-surface charge (V, bipolar)
layout(location = 0) out vec2 charge;

#include "common.glsl"

// ── Physical charge separation model ──────────────────────────────────────
//
// Classic tripole thunderstorm structure (from diagram):
//
//   ┌─────────────────────────────────┐  Cloud top
//   │  (+) Positive — ice crystals    │  T < -40°C, rising
//   │                                 │
//   │  (−) Negative — graupel         │  T -10°C to -25°C, cloud base region
//   │                                 │
//   │  (+) Small positive pocket      │  T > -10°C, warm rain / screening
//   └─────────────────────────────────┘  Cloud base
//
//   Ground: (+) induced positive under negative cloud base
//
// Implementation:
//   - Upper charging zone (T < -25°C): positive charge from ice crystals
//   - Lower charging zone (-10°C to -25°C): negative charge from graupel
//     This fires regardless of vertical velocity — graupel accumulates here
//     even in weak updrafts, and this is what drives CG lightning.
//   - Warm base (T > -5°C): small positive pocket from positive screening
//   - Precipitation falling out: additional negative charge transport
//
// Charge decays slowly, diffuses laterally, and advects with wind.
// Range: ±1.0 representing ±100 MV.

#define CHARGE_DECAY        0.998   // per-frame decay
#define CHARGE_DIFFUSION    0.02    // lateral diffusion rate
#define CHARGE_SCALE        0.0010  // generation rate per frame

void main()
{
  vec4 base  = texture(baseTex,  texCoord);
  vec4 water = texture(waterTex, texCoord);
  ivec4 wall = texture(wallTex,  texCoord);

  vec2 prev  = texture(chargeTex, texCoord).rg;

  // ── Wall / ground cells: store induced surface charge in G channel ──────
  if (wall[DISTANCE] == 0) {
    // Ground charge is the negative of the air charge just above it
    // (electrostatic induction: ground mirrors the charge of the cloud base)
    vec2 aboveCoord = vec2(texCoord.x, texCoord.y + texelSize.y);
    float airChargeAbove = texture(chargeTex, aboveCoord).r;

    // Ground charge is induced opposite to the air charge above
    float groundCharge = prev.g * CHARGE_DECAY - airChargeAbove * 0.05;
    groundCharge = clamp(groundCharge, -1.0, 1.0);
    charge = vec2(0.0, groundCharge);
    return;
  }

  // ── Air cells: compute charge generation from microphysics ──────────────
  float realTemp   = potentialToRealT(base[TEMPERATURE]);
  float cloudWater = water[CLOUD];
  float precip     = water[PRECIPITATION];

  // ── Upper charging zone: T < -25°C → POSITIVE (ice crystals) ────────────
  // Ice crystals are light, carried upward by updrafts, accumulate at cloud top.
  // Fires whenever there is cloud water in the cold zone — rising helps but
  // is not required (ice crystals form and charge regardless).
  float upperZone = smoothstep(CtoK(-40.0), CtoK(-25.0), realTemp)
                  * (1.0 - smoothstep(CtoK(-25.0), CtoK(-15.0), realTemp));
  float risingBoost = 1.0 + max(base[VY] * 3.0, 0.0); // rising enhances positive gen
  float positiveGen = cloudWater * upperZone * CHARGE_SCALE * risingBoost;

  // ── Lower charging zone: T -10°C to -25°C → NEGATIVE (graupel) ──────────
  // Graupel is heavy, settles toward cloud base, accumulates in the -10 to -25°C
  // layer. This is the PRIMARY negative charge region that drives CG lightning.
  // Does NOT require falling air — graupel forms and charges here continuously.
  float lowerZone = smoothstep(CtoK(-25.0), CtoK(-15.0), realTemp)
                  * (1.0 - smoothstep(CtoK(-10.0), CtoK(-5.0), realTemp));
  // Falling air enhances negative gen (graupel settling faster), but base rate
  // is significant even without it.
  float fallBoost = 1.0 + max(-base[VY] * 3.0, 0.0);
  float negativeGen = cloudWater * lowerZone * CHARGE_SCALE * fallBoost;

  // ── Warm base pocket: T > -5°C → small POSITIVE (screening layer) ────────
  // Positive charge at the very base of the cloud from positive ion screening
  // and warm rain processes. Weaker than the main regions.
  float warmBase = smoothstep(CtoK(-5.0), CtoK(0.0), realTemp)
                 * (1.0 - smoothstep(CtoK(0.0), CtoK(5.0), realTemp));
  float warmPositiveGen = cloudWater * warmBase * CHARGE_SCALE * 0.3;

  // ── Precipitation: additional negative charge transport downward ──────────
  // Falling precipitation (rain/graupel) carries negative charge downward,
  // reinforcing the negative base and depositing charge below cloud.
  float precipNeg = precip * CHARGE_SCALE * 0.5;

  // Net charge: positive from upper zone + warm base, negative from lower zone + precip
  float netCharge = positiveGen + warmPositiveGen - negativeGen - precipNeg;

  // ── Diffusion from neighbors ─────────────────────────────────────────────
  float chargeLeft  = texture(chargeTex, texCoordXmY0).r;
  float chargeRight = texture(chargeTex, texCoordXpY0).r;
  float chargeDown  = texture(chargeTex, texCoordX0Ym).r;
  float chargeUp    = texture(chargeTex, texCoordX0Yp).r;

  // Only diffuse from/to air cells
  ivec4 wallLeft  = texture(wallTex, texCoordXmY0);
  ivec4 wallRight = texture(wallTex, texCoordXpY0);
  ivec4 wallDown  = texture(wallTex, texCoordX0Ym);
  ivec4 wallUp    = texture(wallTex, texCoordX0Yp);

  float neighborSum = 0.0;
  float neighborCount = 0.0;
  if (wallLeft[DISTANCE]  != 0) { neighborSum += chargeLeft;  neighborCount += 1.0; }
  if (wallRight[DISTANCE] != 0) { neighborSum += chargeRight; neighborCount += 1.0; }
  if (wallDown[DISTANCE]  != 0) { neighborSum += chargeDown;  neighborCount += 1.0; }
  if (wallUp[DISTANCE]    != 0) { neighborSum += chargeUp;    neighborCount += 1.0; }

  float diffusion = 0.0;
  if (neighborCount > 0.0) {
    diffusion = (neighborSum / neighborCount - prev.r) * CHARGE_DIFFUSION;
  }

  // ── Advection: charge moves with the wind ────────────────────────────────
  // Simple upstream advection: sample charge from where the wind came from
  vec2 vel = base.xy;
  vec2 upstreamCoord = texCoord - vel * texelSize * 0.5;
  upstreamCoord = clamp(upstreamCoord, vec2(0.0), vec2(1.0));
  float advectedCharge = texture(chargeTex, upstreamCoord).r;

  // Blend current charge with advected charge
  float airCharge = mix(prev.r, advectedCharge, 0.3);

  // Apply decay, diffusion, and new generation
  airCharge = airCharge * CHARGE_DECAY + diffusion + netCharge;

  // Hard clamp to ±1.0 (representing ±100 MV)
  airCharge = clamp(airCharge, -1.0, 1.0);

  charge = vec2(airCharge, 0.0); // ground charge handled in wall branch above
}
