// Tab sound (computer): Chrome/Edge can share the audio of another browser tab, e.g. the Spotify web player
// (open.spotify.com). DiggyViz then analyses exactly what you hear — also through headphones — with the same
// analysis as listening mode (js/listen.js). Nothing is recorded or sent; the video part of the share is
// stopped immediately because only the sound is used.
import { createListener } from "./listen.js";

const isIOS = () => typeof navigator !== "undefined" && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const TAB_MESSAGES = {
  failed: (e) =>
    e?.name === "NoAudio" ? "Er werd geen geluid gedeeld. Kies het tabblad met Spotify en zet 'Tabblad-audio delen' aan."
    : e?.name === "NotAllowedError" ? "Delen geannuleerd. Kies het Spotify-tabblad en zet 'Tabblad-audio delen' aan."
    : "Tabgeluid delen lukt niet in deze browser. Gebruik Chrome of Edge op een computer.",
  ended: "Tabgeluid gestopt: het delen is beëindigd.",
};

/** Ask the browser for a tab with its audio; keep only the audio track. */
export async function acquireTabAudio(media = () => navigator.mediaDevices) {
  const stream = await media().getDisplayMedia({
    video: true,                                  // Chrome requires video to offer audio; stopped right away
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    preferCurrentTab: false, selfBrowserSurface: "exclude", surfaceSwitching: "include", systemAudio: "include",
  });
  stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    const e = new Error("Geen tabgeluid"); e.name = "NoAudio"; throw e;
  }
  return stream;
}

export function createTabListener({ onStatus, onChange, media = () => navigator.mediaDevices, ...rest } = {}) {
  return createListener({
    onStatus, onChange, media, ...rest,
    acquire: () => acquireTabAudio(media),
    isSupported: () => !!media()?.getDisplayMedia && !isIOS(),
    messages: TAB_MESSAGES,
  });
}
