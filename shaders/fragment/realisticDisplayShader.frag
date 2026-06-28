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
uniform sampler2D lightningTex;
uniform sampler2D lightningDataTex;

uniform sampler2D ambientLightTex;

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

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // Xpos   Ypos  Size   type

uniform float displayVectorField;

uniform float iterNum;
uniform float visualQuality;

out vec4 fragmentColor;

#include "common.glsl"

#include "commonDisplay.glsl"
#include "lightningV2.glsl"

vec4 base, water;
ivec4 wall;
float lightIntensity;

vec3 color;
float opacity = 1.0;

vec3 emittedLight = vec3(0.); // pure light, like lightning

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
  float vegMoisture = water[SUSTAINED_MOISTURE]; // vegetation greenness follows sustained climate moisture
  vec3 vegetationCol = mix(greenGrassCol, dryGrassCol, max(1.0 - vegMoisture * (1. / fullGreenSoilMoisture), 0.)); // green to brown

  vec3 bareSoilCol = mix(bareDrySoilCol, bareWetSoilCol, map_rangeC(water[SOIL_MOISTURE], 0.0, 20.0, 0.0, 1.0));

  vec3 surfCol = mix(bareSoilCol, vegetationCol, min(float(wall[VEGETATION]) / 50., 1.));

  const vec3 rockCol = vec3(0.70);                                 // gray rock

  vec3 color = mix(surfCol, rockCol, clamp(depth * 0.35, 0., 1.)); // * 0.15


  color *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.2).rgb;                                   // add noise texture

  color = mix(color, vec3(1.0), clamp(min(water[SNOW], fullWhiteSnowHeight) / fullWhiteSnowHeight - max(depth * 0.3, 0.), 0.0, 1.0)); // mix in white for snow cover

  return color;
}

vec3 getIceColor(float iceThickness)
{
  vec3 iceCol = mix(vec3(0.82, 0.88, 0.95), vec3(0.95, 0.98, 1.0), clamp(iceThickness / fullWhiteSnowHeight, 0.0, 1.0));
  iceCol *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.15).rgb;
  if (iceThickness < thinIceBreakupCm)
    iceCol = mix(iceCol, vec3(0.65, 0.75, 0.9), 0.35); // thin, breakable ice looks darker
  return iceCol;
}

#define maxSuburbanBuildingHeight 35. // visual height in meters (2-story gabled homes)
#define suburbanLotWidth 14.0

float suburbanHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

vec3 getSuburbanGroundColor(float worldX)
{
  float lotX = mod(worldX, suburbanLotWidth);
  float lotIdx = floor(worldX / suburbanLotWidth);
  float h0 = suburbanHash(lotIdx);
  float h1 = suburbanHash(lotIdx + 17.3);

  float houseWidth = suburbanLotWidth * mix(0.58, 0.74, h0);
  float houseOffset = (suburbanLotWidth - houseWidth) * mix(0.12, 0.30, h1);
  float garageW = houseWidth * 0.36;

  vec3 lawnCol = pow(vec3(0.20, 0.56, 0.26), vec3(GAMMA));
  vec3 drivewayCol = pow(vec3(0.68, 0.68, 0.70), vec3(GAMMA));
  vec3 sidewalkCol = pow(vec3(0.76, 0.76, 0.78), vec3(GAMMA));
  vec3 streetCol = pow(vec3(0.26, 0.26, 0.28), vec3(GAMMA));

  if (lotX < 0.8)
    return streetCol;
  if (lotX < 1.6)
    return sidewalkCol;
  if (lotX > houseOffset && lotX < houseOffset + garageW + 0.6)
    return drivewayCol;

  return lawnCol;
}

vec4 suburbanHouseAt(float worldX, float heightAboveGround)
{
  float lotX = mod(worldX, suburbanLotWidth);
  float lotIdx = floor(worldX / suburbanLotWidth);

  float h0 = suburbanHash(lotIdx);
  float h1 = suburbanHash(lotIdx + 17.3);
  float h2 = suburbanHash(lotIdx + 41.7);

  float houseWidth = suburbanLotWidth * mix(0.58, 0.74, h0);
  float houseOffset = (suburbanLotWidth - houseWidth) * mix(0.12, 0.30, h1);
  float localX = lotX - houseOffset;

  vec3 siding;
  int sidingIdx = int(h0 * 4.0);
  if (sidingIdx == 0)
    siding = vec3(0.91, 0.88, 0.84);
  else if (sidingIdx == 1)
    siding = vec3(0.78, 0.80, 0.83);
  else if (sidingIdx == 2)
    siding = vec3(0.86, 0.86, 0.88);
  else
    siding = vec3(0.54, 0.61, 0.69);

  vec3 roofCol = vec3(0.20, 0.20, 0.22);
  vec3 trimCol = vec3(0.94, 0.94, 0.95);
  vec3 garageCol = vec3(0.86, 0.86, 0.88);
  vec3 glassCol = vec3(0.52, 0.64, 0.78);
  vec3 doorCol = vec3(0.42, 0.30, 0.20);

  float suburbanTexHeightNorm = maxSuburbanBuildingHeight / cellHeight;
  float floorH = suburbanTexHeightNorm * 0.36;
  float roofPeakH = suburbanTexHeightNorm * 0.22;
  float totalWallH = floorH * 2.0;
  float totalRoofH = totalWallH + roofPeakH;
  float garageW = houseWidth * 0.36;
  float garageH = floorH * 0.88;

  if (heightAboveGround > totalRoofH || localX < 0.0 || localX > houseWidth)
    return vec4(0.0);

  float ridgeX = houseWidth * 0.5;

  if (heightAboveGround > totalWallH) {
    float roofLocalY = heightAboveGround - totalWallH;
    float maxRoofHalfWidth = (1.0 - roofLocalY / roofPeakH) * houseWidth * 0.5;
    if (abs(localX - ridgeX) > maxRoofHalfWidth)
      return vec4(0.0);
    float shade = localX < ridgeX ? 0.82 : 0.94;
    return vec4(roofCol * shade, 1.0);
  }

  if (heightAboveGround < garageH && localX < garageW) {
    float panelX = fract(localX / garageW * 4.0);
    float panelY = fract(heightAboveGround / garageH * 3.0);
    float panelEdge = step(0.88, panelX) + step(0.88, panelY);
    return vec4(garageCol * mix(1.0, 0.72, clamp(panelEdge, 0.0, 1.0)), 1.0);
  }

  if (abs(heightAboveGround - floorH) < suburbanTexHeightNorm * 0.025)
    return vec4(trimCol, 1.0);

  float winW = houseWidth * 0.13;
  float winH = floorH * 0.34;
  float win1X = garageW + houseWidth * 0.07;
  float win2X = win1X + winW + houseWidth * 0.05;
  float win3X = houseWidth * 0.70;
  float winY1 = floorH * 0.52;
  float winY2 = floorH + floorH * 0.52;

  bool isWindow = false;
  if (heightAboveGround > winY1 - winH * 0.5 && heightAboveGround < winY1 + winH * 0.5) {
    if ((localX > win1X && localX < win1X + winW) || (localX > win2X && localX < win2X + winW))
      isWindow = true;
  }
  if (heightAboveGround > winY2 - winH * 0.5 && heightAboveGround < winY2 + winH * 0.5) {
    if ((localX > win1X && localX < win1X + winW) || (localX > win2X && localX < win2X + winW) || (localX > win3X && localX < win3X + winW))
      isWindow = true;
  }

  if (isWindow) {
    float lit = mix(0.35, 1.0, step(0.55, h2));
    return vec4(mix(glassCol, trimCol, 0.28) * lit, 1.0);
  }

  float doorX = houseWidth * 0.50;
  float doorW = houseWidth * 0.10;
  if (heightAboveGround < floorH * 0.78 && localX > doorX && localX < doorX + doorW)
    return vec4(doorCol, 1.0);

  if (h1 > 0.72 && localX > ridgeX - 0.25 && localX < ridgeX + 0.25 && heightAboveGround > totalWallH - suburbanTexHeightNorm * 0.08) {
    return vec4(vec3(0.45, 0.42, 0.40), 1.0);
  }

  return vec4(siding, 1.0);
}

