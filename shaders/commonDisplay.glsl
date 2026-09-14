#define PI 3.1415926535897932384626433832795
#define rad2deg 57.2958
#define deg2rad 0.0174533

const float GAMMA = 2.0;
const vec3 ONE_OVER_GAMMA = vec3(1. / GAMMA);

const vec3 tempColorPalette[] = vec3[](vec3(1., 0.7, 1.), vec3(1., 0.5, 1.), vec3(1., 0.3, 1.), vec3(0.8, 0., 0.8), vec3(0.65, 0., 0.6), vec3(0.5, 0., 0.5), vec3(0.35, 0., 0.6), vec3(0., 0., 0.7), vec3(0., 0., 1.), vec3(0., 0.30, 1.), vec3(0., 0.44, 1.), vec3(0., 0.62, 1.0), vec3(0., 0.80, 1.0), vec3(0., 1., 1.), vec3(0., 0.50, 0.), vec3(0., 0.61, 0.0), vec3(0., 0.72, 0.), vec3(0., 0.85, 0.),
                                       vec3(0., 1., 0.), vec3(0.5, 1., 0.), vec3(0.80, 1., 0.), vec3(1., 1., 0.), vec3(1., 0.8, 0.), vec3(1., 0.6, 0.), vec3(1., 0.4, 0.), vec3(1., 0., 0.), vec3(0.85, 0., 0.), vec3(0.72, 0., 0.), vec3(0.61, 0., 0.), vec3(0.52, 0., 0.));

// functions for display shaders
uniform int wrapHorizontally;

#ifndef SAMPLE_TERRAIN_HEIGHT_FROM_SUN_COLUMN
uniform sampler2D terrainHeightTex;
#endif

int wrapTerrainColumn(int ix, int w)
{
  if (w <= 1)
    return 0;
  if (wrapHorizontally != 0) {
    ix = int(mod(float(ix), float(w)));
    if (ix < 0)
      ix += w;
    return ix;
  }
  return clamp(ix, 0, w - 1);
}

float rawTerrainHeightColumn(int ix)
{
  int w = int(resolution.x);
  ix = wrapTerrainColumn(ix, w);
#ifdef SAMPLE_TERRAIN_HEIGHT_FROM_SUN_COLUMN
  return texelFetch(sunColumnTex, ivec2(ix, 1), 0).r;
#else
  return texelFetch(terrainHeightTex, ivec2(ix, 0), 0).r;
#endif
}

// Catmull-Rom interpolated column height in cell units (surface y).
float sampleTerrainHeight(float fragX)
{
  float x = fragX - 0.5;
  int i = int(floor(x));
  float f = clamp(x - float(i), 0.0, 1.0);
  float h0 = rawTerrainHeightColumn(i - 1);
  float h1 = rawTerrainHeightColumn(i);
  float h2 = rawTerrainHeightColumn(i + 1);
  float h3 = rawTerrainHeightColumn(i + 2);
  float f2 = f * f;
  float f3 = f2 * f;
  return 0.5 * ((2.0 * h1) + (-h0 + h2) * f + (2.0 * h0 - 5.0 * h1 + 4.0 * h2 - h3) * f2 + (-h0 + 3.0 * h1 - 3.0 * h2 + h3) * f3);
}

float terrainSlope(float fragX)
{
  return sampleTerrainHeight(fragX + 0.6) - sampleTerrainHeight(fragX - 0.6);
}

bool displayIsTerrain()
{
  float h = sampleTerrainHeight(fragCoord.x);
  return fragCoord.y < h;
}

bool samplePosIsTerrain(vec2 pos)
{
  return pos.y < sampleTerrainHeight(pos.x);
}

