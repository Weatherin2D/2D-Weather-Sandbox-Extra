// Lightning V2.5 — GPU-safe visible cloud channels (reduced compile complexity)
// Included by realisticDisplayShader.frag

#define LT_MAX_STRIKES 8
#define LT_MAX_SEGS 8
#define LT_MAX_BRANCH 4

uniform int ltNumStrikes;
uniform float ltEventAge;
uniform vec4 ltStrikePos[LT_MAX_STRIKES];
uniform vec4 ltStrikeDest[LT_MAX_STRIKES];
uniform vec4 ltStrikeMeta[LT_MAX_STRIKES];

uniform float ltBrightness;
uniform float ltContrast;
uniform float ltChannelThickness;
uniform float ltBranchDensity;
uniform float ltBranchLength;
uniform float ltFlashDuration;
uniform float ltGlowDuration;
uniform float ltGlowStrength;
uniform float ltAtmosIllum;
uniform float ltCloudIllum;
uniform float ltRainIllum;
uniform float ltTerrainIllum;
uniform float ltNightFlash;
uniform float ltDayFlash;
uniform float ltLODLevel;
uniform int ltEnableAtmos;
uniform int ltEnableCloudIllum;
uniform int ltEnableRainIllum;
uniform int ltEnableTerrainIllum;
uniform int ltEnableChannelGlow;
uniform int ltEnableVolumetric;

const vec3 LT_CORE = vec3(1.0);
const vec3 LT_HALO = vec3(0.56, 0.44, 0.92);
const vec3 LT_HALO_S = vec3(0.62, 0.48, 0.95);

float ltHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float ltSegDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  return length(pa - ba * h);
}

bool ltDry(float t)    { return t > 10.5 && t < 11.5; }
bool ltSpider(float t) { return t > 6.5 && t < 7.5; }
bool ltAnvil(float t)  { return t > 7.5 && t < 8.5; }
bool ltHoriz(float t)  { return ltSpider(t) || ltAnvil(t); }
bool ltCG(float t)     { return t > 4.5 && t < 7.0; }
bool ltIC(float t)     { return t > 0.5 && t < 1.5; }
bool ltCC(float t)     { return t > 1.5 && t < 2.5; }
bool ltSheet(float t)  { return t > 2.5 && t < 3.5; }
bool ltCloudCh(float t){ return ltIC(t) || ltCC(t) || ltSheet(t); }

float ltPhase(float age) {
  return clamp(age / max(5.5 * ltFlashDuration, 2.0), 0.0, 1.0);
}

float ltPropagate(float age, float ltType) {
  if (ltCG(ltType) || ltDry(ltType)) return 1.0;
  float t = ltPhase(age);
  if (ltHoriz(ltType)) {
    if (t < 0.15) return smoothstep(0.0, 0.15, t) * 0.2;
    if (t < 0.45) return mix(0.2, 0.55, smoothstep(0.15, 0.45, t));
    if (t < 0.70) return mix(0.55, 0.85, smoothstep(0.45, 0.70, t));
    return mix(0.85, 1.0, smoothstep(0.70, 1.0, t));
  }
  if (t < 0.15) return smoothstep(0.0, 0.15, t) * 0.25;
  if (t < 0.50) return mix(0.25, 0.65, smoothstep(0.15, 0.50, t));
  return mix(0.65, 1.0, smoothstep(0.50, 1.0, t));
}

float ltFlash(float age, float ltType, float strokes) {
  if (age < 0.0) return 0.0;
  if (ltHoriz(ltType) || ltCloudCh(ltType)) {
    float t = ltPhase(age);
    return smoothstep(0.05, 0.48, t) * (1.0 - smoothstep(0.88, 1.0, t) * 0.2)
         + smoothstep(0.68, 0.88, t) * 0.3;
  }
  float leader = 0.35 / max(ltFlashDuration, 0.2);
  float total = leader + 0.18 / max(ltFlashDuration, 0.2) * strokes;
  if (age < total) return 0.88;
  return 0.0;
}

