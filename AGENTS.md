# AGENTS.md — rules for AI assistants (ChatGPT, Codex, Claude) working on DiggyViz

DiggyViz is a static web app (GitHub Pages, no build step) that shows music visuals synced to
what the user plays on Spotify or Last.fm. Owner: Mo. Users speak Dutch: **all UI text is Dutch**.

## Run locally
```
python3 -m http.server 8000   # then open http://localhost:8000
```
No npm, no bundler, no framework. Plain ES modules + WebGL2. Keep it that way.

## Layout
| Path | What |
|---|---|
| `index.html` | UI shell + iOS-app login bridge (inline script, keep it first) |
| `css/app.css` | All styles. Single dark look; `--accent` is set from album art |
| `js/app.js` | Wiring: sources → track state → rhythm → engine, UI, gestures |
| `js/engine.js` | WebGL2 renderer: visual → crossfade → bloom → neon grade → tonemap/grain. Native resolution (see below) |
| `js/glsl.js` | Shared GLSL header (uniforms + helpers) and post-processing shaders |
| `js/rhythm.js` | Synthetic rhythm (no audio access): kick/snare/hat/energy + 32 bands from song position + BPM |
| `js/tempo-lookup.js` | Automatic BPM per song from Deezer (sandboxed JSONP; Spotify ISRC, else artist + title). Cached in `rv.bpm.<id>` |
| `js/listen.js` | Listening mode: microphone → Web Audio → same `audio` fields as rhythm.js (real kicks, tempo). Never records |
| `js/tab-audio.js` | Tab sound (computer, Chrome/Edge): `getDisplayMedia` audio of e.g. the Spotify web-player tab → same analysis as listen.js (`createListener({ acquire })`). Video track stopped at once |
| `js/file-player.js` | Own music, like a PSP: plays local files and analyses the same sound (exact beat sync, also headphones/AirPods; analysis delayed by `outputLatency`). Playlist, MediaSession. Source id `file` |
| `js/id3.js` | Pure ID3v2.3/2.4 reader (title/artist/album/cover) + `parseFileName()` |
| `js/audio-data.js` | Sound for the shaders: waveform + 2 s spectrum history in one 128×65 texture (`uAudio`). Real from the mic, simulated otherwise |
| `js/visuals/spectrum-history.js` | Shared GLSL for line visuals: `histShape()`, `beatNow()`, `lineCol()`, `lineAt()`, `ellipseLine()` |
| `js/palette.js` | Album-art → 4 colours taken **from the cover itself** (`paletteFromPixels`: weighted k-means; mid = dominant vivid colour, hi = second colour, hot = accent, dark = deep shade). Saturation only lifted to ≥ 0.6. Grey covers → calm palette. Tested in `tests/palette.test.mjs` |
| `js/envelope.js` | Organic level envelope for all bands: ~9 ms attack (90 % in ~21 ms, keep it that fast: slower attacks read as delay), exponential ~0.18 s release, peak caps hold 0.22 s then fall with gravity. Frame-rate exact |
| `js/visuals/*.js` | One file per visual. Registry in `js/visuals/index.js` |
| `js/sources/*.js` | `spotify.js`, `lastfm.js`, `demo.js` — same interface |
| `js/config.js` | Spotify Client ID, Last.fm API key, timings |
| `ios/` | Native iPhone app (SwiftUI + Picture-in-Picture). Still uses the v1 effects |

## Adding a visual (the most common task)
1. Create `js/visuals/<name>.js`:
   ```js
   export default {
     id: "myvisual", name: "My Visual",
     bloom: 0.8,          // optional, 0..1.5
     feedback: false,     // true → read last frame from uPrev
     caption: false,      // true → shows track title above (see soul-beat)
     frag: `void main() { vec2 p = P(); fragColor = vec4(pal(length(p)), 1.0); }`,
   };
   ```
2. Import it in `js/visuals/index.js` and add it to `VISUALS`.
3. The shader gets everything in `js/glsl.js` HEADER: `uSceneTime, uSceneBeat, uTime, uSongTime, uBeat, uKick, uSnare, uHat,
   uEnergy, uLevel, uDrop, uTravel, uSeed, uBands[32], uPeaks[32], uFlux[32], uHit, uKickN, uSnareN, uPal[4], uPrev, uArt` and helpers
   `P(), rot(), smin(), hash*, noise2/3, fbm2, band(x), peak(x), flux(x), pal(t), wave(x), gridLine(x,w)`.
   Do not redeclare these.

