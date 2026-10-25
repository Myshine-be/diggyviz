// Halo — a tilted ring of concentric spectrum circles. Each circle is the spectrum around the ring
// (lows at the back); a new circle grows out of the centre every half beat and the ring turns slowly.
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
  float B = beatNow() * 2.0;
  float fr = fract(B);
  float tilt = 0.36;
  float rot = uTime * 0.08;
  vec3 col = uPal[0] * 0.12;

  for (int k = 0; k < NR; k++) {
    float fk = float(k);
    float R = 0.13 + (fk + fr) * 0.017;               // older circles further out
    float b = (floor(B) - fk) * 0.5;
    float fade = exp(-fk * 0.09) * smoothstep(0.0, 0.7, fk + fr);
    float th = atan(p.y / tilt, p.x);
    float f = abs(fract((th + rot) / TAU + 0.5) * 2.0 - 1.0);     // lows on one side, highs opposite
    float sp = k == 0 ? mix(specAt(f, b), band(f), 1.0 - fr) : specAt(f, b);
    vec2 q = vec2(p.x, p.y - sp * 0.11);              // lines stand up on the beat
    float front = q.y < 0.0 ? 0.9 : 0.55;
    col += lineCol(f) * ellipseLine(q, R, R * tilt, px) * fade * front;
  }
  fragColor = vec4(col, 1.0);
}
`,
};
