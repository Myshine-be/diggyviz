import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { nextPoll } = await import('../js/sources/spotify-poll.js');

test('Spotify is asked far less often, but right after a song ends', () => {
  assert.equal(nextPoll({ status: 200, playing: true, prog: 10000, dur: 200000 }), 8000);
  assert.equal(nextPoll({ status: 200, playing: true, prog: 196000, dur: 200000 }), 4800);
  assert.equal(nextPoll({ status: 200, playing: false }), 10000);
  assert.equal(nextPoll({ status: 204 }), 10000);
});

test('too many requests: back off further each time, honour Retry-After, never more than 5 minutes', () => {
  const w = [0, 1, 2, 3, 6].map((s) => nextPoll({ status: 429, strikes: s }));
  assert.deepEqual(w, [15000, 30000, 60000, 120000, 300000]);
  assert.equal(nextPoll({ status: 429, retryAfter: 90, strikes: 0 }), 90000);
  assert.equal(nextPoll({ status: 429, retryAfter: 99999, strikes: 0 }), 300000);
});
