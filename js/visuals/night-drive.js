// Snake (id stays "nightdrive" so saved choices and the story tests keep working) — the retro game, playing
// itself on a glowing grid. The snake's body is a live equalizer: every segment is a frequency (bass at the head,
// highs at the tail) and swells with it, and the sound ripples down the body. It grows by two segments with every
// song DiggyViz has seen (after 120 it sheds its skin and starts small again). Two moves per beat, so it dances
// on the tempo; during a pause in the song it stops and looks around. Easter egg at 90 s: a heart of apples.
// Game logic: js/visuals/snake-path.js (pure, tested). The board is uploaded as a small texture each frame.
import { createSnake, stepSnake, lengthForSongs, heartCells, placeApple } from "./snake-path.js";

const SIZE = 64;                                   // board texture (cols, rows ≤ 64)
const states = new WeakMap();                      // per WebGL context

function boardState(gl, cols, rows) {
  let st = states.get(gl);
  if (!st || st.cols !== cols || st.rows !== rows || !gl.isTexture(st.tex)) {
    const tex = st?.tex && gl.isTexture(st.tex) ? st.tex : gl.createTexture();
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SIZE, SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    st = { tex, cols, rows, snake: createSnake(cols, rows, 7), bytes: new Uint8Array(SIZE * SIZE * 4), lastStep: null, heart: false, ateAt: -9 };
    states.set(gl, st);
  }
  return st;
}

