// Spotify poll timing, pure (no browser globals) so it can be tested.

/** How long to wait before asking Spotify again. Pure (tested in tests/spotify-poll.test.mjs).
 *  The position runs on locally between polls, so a playing song only needs a check every ~8 s, and a quick one
 *  right after it should end. Paused / nothing playing: every 10 s. Too many requests (429): back off 15 s, 30 s,
 *  60 s … up to 5 minutes, because Spotify limits all users of this app together (development mode) and polling on
 *  every 10 s keeps the block going. */
export function nextPoll({ status, playing, prog = 0, dur = 0, retryAfter = 0, strikes = 0 }) {
  if (status === 429) return Math.min(300000, Math.max(retryAfter * 1000, 15000 * Math.pow(2, Math.min(strikes, 5))));
  if (status !== 200 || !playing) return 10000;
  const left = dur - prog;
  if (left > 0 && left < 9000) return Math.max(1500, left + 800);
  return 8000;
}
