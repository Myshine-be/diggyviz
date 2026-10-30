// Soul Beat ink: a ferrofluid drop in zero gravity, simulated on the CPU (pure, tested in tests/soul-ink.test.mjs).
// Mo's reference (30 Oct): the "anti-gravity ferrofluid speaker" — a black ink blot behind a back-lit window that
// clumps into one mass, bursts into a cloud of tiny bubbles, grows spikes, stretches, splits, grows like a tree or
// slumps to the bottom, all on the music. Here: ~56 droplets of different sizes (a few big, many tiny) pulled by a
// moving "magnet"; the music changes the magnet's strength and position and kicks the droplets:
//   - bass / sustained level: stronger field → the drops clump and the big ones grow spikes (shader);
//   - a kick: a burst — part of the drops shoot outwards from the magnet, then are pulled back in;
//   - a snare / sharp hit: a few small droplets split off a big one;
//   - highs: tiny drops jitter;
//   - every few bars the field changes its shape (mode): cloud, clump, star, tree (magnet low, spray upwards), puddle;
//   - silence: the field relaxes and the ink drifts slowly, zero gravity.

export const NDROP = 56;
export const WIN = 0.4;                 // window radius (drops stay inside, P() units)
export const MODES = ["clump", "cloud", "star", "tree", "puddle", "split"];

function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createInk(seed = 3) {
  const r = rng(seed), d = [];
  for (let i = 0; i < NDROP; i++) {
    const big = i < 2, mid = i >= 2 && i < 10;
    const rad = big ? 0.1 - 0.025 * i : mid ? 0.02 + 0.015 * r() : 0.008 + 0.009 * r();
    const a = r() * Math.PI * 2, dist = 0.05 + 0.25 * r();
    d.push({ x: Math.cos(a) * dist, y: Math.sin(a) * dist, vx: 0, vy: 0, r: rad, r0: rad, home: [r() - 0.5, r() - 0.5] });
  }
  return { d, rand: r, time: 0, mode: "clump", modeAt: 0, beat: null, snare: null, beats: 0, mag: [0, 0], field: 0.5, spike: 0, burst: 0 };
}

/** Where the magnet sits and how the field behaves in a mode. */
export function modeField(mode, t) {
  switch (mode) {
    case "cloud": return { m: [0.05 * Math.sin(t * 0.3), 0.04 * Math.cos(t * 0.23)], k: 0.8, sep: 1.5, spike: 0.2 };
    case "star": return { m: [0, 0.02], k: 2.6, sep: 0.55, spike: 1.0 };
    case "tree": return { m: [0, -WIN * 0.62], k: 1.8, sep: 1.0, spike: 0.55, lift: 1 };
    case "puddle": return { m: [0.06 * Math.sin(t * 0.4), -WIN * 0.7], k: 2.2, sep: 0.8, spike: 0.25 };
    case "split": return { m: [0.17 * Math.cos(t * 0.5), 0.1 * Math.sin(t * 0.7)], k: 1.8, sep: 1.0, spike: 0.5, two: 1 };
    default: return { m: [0.04 * Math.sin(t * 0.2), 0.03 * Math.sin(t * 0.27)], k: 2.0, sep: 0.55, spike: 0.45 };
  }
}

/**
 * Advance. a = measured audio { beatIdx, snareN, kick, snare, hit, level, energy, bands, flux, rest }.
 * Returns the state (mutated).
 */
