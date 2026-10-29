import test from 'node:test';
import assert from 'node:assert/strict';
import { DUNE, createDuneField, stepDunes, ridgeSize, ridgeField, ridgeAmp, toHalf, bakeDunes } from '../js/visuals/dune-ridges.js';

const run = (beats, secs = 3) => {           // beats: [[time, strength]]
  const st = createDuneField(); let cam = 0, b = 0;
  for (let t = 0; t < secs; t += 1 / 60) {
    const hit = beats.find(([bt]) => Math.abs(bt - t) < 1 / 120);
    if (hit) b++;
    cam += 0.9 / 60;
    stepDunes(st, { beatIdx: b, hit: hit ? hit[1] : 0, kick: 0, rest: 0 }, 1 / 60, cam);
  }
  return st;
};

test('beat strength sets the size: soft beats small swells, strong beats big dunes, always capped', () => {
  assert.ok(ridgeSize(0.15).h < ridgeSize(0.9).h * 0.5);
  assert.ok(ridgeSize(0.9).w > ridgeSize(0.15).w);
  assert.ok(ridgeSize(5).h <= DUNE.HMAX);
});

test('each clear beat makes a ridge far ahead; hits close together merge into one', () => {
  const apart = run([[0.5, 0.8], [1.2, 0.8], [1.9, 0.8]]);
  assert.equal(apart.ridges.length, 3);
  assert.ok(apart.ridges.every((r) => r.z > 10));
  const close = run([[0.5, 0.6], [0.6, 0.6], [0.7, 0.6]]);
  assert.equal(close.ridges.length, 1);
  assert.ok(close.ridges[0].h <= DUNE.HMAX && close.ridges[0].h > ridgeSize(0.6).h);
});

test('a ridge rises smoothly, then keeps its shape while the camera passes', () => {
  const st = run([[0.2, 0.8]], 0.4);
  const r = st.ridges[0];
  const early = ridgeAmp(st, r);
  assert.ok(early > 0 && early < r.h);
  const later = run([[0.2, 0.8]], 3);
  const r2 = later.ridges[0];
  assert.equal(ridgeAmp(later, r2), r2.h);
  const h1 = ridgeField(later, 0.3, r2.z);
  stepDunes(later, { beatIdx: later.lastBeat, hit: 0 }, 1, later.camZ + 1);
  assert.equal(ridgeField(later, 0.3, r2.z), h1);                 // world-locked: shape kept
});

test('soft beats are ignored below the threshold; silence makes no new dunes', () => {
  assert.equal(run([[0.5, 0.03], [1.0, 0.02]]).ridges.length, 0);
  assert.equal(run([], 3).ridges.length, 0);
});

test('heights never exceed the cap, a beat raises a veil at once', () => {
  const st = run(Array.from({ length: 20 }, (_, i) => [0.1 + i * 0.12, 1.4]), 3);
  for (let z = st.camZ; z < st.camZ + 18; z += 0.1) for (let x = -5; x <= 5; x += 0.5) assert.ok(ridgeField(st, x, z) <= DUNE.HMAX + 1e-9);
  const v = createDuneField(); stepDunes(v, { beatIdx: 0 }, 1 / 60, 0); stepDunes(v, { beatIdx: 1, hit: 0.9 }, 1 / 60, 0);
  assert.ok(v.veil > 0.8);
});

test('half floats and baking', () => {
  assert.equal(toHalf(0), 0); assert.equal(toHalf(1), 0x3c00); assert.equal(toHalf(0.5), 0x3800);
  const st = run([[0.5, 0.9]], 2);
  const out = bakeDunes(st, new Uint16Array(DUNE.cols * DUNE.rows));
  assert.ok(out.some((v) => v > 0));
});
