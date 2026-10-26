// Landscape — a neon mountain range made of sound. Every ridge is the spectrum of a moment (lows in the
// centre, highs towards the sides), born at the front and drifting back towards a glowing sun. Nearer ridges
// hide the ones behind them, so it reads as solid terrain; soft noise keeps the land alive between beats.
// Rows scroll continuously (histSmooth + uHistFrac), so there is no stepping at any refresh rate.
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  id: "landscape",
  name: "Landscape",
  bloom: 0.8,
  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NR = 34;
const float RATE = 9.0;      // ridges per second

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float tall = clamp(uRes.y / uRes.x - 1.0, 0.0, 1.3);
  float horizon = 0.22 + 0.2 * tall;
  float z0 = 0.32 - 0.17 * tall;              // portrait: ridges start closer, so the land fills the screen
  float camH = 0.42;
  float sway = sin(uTime * 0.09) * 0.03;

  // sky: neon dusk gradient and a soft sun behind the mountains
  vec3 col = mix(pal(0.85) * 0.30, uPal[0] * 0.04, smoothstep(horizon - 0.02, horizon + 0.75, p.y));   // neon dusk
  vec2 sp = p - vec2(sway * 0.5, horizon + 0.11);
  float sun = 1.0 - smoothstep(0.165 - px, 0.165 + px, length(sp));
  col = mix(col, mix(pal(0.98), pal(0.7), smoothstep(-0.16, 0.16, sp.y)), sun * 0.9);
  col += pal(0.9) * exp(-length(sp) * 6.0) * 0.2;

  float scroll = uTime * RATE;
  float base = floor(scroll), fr = fract(scroll);
  float covered = 0.0;
  for (int k = 0; k < NR; k++) {
    float fk = float(k);
    float d = fk + fr;                       // ridges from the front; grows as the ridge drifts back
    float id = base - fk;                    // stable per ridge, so its terrain doesn't change while it moves
    float z = z0 + d * 0.115;
    float wx = (p.x - sway) * z * 1.5;
    float f = clamp(abs(wx) * 0.75, 0.0, 1.0);
    float spec = histShapeSmooth(f, d / RATE);
    float envC = exp(-wx * wx * 0.9);
    float terrain = (noise2(vec2(wx * 1.6, id * 0.35)) - 0.5) * 0.10 + (noise2(vec2(wx * 4.1, id * 0.9)) - 0.5) * 0.03;
    float h = 0.06 + terrain + spec * 0.42 * envC;
    float y = horizon + (h - camH) / z * 0.62;
    float slope = dFdx(y) / max(dFdx(p.x), 1e-5);
    float fog = exp(-d * 0.055) * smoothstep(0.0, 1.2, d);
    vec3 lc = mix(pal(0.35 + 0.55 * f), pal(0.97), clamp(spec * envC * 1.4, 0.0, 1.0));
    float vis = 1.0 - covered;
    float below = 1.0 - smoothstep(-px, px, p.y - y);
    vec3 body = uPal[0] * 0.14 + lc * (0.03 + 0.22 * exp(-max(y - p.y, 0.0) * 14.0)) * fog;   // flank glows under the crest
    col = mix(col, body, below * vis);          // solid mountain body
    col += lc * lineAt(p.y - y, slope, px * 1.4) * vis * fog * 1.15;       // glowing ridge line
    covered = max(covered, below);
  }
  fragColor = vec4(col, 1.0);
}
`,
};
