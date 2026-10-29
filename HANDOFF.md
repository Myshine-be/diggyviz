# HANDOFF — DiggyViz 3.0.0-beta (branch `claude/visuals-3.0`, NIET live)

Mo's 3.0-briefing is **volledig uitgewerkt op de branch** (Claude, 29 oktober 2026). `main` en de live site zijn
ongewijzigd: **pas mergen na Mo's akkoord** op de previews. Alle 113 unit-tests en de browsertest (12 visuals compileren) slagen.

## Wat er veranderde
1. **Songtekstlaag achter elke visual** — `js/lyrics.js` (`lyricView`, echte woordstempels), `js/lyrics-layer.js`
   (atlas regulier+vet, slots), final pass in `js/glsl.js` (tekst alleen waar het beeld donker is = "achter"),
   `js/engine.js` (unit 6, `uLyr*`), `js/app.js` (`lyricsFrame`, `rv.lyrics`, ⚙ + toets L, D-status). Per visual
   `lyrics: { y | {land, port}, span, scale, font, occlude, ink, accent }`; Orbit `lyrics:false` en kleurt nu hele regels.
   **Echte LRCLIB-test gedaan** vanaf https://myshine-be.github.io (Mo's ingebouwde browser, 29/10): Daft Punk "Get Lucky
   (feat. …)" → 114 getimede regels, The Weeknd "Blinding Lights" → 40; een demo-nummer → netjes "none" (search gaf 503,
   wordt opgevangen). CORS werkt dus. Nog niet getest: de match met een nummer dat Mo op dat moment op Spotify speelt.
2. **Snake** — alleen het lijf: bundel van 6 fijne lijnen langs het pad (kwartcirkel in bochten, booglengte continu),
   kop = lage tonen breed, staart = hoge tonen fijn, gebonden ≤ 0.44 cel. Hoofd/route/appels/easter egg ongewijzigd.
3. **Soul Beat** — inkt in een glazen bol (raymarch ≤ 72 stappen, 7 massa's op eigen banen, geen centrum; kick = één
   massa rekt, snare = rank + druppel, bas = drukgolven, hoog = randrimpels). Kost ~4× de oude 2D-versie (≈ Urchin).
4. **Tunnel** — analytische tunnel zonder feedback en zonder centrale vormen: oplichtende contourringen die door de
   muziek vervormen, mist naar een donkere open doorgang, constante snelheid. Tunnel blijft in de lijst.
5. **Dunes** — hoogteveld-raymarch: procedurele duinen + beat-ruggen (`js/visuals/dune-ridges.js`, R16F op unit 4,
   tests `tests/dunes.test.mjs`), lage zon, nevel, zandsluier op de beat, lyrics in de avondlucht (serif, ivoor/zand).
6. **Urchin** — `js/visuals/urchin-events.js` (tests `tests/urchin.test.mjs`): clusters per hit (bas breed onderaan,
   scherp compact bovenaan), golven (±1 op 3 heldere hits, nooit twee op rij), zones op beeldhoogte, eigen
   gevoeligheid/hersteltijd per stekel, rust kort, bal-straal vast 0.5, glow begrensd (geen helderheidspulsen).

## Previews
Mo kreeg per onderdeel een mp4 (vóór | na, landschap + portret) met hetzelfde echte-muziekfragment en dezelfde hoes.
Gereedschap staat in Claude's sandbox (`qa/preview.py`, `qa/compare.py`), niet in de repo.

## Openstaand / eerlijk
- Niet fysiek getest op iPhone-GPU of in de Windows-app; rendertijden zijn swiftshader-CPU (alleen relatief).
- Dunes en Soul Beat zijn de zwaarste shaders nu; als D op iPhone < 40 fps toont: stappen verlagen (Dunes 100 → 70).

---
# Stand 28 oktober 2026, laat (Claude) — DiggyViz 2.9.0 gebouwd volgens docs/voorstel-2.9.md
Mo en ChatGPT gingen akkoord met het voorstel. Alles uit het voorstel is gebouwd; de details staan in AGENTS.md onder "2.9".

## Getest
- **Node-tests:** 89, onder meer voor:
  - pauzes;
  - Snake: speelt 4000 zetten zonder botsing, groeit, is deterministisch, eet het hart;
  - songteksten: LRC-parser, zoeken, geen credentials meegestuurd.
