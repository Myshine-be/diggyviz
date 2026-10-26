// Minimal ID3v2 reader for DiggyViz's own music player: title, artist, album and cover picture.
// Pure functions (tested in tests/media.test.mjs). Unknown or damaged tags simply return {}.

/** "03 - Artist - Title_(Remix).mp3" → { artists: "Artist", name: "Title (Remix)" } */
export function parseFileName(fileName) {
  let base = String(fileName || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  base = base.replace(/^\d{1,3}\s*[-.)]\s*/, "");                           // leading track number
  const parts = base.split(/\s+[-–]\s+/);
  if (parts.length >= 2) return { artists: parts[0].trim(), name: parts.slice(1).join(" - ").trim() };
  return { artists: "", name: base || "Onbekend nummer" };
}

const synchsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function decodeText(bytes, enc) {
  try {
    if (enc === 0) return new TextDecoder("latin1").decode(bytes);
    if (enc === 1) return new TextDecoder("utf-16").decode(bytes);           // with BOM
    if (enc === 2) return new TextDecoder("utf-16be").decode(bytes);
    return new TextDecoder("utf-8").decode(bytes);
  } catch { return ""; }
}
const clean = (s) => s.replace(/\u0000+$/g, "").split("\u0000")[0].trim();

/** Parse an ID3v2.3/2.4 tag from the start of a file's bytes (Uint8Array). */
export function parseID3(b) {
  if (!b || b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return {};
  const ver = b[3], flags = b[5];
  if (ver < 3 || ver > 4) return {};
  const end = Math.min(b.length, 10 + synchsafe(b, 6));
  let o = 10;
  if (flags & 0x40) o += ver === 4 ? synchsafe(b, o) : be32(b, o) + 4;     // extended header
  const out = {};
  while (o + 10 <= end) {
    const id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;                                  // padding
    const size = ver === 4 ? synchsafe(b, o + 4) : be32(b, o + 4);
    const d = o + 10;
    if (size <= 0 || d + size > end) break;
    const body = b.subarray(d, d + size);
    if (id === "TIT2" || id === "TPE1" || id === "TALB") {
      const text = clean(decodeText(body.subarray(1), body[0]));
      if (text) out[{ TIT2: "title", TPE1: "artist", TALB: "album" }[id]] = text;
    } else if (id === "APIC" && !out.picture) {
      const enc = body[0];
      let p = 1;
      while (p < body.length && body[p] !== 0) p++;                        // MIME type (latin1)
      const mime = new TextDecoder("latin1").decode(body.subarray(1, p)) || "image/jpeg";
      p += 2;                                                              // terminator + picture type
      if (enc === 1 || enc === 2) { while (p + 1 < body.length && (body[p] || body[p + 1])) p += 2; p += 2; }
      else { while (p < body.length && body[p] !== 0) p++; p += 1; }       // description
      if (p < body.length) out.picture = { mime: mime.includes("/") ? mime : "image/" + mime.toLowerCase(), bytes: body.slice(p) };
    }
    o = d + size;
  }
  return out;
}

/** Read title/artist/album/cover from a File (only the tag bytes are read). */
export async function readTags(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
    const size = 10 + synchsafe(head, 6);
    return parseID3(new Uint8Array(await file.slice(0, Math.min(size, 12 * 1024 * 1024)).arrayBuffer()));
  } catch { return {}; }
}
