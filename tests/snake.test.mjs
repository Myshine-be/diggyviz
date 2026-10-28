import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnake, stepSnake, lengthForSongs, heartCells, placeApple } from '../js/visuals/snake-path.js';

test('the snake plays by itself for a long time without biting itself or leaving the board', () => {
  const s = createSnake(28, 16, 3); s.target = 40;
  for (let i = 0; i < 4000; i++) {
    stepSnake(s);
    const keys = s.body.map((c) => c.join(','));
    assert.equal(new Set(keys).size, keys.length, `self-collision at step ${i}`);
    assert.ok(s.body.every(([x, y]) => x >= 0 && y >= 0 && x < 28 && y < 16));
  }
  assert.ok(s.eaten > 20, `ate ${s.eaten} apples`);
});

test('it grows to its target length and is deterministic per seed', () => {
  const a = createSnake(20, 12, 9), b = createSnake(20, 12, 9);
  a.target = b.target = 18;
  for (let i = 0; i < 200; i++) { stepSnake(a); stepSnake(b); }
  assert.equal(a.body.length, 18);
  assert.deepEqual(a.body, b.body);
});

test('length grows two per song and molts back after 120', () => {
  assert.equal(lengthForSongs(0), 6);
  assert.equal(lengthForSongs(10), 26);
  assert.ok(lengthForSongs(57) < 120 && lengthForSongs(57) >= 6);
});

test('heart apples fit on the board and the snake eats them', () => {
  const s = createSnake(28, 16, 5); s.target = 10; s.apples = [];
  for (const c of heartCells(28, 16)) placeApple(s, c);
  const n = s.apples.length; assert.ok(n > 10);
  for (let i = 0; i < 1500 && s.eaten < n; i++) stepSnake(s);
  assert.ok(s.eaten >= n - 2, `ate ${s.eaten} of ${n}`);
});
