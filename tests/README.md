# DiggyViz checks

No build step or application dependencies are required.

- `node --test tests/*.test.mjs` (Node 24): sound data for the shaders (waveform, history ring), automatic tempo lookup (fake Deezer), listening-mode analysis and microphone lifecycle races, authentication, source lifecycle, rate-limit handling, Last.fm parsing and refresh-rate-independent release envelopes. All service responses are mocked; no account or API key is required.
- `node tests/browser.mjs` (Node 24 and `google-chrome` installed, or `CHROME_BIN=/path/to/chrome`): serves the app on loopback, compiles and draws all ten production visuals, checks pixels and GL errors, rapid crossfades, landscape resizing, context restoration and a stale saved visual. Writes screenshots and a JSON report to `test-results/`.
- The pull-request workflow runs both and retains the browser screenshots as an artifact. Browser frames are stepped explicitly for deterministic checks; **this is not an FPS benchmark**.

Before release, verify real Spotify login in Safari, pairing into the home-screen app, playback/seek/pause, foreground/background recovery, portrait/landscape, and sustained frame rate/temperature on a physical iPhone. Last.fm remains unavailable until configured. Native iOS rendering still uses v1.

Story checks cover 90-second timing at 30/60/120 Hz, continuity across track/BPM changes, pause, and the two-minute automatic hold. Browser artifacts include both scenes at 35, 89.9, 96 and 106 seconds, plus landscape. Story clocks are advanced explicitly in these tests; this is not a real-time performance benchmark.
