// Chrome — liquid metal blobs that merge and split; the album art is reflected in the surface.

export default {
  id: "chrome",
  name: "Chrome",
  bloom: 0.7,
  frag: /* glsl */ `
float map(vec3 p) {
  float t = uSongTime * 0.45 + uTime * 0.08;
  float d = 1e9;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 c = vec3(sin(t * (0.7 + fi * 0.13) + fi * 1.9),
                  cos(t * (0.6 + fi * 0.11) + fi * 2.7),
                  sin(t * (0.5 + fi * 0.17) + fi * 0.8)) * (0.38 + 0.1 * band(fi / 6.0));
    float r = 0.2 + band(fi / 6.0) * 0.12 + uKick * 0.04 + uDrop * 0.05;
    d = smin(d, length(p - c) - r, 0.3);
  }
  d += sin(p.x * 11.0 + uTime * 2.0) * sin(p.y * 13.0 - uTime * 1.7) * sin(p.z * 9.0) * 0.012 * (0.3 + uHat * 2.0);
  return d;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0012, -0.0012);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// Studio environment: dark floor, album art wrapped around the horizon, two softbox lights.
vec3 env(vec3 r) {
  float az = atan(r.z, r.x);
  vec3 art = texture(uArt, vec2(az / TAU + 0.5, clamp(r.y * 0.9 + 0.5, 0.02, 0.98))).rgb;
  vec3 floorC = uPal[0] * 0.12 + 0.01;
  vec3 sky = mix(art * 0.85, vec3(0.06) + uPal[1] * 0.08, smoothstep(0.15, 0.8, r.y));
  vec3 c = mix(floorC, sky, smoothstep(-0.03, 0.03, r.y));
  c += vec3(1.0) * smoothstep(0.012, 0.0, abs(r.y)) * 0.6;                         // horizon line
  float box1 = smoothstep(0.12, 0.08, abs(r.y - 0.55)) * smoothstep(0.5, 0.35, abs(az - 0.6));
  float box2 = smoothstep(0.05, 0.03, abs(r.y - 0.3)) * smoothstep(0.25, 0.15, abs(az + 2.0));
  c += vec3(1.0, 0.98, 0.95) * (box1 * 2.2 + box2 * 1.4);
  return c;
}

void main() {
  vec2 p = P();
  vec3 ro = vec3(0.0, 0.0, 2.8);
  vec3 rd = normalize(vec3(p, -1.5));
  float a = uTime * 0.07;
  mat3 ry = mat3(cos(a), 0, sin(a), 0, 1, 0, -sin(a), 0, cos(a));
  ro = ry * ro; rd = ry * rd;

  vec3 col = mix(uPal[0] * 0.2, uPal[0] * 0.55 + 0.02, smoothstep(-0.6, 0.6, p.y));
  col += texture(uArt, vec2(0.5) + p * 0.15).rgb * 0.05;

  float t = 0.6;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    float d = map(ro + rd * t);
    if (d < 0.0008 * t) { hit = true; break; }
    t += d * 0.9;
    if (t > 6.0) break;
  }
  if (hit) {
    vec3 pos = ro + rd * t;
    vec3 n = calcNormal(pos);
    vec3 r = reflect(rd, n);
    float fres = 0.55 + 0.45 * pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    vec3 c = env(r) * fres;
    vec3 l = normalize(vec3(0.4, 0.9, 0.5));
    c += vec3(1.0) * pow(max(dot(r, l), 0.0), 90.0) * 2.0;
    c *= mix(vec3(1.0), uPal[2], 0.15);
    col = c;
  }
  fragColor = vec4(col, 1.0);
}`,
};
