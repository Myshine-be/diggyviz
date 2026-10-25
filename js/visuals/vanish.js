// Vanish — a fan of lines running from the left edge into one vanishing point on the right.
// Each line is one frequency over the last two seconds: the present is on the left, and every peak
// of the real sound travels along the line towards the point.
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  id: "vanish",
  name: "Vanish",
  bloom: 0.75,
  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NL = 16;

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float halfW = 0.5 * uRes.x / min(uRes.x, uRes.y);
  float xL = -halfW, xR = halfW * 0.96;
  float u = clamp((p.x - xL) / (xR - xL), 0.0, 1.0);       // 0 left … 1 vanishing point
  float age = pow(u, 1.5) * 2.0;                           // seconds ago, compressed towards the point
  float shrink = pow(1.0 - u, 1.15);
  vec3 col = uPal[0] * 0.12;

  for (int i = 0; i < NL; i++) {
    float fi = float(i);
    float f = fi / float(NL - 1);
    float spread = (f - 0.5) * 0.22 + (hash12(vec2(fi, 9.1)) - 0.5) * 0.03;
    float sp = histShape(f, age);
    float side = mod(fi, 2.0) < 0.5 ? 1.0 : -1.0;          // peaks above and below, like the video
    float y = shrink * (spread + side * sp * (0.3 - f * 0.1));
    float slope = dFdx(y) / max(dFdx(p.x), 1e-5);
    col += lineCol(f) * lineAt(p.y - y, slope, px) * (0.5 + 0.5 * shrink) * 0.8;
  }
  fragColor = vec4(col, 1.0);
}
`,
};
