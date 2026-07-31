// Lightning V2.6.2 — CG + IC/CC bolt channels; sheet stays diffuse flash
// Included by realisticDisplayShader.frag

#define LT_MAX_STRIKES 16

uniform int ltNumStrikes;
uniform float ltEventAge;
uniform vec4 ltStrikePos[LT_MAX_STRIKES];
uniform vec4 ltStrikeDest[LT_MAX_STRIKES];
uniform vec4 ltStrikeMeta[LT_MAX_STRIKES];
uniform vec4 ltStrikeRoute[LT_MAX_STRIKES];

uniform float ltBrightness;
uniform float ltContrast;
uniform float ltFlashDuration;
uniform float ltGlowStrength;
uniform float ltAtmosIllum;
uniform float ltCloudIllum;
uniform float ltRainIllum;
uniform float ltNightFlash;
uniform float ltDayFlash;
uniform int ltEnableAtmos;
uniform int ltEnableCloudIllum;
uniform int ltEnableRainIllum;
uniform int ltEnableVolumetric;
uniform float ltCloudObscuration;
uniform float ltChannelIllumRatio;
uniform float ltStrobeFlicker;
uniform float ltChannelThickness;

const vec3 LT_CG_COL = vec3(0.70, 0.57, 1.0);
// Number of texture variants tiled horizontally in the lightning atlas.
const float LT_TEX_VARIANTS = 4.0;
// Actual lightning atlas aspect (width / height): 512px * 4 variants = 2048 x 1024
const float LT_TEX_ASPECT = 2048.0 / 1024.0;
const float LT_BRANCH_SHOW = 1.4;
const float LT_LEADER_BRIGHT = 50000.0;
const float LT_MAIN_BRIGHT = 100000.0;

bool ltDry(float t)    { return t > 10.5 && t < 11.5; }
bool ltIC(float t)     { return t > 0.5 && t < 1.5; }
bool ltCC(float t)     { return t > 1.5 && t < 2.5; }
bool ltSheet(float t)  { return t > 2.5 && t < 3.5; }
bool ltFlashOnly(float t) { return ltSheet(t); }
bool ltPrecipOnly(float metaY) {
  return (metaY > 1.04 && metaY < 1.06) || (metaY > 0.04 && metaY < 0.06) || metaY > 1.14;
}
bool ltFlashInFront(float metaY) {
  if (ltPrecipOnly(metaY)) return metaY > 0.5;
  return metaY > 0.5;
}
bool ltStrikeIsFlash(float ltType, float metaY) {
  if (metaY > 1.14) return false;
  if (ltPrecipOnly(metaY))
    return ltSheet(ltType);
  return ltSheet(ltType) && metaY <= 1.0;
}
bool ltSpider(float t) { return t > 6.5 && t < 7.5; }
bool ltAnvil(float t)  { return t > 7.5 && t < 8.5; }
bool ltCG(float t)     { return t > 4.5 && t < 6.5; }
bool ltUpward(float t) { return t > 8.5 && t < 9.5; }
bool ltBFTB(float t)   { return t > 9.5 && t < 10.5; }

bool ltChordPath(float t) {
  return ltIC(t) || ltCC(t) || ltSpider(t) || ltAnvil(t) || ltSheet(t) || ltBFTB(t);
}
bool ltStrikeUsesBentPath(vec4 route) {
  // route.w is the bent-mid flag (never store a coordinate there).
  return route.w > 0.5;
}
bool ltStrikeIsPolylineSeg(vec4 route) {
  // route.z > 0.5: continuous jagged core (not full atlas).
  // 1.0 = trunk poly, 1.5 = L0 branch, 2.0 = L1+ branch.
  return route.z > 0.5;
}
float ltStrikeSegRole(vec4 route) {
  return route.z;
}

float ltPhase(float age) {
  return clamp(age / max(5.5 * ltFlashDuration, 2.0), 0.0, 1.0);
}

float ltPropagate(float age, float ltType) {
  if (ltCG(ltType) || ltDry(ltType)) return 1.0;
  float step = (floor(ltPhase(age) * 5.0) + 1.0) / 5.0;
  return clamp(step, 0.2, 1.0);
}