- **Browsertest:** `tests/browser.mjs` slaagt. De oude Landscape-fixture is vervangen, want Landscape is nu een nieuwe shader (Dunes).
- **Temporele luminantie:**
  - Warp ging van 0,065 naar 0,004;
  - Tunnel ging van 0,035 naar 0,01;
  - Dunes 0,005;
  - Snake 0,004.
- **Stills:**
  - Snake in landschap en portret;
  - Orbit met verzonnen testteksten (de fetch was gestubd);
  - Spectrum in de vier opstellingen;
  - Dunes;
  - Tunnel.

## Open / niet getest
- **LRCLIB:** of de echte verbinding vanaf GitHub Pages werkt (CORS), kon niet getest worden: lrclib.net is geblokkeerd in Claudes sandbox. Lukt het niet, dan toont Orbit gewoon de ringen. Controleer dit in de browser.
- **Snake op de iPhone:** de prestaties op native resolutie zijn niet gemeten.
- **Vanish:** heeft nog de hoogste temporele luminantie (0,148).

---

# Stand 28 oktober 2026, nacht — DiggyViz 2.8.0 (Claude)
Mo's wensen in deze ronde: kleuren per nummer uit de hoes, rustiger automatisch wisselen, geen flitsen in Urchin, Soul Beat levendiger, Strings zoals Vanish, Bubbles herwerken, Night Drive → ruimte, en Bloop als alien op een eigen planeet.

## Gedaan
Alles staat in AGENTS.md onder "2.8".
- **Kleuren:** `paletteFromPixels` + tests. In de kleurtest met drie hoezen (zonsondergang, oceaan, bos) zag elke visual er duidelijk anders uit.
- **Wisselen:** 180 s, crossfade 3 s, een nieuw nummer pas na 120 s.
- **Urchin:** zonder licht op treffers.
- **Strings, Soul Beat en Bubbles:** herschreven.
- **Ruimtereis en Bloop:** nieuw. De gedeelde alien `glorp()` en `astronaut()` staan in `story-shapes.js`.

## Getest
- 78 Node-tests.
- `tests/browser.mjs`: alle 13 shaders.
- Verhaal-lifecycle en temporele luminantie: Strings 0,007 en Urchin 0,02 (eerder ~0,15–0,19), Ruimtereis 0,004, Bloop 0,003.
- Stills in landschap en portret.

## Let op
- **Spotify-login in de Windows-app:** die is apart van Chrome. Ben je niet ingelogd, dan draait de demo met vaste groene kleuren. Dat verklaart Mo's "altijd dezelfde kleuren".
- **Vanish:** heeft de hoogste temporele luminantie (0,148). Daar is nog niets aan gedaan.
- **Fysiek niet getest:** iPhone-prestaties met de nieuwe Ruimtereis.

---

# Stand 28 oktober 2026, avond (Claude)
- **Windows-app getest door Mo:** de live beatsync werkt via WASAPI-loopback ("invoer desktop", 119 fps, invoerlatentie 10 ms).
- **2.7.1:** de visual-keuze (chips) onderaan is terug. Die mag niet meer verborgen worden.
  - Toets D toont nu of er geluid binnenkomt, het niveau, de kick en of het systeemgeluid aan staat.
- **App 0.1.1:** wist de cache bij de start (anders kon de oude site tot 10 min blijven hangen) en herlaadt met F5 / Ctrl+R.
- **2.7.2 / app 0.1.2:** de Windows-titelbalk is weg (frameless). Er zijn eigen knoppen – ▢ ✕ en een sleepstrook; die verdwijnen samen met de HUD. Zie AGENTS.md "Frameless window".
- **Open:**
  - echte installer via de workflow (met de hand starten in Actions);
  - Mac-versie;
  - Android-app.

---

# Overdracht 2.7 (Claude → ChatGPT) — 28 oktober 2026

Lees ook `AGENTS.md`, met de secties "Windows app (2.7)" en "Clean screen (2.7)".

## Wat Mo vroeg
1. **Echte live beatsync met Spotify, zoals een PSP.** Zonder tabblad delen, en later als app.
2. **Geen knoppen meer onder de visual.** Tab-geluid, Microfoon, BPM, Auto, Volledig scherm en de visual-chips moeten allemaal weg.
3. **Eerst de Windows-app.** Daarna bekijken we wat beter kan.
4. **Lezen wat ChatGPT achterliet.** Gedaan: `docs/review-2.6.2.md` en de 2.6.2-wijzigingen zijn gelezen en zijn de basis.

