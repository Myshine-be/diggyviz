// Orbit — a slowly turning sphere drawn with latitude circles. The spectrum ripples the circles
// (lows near the equator, highs near the poles); the sphere itself never grows or jumps.
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  id: "orbit",
  name: "Orbit",
  bloom: 0.75,
  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NC = 16;

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float R = 0.3 + uKick * 0.02;
  float T = 0.42;                                   // view tilt
  float rot = uTime * 0.15;
  vec3 col = uPal[0] * 0.12;

  float sT = sin(T), cT = cos(T);
  for (int k = 0; k < NC; k++) {
    float fk = float(k);
    float lat = mix(-1.25, 1.25, (fk + 0.5) / float(NC));
    float r = R * cos(lat);
    vec2 q = vec2(p.x, p.y - R * sin(lat) * cT);
    if (abs(q.x) > r * 1.2 || abs(q.y) > r * sT * 1.2 + 0.03) continue;
    float lam = atan(-q.y / sT, q.x);
    float lon = lam + rot;
    float f = abs(lat) / 1.25;                      // equator = lows, poles = highs
    float age = fract(lon / TAU) * 1.5;            // the sound of the last 1.5 s wraps round the sphere
    float hitNow = exp(-age * 3.0);                 // the side where the newest sound is
    float rr = r * (1.0 + (histShape(f, age) * 0.17 + (1.4 * flux(f) + 0.7 * uKick * (1.0 - f) + 0.5 * uSnare * f) * 0.1 * hitNow) * (0.6 + 0.4 * sin(lon * 6.0 + fk)));
    float zf = R * sin(lat) * sT + rr * sin(lam) * cT;   // towards the viewer > 0
    col += lineCol(f) * ellipseLine(q, rr, rr * sT, px) * (zf > 0.0 ? 0.95 : 0.3) * 0.85 * (1.0 + 1.2 * uHit * hitNow);
  }
  fragColor = vec4(col, 1.0);
}
`,
};