## Shader rules
- GLSL ES 3.00 (`#version 300 es` is added by the header). Write to `fragColor`.
- Renders at the screen's **native resolution** (up to 3 device px per CSS px; iPhone 17 Pro Max = 1320×2868).
  The engine may only step down to 2 device px per CSS px (`minScale` 0.67) — never lower, so nothing looks pixelated.
  Budget your shader for that: raymarch ≤ 110 steps with a bounding-sphere early-out, no nested loops over > 50 iterations.
- Motion must be organic: no stepping. For sound history use `histSmooth()` / `histShapeSmooth()` (curved bands,
  continuous sub-row scrolling); never animate with `floor()`-ed time unless it is a deliberate pixel style.
- Colours come from `uPal` / `pal()` so every visual follows the album art. `pal()` is a living neon gradient (hue drifts
  over time and along t). The final pass adds a neon grade (hue flows across the screen); set `grade: 0` on a visual
  to opt out. Avoid hard-coded hues (exception: the warm sand base tones of Dunes).
- Output can exceed 1.0; the final pass tone-maps (ACES) and adds bloom, vignette and grain.
- Use `P()` for coordinates: shorter screen side spans −0.5…0.5, works in portrait and landscape.
- Anti-alias edges with `fwidth` / `px = 1.5 / min(uRes.x, uRes.y)`.

## Real sound inputs
`soundInput()` in app.js picks what drives the visuals: own music (source `file`) > tab sound > microphone > simulated rhythm.
All inputs share `{ supported, active, receiving, bpm, analyse(out, dt), wave(out, dt) }`. Apps cannot read Spotify's
audio on a phone (iOS sandbox, DRM); only these inputs give true beat sync.

## Source interface
`createXSource({ onTrack, onStatus })` → `{ start(), stop() }`.
`onTrack({ id, name, artists, art, dur, prog, playing, palette?, bpm? })` or `onTrack(null)` when nothing plays.

## Do not
- Do not add a build step, framework or npm dependencies.
- Do not put secrets in the repo. The Spotify Client ID and Last.fm API key are public by design;
  a Spotify **Client secret** must never be used (PKCE flow only).
- Do not break the iOS bridge in `index.html` (`state=ios.*` → `retroviz://callback`).
- Do not change the localStorage keys (`rv.*`); users would lose their login.
- Do not use existing characters, mascots, logos or brand figures (Pac-Man, Crash Bandicoot, Mario, Sonic, …),
  not even renamed or mixed — the site is public. Invent original characters (see `bloop.js`).
- No shaking, flashing, strobing, zooming or speed surges of the whole view on the beat (photosensitivity, eye strain).
  Only small details inside a shape may react to uKick. No large high-contrast stripe patterns (sunburst rays).
  Check: render a few seconds per visual and keep frame-to-frame mean luminance changes small (WCAG 2.3.1: < 3 flashes/s).
- Spotify's audio-features / audio-analysis endpoints are closed for new apps — don't build on them.

## Testing before you commit
1. `node --check` on every changed `.js` file.
2. Open the page, switch to every visual (← → keys or swipe), check the browser console is clean.
   Key D shows frame rate, render size, visual and sound input: use it when someone reports a delay
   (below ~40 fps the frame itself adds noticeable lag).
3. `window.diggy.setVisual("id")` switches visuals from the console; `window.diggy.onTrack({...})`
   fakes a track change.
4. Work on a branch, open a pull request; Mo merges to `main` (that is what GitHub Pages serves).

## Line visuals (Landscape, Halo, Vanish, Orbit)
Draw the sound itself: `waveAt(x)` (oscilloscope) and `histAt(f, secondsAgo)` / `histShape()` (spectrum history).
In listening mode this is measured sound; latency depends on the device and input pipeline. Never draw a
simulated rhythm on top of it. Keep the newest row/sample on screen.
Use `ellipseLine()` for circles/ellipses; `lineAt()` caps the slope so steep curves don't leave vertical streaks.

## Story visuals

`story: true, duration: 120` prevents a track change from interrupting the scene and gives its 90-second reward time to finish. `uSceneTime` counts visible playback seconds with the sheets closed, and `uSceneBeat` integrates the current BPM continuously. Both reset when selecting a different visual; they survive song changes, seeks, resize and WebGL restoration. Use these uniforms instead of song position for character paths and timed surprises. Use `P()` for framing in both orientations.

## Review invariants