// Air pocket under a solid crust (caves / overhangs). Open-to-sky cells
// just below the interpolated skyline stay filled so slopes stay smooth.
bool fragmentIsCaveAir(isampler2D walls)
{
  if (texCoord.y <= 0.0 || texCoord.y > 1.0)
    return false;
  float h = sampleTerrainHeight(fragCoord.x);
  if (fragCoord.y >= h)
    return false;
  ivec4 w = texture(walls, texCoord);
  if (w[1] == 0)
    return false;
  if (fragCoord.y + 1.0 >= h)
    return false;
  int ix = wrapTerrainColumn(int(floor(fragCoord.x)), int(resolution.x));
  int capY = int(clamp(floor(h) - 1.0, 0.0, resolution.y - 1.0));
  return texelFetch(walls, ivec2(ix, capY), 0)[1] == 0;
}

bool displayIsSolidTerrain(isampler2D walls)
{
  return displayIsTerrain() && !fragmentIsCaveAir(walls);
}

vec2 terrainSurfaceUV(float fragX)
{
  float h = sampleTerrainHeight(fragX);
  float sy = clamp(h - 0.5, 0.5, max(resolution.y - 0.5, 0.5));
  return vec2(fragX / max(resolution.x, 1.0), sy / max(resolution.y, 1.0));
}

ivec4 sampleColumnSurfaceWall(isampler2D wallTex)
{
  return texture(wallTex, terrainSurfaceUV(fragCoord.x));
}

void drawCursor(vec4 cursor, vec3 view)            // OFF: cursor.w < 1       Normal round: cursor.w 1 to 2         WHOLE WIDTH: cursor.w >= 2
{
  if (cursor.w >= 1.) {                            // draw cursor enabled
    float distFromMouseF;
    if (cursor.w >= 2.) {                          // whole width brush
      distFromMouseF = abs(cursor.y - texCoord.y); // whole width bar
    } else {
      vec2 vecFromMouse = cursor.xy - texCoord;
      vecFromMouse.x *= texelSize.y / texelSize.x; // aspect ratio correction to make it a circle
      distFromMouseF = length(vecFromMouse);
    }

    // float distance

    if (abs(distFromMouseF - cursor[2] * texelSize.y) < 0.000005 * resolution.x / view[2]) { // draw brush
      fragmentColor = vec4(0.5, 0.5, 0.5, 1.0);                                              // gray line
    }
  }
}

// Derived from etale_cohomology on shadertoy: https://www.shadertoy.com/view/4tXyDn
float m_stretch(float point, float stretch) { return (sign(point) * stretch - point) * (sign(abs(point) - stretch) + 1.); }

float sdf_arrow(vec2 uv, float len, float angle, float head_height, float stem_width)
{
  uv = vec2(cos(angle) * uv.x + sin(angle) * uv.y, -sin(angle) * uv.x + cos(angle) * uv.y);

  len -= head_height; // Make sure the norm INCLUDES the arrow head
  uv.x -= len;        // Place the arrow's origin at the stem's base!

  uv.y = abs(uv.y);
  float head = max(dot(uv, vec2(1., 1.)) - head_height, -uv.x);

  uv.x = m_stretch(2. * uv.x + len, len);
  uv.y = m_stretch(2. * uv.y, stem_width);
  float stem = length(uv);

  return min(head, stem); // Join head and stem!
}

/*
void drawDirLines(vec2 vel)
{
  vec2 localcoord = vec2(-1.0, 0.0);
  float centerDist = length(localcoord); // distance from center of cell
  float velMag = length(vel);

  float relAngle = acos(dot(vel, localcoord) / (velMag * centerDist)); // angle between velocity and line from center of cell to this pixel

  float velMagSqrt = sqrt(velMag);

  float sizeMult = 3.952 / velMagSqrt;

  if (mod(relAngle, 0.50) < 0.01)
    fragmentColor = vec4(vec3(0), 1.);
}
*/

void drawIsoBars(float press)
{
  if (abs(mod(press, 0.001)) < 0.0001)
    fragmentColor = vec4(vec3(0), 1.);
}

