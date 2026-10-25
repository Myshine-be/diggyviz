// Last.fm source: works for anyone whose Spotify is connected to Last.fm (scrobbling).
// Needs only a username. Song length comes from track.getInfo; the position is estimated
// from when the track first appeared as "now playing".

import { CONFIG } from "../config.js";
import { createPoller } from "./polling.js";

const API = "https://ws.audioscrobbler.com/2.0/";

/** Pure parser (tested): user.getrecenttracks JSON → track | null */
export function parseRecent(json) {
  const list = json?.recenttracks?.track;
  const t = Array.isArray(list) ? list[0] : list;
  if (!t || t["@attr"]?.nowplaying !== "true") return null;
  const artist = t.artist?.["#text"] ?? t.artist?.name ?? "";
  const imgs = Array.isArray(t.image) ? t.image : [];
  const art = (imgs.find((i) => i.size === "extralarge") || imgs[imgs.length - 1] || {})["#text"] || "";
  return { id: `${artist}::${t.name}`, name: t.name || "", artists: artist, art, album: t.album?.["#text"] || "" };
}

async function call(params, signal) {
  const url = API + "?" + new URLSearchParams({ ...params, api_key: CONFIG.LASTFM_API_KEY, format: "json" });
  const r = await fetch(url, { signal });
  const j = await r.json().catch(() => ({}));
  signal.throwIfAborted();
  if (!r.ok || j.error) throw new Error(j.message || "HTTP " + r.status);
  return j;
}

export function createLastfmSource({ user, onTrack, onStatus }) {
  let current = null;
  return createPoller({
    interval: 5000, errorDelay: 15000,
    onError: (e) => onStatus("Last.fm: " + e.message, true),
    async run(signal) {
      if (!CONFIG.LASTFM_API_KEY) { onTrack(null); onStatus("Last.fm is nog niet ingesteld", true); return 60000; }
      const t = parseRecent(await call({ method: "user.getrecenttracks", user, limit: "1" }, signal));
      if (!t) { current = null; onTrack(null); onStatus("Niets aan het spelen (of scrobbelen staat uit)"); return; }
      if (!current || current.id !== t.id) {
        const next = { id: t.id, firstSeen: Date.now(), dur: 0, art: t.art };
        try {
          const info = await call({ method: "track.getInfo", artist: t.artists, track: t.name, autocorrect: "1" }, signal);
          next.dur = Math.max(0, Number(info?.track?.duration) || 0);
          if (!next.art) next.art = info?.track?.album?.image?.slice(-1)[0]?.["#text"] || "";
        } catch (e) { signal.throwIfAborted(); /* duration may be unknown */ }
        current = next;
      }
      signal.throwIfAborted();
      const dur = current.dur || 210000;
      onStatus("Last.fm · afspeelpositie geschat");
      onTrack({ ...t, art: t.art || current.art, dur, prog: Math.min(dur, Date.now() - current.firstSeen), playing: true, approx: true });
    },
  });

}
