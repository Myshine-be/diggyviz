import test from 'node:test';
import assert from 'node:assert/strict';
import { paletteFromPixels } from '../js/palette.js';

const fill = (parts) => parts.flatMap(([n, c]) => Array.from({ length: n }, () => c));
const hue = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; return h < 0 ? h + 1 : h; };
const sat = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };
const hd = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

test('a red-and-blue cover gives red and blue, not one shifted neon scheme', () => {
  const p = paletteFromPixels(fill([[600, [200, 30, 40]], [300, [30, 60, 210]], [124, [10, 10, 12]]]));
  assert.ok(hd(hue(p.mid), 0) < 0.04, 'mid is red');
  assert.ok(hd(hue(p.hi), 0.63) < 0.06, 'hi is blue');
});

test('different covers give clearly different palettes', () => {
  const green = paletteFromPixels(fill([[700, [40, 180, 70]], [324, [230, 220, 60]]]));
  const purple = paletteFromPixels(fill([[700, [120, 40, 190]], [324, [240, 120, 200]]]));
  assert.ok(hd(hue(green.mid), hue(purple.mid)) > 0.25);
  assert.ok(hd(hue(green.hi), 0.15) < 0.06, 'yellow accent kept');
});

test('a black-and-white cover gets a calm low-saturation palette', () => {
  const p = paletteFromPixels(fill([[500, [240, 240, 240]], [524, [15, 15, 15]]]));
  assert.ok(sat(p.mid) < 0.35 && sat(p.hi) < 0.35);
});

test('every colour is a valid 0–255 RGB triple, also for an empty cover', () => {
  for (const p of [paletteFromPixels([]), paletteFromPixels(fill([[1024, [128, 64, 32]]]))])
    for (const k of ['dark', 'mid', 'hi', 'hot']) assert.ok(p[k].length === 3 && p[k].every((v) => Number.isFinite(v) && v >= 0 && v <= 255.001), k);
});
