// Time-synced song lyrics (the lyrics layer behind every visual, and Orbit's globe), from LRCLIB (lrclib.net, a free
// open lyrics database). Only artist, title and duration are sent — never Spotify tokens; no cookies, no referrer.
// Lyrics are only fetched while the layer is on or Orbit is on screen, kept in memory, never stored or uploaded.
// Not every song has synced lyrics: then the layer stays empty and Orbit shows its rings.

const stampSec = (m, s, f) => Number(m) * 60 + Number(s) + (f ? Number(f) / Math.pow(10, f.length) : 0);

/** "[01:23.45] text" lines → [{ t: seconds, text, words? }], sorted. Pure (tested).
 *  Enhanced LRC ("<01:23.45>word <01:24.10>word") keeps its REAL word times in `words` — only then a line may be
 *  highlighted word by word. Without word stamps there is no word timing: we never invent it. */
export function parseLRC(lrc) {
  const out = [];
  for (const raw of String(lrc || "").split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, "");
    const wm = [...body.matchAll(/<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>([^<]*)/g)];
    const words = wm.length ? wm.map((m) => ({ t: stampSec(m[1], m[2], m[3]), text: m[4] })).filter((w) => w.text.trim()) : null;
    const text = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    for (const m of stamps) {
      const line = { t: stampSec(m[1], m[2], m[3]), text };
      if (words?.length && stamps.length === 1) line.words = words.map((w) => ({ t: w.t, text: w.text.trim() }));
      out.push(line);
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

export const GLIDE_SEC = 0.45;
const ease = (x) => x * x * (3 - 2 * x);

/**
 * What the lyrics layer shows at `sec` (song position from the player, never from BPM or kicks). Pure (tested).
 * → null when nothing may be shown (no synced lines, position unknown), else
 *   { show: [line indices to draw, in order, non-empty only], cur: position of the current line in `show` or -1,
 *     at: position in `show` the layout is centred on, glide: 0..1 (eased slide from the previous line),
 *     emph: 0..1 (how strongly the current line is highlighted), word: index of the sung word or -1 }
 * The slide only happens on a normal step to the next line; after a seek, a pause or a gap the layout is simply
 * correct at once (glide 1), so nothing jumps or flashes.
 */
export function lyricView(lines, sec, posKnown = true) {
  if (!lines?.length || !posKnown || !Number.isFinite(sec)) return null;
  const show = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].text) show.push(i);
  if (!show.length) return null;
  const idx = lineAt(lines, sec);
  const nextShow = (i) => { let lo = 0; while (lo < show.length && show[lo] <= i) lo++; return lo; };   // first shown line after i
  if (idx < 0 || !lines[idx].text) {                    // before the first line or in an instrumental gap: no current line
    const at = Math.min(show.length - 1, nextShow(idx));
    return { show, cur: -1, at, glide: 1, emph: 0, word: -1 };
  }
  const at = show.indexOf(idx);
  const since = Math.max(0, sec - lines[idx].t);
  const p = ease(Math.min(1, since / GLIDE_SEC));
  const stepped = idx > 0 && !!lines[idx - 1].text;      // came straight from the previous sung line
  let word = -1;
  const w = lines[idx].words;
  if (w) for (let k = 0; k < w.length; k++) if (w[k].t <= sec) word = k;
  return { show, cur: at, at, glide: stepped ? p : 1, emph: stepped ? 1 : p, word };
}

const cleanTitle =(s) => String(s || "").replace(/\s*[-–]\s*(remaster(ed)?|live|radio edit|mono|stereo).*$/i, "").replace(/\s*\((feat|ft|with)\.?[^)]*\)/i, "").trim();
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