## Waarom een app (en geen Spotify-API)
- **Geen geluid van Spotify:** Spotify geeft geen audio of PCM af. De Web Playback SDK is DRM.
- **Geen beat-data:** audio-analysis en audio-features zijn sinds 27-11-2024 dicht voor nieuwe apps.
- **Geen uitgebreide toegang:** die krijgen sinds 15-05-2025 enkel organisaties met minstens 250k MAU.
- **Wat de API wel geeft:** alleen metadata, positie en tempo. Dat is geen live sync.
- **Live sync vraagt dus het echte geluid van het toestel.**
  - Windows: WASAPI-loopback. Dat is gedaan.
  - Android: AudioPlaybackCapture. Dat is de volgende stap.
  - iPhone: kan niet (alleen microfoon of eigen muziek).

## Wat af is (versie 2.7.0)
- **Knoppen weg.**
  - In `css/app.css` worden `.hud-bottom .chips` en `.hud-bottom .controls` verborgen. Alleen de statusregel blijft.
  - De knoppen blijven in de DOM, zodat `app.js` en de tests blijven werken.
  - In Instellingen staat een notitie met de toetsen: ← → wisselen, F volledig scherm, Spatie afspelen/pauzeren, T meetikken, D diagnose. Op de telefoon swipe je.
  - Getest met Playwright: de knoppen zijn onzichtbaar en de pijltjes wisselen nog van visual.
- **Windows-app, `desktop/` (Electron 44.7.1, electron-builder 26.16.1).**
  - `main.js`:
    - laadt de live site;
    - beantwoordt `getDisplayMedia` zelf met scherm + `audio: "loopback"`, zonder kiezer of balk;
    - start het geluid met `executeJavaScript(…, true)`;
    - laat alleen navigatie toe naar de site en de Spotify-login;
    - heeft een offline-pagina, F11 voor volledig scherm, en geen menu.
  - `preload.js`: zet `window.diggyDesktop`.
  - Eigen app-icoon: `desktop/build/icon.png` en `icon.ico`.
  - Workflow `.github/workflows/desktop.yml`: bouwt bij een tag `desktop-v*` een Setup-exe en een portable exe op windows-latest en zet die bij een Release.
- **Webcode.**
  - `js/desktop-audio.js` (`isDesktop`, `createDesktopListener`).
  - In `app.js` heeft desktop voorrang op de andere ingangen.
  - `startDesktopAudio()`: verbindt opnieuw bij een klik.
  - In de app worden de browser-ingangen verborgen; `#deskNote` legt het uit.
  - `tests/desktop-audio.test.mjs`.
- **Tests:**
  - 74 Node-tests slagen;
  - `tests/browser.mjs` slaagt;
  - een Electron-rooktest onder Xvfb: de handler wordt automatisch aangeroepen (1×), `diggyDesktop` is aanwezig, de rijen in Instellingen zijn verborgen en de onderste knoppen zijn onzichtbaar.
  - Loopback zelf faalt op Linux, zoals verwacht (geen ALSA-loopback).

## Niet getest / open
1. **Echte Windows-loopback op Mo's laptop.** Starten → Spotify-app spelen → BPM LIVE en D-overlay. Dit is de belangrijkste test.
   - Vraagt Chrome/Electron op Windows toch iets, of blijft het geluid stil: kijk eerst naar `setDisplayMediaRequestHandler` (sources[0] = scherm) en of `audio: 'loopback'` een audiospoor geeft.
   - Debug met `DIGGYVIZ_DEBUG=1` vanaf de commandline.
2. **Installer.** De Windows-installer werd hier niet gebouwd: NSIS heeft wine nodig. Mo kreeg een zip met de uitgepakte app (DiggyViz.exe). Een echte Setup komt uit de workflow `.github/workflows/desktop.yml`. Het pushen van een tag lukte vanuit Claudes omgeving niet: start de workflow met de hand (GitHub → Actions → "Desktop app (Windows)" → Run workflow) of push tag `desktop-v0.1.0`, en controleer of de run slaagt.
3. **Ondertekening.** De app is niet ondertekend, dus SmartScreen vraagt "Toch uitvoeren". Ondertekenen kan later.
4. **Mac-versie.** Electron kan systeemgeluid op macOS 14.2+ (CoreAudio Tap, NSAudioCaptureUsageDescription). Nog niet gedaan.
5. **Android-app.** Volgende stap volgens Mo: AudioPlaybackCapture (MediaProjection, Android 10+).
6. **iPhone.** Geen systeemgeluid mogelijk. Dat moet zo eerlijk blijven.
7. **Vertraging.** Pas meten in de app met toets D. Loopback slaat de tab-omweg over; de totale vertraging is niet gemeten.

