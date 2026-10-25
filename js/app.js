// DiggyViz app: wires sources → track state → rhythm → engine, plus the UI.

import { CONFIG } from "./config.js";
import { store } from "./store.js";
import { audio, analyse, hashStr } from "./rhythm.js";
import { DEFAULT_PAL, paletteFrom } from "./palette.js";
import { Engine } from "./engine.js";
import { VISUALS } from "./visuals/index.js";
import * as spotify from "./sources/spotify.js";
import { createLastfmSource } from "./sources/lastfm.js";
import { createDemoSource } from "./sources/demo.js";

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

function loadTempo(defBpm = 120) {
  const saved = store.get("tempo." + track.id);
  tempo = saved && Number.isFinite(saved.bpm) && saved.bpm >= 50 && saved.bpm <= 220 && Number.isFinite(saved.off)
    ? saved : { bpm: defBpm, off: 0 };
  $("tap").firstChild.nodeValue = Math.round(tempo.bpm) + " ";
}

async function onTrack(t) {
  if (!t) {
    track.prog = position(); track.at = performance.now(); track.playing = false;
    return;
  }
  const version = sourceVersion;
  const changed = t.id !== track.id;
  Object.assign(track, { id: t.id, name: t.name, artists: t.artists, art: t.art, dur: t.dur || 210000, prog: t.prog || 0, playing: !!t.playing, at: performance.now() });
  if (!changed) return;

  $("title").textContent = t.name || "Onbekend nummer";
  $("artist").textContent = t.artists || "";
  $("caption").textContent = (t.name || "").toLowerCase();
  $("art").style.backgroundImage = t.art ? `url("${t.art}")` : "";
  loadTempo(t.bpm || 120);
  const isFirst = firstTrack;
  drop = isFirst ? 0 : 1;
  taps = [];
  if (auto && !isFirst) stepVisual(1);
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
  $("srcBadge").textContent = name === "lastfm" ? "last.fm" : name;
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === name)));
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
  } else {
    source = createDemoSource(cb);
  }
  source.start();
  refreshSpotifyState();
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
let last = performance.now(), t0 = last;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const pos = position();
  analyse(pos, track.playing, hashStr(track.id || "x"), tempo.bpm, tempo.off, dt);
  drop = Math.max(0, drop - dt * 0.7);
  const k = 1 - Math.exp(-dt * 2.2);
  for (const key of ["dark", "mid", "hi", "hot"]) for (let i = 0; i < 3; i++) palCur[key][i] += (palTarget[key][i] - palCur[key][i]) * k;

  if (auto && engine && now - lastSwitch > CONFIG.AUTO_SWITCH_SECONDS * 1000) stepVisual(1);

  if (engine) {
    try {
      engine.render({ time: (now - t0) / 1000, dt, songTime: pos / 1000, audio, pal: palCur, drop, seed: hashStr(track.id || "x") % 1000 });
    } catch (e) { console.error(e); }
  }
  $("bar").style.width = (track.dur ? (pos / track.dur) * 100 : 0) + "%";
  requestAnimationFrame(frame);
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
    store.set("tempo." + track.id, tempo);
    $("tap").firstChild.nodeValue = Math.round(bpm) + " ";
  }
});

function setAuto(on) {
  auto = on; store.set("auto", on);
  $("autoBtn").setAttribute("aria-pressed", String(on));
  $("autoChk").checked = on;
  lastSwitch = performance.now();
}
$("autoBtn").addEventListener("click", () => setAuto(!auto));
$("autoChk").addEventListener("change", (e) => setAuto(e.target.checked));

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
  if (e.key === "ArrowRight") stepVisual(1);
  else if (e.key === "ArrowLeft") stepVisual(-1);
  else if (e.key === "t") $("tap").click();
  else if (e.key === "h") app.classList.toggle("idle");
  else if (e.key === "f" && canFs) $("fsBtn").click();
});

let wakeLock = null;
async function keepAwake() { try { if (!wakeLock && document.visibilityState === "visible") { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } } catch {} }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") keepAwake(); });

/* settings + onboarding */
$("settingsBtn").addEventListener("click", () => { refreshSpotifyState(); $("settings").hidden = false; });
$("closeSettings").addEventListener("click", () => { $("settings").hidden = true; wake(); });
$("settings").addEventListener("click", (e) => { if (e.target === $("settings")) { $("settings").hidden = true; wake(); } });
document.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => useSource(b.dataset.src)));
document.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
  $("onboard").hidden = true;
  useSource(b.dataset.pick);
  if (b.dataset.pick === "spotify" && !spotify.isLoggedIn()) startLogin();
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
window.diggy = { setVisual, stepVisual, get engine() { return engine; }, onTrack, useSource };
