// Synthetic rhythm. Spotify/Last.fm give no audio, so the visuals follow a
// generated rhythm locked to the song position and the tapped BPM.
// Release rates use elapsed seconds so 30/60/120 Hz displays share the same envelope.

import { envelope } from "./envelope.js";

export function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function hash1(n, seed) { let t = (n * 374761393 + seed * 668265263) | 0; t = Math.imul(t ^ (t >>> 13), 1274126177); return ((t ^ (t >>> 16)) >>> 0) / 4294967296; }
export function noise(x, seed) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i, seed) * (1 - u) + hash1(i + 1, seed) * u; }
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;

export const NB = 32;
export const audio = {
  bands: new Float32Array(NB), peaks: new Float32Array(NB), flux: new Float32Array(NB),
  kick: 0, snareN: 0, hit: 0, snare: 0, hat: 0, energy: 0, level: 0, beat: 0, beatIdx: 0, t: 0, seed: 1,
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
    const low = kick * Math.pow(1 - f, 2.2) * 1.15;
    const mid = snare * Math.exp(-Math.pow((f - 0.45) / 0.18, 2)) * 0.8;
    const high = hat * Math.pow(f, 1.4) * 0.75;
    const target = clamp((base * 0.55 + low + mid + high) * energy * 0.95);
    sum += envelope(audio.bands, audio.peaks, i, target, elapsed);
    // onsets: the fresh part of each hit, in the frequencies it belongs to
    audio.flux[i] = clamp((Math.exp(-ph * 14) * Math.pow(1 - f, 2) + (beatIdx & 1 ? Math.exp(-ph * 14) : 0) * Math.exp(-Math.pow((f - 0.45) / 0.18, 2)) + Math.exp(-hp * 22) * Math.pow(f, 1.4) * 0.6) * energy);
  }
  audio.kick = kick * energy; audio.snare = snare * energy; audio.hat = hat * energy;
  audio.energy = energy; audio.level = sum / NB;
  audio.beat = ph; audio.beatIdx = beatIdx;
  audio.snareN = Math.floor((beatIdx + 1) / 2);
  audio.hit = Math.max(audio.kick, audio.snare * 0.85);
  audio.rest = (audio.rest ?? 0) + ((playing ? 0 : 1) - (audio.rest ?? 0)) * (1 - Math.exp(-elapsed * 2.2));   // paused song = rest
  audio.t = t; audio.seed = seed;
}
