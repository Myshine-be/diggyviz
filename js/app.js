// DiggyViz app: wires sources → track state → rhythm → engine, plus the UI.

import { autoDuration, switchOnTrack } from "./scene-clock.js";
import { CONFIG } from "./config.js";
import { store } from "./store.js";
import { audio, analyse, hashStr } from "./rhythm.js";
import { DEFAULT_PAL, paletteFrom } from "./palette.js";
import { Engine } from "./engine.js";
import { VISUALS } from "./visuals/index.js";
import * as spotify from "./sources/spotify.js";
import { createLastfmSource } from "./sources/lastfm.js";
import { createDemoSource } from "./sources/demo.js";
import { createTempoLookup } from "./tempo-lookup.js";
import { createListener } from "./listen.js";
import { createTabListener } from "./tab-audio.js";
import { createFilePlayer } from "./file-player.js";
import { audioData, setWave, feedHistory, synthWave, resetAudioData, WAVE_N } from "./audio-data.js";

if (window.__bridge) throw new Error("iOS bridge redirect");

const $ = (id) => document.getElementById(id);
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

/* ---------------- state ---------------- */
const track = { id: "", name: "", artists: "", art: "", dur: 210000, prog: 0, playing: false, at: performance.now() };
let tempo = { bpm: 120, off: 0 };
let drop = 0;
let palCur = clonePal(DEFAULT_PAL), palTarget = clonePal(DEFAULT_PAL);
let source = null, sourceName = store.get("source", null);
let auto = store.get("auto", true);
let lastSwitch = performance.now();
let firstTrack = true;
let sourceVersion = 0;
const tempoLookup = createTempoLookup({ store });
let tempoOrigin = "default";
let tempoAuto = false;   // true while the tempo comes from the Deezer lookup (not tapped)
const listener = createListener({ onStatus: (m, err) => status(m, err), onChange: () => listenChanged() });
const tabIn = createTabListener({ onStatus: (m, err) => status(m, err), onChange: () => tabChanged() });
const player = createFilePlayer({ onStatus: (m, err) => status(m, err), onChange: () => showPlayer() });

// Which real sound drives the visuals right now: own music > shared tab > microphone > none (simulated rhythm).
function soundInput() {
  if (sourceName === "file" && player.active) return { kind: "file", io: player };
  if (tabIn.active) return { kind: "tab", io: tabIn };
  if (listener.active) return { kind: "mic", io: listener };
  return null;
}

function clonePal(p) { return { dark: [...p.dark], mid: [...p.mid], hi: [...p.hi], hot: [...p.hot] }; }
const position = () => track.playing ? Math.min(track.dur, track.prog + (performance.now() - track.at)) : track.prog;

/* ---------------- engine ---------------- */
let engine = null;
try {
  engine = new Engine($("viz"), VISUALS, { onError: (m) => status(m, true), fadeDuration: CONFIG.CROSSFADE_SECONDS });
} catch (e) {
  $("fallback").hidden = false;
  $("fallback").textContent = "Deze browser kan de visuals niet tonen (" + e.message + "). Probeer Safari of Chrome.";
}

