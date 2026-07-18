#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord;
in vec2 fragCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform sampler2D precipFeedbackTex;
uniform sampler2D dropletSizeTex;
uniform isampler2D wallTex;

uniform vec2 resolution;
uniform vec2 texelSize;

uniform float dryLapse;

uniform float displayVectorField;

uniform vec3 view;
uniform vec4 cursor;

out vec4 fragmentColor;

#include "common.glsl"
#include "commonDisplay.glsl"

// Categories: 0 none, 1 rain, 2 snow, 3 hail, 4 virga
vec3 precipTypeColor(int kind)
{
  if (kind == 1) return vec3(0.15, 0.75, 0.25); // rain
  if (kind == 2) return vec3(0.85, 0.92, 1.0);  // snow
  if (kind == 3) return vec3(0.95, 0.15, 0.75); // hail
  if (kind == 4) return vec3(1.0, 0.65, 0.15);  // virga
  return vec3(0.05, 0.05, 0.08);                // none
}

void main()
{
  vec4 base = bilerpWall(baseTex, wallTex, fragCoord);
  vec4 water = bilerpWall(waterTex, wallTex, fragCoord);
  ivec2 wall = texture(wallTex, texCoord).xy;
  vec4 feedback = texture(precipFeedbackTex, texCoord);
  vec4 sizes = texture(dropletSizeTex, texCoord);

  float realTemp = potentialToRealT(base[TEMPERATURE]);
  float tC = KtoC(realTemp);

  if (wall[DISTANCE] == 0) {
    switch (wall[TYPE]) {
    case WALLTYPE_INERT:
      fragmentColor = vec4(0, 0, 0, 1.);
      break;
    case WALLTYPE_LAND:
      fragmentColor = vec4(vec3(0.10), 1.);
      break;
    case WALLTYPE_FRESH_WATER:
    case WALLTYPE_WATER:
    case WALLTYPE_ICE:
      fragmentColor = vec4(0.0, 0.35, 0.7, 1.);
      break;
    case WALLTYPE_FIRE:
      fragmentColor = vec4(1.0, 0.5, 0.0, 1.);
      break;
    default:
      fragmentColor = vec4(0.0, 0.0, 0.0, 1.);
    }
  } else {
    float precip = max(water[PRECIPITATION], 0.0);
    float cloud = max(water[CLOUD], 0.0);
    float massFb = max(feedback[0], 0.0);
    float vaporFb = feedback[2]; // evaporation (often negative cooling path) — use magnitude of drying
    float snowDep = max(feedback[3], 0.0);
    float hailMm = max(sizes.r, 0.0);
    float rh = relativeHumd(realTemp, water[TOTAL]);

    float precipSignal = max(precip, massFb * 0.5);
    int kind = 0;

    if (precipSignal > 0.08 || cloud > 0.35) {
      // Hail: large hail size or heavy ice / cold precip aloft
      if (hailMm > 5.0 || (tC < -5.0 && precipSignal > 1.2 && snowDep > 0.15)) {
        kind = 3;
      } else if (tC < 0.0 && (precipSignal > 0.08 || snowDep > 0.05)) {
        kind = 2; // snow
      } else if (precipSignal > 0.08 && rh < 0.85 && vaporFb < -0.02) {
        // Precip present but evaporating into dry air → virga
        kind = 4;
      } else if (precipSignal > 0.08 || (cloud > 0.5 && tC >= 0.0)) {
        kind = 1; // rain
      } else if (precip > 0.02 && rh < 0.7) {
        kind = 4;
      }
    }

    vec3 col = precipTypeColor(kind);
    float alpha = (kind == 0) ? 1.0 : clamp(0.35 + precipSignal * 0.4 + cloud * 0.15, 0.35, 1.0);
    fragmentColor = vec4(col * alpha, 1.0);

    drawVectorField(base.xy, displayVectorField);
  }

  drawCursor(cursor, view);
}
