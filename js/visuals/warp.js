// Warp — a starfield rushing towards you; stars stretch into streaks with speed and
// a hyperspace jump fires on every new track (uDrop).

export default {
  id: "warp",
  name: "Warp",
  bloom: 1.2,
  frag: /* glsl */ `
vec3 layer(vec2 uv, vec2 dir, float streak, float seed) {
  vec2 id = floor(uv), gv = fract(uv) - 0.5;
  vec3 col = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y);
    vec2 h = hash22(id + o + seed);
    vec2 v = gv - o - (h - 0.5) * 0.8;
    float vr = dot(v, dir), vt = dot(v, vec2(-dir.y, dir.x));
    float d = length(vec2(vr / (1.0 + streak), vt));
    float size = 0.008 + h.x * 0.018;
    float star = size / max(d, 1e-3);
    star = min(star * star, 2.5) * smoothstep(0.5, 0.0, d);
    vec3 tint = mix(vec3(1.0), mix(uPal[1], uPal[2], h.y), 0.5 + 0.5 * h.x);
    col += tint * star * step(0.55, hash12(id + o + seed * 3.1));
  }
  return col;
}

void main() {
  vec2 p = P();
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  float speed = 0.35 + uEnergy * 0.9 + uKick * 0.9 + uDrop * 6.0;
  float streak = speed * 2.2 * r * 3.0;

  vec3 col = uPal[0] * 0.2;
  // nebula
  float n = fbm2(vec2(atan(p.y, p.x) * 1.5, log(r + 0.05) * 2.0 - uTravel * 0.3));
  col += pal(0.45) * n * n * 0.22 * smoothstep(0.0, 0.6, r);
  col += pal(0.7) * exp(-r * 8.0) * (0.15 + uKick * 0.3);

  const float LAYERS = 5.0;
  for (float i = 0.0; i < LAYERS; i++) {
    float depth = fract(i / LAYERS + uTravel * 0.12);
    float scale = mix(20.0, 2.2, depth);
    float fade = depth * smoothstep(1.0, 0.85, depth);
    col += layer(p * scale + i * 37.3, dir, streak * depth, i * 17.0) * fade;
  }
  fragColor = vec4(col, 1.0);
}`,
};
