// Urchin — a floating sphere covered in hundreds of spikes that shoot out with the music.
// Spikes sit on a spherical Fibonacci lattice (inverse mapping after Keinert et al. / iq).

export default {
  id: "urchin",
  name: "Urchin",
  bloom: 0.55,
  frag: /* glsl */ `
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
float gTip;

mat3 orient() {
  float a = uTime * 0.13 + uSongTime * 0.05, b = uTime * 0.09;
  mat3 ry = mat3(cos(a), 0, sin(a), 0, 1, 0, -sin(a), 0, cos(a));
  mat3 rx = mat3(1, 0, 0, 0, cos(b), -sin(b), 0, sin(b), cos(b));
  return rx * ry;
}

float spikeLen(vec3 q, float id) {
  float lat = abs(q.y);
  float f = noise3(q * 2.2 + vec3(0.0, uSongTime * 0.7, uTime * 0.2));
  float b = band(1.0 - lat);
  float jitter = 0.8 + 0.4 * hash13(vec3(id, 1.7, 3.1));
  float e = max(uEnergy, 0.12);
  float raw = (0.10 + e * (0.18 + 0.75 * b * f) + uKick * 0.22 * f + uPunch * 0.55 * (0.4 + f) + uBoom * 0.7 + uDrop * 0.4 * f) * jitter;
  // Smooth saturation keeps every tip inside the bounding sphere, even on a track change.
  return 0.08 + 0.78 * (1.0 - exp(-raw));
}

float map(vec3 p) {
  float r = length(p);
  vec3 n = p / max(r, 1e-4);
  vec4 s = sfNearest(n, NSPIKES);
  float L = spikeLen(s.xyz, s.w);
  float dSpike = sdRoundCone(p, s.xyz * R * 0.9, s.xyz * (R + L), 0.035, 0.0035);
  float dCore = r - R;
  gTip = clamp((dot(p, s.xyz) - R) / L, 0.0, 1.0);
  return smin(dCore, dSpike, 0.035);
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

void main() {
  vec2 p = P();
  // The core may grow at most 0.08 so R stays <= 0.54 (see the camera note below).
  R = 0.46 + min(0.08, max(uKick * 0.03, uPunch * 0.05) + uDrop * 0.05);
  // Max extent is R(0.54) + L(0.86) = 1.40; with a 0.37 half-FOV tangent that fits the
  // portrait width from distance >= 4.03. 4.05 keeps the orb as large as possible.
  vec3 ro = vec3(0.0, 0.0, 4.05);
  vec3 rd = normalize(vec3(p, -1.35));
  mat3 o = orient();
  ro = o * ro; rd = o * rd;

  vec3 bg = uPal[0] * 0.35 + pal(0.4) * 0.09 * exp(-dot(p, p) * 3.0) * (0.5 + uEnergy);
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
      t += d * 0.72;
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
      col += mix(uPal[1], uPal[2], 0.25) * pow(tip, 3.0) * (0.35 + 0.75 * uEnergy + 0.35 * uKick);
      col += uPal[1] * rim * 0.25 * tip;
    }
  }
  col += uPal[1] * glow * (0.35 + 0.7 * uEnergy);
  fragColor = vec4(col, 1.0);
}`,
};
