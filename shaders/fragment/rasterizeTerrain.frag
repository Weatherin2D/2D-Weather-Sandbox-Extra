#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D smokeTex;
uniform sampler2D terrainHeightTex;
uniform sampler2D oldHeightTex;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform float dryLapse;
uniform vec4 initial_Tv[126];
uniform int paintSurfaceType; // -1 keep existing surface type
uniform int paintSurfaceKind; // 0 land 1 fresh 2 sea 3 iceSheet 4 iceCap
uniform float waterTemperature;
uniform bool allowCaves;
uniform vec4 userInputValues; // xpos Ypos intensity brushRadiusCells — used when remeshInBrush != 0
uniform bool wrapHorizontally;
uniform int remeshInBrush; // 1 = also remesh columns under the brush (water/ice type paint)

#include "common.glsl"

layout(location = 0) out vec4 base;
layout(location = 1) out vec4 water;
layout(location = 2) out ivec4 wall;
layout(location = 3) out float smoke;

float getInitialT(int y)
{
  int i = simProfileIndex(y, resolution.y);
  return initial_Tv[i / 4][i % 4];
}

int interiorTypeFor(int surfaceType)
{
  if (isAnyWaterType(surfaceType) || surfaceType == WALLTYPE_INERT)
    return surfaceType;
  if (isCustomBase(surfaceType))
    return surfaceType;
  return WALLTYPE_LAND;
}

bool isKeepableLandSurface(int t)
{
  return isLandFireOrForest2(t) || isSettlementWall(t) || t == WALLTYPE_RUNWAY
      || t == WALLTYPE_INDUSTRIAL || isCustomTerrain(t);
}

void seedAir(int y)
{
  wall[TYPE] = 0;
  wall[DISTANCE] = 255;
  wall[VERT_DISTANCE] = 100;
  wall[VEGETATION] = 0;
  base = vec4(0.0);
  base[TEMPERATURE] = getInitialT(y);
  float realTemp = potentialToRealT(base[TEMPERATURE]);
  if (texCoord.y < 0.20)
    water = vec4(maxWater(realTemp - 2.0), 0.0, 0.0, 0.0);
  else
    water = vec4(maxWater(realTemp - 20.0), 0.0, 0.0, 0.0);
  smoke = 0.0;
}

void applyPaintedSurfaceDefaults(int t)
{
  if (t == WALLTYPE_FRESH_WATER) {
    base[TEMPERATURE] = waterTemperature;
    water[TOTAL] = WATER_MARKER_FRESH;
    water[SALINITY] = 0.0;
    water[SNOW] = 0.0;
    wall[VEGETATION] = 0;
  } else if (t == WALLTYPE_WATER) {
    base[TEMPERATURE] = waterTemperature;
    water[TOTAL] = WATER_MARKER_SALT;
    water[SALINITY] = oceanSalinityPpt;
    water[SNOW] = 0.0;
    wall[VEGETATION] = 0;
  } else if (t == WALLTYPE_ICE) {
    base[TEMPERATURE] = CtoK(-5.0);
    water[TOTAL] = WATER_MARKER_ICE;
    if (paintSurfaceKind == 4)
      water[SALINITY] = landIceSalinityMarker;
    else
      water[SALINITY] = oceanSalinityPpt;
    water[SNOW] = max(water[SNOW], paintSurfaceKind == 4 ? 50.0 : 10.0);
    wall[VEGETATION] = 0;
  } else if (t == WALLTYPE_INERT) {
    base[TEMPERATURE] = 1000.0;
    water = vec4(WATER_MARKER_LAND, 0.0, 0.0, 0.0);
    wall[VEGETATION] = 0;
  } else if (isCustomTerrain(t) && paintSurfaceKind >= 1) {
    if (paintSurfaceKind == 1) {
      base[TEMPERATURE] = waterTemperature;
      water[TOTAL] = WATER_MARKER_FRESH;
      water[SALINITY] = 0.0;
      water[SNOW] = 0.0;
    } else if (paintSurfaceKind == 2) {
      base[TEMPERATURE] = waterTemperature;
      water[TOTAL] = WATER_MARKER_SALT;
      water[SALINITY] = oceanSalinityPpt;
      water[SNOW] = 0.0;
    } else {
      base[TEMPERATURE] = CtoK(-5.0);
      water[TOTAL] = WATER_MARKER_ICE;
      water[SALINITY] = paintSurfaceKind == 4 ? landIceSalinityMarker : oceanSalinityPpt;
      water[SNOW] = max(water[SNOW], paintSurfaceKind == 4 ? 50.0 : 10.0);
    }
    wall[VEGETATION] = 0;
  } else {
    base[TEMPERATURE] = 1000.0;
    if (water[TOTAL] < WATER_MARKER_LAND || water[TOTAL] >= WATER_MARKER_SALT)
      water[TOTAL] = WATER_MARKER_LAND;
    if (water[SOIL_MOISTURE] < 0.01)
      water[SOIL_MOISTURE] = 25.0;
    if (water[SUSTAINED_MOISTURE] < 0.01)
      water[SUSTAINED_MOISTURE] = packSustainedWithRainFreq(25.0, 0.0);
  }
}