const vec2 lightningTexRes = vec2(2500, 5000);
const float lightningTexAspect = lightningTexRes.x / lightningTexRes.y;

float calcLightningTime(float startIterNum)
{
  float lightningTime = iterNum - startIterNum;
  return lightningTime / 5.0; // 30.0    0. to 1. leader stage, 1. + Flash stage
}

float lightningIntensityOverTime(float Tin, vec2 lightningPos, float intensity)
{
  float T0 = Tin - 1.;

  float repeatPeriod = map_range(random2d(lightningPos), 0., 1., 1.5, 3.0);                                            // 2.5
  float numFlashes = floor(map_range(random2d(lightningPos * 2.737250), 0., 1., 1.0, max(intensity - 0.5, 0.) * 2.0)); // 0.4

  float minT = max(T0 - (repeatPeriod * numFlashes), 0.);

  float T = max(mod(T0, repeatPeriod), minT);

  return max((1. / (0.05 + pow(T * 2.0, 3.))) - 0.005, 0.) * pow(intensity, 2.0); // fading out curve
}

// Enhanced V2 procedural bolts (particle-triggered via lightningDataTex)
vec3 getLightningColorV2(float boltSeed)
{
  float r = random2d(vec2(boltSeed * 0.001, boltSeed * 0.00137));
  if (r < 0.40) return vec3(0.60, 0.75, 1.00);
  if (r < 0.65) return vec3(0.65, 0.45, 1.00);
  if (r < 0.80) return vec3(1.00, 0.90, 0.65);
  if (r < 0.92) return vec3(0.30, 0.50, 1.00);
  if (r < 0.97) return vec3(1.00, 0.93, 0.72);
  return             vec3(1.00, 0.78, 0.72);
}

float v2SpiderSegSDF(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - t * ab);
}

float v2SegGlow(float d, float coreR) {
  return exp(-d / coreR) * 2.0
       + exp(-d / (coreR * 3.5)) * 0.18
       + exp(-d / (coreR * 6.0)) * 0.04;
}

