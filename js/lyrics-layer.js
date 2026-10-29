// The lyrics layer (3.0.2, Mo: "de visual heeft altijd voorrang"): ONE calm, compact block behind the visual —
// the line being sung and at most one line before and after it, all the same size, normal case. The sung line is
// marked inside the same block only by a little more opacity and a muted cover tint (no glow, no pulse, no zoom).
// On a new line the block slides up one line and the opacities flow over (about half a second), timed only by the
// lyric timestamps and the real playback position (lyricView in lyrics.js). Every visual gives it one stable place
// per screen orientation, in a quiet zone of its composition; the final pass keeps a soft gap around bright shapes.
//
// Texture: a 2048-wide canvas with 5 slots (lines at − 2 … at + 2), one weight, redrawn only when the line changes.
// Positions and opacities are computed here per frame and passed as uniforms.
import { lyricView } from "./lyrics.js";

export const SLOTS = 5, CENTER = 2, AW = 2048;

/** Fonts per visual style (all loaded in index.html). */
export const LYRIC_FONTS = {
  sans: { family: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif', w0: 400 },
  light: { family: '"Jost", "Segoe UI", system-ui, sans-serif', w0: 400 },
  serif: { family: '"Cormorant Garamond", Georgia, "Times New Roman", serif', w0: 500, size: 1.12 },
};
/** Placement per visual and orientation: x/y = anchor of the sung line (0..1 of the screen, y from the bottom),
 *  align = "left" | "center", width = max block width (0..1 of the screen width), lines = 3 (sung line + neighbours)
 *  or 1 (only the sung line). occlude: bright parts of the visual cover the text (default true). */
export const DEFAULT_LYRIC_STYLE = {
  land: { x: 0.5, y: 0.15, align: "center", width: 0.62, lines: 3 },
  port: { x: 0.5, y: 0.1, align: "center", width: 0.88, lines: 3 },
  font: "sans", size: 1, occlude: true, ink: null, accent: null,
};
export const LYRIC_ALPHA = { cur: 0.45, near: 0.12, none: 0.16 };

/** Split a line into rows that fit `maxW`: one row if it fits, else balanced rows (greedy towards an even width),
 *  at most `maxRows`. Pure helper (tested). */
export function wrapLine(text, measure, maxW, maxRows = 4) {
  if (measure(text) <= maxW || !text.includes(" ")) return [text];
  const words = text.split(" ");
  for (let n = 2; n <= maxRows; n++) {
    const target = measure(text) / n;
    const rows = []; let cur = "";
    for (const w of words) {
      const add = cur ? cur + " " + w : w;
      if (cur && (measure(add) > maxW || (measure(add) > target * 1.12 && rows.length < n - 1))) { rows.push(cur); cur = w; } else cur = add;
    }
    rows.push(cur);
    if (rows.length <= n && rows.every((r) => measure(r) <= maxW)) return rows;
    if (n === maxRows) return rows;
  }
  return [text];
}

/**
 * Positions and opacities of the 5 slots (rel −2 … +2 to the anchor line) at a moment. Pure (tested).
 * rows[j] = text rows of slot j (0 = empty), rowH/gap in px, view from lyricView, lines = 3 or 1.
 * → [{ y (px from the anchor, up = +), a (opacity), tint (0..1 how much it is the sung line) }]
 */
export function blockLayout(rows, view, rowH, gap, lines = 3) {
  // layout with slot c as the sung line: c sits at 0, the others stack above/below it
  const place = (c) => {
    const y = new Array(SLOTS).fill(0);
    for (let j = c - 1; j >= 0; j--) y[j] = y[j + 1] + ((rows[j + 1] || 1) + (rows[j] || 1)) * rowH / 2 + gap;
    for (let j = c + 1; j < SLOTS; j++) y[j] = y[j - 1] - ((rows[j - 1] || 1) + (rows[j] || 1)) * rowH / 2 - gap;
    return y;
  };
  const alphaAt = (j, c, hasCur) => {
    if (!rows[j]) return 0;
    const d = Math.abs(j - c);
    if (d === 0) return hasCur ? LYRIC_ALPHA.cur : LYRIC_ALPHA.none;
    return d === 1 && lines > 1 && rows[j] <= 3 ? LYRIC_ALPHA.near : 0;   // a long neighbour would crowd the visual: leave it out
  };
  const has = view.cur >= 0;
  const g = view.glide, e = has ? view.emph : 0;
  const y1 = place(CENTER), y0 = place(CENTER - 1);
  return Array.from({ length: SLOTS }, (_, j) => {
    const a1 = alphaAt(j, CENTER, has), a0 = alphaAt(j, CENTER - 1, true);
    const a = g < 1 ? a0 + (a1 - a0) * g : (j === CENTER && has ? LYRIC_ALPHA.near + (a1 - LYRIC_ALPHA.near) * e : a1);
    const tint = j === CENTER ? (has ? g * e : 0) : j === CENTER - 1 ? (1 - g) : 0;
    return { y: y0[j] + (y1[j] - y0[j]) * g, a, tint };
  });
}

export function createLyricsLayer({ doc = typeof document !== "undefined" ? document : null } = {}) {
  const canvas = doc ? (typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(AW, 16) : Object.assign(doc.createElement("canvas"), { width: AW, height: 16 })) : null;
  const ctx = canvas?.getContext("2d");
  let version = 0, fontsReady = 0, key = "";
  const rows = new Array(SLOTS).fill(0);
  const loaded = new Set();
  function loadFonts(f) {
    if (!doc?.fonts?.load) return;
    doc.fonts.load(`${f.w0} 48px ${f.family}`).then(() => { fontsReady++; key = ""; }).catch(() => {});
  }

  return {
    canvas,
    /**
     * State for the engine this frame, or null when the layer shows nothing.
     * lines: parsed lines of THIS track, sec: playback position, posKnown: the source gives a real position, id: track
     * id, style: the visual's lyric style, mode: "lines" | "one" (⚙), W/H: render size in px.
     */
    frame({ lines, sec, posKnown, id, style, mode = "lines", W = 1280, H = 720 }) {
      if (!ctx) return null;
      const view = lyricView(lines, sec, posKnown);
      if (!view) return null;
      const st = { ...DEFAULT_LYRIC_STYLE, ...(style || {}) };
      const land = W >= H;
      const place = { ...DEFAULT_LYRIC_STYLE[land ? "land" : "port"], ...(st[land ? "land" : "port"] || {}) };
      const nLines = mode === "one" ? 1 : place.lines;
      const f = LYRIC_FONTS[st.font] || LYRIC_FONTS.sans;
      if (!loaded.has(st.font)) { loaded.add(st.font); loadFonts(f); }
      const fs = 0.04 * Math.min(W, H) * (st.size || 1) * (f.size || 1);          // screen font size, px
      const boxW = place.width * W;
      const F = Math.min(56, Math.floor((AW * 0.98) * fs / boxW));               // atlas font size
      const scale = fs / F;                                                       // screen px per atlas px
      const rowA = Math.round(F * 1.32), slotA = rowA * 6;                        // atlas row / slot height (≤ 6 rows)
      const AH = SLOTS * slotA;
      const k = `${id}|${view.at}|${st.font}|${F}|${Math.round(boxW)}|${place.align}|${fontsReady}`;
      if (k !== key) {
        key = k;
        if (canvas.width !== AW || canvas.height !== AH) { canvas.width = AW; canvas.height = AH; }
        ctx.clearRect(0, 0, AW, AH);
        ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
        ctx.font = `${f.w0} ${F}px ${f.family}`;
        ctx.textAlign = place.align === "left" ? "left" : "center";
        const maxW = boxW / scale;
        const x = place.align === "left" ? 2 : maxW / 2;
        for (let j = 0; j < SLOTS; j++) {
          const s = view.at - CENTER + j;
          rows[j] = 0;
          if (s < 0 || s >= view.show.length) continue;
          const r = wrapLine(lines[view.show[s]].text, (t) => ctx.measureText(t).width, maxW * 0.98, 6);
          const widest = Math.max(...r.map((t) => ctx.measureText(t).width));
          if (widest > maxW) ctx.font = `${f.w0} ${Math.floor(F * Math.max(0.85, maxW / widest))}px ${f.family}`;   // same size as the rest (only a very long word may shrink a little)
          r.forEach((t, i) => ctx.fillText(t, x, j * slotA + slotA / 2 + (i - (r.length - 1) / 2) * rowA));
          ctx.font = `${f.w0} ${F}px ${f.family}`;
          rows[j] = r.length;
        }
        version++;
      }
      const lay = blockLayout(rows, view, rowA * scale, fs * 0.55, nLines);
      const x0 = place.align === "left" ? place.x * W : place.x * W - boxW / 2;
      return {
        canvas, version, occlude: st.occlude === false ? 0 : 1, ink: st.ink, accent: st.accent,
        box: [x0, boxW, scale, place.y * H],                    // left edge, width, scale, anchor y (px from the bottom)
        slotPx: slotA * scale,                                  // slot height on screen
        slots: lay.flatMap((l) => [l.y, l.a, l.tint, 0]),
      };
    },
  };
}
