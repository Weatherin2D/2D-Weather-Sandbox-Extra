#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;    // pixel
in vec2 texCoord;     // this normalized

in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

in vec2 onScreenUV;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D lightTex;
uniform sampler2D noiseTex;
uniform sampler2D surfaceTextureMap;
uniform sampler2D curlTex;

uniform sampler2D ambientLightTex;

// Precomputed procedural strikes (CPU, once per sim step — avoids per-pixel origin search)
#define MAX_LT_STRIKES 4
uniform float ltEventAge;
uniform int ltNumStrikes;
uniform vec4 ltStrikePos[MAX_LT_STRIKES];  // xy=origin px, z=ltType, w=seedSalt
uniform vec4 ltStrikeMeta[MAX_LT_STRIKES]; // x=originMag, y=cloudGate, z=numFlashes

uniform vec2 aspectRatios; // [0] Sim       [1] canvas

#define URBAN 0
#define FIRE_FOREST 1
#define SNOW_FOREST 2
#define FOREST 3
#define INDUS 4

uniform vec2 resolution; // sim resolution
uniform vec2 texelSize;

uniform float cellHeight; // in meters

uniform float dryLapse;
uniform float sunAngle;

uniform float minShadowLight;
uniform float greenHueStartThreshold;
uniform float greenHueEndThreshold;
uniform float greenHueStrength;

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // Xpos   Ypos  Size   type

uniform float displayVectorField;

// Cloud-Cloud Lightning uniforms
uniform float enableCloudLightning;
uniform float cloudLightningIntensity;
uniform float cloudLightningThreshold;
uniform float cloudLightningFrequency;

// Cloud-Ground Lightning uniforms
uniform float enableCloudGroundLightning;
uniform float cloudGroundLightningIntensity;
uniform float cloudGroundLightningThreshold;
uniform float cloudGroundLightningFrequency;

// Strobe lightning uniforms (types 3 & 4)
uniform float enableStrobeLightning;
uniform float strobeLightningIntensity;
uniform float strobeLightningThreshold;
uniform float strobeLightningFrequency;

// Repeat & cross-trigger
uniform int lightningRepeat;       // 1 = allow repeat strikes driven by charge
uniform int lightningCrossTrigger; // 1 = CG can trigger CC crawlers and vice versa

uniform float iterNum;

uniform float time;

uniform float smoothClouds;
uniform float enhancedLooks;

uniform int invertSun;

out vec4 fragmentColor;

#include "common.glsl"

#include "commonDisplay.glsl"

vec4 base, water;
ivec4 wall;
float lightIntensity;

vec3 color;
float opacity = 1.0;

vec3 emittedLight = vec3(0.); // pure emitted light

float shadowLight;

vec3 onLight; // extra light that lights up objects, just like sunlight and shadowlight


const vec3 bareDrySoilCol = pow(vec3(0.85, 0.60, 0.40), vec3(GAMMA));
const vec3 bareWetSoilCol = pow(vec3(0.5, 0.2, 0.1), vec3(GAMMA));
const vec3 greenGrassCol = pow(vec3(0.0, 0.7, 0.2), vec3(GAMMA));
const vec3 dryGrassCol = pow(vec3(0.843, 0.588, 0.294), vec3(GAMMA));


vec4 surfaceTexture(int index, vec2 pos)
{
#define numTextures 5.;             // number of textures in the map
  const float texRelHeight = 1. / numTextures;
  pos.y = clamp(pos.y, 0.01, 0.99); // make sure position is within the subtexture
  pos /= numTextures;
  pos.y += float(index) * texRelHeight;
  return texture(surfaceTextureMap, pos);
}


vec3 getWallColor(float depth)
{
  vec3 vegetationCol = mix(greenGrassCol, dryGrassCol, max(1.0 - water[SOIL_MOISTURE] * (1. / fullGreenSoilMoisture), 0.)); // green to brown

  vec3 bareSoilCol = mix(bareDrySoilCol, bareWetSoilCol, map_rangeC(water[SOIL_MOISTURE], 0.0, 20.0, 0.0, 1.0));

  vec3 surfCol = mix(bareSoilCol, vegetationCol, min(float(wall[VEGETATION]) / 50., 1.));

  const vec3 rockCol = vec3(0.70);                                 // gray rock

  vec3 color = mix(surfCol, rockCol, clamp(depth * 0.35, 0., 1.)); // * 0.15


  color *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.2).rgb;                                   // add noise texture

  color = mix(color, vec3(1.0), clamp(min(water[SNOW], fullWhiteSnowHeight) / fullWhiteSnowHeight - max(depth * 0.3, 0.), 0.0, 1.0)); // mix in white for snow cover

  return color;
}

float saturate(float x) { return min(1.0, max(0.0, x)); }
vec3 saturate(vec3 x) { return min(vec3(1., 1., 1.), max(vec3(0., 0., 0.), x)); }


vec3 bump3y(vec3 x, vec3 yoffset)
{
  vec3 y = vec3(1., 1., 1.) - x * x;
  y = saturate(y - yoffset);
  return y;
}
vec3 spectral_zucconi(float w)
{
  // w: [400, 700] wavelenght(nm)
  // x: [0,   1]
  float x = saturate((w - 400.0) / 300.0);
  const vec3 cs = vec3(3.54541723, 2.86670055, 2.29421995);
  const vec3 xs = vec3(0.69548916, 0.49416934, 0.28269708);
  const vec3 ys = vec3(0.02320775, 0.15936245, 0.53520021);
  return bump3y(cs * (x - xs), ys);
}


float rand(float n) { return fract(sin(n) * 43758.5453123); }

const float BOLT_MAX_TURN_RAD = 0.785398; // 45 degrees

vec2 clampDirTurn(vec2 parentDir, vec2 dir, float maxTurn) {
  float pl = length(parentDir);
  float dl = length(dir);
  if (pl < 0.0001) return dl > 0.0001 ? (dir / dl) : vec2(0.0, -1.0);
  if (dl < 0.0001) return parentDir / pl;
  parentDir /= pl;
  dir /= dl;
  float pa = atan(parentDir.y, parentDir.x);
  float diff = atan(dir.y, dir.x) - pa;
  diff = atan(sin(diff), cos(diff));
  diff = clamp(diff, -maxTurn, maxTurn);
  float na = pa + diff;
  return vec2(cos(na), sin(na));
}

vec2 deviateDir(vec2 parentDir, float seedVal, float maxTurn) {
  float pl = length(parentDir);
  vec2 pd = pl > 0.0001 ? parentDir / pl : vec2(0.0, -1.0);
  float pa = atan(pd.y, pd.x);
  float dev = (rand(seedVal) - 0.5) * 2.0 * maxTurn;
  float ang = pa + dev;
  return vec2(cos(ang), sin(ang));
}

