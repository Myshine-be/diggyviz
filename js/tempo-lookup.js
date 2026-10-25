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

/** Run JSONP in an opaque-origin sandbox, never alongside the Spotify session. */
export function jsonp(url, ms = 8000) {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("sandbox", "allow-scripts"); // deliberately NO allow-same-origin
    frame.setAttribute("title", "Tempo opzoeken");
    const finish = (fn, value) => {
      clearTimeout(timer); window.removeEventListener("message", receive); frame.remove(); fn(value);
    };
    const receive = (e) => {
      if (e.source !== frame.contentWindow || e.data?.nonce !== nonce) return;
      if (e.data.error) finish(reject, new Error("network"));
      else finish(resolve, e.data.value);
    };
    const timer = setTimeout(() => finish(reject, new Error("timeout")), ms);
    window.addEventListener("message", receive);
    const src = url + (url.includes("?") ? "&" : "?") + "output=jsonp&callback=__tempo";
    const literal = value => JSON.stringify(value).replace(/</g, "\\u003c");
    frame.srcdoc = '<script>const nonce=' + literal(nonce) +
      ';window.__tempo=value=>parent.postMessage({nonce,value},"*");' +
      'const s=document.createElement("script");s.src=' + literal(src) +
      ';s.onerror=()=>parent.postMessage({nonce,error:true},"*");document.head.appendChild(s);<\/script>';
    document.body.appendChild(frame);
  });
}

export function createTempoLookup({ store, fetchJsonp = jsonp, now = () => Date.now() }) {
  const inflight = new Map(), states = new Map();
  async function find(t) {
    let failed = false;
    const get = async (url) => {
      try {
        const result = await fetchJsonp(url);
        // API errors (rate limits, service failures) are not a valid "unknown song" result.
        if (result?.error) { failed = true; return null; }
        return result;
      } catch { failed = true; return null; }
    };
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
    state(id) { return states.get(id) || "idle"; },
    /** Cached BPM for a song id, or 0. */
    cached(id) { const c = store.get("bpm." + id); return c && Number.isFinite(c.bpm) && c.bpm >= 50 && c.bpm <= 220 ? c.bpm : 0; },
    /** Look up a song's BPM ({ id, isrc?, name, artists }). Resolves 0 when unknown. */
    lookup(t) {
      if (!t?.id) return Promise.resolve(0);
      const c = store.get("bpm." + t.id);
      const valid = c && Number.isFinite(c.bpm) && c.bpm >= 50 && c.bpm <= 220;
      if (valid || (c?.bpm === 0 && now() - (c.at || 0) < WEEK)) {
        states.set(t.id, valid ? "found" : "missing");
        return Promise.resolve(valid ? c.bpm : 0);
      }
      if (inflight.has(t.id)) return inflight.get(t.id);
      states.set(t.id, "loading");
      const p = find(t).catch(() => ({ bpm: 0, failed: true })).then(({ bpm, failed }) => {
        inflight.delete(t.id);
        states.set(t.id, bpm > 0 ? "found" : failed ? "unavailable" : "missing");
        if (bpm > 0 || !failed) store.set("bpm." + t.id, { bpm, at: now() });   // a network error is not cached
        return bpm;
      });
      inflight.set(t.id, p);
      return p;
    },
  };
}
