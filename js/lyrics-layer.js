// The lyrics layer, behind every visual, fills the WHOLE background (Mo, 29 Oct: "vullend, niet gecentreerd"):
//  - a wall of the song's lyrics from edge to edge, dimmed, that scrolls up softly with the song (it wraps around, so
//    the screen is always full; past rows a little quieter than coming rows);
//  - on top of the wall the line being sung, very large and bright in the cover's accent colour, cross-fading to the
//    next line when it starts.
// The final pass lets bright parts of the visual cover the text (= behind the visual). Timing comes only from the
// lyric timestamps and the real playback position (lyricView / wallScroll), never from BPM or kicks.
//
// Texture (redrawn only when the visible window of rows or the current line changes): rows of the wall at the top,
// then two slots for the big line (A = current, B = previous). Its size follows the screen's shape.
import { lyricView, lineAt } from "./lyrics.js";

/** Fonts per visual style (all loaded in index.html). */
export const LYRIC_FONTS = {
  sans: { family: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif', w0: 400, w1: 600 },
  light: { family: '"Jost", "Segoe UI", system-ui, sans-serif', w0: 300, w1: 500, spacing: 1 },
  mono: { family: '"IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace', w0: 400, w1: 600 },
  serif: { family: '"Cormorant Garamond", Georgia, "Times New Roman", serif', w0: 500, w1: 700, size: 1.12 },
};
/** Placement per visual. y = centre of the big line (0 bottom … 1 top), big = its max height (fraction of the screen),
 *  region = [bottom, top] of the wall (fraction of the screen); y, big and region may be { land, port }.
 *  occlude = bright parts of the visual cover the text. */
export const DEFAULT_LYRIC_STYLE = { y: 0.7, big: { land: 0.4, port: 0.28 }, region: [0, 1], font: "sans", occlude: true, ink: null, accent: null };
const pick = (v, land) => (v && typeof v === "object" && !Array.isArray(v) ? (land ? v.land : v.port) : v);

/** Split a line into at most two rows that fit `maxW` (break near the middle at a space). Pure helper. */
export function wrapLine(text, measure, maxW) {
  if (measure(text) <= maxW || !text.includes(" ")) return [text];
  const words = text.split(" ");
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
    const w = Math.max(measure(a), measure(b));
    if (!best || w < best.w) best = { w, rows: [a, b] };
  }
  return best.rows;
}

/** Lay the shown lines out as one flowing wall of text: rows of at most maxW wide. Pure (tested).
 *  → { rows: [string], lineRow: [row index where shown line k starts] }. A separator row closes the text so it can
 *  wrap around. */
export function wallLayout(texts, measure, maxW, sep = "   ") {
  const rows = [], lineRow = [];
  let cur = "";
  for (const t of texts) {
    const words = t.split(/\s+/).filter(Boolean);
    lineRow.push(rows.length + (cur && measure(cur + sep + words[0]) > maxW ? 1 : 0));
    words.forEach((w, i) => {
      const add = cur ? cur + (i === 0 ? sep : " ") + w : w;
      if (cur && measure(add) > maxW) { rows.push(cur); cur = w; } else cur = add;
    });
  }
  if (cur) rows.push(cur);
  rows.push("·");
  return { rows, lineRow };
}

/** Scroll position of the wall (in rows) at `sec`: it rests on the current line and glides to the next one in the
 *  half second before that line starts — continuous over gaps; a seek simply lands on the right row. Pure (tested). */
export function wallScroll(lines, show, lineRow, sec, glide = 0.5) {
  if (!show.length) return 0;
  const idx = lineAt(lines, sec);
  let p = -1;                                            // last shown line that has started
  for (let k = 0; k < show.length && show[k] <= idx; k++) p = k;
  const n = Math.min(show.length - 1, p + 1);
  const rp = p < 0 ? lineRow[0] - 1 : lineRow[p], rn = lineRow[n];
  if (n === p) return rp;
  const tn = lines[show[n]].t;
  const x = Math.min(1, Math.max(0, (sec - (tn - glide)) / glide));
  return rp + (rn - rp) * x * x * (3 - 2 * x);
}

