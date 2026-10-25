# DiggyViz

Hypnotiserende muziekvisuals die automatisch meebewegen met wat je op Spotify (of Last.fm) speelt.
Live op **https://myshine-be.github.io/diggyviz/**

- `index.html` + `js/` + `css/` – de webapp (werkt op iPhone, Android en computer)
- `ios/` – iPhone-app met zwevend venster (Picture-in-Picture), te bouwen op een Mac
- `AGENTS.md` – regels voor ChatGPT/Codex/Claude als ze aan dit project werken

## Visuals
| Naam | Wat |
|---|---|
| Urchin | Bol met honderden stekels die per frequentie uitschieten |
| Soul Beat | Eerbetoon aan de oude Pioneer-visuals: witte maanschijf met ferrofluid-blob |
| Warp | Sterrenveld met hyperspace-sprong bij elk nieuw nummer |
| Tunnel | Milkdrop-achtige feedbacktunnel |
| Spectrum | LED-spectrum op een spiegelvloer |
| Night Drive | Rit door een neonstad. Na 90 s kijken rijdt er een konvooi van vier auto's naast je, elk met een eigen visual (Strings, Bubbles, Halo, Orbit) en lichtsporen naar de horizon |
| Bloop | Bloop springt op de beat over neonplatforms. Na 90 s landt er een UFO, er komt een alien uit en die achtervolgt Bloop op de beat |
| Strings | Bundel gloeiende lijnen die rustig meegolven met de muziek (in de stijl van de PSP) |
| Bubbles | Zwerm zachte onderwaterbelletjes die in een draaiende ring zweven (in de stijl van de PSP) |
| Landscape | Berglandschap van spectrumlijnen dat op de maat naar achter rolt |
| Halo | Schuine ring van spectrumcirkels; elke halve beat groeit er een nieuwe uit het midden |
| Vanish | Bundel lijnen naar één verdwijnpunt; de pieken van elke beat reizen ernaartoe |
| Orbit | Draaiende bol van lijnen die op de beat rimpelt |

Swipe links/rechts om te wisselen, tik op het beeld om de knoppen te verbergen. Met *Auto* wisselt hij elke 45 s en bij elk nieuw nummer.

Goed om te weten: Spotify geeft geen geluid of beat-informatie door aan andere apps (de BPM-functies van de Spotify-API zijn dicht voor nieuwe apps). De visuals nemen de kleuren van de albumhoes over en bewegen op een ritme dat aan de positie in het nummer vastzit:

- **Tempo automatisch:** per nummer zoekt DiggyViz het tempo op bij Deezer (via de ISRC-code van Spotify, of artiest + titel bij Last.fm). De BPM-knop toont dan **AUTO**. Niet elk nummer staat erin; dan blijft het 120.
- **Timing:** tik **1×** op de BPM-knop precies op de beat, dan valt elke beat juist. **3× of meer** tikken zet ook het tempo zelf. Beide worden per nummer onthouden.
- **🎤 Luister:** de microfoon hoort de muziek in de kamer. Strings, Landscape, Halo, Vanish, Orbit en de auto's in Night Drive tekenen dan het **echte geluid** (golfvorm en spectrum), zoals een PSP, en lopen dus altijd mee. Tempo en timing voor Bloop en de andere visuals zet hij vanzelf (na ±10 seconden). Het geluid blijft op je toestel. Werkt het best met muziek uit een box of tv.

Er flitst of schudt niets op de beat: alleen de vormen bewegen mee.

---

## Verbinden: drie manieren

### Spotify (jij + max. 5 vrienden)
De Client ID zit ingebouwd, dus gewoon *Spotify* kiezen → inloggen.
Spotify laat apps in ontwikkelmodus maar 5 gebruikers toe. Jij hebt Spotify Premium nodig (mogelijk ook je vrienden). Een vriend toevoegen:
1. developer.spotify.com/dashboard → app **RetroViz** → *User Management*.
2. Vul naam + het e-mailadres van **hun Spotify-account** in → *Add user*.

### Last.fm (iedereen, geen limiet)
Eenmalig door Mo in te stellen:
1. Maak een gratis API-account op https://www.last.fm/api/account/create (naam: DiggyViz, callback mag leeg).
2. Zet de **API key** in `js/config.js` bij `LASTFM_API_KEY` en commit.

Gebruikers doen daarna:
1. Gratis account op last.fm → Instellingen → *Applications* → *Spotify Scrobbling* → Connect.
2. In DiggyViz: *Last.fm* kiezen en gebruikersnaam invullen.

Via Last.fm verschijnt een nieuw nummer een paar seconden later en is de voortgangsbalk een schatting.

### Demo
*Gewoon kijken*: speelt demo-nummers, geen account nodig.

## Op je iPhone als app
1. Open de site in **Safari** en verbind.
2. Deel → *Zet op beginscherm*.
3. Spotify-gebruikers: de app op je beginscherm heeft een eigen geheugen. Ga terug naar Safari → ⚙ → *App op beginscherm koppelen* → *Kopieer koppelcode*, en plak hem in de app op je beginscherm.

## Techniek (GitHub Pages)
De site wordt geserveerd vanaf de branch `main`, map `/ (root)` (Settings → Pages). Elke push naar `main` staat na ±1 minuut live.

---

## iPhone-app met zwevend venster (voor je vriend met de Mac)

Nodig: een Mac met de nieuwste Xcode (uit de App Store), een USB-kabel en een Apple ID.

1. Installeer XcodeGen in Terminal: `brew install xcodegen` (Homebrew nodig: brew.sh)
2. Ga naar de map `ios` en draai: `xcodegen`
3. Open `RetroViz.xcodeproj`.
4. Klik op het project → target RetroViz → *Signing & Capabilities*:
   - Team: kies de Apple ID (gratis account kan).
   - Bundle Identifier: maak hem uniek, bv. `be.mo.retroviz`.
5. Sluit de iPhone aan. Op de iPhone: Instellingen → Privacy en beveiliging → **Ontwikkelaarsmodus** aan (herstart).
6. Kies de iPhone bovenaan in Xcode en druk op ▶︎ (Run).
7. Eerste keer op de iPhone: Instellingen → Algemeen → VPN en apparaatbeheer → ontwikkelaar vertrouwen.

Met een gratis Apple ID werkt de app 7 dagen, daarna opnieuw op ▶︎ drukken vanaf de Mac. Met een betaald account (€99/jaar) is dat een jaar.

**Zonder XcodeGen:** maak in Xcode een nieuw project (iOS → App, SwiftUI, naam RetroViz), verwijder de standaard `ContentView.swift` en `RetroVizApp.swift`, sleep de 6 `.swift`-bestanden uit `ios/RetroViz` erin, en voeg bij *Signing & Capabilities* → *+ Capability* → **Background Modes** toe met **Audio, AirPlay, and Picture in Picture** aangevinkt.

**Eerlijke noot:** deze code is geschreven zonder Mac, dus nog nooit gecompileerd. Kleine compilefouten zijn mogelijk; Xcode wijst ze aan en ze zijn meestal snel op te lossen.

### De app gebruiken

1. Open RetroViz → ⚙ → vul dezelfde Client ID en Redirect URI in als in stap 2 → *Inloggen met Spotify*.
2. Kies een effect en tik op **Zwevend venster**.
3. Ga naar Spotify of je beginscherm: het venster blijft zweven en wisselt mee met elk nummer. Je kunt het verslepen, groter knijpen of tijdelijk tegen de rand wegschuiven.

De app speelt stilte af (gemengd met Spotify) om op de achtergrond te blijven draaien; dat kost wat batterij.
