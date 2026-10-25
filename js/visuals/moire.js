// Moiré — two drifting ring gratings whose interference draws slow, impossible shapes.
// The second grating slowly morphs between rings and twisted lines.

export default {
  id: "moire",
  name: "Moiré",
  bloom: 0.6,
  frag: /* glsl */ `
float grating(float x) {
  float footprint = fwidth(x);
  float contrast = 1.0 - smoothstep(0.25, 0.5, footprint);
  return 0.5 + 0.5 * cos(x * TAU) * contrast;
}

void main() {
  vec2 p = P() * (1.0 - uDrop * 0.08);
  float t = uSongTime;
  float F = 34.0;

  vec2 c1 = vec2(sin(t * 0.21), cos(t * 0.17)) * 0.12;
  vec2 c2 = vec2(cos(t * 0.13 + 1.0), sin(t * 0.19 + 2.0)) * 0.12;

  float g1 = grating(length(p - c1) * F - t * 0.35);
  float mode = 0.5 - 0.5 * cos(t * 0.13 * PI);
  vec2 pr = rot(t * 0.04 + length(p) * (0.4 + band(0.3) * 1.2)) * p;
  float g2rings = grating(length(p - c2) * (F + uLevel * 4.0) + t * 0.25);
  float g2lines = grating(pr.x * F * 1.2);
  float g2 = mix(g2rings, g2lines, smoothstep(0.0, 1.0, mode));

  float m = g1 * g2;                         // product holds the beat-frequency (the moiré)
  float lowpass = smoothstep(0.08, 0.6, m);  // emphasise the interference
  float ink = smoothstep(0.35, 0.95, m);

  vec3 bg = uPal[0] * 0.25;
  vec3 col = mix(bg, pal(0.55 + 0.35 * sin(length(p) * 3.0 - t * 0.5)), ink * (0.7 + uEnergy * 0.5));
  col += pal(0.85) * pow(lowpass, 6.0) * uKick * 0.5;
  col *= (1.0 - smoothstep(0.2, 1.2, length(p)));
  fragColor = vec4(col, 1.0);
}`,
};