---

# Afgewerkt door Codex — 26 oktober 2026

De oorspronkelijke overdracht hieronder beschrijft de WIP op `9b77f3d`; die wijzigingen waren al gecommit. Zie `docs/afronding-2.5.md` voor de afwerking en testgrenzen.

---

# Overdracht DiggyViz 2.5 – stand van zaken (26 okt 2026, 17:05)

Dit verslag is voor wie het werk afmaakt, bijvoorbeeld ChatGPT/Codex. Lees ook `AGENTS.md` voor de regels van het project.

- **Branch:** `v2`. Het werk staat nog niet gecommit en niet op `main`.
- **Live versie:** 2.4.0 op https://myshine-be.github.io/diggyviz/

## Wat Mo vroeg
1. **De deelbalk moet weg.** In volledig scherm staat bovenaan Chromes balk "open.spotify.com wordt gedeeld met dit tabblad | Delen stoppen", en die mag er niet zijn.
2. **De animaties moeten feller op de muziek reageren.**
   - Bij elke kick of clap moeten een paar stekels duidelijk feller uitschieten.
   - Noten met veel klankverschil moeten heel zichtbaar zijn.
   - Nu is het "zwakjes" en saai.
   - Zijn video toonde Urchin met Tab-geluid. De beatsync klopte, de reactie was te zwak.

## Het plan (goedgekeurd door Mo)
1. **Hulpvenster voor tab-geluid.**
   - Chrome zet de deelbalk altijd op het tabblad dat `getDisplayMedia` aanroept, ook in volledig scherm.
   - Daarom vraagt een klein pop-upvenster (dezelfde site) de deling aan, en analyseert DiggyViz de stream van dat venster.
   - Zo komt de balk in de pop-up terecht en blijft DiggyViz schoon.
2. **Analyse uitbreiden.**
   - Contrast per band.
   - `flux[32]`: onsets of klankwissels per band.
   - `snareN`: teller van snares/claps.
   - `hit`: de sterkste treffer op dit moment.
3. **Engine en GLSL.**
   - Nieuwe uniforms: `uFlux[32]`, `uHit`, `uKickN`, `uSnareN`.
   - Helper `flux(x)`.
   - Globale "punch" in de laatste pass (zoom en flits).
4. **Urchin herwerken.**
5. **De andere visuals feller maken.**
6. Testen, versie 2.5.0, `AGENTS.md` bijwerken en naar `main` zetten.

## WAT AF IS (lokaal, niet gecommit)
Backups van elk gewijzigd bestand staan als `*.bak` naast het origineel. Ze worden genegeerd via `.gitignore`.

### Analyse – `js/listen.js` ✅ getest
- **Detectorstatus:** `makeDetector` heeft nieuwe velden: `bandAvg`, `prevNorm`, `riseAvg`, `snareN` en `lastSnare`.
- **`processSpectrum`, banden:** `bands` = `clamp(norm*0.5 + lift*0.85)`.
  - `lift` = hoeveel de band boven zijn eigen gemiddelde van ~1,5 s uitkomt.
  - Aanhoudende klank zakt weg, nieuwe noten springen eruit.
- **`processSpectrum`, flux:** `out.flux[i]` = onset per band.
  - Berekend als `clamp((rise - riseAvg*2 - 0.02)/(riseAvg*4 + 0.12))`.
  - Zakt met `exp(-dt*10)`.
- **`processSpectrum`, tellers:** `out.snareN` telt elke snare/clap, met minstens 0,12 s ertussen.
- **`processSpectrum`, treffer:** `out.hit` = `max(kick, snare*0.85, fluxMax*0.7)`.
- **Gemeten met een eigen offline harnas** (zie "Testhulpmiddelen"):
  - Testtrack op 124 BPM: de variatie van de banden in de tijd ging van 0,154 naar 0,197.
  - Pad met akkoordwissels: flux is 96 % van de tijd rustig en schiet alleen uit bij de akkoordwissels. Goed selectief.
