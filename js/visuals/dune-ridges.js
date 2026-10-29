// Dunes: the music builds the desert. Pure logic (tested in tests/dunes.test.mjs), used by landscape.js.
// Every measured beat raises a new ridge far ahead of the camera: its strength sets height and width (soft beats
// make small swells, strong beats big dunes), hits close together merge into one coherent ridge, a ridge rises
// smoothly in RISE seconds and then keeps its shape while the camera passes — a trail of the music.
// Heights are saturated and capped so the horizon and the lyrics in the sky always stay free.

export const DUNE = { zFar: 16, xHalf: 9, HMAX: 0.45, RISE: 0.8, MERGE: 0.3, cols: 96, rows: 128, zMin: -1.5 };

const ease = (x) => x * x * (3 - 2 * x);

export function createDuneField(seed = 1) {
  return { ridges: [], time: 0, camZ: 0, lastBeat: null, seed, veil: 0, veilX: 0, n: 0 };
}

/** Height and width of a new ridge for a beat strength 0..1 (saturated, never above HMAX). */
export function ridgeSize(strength) {
  const s = Math.max(0, Math.min(1.5, strength));
  return { h: DUNE.HMAX * (1 - Math.exp(-2.4 * s)), w: 0.9 + 1.5 * (1 - Math.exp(-1.8 * s)) };
}

/**
 * Advance the field. a = { beatIdx, hit, kick, rest } from the measured audio, camZ = camera position.
 * Returns the field (mutated).
 */
export function stepDunes(st, a, dt, camZ) {
  st.time += dt; st.camZ = camZ;
  const beat = a?.beatIdx ?? 0;
  if (st.lastBeat === null) st.lastBeat = beat;
  const strength = Math.max(a?.hit ?? 0, a?.kick ?? 0) * (1 - 0.8 * (a?.rest ?? 0));
  if (beat !== st.lastBeat) {
    st.lastBeat = beat;
    if (strength > 0.06) {
      const last = st.ridges[st.ridges.length - 1];
      const sz = ridgeSize(strength);
      if (last && st.time - last.born < DUNE.MERGE) {            // close hits: one coherent ridge, no wall of spikes
        last.h = Math.min(DUNE.HMAX, Math.max(last.h, sz.h) + 0.25 * Math.min(last.h, sz.h));
        last.w = Math.min(2.6, Math.max(last.w, sz.w) + 0.2);
      } else {
        st.n++;
        st.ridges.push({ z: camZ + DUNE.zFar, born: st.time, h: sz.h, w: sz.w, seed: (st.n * 2.399 + st.seed) % 6.283 });
      }
      // the current beat is also visible at once close by: a veil of sand blown off a near crest
      st.veil = Math.max(st.veil, Math.min(1, strength));
      st.veilX = ((st.n * 0.618 + 0.3) % 1) * 2 - 1;
    }
  }
  st.veil *= Math.exp(-dt / 0.45);
  while (st.ridges.length && st.ridges[0].z < camZ + DUNE.zMin - 3) st.ridges.shift();
  return st;
}

/** Current height of one ridge (rising smoothly after its birth). */
export const ridgeAmp = (st, r) => r.h * ease(Math.min(1, (st.time - r.born) / DUNE.RISE));

// dune cross-section: gentle windward slope towards the viewer, steep lee side, sharp crest
function profile(u) {
  if (u < 0) return Math.pow(Math.max(0, 1 + u / 1.5), 1.8);
  return Math.pow(Math.max(0, 1 - u / 0.55), 1.4);
}

/** Height of the beat ridges at world (x, z). */
export function ridgeField(st, x, z) {
  let h = 0;
  for (const r of st.ridges) {
    const dz = z - r.z;
    if (dz < -1.6 * r.w - 1 || dz > 0.6 * r.w + 1) continue;
    const crest = r.z + 0.45 * Math.sin(x * 0.55 + r.seed) + 0.25 * Math.sin(x * 1.3 - r.seed * 2);
    const along = 0.6 + 0.4 * Math.sin(x * 0.42 + r.seed * 3);          // a dune, not a wall: height varies along x
    h = Math.max(h, ridgeAmp(st, r) * along * profile((z - crest) / r.w));
  }
  return h;
}

// float → half float (for the R16F height texture)
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export function toHalf(v) {
  f32[0] = v; const x = u32[0];
  const sign = (x >> 16) & 0x8000, e = ((x >> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e <= 0) return sign;
  if (e >= 31) return sign | 0x7c00;
  return sign | (e << 10) | (m >> 13);
}

/** Bake the ridge heights around the camera into `out` (Uint16 half floats, cols × rows; row 0 = zMin). */
export function bakeDunes(st, out, cols = DUNE.cols, rows = DUNE.rows) {
  const z0 = st.camZ + DUNE.zMin, dz = (DUNE.zFar + 1 - DUNE.zMin) / (rows - 1), dx = (2 * DUNE.xHalf) / (cols - 1);
  for (let j = 0; j < rows; j++) {
    const z = z0 + j * dz;
    for (let i = 0; i < cols; i++) out[j * cols + i] = toHalf(ridgeField(st, -DUNE.xHalf + i * dx, z));
  }
  return out;
}
