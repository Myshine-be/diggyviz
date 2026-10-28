// Spectrum — Mo's favourite, refreshed: glassy LED columns whose levels glide (smooth spectrum, the top LED is
// partly lit so bars slide instead of jumping), peak caps that hang and fall, little sparks rising from fresh
// high notes, a mirror floor. Every ~40 s the layout glides into another shape so it never gets boring:
// mirrored row → arch → ring → classic row. Lows sit in the centre (or at the left in the classic row).

export default {
  lyrics: { y: 0.8, font: "mono" },
  id: "spectrum",
  name: "Spectrum",
  bloom: 0.75,
  frag: /* glsl */ `
const float N = 24.0;          // columns (per side when mirrored)
const float CELL = 0.0125;     // LED height
float MAXH;

// bar-space coordinates for a layout: u = column position 0..1 (0 = lows), y = height above the base,
// w = width scale of one column, ok = inside the layout
vec4 layoutUV(int mode, vec2 p, float halfW) {
  if (mode == 0) return vec4(abs(p.x) / halfW, p.y + 0.08, halfW / N, step(abs(p.x), halfW));
  if (mode == 1) {                                     // arch: bars stand on a circle below the screen
    vec2 q = p - vec2(0.0, -0.62);
    float a = atan(q.x, q.y), r = length(q);
    return vec4(abs(a) / 1.15, r - 0.5, 0.5 * 1.15 / N, step(abs(a), 1.15));
  }
  if (mode == 2) {                                     // ring: bars point outwards from a circle
    float a = atan(p.x, p.y), r = length(p);
    return vec4(abs(a) / PI, r - 0.15, 0.15 * PI / N, 1.0);
  }
  return vec4((p.x + halfW) / (2.0 * halfW), p.y + 0.08, 2.0 * halfW / (2.0 * N), step(abs(p.x), halfW));   // classic row
}

vec3 bars(vec4 L, float px, out float lit) {
  lit = 0.0;
  float u = L.x, y = L.y, colW = L.z;
  if (L.w < 0.5 || u < 0.0 || u >= 1.0) return vec3(0.0);
  float nCols = N;
  float ci = floor(u * nCols), fx = fract(u * nCols);
  float aa = px / max(colW, 1e-4) * 1.5;
  float colMask = smoothstep(0.12, 0.12 + aa, fx) * (1.0 - smoothstep(0.88 - aa, 0.88, fx));
  float bi = pow((ci + 0.5) / nCols, 0.85);
  float lvl = clamp(histSmooth(bi, 0.0) * 0.85 + 0.35 * flux(bi), 0.0, 1.0);
  float h = lvl * MAXH;
  if (y < 0.0) return vec3(0.0);
  float cellI = floor(y / CELL), fy = fract(y / CELL);
  float segMask = smoothstep(0.0, 0.1, fy) * (1.0 - smoothstep(0.68, 0.78, fy));
  float cellBot = cellI * CELL;
  float on = clamp((h - cellBot) / CELL, 0.0, 1.0);                     // the top LED is partly lit → gliding
  vec3 c = pal(0.3 + 0.62 * clamp(y / MAXH, 0.0, 1.0));
  vec3 glass = c * (0.55 + 0.6 * (1.0 - fy)) + vec3(1.0) * pow(1.0 - fy, 8.0) * 0.18;   // glassy: lit top edge
  lit = on * colMask * segMask;
  vec3 col = glass * lit;
  col += c * 0.035 * colMask * segMask * step(y, MAXH);                // unlit glass
  // peak cap (hangs, then falls with gravity — envelope.js)
  float pk = peak(bi) * MAXH;
  float cap = (1.0 - smoothstep(0.0, 0.003, abs(y - pk - CELL * 0.6))) * step(0.01, pk) * colMask;
  col = mix(col, mix(c, vec3(1.0), 0.6), cap * 0.9);
  // sparks rising from fresh high notes
  float fl = flux(bi) * step(0.4, bi);
  float sy = fract(uTime * 0.6 + hash12(vec2(ci, 3.0))) * 0.12;
  float spark = (1.0 - smoothstep(0.0, 0.0035, length(vec2((fx - 0.5) * colW, y - h - sy))));
  col += mix(c, vec3(1.0), 0.5) * spark * fl * (1.0 - sy / 0.12) * 0.9;
  return col;
}

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float halfW = 0.5 * uRes.x / min(uRes.x, uRes.y) * 0.92;
  MAXH = 0.40 * max(1.0, (uRes.y / uRes.x) * 0.62);

  // layout: hold ~40 s, then glide 3 s into the next one
  float cyc = uSceneTime / 40.0;
  int m0 = int(mod(floor(cyc), 4.0)), m1 = int(mod(floor(cyc) + 1.0, 4.0));
  float k = smoothstep(0.925, 1.0, fract(cyc));

  vec3 col = uPal[0] * 0.22 + pal(0.5) * 0.05 * exp(-dot(p, p) * 2.0);
  float lit;
  vec3 a = bars(layoutUV(m0, p, halfW), px, lit);
  vec3 b = k > 0.0 ? bars(layoutUV(m1, p, halfW), px, lit) : vec3(0.0);
  col += mix(a, b, k);

  // mirror floor under the straight layouts (fades out for arch and ring)
  float straight = mix(m0 == 0 || m0 == 3 ? 1.0 : 0.0, m1 == 0 || m1 == 3 ? 1.0 : 0.0, k);
  if (p.y < -0.08 && straight > 0.0) {
    float yr = -0.08 - p.y;
    float rip = sin(yr * 90.0 - uTime * 3.0) * 0.003 + sin(p.x * 30.0 + uTime) * 0.0015;
    vec2 rp = vec2(p.x + rip, -0.08 + yr + rip * 0.5);
    vec3 ra = bars(layoutUV(m0, rp, halfW), px, lit), rb = k > 0.0 ? bars(layoutUV(m1, rp, halfW), px, lit) : vec3(0.0);
    col += mix(ra, rb, k) * exp(-yr * 7.0) * 0.35 * straight;
    col += pal(0.6) * exp(-abs(p.y + 0.08) * 200.0) * 0.25 * straight;   // horizon line
  }
  fragColor = vec4(col, 1.0);
}`,
};
