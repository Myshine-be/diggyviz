// Tunnel — Milkdrop-style feedback: the last frame is zoomed, twisted and hue-shifted, then a new ring is drawn.
// The ring is a soft polygon that morphs to a new shape (3–8 corners) on every kick; lows widen it and spin the
// tunnel, highs crinkle its edge per direction, a snare gives the flow a twist. Cover colours, no white, no flash.

export default {
  id: "tunnel",
  name: "Tunnel",
  lyrics: { y: 0.5, font: "light" },     // in the dark open passage, behind the walls
  bloom: 0.6,
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

  // feedback transform: zoom in, twist (more with lows and on snares), gentle wobble
  float frames = clamp(uDelta * 60.0, 0.0, 6.0);
  float low = histSmooth(0.06, 0.0), hiE = histSmooth(0.75, 0.0);
  float zoom = pow(1.0 / (1.024 + 0.012 * low + uDrop * 0.08), frames);
  float twist = 0.004 + 0.008 * low + 0.012 * uSnare + sin(uTime * 0.2) * 0.003;
  vec2 f = rot(twist * frames) * cuv * zoom;
  f += frames * 0.0008 * vec2(sin(f.y * 9.0 + uTime), cos(f.x * 9.0 - uTime * 0.8)) * (0.5 + uEnergy);
  f.x /= aspect;
  vec3 prev = texture(uPrev, f + 0.5).rgb;
  prev = max(vec3(0.0), hueShift(prev, (0.006 + uHat * 0.012) * frames)) * pow(0.952 - uDrop * 0.05, frames);

  // the new ring: a polygon that morphs to a new corner count on each kick
  vec2 p = P();
  float r = length(p), a = atan(p.y, p.x);
  float nA = 3.0 + floor(hash12(vec2(uKickN, 1.7)) * 6.0), nB = 3.0 + floor(hash12(vec2(uKickN - 1.0, 1.7)) * 6.0);
  float morph = smoothstep(1.0, 0.25, uKick);                       // fresh kick = old shape, then glides to the new
  float spin = uSongTime * 0.15 + uSceneBeat * 0.05;
  float sa = a + spin;
  float polyA = cos(PI / nA) / cos(mod(sa, TAU / nA) - PI / nA);
  float polyB = cos(PI / nB) / cos(mod(sa, TAU / nB) - PI / nB);
  float shape = mix(polyB, polyA, morph);
  float fa = 0.4 + 0.55 * abs(fract(a / TAU + 0.5) * 2.0 - 1.0);   // every direction its own high pitch
  float crinkle = histSmooth(fa, 0.0) * 0.12 * sin(a * 24.0 + uTime * 2.0) + flux(fa) * 0.08;
  float R = (0.09 + 0.1 * low + 0.03 * uKick) * shape * (1.0 + crinkle);
  float d = abs(r - R);
  float px = 1.5 / min(uRes.x, uRes.y);
  float ring = 1.0 - smoothstep(0.0, px * 2.5 + 0.0025, d);
  ring += exp(-d * 110.0) * 0.25;
  vec3 c = pal(0.35 + 0.45 * (0.5 + 0.5 * sin(uTime * 0.3 + a + nA)));
  vec3 col = max(prev, c * ring * (0.7 + 0.25 * hiE));
  // a calm dark centre keeps depth (no spark)
  col *= smoothstep(0.0, 0.06, r) * 0.5 + 0.5;
  fragColor = vec4(min(col, vec3(1.2)), 1.0);
}`,
};
