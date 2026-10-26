// Tab sound (computer): Chrome/Edge can share the audio of another browser tab, e.g. the Spotify web player
// (open.spotify.com). DiggyViz then analyses exactly what you hear — also through headphones — with the same
// analysis as listening mode (js/listen.js). Nothing is recorded or sent; the video part of the share is
// stopped immediately because only the sound is used.
//
// Chrome puts a bar "… wordt gedeeld met dit tabblad" on the tab that asks for the share, even in full screen.
// So the share is asked from a small helper window (same site): the bar lands there, and the DiggyViz tab
// stays clean. The helper only holds the share; DiggyViz analyses its stream directly (same-origin windows
// share objects). If pop-ups are blocked, DiggyViz asks for the share itself, as before.
import { createListener } from "./listen.js";

const isIOS = () => typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const TAB_MESSAGES = {
  failed: (e) =>
    e?.name === "NoAudio" ? "Er werd geen geluid gedeeld. Kies het tabblad met Spotify en zet 'Tabblad-audio delen' aan."
    : e?.name === "HelperClosed" ? "Het DiggyViz-venstertje werd gesloten voor er iets gedeeld werd."
    : e?.name === "NotAllowedError" ? "Delen geannuleerd. Kies het Spotify-tabblad en zet 'Tabblad-audio delen' aan."
    : "Tabgeluid delen lukt niet in deze browser. Gebruik Chrome of Edge op een computer.",
  ended: "Tabgeluid gestopt: het delen is beëindigd of het DiggyViz-venstertje is gesloten.",
};

const SHARE_OPTIONS = {
  video: true,                                  // Chrome requires video to offer audio; stopped right away
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  preferCurrentTab: false, selfBrowserSurface: "exclude", surfaceSwitching: "include", systemAudio: "include",
};

/** Keep only the audio track of a share; throws NoAudio when the tab's audio was not shared. */
export function audioOnly(stream) {
  stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    const e = new Error("Geen tabgeluid"); e.name = "NoAudio"; throw e;
  }
  return stream;
}

/** Ask the browser for a tab with its audio, from this page itself (the share bar shows on this tab). */
export async function acquireTabAudio(media = () => navigator.mediaDevices) {
  return audioOnly(await media().getDisplayMedia(SHARE_OPTIONS));
}

const HELPER_HTML = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>DiggyViz luistert mee</title>
<style>html,body{margin:0;height:100%;background:#050506;color:#f3f2ee;font:15px/1.45 system-ui,sans-serif}
main{box-sizing:border-box;height:100%;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:20px;text-align:center}
b{font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:13px}p{margin:0;color:rgba(243,242,238,.62)}
button{font:600 14px system-ui,sans-serif;padding:12px 16px;border-radius:12px;border:0;background:#78f096;color:#07110a;cursor:pointer}
button[hidden]{display:none}</style></head><body><main><b>DiggyViz luistert mee</b>
<p id="msg">Kies het tabblad met Spotify en zet "Tabblad-audio delen" aan.</p>
<button id="go" hidden>Kies het Spotify-tabblad</button></main></body></html>`;

/** Open the helper window (must run inside the click). Returns null when pop-ups are blocked. */
export function openHelper(win = typeof window !== "undefined" ? window : null) {
  try {
    const w = win?.open("", "diggyviz-tabgeluid", "popup,width=380,height=260,left=40,top=40");
    if (!w) return null;
    try { w.document.open(); w.document.write(HELPER_HTML); w.document.close(); } catch {}
    return w;
  } catch { return null; }
}

const needsTap = (e) => e?.name === "InvalidStateError" || /activation|gesture/i.test(e?.message || "");

/**
 * Ask for the share from the helper window `w`, so Chrome's share bar lands there. If the browser wants a
 * tap inside that window first, show a button there and wait for it.
 */
export async function acquireViaHelper(w) {
  const md = () => w.navigator.mediaDevices;
  const el = (id) => { try { return w.document.getElementById(id); } catch { return null; } };
  const done = (text) => { const m = el("msg"); if (m) m.textContent = text; const g = el("go"); if (g) g.hidden = true; };
  let stream;
  try {
    stream = await md().getDisplayMedia(SHARE_OPTIONS);
  } catch (e) {
    if (!needsTap(e)) throw e;
    stream = await new Promise((resolve, reject) => {
      const go = el("go");
      if (!go) { reject(e); return; }
      go.hidden = false;
      try { w.focus(); } catch {}
      go.addEventListener("click", () => { md().getDisplayMedia(SHARE_OPTIONS).then(resolve, reject); });
      const watch = setInterval(() => { if (w.closed) { clearInterval(watch); const c = new Error("Hulpvenster gesloten"); c.name = "HelperClosed"; reject(c); } }, 400);
      const stopWatch = () => clearInterval(watch);
      Promise.resolve().then(() => {}).finally(() => {});
      resolve.__stop = stopWatch;
    }).finally(() => {});
  }
  const s = audioOnly(stream);
  done("Klaar! Je mag dit venstertje minimaliseren, maar sluit het niet: dan stopt het tabgeluid.");
  return s;
}

export function createTabListener({ onStatus = () => {}, onChange = () => {}, media = () => navigator.mediaDevices,
  open = () => openHelper(), ...rest } = {}) {
  let helper = null, watch = 0, usedHelper = false;
  const closeHelper = () => {
    clearInterval(watch); watch = 0;
    const w = helper; helper = null;
    try { if (w && !w.closed) w.close(); } catch {}
  };
  const L = createListener({
    onStatus, onChange, media, ...rest,
    acquire: async () => {
      closeHelper();
      const w = open();                          // synchronous: still inside the click
      usedHelper = !!w;
      if (!w) return acquireTabAudio(media);
      helper = w;
      try {
        const stream = await acquireViaHelper(w);
        // closing the helper ends its share: stop listening with a clear message
        watch = setInterval(() => {
          let closed = true; try { closed = w.closed; } catch {}
          if (closed && helper === w) { closeHelper(); if (L.active) { L.stop(); onStatus(TAB_MESSAGES.ended, true); } }
        }, 700);
        return stream;
      } catch (e) {
        if (helper === w) closeHelper();
        throw e;
      }
    },
    isSupported: () => !!media()?.getDisplayMedia && !isIOS(),
    messages: TAB_MESSAGES,
  });
  const stop = L.stop;
  L.stop = () => { stop(); closeHelper(); };
  Object.defineProperty(L, "usesHelper", { get: () => usedHelper });
  return L;
}
