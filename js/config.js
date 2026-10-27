// DiggyViz configuration. Safe to commit: none of these values are secrets.

export const CONFIG = {
  // Spotify app "RetroViz" (Development Mode, max 5 users added in the Spotify dashboard → User Management)
  SPOTIFY_CLIENT_ID: "da49b37bcb64468c938dd8a895fbaf5f",
  SPOTIFY_SCOPES: "user-read-currently-playing user-read-playback-state",

  // Free key from https://www.last.fm/api/account/create (public by design, used client-side)
  LASTFM_API_KEY: "",

  // Visual carousel
  AUTO_SWITCH_SECONDS: 45,
  CROSSFADE_SECONDS: 1.6,

  VERSION: "2.6.2",
};