// Lateral displacement step — capped so polyline cannot fold past 45° from axis
float boltDispKick(float len, int segCount, float dispStr, float seed, int i, inout float accumDisp) {
  float stepFwd = len / float(segCount);
  float maxKick = stepFwd * tan(BOLT_MAX_TURN_RAD);
  float kick = (rand(seed + float(i) * 17.31) - 0.5) * min(dispStr * 1.42, maxKick * 2.0);
  kick = clamp(kick, -maxKick, maxKick);
  accumDisp = (accumDisp + kick) * 0.56;
  float maxTotalDisp = len * tan(BOLT_MAX_TURN_RAD) * 0.50;
  return clamp(accumDisp, -maxTotalDisp, maxTotalDisp);
}
float strikeRenderSeed(vec2 origin, float seedSalt, int slot) {
  vec2 o = origin * 0.00391;
  float h = dot(o, vec2(12.9898, 78.233)) + seedSalt * 173.31 + float(slot) * 53.17;
  h += rand(seedSalt * 0.137 + float(slot) * 19.7) * 6.28318;
  return fract(sin(h) * 43758.5453) * 14000.0 + 777.0;
}

// ── CG Lightning: segmented fractal bolt renderer ──────────────────────────
//
// Bolts are split into N segments whose endpoints are displaced perpendicular
// to the main axis with exponential damping.  Per-pixel glow is the smooth
// falloff from the minimum distance to any segment.  Branches reuse the same
// logic from junction points on the main trunk.

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float lenSq = dot(ab, ab);
  if (lenSq < 0.0001) return length(p - a);
  float t = clamp(dot(p - a, ab) / lenSq, 0.0, 1.0);
  return length(p - (a + t * ab));
}

// Displaced bolt position at parameter targetT in [0,1].
// Uses the same deterministic rand() chain as cgBoltGlow() so positions agree.
vec2 boltPosAtT(vec2 bStart, vec2 bEnd, float seed, float targetT, float dispStr) {
  vec2 dir  = bEnd - bStart;
  float len = length(dir);
  if (len < 0.001) return bStart;
  vec2 perp = vec2(-dir.y, dir.x) / len;

  const int N = 11;
  float accumDisp = 0.0;
  for (int i = 1; i <= N; i++) {
    float prevT    = float(i - 1) / float(N);
    float currT    = float(i)     / float(N);
    float prevAcc  = accumDisp;
    accumDisp = boltDispKick(len, N, dispStr, seed, i, accumDisp);
    if (targetT <= currT) {
      float localT = (currT > prevT) ? (targetT - prevT) / (currT - prevT) : 1.0;
      return mix(bStart, bEnd, targetT) + perp * mix(prevAcc, accumDisp, localT);
    }
  }
  return bEnd;
}

// CG bolt endpoints (shared by render + ground impact)
void cgBoltEndpoints(vec2 center, float seed, out vec2 dSt, out vec2 dEn) {
  float ds   = seed + 2000.0;
  float hOff = (rand(ds + 1.0) - 0.5) * resolution.x * 0.03;
  dSt = center + vec2(hOff, 0.0);
  dEn = vec2(dSt.x + (rand(ds + 2.0) - 0.5) * resolution.x * 0.025, 0.0);
}

vec2 cgGroundImpact(vec2 center, float seed, float dispStr) {
  vec2 dSt, dEn;
  cgBoltEndpoints(center, seed, dSt, dEn);
  vec2 pt = boltPosAtT(dSt, dEn, seed + 2000.0, 1.0, dispStr);
  return vec2(pt.x, 0.0);
}

// Minimum-distance glow for a multi-segment bolt (sharp core + soft halo).
// wideHalo > 0.5: wide soft flash channel parallel to bolt path (no bright core).
float cgBoltGlow(vec2 p, vec2 bStart, vec2 bEnd, float seed,
                 float coreThick, float dispStr, float maxT, float wideHalo) {
  vec2 dir  = bEnd - bStart;
  float len = length(dir);
  if (len < 0.01) return 0.0;
  vec2 midPt = (bStart + bEnd) * 0.5;
  float reach = len * 0.55 + coreThick * (wideHalo > 0.5 ? 20.0 : 16.0);
  if (length(p - midPt) > reach) return 0.0;

  vec2 perp = vec2(-dir.y, dir.x) / len;

  const int N = 11;
  float accumDisp = 0.0;
  float minDist   = 1.0e6;
  vec2  prevPt    = bStart;
  vec2  prevSegD  = dir / len;

  for (int i = 1; i <= N; i++) {
    float segFrac = float(i) / float(N);
    accumDisp = boltDispKick(len, N, dispStr, seed, i, accumDisp);
    float usedFrac = min(segFrac, maxT);
    vec2  currPt   = mix(bStart, bEnd, usedFrac) + perp * accumDisp;

    vec2 seg = currPt - prevPt;
    float sl = length(seg);
    if (sl > 0.0001) {
      vec2 segD = seg / sl;
      if (i > 1) {
        segD = clampDirTurn(prevSegD, segD, BOLT_MAX_TURN_RAD);
        currPt = prevPt + segD * sl;
      }
      prevSegD = segD;
    }

    minDist = min(minDist, segDist(p, prevPt, currPt));
    prevPt  = currPt;
    if (segFrac >= maxT) break;
  }

  if (wideHalo > 0.5) {
    float halo = 1.0 - smoothstep(0.0, coreThick, minDist);
    return halo * halo * 0.16;
  }

  float core = 1.0 - smoothstep(0.0, coreThick,       minDist);
  float midGlow = 1.0 - smoothstep(0.0, coreThick * 4.0, minDist);
  float halo = 1.0 - smoothstep(0.0, coreThick * 16.0, minDist);
  return core + midGlow * 0.72 + halo * 0.38;
}

// Shared bolt thickness — same core/flash halo for every type
float boltLineThick(float baseThick, float wideHalo) {
  return baseThick * (wideHalo > 0.5 ? 5.5 : 1.75);
}

// Strobe: type 3 = flash only; type 4 = flash + thin in-cloud bolts (same thickness as other types)
float strobeCloudGlow(vec2 p, vec2 center, float seed, float prog,
                      float baseThick, float baseDisp, float wideHalo, int ltType) {
  float lineThick = boltLineThick(baseThick, wideHalo);

  // Flash channel follows a short in-cloud stub so bloom matches other types
  vec2  stubDir = deviateDir(vec2(0.0, -1.0), seed + 11.0, BOLT_MAX_TURN_RAD);
  vec2  stubEnd = center + stubDir * resolution.y * 0.045 * prog;
  float flashStub = cgBoltGlow(p, center, stubEnd, seed + 50.0, lineThick, baseDisp, prog, wideHalo);

  if (ltType == 3 || wideHalo > 0.5)
    return flashStub;

  float maxG = flashStub * 0.15;
  vec2 baseDir = normalize(vec2(1.0, -0.30));
  for (int i = 0; i < 3; i++) {
    float is  = seed + float(i) * 77.0 + 900.0;
    vec2  dir = deviateDir(baseDir, is, BOLT_MAX_TURN_RAD);
    float len = resolution.x * 0.038;
    vec2  end = center + dir * len * prog;
    maxG = max(maxG, cgBoltGlow(p, center, end, is, lineThick, baseDisp, prog, 0.0));
  }
  return maxG;
}

