// Glass Orb — a see-through sphere with a fine mesh of lines; waves roll over the surface.

export default {
  id: "glass",
  name: "Glass Orb",
  bloom: 0.7,
  frag: /* glsl */ `
mat3 orient() {
  float a = uTime * 0.11, b = 0.35 + sin(uTime * 0.07) * 0.25;
  mat3 ry = mat3(cos(a), 0, sin(a), 0, 1, 0, -sin(a), 0, cos(a));
  mat3 rx = mat3(1, 0, 0, 0, cos(b), -sin(b), 0, sin(b), cos(b));
  return rx * ry;
}

// Wave field on the sphere (object space unit normal m)
float field(vec3 m) {
  float lat = acos(clamp(m.y, -1.0, 1.0));
  float lon = atan(m.z, m.x);
  float t = uSongTime;
  float w = 0.0;
  w += sin(lat * 9.0 - t * 2.1) * (0.25 + band(0.08) * 0.9);
  w += sin(lon * 5.0 + lat * 3.0 + t * 1.3) * (0.15 + band(0.45) * 0.6);
  w += sin(dot(m, normalize(vec3(0.7, 0.2, -0.6))) * 26.0 - t * 5.0) * uHat * 0.5;
  w += sin(lat * 30.0 - uTime * 10.0) * uKick * exp(-lat * 0.8) * 0.9;
  w += uDrop * sin(lat * 18.0 - uTime * 14.0);
  w += sin(lat * 24.0 - uTime * 12.0) * uPunch * 0.9 + sin(lat * 12.0 - uTime * 20.0) * uBoom * 1.2;
  return w;
}

vec3 shell(vec3 n, vec3 rd, mat3 o, float facing) {
  vec3 m = n * o;               // world → object
  float w = field(m);
  float lat = acos(clamp(m.y, -1.0, 1.0));
  float lon = atan(m.z, m.x);
  float lines = gridLine(lat * 46.0 / PI + w * 0.35, 0.06);
  float meridians = gridLine(lon * 30.0 / TAU + w * 0.08, 0.05) * 0.45;
  float diag = gridLine((lat * 0.7 + lon * 0.45) * 12.0 / PI + w * 0.2, 0.04) * 0.25;
  float fres = pow(1.0 - abs(dot(n, rd)), 2.6);
  float mesh = (lines + meridians + diag) * (0.25 + 0.75 * smoothstep(-1.0, 1.0, w)) ;
  vec3 tint = mix(pal(0.5), uPal[2], 0.25);
  vec3 col = tint * mesh * (0.35 + 0.9 * fres) * facing;
  col += tint * fres * 0.4 * facing;
  vec3 l = normalize(vec3(-0.5, 0.8, 0.6));
  col += vec3(1.0) * pow(max(dot(reflect(rd, n), l), 0.0), 60.0) * 0.8 * facing;
  return col;
}

void main() {
  vec2 p = P();
  vec3 ro = vec3(0.0, 0.0, 2.6);
  vec3 rd = normalize(vec3(p, -1.45));
  float R = 0.6 * (1.0 + uKick * 0.035 + uPunch * 0.09 + uBoom * 0.08 + uDrop * 0.06);
  mat3 o = orient();

  vec3 col = uPal[0] * 0.25 + pal(0.5) * 0.05 * exp(-dot(p, p) * 4.0);
  float b = dot(ro, rd), c = dot(ro, ro) - R * R, h = b * b - c;
  if (h > 0.0) {
    h = sqrt(h);
    float t0 = -b - h, t1 = -b + h;
    vec3 pf = ro + rd * t0, pb = ro + rd * t1;
    vec3 nf = normalize(pf), nb = normalize(pb);
    float thick = (t1 - t0) / (2.0 * R);
    // interior haze
    col += mix(uPal[0], pal(0.45), 0.5) * thick * 0.22;
    // back wall seen through the glass (normal flipped to face the viewer)
    col += shell(nb, rd, o, 0.32);
    // front surface
    col += shell(nf, rd, o, 1.0);
  } else {
    // soft halo
    float d = length(p) - R * 0.52;
    col += pal(0.5) * exp(-max(d, 0.0) * 18.0) * 0.12 * (0.6 + uEnergy);
  }
  fragColor = vec4(col, 1.0);
}`,
};
