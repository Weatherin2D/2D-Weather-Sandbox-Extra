#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;

in vec2 texCoord;     // this
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform sampler2D vortForceTex;
uniform isampler2D wallTex;
uniform sampler2D lightTex;
uniform sampler2D precipFeedbackTex;
uniform sampler2D precipDepositionTex;
uniform sampler2D sunColumnTex;

uniform float dryLapse;
uniform float evapHeat;
uniform vec2 resolution;
uniform vec2 texelSize;
uniform float vorticity;
uniform float lightEffectScale; // 0 = freeze radiative heating this substep (lighting skipped)
uniform float waterEvaporation;
uniform float landEvaporation;
uniform float waterWeight;
uniform vec4 initial_Tv[126];
uniform bool allowCaves;

float getInitialT(int y) { return initial_Tv[y / 4][y % 4]; }

uniform float sunAngle;
uniform float sunAzimuth;
uniform int latitudeBasedTemperature;

uniform float iterNum; // used as seed for random function

uniform float dynamicWaterTemperature;
uniform float meltingHeat;
uniform float stormSurgeStrength;      // 0–2; scales onshore-wind coastal inundation
uniform float stormSurgeWindThreshold; // windScale units; higher = needs stronger onshore wind
uniform float stormSurgeMaxCells;      // max ocean runup height in cells
uniform float stormSurgeInlandReach;   // how many land cells inland surge can reach
uniform float floodRainThreshold;      // air PRECIPITATION intensity required to flash-flood
uniform float floodPondRate;           // ponding mm build rate once rain exceeds threshold
uniform float enableFlooding;          // 0/1 — natural rain→flood ponding
uniform float enableStormSurge;        // 0/1 — coastal storm-surge inundation

layout(location = 0) out vec4 base;
layout(location = 1) out vec4 water;
layout(location = 2) out ivec4 wall;

#include "common.glsl"

#define minimalFireVegetation 20

#define minimalFireIntensity 0.002
#define significantFloodMm 3.0 // standing water above field capacity that instantly quenches fire

#define wallVerticalInfluence 1 // 2 How many cells above the wall surface effects like heating and evaporation are applied


// #define wallManhattanInfluence 2 // 2 How many cells from the nearest wall effects like smoothing and drag are applied
#define exchangeRate 0.015       // Rate of smoothing near surface

void exchangeWith(vec2 texCoord) // exchange temperature and water
{
  // base[TEMPERATURE] -= (base[TEMPERATURE] - texture(baseTex, texCoord)[TEMPERATURE]) * exchangeRate;
  // water[0] -= (water[0] - texture(waterTex, texCoord)[0]) * exchangeRate;

  base[VX] -= (base[VX] - texture(baseTex, texCoord)[VX]) * exchangeRate;
}


float calcEvaporation(float T, float W, float V, float M)                                             // temperature, total water, vegetation, soil moisture
{
  return max((maxWater(T) - W) * landEvaporation * (V / 127. + 0.1) * min(M + 1.0, 50.0) * 0.05, 0.); // landEvaporation should be adjusted to remove * 0.05 factor
}

float calcFireIntensity(int veg, float moist, float precip) { return max(vegetationInfluence(veg) * 0.00032 - moist * 0.00020 - precip * 0.02, 0.); }

// How many cells this sample sits above an ocean surface (0 = same height, negative = below ocean top).
// Large value means not an ocean column.
float cellsAboveOceanAt(vec2 uv)
{
  ivec4 w = texture(wallTex, uv);
  if (w[TYPE] != WALLTYPE_WATER)
    return 1e6;
  // Wall ocean: VERT 0 at surface, negative below. Air above ocean: VERT = height above surface.
  return float(w[VERT_DISTANCE]);
}

bool isSurgeFloodLandType(int wallType)
{
  return wallType == WALLTYPE_LAND || wallType == WALLTYPE_FIRE
      || wallType == WALLTYPE_URBAN || wallType == WALLTYPE_SUBURBAN
      || wallType == WALLTYPE_INDUSTRIAL || wallType == WALLTYPE_RUNWAY
      || isCustomBase(wallType);
}

