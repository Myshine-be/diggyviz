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
| `js/engine.js` | WebGL2 renderer: visual → crossfade → bloom → tonemap/grain. Adaptive resolution |
| `js/glsl.js` | Shared GLSL header (uniforms + helpers) and post-processing shaders |
| `js/rhythm.js` | Synthetic rhythm (no audio access): kick/snare/hat/energy + 32 bands from song position + BPM |
| `js/tempo-lookup.js` | Automatic BPM per song from Deezer (JSONP; Spotify ISRC, else artist + title). Cached in `rv.bpm.<id>` |
| `js/listen.js` | Listening mode: microphone → Web Audio → same `audio` fields as rhythm.js (real kicks, tempo). Never records |
| `js/visuals/spectrum-history.js` | Shared GLSL for line visuals: `beatNow()`, `specAt(f, beat)`, `lineCol()`, `lineAt()`, `ellipseLine()` |
| `js/palette.js` | Album-art → 4-colour palette |
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
   uEnergy, uLevel, uDrop, uTravel, uSeed, uBands[32], uPeaks[32], uPal[4], uPrev, uArt` and helpers
   `P(), rot(), smin(), hash*, noise2/3, fbm2, band(x), peak(x), pal(t), wave(x), gridLine(x,w)`.
   Do not redeclare these.

## Shader rules
- GLSL ES 3.00 (`#version 300 es` is added by the header). Write to `fragColor`.
- Must run on an iPhone at 60 fps at ~0.6× resolution. Raymarch ≤ 110 steps, use a bounding
  sphere early-out, no nested loops over > 50 iterations.
- Colours come from `uPal` / `pal()` so every visual follows the album art. Avoid hard-coded hues
  (exception: Soul Beat's white disc).
- Output can exceed 1.0; the final pass tone-maps (ACES) and adds bloom, vignette and grain.
- Use `P()` for coordinates: shorter screen side spans −0.5…0.5, works in portrait and landscape.
- Anti-alias edges with `fwidth` / `px = 1.5 / min(uRes.x, uRes.y)`.

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
Draw history with `specAt(f, beatNow() - n)` so every line lands on the song's beat (tempo from tap, Deezer or the mic).
Use `ellipseLine()` for circles/ellipses; `lineAt()` caps the slope so steep curves don't leave vertical streaks.

## Story visuals

`story: true, duration: 120` prevents a track change from interrupting the scene and gives its 90-second reward time to finish. `uSceneTime` counts visible playback seconds with the sheets closed, and `uSceneBeat` integrates the current BPM continuously. Both reset when selecting a different visual; they survive song changes, seeks, resize and WebGL restoration. Use these uniforms instead of song position for character paths and timed surprises. Use `P()` for framing in both orientations.
