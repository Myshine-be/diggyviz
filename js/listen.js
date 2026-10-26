import { envelope } from "./envelope.js";
// Listening mode: the microphone hears the music in the room, so bass is real.
// Sound stays on the device: it is analysed live and never recorded or sent.
// Pure analysis lives in makeDetector()/processSpectrum() so it can be tested without Web Audio.

const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;

/** Log-spaced band ranges [from, to) in FFT bins. */
export function bandEdges(sampleRate, fftSize, nb = 32, fmin = 30, fmax = 12000) {
  const hz = sampleRate / fftSize, bins = fftSize / 2;
  const edges = [];
  for (let i = 0; i < nb; i++) {
    const f0 = fmin * Math.pow(fmax / fmin, i / nb), f1 = fmin * Math.pow(fmax / fmin, (i + 1) / nb);
    const a = Math.min(bins - 1, Math.floor(f0 / hz)), b = Math.min(bins, Math.max(a + 1, Math.ceil(f1 / hz)));
    edges.push([a, b]);
  }
  return edges;
}

const avgBins = (spec, a, b) => { let s = 0; a = Math.min(spec.length, Math.max(0, a)); b = Math.min(spec.length, Math.max(a, b)); for (let i = a; i < b; i++) s += spec[i]; return s / Math.max(1, b - a) / 255; };

export function makeDetector(sampleRate, fftSize, nb = 32) {
  const hz = sampleRate / fftSize;
  const bin = (f) => Math.max(1, Math.round(f / hz));
  return {
    nb, edges: bandEdges(sampleRate, fftSize, nb),
    bassR: [bin(30), bin(150) + 1], bodyR: [bin(300), bin(3000) + 1], body: 0.3, midR: [bin(1500), bin(4000) + 1], hiR: [bin(6000), bin(12000) + 1],
    bandMax: new Float32Array(nb).fill(0.25),
    bassMax: 0.3, bassFloor: 0.1, prevBass: 0, fluxAvg: 0.02,
    prevMid: 0, prevHi: 0, midAvg: 0.02, hiAvg: 0.02,
    levelMax: 0.25, slow: 0, fast: 0, quiet: 0,
    t: 0, lastKick: -1, kicks: [], bpm: 120, phaseAt: 0,
    kick: 0, snare: 0, hat: 0, punch: 0, boom: 0, beatIdx: 0,
  };
}

/**
 * Turn one byte spectrum (AnalyserNode.getByteFrequencyData) into the same
 * fields rhythm.js produces, written into `out` (the shared audio object).
 */
