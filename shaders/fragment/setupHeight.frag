#version 300 es
precision highp float;

in vec2 fragCoord;
in vec2 texCoord;

uniform vec2 resolution;
uniform vec2 texelSize;
uniform float seed;
uniform float heightMult;

layout(location = 0) out float outHeight;

float rand(float n) { return fract(sin(n) * 43758.5453123); }

float noise(float p)
{
  float fl = floor(p);
  float fc = fract(p);
  return mix(rand(fl), rand(fl + 1.), fc) - 0.5;
}

void main()
{
  float height = 0.0;

  if (heightMult < 0.05) {
    height = 0.0;
  } else if (heightMult < 0.10) {
    height = 0.005;
  } else {
    float var = fragCoord.x * 0.001;
    for (float i = 2.0; i < 1000.0; i *= 1.5)
      height += noise(var * i + rand(seed + i) * 10.) * 0.5 / i;
    height *= heightMult;
  }

  float hCells = max(height * resolution.y, 1.0);
  if (height < texelSize.y)
    hCells = 1.0;
  outHeight = clamp(hCells, 1.0, max(resolution.y - 1.0, 1.0));
}
