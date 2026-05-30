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

// ── Microphysics charge separation (not height bands) ─────────────────────
//
// Tripole structure emerges from storm dynamics, not fixed altitude layers:
//
//   (+) Ice crystals lofted in updrafts (cold mixed-phase aloft)
//   (−) Graupel/hail from ice–liquid collisions in −10 to −20 °C updraft core
//   (+) Weak screening pocket at cloud base (warm rain export)
//   Ground (+) induced under negative cloud base
//
// Requires cloud + precipitation coexistence (collision proxy), storm-core
// cloud density, and vertical motion — charge only builds in active convection.

#define CHARGE_DECAY        0.996
#define CHARGE_DIFFUSION    0.012
#define CHARGE_SCALE        0.0025
#define MAX_LT_DISCHARGE    4

uniform int ltDischargeCount;
uniform vec4 ltDischarge[MAX_LT_DISCHARGE];     // xy = uv, z = amount, w = radius px
uniform vec4 ltDischargeMeta[MAX_LT_DISCHARGE]; // x = ltType (for column shape)

void main()
{
  vec4 base  = texture(baseTex,  texCoord);
  vec4 water = texture(waterTex, texCoord);
  ivec4 wall = texture(wallTex,  texCoord);

  vec2 prev  = texture(chargeTex, texCoord).rg;

  // ── Wall / ground cells: induced surface charge ─────────────────────────
  if (wall[DISTANCE] == 0) {
    vec2 aboveCoord = vec2(texCoord.x, texCoord.y + texelSize.y);
    float airChargeAbove = texture(chargeTex, aboveCoord).r;

    float groundCharge = prev.g * CHARGE_DECAY - airChargeAbove * 0.06;
    groundCharge = clamp(groundCharge, -1.0, 1.0);
    charge = vec2(0.0, groundCharge);
    return;
  }

  // ── Air cells ───────────────────────────────────────────────────────────
  float realTemp   = potentialToRealT(base[TEMPERATURE]);
  float cloudWater = water[CLOUD];
  float precip     = water[PRECIPITATION];
  float vy         = base[VY];
  float updraft    = max(vy, 0.0);
  float downdraft  = max(-vy, 0.0);

  // Storm core: charge only where cloud exceeds local neighborhood (convection)
  float cL = texture(waterTex, texCoordXmY0)[CLOUD];
  float cR = texture(waterTex, texCoordXpY0)[CLOUD];
  float cD = texture(waterTex, texCoordX0Ym)[CLOUD];
  float cU = texture(waterTex, texCoordX0Yp)[CLOUD];

  ivec4 wallLeft  = texture(wallTex, texCoordXmY0);
  ivec4 wallRight = texture(wallTex, texCoordXpY0);
  ivec4 wallDown  = texture(wallTex, texCoordX0Ym);
  ivec4 wallUp    = texture(wallTex, texCoordX0Yp);

  float neighborCloud = cloudWater;
  float neighborCount = 1.0;
  if (wallLeft[DISTANCE]  != 0) { neighborCloud += cL; neighborCount += 1.0; }
  if (wallRight[DISTANCE] != 0) { neighborCloud += cR; neighborCount += 1.0; }
  if (wallDown[DISTANCE]  != 0) { neighborCloud += cD; neighborCount += 1.0; }
  if (wallUp[DISTANCE]    != 0) { neighborCloud += cU; neighborCount += 1.0; }

  float localMean = neighborCloud / neighborCount;
  float stormCore = smoothstep(localMean * 0.55 + 0.12, localMean + 0.75, cloudWater);
  stormCore *= smoothstep(0.30, 1.2, cloudWater);

  // Ice–liquid collision rate (Takahashi non-inductive charging proxy)
  float collision = cloudWater * precip * (1.0 + updraft * 1.6 + downdraft * 0.7);
  collision += cloudWater * cloudWater * updraft * 0.40;

  // Graupel → negative: mixed-phase −10 to −20 °C in active updraft
  float graupelZone = smoothstep(CtoK(-22.0), CtoK(-14.0), realTemp)
                    * (1.0 - smoothstep(CtoK(-8.0), CtoK(2.0), realTemp));
  float graupelBoost = 0.35 + updraft * 1.4 + downdraft * 0.5;
  float negativeGen = collision * graupelZone * graupelBoost * stormCore * CHARGE_SCALE * 1.6;

  // Ice crystals → positive: lofted in cold updraft above graupel layer
  float iceCrystalZone = smoothstep(CtoK(-38.0), CtoK(-24.0), realTemp)
                       * (1.0 - smoothstep(CtoK(-18.0), CtoK(-10.0), realTemp));
  float positiveGen = collision * iceCrystalZone * (0.25 + updraft * 1.8) * stormCore * CHARGE_SCALE * 1.1;
  positiveGen += cloudWater * updraft * iceCrystalZone * stormCore * CHARGE_SCALE * 0.30;

  // Weak positive screening at cloud base (warm rain processes)
  float cloudBaseZone = smoothstep(CtoK(-3.0), CtoK(7.0), realTemp);
  float warmPositiveGen = precip * cloudWater * cloudBaseZone * stormCore * CHARGE_SCALE * 0.18;

  // Falling hydrometeors transport negative charge downward
  float precipTransport = precip * (0.20 + downdraft * 1.1 + updraft * 0.15) * stormCore * CHARGE_SCALE * 0.50;

  float netCharge = positiveGen + warmPositiveGen - negativeGen - precipTransport;

  // ── Diffusion (air cells only) ───────────────────────────────────────────
  float chargeLeft  = texture(chargeTex, texCoordXmY0).r;
  float chargeRight = texture(chargeTex, texCoordXpY0).r;
  float chargeDown  = texture(chargeTex, texCoordX0Ym).r;
  float chargeUp    = texture(chargeTex, texCoordX0Yp).r;

  float neighborSum = 0.0;
  float neighborDiffCount = 0.0;
  if (wallLeft[DISTANCE]  != 0) { neighborSum += chargeLeft;  neighborDiffCount += 1.0; }
  if (wallRight[DISTANCE] != 0) { neighborSum += chargeRight; neighborDiffCount += 1.0; }
  if (wallDown[DISTANCE]  != 0) { neighborSum += chargeDown;  neighborDiffCount += 1.0; }
  if (wallUp[DISTANCE]    != 0) { neighborSum += chargeUp;    neighborDiffCount += 1.0; }

  float diffusion = 0.0;
  if (neighborDiffCount > 0.0) {
    diffusion = (neighborSum / neighborDiffCount - prev.r) * CHARGE_DIFFUSION;
  }

  // ── Advection with wind ──────────────────────────────────────────────────
  vec2 vel = base.xy;
  vec2 upstreamCoord = texCoord - vel * texelSize * 0.5;
  upstreamCoord = clamp(upstreamCoord, vec2(0.0), vec2(1.0));
  float advectedCharge = texture(chargeTex, upstreamCoord).r;

  float airCharge = mix(prev.r, advectedCharge, 0.32);
  airCharge = airCharge * CHARGE_DECAY + diffusion + netCharge;

  // Lightning discharge — neutralize charge around strike origins this iteration
  for (int d = 0; d < MAX_LT_DISCHARGE; d++) {
    if (d >= ltDischargeCount) break;
    vec2  delta = (texCoord - ltDischarge[d].xy) * resolution;
    float amount = ltDischarge[d].z;
    float rad    = max(ltDischarge[d].w, 4.0);
    float ltType = ltDischargeMeta[d].x;
    float distNorm;
    if (ltType >= 5.0) {
      float dx = abs(delta.x) / rad;
      float dy = abs(delta.y) / (rad * 2.8);
      distNorm = length(vec2(dx, dy));
    } else {
      distNorm = length(delta) / rad;
    }
    float falloff = exp(-distNorm * distNorm * 3.2);
    float discharge = amount * falloff;
    if (discharge > 0.0001) {
      float mag = max(0.0, abs(airCharge) - discharge);
      airCharge = sign(airCharge) * mag;
      if (mag < 0.02)
        airCharge = 0.0;
    }
  }

  airCharge = clamp(airCharge, -1.0, 1.0);

  charge = vec2(airCharge, 0.0);
}