float ltEmbed(float cloud, float ltType) {
  float d = clamp(cloud * 13.6, 0.0, 2.5);
  float e = mix(1.0, 0.58, smoothstep(0.18, 1.0, d));
  if (ltHoriz(ltType)) return max(e, 0.82);
  if (ltCC(ltType)) return max(e, 0.72);
  if (ltIC(ltType)) return max(e, 0.65);
  return e;
}

vec3 ltChannel(vec2 p, vec2 a, vec2 b, float thick, float inten) {
  float d = ltSegDist(p, a, b);
  float cw = thick * thick * 1.2e4;
  float hw = thick * thick * 2.5e3;
  float core = exp(-d * d / cw);
  float halo = exp(-d * d / hw) * ltGlowStrength * 0.3;
  return LT_CORE * core * 2.2 * inten + LT_HALO * halo * 0.45 * inten;
}

vec3 ltZigChannel(vec2 p, vec2 a, vec2 b, float thick, float seed, float prop, float inten) {
  vec3 c = vec3(0.0);
  vec2 prev = a;
  for (int i = 1; i <= LT_MAX_SEGS; i++) {
    float t = float(i) / float(LT_MAX_SEGS) * prop;
    vec2 mid = mix(a, b, t);
    float n = ltHash(vec2(t * 9.0 + seed, seed)) - 0.5;
    vec2 perp = normalize(vec2(-(b.y - a.y), b.x - a.x) + vec2(0.001));
    vec2 curr = mid + perp * n * 0.018 * ltBranchLength;
    c += ltChannel(p, prev, curr, thick, inten);
    prev = curr;
  }
  return c;
}

vec3 ltNetwork(vec2 p, vec2 o, vec2 d, float seed, float prop, float thick, float ltType) {
  vec2 delta = d - o;
  float len = length(delta);
  if (len < 1e-5) return vec3(0.0);
  vec2 dir = delta / len;
  vec3 halo = ltHoriz(ltType) ? LT_HALO_S : LT_HALO;
  vec3 net = ltZigChannel(p, o, o + dir * len * prop, thick, seed, 1.0, 1.0);
  net += ltChannel(p, o, o + dir * len * prop, thick * 0.85, 0.35) * halo;

  int branches = ltHoriz(ltType) ? (ltSpider(ltType) ? 4 : 3)
    : (ltCG(ltType) ? 4 : (ltCC(ltType) ? 3 : 2));
  branches = min(branches, LT_MAX_BRANCH);

  for (int b = 0; b < LT_MAX_BRANCH; b++) {
    if (b >= branches) break;
    float bf = float(b);
    float attach = 0.1 + ltHash(vec2(seed + bf, 3.0)) * 0.75;
    if (prop < attach - 0.05) continue;
    float act = smoothstep(attach - 0.08, attach + 0.12, prop);
    vec2 junc = o + dir * len * attach * prop;
    float ang = (ltHash(vec2(seed + bf, 7.0)) - 0.5) * (ltHoriz(ltType) ? 2.2 : 1.6);
    vec2 bdir = vec2(dir.x * cos(ang) - dir.y * sin(ang), dir.x * sin(ang) + dir.y * cos(ang));
    float blen = len * (0.12 + ltHash(vec2(seed + bf, 11.0)) * 0.28) * ltBranchLength;
    net += ltChannel(p, junc, junc + bdir * blen * act, thick * 0.4, 0.55) * halo;
  }
  return net;
}

float ltGain(float ltType) {
  if (ltDry(ltType)) return 8.0;
  if (ltSpider(ltType)) return 52.0;
  if (ltAnvil(ltType)) return 46.0;
  if (ltCC(ltType)) return 42.0;
  if (ltIC(ltType)) return 36.0;
  if (ltSheet(ltType)) return 20.0;
  if (ltCG(ltType)) return 48.0;
  return 26.0;
}

float ltPathGlow(vec2 uv, float aspect, vec2 o, vec2 d, float seed, float prop, float cloud) {
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 oA = vec2(o.x * aspect, o.y);
  vec2 dA = vec2(d.x * aspect, d.y);
  float mask = smoothstep(0.04, 0.18, cloud);
  float dist = ltSegDist(p, oA, mix(oA, dA, prop));
  float r = 0.012 + mask * 0.008;
  return exp(-dist * dist / (r * r)) * mask * 0.4;
}

