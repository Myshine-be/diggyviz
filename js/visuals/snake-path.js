// Snake game logic for the Snake visual (pure, deterministic, tested in tests/snake.test.mjs).
// The snake plays by itself: it takes the shortest safe path to an apple; when no safe path exists it moves to
// the neighbour that keeps the most free space. Its length is set from outside (it grows with every song).

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

/** New game on a cols × rows board. */
export function createSnake(cols, rows, seed = 7) {
  const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
  const body = [];
  for (let i = 0; i < 4; i++) body.push([cx - i, cy]);
  const s = { cols, rows, body, dir: [1, 0], prevDir: [1, 0], target: 6, apples: [], rand: rng(seed), eaten: 0, steps: 0, lastTail: [cx - 4, cy] };
  placeApple(s);
  return s;
}

const key = (c) => c[0] + "," + c[1];
const inside = (s, c) => c[0] >= 0 && c[1] >= 0 && c[0] < s.cols && c[1] < s.rows;

export function placeApple(s, at = null) {
  const occ = new Set(s.body.map(key)); s.apples.forEach((a) => occ.add(key(a)));
  if (at) { if (!occ.has(key(at)) && inside(s, at)) s.apples.push(at); return; }
  for (let tries = 0; tries < 400; tries++) {
    const c = [Math.floor(s.rand() * s.cols), Math.floor(s.rand() * s.rows)];
    if (!occ.has(key(c))) { s.apples.push(c); return; }
  }
}

// cells that will still be blocked when the snake moves one step (the tail moves away unless it grows)
function blocked(s) {
  const grows = s.body.length < s.target;
  const b = new Set(s.body.slice(0, grows ? s.body.length : s.body.length - 1).map(key));
  return b;
}

function bfs(s, from, goals, block) {
  const goalSet = new Set(goals.map(key));
  const prev = new Map([[key(from), null]]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    if (goalSet.has(key(c)) && c !== from) {
      let k = key(c), step = c;
      while (prev.get(k) && key(prev.get(k)) !== key(from)) { step = prev.get(k); k = key(step); }
      return step;
    }
    for (const d of DIRS) {
      const n = [c[0] + d[0], c[1] + d[1]], nk = key(n);
      if (!inside(s, n) || block.has(nk) || prev.has(nk)) continue;
      prev.set(nk, c); q.push(n);
    }
  }
  return null;
}

function space(s, from, block) {          // free cells reachable from `from` (flood fill, capped)
  const seen = new Set([key(from)]), q = [from];
  while (q.length && seen.size < 400) {
    const c = q.shift();
    for (const d of DIRS) { const n = [c[0] + d[0], c[1] + d[1]], k = key(n); if (inside(s, n) && !block.has(k) && !seen.has(k)) { seen.add(k); q.push(n); } }
  }
  return seen.size;
}

/** One move. Returns { ate } . */
export function stepSnake(s) {
  const head = s.body[0], block = blocked(s);
  let next = s.apples.length ? bfs(s, head, s.apples, block) : null;
  // safety: only take the apple path if there is still room afterwards
  if (next) { const b2 = new Set(block); b2.add(key(next)); if (space(s, next, b2) < Math.min(s.body.length + 2, 40)) next = null; }
  if (!next) {
    let best = null, bestSpace = -1;
    for (const d of DIRS) {
      const n = [head[0] + d[0], head[1] + d[1]];
      if (!inside(s, n) || block.has(key(n))) continue;
      const b2 = new Set(block); b2.add(key(n));
      const sp = space(s, n, b2) + (d[0] === s.dir[0] && d[1] === s.dir[1] ? 0.5 : 0);
      if (sp > bestSpace) { bestSpace = sp; best = n; }
    }
    next = best;
  }
  if (!next) {                             // trapped: start over small in the middle (a "molt"), never freeze
    const fresh = createSnake(s.cols, s.rows, Math.floor(s.rand() * 1e9));
    Object.assign(s, { body: fresh.body, dir: [1, 0], prevDir: [1, 0] });
    return { ate: false, reset: true };
  }
  s.prevDir = s.dir;
  s.dir = [next[0] - head[0], next[1] - head[1]];
  s.body.unshift(next);
  s.lastTail = s.body[s.body.length - 1];
  while (s.body.length > s.target) { s.lastTail = s.body.pop(); }
  s.steps++;
  const ai = s.apples.findIndex((a) => a[0] === next[0] && a[1] === next[1]);
  if (ai >= 0) { s.apples.splice(ai, 1); s.eaten++; if (!s.apples.length) placeApple(s); return { ate: true }; }
  return { ate: false };
}

/** Length for a number of songs: 6 + 2 per song; after 120 it molts back to 6 and grows again. */
export function lengthForSongs(n, max = 120) { const span = max - 6; return 6 + ((2 * Math.max(0, n)) % span); }

/** A heart shape of cells around the board centre (easter egg). */
export function heartCells(cols, rows) {
  const out = [], cx = cols / 2, cy = rows / 2, r = Math.min(cols, rows) * 0.32;
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const c = [Math.round(cx + (x / 17) * r), Math.round(cy + (y / 17) * r)];
    if (!out.some((o) => o[0] === c[0] && o[1] === c[1])) out.push(c);
  }
  return out;
}
