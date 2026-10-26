// Album-art palette (moved from v1 index.html paletteFrom). Colors are 0–255 RGB arrays.

export const DEFAULT_PAL = paletteFromHue(0.47);   // neon teal → cyan with a magenta accent

function toHSV([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; if (h < 0) h += 1; } return [h, mx ? d / mx : 0, mx]; }
export function fromHSV(h, s, v) { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); const m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6]; return m.map((x) => x * 255); }

// Neon palette around one hue: deep saturated shadow, full-strength base, a bright neighbour
// and an electric accent from the opposite side of the colour wheel.
export function paletteFromHue(h, s = 0.95) {
  const sat = Math.max(0.85, s);
  return { dark: fromHSV((h + 0.97) % 1, sat, 0.13), mid: fromHSV(h, sat, 1), hi: fromHSV((h + 0.13) % 1, sat * 0.75, 1), hot: fromHSV((h + 0.42) % 1, 1, 1) };
}

/** Loads an image (CORS) and resolves { pal, img }. img is null when it cannot be read. */
export function paletteFrom(url) {
  return new Promise((resolve) => {
    if (!url) return resolve({ pal: { ...DEFAULT_PAL }, img: null });
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 24;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; const px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        let vivid = px[0], vs = -1;
        for (const p of px) { const [, s, v] = toHSV(p); const score = s * s * v * (v > 0.3 ? 1 : 0.2); if (score > vs) { vs = score; vivid = p; } }
        const [h, s] = toHSV(vivid);
        resolve({ pal: paletteFromHue(h, Math.max(0.85, s)), img });
      } catch { resolve({ pal: { ...DEFAULT_PAL }, img: null }); }
    };
    img.onerror = () => resolve({ pal: { ...DEFAULT_PAL }, img: null });
    img.src = url;
  });
}
