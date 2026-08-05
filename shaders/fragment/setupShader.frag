#version 300 es
precision highp float;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform float dryLapse;

uniform float simHeight;

uniform float seed;
uniform float heightMult;

uniform vec4 initial_Tv[126];

uniform int latitudeBasedTemperature;
uniform int multiLatitudeMode;
uniform float latitude;
uniform float latitudeLeft;
uniform float latitudeRight;

float getInitialT(int y) { return initial_Tv[y / 4][y % 4]; }

in vec2 texCoord;
in vec2 fragCoord;

#include "common.glsl"

layout(location = 0) out vec4 base;
layout(location = 1) out vec4 water;
layout(location = 2) out ivec4 wall;
layout(location = 3) out float smoke;

float rand(float n) { return fract(sin(n) * 43758.5453123); }

float noise(float p)
{
  float fl = floor(p);
  float fc = fract(p);
  return mix(rand(fl), rand(fl + 1.), fc) - 0.5;
}

float columnLatitude()
{
  if (multiLatitudeMode != 0)
    return mix(latitudeLeft, latitudeRight, texCoord.x);
  return latitude;
}

void main()
{
  base = vec4(0.0);
  water = vec4(0.0);
  smoke = 0.0;

  // WALL SETUP

  float height = 0.0;
  float height_m = 0.0;

  if (heightMult < 0.05) { // all sea

    height = 0.0;

  } else if (heightMult < 0.10) { // all land

    height = 0.005;

  } else { // generate hills / mountains
    float var = fragCoord.x * 0.001;

    for (float i = 2.0; i < 1000.0; i *= 1.5) { // add multiple frequencies of noise together
      height += noise(var * i + rand(seed + i) * 10.) * 0.5 / i;
    }

    height *= heightMult;
    height_m = height * simHeight; // sim height
  }

  if (texCoord.y < texelSize.y || texCoord.y < height) {                                                      // set to wall
    wall[DISTANCE] = 0;                                                                                       // set to wall
    float climateC = climateTempCFromLatitude(columnLatitude());
    if (height < texelSize.y) {
      wall[TYPE] = WALLTYPE_WATER;                                                                            // set walltype to water
      base[TEMPERATURE] = CtoK(latitudeBasedTemperature != 0 ? climateC : 25.0);                              // set water temperature
    } else {
      wall[TYPE] = WALLTYPE_LAND;                                                                             // set walltype to land
      water[SOIL_MOISTURE] = 25.0;                                                                            // soil moisture in mm

      wall[VEGETATION] = int(110.0 - fragCoord.y * 2. + noise(fragCoord.x * 0.01 + rand(seed) * 10.) * 150.); // set vegitation

      water[SNOW] = max(map_rangeC(height_m, 2000.0, 5000.0, 0.0, 100.0), 0.);                                // set snow
      if (latitudeBasedTemperature != 0 && climateC < 0.0)
        water[SNOW] = max(water[SNOW], map_rangeC(climateC, 0.0, -25.0, 0.0, 40.0));
    }
  } else {                                                                                                    // air, not wall
    wall[DISTANCE] = 255;                                                                                     // reset distance to wall
    base[TEMPERATURE] = getInitialT(int(texCoord.y * (1.0 / texelSize.y)));                                   // set temperature
    if (latitudeBasedTemperature != 0) {
      float climateC = climateTempCFromLatitude(columnLatitude());
      base[TEMPERATURE] += (climateC - 15.0); // bias whole column vs default 15°C surface profile
    }

    float realTemp = potentialToRealT(base[TEMPERATURE]);

    if (texCoord.y < 0.20) // set dew point
      water[TOTAL] = maxWater(realTemp - 2.0);
    else
      water[TOTAL] = maxWater(realTemp - 20.0);

    water[CLOUD] = max(water[TOTAL] - maxWater(realTemp), 0.0); // calculate cloud water
  }
  wall[VERT_DISTANCE] = 100;                                    // preset height above ground to prevent water being deleted in boundaryshader ln 250*`
}
