// Strings — like the handheld-console "strings" visualizer: one calm bundle of thin glowing lines across the
// screen, pinched at both ends. Built on the same principle as Vanish (Mo: "the most accurate one"): every
// line replays the recent sound a little later than the one before, so the bundle moves as one organic ribbon
// that braids and fans out, instead of every line doing its own thing. Bass = long swells, highs = fine ripples.
// No brightness changes on the beat: only the shape moves.
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  lyrics: { y: 0.81, font: "light" },
  id: "strings",
  name: "Strings",
  bloom: 0.8,
  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NL = 16;

// one trace: four frequency groups, each with its own wavelength, travelling slowly sideways
float trace(float u, float lag, float seed) {
  float t = uTime;
  float a0 = histSmooth(0.05, lag), a1 = histSmooth(0.2, lag), a2 = histSmooth(0.42, lag), a3 = histSmooth(0.7, lag);
  float y = 0.0;
  y += a0 * sin(TAU * (u * 1.0 + t * 0.16) + seed * 0.6);
  y += a1 * sin(TAU * (u * 2.0 - t * 0.23) + seed * 1.1) * 0.62;
  y += a2 * sin(TAU * (u * 3.4 + t * 0.31) + seed * 1.7) * 0.36;
  y += a3 * sin(TAU * (u * 5.6 - t * 0.43) + seed * 0.9) * 0.2;
  y += 0.14 * sin(TAU * (u * 0.8 + t * 0.05) + seed * 0.3);      // idle breathing: never a dead line
  return y;
}

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float halfW = 0.5 * uRes.x / min(uRes.x, uRes.y);
  float tall = clamp(uRes.y / uRes.x - 1.0, 0.0, 1.3);
  float u = clamp((p.x + halfW) / (2.0 * halfW), 0.0, 1.0);        // 0..1 across the full width
  float env = pow(sin(PI * u), 1.35);                               // pinched at both ends
  float amp = 0.15 * (1.0 + 0.8 * tall) * (1.0 - 0.65 * uRest);   // a pause: the strings relax almost straight

  vec3 col = uPal[0] * 0.10;
  col += mix(uPal[1], uPal[2], u) * 0.05 * exp(-p.y * p.y * 18.0) * env;   // soft haze around the bundle

  for (int i = 0; i < NL; i++) {
    float fi = float(i), k = fi / float(NL - 1);
    float seed = (k - 0.5) * 2.2;                                   // neighbouring lines stay related
    float y = env * (amp * trace(u, fi * 0.032, seed) + (k - 0.5) * 0.034);
    float slope = dFdx(y) / max(dFdx(p.x), 1e-5);
    float l = lineAt(p.y - y, slope, px * 1.5);
    vec3 c = pal(0.32 + 0.55 * k + 0.12 * sin(PI * u));
    col += c * l * mix(0.95, 0.5, k) * (0.45 + 0.55 * env);
  }
  fragColor = vec4(col, 1.0);
}
`,
};
