// Spotify source: Authorization Code + PKCE (no server), polls "currently playing".
// Moved from v1 index.html; Client ID now comes from config.js.

import { CONFIG } from "../config.js";
import { store } from "../store.js";

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function randomString(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); }

export const REDIRECT = location.origin + location.pathname;
const clientId = () => store.get("clientId") || CONFIG.SPOTIFY_CLIENT_ID;

export async function login() {
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  store.set("verifier", verifier);
  // verifier also travels in state, so the exchange works even if iOS lands the redirect in another browser context
  const p = new URLSearchParams({ response_type: "code", client_id: clientId(), scope: CONFIG.SPOTIFY_SCOPES, redirect_uri: REDIRECT, code_challenge_method: "S256", code_challenge: challenge, state: "web." + verifier });
  location.href = "https://accounts.spotify.com/authorize?" + p;
}

async function tokenRequest(body) {
  const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || ("HTTP " + r.status));
  const tok = { access: j.access_token, refresh: j.refresh_token || store.get("tok", {}).refresh, exp: Date.now() + (j.expires_in - 60) * 1000 };
  store.set("tok", tok); return tok;
}

/** Call on page load. Returns "ok" | "error:<msg>" | null (no login in progress). */
export async function handleRedirect(qs) {
  const code = qs.get("code"), state = qs.get("state") || "", err = qs.get("error");
  if (!code && !err) return null;
  history.replaceState(null, "", REDIRECT);
  if (err) return "error:" + (err === "access_denied" ? "je hebt de toegang geweigerd" : err);
  if (!state.startsWith("web.")) return null;
  try {
    await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: clientId(), code_verifier: state.slice(4) || store.get("verifier") });
    return "ok";
  } catch (e) { return "error:" + e.message; }
}

async function accessToken() {
  let tok = store.get("tok");
  if (!tok || !tok.refresh) return null;
  if (!tok.access || Date.now() > tok.exp) tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: tok.refresh, client_id: clientId() });
  return tok.access;
}

export const isLoggedIn = () => !!store.get("tok")?.refresh;
export function logout() { store.del("tok"); }

export function pairingCode() {
  const tok = store.get("tok");
  if (!tok?.refresh) return null;
  return btoa(JSON.stringify({ c: clientId(), r: tok.refresh }));
}
export async function usePairingCode(code) {
  const { c, r } = JSON.parse(atob(code.trim()));
  if (c && c !== CONFIG.SPOTIFY_CLIENT_ID) store.set("clientId", c);
  store.set("tok", { refresh: r, access: "", exp: 0 });
  await accessToken();
}

/** Polling source. onTrack(track|null), onStatus(text, isError). */
export function createSpotifySource({ onTrack, onStatus }) {
  let timer = 0, stopped = false;
  async function poll() {
    clearTimeout(timer);
    if (stopped) return;
    let wait = 3000;
    try {
      if (document.visibilityState === "visible") {
        const at = await accessToken();
        if (!at) { onStatus("Niet ingelogd bij Spotify", true); wait = 5000; }
        else {
          const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode", { headers: { Authorization: "Bearer " + at } });
          if (r.status === 204) { onTrack(null); onStatus("Niets aan het spelen op Spotify"); }
          else if (r.status === 401) { const t = store.get("tok", {}); t.exp = 0; store.set("tok", t); wait = 500; }
          else if (r.status === 403) { onStatus("Spotify weigert: is je account toegevoegd bij User Management?", true); wait = 15000; }
          else if (r.status === 429) { wait = (Number(r.headers.get("Retry-After")) || 10) * 1000; }
          else if (r.ok) {
            const j = await r.json(); const it = j.item;
            if (!it) { onTrack(null); onStatus("Reclame of onbekend item"); }
            else {
              onStatus("");
              onTrack({
                id: it.id || it.uri, name: it.name,
                artists: it.artists ? it.artists.map((a) => a.name).join(", ") : (it.show ? it.show.name : ""),
                art: (it.album?.images?.[0]?.url) || (it.images?.[0]?.url) || "",
                dur: it.duration_ms, prog: j.progress_ms || 0, playing: !!j.is_playing,
              });
            }
          }
        }
      }
    } catch (e) { onStatus("Spotify: " + e.message, true); wait = 10000; }
    timer = setTimeout(poll, wait);
  }
  const onVis = () => { if (document.visibilityState === "visible") poll(); };
  return {
    start() { stopped = false; document.addEventListener("visibilitychange", onVis); poll(); },
    stop() { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVis); },
  };
}
