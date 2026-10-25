import test from 'node:test';
import assert from 'node:assert/strict';
import { audio, analyse } from '../js/rhythm.js';
import { bandEdges, makeDetector, processSpectrum } from '../js/listen.js';

const SR = 48000, FFT = 2048, HZ = SR / FFT;
const fresh = () => ({ bands: new Float32Array(32), peaks: new Float32Array(32) });

// Byte spectrum with a kick (loud lows) every `beat` seconds, plus some music in the mids.
function spectrumAt(t, { beat = 0.5, bassLevel = 230, quietBass = 40 } = {}) {
  const spec = new Uint8Array(FFT / 2);
  const ph = (t % beat) / beat;
  const kick = Math.exp(-ph * 12);
  for (let i = 0; i < spec.length; i++) {
    const f = i * HZ;
    let v = 70 * Math.exp(-((f - 1000) ** 2) / (2 * 900 ** 2)) + 30;
    if (f >= 30 && f <= 150) v = quietBass + (bassLevel - quietBass) * kick;
    spec[i] = Math.max(0, Math.min(255, v));
  }
  return spec;
}

test('band edges are ordered, cover 30 Hz–12 kHz and never empty', () => {
  const e = bandEdges(SR, FFT);
  assert.equal(e.length, 32);
  for (const [a, b] of e) assert.ok(b > a);
  for (let i = 1; i < e.length; i++) assert.ok(e[i][0] >= e[i - 1][0]);
  assert.ok(e[31][1] * HZ >= 11000);
});

test('listening mode detects kicks, finds the tempo and punches on bass hits', () => {
  const st = makeDetector(SR, FFT), out = fresh();
  const dt = 1 / 60;
  let kicks = 0, prev = 0, maxPunch = 0;
  for (let n = 0; n < 60 * 12; n++) {
    const t = n * dt;
    processSpectrum(st, spectrumAt(t, { beat: 0.5 }), dt, out);
    if (st.beatIdx !== prev) { kicks++; prev = st.beatIdx; }
    if (t > 4) maxPunch = Math.max(maxPunch, out.punch);
  }
  assert.ok(kicks >= 20 && kicks <= 25, `about 24 kicks in 12 s, got ${kicks}`);
  assert.ok(Math.abs(st.bpm - 120) < 6, `tempo ~120, got ${st.bpm.toFixed(1)}`);
  assert.ok(maxPunch > 0.8, `strong punch on heavy bass, got ${maxPunch.toFixed(2)}`);
});

test('heavy bass punches harder than light bass', () => {
  const run = (bassLevel) => {
    const st = makeDetector(SR, FFT), out = fresh(); let m = 0;
    // a quiet calibration stretch, then the song
    for (let n = 0; n < 60 * 3; n++) processSpectrum(st, spectrumAt(n / 60, { bassLevel: 120, quietBass: 40 }), 1 / 60, out);
    for (let n = 0; n < 60 * 3; n++) { processSpectrum(st, spectrumAt(n / 60, { bassLevel, quietBass: 40 }), 1 / 60, out); m = Math.max(m, out.punch); }
    return m;
  };
  assert.ok(run(250) > run(110) + 0.15);
});

test('silence produces no kicks and no drop', () => {
  const st = makeDetector(SR, FFT), out = fresh();
  const silence = new Uint8Array(FFT / 2);
  for (let n = 0; n < 600; n++) processSpectrum(st, silence, 1 / 60, out);
  assert.equal(st.beatIdx, 0);
  assert.equal(out.boom, 0);
  assert.ok(out.punch < 1e-6);
});

test('a heavy drop after a quiet stretch triggers a boom', () => {
  const st = makeDetector(SR, FFT), out = fresh(); let boom = 0;
  for (let n = 0; n < 60 * 5; n++) processSpectrum(st, spectrumAt(n / 60, { bassLevel: 70, quietBass: 30 }), 1 / 60, out);
  for (let n = 0; n < 60 * 2; n++) { processSpectrum(st, spectrumAt(n / 60, { bassLevel: 255, quietBass: 200 }), 1 / 60, out); boom = Math.max(boom, out.boom); }
  assert.ok(boom > 0.8, `boom ${boom}`);
});

test('simulated rhythm: punch on the beat, nothing between beats, finite values', () => {
  analyse(30000, true, 7, 120, 0, 1 / 60);
  assert.ok(audio.punch > 0.3);
  analyse(30250, true, 7, 120, 0, 1 / 60);
  assert.ok(audio.punch < 0.01);
  for (const k of ['bass', 'punch', 'boom']) assert.ok(Number.isFinite(audio[k]) && audio[k] >= 0 && audio[k] <= 1, k);
  analyse(30000, false, 7, 120, 0, 1 / 60);
  assert.equal(audio.punch, 0);
  assert.equal(audio.boom, 0);
});