export default {
  id: "nightdrive", name: "Snake", story: true, duration: 120, bloom: 0.3,
  lyrics: { y: 0.5, font: "mono" },      // behind the board: the dark cells keep it readable, the snake passes over it

  uniforms({ gl, loc, frame, slot, width, height }) {
    const cols = width >= height ? 28 : 16;
    // aspect quantised so the adaptive render scale (a few pixels) never changes the board and restarts the game
    const aspect = Math.round((height / width) * 20) / 20;
    const rows = Math.min(SIZE, Math.max(10, Math.round(cols * aspect * 0.92)));
    const st = boardState(gl, cols, rows), s = st.snake;
    s.target = lengthForSongs(frame.songs ?? 0);
    const beats = slot.clock.beats, secs = slot.clock.seconds;
    const want = Math.floor(beats * 2);
    if (st.lastStep === null || want < st.lastStep) st.lastStep = want;
    const resting = (frame.audio?.rest ?? 0) > 0.5;
    // easter egg: a heart of apples between 90 and 105 s of every 2 minutes
    const c = secs % 120;
    if (c >= 90 && c < 105 && !st.heart) { st.heart = true; s.apples = []; for (const h of heartCells(cols, rows)) placeApple(s, h); }
    if (c < 90) st.heart = false;
    let n = resting ? 0 : Math.min(4, want - st.lastStep);
    while (n-- > 0) { const r = stepSnake(s); if (r.ate) st.ateAt = secs; }
    if (!resting) st.lastStep = want;
    const frac = resting ? 1 : Math.min(1, Math.max(0, beats * 2 - want));
    // board texture: R = segment index + 1, G = apple (255 normal, 160 heart apple)
    const b = st.bytes; b.fill(0);
    const len = s.body.length;
    s.body.forEach(([x, y], i) => { const o = (y * SIZE + x) * 4; b[o] = Math.min(255, i + 1); });
    for (const [x, y] of s.apples) { const o = (y * SIZE + x) * 4; b[o + 1] = st.heart ? 160 : 255; }
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, st.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, b);
    if (loc.uBoard) gl.uniform1i(loc.uBoard, 4);
    if (loc.uGrid) gl.uniform2f(loc.uGrid, cols, rows);
    if (loc.uFrac) gl.uniform1f(loc.uFrac, frac);
    if (loc.uLen) gl.uniform1f(loc.uLen, len);
    const head = s.body[0], neck = s.body[1] || head, tail = s.body[len - 1], last = s.lastTail || tail;
    if (loc.uHead) gl.uniform4f(loc.uHead, head[0], head[1], neck[0], neck[1]);
    if (loc.uTail) gl.uniform4f(loc.uTail, tail[0], tail[1], last[0], last[1]);
    if (loc.uAte) gl.uniform1f(loc.uAte, Math.max(0, secs - st.ateAt));
    if (loc.uHeart) gl.uniform1f(loc.uHeart, st.heart ? 1 : 0);
  },

  frag: /* glsl */ `
uniform sampler2D uBoard;
uniform vec2 uGrid;
uniform float uFrac, uLen, uAte, uHeart;
uniform vec4 uHead, uTail;          // head cell + neck cell, tail cell + the cell it just left

float CS; vec2 ORG;                 // cell size and board origin in P() units
vec2 cellCenter(vec2 c) { return ORG + (c + 0.5) * CS; }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0)); }
int idxAt(vec2 c) {
  if (c.x < 0.0 || c.y < 0.0 || c.x >= uGrid.x || c.y >= uGrid.y) return 0;
  return int(texelFetch(uBoard, ivec2(c), 0).r * 255.0 + 0.5);
}
// the equalizer: segment k listens to frequency k/len; the sound ripples from the head down the body
float level(float k) { float f = clamp((k - 1.0) / max(uLen - 1.0, 1.0), 0.0, 1.0); return histSmooth(f, 0.04 * k); }
float halfW(float k) { return 0.19 + 0.29 * level(k); }

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float HW = 0.5 * uRes.x / min(uRes.x, uRes.y), HH = 0.5 * uRes.y / min(uRes.x, uRes.y);
  CS = min(2.0 * HW * 0.94 / uGrid.x, 2.0 * HH * 0.86 / uGrid.y);
  ORG = -uGrid * CS * 0.5;
  vec2 g = (p - ORG) / CS;
  vec2 cell = floor(g), lp = (g - cell - 0.5);          // local position in the cell, -0.5..0.5
  float aa = px / CS * 1.5;
  bool onBoard = all(greaterThanEqual(g, vec2(0.0))) && all(lessThan(g, uGrid));

  // background: dark screen, faint grid, glowing frame, soft scanlines
  vec3 col = uPal[0] * 0.18 + vec3(0.006, 0.007, 0.01);
  if (onBoard) {
    float gline = max(1.0 - smoothstep(0.0, aa * 1.2, 0.5 - abs(lp.x)), 1.0 - smoothstep(0.0, aa * 1.2, 0.5 - abs(lp.y)));
    col += pal(0.5) * gline * 0.06;
    col += pal(0.45) * 0.025 * (1.0 - smoothstep(0.0, 0.7, length(lp)));          // tiny cell glow
  }
  float frame = sdBox(p, uGrid * CS * 0.5 + CS * 0.12, CS * 0.2);
  col += pal(0.6) * (1.0 - smoothstep(0.0, px * 2.0, abs(frame))) * 0.8;
  col += pal(0.6) * exp(-abs(frame) * 60.0) * 0.12;

  // body: rounded segments that swell with their frequency, bridged to their neighbours
  float body = 1e3; float bk = 0.0;
  int k0 = idxAt(cell);
  if (k0 >= 2) {
    float k = float(k0);
    float w = halfW(k);
    float tailShrink = k0 == int(uLen) ? (1.0 - uFrac) : 1.0;          // the tail slides out of its cell
    body = sdBox(lp, vec2(w * mix(0.35, 1.0, tailShrink)), 0.12);
    bk = k;
    for (int n = 0; n < 4; n++) {
      vec2 dir = n == 0 ? vec2(1, 0) : n == 1 ? vec2(-1, 0) : n == 2 ? vec2(0, 1) : vec2(0, -1);
      int kn = idxAt(cell + dir);
      if (kn >= 2 && abs(kn - k0) == 1) {
        float wn = min(w, halfW(float(kn))) * 0.8;
        body = min(body, sdBox(lp - dir * 0.25, vec2(abs(dir.x) > 0.5 ? 0.26 : wn, abs(dir.y) > 0.5 ? 0.26 : wn), 0.05));
      }
    }
  }
  // the neck reaches towards the head, which glides between cells
  vec2 headPos = mix(uHead.zw, uHead.xy, uFrac);
  vec2 hp = g - 0.5 - headPos;
  float neckW = halfW(2.0) * 0.85;
  float neck = sdSeg(g - 0.5, uHead.zw, headPos) - neckW;
  float headD = length(hp) - 0.42;
  float bodyAll = min(body, neck);
  float m = 1.0 - smoothstep(-aa, aa, bodyAll);
  if (m > 0.0) {
    float k = bk > 0.0 ? bk : 2.0;
    float f = clamp((k - 1.0) / max(uLen - 1.0, 1.0), 0.0, 1.0);
    float lv = level(k);
    vec3 sc = pal(0.3 + 0.62 * f);
    vec3 seg = sc * (0.28 + 0.55 * lv);                    // calm: colour, never white-hot
    // LED meter inside each segment: a bar that fills with the level
    // three LED dots across the segment light up with the level (like a tiny VU meter)
    float leds = 0.0;
    for (int j = 0; j < 3; j++) { float on = step(float(j) / 3.0 + 0.08, lv); leds += on * (1.0 - smoothstep(0.0, aa * 1.5, length(lp - vec2(0.0, (float(j) - 1.0) * 0.14)) - 0.045)); }
    seg += mix(sc, vec3(1.0), 0.35) * leds * 0.45 * step(0.5, bk);
    seg += vec3(1.0) * 0.05 * (1.0 - smoothstep(-0.1, 0.0, bodyAll));     // soft inner highlight
    col = mix(col, seg, m);
  }
  col += pal(0.4) * exp(-max(bodyAll, 0.0) * 18.0 / max(CS * 40.0, 0.5)) * 0.0;

  // apples (and the heart of apples in the easter egg); they pulse softly with the kick
  float ap = texelFetch(uBoard, ivec2(clamp(cell, vec2(0.0), uGrid - 1.0)), 0).g;
  if (onBoard && ap > 0.1) {
    float r = 0.28 * (1.0 + 0.12 * uKick);
    vec3 ac = ap > 0.8 ? mix(uPal[3], vec3(1.0, 0.25, 0.3), 0.35) : mix(uPal[3], vec3(1.0, 0.4, 0.7), 0.5);
    float d = length(lp * vec2(1.0, 1.08) - vec2(0.0, -0.03)) - r;
    col = mix(col, ac * (0.8 + 0.3 * smoothstep(0.2, -0.2, lp.x + lp.y)), 1.0 - smoothstep(-aa, aa, d));
    col += vec3(1.0) * (1.0 - smoothstep(0.0, aa, length(lp - vec2(-0.09, 0.07)) - 0.05)) * 0.6;
    col = mix(col, pal(0.35) * 0.9, 1.0 - smoothstep(-aa, aa, sdBox(lp - vec2(0.08, 0.29), vec2(0.09, 0.035), 0.03)));   // leaf
    col += ac * exp(-max(d, 0.0) * 9.0) * 0.18;
  }

  // the head: round, two eyes looking where it goes (looking around during a pause), a tongue on kicks
  float hm = 1.0 - smoothstep(-aa, aa, headD);
  if (hm > 0.0 || length(hp) < 1.2) {
    vec2 dir = uHead.xy - uHead.zw; dir = length(dir) > 0.0 ? normalize(dir) : vec2(1.0, 0.0);
    vec2 side = vec2(-dir.y, dir.x);
    vec3 hc = pal(0.3) * 0.8;
    col = mix(col, hc, hm);
    col += vec3(1.0) * 0.15 * hm * (1.0 - smoothstep(-0.1, 0.25, dot(hp, vec2(0.6, -0.8))));
    vec2 look = dir * 0.05 + side * 0.06 * sin(uTime * 1.5) * uRest;
    for (int e = 0; e < 2; e++) {
      vec2 ec = dir * 0.12 + side * (e == 0 ? 0.17 : -0.17);
      float ew = 1.0 - smoothstep(-aa, aa, length(hp - ec) - 0.11);
      col = mix(col, vec3(0.97), ew);
      col = mix(col, vec3(0.03), (1.0 - smoothstep(-aa, aa, length(hp - ec - look) - 0.055)) * ew);
    }
    // forked tongue flicks out on the kick
    float tl = 0.32 * clamp(uKick, 0.0, 1.0);
    vec2 tb = dir * 0.38, tt = dir * (0.38 + tl);
    float tongue = min(sdSeg(hp, tb, tt), min(sdSeg(hp, tt, tt + (dir + side) * 0.07 * step(0.05, tl)), sdSeg(hp, tt, tt + (dir - side) * 0.07 * step(0.05, tl)))) - 0.025;
    col = mix(col, vec3(1.0, 0.3, 0.4), (1.0 - smoothstep(-aa, aa, tongue)) * step(0.02, tl));
    // sparkles right after eating an apple
    float sp = exp(-uAte * 3.0);
    for (int i = 0; i < 6; i++) { float a = float(i) * TAU / 6.0 + uTime; vec2 q = hp - vec2(cos(a), sin(a)) * (0.5 + uAte * 1.5);
      col += mix(uPal[3], vec3(1.0), 0.5) * (1.0 - smoothstep(0.0, aa * 2.0, length(q) - 0.04)) * sp; }
  }

  // soft scanlines and vignette for the retro screen feel (static, no flicker)
  col *= 0.94 + 0.06 * sin(gl_FragCoord.y * 1.4);
  col *= 1.0 - 0.3 * dot(p, p);
  fragColor = vec4(col, 1.0);
}`,
};
