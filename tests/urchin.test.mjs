import test from 'node:test';
import assert from 'node:assert/strict';
import { createUrchinEvents, stepUrchin, packEvents, eventDir, EVENT, MAXEV } from '../js/visuals/urchin-events.js';

const bassBands = Array.from({ length: 32 }, (_, i) => (i < 5 ? 0.9 : 0.2));
const hiBands = Array.from({ length: 32 }, (_, i) => (i > 12 ? 0.8 : 0.2));

function hits(list) {             // list of [kind 'k'|'s', strength, bands]
  const st = createUrchinEvents(); let kn = 0, sn = 0;
  stepUrchin(st, { beatIdx: 0, snareN: 0 }, 1 / 60);
  for (const [k, s, bands] of list) {
    if (k === 'k') kn++; else sn++;
    stepUrchin(st, { beatIdx: kn, snareN: sn, kick: k === 'k' ? s : 0, snare: k === 's' ? s : 0, hit: s, bands }, 1 / 60);
    for (let i = 0; i < 20; i++) stepUrchin(st, { beatIdx: kn, snareN: sn, bands }, 1 / 60);
  }
  return st;
}

test('deep bass makes a broad group at the bottom; snares and sharp hits a compact group higher up', () => {
  const b = hits([['k', 0.9, bassBands]]).ev[0];
  assert.equal(b.kind, 'bass'); assert.equal(b.rad, EVENT.bassRad); assert.ok(b.dir[1] < -0.2);
  const s = hits([['s', 0.9, hiBands]]).ev[0];
  assert.equal(s.kind, 'sharp'); assert.ok(s.rad < b.rad * 0.5); assert.ok(s.dir[1] > -0.15);
  assert.equal(hits([['k', 0.9, hiBands]]).ev[0].kind, 'sharp');          // a high kick is sharp too
});

test('every hit picks another cluster; directions are unit vectors', () => {
  const st = hits(Array.from({ length: 5 }, () => ['k', 0.8, bassBands]));
  const d = st.ev.map((e) => e.dir);
  for (const v of d) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-9);
  for (let i = 1; i < d.length; i++) assert.ok(Math.hypot(d[i][0] - d[i - 1][0], d[i][2] - d[i - 1][2]) > 0.2);
  assert.ok(Math.hypot(...eventDir(3, 'sharp')) > 0.999);
});

test('waves: only on clear hits, never two in a row, not on every beat', () => {
  const st = createUrchinEvents(); let kn = 0, waves = 0, prev = false, clear = 0;
  stepUrchin(st, { beatIdx: 0, snareN: 0 }, 1 / 60);
  for (let i = 0; i < 60; i++) {
    kn++; const s = i % 4 === 0 ? 0.2 : 0.9;
    stepUrchin(st, { beatIdx: kn, snareN: 0, kick: s, hit: s, bands: bassBands }, 1 / 60);
    const e = st.ev[st.ev.length - 1];
    if (s < EVENT.waveMin) assert.equal(e.wave, false);
    else { clear++; assert.ok(!(prev && e.wave)); prev = e.wave; }
    if (e.wave) waves++;
  }
  assert.ok(waves > 3 && waves < clear * 0.6, `waves ${waves} of ${clear}`);
});

test('silence and rest: no events; old events expire; at most MAXEV at once', () => {
  assert.equal(hits([['k', 0.02, bassBands]]).ev.length, 0);
  const st = hits(Array.from({ length: 12 }, () => ['k', 0.8, bassBands]));
  assert.ok(st.ev.length <= MAXEV);
  for (let i = 0; i < 200; i++) stepUrchin(st, { beatIdx: st.kickN, snareN: st.snareN }, 1 / 60);
  assert.equal(st.ev.length, 0);
  const r = createUrchinEvents(); stepUrchin(r, { beatIdx: 0 }, 0.016); stepUrchin(r, { beatIdx: 1, kick: 0.2, hit: 0.2, rest: 1, bands: bassBands }, 0.016);
  assert.equal(r.ev.length, 0);
});

test('packing for the shader', () => {
  const st = hits([['k', 0.9, bassBands], ['s', 0.7, hiBands]]);
  const A = new Float32Array(MAXEV * 4), B = new Float32Array(MAXEV * 4);
  packEvents(st, A, B);
  assert.ok(A[3] > 0 && B[0] > 0 && B[1] === Math.fround(EVENT.bassRad) && B[7] === 1);
  assert.equal(B[8], 0);
});