float ltCloudEmbedVis(float cloud, float visMult) {
  float d = clamp(cloud * 13.6, 0.0, 2.5);
  float soft = max(0.88, 1.0 - d * 0.04 * ltCloudObscuration);
  return soft * max(visMult, 0.88);
}

float ltTextureFlashIntensity(float Tin, vec2 lightningPos, float intensity) {
  float T0 = Tin - 1.0;
  float repeatPeriod = map_range(random2d(lightningPos), 0.0, 1.0, 1.5, 3.0);
  float numFlashes = floor(map_range(random2d(lightningPos * 2.73725), 0.0, 1.0, 1.0, max(intensity - 0.5, 0.0) * 2.0));
  float minT = max(T0 - repeatPeriod * numFlashes, 0.0);
  float T = max(mod(T0, repeatPeriod), minT);
  return max((1.0 / (0.05 + pow(T * 2.0, 3.0))) - 0.005, 0.0) * pow(max(intensity, 0.35), 2.0);
}

// 0 = displayLightning vertical, 1 = chord (horizontal/diagonal), 2 = upward vertical
int ltPathMode(float ltType) {
  if (ltUpward(ltType)) return 2;
  if (ltChordPath(ltType)) return 1;
  return 0;
}

// Thin SDF channel for polyline/branch segments. Jaggedness comes from dense CPU knots (no sine tubes).
// segRole: 1.0 trunk poly, 1.5 L0 branch, 2.0 L1+ branch.
vec3 ltDisplayContinuousSeg(vec2 uv, float aspect, vec2 origin, vec2 dest, float lightningTime, float intensity, float ltType, float visMult, float brightMult, float cloudwater, float segRole) {
  if ((ltIC(ltType) || ltCC(ltType) || ltSpider(ltType) || ltAnvil(ltType) || ltSheet(ltType))
      && cloudwater < 0.06)
    return vec3(0.0);

  vec2 oA = vec2(origin.x * aspect, origin.y);
  vec2 dA = vec2(dest.x * aspect, dest.y);
  vec2 ba = dA - oA;
  float span = max(length(ba), 0.002);
  vec2 dir = ba / span;
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 rel = vec2(uv.x * aspect, uv.y) - oA;
  float along = clamp(dot(rel, dir), 0.0, span);
  float t = along / span;
  vec2 closest = oA + dir * along;
  float dist = length(vec2(uv.x * aspect, uv.y) - closest);

  bool isTrunk = segRole < 1.25;
  bool isL0 = segRole >= 1.25 && segRole < 1.75;

  float thick = max(ltChannelThickness, 0.25);
  // Trunk ~1.35x base; L0 ~0.55x trunk; L1+ ~0.30x trunk; tip taper along segment.
  float roleScale = isTrunk ? 1.35 : (isL0 ? 0.74 : 0.405);
  float taper = mix(1.0, 0.35, clamp(t, 0.0, 1.0));
  float halfW = (0.0014 + 0.0016 * thick) * roleScale * taper;
  float core = smoothstep(halfW * 1.6, halfW * 0.10, dist);
  float glow = smoothstep(halfW * 4.2, halfW * 0.45, dist) * 0.38;
  if (core < 0.01 && glow < 0.01)
    return vec3(0.0);

  float curInt = ltTextureFlashIntensity(lightningTime, origin, intensity);
  if (lightningTime > 1.0)
    curInt *= LT_MAIN_BRIGHT * 0.000014;
  else
    curInt = LT_LEADER_BRIGHT * 0.000020;

  float vis = ltCloudEmbedVis(cloudwater, visMult) * ltBrightness * ltContrast * brightMult;
  vis /= max(sqrt(max(float(ltNumStrikes) * 0.35, 1.0)), 1.0);

  vec3 hotCore = vec3(0.95, 0.97, 1.0);
  vec3 col = hotCore * core + LT_CG_COL * glow;
  return max(col * curInt * vis, vec3(0.0));
}

