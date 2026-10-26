// Halo — a tilted ring of concentric spectrum circles. Each circle is the spectrum around the ring
// (lows at the back) of a moment in the last two seconds, growing outwards; the ring turns slowly.
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  id: "halo",
  name: "Halo",
  bloom: 0.75,
  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NR = 18;

void main() {
  vec2 p = P() - vec2(0.0, -0.02);
  float px = 1.0 / min(uRes.x, uRes.y);
  float fr = fract(uTime * 9.0);        // 9 new circles per second
  float tilt = 0.36;
  float rot = uTime * 0.08;
  vec3 col = uPal[0] * 0.12;

  for (int k = 0; k < NR; k++) {
    float fk = float(k);
    float R = 0.13 + uKick * 0.018 + (fk + fr) * 0.019;               // older circles further out
    float age = (fk + fr) / 9.0;
    float fade = exp(-fk * 0.09) * smoothstep(0.0, 0.7, fk + fr);
    float th = atan(p.y / tilt, p.x);
    float f = abs(fract((th + rot) / TAU + 0.5) * 2.0 - 1.0);     // lows on one side, highs opposite
    float sp = histShape(f, age);
    float fresh = exp(-(fk + fr) * 0.55);              // the newest circles carry the hits
    sp *= 1.0 + (1.8 * flux(f) + 1.1 * uKick * (1.0 - f) + 0.8 * uSnare * f) * fresh;
    vec2 q = vec2(p.x, p.y - sp * 0.2);               // the spectrum stands up from each circle
    float front = q.y < 0.0 ? 0.9 : 0.55;
    col += lineCol(f) * ellipseLine(q, R, R * tilt, px) * fade * front * (1.0 + 1.4 * uHit * fresh);
  }
  fragColor = vec4(col, 1.0);
}
`,
};
