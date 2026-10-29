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
