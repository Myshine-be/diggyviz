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

const hueDist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

/**
 * Palette from the cover's own colours (pure, tested). px = [[r,g,b], …] (0–255).
 * A small weighted k-means finds the main colour areas; vivid, large areas weigh most. The real hues are
 * kept (saturation only lifted to ≥ 0.6 and brightness to ≥ 0.85 so they glow on black):
 *   mid = the dominant vivid colour, hi = the second distinct colour, hot = the strongest remaining accent,
 *   dark = a deep shade of mid. Grey / black-and-white covers get a calm, low-saturation palette.
 */
export function paletteFromPixels(px) {
  if (!px?.length) return { ...DEFAULT_PAL };
  const pts = px.map((c) => { const [h, s, v] = toHSV(c); return { c, h, s, v, w: (0.12 + s * s) * (v > 0.12 ? 0.4 + v : 0.08) }; });
  const avgSat = pts.reduce((a, p) => a + p.s * (p.v > 0.12 ? 1 : 0), 0) / pts.length;
  // deterministic k-means++-style seeding on weighted RGB
  const K = 5, cent = [];
  const sorted = [...pts].sort((a, b) => b.w - a.w);
  cent.push([...sorted[0].c]);
  while (cent.length < K) {
    let best = null, bd = -1;
    for (const p of pts) { const d = Math.min(...cent.map((q) => (p.c[0] - q[0]) ** 2 + (p.c[1] - q[1]) ** 2 + (p.c[2] - q[2]) ** 2)) * p.w; if (d > bd) { bd = d; best = p; } }
    cent.push([...best.c]);
  }
  let groups = [];
  for (let it = 0; it < 8; it++) {
    groups = cent.map(() => ({ sum: [0, 0, 0], w: 0, n: 0 }));
    for (const p of pts) {
      let k = 0, kd = Infinity;
      cent.forEach((q, i) => { const d = (p.c[0] - q[0]) ** 2 + (p.c[1] - q[1]) ** 2 + (p.c[2] - q[2]) ** 2; if (d < kd) { kd = d; k = i; } });
      const g = groups[k]; g.w += p.w; g.n++; for (let j = 0; j < 3; j++) g.sum[j] += p.c[j] * p.w;
    }
    groups.forEach((g, i) => { if (g.w > 0) cent[i] = g.sum.map((x) => x / g.w); });
  }
  const clusters = cent.map((c, i) => { const [h, s, v] = toHSV(c); return { h, s, v, area: groups[i].n / pts.length, score: groups[i].w * (0.25 + s) * (v > 0.15 ? 1 : 0.15) }; })
    .filter((c) => c.area > 0.01).sort((a, b) => b.score - a.score);
  if (avgSat < 0.1) {                                       // black-and-white / grey cover: calm, cool palette
    const h = clusters[0]?.h ?? 0.6;
    return { dark: fromHSV(h, 0.25, 0.1), mid: fromHSV(h, 0.25, 0.92), hi: fromHSV((h + 0.05) % 1, 0.15, 1), hot: fromHSV((h + 0.5) % 1, 0.45, 1) };
  }
  const mid = clusters.find((c) => c.s > 0.2 && c.v > 0.2) || clusters[0];
  const distinct = (c, others, d) => others.every((o) => hueDist(c.h, o.h) > d || Math.abs(c.s - o.s) > 0.35);
  const hi = clusters.find((c) => c !== mid && c.s > 0.15 && c.v > 0.2 && distinct(c, [mid], 0.05)) || { h: (mid.h + 0.08) % 1, s: mid.s * 0.8, v: 1 };
  const rest = clusters.filter((c) => c !== mid && c !== hi && c.s > 0.15 && c.v > 0.15 && distinct(c, [mid, hi], 0.07)).sort((a, b) => b.s * b.v - a.s * a.v);
  const hot = rest[0] || { h: (mid.h + 0.45) % 1, s: 0.9, v: 1 };
  const lift = (c, sMin = 0.6, vMin = 0.85) => fromHSV(c.h, Math.min(1, Math.max(sMin, c.s)), Math.max(vMin, c.v));
  return { dark: fromHSV(mid.h, Math.min(1, Math.max(0.6, mid.s)), 0.12), mid: lift(mid), hi: lift(hi, 0.5, 0.9), hot: lift(hot, 0.7, 0.95) };
}

/** Loads an image (CORS) and resolves { pal, img }. img is null when it cannot be read. */
export function paletteFrom(url) {
  return new Promise((resolve) => {
    if (!url) return resolve({ pal: { ...DEFAULT_PAL }, img: null });
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 32;
        const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0, 32, 32);
        const d = x.getImageData(0, 0, 32, 32).data; const px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        resolve({ pal: paletteFromPixels(px), img });
      } catch { resolve({ pal: { ...DEFAULT_PAL }, img: null }); }
    };
    img.onerror = () => resolve({ pal: { ...DEFAULT_PAL }, img: null });
    img.src = url;
  });
}
