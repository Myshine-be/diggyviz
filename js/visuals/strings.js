// Strings — a bundle of thin glowing lines along the horizon, pinched at both ends,
// drawn from the waveform of the sound itself, like an oscilloscope (real sound in listening mode).
// Calm by design: the music changes the shape of the lines, never the brightness of the screen.

export default {
  id: "strings",
  name: "Strings",
  bloom: 0.75,
  frag: /* glsl */ `
const int NL = 12;

// album colour, lifted so the lines stay visible on dark covers
vec3 lineColour() {
  vec3 c = mix(uPal[1], uPal[2], 0.45);
  float m = max(c.r, max(c.g, c.b));
  return c / max(m, 0.05) * 0.9;
}

void main() {
  vec2 p = P();
  float u = gl_FragCoord.x / uRes.x;               // 0..1 across the full width
  float px = 1.0 / min(uRes.x, uRes.y);
  float t = uTime;                                  // continuous, unaffected by seeks

  float env = pow(sin(PI * clamp(u, 0.0, 1.0)), 1.2);
  float loud = clamp(uEnergy * 1.1 + 0.2, 0.3, 1.0);   // slow section loudness; the beat is in the wave shape
  float A = env * 0.36 * loud;                      // up to ~35 % of the screen height

  vec3 lc = lineColour();
  vec3 col = uPal[0] * 0.16 + lc * 0.025 * exp(-p.y * p.y * 40.0);

  float lines = 0.0;
  for (int i = 0; i < NL; i++) {
    float fi = float(i);
    float h = hash12(vec2(fi, 3.7));
    // every line is the waveform itself (the sound), each read slightly stretched/shifted: a bundle
    float w = i == 0 ? waveAt(u) : waveAt(fract(u * (1.0 + 0.012 * fi) + fi * 0.023));
    float amp = i == 0 ? 0.3 : 0.45 + 0.55 * h;
    float yi = A * w * amp;
    float slope = dFdx(yi) / max(dFdx(p.x), 1e-5);
    float d = abs(p.y - yi) / sqrt(1.0 + min(slope * slope, 36.0));
    float core = exp(-d / (px * 1.2));
    float glow = exp(-d * 55.0) * 0.07;
    lines += (core * (i == 0 ? 0.9 : 0.45) + glow) * (0.55 + 0.45 * h);
  }
  // Bound accumulated light: twelve overlapping curves must not become a bright screen wash.
  col += lc * (1.0 - exp(-lines * 0.5)) * 0.95;
  fragColor = vec4(col, 1.0);
}
`,
};
