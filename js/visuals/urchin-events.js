// Urchin: which spikes react to which hit. Pure logic (tested in tests/urchin.test.mjs), used by urchin.js.
// Every measured hit becomes an event with a direction (a cluster of spikes), a kind and a strength:
//  - deep bass / low kick → "bass": a BROAD group (≈ 55°), biased to the bottom of the ball, shoots far out;
//  - higher kick, snare, sharp hit → "sharp": a COMPACT group (≈ 20°), biased to the top and sides, faster.
// Some clear hits also start a wave that travels over the surface from that cluster (never two in a row, about one
// in three clear hits), so not every beat looks the same. Directions are in VIEW space (x right, y up, z to you).

export const MAXEV = 6;
export const EVENT = { bassRad: 0.95, sharpRad: 0.36, life: 1.6, waveMin: 0.5 };

function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const mean = (a, i0, i1) => { let s = 0; for (let i = i0; i < i1; i++) s += a?.[i] ?? 0; return s / (i1 - i0); };

export function createUrchinEvents() {
  return { ev: [], time: 0, kickN: null, snareN: null, n: 0, lastWave: false, clearCount: 0 };
}

/** Direction for event n of a kind: bass towards the bottom, sharp towards top and sides; varies every time. */
export function eventDir(n, kind) {
  const az = n * 2.39996 + hash(n) * 0.8;                       // golden angle: always a different side
  const y = kind === "bass" ? -0.25 - 0.6 * hash(n + 7) : -0.1 + 0.95 * hash(n + 7);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  return [Math.cos(az) * r, y, Math.sin(az) * r];
}

function push(st, kind, strength) {
  st.n++;
  const clear = strength >= EVENT.waveMin;
  let wave = false;
  if (clear) { st.clearCount++; wave = !st.lastWave && hash(st.n * 3.7) < 0.36; }
  if (clear) st.lastWave = wave;
  st.ev.push({ dir: eventDir(st.n, kind), born: st.time, s: Math.min(1.2, strength), rad: kind === "bass" ? EVENT.bassRad : EVENT.sharpRad, wave, kind });
  while (st.ev.length > MAXEV) st.ev.shift();
}

/** Advance with the measured audio a = { beatIdx, snareN, kick, snare, hit, bands, rest }. */
export function stepUrchin(st, a, dt) {
  st.time += dt;
  const kn = a?.beatIdx ?? 0, sn = a?.snareN ?? 0;
  if (st.kickN === null) { st.kickN = kn; st.snareN = sn; }
  const rest = a?.rest ?? 0;
  if (kn !== st.kickN) {
    st.kickN = kn;
    const s = Math.max(a?.kick ?? 0, a?.hit ?? 0) * (1 - 0.8 * rest);
    const lo = mean(a?.bands, 0, 5), hi = mean(a?.bands, 12, 26);
    if (s > 0.05) push(st, lo >= hi * 1.15 ? "bass" : "sharp", s);
  }
  if (sn !== st.snareN) {
    st.snareN = sn;
    const s = Math.max(a?.snare ?? 0, a?.hit ?? 0) * (1 - 0.8 * rest);
    if (s > 0.05) push(st, "sharp", s * 0.9);
  }
  st.ev = st.ev.filter((e) => st.time - e.born < EVENT.life);
  return st;
}

/** Pack for the shader: A[i] = (dir.xyz, age), B[i] = (strength, radius, wave, kind 0 bass / 1 sharp). */
export function packEvents(st, A, B) {
  A.fill(0); B.fill(0);
  st.ev.forEach((e, i) => {
    A.set([...e.dir, st.time - e.born], i * 4);
    B.set([e.s, e.rad, e.wave ? 1 : 0, e.kind === "bass" ? 0 : 1], i * 4);
  });
}

// ---- spike lengths, computed here once per frame (not per pixel and raymarch step: that made 3.0.0 three times
// slower than 2.9 on the GPU, which lowered the render resolution and added delay) ----
export const NSPIKES = 420;
const PHI = 1.61803398875;