vec3 ltRenderStrikeBolts(vec2 uv, float aspect, float cloudwater) {
  vec3 result = vec3(0.0);
  if (ltNumStrikes <= 0 || ltEventAge < 0.0) return result;
  vec2 p = vec2(uv.x * aspect, uv.y);

  for (int i = 0; i < LT_MAX_STRIKES; i++) {
    if (i >= ltNumStrikes) break;
    float ltType = ltStrikePos[i].z;
    float seed = ltStrikePos[i].w;
    vec2 origin = ltStrikePos[i].xy;
    vec2 dest = ltStrikeDest[i].xy;
    float prop = ltPropagate(ltEventAge, ltType);
    float phase = ltFlash(ltEventAge, ltType, ltStrikeDest[i].w);
    if (phase < 0.01) continue;

    float gain = ltGain(ltType) * phase * ltStrikeMeta[i].w * ltBrightness * ltContrast;
    gain *= ltEmbed(cloudwater, ltType);
    gain /= max(sqrt(float(ltNumStrikes)), 1.0);

    vec2 oA = vec2(origin.x * aspect, origin.y);
    float thick = 0.0022 + 0.004 * ltChannelThickness;

    if (ltDry(ltType)) {
      vec2 dryD = oA + vec2(0.0, -0.015);
      result += ltChannel(p, oA, dryD, thick * 0.5, 0.3) * gain * 0.2;
    } else if (ltSheet(ltType)) {
      vec2 sheetD = oA + vec2(0.02 * (ltHash(vec2(seed, 1.0)) - 0.5), -0.04);
      result += ltNetwork(p, oA, sheetD, seed, prop, thick * 0.7, ltType) * gain * 0.7;
    } else if (ltCloudCh(ltType) || ltHoriz(ltType) || ltCG(ltType) || ltType >= 9.0) {
      vec2 dA = vec2(dest.x * aspect, dest.y);
      if (ltType >= 9.0 && ltType < 10.5) dA = oA + vec2(0.0, 0.12);
      result += ltNetwork(p, oA, dA, seed, prop, thick, ltType) * gain;
    } else {
      vec2 dA = vec2(dest.x * aspect, dest.y);
      result += ltChannel(p, oA, dA, thick, 0.8) * gain;
    }
  }
  return result / (vec3(1.0) + result * 0.15);
}

vec3 ltComputeStrikeIllumination(vec2 uv, float aspect, float cloudwater, float precip, float nightFactor) {
  vec3 illum = vec3(0.0);
  if (ltNumStrikes <= 0 || ltEventAge < 0.0 || ltEnableAtmos == 0) return illum;

  float dayNight = mix(ltDayFlash, ltNightFlash, nightFactor);
  float cloudMask = smoothstep(0.03, 0.16, cloudwater);

  for (int i = 0; i < LT_MAX_STRIKES; i++) {
    if (i >= ltNumStrikes) break;
    vec2 origin = ltStrikePos[i].xy;
    vec2 dest = ltStrikeDest[i].xy;
    float ltType = ltStrikePos[i].z;
    float seed = ltStrikePos[i].w;
    float prop = ltPropagate(ltEventAge, ltType);
    float phase = ltFlash(ltEventAge, ltType, ltStrikeDest[i].w);
    if (phase < 0.01) continue;

    vec3 col = ltHoriz(ltType) ? vec3(0.58, 0.44, 0.88) : vec3(0.48, 0.55, 0.82);
    float str = phase * ltStrikeDest[i].z * ltStrikeMeta[i].w * dayNight * 0.65;
    str /= max(sqrt(float(ltNumStrikes)), 1.0);

    float glow = ltPathGlow(uv, aspect, origin, dest, seed, prop, cloudwater);
    if (ltEnableCloudIllum == 1)
      illum += col * glow * str * ltCloudIllum * (ltHoriz(ltType) ? 0.13 : 0.09);
    if (ltEnableVolumetric == 1 && cloudMask > 0.1)
      illum += col * glow * str * ltCloudIllum * 0.04;
    if (ltEnableRainIllum == 1 && ltCG(ltType))
      illum += col * glow * str * ltRainIllum * min(precip, 1.0) * 0.05;
  }
  return min(illum * 0.003, vec3(0.07));
}
