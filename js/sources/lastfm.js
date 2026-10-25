// Last.fm source: works for anyone whose Spotify is connected to Last.fm (scrobbling).
// Needs only a username. Song length comes from track.getInfo; the position is estimated
// from when the track first appeared as "now playing".

import { CONFIG } from "../config.js";

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

async function call(params) {
  const url = API + "?" + new URLSearchParams({ ...params, api_key: CONFIG.LASTFM_API_KEY, format: "json" });
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.message || "HTTP " + r.status);
  return j;
}

export function createLastfmSource({ user, onTrack, onStatus }) {
  let timer = 0, stopped = false;
  let current = null; // { id, firstSeen, dur }
  async function poll() {
    clearTimeout(timer);
    if (stopped) return;
    let wait = 5000;
    try {
      if (!CONFIG.LASTFM_API_KEY) { onStatus("Last.fm is nog niet ingesteld (API key ontbreekt in config.js)", true); return; }
      if (document.visibilityState === "visible") {
        const t = parseRecent(await call({ method: "user.getrecenttracks", user, limit: "1" }));
        if (!t) { current = null; onTrack(null); onStatus("Niets aan het spelen (of scrobbelen staat uit)"); }
        else {
          if (!current || current.id !== t.id) {
            current = { id: t.id, firstSeen: Date.now(), dur: 0 };
            try {
              const info = await call({ method: "track.getInfo", artist: t.artists, track: t.name, autocorrect: "1" });
              current.dur = Number(info?.track?.duration) || 0;
              if (!t.art) t.art = info?.track?.album?.image?.slice(-1)[0]?.["#text"] || "";
            } catch { /* duration stays unknown */ }
          }
          const dur = current.dur || 210000;
          onStatus("");
          onTrack({ ...t, dur, prog: Math.min(dur, Date.now() - current.firstSeen + 4000), playing: true, approx: true });
        }
      }
    } catch (e) { onStatus("Last.fm: " + e.message, true); wait = 15000; }
    timer = setTimeout(poll, wait);
  }
  return {
    start() { stopped = false; poll(); },
    stop() { stopped = true; clearTimeout(timer); },
  };
}
