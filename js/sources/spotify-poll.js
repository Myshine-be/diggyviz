// Spotify poll timing, pure (no browser globals) so it can be tested.
//
// Spotify gives Development Mode apps ONE daily request quota per developer account, shared by every user and every
// device (since July 2026; a 429 with reason QUOTA_EXCEEDED means it is used up until it resets). Polling every few
// seconds from several devices empties it within a day, after which nothing connects. So: the song position runs on
// locally between polls; while a song plays we only ask every 20 s (to notice skips/pauses) and right after it should
// end; paused 30 s; nothing playing 45 s. A normal 429: back off 30 s → 10 min. QUOTA_EXCEEDED: wait 30 min.

/** How long to wait (ms) before asking Spotify again. Pure (tested in tests/spotify-poll.test.mjs). */
export function nextPoll({ status, playing, prog = 0, dur = 0, retryAfter = 0, strikes = 0, quota = false }) {
  if (status === 429) {
    if (quota) return 30 * 60000;
    return Math.min(600000, Math.max(retryAfter * 1000, 30000 * Math.pow(2, Math.min(strikes, 5))));
  }
  if (status === 204) return 45000;
  if (status !== 200) return 30000;
  if (!playing) return 30000;
  const left = dur - prog;
  if (left > 0 && left < 21000) return Math.max(1500, left + 1000);
  return 20000;
}

/** Requests per day for one device listening all day with this timing (for the docs / sanity). */
export const callsPerDay = (avgSongSec = 210) => Math.round(86400 / avgSongSec * (Math.ceil(avgSongSec / 20) + 1));
