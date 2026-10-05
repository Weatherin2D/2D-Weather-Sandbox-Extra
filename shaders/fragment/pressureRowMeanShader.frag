#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

// Rendered into a (sim_res_y x 1) target: texel x = sim row.
// R = robust mean fluid PRESSURE of the air cells in that row (storm-cell outliers trimmed)
// G = air cell count
// B = mean potential temperature (K)
// A = mean water vapor (TOTAL - CLOUD, g/m^3)

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform vec2 resolution;

out vec4 rowMean;

#define MAX_ROW_SAMPLES 1024

void main()
{
  int y = int(gl_FragCoord.x);
  int resX = int(resolution.x);
  int n = min(resX, MAX_ROW_SAMPLES);
  float stride = float(resX) / float(max(n, 1));

  float sumP = 0.0, sumP2 = 0.0, sumT = 0.0, sumW = 0.0, count = 0.0;
  for (int i = 0; i < MAX_ROW_SAMPLES; i++) {
    if (i >= n)
      break;
    int x = min(int((float(i) + 0.5) * stride), resX - 1);
    if (texelFetch(wallTex, ivec2(x, y), 0)[1] == 0) // DISTANCE == 0: wall
      continue;
    vec4 b = texelFetch(baseTex, ivec2(x, y), 0);
    vec4 w = texelFetch(waterTex, ivec2(x, y), 0);
    if (b[2] != b[2] || b[3] != b[3])
      continue;
    sumP += b[2];
    sumP2 += b[2] * b[2];
    sumT += b[3];
    sumW += max(w[0] - w[1], 0.0);
    count += 1.0;
  }

  if (count < 0.5) {
    rowMean = vec4(0.0);
    return;
  }

  float meanP = sumP / count;
  float sigma = sqrt(max(sumP2 / count - meanP * meanP, 0.0));
  float limit = max(sigma, 1e-6);

  // Second pass: mean of the "environment" only, so cells do not bias the baseline.
  float sumTrim = 0.0, countTrim = 0.0;
  for (int i = 0; i < MAX_ROW_SAMPLES; i++) {
    if (i >= n)
      break;
    int x = min(int((float(i) + 0.5) * stride), resX - 1);
    if (texelFetch(wallTex, ivec2(x, y), 0)[1] == 0)
      continue;
    float p = texelFetch(baseTex, ivec2(x, y), 0)[2];
    if (p == p && abs(p - meanP) <= limit) {
      sumTrim += p;
      countTrim += 1.0;
    }
  }

  float robustP = countTrim > 0.5 ? sumTrim / countTrim : meanP;
  rowMean = vec4(robustP, count, sumT / count, sumW / count);
}
