// Tunnel — Milkdrop-style feedback: last frame is zoomed, twisted and hue-shifted, then a new
// waveform ring is drawn on top. Uses uPrev (this visual's previous frame).

export default {
  id: "tunnel",
  name: "Tunnel",
  bloom: 1.0,
  feedback: true,
  frag: /* glsl */ `
vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 cuv = uv - 0.5; cuv.x *= aspect;

  // feedback transform
  float frames = clamp(uDelta * 60.0, 0.0, 6.0);
  float zoom = pow(1.0 / (1.018 + uDrop * 0.1), frames);
  float twist = 0.006 + sin(uTime * 0.2) * 0.004;
  vec2 f = rot(twist * frames) * cuv * zoom;
  f += frames * 0.001 * vec2(sin(f.y * 9.0 + uTime), cos(f.x * 9.0 - uTime * 0.8)) * (0.5 + uEnergy);
  f.x /= aspect;
  vec3 prev = texture(uPrev, f + 0.5).rgb;
  prev = max(vec3(0.0), hueShift(prev, (0.008 + uHat * 0.02) * frames)) * pow(0.935 - uDrop * 0.1, frames);

  // new ring
  vec2 p = P();
  float r = length(p);
  float a = atan(p.y, p.x);
  float R = 0.08 + uLevel * 0.12 + uKick * 0.03;
  float w = wave(a / TAU + 0.5);
  float d = abs(r - R * (1.0 + w * 0.45));
  float px = 1.5 / min(uRes.x, uRes.y);
  float ring = 1.0 - smoothstep(0.0, px * 2.5 + 0.003, d);
  ring += exp(-d * 90.0) * 0.35;
  vec3 c = pal(0.45 + 0.4 * sin(uTime * 0.4 + a));
  vec3 col = max(prev, c * ring * (0.9 + uKick));

  // centre spark
  col += pal(0.8) * exp(-r * 60.0) * uKick * 0.6;
  fragColor = vec4(min(col, vec3(3.0)), 1.0);
}`,
};
