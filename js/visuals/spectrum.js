// Spectrum — mirrored LED spectrum (lows in the centre) standing on a rippling mirror floor.

export default {
  id: "spectrum",
  name: "Spectrum",
  bloom: 0.9,
  frag: /* glsl */ `
const float N = 22.0;         // columns per side
float MAXH = 0.40;
const float CELL = 0.0125;

vec3 bars(vec2 p, float halfW, out float lit) {
  lit = 0.0;
  float colW = halfW / N;
  float ax = abs(p.x);
  float ci = floor(ax / colW);
  if (ci >= N || p.y < 0.0) return vec3(0.0);
  float fx = fract(ax / colW);
  float aa = fwidth(ax / colW) * 1.5;
  float colMask = smoothstep(0.14, 0.14 + aa, fx) * (1.0 - smoothstep(0.86 - aa, 0.86, fx));
  float bi = pow(ci / (N - 1.0), 0.85);
  float h = band(bi) * MAXH;
  float pk = peak(bi) * MAXH;
  float fy = fract(p.y / CELL);
  float segMask = smoothstep(0.0, 0.08, fy) * (1.0 - smoothstep(0.66, 0.74, fy));
  float segTop = (floor(p.y / CELL) + 0.7) * CELL;
  float on = step(segTop, h + CELL * 0.5);
  vec3 c = pal(0.38 + 0.62 * p.y / MAXH);
  float capY = floor(pk / CELL) * CELL + CELL;
  float cap = step(abs(p.y - capY - CELL * 0.35), CELL * 0.35) * step(0.01, pk);
  lit = on * colMask * segMask;
  vec3 col = c * lit * (1.05 + uKick * 0.6);
  col += c * 0.05 * colMask * segMask * step(p.y, MAXH);    // unlit LEDs
  col = mix(col, vec3(1.0), cap * colMask * 0.9);
  return col;
}

void main() {
  vec2 p = P();
  MAXH = 0.40 * max(1.0, (uRes.y / uRes.x) * 0.62);
  float halfW = 0.5 * uRes.x / min(uRes.x, uRes.y) * 0.92;
  float y0 = -0.1;
  vec2 q = vec2(p.x, p.y - y0);
  float lit;
  vec3 col = uPal[0] * 0.25;
  col += pal(0.5) * 0.06 * exp(-abs(q.y) * 6.0) * (0.5 + uEnergy);

  if (q.y >= 0.0) {
    col += bars(q, halfW, lit);
  } else {
    float yr = -q.y;
    float rip = sin(yr * 90.0 - uTime * 3.5) * 0.004 * (0.4 + uKick) + sin(q.x * 30.0 + uTime) * 0.002;
    vec3 refl = bars(vec2(q.x + rip, yr + rip * 0.5), halfW, lit);
    float fade = exp(-yr * 7.0) * 0.38;
    col += refl * fade;
    // floor grid
    float z = 0.08 / max(yr, 0.004);
    float gx = gridLine(q.x * z * 3.0, 0.02);
    float gz = gridLine(z * 0.6 - uSongTime * 0.8, 0.03);
    col += pal(0.45) * (gx + gz) * 0.06 * smoothstep(0.0, 0.25, yr) * exp(-yr * 2.0);
  }
  // horizon line
  col += pal(0.6) * exp(-abs(q.y) * 220.0) * (0.35 + uEnergy * 0.6);
  fragColor = vec4(col, 1.0);
}`,
};