float vectorField(vec2 vel, float intensity)
{
#define sizeMult 2.00

  float velMag = length(vel);

  velMag = min(velMag, 0.10);            // limit to prevent arrows becoming to large

  vec2 limvel = normalize(vel) * velMag; // velocity vector with limited magnitude

  vec2 localcoord = mod(fragCoord, 1.0) - vec2(0.5);

  localcoord += limvel * 2.0; // keep the arrow centered

  localcoord /= sqrt(velMag) * sizeMult;

  const float size = 1.0;

  float velAngle = atan(vel.y, vel.x);

  float arrow = sdf_arrow(localcoord, size, velAngle, 0.2 * size, 0.1 * size);
  return smoothstep(0.1, 0.0, arrow) * intensity;
}

void drawVectorField(vec2 vel, float intensity)
{
  float arrow = vectorField(vel, intensity);
  fragmentColor.xyz -= vec3(arrow);
  fragmentColor.w += arrow; // make it not transparent
}


bool visSampleIsTerrainWall(ivec4 w, vec2 samplePos)
{
  // Occupancy only: cave air must stay sampleable as atmosphere. Slope-fill
  // fragments below H(x) are overdrawn as terrain in the silhouette branch.
  return w[1] == 0;
}

// prevents sampling from wall cell unless nearest is wall cell
// fixes visual quirks such as fog near walls
vec4 bilerpWallVis(sampler2D tex, isampler2D wallTex, vec2 pos)
{
  // return texture(tex, pos / resolution); // direct sample for debugging

  vec2 st = pos - vec2(0.5); // calc pixel coordinats

  vec2 ipos = vec2(floor(st));
  vec2 fpos = fract(st);

  vec2 pa = ipos + vec2(0.5, 0.5);
  vec2 pb = ipos + vec2(1.5, 0.5);
  vec2 pc = ipos + vec2(0.5, 1.5);
  vec2 pd = ipos + vec2(1.5, 1.5);

  vec4 a = texture(tex, pa / resolution);
  vec4 b = texture(tex, pb / resolution);
  vec4 c = texture(tex, pc / resolution);
  vec4 d = texture(tex, pd / resolution);

  ivec4 wa = texture(wallTex, pa / resolution);
  ivec4 wb = texture(wallTex, pb / resolution);
  ivec4 wc = texture(wallTex, pc / resolution);
  ivec4 wd = texture(wallTex, pd / resolution);

  bool ta = visSampleIsTerrainWall(wa, pa);
  bool tb = visSampleIsTerrainWall(wb, pb);
  bool tc = visSampleIsTerrainWall(wc, pc);
  bool td = visSampleIsTerrainWall(wd, pd);

  float mixAB = fpos.x;
  float mixCD = fpos.x;
  float mixAB_CD = fpos.y;

  bool isWall = false;

  // find nearest cell and check if it's wall
  if (mixAB_CD < 0.5) {
    if (mixAB < 0.5) { // A
      if (ta) {
        mixAB_CD = 0.;
        mixAB = 0.;
        isWall = true;
      }
    } else { // B
      if (tb) {
        mixAB_CD = 0.;
        mixAB = 1.;
        isWall = true;
      }
    }
  } else {
    if (mixCD < 0.5) { // C
      if (tc) {
        mixAB_CD = 1.;
        mixCD = 0.;
        isWall = true;
      }
    } else { // D
      if (td) {
        mixAB_CD = 1.;
        mixCD = 1.;
        isWall = true;
      }
    }
  }

  if (!isWall) { // prevent mixing from wall
    if (ta)
      mixAB = 1.;
    else if (tb)
      mixAB = 0.;

    if (tc)
      mixCD = 1.;
    else if (td)
      mixCD = 0.;

    if (ta && tb)
      mixAB_CD = 1.;
    else if (tc && td)
      mixAB_CD = 0.;
  }

  return mix(mix(a, b, mixAB), mix(c, d, mixCD), mixAB_CD);
}