// Anvil crawler for CC types; CG = single vertical ground bolt only
float anvilCrawlerGlow(vec2 p, vec2 center, float seed, float prog,
                       float baseThick, float baseDisp, int ltType, float wideHalo,
                       float sizeScale) {
  float maxG = 0.0;
  float lineThick   = boltLineThick(baseThick, wideHalo);
  float branchThick = lineThick * (wideHalo > 0.5 ? 0.73 : 0.49);
  float dispVar = baseDisp;

  // CG: one jagged bolt — always targets y=0, uses full path when prog high
  if (ltType >= 5) {
    vec2 dSt, dEn;
    cgBoltEndpoints(center, seed, dSt, dEn);
    float ds = seed + 2000.0;
    float drawProg = (prog > 0.85) ? 1.0 : prog;
    float cgDisp = dispVar * 1.35;
    maxG = cgBoltGlow(p, dSt, dEn, ds, lineThick, cgDisp, drawProg, wideHalo);
    return maxG;
  }

  // Crawler flash channel — strobe-like horizontal glow extended through cloud
  if (ltType <= 2 && wideHalo > 0.5) {
    float flashReach = resolution.x * (ltType == 1 ? 0.10 : 0.13);
    float driftF   = (rand(seed + 4.0) - 0.5) * tan(BOLT_MAX_TURN_RAD) * 0.55;
    vec2  hDirF    = normalize(vec2(1.0, driftF));
    maxG = max(cgBoltGlow(p, center, center + hDirF * flashReach * prog, seed + 800.0,
                          lineThick, dispVar * 0.65, prog, wideHalo),
               cgBoltGlow(p, center, center + deviateDir(-hDirF, seed + 801.0, BOLT_MAX_TURN_RAD) * flashReach * 0.72 * prog, seed + 801.0,
                          lineThick, dispVar * 0.65, prog, wideHalo));
    vec2 stubDir = deviateDir(vec2(0.0, -1.0), seed + 11.0, BOLT_MAX_TURN_RAD);
    vec2 stubEnd = center + stubDir * resolution.y * 0.04 * prog;
    maxG = max(maxG, cgBoltGlow(p, center, stubEnd, seed + 802.0,
                                lineThick, dispVar * 0.55, prog, wideHalo));
    return maxG;
  }

  // CC / spider crawlers (types 1 & 2) — bolt paths
  float mainLen = resolution.x * (ltType == 1 ? 0.10 : 0.12) * sizeScale;
  float drift   = (rand(seed + 4.0) - 0.5) * tan(BOLT_MAX_TURN_RAD) * 0.55;
  vec2  hDir    = normalize(vec2(1.0, drift));
  float crawlDisp = dispVar * 1.15;

  vec2 hEndR = center + hDir * mainLen;
  vec2 hEndL = center + deviateDir(-hDir, seed + 50.0, BOLT_MAX_TURN_RAD) * mainLen * 0.65;
  maxG = max(cgBoltGlow(p, center, hEndR, seed,       lineThick, crawlDisp, prog, wideHalo),
             cgBoltGlow(p, center, hEndL, seed + 100.0, lineThick * 0.82, crawlDisp, prog, wideHalo));

  int maxSpider = (ltType == 1) ? 2 : 3;
  int numSpider = 1 + int(floor(rand(seed + 601.0) * float(maxSpider) + 0.001));

  for (int b = 0; b < 4; b++) {
    if (b >= numSpider) continue;
    float bs = seed + float(b) * 131.0 + 500.0;
    float useRight = step(0.5, rand(bs + 0.5));
    vec2  trunk = mix(hEndL, hEndR, useRight);
    float trunkSeed = mix(seed + 100.0, seed, useRight);
    vec2  trunkDir = normalize(trunk - center);
    float tAlong = 0.18 + rand(bs + 1.0) * 0.65;
    vec2  junc   = boltPosAtT(center, trunk, trunkSeed, tAlong * prog, crawlDisp);
    vec2  bDir   = deviateDir(trunkDir, bs + 3.0, BOLT_MAX_TURN_RAD);
    float bLen   = mainLen * 0.22;
    vec2  bEnd   = junc + bDir * bLen * prog;
    maxG = max(maxG, cgBoltGlow(p, junc, bEnd, bs, branchThick, crawlDisp, prog, wideHalo));

    if (wideHalo < 0.5 && ltType >= 2 && prog > 0.50 && rand(bs + 6.0) > 0.45) {
      float fs = bs + 7000.0;
      vec2  fDir = deviateDir(bDir, fs, BOLT_MAX_TURN_RAD);
      vec2  fEnd = bEnd + fDir * bLen * 0.22 * prog;
      maxG = max(maxG, cgBoltGlow(p, bEnd, fEnd, fs, branchThick * 0.42, crawlDisp * 1.2, prog, wideHalo));
    }
  }

  int numSide = (ltType == 1) ? 1 : 2;
  for (int t = 0; t < 2; t++) {
    if (t >= numSide) continue;
    float ts    = seed + float(t) * 97.3 + 300.0;
    vec2  tDir  = deviateDir(hDir, ts + 2.0, BOLT_MAX_TURN_RAD);
    float tLen  = mainLen * 0.30;
    vec2  tEnd  = center + tDir * tLen;
    maxG = max(maxG, cgBoltGlow(p, center, tEnd, ts, branchThick * 1.15, crawlDisp, prog, wideHalo));
  }

  return maxG;
}

vec3 boltColorForType(int ltType, float tG, vec2 origin, vec2 pixel) {
  vec3 coolEdge = vec3(0.62, 0.72, 0.95);
  vec3 hotCore  = vec3(1.0, 0.99, 0.97);
  float coreMix = clamp(tG * 1.8, 0.0, 1.0);
  return mix(coolEdge, hotCore, coreMix);
}

