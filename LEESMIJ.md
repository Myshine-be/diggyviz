# RetroViz

Retro visualizer (Winamp/Media Player-stijl) die automatisch het nummer oppikt dat je op Spotify speelt.

- `index.html` – webapp voor je beginscherm (gratis, geen Mac nodig)
- `ios/` – iPhone-app met zwevend venster (Picture-in-Picture), te bouwen op een Mac

Goed om te weten: Spotify geeft geen geluid door aan andere apps. De effecten nemen de kleuren van de albumhoes over en bewegen op een ritme dat aan de positie in het nummer vastzit. Tik 3 keer of meer op de BPM-knop mee op de beat, dan onthoudt hij het tempo voor dat nummer.

---

## Stap 1 – Webpagina online zetten (GitHub Pages)

Beide versies hebben deze pagina nodig, omdat Spotify alleen terugkeert naar een https-adres.

1. Maak op GitHub een nieuwe repository met de naam `diggyviz` (Public).
2. `index.html` staat al in de hoofdmap van die repo.
3. Settings → Pages → Source: *Deploy from a branch* → branch `main`, map `/ (root)` → Save.
4. Na een minuutje staat hij op `https://myshine-be.github.io/diggyviz/`

## Stap 2 – Spotify-app aanmaken

Je hebt Spotify Premium nodig (verplicht sinds februari 2026).

1. Ga naar developer.spotify.com/dashboard en log in.
2. *Create app*. Naam: RetroViz. Vink **Web API** aan.
3. Bij **Redirect URIs** zet je exact: `https://myshine-be.github.io/diggyviz/` (met de `/` op het einde).
4. Opslaan en de **Client ID** kopiëren.

## Stap 3 – Webapp op je iPhone

1. Open https://myshine-be.github.io/diggyviz/ in **Safari**.
2. Tik op ⚙, plak de Client ID, tik *Inloggen met Spotify*.
3. Tik in Safari op Deel → *Zet op beginscherm*.
4. De app op je beginscherm heeft een eigen geheugen. Ga daarom terug naar Safari, ⚙ → *Kopieer koppelcode*. Open de app op je beginscherm, ⚙ → plak de code → *Koppelcode gebruiken*.
5. Tik op het beeld voor volledig scherm.

---

## Stap 4 – iPhone-app met zwevend venster (voor je vriend met de Mac)

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
