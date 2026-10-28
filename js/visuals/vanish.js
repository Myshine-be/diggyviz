// Vanish — a bundle of glowing traces that weave together and converge into one point on the right,
// in the spirit of classic handheld-console line visualizers. Every trace replays the recent sound a little
// later than the one before, so the bundle braids and ripples instead of moving as one line.
// Five frequency groups each drive their own wavelength: bass makes long swells, highs make fine ripples.
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  lyrics: { y: 0.82, font: "light" },
  id: "vanish",
  name: "Vanish",
  bloom: 0.85,
  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NL = 18;

float trace(float u, float lag, float seed) {
  float t = uTime;
  float a0 = histSmooth(0.04, lag), a1 = histSmooth(0.16, lag), a2 = histSmooth(0.32, lag);
  float a3 = histSmooth(0.55, lag), a4 = histSmooth(0.80, lag);
  float y = 0.0;
  y += a0 * sin(TAU * (u * 1.10 + t * 0.21) + seed * 1.3);
  y += a1 * sin(TAU * (u * 2.30 - t * 0.33) + seed * 2.1) * 0.75;
  y += a2 * sin(TAU * (u * 3.70 + t * 0.47) + seed * 3.7) * 0.50;
  y += a3 * sin(TAU * (u * 5.90 - t * 0.61) + seed * 0.9) * 0.32;
  y += a4 * sin(TAU * (u * 8.30 + t * 0.83) + seed * 4.4) * 0.20;
  y += 0.16 * sin(TAU * (u * 0.70 + t * 0.07) + seed);          // idle drift: never a flat line
  y += 0.9 * (flux(0.3) + flux(0.6)) * exp(-lag * 6.0) * sin(TAU * (u * 4.3 - t * 0.9) + seed * 2.7);   // a new note ripples through
  return y;
}

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float halfW = 0.5 * uRes.x / min(uRes.x, uRes.y);
  float tall = clamp(uRes.y / uRes.x - 1.0, 0.0, 1.3);
  vec2 V = vec2(halfW * 0.88, 0.03 * sin(uTime * 0.13));          // slowly drifting vanishing point
  float xL = -halfW * 1.04;
  float u = clamp((p.x - xL) / (V.x - xL), 0.0, 1.0);
  float env = pow(1.0 - u, 1.25);
  float amp = 0.12 * (1.0 + 0.9 * tall) * (1.0 + 0.6 * uKick + 0.4 * uSnare);

  vec3 col = uPal[0] * 0.10;
  col += pal(0.8) * exp(-length((p - V) * vec2(1.0, 3.0)) * 5.0) * 0.12;   // soft glow where the bundle meets

  for (int i = 0; i < NL; i++) {
    float fi = float(i), k = fi / float(NL - 1);
    float seed = hash12(vec2(fi, 4.7)) * TAU;
    float y = V.y + env * (amp * trace(u, fi * 0.045, seed) + (k - 0.5) * 0.03);
    float slope = dFdx(y) / max(dFdx(p.x), 1e-5);
    float l = lineAt(p.y - y, slope, px * 1.6);
    vec3 c = pal(0.35 + 0.5 * k + 0.15 * u);
    col += c * l * mix(1.0, 0.45, k) * (0.55 + 0.45 * (1.0 - u)) * (1.0 + 1.3 * uHit * exp(-fi * 0.12));
  }
  fragColor = vec4(col, 1.0);
}
`,
};