vec3 displaySpiderLightningV2(vec2 lightningPos, float T, float boltSeed)
{
  const float mainCoreR  = 0.000375;
  const float subCoreR   = mainCoreR * 0.60;
  const float spiderStep = 0.013;
  const int   MSEGS      = 40;
  const int   SSEGS      = 16;

  float spiderProg  = clamp(T, 0.0, 1.0);
  float flashBright = T < 1.0
      ? 1500.0 * spiderProg
      : max(500.0 / (0.05 + pow(T * 4.0, 2.5)), 0.0);
  if (flashBright < 0.0001) return vec3(0.0);

  vec2 p      = vec2(texCoord.x * aspectRatios[0], texCoord.y);
  vec2 origin = vec2(lightningPos.x * aspectRatios[0], lightningPos.y);

  float totalGlow = 0.0;
  vec2  mVerts[41];
  vec2  sVerts[17];

  for (int b = 0; b < 3; b++) {
    float bs = boltSeed + float(b) * 137.51;

    float goRight   = random2d(vec2(bs * 0.00113, bs * 0.00173 + 1.7)) > 0.5 ? 1.0 : -1.0;
    float mainAngle = goRight > 0.0 ? 0.0 : PI;
    mainAngle += (random2d(vec2(bs * 0.00217, bs * 0.00319)) - 0.5) * 0.4;

    float ang = mainAngle;
    mVerts[0] = origin;

    for (int i = 0; i < MSEGS; i++) {
      float r1 = random2d(vec2(bs * 0.00371 + float(i) * 0.0937, bs * 0.00591 + float(i) * 0.0517));
      ang += (r1 - 0.5) * 2.5;
      ang -= (ang - mainAngle) * 0.12;
      ang -= sin(ang) * 0.28;
      mVerts[i + 1] = mVerts[i] + vec2(cos(ang), sin(ang)) * spiderStep;
    }

    vec2  tip        = mVerts[MSEGS];
    vec2  tipTC      = vec2(tip.x / aspectRatios[0], clamp(tip.y, 0.0, 1.0));
    float cloudAtTip = texture(waterTex, tipTC)[CLOUD];

    if (cloudAtTip >= 0.008) {
      float minD = 1e10, minFade = 0.0;
      for (int i = 0; i < MSEGS; i++) {
        float t0   = float(i) / float(MSEGS);
        float fade = clamp((spiderProg - t0) * float(MSEGS), 0.0, 1.0);
        float d    = v2SpiderSegSDF(p, mVerts[i], mVerts[i + 1]);
        if (d < minD) { minD = d; minFade = fade; }
      }
      totalGlow += v2SegGlow(minD, mainCoreR) * minFade;

      for (int s = 0; s < 3; s++) {
        float ss       = bs + float(s) * 73.37;
        int   spawnIdx = min(int(random2d(vec2(ss * 0.00413, ss * 0.00237)) * 30.0) + 5, MSEGS - 1);
        float subAng   = mainAngle;
        sVerts[0]      = mVerts[spawnIdx];

        for (int i = 0; i < SSEGS; i++) {
          float r1 = random2d(vec2(ss * 0.00511 + float(i) * 0.0937, ss * 0.00391 + float(i) * 0.0711));
          subAng += (r1 - 0.5) * 2.5;
          subAng -= (subAng - mainAngle) * 0.12;
          subAng -= sin(subAng) * 0.28;
          sVerts[i + 1] = sVerts[i] + vec2(cos(subAng), sin(subAng)) * spiderStep;
        }

        vec2  sTip       = sVerts[SSEGS];
        vec2  sTipTC     = vec2(sTip.x / aspectRatios[0], clamp(sTip.y, 0.0, 1.0));
        float cloudAtSub = texture(waterTex, sTipTC)[CLOUD];
        if (cloudAtSub >= 0.008) {
          float sMinD = 1e10, sMinFade = 0.0;
          for (int i = 0; i < SSEGS; i++) {
            float t0   = float(i) / float(SSEGS);
            float fade = clamp((spiderProg - t0) * float(SSEGS), 0.0, 1.0);
            float d    = v2SpiderSegSDF(p, sVerts[i], sVerts[i + 1]);
            if (d < sMinD) { sMinD = d; sMinFade = fade; }
          }
          totalGlow += v2SegGlow(sMinD, subCoreR) * sMinFade * 0.44;
        }
      }
    }
  }

  return getLightningColorV2(boltSeed) * totalGlow * flashBright;
}