// Same as bilerpWallVis but applies cubic Hermite (smoothstep) weights so cloud
// boundaries interpolate smoothly instead of with hard grid-cell edges.
vec4 smoothBilerpWallVis(sampler2D tex, isampler2D wallTex, vec2 pos)
{
  vec2 st = pos - vec2(0.5);

  vec2 ipos = vec2(floor(st));
  vec2 fpos = fract(st);

  vec2 pa = ipos + vec2(0.5, 0.5);
  vec2 pb = ipos + vec2(1.5, 0.5);
  vec2 pc = ipos + vec2(0.5, 1.5);
  vec2 pd = ipos + vec2(1.5, 1.5);

  vec4 a = texture(tex, pa / resolution);
  vec4 b = texture(tex, pb / resolution);
  vec4 c = texture(tex, pc / resolution);
  vec4 d = texture(tex, pd / resolution);

  ivec4 wa = texture(wallTex, pa / resolution);
  ivec4 wb = texture(wallTex, pb / resolution);
  ivec4 wc = texture(wallTex, pc / resolution);
  ivec4 wd = texture(wallTex, pd / resolution);

  bool ta = visSampleIsTerrainWall(wa, pa);
  bool tb = visSampleIsTerrainWall(wb, pb);
  bool tc = visSampleIsTerrainWall(wc, pc);
  bool td = visSampleIsTerrainWall(wd, pd);

  // Cubic Hermite weights — eliminates the sharp piecewise-linear transition
  // at cell boundaries that causes the angular/pixelated cloud edges.
  vec2 sf = fpos * fpos * (3.0 - 2.0 * fpos);

  float mixAB    = sf.x;
  float mixCD    = sf.x;
  float mixAB_CD = sf.y;

  bool isWall = false;

  // Snap to nearest wall cell (same thresholds as bilerpWallVis — sf is
  // monotone so < 0.5 is equivalent to fpos < 0.5).
  if (mixAB_CD < 0.5) {
    if (mixAB < 0.5) { // A
      if (ta) {
        mixAB_CD = 0.;
        mixAB    = 0.;
        isWall   = true;
      }
    } else { // B
      if (tb) {
        mixAB_CD = 0.;
        mixAB    = 1.;
        isWall   = true;
      }
    }
  } else {
    if (mixCD < 0.5) { // C
      if (tc) {
        mixAB_CD = 1.;
        mixCD    = 0.;
        isWall   = true;
      }
    } else { // D
      if (td) {
        mixAB_CD = 1.;
        mixCD    = 1.;
        isWall   = true;
      }
    }
  }

  if (!isWall) {
    if (ta)
      mixAB = 1.;
    else if (tb)
      mixAB = 0.;

    if (tc)
      mixCD = 1.;
    else if (td)
      mixCD = 0.;

    if (ta && tb)
      mixAB_CD = 1.;
    else if (tc && td)
      mixAB_CD = 0.;
  }

  return mix(mix(a, b, mixAB), mix(c, d, mixCD), mixAB_CD);
}

// Nearest air-cell sample for soft-upsample blur taps (skip solid walls).
vec4 softCloudTapOrSkip(sampler2D tex, isampler2D wallTex, vec2 samplePos)
{
  vec2 cell = floor(samplePos - vec2(0.5)) + vec2(0.5);
  vec2 uv = cell / resolution;
  ivec4 w = texture(wallTex, uv);
  if (visSampleIsTerrainWall(w, cell))
    return vec4(-1.0); // sentinel: skip
  return texture(tex, uv);
}

