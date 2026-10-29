// Soul Beat — ink in glass: a clear glass sphere holding dark, rich liquid ink. Several ink masses drift through the
// whole volume on their own slow currents (motion after the first Chrome visual, 4b68807:js/visuals/chrome.js:
// independent Lissajous paths, melting with smin), merge and part again. There is no centre: no magnet, no vortex,
// no recurring blob in the middle; the glass is only the boundary. Every mass listens to its own frequency range:
// bass = broad pressure waves, a kick bulges/stretches ONE mass and it recovers smoothly, snares and sharp hits pull
// thin tendrils and drops loose, mids/highs ripple the edges, a pause lets the ink come to rest. Material: near-black
// ink with slightly translucent edges in the cover colours, restrained glass reflections; no white flashes.
// Track title is shown above it in spaced lowercase (caption).

export default {
  id: "soulbeat",
  name: "Soul Beat",
  lyrics: { y: 0.11, font: "light" },
  bloom: 0.22,
  caption: true,
  frag: /* glsl */ `
const int NM = 7;
const float RG = 0.74;            // glass radius
float RIN;                        // inner boundary of the ink
float gT;                         // flow time
vec3 gKickDir, gSnDir; int gKick, gSnare;

vec3 massPos(int i) {
  float fi = float(i), t = gT;
  // own spherical path per mass, spread through the volume (Lissajous like the first Chrome visual)
  float th = t * (0.11 + 0.035 * fi) + fi * 2.07 + 0.7 * sin(t * 0.19 + fi * 1.3);
  float ph = 1.57 + 1.15 * sin(t * (0.09 + 0.02 * fi) + fi * 1.71);
  float r = RIN * (0.36 + 0.26 * (0.5 + 0.5 * sin(t * 0.15 + fi * 2.3)));
  return vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)) * r;
}
float massLevel(int i) {            // every mass listens to its own frequency range (0 = lows … 6 = highs)
  float f = (float(i) + 0.5) / float(NM) * 0.92;
  return smoothstep(0.06, 0.62, histSmooth(f, 0.0)) + 0.6 * flux(f);
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

float inkMap(vec3 p) {
  float d = 1e3;
  float bass = smoothstep(0.05, 0.6, histSmooth(0.04, 0.0));
  for (int i = 0; i < NM; i++) {
    vec3 c = massPos(i);
    float L = massLevel(i) * (1.0 - 0.8 * uRest);
    float fi = float(i);
    float r = 0.10 + 0.045 * L;
    vec3 q = p - c;
    // every mass is stretched along its own slowly turning axis: irregular, never a perfect ball
    vec3 ax = normalize(vec3(sin(gT * 0.31 + fi), cos(gT * 0.23 + fi * 2.1), sin(gT * 0.17 + fi * 3.3)));
    q -= ax * dot(q, ax) * (0.3 + 0.15 * sin(gT * 0.4 + fi * 1.7));
    if (i == gKick) {                                     // kick: this mass bulges and stretches, then recovers
      float k = clamp(uKick, 0.0, 1.0) * (1.0 - 0.8 * uRest);
      float along = dot(q, gKickDir);
      q -= gKickDir * along * (0.55 * k / (1.0 + 0.55 * k));
      r *= 1.0 + 0.35 * k;
    }
    float di = length(q) - r;
    if (i == gSnare) {                                    // snare / sharp hit: a thin tendril and a drop that lets go
      float sn = clamp(uSnare, 0.0, 1.0) * (1.0 - 0.8 * uRest);
      vec3 base = c + gSnDir * r * 0.7;
      vec3 tip = base + gSnDir * (0.05 + 0.26 * sqrt(sn));
      di = smin(di, sdCapsule(p, base, tip, 0.03 * (0.4 + sn), 0.006), 0.04);
      vec3 drop = base + gSnDir * (0.12 + 0.36 * (1.0 - sn));
      di = smin(di, length(p - drop) - 0.028 * sqrt(sn), 0.025);
    }
    d = smin(d, di, 0.12);
  }
  // bass: broad, slow pressure waves through the whole ink
  vec3 fl = vec3(0.0, gT * 0.35, gT * 0.2);
  d += (noise3(p * 2.6 + fl) - 0.5) * (0.07 + 0.13 * bass) + (noise3(p * 6.3 - fl * 1.3) - 0.5) * 0.035;
  // mids and highs: small ripples along the edges
  float hi = smoothstep(0.05, 0.6, histSmooth(0.6, 0.0)) + flux(0.7);
  d += (noise3(p * 13.0 + fl * 3.0) - 0.5) * 0.016 * clamp(hi, 0.0, 1.2);
  // the glass is the boundary, not a funnel: ink flattens softly against it
  d = -smin(-d, -(length(p) - RIN), 0.06);
  return d;
}
vec3 inkNormal(vec3 p) {
  const vec2 e = vec2(0.004, -0.004);
  return normalize(e.xyy * inkMap(p + e.xyy) + e.yyx * inkMap(p + e.yyx) + e.yxy * inkMap(p + e.yxy) + e.xxx * inkMap(p + e.xxx));
}
// soft studio around the glass: a dark room in the cover colour, two dim softboxes (restrained reflections)
vec3 studio(vec3 r) {
  vec3 c = mix(uPal[0] * 0.10, uPal[0] * 0.30 + 0.02, smoothstep(-0.4, 0.8, r.y));
  float az = atan(r.z, r.x);
  c += mix(uPal[1], vec3(1.0), 0.5) * exp(-pow(r.y - 0.55, 2.0) * 28.0 - pow(az - 1.0, 2.0) * 5.0) * 0.6;
  c += mix(uPal[2], vec3(1.0), 0.45) * exp(-pow(r.y - 0.15, 2.0) * 60.0 - pow(az + 2.2, 2.0) * 8.0) * 0.35;
  return c;
}

void main() {
  vec2 p = P();
  RIN = RG * 0.93;
  gT = uTime * 0.45 + uSongTime * 0.05;
  gKick = int(floor(hash12(vec2(uKickN, 3.1)) * float(NM)));
  gSnare = int(floor(hash12(vec2(uSnareN, 7.7)) * float(NM)));
  float ka = hash12(vec2(uKickN, 5.3)) * TAU, kb = hash12(vec2(uKickN, 9.4)) * 2.0 - 1.0;
  gKickDir = normalize(vec3(cos(ka) * sqrt(1.0 - kb * kb), kb, sin(ka) * sqrt(1.0 - kb * kb)));
  float sa = hash12(vec2(uSnareN, 1.9)) * TAU, sb = hash12(vec2(uSnareN, 6.2)) * 2.0 - 1.0;
  gSnDir = normalize(vec3(cos(sa) * sqrt(1.0 - sb * sb), sb, sin(sa) * sqrt(1.0 - sb * sb)));

  vec3 ro = vec3(0.0, -0.1, 2.9);
  vec3 rd = normalize(vec3(p, -1.6));
  float px = 1.5 / min(uRes.x, uRes.y);

  // background: dark room, soft pool of light and a contact shadow under the glass
  vec3 col = mix(uPal[0] * 0.12 + 0.008, uPal[0] * 0.32 + 0.015, smoothstep(-0.6, 0.6, p.y));
  col *= 1.0 - 0.55 * exp(-pow((p.y + 0.43) * 9.0, 2.0) - p.x * p.x * 9.0);

  // the glass sphere
  float b = dot(ro, rd), c = dot(ro, ro) - RG * RG, h = b * b - c;
  if (h > 0.0) {
    float t0 = -b - sqrt(h), t1 = -b + sqrt(h);
    vec3 pe = ro + rd * t0, ne = normalize(pe);
    float cosi = clamp(dot(ne, -rd), 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
    vec3 ri = refract(rd, ne, 1.0 / 1.33);              // a little lens effect: the ink looks fuller
    // clear liquid: what lies behind, slightly darkened and tinted
    // softly back-lit liquid in the cover colours, so the dark ink reads against it
    vec3 inside = col * 0.6 + mix(uPal[1], uPal[2], 0.5 + 0.5 * ri.y) * (0.10 + 0.06 * (1.0 - length(pe.xy) / RG));
    // march the ink inside the glass
    float ti = 0.0, tEnd = (t1 - t0) * 1.05;
    bool hit = false; vec3 pos = pe;
    for (int i = 0; i < 72; i++) {
      pos = pe + ri * ti;
      float d = inkMap(pos);
      if (d < 0.0015) { hit = true; break; }
      ti += max(d * 0.85, 0.004);
      if (ti > tEnd) break;
    }
    if (hit) {
      vec3 n = inkNormal(pos);
      float edge = pow(1.0 - clamp(dot(n, -ri), 0.0, 1.0), 2.2);
      // thin parts let a little light through (tendrils, drops, edges): cover colours, never white
      float thin = clamp(inkMap(pos - n * 0.07) / 0.07 + 0.5, 0.0, 1.0);
      vec3 ink = vec3(0.010, 0.010, 0.016) + uPal[0] * 0.10;
      ink += mix(uPal[1], uPal[2], 0.5 + 0.5 * n.y) * (0.22 * edge + 0.28 * thin * edge);
      ink += uPal[3] * 0.05 * thin;
      vec3 l = normalize(vec3(-0.5, 0.8, 0.6));
      ink += mix(uPal[1], vec3(1.0), 0.4) * pow(max(dot(reflect(ri, n), l), 0.0), 12.0) * 0.12;   // soft liquid sheen
      // a hint of depth: ink further back sinks into the liquid
      float depth = smoothstep(-RG, RG, pos.z);
      inside = mix(inside, ink, mix(0.75, 1.0, depth));
    }
    // glass: fresnel reflection of the dim studio, a fine rim, a soft caustic on the floor side
    vec3 refl = studio(reflect(rd, ne));
    vec3 glass = mix(inside, refl, fres * 0.85) + refl * 0.04;
    float rim = smoothstep(0.25, 0.0, cosi);
    glass += mix(uPal[1], vec3(1.0), 0.3) * rim * 0.22;
    glass += mix(uPal[1], vec3(1.0), 0.6) * pow(max(dot(reflect(rd, ne), normalize(vec3(-0.5, 0.75, 0.45))), 0.0), 70.0) * 0.4;
    float aa = smoothstep(0.0, px * 2.0, h / max(abs(b), 1e-3));
    col = mix(col, glass, aa);
  }
  col += uPal[1] * 0.03 * exp(-dot(p, p) * 3.0);
  fragColor = vec4(col, 1.0);
}`,
};
