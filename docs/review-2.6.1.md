# Review Spotify-verbinding en vertraging — 27 oktober 2026

Basis: Claude 2.5.1 / 2.6.0, commit 4470cf0. Zijn wijzigingen stonden al op main.

## Bevinding
Spotify-inloggen koppelt nummerinformatie, hoes en positie. De officiële Web Playback SDK kan muziek afspelen, maar heeft geen API voor ruwe audiosamples voor onze analyser. Een ingebouwde Spotify-player lost de echte audioanalyse dus niet op. De nieuw toegevoegde Computergeluid-optie gebruikt een ingestelde OS-loopback-ingang; dat kan herhaald tabblad delen vervangen. Toestemming en de audio-routing blijven afhankelijk van browser en toestel.

Bronnen: https://developer.spotify.com/documentation/web-playback-sdk/reference ; https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api ; https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia ; https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency

## Hersteld
- Automatisch starten kan bij een geblokkeerde AudioContext wachten op een tik zonder vast te lopen; stoppen blijft mogelijk.
- Wisselen tussen microfoon, tabblad en computergeluid cancelt de andere invoer en lopende aanvragen. Een late aanvraag overschrijft de nieuwe keuze niet.
- Annuleren tijdens de eerste toestemmingsvraag opent niet alsnog een tweede ingang en bewaart geen verouderde apparaatkeuze.
- Een opgeslagen “standaard”-alias wordt opnieuw opgelost, zodat een gewijzigde Windows-standaard niet ongemerkt de microfoon kiest.
- Veranderen van de gekozen ingang werkt ook tijdens een lopende aanvraag. Automatisch starten controleert of de gebruiker inmiddels een andere keuze maakte.
- Invoerlatentie gebruikt alleen de optionele apparaatmeting. De interne outputbuffer werd eerder onterecht als invoervertraging gepresenteerd.
- Inlog-, routing- en toestemmingsuitleg verduidelijkt; desktop-loopback niet aangeboden op iOS/iPadOS/Android.

- Extra rendererfout gevonden bij de volledige browsercontrole: een pas verschenen Landscape-bergkam kon bij hoge audio het beeld al afdekken terwijl zijn eigen licht nog naar nul vervaagde. Afdekking verschijnt nu samen met de kam; een test controleert luide nieuwe rijen op vaste tijden.

## Vertraging
De snellere envelope, analyser-smoothing 0.3 en live nieuwste history-rij van Claude zijn behouden. De envelope haalt in de test 90% binnen 25 ms; dat meet geen totale audio-naar-beeldvertraging. Windows-monitoring van een virtuele kabel, Bluetooth, FFT-vensters en het renderen voegen afzonderlijk vertraging toe. Een rechtstreekser verbindingsscherm bewijst geen snellere synchronisatie.

## Verificatie
71 Node-tests geslaagd, inclusief autoplay-wachtstand, late streams, ontbrekende apparaten en gewijzigde standaardingang. Browsercontrole toegevoegd voor echte Web Audio met gesimuleerde OS-apparaatverwerving: computer → microfoon → computer, plus annuleren tijdens overschakelen. CI-resultaat staat bij de review-PR; fysieke Windows-routing, Spotify-login, Bluetooth en iPhone-prestaties zijn niet hier getest.
