// Urchin — a floating sphere covered in hundreds of spikes that shoot out with the music.
// Spikes sit on a spherical Fibonacci lattice (inverse mapping after Keinert et al. / iq).
// 3.0: every spike has its own sensitivity and recovery time; the frequency zones run from lows at the bottom to
// highs at the top (as seen on screen); every measured hit drives ONE cluster (urchin-events.js): deep bass a broad
// group that shoots far out, sharp hits a compact quick group, highs only fine local motion. Some clear hits send a
// wave over the surface from their cluster. Big difference between rest and a strong hit, fast out, slower back,
// always bounded (never clipped, also in portrait). No light or brightness pulses: only the spikes move.
import { createUrchinEvents, stepUrchin, spikeLengths, NSPIKES } from "./urchin-events.js";
import { toHalf } from "./dune-ridges.js";

const states = new WeakMap();

export default {
  id: "urchin",
  name: "Urchin",
  lyrics: { land: { x: 0.03, y: 0.5, align: "left", width: 0.22 }, port: { y: 0.12 }, font: "light" },   // beside / under the ball, never over it
  bloom: 0.35,

  uniforms({ gl, loc, frame }) {
    let st = states.get(gl);
    if (!st || !gl.isTexture(st.tex)) {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, NSPIKES, 1, 0, gl.RED, gl.HALF_FLOAT, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      st = { tex, ev: st?.ev || createUrchinEvents(), len: new Float32Array(NSPIKES), half: new Uint16Array(NSPIKES), last: st?.last ?? null };
      states.set(gl, st);
    }
    const t = frame.time ?? 0, dt = st.last === null ? 0 : Math.max(0, Math.min(0.1, t - st.last));
    st.last = t;
    stepUrchin(st.ev, frame.audio, dt);
    // every spike's length, once per frame on the CPU (≈ 0.5 ms) instead of per pixel per raymarch step on the GPU
    spikeLengths(st.ev, frame, st.len);
    for (let i = 0; i < NSPIKES; i++) st.half[i] = toHalf(st.len[i]);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, st.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NSPIKES, 1, gl.RED, gl.HALF_FLOAT, st.half);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    if (loc.uSpikeL) gl.uniform1i(loc.uSpikeL, 4);
  },

  frag: /* glsl */ `
uniform sampler2D uSpikeL;   // length of every spike, computed per frame in urchin-events.js (spikeLengths)
const float PHI = 1.61803398875;
const float NSPIKES = 420.0;

// Nearest point of an n-point spherical Fibonacci lattice to unit vector p. Returns (point, index).
vec4 sfNearest(vec3 p, float n) {
  float m = 1.0 - 1.0 / n;
  float phi = min(atan(p.y, p.x), PI);
  float cosTheta = p.z;
  float k = max(2.0, floor(log(n * PI * sqrt(5.0) * (1.0 - cosTheta * cosTheta)) / log(PHI * PHI)));
  float Fk = pow(PHI, k) / sqrt(5.0);
  vec2 F = vec2(round(Fk), round(Fk * PHI));
  vec2 ka = 2.0 * F / n;
  vec2 kb = 2.0 * PI * (fract((F + 1.0) * PHI) - (PHI - 1.0));
  mat2 iB = mat2(ka.y, -ka.x, kb.y, -kb.x) / (ka.y * kb.x - ka.x * kb.y);
  vec2 c = floor(iB * vec2(phi, cosTheta - m));
  float best = 8.0; vec4 res = vec4(0.0, 0.0, 1.0, 0.0);
  for (int s = 0; s < 4; s++) {
    vec2 uv = vec2(float(s - 2 * (s / 2)), float(s / 2));
    float i = clamp(dot(F, uv + c), 0.0, n - 1.0);
    float ph = 2.0 * PI * fract(i * PHI);
    float ct = m - 2.0 * i / n;
    float st = sqrt(max(0.0, 1.0 - ct * ct));
    vec3 q = vec3(cos(ph) * st, sin(ph) * st, ct);
    float d = dot(q - p, q - p);
    if (d < best) { best = d; res = vec4(q, i); }
  }
  return res;
}

float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv); float y2 = y * y * l2; float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

float R;
float gTip, gId;
vec3 gQ;

mat3 orient() {
  float a = uTime * 0.13 + uSongTime * 0.05, b = uTime * 0.09;
  mat3 ry = mat3(cos(a), 0, sin(a), 0, 1, 0, -sin(a), 0, cos(a));
  mat3 rx = mat3(1, 0, 0, 0, cos(b), -sin(b), 0, sin(b), cos(b));
  return rx * ry;
}

float map(vec3 p) {
  float r = length(p);
  vec3 n = p / max(r, 1e-4);
  vec4 s = sfNearest(n, NSPIKES);
  float L = texelFetch(uSpikeL, ivec2(int(s.w + 0.5), 0), 0).r;
  float dSpike = sdRoundCone(p, s.xyz * R * 0.9, s.xyz * (R + L), 0.035, 0.006);   // tips not thinner than about a pixel: no sparkling jaggies
  float dCore = r - R;
  gTip = clamp((dot(p, s.xyz) - R) / L, 0.0, 1.0);
  gId = s.w; gQ = s.xyz;
  return smin(dCore, dSpike, 0.035);
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

void main() {
  vec2 p = P();
  R = 0.5;                                                      // the ball itself stays calm
  // Max extent is R(0.50) + L(0.86) = 1.36 (< 1.40); with a 0.37 half-FOV tangent that fits the
  // portrait width from distance >= 4.03. 4.05 keeps the orb as large as possible.
  vec3 ro = vec3(0.0, 0.0, 4.05);
  vec3 rd = normalize(vec3(p, -1.35));
  mat3 o = orient();
  ro = o * ro; rd = o * rd;

  vec3 bg = uPal[0] * 0.35 + pal(0.4) * 0.09 * exp(-dot(p, p) * 3.0) * 0.9;
  vec3 col = bg;

  // bounding sphere
  float bR = 1.45;
  float b = dot(ro, rd), c = dot(ro, ro) - bR * bR, h = b * b - c;
  float glow = 0.0;
  if (h > 0.0) {
    float t = max(0.0, -b - sqrt(h)), tmax = -b + sqrt(h);
    float d = 1.0; int i;
    bool hit = false;
    for (i = 0; i < 110; i++) {
      vec3 pos = ro + rd * t;
      d = map(pos);
      glow += exp(-d * 28.0) * (0.15 + 0.85 * gTip) * 0.012;
      if (d < 0.0008 * t) { hit = true; break; }
      // the distance only sees the nearest spike: near the ball, cap the step so long neighbours are not skipped
      t += min(d * 0.72, length(pos) < R + 0.95 ? 0.045 : 1e3);
      if (t > tmax) break;
    }
    if (hit) {
      vec3 pos = ro + rd * t;
      vec3 n = calcNormal(pos);
      map(pos);
      float tip = gTip;
      vec3 l1 = normalize(o * vec3(0.6, 0.8, 0.6));
      float dif = clamp(dot(n, l1), 0.0, 1.0);
      float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
      float ao = 1.0 - float(i) / 110.0;
      vec3 base = mix(uPal[0] * 0.4 + 0.01, uPal[1] * 0.75, smoothstep(0.0, 0.9, tip));
      col = base * (0.1 + 0.85 * dif) * (0.35 + 0.65 * ao);
      col += mix(uPal[1], uPal[2], 0.25) * pow(tip, 3.0) * 0.45;   // steady: no brightness pulses
      col += uPal[1] * rim * 0.25 * tip;
      // no lighting on hits at all: only the spikes move (Mo: no flashes in Urchin)
    }
  }
  col += uPal[1] * min(glow, 0.6) * 0.45;                      // capped: longer spikes do not light up the picture
  fragColor = vec4(col, 1.0);
}`,
};
