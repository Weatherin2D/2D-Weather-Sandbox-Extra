#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;     // this
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down
in vec2 texCoordXpY0; // right
in vec2 texCoordX0Yp; // up

uniform sampler2D baseTex;
uniform isampler2D wallTex;

uniform float pressurePersistence; // 0.0 = instant decay, 1.0 = no decay
uniform float thermalPressureCoupling; // how much temperature affects pressure
uniform float motionPressureCoupling; // how much vertical motion affects pressure (rising lowers, sinking raises)
uniform float forceIntensityMultiplier; // overall multiplier for all pressure forces

uniform vec2 texelSize; // needed for top boundary clamping

layout(location = 0) out vec4 base;
layout(location = 2) out ivec4 wall;

void main()
{
  base = texture(baseTex, texCoord);
  vec4 baseXmY0 = texture(baseTex, texCoordXmY0);
  vec4 baseX0Ym = texture(baseTex, texCoordX0Ym);
  vec4 baseXpY0 = texture(baseTex, texCoordXpY0);
  // Clamp top boundary to prevent sampling outside valid range
  vec2 clampedTexCoordX0Yp = vec2(texCoordX0Yp.x, min(texCoordX0Yp.y, 1.0 - texelSize.y * 0.5));
  vec4 baseX0Yp = texture(baseTex, clampedTexCoordX0Yp);

  wall = texture(wallTex, texCoord); // pass trough

  ivec2 wallX0Yp = texture(wallTex, clampedTexCoordX0Yp).xy;
  ivec2 wallX0Ym = texture(wallTex, texCoordX0Ym).xy;
  if (wallX0Ym[1] == 0 && wallX0Ym[0] == 1) { // cell below is land wall
    base[3] -= baseX0Ym[3] - 1000.0;          // Snow melting cools air
  }

  // if(wall[1] == 0) // if this is wall
  //    base[0] = 0.; // set velocity to 0

  // Keep pressure at top close to 0 - prevents pressure accumulation at top boundary
  if(texCoord.y > 0.99){
    base[2] *= 0.98; // gradual decay towards zero at top
  }

  //  if(texCoord.y > 0.2)
  //    base[3] -= 0.0005;

  // pressure changes proportional to the net in or outflow, to or from the cell.
  // Reduced multiplier from 0.45 to 0.35 to dampen pressure waves and prevent accumulation
  float divergence = (baseXmY0[0] - base[0] + baseX0Ym[1] - base[1]) * 0.35;
  
  // Thermal pressure coupling: warm air creates low pressure, cold air creates high pressure
  // This creates realistic persistent pressure systems
  // Skip at top boundary where neighbor sampling may be invalid
  if (wall[1] != 0 && thermalPressureCoupling > 0.0 && texCoord.y < 0.95) { // only in fluid cells, not near top
    float temp = base[3];
    
    // Only use valid neighbors (not walls) for temperature average
    float avgTemp = temp;
    int validNeighbors = 1;
    
    ivec2 wallXmY0 = texture(wallTex, texCoordXmY0).xy;
    ivec2 wallXpY0 = texture(wallTex, texCoordXpY0).xy;
    // wallX0Ym and wallX0Yp already declared at top of function with clamped coordinates
    
    if (wallXmY0[1] != 0) { avgTemp += baseXmY0[3]; validNeighbors++; }
    if (wallXpY0[1] != 0) { avgTemp += baseXpY0[3]; validNeighbors++; }
    if (wallX0Ym[1] != 0) { avgTemp += baseX0Ym[3]; validNeighbors++; }
    if (wallX0Yp[1] != 0) { avgTemp += baseX0Yp[3]; validNeighbors++; }
    
    avgTemp /= float(validNeighbors);
    float tempAnomaly = temp - avgTemp;
    
    // Warm air (positive anomaly) → low pressure (negative change)
    // Cold air (negative anomaly) → high pressure (positive change)
    // Very weak coupling - coefficient reduced to prevent extreme values
    // Note: forceIntensityMultiplier NOT applied here to prevent thermal runaway
    float thermalPressure = -tempAnomaly * thermalPressureCoupling * 0.00001;
    thermalPressure = clamp(thermalPressure, -0.003, 0.003); // Hard cap to prevent extreme values
    divergence += thermalPressure;
  }
  
  // Motion-Pressure coupling DISABLED - causes runaway instability
  // Rising motion decreasing pressure and sinking increasing pressure creates
  // a positive feedback loop that leads to unrealistic values
  // if (wall[1] != 0 && motionPressureCoupling > 0.0) {
  //   float verticalVel = base[1];
  //   float motionEffect = -verticalVel * abs(verticalVel) * motionPressureCoupling * 0.00001;
  //   motionEffect = clamp(motionEffect, -0.001, 0.001);
  //   divergence += motionEffect;
  // }
  
  base[2] += divergence;
  
  // Clamp pressure to reasonable range to prevent NaN and extreme values
  // Tight clamp to prevent unrealistic pressure extremes
  base[2] = clamp(base[2], -0.2, 0.2);
  
  // Apply pressure persistence: decay towards zero
  // Increased decay rate to prevent pressure accumulation
  if (pressurePersistence > 0.0 && wall[1] != 0) {
    float decay = 1.0 - pressurePersistence * 0.01; // persistence 1.0 = 0.99 decay per frame
    base[2] *= decay;
  }
}