vec3 displayCGLightningV2(vec2 lightningPos, float T, float boltSeed)
{
  const float mainCoreR   = 0.00045;
  const float branchCoreR = 0.000375;
  const float armCoreR    = branchCoreR * 0.85;
  const float armSubCoreR = branchCoreR * 0.55;
  const int   MAIN_SEGS   = 48;
  const int   SIDE_SEGS   = 24;
  const int   ARM_SEGS    = 40;
  const int   ASUB_SEGS   = 16;

  float spiderProg  = clamp(T, 0.0, 1.0);
  float flashBright = T < 1.0
      ? 1125.0 * spiderProg
      : max(300.0 / (0.05 + pow(T * 4.0, 2.5)), 0.0);
  if (flashBright < 0.0001) return vec3(0.0);

  vec2  p       = vec2(texCoord.x * aspectRatios[0], texCoord.y);
  vec2  origin  = vec2(lightningPos.x * aspectRatios[0], lightningPos.y);
  float stepLen = lightningPos.y / float(MAIN_SEGS);

  float totalGlow = 0.0;

  vec2  cgVerts[49];
  cgVerts[0] = origin;
  float cgAng = -PI * 0.5;

  for (int i = 0; i < MAIN_SEGS; i++) {
    float r1 = random2d(vec2(boltSeed * 0.00371 + float(i) * 0.0937, boltSeed * 0.00591 + float(i) * 0.0517));
    cgAng += (r1 - 0.5) * 1.6;
    cgAng -= (cgAng + PI * 0.5) * 0.30;
    cgVerts[i + 1] = cgVerts[i] + vec2(cos(cgAng), sin(cgAng)) * stepLen;
  }

  {
    float minD = 1e10, minFade = 0.0;
    for (int i = 0; i < MAIN_SEGS; i++) {
      float t0   = float(i) / float(MAIN_SEGS);
      float fade = clamp((spiderProg - t0) * float(MAIN_SEGS), 0.0, 1.0);
      float d    = v2SpiderSegSDF(p, cgVerts[i], cgVerts[i + 1]);
      if (d < minD) { minD = d; minFade = fade; }
    }
    totalGlow += v2SegGlow(minD, mainCoreR) * minFade;
  }

  vec2 sbVerts[25];
  for (int sb = 0; sb < 4; sb++) {
    float sbs     = boltSeed + float(sb) * 137.51 + 500.0;
    int   fromIdx = min(int(random2d(vec2(sbs * 0.00113, sbs * 0.00173)) * 44.0) + 2, MAIN_SEGS - 2);

    float branchLen = random2d(vec2(sbs * 0.00217, sbs * 0.00319)) * 0.20 + 0.05;
    float sbStep    = lightningPos.y * branchLen / float(SIDE_SEGS);
    float sbAng     = -PI * 0.5 + (random2d(vec2(sbs * 0.00411, sbs * 0.00591)) - 0.5) * PI * 1.6;
    sbVerts[0]      = cgVerts[fromIdx];

    for (int i = 0; i < SIDE_SEGS; i++) {
      float r1 = random2d(vec2(sbs * 0.00511 + float(i) * 0.0937, sbs * 0.00391 + float(i) * 0.0711));
      sbAng += (r1 - 0.5) * 1.6;
      sbAng -= (sbAng + PI * 0.5) * 0.30;
      sbVerts[i + 1] = sbVerts[i] + vec2(cos(sbAng), sin(sbAng)) * sbStep;
    }

    float sbMinD = 1e10, sbMinFade = 0.0;
    for (int i = 0; i < SIDE_SEGS; i++) {
      float t0   = float(i) / float(SIDE_SEGS);
      float fade = clamp((spiderProg - t0) * float(SIDE_SEGS), 0.0, 1.0);
      float d    = v2SpiderSegSDF(p, sbVerts[i], sbVerts[i + 1]);
      if (d < sbMinD) { sbMinD = d; sbMinFade = fade * (1.0 - t0 * 0.55); }
    }
    totalGlow += v2SegGlow(sbMinD, branchCoreR) * sbMinFade * 0.50;
  }

  vec2 armVerts[41];
  vec2 asubVerts[17];
  for (int ca = 0; ca < 2; ca++) {
    float cas   = boltSeed + float(ca) * 137.51 + 1000.0;
    int   caIdx = min(int(random2d(vec2(cas * 0.00113, cas * 0.00173)) * 6.0), 5);

    float goRight = random2d(vec2(cas * 0.00317, cas * 0.00419)) > 0.5 ? 1.0 : -1.0;
    float ccAng   = goRight > 0.0 ? 0.0 : PI;
    ccAng += (random2d(vec2(cas * 0.00513, cas * 0.00217)) - 0.5) * 0.4;

    float armAng = ccAng;
    armVerts[0]  = cgVerts[caIdx];

    for (int i = 0; i < ARM_SEGS; i++) {
      float r1 = random2d(vec2(cas * 0.00371 + float(i) * 0.0937, cas * 0.00591 + float(i) * 0.0517));
      armAng += (r1 - 0.5) * 2.5;
      armAng -= (armAng - ccAng) * 0.12;
      armAng -= sin(armAng) * 0.28;
      armVerts[i + 1] = armVerts[i] + vec2(cos(armAng), sin(armAng)) * 0.013;
    }

    vec2  armTip     = armVerts[ARM_SEGS];
    vec2  armTipTC   = vec2(armTip.x / aspectRatios[0], clamp(armTip.y, 0.0, 1.0));
    float cloudAtArm = texture(waterTex, armTipTC)[CLOUD];
    if (cloudAtArm >= 0.008) {
      float armMinD = 1e10, armMinFade = 0.0;
      for (int i = 0; i < ARM_SEGS; i++) {
        float t0   = float(i) / float(ARM_SEGS);
        float fade = clamp((spiderProg - t0) * float(ARM_SEGS), 0.0, 1.0);
        float d    = v2SpiderSegSDF(p, armVerts[i], armVerts[i + 1]);
        if (d < armMinD) { armMinD = d; armMinFade = fade; }
      }
      totalGlow += v2SegGlow(armMinD, armCoreR) * armMinFade * 0.65;

      for (int as = 0; as < 2; as++) {
        float ass       = cas + float(as) * 73.37;
        int   aspawnIdx = min(int(random2d(vec2(ass * 0.00413, ass * 0.00237)) * 30.0) + 5, ARM_SEGS - 1);
        float asubAng   = ccAng;
        asubVerts[0]    = armVerts[aspawnIdx];

        for (int i = 0; i < ASUB_SEGS; i++) {
          float r1 = random2d(vec2(ass * 0.00511 + float(i) * 0.0937, ass * 0.00391 + float(i) * 0.0711));
          asubAng += (r1 - 0.5) * 2.5;
          asubAng -= (asubAng - ccAng) * 0.12;
          asubAng -= sin(asubAng) * 0.28;
          asubVerts[i + 1] = asubVerts[i] + vec2(cos(asubAng), sin(asubAng)) * 0.013;
        }

        vec2  asubTip     = asubVerts[ASUB_SEGS];
        vec2  asubTipTC   = vec2(asubTip.x / aspectRatios[0], clamp(asubTip.y, 0.0, 1.0));
        float cloudAtAsub = texture(waterTex, asubTipTC)[CLOUD];
        if (cloudAtAsub >= 0.008) {
          float asubMinD = 1e10, asubMinFade = 0.0;
          for (int i = 0; i < ASUB_SEGS; i++) {
            float t0   = float(i) / float(ASUB_SEGS);
            float fade = clamp((spiderProg - t0) * float(ASUB_SEGS), 0.0, 1.0);
            float d    = v2SpiderSegSDF(p, asubVerts[i], asubVerts[i + 1]);
            if (d < asubMinD) { asubMinD = d; asubMinFade = fade; }
          }
          totalGlow += v2SegGlow(asubMinD, armSubCoreR) * asubMinFade * 0.30;
        }
      }
    }
  }

  return getLightningColorV2(boltSeed) * totalGlow * flashBright;
}