- JSONP must remain in an iframe with `sandbox="allow-scripts"` and without `allow-same-origin`. Never execute a third-party tempo script in the page that stores Spotify credentials.
- Missing or failed tempo lookup must visibly say it is an estimate. A BPM number alone does not prove beat synchronization.
- Clear waveform/history when changing between measured and simulated audio. Suspended/muted microphone sessions must not reuse frozen analyser samples or silently synthesize a waveform.
- Story beats use a bounded phase correction, separate from elapsed story time. Bloop's alien arrives once and stays past 120 seconds when Auto is off. Night Drive's convoy repeats every 120 seconds and must fit portrait and landscape.
- Temporal diagnostics are a low-resolution regression aid, not WCAG/PEAT/Harding certification, a guarantee of comfort, or an iPhone FPS benchmark.

## 2.5 onsets and helper window

- `flux(x)` is a per-frequency onset envelope: sustained tones settle; new notes briefly rise. `uHit` is the strongest kick/clap/onset, bounded 0..1. `uKickN` and `uSnareN` count detected hits; hash them with an object id to choose a different local group each time. Detection remains approximate.
- Strong responses belong to individual spikes, ridges, rings or particles. There is deliberately no global `punch` property: the unfinished 2.5 global zoom/exposure/bloom-flash proposal conflicts with the existing no-screen-flash rule and was removed.
- Tab audio first opens a same-origin helper synchronously from a user tap. It requests the share, optionally after a second click inside the helper. The main window analyses its audio-only stream. A blocked popup falls back to the main-window picker.
- Keep the helper open or minimized during playback. Closing it stops audio. Pending pickers, aborted starts, duplicate clicks, late streams and all polls/listeners must be cleaned up. Never suppress browser permission dialogs or promise that all browser-owned sharing indicators disappear; their placement depends on Chrome/Edge.

## Latency budget (2.5.1)
Visuals must land on the hit. Measured with an AnalyserNode emulation (kick onset → reaction): kick and onset
detection ~9 ms; band levels 90 % about 20 ms faster than in 2.5.0. Keep: analyser smoothing 0.3, envelope
ATTACK 110, the newest spectrum-history row live between 30 Hz pushes (`feedHistory`). Covered by
`tests/latency.test.mjs`.

