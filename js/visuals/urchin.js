// Urchin — a floating sphere covered in hundreds of spikes that shoot out with the music.
// Spikes sit on a spherical Fibonacci lattice (inverse mapping after Keinert et al. / iq).
// 3.0: every spike has its own sensitivity and recovery time; the frequency zones run from lows at the bottom to
// highs at the top (as seen on screen); every measured hit drives ONE cluster (urchin-events.js): deep bass a broad
// group that shoots far out, sharp hits a compact quick group, highs only fine local motion. Some clear hits send a
// wave over the surface from their cluster. Big difference between rest and a strong hit, fast out, slower back,
// always bounded (never clipped, also in portrait). No light or brightness pulses: only the spikes move.
import { createUrchinEvents, stepUrchin, packEvents, MAXEV } from "./urchin-events.js";

const states = new WeakMap();

export default {
  id: "urchin",
  name: "Urchin",
  lyrics: { y: 0.13, big: 0.2, font: "light" },   // the sung line under the ball; the wall fills the background
  bloom: 0.35,

  uniforms({ gl, loc, frame }) {
    let st = states.get(gl);
    if (!st) { st = { ev: createUrchinEvents(), A: new Float32Array(MAXEV * 4), B: new Float32Array(MAXEV * 4), last: null }; states.set(gl, st); }
    const t = frame.time ?? 0, dt = st.last === null ? 0 : Math.max(0, Math.min(0.1, t - st.last));
    st.last = t;
    stepUrchin(st.ev, frame.audio, dt);
    packEvents(st.ev, st.A, st.B);
    if (loc.uEvA) gl.uniform4fv(loc.uEvA, st.A);
    if (loc.uEvB) gl.uniform4fv(loc.uEvB, st.B);
  },

  frag: /* glsl */ `
uniform vec4 uEvA[6];   // event direction (view space) + age in seconds
uniform vec4 uEvB[6];   // strength, cluster radius (rad), wave 0/1, kind 0 bass / 1 sharp
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

vec3 gUp; vec3 gEvDir[6];

// Each spike: its own sensitivity, its own recovery time, a pitch from its height on screen (lows at the bottom,
// highs at the top, with a soft noisy overlap). Hits act on clusters (events), not on every spike at once.
float spikeLen(vec3 q, float id) {
  float h1 = hash13(vec3(id, 1.7, 3.1)), h2 = hash13(vec3(id, 5.3, 0.7));
  float sens = 0.6 + 0.8 * h1;
  float tau = 0.15 + 0.30 * h2;                                  // neighbours recover at different speeds
  float ys = dot(q, gUp);
  float fq = clamp(0.5 + 0.42 * ys + 0.3 * (noise3(q * 2.2 + uSeed * 0.013) - 0.5), 0.0, 1.0);
  // rest: short; the own pitch only stirs a little, highs make small local groups twitch
  float raw = 0.06 + 0.22 * pow(band(fq), 1.8) * sens;
  float grp = smoothstep(0.55, 0.75, noise3(q * 5.0 + vec3(0.0, uTime * 0.4, 0.0)));
  raw += 0.55 * flux(fq) * sens * mix(0.25, 1.0, grp) * smoothstep(0.35, 0.7, fq);
  for (int i = 0; i < 6; i++) {
    float s = uEvB[i].x;
    if (s <= 0.0) continue;
    float age = uEvA[i].w, rad = uEvB[i].y, sharp = uEvB[i].w;
    float cd = dot(q, gEvDir[i]);
    if (cd < -0.2 && uEvB[i].z < 0.5) continue;               // far side of a cluster without wave: no effect
    float ang = sqrt(max(0.0, 2.0 * (1.0 - cd))) * (1.0 + 0.08 * (1.0 - cd));   // cheap arc length (no acos)
    float cl = exp(-pow(ang / rad, 2.0) * 2.0);
    float att = smoothstep(0.0, mix(0.04, 0.025, sharp), age);   // fast out (the first cluster reacts at once)
    float rel = exp(-age / (tau * mix(1.0, 0.7, sharp)));      // a little slower back, per spike
    raw += s * mix(2.6, 1.7, sharp) * sens * cl * att * rel;
    if (uEvB[i].z > 0.5) {                                      // a wave travelling over the surface from the cluster
      float front = rad * 0.5 + age * mix(3.2, 4.5, sharp);
      float ring = exp(-pow((ang - front) / 0.25, 2.0)) * step(rad * 0.4, ang);
      raw += s * 1.3 * sens * ring * exp(-age / 0.7);
    }
  }
  raw += uDrop * 0.4;
  raw *= 1.0 - 0.75 * uRest;                                     // a pause: the spikes withdraw
  float jitter = 0.85 + 0.3 * h2;
  // smooth saturation keeps every tip inside the bounding sphere (R + 0.86 ≤ 1.40)
  return 0.05 + 0.81 * (1.0 - exp(-raw * jitter));
}

float map(vec3 p) {
  float r = length(p);
  vec3 n = p / max(r, 1e-4);
  vec4 s = sfNearest(n, NSPIKES);
  float L = spikeLen(s.xyz, s.w);
  float dSpike = sdRoundCone(p, s.xyz * R * 0.9, s.xyz * (R + L), 0.035, 0.0035);
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
  gUp = orient() * vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < 6; i++) gEvDir[i] = orient() * normalize(uEvA[i].xyz + vec3(0.0, 0.0, 1e-4));
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
