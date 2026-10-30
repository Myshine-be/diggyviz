// Spotify source: Authorization Code + PKCE, with locally verified, single-use state.
import { CONFIG } from "../config.js";
import { store } from "../store.js";
import { createPoller } from "./polling.js";
import { nextPoll } from "./spotify-poll.js";

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function randomString(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n); }
export const REDIRECT = location.origin + location.pathname;
const clientId = () => store.get("clientId") || CONFIG.SPOTIFY_CLIENT_ID;
let authVersion = 0, refreshing = null;

export async function login() {
  const verifier = randomString(64), state = "web." + randomString(32);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  store.set("verifier", verifier);
  store.set("oauth", { state, at: Date.now(), client: clientId() });
  if (store.get("verifier") !== verifier || store.get("oauth")?.state !== state) {
    throw new Error("Sta lokale opslag toe en probeer opnieuw in Safari.");
  }
  const p = new URLSearchParams({ response_type: "code", client_id: clientId(), scope: CONFIG.SPOTIFY_SCOPES, redirect_uri: REDIRECT, code_challenge_method: "S256", code_challenge: challenge, state });
  location.href = "https://accounts.spotify.com/authorize?" + p;
}

// Only callers may commit credentials, after checking that the session is still current.
async function tokenRequest(body, previousRefresh) {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body), signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || ("HTTP " + r.status));
  const refresh = j.refresh_token || previousRefresh;
  if (typeof j.access_token !== "string" || !j.access_token || typeof refresh !== "string" || !refresh || !Number.isFinite(j.expires_in) || j.expires_in <= 0) {
    throw new Error("Spotify gaf geen geldige sessie terug.");
  }
  return { access: j.access_token, refresh, exp: Date.now() + Math.max(0, j.expires_in - 60) * 1000 };
}

export async function handleRedirect(qs) {
  const code = qs.get("code"), state = qs.get("state") || "", err = qs.get("error");
  if (!code && !err) return null;
  history.replaceState(null, "", REDIRECT);
  const pending = store.get("oauth"), verifier = store.get("verifier");
  if (!pending || pending.state !== state || !Number.isFinite(pending.at) || Date.now() - pending.at > 600000 || Date.now() < pending.at || typeof verifier !== "string") {
    return "error:Deze login kon niet worden gecontroleerd. Log opnieuw in via dezelfde Safari-browser en gebruik daarna de koppelcode voor de beginscherm-app.";
  }
  store.del("oauth"); store.del("verifier");
  if (err) return "error:" + (err === "access_denied" ? "je hebt de toegang geweigerd" : err);
  const version = ++authVersion;
  try {
    const tok = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, client_id: pending.client, code_verifier: verifier });
    if (version !== authVersion) return "error:De sessie is intussen gewijzigd. Log opnieuw in.";
    store.set("clientId", pending.client); store.set("tok", tok);
    return "ok";
  } catch (e) { return "error:" + e.message; }
}

async function accessToken() {
  const tok = store.get("tok");
  if (!tok?.refresh) return null;
  if (tok.access && Number.isFinite(tok.exp) && Date.now() < tok.exp) return tok.access;
  if (refreshing) return refreshing;
  const version = authVersion;
  const task = (async () => {
    const next = await tokenRequest({ grant_type: "refresh_token", refresh_token: tok.refresh, client_id: clientId() }, tok.refresh);
    if (version !== authVersion || store.get("tok")?.refresh !== tok.refresh) return null;
    store.set("tok", next); return next.access;
  })();
  refreshing = task;
  try { return await task; }
  finally { if (refreshing === task) refreshing = null; }
}

export const isLoggedIn = () => !!store.get("tok")?.refresh;
export function logout() { ++authVersion; refreshing = null; store.del("tok"); store.del("oauth"); store.del("verifier"); }
export function pairingCode() {
  const tok = store.get("tok");
  return tok?.refresh ? btoa(JSON.stringify({ c: clientId(), r: tok.refresh })) : null;
}
export async function usePairingCode(code) {
  const { c, r } = JSON.parse(atob(code.trim()));
  if (typeof c !== "string" || !/^[0-9a-f]{32}$/i.test(c) || typeof r !== "string" || !r.trim()) throw new Error("Ongeldige koppelcode.");
  const version = ++authVersion;
  const tok = await tokenRequest({ grant_type: "refresh_token", refresh_token: r, client_id: c }, r);
  if (version !== authVersion) throw new Error("De sessie is intussen gewijzigd.");
  // Always replace an old Client ID, including when returning to the built-in one.
  store.set("clientId", c); store.set("tok", tok); refreshing = null;
}

export function createSpotifySource({ onTrack, onStatus, onLink }) {
  let strikes = 0;
  return createPoller({
    interval: 20000,
    onError: (e) => onStatus("Spotify: " + e.message, true),
    async run(signal) {
      const at = await accessToken();
      signal.throwIfAborted();
      if (!at) { onTrack(null); onStatus("Niet ingelogd bij Spotify", true); return 5000; }
      const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode", { headers: { Authorization: "Bearer " + at }, signal });
      signal.throwIfAborted();
      if (r.status !== 429) strikes = 0;
      if (r.status === 204) { onTrack(null); onStatus("Spotify verbonden · er speelt niets"); onLink?.("ok"); return nextPoll({ status: 204 }); }
      else if (r.status === 401) {
        const tok = store.get("tok");
        if (tok?.access === at) { tok.exp = 0; store.set("tok", tok); }
        return 3000;
      } else if (r.status === 403) { onStatus("Spotify weigert: is je account toegevoegd bij User Management?", true); return 15000; }
      else if (r.status === 429) {
        let quota = false;
        try { quota = /QUOTA_EXCEEDED/i.test(await r.text()); } catch {}
        const wait = nextPoll({ status: 429, retryAfter: Number(r.headers.get("Retry-After")) || 0, strikes: strikes++, quota });
        onStatus(quota
          ? "Spotify: het dagquotum van deze app is op (alle gebruikers samen). Titel en hoes komen terug zodra Spotify het quotum vernieuwt; de visuals blijven op het geluid reageren."
          : `Spotify krijgt even te veel aanvragen. Nieuwe poging over ${Math.round(wait / 1000)} s; de visuals lopen gewoon door.`, quota);
        onLink?.(quota ? "quota" : "wait");
        return wait;
      }
      else if (!r.ok) throw new Error("HTTP " + r.status);
      else {
        const j = await r.json(); signal.throwIfAborted(); const it = j.item;
        if (!it) { onTrack(null); onStatus("Reclame of onbekend item"); }
        else {
          onStatus(""); onLink?.("ok");
          onTrack({ id: it.id || it.uri, name: it.name,
            artists: it.artists ? it.artists.map((a) => a.name).join(", ") : (it.show ? it.show.name : ""),
            art: it.album?.images?.[0]?.url || it.images?.[0]?.url || "",
            dur: it.duration_ms, prog: j.progress_ms || 0, playing: !!j.is_playing, isrc: it.external_ids?.isrc || "" });
          return nextPoll({ status: 200, playing: !!j.is_playing, prog: j.progress_ms || 0, dur: it.duration_ms || 0 });
        }
      }
    },
  });
}
