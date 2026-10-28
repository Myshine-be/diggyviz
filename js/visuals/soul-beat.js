// Soul Beat — tribute to the old Pioneer DJ visuals: a glowing white moon-disc with a dark
// living ferrofluid (six melting metaballs) that splits droplets on kicks, grows spikes on high notes and drips. Track title is shown
// above it in spaced lowercase (caption).

export default {
  id: "soulbeat",
  name: "Soul Beat",
  lyrics: { y: 0.11, font: "light" },
  bloom: 0.22,
  caption: true,
  frag: /* glsl */ `
// A living ferrofluid: six metaballs drift around each other on slow, never-repeating paths and melt together.
// Lows give mass (they swell and merge), highs grow fine spikes along the edge in their own direction around the
// blob, a kick throws a droplet off that floats back, a snare ripples the skin, new notes (flux) shoot spikes.
float fluidBall(int k, out vec2 c) {
  float fk = float(k), t = uSongTime * 0.21 + uTime * 0.035;
  float a = fk * 1.047 + t * (0.6 + 0.13 * fk) + 0.7 * sin(t * 0.37 + fk * 2.1);
  float r = 0.05 + 0.085 * (0.5 + 0.5 * sin(t * 0.53 + fk * 1.7)) + 0.04 * histSmooth(0.3 + 0.1 * fk, 0.05);
  c = vec2(cos(a), sin(a) * 0.82) * r + vec2(0.0, 0.035);
  float low = histSmooth(0.03 + 0.03 * fk, 0.0);
  return 0.04 + 0.034 * low + 0.008 * sin(t * 1.3 + fk);
}

float blobSDF(vec2 q, out float ang) {
  vec2 c; float d = 1e3; vec2 mass = vec2(0.0);
  for (int k = 0; k < 6; k++) {
    float r = fluidBall(k, c);
    d = smin(d, length(q - c) - r, 0.075);
    mass += c;
  }
  mass /= 6.0;
  vec2 rel = q - mass;
  ang = atan(rel.y, rel.x);
  // highs: ferrofluid spikes; every direction listens to its own pitch (around the blob = low → high → low)
  float fa = 0.35 + 0.6 * abs(fract(ang / TAU + 0.5) * 2.0 - 1.0);
  float hi = histSmooth(fa, 0.0) * 0.8 + flux(fa) * 0.9;
  float rot = uSongTime * 0.12;
  float sp = pow(abs(sin(ang * 13.0 + rot)), 14.0) + 0.7 * pow(abs(sin(ang * 21.0 - rot * 1.3)), 22.0);
  float near = 1.0 - smoothstep(-0.01, 0.035, d);
  d -= sp * (0.004 + 0.034 * hi + 0.01 * uDrop) * near;
  // snare: a ripple runs over the skin
  d += sin(length(rel) * 140.0 - uTime * 18.0) * 0.0025 * uSnare * near;
  // kick: a droplet splits off in a new direction every kick and floats back as the kick fades
  float ka = hash12(vec2(uKickN, 4.1)) * TAU;
  float out_ = 0.16 * sqrt(clamp(uKick, 0.0, 1.0));
  vec2 dc = mass + vec2(cos(ka), sin(ka)) * (0.07 + out_);
  d = smin(d, length(q - dc) - (0.012 + 0.016 * uKick), 0.035 + 0.04 * (1.0 - uKick));
  // a second, smaller droplet on snares, opposite side
  float sa = hash12(vec2(uSnareN, 8.3)) * TAU;
  vec2 sc = mass + vec2(cos(sa), sin(sa)) * (0.075 + 0.1 * sqrt(clamp(uSnare, 0.0, 1.0)));
  d = smin(d, length(q - sc) - 0.009 * (0.4 + uSnare), 0.03);

  d += (noise2(q * 90.0 + uTime * 0.6) - 0.5) * 0.003;            // soft fuzzy edge
  return d;
}

void main() {
  vec2 p = P();
  vec2 c = vec2(0.0, -0.03);
  float R = 0.37;
  vec2 q = p - c;
  float r = length(q);
  float px = 1.5 / min(uRes.x, uRes.y);

  // backdrop: warm grey studio wall
  vec3 wall = vec3(0.24, 0.24, 0.235) * (1.0 - dot(p, p) * 0.35);
  wall = mix(wall, wall * (0.8 + 0.4 * uPal[1]), 0.2);
  float halo = exp(-max(r - R, 0.0) * 34.0);
  vec3 col = wall + vec3(1.0, 0.95, 0.72) * halo * (0.5 + 0.2 * uEnergy);

  // the moon-disc
  float disc = 1.0 - smoothstep(R - px, R + px, r);
  vec3 light = mix(vec3(1.25, 1.25, 1.18), vec3(1.02, 1.03, 0.94), smoothstep(0.0, R, r));
  light += 0.025 * sin(r * 160.0 - uTime * 0.5);
  float floorY = -0.22;
  light = mix(light, vec3(1.0), (1.0 - smoothstep(floorY - 0.004, floorY + 0.004, q.y)) * 0.45);
  light = mix(light, light * (0.92 + 0.12 * uPal[2]), 0.35);

  // blob
  float ang;
  float d = blobSDF(q, ang);
  float body = 1.0 - smoothstep(-px, px, d);
  // glossy liquid: a soft rim, a moving specular sheen from the top-left light, a hint of the cover colour
  vec2 g = vec2(dFdx(d), dFdy(d)); vec2 nrm = normalize(g + 1e-6);
  float rim = smoothstep(-0.045, 0.0, d);
  float spec = pow(max(dot(nrm, normalize(vec2(-0.6, 0.8))), 0.0), 6.0) * rim;
  float swirl = noise2(q * 7.0 + vec2(uTime * 0.12, -uTime * 0.08));
  vec3 ink = vec3(0.025, 0.025, 0.03) + uPal[0] * 0.25;
  ink += mix(uPal[1], vec3(1.0), 0.35) * (0.10 * rim + 0.22 * spec) * (0.7 + 0.6 * swirl);
  vec3 inner = mix(light, ink, body);
  // contact shadow under the blob
  inner *= 1.0 - 0.18 * exp(-max(d, 0.0) * 30.0) * (1.0 - body);

  // drips falling to the floor
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    float h1 = hash12(vec2(fi, 3.7)), h2 = hash12(vec2(fi, 9.1));
    float speed = 0.05 + h2 * 0.08;
    float life = fract(uSongTime * speed + h1);
    vec2 start = vec2((h1 - 0.5) * 0.3, -0.05 + h2 * 0.04);
    vec2 pos = start + vec2(sin(fi * 7.0 + life * 3.0) * 0.01, -life * life * 0.24);
    pos.y = max(pos.y, floorY + 0.002);
    float size = (0.0018 + h2 * 0.004) * (1.0 + uKick * 0.6);
    float dot_ = 1.0 - smoothstep(size - px, size + px, length(q - pos));
    inner = mix(inner, vec3(0.12), dot_ * 0.85);
  }

  col = mix(col, inner, disc);
  fragColor = vec4(col, 1.0);
}`,
};