export function processSpectrum(st, spec, dt, out) {
  dt = clamp(Number.isFinite(dt) ? dt : 1 / 60, 0, 0.1);
  st.t += dt;
  const decay = (v, rate) => v * Math.exp(-dt * rate);

  // spectrum bands with per-band automatic gain
  let sum = 0;
  for (let i = 0; i < st.nb; i++) {
    const [a, b] = st.edges[i];
    const v = avgBins(spec, a, b);
    st.bandMax[i] = Math.max(v, st.bandMax[i] - dt * 0.05, 0.04);   // low floor: quiet rooms / far microphones still fill the range
    const target = clamp(v / st.bandMax[i]) * (1 - (i / st.nb) * 0.25);
    sum += envelope(out.bands, out.peaks, i, target, dt);
  }

  // bass level, normalised between a slow floor and a slow-falling maximum
  const rawBass = avgBins(spec, st.bassR[0], st.bassR[1]);
  st.bassMax = Math.max(rawBass, st.bassMax - dt * 0.04, 0.15);
  st.bassFloor = rawBass < st.bassFloor ? rawBass : st.bassFloor + (rawBass - st.bassFloor) * (1 - Math.exp(-dt * 0.3));
  const rel = clamp((rawBass - st.bassFloor * 0.85) / Math.max(0.05, st.bassMax - st.bassFloor * 0.85));
  // How bass-heavy is the music? Bass level above the body of the mix (300 Hz–3 kHz), in byte-dB:
  // ~0 for acoustic/vocal songs, +0.15..0.3 (10–20 dB) for hip-hop/EDM. Volume-independent.
  st.body += (avgBins(spec, st.bodyR[0], st.bodyR[1]) - st.body) * (1 - Math.exp(-dt * 2));
  const heavy = clamp(0.35 + (rawBass - st.body) * 2.6, 0.2, 1);
  const bass = rel * heavy;

  // kick = sudden rise in bass (spectral flux) above the recent average
  const flux = Math.max(0, bass - st.prevBass);
  st.prevBass = bass;
  st.fluxAvg += (flux - st.fluxAvg) * (1 - Math.exp(-dt * 1.5));
  const isKick = flux > Math.max(0.04, st.fluxAvg * 3.2) && rel > 0.35 && st.t - st.lastKick > 0.22;
  if (isKick) {
    if (st.lastKick >= 0) {
      const iv = st.t - st.lastKick;
      if (iv > 0.27 && iv < 1.2) { st.kicks.push(iv); if (st.kicks.length > 16) st.kicks.shift(); }
    }
    st.lastKick = st.t; st.phaseAt = st.t; st.beatIdx++;
    st.kick = 1; st.punch = Math.max(st.punch, clamp((0.3 + rel * 0.7) * heavy * 1.15));
    if (st.kicks.length >= 4) {
      const s = [...st.kicks].sort((x, y) => x - y), med = s[s.length >> 1];
      let bpm = 60 / med; while (bpm < 80) bpm *= 2; while (bpm > 180) bpm /= 2;
      st.bpm += (bpm - st.bpm) * 0.3;
    }
  }
  st.kick = decay(st.kick, 7); st.punch = decay(st.punch, 9);

  // snare / hats from mid and high flux
  const mid = avgBins(spec, st.midR[0], st.midR[1]), hi = avgBins(spec, st.hiR[0], st.hiR[1]);
  const mf = Math.max(0, mid - st.prevMid), hf = Math.max(0, hi - st.prevHi);
  st.prevMid = mid; st.prevHi = hi;
  st.midAvg += (mf - st.midAvg) * (1 - Math.exp(-dt * 1.5)); st.hiAvg += (hf - st.hiAvg) * (1 - Math.exp(-dt * 1.5));
  st.snare = mf > Math.max(0.03, st.midAvg * 3) ? 1 : decay(st.snare, 9);
  st.hat = hf > Math.max(0.02, st.hiAvg * 3) ? 1 : decay(st.hat, 16);

  // overall energy with automatic gain; a drop = loud bass after a quieter stretch
  const level = sum / st.nb;
  st.levelMax = Math.max(level, st.levelMax - dt * 0.03, 0.03);
  const energy = clamp(level / st.levelMax * 1.1);
  st.fast += (rel - st.fast) * (1 - Math.exp(-dt * 4));
  st.slow += (rel - st.slow) * (1 - Math.exp(-dt * 0.25));
  st.quiet = st.slow < 0.45 ? Math.min(st.quiet + dt, 10) : Math.max(0, st.quiet - dt * 2);
  if (st.boom < 0.05 && st.quiet > 2.5 && st.fast > 0.75 && st.fast > st.slow * 1.6) { st.boom = 1; st.quiet = 0; }
  st.boom = decay(st.boom, 1.6);

  const beatLen = 60 / st.bpm;
  out.kick = st.kick * energy; out.snare = st.snare * energy; out.hat = st.hat * energy;
  out.energy = energy; out.level = level; out.bass = bass;
  out.punch = st.punch; out.boom = st.boom;
  out.beat = ((st.t - st.phaseAt) / beatLen) % 1; out.beatIdx = st.beatIdx;
  out.t = st.t;
  return out;
}

/**
 * Oscilloscope trace from raw samples: starts at a rising zero crossing (so the trace stands still on
 * steady tones), averages down to `out.length` points and applies automatic gain with a slow release,
 * so quiet music or a far microphone still fills the range. Returns the gain state.
 */
export function waveFrom(samples, out, gain = { peak: 0.02 }, dt = 1 / 60) {
  const n = out.length, span = Math.floor(samples.length / 2);
  let start = 0;
  for (let i = 1; i < samples.length - span; i++) if (samples[i - 1] < 0 && samples[i] >= 0) { start = i; break; }
  const step = span / n;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    let s = 0; const a = start + Math.floor(i * step), b = start + Math.floor((i + 1) * step);
    for (let j = a; j < b; j++) s += samples[j];
    out[i] = s / Math.max(1, b - a);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  gain.peak = Math.max(peak, gain.peak * Math.exp(-dt * 0.8), 0.003);   // fast attack, ~1 s release
  for (let i = 0; i < n; i++) out[i] = Math.max(-1, Math.min(1, out[i] / gain.peak));
  return gain;
}

