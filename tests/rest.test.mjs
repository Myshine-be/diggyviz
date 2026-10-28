import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDetector, processSpectrum } from '../js/listen.js';
import { audio, analyse } from '../js/rhythm.js';

const fresh = () => ({ bands: new Float32Array(32), peaks: new Float32Array(32) });
const music = (n) => { const s = new Uint8Array(1024); for (let i = 0; i < 400; i++) s[i] = 140 + 40 * Math.sin(i * 0.3 + n * 0.5) + (n % 30 < 3 && i < 12 ? 60 : 0); return s; };

test('a real break in the song becomes a rest; music brings it back', () => {
  const st = makeDetector(48000, 2048), out = fresh();
  for (let n = 0; n < 300; n++) processSpectrum(st, music(n), 1 / 60, out);
  assert.ok(out.rest < 0.05, `playing: rest ${out.rest}`);
  const quiet = new Uint8Array(1024).fill(8);
  for (let n = 0; n < 120; n++) processSpectrum(st, quiet, 1 / 60, out);
  assert.ok(out.rest > 0.8, `break: rest ${out.rest}`);
  for (let n = 0; n < 120; n++) processSpectrum(st, music(n), 1 / 60, out);
  assert.ok(out.rest < 0.1, `back: rest ${out.rest}`);
});

test('a short gap (< 0.4 s) is not a rest, and a steadily quiet song is not a rest', () => {
  const st = makeDetector(48000, 2048), out = fresh();
  for (let n = 0; n < 300; n++) processSpectrum(st, music(n), 1 / 60, out);
  for (let n = 0; n < 15; n++) processSpectrum(st, new Uint8Array(1024).fill(8), 1 / 60, out);
  assert.ok(out.rest < 0.05);
  const st2 = makeDetector(48000, 2048), o2 = fresh();
  const soft = (n) => music(n).map((v) => v * 0.55);
  for (let n = 0; n < 900; n++) processSpectrum(st2, soft(n), 1 / 60, o2);
  assert.ok(o2.rest < 0.1, `quiet song: rest ${o2.rest}`);
});

test('simulated rhythm: a paused song is a rest, playing is not', () => {
  for (let i = 0; i < 120; i++) analyse(30000, false, 3, 120, 0, 1 / 60);
  assert.ok(audio.rest > 0.9);
  for (let i = 0; i < 120; i++) analyse(30000 + i * 16, true, 3, 120, 0, 1 / 60);
  assert.ok(audio.rest < 0.1);
});
