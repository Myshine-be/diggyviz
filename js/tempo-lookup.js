// Automatic tempo per song. Spotify's audio-features (BPM) are closed for new apps, so we look the
// song up at Deezer, whose public track data has a `bpm` field. Spotify gives the ISRC (exact
// recording); Last.fm only gives artist + title, so we search for those.
// Deezer sends no CORS headers, so the browser fetches via JSONP. No account or key needed.
// Results are cached per song in localStorage (rv.bpm.<id>); "not found" is retried after a week.

const API = "https://api.deezer.com";
const WEEK = 7 * 24 * 3600 * 1000;

/** Usable BPM from a Deezer track object, or 0. Deezer uses 0 for "unknown". */
export function bpmFromTrack(j) {
  let b = Number(j?.bpm);
  if (!Number.isFinite(b) || b <= 0) return 0;
  while (b < 70) b *= 2;      // half/double-time readings → the range the visuals expect
  while (b > 190) b /= 2;
  return Math.round(b * 10) / 10;
}

let seq = 0;
/** Default JSONP transport (browser only). Resolves with the parsed object or rejects after `ms`. */
export function jsonp(url, ms = 8000) {
  return new Promise((resolve, reject) => {
    const cb = "__dzcb" + (++seq) + "_" + Date.now().toString(36);
    const s = document.createElement("script");
    const done = (fn, v) => { clearTimeout(timer); try { delete window[cb]; } catch { window[cb] = undefined; } s.remove(); fn(v); };
    const timer = setTimeout(() => done(reject, new Error("timeout")), ms);
    window[cb] = (data) => done(resolve, data);
    s.onerror = () => done(reject, new Error("network"));
    s.src = url + (url.includes("?") ? "&" : "?") + "output=jsonp&callback=" + cb;
    document.head.appendChild(s);
  });
}

export function createTempoLookup({ store, fetchJsonp = jsonp, now = () => Date.now() }) {
  const inflight = new Map();
  async function find(t) {
    let failed = false;
    const get = (url) => fetchJsonp(url).catch(() => { failed = true; return null; });
    if (t.isrc && /^[A-Z0-9]{12}$/i.test(t.isrc)) {
      const j = await get(`${API}/track/isrc:${encodeURIComponent(t.isrc.toUpperCase())}`);
      const b = bpmFromTrack(j);
      if (b) return { bpm: b };
    }
    const artist = (t.artists || "").split(",")[0].trim(), title = (t.name || "").trim();
    if (!artist || !title) return { bpm: 0, failed };
    const q = `artist:"${artist.replace(/"/g, "")}" track:"${title.replace(/"/g, "")}"`;
    const s = await get(`${API}/search?q=${encodeURIComponent(q)}&limit=1`);
    const id = s?.data?.[0]?.id;
    if (!id) return { bpm: 0, failed };
    const bpm = bpmFromTrack(await get(`${API}/track/${encodeURIComponent(id)}`));
    return { bpm, failed };
  }
  return {
    /** Cached BPM for a song id, or 0. */
    cached(id) { const c = store.get("bpm." + id); return c && c.bpm > 0 ? c.bpm : 0; },
    /** Look up a song's BPM ({ id, isrc?, name, artists }). Resolves 0 when unknown. */
    lookup(t) {
      if (!t?.id) return Promise.resolve(0);
      const c = store.get("bpm." + t.id);
      if (c && (c.bpm > 0 || now() - (c.at || 0) < WEEK)) return Promise.resolve(c.bpm || 0);
      if (inflight.has(t.id)) return inflight.get(t.id);
      const p = find(t).catch(() => ({ bpm: 0, failed: true })).then(({ bpm, failed }) => {
        inflight.delete(t.id);
        if (bpm > 0 || !failed) store.set("bpm." + t.id, { bpm, at: now() });   // a network error is not cached
        return bpm;
      });
      inflight.set(t.id, p);
      return p;
    },
  };
}