vec3 displayLightning(vec2 pos, float lightningTime, float currentLightningIntensity)
{
  vec2 lightningTexCoord = texCoord;

  lightningTexCoord.x -= mod(pos.x, 1.);

  lightningTexCoord.y -= pos.y;

  float scaleMult = 1. / pos.y; // 1.0 means lightning is as tall as the simheight

  lightningTexCoord.x *= scaleMult * aspectRatios[0] / lightningTexAspect;
  lightningTexCoord.y *= -scaleMult;

  lightningTexCoord.x += 0.5;                                                                                               // center lightning bolt

  if (lightningTexCoord.x < 0.01 || lightningTexCoord.x > 1.01 || lightningTexCoord.y < 0.01 || lightningTexCoord.y > 1.01) // prevent edge effect when mipmapping
    return vec3(0);

  float pixVal = texture(lightningTex, lightningTexCoord).r;

  const float branchShowFactor = 2.5;       // 1.5
  const float leaderBrightness = 50000.;    // 200.0
  const float mainBoltBrightness = 100000.; // 100000.

  float brightnessThreshold = 1. - lightningTime * branchShowFactor;
  brightnessThreshold += lightningTexCoord.y * branchShowFactor; // grow from the top to the bottem

  brightnessThreshold = clamp(brightnessThreshold, 0., 1.);

  if (lightningTime > 1.0) { // main bolt
    brightnessThreshold = 0.95;
    currentLightningIntensity *= mainBoltBrightness;
  } else {
    currentLightningIntensity = leaderBrightness;
  }

  pixVal -= brightnessThreshold;

  pixVal = max(pixVal, 0.0);

  pixVal *= currentLightningIntensity;

  const vec3 lightningCol = vec3(0.94, 0.82, 1.0); // lavender glow, white core via intensity

  vec3 outputColor = max(pixVal * lightningCol, vec3(0));
  float softHalo = max(texture(lightningTex, lightningTexCoord).r - brightnessThreshold * 0.72, 0.0)
    * currentLightningIntensity * 0.045;
  outputColor += softHalo * vec3(0.88, 0.74, 1.0);

  return outputColor;
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


float normalizedSunlightAt(vec2 tc)
{
  return smoothSunlightSample(lightTex, tc, texelSize, visualQuality) / standardSunBrightness;
}

vec4 computeCloudSmokeColor(float cloudwater, float precip, float smokeAmt, float localLightIntensity, float realTemp, vec2 sampleUV)
{
  float scatter = clamp(map_range(abs(sunAngle), 75.0 * deg2rad, 90.0 * deg2rad, 0.0, 1.0), 0.0, 1.0);
  float nightFactor = clamp(map_range(abs(sunAngle), 60.0 * deg2rad, 90.0 * deg2rad, 0.0, 1.0), 0.0, 1.0);

  // Clear-sky: rich Rayleigh gradient — deep navy top, cyan-blue near horizon
  if (cloudwater < 0.03 && smokeAmt < 0.06) {
    vec3 skyTop    = pow(vec3(0.02, 0.06, 0.22), vec3(GAMMA)); // deep navy
    vec3 skyMid    = pow(vec3(0.10, 0.38, 0.72), vec3(GAMMA)); // vivid mid-blue
    vec3 skyHorizon= pow(vec3(0.45, 0.72, 0.95), vec3(GAMMA)); // light cyan at horizon
    float h = clamp(sampleUV.y, 0.0, 1.0);
    vec3 sky = mix(skyHorizon, skyMid, smoothstep(0.0, 0.25, h));
    sky = mix(sky, skyTop, smoothstep(0.20, 1.0, h));
    vec3 horizonWarm = mix(vec3(1.00, 0.58, 0.18), vec3(0.95, 0.75, 0.40), scatter);
    float horizonBlend = 1.0 - smoothstep(0.0, 0.18, sampleUV.y);
    sky = mix(sky, horizonWarm, horizonBlend * scatter * 1.1);
    float op = 1.0 - clamp(cloudwater * 30.0, 0.0, 1.0);
    op *= 1.0 - nightFactor;
    return vec4(sky * (1.0 - nightFactor * 0.65), op);
  }

  float cloudDensity  = max(cloudwater * 13.6, 0.0);
  float totalDensity  = cloudDensity + precip * 0.8;

  // Enhanced V2 volumetric opacity — precip darkens shafts inside storm cores
  float cloudOpacity  = clamp(1.0 - (1.0 / (1.0 + totalDensity)), 0.0, 1.0);

  // V2 density albedo blended with directional lighting
  float litness = clamp(localLightIntensity * 1.6, 0.0, 1.0);
  vec3  v2CloudBase   = vec3(1.0 / (cloudwater * 0.005 + 1.0));
  vec3  cloudLitCol   = vec3(0.97, 0.98, 1.00);
  vec3  cloudDarkCol  = mix(v2CloudBase * 0.35, vec3(0.18, 0.22, 0.30), smoothstep(0.35, 0.95, cloudOpacity));
  vec3  cloudMidCol   = mix(v2CloudBase * 0.72, vec3(0.52, 0.58, 0.68), smoothstep(0.25, 0.85, cloudOpacity));

  vec3 cloudCol = mix(cloudDarkCol, cloudMidCol, smoothstep(0.0, 0.35, litness));
  cloudCol      = mix(cloudCol,     cloudLitCol, smoothstep(0.28, 0.72, litness));

  // Extra darkening for very thick, dense cloud cores
  float thickMask = smoothstep(0.55, 0.95, cloudOpacity);
  float coreDark  = (1.0 - smoothstep(0.05, 0.45, localLightIntensity)) * thickMask;
  cloudCol = mix(cloudCol, cloudCol * vec3(0.55, 0.60, 0.70), coreDark * 0.80);

  // Ice/cirrus wisps — semi-transparent bluish-white streaks
  float coldIndex = clamp((0.0 - KtoC(realTemp)) / 12.0, 0.0, 1.0);
  coldIndex = pow(coldIndex, 1.4);
  float thinCloudMask = 1.0 - smoothstep(0.15, 0.70, cloudOpacity);
  float lowPrecipMask = 1.0 - smoothstep(0.04, 0.16, precip);
  float coldWispy = coldIndex * thinCloudMask * lowPrecipMask;
  float wispyNoise = texture(noiseTex, sampleUV * resolution * 0.12 + vec2(0.0, iterNum * 0.0008)).r;
  float wispyMask = clamp(coldWispy * smoothstep(0.28, 0.68, wispyNoise + cloudOpacity * 0.3), 0.0, 1.0);
  cloudCol = mix(cloudCol, vec3(0.90, 0.94, 1.00), wispyMask * 0.80);
  cloudOpacity *= mix(1.0, 0.50, wispyMask * 0.65);

  // Sun tint on lit faces; cool-blue night tint on shadowed faces
  vec3 sunTint  = sunColor(scatter);
  vec3 nightTint= vec3(0.28, 0.40, 0.65);
  cloudCol = mix(cloudCol, sunTint * 1.05, litness * clamp(cloudOpacity * 1.8, 0.0, 1.0) * 0.30);
  cloudCol = mix(cloudCol, nightTint, nightFactor * (1.0 - litness) * 0.85);

  // Warm sunset glow on cloud edges
  float sunGlow = exp(-pow((sampleUV.y - 0.45) * 2.5, 2.0)) * litness * scatter;
  cloudCol = mix(cloudCol, mix(cloudCol, vec3(1.0, 0.80, 0.45), 0.85), sunGlow * cloudOpacity * 0.55);

  // Smoke / fire
  const vec3 smokeThinCol  = vec3(0.8, 0.51, 0.26);
  const vec3 smokeThickCol = vec3(0., 0., 0.);
  float smokeOpacity  = clamp(1. - (1. / (smokeAmt + 1.)), 0.0, 1.0);
  float fireIntensity = clamp((smokeOpacity - 0.8) * 25., 0.0, 1.0);
  vec3  fireCol       = hsv2rgb(vec3(fireIntensity * 0.008, 0.98, 5.0));
  vec3  smokeOrFireCol= mix(mix(smokeThinCol, smokeThickCol, smokeOpacity), fireCol, fireIntensity);
  shadowLight += fireIntensity * 2.5;

  float outOpacity = 1. - (1. - smokeOpacity) * (1. - cloudOpacity);
  vec3  outColor   = (smokeOrFireCol * smokeOpacity / outOpacity)
                   + (cloudCol * cloudOpacity * (1. - smokeOpacity) / outOpacity);

  return vec4(outColor, outOpacity);
}

void applyAirLightning(vec2 uv, float cloudwater, float precip, float cloudDensity, float nightFactor)
{
  float ltCloudPierce = 1.0 + clamp(cloudDensity * 0.22, 0.0, 5.5);
  float cloudOpacity = clamp(1.0 - (1.0 / (1.0 + cloudDensity + precip * 0.8)), 0.0, 1.0);

  // Enhanced V2 particle-triggered procedural bolts (precipitation feedback channel)
  vec4 lightningData = texture(lightningDataTex, vec2(0.5));
  vec2 lightningPos = lightningData.xy;
  float lightningStartIterNum = lightningData[START_ITERNUM];
  float boltAge = iterNum - lightningStartIterNum;
  const float PARTICLE_BOLT_MAX_AGE = 28.0;
  float lightningTime = calcLightningTime(lightningStartIterNum);
  float currentLightningIntensity = lightningIntensityOverTime(lightningTime, lightningPos, lightningData[INTENSITY]);
  bool particleBoltActive = lightningData[INTENSITY] > 0.5
    && boltAge >= 0.0 && boltAge < PARTICLE_BOLT_MAX_AGE;

  if (particleBoltActive) {
    if (lightningData[INTENSITY] > 1.0) {
      vec3 cgLight = displayCGLightningV2(lightningPos, lightningTime, lightningStartIterNum);
      float cgDepth = random2d(vec2(lightningStartIterNum * 0.00137, lightningStartIterNum * 0.00271));
      float cgOcclusion = pow(max(1.0 - cloudOpacity, 0.0), cgDepth * 4.5);
      emittedLight += cgLight * cgOcclusion * ltCloudPierce;
    } else {
      emittedLight += displaySpiderLightningV2(lightningPos, lightningTime, lightningStartIterNum) * ltCloudPierce;
      emittedLight /= 1.0 + cloudDensity * 20.0;
    }

    vec2 ldist = vec2((lightningPos.x - uv.x) * aspectRatios[0], lightningPos.y * 0.5 - uv.y);
    float lOnLight = 0.0006 / (dot(ldist, ldist) + 0.008);
    lOnLight *= currentLightningIntensity;
    onLight += lOnLight * getLightningColorV2(lightningStartIterNum);
  }

#ifndef LT_V2_PROCEDURAL
  if (lightningData[INTENSITY] > 1.0 && boltAge >= 0.0 && boltAge < PARTICLE_BOLT_MAX_AGE) {
    emittedLight += displayLightning(lightningPos, lightningTime, currentLightningIntensity) * ltCloudPierce;
    const float lightningOnLightBrightness = 0.004;
    vec2 dist = vec2(lightningPos.x - uv.x, max((abs(lightningPos.y / 2. - uv.y) - 0.1), 0.));
    dist.x *= aspectRatios[0];
    float lightningOnLight = lightningOnLightBrightness / (pow(length(dist), 2.) + 0.03);
    lightningOnLight *= currentLightningIntensity;
    onLight += vec3(lightningOnLight);
  }
#endif

  if (ltNumStrikes > 0 && ltEventAge >= 0.0) {
    vec3 ltBolts;
    vec3 ltIllum;
    ltAccumulateBoltsAndIllum(uv, aspectRatios[0], cloudwater, precip, nightFactor, ltBolts, ltIllum);
    emittedLight += ltBolts * ltCloudPierce;
    onLight += ltIllum;
  }
}


float rand(float n) { return fract(sin(n) * 43758.5453123); }

void main()
{
  vec2 bndFragCoord = vec2(fragCoord.x, clamp(fragCoord.y, 0., resolution.y)); // bound y within range
  base = bilerpWallVis(baseTex, wallTex, bndFragCoord);
  wall = texture(wallTex, bndFragCoord * texelSize);                           // texCoord
  water = bilerpWallVis(waterTex, wallTex, bndFragCoord);
  lightIntensity = normalizedSunlightAt(bndFragCoord * texelSize);

  ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);

  float realTemp = potentialToRealT(base[TEMPERATURE]);

  bool nightTime = abs(sunAngle) > 85.0 * deg2rad; // false = day time

  shadowLight = minShadowLight;

  // fragmentColor = vec4(vec3(light),1); return; // View light texture for debugging

  float cloudwater = water[CLOUD];
  float nightFactor = clamp(map_range(abs(sunAngle), 60. * deg2rad, 90. * deg2rad, 0., 1.), 0., 1.);

  if (texCoord.y < 0.) {                                     // < texelSize.y below simulation area

    float depth = float(-wall[VERT_DISTANCE]) - fragCoord.y; // -1.0?

    color = getWallColor(depth);

    lightIntensity = texture(lightTex, vec2(texCoord.x, texelSize.y))[0] / standardSunBrightness; // sample lowest part of sim area
    lightIntensity *= pow(0.5, -fragCoord.y);                                                     // 0.5 should be same as in lightingshader deeper is darker

  } else if (texCoord.y > 1.0) {                                                                  // above simulation area
    color   = vec3(0.0);
    opacity = 1.0; // solid black outside sim bounds
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
    case WALLTYPE_INDUSTRIAL:
    case WALLTYPE_FIRE:
    case WALLTYPE_LAND:
    case WALLTYPE_SUBURBAN:

      // horizontally interpolate depth value
      float interpDepth = mix(mix(float(-wallXmY0[VERT_DISTANCE]), float(-wall[VERT_DISTANCE]), clamp(fract(fragCoord.x) + 0.5, 0.5, 1.)), float(-wallXpY0[VERT_DISTANCE]), clamp(fract(fragCoord.x) - 0.5, 0., 0.5));
      float depth = interpDepth - fract(fragCoord.y); // - 1.0 ?

      if (wall[TYPE] == WALLTYPE_SUBURBAN && wall[VERT_DISTANCE] == 0) {
        color = getSuburbanGroundColor(fragCoord.x);
        color *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.2).rgb;
        color = mix(color, vec3(1.0), clamp(min(water[SNOW], fullWhiteSnowHeight) / fullWhiteSnowHeight - max(depth * 0.3, 0.), 0.0, 1.0));
      } else {
        color = getWallColor(depth);
      }

      break;
    case WALLTYPE_ICE:
      {
        float iceThickness = water[SNOW];
        color = getIceColor(iceThickness);
        if (wall[VERT_DISTANCE] == 0 && iceThickness > fullWhiteSnowHeight)
          color = mix(color, vec3(0.98), clamp((iceThickness - fullWhiteSnowHeight) / 200.0, 0.0, 0.5)); // thick ice caps
      }
      break;
    case WALLTYPE_FRESH_WATER:
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
        vec2 airFC = fragCoord + vec2(0., 0.5);
        vec2 airUV = airFC * texelSize;
        vec2 airBnd = vec2(airFC.x, clamp(airFC.y, 0., resolution.y));
        vec4 airWater = bilerpWallVis(waterTex, wallTex, airBnd);
        float airCloud = airWater[CLOUD];
        float airPrecip = airWater[PRECIPITATION];
        float airRealTemp = potentialToRealT(bilerpWallVis(baseTex, wallTex, airBnd)[TEMPERATURE]);
        vec4 airColor = computeCloudSmokeColor(airCloud, airPrecip, airWater[SMOKE], normalizedSunlightAt(airUV), airRealTemp, airUV);
        opacity = airColor.a;
        color = airColor.rgb;
        applyAirLightning(airUV, airCloud, airPrecip, max(airCloud * 13.6, 0.0), nightFactor);
      } else {
        if (wall[TYPE] == WALLTYPE_FRESH_WATER)
          color = vec3(0.15, 0.65, 0.95); // fresh water — lighter cyan
        else
          color = vec3(0.0, 0.42, 0.82); // salt water — deeper blue
      }

      // draw 45° slopes under water

      float localX = fract(fragCoord.x);
      float localY = fract(fragCoord.y);

      if (wallXmY0[DISTANCE] == 0 && !isAnyWaterType(wallXmY0[TYPE]) && (fragCoord.y < 1. || !isAnyWaterType(wallX0Ym[TYPE]))) { // wall to the left and below
        if (localX + localY < 1.0) {
          opacity = 1.0;
          water = texture(waterTex, texCoord);
          color = getWallColor(float(-wall[VERT_DISTANCE]) - localY);
          shadowLight = minShadowLight;
        }
      }
      if (wallXpY0[DISTANCE] == 0 && !isAnyWaterType(wallXpY0[TYPE]) && (fragCoord.y < 1. || !isAnyWaterType(wallX0Ym[TYPE]))) { // wall to the right and below
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

    vec4 airColor = computeCloudSmokeColor(cloudwater, water[PRECIPITATION], water[SMOKE], lightIntensity, realTemp, texCoord);
    opacity = airColor.a;
    color = airColor.rgb;
    applyAirLightning(texCoord, cloudwater, water[PRECIPITATION], max(cloudwater * 13.6, 0.0), nightFactor);

    // Enhanced V2 altitude sunset tint on lit cloud faces
    float cloudScattering = clamp(map_range(abs(sunAngle), 75. * deg2rad, 90. * deg2rad, 0., 1.), 0., 1.);
    float cloudOpacityForLight = clamp(1.0 - (1.0 / (1. + max(cloudwater * 13.6, 0.0) + water[PRECIPITATION] * 0.8)), 0.0, 1.0);
    float y = texCoord.y;
    vec3 colPurple = vec3(0.65, 0.38, 0.82);
    vec3 colPink   = vec3(1.00, 0.50, 0.60);
    vec3 colOrange = vec3(1.00, 0.52, 0.22);
    vec3 colYellow = vec3(1.00, 0.88, 0.48);
    vec3 altColor  = mix(colPurple,
                       mix(colPink,
                         mix(colOrange, colYellow, smoothstep(0.45, 0.70, y)),
                       smoothstep(0.20, 0.45, y)),
                     smoothstep(0.05, 0.20, y));
    onLight += altColor * cloudScattering * cloudOpacityForLight * lightIntensity * y * 6.0;
    float altFactor = clamp((texCoord.y - 0.50) / 0.50, 0.0, 1.0);
    onLight += vec3(cloudScattering * cloudOpacityForLight * altFactor * altFactor * lightIntensity * 8.0);

    // Rain / snow curtain sheets (Enhanced V2-style precip shafts)
    float precipAmt = water[PRECIPITATION];
    if (precipAmt > 0.008) {
      float noiseX  = texCoord.x * resolution.x * 0.55;
      float noiseY  = texCoord.y * resolution.y * 0.30 - iterNum * 0.22;
      float streak  = texture(noiseTex, vec2(noiseX, noiseY) * 0.012).r;
      float streak2 = texture(noiseTex, vec2(noiseX * 1.7 + 0.3, noiseY * 0.9 + 0.15) * 0.018).r;
      float curtain = pow(max((streak + streak2 * 0.65) - 0.48, 0.0) * 2.8, 1.6);
      float tempC = KtoC(realTemp);
      vec3 rainCol  = mix(vec3(0.42, 0.52, 0.68), vec3(0.88, 0.92, 0.98), smoothstep(0.0, -3.0, tempC));
      float curtainOpacity = curtain * clamp(precipAmt * 24.0, 0.0, 0.88) * (1.0 - cloudwater * 1.35);
      curtainOpacity = clamp(curtainOpacity, 0.0, 0.72);
      rainCol *= mix(0.28, 1.0, lightIntensity);
      color   = mix(color, rainCol, curtainOpacity);
      opacity = clamp(opacity + curtainOpacity * 0.65, 0.0, 1.0);
    }


    vec2 rainbowCenter = vec2(0.0, -1.5 + abs(sunAngle) * 0.60);

    float centerDist = length(onScreenUV - rainbowCenter) * 1.3;

    const float cameraHeight = 1.0;

    float angle = atan(centerDist / cameraHeight) * rad2deg;

    float waveLength = map_range(angle, 40.0, 42.0, 400., 700.);

    float rainSnowFactor = map_rangeC(KtoC(realTemp), 0.0, 5.0, 0.0, 1.0); // only rain if above freezing

    vec3 rainbowCol = spectral_zucconi(waveLength) * min(pow(lightIntensity, 2.0) * 1.9, 1.0) * min(water[PRECIPITATION] * 3.0, 1.0) * rainSnowFactor * 0.7;

    emittedLight += rainbowCol;
    opacity = max(opacity - length(rainbowCol), 0.); // remove some white rain to prevent overbrightening and increase color saturation


    if (wall[VERT_DISTANCE] >= 0 && wall[VERT_DISTANCE] < 10) { // near surface
      float localX = fract(fragCoord.x);
      float localY = fract(fragCoord.y);
      // ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);

#define texAspect 2560. / 4096. // height / width of tree texture
#define maxTreeHeight 40.       // height in meters when vegetation max = 127
#define maxBuildingHeight 400.  // height in meters upto wich the urban texture reaches


      if (wallX0Ym[TYPE] == WALLTYPE_URBAN) {

        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);

        float urbanTexHeightNorm = maxBuildingHeight / cellHeight; // example: 200 / 40 = 5

        float urbanTexCoordX = mod(fragCoord.x, resolution.x) * texAspect / urbanTexHeightNorm;
        float urbanTexCoordY = heightAboveGround / urbanTexHeightNorm;

        // urbanTexCoordY += map_rangeC(float(wallX0Ym[VEGETATION]), 127., 50., 0., 1.0); // building height

        urbanTexCoordY = 1.0 - urbanTexCoordY;

        vec4 texCol = surfaceTexture(URBAN, vec2(urbanTexCoordX, urbanTexCoordY));
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
      } else if (wallX0Ym[TYPE] == WALLTYPE_SUBURBAN) {

        float heightAboveGround = localY + float(wall[VERT_DISTANCE] - 1);
        float suburbanTexHeightNorm = maxSuburbanBuildingHeight / cellHeight;

        if (heightAboveGround < suburbanTexHeightNorm) {
          vec4 texCol = suburbanHouseAt(fragCoord.x, heightAboveGround);
          if (texCol.a > 0.5) {
            if (nightTime) {
              shadowLight = 1.0;
              float windowGlow = step(0.45, length(texCol.rgb)) * suburbanHash(floor(fragCoord.x / suburbanLotWidth) + 91.3);
              texCol.rgb = mix(texCol.rgb * 0.35, texCol.rgb * vec3(1.0, 0.82, 0.55), windowGlow);
            } else {
              texCol.rgb *= vec3(1.0, 0.98, 0.94);
            }
            color = texCol.rgb;
            opacity = texCol.a;
          }
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
            float treeScale = wallX0Ym[TYPE] == WALLTYPE_SUBURBAN ? 0.55 : 1.0;
            vec4 treeColor = surfaceTexture(FOREST, vec2(treeTexCoordX, treeTexCoordY * treeScale + (1.0 - treeScale) * 0.5));
            vec4 vegetationCol = mix(treeColor, vec4(dryGrassCol, 1.), max(0.5 - surfaceWater[SUSTAINED_MOISTURE] * (0.5 / fullGreenSoilMoisture), 0.) * treeColor.a); // green to brown
            if (wallX0Ym[TYPE] == WALLTYPE_SUBURBAN)
              vegetationCol.a *= step(0.82, suburbanHash(floor(fragCoord.x / suburbanLotWidth) + 53.1));
            texCol = mix(vegetationCol, surfaceTexture(SNOW_FOREST, vec2(treeTexCoordX, treeTexCoordY * treeScale)), min(snow / fullWhiteSnowHeight, 1.0));
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

        if (wallXmY0[DISTANCE] == 0 && !isAnyWaterType(wall[TYPE])) { // wall to the left and below
          if (localX + localY < 1.0) {
            opacity = 1.0;
            water = texture(waterTex, texCoordX0Ym);
            color = getWallColor(localY - 0.6);
            shadowLight = minShadowLight; // fire should not light ground
          }
        }
        if (wallXpY0[DISTANCE] == 0 && !isAnyWaterType(wall[TYPE])) { // wall to the right and below
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
  float precipF = clamp(water[PRECIPITATION], 0.0, 1.0);

  vec3 icccEmit = vec3(0.0);
  vec3 icccCloud = vec3(0.0);
  vec3 icccSurf = vec3(0.0);
  vec3 precipBoltShafts = vec3(0.0);
  if (texCoord.y >= 0.0 && texCoord.y <= 1.0 && ltNumStrikes > 0 && ltEventAge >= 0.0) {
    ltAccumulateFlashes(texCoord, aspectRatios[0], cloudwater, precipF, nightFactor,
      icccEmit, icccCloud, icccSurf, precipBoltShafts);
    emittedLight += icccEmit;
  }

  vec3 finalLight = sunColor(scatering) * lightIntensity;


  if (fract(cursor.w) > 0.5) {                                               // enable flashlight
    vec2 vecFromMouse = cursor.xy - texCoord;
    vecFromMouse.x *= texelSize.y / texelSize.x;                             // aspect ratio correction to make it a circle
                                                                             // shadowLight += max(1. / (1.+length(vecFromMouse)*5.0),0.0); // point light
    shadowLight += max(cos(min(length(vecFromMouse) * 5.0, 2.)) * 1.0, 0.0); // smooth flashlight
  }

  vec3 ambientLight = texture(ambientLightTex, texCoord).rgb;

  onLight += ambientLight * pow(1. - clamp(-texCoord.y * 15., 0., 1.), 2.5);


  finalLight += sunColor(scatering) * shadowLight + onLight;

  if (wall[DISTANCE] == 0)
    finalLight += icccSurf + precipBoltShafts;
  else if (texCoord.y > 0.0 && texCoord.y <= 1.0)
    finalLight += icccCloud + icccSurf * max(precipF, 0.22);
  else if (texCoord.y < 0.0)
    finalLight += icccSurf + precipBoltShafts;

  opacity += length(emittedLight);
  opacity = clamp(opacity, 0.0, 1.0);
  fragmentColor = vec4(max(color * finalLight, 0.) + emittedLight, opacity);

  drawCursor(cursor, view); // over everything else
}