vec4 getAirColor(vec2 fragCoordIn)
{
  vec2 bndFragCoord = vec2(fragCoordIn.x, clamp(fragCoordIn.y, 0., resolution.y)); // bound y within range
  base = smoothBilerpWallVis(baseTex, wallTex, bndFragCoord);
  wall = texture(wallTex, bndFragCoord * texelSize);                               // texCoord
  water = (smoothClouds > 0.5 || enhancedLooks > 0.5)
    ? smoothBilerpWallVis(waterTex, wallTex, bndFragCoord)
    : bilerpWallVis(waterTex, wallTex, bndFragCoord);
  lightIntensity = texture(lightTex, bndFragCoord * texelSize)[0] / standardSunBrightness;

  ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);

  float realTemp = potentialToRealT(base[TEMPERATURE]);

  bool nightTime = abs(sunAngle) > 85.0 * deg2rad; // false = day time

  shadowLight = minShadowLight;

  // fragmentColor = vec4(vec3(light),1); return; // View light texture for debugging

  // Calculate fog/mist opacity based on relative humidity (haze only, no condensation effects)
  float relHum = water[TOTAL] / maxWater(realTemp);
  float fogMistOpacity = 0.0;

  // RH fog: instant appearance/disappearance based on RH levels
  // Disable RH fog when Enhanced Looks is enabled to prevent pixelation with dark storm clouds
  if (enhancedLooks < 0.5 && maxWater(realTemp) > 0.001) {
    // No condensation below 99% RH
    if (relHum >= 0.99) {
      // Linear interpolation: 25% condense at 99% RH, 100% condense at 100% RH
      float condenseAmount = mix(0.25, 1.0, clamp((relHum - 0.99) / (1.0 - 0.99), 0.0, 1.0));
      fogMistOpacity = condenseAmount * 0.00025; // Scale to appropriate opacity level
    }
  }

  float cloudwater = water[CLOUD];

  float cloudDensity = max(cloudwater * 13.0, 0.0);
  // Lower precipitation threshold when enhancedLooks is on so rain shafts appear with lighter rainfall
  float precipThreshold = enhancedLooks > 0.5 ? 0.01 : 0.05;
  float precipDensity = max(water[PRECIPITATION] - precipThreshold, 0.0) * 0.8;
  float totalDensity = cloudDensity + precipDensity; // visualize precipitation

  // Enhanced looks: more ominous, darker storm clouds
  vec3 cloudCol;
  if (enhancedLooks > 0.5) {
    // Create smooth gradient from dark storm -> gray -> white
    // This inverts the traditional approach for dramatic effect
    float t = clamp(totalDensity * 0.4, 0.0, 1.0); // Normalized density factor
    
    vec3 darkStormCol = vec3(0.08, 0.10, 0.14);  // Very dark blue-black for core
    vec3 stormCol = vec3(0.15, 0.18, 0.22);       // Dark storm blue-gray
    vec3 grayCol = vec3(0.45, 0.48, 0.52);        // Medium gray
    vec3 whiteCol = vec3(0.85, 0.87, 0.90);       // Off-white edges
    
    if (t < 0.4) {
      // Very dark center (0.0 to 0.4)
      float localT = t / 0.4;
      cloudCol = mix(darkStormCol, stormCol, smoothstep(0.0, 1.0, localT));
    } else if (t < 0.7) {
      // Dark storm to gray (0.4 to 0.7)
      float localT = (t - 0.4) / 0.3;
      cloudCol = mix(stormCol, grayCol, smoothstep(0.0, 1.0, localT));
    } else {
      // Gray to light edges (0.7 to 1.0)
      float localT = (t - 0.7) / 0.3;
      cloudCol = mix(grayCol, whiteCol, smoothstep(0.0, 1.0, localT));
    }
  } else {
    // Original calculation
    cloudCol = vec3(1.0 / (cloudwater * 0.005 + 1.0)); // 0.10 white to black
  }

  float cloudOpacity;
  if (enhancedLooks > 0.5) {
    // For enhanced looks: smooth transition from light to dark clouds
    // Use smoothstep for gradual transition instead of hard cutoff
    float densityThreshold = 1.0; // Start transition at this density
    float densityMax = 2.5;       // Full opacity reached at this density
    float transitionFactor = smoothstep(densityThreshold, densityMax, totalDensity);
    
    // Calculate opacity with higher contrast for dramatic effect
    float enhancedDensity = totalDensity * transitionFactor;
    cloudOpacity = clamp(1.0 - (1.0 / (1. + enhancedDensity * 1.5)), 0.0, 1.0);
  } else {
    // Original opacity calculation
    cloudOpacity = clamp(1.0 - (1.0 / (1. + totalDensity)), 0.0, 1.0);
  }

  const vec3 smokeThinCol = vec3(0.8, 0.51, 0.26);
  const vec3 smokeThickCol = vec3(0., 0., 0.);


  float smokeOpacity = clamp(1. - (1. / (water[SMOKE] + 1.)), 0.0, 1.0);
  float fireIntensity = clamp((smokeOpacity - 0.8) * 25., 0.0, 1.0);

  vec3 fireCol = hsv2rgb(vec3(fireIntensity * 0.008, 0.98, 5.0)) * 1.0; // 1.0, 0.7, 0.0

  vec3 smokeOrFireCol = mix(mix(smokeThinCol, smokeThickCol, smokeOpacity), fireCol, fireIntensity);

  shadowLight += fireIntensity * 2.5;                                                                                 // 1.5

  float opacity = 1. - (1. - smokeOpacity) * (1. - cloudOpacity) * (1. - fogMistOpacity);                     // alpha blending with fog/mist
  vec3 color;
  if (opacity > 0.0) {
    color = (smokeOrFireCol * smokeOpacity / opacity) + (cloudCol * cloudOpacity * (1. - smokeOpacity) / opacity) + (vec3(0.95) * fogMistOpacity * (1. - smokeOpacity) * (1. - cloudOpacity) / opacity);
  } else {
    color = vec3(0.0);
  }

  // Invert Sun: Add sunrays pointing towards center of map
  if (invertSun == 1 && cloudOpacity > 0.01) {
    vec2 center = resolution * 0.5;
    vec2 toCenter = normalize(center - fragCoordIn);
    
    // Calculate angle-based sunray intensity
    float rayAngle = atan(toCenter.y, toCenter.x);
    float rayIntensity = 0.5 + 0.5 * sin(rayAngle * 8.0 + iterNum * 0.1);
    
    // Distance-based falloff
    float distToCenter = length(fragCoordIn - center);
    float distFalloff = smoothstep(0.0, resolution.x * 0.5, distToCenter);
    
    // Apply sunray effect - brighter rays with golden/orange tint
    vec3 sunrayColor = vec3(1.0, 0.8, 0.5) * rayIntensity * (1.0 - distFalloff) * 0.4;
    
    // Enhance cloud edges with backlighting
    float edgeEnhancement = smoothstep(0.0, 0.3, cloudOpacity) * smoothstep(1.0, 0.7, cloudOpacity);
    vec3 backlitColor = mix(cloudCol, vec3(1.0, 0.9, 0.7), edgeEnhancement * 0.3);
    
    color = mix(color, backlitColor, edgeEnhancement * 0.5);
    color += sunrayColor * cloudOpacity;
  }

  return vec4(color, opacity);
}

