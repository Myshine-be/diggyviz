# DiggyViz checks

No build step or application dependencies are required.

- `node --test tests/*.test.mjs` (Node 24): sound data for the shaders (waveform, history ring), automatic tempo lookup (fake Deezer), listening-mode analysis and microphone lifecycle races, authentication, source lifecycle, rate-limit handling, Last.fm parsing and refresh-rate-independent release envelopes. All service responses are mocked; no account or API key is required.
- `node tests/browser.mjs` (Node 24 and `google-chrome` installed, or `CHROME_BIN=/path/to/chrome`): serves the app on loopback, compiles and draws all thirteen production visuals, checks pixels and GL errors, rapid crossfades, landscape resizing, context restoration and a stale saved visual. Writes screenshots and a JSON report to `test-results/`.
- The pull-request workflow runs both and retains the browser screenshots as an artifact. Browser frames are stepped explicitly for deterministic checks; **this is not an FPS benchmark**.

Before release, verify real Spotify login in Safari, pairing into the home-screen app, playback/seek/pause, foreground/background recovery, portrait/landscape, and sustained frame rate/temperature on a physical iPhone. Last.fm remains unavailable until configured. Native iOS rendering still uses v1.

Story checks cover 90-second timing at 30/60/120 Hz, continuity across track/BPM changes, pause, and the two-minute automatic hold. Browser artifacts include both scenes at 35, 89.9, 96 and 106 seconds, plus landscape. Story clocks are advanced explicitly in these tests; this is not a real-time performance benchmark.

Review coverage also includes cancelled/repeated microphone starts, a failed context resume, synchronous device errors, real Web Audio fed from a local oscillator MediaStream, sandboxed JSONP isolation, visible tempo fallback, removed visual preferences, and JS-to-GLSL waveform/history readback after context restoration. Story captures include 94.5, 100, 118, 121 and 180 seconds.

`motion.json` reports consecutive-frame mean linear luminance changes and pixel-area changes (>0.1 linear luminance) at 120×214 and 30 sampled frames/s under synthetic 150 BPM attacks. This does **not** count WCAG flashes or certify photosensitivity safety. No universal pass threshold is asserted. Inspect the values and the scenes.

`node tests/deezer-probe.mjs` writes a separate, optional live JSONP diagnostic from the CI server using a public fixture ISRC. It does not use credentials, and service failures do not fail the deterministic tests. A successful probe does not prove every song has BPM or that a user's Safari/network can reach Deezer.

2.5 adds `onsets.test.mjs` and `tab-helper.test.mjs` (59 tests total): onset selectivity, clap counters, synthetic fields, helper acquisition, popup fallback, activation retry, cancellation, late streams and resource cleanup. Browser artifacts include rest/kick/clap for all 13 visuals and a real same-origin cross-window MediaStream fed into Web Audio. The native share picker/banner placement still needs a headed Chrome/Edge laptop check; fixtures cannot prove that UI behavior.