/* ---------------- visuals UI ---------------- */
const chips = $("chips");
for (const v of VISUALS) {
  const b = document.createElement("button");
  b.className = "chip"; b.textContent = v.name; b.dataset.id = v.id; b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => { setVisual(v.id); lastSwitch = performance.now(); });
  chips.appendChild(b);
}
function setVisual(id) {
  if (!engine) return;
  const v = engine.setVisual(id);
  if (!v) return;
  lastSwitch = performance.now();
  store.set("visual", v.id);
  chips.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === v.id)));
  chips.querySelector(`[data-id="${v.id}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  $("caption").hidden = !v.caption;
}
function stepVisual(dir) {
  const i = VISUALS.findIndex((v) => v.id === engine?.currentVisual?.id);
  setVisual(VISUALS[(i + dir + VISUALS.length) % VISUALS.length].id);
  lastSwitch = performance.now();
}

/* ---------------- track handling ---------------- */
function status(msg, isErr = false) { for (const id of ["status", "settingsStatus"]) { const s = $(id); s.textContent = msg || ""; s.classList.toggle("err", !!isErr); } }

// Tempo priority: tapped by you > looked up at Deezer > 120.
function loadTempo(defBpm = 120) {
  const saved = store.get("tempo." + track.id);
  const valid = saved && Number.isFinite(saved.bpm) && saved.bpm >= 50 && saved.bpm <= 220 && Number.isFinite(saved.off);
  const auto = !valid && tempoLookup.cached(track.id);
  tempo = valid ? saved : { bpm: auto || defBpm, off: 0 };
  tempoAuto = !!auto;
  tempoOrigin = valid ? "tapped" : auto ? "found" : defBpm !== 120 || sourceName === "demo" ? "demo" : "default";
  showTempo();
}
function showTempo() {
  const inp = soundInput();
  const source = inp ? (inp.io.receiving ? inp.kind : inp.kind === "file" ? "paused" : "interrupted") : tempoOrigin;
  const labels = { file: "LIVE", tab: "LIVE", paused: "PAUZE", mic: "MIC", interrupted: "WACHT", found: "AUTO", tapped: "BPM", demo: "DEMO", loading: "ZOEK", missing: "SCHAT", unavailable: "SCHAT", default: "SCHAT" };
  const notes = {
    file: "Eigen muziek: het echte geluid, exact op de beat. Tempo gemeten.",
    tab: "Tab-geluid: het echte geluid van het tabblad. Tempo gemeten.",
    paused: "Muziek gepauzeerd.",
    mic: "Microfoon: gemeten geluid; het tempo is een schatting.",
    interrupted: "Microfoon onderbroken. Tik op het scherm om opnieuw te proberen.",
    found: "Tempo via Deezer. Tik mee om de timing bij te stellen; geen geluidsanalyse.",
    tapped: "Tempo en timing ingesteld met jouw tikken.", demo: "Demoritme; geen analyse van de muziek.",
    loading: "Tempo wordt opgezocht. Tot dan wordt 120 BPM gebruikt.",
    missing: "Geen tempo gevonden. 120 BPM is een schatting; tik mee of zet de microfoon aan.",
    unavailable: "Tempo-opzoekdienst niet bereikbaar. 120 BPM is een schatting; tik mee of gebruik de microfoon.",
    default: "120 BPM is een schatting. Tik mee of gebruik de microfoon voor het geluid.",
  };
  $("tap").firstChild.nodeValue = Math.round(inp ? inp.io.bpm : tempo.bpm) + " ";
  $("tap").querySelector("small").textContent = labels[source];
  $("tap").title = notes[source];
  $("tempoStatus").textContent = notes[source];
}
function lookupTempo(t) {
  const id = t.id, version = sourceVersion;
  if (sourceName === "file") return;   // own music: the tempo is measured from the sound itself
  if (t.bpm || tempoOrigin === "tapped" || tempoAuto) return;
  tempoOrigin = "loading"; showTempo();
  tempoLookup.lookup(t).then((bpm) => {
    if (track.id !== id || sourceVersion !== version || tempoOrigin === "tapped") return;
    if (bpm) { tempo = { bpm, off: tempo.off }; tempoAuto = true; }
    tempoOrigin = tempoLookup.state(id);
    showTempo();
  });
}

async function onTrack(t) {
  if (!t) {
    track.prog = position(); track.at = performance.now(); track.playing = false;
    return;
  }
  const version = sourceVersion;
  const changed = t.id !== track.id;
  // same song, richer details (e.g. own music: the cover and tags arrive a moment after the file starts)
  const details = !changed && (t.name !== track.name || t.artists !== track.artists || (t.art || "") !== (track.art || ""));
  const artChanged = changed || (t.art || "") !== (track.art || "");
  Object.assign(track, { id: t.id, name: t.name, artists: t.artists, art: t.art, dur: t.dur || 210000, prog: t.prog || 0, playing: !!t.playing, at: performance.now() });
  if (!changed && !details) return;

  $("title").textContent = t.name || "Onbekend nummer";
  $("artist").textContent = t.artists || "";
  $("caption").textContent = (t.name || "").toLowerCase();
  $("art").style.backgroundImage = t.art ? `url("${t.art}")` : "";
  if (!changed) {
    if (artChanged && !t.palette) {
      const { pal, img } = await paletteFrom(t.art);
      if (sourceVersion !== version || track.id !== t.id) return;
      palTarget = clonePal(pal); engine?.setArt(img, pal);
      document.documentElement.style.setProperty("--accent", `rgb(${palTarget.hi.map((v) => v | 0).join(",")})`);
    }
    return;
  }
  loadTempo(t.bpm || 120);
  lookupTempo(t);
  const isFirst = firstTrack;
  drop = isFirst ? 0 : 1;
  taps = [];
  if (auto && !isFirst && switchOnTrack(engine?.currentVisual)) stepVisual(1);
  firstTrack = false;

  if (t.palette) { palTarget = clonePal(t.palette); engine?.setArt(null, t.palette); }
  else {
    const { pal, img } = await paletteFrom(t.art);
    if (sourceVersion !== version || track.id !== t.id) return;
    palTarget = clonePal(pal);
    engine?.setArt(img, pal);
  }
  if (isFirst) palCur = clonePal(palTarget);
  const hi = palTarget.hi.map((v) => v | 0);
  document.documentElement.style.setProperty("--accent", `rgb(${hi.join(",")})`);
}

/* ---------------- sources ---------------- */
function useSource(name) {
  const version = ++sourceVersion;
  source?.stop();
  onTrack(null);
  status("");
  sourceName = name; store.set("source", name);
  $("srcBadge").textContent = name === "lastfm" ? "last.fm" : name === "file" ? "muziek" : name;
  document.querySelectorAll(".seg button[data-src]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === name)));
  document.querySelectorAll("section[data-for]").forEach((s) => { s.hidden = s.dataset.for !== name; });
  track.id = ""; firstTrack = true;
  const cb = {
    onTrack: (t) => { if (version === sourceVersion) onTrack(t); },
    onStatus: (m, err) => { if (version === sourceVersion) status(m, err); },
  };
  if (name === "spotify") {
    if (!spotify.isLoggedIn()) { status("Log in bij Spotify via ⚙"); source = createDemoSource({ onTrack, onStatus: () => {} }); }
    else source = spotify.createSpotifySource(cb);
  } else if (name === "lastfm") {
    const user = store.get("lfUser", "");
    if (!user) { status("Vul je Last.fm-gebruikersnaam in via ⚙"); source = createDemoSource({ onTrack, onStatus: () => {} }); }
    else source = createLastfmSource({ user, ...cb });
  } else if (name === "file") {
    player.setTrackListener(cb.onTrack);
    source = player;
    if (!player.hasMusic) status("Kies je muziek met 'Muziek kiezen'.");
  } else {
    source = createDemoSource(cb);
  }
  source.start();
  refreshSpotifyState();
  showPlayer();
}

async function startLogin() {
  try { await spotify.login(); }
  catch (e) { $("settings").hidden = false; status("Inloggen mislukt: " + e.message, true); }
}

function refreshSpotifyState() {
  const ok = spotify.isLoggedIn();
  $("spState").textContent = ok ? "Ingelogd. DiggyViz volgt wat je op Spotify speelt." : "Niet ingelogd. Je Spotify-account moet door Mo toegevoegd zijn.";
  $("spLogout").hidden = !ok;
  $("spLogin").textContent = ok ? "Opnieuw inloggen" : "Inloggen met Spotify";
}

/* ---------------- render loop ---------------- */
let last = performance.now(), t0 = last, lastBpmShown = 0;
const micWave = new Float32Array(WAVE_N);
let soundMode = null;
function frame(now) {
  const elapsed = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.1, elapsed); last = now;
  const pos = position();
  const inp = soundInput();
  const mode = inp ? inp.kind + (inp.io.receiving ? "" : "-idle") : "simulated";
  if (mode !== soundMode) {
    resetAudioData(); soundMode = mode;
    audio.bands.fill(0); audio.peaks.fill(0); audio.flux.fill(0);
    for (const key of ["kick", "snare", "hat", "energy", "level", "hit"]) audio[key] = 0;
  }
  // Listening mode: the microphone's real kicks drive the rhythm (beat phase and tempo). Otherwise the
  // simulated rhythm follows the song position and the tapped / looked-up tempo.
  if (inp) inp.io.analyse(audio, dt);
  else analyse(pos, track.playing, hashStr(track.id || "x"), tempo.bpm, tempo.off, dt);
  const bpmNow = inp ? inp.io.bpm : tempo.bpm;
  // the sound the visuals draw: real waveform + spectrum history from the microphone, else simulated
  audioData.live = !!inp && inp.io.receiving;
  if (inp) { inp.io.wave(micWave, dt); setWave(micWave); }
  else setWave(synthWave(audio.bands, audio.kick, track.playing ? dt : 0));
  feedHistory(audio.bands, dt);
  if (inp && now - lastBpmShown > 1000) { lastBpmShown = now; showTempo(); }
  drop = Math.max(0, drop - dt * 0.7);
  const k = 1 - Math.exp(-dt * 2.2);
  for (const key of ["dark", "mid", "hi", "hot"]) for (let i = 0; i < 3; i++) palCur[key][i] += (palTarget[key][i] - palCur[key][i]) * k;

  const visual = engine?.currentVisual;
  const age = visual?.story ? (engine.cur?.clock.seconds ?? 0) : (now - lastSwitch) / 1000;
  if (auto && engine && age >= autoDuration(visual, CONFIG.AUTO_SWITCH_SECONDS)) stepVisual(1);

  if (engine) {
    try {
      engine.render({ sceneDt: document.visibilityState === "visible" && track.playing && !sheetOpen() ? elapsed : 0, bpm: bpmNow, beatPhase: audio.beat, time: (now - t0) / 1000, dt, songTime: pos / 1000, audio, pal: palCur, drop, seed: hashStr(track.id || "x") % 1000, sound: audioData });
    } catch (e) { console.error(e); }
  }
  $("bar").style.width = (track.dur ? (pos / track.dur) * 100 : 0) + "%";
  if (!$("diag").hidden && now - lastDiag > 500) { lastDiag = now; showDiag(inp); }
  requestAnimationFrame(frame);
}

/* diagnostics (key D): frame time, render size and input, to find where a delay comes from */
let lastDiag = 0;
function showDiag(inp) {
  const e = engine, c = $("viz");
  const fps = e ? Math.round(1000 / Math.max(1, e.frameMs)) : 0;
  $("diag").textContent = [
    `${fps} fps · ${e ? e.frameMs.toFixed(1) : "–"} ms/frame`,
    `render ${e?.RW ?? "–"}×${e?.RH ?? "–"} van ${c.width}×${c.height} · schaal ${e ? e.scale.toFixed(2) : "–"}`,
    `visual ${e?.currentVisual?.id ?? "–"} · invoer ${inp ? inp.kind : "gesimuleerd"}`,
  ].join("\n");
}

/* ---------------- controls ---------------- */
let taps = [];
$("tap").addEventListener("click", (e) => {
  e.stopPropagation();
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now); if (taps.length > 8) taps.shift();
  $("tap").classList.add("flash"); setTimeout(() => $("tap").classList.remove("flash"), 90);
  if (taps.length >= 3) {
    const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    const bpm = Math.min(220, Math.max(50, 60000 / avg));
    const beatLen = 60000 / bpm;
    tempo = { bpm, off: ((position() % beatLen) + beatLen) % beatLen };
    tempoAuto = false; tempoOrigin = "tapped";
    store.set("tempo." + track.id, tempo);
    showTempo();
  } else if (taps.length === 1 && (tempoAuto || store.get("tempo." + track.id))) {
    // tempo already known: one tap on the beat sets the exact timing (phase) only
    const beatLen = 60000 / tempo.bpm;
    tempo = { bpm: tempo.bpm, off: ((position() % beatLen) + beatLen) % beatLen };
    store.set("tempo." + track.id, tempo);
    tempoAuto = false; tempoOrigin = "tapped"; showTempo();
    status("Timing gezet op je tik.");
  }
});

function setAuto(on) {
  auto = on; store.set("auto", on);
  $("autoBtn").setAttribute("aria-pressed", String(on));
  $("autoChk").checked = on;
  lastSwitch = performance.now();
}
$("autoBtn").addEventListener("click", () => setAuto(!auto));

/* listening mode (microphone): only the rhythm changes, never the screen itself */
let listenReq = 0;
// Keeps button, checkbox, saved choice and BPM label in line with the microphone, whatever stopped or started it.
function listenChanged() { store.set("listen", listener.active); showListen(); }
function showListen() {
  const on = listener.active || listener.starting;
  $("listenBtn").setAttribute("aria-pressed", String(on));
  $("listenChk").checked = on;
  showTempo();
}
async function setListen(on) {
  const my = ++listenReq; // only the latest choice may update the screen
  if (on) {
    const pend = listener.start();
    status("Luisteren… zet de muziek luid genoeg.");
    showListen();
    const ok = await pend;
    if (my !== listenReq) return;
    if (ok) status("Luistermodus aan: de visuals reageren op het gemeten geluid.");
  } else { listener.stop(); status("Luistermodus uit."); }
  listenChanged();
}
$("listenBtn").hidden = !listener.supported;
$("listenRow").hidden = !listener.supported;
$("listenBtn").addEventListener("click", (e) => { e.stopPropagation(); setListen(!(listener.active || listener.starting)); });
$("listenChk").addEventListener("change", (e) => setListen(e.target.checked));
// Browsers only allow the microphone after a tap, so a saved "on" resumes on the first interaction.
if (listener.supported && store.get("listen", false)) {
  document.addEventListener("pointerdown", function resume(e) {
    document.removeEventListener("pointerdown", resume, true);
    if (!listener.active && !listener.starting && e.target?.id !== "listenBtn" && e.target?.id !== "listenChk") setListen(true);
  }, true);
}
$("autoChk").addEventListener("change", (e) => setAuto(e.target.checked));

/* own music (like a PSP): DiggyViz plays the files and analyses the same sound */
function showPlayer() {
  const on = sourceName === "file";
  $("playerCtl").hidden = !on;
  $("playBtn").textContent = player.playing ? "⏸" : "▶";
  $("playBtn").setAttribute("aria-label", player.playing ? "Pauzeren" : "Afspelen");
  $("prevBtn").disabled = $("nextBtn").disabled = $("playBtn").disabled = !player.hasMusic;
  document.querySelector("#trackPill .progress")?.classList.toggle("seekable", on && player.hasMusic);
  showTempo();
}
function pickMusic() { $("fileInput").click(); }   // must run inside the tap itself (browser rule)
$("fileInput").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  if (sourceName !== "file") useSource("file");
  if (await player.load(files)) { $("settings").hidden = true; wake(); }
  showPlayer();
});
for (const id of ["pickBtn", "pickBtn2"]) $(id).addEventListener("click", (e) => { e.stopPropagation(); pickMusic(); });
$("playBtn").addEventListener("click", (e) => { e.stopPropagation(); player.toggle().finally(showPlayer); });
$("nextBtn").addEventListener("click", (e) => { e.stopPropagation(); player.next(); });
$("prevBtn").addEventListener("click", (e) => { e.stopPropagation(); player.prev(); });
document.querySelector("#trackPill .progress")?.addEventListener("click", (e) => {
  if (sourceName !== "file" || !player.hasMusic) return;
  const r = e.currentTarget.getBoundingClientRect();
  player.seek((e.clientX - r.left) / r.width);
});

/* tab sound (computer): analyse the audio of the Spotify web-player tab */
function tabChanged() {
  const on = tabIn.active || tabIn.starting;
  $("tabBtn").setAttribute("aria-pressed", String(on));
  $("tabChk").checked = on;
  showTempo();
}
let tabReq = 0;
async function setTab(on) {
  const request = ++tabReq;
  if (on) {
    const pend = tabIn.start();            // first: the share prompt needs the tap that started it
    status("Kies het Spotify-tabblad en zet 'Tabblad-audio delen' aan.");
    tabChanged();
    const ok = await pend;
    if (request !== tabReq) return;
    if (ok) status(tabIn.usesHelper
      ? "Tab-geluid aan. Het kleine DiggyViz-venstertje mag je minimaliseren, maar niet sluiten."
      : "Tab-geluid aan. Tip: sta pop-ups toe voor DiggyViz om de deling vanuit een hulpvenster te starten.");
  } else { tabIn.stop(); status("Tab-geluid uit."); }
  tabChanged();
}
$("tabBtn").hidden = !tabIn.supported;
$("tabRow").hidden = !tabIn.supported;
$("tabBtn").addEventListener("click", (e) => { e.stopPropagation(); setTab(!(tabIn.active || tabIn.starting)); });
$("tabChk").addEventListener("change", (e) => setTab(e.target.checked));

const canFs = !!document.documentElement.requestFullscreen;
$("fsBtn").hidden = !canFs;
$("fsBtn").addEventListener("click", () => {
  try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } catch {}
});

/* idle HUD + gestures */
const app = $("app");
let idleTimer = 0;
const sheetOpen = () => !$("settings").hidden || !$("onboard").hidden;
function wake() { app.classList.remove("idle"); clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (!sheetOpen()) app.classList.add("idle"); }, 4000); }
document.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") wake(); });
let touchX = null, touchY = null;
$("viz").addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
$("viz").addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { stepVisual(dx < 0 ? 1 : -1); wake(); }
});
$("viz").addEventListener("click", () => { if (app.classList.contains("idle")) wake(); else { clearTimeout(idleTimer); app.classList.add("idle"); } keepAwake(); });
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === " " && sourceName === "file" && player.hasMusic) { e.preventDefault(); player.toggle().finally(showPlayer); return; }
  if (e.key === "ArrowRight") stepVisual(1);
  else if (e.key === "ArrowLeft") stepVisual(-1);
  else if (e.key === "t") $("tap").click();
  else if (e.key === "h") app.classList.toggle("idle");
  else if (e.key === "f" && canFs) $("fsBtn").click();
  else if (e.key === "d") $("diag").hidden = !$("diag").hidden;
});

let wakeLock = null;
async function keepAwake() { try { if (!wakeLock && document.visibilityState === "visible") { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch {} }
document.addEventListener("visibilitychange", () => { last = performance.now(); if (document.visibilityState === "visible") keepAwake(); });

/* settings + onboarding */
$("settingsBtn").addEventListener("click", () => { refreshSpotifyState(); $("settings").hidden = false; });
$("closeSettings").addEventListener("click", () => { $("settings").hidden = true; wake(); });
$("settings").addEventListener("click", (e) => { if (e.target === $("settings")) { $("settings").hidden = true; wake(); } });
document.querySelectorAll(".seg button[data-src]").forEach((b) => b.addEventListener("click", () => useSource(b.dataset.src)));
document.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
  $("onboard").hidden = true;
  useSource(b.dataset.pick);
  if (b.dataset.pick === "file") pickMusic();
  else if (b.dataset.pick === "spotify" && !spotify.isLoggedIn()) startLogin();
  else if (b.dataset.pick === "lastfm" && !store.get("lfUser")) { $("settings").hidden = false; $("lfUser").focus(); }
  else wake();
}));

$("spLogin").addEventListener("click", startLogin);
$("spLogout").addEventListener("click", () => { spotify.logout(); useSource("spotify"); status("Uitgelogd bij Spotify."); });
$("copyCode").addEventListener("click", async () => {
  const code = spotify.pairingCode();
  if (!code) { status("Eerst inloggen, dan kun je de koppelcode kopiëren.", true); return; }
  try { await navigator.clipboard.writeText(code); status("Koppelcode gekopieerd. Plak hem in de app op je beginscherm."); }
  catch { $("pasteCode").value = code; $("pasteCode").select(); status("Kopiëren lukte niet automatisch: de code staat geselecteerd in het veld."); }
});
$("useCode").addEventListener("click", async () => {
  try { await spotify.usePairingCode($("pasteCode").value); status("Gekoppeld met Spotify."); useSource("spotify"); }
  catch (e) { status("Deze koppelcode werkt niet: " + (e.message || "ongeldig formaat"), true); }
});
$("lfUser").value = store.get("lfUser", "");
$("lfGo").addEventListener("click", () => {
  const u = $("lfUser").value.trim();
  if (!/^[A-Za-z][\w-]{1,14}$/.test(u)) { status("Dat is geen geldige Last.fm-gebruikersnaam.", true); return; }
  store.set("lfUser", u); useSource("lastfm"); $("settings").hidden = true; wake();
});
if (!CONFIG.LASTFM_API_KEY) {
  document.querySelectorAll('[data-pick="lastfm"], [data-src="lastfm"]').forEach((b) => { b.disabled = true; b.title = "Last.fm is nog niet ingesteld"; });
  document.querySelector('[data-pick="lastfm"] span').textContent = "Nog niet beschikbaar. Last.fm moet eerst worden ingesteld.";
  $("lfGo").disabled = true;
}
$("version").textContent = "DiggyViz " + CONFIG.VERSION;

/* ---------------- boot ---------------- */
(async function boot() {
  const firstRun = !store.get("source");
  setAuto(auto);
  if (engine) { setVisual(store.get("visual", VISUALS[0].id)); engine.warmUp(); }
  const res = await spotify.handleRedirect(new URLSearchParams(location.search));
  if (res === "ok") { sourceName = "spotify"; }
  useSource(sourceName || "demo");
  if (res && res.startsWith("error:")) { status("Inloggen mislukt: " + res.slice(6), true); }
  if (firstRun && res !== "ok") $("onboard").hidden = false;
  if (res === "ok") status("Gekoppeld met Spotify. Zet een nummer op!");
  wake();
  requestAnimationFrame(frame);
})();

// test/debug hook
window.diggy = { player, tabIn, get soundInput() { return soundInput()?.kind ?? null; }, setVisual, stepVisual, get engine() { return engine; }, onTrack, useSource, audio, setListen, get listening() { return listener.active; }, get tempo() { return { ...tempo, auto: tempoAuto }; } };
