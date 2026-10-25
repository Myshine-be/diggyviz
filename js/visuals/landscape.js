// Landscape — rows of spectrum lines in perspective, like a mountain range of sound.
// Rows are the real spectrum of the last two seconds, born at the front and drifting back to the horizon.
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  id: "landscape",
  name: "Landscape",
  bloom: 0.7,
  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NR = 40;

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float halfW = 0.5 * uRes.x / min(uRes.x, uRes.y);
  float fr = fract(uTime * 20.0);       // 20 rows per second, scrolling in real time
  float horizon = 0.36, camH = 0.5;     // camera above the highest peak
  vec3 col = uPal[0] * 0.12;

  for (int k = 0; k < NR; k++) {
    float fk = float(k);
    float age = (fk + fr) / 20.0;                      // seconds ago
    float z = 0.64 + (fk + fr) * 0.07;                 // depth; the newest row (now) sits just above the bottom edge
    float f = clamp(p.x / (2.0 * halfW) + 0.5, 0.0, 1.0);   // every row spans the whole spectrum: lows left, highs right
    float h = histShape(f, age) * 0.45;
    h *= smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.92, f);   // soft edges
    float y = horizon - (camH - h) / z;
    float slope = dFdx(y) / max(dFdx(p.x), 1e-5);
    float fade = exp(-fk * 0.06) * smoothstep(0.0, 0.6, fk + fr);
    col += lineCol(f) * lineAt(p.y - y, slope, px) * fade * 0.85;
  }
  fragColor = vec4(col, 1.0);
}
`,
};
