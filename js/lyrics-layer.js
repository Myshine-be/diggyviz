// The lyrics layer: synced song lines drawn BEHIND every visual (the final pass lets bright parts of the visual
// cover the text). A few lines around the current one; past and coming lines are quieter, the current line stands
// still and is clear by contrast, weight and an accent colour from the cover. Lines slide softly to the next one.
// Timing comes only from the lyric timestamps and the real playback position (lyricView in lyrics.js).
//
// Texture: a 2048×1024 canvas, 8 slots of 128 px. The left half holds every line in the regular weight, the right
// half the same line in the bold weight, so the shader can blend the emphasis smoothly (no pop when a line becomes
// current). Slot j = shown line (at − 3 + j). The canvas is only redrawn when the lines around change.
import { lyricView } from "./lyrics.js";

export const SLOTS = 8, SLOT_H = 128, COL = 1024, ATLAS_W = 2 * COL, ATLAS_H = SLOTS * SLOT_H, CENTER = 3;

/** Fonts per visual style (all loaded in index.html). */
export const LYRIC_FONTS = {
  sans: { family: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif', w0: 400, w1: 600 },
  light: { family: '"Jost", "Segoe UI", system-ui, sans-serif', w0: 300, w1: 500, spacing: 1 },
  mono: { family: '"IBM Plex Mono", ui-monospace, "Cascadia Mono", monospace', w0: 400, w1: 600 },
  serif: { family: '"Cormorant Garamond", Georgia, "Times New Roman", serif', w0: 500, w1: 700, size: 1.12 },
};
/** Placement per visual: y = height of the current line (0 bottom … 1 top), occlude = bright parts cover the text. */
export const DEFAULT_LYRIC_STYLE = { y: 0.2, font: "sans", occlude: true, ink: null, accent: null, clip: [0, 1] };

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

export function createLyricsLayer({ doc = typeof document !== "undefined" ? document : null } = {}) {
  const canvas = doc ? (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(ATLAS_W, ATLAS_H) : Object.assign(doc.createElement("canvas"), { width: ATLAS_W, height: ATLAS_H })) : null;
  const ctx = canvas?.getContext("2d");
  let key = "", version = 0, fontsReady = 0, previous = null, slide = false;
  const wordEnds = [];                                  // x end (0..1 of the slot) of each word of the current line
  let textStart = 0;

  function loadFonts(f) {
    if (!doc?.fonts?.load) return;
    Promise.all([doc.fonts.load(`${f.w0} 48px ${f.family}`), doc.fonts.load(`${f.w1} 48px ${f.family}`)])
      .then(() => { fontsReady++; key = ""; }).catch(() => {});
  }
  const loaded = new Set();

  function draw(lines, view, style) {
    const f = LYRIC_FONTS[style.font] || LYRIC_FONTS.sans;
    if (!loaded.has(style.font)) { loaded.add(style.font); loadFonts(f); }
    ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff";
    if ("letterSpacing" in ctx) ctx.letterSpacing = f.spacing ? `${f.spacing}px` : "0px";
    const maxW = COL * 0.94;
    wordEnds.length = 0; textStart = 0;
    for (let j = 0; j < SLOTS; j++) {
      const s = view.at - CENTER + j;
      if (s < 0 || s >= view.show.length) continue;
      const line = lines[view.show[s]];
      for (const [col, weight] of [[0, f.w0], [1, f.w1]]) {
        let size = Math.round(50 * (f.size || 1));
        const font = (sz) => `${weight} ${sz}px ${f.family}`;
        ctx.font = font(size);
        let rows = wrapLine(line.text, (t) => ctx.measureText(t).width, maxW);
        if (rows.length > 1) { size = Math.round(size * 0.86); ctx.font = font(size); rows = wrapLine(line.text, (t) => ctx.measureText(t).width, maxW); }
        const widest = Math.max(...rows.map((r) => ctx.measureText(r).width));
        if (widest > maxW) { size = Math.max(22, Math.floor(size * maxW / widest)); ctx.font = font(size); }
        const cy = j * SLOT_H + SLOT_H / 2, lh = size * 1.08;
        rows.forEach((r, i) => ctx.fillText(r, col * COL + COL / 2, cy + (i - (rows.length - 1) / 2) * lh, maxW));
        // real word timestamps only: remember where each word of the current (single-row) line ends
        if (col === 1 && j === CENTER && line.words && rows.length === 1) {
          const full = ctx.measureText(rows[0]).width;
          textStart = (COL - full) / 2 / COL;
          let acc = "";
          for (const w of line.words) { acc = acc ? acc + " " + w.text : w.text; wordEnds.push(textStart + Math.min(full, ctx.measureText(acc).width) / COL); }
        }
      }
    }
    version++;
  }

  return {
    canvas,
    /**
     * State for the engine this frame, or null when the layer shows nothing.
     * lines: parsed lines of THIS track (empty while loading / none), sec: playback position, posKnown: the
     * source gives a real position, id: track id, style: the visual's lyric style.
     */
    frame({ lines, sec, posKnown, id, style, playing = true }) {
      if (!ctx) return null;
      const view = lyricView(lines, sec, posKnown);
      if (!view) { previous = null; slide = false; return null; }
      const delta = previous ? sec - previous.sec : Infinity;
      const seek = !previous || previous.id !== id || delta < -0.02 || delta > 0.6;
      if (seek || !playing) slide = false;
      else if (previous.at !== view.at) slide = view.at === previous.at + 1 && view.cur >= 0;
      if (!slide) { view.glide = 1; if (view.cur >= 0) view.emph = 1; }
      previous = { id, sec, at: view.at };
      const st = { ...DEFAULT_LYRIC_STYLE, ...(style || {}) };
      const k = `${id}|${view.at}|${st.font}|${fontsReady}`;
      if (k !== key) { key = k; draw(lines, view, st); }
      const word = view.cur >= 0 && view.word >= 0 && wordEnds.length ? [textStart, wordEnds[Math.min(view.word, wordEnds.length - 1)]] : [-1, -1];
      return { canvas, version, glide: view.glide, emph: view.emph, hasCur: view.cur >= 0 ? 1 : 0, word, y: st.y, clip: st.clip, occlude: st.occlude ? 1 : 0, ink: st.ink, accent: st.accent };
    },
  };
}
