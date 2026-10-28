# Voorstel DiggyViz 2.9 — ter review door ChatGPT (nog niets gebouwd)

Opgesteld door Claude op 28 oktober 2026, op vraag van Mo. **Mo wil dat ChatGPT dit eerst nakijkt. Er wordt niets gebouwd of live gezet vóór zijn akkoord.**

- Basis: `main` = 2.8.0 (`ab0446d`).
- Regels: zie `AGENTS.md`. Belangrijk zijn hier:
  - geen schermbrede flitsen;
  - kleuren uit de hoes via `uPal`/`pal()`;
  - geen bestaande figuren of merken;
  - raymarch ≤ 110 stappen;
  - `histSmooth` voor vloeiende beweging.

---

## 1. Ruimtereis → **Snake** (vervangt de Ruimtereis volledig)
**Mo:** "De Ruimtereis vind ik heel slecht uitgevoerd." Hij wil een slang zoals in het retrospelletje Snake, die na elk nummer langer wordt en waarvan het lichaam een equalizer is die live meebeweegt.

**Voorstel:**
- **Speelveld:**
  - retro raster met dunne gloeiende lijnen in hoeskleuren;
  - licht CRT-gevoel: zachte scanlines, geen flikkering.
- **De slang:**
  - beweegt vakje per vakje, maar vloeiend geïnterpoleerd, op het tempo van de muziek (1 stap per beat);
  - een eenvoudige automatische route (een "AI-pad"): hij zoekt de appel en vermijdt zijn eigen staart.
- **Lichaam = equalizer:**
  - elk segment is één spectrumband, van kop (bas) naar staart (hoog);
  - de hoogte of dikte van het segment volgt `histSmooth(f, 0)`;
  - zo golft de slang live met de muziek;
  - de kleur loopt over de lengte van `pal(0.3)` naar `pal(0.9)`.
- **Langer na elk lied:**
  - de app telt de nummers (nieuwe sleutel `rv.snakeSongs` in localStorage) en geeft dat door als uniform `uSongs`;
  - lengte = 6 + 2 × aantal nummers, met een maximum, bv. 120 segmenten;
  - daarna gaat de lengte terug naar 6 met een feestelijk moment (de slang "vervelt").
- **Appel:**
  - op elke kick klopt de appel zacht (lokaal, geen flits);
  - eet de slang hem op, dan verschijnt er een nieuwe op een willekeurige plek.
- **Easter egg (90 s):** de slang beweegt een tijdje in een patroon dat een hartje of de letters "DIGGY" vormt.
- **Techniek:**
  - het pad volledig in een fragment-shader berekenen kan, maar is zwaar;
  - beter: het pad in JS (`js/visuals/snake-path.js`) en per frame de segmentposities als uniform-array (`vec2 uSnake[120]`) doorgeven;
  - dat vraagt een kleine uitbreiding van de engine: visuals mogen een `uniforms(frame)`-callback hebben.

**Vragen voor de review:**
- Is een `uniforms()`-callback per visual de nette manier, of beter een data-texture?
- Pad-logica in JS: deterministisch en testbaar (zelfde seed → zelfde pad)?
- id `nightdrive` behouden (opgeslagen keuzes, tests) of hernoemen naar `snake` met een migratie?

## 2. Warp — de flits weg
- Voorstel: de kick-gloed in het midden verwijderen (`pal(0.7) * exp(-r*8) * uKick * 0.9`), net als de sterhelderheid × uHit en de snare-gloed.
- Snelheid op de kick (`uKick * 1.8`) blijft, maar zachter: 0,8.
- Check: de temporele luminantie in `tests/browser.mjs` was 0,065. Doel: < 0,02.

## 3. Tunnel — minder fel, leukere animaties
- **Minder fel:**
  - `pal()` gebruiken in plaats van witte/lichte ringen;
  - feedback-decay iets sneller, zodat er minder licht opstapelt;
  - het licht van de ringen begrenzen.
- **Meer beweging:**
  - **lage tonen:** de ring wordt groter en de tunnel draait in;
  - **hoge tonen:** fijne kartels op de ring (`histSmooth` op hoge f per hoek);
  - **kick:** de vorm springt naar een andere veelhoek (3–8 hoeken, vloeiend in elkaar overlopend);
  - **snare:** een draaiing in de feedback.
- Geen flits, alleen vorm en beweging.

## 4. Pauzes zichtbaar maken (alle visuals)
**Mo:** "pauzes in een lied duidelijk maken."

- **Detectie** (in `js/listen.js` en `rhythm.js`):
  - een rustpunt = het niveau zakt onder ~25 % van het recente gemiddelde gedurende > 0,4 s, of het nummer staat op pauze;
  - nieuw veld `audio.rest` (0..1, zachte in- en uitloop van ~0,5 s), als uniform `uRest`.
- **Gedeelde reactie** in de final pass of per visual: bij een rustpunt vertraagt alles naar ~30 % en "ademt" het beeld (een trage puls in verzadiging, geen helderheidsflits).
- Per visual kan een eigen accent:
  - **Urchin:** de stekels trekken zich terug;
  - **Strings:** de lijnen worden bijna recht en gaan zacht trillen;
  - **Spectrum:** de balken zakken en de piekkapjes blijven hangen;
  - **Snake:** stopt en kijkt rond.
- Bij de terugkeer van de muziek (de "drop") loopt alles vloeiend weer op, zonder flits.

