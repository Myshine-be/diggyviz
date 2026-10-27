// Computer sound: listen to what the computer itself plays (Spotify app or web player), via a loopback input
// such as Windows "Stereomix" or the free VB-Audio Cable ("CABLE Output"), or BlackHole on a Mac.
// Chrome remembers the permission per site, so a configured input can be reused while permission remains granted.
// Same analysis as listening mode (js/listen.js); nothing is recorded or sent.
import { createListener } from "./listen.js";

const LOOPBACK = [
  /stereo\s*-?\s*mix/i, /stereomix/i, /wat u hoort/i, /what u hear/i, /wave out mix/i,
  /cable output/i, /vb-?audio/i, /voicemeeter out/i, /blackhole/i, /loopback/i, /soundflower/i, /^monitor of /i,
];

/** The first input that is a loopback of the computer's own sound, or null. Pure (tested). */
export function findLoopback(devices = []) {
  const inputs = devices.filter((d) => d && d.kind === "audioinput" && d.deviceId && d.deviceId !== "communications");
  // prefer the device itself over the "default" alias, so a later change of the Windows default doesn't move it
  const real = inputs.filter((d) => d.deviceId !== "default"), alias = inputs.filter((d) => d.deviceId === "default");
  for (const list of [real, alias]) for (const re of LOOPBACK) {
    const hit = list.find((d) => re.test(d.label || ""));
    if (hit) return hit;
  }
  return null;
}

/** Audio inputs with readable names (names only appear after the first permission). */
export async function listInputs(media = () => navigator.mediaDevices) {
  try { return (await media().enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "communications"); }
  catch { return []; }
}

export const SYSTEM_MESSAGES = {
  failed: (e) =>
    e?.name === "NoLoopback" ? "Geen computergeluid-ingang gevonden. Zet Stereomix aan (zie Instellingen) of kies een ingang."
    : e?.name === "NotAllowedError" ? "Geen toegang tot de geluidsingang. Sta de microfoon toe voor DiggyViz (slotje naast het adres)."
    : e?.name === "OverconstrainedError" || e?.name === "NotFoundError" ? "Die geluidsingang bestaat niet meer. Kies opnieuw in Instellingen."
    : "Computergeluid lukt niet op dit toestel.",
  ended: "Computergeluid gestopt: de geluidsingang is niet meer beschikbaar.",
};

const constraints = (deviceId) => ({ audio: { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });

/**
 * getDevice() returns the saved deviceId (or ""). Without one, the loopback input is looked up; names are only
 * readable after a permission, so a first-time start asks once with the default input and then switches.
 */
export function createSystemListener({ onStatus, onChange, media = () => navigator.mediaDevices, getDevice = () => "", setDevice = () => {}, ...rest } = {}) {
  let chosen = "";
  const L = createListener({
    onStatus, onChange, media, ...rest,
    acquire: async ({ signal }) => {
      const check = () => { if (signal.aborted) throw Object.assign(new Error("Geannuleerd"), { name: "AbortError" }); };
      const capture = async (id) => {
        check();
        const stream = await media().getUserMedia(constraints(id));
        if (signal.aborted) { stream.getTracks().forEach(t => t.stop()); check(); }
        chosen = stream.getAudioTracks()[0]?.label || "";
        setDevice(id);
        return stream;
      };
      let id = getDevice();
      // Never retain a moving OS alias: it can silently become the microphone.
      if (id === "default" || id === "communications") { id = ""; setDevice(""); }
      if (id) {
        // saved input first; device ids can change (driver update, new profile): then search by name again
        try {
          return await capture(id);
        } catch (e) {
          check();
          if (e?.name !== "OverconstrainedError" && e?.name !== "NotFoundError") throw e;
          id = ""; setDevice("");
        }
      }
      if (!id) {
        let found = findLoopback(await listInputs(media));
        check();
        if (!found) {
          // names are hidden until the first permission: ask once, then look again
          const probe = await media().getUserMedia({ audio: true });
          probe.getTracks().forEach((t) => t.stop());
          check();
          found = findLoopback(await listInputs(media));
        }
        check();
        if (!found) throw Object.assign(new Error("Geen loopback-ingang"), { name: "NoLoopback" });
        id = found.deviceId;
      }
      return capture(id);
    },
    isSupported: () => !!media()?.getUserMedia && !!media()?.enumerateDevices && !(typeof navigator !== "undefined" && (/iP(hone|ad|od)|Android/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))),
    messages: SYSTEM_MESSAGES,
  });
  Object.defineProperty(L, "inputName", { get: () => (L.active ? chosen : "") });
  return L;
}

/** True when the browser already allows the input, so Computergeluid may start without asking. */
export async function permissionGranted(nav = typeof navigator !== "undefined" ? navigator : null) {
  try { return (await nav.permissions.query({ name: "microphone" })).state === "granted"; } catch { return false; }
}
