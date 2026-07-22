#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform float dryLapse;
uniform float simHeight;
uniform float evapHeat;
uniform float surfacePressure; // MSL baseline hPa (Phase B hydrostatic CAPE)

layout(location = 0) out float cape;

#include "common.glsl"

float satVaporHpa(float Tc)
{
  return 6.112 * exp((17.67 * Tc) / (Tc + 243.5));
}

float mixingRatioKg(float Tc, float hpa)
{
  float es = satVaporHpa(Tc);
  return 0.622 * es / max(hpa - es, 0.1);
}

float pressureFromAlt(float altM)
{
  return 1013.25 * pow(max(1e-6, 1.0 - 2.25577e-5 * altM), 5.25588);
}

float moistLapseKperM(float tK, float pHpa)
{
  float g = 9.80665;
  float Rd = 287.05;
  float cp = 1005.7;
  float L = 2.501e6;
  float eps = 0.622;
  float es = satVaporHpa(tK - 273.15);
  float rs = eps * es / max(pHpa - es, 0.1);
  float num = g * (1.0 + (L * rs) / (Rd * tK));
  float den = cp + (L * L * rs * (eps + rs)) / (Rd * tK * tK);
  return num / max(den, 1e-6);
}

float dewpointFromW(float wKg, float pHpa)
{
  // Newton-ish binary search on T for mixing ratio
  float lo = -90.0;
  float hi = 60.0;
  for (int i = 0; i < 18; i++) {
    float mid = 0.5 * (lo + hi);
    if (mixingRatioKg(mid, pHpa) > wKg) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

void main()
{
  float dzR = simHeight / resolution.y;
  float dryLapseM = 9.76 / 1000.0;
  float g = 9.80665;
  float Rd = 287.05;

  // Find surface
  int surfaceY = 0;
  for (int y = 0; y < 512; y++) {
    if (float(y) >= resolution.y) break;
    ivec4 wall = texture(wallTex, vec2(texCoord.x, (float(y) + 0.5) * texelSize.y));
    if (wall[DISTANCE] != 0) { surfaceY = y; break; }
  }

  vec2 sfcCoord   = vec2(texCoord.x, (float(surfaceY) + 0.5) * texelSize.y);
  vec4 sfcBase    = texture(baseTex,  sfcCoord);
  vec4 sfcWater   = texture(waterTex, sfcCoord);
  float sfcTempC  = KtoC(sfcBase[TEMPERATURE] - sfcCoord.y * dryLapse);
  float sfcTdC    = KtoC(dewpoint(clamp(sfcWater[TOTAL], 0.0, maxWater(CtoK(sfcTempC)) * 1.05)));
  float sfcAlt    = float(surfaceY) * dzR;
  // Hydrostatic column: start near ISA station pressure, then integrate with virtual T.
  float p0Isa     = pressureFromAlt(sfcAlt);
  float pSfc      = (surfacePressure > 100.0 ? surfacePressure : 1013.25) * (p0Isa / 1013.25);
  float p         = pSfc;
  float mixW      = mixingRatioKg(min(sfcTdC, sfcTempC), p);

  float prevT  = sfcTempC;
  float prevEnvTk = CtoK(sfcTempC);
  bool saturated = sfcTempC <= sfcTdC + 0.05;
  float totalCape = 0.0;
  bool pastLfc = false;

  for (int y = surfaceY + 1; y < 512; y++) {
    if (float(y) >= resolution.y) break;
    float texY   = (float(y) + 0.5) * texelSize.y;
    vec4 envBase = texture(baseTex, vec2(texCoord.x, texY));
    float envTk  = envBase[TEMPERATURE] - texY * dryLapse;
    float envTdC = KtoC(dewpoint(texture(waterTex, vec2(texCoord.x, texY))[TOTAL]));
    float envW = mixingRatioKg(envTdC, max(p, 50.0));
    float prevW = mixingRatioKg(KtoC(dewpoint(texture(waterTex, vec2(texCoord.x, (float(y - 1) + 0.5) * texelSize.y))[TOTAL])), max(p, 50.0));
    float tv0 = prevEnvTk * (1.0 + 0.6077 * prevW);
    float tv1 = envTk * (1.0 + 0.6077 * envW);
    float tv = 0.5 * (tv0 + tv1);
    p = p * exp(-g * dzR / (Rd * max(tv, 150.0)));
    p = clamp(p, 20.0, 1080.0);

    if (!saturated) {
      prevT -= dryLapseM * dzR;
      float tdP = dewpointFromW(mixW, p);
      if (prevT <= tdP) {
        saturated = true;
        prevT = tdP;
      }
    } else {
      prevT -= moistLapseKperM(CtoK(prevT), p) * dzR;
    }

    float parcelW = saturated ? mixingRatioKg(prevT, p) : mixW;
    float parcelTv = CtoK(prevT) * (1.0 + 0.6077 * parcelW);
    float envTv = envTk * (1.0 + 0.6077 * envW);
    float buoy = 9.81 * (parcelTv - envTv) / max(envTv, 1.0);

    if (buoy > 0.02) pastLfc = true;
    if (pastLfc && buoy > 0.0) totalCape += buoy * dzR;
    if (pastLfc && buoy <= 0.02 && totalCape > 50.0) break;

    prevEnvTk = envTk;
  }

  cape = totalCape;
}
