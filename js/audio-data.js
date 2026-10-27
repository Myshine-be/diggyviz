// What the shaders can "see" of the sound, in one small texture (128 x 65, one byte per texel):
//   row 0      the waveform (128 points, 0..255 = -1..1), like an oscilloscope
//   rows 1-64  spectrum history: one row of 32 bands every 1/30 s (≈ 2.1 s), ring buffer at `head`
// In listening mode both come from the microphone (real sound). Otherwise the waveform is synthesised
// from the simulated bands and the history records the simulated bands, so every visual has one code path.

export const WAVE_N = 128, HIST_ROWS = 64, HIST_RATE = 30, NB = 32;

export const audioData = {
  bytes: new Uint8Array(WAVE_N * (HIST_ROWS + 1)),
  head: 0,          // row (0..63) of the newest spectrum
  live: false,      // true while the microphone feeds real sound
  acc: 0,           // time since the last history row
};

/** Clear history when changing between microphone and simulation: never blend fake and real sound. */
export function resetAudioData(data = audioData) {
  data.bytes.fill(0); data.bytes.fill(128, 0, WAVE_N);
  data.head = 0; data.acc = 0; data.live = false;
}
resetAudioData();

/** Store a waveform of -1..1 values (length WAVE_N). */
export function setWave(w, data = audioData) {
  const b = data.bytes;
  for (let i = 0; i < WAVE_N; i++) b[i] = Math.max(0, Math.min(255, Math.round((w[i] * 0.5 + 0.5) * 255)));
}

/** Push one spectrum row (bands 0..1) into the history ring. */
export function pushHistory(bands, data = audioData) {
  data.head = (data.head + 1) % HIST_ROWS;
  const o = (data.head + 1) * WAVE_N, b = data.bytes;
  for (let i = 0; i < NB; i++) b[o + i] = Math.max(0, Math.min(255, Math.round(bands[i] * 255)));
}

/** Advance the history clock; pushes a row every 1/HIST_RATE s (at most a few per frame). */
export function feedHistory(bands, dt, data = audioData) {
  data.acc += Math.max(0, Math.min(dt, 0.25));
  let n = 0;
  while (data.acc >= 1 / HIST_RATE && n < 4) { data.acc -= 1 / HIST_RATE; pushHistory(bands, data); n++; }
  if (n === 4) data.acc = 0;
  // the newest row stays live until the next push, so "now" in the history is never up to 33 ms old
  const o = (data.head + 1) * WAVE_N, b = data.bytes;
  for (let i = 0; i < NB; i++) b[o + i] = Math.max(0, Math.min(255, Math.round(bands[i] * 255)));
}

const synth = new Float32Array(WAVE_N);
let phase = 0, lvl = 0;
/**
 * Waveform for simulated mode: a sum of tones whose loudness follows the bands (lows = slow waves,
 * highs = fast ripples). Scrolls slowly like a scope trace and is normalised to fill the range.
 */
export function synthWave(bands, kick, dt, out = synth) {
  phase += Math.max(0, Math.min(dt, 0.1));
  let peak = 1e-3;
  for (let i = 0; i < WAVE_N; i++) {
    const x = i / (WAVE_N - 1);
    let v = 0;
    for (let k = 0; k < 6; k++) {
      const amp = bands[Math.min(31, k * 6)] * (1 - k * 0.1);
      v += Math.sin((x * (1.5 + k * 3.1) + phase * (0.6 + k * 0.45)) * Math.PI * 2 + k * 1.7) * amp;
    }
    v += Math.sin(x * Math.PI * 3 - phase * 2) * kick * 0.8;
    out[i] = v; peak = Math.max(peak, Math.abs(v));
  }
  const level = bands.reduce((s, b) => s + b, 0) / bands.length;
  lvl += (level - lvl) * (1 - Math.exp(-Math.max(0, Math.min(dt, 0.1)) * 2.5));   // smooth loudness: the shape shows the beat, not the brightness
  const g = Math.min(1, lvl * 2.2) / peak;
  for (let i = 0; i < WAVE_N; i++) out[i] *= g;
  return out;
}

/**
 * Smooth view of the spectrum history for organic line visuals (uniform uHistS, sampled with histSmooth()).
 * out: 64 bands x 64 rows (Uint8Array 4096), row 0 = newest. Bands are upsampled 32 → 64 with Catmull-Rom
 * and both axes get a gentle 1-2-1 blur, so curves have no corners and rows have no steps. Linear texture
 * filtering plus uHistFrac (sub-row time) then makes the scroll continuous at any display refresh rate.
 */
const tmp = new Float32Array(64 * 64);
export function buildSmoothHistory(data = audioData, out = new Uint8Array(64 * 64)) {
  const b = data.bytes;
  for (let r = 0; r < HIST_ROWS; r++) {
    const o = (((data.head - r) % HIST_ROWS + HIST_ROWS) % HIST_ROWS + 1) * WAVE_N;
    for (let j = 0; j < 64; j++) {
      const x = (j / 63) * (NB - 1), i = Math.floor(x), t = x - i;
      const p0 = b[o + Math.max(0, i - 1)], p1 = b[o + i], p2 = b[o + Math.min(NB - 1, i + 1)], p3 = b[o + Math.min(NB - 1, i + 2)];
      const v = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      tmp[r * 64 + j] = v;
    }
  }
  for (let r = 0; r < 64; r++) {
    const ra = Math.max(0, r - 1), rb = Math.min(63, r + 1);
    for (let j = 0; j < 64; j++) {
      const ja = Math.max(0, j - 1), jb = Math.min(63, j + 1);
      const freq = (tmp[r * 64 + ja] + 2 * tmp[r * 64 + j] + tmp[r * 64 + jb]) * 0.25;
      const time = (tmp[ra * 64 + j] + 2 * tmp[r * 64 + j] + tmp[rb * 64 + j]) * 0.25;
      const v = r === 0 ? freq : (freq + time) * 0.5;   // the newest row is not blurred back in time
      out[r * 64 + j] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
  }
  return out;
}
