// Bubbles — a slow lava lamp of soft liquid bubbles. Big bubbles rise, wobble, melt together and split again
// (2D metaballs); their skin shows thin-film colours from the album cover, light caustics drift behind them.
// The music never flashes the screen: bass makes the bubbles fuller, a kick gives the flow a soft push upwards,
// high notes release strings of tiny pearls from the bottom. Made to keep you watching, not to startle.

export default {
  id: "bubbles",
  name: "Bubbles",
  bloom: 0.55,
  frag: /* glsl */ `
const int NB = 9;

// position and radius of big bubble k at time t (rises slowly, wraps around, sways sideways)
vec3 bubble(int k, float t, float halfW) {
  float fk = float(k);
  float h1 = hash12(vec2(fk, 1.3)), h2 = hash12(vec2(fk, 7.7)), h3 = hash12(vec2(fk, 4.1));
  float speed = 0.018 + 0.02 * h2;
  float y = fract(h1 + t * speed) * 1.7 - 0.85;
  float x = (h3 - 0.5) * halfW * 1.6 + 0.07 * sin(t * (0.21 + 0.1 * h2) + fk * 2.3) + 0.03 * sin(t * 0.53 + fk);
  float low = histSmooth(0.04 + 0.05 * h1, 0.1 + 0.15 * h2);
  float r = (0.075 + 0.07 * h2) * (0.85 + 0.45 * low) * smoothstep(0.85, 0.6, abs(y));   // shrink at the ends
  return vec3(x, y, r);
}

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float halfW = 0.5 * uRes.x / min(uRes.x, uRes.y);
  // the flow: continuous time plus a soft push that follows the kick envelope (no jumps)
  float t = uTime * 0.8 + uSceneBeat * 0.12 + 0.3 * uKick;   // tempo carries the flow, a kick nudges it

  // background: deep cover colour with slow caustics
  vec3 col = mix(uPal[0] * 0.55, uPal[0] * 0.18, smoothstep(-0.6, 0.7, p.y));
  vec2 cq = p * 3.2 + vec2(0.0, uTime * 0.05);
  cq += 0.5 * vec2(fbm2(cq + uTime * 0.03), fbm2(cq.yx - uTime * 0.025));
  float caust = pow(0.5 + 0.5 * sin(cq.x * 2.1 + sin(cq.y * 1.7)) * sin(cq.y * 2.3 + sin(cq.x * 1.3)), 6.0);
  col += pal(0.55) * caust * 0.05;

  // metaball field of the big bubbles
  float F = 0.0; vec2 grad = vec2(0.0);
  for (int k = 0; k < NB; k++) {
    vec3 b = bubble(k, t, halfW);
    vec2 d = p - b.xy;
    float q = b.z * b.z / (dot(d, d) + 1e-4);
    F += q; grad += -2.0 * q * d / (dot(d, d) + 1e-4);
  }
  float edge = fwidth(F) * 1.5 + 1e-4;
  float inside = smoothstep(1.0 - edge, 1.0 + edge, F);
  // soft glow around the bubbles
  col += pal(0.6) * smoothstep(0.25, 1.0, F) * (1.0 - inside) * 0.12;

  // thin-film skin: colour bands shift with thickness (F), height and slow time; darker core, bright rim
  vec2 n = normalize(grad + 1e-5);
  float rim = 1.0 - smoothstep(1.0, 2.2, F);
  float Fs = min(F, 2.6);                       // flat inside: no rings around the centres
  float film = 0.5 + 0.5 * sin(TAU * (0.3 * log(Fs + 1.0) + 0.25 * p.y + 0.08 * (n.x + n.y) * rim + uTime * 0.02));   // smooth, no seams
  vec3 skin = mix(pal(film), pal(1.0 - film), 0.5 + 0.5 * sin(Fs * 2.0 + uTime * 0.2));
  vec3 core = mix(uPal[0] * 0.5, skin * 0.35, 0.6);
  vec3 bcol = mix(core, skin * 1.1, rim);
  float spec = pow(max(dot(n, normalize(vec2(-0.5, 0.85))), 0.0), 18.0) * rim;
  bcol += vec3(1.0) * spec * 0.45;
  col = mix(col, bcol, inside);

  // pearls: tiny bubbles released by high notes, rising fast in thin streams
  float hi = histSmooth(0.72, 0.0), air = histSmooth(0.9, 0.0);
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    float h1 = hash12(vec2(fi, 9.1)), h2 = hash12(vec2(fi, 2.9));
    float sp = 0.09 + 0.08 * h2;
    float y = fract(h1 + uTime * sp) * 1.8 - 0.9;
    float x = (hash12(vec2(fi, 5.5)) - 0.5) * halfW * 1.8 + 0.012 * sin(uTime * 3.0 + fi);
    float r = (0.0035 + 0.006 * h2) * clamp(hi * 1.6 + air * 0.6 - 0.15 * h1, 0.0, 1.2);
    float dd = length(p - vec2(x, y));
    float ring = 1.0 - smoothstep(r - px, r + px, dd);
    float inner = 1.0 - smoothstep(r * 0.55 - px, r * 0.55 + px, dd);
    col += mix(pal(0.85), vec3(1.0), 0.4) * (ring - inner * 0.6) * 0.55 * step(0.0005, r);
  }

  // gentle vignette keeps the eye in the middle
  col *= 1.0 - 0.25 * dot(p, p);
  fragColor = vec4(col, 1.0);
}
`,
};
