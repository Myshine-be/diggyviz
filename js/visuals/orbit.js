// Orbit — a slowly turning sphere. With synced lyrics (LRCLIB, js/lyrics.js) the sphere is covered with the song's
// lines: the line being sung sits in front, large and lit in the cover colour and fills from left to right as it is
// sung; earlier lines drift up and away, the next ones wait below, curving round the globe. Without lyrics it shows
// latitude circles rippled by the spectrum (lows near the equator, highs near the poles).
import { SPECTRUM_HISTORY } from "./spectrum-history.js";
import { lineAt } from "../lyrics.js";

const ROWS = 10, ROW_H = 96, TEX = 1024, NOW = 3;   // atlas: lines current-3 … current+6
const states = new WeakMap();

function atlas(gl) {
  let st = states.get(gl);
  if (!st || !gl.isTexture(st.tex)) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, TEX, TEX, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(TEX, TEX) : Object.assign(document.createElement("canvas"), { width: TEX, height: TEX });
    st = { tex, canvas, ctx: canvas.getContext("2d"), key: "", widths: new Float32Array(ROWS) };
    states.set(gl, st);
  }
  return st;
}

function drawAtlas(st, lines, cur) {
  const x = st.ctx;
  x.clearRect(0, 0, TEX, TEX);
  x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#fff";
  for (let r = 0; r < ROWS; r++) {
    const i = cur - NOW + r;
    const text = i >= 0 && i < lines.length ? lines[i].text : "";
    let size = 58;
    x.font = `600 ${size}px "IBM Plex Sans", "Segoe UI", system-ui, sans-serif`;
    let w = x.measureText(text).width;
    if (w > TEX * 0.94) { size = Math.max(26, Math.floor(size * (TEX * 0.94) / w)); x.font = `600 ${size}px "IBM Plex Sans", "Segoe UI", system-ui, sans-serif`; w = x.measureText(text).width; }
    x.fillText(text || (i === cur ? "♪" : ""), TEX / 2, r * ROW_H + ROW_H / 2);
    st.widths[r] = Math.min(1, (text ? w : size) / TEX);
  }
}