/**
 * Microphone + Web Audio wrapper.
 * Every start() gets a generation number; stop() bumps it, so a permission prompt that is answered
 * after the user switched listening off (or started again) is released immediately and never wins.
 * onChange() fires whenever `active` changes for any reason (start, stop, mic unplugged, context closed).
 */
export function createListener({ onStatus = () => {}, onChange = () => {}, media = () => navigator.mediaDevices,
  AudioCtx = () => window.AudioContext || window.webkitAudioContext, doc = () => (typeof document !== "undefined" ? document : null) } = {}) {
  let res = null;        // { stream, ctx, an, buf, st } of the running session
  let pending = null;    // shared promise of the start in progress
  let gen = 0;
  const release = (r) => {
    if (!r) return;
    try { r.stream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { if (r.ctx && r.ctx.state !== "closed") r.ctx.close()?.catch(() => {}); } catch {}
  };
  const resume = () => { const c = res?.ctx; if (c && c.state !== "running" && c.state !== "closed") c.resume?.().catch(() => {}); };
  doc()?.addEventListener?.("visibilitychange", () => { if (doc().visibilityState === "visible") resume(); });

  doc()?.addEventListener?.("pointerdown", resume, { passive: true });

  const L = {
    get supported() { return !!(media()?.getUserMedia && AudioCtx()); },
    get active() { return !!res && res.ctx.state !== "closed"; },
    get receiving() { return !!res && res.ctx.state === "running" && !res.stream.getAudioTracks()[0]?.muted; },
    get starting() { return !!pending; },
    get bpm() { return res?.st.bpm ?? 120; },
    start() {
      if (L.active) return Promise.resolve(true);
      if (pending) return pending;
      const my = ++gen;
      let r = null;
      const attempt = (async () => {
        try {
          r = { stream: await media().getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }) };
          if (my !== gen) { release(r); return false; }
          const Ctx = AudioCtx();
          r.ctx = new Ctx();
          if (r.ctx.state === "suspended") await r.ctx.resume();
          if (my !== gen) { release(r); return false; }
          const srcNode = r.ctx.createMediaStreamSource(r.stream);
          r.an = r.ctx.createAnalyser();
          r.an.fftSize = 2048; r.an.smoothingTimeConstant = 0.45; r.an.minDecibels = -90; r.an.maxDecibels = -15;
          srcNode.connect(r.an); // not connected to the speakers: no echo
          r.buf = new Uint8Array(r.an.frequencyBinCount);
          r.tbuf = new Float32Array(r.an.fftSize); r.gain = { peak: 0.02 };
          r.st = makeDetector(r.ctx.sampleRate, r.an.fftSize);
          r.stream.getAudioTracks()[0]?.addEventListener("ended", () => {
            if (res !== r) return;
            L.stop(); onStatus("Luisteren gestopt: de microfoon is niet meer beschikbaar.", true);
          });
          r.ctx.addEventListener?.("statechange", () => {
            if (res !== r) return;
            if (r.ctx.state === "closed") { L.stop(); onStatus("Luisteren gestopt.", true); }
            else if (r.ctx.state !== "running") resume(); // iOS "interrupted" (call, Siri) or suspended
          });
          res = r;
          onChange(true);
          return true;
        } catch (e) {
          release(r);
          if (my === gen) onStatus(e?.name === "NotAllowedError" ? "Geen toegang tot de microfoon. Sta het toe in de instellingen van je browser." : "Luisteren lukt niet op dit toestel.", true);
          return false;
        }
      })();
      pending = attempt;
      attempt.then(() => { if (my === gen) pending = null; });
      return attempt;
    },
    stop() {
      const was = !!res; // also true when the context already closed on its own
      gen++; pending = null;
      const r = res; res = null;
      release(r);
      if (was) onChange(false);
    },
    /** Fill the shared audio object for this frame. */
    analyse(out, dt) {
      if (!L.active) return;
      if (L.receiving) res.an.getByteFrequencyData(res.buf);
      else res.buf.fill(0); // a suspended context can return its last frame indefinitely
      processSpectrum(res.st, res.buf, dt, out);
    },
    /** Fill `out` (-1..1) with the current oscilloscope trace from the microphone. */
    wave(out, dt) {
      if (!L.active) return false;
      if (!L.receiving) { out.fill(0); return true; }
      res.an.getFloatTimeDomainData(res.tbuf);
      waveFrom(res.tbuf, out, res.gain, dt);
      return true;
    },
  };
  return L;
}
