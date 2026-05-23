#version 300 es
precision highp float;

in vec2 position_out;
in vec2 mass_out;
in float density_out;

out vec4 fragmentColor;

// Precipitation mass:
#define WATER 0
#define ICE 1

void main()
{

  if (mass_out[WATER] < 0.)
    discard;

  /* // dots:
  if(mass_out[1] > 0.){
      if(density_out < 1.0)
          fragmentColor = vec4(1.0, 1.0, 1.0, 1.0); // snow
      else
          fragmentColor = vec4(1.0, 1.0, 0.0, 1.0); // hail
  }else
  fragmentColor = vec4(0.0, 1.0, 1.0, 1.0); // rain
  */

  float totalMass = mass_out[WATER] + mass_out[ICE];
  float sizeFactor = pow(totalMass, 1.0 / 3.0);
  float opacity = totalMass * 0.10 * mix(0.75, 1.5, clamp(sizeFactor * 0.8, 0.0, 1.0));

  if (mass_out[ICE] > 0.) {                           // has ice
    if (mass_out[WATER] == 0.) {                      // has no liquid water, pure ice
      if (density_out < 1.0)                          // snow
        fragmentColor = vec4(1.0, 1.0, 1.0, opacity); // white
      else
        fragmentColor = vec4(1.0, 1.0, 0.0, opacity); // hail
    } else {                                          // mix of ice and water
      fragmentColor = vec4(0.5, 1.0, 1.0, opacity);   // light blue
    }
  } else {                                            // rain
    fragmentColor = vec4(0.0, 0.5, 1.0, opacity);     // dark blue
  }

  float glowThreshold = 3.0;
  float glowFactor = clamp((totalMass * sizeFactor - glowThreshold) / 2.0, 0.0, 1.0);
  if (glowFactor > 0.0) {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord) * 2.0;
    float halo = smoothstep(0.45, 0.85, dist) * (1.0 - dist) * 0.65 * glowFactor;
    fragmentColor.rgb += vec3(0.0, 1.0, 0.0) * halo;
    fragmentColor.a = max(fragmentColor.a, halo * 0.55);
  }

  // fragmentColor = vec4(1.0, 1.0, 0.0, 1.0); // all highly visible for DEBUG
}