- Alle 48 bestaande unit-tests slagen nog.

### Gesimuleerd ritme – `js/rhythm.js` ✅
- `audio` heeft nu ook `flux`, `snareN` en `hit`.
- Flux = het verse deel van elke kick (lage banden), snare (midden) en hat (hoog).

### `js/app.js` ✅
- Bij het wisselen van geluidsmodus worden `audio.flux` en `audio.hit` ook op 0 gezet.

### `js/engine.js` ✅
- In `#drawVisual` worden `uFlux`, `uHit`, `uKickN` (= `audio.beatIdx`) en `uSnareN` gezet.
- In de final pass komen `uPunchKick` en `uPunchSnare` erbij.
  - Ze worden geschaald met de nieuwe optionele eigenschap `punch` per visual (standaard 1).
  - Tijdens een crossfade worden ze gemengd.

### `js/glsl.js` ✅
- In de HEADER: uniforms `uFlux[32]`, `uHit`, `uKickN`, `uSnareN` en de helper `float flux(float x)`.
- In FINAL_FRAG:
  - Bij een kick zoomt het hele beeld 2,8 % in en wordt het 22 % helderder.
  - Bij snare/clap komt er een bloomflits van +0,6.

### `js/visuals/urchin.js` ✅ visueel gecontroleerd
- **Toonhoogte per stekel:** elke stekel heeft een eigen toonhoogte (`spikeFreq`), en buren delen een frequentiegebied.
- **Kick:** elke kick kiest een andere groep van 30 % van de stekels (`kickSel` via de hash van `uKickN`). Die groep schiet ver uit en wordt wit/goud.
- **Snare/clap:** elke snare/clap kiest een groep van 20 % (`snareSel`), die uitschiet in de contrastkleur `pal(0.95)`.
- **Flux:** laat de stekels van die toonhoogte uitschieten en oplichten.
- **Kernbol:** pulseert sterker.
- **Raymarch-fix:** de stap is beperkt tot 0,045 dicht bij de bal en het maximum is 140 iteraties. Zonder die fix waren lange stekels "gebroken".
- **Vergelijking:** stills van rust/kick/snare, oud tegen nieuw, staan in `/home/claude/qa/urchin-compare.png` en `urchin-after.png`. Het verschil is enorm.

### Andere visuals ✅ aangepast, ⚠️ nog NIET visueel gecontroleerd
Kleine gerichte boosts, telkens met kick/snare/flux/hit:
- `halo`
- `orbit`
- `strings`
- `warp`
- `vanish`
- `landscape`
- `soul-beat`
- `spectrum`
- `tunnel`
- `bubbles`

`bloop` en `night-drive` reageerden al genoeg en krijgen daarnaast de globale punch.

### `js/tab-audio.js` ⚠️ HALF AF – moet nagekeken en opgeruimd worden
- **Waarom herschreven:** het bestand is in één keer herschreven in plaats van stap voor stap. Dat is tegen de werkregel; het origineel staat in `js/tab-audio.js.bak`.
- **Wat er nu in staat:**
  - `audioOnly(stream)`.
  - `acquireTabAudio(media)`: vraagt de deling op het eigen tabblad aan, zoals vroeger.
  - `openHelper()`: opent een `about:blank`-pop-up en schrijft er zelf HTML in.
  - `acquireViaHelper(w)`.
  - `createTabListener`: probeert eerst het hulpvenster, en valt bij een geblokkeerde pop-up terug op `acquireTabAudio`.
  - Getter `usesHelper`.
  - Een poll die Tab-geluid stopt als het venster gesloten wordt.
  - `stop()` sluit het hulpvenster.
