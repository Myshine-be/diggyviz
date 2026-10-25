# DiggyViz checks

No build step or application dependencies are required.

- `node --test tests/regression.test.mjs` (Node 24): authentication, source lifecycle, rate-limit handling, Last.fm parsing and refresh-rate-independent release envelopes. All service responses are mocked; no account or API key is required.
- `node tests/browser.mjs` (Node 24 and `google-chrome` installed, or `CHROME_BIN=/path/to/chrome`): serves the app on loopback, compiles and draws all eight production visuals, checks pixels and GL errors, rapid crossfades, landscape resizing, context restoration and a stale saved visual. Writes screenshots and a JSON report to `test-results/`.
- The pull-request workflow runs both and retains the browser screenshots as an artifact. Browser frames are stepped explicitly for deterministic checks; **this is not an FPS benchmark**.

Before release, verify real Spotify login in Safari, pairing into the home-screen app, playback/seek/pause, foreground/background recovery, portrait/landscape, and sustained frame rate/temperature on a physical iPhone. Last.fm remains unavailable until configured. Native iOS rendering still uses v1.
