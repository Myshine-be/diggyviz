// Soul Beat — a ferrofluid ink blot in zero gravity behind a back-lit window (Mo's reference, 30 Oct 2026: the
// "anti-gravity ferrofluid speaker"). The ink is a black silhouette against a glowing window in the cover colour:
// it clumps into one mass, bursts into a cloud of tiny bubbles on a kick, grows spikes when the field (bass) is
// strong, sheds droplets on a snare, and every few bars takes another shape (cloud, clump, star, tree, puddle, split).
// The physics run on the CPU once per frame (js/visuals/soul-ink.js); the shader only draws the drops as metaballs.
// Track title is shown above it in spaced lowercase (caption).
import { createInk, stepInk, packInk, NDROP, WIN } from "./soul-ink.js";

const states = new WeakMap();

export default {
  id: "soulbeat",
  name: "Soul Beat",
  lyrics: { land: { x: 0.03, y: 0.5, align: "left", width: 0.22 }, port: { y: 0.13 }, font: "light" },   // beside / under the glass
  bloom: 0.22,
  caption: true,

  uniforms({ gl, loc, frame }) {
    let st = states.get(gl);
    if (!st) { st = { ink: createInk(5), buf: new Float32Array(NDROP * 4), last: null }; states.set(gl, st); }
    const t = frame.time ?? 0, dt = st.last === null ? 0 : Math.max(0, Math.min(0.05, t - st.last));
    st.last = t;
    stepInk(st.ink, frame.audio, dt);
    packInk(st.ink, st.buf);
    if (loc.uInk) gl.uniform4fv(loc.uInk, st.buf);
    if (loc.uInkBurst) gl.uniform1f(loc.uInkBurst, st.ink.burst);
  },
  frag: /* glsl */ `
uniform vec4 uInk[56];     // per drop: x, y, radius, spike amount (P() units, window centre = 0)
uniform float uInkBurst;
const float WINR = 0.4;

// metaball field of the ink; big drops grow ferrofluid spikes when the field is strong
float inkField(vec2 q) {
  float F = 0.0;
  for (int i = 0; i < 56; i++) {
    vec4 d = uInk[i];
    vec2 v = q - d.xy;
    float dd = dot(v, v);
    float reach = d.z * (3.2 + 2.2 * d.w);
    if (dd > reach * reach) continue;
    float r = d.z;
    if (d.w > 0.01) {
      float a = atan(v.y, v.x);
      float sp = pow(abs(cos(a * 8.5 + float(i) * 1.7 + uTime * 0.15)), 7.0) * (0.7 + 0.3 * sin(a * 3.0 + float(i)));
      r *= 1.0 + d.w * 1.25 * sp * smoothstep(r * 0.6, r * 1.4, sqrt(dd));
    }
    F += r * r / (dd + 1e-5);
  }
  return F;
}

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  vec2 c = vec2(0.0, 0.0);
  vec2 q = p - c;
  float rr = length(q);

  // the speaker: dark fabric in the cover's deep tone, with the window's light spilling softly around it
  vec3 col = uPal[0] * 0.12 + 0.012;
  col *= 0.9 + 0.1 * sin(gl_FragCoord.x * 1.7) * sin(gl_FragCoord.y * 1.7);          // fine fabric weave
  vec3 light = mix(pal(0.45), vec3(1.0), 0.22) * 1.1;                              // back-light in the cover colour
  col += light * 0.18 * exp(-max(rr - WINR, 0.0) * 7.0);

  // bezel ring
  float bez = smoothstep(WINR + 0.045, WINR + 0.04, rr) * smoothstep(WINR - 0.002, WINR + 0.004, rr);
  col = mix(col, vec3(0.42, 0.43, 0.45) * (0.75 + 0.35 * smoothstep(0.3, -0.3, q.y)), bez);

  if (rr < WINR + 0.002) {
    // back-lit liquid: bright, a little brighter in the middle, gentle caustic shimmer
    vec3 back = light * (0.72 + 0.28 * smoothstep(WINR, 0.0, rr));
    back *= 0.96 + 0.04 * sin(q.x * 40.0 + uTime * 0.6) * sin(q.y * 35.0 - uTime * 0.5);
    float F = inkField(q);
    float e = fwidth(F) * 1.2 + 1e-4;
    float ink = smoothstep(1.0 - e, 1.0 + e, F);
    // the ink: near black with a deep cover tint; a soft, slightly translucent edge (back-light shining through)
    vec3 inkC = vec3(0.012, 0.014, 0.016) + uPal[0] * 0.05;
    float edge = smoothstep(1.0, 0.55, F) ;
    vec3 rim = mix(inkC, back * 0.35, 0.5);
    vec3 w = mix(back, mix(inkC, rim, smoothstep(2.4, 1.0, F) * 0.35), ink);
    // a faint wet highlight on the big masses (top-left light)
    vec2 g = vec2(dFdx(F), dFdy(F));
    float hl = pow(clamp(dot(normalize(g + 1e-6), normalize(vec2(0.6, -0.8))), 0.0, 1.0), 6.0) * smoothstep(1.2, 2.5, F) * smoothstep(6.0, 3.0, F);
    w += vec3(1.0) * hl * 0.12 * ink;
    // inside edge of the window is a little darker (depth)
    w *= 1.0 - 0.35 * smoothstep(WINR - 0.05, WINR, rr);
    col = mix(col, w, smoothstep(WINR + 0.002, WINR - 0.002, rr));
    // glass: a soft reflection arc
    float arc = smoothstep(0.02, 0.0, abs(rr - WINR * 0.86)) * smoothstep(0.1, 0.6, -q.x + q.y) * 0.08;
    col += vec3(1.0) * arc;
  }
  fragColor = vec4(col, 1.0);
}`,
};