## Computer sound (2.6) — the default way to follow Spotify on a computer
`js/system-audio.js`: listens to the computer's own output through a loopback input (Windows "Stereomix",
VB-Audio "CABLE Output", Mac BlackHole). `findLoopback()` picks it by name; the chosen deviceId is saved in
`rv.sysDevice` (falls back to a name search when the id changed), `rv.sys` remembers "on" and only changes when
the user switches it (a failed automatic start retries next time). With the permission already granted it starts
on page load; the AudioContext may still need one tap (browser rule). Input order in `soundInput()`:
own music > computer sound > tab sound > microphone. Starting it stops the microphone and tab sound.
Spotify cannot deliver audio itself: its Web Playback SDK is DRM-protected and audio-analysis/audio-features are
closed for apps created after Nov 2024 — do not build on those. Windows setup steps live in index.html (#sysGuide).

## 2.6.2 review
- Spotify login supplies metadata, not PCM/FFT samples. Computer sound is an OS loopback input, not a direct Spotify audio API. Do not claim that it eliminates end-to-end latency.
- Audio inputs are mutually exclusive when selected; latest user choice cancels competing pending starts. A saved automatic start must not override a newer user choice.
- `createListener` passes an AbortSignal to acquisition. Check it between permission probes, enumeration and final capture; release late streams without saving their device.
- Autoplay-blocked contexts remain reachable by pointerdown and stop. Never await a potentially indefinitely pending `resume()` before exposing resources.
- `latency` is optional track `getSettings().latency`; `contextLatency` is AudioContext.baseLatency, an output-processing metric. Neither measures total delay to the visual. Preserve the faster 2.5.1 envelope/history path.

## Windows app (2.7) — `desktop/`
- A thin Electron shell that loads the live site (https://myshine-be.github.io/diggyviz/; `DIGGYVIZ_URL` overrides it for
  tests). The web app itself stays build-free; npm is only used inside `desktop/`.
- `desktop/main.js` answers every `getDisplayMedia()` itself with the screen + `audio: "loopback"` (WASAPI system sound on
  Windows): no picker, no Stereo-mix, no sharing bar. It starts the sound with `executeJavaScript(…, userGesture=true)`
  → `window.diggy.startDesktopAudio()`. Navigation is limited to the app origin and Spotify login; other links open
  in the normal browser. Spotify PKCE works unchanged because the redirect is the same hosted URL.
- `js/desktop-audio.js`: `isDesktop()` (preload sets `window.diggyDesktop`) and `createDesktopListener()` (same analysis
  as listen.js, `audioOnly()` from tab-audio.js). Input order: own music > desktop > computer sound > tab > microphone.
  In the app the browser-only inputs (Computergeluid, microphone, tab) are hidden; `#deskNote` explains.
- Build: `cd desktop && npm ci && npx electron-builder --win nsis portable --x64` on Windows, or push a tag `desktop-v*`
  (workflow `.github/workflows/desktop.yml` attaches Setup + portable .exe to a Release). On Linux only the unpacked
  app can be built (NSIS needs wine). Not code-signed: Windows SmartScreen asks once.
- Smoke test (Linux, Xvfb): `DIGGYVIZ_URL=http://127.0.0.1:8765/ DIGGYVIZ_SMOKE=12000 xvfb-run -a desktop/node_modules/electron/dist/electron desktop --no-sandbox`
  prints the app state; on Linux the loopback itself fails (no ALSA loopback), which is expected.

## Clean screen (2.7)
No control buttons under the visual (`.hud-bottom .controls` hidden in css). The visual chips (`#chips`) MUST stay visible: they are the only way to pick a visual by touch/mouse (lesson: hiding them in 2.7.0 left Mo unable to switch visuals). Controls:
← → / swipe (visual), F (full screen), Space (own music), T (tap tempo), D (diagnostics), Settings (gear).

## Frameless window (2.7.2, app 0.1.2)
The app window has no Windows title bar (`frame: false`; Mo's accent colour made it a red bar). The page draws its own
`#deskBar` (desktop only): an invisible drag strip (`-webkit-app-region: drag`, double-click = maximise) and – ▢ ✕ buttons
that call `window.diggyDesktop.minimize/toggleMaximize/close` → IPC "win" in desktop/main.js. It is a `.hud`, so it hides
with the HUD after 4 s. `html.desktop .hud-top` moves the top HUD below it. In a normal browser nothing changes.
App 0.1.1+ clears the HTTP cache at start and reloads with F5 / Ctrl+R (GitHub Pages caches 10 minutes).

## 2.8 — colours, pacing and reworked visuals
- **Cover colours must stay recognisable.** `pal()` hue drift is ±0.12 rad (was 0.45) and the final neon grade ±0.25 rad
  (was 0.85). Do not raise these again: Mo wants every song to look different, in the cover's own colours.
  In the Windows app Spotify must be logged in (⚙ → Spotify); without it the demo source with its fixed palettes runs.
- **Calm pacing:** `AUTO_SWITCH_SECONDS` 180, crossfade 3 s. A new song switches the visual only if it was shown ≥ 120 s.
  Story visuals keep their 120 s duration.
- **Urchin:** no lighting on hits at all (Mo: "no flashes"). Only the spikes move. Bloom 0.35.
- **Strings:** rebuilt on the Vanish principle (lagged `histSmooth` traces) as one symmetric bundle pinched at both
  ends — calm and readable like the handheld-console "strings". Do not make every line independent again.
- **Soul Beat:** six melting metaballs (ferrofluid) with droplets that split off on kick/snare, high-note spikes per
  direction, glossy liquid shading; no halo flash.
- **Bubbles:** slow lava lamp (2D metaballs, thin-film colours with a smooth periodic mapping, caustics, pearls on highs).
- **Ruimtereis** (id `nightdrive`, file night-drive.js): original ship in space, planets, ringed planet whose 7 ringlets
  are the spectrum, asteroids (one shoots by on kicks), satellites blinking on the beat, a wheel station. Easter egg
  90–105 s: landing planet rises, ship lands, an astronaut dances with three Glorps, take-off.
- **Bloop:** Bloop is a Glorp (shared alien, `glorp()` in story-shapes.js, also used in Ruimtereis). Alien sky with
  two moons and the ringed planet, crystal mountains, glowing plants; he hops over boulders, mushroom houses and crystal
  clusters, with a big leap every 8th beat. The equalizer hills are gone.
- `story-shapes.js` now also holds `glorp()` and `astronaut()`.

## 2.9 — approved proposal docs/voorstel-2.9.md, built
- **Visual-owned data:** a visual may export `uniforms({ gl, loc, frame, slot, width, height })`; the engine calls it
  right before drawing. Texture units ≥ 4 belong to the visual (Snake uses 4, Orbit 5). Keep state per GL context
  (WeakMap) and re-create textures when `gl.isTexture()` is false (context restore).
- **Rest (pauses):** `audio.rest` 0..1 (listen.js: level far below its own recent average for > 0.4 s; rhythm.js: song
  paused) → uniform `uRest`. app.js slows visual time (`visTime`) and story time to 30 % during a rest; the final pass
  softens colours and breathes slowly (no brightness jump). Visual accents: Urchin spikes withdraw, Strings relax,
  Dunes flatten, Snake stops and looks around. Tests: tests/rest.test.mjs.
- **Snake** (id `nightdrive`, file night-drive.js; logic js/visuals/snake-path.js, tests/snake.test.mjs): plays itself
  (BFS to the apple with a free-space safety check), two moves per beat (story beats), body = live equalizer
  (segment k = frequency k/len, ripples head→tail), grows 2 per song (`rv.snakeSongs`, passed as `frame.songs`),
  molts back to 6 after 120; heart of apples at 90–105 s. Board = 64×64 RGBA texture (R = segment index+1, G = apple).
- **Orbit lyrics** (js/lyrics.js, tests/lyrics.test.mjs): LRCLIB `/api/get` then `/api/search`, only artist/title/
  duration sent, `credentials: "omit"`, no referrer, fetched only while Orbit is on screen, memory cache only.
  Lines are drawn into a 1024² canvas atlas (current-3 … current+6) → texture; the shader puts them on latitude bands
  of the front hemisphere, current line in front with a karaoke fill. No lyrics → the original rings.
  Copyright: lyrics are shown live from LRCLIB, never stored in the repo; Mo accepted this in the 2.9 review.
  LRCLIB CORS from GitHub Pages was not verifiable from Claude's sandbox — if the fetch fails Orbit falls back to rings.
- **Halo** removed (12 visuals). **Warp:** no kick/snare/hit brightness. **Tunnel:** soft polygon ring morphing to a
  new corner count on each kick, crinkles per direction on highs, faster feedback decay, cover colours, no centre spark.
- **Spectrum:** smooth levels (histSmooth, partly lit top LED), glass LEDs, sparks on fresh highs, and a layout that
  glides every 40 s: mirrored row → arch → ring → classic row.
- **Dunes** (id `landscape`): new sound appears at the horizon and rolls towards the viewer; heights saturated and
  capped (~15 % of the screen); moons shared with Bloop.

## 3.0 — lyrics layer and five reworked visuals (live since 29 Oct 2026, Mo's go)
- **Lyrics layer** behind every visual: timing ONLY from LRC timestamps vs. the real playback position (`lyricView` in
  js/lyrics.js; never BPM/kicks). No current line without synced lyrics, without a known position (Last.fm `approx`),
  before the first line or in empty (instrumental) LRC lines. Slide only on a normal step to the next line; seek/pause/
  gap → correct at once. Lines belong to a track id: a new song removes the old text immediately, late answers are never
  shown. Word highlight only with real `<mm:ss.xx>` word stamps — never invent word timing (Orbit no longer does).
  Atlas: js/lyrics-layer.js (regular + bold columns with IDENTICAL size/wrapping — lesson: different sizes left a ghost
  of the regular text around the bold line). Final pass: text only where the picture is dark (= behind the visual);
  `occlude:false` for Dunes' sky. Texture unit 6 is the engine's. Toggle: `rv.lyrics`, ⚙, key L. Only artist/title/
  duration go to LRCLIB (tested: no auth header, no token, no cookies). Visuals place it with
  `lyrics: { y | {land, port}, span, scale, font: sans|light|mono|serif, occlude, ink, accent }` or `lyrics: false`.
- **Snake:** body = bundle of 6 fine lines along the path (quarter circles in corners, continuous arc length
  `s = k − 0.5 + u`), head = lows (broad), tail = highs (fine), bounded ≤ 0.44 cell, converging lines normalised.
- **Soul Beat:** ink in a glass sphere (no white disc). No centre mechanism: masses on own paths at 0.36–0.62 of the
  inner radius; never add a pull towards the centroid. Kick stretches ONE mass, snare pulls a tendril + drop.
- **Tunnel:** analytic (depth = 0.33 / r), no feedback. Do not reintroduce central shapes: with feedback they become
  the walls. Rings fade out before reaching the camera (no passing glare).
- **Dunes:** heightfield raymarch; beat ridges from js/visuals/dune-ridges.js (pure, tested) baked into an R16F texture
  on unit 4; heights capped so the horizon and the sky (lyrics) stay free; the sand veil is the only beat accent and stays on ONE near crest (a wide veil gave 4 % luminance jumps per frame).
- **Urchin:** hits → events (js/visuals/urchin-events.js, pure, tested) → uniforms `uEvA/uEvB[6]`. Ball radius fixed
  0.5 (+ spike ≤ 0.86 = 1.36 < 1.40: never clipped). No energy/kick-driven brightness anywhere.
