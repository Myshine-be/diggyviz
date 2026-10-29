// Dunes (id stays "landscape" so saved choices keep working) — a recognisable desert that the music builds.
// Real sand dunes (gentle windward slopes, sharp crests, soft shadows, fine wind ripples) under a low sun, several
// layers of dunes into a hazy horizon, the camera travelling slowly and evenly forward. Every measured beat raises a
// new ridge far ahead (strength = height and width, close hits merge, smooth rise, js/visuals/dune-ridges.js); the
// ridges keep their shape as you pass them: a trail of the music. The current beat blows a veil of sand off a near
// crest at once; highs add fine glints, kept secondary. In silence the desert comes to rest. The sky stays calm and
// free for the lyrics (placed there, never on the dunes).
import { DUNE, createDuneField, stepDunes, bakeDunes } from "./dune-ridges.js";

const states = new WeakMap();
function duneState(gl) {
  let st = states.get(gl);
  if (!st || !gl.isTexture(st.tex)) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, DUNE.cols, DUNE.rows, 0, gl.RED, gl.HALF_FLOAT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    st = { tex, field: createDuneField(7), bytes: new Uint16Array(DUNE.cols * DUNE.rows), lastTime: null };
    states.set(gl, st);
  }
  return st;
}
const SPEED = 0.9;   // world units per second of visual time (slows down by itself during a rest)

