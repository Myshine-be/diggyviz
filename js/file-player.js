// Own music, like a PSP: DiggyViz plays your audio files and analyses the very same sound, so the visuals are
// exactly on the beat — through speakers, wired headphones or Bluetooth. Same analysis as listening mode
// (js/listen.js). The analysis branch is delayed by the device's output latency (e.g. AirPods), so what you
// see lines up with what you hear. Files stay on the device; nothing is uploaded.
import { makeDetector, processSpectrum, waveFrom } from "./listen.js";
import { readTags, parseFileName } from "./id3.js";

export const AUDIO_FILE = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|aif|aiff)$/i;
export const isAudioFile = (f) => !!f && ((f.type || "").startsWith("audio/") || AUDIO_FILE.test(f.name || ""));

export function createFilePlayer({ onStatus = () => {}, onChange = () => {} } = {}) {
  const el = new Audio();
  el.preload = "auto";
  el.setAttribute("playsinline", "");
  let ctx = null, an = null, delay = null, buf = null, tbuf = null, gain = { peak: 0.02 }, st = null;
  let list = [], idx = -1, current = null, srcUrl = "", artUrl = "", listener = () => {}, loadGen = 0, lastEmit = 0;

  function ensureGraph() {
    if (ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctx({ latencyHint: "playback" });
    const src = ctx.createMediaElementSource(el);
    an = ctx.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0.3; an.minDecibels = -90; an.maxDecibels = -15;
    delay = ctx.createDelay(1.0);
    src.connect(ctx.destination);       // what you hear
    src.connect(delay); delay.connect(an); // what the visuals see, delayed to match the output
    buf = new Uint8Array(an.frequencyBinCount);
    tbuf = new Float32Array(an.fftSize);
    st = makeDetector(ctx.sampleRate, an.fftSize);
    syncLatency();
  }
  function syncLatency() {
    if (!ctx) return;
    const l = (Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0) + (Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0);
    delay.delayTime.value = Math.min(0.9, Math.max(0, l));
  }

  function emit(force = false) {
    const now = performance.now();
    if (!force && now - lastEmit < 900) return;
    lastEmit = now;
    if (!current) { listener(null); return; }
    listener({ ...current, dur: Number.isFinite(el.duration) && el.duration > 0 ? el.duration * 1000 : 210000, prog: el.currentTime * 1000, playing: !el.paused && !el.ended });
  }
  for (const ev of ["play", "pause", "seeked", "loadedmetadata", "durationchange"]) el.addEventListener(ev, () => { emit(true); onChange(); });
  el.addEventListener("timeupdate", () => emit(false));
  el.addEventListener("ended", () => { if (idx < list.length - 1) P.next(); else { emit(true); onChange(); } });
  el.addEventListener("error", () => { if (current) onStatus(`"${current.name}" kan niet worden afgespeeld op dit toestel.`, true); });

  function mediaSession() {
    const ms = typeof navigator !== "undefined" && navigator.mediaSession;
    if (!ms || !current) return;
    try {
      ms.metadata = new MediaMetadata({ title: current.name, artist: current.artists, album: current.album || "DiggyViz", artwork: artUrl ? [{ src: artUrl }] : [] });
      ms.setActionHandler("play", () => P.play());
      ms.setActionHandler("pause", () => P.pause());
      ms.setActionHandler("nexttrack", () => P.next());
      ms.setActionHandler("previoustrack", () => P.prev());
    } catch {}
  }

  async function open(i, autoplay) {
    if (!list.length) return;
    const my = ++loadGen;
    idx = (i + list.length) % list.length;
    const f = list[idx];
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    if (artUrl) URL.revokeObjectURL(artUrl);
    srcUrl = URL.createObjectURL(f); artUrl = "";
    el.src = srcUrl;
    const named = parseFileName(f.name);
    current = { id: `file:${f.name}:${f.size}`, name: named.name, artists: named.artists, art: "", album: "" };
    emit(true);
    if (autoplay) P.play();
    const tags = await readTags(f);
    if (my !== loadGen) return;
    if (tags.picture) artUrl = URL.createObjectURL(new Blob([tags.picture.bytes], { type: tags.picture.mime }));
    current = { ...current, name: tags.title || current.name, artists: tags.artist || current.artists, album: tags.album || "", art: artUrl };
    emit(true);
    mediaSession();
  }

  const P = {
    // ----- sound input (same interface as js/listen.js) -----
    get supported() { return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext); },
    get active() { return !!st && !!current; },
    get receiving() { return !!ctx && ctx.state === "running" && !el.paused && !el.ended; },
    get starting() { return false; },
    get bpm() { return st?.bpm ?? 120; },
    analyse(out, dt) {
      if (!st) return;
      if (P.receiving) an.getByteFrequencyData(buf); else buf.fill(0);
      processSpectrum(st, buf, dt, out);
    },
    wave(out, dt) {
      if (!st) return false;
      if (!P.receiving) { out.fill(0); return true; }
      an.getFloatTimeDomainData(tbuf);
      waveFrom(tbuf, out, gain, dt);
      return true;
    },
    // ----- player -----
    get hasMusic() { return list.length > 0; },
    get playing() { return !el.paused && !el.ended; },
    get index() { return idx; },
    get count() { return list.length; },
    setTrackListener(fn) { listener = fn || (() => {}); emit(true); },
    async load(files) {
      const picked = [...(files || [])].filter(isAudioFile).sort((a, b) => a.name.localeCompare(b.name, "nl", { numeric: true }));
      if (!picked.length) { onStatus("Geen muziekbestanden gekozen (MP3, M4A, WAV, AAC, FLAC…).", true); return false; }
      list = picked;
      await open(0, true);
      onStatus(list.length > 1 ? `${list.length} nummers geladen.` : "");
      return true;
    },
    async play() {
      if (!current) return false;
      ensureGraph();
      try { if (ctx.state !== "running") await ctx.resume(); } catch {}
      syncLatency();
      try { await el.play(); return true; }
      catch { onStatus("Tik op ▶ om af te spelen.", false); onChange(); return false; }
    },
    pause() { el.pause(); },
    toggle() { return el.paused ? P.play() : (el.pause(), Promise.resolve(false)); },
    next() { if (list.length) open(idx + 1, true); },
    prev() { if (!list.length) return; if (el.currentTime > 3) { el.currentTime = 0; return; } open(idx - 1, true); },
    seek(frac) { if (Number.isFinite(el.duration) && el.duration > 0) el.currentTime = Math.max(0, Math.min(1, frac)) * el.duration; },
    /** source interface (js/sources/*): the app switches sources with start/stop */
    start() { emit(true); },
    stop() { el.pause(); },
  };
  return P;
}
