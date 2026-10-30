import test from 'node:test';
import assert from 'node:assert/strict';
import { createInk, stepInk, packInk, NDROP, WIN, MODES } from '../js/visuals/soul-ink.js';

const audio = (t, beat) => ({ beatIdx: beat, snareN: Math.floor(beat / 2), kick: (t * 2) % 1 < 0.1 ? 0.9 : 0.1, snare: 0, hit: 0.6, energy: 0.6,
  bands: Array.from({ length: 32 }, (_, i) => (i < 6 ? 0.7 : 0.35)), rest: 0 });

test('drops always stay inside the window, never NaN', () => {
  const st = createInk(1);
  for (let f = 0; f < 60 * 40; f++) { const t = f / 60; stepInk(st, audio(t, Math.floor(t * 2)), 1 / 60); }
  for (const p of st.d) { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); assert.ok(Math.hypot(p.x, p.y) + p.r <= WIN + 1e-6); }
});

test('the shape changes over time (several modes in a song) and a kick bursts the ink outwards', () => {
  const st = createInk(2), seen = new Set();
  for (let f = 0; f < 60 * 90; f++) { const t = f / 60; stepInk(st, audio(t, Math.floor(t * 2)), 1 / 60); seen.add(st.mode); }
  assert.ok(seen.size >= 4, [...seen].join());
  assert.ok([...seen].every((m) => MODES.includes(m)));
  const b = createInk(3);
  for (let f = 0; f < 120; f++) stepInk(b, { beatIdx: 0, bands: [] }, 1 / 60);
  const spread = (s) => s.d.reduce((a, p) => a + Math.hypot(p.x - s.mag[0], p.y - s.mag[1]), 0) / NDROP;
  const before = spread(b);
  stepInk(b, { beatIdx: 1, kick: 1, hit: 1, bands: [] }, 1 / 60);
  for (let f = 0; f < 12; f++) stepInk(b, { beatIdx: 1, bands: [] }, 1 / 60);
  assert.ok(spread(b) > before * 1.08, `${before} → ${spread(b)}`);
});

test('silence relaxes the field; packing gives spikes only on the big drops', () => {
  const st = createInk(4);
  for (let f = 0; f < 300; f++) stepInk(st, { beatIdx: 0, bands: Array(32).fill(0), rest: 1 }, 1 / 60);
  assert.ok(st.field < 0.1);
  const out = packInk(st, new Float32Array(NDROP * 4));
  for (let i = 0; i < NDROP; i++) if (st.d[i].r0 < 0.04) assert.equal(out[i * 4 + 3], 0);
});