export default {
  id: "orbit",
  name: "Orbit",
  bloom: 0.75,

  uniforms({ gl, loc, frame }) {
    const ly = frame.lyrics, lines = ly?.lines || [];
    const has = lines.length > 0;
    if (loc.uHasLyrics) gl.uniform1f(loc.uHasLyrics, has ? 1 : 0);
    if (!has) return;
    const st = atlas(gl);
    const sec = (ly.posMs || 0) / 1000;
    const cur = Math.max(0, lineAt(lines, sec));
    const key = ly.id + ":" + cur;
    if (key !== st.key) {
      st.key = key; drawAtlas(st, lines, cur);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, st.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, st.canvas);
    }
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, st.tex);
    if (loc.uLyrics) gl.uniform1i(loc.uLyrics, 5);
    const t0 = lines[cur]?.t ?? 0, t1 = lines[cur + 1]?.t ?? t0 + 4;
    const dur = Math.max(0.3, t1 - t0), el = Math.max(0, sec - t0);
    if (loc.uLineProg) gl.uniform1f(loc.uLineProg, Math.min(1, el / Math.max(0.3, dur - 0.3)));
    if (loc.uGlide) gl.uniform1f(loc.uGlide, Math.min(1, Math.max(0, (el - (dur - 0.4)) / 0.4)));
    if (loc.uLineW) gl.uniform1fv(loc.uLineW, st.widths);
  },

  frag: /* glsl */ `
${SPECTRUM_HISTORY}
const int NC = 16;
uniform sampler2D uLyrics;
uniform float uHasLyrics, uLineProg, uGlide;
uniform float uLineW[10];

// the lyrics globe: lines on latitude bands of the front half, current line in front
vec3 lyricsGlobe(vec3 col, vec2 p, float px) {
  float R = 0.38 + 0.01 * histSmooth(0.05, 0.0);
  float d = length(p);
  // atmosphere and a faint wire globe so it still reads as a sphere
  col += pal(0.6) * exp(-max(d - R, 0.0) * 30.0) * 0.12 * step(R, d);
  if (d > R) return col;
  vec3 n = vec3(p / R, sqrt(max(0.0, 1.0 - d * d / (R * R))));
  float lat = asin(clamp(n.y, -1.0, 1.0)), lon = atan(n.x, n.z);
  col = mix(col, uPal[0] * 0.35 + pal(0.5) * 0.04, 0.85);
  float wire = gridLine(lat / 0.2 + 0.5 + uGlide, 0.03) * 0.5 + gridLine((lon + uTime * 0.05) / 0.35, 0.02) * 0.35;
  col += pal(0.55) * wire * 0.12 * n.z;
  float ROW = 0.2;
  for (int j = 0; j < 10; j++) {
    float fj = float(j);
    float rel = fj - 3.0 - uGlide;                       // 0 = the line being sung
    float latC = -rel * ROW;
    float v = (lat - latC) / (ROW * 0.82) + 0.5;
    if (v < 0.0 || v > 1.0) continue;
    float u = lon / 2.6 + 0.5;
    if (u < 0.0 || u > 1.0) continue;
    float a = texture(uLyrics, vec2(u, (fj + 1.0 - v) * 96.0 / 1024.0)).a;
    float isNow = 1.0 - smoothstep(0.0, 0.6, abs(rel));
    float w = uLineW[j];
    float fill = step(u, 0.5 - w * 0.5 + w * uLineProg);  // karaoke: sung part lit
    vec3 tc = mix(pal(0.45) * 0.55, mix(pal(0.95), vec3(1.0), 0.35 * fill), isNow) * (0.75 + 0.5 * fill * isNow);
    float fade = (1.0 - smoothstep(1.0, 4.5, abs(rel))) * smoothstep(0.0, 0.35, n.z);
    col = mix(col, tc, a * fade * (0.55 + 0.45 * isNow));
    col += pal(0.95) * a * isNow * fill * 0.25 * (0.6 + 0.6 * histSmooth(0.3, 0.0));
  }
  // rim light
  col += pal(0.8) * pow(1.0 - n.z, 3.0) * 0.25;
  return col;
}

void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float R = 0.3 + uKick * 0.02;
  float T = 0.42;                                   // view tilt
  float rot = uTime * 0.15;
  vec3 col = uPal[0] * 0.12;
  if (uHasLyrics > 0.5) { fragColor = vec4(lyricsGlobe(col, p, px), 1.0); return; }

  float sT = sin(T), cT = cos(T);
  for (int k = 0; k < NC; k++) {
    float fk = float(k);
    float lat = mix(-1.25, 1.25, (fk + 0.5) / float(NC));
    float r = R * cos(lat);
    vec2 q = vec2(p.x, p.y - R * sin(lat) * cT);
    if (abs(q.x) > r * 1.2 || abs(q.y) > r * sT * 1.2 + 0.03) continue;
    float lam = atan(-q.y / sT, q.x);
    float lon = lam + rot;
    float f = abs(lat) / 1.25;                      // equator = lows, poles = highs
    float age = fract(lon / TAU) * 1.5;            // the sound of the last 1.5 s wraps round the sphere
    float hitNow = exp(-age * 3.0);                 // the side where the newest sound is
    float rr = r * (1.0 + (histShape(f, age) * 0.17 + (1.4 * flux(f) + 0.7 * uKick * (1.0 - f) + 0.5 * uSnare * f) * 0.1 * hitNow) * (0.6 + 0.4 * sin(lon * 6.0 + fk)));
    float zf = R * sin(lat) * sT + rr * sin(lam) * cT;   // towards the viewer > 0
    col += lineCol(f) * ellipseLine(q, rr, rr * sT, px) * (zf > 0.0 ? 0.95 : 0.3) * 0.85 * (1.0 + 1.2 * uHit * hitNow);
  }
  fragColor = vec4(col, 1.0);
}
`,
};
