import test from 'node:test';
import assert from 'node:assert/strict';
const { nextPoll, callsPerDay } = await import('../js/sources/spotify-poll.js');

test('Spotify is asked rarely (daily quota shared by all users), but right after a song should end', () => {
  assert.equal(nextPoll({ status: 200, playing: true, prog: 10000, dur: 200000 }), 20000);
  assert.equal(nextPoll({ status: 200, playing: true, prog: 190000, dur: 200000 }), 11000);
  assert.equal(nextPoll({ status: 200, playing: false }), 30000);
  assert.equal(nextPoll({ status: 204 }), 45000);
  assert.ok(callsPerDay() < 5000, `${callsPerDay()} calls/day for one device listening all day`);
});

test('too many requests: back off further each time; daily quota used up: wait 30 minutes', () => {
  const w = [0, 1, 2, 3, 6].map((s) => nextPoll({ status: 429, strikes: s }));
  assert.deepEqual(w, [30000, 60000, 120000, 240000, 600000]);
  assert.equal(nextPoll({ status: 429, retryAfter: 90, strikes: 0 }), 90000);
  assert.equal(nextPoll({ status: 429, quota: true }), 1800000);
});