void main()
{
  vec2 bndFragCoord = vec2(fragCoord.x, clamp(fragCoord.y, 0., resolution.y)); // bound y within range
  base = smoothBilerpWallVis(baseTex, wallTex, bndFragCoord);
  wall = texture(wallTex, bndFragCoord * texelSize);                           // texCoord
  water = (smoothClouds > 0.5 || enhancedLooks > 0.5)
    ? smoothBilerpWallVis(waterTex, wallTex, bndFragCoord)
    : bilerpWallVis(waterTex, wallTex, bndFragCoord);
  lightIntensity = texture(lightTex, bndFragCoord * texelSize)[0] / standardSunBrightness;

  ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);

  float realTemp = potentialToRealT(base[TEMPERATURE]);

  bool nightTime = abs(sunAngle) > 85.0 * deg2rad; // false = day time

  shadowLight = minShadowLight;

  // fragmentColor = vec4(vec3(light),1); return; // View light texture for debugging

  float cloudwater = water[CLOUD];

  if (texCoord.y < 0.) {                                     // < texelSize.y below simulation area

    float depth = float(-wall[VERT_DISTANCE]) - fragCoord.y; // -1.0?

    color = getWallColor(depth);

    lightIntensity = texture(lightTex, vec2(texCoord.x, texelSize.y))[0] / standardSunBrightness; // sample lowest part of sim area
    lightIntensity *= pow(0.5, -fragCoord.y);                                                     // 0.5 should be same as in lightingshader deeper is darker

  } else if (texCoord.y > 1.0) {                                                                  // above simulation area
    // color = vec3(0); // no need to set
    opacity = 0.0;                  // completely transparent
  } else if (wall[DISTANCE] == 0) { // is wall
                                    // color = getWallColor(texCoord);

    ivec4 wallXmY0 = texture(wallTex, texCoordXmY0);
    ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);

    switch (wall[TYPE]) {
      // case WALLTYPE_INERT:
      //   color = vec3(0, 0, 0);
      //   break;

    case WALLTYPE_RUNWAY:

      if (wall[VERT_DISTANCE] == 0) {
        vec2 modTexCoord = mod(texCoord * resolution, 1.0);

        color = vec3(0.1);
        color *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.2).rgb; // add noise texture

        if (length(modTexCoord - vec2(0.7, 0.97)) < 0.03) {                                               // side lights
          onLight += vec3(1., 0.8, 0.3) * 300.0;
        }

        if (abs(mod(-iterNum - floor(texCoord.x * resolution.x), 150.0)) < 1.0 && length(modTexCoord - vec2(0.2, 0.98)) < 0.02) {
          onLight += vec3(0., 1.0, 0.) * 5000.0;
        }

        break;
      }

    case WALLTYPE_URBAN:
    case WALLTYPE_SUBURBAN:
    case WALLTYPE_INDUSTRIAL:
    case WALLTYPE_FIRE:
    case WALLTYPE_LAND:

      // horizontally interpolate depth value
      float interpDepth = mix(mix(float(-wallXmY0[VERT_DISTANCE]), float(-wall[VERT_DISTANCE]), clamp(fract(fragCoord.x) + 0.5, 0.5, 1.)), float(-wallXpY0[VERT_DISTANCE]), clamp(fract(fragCoord.x) - 0.5, 0., 0.5));
      float depth = interpDepth - fract(fragCoord.y); // - 1.0 ?

      color = getWallColor(depth);

      break;
    case WALLTYPE_WATER:

      // Precomputed values (tweak to taste)
      // Frequencies
      const int numWaveComp = 5;
      const float freqs[numWaveComp] = float[numWaveComp](2.3, 3.7, 5.1, 7.6, 21.7);
      // Amplitudes
      const float amps[numWaveComp] = float[numWaveComp](0.05, 0.03, 0.02, 0.015, 0.004);
      // Speeds
      const float speeds[numWaveComp] = float[numWaveComp](0.006, 0.011, 0.018, 0.025, 0.05);
      // Phases (in radians)
      const float phases[numWaveComp] = float[numWaveComp](1.2, 3.9, 0.7, 5.1, 3.1);

      // Sum up the components
      float waveSignalL = 0.0;
      float waveSignalR = 0.0;

      for (int i = 0; i < numWaveComp; i++) {
        waveSignalL += sin(fragCoord.x * freqs[i] + iterNum * speeds[i] + phases[i]) * amps[i];
        waveSignalR += sin(fragCoord.x * freqs[i] - iterNum * speeds[i] + phases[i]) * amps[i];
      }

      vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);
      float windSpeed = baseX0Yp[VX] * 10.;

      // combine based on wind direction
      float waterLevel = 0.8 + waveSignalL * max(-windSpeed, 0.) + waveSignalR * max(windSpeed, 0.);

      if (wall[VERT_DISTANCE] == 0 && fract(fragCoord.y) > waterLevel) { // air
        vec4 airColor = getAirColor(fragCoord + vec2(0., 0.5));

        opacity = airColor.a;
        color = airColor.rgb;
      } else {
        color = vec3(0, 0.5, 1.0); // water
      }

      // draw 45° slopes under water

      float localX = fract(fragCoord.x);
      float localY = fract(fragCoord.y);

      if (wallXmY0[DISTANCE] == 0 && wallXmY0[TYPE] != WALLTYPE_WATER && (fragCoord.y < 1. || wallX0Ym[TYPE] != WALLTYPE_WATER)) { // wall to the left and below
        if (localX + localY < 1.0) {
          opacity = 1.0;
          water = texture(waterTex, texCoord);
          color = getWallColor(float(-wall[VERT_DISTANCE]) - localY);
          shadowLight = minShadowLight;
        }
      }
      if (wallXpY0[DISTANCE] == 0 && wallXpY0[TYPE] != WALLTYPE_WATER && (fragCoord.y < 1. || wallX0Ym[TYPE] != WALLTYPE_WATER)) { // wall to the right and below
        if (localY - localX < 0.0) {
          opacity = 1.0;
          water = texture(waterTex, texCoord);
          color = getWallColor(float(-wall[VERT_DISTANCE]) - localY);
          shadowLight = minShadowLight;
        }
      }

      break;
    }
  } else { // air

    vec4 airColor = getAirColor(fragCoord);

    opacity = airColor.a;
    color = airColor.rgb;

    // Types: 1=spider 2=CC 3=strobe flash 4=strobe lightning 5=CG 6=CG heavy
    if (ltNumStrikes > 0 && ltEventAge >= 0.0
        && (enableCloudLightning > 0.5 || enableCloudGroundLightning > 0.5 || enableStrobeLightning > 0.5)) {
      float fadeTail     = 6.0;
      float flashCore    = 4.0;
      float eventAge     = ltEventAge;

      float fadeAge = max(eventAge - flashCore, 0.0);
      float fadeT   = clamp(fadeAge / fadeTail, 0.0, 1.0);
      float globalFade = smoothstep(0.0, 1.0, eventAge)
                       * (1.0 - fadeT * fadeT * (3.0 - 2.0 * fadeT));

      if (globalFade >= 0.002) {
        for (int s = 0; s < MAX_LT_STRIKES; s++) {
          if (s >= ltNumStrikes) break;

          vec2  bOrigin    = ltStrikePos[s].xy;
          float seed       = strikeRenderSeed(bOrigin, ltStrikePos[s].w, s);
          int   ltType     = int(ltStrikePos[s].z + 0.5);
          float originMag  = ltStrikeMeta[s].x;
          float cloudGate  = ltStrikeMeta[s].y;
          int   numFlashes = int(ltStrikeMeta[s].z + 0.5);

          bool isStrobe = (ltType == 3 || ltType == 4);
          bool isCrawler = (ltType == 1 || ltType == 2);
          bool isCG     = (ltType >= 5);
          float typeThreshold = isStrobe ? strobeLightningThreshold : cloudLightningThreshold;
          if (ltType == 0
              || cloudGate < typeThreshold * 0.35
              || ((ltType >= 1 && ltType <= 2) && enableCloudLightning < 0.5)
              || (isStrobe && enableStrobeLightning < 0.5)
              || (isCG && enableCloudGroundLightning < 0.5))
            continue;

          // Uniform bolt size for all strikes
          float cloudScale = 1.0;

          float strikeReach = resolution.x * (isCrawler ? 0.18 : (isStrobe ? 0.12 : 0.15));
          float distOrigin  = length(fragCoord - bOrigin);
          if (distOrigin <= strikeReach) {
            float reachFade = 1.0 - smoothstep(strikeReach * 0.78, strikeReach, distOrigin);

            float crawlThick = resolution.x * 0.000068;
            float crawlDisp  = resolution.x * 0.012;
            float intensity  = isCG ? cloudGroundLightningIntensity
                            : (isStrobe ? strobeLightningIntensity : cloudLightningIntensity);
            // Mild charge boost for flash/bolt brightness (capped)
            float chargeFlash = 1.0 + min(originMag * 0.28, 0.22);
            float cloudClip  = isCG ? 1.0
              : smoothstep(typeThreshold * 0.30, typeThreshold * 1.15, opacity);

            for (int f = 0; f < 2; f++) {
              if (f >= numFlashes) break;
              float fDelay = float(f) * 4.0;
              float fAge   = eventAge - fDelay;
              if (fAge < 0.0) continue;

              float growFrames  = 1.2 + rand(seed + 903.0 + float(f)) * 1.0;
              float repFade     = pow(0.50, float(f));

              float boltProg = clamp(fAge / growFrames, 0.0, 1.0);
              // CG grows quickly and completes path to ground
              if (isCG)
                boltProg = clamp(1.0 - pow(1.0 - boltProg, 2.2), 0.0, 1.0);
              float riseFade = smoothstep(0.0, growFrames, fAge);
              float flick = 0.88 + 0.12 * rand(iterNum * 1.9 + seed + float(f) * 131.0);
              float envFade = riseFade * repFade * globalFade * flick * reachFade;

              // Strobe + crawler pulse within flash window
              if (isStrobe || isCrawler) {
                float strobeT = mod(fAge + seed * 0.017, 2.2);
                float pulse = 0.50 + 0.50 * max(sin(strobeT * 10.0 + rand(seed + 77.0) * 6.28), 0.0);
                if (isCrawler)
                  pulse = 0.62 + 0.38 * max(sin(strobeT * 7.5 + rand(seed + 88.0) * 6.28), 0.0);
                if (isStrobe && ltType == 4)
                  pulse *= 0.55 + 0.45 * step(0.25, sin(strobeT * 16.0));
                envFade *= pulse;
              }

              if (envFade < 0.003) continue;

              float boltSeed = seed + float(f) * 8191.0;

              float tG = 0.0;
              float flashG = 0.0;
              if (isStrobe) {
                tG     = strobeCloudGlow(fragCoord, bOrigin, boltSeed, boltProg,
                                         crawlThick, crawlDisp, 0.0, ltType);
                flashG = strobeCloudGlow(fragCoord, bOrigin, boltSeed, boltProg,
                                         crawlThick, crawlDisp, 1.0, ltType);
              } else {
                tG = anvilCrawlerGlow(fragCoord, bOrigin, boltSeed,
                                      boltProg, crawlThick, crawlDisp, ltType, 0.0, cloudScale);
                if (envFade > 0.02 && opacity > typeThreshold * 0.4 && cloudClip > 0.01)
                  flashG = anvilCrawlerGlow(fragCoord, bOrigin, boltSeed,
                                            boltProg, crawlThick, crawlDisp, ltType, 1.0, cloudScale);
              }

              if (isCG && boltProg > 0.75) {
                vec2 impactPt = cgGroundImpact(bOrigin, boltSeed, crawlDisp * 1.35);
                float impactDist = length(fragCoord - impactPt);
                float impactR = resolution.y * 0.030;
                float impactG = exp(-impactDist / impactR) * clamp((boltProg - 0.75) / 0.25, 0.0, 1.0);
                vec3 impactCol = vec3(1.0, 0.95, 1.0) * intensity * 0.55 * impactG * envFade * chargeFlash;
                emittedLight += impactCol;
                onLight      += impactCol * 0.45;
              }

              // Bolts — same brightness for every type (strobe type 3 has no core bolt)
              if (tG > 0.003 && cloudClip > 0.01 && ltType != 3) {
                float bright = intensity * 1.08 * flick * envFade * chargeFlash * cloudClip;
                vec3 col = boltColorForType(ltType, tG, bOrigin, fragCoord) * bright * tG;
                emittedLight += col;
                onLight      += col * 0.52;
              }

              // Flash / bloom — same for every type, mild charge scaling
              if (flashG > 0.008 && cloudClip > 0.01) {
                float flashBright = intensity * 0.022 * envFade * chargeFlash
                                  * flashG * opacity * cloudClip;
                vec3 flashCol = mix(vec3(0.45, 0.52, 0.72), vec3(0.72, 0.76, 0.88), clamp(flashG * 0.7, 0.0, 1.0))
                                * flashBright;
                emittedLight += flashCol;
                onLight      += flashCol * 0.07;
              }
            }
          }
        }
      }
    } // end procedural lightning


    vec2 rainbowCenter = vec2(0.0, -1.5 + abs(sunAngle) * 0.60);

    float centerDist = length(onScreenUV - rainbowCenter) * 1.3;

    const float cameraHeight = 1.0;

    float angle = atan(centerDist / cameraHeight) * rad2deg;

    float waveLength = map_range(angle, 40.0, 42.0, 400., 700.);

    float rainSnowFactor = map_rangeC(KtoC(realTemp), 0.0, 5.0, 0.0, 1.0); // only rain if above freezing

    vec3 rainbowCol = spectral_zucconi(waveLength) * min(pow(lightIntensity, 2.0) * 1.9, 1.0) * min(water[PRECIPITATION] * 3.0, 1.0) * rainSnowFactor * 0.7;

    emittedLight += rainbowCol;
    opacity = max(opacity - length(rainbowCol), 0.);

    float startT = min(greenHueStartThreshold, greenHueEndThreshold);
    float endT = max(greenHueStartThreshold, greenHueEndThreshold);
    float glowStrength = smoothstep(startT, endT, water[PRECIPITATION]) * greenHueStrength;
    if (glowStrength > 0.0) {
      float gradient = smoothstep(0.15, 0.85, texCoord.y);
      float softness = pow(glowStrength, 2.0);
      vec3 hueGlow = vec3(0.0, 0.7, 0.3);
      vec3 glow = hueGlow * softness * (0.12 + 0.18 * gradient);
      vec3 saturatedColor = mix(color, color + glow, 0.18 * softness);
      color = mix(color, saturatedColor, 0.5 * greenHueStrength);
      emittedLight += glow * 0.12 * (0.7 + 0.3 * gradient);
      opacity = clamp(opacity + softness * 0.04, 0.0, 1.0);
    }

    if (wall[VERT_DISTANCE] >= 0 && wall[VERT_DISTANCE] < 10) { // near surface
      float localX = fract(fragCoord.x);
      float localY = fract(fragCoord.y);
      // ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);

#define texAspect 2560. / 4096. // height / width of tree texture
#define maxTreeHeight 40.       // height in meters when vegetation max = 127
#define maxBuildingHeight 400.  // height in meters upto wich the urban texture reaches


      if (wallX0Ym[TYPE] == WALLTYPE_URBAN) {

        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);

        float urbanTexHeightNorm = maxBuildingHeight / cellHeight;

        float urbanTexCoordX = mod(fragCoord.x, resolution.x) * texAspect / urbanTexHeightNorm;
        float urbanTexCoordY = heightAboveGround / urbanTexHeightNorm;

        urbanTexCoordY = 1.0 - urbanTexCoordY;

        vec4 texCol = surfaceTexture(URBAN, vec2(urbanTexCoordX, urbanTexCoordY));
        if (texCol.a > 0.5) {

          if (nightTime) {
            shadowLight = 1.0;
            texCol.rgb *= vec3(1.0, 0.8, 0.5);
          } else {
            texCol.rgb *= vec3(0.8, 0.9, 1.0);
            if (length(texCol.rgb) < 0.1)
              texCol.rgb = texture(noiseTex, fragCoord * 0.3).rgb * 0.3;
          }
          color = texCol.rgb;
          opacity = texCol.a;
        }
      } else if (wallX0Ym[TYPE] == WALLTYPE_SUBURBAN) {

        // American suburb: small houses with pitched roofs, warm colours, green lawns
        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);
        float cellX = mod(fragCoord.x, resolution.x);
        float houseRepeat = 8.0;
        float houseWidth  = 4.5;
        float lawnWidth   = (houseRepeat - houseWidth) * 0.5;
        float posInBlock  = mod(cellX, houseRepeat);
        bool  isHouse     = posInBlock > lawnWidth && posInBlock < (lawnWidth + houseWidth);
        float posInHouse  = (posInBlock - lawnWidth) / houseWidth;
        float maxHouseBodyHeight = 0.8;
        float maxRoofHeight      = 0.5;
        float roofHeight  = mix(maxHouseBodyHeight, maxHouseBodyHeight + maxRoofHeight,
                               1.0 - abs(posInHouse - 0.5) * 2.0);
        bool inRoof = isHouse && heightAboveGround >= maxHouseBodyHeight && heightAboveGround < roofHeight;
        bool inBody = isHouse && heightAboveGround < maxHouseBodyHeight;

        if (inBody || inRoof) {
          float blockId  = floor(cellX / houseRepeat);
          float houseVar = fract(sin(blockId * 127.1) * 43758.5);
          vec3 houseCol;
          if (houseVar < 0.25)      houseCol = vec3(0.85, 0.72, 0.55);
          else if (houseVar < 0.50) houseCol = vec3(0.75, 0.55, 0.45);
          else if (houseVar < 0.75) houseCol = vec3(0.80, 0.80, 0.75);
          else                      houseCol = vec3(0.65, 0.75, 0.65);
          vec3 roofCol  = vec3(0.35, 0.28, 0.22);
          vec3 noiseVal = texture(noiseTex, fragCoord * 0.25).rgb;
          houseCol *= 0.85 + noiseVal * 0.3;
          roofCol  *= 0.85 + noiseVal * 0.3;
          float winX = mod(posInHouse * 4.0, 1.0);
          float winY = mod(heightAboveGround * 6.0, 1.0);
          bool isWindow = inBody && winX > 0.25 && winX < 0.75 && winY > 0.3 && winY < 0.8
                          && posInHouse > 0.1 && posInHouse < 0.9;
          if (isWindow) {
            color = nightTime ? vec3(1.0, 0.9, 0.6) : vec3(0.5, 0.65, 0.8);
            if (nightTime) shadowLight = 1.0;
          } else {
            color = inRoof ? roofCol : houseCol;
            if (nightTime) shadowLight = 0.15;
          }
          opacity = 1.0;
        } else if (!isHouse && heightAboveGround < 0.3) {
          float soilMoisture = float(wallX0Ym[SOIL_MOISTURE]);
          vec3 lawnCol = mix(vec3(0.15, 0.45, 0.12), vec3(0.45, 0.38, 0.18),
                             max(0.5 - soilMoisture * 0.02, 0.0));
          lawnCol *= 0.85 + texture(noiseTex, fragCoord * 0.15).r * 0.3;
          color   = lawnCol;
          opacity = 1.0;
        }

      } else if (wallX0Ym[TYPE] == WALLTYPE_INDUSTRIAL) {

        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);

        float urbanTexHeightNorm = maxBuildingHeight / cellHeight; // example: 200 / 40 = 5

        float urbanTexCoordX = mod(fragCoord.x, resolution.x) * texAspect / urbanTexHeightNorm;
        float urbanTexCoordY = heightAboveGround / urbanTexHeightNorm;

        // urbanTexCoordY += map_rangeC(float(wallX0Ym[VEGETATION]), 127., 50., 0., 1.0); // building height

        urbanTexCoordY = 1.0 - urbanTexCoordY;

        vec4 texCol = surfaceTexture(INDUS, vec2(urbanTexCoordX, urbanTexCoordY));
        if (texCol.a > 0.5) { // if not transparent

          if (nightTime) {
            shadowLight = 1.0;                 // city lights
            texCol.rgb *= vec3(1.0, 0.8, 0.5); // yellowish windows
          } else {                             // day time
            texCol.rgb *= vec3(0.8, 0.9, 1.0); // Blueish windows

            if (length(texCol.rgb) < 0.1)
              texCol.rgb = texture(noiseTex, fragCoord * 0.3).rgb * 0.3;
          }
          color = texCol.rgb;
          opacity = texCol.a;
        }
      }


      if (wall[VERT_DISTANCE] == 1) {                                                 // 1 above surface
                                                                                      //  if (wallX0Ym[VERT_DISTANCE] == 0) {

        float treeTexHeightNorm = maxTreeHeight / cellHeight;                         // example: 40 / 120 = 0.333

        float treeTexCoordY = localY / treeTexHeightNorm;                             // full height trees

        treeTexCoordY += map_rangeC(float(wallX0Ym[VEGETATION]), 127., 50., 0., 1.0); // apply trees height depending on vegetation

        float treeTexCoordX = fragCoord.x * texAspect / treeTexHeightNorm;            // static scaled trees

        float heightAboveGround = localY / treeTexHeightNorm;

        treeTexCoordX -= base.x * heightAboveGround * 1.00; // 2.5  trees waving with the wind effect

        treeTexCoordX *= 0.72;                              // Trees only go up to 72% of the texture height
        treeTexCoordY *= 0.72;                              // Trees only go up to 72% of the texture height
        treeTexCoordY = 1. - treeTexCoordY;                 // texture is upside down

        vec4 texCol;
        if (wallX0Ym[TYPE] == WALLTYPE_LAND || wallX0Ym[TYPE] == WALLTYPE_URBAN || wallX0Ym[TYPE] == WALLTYPE_SUBURBAN) { // land below
          vec4 surfaceWater = texture(waterTex, texCoordX0Ym);                     // snow on land below
          float snow = surfaceWater[SNOW];
          if (snow * 0.01 / cellHeight > heightAboveGround)
            texCol = vec4(vec3(1.), 1.);                                                                                                                          // show white snow layer above ground
          else {                                                                                                                                                  // display vegetation
            vec4 treeColor = surfaceTexture(FOREST, vec2(treeTexCoordX, treeTexCoordY));
            vec4 vegetationCol = mix(treeColor, vec4(dryGrassCol, 1.), max(0.5 - surfaceWater[SOIL_MOISTURE] * (0.5 / fullGreenSoilMoisture), 0.) * treeColor.a); // green to brown
            texCol = mix(vegetationCol, surfaceTexture(SNOW_FOREST, vec2(treeTexCoordX, treeTexCoordY)), min(snow / fullWhiteSnowHeight, 1.0));
          }
        } else if (wallX0Ym[TYPE] == WALLTYPE_FIRE) {
          texCol = surfaceTexture(FIRE_FOREST, vec2(treeTexCoordX, treeTexCoordY));
        }
        if (texCol.a > 0.5) { // if not transparent
          color = texCol.rgb;

          shadowLight = minShadowLight;        // make sure trees are dark at night

          if (wallX0Ym[TYPE] == WALLTYPE_FIRE) // fire below
            shadowLight = 1.0;

          opacity = 1. - (1. - opacity) * (1. - texCol.a); // alpha blending
        }

        // draw 45° slopes
        ivec4 wallXmY0 = texture(wallTex, texCoordXmY0);
        ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);

        if (wallXmY0[DISTANCE] == 0 && wall[TYPE] != WALLTYPE_WATER) { // wall to the left and below
          if (localX + localY < 1.0) {
            opacity = 1.0;
            water = texture(waterTex, texCoordX0Ym);
            color = getWallColor(localY - 0.6);
            shadowLight = minShadowLight; // fire should not light ground
          }
        }
        if (wallXpY0[DISTANCE] == 0 && wall[TYPE] != WALLTYPE_WATER) { // wall to the right and below
          if (localY - localX < 0.0) {
            opacity = 1.0;
            water = texture(waterTex, texCoordX0Ym);
            color = getWallColor(localY - 0.6);
            shadowLight = minShadowLight; // fire should not light ground
          }
        }
      }
    }
    float arrow = vectorField(base.xy, displayVectorField);

    if (arrow > 0.5) {
      fragmentColor = vec4(vec3(1., 1., 0.), 1.);
      return; // exit shader
    }

    // color.rg += vec2(arrow);
    // color.b -= arrow;
    // opacity += arrow;
    // lightIntensity += arrow;
  }


  float scatering = clamp(map_range(abs(sunAngle), 75. * deg2rad, 90. * deg2rad, 0., 1.), 0., 1.); // how red the sunlight is

  // Enhanced looks: darker shadows by reducing light intensity more in shadow areas
  float adjustedLightIntensity = lightIntensity;
  if (enhancedLooks > 0.5) {
    // When in shadow (low light intensity), make it even darker for dramatic effect
    // Use smooth curve to darken shadows while preserving highlights
    adjustedLightIntensity = pow(lightIntensity, 1.5) * 0.85 + lightIntensity * 0.15;
  }

  vec3 finalLight = sunColor(scatering) * adjustedLightIntensity;


  if (fract(cursor.w) > 0.5) {                                               // enable flashlight
    vec2 vecFromMouse = cursor.xy - texCoord;
    vecFromMouse.x *= texelSize.y / texelSize.x;                             // aspect ratio correction to make it a circle
                                                                             // shadowLight += max(1. / (1.+length(vecFromMouse)*5.0),0.0); // point light
    shadowLight += max(cos(min(length(vecFromMouse) * 5.0, 2.)) * 1.0, 0.0); // smooth flashlight
  }

  vec3 ambientLight = texture(ambientLightTex, texCoord).rgb;

  onLight += ambientLight * pow(1. - clamp(-texCoord.y * 15., 0., 1.), 2.5);


  finalLight += vec3(shadowLight) + onLight;

  opacity += length(emittedLight);
  opacity = clamp(opacity, 0.0, 1.0);
  fragmentColor = vec4(max(color * finalLight, 0.) + emittedLight, opacity);

  drawCursor(cursor, view); // over everything else
}
