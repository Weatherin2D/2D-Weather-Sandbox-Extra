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

layout(location = 0) out vec4 base;
layout(location = 2) out ivec4 wall;

void main()
{
  base = texture(baseTex, texCoord);
  vec4 baseXmY0 = texture(baseTex, texCoordXmY0);
  vec4 baseX0Ym = texture(baseTex, texCoordX0Ym);
  vec4 baseXpY0 = texture(baseTex, texCoordXpY0);
  vec4 baseX0Yp = texture(baseTex, texCoordX0Yp);

  wall = texture(wallTex, texCoord); // pass trough

  ivec2 wallX0Ym = texture(wallTex, texCoordX0Ym).xy;
  if (wallX0Ym[1] == 0 && wallX0Ym[0] == 1) { // cell below is land wall
    base[3] -= baseX0Ym[3] - 1000.0;          // Snow melting cools air
  }

  // if(wall[1] == 0) // if this is wall
  //    base[0] = 0.; // set velocity to 0

  //  if(texCoord.y > 0.99){ // keep pressure at top close to 0
  //     base[2] *= 0.995; // 0.999
  //     base[2] -= 0.001;
  // }

  //  if(texCoord.y > 0.2)
  //    base[3] -= 0.0005;

  // pressure changes proportional to the net in or outflow, to or from the cell.
  // 0.05 - 0.49   was 0.40, lower multiplier dampenes pressure waves.
  float divergence = (baseXmY0[0] - base[0] + baseX0Ym[1] - base[1]) * 0.45;
  
  // Thermal pressure coupling: warm air creates low pressure, cold air creates high pressure
  // This creates realistic persistent pressure systems
  if (wall[1] != 0 && thermalPressureCoupling > 0.0) { // only in fluid cells
    float temp = base[3];
    
    // Only use valid neighbors (not walls) for temperature average
    float avgTemp = temp;
    int validNeighbors = 1;
    
    ivec2 wallXmY0 = texture(wallTex, texCoordXmY0).xy;
    ivec2 wallXpY0 = texture(wallTex, texCoordXpY0).xy;
    ivec2 wallX0Ym = texture(wallTex, texCoordX0Ym).xy;
    ivec2 wallX0Yp = texture(wallTex, texCoordX0Yp).xy;
    
    if (wallXmY0[1] != 0) { avgTemp += baseXmY0[3]; validNeighbors++; }
    if (wallXpY0[1] != 0) { avgTemp += baseXpY0[3]; validNeighbors++; }
    if (wallX0Ym[1] != 0) { avgTemp += baseX0Ym[3]; validNeighbors++; }
    if (wallX0Yp[1] != 0) { avgTemp += baseX0Yp[3]; validNeighbors++; }
    
    avgTemp /= float(validNeighbors);
    float tempAnomaly = temp - avgTemp;
    
    // Warm air (positive anomaly) → low pressure (negative change)
    // Cold air (negative anomaly) → high pressure (positive change)
    // Reduced multiplier to prevent extreme values
    float thermalPressure = -tempAnomaly * thermalPressureCoupling * 0.0001;
    divergence += thermalPressure;
  }
  
  base[2] += divergence;
  
  // Clamp pressure to reasonable range to prevent NaN and extreme values
  base[2] = clamp(base[2], -0.5, 0.5);
  
  // Apply pressure persistence: slow decay towards zero
  // This allows pressure systems to persist longer
  if (pressurePersistence > 0.0 && wall[1] != 0) {
    float decay = 1.0 - pressurePersistence * 0.005; // persistence 1.0 = 0.995 decay per frame (slower)
    base[2] *= decay;
  }
}
