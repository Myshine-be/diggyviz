// Time-synced song lyrics for the Orbit visual, from LRCLIB (lrclib.net, a free open lyrics database).
// Only artist, title, album and duration are sent — never Spotify tokens; no cookies, no referrer.
// Lyrics are only fetched while Orbit is on screen, kept in memory, never stored or uploaded.
// Not every song has synced lyrics: then Orbit simply shows its rings.

/** "[01:23.45] text" lines → [{ t: seconds, text }], sorted. Pure (tested). */
export function parseLRC(lrc) {
  const out = [];
  for (const raw of String(lrc || "").split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3]) / Math.pow(10, m[3].length) : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Index of the line being sung at `sec` (-1 before the first line). Pure (tested). */
export function lineAt(lines, sec) {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= sec) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

const cleanTitle = (s) => String(s || "").replace(/\s*[-–]\s*(remaster(ed)?|live|radio edit|mono|stereo).*$/i, "").replace(/\s*\((feat|ft|with)\.?[^)]*\)/i, "").trim();
const firstArtist = (s) => String(s || "").split(/,|&| feat\.? | ft\.? /i)[0].trim();

export function createLyrics({ fetchFn = (...a) => fetch(...a), base = "https://lrclib.net/api" } = {}) {
  const cache = new Map();            // track id → { state: "loading" | "ok" | "none", lines }
  async function load(track) {
    const artist = firstArtist(track.artists), title = cleanTitle(track.name);
    if (!artist || !title) return [];
    const opts = { credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/json" } };
    const q = new URLSearchParams({ artist_name: artist, track_name: title });
    if (track.dur) q.set("duration", String(Math.round(track.dur / 1000)));
    try {
      const r = await fetchFn(`${base}/get?${q}`, opts);
      if (r.ok) { const j = await r.json(); if (j?.syncedLyrics) return parseLRC(j.syncedLyrics); }
    } catch {}
    try {                              // fallback: search, prefer a result with synced lyrics and a close duration
      const r = await fetchFn(`${base}/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`, opts);
      if (r.ok) {
        const list = (await r.json()) || [];
        const want = (track.dur || 0) / 1000;
        const best = list.filter((x) => x.syncedLyrics).sort((a, b) => Math.abs((a.duration || 0) - want) - Math.abs((b.duration || 0) - want))[0];
        if (best && (!want || Math.abs((best.duration || 0) - want) < 8)) return parseLRC(best.syncedLyrics);
      }
    } catch {}
    return [];
  }
  return {
    /** Lines for this track (empty while loading or when there are none); starts loading on first ask. */
    linesFor(track) {
      if (!track?.id) return [];
      let e = cache.get(track.id);
      if (!e) {
        e = { state: "loading", lines: [] }; cache.set(track.id, e);
        load(track).then((lines) => { e.lines = lines; e.state = lines.length ? "ok" : "none"; });
        if (cache.size > 40) cache.delete(cache.keys().next().value);
      }
      return e.lines;
    },
    stateFor(id) { return cache.get(id)?.state ?? "idle"; },
  };
}