// Single CG bolt renderer — identical visual pipeline for every lightning type
vec3 ltDisplayCGBolt(vec2 uv, float aspect, vec2 origin, vec2 dest, float lightningTime, float intensity, float ltType, float visMult, float brightMult, float cloudwater, float texIndex, float polylineSeg) {
  // Hard mask: cloud-channel chords must not light clear air.
  if ((ltIC(ltType) || ltCC(ltType) || ltSpider(ltType) || ltAnvil(ltType) || ltSheet(ltType))
      && cloudwater < 0.06)
    return vec3(0.0);

  vec2 oA = vec2(origin.x * aspect, origin.y);
  vec2 dA = vec2(dest.x * aspect, dest.y);
  float spanLen = length(dA - oA);
  // Short or packed polyline segments: continuous jagged core (no atlas dashes).
  if (polylineSeg > 0.5 || (ltPathMode(ltType) == 1 && spanLen < 0.12))
    return ltDisplayContinuousSeg(uv, aspect, origin, dest, lightningTime, intensity, ltType, visMult, brightMult, cloudwater, max(polylineSeg, 1.0));

  vec2 ltc;
  int mode = ltPathMode(ltType);
  float thick = max(ltChannelThickness, 0.25);

  if (mode == 1) {
    vec2 ba = dA - oA;
    float span = max(spanLen, 0.07);
    vec2 dir = ba / span;
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 rel = vec2(uv.x * aspect, uv.y) - oA;
    float along = dot(rel, dir);
    float across = dot(rel, perp);
    // Mild jaggedness on long atlas chords so they are not ruler-straight.
    across -= 0.008 * span * sin(along * 32.0 + origin.x * 20.0)
      + 0.004 * span * sin(along * 71.0 + dest.y * 15.0);
    float baseDiv = ltSpider(ltType) || ltIC(ltType) ? 0.16 : (ltCC(ltType) ? 0.18 : 0.16);
    ltc.x = across / max(span * baseDiv * thick, 0.012) + 0.5;
    ltc.y = clamp(along / span, -0.05, 1.15);
  } else if (mode == 2) {
    ltc = uv;
    ltc.x -= mod(origin.x, 1.0);
    ltc.y -= origin.y;
    float vertSpan = max(abs(dest.y - origin.y), 0.08);
    float scaleMult = 1.0 / vertSpan;
    ltc.x = ltc.x * (scaleMult / thick) * aspect / LT_TEX_ASPECT + 0.5;
    ltc.y = (origin.y - uv.y) * scaleMult;
  } else {
    ltc = uv;
    ltc.x -= mod(origin.x, 1.0);
    ltc.y -= origin.y;
    float vertSpan = ltCG(ltType)
      ? max(max(origin.y - dest.y, 0.0), max(origin.y * 0.55, 0.08))
      : max(abs(dest.y - origin.y), ltDry(ltType) ? 0.04 : 0.07);
    float scaleMult = 1.0 / vertSpan;
    ltc.x = ltc.x * (scaleMult / thick) * aspect / LT_TEX_ASPECT + 0.5;
    ltc.y = -ltc.y * scaleMult;
  }

  if (ltc.x < 0.01 || ltc.x > 0.99 || ltc.y < 0.01 || ltc.y > 1.01)
    return vec3(0.0);

  // Adjust x coordinate to select the proper variant tile from the atlas.
  float variant = floor(texIndex + 0.5);
  variant = clamp(variant, 0.0, LT_TEX_VARIANTS - 1.0);
  float tileSize = 1.0 / LT_TEX_VARIANTS;
  vec2 ltcTile = ltc;
  ltcTile.x = ltc.x * tileSize + variant * tileSize;
  float pixVal = texture(lightningTex, ltcTile).r;
  // Discard empty atlas (prevents chord UV flooding into gray squares).
  if (pixVal < 0.08)
    return vec3(0.0);

  float brightnessThreshold = 0.92 - lightningTime * (LT_BRANCH_SHOW * 0.82);
  brightnessThreshold += ltc.y * (LT_BRANCH_SHOW * 0.82);
  brightnessThreshold = clamp(brightnessThreshold, 0.0, 1.0);
  // Never let leader threshold collapse to 0 (lights the whole atlas tile).
  brightnessThreshold = max(brightnessThreshold, 0.35);

  float curInt = ltTextureFlashIntensity(lightningTime, origin, intensity);
  if (lightningTime > 1.0) {
    // Keep atlas branches (~0.68–0.85) visible during main flash.
    brightnessThreshold = 0.58;
    curInt *= LT_MAIN_BRIGHT;
  } else {
    curInt = LT_LEADER_BRIGHT;
  }

  pixVal = max(pixVal - brightnessThreshold, 0.0);
  pixVal *= curInt;

  float vis = ltCloudEmbedVis(cloudwater, visMult) * ltBrightness * ltContrast * brightMult;
  // Milder dimming when hybrid packing expands one bolt into many GPU segments.
  vis /= max(sqrt(max(float(ltNumStrikes) * 0.35, 1.0)), 1.0);

  return max(pixVal * LT_CG_COL * vis, vec3(0.0));
}

