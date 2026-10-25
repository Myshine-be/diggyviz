// Strings — a bundle of thin glowing lines along the horizon, pinched at both ends,
// slowly weaving with the spectrum (lows in the middle, highs towards the edges).
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

  float env = pow(sin(PI * clamp(u, 0.0, 1.0)), 1.4);
  float spec = band(abs(u - 0.5) * 1.7);           // lows in the centre
  float e = max(uEnergy, 0.15);
  float A = env * (0.025 + 0.16 * spec * e);

  vec3 lc = lineColour();
  vec3 col = uPal[0] * 0.16 + lc * 0.025 * exp(-p.y * p.y * 40.0);

  float lines = 0.0;
  for (int i = 0; i < NL; i++) {
    float fi = float(i);
    float h = hash12(vec2(fi, 3.7));
    float w = sin(u * (2.0 + mod(fi * 1.7, 3.0)) * PI + t * (0.55 + 0.11 * fi) + fi * 1.3) * 0.6
            + sin(u * (5.0 + mod(fi * 2.3, 4.0)) * PI - t * (0.9 + 0.07 * fi) + fi * 2.1) * 0.3
            + sin(u * (9.0 + fi * 0.5) * PI + t * 1.6 + fi) * 0.1;
    float amp = i == 0 ? 0.3 : 0.45 + 0.55 * h;
    float yi = A * w * amp;
    float slope = dFdx(yi) / max(dFdx(p.x), 1e-5);
    float d = abs(p.y - yi) / sqrt(1.0 + slope * slope);
    float core = exp(-d / (px * 1.2));
    float glow = exp(-d * 55.0) * 0.07;
    lines += (core * (i == 0 ? 0.9 : 0.45) + glow) * (0.55 + 0.45 * h);
  }
  col += lc * lines;
  fragColor = vec4(col, 1.0);
}
`,
};