- **TE DOEN:**
  1. **Opruimen in `acquireViaHelper`:** in de "tik nodig"-tak zit rommel die weg moet (`resolve.__stop`, de lege `Promise.resolve()...`). Het `watch`-interval moet ook bij succes en bij een fout gewist worden.
  2. **Bestaande unit-tests:** de twee tests in `tests/media.test.mjs` gebruiken `acquireTabAudio(fake)`. Die werken nog, maar draai ze opnieuw.
  3. **Nieuwe unit-tests** met een nep-venster `{closed, document, navigator:{mediaDevices:{getDisplayMedia}}, close(), focus()}`:
     - de deling via het hulpvenster gebruikt `w.navigator.mediaDevices`;
     - een geblokkeerde pop-up (`open` geeft `null`) valt terug op de eigen `getDisplayMedia`;
     - een `InvalidStateError` toont de knop en wacht op een klik;
     - een gesloten venster geeft `HelperClosed`;
     - `stop()` sluit het venster.
  4. **`js/app.js` → `setTab`:** na succes een melding tonen.
     - Als `tabIn.usesHelper`: "Tab-geluid aan. Het kleine DiggyViz-venstertje mag je minimaliseren, maar niet sluiten."
     - Anders: "Tab-geluid aan. Tip: sta pop-ups toe voor DiggyViz, dan verdwijnt de deelbalk bovenaan."
  5. **Onzeker, alleen live in Chrome te testen:** kan DiggyViz de `MediaStream` van een ander venster van dezelfde site analyseren (`createMediaStreamSource`)? Dat zou moeten werken.
     - Komt er toch een fout, plan B: de visual in het hulpvenster tonen in plaats van het opnemen daar te doen.
     - Nog één onzekerheid: vraagt Chrome eerst een klik in de pop-up? Daarvoor bestaat de knop.

## WAT NOG MOET (in volgorde)
1. **`tab-audio.js` afwerken:** de punten hierboven.
2. **Alle visuals controleren:**
   - `CHROME_BIN=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node tests/browser.mjs`: alle 13 compileren en geven geen consolefouten.
   - Stills maken met `/home/claude/qa/still.py <repo> <tag> <visual>` (rust/kick/snare met nep-audio) voor elke visual. Controleren dat er niets wit uitbrandt en niets buiten beeld valt.
3. **Unit-tests toevoegen** in `tests/`:
   - `flux` is ~0 bij aanhoudende toon en schiet uit bij een nieuwe noot;
   - `snareN` telt;
   - `hit` bestaat;
   - `rhythm.js` vult `flux`.
   - Alles moet groen zijn: `node --test tests/*.test.mjs`.
4. **Versie en documentatie:**
   - `js/config.js` → `VERSION "2.5.0"`.
   - In `AGENTS.md` uitleggen: `flux(x)`, `uHit`, `uKickN`/`uSnareN` (hash ze om bij elke slag een andere groep te kiezen), `punch` per visual, en het hulpvenster voor tab-geluid.
5. **Committen en live zetten:**
   - Committen op `v2`, mergen naar `main`, pushen.
   - Controleren dat GitHub Pages bouwt via `gh api repos/Myshine-be/diggyviz/pages/builds/latest`.
6. **Mo laten testen op zijn laptop:**
   - Tab-geluid aan → het venstertje verschijnt → het Spotify-tabblad kiezen en "Tabblad-audio delen" aanzetten → het venstertje minimaliseren → DiggyViz in volledig scherm. Er mag geen balk meer staan.

## Testhulpmiddelen (in `/home/claude/qa`, niet in de repo)
- **`gen.py`:** maakt `test.wav` en `Test Artist - Beat Test.mp3`. Inhoud: 124 BPM, kick, clap, hats, baslijn en akkoordstoten.
- **`offline.mjs <repo> [wav]`:** bootst AnalyserNode na (Blackman, smoothing 0.45, -90..-15 dB) en voert `processSpectrum` uit op 60 fps.
  - Geeft uit: aantal kicks en snares, `bandTemporalStd`, `fluxMean`, `fluxFramesOver05` en `hitMean`.
- **`pad.wav`:** aanhoudende akkoorden. Gebruik het als controle dat `flux` rustig blijft.
- **`still.py <repo> <tag> <visual>`:** maakt deterministische stills met nep-audio (rust/kick/snare).
- **`old/`:** git-worktree van de vorige HEAD, voor vergelijkingen tussen oud en nieuw. Verwijderen met `git worktree remove /home/claude/qa/old`.

## Opgemerkt, niet aangepast
- Op de testtrack telt de kickdetectie ook de baslijn op de offbeat als kick: 63 in plaats van ~32. Daardoor blijft de BPM op 120 hangen.
- Op Mo's echte muziek klopte de beatsync wel. Alleen aanpassen als Mo erover klaagt.
