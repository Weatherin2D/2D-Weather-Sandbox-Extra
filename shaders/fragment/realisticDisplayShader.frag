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
uniform float greenHueStartThreshold;
uniform float greenHueEndThreshold;
uniform float greenHueStrength;

uniform vec3 view;   // Xpos  Ypos    Zoom
uniform vec4 cursor; // Xpos   Ypos  Size   type

uniform float displayVectorField;

uniform float iterNum;

uniform float smoothClouds;
uniform float enhancedLooks;
uniform float enableRHFog;

out vec4 fragmentColor;

#include "common.glsl"

#include "commonDisplay.glsl"

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
  vec3 vegetationCol = mix(greenGrassCol, dryGrassCol, max(1.0 - water[SOIL_MOISTURE] * (1. / fullGreenSoilMoisture), 0.)); // green to brown

  vec3 bareSoilCol = mix(bareDrySoilCol, bareWetSoilCol, map_rangeC(water[SOIL_MOISTURE], 0.0, 20.0, 0.0, 1.0));

  vec3 surfCol = mix(bareSoilCol, vegetationCol, min(float(wall[VEGETATION]) / 50., 1.));

  const vec3 rockCol = vec3(0.70);                                 // gray rock

  vec3 color = mix(surfCol, rockCol, clamp(depth * 0.35, 0., 1.)); // * 0.15


  color *= texture(noiseTex, vec2(texCoord.x * resolution.x, texCoord.y * resolution.y) * 0.2).rgb;                                   // add noise texture

  color = mix(color, vec3(1.0), clamp(min(water[SNOW], fullWhiteSnowHeight) / fullWhiteSnowHeight - max(depth * 0.3, 0.), 0.0, 1.0)); // mix in white for snow cover

  return color;
}

const vec2 lightningTexRes = vec2(2500, 5000);
const float lightningTexAspect = lightningTexRes.x / lightningTexRes.y;

float calcLightningTime(float startIterNum)
{
  float lightningTime = iterNum - startIterNum;
  return lightningTime / 60.0; // 30.0    0. to 1. leader stage, 1. + Flash stage
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

  const float branchShowFactor = 0.6;       // 1.5
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

  const vec3 lightningCol = vec3(0.70, 0.57, 1.0); // 0.584, 0.576, 1.0

  vec3 outputColor = max(pixVal * lightningCol, vec3(0));

  return outputColor;
}

// Cloud-to-cloud lightning: horizontal discharge between cloud layers
vec3 displayCloudToCloudLightning(vec2 pos, float lightningTime, float currentLightningIntensity)
{
  // CC lightning travels horizontally between cloud layers
  vec2 texOffset = texCoord - pos;
  texOffset.x *= aspectRatios[0];

  // Create branching horizontal pattern using noise
  float branchPattern = abs(fract(sin(texOffset.x * 20.0 + pos.y * 10.0) * 43758.5453));
  branchPattern = pow(branchPattern, 3.0);

  // Combine distance and pattern
  float distFromBolt = length(vec2(texOffset.x, texOffset.y * 3.0 + branchPattern * 0.1));

  // Leader phase shows channel, return stroke shows bright flash
  float boltBrightness;
  if (lightningTime < 1.0) {
    // Leader: dimmer, shows path
    boltBrightness = max(0.0, 1.0 - distFromBolt * 50.0) * 0.3;
  } else {
    // Return stroke: bright flash
    boltBrightness = max(0.0, 1.0 - distFromBolt * 30.0) * 1.0;
  }

  // Fade over time
  float timeFade = max(0.0, 1.0 - (lightningTime - 1.0) * 2.0);
  boltBrightness *= timeFade * currentLightningIntensity;

  // CC lightning is more purple/blue
  vec3 ccColor = vec3(0.60, 0.65, 1.0);

  vec3 result = boltBrightness * ccColor * 50000.0;

  return result;
}

// Spider lightning: crawls horizontally along the cloud base
vec3 displaySpiderLightning(vec2 pos, float lightningTime, float currentLightningIntensity)
{
  // Spider lightning crawls along the bottom of the anvil
  vec2 texOffset = texCoord - pos;
  texOffset.x *= aspectRatios[0];

  // Multiple tendrils spreading outward
  float numTendrils = 5.0;
  float tendrilPattern = 0.0;

  for (float i = 0.0; i < numTendrils; i++) {
    float tendrilDir = (i / numTendrils - 0.5) * 2.0; // -1 to 1 spread
    float tendrilX = texOffset.x - tendrilDir * 0.15;
    float tendrilDist = abs(tendrilX) * (1.0 + abs(tendrilDir) * 2.0);
    tendrilPattern += exp(-tendrilDist * 20.0) * (1.0 - abs(tendrilDir) * 0.3);
  }

  // Very narrow vertical spread - stays at cloud base
  float verticalSpread = exp(-abs(texOffset.y) * 80.0);

  float spiderIntensity = tendrilPattern * verticalSpread;

  // Fade over time - spider lightning can last longer
  float timeFade;
  if (lightningTime < 1.0) {
    timeFade = lightningTime; // ramp up
  } else {
    timeFade = max(0.0, 1.0 - (lightningTime - 1.0) * 0.5); // slow fade
  }

  spiderIntensity *= timeFade * currentLightningIntensity;

  // Spider lightning has slight reddish tint
  vec3 spiderColor = vec3(0.75, 0.62, 0.95);

  vec3 result = spiderIntensity * spiderColor * 40000.0;

  return result;
}

