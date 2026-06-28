#version 300 es
precision highp float;

in vec2 position_out;
in vec2 mass_out;
in float density_out;

out vec4 fragmentColor;

#define WATER 0
#define ICE   1

void main()
{
  if (mass_out[WATER] < 0.)
    discard;

  float opacity = (mass_out[WATER] + mass_out[ICE]) * 0.10;

  if (mass_out[ICE] > 0.) {
    if (mass_out[WATER] == 0.) {
      if (density_out < 1.0)
        fragmentColor = vec4(1.0, 1.0, 1.0, opacity);
      else
        fragmentColor = vec4(1.0, 1.0, 0.0, opacity);
    } else {
      fragmentColor = vec4(0.5, 1.0, 1.0, opacity);
    }
  } else {
    fragmentColor = vec4(0.0, 0.5, 1.0, opacity);
  }
}
