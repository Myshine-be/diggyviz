// Dunes (id stays "landscape" so saved choices keep working) — soft glowing dunes under a big calm moon.
// The newest sound appears at the horizon and the dunes carry it slowly towards you (the reverse of a scrolling
// mountain range), so the eye rests on the horizon and the music rolls in like waves. Heights are gently
// saturated and capped (never more than ~15 % of the screen), so a loud kick can never fill the picture.
// Highs blow little grains of light over the crests. Fits the Bloop / Glorp world (same moons) and Strings.
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  id: "landscape",
  name: "Dunes",
  bloom: 0.7,
  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NR = 28;
const float AGE = 2.0;          // seconds of sound visible from horizon to front

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float halfH = 0.5 * uRes.y / min(uRes.x, uRes.y);
  float tall = clamp(uRes.y / uRes.x - 1.0, 0.0, 1.3);
  float horizon = 0.12 + 0.12 * tall;
  float bottom = -halfH;

  // sky: cover colours, a big calm moon sitting on the horizon, a second small moon, a few stars
  vec3 col = mix(pal(0.85) * 0.22, uPal[0] * 0.05, smoothstep(horizon, horizon + 0.6, p.y));
  vec2 st = p * 70.0;
  col += vec3(1.0) * exp(-dot(fract(st) - 0.5, fract(st) - 0.5) * 160.0) * step(0.982, hash12(floor(st))) * 0.25 * smoothstep(horizon + 0.05, horizon + 0.3, p.y);
  vec2 mq = p - vec2(0.0, horizon + 0.02);
  float moon = 1.0 - smoothstep(0.17 - px, 0.17 + px, length(mq));
  vec3 moonC = mix(pal(0.95), pal(0.7), smoothstep(-0.17, 0.17, mq.y));
  moonC *= 0.85 + 0.15 * smoothstep(0.3, 0.7, fbm2(mq * 9.0 + 3.0));                   // soft surface
  col = mix(col, moonC, moon * 0.85);
  col += pal(0.9) * exp(-length(mq) * 5.0) * 0.18;
  vec2 m2 = p - vec2(0.42, horizon + 0.33);
  col = mix(col, mix(pal(0.5), vec3(1.0), 0.4), (1.0 - smoothstep(0.022 - px, 0.022 + px, length(m2))) * 0.8);

  // dunes, drawn from the horizon (newest sound) to the front (oldest), each nearer one covering the ones behind
  float scroll = uTime * (NR > 0 ? float(NR) / AGE : 1.0);
  float fr = fract(scroll), base = floor(scroll);
  for (int k = 0; k < NR; k++) {
    float fk = float(k);
    float t = (fk + fr) / float(NR);                     // 0 = horizon … 1 = front
    float id = base - fk;                                // stable per dune while it travels
    float persp = 0.25 + 0.75 * t;
    float yBase = mix(horizon - 0.005, bottom + 0.03, pow(t, 1.5));
    float wx = p.x / persp;
    float f = clamp(abs(wx) * 0.8, 0.0, 1.0);            // lows in the middle, highs to the sides
    float spec = histShapeSmooth(f, t * AGE);
    float dune = 0.5 + 0.5 * sin(wx * 4.0 + id * 0.9) * sin(wx * 1.7 - id * 0.4 + 1.3);
    float lift = 1.0 - exp(-(0.35 * dune + 1.4 * spec));  // gently saturated: never towers
    float amp = (0.012 + 0.11 * t) * (1.0 - 0.6 * uRest);
    float y = yBase + amp * lift;
    float slope = dFdx(y) / max(dFdx(p.x), 1e-5);
    float fade = smoothstep(0.0, 0.12, t) * (1.0 - 0.35 * t);
    vec3 lc = mix(pal(0.35 + 0.5 * f), pal(0.95), clamp(spec * 0.9, 0.0, 0.7));
    float below = 1.0 - smoothstep(-px, px, p.y - y);
    vec3 body = uPal[0] * (0.12 + 0.1 * t) + lc * 0.10 * exp(-max(y - p.y, 0.0) * 22.0) * fade;   // sand glows under the crest
    col = mix(col, body, below);
    col += lc * lineAt(p.y - y, slope, px * 1.3) * fade * 0.95;
    // grains of light blown off the crest by high notes
    float hi = histSmooth(0.8, t * AGE);
    vec2 g = vec2(wx * 30.0 + uTime * 2.0 + id * 3.1, 0.0);
    float grain = step(0.86, hash12(vec2(floor(g.x), id))) * (1.0 - smoothstep(0.0, 0.004 + 0.006 * hi, abs(p.y - y - 0.01 - 0.02 * fract(uTime * 0.7 + hash12(vec2(floor(g.x), id + 3.0))))));
    col += pal(0.9) * grain * hi * fade * 0.5 * (1.0 - below);
  }
  fragColor = vec4(col, 1.0);
}
`,
};