// Sprite: upper atmospheric discharge above thunderstorms
vec3 displaySprite(vec2 pos, float lightningTime, float currentLightningIntensity)
{
  // Sprites appear high above the storm (above simulation bounds)
  // We render them at the top of the visible area with a distinctive appearance

  // Position is high above the storm
  vec2 texOffset = texCoord - vec2(pos.x, 1.0); // Position at top of screen
  texOffset.x *= aspectRatios[0];

  // Sprite appears as a red-orange glow with tendrils reaching upward
  float distFromCenter = length(texOffset * vec2(1.0, 3.0)); // Elongated vertically

  // Carrot/column shape reaching upward
  float upwardTendrils = max(0.0, -texOffset.y) * 3.0; // Only above center
  float columnShape = exp(-distFromCenter * 15.0) * (1.0 + upwardTendrils);

  // Halo ring at base
  float ringDist = abs(distFromCenter - 0.08);
  float ringShape = exp(-ringDist * 50.0) * 0.5;

  float spriteIntensity = (columnShape + ringShape) * 0.5;

  // Very brief duration - sprites last only milliseconds
  float timeFade = exp(-lightningTime * 3.0);
  spriteIntensity *= timeFade * currentLightningIntensity;

  // Sprites are reddish-orange
  vec3 spriteColor = vec3(1.0, 0.35, 0.15);

  return spriteIntensity * spriteColor * 30000.0;
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

  // Only apply fog if relative humidity is strictly above 95% and maxWater is valid and fog is enabled
  // Disable RH fog when Enhanced Looks is enabled to prevent pixelation with dark storm clouds
  if (enableRHFog > 0.5 && enhancedLooks < 0.5 && relHum > 0.95 && maxWater(realTemp) > 0.001) {
    // Mist: 95% RH -> 0.00025% opacity, 98% RH -> 0.0025% opacity
    if (relHum < 0.98) {
      fogMistOpacity = mix(0.0000025, 0.000025, (relHum - 0.95) / (0.98 - 0.95));
    }
    // Plateau: 98% - 98.5% RH -> 0.0025% opacity
    else if (relHum < 0.985) {
      fogMistOpacity = 0.25;
    }
    // Fog: 98.5% RH -> 0.0025% opacity, 100% RH -> 0.025% opacity (haze only, not cloud)
    else {
      fogMistOpacity = mix(0.000025, 0.00025, clamp((relHum - 0.985) / (1.0 - 0.985), 0.0, 1.0));
    }
    fogMistOpacity = clamp(fogMistOpacity, 0.0, 0.00025);
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


  vec4 lightningData = texture(lightningDataTex, vec2(0.5));
  vec2 lightningPosRaw = lightningData.xy;

  // Decode lightning type from position signs and intensity packing
  int lightningType = LIGHTNING_CG; // default
  vec2 lightningPos = lightningPosRaw;
  float rawIntensity = lightningData[INTENSITY];

  // Unpack type from intensity (type encoded as multiples of 10 added to base intensity)
  if (rawIntensity > 10.0) {
    lightningType = int(rawIntensity / 10.0);
    rawIntensity = mod(rawIntensity, 10.0);
  }

  // Decode position encoding
  if (lightningPos.y < -0.5) {
    // Spider lightning
    lightningType = LIGHTNING_SPIDER;
    lightningPos.y = (-lightningPos.y - 1.0);
  } else if (lightningPos.y < 0.0) {
    // Cloud-to-cloud
    lightningType = LIGHTNING_CC;
    lightningPos.y = -lightningPos.y;
  } else if (lightningPos.x < 0.0) {
    // Bolt from the blue
    lightningType = LIGHTNING_BOLT_BLUE;
    lightningPos.x = -lightningPos.x;
  }

  float lightningStartIterNum = lightningData[START_ITERNUM];
  float lightningTime = calcLightningTime(lightningStartIterNum);
  float currentLightningIntensity = lightningIntensityOverTime(lightningTime, lightningPos, rawIntensity);

  // Render different lightning types
  if (rawIntensity > 0.01) {
    if (lightningType == LIGHTNING_CG || lightningType == LIGHTNING_BOLT_BLUE) {
      // Standard CG or Bolt from Blue - both go to ground
      emittedLight += displayLightning(lightningPos, lightningTime, currentLightningIntensity);
      emittedLight /= 1. + cloudDensity * 100.0;
    }
    else if (lightningType == LIGHTNING_CC) {
      // Cloud-to-cloud: horizontal lightning between cloud layers
      vec3 ccLight = displayCloudToCloudLightning(lightningPos, lightningTime, currentLightningIntensity);
      emittedLight += ccLight;
    }
    else if (lightningType == LIGHTNING_SPIDER) {
      // Spider lightning: crawls horizontally along cloud base
      vec3 spiderLight = displaySpiderLightning(lightningPos, lightningTime, currentLightningIntensity);
      emittedLight += spiderLight;
    }
    else if (lightningType == LIGHTNING_SPRITE) {
      // Sprite: upper atmospheric discharge
      vec3 spriteLight = displaySprite(lightningPos, lightningTime, currentLightningIntensity);
      emittedLight += spriteLight;
    }
  }

#define lightningOnLightBrightness 0.004 // 0.002

  vec2 dist = vec2(lightningPos.x - texCoord.x, max((abs(lightningPos.y / 2. - texCoord.y) - 0.1), 0.));
  dist.x *= aspectRatios[0];
  float lightningOnLight = lightningOnLightBrightness / (pow(length(dist), 2.) + 0.03);
  lightningOnLight *= currentLightningIntensity;
  onLight += vec3(lightningOnLight);

  return vec4(color, opacity);
}

float rand(float n) { return fract(sin(n) * 43758.5453123); }

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
