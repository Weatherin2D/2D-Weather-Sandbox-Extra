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

// Charge texture: R=air charge (±1.0), G=ground charge (±1.0)
// Used to drive physics-based lightning instead of random timing
uniform sampler2D chargeTex;

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

// Repeat & cross-trigger
uniform int lightningRepeat;       // 1 = allow repeat strikes driven by charge
uniform int lightningCrossTrigger; // 1 = CG can trigger CC crawlers and vice versa

uniform float iterNum;

uniform float time;

uniform float smoothClouds;
uniform float enhancedLooks;

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

  const int N = 14;
  float accumDisp = 0.0;
  for (int i = 1; i <= N; i++) {
    float prevT    = float(i - 1) / float(N);
    float currT    = float(i)     / float(N);
    float prevAcc  = accumDisp;
    float kick     = (rand(seed + float(i) * 17.31) - 0.5) * dispStr;
    accumDisp      = (accumDisp + kick) * 0.78;
    if (targetT <= currT) {
      float localT = (currT > prevT) ? (targetT - prevT) / (currT - prevT) : 1.0;
      return mix(bStart, bEnd, targetT) + perp * mix(prevAcc, accumDisp, localT);
    }
  }
  return bEnd;
}

// Minimum-distance glow for a multi-segment bolt (sharp core + soft halo).
// maxT ∈ [0,1]: render only the first maxT fraction of the bolt (for animation).
float cgBoltGlow(vec2 p, vec2 bStart, vec2 bEnd, float seed,
                 float coreThick, float dispStr, float maxT) {
  vec2 dir  = bEnd - bStart;
  float len = length(dir);
  if (len < 0.01) return 0.0;
  vec2 perp = vec2(-dir.y, dir.x) / len;

  const int N = 14;
  float accumDisp = 0.0;
  float minDist   = 1.0e6;
  vec2  prevPt    = bStart;

  for (int i = 1; i <= N; i++) {
    float segFrac = float(i) / float(N);
    float kick    = (rand(seed + float(i) * 17.31) - 0.5) * dispStr;
    accumDisp     = (accumDisp + kick) * 0.78;
    // Clamp the last segment's endpoint to the animated tip
    float usedFrac = min(segFrac, maxT);
    vec2  currPt   = mix(bStart, bEnd, usedFrac) + perp * accumDisp;
    minDist = min(minDist, segDist(p, prevPt, currPt));
    prevPt  = currPt;
    if (segFrac >= maxT) break; // stop once we've reached the tip
  }

  float core = 1.0 - smoothstep(0.0, coreThick,       minDist);
  float halo = 1.0 - smoothstep(0.0, coreThick * 2.0, minDist);
  return core + halo * 0.12;
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

    // ── Shared charge values (used by all lightning types) ───────────────────
    float localCharge = texture(chargeTex, texCoord).r;
    float chargeMag   = abs(localCharge);
    float chargePos   = max( localCharge, 0.0); // positive (upper cloud / ice crystals)
    float chargeNeg   = max(-localCharge, 0.0); // negative (lower cloud / graupel / CG driver)

    // ── CC Lightning: horizontal crawler bolt + cloud flash ──────────────────
    // Bolt origin is sampled once per flash event (stable seed).
    // The bolt renders in ALL air pixels (no per-pixel cloud gate on the bolt).
    // The flash is a simple uniform cloud brightening — no distance-based glow
    // centers which cause pixel specks at cloud edges.
    if (enableCloudLightning > 0.5) {
      float ccInterval = max(10.0, 40.0 / (cloudLightningFrequency + 0.01));
      // Only repeat when charge is high — prevents 3x brightness stacking
      float ccChargeAtPixel = abs(texture(chargeTex, texCoord).r);
      int   numSlots   = (lightningRepeat == 1 && ccChargeAtPixel > 0.5) ? 2 : 1;

      for (int slot = 0; slot < numSlots; slot++) {
        float slotOff    = float(slot) * 4.0;
        float flashWindow = 12.0;  // longer window so lightning is visible longer
        float slotPhase  = mod(iterNum + slotOff, ccInterval);
        float flashAge   = slotPhase - (ccInterval - flashWindow);
        float doFlash    = step(ccInterval - flashWindow, slotPhase);
        float repFade    = pow(0.70, float(slot));

        if (doFlash > 0.5) {
          // Large stable seed — same value for every pixel this frame
          float seed = floor((iterNum + slotOff) / ccInterval) * 137.0
                     + float(slot) * 53.0 + 1000.0;

          // Bolt geometry — determined entirely by seed, not per-pixel.
          // Length is a fraction of the sim width, capped so bolts stay within
          // the cloud layer. 8-18% of width gives visible but contained crawlers.
          float crawlX = (rand(seed + 10.0) * 0.6 + 0.2) * resolution.x;
          float crawlY = (rand(seed + 20.0) * 0.20 + 0.58) * resolution.y;
          vec2  cStart = vec2(crawlX, crawlY);
          float cSign  = (rand(seed + 50.0) > 0.5) ? 1.0 : -1.0;
          float cAngle = (rand(seed + 30.0) - 0.5) * 0.18; // tight vertical drift
          float cLen   = resolution.x * (0.08 + rand(seed + 40.0) * 0.10); // 8-18% of width
          vec2  cDir   = normalize(vec2(cSign, cAngle));
          vec2  cEnd   = cStart + cDir * cLen;

          // Gate: sample cloud density at bolt origin only
          vec2  originUV     = clamp(cStart * texelSize, vec2(0.0), vec2(1.0));
          float originCloud  = texture(waterTex, originUV)[CLOUD];
          float originCharge = abs(texture(chargeTex, originUV).r);
          float cloudGate    = clamp(1.0 - 1.0 / (1.0 + originCloud * 13.0), 0.0, 1.0);
          float chargeBoost  = 1.0 + originCharge * 2.0;
          if (cloudGate > cloudLightningThreshold * 0.4) {

            float boltProg = clamp(flashAge / 4.0, 0.0, 1.0); // tip grows over first 4 frames
            float boltFade = (flashAge < 8.0) ? 1.0            // hold for 8 frames
                           : max(0.0, 1.0 - (flashAge - 8.0) / 4.0); // fade over last 4
            // Flash: peaks at frame 2, slow fade
            float flashFade = (flashAge < 2.0) ? flashAge * 0.5
                            : max(0.0, 1.0 - (flashAge - 2.0) / (flashWindow - 2.0));

            // ── Crawler bolt (all air pixels) ────────────────────────────────
            float cThick = cLen * 0.012;  // slightly thicker relative to shorter length
            float cDisp  = cLen * 0.06;
            vec2  cPerp  = vec2(-cDir.y, cDir.x);

            float mG = cgBoltGlow(fragCoord, cStart, cEnd, seed, cThick, cDisp, boltProg);
            float b1T = 0.3, b2T = 0.6;
            float b1P = clamp((boltProg - b1T) / (1.0 - b1T), 0.0, 1.0);
            float b2P = clamp((boltProg - b2T) / (1.0 - b2T), 0.0, 1.0);
            float b1G = 0.0, b2G = 0.0;
            if (b1P > 0.0) {
              vec2  b1O = boltPosAtT(cStart, cEnd, seed, b1T, cDisp);
              float b1S = (rand(seed + 301.0) > 0.5) ? 1.0 : -1.0;
              vec2  b1D = normalize(cDir + cPerp * b1S * (0.15 + rand(seed + 302.0) * 0.25));
              float b1L = cLen * (0.2 + rand(seed + 303.0) * 0.2);
              b1G = cgBoltGlow(fragCoord, b1O, b1O + b1D * b1L,
                               seed + 1000.0, cThick * 0.55, b1L * 0.07, b1P);
            }
            if (b2P > 0.0) {
              vec2  b2O = boltPosAtT(cStart, cEnd, seed, b2T, cDisp);
              float b2S = (rand(seed + 401.0) > 0.5) ? -1.0 : 1.0;
              vec2  b2D = normalize(cDir + cPerp * b2S * (0.12 + rand(seed + 402.0) * 0.20));
              float b2L = cLen * (0.15 + rand(seed + 403.0) * 0.15);
              b2G = cgBoltGlow(fragCoord, b2O, b2O + b2D * b2L,
                               seed + 2000.0, cThick * 0.40, b2L * 0.07, b2P);
            }
            float tG = max(mG, max(b1G * 0.65, b2G * 0.50));
            if (tG > 0.005) {
              float flick  = 0.85 + 0.15 * rand(iterNum * 1.7 + seed);
              // Hard fade outside cloud — bolt is only visible inside cloud density.
              // smoothstep gives a sharp falloff: below threshold = invisible,
              // at 2x threshold = full brightness. No 30% floor outside cloud.
              float localCloudFade = smoothstep(cloudLightningThreshold * 0.5,
                                               cloudLightningThreshold * 1.5, opacity);
              float bright = cloudLightningIntensity * 0.40 * flick * boltFade
                           * repFade * localCloudFade;
              vec3 col = vec3(0.85, 0.92, 1.0) * bright * tG;
              emittedLight += col;
              onLight      += col * 0.3;
            }

            // ── Ambient flash: uniform cloud brightening ─────────────────────
            if (opacity > cloudLightningThreshold && flashFade > 0.0) {
              // Cap chargeBoost and keep flash subtle — bloom handles the rest
              float cb = min(chargeBoost, 1.5);
              float flashBright = cloudLightningIntensity * 0.15 * flashFade
                                * cb * repFade * opacity;
              emittedLight += vec3(flashBright);
              onLight      += vec3(flashBright * 0.4);
            }
          }
        }
      }
    } // end CC

    // ── CG Lightning (with repeat return strokes + cross-trigger) ────────────
    if (enableCloudGroundLightning > 0.5) {
      float cgInterval = max(15.0, 50.0 / (cloudGroundLightningFrequency + 0.01));
      // Repeat: up to 3 return strokes when charge is high (real CG has 2-4)
      int cgSlots = (lightningRepeat == 1 && chargeNeg > 0.4) ? 3 : 1;

      for (int slot = 0; slot < cgSlots; slot++) {
        float slotOff  = float(slot) * (2.0 + rand(float(slot)*5.77)*2.0);
        float cgPhase  = mod(iterNum + cgInterval*0.5 + slotOff, cgInterval);
        float cgAge    = cgPhase - (cgInterval - 6.0);
        float doFlash  = step(cgInterval - 6.0, cgPhase);
        float repFade  = pow(0.65, float(slot));

        if (doFlash > 0.5) {
          float seed = floor((iterNum + cgInterval*0.5 + slotOff) / cgInterval) * 137.0
                     + float(slot) * 53.0 + 2000.0;

          float bX  = (rand(seed+10.0)*0.7+0.15) * resolution.x;
          float bSY = (rand(seed+20.0)*0.20+0.55) * resolution.y;
          vec2  bS  = vec2(bX, bSY);
          vec2  bE  = vec2(bX + (rand(seed+30.0)-0.5)*resolution.x*0.08, 0.0);

          float bCW  = texture(waterTex, clamp(bS*texelSize, vec2(0.0), vec2(1.0)))[CLOUD];
          float bOp  = clamp(1.0 - 1.0/(1.0 + bCW*13.0), 0.0, 1.0);
          float bAC  = texture(chargeTex, clamp(bS*texelSize, vec2(0.0), vec2(1.0))).r;
          float cgCS = max(-bAC, 0.0);
          float gate = (cgCS > 0.01)
            ? bOp * smoothstep(cloudGroundLightningThreshold*0.5, cloudGroundLightningThreshold, cgCS)
            : bOp;

          if (gate > cloudGroundLightningThreshold) {
            float bLen  = length(bE - bS);
            float disp  = bLen * 0.07;
            float thick = bLen * 0.007;
            float prog  = clamp(cgAge/4.0, 0.0, 1.0);
            float fade  = (cgAge < 4.0) ? 1.0 : max(0.0, 1.0-(cgAge-4.0)*0.5);
            float flick = 0.85 + 0.15*rand(iterNum*2.3+seed);
            float bright = cloudGroundLightningIntensity*0.55*flick*fade*(1.0+cgCS*0.5)*repFade;

            vec2 mDir = normalize(bE - bS);
            vec2 mPerp = vec2(-mDir.y, mDir.x);
            float mG = cgBoltGlow(fragCoord, bS, bE, seed, thick, disp, prog);

            float b1T=0.28,b2T=0.48,b3T=0.65,b4T=0.80;
            float b1P=clamp((prog-b1T)/(1.0-b1T),0.0,1.0);
            float b2P=clamp((prog-b2T)/(1.0-b2T),0.0,1.0);
            float b3P=clamp((prog-b3T)/(1.0-b3T),0.0,1.0);
            float b4P=clamp((prog-b4T)/(1.0-b4T),0.0,1.0);
            float b1G=0.0,b2G=0.0,b3G=0.0,b4G=0.0;
            if(b1P>0.0){vec2 o=boltPosAtT(bS,bE,seed,b1T,disp);float s=(rand(seed+301.0)>0.5)?1.0:-1.0;vec2 d=normalize(mDir+mPerp*s*(0.25+rand(seed+302.0)*0.35));float l=bLen*(0.15+rand(seed+303.0)*0.18);b1G=cgBoltGlow(fragCoord,o,o+d*l,seed+1000.0,thick*0.60,l*0.08,b1P);}
            if(b2P>0.0){vec2 o=boltPosAtT(bS,bE,seed,b2T,disp);float s=(rand(seed+301.0)>0.5)?-1.0:1.0;vec2 d=normalize(mDir+mPerp*s*(0.22+rand(seed+402.0)*0.30));float l=bLen*(0.12+rand(seed+403.0)*0.15);b2G=cgBoltGlow(fragCoord,o,o+d*l,seed+2000.0,thick*0.50,l*0.08,b2P);}
            if(b3P>0.0){vec2 o=boltPosAtT(bS,bE,seed,b3T,disp);float s=(rand(seed+501.0)>0.5)?1.0:-1.0;vec2 d=normalize(mDir+mPerp*s*(0.20+rand(seed+502.0)*0.28));float l=bLen*(0.09+rand(seed+503.0)*0.12);b3G=cgBoltGlow(fragCoord,o,o+d*l,seed+3000.0,thick*0.40,l*0.08,b3P);}
            if(b4P>0.0){vec2 o=boltPosAtT(bS,bE,seed,b4T,disp);float s=(rand(seed+501.0)>0.5)?-1.0:1.0;vec2 d=normalize(mDir+mPerp*s*(0.18+rand(seed+602.0)*0.25));float l=bLen*(0.07+rand(seed+603.0)*0.09);b4G=cgBoltGlow(fragCoord,o,o+d*l,seed+4000.0,thick*0.30,l*0.08,b4P);}

            float tG = max(mG,max(b1G*0.70,max(b2G*0.62,max(b3G*0.52,b4G*0.42))));
            if (tG > 0.005) {
              vec3 col = vec3(0.90,0.95,1.0) * bright * tG;
              emittedLight += col;
              onLight      += col * 0.35;
            }

            // Cross-trigger: CG fires a CC crawler ~2 frames later (slot 0 only)
            if (lightningCrossTrigger == 1 && chargePos > 0.3 && slot == 0) {
              float ctPhase = mod(iterNum + cgInterval*0.5 + 2.0, cgInterval);
              float ctAge   = ctPhase - (cgInterval - 5.0);
              if (ctAge >= 0.0 && ctAge < 5.0) {
                float ctS    = seed + 500.0;
                float ctX    = bX + (rand(ctS+1.0)-0.5)*resolution.x*0.15;
                float ctY    = bSY + resolution.y*(0.05+rand(ctS+2.0)*0.10);
                vec2  ctSt   = vec2(ctX, ctY);
                float ctLen  = resolution.x*(0.10+rand(ctS+3.0)*0.15);
                float ctSign = (rand(ctS+4.0)>0.5)?1.0:-1.0;
                vec2  ctDir  = normalize(vec2(ctSign,(rand(ctS+5.0)-0.5)*0.3));
                float ctProg = clamp(ctAge/4.0,0.0,1.0);
                float ctFade = (ctAge<4.0)?1.0:max(0.0,1.0-(ctAge-4.0));
                float ctG    = cgBoltGlow(fragCoord,ctSt,ctSt+ctDir*ctLen,ctS,ctLen*0.005,ctLen*0.06,ctProg);
                if (ctG > 0.005) {
                  vec3 ctCol = vec3(0.80,0.90,1.0)*cloudLightningIntensity*0.30*ctG*ctFade*chargePos;
                  emittedLight += ctCol;
                  onLight      += ctCol * 0.25;
                }
              }
            }
          }
        }
      }
    } // end CG

    // Cross-trigger: CC crawler fires a CG bolt ~3 frames later
    if (enableCloudLightning > 0.5 && enableCloudGroundLightning > 0.5
        && lightningCrossTrigger == 1
        && opacity > cloudLightningThreshold && chargeNeg > 0.35) {
      float ccInt   = max(10.0, 40.0/(cloudLightningFrequency+0.01));
      float ctPhase = mod(iterNum + 3.0, ccInt);
      float ctAge   = ctPhase - (ccInt - 6.0);
      if (ctAge >= 0.0 && ctAge < 6.0) {
        float ctS  = floor((iterNum+3.0)/ccInt) * 137.0 + 3000.0;
        float ctX  = (rand(ctS+10.0)*0.7+0.15)*resolution.x;
        float ctSY = (rand(ctS+20.0)*0.20+0.55)*resolution.y;
        vec2  ctSt = vec2(ctX, ctSY);
        vec2  ctEn = vec2(ctX+(rand(ctS+30.0)-0.5)*resolution.x*0.06, 0.0);
        float ctCW = texture(waterTex, clamp(ctSt*texelSize,vec2(0.0),vec2(1.0)))[CLOUD];
        float ctOp = clamp(1.0-1.0/(1.0+ctCW*13.0),0.0,1.0);
        if (ctOp > cloudGroundLightningThreshold*0.7) {
          float ctLen  = length(ctEn-ctSt);
          float ctProg = clamp(ctAge/4.0,0.0,1.0);
          float ctFade = (ctAge<4.0)?1.0:max(0.0,1.0-(ctAge-4.0)*0.5);
          float ctG    = cgBoltGlow(fragCoord,ctSt,ctEn,ctS,ctLen*0.006,ctLen*0.07,ctProg);
          if (ctG > 0.005) {
            vec3 ctCol = vec3(0.88,0.93,1.0)*cloudGroundLightningIntensity*0.40*ctFade*chargeNeg*ctG;
            emittedLight += ctCol;
            onLight      += ctCol * 0.30;
          }
        }
      }
    } // end cross-trigger CC→CG


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
