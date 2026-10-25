// Waveform + spectrum history that the visuals draw (js/audio-data.js, waveFrom in js/listen.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { audioData, setWave, pushHistory, feedHistory, synthWave, WAVE_N, HIST_ROWS } from '../js/audio-data.js';
import { waveFrom } from '../js/listen.js';

const fresh = () => ({ bytes: new Uint8Array(WAVE_N * (HIST_ROWS + 1)), head: 0, live: false, acc: 0 });

test('waveform bytes: -1..1 maps to 0..255 in row 0', () => {
  const d = fresh(); const w = new Float32Array(WAVE_N); w[0] = -1; w[1] = 0; w[2] = 1; w[3] = 7;
  setWave(w, d);
  assert.deepEqual([...d.bytes.slice(0, 4)], [0, 128, 255, 255]);
});

test('history is a ring of 64 rows written at 30 rows per second', () => {
  const d = fresh(); const bands = new Float32Array(32).fill(0.5);
  feedHistory(bands, 1.0, d);                 // one second, capped at 4 rows per frame
  assert.ok(d.head >= 1 && d.head <= 4);
  const d2 = fresh(); for (let i = 0; i < 60; i++) feedHistory(bands, 1 / 60, d2);
  assert.equal(d2.head, 30 % HIST_ROWS);
  for (let i = 0; i < 70; i++) pushHistory(bands, d2);
  assert.ok(d2.head >= 0 && d2.head < HIST_ROWS);
  assert.equal(d2.bytes[(d2.head + 1) * WAVE_N], 128);
});

test('scope trace starts on a rising zero crossing and quiet sound is amplified', () => {
  const sr = 48000, n = 2048, f = 220, out = new Float32Array(WAVE_N);
  const quiet = new Float32Array(n).map((_, i) => 0.01 * Math.sin(2 * Math.PI * f * i / sr + 1.0));
  let g = { peak: 0.02 };
  for (let k = 0; k < 120; k++) g = waveFrom(quiet, out, g);   // the gain settles within ~2 s
  assert.ok(Math.max(...out) > 0.9, 'quiet tone fills the range');
  assert.ok(Math.abs(out[0]) < 0.2 && out[2] > out[0], 'trace starts near zero, rising');
  // same tone, different start phase → nearly the same picture (stable trace)
  const out2 = new Float32Array(WAVE_N);
  waveFrom(new Float32Array(n).map((_, i) => 0.01 * Math.sin(2 * Math.PI * f * i / sr + 2.5)), out2, g);
  const diff = out.reduce((s, v, i) => s + Math.abs(v - out2[i]), 0) / WAVE_N;
  assert.ok(diff < 0.15, `trace stands still (${diff.toFixed(3)})`);
});

test('simulated waveform follows loudness: silence is flat, music fills it', () => {
  const silent = synthWave(new Float32Array(32), 0, 1 / 60);
  assert.ok(Math.max(...silent.map(Math.abs)) < 0.01);
  let loud; for (let i = 0; i < 180; i++) loud = synthWave(new Float32Array(32).fill(0.6), 1, 1 / 60);   // loudness is smoothed (~0.4 s)
  assert.ok(Math.max(...loud.map(Math.abs)) > 0.9);
});

test('changing sound source clears all history and starts with a flat waveform', async () => {
  const {resetAudioData}=await import('../js/audio-data.js');
  const d=fresh();d.live=true;d.acc=.02;pushHistory(new Float32Array(32).fill(1),d);
  resetAudioData(d);
  assert.ok(d.bytes.slice(WAVE_N).every(v=>v===0));
  assert.ok(d.bytes.slice(0,WAVE_N).every(v=>v===128));
  assert.equal(d.head,0);assert.equal(d.acc,0);assert.equal(d.live,false);
});