/** Direction of spike i on the spherical Fibonacci lattice (same as sfNearest in urchin.js). */
export function spikeDir(i, n = NSPIKES) {
  const m = 1 - 1 / n, ph = 2 * Math.PI * ((i * PHI) % 1), ct = m - 2 * i / n, st = Math.sqrt(Math.max(0, 1 - ct * ct));
  return [Math.cos(ph) * st, Math.sin(ph) * st, ct];
}
const DIRS = Array.from({ length: NSPIKES }, (_, i) => spikeDir(i));
const H1 = DIRS.map((_, i) => hash(i * 1.7 + 3.1)), H2 = DIRS.map((_, i) => hash(i * 5.3 + 0.7));

/** orient() of urchin.js (column-major mat3, rx * ry) applied to v. */
export function orientMul(time, songTime, v) {
  const a = time * 0.13 + songTime * 0.05, b = time * 0.09;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const y = [ca * v[0] - sa * v[2], v[1], sa * v[0] + ca * v[2]];          // ry * v
  return [y[0], cb * y[1] + sb * y[2], -sb * y[1] + cb * y[2]];            // rx * y
}
const lerpArr = (arr, x) => { if (!arr) return 0; const f = Math.min(1, Math.max(0, x)) * 31, i = Math.floor(f), j = Math.min(i + 1, 31); return arr[i] + (arr[j] - arr[i]) * (f - i); };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Length of every spike now (0.05 … 0.86). f = { time, songTime, audio: { bands, flux, rest }, drop, seed }.
 * Same rules as before: pitch zones by screen height (lows bottom, highs top), own sensitivity and recovery per spike,
 * clusters and waves from the events, fast out / slower back, bounded so tips stay inside the bounding sphere.
 */
export function spikeLengths(st, f, out) {
  const up = orientMul(f.time || 0, f.songTime || 0, [0, 1, 0]);
  const ev = st.ev.map((e) => ({ d: orientMul(f.time || 0, f.songTime || 0, e.dir), age: st.time - e.born, s: e.s, rad: e.rad, wave: e.wave, sharp: e.kind === "bass" ? 0 : 1 }));
  const A = f.audio || {}, rest = A.rest || 0, t = f.time || 0, seed = f.seed || 0;
  for (let i = 0; i < NSPIKES; i++) {
    const q = DIRS[i], h1 = H1[i], h2 = H2[i];
    const sens = 0.6 + 0.8 * h1, tau = 0.15 + 0.30 * h2;
    const ys = q[0] * up[0] + q[1] * up[1] + q[2] * up[2];
    const wob = Math.sin(q[0] * 3.1 + q[2] * 2.3 + seed * 0.01) * Math.sin(q[1] * 2.7 - q[0] * 1.9);
    const fq = Math.min(1, Math.max(0, 0.5 + 0.42 * ys + 0.15 * wob));
    let raw = 0.06 + 0.22 * Math.pow(lerpArr(A.bands, fq), 1.8) * sens;
    const grp = sstep(0.4, 0.9, Math.sin(q[0] * 9 + t * 0.7) * Math.sin(q[1] * 8 - t * 0.5) * Math.sin(q[2] * 7 + t * 0.3) + 0.5);
    raw += 0.55 * lerpArr(A.flux, fq) * sens * (0.25 + 0.75 * grp) * sstep(0.35, 0.7, fq);
    for (const e of ev) {
      const cd = q[0] * e.d[0] + q[1] * e.d[1] + q[2] * e.d[2];
      if (cd < -0.2 && !e.wave) continue;
      const ang = Math.sqrt(Math.max(0, 2 * (1 - cd))) * (1 + 0.08 * (1 - cd));
      const cl = Math.exp(-((ang / e.rad) ** 2) * 2);
      const att = sstep(0, e.sharp ? 0.025 : 0.04, e.age);
      const rel = Math.exp(-e.age / (tau * (e.sharp ? 0.7 : 1)));
      raw += e.s * (e.sharp ? 1.7 : 2.6) * sens * cl * att * rel;
      if (e.wave) {
        const front = e.rad * 0.5 + e.age * (e.sharp ? 4.5 : 3.2);
        raw += e.s * 1.3 * sens * Math.exp(-(((ang - front) / 0.25) ** 2)) * (ang >= e.rad * 0.4 ? 1 : 0) * Math.exp(-e.age / 0.7);
      }
    }
    raw += (f.drop || 0) * 0.4;
    raw *= 1 - 0.75 * rest;
    out[i] = 0.05 + 0.81 * (1 - Math.exp(-raw * (0.85 + 0.3 * h2)));
  }
  return out;
}