export function stepInk(st, a = {}, dt = 1 / 60) {
  dt = clamp(dt, 0, 1 / 20);
  st.time += dt;
  const rest = a.rest || 0;
  const bands = a.bands || [];
  const low = ((bands[0] || 0) + (bands[1] || 0) + (bands[2] || 0) + (bands[3] || 0)) / 4;
  let hiS = 0; for (let i = 18; i < 30; i++) hiS += bands[i] || 0; const hi = hiS / 12;
  // the field follows the sound: louder lows → stronger magnet → clumping + spikes (soft music still moves it)
  const want = clamp(0.25 + 1.1 * low + 0.4 * (a.energy || 0), 0, 1.6) * (1 - 0.8 * rest);
  st.field += (want - st.field) * (1 - Math.exp(-dt * 6));
  const F = modeField(st.mode, st.time);
  st.spike += (clamp(F.spike * st.field * 1.2 + 0.6 * (a.kick || 0) * F.spike, 0, 1.3) - st.spike) * (1 - Math.exp(-dt * 12));
  // beats: bursts, and every 8–16 beats a new shape
  const bi = a.beatIdx ?? 0, sn = a.snareN ?? 0;
  if (st.beat === null) { st.beat = bi; st.snare = sn; }
  if (bi !== st.beat) {
    st.beat = bi; st.beats++;
    const s = clamp(Math.max(a.kick || 0, a.hit || 0), 0, 1.2) * (1 - 0.8 * rest);
    if (s > 0.1) burst(st, s);
    if (st.beats - st.modeAt >= 8 + Math.floor(st.rand() * 9)) {
      st.modeAt = st.beats;
      let next; do next = MODES[Math.floor(st.rand() * MODES.length)]; while (next === st.mode);
      st.mode = next;
    }
  }
  if (sn !== st.snare) { st.snare = sn; const s = clamp(Math.max(a.snare || 0, a.hit || 0), 0, 1) * (1 - 0.8 * rest); if (s > 0.15) splitOff(st, s); }
  // forces
  const k = F.k * (0.7 + st.field), m = F.m;
  st.mag = m;
  for (let i = 0; i < NDROP; i++) {
    const p = st.d[i];
    let tx = m[0], ty = m[1];
    if (F.two) { const side = i % 2 ? 1 : -1; tx = m[0] * side; ty = m[1] * side; }
    if (F.lift && p.r < 0.03) { ty = m[1] + 0.18 + 0.3 * ((i * 0.618) % 1); tx = m[0] + 0.25 * (((i * 0.382) % 1) - 0.5); }  // tree: spray stands above the trunk
    // small drops hang in a cloud around the mass (zero gravity), each at its own spot; the cloud mode spreads it
    if (p.r0 < 0.02) { const sh = st.mode === "cloud" ? 0.55 : st.mode === "star" ? 0.22 : 0.32; tx += p.home[0] * sh; ty += p.home[1] * sh; }
    let fx = (tx - p.x) * k, fy = (ty - p.y) * k;
    // small drops are pulled less (they hang around the mass like a cloud)
    const w = clamp(p.r / 0.05, 0.6, 1.2);
    fx *= w; fy *= w;
    // zero-gravity drift and high-note jitter
    fx += 0.05 * Math.sin(st.time * 0.7 + i * 1.3) + (st.rand() - 0.5) * hi * 1.2 * (p.r < 0.02 ? 1 : 0.2);
    fy += 0.05 * Math.cos(st.time * 0.6 + i * 2.1) + (st.rand() - 0.5) * hi * 1.2 * (p.r < 0.02 ? 1 : 0.2);
    p.vx += fx * dt; p.vy += fy * dt;
  }
  // soft separation: drops touch and merge visually but do not collapse into one point
  for (let i = 0; i < NDROP; i++) for (let j = i + 1; j < NDROP; j++) {
    const p = st.d[i], q = st.d[j];
    const dx = q.x - p.x, dy = q.y - p.y, dd = Math.hypot(dx, dy) + 1e-5, min = (p.r + q.r) * F.sep;
    if (dd < min) {
      const push = (min - dd) * 3.5 * dt, ux = dx / dd, uy = dy / dd;
      const mp = p.r * p.r, mq = q.r * q.r, tot = mp + mq;
      p.vx -= ux * push * mq / tot * 8; p.vy -= uy * push * mq / tot * 8;
      q.vx += ux * push * mp / tot * 8; q.vy += uy * push * mp / tot * 8;
    }
  }
  const damp = Math.exp(-dt * 2.6);
  for (const p of st.d) {
    p.vx *= damp; p.vy *= damp;
    p.x += p.vx * dt; p.y += p.vy * dt;
    // the window is the boundary: drops roll along the glass
    const rr = Math.hypot(p.x, p.y), lim = WIN - p.r - 0.006;
    if (rr > lim) { const ux = p.x / rr, uy = p.y / rr; p.x = ux * lim; p.y = uy * lim; const vn = p.vx * ux + p.vy * uy; if (vn > 0) { p.vx -= 1.6 * vn * ux; p.vy -= 1.6 * vn * uy; } }
    p.r += (p.r0 - p.r) * (1 - Math.exp(-dt * 1.5));     // split drops grow back
  }
  st.burst *= Math.exp(-dt * 4);
  return st;
}

/** Kick: a burst — part of the ink shoots outwards from the magnet into a cloud of drops. */
export function burst(st, s) {
  st.burst = Math.max(st.burst, s);
  const share = 0.35 + 0.5 * Math.min(1, s);
  for (const p of st.d) {
    if (st.rand() > share) continue;
    const dx = p.x - st.mag[0], dy = p.y - st.mag[1], dd = Math.hypot(dx, dy) + 1e-3;
    const a = Math.atan2(dy, dx) + (st.rand() - 0.5) * 1.2;
    const v = (0.25 + 0.55 * st.rand()) * s * (p.r < 0.03 ? 1.0 : 0.25) * (0.4 + Math.min(1, dd * 6));
    p.vx += Math.cos(a) * v; p.vy += Math.sin(a) * v;
  }
}

/** Snare: a few tiny droplets split off a big drop and fly off. */
export function splitOff(st, s) {
  const big = st.d[Math.floor(st.rand() * 2)];
  const smalls = st.d.filter((p) => p.r0 < 0.02);
  const n = 2 + Math.floor(s * 4);
  for (let k = 0; k < n; k++) {
    const p = smalls[Math.floor(st.rand() * smalls.length)];
    const a = st.rand() * Math.PI * 2;
    p.x = big.x + Math.cos(a) * big.r; p.y = big.y + Math.sin(a) * big.r;
    p.vx = big.vx + Math.cos(a) * (0.4 + 0.6 * s); p.vy = big.vy + Math.sin(a) * (0.4 + 0.6 * s);
  }
  big.r = Math.max(big.r0 * 0.8, big.r * 0.93);
}

/** Pack for the shader: (x, y, r, spike amount for big drops) per drop. */
export function packInk(st, out) {
  st.d.forEach((p, i) => { out[i * 4] = p.x; out[i * 4 + 1] = p.y; out[i * 4 + 2] = p.r; out[i * 4 + 3] = p.r0 > 0.04 ? st.spike : 0; });
  return out;
}
