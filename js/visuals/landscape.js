// Landscape — rows of spectrum lines in perspective, like a mountain range of sound.
// A new row is born at the front every half beat and drifts back towards the horizon at a steady pace.
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
  float B = beatNow() * 2.0;            // half-beats
  float fr = fract(B);
  float horizon = 0.36, camH = 0.5;     // camera above the highest peak
  vec3 col = uPal[0] * 0.12;

  for (int k = 0; k < NR; k++) {
    float fk = float(k);
    float z = 0.45 + (fk + fr) * 0.07;                 // depth: rows move back as the music plays
    float f = clamp(p.x / (2.0 * halfW) + 0.5, 0.0, 1.0);   // every row spans the whole spectrum: lows left, highs right
    float b = (floor(B) - fk) * 0.5;                   // the beat this row belongs to
    float h = (k == 0 ? mix(specAt(f, b), band(f), 1.0 - fr) : specAt(f, b)) * 0.3;
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
