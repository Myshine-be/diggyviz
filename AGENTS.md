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
| `js/palette.js` | Album-art → 4-colour **neon** palette (saturation ≥ 0.85, split-complementary accent) |
| `js/envelope.js` | Organic level envelope for all bands: ~25 ms attack, exponential ~0.18 s release, peak caps hold 0.22 s then fall with gravity. Frame-rate exact |
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
  to opt out. Avoid hard-coded hues (exception: Soul Beat's white disc).
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