void fillInterior(int inner, vec4 oldSurfWater)
{
  wall[TYPE] = inner;
  wall[VEGETATION] = 0;
  base = vec4(0.0, 0.0, 0.0, isAnyWaterType(inner) ? waterTemperature : 1000.0);
  if (inner == WALLTYPE_FRESH_WATER)
    water = vec4(WATER_MARKER_FRESH, 0.0, 0.0, 0.0);
  else if (inner == WALLTYPE_WATER)
    water = vec4(WATER_MARKER_SALT, oceanSalinityPpt, 0.0, 0.0);
  else if (inner == WALLTYPE_ICE)
    water = vec4(WATER_MARKER_ICE, oldSurfWater[SALINITY], 0.0, oldSurfWater[SNOW]);
  else
    water = vec4(WATER_MARKER_LAND, 0.0, 0.0, 0.0);
}

void main()
{
  int ix = int(floor(fragCoord.x));
  int iy = int(floor(fragCoord.y));
  float newH = texelFetch(terrainHeightTex, ivec2(ix, 0), 0).r;
  float oldH = texelFetch(oldHeightTex, ivec2(ix, 0), 0).r;
  newH = max(newH, 1.0);
  oldH = max(oldH, 1.0);

  vec4 prevBase = texture(baseTex, texCoord);
  vec4 prevWater = texture(waterTex, texCoord);
  ivec4 prevWall = texture(wallTex, texCoord);
  float prevSmoke = texture(smokeTex, texCoord).r;

  // Sculpt only changes H(x) under the brush. Leave every other column alone
  // so oceans, soil moisture and vegetation are not rewritten each stroke.
  // Water/ice paint also remeshes columns in the brush when height is unchanged
  // so a flat lake can convert land at the same elevation.
  bool inPaintBrush = false;
  if (remeshInBrush != 0) {
    float radiusTex = userInputValues[3] * texelSize.y;
    float dxTex;
    if (userInputValues.x < -0.5)
      dxTex = 0.0;
    else if (wrapHorizontally)
      dxTex = absHorizontalDist(userInputValues.x, texCoord.x);
    else
      dxTex = abs(userInputValues.x - texCoord.x);
    dxTex *= texelSize.y / texelSize.x;
    inPaintBrush = dxTex <= radiusTex;
  }
  bool columnSculpted = abs(newH - oldH) > 0.0001 || inPaintBrush;
  if (paintSurfaceType >= 0 && !columnSculpted) {
    base = prevBase;
    water = prevWater;
    wall = prevWall;
    smoke = prevSmoke;
    return;
  }

  float yf = float(iy);
  bool isWallCell = yf < newH || iy == 0;
  bool isSurfaceCell = isWallCell && (yf + 1.0 >= newH);

  int capY = int(clamp(floor(oldH - 0.001), 0.0, resolution.y - 1.0));
  ivec4 oldSurfWall = texelFetch(wallTex, ivec2(ix, capY), 0);
  if (oldSurfWall[DISTANCE] != 0) {
    for (int k = 1; k < 8; k++) {
      int y = capY - k;
      if (y < 0)
        break;
      ivec4 w = texelFetch(wallTex, ivec2(ix, y), 0);
      if (w[DISTANCE] == 0) {
        capY = y;
        oldSurfWall = w;
        break;
      }
    }
  }
  vec4 oldSurfWater = texelFetch(waterTex, ivec2(ix, capY), 0);
  vec4 oldSurfBase = texelFetch(baseTex, ivec2(ix, capY), 0);
  if (oldSurfWall[DISTANCE] != 0) {
    oldSurfWall = prevWall;
    oldSurfWater = prevWater;
    oldSurfBase = prevBase;
  }

  int surfaceType = paintSurfaceType >= 0 ? paintSurfaceType : oldSurfWall[TYPE];
  if (surfaceType < 0 || (paintSurfaceType < 0 && oldSurfWall[DISTANCE] != 0))
    surfaceType = WALLTYPE_LAND;
  if (paintSurfaceType == WALLTYPE_LAND && isKeepableLandSurface(oldSurfWall[TYPE]))
    surfaceType = oldSurfWall[TYPE];

  if (!isWallCell) {
    if (prevWall[DISTANCE] == 0 || prevWater[TOTAL] > 1000.0 || !(prevBase[TEMPERATURE] > 200.0 && prevBase[TEMPERATURE] < 400.0)) {
      seedAir(iy);
    } else {
      base = prevBase;
      water = prevWater;
      smoke = prevSmoke;
      wall = prevWall;
      wall[DISTANCE] = 255;
      wall[VEGETATION] = 0;
    }
    return;
  }

  bool inNewBand = yf >= oldH && yf < newH;

  // Keep existing cave air, and never refill interiors that are already solid
  // (lakes stay lakes; buried soil/type stays put).
  if (!isSurfaceCell && prevWall[DISTANCE] != 0) {
    if (allowCaves && !inNewBand && prevWater[TOTAL] < 1000.0
        && prevBase[TEMPERATURE] > 200.0 && prevBase[TEMPERATURE] < 400.0) {
      base = prevBase;
      water = prevWater;
      smoke = prevSmoke;
      wall = prevWall;
      return;
    }
  }

  if (!isSurfaceCell && prevWall[DISTANCE] == 0 && !inNewBand) {
    if (inPaintBrush && paintSurfaceType >= 0 && isAnyWaterType(paintSurfaceType)
        && !isAnyWaterType(prevWall[TYPE])) {
      fillInterior(interiorTypeFor(paintSurfaceType), oldSurfWater);
      wall[DISTANCE] = 0;
      wall[VERT_DISTANCE] = int(clamp(yf - (newH - 1.0), -127.0, 0.0));
      smoke = 0.0;
      return;
    }
    base = prevBase;
    water = prevWater;
    smoke = 0.0;
    wall = prevWall;
    wall[DISTANCE] = 0;
    wall[VEGETATION] = 0;
    wall[VERT_DISTANCE] = int(clamp(yf - (newH - 1.0), -127.0, 0.0));
    return;
  }

  smoke = 0.0;
  wall[DISTANCE] = 0;
  wall[VERT_DISTANCE] = int(clamp(yf - (newH - 1.0), -127.0, 0.0));

  if (isSurfaceCell) {
    wall[TYPE] = surfaceType;
    wall[VEGETATION] = oldSurfWall[VEGETATION];
    water = oldSurfWater;
    base = oldSurfBase;
    base[VX] = 0.0;
    base[VY] = 0.0;
    base[PRESSURE] = 0.0;
    bool typeChanged = oldSurfWall[TYPE] != surfaceType || oldSurfWall[DISTANCE] != 0;
    if (paintSurfaceType >= 0 && typeChanged)
      applyPaintedSurfaceDefaults(surfaceType);
    else if (isAnyWaterType(surfaceType)) {
      if (surfaceType == WALLTYPE_FRESH_WATER)
        water[TOTAL] = WATER_MARKER_FRESH;
      else if (surfaceType == WALLTYPE_ICE)
        water[TOTAL] = WATER_MARKER_ICE;
      else
        water[TOTAL] = WATER_MARKER_SALT;
    } else {
      water[TOTAL] = encodeLandWithFlood(getFloodHeightMm(water[TOTAL]));
      if (!(base[TEMPERATURE] > 200.0))
        base[TEMPERATURE] = 1000.0;
    }
  } else {
    fillInterior(interiorTypeFor(surfaceType), oldSurfWater);
  }
}