void main()
{
  base = texture(baseTex, texCoord);
  water = texture(waterTex, texCoord);

  vec4 precipFeedback = texture(precipFeedbackTex, texCoord);

  vec4 sunCol = sampleSunColumn(sunColumnTex, texCoord.x);
  float colSunAngle = sunCol.g;
  float climateTempC = sunCol.a;

  float realTemp = potentialToRealT(base[TEMPERATURE]);

  wall = texture(wallTex, texCoord);
  ivec4 wallXmY0 = texture(wallTex, texCoordXmY0);
  ivec4 wallX0Ym = texture(wallTex, texCoordX0Ym);
  ivec4 wallXpY0 = texture(wallTex, texCoordXpY0);
  ivec4 wallX0Yp = texture(wallTex, texCoordX0Yp);

  vec4 light = texture(lightTex, texCoord);

  bool nextToWall = false;

  wall[VERT_DISTANCE] = wallX0Ym[VERT_DISTANCE] + 1; // height above ground is counted

  if (wall[DISTANCE] != 0) {                         // is fluid, not wall

    wall[TYPE] = wallX0Ym[TYPE];                     // copy wall type from wall below

    if (!isLiquidWaterType(wall[TYPE]) && wall[TYPE] != WALLTYPE_ICE)
      base[TEMPERATURE] += light[NET_HEATING] * lightEffectScale; // IR heating/cooling effect

    // Latitude-based climate soft-forcing for near-surface air
    if (latitudeBasedTemperature != 0 && wall[VERT_DISTANCE] <= 3) {
      float climateRealC = climateTempC + map_range(texCoord.y, 0.0, 1.0, 0.0, -85.0);
      base[TEMPERATURE] += (realToPotentialT(CtoK(climateRealC)) - base[TEMPERATURE]) * 0.00003;
    }

    base[TEMPERATURE] += precipFeedback[HEAT]; // rain cools air and riming heats air


    float precipCoalescence = max(-precipFeedback[VAPOR], 0.); // how much cloud water turns into rain

    water[CLOUD] -= precipCoalescence;
    water[TOTAL] -= precipCoalescence;

    float precipEvaporation = max(precipFeedback[VAPOR], 0.);

    water[TOTAL] += precipEvaporation; // evaporating rain adds water vapor to air


    //  0.004 for rain visualisation
    water[PRECIPITATION] = max(water[PRECIPITATION] * 0.997 - 0.00001 + precipFeedback[MASS] * 0.005, 0.0);


    // rain removes smoke from air
    water[SMOKE] /= 1. + max(-precipFeedback[VAPOR] * 0.1, 0.0) + precipFeedback[MASS] * 0.000; // rain formation in clouds removes smoke
                                                                                                // quickly , falling rain slower
    water[SMOKE] -= precipFeedback[MASS] * 0.0001;                                              // linearly to remove last little bit


    water[SMOKE] -= max((water[SMOKE] - 4.0) * 0.01, 0.); // dissipate fire color to smoke

    water[SMOKE] = max(water[SMOKE], 0.0);                // snow and smoke can't go below 0

    if (water[SMOKE] > 4.0) {
      water[SMOKE] -= water[PRECIPITATION] * 0.02; // falling precipitation extinguishes flames
    }

    // GRAVITY
    // temperature is calculated for Vy location
    vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);

#define gravMult 0.0001 // 0.0001 0.0005

    // gravity for convection interpolated between this and above cell to fix wierd waves
    // Because vertical velocity is defined at the top of the cell while temperature is defined in it's center.
    float gravityForce = ((base[TEMPERATURE] + baseX0Yp[TEMPERATURE]) * 0.5 - (getInitialT(int(fragCoord.y)) + getInitialT(int(fragCoord.y) + 1)) * 0.5) * gravMult;

    // float gravityForce = (base[3] - initial_T[int(fragCoord.y)]) * gravMult;

    gravityForce -= water[CLOUD] * gravMult * waterWeight;         // cloud water weight added to gravity force

    gravityForce -= precipFeedback[MASS] * gravMult * waterWeight; // precipitation weigth added to gravity force

    base[VY] += gravityForce;

    // base.x += sin(texCoord.x * PI * 2.0 + iterNum * 0.000005) * (1. - texCoord.y) * 0.00015; // phantom force to simulate high and low pressure areas

    float snowCover = 0.;
    float soilMoisture = 0.;

    if (wallX0Ym[DISTANCE] == 0) { // below is wall
      nextToWall = true;
      wall[DISTANCE] = 1;          // dist to nearest wall = 1

      vec4 waterX0Ym = texture(waterTex, texCoordX0Ym);
      snowCover = waterX0Ym[SNOW];
      soilMoisture = waterX0Ym[SOIL_MOISTURE];
      wall[VERT_DISTANCE] = 1; // directly above ground
    }

    if (wallXmY0[DISTANCE] == 0) {            // left is wall
      nextToWall = true;
      wall[DISTANCE] = 1;                     // dist to nearest wall = 1

      if (isLiquidWaterType(wallXmY0[TYPE])) { // if left is water, build a dyke
        wall[TYPE] = WALLTYPE_LAND;
        wall[DISTANCE] = 0;
      }

      if (wallXpY0[DISTANCE] == 0)            // left and right is wall, make this wall to fill narrow gaps
        wall[DISTANCE] = 0;
    } else if (wallXpY0[DISTANCE] == 0) {     // right is wall
      nextToWall = true;
      wall[DISTANCE] = 1;                     // dist to nearest wall = 1

      if (isLiquidWaterType(wallXpY0[TYPE])) { // if right is water, build a dyke
        wall[TYPE] = WALLTYPE_LAND;
        wall[DISTANCE] = 0;
      }
    }
    if (wallX0Yp[DISTANCE] == 0) {                                                  // above is wall
      nextToWall = true;
      if (texCoord.y < 0.99 && (!allowCaves || isAnyWaterType(wallX0Yp[TYPE]))) { // Fill in land below
        // Preserve custom terrain types when filling mountain interiors
        wall[TYPE] = isCustomTerrain(wallX0Yp[TYPE]) ? wallX0Yp[TYPE] : WALLTYPE_LAND;
        wall[DISTANCE] = 0;                                                         //  set this to wall
      } else {
        wall[DISTANCE] = 1;
      }
    }


    // if(abs(base.x) > 0.0040 && abs(base.y) > 0.0040){
    //  sample vorticity force
    vec2 vortForceX0Y0 = texture(vortForceTex, texCoord).xy;
    vec2 vortForceXmY0 = texture(vortForceTex, texCoordXmY0).xy;
    vec2 vortForceX0Ym = texture(vortForceTex, texCoordX0Ym).xy;

    float velocityFactor = length(base.xy) * 0.1; // 0.2

    // apply vorticity force
    base.xy += vec2(vortForceX0Y0.x + vortForceX0Ym.x, vortForceX0Y0.y + vortForceXmY0.y) * (vorticity + velocityFactor);
    //}

    if (nextToWall) {
      if (!isAnyWaterType(wall[TYPE])) { // any land
        // Uniform horizontal-surface irradiance (same as water); not screen-space sun direction.
        float lightPower = max(light[SUNLIGHT] * cos(colSunAngle), 0.0);

        float albedoTotal = ALBEDO_INERT;

        if (wall[TYPE] == WALLTYPE_INERT) {
          albedoTotal = ALBEDO_INERT;
        } else if (wall[TYPE] == WALLTYPE_LAND || wall[TYPE] == WALLTYPE_FIRE || isCustomBase(wall[TYPE])) {
          float albedoSoil = map_rangeC(soilMoisture, 0., 20., ALBEDO_DRYSOIL, ALBEDO_WETSOIL);
          albedoSoil = map_rangeC(snowCover, 0.0, fullWhiteSnowHeight, albedoSoil, ALBEDO_SNOW);                         // add snow albedo
          float vegSample = float(wallX0Ym[VEGETATION]);
          float grassFrac = clamp(grassBiomass(int(vegSample)) / float(GRASS_VEG_MAX), 0.0, 1.0);
          float forestFrac = clamp(forestBiomass(int(vegSample)) / float(FOREST_VEG_MAX - GRASS_VEG_MAX), 0.0, 1.0);
          float grassAlbedo = map_range(snowCover, 0., fullWhiteSnowHeight, ALBEDO_GRASS, ALBEDO_SNOW);
          float forestAlbedo = map_range(snowCover, 0., fullWhiteSnowHeight, ALBEDO_FOREST, ALBEDO_SNOW_FOREST);
          float vegAlbedo = mix(grassAlbedo, forestAlbedo, forestFrac);
          float vegCover = max(grassFrac * 0.55, forestFrac);
          albedoTotal = mix(albedoSoil, vegAlbedo, clamp(vegCover, 0.0, 1.0));
        } else if (wall[TYPE] == WALLTYPE_URBAN || isCustomOverlay(wall[TYPE])) {
          albedoTotal = ALBEDO_URBAN;
        } else if (wall[TYPE] == WALLTYPE_SUBURBAN) {
          albedoTotal = ALBEDO_SUBURBAN;
        } else if (wall[TYPE] == WALLTYPE_INDUSTRIAL) {
          albedoTotal = ALBEDO_INDUSTRIAL;
        } else if (wall[TYPE] == WALLTYPE_RUNWAY) {
          albedoTotal = ALBEDO_RUNWAY;
        }

        // Standing floodwater: behave like a shallow freshwater surface (higher albedo, larger heat capacity)
        float sfcFloodMm = 0.0;
        if (wallX0Ym[DISTANCE] == 0)
          sfcFloodMm = getFloodHeightMm(texture(waterTex, texCoordX0Ym)[TOTAL]);
        float floodFrac = clamp(sfcFloodMm / 12.0, 0.0, 1.0);
        if (floodFrac > 0.0) {
          albedoTotal = mix(albedoTotal, ALBEDO_FRESH_WATER, floodFrac);
        }

        lightPower *= (1. - albedoTotal);
        lightPower *= lightHeatingConst;
        // Standing water spreads/absorbs heat — sun warms flooded tiles much less than dry land
        lightPower /= mix(1.0, waterHeatCapacity * 0.35, floodFrac);
        base[TEMPERATURE] += lightPower * lightEffectScale; // sun heating land

        // Mild climate tendency toward latitude-based sea-level temperature
        if (latitudeBasedTemperature != 0) {
          float climatePotential = CtoK(climateTempC);
          base[TEMPERATURE] += (climatePotential - base[TEMPERATURE]) * 0.00008;
        }
      }
    }

    if (!nextToWall) { // not next to wall

      // find nearest wall
      int nearest = 255;
      // int nearestType = 0; // not used, type is only extended vertically now
      if (wallX0Ym[DISTANCE] < nearest) {
        nearest = wallX0Ym[DISTANCE];
        //   nearestType = wallX0Ym[TYPE];
      }
      if (wallX0Yp[DISTANCE] < nearest) {
        nearest = wallX0Yp[DISTANCE];
        //  nearestType = wallX0Yp[TYPE];
      }
      if (wallXmY0[DISTANCE] < nearest) {
        nearest = wallXmY0[DISTANCE];
        //  nearestType = wallXmY0[TYPE];
      }
      if (wallXpY0[DISTANCE] < nearest) {
        nearest = wallXpY0[DISTANCE];
        //   nearestType = wallXpY0[TYPE];
      }

      wall[DISTANCE] = nearest + 1; // add one to dist to wall
                                    // wall[TYPE] = nearestType;     // type = type of nearest wall
    }

#define surfaceWindSmootingDist 5

    if (wall[VERT_DISTANCE] <= surfaceWindSmootingDist) { // above surface

      if (wall[VERT_DISTANCE] == 1) {
        float surfaceDrag = 0.0015; // water or runway
        if (wall[TYPE] == WALLTYPE_URBAN || isCustomOverlay(wall[TYPE]))
          surfaceDrag = 0.040;
        else if (wall[TYPE] == WALLTYPE_SUBURBAN)
          surfaceDrag = 0.012;
        else if (isCustomBase(wall[TYPE])) {
          float gBio = grassBiomass(wall[VEGETATION]);
          float fBio = forestBiomass(wall[VEGETATION]);
          surfaceDrag = map_rangeC(fBio, 0., float(FOREST_VEG_MAX - GRASS_VEG_MAX), 0.0015 + gBio * 0.00004, 0.020);
        }
        else if (wall[TYPE] == WALLTYPE_LAND || wall[TYPE] == WALLTYPE_FIRE) {
          float gBio = grassBiomass(wall[VEGETATION]);
          float fBio = forestBiomass(wall[VEGETATION]);
          surfaceDrag = map_rangeC(fBio, 0., float(FOREST_VEG_MAX - GRASS_VEG_MAX), 0.0015 + gBio * 0.00004, 0.020);
        }

        // base[VX] *= 1. - surfaceDrag;                        // surface drag
        base[VX] -= abs(base[VX]) * base[VX] * surfaceDrag * 50.; // quadratic surface drag
      }

      // Smoothing near surface

      if (/*wallX0Yp[VERT_DISTANCE] != 0 && */ wallX0Yp[VERT_DISTANCE] <= surfaceWindSmootingDist) { // above
        exchangeWith(texCoordX0Yp);
      }

      if (wallX0Ym[VERT_DISTANCE] > 0 /* && wallX0Ym[1] <= wallManhattanInfluence*/) { // below
        exchangeWith(texCoordX0Ym);
      }
      /*
            if (wallXmY0[1] != 0 && wallXmY0[1] <= wallManhattanInfluence) { // left
              exchangeWith(texCoordXmY0);
            }

            if (wallXpY0[1] != 0 && wallXpY0[1] <= wallManhattanInfluence) { // right
              exchangeWith(texCoordXpY0);
            }*/
    }

    if (wall[VERT_DISTANCE] <= 8) { // within height of buildings


      const float influenceDevider = float(wallVerticalInfluence); // devide by how many cells it's aplied to

      wall[VEGETATION] = wallX0Ym[VEGETATION];                     // vegetation is copied from below

      // base[PRESSURE] *= 0.995; // 0.999

      // base[PRESSURE]  += 0.001; // add air pressure at the suface. makes air rise everywhere and creates huge cells

      vec4 waterInSurface = texture(waterTex, texCoordX0Ym);

      switch (wall[TYPE]) {
      case WALLTYPE_FIRE:
        if (wall[VERT_DISTANCE] == 1) { // forest fire & one above surface
          float sfcFlood = getFloodHeightMm(waterInSurface[TOTAL]);
          float fireIntensity = 0.0;
          if (sfcFlood < significantFloodMm) {
            fireIntensity = calcFireIntensity(wall[VEGETATION], waterInSurface[SOIL_MOISTURE], water[PRECIPITATION]);
            fireIntensity = max(fireIntensity, 0.);
          }
          base[TEMPERATURE] += fireIntensity;   // heat
          water[SMOKE] += fireIntensity * 2.0;  // smoke
          water[TOTAL] += fireIntensity * 0.50; // extra water from burning trees, both from water in the wood and from burning of hydrogen and hydrocarbons
        }
        // nobreak!
      case WALLTYPE_INDUSTRIAL:
        if (wall[TYPE] == WALLTYPE_INDUSTRIAL) { // exclude WALLTYPE_FIRE
          int texFragX = int(fragCoord.x) % 80;

          if (wall[VERT_DISTANCE] == 5 && (texFragX == 18 || texFragX == 22)) { // cooling towers
            water[TOTAL] += 0.25;
            // base[TEMPERATURE] += 0.02;
            base.xy *= 0.5;
            base.y += 0.05;
          }

          else if (wall[VERT_DISTANCE] == 6 && texFragX == 29) { // smoke stack
            water[SMOKE] += 0.01;
            base[TEMPERATURE] += 0.02;
            base.xy *= 0.5;
          }
        }
        // nobreak!
      case WALLTYPE_SUBURBAN:
        if (wall[TYPE] == WALLTYPE_SUBURBAN)
          water[SMOKE] += 0.0000004;
        // nobreak!
      case WALLTYPE_URBAN:
        if (wall[TYPE] == WALLTYPE_URBAN)
          water[SMOKE] += 0.000002; // Urban produces smog
        // nobreak!
      case WALLTYPE_LAND:
        if (wall[VERT_DISTANCE] <= wallVerticalInfluence) {

          float evaporation = calcEvaporation(realTemp, water[TOTAL], vegetationInfluence(wall[VEGETATION]), waterInSurface[SOIL_MOISTURE]) / influenceDevider;

          // Flooded land: sun-boosted evaporation into the air (like open freshwater)
          float floodFracAir = clamp(getFloodHeightMm(waterInSurface[TOTAL]) / 12.0, 0.0, 1.0);
          if (floodFracAir > 0.0) {
            float sunEvap = max(light[SUNLIGHT] * cos(colSunAngle), 0.0) / standardSunBrightness;
            float waterLikeEvap = max((maxWater(realTemp) - water[TOTAL]) * waterEvaporation, 0.0) / influenceDevider;
            evaporation = mix(evaporation, max(evaporation, waterLikeEvap), floodFracAir);
            evaporation *= (1.0 + sunEvap * 2.5 * floodFracAir);
          }

          water[TOTAL] += evaporation;
          base[TEMPERATURE] -= evaporation * evapHeat * 0.5;                                // evaporative cooling (half the real value, to prevent boring non convective conditions)

          if (wall[VEGETATION] < 10 && water[SOIL_MOISTURE] < 5.0) {                        // Dry desert area
            water[SMOKE] = min(water[SMOKE] + (max(abs(base[VX]) - 0.12, 0.) * 0.15), 2.4); // Dust blowing up with wind
          }
        }
        break;
      case WALLTYPE_FRESH_WATER:
      case WALLTYPE_WATER:
      case WALLTYPE_ICE:
        if (wall[VERT_DISTANCE] <= wallVerticalInfluence) {
          float LocalWaterTemperature = texture(baseTex, texCoordX0Ym)[TEMPERATURE];                                       // water / ice temperature
          base[TEMPERATURE] += (LocalWaterTemperature - realTemp - 1.0) / influenceDevider * waterHeatExchangeRate;        // air heated or cooled by surface below

          if (isLiquidWaterType(wallX0Ym[TYPE]))
            water[TOTAL] += max((maxWater(LocalWaterTemperature) - water[TOTAL]) * waterEvaporation / influenceDevider, 0.); // water evaporating
        }
        break;
      }
    }
  } else {                                                                 // this is wall

    wall[VERT_DISTANCE] = wallX0Yp[VERT_DISTANCE] - 1;                     // height below ground is counted

    if (wall[VERT_DISTANCE] < 0) {                                         // below surface
      water.ba = texture(waterTex, texCoordX0Yp).ba;                       // soil moisture and snow is copied from above
      water[SUSTAINED_MOISTURE] = texture(waterTex, texCoordX0Yp)[SUSTAINED_MOISTURE];
      wall[VEGETATION] = wallX0Yp[VEGETATION];                             // vegetation is copied from above
      // Flood height lives only on the surface — wipe packed flood from underground land
      if (!isAnyWaterType(wall[TYPE]) && isLandWaterMarker(water[TOTAL]))
        water[TOTAL] = WATER_MARKER_LAND;

      if (wallX0Yp[DISTANCE] == 0) {                                       // if above is wall
        if (!isAnyWaterType(wallX0Yp[TYPE])) {                             // above is not water
          wall[TYPE] = wallX0Yp[TYPE];                                     // copy walltype from above
        } else if (isAnyWaterType(wall[TYPE])) {                         // this is water / ice
                                                                           //   wall[TYPE] = wallX0Yp[TYPE];                                     // land can't be over water. copy walltype from above
          base[TEMPERATURE] = texture(baseTex, texCoordX0Yp)[TEMPERATURE]; // copy water temperature from above
        }
      }

    } else if (wall[VERT_DISTANCE] == 0) { // at/in surface layer

      vec4 waterX0Yp = texture(waterTex, texCoordX0Yp);

      vec2 precipDeposition = texture(precipDepositionTex, texCoord).xy;

      vec4 lightAboveSurface = texture(lightTex, texCoordX0Yp); // sample cell above surface

      switch (wall[TYPE]) {
      case WALLTYPE_INDUSTRIAL:
        if (wall[TYPE] == WALLTYPE_INDUSTRIAL)
          wall[VEGETATION] = min(wall[VEGETATION], 15); // limit vegetation in industrial areas
      case WALLTYPE_SUBURBAN:
        if (wall[TYPE] == WALLTYPE_SUBURBAN)
          wall[VEGETATION] = min(wall[VEGETATION], 100);
      case WALLTYPE_URBAN:
        if (wall[TYPE] == WALLTYPE_URBAN)
          wall[VEGETATION] = min(wall[VEGETATION], 75); // limit vegetation in urban areas
      case WALLTYPE_FIRE:
        if (wall[TYPE] == WALLTYPE_FIRE) {            // extra check to make sure it's not urban
          float floodExcessFire = getFloodHeightMm(water[TOTAL]);
          // Significant standing floodwater extinguishes fire immediately
          if (floodExcessFire >= significantFloodMm) {
            wall[TYPE] = WALLTYPE_LAND;
          } else {
            float fireIntensity = calcFireIntensity(wall[VEGETATION], water[SOIL_MOISTURE], waterX0Yp[PRECIPITATION]);

            if (fireIntensity < minimalFireIntensity) { // fire goes out
              wall[TYPE] = WALLTYPE_LAND;               // turn off fire
            } else if (int(iterNum) % (int(10. / fireIntensity) + 1) == 0) {
              wall[VEGETATION] -= 1;                    // reduce vegetation
              if (wall[VEGETATION] < 10)
                wall[TYPE] = WALLTYPE_LAND;             // turn off fire
            }
          }
        }
      case WALLTYPE_LAND:                                                                                     // no break,can also be fire or urban:
      case 10: case 11: case 12: case 13: case 14: case 15: case 16: case 17: // custom base slots
        {
          // Standing flood height is separate from soil moisture (packed in TOTAL).
          float floodMm = getFloodHeightMm(water[TOTAL]);
          // Migrate legacy saves that stored ponding as soil above field capacity
          if (water[SOIL_MOISTURE] > soilFieldCapacity) {
            floodMm += water[SOIL_MOISTURE] - soilFieldCapacity;
            water[SOIL_MOISTURE] = soilFieldCapacity;
          }

          // Droplet ground-hits are sparse and often zero when precip is stride-skipped.
          // Near-surface air PRECIPITATION persists between hits and drives wetting/floods.
          float rainFromDrops = precipDeposition[RAIN_DEPOSITION] * 2.0;
          float rainFromAir = max(waterX0Yp[PRECIPITATION], 0.0) * 0.55;
          float rainInput = rainFromDrops + rainFromAir;
          float poreSpace = max(soilFieldCapacity - water[SOIL_MOISTURE], 0.0);
          float infiltration = min(rainInput, min(maxInfiltrationRate, poreSpace * 0.25 + maxInfiltrationRate * 0.3));
          float runoff = max(rainInput - infiltration, 0.0);

          // Rain infiltrates into soil only up to field capacity
          water[SOIL_MOISTURE] = clamp(water[SOIL_MOISTURE] + infiltration, 0.0, soilFieldCapacity);

          float rainThresh = max(floodRainThreshold, 0.02);

          // Natural flooding: runoff / heavy rain become standing flood (toggleable)
          if (enableFlooding > 0.5) {
            if (runoff > 0.0)
              floodMm += runoff * 0.35;

            float rainOver = max(rainFromAir - rainThresh, 0.0);
            if (rainOver > 0.0 && water[SOIL_MOISTURE] > soilFieldCapacity * 0.55)
              floodMm += rainOver * max(floodPondRate, 0.0);
          }

          // Coastal storm surge (toggleable)
          if (enableStormSurge > 0.5 && stormSurgeStrength > 0.001) {
            float bestInundation = 0.0;
            float windThresh = max(stormSurgeWindThreshold, 0.05);
            float maxCells = clamp(stormSurgeMaxCells, 0.5, 12.0);
            const int MAX_SURGE_SCAN = 24;
            int reach = int(clamp(stormSurgeInlandReach, 1.0, float(MAX_SURGE_SCAN)) + 0.5);

            for (int d = 1; d <= MAX_SURGE_SCAN; d++) {
              if (d > reach)
                break;
              float dist = float(d);

              vec2 uvL = texCoord + vec2(-dist * texelSize.x, 0.0);
              float leftAbove = cellsAboveOceanAt(uvL);
              if (leftAbove < 1e5) {
                vec2 windUvL = uvL;
                ivec4 wL = texture(wallTex, windUvL);
                if (wL[DISTANCE] == 0)
                  windUvL += vec2(0.0, texelSize.y);
                float onshoreL = max(texture(baseTex, windUvL)[VX], 0.0);
                float windScaleL = onshoreL * 10.0;
                float surgeCellsL = clamp((windScaleL - windThresh) / 3.2, 0.0, 1.0) * maxCells * stormSurgeStrength;
                float effectiveL = surgeCellsL - dist * 0.55;
                if (leftAbove <= effectiveL)
                  bestInundation = max(bestInundation, clamp(effectiveL - leftAbove, 0.0, 6.0));
              }

              vec2 uvR = texCoord + vec2(dist * texelSize.x, 0.0);
              float rightAbove = cellsAboveOceanAt(uvR);
              if (rightAbove < 1e5) {
                vec2 windUvR = uvR;
                ivec4 wR = texture(wallTex, windUvR);
                if (wR[DISTANCE] == 0)
                  windUvR += vec2(0.0, texelSize.y);
                float onshoreR = max(-texture(baseTex, windUvR)[VX], 0.0);
                float windScaleR = onshoreR * 10.0;
                float surgeCellsR = clamp((windScaleR - windThresh) / 3.2, 0.0, 1.0) * maxCells * stormSurgeStrength;
                float effectiveR = surgeCellsR - dist * 0.55;
                if (rightAbove <= effectiveR)
                  bestInundation = max(bestInundation, clamp(effectiveR - rightAbove, 0.0, 6.0));
              }
            }

            // Spread from already-flooded land neighbors
            float neighFlood = 0.0;
            if (wallXmY0[VERT_DISTANCE] == 0 && isSurgeFloodLandType(wallXmY0[TYPE]))
              neighFlood = max(neighFlood, getFloodHeightMm(texture(waterTex, texCoordXmY0)[TOTAL]));
            if (wallXpY0[VERT_DISTANCE] == 0 && isSurgeFloodLandType(wallXpY0[TYPE]))
              neighFlood = max(neighFlood, getFloodHeightMm(texture(waterTex, texCoordXpY0)[TOTAL]));
            if (neighFlood > 4.0) {
              float spreadFlood = max(neighFlood - 2.5, 0.0) * (0.55 + 0.25 * stormSurgeStrength);
              bestInundation = max(bestInundation, clamp(spreadFlood / 2800.0, 0.0, 5.0));
            }

            if (bestInundation > 0.02) {
              float targetFlood = 50.0 + bestInundation * 2800.0;
              floodMm = max(floodMm, min(targetFlood, floodMm + bestInundation * 180.0 + 8.0));
            }
          }

          floodMm = clamp(floodMm, 0.0, soilMoistureMax);

          // Soak-in: floodwater → soil moisture (only way flood raises soil)
          float sunSoak = max(lightAboveSurface[SUNLIGHT] * cos(colSunAngle), 0.0) / standardSunBrightness;
          float raining = smoothstep(rainThresh * 0.5, rainThresh + 0.25, rainFromAir);
          float soakCap = max(soilFieldCapacity - water[SOIL_MOISTURE], 0.0);
          float soakAmt = min(floodMm * (0.0012 + sunSoak * 0.006) * (1.0 - raining * 0.85), min(soakCap, 0.12));
          floodMm -= soakAmt;
          water[SOIL_MOISTURE] = clamp(water[SOIL_MOISTURE] + soakAmt, 0.0, soilFieldCapacity);

          // Same-frame quench: fire dies as soon as standing floodwater builds up
          if (wall[TYPE] == WALLTYPE_FIRE && floodMm >= significantFloodMm)
            wall[TYPE] = WALLTYPE_LAND;

          // Legacy saves: seed climate moisture from established vegetation, not one-off rain spikes
          if (water[SUSTAINED_MOISTURE] < 0.01 && wall[VEGETATION] > 15)
            water[SUSTAINED_MOISTURE] = min(float(wall[VEGETATION]) * 0.25, 40.0);

          water[SUSTAINED_MOISTURE] = clamp(water[SUSTAINED_MOISTURE] + infiltration * sustainedMoistureGain - sustainedMoistureDecay, 0.0, 100.0);

          // Stash flood for evaporation step below (encoded after soil evap)
          water[TOTAL] = encodeLandWithFlood(floodMm);
        }
        water[SNOW] = clamp(water[SNOW] + precipDeposition[SNOW_DEPOSITION] * snowMassToHeight, 0.0, 4000.0); // snow accumulation in cm


        vec4 baseAboveSurface = texture(baseTex, texCoordX0Yp);
        vec4 waterAboveSurface = texture(waterTex, texCoordX0Yp);

        float realTempAboveSurface = potentialToRealT(baseAboveSurface[TEMPERATURE], texCoordX0Yp.y);

        float evaporation = calcEvaporation(realTempAboveSurface, waterAboveSurface[TOTAL], vegetationInfluence(wall[VEGETATION]), water[SOIL_MOISTURE]) * 0.10;

        // Evaporate standing flood first; soil only dries when flood is gone.
        // A share of evaporating flood soaks into soil (soil rises only from flood loss).
        {
          float floodNow = getFloodHeightMm(water[TOTAL]);
          float sunEvap = max(lightAboveSurface[SUNLIGHT] * cos(colSunAngle), 0.0) / standardSunBrightness;
          float rainEvapThresh = max(floodRainThreshold, 0.02);
          float rainingEvap = smoothstep(rainEvapThresh * 0.5, rainEvapThresh + 0.25, max(waterX0Yp[PRECIPITATION], 0.0) * 0.55);
          if (floodNow > 0.0) {
            float floodEvap = evaporation * (1.0 + sunEvap * 3.0) * (1.0 - rainingEvap * 0.9);
            floodEvap = min(floodEvap, floodNow);
            float poreLeft = max(soilFieldCapacity - water[SOIL_MOISTURE], 0.0);
            float toSoil = min(floodEvap * 0.45, poreLeft); // evaporating/receding flood wets soil
            floodNow -= floodEvap;
            water[SOIL_MOISTURE] = clamp(water[SOIL_MOISTURE] + toSoil, 0.0, soilFieldCapacity);
            water[TOTAL] = encodeLandWithFlood(floodNow);
          } else {
            evaporation *= (1.0 + sunEvap * 0.75);
            water[SOIL_MOISTURE] = max(water[SOIL_MOISTURE] - evaporation, 0.0);
          }
        }


        if (int(iterNum) % 100 == 0) { // snow and soil moisture smoothing

          // average out snow cover
          const float snowSmoothingRate = 0.02; // max 0.9
          const float moistureSmoothingRate = 0.02;
          const float sustainedSmoothingRate = 0.01;

          float numNeighbors = 0.;
          float totalNeighborSnow = 0.0;
          float totalNeighborSoilMoisture = 0.0;
          float totalNeighborSustainedMoisture = 0.0;

          if (wallXmY0[VERT_DISTANCE] == 0 && (wallXmY0[TYPE] == WALLTYPE_LAND || wallXmY0[TYPE] == WALLTYPE_URBAN)) {
            totalNeighborSnow += texture(waterTex, texCoordXmY0)[SNOW];
            totalNeighborSoilMoisture += texture(waterTex, texCoordXmY0)[SOIL_MOISTURE];
            totalNeighborSustainedMoisture += texture(waterTex, texCoordXmY0)[SUSTAINED_MOISTURE];
            numNeighbors += 1.;
          }
          if (wallXpY0[VERT_DISTANCE] == 0 && (wallXpY0[TYPE] == WALLTYPE_LAND || wallXpY0[TYPE] == WALLTYPE_URBAN)) {
            totalNeighborSnow += texture(waterTex, texCoordXpY0)[SNOW];
            totalNeighborSoilMoisture += texture(waterTex, texCoordXpY0)[SOIL_MOISTURE];
            totalNeighborSustainedMoisture += texture(waterTex, texCoordXpY0)[SUSTAINED_MOISTURE];
            numNeighbors += 1.;
          }
          if (numNeighbors > 0.) { // prevent devide by 0
            float avgNeighborSnow = totalNeighborSnow / numNeighbors;
            water[SNOW] += (avgNeighborSnow - water[SNOW]) * snowSmoothingRate;

            float avgNeighborSoilMoisture = totalNeighborSoilMoisture / numNeighbors;
            water[SOIL_MOISTURE] += (avgNeighborSoilMoisture - water[SOIL_MOISTURE]) * moistureSmoothingRate;
            water[SOIL_MOISTURE] = min(water[SOIL_MOISTURE], soilFieldCapacity);

            float avgNeighborSustainedMoisture = totalNeighborSustainedMoisture / numNeighbors;
            water[SUSTAINED_MOISTURE] += (avgNeighborSustainedMoisture - water[SUSTAINED_MOISTURE]) * sustainedSmoothingRate;
          }

          // dynamic vegetation — growth driven by sustained climate moisture, not one-off rain spikes
          float climateMoisture = water[SUSTAINED_MOISTURE];

          int vegetationGrowthRate = 0;
          if (climateMoisture >= minVegetationMoisture)
            vegetationGrowthRate = int((climateMoisture - minVegetationMoisture) * sqrt(lightAboveSurface[SUNLIGHT]) * 0.008);

          if (vegetationGrowthRate > 0 && int(iterNum) % ((100 / vegetationGrowthRate) * 100) == 0) {
            int tempLimit = int(map_rangeC(realTempAboveSurface, CtoK(0.0), CtoK(25.0), 0., float(FOREST_VEG_MAX)));
            if (wall[VEGETATION] <= GRASS_VEG_MAX) {
              if (tempLimit > wall[VEGETATION])
                wall[VEGETATION] = min(wall[VEGETATION] + 1, GRASS_VEG_MAX);
            } else if (tempLimit > wall[VEGETATION]) {
              wall[VEGETATION] = min(wall[VEGETATION] + 1, FOREST_VEG_MAX);
            }
          }

          // Gradual drought dieback — in-game days to weeks, scaled by sustained + soil moisture
          if (wall[VEGETATION] > 0) {
            float soilMoist = water[SOIL_MOISTURE];
            float sustainedStress = max(1.0 - climateMoisture / minVegetationMoisture, 0.0);
            float soilBuffer = smoothstep(10.0, fullGreenSoilMoisture, soilMoist);
            float droughtStress = clamp(sustainedStress * (1.0 - soilBuffer * 0.55), 0.0, 1.0);

            if (droughtStress > 0.05) {
              float biomass = isForestVegetation(wall[VEGETATION])
                ? forestBiomass(wall[VEGETATION])
                : grassBiomass(wall[VEGETATION]);
              float treeSlowdown = isForestVegetation(wall[VEGETATION])
                ? 1.0 + smoothstep(0.0, float(FOREST_VEG_MAX - GRASS_VEG_MAX), biomass) * (vegTreeDiebackSlowdown - 1.0)
                : 0.62;
              float daysPerLoss = mix(vegDiebackDaysPerPointMild, vegDiebackDaysPerPointSevere, pow(droughtStress, 0.82));
              float cellJitter = 0.88 + random2d(texCoord * resolution + biomass * 0.013) * 0.24;
              float dieInterval = max(daysPerLoss * treeSlowdown * cellJitter * iterPerSimDay, vegDiebackMinIter);
              int diePeriod = int(dieInterval);
              int diePhase = int(random2d(texCoord * vec2(41.7, 173.3)) * float(diePeriod));

              if (diePeriod > 0 && (int(iterNum) + diePhase) % diePeriod == 0)
                wall[VEGETATION] = max(wall[VEGETATION] - 1, 0);
            }
          }

          int subInterval = int(iterNum) / 100;

          // Fire cannot spread onto significantly flooded ground
          if (getFloodHeightMm(water[TOTAL]) < significantFloodMm
              && subInterval % (int(water[SOIL_MOISTURE] * 0.1 + water[SNOW] * 0.5) + 10) == 0
              && wall[VEGETATION] >= minimalFireVegetation
              && (wallXmY0[TYPE] == WALLTYPE_FIRE || wallXpY0[TYPE] == WALLTYPE_FIRE || texture(waterTex, texCoordX0Yp)[SMOKE] > 4.5)) {
            wall[TYPE] = WALLTYPE_FIRE;
          }
          //}
        }
        break;
      case WALLTYPE_FRESH_WATER:
        water[SALINITY] = 0.0;
      case WALLTYPE_WATER:
        {
          if (wall[TYPE] == WALLTYPE_WATER && water[SALINITY] < 1.0)
            water[SALINITY] = oceanSalinityPpt;

          const float waterTempUpdateInterval = 20.0;

          if (dynamicWaterTemperature >= 1.0 && mod(iterNum, waterTempUpdateInterval) < 0.5) {
            float numNeighbors = 0.;
            float totalNeighborTemp = 0.0;

            if (isLiquidWaterType(wallXmY0[TYPE])) {
              totalNeighborTemp += texture(baseTex, texCoordXmY0)[TEMPERATURE];
              numNeighbors += 1.;
            }
            if (isLiquidWaterType(wallXpY0[TYPE])) {
              totalNeighborTemp += texture(baseTex, texCoordXpY0)[TEMPERATURE];
              numNeighbors += 1.;
            }
            if (numNeighbors > 0.) {
              float avgNeighborTemp = totalNeighborTemp / numNeighbors;
              base[TEMPERATURE] += (avgNeighborTemp - base[TEMPERATURE]) * 0.10;
            }
            if (base[TEMPERATURE] > 500.0)
              base[TEMPERATURE] = CtoK(25.0);

            float airTemperature = potentialToRealT(texture(baseTex, texCoordX0Yp)[TEMPERATURE], texCoordX0Yp.y);
            float netWaterHeating = 0.0;
            netWaterHeating += (airTemperature - base[TEMPERATURE]) * waterHeatExchangeRate;
            netWaterHeating -= max((maxWater(base[TEMPERATURE]) - waterX0Yp[TOTAL]) * waterEvaporation, 0.) * evapHeat * 0.5;

            float lightPower = max(lightAboveSurface[SUNLIGHT] * cos(colSunAngle), 0.0);
            float waterAlbedo = (wall[TYPE] == WALLTYPE_FRESH_WATER) ? ALBEDO_FRESH_WATER : ALBEDO_WATER;
            lightPower *= (1. - waterAlbedo);
            lightPower *= lightHeatingConst;
            netWaterHeating += lightPower * lightEffectScale;
            netWaterHeating += lightAboveSurface[NET_HEATING] * lightEffectScale;
            if (latitudeBasedTemperature != 0)
              netWaterHeating += (CtoK(climateTempC) - base[TEMPERATURE]) * 0.0004;
            base[TEMPERATURE] += netWaterHeating / waterHeatCapacity * waterTempUpdateInterval;
          }

          base[TEMPERATURE] = clamp(base[TEMPERATURE], CtoK(-5.0), CtoK(maxWaterTemp));

          float waterTempC = KtoC(base[TEMPERATURE]);
          float salinity = salinityForWallType(wall[TYPE], water[SALINITY]);
          float freezeC = waterFreezeTempC(salinity);
          float airTempC = KtoC(potentialToRealT(texture(baseTex, texCoordX0Yp)[TEMPERATURE], texCoordX0Yp.y));

          if (waterTempC < freezeC || airTempC < freezeC) {
            float coldness = max(freezeC - waterTempC, 0.0) + max(freezeC - airTempC, 0.0) * 0.75;
            float freezeProgress = max(coldness, 0.1) * waterFreezeRate;
            water[SNOW] = min(water[SNOW] + freezeProgress, minIceFormThickness);
            if (water[SNOW] >= minIceFormThickness * 0.2 || waterTempC < freezeC - 0.5) {
              wall[TYPE] = WALLTYPE_ICE;
              water[SALINITY] = salinity;
              water[SNOW] = max(water[SNOW], minIceFormThickness);
            }
          }

          wall[VEGETATION] = 20;
          water[SOIL_MOISTURE] = 100.0;
        }
        break;
      case WALLTYPE_ICE:
        {
          const float waterTempUpdateInterval = 20.0;
          float iceThickness = water[SNOW];
          iceThickness += precipDeposition[SNOW_DEPOSITION] * snowMassToHeight;
          if (KtoC(base[TEMPERATURE]) <= 0.0)
            iceThickness += precipDeposition[RAIN_DEPOSITION] * 0.05; // freezing rain adds to ice sheet
          float salinity = salinityForWallType(wall[TYPE], water[SALINITY]);
          float freezeC = waterFreezeTempC(salinity);

          if (dynamicWaterTemperature >= 1.0 && mod(iterNum, waterTempUpdateInterval) < 0.5) {
            float numNeighbors = 0.;
            float totalNeighborTemp = 0.0;

            if (wallXmY0[TYPE] == WALLTYPE_ICE || isLiquidWaterType(wallXmY0[TYPE])) {
              totalNeighborTemp += texture(baseTex, texCoordXmY0)[TEMPERATURE];
              numNeighbors += 1.;
            }
            if (wallXpY0[TYPE] == WALLTYPE_ICE || isLiquidWaterType(wallXpY0[TYPE])) {
              totalNeighborTemp += texture(baseTex, texCoordXpY0)[TEMPERATURE];
              numNeighbors += 1.;
            }
            if (numNeighbors > 0.) {
              float avgNeighborTemp = totalNeighborTemp / numNeighbors;
              base[TEMPERATURE] += (avgNeighborTemp - base[TEMPERATURE]) * 0.10;
            }

            float airTemperature = potentialToRealT(texture(baseTex, texCoordX0Yp)[TEMPERATURE], texCoordX0Yp.y);
            float netIceHeating = (airTemperature - base[TEMPERATURE]) * waterHeatExchangeRate * 0.5;
            float lightPower = max(lightAboveSurface[SUNLIGHT] * cos(colSunAngle), 0.0);
            float iceAlbedo = map_rangeC(iceThickness, 0.0, fullWhiteSnowHeight, ALBEDO_WATER, ALBEDO_ICE);
            lightPower *= (1. - iceAlbedo);
            lightPower *= lightHeatingConst;
            netIceHeating += lightPower * lightEffectScale;
            netIceHeating += lightAboveSurface[NET_HEATING] * 0.5 * lightEffectScale;
            if (latitudeBasedTemperature != 0)
              netIceHeating += (CtoK(min(climateTempC, 0.0)) - base[TEMPERATURE]) * 0.0002;
            base[TEMPERATURE] += netIceHeating / waterHeatCapacity * waterTempUpdateInterval;
          }

          float iceTempC = KtoC(base[TEMPERATURE]);
          float airTempC = KtoC(potentialToRealT(texture(baseTex, texCoordX0Yp)[TEMPERATURE], texCoordX0Yp.y));
          float windSpeed = abs(texture(baseTex, texCoordX0Yp)[VX]);

          if (iceTempC < freezeC - 2.0 && int(iterNum) % 50 == 0)
            iceThickness = min(iceThickness + iceGrowthRate, maxIceThickness);

          if (iceThickness > 0.0 && airTempC > freezeC) {
            float warmth = max(airTempC - freezeC, 0.0);
            float melting = min(warmth * iceMeltRate, iceThickness);
            iceThickness -= melting;
          }

          if (iceThickness > 0.1)
            base[TEMPERATURE] = min(base[TEMPERATURE], CtoK(freezeC));

          if (iceTempC <= freezeC) {
            float vaporDeficit = max(maxWater(CtoK(iceTempC)) - waterX0Yp[TOTAL], 0.0);
            float sublimation = min(vaporDeficit * snowSublimationRate, iceThickness);
            iceThickness -= sublimation;
          }

          // thin ice only breaks up when the air above is genuinely above freezing
          if (iceThickness < thinIceBreakupCm && airTempC > freezeC + 0.5 && windSpeed > 0.12)
            iceThickness = 0.0;

          water[SNOW] = max(iceThickness, 0.0);

          if (water[SNOW] <= 0.1 && airTempC > freezeC) {
            wall[TYPE] = liquidWaterTypeFromSalinity(salinity);
            if (wall[TYPE] == WALLTYPE_WATER)
              water[SALINITY] = max(salinity, oceanSalinityPpt);
            else
              water[SALINITY] = 0.0;
            water[SNOW] = 0.0;
            base[TEMPERATURE] = max(base[TEMPERATURE], CtoK(freezeC + 0.5));
          } else if (water[SNOW] <= 0.1) {
            water[SNOW] = minIceFormThickness;
          }

          wall[VEGETATION] = 0;
          water[SOIL_MOISTURE] = 100.0;
        }
        break;
      }
    }
  }
} // main