float ltFlashEnvelope(float age) {
  float t = ltPhase(age);
  if (ltStrobeFlicker > 0.5) {
    float gate = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.88, 1.0, t));
    float flicker = 0.3 + 0.7 * abs(sin(t * 34.0 + sin(t * 19.0) * 0.4));
    return gate * flicker;
  }
  float rise = smoothstep(0.0, 0.12, t);
  float fall = 1.0 - smoothstep(0.55, 1.0, t);
  return rise * fall;
}

vec3 ltRenderStrikeBolts(vec2 uv, float aspect, float cloudwater) {
  // Enhanced-V2 SDF owns bolt rendering via lightningDataTex — keep this a no-op
  // so leftover V2 segment packing cannot overlay broken continuous/atlas bolts.
  return vec3(0.0);
}

float ltPrecipCurtain(vec2 uv, float aspect, vec2 origin, vec2 dest, float flashSize,
    float flashPhase, float intensity, float precip, float seed) {
  if (precip < 0.015 || flashPhase < 0.01) return 0.0;
  vec2 center = mix(origin, dest, 0.5);
  float cloudBase = max(origin.y, dest.y);
  float horiz = abs((uv.x - center.x) * aspect);
  float horizRad = 0.03 + flashSize * 0.16;
  float horizFall = exp(-(horiz * horiz) / (horizRad * horizRad));

  float belowBase = smoothstep(cloudBase - 0.008, cloudBase + 0.035, uv.y);
  float shaftFade = 1.0 - smoothstep(cloudBase + 0.08, cloudBase + 0.62, uv.y);
  float vertMask = belowBase * shaftFade;

  float streak = 0.3 + 0.7 * random2d(vec2(uv.x * 140.0 + seed * 0.01, floor(uv.y * 220.0)));
  float patchMix = 0.45 + 0.55 * random2d(vec2(center.x * 90.0 + seed, uv.y * 35.0));
  float curtain = vertMask * horizFall * streak * patchMix * precip;
  return flashPhase * intensity * curtain * ltRainIllum;
}