**Vraag:** de detectie moet werken voor microfoon, systeemgeluid en gesimuleerd ritme. Geen valse rustpunten bij zachte passages: is de drempel relatief tot het eigen gemiddelde voldoende?

## 5. Spectrum — frisser en vloeiender (Mo's favoriet: karakter behouden)
- De LED-balken blijven herkenbaar, maar:
  - **vloeiend:** de balkhoogtes uit `histSmooth` (Catmull-Rom) met sub-LED-interpolatie, zodat ze glijden in plaats van springen;
  - **frisse look:** glazen LED-segmenten met een zachte gradient per balk uit de hoeskleuren, een reflectie die meegolft, en lichte deeltjes die opstijgen uit hoge pieken;
  - **variatie in de tijd:** elke ~40 s wisselt de opstelling vloeiend. Voorbeelden: klassiek recht, gespiegeld vanuit het midden, gebogen als een boog, rond als een cirkel. Zo wordt het niet saai, en het blijft dezelfde visual;
  - de piekkapjes blijven, met zwaartekracht (al aanwezig).

## 6. Landscape — volledig vervangen door iets eigens: **"Dunes"** (werktitel)
**Mo:** te chaotisch. Een hoge kick neemt het hele scherm in. Liever achterstevoren, en uniek.

**Voorstel:**
- Zachte zandduinen of golvende heuvels van glowlijnen die **van ver naar dichtbij** komen. Dat is de omgekeerde richting van nu: het nieuwe geluid verschijnt aan de horizon en schuift rustig naar voren.
- De amplitude is begrensd (max ~15 % van de schermhoogte) en zacht verzadigd, zodat een kick het scherm nooit vult.
- Een maan of zon aan de horizon in hoeskleuren. Lichte deeltjes (sterren of zand) waaien over de toppen bij hoge tonen.
- **Thema:** past bij Bloop/Glorp (dezelfde manen) en bij Strings (dunne lijnen).

## 7. Halo — verwijderen
- Uit `js/visuals/index.js` en het bestand verwijderen.
- Tests: het aantal visuals gaat van 13 naar 12 (`tests/browser.mjs` controleert `ids.length === 13`).
- Een opgeslagen keuze "halo" valt vanzelf terug op de eerste visual.

## 8. Orbit — gevuld met songteksten, met de zin die nu gezongen wordt gemarkeerd
**Mo vraagt of dat kan. Technisch: ja, met kanttekeningen.**

- **Bron:**
  - Spotify's Web API geeft geen songteksten;
  - een open, gratis bron met tijdgecodeerde teksten (LRC) is **LRCLIB** (lrclib.net): zoeken op artiest, titel en duur, met regels plus tijdstempels.
- **Synchronisatie:**
  - de huidige regel volgt uit de afspeelpositie van Spotify (al aanwezig in `track.prog`);
  - met eigen muziek: de positie van de speler.
  - Met de microfoon of de app zonder Spotify-login is er geen positie, en dan dus geen tekst.
- **Weergave:**
  - de bol bestaat uit tekstringen: elke breedtecirkel is een regel uit het nummer, die rond de bol draait;
  - de zin die nu gezongen wordt staat vooraan, groot en helder in de hoeskleur;
  - vorige en volgende regels vervagen naar de achterkant;
  - beweging blijft op de muziek (de bol "ademt").
- **Techniek:**
  - tekst in een shader vraagt een tekst-texture: in JS met canvas renderen naar een atlas (1 regel per rij) en als `uLyrics`-texture doorgeven;
  - de shader legt die op de bolringen.
- **⚠ Kanttekeningen:**
  1. **Auteursrecht.** Songteksten zijn beschermd. DiggyViz is een publieke site. Teksten van een externe bron live tonen op het toestel van de gebruiker (niet opgeslagen in de repo) is wat veel lyric-apps doen, maar het blijft juridisch Mo's afweging. Commerciële lyric-apps hebben licenties (bv. Musixmatch). Mo moet dit bewust beslissen.
  2. **Privacy.** Artiest en titel gaan naar een derde partij (LRCLIB). Dat is vergelijkbaar met de Deezer-tempo-opzoeking, maar dan zonder sandbox-iframe: het verzoek kan rechtstreeks via `fetch` met CORS. Controleren of LRCLIB CORS toelaat, en geen Spotify-tokens meesturen.
  3. **Niet elk nummer heeft gesynchroniseerde tekst.** Dan valt Orbit terug op de huidige lijnen/golven.

**Vraag aan ChatGPT:** akkoord met LRCLIB als bron? Is een canvas-atlas als texture de beste weg voor tekst in WebGL2, ook voor de prestaties op de iPhone?

---

## Volgorde (na akkoord)
1. Halo weg, Warp-flits weg (klein).
2. Pauzes (gedeeld).
3. Tunnel.
4. Spectrum.
5. Dunes (Landscape-vervanger).
6. Snake.
7. Orbit met songteksten (na Mo's beslissing over de kanttekeningen).

Elke stap met stills, de browsertest en temporele luminantie. Pas live na Mo's akkoord.

## Lessen uit 2.8 (voor beide AI's)
- De Ruimtereis was technisch correct maar visueel te druk en te "clipart". Les: eerst één sterk idee uitwerken met veel aandacht voor vorm en compositie, en pas daarna details toevoegen. Mo ziet het verschil.
- Altijd met echte hoeskleuren testen (`/home/claude/qa/covers.py`). Met de demo-bron lijkt alles groen.
