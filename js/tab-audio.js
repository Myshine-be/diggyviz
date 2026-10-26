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
export function acquireViaHelper(w, { signal, every = setInterval, cancel = clearInterval } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, busy = false, watch;
    const el = id => { try { return w.document.getElementById(id); } catch { return null; } };
    const go = el("go");
    const closedError = () => Object.assign(new Error("Hulpvenster gesloten"), { name: "HelperClosed" });
    const closed = () => { try { return w.closed; } catch { return true; } };
    const cleanup = () => { cancel(watch); go?.removeEventListener("click", ask); signal?.removeEventListener("abort", abort); };
    const finish = (fn, value) => { if (settled) return; settled = true; cleanup(); fn(value); };
    const abort = () => finish(reject, closedError());
    async function ask() {
      if (settled || busy) return;
      if (closed() || signal?.aborted) { abort(); return; }
      busy = true; if (go) go.disabled = true;
      try {
        const stream = await w.navigator.mediaDevices.getDisplayMedia(SHARE_OPTIONS);
        if (settled || closed() || signal?.aborted) {
          stream.getTracks().forEach(t => t.stop()); abort(); return;
        }
        const sound = audioOnly(stream);
        const msg = el("msg");
        if (msg) msg.textContent = "Klaar! Minimaliseren mag. Sluit dit venster om het tabgeluid te stoppen.";
        if (go) go.hidden = true;
        finish(resolve, sound);
      } catch (e) {
        if (settled) return;
        if (needsTap(e) && go) {
          go.hidden = false; go.disabled = false;
          try { w.focus(); } catch {}
        } else finish(reject, e);
      } finally { busy = false; }
    }
    if (closed() || signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    go?.addEventListener("click", ask);
    watch = every(() => { if (closed()) abort(); }, 400);
    ask();
  });
}

export function createTabListener({ onStatus = () => {}, onChange = () => {}, media = () => navigator.mediaDevices,
  open = () => openHelper(), ...rest } = {}) {
  let helper = null, watch = 0, usedHelper = false, controller = null;
  const closeHelper = () => {
    controller?.abort(); controller = null;
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
        const request = new AbortController(); controller = request;
        const stream = await acquireViaHelper(w, { signal: request.signal });
        if (helper !== w || request.signal.aborted) {
          stream.getTracks().forEach(t => t.stop());
          throw Object.assign(new Error("Verouderde aanvraag"), { name: "HelperClosed" });
        }
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
  const start = L.start;
  L.start = () => {
    const attempt = start();
    // Also close the helper if Web Audio setup fails after the share was acquired.
    attempt.then(ok => { if (!ok && !L.active && !L.starting) closeHelper(); });
    return attempt;
  };
  const stop = L.stop;
  L.stop = () => { stop(); closeHelper(); };
  Object.defineProperty(L, "usesHelper", { get: () => usedHelper });
  return L;
}