// Sheet flashes + reduced IC/CC cloud glow around bolt channels + precip curtains
void ltGetICCCFlash(vec2 uv, float aspect, float cloudwater, float precip, float nightFactor,
    out vec3 flashEmitted, out vec3 flashCloudLight, out vec3 flashSurfaceLight) {
  flashEmitted = vec3(0.0);
  flashCloudLight = vec3(0.0);
  flashSurfaceLight = vec3(0.0);
  if (ltNumStrikes <= 0 || ltEventAge < 0.0) return;

  float flashPhase = ltFlashEnvelope(ltEventAge);
  if (flashPhase < 0.01) return;
  float dayNight = mix(ltDayFlash, ltNightFlash, nightFactor);
  float cloudMask = smoothstep(0.06, 0.32, cloudwater);
  float precipMask = smoothstep(0.04, 0.22, precip);

  for (int i = 0; i < LT_MAX_STRIKES; i++) {
    if (i >= ltNumStrikes) break;
    float ltType = ltStrikePos[i].z;
    bool isFlash = ltStrikeIsFlash(ltType, ltStrikeMeta[i].y);
    bool isCloudBoltGlow = (ltIC(ltType) || ltCC(ltType)) && !ltPrecipOnly(ltStrikeMeta[i].y);
    if (!isFlash && !isCloudBoltGlow) continue;

    // Flash/curtain once per logical strike: atlas trunk (z<0.5) or first trunk
    // poly (z≈1.0). Skip later trunk knots (1.1) and branch segs (≥1.25).
    float segRole = ltStrikeRoute[i].z;
    if (isCloudBoltGlow && !(segRole < 0.5 || (segRole >= 0.9 && segRole < 1.05)))
      continue;

    vec2 origin = ltStrikePos[i].xy;
    vec2 dest = ltStrikeDest[i].xy;
    vec2 center = mix(origin, dest, 0.5);
    float flashSize = max(ltStrikeMeta[i].x, 0.15);
    if (ltSheet(ltType)) flashSize *= 1.35;
    if (isCloudBoltGlow) flashSize *= 1.0;
    bool precipOnly = ltPrecipOnly(ltStrikeMeta[i].y);
    bool inFront = isCloudBoltGlow ? true : ltFlashInFront(ltStrikeMeta[i].y);
    float intensity = ltStrikeDest[i].z * ltStrikeMeta[i].w;
    float radius = 0.035 + flashSize * 0.11;
    float scale = ltBrightness * ltContrast / max(sqrt(float(ltNumStrikes)), 1.0);
    float glowMul = isCloudBoltGlow ? 0.9 : 1.0;

    if (precipOnly) {
      float curtain = ltPrecipCurtain(uv, aspect, origin, dest, flashSize, flashPhase,
        intensity * dayNight * scale * 1.35, precip, ltStrikePos[i].w);
      flashSurfaceLight += LT_CG_COL * curtain * 0.14;
      if (inFront)
        flashCloudLight += LT_CG_COL * curtain * cloudMask * 0.006;
      continue;
    }

    vec2 delta = vec2((uv.x - center.x) * aspect, uv.y - center.y);
    float dist = length(delta);
    float flash = flashPhase * intensity * dayNight / (dist * dist / radius + 0.018);
    flash *= scale * glowMul;
    vec3 col = LT_CG_COL * flash;

    if (inFront) {
      flashEmitted += col * cloudMask * 0.14;
      flashCloudLight += col * 0.011;
      flashSurfaceLight += col * (0.009 + precipMask * 0.006);
    } else {
      flashSurfaceLight += col * (0.011 + precipMask * 0.008);
    }
    float curtain = ltPrecipCurtain(uv, aspect, origin, dest, flashSize, flashPhase * 0.65,
      intensity * dayNight * scale * glowMul, precip, ltStrikePos[i].w);
    flashSurfaceLight += LT_CG_COL * curtain * 0.05;
  }
}

void ltGetPrecipBoltShafts(vec2 uv, float aspect, float precip, float nightFactor,
    out vec3 flashSurfaceLight) {
  flashSurfaceLight = vec3(0.0);
  if (ltNumStrikes <= 0 || ltEventAge < 0.0 || ltEnableRainIllum == 0) return;
  float flashPhase = ltFlashEnvelope(ltEventAge);
  if (flashPhase < 0.01) return;
  float dayNight = mix(ltDayFlash, ltNightFlash, nightFactor);
  float scale = ltBrightness * ltContrast / max(sqrt(float(ltNumStrikes)), 1.0);

  for (int i = 0; i < LT_MAX_STRIKES; i++) {
    if (i >= ltNumStrikes) break;
    if (!ltPrecipOnly(ltStrikeMeta[i].y)) continue;
    if (ltStrikeIsFlash(ltStrikePos[i].z, ltStrikeMeta[i].y)) continue;
    vec2 origin = ltStrikePos[i].xy;
    vec2 dest = ltStrikeDest[i].xy;
    float flashSize = max(ltStrikeMeta[i].x, 0.12);
    float intensity = ltStrikeDest[i].z * ltStrikeMeta[i].w;
    float curtain = ltPrecipCurtain(uv, aspect, origin, dest, flashSize, flashPhase,
      intensity * dayNight * scale * 1.2, precip, ltStrikePos[i].w);
    flashSurfaceLight += LT_CG_COL * curtain * 0.16;
  }
}

