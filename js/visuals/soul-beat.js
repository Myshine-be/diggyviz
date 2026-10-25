// Soul Beat — tribute to the old Pioneer DJ visuals: a glowing white moon-disc with a dark
// ferrofluid blob that grows spikes on the kick and drips particles. Track title is shown
// above it in spaced lowercase (caption).

export default {
  id: "soulbeat",
  name: "Soul Beat",
  bloom: 0.22,
  caption: true,
  frag: /* glsl */ `
float blobSDF(vec2 q, out float ang) {
  float t = uSongTime * 0.35 + uTime * 0.05;
  vec2 c0 = vec2(sin(t * 0.7) * 0.06, cos(t * 0.5) * 0.05 + 0.04);
  vec2 c1 = c0 + vec2(-0.075, 0.055) * (1.0 + 0.3 * sin(t * 1.3));
  vec2 c2 = c0 + vec2(0.07, -0.04) * (1.0 + 0.3 * cos(t * 1.1));
  vec2 c3 = c0 + vec2(sin(t * 2.0) * 0.05, -0.07);
  float s = 1.45 + uLevel * 0.45 + uKick * 0.1 + uPunch * 0.2;
  float d = length(q - c0) - 0.085 * s;
  d = smin(d, length(q - c1) - 0.05 * s, 0.07);
  d = smin(d, length(q - c2) - 0.06 * s, 0.07);
  d = smin(d, length(q - c3) - 0.035 * s * (0.6 + band(0.2)), 0.06);
  vec2 rel = q - c0;
  ang = atan(rel.y, rel.x);
  // ferrofluid spikes
  float sp = pow(abs(sin(ang * 13.0 + uSongTime * 0.4)), 18.0);
  float sp2 = pow(abs(sin(ang * 21.0 - uSongTime * 0.3)), 30.0);
  float amp = 0.006 + uKick * 0.035 + uPunch * 0.05 + uBoom * 0.05 + uDrop * 0.05 + band(0.6) * 0.012;
  d -= (sp + sp2 * 0.6) * amp * (1.0 - smoothstep(-0.01, 0.03, d));
  // fuzzy edge
  d += (noise2(q * 90.0 + uTime * 0.6) - 0.5) * 0.006;
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
  float fur = fbm2(vec2(ang * 3.0, d * 40.0) + uTime * 0.1);
  vec3 ink = mix(vec3(0.03, 0.03, 0.035), vec3(0.24, 0.24, 0.25), fur * fur * smoothstep(-0.09, 0.0, d));
  ink += uPal[1] * 0.08 * smoothstep(-0.02, 0.0, d);
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
