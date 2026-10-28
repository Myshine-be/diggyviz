// Windows app (desktop/, Electron): the app hears what the computer plays — the Spotify app, a browser,
// anything — through Windows' own loopback (WASAPI). No Stereo-mix, no sharing, no bar, no prompt: the
// Electron main process answers getDisplayMedia itself with { audio: "loopback" }. Same analysis as
// listening mode (js/listen.js), so the beat comes from the real sound, like a PSP. Nothing is recorded.
import { createListener } from "./listen.js";
import { audioOnly } from "./tab-audio.js";

/** True inside the DiggyViz desktop app (desktop/preload.js sets window.diggyDesktop). */
export const isDesktop = (w = typeof window !== "undefined" ? window : null) => !!w?.diggyDesktop;

export const DESKTOP_MESSAGES = {
  failed: (e) => e?.name === "NoAudio"
    ? "Geen systeemgeluid ontvangen. Herstart DiggyViz; werkt het dan nog niet, meld het."
    : "Systeemgeluid starten lukt niet (" + (e?.message || e?.name || "onbekend") + ").",
  ended: "Systeemgeluid gestopt. Klik op het beeld om opnieuw te verbinden.",
};

export function createDesktopListener({ media = () => navigator.mediaDevices, ...rest } = {}) {
  return createListener({
    media, ...rest,
    // the main process grants screen + loopback audio without a picker; only the sound is kept
    acquire: async () => audioOnly(await media().getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })),
    isSupported: () => isDesktop() && !!media()?.getDisplayMedia,
    messages: DESKTOP_MESSAGES,
  });
}