export function createLyricsLayer({ doc = typeof document !== "undefined" ? document : null } = {}) {
  const canvas = doc ? (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(16, 16) : Object.assign(doc.createElement("canvas"), { width: 16, height: 16 })) : null;
  const ctx = canvas?.getContext("2d");
  let version = 0, fontsReady = 0;
  let layoutKey = "", L = null;                      // wall layout for this track / screen shape / font
  let drawKey = "";
  const loaded = new Set();

  function loadFonts(f) {
    if (!doc?.fonts?.load) return;
    Promise.all([doc.fonts.load(`${f.w0} 48px ${f.family}`), doc.fonts.load(`${f.w1} 48px ${f.family}`)])
      .then(() => { fontsReady++; layoutKey = ""; drawKey = ""; }).catch(() => {});
  }

  // fit text into a box: 1–3 balanced rows, as large as possible
  function fitBig(text, f, bw, bh) {
    let best = null;
    for (let n = 1; n <= 3; n++) {
      const words = text.split(/\s+/).filter(Boolean);
      if (n > words.length) break;
      // balanced split into n rows
      ctx.font = `${f.w1} 100px ${f.family}`;
      const total = ctx.measureText(text).width, target = total / n;
      const rows = []; let cur = "";
      for (const w of words) { const add = cur ? cur + " " + w : w; if (cur && ctx.measureText(add).width > target * 1.08 && rows.length < n - 1) { rows.push(cur); cur = w; } else cur = add; }
      rows.push(cur);
      const widest = Math.max(...rows.map((r) => ctx.measureText(r).width));
      const size = Math.min(100 * bw * 0.96 / widest, bh * 0.9 / (rows.length * 1.08));
      if (!best || size > best.size * 1.05) best = { rows, size };
    }
    return best;
  }
  function drawBig(text, f, y0, AW, BH) {
    if (!text) return;
    const fit = fitBig(text, f, AW, BH);
    ctx.font = `${f.w1} ${fit.size}px ${f.family}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    fit.rows.forEach((r, i) => ctx.fillText(r, AW / 2, y0 + BH / 2 + (i - (fit.rows.length - 1) / 2) * fit.size * 1.08));
  }

  return {
    canvas,
    /**
     * State for the engine this frame, or null when the layer shows nothing.
     * lines: parsed lines of THIS track (empty while loading / none), sec: playback position, posKnown: the source
     * gives a real position, id: track id, style: the visual's lyric style, W/H: render size in pixels.
     */
    frame({ lines, sec, posKnown, id, style, W = 1280, H = 720 }) {
      if (!ctx) return null;
      const view = lyricView(lines, sec, posKnown);
      if (!view) return null;
      const st = { ...DEFAULT_LYRIC_STYLE, ...(style || {}) };
      const f = LYRIC_FONTS[st.font] || LYRIC_FONTS.sans;
      if (!loaded.has(st.font)) { loaded.add(st.font); loadFonts(f); }
      const land = W >= H;
      const region = pick(st.region, land) || [0, 1];
      const y = pick(st.y, land), bigFrac = Math.min(pick(st.big, land), 2 * Math.min(y - region[0], region[1] - y) * 0.98);
      const AW = land ? 2048 : 1024;
      const rowsOnScreen = Math.max(4, Math.round((land ? 11 : 20) * (region[1] - region[0])));
      const regionH = H * (region[1] - region[0]);
      const rh = Math.round((regionH / rowsOnScreen) * (AW / W));          // atlas px per wall row
      const nWin = rowsOnScreen + 4;
      const bw = 0.92 * W, bh = Math.max(1, bigFrac * H);
      const BH = Math.round(AW * bh / bw);
      const AH = Math.min(4096, nWin * rh + 2 * BH);
      // the wall's layout for this track and screen shape
      const lk = `${id}|${AW}|${rh}|${st.font}|${fontsReady}`;
      if (lk !== layoutKey) {
        layoutKey = lk;
        ctx.font = `${f.w0} ${Math.round(rh / 1.3)}px ${f.family}`;
        L = { ...wallLayout(view.show.map((i) => lines[i].text.toUpperCase()), (t) => ctx.measureText(t).width, AW * 0.97), fs: Math.round(rh / 1.3) };
        drawKey = "";
      }
      const scroll = wallScroll(lines, view.show, L.lineRow, sec);
      const anchor = (region[1] - y) / Math.max(0.05, region[1] - region[0]) * rowsOnScreen;   // the sung line's row sits behind the big line
      const top = scroll - anchor;                                        // wall row at the top of the region
      const r0 = Math.floor(top) - 1;
      const prevK = view.cur > 0 && view.glide < 1 ? view.cur - 1 : -1;
      const dk = `${lk}|${r0}|${view.cur}|${prevK}|${AH}|${BH}`;
      if (dk !== drawKey) {
        drawKey = dk;
        if (canvas.width !== AW || canvas.height !== AH) { canvas.width = AW; canvas.height = AH; }
        ctx.clearRect(0, 0, AW, AH);
        ctx.fillStyle = "#fff";
        if ("letterSpacing" in ctx) ctx.letterSpacing = "1px";
        ctx.font = `${f.w0} ${L.fs}px ${f.family}`;
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        const T = L.rows.length;
        for (let k = 0; k < nWin; k++) {
          const r = ((r0 + k) % T + T) % T;                               // the wall wraps around: always full
          ctx.fillText(L.rows[r], AW * 0.015, k * rh + rh / 2);
        }
        if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
        drawBig(view.cur >= 0 ? lines[view.show[view.cur]].text : "", f, nWin * rh, AW, BH);
        drawBig(prevK >= 0 ? lines[view.show[prevK]].text : "", f, nWin * rh + BH, AW, BH);
        version++;
      }
      const cur = view.cur >= 0 ? view.glide * view.emph : 0, prev = prevK >= 0 ? 1 - view.glide : 0;
      return {
        canvas, version, occlude: st.occlude ? 1 : 0, ink: st.ink, accent: st.accent,
        // wall: rows on screen, row offset inside the texture, region; big: centre, height, mix
        wall: [rowsOnScreen, top - r0, region[0], region[1]],
        atlas: [nWin * rh / AH, BH / AH, AW / W, 0],
        big: [y, bigFrac, cur, prev],
      };
    },
  };
}