float ltPathGlowPoint(vec2 p, vec2 at, float r) {
  return exp(-dot(p - at, p - at) / (r * r));
}

// Distance-to-segment glow along the full channel (not tip-only).
float ltSegmentGlow(vec2 p, vec2 o, vec2 d, float prop, float cloud) {
  float mask = max(smoothstep(0.02, 0.10, cloud), 0.35);
  float r = 0.025 + mask * 0.02;
  vec2 ba = d - o;
  float len2 = max(dot(ba, ba), 1e-6);
  float t = clamp(dot(p - o, ba) / len2, 0.0, clamp(prop, 0.05, 1.0));
  vec2 closest = o + ba * t;
  return ltPathGlowPoint(p, closest, r) * mask;
}

float ltPolyGlow(vec2 p, vec2 o, vec2 d, float prop, float cloud) {
  return ltSegmentGlow(p, o, d, prop, cloud);
}

vec3 ltComputeStrikeIllumination(vec2 uv, float aspect, float cloudwater, float precip, float nightFactor) {
  vec3 illum = vec3(0.0);
  if (ltNumStrikes <= 0 || ltEventAge < 0.0 || ltEnableAtmos == 0) return illum;

  float dayNight = mix(ltDayFlash, ltNightFlash, nightFactor);
  float illumScale = ltChannelIllumRatio * ltCloudIllum * 0.85 * max(ltGlowStrength, 0.2);
  vec2 p = vec2(uv.x * aspect, uv.y);

  for (int i = 0; i < LT_MAX_STRIKES; i++) {
    if (i >= ltNumStrikes) break;
    vec2 origin = ltStrikePos[i].xy;
    vec2 dest = ltStrikeDest[i].xy;
    float ltType = ltStrikePos[i].z;
    if (ltStrikeIsFlash(ltType, ltStrikeMeta[i].y)) continue;
    if (ltPrecipOnly(ltStrikeMeta[i].y)) continue;
    float prop = ltPropagate(ltEventAge, ltType);
    float flashPhase = ltPhase(ltEventAge);
    if (flashPhase < 0.03) continue;

    vec4 route = ltStrikeRoute[i];
    float str = flashPhase * ltStrikeDest[i].z * ltStrikeMeta[i].w * dayNight;
    str /= max(sqrt(float(ltNumStrikes)), 1.0);
    if (ltIC(ltType) || ltCC(ltType))
      str *= 1.35;

    float pathGlow;
    if (ltStrikeUsesBentPath(route)) {
      vec2 mA = vec2(route.x * aspect, route.y);
      vec2 oA = vec2(origin.x * aspect, origin.y);
      vec2 dA = vec2(dest.x * aspect, dest.y);
      pathGlow = max(ltPolyGlow(p, oA, mA, prop, cloudwater), ltPolyGlow(p, mA, dA, prop, cloudwater));
    } else {
      vec2 oA = vec2(origin.x * aspect, origin.y);
      vec2 dA = vec2(dest.x * aspect, dest.y);
      pathGlow = ltPolyGlow(p, oA, dA, prop, cloudwater);
    }

    float cloudPierce = max(0.9, ltCloudEmbedVis(cloudwater, ltStrikeMeta[i].z));
    float cloudMul = (ltIC(ltType) || ltCC(ltType)) ? 0.18 : 0.12;
    float volMul = (ltIC(ltType) || ltCC(ltType)) ? 0.09 : 0.055;
    if (ltEnableCloudIllum == 1)
      illum += LT_CG_COL * pathGlow * str * illumScale * cloudMul * cloudPierce;
    if (ltEnableVolumetric == 1)
      illum += LT_CG_COL * pathGlow * str * illumScale * volMul * cloudPierce;
    if (ltEnableRainIllum == 1)
      illum += LT_CG_COL * pathGlow * str * ltRainIllum * min(precip, 1.0)
        * (ltCG(ltType) ? 0.06 : (ltIC(ltType) || ltCC(ltType) || ltSpider(ltType) || ltAnvil(ltType) || ltSheet(ltType) ? 0.05 : 0.028));
  }
  return min(illum * 0.015, vec3(0.18));
}