// Display-only soft upsample of cloud liquid + precip (channels 1 / 2).
// Starts from Hermite, then blends a wall-aware multi-cell blur so low-res sims
// look less blocky without changing simulation resolution.
// soften: 0 = Hermite only; 1 = ~1 cell; 2 = ~2 cells.
// quality: <0.45 skips soft taps; <0.70 uses a cheaper 2-axis cross.
vec4 softCloudBilerpWallVis(sampler2D tex, isampler2D wallTex, vec2 pos, float soften, float quality)
{
  vec4 center = smoothBilerpWallVis(tex, wallTex, pos);
  float s = clamp(soften, 0.0, 2.0);
  if (s < 0.001 || quality < 0.45)
    return center;

  // Empty Hermite neighborhood → soft taps cannot help; skip 4–8 extra fetches on clear sky.
  if (center[1] + center[2] < 1e-5)
    return center;

  float radius = mix(0.55, 2.0, s * 0.5);
  float blend = clamp(s * 0.72, 0.0, 1.0);

  vec4 acc = center * 1.4;
  float wsum = 1.4;

  // Mid/low quality: horizontal + vertical only (2 taps). Full: 4-axis cross.
  int tapCount = quality < 0.70 ? 2 : 4;
  for (int i = 0; i < 4; i++) {
    if (i >= tapCount)
      break;
    vec2 dir = (i < 2)
      ? vec2(i == 0 ? 1.0 : -1.0, 0.0)
      : vec2(0.0, i == 2 ? 1.0 : -1.0);

    vec4 t = softCloudTapOrSkip(tex, wallTex, pos + dir * radius);
    if (t.x < -0.5)
      continue;
    acc += t * 0.55;
    wsum += 0.55;
  }

  vec4 blurred = acc / max(wsum, 1e-5);
  vec4 outv = center;
  // Soften only cloud liquid (G) and precip (B); leave TOTAL / DUST Hermite-sharp.
  outv[1] = mix(center[1], blurred[1], blend);
  outv[2] = mix(center[2], blurred[2], blend);
  return outv;
}

// Hermite-interpolated cloud water (smooth density for lighting normals)
float smoothCloudWater(sampler2D waterTex, vec2 tc, vec2 resolution)
{
  vec2 st = tc * resolution - vec2(0.5);
  vec2 ipos = floor(st);
  vec2 fpos = fract(st);
  vec2 sf = fpos * fpos * (3.0 - 2.0 * fpos);
  vec2 uvA = (ipos + vec2(0.5, 0.5)) / resolution;
  vec2 uvB = (ipos + vec2(1.5, 0.5)) / resolution;
  vec2 uvC = (ipos + vec2(0.5, 1.5)) / resolution;
  vec2 uvD = (ipos + vec2(1.5, 1.5)) / resolution;
  float a = texture(waterTex, uvA)[1];
  float b = texture(waterTex, uvB)[1];
  float c = texture(waterTex, uvC)[1];
  float d = texture(waterTex, uvD)[1];
  return mix(mix(a, b, sf.x), mix(c, d, sf.x), sf.y);
}

// Soft sunlight sample (reduces blocky shadow boundaries from the light grid)
// quality: 1.0 = wide 7x7; mid = 3x3; low/far = 1-tap (shadow detail is sub-pixel)
float smoothSunlightSample(sampler2D lightTex, vec2 tc, vec2 texelSize, float quality)
{
  if (quality < 0.45)
    return texture(lightTex, tc)[0];

  float reach = mix(1.15, 3.15, clamp((quality - 0.45) / 0.27, 0.0, 1.0));
  float sum = 0.0;
  float wsum = 0.0;
  int radius = quality < 0.70 ? 1 : 3;
  for (int j = -3; j <= 3; j++) {
    if (abs(j) > radius) continue;
    for (int i = -3; i <= 3; i++) {
      if (abs(i) > radius) continue;
      vec2 ij = vec2(float(i), float(j));
      float dist = length(ij);
      float edge = clamp(reach + 0.55 - dist, 0.0, 1.0);
      if (edge <= 0.0) continue;
      vec2 o = ij * texelSize * 1.05;
      float w = exp(-dot(ij, ij) * 0.32) * edge;
      sum += texture(lightTex, tc + o)[0] * w;
      wsum += w;
    }
  }
  return sum / max(wsum, 1e-5);
}
