// Organic level envelope shared by simulated (rhythm.js) and measured (listen.js) bands, like hardware
// visualizers: a fast but not instant attack (~25 ms), an exponential release (~0.18 s), and peak caps that
// hang for a moment and then fall with gravity. All terms are exact in time, so 30/60/120 Hz look identical.

export const ATTACK = 40;     // 1/s  — rise rate (63 % in 25 ms)
export const RELEASE = 5.5;   // 1/s  — fall rate (63 % in 0.18 s)
export const HOLD = 0.22;     // s    — peak caps hang this long
export const GRAVITY = 2.4;   // 1/s² — then fall like a dropped object

const state = new WeakMap();
function stateFor(peaks) {
  let s = state.get(peaks);
  if (!s) {
    const n = peaks.length;
    s = { hold: new Float32Array(n), fall: new Float32Array(n), top: new Float32Array(n), last: new Float32Array(n).fill(-1) };
    state.set(peaks, s);
  }
  return s;
}

/** Move bands[i] towards target and update peaks[i]. dt in seconds. Returns the new band value. */
export function envelope(bands, peaks, i, target, dt) {
  const s = stateFor(peaks);
  const cur = bands[i];
  const k = 1 - Math.exp(-dt * (target > cur ? ATTACK : RELEASE));
  const v = cur + (target - cur) * k;
  bands[i] = v;
  if (peaks[i] !== s.last[i]) { s.top[i] = peaks[i]; s.hold[i] = HOLD; s.fall[i] = 0; }   // set from outside
  if (v >= s.top[i] || v >= peaks[i]) { s.top[i] = v; s.hold[i] = HOLD; s.fall[i] = 0; peaks[i] = v; }
  else {
    s.hold[i] -= dt;
    if (s.hold[i] < 0) { s.fall[i] += Math.min(dt, -s.hold[i]); s.hold[i] = 0; }
    peaks[i] = Math.max(v, s.top[i] - 0.5 * GRAVITY * s.fall[i] * s.fall[i]);
  }
  s.last[i] = peaks[i];
  return v;
}

/** Forget hold/fall state (e.g. when a test or a source switch overwrites the arrays). */
export function resetEnvelope(peaks) { state.delete(peaks); }
