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
float gTip, gId;
vec3 gQ;

mat3 orient() {
  float a = uTime * 0.13 + uSongTime * 0.05, b = uTime * 0.09;
  mat3 ry = mat3(cos(a), 0, sin(a), 0, 1, 0, -sin(a), 0, cos(a));
  mat3 rx = mat3(1, 0, 0, 0, cos(b), -sin(b), 0, sin(b), cos(b));
  return rx * ry;
}

// Each spike listens to its own pitch: neighbouring spikes share a frequency region, so a note lights up a
// patch of the ball. On every kick a different ~30 % of the spikes shoots out, on every snare/clap another ~20 %.
float spikeFreq(vec3 q, float id) { return clamp(noise3(q * 1.7 + uSeed * 0.013) * 1.25 - 0.12 + 0.08 * hash13(vec3(id, 7.3, 1.1)), 0.0, 1.0); }
float kickSel(float id) { return step(hash13(vec3(id, uKickN, 3.7)), 0.30); }
float snareSel(float id) { return step(hash13(vec3(id, uSnareN + 91.0, 5.1)), 0.20); }

float spikeLen(vec3 q, float id) {
  float fq = spikeFreq(q, id);
  float jitter = 0.85 + 0.3 * hash13(vec3(id, 1.7, 3.1));
  float e = max(uEnergy, 0.12);
  float raw = 0.10 + 0.22 * e
            + 1.15 * pow(band(fq), 1.6) * e          // the level of its own pitch, with contrast
            + 1.7 * flux(fq)                         // a new note there: shoot
            + 2.7 * kickSel(id) * uKick              // kick group
            + 2.0 * snareSel(id) * uSnare            // snare / clap group
            + uDrop * 0.6;
  // Smooth saturation keeps every tip inside the bounding sphere, even on a track change.
  return 0.07 + 0.79 * (1.0 - exp(-raw * jitter));
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
  R = 0.46 + min(0.08, uKick * 0.03 + uDrop * 0.05);
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
      glow += exp(-d * 28.0) * (0.15 + 0.85 * gTip) * (0.012 + 0.006 * kickSel(gId) * uKick);
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
      col += mix(uPal[1], uPal[2], 0.25) * pow(tip, 3.0) * (0.25 + 0.45 * uEnergy);
      col += uPal[1] * rim * 0.25 * tip;
      // hits light up in colour, never white: the movement of the spikes carries the beat, not a flash
      float tk = pow(tip, 1.6);
      col += uPal[3] * kickSel(gId) * uKick * tk * 0.8;
      col += pal(0.95) * snareSel(gId) * uSnare * tk * 0.7;
      col += uPal[2] * flux(spikeFreq(gQ, gId)) * tk * 0.45;
    }
  }
  col += uPal[1] * glow * (0.3 + 0.4 * uEnergy);
  fragColor = vec4(col, 1.0);
}`,
};
