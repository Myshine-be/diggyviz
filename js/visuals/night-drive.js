// Snake (id stays "nightdrive" so saved choices and the story tests keep working) — the retro game, playing
// itself on a glowing grid. The snake's body is a fluid equalizer: a bundle of fine lines (the Strings principle)
// that follows its path through the cells, round in the corners, from head to tail. The head plays the lows (broad
// swells), the tail the highs (fine fast ripples); a hit shows at once near the head and then ripples down the body.
// Bounded so it never spills into a neighbouring cell; in silence it turns slim and calm. It grows by two segments
// with every song DiggyViz has seen (after 120 it sheds its skin and starts small again). Two moves per beat, so it
// dances on the tempo; during a pause in the song it stops and looks around. Easter egg at 90 s: a heart of apples.
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
  lyrics: { land: { y: 0.04, width: 0.7, lines: 1 }, port: { y: 0.036, width: 0.9, lines: 1 } },   // in the margin under the board: snake and grid stay free

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
// the body is a bundle of fine lines (the Strings principle) that follows the snake's path through the cells.
// Frequencies are spread along the body: the head plays the lows (broad swells), the tail the highs (fine fast
// ripples). The head reacts at once; the sound then ripples down the body. Bounded so it never leaves its cell.
const int NLB = 6;
vec2 nbDir(vec2 cell, int k) {                       // direction to the neighbour holding segment k, or 0
  for (int n = 0; n < 4; n++) {
    vec2 d = n == 0 ? vec2(1, 0) : n == 1 ? vec2(-1, 0) : n == 2 ? vec2(0, 1) : vec2(0, -1);
    if (k > 0 && idxAt(cell + d) == k) return d;
  }
  return vec2(0.0);
}
// path coordinates inside a body cell: x = arc position u (0 at the headward edge … 1 at the tailward edge),
// y = lateral offset (left of the head→tail direction). Straight cells are straight, corners a quarter circle.
vec2 pathUV(vec2 lp, vec2 dPrev, vec2 dNext) {
  if (dot(dPrev, dNext) < -0.5) {                    // straight
    vec2 t = dNext;
    return vec2(dot(lp, t) + 0.5, t.x * lp.y - t.y * lp.x);
  }
  vec2 C = (dPrev + dNext) * 0.5;                     // the shared cell corner
  vec2 w = lp - C;
  float r = length(w);
  vec2 va = -dNext, vb = -dPrev;                      // radial directions at entry (A) and exit (B)
  float u = atan(dot(w, vb), dot(w, va)) / (0.5 * PI);
  vec2 tA = -dPrev, leftA = vec2(-tA.y, tA.x);
  float sgn = dot(leftA, va);
  return vec2(clamp(u, 0.0, 1.0), (r - 0.5) * sgn);
}

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

  // body: a bundle of fine lines along the path (head and neck end under the head circle)
  vec2 headPos = mix(uHead.zw, uHead.xy, uFrac);
  vec2 hp = g - 0.5 - headPos;
  float headD = length(hp) - 0.42;
  int k0 = idxAt(cell);
  if (k0 >= 1) {
    vec2 dN = nbDir(cell, k0 + 1), dP = nbDir(cell, k0 - 1);
    if (dot(dP, dP) < 0.5) dP = dot(dN, dN) > 0.5 ? -dN : -normalize(uHead.xy - uHead.zw + 1e-4);
    if (dot(dN, dN) < 0.5) dN = -dP;
    vec2 uv = pathUV(lp, dP, dN);
    float s = float(k0) - 0.5 + uv.x;                 // arc length along the body, continuous over the cells
    float sHead = 2.0 - uFrac, sTail = uLen - uFrac;
    if (s >= sHead - 0.05 && s <= sTail + 0.05) {
      float f = clamp((s - 1.0) / max(uLen - 1.0, 1.0), 0.0, 1.0);    // head = lows … tail = highs
      float lag = min(1.4, 0.035 * max(s - sHead, 0.0));            // the sound ripples down the body
      float lv = histSmooth(f, lag);
      float on = flux(f) * (1.0 - smoothstep(0.0, 0.25, lag));      // a new hit shows at once near the head
      float L = clamp(smoothstep(0.12, 0.8, lv) * 1.1 + 0.7 * on, 0.0, 1.4) * (1.0 - 0.7 * uRest);
      float lowW = 1.0 - f, hiW = f;
      float tail = smoothstep(sTail + 0.05, sTail - 1.6, s);          // pinched towards the tail
      float headTaper = mix(0.75, 1.0, smoothstep(sHead, sHead + 1.0, s));
      float env = tail * headTaper;
      float t = uTime;
      float spread = (0.09 + 0.22 * L * (0.3 + 0.7 * lowW)) * (1.0 - 0.3 * uRest);   // silence: slimmer, still there
      float aaU = px / CS * 1.1;
      vec3 acc = vec3(0.0); float cov = 0.0, sumL = 0.0;
      for (int i = 0; i < NLB; i++) {
        float kk = float(i) / float(NLB - 1) - 0.5;
        float seed = kk * 2.4;
        // broad swells from the lows (long wavelength), fine ripples from the highs (short wavelength, faster)
        float y = kk * 2.0 * spread;
        y += L * lowW * 0.26 * sin(TAU * (s * 0.32 - t * 0.35) + seed * 0.9);
        y += L * (0.3 + hiW) * 0.09 * sin(TAU * (s * 1.7 + t * 1.25) + seed * 2.3);
        y += 0.025 * sin(TAU * (s * 0.2 + t * 0.11) + seed);         // idle breathing: never a dead line
        y = 0.44 * tanh(y * env / 0.44);                             // bounded: stays inside its own cell
        float dy = abs(uv.y - y);
        float w = 0.022 + 0.01 * L;
        float l = 1.0 - smoothstep(w, w + aaU * 1.5, dy);
        l += exp(-dy / (0.05 + aaU)) * 0.18;                         // a soft glow around each line
        vec3 c = pal(0.3 + 0.62 * f + 0.08 * kk);
        acc += c * l * mix(0.42, 0.72, clamp(L, 0.0, 1.0)) * mix(1.0, 0.7, abs(kk) * 2.0);
        cov = max(cov, l); sumL += l;
      }
      acc /= max(1.0, sumL);                                         // converging lines never add up to a hot spot
      float endFade = smoothstep(sTail + 0.05, sTail - 0.35, s) * smoothstep(sHead - 0.05, sHead + 0.1, s);
      // a faint core keeps the snake readable as one body
      float core = (1.0 - smoothstep(0.0, spread * env + 0.06, abs(uv.y))) * 0.14;
      col = col * (1.0 - 0.55 * min(cov, 1.0) * endFade) + (acc + pal(0.3 + 0.62 * f) * core) * endFade;
    }
  }

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
