import test from 'node:test';
import assert from 'node:assert/strict';
import { envelope } from '../js/envelope.js';
import { audioData, feedHistory, resetAudioData, HIST_RATE } from '../js/audio-data.js';

test('a hit reaches 90 % of its level within 25 ms (no visible lag)', () => {
  const b = new Float32Array(1), p = new Float32Array(1);
  let t = 0; while (b[0] < 0.9) { envelope(b, p, 0, 1, 1 / 240); t += 1 / 240; }
  assert.ok(t <= 0.025, `took ${(t * 1000).toFixed(0)} ms`);
});

test('the newest history row follows the bands live between pushes', () => {
  resetAudioData();
  const bands = new Float32Array(32);
  feedHistory(bands, 1 / HIST_RATE);              // push a row
  bands.fill(1);
  feedHistory(bands, 1 / (HIST_RATE * 4));        // no new row yet
  const o = (audioData.head + 1) * 128;
  assert.equal(audioData.bytes[o], 255);
});