export default {
  id: "landscape",
  name: "Dunes",
  lyrics: { y: { land: 0.83, port: 0.78 }, span: 1, scale: 0.85, font: "serif", occlude: false, ink: [0.97, 0.91, 0.8], accent: [1.0, 0.8, 0.52] },   // in the desert sky, never on the dunes
  bloom: 0.45,

  uniforms({ gl, loc, frame }) {
    const st = duneState(gl);
    const t = frame.time ?? 0;
    const dt = st.lastTime === null ? 0 : Math.max(0, Math.min(0.1, t - st.lastTime));
    st.lastTime = t;
    const camZ = t * SPEED;
    stepDunes(st.field, frame.audio, dt, camZ);
    bakeDunes(st.field, st.bytes);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, st.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, DUNE.cols, DUNE.rows, gl.RED, gl.HALF_FLOAT, st.bytes);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    if (loc.uDune) gl.uniform1i(loc.uDune, 4);
    if (loc.uCamZ) gl.uniform1f(loc.uCamZ, camZ);
    if (loc.uDuneWin) gl.uniform4f(loc.uDuneWin, DUNE.xHalf, DUNE.zMin, DUNE.zFar + 1, 0);
    if (loc.uVeil) gl.uniform2f(loc.uVeil, st.field.veil, st.field.veilX);
  },

  frag: /* glsl */ `
uniform sampler2D uDune;
uniform float uCamZ;
uniform vec4 uDuneWin;   // xHalf, zMin, zMax (camera relative)
uniform vec2 uVeil;      // strength, x (-1..1)

const float CAMH = 1.0;

// procedural dunes: gentle slopes, sharp crests (a cusp at the top), soft troughs, several directions mixed
float baseDunes(vec2 w) {
  float a = w.y * 0.62 + 0.9 * sin(w.x * 0.27 + w.y * 0.05) + 0.4 * sin(w.x * 0.71 - 1.3);
  float sa = sin(a);
  float d1 = pow(1.0 - sqrt(sa * sa + 0.003), 1.7);              // sharp crest, just rounded enough not to sparkle
  float b = w.y * 0.38 - w.x * 0.24 + 0.6 * sin(w.x * 0.43 + 2.0);
  float sb = sin(b);
  float d2 = pow(1.0 - sqrt(sb * sb + 0.003), 2.2);
  return 0.27 * d1 + 0.13 * d2 + 0.02 * sin(w.x * 1.1 + w.y * 0.8) * sin(w.y * 0.5 - w.x * 0.3);
}
float beatRidges(vec2 rel) {   // rel = (x, z relative to the camera)
  vec2 uv = vec2((rel.x + uDuneWin.x) / (2.0 * uDuneWin.x), (rel.y - uDuneWin.y) / (uDuneWin.z - uDuneWin.y));
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(uDune, uv).r;
}
float H(vec2 rel) {
  vec2 w = vec2(rel.x, rel.y + uCamZ);
  float h = baseDunes(w) * (1.0 - 0.35 * uRest) + beatRidges(rel);
  return min(h, CAMH * 0.78);                    // bounded: the horizon always stays free
}

vec3 skyCol(vec3 rd) {
  float y = rd.y;
  vec3 horizon = mix(vec3(0.85, 0.52, 0.34), uPal[2], 0.25) * 0.55;
  vec3 high = mix(uPal[0] * 0.25, vec3(0.025, 0.03, 0.07), 0.6);      // a deep evening sky: calm room for the lyrics
  vec3 c = mix(horizon, high, smoothstep(0.0, 0.3, y));
  vec3 sunD = normalize(vec3(-0.9, 0.06, 1.0));
  float s = max(dot(rd, sunD), 0.0);
  c += mix(vec3(1.0, 0.8, 0.55), uPal[3], 0.2) * (pow(s, 600.0) * 1.2 + pow(s, 18.0) * 0.25);   // a low, soft sun
  return c;
}

void main() {
  vec2 p = P();
  float hy = 0.08 * (uRes.x >= uRes.y ? 1.0 : -0.6);   // horizon: room for lyrics in the sky in both orientations
  vec3 ro = vec3(0.0, CAMH, 0.0);
  vec3 rd = normalize(vec3(p.x, p.y - hy, 1.55));
  vec3 sky = skyCol(rd);
  vec3 col = sky;
  vec3 L = normalize(vec3(-0.6, 0.3, 0.75));             // a low sun ahead: lit crests, soft shadowed faces
  float veil = 0.0;

  if (rd.y < 0.06) {
    float t = 0.3, h = 0.0; bool hit = false; float prevT = t, prevD = 1.0;
    for (int i = 0; i < 100; i++) {
      vec3 pos = ro + rd * t;
      float d = pos.y - H(pos.xz);
      // sand veil above crests (the current beat), only close by
      if (t > 1.2 && t < 6.0) veil += exp(-max(d, 0.0) * 14.0) * smoothstep(0.22, 0.42, pos.y - d) * exp(-pow(pos.x - uVeil.y * 1.6, 2.0) * 1.5) * 0.02;   // one near crest only
      if (d < 0.0015 * t) {
        hit = true;
        // refine between the last two samples: no terraces on grazing distant slopes
        float lo = prevT, hi2 = t;
        for (int k = 0; k < 5; k++) { float m = 0.5 * (lo + hi2); vec3 q = ro + rd * m; if (q.y - H(q.xz) > 0.0) lo = m; else hi2 = m; }
        t = 0.5 * (lo + hi2);
        break;
      }
      prevT = t; prevD = d;
      t += max(0.01 + t * 0.003, d * 0.4);
      if (t > 48.0) break;
    }
    if (hit) {
      vec3 pos = ro + rd * t;
      float e = 0.012 + 0.002 * t;
      float hc = H(pos.xz);
      vec3 n = normalize(vec3(hc - H(pos.xz + vec2(e, 0.0)), e, hc - H(pos.xz + vec2(0.0, e))));
      // fine wind ripples close by (normal only, fade with distance)
      vec2 w = pos.xz + vec2(0.0, uCamZ);
      float rip = sin(w.y * 34.0 + w.x * 9.0 + 2.0 * sin(w.x * 1.7)) * exp(-t * 0.45);
      n = normalize(n + vec3(0.0, 0.0, 0.02 * rip));
      float dif = dot(n, L);
      vec3 sandLit = mix(vec3(0.78, 0.52, 0.32), uPal[2], 0.2);
      vec3 sandShadow = mix(vec3(0.10, 0.06, 0.08), uPal[0] * 0.5, 0.45);
      vec3 sand = mix(sandShadow, sandLit, smoothstep(-0.15, 0.55, dif));
      sand *= 0.95 + 0.05 * smoothstep(-0.2, 0.2, rip);
      sand += sandLit * pow(max(dif, 0.0), 2.0) * 0.12;
      // highs: a few fine glints on the lit slopes (secondary)
      float glint = step(0.985, hash12(floor(w * 60.0))) * smoothstep(0.3, 0.7, dif) * exp(-t * 0.5);
      sand += vec3(1.0, 0.9, 0.7) * glint * histSmooth(0.85, 0.0) * 0.5;
      // haze: dune layers fade into the horizon
      float fog = 1.0 - exp(-t * 0.05);
      col = mix(sand, mix(sky, skyCol(vec3(rd.x, 0.0, rd.z)), 0.6), pow(fog, 1.15));
    }
    col += mix(vec3(1.0, 0.85, 0.65), uPal[2], 0.3) * min(veil, 0.5) * uVeil.x * 0.45;
  }
  fragColor = vec4(col, 1.0);
}
`,
};
