// Synthetic rhythm. Spotify/Last.fm give no audio, so the visuals follow a
// generated rhythm locked to the song position and the tapped BPM.
// Release rates use elapsed seconds so 30/60/120 Hz displays share the same envelope.

export function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function hash1(n, seed) { let t = (n * 374761393 + seed * 668265263) | 0; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }
export function noise(x, seed) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i, seed) * (1 - u) + hash1(i + 1, seed) * u; }
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;

export const NB = 32;
export const audio = {
  bands: new Float32Array(NB), peaks: new Float32Array(NB),
  kick: 0, snare: 0, hat: 0, energy: 0, level: 0, beat: 0, beatIdx: 0, t: 0, seed: 1,
  bass: 0,   // low-end level 0..1
  punch: 0,  // bass hit with a sharp attack 0..1 (drives the impact layer)
  boom: 0,   // big drop 1 → 0
};

export function analyse(posMs, playing, seed, bpm, offMs, dt = 1 / 60) {
  const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 1 / 60;
  const beatLen = 60000 / bpm;
  const bp = (posMs - offMs) / beatLen;
  const ph = bp - Math.floor(bp);
  const beatIdx = Math.floor(bp);
  const bar = Math.floor(bp / 4);
  const kick = Math.exp(-ph * 6.5);
  const snare = (beatIdx & 1) ? Math.exp(-ph * 9) : 0;
  const hp = bp * 2 - Math.floor(bp * 2);
  const hat = Math.exp(-hp * 16) * (0.5 + 0.5 * noise(bp * 2, seed + 9));
  const intro = clamp(posMs / 8000);
  const section = 0.5 + 0.5 * noise(bar / 8, seed + 3);
  const energy = playing ? intro * (0.45 + 0.55 * section) : 0;
  const t = posMs / 1000;
  let sum = 0;
  for (let i = 0; i < NB; i++) {
    const f = i / (NB - 1);
    const base = noise(t * (1.4 + f * 3) + i * 3.7, seed) * (1 - f * 0.55);
    const low = kick * Math.pow(1 - f, 2.2) * 1.35;
    const mid = snare * Math.exp(-Math.pow((f - 0.45) / 0.18, 2)) * 0.8;
    const high = hat * Math.pow(f, 1.4) * 0.75;
    const target = clamp((base * 0.55 + low + mid + high) * energy * 0.95);
    const cur = audio.bands[i];
    audio.bands[i] = target > cur ? target : Math.max(target, cur - 2.1 * elapsed);
    audio.peaks[i] = Math.max(audio.peaks[i] - 0.48 * elapsed, audio.bands[i]);
    sum += audio.bands[i];
  }
  audio.kick = kick * energy; audio.snare = snare * energy; audio.hat = hat * energy;
  audio.energy = energy; audio.level = sum / NB;
  // Bass impact: louder sections hit harder; every 16 bars an energetic section can open with a drop.
  audio.punch = clamp(Math.exp(-ph * 11) * energy * (0.55 + 0.6 * section));
  audio.bass = clamp(kick * energy * 0.9 + energy * section * 0.2);
  const block = Math.floor(bp / 64), bb = bp - block * 64;
  // noise() is 0..1; the block opens with a drop when its section is louder than average.
  audio.boom = block >= 1 && posMs > 8000 && noise((block * 16) / 8, seed + 3) > 0.5 ? Math.exp(-bb * 0.8) * energy : 0;
  audio.beat = ph; audio.beatIdx = beatIdx;
  audio.t = t; audio.seed = seed;
}
